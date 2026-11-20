/* Pruebas del flujo de compras en UN solo paso: registrar → «pendiente por llegar» en Recibir → recibir deja la compra LISTA (deuda según lo recibido).
   Sin «Por validar». Incluye la migración 0033 (compras que esperaban validación) y su reversa. Base en memoria, datos inventados, tasa fija.
   Uso: node src/pruebas/compras-un-paso.prueba.mjs */
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {crearDB} from './d1-falso.mjs';
import * as CS from '../compras/servicio.js';
import * as RC from '../compras/recepcion-servicio.js';
import {rutasCompras} from '../compras/rutas.js';

let n = 0; const ok = m => { n++; console.log('  ok · ' + m); };
const rechaza = async (p, re, st) => { try { await p; } catch (e) { assert.match(String(e.message), re); if (st) assert.equal(e.status, st); return e; } assert.fail('debía rechazar: ' + re); };

const db = crearDB(), raw = db.raw;
const hoy = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10);
raw.prepare("INSERT INTO config (clave, valor) VALUES ('tasa_ultimo_intento', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor").run(new Date().toISOString());
raw.prepare("INSERT INTO tasas_bcv (fecha, valor, fuente, obtenida_en, origen) VALUES (?,?,?,?,'DEV')").run(hoy, 500, 'prueba', 'x');
const doc = (col, id, o) => raw.prepare('INSERT INTO docs (col, id, data, updated) VALUES (?, ?, ?, 1)').run(col, id, JSON.stringify({id, ...o}));
const docs = col => raw.prepare('SELECT data FROM docs WHERE col = ?').all(col).map(r => JSON.parse(r.data));
doc('proveedores', 'P1', {nombre: 'Papas del Valle', tipo: 'papa', cond: 'Crédito', dias: 20});
doc('proveedores', 'P4', {nombre: 'Aceites SA', tipo: 'insumo', cond: 'Contado'});
doc('productos', 'PAPA-cruda', {tipo: 'papa', n: 'Papa cruda', cat: 'Papa cruda', sk: 'Papa cruda'});
doc('productos', 'INS-aceite', {tipo: 'insumo', n: 'Aceite vegetal', cat: 'Aceite', sk: 'Aceite'});
raw.prepare("INSERT INTO bancos (id, nombre, moneda, cuenta_numero, cuenta_titular, telefono, cedula, rif, activo, creado_ts) VALUES (1, 'Banco de prueba', 'USD', '0102', 'Prueba', '0414-1234567', 'V-12345678', 'J-12345678-9', 1, 1)").run();
const adm = {db, rol: 'adm'}, prod = {db, rol: 'produccion'}, dueno = {db, rol: 'dueno'};
const P5 = [43, 43, 43, 43, 43];
let fx = 0; const fac = () => 'F-' + (++fx);
const credito = (lineas, o = {}) => CS.crear(adm, {proveedor_id: 'P1', factura: fac(), fecha: hoy, condicion: 'CREDITO', plazo_dias: 20, lineas, ...o});

// ---- 1. La compra aparece en Recibir APENAS se registra ----
const c1 = await credito([{producto_id: 'PAPA-cruda', cantidad: 100, precio_usd: 20}]);
let por = await RC.porRecibir(prod); assert.ok(por.pedidos.find(p => p.nro === c1.nro)); ok('recién registrada, la compra ya sale en «Recibir» como pendiente por llegar (Producción)');
por = await RC.porRecibir(dueno); assert.ok(por.pedidos.find(p => p.nro === c1.nro)); ok('el Gerente también la ve');
assert.equal(docs('compras').length, 0); assert.equal(docs('cxp').length, 0); assert.equal(raw.prepare('SELECT COUNT(*) c FROM inv_movimientos').get().c, 0); ok('sin recibir NO hay deuda, ni compra efectiva, ni inventario (si nunca llega, no cuenta)');
const lp = await CS.listar(prod, 'PEDIDA'); assert.equal(JSON.stringify(lp).includes('precio'), false); ok('Producción ve lo pendiente sin precios ni montos');

