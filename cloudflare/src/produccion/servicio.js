/* Producción por zonas · casos de uso: pedidos por zona, salidas (despachos), turnos y inventario del producto terminado.
   Usa el dominio (reglas), el repo (datos) y, para emitir notas o facturas, el servicio de Ventas. No conoce HTTP. */
import * as D from './dominio.js';
import * as R from './repo.js';
import {puede} from './permisos.js';
import * as VS from '../ventas/servicio.js';
import * as VD from '../ventas/dominio.js';
import * as VR from '../ventas/repo.js';
import {ROL_TXT, nomRol, rolCanon} from '../ventas/permisos.js';
import * as FL from '../flota/servicio.js';
import * as BR from '../rrhh/bonos-repo.js';
import * as BS from '../rrhh/bonos-servicio.js';
import * as RH from '../rrhh/repo.js';
import * as RD from '../rrhh/dominio.js';
import * as INV from '../inventario/servicio.js';
import * as GS from '../rrhh/grupos-servicio.js';
import * as RT from '../rrhh/turnos.js';
import * as TSV from '../rrhh/turnos-servicio.js';
import * as GR from '../rrhh/grupos.js';
import * as TA from './turno-activo.js';
import {costoKgPapaTurno} from '../costo-merma.js';
import * as L from './lineas.js';
import * as LS from './lineas-servicio.js';

export const err = VS.err;
const txt = (v, max = 200) => (v == null ? '' : String(v)).trim().slice(0, max);
const r3 = n => Math.round(n * 1000) / 1000;
const dol = c => c == null ? null : c / 100;
const exigir = (ctx, accion, msg) => { if (!puede(ctx.rol, accion)) throw err(403, msg || 'Tu puesto no puede hacer esto.'); };
const hoy = () => VD.hoyVE();
const auditar = (ctx, ref, nom, accion, detalle) => VS.audit(ctx, 'produccion', ref, nom, accion, detalle);

/* ---------- Ajustes (solo el Gerente) ---------- */
export async function ajustes(db) { const a = await R.leerAjustes(db); return {meta_kg: a.meta, cap_papa_kg: a.capPapa || null, cap_salsa_kg: a.capSalsa || null, corte_ambar_kg: a.corteAmbar || null, tolerancia_kg: a.tolerancia || null, conteo_inicial_hecho: !!a.conteoInicialTs, herencia_desde_ts: a.herenciaDesde || null}; }
export async function guardarAjustes(ctx, b) {
  exigir(ctx, 'dueno', 'Solo el Gerente cambia la meta, las capacidades y los cortes.');
  const prev = await R.leerAjustes(ctx.db);
  /* La meta de producción del panel sigue igual (config meta_zona_kg). Si no llega, se conserva. */
  const meta = b.meta_kg === undefined ? {ok: true, valor: String(prev.meta || '')} : D.validarAjuste(b.meta_kg, 'La meta'); if (!meta.ok || meta.valor === '') throw err(400, meta.ok ? 'La meta no puede quedar vacía.' : meta.msg);
  const amb = D.validarAjuste(b.corte_ambar_kg, 'El corte del semáforo'); if (!amb.ok) throw err(400, amb.msg);
  const tol = D.validarAjuste(b.tolerancia_kg, 'La tolerancia del cierre'); if (!tol.ok) throw err(400, tol.msg);
  if (amb.valor !== '' && +amb.valor >= +meta.valor) throw err(400, 'El corte del semáforo debe ser menor que la meta.');
  const cap = (v, ant, nombre) => { if (v === undefined) return {ok: true, valor: String(ant || '')}; const x = D.validarAjuste(v, nombre); if (!x.ok) throw err(400, x.msg); if (x.valor === '') throw err(400, nombre + ' no puede quedar vacía.'); return x; };
  const cp = cap(b.cap_papa_kg, prev.capPapa, 'La capacidad de papa'), cs = cap(b.cap_salsa_kg, prev.capSalsa, 'La capacidad de salsas');
  if (cp.valor === '' || cs.valor === '') throw err(400, 'Falta la capacidad del camión (papa y salsas).');
  await VS.enLote(ctx.db, [R.stConfig(ctx.db, 'meta_zona_kg', meta.valor), R.stConfig(ctx.db, 'cap_papa_kg', cp.valor), R.stConfig(ctx.db, 'cap_salsa_kg', cs.valor), R.stConfig(ctx.db, 'semaforo_ambar_kg', amb.valor), R.stConfig(ctx.db, 'tolerancia_cierre_kg', tol.valor),
    ...auditar(ctx, 'ajustes', 'Ajustes de zonas', 'cambió los ajustes', {antes: {meta: prev.meta, cap_papa_kg: prev.capPapa, cap_salsa_kg: prev.capSalsa, ambar: prev.corteAmbar, tolerancia: prev.tolerancia}, despues: {meta: +meta.valor, cap_papa_kg: +cp.valor, cap_salsa_kg: +cs.valor, ambar: amb.valor, tolerancia: tol.valor}})]);
  return ajustes(ctx.db);
}

/* ---------- Tablero por zonas ---------- */
async function filasTablero(db) { return R.lineasPendientes(db); }
export async function tablero(db) {
  const [filas, aj, pausas] = await Promise.all([filasTablero(db), R.leerAjustes(db), R.pausasActivas(db)]);
  const t = D.armarTarjetas(filas, {meta: aj.meta, corteAmbar: aj.corteAmbar, pausas: new Set(pausas.map(p => p.zona)), hoy: hoy()});
  const mp = new Map(pausas.map(p => [p.zona, p]));
  const lv = await LS.listaLineas(db), enLinea = new Map(); for (const l of lv.lineas) for (const zz of l.zonas) enLinea.set(zz.zona, {id_linea: l.id_linea, linea: l.nombre, aporte_pct: zz.aporte_pct});
  const dec = z => ({...z, monto: dol(z.monto_cents), pausa_motivo: mp.has(z.zona) ? mp.get(z.zona).motivo : null, linea: enLinea.get(z.zona) || null});
  return {meta_kg: aj.meta, activas: t.activas.map(dec), pausadas: t.pausadas.map(dec)};
}
export async function zonaDetalle(db, zona) {
  const [filas, aj, pausas, salidas] = await Promise.all([R.lineasPendientes(db, zona), R.leerAjustes(db), R.pausasActivas(db), R.listarSalidas(db, {estado: 'ARMANDO'})]);
  const despachadas = (await R.listarSalidas(db, {estado: 'DESPACHADA', limite: 60})).filter(s => s.zona === zona).slice(0, 5);
  const peds = new Map();
  for (const f of filas) {
    const pend = D.pendienteLinea(f); if (pend <= 0) continue;
    const p = peds.get(f.id_pedido) || peds.set(f.id_pedido, {id_pedido: f.id_pedido, nro: f.nro, cliente: f.razon_social, fecha: f.fecha, paga_ahora: !!f.paga_ahora, bultos: 0, kilos: 0, lineas: []}).get(f.id_pedido);
    p.bultos += pend; p.kilos = r3(p.kilos + pend * f.kg_por_bulto);
    p.lineas.push({id_linea: f.id, nombre: f.nombre, pendiente: pend, en_salida: f.en_salida, libre: pend - f.en_salida, kg_por_bulto: f.kg_por_bulto});
  }
  const lista = [...peds.values()].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id_pedido - b.id_pedido);
  const kilos = r3(lista.reduce((a, p) => a + p.kilos, 0)), pz = pausas.find(p => p.zona === zona);
  const lv = await LS.listaLineas(db), lin = lv.lineas.find(l => l.zonas.some(zz => zz.zona === zona)), zl = lin ? lin.zonas.find(zz => zz.zona === zona) : null;
  return {zona, linea: lin ? {id_linea: lin.id_linea, nombre: lin.nombre, aporte_pct: zl.aporte_pct, ocupacion_pct: lin.ocupacion_pct} : null, meta_kg: aj.meta, kilos, falta_kg: aj.meta > 0 ? Math.max(0, r3(aj.meta - kilos)) : null, semaforo: D.semaforo(kilos, aj.meta, aj.corteAmbar), pausada: !!pz, pausa_motivo: pz ? pz.motivo : null,
    pedidos: lista, salidas_armando: salidas.filter(s => s.zona === zona), salidas_despachadas: despachadas};
}

/* ---------- Pausar zona ---------- */
export async function pausar(ctx, zona, motivo) {
  exigir(ctx, 'mover', 'Solo Logística y el Gerente pausan una zona.');
  const m = txt(motivo, 200); if (m.length < 3) throw err(400, 'Escribe el motivo de la pausa.');
  const z = txt(zona, 60); if (!z) throw err(400, 'Falta la zona.');
  if ((await R.pausasActivas(ctx.db)).some(p => p.zona === z)) throw err(409, 'Esa zona ya está pausada.');
  await VS.enLote(ctx.db, [R.stPausar(ctx.db, z, m, nomRol(ctx.rol)), ...auditar(ctx, z, 'Zona ' + z, 'pausó la zona', {motivo: m})]);
  return {ok: true};
}
export async function reanudar(ctx, zona) {
  exigir(ctx, 'mover', 'Solo Logística y el Gerente reanudan una zona.');
  const z = txt(zona, 60);
  if (!(await R.pausasActivas(ctx.db)).some(p => p.zona === z)) throw err(409, 'Esa zona no está pausada.');
  await VS.enLote(ctx.db, [R.stReanudar(ctx.db, z, nomRol(ctx.rol)), ...auditar(ctx, z, 'Zona ' + z, 'reanudó la zona', {})]);
  return {ok: true};
}

/* ---------- Salidas ---------- */
/* Salida por línea (id_linea) o por zona suelta (zona): las reglas del camión viven en lineas.js y lineas-servicio.js */
export const armarSalida = (ctx, b) => LS.armarSalidaGrupo(ctx, b);
export async function anularSalida(ctx, id) {
  exigir(ctx, 'mover', 'Solo Logística y el Gerente anulan salidas.');
  const s = await R.getSalida(ctx.db, id); if (!s) throw err(404, 'Salida no encontrada.');
  if (s.estado !== 'ARMANDO') throw err(409, 'Esa salida ya no se puede anular.');
  if (s.ocupacion_pct != null && s.creado_rol === nomRol('dueno') && ctx.rol !== 'dueno') throw err(403, 'Gerencia eligió los pedidos de esta salida: solo Gerencia puede anularla.', {codigo: 'DECIDIO_GERENCIA'});
  await VS.enLote(ctx.db, [R.stSalidaAnulada(ctx.db, id), ...auditar(ctx, s.nro, LS.etiqueta(s), 'anuló la salida', {kilos: s.kilos})]);
  return {ok: true};
}
export async function detalleSalida(db, id) {
  const s = await R.getSalida(db, id); if (!s) throw err(404, 'Salida no encontrada.');
  const [lineas, docs] = await Promise.all([R.lineasDeSalida(db, id), R.documentosDeSalida(db, id)]);
  return {...s, lineas, documentos: docs.map(d => ({...d, total: dol(d.total_cents)}))};
}
export const listaSalidas = (db, estado) => R.listarSalidas(db, {estado});

/* Cargar el camión: se cuenta lo que realmente subió. No puede ser más de lo armado; si es menos, motivo, y lo que faltó queda pendiente en el pedido. */
export async function cargarSalida(ctx, id, b = {}) {
  exigir(ctx, 'cargar', 'Solo Logística y el Gerente cuentan la carga.');
  const {db} = ctx, s = await R.getSalida(db, id); if (!s) throw err(404, 'Salida no encontrada.');
  if (s.estado !== 'ARMANDO') throw err(409, 'Esa salida ya fue despachada o anulada.');
  if (s.cargada_ts) throw err(409, 'Esa carga ya se contó. Si hubo un error, el Gerente la rechaza y se cuenta de nuevo.');
  if (!Array.isArray(b.lineas) || !b.lineas.length) throw err(400, 'Cuenta los bultos de cada línea.');
  const lineas = await R.lineasDeSalida(db, id), porId = new Map(lineas.map(l => [l.id_linea, l])), cargados = new Map();
  for (const x of b.lineas) {
    const l = porId.get(+x.id_linea); if (!l) throw err(404, 'Una línea no es de esta salida.');
    if (cargados.has(l.id_linea)) throw err(400, 'Una línea está repetida.');
    const n = D.validarBultos(x.bultos, {permitirCero: true}); if (!n.ok) throw err(400, n.msg);
    if (n.valor > l.bultos) throw err(409, `De «${l.nombre}» se armaron ${l.bultos} bultos. No puedes cargar más de lo armado.`, {codigo: 'CARGA_DE_MAS', armado: l.bultos, id_linea: l.id_linea});
    cargados.set(l.id_linea, n.valor);
  }
  if (lineas.some(l => !cargados.has(l.id_linea))) throw err(400, 'Falta contar alguna línea de la salida.');
  const armado = lineas.reduce((a, l) => a + l.bultos, 0), cargado = [...cargados.values()].reduce((a, n) => a + n, 0), st = [];
  if (cargado < armado) {
    const falta = armado - cargado, f = await leerFaltante(db, b);
    if (!f) throw err(409, `Se armaron ${armado} bultos y cargaste ${cargado}. Faltan ${falta}: elige si todavía están en la etapa anterior (no se cargaron completos, quedan pendientes) o si fue merma.`,
      {codigo: 'FALTA_RESOLVER', armado, cargado, diferencia_bultos: falta, ...(await opcionesFaltante(db))});
    const detalle = f.clase === 'SIGUE' ? 'No se cargó completo: el resto sigue pendiente' : `Merma: ${f.motivo.nombre}${f.texto ? ' · ' + f.texto : ''}`;
    st.push(R.stDiferencia(db, {etapa: 'carga', origen_tipo: 'salida', origen_id: id, unidad: 'bultos', heredado: armado, usado: cargado, diferencia: -falta, tipo: f.clase === 'SIGUE' ? 'FALTO_MERCANCIA' : 'MERMA', motivo: detalle.slice(0, 200), estado: 'PENDIENTE', retiene: false, creado_rol: ctx.rol}),
      R.stMerma(db, {etapa: 'carga', origen: 'carga', clase: f.clase, kilos: falta, unidad: 'bultos', motivo: f.motivo, texto: f.texto, ref: id, rol: ctx.rol}));
    b = {...b, _detalle: detalle};
  }
  await VS.enLote(db, [R.stCargarSalida(db, id, ctx.rol), ...[...cargados].map(([idl, n]) => R.stCargaLinea(db, id, idl, n)), ...st,
    ...auditar(ctx, s.nro, LS.etiqueta(s), 'contó la carga del camión', {armado, cargado, motivo: cargado < armado ? b._detalle : null})]);
  return {ok: true, nro: s.nro, armado, cargado, faltan: armado - cargado};
}

