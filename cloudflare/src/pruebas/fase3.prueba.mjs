/* Pruebas de la fase 3: bonos en dólares (esquemas, seguimiento en vivo, aplicación al cerrar el turno con deshacer) y fritura por persona. Base en memoria, datos inventados.
   Uso: node src/pruebas/fase3.prueba.mjs */
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {crearDB} from './d1-falso.mjs';
import * as B from '../rrhh/bonos.js';
import * as BS from '../rrhh/bonos-servicio.js';
import * as BR from '../rrhh/bonos-repo.js';
import * as R from '../rrhh/repo.js';
import * as T from '../rrhh/turnos.js';
import * as PS from '../produccion/servicio.js';
import {rutasRrhh} from '../rrhh/rutas.js';

let n = 0; const ok = m => { n++; console.log('  ok · ' + m); };
const VE = (f, h, m = 0) => { const [y, mo, d] = f.split('-').map(Number); return Date.UTC(y, mo - 1, d, h + 4, m); };
const rechaza = async (p, re) => { try { await p; } catch (e) { assert.match(String(e.message), re); return; } assert.fail('debía rechazar: ' + re); };

// ---- 1. Reglas puras ----
const E = {
  empaque: {forma: 'meta_fija', fuente: 'bultos_empaque', params: {meta: 130, monto: 3, metas_presentacion: [{gramos: 1000, meta: 130}, {gramos: 400, meta: 130}, {gramos: 200, meta: 150}]}},
  prod: {forma: 'por_unidad', fuente: 'kilos_empaque', params: {meta: 1700, monto_base: 3, bloque: 100, monto_bloque: 1}},
  fri: {forma: 'actividad', fuente: 'fritura', params: {monto: 3}}
};
assert.equal(B.gramosDe('1 kg'), 1000); assert.equal(B.gramosDe('400 g'), 400); assert.equal(B.gramosDe('200gr'), 200); assert.equal(B.gramosDe('0,4 kg'), 400); assert.equal(B.gramosDe('Salsa'), null); ok('gramaje: 1 kg, 400 g, 200 gr, 0,4 kg; sin gramaje = null');
const emp = b => B.evaluar(E.empaque, {valor: b.reduce((a, x) => a + x.bultos, 0), por_presentacion: b});
assert.equal(emp([{gramos: 1000, bultos: 129}]).califica, false); assert.equal(emp([{gramos: 1000, bultos: 129}]).falta, 1); assert.equal(emp([{gramos: 1000, bultos: 130}]).califica, true); assert.equal(emp([{gramos: 1000, bultos: 130}]).monto, 3); ok('empaque 1 kg: 129 no, 130 sí ($ 3)');
assert.equal(emp([{gramos: 400, bultos: 129}]).califica, false); assert.equal(emp([{gramos: 400, bultos: 131}]).califica, true); ok('empaque 400 g: meta 130 (igual o más)');
assert.equal(emp([{gramos: 200, bultos: 149}]).califica, false); assert.equal(emp([{gramos: 200, bultos: 150}]).califica, true); assert.equal(emp([{gramos: 200, bultos: 140}]).falta, 10); ok('empaque 200 g: 149 no, 150 sí; faltan 10');
assert.equal(emp([{gramos: 200, bultos: 140}, {gramos: 1000, bultos: 100}]).califica, false); assert.equal(emp([{gramos: 200, bultos: 140}, {gramos: 1000, bultos: 135}]).califica, true); ok('presentaciones mezcladas: cada una con su meta; basta que una cumpla');
assert.equal(emp([{gramos: 500, bultos: 999}]).califica, false); assert.equal(emp([]).califica, false); ok('una presentación sin meta (u otra cosa) no cuenta');
const pr = k => B.evaluar(E.prod, {valor: k});
for (const [k, m, c] of [[0, 0, false], [1500, 0, false], [1699, 0, false], [1699.9, 0, false], [1700, 3, true], [1799, 3, true], [1799.9, 3, true], [1800, 4, true], [1899, 4, true], [1900, 5, true], [2500, 11, true]]) { const r = pr(k); assert.equal(r.monto, m, k + ' kg'); assert.equal(r.califica, c); }
assert.equal(pr(1650).falta, 50); ok('producción: sin bono hasta 1.700; 1.700 = $ 3; 1.799 = $ 3; 1.800 = $ 4; solo bloques COMPLETOS');
assert.equal(B.evaluar({...E.prod, params: {...E.prod.params, tope: 6}}, {valor: 2500}).monto, 6); ok('tope opcional por persona');
assert.equal(B.evaluar(E.fri, {valor: 0}).califica, false); assert.equal(B.evaluar(E.fri, {valor: 2}).monto, 3); ok('fritura: $ 3 fijos a quien fue marcado');
const esc = {forma: 'escalones', fuente: 'kilos_empaque', params: {escalones: [{desde: 1000, monto: 1}, {desde: 1500, monto: 2}]}};
assert.equal(B.evaluar(esc, {valor: 999}).califica, false); assert.equal(B.evaluar(esc, {valor: 1000}).monto, 1); assert.equal(B.evaluar(esc, {valor: 1700}).monto, 2); assert.equal(B.evaluar(esc, {valor: 1200}).falta, 300); ok('escalones: el más alto alcanzado');
const mf = {forma: 'meta_fija', fuente: 'kilos_empaque', params: {meta: 500, monto: 2}}; assert.equal(B.evaluar(mf, {valor: 499.9}).califica, false); assert.equal(B.evaluar(mf, {valor: 500}).monto, 2); ok('meta fija');

