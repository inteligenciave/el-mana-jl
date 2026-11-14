/* Cambios de precio · rutas HTTP (/api/v/precios/*). El rol llega en x-rol, igual que en Ventas.
   GET  /cambios?estado=PENDIENTE|APROBADO|RECHAZADO   lista (Dueño y Administración)
   GET  /pendientes                                   cuántos hay por aprobar
   GET  /listas                                       tabla de precios por lista (Dueño y Administración)
   PUT  /lista               {id_producto,lista,modalidad,precio}  precio por bulto de una lista (A/B) y modalidad (contado/credito)
   PUT  /estado              {estado,lista|null}      Dueño: apunta un estado a una lista (o lo deja sin precios)
   POST /estado/propios      {estado,copiar_de?}      Dueño: crea una lista propia para el estado copiando otra
   PUT  /cliente/:id         {reglas:[…]}             precios especiales del cliente
   PUT  /credito             {dias_tramo1,…}          plazos y porcentajes de crédito
   POST /cambios/:id/aprobar | /rechazar {motivo?}    solo el Dueño */
import * as S from './servicio.js';
import {ROL_TXT} from '../ventas/permisos.js';

const json = (o, status = 200) => new Response(JSON.stringify(o), {status, headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff'}});
const MAX = 200 * 1024;
async function cuerpo(req) {
  const t = await req.text(); if (t.length > MAX) throw S.err(413, 'La petición es demasiado grande.');
  try { const b = JSON.parse(t || '{}'); if (!b || typeof b !== 'object' || Array.isArray(b)) throw 0; return b; } catch (e) { throw S.err(400, 'El cuerpo no es JSON válido.'); }
}

export async function rutasPrecios(req, env, url) {
  const db = env.DB, p = url.pathname.replace(/^\/api\/v\/precios/, '') || '/', m = req.method;
  const rol = (req.headers.get('x-rol') || '').trim();
  if (!ROL_TXT[rol]) return json({error: 'Falta indicar tu rol.'}, 401);
  const ctx = {db, rol};
  try {
    let r;
    if (m === 'GET') {
      if (p === '/cambios') return json(await S.listarCambios(ctx, url.searchParams.get('estado') || undefined));
      if (p === '/listas') return json(await S.listasPrecios(ctx));
      if (p === '/pendientes') return json(await S.cantidadPendientes(ctx));
    } else {
      const b = await cuerpo(req);
      if (p === '/lista' && m === 'PUT') return json(await S.cambiarPrecioLista(ctx, b));
      if (p === '/estado' && m === 'PUT') return json(await S.asignarListaEstado(ctx, b));
      if (p === '/estado/propios' && m === 'POST') return json(await S.darPreciosPropios(ctx, b));
      if ((r = p.match(/^\/cliente\/(\d{1,12})$/)) && m === 'PUT') return json(await S.cambiarPreciosCliente(ctx, +r[1], b.reglas));
      if (p === '/credito' && m === 'PUT') return json(await S.cambiarAjustesCredito(ctx, b));
      if ((r = p.match(/^\/cambios\/(\d{1,12})\/(aprobar|rechazar)$/)) && m === 'POST') return json(await S.resolver(ctx, +r[1], r[2], b.motivo));
    }
    return json({error: 'Ruta no encontrada.'}, 404);
  } catch (e) {
    if (e && e.status) return json({error: e.message, ...(e.extra || {})}, e.status);
    console.error((e && e.stack) || e);
    return json({error: 'Error interno.', ...(/^(localhost|127\.0\.0\.1)$/.test(url.hostname) ? {detalle: String((e && e.message) || e)} : {})}, 500);
  }
}
