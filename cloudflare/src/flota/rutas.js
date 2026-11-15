/* Flota · rutas HTTP (/api/f/*), rol en x-rol.
   GET /vehiculos?todos=1   activos (Dueño y Administración con ?todos=1 ven también taller y fuera de servicio)
   GET /choferes            personas de nómina que manejan
   POST /vehiculos · PUT /vehiculos/:id · POST /vehiculos/:id/estado {estado}   (solo Dueño y Administración) */
import * as S from './servicio.js';
import {ROL_TXT} from '../ventas/permisos.js';

const json = (o, status = 200) => new Response(JSON.stringify(o), {status, headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff'}});
async function cuerpo(req) {
  const t = await req.text(); if (t.length > 20 * 1024) throw S.err(413, 'La petición es demasiado grande.');
  try { const b = JSON.parse(t || '{}'); if (!b || typeof b !== 'object' || Array.isArray(b)) throw 0; return b; } catch (e) { throw S.err(400, 'El cuerpo no es JSON válido.'); }
}
export async function rutasFlota(req, env, url) {
  const db = env.DB, p = url.pathname.replace(/^\/api\/f/, '') || '/', m = req.method;
  const rol = (req.headers.get('x-rol') || '').trim();
  if (!ROL_TXT[rol]) return json({error: 'Falta indicar tu rol.'}, 401);
  const ctx = {db, rol};
  try {
    let r;
    if (m === 'GET' && p === '/vehiculos') return json(await S.listar(ctx, url.searchParams.get('todos') === '1'));
    if (m === 'GET' && p === '/choferes') return json({choferes: await S.choferes(db)});
    if (m === 'POST' || m === 'PUT') {
      const b = await cuerpo(req);
      if (p === '/vehiculos' && m === 'POST') return json(await S.crear(ctx, b), 201);
      if ((r = p.match(/^\/vehiculos\/(\d{1,12})$/)) && m === 'PUT') return json(await S.editar(ctx, +r[1], b));
      if ((r = p.match(/^\/vehiculos\/(\d{1,12})\/estado$/)) && m === 'POST') return json(await S.cambiarEstado(ctx, +r[1], String(b.estado || '').toUpperCase()));
    }
    return json({error: 'Ruta no encontrada.'}, 404);
  } catch (e) {
    if (e && e.status) return json({error: e.message, ...(e.extra || {})}, e.status);
    console.error((e && e.stack) || e);
    return json({error: 'Error interno.'}, 500);
  }
}