/* Despachar: emite la nota o factura de lo que sale, baja apartado y existencias, y cierra la salida, todo en un solo lote. */
export async function despachar(ctx, id, b = {}) {
  exigir(ctx, 'mover', 'Solo Logística y el Gerente despachan.');
  const {db} = ctx, s = await R.getSalida(db, id); if (!s) throw err(404, 'Salida no encontrada.');
  if (s.estado !== 'ARMANDO') throw err(409, 'Esa salida ya fue despachada o anulada.');
  const nueva = s.ocupacion_pct != null, pausadas = new Set((await R.pausasActivas(db)).map(p => p.zona));   // nueva = armada con las capacidades del camión (por línea o por zona suelta)
  if (!nueva && pausadas.has(s.zona)) throw err(409, 'Esa zona está pausada: reanúdala para despachar.');
  const aj = await R.leerAjustes(db), filasZona = nueva ? await R.lineasPendientes(db) : await R.lineasPendientes(db, s.zona), kilosZona = r3(filasZona.reduce((a, f) => a + D.pendienteLinea(f) * f.kg_por_bulto, 0));
  /* Se despacha lo que se contó al cargar. Las salidas armadas antes de activar el conteo salen como siempre. */
  if (!s.cargada_ts && aj.cargaDesde && s.creado_ts >= aj.cargaDesde) throw err(409, 'Primero cuenta lo que subió al camión.', {codigo: 'SIN_CARGA'});
  const difCarga = s.cargada_ts ? (await R.difDeSalida(db, id))[0] : null;
  const lineas = (await R.lineasDeSalida(db, id)).map(l => ({...l, bultos: s.cargada_ts ? (l.bultos_cargados || 0) : l.bultos})).filter(l => l.bultos > 0), motivo = txt(b.motivo, 200) || s.motivo || (difCarga && difCarga.motivo) || '';
  if (!lineas.length) throw err(409, 'No se cargó ningún bulto en esta salida. Anúlala y arma otra.');
  const pend = new Map(filasZona.map(f => [f.id, f])), porPedido = new Map();
  for (const l of lineas) {
    const f = pend.get(l.id_linea); if (!f || D.pendienteLinea(f) < l.bultos) throw err(409, 'Un pedido de esta salida cambió (se anuló o ya salió). Anula la salida y arma otra.');
    if (nueva && pausadas.has(L.zonaDeFila(f))) throw err(409, 'La zona ' + L.zonaDeFila(f) + ' está pausada: reanúdala para despachar.');
    (porPedido.get(l.id_pedido) || porPedido.set(l.id_pedido, []).get(l.id_pedido)).push(l);
  }
  const divide = [...porPedido].some(([ip, ls]) => filasZona.filter(f => f.id_pedido === ip).reduce((a, f) => a + D.pendienteLinea(f), 0) > ls.reduce((a, l) => a + l.bultos, 0));
  /* Salida nueva: ya se decidió al armarla (Gerencia o Logística); al despachar solo queda dividir pedidos con motivo. Salida vieja por zona: la meta que tenía guardada. */
  const rg = nueva ? L.reglasSalidaLinea({rol: ctx.rol, ocSalida: 0, ocLinea: 0, motivo, divide}) : D.reglasSalida({rol: ctx.rol, kilosSalida: s.kilos, kilosZona, meta: s.meta_kg || aj.meta, motivo, divide});
  if (!rg.ok) throw err(rg.status, rg.msg, {codigo: rg.codigo});
  /* Vehículo y chofer elegidos de las listas (flota y nómina). Los textos sueltos de antes siguen valiendo como respaldo. Los avisos (capacidad, vencimientos) no bloquean. */
  const el = await FL.elegirParaSalida(db, {vehiculo_id: b.vehiculo_id, chofer_id: b.chofer_id}, {kilos: s.kilos, bultos: lineas.reduce((a, l) => a + l.bultos, 0)});
  const vehTxt = el.vehiculo_txt || txt(b.vehiculo, 60), choTxt = el.chofer_txt || txt(b.chofer, 60);
  const fecha = hoy(), st = [], docs = [], cobros = [];
  for (const [idPedido, ls] of porPedido) {
    const ped = await R.getPedido(db, idPedido);
    const lp = new Map((await R.lineasDePedido(db, idPedido)).map(x => [x.id, x]));
    const lineasDoc = ls.map(l => { const x = lp.get(l.id_linea); return {id_producto: x.id_producto, sku: x.sku, nombre: x.nombre, cantidad: l.bultos, kg_por_bulto: x.kg_por_bulto, precio_base_cents: x.precio_base_cents, precio_pp_cents: x.precio_pp_cents, precio_mora_cents: x.precio_mora_cents, alicuota: x.alicuota}; });
    const d = await VS.documentoDeDespacho(ctx, ped, lineasDoc, id, fecha);
    docs.push({...d, id_pedido: idPedido, ped}); st.push(...d.st, R.stDocumentoDeSalida(db, id, idPedido, d.id_documento), ...ls.map(l => R.stDespacharLinea(db, l.id_linea, l.bultos)), R.stRecalcularPedido(db, idPedido));
  }
  st.push(R.stSalidaDespachada(db, id, vehTxt, choTxt, motivo, nomRol(ctx.rol), el.vehiculo_id, el.chofer_id),
    ...auditar(ctx, s.nro, LS.etiqueta(s), 'despachó la salida', {kilos: s.kilos, ocupacion_pct: s.ocupacion_pct, vehiculo: vehTxt || null, chofer: choTxt || null, documentos: docs.map(d => d.nro), motivo: motivo || null, bajo_la_meta: nueva ? s.ocupacion_pct < 100 : aj.meta > 0 && s.kilos < aj.meta}));
  await VS.enLote(db, st);
  for (const d of docs) if (d.ped.pago_json) {   // «Pagó ahora»: se cobra con el primer documento del pedido
    const pg = JSON.parse(d.ped.pago_json), ctxV = {...ctx, rol: rolCanon(d.ped.creado_rol_cod) || 'dueno'};
    const c = await VS.cobrarContado(ctxV, d.ped.id_cliente, d.id_documento, d.nro, pg);
    if (c.ok) await R.run(db, 'UPDATE pedidos_venta SET pago_json = NULL WHERE id_pedido = ?1', [d.id_pedido]);
    cobros.push({pedido: d.ped.nro, ...c});
  }
  return {ok: true, nro: s.nro, vehiculo: vehTxt || null, chofer: choTxt || null, avisos: el.avisos, documentos: docs.map(d => ({nro: d.nro, tipo: d.tipo, total: d.total, id_documento: d.id_documento})), cobros};
}

/* ---------- Pedidos ---------- */
export const listaPedidos = (db, f) => R.listarPedidos(db, f).then(rs => rs.map(p => ({...p, kilos: r3(p.kilos)})));
export async function detallePedido(db, id) {
  const p = await R.getPedido(db, id); if (!p) throw err(404, 'Pedido no encontrado.');
  const lineas = await R.lineasDePedido(db, id);
  return {...p, pago_json: undefined, paga_ahora: !!p.pago_json, lineas: lineas.map(l => ({...l, pendiente: D.pendienteLinea(l), kilos: r3(l.bultos * l.kg_por_bulto)}))};
}
/* Solo el Gerente anula un pedido; libera los bultos apartados que faltaban por despachar */
export async function anularPedido(ctx, id, motivo) {
  exigir(ctx, 'dueno', 'Solo el Gerente anula pedidos.');
  const m = txt(motivo, 200); if (m.length < 3) throw err(400, 'Escribe el motivo.');
  const p = await R.getPedido(ctx.db, id); if (!p) throw err(404, 'Pedido no encontrado.');
  if (!['PENDIENTE', 'PARCIAL'].includes(p.estado)) throw err(409, 'Ese pedido ya no se puede anular.');
  if ((await R.salidasArmandoDePedido(ctx.db, id)).n) throw err(409, 'Este pedido está en una salida que se está armando: anula esa salida primero.');
  const ls = (await R.lineasDePedido(ctx.db, id)).filter(l => D.pendienteLinea(l) > 0);
  const hayDespachado = (await R.lineasDePedido(ctx.db, id)).some(l => l.bultos_despachados > 0);
  await VS.enLote(ctx.db, [...ls.map(l => R.stApartado(ctx.db, l.id_producto, -D.pendienteLinea(l))), ...ls.map(l => R.stAnularLineaPendiente(ctx.db, l.id)),
    hayDespachado ? R.stRecalcularPedido(ctx.db, id) : R.stEstadoPedido(ctx.db, id, 'ANULADO'), ...auditar(ctx, p.nro, p.razon_social, 'anuló el pedido', {motivo: m, bultos_liberados: ls.reduce((a, l) => a + D.pendienteLinea(l), 0)})]);
  return {ok: true};
}

/* ---------- Turnos de producción ---------- */
/* Quién ejecutó la etapa de fritura en este turno (marca por persona; de aquí sale el Bono Fritura) */
async function personasFritura(db, idTurno) {
  const marc = await BR.personasEtapa(db, idTurno, 'fritado'); if (!marc.length) return [];
  const por = new Map((await RH.empleados(db)).map(e => [e.id, e]));
  return marc.map(m => ({id: m.empleado_id, nombre: (por.get(m.empleado_id) || {}).n || m.empleado_id, ts: m.ts}));
}
/* Etapas del proceso: el catálogo es DATOS (tabla etapas_proceso). Las que llevan kilos forman la cadena «no pasar más de lo que hay». */
const catalogo = db => R.listarEtapas(db);
async function etapasKg(db) { const e = D.etapasConKilos(await catalogo(db)); return e.length ? e : D.ETAPAS; }
async function armarTurno(db, t) {
  const cat = await catalogo(db), et = D.etapasConKilos(cat).length ? D.etapasConKilos(cat) : D.ETAPAS;
  const [movs, emp, sumas, aj0, kgEmp, avance] = await Promise.all([R.movimientosDeTurno(db, t.id_turno), R.empaqueDeTurno(db, t.id_turno), R.sumasTurno(db, t.id_turno), R.leerAjustes(db), R.kgEmpacadosTurno(db, t.id_turno), R.avanceDeTurno(db, t.id_turno)]);
  const disp = D.disponiblesProceso(await R.procesoHerencia(db, aj0.herenciaDesde), await R.mermasTransicion(db, aj0.herenciaDesde), et), retenidas = t.estado === 'ABIERTO' ? await R.retenidasDeTurno(db, t.id_turno) : [];
  const saldo = {}; for (const e of et) saldo[e.k] = 0;
  for (const x of sumas.etapas) saldo[x.etapa] = r3((saldo[x.etapa] || 0) + (x.sentido === 'ENTRA' ? x.kg : -x.kg));
  const kg = (k, s) => r3(sumas.etapas.filter(x => x.etapa === k && x.sentido === s).reduce((a, x) => a + x.kg, 0)), hechas = new Set(avance.map(a => a.etapa));
  const etapas = et.map(e => ({k: e.k, nombre: e.t, saldo_kg: saldo[e.k], entra_kg: kg(e.k, 'ENTRA'), sale_kg: kg(e.k, 'SALE'), llego_kg: disp[e.k].entra, puede_salir_kg: disp[e.k].sale}));
  /* Las 11 etapas (y las 4 estaciones de Empaque) con su avance: hecha, en curso o pendiente */
  const lista = D.etapasLista(cat), actual = lista.find(e => e.k !== 'almacen_despacho' && !hechas.has(e.k)), iniciada = !!t.inicio_ts;
  const proceso = lista.map(e => { const entra = kg(e.k, 'ENTRA'), hecha = hechas.has(e.k), enCurso = iniciada && actual && actual.k === e.k; return {k: e.k, nombre: e.nombre, orden: e.orden, lleva_kilos: e.kilos, entra_kg: e.kilos ? entra : null, sale_kg: e.kilos ? kg(e.k, 'SALE') : null, hecha, estado: hecha ? 'HECHA' : enCurso ? 'EN_CURSO' : 'PENDIENTE', sub: e.sub.map(x => ({k: x.k, nombre: x.nombre, hecha: hechas.has(x.k)}))}; });
  const mc = await R.getMermaConsolidada(db, t.id_turno);
  return {...t, iniciada, vencido: iniciada && await TA.turnoVencido(db, t), etapa_actual: iniciada && actual ? actual.k : null, todas_terminadas: iniciada && !actual, cierre: t.cierre_json ? JSON.parse(t.cierre_json) : null, cierre_json: undefined, etapas, proceso,
    merma_consolidada: mc ? {kilos: mc.kilos, calculada_kg: mc.calculada_kg, nota: mc.nota, desglose: JSON.parse(mc.desglose || '[]'), ts: mc.ts} : null,
    personas_fritura: await personasFritura(db, t.id_turno), movimientos: movs, empaque: emp, bultos_por_producto: sumas.bultos, empaque_libre_kg: r3(Math.max(0, (sumas.etapas.filter(x => x.etapa === 'empacado' && x.sentido === 'ENTRA').reduce((a, x) => a + x.kg, 0)) - kgEmp)), en_espera: retenidas.length};
}
export async function turnoActual(db) {
  const t = await TA.turnoActivo(db);   // solo el turno ya iniciado; mirar la pantalla no crea nada
  const prods = (await VR.listarProductos(db)).filter(p => p.categoria === 'PAPAS' || true).map(p => ({id_producto: p.id_producto, nombre: `${p.nombre} ${p.gramaje || ''}`.trim(), kg_por_bulto: p.kg_por_bulto}));
  return {turno: t ? await armarTurno(db, t) : null, productos: prods, ultimos: (await R.listarTurnos(db, 5)).filter(x => x.estado === 'CERRADO').map(x => ({id_turno: x.id_turno, fecha: x.fecha, cerrado_rol: x.cerrado_rol, cierre: x.cierre_json ? JSON.parse(x.cierre_json) : null}))};
}
/* La producción se INICIA con un botón, y solo si TODOS los requisitos están en verde (papa, aceite, agua, sal, químicos, almidón y personal del turno).
   El servidor lo valida siempre: no hay forma de saltarse el bloqueo (tampoco para el Gerente). Se inicia una sola vez por turno. */
