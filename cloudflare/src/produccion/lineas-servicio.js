/* Líneas de despacho · servicio: ver las líneas, organizarlas (solo Gerencia) y armar salidas por línea o por zona suelta.
   Todo el SQL vive en repo.js; las cuentas, en lineas.js. Las respuestas no llevan dinero (rutas.js además quita el dinero a Logística y Producción). */
import * as D from './dominio.js';
import * as L from './lineas.js';
import * as R from './repo.js';
import {puede} from './permisos.js';
import * as VS from '../ventas/servicio.js';
import * as VD from '../ventas/dominio.js';
import * as VR from '../ventas/repo.js';
import {nomRol} from '../ventas/permisos.js';

const err = VS.err, r3 = n => Math.round(n * 1000) / 1000, txt = (v, max = 200) => (v == null ? '' : String(v)).trim().slice(0, max);
const exigir = (ctx, accion, msg) => { if (!puede(ctx.rol, accion)) throw err(403, msg || 'Tu puesto no puede hacer esto.'); };
const auditar = (ctx, ref, nom, accion, detalle) => VS.audit(ctx, 'produccion', ref, nom, accion, detalle);
const esGerencia = s => s.creado_rol === nomRol('dueno');
export const etiqueta = s => (s.id_linea != null ? 'Línea ' : 'Zona ') + s.zona;

export async function capacidad(db) { const a = await R.leerAjustes(db); return {capPapa: a.capPapa, capSalsa: a.capSalsa}; }
export async function zonasPosibles(db) {
  const set = new Set(VD.ESTADOS.map(VD.zonaDeEstado).filter(Boolean)); set.add(D.SIN_ZONA);
  for (const r of await R.zonasConocidas(db)) set.add(r.zona);
  for (const r of await R.zonasAsignadas(db)) set.add(r.zona);
  return [...set].sort((a, b) => a.localeCompare(b, 'es'));
}

/* Vista completa: tarjetas de línea, «Sin línea» y las capacidades. Las líneas que Gerencia ya decidió (tiene una salida suya armada) llevan gerencia_decidio. */
export async function vista(db) {
  const [filas, lineas, asig, pausas, salidas, caps, zp] = await Promise.all([R.lineasPendientes(db), R.listarLineas(db), R.zonasAsignadas(db), R.pausasActivas(db), R.listarSalidas(db, {estado: 'ARMANDO'}), capacidad(db), zonasPosibles(db)]);
  const sal = salidas.map(s => ({...s, de_gerencia: esGerencia(s)}));
  const v = L.armarLineas(filas, {lineas, asignacion: new Map(asig.map(a => [a.zona, a.id_linea])), pausas: new Map(pausas.map(p => [p.zona, p.motivo])), caps, salidas: sal, zonasPosibles: zp});
  return {capacidad: {papa_kg: caps.capPapa, salsa_kg: caps.capSalsa}, lineas: v.lineas, sin_linea: v.sin_linea, zonas_posibles: zp, _filas: filas, _salidas: sal};
}
export async function listaLineas(db) { const {_filas, _salidas, ...v} = await vista(db); return v; }

/* Detalle para armar: pedidos de todas las zonas del grupo (la línea o las zonas sin línea), salidas armadas y últimas despachadas. */
export async function detalleLinea(db, idTxt) {
  const v = await vista(db), sin = idTxt === L.SIN_LINEA;
  const lin = sin ? null : v.lineas.find(l => l.id_linea === +idTxt); if (!sin && !lin) throw err(404, 'Esa línea no existe.');
  const grupo = sin ? {nombre: 'Sin línea', zonas: v.sin_linea.zonas, ...v.sin_linea, id_linea: null} : lin, zonas = new Set(grupo.zonas.map(z => z.zona)), pz = new Map(grupo.zonas.map(z => [z.zona, z]));
  const peds = new Map();
  for (const f of v._filas) {
    const z = L.zonaDeFila(f); if (!zonas.has(z)) continue; const pend = D.pendienteLinea(f); if (pend <= 0) continue;
    const p = peds.get(f.id_pedido) || peds.set(f.id_pedido, {id_pedido: f.id_pedido, nro: f.nro, cliente: f.razon_social, fecha: f.fecha, zona: z, pausada: pz.get(z).pausada, paga_ahora: !!f.paga_ahora, bultos: 0, kilos: 0, lineas: []}).get(f.id_pedido);
    p.bultos += pend; p.kilos = r3(p.kilos + pend * f.kg_por_bulto);
    p.lineas.push({id_linea: f.id, nombre: f.nombre, tipo: L.tipoCarga(f.categoria), pendiente: pend, en_salida: f.en_salida, libre: pend - f.en_salida, kg_por_bulto: f.kg_por_bulto});
  }
  const lista = [...peds.values()].sort((a, b) => a.zona.localeCompare(b.zona, 'es') || a.fecha.localeCompare(b.fecha) || a.id_pedido - b.id_pedido);
  const mias = s => (s.id_linea != null ? s.id_linea === grupo.id_linea : grupo.id_linea == null && zonas.has(s.zona));
  const desp = (await R.listarSalidas(db, {estado: 'DESPACHADA', limite: 60})).filter(mias).slice(0, 5);
  const {_filas, _salidas, lineas, sin_linea, ...resto} = v;
  return {...resto, ...grupo, sin: sin, pedidos: lista, salidas_armando: v._salidas.filter(mias), salidas_despachadas: desp};
}

