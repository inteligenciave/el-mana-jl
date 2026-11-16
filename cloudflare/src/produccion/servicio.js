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

export const err = VS.err;
const txt = (v, max = 200) => (v == null ? '' : String(v)).trim().slice(0, max);
const r3 = n => Math.round(n * 1000) / 1000;
const dol = c => c == null ? null : c / 100;
const exigir = (ctx, accion, msg) => { if (!puede(ctx.rol, accion)) throw err(403, msg || 'Tu puesto no puede hacer esto.'); };
const hoy = () => VD.hoyVE();
const auditar = (ctx, ref, nom, accion, detalle) => VS.audit(ctx, 'produccion', ref, nom, accion, detalle);

/* ---------- Ajustes (solo el Gerente) ---------- */
export async function ajustes(db) { const a = await R.leerAjustes(db); return {meta_kg: a.meta, corte_ambar_kg: a.corteAmbar || null, tolerancia_kg: a.tolerancia || null, conteo_inicial_hecho: !!a.conteoInicialTs, herencia_desde_ts: a.herenciaDesde || null}; }
export async function guardarAjustes(ctx, b) {
  exigir(ctx, 'dueno', 'Solo el Gerente cambia la meta y los cortes.');
  const meta = D.validarAjuste(b.meta_kg, 'La meta'); if (!meta.ok || meta.valor === '') throw err(400, meta.ok ? 'La meta no puede quedar vacía.' : meta.msg);
  const amb = D.validarAjuste(b.corte_ambar_kg, 'El corte del semáforo'); if (!amb.ok) throw err(400, amb.msg);
  const tol = D.validarAjuste(b.tolerancia_kg, 'La tolerancia del cierre'); if (!tol.ok) throw err(400, tol.msg);
  if (amb.valor !== '' && +amb.valor >= +meta.valor) throw err(400, 'El corte del semáforo debe ser menor que la meta.');
  const prev = await R.leerAjustes(ctx.db);
  await VS.enLote(ctx.db, [R.stConfig(ctx.db, 'meta_zona_kg', meta.valor), R.stConfig(ctx.db, 'semaforo_ambar_kg', amb.valor), R.stConfig(ctx.db, 'tolerancia_cierre_kg', tol.valor),
    ...auditar(ctx, 'ajustes', 'Meta por zona', 'cambió los ajustes', {antes: {meta: prev.meta, ambar: prev.corteAmbar, tolerancia: prev.tolerancia}, despues: {meta: +meta.valor, ambar: amb.valor, tolerancia: tol.valor}})]);
  return ajustes(ctx.db);
}

