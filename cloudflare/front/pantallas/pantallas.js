/* Las 6 pantallas principales, una por puesto: Gerencia, Administración, Producción, Logística, Ventas y Nómina.
   Cada pantalla agrupa con pestañas las funciones que ya existían (no se borra nada). Cada persona ve solo la pantalla de su rol. */
(function () {
"use strict";
/* grupos: [nombre, [[clave de pantalla, nombre corto], ...]] */
const PANT = [
  {k: 'ger', t: 'Gerencia', ic: 'chart', roles: [], lead: 'Resumen del negocio', grupos: [['Resumen', [['gerencia', 'Resumen'], ['mapa', 'Mapa de procesos', 'h']]], ['Por aprobar', [['p-aprobar', 'Precios por aprobar'], ['g-solic', 'Solicitudes'], ['pr-dif', 'Diferencias'], ['c-pagos', 'Pagos del portal']]], ['Auditoría', [['g-audit', 'Auditoría']]], ['Ajustes', [['politicas', 'Reglas de caja y nómina'], ['rh-params', 'Turnos y bonos'], ['e-ajustes', 'Crédito'], ['pr-aj', 'Zonas y mermas'], ['pr-mot', 'Motivos de merma'], ['p-bancos', 'Bancos'], ['roles', 'Quién ve qué'], ['g-extras', 'Funciones extra'], ['datos', 'Datos'], ['gestion', 'Control de gestión'], ['ayuda', 'Ayuda', 'h']]]]},
  {k: 'adm', t: 'Administración', ic: 'wallet', roles: ['adm'], lead: 'Compras, pagos, cobros y caja', grupos: [
    ['Resumen', [['adm-resumen', 'Resumen']]],
    ['Compras', [['c-pedido', 'Hacer una compra'], ['compras-mp', 'Papa e insumos'], ['compras-gen', 'Otras compras'], ['analisis', 'Comparar compras'], ['catalogos', 'Proveedores'], ['inventario-adm', 'Existencias']]],
    ['Pagar', [['cxp', 'Por pagar'], ['caja', 'Caja chica'], ['prestamos', 'Préstamos'], ['politicas', 'Reglas']]],
    ['Cobrar', [['v-cobro', 'Registrar cobro'], ['v-pagos', 'Cobros hechos'], ['v-deuda', 'Quién debe'], ['c-pagos', 'Pagos por revisar'], ['e-plazos', 'Plazos y reclamos'], ['e-entregas', 'Entregas con foto'], ['v-reportes', 'Comisiones y asientos'], ['v-importar', 'Traer del Excel'], ['c-ficha', 'Enlace del portal']]],
    ['Ventas (solo ver)', [['v-pedido', 'Pedidos'], ['v-clientes', 'Clientes'], ['c-pedidos', 'Pedidos de clientes'], ['ventas', 'Registro de ventas']]],
    ['Precios', [['p-precios', 'Precios por lista'], ['p-clientes', 'Precios por cliente'], ['e-ajustes', 'Descuentos y mora'], ['p-estado', 'Mis cambios']]],
    ['Bancos', [['p-bancos', 'Bancos de la empresa']]],
    ['Flota', [['fl-flota', 'Vehículos'], ['catprod', 'Anterior (solo consulta)']]],
    ['Bonos', [['rh-turnos', 'Turnos y bonos'], ['rh-params', 'Parámetros de turnos y bonos']]],
    ['Sistema', [['manual', 'Manual', 'h'], ['roles', 'Quién ve qué'], ['datos', 'Datos'], ['mis-solic', 'Mis solicitudes', 'h'], ['ayuda', 'Ayuda', 'h']]]]},
  {k: 'prod', t: 'Producción', ic: 'flame', roles: ['produccion'], lead: 'Recibir, producir y cerrar el turno', grupos: [
    ['Turno', [['pr-turno', 'Turno'], ['pr-dif', 'Diferencias']]],
    ['Planta', [['planta', 'Resumen'], ['recepcion', 'Recibir'], ['produccion', 'Producir'], ['mermas', 'Mermas'], ['cotejo', 'Comparar'], ['turnos', 'Turnos']]],
    ['Existencias', [['alm-mp', 'Materia prima'], ['pr-proc', 'En proceso (kilos)'], ['alm-proceso', 'En proceso'], ['alm-pt', 'Producto terminado'], ['pr-inv', 'Inventario terminado'], ['inventario', 'Inventario']]],
    ['Más', [['catprod', 'Equipo'], ['manual', 'Manual', 'h'], ['mis-solic', 'Mis solicitudes', 'h'], ['ayuda', 'Ayuda', 'h']]]]},
  {k: 'vent', t: 'Ventas', ic: 'cart', roles: ['ventas'], lead: 'Vender, clientes y catálogo', grupos: [['Ventas', [['v-pedido', 'Hacer una venta'], ['pr-invv', 'Inventario disponible'], ['c-pedidos', 'Pedidos'], ['v-clientes', 'Clientes y catálogo'], ['clientes', 'Lista de clientes'], ['c-ficha', 'Enlace del portal'], ['v-deuda', 'Quién debe'], ['v-pagos', 'Cobros hechos'], ['ventas', 'Registro de ventas'], ['mis-solic', 'Mis solicitudes', 'h'], ['ayuda', 'Ayuda', 'h']]]]},
  {k: 'log', t: 'Logística', ic: 'truck', roles: ['empaque'], lead: 'Empacar, armar zonas y despachar', grupos: [
    ['Despacho', [['em-tablero', 'Zonas'], ['pr-zonas', 'Pedidos por zona'], ['despachos', 'Despachos'], ['e-entregas', 'Entregas con foto'], ['fl-desp', 'Vehículos'], ['catprod', 'Anterior (solo consulta)']]],
    ['Empaque', [['lg-empacar', 'Empacar por turno'], ['empaque', 'Empaque y stock'], ['alm-logistica', 'Bultos y etiquetas'], ['pr-dif', 'Diferencias']]],
    ['Existencias', [['alm-pt', 'Producto terminado'], ['pr-inv', 'Inventario terminado'], ['inventario', 'Inventario'], ['mermas', 'Mermas']]],
    ['Más', [['manual', 'Manual', 'h'], ['mis-solic', 'Mis solicitudes', 'h'], ['ayuda', 'Ayuda', 'h']]]]},
  {k: 'nom', t: 'Nómina', ic: 'coins', roles: ['rrhh'], lead: 'Pagar, personal y préstamos', grupos: [
    ['En planta', [['rh-planta', 'En planta hoy'], ['rh-turnos', 'Turnos y bonos'], ['turnos', 'Turnos'], ['rh-params', 'Parámetros de turnos y bonos']]],
    ['Personal', [['personal', 'Personas'], ['asistencia', 'Asistencia'], ['rh-pagar', 'Pagar nómina'], ['prestamos', 'Préstamos'], ['nomina', 'Nómina anterior (solo consulta)']]],
    ['Más', [['manual', 'Manual', 'h'], ['mis-solic', 'Mis solicitudes', 'h'], ['ayuda', 'Ayuda', 'h']]]]}
];
const ORDEN_DUENO = ['ger', 'adm', 'prod', 'log', 'vent', 'nom'];
/* Lo que Gerencia ya ve en otra de sus pantallas no se repite */
const DUP_DUENO = {adm: ['rh-turnos', 'v-pedido', 'v-clientes', 'c-pedidos', 'ventas'], nom: ['prestamos']};
const EXT = {rol: null, map: {}, sel: null, busy: false};
/* Funciones extra de un puesto: las que asignó el Gerente Y que el puesto ya puede ver según «Quién ve qué» (el panel nunca concede permisos) */
const extrasDe = r => { if (r === 'dueno') return []; const own = new Set(visibles(r).flatMap(p => planas(p, r))); return [...((EXT.map || {})[r] || [])].filter(k => SCREENS[k] && !own.has(k) && lvlOf(r, k) >= 1); };
const pantDe = k => PANT.find(p => p.k === k);
/* Lo que vive en Gerencia (Por aprobar y Ajustes): el Gerente lo ve ahí y no repetido en las otras pantallas; los demás puestos lo siguen viendo donde lo veían */
const MOV_GER = ['pr-dif', 'c-pagos', 'politicas', 'rh-params', 'e-ajustes', 'p-bancos', 'roles', 'datos', 'gestion', 'pr-aj', 'pr-mot', 'g-extras', 'g-solic', 'p-aprobar', 'g-audit'];
const SOLO_GER = ['pr-aj', 'pr-mot', 'g-extras', 'g-solic', 'p-aprobar', 'g-audit']; /* pantallas que solo Gerencia ve, sin importar lo que diga la matriz */
const tabsRaw = (p, r) => { const gs = p.grupos.map(([g, ts]) => [g, ts.filter(([k]) => SCREENS[k] && lvlOf(r, k) >= 1 && !(k === 'mis-solic' && r === 'dueno') && !(SOLO_GER.includes(k) && r !== 'dueno') && !(r === 'dueno' && p.k !== 'ger' && MOV_GER.includes(k)) && !(r === 'dueno' && (DUP_DUENO[p.k] || []).includes(k)))]).filter(([, ts]) => ts.length);
  return gs; };
/* ---------- Uniones: varias claves viejas pasan a UNA opción del menú con pestañas por dentro. Cada clave vieja sigue existiendo (permisos, enlaces #clave, avisos). ----------
   m: [clave, nombre de la pestaña, [claves que son la misma pantalla]] */
const UNI = [];
let UR = null; /* puesto que se está evaluando (para las pestañas que dependen del puesto) */
const ukeys = u => u.m.filter(m => !m.cond || m.cond(UR || S.rol)).flatMap(m => [m[0], ...(m[2] || [])]);
const uniDe = (pk, k) => UNI.find(u => (!pk || u.p === pk) && ukeys(u).includes(k));
const tabsDe = (p, r) => { const ur = UR; UR = r; try { return tabsDe0(p, r); } finally { UR = ur; } };
const tabsDe0 = (p, r) => { const raw = tabsRaw(p, r), vistas = new Set();
  return raw.map(([g, ts]) => [g, ts.map(t => {
    if (t[2] === 'h' || (r === 'dueno' && p.k === 'prod' && t[0] === 'turnos')) return null; /* Turnos: una sola vez (para Gerencia vive en Personal) */
    const u = UNI.find(x => x.p === p.k && ukeys(x).includes(t[0])); if (!u) return t;
    if (vistas.has(u)) return null; vistas.add(u);
    const acc = ukeys(u).find(k => raw.some(([, xs]) => xs.some(y => y[0] === k && y[2] !== 'h')));
    const hay = u.m.filter(m => (!m.cond || m.cond(r)) && [m[0], ...(m[2] || [])].some(k => raw.some(([, xs]) => xs.some(y => y[0] === k && y[2] !== 'h')))).length;
    return [acc || t[0], u.siempre || hay >= 2 ? u.n : t[1]];
  }).filter(Boolean)]).filter(([, ts]) => ts.length); };
const visibles = r => (r === 'dueno' ? ORDEN_DUENO.map(pantDe) : PANT.filter(p => p.roles.includes(r))).filter(p => r === 'dueno' || tabsDe(p, r).length);
const planas = (p, r) => tabsRaw(p, r).flatMap(([, ts]) => ts.map(t => t[0]));
function pantActual() {
  const vis = visibles(S.rol), r = S.route;
  const cur = vis.find(p => p.k === S.pant && planas(p, S.rol).includes(r)) || vis.find(p => planas(p, S.rol).includes(r)) || null;
  const ext = !cur && extrasDe(S.rol).includes(r) ? (vis.find(p => p.k === S.pant) || vis[0] || null) : null;
  S.pant = (cur || ext) ? (cur || ext).k : null; return cur || ext;
}
window.pantNombre = () => { const p = pantActual(); return p ? p.t : 'Inicio'; };
/* Producción: «Recibir» y «Producir» son las dos pantallas principales (las que tenga permiso el puesto) */
const PRIN_PROD = [['recepcion', 'Recibir', 'truck'], ['produccion', 'Producir', 'flame']];
/* Logística: «Zonas» (tarjetas por zona) y «Empacar» son sus dos pantallas principales */
const PRIN_LOG = [['em-tablero', 'Zonas', 'truck'], ['lg-empacar', 'Empacar', 'pack']];
const prinDe = p => (p.k === 'prod' ? PRIN_PROD : p.k === 'log' ? PRIN_LOG : []).filter(([k]) => planas(p, S.rol).includes(k));
const destino = p => { const l = (S.lastPant || {})[p.k], fl = planas(p, S.rol), pr = prinDe(p);
  if (pr.length) return (pr.find(x => x[0] === 'produccion') || pr[0])[0]; return l && fl.includes(l) ? l : (tabsDe(p, S.rol).flatMap(([, ts]) => ts.map(t => t[0]))[0] || 'pant-vacia'); };

Object.assign(SCREENS, {
  'gerencia':   {mod: 'adm', g: 'Gerencia', t: 'Resumen del negocio', s: 'Resumen', ic: 'chart', r: scrGerencia},
  'adm-resumen': {mod: 'adm', g: 'Administración', t: 'Resumen de la operación', s: 'Resumen', ic: 'chart', r: () => scrGerencia('adm')},
  'log-dev':    {mod: 'home', libre: true, g: 'Logística', t: 'Logística', s: 'Próximamente', ic: 'tag', r: () => `<div class="card"><div class="card-b">${emptyState('Esta pantalla está en desarrollo', 'Todavía no hay nada que hacer aquí. Cuando esté lista aparecerá en esta pestaña. Mientras tanto usa «Bultos y etiquetas».')}</div></div>`},
  'cli-portal': {mod: 'home', libre: true, g: 'Cliente', t: 'Portal del cliente', s: 'Portal', ic: 'users', r: scrPortalCli},
  'g-audit':    {mod: 'adm', g: 'Gerencia', t: 'Auditoría', s: 'Auditoría', ic: 'shield', r: () => (window.vAuditoriaScr ? window.vAuditoriaScr() : '')},
  'g-extras':   {mod: 'adm', g: 'Gerencia', t: 'Funciones extra por puesto', s: 'Funciones extra', ic: 'lock', r: scrExtras},
  'g-solic':    {mod: 'adm', g: 'Gerencia', t: 'Solicitudes de los puestos', s: 'Solicitudes', ic: 'shield', r: scrSolic},
  'ayuda':      {mod: 'home', libre: true, g: 'Ayuda', t: 'Ayuda', s: 'Ayuda', ic: 'book', r: () => (window.scrAyuda ? window.scrAyuda() : '')},
  'mis-solic':  {mod: 'home', libre: true, g: 'Solicitudes', t: 'Mis solicitudes', s: 'Mis solicitudes', ic: 'shield', r: scrMisSolic},
  'pant-vacia': {mod: 'home', libre: true, g: 'Inicio', t: 'Sin pantalla', s: 'Inicio', ic: 'map', r: () => `<div class="card"><div class="card-b">${emptyState('Tu puesto todavía no tiene pantalla', 'Pide al Gerente que te asigne una. Mientras tanto no hay nada que hacer aquí.')}</div></div>`}
});
Object.assign(PERM_DEF, {gerencia: '', 'g-audit': '', 'g-extras': '', 'g-solic': '', 'adm-resumen': 'adm:1'});
ROLE_HOME.adm = 'adm-resumen'; ROLE_HOME.empaque = 'em-tablero'; ROLE_HOME.rrhh = 'rh-planta';
S.perm = permInit();

/* ---------- Gerencia: resumen del mes en 5 bloques (solo cifras reales; si no hay dato: «Sin datos») ---------- */
const GER = {est: null, doc: null, ent: null, busy: false};
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function gerMes() { /* del día 1 de este mes a hoy, con la fecha local */
  const h = new Date(), p = n => String(n).padStart(2, '0'), y = h.getFullYear(), m = h.getMonth() + 1;
  return {d: y + '-' + p(m) + '-01', h: y + '-' + p(m) + '-' + p(h.getDate()), t: '1 al ' + h.getDate() + ' de ' + MESES[m - 1], ms: new Date(y, m - 1, 1).getTime(), me: new Date(y, m - 1, h.getDate() + 1).getTime()};
}
async function gerApi(ruta) { const r = await fetch('/api/v' + ruta, {headers: {'x-rol': S.rol}}); if (!r.ok) throw new Error(ruta); return r.json(); }
async function gerCargar() {
  if (GER.busy) return; GER.busy = true; const M = gerMes();
  const pide = async (k, ruta) => { try { GER[k] = await gerApi(ruta); } catch (e) { GER[k] = null; } };
  const tab = async () => { try { GER.tab = window.prApi && (S.rol === 'dueno' || lvlOf(S.rol, 'pr-zonas') >= 1) ? await window.prApi('GET', '/tablero') : null; } catch (e) { GER.tab = null; } };
  const flota = async () => { try { const r = await fetch('/api/f/vehiculos?todos=1', {headers: {'x-rol': S.rol}}); GER.veh = r.ok ? (await r.json()).vehiculos : null; } catch (e) { GER.veh = null; } };
  const solic = async () => { try { GER.sol = S.rol === 'dueno' ? (await window.solApi('GET', '/conteo')).pendientes : null; } catch (e) { GER.sol = null; } };
  const planta = async () => { try { const r = await fetch('/api/h/conteo', {headers: {'x-rol': S.rol}}); GER.pl = r.ok ? await r.json() : null; } catch (e) { GER.pl = null; } };
  await Promise.all([solic(), planta(), pide('doc', '/documentos?desde=' + M.d + '&hasta=' + M.h), pide('ent', '/entregas/'), pide('deuda', '/deuda'), pide('prec', '/precios/pendientes'), pide('ped', '/portal/pedidos?estado=POR_CONFIRMAR'), pide('pag', '/portal/pagos?estado=POR_VERIFICAR'), pide('disp', '/entregas/disputas'), tab(), flota()]);
  GER.est = 'ok'; GER.busy = false; GER.ts = Date.now(); try { render(); } catch (e) { /* sin pantalla */ }
}
const gUsd = x => '$ ' + N2.format(x);
const gEnMes = (f, M) => !!f && String(f).slice(0, 10) >= M.d && String(f).slice(0, 10) <= M.h;
const META_K = {ventas: 'Ventas', compras: 'Límite de compra', desp: 'Despacho', ent: 'Logística'};
const metas = () => { try { return (one('ajustes', 'metas_mes') || {}); } catch (e) { return {}; } };
function gMedidor(k, val, fmt) { /* semicírculo: arco gris = meta, arco rojo = avance */
  const cl = k === 'compras', SM = cl ? 'Sin límite' : 'Sin meta', m = +metas()[k] || 0, ok = val != null && m > 0, pct = ok ? val / m * 100 : 0, arco = Math.min(100, pct);
  return '<svg class="gr-gauge" viewBox="0 0 120 68" role="img" aria-label="' + (ok ? (cl && pct > 100 ? 'Límite superado. ' : '') + 'Avance ' + N0.format(pct) + ' %' : SM) + '"><path d="M10 60A50 50 0 0 1 110 60" pathLength="100" fill="none" stroke="#E4E1DA" stroke-width="11" stroke-linecap="round"/>' +
    (ok && arco > 0 ? '<path d="M10 60A50 50 0 0 1 110 60" pathLength="100" fill="none" stroke="' + (cl && pct <= 100 ? '#F2B72E' : '#C92121') + '" stroke-width="11" stroke-linecap="round" stroke-dasharray="' + arco + ' 100"/>' : '') +
    '<circle cx="110" cy="60" r="3.5" fill="#F2B72E"/>' + (cl && pct > 100 ? '<path d="M12 4l9 15H3z" fill="#F2B72E" stroke="#C92121" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v4M12 16.5v.5" stroke="#C92121" stroke-width="2" stroke-linecap="round"/>' : '') + '<text x="60" y="52" text-anchor="middle" class="gr-gt' + (ok ? '' : ' muted') + '">' + (ok ? N0.format(pct) + ' %' : SM) + '</text></svg>' +
    '<p class="gr-meta">' + (m > 0 ? (cl ? 'Límite de compra: ' : 'Meta: ') + fmt(m) : '&nbsp;') + '</p>';
}
/* ¿Este puesto puede abrir esa pantalla? (si no, la tarjeta no ofrece el enlace) */
const gVa = k => k && (S.rol === 'dueno' || lvlOf(S.rol, k) >= 1);
const gPrim = l => l.find(gVa) || l[0];
const gSinCifra = v => v === 'Sin datos' || v === 'No calculable' || v === 'No calculado' || v === '…';
function gBloque(titulo, cifras, enlace, extra, k, sec, cls) {
  return '<article class="card gr-card ' + (cls || 'gr-w3') + '"><div class="card-b"><h2>' + titulo + '</h2>' +
    (k && S.rol === 'dueno' ? '<button type="button" class="lnk gr-fijar" data-act="metaAbrir" data-k="' + k + '">' + (k === 'compras' ? 'Fijar límite' : 'Fijar meta') + '</button>' : '') +
    '<div class="gr-body"><div class="gr-l">' + cifras.map(c => '<div class="gr-c"><b class="' + (gSinCifra(c.v) ? 'muted' : '') + '">' + c.v + '</b><span>' + c.l + '</span></div>').join('') +
    (sec && sec.length ? '<div class="gr-sec">' + sec.map(x => '<p><span>' + x[0] + '</span><b>' + x[1] + '</b></p>').join('') + '</div>' : '') + '</div>' +
    (extra ? '<div class="gr-r">' + extra + '</div>' : '') + '</div>' +
    (gVa(enlace) ? '<a class="btn pri gr-btn" href="#' + enlace + '">Ver detalle</a>' : '') + '</div></article>';
}
function gBarras(mm, M) {
  const g = {}; mm.filter(m => gEnMes(m.fecha, M) && m.estado !== 'rech').forEach(m => { const n = String(m.prod || m.causa || m.etapa || 'Otros').trim() || 'Otros'; g[n] = (g[n] || 0) + (+m.usd || 0); });
  let l = Object.entries(g).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
  if (!l.length) return '<p class="gr-meta">Sin mermas este mes</p>';
  if (l.length > 6) { const o = l.slice(5).reduce((a, x) => a + x[1], 0); l = l.slice(0, 5).concat([['Otros', o]]); }
  const mx = l[0][1];
  return '<div class="gr-bars">' + l.map(([n, v]) => '<div class="gr-br"><span title="' + esc(n) + '">' + esc(n) + '</span><i><u style="width:' + Math.max(3, v / mx * 100) + '%"></u></i><b>' + gUsd(v) + '</b></div>').join('') + '</div>';
}
/* Tendencia por día: una barra por día, del 1 al de hoy */
function gTend(titulo, porDia, total, M, fmt) {
  if (!porDia) return '<section class="card gr-tr"><div class="gr-trh"><h3>' + titulo + '</h3><b class="muted">Sin datos</b></div></section>';
  const n = +M.h.slice(8), v = []; for (let i = 1; i <= n; i++) v.push(porDia[i] || 0);
  const mx = Math.max(0, ...v), im = mx > 0 ? v.lastIndexOf(mx) : -1, cab = '<div class="gr-trh"><h3>' + titulo + '</h3><b class="' + (gSinCifra(total) ? 'muted' : '') + '">' + total + '</b></div>';
  if (!(mx > 0)) return '<section class="card gr-tr">' + cab + '<p class="gr-vacio">Sin movimiento este mes</p></section>';
  const marca = i => i === 1 || i === 5 || i === 10 || i === n;
  return '<section class="card gr-tr">' + cab + '<div class="gr-tg"><span class="gr-tmax">Máx. ' + fmt(mx) + '</span><div class="gr-tb" role="img" aria-label="' + titulo + '">' + v.map((x, i) => '<u class="' + (i === im ? 'mx ' : '') + (i + 1 === n ? 'hoy' : '') + '" title="Día ' + (i + 1) + ': ' + fmt(x) + '" style="height:' + (x > 0 ? Math.max(4, x / mx * 100) : 2) + '%"></u>').join('') + '</div></div><div class="gr-tx">' + v.map((x, i) => '<span class="' + (i + 1 === n ? 'on' : '') + '">' + (marca(i + 1) ? (i + 1 === n && n > 1 ? 'Hoy' : i + 1) : '') + '</span>').join('') + '</div></section>';
}
/* Punto de equilibrio del mes = costos fijos / (1 - costos variables / ventas). Fijos y variables: los «Gastos fijos / variables del mes» que ya muestra Control de gestión. */
function gEquilibrio(vv) {
  let F = null, Vr = null; try { F = DATA.gastosFijos.reduce((a, g) => a + (+g[1] || 0), 0); Vr = DATA.gastosVar.reduce((a, g) => a + (+g[1] || 0), 0); } catch (e) { /* sin dato */ }
  const sd = m => ({v: 'No calculado', m});
  if (vv == null) return sd('Faltan las ventas del mes');
  if (!(F > 0)) return sd('No hay gastos fijos cargados');
  if (!(vv > 0)) return {v: 'No calculado', m: 'Todavía no hay ventas este mes'};
  const mg = 1 - Vr / vv;
  if (!(mg > 0)) return {v: 'No calculable', m: 'Los costos variables igualan o superan las ventas'};
  const pe = F / mg, pct = vv / pe * 100;
  return {v: gUsd(pe), pe, pct, vv};
}
/* Vehículos: dónde está cada camión o autobús y qué carga lleva (lo anota una persona; sin GPS). Hasta 4 a la vista. */
function gVehiculos() {
  const V = GER.veh, T = window.flTxt || {}, orden = {RUTA: 0, PLANTA: 1, TALLER: 2, FUERA_SERVICIO: 3};
  let cuerpo;
  if (!Array.isArray(V)) cuerpo = '<p class="gr-meta">' + (GER.est === 'ok' ? 'Sin datos' : '…') + '</p>';
  else if (!V.length) cuerpo = '<p class="gr-meta">Sin vehículos cargados</p>';
  else {
    const L = V.slice().sort((a, b) => (orden[a.donde] - orden[b.donde]) || String(a.placa).localeCompare(String(b.placa)));
    cuerpo = '<ul class="gr-vl">' + L.slice(0, 4).map(v => '<li class="d-' + v.donde + '"><p class="gr-vn"><b>' + esc(v.marca_modelo || v.placa) + '</b><span>' + esc(v.placa) + '</span></p><p class="gr-vd"><b>' + esc(T.donde ? T.donde(v) : v.donde_txt) + '</b><span>' + esc(T.desde ? T.desde(v) : '') + '</span></p><p class="gr-vc">' + esc(T.carga ? T.carga(v) : '') + '</p></li>').join('') + '</ul>' +
      (V.length > 4 && gVa('fl-flota') ? '<a class="lnk gr-vall" href="#fl-flota">Ver todos (' + V.length + ')</a>' : '');
  }
  return '<article class="card gr-card gr-veh"><div class="card-b"><h2>Vehículos</h2>' + cuerpo + (gVa('fl-flota') ? '<a class="btn pri gr-btn" href="#fl-flota">Ver detalle</a>' : '') + '</div></article>';
}
const GR_ICO = '<svg class="gr-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l10 18H2z" fill="#F2B72E" stroke="#C92121" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v5M12 17.5v.5" stroke="#C92121" stroke-width="2" stroke-linecap="round"/></svg>';
function gAlertas() {
  const c = (x, k) => Array.isArray(x) ? x.length : (x && x[k] != null ? +x[k] : null);
  let L = [[GER.prec ? +GER.prec.pendientes || 0 : null, 'Precios por aprobar', 'p-aprobar'], [c(GER.pag), 'Pagos por verificar', 'c-pagos'], [c(GER.ped), 'Pedidos del portal por confirmar', 'c-pedidos'], [Array.isArray(GER.disp) ? GER.disp.filter(x => x.estado === 'ABIERTA').length : null, 'Reclamos de entrega abiertos', 'e-plazos'], [typeof mrNuevas === 'function' ? mrNuevas().length : null, 'Mermas nuevas (24 h)', 'mermas']];
  if (S.rol === 'dueno') L.push([GER.sol == null ? null : GER.sol, 'Solicitudes por responder', 'g-solic']);
  if (S.rol !== 'dueno') L = L.filter(x => x[0] != null && (gVa(x[2]) || x[2] === 'mermas')); /* sin pantalla propia, las mermas nuevas se muestran sin enlace */
  const todo0 = L.every(x => x[0] === 0);
  return '<section class="card gr-al"><h3>Requiere atención</h3>' + (todo0 ? '<p class="gr-ok">Sin pendientes</p>' : '<div class="gr-alg" style="--n:' + L.length + '">' + L.map(x => '<' + (gVa(x[2]) ? 'a href="#' + x[2] + '"' : 'div') + ' class="' + (x[0] ? 'on' : '') + '"><b>' + (x[0] > 0 ? GR_ICO : '') + (x[0] == null ? 'Sin datos' : x[0]) + '</b><span>' + x[1] + '</span></' + (gVa(x[2]) ? 'a' : 'div') + '>').join('') + '</div>') + '</section>';
}
function gZonas() {
  const T = GER.tab; if (!T || !Array.isArray(T.activas)) return '<section class="card gr-zn"><div class="gr-trh"><h3>Zonas</h3><b class="muted">Sin datos</b></div></section>';
  const meta = +T.meta_kg || 0, kg = x => N0.format(x) + ' kg', z = T.activas;
  const filas = z.slice(0, 4).map(a => '<div class="gr-z"><p><span>' + esc(a.zona) + '</span><b>' + kg(a.kilos) + '</b></p><i><u style="width:' + (meta > 0 ? Math.min(100, a.kilos / meta * 100) : 0) + '%"></u></i></div>').join('');
  return '<section class="card gr-zn"><div class="gr-trh"><h3>Zonas' + (meta > 0 ? ' · meta ' + N0.format(meta / 1000) + ' t' : '') + '</h3>' + (z.length > 4 ? '<a class="lnk" href="#pr-zonas">Ver todas</a>' : '') + '</div>' + (z.length ? '<div class="gr-zg">' + filas + '</div>' : '<p class="gr-ok">Sin pedidos por despachar</p>') + '</section>';
}
/* En planta hoy: solo el conteo (total y por turno), de solo lectura; el enlace solo si el puesto tiene la pantalla */
function gPlanta() {
  const P = GER.pl, ok = P && typeof P.total === 'number', pt = (P && P.por_turno) || {}, v = ok ? P.total : (GER.est === 'ok' ? 'Sin datos' : '…');
  const cuerpo = '<span>En planta hoy:</span> <b class="' + (ok ? '' : 'muted') + '">' + v + '</b>' + (ok ? '<small>Mañana ' + (pt['Mañana'] || 0) + ' · Tarde ' + (pt['Tarde'] || 0) + '</small>' : '');
  return gVa('rh-planta') ? '<a class="gr-pl" href="#rh-planta">' + cuerpo + '</a>' : '<div class="gr-pl">' + cuerpo + '</div>';
}
function scrGerencia(modo) {
  const adm = modo === 'adm';
  if (GER.rol !== S.rol && !GER.busy) { GER.rol = S.rol; GER.est = null; GER.tab = null; }
  if (!GER.est || (GER.est === 'ok' && !GER.busy && Date.now() - (GER.ts || 0) > 5000)) gerCargar(); /* se actualiza al volver a entrar */
  const M = gerMes(), SD = 'Sin datos', col = c => { try { return typeof rows === 'function' ? rows(c) : null; } catch (e) { return null; } };
  const cargando = GER.est !== 'ok', dia = f => +String(f).slice(8, 10);
  /* Ventas: cada venta una sola vez (la nota ya facturada cuenta como factura) */
  const docs = GER.doc ? GER.doc.filter(d => !/^ANULAD/.test(d.estado || '') && d.estado !== 'FACTURADO_DESDE_NE') : null;
  const vv = docs ? docs.reduce((a, d) => a + (d.total_cents || 0), 0) / 100 : null;
  const vDia = docs ? docs.reduce((o, d) => { const i = dia(d.fecha_emision); o[i] = (o[i] || 0) + (d.total_cents || 0) / 100; return o; }, {}) : null;
  /* Administración: compras del mes (cantidad × precio) */
  const cm = col('compras'), cmes = cm ? cm.filter(c => gEnMes(c.fecha, M)) : null, cv = cmes ? cmes.reduce((a, c) => a + (+c.qf || 0) * (+c.pu || 0), 0) : null;
  const cDia = cmes ? cmes.reduce((o, c) => { const i = dia(c.fecha); o[i] = (o[i] || 0) + (+c.qf || 0) * (+c.pu || 0); return o; }, {}) : null;
  let porPagar = null, caja = null; try { porPagar = cxpBuckets().total; } catch (e) { /* sin dato */ } try { caja = cajaResumen().disponible; } catch (e) { /* sin dato */ }
  /* Producción: mermas del mes por producto; la nómina se anota por quincena, no por día */
  const mm = col('mermas'), lt = col('lotes'), kilos = lt ? lt.filter(l => gEnMes(l.fecha, M)).reduce((a, l) => a + (+l.cruda || 0), 0) : null;
  /* Despacho: notas de entrega emitidas en el mes */
  const dm = col('despachos'), dmes = dm ? dm.filter(n => gEnMes(n.fecha, M) && !/anulad/i.test(n.estado || '')) : null, desp = dmes ? dmes.length : null;
  const dDia = dmes ? dmes.reduce((o, n) => { const i = dia(n.fecha); o[i] = (o[i] || 0) + 1; return o; }, {}) : null;
  /* Logística: entregas con foto registradas en el mes */
  const ent = Array.isArray(GER.ent) ? GER.ent.filter(e => e.estado !== 'RECHAZADA' && e.subido_ts >= M.ms && e.subido_ts < M.me).length : null;
  const n = (x, u1, u2) => x == null ? (cargando ? '…' : SD) : x + ' ' + (x === 1 ? u1 : u2), nf = x => N0.format(x), u = x => x == null ? SD : gUsd(x);
  const zonasOk = !adm || !!(GER.tab && Array.isArray(GER.tab.activas));
  return `<h1 class="sr">${adm ? 'Administración' : 'Gerencia'}</h1>
  <div class="gr-top"><p class="gr-per">Resumen del mes: ${M.t}</p>${gPlanta()}</div>
  <div class="gr-grid${adm ? ' gr-adm' : ''}">
    ${gBloque('Ventas', [{v: vv != null ? gUsd(vv) : (cargando ? '…' : SD), l: 'Total vendido del mes'}], adm ? gPrim(['ventas', 'v-pagos', 'v-pedido']) : 'v-pedido', adm ? '' : gMedidor('ventas', vv, gUsd), 'ventas', [['Por cobrar', GER.deuda ? gUsd(GER.deuda.total || 0) : (cargando ? '…' : SD)]])}
    ${gBloque('Administración', [{v: cv != null ? gUsd(cv) : SD, l: 'Compras del mes'}], 'analisis', adm ? '' : gMedidor('compras', cv, gUsd), 'compras', [['Por pagar a proveedores', u(porPagar)], ['Caja chica', u(caja)]])}
    ${adm ? '' : (() => { const E = gEquilibrio(vv); return gBloque('Punto de equilibrio', [{v: E.v, l: 'Ventas mínimas del mes'}], 'gestion', E.pe ? '<div class="gr-pb" role="img" aria-label="Avance ' + N0.format(E.pct) + ' %"><u style="width:' + Math.min(100, E.pct) + '%"></u></div><p class="gr-meta">Llevas ' + gUsd(E.vv) + ' de ' + gUsd(E.pe) + ' (' + N0.format(E.pct) + ' %)</p>' : '<p class="gr-meta">' + E.m + '</p>', null, null, 'gr-pe'); })()}
    ${gBloque('Producción', adm ? [{v: kilos != null ? nf(kilos) + ' kg' : (cargando ? '…' : SD), l: 'Kilos procesados del mes'}] : [{v: SD, l: 'Nómina de hoy'}], 'mermas', '<div class="gr-pm"><p class="gr-meta">Mermas del mes</p>' + (mm ? gBarras(mm, M) : '<p class="gr-meta">' + SD + '</p>') + '</div>', null, adm ? null : [['Kilos procesados', kilos != null ? nf(kilos) + ' kg' : SD], ['Bultos empacados', SD]], 'gr-prod')}
    ${gVehiculos()}
  </div>
  <div class="gr-fila3${zonasOk ? '' : ' gr-f2'}">${(() => { const v = n(desp, 'nota', 'notas'); return '<section class="card gr-tr gr-dm"><div class="gr-trh"><h3>Despachos del mes</h3></div><div class="gr-c"><b class="' + (gSinCifra(v) ? 'muted' : '') + '">' + v + '</b><span>Notas de entrega del ' + M.t + '</span></div>' + (adm && gVa('despachos') ? '<a class="lnk" href="#despachos">Ver despachos</a>' : '') + '</section>'; })()}${gAlertas()}${zonasOk ? gZonas() : ''}</div>`;
}
function gMetaAbrir(k) {
  const v = +metas()[k] || '';
  modal(k === 'compras' ? 'Límite de compra del mes' : 'Meta del mes · ' + META_K[k], '<label for="meta-v">' + (k === 'compras' ? 'Límite de compra en $' : k === 'ventas' ? 'Meta en $' : 'Meta en cantidad') + '</label><input id="meta-v" type="number" min="0" step="any" value="' + v + '" style="width:100%;margin-top:6px"><div class="btnrow" style="margin-top:12px"><button type="button" class="btn pri" data-act="metaGuardar" data-k="' + k + '">' + (k === 'compras' ? 'Guardar límite' : 'Guardar meta') + '</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div>');
  setTimeout(() => { const i = document.getElementById('meta-v'); if (i) i.focus(); }, 0);
}
async function gMetaGuardar(k) {
  const x = document.getElementById('meta-v'), v = x ? +x.value : NaN;
  if (x && x.value === '') return toast(k === 'compras' ? 'Escribe el límite de compra del mes.' : 'Escribe la meta del mes.', 'warn');
  if (!(v >= 0)) return toast('Escribe un número igual o mayor que cero.', 'warn');
  await run('meta-' + k, async () => { await W.set('ajustes', 'metas_mes', {...metas(), [k]: v}); closeModal(); }, k === 'compras' ? 'Límite de compra guardado.' : 'Meta guardada.');
}
Object.assign(ACT, {metaAbrir: el => gMetaAbrir(el.dataset.k), metaGuardar: el => gMetaGuardar(el.dataset.k)});
WRITE_ACTS.add('metaGuardar');
function scrPortalCli() {
  return `<div class="card"><div class="card-b"><p class="empty-t">Portal del cliente</p><p>Es la página donde cada cliente ve su cuenta con su enlace personal. Los enlaces se crean en «Fichas y enlaces».</p>
    <div class="btnrow"><a class="btn pri" href="/cliente.html" target="_blank" rel="noopener">Abrir el portal del cliente</a></div></div></div>`;
}

/* ---------- Solicitudes de autorización: un puesto pide al Gerente permiso para cambiar algo; el Gerente aprueba o rechaza (aprobar solo marca: el cambio lo hace él en su pantalla) ---------- */
const SOL = {rol: null, mias: null, todas: null, asuntos: ['Una meta o su ajuste', 'Una regla de pago de nómina', 'Un porcentaje o una tasa', 'Un permiso de mi puesto', 'Una política o ajuste del sistema', 'Otro cambio'], busy: false, err: '', ver: 'PENDIENTE'};
async function solApi(m, ruta, cuerpo) {
  const r = await fetch('/api/s' + ruta, {method: m, headers: {'content-type': 'application/json', 'x-rol': S.rol}, body: cuerpo ? JSON.stringify(cuerpo) : undefined});
  let j = {}; try { j = await r.json(); } catch (e) { /* sin cuerpo */ }
  if (!r.ok) { const e = new Error(j.error || 'No se pudo completar la operación.'); e.status = r.status; throw e; }
  return j;
}
const solFecha = ts => { if (!ts) return ''; const d = new Date(ts - 4 * 3600e3), p = n => String(n).padStart(2, '0'); return p(d.getUTCDate()) + '/' + p(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear(); };
const solChip = x => chip(esc(x.estado_txt), x.estado === 'APROBADA' ? 'ok' : x.estado === 'RECHAZADA' ? 'crit' : 'warn');
function solCargar() {
  if (SOL.rol !== S.rol) { SOL.rol = S.rol; SOL.mias = null; SOL.todas = null; SOL.err = ''; }
  const dueno = S.rol === 'dueno', k = dueno ? 'todas' : 'mias';
  if (SOL[k] || SOL.busy) return; SOL.busy = true;
  solApi('GET', dueno ? '/todas' : '/propias').then(d => { SOL[k] = d; if (d.asuntos) SOL.asuntos = d.asuntos; SOL.err = ''; }).catch(e => { SOL.err = e.message; SOL[k] = {solicitudes: [], pendientes: 0}; })
    .finally(() => { SOL.busy = false; if (S.route === 'g-solic' || S.route === 'mis-solic') render(); });
}
const solRefrescar = () => { SOL.mias = null; SOL.todas = null; GER.est = null; render(); };
/* Ventana corta: qué quiere cambiar (lista o texto breve) y el motivo (obligatorio) */
function solPedirAbrir(asunto) {
  const op = SOL.asuntos.map(a => `<option ${a === asunto ? 'selected' : ''}>${esc(a)}</option>`).join('');
  modal('Pedir autorización', `<div class="form"><p>Tu solicitud le llega al Gerente. Cuando la responda, verás la respuesta en «Mis solicitudes».</p>
    <label class="fld">¿Qué quieres cambiar?<select id="so-as">${op}</select></label>
    <label class="fld">O escríbelo con tus palabras (opcional)<input type="text" id="so-tx" maxlength="80" autocomplete="off"></label>
    <label class="fld">Motivo (obligatorio)<textarea id="so-mo" rows="3" maxlength="500"></textarea></label>
    <p class="err" id="so-e" role="alert" hidden></p>
    <div class="btnrow"><button type="button" class="btn pri" data-act="solEnviar" data-p="${esc(S.route)}">Enviar solicitud</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`);
}
async function solEnviar(el) {
  const e = $('#so-e'); e.hidden = true; if (SOL.busy) return;
  const asunto = ($('#so-tx').value.trim() || $('#so-as').value), motivo = $('#so-mo').value.trim();
  if (!motivo) { e.textContent = 'Escribe el motivo: es obligatorio.'; e.hidden = false; return; }
  SOL.busy = true;
  try { await solApi('POST', '/', {asunto, motivo, pantalla: el.dataset.p || ''}); closeModal(); toast('Solicitud enviada al Gerente.'); SOL.busy = false; solRefrescar(); }
  catch (er) { e.textContent = er.message; e.hidden = false; } finally { SOL.busy = false; }
}
const solBtn = (asunto, cls) => `<button type="button" class="btn ${cls || ''}" data-act="solPedir" data-a="${esc(asunto || '')}">${ic('shield', 16)}Pedir autorización</button>`;
/* Mis solicitudes (todos los puestos menos Gerencia) */
function scrMisSolic() {
  solCargar();
  const D = SOL.mias, L = D ? D.solicitudes : [];
  return `${ph('', 'Mis solicitudes', '', solBtn('', 'pri'))}
  ${card('Mis solicitudes', !D ? '<p class="hint">Cargando…</p>' : L.length ? table([{h: 'Fecha', f: x => solFecha(x.creado_ts)}, {h: 'Qué quiero cambiar', f: x => `<b>${esc(x.asunto)}</b><br><span class="muted">${esc(x.motivo)}</span>`}, {h: 'Estado', f: x => solChip(x)}, {h: 'Respuesta del Gerente', f: x => x.respuesta ? esc(x.respuesta) : '<span class="muted">Todavía sin respuesta</span>'}], L) : emptyState('Todavía no has pedido nada', 'Si necesitas que el Gerente cambie algo, usa «Pedir autorización».'), {sub: 'Lo que pediste y lo que respondió el Gerente'})}
  ${SOL.err ? `<p class="err" role="alert">${esc(SOL.err)}</p>` : ''}`;
}
/* Solicitudes (solo Gerencia) */
function scrSolic() {
  solCargar();
  const D = SOL.todas, L = D ? D.solicitudes : [], ver = SOL.ver, F = L.filter(x => ver === 'TODAS' || x.estado === ver);
  const tab = (k, t) => `<button type="button" class="btn sm ${ver === k ? 'pri' : ''}" data-act="solVer" data-v="${k}">${t}</button>`;
  return `${ph('', 'Solicitudes', '', `<div class="btnrow">${tab('PENDIENTE', 'Por responder' + (D && D.pendientes ? ' (' + D.pendientes + ')' : ''))}${tab('TODAS', 'Todas')}</div>`)}
  ${card('Solicitudes de los puestos', !D ? '<p class="hint">Cargando…</p>' : F.length ? table([{h: 'Fecha', f: x => solFecha(x.creado_ts)}, {h: 'Puesto', f: x => esc(x.rol_txt)}, {h: 'Quiere cambiar', f: x => `<b>${esc(x.asunto)}</b><br><span class="muted">${esc(x.motivo)}</span>`}, {h: 'Estado', f: x => solChip(x)},
    {h: '', f: x => x.estado === 'PENDIENTE' ? `<div class="btnrow"><button type="button" class="btn sm pri" data-act="solResp" data-id="${x.id}" data-a="APROBAR">Aprobar</button><button type="button" class="btn sm" data-act="solResp" data-id="${x.id}" data-a="RECHAZAR">Rechazar</button></div>` : esc(x.respuesta || '')}], F) : emptyState(ver === 'PENDIENTE' ? 'No hay solicitudes por responder' : 'Todavía no hay solicitudes', 'Cuando un puesto pida autorización, aparecerá aquí.'), {sub: 'Aprobar solo marca la solicitud: el cambio lo haces tú después, en su pantalla.'})}
  ${SOL.err ? `<p class="err" role="alert">${esc(SOL.err)}</p>` : ''}`;
}
function solRespAbrir(id, a) {
  const apr = a === 'APROBAR';
  modal(apr ? 'Aprobar solicitud' : 'Rechazar solicitud', `<div class="form"><p>${apr ? 'Se marcará como aprobada. El cambio lo haces tú luego en su pantalla.' : 'Se marcará como rechazada y el puesto verá tu comentario.'}</p>
    <label class="fld">Comentario${apr ? ' (opcional)' : ' (obligatorio)'}<textarea id="so-r" rows="3" maxlength="300"></textarea></label>
    <p class="err" id="so-e" role="alert" hidden></p>
    <div class="btnrow"><button type="button" class="btn pri" data-act="solResOk" data-id="${id}" data-a="${a}">${apr ? 'Aprobar' : 'Rechazar'}</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`);
}
async function solResOk(el) {
  const e = $('#so-e'); e.hidden = true; if (SOL.busy) return; const respuesta = $('#so-r').value.trim();
  if (el.dataset.a === 'RECHAZAR' && !respuesta) { e.textContent = 'Escribe por qué la rechazas.'; e.hidden = false; return; }
  SOL.busy = true;
  try { await solApi('POST', '/' + el.dataset.id + '/resolver', {accion: el.dataset.a, respuesta}); closeModal(); toast(el.dataset.a === 'APROBAR' ? 'Solicitud aprobada.' : 'Solicitud rechazada.'); SOL.busy = false; solRefrescar(); }
  catch (er) { e.textContent = er.message; e.hidden = false; } finally { SOL.busy = false; }
}
Object.assign(ACT, {solPedir: el => solPedirAbrir(el.dataset.a), solEnviar, solResp: el => solRespAbrir(el.dataset.id, el.dataset.a), solResOk, solVer: el => { SOL.ver = el.dataset.v; render(); }});
window.solBtn = solBtn; window.solApi = solApi; window.solApi = solApi;

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
  const rh = ROLE_HOME[S.rol] === 'em-tablero' && vis.some(p => p.k === 'log' && planas(p, S.rol).includes('em-tablero')) ? 'em-tablero' : prinDe(vis.find(p => p.k === 'prod') || {}).length && vis.some(p => p.k === 'prod' && S.rol !== 'dueno') ? destino(vis.find(p => p.k === 'prod')) : ROLE_HOME[S.rol], prim = vis.find(p => rh && planas(p, S.rol).includes(rh)) || vis[0];
  return planas(prim, S.rol).includes(rh) ? rh : destino(prim);
};

/* ---------- Lanzador «Opciones»: un botón de cuadrícula que abre iconos grandes con TODAS las opciones de la pantalla ---------- */
const IC_OP = {gerencia: 'chart', 'g-audit': 'shield', 'adm-resumen': 'chart', gestion: 'gauge', mapa: 'map', ayuda: 'book', 'p-aprobar': 'check', 'g-extras': 'lock', 'g-solic': 'shield', 'mis-solic': 'shield', 'c-pedido': 'cart', 'compras-mp': 'potato', 'compras-gen': 'cart', analisis: 'compare', catalogos: 'book', 'inventario-adm': 'warehouse',
  cxp: 'receipt', caja: 'coins', prestamos: 'wallet', politicas: 'shield', 'v-cobro': 'coins', 'v-pagos': 'check', 'v-deuda': 'alert', 'c-pagos': 'receipt', 'e-plazos': 'calendar', 'v-reportes': 'chart', 'v-importar': 'file',
  'p-precios': 'tag', 'p-clientes': 'users', 'e-ajustes': 'sliders', 'p-estado': 'clip', 'p-bancos': 'wallet', 'fl-flota': 'truck', 'fl-desp': 'truck', 'rh-planta': 'users', 'rh-pagar': 'coins', 'rh-turnos': 'calendar', 'rh-params': 'sliders', turnos: 'calendar', personal: 'users', asistencia: 'calendar', nomina: 'coins', manual: 'book', roles: 'shield', datos: 'layers',
  planta: 'gauge', recepcion: 'truck', produccion: 'flame', empaque: 'pack', mermas: 'drop', cotejo: 'compare', 'alm-mp': 'potato', 'alm-proceso': 'layers', 'alm-pt': 'box', inventario: 'warehouse', catprod: 'users',
  'v-pedido': 'cart', 'v-clientes': 'users', ventas: 'receipt', clientes: 'users', 'c-pedidos': 'clip', 'alm-logistica': 'tag', 'log-dev': 'tag', despachos: 'truck', 'e-entregas': 'box', 'c-ficha': 'users', 'cli-portal': 'users', 'pr-zonas': 'truck', 'em-tablero': 'truck', 'lg-empacar': 'pack', 'pr-turno': 'flame', 'pr-dif': 'alert', 'pr-mot': 'sliders', 'pr-aj': 'sliders', 'pr-proc': 'flame', 'pr-inv': 'box'};
const icGrid = n => '<svg class="ic" width="' + n + '" height="' + n + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></svg>';
const nombreGlobal = k => { for (const p of PANT) for (const [, ts] of p.grupos) { const x = ts.find(([c]) => c === k); if (x) return x[1]; } const s = SCREENS[k]; return s ? s.s || s.t : k; };
const nombreOp = (p, k) => { const un = uniDe(p.k, k); if (un) return un.n; for (const [, ts] of tabsDe(p, S.rol).concat([['', extrasDe(S.rol).map(c => [c, nombreGlobal(c)])]])) { const x = ts.find(([c]) => c === k); if (x) return x[1]; } const s = SCREENS[k]; return s ? s.s || s.t : ''; };
function launcherHTML(p) {
  const B = badges(), gs = tabsDe(p, S.rol), ex = extrasDe(S.rol);
  const tile = ([k, n]) => { const un = uniDe(p.k, k), ks = un ? ukeys(un) : [k]; let nb = 0, tb = ''; ks.forEach(x => { if (B[x] && B[x][0]) { nb = un && un.maximo ? Math.max(nb, B[x][0]) : nb + B[x][0]; tb = tb || B[x][1]; } });
    return '<a class="pt-op" role="menuitem" data-k="' + k + '" href="#' + k + '"' + (ks.includes(S.route) ? ' aria-current="page"' : '') + '>' + ic(IC_OP[k] || 'file', 30) + '<span class="pt-opn">' + n + '</span>' + (nb ? '<span class="badge ' + tb + '">' + nb + '</span>' : '') + '</a>'; };
  const sec = (g, ts, extra) => '<section class="pt-sec' + (extra ? ' pt-mas' : '') + '">' + (g ? '<h2 class="pt-sech">' + g + '</h2>' : '') + '<div class="pt-ops">' + ts.map(tile).join('') + '</div></section>';
  let cuerpo = gs.map(([g, ts]) => sec(gs.length > 1 ? g : '', ts)).join('') + (ex.length ? sec('Más opciones', ex.map(k => [k, nombreGlobal(k)]), 1) : '');
  if (!cuerpo) cuerpo = '<p class="pt-vacio">Esta pantalla no tiene opciones disponibles para tu puesto. Pide al Gerente que te asigne alguna.</p>';
  const nBad = Object.entries(B).filter(([k]) => planas(p, S.rol).includes(k) || ex.includes(k)).reduce((a, [, v]) => a + (v[0] || 0), 0);
  const actual = nombreOp(p, S.route), ab = S.ptOpen ? ' aria-expanded="true"' : ' aria-expanded="false"';
  const pr = prinDe(p), enPr = pr.some(x => x[0] === S.route);
  const grandes = pr.length ? '<div class="pt-prin">' + pr.map(([k, n, i]) => '<a class="pt-main" data-k="' + k + '" href="#' + k + '"' + (k === S.route ? ' aria-current="page"' : '') + '>' + ic(i, 26) + '<span>' + n + '</span>' + (B[k] && B[k][0] ? '<span class="badge ' + B[k][1] + '">' + B[k][0] + '</span>' : '') + '</a>').join('') + '</div>' : '';
  return '<nav class="pt-bar' + (pr.length ? ' pt-conprin' : '') + '" aria-label="' + p.t + '">' + grandes + '<button type="button" class="pt-btn" id="ptBtn" aria-haspopup="true" aria-controls="ptPan"' + ab + '>' + icGrid(20) + '<span>Opciones</span>' + (nBad ? '<span class="pt-dot" aria-label="Hay avisos"></span>' : '') + '</button>' +
    (enPr ? '' : '<span class="pt-t">' + ic(p.ic, 18) + p.t + '</span><span class="pt-sep" aria-hidden="true">›</span><span class="pt-cur">' + actual + '</span>') +
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

/* ---------- Funciones extra por puesto (solo el Gerente asigna; el servidor guarda y audita) ---------- */
async function extrasCargar() {
  if (EXT.busy) return; EXT.busy = true; const r = S.rol;
  try { const x = await fetch('/api/v/pantallas/extras', {headers: {'x-rol': r}}); EXT.map = x.ok ? ((await x.json()).extras || {}) : {}; } catch (e) { EXT.map = {}; }
  EXT.rol = r; EXT.busy = false; try { render(); } catch (e) { /* sin pantalla */ }
}
const candidatas = r => { const own = new Set(visibles(r).flatMap(p => planas(p, r))); const vis = new Set(); return PANT.filter(p => p.k !== 'ger').map(p => [p, tabsRaw(p, 'dueno').flatMap(([, ts]) => ts).filter(t => t[2] !== 'h').filter(([k]) => !own.has(k) && !vis.has(k) && vis.add(k))]).filter(([, l]) => l.length); };
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
  const L = (S.lastPant ||= {}); if (!tabsRaw(p, S.rol).some(([, ts]) => ts.some(t => t[0] === S.route && t[2] === 'h'))) L[p.k] = S.route;
  w.insertAdjacentHTML('afterbegin', launcherHTML(p));
  if (S.ptOpen) { const np = document.getElementById('ptPan'); if (np) { np.scrollTop = vTop; if (vFoco) { const f = np.querySelector('[data-k="' + vFoco + '"]'); if (f) f.focus({preventScroll: true}); } } }
  if (typeof vAjustar === 'function') vAjustar();
};

/* ---------- Pestañas por dentro de una opción unida ---------- */
UNI.push(
  {p: 'vent', n: 'Clientes', siempre: true, m: [['v-clientes', 'Clientes y catálogo', ['clientes']], ['c-ficha', 'Enlace del portal']]}
);
/* Existencias: 8 pantallas viejas en una. Cada pestaña muestra de qué sistema vienen sus cifras y no las mezcla. */
const EXI = ['Existencias', true, [
  ['alm-mp', 'Materia prima'],
  ['pr-proc', 'En proceso', ['alm-proceso'], [['pr-proc', 'Sistema nuevo · kilos por etapa'], ['alm-proceso', 'Sistema anterior · lotes abiertos']]],
  ['alm-pt', 'Terminado', ['pr-inv', 'pr-invv'], [['alm-pt', 'Sistema anterior · bultos y existencias'], ['pr-inv', 'Sistema nuevo · bultos cerrados por turno'], ['pr-invv', 'Sistema nuevo · bultos cerrados por turno']]],
  ['inventario', 'Movimientos y límites', ['inventario-adm']]]];
['prod', 'adm', 'log'].forEach(pk => UNI.push({p: pk, n: EXI[0], siempre: true, maximo: EXI[1], m: EXI[2]}));
/* Ventas: 4 opciones. «Vender» trae las existencias a la vista; «Cuentas» junta lo que se debe, lo cobrado y el registro de ventas. */
UNI.push(
  {p: 'vent', n: 'Vender', siempre: true, m: [['v-pedido', 'Hacer una venta'], ['pr-invv', 'Existencias', ['alm-pt', 'pr-inv'], [['alm-pt', 'Sistema anterior · bultos y existencias'], ['pr-inv', 'Sistema nuevo · bultos cerrados por turno'], ['pr-invv', 'Sistema nuevo · bultos cerrados por turno']]]]},
  {p: 'vent', n: 'Cuentas', siempre: true, m: [['v-deuda', 'Quién debe'], ['v-pagos', 'Cobros hechos'], ['ventas', 'Registro de ventas']]}
);
/* Administración: compras, pagos y caja, precios (cada pestaña conserva el permiso de su clave; validar sigue siendo aprobar en «Por validar») */
const TIENE_PAGOS = r => lvlOf(r, 'cxp') >= 1 || lvlOf(r, 'caja') >= 1;
UNI.push(
  {p: 'adm', n: 'Compras', m: [['c-pedido', 'Hacer compra'], ['compras-mp', 'Por validar'], ['compras-gen', 'Otras compras'], ['catalogos', 'Proveedores'], ['analisis', 'Comparar']]},
  {p: 'adm', n: 'Pagos y caja', m: [['cxp', 'Por pagar'], ['caja', 'Caja chica'], Object.assign(['prestamos', 'Préstamos'], {cond: TIENE_PAGOS})]},
  {p: 'adm', n: 'Precios', siempre: true, m: [['p-precios', 'Por lista'], ['p-clientes', 'Por cliente'], ['e-ajustes', 'Descuentos y mora'], ['p-estado', 'Historial de cambios']]}
);
/* Gerencia: una bandeja «Por aprobar» y «Ajustes»; cada pestaña sigue siendo su clave y su acción (nunca se mezclan con donde se registra) */
UNI.push(
  {p: 'ger', n: 'Por aprobar', siempre: true, m: [['p-aprobar', 'Precios'], ['g-solic', 'Solicitudes'], ['pr-dif', 'Diferencias'], ['c-pagos', 'Pagos del portal']]},
  {p: 'ger', n: 'Ajustes', siempre: true, m: [['politicas', 'Reglas de caja y nómina'], ['rh-params', 'Turnos y bonos'], ['e-ajustes', 'Crédito'],
    ['pr-aj', 'Zonas y mermas', ['pr-mot'], [['pr-aj', 'Zonas y ajustes'], ['pr-mot', 'Motivos de merma']]], ['p-bancos', 'Bancos'], ['roles', 'Quién ve qué'], ['g-extras', 'Funciones extra'], ['datos', 'Datos'], ['gestion', 'Control de gestión']]}
);
/* Cobranza: Administración y Cobranza son la misma persona; todo lo de cobrar queda en una sola opción, «Quién debe» primero */
UNI.push({p: 'adm', n: 'Cobranza', siempre: true, m: [['v-deuda', 'Quién debe'], ['v-cobro', 'Registrar cobro'], ['v-pagos', 'Cobros hechos'], ['c-pagos', 'Pagos del portal'], ['e-plazos', 'Plazos y reclamos'], ['v-reportes', 'Reportes y auditoría'], ['c-ficha', 'Enlace del portal']]});
/* Personal: personas, asistencia, turnos, nómina y préstamos en una sola opción (cada pestaña conserva el permiso de su clave vieja) */
UNI.push({p: 'nom', n: 'Personal', cab: k => (window.hpCabUni ? window.hpCabUni(k) : ''), m: [['rh-planta', 'En planta hoy'], ['personal', 'Personas'], ['asistencia', 'Asistencia'], ['rh-turnos', 'Turnos y bonos', ['turnos']], ['rh-params', 'Parámetros'],
  ['rh-pagar', 'Pagar nómina'], ['prestamos', 'Préstamos'], ['nomina', 'Nómina anterior (solo consulta)']]},
  {p: 'adm', n: 'Bonos', siempre: true, m: [['rh-turnos', 'Turnos y bonos', ['turnos']], ['rh-params', 'Parámetros']]});
/* Vehículos: la lista nueva (alta y cambios en Administración, ubicación en Despacho) y la lista vieja de Equipo solo para consultar */
UNI.push({p: 'adm', n: 'Vehículos', siempre: true, m: [['fl-flota', 'Vehículos'], ['catprod', 'Anterior (solo consulta)', [], () => '<span class="un-et">Sistema anterior</span>' + flotaAnteriorCard()]]},
         {p: 'log', n: 'Vehículos', siempre: true, m: [['fl-desp', 'Vehículos'], ['catprod', 'Anterior (solo consulta)', [], () => '<span class="un-et">Sistema anterior</span>' + flotaAnteriorCard()]]});
/* una pestaña solo aparece si el puesto la veía antes en esa misma pantalla (o por Funciones extra) */
const VE_PROC = ['dueno', 'produccion']; /* el servidor solo entrega «En proceso (kilos)» a estos puestos: a los demás ni se muestra ni se pide */
const uniVe = c => { if (!can(c) || (c === 'pr-proc' && !VE_PROC.includes(S.rol))) return false; const p = pantActual(); return !p || planas(p, S.rol).includes(c) || extrasDe(S.rol).includes(c); };
const uniActual = k => { const p = pantActual(); return p ? uniDe(p.k, k) || null : uniDe('', k) || null; };
function uniBarra(k) {
  const u = uniActual(k); if (!u) return '';
  const ps = u.m.filter(m => !m.cond || m.cond(S.rol)).map(m => { const ks = [m[0], ...(m[2] || [])], ir = ks.find(uniVe); return ir ? {n: m[1], ir, ks} : null; }).filter(Boolean);
  if (ps.length < 2) return '';
  return '<nav class="v-tabs un-tabs" aria-label="' + esc(u.n) + '">' + ps.map(x => '<a class="v-tab" href="#' + x.ir + '"' + (x.ks.includes(k) ? ' aria-current="page"' : '') + '>' + esc(x.n) + '</a>').join('') + '</nav>';
}
const uniEnvuelta = new Set(), uniOrig = {};
function uniPartes(k, lista) { const vistas = new Set(); return lista.filter(([c]) => uniVe(c) && uniOrig[c] && !vistas.has(uniOrig[c]) && vistas.add(uniOrig[c])).map(([c, e]) => '<section class="un-parte"><p class="un-et">' + esc(e) + '</p>' + uniOrig[c]() + '</section>').join(''); }
function uniEnvolver() {
  UNI.forEach(u => u.m.flatMap(m => [m[0], ...(m[2] || [])]).forEach(k => { const sc = SCREENS[k]; if (!sc || uniEnvuelta.has(k)) return; uniEnvuelta.add(k); uniOrig[k] = sc.r; }));
  uniEnvuelta.forEach(k => { const sc = SCREENS[k], f = uniOrig[k];
    sc.r = function () { const u = uniActual(k), pes = u && u.m.find(m => (!m.cond || m.cond(S.rol)) && [m[0], ...(m[2] || [])].includes(k)), b = uniBarra(k), c = pes && pes[3] ? (typeof pes[3] === 'function' ? pes[3]() : uniPartes(k, pes[3])) : f.apply(this, arguments); const cab = u && u.cab ? u.cab(k) : ''; return cab + (b ? b + '<div class="un-panel">' + c + '</div>' : u ? '<div class="un-panel">' + c + '</div>' : c); }; });
}
uniEnvolver();

/* ---------- Direcciones viejas que ya no son pantalla propia ---------- */
const REDIR = {'log-dev': 'alm-logistica', 'cli-portal': 'c-ficha'};
{ const _go = go; go = function (route) { if (REDIR[route]) { route = REDIR[route]; try { history.replaceState(null, '', '#' + route); } catch (e) { /* sin historial */ } } return _go(route); }; }

/* ---------- Botones fijos de arriba: Ayuda y Autorización ---------- */
const veOpc = k => { const r = S.rol; return visibles(r).some(p => planas(p, r).includes(k)) || extrasDe(r).includes(k); };
/* Para «Primeros pasos»: ¿este puesto ve esta pantalla? (misma regla que el menú) */
window.pantVe = (r, k) => visibles(r).some(p => planas(p, r).includes(k)) || extrasDe(r).includes(k);
const _rt = renderTop;
renderTop = function () {
  _rt();
  if (!(S.entry === 'in' && Boot.state === 'ready')) return;
  const w = document.querySelector('#top .who'); if (!w) return;
  const dueno = S.rol === 'dueno', pend = window.ppPend ? window.ppPend() : 0;
  w.insertAdjacentHTML('beforeend', '<span class="top-fijos"><button type="button" class="btn sm ghost" data-act="ayuda">' + ic('book', 16) + '<span>Ayuda</span>' + (pend ? '<span class="badge w" title="Pasos por hacer">' + pend + '</span>' : '') + '</button>' +
    (dueno ? '<a class="btn sm ghost" href="#g-solic">' + ic('shield', 16) + '<span>Solicitudes</span></a>' : '<button type="button" class="btn sm ghost" data-act="autorizar">' + ic('shield', 16) + '<span>Autorización</span></button>') + '</span>');
};
Object.assign(ACT, {
  irA: el => { closeModal(); location.hash = '#' + el.dataset.r; },
  ayuda: () => { S.ayTab = 'pp'; if (S.route === 'ayuda') render(); else location.hash = '#ayuda'; },
  ayTab: el => { S.ayTab = el.dataset.t; render(); },
  autorizar: () => modal('Autorización', '<div class="form"><button type="button" class="btn pri" data-act="solPedir" data-a="">' + ic('shield', 16) + 'Pedir autorización</button><button type="button" class="btn" data-act="irA" data-r="mis-solic">Mis solicitudes</button><button type="button" class="btn" data-act="closeModal">Cerrar</button></div>')
});
})();
