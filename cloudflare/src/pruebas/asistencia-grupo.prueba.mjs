/* Pruebas de «Marcar entrada a todo el grupo» y «Quitar entrada». Base en memoria, datos inventados.
   Uso: node src/pruebas/asistencia-grupo.prueba.mjs */
import assert from 'node:assert/strict';
import {crearDB} from './d1-falso.mjs';
import * as T from '../rrhh/turnos.js';
import * as G from '../rrhh/grupos.js';
import * as GS from '../rrhh/grupos-servicio.js';
import * as S from '../rrhh/servicio.js';
import {rutasRrhh} from '../rrhh/rutas.js';

let n = 0; const ok = m => { n++; console.log('  ok · ' + m); };
const db = crearDB(), raw = db.raw, nom = {db, rol: 'rrhh'};
const doc = (id, d) => raw.prepare("INSERT OR REPLACE INTO docs (col, id, data, updated) VALUES ('empleados', ?, ?, ?)").run(id, JSON.stringify({id, ...d}), Date.now());
for (const [id, nombre] of [['E1', 'Ana Prueba'], ['E2', 'Beto Prueba'], ['E3', 'Carla Prueba'], ['E4', 'Dani Prueba']]) doc(id, {n: nombre, turno: '', estado: 'activo', pago: 'dia', tarifa: 20});
doc('E5', {n: 'Eli Retirada', turno: 'Diurno', estado: 'retirado', pago: 'dia', tarifa: 20});
const lunes = G.lunesDe(new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10));
await GS.guardarMiembros(nom, {grupo_id: 1, empleados: ['E1', 'E2']}); await GS.guardarMiembros(nom, {grupo_id: 2, empleados: ['E3', 'E4']});
await GS.asignarSemana(nom, {semana: lunes, grupo_id: 1, turno: 'Diurno'});
const rq = (rol, p, body) => rutasRrhh(new Request('http://x/api/h' + p, {method: 'POST', headers: {'x-rol': rol, 'content-type': 'application/json'}, body: JSON.stringify(body)}), {DB: db}, new URL('http://x/api/h' + p));

await assert.rejects(S.entradaGrupo({db, rol: 'ventas'}, {turno: 'Diurno'}), /./); ok('un puesto sin permiso de marcar no puede marcar al grupo');
await assert.rejects(S.entradaGrupo(nom, {turno: 'Tarde'}), e => e.status === 400); ok('el turno debe ser Diurno o Nocturno');
await S.entrada(nom, {empleado_id: 'E1'});
const r = await S.entradaGrupo(nom, {turno: 'Diurno'});
assert.equal(r.marcadas, 1); assert.deepEqual(r.nombres, ['Beto Prueba']); ok('marca solo a quien falta del turno: Ana ya estaba, el otro grupo y la persona retirada no se tocan');
assert.equal(raw.prepare('SELECT COUNT(*) c FROM marcas').get().c, 2); assert.equal(raw.prepare("SELECT COUNT(*) c FROM marcas WHERE origen IS NOT NULL").get().c, 0); ok('las marcas quedan a mano (sin origen del lector)');
await assert.rejects(S.entradaGrupo(nom, {turno: 'Diurno'}), e => e.status === 409 && e.extra.codigo === 'NADIE_POR_MARCAR'); ok('si todos ya tienen marca avisa y no repite');
const n2 = (await S.entradaGrupo(nom, {turno: 'Nocturno'})).marcadas; assert.equal(n2, 2); ok('el otro turno se marca aparte (Carla y Dani)');
assert.ok(raw.prepare("SELECT COUNT(*) c FROM auditoria_sistema WHERE accion = 'marcó entrada'").get().c >= 4); ok('queda una auditoría por persona');
const q = await S.quitarEntrada(nom, {empleado_id: 'E2'}); assert.equal(q.nombre, 'Beto Prueba');
assert.equal(raw.prepare("SELECT COUNT(*) c FROM marcas WHERE empleado_id = 'E2'").get().c, 0); assert.equal(raw.prepare("SELECT COUNT(*) c FROM auditoria_sistema WHERE accion = 'quitó la entrada marcada'").get().c, 1); ok('quitar la entrada de quien faltó la borra y lo audita');
await assert.rejects(S.quitarEntrada(nom, {empleado_id: 'E2'}), e => e.status === 409 && e.extra.codigo === 'SIN_ENTRADA'); ok('quitar dos veces avisa');
await S.entrada(nom, {empleado_id: 'E2'}); await S.salida(nom, {empleado_id: 'E2'});
await assert.rejects(S.quitarEntrada(nom, {empleado_id: 'E2'}), e => e.status === 409); ok('quien ya salió no se puede desmarcar (las horas trabajadas no se borran)');
raw.prepare("INSERT INTO marcas (empleado_id, fecha, entrada_ts, salida_ts, turno, quien, creado_ts, origen) VALUES ('E3','2000-01-01',?, NULL,'Diurno','rrhh',1,'lector')").run(Date.now() - 1000);
raw.prepare("DELETE FROM marcas WHERE empleado_id = 'E3' AND origen IS NULL").run();
await assert.rejects(S.quitarEntrada(nom, {empleado_id: 'E3'}), e => e.extra.codigo === 'ES_DEL_LECTOR'); ok('la marca que vino del lector no se quita desde aquí');
const h = await S.hoy(nom); assert.equal(h.trabajadores.find(x => x.empleado_id === 'E1').a_mano, true); ok('la lista de hoy dice qué marcas son a mano');
const rr = await rq('rrhh', '/entrada/grupo', {turno: 'Diurno'}); assert.equal(rr.status, 409);
assert.equal((await rq('rrhh', '/entrada/quitar', {empleado_id: 'E1'})).status, 200); assert.equal((await rq('ventas', '/entrada/quitar', {empleado_id: 'E4'})).status, 403); ok('rutas POST /entrada/grupo y /entrada/quitar con permisos');
console.log(`\n${n} pruebas de asistencia por grupo pasaron.`);
