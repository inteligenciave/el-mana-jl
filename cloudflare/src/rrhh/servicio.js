/* Marcas de entrada y salida · casos de uso. No conoce HTTP. Sin sueldo, cédula ni tarifa en ninguna respuesta. */
import * as D from './dominio.js';
import * as R from './repo.js';
import * as T from './turnos.js';
import {ROL_TXT, nomRol} from '../ventas/permisos.js';
import {hoyVE} from '../ventas/dominio.js';
import {sincronizarAsistencia, quincenaDe, cargarParam} from './turnos-servicio.js';
import {resolverTurnos} from './grupos-servicio.js';

export const err = (status, message, extra = {}) => Object.assign(new Error(message), {status, message, extra});
const audit = (ctx, ref, nom, accion, detalle) => R.stAuditoria(ctx.db, {rol: ctx.rol, rolTxt: nomRol(ctx.rol), ent: 'marca', ref, nom, accion, detalle});
const exigirMarca = ctx => { if (!D.puedeMarcar(ctx.rol)) throw err(403, D.MSG_SIN_MARCAR); };
const persona = (e, m) => ({empleado_id: e ? e.id : m.empleado_id, nombre: e ? e.n || e.id : m.empleado_id, cargo: e ? e.cargo || '' : '', area: e ? e.area || '' : '', planta: e ? D.esPlanta(e) : true});
const cuenta = presentes => ({total: presentes.length, por_turno: Object.fromEntries(D.TURNOS.map(t => [t, presentes.filter(p => p.turno === t).length]))});

const VENTANA_ABIERTA_MS = 20 * 3600e3; /* una entrada sin salida de hace más de 20 horas ya no es «este turno» */
/* Turno que le toca marcar a una persona AHORA y el día al que pertenece (el turno nocturno pertenece al día en que empieza).
   res: función (persona, fecha) → turno efectivo (grupo de la semana o turno fijo de la ficha) */
/* Personal de oficina (sin turno ni grupo): su marca queda en el turno que corre a esa hora (de 5:00 a 17:59 Diurno; el resto Nocturno, que pertenece al día en que empezó). */
function turnoPorHora(ts) {
  const h = new Date(ts - 4 * 3600e3).getUTCHours(), f0 = T.fechaVE(ts);
  return h >= 5 && h < 18 ? {turno: 'Diurno', fecha: f0} : {turno: 'Nocturno', fecha: h < 5 ? T.mueveDia(f0, -1) : f0};
}
export function turnoAhora(res, par, e, ts) {
  const f0 = T.fechaVE(ts), f1 = T.mueveDia(f0, -1), t1 = res(e, f1);
  if (t1.turno === 'Nocturno' && T.fechaDelTurno(par, 'Nocturno', ts) === f1) return {...t1, fecha: f1};
  return {...res(e, f0), fecha: f0};
}

