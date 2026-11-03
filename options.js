const DEFAULTS = {
  service: 'ShipGlobal Direct',
  currency: 'USD',
  csb5: '0',
  weight: '0.5',
  length: '10',
  breadth: '10',
  height: '10',
  hsn: '',
  taxRate: '0',
  invoicePrefix: 'ETSY-',
  fallbackPhone: '',
  fallbackEmail: '',
  ioss: '',
  nickname: '',
};
const FIELDS = ['sgEmail', 'sgPassword', ...Object.keys(DEFAULTS)];

const $ = (id) => document.getElementById(id);

function setStatus(el, text, kind = '') {
  el.textContent = text;
  el.className = `status ${kind}`;
}

// ---- Load / save, with an honest "unsaved changes" state ---------------------------

let saved = null; // snapshot of what's in storage, to compare against

function snapshot() {
  const values = {};
  for (const key of FIELDS) values[key] = $(key).value.trim();
  values.packagePresets = readPresets();
  return values;
}

async function load() {
  const stored = await chrome.storage.local.get(null);
  for (const key of FIELDS) {
    const el = $(key);
    const value = stored[key] ?? DEFAULTS[key] ?? '';
    // Keep a stored value the select doesn't list (e.g. a service name typed earlier).
    if (el.tagName === 'SELECT' && value && ![...el.options].some((o) => o.value === value)) {
      el.add(new Option(value, value));
    }
    el.value = value;
  }
  $('presetRows').replaceChildren();
  (stored.packagePresets || []).forEach((p) => addPresetRow(p));
  renderPresetEmpty();
  renderHistory(stored.createdOrders || {});
  renderInvoicePreview();
  saved = JSON.stringify(snapshot());
  markDirty();
  renderSession();
}

function markDirty() {
  const dirty = saved !== null && JSON.stringify(snapshot()) !== saved;
  $('save').disabled = !dirty;
  $('revert').hidden = !dirty;
  if (dirty) setStatus($('saveResult'), 'Unsaved changes', 'dirty');
  else if ($('saveResult').classList.contains('dirty')) setStatus($('saveResult'), '');
}

// A preset needs a name and every size above 0; flag rows that don't.
function presetsValid() {
  let ok = true;
  for (const row of $('presetRows').querySelectorAll('.preset-row')) {
    const inputs = [...row.querySelectorAll('input')];
    const named = inputs[0].value.trim() !== '';
    const touched = inputs.some((i) => i.value.trim() !== '');
    for (const input of inputs) {
      const bad = touched && (input.dataset.key === 'name' ? !named : !(Number.parseFloat(input.value) > 0));
      input.classList.toggle('bad', bad);
      if (bad) ok = false;
    }
  }
  return ok;
}

async function save() {
  if (!presetsValid()) {
    setStatus($('saveResult'), 'Each preset needs a name and sizes above 0.', 'err');
    return;
  }
  const values = snapshot();
  await chrome.storage.local.set(values);
  saved = JSON.stringify(values);
  markDirty();
  setStatus($('saveResult'), 'Saved', 'ok');
}

document.addEventListener('input', markDirty);
document.addEventListener('change', markDirty);
$('save').addEventListener('click', save);
$('revert').addEventListener('click', () => {
  setStatus($('saveResult'), '');
  load();
});
// ⌘S / Ctrl+S saves.
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault();
    if (!$('save').disabled) save();
  }
});

// ---- 01 Account --------------------------------------------------------------------

$('test').addEventListener('click', async () => {
  setStatus($('testResult'), 'Testing…');
  // Test what's typed, even before saving.
  await chrome.storage.local.set({ sgEmail: $('sgEmail').value.trim(), sgPassword: $('sgPassword').value.trim() });
  const res = await chrome.runtime.sendMessage({ type: 'testConnection' });
  if (res?.ok) setStatus($('testResult'), 'Connected', 'ok');
  else setStatus($('testResult'), res?.error || 'Could not connect', 'err');
  const stored = await chrome.storage.local.get(['sgEmail', 'sgPassword']);
  const snap = JSON.parse(saved);
  snap.sgEmail = stored.sgEmail;
  snap.sgPassword = stored.sgPassword;
  saved = JSON.stringify(snap);
  markDirty();
});

