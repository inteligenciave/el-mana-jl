/* Pruebas de «Crear bonos» (solo Gerencia): permisos, nuevas medidas y destinatarios, rige desde el siguiente turno, auditoría, rutas y migración 0038. Base en memoria, datos inventados.
   Uso: node src/pruebas/bonos-crear.prueba.mjs */
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {crearDB} from './d1-falso.mjs';
import * as B from '../rrhh/bonos.js';
import * as BS from '../rrhh/bonos-servicio.js';
import * as T from '../rrhh/turnos.js';
import * as G from '../rrhh/grupos.js';
import {rutasRrhh} from '../rrhh/rutas.js';

let n = 0; const ok = m => { n++; console.log('  ok · ' + m); };
const VE = (f, h, m = 0) => { const [y, mo, d] = f.split('-').map(Number); return Date.UTC(y, mo - 1, d, h + 4, m); };
const rechaza = async (p, re) => { try { await p; } catch (e) { assert.match(String(e.message), re); return e; } assert.fail('debía rechazar: ' + re); };

// ---- 1. Reglas puras ----
const nuevo = (o = {}) => ({nombre: 'Bono de ejemplo', forma: 'meta_fija', fuente: 'kilos_empaque', quienes: 'turno', params: {meta: 500, monto: 2}, ...o});
assert.ok(B.puedeCrearBonos('dueno')); for (const r of ['adm', 'rrhh', 'produccion', 'ventas', 'compras']) assert.equal(B.puedeCrearBonos(r), false); ok('solo Gerencia puede crear bonos');
let v = B.validarEsquema(nuevo({quienes: 'grupo_turno'})); assert.equal(v.ok.quienes, 'grupo_turno'); assert.equal(v.ok.destino, null); ok('a quién: el grupo asignado al turno');
v = B.validarEsquema(nuevo({quienes: 'area', area: 'empaque'})); assert.equal(v.ok.destino.area, 'Empaque'); assert.ok(B.validarEsquema(nuevo({quienes: 'area', area: 'Directiva'})).error); assert.ok(B.validarEsquema(nuevo({quienes: 'area'})).error); ok('a quién: un área de la planta (se corrige mayúsculas; Directiva u otra de oficina no)');
v = B.validarEsquema(nuevo({quienes: 'actividad', etapa: 'fritado'})); assert.equal(v.ok.destino.etapa, 'fritado'); assert.ok(B.validarEsquema(nuevo({quienes: 'actividad', etapa: 'lavado'})).error); assert.ok(B.validarEsquema(nuevo({quienes: 'actividad'})).error); ok('a quién: quienes hicieron una actividad (solo las que tienen marca por persona)');
v = B.validarEsquema(nuevo({forma: 'actividad', fuente: 'actividad', etapa: 'fritado', params: {monto: 1.5}})); assert.equal(v.ok.params.etapa, 'fritado'); assert.equal(v.ok.params.monto, 1.5);
assert.ok(B.validarEsquema(nuevo({forma: 'actividad', fuente: 'actividad', params: {monto: 1}})).error); assert.ok(B.validarEsquema(nuevo({forma: 'meta_fija', fuente: 'actividad', etapa: 'fritado'})).error); ok('medida «actividad»: pide la actividad y solo se paga como actividad');
for (const [forma, params] of [['meta_fija', {meta: 5, monto: 1}], ['escalones', {escalones: [{desde: 5, monto: 1}]}], ['por_unidad', {meta: 5, monto_base: 1, bloque: 2, monto_bloque: 1}]]) for (const fuente of ['kilos_empaque', 'bultos_empaque', 'kilos_fritado']) assert.ok(B.validarEsquema(nuevo({forma, fuente, params})).ok);
ok('las tres formas (meta fija, escalones, por unidad) con kilos y bultos');
const fija = B.validarEsquema({nombre: 'Nuevo nombre', forma: 'escalones', fuente: 'actividad', quienes: 'turno', params: {meta: 600, monto: 3}}, {nombre: 'X', forma: 'meta_fija', fuente: 'kilos_empaque', quienes: 'area', destino: {area: 'Empaque'}, params: {}, base: false}, true);
assert.equal(fija.ok.forma, 'meta_fija'); assert.equal(fija.ok.quienes, 'area'); assert.equal(fija.ok.destino.area, 'Empaque'); assert.equal(fija.ok.params.monto, 3); ok('quien no es Gerencia, al editar un bono, solo cambia nombre, metas y montos');
assert.equal(B.rigeEn({desde_ts: 0}, 5), true); assert.equal(B.rigeEn({desde_ts: 100}, 99), false); assert.equal(B.rigeEn({desde_ts: 100}, 100), true); ok('un bono rige desde el turno que empieza en su instante de inicio');
const par = T.parametros({horarios: {}}), F = '2026-11-02', FN = '2026-11-03';
assert.equal(BS.proximoTurnoTs(par, VE(F, 10)), VE(F, 18)); assert.equal(BS.proximoTurnoTs(par, VE(F, 17, 30)), VE(F, 18)); assert.equal(BS.proximoTurnoTs(par, VE(F, 20)), VE(FN, 7)); assert.equal(BS.proximoTurnoTs(par, VE(FN, 3)), VE(FN, 7)); assert.equal(BS.proximoTurnoTs(par, VE(F, 6, 59)), VE(F, 7));
ok('siguiente turno: de día entra el Nocturno de las 18:00; de noche o madrugada, el Diurno de las 07:00');

