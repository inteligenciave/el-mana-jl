/* Marcas de entrada y salida · reglas puras (sin base de datos ni HTTP). */
import {RRHH_MARCA, RRHH_VE, RRHH_CONTEO} from '../acceso.js';
export const puedeMarcar = rol => RRHH_MARCA.includes(rol);
export const puedeVer = rol => RRHH_VE.includes(rol);
export const puedeContar = rol => RRHH_CONTEO.includes(rol);
export const MSG_SIN_MARCAR = 'Solo Gerencia y Nómina marcan entradas y salidas.';
export const MSG_SIN_VER = 'Solo Gerencia y Nómina ven quién está en planta.';
export const MSG_SIN_CONTEO = 'Tu puesto no puede ver cuántas personas hay en planta.';
export const TURNOS = ['Mañana', 'Tarde'];
export const turnoValido = t => TURNOS.includes(t);
export const activo = e => !!e && !e.arch && e.estado !== 'retirado';
/* Horas de entrada a salida (con decimales); sin salida: 0 */
export const horasDe = m => (m.salida_ts && m.entrada_ts ? Math.max(0, (m.salida_ts - m.entrada_ts) / 36e5) : 0);
