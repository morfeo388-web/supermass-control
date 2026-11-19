'use strict';

let expiryFilter = 'todos';
let expirySearch = '';

function getLots() {
  const lots = [];
  for (const inv of state.invoices) {
    if (!inv.receivedAt) continue;
    for (const line of inv.lines) {
      const qty = Number(line.receivedQty) || 0;
      if (qty <= 0) continue;
      if (!line.perishable && !line.receivedExpiry) continue;
      lots.push({
        invoiceId: inv.id,
        lineId: line.id,
        supplier: inv.supplier,
        number: inv.number,
        receivedAt: inv.receivedAt,
        name: line.name,
        barcode: line.barcode,
        unit: line.unit,
        qty,
        expiry: line.receivedExpiry || '',
        perishable: !!line.perishable,
        note: line.note || '',
        extra: !!line.extra
      });
    }
  }
  lots.sort((a, b) => {
    const da = a.expiry ? daysUntil(a.expiry) : 99999;
    const db = b.expiry ? daysUntil(b.expiry) : 99999;
    return da - db || String(a.name).localeCompare(String(b.name), 'es');
  });
  return lots;
}

function lotStatus(lot) {
  if (!lot.expiry) return { key: 'sin', label: 'Sin caducidad' };
  const d = daysUntil(lot.expiry);
  if (d < 0) return { key: 'vencido', label: `Vencido hace ${Math.abs(d)} día${Math.abs(d) === 1 ? '' : 's'}` };
  if (d === 0) return { key: 'critico', label: 'Vence hoy' };
  if (d <= 3) return { key: 'critico', label: `En ${d} día${d === 1 ? '' : 's'}` };
  if (d <= 7) return { key: 'pronto', label: `En ${d} días` };
  return { key: 'ok', label: `En ${d} días` };
}

function matchExpiryFilter(lot, filter) {
  if (filter === 'vencidos') return !!lot.expiry && daysUntil(lot.expiry) < 0;
  if (filter === '7') {
    if (!lot.expiry) return false;
    const d = daysUntil(lot.expiry);
    return d != null && d >= 0 && d <= 7;
  }
  if (filter === '30') {
    if (!lot.expiry) return false;
    const d = daysUntil(lot.expiry);
    return d != null && d >= 0 && d <= 30;
  }
  if (filter === 'sin') return !lot.expiry;
  return true;
}

function renderExpiries() {
  const lots = getLots();
  const counts = {
    todos: lots.length,
    vencidos: lots.filter(lot => matchExpiryFilter(lot, 'vencidos')).length,
    siete: lots.filter(lot => matchExpiryFilter(lot, '7')).length,
    treinta: lots.filter(lot => matchExpiryFilter(lot, '30')).length,
    sin: lots.filter(lot => matchExpiryFilter(lot, 'sin')).length
  };
  const tabs = [
    { id: 'todos', label: 'Todos', count: counts.todos },
    { id: 'vencidos', label: 'Vencidos', count: counts.vencidos },
    { id: '7', label: '≤ 7 días', count: counts.siete },
    { id: '30', label: '≤ 30 días', count: counts.treinta },
    { id: 'sin', label: 'Sin caducidad', count: counts.sin }
  ];
  const filtered = lots.filter(lot => matchExpiryFilter(lot, expiryFilter));

  const rows = filtered.map(lot => {
    const st = lotStatus(lot);
    const search = [lot.name, lot.barcode, lot.supplier, lot.number, st.label].join(' ');
    return `<div class="expiry-row" data-search="${esc(search)}">
      <div class="expiry-date ${st.key}"><strong>${lot.expiry ? fmtDate(lot.expiry) : '—'}</strong><span>${st.label}</span></div>
      <div class="expiry-info">
        <strong>${esc(lot.name)}</strong>
        <span>${fmtQty(lot.qty)} ${esc(lot.unit)} · ${esc(lot.supplier || 'Sin proveedor')} · Factura ${esc(lot.number || 's/n')}</span>
        <small>Recibido ${fmtDate(isoToLocalDate(lot.receivedAt))}${lot.extra ? ' · No facturado' : ''}${lot.note ? ` · ${esc(lot.note)}` : ''}</small>
      </div>
      <button type="button" class="icon-btn" data-action="edit-expiry" data-invoice="${lot.invoiceId}" data-line="${lot.lineId}" aria-label="Corregir caducidad">${icon('edit')}</button>
    </div>`;
  }).join('');

  const empty = `<div class="empty">
    <div class="empty-icon">${icon('clock', 'icon big')}</div>
    <h3>${lots.length ? 'No hay artículos en este filtro' : 'Sin caducidades registradas'}</h3>
    <p>${lots.length ? 'Prueba con otro filtro o busca un artículo.' : 'Las caducidades aparecen al finalizar una recepción con artículos perecederos. Si falta alguna fecha, podrás completarla aquí.'}</p>
    ${lots.length ? '' : `<a class="btn primary" href="#/recepciones">${icon('box')} Ir a recepción</a>`}
  </div>`;

  $('#app').innerHTML = `
    <div class="page-head">
      <div><h1>Caducidades</h1><p>Control de perecederos recibidos y alertas de vencimiento.</p></div>
      <div class="head-actions"><button type="button" class="btn ghost" data-action="export-expiries">${icon('download')} Exportar CSV</button></div>
    </div>
    <div class="toolbar">
      <div class="chips">
        ${tabs.map(tab => `<button type="button" class="chip-btn ${expiryFilter === tab.id ? 'active' : ''}" data-action="filter-expiry" data-filter="${tab.id}">${tab.label} <span class="count">${tab.count}</span></button>`).join('')}
      </div>
      <label class="search">${icon('search')}<input id="exp-search" type="search" placeholder="Buscar artículo, proveedor o factura" value="${esc(expirySearch)}" autocomplete="off"></label>
    </div>
    <section class="card">
      <div class="card-head"><h2 class="card-title">Artículos con caducidad (${filtered.length})</h2><span class="hint">Ordenados por fecha</span></div>
      <div class="expiry-list" id="expiry-list">${rows || empty}</div>
      <div class="legend">
        <span><i class="dot red"></i>Vencido</span>
        <span><i class="dot amber"></i>≤ 7 días</span>
        <span><i class="dot"></i>Vigente</span>
        <span><i class="dot gray"></i>Sin fecha</span>
      </div>
      <p class="hint" style="margin-top:10px">Toca el lápiz para corregir una fecha mal capturada. La cantidad se corrige desde la recepción de la factura.</p>
    </section>`;

  if (expirySearch) filterCards('#expiry-list .expiry-row', expirySearch);
}

