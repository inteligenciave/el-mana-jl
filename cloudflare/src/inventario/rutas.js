/* Inventario general · rutas HTTP (/api/v/inventario/*), rol en x-rol.
   GET /                       saldo por artículo, últimos movimientos y conteo inicial (Gerencia, Administración y Producción)
   POST /conteo-inicial {conteos:[{articulo, cantidad}]}   una sola vez (Gerencia y Administración)
   POST /consumo {articulo, cantidad, nota?} · POST /merma {articulo, cantidad, nota}   (Producción y Gerente)
   POST /repartir-bolsas {reparto:[{articulo:'bolsa-<id>', cantidad}], nota}   mueve bolsas sin presentación a las bolsas de cada presentación (Gerencia y Administración)
   PUT /articulos/:codigo {minimo}   mínimo de aviso (Gerencia y Administración) */
import * as S from './servicio.js';
import {ROL_TXT} from '../ventas/permisos.js';

const json = (o, status = 200) => new Response(JSON.stringify(o), {status, headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff'}});
async function cuerpo(req) {
  const t = await req.text(); if (t.length > 60 * 1024) throw S.err(413, 'La petición es demasiado grande.');
  try { const b = JSON.parse(t || '{}'); if (!b || typeof b !== 'object' || Array.isArray(b)) throw 0; return b; } catch (e) { throw S.err(400, 'El cuerpo no es JSON válido.'); }
}
export async function rutasInventario(req, env, url) {
  const p = url.pathname.replace(/^\/api\/v\/inventario/, '') || '/', m = req.method, rol = (req.headers.get('x-rol') || '').trim();
  if (!ROL_TXT[rol]) return json({error: 'Falta indicar tu rol.'}, 401);
  const ctx = {db: env.DB, rol};
  try {
    let r;
    if (m === 'GET' && p === '/') return json(await S.ver(ctx));
    if (m === 'POST' && p === '/conteo-inicial') return json(await S.conteoInicial(ctx, await cuerpo(req)), 201);
    if (m === 'POST' && p === '/consumo') return json(await S.registrarConsumo(ctx, await cuerpo(req)), 201);
    if (m === 'POST' && p === '/merma') return json(await S.registrarMerma(ctx, await cuerpo(req)), 201);
    if (m === 'POST' && p === '/repartir-bolsas') return json(await S.repartirBolsas(ctx, await cuerpo(req)), 201);
    if (m === 'PUT' && p === '/kg-por-bolson') return json(await S.fijarKgPorBolson(ctx, await cuerpo(req)));
    if (m === 'PUT' && (r = p.match(/^\/articulos\/([^/]+)$/))) return json(await S.fijarMinimo(ctx, decodeURIComponent(r[1]), await cuerpo(req)));
    return json({error: 'Ruta no encontrada.'}, 404);
  } catch (e) {
    if (e && e.status) return json({error: e.message, ...(e.extra || {})}, e.status);
    console.error((e && e.stack) || e);
    return json({error: 'Error interno.'}, 500);
  }
}
