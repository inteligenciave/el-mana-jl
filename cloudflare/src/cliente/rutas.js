/* Rutas HTTP del portal del cliente.
   · /api/c/portal/*  → el CLIENTE, con su código personal en la cabecera x-token. Nunca recibe ni acepta un id de cliente.
   · /api/v/portal/*  → el EQUIPO, con su rol en x-rol (igual que el resto de Ventas). */
import * as S from './servicio.js';
import * as VR from '../ventas/repo.js';
import {ROL_TXT} from '../ventas/permisos.js';

const json = (o, status = 200, extra = {}) => new Response(JSON.stringify(o), {status, headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', ...extra}});
const MAX = 100 * 1024, MAX_IMG = 700 * 1024;
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

export async function rutasPortal(req, env, url) {
  const db = env.DB, p = url.pathname.replace(/^\/api\/c\/portal/, '') || '/', m = req.method;
  const ip = req.headers.get('cf-connecting-ip') || 'local';
  try {
    const ctx = await S.autenticar(db, req.headers.get('x-token'), ip);
    let r;
    if (m === 'GET') {
      if (p === '/yo') return json(await S.perfil(ctx));
      if (p === '/catalogo') return json(await S.catalogo(ctx));
      if (p === '/bancos') return json(await S.bancosParaCliente(ctx));
      if (p === '/pedidos') return json(await S.misPedidos(ctx));
      if (p === '/cuenta') return json(await S.cuenta(ctx));
      if ((r = p.match(/^\/documentos\/(\d{1,12})$/))) return json(await S.detalleDocumento(ctx, +r[1]));
      if ((r = p.match(/^\/documentos\/(\d{1,12})\/pdf$/))) return json(await S.pdfDocumento(ctx, +r[1]));
      if ((r = p.match(/^\/pedidos-venta\/(\d{1,12})\/pdf$/))) return json(await S.pdfPedidoVenta(ctx, +r[1]));
    } else if (m === 'POST') {
      const b = await cuerpo(req, p === '/pagos' ? MAX_IMG : MAX);
      if (p === '/pedidos') return json(await S.crearPedido(ctx, b), 201);
      if ((r = p.match(/^\/pedidos\/(\d{1,12})\/cancelar$/))) return json(await S.cancelarPedido(ctx, +r[1]));
      if (p === '/pagos') return json(await S.reportarPago(ctx, b), 201);
    }
    return json({error: 'Ruta no encontrada.'}, 404);
  } catch (e) { return falla(e, url); }
}

export async function rutasEquipo(req, env, url) {
  const db = env.DB, p = url.pathname.replace(/^\/api\/v\/portal/, '') || '/', m = req.method, q = url.searchParams;
  const rol = (req.headers.get('x-rol') || '').trim();
  if (!ROL_TXT[rol]) return json({error: 'Falta indicar tu rol.'}, 401);
  try {
    const ctx = {db, rol, matriz: await VR.leerMatriz(db)};
    let r;
    if (m === 'GET') {
      if (p === '/resumen') return json(await S.resumenEquipo(ctx));
      if (p === '/clientes') return json(await S.listaClientes(ctx, {q: q.get('q') || '', limite: Math.min(+q.get('limite') || 100, 500)}));
      if ((r = p.match(/^\/clientes\/(\d+)$/))) return json(await S.fichaCliente(ctx, +r[1]));
      if (p === '/pedidos') return json(await S.pedidosEquipo(ctx, q.get('estado') || undefined));
      if (p === '/pagos') return json(await S.pagosEquipo(ctx, q.get('estado') || undefined));
      if ((r = p.match(/^\/pagos\/(\d+)\/comprobante$/))) return json(await S.comprobantePago(ctx, +r[1]));
    } else if (m === 'POST') {
      const b = await cuerpo(req);
      if ((r = p.match(/^\/clientes\/(\d+)\/enlace$/))) return json(await S.generarEnlace(ctx, +r[1], b.dias), 201);
      if ((r = p.match(/^\/clientes\/(\d+)\/enlace\/revocar$/))) return json(await S.revocarEnlace(ctx, +r[1]));
      if ((r = p.match(/^\/pedidos\/(\d+)\/aprobar$/))) return json(await S.aprobarPedido(ctx, +r[1], b));
      if ((r = p.match(/^\/pedidos\/(\d+)\/rechazar$/))) return json(await S.rechazarPedido(ctx, +r[1], b.motivo));
      if ((r = p.match(/^\/pagos\/(\d+)\/confirmar$/))) return json(await S.confirmarPago(ctx, +r[1], b));
      if ((r = p.match(/^\/pagos\/(\d+)\/rechazar$/))) return json(await S.rechazarPago(ctx, +r[1], b.motivo));
    }
    return json({error: 'Ruta no encontrada.'}, 404);
  } catch (e) { return falla(e, url); }
}
