/* Núcleo del módulo de Ventas y Liquidación (pantallas): cliente HTTP, estado, formatos y utilidades compartidas.
   Todo lo que toca al servidor pasa por vApi(); ninguna pantalla hace fetch por su cuenta. */
const V = {
  boot: null, err: null, cfg: {}, productos: [], vendedores: [], listas: [], ejemplo: {}, pin: false, hoy: null,
  clientes: null, ped: null, cob: null, pagos: {f: {desde: '', hasta: '', vendedor: '', estado: 'ACTIVO', q: ''}, filas: null}, deuda: {f: {vendedor: '', q: ''}, data: null},
  rep: {tab: 'comisiones', f: {desde: '', hasta: '', vendedor: ''}, data: null}, adm: {tab: 'clientes', q: '', clientes: null}, imp: null, busy: {}
};
const vHTTP = () => !!window.__EM_HTTP;
const vc = x => Math.round(Number(x) * 100);                 // dólares a centavos
const vusd = x => x == null ? '—' : '$ ' + N2.format(x);
const vbs = x => x == null ? '—' : 'Bs ' + N2.format(x);
const vnum = x => N2.format(x);
const vtxt = s => esc(s == null ? '' : s);
const vfecha = s => s ? fdl(String(s).slice(0, 10)) : '—';
const vOk = (cond, t) => cond ? `<span class="chip c-ok">${t}</span>` : `<span class="chip c-crit">${t}</span>`;

