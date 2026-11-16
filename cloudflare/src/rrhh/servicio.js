/* Marcas de entrada y salida · casos de uso. No conoce HTTP. Sin sueldo, cédula ni tarifa en ninguna respuesta. */
import * as D from './dominio.js';
import * as R from './repo.js';
import {ROL_TXT, nomRol} from '../ventas/permisos.js';
import {hoyVE} from '../ventas/dominio.js';
import {sincronizarAsistencia, quincenaDe} from './turnos-servicio.js';

export const err = (status, message, extra = {}) => Object.assign(new Error(message), {status, message, extra});
const audit = (ctx, ref, nom, accion, detalle) => R.stAuditoria(ctx.db, {rol: ctx.rol, rolTxt: nomRol(ctx.rol), ent: 'marca', ref, nom, accion, detalle});
const exigirMarca = ctx => { if (!D.puedeMarcar(ctx.rol)) throw err(403, D.MSG_SIN_MARCAR); };
const persona = (e, m) => ({empleado_id: e ? e.id : m.empleado_id, nombre: e ? e.n || e.id : m.empleado_id, cargo: e ? e.cargo || '' : '', area: e ? e.area || '' : ''});
const cuenta = presentes => ({total: presentes.length, por_turno: Object.fromEntries(D.TURNOS.map(t => [t, presentes.filter(p => p.turno === t).length]))});

/* Quién está en planta hoy (entrada marcada y sin salida), agrupado por turno, y la lista de personas activas para marcar */
export async function hoy(ctx) {
  if (!D.puedeVer(ctx.rol)) throw err(403, D.MSG_SIN_VER);
  const fecha = hoyVE(), [emps, marcas] = await Promise.all([R.empleados(ctx.db), R.delDia(ctx.db, fecha)]);
  const por = new Map(emps.map(e => [e.id, e]));
  const presentes = marcas.filter(m => !m.salida_ts && D.cuentaEnPlanta(por.get(m.empleado_id))).map(m => ({...persona(por.get(m.empleado_id), m), turno: m.turno, entrada_ts: m.entrada_ts}));
  const ult = new Map(); for (const m of marcas) ult.set(m.empleado_id, m);
  const trabajadores = emps.filter(D.activo).sort((a, b) => String(a.n || '').localeCompare(String(b.n || ''), 'es')).map(e => {
    const m = ult.get(e.id);
    return {...persona(e), turno: D.turnoValido(e.turno) ? e.turno : null, estado: !m ? 'fuera' : m.salida_ts ? 'salio' : 'dentro', marco: m && m.quien ? nomRol(m.quien) : '', entrada_ts: m ? m.entrada_ts : null, salida_ts: m ? m.salida_ts : null};
  });
  return {fecha, ...cuenta(presentes), presentes, trabajadores};
}
/* Solo cifras: total y por turno */
export async function conteo(ctx) {
  if (!D.puedeContar(ctx.rol)) throw err(403, D.MSG_SIN_CONTEO);
  const fecha = hoyVE(), [emps, marcas] = await Promise.all([R.empleados(ctx.db), R.delDia(ctx.db, fecha)]), por = new Map(emps.map(e => [e.id, e]));
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
  if (!D.turnoValido(e.turno)) throw err(409, (e.n || 'Esta persona') + ' no tiene turno. Asígnalo (Mañana o Tarde) en Personal y vuelve a intentar.', {codigo: 'SIN_TURNO'});
  const ts = Date.now(), fecha = hoyVE(ts);
  if (await R.abierta(ctx.db, id, fecha)) throw err(409, (e.n || 'Esta persona') + ' ya tiene la entrada marcada y sigue en planta.', {codigo: 'YA_ENTRO'});
  try { await R.lote(ctx.db, [R.stEntrada(ctx.db, {empleado_id: id, fecha, ts, turno: e.turno, quien: ctx.rol}), ...audit(ctx, id, e.n, 'marcó entrada', {fecha, turno: e.turno})]); }
  catch (x) { if (repetida(x)) throw err(409, (e.n || 'Esta persona') + ' ya tiene la entrada marcada y sigue en planta.', {codigo: 'YA_ENTRO'}); throw x; }
  return {ok: true, empleado_id: id, nombre: e.n || id, turno: e.turno, entrada_ts: ts};
}
export async function salida(ctx, b) {
  exigirMarca(ctx);
  const id = idValido(b); if (!id) throw err(400, 'Elige a la persona.');
  const e = await R.empleado(ctx.db, id); if (!e) throw err(404, 'Esa persona no existe.');
  const ts = Date.now(), m = await R.abierta(ctx.db, id, hoyVE(ts));
  if (!m) throw err(409, (e.n || 'Esta persona') + ' no tiene una entrada abierta hoy: primero marca su entrada.', {codigo: 'SIN_ENTRADA'});
  await R.lote(ctx.db, [R.stSalida(ctx.db, m.id, ts), ...audit(ctx, id, e.n, 'marcó salida', {fecha: m.fecha, horas: Math.round(D.horasDe({...m, salida_ts: ts}) * 100) / 100})]);
  try { await sincronizarAsistencia(ctx.db, quincenaDe(m.fecha), id); } catch (x) { console.error(x); } /* la asistencia de la quincena se llena sola con las marcas */
  return {ok: true, empleado_id: id, nombre: e.n || id, entrada_ts: m.entrada_ts, salida_ts: ts};
}
/* Horas marcadas por persona y día entre dos fechas (para la nómina): solo marcas ya cerradas. Solo Gerencia y RRHH. */
export async function horasPeriodo(ctx, desde, hasta) {
  if (!D.puedeVer(ctx.rol)) throw err(403, D.MSG_SIN_VER);
  const f = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
  if (!f(desde) || !f(hasta) || desde > hasta) throw err(400, 'El período no es válido.');
  const dias = {};
  for (const m of await R.entre(ctx.db, desde, hasta)) { const d = (dias[m.empleado_id] ||= {}); d[m.fecha] = (d[m.fecha] || 0) + D.horasDe(m); }
  return {desde, hasta, dias};
}

