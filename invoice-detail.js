'use strict';

function deltaBadgeHTML(line) {
  if (line.extra) return `<span class="badge info">Adicional +${fmtQty(line.receivedQty)}</span>`;
  if (!line.counted) return `<span class="badge">Sin contar</span>`;
  const delta = lineDelta(line);
  if (delta == null) return `<span class="badge">Sin cantidad</span>`;
  if (delta === 0) return `<span class="badge ok">Completo</span>`;
  return delta < 0
    ? `<span class="badge danger">Faltan ${fmtQty(Math.abs(delta))}</span>`
    : `<span class="badge warn">Sobran ${fmtQty(delta)}</span>`;
}

function renderInvoiceDetail(id) {
  const inv = findInvoice(id);
  if (!inv) {
    $('#app').innerHTML = `<div class="empty">
      <div class="empty-icon">${icon('alert', 'icon big')}</div>
      <h3>Factura no encontrada</h3>
      <p>Puede que se haya eliminado en este dispositivo.</p>
      <a class="btn primary" href="#/facturas">Volver a facturas</a>
    </div>`;
    return;
  }

  const received = !!inv.receivedAt;
  const info = countedInfo(inv);
  const pendingLines = inv.lines.filter(line => !line.extra && !line.counted);
  const missing = inv.lines.filter(line => !line.extra && line.counted && (lineDelta(line) || 0) < 0);
  const extra = inv.lines.filter(line => line.extra || (!line.extra && line.counted && (lineDelta(line) || 0) > 0));
  const expectedUnits = inv.lines.filter(l => !l.extra).reduce((sum, line) => sum + (Number(line.qty) || 0), 0);
  const receivedUnits = inv.lines.reduce((sum, line) => sum + (Number(line.receivedQty) || 0), 0);

  let alertHtml = '';
  if (!received) {
    alertHtml = `<div class="alert-line">${icon('clock')}<span>Esta mercancía está <strong>pendiente de recibir</strong>. Abre la recepción para marcar lo que llegue y capturar caducidades.</span></div>`;
  } else if (missing.length || extra.length) {
    const parts = [];
    if (missing.length) parts.push(`${missing.length} artículo${missing.length === 1 ? '' : 's'} con faltante`);
    if (extra.length) parts.push(`${extra.length} con sobrante o adicional`);
    alertHtml = `<div class="alert-line red">${icon('alert')}<span><strong>Recepción con diferencias:</strong> ${parts.join(' y ')}. Puedes corregir cantidades o caducidades en cualquier momento.</span></div>`;
  } else {
    alertHtml = `<div class="alert-line ok">${icon('check')}<span><strong>Recepción completa.</strong> Todo lo facturado coincide con lo recibido.</span></div>`;
  }
  if (pendingLines.length) {
    alertHtml += `<div class="alert-line">${icon('clock')}<span><strong>${pendingLines.length} línea${pendingLines.length === 1 ? '' : 's'} sin contar.</strong> Termina la recepción o márcalas como no recibidas.</span></div>`;
  }

  const rows = inv.lines.map((line, index) => {
    const expiryCell = line.receivedExpiry
      ? fmtDate(line.receivedExpiry)
      : line.perishable
        ? (line.expiry ? `<span class="muted">Factura: ${fmtDate(line.expiry)}</span>` : '<span class="muted">Sin caducidad</span>')
        : '—';
    return `<tr>
      <td>${index + 1}</td>
      <td class="prod">
        <strong>${esc(line.name)}</strong>
        <small>${esc(line.barcode || 'Sin código')}${line.extra ? ' · No facturado' : ''}</small>
        ${line.note ? `<small class="warn-text">Nota: ${esc(line.note)}</small>` : ''}
      </td>
      <td class="num">${line.extra ? '—' : `${fmtQty(line.qty)} ${esc(line.unit)}`}</td>
      <td class="num">${received || line.counted ? `${fmtQty(line.receivedQty)} ${esc(line.unit)}` : '—'}</td>
      <td>${expiryCell}</td>
      <td>${received || line.counted ? deltaBadgeHTML(line) : '<span class="badge">Pendiente</span>'}</td>
    </tr>`;
  }).join('');

  const events = state.audit.filter(event => event.invoiceId === inv.id).slice(0, 8);
  const eventHtml = events.length ? `<section class="card">
    <h2>Historial de cambios</h2>
    <div class="list">
      ${events.map(event => `<div class="list-row">
        <div><div class="title">${esc(event.action)}</div><div class="sub">${esc(event.detail || '')}</div></div>
        <span class="sub">${fmtDateTime(event.ts)}</span>
      </div>`).join('')}
    </div>
  </section>` : '';

  $('#app').innerHTML = `
    <div class="page-head">
      <div>
        <a class="link-back" href="#/facturas">${icon('back')} Facturas</a>
        <h1>Factura ${esc(inv.number || 's/n')}</h1>
        <p>${esc(inv.supplier || 'Proveedor sin nombre')}</p>
      </div>
      <div class="head-actions">
        <a class="btn primary" href="#/recepcion/${inv.id}">${icon('box')} ${received ? 'Revisar recepción' : 'Recibir mercancía'}</a>
        <a class="btn ghost" href="#/factura/${inv.id}/editar">${icon('edit')} Editar</a>
      </div>
    </div>

    <div class="stack">
      <section class="card">
        <div class="detail-hero">
          <div>
            <h2>${esc(inv.supplier || 'Proveedor sin nombre')}</h2>
            <div class="detail-meta">${statusChip(inv.status)}<span>Factura ${esc(inv.number || 's/n')}</span><span>${fmtDate(inv.date)}</span></div>
          </div>
          <div class="head-actions">
            <button type="button" class="btn ghost small" data-action="print-invoice" data-id="${inv.id}">${icon('print')} Imprimir</button>
            <button type="button" class="btn danger-ghost small" data-action="delete-invoice" data-id="${inv.id}">${icon('trash')} Eliminar</button>
          </div>
        </div>
        ${alertHtml}
        <div class="info-grid" style="margin-top:16px">
          <div class="item"><span>Proveedor</span><strong>${esc(inv.supplier || '—')}</strong></div>
          <div class="item"><span>Número</span><strong>${esc(inv.number || '—')}</strong></div>
          <div class="item"><span>Fecha de factura</span><strong>${fmtDate(inv.date)}</strong></div>
          <div class="item"><span>Llegada esperada</span><strong>${inv.expectedDate ? fmtDate(inv.expectedDate) : '—'}</strong></div>
          <div class="item"><span>Recepción</span><strong>${received ? fmtDateTime(inv.receivedAt) : 'Pendiente'}</strong></div>
          <div class="item"><span>Avance</span><strong>${info.counted} de ${info.total} líneas contadas</strong></div>
          <div class="item"><span>Unidades esperadas</span><strong>${fmtQty(expectedUnits)}</strong></div>
          <div class="item"><span>Unidades recibidas</span><strong>${received ? fmtQty(receivedUnits) : '—'}</strong></div>
        </div>
        ${inv.notes ? `<div class="rec-note"><strong>Notas:</strong> ${esc(inv.notes)}</div>` : ''}
      </section>

      <section class="card">
        <div class="card-head"><h2 class="card-title">Artículos (${inv.lines.length})</h2><span class="hint">Esperado vs. recibido</span></div>
        <div class="table-wrap">
          <table class="lines-table">
            <thead><tr><th>#</th><th>Artículo</th><th class="num">Esperado</th><th class="num">Recibido</th><th>Caducidad</th><th>Estado</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>

      ${eventHtml}
    </div>`;
}

