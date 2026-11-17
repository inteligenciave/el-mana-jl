/* El Maná JL · API del Worker (Cloudflare Workers + D1)
   Sin secretos. Mismo origen que el frontend. Validación estricta, tamaño limitado y límite de peticiones por IP. */
import {rutasVentas} from './ventas/rutas.js';
import {rutasTasa} from './tasa/rutas.js';
import {rutasPortal, rutasEquipo} from './cliente/rutas.js';
import {rutasEntregas, rutasEntregasCliente} from './entregas/rutas.js';
import {rutasPrecios} from './precios/rutas.js';
import {rutasProduccion} from './produccion/rutas.js';
import {rutasBancos} from './bancos/rutas.js';
import {rutasCompras} from './compras/rutas.js';
import {rutasFlota} from './flota/rutas.js';
import {rutasRrhh} from './rrhh/rutas.js';
import * as Sentry from '@sentry/cloudflare';
import {rutasSolicitudes} from './solicitudes/rutas.js';
import {rutasPantallas} from './pantallas/rutas.js';
import * as Tasa from './tasa/servicio.js';
import {ROL_TXT, ROL_ALIAS} from './ventas/permisos.js';
import {rolDe, puedeLeer, puedeEscribir, filtrarDoc, cambiaCamposDueno} from './acceso.js';
const COLS = new Set(['ajustes', 'meta', 'proveedores', 'productos', 'partidas', 'recepciones', 'compras', 'cxp', 'pagos', 'movimientos', 'lotes', 'salsas_lotes',
  'empaques', 'reposiciones', 'bultos', 'despachos', 'flota', 'empleados', 'caja_gastos', 'caja_reposiciones', 'caja_arqueos', 'prestamos', 'gestion', 'mermas', 'asistencia', 'clientes', 'auditoria', 'solicitudes_compra']);
const ID_RE = /^[A-Za-z0-9_.~:@+-]{1,120}$/;
const MAX_BODY = 900 * 1024;      // bytes por petición
const MAX_DOC = 120 * 1024;       // bytes por documento
const MAX_OPS = 200;              // operaciones por lote
const LIMITS = {read: 300, write: 150};  // peticiones por minuto y por IP (por instancia del Worker)
const hits = new Map();

const json = (o, status = 200, extra = {}) => new Response(JSON.stringify(o), {status, headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra}});
const err = (status, message) => json({error: message}, status);
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

function limited(ip, kind, cost = 1) {
  const now = Date.now(), k = ip + '|' + kind;
  let h = hits.get(k); if (!h || now - h.t > 60000) { h = {t: now, n: 0}; hits.set(k, h); }
  h.n += cost;
  if (hits.size > 5000) for (const [kk, v] of hits) if (now - v.t > 60000) hits.delete(kk);
  return h.n > LIMITS[kind];
}
/* Límite por IP con el enlace nativo de Cloudflare (compartido entre instancias); si no existe, cuenta en memoria */
async function limitedBy(env, ip, kind) {
  const b = kind === 'write' ? env.RL_WRITE : env.RL_READ;
  if (b && b.limit) { try { const r = await b.limit({key: ip}); return !r.success; } catch (e) { /* cae al conteo en memoria */ } }
  return limited(ip, kind);
}
async function readJson(req) {
  const len = +req.headers.get('content-length') || 0;
  if (len > MAX_BODY) throw {status: 413, message: 'La petición es demasiado grande.'};
  const text = await req.text();
  if (text.length > MAX_BODY) throw {status: 413, message: 'La petición es demasiado grande.'};
  try { return JSON.parse(text); } catch (e) { throw {status: 400, message: 'El cuerpo no es JSON válido.'}; }
}
function checkDoc(c, id, d) {
  if (!COLS.has(c)) throw {status: 400, message: 'Colección desconocida: ' + String(c).slice(0, 40)};
  if (typeof id !== 'string' || !ID_RE.test(id)) throw {status: 400, message: 'Identificador no válido.'};
  if (d !== undefined) {
    if (!isObj(d)) throw {status: 400, message: 'El documento debe ser un objeto.'};
    const s = JSON.stringify(d); if (s.length > MAX_DOC) throw {status: 413, message: 'El documento es demasiado grande.'};
    return s;
  }
}
const curVer = async db => { const v = await db.prepare('SELECT v FROM ver WHERE id = 1').first(); return v ? v.v : 0; };
const bump = db => db.prepare('UPDATE ver SET v = v + 1 WHERE id = 1');

