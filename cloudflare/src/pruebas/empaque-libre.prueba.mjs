/* Logística › Empacar sobre la papa a granel: disponible tras cerrar el turno (sin turno abierto), empacar resta y suma al inventario,
   no se pasa de lo disponible, la merma de empaque resta, Ventas ve lo empacado y Producción/Logística no ven dinero.
   Uso: node src/pruebas/empaque-libre.prueba.mjs */
import assert from 'node:assert/strict';
import {crearDB} from './d1-falso.mjs';
import * as PS from '../produccion/servicio.js';
import * as VR from '../ventas/repo.js';
import {sinDinero} from '../produccion/permisos.js';
import * as IS from '../inventario/servicio.js';
import * as GS from '../rrhh/grupos-servicio.js';
import {lunesDe} from '../rrhh/grupos.js';

let n = 0; const ok = m => { n++; console.log('  ok · ' + m); };
const rechaza = async (p, re, st) => { try { await p; } catch (e) { assert.match(String(e.message), re); if (st) assert.equal(e.status, st); return e; } assert.fail('debía rechazar: ' + re); };
const db = crearDB(), raw = db.raw;
raw.exec("UPDATE productos SET activo = 0; INSERT INTO productos (codigo_sku, nombre, gramaje, categoria, stock_entero, kg_por_bulto, unidades_por_bulto) VALUES ('P400','Papas Prueba','400 g','PAPAS',10,12,30), ('P150','Papas Prueba','150 g','PAPAS',0,4.5,30), ('S1','Salsa','1 kg','SALSAS',0,12,12)");
const lg = {db, rol: 'empaque'}, prod = {db, rol: 'produccion'}, ven = {db, rol: 'ventas'}, dueno = {db, rol: 'dueno'};
const ID = sku => raw.prepare('SELECT id_producto i FROM productos WHERE codigo_sku = ?').get(sku).i, P1 = ID('P400'), P2 = ID('P150');
const stock = id => raw.prepare('SELECT stock_entero s FROM productos WHERE id_producto = ?').get(id).s;

// un turno CERRADO con 1.000 kg terminados (entraron a «empacado») y ningún turno abierto
raw.prepare("INSERT INTO turnos (fecha, estado, abierto_ts, abierto_rol, inicio_ts) VALUES ('2026-01-05', 'CERRADO', 1, 'Producción', 1)").run();
raw.prepare("INSERT INTO movimientos_proceso (id_turno, etapa, sentido, kilos, rol, ts) VALUES (1, 'empacado', 'ENTRA', 1000, 'Producción', 1)").run();
assert.equal(raw.prepare("SELECT COUNT(*) c FROM turnos WHERE estado = 'ABIERTO'").get().c, 0);
// requisitos: grupo de planta armado con una persona que marcó entrada y 6.000 y 2.500 bolsas por presentación en el inventario (una bolsa por presentación)
const adm = {db, rol: 'adm'}, rrhh = {db, rol: 'rrhh'};
raw.prepare('INSERT INTO docs (col, id, data, updated) VALUES (?, ?, ?, 1)').run('empleados', 'E1', JSON.stringify({id: 'E1', n: 'Ana', area: 'Planta'}));
await GS.guardarMiembros(rrhh, {grupo_id: 1, empleados: ['E1']});
const arr = await PS.arranque(dueno), lun = lunesDe(arr.fecha);
await GS.asignarSemana(rrhh, {semana: lun, grupo_id: 1, turno: arr.jornada, ambos: false});
const marcar = () => raw.prepare("INSERT INTO marcas (empleado_id, fecha, entrada_ts, turno, quien, creado_ts) VALUES ('E1', ?, ?, ?, 'rrhh', ?)").run(arr.fecha, Date.now(), arr.jornada, Date.now());
const quitarMarca = () => raw.prepare("DELETE FROM marcas WHERE empleado_id = 'E1'").run();
await IS.conteoInicial(adm, {conteos: [{articulo: 'bolsa-' + P1, cantidad: 6000}, {articulo: 'bolsa-' + P2, cantidad: 2500}]});
marcar();
let g = await PS.empaqueLibreInfo(lg);
assert.equal(g.disponible_kg, 1000); assert.equal(g.productos.length, 2); assert.ok(!g.productos.some(p => /Salsa/.test(p.nombre))); assert.equal(g.productos[0].bolsas_por_bulto, 30);
ok('con el turno cerrado y ninguno abierto, hay 1.000 kg de papa a granel disponibles (solo presentaciones de papa)');

