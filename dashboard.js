'use strict';

function renderDashboard() {
  const app = $('#app');
  const invoices = state.invoices;
  const pending = invoices.filter(inv => inv.status === 'pendiente' || inv.status === 'parcial');
  const diffs = invoices.filter(inv => inv.status === 'diferencias');
  const lots = getLots();
  const expired = lots.filter(lot => lot.expiry && daysUntil(lot.expiry) < 0);
  const soon = lots.filter(lot => {
    if (!lot.expiry) return false;
    const d = daysUntil(lot.expiry);
    return d != null && d >= 0 && d <= 7;
  });
  const todayText = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  const todayCapital = todayText.charAt(0).toUpperCase() + todayText.slice(1);

  if (!invoices.length && !lots.length) {
    app.innerHTML = `
      <section class="hero">
        <div class="hero-icon">${icon('box', 'icon huge')}</div>
        <h1>Tu control de mercancía, en orden</h1>
        <p>Escanea la factura, recibe la mercancía y revisa caducidades de perecederos desde un solo lugar. También puedes corregir cualquier dato cuando lo necesites.</p>
        <div class="hero-actions">
          <a class="btn primary" href="#/factura/nuevo">${icon('plus')} Nueva factura</a>
          <button class="btn secondary" type="button" data-action="start-scan">${icon('scan')} Escanear</button>
          <button class="btn ghost" type="button" data-action="load-demo">Ver ejemplo</button>
        </div>
        <ol class="steps">
          <li><b>1</b><span><strong>Captura o escanea la factura.</strong> Registra proveedor, número y los artículos que deben llegar.</span></li>
          <li><b>2</b><span><strong>Recibe y verifica.</strong> Marca lo que realmente llegó, anota faltantes y captura la caducidad de perecederos.</span></li>
          <li><b>3</b><span><strong>Revisa y corrige.</strong> Consulta vencimientos y edita cualquier dato mal capturado.</span></li>
        </ol>
      </section>`;
    return;
  }

  const alertHtml = [
    expired.length ? `<button type="button" class="alert-line red" data-action="go-expiries" data-filter="vencidos">${icon('alert')}<span><strong>${expired.length} artículo${expired.length === 1 ? '' : 's'} vencido${expired.length === 1 ? '' : 's'}.</strong> Revisa las caducidades y retira lo que corresponda.</span></button>` : '',
    soon.length ? `<button type="button" class="alert-line" data-action="go-expiries" data-filter="7">${icon('clock')}<span><strong>${soon.length} por vencer</strong> en los próximos 7 días.</span></button>` : '',
    diffs.length ? `<button type="button" class="alert-line" data-action="go-receptions" data-filter="diferencias">${icon('box')}<span><strong>${diffs.length} recepción${diffs.length === 1 ? '' : 'es'} con diferencias.</strong> Revisa faltantes o sobrantes.</span></button>` : ''
  ].filter(Boolean).join('');

  const recent = [...invoices].sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)).slice(0, 5);
  const recentHtml = recent.length ? recent.map(inv => {
    const info = countedInfo(inv);
    return `<a class="invoice-card" href="#/factura/${inv.id}">
      <div class="invoice-main">
        <strong>${esc(inv.supplier || 'Proveedor sin nombre')}</strong>
        <span>Factura ${esc(inv.number || 's/n')} · ${fmtDate(inv.date)}</span>
        <small>${esc(invoiceSummary(inv))}</small>
      </div>
      <div class="invoice-side">
        ${statusChip(inv.status)}
        <span class="when">${info.counted}/${info.total} contados</span>
      </div>
    </a>`;
  }).join('') : `<div class="empty"><p>No hay facturas todavía.</p><a class="btn primary small" href="#/factura/nuevo">Crear la primera</a></div>`;

  const upcoming = lots.filter(lot => lot.expiry).slice(0, 5);
  const upcomingHtml = upcoming.length ? upcoming.map(lot => {
    const st = lotStatus(lot);
    return `<a class="expiry-row" href="#/caducidades">
      <div class="expiry-date ${st.key}"><strong>${fmtDate(lot.expiry)}</strong><span>${st.label}</span></div>
      <div class="expiry-info">
        <strong>${esc(lot.name)}</strong>
        <span>${fmtQty(lot.qty)} ${esc(lot.unit)} · ${esc(lot.supplier || 'Sin proveedor')} · Factura ${esc(lot.number || 's/n')}</span>
      </div>
    </a>`;
  }).join('') : `<div class="empty"><p>Sin caducidades registradas. Se capturan al recibir artículos perecederos.</p></div>`;

  app.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Inicio</h1>
        <p>${esc(todayCapital)} · Resumen de mercancía</p>
      </div>
      <div class="head-actions">
        <a class="btn primary small" href="#/factura/nuevo">${icon('plus')} Nueva factura</a>
        <a class="btn ghost small" href="#/recepciones">${icon('box')} Recibir</a>
      </div>
    </div>

    <section class="stats">
      <button type="button" class="stat" data-action="go-invoices" data-filter="pendientes">
        <span class="stat-icon">${icon('invoice')}</span>
        <strong>${pending.length}</strong>
        <span>Pendientes de recibir</span>
      </button>
      <button type="button" class="stat alert" data-action="go-expiries" data-filter="7">
        <span class="stat-icon">${icon('clock')}</span>
        <strong>${soon.length}</strong>
        <span>Por vencer (7 días)</span>
      </button>
      <button type="button" class="stat danger" data-action="go-expiries" data-filter="vencidos">
        <span class="stat-icon">${icon('alert')}</span>
        <strong>${expired.length}</strong>
        <span>Vencidos</span>
      </button>
      <button type="button" class="stat info" data-action="go-receptions" data-filter="diferencias">
        <span class="stat-icon">${icon('box')}</span>
        <strong>${diffs.length}</strong>
        <span>Con diferencias</span>
      </button>
    </section>

    ${alertHtml ? `<div class="stack" style="margin-bottom:16px">${alertHtml}</div>` : ''}

    <div class="dash-grid">
      <section class="card">
        <div class="card-head">
          <h2 class="card-title">Últimas facturas</h2>
          <a href="#/facturas" class="hint"><strong>Ver todas →</strong></a>
        </div>
        <div class="invoice-list">${recentHtml}</div>
      </section>
      <section class="card">
        <div class="card-head">
          <h2 class="card-title">Próximas caducidades</h2>
          <a href="#/caducidades" class="hint"><strong>Ver todas →</strong></a>
        </div>
        <div class="expiry-list">${upcomingHtml}</div>
        <div class="legend">
          <span><i class="dot red"></i>Vencido</span>
          <span><i class="dot amber"></i>≤ 7 días</span>
          <span><i class="dot"></i>Vigente</span>
          <span><i class="dot gray"></i>Sin fecha</span>
        </div>
      </section>
    </div>`;
}
