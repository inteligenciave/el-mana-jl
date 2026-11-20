/* Merma por etapas al cerrar el turno: lista de etapas del catálogo, tramos medidos, validación, «sin explicar», una sola vez, corrección,
   inventario sin doble descuento, resumen con detalle por etapa (y turnos viejos como «Todo el proceso»), costo solo para Gerencia/Administración y permisos.
   Base en memoria, datos inventados. Uso: node src/pruebas/merma-etapas.prueba.mjs */
import assert from 'node:assert/strict';
import {crearDB} from './d1-falso.mjs';
import * as D from '../produccion/dominio.js';
import * as PS from '../produccion/servicio.js';
import * as IS from '../inventario/servicio.js';
import * as GS from '../rrhh/grupos-servicio.js';
import {lunesDe} from '../rrhh/grupos.js';
import {rutasProduccion} from '../produccion/rutas.js';

let n = 0; const ok = m => { n++; console.log('  ok · ' + m); };
const rechaza = async (p, re, st) => { try { await p; } catch (e) { assert.match(String(e.message), re); if (st) assert.equal(e.status, st); return e; } assert.fail('debía rechazar: ' + re); };
const db = crearDB(), raw = db.raw;
const cat = raw.prepare('SELECT clave, nombre, orden, padre, kilos, activo FROM etapas_proceso ORDER BY orden').all().map(x => ({...x}));
const motivos = raw.prepare('SELECT id, nombre, es_otra, activo FROM motivos_merma ORDER BY orden').all().map(x => ({...x}));
const idM = nom => motivos.find(m => m.nombre === nom).id;

/* 1 · la lista sale del catálogo */
const em = D.etapasMerma(cat);
assert.deepEqual(em.map(e => e.nombre), ['Despiedre', 'Lavado', 'Rallado', 'Tina de almidón', 'Centrifugado', 'Freído', 'Centrifugadora final', 'Salado']);
const cat2 = cat.map(e => e.clave === 'salado' ? {...e, activo: 0} : e).concat([{clave: 'pelado', nombre: 'Pelado', orden: 2.5, padre: null, kilos: 0, activo: 1}]);
const em2 = D.etapasMerma(cat2); assert.equal(em2.length, 8); assert.ok(em2.some(e => e.k === 'pelado')); assert.ok(!em2.some(e => e.k === 'salado'));
ok('etapasMerma: 8 etapas de Despiedre a Salado, y respeta una etapa nueva o quitada del catálogo');

/* 2 · tramos medidos */
const tr = D.tramosMerma(em, {lavado: {entra: 1000, sale: 850}, fritado: {entra: 850, sale: 400}});
assert.deepEqual(tr.map(x => x.medido_kg), [150, 450]); assert.equal(tr[0].medido_kg + tr[1].medido_kg, 600);
assert.deepEqual(tr[0].etapas, ['despiedre', 'lavado', 'rallado', 'tina_almidon', 'centrifugado'].filter(k => em.some(e => e.k === k)));
assert.ok(tr[1].etapas.includes('fritado') && tr[1].etapas.includes('salado') && !tr[1].etapas.includes('lavado'));
ok('tramos: Lavado 1000→850 (150 kg) y Freído 850→400 (450 kg) suman la merma calculada de 600 kg; Despiedre cae en el primer tramo');

/* 3 · validación */
const base = {calculada: 600, tomada: 1000, etapas: em, motivos};
const f = (etapa, kilos, id_motivo, texto) => ({etapa, kilos, id_motivo, texto});
let v = D.validarMermaEtapas({filas: [f('despiedre', ''), f('rallado', '0'), f('lavado', 300, idM('Tierra')), f('fritado', 300, idM('Aceite'))]}, base);
assert.ok(v.ok); assert.equal(v.ok.filas.length, 2); assert.equal(v.ok.sin_explicar, 0);
assert.equal(D.validarMermaEtapas({filas: [f('lavado', 600, idM('Otra'))]}, base).codigo, 'MOTIVO_OTRA');
assert.equal(D.validarMermaEtapas({filas: [f('lavado', 600, idM('Otra'), 'ab')]}, base).codigo, 'MOTIVO_OTRA');
assert.equal(D.validarMermaEtapas({filas: [f('lavado', 600)]}, base).codigo, 'MOTIVO');
assert.equal(D.validarMermaEtapas({filas: [f('empacado', 600, idM('Tierra'))]}, base).codigo, 'ETAPA');
assert.equal(D.validarMermaEtapas({filas: [f('lavado', 300, idM('Tierra')), f('lavado', 300, idM('Tierra'))]}, base).codigo, 'REPETIDA');
assert.equal(D.validarMermaEtapas({filas: [f('lavado', 0.05, idM('Tierra'))], nota: 'x'.repeat(5)}, base).codigo, 'KILOS');
assert.equal(D.validarMermaEtapas({filas: [f('lavado', 1200, idM('Tierra'))], nota: 'sobró'}, base).codigo, 'EXCEDE');
assert.equal(D.validarMermaEtapas({filas: [f('lavado', '')]}, base).codigo, 'SIN_FILAS');
assert.ok(D.validarMermaEtapas({filas: []}, {...base, calculada: 0}).ok);
ok('validación: fila vacía o en 0 no pide motivo; «Otra» sin texto, etapa fuera de lista, etapa repetida, suma mayor que lo tomado y merma sin ninguna fila fallan');