// ---- 2. Validación de esquemas ----
const v1 = B.validarEsquema({nombre: 'Bono Extra', forma: 'meta_fija', fuente: 'kilos_empaque', quienes: 'turno', params: {meta: '800', monto: '2.5'}});
assert.equal(v1.ok.params.meta, 800); assert.equal(v1.ok.params.monto, 2.5);
assert.ok(B.validarEsquema({nombre: 'x', forma: 'meta_fija', fuente: 'kilos_empaque', quienes: 'turno', params: {meta: 1, monto: 1}}).error); assert.ok(B.validarEsquema({nombre: 'Malo', forma: 'meta_fija', fuente: 'kilos_empaque', quienes: 'turno', params: {meta: -1, monto: 1}}).error);
assert.ok(B.validarEsquema({nombre: 'Malo', forma: 'actividad', fuente: 'kilos_empaque', quienes: 'turno', params: {monto: 1}}).error); assert.ok(B.validarEsquema({nombre: 'Malo', forma: 'escalones', fuente: 'kilos_empaque', quienes: 'turno', params: {escalones: [{desde: 5, monto: 1}, {desde: 5, monto: 2}]}}).error);
assert.ok(B.validarEsquema({nombre: 'Malo', forma: 'meta_fija', fuente: 'kilos_empaque', quienes: 'turno', params: {meta: 'abc', monto: 1}}).error); ok('validación: nombre, números, formas y medidas que no combinan');
const base = {nombre: 'Bono Empaque', forma: 'meta_fija', fuente: 'bultos_empaque', quienes: 'empaque', base: true}, vb = B.validarEsquema({nombre: 'Otro nombre', forma: 'escalones', fuente: 'fritura', quienes: 'fritura', params: {meta: 100, monto: 4}}, base);
assert.equal(vb.ok.forma, 'meta_fija'); assert.equal(vb.ok.fuente, 'bultos_empaque'); assert.equal(vb.ok.quienes, 'empaque'); ok('un bono de fábrica conserva su forma, su medida y a quién se paga');

