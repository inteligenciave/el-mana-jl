/* Marcas de entrada y salida · reglas puras (sin base de datos ni HTTP). */
import {RRHH_MARCA, RRHH_VE, RRHH_CONTEO} from '../acceso.js';
export const puedeMarcar = rol => RRHH_MARCA.includes(rol);
export const puedeVer = rol => RRHH_VE.includes(rol);
export const puedeContar = rol => RRHH_CONTEO.includes(rol);
export const MSG_SIN_MARCAR = 'Solo Gerencia y Recursos humanos marcan entradas y salidas.';
export const MSG_SIN_VER = 'Solo Gerencia y Recursos humanos ven quién está en planta.';
export const MSG_SIN_CONTEO = 'Tu puesto no puede ver cuántas personas hay en planta.';
export const TURNOS = ['Mañana', 'Tarde'];
export const turnoValido = t => TURNOS.includes(t);
/* «Personal activo hoy» NO cuenta choferes ni a quienes son del área Administración y ventas (la misma de Personal) */
export const esChofer = e => !!e && (e.es_chofer === true || e.es_chofer === 1 || /(chofer|conductor)/i.test(String(e.cargo || '')));
export const esAdmin = e => !!e && /^administraci[oó]n/i.test(String(e.area || '').trim());
export const cuentaEnPlanta = e => !!e && !esChofer(e) && !esAdmin(e);
export const activo = e => !!e && !e.arch && e.estado !== 'retirado';
/* Horas de entrada a salida (con decimales); sin salida: 0 */
export const horasDe = m => (m.salida_ts && m.entrada_ts ? Math.max(0, (m.salida_ts - m.entrada_ts) / 36e5) : 0);