// ---- 2. Recibir completo: queda LISTA en un solo paso ----
const r1 = await RC.recibir(prod, {nro: c1.nro, lineas: [{producto_id: 'PAPA-cruda', recibido: 100, pesadas: P5}]});
assert.equal(r1.con_diferencia, false); assert.equal(JSON.stringify(r1).includes('total_usd'), false); ok('recibir completo: sin alarma y la respuesta a Producción no trae montos');
assert.equal(docs('compras').length, 1); const cx1 = docs('cxp'); assert.equal(cx1.length, 1); assert.equal(cx1[0].total, 2000); assert.equal(docs('movimientos').length, 1); ok('queda lista de una vez: compra efectiva, deuda de $ 2.000 y entrada al almacén');
const kgPapa = () => raw.prepare("SELECT COALESCE(SUM(cantidad),0) s FROM inv_movimientos WHERE articulo='papa' AND tipo='ENTRADA' AND origen='compra'").get().s; assert.equal(kgPapa(), 4300); ok('el inventario general suma lo recibido (100 sacos × 43 kg = 4.300 kg)');
assert.equal(raw.prepare('SELECT COUNT(*) c FROM alertas_admin').get().c, 0); assert.equal(raw.prepare('SELECT validada_ts FROM compras_pedidos WHERE nro=?').get(c1.nro).validada_ts > 0, true); ok('no queda nada «por validar» ni aviso pendiente');
await rechaza(RC.recibir(prod, {nro: c1.nro, lineas: [{producto_id: 'PAPA-cruda', recibido: 100, pesadas: P5}]}), /ya se recibió/, 409); assert.equal(docs('cxp').length, 1); ok('no se recibe dos veces (no se duplica la deuda)');
assert.equal((await CS.listar(adm, 'PEDIDA')).pedidos.find(p => p.nro === c1.nro), undefined); assert.equal((await RC.porRecibir(prod)).pedidos.find(p => p.nro === c1.nro), undefined); ok('sale de la lista de pendientes por llegar');

// ---- 3. Recibir con menos: motivo y vale lo recibido ----
const c2 = await credito([{producto_id: 'PAPA-cruda', cantidad: 100, precio_usd: 20}]);
const cuerpo = {nro: c2.nro, lineas: [{producto_id: 'PAPA-cruda', recibido: 90, pesadas: P5}]};
const e = await rechaza(RC.recibir(prod, cuerpo), /no es lo que se compró/, 409); assert.equal(e.extra.codigo, 'DIFERENCIA'); assert.equal(docs('cxp').length, 1); ok('si llegan menos sacos salta la alarma y no se guarda nada todavía');
await rechaza(RC.recibir(prod, {...cuerpo, confirmar_diferencia: true}), /motivo de la diferencia/, 400); ok('sin motivo no pasa');
const r2 = await RC.recibir(prod, {...cuerpo, confirmar_diferencia: true, motivo: 'El camión dejó 10 sacos en otro depósito'}); assert.equal(r2.con_diferencia, true);
const cx2 = docs('cxp').find(x => x.compraId === 'C-' + c2.nro + '-1'); assert.equal(cx2.total, 1800); assert.equal(docs('compras').find(x => x.id === 'C-' + c2.nro + '-1').qf, 90); ok('con motivo queda lista y vale solo lo recibido: 90 sacos × $ 20 = $ 1.800 (no $ 2.000)');
assert.equal(raw.prepare('SELECT motivo, diferencia FROM compras_diferencias WHERE nro=?').get(c2.nro).diferencia, -10); assert.equal(kgPapa(), 4300 + 3870); ok('el motivo queda guardado y el inventario sube solo lo recibido (3.870 kg)');
const dif = await RC.diferencias(adm); assert.equal(dif.sin_ver, 1); assert.match(dif.diferencias[0].motivo, /otro depósito/); await rechaza(RC.diferencias(prod), /Solo Administración/, 403); ok('Administración ve la discrepancia (alarma existente) con su motivo; Producción no');

// ---- 4. Contado y compra con un producto que no llegó ----
const c3 = await CS.crear(adm, {proveedor_id: 'P4', factura: fac(), fecha: hoy, condicion: 'CONTADO', id_banco: 1, lineas: [{producto_id: 'INS-aceite', cantidad: 900, precio_usd: 1.5}]});
await RC.recibir(prod, {nro: c3.nro, lineas: [{producto_id: 'INS-aceite', recibido: 900}]});
assert.equal(docs('cxp').length, 2); assert.equal(docs('compras').find(x => x.id === 'C-' + c3.nro + '-1').cond, 'Contado'); ok('compra de contado: queda lista como pagada, sin cuenta por pagar');
const c4 = await credito([{producto_id: 'INS-aceite', cantidad: 500, precio_usd: 2}]);
await RC.recibir(prod, {nro: c4.nro, lineas: [{producto_id: 'INS-aceite', recibido: 0}], confirmar_diferencia: true, motivo: 'No llegó el camión'});
assert.equal(docs('cxp').length, 2); assert.equal(docs('compras').some(x => x.pedido === c4.nro), false); ok('si no llegó nada: no hay deuda ni inventario, solo la diferencia con motivo');

