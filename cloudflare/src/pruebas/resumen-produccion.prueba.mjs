/* Prueba del resumen de Producción por periodo (Turno, Día, Semana, Mes): kilos, bultos de papa y paquetes de salsa, merma por etapa,
   papa tomada, rendimiento, personas y turnos cerrados; sin dinero. Base en memoria, datos inventados.
   Uso: node src/pruebas/resumen-produccion.prueba.mjs */
import assert from 'node:assert/strict';
import {crearDB} from './d1-falso.mjs';
import * as PS from '../produccion/servicio.js';
import {rutasProduccion} from '../produccion/rutas.js';

let n = 0; const ok = m => { n++; console.log('  ok · ' + m); };
const db = crearDB(), raw = db.raw, dueno = {db, rol: 'dueno'}, prod = {db, rol: 'produccion'}, emp = {db, rol: 'empaque'}, ventas = {db, rol: 'ventas'};
const hoy = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10);
const rechaza = async (p, re, st) => { try { await p; } catch (e) { assert.match(String(e.message), re); if (st) assert.equal(e.status, st); return; } assert.fail('debía rechazar'); };

// vacío: sin turnos no hay ceros raros ni errores
let r = await PS.resumenPeriodo(prod, {periodo: 'turno'}); assert.equal(r.turnos, 0); assert.equal(r.turno, null); assert.equal(r.produccion.rendimiento_pct, null); assert.deepEqual(r.merma_etapas, []);
r = await PS.resumenPeriodo(prod, {periodo: 'mes'}); assert.equal(r.turnos, 0); assert.equal(r.personas, 0); ok('sin turnos: todo en cero y porcentajes en null (la pantalla muestra «Sin datos»)');

raw.prepare("INSERT INTO productos (id_producto, codigo_sku, nombre, categoria) VALUES (901, 'PX1', 'Papas prueba', 'PAPAS'), (902, 'SX1', 'Salsa prueba', 'SALSAS')").run();
const turno = (id, fecha, jornada, estado, papa, empacado, mc) => {
  raw.prepare("INSERT INTO turnos (id_turno, fecha, estado, abierto_ts, abierto_rol, jornada, fecha_jornada) VALUES (?, ?, ?, 1, 'produccion', ?, ?)").run(id, fecha, estado, jornada, fecha);
  raw.prepare("INSERT INTO movimientos_proceso (id_turno, etapa, sentido, kilos, ts) VALUES (?, 'recepcion', 'ENTRA', ?, 1)").run(id, papa);
  raw.prepare("INSERT INTO movimientos_proceso (id_turno, etapa, sentido, kilos, ts) VALUES (?, 'empacado', 'ENTRA', ?, 1)").run(id, empacado);
  if (mc != null) raw.prepare("INSERT INTO merma_consolidada (id_turno, tomados_kg, a_empaque_kg, calculada_kg, kilos, ts) VALUES (?, ?, ?, ?, ?, 1)").run(id, papa, empacado, papa - empacado, mc);
};
const lun = new Date(hoy + 'T00:00:00Z'); lun.setUTCDate(lun.getUTCDate() - ((lun.getUTCDay() + 6) % 7)); const lunes = lun.toISOString().slice(0, 10);
const ayer = new Date(hoy + 'T00:00:00Z'); ayer.setUTCDate(ayer.getUTCDate() - 40); const viejo = ayer.toISOString().slice(0, 10);
turno(1, viejo, 'Diurno', 'CERRADO', 1000, 400, 600);
turno(2, hoy, 'Diurno', 'CERRADO', 800, 300, 500);
turno(3, hoy, 'Nocturno', 'ABIERTO', 200, 100, null);
raw.prepare("INSERT INTO empaque_turno (id_turno, id_producto, bultos, estado, rol, ts) VALUES (2, 901, 12, 'VIGENTE', 'empaque', 1), (2, 902, 30, 'VIGENTE', 'empaque', 1), (3, 901, 5, 'VIGENTE', 'empaque', 1), (3, 901, 7, 'ANULADO', 'empaque', 1)").run();
raw.prepare("INSERT INTO mermas_etapa (id_turno, etapa, origen, clase, kilos, unidad, texto, estado, ts) VALUES (3, 'lavado', 'cierre', 'MERMA', 40, 'kg', 'x', 'VIGENTE', 1)").run();

r = await PS.resumenPeriodo(prod, {periodo: 'turno'});   // el último turno
assert.equal(r.turnos, 1); assert.equal(r.turno.estado, 'ABIERTO'); assert.equal(r.turno.jornada, 'Nocturno'); assert.equal(r.empaque.bultos, 5); assert.equal(r.empaque.paquetes, 0); assert.equal(r.produccion.merma_kg, 40); assert.equal(r.merma_etapas[0].nombre.includes('Lavado') || r.merma_etapas[0].nombre.includes('lavado'), true);
ok('Turno: el último turno (abierto); bultos vigentes (lo anulado no cuenta) y merma por etapa');
r = await PS.resumenPeriodo(prod, {periodo: 'dia'});
assert.equal(r.turnos, 2); assert.equal(r.turnos_cerrados, 1); assert.equal(r.produccion.papa_tomada_kg, 1000); assert.equal(r.produccion.kilos_producidos, 400); assert.equal(r.produccion.rendimiento_pct, 40); assert.equal(r.empaque.bultos, 17); assert.equal(r.empaque.paquetes, 30); assert.equal(r.produccion.merma_kg, 540);
ok('Día: kilos, papa tomada, rendimiento, papas en bultos y salsas en paquetes, turnos cerrados');
r = await PS.resumenPeriodo(prod, {periodo: 'semana', ref: hoy}); assert.equal(r.desde, lunes); assert.equal(r.turnos, 2);
r = await PS.resumenPeriodo(prod, {periodo: 'mes', ref: viejo}); assert.equal(r.turnos, 1); assert.equal(r.produccion.merma_kg, 600); assert.equal(r.merma_etapas[0].kg, 600);
r = await PS.resumenPeriodo(dueno, {periodo: 'mes'}); assert.ok(r.turnos >= 2);
ok('Semana y Mes: rango correcto, ref permite otro periodo');
await rechaza(PS.resumenPeriodo(prod, {periodo: 'año'}), /periodo/, 400); await rechaza(PS.resumenPeriodo(prod, {periodo: 'dia', ref: 'x'}), /fecha/, 400); await rechaza(PS.resumenPeriodo(ventas, {}), /no ve el resumen/, 403);
ok('periodo y fecha inválidos se rechazan; Ventas no lo ve');
const ruta = async (rol, u) => rutasProduccion(new Request('http://x' + u, {headers: {'x-rol': rol}}), {DB: db}, new URL('http://x' + u));
for (const rol of ['produccion', 'empaque']) { const x = await ruta(rol, '/api/p/resumen?periodo=dia'); assert.equal(x.status, 200); assert.ok(!JSON.stringify(await x.json()).match(/monto|precio|cents|costo|usd/i)); }
assert.equal((await ruta('ventas', '/api/p/resumen')).status, 403);
ok('ruta /api/p/resumen: Producción y Logística sí, sin dinero; Ventas no');
console.log(`\n${n} grupos de pruebas pasaron.`);
