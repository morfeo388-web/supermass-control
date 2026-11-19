'use strict';

let receptionFilter = 'por';
let receptionSearch = '';
let rec = null;

function receptionMatches(inv, filter) {
  if (filter === 'por') return inv.status === 'pendiente' || inv.status === 'parcial';
  if (filter === 'diferencias') return inv.status === 'diferencias';
  if (filter === 'recibidas') return inv.status === 'recibida';
  return true;
}

function renderReceptions() {
  const counts = {
    por: state.invoices.filter(inv => receptionMatches(inv, 'por')).length,
    diferencias: state.invoices.filter(inv => receptionMatches(inv, 'diferencias')).length,
    recibidas: state.invoices.filter(inv => receptionMatches(inv, 'recibidas')).length,
    todas: state.invoices.length
  };
  const tabs = [
    { id: 'por', label: 'Por recibir' },
    { id: 'diferencias', label: 'Con diferencias' },
    { id: 'recibidas', label: 'Recibidas' },
    { id: 'todas', label: 'Todas' }
  ];
  const list = state.invoices
    .filter(inv => receptionMatches(inv, receptionFilter))
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

  const cards = list.map(inv => {
    const info = countedInfo(inv);
    const percent = info.total ? Math.round((info.counted / info.total) * 100) : 0;
    const search = [inv.supplier, inv.number, inv.lines.map(l => `${l.name} ${l.barcode}`).join(' '), STATUS_LABEL[inv.status]].join(' ');
    return `<a class="invoice-card" href="#/recepcion/${inv.id}" data-search="${esc(search)}">
      <div class="invoice-main">
        <strong>${esc(inv.supplier || 'Proveedor sin nombre')}</strong>
        <span>Factura ${esc(inv.number || 's/n')} · ${fmtDate(inv.date)}</span>
        <small>${inv.lines.length} línea${inv.lines.length === 1 ? '' : 's'} · ${info.counted}/${info.total} contadas</small>
        ${inv.status === 'parcial' ? `<div class="progress" style="max-width:240px"><div style="width:${percent}%"></div></div>` : ''}
      </div>
      <div class="invoice-side">
        ${statusChip(inv.status)}
        <span class="when">${inv.receivedAt ? `Recibida ${fmtDate(isoToLocalDate(inv.receivedAt))}` : 'Pendiente'}</span>
      </div>
    </a>`;
  }).join('');

  const empty = `<div class="empty">
    <div class="empty-icon">${icon('box', 'icon big')}</div>
    <h3>${state.invoices.length ? 'No hay recepciones en este filtro' : 'No hay mercancía por recibir'}</h3>
    <p>${state.invoices.length ? 'Prueba con otro filtro.' : 'Primero captura una factura y después viene aquí a comparar lo que llega.'}</p>
    ${state.invoices.length ? '' : `<a class="btn primary" href="#/factura/nuevo">${icon('plus')} Nueva factura</a>`}
  </div>`;

  $('#app').innerHTML = `
    <div class="page-head">
      <div><h1>Recepción</h1><p>Compara lo que llegó contra la factura y registra caducidades.</p></div>
      <div class="head-actions"><a class="btn ghost" href="#/facturas">${icon('invoice')} Ver facturas</a></div>
    </div>
    <div class="toolbar">
      <div class="chips">
        ${tabs.map(tab => `<button type="button" class="chip-btn ${receptionFilter === tab.id ? 'active' : ''}" data-action="filter-receptions" data-filter="${tab.id}">${tab.label} <span class="count">${counts[tab.id]}</span></button>`).join('')}
      </div>
      <label class="search">${icon('search')}<input id="rec-search" type="search" placeholder="Buscar proveedor o factura" value="${esc(receptionSearch)}" autocomplete="off"></label>
    </div>
    <div class="invoice-list" id="reception-list">${cards || empty}</div>`;

  if (receptionSearch) filterCards('#reception-list .invoice-card', receptionSearch);
}

function setReceptionFilter(filter) {
  receptionFilter = filter;
  renderReceptions();
}

