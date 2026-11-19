'use strict';

/* ---------- Constants and icons ---------- */
const DB_KEY = 'supermass_control_v1';
const APP_VERSION = '1.0.0';
const UNITS = ['pza', 'kg', 'g', 'L', 'ml', 'caja', 'bolsa', 'paquete', 'charola', 'reja'];
const DAY = 86400000;

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
  invoice: '<path d="M6 2.8h9l4 4V21H6z"/><path d="M15 2.8V7h4"/><path d="M9 11h6M9 14.5h6M9 18h4"/>',
  box: '<path d="m12 2.8 8.2 4.4v9.6L12 21.2l-8.2-4.4V7.2z"/><path d="M3.8 7.2 12 11.6l8.2-4.4"/><path d="M12 11.6v9.6"/><path d="m7.9 5.1 8.2 4.4"/>',
  clock: '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.2V12l3.2 2"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="7" cy="17" r="2.2"/>',
  scan: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M4 12h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13"/><path d="M10 11v5M14 11v5"/>',
  edit: '<path d="M4 20h4l11-11-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  alert: '<path d="M12 3 2.8 20h18.4z"/><path d="M12 9v5M12 17h.01"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 20h16"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 20h16"/>',
  print: '<path d="M7 8V3h10v5"/><rect x="4" y="8" width="16" height="9" rx="2"/><path d="M7 14h10v7H7z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  camera: '<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.4"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  install: '<path d="M12 3v11M8 10l4 4 4-4"/><path d="M5 17v3h14v-3"/>',
  file: '<path d="M6 2.8h9l4 4V21H6z"/><path d="M15 2.8V7h4"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14-5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14 5l2-2"/><path d="M20 20v-4h-4"/>'
};

function icon(name, cls = 'icon') {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

function mountIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => {
    const wrap = document.createElement('span');
    wrap.innerHTML = icon(el.dataset.icon);
    el.replaceWith(wrap.firstElementChild);
  });
}

/* ---------- State ---------- */
function emptyState() {
  return { version: 1, products: {}, invoices: [], audit: [] };
}

function normalizeInvoice(inv) {
  inv = inv && typeof inv === 'object' ? inv : {};
  const lines = Array.isArray(inv.lines) ? inv.lines.map(l => {
    l = l && typeof l === 'object' ? l : {};
    const rq = l.receivedQty;
    return {
      id: l.id || uid('ln'),
      barcode: String(l.barcode || ''),
      name: String(l.name || ''),
      unit: UNITS.includes(l.unit) ? l.unit : 'pza',
      qty: roundQty(Number(l.qty) || 0),
      perishable: !!l.perishable,
      expiry: l.expiry || '',
      receivedQty: rq == null || rq === '' || !Number.isFinite(Number(rq)) ? null : roundQty(Number(rq)),
      receivedExpiry: l.receivedExpiry || '',
      counted: !!l.counted,
      note: String(l.note || ''),
      extra: !!l.extra
    };
  }) : [];
  return {
    id: inv.id || uid('inv'),
    supplier: String(inv.supplier || ''),
    number: String(inv.number || ''),
    date: inv.date || todayISO(),
    expectedDate: inv.expectedDate || '',
    notes: String(inv.notes || ''),
    status: ['pendiente', 'parcial', 'recibida', 'diferencias'].includes(inv.status) ? inv.status : 'pendiente',
    lines,
    createdAt: inv.createdAt || new Date().toISOString(),
    updatedAt: inv.updatedAt || inv.createdAt || new Date().toISOString(),
    receivedAt: inv.receivedAt || null
  };
}

function normalizeState(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    version: 1,
    products: s.products && typeof s.products === 'object' ? s.products : {},
    invoices: Array.isArray(s.invoices) ? s.invoices.map(normalizeInvoice) : [],
    audit: Array.isArray(s.audit) ? s.audit.slice(0, 500) : []
  };
}

function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : emptyState();
  } catch (err) {
    console.warn('No se pudo leer el almacenamiento local', err);
    return emptyState();
  }
}

function saveDB() {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.error(err);
    toast('No se pudieron guardar los datos. Descarga un respaldo desde Ajustes.', 'error');
    return false;
  }
}

let state = loadDB();

