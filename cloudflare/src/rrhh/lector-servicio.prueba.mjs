/* Pruebas de «Importar del lector» contra una base en memoria (nunca toca la base real). Filas SINTÉTICAS.
   Uso: node src/rrhh/lector-servicio.prueba.mjs */
import assert from 'node:assert/strict';
import {crearDB} from '../pruebas/d1-falso.mjs';
import * as LE from './lector-servicio.js';
import {asistencia} from './turnos-servicio.js';
import {rutasRrhh} from './rutas.js';

let n = 0; const ok = m => { n++; console.log('  ok · ' + m); };
const db = crearDB(), ctx = {db, rol: 'rrhh'};
const doc = (col, id, d) => db.raw.prepare('INSERT OR REPLACE INTO docs (col, id, data, updated) VALUES (?,?,?,?)').run(col, id, JSON.stringify({id, ...d}), Date.now());
doc('ajustes', 'turnos_bonos', {horarios: {Diurno: {inicio: '07:00', fin: '17:00'}, Nocturno: {inicio: '18:00', fin: '05:00'}}});
doc('empleados', 'E1', {n: 'Ana Prueba', turno: 'Diurno', estado: 'activo', codigo_lector: '1001', pago: 'dia', tarifa: 10});
doc('empleados', 'E2', {n: 'Beto Prueba', turno: '', estado: 'activo', pago: 'dia', tarifa: 10});
doc('empleados', 'E3', {n: 'Carla Prueba', turno: 'Nocturno', estado: 'activo', pago: 'dia', tarifa: 10});
const COL = 'Person ID,Name,Department,Time,Attendance Status,Attendance Check Point,Custom Name,Data Source,Handling Type,Temperature,Abnormal';
const f = (id, t) => `'${id},X,LJC,${t},None,P,-,Original Records,-,-,-`;
const csv = [COL,
  f(1001, '2026-10-02 07:05:00'), f(1001, '2026-10-02 17:03:00'),            // Ana: clara
  f(1001, '2026-10-03 07:00:00'),                                           // Ana: una sola marca
  f(1002, '2026-10-02 08:00:00'), f(1002, '2026-10-02 16:00:00'),            // Beto: código nuevo
  f(1003, '2026-10-02 18:00:00'), f(1003, '2026-10-02 18:01:00'), f(1003, '2026-10-02 23:59:00')].join('\r\n');
const cuenta = t => db.raw.prepare(t).get().c;

const v = await LE.vista(ctx, {texto: csv});
assert.equal(v.archivo.marcas, 8); assert.equal(v.resumen.marcas.listo, 2); assert.equal(v.resumen.marcas.por_revisar, 1); assert.equal(v.resumen.marcas.codigo_nuevo, 5); assert.equal(v.codigos_nuevos.length, 2);
assert.equal(cuenta('SELECT COUNT(*) c FROM lector_marcas'), 0); assert.equal(cuenta('SELECT COUNT(*) c FROM marcas'), 0); ok('vista previa: entiende y NO guarda nada');
await assert.rejects(LE.vista({db, rol: 'ventas'}, {texto: csv}), /Solo Gerencia y N/); ok('otros puestos no pueden');

let g = await LE.importar(ctx, {texto: csv});
assert.equal(g.guardado.marcas_nuevas, 8); assert.equal(g.guardado.dias_confirmados, 1); assert.equal(cuenta('SELECT COUNT(*) c FROM lector_marcas'), 8);
assert.equal(cuenta("SELECT COUNT(*) c FROM marcas WHERE origen = 'lector'"), 1); ok('importar: marcas crudas guardadas y solo el día claro pasa a asistencia');
const a = await asistencia(ctx, '2026-10-1'); assert.equal(a.personas.find(p => p.empleado_id === 'E1').dias, 1); ok('lo confirmado alimenta la asistencia que ya existe (quincena)');

g = await LE.importar(ctx, {texto: csv});
assert.equal(g.guardado.marcas_nuevas, 0); assert.equal(g.guardado.marcas_repetidas, 8); assert.equal(cuenta('SELECT COUNT(*) c FROM lector_marcas'), 8); assert.equal(cuenta('SELECT COUNT(*) c FROM marcas'), 1); ok('importar dos veces el mismo archivo no duplica nada');

// Código nuevo: se asocia y los días que esperaban se entienden solos
await assert.rejects(LE.asociarCodigo(ctx, {codigo: '1002', empleado_id: 'E1'}), /ya tiene el código/);
await assert.rejects(LE.asociarCodigo(ctx, {codigo: '1001', empleado_id: 'E2'}), /ya es de/); ok('un código no se reparte entre dos personas');
let r = await LE.asociarCodigo(ctx, {codigo: '1002', empleado_id: 'E2'}); assert.equal(r.pendientes, 1); assert.equal(r.confirmados, 0);
let pe = await LE.pendientes(ctx); const dBeto = pe.dias.find(d => d.codigo === '1002'); assert.equal(dBeto.estado, 'sin_turno'); assert.equal(dBeto.empleado, 'Beto Prueba'); ok('al asociar, el código queda en la ficha y su día pasa a «sin turno» (Beto no tiene turno)');
r = await LE.asociarCodigo(ctx, {codigo: '1003', empleado_id: 'E3'}); assert.equal(r.pendientes, 1);
assert.equal(JSON.parse(db.raw.prepare("SELECT data FROM docs WHERE col='empleados' AND id='E3'").get().data).codigo_lector, '1003'); ok('el código se recuerda en la ficha para la próxima vez');

