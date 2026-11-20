/* Pruebas: Nómina (rol rrhh) edita los turnos: horarios de Diurno/Nocturno y grupos. Lo pagado o con bono aplicado no se toca, todo queda en auditoría y Gerencia recibe un aviso.
   Base en memoria, datos inventados. Uso: node src/pruebas/nomina-turnos.prueba.mjs */
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {crearDB} from './d1-falso.mjs';
import * as T from '../rrhh/turnos.js';
import * as G from '../rrhh/grupos.js';
import * as TS from '../rrhh/turnos-servicio.js';
import * as GS from '../rrhh/grupos-servicio.js';
import {rutasRrhh} from '../rrhh/rutas.js';

let n = 0; const ok = m => { n++; console.log('  ok · ' + m); };
const hoy = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10), suma = (f, k) => new Date(Date.parse(f + 'T00:00:00Z') + k * 864e5).toISOString().slice(0, 10);

// ---- 1. Reglas puras de los horarios ----
const H = (di, df, ni, nf) => ({Diurno: {inicio: di, fin: df}, Nocturno: {inicio: ni, fin: nf}});
assert.equal(T.errorHorarios(H('07:00', '17:00', '18:00', '05:00'), true), ''); ok('los horarios de fábrica (7 a 17 y 18 a 5) son válidos');
assert.match(T.errorHorarios(H('07:00', '17:00', '18:00', '22:00'), true), /pasar la medianoche/); ok('el nocturno tiene que cruzar la medianoche');
assert.match(T.errorHorarios(H('19:00', '05:00', '18:00', '05:00'), true), /diurno no puede terminar al día siguiente/); ok('el diurno no puede cruzar la medianoche');
assert.match(T.errorHorarios(H('07:00', '19:00', '18:00', '05:00'), true), /se pisan/); ok('el diurno que termina después de que entra el nocturno se pisa');
assert.match(T.errorHorarios(H('04:00', '17:00', '18:00', '05:00'), true), /se pisan/); ok('el diurno que entra antes de que salga el nocturno se pisa');
assert.equal(T.errorHorarios(H('05:00', '18:00', '18:00', '05:00'), true), ''); ok('turnos pegados (sin hueco) son válidos');
assert.match(T.errorHorarios(H('', '', '18:00', '05:00'), true), /los dos turnos/); ok('Nómina debe escribir los dos horarios');
assert.deepEqual(T.huecosDe(H('07:00', '17:00', '18:00', '05:00')), [{desde: '05:00', hasta: '07:00'}, {desde: '17:00', hasta: '18:00'}]); ok('huecos: 5 a 7 y 17 a 18 quedan sin turno');
assert.deepEqual(T.huecosDe(H('07:00', '18:00', '18:00', '05:00')), [{desde: '05:00', hasta: '07:00'}]); ok('si el nuevo horario cubre 17 a 18, ese hueco desaparece');
const docH = {horarios: H('08:00', '18:00', '19:00', '06:00'), historial: [{desde: '0000-01-01', horarios: H('07:00', '17:00', '18:00', '05:00')}, {desde: '2026-12-01', horarios: H('08:00', '18:00', '19:00', '06:00')}]};
assert.equal(T.parametros(docH, '2026-11-30').horarios.Diurno.inicio, '07:00'); assert.equal(T.parametros(docH, '2026-12-01').horarios.Diurno.inicio, '08:00'); assert.equal(T.parEn(T.parametros(docH, '2027-01-01'), '2026-11-15').horarios.Nocturno.inicio, '18:00'); ok('el historial devuelve el horario que valía cada día (nada se reescribe hacia atrás)');

