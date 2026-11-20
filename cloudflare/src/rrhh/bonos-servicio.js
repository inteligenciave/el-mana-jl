/* Bonos · casos de uso (sin HTTP): esquemas editables, seguimiento en vivo del turno, aplicación automática al cerrar el turno y deshacer.
   Todo el dinero es en DÓLARES; la nómina lo pasa a Bs con la tasa BCV del día de pago. Todo el cálculo vive en el servidor. */
import * as B from './bonos.js';
import * as BR from './bonos-repo.js';
import * as R from './repo.js';
import * as T from './turnos.js';
import * as RD from './dominio.js';
import * as TS from './turnos-servicio.js';
import * as GS from './grupos-servicio.js';
import {nomRol} from '../ventas/permisos.js';
import {hoyVE} from '../ventas/dominio.js';

export const err = TS.err;
const fechaOk = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const audit = (db, rol, rolTxt, ref, nom, accion, detalle) => BR.stAuditoria(db, {rol, rolTxt, ent: 'bono', ref, nom, accion, detalle});
const ver = ctx => { if (!B.puedeVerBonos(ctx.rol)) throw err(403, B.MSG_SIN_BONOS); };
const crear = ctx => { ver(ctx); if (!B.puedeCrearBonos(ctx.rol)) throw err(403, B.MSG_SIN_CREAR); };
const editar = ctx => { ver(ctx); if (!B.puedeEditarBonos(ctx.rol)) throw err(403, B.MSG_SIN_EDITAR); };
const vista = e => ({id: e.id, codigo: e.codigo, nombre: e.nombre, forma: e.forma, fuente: e.fuente, quienes: e.quienes, quienes_txt: B.quienesTxt(e), destino: e.destino, params: e.params, activo: e.activo, archivado: e.archivado, base: e.base, desde_ts: e.desde_ts, unidad: (B.FUENTES.find(f => f.k === e.fuente) || {}).un || '', actualizado_ts: e.actualizado_ts});

/* ---------- Lo medido en un turno ---------- */
export async function medir(db, par, fecha, turno) {
  const [d, h] = T.ventanaTs(par, fecha, turno);
  const [kgEmp, kgFri, bultos, fritos, marcas, emps, gr] = await Promise.all([BR.kilosEmpaque(db, d, h), BR.kilosSalenFritado(db, d, h), BR.bultosPorProducto(db, d, h), BR.friturasEnVentana(db, d, h), BR.marcasTurno(db, fecha, turno), R.empleados(db), GS.personalDeTurno(db, fecha, turno)]);
  const por = new Map(emps.map(e => [e.id, e])), presentes = marcas.map(m => m.empleado_id).filter(id => !por.has(id) || RD.esPlanta(por.get(id))); /* bonos: solo personal de planta */
  const porPres = bultos.map(b => ({id_producto: b.id_producto, nombre: b.nombre, gramos: B.gramosDe(b.gramaje) ?? B.gramosDe(b.nombre), bultos: +b.bultos || 0}));
  return {turno, ventana: [d, h], emps: por, porPres, kilos_empaque: B.r3(kgEmp), kilos_fritado: B.r3(kgFri), bultos_total: porPres.reduce((a, x) => a + x.bultos, 0),
    quienes: {presentes, empaque: presentes.filter(id => B.esDeEmpaque(por.get(id))), fritura: fritos.map(f => f.empleado_id), grupo: presentes.filter(id => gr.miembros.some(x => x.id === id)), etapas: {fritado: fritos.map(f => f.empleado_id)}, emps: por}};
}
const medidaDe = (esq, m) => esq.fuente === 'kilos_empaque' ? {valor: m.kilos_empaque} : esq.fuente === 'kilos_fritado' ? {valor: m.kilos_fritado} : esq.fuente === 'bultos_empaque' ? {valor: m.bultos_total, por_presentacion: m.porPres.filter(x => x.gramos)} : esq.fuente === 'asistencia_nocturna' ? {valor: m.turno === 'Nocturno' ? m.quienes.presentes.length : 0} : esq.fuente === 'actividad' ? {valor: ((m.quienes.etapas[(esq.params || {}).etapa]) || []).length} : {valor: m.quienes.fritura.length};
const nombreDe = (m, id) => (m.emps.get(id) || {}).n || id;

