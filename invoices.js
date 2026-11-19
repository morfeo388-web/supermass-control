'use strict';

let invoiceFilter = 'todas';
let invoiceSearch = '';
let editor = null;

function invoiceMatchesFilter(inv, filter) {
  if (filter === 'pendientes') return inv.status === 'pendiente' || inv.status === 'parcial';
  if (filter === 'recibidas') return inv.status === 'recibida';
  if (filter === 'diferencias') return inv.status === 'diferencias';
  return true;
}

function renderInvoices() {
  const counts = {
    todas: state.invoices.length,
    pendientes: state.invoices.filter(inv => invoiceMatchesFilter(inv, 'pendientes')).length,
    recibidas: state.invoices.filter(inv => invoiceMatchesFilter(inv, 'recibidas')).length,
    diferencias: state.invoices.filter(inv => invoiceMatchesFilter(inv, 'diferencias')).length
  };
  const tabs = [
    { id: 'todas', label: 'Todas' },
    { id: 'pendientes', label: 'Pendientes' },
    { id: 'recibidas', label: 'Recibidas' },
    { id: 'diferencias', label: 'Con diferencias' }
  ];
  const list = state.invoices
    .filter(inv => invoiceMatchesFilter(inv, invoiceFilter))
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

  const cards = list.map(inv => {
    const info = countedInfo(inv);
    const search = [inv.supplier, inv.number, inv.lines.map(l => `${l.name} ${l.barcode}`).join(' '), STATUS_LABEL[inv.status]].join(' ');
    return `<a class="invoice-card" href="#/factura/${inv.id}" data-search="${esc(search)}">
      <div class="invoice-main">
        <strong>${esc(inv.supplier || 'Proveedor sin nombre')}</strong>
        <span>Factura ${esc(inv.number || 's/n')} · ${fmtDate(inv.date)}</span>
        <small>${esc(invoiceSummary(inv))}</small>
        ${inv.expectedDate ? `<small>Llegada esperada: ${fmtDate(inv.expectedDate)}</small>` : ''}
      </div>
      <div class="invoice-side">
        ${statusChip(inv.status)}
        <span class="when">${info.counted}/${info.total} contados</span>
      </div>
    </a>`;
  }).join('');

  const empty = `<div class="empty">
    <div class="empty-icon">${icon('invoice', 'icon big')}</div>
    <h3>${state.invoices.length ? 'No hay facturas en este filtro' : 'Todavía no hay facturas'}</h3>
    <p>${state.invoices.length ? 'Prueba con otro filtro o busca por proveedor o número.' : 'Captura la primera factura con los artículos que deben llegar.'}</p>
    ${state.invoices.length ? '' : `<a class="btn primary" href="#/factura/nuevo">${icon('plus')} Nueva factura</a>`}
  </div>`;

  $('#app').innerHTML = `
    <div class="page-head">
      <div><h1>Facturas</h1><p>Lo que debe llegar, listo para comparar al recibir.</p></div>
      <div class="head-actions">
        <a class="btn primary" href="#/factura/nuevo">${icon('plus')} Nueva factura</a>
      </div>
    </div>
    <div class="toolbar">
      <div class="chips">
        ${tabs.map(tab => `<button type="button" class="chip-btn ${invoiceFilter === tab.id ? 'active' : ''}" data-action="filter-invoices" data-filter="${tab.id}">${tab.label} <span class="count">${counts[tab.id]}</span></button>`).join('')}
      </div>
      <label class="search">${icon('search')}<input id="inv-search" type="search" placeholder="Buscar proveedor, número o artículo" value="${esc(invoiceSearch)}" autocomplete="off"></label>
    </div>
    <div class="invoice-list" id="invoice-list">${cards || empty}</div>`;

  if (invoiceSearch) filterCards('#invoice-list .invoice-card', invoiceSearch);
}

function setInvoiceFilter(filter) {
  invoiceFilter = filter;
  renderInvoices();
}

