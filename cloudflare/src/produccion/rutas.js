/* Rutas HTTP de Producción por zonas (/api/p/*). El permiso se comprueba aquí y otra vez en el servicio, con el rol de la cabecera x-rol. */
import * as S from './servicio.js';
import * as LS from './lineas-servicio.js';
import {puede, sinDinero, SIN_DINERO} from './permisos.js';
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
  const ctx = {db, rol}, quita = SIN_DINERO.includes(rol);
  const out = (o, st) => json(quita ? sinDinero(o) : o, st);   // Logística y Producción no reciben dinero
  try {
    let r;
    if (m === 'GET') {
      const ok = puede(rol, 'verSalidas') || p === '/inventario' || p === '/pedidos' || p.startsWith('/pedidos/')
        || (puede(rol, 'verTurno') && (p === '/turno' || p.startsWith('/turno/') || p === '/proceso' || p === '/ajustes' || p === '/motivos-merma'))
        || (puede(rol, 'verPanel') && (p === '/arranque' || p === '/panel' || p === '/resumen' || p === '/etapas' || p === '/merma-etapas' || /^\/turnos\/\d+\/merma$/.test(p)))
        || (puede(rol, 'verDif') && (p.startsWith('/diferencias') || p === '/kpi-merma'));
      if (!ok) throw S.err(403, 'Tu puesto no tiene acceso a esta información.');
      if (p === '/motivos-merma') return out(await S.listaMotivos(ctx, q.get('todos') === '1'));
      if (p === '/kpi-merma') return out(await S.kpiMerma(ctx, {desde: q.get('desde'), hasta: q.get('hasta')}));
      if (p === '/arranque') return out(await S.arranque(ctx));
      if (p === '/panel') return out(await S.panel(ctx, Object.fromEntries(q)));
      if (p === '/resumen') return out(await S.resumenPeriodo(ctx, Object.fromEntries(q)));
      if (p === '/etapas') return out(await S.listaEtapas(ctx));
      if ((r = p.match(/^\/turnos\/(\d+)\/merma$/))) return out(await S.mermaCerradaInfo(ctx, +r[1]));
      if (p === '/merma-etapas') return out(await S.mermaEtapasExportar(ctx, {desde: q.get('desde'), hasta: q.get('hasta')}));
      if (p === '/turno/resumen') return out(await S.resumenTurno(ctx));
      if (p === '/turno/merma') return out(await S.mermaConsolidadaInfo(ctx));
      if (p === '/turno/personal') return out(await S.personal(ctx));
      if (p === '/empaque/granel') return out(await S.empaqueLibreInfo(ctx));
      if (p === '/turno/por-resolver') return out(await S.porResolver(db));
      if (p === '/diferencias/contador') return out(await S.contadorDiferencias(ctx));
      if (p === '/diferencias') return out(await S.listaDiferencias(ctx, {estado: q.get('estado') || null, etapa: q.get('etapa') || null, desde: q.get('desde') ? +q.get('desde') : null, hasta: q.get('hasta') ? +q.get('hasta') : null}));
      if (p === '/turno/consumos') return out(await S.consumosDelTurno(ctx));
      if (p === '/turno/recepciones-libres') return out(await S.recepcionesLibres(db));
      if (p === '/tablero') return out(await S.tablero(db));
      if (p === '/lineas') return out(await LS.listaLineas(db));
      if ((r = p.match(/^\/lineas\/(sin|\d+)$/))) return out(await LS.detalleLinea(db, r[1]));
      if ((r = p.match(/^\/zonas\/([^/]+)$/))) return out(await S.zonaDetalle(db, decodeURIComponent(r[1])));
      if (p === '/salidas') return out(await S.listaSalidas(db, q.get('estado') || null));
      if ((r = p.match(/^\/salidas\/(\d+)$/))) return out(await S.detalleSalida(db, +r[1]));
      if (p === '/turno') return out(await S.turnoActual(db));
      if (p === '/proceso') return out(await S.proceso(db));
      if (p === '/ajustes') return out(await S.ajustes(db));
      if (p === '/inventario') return out(await S.inventario(db));
      if (p === '/pedidos') return out(await S.listaPedidos(db, {estado: q.get('estado') || null, zona: q.get('zona') || null, cliente: q.get('cliente') ? +q.get('cliente') : null}));
      if ((r = p.match(/^\/pedidos\/(\d+)$/))) return out(await S.detallePedido(db, +r[1]));
    } else if (m === 'POST') {
      const b = await cuerpo(req);
      if (p === '/ajustes') return out(await S.guardarAjustes(ctx, b));
      if (p === '/lineas') return out(await LS.crearLinea(ctx, b), 201);
      if ((r = p.match(/^\/lineas\/(\d+)$/))) return out(await LS.cambiarLinea(ctx, +r[1], b));
      if ((r = p.match(/^\/lineas\/(\d+)\/borrar$/))) return out(await LS.borrarLinea(ctx, +r[1]));
      if (p === '/zonas/pausar') return out(await S.pausar(ctx, b.zona, b.motivo));
      if (p === '/zonas/reanudar') return out(await S.reanudar(ctx, b.zona));
      if (p === '/salidas') return out(await S.armarSalida(ctx, b), 201);
      if ((r = p.match(/^\/salidas\/(\d+)\/anular$/))) return out(await S.anularSalida(ctx, +r[1]));
      if ((r = p.match(/^\/salidas\/(\d+)\/despachar$/))) return out(await S.despachar(ctx, +r[1], b));
      if ((r = p.match(/^\/pedidos\/(\d+)\/anular$/))) return out(await S.anularPedido(ctx, +r[1], b.motivo));
      if (p === '/turno/etapa' || p === '/turno/etapa/terminar') return out(await S.terminarEtapa(ctx, b));
      if (p === '/turno/merma') return out(await S.registrarMermaConsolidada(ctx, b), 201);
      if (p === '/turno/merma/corregir') return out(await S.corregirMermaAbierta(ctx, b));
      if ((r = p.match(/^\/turnos\/(\d+)\/merma\/corregir$/))) return out(await S.corregirMermaCerrada(ctx, +r[1], b));
      if (p === '/etapas') return out(await S.guardarEtapa(ctx, null, b), 201);
      if ((r = p.match(/^\/etapas\/([a-z0-9_]+)$/))) return out(await S.guardarEtapa(ctx, r[1], b));
      if (p === '/turno/iniciar') return out(await S.iniciarProduccion(ctx), 201);   // el turno ya existe solo; aquí se INICIA la producción (solo con todo en verde)
      if (p === '/turno/movimiento') return out(await S.registrarMovimiento(ctx, b), 201);
      if (p === '/motivos-merma') return out(await S.guardarMotivo(ctx, null, b), 201);
      if ((r = p.match(/^\/motivos-merma\/(\d+)$/))) return out(await S.guardarMotivo(ctx, +r[1], b));
      if (p === '/turno/resolver-diferencia') return out(await S.resolverDiferencia(ctx, b));
      if (p === '/turno/consumo') return out(await S.registrarConsumo(ctx, b), 201);
      if (p === '/turno/recepcion') return out(await S.tomarRecepcion(ctx, b), 201);
      if ((r = p.match(/^\/diferencias\/(\d+)\/(aprobar|rechazar)$/))) return out(await S.decidirDiferencia(ctx, +r[1], r[2], b.nota));
      if ((r = p.match(/^\/salidas\/(\d+)\/cargar$/))) return out(await S.cargarSalida(ctx, +r[1], b));
      if (p === '/turno/persona-etapa') return out(await S.marcarPersonaEtapa(ctx, b));
      if (p === '/empaque/anotar') return out(await S.anotarEmpaqueLibre(ctx, b));
      if (p === '/turno/empaque') return out(await S.registrarEmpaque(ctx, b), 201);
      if (p === '/turno/cerrar') return out(await S.cerrarTurno(ctx, b));
      if (p === '/inventario/conteo-inicial') return out(await S.conteoInicial(ctx, b));
    }
    return json({error: 'Ruta no encontrada.'}, 404);
  } catch (e) {
    if (e && e.status) return json({error: e.message, ...(e.extra || {})}, e.status);
    console.error((e && e.stack) || e);
    return json({error: 'Error interno.'}, 500);
  }
}
