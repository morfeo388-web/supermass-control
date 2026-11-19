'use strict';

let currentHash = '';
let dirty = false;

function setActiveNav(section) {
  const map = {
    inicio: 'inicio',
    facturas: 'facturas',
    factura: 'facturas',
    recepciones: 'recepciones',
    recepcion: 'recepciones',
    caducidades: 'caducidades',
    ajustes: 'ajustes'
  };
  const active = map[section] || 'inicio';
  $$('.tabbar a').forEach(link => link.classList.toggle('active', link.dataset.nav === active));
}

function renderRoute() {
  const hash = location.hash || '#/inicio';
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const section = parts[0] || 'inicio';
  const isEditorRoute = section === 'factura' && (parts[1] === 'nuevo' || parts[2] === 'editar');

  if (!isEditorRoute) editor = null;
  if (section !== 'recepcion') rec = null;

  const titles = { inicio: 'Inicio', facturas: 'Facturas', recepciones: 'Recepción', caducidades: 'Caducidades', ajustes: 'Ajustes' };

  if (section === 'inicio') {
    renderDashboard();
  } else if (section === 'facturas') {
    renderInvoices();
  } else if (section === 'factura') {
    if (parts[1] === 'nuevo') {
      openNewInvoice();
      renderInvoiceEditor();
    } else if (parts[1] && parts[2] === 'editar') {
      if (!openEditInvoice(parts[1])) {
        $('#app').innerHTML = `<div class="empty"><div class="empty-icon">${icon('alert', 'icon big')}</div><h3>Factura no encontrada</h3><p>Puede que se haya eliminado.</p><a class="btn primary" href="#/facturas">Volver a facturas</a></div>`;
      } else {
        renderInvoiceEditor();
      }
    } else if (parts[1]) {
      editor = null;
      renderInvoiceDetail(parts[1]);
      document.title = 'Factura · Super Mass';
    } else {
      renderInvoices();
    }
  } else if (section === 'recepciones') {
    renderReceptions();
  } else if (section === 'recepcion') {
    if (parts[1]) renderReception(parts[1]);
    else renderReceptions();
  } else if (section === 'caducidades') {
    renderExpiries();
  } else if (section === 'ajustes') {
    renderSettings();
  } else {
    renderDashboard();
  }

  document.title = `${titles[section] || 'Control de mercancía'} · Super Mass`;
  setActiveNav(section);
  currentHash = hash;
  dirty = false;
  window.scrollTo(0, 0);
}

function goTo(hash, render) {
  if ((location.hash || '#/inicio') === hash) {
    dirty = false;
    if (render) render();
  } else {
    location.hash = hash;
  }
}

function startScanFlow() {
  if (editor) {
    startScanAdd();
    return;
  }
  const open = () => {
    if (editor && (location.hash || '') === '#/factura/nuevo') startScanAdd();
  };
  if ((location.hash || '') === '#/factura/nuevo') {
    open();
    return;
  }
  location.hash = '#/factura/nuevo';
  setTimeout(open, 260);
}

function refreshEditorLine(lineId) {
  if (!editor) return;
  const index = editor.draft.lines.findIndex(line => line.id === lineId);
  if (index < 0) return;
  const card = $(`[data-line-card="${lineId}"]`);
  if (card) card.outerHTML = editorLineHTML(editor.draft.lines[index], index);
}

async function handleAction(actionEl) {
  const action = actionEl.dataset.action;
  try {
    switch (action) {
      case 'start-scan':
        startScanFlow();
        break;
      case 'add-line':
        addEditorLine();
        break;
      case 'remove-line':
        removeEditorLine(actionEl.dataset.line);
        break;
      case 'scan-line':
        scanEditorLine(actionEl.dataset.line);
        break;
      case 'scan-add':
        startScanAdd();
        break;
      case 'scan-invoice-number':
        scanInvoiceNumber();
        break;
      case 'filter-invoices':
        setInvoiceFilter(actionEl.dataset.filter);
        break;
      case 'filter-receptions':
        setReceptionFilter(actionEl.dataset.filter);
        break;
      case 'filter-expiry':
        setExpiryFilter(actionEl.dataset.filter);
        break;
      case 'go-invoices':
        invoiceFilter = actionEl.dataset.filter || 'todas';
        goTo('#/facturas', renderInvoices);
        break;
      case 'go-receptions':
        receptionFilter = actionEl.dataset.filter || 'por';
        goTo('#/recepciones', renderReceptions);
        break;
      case 'go-expiries':
        expiryFilter = actionEl.dataset.filter || 'todos';
        goTo('#/caducidades', renderExpiries);
        break;
      case 'use-suggestion':
        useExpirySuggestion(actionEl.dataset.line, actionEl.dataset.value);
        break;
      case 'add-extra':
        await addExtraLine();
        break;
      case 'remove-extra':
        await removeExtraLine(actionEl.dataset.line);
        break;
      case 'save-progress':
        saveReceptionProgress();
        break;
      case 'finalize-reception':
        await finalizeReception();
        break;
      case 'print-invoice':
        printInvoiceById(actionEl.dataset.id);
        break;
      case 'delete-invoice':
        await deleteInvoice(actionEl.dataset.id);
        break;
      case 'edit-expiry':
        await editExpiry(actionEl.dataset.invoice, actionEl.dataset.line);
        break;
      case 'export-expiries':
        exportExpiriesCSV();
        break;
      case 'export-differences':
        exportDifferencesCSV();
        break;
      case 'download-backup':
        downloadBackup();
        break;
      case 'restore-backup': {
        const input = $('#restore-file');
        if (input) input.click();
        break;
      }
      case 'load-demo': {
        if (state.invoices.length) {
          const ok = await confirmDialog('Cargar datos de ejemplo', '<p>Se agregarán <strong>2 facturas de ejemplo</strong> a los datos actuales para que pruebes el flujo completo.</p><p>Puedes borrarlas después o usar “Borrar todos los datos”.</p>', 'Agregar ejemplo');
          if (!ok) break;
        }
        loadDemoData();
        break;
      }
      case 'clear-all':
        await clearAllData();
        break;
      case 'install-app':
        await installApp();
        break;
      default:
        break;
    }
  } catch (err) {
    console.error(err);
    toast('Ocurrió un error. Intenta de nuevo.', 'error');
  }
}