/* ---------- Tablero por zonas ---------- */
async function filasTablero(db) { return R.lineasPendientes(db); }
export async function tablero(db) {
  const [filas, aj, pausas] = await Promise.all([filasTablero(db), R.leerAjustes(db), R.pausasActivas(db)]);
  const t = D.armarTarjetas(filas, {meta: aj.meta, corteAmbar: aj.corteAmbar, pausas: new Set(pausas.map(p => p.zona)), hoy: hoy()});
  const mp = new Map(pausas.map(p => [p.zona, p]));
  const dec = z => ({...z, monto: dol(z.monto_cents), pausa_motivo: mp.has(z.zona) ? mp.get(z.zona).motivo : null});
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
  return {zona, meta_kg: aj.meta, kilos, falta_kg: aj.meta > 0 ? Math.max(0, r3(aj.meta - kilos)) : null, semaforo: D.semaforo(kilos, aj.meta, aj.corteAmbar), pausada: !!pz, pausa_motivo: pz ? pz.motivo : null,
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
export async function armarSalida(ctx, b) {
  exigir(ctx, 'mover', 'Solo Logística y el Gerente arman salidas.');
  const {db} = ctx, zona = txt(b.zona, 60); if (!zona) throw err(400, 'Falta la zona.');
  if (!Array.isArray(b.lineas) || !b.lineas.length) throw err(400, 'Elige qué pedidos salen.');
  if ((await R.pausasActivas(db)).some(p => p.zona === zona)) throw err(409, 'Esa zona está pausada: reanúdala para armar una salida.');
  const aj = await R.leerAjustes(db), filasZona = await R.lineasPendientes(db, zona), porId = new Map(filasZona.map(f => [f.id, f]));
  const pedidosPend = new Map();
  for (const f of filasZona) pedidosPend.set(f.id_pedido, (pedidosPend.get(f.id_pedido) || 0) + D.pendienteLinea(f));
  const elegidas = [], visto = new Set(); let kilosSalida = 0; const bultosPorPedido = new Map();
  for (const l of b.lineas) {
    const n = D.validarBultos(l.bultos); if (!n.ok) throw err(400, n.msg);
    const f = porId.get(+l.id_linea); if (!f) throw err(404, 'Una línea ya no está pendiente en esta zona.');
    if (visto.has(f.id)) throw err(400, 'Una línea está repetida.'); visto.add(f.id);
    const libre = D.pendienteLinea(f) - f.en_salida;
    if (n.valor > libre) throw err(409, `De «${f.nombre}» (${f.nro}) solo quedan ${libre} bultos libres para esta salida.`);
    const kg = r3(n.valor * f.kg_por_bulto); kilosSalida = r3(kilosSalida + kg);
    elegidas.push({id_pedido: f.id_pedido, id_linea: f.id, id_producto: f.id_producto, bultos: n.valor, kilos: kg});
    bultosPorPedido.set(f.id_pedido, (bultosPorPedido.get(f.id_pedido) || 0) + n.valor);
  }
  const kilosZona = r3(filasZona.reduce((a, f) => a + D.pendienteLinea(f) * f.kg_por_bulto, 0));
  const divide = [...bultosPorPedido].some(([id, n]) => n < pedidosPend.get(id));
  const rg = D.reglasSalida({rol: ctx.rol, kilosSalida, kilosZona, meta: aj.meta, motivo: b.motivo, divide});
  if (!rg.ok) throw err(rg.status, rg.msg, {codigo: rg.codigo});
  const id = await VR.siguiente(db, 'salida'), nro = 'SAL-' + String(id).padStart(5, '0'), motivo = txt(b.motivo, 200) || null;
  await VS.enLote(db, [R.stInsertarSalida(db, {id_salida: id, nro, zona, kilos: kilosSalida, meta_kg: aj.meta, motivo, creado_rol: nomRol(ctx.rol)}), ...elegidas.map(l => R.stInsertarSalidaLinea(db, id, l)),
    ...auditar(ctx, nro, 'Zona ' + zona, divide ? 'armó salida dividiendo pedidos' : 'armó salida', {kilos: kilosSalida, meta_kg: aj.meta, motivo, bajo_la_meta: aj.meta > 0 && kilosSalida < aj.meta, divide})]);
  return {id_salida: id, nro, kilos: kilosSalida, divide, bajo_la_meta: aj.meta > 0 && kilosSalida < aj.meta};
}
export async function anularSalida(ctx, id) {
  exigir(ctx, 'mover', 'Solo Logística y el Gerente anulan salidas.');
  const s = await R.getSalida(ctx.db, id); if (!s) throw err(404, 'Salida no encontrada.');
  if (s.estado !== 'ARMANDO') throw err(409, 'Esa salida ya no se puede anular.');
  await VS.enLote(ctx.db, [R.stSalidaAnulada(ctx.db, id), ...auditar(ctx, s.nro, 'Zona ' + s.zona, 'anuló la salida', {kilos: s.kilos})]);
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
    ...auditar(ctx, s.nro, 'Zona ' + s.zona, 'contó la carga del camión', {armado, cargado, motivo: cargado < armado ? b._detalle : null})]);
  return {ok: true, nro: s.nro, armado, cargado, faltan: armado - cargado};
}