// Resolver
assert.equal(dBeto.turno_sugerido, 'Diurno');
r = await LE.resolver(ctx, {id: dBeto.id, accion: 'confirmar'}); assert.equal(r.estado, 'confirmado');
const mb = db.raw.prepare("SELECT * FROM marcas WHERE empleado_id = 'E2'").get(); assert.equal(mb.turno, 'Diurno'); assert.ok(mb.salida_ts > mb.entrada_ts); ok('confirmar un día «sin turno»: usa el turno que se dedujo de las marcas');
await assert.rejects(LE.resolver(ctx, {id: dBeto.id, accion: 'descartar'}), /ya fue/); ok('un día ya decidido no se vuelve a decidir');
const d3 = (await LE.pendientes(ctx)).dias.find(d => d.codigo === '1003'); assert.equal(d3.n, 3); assert.equal(d3.propuesta, true);
r = await LE.resolver(ctx, {id: d3.id, accion: 'confirmar', entrada: '18:00', salida: '05:00'}); assert.equal(r.estado, 'confirmado'); assert.equal(r.salida_ts - r.entrada_ts, 11 * 3600e3); ok('3 marcas: Nómina corrige entrada y salida y confirma (una salida «antes» de la entrada es de la madrugada siguiente: turno nocturno)');
const dAna = (await LE.pendientes(ctx)).dias.find(d => d.codigo === '1001'); assert.equal(dAna.n, 1);
r = await LE.resolver(ctx, {id: dAna.id, accion: 'descartar'}); assert.equal(r.estado, 'descartado'); assert.equal((await LE.pendientes(ctx)).dias.length, 0); ok('descartar un día con una sola marca');
const v2 = await LE.vista(ctx, {texto: csv}); assert.equal(v2.resumen.marcas.ya_guardado, 7); assert.equal(v2.resumen.marcas.descartado, 1); ok('al volver a ver el archivo, lo ya decidido sale como «ya guardado» / «descartado»');
assert.ok(cuenta("SELECT COUNT(*) c FROM auditoria_sistema WHERE ent = 'lector'") >= 6); ok('todo queda en la auditoría');

// Día con marcas anotadas a mano: no se pisa
db.raw.prepare("INSERT INTO marcas (empleado_id, fecha, entrada_ts, salida_ts, turno, quien, creado_ts) VALUES ('E1','2026-10-05',1,2,'Diurno','rrhh',1)").run();
const csv2 = [COL, f(1001, '2026-10-05 06:00:00'), f(1001, '2026-10-05 14:00:00')].join('\n');
g = await LE.importar(ctx, {texto: csv2}); assert.equal(g.guardado.dias_confirmados, 0); assert.equal(g.guardado.dias_pendientes, 1); assert.match(g.dias[0].motivo, /anotadas ese día/); ok('si ya hay marcas a mano ese día, queda «por revisar» (no se pisa)');

// Ajuste de minutos
await assert.rejects(LE.guardarAjustes(ctx, {min_entre_marcas: -3}), /entre 0 y 600/);
assert.equal((await LE.guardarAjustes(ctx, {min_entre_marcas: ''})).min_entre_marcas, null); assert.equal((await LE.guardarAjustes(ctx, {min_entre_marcas: 30})).min_entre_marcas, 30); ok('ajuste visible: minutos mínimos entre marcas (vacío = no se usa)');

// Rutas: permisos y envío en JSON
const llamar = (rol, m, p, b) => rutasRrhh(new Request('http://x' + p, {method: m, headers: {'x-rol': rol, 'content-type': 'application/json'}, body: b ? JSON.stringify(b) : undefined}), {DB: db}, new URL('http://x' + p));
assert.equal((await llamar('ventas', 'POST', '/api/h/lector/vista', {texto: csv})).status, 403); assert.equal((await llamar('adm', 'GET', '/api/h/lector/pendientes')).status, 403); assert.equal((await llamar('dueno', 'GET', '/api/h/lector/pendientes')).status, 200); ok('rutas: solo Gerencia y Nómina');
const rj = await llamar('rrhh', 'POST', '/api/h/lector/marcas', {marcas: [{codigo: '1001', momento: '2026-10-06 06:00:00'}, {codigo: '1001', momento: '2026-10-06 14:00:00'}]}); const jj = await rj.json();
assert.equal(rj.status, 201); assert.equal(jj.guardado.dias_confirmados, 1); assert.equal(cuenta("SELECT COUNT(*) c FROM lector_marcas WHERE fuente = 'envio'"), 2); ok('envío en JSON usa la misma lógica');
console.log(`\n${n} pruebas de «Importar del lector» pasaron.`);
