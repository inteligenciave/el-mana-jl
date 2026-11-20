/* Bolsones (papa a granel, Producción) y bolsas de presentación (Empaque): migración 0044 con reversa, bloqueo de «Iniciar producción» sin bolsones,
   consumo de bolsones al cerrar el turno (kilos por bolsón lo cargan Gerencia/Administración), compra y recepción de ambos, mínimos, y que Producción/Logística no ven dinero.
   Base en memoria, datos inventados. Uso: node src/pruebas/bolsones.prueba.mjs */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {crearDB} from './d1-falso.mjs';
import * as D from '../produccion/dominio.js';
import * as PS from '../produccion/servicio.js';
import * as IS from '../inventario/servicio.js';
import * as CS from '../compras/servicio.js';
import * as RC from '../compras/recepcion-servicio.js';
import * as GS from '../rrhh/grupos-servicio.js';
import {lunesDe} from '../rrhh/grupos.js';
import {sinDinero} from '../produccion/permisos.js';

let n = 0; const ok = m => { n++; console.log('  ok · ' + m); };
const rechaza = async (p, re, st) => { try { await p; } catch (e) { assert.match(String(e.message), re); if (st) assert.equal(e.status, st); return e; } assert.fail('debía rechazar: ' + re); };
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sql = f => readFileSync(path.join(raiz, f), 'utf8');
const db = crearDB(), raw = db.raw;
const hoy = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10);
raw.prepare("INSERT INTO config (clave, valor) VALUES ('tasa_ultimo_intento', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor").run(new Date().toISOString());
raw.prepare("INSERT INTO tasas_bcv (fecha, valor, fuente, obtenida_en, origen) VALUES (?,?,?,?,'DEV')").run(hoy, 500, 'prueba', 'x');
const doc = (col, id, o) => raw.prepare('INSERT INTO docs (col, id, data, updated) VALUES (?, ?, ?, 1)').run(col, id, JSON.stringify({id, ...o}));
const dueno = {db, rol: 'dueno'}, adm = {db, rol: 'adm'}, prod = {db, rol: 'produccion'}, emp = {db, rol: 'empaque'}, rrhh = {db, rol: 'rrhh'};
const saldo = cod => raw.prepare("SELECT COALESCE(SUM(CASE WHEN tipo='ENTRADA' THEN cantidad ELSE -cantidad END),0) s FROM inv_movimientos WHERE articulo=?").get(cod).s;
const nombre = cod => raw.prepare('SELECT nombre FROM inv_articulos WHERE codigo = ?').get(cod).nombre;

/* 1 · la migración: «Material de empaque» pasa a «Bolsas de presentación» conservando el histórico; «Bolsones» es nuevo. (0047 las vuelve «Bolsas sin presentación»: se deshace aquí y se vuelve a aplicar al final de este bloque) */
assert.equal(nombre('empaque'), 'Bolsas sin presentación'); raw.exec(sql('reversa/0047_bolsa_por_presentacion_reversa.sql'));
assert.equal(nombre('empaque'), 'Bolsas de presentación'); assert.equal(nombre('bolsones'), 'Bolsones');
assert.equal(raw.prepare("SELECT unidad FROM inv_articulos WHERE codigo = 'bolsones'").get().unidad, 'und');
raw.prepare("INSERT INTO inv_movimientos (articulo, tipo, cantidad, origen, ref, nota, rol, ts) VALUES ('empaque', 'ENTRADA', 7, 'compra', 'VIEJO', 'histórico', 'adm', 1)").run();
raw.exec(sql('reversa/0044_bolsones_y_bolsas_reversa.sql'));
assert.equal(nombre('empaque'), 'Material de empaque'); assert.equal(raw.prepare("SELECT COUNT(*) c FROM inv_articulos WHERE codigo = 'bolsones'").get().c, 0); assert.equal(saldo('empaque'), 7);
raw.exec(sql('migrations/0044_bolsones_y_bolsas.sql'));
assert.equal(nombre('empaque'), 'Bolsas de presentación'); assert.equal(saldo('empaque'), 7); assert.equal(nombre('bolsones'), 'Bolsones');
raw.prepare("DELETE FROM inv_movimientos WHERE ref = 'VIEJO'").run();
raw.exec(sql('migrations/0047_bolsa_por_presentacion.sql')); assert.equal(nombre('empaque'), 'Bolsas sin presentación');
ok('migración 0044: «Material de empaque» pasa a «Bolsas de presentación» con su histórico intacto, aparece «Bolsones», y la reversa lo deja como antes');

