/* Compras · rutas HTTP (/api/v/compras/*), rol en x-rol.
   GET /pedidos?estado=PEDIDA   lista (Administración y Dueño: todo; Recepción y Jefe de producción: solo lo pendiente de recibir, sin precios)
   POST /pedidos                hacer una compra (solo Administración y Dueño) */
import * as S from './servicio.js';
import {ROL_TXT} from '../ventas/permisos.js';

const json = (o, status = 200) => new Response(JSON.stringify(o), {status, headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff'}});
async function cuerpo(req) {
  const t = await req.text(); if (t.length > 60 * 1024) throw S.err(413, 'La petición es demasiado grande.');
  try { const b = JSON.parse(t || '{}'); if (!b || typeof b !== 'object' || Array.isArray(b)) throw 0; return b; } catch (e) { throw S.err(400, 'El cuerpo no es JSON válido.'); }
}
export async function rutasCompras(req, env, url) {
  const db = env.DB, p = url.pathname.replace(/^\/api\/v\/compras/, '') || '/', m = req.method;
  const rol = (req.headers.get('x-rol') || '').trim();
  if (!ROL_TXT[rol]) return json({error: 'Falta indicar tu rol.'}, 401);
  const ctx = {db, rol};
  try {
    if (m === 'GET' && p === '/pedidos') return json(await S.listar(ctx, url.searchParams.get('estado')));
    if (m === 'POST' && p === '/pedidos') return json(await S.crear(ctx, await cuerpo(req)), 201);
    return json({error: 'Ruta no encontrada.'}, 404);
  } catch (e) {
    if (e && e.status) return json({error: e.message, ...(e.extra || {})}, e.status);
    console.error((e && e.stack) || e);
    return json({error: 'Error interno.'}, 500);
  }
}