/* ---------- Editor ---------- */
function blankLine() {
  return {
    id: uid('ln'), barcode: '', name: '', unit: 'pza', qty: 1, perishable: false,
    expiry: '', receivedQty: null, receivedExpiry: '', counted: false, note: '', extra: false
  };
}

function blankInvoice() {
  return {
    id: uid('inv'), supplier: '', number: '', date: todayISO(), expectedDate: todayISO(), notes: '',
    status: 'pendiente', lines: [blankLine()], createdAt: '', updatedAt: '', receivedAt: null
  };
}

function openNewInvoice() {
  editor = { isNew: true, draft: blankInvoice() };
}

function openEditInvoice(id) {
  const inv = findInvoice(id);
  if (!inv) return false;
  editor = { isNew: false, draft: deepClone(inv) };
  return true;
}

function editorLineHTML(line, index) {
  return `<article class="line-card" data-line-card="${line.id}">
    <div class="line-top">
      <span class="line-num">Artículo #${index + 1}</span>
      <button type="button" class="icon-btn danger-ghost" data-action="remove-line" data-line="${line.id}" aria-label="Quitar artículo">${icon('trash')}</button>
    </div>
    <div class="grid line-grid">
      <label class="field span-2"><span>Código de barras</span>
        <div class="input-with-btn">
          <input data-line="${line.id}" data-line-field="barcode" value="${esc(line.barcode)}" placeholder="Escanea o escribe el código" inputmode="numeric" autocomplete="off">
          <button type="button" class="icon-btn" data-action="scan-line" data-line="${line.id}" aria-label="Escanear código">${icon('scan')}</button>
        </div>
      </label>
      <label class="field span-2"><span>Artículo *</span>
        <input data-line="${line.id}" data-line-field="name" value="${esc(line.name)}" placeholder="Nombre del producto" autocomplete="off">
      </label>
      <label class="field"><span>Cantidad *</span>
        <input type="number" min="0" step="0.01" inputmode="decimal" data-line="${line.id}" data-line-field="qty" value="${esc(line.qty)}">
      </label>
      <label class="field"><span>Unidad</span>
        <select data-line="${line.id}" data-line-field="unit">${UNITS.map(u => `<option ${u === line.unit ? 'selected' : ''}>${u}</option>`).join('')}</select>
      </label>
      <label class="check span-2"><input type="checkbox" data-line="${line.id}" data-line-field="perishable" ${line.perishable ? 'checked' : ''}> Perecedero: pedir caducidad al recibir</label>
      ${line.perishable ? `<label class="field span-2"><span>Caducidad impresa (opcional)</span><input type="date" data-line="${line.id}" data-line-field="expiry" value="${esc(line.expiry)}"></label>` : ''}
    </div>
  </article>`;
}

