/* Bancos · casos de uso. No conoce HTTP. Cualquier rol con sesión ve la lista de bancos activos (para elegir en un cobro);
   solo el Dueño y Administración ven los datos de cuenta y los desactivados, y solo ellos agregan, editan o desactivan. */
import * as B from './dominio.js';
import * as R from './repo.js';
import {ROL_TXT} from '../ventas/permisos.js';

export const err = (status, message, extra = {}) => Object.assign(new Error(message), {status, message, extra});
const audit = (ctx, ref, nom, accion, detalle) => R.stAuditoria(ctx.db, {rol: ctx.rol, rolTxt: ROL_TXT[ctx.rol] || ctx.rol, ent: 'banco', ref, nom, accion, detalle});
const exigir = ctx => { if (!B.puedeGestionar(ctx.rol)) throw err(403, B.MSG_SIN_PERMISO); };
const completo = b => ({id: b.id, nombre: b.nombre, moneda: b.moneda, moneda_txt: B.MONEDAS[b.moneda], cuenta_numero: b.cuenta_numero, cuenta_titular: b.cuenta_titular, activo: !!b.activo});
const basico = b => ({id: b.id, nombre: b.nombre, moneda: b.moneda, moneda_txt: B.MONEDAS[b.moneda]});

export async function listar(ctx, todos) {
  if (B.puedeGestionar(ctx.rol)) return {bancos: (await R.listar(ctx.db, !!todos)).map(completo), mensaje_vacio: B.MSG_LISTA_VACIA};
  return {bancos: (await R.listar(ctx.db, false)).map(basico), mensaje_vacio: B.MSG_LISTA_VACIA};
}
/* Lo que ve el cliente en el portal: nombre y datos de cuenta para pagar (solo bancos activos) */
export async function listaParaCliente(db) {
  return {bancos: (await R.listar(db, false)).map(b => ({id: b.id, nombre: b.nombre, moneda: b.moneda, moneda_txt: B.MONEDAS[b.moneda], cuenta_numero: b.cuenta_numero, cuenta_titular: b.cuenta_titular})), mensaje_vacio: B.MSG_LISTA_VACIA};
}
async function sinRepetir(db, b, idPropio) {
  const otro = await R.porNombre(db, b.nombre, b.moneda);
  if (otro && otro.id !== idPropio) throw err(409, 'Ya existe un banco con ese nombre y esa moneda.', {codigo: 'BANCO_REPETIDO'});
}
export async function crear(ctx, datos) {
  exigir(ctx);
  const v = B.validarBanco(datos); if (v.error) throw err(400, v.error);
  await sinRepetir(ctx.db, v.banco);
  try { await R.lote(ctx.db, [R.stInsertar(ctx.db, v.banco), ...audit(ctx, v.banco.nombre, v.banco.nombre, 'agregó un banco', {moneda: v.banco.moneda, cuenta_titular: v.banco.cuenta_titular})]); }
  catch (e) { if (/UNIQUE/i.test(String((e && e.message) || e))) throw err(409, 'Ya existe un banco con ese nombre y esa moneda.', {codigo: 'BANCO_REPETIDO'}); throw e; }
  return completo(await R.porNombre(ctx.db, v.banco.nombre, v.banco.moneda));
}
export async function editar(ctx, id, datos) {
  exigir(ctx);
  const prev = await R.get(ctx.db, id); if (!prev) throw err(404, 'Banco no encontrado.');
  const v = B.validarBanco(datos); if (v.error) throw err(400, v.error);
  await sinRepetir(ctx.db, v.banco, id);
  await R.lote(ctx.db, [R.stActualizar(ctx.db, id, v.banco), ...audit(ctx, id, v.banco.nombre, 'editó un banco', {antes: {nombre: prev.nombre, moneda: prev.moneda, cuenta_numero: prev.cuenta_numero, cuenta_titular: prev.cuenta_titular}, despues: v.banco})]);
  return completo(await R.get(ctx.db, id));
}
export async function cambiarActivo(ctx, id, activo) {
  exigir(ctx);
  const prev = await R.get(ctx.db, id); if (!prev) throw err(404, 'Banco no encontrado.');
  await R.lote(ctx.db, [R.stActivo(ctx.db, id, activo), ...audit(ctx, id, prev.nombre, activo ? 'activó un banco' : 'desactivó un banco', {})]);
  return completo(await R.get(ctx.db, id));
}
/* Para cobros y pagos reportados: del id elegido saca el banco. Sin id devuelve null (se sigue aceptando el texto). */
export async function elegido(db, idBanco) {
  if (idBanco == null || idBanco === '') return null;
  const id = Number(idBanco); if (!Number.isInteger(id) || id < 1) throw err(400, 'Elige un banco de la lista.');
  const b = await R.get(db, id); if (!b) throw err(400, 'Ese banco no existe en la lista.');
  if (!b.activo) throw err(400, 'Ese banco está desactivado. Elige otro de la lista.');
  return b;
}
