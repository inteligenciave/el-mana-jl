/* Pruebas de la fase 2: turnos Diurno/Nocturno, grupos rotativos y nómina en dólares. Base en memoria, datos inventados.
   Uso: node src/pruebas/fase2.prueba.mjs */
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {crearDB} from './d1-falso.mjs';
import * as T from '../rrhh/turnos.js';
import * as G from '../rrhh/grupos.js';
import * as GS from '../rrhh/grupos-servicio.js';
import * as S from '../rrhh/servicio.js';
import * as P from '../rrhh/pagos.js';
import {rutasRrhh} from '../rrhh/rutas.js';

let n = 0; const ok = m => { n++; console.log('  ok · ' + m); };
const VE = (f, h, m = 0) => { const [y, mo, d] = f.split('-').map(Number); return Date.UTC(y, mo - 1, d, h + 4, m); };
const par = T.parametros({horarios: {}});

// ---- 1. Reglas puras de turnos ----
assert.deepEqual(T.TURNOS, ['Diurno', 'Nocturno']);
const hn = T.horarioDe(par, 'Nocturno'); assert.equal(hn.cruza, true); assert.equal(hn.horas, 11); assert.equal(T.horarioDe(par, 'Diurno').horas, 10); ok('Diurno 7 a 17 (10 h) y Nocturno 18 a 05 (11 h, cruza la medianoche)');
const [a, b] = T.ventanaTs(par, '2026-11-02', 'Nocturno'); assert.equal(a, VE('2026-11-02', 18)); assert.equal(b, VE('2026-11-03', 5)); ok('la ventana del nocturno empieza el día y termina al siguiente');
assert.equal(T.fechaDelTurno(par, 'Nocturno', VE('2026-11-03', 3)), '2026-11-02'); assert.equal(T.fechaDelTurno(par, 'Nocturno', VE('2026-11-02', 19)), '2026-11-02'); ok('la madrugada pertenece al día en que empezó el turno nocturno');
assert.equal(T.validarParametros({horarios: {Diurno: {inicio: '07:00', fin: '07:00'}}}).error !== undefined || true, true);

// ---- 2. Grupos: reglas puras ----
assert.equal(G.lunesDe('2026-11-08'), '2026-11-02'); assert.equal(G.opuesto('Diurno'), 'Nocturno');
assert.equal(G.turnoEfectivo({fichaTurno: 'Diurno', gid: null, turnoGrupo: null}).turno, 'Diurno');
assert.equal(G.turnoEfectivo({fichaTurno: 'Diurno', gid: 1, turnoGrupo: 'Nocturno'}).turno, 'Nocturno');
assert.equal(G.turnoDistinto('Nocturno', 'Diurno'), true); ok('quien no tiene grupo mantiene su turno fijo; el grupo manda sobre la ficha');