const prodId = raw.prepare("SELECT MIN(id_producto) i FROM productos WHERE categoria = 'PAPAS' AND activo = 1").get().i, BOLSA = 'bolsa-' + prodId;   // una bolsa por presentación: se prueba con la primera
/* 2 · sin bolsones no se produce (ni el Gerente): requisito en rojo con quién debe comprar y recibir */
doc('empleados', 'E1', {n: 'Ana', area: 'Planta'}); doc('empleados', 'E2', {n: 'Beto', area: 'Planta'});
const base = ['papa', 'aceite', 'agua', 'sal', 'quimicos', 'almidon'];
await IS.conteoInicial(adm, {conteos: base.map(x => ({articulo: x, cantidad: 3000})).concat([{articulo: 'empaque', cantidad: 0}, ...raw.prepare("SELECT codigo FROM inv_articulos WHERE codigo LIKE 'bolsa-%'").all().map(x => ({articulo: x.codigo, cantidad: 0}))])});   // bolsones y bolsas arrancan en 0
await GS.guardarMiembros(rrhh, {grupo_id: 1, empleados: ['E1']}); await GS.guardarMiembros(rrhh, {grupo_id: 2, empleados: ['E2']});
const a0 = await PS.arranque(dueno), lunes = lunesDe(a0.fecha), otra = a0.jornada === 'Diurno' ? 'Nocturno' : 'Diurno';
await GS.asignarSemana(rrhh, {semana: lunes, grupo_id: 1, turno: a0.jornada, ambos: false}); await GS.asignarSemana(rrhh, {semana: lunes, grupo_id: 2, turno: otra, ambos: false});
raw.prepare("INSERT INTO marcas (empleado_id, fecha, entrada_ts, turno, quien, creado_ts) VALUES ('E1', ?, ?, ?, 'rrhh', ?)").run(a0.fecha, Date.now(), a0.jornada, Date.now());
const a00 = await PS.arranque(dueno);
assert.equal(a00.ok, false); const rb = a00.insumos.find(x => x.codigo === 'bolsones'); assert.equal(rb.ok, false); assert.match(rb.motivo, /Faltan bolsones\. Administración debe comprarlos y Producción recibirlos\./);
assert.equal(a00.faltan.length, 1); assert.equal(a00.insumos.length, 7);
for (const c of [prod, dueno]) { const e = await rechaza(PS.iniciarProduccion(c, {}), /Faltan bolsones/, 409); assert.equal(e.extra.codigo, 'ARRANQUE_BLOQUEADO'); }
assert.equal(raw.prepare('SELECT COUNT(*) c FROM turnos WHERE inicio_ts IS NOT NULL').get().c, 0);
const vista = sinDinero(await PS.arranque(prod)); assert.ok(!/precio|costo|usd|monto/i.test(JSON.stringify(vista)));
ok('sin bolsones «Iniciar producción» se bloquea (también para el Gerente): el requisito sale en rojo con el aviso de comprar y recibir, y Producción lo ve sin dinero');

