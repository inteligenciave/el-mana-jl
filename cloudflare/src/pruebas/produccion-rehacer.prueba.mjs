/* Producción rehecha: turno siempre activo (sin abrir ni continuar a mano), requisitos antes de iniciar, etapas una a una con «Terminar etapa»,
   cierre con merma consolidada y descuento del inventario; lo recibido va al turno activo; el mínimo del inventario lo fijan Gerencia y Administración.
   Uso: node src/pruebas/produccion-rehacer.prueba.mjs */
import assert from 'node:assert/strict';
import {crearDB} from './d1-falso.mjs';
import * as D from '../produccion/dominio.js';
import * as PS from '../produccion/servicio.js';
import * as TA from '../produccion/turno-activo.js';
import * as IS from '../inventario/servicio.js';
import * as GS from '../rrhh/grupos-servicio.js';
import {lunesDe} from '../rrhh/grupos.js';
import {rutasProduccion} from '../produccion/rutas.js';
import {rutasInventario} from '../inventario/rutas.js';

let n = 0; const ok = m => { n++; console.log('  ok · ' + m); };
const rechaza = async (p, re, st) => { try { await p; } catch (e) { assert.match(String(e.message), re); if (st) assert.equal(e.status, st); return e; } assert.fail('debía rechazar: ' + re); };
const db = crearDB(), raw = db.raw;
const doc = (id, o) => raw.prepare('INSERT INTO docs (col, id, data, updated) VALUES (?, ?, ?, 1)').run('empleados', id, JSON.stringify({id, ...o}));
doc('E1', {n: 'Ana', area: 'Planta'}); doc('E2', {n: 'Beto', area: 'Planta'});
const dueno = {db, rol: 'dueno'}, adm = {db, rol: 'adm'}, prod = {db, rol: 'produccion'}, rrhh = {db, rol: 'rrhh'};

/* 1 · siempre hay un turno activo, el de la hora de ahora, y no se abre a mano */
assert.equal(raw.prepare('SELECT COUNT(*) c FROM turnos').get().c, 0);
const t0 = (await PS.turnoActual(db)).turno;
assert.equal(t0, null); assert.equal(raw.prepare('SELECT COUNT(*) c FROM turnos').get().c, 0);   // mirar la pantalla NO crea el turno
await PS.turnoActual(db); assert.equal(raw.prepare('SELECT COUNT(*) c FROM turnos').get().c, 0);
assert.equal(PS.abrirTurno, undefined);
ok('ver la pantalla no crea ningún turno y ya no existe «abrir turno»');

/* 2 · sin iniciar no se puede escribir nada */
await IS.conteoInicial(adm, {conteos: D.INSUMOS_CRITICOS.map(i => ({articulo: i.codigo, cantidad: 3000})).concat([{articulo: 'empaque', cantidad: 100000}, ...[1, 2, 3].map(i => ({articulo: 'bolsa-' + i, cantidad: 100000}))])});
await rechaza(PS.terminarEtapa(prod, {}), /inicia la producción/i, 409);
await rechaza(PS.registrarMovimiento(prod, {etapa: 'recepcion', sentido: 'ENTRA', kilos: 10}), /inicia la producción/i, 409);
ok('antes de iniciar, ni terminar etapas ni anotar kilos');

/* 3 · iniciar exige TODOS los requisitos en verde (también para el Gerente) */
await rechaza(PS.iniciarProduccion(prod, {}), /No hay grupo de turno con personal/, 409);
await GS.guardarMiembros(rrhh, {grupo_id: 1, empleados: ['E1']}); await GS.guardarMiembros(rrhh, {grupo_id: 2, empleados: ['E2']});
let a = await PS.arranque(dueno); const lunes = lunesDe(a.fecha), otra = a.jornada === 'Diurno' ? 'Nocturno' : 'Diurno';
await GS.asignarSemana(rrhh, {semana: lunes, grupo_id: 1, turno: a.jornada, ambos: false}); await GS.asignarSemana(rrhh, {semana: lunes, grupo_id: 2, turno: otra, ambos: false});
raw.prepare("INSERT INTO marcas (empleado_id, fecha, entrada_ts, turno, quien, creado_ts) VALUES ('E1', ?, ?, ?, 'rrhh', ?)").run(a.fecha, Date.now(), a.jornada, Date.now());
raw.prepare("INSERT INTO inv_movimientos (articulo, tipo, cantidad, origen, ref, nota, rol, ts) VALUES ('sal', 'SALIDA', 3000, 'consumo', 'S-sal', 'prueba', 'produccion', ?)").run(Date.now() + 5);
await rechaza(PS.iniciarProduccion(dueno, {}), /Falta sal/, 409);
raw.prepare("INSERT INTO inv_movimientos (articulo, tipo, cantidad, origen, ref, nota, rol, ts) VALUES ('sal', 'ENTRADA', 100, 'compra', 'C-sal', 'prueba', 'adm', ?)").run(Date.now() + 9);
await rechaza(PS.iniciarProduccion(rrhh, {}), /Solo Producción/);
const ini = await PS.iniciarProduccion(prod, {}); assert.equal(ini.turno.iniciada, true); assert.equal(ini.turno.etapa_actual, 'recepcion');
await rechaza(PS.iniciarProduccion(prod, {}), /ya está iniciada/, 409);
ok('sin requisitos no inicia; con todo en verde inicia una sola vez y la primera etapa queda en curso');