/* 4 · no cuadra: nota obligatoria y «sin explicar» */
const d4 = D.validarMermaEtapas({filas: [f('lavado', 580, idM('Tierra'))]}, base); assert.equal(d4.codigo, 'NO_CUADRA'); assert.equal(d4.diferencia, 20);
const d5 = D.validarMermaEtapas({filas: [f('lavado', 580, idM('Tierra'))], nota: 'Se evaporó agua'}, base); assert.equal(d5.ok.sin_explicar, 20);
assert.ok(D.validarMermaEtapas({filas: [f('lavado', 599.5, idM('Tierra'))]}, base).ok);   // dentro de la tolerancia (1 kg)
ok('si no cuadra por más de la tolerancia pide una nota y la diferencia queda como «sin explicar» (20 kg)');

/* ---- turno completo hasta tener todas las etapas terminadas ---- */
const doc = (id, o) => raw.prepare('INSERT INTO docs (col, id, data, updated) VALUES (?, ?, ?, 1)').run('empleados', id, JSON.stringify({id, ...o}));
doc('E1', {n: 'Ana', area: 'Planta'}); doc('E2', {n: 'Beto', area: 'Planta'});
const dueno = {db, rol: 'dueno'}, adm = {db, rol: 'adm'}, prod = {db, rol: 'produccion'}, emp = {db, rol: 'empaque'}, rrhh = {db, rol: 'rrhh'}, ventas = {db, rol: 'ventas'};
await IS.conteoInicial(adm, {conteos: D.INSUMOS_CRITICOS.map(i => ({articulo: i.codigo, cantidad: 3000})).concat([{articulo: 'empaque', cantidad: 100000}, ...[1, 2, 3].map(i => ({articulo: 'bolsa-' + i, cantidad: 100000}))])});
await GS.guardarMiembros(rrhh, {grupo_id: 1, empleados: ['E1']}); await GS.guardarMiembros(rrhh, {grupo_id: 2, empleados: ['E2']});
const a = await PS.arranque(dueno), lunes = lunesDe(a.fecha), otra = a.jornada === 'Diurno' ? 'Nocturno' : 'Diurno';
await GS.asignarSemana(rrhh, {semana: lunes, grupo_id: 1, turno: a.jornada, ambos: false}); await GS.asignarSemana(rrhh, {semana: lunes, grupo_id: 2, turno: otra, ambos: false});
raw.prepare("INSERT INTO marcas (empleado_id, fecha, entrada_ts, turno, quien, creado_ts) VALUES ('E1', ?, ?, ?, 'rrhh', ?)").run(a.fecha, Date.now(), a.jornada, Date.now());
await PS.iniciarProduccion(prod, {});
const saldoPapa = async () => (await IS.resumen(db)).articulos.find(x => x.codigo === 'papa').saldo;
let t = (await PS.terminarEtapa(prod, {kilos: 1000})).turno;
for (let i = 0; i < 20 && t.etapa_actual; i++) { const k = t.etapa_actual; t = (await PS.terminarEtapa(prod, k === 'lavado' ? {kilos: 850} : k === 'fritado' ? {kilos: 400} : {})).turno; }
assert.equal(t.todas_terminadas, true);
const prodId = (await PS.turnoActual(db)).productos[0].id_producto; raw.prepare('UPDATE productos SET kg_por_bulto = 10, unidades_por_bulto = 30 WHERE id_producto = ?').run(prodId);
await PS.registrarEmpaque(emp, {id_producto: prodId, bultos: 40});
const idT = t.id_turno, info = await PS.mermaConsolidadaInfo(prod);
assert.equal(info.calculada_kg, 600); assert.equal(info.etapas.length, 8); assert.deepEqual(info.tramos.map(x => x.medido_kg), [150, 450]); assert.equal(info.registrada, null);
const papaAntes = await saldoPapa(), movAntes = raw.prepare('SELECT COUNT(*) c FROM inv_movimientos').get().c;