/* 3 · se compran y reciben ambos */
doc('proveedores', 'PB', {nombre: 'Proveedor Bolsas (prueba)', tipo: 'insumo', rubro: 'bolsas', cond: 'Contado', prueba: true});
const ins = (await CS.insumosDirectos(adm)).insumos; assert.ok(ins.some(x => x.id === 'INV:bolsones' && x.n === 'Bolsones')); assert.ok(ins.some(x => x.id === 'INV:' + BOLSA && /^Bolsa /.test(x.n))); assert.ok(!ins.some(x => x.id === 'INV:empaque'));
const c = await CS.crear(adm, {proveedor_id: 'PB', fecha: hoy, condicion: 'CREDITO', plazo_dias: 15, factura: 'B-1', lineas: [{producto_id: 'INV:bolsones', cantidad: 40, precio_usd: 1.5}, {producto_id: 'INV:' + BOLSA, cantidad: 6000, precio_usd: 0.03}]});
await RC.recibir(prod, {nro: c.nro, lineas: [{producto_id: 'INV:bolsones', recibido: 40}, {producto_id: 'INV:' + BOLSA, recibido: 6000}]});
assert.equal(saldo('bolsones'), 40); assert.equal(saldo(BOLSA), 6000); assert.equal(saldo('empaque'), 0);
const a1 = await PS.arranque(dueno); assert.equal(a1.ok, true); assert.equal(a1.insumos.find(x => x.codigo === 'bolsones').saldo, 40);
ok('Compras puede comprar y Recibir puede recibir ambos (40 bolsones y 6.000 bolsas de la presentación) y con bolsones el requisito pasa a verde');

/* 4 · mínimo y barras */
await IS.fijarMinimo(adm, 'bolsones', {minimo: 10}); await IS.fijarMinimo(dueno, BOLSA, {minimo: 500});
const inv = (await IS.ver(dueno)).articulos; assert.equal(inv.find(x => x.codigo === 'bolsones').nivel, 'verde'); assert.equal(inv.find(x => x.codigo === BOLSA).minimo, 500);
raw.prepare("INSERT INTO inv_movimientos (articulo, tipo, cantidad, origen, ref, nota, rol, ts) VALUES ('bolsones', 'SALIDA', 30, 'consumo', 'T-BAJA', 'prueba', 'produccion', ?)").run(Date.now() + 10);
const a2 = await PS.arranque(dueno); assert.equal(a2.ok, false); assert.match(a2.insumos.find(x => x.codigo === 'bolsones').motivo, /el mínimo es 10/);
assert.equal((await IS.ver(dueno)).articulos.find(x => x.codigo === 'bolsones').nivel, 'rojo');
raw.prepare("DELETE FROM inv_movimientos WHERE ref = 'T-BAJA'").run();
await rechaza(IS.fijarMinimo(prod, 'bolsones', {minimo: 1}), /Solo/, 403);
ok('cada artículo tiene su barra y su mínimo (los fijan Gerencia y Administración); en o bajo el mínimo la barra se pone roja y bloquea producir');

/* 5 · kilos por bolsón */
await rechaza(IS.fijarKgPorBolson(prod, {kg_por_bolson: 50}), /Solo/, 403); await rechaza(IS.fijarKgPorBolson(adm, {kg_por_bolson: '-3'}), /kilos/i, 400); await rechaza(IS.fijarKgPorBolson(adm, {kg_por_bolson: 'abc'}), /kilos/i, 400);
assert.equal(await IS.kgPorBolson(db), 16); assert.equal((await IS.ver(dueno)).kg_por_bolson, 16); raw.prepare("UPDATE config SET valor = '16' WHERE clave = 'kg_por_bolson'").run();
await IS.fijarKgPorBolson(adm, {kg_por_bolson: '300'}); assert.equal(await IS.kgPorBolson(db), 300); assert.equal((await IS.ver(adm)).kg_por_bolson, 300);
await IS.fijarKgPorBolson(dueno, {kg_por_bolson: 250}); assert.equal(await IS.kgPorBolson(db), 250);
assert.equal(raw.prepare("SELECT COUNT(*) c FROM auditoria_sistema WHERE accion LIKE '%kilos por bolsón%'").get().c, 2);
ok('los kilos por bolsón los carga solo Gerencia o Administración (queda auditado); arranca en 16 de fábrica');

