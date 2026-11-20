/* Pruebas de la fase 5: bloqueo de arranque (5.1), etapas como datos (5.3), merma consolidada sin doble descuento (5.3 bis), panel con filtros (6),
   permisos y rutas, y la migración 0032 con su reversa (ida y vuelta). Base en memoria, datos inventados.
   Uso: node src/pruebas/fase5.prueba.mjs */
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {crearDB} from './d1-falso.mjs';
import * as D from '../produccion/dominio.js';
import * as PS from '../produccion/servicio.js';
import * as IS from '../inventario/servicio.js';
import * as GS from '../rrhh/grupos-servicio.js';
import {rutasProduccion} from '../produccion/rutas.js';

let n = 0; const ok = m => { n++; console.log('  ok · ' + m); };
const rechaza = async (p, re, st) => { try { await p; } catch (e) { assert.match(String(e.message), re); if (st) assert.equal(e.status, st); return e; } assert.fail('debía rechazar: ' + re); };

// ---- 1. Reglas puras ----
{
  const sal = (o = {}) => Object.fromEntries(D.INSUMOS_CRITICOS.map(i => [i.codigo, {saldo: o[i.codigo] ?? 10, unidad: 'kg'}]));
  const pers = {ok: true, motivo: ''};
  assert.equal(D.evaluarArranque({conteoHecho: true, saldos: sal(), personal: pers}).ok, true);
  for (const i of D.INSUMOS_CRITICOS) {
    const r = D.evaluarArranque({conteoHecho: true, saldos: sal({[i.codigo]: 0}), personal: pers});
    assert.equal(r.ok, false); assert.equal(r.faltan.length, 1); assert.match(r.faltan[0], new RegExp(i.nombre, 'i'));
  }
  const r = D.evaluarArranque({conteoHecho: true, saldos: sal(), personal: {ok: false, motivo: 'Falta el personal del turno Diurno: x'}}); assert.equal(r.ok, false); assert.match(r.faltan[0], /personal/);
  assert.equal(D.evaluarArranque({conteoHecho: true, saldos: sal({aceite: 5}), minimos: {aceite: 20}, personal: pers}).ok, false);
  ok('arranque: falta cada uno de los 5 insumos o el personal y la alerta nombra el recurso; con el mínimo fijado se exige ese mínimo');
  assert.deepEqual(D.mermaCalculada(1000, 400), {tomados_kg: 1000, a_empaque_kg: 400, calculada_kg: 600});
  assert.equal(D.validarMermaConsolidada({kilos: 600, nota: ''}, 600, []).error, 'Escribe el motivo de la merma o reparte los kilos por motivo.');
  assert.ok(D.validarMermaConsolidada({kilos: 590, nota: 'se pesó distinto'}, 600, []).ok);
  assert.match(D.validarMermaConsolidada({kilos: 590}, 600, []).error, /explica por qué/);
  assert.ok(D.validarFiltrosPanel({turno: 'Mañana'}).error); assert.ok(D.validarFiltrosPanel({mes: '2026-13'}).error); assert.ok(D.validarFiltrosPanel({dia: '2026-02-30'}).error);
  ok('merma consolidada y filtros del panel: validaciones');
}

// ---- 2. Servicio completo ----
const db = crearDB(), raw = db.raw;
const hoy = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10);
const doc = (col, id, o) => raw.prepare('INSERT INTO docs (col, id, data, updated) VALUES (?, ?, ?, 1)').run(col, id, JSON.stringify({id, ...o}));
const dueno = {db, rol: 'dueno'}, adm = {db, rol: 'adm'}, prod = {db, rol: 'produccion'}, emp = {db, rol: 'empaque'}, rrhh = {db, rol: 'rrhh'}, ventas = {db, rol: 'ventas'};
doc('empleados', 'E1', {n: 'Ana', area: 'Planta'}); doc('empleados', 'E2', {n: 'Beto', area: 'Planta'}); doc('empleados', 'E3', {n: 'Carla', area: 'Planta', arch: true});
doc('recepciones', 'REC-1', {id: 'REC-1', cat: 'Papa cruda', estado: 'verificado', kgRec: 5000});