// ---- 2. Servicio: Nómina cambia horarios ----
const db = crearDB(), raw = db.raw, nom = {db, rol: 'rrhh'}, ger = {db, rol: 'dueno'}, adm = {db, rol: 'adm'};
const doc = (col, id, d) => raw.prepare('INSERT OR REPLACE INTO docs (col, id, data, updated) VALUES (?,?,?,?)').run(col, id, JSON.stringify({id, ...d}), Date.now());
for (const [id, nombre] of [['E1', 'Ana Prueba'], ['E2', 'Beto Prueba'], ['E3', 'Carla Prueba']]) doc('empleados', id, {n: nombre, turno: '', estado: 'activo', pago: 'dia', tarifa: 20});
const p0 = await TS.parametros(nom); assert.equal(p0.puede_editar_horarios, true); assert.equal(p0.puede_editar, false); assert.equal((await TS.parametros(adm)).puede_editar_horarios, false); ok('Nómina puede editar horarios (no reglas de pago); Administración solo ve');
await assert.rejects(TS.guardarParametros(adm, {horarios: H('06:00', '16:00', '18:00', '05:00')}), /Solo Gerencia/); ok('Administración no puede guardar horarios');
const nuevoH = H('06:00', '16:00', '17:00', '04:00');
let p1 = await TS.guardarParametros(nom, {horarios: nuevoH}); assert.equal(p1.horarios.Diurno.inicio, '06:00'); assert.equal(p1.horarios.Nocturno.fin, '04:00'); ok('Nómina cambia los horarios de Diurno y Nocturno (valen desde hoy)');
assert.deepEqual(p1.huecos, [{desde: '04:00', hasta: '06:00'}, {desde: '16:00', hasta: '17:00'}]); ok('la pantalla recibe los huecos sin turno');
const au = raw.prepare("SELECT * FROM auditoria_sistema WHERE ent = 'turno' ORDER BY id DESC").all(); assert.equal(au.length, 1); const det = JSON.parse(au[0].detalle);
assert.match(au[0].accion, /cambió los horarios/); assert.equal(det.horarios_antes.Diurno.inicio, '07:00'); assert.equal(det.horarios_despues.Diurno.inicio, '06:00'); assert.equal(det.desde, hoy); ok('auditoría: quién, cuándo, valor anterior y valor nuevo');
assert.equal(raw.prepare("SELECT COUNT(*) c FROM docs WHERE col = 'auditoria'").get().c >= 1, true); ok('la auditoría también queda en la lista de Gerencia');
const av = await TS.avisos(ger); assert.equal(av.pendientes, 1); assert.match(av.avisos[0].resumen, /cambió el horario/); assert.equal(av.avisos[0].detalle.antes.Diurno.inicio, '07:00'); ok('Gerencia recibe un aviso con el antes y el después');
await assert.rejects(TS.avisos(nom), /Solo Gerencia/); ok('Nómina no ve los avisos de Gerencia');
assert.equal((await TS.parametros(ger)).avisos_pendientes, 1); assert.equal((await TS.parametros(nom)).avisos, undefined); ok('el aviso llega con los parámetros de Gerencia y no a otros puestos');
const av2 = await TS.avisoVisto(ger, {id: av.avisos[0].id}); assert.equal(av2.pendientes, 0); ok('Gerencia marca el aviso como visto');
const nAv = () => raw.prepare('SELECT COUNT(*) c FROM avisos_turnos').get().c;
await TS.guardarParametros(nom, {horarios: nuevoH}); assert.equal(nAv(), 1); ok('guardar el mismo horario no genera otro aviso');
await TS.guardarParametros(ger, {horarios: H('07:00', '17:00', '18:00', '05:00')}); assert.equal(nAv(), 1); ok('si lo cambia Gerencia no hay aviso (solo auditoría)');
// validaciones
await assert.rejects(TS.guardarParametros(nom, {horarios: H('07:00', '17:00', '18:00', '22:00')}), /pasar la medianoche/); await assert.rejects(TS.guardarParametros(nom, {horarios: H('07:00', '19:00', '18:00', '05:00')}), /se pisan/); ok('servidor rechaza nocturno sin cruce y turnos que se pisan');
await assert.rejects(TS.guardarParametros(nom, {horarios: {Diurno: {inicio: '', fin: ''}, Nocturno: {inicio: '', fin: ''}}}), /los dos turnos/); ok('Nómina no puede dejar un turno sin horario');
await assert.rejects(TS.guardarParametros(nom, {horarios: H('07:00', '17:00', '18:00', '05:00'), desde: suma(hoy, -1)}), /desde hoy en adelante/); ok('no se puede empezar un horario en un día que ya pasó');
await assert.rejects(TS.guardarParametros(nom, {horarios: nuevoH, desde: 'ayer'}), /no es válida/); ok('fecha de inicio inválida se rechaza');
await assert.rejects(TS.guardarParametros(nom, {horarios: H('07:00', '17:00', '18:00', '05:00'), pagos: {nomJornada: 12, nomRecargo: 50, nomLey: 5}}), /solo los horarios|Solo Gerencia|Nómina cambia solo/); ok('Nómina no puede cambiar reglas de pago por esta vía');
await assert.rejects(TS.guardarParametros(nom, {horarios: H('07:00', '17:00', '18:00', '05:00'), bono: {tipo: 'fijo', valor: 99, meta_kg: 10}}), /Nómina cambia solo/); ok('ni el bono');
const ajB = await TS.guardarParametros(nom, {horarios: H('07:00', '17:00', '18:00', '05:00'), pagos: p0.pagos, bono: p0.bono}); assert.equal(ajB.horarios.Diurno.inicio, '07:00'); ok('mandar los mismos valores de pago y bono (sin cambiarlos) sí se acepta');
// hacia adelante
const man = suma(hoy, 3); let p2 = await TS.guardarParametros(nom, {horarios: H('08:00', '18:00', '19:00', '06:00'), desde: man});
assert.equal(p2.horarios.Diurno.inicio, '07:00'); assert.equal(p2.proximos.length, 1); assert.equal(p2.proximos[0].desde, man); ok('un cambio programado no altera el horario de hoy y aparece como «próximo»');
assert.equal((await TS.turno(ger, hoy, 'Diurno')).horario.inicio, '07:00'); assert.equal((await TS.turno(ger, man, 'Diurno')).horario.inicio, '08:00'); assert.equal((await TS.turno(ger, suma(man, -1), 'Diurno')).horario.inicio, '07:00'); ok('la pantalla Turnos usa el horario de cada día: antes del cambio el viejo, desde el cambio el nuevo');
const ph = JSON.parse(raw.prepare("SELECT data FROM docs WHERE col='ajustes' AND id='turnos_bonos'").get().data); assert.equal(ph.historial.length, 3); assert.equal(ph.historial[0].horarios.Diurno.inicio, '07:00'); ok('el historial de horarios queda guardado');

