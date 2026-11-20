/* Marcas de entrada y salida · rutas HTTP (/api/h/*), rol en x-rol.
   POST /entrada/grupo {turno}  marca la entrada de todo el turno (solo a quienes aún no tienen marca) · POST /entrada/quitar {empleado_id}  quita una entrada a mano sin salida
   GET /hoy                     quién está en planta hoy por turno + lista de personas para marcar (Gerencia y RRHH)
   GET /conteo                  solo el total y por turno (Gerencia, RRHH y Administración)
   POST /entrada {empleado_id} · POST /salida {empleado_id}   (Gerencia y RRHH)
   GET /nomina?periodo=semana|quincena|mes&ref=AAAA-MM-DD   montos por persona del período · GET /pagos/:id recibo · POST /pagos registrar el pago (Gerencia y RRHH)
   GET /horas?desde=&hasta=     horas marcadas por persona y día, para la nómina (Gerencia y RRHH)
   GET /turno?fecha=&turno=     quién estuvo y qué se hizo en el turno (Gerencia, Producción, Recursos humanos y Administración; sin dinero de personas para Producción y Administración)
   GET /parametros · PUT /parametros {horarios, desde?, ...}   ven Gerencia, Administración y Nómina. Los HORARIOS de Diurno y Nocturno los cambian Gerencia y Nómina (valen desde `desde`, por defecto hoy; nunca días ya pasados; Nómina no puede empezar en días ya pagados o con bono aplicado). Jornada, recargo, ley y bono: solo Gerencia.
   GET /avisos · POST /avisos/visto {id?}   avisos de cambios de horario hechos por Nómina (solo Gerencia)
   Bonos en dólares (ven Gerencia, Administración y Nómina; editan y deshacen Gerencia y Administración):
   GET /bonos  esquemas, bonos archivados y últimos aplicados · POST /bonos/esquemas {nombre, forma, fuente, quienes, area?, etapa?, params} crear (SOLO Gerencia; rige desde el siguiente turno) · PUT /bonos/esquemas/:id cambiar · POST /bonos/esquemas/:id/archivar {archivar}
   GET /bonos/seguimiento?fecha=&turno=  seguimiento en vivo del turno activo (o de otro) · POST /bonos/aplicar {fecha, turno, esquema_id?} (también se aplican solos al cerrar el turno de Producción) · POST /bonos/deshacer {id} queda en revisión
   GET /asistencia?q=AAAA-MM-1|2  asistencia de la quincena llenada con las marcas (Gerencia y RRHH)
   GET /grupos?semana=AAAA-MM-DD  Grupo 1 y Grupo 2: integrantes, turno de la semana e historial (ven Gerencia, Nómina, Administración y Producción)
   PUT /grupos/miembros {grupo_id, empleados:[id]} · POST /grupos/semana {semana, grupo_id, turno: Diurno|Nocturno, ambos?} · POST /grupos/excepcion {semana, empleado_id, grupo_id|null}  (solo Gerencia y Nómina; Nómina no puede tocar lo ya pagado o con bono aplicado)
   GET /areas/revision  quién falta por revisar tras separar las áreas (¿Ventas?, área sin definir) · POST /areas/revisar {empleado_id, accion: ventas|quedarse|asignar, puesto?, area?}  (Gerencia y RRHH)
   Importar del lector de huellas (solo Gerencia y Nómina):
   POST /lector/vista {texto}  vista previa (no guarda) · POST /lector/importar {texto}  guarda marcas crudas y la asistencia de los días claros
   POST /lector/marcas {marcas:[{codigo, momento:'AAAA-MM-DD HH:MM:SS'}]}  lo mismo con marcas en JSON (envío automático o puente local)
   GET /lector/pendientes · POST /lector/resolver {id, accion: confirmar|descartar, entrada?, salida?, turno?} · POST /lector/codigo {codigo, empleado_id} · GET|PUT /lector/ajustes */
import * as S from './servicio.js';
import * as P from './pagos.js';
import * as TS from './turnos-servicio.js';
import * as LE from './lector-servicio.js';
import * as GS from './grupos-servicio.js';
import * as BS from './bonos-servicio.js';
import * as AS from './areas-servicio.js';
import {ROL_TXT} from '../ventas/permisos.js';

