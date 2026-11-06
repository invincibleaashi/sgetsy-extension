// Adds a "Send to ShipGlobal" button to every order in Etsy Shop Manager (an icon under the
// truck / message / ⋮ icons on each order card, and a button beside "Order actions" in the
// order details panel). Clicking it opens a popup that asks only for what Etsy doesn't
// provide — package, HSN, service, phone — next to a summary of what Etsy does.
(function () {
  // When the extension is reloaded or updated, Chrome cuts off the copy of this script that
  // was already running in the tab ("Extension context invalidated"), but its buttons stay
  // on the page. A fresh copy (re-injected by background.js) stops the old one and clears
  // what it added; the old copy, if still clicked, asks for a page refresh instead of erroring.
  window.__sgTeardown?.();
  document.querySelectorAll('#sg-etsy-host, [data-sg-send]').forEach((n) => n.remove());

  const alive = () => { try { return !!chrome.runtime?.id; } catch { return false; } };
  const STALE = 'The ShipGlobal extension was updated. Refresh this page to keep using it.';

  async function send(msg) {
    if (!alive()) return { ok: false, error: STALE, stale: true };
    try {
      return await chrome.runtime.sendMessage(msg);
    } catch (err) {
      return alive() ? { ok: false, error: err.message } : { ok: false, error: STALE, stale: true };
    }
  }

  const SERVICES = ['ShipGlobal Direct', 'ShipGlobal First Class', 'ShipGlobal Premium', 'UPS Promotional', 'UPS', 'Fedex'];
  const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'AED', 'SAR', 'INR'];
  const ORANGE = '#f1641e'; // Etsy orange: the one accent colour, used for actions.

  // Fields read from Etsy, editable from the summary card. [key, label, options];
  // keys are ShipGlobal /order/add field names.
  const FROM_ETSY = [
    ['Ship to', [
      ['customer_shipping_firstname', 'First name'],
      ['customer_shipping_lastname', 'Last name'],
      ['customer_shipping_address', 'Address line 1', { wide: true }],
      ['customer_shipping_address_2', 'Address line 2', { optional: true, wide: true }],
      ['customer_shipping_address_3', 'Address line 3', { optional: true, wide: true }],
      ['customer_shipping_company', 'Company', { optional: true, wide: true }],
      ['customer_shipping_city', 'City'],
      ['customer_shipping_state', 'State / region'],
      ['customer_shipping_postcode', 'Postcode'],
      ['customer_shipping_country_code', 'Country', { country: true }],
      ['customer_shipping_email', 'Email', { type: 'email', wide: true }],
    ]],
    ['Invoice', [
      ['order_reference', 'Etsy order'],
      ['invoice_no', 'Invoice no.'],
      ['invoice_date', 'Invoice date', { type: 'date' }],
      ['ioss_number', 'IOSS no.', { optional: true }],
      ['customer_nickname', 'Nickname', { optional: true, hint: 'Franchise only' }],
    ]],
  ];
  const ITEM_FIELDS = [
    'vendor_order_item_name', 'vendor_order_item_sku', 'vendor_order_item_quantity',
    'vendor_order_item_unit_price', 'vendor_order_item_hsn', 'vendor_order_item_tax_rate',
  ];
  const PACKAGE_FIELDS = ['package_length', 'package_breadth', 'package_height', 'package_weight'];

  // ---- "Send to ShipGlobal" buttons on the Etsy page ---------------------------

  const BTN_ATTR = 'data-sg-send';
  const LABEL = 'Send to ShipGlobal';
  // A plane (pointing up-right). fill: a colour, or the current text colour by default.
  // (Inside Etsy's icon button the text colour is set by the component, so pass ORANGE.)
  const PLANE_PATH = 'M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z';
  const planeSvg = (size = 24, fill = 'currentColor') =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="${fill}"><path transform="rotate(45 12 12)" d="${PLANE_PATH}"/></svg>`;

  function planeMark() {
    const mark = el('span', { class: 'mark' });
    mark.innerHTML = planeSvg(14);
    return mark;
  }

  function onActivate(node, getOrderId) {
    // Don't let Etsy's card handlers open/close the panel when the button is clicked.
    for (const type of ['pointerdown', 'mousedown']) node.addEventListener(type, (e) => e.stopPropagation());
    node.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openForm(getOrderId());
    });
  }

  // Plain Etsy icon button, used if Etsy's web components aren't available.
  function plainIconButton() {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wt-btn wt-btn--transparent wt-btn--icon';
    b.title = LABEL;
    b.setAttribute('aria-label', LABEL);
    b.innerHTML = planeSvg(24, ORANGE);
    return b;
  }

  // A fourth icon under the truck / message / ⋮ icons on an order card, built like
  // Etsy's own (<clg-tooltip><clg-icon-button>…) with an orange plane inside.
  let tipSeq = 0;
  function makeIconSlot(getOrderId) {
    const slot = document.createElement('div');
    slot.setAttribute('role', 'presentation');
    slot.className = 'wt-mb-xs-1';
    slot.setAttribute(BTN_ATTR, '');

    const tipId = `sg-tooltip-${++tipSeq}`;
    const tip = document.createElement('clg-tooltip');
    tip.id = tipId;
    tip.setAttribute('position', 'top');
    const btn = document.createElement('clg-icon-button');
    btn.setAttribute('slot', 'trigger');
    btn.setAttribute('aria-describedby', tipId);
    btn.setAttribute('aria-label', LABEL);
    btn.setAttribute('size', 'base');
    btn.setAttribute('background-type', 'dynamic');
    btn.setAttribute('variant', 'transparent');
    btn.innerHTML = planeSvg(24, ORANGE);
    const text = document.createElement('span');
    text.textContent = LABEL;
    tip.append(btn, text);
    slot.append(tip);
    onActivate(slot, getOrderId);

    // If Etsy's components didn't render (e.g. renamed), fall back to a plain icon button.
    setTimeout(() => {
      if (slot.isConnected && !btn.shadowRoot) slot.replaceChildren(plainIconButton());
    }, 1500);
    return slot;
  }

  // Etsy's pill button metrics (wt-btn), filled orange.
  function makeTextButton(getOrderId, extraClass) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `wt-btn ${extraClass}`;
    b.setAttribute(BTN_ATTR, '');
    b.textContent = LABEL;
    b.style.backgroundColor = ORANGE;
    b.style.color = '#fff';
    onActivate(b, getOrderId);
    return b;
  }

  // The order card's right-hand icon column, if it belongs to this order alone.
  function iconStack(anchor) {
    for (let el = anchor.parentElement; el && el !== document.body; el = el.parentElement) {
      const cols = el.querySelectorAll('.flag-img-right');
      if (cols.length > 1) return null;
      if (cols.length === 1) {
        const col = cols[0];
        return col.querySelector('[role="presentation"]')?.parentElement || col.firstElementChild || col;
      }
    }
    return null;
  }

  // One list button per order number; re-added only if Etsy re-renders it away.
  const listButtons = new Map();

  function injectButtons() {
    if (!alive()) return observer.disconnect(); // cut off by an extension reload
    // Order cards in the list: under the truck / message / ⋮ icons — new orders only.
    // A completed (shipped) order gets no button, and loses it if marked complete while open.
    for (const { orderId, anchor, scope } of window.SG_findOrders()) {
      const existing = listButtons.get(orderId);
      if (window.SG_isCompleted(scope)) {
        if (existing?.isConnected) existing.remove();
        continue;
      }
      if (existing?.isConnected) continue;
      const stack = iconStack(anchor);
      let btn;
      if (stack) {
        btn = makeIconSlot(() => orderId);
        stack.append(btn);
      } else {
        // No icon column (layout changed): a small button by the order number instead.
        btn = makeTextButton(() => orderId, 'wt-btn--small wt-ml-xs-2');
        const parent = anchor.parentElement;
        (parent && parent !== scope && scope.contains(parent) ? parent : anchor).after(btn);
      }
      listButtons.set(orderId, btn);
    }
    // Order details panel: next to "Order actions", same size. The panel is reused between
    // orders, so read the order number when clicked rather than now.
    const panel = window.SG_openPanel();
    const panelButton = panel?.el.querySelector(`[${BTN_ATTR}]`);
    if (panel && window.SG_isCompleted(panel.el)) {
      panelButton?.remove();
    } else if (panel && !panelButton) {
      const btn = makeTextButton(() => window.SG_openPanel()?.orderId || panel.orderId, 'wt-mr-xs-2');
      const actions = [...panel.el.querySelectorAll('button')].find((b) => /^order actions/i.test(b.textContent.trim()));
      const menu = actions?.closest('.wt-menu');
      if (menu) {
        menu.before(btn);
      } else {
        const heading = panel.el.querySelector('h1, h2, h3');
        heading ? heading.after(btn) : panel.el.prepend(btn);
      }
    }
  }

  // Shop Manager is a single-page app: re-check whenever the page changes.
  let injectTimer;
  const observer = new MutationObserver(() => {
    clearTimeout(injectTimer);
    injectTimer = setTimeout(injectButtons, 300);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  injectButtons();

  // ---- Popup shell ----------------------------------------------------------

  const host = document.createElement('div');
  host.id = 'sg-etsy-host';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${CSS()}</style><div class="backdrop" hidden></div>`;
  document.documentElement.appendChild(host);
  const backdrop = root.querySelector('.backdrop');
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) requestClose(); });
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (pop) {
      pop.trigger?.focus({ preventScroll: true });
      closePopover();
    } else {
      requestClose();
    }
  });

  // Clicking outside the popup or pressing Escape closes it — but once you've changed
  // something, only on the second try, so a stray click doesn't throw your edits away.
  let closeArmed = 0;
  function requestClose() {
    const form = backdrop.querySelector('form');
    if (!form || !form.sgDirty || Date.now() - closeArmed < 4000) return closeForm();
    closeArmed = Date.now();
    setStatus(form, 'You have unsaved changes — press Esc or click outside again to discard them.', 'err');
  }

  // Toolbar icon: open the popup for the order you last clicked on (or pick one).
  const onMessage = (msg) => {
    if (msg?.type === 'openForm') openForm();
  };
  chrome.runtime.onMessage.addListener(onMessage);
  let lastClicked = null;
  const onPointerDown = (e) => {
    if (!host.contains(e.target)) lastClicked = e.target;
  };
  document.addEventListener('pointerdown', onPointerDown, true);

  window.__sgTeardown = () => {
    observer.disconnect();
    clearTimeout(injectTimer);
    document.removeEventListener('pointerdown', onPointerDown, true);
    try { chrome.runtime.onMessage.removeListener(onMessage); } catch { /* already cut off */ }
    host.remove();
    document.querySelectorAll('[data-sg-send]').forEach((n) => n.remove());
    window.__sgTeardown = null;
  };

  // A small message dialog. action: optional [label, onClick] for a primary button.
  function showMessage(title, text, action) {
    backdrop.replaceChildren(el('div', { class: 'panel stale', role: 'alertdialog', 'aria-label': title },
      el('header', {},
        el('div', { class: 'title' },
          el('p', { class: 'eyebrow' }, planeMark(), 'ShipGlobal'),
          el('h2', {}, title),
          el('p', { class: 'meta' }, text)),
        el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: closeForm }, '×')),
      el('footer', {},
        el('div', { class: 'status' }),
        el('button', { type: 'button', class: action ? 'text-btn' : 'primary', onclick: closeForm }, action ? 'Not now' : 'OK'),
        action ? el('button', { type: 'button', class: 'primary', onclick: action[1] }, action[0]) : null)));
    backdrop.hidden = false;
  }

  // Shown when this copy of the script has been cut off by an extension reload.
  function showStale() {
    showMessage('Refresh to continue', STALE, ['Refresh page', () => location.reload()]);
  }

  let settings = {};
  let orders = [];

  let opening = false;
  async function openForm(orderId) {
    if (opening || !backdrop.hidden) return; // double-click, or already open
    opening = true;
    const res = await send({ type: 'getSettings' }).finally(() => { opening = false; });
    if (res.stale) return showStale();
    settings = res.ok ? res.result : {};
    let selected = 0;
    if (orderId) {
      orders = [window.SG_orderById(orderId) || { orderId }];
    } else {
      orders = window.SG_extractOrders().filter((o) => !window.SG_isCompleted(o.scope));
      if (!orders.length) return showMessage('No new orders here', 'Send to ShipGlobal works on new orders — ones not yet marked complete or shipped.');
      selected = Math.max(0, orders.findIndex((o) => lastClicked && o.scope?.contains(lastClicked)));
    }
    renderForm(selected);
    backdrop.hidden = false;
    loadShipping(orders[selected]);
  }

  // The buyer's shipping choice is only in Etsy's order details panel. If that isn't open
  // for this order, open it behind the popup, read it, and close it again.
  async function loadShipping(order) {
    const link = order?.anchor?.isConnected ? order.anchor.closest('a') : null;
    if (!order || order.shipping !== null || order.shippingLoading || !link) {
      if (order && order.shipping === undefined) order.shipping = null;
      return renderShippingEverywhere(order);
    }
    order.shippingLoading = true;
    renderShippingEverywhere(order);
    const before = window.SG_openPanel();
    link.click();
    // Wait for the panel to show this order (its shipping choice, or at least its receipt).
    let shipping = null;
    for (let t = 0; t < 30 && !shipping; t++) {
      await new Promise((r) => setTimeout(r, 150));
      shipping = window.SG_shippingFromPanel(order.orderId);
      if (!shipping && t > 6 && window.SG_receiptFromPanel(order.orderId)) break; // loaded, no shipping section
    }
    // Read everything the panel has before closing it again.
    order.shipping = shipping;
    order.buyerNote ||= window.SG_buyerNoteFromPanel(order.orderId);
    order.privateNote ||= window.SG_privateNoteFromPanel(order.orderId);
    order.receipt ||= window.SG_receiptFromPanel(order.orderId);
    if (!before) window.SG_closePanel();
    order.shippingLoading = false;
    order.shippingTried = true;
    renderShippingEverywhere(order);
  }

  function renderShippingEverywhere(order) {
    const form = backdrop.querySelector('form');
    if (form && form.sgOrder === order) form.sgRenderShipping?.();
  }

  function closeForm() {
    closePopover();
    backdrop.hidden = true;
    backdrop.replaceChildren();
  }

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat(Infinity)) {
      if (c === null || c === undefined || c === '' || c === false) continue;
      node.append(c instanceof Node ? c : String(c));
    }
    return node;
  }

  function input(key, opts = {}, value = '') {
    let control;
    if (opts.select) {
      control = el('select', { name: key });
      for (const o of opts.select) {
        const [v, label] = Array.isArray(o) ? o : [o, o];
        control.append(el('option', { value: v }, label));
      }
    } else if (opts.country) {
      // Every ISO country, listed by name.
      const codes = [...window.SG_COUNTRY_CODES];
      if (value && !codes.includes(value)) codes.unshift(value);
      const named = codes.map((c) => [c, window.SG_countryName(c)]).sort((a, b) => a[1].localeCompare(b[1]));
      control = el('select', { name: key }, el('option', { value: '' }, 'Choose a country'),
        named.map(([c, n]) => el('option', { value: c }, `${n} (${c})`)));
    } else {
      control = el('input', {
        name: key,
        type: opts.type || 'text',
        step: opts.step,
        min: opts.type === 'number' ? '0' : undefined,
        inputmode: opts.type === 'number' ? 'decimal' : undefined,
        list: opts.list,
        placeholder: opts.hint,
        'aria-label': opts.aria,
      });
    }
    control.value = value ?? '';
    if (!opts.optional) control.dataset.required = '1';
    return control;
  }

  // A labelled field. unit: a suffix shown inside the box (kg, cm, %, currency).
  function field(label, control, { unit, unitClass, optional, wide, note } = {}) {
    return el('label', { class: `field${wide ? ' wide' : ''}` },
      el('span', { class: 'label' }, label, optional ? el('span', { class: 'opt' }, 'Optional') : null),
      unit ? el('span', { class: 'unit' }, control, el('span', { class: unitClass }, unit)) : control,
      note ? el('span', { class: 'note' }, note) : null);
  }

  // A numbered step. aside: an optional control shown at the right of the heading.
  function section(index, title, aside, ...children) {
    return el('section', { class: 'step' },
      el('h3', {}, el('span', { class: 'idx' }, index), title, aside ? el('span', { class: 'h-aside' }, aside) : null),
      ...children);
  }

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const num = (v) => Number.parseFloat(v) || 0;
  const fmt = (n, digits = 2) => n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

  // Keys for what we remember between orders (see background.js addOrder). They use the
  // base product title, so every variant of a product shares its HSN and box.
  const itemKey = (name) => (name || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const packageKey = (entries) => entries.map(({ qty, key }) => `${qty}x${key}`).sort().join('|');

  // Personal messages (gift notes, personalization) aren't product details: they stay out
  // of the item name sent to ShipGlobal and are only shown in the popup.
  const isNote = (v) => /note|message|personali[sz]|engrav|custom text/i.test(v.name);
  const nameWithVariants = (title, variants = []) => {
    const chosen = variants.filter((v) => !isNote(v)).map((v) => v.value);
    return chosen.length ? `${title} — ${chosen.join(' / ')}` : title;
  };

  // Merge what Etsy gave us with remembered values and saved defaults.
  function initialValues(o) {
    const s = settings;
    const itemMemory = s.itemMemory || {};
    let remembered = false;
    const items = (o.items?.length ? o.items : [{ name: '', qty: '1', price: '' }]).map((it) => {
      const mem = itemMemory[itemKey(it.name)];
      if (mem) remembered = true;
      return {
        image: it.image || '',
        baseName: it.name,
        vendor_order_item_name: nameWithVariants(it.name, it.variants),
        vendor_order_item_sku: it.sku || '',
        vendor_order_item_quantity: it.qty || '1',
        vendor_order_item_unit_price: it.price || '',
        vendor_order_item_hsn: mem?.hsn || s.hsn || '',
        vendor_order_item_tax_rate: mem?.tax ?? s.taxRate ?? '0',
      };
    });
    const pkg = (s.packageMemory || {})[packageKey(items.map((it) => ({ qty: it.vendor_order_item_quantity, key: itemKey(it.baseName) })))];
    if (pkg) remembered = true;
    return {
      remembered,
      order_reference: o.orderId || '',
      invoice_no: o.orderId ? `${s.invoicePrefix ?? 'ETSY-'}${o.orderId}` : '',
      invoice_date: today(),
      service: s.service || 'ShipGlobal Direct',
      currency_code: o.currency && CURRENCIES.includes(o.currency) ? o.currency : s.currency || 'USD',
      csb5_status: s.csb5 ?? '0',
      package_weight: pkg?.weight || s.weight || '',
      package_length: pkg?.length || s.length || '',
      package_breadth: pkg?.breadth || s.breadth || '',
      package_height: pkg?.height || s.height || '',
      customer_shipping_firstname: o.firstName || '',
      customer_shipping_lastname: o.lastName || '',
      // The buyer's own number from Etsy (with its country calling code); yours only if none.
      customer_shipping_mobile: o.phone ? window.SG_formatPhone(o.phone, o.countryCode) : s.fallbackPhone || '',
      phoneSource: o.phone ? 'etsy' : s.fallbackPhone ? 'fallback' : '',
      customer_shipping_email: o.email || s.fallbackEmail || '',
      customer_shipping_company: '',
      customer_shipping_address: o.address1 || '',
      customer_shipping_address_2: o.address2 || '',
      customer_shipping_address_3: '',
      customer_shipping_city: o.city || '',
      customer_shipping_state: o.state || '',
      customer_shipping_postcode: o.postcode || '',
      customer_shipping_country_code: o.countryCode || '',
      ioss_number: s.ioss || '',
      customer_nickname: s.nickname || '',
      items,
    };
  }

  // ---- Popup ----------------------------------------------------------------

  function renderForm(selected = 0) {
    closePopover();
    const order = orders[selected] || {};
    const values = initialValues(order);
    const form = el('form', { class: 'panel', novalidate: true, onsubmit: (e) => { e.preventDefault(); submit(form); } });
    const v = (key) => form.querySelector(`[name="${key}"]`)?.value.trim() ?? '';

    // Header: what this is, and which order.
    const buyer = [values.customer_shipping_firstname, values.customer_shipping_lastname].join(' ').trim();
    const place = [values.customer_shipping_city, values.customer_shipping_state, values.customer_shipping_country_code].filter(Boolean).join(', ');
    const total = order.total ? `${values.currency_code} ${fmt(order.total)}` : '';
    // Status icons in the header: hover (or focus) for the detail, click where useful.
    const badges = el('div', { class: 'badges' });
    if (!settings.hasCredentials) {
      badges.append(badge('alert', 'err', 'ShipGlobal login missing — click to add it in settings.',
        () => send({ type: 'openOptions' })));
    }
    const prior = settings.createdOrders?.[order.orderId];
    if (prior) {
      const when = new Date(prior.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
      const sentBadge = badge('sent', 'warn',
        prior.tracking ? `Already sent on ${when} · ${prior.tracking}\nClick to copy the tracking number.` : `Already sent on ${when}.`,
        prior.tracking ? async () => {
          const copied = await navigator.clipboard.writeText(prior.tracking).then(() => true, () => false);
          sentBadge.querySelector('.tip').textContent = copied ? `Copied ${prior.tracking}` : `Tracking ${prior.tracking}`;
        } : null);
      badges.append(sentBadge);
    }
    if (values.remembered) {
      badges.append(badge('memory', 'info', 'Package and HSN pre-filled from your last order of the same item.'));
    }

    form.append(el('header', {},
      el('div', { class: 'title' },
        el('p', { class: 'eyebrow' }, planeMark(), 'ShipGlobal'),
        el('h2', {}, order.orderId ? `Order #${order.orderId}` : 'New shipment'),
        el('p', { class: 'meta' }, [buyer, place, total].filter(Boolean).join('  ·  '))),
      badges.children.length ? badges : null,
      orders.length > 1
        ? el('select', { class: 'picker', 'aria-label': 'Order', onchange: (e) => { renderForm(Number(e.target.value)); loadShipping(orders[Number(e.target.value)]); } },
            orders.map((o, i) => el('option', { value: i, selected: i === selected }, `#${o.orderId} — ${o.name || 'unknown buyer'}`)))
        : null,
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: closeForm }, '×')));

    // ---- Main column: what Etsy doesn't tell us
    const main = el('div', { class: 'main' });

    // 01 Package, with the volumetric / billed weight worked out as you type.
    const readout = el('p', { class: 'readout' });
    const dims = ['package_length', 'package_breadth', 'package_height'].map((k, i) =>
      input(k, { type: 'number', step: '0.1', aria: ['Length', 'Breadth', 'Height'][i] }, values[k]));
    main.append(section('01', 'Package', presetsButton(form),
      el('div', { class: 'package' },
        el('label', { class: 'field dims' },
          el('span', { class: 'label' }, 'Size  L × B × H'),
          el('span', { class: 'unit' }, el('span', { class: 'dim-row' }, dims[0], el('i', {}, '×'), dims[1], el('i', {}, '×'), dims[2]), el('span', {}, 'cm'))),
        field('Weight', input('package_weight', { type: 'number', step: '0.01' }, values.package_weight), { unit: 'kg' })),
      readout));

    // 02 Items & HSN
    const itemList = el('div', { class: 'items' });
    // Prices worked out from Etsy's totals stay marked as estimates until you type over them,
    // so a better figure arriving later (the receipt's item total) can replace them.
    const priceInput = (value) => {
      const control = input('vendor_order_item_unit_price', { type: 'number', step: '0.01' }, value);
      if (order.priceEstimated || !value) control.dataset.estimated = '1';
      control.addEventListener('input', (e) => { if (e.isTrusted) delete control.dataset.estimated; });
      return control;
    };
    const priceHint = el('p', { class: 'hint' });
    const renderPriceHint = () => {
      priceHint.textContent = order.priceEstimated && order.total
        ? `Unit price is the order total (${fmt(order.total)}) divided by the number of units.`
        : '';
      priceHint.hidden = !priceHint.textContent;
    };
    renderPriceHint();
    const addItem = (item, autoLookup = false) => {
      const group = el('div', { class: 'item' });
      group.dataset.image = item.image || '';
      group.dataset.base = item.baseName || '';
      // Listing photo (small size first; fall back to the full one if Etsy has no small crop).
      const thumb = item.image
        ? el('img', {
            class: 'thumb', alt: '', src: item.image.replace('il_570xN.', 'il_170x135.'),
            onerror: (e) => { if (e.target.src !== item.image) e.target.src = item.image; },
          })
        : el('div', { class: 'thumb empty' });
      const name = input('vendor_order_item_name', { aria: 'Item name', hint: 'Item name' }, item.vendor_order_item_name);
      name.classList.add('item-name');
      group.append(
        thumb,
        el('div', { class: 'item-body' },
          el('div', { class: 'item-top' },
            name,
            el('button', { type: 'button', class: 'icon-btn small', 'aria-label': 'Remove item', onclick: () => { group.remove(); update(); } }, '×')),
          el('div', { class: 'item-grid' },
            field('Qty', input('vendor_order_item_quantity', { type: 'number', step: '1' }, item.vendor_order_item_quantity)),
            field('Unit price', priceInput(item.vendor_order_item_unit_price), { unit: values.currency_code, unitClass: 'cur' }),
            field('Tax', input('vendor_order_item_tax_rate', { type: 'number', step: '0.01' }, item.vendor_order_item_tax_rate), { unit: '%' }),
            hsnField(group, item.vendor_order_item_hsn),
            field('SKU', input('vendor_order_item_sku', { optional: true }, item.vendor_order_item_sku), { optional: true }))));
      itemList.append(group);
      // Fill blank HSNs straight away (remembered/default HSNs are left alone). The photo
      // lookup needs no login; name-only lookup needs the dashboard session.
      if (autoLookup && !item.vendor_order_item_hsn && item.vendor_order_item_name && (item.image || settings.hasHsnSession)) {
        lookupHsn(group, { auto: true });
      }
    };
    values.items.forEach((it) => addItem(it, true));
    const blankItem = () => ({ vendor_order_item_quantity: '1', vendor_order_item_hsn: settings.hsn || '', vendor_order_item_tax_rate: settings.taxRate ?? '0' });
    // Prices are in this currency; Etsy's (or your default) is pre-selected.
    const currency = input('currency_code', { select: CURRENCIES }, values.currency_code);
    currency.classList.add('compact');
    currency.setAttribute('aria-label', 'Currency');
    main.append(section('02', 'Items & HSN',
      el('label', { class: 'inline-field' }, el('span', {}, 'Currency'), currency),
      priceHint,
      itemList,
      el('button', { type: 'button', class: 'text-btn', onclick: () => { addItem(blankItem()); update(); } }, '+ Add item')));

    // 03 Service — a select-style button; the choices (with live rates) open in a popover.
    // Below it, the shipping option the buyer chose on Etsy.
    const shipNote = el('p', { class: 'ship-note' });
    main.append(section('03', 'Service', null,
      el('div', { class: 'grid' },
        serviceField(form, values.service),
        field('Buyer phone', input('customer_shipping_mobile', { type: 'tel', hint: 'With country code, e.g. +1 …' }, values.customer_shipping_mobile), {
          note: values.phoneSource === 'etsy' ? 'From the Etsy order'
            : values.phoneSource === 'fallback' ? 'Your fallback number — the buyer didn’t give one'
              : 'The buyer didn’t give one on Etsy',
        }),
        field('Export type', input('csb5_status', { select: [['0', 'Normal'], ['1', 'CSB-5']] }, values.csb5_status))),
      shipNote));

    // ---- Side column: what Etsy already told us, as a quiet summary you can edit
    const aside = el('aside', { class: 'side' });
    const summary = el('div', { class: 'summary' });
    const editor = el('div', { class: 'editor', hidden: true });
    for (const [title, fields] of FROM_ETSY) {
      const grid = el('div', { class: 'grid tight' });
      for (const [key, label, opts = {}] of fields) grid.append(field(label, input(key, opts, values[key]), opts));
      editor.append(el('div', { class: 'editor-group' }, el('h4', {}, title), grid));
    }
    const toggle = el('button', { type: 'button', class: 'text-btn', onclick: () => setEditing(editor.hidden) }, 'Edit');
    const setEditing = (on) => {
      editor.hidden = !on;
      summary.hidden = on;
      toggle.textContent = on ? 'Done' : 'Edit';
      if (!on) renderSummary();
    };
    const renderSummary = () => {
      const line = (...parts) => parts.filter(Boolean).join(', ');
      summary.replaceChildren(
        el('dl', {},
          el('dt', {}, 'Ship to'),
          el('dd', {},
            el('strong', {}, [v('customer_shipping_firstname'), v('customer_shipping_lastname')].join(' ').trim() || '—'),
            el('br'), v('customer_shipping_address') || el('span', { class: 'missing' }, 'Address missing'),
            v('customer_shipping_address_2') ? [el('br'), v('customer_shipping_address_2')] : null,
            el('br'), line(v('customer_shipping_city'), [v('customer_shipping_state'), v('customer_shipping_postcode')].filter(Boolean).join(' ')),
            el('br'), v('customer_shipping_country_code')
              ? window.SG_countryName(v('customer_shipping_country_code'))
              : el('span', { class: 'missing' }, 'Country missing')),
          el('dt', {}, 'Email'),
          el('dd', {}, v('customer_shipping_email') || el('span', { class: 'missing' }, 'Missing')),
          el('dt', {}, 'Invoice'),
          el('dd', {}, v('invoice_no') || '—', el('br'), el('span', { class: 'muted' }, `${v('invoice_date')} · ${v('currency_code')}`))));
    };
    // Read-only order details from Etsy, visible even while editing the address above:
    // shipping chosen, item variations, gift notes / personalization, the buyer's note.
    const extras = el('dl', { class: 'extras' });
    const renderExtras = () => {
      const sh = order.shipping;
      const shipping = order.shippingLoading
        ? el('span', { class: 'muted pulse' }, 'Checking on Etsy…')
        : sh?.method || sh?.expected
          ? [el('strong', {}, sh.method || '—'), sh.price ? el('span', { class: 'muted' }, ` · ${sh.price}`) : null,
              sh.expected ? [el('br'), el('span', { class: 'muted' }, `Delivery by ${sh.expected}`)] : null]
          : order.shippingTried ? el('span', { class: 'muted' }, 'Couldn’t read it from Etsy') : null;

      const items = (order.items || []).filter((it) => it.variants?.some((x) => !isNote(x)));
      const notes = (order.items || []).flatMap((it) => (it.variants || []).filter(isNote).map((x) => ({ ...x, item: it.name })));
      const many = (order.items || []).length > 1;
      const short = (name) => (name.length > 34 ? `${name.slice(0, 33)}…` : name);

      extras.replaceChildren(...[
        shipping ? [el('dt', {}, 'Shipping'), el('dd', {}, shipping)] : null,
        items.length ? [el('dt', {}, 'Variations'), el('dd', {}, items.map((it) => el('div', { class: 'kv' },
          many ? el('span', { class: 'kv-item' }, short(it.name)) : null,
          it.variants.filter((x) => !isNote(x)).map((x) => el('span', { class: 'kv-row' }, el('span', { class: 'muted' }, x.name), el('span', {}, x.value))))))] : null,
        notes.length ? [el('dt', {}, 'Gift note & personalization'), el('dd', {}, notes.map((x) => el('blockquote', {},
          el('span', { class: 'muted' }, many ? `${x.name} · ${short(x.item)}` : x.name), el('br'), x.value)))] : null,
        order.buyerNote ? [el('dt', {}, 'Note from buyer'), el('dd', {}, el('blockquote', {}, order.buyerNote))] : null,
        order.privateNote ? [el('dt', {}, 'Your private note'), el('dd', {}, el('blockquote', {}, order.privateNote))] : null,
        order.receipt?.orderTotalText ? [el('dt', {}, 'Order total'), el('dd', {},
          el('strong', {}, order.receipt.orderTotalText),
          el('span', { class: 'muted' }, [
            order.receipt.itemTotalText && ` · items ${order.receipt.itemTotalText}`,
            order.receipt.shippingText && ` · shipping ${order.receipt.shippingText}`,
          ].filter(Boolean).join('')))] : null,
      ].flat(Infinity).filter(Boolean));
      extras.hidden = !extras.children.length;
    };
    aside.append(el('div', { class: 'card' },
      el('div', { class: 'card-head' }, el('h3', {}, 'From Etsy'), toggle),
      summary, editor, extras));

    const body = el('div', { class: 'body', onscroll: closePopover }, main, aside);
    form.append(body);

    // Footer: the two numbers that matter, and the action.
    const totals = el('div', { class: 'totals' });
    form.append(el('footer', {},
      totals,
      el('div', { class: 'status', role: 'status' }),
      el('button', { type: 'button', class: 'text-btn', onclick: closeForm }, 'Cancel'),
      el('button', { type: 'submit', class: 'primary' }, 'Create order')));

    backdrop.replaceChildren(form);
    renderSummary();

    // Buyer's shipping choice (may arrive a moment later; see loadShipping).
    form.sgOrder = order;
    form.sgRenderShipping = () => {
      // No order total on the list card, but the receipt (read after opening) has one:
      // fill the prices you haven't typed with order total ÷ units.
      const priceInputs = [...form.querySelectorAll('[name="vendor_order_item_unit_price"]')];
      if (!order.total && order.receipt?.orderTotal && priceInputs.length && priceInputs.every((i) => i.dataset.estimated)) {
        const groups = [...form.querySelectorAll('.item')];
        const units = groups.reduce((n, g) => n + (num(g.querySelector('[name="vendor_order_item_quantity"]').value) || 1), 0) || 1;
        const each = (order.receipt.orderTotal / units).toFixed(2);
        for (const i of priceInputs) i.value = each;
        order.total = order.receipt.orderTotal;
        order.priceEstimated = true;
        renderPriceHint();
        update();
      }
      renderExtras();
      // Under Service, only what affects the choice there: the buyer paid for speed.
      const method = order.shipping?.method || '';
      const fast = /express|priority|expedited|next[- ]day|overnight|upgrade|one[- ]day|two[- ]day/i.test(method);
      shipNote.replaceChildren(...(fast
        ? [el('span', { class: 'fast' }, `Buyer paid for ${method} — consider a faster service.`)]
        : []));
    };
    form.sgRenderShipping();

    // Live readouts.
    function update() {
      const [l, b, h, w] = PACKAGE_FIELDS.map((k) => num(v(k)));
      const vol = (l * b * h) / 5000;
      const billed = Math.max(vol, w);
      readout.replaceChildren(...[
        el('span', {}, 'Volumetric ', el('b', {}, `${fmt(vol)} kg`)),
        el('span', {}, 'Billed ', el('b', { class: vol > w ? 'warn' : '' }, `${fmt(billed)} kg`)),
        vol > w ? el('span', { class: 'muted' }, 'Billed by size — a smaller box would cost less.') : null,
      ].filter(Boolean));
      const declared = [...form.querySelectorAll('.item')].reduce((sum, g) =>
        sum + num(g.querySelector('[name="vendor_order_item_quantity"]').value) * num(g.querySelector('[name="vendor_order_item_unit_price"]').value), 0);
      totals.replaceChildren(
        el('span', {}, el('small', {}, 'Declared'), `${v('currency_code')} ${fmt(declared)}`),
        el('span', {}, el('small', {}, 'Billed'), `${fmt(billed)} kg`));
      for (const u of form.querySelectorAll('.cur')) u.textContent = v('currency_code');
      renderPresetTrigger(form);
      renderServiceTrigger(form);
      if (!summary.hidden) renderSummary();
    }
    // Phone: add the country calling code when the number or the country changes.
    const phoneInput = form.querySelector('[name="customer_shipping_mobile"]');
    const formatPhone = () => { phoneInput.value = window.SG_formatPhone(phoneInput.value, v('customer_shipping_country_code')); };
    phoneInput.addEventListener('change', formatPhone);
    form.querySelector('[name="customer_shipping_country_code"]').addEventListener('change', formatPhone);

    form.addEventListener('input', (e) => { if (e.isTrusted) form.sgDirty = true; update(); });
    form.addEventListener('change', (e) => { if (e.isTrusted) form.sgDirty = true; update(); });
    update();

    // Open the Etsy editor if something there is missing, and focus the first gap.
    const empty = [...form.querySelectorAll('[data-required]')].filter((c) => !c.value.trim());
    if (empty.some((c) => editor.contains(c))) setEditing(true);
    (empty[0] || form.querySelector('[name="package_length"]'))?.focus();
  }

  // ---- Popover (HSN suggestions, service picker) ----------------------------------

  let pop = null;

  function closePopover() {
    if (!pop) return;
    pop.node.remove();
    pop.trigger?.setAttribute('aria-expanded', 'false');
    pop = null;
  }

  // Opens a small panel under `anchor`. render() returns its children and is called again
  // via pop.refresh() when async data arrives.
  function openPopover({ anchor, trigger, width = 360, render }) {
    closePopover();
    const node = el('div', { class: 'popover', role: 'dialog' });
    node.addEventListener('keydown', (e) => {
      const opts = [...node.querySelectorAll('.choice')];
      const i = opts.indexOf(root.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const next = opts[(i + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length];
        next?.focus({ preventScroll: true });
      }
    });
    backdrop.append(node);
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const w = Math.min(Math.max(width, r.width), innerWidth - 32);
      node.style.width = `${w}px`;
      node.style.left = `${Math.max(16, Math.min(r.left, innerWidth - w - 16))}px`;
      node.style.top = `${r.bottom + 6}px`;
      const h = node.offsetHeight;
      if (r.bottom + 6 + h > innerHeight - 16) node.style.top = `${Math.max(16, r.top - h - 6)}px`;
    };
    pop = {
      node, anchor, trigger,
      refresh() {
        node.replaceChildren(...render().filter(Boolean));
        place();
      },
    };
    trigger?.setAttribute('aria-expanded', 'true');
    pop.refresh();
    (node.querySelector('.choice.on') || node.querySelector('.choice'))?.focus({ preventScroll: true });
    return pop;
  }

  // Close on a click outside the popover (or its trigger).
  root.addEventListener('pointerdown', (e) => {
    if (pop && !pop.node.contains(e.target) && !pop.trigger?.contains(e.target)) closePopover();
  }, true);

  function option({ selected, onPick, main, sub, meta }) {
    return el('button', {
      type: 'button', class: `choice${selected ? ' on' : ''}`, role: 'option', 'aria-selected': selected ? 'true' : 'false',
      onclick: onPick,
    },
    el('span', { class: 'choice-text' }, el('span', { class: 'choice-main' }, main), sub ? el('span', { class: 'choice-sub' }, sub) : null),
    meta ? el('span', { class: 'choice-meta' }, meta) : null,
    el('span', { class: 'choice-check', 'aria-hidden': 'true' }));
  }

  const SPARKLE_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"/><path d="M20 3v4M22 5h-4"/></svg>';

  // ---- Package presets (set in the extension settings) -------------------------------

  const PKG_FIELDS = { length: 'package_length', breadth: 'package_breadth', height: 'package_height', weight: 'package_weight' };

  function presetsButton(form) {
    const label = el('span', {}, 'Presets');
    const trigger = el('button', {
      type: 'button', class: 'preset-trigger', 'aria-haspopup': 'listbox', 'aria-expanded': 'false',
      onclick: () => (pop?.trigger === trigger ? closePopover() : openPresetPopover(form, trigger)),
    }, label);
    form.sgPresets = { trigger, label };
    return trigger;
  }

  const currentPackage = (form) => Object.fromEntries(Object.entries(PKG_FIELDS)
    .map(([k, name]) => [k, form.querySelector(`[name="${name}"]`).value.trim()]));

  // The preset whose numbers equal what's in the form right now, if any.
  function matchingPreset(form) {
    const c = currentPackage(form);
    return (settings.packagePresets || []).find((p) => Object.keys(PKG_FIELDS).every((k) => num(p[k]) === num(c[k]) && c[k] !== ''));
  }

  function renderPresetTrigger(form) {
    const match = matchingPreset(form);
    form.sgPresets.label.textContent = match ? match.name : 'Presets';
    form.sgPresets.trigger.classList.toggle('on', !!match);
  }

  function applyPreset(form, preset) {
    for (const [k, name] of Object.entries(PKG_FIELDS)) {
      const control = form.querySelector(`[name="${name}"]`);
      control.value = preset[k] ?? '';
      control.classList.remove('bad');
    }
    form.dispatchEvent(new Event('input'));
  }

  function openPresetPopover(form, trigger) {
    let saving = false;
    const done = () => { closePopover(); trigger.focus({ preventScroll: true }); };
    openPopover({
      anchor: trigger, trigger, width: 340,
      render: () => {
        const presets = settings.packagePresets || [];
        const match = matchingPreset(form);
        const head = el('div', { class: 'pop-head' }, el('strong', {}, 'Package presets'),
          el('a', { href: '#', onclick: (e) => { e.preventDefault(); send({ type: 'openOptions' }); } }, 'Manage'));
        const list = presets.length
          ? el('div', { class: 'opts', role: 'listbox', 'aria-label': 'Package presets' }, presets.map((p) => option({
              selected: match === p,
              main: p.name,
              sub: `${p.length || '–'} × ${p.breadth || '–'} × ${p.height || '–'} cm`,
              meta: p.weight ? `${p.weight} kg` : '',
              onPick: () => { applyPreset(form, p); done(); },
            })))
          : el('p', { class: 'pop-msg' }, 'No presets yet. Save the size below, or add some in settings.');

        let foot;
        if (saving) {
          const nameInput = el('input', { type: 'text', placeholder: 'Name, e.g. Small box', 'aria-label': 'Preset name' });
          const save = async () => {
            const name = nameInput.value.trim();
            if (!name) return nameInput.focus();
            const res = await send({ type: 'savePreset', preset: { name, ...currentPackage(form) } });
            if (!res.ok) {
              nameInput.setCustomValidity(res.error || 'Couldn’t save');
              nameInput.reportValidity();
              return;
            }
            settings.packagePresets = res.result;
            saving = false;
            renderPresetTrigger(form);
            pop?.refresh();
          };
          nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
          nameInput.addEventListener('input', () => nameInput.setCustomValidity(''));
          foot = el('div', { class: 'pop-foot save-row' }, nameInput, el('button', { type: 'button', class: 'small-btn', onclick: save }, 'Save'));
          setTimeout(() => nameInput.focus({ preventScroll: true }));
        } else {
          const complete = Object.values(currentPackage(form)).every(Boolean);
          foot = el('div', { class: 'pop-foot' },
            el('button', {
              type: 'button', class: 'text-btn', disabled: !complete || !!match,
              onclick: () => { saving = true; pop.refresh(); },
            }, match ? 'This size is saved' : 'Save current size as preset'));
        }
        return [head, list, foot];
      },
    });
  }

  // ---- Header status icons ----------------------------------------------------------

  const BADGE_ICONS = {
    alert: '<path d="M12 8v5M12 16.5v.01"/><circle cx="12" cy="12" r="9"/>',
    sent: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.8"/>',
    memory: '<path d="M3 12a9 9 0 1 0 2.64-6.36L3 8.3"/><path d="M3 3.5v4.8h4.8"/><path d="M12 7.5V12l3 2"/>',
  };

  // A small round icon with a tooltip. kind: err | warn | info (colour). onClick optional.
  function badge(icon, kind, text, onClick) {
    const b = el('button', {
      type: 'button', class: `badge ${kind}${onClick ? ' clickable' : ''}`, 'aria-label': text.replace(/\n/g, ' '),
      onclick: onClick || null,
    });
    b.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${BADGE_ICONS[icon]}</svg>`;
    b.append(el('span', { class: 'tip', role: 'tooltip' }, text));
    return b;
  }

  // ---- HSN: field + suggestions popover ------------------------------------------

  function hsnField(group, value) {
    const control = input('vendor_order_item_hsn', { hint: '8 digits' }, value);
    const icon = el('button', {
      type: 'button', class: 'label-icon', 'aria-haspopup': 'dialog', 'aria-expanded': 'false',
      'aria-label': 'HSN suggestions from ShipGlobal', title: 'HSN suggestions from ShipGlobal',
      onclick: () => (pop?.trigger === icon ? closePopover() : openHsnPopover(group, icon, control)),
    });
    icon.innerHTML = SPARKLE_SVG;
    group.hsn = { state: 'idle', icon };
    return el('div', { class: 'field span-2' },
      el('span', { class: 'label' }, el('span', { class: 'label-main' }, 'HSN code', icon)),
      control);
  }

  // Ask ShipGlobal for HSN codes — from the Etsy listing photo if there is one, otherwise
  // by item name. auto: fill the top suggestion if the box is still empty when it arrives.
  async function lookupHsn(group, { auto = false, prefer } = {}) {
    const h = group.hsn;
    const name = group.querySelector('[name="vendor_order_item_name"]').value.trim();
    const image = group.dataset.image;
    const hsnInput = group.querySelector('[name="vendor_order_item_hsn"]');
    if (!name && !image) {
      Object.assign(h, { state: 'error', error: 'Enter the item name first.', needsSignIn: false });
      return refreshIfOpen(group);
    }
    const req = (h.req || 0) + 1;
    h.prefer = prefer;
    Object.assign(h, { state: 'loading', fromPhoto: prefer === 'photo' || !name, req });
    refreshIfOpen(group);
    const res = await send({ type: 'classifyHsn', name, image, prefer });
    if (h.req !== req) return; // a newer lookup for this item has started since
    if (!res.ok) {
      Object.assign(h, { state: 'error', error: res.error, needsSignIn: !!res.data?.needsSignIn });
      return refreshIfOpen(group);
    }
    // Merge duplicates (the API can repeat a code), best confidence first.
    const byCode = new Map();
    for (const o of [res.result.primary, ...(res.result.suggestions || [])]) {
      if (!o?.indian_hsn_code) continue;
      const prev = byCode.get(o.indian_hsn_code);
      if (!prev || (o.confidence ?? 0) > (prev.confidence ?? 0)) byCode.set(o.indian_hsn_code, o);
    }
    const options = [...byCode.values()].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
    Object.assign(h, { state: options.length ? 'done' : 'error', options, source: res.result.source, error: options.length ? '' : 'No suggestion for this item.' });
    if (auto && options.length && !hsnInput.value.trim()) {
      hsnInput.value = options[0].indian_hsn_code;
      hsnInput.classList.remove('bad');
    }
    h.icon.classList.toggle('ready', options.length > 0);
    refreshIfOpen(group);
  }

  function refreshIfOpen(group) {
    if (pop && pop.trigger === group.hsn.icon) pop.refresh();
  }

  function openHsnPopover(group, icon, control) {
    const h = group.hsn;
    if (h.state === 'idle') lookupHsn(group);
    const hasPhoto = !!group.dataset.image;
    openPopover({
      anchor: control, trigger: icon, width: 400,
      render: () => {
        const head = el('div', { class: 'pop-head' },
          el('strong', {}, 'HSN suggestions'),
          el('span', { class: 'muted' }, h.state === 'done' ? (h.source === 'photo' ? 'From the product photo' : 'From the item name') : 'ShipGlobal'));
        if (h.state === 'loading' || h.state === 'idle') {
          return [head, el('p', { class: 'pop-msg pulse' }, h.fromPhoto ? 'Reading the product photo…' : 'Looking up the item name…')];
        }
        const switcher = hasPhoto && h.source === 'photo'
          ? el('button', { type: 'button', class: 'text-btn', onclick: () => lookupHsn(group, { prefer: 'name' }) }, 'Search by item name instead')
          : hasPhoto && h.source === 'name'
            ? el('button', { type: 'button', class: 'text-btn', onclick: () => lookupHsn(group, { prefer: 'photo' }) }, 'Use the product photo instead')
            : null;
        if (h.state === 'error') {
          return [head,
            el('p', { class: `pop-msg ${h.needsSignIn ? '' : 'err'}` }, h.error,
              h.needsSignIn ? [' ', el('a', { href: '#', onclick: (e) => { e.preventDefault(); send({ type: 'openDashboard' }); } }, 'Open ShipGlobal'), ', sign in, then try again.'] : null),
            el('div', { class: 'pop-foot' }, el('button', { type: 'button', class: 'text-btn', onclick: () => lookupHsn(group, { prefer: h.prefer }) }, 'Try again'), switcher)];
        }
        const current = control.value.trim();
        return [head,
          el('div', { class: 'opts', role: 'listbox', 'aria-label': 'HSN codes' },
            h.options.map((o) => option({
              selected: current === o.indian_hsn_code,
              main: o.indian_hsn_code,
              sub: o.simple_hsn_text || o.description,
              meta: typeof o.confidence === 'number' ? `${Math.round(o.confidence * 100)}%` : '',
              onPick: () => {
                control.value = o.indian_hsn_code;
                control.classList.remove('bad');
                control.dispatchEvent(new Event('input', { bubbles: true }));
                closePopover();
              },
            }))),
          switcher ? el('div', { class: 'pop-foot' }, switcher) : null];
      },
    });
  }

  // ---- Service: select-style button + rates popover --------------------------------

  function serviceField(form, value) {
    const hidden = el('input', { type: 'hidden', name: 'service' });
    hidden.value = value || '';
    hidden.dataset.required = '1';
    const main = el('span', { class: 'st-main' });
    const meta = el('span', { class: 'st-meta' });
    const trigger = el('button', {
      type: 'button', class: 'select-trigger', 'aria-haspopup': 'listbox', 'aria-expanded': 'false',
      onclick: () => (pop?.trigger === trigger ? closePopover() : openServicePopover(form, trigger)),
    }, main, meta, hidden);
    form.sgService = { trigger, hidden, main, meta, rates: null };
    renderServiceTrigger(form);
    return el('div', { class: 'field wide' }, el('span', { class: 'label' }, 'Service'), trigger);
  }

  const rateKey = (form) => ['package_weight', 'customer_shipping_country_code', 'customer_shipping_postcode']
    .map((k) => form.querySelector(`[name="${k}"]`)?.value.trim() || '').join('|');

  function rateFor(form, title) {
    const r = form.sgService.rates;
    if (!r || r.state !== 'done' || r.key !== rateKey(form)) return null;
    return r.services.find((s) => s.title.toLowerCase() === (title || '').toLowerCase()) || null;
  }

  function renderServiceTrigger(form) {
    const { hidden, main, meta } = form.sgService;
    main.textContent = hidden.value || 'Choose a service';
    main.classList.toggle('placeholder', !hidden.value);
    const rate = rateFor(form, hidden.value);
    meta.textContent = rate ? `${rate.transit_time} · ${form.sgService.rates.currency} ${fmt(Number(rate.subtotal_fee), 0)}` : '';
  }

  async function fetchRates(form) {
    const s = form.sgService;
    const key = rateKey(form);
    const [weight, country, postcode] = key.split('|');
    if (!weight || !country || !postcode) {
      s.rates = { key, state: 'needs-input' };
      return;
    }
    s.rates = { key, state: 'loading' };
    if (pop?.trigger === s.trigger) pop.refresh();
    const res = await send({ type: 'rates', weight, country, postcode });
    if (s.rates.key !== key) return; // inputs changed meanwhile
    s.rates = res.ok
      ? { key, state: 'done', services: res.result.services || [], currency: res.result.currency || '' }
      : { key, state: 'error', error: res.error };
    renderServiceTrigger(form);
    if (pop?.trigger === s.trigger) pop.refresh();
  }

  function openServicePopover(form, trigger) {
    const s = form.sgService;
    if (!s.rates || s.rates.key !== rateKey(form) || s.rates.state === 'error') fetchRates(form);
    const pick = (title) => {
      s.hidden.value = title;
      trigger.classList.remove('bad');
      renderServiceTrigger(form);
      closePopover();
      trigger.focus({ preventScroll: true });
    };
    openPopover({
      anchor: trigger, trigger, width: 420,
      render: () => {
        const r = s.rates || {};
        const head = el('div', { class: 'pop-head' }, el('strong', {}, 'Service'),
          el('span', { class: 'muted' }, r.state === 'done' ? `Rates for ${fmt(num(r.key.split('|')[0]))} kg` : 'ShipGlobal'));
        if (r.state === 'loading') return [head, el('p', { class: 'pop-msg pulse' }, 'Fetching rates…')];
        const note = r.state === 'needs-input'
          ? el('p', { class: 'pop-msg' }, 'Add the weight, country and postcode to see prices.')
          : r.state === 'error' ? el('p', { class: 'pop-msg err' }, r.error) : null;
        const list = r.state === 'done' && r.services.length
          ? r.services.map((x) => option({
              selected: s.hidden.value.toLowerCase() === x.title.toLowerCase(),
              main: x.title,
              sub: [x.transit_time, x.notes].filter(Boolean).join(' · '),
              meta: `${r.currency} ${fmt(Number(x.subtotal_fee), 0)}`,
              onPick: () => pick(x.title),
            }))
          : SERVICES.map((t) => option({ selected: s.hidden.value.toLowerCase() === t.toLowerCase(), main: t, onPick: () => pick(t) }));
        return [head, note, el('div', { class: 'opts', role: 'listbox', 'aria-label': 'Services' }, list)];
      },
    });
  }

  // ---- Collect, validate, submit --------------------------------------------------

  function collect(form) {
    const get = (scope, key) => scope.querySelector(`[name="${key}"]`)?.value.trim() ?? '';
    const order = {};
    const keys = ['service', 'csb5_status', 'currency_code', 'customer_shipping_mobile', ...PACKAGE_FIELDS,
      ...FROM_ETSY.flatMap(([, fields]) => fields.map(([key]) => key))];
    for (const key of keys) order[key] = get(form, key);
    order.csb5_status = Number(order.csb5_status);
    order.customer_shipping_mobile = window.SG_formatPhone(order.customer_shipping_mobile, order.customer_shipping_country_code);
    order.vendor_order_items = [...form.querySelectorAll('.item')].map((group) =>
      Object.fromEntries(ITEM_FIELDS.map((key) => [key, get(group, key)])));
    return order;
  }

  // Beyond "not empty": the values ShipGlobal would reject.
  const RULES = {
    package_length: (x) => num(x) > 0,
    package_breadth: (x) => num(x) > 0,
    package_height: (x) => num(x) > 0,
    package_weight: (x) => num(x) > 0,
    vendor_order_item_quantity: (x) => /^\d+$/.test(x) && Number(x) >= 1,
    vendor_order_item_unit_price: (x) => num(x) > 0,
    vendor_order_item_hsn: (x) => /^\d{4,8}$/.test(x),
    vendor_order_item_tax_rate: (x) => x === '' || (num(x) >= 0 && num(x) <= 100),
    customer_shipping_email: (x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x),
  };

  function validate(form) {
    let firstBad = null;
    let wrongValue = false;
    for (const c of form.querySelectorAll('input[name], select[name]')) {
      const value = c.value.trim();
      const missing = !!c.dataset.required && !value;
      const invalid = !missing && value !== '' && !!RULES[c.name] && !RULES[c.name](value);
      const bad = missing || invalid; // a real boolean: toggle(…, undefined) would flip the class
      c.classList.toggle('bad', bad);
      if (invalid) wrongValue = true;
      if (bad && !firstBad) firstBad = c;
    }
    if (!form.querySelector('.item')) return 'Add at least one item.';
    if (firstBad) {
      const editor = firstBad.closest('.editor');
      if (editor?.hidden) editor.parentElement.querySelector('.card-head .text-btn').click();
      // A hidden input (the service) is focused through its button.
      (firstBad.type === 'hidden' ? firstBad.closest('button') : firstBad)?.focus();
      return wrongValue
        ? 'Check the highlighted fields — sizes, weight, quantity and price must be above 0, HSN 4–8 digits.'
        : 'Fill in the highlighted fields.';
    }
    return null;
  }

  function setStatus(form, text, kind = '') {
    const s = form.querySelector('.status');
    s.className = `status ${kind}`;
    s.textContent = text;
  }

  async function submit(form) {
    const problem = validate(form);
    if (problem) return setStatus(form, problem, 'err');

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    setStatus(form, 'Creating order…');
    const order = collect(form);
    const itemKeys = [...form.querySelectorAll('.item')].map((g) =>
      itemKey(g.dataset.base || g.querySelector('[name="vendor_order_item_name"]').value));
    const res = await send({
      type: 'addOrder', order, itemKeys,
      packageKey: packageKey(order.vendor_order_items.map((it, i) => ({ qty: it.vendor_order_item_quantity, key: itemKeys[i] }))),
    });
    btn.disabled = false;

    if (!res.ok) {
      setStatus(form, res.error, 'err');
      return;
    }
    const { tracking } = res.result;
    form.sgDirty = false;
    setStatus(form, tracking ? `Created · ${tracking}` : 'Created — check ShipGlobal for tracking', 'ok');
    btn.textContent = 'Sent';
    btn.disabled = true;
  }

  // Etsy Shop Manager's palette and type (ABCDiatype; #312B36 ink on #FAF8F5 paper; white
  // cards, #E0DAD6 hairlines, #928681 field borders, pill buttons) arranged with a Rams-like
  // economy: a strict grid, numbered steps, one accent colour reserved for actions.
  function CSS() {
    return `
      :host { all: initial; }
      * { box-sizing: border-box; }
      [hidden] { display: none !important; }
      .backdrop {
        --ink: #312b36; --ink-2: #6b6570; --paper: #faf8f5; --card: #fff; --line: #e0dad6;
        --field: #928681; --tint: rgba(51, 20, 0, .05); --glow: rgba(51, 20, 0, .133);
        --accent: ${ORANGE}; --accent-ink: #b84a12; --accent-tint: #fdf0e9;
        --error: #a61a2e; --error-tint: #fbe9eb; --warn-tint: #fdf3e3; --info-tint: #eef3ee; --ok: #2f6b3a;
        position: fixed; inset: 0; z-index: 2147483647;
        display: flex; align-items: center; justify-content: center; padding: 24px;
        background: rgba(34, 30, 37, .48);
        font-family: ABCDiatype, -apple-system, "Helvetica Neue", "Droid Sans", Arial, sans-serif;
        font-size: 14px; line-height: 20px; color: var(--ink);
        -webkit-font-smoothing: antialiased; font-variant-numeric: tabular-nums;
      }
      .panel {
        width: min(1040px, 100%); max-height: 100%; display: flex; flex-direction: column;
        background: var(--paper); border-radius: 16px; overflow: hidden;
        box-shadow: 0 24px 64px rgba(34, 30, 37, .32);
      }

      /* Header */
      header { display: flex; align-items: flex-start; gap: 16px; padding: 24px 32px 20px; border-bottom: 1px solid var(--line); }
      .title { flex: 1; min-width: 0; }
      .eyebrow { margin: 0 0 6px; display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-2); }
      .mark { display: inline-grid; color: var(--accent); }
      h2 { margin: 0; font-size: 24px; line-height: 28px; font-weight: 700; letter-spacing: -.5px; }
      .meta { margin: 6px 0 0; color: var(--ink-2); white-space: pre-wrap; }
      .picker { width: auto; max-width: 280px; margin-top: 18px; }

      /* Faster-shipping nudge under Service */
      .ship-note { margin: 12px 0 0; font-size: 13px; }
      .ship-note:empty { display: none; }
      .ship-note .fast { color: var(--accent-ink); font-weight: 700; }

      /* From Etsy: read-only order details */
      .extras { margin: 16px 0 0; padding-top: 16px; border-top: 1px solid var(--line); display: grid; gap: 4px; }
      .extras dd { font-size: 13px; }
      .kv { display: grid; gap: 2px; }
      .kv + .kv { margin-top: 8px; }
      .kv-item { font-weight: 700; }
      .kv-row { display: flex; justify-content: space-between; gap: 12px; }
      .kv-row > span:last-child { text-align: right; font-weight: 700; }
      blockquote { margin: 4px 0 0; padding: 8px 12px; border-radius: 8px; background: var(--tint); white-space: pre-line; }
      blockquote + blockquote { margin-top: 6px; }

      /* Package presets */
      .preset-trigger {
        height: 32px; padding: 0 30px 0 14px; border: 1px solid var(--line); border-radius: 16px;
        font-size: 13px; font-weight: 700; color: var(--ink);
        background: var(--card) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5l5 5 5-5' fill='none' stroke='%23312b36' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat right 12px center / 10px 7px;
      }
      .preset-trigger:hover, .preset-trigger[aria-expanded="true"] { border-color: var(--ink); }
      .preset-trigger.on { border-color: var(--accent); background-color: var(--accent-tint); color: var(--accent-ink); }
      .pop-head a { font-size: 13px; }
      .save-row { align-items: center; gap: 8px; }
      .save-row input { flex: 1; height: 36px; font-size: 14px; }
      .small-btn { height: 36px; padding: 0 16px; border: 0; border-radius: 18px; background: var(--ink); color: var(--paper); font-weight: 700; font-size: 14px; }
      .text-btn:disabled { color: var(--ink-2); text-decoration: none; cursor: default; }

      /* Header status icons */
      .badges { display: flex; gap: 6px; margin-top: 18px; }
      .badge {
        position: relative; display: grid; place-items: center; width: 36px; height: 36px; padding: 0;
        border: 0; border-radius: 50%; cursor: default;
      }
      .badge.clickable { cursor: pointer; }
      .badge.warn { background: var(--warn-tint); color: var(--accent-ink); }
      .badge.info { background: var(--info-tint); color: #3d6b48; }
      .badge.err { background: var(--error-tint); color: var(--error); }
      .badge:hover, .badge:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--paper), 0 0 0 3px currentColor; }
      .tip {
        position: absolute; top: calc(100% + 10px); right: -8px; z-index: 3; width: max-content; max-width: 260px;
        padding: 8px 12px; border-radius: 8px; background: var(--ink); color: var(--paper);
        font-size: 13px; line-height: 18px; font-weight: 400; text-align: left; white-space: pre-line;
        opacity: 0; transform: translateY(-4px); pointer-events: none; transition: opacity .12s, transform .12s;
      }
      .tip::before { content: ''; position: absolute; top: -5px; right: 21px; width: 10px; height: 10px; background: var(--ink); transform: rotate(45deg); border-radius: 2px; }
      .badge:hover .tip, .badge:focus-visible .tip { opacity: 1; transform: none; }

      /* Layout */
      .body { flex: 1; overflow: auto; display: grid; grid-template-columns: minmax(0, 1fr) 288px; gap: 32px; padding: 8px 32px 32px; }
      .main { min-width: 0; }
      .step { padding: 24px 0 4px; border-top: 1px solid var(--line); }
      .step:first-child { border-top: 0; }
      .step h3 { margin: 0 0 16px; display: flex; align-items: baseline; gap: 12px; font-size: 16px; line-height: 20px; font-weight: 700; letter-spacing: -.16px; }
      .idx { font-size: 12px; font-weight: 700; color: var(--accent-ink); letter-spacing: .04em; }
      .hint { margin: -8px 0 16px; color: var(--ink-2); font-size: 13px; }
      .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
      .grid.tight { gap: 12px; }

      /* Fields */
      .field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
      .field.wide { grid-column: 1 / -1; }
      .label { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; font-weight: 700; }
      .opt { font-weight: 400; color: var(--ink-2); }
      .note { font-size: 12px; color: var(--ink-2); }
      input, select {
        width: 100%; height: 40px; padding: 0 12px; border: 1px solid var(--field); border-radius: 8px;
        background: var(--card); color: var(--ink); font: inherit; font-size: 15px;
        transition: border-color .15s, box-shadow .15s;
      }
      select {
        -webkit-appearance: none; appearance: none; padding-right: 40px; cursor: pointer;
        background: var(--card) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5l5 5 5-5' fill='none' stroke='%23312b36' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat right 14px center / 12px 8px;
      }
      input[type=number] { -moz-appearance: textfield; }
      input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
      input::placeholder { color: #a39e9a; }
      input:hover, select:hover { border-color: var(--ink); }
      input:focus, select:focus { outline: none; border-color: var(--ink); box-shadow: 0 0 0 1px var(--ink); }
      input.bad, select.bad { border-color: var(--error); box-shadow: 0 0 0 1px var(--error); background-color: var(--error-tint); }
      .unit { position: relative; display: flex; align-items: center; }
      .unit > span:last-child { position: absolute; right: 12px; color: var(--ink-2); font-size: 13px; pointer-events: none; }
      .unit input { padding-right: 44px; }

      /* Package */
      .package { display: grid; grid-template-columns: minmax(0, 1fr) 140px; gap: 16px; }
      .dim-row { display: flex; align-items: center; width: 100%; height: 40px; border: 1px solid var(--field); border-radius: 8px; background: var(--card); padding-right: 40px; }
      .dim-row:focus-within { border-color: var(--ink); box-shadow: 0 0 0 1px var(--ink); }
      .dim-row input { border: 0; box-shadow: none; height: 38px; text-align: center; padding: 0 4px; background: transparent; }
      .dim-row input:focus { box-shadow: none; }
      .dim-row input.bad { background: var(--error-tint); }
      .dim-row i { font-style: normal; color: var(--ink-2); }
      .readout { display: flex; flex-wrap: wrap; gap: 20px; margin: 12px 0 0; color: var(--ink-2); font-size: 13px; }
      .readout b { color: var(--ink); font-weight: 700; }
      .readout b.warn { color: var(--accent-ink); }

      /* Items */
      .items { display: grid; gap: 12px; }
      .item { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 16px; padding: 16px; background: var(--card); border: 1px solid var(--line); border-radius: 8px; }
      .thumb { width: 64px; height: 64px; border-radius: 6px; object-fit: cover; background: var(--tint); }
      .item-body { min-width: 0; display: grid; gap: 12px; }
      .item-top { display: flex; gap: 8px; align-items: center; }
      .item-name { font-weight: 700; border-color: transparent; padding-left: 0; height: 32px; }
      .item-name:hover, .item-name:focus { padding-left: 10px; }
      .item-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px 16px; }
      .span-2 { grid-column: span 2; display: grid; }


      /* Step heading control (currency) */
      .step h3 .h-aside { margin-left: auto; }
      .inline-field { display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 400; color: var(--ink-2); }
      select.compact { height: 32px; width: auto; min-width: 92px; padding: 0 32px 0 12px; font-size: 14px; font-weight: 700; background-position: right 12px center; }

      /* Label icon (HSN suggestions) */
      .label-main { display: inline-flex; align-items: center; gap: 6px; }
      .label-icon {
        display: inline-grid; place-items: center; width: 24px; height: 24px; padding: 0; margin: -4px 0;
        border: 0; border-radius: 50%; background: none; color: var(--ink-2); cursor: pointer;
      }
      .label-icon:hover, .label-icon[aria-expanded="true"] { background: var(--tint); color: var(--ink); }
      .label-icon.ready { color: var(--accent); }

      /* Select-style trigger (service) */
      .select-trigger {
        display: flex; align-items: center; gap: 12px; width: 100%; height: 40px; padding: 0 40px 0 12px;
        border: 1px solid var(--field); border-radius: 8px; text-align: left; font-size: 15px;
        background: var(--card) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5l5 5 5-5' fill='none' stroke='%23312b36' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat right 14px center / 12px 8px;
      }
      .select-trigger:hover { border-color: var(--ink); }
      .select-trigger:focus-visible, .select-trigger[aria-expanded="true"] { outline: none; border-color: var(--ink); box-shadow: 0 0 0 1px var(--ink); }
      .select-trigger:has(input.bad) { border-color: var(--error); box-shadow: 0 0 0 1px var(--error); background-color: var(--error-tint); }
      .st-main { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .st-main.placeholder { color: #a39e9a; }
      .st-meta { color: var(--ink-2); font-size: 13px; white-space: nowrap; }

      /* Popover */
      .popover {
        position: fixed; z-index: 2; max-height: min(420px, calc(100vh - 32px)); overflow: auto;
        background: var(--card); border: 1px solid var(--line); border-radius: 12px;
        box-shadow: 0 12px 40px rgba(34, 30, 37, .2); padding: 8px;
        animation: pop-in .12s ease-out;
      }
      @keyframes pop-in { from { opacity: 0; transform: translateY(-4px); } }
      .pop-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 8px 10px 10px; font-size: 13px; }
      .pop-head strong { font-size: 14px; }
      .pop-msg { margin: 0; padding: 8px 10px 12px; color: var(--ink-2); }
      .pop-msg.err { color: var(--error); }
      .pop-foot { display: flex; gap: 16px; padding: 8px 10px 4px; border-top: 1px solid var(--line); margin-top: 6px; }
      .opts { display: grid; gap: 2px; }
      .choice {
        display: grid; grid-template-columns: minmax(0, 1fr) auto 16px; align-items: center; gap: 12px;
        width: 100%; padding: 10px; border: 0; border-radius: 8px; background: none; text-align: left; font-weight: 400;
      }
      .choice:hover, .choice:focus-visible { outline: none; background: var(--tint); }
      .choice-text { display: grid; gap: 2px; min-width: 0; }
      .choice-main { font-weight: 700; }
      .choice-sub { color: var(--ink-2); font-size: 13px; }
      .choice-meta { font-weight: 700; white-space: nowrap; }
      .choice-check { width: 16px; height: 16px; }
      .choice.on .choice-check {
        background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3 8.5l3.2 3L13 4.5' fill='none' stroke='%23f1641e' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / 16px no-repeat;
      }
      .choice.on .choice-main { color: var(--accent-ink); }

      /* Side card */
      .side { padding-top: 24px; }
      .card { position: sticky; top: 0; background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 20px; }
      .card-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 16px; }
      .card-head h3 { margin: 0; font-size: 16px; font-weight: 700; }
      dl { margin: 0; display: grid; gap: 4px; }
      dt { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-2); margin-top: 12px; }
      dt:first-child { margin-top: 0; }
      dd { margin: 0; overflow-wrap: anywhere; }
      .missing { color: var(--error); }
      .editor { display: grid; gap: 20px; }
      .editor h4 { margin: 0 0 10px; font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-2); }
      .editor .grid { grid-template-columns: 1fr 1fr; }
      .editor input, .editor select { height: 36px; font-size: 14px; }

      /* Buttons */
      button { font: inherit; color: var(--ink); cursor: pointer; }
      .primary {
        height: 48px; padding: 0 28px; border: 0; border-radius: 24px; background: var(--accent); color: #fff;
        font-size: 16px; font-weight: 700; transition: box-shadow .2s, background .2s;
      }
      .primary:hover:not(:disabled) { box-shadow: 0 0 24px 4px var(--glow); background: #e15511; }
      .primary:disabled { opacity: .55; cursor: default; }
      .text-btn {
        height: auto; padding: 4px 0; border: 0; background: none; font-size: 14px; font-weight: 700;
        text-decoration: underline; text-underline-offset: 4px; text-decoration-thickness: 1px;
      }
      .text-btn:hover { text-decoration-thickness: 2px; }
      .step > .text-btn { margin-top: 12px; }
      .icon-btn { flex: none; width: 40px; height: 40px; border: 0; border-radius: 50%; background: none; font-size: 26px; line-height: 1; color: var(--ink); }
      .icon-btn:hover { background: var(--tint); }
      .icon-btn.small { width: 32px; height: 32px; font-size: 20px; color: var(--ink-2); }
      a { color: inherit; text-underline-offset: 3px; }
      .muted { color: var(--ink-2); }
      .err { color: var(--error); }
      .pulse { animation: pulse 1.2s ease-in-out infinite; }
      @keyframes pulse { 50% { opacity: .45; } }

      /* Footer */
      footer { display: flex; align-items: center; gap: 24px; padding: 16px 32px; border-top: 1px solid var(--line); background: var(--card); }
      .panel.stale { width: min(480px, 100%); }
      .panel.stale header { border-bottom: 0; }
      .totals { display: flex; gap: 24px; }
      .totals span { display: flex; flex-direction: column; font-size: 16px; font-weight: 700; }
      .totals small { font-size: 12px; font-weight: 400; color: var(--ink-2); }
      .status { flex: 1; text-align: right; }
      .status.err { color: var(--error); }
      .status.ok { color: var(--ok); font-weight: 700; }

      @media (max-width: 860px) {
        .body { grid-template-columns: 1fr; gap: 0; }
        .side { padding-top: 8px; }
        .item-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .package { grid-template-columns: 1fr; }
        footer { flex-wrap: wrap; }
      }
    `;
  }
})();