function printInvoiceById(id) {
  const inv = findInvoice(id);
  if (!inv) return;
  const received = !!inv.receivedAt;
  const rows = inv.lines.map((line, index) => `<tr>
    <td>${index + 1}</td>
    <td>${esc(line.name)}${line.barcode ? `<br><small>${esc(line.barcode)}</small>` : ''}${line.extra ? '<br><small>No facturado</small>' : ''}</td>
    <td>${line.extra ? '—' : `${fmtQty(line.qty)} ${esc(line.unit)}`}</td>
    <td class="blank">${received ? fmtQty(line.receivedQty) : ''}</td>
    <td class="blank">${received && line.receivedExpiry ? fmtDate(line.receivedExpiry) : ''}</td>
    <td class="blank">${received && line.counted && lineDelta(line) === 0 ? '✓' : ''}</td>
  </tr>`).join('');

  const area = $('#print-area');
  area.innerHTML = `<div class="print-head">
    <div class="print-brand">Super<br>Mass</div>
    <div>
      <h1>Lista de chequeo de mercancía</h1>
      <p><strong>Proveedor:</strong> ${esc(inv.supplier || '—')} &nbsp; · &nbsp; <strong>Factura:</strong> ${esc(inv.number || 's/n')}</p>
      <p><strong>Fecha factura:</strong> ${fmtDate(inv.date)} &nbsp; · &nbsp; <strong>Llegada esperada:</strong> ${inv.expectedDate ? fmtDate(inv.expectedDate) : '—'} &nbsp; · &nbsp; <strong>Impreso:</strong> ${fmtDateTime(new Date().toISOString())}</p>
    </div>
  </div>
  <table class="print-table">
    <thead><tr><th>#</th><th>Artículo</th><th>Esperado</th><th>Recibido</th><th>Caducidad</th><th>OK</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="print-note">Marca lo que llega, anota faltantes, sobrantes, daños o caducidades y después captura el resultado en la app. Los artículos perecederos deben llevar fecha de caducidad.</p>
  <div class="print-foot"><span>Recibió: ______________________________</span><span>Fecha y hora: ____________________</span></div>`;
  window.addEventListener('afterprint', () => { area.innerHTML = ''; }, { once: true });
  setTimeout(() => window.print(), 60);
  setTimeout(() => { area.innerHTML = ''; }, 8000);
}

async function deleteInvoice(id) {
  const inv = findInvoice(id);
  if (!inv) return;
  const ok = await confirmDialog(
    'Eliminar factura',
    `<p>Se eliminará la factura <strong>${esc(inv.number || 's/n')}</strong> de <strong>${esc(inv.supplier || 'sin proveedor')}</strong> y sus registros de caducidades.</p><p>Esta acción no se puede deshacer.</p>`,
    'Eliminar factura',
    true
  );
  if (!ok) return;
  state.invoices = state.invoices.filter(item => item.id !== id);
  log('Factura eliminada', `Factura ${inv.number || 's/n'} · ${inv.supplier || 'sin proveedor'}`);
  saveDB();
  editor = null;
  toast('Factura eliminada');
  location.hash = '#/facturas';
}
