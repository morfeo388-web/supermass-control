'use strict';

let installPromptEvent = null;

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPromptEvent = event;
  const button = $('#install-btn');
  if (button) button.hidden = false;
});

function renderSettings() {
  const pending = state.invoices.filter(inv => inv.status === 'pendiente' || inv.status === 'parcial').length;
  const lots = getLots();
  const bytes = new Blob([JSON.stringify(state)]).size;
  const sizeText = bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

  $('#app').innerHTML = `
    <div class="page-head">
      <div><h1>Ajustes</h1><p>Respaldo, exportación y datos de esta app.</p></div>
    </div>

    <div class="stack">
      <section class="card">
        <h2>Respaldo</h2>
        <p class="hint">Los datos se guardan en este dispositivo y navegador. No hay sincronización automática entre teléfonos o computadoras. Descarga un respaldo para conservarlos o pasarlos a otro dispositivo.</p>
        <div class="list" style="margin-top:10px">
          <div class="list-row"><span><span class="title">Facturas</span><div class="sub">${state.invoices.length} guardadas · ${pending} pendientes</div></span><strong>${state.invoices.length}</strong></div>
          <div class="list-row"><span><span class="title">Artículos con caducidad</span><div class="sub">${lots.length} registros recibidos</div></span><strong>${lots.length}</strong></div>
          <div class="list-row"><span><span class="title">Productos recordados</span><div class="sub">Se autocompletan al escanear su código</div></span><strong>${Object.keys(state.products).length}</strong></div>
          <div class="list-row"><span><span class="title">Espacio usado</span><div class="sub">En este navegador</div></span><strong>${sizeText}</strong></div>
        </div>
        <div class="btn-row">
          <button type="button" class="btn primary" data-action="download-backup">${icon('download')} Descargar respaldo</button>
          <button type="button" class="btn secondary" data-action="restore-backup">${icon('upload')} Restaurar respaldo</button>
          <input type="file" id="restore-file" accept="application/json,.json" hidden>
        </div>
      </section>

      <section class="card">
        <h2>Exportar para revisar</h2>
        <p class="hint">Archivos CSV que abren en Excel o Google Sheets, con acentos y separador de columnas compatible.</p>
        <div class="btn-row">
          <button type="button" class="btn ghost" data-action="export-expiries">${icon('clock')} Caducidades CSV</button>
          <button type="button" class="btn ghost" data-action="export-differences">${icon('box')} Diferencias CSV</button>
        </div>
      </section>

      <section class="card">
        <h2>Instalar en el teléfono</h2>
        <p class="hint">Puedes usar la app desde el navegador o instalarla para abrirla como una aplicación. La cámara requiere permiso y conexión segura (HTTPS); si no está disponible, siempre puedes escribir el código a mano.</p>
        <div class="btn-row">
          <button type="button" class="btn secondary" id="install-btn" data-action="install-app" ${installPromptEvent ? '' : 'hidden'}>${icon('install')} Instalar app</button>
        </div>
        <p class="hint" style="margin-top:8px">${standalone ? 'La app ya está abierta en modo instalado.' : 'En Chrome o Edge: menú ⋮ → “Instalar aplicación”. En iPhone: Compartir → “Agregar a inicio”.'}</p>
      </section>

      <section class="card">
        <h2>Datos</h2>
        <p class="hint">Puedes cargar un ejemplo para probar el flujo completo o borrar todo lo guardado en este dispositivo.</p>
        <div class="btn-row">
          <button type="button" class="btn ghost" data-action="load-demo">Cargar datos de ejemplo</button>
          <button type="button" class="btn danger-ghost" data-action="clear-all">${icon('trash')} Borrar todos los datos</button>
        </div>
      </section>

      <section class="card">
        <h2>Acerca de</h2>
        <p class="hint">Super Mass · Control de mercancía · versión ${APP_VERSION}.<br>Escaneo con la cámara del dispositivo, recepción con diferencias, caducidades de perecederos y corrección de datos. Hecha para trabajar sin conexión una vez cargada; el respaldo es tu copia de seguridad.</p>
      </section>
    </div>`;
}

function goHomeAfterChange() {
  if ((location.hash || '#/inicio') === '#/inicio') {
    dirty = false;
    renderRoute();
  } else {
    location.hash = '#/inicio';
  }
}

