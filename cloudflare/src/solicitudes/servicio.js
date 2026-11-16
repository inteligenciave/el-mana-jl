/* Solicitudes de autorización · casos de uso. No conoce HTTP. Cualquier puesto válido pide y ve las suyas;
   solo el Gerente ve todas y responde. Aprobar solo marca la solicitud: el cambio lo hace el Gerente en su pantalla. */
import * as D from './dominio.js';
import * as R from './repo.js';
import {ROL_TXT, nomRol} from '../ventas/permisos.js';

export const err = (status, message, extra = {}) => Object.assign(new Error(message), {status, message, extra});
const fila = x => ({id: x.id, rol: x.rol, rol_txt: nomRol(x.rol), pantalla: x.pantalla, asunto: x.asunto, motivo: x.motivo, estado: x.estado, estado_txt: D.ESTADOS[x.estado] || x.estado, respuesta: x.respuesta, creado_ts: x.creado_ts, resuelto_ts: x.resuelto_ts});
export async function crear(ctx, b) {
  const v = D.validarSolicitud(b); if (v.error) throw err(400, v.error);
  const pend = (await R.propias(ctx.db, ctx.rol)).filter(x => x.estado === 'PENDIENTE').length;
  if (pend >= 20) throw err(409, 'Ya tienes muchas solicitudes pendientes. Espera la respuesta del Gerente.');
  const r = await R.crear(ctx.db, ctx.rol, v.s, Date.now());
  return {ok: true, id: r.meta && r.meta.last_row_id};
}
export async function propias(ctx) { return {solicitudes: (await R.propias(ctx.db, ctx.rol)).map(fila), asuntos: D.ASUNTOS}; }
export async function todas(ctx) {
  if (!D.puedeResolver(ctx.rol)) throw err(403, D.MSG_SIN_PERMISO);
  return {solicitudes: (await R.todas(ctx.db)).map(fila), pendientes: await R.pendientes(ctx.db)};
}
export async function contar(ctx) {
  if (!D.puedeResolver(ctx.rol)) throw err(403, D.MSG_SIN_PERMISO);
  return {pendientes: await R.pendientes(ctx.db)};
}
export async function resolver(ctx, id, b) {
  if (!D.puedeResolver(ctx.rol)) throw err(403, D.MSG_SIN_PERMISO);
  const x = await R.get(ctx.db, id); if (!x) throw err(404, 'No se encontró esa solicitud.');
  if (x.estado !== 'PENDIENTE') throw err(409, 'Esa solicitud ya fue respondida.');
  const v = D.validarRespuesta(b); if (v.error) throw err(400, v.error);
  await R.resolver(ctx.db, id, v.estado, v.respuesta, Date.now(), ctx.rol);
  return {ok: true, estado: v.estado};
}