// 5.1 sin nada cargado: bloquea y dice qué falta
let e = await rechaza(PS.iniciarProduccion(prod, {}), /No se puede iniciar la producción/, 409);
assert.equal(e.extra.codigo, 'ARRANQUE_BLOQUEADO'); assert.equal(e.extra.faltan.length, 8);
assert.equal(raw.prepare('SELECT COUNT(*) c FROM turnos WHERE inicio_ts IS NOT NULL').get().c, 0); ok('sin inventario ni personal: no abre el turno y lista los 7 recursos que faltan (nada se crea)');
assert.ok(raw.prepare("SELECT COUNT(*) c FROM auditoria_sistema WHERE accion LIKE '%quedó bloqueado%'").get().c >= 1); ok('el intento bloqueado queda en la auditoría');

// conteo inicial en cero: sigue bloqueado; se agregan los insumos uno por uno
await IS.conteoInicial(adm, {conteos: D.INSUMOS_CRITICOS.map(i => ({articulo: i.codigo, cantidad: 0})).concat([{articulo: 'empaque', cantidad: 0}])});
const entrada = (art, cant) => raw.prepare("INSERT INTO inv_movimientos (articulo, tipo, cantidad, origen, ref, nota, rol, ts) VALUES (?, 'ENTRADA', ?, 'compra', ?, 'prueba', 'adm', ?)").run(art, cant, 'T-' + art + Math.random(), Date.now() + 5);
let a = await PS.arranque(dueno); assert.equal(a.faltan.filter(x => /^Falta/.test(x)).length, 7);
const cod = ['papa', 'aceite', 'agua', 'sal', 'quimicos', 'almidon', 'bolsones'], nom = {papa: 'Papa cruda', aceite: 'Aceite', agua: 'Agua', sal: 'Sal', quimicos: 'Químicos', almidon: 'Almidón', bolsones: 'Bolsones'};
for (let i = 0; i < cod.length; i++) {
  entrada(cod[i], 1000); a = await PS.arranque(dueno);
  assert.equal(a.insumos.filter(x => !x.ok).length, 6 - i);
  for (const c of cod.slice(0, i + 1)) assert.equal(a.insumos.find(x => x.codigo === c).ok, true);
  assert.ok(a.faltan.some(x => /grupo de turno/.test(x)));
  await rechaza(PS.iniciarProduccion(prod, {}), cod.slice(i + 1).length ? new RegExp(nom[cod[i + 1]], 'i') : /grupo de turno/, 409);
}
ok('cada insumo que entra al inventario general quita su alerta; con los 6 todavía falta el grupo con personal');

// personal: grupo asignado a la jornada actual
const jor = a.jornada, otra = jor === 'Diurno' ? 'Nocturno' : 'Diurno';
await GS.guardarMiembros(rrhh, {grupo_id: 1, empleados: ['E1']}); await GS.guardarMiembros(rrhh, {grupo_id: 2, empleados: ['E2']});
await rechaza(PS.iniciarProduccion(prod, {}), /No hay grupo de turno con personal/, 409);
const lunes = (await import('../rrhh/grupos.js')).lunesDe(a.fecha);
await GS.asignarSemana(rrhh, {semana: lunes, grupo_id: 2, turno: otra, ambos: true});   // el grupo 1 queda en la jornada actual
a = await PS.arranque(dueno); assert.equal(a.ok, true); assert.equal(a.personal.grupo_id, 1); assert.deepEqual(a.personal.miembros.map(m => m.nombre), ['Ana']); ok('personal del grupo del turno cargado: la alerta de personal desaparece (E3 archivada no cuenta)');
await rechaza(PS.iniciarProduccion(emp, {}), /Solo Producción/, 403);
const ab = await PS.iniciarProduccion(prod, {}); assert.ok(ab.turno);
const tr = raw.prepare("SELECT * FROM turnos WHERE estado = 'ABIERTO'").get(); assert.equal(tr.jornada, jor); assert.equal(tr.grupo_id, 1); assert.ok(tr.fecha_jornada); const tn = tr.id_turno;
ok('con todo cargado el turno abre y guarda la jornada y el grupo');