// ---- 3. Servicio: base de datos con datos de ejemplo ----
const db = crearDB(), raw = db.raw, dueno = {db, rol: 'dueno'}, adm = {db, rol: 'adm'}, nom = {db, rol: 'rrhh'}, prod = {db, rol: 'produccion'};
const doc = (col, id, d) => raw.prepare('INSERT OR REPLACE INTO docs (col, id, data, updated) VALUES (?,?,?,?)').run(col, id, JSON.stringify({id, ...d}), Date.now());
doc('empleados', 'E1', {n: 'Ana Empaque', area: 'Empaque', cargo: 'Empacadora', estado: 'activo'}); doc('empleados', 'E2', {n: 'Beto Empaque', area: 'Empaque', estado: 'activo'});
doc('empleados', 'E3', {n: 'Carla Lavado', area: 'Lavado', estado: 'activo'}); doc('empleados', 'E4', {n: 'Dani Fritura', area: 'Freído y procesamiento', estado: 'activo'}); doc('empleados', 'E5', {n: 'Eva Noche', area: 'Empaque', estado: 'activo'});
const F = '2026-11-02', FN = '2026-11-03';
const marca = (id, fecha, turno, h) => raw.prepare("INSERT INTO marcas (empleado_id, fecha, entrada_ts, salida_ts, turno, quien, creado_ts, origen) VALUES (?,?,?,?,?,'rrhh',1,'manual')").run(id, fecha, VE(fecha, h), VE(fecha, h + 9), turno);
for (const id of ['E1', 'E2', 'E3', 'E4']) marca(id, F, 'Diurno', 7); marca('E5', F, 'Nocturno', 18);
const prodn = (sku, nombre, g) => Number(raw.prepare('INSERT INTO productos (codigo_sku, nombre, gramaje) VALUES (?,?,?)').run(sku, nombre, g).lastInsertRowid);
const P1 = prodn('P1', 'Papas clásicas', '1 kg'), P2 = prodn('P2', 'Papas clásicas', '200 g'), P4 = prodn('P4', 'Papas clásicas', '400 g'), PSA = prodn('S1', 'Salsa', '250 ml');
const emb = (idp, b, h, estado = 'VIGENTE') => raw.prepare("INSERT INTO empaque_turno (id_turno, id_producto, bultos, rol, ts, estado) VALUES (1,?,?,'empaque',?,?)").run(idp, b, VE(F, h), estado);
const mov = (et, sen, kg, h, aj = 0, estado = 'VIGENTE') => raw.prepare("INSERT INTO movimientos_proceso (id_turno, etapa, sentido, kilos, rol, ts, estado, ajuste) VALUES (1,?,?,?,'produccion',?,?,?)").run(et, sen, kg, VE(F, h), estado, aj);

// antes de cualquier dato: nadie califica
let s = await BS.seguimiento(dueno, F, 'Diurno');
assert.equal(s.esquemas.length, 3); assert.ok(s.esquemas.every(x => !x.evaluacion.califica)); ok('seguimiento vacío: tres bonos de fábrica, ninguno califica');
emb(P1, 100, 9); emb(P2, 149, 10); emb(PSA, 999, 10); emb(P4, 500, 11, 'EN_ESPERA'); mov('empacado', 'ENTRA', 1650, 12); mov('empacado', 'ENTRA', 5000, 13, 0, 'EN_ESPERA'); mov('empacado', 'ENTRA', 777, 14, 0, 'RECHAZADO');
s = await BS.seguimiento(adm, F, 'Diurno');
let xe = s.esquemas.find(x => x.esquema.codigo === 'empaque'), xp = s.esquemas.find(x => x.esquema.codigo === 'produccion');
assert.equal(xe.evaluacion.califica, false); assert.match(xe.evaluacion.texto, /faltan/); assert.equal(xp.evaluacion.valor, 1650); assert.equal(xp.evaluacion.falta, 50); assert.equal(xp.evaluacion.califica, false); ok('solo cuenta lo VIGENTE (no lo en espera ni rechazado); muestra cuánto falta (50 kg; empaque cerca)');
assert.deepEqual(xe.personas.map(p => p.id).sort(), ['E1', 'E2']); assert.equal(s.resumen.en_empaque, 2); assert.equal(s.resumen.presentes, 4); ok('Empaque solo paga a quienes trabajaron en Empaque ese turno (E3 y E4 no; E5 es del otro turno)');
emb(P2, 1, 11); mov('empacado', 'ENTRA', 150, 12); mov('empacado', 'ENTRA', 10, 15, 0); // 200 g llega a 150 bultos; kilos 1650+150+10=1810
mov('empacado', 'SALE', 5, 16, 1); mov('empacado', 'SALE', 300, 16, 0); // el ajuste a la baja (1) resta; la salida normal no
s = await BS.seguimiento(dueno, F, 'Diurno'); xe = s.esquemas.find(x => x.esquema.codigo === 'empaque'); xp = s.esquemas.find(x => x.esquema.codigo === 'produccion');
assert.equal(xe.evaluacion.califica, true); assert.equal(xp.evaluacion.valor, 1805); assert.equal(xp.evaluacion.monto, 4); assert.equal(xp.personas.length, 4); ok('200 g llega a 150 = califica; producción 1.805 kg = $ 4 (base 3 + 1 bloque); a todos los del turno');
const fri0 = s.esquemas.find(x => x.esquema.codigo === 'fritura'); assert.equal(fri0.evaluacion.califica, false); ok('fritura sin marcas: no califica');

