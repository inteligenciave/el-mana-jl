/* Bolsas por presentación (migración 0047): una bolsa por cada presentación de papa, con su existencia, mínimo y compra propios;
   «Bolsas sin presentación» (el artículo viejo) se reparte entre ellas; Empacar descuenta la bolsa de SU presentación y bloquea solo esa fila.
   Base en memoria, datos inventados. Uso: node src/pruebas/bolsas-presentacion.prueba.mjs */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {crearDB} from './d1-falso.mjs';
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
const dueno = {db, rol: 'dueno'}, adm = {db, rol: 'adm'}, prod = {db, rol: 'produccion'}, emp = {db, rol: 'empaque'}, ven = {db, rol: 'ventas'}, rrhh = {db, rol: 'rrhh'};
const saldo = cod => raw.prepare("SELECT COALESCE(SUM(CASE WHEN tipo='ENTRADA' THEN cantidad ELSE -cantidad END),0) s FROM inv_movimientos WHERE articulo=?").get(cod).s;
const art = cod => raw.prepare('SELECT * FROM inv_articulos WHERE codigo = ?').get(cod);
const bolsasVivas = () => raw.prepare("SELECT codigo FROM inv_articulos WHERE codigo LIKE 'bolsa-%' AND activo = 1 ORDER BY codigo").all().map(x => x.codigo);

/* 1 · la migración: «empaque» se renombra y hay una bolsa por cada presentación de papa (nada para salsas ni para bolsones) */
assert.equal(art('empaque').nombre, 'Bolsas sin presentación'); assert.equal(art('bolsones').nombre, 'Bolsones');
const papas = raw.prepare("SELECT id_producto i FROM productos WHERE categoria = 'PAPAS' ORDER BY id_producto").all().map(x => x.i);
assert.ok(papas.length >= 2); assert.deepEqual(bolsasVivas(), papas.map(i => 'bolsa-' + i).sort());
assert.match(art('bolsa-' + papas[0]).nombre, /^Bolsa Papas/); assert.equal(art('bolsa-' + papas[0]).unidad, 'und');
assert.equal(raw.prepare("SELECT COUNT(*) c FROM inv_articulos WHERE codigo LIKE 'bolsa-%' AND codigo NOT IN (" + papas.map(i => `'bolsa-${i}'`).join(',') + ')').get().c, 0);
ok('«empaque» pasa a «Bolsas sin presentación» y cada presentación de papa tiene su bolsa (sin bolsa de salsas ni de bolsones)');

/* 2 · presentación nueva / renombrada / archivada: su bolsa la sigue sola */
const ins = raw.prepare("INSERT INTO productos (codigo_sku, nombre, gramaje, categoria, stock_entero) VALUES ('PX1','Papas Nuevas','500 g','PAPAS',0)").run();
const PX = Number(ins.lastInsertRowid);
assert.equal(art('bolsa-' + PX).nombre, 'Bolsa Papas Nuevas 500 g'); assert.equal(art('bolsa-' + PX).activo, 1);
raw.prepare("INSERT INTO productos (codigo_sku, nombre, gramaje, categoria, stock_entero) VALUES ('SX1','Salsa Nueva','1 kg','SALSAS',0)").run();
assert.equal(raw.prepare("SELECT COUNT(*) c FROM inv_articulos WHERE nombre LIKE '%Salsa Nueva%'").get().c, 0);
raw.prepare("UPDATE productos SET nombre = 'Papas Renombradas' WHERE id_producto = ?").run(PX); assert.equal(art('bolsa-' + PX).nombre, 'Bolsa Papas Renombradas 500 g');
raw.prepare("UPDATE productos SET activo = 0 WHERE id_producto = ?").run(PX); assert.equal(art('bolsa-' + PX).activo, 0); assert.ok(!bolsasVivas().includes('bolsa-' + PX));
raw.prepare("UPDATE productos SET activo = 1 WHERE id_producto = ?").run(PX); assert.equal(art('bolsa-' + PX).activo, 1);
ok('una presentación nueva crea su bolsa, renombrarla la renombra, archivarla la archiva (y reactivarla la reactiva); las salsas no crean bolsa');