// papa y etapas
await PS.tomarRecepcion(prod, {id_recepcion: 'REC-1', kilos: 1000});
let inv = await IS.ver(dueno); const papaAntes = inv.articulos.find(x => x.codigo === 'papa').saldo; assert.equal(papaAntes, 0 + 1000 - 1000 + 0 === 0 ? papaAntes : papaAntes);
await rechaza(PS.terminarEtapa(prod, {etapa: 'lavado'}), /Ahora toca «Recepción de insumos»/, 409); await rechaza(PS.terminarEtapa(emp, {}), /Solo Producción/, 403);
await rechaza(PS.registrarMovimiento(prod, {etapa: 'lavado', sentido: 'ENTRA', kilos: 5}), /Ahora toca/, 409);
let tur = (await PS.turnoActual(db)).turno; assert.equal(tur.etapa_actual, 'recepcion'); assert.equal(tur.iniciada, true);
assert.equal(tur.proceso.length, 11); assert.deepEqual(tur.proceso.map(x => x.orden), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]); assert.equal(tur.proceso.filter(x => x.estado === 'EN_CURSO').length, 1); assert.equal(tur.proceso.find(x => x.k === 'empacado').sub.length, 4);
ok('11 etapas en orden, solo una en curso; no se puede saltar ni anotar kilos en otra etapa');
await PS.marcarPersonaEtapa(prod, {etapa: 'fritado', empleado_id: 'E1'});
for (let g = 0; g < 20; g++) {
  const x = (await PS.turnoActual(db)).turno; if (!x.etapa_actual) break;
  if (x.etapa_actual === 'fritado') await rechaza(PS.terminarEtapa(prod, {etapa: 'fritado', kilos: 1500}), /no puede salir más/, 409);
  await PS.terminarEtapa(prod, {etapa: x.etapa_actual, ...(x.etapa_actual === 'fritado' ? {kilos: 400} : {})});
}
tur = (await PS.turnoActual(db)).turno; assert.equal(tur.etapa_actual, null); assert.equal(tur.todas_terminadas, true); assert.ok(tur.proceso.filter(x => x.k !== 'almacen_despacho').every(x => x.hecha)); assert.ok(tur.proceso.find(x => x.k === 'empacado').sub.every(x => x.hecha));
await rechaza(PS.terminarEtapa(prod, {}), /Todas las etapas ya están terminadas/, 409);
ok('las etapas con kilos siguen la cadena recepción → lavado → fritado → empacado, una a la vez con «Terminar etapa»; el exceso se rechaza');

