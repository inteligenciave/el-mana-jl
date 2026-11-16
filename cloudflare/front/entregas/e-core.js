/* Entregas con foto · núcleo de las pantallas del equipo: cliente HTTP, estado, formatos y compresión de la foto en el navegador.
   Todo lo que toca al servidor pasa por eApi(); ninguna pantalla hace fetch por su cuenta. */
const EN = {
  tab: 'SUBIDA', q: '', pag: 0, lista: null, sin: null, lleg: null, minis: {}, fotos: {}, cargando: false, err: null,
  up: {doc: null, q: '', foto: null, mini: null, antes: 0, despues: 0, aviso: '', vista: '', hora: '', ocupado: false, lado: 0, calidad: 0},
  pl: {data: null, tab: 'plazos', q: '', f: 'TODOS', pag: 0, disputas: null}, aj: {data: null, err: null}, busy: {}
};
const eHTTP = () => !!window.__EM_HTTP;
const etxt = s => esc(s == null ? '' : s);
const eUsd = x => x == null ? '—' : '$ ' + N2.format(x);
const eBs = x => x == null ? '—' : 'Bs ' + N2.format(x);
const eFechaHora = s => { if (!s) return '—'; const d = new Date(s); return isNaN(d) ? '—' : d.toLocaleString('es-VE', {day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'}); };
const eTs = ts => ts ? eFechaHora(new Date(ts).toISOString()) : '—';
const eBytes = n => n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const eId = el => +el.dataset.id;

async function eApi(metodo, ruta, cuerpo) {
  const r = await fetch('/api/v/entregas' + ruta, {method: metodo, headers: {'content-type': 'application/json', 'x-rol': S.rol}, body: cuerpo ? JSON.stringify(cuerpo) : undefined});
  let j = {}; try { j = await r.json(); } catch (e) { /* sin cuerpo */ }
  if (!r.ok) { const e = new Error(j.error || 'No se pudo completar la operación.'); e.status = r.status; e.info = j; throw e; }
  return j;
}
const eErr = e => toast(esc(e && e.message ? e.message : 'No se pudo completar la operación.'), 'err');
const eQS = o => { const p = Object.entries(o).filter(([, v]) => v !== '' && v != null).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&'); return p ? '?' + p : ''; };
async function eRun(clave, fn, ok) {
  if (EN.busy[clave]) return;
  EN.busy[clave] = true; render();
  try { const r = await fn(); if (ok) toast(typeof ok === 'function' ? ok(r) : ok); return r; }
  catch (e) { console.error(e); eErr(e); }
  finally { delete EN.busy[clave]; render(); }
}
function ePantalla(fn) {
  if (!eHTTP()) return ph('Entregas', 'Entrega con foto', '', '') + card('', emptyState('Este módulo necesita el servidor', 'Funciona en la versión con base de datos (Cloudflare). En la maqueta de un solo archivo no está disponible.'));
  return fn();
}

/* ---------- Compresión de la foto en el navegador (OBLIGATORIA): lado mayor ~1024 px, JPEG calidad ~0.6 ---------- */
const E_TOPE_BYTES = 250 * 1024, E_MAX_ORIGINAL = 40 * 1048576;
const eBytesB64 = s => Math.floor(s.length * 3 / 4) - (s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0);
async function eAbrirImagen(file) {
  if (typeof createImageBitmap === 'function') { try { return await createImageBitmap(file, {imageOrientation: 'from-image'}); } catch (e) { /* se prueba con <img> */ } }
  const url = URL.createObjectURL(file);
  try { return await new Promise((ok, mal) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => mal(new Error('x')); im.src = url; }); }
  finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
}
function eDibujar(img, ladoMax, calidad) {
  const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height, esc1 = Math.min(1, ladoMax / Math.max(w0, h0));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w0 * esc1)); c.height = Math.max(1, Math.round(h0 * esc1));
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', calidad).split(',')[1];
}
/* Devuelve {foto, mini, antes, despues, lado, calidad}. Si tras comprimir pasa del tope, baja la calidad (hasta 0.3) y luego el tamaño (hasta 640 px). */
async function eComprimir(file) {
  if (!file || (file.type && !/^image\//i.test(file.type))) throw new Error(/pdf/i.test(file.type) ? 'Los PDF no se pueden subir. Elige una foto o una captura de pantalla.' : 'Ese archivo no es una imagen. Elige una foto (JPG, PNG o similar).');
  if (file.size > E_MAX_ORIGINAL) throw new Error('La foto original pesa demasiado (' + eBytes(file.size) + '). Elige una de menos de 40 MB.');
  let img; try { img = await eAbrirImagen(file); } catch (e) { throw new Error(/hei[cf]/i.test(file.type + ' ' + file.name) ? 'Esa foto está en formato HEIC y este navegador no la puede abrir. Guárdala como JPG o toma una captura de pantalla.' : 'No se pudo leer esa imagen. Prueba con una foto JPG o PNG.'); }
  let lado = 1024, q = 0.6, foto = eDibujar(img, lado, q);
  while (eBytesB64(foto) > E_TOPE_BYTES && q > 0.31) { q = Math.round((q - 0.1) * 10) / 10; foto = eDibujar(img, lado, q); }
  while (eBytesB64(foto) > E_TOPE_BYTES && lado > 640) { lado -= 128; foto = eDibujar(img, lado, q); }
  if (eBytesB64(foto) > E_TOPE_BYTES * 1.3) throw new Error('No se pudo reducir esa foto a un tamaño razonable. Prueba con otra.');
  const mini = eDibujar(img, 160, 0.5);
  if (img.close) img.close();
  return {foto, mini, antes: file.size, despues: eBytesB64(foto), lado, calidad: q};
}
