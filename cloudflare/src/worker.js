/* El Maná JL · API del Worker (Cloudflare Workers + D1)
   Sin secretos. Mismo origen que el frontend. Validación estricta, tamaño limitado y límite de peticiones por IP. */
import {rutasVentas} from './ventas/rutas.js';
import {rutasTasa} from './tasa/rutas.js';
import {rutasPortal, rutasEquipo} from './cliente/rutas.js';
import {rutasEntregas, rutasEntregasCliente} from './entregas/rutas.js';
import {rutasPrecios} from './precios/rutas.js';
import {rutasBancos} from './bancos/rutas.js';
import {rutasPantallas} from './pantallas/rutas.js';
import * as Tasa from './tasa/servicio.js';
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

async function apply(db, op) {
  const now = Date.now();
  if (op.op === 'set') { const s = checkDoc(op.c, op.id, {...op.d, id: op.id}); return [db.prepare('INSERT INTO docs (col, id, data, updated) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(col, id) DO UPDATE SET data = ?3, updated = ?4').bind(op.c, op.id, s, now)]; }
  if (op.op === 'del') { checkDoc(op.c, op.id); return [db.prepare('DELETE FROM docs WHERE col = ?1 AND id = ?2').bind(op.c, op.id)]; }
  if (op.op === 'update') {
    checkDoc(op.c, op.id, op.d || {});
    const cur = await db.prepare('SELECT data FROM docs WHERE col = ?1 AND id = ?2').bind(op.c, op.id).first();
    if (!cur) throw {status: 404, message: 'El documento no existe.'};
    const s = checkDoc(op.c, op.id, {...JSON.parse(cur.data), ...op.d, id: op.id});
    return [db.prepare('UPDATE docs SET data = ?3, updated = ?4 WHERE col = ?1 AND id = ?2').bind(op.c, op.id, s, now)];
  }
  throw {status: 400, message: 'Operación desconocida.'};
}
async function allDocs(db) {
  const r = await db.prepare('SELECT col, data FROM docs').all(), cols = {};
  for (const c of COLS) cols[c] = [];
  for (const x of r.results) { try { (cols[x.col] ||= []).push(JSON.parse(x.data)); } catch (e) {} }
  const v = await db.prepare('SELECT v FROM ver WHERE id = 1').first();
  return {ver: v ? v.v : 0, cols};
}

async function handle(req, env, url) {
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
  if (p === '/api/v/pantallas' || p.startsWith('/api/v/pantallas/')) return rutasPantallas(req, env, url);       // funciones extra por rol (lanzador Opciones)
  if (p === '/api/v/bancos' || p.startsWith('/api/v/bancos/')) return rutasBancos(req, env, url);                // bancos de la empresa
  if (p === '/api/v/precios' || p.startsWith('/api/v/precios/')) return rutasPrecios(req, env, url);          // cambios de precio con aprobación del Dueño
  if (p === '/api/v/tasa' || p.startsWith('/api/v/tasa/')) return rutasTasa(req, env, url);
  if (p.startsWith('/api/v/')) return rutasVentas(req, env, url);
  if (m === 'GET' && p === '/api/ver') { const v = await db.prepare('SELECT v FROM ver WHERE id = 1').first(); return json({ver: v ? v.v : 0}); }
  if (m === 'GET' && p === '/api/all') return json(await allDocs(db));
  if (m === 'GET' && p === '/api/health') return json({ok: true});

  if (m === 'POST' && p === '/api/batch') {
    const b = await readJson(req);
    if (!isObj(b) || !Array.isArray(b.ops)) return err(400, 'Falta la lista de operaciones.');
    if (b.ops.length > MAX_OPS) return err(413, 'Demasiadas operaciones en un lote.');
    
    let stm = [];
    // las actualizaciones dependen del estado actual: se aplican en orden, vaciando antes lo pendiente
    for (const op of b.ops) {
      if (!isObj(op)) return err(400, 'Operación no válida.');
      if (op.op === 'update' && stm.length) { await db.batch(stm); stm = []; }
      stm.push(...await apply(db, op));
      if (op.op === 'update') { await db.batch(stm); stm = []; }
    }
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
  if (m === 'GET' && ml) { const c = decodeURIComponent(ml[1]); if (!COLS.has(c)) return err(400, 'Colección desconocida.'); const r = await db.prepare('SELECT data FROM docs WHERE col = ?1').bind(c).all(); return json(r.results.map(x => JSON.parse(x.data))); }
  const mm = p.match(/^\/api\/c\/([^/]+)\/([^/]+)$/);
  if (mm) {
    const c = decodeURIComponent(mm[1]), id = decodeURIComponent(mm[2]);
    if (m === 'PUT' || m === 'PATCH') {
      const d = await readJson(req); if (!isObj(d)) return err(400, 'El documento debe ser un objeto.'); const st = await apply(db, {op: m === 'PUT' ? 'set' : 'update', c, id, d});
      await db.batch([...st, bump(db)]); return json({ok: true, ver: await curVer(db)});
    }
    if (m === 'DELETE') { const st = await apply(db, {op: 'del', c, id}); await db.batch([...st, bump(db)]); return json({ok: true, ver: await curVer(db)}); }
    if (m === 'GET') { checkDoc(c, id); const r = await db.prepare('SELECT data FROM docs WHERE col = ?1 AND id = ?2').bind(c, id).first(); return r ? json(JSON.parse(r.data)) : err(404, 'No existe.'); }
  }
  return err(404, 'Ruta no encontrada.');
}

export default {
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
    try { return await handle(req, env, url); }
    catch (e) {
      if (e && e.status) return err(e.status, e.message);
      console.error((e && e.stack) || e);
      return err(500, 'Error interno.');
    }
  }
};