/* ---- Protección de la auditoría y borrado por anulación ---- */
const SIN_ANULAR = new Set(['ajustes', 'meta']);   // configuración y contadores: se pueden reescribir o quitar de verdad (queda en la auditoría)
const MSG_AUD = 'La auditoría solo se puede agregar: no se edita ni se borra.';
const esLocal = url => ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.hostname.endsWith('.localhost');
const recortar = (v, n = 70) => { if (v && typeof v === 'object') v = JSON.stringify(v); return typeof v === 'string' && v.length > n ? v.slice(0, n) + '…' : v; };
function resumir(d, claves) {
  const o = {}; let n = 0;
  for (const k of (claves || Object.keys(d || {}))) { if (k === 'id' || !d || !(k in d)) continue; o[k] = recortar(d[k]); if (++n >= 12) break; }
  return o;
}
function stAud(db, ctx, c, id, accion, detalle) {
  let t = JSON.stringify(detalle || {}); if (t.length > 2500) t = JSON.stringify({resumen: t.slice(0, 2400)});
  return db.prepare('INSERT INTO auditoria_sistema (ts, rol, ent, ref, accion, detalle) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(Date.now(), ctx.rolTxt || '—', c, String(id ?? ''), accion, t);
}
/* Lee un documento; si en este mismo lote ya se cambió (ctx.ov), devuelve la versión pendiente, así todo el lote se arma en memoria y se guarda de una sola vez. */
async function previo(db, c, id, ctx) {
  const k = c + '|' + id;
  if (ctx && ctx.ov && ctx.ov.has(k)) return ctx.ov.get(k);
  const r = await db.prepare('SELECT data FROM docs WHERE col = ?1 AND id = ?2').bind(c, id).first(); try { return r ? JSON.parse(r.data) : null; } catch (e) { return null; }
}
const pend = (ctx, c, id, d) => { if (ctx) (ctx.ov ||= new Map()).set(c + '|' + id, d); };
function motivoDe(m) {
  const t = typeof m === 'string' ? m.trim() : '';
  if (t.length < 3) throw {status: 400, message: 'Para quitar esto escribe un motivo corto (al menos 3 letras).'};
  return t.slice(0, 200);
}

async function apply(db, op, ctx = {}) {
  const now = Date.now(), c = op.c, sql = [];
  const auditar = ctx.rolTxt && !ctx.masivo && c !== 'meta' && c !== 'auditoria';
  if (c === 'auditoria') {   // solo agregar: ni editar, ni borrar, ni sobrescribir una fila que ya existe
    if (op.op !== 'set') throw {status: 403, message: MSG_AUD};
    checkDoc(c, op.id);
    if (await previo(db, c, op.id, ctx)) throw {status: 409, message: MSG_AUD};
  }
  if (op.op === 'set') {
    const s = checkDoc(op.c, op.id, {...op.d, id: op.id});
    const ant = auditar ? await previo(db, c, op.id, ctx) : null;
    pend(ctx, c, op.id, {...op.d, id: op.id});
    if (auditar) sql.push(stAud(db, ctx, c, op.id, ant ? 'cambiar' : 'agregar', {antes: ant ? resumir(ant) : null, despues: resumir(op.d)}));
    return [db.prepare('INSERT INTO docs (col, id, data, updated) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(col, id) DO UPDATE SET data = ?3, updated = ?4').bind(op.c, op.id, s, now), ...sql];
  }
  if (op.op === 'del') {
    checkDoc(op.c, op.id);
    if (ctx.purga) { pend(ctx, c, op.id, null); return [db.prepare('DELETE FROM docs WHERE col = ?1 AND id = ?2').bind(op.c, op.id)]; }   // reinicio de desarrollo local
    const ant = await previo(db, c, op.id, ctx);
    if (!ant) return [];
    if (SIN_ANULAR.has(c)) { pend(ctx, c, op.id, null); return [db.prepare('DELETE FROM docs WHERE col = ?1 AND id = ?2').bind(op.c, op.id), ...(auditar ? [stAud(db, ctx, c, op.id, 'quitar', {antes: resumir(ant)})] : [])]; }
    if (ant.anulado) return [];
    const motivo = motivoDe(op.motivo);
    const nuevo = {...ant, id: op.id, anulado: true, anuladoMotivo: motivo, anuladoPor: ctx.rolTxt || '—', anuladoTs: now};
    pend(ctx, c, op.id, nuevo);
    sql.push(db.prepare('UPDATE docs SET data = ?3, updated = ?4 WHERE col = ?1 AND id = ?2').bind(c, op.id, JSON.stringify(nuevo), now));
    if (ctx.rolTxt) sql.push(stAud(db, ctx, c, op.id, 'anular', {antes: resumir(ant), motivo}));
    return sql;
  }
  if (op.op === 'update') {
    checkDoc(op.c, op.id, op.d || {});
    const ant = await previo(db, c, op.id, ctx);
    if (!ant) throw {status: 404, message: 'El documento no existe.'};
    const s = checkDoc(op.c, op.id, {...ant, ...op.d, id: op.id});
    pend(ctx, c, op.id, {...ant, ...op.d, id: op.id});
    if (auditar) sql.push(stAud(db, ctx, c, op.id, 'cambiar', {antes: resumir(ant, Object.keys(op.d || {})), despues: resumir(op.d)}));
    return [db.prepare('UPDATE docs SET data = ?3, updated = ?4 WHERE col = ?1 AND id = ?2').bind(op.c, op.id, s, now), ...sql];
  }
  throw {status: 400, message: 'Operación desconocida.'};
}
async function polActual(db, ctx) { return (await previo(db, 'ajustes', 'politicas', ctx)) || {}; }
/* Descarga del almacén. Sin `since`: todo (primera carga o repaso completo).
   Con `since` (ms del servidor): solo lo que cambió desde entonces + `quitar` (lo que se anuló y ya no debe verse). `ajustes` y `meta` (pocos y se pueden borrar de verdad) van siempre completos. */
async function allDocs(db, rol, conAnulados, since) {
  const delta = Number.isFinite(since) && since > 0, ahora = Date.now();
  const r = delta ? await db.prepare("SELECT col, data FROM docs WHERE updated > ?1 OR col IN ('ajustes', 'meta')").bind(since).all() : await db.prepare('SELECT col, data FROM docs').all(), cols = {}, quitar = {};
  for (const c of COLS) cols[c] = [];
  for (const x of r.results) {
    try {
      const d = JSON.parse(x.data); if (!puedeLeer(rol, x.col, d && d.id)) continue;
      if (conAnulados || !(d && d.anulado)) (cols[x.col] ||= []).push(filtrarDoc(rol, x.col, d));
      else if (delta) (quitar[x.col] ||= []).push(d.id);
    } catch (e) {}
  }
  const v = await db.prepare('SELECT v FROM ver WHERE id = 1').first();
  return delta ? {ver: v ? v.v : 0, delta: true, now: ahora, cols, quitar} : {ver: v ? v.v : 0, now: ahora, cols};
}

/* Puestos viejos → nuevos. ÚNICO punto del servidor donde se traduce x-rol (una pestaña abierta con «jefeprod» sigue funcionando como Producción). */
function conAlias(req) {
  const r = (req.headers.get('x-rol') || '').trim();
  if (!ROL_ALIAS[r] || ROL_TXT[r]) return req;
  const h = new Headers(req.headers); h.set('x-rol', ROL_ALIAS[r]);
  return new Request(req, {headers: h});
}
async function handle(req, env, url) {
  req = conAlias(req);
  const db = env.DB, p = url.pathname, m = req.method;
  const ip = req.headers.get('cf-connecting-ip') || 'local', write = m !== 'GET';
  if (await limitedBy(env, ip, write ? 'write' : 'read')) return json({error: 'Demasiadas peticiones. Espera un minuto.'}, 429, {'retry-after': '30'});
  const origin = req.headers.get('origin');
  if (origin && origin !== url.origin) return err(403, 'Origen no permitido.');
  if ((m === 'POST' || m === 'PUT' || m === 'PATCH') && !/^application\/json/i.test(req.headers.get('content-type') || '')) return err(415, 'Se espera application/json.');

  if (p === '/api/c/portal' || p.startsWith('/api/c/portal/')) return rutasPortal(req, env, url);   // portal del cliente (código personal)
  if (p === '/api/v/portal' || p.startsWith('/api/v/portal/')) return rutasEquipo(req, env, url);   // acciones del equipo sobre el portal
  if (p === '/api/c/entregas' || p.startsWith('/api/c/entregas/')) return rutasEntregasCliente(req, env, url);   // entrega con foto + temporizador (cliente, x-token)
  if (p === '/api/v/entregas' || p.startsWith('/api/v/entregas/')) return rutasEntregas(req, env, url);         // entrega con foto + temporizador (equipo, x-rol)
  if (p === '/api/p' || p.startsWith('/api/p/')) return rutasProduccion(req, env, url);                         // producción por zonas: pedidos, salidas, turnos
  if (p === '/api/v/pantallas' || p.startsWith('/api/v/pantallas/')) return rutasPantallas(req, env, url);       // funciones extra por rol (lanzador Opciones)
  if (p === '/api/f' || p.startsWith('/api/f/')) return rutasFlota(req, env, url);                                 // flota de vehículos y choferes de nómina
  if (p === '/api/s' || p.startsWith('/api/s/')) return rutasSolicitudes(req, env, url);                         // solicitudes de autorización al Gerente
  if (p === '/api/h' || p.startsWith('/api/h/')) return rutasRrhh(req, env, url);                                 // marcas de entrada y salida (En planta hoy)
  if (p === '/api/v/compras' || p.startsWith('/api/v/compras/')) return rutasCompras(req, env, url);              // hacer una compra al proveedor (pedidos)
  if (p === '/api/v/bancos' || p.startsWith('/api/v/bancos/')) return rutasBancos(req, env, url);                // bancos de la empresa
  if (p === '/api/v/precios' || p.startsWith('/api/v/precios/')) return rutasPrecios(req, env, url);          // cambios de precio con aprobación del Gerente
  if (p === '/api/v/tasa' || p.startsWith('/api/v/tasa/')) return rutasTasa(req, env, url);
  if (p.startsWith('/api/v/')) return rutasVentas(req, env, url);
  if (m === 'GET' && p === '/api/ver') { const v = await db.prepare('SELECT v FROM ver WHERE id = 1').first(); return json({ver: v ? v.v : 0}); }
  if (m === 'GET' && p === '/api/health') return json({ok: true});
  /* Desde aquí, todo lo de la app principal exige puesto (x-rol válido) */
  const rol = rolDe(req);
  if (!rol && (p === '/api/all' || p === '/api/batch' || p === '/api/lock' || p.startsWith('/api/c/'))) return err(403, 'Falta indicar tu puesto.');
  if (m === 'GET' && p === '/api/all') return json(await allDocs(db, rol, url.searchParams.get('anulados') === '1', +url.searchParams.get('since') || 0));

  if (m === 'POST' && p === '/api/batch') {
    const b = await readJson(req);
    if (!isObj(b) || !Array.isArray(b.ops)) return err(400, 'Falta la lista de operaciones.');
    if (b.ops.length > MAX_OPS) return err(413, 'Demasiadas operaciones en un lote.');
    
    const ctx = {rolTxt: ROL_TXT[rol], purga: false, masivo: false};
    if (req.headers.get('x-purga') === '1') {   // reinicio de datos de ejemplo: solo en desarrollo local y solo Gerencia
      if (!esLocal(url)) return err(403, 'Empezar en limpio y volver a cargar el ejemplo solo están disponibles en el equipo de desarrollo, no en el sitio real.');
      if (rol !== 'dueno') return err(403, 'Solo Gerencia puede hacer esto.');
      ctx.purga = true;
    }
    ctx.masivo = !ctx.purga && b.ops.length > 20;
    const stm = [];
    // Todo el lote se arma en memoria (las ediciones ven lo que dejaron las anteriores) y se guarda en UN solo bloque: se aplica completo o no se aplica nada.
    for (const op of b.ops) {
      if (!isObj(op)) return err(400, 'Operación no válida.');
      if (!puedeEscribir(rol, op.c, op.id) || (op.c === 'ajustes' && op.id === 'politicas' && cambiaCamposDueno(rol, op, await polActual(db, ctx)))) return err(403, 'Tu puesto no puede modificar esta información.');
      stm.push(...await apply(db, op, ctx));
    }
    if (ctx.purga) { const n = {}; for (const o of b.ops) n[o.c] = (n[o.c] || 0) + 1; stm.push(stAud(db, ctx, 'sistema', 'purga', 'reinicio de datos (desarrollo)', {colecciones: n})); }
    else if (ctx.masivo) { const n = {}; for (const o of b.ops) if (o.c !== 'meta' && o.c !== 'auditoria') n[o.op + ':' + o.c] = (n[o.op + ':' + o.c] || 0) + 1; if (Object.keys(n).length) stm.push(stAud(db, ctx, 'sistema', 'lote', 'carga masiva', {operaciones: n})); }
    stm.push(bump(db)); await db.batch(stm);
    return json({ok: true, n: b.ops.length, ver: await curVer(db)});
  }
  if (m === 'POST' && p === '/api/lock') {
    const b = await readJson(req);
    if (!isObj(b) || typeof b.name !== 'string' || !ID_RE.test(b.name) || typeof b.holder !== 'string' || !ID_RE.test(b.holder)) return err(400, 'Datos de la concesión no válidos.');
    const ttl = Math.min(Math.max(+b.ttl || 5000, 500), 20000), now = Date.now();
    const r = await db.prepare('INSERT INTO locks (name, holder, until) VALUES (?1, ?2, ?3) ON CONFLICT(name) DO UPDATE SET holder = ?2, until = ?3 WHERE locks.until <= ?4 OR locks.holder = ?2').bind(b.name, b.holder, now + ttl, now).run();
    return json({acquired: !!(r.meta && r.meta.changes > 0)});
  }
  const ml = p.match(/^\/api\/c\/([^/]+)$/);
  if (m === 'GET' && ml) { const c = decodeURIComponent(ml[1]); if (!COLS.has(c)) return err(400, 'Colección desconocida.'); const r = await db.prepare('SELECT data FROM docs WHERE col = ?1').bind(c).all(); return json(r.results.map(x => JSON.parse(x.data)).filter(d => puedeLeer(rol, c, d && d.id) && (url.searchParams.get('anulados') === '1' || !(d && d.anulado))).map(d => filtrarDoc(rol, c, d))); }
  const mm = p.match(/^\/api\/c\/([^/]+)\/([^/]+)$/);
  if (mm) {
    const c = decodeURIComponent(mm[1]), id = decodeURIComponent(mm[2]);
    if ((m === 'PUT' || m === 'PATCH' || m === 'DELETE') && !puedeEscribir(rol, c, id)) return err(403, 'Tu puesto no puede modificar esta información.');
    if (m === 'GET' && !puedeLeer(rol, c, id)) return err(403, 'Tu puesto no puede ver esta información.');
    if (m === 'PUT' || m === 'PATCH') {
      const d = await readJson(req); if (!isObj(d)) return err(400, 'El documento debe ser un objeto.');
      if (c === 'ajustes' && id === 'politicas' && cambiaCamposDueno(rol, {op: m === 'PUT' ? 'set' : 'update', c, id, d}, await polActual(db, null))) return err(403, 'Tu puesto no puede modificar esta información.'); const st = await apply(db, {op: m === 'PUT' ? 'set' : 'update', c, id, d}, {rolTxt: ROL_TXT[rol]});
      await db.batch([...st, bump(db)]); return json({ok: true, ver: await curVer(db)});
    }
    if (m === 'DELETE') {
      const purga = req.headers.get('x-purga') === '1';
      if (purga && !esLocal(url)) return err(403, 'Esta acción solo está disponible en el equipo de desarrollo, no en el sitio real.');
      if (purga && rol !== 'dueno') return err(403, 'Solo Gerencia puede hacer esto.');
      const hm = req.headers.get('x-motivo'); let mot = url.searchParams.get('motivo'); if (!mot && hm) { try { mot = decodeURIComponent(hm); } catch (e) { mot = hm; } }
      const st = await apply(db, {op: 'del', c, id, motivo: mot}, {rolTxt: ROL_TXT[rol], purga}); await db.batch([...st, bump(db)]); return json({ok: true, ver: await curVer(db)}); }
    if (m === 'GET') { checkDoc(c, id); const r = await db.prepare('SELECT data FROM docs WHERE col = ?1 AND id = ?2').bind(c, id).first(); return r ? json(filtrarDoc(rol, c, JSON.parse(r.data))) : err(404, 'No existe.'); }
  }
  return err(404, 'Ruta no encontrada.');
}

/* Texto visible: la palabra «Dueño» no se muestra nunca. Los datos viejos guardaron el puesto con ese nombre; al salir se muestra como «Gerencia» (el puesto) o «Gerente» (en frases). La clave interna «dueno» no se toca. */
async function sinDueno(r) {
  if (!/json/i.test(r.headers.get('content-type') || '')) return r;
  const t = await r.text();
  if (!/[Dd]ueñ[oa]/.test(t)) return new Response(t, {status: r.status, statusText: r.statusText, headers: r.headers});
  const h = new Headers(r.headers); h.delete('content-length');
  return new Response(t.replace(/Dueñ[oa]/g, 'Gerencia').replace(/dueñ[oa]/g, 'Gerente'), {status: r.status, statusText: r.statusText, headers: h});
}
/* Sentry: solo errores. Privacidad: nómina, cédulas y cobranzas no deben salir; se borran peticiones, cabeceras, cookies, query strings y usuario. */
function limpiarEvento(ev) {
  if (ev.request) {
    const u = String(ev.request.url || '').split('?')[0].split('#')[0];
    ev.request = {method: ev.request.method, url: u};
  }
  delete ev.user;
  if (ev.contexts) { delete ev.contexts.cloud_resource; }
  delete ev.extra;
  if (ev.breadcrumbs) ev.breadcrumbs = [];
  return ev;
}
const handler = {
  /* Tarea diaria (wrangler.toml [triggers]): consulta la tasa oficial del BCV. Si falla, queda el aviso y se usa la última guardada. */
  async scheduled(event, env, ctx) { ctx.waitUntil(Tasa.consultar(env.DB)); },
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) {
      const r = await env.ASSETS.fetch(req);
      const h = new Headers(r.headers);
      const p = url.pathname, ext = (p.match(/\.([a-z0-9]+)$/i) || [])[1];
      const MT = {ico: 'image/x-icon', svg: 'image/svg+xml', webmanifest: 'application/manifest+json', png: 'image/png'};
      if (ext && MT[ext.toLowerCase()]) h.set('content-type', MT[ext.toLowerCase()]);
      // HTML: siempre revalidar. Iconos, banner y manifiesto: caché de un día.
      h.set('cache-control', (!ext || ext.toLowerCase() === 'html') ? 'no-cache' : 'public, max-age=86400');
      return new Response(r.body, {status: r.status, statusText: r.statusText, headers: h});
    }
    try { return await sinDueno(await handle(req, env, url)); }
    catch (e) {
      if (e && e.status) return err(e.status, e.message);
      console.error((e && e.stack) || e);
      Sentry.captureException(e);
      return err(500, 'Error interno.');
    }
  }
};

export default Sentry.withSentry(
  env => ({
    dsn: env.SENTRY_DSN,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: limpiarEvento,
  }),
  handler
);