/* Despachar: emite la nota o factura de lo que sale, baja apartado y existencias, y cierra la salida, todo en un solo lote. */
export async function despachar(ctx, id, b = {}) {
  exigir(ctx, 'mover', 'Solo Logística y el Gerente despachan.');
  const {db} = ctx, s = await R.getSalida(db, id); if (!s) throw err(404, 'Salida no encontrada.');
  if (s.estado !== 'ARMANDO') throw err(409, 'Esa salida ya fue despachada o anulada.');
  if ((await R.pausasActivas(db)).some(p => p.zona === s.zona)) throw err(409, 'Esa zona está pausada: reanúdala para despachar.');
  const aj = await R.leerAjustes(db), filasZona = await R.lineasPendientes(db, s.zona), kilosZona = r3(filasZona.reduce((a, f) => a + D.pendienteLinea(f) * f.kg_por_bulto, 0));
  /* Se despacha lo que se contó al cargar. Las salidas armadas antes de activar el conteo salen como siempre. */
  if (!s.cargada_ts && aj.cargaDesde && s.creado_ts >= aj.cargaDesde) throw err(409, 'Primero cuenta lo que subió al camión.', {codigo: 'SIN_CARGA'});
  const difCarga = s.cargada_ts ? (await R.difDeSalida(db, id))[0] : null;
  const lineas = (await R.lineasDeSalida(db, id)).map(l => ({...l, bultos: s.cargada_ts ? (l.bultos_cargados || 0) : l.bultos})).filter(l => l.bultos > 0), motivo = txt(b.motivo, 200) || s.motivo || (difCarga && difCarga.motivo) || '';
  if (!lineas.length) throw err(409, 'No se cargó ningún bulto en esta salida. Anúlala y arma otra.');
  const pend = new Map(filasZona.map(f => [f.id, f])), porPedido = new Map();
  for (const l of lineas) {
    const f = pend.get(l.id_linea); if (!f || D.pendienteLinea(f) < l.bultos) throw err(409, 'Un pedido de esta salida cambió (se anuló o ya salió). Anula la salida y arma otra.');
    (porPedido.get(l.id_pedido) || porPedido.set(l.id_pedido, []).get(l.id_pedido)).push(l);
  }
  const divide = [...porPedido].some(([ip, ls]) => filasZona.filter(f => f.id_pedido === ip).reduce((a, f) => a + D.pendienteLinea(f), 0) > ls.reduce((a, l) => a + l.bultos, 0));
  const rg = D.reglasSalida({rol: ctx.rol, kilosSalida: s.kilos, kilosZona, meta: aj.meta, motivo, divide});
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
    ...auditar(ctx, s.nro, 'Zona ' + s.zona, 'despachó la salida', {kilos: s.kilos, vehiculo: vehTxt || null, chofer: choTxt || null, documentos: docs.map(d => d.nro), motivo: motivo || null, bajo_la_meta: aj.meta > 0 && s.kilos < aj.meta}));
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
async function armarTurno(db, t) {
  const [movs, emp, sumas, aj0, kgEmp] = await Promise.all([R.movimientosDeTurno(db, t.id_turno), R.empaqueDeTurno(db, t.id_turno), R.sumasTurno(db, t.id_turno), R.leerAjustes(db), R.kgEmpacadosTurno(db, t.id_turno)]);
  const disp = D.disponiblesProceso(await R.procesoHerencia(db, aj0.herenciaDesde), await R.mermasTransicion(db, aj0.herenciaDesde)), retenidas = t.estado === 'ABIERTO' ? await R.retenidasDeTurno(db, t.id_turno) : [];
  const saldo = {}; for (const e of D.ETAPAS) saldo[e.k] = 0;
  for (const x of sumas.etapas) saldo[x.etapa] = r3((saldo[x.etapa] || 0) + (x.sentido === 'ENTRA' ? x.kg : -x.kg));
  return {...t, cierre: t.cierre_json ? JSON.parse(t.cierre_json) : null, cierre_json: undefined, etapas: D.ETAPAS.map(e => ({k: e.k, nombre: e.t, saldo_kg: saldo[e.k], entra_kg: r3(sumas.etapas.filter(x => x.etapa === e.k && x.sentido === 'ENTRA').reduce((a, x) => a + x.kg, 0)), sale_kg: r3(sumas.etapas.filter(x => x.etapa === e.k && x.sentido === 'SALE').reduce((a, x) => a + x.kg, 0)), llego_kg: disp[e.k].entra, puede_salir_kg: disp[e.k].sale})),
    movimientos: movs, empaque: emp, bultos_por_producto: sumas.bultos, empaque_libre_kg: r3(Math.max(0, (sumas.etapas.filter(x => x.etapa === 'empacado' && x.sentido === 'ENTRA').reduce((a, x) => a + x.kg, 0)) - kgEmp)), en_espera: retenidas.length};
}
export async function turnoActual(db) {
  const t = await R.turnoAbierto(db);
  const prods = (await VR.listarProductos(db)).filter(p => p.categoria === 'PAPAS' || true).map(p => ({id_producto: p.id_producto, nombre: `${p.nombre} ${p.gramaje || ''}`.trim(), kg_por_bulto: p.kg_por_bulto}));
  return {turno: t ? await armarTurno(db, t) : null, productos: prods, ultimos: (await R.listarTurnos(db, 5)).filter(x => x.estado === 'CERRADO').map(x => ({id_turno: x.id_turno, fecha: x.fecha, cerrado_rol: x.cerrado_rol, cierre: x.cierre_json ? JSON.parse(x.cierre_json) : null}))};
}
export async function abrirTurno(ctx, b = {}) {
  exigir(ctx, 'turno', 'Solo Producción y el Gerente llevan el turno.');
  if (await R.turnoAbierto(ctx.db)) throw err(409, 'Ya hay un turno abierto. Ciérralo antes de abrir otro.');
  try { await VS.enLote(ctx.db, [R.stAbrirTurno(ctx.db, hoy(), nomRol(ctx.rol), txt(b.observaciones, 200)), ...auditar(ctx, 'turno', 'Turno ' + hoy(), 'abrió el turno', {})]); }
  catch (e) { if (/UNIQUE/i.test(String(e.message))) throw err(409, 'Ya hay un turno abierto.'); throw e; }
  return turnoActual(ctx.db);
}
const MSG_KILOS = 'Escribe los kilos para pasar a la siguiente etapa.';
/* Kilos que entraron (>0) en cada etapa del turno (solo lo vigente: lo que está en espera todavía no cuenta) */
async function entradasPorEtapa(db, idTurno) {
  const m = {}; for (const e of D.ETAPAS) m[e.k] = 0;
  for (const x of (await R.sumasTurno(db, idTurno)).etapas) if (x.sentido === 'ENTRA') m[x.etapa] = r3(m[x.etapa] + x.kg);
  return m;
}
async function turnoAbiertoOError(db) { const t = await R.turnoAbierto(db); if (!t) throw err(409, 'No hay un turno abierto. Ábrelo primero.'); return t; }
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