/* ---------- Pantalla de bonos ---------- */
export async function listar(ctx) {
  ver(ctx);
  const [es, ar, ult, par] = await Promise.all([BR.esquemas(ctx.db), BR.archivoViejo(ctx.db), BR.ultimosAplicados(ctx.db, 30), TS.cargarParam(ctx.db)]), ahora = Date.now();
  return {esquemas: es.map(e => ({...vista(e), rige: e.desde_ts > ahora ? ((u) => ({fecha: u.fecha, turno: u.turno}))(T.ubicar(par, e.desde_ts)) : null})), archivo_viejo: ar, ultimos: ult.map(a => ({id: a.id, esquema_id: a.esquema_id, esquema: a.esquema_nombre, fecha: a.fecha, turno: a.turno, estado: a.estado, origen: a.origen, total: a.total, monto_persona: a.monto_persona, quien: nomRol(a.quien) || a.quien, ts: a.ts})),
    formas: B.FORMAS, fuentes: B.FUENTES, quienes: B.QUIENES, etapas: B.ETAPAS_MARCA, areas: B.AREAS_BONO, puede_editar: B.puedeEditarBonos(ctx.rol), puede_crear: B.puedeCrearBonos(ctx.rol), moneda: 'USD', tasa: await TS.tasaHoy(ctx.db)};
}
/* Instante en que empieza el SIGUIENTE turno después de `ts` (un bono nuevo rige desde ahí; nunca toca un turno ya empezado) */
export function proximoTurnoTs(par, ts) {
  const f = T.fechaVE(ts); let mejor = Infinity;
  for (const dia of [T.mueveDia(f, -1), f, T.mueveDia(f, 1), T.mueveDia(f, 2)]) for (const t of T.TURNOS) { const h = T.horarioDe(par, t); if (!h.definido) continue; const ini = T.ventanaTs(par, dia, t)[0]; if (ini > ts && ini < mejor) mejor = ini; }
  return Number.isFinite(mejor) ? mejor : ts + 864e5;
}
export async function guardarEsquema(ctx, id, b) {
  if (id) editar(ctx); else crear(ctx);
  const actual = id ? await BR.esquema(ctx.db, id) : null; if (id && !actual) throw err(404, 'Ese bono no existe.');
  if (actual && actual.archivado) throw err(409, 'Ese bono está archivado: restáuralo para cambiarlo.');
  const v = B.validarEsquema(b, actual, !!id && !B.puedeCrearBonos(ctx.rol)); if (v.error) throw err(400, v.error);
  const o = v.ok, ts = Date.now(), desde = id ? 0 : proximoTurnoTs(await TS.cargarParam(ctx.db), ts);
  const st = [id ? BR.stEsquemaEditar(ctx.db, id, o, ts, ctx.rol) : BR.stEsquemaNuevo(ctx.db, o, ts, ctx.rol, desde), BR.stVer(ctx.db),
    ...audit(ctx.db, ctx.rol, nomRol(ctx.rol), id || 'nuevo', o.nombre, id ? 'cambió un bono' : 'creó un bono', {antes: actual ? {nombre: actual.nombre, params: actual.params, activo: actual.activo} : null, despues: {nombre: o.nombre, forma: o.forma, fuente: o.fuente, quienes: o.quienes, a_quien: B.quienesTxt(o), params: o.params, activo: o.activo, rige_desde: desde ? new Date(desde).toISOString() : undefined}})];
  await BR.lote(ctx.db, st);
  return listar(ctx);
}
export async function archivarEsquema(ctx, id, archivar) {
  editar(ctx);
  const e = await BR.esquema(ctx.db, id); if (!e) throw err(404, 'Ese bono no existe.');
  if (e.base && archivar) throw err(409, 'Los bonos de fábrica no se archivan: puedes desactivarlos.');
  await BR.lote(ctx.db, [BR.stEsquemaArchivar(ctx.db, id, archivar, Date.now(), ctx.rol), BR.stVer(ctx.db), ...audit(ctx.db, ctx.rol, nomRol(ctx.rol), id, e.nombre, archivar ? 'archivó un bono' : 'restauró un bono', {})]);
  return listar(ctx);
}