const antesAv = nAv(); const pc = await TS.guardarParametros(nom, {horarios: H('07:00', '17:00', '18:00', '05:00')}); assert.equal(pc.proximos.length, 0); assert.equal((await TS.turno(ger, man, 'Diurno')).horario.inicio, '07:00'); assert.equal(nAv(), antesAv + 1); ok('guardar el horario de hoy cancela el cambio programado (y Gerencia recibe aviso)');

// ---- 3. Lo pagado o con bono aplicado ----
const pago = (emp, d, h) => raw.prepare("INSERT INTO pagos_nomina (empleado_id, periodo, desde, hasta, base, extra, bonos, ley, descuento_prestamo, neto, prestamos, detalle, fecha, forma, quien, ts) VALUES (?,'semana',?,?,10,0,0,0,0,10,'[]','{}',?, 'Efectivo','rrhh',1)").run(emp, d, h, h);
const cierre = suma(hoy, 1); pago('E1', suma(hoy, -6), cierre);
const pb = await TS.parametros(nom); assert.equal(pb.ultimo_cierre, cierre); assert.equal(pb.desde_minima, suma(cierre, 1)); assert.equal((await TS.parametros(ger)).desde_minima, hoy); ok('la pantalla sabe desde qué día se puede cambiar (Nómina) y Gerencia puede desde hoy');
await assert.rejects(TS.guardarParametros(nom, {horarios: H('06:00', '16:00', '17:00', '04:00')}), e => { assert.match(e.message, /pagos de nómina o bonos aplicados/); assert.equal(e.status, 409); assert.equal(e.extra.bloqueado, true); return true; }); ok('Nómina no puede cambiar un horario que empieza en días ya pagados (bloqueo claro en el servidor)');
await assert.rejects(TS.guardarParametros(nom, {horarios: H('06:00', '16:00', '17:00', '04:00'), desde: cierre}), /pagos de nómina/); ok('ni el último día pagado');
const dsp = suma(cierre, 1); await TS.guardarParametros(nom, {horarios: H('06:00', '16:00', '17:00', '04:00'), desde: dsp}); assert.equal(JSON.parse(raw.prepare("SELECT data FROM docs WHERE col='ajustes' AND id='turnos_bonos'").get().data).historial.some(x => x.desde === dsp), true); ok('un día después de lo pagado sí se puede');
const gp = await TS.guardarParametros(ger, {horarios: H('06:30', '16:30', '17:30', '04:30')}); assert.equal(gp.horarios.Diurno.inicio, '06:30'); ok('Gerencia sí puede corregir (es quien autoriza)');
raw.prepare("DELETE FROM pagos_nomina").run();
// ruta HTTP
const llamar = (rol, m, ruta, cuerpo) => rutasRrhh(new Request('http://x/api/h' + ruta, {method: m, headers: {'x-rol': rol, 'content-type': 'application/json'}, body: cuerpo ? JSON.stringify(cuerpo) : undefined}), {DB: db}, new URL('http://x/api/h' + ruta));
let r = await llamar('rrhh', 'PUT', '/parametros', {horarios: H('07:00', '17:00', '18:00', '05:00')}); assert.equal(r.status, 200); r = await llamar('adm', 'PUT', '/parametros', {horarios: H('07:00', '17:00', '18:00', '05:00')}); assert.equal(r.status, 403); ok('ruta PUT /api/h/parametros: Nómina 200, Administración 403');
r = await llamar('rrhh', 'GET', '/avisos'); assert.equal(r.status, 403); r = await llamar('dueno', 'GET', '/avisos'); assert.equal(r.status, 200); r = await llamar('dueno', 'POST', '/avisos/visto', {}); assert.equal(r.status, 200); ok('rutas de avisos: solo Gerencia');

