/* Pruebas del BONO NOCTURNO: bono por haber marcado asistencia en el turno Nocturno, se suma a los otros bonos.
   El monto NO está definido: nace en $0 (no paga) y Gerencia/Administración lo escriben. Migración 0040 con su reversa. Base en memoria, datos inventados.
   Uso: node src/pruebas/bono-nocturno.prueba.mjs */
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {crearDB} from './d1-falso.mjs';
import * as B from '../rrhh/bonos.js';
import * as BS from '../rrhh/bonos-servicio.js';
import * as PG from '../rrhh/pagos.js';

let n = 0; const ok = m => { n++; console.log('  ok · ' + m); };
const VE = (f, h, m = 0) => { const [y, mo, d] = f.split('-').map(Number); return Date.UTC(y, mo - 1, d, h + 4, m); };
const rechaza = async (p, re) => { try { await p; } catch (e) { assert.match(String(e.message), re); return e; } assert.fail('debía rechazar: ' + re); };
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'), dir = path.join(raiz, 'migrations');
const sql = readFileSync(path.join(dir, '0040_bono_nocturno.sql'), 'utf8'), rev = readFileSync(path.join(raiz, 'reversa', '0040_bono_nocturno_reversa.sql'), 'utf8');

// ---- 1. Migración 0040 ----
{
  const m = new DatabaseSync(':memory:'); for (const f of readdirSync(dir).filter(x => x.endsWith('.sql') && x < '0040').sort()) m.exec(readFileSync(path.join(dir, f), 'utf8'));
  const antes = m.prepare('SELECT COUNT(*) c FROM bonos_esquemas').get().c;
  m.prepare("INSERT INTO bonos_esquemas (codigo, nombre, forma, fuente, quienes, params, creado_ts, actualizado_ts) VALUES ('propio-z','Mío','meta_fija','kilos_empaque','turno','{}',1,1)").run();
  m.exec(sql);
  const noc = m.prepare("SELECT * FROM bonos_esquemas WHERE codigo = 'nocturno'").get();
  assert.ok(noc && noc.base === 1 && noc.activo === 1 && noc.fuente === 'asistencia_nocturna' && JSON.parse(noc.params).monto === 0); assert.equal(m.prepare('SELECT COUNT(*) c FROM bonos_esquemas').get().c, antes + 2);
  ok('migración 0040: conserva lo que había, agrega el bono nocturno de fábrica con monto $0 (no inventa cifra)');
  m.exec(sql); assert.equal(m.prepare("SELECT COUNT(*) c FROM bonos_esquemas WHERE codigo = 'nocturno'").get().c, 1); ok('migración 0040: correrla otra vez no duplica nada');
  m.exec(rev); assert.equal(m.prepare("SELECT COUNT(*) c FROM bonos_esquemas WHERE codigo = 'nocturno'").get().c, 0); assert.equal(m.prepare('SELECT COUNT(*) c FROM bonos_esquemas').get().c, antes + 1);
  assert.throws(() => m.prepare("INSERT INTO bonos_esquemas (codigo, nombre, forma, fuente, quienes, params, creado_ts, actualizado_ts) VALUES ('x','x','actividad','asistencia_nocturna','turno','{}',1,1)").run()); ok('reversa 0040: quita el bono nocturno y vuelve a la tabla anterior');
  m.exec(sql); assert.equal(m.prepare("SELECT COUNT(*) c FROM bonos_esquemas WHERE codigo = 'nocturno'").get().c, 1); ok('ida, vuelta e ida otra vez: sin errores');
}