// ---- 2. Servicio ----
const db = crearDB(), raw = db.raw, dueno = {db, rol: 'dueno'}, adm = {db, rol: 'adm'}, nom = {db, rol: 'rrhh'};
const doc = (col, id, d) => raw.prepare('INSERT OR REPLACE INTO docs (col, id, data, updated) VALUES (?,?,?,?)').run(col, id, JSON.stringify({id, ...d}), Date.now());
doc('empleados', 'E1', {n: 'Ana Empaque', area: 'Empaque', estado: 'activo'}); doc('empleados', 'E2', {n: 'Beto Empaque', area: 'Empaque', estado: 'activo'}); doc('empleados', 'E3', {n: 'Carla Lavado', area: 'Lavado', estado: 'activo'}); doc('empleados', 'E4', {n: 'Dani Fritura', area: 'Freído y procesamiento', estado: 'activo'});
const marca = (id, fecha, turno, h) => raw.prepare("INSERT INTO marcas (empleado_id, fecha, entrada_ts, salida_ts, turno, quien, creado_ts, origen) VALUES (?,?,?,?,?,'rrhh',1,'manual')").run(id, fecha, VE(fecha, h), VE(fecha, h + 9), turno);
for (const id of ['E1', 'E2', 'E3', 'E4']) marca(id, F, 'Diurno', 7);
raw.prepare("INSERT INTO movimientos_proceso (id_turno, etapa, sentido, kilos, rol, ts, estado, ajuste) VALUES (1,'empacado','ENTRA',900,'produccion',?,'VIGENTE',0)").run(VE(F, 12));
raw.prepare("INSERT INTO movimientos_proceso (id_turno, etapa, sentido, kilos, rol, ts, estado, ajuste) VALUES (1,'empacado','ENTRA',900,'produccion',?,'VIGENTE',0)").run(VE(F, 20));
raw.prepare("INSERT INTO turnos (fecha, estado, abierto_ts, abierto_rol) VALUES ('2026-01-05', 'ABIERTO', 1, 'Producción')").run();
raw.prepare("INSERT INTO etapa_personas (id_turno, etapa, empleado_id, estado, ts, rol) VALUES (1,'fritado','E4','VIGENTE',?,'produccion')").run(VE(F, 11));
// Grupo 1 (Ana y Carla) tiene el turno Diurno esa semana; Grupo 2 el Nocturno
raw.prepare("INSERT INTO grupo_miembros (empleado_id, grupo_id, ts) VALUES ('E1',1,1),('E3',1,1),('E2',2,1),('E4',2,1)").run();
raw.prepare("INSERT INTO grupo_semana (semana, grupo_id, turno, quien, ts) VALUES (?,1,'Diurno','rrhh',1),(?,2,'Nocturno','rrhh',1)").run(G.lunesDe(F), G.lunesDe(F));