// ---- 4. Grupos: Nómina arma, mueve y asigna ----
const lunes = G.lunesDe(hoy);
let g = await GS.guardarMiembros(nom, {grupo_id: 1, empleados: ['E1', 'E3']}); await GS.guardarMiembros(nom, {grupo_id: 2, empleados: ['E2']});
g = await GS.asignarSemana(nom, {semana: lunes, grupo_id: 1, turno: 'Diurno'}); assert.equal(g.grupos[0].turno, 'Diurno'); assert.equal(g.grupos[1].turno, 'Nocturno'); ok('Nómina arma los grupos y asigna el grupo al turno de la semana');
g = await GS.guardarMiembros(nom, {grupo_id: 1, empleados: ['E1']}); assert.equal(g.grupos[0].miembros.length, 1); ok('Nómina mueve personas entre grupos');
g = await GS.excepcion(nom, {semana: lunes, empleado_id: 'E1', grupo_id: 2}); assert.equal(g.grupos[1].miembros.some(m => m.id === 'E1' && m.excepcion), true); g = await GS.excepcion(nom, {semana: lunes, empleado_id: 'E1', grupo_id: null}); ok('Nómina mueve a una persona solo una semana y la devuelve');
// bloqueo por pago
pago('E1', lunes, suma(lunes, 6));
await assert.rejects(GS.excepcion(nom, {semana: lunes, empleado_id: 'E1', grupo_id: 2}), e => { assert.equal(e.status, 409); assert.equal(e.extra.bloqueado, true); assert.match(e.message, /Ana Prueba ya tiene pago de nómina/); assert.match(e.message, /autorización a Gerencia/); return true; }); ok('no se mueve a alguien ya pagado esa semana (mensaje claro)');
await assert.rejects(GS.asignarSemana(nom, {semana: lunes, grupo_id: 1, turno: 'Nocturno'}), /No se puede cambiar el turno/); ok('no se cambia el turno de un grupo con personas ya pagadas esa semana');
g = await GS.asignarSemana(nom, {semana: lunes, grupo_id: 1, turno: 'Diurno'}); assert.equal(g.grupos[0].turno, 'Diurno'); ok('guardar lo mismo (sin cambios) no se bloquea');
await assert.rejects(GS.guardarMiembros(nom, {grupo_id: 2, empleados: ['E2', 'E1']}), /cambiar los integrantes/); await assert.rejects(GS.guardarMiembros(nom, {grupo_id: 1, empleados: []}), /Ana Prueba/); ok('no se cambian integrantes si entra o sale alguien ya pagado');
g = await GS.grupos(nom, lunes); assert.equal(g.bloquea, true); assert.match(g.grupos[0].miembros[0].bloqueo.texto, /pago de nómina/); assert.equal(g.grupos[0].bloqueado, true); assert.equal(g.grupos[1].bloqueado, false); ok('la pantalla recibe quién está bloqueado y por qué');
g = await GS.excepcion(ger, {semana: lunes, empleado_id: 'E1', grupo_id: 2}); assert.equal((await GS.grupos(ger, lunes)).bloquea, false); ok('Gerencia sí puede corregirlo (autoriza)');
await GS.excepcion(ger, {semana: lunes, empleado_id: 'E1', grupo_id: null});
raw.prepare("DELETE FROM pagos_nomina").run();
// bloqueo por bono aplicado
raw.prepare("INSERT INTO bonos_aplicados (esquema_id, esquema_nombre, fecha, turno, estado, origen, medida, monto_persona, total, detalle, quien, ts) VALUES (1,'Bono Empaque',?,'Diurno','APLICADO','auto',130,3,3,'{}','sistema',1)").run(lunes);
const apId = raw.prepare('SELECT id FROM bonos_aplicados').get().id; raw.prepare('INSERT INTO bonos_aplicados_emp (aplicado_id, empleado_id, fecha, monto) VALUES (?,?,?,3)').run(apId, 'E2', lunes);
await assert.rejects(GS.excepcion(nom, {semana: lunes, empleado_id: 'E2', grupo_id: 1}), /bono aplicado/); ok('no se mueve a alguien con bono aplicado esa semana');
raw.prepare("UPDATE bonos_aplicados SET estado = 'REVISION'").run(); g = await GS.excepcion(nom, {semana: lunes, empleado_id: 'E2', grupo_id: 1}); assert.equal(g.grupos[0].miembros.some(m => m.id === 'E2'), true); ok('un bono deshecho (en revisión) ya no bloquea');
await GS.excepcion(nom, {semana: lunes, empleado_id: 'E2', grupo_id: null});
// semana futura no bloqueada por pagos pasados
pago('E1', suma(lunes, -14), suma(lunes, -8)); const sig = G.masSemanas(lunes, 1); g = await GS.asignarSemana(nom, {semana: sig, grupo_id: 1, turno: 'Nocturno'}); assert.equal(g.grupos[0].turno, 'Nocturno'); ok('lo pagado en semanas pasadas no bloquea las semanas que vienen');
// auditoría de grupos
assert.equal(raw.prepare("SELECT COUNT(*) c FROM auditoria_sistema WHERE ent = 'grupo'").get().c >= 5, true); ok('los cambios de grupos también quedan en auditoría');