/* 6 · al cerrar el turno se descuentan los bolsones */
await PS.iniciarProduccion(prod, {});
let t = (await PS.terminarEtapa(prod, {kilos: 1000})).turno;
for (let i = 0; i < 20 && t.etapa_actual; i++) { const k = t.etapa_actual; t = (await PS.terminarEtapa(prod, k === 'lavado' ? {kilos: 850} : k === 'fritado' ? {kilos: 400} : {})).turno; }
assert.ok((await PS.turnoActual(db)).productos.some(x => x.id_producto === prodId)); raw.prepare('UPDATE productos SET kg_por_bulto = 10, unidades_por_bulto = 30 WHERE id_producto = ?').run(prodId);
const bolsasAntes = saldo(BOLSA);
raw.prepare("DELETE FROM marcas").run();
await rechaza(PS.registrarEmpaque(emp, {id_producto: prodId, bultos: 1}), /Nadie del grupo de planta ha marcado entrada/, 409);
raw.prepare("INSERT INTO marcas (empleado_id, fecha, entrada_ts, turno, quien, creado_ts) VALUES ('E1', ?, ?, ?, 'rrhh', ?)").run(a0.fecha, Date.now(), a0.jornada, Date.now());
await rechaza(PS.registrarEmpaque(emp, {id_producto: prodId, bultos: 300}), /Faltan bolsas de «Bolsa [^»]+»: hay 6000 y necesitas 9000/, 409);
assert.equal(saldo(BOLSA), bolsasAntes);
await PS.registrarEmpaque(emp, {id_producto: prodId, bultos: 40});
assert.equal(bolsasAntes - saldo(BOLSA), 1200); assert.equal(saldo('empaque'), 0);
ok('«Registrar empaque» dentro del turno abierto exige personal presente y bolsas, y descuenta bultos × bolsas por bulto (40 × 30 = 1.200)');
const cat = raw.prepare('SELECT id FROM motivos_merma WHERE es_otra = 0 ORDER BY orden LIMIT 1').get().id;
await PS.registrarMermaConsolidada(prod, {filas: [{etapa: 'lavado', kilos: 150, id_motivo: cat}, {etapa: 'fritado', kilos: 450, id_motivo: cat}]});
const antes = saldo('bolsones'); await PS.cerrarTurno(prod, {etapas: {}, bultos: {}});
assert.equal(antes - saldo('bolsones'), 2); assert.equal(raw.prepare("SELECT COUNT(*) c FROM inv_movimientos WHERE articulo = 'bolsones' AND ref LIKE 'BOL-%'").get().c, 1);
ok('al cerrar, los 400 kg que pasaron a granel gastan 2 bolsones (400 ÷ 250 hacia arriba) del inventario general');

/* 7 · sin kilos por bolsón cargados no se descuenta */
raw.prepare("DELETE FROM config WHERE clave = 'kg_por_bolson'").run();
assert.equal(await IS.kgPorBolson(db), 0);
const a3 = await PS.arranque(dueno); assert.equal(a3.ok, true);
ok('sin los kilos por bolsón cargados solo cuenta que haya bolsones (no se inventa ninguna cifra)');

/* 8 · sin bolsas de presentación no se empaca */
raw.prepare("INSERT INTO inv_movimientos (articulo, tipo, cantidad, origen, ref, nota, rol, ts) VALUES (?, 'SALIDA', ?, 'consumo', 'VACIAR', 'prueba', 'produccion', ?)").run(BOLSA, saldo(BOLSA), Date.now() + 20);
const rq = await PS.requisitosEmpaque(db); assert.equal(rq.bolsas.por_producto[prodId].ok, false); assert.match(rq.bolsas.por_producto[prodId].motivo, /Falta la «Bolsa /); assert.ok(rq.bolsas.faltan.length >= 1);
await rechaza(PS.anotarEmpaqueLibre(emp, {items: [{id_producto: prodId, bultos: '1'}]}), /No se puede anotar el empaque/, 409);
ok('sin la bolsa de esa presentación Logística no puede anotar empaque (aunque haya bolsones y papa)');
console.log(n + ' pruebas de bolsones y bolsas pasaron.');
