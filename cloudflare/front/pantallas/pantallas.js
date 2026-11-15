/* Las 7 pantallas principales: Gerencia, Administración, Producción, Ventas, Logística, Despacho y Cliente.
   Cada pantalla agrupa con pestañas las funciones que ya existían (no se borra nada). Cada persona ve solo la pantalla de su rol. */
(function () {
"use strict";
/* grupos: [nombre, [[clave de pantalla, nombre corto], ...]] */
const PANT = [
  {k: 'ger', t: 'Gerencia', ic: 'chart', roles: [], lead: 'Resumen del negocio', grupos: [['Resumen', [['gerencia', 'Resumen'], ['gestion', 'Control de gestión'], ['mapa', 'Mapa de procesos'], ['p-aprobar', 'Precios por aprobar'], ['g-extras', 'Funciones extra']]]]},
  {k: 'adm', t: 'Administración', ic: 'wallet', roles: ['adm', 'custodio', 'rrhh', 'cobranza'], lead: 'Compras, pagos, cobros y personal', grupos: [
    ['Compras', [['c-pedido', 'Hacer una compra'], ['compras-mp', 'Papa e insumos'], ['compras-gen', 'Otras compras'], ['analisis', 'Comparar compras'], ['catalogos', 'Proveedores'], ['inventario-adm', 'Existencias']]],
    ['Pagar', [['cxp', 'Por pagar'], ['caja', 'Caja chica'], ['prestamos', 'Préstamos'], ['politicas', 'Reglas']]],
    ['Cobrar', [['v-cobro', 'Registrar cobro'], ['v-pagos', 'Cobros hechos'], ['v-deuda', 'Quién debe'], ['c-pagos', 'Pagos por revisar'], ['e-plazos', 'Plazos y reclamos'], ['v-reportes', 'Comisiones y asientos'], ['v-importar', 'Traer del Excel']]],
    ['Precios', [['p-precios', 'Precios por lista'], ['p-clientes', 'Precios por cliente'], ['e-ajustes', 'Descuentos y mora'], ['p-estado', 'Mis cambios']]],
    ['Bancos', [['p-bancos', 'Bancos de la empresa']]],
    ['Flota', [['fl-flota', 'Vehículos']]],
    ['Personal', [['personal', 'Personas'], ['asistencia', 'Asistencia'], ['nomina', 'Nómina']]],
    ['Sistema', [['manual', 'Manual'], ['roles', 'Quién ve qué'], ['datos', 'Datos']]]]},
  {k: 'prod', t: 'Producción', ic: 'flame', roles: ['recep', 'jefeprod', 'empaque', 'produccion'], lead: 'Recibir, producir y empacar', grupos: [
    ['Zonas', [['pr-zonas', 'Pedidos por zona'], ['pr-turno', 'Turno'], ['pr-dif', 'Diferencias'], ['pr-mot', 'Motivos de merma'], ['pr-aj', 'Ajustes']]],
    ['Planta', [['planta', 'Resumen'], ['recepcion', 'Recibir'], ['produccion', 'Producir'], ['empaque', 'Empacar'], ['mermas', 'Mermas'], ['cotejo', 'Comparar']]],
    ['Existencias', [['alm-mp', 'Materia prima'], ['pr-proc', 'En proceso (kilos)'], ['alm-proceso', 'En proceso'], ['alm-pt', 'Producto terminado'], ['pr-inv', 'Inventario terminado'], ['inventario', 'Inventario']]],
    ['Más', [['catprod', 'Equipo'], ['manual', 'Manual']]]]},
  {k: 'vent', t: 'Ventas', ic: 'cart', roles: ['ventas'], lead: 'Vender, clientes y catálogo', grupos: [['Ventas', [['v-pedido', 'Hacer una venta'], ['v-clientes', 'Clientes y catálogo'], ['v-deuda', 'Quién debe'], ['v-pagos', 'Cobros hechos'], ['ventas', 'Registro de ventas'], ['pr-invv', 'Inventario disponible'], ['clientes', 'Lista de clientes'], ['c-pedidos', 'Pedidos de clientes']]]]},
  {k: 'logi', t: 'Logística', ic: 'tag', roles: [], lead: 'En desarrollo', grupos: [['Logística', [['alm-logistica', 'Bultos y etiquetas'], ['log-dev', 'Próximamente']]]]},
  {k: 'desp', t: 'Despacho', ic: 'truck', roles: ['empaque', 'jefeprod'], lead: 'Despachos y entregas', grupos: [['Despacho', [['despachos', 'Despachos'], ['e-entregas', 'Entregas con foto'], ['alm-logistica', 'Bultos y etiquetas']]]]},
  {k: 'cli', t: 'Cliente', ic: 'users', roles: [], lead: 'Fichas y portal del cliente', grupos: [['Cliente', [['c-ficha', 'Fichas y enlaces'], ['cli-portal', 'Portal del cliente']]]]}
];
const ORDEN_DUENO = ['ger', 'vent', 'adm', 'prod', 'desp', 'logi', 'cli'];
const EXT = {rol: null, map: {}, sel: null, busy: false};
/* Funciones extra de un puesto: las que asignó el Dueño Y que el puesto ya puede ver según «Quién ve qué» (el panel nunca concede permisos) */
const extrasDe = r => { if (r === 'dueno') return []; const own = new Set(visibles(r).flatMap(p => planas(p, r))); return ((EXT.map || {})[r] || []).filter(k => SCREENS[k] && !own.has(k) && lvlOf(r, k) >= 1); };
const pantDe = k => PANT.find(p => p.k === k);
const tabsDe = (p, r) => p.grupos.map(([g, ts]) => [g, ts.filter(([k]) => SCREENS[k] && lvlOf(r, k) >= 1)]).filter(([, ts]) => ts.length);
const visibles = r => (r === 'dueno' ? ORDEN_DUENO.map(pantDe) : PANT.filter(p => p.roles.includes(r))).filter(p => r === 'dueno' || tabsDe(p, r).length);
const planas = (p, r) => tabsDe(p, r).flatMap(([, ts]) => ts.map(t => t[0]));
function pantActual() {
  const vis = visibles(S.rol), r = S.route;
  const cur = vis.find(p => p.k === S.pant && planas(p, S.rol).includes(r)) || vis.find(p => planas(p, S.rol).includes(r)) || null;
  const ext = !cur && extrasDe(S.rol).includes(r) ? (vis.find(p => p.k === S.pant) || vis[0] || null) : null;
  S.pant = (cur || ext) ? (cur || ext).k : null; return cur || ext;
}
window.pantNombre = () => { const p = pantActual(); return p ? p.t : 'Inicio'; };
const destino = p => { const l = (S.lastPant || {})[p.k], fl = planas(p, S.rol); return l && fl.includes(l) ? l : (fl[0] || 'pant-vacia'); };

Object.assign(SCREENS, {
  'gerencia':   {mod: 'adm', g: 'Gerencia', t: 'Resumen del negocio', s: 'Resumen', ic: 'chart', r: scrGerencia},
  'log-dev':    {mod: 'home', libre: true, g: 'Logística', t: 'Logística', s: 'Próximamente', ic: 'tag', r: () => `<div class="card"><div class="card-b">${emptyState('Esta pantalla está en desarrollo', 'Todavía no hay nada que hacer aquí. Cuando esté lista aparecerá en esta pestaña. Mientras tanto usa «Bultos y etiquetas».')}</div></div>`},
  'cli-portal': {mod: 'home', libre: true, g: 'Cliente', t: 'Portal del cliente', s: 'Portal', ic: 'users', r: scrPortalCli},
  'g-extras':   {mod: 'adm', g: 'Gerencia', t: 'Funciones extra por puesto', s: 'Funciones extra', ic: 'lock', r: scrExtras},
  'pant-vacia': {mod: 'home', libre: true, g: 'Inicio', t: 'Sin pantalla', s: 'Inicio', ic: 'map', r: () => `<div class="card"><div class="card-b">${emptyState('Tu puesto todavía no tiene pantalla', 'Pide al Dueño que te asigne una. Mientras tanto no hay nada que hacer aquí.')}</div></div>`}
});
Object.assign(PERM_DEF, {gerencia: '', 'g-extras': ''});
S.perm = permInit();

/* ---------- Gerencia: solo lo que ya existe y es real ---------- */
const GER = {est: null, doc: null, pag: null, deuda: null, prec: null, kpi: null, dpend: null, dapro: null};
async function gerApi(ruta) { const r = await fetch('/api/v' + ruta, {headers: {'x-rol': S.rol}}); if (!r.ok) throw new Error(ruta); return r.json(); }
async function gerCargar() {
  if (GER.busy) return; GER.busy = true;
  const kp = async () => { try { [GER.kpi, GER.dpend, GER.dapro] = await Promise.all([window.prApi('GET', '/kpi-merma'), window.prApi('GET', '/diferencias/contador'), window.prApi('GET', '/diferencias?estado=APROBADA')]); } catch (e) { GER.kpi = null; } };
  const pide = async (k, ruta) => { try { GER[k] = await gerApi(ruta); } catch (e) { GER[k] = null; } };
  await Promise.all([pide('doc', '/documentos'), pide('pag', '/pagos'), pide('deuda', '/deuda'), S.rol === 'dueno' ? pide('prec', '/precios/pendientes') : null, S.rol === 'dueno' && window.prApi ? kp() : null]);
  GER.est = 'ok'; GER.busy = false; GER.ts = Date.now(); try { render(); } catch (e) { /* sin pantalla */ }
}
const gUsd = x => 'US$ ' + N2.format(x);
function scrGerencia() {
  if (!GER.est || (GER.est === 'ok' && !GER.busy && Date.now() - (GER.ts || 0) > 5000)) gerCargar(); /* se actualiza al volver a entrar */
  const t = S.tasaInfo, cargando = GER.est !== 'ok';
  const msj = cargando ? 'Cargando…' : 'No se pudo leer. Vuelve a entrar en un momento.';
  const tasa = t ? stat('Tasa del dólar (BCV)', 'Bs ' + N2.format(t.valor), (t.respaldo ? 'Hoy no se pudo consultar: se usa la última guardada. ' : 'Al día. ') + 'Rige para el ' + fdl(t.fecha), t.respaldo ? 'warn' : 'ok')
    : stat('Tasa del dólar (BCV)', '—', 'Todavía no hay tasa guardada. Se consulta sola cada día.', 'warn');
  const docs = (GER.doc || []).filter(d => !/^ANULAD/.test(d.estado || '') && d.estado !== 'FACTURADO_DESDE_NE'); /* una nota que ya se facturó cuenta una sola vez: como factura */
  const ej = (GER.doc || []).some(d => d.ejemplo) || (GER.pag || []).some(p => p.ejemplo);
  const ventas = GER.doc ? stat('Ventas hechas', docs.length + (docs.length === 1 ? ' venta' : ' ventas'), 'Suman ' + gUsd(docs.reduce((a, d) => a + (d.total_cents || 0), 0) / 100)) : stat('Ventas hechas', '—', msj);
  const cobros = (GER.pag || []).filter(p => p.estado === 'ACTIVO');
  const cob = GER.pag ? stat('Cobros recibidos', cobros.length + (cobros.length === 1 ? ' cobro' : ' cobros'), 'Suman ' + gUsd(cobros.reduce((a, p) => a + (+p.usd || 0), 0))) : stat('Cobros recibidos', '—', msj);
  const cxc = GER.deuda ? stat('Por cobrar', gUsd(GER.deuda.total || 0), (GER.deuda.clientes || []).length + ' cliente(s) con deuda') : stat('Por cobrar', '—', msj);
  const aprob = S.rol === 'dueno' ? (GER.prec ? stat('Precios por aprobar', GER.prec.pendientes + (GER.prec.pendientes === 1 ? ' cambio' : ' cambios'), GER.prec.pendientes ? 'Administración espera tu respuesta. <a class="lnk" href="#p-aprobar">Revisar</a>' : 'No hay cambios de precio pendientes.', GER.prec.pendientes ? 'warn' : 'ok') : stat('Precios por aprobar', '—', msj)) : '';
  const lista = visibles(S.rol).filter(p => p.k !== 'ger').map(p => `<a class="pt-tile" href="#${destino(p)}">${ic(p.ic, 30)}<b>${p.t}</b><span>${p.lead}</span></a>`).join('');
  return `<h1 class="sr">Gerencia</h1>
  <div class="v-stats pt-stats">${tasa}${ventas}${cob}${cxc}${aprob}</div>${kpiMerma()}
  ${ej ? `<p class="perm-note">${ic('info')}<span>Estas cifras incluyen datos de ejemplo cargados para probar.</span></p>` : ''}
  <h2 class="pt-h2">Ir a una pantalla</h2><div class="pt-tiles">${lista}</div>`;
}
/* KPI de merma: solo lo registrado; sin metas inventadas. Cada gráfico crece según su número de barras. */
function kpiMerma() {
  const K = GER.kpi; if (S.rol !== 'dueno' || !K) return '';
  const p = x => x == null ? 'Sin datos' : N2.format(x) + ' %', kg = x => N2.format(x) + ' kg';
  const et = K.etapas.filter(e => e.etapa !== 'recepcion'), mx = Math.max(0, ...et.map(e => e.merma_pct || 0));
  const filas = et.map(e => '<div class="pr-brow"><span>' + e.nombre + '</span>' + (e.merma_pct == null ? '<span class="muted">Sin datos</span><b></b>' : '<span><i style="width:' + Math.max(2, mx > 0 ? e.merma_pct / mx * 100 : 0) + '%"></i></span><b>' + p(e.merma_pct) + '</b>') + '</div>').join('');
  const mot = {}; K.etapas.forEach(e => (e.por_motivo || []).forEach(m => { mot[m.motivo] = (mot[m.motivo] || 0) + (m.kg || 0); }));
  const ms = Object.entries(mot).sort((a, b) => b[1] - a[1]), mm = ms.length ? ms[0][1] : 0;
  const fm = ms.length ? ms.map(([n, v]) => '<div class="pr-brow am"><span>' + n + '</span><span><i style="width:' + Math.max(2, mm > 0 ? v / mm * 100 : 0) + '%"></i></span><b>' + kg(v) + '</b></div>').join('') : '<p class="muted">Sin datos</p>';
  const pend = (GER.dpend || {}).pendientes || 0, apro = Array.isArray(GER.dapro) ? GER.dapro.length : 0;
  return '<div class="pr-kpis"><section class="pr-kpi"><h3>Merma real por etapa' + (K.total && K.total.merma_pct != null ? ' · total ' + p(K.total.merma_pct) : '') + '</h3>' + filas + '</section>' +
    '<section class="pr-kpi"><h3>Merma por motivo</h3>' + fm + '</section>' +
    '<section class="pr-kpi"><h3>Diferencias</h3><div class="pr-brow"><span>Por aprobar</span><span></span><b>' + pend + '</b></div><div class="pr-brow"><span>Aprobadas</span><span></span><b>' + apro + '</b></div>' + (pend ? '<a class="lnk" href="#pr-dif">Revisar</a>' : '') + '</section></div>';
}
function scrPortalCli() {
  return `<div class="card"><div class="card-b"><p class="empty-t">Portal del cliente</p><p>Es la página donde cada cliente ve su cuenta con su enlace personal. Los enlaces se crean en «Fichas y enlaces».</p>
    <div class="btnrow"><a class="btn pri" href="/cliente.html" target="_blank" rel="noopener">Abrir el portal del cliente</a></div></div></div>`;
}

/* ---------- Entrada: elegir puesto ---------- */
function scrRoles7() {
  const nombres = r => visibles(r).map(p => p.t).join(', ') || 'Ninguna por ahora';
  return `${phFull('El Maná JL', '¿Quién eres?', 'Elige tu puesto. Verás solo la pantalla de tu trabajo.')}
  <div class="pm-grid">${Object.keys(ROLES).map(r => `<article class="card rolecard"><div class="card-b"><h2 style="font-size:17px">${ROLES[r]}</h2><p class="hint" style="margin:4px 0 8px">${ROLE_DESC[r]}</p><p class="hint"><b>Ve:</b> ${r === 'dueno' ? 'Gerencia y las otras 6 pantallas' : nombres(r)}</p>
    <button type="button" class="btn pri" style="margin-top:12px" data-act="elegirRol" data-v="${r}">Entrar</button></div></article>`).join('')}</div>${NOTICE()}`;
}
scrPuertas = scrRoles7; scrElegirRol = scrRoles7;
['elegirRol', 'setRol'].forEach(n => { const f = ACT[n]; if (f) ACT[n] = el => { S.pant = null; S.lastPant = {}; f(el); }; });

/* ---------- Menú: una entrada por pantalla ---------- */
function insignia(p) { const B = badges(); let n = 0, tono = ''; planas(p, S.rol).forEach(k => { if (B[k] && B[k][0]) { n += B[k][0]; tono = tono || B[k][1]; } }); return n ? `<span class="badge ${tono}">${n}</span>` : ''; }
navHTML = function () {
  const cur = pantActual(), vis = visibles(S.rol);
  if (!vis.length) return '';
  return `<div class="nav-g"><p class="nav-gt">Mis pantallas</p>${vis.map(p => `<a href="#${destino(p)}" ${cur && cur.k === p.k ? 'aria-current="page"' : ''}>${ic(p.ic)}${p.t}${insignia(p)}</a>`).join('')}</div>`;
};
renderNav = function () {
  $('#side').innerHTML = `<p class="nav-gt" style="padding-top:2px">${ROLES[S.rol]}</p>` + navHTML() + `<div class="nav-g ses"><p class="nav-gt">Sesión</p><a href="#" data-act="cambiarRol">${ic('users')}Cambiar rol</a></div>`;
  const cur = pantActual(), vis = visibles(S.rol), ks = vis.slice(0, 4);
  if (cur && !ks.includes(cur)) ks[3] = cur;
  $('#bottom').innerHTML = ks.map(p => `<a href="#${destino(p)}" ${cur && cur.k === p.k ? 'aria-current="page"' : ''}>${ic(p.ic, 22)}${p.t}</a>`).join('') + `<button type="button" data-act="drawer">${ic('menu', 22)}Menú</button>`;
};
homeRoute = function () {
  const vis = visibles(S.rol); if (!vis.length) return 'pant-vacia';
  const act = vis.find(p => p.k === S.pant);
  if (act) return destino(act);
  if (S.rol === 'dueno') return destino(vis[0]);
  const rh = ROLE_HOME[S.rol], prim = vis.find(p => rh && planas(p, S.rol).includes(rh)) || vis[0];
  return planas(prim, S.rol).includes(rh) ? rh : destino(prim);
};

/* ---------- Lanzador «Opciones»: un botón de cuadrícula que abre iconos grandes con TODAS las opciones de la pantalla ---------- */
const IC_OP = {gerencia: 'chart', gestion: 'gauge', mapa: 'map', 'p-aprobar': 'check', 'g-extras': 'lock', 'c-pedido': 'cart', 'compras-mp': 'potato', 'compras-gen': 'cart', analisis: 'compare', catalogos: 'book', 'inventario-adm': 'warehouse',
  cxp: 'receipt', caja: 'coins', prestamos: 'wallet', politicas: 'shield', 'v-cobro': 'coins', 'v-pagos': 'check', 'v-deuda': 'alert', 'c-pagos': 'receipt', 'e-plazos': 'calendar', 'v-reportes': 'chart', 'v-importar': 'file',
  'p-precios': 'tag', 'p-clientes': 'users', 'e-ajustes': 'sliders', 'p-estado': 'clip', 'p-bancos': 'wallet', 'fl-flota': 'truck', personal: 'users', asistencia: 'calendar', nomina: 'coins', manual: 'book', roles: 'shield', datos: 'layers',
  planta: 'gauge', recepcion: 'truck', produccion: 'flame', empaque: 'pack', mermas: 'drop', cotejo: 'compare', 'alm-mp': 'potato', 'alm-proceso': 'layers', 'alm-pt': 'box', inventario: 'warehouse', catprod: 'users',
  'v-pedido': 'cart', 'v-clientes': 'users', ventas: 'receipt', clientes: 'users', 'c-pedidos': 'clip', 'alm-logistica': 'tag', 'log-dev': 'tag', despachos: 'truck', 'e-entregas': 'box', 'c-ficha': 'users', 'cli-portal': 'users', 'pr-zonas': 'truck', 'pr-turno': 'flame', 'pr-dif': 'alert', 'pr-mot': 'sliders', 'pr-aj': 'sliders', 'pr-proc': 'flame', 'pr-inv': 'box'};
const icGrid = n => '<svg class="ic" width="' + n + '" height="' + n + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></svg>';
const nombreGlobal = k => { for (const p of PANT) for (const [, ts] of p.grupos) { const x = ts.find(([c]) => c === k); if (x) return x[1]; } const s = SCREENS[k]; return s ? s.s || s.t : k; };
const nombreOp = (p, k) => { for (const [, ts] of tabsDe(p, S.rol).concat([['', extrasDe(S.rol).map(c => [c, nombreGlobal(c)])]])) { const x = ts.find(([c]) => c === k); if (x) return x[1]; } const s = SCREENS[k]; return s ? s.s || s.t : ''; };
function launcherHTML(p) {
  const B = badges(), gs = tabsDe(p, S.rol), ex = extrasDe(S.rol);
  const tile = ([k, n]) => '<a class="pt-op" role="menuitem" data-k="' + k + '" href="#' + k + '"' + (k === S.route ? ' aria-current="page"' : '') + '>' + ic(IC_OP[k] || 'file', 30) + '<span class="pt-opn">' + n + '</span>' + (B[k] && B[k][0] ? '<span class="badge ' + B[k][1] + '">' + B[k][0] + '</span>' : '') + '</a>';
  const sec = (g, ts, extra) => '<section class="pt-sec' + (extra ? ' pt-mas' : '') + '">' + (g ? '<h2 class="pt-sech">' + g + '</h2>' : '') + '<div class="pt-ops">' + ts.map(tile).join('') + '</div></section>';
  let cuerpo = gs.map(([g, ts]) => sec(gs.length > 1 ? g : '', ts)).join('') + (ex.length ? sec('Más opciones', ex.map(k => [k, nombreGlobal(k)]), 1) : '');
  if (!cuerpo) cuerpo = '<p class="pt-vacio">Esta pantalla no tiene opciones disponibles para tu puesto. Pide al Dueño que te asigne alguna.</p>';
  const nBad = Object.entries(B).filter(([k]) => gs.some(([, ts]) => ts.some(([c]) => c === k)) || ex.includes(k)).reduce((a, [, v]) => a + (v[0] || 0), 0);
  const actual = nombreOp(p, S.route), ab = S.ptOpen ? ' aria-expanded="true"' : ' aria-expanded="false"';
  return '<nav class="pt-bar" aria-label="' + p.t + '"><button type="button" class="pt-btn" id="ptBtn" aria-haspopup="true" aria-controls="ptPan"' + ab + '>' + icGrid(20) + '<span>Opciones</span>' + (nBad ? '<span class="pt-dot" aria-label="Hay avisos"></span>' : '') + '</button>' +
    '<span class="pt-t">' + ic(p.ic, 18) + p.t + '</span><span class="pt-sep" aria-hidden="true">›</span><span class="pt-cur">' + actual + '</span>' +
    '<div class="pt-pan" id="ptPan" role="menu" aria-label="Opciones de ' + p.t + '"' + (S.ptOpen ? '' : ' hidden') + '>' + cuerpo + '</div></nav>';
}
function ptCerrar(volver) {
  S.ptOpen = false; const pan = document.getElementById('ptPan'), btn = document.getElementById('ptBtn');
  if (pan) pan.hidden = true;
  if (btn) { btn.setAttribute('aria-expanded', 'false'); if (volver) btn.focus(); }
}
function ptAbrir() {
  const pan = document.getElementById('ptPan'), btn = document.getElementById('ptBtn'); if (!pan || !btn) return;
  S.ptOpen = true; pan.hidden = false; btn.setAttribute('aria-expanded', 'true');
  const a = pan.querySelector('[aria-current="page"]') || pan.querySelector('.pt-op'); if (a) a.focus();
}
if (!window.__ptListeners) {
  window.__ptListeners = true;
  /* Arrastrar o hacer clic en la barra de desplazamiento (de la ventana de opciones o de la página) NO debe cerrarla:
     si el botón se presionó dentro del panel o sobre una barra, se ignora el clic que sigue. */
  const enBarra = e => { const d = document.documentElement; return e.clientX >= d.clientWidth || e.clientY >= d.clientHeight; };
  document.addEventListener('pointerdown', e => { const T = e.target; window.__ptIgn = !!(S.ptOpen && ((T.closest && T.closest('#ptPan')) || enBarra(e))); }, true);
  document.addEventListener('click', e => {
    if (window.__ptIgn || enBarra(e)) { window.__ptIgn = false; if (!(e.target.closest && e.target.closest('.pt-op'))) return; }
    const T = e.target, btn = T.closest && T.closest('#ptBtn');
    if (btn) { S.ptOpen ? ptCerrar() : ptAbrir(); return; }
    if (!S.ptOpen) return;
    if (T.closest && T.closest('.pt-op')) { ptCerrar(); return; } /* al elegir se cierra */
    if (!(T.closest && T.closest('#ptPan'))) ptCerrar();
  });
  document.addEventListener('keydown', e => {
    if (!S.ptOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); ptCerrar(true); return; }
    const pan = document.getElementById('ptPan'); if (!pan) return;
    const ops = [...pan.querySelectorAll('.pt-op')], i = ops.indexOf(document.activeElement);
    if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key) && ops.length) { e.preventDefault(); const d = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : -1; ops[(i + d + ops.length) % ops.length].focus(); }
  });
  /* Cerrar solo por: clic fuera, Esc o elegir una tarjeta. Ya no se cierra por cambios de foco (los repintados lo movían). */
}

