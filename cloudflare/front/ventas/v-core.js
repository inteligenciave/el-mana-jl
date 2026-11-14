/* Núcleo del módulo de Ventas y Liquidación (pantallas): cliente HTTP, estado, formatos y utilidades compartidas.
   Todo lo que toca al servidor pasa por vApi(); ninguna pantalla hace fetch por su cuenta. */
const V = {
  boot: null, err: null, cfg: {}, productos: [], vendedores: [], listas: [], ejemplo: {}, pin: false, hoy: null,
  clientes: null, ped: null, cob: null, pagos: {f: {desde: '', hasta: '', vendedor: '', estado: 'ACTIVO', q: ''}, filas: null}, deuda: {f: {vendedor: '', q: ''}, data: null},
  rep: {tab: 'comisiones', f: {desde: '', hasta: '', vendedor: ''}, data: null}, adm: {tab: 'clientes', q: '', clientes: null}, imp: null, busy: {}
};
const vHTTP = () => !!window.__EM_HTTP;
const vc = x => Math.round(Number(x) * 100);                 // dólares a centavos
const vusd = x => x == null ? '—' : 'US$ ' + N2.format(x);
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
    if (a.estados_lista) VD.setMapaListas(a.estados_lista);
    Object.assign(V, {productos: a.productos, vendedores: a.vendedores, listas: a.listas, cfg: a.config, pin: a.pinConfigurado, ejemplo: a.ejemplo, hoy: a.hoy, seq: a.secuencias, boot: 'ok', err: null});
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
const vNota = () => `<p class="perm-note">${ic('info')}<span>Los datos de esta versión son de ejemplo (marcados <b>EJEMPLO</b>). Los precios, plazos, porcentajes, límites y números fiscales los define el Dueño; el formato fiscal de los documentos está <b>por confirmar con el contador</b>.</span></p>`;

/* ---------- Buscador de cliente compartido (pedido y cobro) ---------- */
function vPicker(clave, seleccionado, filtro) {
  if (seleccionado) return '';
  if (!V.clientes) { vCargarClientes().then(() => render()); return '<p class="hint">Cargando clientes…</p>'; }
  const lista = vCliFiltrar(filtro, clave === 'ped' ? 5 : 12);
  return `<div class="v-pick"><label class="fld">Buscar cliente por nombre o RIF<input type="search" class="v-pk-in" data-pk="${clave}" ${Busca.atr('v-cli', clave)} value="${esc(filtro || '')}" placeholder="Nombre o RIF del cliente"></label>
    <ul class="v-pk-list" id="v-pk-${clave}">${vPickerItems(clave, lista)}</ul></div>`;
}
/* Clientes que coinciden (sin tildes ni mayúsculas) por nombre o RIF: lo usan la lista de la pantalla y las sugerencias */
const vCliFiltrar = (q, max) => Busca.filtrar(V.clientes || [], q, c => [c.razon_social, c.rif_id]).sort((a, b) => Busca.puntaje(q, b.razon_social) - Busca.puntaje(q, a.razon_social)).slice(0, max);
const vPickerItems = (clave, lista) => lista.length ? lista.map(c => `<li><button type="button" class="v-pk-b" data-act="vElegirCliente" data-pk="${clave}" data-id="${c.id_cliente}"><b>${vtxt(c.razon_social)}</b><span>${vtxt(c.rif_id || 'sin RIF')} · debe ${vusd(c.deuda)}</span></button></li>`).join('') : '<li class="hint" style="padding:8px">No hay clientes con ese texto.</li>';

/* ---------- Entradas de números enteros: solo dígitos ---------- */
document.addEventListener('keydown', e => { const t = e.target; if (t && t.classList && t.classList.contains('v-int') && (['.', ',', '-', '+', 'e', 'E'].includes(e.key))) e.preventDefault(); });
const vSoloDigitos = el => { const l = el.value.replace(/\D/g, '').replace(/^0+(?=\d)/, ''); if (l !== el.value) el.value = l; return l === '' ? 0 : +l; };

/* ---------- Tabla con totales y CSV ---------- */
async function vCSV(nombre, cabeceras, filas) {
  const r = await guardarArchivo(nombre, 'text/csv', VD.aCSV(cabeceras, filas));
  if (r !== 'copiar') toast('Listo: se generó el archivo ' + esc(nombre) + '.');
}
const vHoy = () => V.hoy || HOY_ISO;
const vRestar = (f, n) => VD.sumarDias(f, -n);
function vLunes(f) { const d = new Date(f + 'T12:00:00'), dow = (d.getDay() + 6) % 7; return VD.sumarDias(f, -dow); }

/* Bancos de la empresa (lista plegable). Los carga Dueño o Administración; aquí todos los roles que cobran eligen.
   Si todavía no hay ninguno, se muestra el aviso y se deja escribir el banco como antes. `pre` = 'cob' | 'ped'. */
function vBancos() {
  if (V.bancos === undefined) { V.bancos = null; vApi('GET', '/bancos').then(r => { V.bancos = r; render(); }).catch(() => { V.bancos = {bancos: [], mensaje_vacio: 'Todavía no hay bancos cargados. Pídele al Dueño o a Administración que los carguen'}; render(); }); }
  return V.bancos;
}
function vBancoCampo(pre, obj, ph) {
  const L = vBancos();
  if (!L) return '<label class="fld">Banco<select disabled><option>Cargando bancos…</option></select></label>';
  if (!L.bancos.length) return '<label class="fld">Banco<select disabled><option>' + esc(L.mensaje_vacio) + '</option></select><input type="text" data-vk="' + pre + '.banco" value="' + esc(obj.banco || '') + '" maxlength="40" placeholder="' + esc(ph || 'Escribe el banco') + '"></label>';
  return '<label class="fld">Banco<select data-vk="' + pre + '.id_banco"><option value="">Elige el banco…</option>' + L.bancos.map(b => '<option value="' + b.id + '"' + (String(obj.id_banco || '') === String(b.id) ? ' selected' : '') + '>' + esc(b.nombre + ' (' + b.moneda_txt.toLowerCase() + ')') + '</option>').join('') + '</select></label>';
}
const vBancoListo = obj => { const L = V.bancos; return L && L.bancos.length ? !!obj.id_banco : !!(obj.banco || '').trim(); };