/* 3 · conteo inicial: stock «sin presentación» y una bolsa con su propia existencia */
const P1 = papas[0], P2 = papas[1], B1 = 'bolsa-' + P1, B2 = 'bolsa-' + P2;
const base = ['papa', 'aceite', 'agua', 'sal', 'quimicos', 'almidon', 'bolsones'];
await IS.conteoInicial(adm, {conteos: [...base.map(x => ({articulo: x, cantidad: 3000})), {articulo: 'empaque', cantidad: 5000}, {articulo: B1, cantidad: 100}]});
assert.equal(saldo('empaque'), 5000); assert.equal(saldo(B1), 100); assert.equal(saldo(B2), 0);
const inv0 = (await IS.ver(adm)).articulos;
for (const c of ['empaque', B1, B2]) assert.ok(inv0.some(a => a.codigo === c));
ok('cada bolsa tiene su propia existencia: la de la presentación 1 arranca con 100, la 2 con 0 y las sin presentación con 5.000');

/* 4 · mínimo y barra por bolsa (los fijan Gerencia y Administración) */
await IS.fijarMinimo(adm, B1, {minimo: 80}); await IS.fijarMinimo(dueno, B2, {minimo: 20});
await rechaza(IS.fijarMinimo(prod, B1, {minimo: 1}), /Solo/, 403); await rechaza(IS.fijarMinimo(emp, B1, {minimo: 1}), /Solo/, 403);
let inv = (await IS.ver(adm)).articulos; assert.equal(inv.find(a => a.codigo === B1).minimo, 80); assert.equal(inv.find(a => a.codigo === B1).nivel, 'amarillo');
assert.equal(inv.find(a => a.codigo === B2).nivel, 'rojo'); assert.equal(inv.find(a => a.codigo === 'empaque').minimo, 0);
ok('cada bolsa tiene su propio mínimo y su barra (100 con mínimo 80 = amarillo; 0 con mínimo 20 = rojo); Producción y Logística no lo cambian');

/* 5 · «Repartir bolsas sin presentación» */
await rechaza(IS.repartirBolsas(prod, {reparto: [{articulo: B2, cantidad: 10}], nota: 'prueba'}), /Solo Gerencia y Administración/, 403);
await rechaza(IS.repartirBolsas(emp, {reparto: [{articulo: B2, cantidad: 10}], nota: 'prueba'}), /Solo Gerencia y Administración/, 403);
await rechaza(IS.repartirBolsas(adm, {reparto: [{articulo: B2, cantidad: 10}], nota: ''}), /nota/, 400);
await rechaza(IS.repartirBolsas(adm, {reparto: [], nota: 'prueba'}), /cuántas bolsas/, 400);
await rechaza(IS.repartirBolsas(adm, {reparto: [{articulo: 'aceite', cantidad: 10}], nota: 'prueba'}), /hacia una presentación/, 400);
await rechaza(IS.repartirBolsas(adm, {reparto: [{articulo: B2, cantidad: 2.5}], nota: 'prueba'}), /entero/, 400);
await rechaza(IS.repartirBolsas(adm, {reparto: [{articulo: B2, cantidad: 6000}], nota: 'prueba'}), /Solo hay 5000 bolsas sin presentación/, 409);
await rechaza(IS.repartirBolsas(adm, {reparto: [{articulo: 'bolsa-99999', cantidad: 5}], nota: 'prueba'}), /no existe/, 404);
assert.equal(saldo('empaque'), 5000);
await IS.repartirBolsas(adm, {reparto: [{articulo: B2, cantidad: 3000}, {articulo: B1, cantidad: '500'}], nota: 'Bolsas del conteo de prueba'});
assert.equal(saldo('empaque'), 1500); assert.equal(saldo(B1), 600); assert.equal(saldo(B2), 3000);
assert.equal(saldo('empaque') + saldo(B1) + saldo(B2), 5100);
assert.equal(raw.prepare("SELECT COUNT(*) c FROM inv_movimientos WHERE origen = 'reparto'").get().c, 3);
assert.equal(raw.prepare("SELECT COUNT(*) c FROM auditoria_sistema WHERE accion LIKE '%repartió bolsas%'").get().c, 1);
const vis = (await IS.ver(dueno)); assert.ok(vis.movimientos.some(m => m.origen === 'reparto'));
ok('«Repartir bolsas sin presentación»: solo Gerencia y Administración, con nota y enteros; no pasa de lo que hay; el total de bolsas no cambia (5.100) y queda auditado');