/* ---------- Funciones extra por puesto (solo el Dueño asigna; el servidor guarda y audita) ---------- */
async function extrasCargar() {
  if (EXT.busy) return; EXT.busy = true; const r = S.rol;
  try { const x = await fetch('/api/v/pantallas/extras', {headers: {'x-rol': r}}); EXT.map = x.ok ? ((await x.json()).extras || {}) : {}; } catch (e) { EXT.map = {}; }
  EXT.rol = r; EXT.busy = false; try { render(); } catch (e) { /* sin pantalla */ }
}
const candidatas = r => { const own = new Set(visibles(r).flatMap(p => planas(p, r))); return PANT.filter(p => p.k !== 'ger').map(p => [p, tabsDe(p, 'dueno').flatMap(([, ts]) => ts).filter(([k]) => !own.has(k))]).filter(([, l]) => l.length); };
function scrExtras() {
  const roles = Object.keys(ROLES).filter(r => r !== 'dueno'); if (!EXT.sel || !roles.includes(EXT.sel)) EXT.sel = roles[0];
  const r = EXT.sel, marc = new Set((EXT.map || {})[r] || []);
  const grupos = candidatas(r).map(([p, l]) => '<fieldset class="pt-fs"><legend>' + p.t + '</legend><div class="pt-chk">' + l.map(([k, n]) => {
    const ok = lvlOf(r, k) >= 1;
    return '<label class="pt-ck"><input type="checkbox" data-act-change="extraTog" data-k="' + k + '"' + (marc.has(k) ? ' checked' : '') + '><span>' + n + (ok ? '' : ' <em>(sin permiso todavía)</em>') + '</span></label>';
  }).join('') + '</div></fieldset>').join('');
  return '<h1 class="sr">Funciones extra por puesto</h1><div class="card"><div class="card-b">' +
    '' +
    '<label class="pt-sel"><span>Puesto</span><select data-act-change="extraRol" aria-label="Puesto">' + roles.map(x => '<option value="' + x + '"' + (x === r ? ' selected' : '') + '>' + ROLES[x] + '</option>').join('') + '</select></label>' +
    (EXT.err ? '<p class="err" role="alert">' + EXT.err + '</p>' : '') + (grupos || '<p class="hint">No hay otras funciones para asignar.</p>') + '</div></div>';
}
Object.assign(ACT, {
  extraRol: el => { EXT.sel = el.value; render(); },
  extraTog: async el => {
    if (S.rol !== 'dueno') return;
    const r = EXT.sel, set = new Set((EXT.map || {})[r] || []); el.checked ? set.add(el.dataset.k) : set.delete(el.dataset.k);
    try {
      const x = await fetch('/api/v/pantallas/extras/' + r, {method: 'PUT', headers: {'x-rol': S.rol, 'content-type': 'application/json'}, body: JSON.stringify({claves: [...set]})});
      const j = await x.json(); if (!x.ok) throw new Error(j.error || 'No se pudo guardar.');
      EXT.map[r] = j.claves; EXT.err = ''; toast('Guardado: ' + ROLES[r] + ' verá ' + j.claves.length + ' función(es) extra.');
    } catch (e) { EXT.err = String(e.message || e); }
    render();
  }
});

/* ---------- Barra de cada pantalla: botón «Opciones» + nombre de la opción actual ---------- */
const _rm = renderMain;
renderMain = function () {
  if (S.entry === 'in' && Boot.state === 'ready' && EXT.rol !== S.rol && !EXT.busy) extrasCargar();
  const vPan = S.ptOpen ? document.getElementById('ptPan') : null, vTop = vPan ? vPan.scrollTop : 0, vFoco = vPan && vPan.contains(document.activeElement) ? document.activeElement.getAttribute('data-k') : null;
  _rm();
  if (S.entry !== 'in' || Boot.state !== 'ready') return;
  const p = pantActual(), w = document.querySelector('#main .wrap'); if (!p || !w) return;
  const L = (S.lastPant ||= {}); L[p.k] = S.route;
  w.insertAdjacentHTML('afterbegin', launcherHTML(p));
  if (S.ptOpen) { const np = document.getElementById('ptPan'); if (np) { np.scrollTop = vTop; if (vFoco) { const f = np.querySelector('[data-k="' + vFoco + '"]'); if (f) f.focus({preventScroll: true}); } } }
  if (typeof vAjustar === 'function') vAjustar();
};
})();