export async function iniciarProduccion(ctx) {
  exigir(ctx, 'turno', 'Solo Producción y el Gerente llevan el turno.');
  if (await TA.turnoActivo(ctx.db)) throw err(409, 'La producción de este turno ya está iniciada.', {codigo: 'YA_INICIADA'});
  const v = await verificarArranque(ctx.db);
  if (!v.ok) {
    await VS.enLote(ctx.db, auditar(ctx, 'turno', 'Turno ' + v.fecha, 'intentó iniciar la producción y quedó bloqueado', {jornada: v.jornada, faltan: v.faltan}));
    throw err(409, 'No se puede iniciar la producción. ' + v.faltan.join(' '), {codigo: 'ARRANQUE_BLOQUEADO', faltan: v.faltan, arranque: v});
  }
  const t = await TA.crearTurnoActual(ctx.db);
  await VS.enLote(ctx.db, [R.stIniciarProduccion(ctx.db, t.id_turno, nomRol(ctx.rol), v.personal.grupo_id), ...auditar(ctx, 'turno', 'Turno ' + t.fecha, 'inició la producción', {jornada: t.jornada || v.jornada, grupo: v.personal.grupo_id ?? null})]);
  return turnoActual(ctx.db);
}
const MSG_KILOS = 'Escribe los kilos para pasar a la siguiente etapa.';
/* Kilos que entraron (>0) en cada etapa del turno (solo lo vigente: lo que está en espera todavía no cuenta) */
async function entradasPorEtapa(db, idTurno, et) {
  const m = {}; for (const e of et) m[e.k] = 0;
  for (const x of (await R.sumasTurno(db, idTurno)).etapas) if (x.sentido === 'ENTRA') m[x.etapa] = r3(m[x.etapa] + x.kg);
  return m;
}
/* Para escribir en el turno hay que haber iniciado la producción (si no, 409). Lo que se carga va siempre al turno activo. */
async function turnoAbiertoOError(db) { const t = await TA.turnoActivo(db); if (!t) throw err(409, 'Primero inicia la producción: cuando todos los requisitos estén en verde, pulsa «Iniciar producción».', {codigo: 'SIN_INICIO'}); return t; }
const quien = ctx => nomRol(ctx.rol);
/* Motivo y tipo de una diferencia (obligatorios): devuelve {motivo, tipo} o lanza 400 con el mensaje */
function motivoDe(b, msg, {exceso = false} = {}) {
  const motivo = txt(b && b.motivo, 200);
  if (!D.motivoValido(motivo)) throw err(400, msg, {codigo: 'MOTIVO'});
  let tipo = b && b.tipo ? String(b.tipo) : (exceso ? 'OTRO' : 'MERMA');
  if (!D.tipoDifValido(tipo)) throw err(400, 'Elige el tipo de motivo de la lista.', {codigo: 'MOTIVO'});
  if (exceso) tipo = D.tipoParaExceso(tipo);
  return {motivo, tipo};
}
const VERBO = {lavado: 'lavar', fritado: 'freír', empacado: 'empacar'};

/* Etapa en curso: la primera del orden que todavía no se terminó (Almacén y despacho se marca sola al cerrar el turno) */
async function etapaEnCurso(db, t) {
  const hechas = new Set((await R.avanceDeTurno(db, t.id_turno)).map(a => a.etapa));
  return D.etapasLista(await catalogo(db)).find(e => e.k !== 'almacen_despacho' && !hechas.has(e.k)) || null;
}
/* Anotar kilos a mano: solo en la etapa en curso (lo normal es usar «Terminar etapa») */
export async function registrarMovimiento(ctx, b) {
  exigir(ctx, 'turno', 'Solo Producción y el Gerente llevan el turno.');
  const t = await turnoAbiertoOError(ctx.db), act = await etapaEnCurso(ctx.db, t);
  if (!act || act.k !== b.etapa) throw err(409, act ? `Ahora toca «${act.nombre}». Las etapas se hacen una a la vez, en orden.` : 'Todas las etapas ya están terminadas.', {codigo: 'ETAPA_FUERA_DE_ORDEN'});
  return movimiento(ctx, t, b);
}
async function movimiento(ctx, t, b) {
  const {db} = ctx;
  const cat = await catalogo(db), et = await etapasKg(db);
  if (!D.etapaValida(b.etapa, et)) throw err(400, D.claveEtapaValida(b.etapa, cat) ? 'Esa etapa no lleva kilos: márcala como hecha.' : 'Elige la etapa.');
  if (!['ENTRA', 'SALE'].includes(b.sentido)) throw err(400, 'Elige si entra o sale.');
  const k = D.validarKilos(b.kilos); if (!k.ok) throw err(400, k.msg);
  const i = et.findIndex(e => e.k === b.etapa);
  if (i > 0) { const ent = await entradasPorEtapa(db, t.id_turno, et); if (!(ent[et[i - 1].k] > 0)) throw err(400, MSG_KILOS); }
  /* Herencia: a lavado, fritado y empacado solo entra lo que salió de la etapa anterior; de cada etapa no sale más de lo que entró */
  let heredado = null;
  if (i > 0) { const aj = await R.leerAjustes(db), disp = D.disponiblesProceso(await R.procesoHerencia(db, aj.herenciaDesde), await R.mermasTransicion(db, aj.herenciaDesde), et); heredado = b.sentido === 'ENTRA' ? disp[b.etapa].entra : disp[b.etapa].sale; }
  if (heredado != null && k.valor > heredado + 0.0004) {
    const msg = b.sentido === 'ENTRA' ? D.msgEntra(b.etapa, heredado, et[i - 1].t) : `De esta etapa no puede salir más de lo que entró (${heredado} kg).`;
    if (!txt(b.motivo)) throw err(409, msg, {codigo: 'EXCEDE_HEREDADO', disponible: heredado, etapa: b.etapa, sentido: b.sentido, tipos: D.TIPOS_DIF});
    const {motivo, tipo} = motivoDe(b, 'Escribe por qué.', {exceso: true});
    await VS.enLote(db, [R.stDiferencia(db, {etapa: b.etapa, origen_tipo: 'turno', origen_id: t.id_turno, unidad: 'kg', heredado, usado: k.valor, diferencia: r3(k.valor - heredado), tipo, motivo, estado: 'PENDIENTE', retiene: true, creado_rol: ctx.rol}),
      R.stMovProceso(db, t.id_turno, b.etapa, b.sentido, k.valor, txt(b.nota, 100), quien(ctx), {enEspera: true}),
      ...auditar(ctx, 'turno', 'Turno ' + t.fecha, 'anotó kilos de más (en espera)', {etapa: b.etapa, sentido: b.sentido, kilos: k.valor, heredado, motivo, tipo})]);
    return {...(await turnoActual(db)), en_espera: true, diferencia: await R.ultimaDiferencia(db), mensaje: 'Quedó en espera: lo aprueba el Gerente.'};
  }
  /* Si llegan menos kilos de los que salieron de la etapa anterior ya NO se pide explicar por etapa: lo que falte se junta en la merma consolidada del cierre del proceso. */
  await VS.enLote(db, [R.stMovProceso(db, t.id_turno, b.etapa, b.sentido, k.valor, txt(b.nota, 100), quien(ctx))]);
  return turnoActual(db);
}
/* Operadores de planta que se pueden ofrecer en los selectores del turno (quién fríe, etc.): solo áreas de planta, sin supervisores.
   «Supervisor» no es un dato aparte: se reconoce por el cargo (Supervisor de Planta, de Producción, de Cocina, de Empaque, Jefe, Coordinador). Orden: marcaron entrada hoy, luego Fritura, luego el resto. */
export const AREAS_OPERADOR = ['Cocina', 'Fritura', 'Mantenimiento', 'Empaque', 'Almacén'];
export const esSupervisor = e => /supervis|jefe|coordinador|gerente/i.test(String((e && (e.cargo || e.puesto_cargo)) || ''));
export function operadoresPlanta(emps, conEntrada = new Set()) {
  const sinT = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const ok = new Set(AREAS_OPERADOR.map(sinT));
  const filas = emps.filter(RD.activo).filter(e => !esSupervisor(e)).map(e => { const pa = RD.puestoAreaDe(e); return {id: e.id, nombre: e.n || e.id, area: pa.area || '', puesto: pa.puesto, con_entrada: conEntrada.has(e.id)}; }).filter(x => ok.has(sinT(x.area)) || (sinT(x.area) === 'sin definir' && (x.puesto === 'Producción' || x.puesto === 'Logística'))); /* área vieja sin definir pero de planta: se ofrece al final para que no falte gente */
  filas.forEach(x => delete x.puesto);
  const rango = x => x.con_entrada ? 0 : sinT(x.area) === 'fritura' ? 1 : 2;
  return filas.sort((a, b) => rango(a) - rango(b) || a.nombre.localeCompare(b.nombre, 'es'));
}
export async function personal(ctx) {
  exigir(ctx, 'verTurno', 'Tu puesto no ve el turno.');
  const marcas = await RH.marcasDia(ctx.db, hoy()).catch(() => []);
  return {personas: operadoresPlanta(await RH.empleados(ctx.db), new Set(marcas.map(m => m.empleado_id)))};
}
/* Marca (o quita) a una persona dentro de la etapa de fritura del turno abierto. Cada persona marcada cobra el Bono Fritura de su jornada. */
export async function marcarPersonaEtapa(ctx, b = {}) {
  exigir(ctx, 'turno', 'Solo Producción y el Gerente llevan el turno.');
  const {db} = ctx, t = await turnoAbiertoOError(db);
  if (b.etapa !== 'fritado') throw err(400, 'Por ahora solo se marca a las personas de la fritura.');
  const id = txt(b.empleado_id, 80), e = id ? (await RH.empleados(db)).find(x => x.id === id) : null;
  if (!e) throw err(404, 'Esa persona no existe en Personal.');
  if (!RD.activo(e)) throw err(409, (e.n || id) + ' ya no está activa en Personal.');
  const nom = e.n || id, quitar = b.quitar === true || b.quitar === 'true', actual = (await BR.personasEtapa(db, t.id_turno, 'fritado')).some(x => x.empleado_id === id);
  if (quitar) { if (!actual) throw err(404, nom + ' no estaba marcada en la fritura.'); await VS.enLote(db, [BR.stQuitarPersonaEtapa(db, t.id_turno, 'fritado', id), ...auditar(ctx, 'turno', 'Turno ' + t.fecha, 'quitó a una persona de la fritura', {persona: nom})]); }
  else { if (actual) throw err(409, nom + ' ya está marcada en la fritura.'); await VS.enLote(db, [BR.stPersonaEtapa(db, t.id_turno, 'fritado', id, quien(ctx), Date.now()), ...auditar(ctx, 'turno', 'Turno ' + t.fecha, 'marcó a una persona en la fritura', {persona: nom})]); }
  return turnoActual(db);
}
/* ---------- Empaque libre: Logística empaca la papa a granel que dejó Producción, haya o no turno abierto ---------- */
const MOTIVOS_MERMA_EMP = ['Bolsas dañadas', 'Sobrante', 'Otra'];
function gramosPres(p) { const m = /(\d+(?:[.,]\d+)?)\s*(kilos?|kgs?|k|gramos?|grs?|g)/i.exec(String(p.gramaje || p.nombre || '')); if (!m) return null; const v = parseFloat(m[1].replace(',', '.')); return /^k/i.test(m[2]) ? Math.round(v * 1000) : Math.round(v); }
export async function granelDisponible(db) {
  const [prod, enTurnos, lib, mer] = await Promise.all([R.kilosTerminadosTodos(db), R.kgEmpacadosEnTurnos(db), R.kgLibres(db, 'EMPAQUE'), R.kgLibres(db, 'MERMA')]);
  return {producido_kg: r3(prod), empacado_kg: r3(enTurnos + lib), merma_kg: r3(mer), disponible_kg: Math.max(0, r3(prod - enTurnos - lib - mer))};
}
/* Presentaciones de papa que se empacan (con peso por bulto) y bolsas por bulto de cada una */
const bolsasPorBulto = p => p.unidades_por_bulto > 0 ? p.unidades_por_bulto : (gramosPres(p) > 0 && p.kg_por_bulto > 0 ? Math.round(p.kg_por_bulto * 1000 / gramosPres(p)) : null);
const nombrePres = p => (p.nombre + ' ' + (p.gramaje && !p.nombre.includes(p.gramaje) ? p.gramaje : '')).trim();
export async function empaqueLibreInfo(ctx) {
  exigir(ctx, 'verTurno', 'Tu puesto no ve el empaque.');
  const {db} = ctx, g = await granelDisponible(db);
  const prods = (await VR.listarProductos(db)).filter(p => p.categoria === 'PAPAS' && p.kg_por_bulto > 0).map(p => ({id_producto: p.id_producto, nombre: nombrePres(p), kg_por_bulto: p.kg_por_bulto, gramos: gramosPres(p), bolsas_por_bulto: bolsasPorBulto(p), existencias: p.stock_entero}));
  const req = await requisitosEmpaque(db);
  for (const p of prods) { const b = req.bolsas.por_producto[p.id_producto] || {saldo: 0}; p.bolsa = b; p.max_bultos_bolsas = p.bolsas_por_bulto > 0 ? Math.floor((b.saldo || 0) / p.bolsas_por_bulto + 1e-9) : null; }
  return {...g, productos: prods, motivos: MOTIVOS_MERMA_EMP, recientes: await R.empaquesLibresRecientes(db), requisitos: req};
}
/* Requisitos para «Anotar empaque»: conteo inicial del inventario, personal de planta presente (el del grupo del turno que ya marcó entrada) y UNA BOLSA POR PRESENTACIÓN
   (artículo bolsa-<id_producto>): si falta la bolsa de una presentación solo esa fila queda bloqueada. Sin desbloqueo. */