function recStats() {
  const base = rec ? rec.lines.filter(line => !line.extra) : [];
  const counted = base.filter(line => line.counted).length;
  const total = base.length;
  const diffs = rec ? rec.lines.filter(line => {
    const delta = lineDelta(line);
    return delta != null && delta !== 0;
  }).length : 0;
  const noExpiry = rec ? rec.lines.filter(line => line.perishable && (Number(line.receivedQty) || 0) > 0 && !line.receivedExpiry).length : 0;
  return { counted, total, diffs, noExpiry, percent: total ? Math.round((counted / total) * 100) : 0 };
}

function recSummaryHTML() {
  const stats = recStats();
  return `<div id="rec-summary" class="rec-summary">
    <span><strong>${stats.counted}</strong> de <strong>${stats.total}</strong> contados</span>
    <span class="${stats.diffs ? 'warn-text' : 'muted'}">${stats.diffs ? `${stats.diffs} diferencia${stats.diffs === 1 ? '' : 's'}` : 'Sin diferencias'}</span>
    ${stats.noExpiry ? `<span class="warn-text">${stats.noExpiry} sin caducidad</span>` : ''}
  </div>`;
}

function updateRecSummary() {
  const el = $('#rec-summary');
  if (el) el.outerHTML = recSummaryHTML();
  const bar = $('#rec-progress > div');
  if (bar) bar.style.width = recStats().percent + '%';
  const flag = $('#rec-dirty');
  if (flag && rec) {
    flag.className = rec.dirty ? 'dirty-flag' : 'saved-flag';
    flag.textContent = rec.dirty ? 'Cambios sin guardar' : 'Guardado';
  }
}

function badgeInfo(line) {
  if (line.extra) {
    const qty = Number(line.receivedQty) || 0;
    return { text: qty > 0 ? `Adicional +${fmtQty(qty)}` : 'Adicional', cls: 'info' };
  }
  if (!line.counted) return { text: 'Sin contar', cls: '' };
  const delta = lineDelta(line);
  if (delta == null) return { text: 'Sin cantidad', cls: '' };
  if (delta === 0) return { text: 'Completo', cls: 'ok' };
  if (delta < 0) return { text: `Faltan ${fmtQty(Math.abs(delta))}`, cls: 'danger' };
  return { text: `Sobran ${fmtQty(delta)}`, cls: 'warn' };
}

function updateRecBadge(line) {
  const card = $(`[data-line-card="${line.id}"]`);
  if (!card) return;
  const badge = $('[data-diff]', card);
  if (!badge) return;
  const info = badgeInfo(line);
  badge.className = 'badge ' + info.cls;
  badge.textContent = info.text;
}

function suggestionHTML(line) {
  if (line.receivedExpiry) return '';
  const suggested = suggestedExpiry(line);
  if (suggested) {
    return `<span class="suggest">Sugerido por historial: ${fmtDate(suggested)} <button type="button" data-action="use-suggestion" data-line="${line.id}" data-value="${suggested}">Usar</button></span>`;
  }
  if (line.expiry) {
    return `<span class="suggest">En factura: ${fmtDate(line.expiry)} <button type="button" data-action="use-suggestion" data-line="${line.id}" data-value="${line.expiry}">Usar</button></span>`;
  }
  return `<span class="suggest">Captura la fecha de caducidad.</span>`;
}

function receptionLineHTML(line, index) {
  const info = badgeInfo(line);
  return `<article class="line-card" data-line-card="${line.id}">
    <div class="line-top">
      <span class="line-num">Línea #${index + 1} ${line.extra ? '<span class="extra-tag">No facturado</span>' : ''}</span>
      <div class="rec-actions">
        <span class="badge ${info.cls}" data-diff="${line.id}">${info.text}</span>
        ${line.extra ? `<button type="button" class="icon-btn danger-ghost" data-action="remove-extra" data-line="${line.id}" aria-label="Quitar adicional">${icon('trash')}</button>` : ''}
      </div>
    </div>
    <div class="rec-title">
      <strong>${esc(line.name || 'Artículo sin nombre')}</strong>
      <span>${esc(line.barcode || 'Sin código')} · ${line.extra ? 'Artículo adicional' : `Esperado: ${fmtQty(line.qty)} ${esc(line.unit)}`}</span>
    </div>
    <div class="grid rec-grid" style="margin-top:10px">
      <label class="field"><span>Cantidad recibida</span>
        <input type="number" min="0" step="0.01" inputmode="decimal" data-rec-field="receivedQty" data-line="${line.id}" value="${line.receivedQty ?? ''}" placeholder="0">
      </label>
      <label class="check"><input type="checkbox" data-rec-field="counted" data-line="${line.id}" ${line.counted ? 'checked' : ''} ${line.extra ? 'disabled' : ''}> Contado</label>
      ${line.perishable ? `<label class="field"><span>Caducidad *</span><input type="date" data-rec-field="receivedExpiry" data-line="${line.id}" value="${esc(line.receivedExpiry)}">${suggestionHTML(line)}</label>` : ''}
      <label class="field span-2"><span>Nota / diferencia</span>
        <input data-rec-field="note" data-line="${line.id}" value="${esc(line.note)}" placeholder="Ej. caja rota, faltó 1 pieza, producto dañado...">
      </label>
    </div>
  </article>`;
}