/* 5 · una sola vez; corregir con el turno abierto */
const e1 = await rechaza(PS.registrarMermaConsolidada(prod, {filas: [f('lavado', 580, idM('Tierra'))]}), /no cuadra|Escribe por qué/i, 400); assert.equal(e1.extra.codigo, 'NO_CUADRA');
let r = await PS.registrarMermaConsolidada(prod, {filas: [f('lavado', 150, idM('Tierra')), f('fritado', 430, idM('Otra'), 'Agua evaporada')], nota: 'Se evaporó agua al freír'});
assert.equal(r.kilos, 580); assert.equal(r.sin_explicar_kg, 20);
const cab = raw.prepare('SELECT * FROM merma_consolidada WHERE id_turno = ?').get(idT); assert.equal(cab.por_etapas, 1); assert.equal(cab.sin_explicar_kg, 20); assert.equal(cab.kilos, 580);
await rechaza(PS.registrarMermaConsolidada(prod, {filas: [f('lavado', 600, idM('Tierra'))]}), /ya se anotó/, 409);
r = await PS.corregirMermaAbierta(prod, {filas: [f('lavado', 150, idM('Tierra')), f('fritado', 450, idM('Cáscara'))]});
assert.equal(r.sin_explicar_kg, 0);
const vig = raw.prepare("SELECT etapa, kilos FROM mermas_etapa WHERE origen = 'cierre' AND ref = ? AND estado = 'VIGENTE' ORDER BY id").all('MC-' + idT).map(x => ({...x}));
assert.deepEqual(vig, [{etapa: 'lavado', kilos: 150}, {etapa: 'fritado', kilos: 450}]); assert.equal(raw.prepare("SELECT COUNT(*) c FROM mermas_etapa WHERE ref = ? AND estado = 'ANULADA'").get('MC-' + idT).c, 2);
assert.equal((await PS.mermaConsolidadaInfo(prod)).registrada.filas.length, 2);
ok('se anota una sola vez (409 después); corregir con el turno abierto anula las filas viejas y deja solo las nuevas');

/* 6 · inventario: sin doble descuento */
assert.equal(await saldoPapa(), papaAntes); assert.equal(raw.prepare('SELECT COUNT(*) c FROM inv_movimientos').get().c, movAntes);
assert.equal(raw.prepare("SELECT COUNT(*) c FROM inv_movimientos WHERE origen = 'merma'").get().c, 0);
await rechaza(IS.registrarMerma(prod, {articulo: 'papa', cantidad: 5, nota: 'derrame'}), /ya se anotó|consolidada/i, 409);
ok('anotar la merma por etapas no mueve el inventario (la papa ya salió al tomarla) y una «merma de papa» aparte sigue rechazada');

/* 9 · permisos */
for (const c of [emp, adm, ventas]) await rechaza(PS.corregirMermaAbierta(c, {filas: []}), /Solo Producción|llevan el turno/);
await rechaza(PS.corregirMermaCerrada(prod, idT, {filas: []}), /Solo el Gerente/, 403);
const rr = (rol, ruta, m = 'GET', body) => rutasProduccion(new Request('http://x' + ruta, {method: m, headers: {'x-rol': rol, 'content-type': 'application/json'}, body: body ? JSON.stringify(body) : undefined}), {DB: db}, new URL('http://x' + ruta));
assert.equal((await rr('empaque', '/api/p/turno/merma', 'POST', {filas: []})).status, 403); assert.equal((await rr('adm', '/api/p/turno/merma', 'POST', {filas: []})).status, 403);
assert.equal((await rr('empaque', '/api/p/turno/merma')).status, 200);   // Logística ve la lista
assert.equal((await rr('produccion', '/api/p/turnos/' + idT + '/merma/corregir', 'POST', {})).status, 403);
ok('permisos: Logística y Administración no anotan; Producción no corrige un turno cerrado; Logística sí ve la lista');

/* 10 · cierre completo */
await PS.cerrarTurno(prod, {etapas: {}, bultos: {}});
assert.equal(raw.prepare('SELECT estado FROM turnos WHERE id_turno = ?').get(idT).estado, 'CERRADO');
ok('cierre completo: tomar 1.000 kg, terminar etapas, anotar filas y cerrar deja el turno CERRADO');

