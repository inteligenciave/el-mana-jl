/* Marcas de entrada y salida · rutas HTTP (/api/h/*), rol en x-rol.
   GET /hoy                     quién está en planta hoy por turno + lista de personas para marcar (Gerencia y RRHH)
   GET /conteo                  solo el total y por turno (Gerencia, RRHH y Administración)
   POST /entrada {empleado_id} · POST /salida {empleado_id}   (Gerencia y RRHH)
   GET /nomina?periodo=semana|quincena|mes&ref=AAAA-MM-DD   montos por persona del período · GET /pagos/:id recibo · POST /pagos registrar el pago (Gerencia y RRHH)
   GET /horas?desde=&hasta=     horas marcadas por persona y día, para la nómina (Gerencia y RRHH)
   GET /turno?fecha=&turno=     quién estuvo y qué se hizo en el turno (Gerencia, Producción, Recursos humanos y Administración; sin dinero de personas para Producción y Administración)
   GET /parametros · PUT /parametros   horarios, jornada, recargo, bonos: ven Gerencia, Administración y RRHH; solo Gerencia cambia
   POST /bonos {fecha, turno, modo: turno|persona, montos?} aplicar el bono (Gerencia y Administración) · POST /bonos/deshacer (Gerencia)
   GET /asistencia?q=AAAA-MM-1|2  asistencia de la quincena llenada con las marcas (Gerencia y RRHH) */
import * as S from './servicio.js';
import * as P from './pagos.js';
import * as TS from './turnos-servicio.js';
import {ROL_TXT} from '../ventas/permisos.js';

const json = (o, status = 200) => new Response(JSON.stringify(o), {status, headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff'}});
async function cuerpo(req) {
  const t = await req.text(); if (t.length > 4 * 1024) throw S.err(413, 'La petición es demasiado grande.');
  try { const b = JSON.parse(t || '{}'); if (!b || typeof b !== 'object' || Array.isArray(b)) throw 0; return b; } catch (e) { throw S.err(400, 'El cuerpo no es JSON válido.'); }
}
export async function rutasRrhh(req, env, url) {
  const db = env.DB, p = url.pathname.replace(/^\/api\/h/, '') || '/', m = req.method;
  const rol = (req.headers.get('x-rol') || '').trim();
  if (!ROL_TXT[rol]) return json({error: 'Falta indicar tu rol.'}, 401);
  const ctx = {db, rol};
  try {
    if (m === 'GET' && p === '/hoy') return json(await S.hoy(ctx));
    if (m === 'GET' && p === '/conteo') return json(await S.conteo(ctx));
    if (m === 'GET' && p === '/jornada') return json(await S.jornada(ctx));
    if (m === 'POST' && p === '/jornada/abrir') return json(await S.abrirJornada(ctx, await cuerpo(req)), 201);
    if (m === 'POST' && p === '/jornada/cerrar') return json(await S.cerrarJornada(ctx, await cuerpo(req)));
    if (m === 'GET' && p === '/horas') return json(await S.horasPeriodo(ctx, url.searchParams.get('desde'), url.searchParams.get('hasta')));
    let r;
    if (m === 'GET' && p === '/turno') return json(await TS.turno(ctx, url.searchParams.get('fecha') || null, url.searchParams.get('turno') || null));
    if (m === 'GET' && p === '/parametros') return json(await TS.parametros(ctx));
    if (m === 'PUT' && p === '/parametros') return json(await TS.guardarParametros(ctx, await cuerpo(req)));
    if (m === 'POST' && p === '/bonos') return json(await TS.aplicarBono(ctx, await cuerpo(req)), 201);
    if (m === 'POST' && p === '/bonos/deshacer') return json(await TS.anularBono(ctx, await cuerpo(req)));
    if (m === 'GET' && p === '/asistencia') return json(await TS.asistencia(ctx, url.searchParams.get('q') || null));
    if (m === 'GET' && p === '/resumen') return json(await P.resumen(ctx, url.searchParams.get('periodo') || 'quincena', url.searchParams.get('ref') || null));
    if (m === 'GET' && p === '/nomina') return json(await P.nomina(ctx, url.searchParams.get('periodo') || 'quincena', url.searchParams.get('ref') || null));
    if (m === 'GET' && (r = p.match(/^\/pagos\/(\d{1,12})$/))) return json(await P.reciboDe(ctx, +r[1]));
    if (m === 'POST' && p === '/pagos') return json(await P.pagar(ctx, await cuerpo(req)), 201);
    if (m === 'POST' && (p === '/entrada' || p === '/salida')) { const b = await cuerpo(req); return json(await (p === '/entrada' ? S.entrada : S.salida)(ctx, b), p === '/entrada' ? 201 : 200); }
    return json({error: 'Ruta no encontrada.'}, 404);
  } catch (e) {
    if (e && e.status) return json({error: e.message, ...(e.extra || {})}, e.status);
    console.error((e && e.stack) || e);
    return json({error: 'Error interno.'}, 500);
  }
}