/* ---------- Small helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function uid(prefix = 'id') {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayISO() {
  return isoLocal(new Date());
}

function addDaysISO(days, from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + Number(days || 0));
  return isoLocal(d);
}

function parseISO(s) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return isNaN(dt.getTime()) ? null : dt;
}

function fmtDate(s) {
  const d = parseISO(s);
  return d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : '—';
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function isoToLocalDate(iso) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : isoLocal(d);
}

function daysUntil(s) {
  const d = parseISO(s);
  if (!d) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((d - today) / DAY);
}

function roundQty(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function fmtQty(n) {
  if (n == null || n === '' || !Number.isFinite(Number(n))) return '—';
  return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(Number(n));
}

function normalized(text) {
  return String(text == null ? '' : text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/* ---------- Toast ---------- */
let toastTimer = null;
function toast(message, type = '') {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3000);
}

/* ---------- Dialog ---------- */
function fieldHTML(f) {
  const id = 'dlg-' + f.name;
  const req = f.required ? 'required' : '';
  if (f.type === 'select') {
    const options = (f.options || []).map(o => {
      const value = typeof o === 'object' ? o.value : o;
      const label = typeof o === 'object' ? o.label : o;
      return `<option value="${esc(value)}" ${String(value) === String(f.value ?? '') ? 'selected' : ''}>${esc(label)}</option>`;
    }).join('');
    return `<label class="field"><span>${esc(f.label)}</span><select id="${id}" name="${esc(f.name)}" ${req}>${options}</select></label>`;
  }
  if (f.type === 'checkbox') {
    return `<label class="check"><input type="checkbox" id="${id}" name="${esc(f.name)}" ${f.value ? 'checked' : ''}> ${esc(f.label)}</label>`;
  }
  if (f.type === 'textarea') {
    return `<label class="field"><span>${esc(f.label)}</span><textarea id="${id}" name="${esc(f.name)}" rows="3" ${req} placeholder="${esc(f.placeholder || '')}">${esc(f.value || '')}</textarea></label>`;
  }
  return `<label class="field"><span>${esc(f.label)}</span><input type="${f.type || 'text'}" id="${id}" name="${esc(f.name)}" value="${esc(f.value ?? '')}" ${f.step ? `step="${f.step}"` : ''} ${f.min != null ? `min="${f.min}"` : ''} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''} ${req} ${f.inputmode ? `inputmode="${f.inputmode}"` : ''}></label>`;
}

function showDialog({ title, body = '', fields = [], actions = [{ id: 'cancel', label: 'Cancelar', style: 'ghost' }] }) {
  return new Promise(resolve => {
    const dlg = $('#dlg');
    const fieldsHtml = fields.map(fieldHTML).join('');
    dlg.innerHTML = `<div class="dlg-inner">
      <div class="dlg-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-dlg-cancel aria-label="Cerrar">${icon('x')}</button></div>
      <div class="dlg-body">${body}${fieldsHtml ? `<div class="dlg-fields">${fieldsHtml}</div>` : ''}</div>
      <div class="dlg-actions">${actions.map(a => `<button type="button" class="btn ${a.style || 'ghost'}" data-dlg-action="${esc(a.id)}">${esc(a.label)}</button>`).join('')}</div>
    </div>`;

    function cleanup() {
      dlg.removeEventListener('cancel', onCancel);
    }
    function close(value) {
      cleanup();
      try { dlg.close(); } catch (_) {}
      dlg.innerHTML = '';
      resolve(value);
    }
    function onCancel(ev) {
      ev.preventDefault();
      close(null);
    }
    function collect() {
      const values = {};
      $$('input,select,textarea', dlg).forEach(el => {
        if (!el.name) return;
        values[el.name] = el.type === 'checkbox' ? el.checked : el.value;
      });
      return values;
    }

    $$('[data-dlg-action]', dlg).forEach(btn => {
      btn.addEventListener('click', () => {
        const required = $$('[required]', dlg);
        for (const el of required) {
          if (!String(el.value).trim()) {
            el.focus();
            toast('Completa los campos obligatorios');
            return;
          }
        }
        close({ action: btn.dataset.dlgAction, values: collect() });
      });
    });
    $('[data-dlg-cancel]', dlg).addEventListener('click', () => close(null));
    dlg.addEventListener('cancel', onCancel);
    dlg.showModal();
    const first = $('input:not([type=checkbox]),select,textarea', dlg);
    if (first) setTimeout(() => first.focus(), 60);
  });
}

