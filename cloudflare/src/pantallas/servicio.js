/* Funciones extra por rol · reglas. Solo el Dueño asigna. Esto no concede permisos: solo decide qué aparece en «Más opciones». */
import * as R from './repo.js';
import {ROL_TXT} from '../ventas/permisos.js';
export const err = (status, message) => Object.assign(new Error(message), {status, message});
const CLAVE = /^[a-z0-9-]{2,40}$/;
const agrupar = filas => { const o = {}; filas.forEach(f => (o[f.rol] ||= []).push(f.clave)); return o; };

export async function leer(ctx) {
  return {extras: agrupar(ctx.rol === 'dueno' ? await R.listar(ctx.db) : await R.listarDe(ctx.db, ctx.rol))};
}
export async function asignar(ctx, rol, claves) {
  if (ctx.rol !== 'dueno') throw err(403, 'Solo el Dueño puede asignar funciones extra.');
  if (!ROL_TXT[rol] || rol === 'dueno') throw err(400, 'Ese puesto no admite funciones extra.');
  if (!Array.isArray(claves) || claves.length > 80 || claves.some(c => typeof c !== 'string' || !CLAVE.test(c))) throw err(400, 'La lista de funciones no es válida.');
  const nuevas = [...new Set(claves)].sort();
  const antes = (await R.listarDe(ctx.db, rol)).map(f => f.clave);
  await R.reemplazar(ctx.db, rol, nuevas, {rol: ctx.rol, rolTxt: ROL_TXT[ctx.rol], ent: 'FUNCIONES_EXTRA', ref: rol, nom: ROL_TXT[rol], accion: 'ASIGNAR_EXTRAS', detalle: {antes, despues: nuevas}});
  return {ok: true, rol, claves: nuevas};
}