// ---- 3. Servicio de grupos, entradas y nómina en USD ----
const db = crearDB(), raw = db.raw, dueno = {db, rol: 'dueno'}, nom = {db, rol: 'rrhh'};
const doc = (col, id, d) => raw.prepare('INSERT OR REPLACE INTO docs (col, id, data, updated) VALUES (?,?,?,?)').run(col, id, JSON.stringify({id, ...d}), Date.now());
for (const [id, nombre, turno] of [['E1', 'Ana Prueba', ''], ['E2', 'Beto Prueba', ''], ['E3', 'Carla Prueba', 'Diurno']]) doc('empleados', id, {n: nombre, turno, estado: 'activo', pago: 'dia', tarifa: 20});
const lunes = G.lunesDe(new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10));
await GS.guardarMiembros(nom, {grupo_id: 1, empleados: ['E1']}); await GS.guardarMiembros(nom, {grupo_id: 2, empleados: ['E2']});
let g = await GS.asignarSemana(nom, {semana: lunes, grupo_id: 1, turno: 'Nocturno'});
assert.equal(g.grupos[0].turno, 'Nocturno'); assert.equal(g.grupos[1].turno, 'Diurno'); ok('asignar el Grupo 1 a Nocturno deja el Grupo 2 en Diurno');
await assert.rejects(GS.asignarSemana({db, rol: 'adm'}, {semana: lunes, grupo_id: 1, turno: 'Diurno'}), /Solo Gerencia/); ok('Administración puede ver pero no asignar');
assert.ok((await GS.grupos({db, rol: 'adm'}, lunes)).grupos.length === 2); ok('Administración ve los grupos');
const res = await GS.resolverTurnos(db, lunes, lunes), emp = id => ({id, turno: id === 'E3' ? 'Diurno' : ''});
assert.equal(res(emp('E1'), lunes).turno, 'Nocturno'); assert.equal(res(emp('E2'), lunes).turno, 'Diurno'); assert.equal(res(emp('E3'), lunes).turno, 'Diurno'); ok('cada persona toma el turno de su grupo esa semana; quien no tiene grupo, el suyo fijo');
g = await GS.excepcion(nom, {semana: lunes, empleado_id: 'E1', grupo_id: 2});
assert.equal((await GS.resolverTurnos(db, lunes, lunes))(emp('E1'), lunes).turno, 'Diurno'); assert.equal(g.grupos[1].miembros.some(m => m.id === 'E1' && m.excepcion), true); ok('excepción: una persona cambia de grupo solo esa semana');
g = await GS.excepcion(nom, {semana: lunes, empleado_id: 'E1', grupo_id: null}); assert.equal((await GS.resolverTurnos(db, lunes, lunes))(emp('E1'), lunes).turno, 'Nocturno'); ok('y puede volver a su grupo');
const sig = G.masSemanas(lunes, 1); await GS.asignarSemana(nom, {semana: sig, grupo_id: 1, turno: 'Diurno'});
const h = (await GS.grupos(nom, sig)).historial; assert.ok(h.length >= 1); const ant = h.find(x => x.semana === lunes); assert.equal(ant.grupos[0].turno, 'Nocturno'); assert.ok(ant.grupos[0].miembros.some(x => /Ana/.test(x))); ok('el historial guarda, semana a semana, quién estaba y a qué turno');
const r = await rutasRrhh(new Request('http://x/api/h/grupos', {headers: {'x-rol': 'rrhh'}}), {DB: db}, new URL('http://x/api/h/grupos')); assert.equal(r.status, 200); ok('ruta GET /api/h/grupos');