// fritura por persona (producción): marcar, repetir, quitar, permisos
raw.exec('DELETE FROM turnos'); raw.prepare("INSERT INTO turnos (fecha, estado, abierto_ts, abierto_rol, inicio_ts) VALUES ('2026-01-05', 'ABIERTO', ?, 'Producción', 1)").run(Date.now()); const tn = raw.prepare("SELECT id_turno FROM turnos WHERE estado = 'ABIERTO'").get().id_turno;
assert.deepEqual((await PS.personal(prod)).personas.map(p => p.id).includes('E4'), true);
let t = await PS.marcarPersonaEtapa(prod, {etapa: 'fritado', empleado_id: 'E4'}); assert.deepEqual(t.turno.personas_fritura.map(x => x.id), ['E4']); ok('Producción marca a la persona que fríe dentro de la etapa');
await rechaza(PS.marcarPersonaEtapa(prod, {etapa: 'fritado', empleado_id: 'E4'}), /ya está marcada/); await rechaza(PS.marcarPersonaEtapa(prod, {etapa: 'fritado', empleado_id: 'ZZ'}), /no existe/); await rechaza(PS.marcarPersonaEtapa(prod, {etapa: 'lavado', empleado_id: 'E3'}), /fritura/);
await rechaza(PS.marcarPersonaEtapa({db, rol: 'ventas'}, {etapa: 'fritado', empleado_id: 'E3'}), /Solo Producción/); ok('no se repite, no inventa personas, solo fritura y solo quien lleva el turno');
t = await PS.marcarPersonaEtapa(prod, {etapa: 'fritado', empleado_id: 'E3'}); t = await PS.marcarPersonaEtapa(prod, {etapa: 'fritado', empleado_id: 'E3', quitar: true}); assert.deepEqual(t.turno.personas_fritura.map(x => x.id), ['E4']); ok('se puede quitar a alguien mal marcado');
raw.prepare("UPDATE etapa_personas SET ts = ? WHERE id_turno = ?").run(VE(F, 11), tn); // la marca cae dentro del turno Diurno de ejemplo
s = await BS.seguimiento(dueno, F, 'Diurno'); const fr = s.esquemas.find(x => x.esquema.codigo === 'fritura'); assert.equal(fr.evaluacion.califica, true); assert.deepEqual(fr.personas.map(p => p.id), ['E4']); assert.equal(fr.total_estimado, 3); ok('el Bono Fritura va a quien fue marcado ($ 3)');

// permisos
await rechaza(BS.seguimiento({db, rol: 'produccion'}, F, 'Diurno'), /no ve los bonos/); await rechaza(BS.guardarEsquema(nom, null, {nombre: 'Otro', forma: 'meta_fija', fuente: 'kilos_empaque', quienes: 'turno', params: {meta: 1, monto: 1}}), /Solo Gerencia crea/);
assert.ok((await BS.listar(nom)).esquemas.length >= 3); await rechaza(BS.aplicarManual(nom, {fecha: F, turno: 'Diurno'}), /Solo Gerencia y Administración/); ok('Nómina ve los bonos pero no los cambia; Producción no los ve');