function downloadBackup() {
  const payload = { app: 'supermass-control', version: 1, exportedAt: new Date().toISOString(), data: state };
  downloadFile(`supermass-respaldo-${todayISO()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  toast('Respaldo descargado', 'ok');
}

function mergeState(incoming) {
  const norm = normalizeState(incoming);
  for (const [code, product] of Object.entries(norm.products)) {
    state.products[code] = { ...(state.products[code] || {}), ...product };
  }
  const byId = new Map(state.invoices.map(inv => [inv.id, inv]));
  for (const inv of norm.invoices) {
    const current = byId.get(inv.id);
    if (!current) {
      state.invoices.push(inv);
      byId.set(inv.id, inv);
    } else if (new Date(inv.updatedAt) >= new Date(current.updatedAt)) {
      Object.assign(current, inv);
    }
  }
  const ids = new Set(state.audit.map(event => event.id));
  norm.audit.forEach(event => { if (!ids.has(event.id)) state.audit.push(event); });
  state.audit.sort((a, b) => new Date(b.ts) - new Date(a.ts));
  state.audit = state.audit.slice(0, 500);
}

async function handleRestoreFile(file) {
  if (!file) return;
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch (_) {
    toast('El archivo no es un respaldo válido', 'error');
    return;
  }
  const data = parsed && parsed.data ? parsed.data : parsed;
  if (!data || !Array.isArray(data.invoices)) {
    toast('El archivo no contiene facturas de esta app', 'error');
    return;
  }
  const normalized = normalizeState(data);
  const result = await showDialog({
    title: 'Restaurar respaldo',
    body: `<p>El archivo contiene <strong>${normalized.invoices.length}</strong> factura${normalized.invoices.length === 1 ? '' : 's'} y <strong>${Object.keys(normalized.products).length}</strong> producto${Object.keys(normalized.products).length === 1 ? '' : 's'} recordado${Object.keys(normalized.products).length === 1 ? '' : 's'}.</p><p><strong>Combinar</strong> conserva lo actual y añade o actualiza lo del archivo. <strong>Reemplazar</strong> borra lo actual y deja solo el respaldo.</p>`,
    actions: [
      { id: 'merge', label: 'Combinar', style: 'primary' },
      { id: 'replace', label: 'Reemplazar todo', style: 'danger' },
      { id: 'cancel', label: 'Cancelar', style: 'ghost' }
    ]
  });
  if (!result || result.action === 'cancel') return;
  if (result.action === 'replace') {
    state = normalized;
    log('Respaldo restaurado', 'Se reemplazaron todos los datos');
    saveDB();
    dirty = false;
    editor = null;
    rec = null;
    toast('Respaldo restaurado', 'ok');
    goHomeAfterChange();
  } else {
    mergeState(normalized);
    log('Respaldo combinado', `Se combinaron ${normalized.invoices.length} factura(s)`);
    saveDB();
    dirty = false;
    toast('Respaldo combinado', 'ok');
    renderSettings();
  }
}

function exportDifferencesCSV() {
  const rows = [];
  state.invoices
    .filter(inv => inv.receivedAt)
    .forEach(inv => {
      inv.lines.forEach(line => {
        const delta = lineDelta(line);
        const isDiff = line.extra || (delta != null && delta !== 0);
        const notCounted = !line.extra && !line.counted;
        if (!isDiff && !notCounted) return;
        rows.push([
          inv.supplier,
          inv.number,
          fmtDate(inv.date),
          line.name,
          line.barcode,
          line.extra ? 0 : line.qty,
          line.receivedQty,
          line.extra ? line.receivedQty : (delta == null ? '' : delta),
          line.unit,
          line.receivedExpiry ? fmtDate(line.receivedExpiry) : '',
          notCounted ? 'Sin contar' : (line.extra ? 'Adicional' : (delta < 0 ? 'Faltante' : 'Sobrante')),
          line.note
        ]);
      });
    });
  if (!rows.length) {
    toast('No hay diferencias registradas');
    return;
  }
  downloadCSV(
    `supermass-diferencias-${todayISO()}.csv`,
    ['Proveedor', 'Factura', 'Fecha factura', 'Artículo', 'Código', 'Esperado', 'Recibido', 'Diferencia', 'Unidad', 'Caducidad', 'Tipo', 'Nota'],
    rows
  );
  toast('CSV de diferencias descargado', 'ok');
}

function loadDemoData() {
  if (state.invoices.some(inv => inv.number === 'EJEMPLO-HUERTA')) {
    toast('Los datos de ejemplo ya están cargados');
    return;
  }
  const now = new Date().toISOString();
  const yesterday = addDaysISO(-1);
  const supplier1 = 'Distribuidora La Huerta';
  const inv1 = {
    id: uid('inv'),
    supplier: supplier1,
    number: 'EJEMPLO-HUERTA',
    date: todayISO(),
    expectedDate: todayISO(),
    notes: 'Pedido de ejemplo: frutas y verduras de la semana.',
    status: 'pendiente',
    createdAt: now,
    updatedAt: now,
    receivedAt: null,
    lines: [
      { id: uid('ln'), barcode: '7501234500011', name: 'Manzana Golden', unit: 'kg', qty: 12, perishable: true, expiry: '', receivedQty: null, receivedExpiry: '', counted: false, note: '', extra: false },
      { id: uid('ln'), barcode: '7501234500028', name: 'Jitomate saladet', unit: 'kg', qty: 8, perishable: true, expiry: '', receivedQty: null, receivedExpiry: '', counted: false, note: '', extra: false },
      { id: uid('ln'), barcode: '7501234500035', name: 'Cebolla blanca', unit: 'kg', qty: 10, perishable: true, expiry: '', receivedQty: null, receivedExpiry: '', counted: false, note: '', extra: false },
      { id: uid('ln'), barcode: '7501234500042', name: 'Servilletas 200 hojas', unit: 'paquete', qty: 4, perishable: false, expiry: '', receivedQty: null, receivedExpiry: '', counted: false, note: '', extra: false }
    ]
  };

  const inv2 = {
    id: uid('inv'),
    supplier: 'Lácteos del Valle',
    number: 'EJEMPLO-LACTEOS',
    date: yesterday,
    expectedDate: todayISO(),
    notes: 'Recepción de ejemplo con faltantes y un producto vencido.',
    status: 'diferencias',
    createdAt: now,
    updatedAt: now,
    receivedAt: new Date(Date.now() - 3600000).toISOString(),
    lines: [
      { id: uid('ln'), barcode: '7509876500017', name: 'Yogurt natural 1 L', unit: 'pza', qty: 24, perishable: true, expiry: '', receivedQty: 20, receivedExpiry: addDaysISO(5), counted: true, note: 'Faltaron 4 piezas', extra: false },
      { id: uid('ln'), barcode: '7509876500024', name: 'Queso panela 400 g', unit: 'pza', qty: 6, perishable: true, expiry: '', receivedQty: 6, receivedExpiry: addDaysISO(18), counted: true, note: '', extra: false },
      { id: uid('ln'), barcode: '7509876500031', name: 'Crema ácida 450 ml', unit: 'pza', qty: 12, perishable: true, expiry: '', receivedQty: 10, receivedExpiry: addDaysISO(-2), counted: true, note: '2 envases dañados', extra: false },
      { id: uid('ln'), barcode: '7509876500048', name: 'Mantequilla 90 g', unit: 'pza', qty: 0, perishable: true, expiry: '', receivedQty: 3, receivedExpiry: addDaysISO(9), counted: true, note: 'No venía en la factura', extra: true }
    ]
  };

  state.invoices.push(inv1, inv2);
  [inv1, inv2].forEach(inv => inv.lines.forEach(line => {
    learnProduct(line);
    if (line.perishable && line.receivedExpiry) {
      const remaining = daysUntil(line.receivedExpiry);
      if (remaining != null && remaining >= 0) learnProduct(line, remaining);
    }
  }));
  log('Datos de ejemplo cargados', 'Se agregaron 2 facturas de ejemplo', inv1.id);
  log('Datos de ejemplo cargados', 'Se agregaron 2 facturas de ejemplo', inv2.id);
  saveDB();
  dirty = false;
  toast('Datos de ejemplo cargados', 'ok');
  goHomeAfterChange();
}

async function clearAllData() {
  const ok = await confirmDialog(
    'Borrar todos los datos',
    '<p>Se eliminarán las facturas, recepciones, caducidades y el catálogo de productos de este dispositivo.</p><p>Descarga un respaldo antes si lo necesitas. Esta acción no se puede deshacer.</p>',
    'Borrar todo',
    true
  );
  if (!ok) return;
  state = emptyState();
  saveDB();
  dirty = false;
  editor = null;
  rec = null;
  toast('Datos borrados');
  goHomeAfterChange();
}

async function installApp() {
  if (!installPromptEvent) {
    toast('Usa el menú del navegador: Instalar aplicación');
    return;
  }
  installPromptEvent.prompt();
  try {
    const choice = await installPromptEvent.userChoice;
    if (choice && choice.outcome === 'accepted') toast('App instalada', 'ok');
  } catch (_) { /* sin acción */ }
  installPromptEvent = null;
}