export async function registrarMovimiento(ctx, b) {
  exigir(ctx, 'turno', 'Solo Producción y el Gerente llevan el turno.');
  const {db} = ctx, t = await turnoAbiertoOError(db);
  if (!D.etapaValida(b.etapa)) throw err(400, 'Elige la etapa.');
  if (!['ENTRA', 'SALE'].includes(b.sentido)) throw err(400, 'Elige si entra o sale.');
  const k = D.validarKilos(b.kilos); if (!k.ok) throw err(400, k.msg);
  const i = D.ETAPAS.findIndex(e => e.k === b.etapa);
  if (i > 0) { const ent = await entradasPorEtapa(db, t.id_turno); if (!(ent[D.ETAPAS[i - 1].k] > 0)) throw err(400, MSG_KILOS); }
  /* Herencia: a lavado, fritado y empacado solo entra lo que salió de la etapa anterior; de cada etapa no sale más de lo que entró */
  let heredado = null;
  if (i > 0) { const aj = await R.leerAjustes(db), disp = D.disponiblesProceso(await R.procesoHerencia(db, aj.herenciaDesde), await R.mermasTransicion(db, aj.herenciaDesde)); heredado = b.sentido === 'ENTRA' ? disp[b.etapa].entra : disp[b.etapa].sale; }
  if (heredado != null && k.valor > heredado + 0.0004) {
    const msg = b.sentido === 'ENTRA' ? D.MSG_ENTRA[b.etapa](heredado) : `De esta etapa no puede salir más de lo que entró (${heredado} kg).`;
    if (!txt(b.motivo)) throw err(409, msg, {codigo: 'EXCEDE_HEREDADO', disponible: heredado, etapa: b.etapa, sentido: b.sentido, tipos: D.TIPOS_DIF});
    const {motivo, tipo} = motivoDe(b, 'Escribe por qué.', {exceso: true});
    await VS.enLote(db, [R.stDiferencia(db, {etapa: b.etapa, origen_tipo: 'turno', origen_id: t.id_turno, unidad: 'kg', heredado, usado: k.valor, diferencia: r3(k.valor - heredado), tipo, motivo, estado: 'PENDIENTE', retiene: true, creado_rol: ctx.rol}),
      R.stMovProceso(db, t.id_turno, b.etapa, b.sentido, k.valor, txt(b.nota, 100), quien(ctx), {enEspera: true}),
      ...auditar(ctx, 'turno', 'Turno ' + t.fecha, 'anotó kilos de más (en espera)', {etapa: b.etapa, sentido: b.sentido, kilos: k.valor, heredado, motivo, tipo})]);
    return {...(await turnoActual(db)), en_espera: true, diferencia: await R.ultimaDiferencia(db), mensaje: 'Quedó en espera: lo aprueba el Gerente.'};
  }
  /* Llegan menos kilos de los que salieron de la etapa anterior: la diferencia se calcula y hay que resolverla (salvo que sea solo una parte del lote: parcial) */
  if (b.sentido === 'ENTRA' && heredado != null && heredado - k.valor > 0.0004 && !flag(b.parcial)) {
    const dif = r3(heredado - k.valor), prev = D.ETAPAS[i - 1], f = await leerFaltante(db, b);
    if (!f) throw err(409, `De ${prev.t} salieron ${heredado} kg y a ${D.nombreEtapa(b.etapa)} llegan ${k.valor} kg. Faltan ${dif} kg: elige si todavía están en ${prev.t} (no se sacaron completos) o si fueron merma.`,
      {codigo: 'FALTA_RESOLVER', salieron_kg: heredado, llegan_kg: k.valor, diferencia_kg: dif, etapa: b.etapa, etapa_anterior: prev.k, ...(await opcionesFaltante(db))});
    const fr = filasResolucion(db, t, b.etapa, prev.k, prev.t, dif, f, quien(ctx));
    await VS.enLote(db, [R.stMovProceso(db, t.id_turno, b.etapa, b.sentido, k.valor, txt(b.nota, 100), quien(ctx)), ...fr.movs, ...fr.mermas,
      ...auditar(ctx, 'turno', 'Turno ' + t.fecha, f.clase === 'SIGUE' ? 'dejó kilos en la etapa anterior' : 'anotó merma', {etapa: b.etapa, salieron: heredado, llegan: k.valor, diferencia: dif, motivo: f.motivo ? f.motivo.nombre : null, texto: f.texto || null})]);
    return {...(await turnoActual(db)), faltante: {clase: f.clase === 'SIGUE' ? 'ANTERIOR' : 'MERMA', kilos: dif, etapa: b.etapa, motivo: f.motivo ? f.motivo.nombre : null},
      mensaje: f.clase === 'SIGUE' ? `Quedan ${dif} kg disponibles en ${prev.t} para sacarlos después.` : `Se registraron ${dif} kg de merma (${f.motivo.nombre}).`};
  }
  await VS.enLote(db, [R.stMovProceso(db, t.id_turno, b.etapa, b.sentido, k.valor, txt(b.nota, 100), quien(ctx))]);
  return turnoActual(db);
}
export async function registrarEmpaque(ctx, b) {
  exigir(ctx, 'empacar', 'Solo Logística y el Gerente anotan lo empacado.');
  const {db} = ctx, t = await turnoAbiertoOError(db);
  const n = D.validarBultos(b.bultos); if (!n.ok) throw err(400, n.msg);
  const p = await VR.getProducto(db, +b.id_producto); if (!p) throw err(404, 'Producto no encontrado.');
  const entra = (await entradasPorEtapa(db, t.id_turno)).empacado;
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
  await VS.enLote(db, [R.stEmpaque(db, t.id_turno, p.id_producto, n.valor, quien(ctx))]);
  return turnoActual(db);
}