export async function requisitosEmpaque(db, ahora = Date.now()) {
  const inv = await INV.resumen(db), cod = new Map(inv.articulos.map(a => [a.codigo, a]));
  const {jornada, fecha} = await TA.jornadaActual(db, ahora), pers = await GS.personalDeTurno(db, fecha, jornada);
  const dias = [...new Set([fecha, hoy()])], marcas = (await Promise.all(dias.map(d => RH.marcasDia(db, d).catch(() => [])))).flat(), con = new Set(marcas.filter(m => !m.salida_ts).map(m => m.empleado_id));
  const presentes = pers.ok ? pers.miembros.filter(m => con.has(m.id)).length : 0;
  const por_producto = {}, faltanBolsas = [];
  for (const p of (await VR.listarProductos(db)).filter(p => p.categoria === 'PAPAS' && p.kg_por_bulto > 0)) {
    const a = cod.get(INV.codigoBolsa(p.id_producto)) || {nombre: 'Bolsa ' + nombrePres(p), saldo: 0, minimo: 0, unidad: 'und'}, saldo = inv.conteo_inicial_hecho ? a.saldo : null, minimo = +a.minimo || 0, ok = !!inv.conteo_inicial_hecho && a.saldo > 0;
    por_producto[p.id_producto] = {codigo: INV.codigoBolsa(p.id_producto), nombre: a.nombre, saldo, minimo, unidad: a.unidad || 'und', ok, bajo: ok && minimo > 0 && a.saldo <= minimo, motivo: !inv.conteo_inicial_hecho ? D.MSG_SIN_CONTEO_BOLSAS : ok ? '' : D.msgFaltanBolsas(null, null, a.nombre)};
    if (inv.conteo_inicial_hecho && !ok) faltanBolsas.push(a.nombre);
  }
  const bolsas = {conteo_ok: !!inv.conteo_inicial_hecho, motivo: inv.conteo_inicial_hecho ? '' : D.MSG_SIN_CONTEO_BOLSAS, por_producto, faltan: faltanBolsas};
  const personal = {ok: presentes > 0, presentes, total: pers.ok ? pers.miembros.length : 0, grupo: pers.nombre || '', motivo: presentes > 0 ? '' : pers.ok ? D.MSG_SIN_PRESENTES : (pers.motivo || D.MSG_SIN_GRUPO)};
  return {ok: bolsas.conteo_ok && personal.ok, bolsas, personal, faltan: [...(bolsas.conteo_ok ? [] : [bolsas.motivo]), ...(personal.ok ? [] : [personal.motivo])]};
}
/* La bolsa de esa presentación debe existir con saldo: si no, la fila queda bloqueada y se dice cuál falta */
function exigirBolsa(req, p, necesarias) {
  const b = req.bolsas.por_producto[p.id_producto] || {saldo: 0, ok: false, nombre: 'Bolsa ' + nombrePres(p), motivo: D.msgFaltanBolsas(null, null, 'Bolsa ' + nombrePres(p))};
  if (!b.ok) throw err(409, 'No se puede anotar el empaque. ' + b.motivo, {codigo: 'EMPAQUE_BLOQUEADO', faltan: [b.motivo], requisitos: req});
  if (necesarias > b.saldo + 1e-9) throw err(409, D.msgFaltanBolsas(b.saldo, necesarias, b.nombre), {codigo: 'FALTAN_BOLSAS', disponibles: b.saldo, necesarias, bolsa: b.nombre});
  return b;
}
export async function anotarEmpaqueLibre(ctx, b = {}) {
  exigir(ctx, 'empacar', 'Solo Logística y el Gerente anotan lo empacado.');
  const {db} = ctx, items = [], req = await requisitosEmpaque(db);
  if (!req.ok) throw err(409, 'No se puede anotar el empaque. ' + req.faltan.join(' '), {codigo: 'EMPAQUE_BLOQUEADO', faltan: req.faltan, requisitos: req});
  for (const x of Array.isArray(b.items) ? b.items : []) {
    if (x.bultos === '' || x.bultos == null || Number(x.bultos) === 0) continue;
    const n = D.validarBultos(x.bultos); if (!n.ok) throw err(400, n.msg);
    const p = await VR.getProducto(db, +x.id_producto); if (!p) throw err(404, 'Producto no encontrado.');
    if (!(p.kg_por_bulto > 0)) throw err(409, `«${p.nombre}» no tiene el peso por bulto cargado. Pídele a Administración que lo cargue.`);
    const bpb = bolsasPorBulto(p) || 0;
    if (!(bpb > 0)) throw err(409, `«${p.nombre}» no tiene cuántas bolsas lleva cada bulto. Pídele a Administración que lo cargue.`);
    exigirBolsa(req, p, n.valor * bpb);
    items.push({p, n: n.valor, kg: r3(n.valor * p.kg_por_bulto), bolsas: n.valor * bpb});
  }
  let merma = null; const mk = b.merma && b.merma.kg !== '' && b.merma.kg != null ? D.validarKilos(b.merma.kg) : null;
  if (mk) { if (!mk.ok) throw err(400, 'Merma de empaque: ' + mk.msg); const mo = MOTIVOS_MERMA_EMP.includes(txt(b.merma.motivo, 40)) ? txt(b.merma.motivo, 40) : null; if (!mo) throw err(400, 'Elige el motivo de la merma de empaque.'); merma = {kg: mk.valor, motivo: mo}; }
  if (!items.length && !merma) throw err(400, 'Escribe cuántos bultos empacaste (o la merma de empaque).');
  const bolsasUsa = items.reduce((a, x) => a + x.bolsas, 0);
  for (const [id, necesarias] of Object.entries(items.reduce((m, x) => (m[x.p.id_producto] = (m[x.p.id_producto] || 0) + x.bolsas, m), {}))) exigirBolsa(req, items.find(x => x.p.id_producto === +id).p, necesarias);   // la misma presentación repetida suma
  const g = await granelDisponible(db), usa = r3(items.reduce((a, x) => a + x.kg, 0) + (merma ? merma.kg : 0));
  if (usa > g.disponible_kg + 0.0004) throw err(409, `Solo hay ${g.disponible_kg} kg de papa a granel y quieres usar ${usa} kg. Baja la cantidad.`, {codigo: 'MAS_DEL_DISPONIBLE', disponible_kg: g.disponible_kg});
  const fecha = hoy(), rol = quien(ctx), refBolsas = 'EMP-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  await VS.enLote(db, [...items.filter(x => x.bolsas > 0).map(x => INV.salidaArticulo(ctx, {articulo: INV.codigoBolsa(x.p.id_producto), cantidad: x.bolsas, ref: refBolsas + '-' + x.p.id_producto, nota: 'Empaque de Logística'})), ...items.flatMap(x => [R.stEmpaqueLibre(db, 'EMPAQUE', x.p.id_producto, x.n, x.kg, null, rol), VR.stStock(db, x.p.id_producto, x.n), R.stEntradaEmpaque(db, x.p.id_producto, x.n, fecha)]),
    ...(merma ? [R.stEmpaqueLibre(db, 'MERMA', null, null, merma.kg, merma.motivo, rol)] : []),
    ...auditar(ctx, 'empaque', 'Empaque de Logística', 'anotó empaque sobre la papa a granel', {bultos: Object.fromEntries(items.map(x => [x.p.codigo_sku, x.n])), bolsas: bolsasUsa, bolsas_por_presentacion: Object.fromEntries(items.map(x => [x.p.codigo_sku, x.bolsas])), kg: usa, merma_kg: merma ? merma.kg : 0, motivo: merma ? merma.motivo : null})]);
  return empaqueLibreInfo(ctx);
}
export async function registrarEmpaque(ctx, b) {
  exigir(ctx, 'empacar', 'Solo Logística y el Gerente anotan lo empacado.');
  const {db} = ctx, t = await turnoAbiertoOError(db), req = await requisitosEmpaque(db);
  if (!req.ok) throw err(409, 'No se puede anotar el empaque. ' + req.faltan.join(' '), {codigo: 'EMPAQUE_BLOQUEADO', faltan: req.faltan, requisitos: req});
  const n = D.validarBultos(b.bultos); if (!n.ok) throw err(400, n.msg);
  const p = await VR.getProducto(db, +b.id_producto); if (!p) throw err(404, 'Producto no encontrado.');
  const bpb = bolsasPorBulto(p) || 0;
  if (!(bpb > 0)) throw err(409, `«${p.nombre}» no tiene cuántas bolsas lleva cada bulto. Pídele a Administración que lo cargue.`);
  const bolsasUsa = n.valor * bpb; exigirBolsa(req, p, bolsasUsa);
  const entra = (await entradasPorEtapa(db, t.id_turno, await etapasKg(db))).empacado;
  if (!(entra > 0)) throw err(400, 'Escribe los kilos del empacado antes de anotar los bultos.');
  if (!(p.kg_por_bulto > 0)) throw err(409, `«${p.nombre}» no tiene el peso por bulto cargado. Pídele a Administración que lo cargue.`);
  const libre = r3(entra - await R.kgEmpacadosTurno(db, t.id_turno)), kgNuevo = r3(n.valor * p.kg_por_bulto), salen = Math.max(0, Math.floor(libre / p.kg_por_bulto + 1e-9));
  if (kgNuevo > libre + 0.0004) {
    const msg = `Con ${libre} kg solo salen ${salen} bultos de este producto. Escribe por qué hay más.`;
    if (!txt(b.motivo)) throw err(409, msg, {codigo: 'EXCEDE_HEREDADO', disponible: libre, bultos_posibles: salen, etapa: 'empacado', tipos: D.TIPOS_DIF});
    const {motivo, tipo} = motivoDe(b, 'Escribe por qué.', {exceso: true});
    await VS.enLote(db, [R.stDiferencia(db, {etapa: 'empacado', origen_tipo: 'turno', origen_id: t.id_turno, id_producto: p.id_producto, unidad: 'kg', heredado: libre, usado: kgNuevo, diferencia: r3(kgNuevo - libre), tipo, motivo, estado: 'PENDIENTE', retiene: true, creado_rol: ctx.rol}),
      R.stEmpaque(db, t.id_turno, p.id_producto, n.valor, quien(ctx), {enEspera: true}),
      ...auditar(ctx, 'turno', 'Turno ' + t.fecha, 'anotó bultos de más (en espera)', {producto: p.codigo_sku, bultos: n.valor, kg_libres: libre, motivo, tipo})]);
    return {...(await turnoActual(db)), en_espera: true, diferencia: await R.ultimaDiferencia(db), mensaje: 'Quedó en espera: lo aprueba el Gerente.'};
  }
  await VS.enLote(db, [INV.salidaArticulo(ctx, {articulo: INV.codigoBolsa(p.id_producto), cantidad: bolsasUsa, ref: 'EMP-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), id_turno: t.id_turno, nota: 'Empaque del turno'}), R.stEmpaque(db, t.id_turno, p.id_producto, n.valor, quien(ctx))]);
  return turnoActual(db);
}

/* Papa de recepciones validadas: el turno solo toma lo que se recibió y aún no usó otro turno */
/* 'verificado' = recibida y pesada por Producción (flujo nuevo): ya se puede usar, sin esperar la validación de Administración */
const REC_VALIDADAS = ['verificado', 'validado', 'compra', 'almacen'];
export async function tomarRecepcion(ctx, b) {
  exigir(ctx, 'turno', 'Solo Producción y el Gerente llevan el turno.');
  const {db} = ctx, t = await turnoAbiertoOError(db), id = txt(b.id_recepcion, 40);
  if (!id) throw err(400, 'Elige la recepción.');
  const k = D.validarKilos(b.kilos); if (!k.ok) throw err(400, k.msg);
  const rec = await R.getRecepcionDoc(db, id); if (!rec) throw err(404, 'No encontré esa recepción.');
  if (rec.cat !== 'Papa cruda') throw err(409, 'Esa recepción no es de papa cruda.');
  if (!REC_VALIDADAS.includes(rec.estado)) throw err(409, 'Esa recepción todavía no se ha recibido y pesado. Solo se usa papa ya recibida.', {codigo: 'NO_VALIDADA'});
  const total = +(rec.kgRec ?? rec.qf) || 0, libre = Math.max(0, r3(total - await R.tomadoDeRecepcion(db, id)));
  if (k.valor > libre + 0.0004) throw err(409, `Solo quedan ${libre} kg de papa recibida en ${id}. No puedes anotar más.`, {codigo: 'EXCEDE_RECEPCION', disponible: libre});
  await VS.enLote(db, [R.stTomarRecepcion(db, t.id_turno, id, k.valor, quien(ctx)), R.stMovProceso(db, t.id_turno, 'recepcion', 'ENTRA', k.valor, 'De la recepción ' + id, quien(ctx)),
    INV.salidaPapaTurno(ctx, {id_turno: t.id_turno, id_recepcion: id, kilos: k.valor, ref: 'TP-' + t.id_turno + '-' + id + '-' + Date.now().toString(36)}),   // la papa tomada baja del inventario general
    ...auditar(ctx, 'turno', 'Turno ' + t.fecha, 'tomó papa de una recepción', {recepcion: id, kilos: k.valor, quedaban: libre})]);
  return turnoActual(db);
}
/* Consumos de planta del turno abierto (aceite, agua, sal, químicos, material de empaque): restan del inventario general */
export async function registrarConsumo(ctx, b) {
  exigir(ctx, 'turno', 'Solo Producción y el Gerente llevan el turno.');
  const t = await turnoAbiertoOError(ctx.db);
  await INV.registrarConsumo(ctx, b, {id_turno: t.id_turno});
  return {consumos: await INV.consumosDeTurno(ctx, t.id_turno), inventario: await INV.resumen(ctx.db)};
}
export async function consumosDelTurno(ctx) {
  exigir(ctx, 'turno', 'Solo Producción y el Gerente llevan el turno.');
  const t = await TA.turnoActivo(ctx.db); return {id_turno: t ? t.id_turno : null, consumos: t ? await INV.consumosDeTurno(ctx, t.id_turno) : []};
}
export async function recepcionesLibres(db) {
  const rs = (await VR.all(db, "SELECT data FROM docs WHERE col = 'recepciones'")).map(r => JSON.parse(r.data)).filter(r => r.cat === 'Papa cruda' && REC_VALIDADAS.includes(r.estado));
  const out = [];
  for (const r of rs) { const total = +(r.kgRec ?? r.qf) || 0, libre = Math.max(0, r3(total - await R.tomadoDeRecepcion(db, r.id))); if (libre > 0) out.push({id: r.id, fecha: r.fecha, prov: r.prov, kg_recibidos: total, kg_libres: libre}); }
  return out.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || a.id.localeCompare(b.id));
}

/* Resolver una diferencia faltante: {faltante:'ANTERIOR'} (todavía está en la etapa anterior) o {faltante:'MERMA', id_motivo, texto}.
   Devuelve null si no vino nada, {clase:'SIGUE'} o {clase:'MERMA', motivo, texto}; lanza 400 si la elección no es válida. */
async function leerFaltante(db, b) {
  const f = String((b && b.faltante) || '').trim().toUpperCase();
  if (!f) return null;
  if (f === 'ANTERIOR') return {clase: 'SIGUE'};
  if (f !== 'MERMA') throw err(400, 'Elige si todavía está en la etapa anterior o si fue merma.', {codigo: 'FALTA_RESOLVER', opciones: D.OPCIONES_FALTANTE});
  const lista = (await R.listarMotivos(db)).map(m => ({id: m.id, nombre: m.nombre, es_otra: !!m.es_otra}));
  const m = b.id_motivo != null && b.id_motivo !== '' ? await R.getMotivo(db, +b.id_motivo) : null;
  if (!m || !m.activo) throw err(400, 'Elige el motivo de la merma de la lista.', {codigo: 'MOTIVO', motivos: lista});
  const texto = txt(b.texto, 200);
  if (m.es_otra && texto.length < 3) throw err(400, 'Elegiste «Otra»: escribe qué pasó.', {codigo: 'MOTIVO_OTRA', motivos: lista});
  return {clase: 'MERMA', motivo: {id: m.id, nombre: m.nombre}, texto: texto || null};
}
const opcionesFaltante = async db => ({opciones: D.OPCIONES_FALTANTE, motivos: (await R.listarMotivos(db)).map(m => ({id: m.id, nombre: m.nombre, es_otra: !!m.es_otra}))});
const flag = v => v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';

/* Fase 5 (5.3 bis): ya no se explican los faltantes etapa por etapa; todo se junta en UNA merma consolidada al cierre del proceso.
   Estas dos rutas quedan por compatibilidad: no hay nada por resolver. */
export async function porResolver(db) { return {diferencias: [], opciones: [], motivos: (await R.listarMotivos(db)).map(m => ({id: m.id, nombre: m.nombre, es_otra: !!m.es_otra})), mensaje: 'La merma se anota una sola vez, al cerrar el proceso (antes de Empaque).'}; }
export async function resolverDiferencia(ctx) {
  exigir(ctx, 'turno', 'Solo Producción y el Gerente llevan el turno.');
  throw err(409, 'Ya no se explica la merma etapa por etapa: se anota una sola vez al cerrar el proceso (antes de Empaque).', {codigo: 'MERMA_CONSOLIDADA'});
}

/* Cierre: por etapa se compara lo que quedó (declarado) con lo registrado, y lo que salió de la etapa anterior con lo que llegó. Cada diferencia faltante hay que resolverla:
   «todavía está en la etapa anterior» (el kilo queda disponible allá) o «fue merma» con motivo de la lista. Sin eso el turno no se cierra.
   Más kilos de los registrados = exceso: motivo y queda en espera hasta que lo apruebe el Jefe.
   Cuerpo: {etapas:{lavado:'70'}, bultos:{id:n}, resoluciones:{etapas:{lavado:{faltante,id_motivo,texto}}, transiciones:{lavado:{...}}},
            motivos:{etapas:{fritado:{tipo,motivo}} (solo exceso), bultos:{id:{tipo,motivo}}}, nota}. */
export async function cerrarTurno(ctx, b = {}) {
  exigir(ctx, 'turno', 'Solo Producción y el Gerente llevan el turno.');
  const {db} = ctx, t = await turnoAbiertoOError(db), sumas = await R.sumasTurno(db, t.id_turno), aj = await R.leerAjustes(db), et = await etapasKg(db);
  const regE = {}; for (const e of et) regE[e.k] = 0;
  for (const x of sumas.etapas) regE[x.etapa] = r3((regE[x.etapa] || 0) + (x.sentido === 'ENTRA' ? x.kg : -x.kg));
  const regB = Object.fromEntries(sumas.bultos.map(x => [x.id_producto, x.bultos]));
  const decB = {}, declE = {};
  for (const e of et) { const v = b.etapas && b.etapas[e.k]; if (!(v === '' || v == null)) { const k = D.validarKilos(v, {permitirCero: true}); if (!k.ok) throw err(400, `${e.t}: ${k.msg}`); declE[e.k] = k.valor; } }
  for (const id of Object.keys(regB)) { const v = b.bultos && b.bultos[id]; if (v === '' || v == null) decB[id] = regB[id]; else { const n = D.validarBultos(v, {permitirCero: true}); if (!n.ok) throw err(400, n.msg); decB[id] = n.valor; } }
  for (const id of Object.keys(b.bultos || {})) if (!(id in decB)) { const n = D.validarBultos(b.bultos[id], {permitirCero: true}); if (!n.ok) throw err(400, n.msg); if (n.valor > 0) decB[id] = n.valor; }
  if (!et.some(e => regE[e.k] > 0 && (e.k in declE ? declE[e.k] : regE[e.k]) > 0)) throw err(400, 'Escribe los kilos de cada etapa para cerrar el turno.');
  for (const [id, n] of Object.entries(decB)) if (n > 0 && !(regB[id] > 0)) throw err(400, 'Hay bultos que no se anotaron en el turno. Anótalos primero con sus kilos.');
  const pend = await etapaEnCurso(db, t);
  if (pend) throw err(409, `Antes de cerrar, termina las etapas en orden. Falta: «${pend.nombre}».`, {codigo: 'ETAPAS_SIN_TERMINAR', etapa: pend.k});
  /* Lo que sigue en espera frena el cierre */
  const ret = await R.retenidasDeTurno(db, t.id_turno);
  if (ret.length) throw err(409, 'Hay diferencias esperando al Gerente. Cuando las apruebe o las rechace, podrás cerrar el turno.', {codigo: 'EN_ESPERA', pendientes: ret.length});
  /* 5.3 bis: si el turno tomó papa, la merma consolidada es obligatoria antes de cerrar */
  const tomada = await R.kilosPapaTomada(db, t.id_turno);
  if (tomada > 0 && !(await R.getMermaConsolidada(db, t.id_turno))) {
    const mc = D.mermaCalculada(tomada, await R.kilosAEmpaque(db, t.id_turno));
    throw err(409, `Antes de cerrar, anota la merma del proceso (calculada: ${mc.calculada_kg} kg).`, {codigo: 'FALTA_MERMA_CONSOLIDADA', ...mc});
  }
  /* Bultos: declarar más de lo anotado no se acepta; declarar menos pide motivo */
  const prodsTodos = new Map((await VR.productosPorIds(db, [...new Set([...Object.keys(regB), ...Object.keys(decB)].map(Number))])).map(p => [p.id_producto, p]));
  const nombreProd = id => { const p = prodsTodos.get(+id); return p ? `${p.nombre} ${p.gramaje || ''}`.trim() : 'Producto ' + id; };
  for (const id of Object.keys(regB)) if ((decB[id] || 0) > regB[id]) throw err(409, `Declaras ${decB[id]} bultos de «${nombreProd(id)}» y solo anotaste ${regB[id]}. Primero anótalos.`, {codigo: 'BULTOS_DE_MAS', anotados: regB[id], id_producto: +id});
  const mot = b.motivos || {}, faltan = [], nuevas = [], exceso = [], movs = [];
  for (const [id, reg] of Object.entries(regB)) {
    const dec = decB[id] || 0; if (dec >= reg) continue;
    const m = mot.bultos && mot.bultos[id], dif = dec - reg;
    if (!m || !D.motivoValido(m.motivo)) { faltan.push({tipo: 'bultos', id_producto: +id, nombre: nombreProd(id), diferencia: dif, unidad: 'bultos'}); continue; }
    const tp = D.tipoDifValido(m.tipo) ? m.tipo : 'OTRO';
    nuevas.push({etapa: 'cierre', origen_tipo: 'cierre', origen_id: t.id_turno, id_producto: +id, unidad: 'bultos', heredado: reg, usado: dec, diferencia: dif, tipo: tp, motivo: txt(m.motivo, 200), estado: 'PENDIENTE', retiene: false, creado_rol: ctx.rol});
  }
  const decE = {}, rol = quien(ctx);
  for (const e of et) {
    /* Lo declarado contra lo registrado en la etapa. Si faltan kilos ya no se pide explicarlo aquí: la merma consolidada lo cubre. */
    const exp = regE[e.k], dec = e.k in declE ? declE[e.k] : exp, dif = r3(dec - exp); decE[e.k] = dec;
    const m = mot.etapas && mot.etapas[e.k], conMotivo = m && D.motivoValido(m.motivo), tp = m && D.tipoDifValido(m.tipo) ? m.tipo : null;
    if (dif > 0) {   // sobran kilos: ¿ya lo aprobó el Jefe?
      const prevD = await R.difDeCierre(db, t.id_turno, e.k);
      if (prevD.some(p => p.estado === 'APROBADA' && p.usado === dec)) { movs.push(R.stMovProceso(db, t.id_turno, e.k, 'ENTRA', dif, 'Ajuste al cierre del turno', rol, {ajuste: 1})); continue; }
      if (!conMotivo) { faltan.push({tipo: 'etapa', etapa: e.k, nombre: e.t, diferencia: dif, unidad: 'kg'}); continue; }
      exceso.push({etapa: e.k, origen_tipo: 'cierre', origen_id: t.id_turno, unidad: 'kg', heredado: exp, usado: dec, diferencia: dif, creado_rol: ctx.rol, tipo: D.tipoParaExceso(tp || 'OTRO'), motivo: txt(m.motivo, 200), estado: 'PENDIENTE', retiene: true});
    } else if (dif < 0) movs.push(R.stMovProceso(db, t.id_turno, e.k, 'SALE', -dif, 'Ajuste al cierre del turno', rol, {ajuste: 1}));
  }
  if (faltan.length) throw err(400, 'Antes de cerrar, di qué pasó con: ' + faltan.map(f => `${f.nombre} (${Math.abs(f.diferencia)} ${f.unidad === 'kg' ? 'kg' : 'bultos'} ${f.diferencia < 0 ? 'menos' : 'de más'})`).join(', ') + '.',
    {codigo: 'FALTAN_MOTIVOS', faltan, tipos: D.TIPOS_DIF});
  if (exceso.length) {   // sobran kilos con motivo: queda en espera y el turno sigue abierto hasta que el Jefe lo apruebe
    await VS.enLote(db, [...exceso.map(d => R.stDiferencia(db, d)), ...auditar(ctx, 'turno', 'Turno ' + t.fecha, 'declaró kilos de más al cerrar (en espera)', {etapas: exceso.map(d => ({[d.etapa]: d.diferencia}))})]);
    throw err(409, 'Declaraste kilos de más. Quedó en espera: cuando el Gerente lo apruebe podrás cerrar el turno.', {codigo: 'EN_ESPERA', pendientes: exceso.length});
  }
  const cmp = D.compararCierre({registradoEtapas: regE, declaradoEtapas: decE, registradoBultos: regB, declaradoBultos: decB, tolerancia: aj.tolerancia, etapas: et});
  const entradas = Object.entries(decB).filter(([, n]) => n > 0), prods = prodsTodos;
  for (const [i] of entradas) if (!prods.has(+i)) throw err(404, 'Un producto del cierre no existe.');
  const fecha = hoy(), bolsones = await bolsonesDelTurno(ctx, t.id_turno);
  await VS.enLote(db, [...(bolsones ? [INV.salidaArticulo(ctx, {articulo: 'bolsones', cantidad: bolsones, ref: 'BOL-' + t.id_turno, id_turno: t.id_turno, nota: 'Bolsones del granel del turno'})] : []), R.stCerrarTurno(db, t.id_turno, rol, {...cmp, nota: txt(b.nota, 200) || null}),
    ...nuevas.map(d => R.stDiferencia(db, d)), ...movs, R.stMarcarAvance(db, t.id_turno, 'almacen_despacho', rol),
    ...entradas.flatMap(([i, n]) => [VR.stStock(db, +i, n), R.stEntradaCierre(db, +i, n, t.id_turno, fecha)]),
    ...auditar(ctx, 'turno', 'Turno ' + t.fecha, 'cerró el turno', {bultos: Object.fromEntries(entradas.map(([i, n]) => [prods.get(+i).codigo_sku, n])), fuera_tolerancia: cmp.etapas.filter(e => e.fuera_tolerancia).map(e => e.nombre), diferencias_kg: cmp.etapas.filter(e => e.diferencia_kg).map(e => ({[e.nombre]: e.diferencia_kg}))})]);
  /* Los bonos del turno se aplican solos al cerrar (se pueden deshacer desde Bonos); si algo falla, el cierre ya quedó hecho */
  const bonos = await BS.alCerrarTurno(db, Date.now());
  return {ok: true, cierre: cmp, bultos_sumados: entradas.reduce((a, [, n]) => a + n, 0), bonos};
}

/* Bolsones que gastó el turno: los kilos de papa que pasaron a granel ÷ kilos por bolsón (parámetro de Gerencia/Administración), redondeado hacia arriba y nunca más de los que hay. Sin parámetro cargado no se descuenta nada. */
async function bolsonesDelTurno(ctx, idTurno) {
  const kpb = await INV.kgPorBolson(ctx.db); if (!(kpb > 0)) return 0;
  const kg = await R.kilosAEmpaque(ctx.db, idTurno); if (!(kg > 0)) return 0;
  const a = (await INV.resumen(ctx.db)).articulos.find(x => x.codigo === 'bolsones'), hay = a ? Math.max(0, Math.floor(a.saldo)) : 0;
  return Math.min(Math.ceil(kg / kpb - 1e-9), hay);
}
/* ---------- Motivos de merma (la lista la edita solo el Gerente) y KPIs ---------- */
const motivoVista = m => ({id: m.id, nombre: m.nombre, activo: !!m.activo, es_otra: !!m.es_otra, orden: m.orden});
/* GET /motivos-merma[?todos=1]: la lista para los botones (activos). Con todos=1 el Gerente ve también los quitados. */
export async function listaMotivos(ctx, todos = false) {
  return (await R.listarMotivos(ctx.db, todos && ctx.rol === 'dueno')).map(motivoVista);
}
/* POST /motivos-merma {nombre} crea · POST /motivos-merma/:id {nombre?, activo?, orden?} edita o quita (solo el Gerente). «Otra» no se cambia ni se quita. */
export async function guardarMotivo(ctx, id, b = {}) {
  exigir(ctx, 'dueno', 'Solo el Gerente cambia la lista de motivos de merma.');
  const {db} = ctx;
  if (id == null) {
    const nombre = txt(b.nombre, 40); if (nombre.length < 2) throw err(400, 'Escribe el nombre del motivo (al menos 2 letras).');
    if (await R.motivoPorNombre(db, nombre)) throw err(409, 'Ya existe un motivo con ese nombre.');
    await VS.enLote(db, [R.stMotivoNuevo(db, nombre), ...auditar(ctx, 'motivos-merma', nombre, 'agregó un motivo de merma', {nombre})]);
  } else {
    const m = await R.getMotivo(db, id); if (!m) throw err(404, 'No encontré ese motivo.');
    if (m.es_otra) throw err(409, '«Otra» no se cambia ni se quita: siempre debe estar para los casos no previstos.');
    const nombre = b.nombre != null ? txt(b.nombre, 40) : m.nombre; if (nombre.length < 2) throw err(400, 'Escribe el nombre del motivo (al menos 2 letras).');
    const otro = await R.motivoPorNombre(db, nombre); if (otro && otro.id !== id) throw err(409, 'Ya existe un motivo con ese nombre.');
    const activo = b.activo != null ? flag(b.activo) : !!m.activo, orden = b.orden != null && Number.isFinite(+b.orden) ? Math.trunc(+b.orden) : m.orden;
    await VS.enLote(db, [R.stMotivoEditar(db, id, nombre, activo, orden), ...auditar(ctx, 'motivos-merma', nombre, 'cambió un motivo de merma', {antes: {nombre: m.nombre, activo: !!m.activo}, despues: {nombre, activo}})]);
  }
  return {motivos: await listaMotivos(ctx, true)};
}
/* GET /kpi-merma?desde=&hasta= (ms; sin «desde» = desde que rige la regla): merma real, calculada, por etapa y motivo. Sin metas. % = merma / (kilos que entraron a la etapa + merma entre etapas). */
export async function kpiMerma(ctx, {desde, hasta} = {}) {
  exigir(ctx, 'verDif', 'Solo el Gerente, Producción y Logística ven la merma.');
  const aj = await R.leerAjustes(ctx.db), d = desde != null && desde !== '' && Number.isFinite(+desde) ? +desde : aj.herenciaDesde, h = hasta != null && hasta !== '' && Number.isFinite(+hasta) ? +hasta : 9e15, db = ctx.db;
  const [pm, otras, sigue, ent, trans] = await Promise.all([R.mermasPorMotivo(db, d, h), R.mermasOtras(db, d, h), R.siguenPorEtapa(db, d, h), R.entradasPeriodo(db, d, h), R.mermasTransPeriodo(db, d, h)]);
  const kgDe = (arr, k) => r3((arr.find(x => x.etapa === k) || {kg: 0}).kg);
  const pct = (m, base) => base > 0 ? Math.round(m / base * 10000) / 100 : null;
  const etapas = (await etapasKg(db)).map(e => {
    const entro = kgDe(ent, e.k), base = r3(entro + kgDe(trans, e.k)), filas = pm.filter(x => x.etapa === e.k && x.unidad === 'kg'), merma = r3(filas.reduce((a, x) => a + x.kg, 0));
    return {etapa: e.k, nombre: e.t, entro_kg: entro, base_kg: base, merma_kg: merma, merma_pct: pct(merma, base), sigue_en_anterior_kg: kgDe(sigue, e.k),
      por_motivo: filas.map(x => ({id_motivo: x.id_motivo, motivo: x.motivo_nombre, kg: r3(x.kg), veces: x.veces, pct: pct(x.kg, base)})).sort((a, b) => b.kg - a.kg),
      otras: otras.filter(x => x.etapa === e.k && x.unidad === 'kg').map(x => ({texto: x.texto, kg: r3(x.kg)}))};
  });
  const tot = r3(etapas.reduce((a, x) => a + x.merma_kg, 0)), totBase = r3(etapas.reduce((a, x) => a + x.base_kg, 0));
  const carga = pm.filter(x => x.etapa === 'carga');
  /* 5.3 bis: la merma consolidada del cierre del proceso (una por turno) reemplaza a las mermas por etapa de los turnos nuevos */
  const cons = await R.all(db, 'SELECT COUNT(*) AS n, COALESCE(SUM(kilos), 0) AS kg, COALESCE(SUM(tomados_kg), 0) AS tomados FROM merma_consolidada WHERE ts >= ?1 AND ts <= ?2', [d, h]);
  const consolidada = {registros: cons[0].n, merma_kg: r3(cons[0].kg), papa_tomada_kg: r3(cons[0].tomados), merma_pct: pct(cons[0].kg, cons[0].tomados)};
  return {desde: d || null, hasta: h === 9e15 ? null : h, etapas, consolidada, total: {merma_kg: tot, base_kg: totBase, merma_pct: pct(tot, totBase)},
    carga_bultos: {faltantes_merma: carga.reduce((a, x) => a + x.kg, 0), por_motivo: carga.map(x => ({id_motivo: x.id_motivo, motivo: x.motivo_nombre, bultos: x.kg}))}};
}

/* ---------- Diferencias: aprobar y rechazar ---------- */
const difVista = d => ({...d, retiene: !!d.retiene, esperada: !!d.esperada, tipo_texto: (D.TIPOS_DIF.find(t => t.k === d.tipo) || {t: d.tipo}).t, etapa_texto: d.etapa === 'cierre' ? 'Cierre (bultos)' : d.etapa === 'carga' ? 'Carga del camión' : D.nombreEtapa(d.etapa), creado_por: nomRol(d.creado_rol), decidido_por: nomRol(d.decidido_rol) || null});
export async function listaDiferencias(ctx, f = {}) {
  exigir(ctx, 'verDif', 'Solo el Gerente, Producción y Logística ven las diferencias.');
  if (f.estado && !['PENDIENTE', 'APROBADA', 'RECHAZADA', 'AUTOMATICA'].includes(f.estado)) throw err(400, 'Estado no válido.');
  return (await R.listarDiferencias(ctx.db, f)).map(difVista);
}
export async function contadorDiferencias(ctx) {
  exigir(ctx, 'verDif', 'Solo el Gerente, Producción y Logística ven las diferencias.');
  const c = await R.contadorDiferencias(ctx.db);
  return {pendientes: c.n, mas_vieja_horas: c.n ? Math.floor((Date.now() - c.mas_vieja_ts) / 3600000) : null};
}
export async function decidirDiferencia(ctx, id, accion, nota) {
  exigir(ctx, 'aprobar', 'Solo el Gerente aprueba o rechaza diferencias.');
  const {db} = ctx, d = await R.getDiferencia(db, id); if (!d) throw err(404, 'No encontré esa diferencia.');
  const n = txt(nota, 200), aprobar = accion === 'aprobar';
  if (!aprobar && n.length < 3) throw err(400, 'Escribe por qué la rechazas.');
  if (d.estado !== 'PENDIENTE') throw err(409, 'Esa diferencia ya fue decidida.');
  const st = [R.stDecidirDiferencia(db, id, aprobar ? 'APROBADA' : 'RECHAZADA', ctx.rol, n)];
  if (d.retiene) st.push(R.stMovsDeDiferencia(db, id, aprobar ? 'VIGENTE' : 'RECHAZADO'), R.stEmpaqueDeDiferencia(db, id, aprobar ? 'VIGENTE' : 'RECHAZADO'));
  if (!aprobar && d.etapa === 'carga') { const s = await R.getSalida(db, +d.origen_id); if (s && s.estado === 'ARMANDO') st.push(...R.stAnularCarga(db, s.id_salida), R.stAnularMermasDeSalida(db, s.id_salida)); }
  st.push(...auditar(ctx, 'diferencia-' + id, `${difVista(d).etapa_texto} · ${d.origen_tipo} ${d.origen_id}`, aprobar ? 'aprobó una diferencia' : 'rechazó una diferencia', {etapa: d.etapa, diferencia: d.diferencia, unidad: d.unidad, tipo: d.tipo, motivo: d.motivo, nota: n || null, anotada_por: d.creado_rol}));
  await VS.enLote(db, st);
  return difVista(await R.getDiferencia(db, id));
}

/* ---------- Almacén en proceso (kilos por etapa, de todos los turnos) ---------- */
export async function proceso(db) {
  const s = await R.saldosProceso(db);
  return {etapas: (await etapasKg(db)).map(e => { const en = r3(s.filter(x => x.etapa === e.k && x.sentido === 'ENTRA').reduce((a, x) => a + x.kg, 0)), sa = r3(s.filter(x => x.etapa === e.k && x.sentido === 'SALE').reduce((a, x) => a + x.kg, 0)); return {k: e.k, nombre: e.t, entra_kg: en, sale_kg: sa, saldo_kg: r3(en - sa)}; })};
}

/* ---------- Inventario único del producto terminado (en bultos) ---------- */
export async function inventario(db) {
  const [prods, aj] = await Promise.all([VR.listarProductos(db), R.leerAjustes(db)]);
  const filas = prods.map(p => ({id_producto: p.id_producto, sku: p.codigo_sku, nombre: `${p.nombre} ${p.gramaje || ''}`.trim(), kg_por_bulto: p.kg_por_bulto ?? null, unidades_por_bulto: p.unidades_por_bulto ?? null,
    existencias: p.stock_entero, apartado: p.stock_apartado || 0, disponible: Math.max(0, p.stock_entero - (p.stock_apartado || 0)), kilos: p.kg_por_bulto > 0 ? r3(p.stock_entero * p.kg_por_bulto) : null}));
  return {conteo_inicial_hecho: !!aj.conteoInicialTs, productos: filas, movimientos: await VR.all(db, "SELECT m.id, m.tipo, m.cantidad, m.fecha, m.nota, p.nombre FROM movimientos_inventario m JOIN productos p ON p.id_producto = m.id_producto WHERE m.tipo IN ('ENTRADA_CIERRE_TURNO','CONTEO_INICIAL','ENTRADA') ORDER BY m.id DESC LIMIT 30")};
}
/* Conteo inicial: una sola vez, solo el Gerente, en bultos. Deja las existencias exactamente en lo contado. */
export async function conteoInicial(ctx, b) {
  exigir(ctx, 'dueno', 'Solo el Gerente carga el conteo inicial.');
  const {db} = ctx, aj = await R.leerAjustes(db); if (aj.conteoInicialTs) throw err(409, 'El conteo inicial ya se cargó. Después solo cambian las existencias la producción, las ventas y el Gerente con motivo.');
  if (!Array.isArray(b.conteos) || !b.conteos.length) throw err(400, 'Escribe los bultos contados.');
  const prods = new Map((await VR.listarProductos(db)).map(p => [p.id_producto, p])), st = [], resumen = {}, vistos = new Set();
  for (const c of b.conteos) {
    const p = prods.get(+c.id_producto); if (!p) throw err(404, 'Un producto del conteo no existe.'); if (vistos.has(p.id_producto)) throw err(400, 'Un producto está repetido.'); vistos.add(p.id_producto);
    const n = D.validarBultos(c.bultos, {permitirCero: true}); if (!n.ok) throw err(400, `${p.nombre}: ${n.msg}`);
    if (n.valor < (p.stock_apartado || 0)) throw err(409, `${p.nombre}: ya hay ${p.stock_apartado} bultos apartados por pedidos; el conteo no puede ser menor.`);
    st.push(R.stFijarStock(db, p.id_producto, n.valor), R.stConteoInicial(db, p.id_producto, n.valor - p.stock_entero, hoy())); resumen[p.codigo_sku] = n.valor;
  }
  await VS.enLote(db, [...st, R.stConfig(db, 'conteo_inicial_ts', String(Date.now())), ...auditar(ctx, 'inventario', 'Conteo inicial', 'cargó el conteo inicial', {bultos: resumen})]);
  return inventario(db);
}

/* ---------- Fase 5 · 5.1 Bloqueo de arranque ---------- */
/* Revisa los 5 insumos críticos (inventario general) y el personal del grupo del turno. Devuelve {ok, jornada, fecha, insumos[], personal, faltan[]} */
export async function verificarArranque(db, ahora = Date.now()) {
  const {jornada, fecha} = await TA.jornadaActual(db, ahora), inv = await INV.resumen(db), minimos = Object.fromEntries(inv.articulos.map(a => [a.codigo, +a.minimo || 0]));   // UN solo mínimo por insumo: el del inventario (lo fijan Gerencia y Administración)
  const saldos = Object.fromEntries(inv.articulos.map(a => [a.codigo, {saldo: a.saldo, unidad: a.unidad}]));
  const personal = await GS.personalDeTurno(db, fecha, jornada);
  return {jornada, fecha, minimos, ...D.evaluarArranque({conteoHecho: inv.conteo_inicial_hecho, saldos, minimos, personal})};
}
export async function arranque(ctx) { exigir(ctx, 'verPanel', 'Tu puesto no ve el arranque del turno.'); return verificarArranque(ctx.db); }
/* ---------- Fase 5 · 5.2 Resumen del turno y avance por etapas ---------- */
export async function resumenTurno(ctx) {
  exigir(ctx, 'verTurno', 'Tu puesto no ve el turno.');
  const {db} = ctx, t = await TA.turnoActivo(db), aj = await R.leerAjustes(db), par = await TSV.cargarParam(db);
  const b = par.bono, arr = await verificarArranque(db);
  /* Metas del turno: solo kilos (sin dinero) */
  const metas = {meta_produccion_kg: aj.meta || null, meta_bono_kg: b.meta_kg || null, minimo_bono_kg: b.minimo_kg || null, etapa_bono: b.etapa, tramos: b.tramos.map(x => ({cumplimiento_pct: x.desde}))};
  const personal = t ? (t.jornada ? await GS.personalDeTurno(db, t.fecha_jornada || t.fecha, t.jornada) : null) : arr.personal;
  const tomada = t ? await R.kilosPapaTomada(db, t.id_turno) : 0, aEmp = t ? await R.kilosAEmpaque(db, t.id_turno) : 0, mc = t ? await R.getMermaConsolidada(db, t.id_turno) : null;
  const pasos = [
    {n: 1, k: 'recepcion', nombre: 'Recepción de insumos', listo: !!t && tomada > 0},
    {n: 2, k: 'resumen', nombre: 'Resumen del turno', listo: !!t},
    {n: 3, k: 'ejecucion', nombre: 'Ejecución por etapas', listo: !!t && aEmp > 0},
    {n: 4, k: 'cierre', nombre: 'Mermas y cierre', listo: !!t && t.estado === 'CERRADO'}];
  return {turno: t ? {id_turno: t.id_turno, fecha: t.fecha, jornada: t.jornada || null, fecha_jornada: t.fecha_jornada || null, grupo_id: t.grupo_id ?? null, estado: t.estado} : null,
    jornada_proxima: arr.jornada, metas, personal, insumos: arr.insumos, arranque_ok: arr.ok, faltan: arr.faltan, pasos,
    papa_tomada_kg: r3(tomada), a_empaque_kg: r3(aEmp), merma_consolidada: mc ? {kilos: mc.kilos, calculada_kg: mc.calculada_kg} : null};
}
/* «Terminar etapa»: las etapas se hacen UNA A LA VEZ, en orden. Solo se puede terminar la que está en curso.
   · Recepción de insumos (con kilos): se escribe cuánta papa entra al turno; se toma de lo recibido (la más vieja primero) y baja del inventario.
   · Lavado y Freído (con kilos): entra lo que salió de la anterior; se escribe cuánto sale (por defecto lo mismo; lo que falte es merma, que se anota al cerrar).
     Lo que sale llega solo a la siguiente etapa con kilos. Si se pone más de lo que entró, pide motivo y queda en espera del Gerente.
   · Empaque: sus pasos (control de calidad, pesaje, sellado, armado) se cierran con la etapa. Los bultos los anota Logística.
   · Las demás etapas solo se marcan como terminadas. */
async function tomarPapaTurno(ctx, t, b) {
  const {db} = ctx, rol = quien(ctx), yaTomada = await R.kilosPapaTomada(db, t.id_turno), st = [];
  const vacio = b.kilos === '' || b.kilos == null;
  if (vacio && yaTomada > 0) return yaTomada;
  if (vacio) throw err(400, 'Escribe cuántos kilos de papa entran al turno.', {codigo: 'KILOS'});
  const k = D.validarKilos(b.kilos); if (!k.ok) throw err(400, k.msg, {codigo: 'KILOS'});
  const inv = await INV.resumen(db), pa = inv.articulos.find(a => a.codigo === 'papa'), saldo = inv.conteo_inicial_hecho && pa ? pa.saldo : 0;
  if (k.valor > saldo + 0.0004) throw err(409, `Solo hay ${r3(saldo)} kg de papa en el inventario. No puedes tomar más.`, {codigo: 'EXCEDE_RECEPCION', disponible: r3(saldo)});
  let resto = k.valor; const marca = Date.now().toString(36);
  for (const rc of await recepcionesLibres(db)) {
    if (resto <= 0.0004) break; const take = r3(Math.min(resto, rc.kg_libres));
    st.push(R.stTomarRecepcion(db, t.id_turno, rc.id, take, rol), INV.salidaPapaTurno(ctx, {id_turno: t.id_turno, id_recepcion: rc.id, kilos: take, ref: 'TP-' + t.id_turno + '-' + rc.id + '-' + marca})); resto = r3(resto - take);
  }
  if (resto > 0.0004) st.push(R.stTomarRecepcion(db, t.id_turno, 'INVENTARIO', resto, rol), INV.salidaPapaTurno(ctx, {id_turno: t.id_turno, id_recepcion: 'el inventario', kilos: resto, ref: 'TP-' + t.id_turno + '-INV-' + marca}));   // papa que ya estaba en el conteo inicial
  st.push(R.stMovProceso(db, t.id_turno, 'recepcion', 'ENTRA', k.valor, 'Papa del inventario', rol), ...auditar(ctx, 'turno', 'Turno ' + t.fecha, 'tomó papa para el turno', {kilos: k.valor}));
  await VS.enLote(db, st);
  return r3(yaTomada + k.valor);
}
export async function terminarEtapa(ctx, b = {}) {
  exigir(ctx, 'turno', 'Solo Producción y el Gerente llevan el turno.');
  const {db} = ctx, t = await turnoAbiertoOError(db), act = await etapaEnCurso(db, t);
  if (!act) throw err(409, 'Todas las etapas ya están terminadas. Anota la merma y cierra el turno.', {codigo: 'SIN_ETAPA'});
  if (b.etapa && b.etapa !== act.k) throw err(409, `Ahora toca «${act.nombre}». Las etapas se terminan una a la vez, en orden.`, {codigo: 'ETAPA_FUERA_DE_ORDEN', actual: act.k});
  const et = await etapasKg(db), i = act.kilos ? et.findIndex(e => e.k === act.k) : -1, rol = quien(ctx);
  let espera = null;
  if (i >= 0) {
    const kgDe = async (k, s) => r3((await R.sumasTurno(db, t.id_turno)).etapas.filter(x => x.etapa === k && x.sentido === s).reduce((a, x) => a + x.kg, 0));
    if (i === 0) {
      const entra = await tomarPapaTurno(ctx, t, b), sale = await kgDe(act.k, 'SALE');
      if (entra - sale > 0.0004) await VS.enLote(db, [R.stMovProceso(db, t.id_turno, act.k, 'SALE', r3(entra - sale), 'Pasa a la siguiente etapa', rol)]);
      const sig = et[1];
      if (sig) { const aj = await R.leerAjustes(db), disp = D.disponiblesProceso(await R.procesoHerencia(db, aj.herenciaDesde), await R.mermasTransicion(db, aj.herenciaDesde), et); if (disp[sig.k].entra > 0.0004) await movimiento(ctx, t, {etapa: sig.k, sentido: 'ENTRA', kilos: disp[sig.k].entra, nota: 'Llegó de ' + act.nombre}); }
    } else {
      if (!(await kgDe(act.k, 'ENTRA') > 0)) {   // lo que dejó pasar la etapa anterior llega aquí (también si antes quedó en espera y ya lo aprobó el Gerente)
        const aj = await R.leerAjustes(db), disp = D.disponiblesProceso(await R.procesoHerencia(db, aj.herenciaDesde), await R.mermasTransicion(db, aj.herenciaDesde), et);
        if (!(disp[act.k].entra > 0.0004)) throw err(409, MSG_KILOS, {codigo: 'SIN_KILOS'});
        await movimiento(ctx, t, {etapa: act.k, sentido: 'ENTRA', kilos: disp[act.k].entra});
      }
      if (i < et.length - 1) {
        const entra = await kgDe(act.k, 'ENTRA'), sale = await kgDe(act.k, 'SALE'), falta = r3(entra - sale), vacio = b.kilos === '' || b.kilos == null;
        const kilos = vacio ? falta : (() => { const k = D.validarKilos(b.kilos, {permitirCero: true}); if (!k.ok) throw err(400, k.msg, {codigo: 'KILOS'}); return k.valor; })();
        if (kilos > 0.0004) {
          const r = await movimiento(ctx, t, {etapa: act.k, sentido: 'SALE', kilos, motivo: b.motivo, tipo: b.tipo, nota: 'Pasa a la siguiente etapa'});
          if (r.en_espera) espera = r; else await movimiento(ctx, t, {etapa: et[i + 1].k, sentido: 'ENTRA', kilos, nota: 'Llegó de ' + act.nombre});
        } else if (!(sale > 0) && vacio) throw err(400, 'Escribe cuántos kilos salen de esta etapa.', {codigo: 'KILOS'});
      }
    }
  }
  const quedan = [act.k, ...act.sub.map(x => x.k)];
  await VS.enLote(db, [...quedan.map(k => R.stMarcarAvance(db, t.id_turno, k, rol)), ...auditar(ctx, 'turno', 'Turno ' + t.fecha, 'terminó una etapa', {etapa: act.nombre})]);
  return {...(await turnoActual(db)), terminada: act.k, ...(espera ? {en_espera: true, mensaje: 'Etapa terminada. Los kilos de más quedaron en espera: los aprueba el Gerente.'} : {})};
}

/* ---------- Fase 5 · 5.3 bis Merma consolidada ---------- */
const filaMermaVista = x => ({etapa: x.etapa, kilos: x.kilos, id_motivo: x.id_motivo, motivo: x.motivo_nombre, texto: x.texto || '', anoto: x.persona || x.rol || null});
/* Datos del cierre: la lista de etapas, los dos tramos medidos y lo registrado. Sirve al turno abierto y a la corrección de un turno cerrado. */
async function datosMermaCierre(db, t) {
  const cat = await catalogo(db), etapasM = D.etapasMerma(cat), mc = D.mermaCalculada(await R.kilosPapaTomada(db, t.id_turno), await R.kilosAEmpaque(db, t.id_turno)), reg = await R.getMermaConsolidada(db, t.id_turno);
  const tramos = D.tramosMerma(etapasM, await R.sumasEntraSale(db, t.id_turno)), tramoDe = {}; for (const x of tramos) for (const k of x.etapas) tramoDe[k] = x.k;
  const filas = reg && reg.por_etapas ? (await R.mermasCierreDeTurno(db, t.id_turno)).map(filaMermaVista) : [];
  return {...mc, etapas: etapasM.map(e => ({k: e.k, nombre: e.nombre, tramo: tramoDe[e.k] || null})), tramos, tolerancia_kg: D.tolerMerma(mc.calculada_kg), etapasM, mc,
    registrada: reg ? {kilos: reg.kilos, nota: reg.nota, desglose: JSON.parse(reg.desglose || '[]'), ts: reg.ts, por_etapas: !!reg.por_etapas, filas, sin_explicar_kg: reg.sin_explicar_kg || 0, corregido_ts: reg.corregido_ts || null} : null};
}
export async function mermaConsolidadaInfo(ctx) {
  exigir(ctx, 'verTurno', 'Tu puesto no ve el turno.');
  const {db} = ctx, t = await turnoAbiertoOError(db), d = await datosMermaCierre(db, t); delete d.etapasM; delete d.mc;
  return {...d, motivos: (await R.listarMotivos(db)).filter(m => m.activo).map(m => ({id: m.id, nombre: m.nombre, es_otra: !!m.es_otra}))};
}
/* Una sola vez por turno, al cerrar el proceso (cuando ya pasó todo a Empaque). La papa ya bajó del inventario al tomarla: esto NO descuenta otra vez (no crea movimientos de inventario).
   Formato nuevo: {filas:[{etapa, kilos, id_motivo, texto}], nota}. Formato viejo (pantallas en caché): {kilos, nota, desglose}. */
export async function registrarMermaConsolidada(ctx, b = {}) {
  exigir(ctx, 'turno', 'Solo Producción y el Gerente llevan el turno.');
  const {db} = ctx, t = await turnoAbiertoOError(db);
  if (await R.getMermaConsolidada(db, t.id_turno)) throw err(409, 'La merma de este turno ya se anotó. Es un solo registro por turno.', {codigo: 'YA_REGISTRADA'});
  const tomada = await R.kilosPapaTomada(db, t.id_turno), aEmp = await R.kilosAEmpaque(db, t.id_turno);
  if (!(tomada > 0)) throw err(409, 'Este turno no tomó papa: no hay merma que anotar.', {codigo: 'SIN_RECEPCION'});
  if (!(aEmp > 0)) throw err(409, 'Primero pasa los kilos a Empaque. La merma se anota cuando termina el proceso, antes de empacar.', {codigo: 'SIN_EMPAQUE'});
  if (Array.isArray(b.filas)) { const r = await guardarMermaEtapas(ctx, t, b, {nueva: true}); return {...(await turnoActual(db)), ...r}; }
  const mc = D.mermaCalculada(tomada, aEmp), motivos = (await R.listarMotivos(db)).map(m => ({id: m.id, nombre: m.nombre, es_otra: !!m.es_otra, activo: m.activo}));
  const v = D.validarMermaConsolidada(b, mc.calculada_kg, motivos); if (v.error) throw err(400, v.error, {codigo: v.codigo, ...mc});
  await VS.enLote(db, [R.stMermaConsolidada(db, {id_turno: t.id_turno, ...mc, kilos: v.ok.kilos, nota: v.ok.nota, desglose: v.ok.desglose, rol: quien(ctx)}),
    ...auditar(ctx, 'turno', 'Turno ' + t.fecha, 'anotó la merma del proceso', {kilos: v.ok.kilos, calculada: mc.calculada_kg, tomados: mc.tomados_kg, a_empaque: mc.a_empaque_kg})]);
  return {...(await turnoActual(db)), mensaje: `Merma anotada: ${v.ok.kilos} kg.`};
}
/* Valida y escribe (o reescribe) la merma por etapas de un turno: cabecera + filas + auditoría, todo en un lote */
async function guardarMermaEtapas(ctx, t, b, {nueva = false, cerrado = false, correccion = null} = {}) {
  const {db} = ctx, d = await datosMermaCierre(db, t), mc = d.mc, motivos = (await R.listarMotivos(db)).map(m => ({id: m.id, nombre: m.nombre, es_otra: !!m.es_otra, activo: m.activo}));
  const v = D.validarMermaEtapas(b, {calculada: mc.calculada_kg, tomada: mc.tomados_kg, etapas: d.etapasM, motivos}); if (v.error) throw err(400, v.error, {codigo: v.codigo, etapa: v.etapa, ...mc, ...(v.suma != null ? {suma: v.suma} : {}), ...(v.diferencia != null ? {diferencia: v.diferencia} : {})});
  const o = v.ok, por = new Map(); for (const f of o.filas) { const x = por.get(f.id_motivo) || {id_motivo: f.id_motivo, motivo: f.motivo, kilos: 0, texto: null}; x.kilos = r3(x.kilos + f.kilos); if (f.texto) x.texto = f.texto; por.set(f.id_motivo, x); }
  const desglose = [...por.values()], rol = quien(ctx), persona = ctx.persona || null, ref = 'MC-' + t.id_turno;
  const filas = o.filas.map(f => R.stMerma(db, {id_turno: t.id_turno, etapa: f.etapa, origen: 'cierre', clase: 'MERMA', kilos: f.kilos, unidad: 'kg', motivo: {id: f.id_motivo, nombre: f.motivo}, texto: f.texto, ref, rol, persona}));
  const antes = nueva ? null : (await R.mermasCierreDeTurno(db, t.id_turno)).map(x => ({[x.etapa]: x.kilos}));
  const cab = nueva ? R.stMermaConsolidadaEtapas(db, {id_turno: t.id_turno, ...mc, kilos: o.suma, nota: o.nota, desglose, rol, sin_explicar_kg: o.sin_explicar})
    : R.stActualizarCabecera(db, t.id_turno, {kilos: o.suma, nota: o.nota, desglose, sin_explicar_kg: o.sin_explicar, corregido_rol: rol});
  const accion = nueva ? 'anotó la merma del proceso por etapas' : cerrado ? 'corrigió la merma de un turno cerrado' : 'corrigió la merma del proceso por etapas';
  await VS.enLote(db, [...(nueva ? [] : [R.stAnularMermasCierre(db, t.id_turno)]), cab, ...filas,
    ...auditar(ctx, 'turno', 'Turno ' + t.fecha, accion, {kilos: o.suma, calculada: mc.calculada_kg, sin_explicar: o.sin_explicar, etapas: o.filas.map(f => ({[f.etapa]: f.kilos})), ...(nueva ? {} : {antes}), ...(correccion ? {motivo_correccion: correccion} : {})})]);
  return {kilos: o.suma, sin_explicar_kg: o.sin_explicar, etapas: o.filas.length, mensaje: `Merma anotada: ${o.suma} kg en ${o.filas.length} ${o.filas.length === 1 ? 'etapa' : 'etapas'}.`};
}
/* Corregir la lista mientras el turno sigue abierto (Producción y Gerente) */
export async function corregirMermaAbierta(ctx, b = {}) {
  exigir(ctx, 'turno', 'Solo Producción y el Gerente llevan el turno.');
  const {db} = ctx, t = await turnoAbiertoOError(db);
  if (!(await R.getMermaConsolidada(db, t.id_turno))) throw err(409, 'Todavía no se anotó la merma de este turno.', {codigo: 'NO_REGISTRADA'});
  const r = await guardarMermaEtapas(ctx, t, b); return {...(await turnoActual(db)), ...r};
}
/* Corregir un turno ya cerrado: solo el Gerente, con nota obligatoria (queda en la auditoría) */
/* Lo que ve el Gerente para corregir la merma de un turno ya cerrado */
export async function mermaCerradaInfo(ctx, idTurno) {
  exigir(ctx, 'dueno', 'Solo el Gerente corrige la merma de un turno cerrado.');
  const {db} = ctx, t = await R.turnoPorId(db, idTurno); if (!t) throw err(404, 'No encontré ese turno.');
  if (t.estado !== 'CERRADO') throw err(409, 'Ese turno sigue abierto.', {codigo: 'TURNO_ABIERTO'});
  const d = await datosMermaCierre(db, t); delete d.etapasM; delete d.mc;
  return {...d, id_turno: t.id_turno, fecha: t.fecha, motivos: (await R.listarMotivos(db)).filter(m => m.activo).map(m => ({id: m.id, nombre: m.nombre, es_otra: !!m.es_otra}))};
}
export async function corregirMermaCerrada(ctx, idTurno, b = {}) {
  exigir(ctx, 'dueno', 'Solo el Gerente corrige la merma de un turno cerrado. Los demás puestos usan «Pedir autorización».');
  const {db} = ctx, t = await R.turnoPorId(db, idTurno); if (!t) throw err(404, 'No encontré ese turno.');
  if (t.estado !== 'CERRADO') throw err(409, 'Ese turno sigue abierto: corrige la merma desde el cierre.', {codigo: 'TURNO_ABIERTO'});
  if (!(await R.getMermaConsolidada(db, t.id_turno))) throw err(409, 'Ese turno no tiene merma anotada.', {codigo: 'NO_REGISTRADA'});
  const nota = txt(b.correccion, 200); if (nota.length < 3) throw err(400, 'Escribe por qué corriges la merma de un turno cerrado (mínimo 3 letras).', {codigo: 'CORRECCION'});
  return guardarMermaEtapas(ctx, t, b, {cerrado: true, correccion: nota});
}

/* ---------- Fase 5 · 5.3 Catálogo de etapas (datos) ---------- */
const ETAPAS_FIJAS = ['recepcion', 'fritado', 'empacado'];   // las usan los bonos y el empaque: no se quitan ni dejan de llevar kilos
export async function listaEtapas(ctx) {
  exigir(ctx, 'verPanel', 'Tu puesto no ve las etapas.');
  return {etapas: (await catalogo(ctx.db)).map(e => ({clave: e.clave, nombre: e.nombre, orden: e.orden, padre: e.padre || null, lleva_kilos: !!e.kilos, activa: !!e.activo, fija: ETAPAS_FIJAS.includes(e.clave)}))};
}
export async function guardarEtapa(ctx, clave, b = {}) {
  exigir(ctx, 'dueno', 'Solo el Gerente cambia las etapas del proceso.');
  const {db} = ctx, nombre = txt(b.nombre, 60), orden = b.orden == null || b.orden === '' ? null : Number(b.orden);
  if (orden != null && !(Number.isFinite(orden) && orden >= 0 && orden <= 10000)) throw err(400, 'El orden debe ser un número.');
  if (!clave) {
    if (nombre.length < 2) throw err(400, 'Escribe el nombre de la etapa.');
    const cat = await catalogo(db), padre = b.padre ? String(b.padre) : null;
    if (padre && !cat.some(e => e.clave === padre && !e.padre)) throw err(400, 'La etapa a la que pertenece no existe.');
    const base = nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'etapa';
    let k = base, n = 2; while (cat.some(e => e.clave === k)) k = base + '_' + n++;
    const ord = orden != null ? orden : Math.max(0, ...cat.filter(e => e.padre === padre || (!e.padre && !padre)).map(e => e.orden)) + 1;
    await VS.enLote(db, [R.stEtapaNueva(db, k, nombre, ord, padre, flag(b.lleva_kilos) && !padre ? 1 : 0), ...auditar(ctx, 'turno', nombre, 'agregó una etapa del proceso', {clave: k})]);
  } else {
    const e = await R.getEtapa(db, clave); if (!e) throw err(404, 'No encontré esa etapa.');
    const kilos = b.lleva_kilos == null ? e.kilos : (flag(b.lleva_kilos) && !e.padre ? 1 : 0), activo = b.activa == null ? e.activo : (flag(b.activa) ? 1 : 0);
    if (ETAPAS_FIJAS.includes(clave) && (!kilos || !activo)) throw err(409, `${e.nombre} no se puede quitar ni dejar sin kilos: la usan los bonos y el empaque.`, {codigo: 'ETAPA_FIJA'});
    await VS.enLote(db, [R.stEtapaEditar(db, clave, b.nombre == null ? e.nombre : (nombre.length >= 2 ? nombre : e.nombre), orden != null ? orden : e.orden, kilos, activo), ...auditar(ctx, 'turno', e.nombre, 'cambió una etapa del proceso', {clave, kilos, activo})]);
  }
  return listaEtapas(ctx);
}

/* ---------- Fase 6 · Panel ejecutivo ---------- */
/* Filtros combinables (cada uno que viene se aplica): turno=Diurno|Nocturno, dia=AAAA-MM-DD, semana=AAAA-MM-DD (cualquier día de esa semana), mes=AAAA-MM.
   Sin ningún filtro: el mes actual. Sin dinero. */
export async function panel(ctx, q = {}) {
  exigir(ctx, 'verPanel', 'Tu puesto no ve el panel de Producción.');
  const v = D.validarFiltrosPanel(q); if (v.error) throw err(400, v.error);
  const f = v.ok, idT = Number(q.id_turno) > 0 ? Number(q.id_turno) : null; if (!f.turno && !f.dia && !f.semana && !f.mes && !idT) f.mes = hoy().slice(0, 7);
  const {db} = ctx, todos = await R.turnosRecientes(db, 800);
  const turnos = todos.filter(t => (!idT || t.id_turno === idT) && D.cumpleFiltros({jornada: t.jornada, fecha: t.fecha_jornada || t.fecha}, f, GR.lunesDe));
  const ids = turnos.map(t => t.id_turno), [cons, prod, papa, mcs, viejas, inv] = await Promise.all([R.consumosPorTurno(db, ids), R.kilosProducidosPorTurno(db, ids), R.papaTomadaPorTurno(db, ids), R.mermasConsolidadasPorTurno(db, ids), R.mermasViejasPorTurno(db, ids), INV.resumen(db)]);
  const por = (arr, k = 'kg') => Object.fromEntries(arr.map(x => [x.id_turno, x[k]])), prodM = por(prod), papaM = por(papa), mcM = por(mcs, 'kilos'), vM = por(viejas);
  const arts = ['papa', 'aceite', 'agua', 'sal', 'quimicos', 'empaque'], info = Object.fromEntries(inv.articulos.map(a => [a.codigo, a]));
  const pct = (a, b) => b > 0 ? Math.round(a / b * 10000) / 100 : null;
  const filas = turnos.map(t => {
    const consumo = Object.fromEntries(arts.map(a => [a, r3(cons.filter(c => c.id_turno === t.id_turno && (a === 'empaque' ? (c.articulo === 'empaque' || INV.esBolsa(c.articulo)) : c.articulo === a)).reduce((s, c) => s + c.cantidad, 0))]));
    const tomada = r3(papaM[t.id_turno] || 0), prodk = r3(prodM[t.id_turno] || 0), merma = r3(t.id_turno in mcM ? mcM[t.id_turno] : (vM[t.id_turno] || 0));
    return {id_turno: t.id_turno, fecha: t.fecha_jornada || t.fecha, jornada: t.jornada || null, estado: t.estado, consumo, papa_tomada_kg: tomada, kilos_producidos: prodk, merma_kg: merma, merma_consolidada: t.id_turno in mcM, merma_pct: pct(merma, tomada), rendimiento_pct: pct(prodk, tomada)};
  });
  const sum = fn => r3(filas.reduce((a, x) => a + fn(x), 0)), tomadaT = sum(x => x.papa_tomada_kg), prodT = sum(x => x.kilos_producidos), mermaT = sum(x => x.merma_kg);
  return {filtros: f, turnos: filas.length,
    consumo: arts.map(a => ({articulo: a, nombre: a === 'empaque' ? 'Bolsas de presentación' : (info[a] || {}).nombre || a, unidad: (info[a] || {}).unidad || '', cantidad: sum(x => x.consumo[a])})),
    produccion: {papa_tomada_kg: tomadaT, kilos_producidos: prodT, merma_kg: mermaT, merma_pct: pct(mermaT, tomadaT), rendimiento_pct: pct(prodT, tomadaT)}, filas};
}

/* ---------- Resumen de Producción por periodo (primera pantalla de Producción) ----------
   periodo = turno (el abierto o el último) | dia | semana | mes; ref = día de referencia AAAA-MM-DD (por defecto hoy). Sin dinero. */
const fechaMas = (f, n) => { const d = new Date(f + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export async function resumenPeriodo(ctx, q = {}) {
  exigir(ctx, 'verPanel', 'Tu puesto no ve el resumen de Producción.');
  const periodo = q.periodo || 'turno', {db} = ctx;
  if (!['turno', 'dia', 'semana', 'mes'].includes(periodo)) throw err(400, 'El periodo debe ser turno, día, semana o mes.');
  const ref = q.ref || hoy(); if (periodo !== 'turno' && D.validarFiltrosPanel({dia: ref}).error) throw err(400, 'La fecha no es válida.');
  let filtros, desde = null, hasta = null;
  if (periodo === 'turno') { const u = (await R.turnosRecientes(db, 1))[0]; filtros = {id_turno: u ? u.id_turno : -1}; }
  else if (periodo === 'dia') { filtros = {dia: ref}; desde = hasta = ref; }
  else if (periodo === 'semana') { filtros = {semana: ref}; desde = GR.lunesDe(ref); hasta = fechaMas(desde, 6); }
  else { filtros = {mes: ref.slice(0, 7)}; desde = ref.slice(0, 7) + '-01'; }
  const P = await panel(ctx, filtros), filas = P.filas, ids = filas.map(x => x.id_turno);
  const [emp, mes, etapas] = await Promise.all([R.empaquePorTurno(db, ids), R.mermasEtapaPorTurno(db, ids), R.listarEtapas(db)]);
  const nombreEt = Object.fromEntries(etapas.map(e => [e.clave, e.nombre]));
  const porProd = new Map(); for (const e of emp) { const x = porProd.get(e.id_producto) || {nombre: e.nombre, unidad: e.categoria === 'SALSAS' ? 'paquete' : 'bulto', cantidad: 0}; x.cantidad += e.cantidad; porProd.set(e.id_producto, x); }
  const productos = [...porProd.values()].sort((a, b) => b.cantidad - a.cantidad), sumaU = u => productos.filter(x => x.unidad === u).reduce((a, x) => a + x.cantidad, 0);
  /* Merma por etapa: turnos nuevos (por etapas) traen su detalle; turnos viejos cerrados con un solo número salen como «Todo el proceso»; los anteriores a la merma consolidada usan las mermas por etapa de siempre */
  const [cabs, cierres] = await Promise.all([R.cabecerasPorTurnos(db, ids), R.mermasCierrePorTurnos(db, ids)]), cab = new Map(cabs.map(c => [c.id_turno, c]));
  const consol = new Set(filas.filter(x => x.merma_consolidada).map(x => x.id_turno)), et = new Map(), costoKg = new Map(), pesos = new Map();
  for (const id of ids) costoKg.set(id, await costoKgPapaTurno(db, id));
  const suma = (k, kg, id) => { const x = et.get(k) || {kg: 0, usd: 0, sinPrecio: false}, c = costoKg.get(id); x.kg += kg; if (c != null) x.usd += kg * c; else x.sinPrecio = true; et.set(k, x); };
  for (const m of mes) if (!consol.has(m.id_turno)) suma(m.etapa, m.kg, m.id_turno);
  for (const id of consol) { const c = cab.get(id); if (c && c.por_etapas) { for (const f of cierres) if (f.id_turno === id) suma(f.etapa, f.kilos, id); } else if (c) suma('__proceso', c.kilos, id); }
  const sinExpl = r3(cabs.filter(c => c.por_etapas).reduce((a, c) => a + (c.sin_explicar_kg || 0), 0)), conDetalle = cabs.filter(c => c.por_etapas).length;
  const merma_etapas = [...et.entries()].filter(([, x]) => x.kg > 0).map(([k, x]) => ({nombre: k === '__proceso' ? 'Todo el proceso (merma del cierre)' : nombreEt[k] || k, kg: r3(x.kg), costo_usd: x.sinPrecio && !x.usd ? null : Math.round(x.usd * 100) / 100})).sort((a, b) => b.kg - a.kg);
  const costoTot = merma_etapas.every(x => x.costo_usd == null) ? null : Math.round(merma_etapas.reduce((a, x) => a + (x.costo_usd || 0), 0) * 100) / 100;
  const ps = new Set(); for (const t of filas) if (t.jornada) { const pe = await GS.personalDeTurno(db, t.fecha, t.jornada); for (const m of pe.miembros || []) ps.add(m.id); }
  const u = filas[0] || null;
  /* Avisos del periodo: insumos cerca o bajo el mínimo (el mismo mínimo único del inventario) y compras que llegaron distinto. Sin dinero. */
  const inv = await INV.resumen(db), avisos = [], fm = n => (Math.round(n * 100) / 100).toLocaleString('es-VE', {maximumFractionDigits: 2});
  if (inv.conteo_inicial_hecho) for (const a of inv.articulos) if (a.nivel === 'rojo' || a.nivel === 'amarillo') avisos.push({tipo: 'minimo', nivel: a.nivel, titulo: a.nombre, texto: `Hay ${fm(a.saldo)} ${a.unidad}. ` + (a.nivel === 'rojo' ? `Está en o bajo el mínimo (${fm(a.minimo)} ${a.unidad}): comprar ya.` : `Está cerca del mínimo (${fm(a.minimo)} ${a.unidad}): ir comprando.`)});
  const d0 = desde || (u ? u.fecha : null), dIni = d0 ? Date.parse(d0 + 'T04:00:00Z') : 0;
  const dFin = periodo === 'turno' ? (d0 ? Date.parse(fechaMas(d0, 2) + 'T04:00:00Z') : 9e15) : periodo === 'mes' ? Date.parse(fechaMas(desde.slice(0, 7) + '-28', 5).slice(0, 7) + '-01T04:00:00Z') : Date.parse(fechaMas(hasta, 1) + 'T04:00:00Z');
  if (d0) for (const x of await VR.all(db, 'SELECT * FROM compras_diferencias WHERE ts >= ?1 AND ts < ?2 ORDER BY id DESC LIMIT 20', [dIni, dFin])) avisos.push({tipo: 'llego', nivel: 'rojo', titulo: x.diferencia < 0 ? 'Llegó menos' : 'Llegó más', texto: `${x.producto_nombre}: se compraron ${fm(x.comprado)} ${x.unidad} y llegaron ${fm(x.recibido)}. Motivo: ${x.motivo}`});
  return {periodo, ref, desde, hasta, avisos, turno: periodo === 'turno' && u ? {fecha: u.fecha, jornada: u.jornada, estado: u.estado} : null, turnos: filas.length, turnos_cerrados: filas.filter(x => x.estado === 'CERRADO').length, personas: ps.size,
    produccion: P.produccion, empaque: {bultos: sumaU('bulto'), paquetes: sumaU('paquete'), productos}, merma_etapas, sin_explicar_kg: sinExpl, turnos_con_detalle: conDetalle, costo_merma_usd: costoTot};
}

/* Filas para exportar «Merma del proceso por etapa» (desde/hasta = AAAA-MM-DD del turno). Gerencia y Administración reciben además el costo; Producción y Logística no (lo quita el filtro de dinero). */
export async function mermaEtapasExportar(ctx, {desde, hasta} = {}) {
  exigir(ctx, 'verPanel', 'Tu puesto no ve la merma por etapa.');
  const {db} = ctx; if ((desde && D.validarFiltrosPanel({dia: desde}).error) || (hasta && D.validarFiltrosPanel({dia: hasta}).error)) throw err(400, 'La fecha no es válida.');
  const turnos = (await R.turnosRecientes(db, 800)).filter(t => { const f = t.fecha_jornada || t.fecha; return (!desde || f >= desde) && (!hasta || f <= hasta); }), ids = turnos.map(t => t.id_turno), por = new Map(turnos.map(t => [t.id_turno, t]));
  const [cierres, etapas] = await Promise.all([R.mermasCierrePorTurnos(db, ids), R.listarEtapas(db)]), nom = Object.fromEntries(etapas.map(e => [e.clave, e.nombre])), costoKg = new Map();
  for (const id of ids) costoKg.set(id, await costoKgPapaTurno(db, id));
  return {filas: cierres.map(f => { const t = por.get(f.id_turno), c = costoKg.get(f.id_turno); return {fecha: t.fecha_jornada || t.fecha, turno: t.jornada || '', etapa: nom[f.etapa] || f.etapa, kilos: f.kilos, motivo: f.motivo_nombre || '', nota: f.texto || '', anoto: f.persona || f.rol || '', costo_usd: c != null ? Math.round(f.kilos * c * 100) / 100 : null}; })};
}