document.addEventListener('click', event => {
  const actionEl = event.target.closest('[data-action]');
  if (!actionEl) return;
  event.preventDefault();
  handleAction(actionEl);
});

document.addEventListener('input', event => {
  const el = event.target;

  if (el.id === 'inv-search') {
    invoiceSearch = el.value;
    filterCards('#invoice-list .invoice-card', el.value);
    return;
  }
  if (el.id === 'rec-search') {
    receptionSearch = el.value;
    filterCards('#reception-list .invoice-card', el.value);
    return;
  }
  if (el.id === 'exp-search') {
    expirySearch = el.value;
    filterCards('#expiry-list .expiry-row', el.value);
    return;
  }

  if (editor && el.closest('#invoice-form')) {
    if (el.dataset.edit) {
      editor.draft[el.dataset.edit] = el.value;
      dirty = true;
      return;
    }
    if (el.dataset.lineField && el.type !== 'checkbox') {
      const line = editor.draft.lines.find(item => item.id === el.dataset.line);
      if (!line) return;
      line[el.dataset.lineField] = el.value;
      dirty = true;
    }
    return;
  }

  if (rec && el.dataset.recField && el.type !== 'checkbox') {
    handleReceptionField(el);
  }
});

document.addEventListener('change', async event => {
  const el = event.target;

  if (el.id === 'restore-file') {
    const file = el.files && el.files[0];
    el.value = '';
    await handleRestoreFile(file);
    return;
  }

  if (editor && el.dataset.lineField === 'perishable') {
    const line = editor.draft.lines.find(item => item.id === el.dataset.line);
    if (!line) return;
    line.perishable = el.checked;
    dirty = true;
    refreshEditorLine(line.id);
    return;
  }

  if (editor && el.dataset.lineField === 'barcode') {
    const line = editor.draft.lines.find(item => item.id === el.dataset.line);
    if (!line) return;
    const before = { name: line.name, unit: line.unit, perishable: line.perishable };
    line.barcode = el.value.trim();
    const known = applyProductToLine(line);
    dirty = true;
    const changed = line.name !== before.name || line.unit !== before.unit || line.perishable !== before.perishable;
    if (known && changed) refreshEditorLine(line.id);
    return;
  }

  if (rec && el.dataset.recField === 'counted') {
    handleReceptionField(el);
  }
});

document.addEventListener('submit', event => {
  if (event.target.id === 'invoice-form') {
    event.preventDefault();
    saveInvoiceEditor();
  }
});

window.addEventListener('hashchange', () => {
  const next = location.hash || '#/inicio';
  if (dirty && next !== currentHash) {
    const leave = window.confirm('Tienes cambios sin guardar. ¿Salir de esta pantalla?');
    if (!leave) {
      history.replaceState(null, '', currentHash);
      return;
    }
  }
  renderRoute();
});

window.addEventListener('beforeunload', event => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = '';
});

function init() {
  mountIcons();
  const brand = $('#brand-mark');
  if (brand) brand.innerHTML = icon('box');
  const scanIcon = $('#top-scan-icon');
  if (scanIcon) scanIcon.innerHTML = icon('scan');
  const scanBtn = $('#top-scan');
  if (scanBtn) scanBtn.addEventListener('click', startScanFlow);

  if (!location.hash) history.replaceState(null, '', '#/inicio');
  currentHash = location.hash || '#/inicio';
  renderRoute();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker:', err));
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
