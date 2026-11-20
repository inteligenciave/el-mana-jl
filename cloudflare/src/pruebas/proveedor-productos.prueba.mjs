/* Pruebas de «lo que trae cada proveedor»: migración 0036 (y su reversa), insumos del inventario que se compran directo (agua, almidón, empaque)
   y que la recepción los suma al inventario general. Base en memoria, datos inventados, tasa fija.
   Uso: node src/pruebas/proveedor-productos.prueba.mjs */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {crearDB} from './d1-falso.mjs';
import * as CS from '../compras/servicio.js';
import * as RC from '../compras/recepcion-servicio.js';

let n = 0; const ok = m => { n++; console.log('  ok · ' + m); };
const rechaza = async (p, re, st) => { try { await p; } catch (e) { assert.match(String(e.message), re); if (st) assert.equal(e.status, st); return e; } assert.fail('debía rechazar: ' + re); };
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sql = f => readFileSync(path.join(raiz, f), 'utf8');
const db = crearDB(), raw = db.raw;
const hoy = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10);
raw.prepare("INSERT INTO config (clave, valor) VALUES ('tasa_ultimo_intento', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor").run(new Date().toISOString());
raw.prepare("INSERT INTO tasas_bcv (fecha, valor, fuente, obtenida_en, origen) VALUES (?,?,?,?,'DEV')").run(hoy, 500, 'prueba', 'x');
const doc = (col, id, o) => raw.prepare('INSERT INTO docs (col, id, data, updated) VALUES (?, ?, ?, 1)').run(col, id, JSON.stringify({id, ...o}));
const get = (col, id) => JSON.parse(raw.prepare('SELECT data FROM docs WHERE col=? AND id=?').get(col, id).data);
doc('proveedores', 'PT1', {nombre: 'Proveedor Papa (prueba)', tipo: 'insumo', rubro: 'papa cruda', cond: 'Contado', prueba: true});
doc('proveedores', 'PT3', {nombre: 'Proveedor Agua (prueba)', tipo: 'insumo', rubro: 'agua', cond: 'Contado', prueba: true});
doc('proveedores', 'PT6', {nombre: 'Proveedor Almidón (prueba)', tipo: 'insumo', rubro: 'almidón', cond: 'Contado', prueba: true});
doc('proveedores', 'PT7', {nombre: 'Proveedor Empaque (prueba)', tipo: 'insumo', rubro: 'material de empaque', cond: 'Contado', prueba: true});
doc('proveedores', 'PG', {nombre: 'Repuestos', tipo: 'general', rubro: 'Repuestos de flota', cond: 'Contado'});
doc('proveedores', 'PYA', {nombre: 'Ya con lista', tipo: 'insumo', rubro: 'agua', cond: 'Contado', trae: [{id: 'INV:sal', ref: 2}]});
doc('productos', 'PAPA-cruda', {tipo: 'papa', n: 'Papa cruda', cat: 'Papa cruda', sk: 'Papa cruda', prov: 'PT1'});
doc('productos', 'INS-aceite', {tipo: 'insumo', n: 'Aceite vegetal', cat: 'Aceite', sk: 'Aceite', prov: 'PT1'});

// ---- Migración 0036 ----
raw.exec(sql('migrations/0036_proveedor_trae.sql'));
const ids = id => get('proveedores', id).trae.map(t => t.id);
assert.deepEqual(ids('PT1').sort(), ['INS-aceite', 'PAPA-cruda']); assert.deepEqual(ids('PT3'), ['INV:agua']); assert.deepEqual(ids('PT6'), ['INV:almidon']); assert.deepEqual(ids('PT7'), ['INV:empaque']); ok('migración: cada proveedor queda con lo que ya traía (por «prov» y por su texto): agua, almidón y empaque marcados');
assert.deepEqual(get('proveedores', 'PG').trae, []); assert.equal(get('proveedores', 'PG').rubro, 'Repuestos de flota'); ok('un proveedor de compras generales queda con lista vacía y conserva su texto');
assert.deepEqual(get('proveedores', 'PYA').trae, [{id: 'INV:sal', ref: 2}]); ok('lo que ya tenía lista no se toca');
assert.equal(get('proveedores', 'PT3').rubro, 'agua'); assert.equal(get('proveedores', 'PT3').prueba, true); assert.equal(get('productos', 'PAPA-cruda').prov, 'PT1'); ok('no se pierde nada: texto, marca de prueba y «prov» de los productos siguen igual');
const antes = JSON.stringify(raw.prepare("SELECT id, data FROM docs WHERE col='proveedores' ORDER BY id").all()); raw.exec(sql('migrations/0036_proveedor_trae.sql'));
assert.equal(JSON.stringify(raw.prepare("SELECT id, data FROM docs WHERE col='proveedores' ORDER BY id").all()), antes); ok('aplicarla dos veces no cambia nada');
raw.exec(sql('reversa/0036_proveedor_trae_reversa.sql'));
assert.equal(get('proveedores', 'PT3').trae, undefined); assert.equal(get('proveedores', 'PT3').rubro, 'agua'); ok('la reversa quita la lista y deja el resto intacto');
raw.exec(sql('migrations/0036_proveedor_trae.sql'));