function renderReception(id) {
  const inv = findInvoice(id);
  if (!inv) {
    $('#app').innerHTML = `<div class="empty">
      <div class="empty-icon">${icon('alert', 'icon big')}</div>
      <h3>Factura no encontrada</h3>
      <p>Puede que se haya eliminado en este dispositivo.</p>
      <a class="btn primary" href="#/recepciones">Volver a recepción</a>
    </div>`;
    return;
  }

  if (!rec || rec.invoiceId !== id) {
    rec = { invoiceId: id, lines: deepClone(inv.lines), dirty: false };
  }
  const received = !!inv.receivedAt;
  const started = inv.lines.some(line => line.counted || line.extra);
  const stats = recStats();

  $('#app').innerHTML = `
    <div class="page-head">
      <div>
        <a class="link-back" href="#/recepciones">${icon('back')} Recepción</a>
        <h1>${received ? 'Revisar recepción' : 'Recibir mercancía'}</h1>
        <p>${esc(inv.supplier || 'Proveedor sin nombre')} · Factura ${esc(inv.number || 's/n')} · ${fmtDate(inv.date)}</p>
      </div>
      <div class="head-actions">
        <a class="btn ghost" href="#/factura/${inv.id}">${icon('invoice')} Ver factura</a>
      </div>
    </div>

    <div class="stack">
      <section class="card recep-head">
        <div class="recep-meta">
          ${statusChip(inv.status)}
          <span class="muted">${received ? `Recepción guardada: ${fmtDateTime(inv.receivedAt)}` : 'Aún no guardada'}</span>
          <span id="rec-dirty" class="${rec.dirty ? 'dirty-flag' : 'saved-flag'}">${rec.dirty ? 'Cambios sin guardar' : (received ? 'Guardado' : (started ? 'Avance guardado' : 'Sin guardar'))}</span>
        </div>
        ${recSummaryHTML()}
        <div class="progress" id="rec-progress"><div style="width:${stats.percent}%"></div></div>
        <p class="hint">${received ? 'Esta recepción ya está guardada. Puedes corregir cantidades, caducidades o notas y pulsar <strong>Guardar corrección</strong>.' : 'Marca <strong>Contado</strong> en cada línea y registra lo que realmente llegó. En perecederos captura la caducidad; si falta, se guardará como “Sin caducidad”.'}</p>
      </section>

      <section class="card">
        <div class="card-head">
          <h2 class="card-title">Artículos (${rec.lines.length})</h2>
          <button type="button" class="btn secondary small" data-action="add-extra">${icon('plus')} No facturado</button>
        </div>
        <div class="lines">${rec.lines.map(receptionLineHTML).join('')}</div>
      </section>

      <div class="sticky-actions">
        <a class="btn ghost" href="#/factura/${inv.id}">Volver</a>
        ${received ? '' : `<button type="button" class="btn secondary" data-action="save-progress">Guardar avance</button>`}
        <button type="button" class="btn primary" data-action="finalize-reception">${received ? 'Guardar corrección' : 'Finalizar recepción'}</button>
      </div>
    </div>`;
}