await PS.anotarEmpaqueLibre(lg, {items: [{id_producto: P1, bultos: '50'}]});   // 50 × 12 = 600 kg
g = await PS.empaqueLibreInfo(lg); assert.equal(g.disponible_kg, 400); assert.equal(g.empacado_kg, 600); assert.equal(stock(P1), 60);
assert.equal(raw.prepare(`SELECT COUNT(*) c FROM movimientos_inventario WHERE id_producto = ${P1} AND cantidad = 50`).get().c, 1);
ok('empacar 50 bultos de 12 kg resta 600 kg del granel (quedan 400) y suma 50 al inventario terminado');

await rechaza(PS.anotarEmpaqueLibre(lg, {items: [{id_producto: P1, bultos: '40'}]}), /Solo hay 400 kg/, 409);   // 480 > 400
assert.equal(stock(P1), 60); assert.equal((await PS.empaqueLibreInfo(lg)).disponible_kg, 400);
ok('no deja empacar más de lo disponible (mensaje simple) y no cambia nada');

await PS.anotarEmpaqueLibre(lg, {items: [{id_producto: P2, bultos: '10'}], merma: {kg: '5,5', motivo: 'Bolsas dañadas'}});   // 45 + 5,5
g = await PS.empaqueLibreInfo(lg); assert.equal(g.disponible_kg, 349.5); assert.equal(g.merma_kg, 5.5); assert.equal(stock(P2), 10);
await rechaza(PS.anotarEmpaqueLibre(lg, {merma: {kg: '1', motivo: 'Inventado'}}), /motivo/, 400);
await rechaza(PS.anotarEmpaqueLibre(lg, {items: []}), /Escribe cuántos/, 400);
ok('la merma de empaque resta del granel (349,5 kg), exige un motivo de la lista y lo no empacado ni mermado queda a granel');

assert.equal(VR.listarProductos ? (await VR.listarProductos(db)).find(p => p.id_producto === P1).stock_entero : 0, 60);
assert.equal((await VR.disponiblePorProducto(db)).find(p => p.id_producto === P1).stock_entero, 60);
ok('Ventas lee el mismo inventario: ya ve los 60 bultos para venderlos enseguida');

await rechaza(PS.anotarEmpaqueLibre(prod, {items: [{id_producto: P1, bultos: '1'}]}), /Logística/, 403);
await rechaza(PS.anotarEmpaqueLibre(ven, {items: [{id_producto: P1, bultos: '1'}]}), /Logística/, 403);
const vista = sinDinero(await PS.empaqueLibreInfo(prod)); assert.ok(!/precio|costo|usd|monto/i.test(JSON.stringify(vista)));
ok('solo Logística y Gerencia anotan; Producción ve el granel sin dinero');
await PS.anotarEmpaqueLibre(dueno, {items: [{id_producto: P1, bultos: '1'}]}); assert.equal(stock(P1), 61);
ok('Gerencia también puede anotar');

