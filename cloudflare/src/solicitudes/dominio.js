/* Solicitudes de autorización · reglas puras (sin base de datos ni HTTP). */
export const puedeResolver = rol => rol === 'dueno';
export const MSG_SIN_PERMISO = 'Solo el Gerente responde las solicitudes.';
export const ESTADOS = {PENDIENTE: 'Pendiente', APROBADA: 'Aprobada', RECHAZADA: 'Rechazada'};
/* Lista corta de qué se puede pedir cambiar (también se acepta un texto breve) */
export const ASUNTOS = ['Una meta o su ajuste', 'Una regla de pago de nómina', 'Un porcentaje o una tasa', 'Un permiso de mi puesto', 'Una política o ajuste del sistema', 'Otro cambio'];
const t = (v, n) => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim().slice(0, n);
/* Pedido como llega de la pantalla. Devuelve {s:{pantalla, asunto, motivo}} o {error} */
export function validarSolicitud(b) {
  const x = b || {}, asunto = t(x.asunto, 80), motivo = t(x.motivo, 500), pantalla = t(x.pantalla, 60) || null;
  if (!asunto) return {error: 'Elige o escribe qué quieres cambiar.'};
  if (String(x.asunto || '').trim().length > 80) return {error: 'Lo que quieres cambiar es muy largo: usa 80 letras o menos.'};
  if (!motivo) return {error: 'Escribe el motivo: es obligatorio.'};
  if (String(x.motivo || '').trim().length > 500) return {error: 'El motivo es muy largo: usa 500 letras o menos.'};
  return {s: {pantalla, asunto, motivo}};
}
/* Respuesta del Gerente: APROBAR o RECHAZAR con comentario (al rechazar, el comentario es obligatorio) */
export function validarRespuesta(b) {
  const x = b || {}, a = String(x.accion || '').toUpperCase(), c = t(x.respuesta, 300);
  if (a !== 'APROBAR' && a !== 'RECHAZAR') return {error: 'Elige aprobar o rechazar.'};
  if (String(x.respuesta || '').trim().length > 300) return {error: 'El comentario es muy largo: usa 300 letras o menos.'};
  if (a === 'RECHAZAR' && !c) return {error: 'Escribe por qué la rechazas.'};
  return {estado: a === 'APROBAR' ? 'APROBADA' : 'RECHAZADA', respuesta: c || null};
}