async function vApi(metodo, ruta, cuerpo) {
  const r = await fetch('/api/v' + ruta, {method: metodo, headers: {'content-type': 'application/json', 'x-rol': S.rol}, body: cuerpo ? JSON.stringify(cuerpo) : undefined});
  let j = {}; try { j = await r.json(); } catch (e) { /* sin cuerpo */ }
  if (!r.ok) { const e = new Error(j.error || 'No se pudo completar la operación.'); e.status = r.status; e.info = j; throw e; }
  return j;
}
const vQS = o => { const p = Object.entries(o).filter(([, v]) => v !== '' && v != null).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&'); return p ? '?' + p : ''; };
const vSet = (obj, path, val) => { const p = path.split('.'); let o = obj; for (let i = 0; i < p.length - 1; i++) o = o[p[i]] ||= {}; o[p[p.length - 1]] = val; };
const vErr = e => { toast(esc(e && e.message ? e.message : 'No se pudo completar la operación.'), 'err'); };
/* Una sola operación a la vez por clave (evita dobles clics) */
async function vRun(clave, fn, ok) {
  if (V.busy[clave]) return;
  V.busy[clave] = true; render();
  try { const r = await fn(); if (ok) toast(typeof ok === 'function' ? ok(r) : ok); return r; }
  catch (e) { console.error(e); vErr(e); }
  finally { delete V.busy[clave]; render(); }
}

/* Arranque: productos, vendedores, configuración. Se pide una vez y se refresca tras cada operación que cambia existencias */
async function vBoot(forzar) {
  if (V.boot === 'cargando' || (V.boot === 'ok' && !forzar)) return;
  V.boot = V.boot === 'ok' ? 'ok' : 'cargando';
  try {
    const a = await vApi('GET', '/arranque');
    Object.assign(V, {productos: a.productos, vendedores: a.vendedores, vendedoresEmp: a.vendedores_empleados || [], categorias: a.categorias || VD.CATEGORIAS, listas: a.listas, cfg: a.config, pin: a.pinConfigurado, ejemplo: a.ejemplo, hoy: a.hoy, seq: a.secuencias, boot: 'ok', err: null});
  } catch (e) { V.boot = 'error'; V.err = e; }
  render();
}
async function vCargarClientes() { try { V.clientes = await vApi('GET', '/clientes?limite=500'); } catch (e) { vErr(e); V.clientes = V.clientes || []; } }
/* Envoltorio de cada pantalla: modo sin servidor, carga y error */
function vPantalla(fn) {
  if (!vHTTP()) return ph('Ventas', 'Módulo de Ventas y Liquidación', '', '') + card('', emptyState('Este módulo necesita el servidor', 'Funciona en la versión con base de datos (Cloudflare). En la maqueta de un solo archivo no está disponible.'));
  if (V.boot === null || V.boot === 'cargando') { vBoot(); return card('', emptyState('Cargando…', 'Un momento.')); }
  if (V.boot === 'error') return card('', emptyState('No se pudo conectar con el servidor', esc(V.err && V.err.message || ''), `<button type="button" class="btn pri" data-act="vReintentar">Reintentar</button>`));
  return fn();
}
const vph = (e, t, l, a) => ph(e, t, l, a);
const vNota = () => `<p class="perm-note">${ic('info')}<span>Los datos de esta versión son de ejemplo (marcados <b>EJEMPLO</b>). Los precios, plazos, porcentajes, límites y números fiscales los define el Gerente; el formato fiscal de los documentos está <b>por confirmar con el contador</b>.</span></p>`;

/* ---------- Buscador de cliente compartido (pedido y cobro) ---------- */
function vPicker(clave, seleccionado, filtro) {
  if (seleccionado) return '';
  if (!V.clientes) { vCargarClientes().then(() => render()); return '<p class="hint">Cargando clientes…</p>'; }
  const lista = vCliFiltrar(filtro, clave === 'ped' ? 5 : 12);
  return `<div class="v-pick"><label class="fld">Buscar cliente por nombre o RIF<input type="search" class="v-pk-in" data-pk="${clave}" ${Busca.atr('v-cli', clave)} value="${esc(filtro || '')}" placeholder="Nombre o RIF del cliente"></label>
    <ul class="v-pk-list" id="v-pk-${clave}">${vPickerItems(clave, lista)}</ul></div>`;
}
/* Referencia de un cliente en cualquier operación: su Vendedor y su Zona (la zona es solo logística) */
const vRefCli = c => 'Vendedor: <b>' + vtxt(c.vendedor_nombre || c.vendedor || 'sin vendedor') + '</b> · Zona: <b>' + vtxt(VD.zonaDeEstado(c.zona) || c.zona || 'sin zona') + '</b>';
/* Clientes que coinciden (sin tildes ni mayúsculas) por nombre o RIF: lo usan la lista de la pantalla y las sugerencias */
const vCliFiltrar = (q, max) => Busca.filtrar(V.clientes || [], q, c => [c.razon_social, c.rif_id]).sort((a, b) => Busca.puntaje(q, b.razon_social) - Busca.puntaje(q, a.razon_social)).slice(0, max);
const vPickerItems = (clave, lista) => lista.length ? lista.map(c => `<li><button type="button" class="v-pk-b" data-act="vElegirCliente" data-pk="${clave}" data-id="${c.id_cliente}"><b>${vtxt(c.razon_social)}</b><span>${vtxt(c.rif_id || 'sin RIF')} · debe ${vusd(c.deuda)}</span><span class="v-ref">${vRefCli(c)}</span></button></li>`).join('') : '<li class="hint" style="padding:8px">No hay clientes con ese texto.</li>';

/* ---------- Entradas de números enteros: solo dígitos ---------- */
const V_AVISO_ENTERO = 'Los bultos se cuentan completos: escribe un número entero, sin comas ni puntos.';
document.addEventListener('keydown', e => { const t = e.target; if (t && t.classList && t.classList.contains('v-int') && (['.', ',', '-', '+', 'e', 'E'].includes(e.key))) { e.preventDefault(); if (e.key === '.' || e.key === ',') toast(V_AVISO_ENTERO, 'warn'); } });
const vSoloDigitos = el => { if (/\d[.,]\d/.test(el.value)) toast(V_AVISO_ENTERO + ' Se tomó «' + esc(el.value) + '» como ' + esc(el.value.replace(/\D/g, '')) + ': revisa la cantidad.', 'warn'); const l = el.value.replace(/\D/g, '').replace(/^0+(?=\d)/, ''); if (l !== el.value) el.value = l; return l === '' ? 0 : +l; };

/* ---------- Tabla con totales y CSV ---------- */
async function vCSV(nombre, cabeceras, filas) {
  const r = await guardarArchivo(nombre, 'text/csv', VD.aCSV(cabeceras, filas));
  if (r !== 'copiar') toast('Listo: se generó el archivo ' + esc(nombre) + '.');
}
const vHoy = () => V.hoy || HOY_ISO;
const vRestar = (f, n) => VD.sumarDias(f, -n);
function vLunes(f) { const d = new Date(f + 'T12:00:00'), dow = (d.getDay() + 6) % 7; return VD.sumarDias(f, -dow); }

/* Bancos de la empresa (lista plegable). Los carga Gerente o Administración; aquí todos los roles que cobran eligen.
   Si todavía no hay ninguno, se muestra el aviso y se deja escribir el banco como antes. `pre` = 'cob' | 'ped'. */
function vBancos() {
  if (V.bancos === undefined) { V.bancos = null; vApi('GET', '/bancos').then(r => { V.bancos = r; vCobPintar(); }).catch(() => { V.bancos = {bancos: [], mensaje_vacio: 'Todavía no hay bancos cargados. Pídele al Gerente o a Administración que los carguen'}; vCobPintar(); }); }
  return V.bancos;
}
window.vBancos = vBancos;
function vBancoCampo(pre, obj, ph) {
  const L = vBancos();
  if (!L) return '<label class="fld">Banco<select disabled><option>Cargando bancos…</option></select></label>';
  if (!L.bancos.length) return '<label class="fld">Banco<select disabled><option>' + esc(L.mensaje_vacio) + '</option></select><input type="text" data-vk="' + pre + '.banco" value="' + esc(obj.banco || '') + '" maxlength="40" placeholder="' + esc(ph || 'Escribe el banco') + '"></label>';
  return '<label class="fld">Banco<select data-vk="' + pre + '.id_banco"><option value="">Elige el banco…</option>' + L.bancos.map(b => '<option value="' + b.id + '"' + (String(obj.id_banco || '') === String(b.id) ? ' selected' : '') + '>' + esc(b.nombre + ' (' + b.moneda_txt.toLowerCase() + ')') + '</option>').join('') + '</select></label>';
}
const vBancoListo = obj => { const L = V.bancos; return L && L.bancos.length ? !!obj.id_banco : !!(obj.banco || '').trim(); };

/* ---------- Imagen de producto: compresión en el navegador (≤ 180 KB, JPEG sobre fondo blanco) ---------- */
const V_IMG_TOPE = 180 * 1024, V_IMG_ORIGINAL_MAX = 40 * 1048576;
const vBytesB64 = b => Math.floor(b.length * 3 / 4) - (b.endsWith('==') ? 2 : b.endsWith('=') ? 1 : 0);
async function vAbrirImagen(file) {
  if (typeof createImageBitmap === 'function') { try { return await createImageBitmap(file, {imageOrientation: 'from-image'}); } catch (e) { /* se prueba con <img> */ } }
  const url = URL.createObjectURL(file);
  try { return await new Promise((ok, mal) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => mal(new Error('x')); im.src = url; }); }
  finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
}
function vDibujar(img, ladoMax, calidad) {
  const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height, k = Math.min(1, ladoMax / Math.max(w0, h0));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', calidad).split(',')[1];
}
/* Devuelve {b64, bytes, antes}. Primero baja la calidad y, si hace falta, el tamaño, hasta quedar en 180 KB o menos. */
async function vComprimirImagen(file) {
  if (!file || (file.type && !/^image\//i.test(file.type))) throw new Error('Ese archivo no es una imagen. Elige una foto o un dibujo (JPG, PNG o similar).');
  if (file.size > V_IMG_ORIGINAL_MAX) throw new Error('La imagen original pesa demasiado. Elige una de menos de 40 MB.');
  let img; try { img = await vAbrirImagen(file); } catch (e) { throw new Error(/hei[cf]/i.test((file.type || '') + ' ' + (file.name || '')) ? 'Esa foto está en formato HEIC y este navegador no la puede abrir. Guárdala como JPG o toma una captura de pantalla.' : 'No se pudo leer esa imagen. Prueba con una JPG o PNG.'); }
  let lado = 800, q = 0.85, b64 = vDibujar(img, lado, q);
  while (vBytesB64(b64) > V_IMG_TOPE && q > 0.45) { q = Math.round((q - 0.1) * 100) / 100; b64 = vDibujar(img, lado, q); }
  while (vBytesB64(b64) > V_IMG_TOPE && lado > 240) { lado -= 80; q = 0.7; b64 = vDibujar(img, lado, q); }
  if (img.close) img.close();
  if (vBytesB64(b64) > V_IMG_TOPE) throw new Error('La imagen sigue siendo demasiado pesada aun reduciéndola. Prueba con otra.');
  return {b64, bytes: vBytesB64(b64), antes: file.size};
}
/* Las imágenes internas necesitan tu rol en la cabecera: se bajan con fetch y se muestran desde memoria */
const V_IMG_CACHE = new Map(), V_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=';
function vImgPendientes() {
  document.querySelectorAll('img[data-vsrc]').forEach(im => {
    const u = im.getAttribute('data-vsrc'); im.removeAttribute('data-vsrc');
    const hit = V_IMG_CACHE.get(u); if (typeof hit === 'string') { im.src = hit; return; }
    const pr = hit || fetch(u, {headers: {'x-rol': S.rol}}).then(r => r.ok ? r.blob() : Promise.reject(new Error('x'))).then(b => URL.createObjectURL(b));
    V_IMG_CACHE.set(u, pr);
    pr.then(o => { V_IMG_CACHE.set(u, o); im.src = o; }).catch(() => { V_IMG_CACHE.delete(u); });
  });
}
let vImgT = 0;
new MutationObserver(() => { if (!vImgT) vImgT = setTimeout(() => { vImgT = 0; vImgPendientes(); }, 30); }).observe(document.body, {childList: true, subtree: true});