/* Papa de recepciones validadas: el turno solo toma lo que se recibió y aún no usó otro turno */
const REC_VALIDADAS = ['validado', 'compra', 'almacen'];
export async function tomarRecepcion(ctx, b) {
  exigir(ctx, 'turno', 'Solo Producción y el Gerente llevan el turno.');
  const {db} = ctx, t = await turnoAbiertoOError(db), id = txt(b.id_recepcion, 40);
  if (!id) throw err(400, 'Elige la recepción.');
  const k = D.validarKilos(b.kilos); if (!k.ok) throw err(400, k.msg);
  const rec = await R.getRecepcionDoc(db, id); if (!rec) throw err(404, 'No encontré esa recepción.');
  if (rec.cat !== 'Papa cruda') throw err(409, 'Esa recepción no es de papa cruda.');
  if (!REC_VALIDADAS.includes(rec.estado)) throw err(409, 'Esa recepción todavía no la validó Administración. Solo se usa papa ya validada.', {codigo: 'NO_VALIDADA'});
  const total = +(rec.kgRec ?? rec.qf) || 0, libre = Math.max(0, r3(total - await R.tomadoDeRecepcion(db, id)));
  if (k.valor > libre + 0.0004) throw err(409, `Solo quedan ${libre} kg de papa recibida en ${id}. No puedes anotar más.`, {codigo: 'EXCEDE_RECEPCION', disponible: libre});
  await VS.enLote(db, [R.stTomarRecepcion(db, t.id_turno, id, k.valor, quien(ctx)), R.stMovProceso(db, t.id_turno, 'recepcion', 'ENTRA', k.valor, 'De la recepción ' + id, quien(ctx)),
    ...auditar(ctx, 'turno', 'Turno ' + t.fecha, 'tomó papa de una recepción', {recepcion: id, kilos: k.valor, quedaban: libre})]);
  return turnoActual(db);
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

/* Lo que salió de la etapa anterior y todavía no llegó ni se justificó, por etapa */
async function porLlegar(db) {
  const aj = await R.leerAjustes(db), disp = D.disponiblesProceso(await R.procesoHerencia(db, aj.herenciaDesde), await R.mermasTransicion(db, aj.herenciaDesde));
  return D.ETAPAS.map((e, i) => i > 0 && disp[e.k].entra > 0.0004 ? {etapa: e.k, nombre: e.t, etapa_anterior: D.ETAPAS[i - 1].k, nombre_anterior: D.ETAPAS[i - 1].t, kilos: disp[e.k].entra} : null).filter(Boolean);
}
/* GET /turno/por-resolver: kilos que salieron y no llegaron (por resolver antes de cerrar) + opciones y motivos */
export async function porResolver(db) {
  return {diferencias: await porLlegar(db), ...(await opcionesFaltante(db))};
}
/* Sentencias de una diferencia entre etapas ya resuelta: {movs, mermas} */
function filasResolucion(db, t, etapa, etapaAnt, nombreAnt, kg, f, rol, ajusteAnt = 2) {
  if (f.clase === 'SIGUE') return {movs: [R.stMovProceso(db, t.id_turno, etapaAnt, 'ENTRA', kg, `Volvió a ${nombreAnt}: no se sacó completo`, rol, {ajuste: ajusteAnt})], mermas: [R.stMerma(db, {id_turno: t.id_turno, etapa, origen: 'transicion', clase: 'SIGUE', kilos: kg, rol})]};
  return {movs: [], mermas: [R.stMerma(db, {id_turno: t.id_turno, etapa, origen: 'transicion', clase: 'MERMA', kilos: kg, motivo: f.motivo, texto: f.texto, rol})]};
}
/* POST /turno/resolver-diferencia {etapa, faltante:'ANTERIOR'|'MERMA', id_motivo?, texto?}: resuelve lo que salió de la etapa anterior y no llegó a `etapa` */
export async function resolverDiferencia(ctx, b = {}) {
  exigir(ctx, 'turno', 'Solo Producción y el Gerente llevan el turno.');
  const {db} = ctx, t = await turnoAbiertoOError(db), i = D.ETAPAS.findIndex(e => e.k === b.etapa);
  if (i < 1) throw err(400, 'Elige la etapa a la que no llegó todo (lavado, fritado o empacado).');
  const pend = (await porLlegar(db)).find(x => x.etapa === b.etapa); if (!pend) throw err(409, 'No hay kilos por resolver en esa etapa.');
  const f = await leerFaltante(db, b);
  if (!f) throw err(409, `Faltan ${pend.kilos} kg por llegar a ${pend.nombre}. Elige si todavía están en ${pend.nombre_anterior} o si fueron merma.`, {codigo: 'FALTA_RESOLVER', diferencia_kg: pend.kilos, ...(await opcionesFaltante(db))});
  const fr = filasResolucion(db, t, pend.etapa, pend.etapa_anterior, pend.nombre_anterior, pend.kilos, f, quien(ctx));
  await VS.enLote(db, [...fr.movs, ...fr.mermas, ...auditar(ctx, 'turno', 'Turno ' + t.fecha, f.clase === 'SIGUE' ? 'dejó kilos en la etapa anterior' : 'justificó merma', {etapa: pend.etapa, kilos: pend.kilos, motivo: f.motivo ? f.motivo.nombre : null, texto: f.texto || null})]);
  return {...(await turnoActual(db)), mensaje: f.clase === 'SIGUE' ? `Quedan ${pend.kilos} kg disponibles en ${pend.nombre_anterior}.` : `Se registró ${pend.kilos} kg de merma (${f.motivo.nombre}).`};
}

/* Cierre: por etapa se compara lo que quedó (declarado) con lo registrado, y lo que salió de la etapa anterior con lo que llegó. Cada diferencia faltante hay que resolverla:
   «todavía está en la etapa anterior» (el kilo queda disponible allá) o «fue merma» con motivo de la lista. Sin eso el turno no se cierra.
   Más kilos de los registrados = exceso: motivo y queda en espera hasta que lo apruebe el Jefe.
   Cuerpo: {etapas:{lavado:'70'}, bultos:{id:n}, resoluciones:{etapas:{lavado:{faltante,id_motivo,texto}}, transiciones:{lavado:{...}}},
            motivos:{etapas:{fritado:{tipo,motivo}} (solo exceso), bultos:{id:{tipo,motivo}}}, nota}. */
export async function cerrarTurno(ctx, b = {}) {
  exigir(ctx, 'turno', 'Solo Producción y el Gerente llevan el turno.');
  const {db} = ctx, t = await turnoAbiertoOError(db), sumas = await R.sumasTurno(db, t.id_turno), aj = await R.leerAjustes(db);
  const regE = {}; for (const e of D.ETAPAS) regE[e.k] = 0;
  for (const x of sumas.etapas) regE[x.etapa] = r3((regE[x.etapa] || 0) + (x.sentido === 'ENTRA' ? x.kg : -x.kg));
  const regB = Object.fromEntries(sumas.bultos.map(x => [x.id_producto, x.bultos]));
  const decB = {}, declE = {};
  for (const e of D.ETAPAS) { const v = b.etapas && b.etapas[e.k]; if (!(v === '' || v == null)) { const k = D.validarKilos(v, {permitirCero: true}); if (!k.ok) throw err(400, `${e.t}: ${k.msg}`); declE[e.k] = k.valor; } }
  for (const id of Object.keys(regB)) { const v = b.bultos && b.bultos[id]; if (v === '' || v == null) decB[id] = regB[id]; else { const n = D.validarBultos(v, {permitirCero: true}); if (!n.ok) throw err(400, n.msg); decB[id] = n.valor; } }
  for (const id of Object.keys(b.bultos || {})) if (!(id in decB)) { const n = D.validarBultos(b.bultos[id], {permitirCero: true}); if (!n.ok) throw err(400, n.msg); if (n.valor > 0) decB[id] = n.valor; }
  if (!D.ETAPAS.some(e => regE[e.k] > 0 && (e.k in declE ? declE[e.k] : regE[e.k]) > 0)) throw err(400, 'Escribe los kilos de cada etapa para cerrar el turno.');
  for (const [id, n] of Object.entries(decB)) if (n > 0 && !(regB[id] > 0)) throw err(400, 'Hay bultos que no se anotaron en el turno. Anótalos primero con sus kilos.');
  /* Lo que sigue en espera frena el cierre */
  const ret = await R.retenidasDeTurno(db, t.id_turno);
  if (ret.length) throw err(409, 'Hay diferencias esperando al Gerente. Cuando las apruebe o las rechace, podrás cerrar el turno.', {codigo: 'EN_ESPERA', pendientes: ret.length});
  /* Bultos: declarar más de lo anotado no se acepta; declarar menos pide motivo */
  const prodsTodos = new Map((await VR.productosPorIds(db, [...new Set([...Object.keys(regB), ...Object.keys(decB)].map(Number))])).map(p => [p.id_producto, p]));
  const nombreProd = id => { const p = prodsTodos.get(+id); return p ? `${p.nombre} ${p.gramaje || ''}`.trim() : 'Producto ' + id; };
  for (const id of Object.keys(regB)) if ((decB[id] || 0) > regB[id]) throw err(409, `Declaras ${decB[id]} bultos de «${nombreProd(id)}» y solo anotaste ${regB[id]}. Primero anótalos.`, {codigo: 'BULTOS_DE_MAS', anotados: regB[id], id_producto: +id});
  const mot = b.motivos || {}, res = b.resoluciones || {}, resE = res.etapas || {}, resT = res.transiciones || {}, faltan = [], nuevas = [], exceso = [], movs = [], mermas = [];
  for (const [id, reg] of Object.entries(regB)) {
    const dec = decB[id] || 0; if (dec >= reg) continue;
    const m = mot.bultos && mot.bultos[id], dif = dec - reg;
    if (!m || !D.motivoValido(m.motivo)) { faltan.push({tipo: 'bultos', id_producto: +id, nombre: nombreProd(id), diferencia: dif, unidad: 'bultos'}); continue; }
    const tp = D.tipoDifValido(m.tipo) ? m.tipo : 'OTRO';
    nuevas.push({etapa: 'cierre', origen_tipo: 'cierre', origen_id: t.id_turno, id_producto: +id, unidad: 'bultos', heredado: reg, usado: dec, diferencia: dif, tipo: tp, motivo: txt(m.motivo, 200), estado: 'PENDIENTE', retiene: false, creado_rol: ctx.rol});
  }
  const disp = D.disponiblesProceso(await R.procesoHerencia(db, aj.herenciaDesde), await R.mermasTransicion(db, aj.herenciaDesde));
  const carry = {}, decE = {}, rol = quien(ctx);
  for (let i = D.ETAPAS.length - 1; i >= 0; i--) {   // de la última etapa a la primera: lo que «sigue en la etapa anterior» se suma a lo que se espera allá
    const e = D.ETAPAS[i], prev = i > 0 ? D.ETAPAS[i - 1] : null;
    /* 1) Salió de la etapa anterior y no llegó */
    if (prev && disp[e.k].entra > 0.0004) {
      const kg = disp[e.k].entra, f = await leerFaltante(db, resT[e.k]);
      if (!f) faltan.push({tipo: 'transicion', etapa: e.k, nombre: e.t, etapa_anterior: prev.k, nombre_anterior: prev.t, diferencia: -kg, unidad: 'kg'});
      else { if (f.clase === 'SIGUE') carry[prev.k] = r3((carry[prev.k] || 0) + kg); const fr = filasResolucion(db, t, e.k, prev.k, prev.t, kg, f, rol); movs.push(...fr.movs); mermas.push(...fr.mermas); }
    }
    /* 2) Lo declarado contra lo registrado en la etapa */
    const exp = r3(regE[e.k] + (carry[e.k] || 0)), dec = e.k in declE ? declE[e.k] : exp, dif = r3(dec - exp); decE[e.k] = dec;
    const m = mot.etapas && mot.etapas[e.k], conMotivo = m && D.motivoValido(m.motivo), tp = m && D.tipoDifValido(m.tipo) ? m.tipo : null;
    if (dif > 0) {   // sobran kilos: ¿ya lo aprobó el Jefe?
      const prevD = await R.difDeCierre(db, t.id_turno, e.k);
      if (prevD.some(p => p.estado === 'APROBADA' && p.usado === dec)) { movs.push(R.stMovProceso(db, t.id_turno, e.k, 'ENTRA', dif, 'Ajuste al cierre del turno', rol, {ajuste: 1})); continue; }
      if (!conMotivo) { faltan.push({tipo: 'etapa', etapa: e.k, nombre: e.t, diferencia: dif, unidad: 'kg'}); continue; }
      exceso.push({etapa: e.k, origen_tipo: 'cierre', origen_id: t.id_turno, unidad: 'kg', heredado: exp, usado: dec, diferencia: dif, creado_rol: ctx.rol, tipo: D.tipoParaExceso(tp || 'OTRO'), motivo: txt(m.motivo, 200), estado: 'PENDIENTE', retiene: true});
    } else if (dif < 0) {   // faltan kilos: hay que resolverlo
      const kg = -dif, f = await leerFaltante(db, resE[e.k]);
      if (!f) { faltan.push({tipo: 'etapa', etapa: e.k, nombre: e.t, etapa_anterior: prev ? prev.k : null, nombre_anterior: prev ? prev.t : null, diferencia: dif, unidad: 'kg'}); continue; }
      if (f.clase === 'SIGUE' && !prev) throw err(400, `${e.t} es la primera etapa: no hay etapa anterior donde esté. Elige merma y su motivo.`, {codigo: 'FALTA_RESOLVER'});
      movs.push(R.stMovProceso(db, t.id_turno, e.k, 'SALE', kg, 'Ajuste al cierre del turno', rol, {ajuste: 1}));
      if (f.clase === 'SIGUE') { carry[prev.k] = r3((carry[prev.k] || 0) + kg); movs.push(R.stMovProceso(db, t.id_turno, prev.k, 'ENTRA', kg, `Volvió a ${prev.t}: no se sacó completo`, rol, {ajuste: 3})); mermas.push(R.stMerma(db, {id_turno: t.id_turno, etapa: e.k, origen: 'cierre', clase: 'SIGUE', kilos: kg, rol})); }
      else mermas.push(R.stMerma(db, {id_turno: t.id_turno, etapa: e.k, origen: 'cierre', clase: 'MERMA', kilos: kg, motivo: f.motivo, texto: f.texto, rol}));
    }
  }
  if (faltan.length) throw err(400, 'Antes de cerrar, di qué pasó con: ' + faltan.map(f => f.tipo === 'transicion' ? `${f.nombre} (salieron ${-f.diferencia} kg de ${f.nombre_anterior} y no llegaron)` : `${f.nombre} (${Math.abs(f.diferencia)} ${f.unidad === 'kg' ? 'kg' : 'bultos'} ${f.diferencia < 0 ? 'menos' : 'de más'})`).join(', ') + '.',
    {codigo: 'FALTAN_MOTIVOS', faltan, ...(await opcionesFaltante(db)), tipos: D.TIPOS_DIF});
  if (exceso.length) {   // sobran kilos con motivo: queda en espera y el turno sigue abierto hasta que el Jefe lo apruebe
    await VS.enLote(db, [...exceso.map(d => R.stDiferencia(db, d)), ...auditar(ctx, 'turno', 'Turno ' + t.fecha, 'declaró kilos de más al cerrar (en espera)', {etapas: exceso.map(d => ({[d.etapa]: d.diferencia}))})]);
    throw err(409, 'Declaraste kilos de más. Quedó en espera: cuando el Gerente lo apruebe podrás cerrar el turno.', {codigo: 'EN_ESPERA', pendientes: exceso.length});
  }
  const cmp = D.compararCierre({registradoEtapas: regE, declaradoEtapas: decE, registradoBultos: regB, declaradoBultos: decB, tolerancia: aj.tolerancia});
  const entradas = Object.entries(decB).filter(([, n]) => n > 0), prods = prodsTodos;
  for (const [i] of entradas) if (!prods.has(+i)) throw err(404, 'Un producto del cierre no existe.');
  const fecha = hoy();
  await VS.enLote(db, [R.stCerrarTurno(db, t.id_turno, rol, {...cmp, nota: txt(b.nota, 200) || null}),
    ...nuevas.map(d => R.stDiferencia(db, d)), ...movs, ...mermas,
    ...entradas.flatMap(([i, n]) => [VR.stStock(db, +i, n), R.stEntradaCierre(db, +i, n, t.id_turno, fecha)]),
    ...auditar(ctx, 'turno', 'Turno ' + t.fecha, 'cerró el turno', {bultos: Object.fromEntries(entradas.map(([i, n]) => [prods.get(+i).codigo_sku, n])), fuera_tolerancia: cmp.etapas.filter(e => e.fuera_tolerancia).map(e => e.nombre), diferencias_kg: cmp.etapas.filter(e => e.diferencia_kg).map(e => ({[e.nombre]: e.diferencia_kg}))})]);
  return {ok: true, cierre: cmp, bultos_sumados: entradas.reduce((a, [, n]) => a + n, 0)};
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
  const etapas = D.ETAPAS.map(e => {
    const entro = kgDe(ent, e.k), base = r3(entro + kgDe(trans, e.k)), filas = pm.filter(x => x.etapa === e.k && x.unidad === 'kg'), merma = r3(filas.reduce((a, x) => a + x.kg, 0));
    return {etapa: e.k, nombre: e.t, entro_kg: entro, base_kg: base, merma_kg: merma, merma_pct: pct(merma, base), sigue_en_anterior_kg: kgDe(sigue, e.k),
      por_motivo: filas.map(x => ({id_motivo: x.id_motivo, motivo: x.motivo_nombre, kg: r3(x.kg), veces: x.veces, pct: pct(x.kg, base)})).sort((a, b) => b.kg - a.kg),
      otras: otras.filter(x => x.etapa === e.k && x.unidad === 'kg').map(x => ({texto: x.texto, kg: r3(x.kg)}))};
  });
  const tot = r3(etapas.reduce((a, x) => a + x.merma_kg, 0)), totBase = r3(etapas.reduce((a, x) => a + x.base_kg, 0));
  const carga = pm.filter(x => x.etapa === 'carga');
  return {desde: d || null, hasta: h === 9e15 ? null : h, etapas, total: {merma_kg: tot, base_kg: totBase, merma_pct: pct(tot, totBase)},
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
  return {etapas: D.ETAPAS.map(e => { const en = r3(s.filter(x => x.etapa === e.k && x.sentido === 'ENTRA').reduce((a, x) => a + x.kg, 0)), sa = r3(s.filter(x => x.etapa === e.k && x.sentido === 'SALE').reduce((a, x) => a + x.kg, 0)); return {k: e.k, nombre: e.t, entra_kg: en, sale_kg: sa, saldo_kg: r3(en - sa)}; })};
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
