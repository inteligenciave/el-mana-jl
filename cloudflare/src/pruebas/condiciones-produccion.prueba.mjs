/* Pruebas de las condiciones para producir: papa, aceite, agua, sal, químicos, almidón y grupo de turno con personal.
   El servidor rechaza abrir el turno si falta cualquiera (mensaje claro) y no hay desbloqueo para Producción ni para el Gerente.
   Uso: node src/pruebas/condiciones-produccion.prueba.mjs */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {crearDB} from './d1-falso.mjs';
import * as D from '../produccion/dominio.js';
import * as PS from '../produccion/servicio.js';
import * as IS from '../inventario/servicio.js';
import * as GS from '../rrhh/grupos-servicio.js';
import {lunesDe} from '../rrhh/grupos.js';
import {rutasProduccion} from '../produccion/rutas.js';

let n = 0; const ok = m => { n++; console.log('  ok · ' + m); };
const rechaza = async (p, re, st) => { try { await p; } catch (e) { assert.match(String(e.message), re); if (st) assert.equal(e.status, st); return e; } assert.fail('debía rechazar: ' + re); };
const db = crearDB(), raw = db.raw;
const doc = (id, o) => raw.prepare('INSERT INTO docs (col, id, data, updated) VALUES (?, ?, ?, 1)').run('empleados', id, JSON.stringify({id, ...o}));
doc('E1', {n: 'Ana', area: 'Planta'}); doc('E2', {n: 'Beto', area: 'Planta'});
const dueno = {db, rol: 'dueno'}, adm = {db, rol: 'adm'}, prod = {db, rol: 'produccion'}, rrhh = {db, rol: 'rrhh'};

assert.deepEqual(D.INSUMOS_CRITICOS.map(i => i.codigo), ['papa', 'aceite', 'agua', 'sal', 'quimicos', 'almidon', 'bolsones']);
const arts = raw.prepare('SELECT codigo FROM inv_articulos').all().map(x => x.codigo); for (const i of D.INSUMOS_CRITICOS) assert.ok(arts.includes(i.codigo), i.codigo);
ok('las 6 condiciones de materia prima existen como artículos del inventario general (la migración 0034 agrega el almidón)');

await IS.conteoInicial(adm, {conteos: D.INSUMOS_CRITICOS.map(i => ({articulo: i.codigo, cantidad: 100}))});
await GS.guardarMiembros(rrhh, {grupo_id: 1, empleados: ['E1']}); await GS.guardarMiembros(rrhh, {grupo_id: 2, empleados: ['E2']});
let a = await PS.arranque(dueno), lunes = lunesDe(a.fecha), otra = a.jornada === 'Diurno' ? 'Nocturno' : 'Diurno';
await GS.asignarSemana(rrhh, {semana: lunes, grupo_id: 1, turno: a.jornada, ambos: false}); await GS.asignarSemana(rrhh, {semana: lunes, grupo_id: 2, turno: otra, ambos: false});
a = await PS.arranque(dueno); assert.equal(a.ok, true); assert.equal(a.faltan.length, 0); assert.ok(a.insumos.every(x => x.ok && x.saldo === 100));
assert.equal(a.personal.ok, true); assert.equal(a.personal.miembros.length, 1); assert.ok(a.personal.nombre);
ok('todo disponible: la revisión da OK y trae cuánto hay de cada cosa y quiénes forman el grupo');

