// Service worker: talks to the ShipGlobal Vendor API on behalf of the content script.
// Calls are made from here (not the page) so the Etsy page never sees your credentials
// and the request isn't subject to etsy.com's CORS rules.

const API_BASE = 'https://app.shipglobal.in/apiv1';
// HSN lookup, two ways:
//  - by photo: ShipGlobal's public HSN classifier (hsn.shipglobal.in, no login needed)
//  - by name: the dashboard's own API (the "Get HSN" button on Add Order), which needs the
//    dashboard login session — picked up from an open, signed-in ShipGlobal tab.
const HSN_IMAGE_API = 'https://hsn.shipglobal.in/api/classify';
const DASHBOARD_API = 'https://api.app.shipglobal.in/api/v1';
const DASHBOARD_URL = 'https://v2.app.shipglobal.in/';
const DASHBOARD_TABS = ['https://v2.app.shipglobal.in/*', 'https://app.shipglobal.in/*'];

function basicAuth(email, password) {
  // btoa() only handles Latin-1, so encode as UTF-8 first.
  const bytes = new TextEncoder().encode(`${email}:${password}`);
  return 'Basic ' + btoa(String.fromCharCode(...bytes));
}

function errorMessage(data, status) {
  if (!data) return `HTTP ${status}`;
  if (typeof data.msg === 'string') return data.msg;
  if (typeof data.message === 'string') return data.message;
  if (data.errors) {
    // Validation errors may come back as {field: [msg]} or [msg].
    const flat = Object.entries(data.errors).map(([k, v]) => `${k}: ${[].concat(v).join(', ')}`);
    if (flat.length) return flat.join('\n');
  }
  if (data.raw) return data.raw.slice(0, 500);
  return `HTTP ${status}`;
}

async function sgPost(path, body) {
  const { sgEmail, sgPassword } = await chrome.storage.local.get(['sgEmail', 'sgPassword']);
  if (!sgEmail || !sgPassword) {
    throw new Error('Add your ShipGlobal email and password in the extension options first.');
  }
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: basicAuth(sgEmail, sgPassword),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok || data.success === false) {
    const err = new Error(errorMessage(data, res.status));
    err.data = data;
    throw err;
  }
  return data;
}

// Pull a tracking/AWB number out of an add-order response. The docs don't show the
// response shape, so look in the likely places.
function findTracking(data) {
  const candidates = [data, data?.data, data?.order, data?.data?.order];
  for (const c of candidates) {
    if (!c || typeof c !== 'object') continue;
    for (const key of ['tracking', 'awb', 'awb_number', 'awbNumber', 'tracking_number']) {
      if (c[key]) return String(c[key]);
    }
  }
  return null;
}

// expiresAt comes as "2026-12-02 11:39:58".
function sessionValid({ sgDashToken, sgDashExpires }) {
  if (!sgDashToken) return false;
  const t = sgDashExpires ? Date.parse(String(sgDashExpires).replace(' ', 'T')) : NaN;
  return Number.isNaN(t) || t > Date.now();
}

// Public, no login: upload the listing photo, get HSN (+ US HTS) codes back.
async function classifyByImage(imageUrl) {
  const img = await fetch(imageUrl);
  if (!img.ok) throw new Error(`photo download failed (HTTP ${img.status})`);
  const blob = await img.blob();
  const form = new FormData();
  form.append('file', blob, 'item.jpg');
  const res = await fetch(HSN_IMAGE_API, { method: 'POST', body: form });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok || !body.data) throw new Error(body?.error || `HTTP ${res.status}`);
  // A photo showing several products comes back as a list; use the first.
  const d = body.data.multiple_items && body.data.items?.length ? body.data.items[0] : body.data;
  if (!d.indian_hsn_code) throw new Error('no HSN in the response');
  const { suggestions = [], ...primary } = d;
  return { primary, suggestions };
}

// The dashboard keeps its login in localStorage['auth-context']; read it from an open tab.
async function readDashboardSession() {
  const tabs = await chrome.tabs.query({ url: DASHBOARD_TABS });
  for (const tab of tabs) {
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => localStorage.getItem('auth-context'),
      });
      const auth = JSON.parse(result || 'null');
      const state = auth?.state || auth;
      if (state?.token) {
        const session = { sgDashToken: state.token, sgDashExpires: state.expiresAt || null };
        await chrome.storage.local.set(session);
        return session;
      }
    } catch {
      // Tab still loading, or not signed in — try the next one.
    }
  }
  return null;
}

// The dashboard's "Get HSN" (by product name). Needs the dashboard login.
async function classifyByName(name) {
  const signInError = new Error('Name lookup uses your ShipGlobal dashboard login.');
  signInError.data = { needsSignIn: true };

  let session = await chrome.storage.local.get(['sgDashToken', 'sgDashExpires']);
  if (!sessionValid(session)) session = await readDashboardSession();
  if (!session || !sessionValid(session)) throw signInError;

  const call = (token) => fetch(`${DASHBOARD_API}/hsn/classify-by-name`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ product_name: name }),
  });
  let res = await call(session.sgDashToken);
  if (res.status === 401 || res.status === 403) {
    // Stored token went stale; the open dashboard tab may have a newer one.
    await chrome.storage.local.remove(['sgDashToken', 'sgDashExpires']);
    const fresh = await readDashboardSession();
    if (!fresh || fresh.sgDashToken === session.sgDashToken) throw signInError;
    res = await call(fresh.sgDashToken);
    if (res.status === 401 || res.status === 403) throw signInError;
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.data) throw new Error(body?.message || `HSN lookup failed (HTTP ${res.status})`);
  return body.data;
}