// editar metas, crear un esquema nuevo, archivar
let L = await BS.guardarEsquema(adm, 1, {nombre: 'Bono Empaque', params: {meta: 130, monto: 4, metas_presentacion: [{gramos: 1000, meta: 130}, {gramos: 400, meta: 130}, {gramos: 200, meta: 150}]}});
assert.equal(L.esquemas.find(e => e.id === 1).params.monto, 4); L = await BS.guardarEsquema(dueno, 1, {nombre: 'Bono Empaque', params: {meta: 130, monto: 3, metas_presentacion: [{gramos: 1000, meta: 130}, {gramos: 400, meta: 130}, {gramos: 200, meta: 150}]}}); assert.equal(L.esquemas[0].params.monto, 3); ok('Administración y Gerencia editan metas y montos en dólares');
await rechaza(BS.guardarEsquema(adm, null, {nombre: 'Meta de kilos', forma: 'escalones', fuente: 'kilos_empaque', quienes: 'turno', params: {escalones: [{desde: 1000, monto: 1}]}}), /Solo Gerencia crea/);
L = await BS.guardarEsquema(dueno, null, {nombre: 'Meta de kilos', forma: 'escalones', fuente: 'kilos_empaque', quienes: 'turno', params: {escalones: [{desde: 1000, monto: 1}, {desde: 1500, monto: 2}]}});
const nuevo = L.esquemas.find(e => e.nombre === 'Meta de kilos'); assert.ok(nuevo && !nuevo.base && nuevo.activo); await rechaza(BS.archivarEsquema(adm, 1, true), /de fábrica/);
L = await BS.archivarEsquema(adm, nuevo.id, true); assert.equal(L.esquemas.find(e => e.id === nuevo.id).archivado, true); assert.equal((await BS.seguimiento(adm, F, 'Diurno')).esquemas.length, 3); ok('se crea un esquema con las formas existentes, se archiva y deja de seguirse');
assert.ok(raw.prepare("SELECT COUNT(*) AS c FROM auditoria_sistema WHERE ent = 'bono'").get().c >= 3); ok('crear, cambiar y archivar queda en la auditoría');

// aplicar al cerrar el turno (automático), no duplicar, deshacer, volver a aplicar
const cierre = VE(F, 16, 30); let r = await BS.alCerrarTurno(db, cierre);
assert.equal(r.turno, 'Diurno'); assert.equal(r.fecha, F); assert.deepEqual(r.informe.map(x => x.estado), ['aplicado', 'aplicado', 'aplicado']); ok('al cerrar el turno se aplican solos los tres bonos del turno donde cae el cierre');
const filas = raw.prepare("SELECT a.esquema_nombre AS n, e.empleado_id AS emp, e.monto FROM bonos_aplicados_emp e JOIN bonos_aplicados a ON a.id = e.aplicado_id ORDER BY a.id, e.id").all();
assert.equal(filas.filter(x => x.n === 'Bono Empaque').length, 2); assert.equal(filas.filter(x => x.n === 'Bono Producción').length, 4); assert.equal(filas.find(x => x.n === 'Bono Fritura').emp, 'E4');
assert.equal(filas.filter(x => x.emp === 'E1').reduce((a, x) => a + x.monto, 0), 7); assert.equal(filas.filter(x => x.emp === 'E3').reduce((a, x) => a + x.monto, 0), 4); assert.equal(filas.filter(x => x.emp === 'E4').reduce((a, x) => a + x.monto, 0), 7); ok('montos por persona: Ana $ 3 + $ 4, Carla $ 4, Dani $ 4 + $ 3 de fritura');
r = await BS.alCerrarTurno(db, cierre); assert.ok(r.informe.every(x => x.estado === 'ya_aplicado')); assert.equal(raw.prepare('SELECT COUNT(*) AS c FROM bonos_aplicados_emp').get().c, 7); ok('cerrar dos veces no paga dos veces');
let bon = await R.bonosEntre(db, F, F); assert.equal(bon.find(x => x.empleado_id === 'E1').monto, 7); ok('lo aplicado entra a la nómina (en dólares)');
const ap = raw.prepare("SELECT id FROM bonos_aplicados WHERE esquema_nombre = 'Bono Producción'").get().id;
s = await BS.deshacer(adm, {id: ap}); assert.equal(s.esquemas.find(x => x.esquema.codigo === 'produccion').aplicado.estado, 'REVISION'); bon = await R.bonosEntre(db, F, F); assert.equal(bon.find(x => x.empleado_id === 'E3'), undefined); assert.equal(bon.find(x => x.empleado_id === 'E1').monto, 3); ok('deshacer deja el bono en revisión y no entra a la nómina');
await rechaza(BS.deshacer(adm, {id: ap}), /ya está en revisión/); await rechaza(BS.deshacer(nom, {id: ap}), /Solo Gerencia y Administración/);
r = await BS.alCerrarTurno(db, cierre); assert.equal(r.informe.find(x => x.esquema === 'Bono Producción').estado, 'en_revision'); assert.equal((await R.bonosEntre(db, F, F)).find(x => x.empleado_id === 'E3'), undefined); ok('el cierre automático respeta lo que se deshizo');
s = await BS.aplicarManual(dueno, {fecha: F, turno: 'Diurno', esquema_id: 2}); assert.equal(s.informe[0].estado, 'aplicado'); assert.equal(s.esquemas.find(x => x.esquema.codigo === 'produccion').aplicado.estado, 'APLICADO'); assert.equal(raw.prepare("SELECT COUNT(*) AS c FROM bonos_aplicados_emp e JOIN bonos_aplicados a ON a.id = e.aplicado_id WHERE a.esquema_nombre = 'Bono Producción'").get().c, 4);
assert.equal((await R.bonosEntre(db, F, F)).find(x => x.empleado_id === 'E3').monto, 4); ok('volver a aplicar un bono en revisión lo paga una sola vez');
// ya pagado en nómina: no se deshace
raw.prepare("INSERT INTO pagos_nomina (empleado_id, periodo, desde, hasta, base, extra, bonos, ley, descuento_prestamo, neto, prestamos, detalle, fecha, forma, quien, ts, moneda) VALUES ('E3','semana',?,?,0,0,4,0,0,4,'[]','{}',?, 'Efectivo','rrhh',1,'USD')").run(F, '2026-11-08', FN);
const ap2 = raw.prepare("SELECT id FROM bonos_aplicados WHERE esquema_nombre = 'Bono Producción'").get().id; await rechaza(BS.deshacer(dueno, {id: ap2}), /ya entró en un pago/); ok('un bono ya pagado en nómina no se puede deshacer');