function renderInvoiceEditor() {
  if (!editor) return;
  const d = editor.draft;
  const suppliers = supplierList();
  const backHash = editor.isNew ? '#/facturas' : `#/factura/${d.id}`;
  const totalUnits = d.lines.reduce((sum, line) => sum + (Number(line.qty) || 0), 0);

  $('#app').innerHTML = `
    <div class="page-head">
      <div>
        <a class="link-back" href="${backHash}">${icon('back')} ${editor.isNew ? 'Facturas' : 'Volver a la factura'}</a>
        <h1>${editor.isNew ? 'Nueva factura' : 'Editar factura'}</h1>
        <p>${editor.isNew ? 'Captura o escanea lo que debe llegar. Al recibir podrás comparar.' : 'Corrige cualquier dato mal capturado y guarda los cambios.'}</p>
      </div>
    </div>
    <form id="invoice-form" class="stack" novalidate>
      <section class="card">
        <div class="card-head"><h2 class="card-title">Datos de la factura</h2><span class="hint">${d.lines.length} línea${d.lines.length === 1 ? '' : 's'} · ${fmtQty(totalUnits)} unidad${totalUnits === 1 ? '' : 'es'}</span></div>
        <div class="grid two">
          <label class="field"><span>Proveedor *</span>
            <input data-edit="supplier" value="${esc(d.supplier)}" placeholder="Nombre del proveedor" list="suppliers-list" autocomplete="off">
            <datalist id="suppliers-list">${suppliers.map(s => `<option value="${esc(s)}"></option>`).join('')}</datalist>
          </label>
          <label class="field"><span>Número de factura *</span>
            <div class="input-with-btn">
              <input data-edit="number" value="${esc(d.number)}" placeholder="Ej. A-10245" autocomplete="off">
              <button type="button" class="icon-btn" data-action="scan-invoice-number" aria-label="Escanear número de factura">${icon('scan')}</button>
            </div>
          </label>
          <label class="field"><span>Fecha de factura</span><input type="date" data-edit="date" value="${esc(d.date)}"></label>
          <label class="field"><span>Llegada esperada</span><input type="date" data-edit="expectedDate" value="${esc(d.expectedDate)}"></label>
        </div>
        <label class="field" style="margin-top:12px"><span>Notas</span><textarea data-edit="notes" rows="2" placeholder="Transportista, observaciones del pedido, etc.">${esc(d.notes)}</textarea></label>
      </section>

      <section class="card">
        <div class="card-head">
          <h2 class="card-title">Artículos</h2>
          <button type="button" class="btn secondary small" data-action="scan-add">${icon('scan')} Escanear y agregar</button>
        </div>
        <div class="lines" id="editor-lines">${d.lines.map(editorLineHTML).join('')}</div>
        <div class="row-actions">
          <button type="button" class="btn ghost" data-action="add-line">${icon('plus')} Agregar línea manual</button>
        </div>
        <p class="hint" style="margin-top:10px">Escanea el código de cada artículo. Si ya existe, la app recuerda su nombre y unidad; si es nuevo, completa el nombre. El escáner lee códigos de barras o QR: los datos impresos sin código se escriben a mano.</p>
      </section>

      <div class="sticky-actions">
        <a class="btn ghost" href="${backHash}">Cancelar</a>
        <button class="btn primary" type="submit">${editor.isNew ? 'Guardar factura' : 'Guardar cambios'}</button>
      </div>
    </form>`;
}

function addEditorLine() {
  if (!editor) return;
  const line = blankLine();
  editor.draft.lines.push(line);
  dirty = true;
  renderInvoiceEditor();
  requestAnimationFrame(() => {
    const card = $(`[data-line-card="${line.id}"]`);
    if (!card) return;
    const input = $('[data-line-field="name"]', card);
    if (input) input.focus({ preventScroll: true });
    card.scrollIntoView({ block: 'center' });
  });
}

function removeEditorLine(id) {
  if (!editor) return;
  editor.draft.lines = editor.draft.lines.filter(line => line.id !== id);
  if (!editor.draft.lines.length) editor.draft.lines.push(blankLine());
  dirty = true;
  renderInvoiceEditor();
}

function scanEditorLine(id) {
  if (!editor) return;
  openScanner({
    title: 'Escanear artículo',
    onCode: code => {
      const line = editor && editor.draft.lines.find(l => l.id === id);
      if (!line) return;
      line.barcode = code;
      const known = applyProductToLine(line);
      dirty = true;
      renderInvoiceEditor();
      if (!known) {
        toast('Código capturado. Escribe el nombre del producto.');
        const card = $(`[data-line-card="${id}"]`);
        const input = card && $('[data-line-field="name"]', card);
        if (input) setTimeout(() => input.focus({ preventScroll: true }), 60);
      }
    }
  });
}

function scanInvoiceNumber() {
  if (!editor) return;
  openScanner({
    title: 'Escanear número de factura',
    onCode: code => {
      if (!editor) return;
      editor.draft.number = code.slice(0, 120);
      dirty = true;
      renderInvoiceEditor();
      toast('Número de factura capturado');
    }
  });
}

