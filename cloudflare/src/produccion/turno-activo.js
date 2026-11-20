/* Turno activo de Producción: el que toca ahora según la hora (Diurno o Nocturno).
   Se crea SOLO al pulsar «Iniciar producción» (y solo con requisitos y personal); mirar la pantalla no crea nada. La producción arranca después, con «Iniciar producción» (cuando todos los requisitos están en verde).
   Lo usan Producción y Compras (lo que se recibe queda cargado al turno activo), por eso vive aparte. Sin HTTP. */
import * as D from './dominio.js';
import * as R from './repo.js';
import * as VS from '../ventas/servicio.js';
import * as VD from '../ventas/dominio.js';
import * as GS from '../rrhh/grupos-servicio.js';
import * as RT from '../rrhh/turnos.js';
import * as TSV from '../rrhh/turnos-servicio.js';

/* Qué turno de RRHH corresponde ahora (el que está en curso o, entre dos turnos, el que empieza primero) y a qué día pertenece */
export async function jornadaActual(db, ahora = Date.now()) {
  const par = await TSV.cargarParam(db), u = RT.ubicar(par, ahora);
  if (u.turno) return {jornada: u.turno, fecha: u.fecha};
  return {jornada: D.jornadaProxima(par, RT.minVE(ahora), RT.horarioDe), fecha: RT.fechaVE(ahora)};
}
/* Turno en marcha: el abierto que YA se inició con «Iniciar producción». Mirar la pantalla nunca crea ni cambia nada.
   Si hay uno abierto sin iniciar (restos de versiones anteriores), se ignora. */
export async function turnoActivo(db) { const t = await R.turnoAbierto(db); return t && t.inicio_ts ? t : null; }
/* Crea (o reutiliza) el turno de la hora de ahora. SOLO lo llama «Iniciar producción», después de comprobar requisitos y personal.
   Un turno abierto sin iniciar de otra jornada se retira. */
export async function crearTurnoActual(db, ahora = Date.now()) {
  const {jornada, fecha} = await jornadaActual(db, ahora);
  let t = await R.turnoAbierto(db);
  if (t && !t.inicio_ts && (t.jornada !== jornada || (t.fecha_jornada || t.fecha) !== fecha)) { await R.run(db, 'DELETE FROM turnos WHERE id_turno = ?1 AND inicio_ts IS NULL', [t.id_turno]); t = null; }
  if (t) return t;
  const pe = await GS.personalDeTurno(db, fecha, jornada);
  try { await VS.enLote(db, [R.stAbrirTurnoJornada(db, VD.hoyVE(), 'Sistema', null, {jornada, fecha_jornada: fecha, grupo_id: pe.grupo_id ?? null})]); }
  catch (e) { if (!/UNIQUE/i.test(String(e.message))) throw e; }
  return R.turnoAbierto(db);
}
/* ¿A alguien de este turno se le registraron horas extra? Entonces el turno sigue activo aunque pase su hora, hasta cerrarlo. */
export async function conHorasExtra(db, t) {
  try { const r = await TSV.turno({db, rol: 'dueno'}, t.fecha_jornada || t.fecha, t.jornada); return ((r.totales || {}).horas_extra || 0) > 0; } catch (e) { return false; }
}
/* Vencido = ya pasó la hora del turno y nadie tiene horas extra: hay que cerrarlo para que empiece el siguiente. */
export const turnoVencido = async (db, t, ahora = Date.now()) => {
  if (!t || !t.jornada) return false; const {jornada, fecha} = await jornadaActual(db, ahora);
  return (t.jornada !== jornada || (t.fecha_jornada || t.fecha) !== fecha) && !(await conHorasExtra(db, t));
};