function setExpiryFilter(filter) {
  expiryFilter = filter;
  renderExpiries();
}

async function editExpiry(invoiceId, lineId) {
  const inv = findInvoice(invoiceId);
  if (!inv) return;
  const line = inv.lines.find(item => item.id === lineId);
  if (!line) return;
  const result = await showDialog({
    title: 'Corregir caducidad',
    body: `<p><strong>${esc(line.name)}</strong><br><span class="hint">${esc(inv.supplier || 'Sin proveedor')} · Factura ${esc(inv.number || 's/n')}</span></p>`,
    fields: [{ name: 'expiry', label: 'Fecha de caducidad', type: 'date', value: line.receivedExpiry }],
    actions: [
      { id: 'save', label: 'Guardar', style: 'primary' },
      { id: 'clear', label: 'Quitar fecha', style: 'secondary' },
      { id: 'cancel', label: 'Cancelar', style: 'ghost' }
    ]
  });
  if (!result || result.action === 'cancel') return;
  const before = line.receivedExpiry || 'sin fecha';
  line.receivedExpiry = result.action === 'clear' ? '' : (result.values.expiry || '');
  inv.updatedAt = new Date().toISOString();
  log('Caducidad corregida', `${line.name}: ${before} → ${line.receivedExpiry ? fmtDate(line.receivedExpiry) : 'sin fecha'}`, inv.id);
  saveDB();
  renderExpiries();
  toast('Caducidad actualizada', 'ok');
}

function exportExpiriesCSV() {
  const lots = getLots().filter(lot => matchExpiryFilter(lot, expiryFilter));
  if (!lots.length) {
    toast('No hay artículos para exportar con este filtro');
    return;
  }
  const rows = lots.map(lot => {
    const st = lotStatus(lot);
    return [
      lot.barcode,
      lot.name,
      lot.qty,
      lot.unit,
      lot.expiry ? fmtDate(lot.expiry) : '',
      lot.expiry ? daysUntil(lot.expiry) : '',
      st.label,
      lot.supplier,
      lot.number,
      fmtDate(isoToLocalDate(lot.receivedAt)),
      lot.note
    ];
  });
  downloadCSV(
    `supermass-caducidades-${todayISO()}.csv`,
    ['Código', 'Artículo', 'Cantidad', 'Unidad', 'Caducidad', 'Días restantes', 'Estado', 'Proveedor', 'Factura', 'Fecha recepción', 'Nota'],
    rows
  );
  toast('CSV de caducidades descargado', 'ok');
}
