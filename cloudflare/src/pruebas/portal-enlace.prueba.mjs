/* Portal del cliente por enlace personal (sin escribir código). Uso: node src/pruebas/portal-enlace.prueba.mjs */
import assert from 'node:assert/strict';
import {crearDB} from './d1-falso.mjs';
import worker from '../worker.js';
let n = 0; const ok = m => { n++; console.log('  ok · ' + m); };
const db = crearDB(), raw = db.raw, env = {DB: db, ASSETS: {fetch: async () => new Response('x')}};
const ll = async (ruta, op = 'GET', body, hdr = {}) => { const r = await worker.fetch(new Request('http://localhost' + ruta, {method: op, headers: {'content-type': 'application/json', ...hdr}, body: body ? JSON.stringify(body) : undefined}), env); let j = null; try { j = await r.json(); } catch (e) {} return {status: r.status, j}; };
const eq = (ruta, op, body, rol = 'dueno') => ll(ruta, op, body, {'x-rol': rol});
const portal = (ruta, tok, ip = '1.1.1.1') => ll('/api/c/portal' + ruta, 'GET', null, {'x-token': tok, 'cf-connecting-ip': ip});
raw.exec("INSERT INTO clientes (id_cliente, razon_social, razon_norm, rif_id) VALUES (1,'Cliente Uno','cliente uno','J-1'),(2,'Cliente Dos','cliente dos','J-2')");

let r = await eq('/api/v/portal/clientes/1/enlace', 'GET'); assert.equal(r.status, 404); ok('sin enlace generado no hay nada que copiar');
r = await eq('/api/v/portal/clientes/1/enlace', 'POST', {}); assert.equal(r.status, 201);
assert.match(r.j.ruta, /^\/cliente\.html#t=[A-Za-z0-9_-]{43}$/); const t1 = r.j.ruta.split('#t=')[1]; ok('el enlace personal tiene un código de 256 bits');
r = await eq('/api/v/portal/clientes/2/enlace', 'POST', {}); const t2 = r.j.ruta.split('#t=')[1];
r = await portal('/yo', t1); assert.equal(r.status, 200); assert.equal(r.j.cliente.nombre, 'Cliente Uno'); ok('entra con el enlace, sin escribir nada');
r = await portal('/cuenta', t1); assert.equal(r.status, 200); assert.ok(!JSON.stringify(r.j).includes('Cliente Dos')); ok('un cliente no ve datos de otro');
r = await portal('/yo', t2); assert.equal(r.j.cliente.nombre, 'Cliente Dos');
const mal = await portal('/yo', 'x'.repeat(43), '2.2.2.2'), nada = await portal('/yo', '', '2.2.2.3'); assert.equal(mal.status, 401); assert.equal(nada.status, 401); assert.equal(mal.j.error, nada.j.error); ok('token inválido o vacío: 401 igual, sin revelar si existe el cliente');
let last; for (let i = 0; i < 12; i++) last = await portal('/yo', 'y'.repeat(43), '3.3.3.3'); assert.equal(last.status, 429); r = await portal('/yo', t1, '3.3.3.3'); assert.equal(r.status, 429); ok('límite de intentos fallidos por IP');
r = await eq('/api/v/portal/clientes/1/enlace', 'GET'); assert.equal(r.status, 200); assert.equal(r.j.ruta, '/cliente.html#t=' + t1); ok('se puede copiar el enlace activo');
r = await eq('/api/v/portal/clientes/1/enlace', 'GET', null, 'produccion'); assert.equal(r.status, 403); ok('un rol sin permiso no copia enlaces');
r = await eq('/api/v/portal/clientes/1'); assert.equal(r.j.enlace_copiable, true); assert.ok(!JSON.stringify(r.j).includes(t1)); ok('la ficha no incluye el código, solo si es copiable');
r = await eq('/api/v/portal/clientes/1/enlace', 'POST', {}); const t1b = r.j.ruta.split('#t=')[1]; assert.notEqual(t1b, t1);
r = await portal('/yo', t1, '4.4.4.4'); assert.equal(r.status, 401); r = await portal('/yo', t1b, '4.4.4.4'); assert.equal(r.status, 200); ok('generar enlace nuevo invalida el anterior');
r = await portal('/yo', t2, '4.4.4.4'); assert.equal(r.status, 200); ok('el enlace de otro cliente sigue funcionando');
r = await eq('/api/v/portal/clientes/1/enlace/revocar', 'POST', {}); r = await portal('/yo', t1b, '5.5.5.5'); assert.equal(r.status, 401); r = await eq('/api/v/portal/clientes/1/enlace', 'GET'); assert.equal(r.status, 404); ok('revocar deja al cliente fuera y sin enlace copiable');
r = await ll('/api/c/portal/bancos', 'GET', null, {'x-token': t2, 'cf-connecting-ip': '6.6.6.6'}); assert.equal(r.status, 200); ok('el portal sigue mostrando los bancos al cliente');
console.log(n + ' pruebas ok');