async function confirmDialog(title, body, okLabel = 'Confirmar', danger = false) {
  const result = await showDialog({
    title,
    body,
    actions: [
      { id: 'ok', label: okLabel, style: danger ? 'danger' : 'primary' },
      { id: 'cancel', label: 'Cancelar', style: 'ghost' }
    ]
  });
  return result && result.action === 'ok';
}

/* ---------- Download / CSV ---------- */
function downloadFile(filename, content, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

function csvCell(value) {
  const s = String(value == null ? '' : value);
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function downloadCSV(filename, headers, rows) {
  const content = '\ufeff' + [headers, ...rows].map(row => row.map(csvCell).join(';')).join('\r\n');
  downloadFile(filename, content, 'text/csv;charset=utf-8');
}

/* ---------- Audit and status ---------- */
function log(action, detail = '', invoiceId = null) {
  state.audit.unshift({ id: uid('ev'), ts: new Date().toISOString(), action, detail, invoiceId });
  if (state.audit.length > 500) state.audit.length = 500;
}

const STATUS_LABEL = { pendiente: 'Pendiente', parcial: 'En recepción', recibida: 'Recibida', diferencias: 'Con diferencias' };

function statusChip(status) {
  return `<span class="chip ${status}">${STATUS_LABEL[status] || status}</span>`;
}

function findInvoice(id) {
  return state.invoices.find(inv => inv.id === id);
}

function lineDelta(line) {
  if (line.extra) return roundQty(Number(line.receivedQty) || 0);
  if (!line.counted) return null;
  if (line.receivedQty == null || line.receivedQty === '') return null;
  return roundQty(Number(line.receivedQty) - Number(line.qty));
}

function countedInfo(inv) {
  const base = inv.lines.filter(l => !l.extra);
  return { counted: base.filter(l => l.counted).length, total: base.length };
}

function computedStatus(inv) {
  let hasDiff = false;
  for (const line of inv.lines) {
    if (line.extra) {
      if ((Number(line.receivedQty) || 0) > 0) hasDiff = true;
      continue;
    }
    if (!line.counted) return 'parcial';
    if (lineDelta(line) !== 0) hasDiff = true;
  }
  return hasDiff ? 'diferencias' : 'recibida';
}

function invoiceHasDiff(inv) {
  return inv.lines.some(line => {
    if (line.extra) return (Number(line.receivedQty) || 0) > 0;
    return line.counted && lineDelta(line) !== 0;
  });
}

function invoiceSummary(inv) {
  const names = inv.lines.filter(l => l.name).map(l => l.name);
  if (!names.length) return 'Sin artículos';
  return names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
}

/* ---------- Product catalog ---------- */
function productFor(code) {
  return code ? state.products[code] : null;
}

function learnProduct(line, shelfLifeDays) {
  if (!line || !line.barcode) return;
  const code = String(line.barcode).trim();
  if (!code) return;
  const prev = state.products[code] || { barcode: code };
  const p = { ...prev, barcode: code };
  if (line.name) p.name = line.name;
  if (line.unit) p.unit = line.unit;
  p.perishable = !!line.perishable;
  p.lastSeen = new Date().toISOString();
  if (shelfLifeDays != null && Number.isFinite(Number(shelfLifeDays))) p.shelfLifeDays = Math.round(Number(shelfLifeDays));
  state.products[code] = p;
}

function applyProductToLine(line) {
  const p = productFor(line.barcode);
  if (!p) return false;
  if (!line.name) line.name = p.name || '';
  if (p.unit) line.unit = p.unit;
  if (typeof p.perishable === 'boolean') line.perishable = p.perishable;
  return true;
}

function suggestedExpiry(line) {
  const p = productFor(line.barcode);
  if (p && Number.isFinite(Number(p.shelfLifeDays)) && Number(p.shelfLifeDays) >= 0) {
    return addDaysISO(Number(p.shelfLifeDays));
  }
  return '';
}

function supplierList() {
  return [...new Set(state.invoices.map(inv => inv.supplier).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
}

/* ---------- Filtering ---------- */
function filterCards(selector, query) {
  const q = normalized(query).trim();
  $$(selector).forEach(card => {
    card.hidden = !!q && !normalized(card.dataset.search || '').includes(q);
  });
}