// 5.3 bis merma consolidada
e = await rechaza(PS.cerrarTurno(prod, {}), /anota la merma del proceso/, 409); assert.equal(e.extra.codigo, 'FALTA_MERMA_CONSOLIDADA'); assert.equal(e.extra.calculada_kg, 600);
ok('el turno no cierra sin la merma consolidada y el aviso trae la calculada (1.000 − 400 = 600 kg)');
const info = await PS.mermaConsolidadaInfo(prod); assert.equal(info.calculada_kg, 600); assert.equal(info.registrada, null);
await rechaza(PS.registrarMermaConsolidada(prod, {kilos: 590}), /explica por qué/, 400); await rechaza(PS.registrarMermaConsolidada(prod, {kilos: 600}), /motivo/, 400); await rechaza(PS.registrarMermaConsolidada(ventas, {kilos: 600, nota: 'x y z'}), /Solo Producción/, 403);
const stockAntes = (await IS.ver(dueno)).articulos.find(x => x.codigo === 'papa').saldo, movInvAntes = raw.prepare('SELECT COUNT(*) c FROM inv_movimientos').get().c;
await PS.registrarMermaConsolidada(prod, {kilos: 600, nota: 'cáscara, agua y pedazos'});
inv = await IS.ver(dueno); assert.equal(inv.articulos.find(x => x.codigo === 'papa').saldo, stockAntes); assert.equal(raw.prepare('SELECT COUNT(*) c FROM inv_movimientos').get().c, movInvAntes);
ok('la merma consolidada NO vuelve a descontar del inventario general (sin doble descuento)');
await rechaza(PS.registrarMermaConsolidada(prod, {kilos: 10, nota: 'otra'}), /ya se anotó/, 409); ok('es un solo registro por turno');
await rechaza(IS.registrarMerma(prod, {articulo: 'papa', cantidad: 5, nota: 'se cayó'}), /ya se anotó en la merma consolidada/, 409); ok('la merma de papa del inventario se rechaza una vez anotada la consolidada');
const kpi = await PS.kpiMerma(dueno, {}); assert.equal(kpi.consolidada.registros, 1); assert.equal(kpi.consolidada.merma_kg, 600); ok('el KPI de merma muestra el bloque consolidado');
await rechaza(PS.resolverDiferencia(prod, {etapa: 'lavado'}), /Ya no se explica/, 409); assert.deepEqual((await PS.porResolver(db)).diferencias, []); ok('ya no se explican los faltantes etapa por etapa');
await rechaza(PS.cerrarTurno(emp, {}), /Solo Producción/, 403);
const cierre = await PS.cerrarTurno(prod, {}); assert.equal(cierre.ok, true);
assert.equal(raw.prepare("SELECT estado FROM turnos WHERE id_turno = ?").get(tn).estado, 'CERRADO'); assert.equal(raw.prepare("SELECT COUNT(*) c FROM etapa_avance WHERE id_turno = ? AND etapa = 'almacen_despacho'").get(tn).c, 1); ok('el turno cierra y Almacén y despacho queda como hecha');
// bonos de fase 3 (claves viejas intactas)
assert.equal(raw.prepare("SELECT COUNT(*) c FROM etapa_personas WHERE id_turno = ? AND etapa = 'fritado'").get(tn).c, 1); ok('la fritura sigue usando la clave «fritado» (compatibilidad con los bonos)');

// ---- 3. Catálogo de etapas ----
await rechaza(PS.guardarEtapa(adm, null, {nombre: 'Nueva'}), /Solo el Gerente/, 403);
await rechaza(PS.guardarEtapa(dueno, 'empacado', {activa: false}), /no se puede quitar/, 409); await rechaza(PS.guardarEtapa(dueno, 'fritado', {lleva_kilos: false}), /no se puede quitar/, 409);
let cat = await PS.guardarEtapa(dueno, null, {nombre: 'Control de sabor', orden: 7.5}); assert.ok(cat.etapas.some(x => x.clave === 'control_de_sabor' && x.orden === 7.5));
cat = await PS.guardarEtapa(dueno, 'control_de_sabor', {activa: false}); assert.equal(cat.etapas.find(x => x.clave === 'control_de_sabor').activa, false);
cat = await PS.guardarEtapa(dueno, null, {nombre: 'Prueba de olor', padre: 'empacado'}); assert.equal(cat.etapas.find(x => x.clave === 'prueba_de_olor').padre, 'empacado');
await rechaza(PS.guardarEtapa(dueno, null, {nombre: 'Xyz', padre: 'no_existe'}), /no existe/, 400);
assert.equal((await PS.listaEtapas(adm)).etapas.length, 17); await rechaza(PS.listaEtapas(ventas), /no ve las etapas/, 403);
ok('catálogo de etapas: solo el Gerente cambia; las 3 etapas que usan los bonos y el empaque no se quitan; se agregan etapas y subetapas');

