/* Grupos rotativos (Grupo 1 y Grupo 2) · reglas puras (sin base de datos ni HTTP).
   Cada semana (de lunes a domingo, identificada por su lunes) se asigna el GRUPO COMPLETO a Diurno o Nocturno. Lo que cuenta es la semana en que EMPIEZA el turno.
   El personal sin grupo sigue con el turno fijo de su ficha, sin rotar. */
import {GRUPOS_ASIGNA, GRUPOS_VE} from '../acceso.js';
import {TURNOS} from './turnos.js';
export const puedeAsignarGrupos = rol => GRUPOS_ASIGNA.includes(rol);
export const puedeVerGrupos = rol => GRUPOS_VE.includes(rol);
export const MSG_SIN_ASIGNAR = 'Solo Gerencia y Nómina arman los grupos y asignan su turno de la semana.';
export const MSG_SIN_VER_GRUPOS = 'Tu puesto no ve los grupos.';
export const GRUPOS = [{id: 1, nombre: 'Grupo 1'}, {id: 2, nombre: 'Grupo 2'}];
export const grupoValido = id => GRUPOS.some(g => g.id === +id);
export const opuesto = t => (t === 'Diurno' ? 'Nocturno' : 'Diurno');
export const fechaOk = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const dia = f => Date.parse(f + 'T00:00:00Z') / 864e5, iso = n => new Date(n * 864e5).toISOString().slice(0, 10);
/* Lunes de la semana de una fecha */
export const lunesDe = f => { const n = dia(f), dow = (new Date(n * 864e5).getUTCDay() + 6) % 7; return iso(n - dow); };
export const masSemanas = (lunes, k) => iso(dia(lunes) + 7 * k);

/* Turno que le toca a una persona en una semana.
   fichaTurno: turno fijo de su ficha · gid: grupo en el que está ESA semana (o null) · turnoGrupo: turno que tiene ese grupo esa semana (o null) */
export function turnoEfectivo({fichaTurno, gid, turnoGrupo}) {
  if (gid && TURNOS.includes(turnoGrupo)) return {turno: turnoGrupo, origen: 'grupo', grupo_id: gid};
  if (TURNOS.includes(fichaTurno)) return {turno: fichaTurno, origen: gid ? 'ficha_sin_asignar' : 'ficha', grupo_id: gid || null};
  return {turno: null, origen: 'ninguno', grupo_id: gid || null};
}
/* Marca en un turno que no es el que le tocaba: queda «por revisar» para Nómina (decisión del dueño) */
export const turnoDistinto = (turnoMarca, turnoDebido) => !!turnoDebido && !!turnoMarca && turnoMarca !== turnoDebido;
/* Valida lo que llega para asignar. Devuelve {ok: {semana, grupo_id, turno, ambos}} o {error} */
export function validarAsignacion(b) {
  const x = b || {}, semana = String(x.semana || '');
  if (!fechaOk(semana)) return {error: 'La semana no es válida.'};
  if (!grupoValido(x.grupo_id)) return {error: 'Elige el Grupo 1 o el Grupo 2.'};
  if (!TURNOS.includes(x.turno)) return {error: 'Elige el turno: Diurno o Nocturno.'};
  return {ok: {semana: lunesDe(semana), grupo_id: +x.grupo_id, turno: x.turno, ambos: x.ambos !== false}};
}