// ---- Insumos directos y compra de agua ----
raw.prepare("INSERT INTO bancos (id, nombre, moneda, cuenta_numero, cuenta_titular, telefono, cedula, rif, activo, creado_ts) VALUES (1, 'Banco de prueba', 'USD', '0102', 'Prueba', '0414-1234567', 'V-12345678', 'J-12345678-9', 1, 1)").run();
const adm = {db, rol: 'adm'}, prod = {db, rol: 'produccion'};
const ins = (await CS.insumosDirectos(adm)).insumos.map(x => x.id).sort();
assert.deepEqual(ins, ['INV:agua', 'INV:almidon', 'INV:bolsa-1', 'INV:bolsa-2', 'INV:bolsa-3', 'INV:bolsones', 'INV:quimicos', 'INV:sal']); ok('la lista de insumos directos trae agua, almidón, bolsones y una bolsa por presentación (no «sin presentación»); no repite lo que ya tiene producto (aceite) ni la papa');
await rechaza(CS.insumosDirectos(prod), /Solo Administración/, 403); ok('Producción no ve esa lista');
const base = {proveedor_id: 'PT3', fecha: hoy, condicion: 'CREDITO', plazo_dias: 15};
const c = await CS.crear(adm, {...base, factura: 'A-1', lineas: [{producto_id: 'INV:agua', cantidad: 5000, precio_usd: 0.02}]});
assert.equal(c.lineas[0].unidad, 'L'); assert.equal(c.lineas[0].producto, 'Agua'); assert.equal(c.total_usd, 100); ok('se compra agua directo, sin producto en el catálogo: 5.000 L × $ 0,02 = $ 100');
await rechaza(CS.crear(adm, {...base, factura: 'A-2', lineas: [{producto_id: 'INV:papa', cantidad: 1, precio_usd: 1}]}), /no está en el catálogo/, 400);
await rechaza(CS.crear(adm, {...base, factura: 'A-3', lineas: [{producto_id: 'INV:nada', cantidad: 1, precio_usd: 1}]}), /no está en el catálogo/, 400); ok('la papa no se compra como insumo directo (va por saco) y un insumo inexistente se rechaza');
const saldo = cod => raw.prepare("SELECT COALESCE(SUM(CASE WHEN tipo='ENTRADA' THEN cantidad ELSE -cantidad END),0) s FROM inv_movimientos WHERE articulo=?").get(cod).s;
assert.equal(saldo('agua'), 0);
const r = await RC.recibir(prod, {nro: c.nro, lineas: [{producto_id: 'INV:agua', recibido: 5000}]});
assert.equal(r.con_diferencia, false); assert.equal(saldo('agua'), 5000); ok('al recibir, el inventario general de agua sube 5.000 L');
const cp = raw.prepare("SELECT data FROM docs WHERE col='compras'").all().map(x => JSON.parse(x.data)).filter(x => x.item === 'Agua'); assert.equal(cp.length, 1); assert.equal(cp[0].qf, 5000); assert.equal(cp[0].unidad, 'L');
const cx = raw.prepare("SELECT data FROM docs WHERE col='cxp'").all().map(x => JSON.parse(x.data)); assert.equal(cx.length, 1); assert.equal(cx[0].total, 100); ok('queda la compra y la deuda con el proveedor sobre lo recibido ($ 100)');
assert.equal(raw.prepare("SELECT COUNT(*) c FROM docs WHERE col='movimientos'").get().c, 0); ok('no se ensucia el almacén viejo con un artículo «agua»');
const c2 = await CS.crear(adm, {proveedor_id: 'PT7', fecha: hoy, condicion: 'CONTADO', id_banco: 1, factura: 'E-1', lineas: [{producto_id: 'INV:bolsa-1', cantidad: 1000, precio_usd: 0.05}, {producto_id: 'INV:almidon', cantidad: 50, precio_usd: 1.2}]});
const lin = [{producto_id: 'INV:bolsa-1', recibido: 900}, {producto_id: 'INV:almidon', recibido: 50}];
const e = await rechaza(RC.recibir(prod, {nro: c2.nro, lineas: lin}), /no es lo que se compró/, 409); assert.equal(e.extra.codigo, 'DIFERENCIA');
await RC.recibir(prod, {nro: c2.nro, lineas: lin, confirmar_diferencia: true, motivo: 'Faltaron 100 bolsas'});
assert.equal(saldo('bolsa-1'), 900); assert.equal(saldo('almidon'), 50); ok('bolsa de presentación (und) y almidón (kg) suman al inventario; si llega distinto sigue saltando la alarma de diferencia');
console.log('\n' + n + ' comprobaciones correctas');