// --- Bolsas de presentación y personal presente ---
const bolsas = () => raw.prepare("SELECT COALESCE(SUM(CASE tipo WHEN 'ENTRADA' THEN cantidad ELSE -cantidad END),0) s FROM inv_movimientos WHERE articulo LIKE 'bolsa-%'").get().s;
const bolsaDe = id => raw.prepare("SELECT COALESCE(SUM(CASE tipo WHEN 'ENTRADA' THEN cantidad ELSE -cantidad END),0) s FROM inv_movimientos WHERE articulo = ?").get('bolsa-' + id).s;
assert.equal(bolsas(), 8500 - 30 * (50 + 10 + 1));
ok('empacar descuenta las bolsas de presentación del inventario general (bultos × bolsas por bulto): 61 bultos × 30 = 1.830');
g = await PS.empaqueLibreInfo(lg); assert.equal(g.requisitos.ok, true); assert.equal(g.requisitos.bolsas.por_producto[P1].saldo, 4470); assert.equal(g.requisitos.bolsas.por_producto[P2].saldo, 2200); assert.equal(bolsaDe(P1), 4470); assert.equal(g.requisitos.personal.presentes, 1); assert.equal(g.productos.find(p => p.id_producto === P1).max_bultos_bolsas, Math.floor(4470 / 30)); assert.equal(g.productos.find(p => p.id_producto === P2).max_bultos_bolsas, Math.floor(2200 / 30));
ok('arriba se ven los requisitos en verde: bolsas por presentación (4.470 y 2.200) y personal presente (1), y cuántos bultos alcanzan');

quitarMarca();
let e = await rechaza(PS.anotarEmpaqueLibre(lg, {items: [{id_producto: P1, bultos: '1'}]}), /Nadie del grupo de planta ha marcado entrada/, 409);
assert.equal(e.extra.codigo, 'EMPAQUE_BLOQUEADO'); assert.equal(stock(P1), 61); assert.equal(bolsas(), 6670);
await rechaza(PS.anotarEmpaqueLibre(dueno, {items: [{id_producto: P1, bultos: '1'}]}), /Nadie del grupo/, 409);   // ni el Gerente lo salta
g = await PS.empaqueLibreInfo(lg); assert.equal(g.requisitos.personal.ok, false); assert.equal(g.requisitos.ok, false);
ok('sin personal presente no se puede anotar empaque (ni el Gerente) y no cambia nada');
marcar();

const may = Math.floor(2200 / 30) + 1;   // 74 bultos × 30 = 2.220 > 2.200 bolsas de esa presentación
await PS.anotarEmpaqueLibre(lg, {merma: {kg: '1', motivo: 'Bolsas dañadas'}});
e = await rechaza(PS.anotarEmpaqueLibre(lg, {items: [{id_producto: P2, bultos: String(may)}]}), /Faltan bolsas de «Bolsa Papas Prueba 150 g»: hay 2200 y necesitas 2220/, 409);
assert.equal(e.extra.codigo, 'FALTAN_BOLSAS'); assert.equal(bolsas(), 6670);
ok('no deja empacar más bultos que bolsas alcanzan de ESA presentación (mensaje simple) y no descuenta nada');

raw.prepare("INSERT INTO inv_movimientos (articulo, tipo, cantidad, origen, ref, nota, rol, ts) VALUES (?, 'SALIDA', ?, 'consumo', 'VACIAR', 'prueba', 'produccion', ?)").run('bolsa-' + P1, bolsaDe(P1), Date.now() + 50);
e = await rechaza(PS.anotarEmpaqueLibre(lg, {items: [{id_producto: P1, bultos: '1'}]}), /No se puede anotar el empaque\. Falta la «Bolsa Papas Prueba 400 g»\. Administración debe comprarla y Producción recibirla/, 409);
g = await PS.empaqueLibreInfo(lg); assert.equal(g.requisitos.bolsas.por_producto[P1].ok, false); assert.equal(g.requisitos.bolsas.por_producto[P1].motivo.includes('comprarla'), true); assert.equal(g.requisitos.bolsas.por_producto[P2].ok, true);
await PS.anotarEmpaqueLibre(lg, {items: [{id_producto: P2, bultos: '1'}]});   // la otra presentación sigue libre
ok('sin la bolsa de una presentación solo esa fila se bloquea (con su nombre y quién debe comprar y recibir); la otra presentación sigue empacando');

const sin = sinDinero(await PS.empaqueLibreInfo(prod)); assert.ok(!/precio|costo|usd|monto/i.test(JSON.stringify(sin)));
ok('Producción y Logística ven los requisitos sin dinero');
console.log(n + ' pruebas de empaque libre pasaron.');