/* ---------- Organizar líneas (solo Gerencia) ---------- */
async function revisarZonas(db, zonas) {
  if (!Array.isArray(zonas)) throw err(400, 'Elige las zonas de la línea.');
  const posibles = new Set(await zonasPosibles(db)), out = [];
  for (const z0 of zonas) { const z = txt(z0, 60); if (!z) continue; if (!posibles.has(z)) throw err(400, `La zona «${z}» no existe.`); if (!out.includes(z)) out.push(z); }
  return out;
}
/* No se mueve una zona (ni se borra su línea) si hay una salida armada de esa línea con pedidos de esa zona */
async function bloqueoZona(db, zona, asig, lineas) {
  const dueña = asig.get(zona); if (dueña == null) return;
  const f = (await R.zonasEnSalidasDeLinea(db, dueña)).find(x => (x.zona || D.SIN_ZONA) === zona);
  if (f) throw err(409, `La zona ${zona} tiene pedidos en la salida ${f.nro} de la línea ${(lineas.find(l => l.id_linea === dueña) || {}).nombre || ''}: despáchala o anúlala antes de moverla.`, {codigo: 'ZONA_EN_SALIDA'});
}
const mapaAsig = asig => new Map(asig.map(a => [a.zona, a.id_linea]));
const instantanea = (lineas, asig) => lineas.map(l => ({id: l.id_linea, nombre: l.nombre, zonas: asig.filter(a => a.id_linea === l.id_linea).map(a => a.zona)}));