// ---- 5. Migración 0037 y su reversa ----
{
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations'), rv = path.join(dir, '..', 'reversa', '0037_nomina_turnos_reversa.sql');
  const m = new DatabaseSync(':memory:'), fs = readdirSync(dir).filter(x => x.endsWith('.sql')).sort();
  for (const f of fs) m.exec(readFileSync(path.join(dir, f), 'utf8'));
  assert.equal(m.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE name = 'avisos_turnos'").get().c, 1);
  m.prepare("INSERT INTO docs (col, id, data, updated) VALUES ('ajustes','turnos_bonos',?,1)").run(JSON.stringify({id: 'turnos_bonos', horarios: H('06:00', '16:00', '17:00', '04:00'), historial: [{desde: '0000-01-01', horarios: H('07:00', '17:00', '18:00', '05:00')}]}));
  m.exec(readFileSync(rv, 'utf8'));
  assert.equal(m.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE name = 'avisos_turnos'").get().c, 0);
  const d = JSON.parse(m.prepare("SELECT data FROM docs WHERE col='ajustes' AND id='turnos_bonos'").get().data); assert.equal(d.historial, undefined); assert.equal(d.horarios.Diurno.inicio, '06:00'); ok('migración 0037 crea los avisos y la reversa los quita (sin perder los parámetros)');
}
console.log('\n' + n + ' pruebas de Nómina edita turnos pasaron.');