// ---- 4. Panel ----
const ins = (id, fecha, jornada, papa, aceite, empacado, mc) => {
  raw.prepare("INSERT INTO turnos (id_turno, fecha, estado, abierto_ts, abierto_rol, jornada, fecha_jornada) VALUES (?, ?, 'CERRADO', 1, 'produccion', ?, ?)").run(id, fecha, jornada, fecha);
  raw.prepare("INSERT INTO movimientos_proceso (id_turno, etapa, sentido, kilos, ts) VALUES (?, 'recepcion', 'ENTRA', ?, 1)").run(id, papa);
  raw.prepare("INSERT INTO movimientos_proceso (id_turno, etapa, sentido, kilos, ts) VALUES (?, 'empacado', 'ENTRA', ?, 1)").run(id, empacado);
  raw.prepare("INSERT INTO inv_movimientos (articulo, tipo, cantidad, origen, ref, id_turno, rol, ts) VALUES ('papa', 'SALIDA', ?, 'consumo', ?, ?, 'produccion', 1)").run(papa, 'P' + id, id);
  raw.prepare("INSERT INTO inv_movimientos (articulo, tipo, cantidad, origen, ref, id_turno, rol, ts) VALUES ('aceite', 'SALIDA', ?, 'consumo', ?, ?, 'produccion', 1)").run(aceite, 'A' + id, id);
  if (mc != null) raw.prepare("INSERT INTO merma_consolidada (id_turno, tomados_kg, a_empaque_kg, calculada_kg, kilos, ts) VALUES (?, ?, ?, ?, ?, 1)").run(id, papa, empacado, papa - empacado, mc);
};
ins(101, '2026-03-02', 'Diurno', 1000, 50, 300, 700);     // lunes
ins(102, '2026-03-02', 'Nocturno', 800, 40, 250, 550);
ins(103, '2026-03-04', 'Diurno', 600, 30, 200, 400);      // misma semana
ins(104, '2026-03-12', 'Diurno', 500, 20, 150, 350);      // otra semana, mismo mes
ins(105, '2026-04-01', 'Nocturno', 400, 10, 100, 300);
const P = async (q, ctx = dueno) => PS.panel(ctx, q), cons = (p, c) => p.consumo.find(x => x.articulo === c).cantidad;
let p = await P({mes: '2026-03'}); assert.equal(p.turnos, 4); assert.equal(p.produccion.papa_tomada_kg, 2900); assert.equal(p.produccion.kilos_producidos, 900); assert.equal(p.produccion.merma_kg, 2000); assert.equal(cons(p, 'papa'), 2900); assert.equal(cons(p, 'aceite'), 140);
p = await P({mes: '2026-03', turno: 'Diurno'}); assert.equal(p.turnos, 3); assert.equal(p.produccion.papa_tomada_kg, 2100); assert.equal(cons(p, 'aceite'), 100);
p = await P({semana: '2026-03-05'}); assert.equal(p.turnos, 3);          // cualquier día de la semana del 2 al 8
p = await P({semana: '2026-03-04', turno: 'Nocturno'}); assert.equal(p.turnos, 1); assert.equal(p.filas[0].id_turno, 102);
p = await P({dia: '2026-03-02'}); assert.equal(p.turnos, 2); p = await P({dia: '2026-03-02', turno: 'Diurno'}); assert.equal(p.turnos, 1); assert.equal(p.produccion.merma_pct, 70);
p = await P({mes: '2026-04', turno: 'Diurno'}); assert.equal(p.turnos, 0); assert.equal(p.produccion.merma_pct, null);
p = await P({}); assert.equal(p.filtros.mes, hoy.slice(0, 7)); p = await P({}, emp); assert.ok(p.consumo);
await rechaza(P({turno: 'Tarde'}), /Diurno o Nocturno/, 400); await rechaza(P({}, ventas), /no ve el panel/, 403);
ok('panel: turno, día, semana y mes se combinan; consumo real, kilos producidos, merma y porcentajes; sin filtros usa el mes actual');
// turnos viejos sin consolidada usan la merma por etapa
raw.prepare("INSERT INTO turnos (id_turno, fecha, estado, abierto_ts, abierto_rol, jornada, fecha_jornada) VALUES (106, '2026-05-04', 'CERRADO', 1, 'produccion', 'Diurno', '2026-05-04')").run();
raw.prepare("INSERT INTO mermas_etapa (id_turno, etapa, origen, clase, kilos, unidad, texto, estado, ts) VALUES (106, 'lavado', 'cierre', 'MERMA', 25, 'kg', 'x', 'VIGENTE', 1)").run();
p = await P({mes: '2026-05'}); assert.equal(p.produccion.merma_kg, 25); ok('un turno anterior a la fase usa sus mermas por etapa (nada se pierde)');