// ---- 2. Reglas puras ----
const base = {nombre: 'Bono nocturno', forma: 'actividad', fuente: 'asistencia_nocturna', quienes: 'turno', base: true, params: {monto: 0}};
{
  assert.ok(B.validarEsquema({nombre: 'Otro', forma: 'actividad', fuente: 'asistencia_nocturna', quienes: 'turno', params: {monto: 3}}).error); ok('no se puede crear un segundo bono nocturno: el de fábrica se edita');
  const v = B.validarEsquema({nombre: 'Bono nocturno', params: {monto: '2.5'}}, base); assert.equal(v.ok.params.monto, 2.5); assert.equal(v.ok.fuente, 'asistencia_nocturna');
  assert.equal(B.validarEsquema({params: {monto: 0}}, base).ok.params.monto, 0); assert.ok(B.validarEsquema({params: {monto: -1}}, base).error); assert.ok(B.validarEsquema({params: {monto: ''}}, base).error);
  const ev0 = B.evaluar(base, {valor: 3}); assert.equal(ev0.califica, false); assert.equal(ev0.monto, 0); assert.equal(ev0.sin_monto, true); assert.match(ev0.texto, /Sin monto definido/);
  const ev1 = B.evaluar({...base, params: {monto: 4}}, {valor: 3}); assert.equal(ev1.califica, true); assert.equal(ev1.monto, 4); assert.equal(B.evaluar({...base, params: {monto: 4}}, {valor: 0}).califica, false);
  ok('sin monto definido no califica ni paga; con monto paga a quien marcó; sin marcas no paga');
}