// turno nocturno: pertenece al día en que empieza; el cierre de madrugada cae en el día anterior
mov('empacado', 'ENTRA', 1900, 20); raw.prepare("UPDATE movimientos_proceso SET ts = ? WHERE kilos = 1900").run(VE(FN, 2)); // 02:00 del día siguiente = turno nocturno del día F
const sn = await BS.seguimiento(dueno, F, 'Nocturno'); const pn = sn.esquemas.find(x => x.esquema.codigo === 'produccion'); assert.equal(pn.evaluacion.valor, 1900); assert.equal(pn.evaluacion.monto, 5); assert.deepEqual(pn.personas.map(p => p.id), ['E5']);
r = await BS.alCerrarTurno(db, VE(FN, 4, 30)); assert.equal(r.turno, 'Nocturno'); assert.equal(r.fecha, F); ok('nocturno: el cierre de las 04:30 aplica al turno que empezó el día anterior (1.900 kg = $ 5)');
r = await BS.alCerrarTurno(db, VE(FN, 12)); assert.ok(r.omitido || r.turno); ok('un cierre fuera de todo turno no rompe nada');
assert.equal(BS.turnoActivo(T.parametros({horarios: {}}), VE(F, 10)).turno, 'Diurno'); assert.equal(BS.turnoActivo(T.parametros({horarios: {}}), VE(F, 22)).turno, 'Nocturno'); assert.equal(BS.turnoActivo(T.parametros({horarios: {}}), VE(FN, 3)).fecha, F); assert.equal(BS.turnoActivo(T.parametros({horarios: {}}), VE(F, 17, 30)).en_curso, false); ok('turno activo por hora y horario (Diurno, Nocturno y la madrugada del día siguiente)');