await rechaza(BS.guardarEsquema(adm, null, nuevo()), /Solo Gerencia crea/); await rechaza(BS.guardarEsquema(nom, null, nuevo()), /Solo Gerencia crea/); await rechaza(BS.guardarEsquema({db, rol: 'produccion'}, null, nuevo()), /no ve los bonos/);
assert.equal(raw.prepare("SELECT COUNT(*) AS c FROM bonos_esquemas WHERE base = 0").get().c, 0); ok('el servidor rechaza crear a Administración, Nómina y Producción (y no deja nada guardado)');
assert.equal((await BS.listar(dueno)).puede_crear, true); assert.equal((await BS.listar(adm)).puede_crear, false); assert.equal((await BS.listar(nom)).puede_crear, false); assert.equal((await BS.seguimiento(adm, F, 'Diurno')).puede_crear, false); ok('la pantalla recibe puede_crear solo para Gerencia');

const antes = Date.now();
let L = await BS.guardarEsquema(dueno, null, nuevo({nombre: 'Kilos por grupo', quienes: 'grupo_turno', params: {meta: 800, monto: 2}}));
const bg = L.esquemas.find(e => e.nombre === 'Kilos por grupo'); assert.ok(bg && !bg.base && bg.activo && bg.desde_ts > antes); assert.ok(bg.rige && bg.rige.turno); assert.equal(bg.quienes_txt.includes('grupo'), true); ok('Gerencia crea un bono: queda activo y rige desde el siguiente turno (la lista dice cuándo)');
L = await BS.guardarEsquema(dueno, null, nuevo({nombre: 'Kilos por área', quienes: 'area', area: 'Empaque', params: {meta: 800, monto: 2}}));
L = await BS.guardarEsquema(dueno, null, nuevo({nombre: 'Por actividad', forma: 'actividad', fuente: 'actividad', quienes: 'actividad', etapa: 'fritado', params: {monto: 1.5}}));
L = await BS.guardarEsquema(dueno, null, nuevo({nombre: 'Bultos escalones', forma: 'escalones', fuente: 'bultos_empaque', quienes: 'turno', params: {escalones: [{desde: 10, monto: 1}, {desde: 20, monto: 2}]}}));
const por = Object.fromEntries(L.esquemas.map(e => [e.nombre, e])); assert.equal(por['Kilos por área'].destino.area, 'Empaque'); assert.equal(por['Por actividad'].params.etapa, 'fritado'); assert.equal(por['Por actividad'].unidad, 'jornada'); ok('también por área, por actividad y por escalones');

