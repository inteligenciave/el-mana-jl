/* Entregas · rutas HTTP.
   · /api/v/entregas/*  → el EQUIPO, con su rol en x-rol (igual que Ventas).
   · /api/c/entregas/*  → el CLIENTE, con su código personal en x-token (misma autenticación y límite de intentos que el portal). Nunca recibe un id de cliente. */
import * as S from './servicio.js';
import * as P from '../precios/servicio.js';
import {autenticar} from '../cliente/servicio.js';
import {ROL_TXT} from '../ventas/permisos.js';

const json = (o, status = 200, extra = {}) => new Response(JSON.stringify(o), {status, headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', ...extra}});
const MAX = 900 * 1024;
async function cuerpo(req, max = MAX) {
  const t = await req.text(); if (t.length > max) throw S.err(413, 'La petición es demasiado grande.');
  try { const b = JSON.parse(t || '{}'); if (!b || typeof b !== 'object' || Array.isArray(b)) throw 0; return b; } catch (e) { throw S.err(400, 'El cuerpo no es JSON válido.'); }
}
const entero = v => (v != null && /^\d{1,12}$/.test(String(v))) ? +v : null;
function falla(e, url) {
  if (e && e.status) return json({error: e.message, ...(e.extra || {})}, e.status, e.extra && e.extra.retry_after ? {'retry-after': String(e.extra.retry_after)} : {});
  console.error((e && e.stack) || e);
  return json({error: 'Error interno.', ...(/^(localhost|127\.0\.0\.1)$/.test(url.hostname) ? {detalle: String((e && e.message) || e)} : {})}, 500);
}

export async function rutasEntregas(req, env, url) {
  const db = env.DB, p = url.pathname.replace(/^\/api\/v\/entregas/, '') || '/', m = req.method, q = url.searchParams;
  const rol = (req.headers.get('x-rol') || '').trim();
  if (!ROL_TXT[rol]) return json({error: 'Falta indicar tu rol.'}, 401);
  const ctx = {db, rol};
  try {
    let r;
    if (m === 'GET') {
      if (p === '/') return json(await S.listarEntregas(ctx, {estado: q.get('estado') || undefined, q: q.get('q') || ''}));
      if (p === '/ajustes') return json(await S.verAjustes(db));
      if (p === '/sin-verificar') return json(await S.sinVerificar(ctx));
      if (p === '/minis') return json(await S.minis(ctx, (q.get('ids') || '').split(',').map(x => entero(x)).filter(x => x != null)));
      if (p === '/plazos') return json(await S.plazos(ctx));
      if (p === '/disputas') return json(await S.listarDisputas(ctx, q.get('estado') || undefined));
      if ((r = p.match(/^\/documento\/(\d{1,12})\/liquidacion$/))) return json(await S.previsualizarLiquidacion(ctx, +r[1], q.get('fecha') || undefined));
      if ((r = p.match(/^\/(\d{1,12})\/foto$/))) return json(await S.fotoCompleta(ctx, +r[1]));
    } else {
      const b = await cuerpo(req);
      if (p === '/' && m === 'POST') return json(await S.subirEntrega(ctx, b), 201);
      if (p === '/ajustes' && m === 'PUT') return json(await P.cambiarAjustesCredito(ctx, b));   // Dueño: rige ya · Administración: queda pendiente · otros: 403
      if ((r = p.match(/^\/(\d{1,12})\/(confirmar|rechazar)$/)) && m === 'POST') return json(await S.resolverEntrega(ctx, +r[1], r[2], b.motivo));
      if ((r = p.match(/^\/disputas\/(\d{1,12})\/resolver$/)) && m === 'POST') return json(await S.resolverDisputa(ctx, +r[1], b));
    }
    return json({error: 'Ruta no encontrada.'}, 404);
  } catch (e) { return falla(e, url); }
}

export async function rutasEntregasCliente(req, env, url) {
  const db = env.DB, p = url.pathname.replace(/^\/api\/c\/entregas/, '') || '/', m = req.method, ip = req.headers.get('cf-connecting-ip') || 'local';
  try {
    const ctx = await autenticar(db, req.headers.get('x-token'), ip);
    if (m === 'GET' && p === '/estado') return json(await S.estadoPortal(ctx));
    if (m === 'POST' && p === '/no-recibi') { const b = await cuerpo(req, 20 * 1024); return json(await S.noRecibi(ctx, b.id_documento, b.nota), 201); }
    return json({error: 'Ruta no encontrada.'}, 404);
  } catch (e) { return falla(e, url); }
}