/* 9b · corregir un turno cerrado: solo el Gerente, con nota */
await rechaza(PS.corregirMermaCerrada(dueno, idT, {filas: [f('lavado', 600, idM('Tierra'))]}), /por qué corriges/, 400);
await PS.corregirMermaCerrada(dueno, idT, {filas: [f('lavado', 100, idM('Tierra')), f('fritado', 480, idM('Aceite'))], nota: 'Aceite derramado', correccion: 'El jefe de turno se equivocó en la balanza'});
assert.equal(raw.prepare('SELECT corregido_rol FROM merma_consolidada WHERE id_turno = ?').get(idT).corregido_rol !== null, true);
assert.equal(raw.prepare("SELECT COUNT(*) c FROM auditoria_sistema WHERE accion = 'corrigió la merma de un turno cerrado'").get().c, 1);
ok('un turno cerrado lo corrige solo el Gerente, con nota obligatoria, y queda en la auditoría');

/* 7 · resumen: turno nuevo con cada etapa; turno viejo como «Todo el proceso» */
const hoy = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10);
let res = await PS.resumenPeriodo(prod, {periodo: 'dia', ref: raw.prepare('SELECT COALESCE(fecha_jornada, fecha) f FROM turnos WHERE id_turno = ?').get(idT).f});
assert.deepEqual(res.merma_etapas.map(x => [x.nombre, x.kg]), [['Freído', 480], ['Lavado', 100]]); assert.equal(res.produccion.merma_kg, 580); assert.equal(res.sin_explicar_kg, 20); assert.equal(res.produccion.rendimiento_pct, 40);
const viejo = new Date(hoy + 'T00:00:00Z'); viejo.setUTCDate(viejo.getUTCDate() - 40); const fv = viejo.toISOString().slice(0, 10);
raw.prepare("INSERT INTO turnos (id_turno, fecha, estado, abierto_ts, abierto_rol, jornada, fecha_jornada) VALUES (900, ?, 'CERRADO', 1, 'produccion', 'Diurno', ?)").run(fv, fv);
raw.prepare("INSERT INTO movimientos_proceso (id_turno, etapa, sentido, kilos, ts) VALUES (900, 'recepcion', 'ENTRA', 500, 1), (900, 'empacado', 'ENTRA', 200, 1)").run();
raw.prepare("INSERT INTO merma_consolidada (id_turno, tomados_kg, a_empaque_kg, calculada_kg, kilos, ts) VALUES (900, 500, 200, 300, 300, 1)").run();
res = await PS.resumenPeriodo(prod, {periodo: 'dia', ref: fv});
assert.deepEqual(res.merma_etapas.map(x => [x.nombre, x.kg]), [['Todo el proceso (merma del cierre)', 300]]); assert.equal(res.sin_explicar_kg, 0); assert.equal(res.produccion.rendimiento_pct, 40);
ok('resumen: el turno nuevo muestra la merma por etapa y «sin explicar»; el turno viejo sigue como «Todo el proceso»; el rendimiento no cambia');

/* 8 · costo: solo Gerencia y Administración */
raw.prepare("INSERT INTO docs (col, id, data, updated) VALUES ('compras', 'C1', ?, 1)").run(JSON.stringify({id: 'C1', rec: 'R1', pu: 0.5, qf: 1000, kgRec: 1000}));
raw.prepare("INSERT INTO turno_recepciones (id_turno, id_recepcion, kilos, ts, rol) VALUES (?, 'R1', 1000, 1, 'produccion')").run(idT);
const dia = raw.prepare('SELECT COALESCE(fecha_jornada, fecha) f FROM turnos WHERE id_turno = ?').get(idT).f, q = '/api/p/resumen?periodo=dia&ref=' + dia;
const jd = await (await rr('dueno', q)).json(), ja = await (await rr('adm', q)).json(), jp = await (await rr('produccion', q)).json(), je = await (await rr('empaque', q)).json();
assert.equal(jd.costo_merma_usd, 290); assert.equal(ja.costo_merma_usd, 290); assert.equal(jd.merma_etapas[0].costo_usd, 240);
for (const j of [jp, je]) assert.ok(!/costo|usd/i.test(JSON.stringify(j)), 'Producción y Logística no reciben costos');
const xe = await (await rr('produccion', '/api/p/merma-etapas?desde=' + dia + '&hasta=' + dia)).json(), xd = await (await rr('dueno', '/api/p/merma-etapas')).json();
assert.equal(xe.filas.length, 2); assert.ok(!/costo|usd/i.test(JSON.stringify(xe))); assert.equal(xd.filas.find(x => x.etapa === 'Freído').costo_usd, 240);
assert.equal((await rr('ventas', '/api/p/merma-etapas')).status, 403);
ok('costo: Gerencia y Administración ven el costo de la merma (calculado en el servidor); Producción y Logística no reciben ninguna clave de costo, ni en la exportación');

console.log(`\n${n} pruebas de merma por etapas pasaron.`);
