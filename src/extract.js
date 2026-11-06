// Reads Etsy orders out of the Shop Manager DOM.
//
// Etsy's markup has no public contract and its class names change, so this works by
// landmarks rather than exact selectors:
//   - order numbers: 9–12 digit numbers next to "Order"/"#", or ?order_id= links
//   - addresses: Etsy's address formatter classes (.name, .first-line, .city, .zip …),
//     falling back to parsing the address block line by line
//   - items: "Quantity" label rows (Shop Manager order list), else links to /listing/<id>;
//     unit price is the order total split by quantity when no per-item price is shown
// Whatever it can't find is left blank for you to fill in on the order form.
(function () {
  const ORDER_NUM = /\b(\d{9,12})\b/;
  const PRICE_RE = /(CA\$|AU\$|A\$|US\$|\$|£|€|₹|AED|SAR)\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/;
  const CURRENCY_BY_SYMBOL = {
    'CA$': 'CAD', 'AU$': 'AUD', 'A$': 'AUD', 'US$': 'USD', '$': 'USD',
    '£': 'GBP', '€': 'EUR', '₹': 'INR', AED: 'AED', SAR: 'SAR',
  };

  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const textOf = (el) => clean(el ? el.innerText ?? el.textContent : '');
  // Etsy keeps collapsed sections (e.g. "Ship to") in the DOM but hidden, and innerText
  // is empty for hidden nodes — so read field values with textContent.
  const rawText = (el) => clean(el ? el.textContent : '');
  // Like clean(), but keeps line breaks (gift notes are often several lines).
  const multiline = (s) => (s || '').split('\n').map(clean).filter(Boolean).join('\n');
  const linesOf = (el) =>
    (el ? el.innerText ?? el.textContent : '')
      .split('\n')
      .map(clean)
      .filter(Boolean);

  const PANEL = '.peek-overlay';

  function isVisible(el) {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  // ---- Order numbers -------------------------------------------------------

  // Returns [{orderId, anchor}] where anchor is an element that carries the number.
  function findOrderAnchors(root) {
    const found = new Map();
    // Scanning the list? Ignore the details panel's copy of the order number.
    const skip = (el) => !root.closest(PANEL) && !!el.closest(PANEL);

    // Links count only if they show the number: while an order's panel is open, Etsy adds
    // ?order_id=<that order> to unrelated links (nav tabs etc.). And /orders/sold/<n> links
    // are tab/filter ids, not orders.
    for (const a of root.querySelectorAll('a[href*="order_id="]')) {
      const m = a.href.match(/order_id=(\d{9,12})/);
      if (m && !found.has(m[1]) && !skip(a) && isVisible(a) && a.textContent.includes(m[1])) found.set(m[1], a);
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const m = node.nodeValue.match(ORDER_NUM);
      if (!m || found.has(m[1])) continue;
      const el = node.parentElement;
      if (!el || !isVisible(el) || skip(el)) continue;
      // Require "order"/"receipt"/"#" nearby so prices, phone numbers etc. don't count.
      const context = textOf(el.parentElement?.parentElement || el.parentElement || el);
      const near = context.slice(Math.max(0, context.indexOf(m[1]) - 30), context.indexOf(m[1]));
      if (/order|receipt|#/i.test(near)) found.set(m[1], el);
    }

    return [...found].map(([orderId, anchor]) => ({ orderId, anchor }));
  }

  // ---- Address -------------------------------------------------------------

  const FIRST_LINE = '.first-line, [class*="first-line"]';
  const has = (el, sel) => el.matches(sel) || !!el.querySelector(sel);

  function findAddressEl(scope) {
    const marker = scope.querySelector(FIRST_LINE);
    if (!marker) return scope.querySelector('address');
    // Climb to the block that holds the whole formatted address (name … country),
    // without swallowing a neighbouring address.
    let el = marker;
    for (let i = 0; i < 6 && el !== scope && el.parentElement; i++) {
      const complete = has(el, '.name') && has(el, '.zip, .country-name, [class*="country"]');
      if (complete || el.parentElement.querySelectorAll(FIRST_LINE).length > 1) break;
      el = el.parentElement;
    }
    return el;
  }

  function pick(el, ...selectors) {
    for (const sel of selectors) {
      const hit = el.querySelector(sel);
      if (hit && rawText(hit)) return rawText(hit);
    }
    return '';
  }

  function splitName(full) {
    const parts = clean(full).split(' ');
    if (parts.length === 1) return { firstName: parts[0], lastName: '' };
    return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
  }

  function parseAddressByClass(el) {
    const name = pick(el, '.name', '[class*="name"]:not([class*="country"])');
    return {
      name,
      address1: pick(el, '.first-line', '[class*="first-line"]'),
      address2: pick(el, '.second-line', '[class*="second-line"]'),
      city: pick(el, '.city', '[class*="city"]'),
      state: pick(el, '.state', '[class*="state"]'),
      postcode: pick(el, '.zip', '[class*="zip"]', '[class*="postal"]'),
      countryName: pick(el, '.country-name', '[class*="country"]'),
      // Etsy prints the buyer's phone (when they gave one) as the last line of the address.
      phone: pick(el, '.phone', '[class*="phone"]'),
    };
  }

  // Fallback for a plain block like:
  //   Jane Doe / 12 High St / Flat 2 / San Jose, CA 95134 / United States
  function parseAddressByLines(lines) {
    const out = { name: '', address1: '', address2: '', city: '', state: '', postcode: '', countryName: '' };
    if (!lines.length) return out;
    lines = [...lines];
    if (window.SG_countryToIso(lines[lines.length - 1])) out.countryName = lines.pop();
    out.name = lines.shift() || '';
    const last = lines[lines.length - 1] || '';
    const us = last.match(/^(.+?),\s*([A-Za-z .]+?)\s+([A-Z0-9][A-Z0-9 -]{2,9})$/i); // City, ST 12345
    const postFirst = last.match(/^([0-9]{4,6})\s+(.+)$/); // 75001 Paris
    const postLast = last.match(/^(.+?)\s+([A-Z0-9]{2,4}\s?[A-Z0-9]{3})$/i); // London SW1A 1AA
    if (us) {
      [, out.city, out.state, out.postcode] = us;
      lines.pop();
    } else if (postFirst) {
      [, out.postcode, out.city] = postFirst;
      lines.pop();
    } else if (postLast) {
      [, out.city, out.postcode] = postLast;
      lines.pop();
    }
    out.address1 = lines.shift() || '';
    out.address2 = lines.join(', ');
    return out;
  }

  function parseAddress(scope) {
    const el = findAddressEl(scope);
    if (!el) return null;
    let addr = parseAddressByClass(el);
    if (!addr.address1) addr = parseAddressByLines(linesOf(el));
    return { ...addr, ...splitName(addr.name), countryCode: window.SG_countryToIso(addr.countryName) };
  }

  // ---- Contact ---------------------------------------------------------------

  function parseContact(scope) {
    const mail = scope.querySelector('a[href^="mailto:"]');
    const text = textOf(scope);
    const email = mail
      ? mail.getAttribute('href').slice(7).split('?')[0]
      : (text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [''])[0];
    const tel = scope.querySelector('a[href^="tel:"]');
    const phone = tel
      ? tel.getAttribute('href').slice(4)
      : clean((text.match(/\b(?:phone|tel)\b[^\d+]{0,12}(\+?[\d][\d\s().-]{6,18}\d)/i) || [, ''])[1]);
    return { email, phone };
  }

  // ---- Items -----------------------------------------------------------------

  function listingId(href) {
    const m = href.match(/\/listing\/(\d+)/);
    return m ? m[1] : null;
  }

  // Shop Manager order cards: each item is a block with a title (.break-word) and a
  // "Quantity" / <n> label pair, plus variation pairs like "Design" / "Dinosaur".
  // There's no per-item price; only the order total sits next to the order number.
  function parseQuantityRows(scope) {
    const labels = [...scope.querySelectorAll('span, div, dt, th')].filter(
      (e) => e.childElementCount === 0 && /^(quantity|qty)$/i.test(rawText(e)));
    const TITLE = 'div.break-word, [class*="item-title"], [class*="listing-title"]';
    // Not inside the variations list: a personalization note there is also .break-word.
    const findTitle = (el) => [...el.querySelectorAll(TITLE)].find((t) => !t.closest('li, dl'));
    return labels.map((label) => {
      // Widen to the nearest block with an item title, without taking in another item
      // (and without reaching the buyer's name, which is also .break-word).
      let row = label;
      while (row.parentElement && row !== scope && !findTitle(row)) {
        const parent = row.parentElement;
        if (labels.filter((l) => parent.contains(l)).length > 1) break;
        row = parent;
      }
      const qtyText = rawText(label.nextElementSibling) || rawText(label.parentElement).replace(/^(quantity|qty)\s*:?/i, '');
      const qty = (qtyText.match(/\d+/) || ['1'])[0];
      const title = findTitle(row);
      const sku = (rawText(row).match(/SKU\s*:?\s*([\w.-]+)/i) || [, ''])[1];
      const shared = (el) => labels.filter((l) => el.contains(l)).length > 1;
      return {
        name: rawText(title) || linesOf(row)[0] || '', sku, qty, price: '',
        image: itemImage(row, shared), variants: itemVariants(row),
      };
    }).filter((it) => it.name);
  }

  // The item's listing photo (sits beside the title block), as a 570px image for HSN lookup.
  // shared(el): true once el also holds another item — stop there so we don't borrow its photo.
  // (Etsy renders each photo twice — desktop and mobile copies — so count distinct photos.)
  const LISTING_IMG = 'img[src*="/il/"]';
  const bigImage = (src) => src.split('?')[0].replace(/il_\d+x\w+\./, 'il_570xN.');
  function itemImage(row, shared) {
    let el = row;
    for (let i = 0; i < 3 && el && !shared(el); i++, el = el.parentElement) {
      const photos = new Set([...el.querySelectorAll(LISTING_IMG)].map((img) => bigImage(img.src)));
      if (photos.size > 1) break;
      if (photos.size === 1) return [...photos][0];
    }
    return '';
  }

  // The label and value parts of a row like <li><div><span>Design</span><span>Dinosaur</span></div></li>:
  // the first level (from the top) where two or more children have text. Works even when the
  // value has markup inside (search results wrap matched words in <mark>).
  function labelValueCells(li) {
    let el = li;
    for (let i = 0; i < 6 && el; i++) {
      const withText = [...el.children].filter((c) => rawText(c));
      if (withText.length >= 2) return withText;
      el = withText[0];
    }
    return [];
  }

  // Variations chosen by the buyer, e.g. [{name: 'Design', value: 'Dinosaur'}]. Etsy lists
  // them beside Quantity as label/value pairs (<li><span>Design</span><span>Dinosaur</span>).
  const NOT_VARIANT = /^(quantity|qty|sku|price|item price|item total)$/i;
  function itemVariants(row) {
    const out = [];
    const seen = new Set();
    const add = (name, value) => {
      name = clean(name).replace(/:$/, '');
      value = multiline(value);
      if (!name || !value || NOT_VARIANT.test(name) || seen.has(name.toLowerCase())) return;
      seen.add(name.toLowerCase());
      out.push({ name, value });
    };
    for (const li of row.querySelectorAll('li')) {
      const cells = labelValueCells(li);
      if (cells.length >= 2) add(rawText(cells[0]), cells.slice(1).map((e) => e.textContent).join('\n'));
      else if (/^[^:]{1,40}:\s*\S/.test(rawText(li))) add(...rawText(li).split(/:\s*(.*)/s));
    }
    for (const dt of row.querySelectorAll('dt')) add(rawText(dt), rawText(dt.nextElementSibling));
    return out;
  }

  // Order total from the line that carries the order number ("#4220411712  $47.86").
  function orderTotal(anchor) {
    let el = anchor;
    for (let i = 0; i < 3 && el; i++, el = el.parentElement) {
      const m = rawText(el).match(PRICE_RE);
      if (m) return { symbol: m[1], amount: Number(m[2].replace(/,/g, '')) };
    }
    return null;
  }

  function parseItems(scope, anchor) {
    const rows = parseQuantityRows(scope);
    if (rows.length) {
      const total = anchor && orderTotal(anchor);
      let estimated = false;
      if (total) {
        // Spread the order total over the units as a starting declared value.
        const units = rows.reduce((n, it) => n + Number(it.qty || 1), 0);
        const each = (total.amount / units).toFixed(2);
        rows.forEach((it) => { it.price = each; });
        estimated = true;
      }
      return {
        items: rows,
        currency: total ? CURRENCY_BY_SYMBOL[total.symbol] || '' : '',
        total: total ? total.amount : null,
        priceEstimated: estimated,
      };
    }
    return parseListingLinks(scope);
  }

  function parseListingLinks(scope) {
    const byId = new Map();
    for (const a of scope.querySelectorAll('a[href*="/listing/"]')) {
      const id = listingId(a.href);
      if (!id) continue;
      const name = textOf(a) || a.getAttribute('title') || a.querySelector('img')?.alt || '';
      const entry = byId.get(id);
      if (!entry) byId.set(id, { id, anchor: a, name });
      else if (!entry.name && name) entry.name = name;
    }

    let currency = '';
    const items = [...byId.values()].map(({ id, anchor, name }) => {
      // Widen to the item's row: stop before the box would include another listing.
      let row = anchor;
      for (let i = 0; i < 8 && row.parentElement && row !== scope; i++) {
        const parent = row.parentElement;
        const ids = new Set([...parent.querySelectorAll('a[href*="/listing/"]')].map((x) => listingId(x.href)));
        if (ids.size > 1) break;
        row = parent;
      }
      const rowText = textOf(row);
      const qty = (rowText.match(/(?:quantity|qty)\s*:?\s*(\d+)/i) || rowText.match(/\b(\d+)\s*[x×]\s/) || [, '1'])[1];
      const price = rowText.match(PRICE_RE);
      if (price && !currency) currency = CURRENCY_BY_SYMBOL[price[1]] || '';
      const sku = (rowText.match(/SKU\s*:?\s*([\w.-]+)/i) || [, ''])[1];
      return {
        name: clean(name) || `Etsy listing ${id}`,
        sku,
        qty,
        price: price ? price[2].replace(/,/g, '') : '',
        image: itemImage(row, (el) => new Set([...el.querySelectorAll('a[href*="/listing/"]')].map((x) => listingId(x.href))).size > 1),
        variants: itemVariants(row),
      };
    });

    return { items, currency };
  }

  // ---- Scope -----------------------------------------------------------------

  // Smallest ancestor of `anchor` that holds a shipping address and no other order.
  function scopeFor(anchor, orderId, allIds, root) {
    let el = anchor;
    while (el && el !== root.parentElement) {
      const t = el.textContent || '';
      if (allIds.some((id) => id !== orderId && t.includes(id))) return null;
      if (findAddressEl(el)) return el;
      el = el.parentElement;
    }
    return null;
  }

  // ---- Order status -------------------------------------------------------------------
  // Shipped / completed orders carry one of Etsy's "Completed status" values as their status
  // heading (on the order card, and under "Order from …" in the details panel). New orders —
  // not yet marked complete — have none of these.
  const COMPLETED_STATUS = /^(pre-transit|in transit|delivered|no tracking|cancel+ed|completed|digital|shipped|refunded|returned)$/i;
  function isCompleted(scope) {
    if (!scope) return false;
    return [...scope.querySelectorAll('h1, h2, h3, h4, p, span, a, div')]
      // (Not the page's filter sidebar, whose radio labels use the same words.)
      .some((e) => e.childElementCount === 0 && !e.closest('label, form, fieldset') && COMPLETED_STATUS.test(rawText(e)));
  }

  // Shop Manager's order details open in a side panel (.peek-overlay) over the list. Other
  // dialogs (help widget, banners, menus) only count if they hold an order's address.
  function openPanel() {
    const peek = [...document.querySelectorAll(PANEL)].filter(isVisible);
    const dialogs = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], .wt-overlay__modal')]
      .filter((d) => isVisible(d) && !d.closest(PANEL) && d.querySelector(FIRST_LINE));
    const el = peek.pop() || dialogs.pop();
    if (!el) return null;
    const orderId =
      (location.href.match(/order_id=(\d{9,12})/) || [])[1] ||
      (rawText(el).match(/#(\d{9,12})\b/) || [])[1] ||
      '';
    return { el, orderId };
  }

  function parseOrder({ orderId, scope, anchor }) {
    const address = parseAddress(scope) || {};
    const items = parseItems(scope, anchor);
    const receipt = receiptFromPanel(orderId);
    // No order total on the list card (e.g. read from the panel alone): use the receipt's.
    if (receipt?.orderTotal && items.items?.length && !items.total) spreadPrice(items, receipt.orderTotal);
    const contact = parseContact(scope);
    return {
      orderId, scope, anchor, ...address, ...contact, ...items,
      phone: address.phone || contact.phone || '',
      shipping: shippingFromPanel(orderId),
      buyerNote: parseBuyerNote(scope) || buyerNoteFromPanel(orderId),
      privateNote: privateNoteFromPanel(orderId),
      receipt,
    };
  }

  // Unit price = order total ÷ number of units (2 units of a $151.98 order → $75.99 each).
  function spreadPrice(parsed, orderTotal) {
    const units = parsed.items.reduce((n, it) => n + Number(it.qty || 1), 0) || 1;
    const each = (orderTotal / units).toFixed(2);
    parsed.items.forEach((it) => { it.price = each; });
    parsed.total = orderTotal;
    parsed.priceEstimated = true;
  }

  // ---- Receipt (details panel): "Item total $79.00", "Shipping price $0.00", "Order total $87.30"
  function parseReceipt(root) {
    const amount = (label) => {
      const l = [...root.querySelectorAll('*')].find((e) => e.childElementCount === 0 && label.test(rawText(e)));
      for (let c = l, i = 0; c && i < 3; c = c.parentElement, i++) {
        const m = rawText(c).replace(rawText(l), '').match(PRICE_RE);
        if (m) return { text: m[0], value: Number(m[2].replace(/,/g, '')) };
      }
      return null;
    };
    const items = amount(/^item total$/i);
    const shipping = amount(/^shipping( price)?$/i);
    const total = amount(/^order total$/i);
    return items || total ? {
      orderTotal: total?.value ?? null,
      itemTotal: items?.value ?? null, itemTotalText: items?.text || '',
      shippingText: shipping?.text || '', orderTotalText: total?.text || '',
    } : null;
  }

  function receiptFromPanel(orderId) {
    const panel = openPanel();
    return panel && panel.orderId === orderId ? parseReceipt(panel.el) : null;
  }

  // The seller's own note on the order ("Only you can see this note"), if one was written.
  function privateNoteFromPanel(orderId) {
    const panel = openPanel();
    if (!panel || panel.orderId !== orderId) return '';
    const label = [...panel.el.querySelectorAll('*')].find((e) => e.childElementCount === 0 && /^only you can see this note$/i.test(rawText(e)));
    const box = label?.parentElement?.parentElement;
    if (!box) return '';
    const text = [...box.querySelectorAll('*')]
      .filter((e) => e.childElementCount === 0 && !e.closest('button') && e !== label)
      .map((e) => multiline(e.textContent))
      .filter((t) => t && !/^(add|edit) (a )?private note$/i.test(t))
      .join('\n');
    return text.slice(0, 1000);
  }

  // A note the buyer left with the order ("Note from buyer", "Gift message", …), if shown.
  const NOTE_LABEL = /^(note from (the )?buyer|message from (the )?buyer|buyer'?s? note|gift message|note to seller)$/i;
  function parseBuyerNote(root) {
    const label = [...root.querySelectorAll('*')].find((e) => e.childElementCount === 0 && NOTE_LABEL.test(rawText(e)));
    if (!label) return '';
    const value = multiline(label.nextElementSibling?.textContent) || multiline(label.parentElement.textContent.replace(label.textContent, ''));
    return value.slice(0, 1000);
  }

  function buyerNoteFromPanel(orderId) {
    const panel = openPanel();
    return panel && panel.orderId === orderId ? parseBuyerNote(panel.el) : '';
  }

  // ---- Shipping option the buyer chose ------------------------------------------------
  // Only the details panel shows it: "Selected by buyer" → "Standard Shipping" "$0.00", and
  // "Buyer expects delivery by: Nov 12-18". Returns {method, price, expected} or null.
  function parseShipping(root) {
    const leaf = (re) => [...root.querySelectorAll('*')].find((e) => e.childElementCount === 0 && re.test(rawText(e)));
    const heading = leaf(/^selected by buyer$/i);
    const expectedEl = leaf(/^buyer expects delivery by/i);
    const expected = expectedEl ? rawText(expectedEl).replace(/^buyer expects delivery by:?\s*/i, '') : '';
    let method = '';
    let price = '';
    const box = heading?.nextElementSibling;
    if (box) {
      const leaves = [...box.querySelectorAll('*')].filter((e) => e.childElementCount === 0 && rawText(e));
      const fullPrice = new RegExp(`^${PRICE_RE.source}$`);
      const i = leaves.findIndex((e, k) => leaves[k + 1] && fullPrice.test(rawText(leaves[k + 1])));
      if (i >= 0) {
        method = rawText(leaves[i]);
        price = rawText(leaves[i + 1]);
      } else if (leaves[0]) {
        method = rawText(leaves[0]);
      }
    }
    return method || expected ? { method, price, expected } : null;
  }

  function shippingFromPanel(orderId) {
    const panel = openPanel();
    return panel && panel.orderId === orderId ? parseShipping(panel.el) : null;
  }

  function closePanel() {
    const panel = document.querySelector(PANEL);
    const close = panel && [...(panel.parentElement || panel).querySelectorAll('button')]
      .find((b) => /^close$/i.test(rawText(b)) || /close/i.test(b.getAttribute('aria-label') || ''));
    close?.click();
  }

  // Every order card on the page: [{orderId, anchor, scope}], not yet parsed.
  function findOrders(root = document.body) {
    const anchors = findOrderAnchors(root);
    const allIds = anchors.map((a) => a.orderId);
    const found = [];
    for (const { orderId, anchor } of anchors) {
      const scope = scopeFor(anchor, orderId, allIds, root) || (anchors.length === 1 ? root : null);
      if (scope) found.push({ orderId, anchor, scope });
    }
    return found;
  }

  // One order by number. The list card is the richest source; if the list isn't on the
  // page (e.g. the details panel was opened from a link), read the panel instead.
  function orderById(orderId) {
    const card = findOrders().find((o) => o.orderId === orderId);
    if (card) return parseOrder(card);
    const panel = openPanel();
    if (panel && findAddressEl(panel.el)) return parseOrder({ orderId, scope: panel.el, anchor: null });
    return null;
  }

  // Every readable order (used when the form is opened from the toolbar icon).
  function extractOrders() {
    const orders = findOrders().map(parseOrder);
    if (orders.length) return orders;
    const panel = openPanel();
    return panel && findAddressEl(panel.el)
      ? [parseOrder({ orderId: panel.orderId, scope: panel.el, anchor: null })]
      : [];
  }

  window.SG_findOrders = findOrders;
  window.SG_orderById = orderById;
  window.SG_openPanel = openPanel;
  window.SG_isCompleted = isCompleted;
  window.SG_shippingFromPanel = shippingFromPanel;
  window.SG_buyerNoteFromPanel = buyerNoteFromPanel;
  window.SG_receiptFromPanel = receiptFromPanel;
  window.SG_privateNoteFromPanel = privateNoteFromPanel;
  window.SG_closePanel = closePanel;
  window.SG_extractOrders = extractOrders;
  window.SG_parseAddressByLines = parseAddressByLines;
})();