/* ---------- Turno de trabajo del día (Mañana / Tarde): lo abren y cierran Gerencia y Recursos humanos ---------- */
const turnoDe = (d, t) => { const x = (d.turnos || {})[t]; return x ? {estado: x.cerrado_ts ? 'cerrado' : 'abierto', desde_ts: x.abierto_ts, hasta_ts: x.cerrado_ts || null, abrio: x.abrio || '', cerro: x.cerro || ''} : {estado: 'sin_abrir', desde_ts: null, hasta_ts: null, abrio: '', cerro: ''}; };
export async function jornada(ctx) {
  if (!D.puedeVer(ctx.rol)) throw err(403, D.MSG_SIN_VER);
  const fecha = hoyVE(), d = await R.jornadaDoc(ctx.db, fecha);
  return {fecha, puede: D.puedeMarcar(ctx.rol), turnos: Object.fromEntries(D.TURNOS.map(t => [t, turnoDe(d, t)]))};
}
export async function abrirJornada(ctx, b) {
  exigirMarca(ctx);
  const t = String((b && b.turno) || ''); if (!D.turnoValido(t)) throw err(400, 'Elige el turno: Mañana o Tarde.');
  const fecha = hoyVE(), d = await R.jornadaDoc(ctx.db, fecha), x = turnoDe(d, t);
  if (x.estado === 'abierto') throw err(409, 'El turno ' + t + ' ya está abierto.');
  const ts = Date.now(); d.fecha = fecha; d.turnos = {...(d.turnos || {}), [t]: {abierto_ts: ts, abrio: nomRol(ctx.rol)}};
  await R.lote(ctx.db, [R.stJornada(ctx.db, fecha, d), ...R.stAuditoria(ctx.db, {rol: ctx.rol, rolTxt: nomRol(ctx.rol), ent: 'turno de trabajo', ref: fecha + ' ' + t, nom: 'Turno ' + t, accion: 'abrió el turno ' + t, detalle: {fecha, turno: t}})]);
  return jornada(ctx);
}
export async function cerrarJornada(ctx, b) {
  exigirMarca(ctx);
  const t = String((b && b.turno) || ''); if (!D.turnoValido(t)) throw err(400, 'Elige el turno: Mañana o Tarde.');
  const fecha = hoyVE(), d = await R.jornadaDoc(ctx.db, fecha), x = turnoDe(d, t);
  if (x.estado !== 'abierto') throw err(409, 'El turno ' + t + ' no está abierto.');
  d.turnos[t] = {...d.turnos[t], cerrado_ts: Date.now(), cerro: nomRol(ctx.rol)};
  await R.lote(ctx.db, [R.stJornada(ctx.db, fecha, d), ...R.stAuditoria(ctx.db, {rol: ctx.rol, rolTxt: nomRol(ctx.rol), ent: 'turno de trabajo', ref: fecha + ' ' + t, nom: 'Turno ' + t, accion: 'cerró el turno ' + t, detalle: {fecha, turno: t}})]);
  return jornada(ctx);
}
