/* Prueba de «Producto nuevo» en el cuadro del proveedor: permisos, validación, nombre repetido, insumo → inventario (se compra y se recibe), papa → catálogo.
   Base en memoria, datos inventados. Uso: node src/pruebas/producto-nuevo.prueba.mjs */
import assert from 'node:assert/strict';
import {crearDB} from './d1-falso.mjs';
import * as CS from '../compras/servicio.js';
import * as RC from '../compras/recepcion-servicio.js';
import * as IS from '../inventario/servicio.js';
import {rutasCompras} from '../compras/rutas.js';

let n = 0; const ok = m => { n++; console.log('  ok · ' + m); };
const db = crearDB(), raw = db.raw;
const hoy = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10);
raw.prepare("INSERT INTO config (clave, valor) VALUES ('tasa_ultimo_intento', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor").run(new Date().toISOString());
raw.prepare("INSERT INTO tasas_bcv (fecha, valor, fuente, obtenida_en, origen) VALUES (?,?,?,?,'DEV')").run(hoy, 500, 'prueba', 'x');
raw.prepare('INSERT INTO docs (col, id, data, updated) VALUES (?, ?, ?, 1)').run('proveedores', 'P4', JSON.stringify({id: 'P4', nombre: 'Insumos SA', tipo: 'insumo', cond: 'Contado'}));
raw.prepare("INSERT INTO bancos (id, nombre, moneda, cuenta_numero, cuenta_titular, telefono, cedula, rif, activo, creado_ts) VALUES (1, 'Banco de prueba', 'USD', '0102', 'Prueba', '0414-1234567', 'V-12345678', 'J-12345678-9', 1, 1)").run();
const ruta = (rol, body) => rutasCompras(new Request('http://x/api/v/compras/productos', {method: 'POST', headers: {'x-rol': rol, 'content-type': 'application/json'}, body: JSON.stringify(body)}), {DB: db}, new URL('http://x/api/v/compras/productos'));
const post = async (rol, body) => { const r = await ruta(rol, body); return {s: r.status, j: await r.json()}; };

for (const rol of ['produccion', 'ventas', 'rrhh', 'cliente']) { const r = await post(rol, {nombre: 'Vinagre', tipo: 'insumo', unidad: 'litro'}); assert.ok(r.s === 403 || r.s === 401, rol + ' → ' + r.s); }
assert.equal((await post('produccion', {nombre: 'Vinagre', tipo: 'insumo', unidad: 'litro'})).s, 403);
assert.equal(raw.prepare("SELECT COUNT(*) c FROM inv_articulos WHERE nombre = 'Vinagre'").get().c, 0); ok('Producción y otros puestos reciben 403 y no se crea nada');

for (const b of [{nombre: '', tipo: 'insumo', unidad: 'kg'}, {nombre: 'X', tipo: 'insumo', unidad: 'kg'}, {nombre: 'Vinagre', tipo: 'general', unidad: 'kg'}, {nombre: 'Vinagre', tipo: 'insumo', unidad: 'tonel'}, {nombre: 'a'.repeat(61), tipo: 'papa', unidad: 'saco'}]) assert.equal((await post('adm', b)).s, 400);
ok('valida nombre, tipo y unidad (400)');

let r = await post('adm', {nombre: '  Vinagre   blanco ', tipo: 'insumo', unidad: 'litro'});
assert.equal(r.s, 201); assert.equal(r.j.producto.id, 'INV:vinagre-blanco'); assert.equal(r.j.producto.n, 'Vinagre blanco');
const a = raw.prepare("SELECT * FROM inv_articulos WHERE codigo = 'vinagre-blanco'").get();
assert.equal(a.unidad, 'L'); assert.equal(a.minimo, 0); assert.equal(a.activo, 1); ok('Administración crea un insumo: artículo del inventario (L, mínimo 0, activo)');
const inv = await IS.ver({db, rol: 'dueno'}); assert.ok(inv.articulos.some(x => x.codigo === 'vinagre-blanco')); ok('el insumo nuevo sale en Existencias del inventario');
const lst = await CS.insumosDirectos({db, rol: 'adm'}); assert.ok(lst.insumos.some(x => x.id === 'INV:vinagre-blanco')); ok('y en la lista de insumos que se pueden comprar');

for (const nom of ['vinagre BLANCO', 'Vinagre blanco', 'Agua', 'AGUA', 'Almidón', 'almidon', 'Papa cruda']) { r = await post('dueno', {nombre: nom, tipo: 'insumo', unidad: 'kg'}); assert.equal(r.s, 409, nom); assert.equal(r.j.codigo, 'NOMBRE_REPETIDO'); }
ok('nombre repetido (sin mayúsculas ni tildes, también contra los de fábrica) → 409, sin duplicar');

r = await post('dueno', {nombre: 'Papa pastusa', tipo: 'papa', unidad: 'saco'});
assert.equal(r.s, 201); assert.equal(r.j.producto.id, 'PAPA-papa-pastusa');
const d = JSON.parse(raw.prepare("SELECT data FROM docs WHERE col = 'productos' AND id = 'PAPA-papa-pastusa'").get().data); assert.equal(d.tipo, 'papa'); assert.equal(d.n, 'Papa pastusa');
assert.equal((await post('dueno', {nombre: 'PAPA PASTUSA', tipo: 'insumo', unidad: 'kg'})).s, 409); ok('Gerencia crea una papa en el catálogo; el nombre no se repite entre tipos');
assert.equal(raw.prepare("SELECT COUNT(*) c FROM auditoria_sistema WHERE accion = 'agregó un producto nuevo'").get().c, 2); ok('queda anotado en la auditoría');

// comprar y recibir el insumo nuevo
const c = await CS.crear({db, rol: 'adm'}, {proveedor_id: 'P4', factura: 'F-1', fecha: hoy, condicion: 'CONTADO', id_banco: 1, lineas: [{producto_id: 'INV:vinagre-blanco', cantidad: 10, precio_usd: 2}]});
assert.equal(c.lineas[0].unidad, 'L');
await RC.recibir({db, rol: 'produccion'}, {nro: c.nro, lineas: [{producto_id: 'INV:vinagre-blanco', recibido: 10}]});
const mv = raw.prepare("SELECT COALESCE(SUM(cantidad),0) s FROM inv_movimientos WHERE articulo = 'vinagre-blanco'").get(); assert.equal(mv.s, 10); ok('el insumo nuevo se compra y se recibe: suma 10 L al inventario');
// papa nueva se puede comprar
const c2 = await CS.crear({db, rol: 'adm'}, {proveedor_id: 'P4', factura: 'F-2', fecha: hoy, condicion: 'CONTADO', id_banco: 1, lineas: [{producto_id: 'PAPA-papa-pastusa', cantidad: 5, precio_usd: 20}]});
assert.equal(c2.lineas[0].unidad, 'saco'); ok('la papa nueva se puede comprar');
console.log('\n' + n + ' grupos de pruebas pasaron.');