/* 6 · compra y recepción por bolsa (la bolsa sin presentación ya no se compra) */
doc('proveedores', 'PB', {nombre: 'Proveedor Bolsas (prueba)', tipo: 'insumo', rubro: 'bolsas', cond: 'Contado', prueba: true});
const dir = (await CS.insumosDirectos(adm)).insumos;
assert.ok(dir.some(x => x.id === 'INV:' + B1) && dir.some(x => x.id === 'INV:' + B2)); assert.ok(!dir.some(x => x.id === 'INV:empaque')); assert.ok(dir.some(x => x.id === 'INV:bolsones'));
assert.ok(dir.filter(x => /^INV:bolsa-/.test(x.id)).every(x => x.unidad === 'und'));
const c = await CS.crear(adm, {proveedor_id: 'PB', fecha: hoy, condicion: 'CREDITO', plazo_dias: 15, factura: 'B-1', lineas: [{producto_id: 'INV:' + B2, cantidad: 4000, precio_usd: 0.03}, {producto_id: 'INV:' + B1, cantidad: 1000, precio_usd: 0.04}]});
assert.equal(c.lineas ? c.lineas.length : 2, 2);
const pend = await CS.listar(prod, 'PENDIENTE'); assert.ok(!/precio|usd|total|banco/i.test(JSON.stringify(sinDinero(pend).pedidos.map(p => p.lineas))), 'Producción ve la compra sin precios');
await RC.recibir(prod, {nro: c.nro, lineas: [{producto_id: 'INV:' + B2, recibido: 4000}, {producto_id: 'INV:' + B1, recibido: 1000}]});
assert.equal(saldo(B2), 7000); assert.equal(saldo(B1), 1600); assert.equal(saldo('empaque'), 1500);
await rechaza(CS.crear(ven, {proveedor_id: 'PB', fecha: hoy, condicion: 'CREDITO', plazo_dias: 15, factura: 'B-2', lineas: [{producto_id: 'INV:' + B1, cantidad: 10, precio_usd: 0.03}]}), /./, 403);
ok('Administración compra y Producción recibe cada bolsa por su presentación (la «sin presentación» no sale en la lista de compra); lo recibido suma solo a esa bolsa y Producción no ve precios');