/* ---------- Seguimiento en vivo ---------- */
/* Qué turno corre ahora por la hora y el horario; entre turnos se muestra el último que terminó */
export function turnoActivo(par, ahora = Date.now()) {
  const u = T.ubicar(par, ahora); if (u.turno) return {...u, en_curso: true};
  const v = T.ubicar(par, ahora - 3600e3); if (v.turno) return {...v, en_curso: false};
  return {turno: 'Diurno', fecha: hoyVE(), en_curso: false};
}
export async function seguimiento(ctx, fecha, turno) {
  ver(ctx);
  const par = await TS.cargarParam(ctx.db), act = turnoActivo(par);
  fecha = fecha || act.fecha; if (!fechaOk(fecha)) throw err(400, 'La fecha no es válida.');
  turno = turno || act.turno; if (!T.TURNOS.includes(turno)) throw err(400, T.MSG_ELIGE_TURNO);
  const esActivo = fecha === act.fecha && turno === act.turno;
  const [es, m, aps] = await Promise.all([BR.esquemas(ctx.db), medir(ctx.db, par, fecha, turno), BR.aplicadosDeTurno(ctx.db, fecha, turno)]), hor = T.horarioDe(par, turno), tasa = await TS.tasaHoy(ctx.db);
  const items = [];
  for (const e of es.filter(x => x.activo && !x.archivado && B.rigeEn(x, m.ventana[0]) && (x.fuente !== 'asistencia_nocturna' || turno === 'Nocturno'))) {
    const ev = B.evaluar(e, medidaDe(e, m)), ids = B.destinatarios(e, m.quienes), ap = aps.find(a => a.esquema_id === e.id) || null;
    const filas = ap ? await BR.filasDe(ctx.db, ap.id) : [];
    items.push({esquema: vista(e), evaluacion: ev,
      personas: ap && ap.estado === 'APLICADO' ? filas.map(f => ({id: f.empleado_id, nombre: nombreDe(m, f.empleado_id), monto: f.monto})) : ids.map(id => ({id, nombre: nombreDe(m, id), monto: ev.monto})),
      total_estimado: B.r2(ev.monto * ids.length),
      aplicado: ap ? {id: ap.id, estado: ap.estado, origen: ap.origen, total: ap.total, monto_persona: ap.monto_persona, quien: nomRol(ap.quien) || ap.quien, ts: ap.ts, deshecho_quien: nomRol(ap.deshecho_quien) || ap.deshecho_quien || null, deshecho_ts: ap.deshecho_ts || null, personas: filas.length} : null});
  }
  const porPres = Object.values(m.porPres.reduce((o, x) => { const k = x.gramos || x.nombre; (o[k] ||= {nombre: x.gramos ? B.presTxt(x.gramos) : x.nombre, bultos: 0}).bultos += x.bultos; return o; }, {}));
  return {fecha, turno, en_curso: esActivo && act.en_curso, es_el_activo: esActivo, horario: {definido: hor.definido, inicio: hor.inicio, fin: hor.fin, horas: hor.horas, cruza: hor.cruza}, ahora: Date.now(), moneda: 'USD', tasa, puede_editar: B.puedeEditarBonos(ctx.rol), puede_crear: B.puedeCrearBonos(ctx.rol),
    resumen: {kilos_empaque: m.kilos_empaque, bultos: m.bultos_total, kilos_fritado: m.kilos_fritado, presentes: m.quienes.presentes.length, en_empaque: m.quienes.empaque.length, fritura: m.quienes.fritura.length, por_presentacion: porPres},
    esquemas: items, total: B.r2(items.reduce((a, x) => a + (x.aplicado ? (x.aplicado.estado === 'APLICADO' ? x.aplicado.total : 0) : x.total_estimado), 0))};
}