export async function crearLinea(ctx, b) {
  exigir(ctx, 'lineas', 'Solo Gerencia crea y cambia las líneas de despacho.');
  const {db} = ctx, n = L.validarNombreLinea(b.nombre); if (!n.ok) throw err(400, n.msg);
  const [lineas, asig] = await Promise.all([R.listarLineas(db), R.zonasAsignadas(db)]), zonas = await revisarZonas(db, b.zonas || []), am = mapaAsig(asig);
  if (lineas.some(l => l.nombre.toLowerCase() === n.valor.toLowerCase())) throw err(409, 'Ya hay una línea con ese nombre.');
  for (const z of zonas) await bloqueoZona(db, z, am, lineas);
  const rol = nomRol(ctx.rol);
  try { await VS.enLote(db, [R.stCrearLinea(db, n.valor, rol, b.ejemplo ? 1 : 0), ...zonas.map(z => R.stAsignarZonaANueva(db, z, n.valor, rol)), ...auditar(ctx, 'linea:' + n.valor, 'Línea ' + n.valor, 'creó la línea', {zonas})]); }
  catch (e) { if (/UNIQUE/i.test(String(e && e.message))) throw err(409, 'Ya hay una línea con ese nombre.'); throw e; }
  return listaLineas(db);
}
export async function cambiarLinea(ctx, id, b) {
  exigir(ctx, 'lineas', 'Solo Gerencia crea y cambia las líneas de despacho.');
  const {db} = ctx, [lineas, asig] = await Promise.all([R.listarLineas(db), R.zonasAsignadas(db)]), lin = lineas.find(l => l.id_linea === id); if (!lin) throw err(404, 'Esa línea no existe.');
  const am = mapaAsig(asig), antes = instantanea(lineas, asig), st = [], rol = nomRol(ctx.rol); let nombre = lin.nombre;
  if (b.nombre !== undefined) {
    const n = L.validarNombreLinea(b.nombre); if (!n.ok) throw err(400, n.msg);
    if (lineas.some(l => l.id_linea !== id && l.nombre.toLowerCase() === n.valor.toLowerCase())) throw err(409, 'Ya hay una línea con ese nombre.');
    if (n.valor !== lin.nombre) { st.push(R.stRenombrarLinea(db, id, n.valor)); nombre = n.valor; }
  }
  let nuevas = null;
  if (b.zonas !== undefined) {
    nuevas = await revisarZonas(db, b.zonas);
    const actuales = asig.filter(a => a.id_linea === id).map(a => a.zona);
    for (const z of actuales) if (!nuevas.includes(z)) { await bloqueoZona(db, z, am, lineas); st.push(R.stQuitarZona(db, z)); }
    for (const z of nuevas) if (am.get(z) !== id) { await bloqueoZona(db, z, am, lineas); st.push(R.stAsignarZona(db, z, id, rol)); }
  }
  if (!st.length) return listaLineas(db);
  await VS.enLote(db, [...st, ...auditar(ctx, 'linea:' + id, 'Línea ' + nombre, 'cambió la línea', {antes: antes.find(x => x.id === id), despues: {id, nombre, zonas: nuevas || asig.filter(a => a.id_linea === id).map(a => a.zona)}})]);
  return listaLineas(db);
}
export async function borrarLinea(ctx, id) {
  exigir(ctx, 'lineas', 'Solo Gerencia crea y cambia las líneas de despacho.');
  const {db} = ctx, [lineas, asig] = await Promise.all([R.listarLineas(db), R.zonasAsignadas(db)]), lin = lineas.find(l => l.id_linea === id); if (!lin) throw err(404, 'Esa línea no existe.');
  const f = (await R.zonasEnSalidasDeLinea(db, id))[0];
  if (f) throw err(409, `La línea ${lin.nombre} tiene la salida ${f.nro} armada: despáchala o anúlala antes de borrar la línea.`, {codigo: 'LINEA_EN_SALIDA'});
  await VS.enLote(db, [R.stQuitarZonasDeLinea(db, id), R.stBorrarLinea(db, id), ...auditar(ctx, 'linea:' + id, 'Línea ' + lin.nombre, 'borró la línea', {antes: instantanea(lineas, asig).find(x => x.id === id)})]);
  return listaLineas(db);
}