/* 7 · Empacar libre: cada presentación descuenta SU bolsa y se bloquea solo la fila sin bolsa */
raw.exec("UPDATE productos SET activo = 0 WHERE id_producto NOT IN (" + [P1, P2].join(',') + ")");
raw.prepare('UPDATE productos SET kg_por_bulto = 10, unidades_por_bulto = 30 WHERE id_producto IN (?, ?)').run(P1, P2);
raw.prepare("INSERT INTO turnos (fecha, estado, abierto_ts, abierto_rol, inicio_ts) VALUES ('2026-01-05', 'CERRADO', 1, 'Producción', 1)").run();
raw.prepare("INSERT INTO movimientos_proceso (id_turno, etapa, sentido, kilos, rol, ts) VALUES (1, 'empacado', 'ENTRA', 1000, 'Producción', 1)").run();
doc('empleados', 'E1', {n: 'Ana', area: 'Planta'}); await GS.guardarMiembros(rrhh, {grupo_id: 1, empleados: ['E1']});
const arr = await PS.arranque(dueno); await GS.asignarSemana(rrhh, {semana: lunesDe(arr.fecha), grupo_id: 1, turno: arr.jornada, ambos: false});
raw.prepare("INSERT INTO marcas (empleado_id, fecha, entrada_ts, turno, quien, creado_ts) VALUES ('E1', ?, ?, ?, 'rrhh', ?)").run(arr.fecha, Date.now(), arr.jornada, Date.now());
raw.prepare("INSERT INTO inv_movimientos (articulo, tipo, cantidad, origen, ref, nota, rol, ts) VALUES (?, 'SALIDA', ?, 'consumo', 'VACIAR2', 'prueba', 'produccion', ?)").run(B2, saldo(B2), Date.now() + 5);   // la presentación 2 se queda sin bolsas
let g = await PS.empaqueLibreInfo(emp);
const f1 = g.productos.find(p => p.id_producto === P1), f2 = g.productos.find(p => p.id_producto === P2);
assert.equal(f1.bolsa.ok, true); assert.equal(f1.bolsa.saldo, 1600); assert.equal(f1.max_bultos_bolsas, 53); assert.equal(f2.bolsa.ok, false); assert.match(f2.bolsa.motivo, /Falta la «Bolsa Papas/);
assert.deepEqual(g.requisitos.bolsas.faltan.length, 1); assert.equal(g.requisitos.ok, true);
ok('Empacar muestra por cada presentación cuántas bolsas tiene y cuántos bultos alcanzan; la que no tiene queda marcada y las demás siguen libres');
const e = await rechaza(PS.anotarEmpaqueLibre(emp, {items: [{id_producto: P2, bultos: '2'}]}), /No se puede anotar el empaque\. Falta la «Bolsa Papas/, 409); assert.equal(e.extra.codigo, 'EMPAQUE_BLOQUEADO');
await rechaza(PS.anotarEmpaqueLibre(emp, {items: [{id_producto: P1, bultos: '54'}]}), /Faltan bolsas de «Bolsa Papas/, 409);   // 54 × 30 = 1.620 > 1.600
assert.equal(saldo(B1), 1600);
await PS.anotarEmpaqueLibre(emp, {items: [{id_producto: P1, bultos: '10'}]});   // 300 bolsas
assert.equal(saldo(B1), 1300); assert.equal(saldo(B2), 0); assert.equal(saldo('empaque'), 1500);
await PS.anotarEmpaqueLibre(emp, {items: [{id_producto: P1, bultos: '1'}, {id_producto: P1, bultos: '1'}]}).catch(x => x);   // la misma presentación repetida suma sus bolsas
assert.ok(saldo(B1) <= 1300 && saldo(B1) >= 1240);
const vp = sinDinero(await PS.empaqueLibreInfo(prod)); assert.ok(!/precio|costo|usd|monto/i.test(JSON.stringify(vp)));
ok('«Anotar empaque» descuenta bultos × bolsas por bulto de la bolsa de SU presentación (10 × 30 = 300), no toca ni «sin presentación» ni las otras, y la fila sin bolsa se rechaza con el nombre de la que falta');

/* 8 · sin conteo inicial se bloquea todo con un mensaje claro y no se exige el artículo viejo */
const db2 = crearDB(), raw2 = db2.raw; raw2.prepare('UPDATE productos SET kg_por_bulto = 10, unidades_por_bulto = 30').run();
const rq0 = await PS.requisitosEmpaque(db2); assert.equal(rq0.bolsas.conteo_ok, false); assert.match(rq0.bolsas.motivo, /conteo inicial/);
await IS.conteoInicial({db: db2, rol: 'adm'}, {conteos: [{articulo: 'papa', cantidad: 1}]});
const rq1 = await PS.requisitosEmpaque(db2); assert.equal(rq1.bolsas.conteo_ok, true); assert.equal(rq1.bolsas.faltan.length, 3);
ok('sin conteo inicial se pide el conteo; con conteo y sin bolsas, faltan las 3 bolsas por presentación (el artículo viejo «sin presentación» ya no se exige)');