function handleReceptionField(el) {
  if (!rec) return;
  const line = rec.lines.find(item => item.id === el.dataset.line);
  if (!line) return;
  const field = el.dataset.recField;

  if (field === 'counted') {
    line.counted = el.checked;
    if (el.checked && (line.receivedQty == null || line.receivedQty === '')) {
      line.receivedQty = line.extra ? 1 : roundQty(Number(line.qty) || 0);
      const card = el.closest('[data-line-card]');
      const qtyInput = card && $('[data-rec-field="receivedQty"]', card);
      if (qtyInput) qtyInput.value = line.receivedQty;
    }
  } else if (field === 'receivedQty') {
    const value = el.value;
    line.receivedQty = value === '' ? null : roundQty(Number(value));
    if (!line.extra) {
      line.counted = value !== '';
      const card = el.closest('[data-line-card]');
      const checkbox = card && $('[data-rec-field="counted"]', card);
      if (checkbox) checkbox.checked = line.counted;
    }
  } else if (field === 'receivedExpiry') {
    line.receivedExpiry = el.value;
  } else if (field === 'note') {
    line.note = el.value;
  }

  rec.dirty = true;
  dirty = true;
  updateRecBadge(line);
  updateRecSummary();
}

function useExpirySuggestion(lineId, value) {
  if (!rec || !value) return;
  const line = rec.lines.find(item => item.id === lineId);
  if (!line) return;
  line.receivedExpiry = value;
  rec.dirty = true;
  dirty = true;
  renderReception(rec.invoiceId);
  toast('Caducidad aplicada');
}

async function addExtraLine() {
  if (!rec) return;
  const result = await showDialog({
    title: 'Agregar artículo no facturado',
    body: '<p>Para mercancía que llegó pero no aparece en la factura.</p>',
    fields: [
      { name: 'name', label: 'Artículo *', required: true, placeholder: 'Nombre del producto' },
      { name: 'barcode', label: 'Código de barras', placeholder: 'Opcional' },
      { name: 'qty', label: 'Cantidad recibida *', type: 'number', step: '0.01', min: 0, required: true, value: 1, inputmode: 'decimal' },
      { name: 'unit', label: 'Unidad', type: 'select', options: UNITS, value: 'pza' },
      { name: 'perishable', label: 'Es perecedero', type: 'checkbox' },
      { name: 'expiry', label: 'Caducidad', type: 'date' }
    ],
    actions: [
      { id: 'add', label: 'Agregar', style: 'primary' },
      { id: 'cancel', label: 'Cancelar', style: 'ghost' }
    ]
  });
  if (!result || result.action !== 'add') return;
  const values = result.values;
  const qty = roundQty(Number(values.qty));
  if (!String(values.name || '').trim() || !(qty > 0)) {
    toast('Escribe el nombre y una cantidad mayor a 0', 'error');
    return;
  }
  rec.lines.push({
    id: uid('ln'),
    barcode: String(values.barcode || '').trim(),
    name: String(values.name).trim(),
    unit: UNITS.includes(values.unit) ? values.unit : 'pza',
    qty: 0,
    perishable: !!values.perishable,
    expiry: '',
    receivedQty: qty,
    receivedExpiry: values.expiry || '',
    counted: true,
    note: '',
    extra: true
  });
  rec.dirty = true;
  dirty = true;
  renderReception(rec.invoiceId);
  toast('Artículo adicional agregado');
}

async function removeExtraLine(lineId) {
  if (!rec) return;
  const line = rec.lines.find(item => item.id === lineId);
  if (!line) return;
  const ok = await confirmDialog('Quitar artículo adicional', `<p>¿Quitar <strong>${esc(line.name)}</strong> de esta recepción?</p>`, 'Quitar', true);
  if (!ok) return;
  rec.lines = rec.lines.filter(item => item.id !== lineId);
  rec.dirty = true;
  dirty = true;
  renderReception(rec.invoiceId);
  toast('Artículo adicional quitado');
}

function saveReceptionProgress() {
  if (!rec) return;
  if (!rec.dirty) {
    toast('No hay cambios por guardar');
    return;
  }
  const inv = findInvoice(rec.invoiceId);
  if (!inv) return;
  const now = new Date().toISOString();
  inv.lines = deepClone(rec.lines);
  inv.updatedAt = now;
  if (!inv.receivedAt) {
    inv.status = rec.lines.some(line => line.counted || line.extra) ? 'parcial' : 'pendiente';
  }
  const stats = recStats();
  log('Avance de recepción guardado', `Factura ${inv.number} · ${stats.counted}/${stats.total} contados`, inv.id);
  saveDB();
  rec.dirty = false;
  dirty = false;
  renderReception(inv.id);
  toast('Avance guardado', 'ok');
}