// todavía no rige para turnos ya empezados: seguimiento y aplicación manual no lo incluyen
let s = await BS.seguimiento(dueno, F, 'Diurno'); assert.equal(s.esquemas.length, 3); let r = await BS.aplicarManual(dueno, {fecha: F, turno: 'Diurno'}); assert.ok(!r.informe.some(x => /Kilos por|Por actividad|Bultos/.test(x.esquema))); ok('un bono nuevo no toca turnos ya empezados o cerrados (ni en vivo ni al aplicar a mano)');
// se mueve su inicio al Diurno F para probar quiénes cobran
raw.prepare("UPDATE bonos_esquemas SET desde_ts = ? WHERE base = 0").run(VE(F, 7));
s = await BS.seguimiento(dueno, F, 'Diurno'); const x = n => s.esquemas.find(e => e.esquema.nombre === n);
assert.equal(s.esquemas.length, 7); assert.deepEqual(x('Kilos por grupo').personas.map(p => p.id).sort(), ['E1', 'E3']); assert.deepEqual(x('Kilos por área').personas.map(p => p.id).sort(), ['E1', 'E2']); assert.deepEqual(x('Por actividad').personas.map(p => p.id), ['E4']);
assert.equal(x('Kilos por grupo').evaluacion.califica, true); assert.equal(x('Kilos por grupo').evaluacion.monto, 2); assert.equal(x('Por actividad').evaluacion.monto, 1.5); ok('en vivo: paga al grupo asignado al turno, a las personas del área y a quienes hicieron la actividad (solo quienes marcaron)');
s = await BS.seguimiento(dueno, F, 'Nocturno'); assert.equal(s.esquemas.find(e => e.esquema.nombre === 'Kilos por grupo').personas.length, 0); ok('el grupo del otro turno no cobra en este turno');
// aplicación automática y deshacer
r = await BS.alCerrarTurno(db, VE(F, 16, 30)); assert.equal(r.informe.find(i => i.esquema === 'Kilos por grupo').estado, 'aplicado'); assert.equal(raw.prepare("SELECT COUNT(*) AS c FROM bonos_aplicados_emp e JOIN bonos_aplicados a ON a.id = e.aplicado_id WHERE a.esquema_nombre = 'Por actividad'").get().c, 1);
assert.equal(raw.prepare("SELECT SUM(e.monto) AS m FROM bonos_aplicados_emp e JOIN bonos_aplicados a ON a.id = e.aplicado_id WHERE a.esquema_nombre = 'Kilos por grupo'").get().m, 4); ok('se aplica solo al cerrar el turno, como los demás');
const ap = raw.prepare("SELECT id FROM bonos_aplicados WHERE esquema_nombre = 'Kilos por grupo'").get().id; s = await BS.deshacer(adm, {id: ap}); assert.equal(s.esquemas.find(e => e.esquema.nombre === 'Kilos por grupo').aplicado.estado, 'REVISION'); ok('se puede deshacer como los demás');
// Administración sigue editando metas y montos de uno creado por Gerencia, sin cambiar a quién se paga
const idg = por['Kilos por grupo'].id; L = await BS.guardarEsquema(adm, idg, {nombre: 'Kilos por grupo', forma: 'escalones', fuente: 'bultos_empaque', quienes: 'turno', params: {meta: 900, monto: 3}});
const g2 = L.esquemas.find(e => e.id === idg); assert.equal(g2.params.meta, 900); assert.equal(g2.params.monto, 3); assert.equal(g2.quienes, 'grupo_turno'); assert.equal(g2.forma, 'meta_fija'); assert.equal(g2.fuente, 'kilos_empaque'); assert.equal(g2.desde_ts, VE(F, 7)); ok('Administración cambia metas y montos de un bono creado, pero no su forma ni a quién se paga');
L = await BS.guardarEsquema(dueno, idg, {nombre: 'Kilos por grupo', forma: 'meta_fija', fuente: 'kilos_empaque', quienes: 'area', area: 'Fritura', params: {meta: 900, monto: 3}}); assert.equal(L.esquemas.find(e => e.id === idg).quienes, 'area'); ok('Gerencia sí puede cambiar a quién se paga');
// auditoría
const au = raw.prepare("SELECT * FROM auditoria_sistema WHERE ent = 'bono' AND accion = 'creó un bono' ORDER BY id").all(); assert.equal(au.length, 4); assert.ok(au.every(a => a.rol === 'Gerencia')); const d0 = JSON.parse(au[0].detalle); assert.ok(d0.despues.a_quien && d0.despues.rige_desde && d0.despues.params.monto === 2); ok('crear un bono queda en la auditoría (quién, qué y desde cuándo rige)');
assert.ok(raw.prepare("SELECT COUNT(*) AS c FROM auditoria_sistema WHERE ent = 'bono' AND accion = 'cambió un bono'").get().c >= 2); ok('cambiar un bono también');