/* 9 · migración desde cero y su reversa */
const db3 = crearDB(), r3 = db3.raw;
r3.prepare("INSERT INTO inv_movimientos (articulo, tipo, cantidad, origen, ref, nota, rol, ts) VALUES ('empaque', 'ENTRADA', 800, 'compra', 'C-1', 'x', 'adm', 1), ('bolsa-1', 'ENTRADA', 300, 'reparto', 'R-1', 'x', 'adm', 2), ('empaque', 'SALIDA', 300, 'reparto', 'R-1', 'x', 'adm', 2), ('bolsa-2', 'SALIDA', 40, 'consumo', 'E-1', 'x', 'adm', 3)").run();
const tot = () => r3.prepare("SELECT COALESCE(SUM(CASE WHEN tipo='ENTRADA' THEN cantidad ELSE -cantidad END),0) s FROM inv_movimientos WHERE articulo IN ('empaque') OR articulo LIKE 'bolsa-%'").get().s;
assert.equal(tot(), 760);
r3.exec(sql('reversa/0047_bolsa_por_presentacion_reversa.sql'));
assert.equal(r3.prepare("SELECT nombre FROM inv_articulos WHERE codigo = 'empaque'").get().nombre, 'Bolsas de presentación');
assert.equal(r3.prepare("SELECT COUNT(*) c FROM inv_articulos WHERE codigo LIKE 'bolsa-%'").get().c, 0);
assert.equal(r3.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE name LIKE 'trg_bolsa%'").get().c, 0);
assert.equal(r3.prepare("SELECT COALESCE(SUM(CASE WHEN tipo='ENTRADA' THEN cantidad ELSE -cantidad END),0) s FROM inv_movimientos WHERE articulo = 'empaque'").get().s, 760);
assert.throws(() => r3.prepare("INSERT INTO inv_movimientos (articulo, tipo, cantidad, origen, ref, ts) VALUES ('empaque','ENTRADA',1,'reparto','Z',1)").run());
r3.exec(sql('migrations/0047_bolsa_por_presentacion.sql'));
assert.equal(r3.prepare("SELECT nombre FROM inv_articulos WHERE codigo = 'empaque'").get().nombre, 'Bolsas sin presentación');
assert.equal(r3.prepare("SELECT COUNT(*) c FROM inv_articulos WHERE codigo LIKE 'bolsa-%'").get().c, 3);
assert.equal(r3.prepare("SELECT COALESCE(SUM(CASE WHEN tipo='ENTRADA' THEN cantidad ELSE -cantidad END),0) s FROM inv_movimientos WHERE articulo = 'empaque'").get().s, 760);
r3.prepare("INSERT INTO inv_movimientos (articulo, tipo, cantidad, origen, ref, ts) VALUES ('empaque','SALIDA',1,'reparto','Z',1)").run();
ok('migración 0047: la reversa junta todas las bolsas en «Bolsas de presentación» sin cambiar el saldo total (760) y quita los disparadores; aplicarla otra vez vuelve a crear las bolsas y admite «reparto»');
const dup = crearDB(); dup.raw.exec(sql('migrations/0047_bolsa_por_presentacion.sql'));
assert.equal(dup.raw.prepare("SELECT COUNT(*) c FROM inv_articulos WHERE codigo LIKE 'bolsa-%'").get().c, 3);
ok('aplicar la migración dos veces no duplica nada');

console.log(n + ' pruebas de bolsas por presentación pasaron.');