/* Quién está en planta hoy (entrada marcada y sin salida), agrupado por turno, y la lista de personas activas para marcar */
export async function hoy(ctx) {
  if (!D.puedeVer(ctx.rol)) throw err(403, D.MSG_SIN_VER);
  const ahora = Date.now(), fecha = hoyVE(ahora), [emps, marcas, par] = await Promise.all([R.empleados(ctx.db), R.delDiaYAbiertas(ctx.db, fecha, ahora - VENTANA_ABIERTA_MS), cargarParam(ctx.db)]);
  const por = new Map(emps.map(e => [e.id, e])), res = await resolverTurnos(ctx.db, T.mueveDia(fecha, -1), fecha);
  const presentes = marcas.filter(m => !m.salida_ts && D.cuentaEnPlanta(por.get(m.empleado_id))).map(m => ({...persona(por.get(m.empleado_id), m), turno: m.turno, entrada_ts: m.entrada_ts}));
  const ult = new Map(); for (const m of marcas) ult.set(m.empleado_id, m);
  const trabajadores = emps.filter(D.activo).sort((a, b) => String(a.n || '').localeCompare(String(b.n || ''), 'es')).map(e => {
    const m = ult.get(e.id), tt = turnoAhora(res, par, e, ahora);
    return {...persona(e), turno: tt.turno, grupo_id: tt.grupo_id, estado: !m ? 'fuera' : m.salida_ts ? 'salio' : 'dentro', marco: m && m.quien ? nomRol(m.quien) : '', a_mano: !!m && !m.origen, entrada_ts: m ? m.entrada_ts : null, salida_ts: m ? m.salida_ts : null};
  });
  return {fecha, ...cuenta(presentes), presentes, trabajadores};
}
/* Solo cifras: total y por turno */
export async function conteo(ctx) {
  if (!D.puedeContar(ctx.rol)) throw err(403, D.MSG_SIN_CONTEO);
  const ahora = Date.now(), fecha = hoyVE(ahora), [emps, marcas] = await Promise.all([R.empleados(ctx.db), R.delDiaYAbiertas(ctx.db, fecha, ahora - VENTANA_ABIERTA_MS)]), por = new Map(emps.map(e => [e.id, e]));
  const abiertas = marcas.filter(m => !m.salida_ts && D.cuentaEnPlanta(por.get(m.empleado_id)));
  return {fecha, ...cuenta(abiertas)};
}
const idValido = b => { const id = String((b && b.empleado_id) ?? '').trim(); return /^[A-Za-z0-9_.~:@+-]{1,120}$/.test(id) ? id : null; };
const repetida = e => /UNIQUE/i.test(String((e && e.message) || e));
export async function entrada(ctx, b) {
  exigirMarca(ctx);
  const id = idValido(b); if (!id) throw err(400, 'Elige a la persona.');
  const e = await R.empleado(ctx.db, id); if (!e) throw err(404, 'Esa persona no existe.');
  if (!D.activo(e)) throw err(409, 'Esa persona ya no está activa en Personal.');
  const ts = Date.now(), par = await cargarParam(ctx.db); let tt = turnoAhora(await resolverTurnos(ctx.db, T.mueveDia(hoyVE(ts), -1), hoyVE(ts)), par, e, ts);
  if (!D.turnoValido(tt.turno) && !D.esPlanta(e)) tt = {...tt, ...turnoPorHora(ts)};
  const fecha = tt.fecha;
  if (!D.turnoValido(tt.turno)) throw err(409, (e.n || 'Esta persona') + ' no tiene turno esta semana. Asigna su grupo en «Grupos» o dale un turno fijo (Diurno o Nocturno) en Personal y vuelve a intentar.', {codigo: 'SIN_TURNO'});
  if (await R.abiertaDe(ctx.db, id, ts - VENTANA_ABIERTA_MS)) throw err(409, (e.n || 'Esta persona') + ' ya tiene la entrada marcada y sigue en planta.', {codigo: 'YA_ENTRO'});
  try { await R.lote(ctx.db, [R.stEntrada(ctx.db, {empleado_id: id, fecha, ts, turno: tt.turno, quien: ctx.rol}), ...audit(ctx, id, e.n, 'marcó entrada', {fecha, turno: tt.turno})]); }
  catch (x) { if (repetida(x)) throw err(409, (e.n || 'Esta persona') + ' ya tiene la entrada marcada y sigue en planta.', {codigo: 'YA_ENTRO'}); throw x; }
  return {ok: true, empleado_id: id, nombre: e.n || id, turno: tt.turno, entrada_ts: ts};
}
/* Marcar la entrada de todo el grupo (turno) de una vez: solo a quienes todavía no tienen marca hoy. Todo o nada, con una auditoría por persona. */
export async function entradaGrupo(ctx, b) {
  exigirMarca(ctx);
  const turno = String((b && b.turno) || ''); if (!D.turnoValido(turno)) throw err(400, T.MSG_ELIGE_TURNO);
  const ts = Date.now(), fecha = hoyVE(ts), [emps, marcas, par] = await Promise.all([R.empleados(ctx.db), R.delDiaYAbiertas(ctx.db, fecha, ts - VENTANA_ABIERTA_MS), cargarParam(ctx.db)]);
  const res = await resolverTurnos(ctx.db, T.mueveDia(fecha, -1), fecha), ya = new Set(marcas.map(m => m.empleado_id)), sts = [], nombres = [];
  for (const e of emps.filter(D.activo)) {
    if (ya.has(e.id)) continue;
    const tt = turnoAhora(res, par, e, ts); if (tt.turno !== turno) continue;
    sts.push(R.stEntrada(ctx.db, {empleado_id: e.id, fecha: tt.fecha, ts, turno, quien: ctx.rol}), ...audit(ctx, e.id, e.n, 'marcó entrada', {fecha: tt.fecha, turno, con: 'todo el grupo'})); nombres.push(e.n || e.id);
  }
  if (!nombres.length) throw err(409, 'Todo el turno ' + turno + ' ya tiene la entrada marcada, o no hay personas asignadas a ese turno.', {codigo: 'NADIE_POR_MARCAR'});
  try { await R.lote(ctx.db, sts); } catch (x) { if (repetida(x)) throw err(409, 'Alguien ya tenía la entrada marcada. Vuelve a intentar.', {codigo: 'YA_ENTRO'}); throw x; }
  return {ok: true, turno, entrada_ts: ts, marcadas: nombres.length, nombres};
}
/* Quitar una entrada marcada a mano que todavía no tiene salida (por ejemplo, quien faltó). Las marcas del lector no se borran aquí. */
export async function quitarEntrada(ctx, b) {
  exigirMarca(ctx);
  const id = idValido(b); if (!id) throw err(400, 'Elige a la persona.');
  const e = await R.empleado(ctx.db, id); if (!e) throw err(404, 'Esa persona no existe.');
  const ts = Date.now(), m = await R.abiertaDe(ctx.db, id, ts - VENTANA_ABIERTA_MS);
  if (!m) throw err(409, (e.n || 'Esta persona') + ' no tiene una entrada abierta que quitar.', {codigo: 'SIN_ENTRADA'});
  if (m.origen) throw err(409, 'La entrada de ' + (e.n || 'esta persona') + ' viene del lector y no se quita aquí.', {codigo: 'ES_DEL_LECTOR'});
  await R.lote(ctx.db, [R.stQuitarEntrada(ctx.db, m.id), ...audit(ctx, id, e.n, 'quitó la entrada marcada', {fecha: m.fecha, turno: m.turno})]);
  return {ok: true, empleado_id: id, nombre: e.n || id};
}
/* La salida cierra la entrada abierta de la persona aunque sea de ayer (turno nocturno que cruzó la medianoche): la marca sigue en el día en que empezó */
export async function salida(ctx, b) {
  exigirMarca(ctx);
  const id = idValido(b); if (!id) throw err(400, 'Elige a la persona.');
  const e = await R.empleado(ctx.db, id); if (!e) throw err(404, 'Esa persona no existe.');
  const ts = Date.now(), m = await R.abiertaDe(ctx.db, id, ts - VENTANA_ABIERTA_MS);
  if (!m) throw err(409, (e.n || 'Esta persona') + ' no tiene una entrada abierta: primero marca su entrada.', {codigo: 'SIN_ENTRADA'});
  await R.lote(ctx.db, [R.stSalida(ctx.db, m.id, ts), ...audit(ctx, id, e.n, 'marcó salida', {fecha: m.fecha, turno: m.turno, horas: Math.round(D.horasDe({...m, salida_ts: ts}) * 100) / 100})]);
  try { await sincronizarAsistencia(ctx.db, quincenaDe(m.fecha), id); } catch (x) { console.error(x); } /* la asistencia de la quincena se llena sola con las marcas */
  return {ok: true, empleado_id: id, nombre: e.n || id, entrada_ts: m.entrada_ts, salida_ts: ts};
}
/* Horas marcadas por persona y día entre dos fechas (para la nómina): solo marcas ya cerradas. Solo Gerencia y RRHH. Un turno nocturno cuenta en el día en que empezó. */
export async function horasPeriodo(ctx, desde, hasta) {
  if (!D.puedeVer(ctx.rol)) throw err(403, D.MSG_SIN_VER);
  const f = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
  if (!f(desde) || !f(hasta) || desde > hasta) throw err(400, 'El período no es válido.');
  const dias = {};
  for (const m of await R.entre(ctx.db, desde, hasta)) { const d = (dias[m.empleado_id] ||= {}); d[m.fecha] = (d[m.fecha] || 0) + D.horasDe(m); }
  return {desde, hasta, dias};
}