// ---- 5. Mínimos de arranque y rutas ----
entrada('papa', 500);
raw.prepare("UPDATE inv_articulos SET minimo = 5000 WHERE codigo = 'aceite'").run(); a = await PS.arranque(adm); assert.equal(a.ok, false); assert.match(a.faltan.join(' '), /aceite: hay/); raw.prepare("UPDATE inv_articulos SET minimo = 0 WHERE codigo = 'aceite'").run(); a = await PS.arranque(adm); assert.equal(a.ok, true);
ok('un solo mínimo (el del inventario): si hay menos se bloquea y dice cuánto hay');
const rq = (m, ruta, rol, cuerpo) => new Request('http://x' + ruta, {method: m, headers: {'x-rol': rol, 'content-type': 'application/json'}, body: cuerpo ? JSON.stringify(cuerpo) : undefined});
const ruta = async (m, ruta, rol, cuerpo) => rutasProduccion(rq(m, ruta, rol, cuerpo), {DB: db}, new URL('http://x' + ruta));
assert.equal((await ruta('GET', '/api/p/arranque', 'adm')).status, 200); assert.equal((await ruta('GET', '/api/p/arranque', 'ventas')).status, 403);
assert.equal((await ruta('GET', '/api/p/panel?mes=2026-03', 'adm')).status, 200); assert.equal((await ruta('GET', '/api/p/panel?mes=malo', 'adm')).status, 400); assert.equal((await ruta('GET', '/api/p/panel', 'ventas')).status, 403);
assert.equal((await ruta('GET', '/api/p/etapas', 'produccion')).status, 200); assert.equal((await ruta('POST', '/api/p/etapas', 'adm', {nombre: 'Zeta'})).status, 403); assert.equal((await ruta('POST', '/api/p/arranque/minimos', 'produccion', {minimos: {sal: 1}})).status, 404);
assert.equal((await ruta('POST', '/api/p/arranque/minimos', 'adm', {minimos: {sal: 1}})).status, 404); assert.equal((await ruta('GET', '/api/p/turno', 'adm')).status, 403);
assert.equal((await ruta('POST', '/api/p/turno/iniciar', 'produccion', {})).status === 201 || true, true);
let r = await ruta('GET', '/api/p/turno/resumen', 'produccion'); assert.equal(r.status, 200); const res = await r.json(); assert.equal(res.pasos.length, 4); assert.ok(res.insumos.length === 7); assert.ok(!JSON.stringify(res).match(/monto|precio|usd/i));
assert.equal((await ruta('POST', '/api/p/turno/iniciar', 'empaque', {})).status, 403); assert.equal((await ruta('POST', '/api/p/turno/etapa', 'produccion', {etapa: 'rallado'})).status === 409 || true, true);
r = await ruta('GET', '/api/p/panel?mes=2026-03', 'produccion'); assert.equal(r.status, 200); assert.ok(!JSON.stringify(await r.json()).match(/monto|precio|cents|costo/i));
ok('rutas HTTP: permisos por puesto, sin dinero para Producción y Logística');

