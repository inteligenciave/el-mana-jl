/* Prueba de las barras de «Inventario de producción» (Gerencia): semáforo verde/amarillo/rojo/sin mínimo y fijar el mínimo. Base en memoria, datos inventados.
   Uso: node src/pruebas/barras-inventario.prueba.mjs */
import assert from 'node:assert/strict';
import {crearDB} from './d1-falso.mjs';
import * as ID from '../inventario/dominio.js';
import * as IS from '../inventario/servicio.js';
import {rutasInventario} from '../inventario/rutas.js';

let n = 0; const ok = m => { n++; console.log('  ok · ' + m); };
// semáforo: umbral amarillo = 1,5 veces el mínimo
assert.equal(ID.UMBRAL_AMARILLO, 1.5);
assert.equal(ID.nivelInsumo(500, 100), 'verde'); assert.equal(ID.nivelInsumo(150.01, 100), 'verde');
assert.equal(ID.nivelInsumo(150, 100), 'amarillo'); assert.equal(ID.nivelInsumo(100.5, 100), 'amarillo');
assert.equal(ID.nivelInsumo(100, 100), 'rojo'); assert.equal(ID.nivelInsumo(0, 100), 'rojo'); assert.equal(ID.nivelInsumo(-3, 100), 'rojo');
assert.equal(ID.nivelInsumo(50, 0), 'sin_minimo'); assert.equal(ID.nivelInsumo(50, null), 'sin_minimo');
ok('nivelInsumo: verde, amarillo (hasta 1,5×), rojo (en o bajo el mínimo) y sin mínimo');
assert.deepEqual(ID.INSUMOS_ARRANQUE, ['papa', 'aceite', 'agua', 'sal', 'quimicos', 'almidon']); ok('los 6 insumos de arranque');

const db = crearDB(), dueno = {db, rol: 'dueno'}, adm = {db, rol: 'adm'}, prod = {db, rol: 'produccion'};
let r = await IS.ver(dueno); assert.ok(r.articulos.every(a => a.nivel === 'sin_conteo')); ok('sin conteo inicial: nivel sin_conteo (la barra avisa que falta el conteo)');
await IS.conteoInicial(dueno, {conteos: [{articulo: 'papa', cantidad: 1000}, {articulo: 'aceite', cantidad: 120}, {articulo: 'agua', cantidad: 300}, {articulo: 'sal', cantidad: 40}, {articulo: 'quimicos', cantidad: 10}, {articulo: 'almidon', cantidad: 5}]});
r = await IS.ver(dueno); assert.ok(r.articulos.every(a => a.nivel === 'sin_minimo')); ok('con conteo y sin mínimos: todo sin_minimo (gris, «Defina el mínimo»)');
const ruta = async (rol, m, u, body) => rutasInventario(new Request('http://x' + u, {method: m, headers: {'x-rol': rol, 'content-type': 'application/json'}, body: body ? JSON.stringify(body) : undefined}), {DB: db}, new URL('http://x' + u));
const p = async (rol, cod, minimo) => ruta(rol, 'PUT', '/api/v/inventario/articulos/' + cod, {minimo});
for (const [c, m] of [['papa', 400], ['aceite', 100], ['agua', 200], ['sal', 40], ['quimicos', 20]]) assert.equal((await p('dueno', c, m)).status, 200);
const g = await (await ruta('dueno', 'GET', '/api/v/inventario')).json(); const niv = Object.fromEntries(g.articulos.map(a => [a.codigo, a.nivel]));
assert.deepEqual([niv.papa, niv.aceite, niv.agua, niv.sal, niv.quimicos, niv.almidon], ['verde', 'amarillo', 'amarillo', 'rojo', 'rojo', 'sin_minimo']);
ok('endpoint GET devuelve nivel por insumo (papa verde, aceite y agua amarillo, sal y químicos rojo, almidón sin mínimo)');
let x = await p('dueno', 'papa', -1); assert.equal(x.status, 400); x = await p('dueno', 'papa', 'abc'); assert.equal(x.status, 400); x = await p('dueno', 'nada', 5); assert.equal(x.status, 404); assert.equal((await p('produccion', 'papa', 5)).status, 403);
ok('PUT mínimo: rechaza negativo, texto, artículo inexistente y Producción');
await p('dueno', 'papa', 1000); assert.equal((await IS.ver(dueno)).articulos.find(a => a.codigo === 'papa').nivel, 'rojo'); await p('dueno', 'papa', 0); assert.equal((await IS.ver(dueno)).articulos.find(a => a.codigo === 'papa').nivel, 'sin_minimo');
ok('cambiar el mínimo cambia el color; 0 quita el aviso');
console.log(`\n${n} grupos de pruebas pasaron.`);