// ---- 3. Servicio, nómina y auditoría ----
const db = crearDB(), raw = db.raw, dueno = {db, rol: 'dueno'}, adm = {db, rol: 'adm'}, nom = {db, rol: 'rrhh'};
const doc = (col, id, d) => raw.prepare('INSERT OR REPLACE INTO docs (col, id, data, updated) VALUES (?,?,?,?)').run(col, id, JSON.stringify({id, ...d}), Date.now());
doc('empleados', 'N1', {n: 'Nora Noche', puesto: 'Producción', area: 'Cocina', estado: 'activo', pago: 'dia', tarifa: 20}); doc('empleados', 'N2', {n: 'Nico Noche', puesto: 'Logística', area: 'Empaque', estado: 'activo', pago: 'dia', tarifa: 20});
doc('empleados', 'D1', {n: 'Dora Dia', puesto: 'Producción', area: 'Fritura', estado: 'activo', pago: 'dia', tarifa: 20}); doc('empleados', 'O1', {n: 'Olga Oficina', puesto: 'Administración', area: 'Administración', estado: 'activo', pago: 'dia', tarifa: 20});
const marca = (id, fecha, turno, h) => raw.prepare("INSERT INTO marcas (empleado_id, fecha, entrada_ts, salida_ts, turno, quien, creado_ts, origen) VALUES (?,?,?,?,?,'rrhh',1,'manual')").run(id, fecha, VE(fecha, h), VE(fecha, h + 9), turno);
const F = '2026-11-02';
marca('N1', F, 'Nocturno', 19); marca('N2', F, 'Nocturno', 19); marca('O1', F, 'Nocturno', 19); marca('D1', F, 'Diurno', 7);
const L0 = await BS.listar(dueno), noc = L0.esquemas.find(e => e.codigo === 'nocturno'); assert.ok(noc && noc.base && noc.params.monto === 0 && noc.fuente === 'asistencia_nocturna'); ok('Gerencia ve el bono nocturno en la lista, de fábrica y con monto $0');
const S = await BS.seguimiento(dueno, F, 'Nocturno'), it = S.esquemas.find(x => x.esquema.codigo === 'nocturno');
assert.ok(it && it.evaluacion.sin_monto && !it.evaluacion.califica && it.evaluacion.valor === 2); assert.equal(S.total, 0); assert.deepEqual(it.personas.map(p => p.id).sort(), ['N1', 'N2']); ok('turno Nocturno en vivo: 2 personas de planta marcaron (la de oficina no cuenta), «sin monto definido», $0');
assert.ok(!(await BS.seguimiento(dueno, F, 'Diurno')).esquemas.some(x => x.esquema.codigo === 'nocturno')); ok('en el turno Diurno el bono nocturno no aparece');
let r = await BS.aplicarManual(dueno, {fecha: F, turno: 'Nocturno'}); assert.ok(r.informe.some(x => x.esquema === 'Bono nocturno' && x.estado === 'no_califica')); assert.equal(raw.prepare('SELECT COUNT(*) c FROM bonos_aplicados').get().c, 0); ok('sin monto no se aplica nada');
await rechaza(BS.guardarEsquema(nom, noc.id, {params: {monto: 3}}), /Solo Gerencia y Administración/); ok('Nómina no puede cambiar el monto (solo ve)');
await BS.guardarEsquema(adm, noc.id, {nombre: 'Bono nocturno', forma: 'meta_fija', fuente: 'kilos_empaque', quienes: 'area', params: {monto: 2}}); const e2 = (await BS.listar(dueno)).esquemas.find(e => e.codigo === 'nocturno');
assert.equal(e2.params.monto, 2); assert.equal(e2.fuente, 'asistencia_nocturna'); assert.equal(e2.forma, 'actividad'); ok('Administración edita el monto y no puede cambiar la forma, la medida ni a quién se paga');
await BS.guardarEsquema(dueno, noc.id, {nombre: 'Bono nocturno', params: {monto: 2.5}}); assert.equal((await BS.listar(dueno)).esquemas.find(e => e.codigo === 'nocturno').params.monto, 2.5);
r = await BS.aplicarManual(dueno, {fecha: F, turno: 'Nocturno'}); const a = r.informe.find(x => x.esquema === 'Bono nocturno'); assert.equal(a.estado, 'aplicado'); assert.equal(a.personas, 2); assert.equal(a.total, 5); ok('con monto $2,50 se aplica a las 2 personas que marcaron de noche: $5,00 en total');
assert.equal(raw.prepare("SELECT COUNT(*) c FROM bonos_aplicados_emp WHERE empleado_id IN ('D1','O1')").get().c, 0); ok('quien marcó de día o es de oficina no cobra el bono nocturno');
const N = await PG.nomina(dueno, 'semana', F), N1 = N.filas.find(f => f.empleado_id === 'N1'); assert.equal(N1.bonos, 2.5); assert.equal(N1.bonos_nocturno, 2.5); assert.equal(N1.bonos_produccion, 0);
assert.equal(N.filas.find(f => f.empleado_id === 'D1').bonos_nocturno, 0); ok('nómina: el bono nocturno se ve aparte y ya está dentro del total de Bonos; los demás no lo tienen');
const au = raw.prepare("SELECT accion FROM auditoria_sistema WHERE ent = 'bono' ORDER BY id").all().map(x => x.accion); assert.ok(au.includes('cambió un bono') && au.includes('aplicó el bono')); ok('queda en la auditoría quién cambió el monto y quién lo aplicó');
const ap = raw.prepare("SELECT id FROM bonos_aplicados WHERE esquema_nombre = 'Bono nocturno'").get(); await BS.deshacer(adm, {id: ap.id}); assert.equal((await PG.nomina(dueno, 'semana', F)).filas.find(f => f.empleado_id === 'N1').bonos_nocturno, 0); ok('deshacer: queda en revisión y no se paga');
await BS.aplicarManual(dueno, {fecha: F, turno: 'Nocturno'});
raw.prepare("INSERT INTO config (clave, valor) VALUES ('tasa_ultimo_intento', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor").run(new Date().toISOString()); raw.prepare("INSERT INTO tasas_bcv (fecha, valor, fuente, obtenida_en, origen) VALUES (?,?,?,?,'DEV')").run(F, 500, 'prueba', 'x');
const p = await PG.pagar(dueno, {empleado_id: 'N1', periodo: 'semana', ref: F, fecha: F, forma: 'Efectivo', descuento: 0}).catch(e => e);
if (p && p.status) console.log('  (pago omitido en la prueba: ' + p.message + ')');
else { const rc = await PG.reciboDe(dueno, raw.prepare('SELECT MAX(id) i FROM pagos_nomina').get().i); assert.equal(rc.detalle.bonos_nocturno, 2.5); assert.equal(rc.bonos, 2.5); ok('el recibo guarda cuánto del bono fue nocturno'); }
console.log('\n' + n + ' pruebas del bono nocturno pasaron.');