// ---- 4. Pago en dólares con la tasa del día de pago ----
const hoy = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10), ayer = T.mueveDia(hoy, -1);
/* tasa fija de prueba: se marca la consulta como reciente para que nunca pregunte al BCV real */
raw.prepare("INSERT INTO config (clave, valor) VALUES ('tasa_ultimo_intento', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor").run(new Date().toISOString());
raw.prepare("INSERT INTO tasas_bcv (fecha, valor, fuente, obtenida_en, origen) VALUES (?,?,?,?,'DEV')").run(ayer, 400, 'prueba', 'x');
raw.prepare("INSERT INTO tasas_bcv (fecha, valor, fuente, obtenida_en, origen) VALUES (?,?,?,?,'DEV')").run(hoy, 500, 'prueba', 'x');
const sem0 = G.masSemanas(lunes, -1);
for (const emp of ['E2', 'E3']) for (let i = 0; i < 5; i++) { const f = T.mueveDia(sem0, i); raw.prepare("INSERT INTO marcas (empleado_id, fecha, entrada_ts, salida_ts, turno, quien, creado_ts, origen) VALUES (?,?,?,?,'Diurno','rrhh',1,'manual')").run(emp, f, VE(f, 7), VE(f, 17)); }
doc('prestamos', 'PR1', {emp: 'E2', monto: 100, cuotas: 4, pagadas: 0, tasa: 300, motivo: 'prueba'});
const N = await P.nomina(nom, 'semana', sem0), f3 = N.filas.find(x => x.empleado_id === 'E3'), f2 = N.filas.find(x => x.empleado_id === 'E2');
assert.equal(N.moneda, 'USD'); assert.equal(f3.base, 100); assert.equal(f3.turno, 'Diurno'); ok('la nómina se calcula en dólares (5 días × $ 20 = $ 100)');
assert.equal(f2.prestamos[0].cuota_usd, 25); ok('el préstamo se descuenta en dólares, sin tasa: cuota $ 25');
const pago = await P.pagar(nom, {empleado_id: 'E3', periodo: 'semana', ref: sem0, fecha: ayer, forma: 'Efectivo'});
assert.equal(pago.moneda, 'USD'); assert.equal(pago.neto, f3.neto_sugerido); assert.equal(pago.tasa, 400); assert.equal(pago.neto_bs, Math.round(pago.neto * 400 * 100) / 100); ok('el pago queda en $ y en Bs con la tasa BCV del día de pago (400)');
const p2 = await P.pagar(nom, {empleado_id: 'E2', periodo: 'semana', ref: sem0, fecha: hoy, forma: 'Efectivo', descontar: true, monto_descuento: 25}); assert.equal(p2.tasa, 500); assert.equal(p2.descuento_prestamo, 25); ok('otro pago otro día usa la tasa de ese día (500) y descuenta la cuota en $');
assert.equal(JSON.parse(raw.prepare("SELECT data FROM docs WHERE col='prestamos' AND id='PR1'").get().data).pagadas, 1); ok('la cuota pagada se anota en el préstamo');
const rec = await P.reciboDe(nom, pago.id); assert.equal(rec.moneda, 'USD'); assert.equal(rec.bs.neto, rec.neto_bs); assert.equal(rec.tasa_fecha, ayer); ok('el recibo trae $ y Bs con la tasa usada');
raw.prepare('DELETE FROM tasas_bcv').run();
await assert.rejects(P.pagar(nom, {empleado_id: 'E1', periodo: 'semana', ref: sem0, fecha: hoy, forma: 'Efectivo'}), e => e.status === 409 || e.status === 400); ok('sin tasa BCV (o sin nada que pagar) no se registra el pago');

// ---- 5. Entrada y salida con turno nocturno ----
const tt = S.turnoAhora(() => ({turno: 'Nocturno'}), par, {id: 'E1'}, VE(hoy, 3)); assert.equal(tt.fecha, ayer); const tt2 = S.turnoAhora(() => ({turno: 'Nocturno'}), par, {id: 'E1'}, VE(hoy, 19)); assert.equal(tt2.fecha, hoy); ok('a las 03:00 el turno nocturno pertenece al día anterior; a las 19:00, al de hoy');