// ---- 3. Rutas ----
const rq = (rol, m, p, body) => rutasRrhh(new Request('http://x/api/h' + p, {method: m, headers: {'x-rol': rol, 'content-type': 'application/json'}, body: body ? JSON.stringify(body) : undefined}), {DB: db}, new URL('http://x/api/h' + p));
for (const rol of ['adm', 'rrhh', 'produccion', 'ventas']) assert.equal((await rq(rol, 'POST', '/bonos/esquemas', nuevo({nombre: 'Intento ' + rol}))).status, 403);
assert.equal((await rq('dueno', 'POST', '/bonos/esquemas', nuevo({nombre: 'Por ruta', quienes: 'area', area: 'Empaque'}))).status, 201); assert.equal((await rq('dueno', 'POST', '/bonos/esquemas', nuevo({nombre: 'Mal área', quienes: 'area', area: 'Nada'}))).status, 400);
assert.equal((await rq('adm', 'PUT', '/bonos/esquemas/' + idg, nuevo({nombre: 'Kilos por grupo'}))).status, 200); assert.equal(raw.prepare("SELECT COUNT(*) AS c FROM bonos_esquemas WHERE nombre LIKE 'Intento%'").get().c, 0); ok('rutas: crear devuelve 403 a Administración, Nómina, Producción y Ventas; 201 a Gerencia; Administración sigue editando (200)');

// ---- 4. Migración 0038 y su reversa ----
{
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations'), rv = path.join(dir, '..', 'reversa', '0038_bonos_crear_reversa.sql');
  const m = new DatabaseSync(':memory:'); for (const f of readdirSync(dir).filter(x => x.endsWith('.sql')).sort().filter(x => x < '0038')) m.exec(readFileSync(path.join(dir, f), 'utf8'));
  m.prepare("INSERT INTO bonos_esquemas (codigo, nombre, forma, fuente, quienes, params, creado_ts, actualizado_ts) VALUES ('propio-a','Viejo propio','escalones','kilos_empaque','turno','{}',1,1)").run();
  m.exec(readFileSync(path.join(dir, '0038_bonos_crear.sql'), 'utf8'));
  assert.equal(m.prepare('SELECT COUNT(*) AS c FROM bonos_esquemas').get().c, 4); assert.equal(m.prepare("SELECT desde_ts AS d FROM bonos_esquemas WHERE codigo = 'propio-a'").get().d, 0); assert.equal(m.prepare("SELECT COUNT(*) AS c FROM bonos_esquemas WHERE base = 1").get().c, 3);
  m.prepare("INSERT INTO bonos_esquemas (codigo, nombre, forma, fuente, quienes, params, creado_ts, actualizado_ts, destino, desde_ts) VALUES ('propio-b','Nuevo','actividad','actividad','area','{}',1,1,'{\"area\":\"Empaque\"}',99)").run(); ok('migración 0038: conserva los 4 bonos que había y acepta las medidas y destinatarios nuevos');
  assert.throws(() => m.prepare("INSERT INTO bonos_esquemas (codigo, nombre, forma, fuente, quienes, params, creado_ts, actualizado_ts) VALUES ('x','x','meta_fija','inventada','turno','{}',1,1)").run());
  m.exec(readFileSync(rv, 'utf8')); assert.equal(m.prepare('SELECT COUNT(*) AS c FROM bonos_esquemas').get().c, 4); assert.equal(m.prepare("SELECT COUNT(*) AS c FROM bonos_esquemas WHERE codigo = 'propio-b'").get().c, 0); assert.ok(!m.prepare('PRAGMA table_info(bonos_esquemas)').all().some(c => c.name === 'destino')); ok('reversa 0038: vuelve a la tabla anterior, conserva lo que cabe y quita lo creado con medidas nuevas');
}
console.log('\n' + n + ' pruebas de crear bonos pasaron.');