function startScanAdd() {
  if (!editor) return;
  openScanner({
    title: 'Escanear artículos',
    continuous: true,
    onCode: code => {
      if (!editor) return;
      const d = editor.draft;
      let line = d.lines.find(l => l.barcode === code && !l.extra);
      if (line) {
        line.qty = roundQty((Number(line.qty) || 0) + 1);
        toast(`${line.name || code} · ${fmtQty(line.qty)} ${line.unit}`);
      } else {
        line = blankLine();
        line.barcode = code;
        applyProductToLine(line);
        d.lines.push(line);
        toast(line.name ? `Agregado: ${line.name}` : 'Producto nuevo: completa el nombre');
      }
      dirty = true;
      renderInvoiceEditor();
    },
    onClose: () => renderInvoiceEditor()
  });
}

function saveInvoiceEditor() {
  if (!editor) return;
  const d = editor.draft;
  const form = $('#invoice-form');

  if (form) {
    $$('[data-edit]', form).forEach(el => { d[el.dataset.edit] = el.value; });
    $$('[data-line-card]', form).forEach(card => {
      const line = d.lines.find(l => l.id === card.dataset.lineCard);
      if (!line) return;
      $$('[data-line-field]', card).forEach(el => {
        const field = el.dataset.lineField;
        if (field === 'perishable') line.perishable = el.checked;
        else line[field] = el.value;
      });
    });
  }

  const errors = [];
  if (!String(d.supplier || '').trim()) errors.push('Escribe el proveedor.');
  if (!String(d.number || '').trim()) errors.push('Escribe el número de factura.');

  const usable = d.lines.filter(l => String(l.name || '').trim() || String(l.barcode || '').trim());
  if (!usable.length) errors.push('Agrega al menos un artículo con nombre o código.');
  usable.forEach((line, index) => {
    if (!String(line.name || '').trim()) errors.push(`Completa el nombre del artículo #${index + 1}.`);
    if (!(Number(line.qty) > 0)) errors.push(`La cantidad del artículo #${index + 1} debe ser mayor a 0.`);
  });
  if (errors.length) {
    toast(errors[0], 'error');
    return;
  }

  d.supplier = String(d.supplier).trim();
  d.number = String(d.number).trim();
  d.notes = String(d.notes || '').trim();
  d.date = d.date || todayISO();
  d.expectedDate = d.expectedDate || '';
  d.lines = usable.map(line => ({
    ...line,
    barcode: String(line.barcode || '').trim(),
    name: String(line.name || '').trim(),
    unit: UNITS.includes(line.unit) ? line.unit : 'pza',
    qty: roundQty(Number(line.qty) || 0),
    expiry: line.expiry || '',
    receivedQty: line.receivedQty == null || line.receivedQty === '' ? null : roundQty(Number(line.receivedQty)),
    note: String(line.note || '')
  }));

  const now = new Date().toISOString();
  const existing = findInvoice(d.id);
  if (existing) {
    const wasReceived = !!existing.receivedAt;
    Object.assign(existing, {
      supplier: d.supplier,
      number: d.number,
      date: d.date,
      expectedDate: d.expectedDate,
      notes: d.notes,
      lines: deepClone(d.lines),
      updatedAt: now
    });
    if (existing.receivedAt) existing.status = computedStatus(existing);
    log(wasReceived ? 'Factura corregida' : 'Factura editada', `Factura ${existing.number} · ${existing.supplier}`, existing.id);
  } else {
    d.createdAt = now;
    d.updatedAt = now;
    d.receivedAt = null;
    d.status = 'pendiente';
    state.invoices.push(d);
    log('Factura creada', `Factura ${d.number} · ${d.supplier}`, d.id);
  }
  d.lines.forEach(line => learnProduct(line));
  saveDB();
  dirty = false;
  toast(existing ? 'Cambios guardados' : 'Factura guardada', 'ok');
  editor = null;
  location.hash = '#/factura/' + d.id;
}