/* 4 · etapas una a la vez, en orden */
await rechaza(PS.terminarEtapa(prod, {etapa: 'lavado'}), /Ahora toca/, 409);
await rechaza(PS.registrarMovimiento(prod, {etapa: 'lavado', sentido: 'ENTRA', kilos: 10}), /Ahora toca/, 409);
await rechaza(PS.cerrarTurno(prod, {etapas: {recepcion: '1'}}), /termina las etapas|Escribe los kilos/, undefined);
await rechaza(PS.terminarEtapa(prod, {}), /Escribe cuántos kilos de papa/, 400);
await rechaza(PS.terminarEtapa(prod, {kilos: 99999}), /Solo hay/, 409);
const papaAntes = (await IS.resumen(db)).articulos.find(x => x.codigo === 'papa').saldo;
let t = (await PS.terminarEtapa(prod, {kilos: 1000})).turno; assert.equal(t.etapa_actual, 'despiedre');
assert.equal((await IS.resumen(db)).articulos.find(x => x.codigo === 'papa').saldo, papaAntes - 1000);
assert.equal(t.proceso.filter(e => e.estado === 'HECHA').length, 1); assert.equal(t.proceso.filter(e => e.estado === 'EN_CURSO').length, 1);
ok('solo se puede terminar la etapa en curso; Recepción toma la papa del inventario (baja 1000 kg) y pasa a la siguiente');

/* 5 · recorrer todas: Lavado y Freído llevan kilos; lo que no sale es merma */
for (let i = 0; i < 20 && t.etapa_actual; i++) {
  const k = t.etapa_actual, cuerpo = k === 'lavado' ? {kilos: 900} : k === 'fritado' ? {kilos: 400} : {};
  t = (await PS.terminarEtapa(prod, cuerpo)).turno;
}
assert.equal(t.todas_terminadas, true); assert.equal(t.etapa_actual, null);
await rechaza(PS.terminarEtapa(prod, {}), /ya están terminadas/, 409);
const mc = await PS.mermaConsolidadaInfo(prod); assert.equal(mc.tomados_kg, 1000); assert.equal(mc.a_empaque_kg, 400); assert.equal(mc.calculada_kg, 600);
ok('las 10 etapas se terminan una por una; la merma consolidada es lo tomado menos lo que llegó a Empaque (600 kg)');

/* 6 · cierre */
const prodId = (await PS.turnoActual(db)).productos[0].id_producto; raw.prepare("UPDATE productos SET kg_por_bulto = 10, unidades_por_bulto = 30 WHERE id_producto = ?").run(prodId);
await PS.registrarEmpaque({db, rol: 'empaque'}, {id_producto: prodId, bultos: 40});
const motivo = mc.motivos[0];
await PS.registrarMermaConsolidada(prod, {filas: [{etapa: 'lavado', kilos: '100', id_motivo: motivo.id}, {etapa: 'fritado', kilos: '500', id_motivo: motivo.id}]});
const cierre = await PS.cerrarTurno(prod, {etapas: {}, bultos: {}}); assert.ok(cierre.bultos_sumados >= 0);
assert.equal(raw.prepare("SELECT estado FROM turnos WHERE id_turno = ?").get(t.id_turno).estado, 'CERRADO');
assert.equal((await PS.turnoActual(db)).turno, null);
ok('cierra con la merma anotada y no queda turno hasta que alguien pulse «Iniciar producción»');

/* 6b · un turno dura hasta que termina su hora, salvo que alguien tenga horas extra */
{ const j = await TA.jornadaActual(db), otraJ = j.jornada === 'Diurno' ? 'Nocturno' : 'Diurno';
  assert.equal(await TA.turnoVencido(db, {jornada: j.jornada, fecha_jornada: j.fecha}), false);
  assert.equal(await TA.turnoVencido(db, {jornada: otraJ, fecha_jornada: j.fecha}), true);   // ya pasó su hora y no hay horas extra
  ok('el turno sigue activo mientras es su hora y vence al terminar si nadie tiene horas extra'); }

/* 7 · lo que sale del inventario al turno queda con el turno */
const mov = raw.prepare("SELECT COUNT(*) c FROM inv_movimientos WHERE id_turno IS NOT NULL").get().c; assert.ok(mov >= 1, 'hay movimientos cargados al turno');
ok('lo que sale del inventario hacia el turno queda con el turno activo');

/* 8 · rutas */
const rutas = async (m, p, rol, body) => rutasProduccion(new Request('http://x' + p, {method: m, headers: {'content-type': 'application/json', 'x-rol': rol}, body: body ? JSON.stringify(body) : undefined}), {DB: db}, new URL('http://x' + p));
assert.equal((await rutas('POST', '/api/p/turno/abrir', 'produccion', {})).status, 404);
assert.equal((await rutas('POST', '/api/p/turno/etapa/terminar', 'produccion', {})).status, 409);
assert.equal((await rutas('GET', '/api/p/turno', 'produccion')).status, 200);
ok('no existe la ruta de abrir turno; terminar etapa sin iniciar da 409');

/* 9 · el mínimo del inventario lo fijan Gerencia y Administración (con auditoría) */
const inv = async (rol, m) => rutasInventario(new Request('http://x/api/v/inventario/articulos/papa', {method: 'PUT', headers: {'content-type': 'application/json', 'x-rol': rol}, body: JSON.stringify({minimo: m})}), {DB: db}, new URL('http://x/api/v/inventario/articulos/papa'));
assert.equal((await inv('adm', 500)).status, 200); assert.equal((await inv('dueno', 700)).status, 200); assert.ok([401, 403].includes((await inv('produccion', 5)).status));
assert.ok(raw.prepare("SELECT COUNT(*) c FROM auditoria_sistema WHERE accion LIKE '%mínimo%'").get().c >= 2);
ok('Administración y Gerencia cambian el mínimo (queda en la auditoría); Producción no');

console.log(`\n${n} pruebas de Producción rehecha pasaron.`);
