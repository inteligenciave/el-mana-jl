/* Rutas HTTP de Producción por zonas (/api/p/*). El permiso se comprueba aquí y otra vez en el servicio, con el rol de la cabecera x-rol. */
import * as S from './servicio.js';
import {puede} from './permisos.js';
import {ROL_TXT} from '../ventas/permisos.js';

const json = (o, status = 200) => new Response(JSON.stringify(o), {status, headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff'}});
async function cuerpo(req) {
  const t = await req.text(); if (t.length > 200 * 1024) throw S.err(413, 'La petición es demasiado grande.');
  try { const b = JSON.parse(t || '{}'); if (!b || typeof b !== 'object') throw 0; return b; } catch (e) { throw S.err(400, 'El cuerpo no es JSON válido.'); }
}
export async function rutasProduccion(req, env, url) {
  const db = env.DB, p = url.pathname.replace(/^\/api\/p/, '') || '/', m = req.method, q = url.searchParams;
  const rol = (req.headers.get('x-rol') || '').trim();
  if (!ROL_TXT[rol]) return json({error: 'Falta indicar tu rol.'}, 401);
  const ctx = {db, rol};
  try {
    let r;
    if (m === 'GET') {
      if (!puede(rol, 'ver') && !(p === '/inventario' || p === '/pedidos' || p.startsWith('/pedidos/') || (puede(rol, 'verSalidas') && (p === '/salidas' || /^\/salidas\/\d+$/.test(p))) || (puede(rol, 'verDif') && (p.startsWith('/diferencias') || p === '/kpi-merma')) || (p === '/motivos-merma' && puede(rol, 'verSalidas')))) throw S.err(403, 'Tu puesto no tiene acceso a esta información.');
      if (p === '/motivos-merma') return json(await S.listaMotivos(ctx, q.get('todos') === '1'));
      if (p === '/kpi-merma') return json(await S.kpiMerma(ctx, {desde: q.get('desde'), hasta: q.get('hasta')}));
      if (p === '/turno/por-resolver') return json(await S.porResolver(db));
      if (p === '/diferencias/contador') return json(await S.contadorDiferencias(ctx));
      if (p === '/diferencias') return json(await S.listaDiferencias(ctx, {estado: q.get('estado') || null, etapa: q.get('etapa') || null, desde: q.get('desde') ? +q.get('desde') : null, hasta: q.get('hasta') ? +q.get('hasta') : null}));
      if (p === '/turno/recepciones-libres') return json(await S.recepcionesLibres(db));
      if (p === '/tablero') return json(await S.tablero(db));
      if ((r = p.match(/^\/zonas\/([^/]+)$/))) return json(await S.zonaDetalle(db, decodeURIComponent(r[1])));
      if (p === '/salidas') return json(await S.listaSalidas(db, q.get('estado') || null));
      if ((r = p.match(/^\/salidas\/(\d+)$/))) return json(await S.detalleSalida(db, +r[1]));
      if (p === '/turno') return json(await S.turnoActual(db));
      if (p === '/proceso') return json(await S.proceso(db));
      if (p === '/ajustes') return json(await S.ajustes(db));
      if (p === '/inventario') return json(await S.inventario(db));
      if (p === '/pedidos') return json(await S.listaPedidos(db, {estado: q.get('estado') || null, zona: q.get('zona') || null, cliente: q.get('cliente') ? +q.get('cliente') : null}));
      if ((r = p.match(/^\/pedidos\/(\d+)$/))) return json(await S.detallePedido(db, +r[1]));
    } else if (m === 'POST') {
      const b = await cuerpo(req);
      if (p === '/ajustes') return json(await S.guardarAjustes(ctx, b));
      if (p === '/zonas/pausar') return json(await S.pausar(ctx, b.zona, b.motivo));
      if (p === '/zonas/reanudar') return json(await S.reanudar(ctx, b.zona));
      if (p === '/salidas') return json(await S.armarSalida(ctx, b), 201);
      if ((r = p.match(/^\/salidas\/(\d+)\/anular$/))) return json(await S.anularSalida(ctx, +r[1]));
      if ((r = p.match(/^\/salidas\/(\d+)\/despachar$/))) return json(await S.despachar(ctx, +r[1], b));
      if ((r = p.match(/^\/pedidos\/(\d+)\/anular$/))) return json(await S.anularPedido(ctx, +r[1], b.motivo));
      if (p === '/turno/abrir') return json(await S.abrirTurno(ctx, b), 201);
      if (p === '/turno/movimiento') return json(await S.registrarMovimiento(ctx, b), 201);
      if (p === '/motivos-merma') return json(await S.guardarMotivo(ctx, null, b), 201);
      if ((r = p.match(/^\/motivos-merma\/(\d+)$/))) return json(await S.guardarMotivo(ctx, +r[1], b));
      if (p === '/turno/resolver-diferencia') return json(await S.resolverDiferencia(ctx, b));
      if (p === '/turno/recepcion') return json(await S.tomarRecepcion(ctx, b), 201);
      if ((r = p.match(/^\/diferencias\/(\d+)\/(aprobar|rechazar)$/))) return json(await S.decidirDiferencia(ctx, +r[1], r[2], b.nota));
      if ((r = p.match(/^\/salidas\/(\d+)\/cargar$/))) return json(await S.cargarSalida(ctx, +r[1], b));
      if (p === '/turno/empaque') return json(await S.registrarEmpaque(ctx, b), 201);
      if (p === '/turno/cerrar') return json(await S.cerrarTurno(ctx, b));
      if (p === '/inventario/conteo-inicial') return json(await S.conteoInicial(ctx, b));
    }
    return json({error: 'Ruta no encontrada.'}, 404);
  } catch (e) {
    if (e && e.status) return json({error: e.message, ...(e.extra || {})}, e.status);
    console.error((e && e.stack) || e);
    return json({error: 'Error interno.'}, 500);
  }
}