/* ---------- Turno de trabajo del día (Diurno / Nocturno): lo abren y cierran Gerencia y Recursos humanos ---------- */
const turnoDe = (d, t) => { const x = (d.turnos || {})[t]; return x ? {estado: x.cerrado_ts ? 'cerrado' : 'abierto', desde_ts: x.abierto_ts, hasta_ts: x.cerrado_ts || null, abrio: x.abrio || '', cerro: x.cerro || ''} : {estado: 'sin_abrir', desde_ts: null, hasta_ts: null, abrio: '', cerro: ''}; };
/* Un turno de ayer que sigue abierto (el nocturno que cruzó la medianoche) manda sobre el de hoy */
async function estadoJornada(ctx, ts = Date.now()) {
  const hoy = hoyVE(ts), ayer = T.mueveDia(hoy, -1), [dh, da] = await Promise.all([R.jornadaDoc(ctx.db, hoy), R.jornadaDoc(ctx.db, ayer)]), turnos = {}, docs = {[hoy]: dh, [ayer]: da};
  for (const t of D.TURNOS) { const xa = turnoDe(da, t); turnos[t] = xa.estado === 'abierto' ? {...xa, fecha: ayer} : {...turnoDe(dh, t), fecha: hoy}; }
  return {hoy, turnos, docs};
}
export async function jornada(ctx) {
  if (!D.puedeVer(ctx.rol)) throw err(403, D.MSG_SIN_VER);
  const j = await estadoJornada(ctx);
  return {fecha: j.hoy, puede: D.puedeMarcar(ctx.rol), turnos: j.turnos};
}
export async function abrirJornada(ctx, b) {
  exigirMarca(ctx);
  const t = String((b && b.turno) || ''); if (!D.turnoValido(t)) throw err(400, T.MSG_ELIGE_TURNO);
  const ts = Date.now(), j = await estadoJornada(ctx, ts); if (j.turnos[t].estado === 'abierto') throw err(409, 'El turno ' + t + ' ya está abierto.');
  const fecha = t === 'Nocturno' ? T.fechaDelTurno(await cargarParam(ctx.db), t, ts) : j.hoy, d = await R.jornadaDoc(ctx.db, fecha);
  d.fecha = fecha; d.turnos = {...(d.turnos || {}), [t]: {abierto_ts: ts, abrio: nomRol(ctx.rol)}};
  await R.lote(ctx.db, [R.stJornada(ctx.db, fecha, d), ...R.stAuditoria(ctx.db, {rol: ctx.rol, rolTxt: nomRol(ctx.rol), ent: 'turno de trabajo', ref: fecha + ' ' + t, nom: 'Turno ' + t, accion: 'abrió el turno ' + t, detalle: {fecha, turno: t}})]);
  return jornada(ctx);
}
export async function cerrarJornada(ctx, b) {
  exigirMarca(ctx);
  const t = String((b && b.turno) || ''); if (!D.turnoValido(t)) throw err(400, T.MSG_ELIGE_TURNO);
  const j = await estadoJornada(ctx), x = j.turnos[t]; if (x.estado !== 'abierto') throw err(409, 'El turno ' + t + ' no está abierto.');
  const fecha = x.fecha, d = j.docs[fecha];
  d.turnos[t] = {...d.turnos[t], cerrado_ts: Date.now(), cerro: nomRol(ctx.rol)};
  await R.lote(ctx.db, [R.stJornada(ctx.db, fecha, d), ...R.stAuditoria(ctx.db, {rol: ctx.rol, rolTxt: nomRol(ctx.rol), ent: 'turno de trabajo', ref: fecha + ' ' + t, nom: 'Turno ' + t, accion: 'cerró el turno ' + t, detalle: {fecha, turno: t}})]);
  return jornada(ctx);
}