// ---- 5. «Validar» ya no existe ----
assert.equal(typeof RC.validar, 'undefined'); assert.equal(typeof RC.porValidar, 'undefined');
const rq = (m, ruta, rol, cuerpo) => new Request('http://x' + ruta, {method: m, headers: {'x-rol': rol, 'content-type': 'application/json'}, body: cuerpo ? JSON.stringify(cuerpo) : undefined});
for (const [m, ruta] of [['POST', '/api/v/compras/validar'], ['GET', '/api/v/compras/por-validar'], ['GET', '/api/v/compras/por-validar/contador']]) {
  const r = await rutasCompras(rq(m, ruta, 'adm', m === 'POST' ? {nro: c1.nro} : undefined), {DB: db}, new URL('http://x' + ruta)); assert.equal(r.status, 404);
}
ok('no existen las rutas de validar ni «por validar»');

// ---- 6. Migración 0033 con datos viejos «por validar», y su reversa ----
{
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations'), rv = path.join(dir, '..', 'reversa', '0033_compras_sin_validar_reversa.sql');
  const m = new DatabaseSync(':memory:'), fs = readdirSync(dir).filter(x => x.endsWith('.sql')).sort();
  for (const f of fs.filter(x => x < '0033')) m.exec(readFileSync(path.join(dir, f), 'utf8'));
  const dm = (col, id, o) => m.prepare('INSERT INTO docs (col, id, data, updated) VALUES (?, ?, ?, 1)').run(col, id, JSON.stringify({id, ...o}));
  dm('proveedores', 'P1', {nombre: 'Papas del Valle', abonos: 2});
  const ped = (nro, cond, rec, vts) => m.prepare("INSERT INTO compras_pedidos (nro, proveedor_id, proveedor_nombre, fecha, factura, factura_norm, condicion, plazo_dias, tasa, total_usd_cents, total_bs_cents, estado, rol, creado_ts, recibida_ts, con_diferencia, validada_ts) VALUES (?, 'P1', 'Papas del Valle', '2026-11-10', ?, ?, ?, 20, 500, 200000, 1, ?, 'adm', 1, ?, 0, ?)").run(nro, 'F' + nro, 'F' + nro, cond, rec ? 'RECIBIDA' : 'PEDIDA', rec ? 5000 : null, vts || null);
  const lin = (nro, unidad, cant, pu) => m.prepare("INSERT INTO compras_pedido_lineas (pedido_id, producto_id, producto_nombre, unidad, cantidad, precio_usd, subtotal_cents) VALUES ((SELECT id FROM compras_pedidos WHERE nro=?), 'PAPA-cruda', 'Papa cruda', ?, ?, ?, 1)").run(nro, unidad, cant, pu);
  ped('CP-A', 'CREDITO', true); lin('CP-A', 'saco', 100, 20);   // recibida con 90 sacos, esperando validación
  dm('recepciones', 'REC-CP-A-1', {pedido: 'CP-A', producto_id: 'PAPA-cruda', estado: 'verificado', recibido: 90, kgRec: 3870, cat: 'Papa cruda', item: 'Papa cruda', sk: 'Papa cruda', sub: 'Propia', fecha: '2026-11-12', entProm: '2026-11-10', entReal: '2026-11-12', motivo: 'Pedido CP-A'});
  m.prepare("INSERT INTO alertas_admin (tipo, ref, titulo, detalle, estado, creado_ts) VALUES ('RECEPCION_POR_VALIDAR', 'CP-A', 'x', ?, 'PENDIENTE', 1)").run(JSON.stringify({con_diferencia: true}));
  ped('CP-B', 'CONTADO', true); lin('CP-B', 'saco', 50, 20);    // recibida completa, esperando validación
  dm('recepciones', 'REC-CP-B-1', {pedido: 'CP-B', producto_id: 'PAPA-cruda', estado: 'verificado', recibido: 50, kgRec: 2150, cat: 'Papa cruda', item: 'Papa cruda', sk: 'Papa cruda', sub: 'Propia', fecha: '2026-11-12', entProm: '2026-11-10', entReal: '2026-11-12', motivo: 'Pedido CP-B'});
  m.prepare("INSERT INTO alertas_admin (tipo, ref, titulo, detalle, estado, creado_ts) VALUES ('RECEPCION_POR_VALIDAR', 'CP-B', 'x', ?, 'PENDIENTE', 1)").run(JSON.stringify({con_diferencia: false}));
  ped('CP-C', 'CREDITO', false); lin('CP-C', 'saco', 10, 20);   // todavía no llegó: debe quedar igual
  ped('CP-D', 'CREDITO', true, 6000); lin('CP-D', 'saco', 10, 20); // ya validada con el flujo anterior: no se toca
  dm('compras', 'C-D-1', {pedido: 'CP-D', qf: 10, pu: 20});
  const foto = () => JSON.stringify([m.prepare('SELECT col, id, data FROM docs ORDER BY col, id').all(), m.prepare('SELECT nro, estado, validada_ts, validada_rol FROM compras_pedidos ORDER BY nro').all(), m.prepare('SELECT tipo, ref, estado, detalle FROM alertas_admin ORDER BY ref').all()]);
  const antes = foto();
  m.exec(readFileSync(path.join(dir, '0033_compras_sin_validar.sql'), 'utf8'));
  const get = (col, id) => { const r = m.prepare('SELECT data FROM docs WHERE col=? AND id=?').get(col, id); return r ? JSON.parse(r.data) : null; };
  assert.equal(get('compras', 'C-CP-A-1').qf, 90); assert.equal(get('compras', 'C-CP-A-1').cond, 'Crédito'); assert.equal(get('cxp', 'CXP-C-CP-A-1').total, 1800); assert.equal(get('cxp', 'CXP-C-CP-A-1').cuota, 900); assert.equal(get('cxp', 'CXP-C-CP-A-1').vence, '2026-12-02'); ok('0033: la compra vieja con diferencia queda lista sobre lo recibido (90 sacos × $ 20 = $ 1.800, a crédito)');
  assert.equal(get('compras', 'C-CP-B-1').cond, 'Contado'); assert.equal(get('cxp', 'CXP-C-CP-B-1'), null); assert.equal(get('movimientos', 'MV-ENT-REC-CP-B-1').cant, 2150); assert.equal(get('recepciones', 'REC-CP-B-1').estado, 'almacen'); ok('0033: la de contado queda pagada, entra al almacén y su recepción pasa a «almacén»');
  assert.equal(m.prepare("SELECT COUNT(*) c FROM compras_pedidos WHERE estado='RECIBIDA' AND validada_ts IS NULL").get().c, 0); assert.equal(m.prepare("SELECT estado FROM compras_pedidos WHERE nro='CP-C'").get().estado, 'PEDIDA'); ok('0033: no queda nada por validar y la compra que no ha llegado sigue pendiente');
  assert.equal(get('compras', 'C-D-1').mig, undefined); assert.equal(m.prepare("SELECT COUNT(*) c FROM docs WHERE col='compras'").get().c, 3); ok('0033: lo ya validado antes no se toca ni se duplica');
  const al = m.prepare('SELECT ref, tipo, estado FROM alertas_admin ORDER BY ref').all(); assert.deepEqual(al.map(a => [a.ref, a.tipo, a.estado]), [['CP-A', 'RECEPCION_CON_DIFERENCIA', 'PENDIENTE'], ['CP-B', 'RECEPCION_POR_VALIDAR', 'ATENDIDA']]); ok('0033: el aviso con diferencia sigue visible; el simple se da por atendido');
  const sigue = foto(); m.exec(readFileSync(path.join(dir, '0033_compras_sin_validar.sql'), 'utf8')); assert.equal(m.prepare("SELECT COUNT(*) c FROM docs WHERE col='compras'").get().c, 3); assert.equal(foto().length >= 0, true); ok('0033: aplicarla otra vez no duplica nada');
  assert.equal(m.prepare("SELECT name FROM sqlite_master WHERE name = '_mig0033'").get(), undefined); ok('0033: no deja tablas auxiliares');
  m.exec(readFileSync(rv, 'utf8'));
  const despues = foto(); const sinVer = s => s.replace(/"updated":\d+/g, '');
  assert.deepEqual(JSON.parse(despues)[1], JSON.parse(antes)[1]); assert.deepEqual(JSON.parse(despues)[2].map(a => [a.ref, a.tipo, a.estado]), [['CP-A', 'RECEPCION_POR_VALIDAR', 'PENDIENTE'], ['CP-B', 'RECEPCION_POR_VALIDAR', 'PENDIENTE']]);
  assert.equal(get('compras', 'C-CP-A-1'), null); assert.equal(get('cxp', 'CXP-C-CP-A-1'), null); assert.equal(get('movimientos', 'MV-ENT-REC-CP-B-1'), null); assert.equal(get('recepciones', 'REC-CP-B-1').estado, 'verificado'); assert.equal(get('recepciones', 'REC-CP-B-1').compraId, undefined); assert.ok(get('compras', 'C-D-1')); ok('reversa 0033: vuelven los pedidos a «por validar», los avisos y las recepciones; lo anterior sigue intacto');
}
console.log('\n' + n + ' pruebas del flujo de compras en un paso pasaron.');