// Whether "Get HSN by name" can use a ShipGlobal dashboard login (photo lookup needs none).
async function renderSession() {
  const dd = $('hsnSession');
  const res = await chrome.runtime.sendMessage({ type: 'getSettings' }).catch(() => null);
  if (res?.ok && res.result.hasHsnSession) {
    dd.className = 'ok';
    dd.textContent = 'Available — HSN lookup by item name works.';
  } else {
    dd.className = 'muted';
    dd.replaceChildren('Not found. HSN from product photos still works; for lookup by name, ');
    const a = document.createElement('a');
    a.href = '#';
    a.textContent = 'sign in to ShipGlobal';
    a.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.sendMessage({ type: 'openDashboard' });
    });
    dd.append(a, ' in this browser.');
  }
}

// ---- 03 Package presets: [{name, length, breadth, height, weight}] ----------------

const PRESET_COLS = [
  ['name', 'text', 'Name, e.g. Small box', 'Name'],
  ['length', 'number', 'cm', 'Length (cm)'],
  ['breadth', 'number', 'cm', 'Breadth (cm)'],
  ['height', 'number', 'cm', 'Height (cm)'],
  ['weight', 'number', 'kg', 'Weight (kg)'],
];

function addPresetRow(preset = {}) {
  const row = document.createElement('div');
  row.className = 'preset-row';
  row.setAttribute('role', 'row');
  for (const [key, type, placeholder, label] of PRESET_COLS) {
    const input = document.createElement('input');
    input.type = type;
    input.dataset.key = key;
    input.placeholder = placeholder;
    input.setAttribute('aria-label', label);
    if (type === 'number') {
      input.min = '0';
      input.step = key === 'weight' ? '0.01' : '0.1';
      input.inputMode = 'decimal';
    }
    input.value = preset[key] ?? '';
    row.appendChild(input);
  }
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'icon-btn';
  remove.textContent = '×';
  remove.setAttribute('aria-label', 'Remove preset');
  remove.addEventListener('click', () => {
    row.remove();
    renderPresetEmpty();
    markDirty();
  });
  row.appendChild(remove);
  $('presetRows').appendChild(row);
  return row;
}

function renderPresetEmpty() {
  $('presetEmpty').hidden = $('presetRows').children.length > 0;
}

function readPresets() {
  return [...$('presetRows').querySelectorAll('.preset-row')]
    .map((row) => Object.fromEntries([...row.querySelectorAll('input')].map((i) => [i.dataset.key, i.value.trim()])))
    .filter((p) => p.name);
}

$('addPreset').addEventListener('click', () => {
  addPresetRow().querySelector('input').focus();
  renderPresetEmpty();
});

// ---- 04 Customs & invoice --------------------------------------------------------

function renderInvoicePreview() {
  $('invoicePreview').textContent = `${$('invoicePrefix').value.trim()}4220411712`;
}
$('invoicePrefix').addEventListener('input', renderInvoicePreview);

// ---- 05 Sent orders ----------------------------------------------------------------

function renderHistory(createdOrders) {
  const rows = Object.entries(createdOrders).sort((a, b) => b[1].createdAt.localeCompare(a[1].createdAt));
  const box = $('historyList');
  if (!rows.length) {
    box.innerHTML = '<p class="empty">None yet. Orders you send appear here with their tracking number.</p>';
    return;
  }
  const table = document.createElement('table');
  table.className = 'history';
  table.innerHTML = '<thead><tr><th>Etsy order</th><th>Tracking</th><th>Sent</th></tr></thead>';
  const tbody = document.createElement('tbody');
  for (const [ref, info] of rows) {
    const tr = document.createElement('tr');
    const cell = (text, cls) => {
      const td = document.createElement('td');
      if (cls) td.className = cls;
      td.textContent = text;
      tr.appendChild(td);
      return td;
    };
    const order = cell(`#${ref}`, 'num');
    if (info.invoice_no) order.title = `Invoice ${info.invoice_no}`;
    const tracking = cell(info.tracking || '—', 'tracking');
    if (info.tracking) {
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'copy';
      copy.textContent = 'Copy';
      copy.addEventListener('click', async () => {
        const ok = await navigator.clipboard.writeText(info.tracking).then(() => true, () => false);
        copy.textContent = ok ? 'Copied' : 'Copy failed';
      });
      tracking.appendChild(copy);
    }
    cell(new Date(info.createdAt).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }), 'when');
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  box.replaceChildren(table);
}

// ---- Index: highlight the section in view ------------------------------------------

const links = [...document.querySelectorAll('.index a')];
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    for (const a of links) a.classList.toggle('current', a.getAttribute('href') === `#${entry.target.id}`);
  }
}, { rootMargin: '0px 0px -75% 0px' });
document.querySelectorAll('.block').forEach((s) => observer.observe(s));

load();
