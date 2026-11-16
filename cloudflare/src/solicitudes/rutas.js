/* Solicitudes de autorización · rutas HTTP (/api/s/*), rol en x-rol.
   POST /            {pantalla?, asunto, motivo}   pedir autorización (cualquier puesto)
   GET  /propias     las solicitudes del puesto
   GET  /todas       todas (solo Gerente) · GET /conteo   pendientes (solo Gerente)
   POST /:id/resolver {accion: APROBAR|RECHAZAR, respuesta}   (solo Gerente) */
import * as S from './servicio.js';
import {ROL_TXT} from '../ventas/permisos.js';

const json = (o, status = 200) => new Response(JSON.stringify(o), {status, headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff'}});
async function cuerpo(req) {
  const t = await req.text(); if (t.length > 10 * 1024) throw S.err(413, 'La petición es demasiado grande.');
  try { const b = JSON.parse(t || '{}'); if (!b || typeof b !== 'object' || Array.isArray(b)) throw 0; return b; } catch (e) { throw S.err(400, 'El cuerpo no es JSON válido.'); }
}
export async function rutasSolicitudes(req, env, url) {
  const db = env.DB, p = url.pathname.replace(/^\/api\/s/, '') || '/', m = req.method;
  const rol = (req.headers.get('x-rol') || '').trim();
  if (!ROL_TXT[rol]) return json({error: 'Falta indicar tu rol.'}, 401);
  const ctx = {db, rol};
  try {
    let r;
    if (m === 'GET' && p === '/propias') return json(await S.propias(ctx));
    if (m === 'GET' && p === '/todas') return json(await S.todas(ctx));
    if (m === 'GET' && p === '/conteo') return json(await S.contar(ctx));
    if (m === 'POST') {
      if (p === '/' || p === '') return json(await S.crear(ctx, await cuerpo(req)), 201);
      if ((r = p.match(/^\/(\d{1,12})\/resolver$/))) return json(await S.resolver(ctx, +r[1], await cuerpo(req)));
    }
    return json({error: 'Ruta no encontrada.'}, 404);
  } catch (e) {
    if (e && e.status) return json({error: e.message, ...(e.extra || {})}, e.status);
    console.error((e && e.stack) || e);
    return json({error: 'Error interno.'}, 500);
  }
}