/* ---------- Aplicar ---------- */
/* Núcleo: evalúa cada bono activo del turno y guarda los que califican. soloNuevos (auto): no toca lo que ya tiene fila (ni lo deshecho, para respetar el «deshacer»). */
export async function aplicarTurno(db, par, fecha, turno, {origen, rol, rolTxt, soloNuevos, esquemaId}) {
  const [es, m] = await Promise.all([BR.esquemas(db), medir(db, par, fecha, turno)]), ts = Date.now(), st = [], informe = [];
  for (const e of es.filter(x => x.activo && !x.archivado && B.rigeEn(x, m.ventana[0]) && (x.fuente !== 'asistencia_nocturna' || turno === 'Nocturno') && (!esquemaId || x.id === esquemaId))) {
    const ap = await BR.aplicado(db, e.id, fecha, turno);
    if (ap && (soloNuevos || ap.estado === 'APLICADO')) { informe.push({esquema: e.nombre, estado: ap.estado === 'APLICADO' ? 'ya_aplicado' : 'en_revision'}); continue; }
    const ev = B.evaluar(e, medidaDe(e, m)), ids = B.destinatarios(e, m.quienes);
    if (!ev.califica || !(ev.monto > 0)) { informe.push({esquema: e.nombre, estado: 'no_califica', texto: ev.texto}); continue; }
    if (!ids.length) { informe.push({esquema: e.nombre, estado: 'sin_personas', texto: 'Califica, pero no hay a quién pagarle.'}); continue; }
    const total = B.r2(ev.monto * ids.length);
    st.push(BR.stBorrarFilas(db, e.id, fecha, turno),
      BR.stAplicar(db, {esquema_id: e.id, esquema_nombre: e.nombre, fecha, turno, origen, medida: ev.valor, monto_persona: ev.monto, total, detalle: {texto: ev.texto, unidad: ev.unidad, meta: ev.meta, presentaciones: Array.isArray(ev.detalle) ? ev.detalle : undefined, bloques: ev.detalle && ev.detalle.bloques}, quien: rol, ts}),
      ...ids.map(id => BR.stFila(db, e.id, fecha, turno, ts, {empleado_id: id, monto: ev.monto})),
      ...audit(db, rol, rolTxt, fecha + ' ' + turno, e.nombre + ' · ' + turno + ' ' + fecha, origen === 'auto' ? 'aplicó el bono al cerrar el turno' : 'aplicó el bono', {esquema: e.nombre, medida: ev.valor, monto_persona: ev.monto, total, personas: ids.map(id => ({nombre: nombreDe(m, id), monto: ev.monto}))}));
    informe.push({esquema: e.nombre, estado: 'aplicado', monto_persona: ev.monto, personas: ids.length, total});
  }
  if (st.length) await BR.lote(db, [...st, BR.stVer(db)]);
  return informe;
}
/* Manual (Gerencia y Administración): un turno entero o un solo bono. Si estaba deshecho (en revisión) se vuelve a calcular y aplicar. */
export async function aplicarManual(ctx, b) {
  editar(ctx);
  const fecha = String((b && b.fecha) || ''), turno = String((b && b.turno) || ''); if (!fechaOk(fecha)) throw err(400, 'La fecha no es válida.'); if (!T.TURNOS.includes(turno)) throw err(400, T.MSG_ELIGE_TURNO);
  const par = await TS.cargarParam(ctx.db), informe = await aplicarTurno(ctx.db, par, fecha, turno, {origen: 'manual', rol: ctx.rol, rolTxt: nomRol(ctx.rol), soloNuevos: false, esquemaId: b && b.esquema_id ? +b.esquema_id : null});
  return {...(await seguimiento(ctx, fecha, turno)), informe};
}
/* Al cerrar el turno de producción: se aplican los bonos del turno de personal (Diurno/Nocturno) en el que cae el cierre. Nunca hace fallar el cierre. */
export async function alCerrarTurno(db, ts = Date.now()) {
  try {
    const par = await TS.cargarParam(db), u = T.ubicar(par, ts), v = u.turno ? u : T.ubicar(par, ts - 3600e3); if (!v.turno) return {omitido: 'La hora del cierre no cae en ningún turno.'};
    return {fecha: v.fecha, turno: v.turno, informe: await aplicarTurno(db, par, v.fecha, v.turno, {origen: 'auto', rol: 'sistema', rolTxt: 'Sistema (cierre del turno)', soloNuevos: true})};
  } catch (e) { console.error('bonos al cerrar el turno:', (e && e.stack) || e); return {error: String((e && e.message) || e)}; }
}

/* ---------- Deshacer: queda en revisión (no se paga) y se puede volver a aplicar ---------- */
export async function deshacer(ctx, b) {
  editar(ctx);
  const ap = await BR.aplicadoPorId(ctx.db, +(b && b.id)); if (!ap) throw err(404, 'Ese bono aplicado no existe.');
  if (ap.estado !== 'APLICADO') throw err(409, 'Ese bono ya está en revisión.');
  const filas = await BR.filasDe(ctx.db, ap.id), ids = new Set(filas.map(f => f.empleado_id)), pagados = await R.pagosSolapados(ctx.db, ap.fecha, ap.fecha);
  if (pagados.some(p => ids.has(p.empleado_id))) throw err(409, 'Ese bono ya entró en un pago de nómina: no se puede deshacer.');
  await BR.lote(ctx.db, [BR.stDeshacer(ctx.db, ap.id, ctx.rol, Date.now()), BR.stVer(ctx.db), ...audit(ctx.db, ctx.rol, nomRol(ctx.rol), ap.fecha + ' ' + ap.turno, ap.esquema_nombre + ' · ' + ap.turno + ' ' + ap.fecha, 'deshizo el bono (quedó en revisión)', {total: ap.total, personas: filas.length})]);
  return seguimiento(ctx, ap.fecha, ap.turno);
}