const json = (o, status = 200) => new Response(JSON.stringify(o), {status, headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff'}});
async function cuerpo(req, max = 4 * 1024) {
  const t = await req.text(); if (t.length > max) throw S.err(413, 'La petición es demasiado grande.');
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
    if (m === 'GET' && p === '/grupos') return json(await GS.grupos(ctx, url.searchParams.get('semana') || null));
    if (m === 'PUT' && p === '/grupos/miembros') return json(await GS.guardarMiembros(ctx, await cuerpo(req)));
    if (m === 'POST' && p === '/grupos/semana') return json(await GS.asignarSemana(ctx, await cuerpo(req)), 201);
    if (m === 'POST' && p === '/grupos/excepcion') return json(await GS.excepcion(ctx, await cuerpo(req)));
    if (m === 'GET' && p === '/areas/revision') return json(await AS.revision(ctx));
    if (m === 'POST' && p === '/areas/revisar') return json(await AS.revisar(ctx, await cuerpo(req)));
    let r;
    if (p.startsWith('/lector/')) {
      const GRANDE = 4 * 1024 * 1024; /* un archivo del lector de un mes ronda los 300 KB; el .xls es más pesado que el .csv */
      if (m === 'POST' && p === '/lector/vista') return json(await LE.vista(ctx, await cuerpo(req, GRANDE)));
      if (m === 'POST' && p === '/lector/importar') return json(await LE.importar(ctx, await cuerpo(req, GRANDE)), 201);
      if (m === 'POST' && p === '/lector/marcas') return json(await LE.importar(ctx, await cuerpo(req, GRANDE), 'envio'), 201);
      if (m === 'GET' && p === '/lector/pendientes') return json(await LE.pendientes(ctx));
      if (m === 'POST' && p === '/lector/resolver') return json(await LE.resolver(ctx, await cuerpo(req)));
      if (m === 'POST' && p === '/lector/codigo') return json(await LE.asociarCodigo(ctx, await cuerpo(req)));
      if (m === 'GET' && p === '/lector/ajustes') return json(await LE.ajustes(ctx));
      if (m === 'PUT' && p === '/lector/ajustes') return json(await LE.guardarAjustes(ctx, await cuerpo(req)));
    }
    if (m === 'GET' && p === '/turno') return json(await TS.turno(ctx, url.searchParams.get('fecha') || null, url.searchParams.get('turno') || null));
    if (m === 'GET' && p === '/parametros') return json(await TS.parametros(ctx));
    if (m === 'PUT' && p === '/parametros') return json(await TS.guardarParametros(ctx, await cuerpo(req)));
    if (m === 'GET' && p === '/avisos') return json(await TS.avisos(ctx));
    if (m === 'POST' && p === '/avisos/visto') return json(await TS.avisoVisto(ctx, await cuerpo(req)));
    if (m === 'GET' && p === '/bonos') return json(await BS.listar(ctx));
    if (m === 'GET' && p === '/bonos/seguimiento') return json(await BS.seguimiento(ctx, url.searchParams.get('fecha') || null, url.searchParams.get('turno') || null));
    if (m === 'POST' && p === '/bonos/esquemas') return json(await BS.guardarEsquema(ctx, null, await cuerpo(req, 16 * 1024)), 201);
    if ((r = p.match(/^\/bonos\/esquemas\/(\d+)$/)) && m === 'PUT') return json(await BS.guardarEsquema(ctx, +r[1], await cuerpo(req, 16 * 1024)));
    if ((r = p.match(/^\/bonos\/esquemas\/(\d+)\/archivar$/)) && m === 'POST') return json(await BS.archivarEsquema(ctx, +r[1], (await cuerpo(req)).archivar !== false));
    if (m === 'POST' && p === '/bonos/aplicar') return json(await BS.aplicarManual(ctx, await cuerpo(req)), 201);
    if (m === 'POST' && p === '/bonos/deshacer') return json(await BS.deshacer(ctx, await cuerpo(req)));
    if (m === 'GET' && p === '/asistencia') return json(await TS.asistencia(ctx, url.searchParams.get('q') || null));
    if (m === 'GET' && p === '/resumen') return json(await P.resumen(ctx, url.searchParams.get('periodo') || 'quincena', url.searchParams.get('ref') || null));
    if (m === 'GET' && p === '/nomina') return json(await P.nomina(ctx, url.searchParams.get('periodo') || 'quincena', url.searchParams.get('ref') || null));
    if (m === 'GET' && (r = p.match(/^\/pagos\/(\d{1,12})$/))) return json(await P.reciboDe(ctx, +r[1]));
    if (m === 'POST' && p === '/pagos') return json(await P.pagar(ctx, await cuerpo(req)), 201);
    if (m === 'POST' && p === '/entrada/grupo') return json(await S.entradaGrupo(ctx, await cuerpo(req)), 201);
    if (m === 'POST' && p === '/entrada/quitar') return json(await S.quitarEntrada(ctx, await cuerpo(req)));
    if (m === 'POST' && (p === '/entrada' || p === '/salida')) { const b = await cuerpo(req); return json(await (p === '/entrada' ? S.entrada : S.salida)(ctx, b), p === '/entrada' ? 201 : 200); }
    return json({error: 'Ruta no encontrada.'}, 404);
  } catch (e) {
    if (e && e.status) return json({error: e.message, ...(e.extra || {})}, e.status);
    console.error((e && e.stack) || e);
    return json({error: 'Error interno.'}, 500);
  }
}