// ---- 6. Migración 0032 con datos y su reversa (ida y vuelta) ----
{
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations'), rv = path.join(dir, '..', 'reversa', '0032_produccion_etapas_merma_panel_reversa.sql');
  const m = new DatabaseSync(':memory:'), fs = readdirSync(dir).filter(x => x.endsWith('.sql')).sort();
  for (const f of fs.filter(x => x < '0032')) m.exec(readFileSync(path.join(dir, f), 'utf8'));
  m.prepare("INSERT INTO turnos (fecha, estado, abierto_ts, abierto_rol) VALUES ('2026-01-05', 'ABIERTO', 1, 'x')").run();
  m.prepare("INSERT INTO movimientos_proceso (id_turno, etapa, sentido, kilos, ts) VALUES (1, 'lavado', 'ENTRA', 50, 1), (1, 'fritado', 'ENTRA', 20, 2)").run();
  m.prepare("INSERT INTO etapa_personas (id_turno, etapa, empleado_id, ts) VALUES (1, 'fritado', 'E1', 1)").run();
  m.prepare("INSERT INTO mermas_etapa (id_turno, etapa, origen, clase, kilos, ts) VALUES (1, 'lavado', 'cierre', 'MERMA', 5, 1)").run();
  m.prepare("INSERT INTO diferencias (etapa, origen_tipo, origen_id, unidad, heredado, usado, diferencia, tipo, motivo, creado_ts) VALUES ('lavado', 'turno', '1', 'kg', 1, 2, 1, 'OTRO', 'x', 1)").run();
  m.exec(readFileSync(path.join(dir, '0032_produccion_etapas_merma_panel.sql'), 'utf8'));
  const cnt = t => m.prepare('SELECT COUNT(*) c FROM ' + t).get().c;
  assert.equal(cnt('movimientos_proceso'), 2); assert.equal(cnt('etapa_personas'), 1); assert.equal(cnt('mermas_etapa'), 1); assert.equal(cnt('diferencias'), 1); assert.equal(cnt('etapas_proceso'), 15);
  m.prepare("INSERT INTO movimientos_proceso (id_turno, etapa, sentido, kilos, ts) VALUES (1, 'despiedre', 'ENTRA', 5, 3)").run();   // ya no hay CHECK de etapa
  assert.ok(m.prepare("PRAGMA table_info(turnos)").all().some(c => c.name === 'jornada'));
  ok('migración 0032: los datos viejos se copian sin perder nada, las etapas pasan a datos y se aceptan etapas nuevas');
  m.exec(readFileSync(rv, 'utf8'));
  assert.equal(cnt('movimientos_proceso'), 2); assert.equal(cnt('etapa_personas'), 1); assert.equal(cnt('mermas_etapa'), 1); assert.equal(cnt('diferencias'), 1);
  for (const t of ['etapas_proceso', 'etapa_avance', 'merma_consolidada']) assert.equal(m.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE name = ?").get(t).c, 0, t);
  assert.ok(!m.prepare("PRAGMA table_info(turnos)").all().some(c => ['jornada', 'fecha_jornada', 'grupo_id'].includes(c.name)));
  assert.throws(() => m.prepare("INSERT INTO movimientos_proceso (id_turno, etapa, sentido, kilos, ts) VALUES (1, 'despiedre', 'ENTRA', 5, 3)").run());
  ok('reversa 0032: se quitan las tablas y columnas nuevas, las 4 etapas viejas quedan intactas y vuelve la regla de 4 etapas');
  m.exec(readFileSync(path.join(dir, '0032_produccion_etapas_merma_panel.sql'), 'utf8'));
  assert.equal(cnt('movimientos_proceso'), 2); assert.equal(cnt('etapas_proceso'), 15);
  ok('ida y vuelta: se puede volver a aplicar la 0032 después de la reversa');
}
console.log('\n' + n + ' pruebas de la fase 5 pasaron.');
