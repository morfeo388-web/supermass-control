'use strict';

let scanCtx = null;
let audioCtx = null;

function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.06;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.09);
  } catch (_) { /* sonido opcional */ }
}

function scannerAvailable() {
  return typeof window.Html5Qrcode === 'function';
}

async function openScanner({ title = 'Escanear código', continuous = false, onCode = null, onClose = null } = {}) {
  if (scanCtx) await closeScanner();

  const modal = $('#scanner');
  modal.hidden = false;
  document.body.classList.add('scan-open');
  $('#scan-title').textContent = title;
  $('#scan-status').textContent = 'Apunta la cámara al código de barras.';
  $('#scan-results').innerHTML = '';
  $('#scan-results').hidden = !continuous;
  $('#scan-done').textContent = continuous ? 'Listo' : 'Cerrar';
  const manual = $('#scan-manual-input');
  manual.value = '';
  $('#scan-reader').innerHTML = '';

  const escHandler = ev => { if (ev.key === 'Escape') closeScanner(); };
  document.addEventListener('keydown', escHandler);

  const ctx = {
    continuous,
    onCode,
    onClose,
    qr: null,
    closed: false,
    lastCode: '',
    lastTs: 0,
    escHandler
  };
  scanCtx = ctx;

  if (!scannerAvailable()) {
    $('#scan-status').textContent = 'La cámara no está disponible. Escribe el código abajo.';
    $('#scan-reader').innerHTML = `<div class="scan-fallback">${icon('camera')}<span>Escáner no disponible</span></div>`;
    setTimeout(() => manual.focus(), 100);
    return;
  }

  try {
    const qr = new window.Html5Qrcode('scan-reader', { verbose: false });
    ctx.qr = qr;
    await qr.start(
      { facingMode: { ideal: 'environment' } },
      {
        fps: 10,
        qrbox: (w, h) => {
          const width = Math.max(150, Math.min(300, Math.round(w * 0.78)));
          const height = Math.max(110, Math.min(220, Math.round(h * 0.45)));
          return { width, height };
        }
      },
      text => onScanSuccess(text),
      () => { /* lecturas fallidas: normal */ }
    );
    if (scanCtx === ctx && !ctx.closed) {
      $('#scan-status').textContent = continuous
        ? 'Escanea un artículo tras otro. Cada código se agrega a la factura.'
        : 'Apunta la cámara al código de barras.';
    }
  } catch (err) {
    console.warn('Escáner:', err);
    if (scanCtx !== ctx) return;
    ctx.qr = null;
    try { $('#scan-reader').innerHTML = ''; } catch (_) {}
    $('#scan-status').textContent = 'No se pudo abrir la cámara. Revisa el permiso del navegador o escribe el código abajo.';
    $('#scan-reader').innerHTML = `<div class="scan-fallback">${icon('camera')}<span>Sin acceso a la cámara</span></div>`;
    setTimeout(() => manual.focus(), 100);
  }
}

function onScanSuccess(text) {
  const ctx = scanCtx;
  if (!ctx || ctx.closed) return;
  const code = String(text || '').trim();
  if (!code) return;
  const now = Date.now();
  if (code === ctx.lastCode && now - ctx.lastTs < 1800) return;
  ctx.lastCode = code;
  ctx.lastTs = now;

  beep();
  if (navigator.vibrate) navigator.vibrate(35);
  try {
    if (ctx.onCode) ctx.onCode(code);
  } catch (err) {
    console.error(err);
    toast('No se pudo usar el código escaneado', 'error');
  }

  if (!ctx.continuous) {
    setTimeout(() => closeScanner(), 140);
  } else {
    addScanResult(code);
    $('#scan-status').textContent = 'Código agregado. Sigue escaneando o pulsa Listo.';
  }
}

function addScanResult(code) {
  const box = $('#scan-results');
  if (!box) return;
  const item = document.createElement('div');
  item.className = 'scan-result';
  item.innerHTML = `${icon('check')}<span>${esc(code)}</span>`;
  box.prepend(item);
  while (box.children.length > 6) box.lastElementChild.remove();
}

function submitManualScan() {
  const input = $('#scan-manual-input');
  const value = input.value.trim();
  if (!value) {
    toast('Escribe un código');
    input.focus();
    return;
  }
  input.value = '';
  onScanSuccess(value);
}

async function closeScanner() {
  const ctx = scanCtx;
  if (!ctx || ctx.closed) return;
  ctx.closed = true;
  scanCtx = null;
  document.removeEventListener('keydown', ctx.escHandler);
  const modal = $('#scanner');
  if (modal) modal.hidden = true;
  document.body.classList.remove('scan-open');
  if (ctx.qr) {
    try { await ctx.qr.stop(); } catch (_) {}
    try { ctx.qr.clear(); } catch (_) {}
  }
  const reader = $('#scan-reader');
  if (reader) reader.innerHTML = '';
  if (ctx.onClose) {
    try { ctx.onClose(); } catch (err) { console.error(err); }
  }
}

(function bindScanner() {
  const closeBtn = $('#scan-close');
  const doneBtn = $('#scan-done');
  const manualBtn = $('#scan-manual-btn');
  const manualInput = $('#scan-manual-input');
  if (closeBtn) closeBtn.addEventListener('click', closeScanner);
  if (doneBtn) doneBtn.addEventListener('click', closeScanner);
  if (manualBtn) manualBtn.addEventListener('click', submitManualScan);
  if (manualInput) {
    manualInput.addEventListener('keydown', ev => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        submitManualScan();
      }
    });
  }
})();