/* ---------- Armar una salida por línea (o por zona suelta) ---------- */
export async function armarSalidaGrupo(ctx, b) {
  exigir(ctx, 'mover', 'Solo Logística y el Gerente arman salidas.');
  const {db} = ctx, idLinea = b.id_linea != null && b.id_linea !== '' ? +b.id_linea : null, zonaB = txt(b.zona, 60);
  if (idLinea == null && !zonaB) throw err(400, 'Falta la línea o la zona.');
  if (!Array.isArray(b.lineas) || !b.lineas.length) throw err(400, 'Elige qué pedidos salen.');
  const [lineas, asig, pausas, aj] = await Promise.all([R.listarLineas(db), R.zonasAsignadas(db), R.pausasActivas(db), R.leerAjustes(db)]), am = mapaAsig(asig), caps = {capPapa: aj.capPapa, capSalsa: aj.capSalsa};
  let zonas, nombre;
  if (idLinea != null) { const lin = lineas.find(l => l.id_linea === idLinea); if (!lin) throw err(404, 'Esa línea no existe.'); nombre = lin.nombre; zonas = asig.filter(a => a.id_linea === idLinea).map(a => a.zona); }
  else {
    if (am.has(zonaB)) throw err(409, `La zona ${zonaB} está en la línea ${(lineas.find(l => l.id_linea === am.get(zonaB)) || {}).nombre}: arma la salida desde la línea.`, {codigo: 'ZONA_EN_LINEA'});
    nombre = zonaB; zonas = [zonaB];
  }
  const pausadas = new Set(pausas.map(p => p.zona)), filasGrupo = (await R.lineasPendientes(db)).filter(f => zonas.includes(L.zonaDeFila(f))), porId = new Map(filasGrupo.map(f => [f.id, f]));
  /* % de todo lo que hay en el grupo (sin zonas pausadas), igual que la tarjeta */
  let kpL = 0, ksL = 0; for (const f of filasGrupo) { if (pausadas.has(L.zonaDeFila(f))) continue; const k = L.kilosDeFila(f); kpL += k.kg_papa; ksL += k.kg_salsa; }
  const ocLinea = L.pctDe(kpL, ksL, caps), arm = await R.salidasArmandoDeGrupo(db, idLinea, idLinea == null ? zonaB : null), gerenciaDecidio = arm.some(esGerencia);
  /* La decisión de Gerencia prevalece: si la línea pasó del 100 % y Gerencia elige, las propuestas de Logística que aún no se cargan se anulan y sus pedidos quedan libres para elegir de nuevo */
  const reemplazar = ctx.rol === 'dueno' && ocLinea > 100 ? arm.filter(s => !esGerencia(s) && !s.cargada_ts) : [], liberado = new Map();
  for (const s of reemplazar) for (const l of await R.lineasDeSalida(db, s.id_salida)) liberado.set(l.id_linea, (liberado.get(l.id_linea) || 0) + l.bultos);
  const pedidosPend = new Map(); for (const f of filasGrupo) pedidosPend.set(f.id_pedido, (pedidosPend.get(f.id_pedido) || 0) + D.pendienteLinea(f));
  const elegidas = [], visto = new Set(), bultosPorPedido = new Map(); let kp = 0, ks = 0;
  for (const l of b.lineas) {
    const n = D.validarBultos(l.bultos); if (!n.ok) throw err(400, n.msg);
    const f = porId.get(+l.id_linea); if (!f) throw err(404, 'Una línea de pedido ya no está pendiente en esta ' + (idLinea != null ? 'línea.' : 'zona.'));
    if (visto.has(f.id)) throw err(400, 'Una línea de pedido está repetida.'); visto.add(f.id);
    if (pausadas.has(L.zonaDeFila(f))) throw err(409, `La zona ${L.zonaDeFila(f)} está pausada: reanúdala o quita sus pedidos de esta salida.`);
    const libre = D.pendienteLinea(f) - f.en_salida + (liberado.get(f.id) || 0);
    if (n.valor > libre) throw err(409, `De «${f.nombre}» (${f.nro}) solo quedan ${libre} bultos libres para esta salida.`);
    const kg = r3(n.valor * f.kg_por_bulto), k = L.kilosDeFila({...f, bultos: n.valor, bultos_despachados: 0, bultos_anulados: 0});
    kp += k.kg_papa; ks += k.kg_salsa;
    elegidas.push({id_pedido: f.id_pedido, id_linea: f.id, id_producto: f.id_producto, bultos: n.valor, kilos: kg});
    bultosPorPedido.set(f.id_pedido, (bultosPorPedido.get(f.id_pedido) || 0) + n.valor);
  }
  const kilosSalida = r3(kp + ks), ocSalida = L.pctDe(kp, ks, caps), divide = [...bultosPorPedido].some(([id, n]) => n < pedidosPend.get(id));
  const rg = L.reglasSalidaLinea({rol: ctx.rol, ocSalida, ocLinea, gerenciaDecidio, motivo: b.motivo, divide});
  if (!rg.ok) throw err(rg.status, rg.msg, {codigo: rg.codigo});
  const id = await VR.siguiente(db, 'salida'), nro = 'SAL-' + String(id).padStart(5, '0'), motivo = txt(b.motivo, 200) || null, ref = {nombre, zona: nombre, id_linea: idLinea};
  await VS.enLote(db, [...reemplazar.map(s => R.stSalidaAnulada(db, s.id_salida)),
    R.stInsertarSalida(db, {id_salida: id, nro, zona: nombre, kilos: kilosSalida, meta_kg: null, motivo, creado_rol: nomRol(ctx.rol), id_linea: idLinea, kg_papa: r3(kp), kg_salsa: r3(ks), ocupacion_pct: ocSalida, cap_papa_kg: caps.capPapa, cap_salsa_kg: caps.capSalsa}),
    ...elegidas.map(l => R.stInsertarSalidaLinea(db, id, l)),
    ...reemplazar.flatMap(s => auditar(ctx, s.nro, etiqueta(ref), 'anuló la salida de Logística: Gerencia decidió otra', {kilos: s.kilos})),
    ...auditar(ctx, nro, etiqueta(ref), divide ? 'armó salida dividiendo pedidos' : 'armó salida', {kilos: kilosSalida, kg_papa: r3(kp), kg_salsa: r3(ks), ocupacion_pct: ocSalida, linea_pct: ocLinea, motivo, divide})]);
  return {id_salida: id, nro, kilos: kilosSalida, kg_papa: r3(kp), kg_salsa: r3(ks), ocupacion_pct: ocSalida, divide, reemplazadas: reemplazar.map(s => s.nro)};
}