// ---- 4. Rutas HTTP ----
const rq = (rol, m, p, body) => rutasRrhh(new Request('http://x/api/h' + p, {method: m, headers: {'x-rol': rol, 'content-type': 'application/json'}, body: body ? JSON.stringify(body) : undefined}), {DB: db}, new URL('http://x/api/h' + p));
assert.equal((await rq('rrhh', 'GET', '/bonos')).status, 200); assert.equal((await rq('rrhh', 'GET', '/bonos/seguimiento?fecha=' + F + '&turno=Diurno')).status, 200); assert.equal((await rq('produccion', 'GET', '/bonos')).status, 403);
assert.equal((await rq('rrhh', 'POST', '/bonos/aplicar', {fecha: F, turno: 'Diurno'})).status, 403); assert.equal((await rq('adm', 'POST', '/bonos/esquemas', {nombre: 'Extra por bultos', forma: 'meta_fija', fuente: 'bultos_empaque', quienes: 'empaque', params: {meta: 300, monto: 1}})).status, 403); assert.equal((await rq('dueno', 'POST', '/bonos/esquemas', {nombre: 'Extra por bultos', forma: 'meta_fija', fuente: 'bultos_empaque', quienes: 'empaque', params: {meta: 300, monto: 1}})).status, 201);
assert.equal((await rq('adm', 'PUT', '/bonos/esquemas/99', {nombre: 'Nada', forma: 'meta_fija', fuente: 'bultos_empaque', quienes: 'turno', params: {meta: 1, monto: 1}})).status, 404); assert.equal((await rq('dueno', 'POST', '/bonos/esquemas', {nombre: 'Mal', forma: 'meta_fija', fuente: 'bultos_empaque', quienes: 'turno', params: {meta: -5, monto: 1}})).status, 400); ok('rutas /api/h/bonos: permisos, creación y errores');
assert.equal((await rq('dueno', 'POST', '/bonos', {fecha: F})).status, 404); ok('la ruta vieja de aplicar un solo bono por turno ya no existe');

// ---- 5. Migración 0030 y su reversa (con una regla vieja de ejemplo) ----
{
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations'), rv = path.join(dir, '..', 'reversa', '0030_bonos_esquemas_reversa.sql');
  const m = new DatabaseSync(':memory:'), fs = readdirSync(dir).filter(x => x.endsWith('.sql')).sort();
  for (const f of fs.filter(x => x < '0030')) m.exec(readFileSync(path.join(dir, f), 'utf8'));
  m.prepare("INSERT INTO docs (col, id, data, updated) VALUES ('ajustes','turnos_bonos',?,1)").run(JSON.stringify({id: 'turnos_bonos', bono: {tipo: 'por_kilo', valor: 0.5, meta_kg: 1000, tramos: []}}));
  m.prepare("INSERT INTO bonos_turno (fecha, turno, modo, kilos, calculado, total, quien, ts) VALUES ('2026-10-01','Diurno','turno',10,8,8,'dueno',1)").run();
  m.exec(readFileSync(path.join(dir, '0030_bonos_esquemas.sql'), 'utf8'));
  assert.equal(m.prepare('SELECT COUNT(*) AS c FROM bonos_esquemas').get().c, 3); assert.equal(m.prepare("SELECT json_extract(data, '$.valor') AS v FROM bonos_archivo").get().v, 0.5); assert.equal(m.prepare('SELECT total FROM bonos_turno').get().total, 8);
  m.exec(readFileSync(path.join(dir, '0030_bonos_esquemas.sql'), 'utf8')); assert.equal(m.prepare('SELECT COUNT(*) AS c FROM bonos_esquemas').get().c, 3); assert.equal(m.prepare('SELECT COUNT(*) AS c FROM bonos_archivo').get().c, 1); ok('migración 0030: siembra los 3 bonos, archiva la regla vieja sin borrarla y se puede repetir');
  m.exec(readFileSync(rv, 'utf8')); assert.equal(m.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE name IN ('bonos_esquemas','bonos_aplicados','bonos_aplicados_emp','bonos_archivo','etapa_personas')").get().c, 0); assert.equal(m.prepare('SELECT total FROM bonos_turno').get().total, 8);
  assert.equal(JSON.parse(m.prepare("SELECT data FROM docs WHERE id = 'turnos_bonos'").get().data).bono.valor, 0.5); ok('reversa 0030: quita lo nuevo y deja intactos la regla vieja y los bonos ya aplicados');
}
console.log('\n' + n + ' pruebas de la fase 3 pasaron.');