const salida = (art, c) => raw.prepare("INSERT INTO inv_movimientos (articulo, tipo, cantidad, origen, ref, nota, rol, ts) VALUES (?, 'SALIDA', ?, 'consumo', ?, 'prueba', 'produccion', ?)").run(art, c, 'S-' + art, Date.now() + 5);
const dicen = {papa: /Falta papa cruda\. Administración debe comprarla y Producción recibirla\./, aceite: /Falta aceite\. Administración debe comprarlo y Producción recibirlo\./, agua: /Falta agua\. Administración debe comprarla y Producción recibirla\./, sal: /Falta sal\. Administración debe comprarla y Producción recibirla\./, quimicos: /Faltan químicos\. Administración debe comprarlos y Producción recibirlos\./, almidon: /Falta almidón\. Administración debe comprarlo y Producción recibirlo\./, bolsones: /Faltan bolsones\. Administración debe comprarlos y Producción recibirlos\./};
for (const i of D.INSUMOS_CRITICOS) {
  salida(i.codigo, 100);
  const e = await rechaza(PS.iniciarProduccion(prod, {}), dicen[i.codigo], 409); assert.equal(e.extra.codigo, 'ARRANQUE_BLOQUEADO'); assert.equal(e.extra.faltan.length, 1);
  await rechaza(PS.iniciarProduccion(dueno, {}), dicen[i.codigo], 409);   // ni el Gerente puede saltarse la condición
  assert.equal(raw.prepare('SELECT COUNT(*) c FROM turnos WHERE inicio_ts IS NOT NULL').get().c, 0);
  raw.prepare("INSERT INTO inv_movimientos (articulo, tipo, cantidad, origen, ref, nota, rol, ts) VALUES (?, 'ENTRADA', 50, 'compra', ?, 'prueba', 'adm', ?)").run(i.codigo, 'C-' + i.codigo, Date.now() + 9);
  a = await PS.arranque(dueno); assert.equal(a.ok, true, 'con compra vuelve a estar disponible ' + i.codigo);
}
ok('si falta cualquiera de los 6 insumos (saldo en cero) el servidor rechaza abrir con el mensaje de Administración/Producción, aun para el Gerente; al comprar, vuelve a abrir');

const gs = raw.prepare('SELECT * FROM grupo_semana').all(), gm = raw.prepare('SELECT * FROM grupo_semana_miembros').all();
raw.exec('DELETE FROM grupo_semana; DELETE FROM grupo_semana_miembros');   // nadie armó los grupos de esta semana
a = await PS.arranque(dueno); assert.equal(a.ok, false); assert.deepEqual(a.faltan, [D.MSG_SIN_GRUPO]);
const e = await rechaza(PS.iniciarProduccion(prod, {}), /No hay grupo de turno con personal: Recursos humanos debe armar el grupo\./, 409); assert.equal(e.extra.codigo, 'ARRANQUE_BLOQUEADO');
ok('sin grupo de turno con personal: no abre y dice que Recursos humanos debe armar el grupo');

// por la ruta (API) también se rechaza, y no hay ruta para saltarse el bloqueo
const rutas = async (m, p, rol, body) => rutasProduccion(new Request('http://x' + p, {method: m, headers: {'content-type': 'application/json', 'x-rol': rol}, body: body ? JSON.stringify(body) : undefined}), {DB: db}, new URL('http://x' + p));
let r = await rutas('POST', '/api/p/turno/iniciar', 'produccion', {}); assert.equal(r.status, 409); const j = await r.json(); assert.match(JSON.stringify(j), /No hay grupo de turno con personal/);
r = await rutas('POST', '/api/p/turno/iniciar', 'dueno', {forzar: true, desbloquear: true}); assert.equal(r.status, 409);
assert.equal(raw.prepare('SELECT COUNT(*) c FROM turnos WHERE inicio_ts IS NOT NULL').get().c, 0);
ok('el intento directo por la API (también con «forzar») devuelve 409 y no crea el turno');

for (const r of gs) raw.prepare('INSERT INTO grupo_semana (semana, grupo_id, turno, quien, ts) VALUES (?,?,?,?,?)').run(r.semana, r.grupo_id, r.turno, r.quien, r.ts);
for (const r of gm) raw.prepare('INSERT INTO grupo_semana_miembros (semana, empleado_id, grupo_id, excepcion, ts) VALUES (?,?,?,?,?)').run(r.semana, r.empleado_id, r.grupo_id, r.excepcion, r.ts);
const ab = await PS.iniciarProduccion(prod, {}); assert.ok(ab.turno);
ok('con todas las condiciones cumplidas el turno abre');
const html = readFileSync(new URL('../../front/produccion/p-asistente.js', import.meta.url), 'utf8') + readFileSync(new URL('../../front/produccion/p-resumen.js', import.meta.url), 'utf8');
assert.ok(html.includes('Requisitos para producir') && html.includes('Iniciar producción') && html.includes('disabled')); ok('la pantalla muestra «Requisitos para producir» y apaga el botón');
console.log(`\n${n} pruebas de condiciones para producir pasaron.`);