async function finalizeReception() {
  if (!rec) return;
  const inv = findInvoice(rec.invoiceId);
  if (!inv) return;

  const extrasWithoutData = rec.lines.filter(line => line.extra && (!String(line.name || '').trim() || !(Number(line.receivedQty) > 0)));
  if (extrasWithoutData.length) {
    toast('Completa nombre y cantidad de los artículos adicionales', 'error');
    return;
  }

  let uncounted = rec.lines.filter(line => !line.extra && !line.counted);
  if (uncounted.length) {
    const result = await showDialog({
      title: 'Faltan líneas por contar',
      body: `<p>Hay <strong>${uncounted.length}</strong> línea${uncounted.length === 1 ? '' : 's'} sin marcar como contado.</p><p>Puedes marcar esas líneas como no recibidas (cantidad 0) o guardar un avance y continuar después.</p>`,
      actions: [
        { id: 'zero', label: 'Marcar no recibidas', style: 'primary' },
        { id: 'save', label: 'Guardar avance', style: 'secondary' },
        { id: 'back', label: 'Volver', style: 'ghost' }
      ]
    });
    if (!result || result.action === 'back') return;
    if (result.action === 'save') {
      saveReceptionProgress();
      return;
    }
    uncounted.forEach(line => {
      line.receivedQty = 0;
      line.counted = true;
    });
    rec.dirty = true;
    dirty = true;
    renderReception(inv.id);
  }

  const missingExpiry = rec.lines.filter(line => line.perishable && (Number(line.receivedQty) || 0) > 0 && !line.receivedExpiry);
  if (missingExpiry.length) {
    const names = missingExpiry.map(line => esc(line.name || 'Sin nombre')).join(', ');
    const ok = await confirmDialog(
      'Faltan caducidades',
      `<p><strong>${missingExpiry.length}</strong> artículo${missingExpiry.length === 1 ? '' : 's'} perecedero${missingExpiry.length === 1 ? '' : 's'} sin fecha de caducidad:</p><p>${names}</p><p>Se guardará como “Sin caducidad” y aparecerá en las alertas para completarla después.</p>`,
      'Finalizar igual'
    );
    if (!ok) return;
  }

  rec.lines.forEach(line => {
    line.barcode = String(line.barcode || '').trim();
    line.name = String(line.name || '').trim();
    line.unit = UNITS.includes(line.unit) ? line.unit : 'pza';
    line.qty = roundQty(Number(line.qty) || 0);
    line.receivedQty = line.receivedQty == null || line.receivedQty === '' ? null : roundQty(Number(line.receivedQty));
    line.receivedExpiry = line.receivedExpiry || '';
    line.note = String(line.note || '').trim();
    line.counted = line.extra ? true : !!line.counted;
  });

  const wasReceived = !!inv.receivedAt;
  const now = new Date().toISOString();
  inv.lines = deepClone(rec.lines);
  inv.updatedAt = now;
  if (!inv.receivedAt) inv.receivedAt = now;
  inv.status = computedStatus(inv);

  rec.lines.forEach(line => {
    learnProduct(line);
    if (line.perishable && line.receivedExpiry && (Number(line.receivedQty) || 0) > 0) {
      const remaining = daysUntil(line.receivedExpiry);
      if (remaining != null && remaining >= 0) learnProduct(line, remaining);
    }
  });

  const stats = recStats();
  const diffText = stats.diffs ? ` · ${stats.diffs} diferencia${stats.diffs === 1 ? '' : 's'}` : '';
  log(wasReceived ? 'Recepción corregida' : 'Recepción finalizada', `Factura ${inv.number} · ${stats.counted}/${stats.total} contados${diffText}`, inv.id);
  saveDB();
  rec.dirty = false;
  dirty = false;
  rec = null;
  toast(inv.status === 'diferencias' ? 'Recepción guardada con diferencias' : 'Recepción completa', 'ok');
  location.hash = '#/factura/' + inv.id;
}