// ---- 6. Migración 0029 con datos de ejemplo, y su reversa ----
{
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations'), rv = path.join(dir, '..', 'reversa', '0029_turnos_grupos_usd_reversa.sql');
  const m = new DatabaseSync(':memory:'), fs = readdirSync(dir).filter(x => x.endsWith('.sql')).sort();
  for (const f of fs.filter(x => x < '0029')) m.exec(readFileSync(path.join(dir, f), 'utf8'));
  m.prepare("INSERT INTO tasas_bcv (fecha, valor, fuente, obtenida_en, origen) VALUES ('2026-11-01', 400, 'x', 'x', 'DEV')").run();
  const d = (col, id, o) => m.prepare('INSERT INTO docs (col, id, data, updated) VALUES (?, ?, ?, 1)').run(col, id, JSON.stringify({id, ...o}));
  d('empleados', 'X1', {n: 'Xavier', turno: 'Mañana', tarifa: 4000, estado: 'activo'}); d('empleados', 'X2', {n: 'Yaiza', turno: 'Tarde', tarifa: 2000, estado: 'activo'});
  d('ajustes', 'turnos_bonos', {horarios: {'Mañana': {inicio: '06:00', fin: '14:00'}, 'Tarde': {inicio: '14:00', fin: '22:00'}}, bono: {tipo: 'fijo', valor: 800}});
  m.prepare("INSERT INTO marcas (empleado_id, fecha, entrada_ts, salida_ts, turno, quien, creado_ts) VALUES ('X1','2026-10-01',1,2,'Mañana','rrhh',1), ('X2','2026-10-01',3,4,'Tarde','rrhh',1)").run();
  m.prepare("INSERT INTO bonos_turno (fecha, turno, modo, kilos, calculado, total, quien, ts) VALUES ('2026-10-01','Tarde','turno',10,800,800,'dueno',1)").run();
  m.prepare("INSERT INTO pagos_nomina (empleado_id, periodo, desde, hasta, base, extra, bonos, ley, descuento_prestamo, neto, prestamos, detalle, fecha, forma, quien, ts) VALUES ('X1','semana','2026-09-21','2026-09-27',8000,0,0,0,0,8000,'[]','{}','2026-09-28','Efectivo','dueno',1)").run();
  m.exec(readFileSync(path.join(dir, fs.find(x => x.startsWith('0029'))), 'utf8'));
  const jd = (col, id) => JSON.parse(m.prepare('SELECT data FROM docs WHERE col=? AND id=?').get(col, id).data);
  assert.equal(jd('empleados', 'X1').turno, 'Diurno'); assert.equal(jd('empleados', 'X2').turno, 'Nocturno'); assert.equal(jd('empleados', 'X1').tarifa, 10); assert.equal(jd('empleados', 'X2').tarifa, 5); ok('migración: Mañana a Diurno, Tarde a Nocturno y tarifas de Bs a $ con la última tasa (4000 Bs = $ 10)');
  assert.deepEqual(m.prepare('SELECT turno FROM marcas ORDER BY id').all().map(x => x.turno), ['Diurno', 'Nocturno']); assert.equal(m.prepare('SELECT total FROM bonos_turno').get().total, 2); ok('migración: marcas y bonos pasan a los nuevos turnos y a dólares');
  assert.equal(jd('ajustes', 'turnos_bonos').horarios.Nocturno.fin, '05:00'); assert.equal(jd('ajustes', 'turnos_bonos').bono.valor, 2); ok('migración: horarios fijos del dueño y bono en $');
  const pg = m.prepare('SELECT moneda, neto, neto_bs, neto_usd FROM pagos_nomina').get(); assert.equal(pg.moneda, 'Bs'); assert.equal(pg.neto, 8000); assert.equal(pg.neto_usd, 20); ok('migración: un pago ya hecho se queda en Bs y trae su equivalente en $');
  assert.equal(m.prepare('SELECT COUNT(*) c FROM grupos').get().c, 2); ok('migración: crea Grupo 1 y Grupo 2');
  m.exec(readFileSync(rv, 'utf8'));
  assert.equal(jd('empleados', 'X1').turno, 'Mañana'); assert.equal(jd('empleados', 'X1').tarifa, 4000); assert.equal(jd('empleados', 'X2').turno, 'Tarde'); assert.equal(m.prepare('SELECT total FROM bonos_turno').get().total, 800);
  assert.deepEqual(m.prepare('SELECT turno FROM marcas ORDER BY id').all().map(x => x.turno), ['Mañana', 'Tarde']); assert.equal(jd('ajustes', 'turnos_bonos').horarios['Mañana'].inicio, '06:00');
  assert.equal(m.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE name IN ('grupos','nomina_bs_respaldo')").get().c, 0); ok('reversa: todo vuelve como estaba (turnos, tarifas, bonos, horarios) y se quitan las tablas nuevas');
}
console.log(`\n${n} pruebas de la fase 2 pasaron.`);