const handlers = {
  async getSettings() {
    return chrome.storage.local.get(null).then(({ sgPassword, sgDashToken, sgDashExpires, ...rest }) => ({
      ...rest,
      hasCredentials: Boolean(rest.sgEmail && sgPassword),
      hasHsnSession: sessionValid({ sgDashToken, sgDashExpires }),
    }));
  },

  async sgSession({ token, expiresAt }) {
    await chrome.storage.local.set({ sgDashToken: token, sgDashExpires: expiresAt });
    return true;
  },

  // Returns {primary, suggestions[], source}; each option has indian_hsn_code,
  // simple_hsn_text, description, confidence (0–1) and, from the photo lookup, usa_hsn_code.
  // By name first: Etsy titles name the material, which the photo can't see (a copper
  // bottle reads as stainless steel from its photo). The photo is the fallback — e.g. when
  // there's no dashboard login for the name lookup. prefer: 'photo' to try the photo first.
  async classifyHsn({ name, image, prefer }) {
    const tries = [];
    if (name) tries.push(['name', () => classifyByName(name)]);
    if (image) tries[prefer === 'photo' ? 'unshift' : 'push'](['photo', () => classifyByImage(image)]);
    if (!tries.length) throw new Error('Enter the item name first.');
    const errors = {};
    for (const [source, run] of tries) {
      try {
        return { ...(await run()), source };
      } catch (err) {
        errors[source] = err;
      }
    }
    // Both failed (or the only one did). Say what would fix it.
    const err = errors.name || errors.photo;
    if (errors.name && errors.photo) {
      err.message = errors.name.data?.needsSignIn
        ? `Couldn't classify the product photo (${errors.photo.message}). ${errors.name.message}`
        : `${errors.name.message} (photo: ${errors.photo.message})`;
    }
    throw err;
  },

  // Add (or replace, by name) a package preset; returns the full list.
  async savePreset({ preset }) {
    const { packagePresets = [] } = await chrome.storage.local.get('packagePresets');
    const rest = packagePresets.filter((p) => p.name.toLowerCase() !== preset.name.toLowerCase());
    const next = [...rest, preset];
    await chrome.storage.local.set({ packagePresets: next });
    return next;
  },

  async openDashboard() {
    await chrome.tabs.create({ url: DASHBOARD_URL });
    return true;
  },

  async rates({ weight, country, postcode }) {
    return sgPost('/rates/calculate', {
      package_weight: String(weight),
      country_iso_code_2: country,
      postcode,
    });
  },

  async addOrder({ order, packageKey, itemKeys }) {
    const data = await sgPost('/order/add', order);
    const tracking = findTracking(data);
    const {
      createdOrders = {},
      itemMemory = {},
      packageMemory = {},
    } = await chrome.storage.local.get(['createdOrders', 'itemMemory', 'packageMemory']);

    createdOrders[order.order_reference] = {
      tracking,
      invoice_no: order.invoice_no,
      createdAt: new Date().toISOString(),
    };
    // Remember what you typed so the next order for the same product is pre-filled:
    // HSN/tax per product name, box size/weight per combination of items.
    // itemKeys: the base product titles (the sent names may include variants).
    for (const [i, it] of order.vendor_order_items.entries()) {
      const key = itemKeys?.[i] || it.vendor_order_item_name.toLowerCase().replace(/\s+/g, ' ').trim();
      if (key) itemMemory[key] = { hsn: it.vendor_order_item_hsn, tax: it.vendor_order_item_tax_rate };
    }
    if (packageKey) {
      packageMemory[packageKey] = {
        weight: order.package_weight,
        length: order.package_length,
        breadth: order.package_breadth,
        height: order.package_height,
      };
    }
    await chrome.storage.local.set({ createdOrders, itemMemory, packageMemory });
    return { data, tracking };
  },

  async testConnection() {
    // Cheapest authenticated call: a rate quote for a tiny parcel.
    return sgPost('/rates/calculate', {
      package_weight: '0.1',
      country_iso_code_2: 'US',
      postcode: '10001',
    });
  },

  async openOptions() {
    await chrome.runtime.openOptionsPage();
    return true;
  },
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = handlers[msg?.type];
  if (!handler) return false;
  handler(msg)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((err) => sendResponse({ ok: false, error: err.message, data: err.data }));
  return true; // keep the channel open for the async response
});

// Toolbar button: on an Etsy Shop Manager tab, open the order form; elsewhere, open options.
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.url && tab.url.startsWith('https://www.etsy.com/your/')) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'openForm' });
      return;
    } catch {
      // Content script not loaded yet (tab opened before install) — fall through.
    }
  }
  chrome.runtime.openOptionsPage();
});

// After an install, update or reload, Chrome doesn't run content scripts in tabs that are
// already open — and the copies that were running there are cut off. Inject fresh copies
// so the buttons keep working without a page refresh (the new copy replaces the old one).
const CONTENT_SCRIPTS = [
  { urls: ['https://www.etsy.com/your/*'], files: ['src/countries.js', 'src/extract.js', 'src/content.js'] },
  { urls: DASHBOARD_TABS, files: ['src/sg-session.js'] },
];
chrome.runtime.onInstalled.addListener(async () => {
  for (const { urls, files } of CONTENT_SCRIPTS) {
    const tabs = await chrome.tabs.query({ url: urls });
    for (const tab of tabs) {
      chrome.scripting.executeScript({ target: { tabId: tab.id }, files }).catch(() => {
        // Tab is discarded or still loading; it'll get the script on its next load.
      });
    }
  }
});
