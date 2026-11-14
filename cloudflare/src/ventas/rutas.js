/* Rutas HTTP del módulo de Ventas (/api/v/*): lee la petición, comprueba el permiso por rol, llama al servicio y devuelve JSON.
   El rol llega en la cabecera x-rol: igual que en el resto del sistema, que todavía no tiene inicio de sesión en el servidor
   (limitación conocida: sirve para ordenar la operación y dejar auditoría, no para frenar a un atacante). */
import * as S from './servicio.js';
import * as R from './repo.js';
import * as P from '../precios/servicio.js';
import {puede, ROL_TXT} from './permisos.js';

const json = (o, status = 200) => new Response(JSON.stringify(o), {status, headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff'}});
const MAX = 900 * 1024;
async function cuerpo(req) {
  const t = await req.text(); if (t.length > MAX) throw S.err(413, 'La petición es demasiado grande.');
  try { const b = JSON.parse(t || '{}'); if (!b || typeof b !== 'object') throw 0; return b; } catch (e) { throw S.err(400, 'El cuerpo no es JSON válido.'); }
}
const entero = v => (v != null && /^\d+$/.test(String(v))) ? +v : null;

export async function rutasVentas(req, env, url) {
  const db = env.DB, p = url.pathname.replace(/^\/api\/v/, '') || '/', m = req.method, q = url.searchParams;
  const rol = (req.headers.get('x-rol') || '').trim();
  if (!ROL_TXT[rol]) return json({error: 'Falta indicar tu rol.'}, 401);
  const ctx = {db, rol, matriz: await R.leerMatriz(db)};
  const ver = a => { if (!puede(rol, a, ctx.matriz)) throw S.err(403, 'Tu rol no tiene acceso a esta información.'); };
  try {
    let r;
    if (m === 'GET') {
      if (p === '/arranque') { ver('ver'); return json(await S.arranque(db)); }
      if (p === '/clientes') { ver('verClientes'); return json((await R.buscarClientes(db, {q: q.get('q') || '', limite: Math.min(+q.get('limite') || 50, 500), vendedor: entero(q.get('vendedor'))})).map(c => ({...c, deuda: c.deuda_cents / 100, limite_credito_usd: c.limite_credito_cents == null ? null : c.limite_credito_cents / 100}))); }
      if ((r = p.match(/^\/clientes\/(\d+)\/precios$/))) { ver('ver'); return json(await S.preciosCliente(db, +r[1])); }
      if ((r = p.match(/^\/clientes\/(\d+)\/pendientes$/))) { ver('verDeuda'); return json(await S.previsualizar(db, {id_cliente: +r[1], fecha: q.get('fecha') || undefined, exonerar: q.get('exonerar') === '1'})); }
      if (p === '/documentos') { ver('verDeuda'); return json(await R.listarDocumentos(db, {cliente: entero(q.get('cliente')), estado: q.get('estado') || undefined, tipo: q.get('tipo') || undefined, desde: q.get('desde') || undefined, hasta: q.get('hasta') || undefined})); }
      if ((r = p.match(/^\/documentos\/(\d+)$/))) { ver('verDeuda'); return json(await S.detalleDocumento(db, +r[1])); }
      if (p === '/pagos') { ver('verPagos'); return json(await S.listaPagos(db, {desde: q.get('desde') || undefined, hasta: q.get('hasta') || undefined, vendedor: entero(q.get('vendedor')), q: q.get('q') || undefined, estado: q.get('estado') || undefined, cliente: entero(q.get('cliente'))})); }
      if ((r = p.match(/^\/pagos\/(\d+)$/))) { ver('verPagos'); return json(await S.detallePago(db, +r[1])); }
      if (p === '/deuda') { ver('verDeuda'); return json(await S.deuda(db, {vendedor: entero(q.get('vendedor')), q: q.get('q') || undefined})); }
      if (p === '/comisiones') { ver('verReportes'); return json((await R.listarComisiones(db, {desde: q.get('desde') || undefined, hasta: q.get('hasta') || undefined, vendedor: entero(q.get('vendedor'))})).map(c => ({...c, base_neta: c.base_neta_cents / 100, monto: c.monto_cents == null ? null : c.monto_cents / 100}))); }
      if (p === '/asientos') { ver('verReportes'); return json((await R.listarAsientos(db, {desde: q.get('desde') || undefined, hasta: q.get('hasta') || undefined})).map(a => ({...a, lineas: JSON.parse(a.lineas)}))); }
      if (p === '/auditoria') { ver('catalogo'); return json(await R.listarAuditoria(db, 200)); }
      if (p === '/movimientos') { ver('verReportes'); return json(await R.all(db, 'SELECT m.*, p.nombre, p.codigo_sku FROM movimientos_inventario m JOIN productos p ON p.id_producto = m.id_producto ORDER BY m.id DESC LIMIT 200')); }
    } else {
      const b = await cuerpo(req);
      if (p === '/ventas' && m === 'POST') return json(await S.vender(ctx, b), 201);
      if (p === '/previsualizar' && m === 'POST') { ver('verDeuda'); return json(await S.previsualizar(db, b)); }
      if (p === '/cobros' && m === 'POST') return json(await S.cobrar(ctx, b), 201);
      if ((r = p.match(/^\/pagos\/(\d+)\/anular$/)) && m === 'POST') return json(await S.anularPago(ctx, +r[1], b.motivo));
      if (p === '/clientes' && m === 'POST') return json(await S.guardarCliente(ctx, null, b), 201);
      if ((r = p.match(/^\/clientes\/(\d+)$/)) && m === 'PUT') return json(await S.guardarCliente(ctx, +r[1], b));
      if ((r = p.match(/^\/clientes\/(\d+)\/reglas$/)) && m === 'PUT') return json(await P.cambiarPreciosCliente(ctx, +r[1], b.reglas));   // Dueño: rige ya · Administración: queda pendiente · otros: 403
      if (p === '/productos' && m === 'POST') return json(await S.guardarProducto(ctx, null, b), 201);
      if ((r = p.match(/^\/productos\/(\d+)$/)) && m === 'PUT') return json(await S.guardarProducto(ctx, +r[1], b));
      if ((r = p.match(/^\/productos\/(\d+)\/peso$/)) && m === 'PUT') return json(await S.guardarPesoBulto(ctx, +r[1], b));
      if ((r = p.match(/^\/productos\/(\d+)\/entrada$/)) && m === 'POST') return json(await S.entradaStock(ctx, +r[1], b.cantidad, b.nota));
      if (p === '/vendedores' && m === 'POST') return json(await S.guardarVendedor(ctx, null, b), 201);
      if ((r = p.match(/^\/vendedores\/(\d+)$/)) && m === 'PUT') return json(await S.guardarVendedor(ctx, +r[1], b));
      if (p === '/config' && m === 'PUT') return json(await S.guardarConfig(ctx, b));
      if (p === '/pin' && m === 'PUT') return json(await S.fijarPin(ctx, b.pin));
      if (p === '/importar' && m === 'POST') return json(await S.importarLote(ctx, b));
      if (p === '/ejemplo' && m === 'POST') return json(await S.cargarEjemplo(ctx), 201);
      if (p === '/ejemplo/borrar' && m === 'POST') return json(await S.borrarEjemplo(ctx));
    }
    return json({error: 'Ruta no encontrada.'}, 404);
  } catch (e) {
    if (e && e.status) return json({error: e.message, ...(e.extra || {})}, e.status);
    console.error((e && e.stack) || e);
    return json({error: 'Error interno.', ...(/^(localhost|127\.0\.0\.1)$/.test(url.hostname) ? {detalle: String((e && e.message) || e)} : {})}, 500);
  }
}
