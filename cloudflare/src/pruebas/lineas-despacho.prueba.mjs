/* Líneas de despacho: % del camión por papa y salsa, una zona en una sola línea, estados, permisos (solo Gerencia organiza), armar la salida por línea mezclando zonas,
   la decisión de Gerencia prevalece sobre Logística cuando la línea pasa del 100 %, zonas bloqueadas por salidas armadas, salidas viejas por zona, capacidades en Ajustes, sin dinero y auditoría.
   Uso: node src/pruebas/lineas-despacho.prueba.mjs */
import assert from 'node:assert/strict';
import {crearDB} from './d1-falso.mjs';
import * as PS from '../produccion/servicio.js';
import * as LS from '../produccion/lineas-servicio.js';
import * as L from '../produccion/lineas.js';
import {sinDinero} from '../produccion/permisos.js';
import * as VR from '../ventas/repo.js';

let n = 0; const ok = m => { n++; console.log('  ok · ' + m); };
const rechaza = async (p, re, st, codigo) => { try { await p; } catch (e) { assert.match(String(e.message), re); if (st) assert.equal(e.status, st); if (codigo) assert.equal((e.extra || {}).codigo, codigo); return e; } assert.fail('debía rechazar: ' + re); };

/* ---------- 1. Dominio puro ---------- */
const caps = {capPapa: 10000, capSalsa: 15000};
assert.equal(L.pctDe(10000, 0, caps), 100); assert.equal(L.pctDe(0, 15000, caps), 100); assert.equal(L.pctDe(5000, 7500, caps), 100); assert.equal(L.pctDe(6000, 3000, caps), 80);
assert.equal(L.tipoCarga(null), 'papa'); assert.equal(L.tipoCarga('SALSAS'), 'salsa'); assert.equal(L.tipoCarga('PAPAS'), 'papa'); assert.equal(L.tipoCarga('MAYONESA'), 'papa');
const sc = L.ocupacion({kgPapa: 100, kgSalsa: 0}, {capPapa: 0, capSalsa: 15000}); assert.equal(sc.pct, 0); assert.equal(sc.sin_capacidad, true); assert.ok(Number.isFinite(sc.pct));
ok('10.000 kg de papa = 100 %, 15.000 kg de salsa = 100 %, 5.000 + 7.500 = 100 %, 6.000 + 3.000 = 80 %; sin categoría cuenta como papa; capacidad 0 no divide por cero');

const db = crearDB(), raw = db.raw, ger = {db, rol: 'dueno'}, lg = {db, rol: 'empaque'}, ven = {db, rol: 'ventas'}, adm = {db, rol: 'adm'}, prod = {db, rol: 'produccion'};
raw.exec("INSERT INTO clientes (razon_social, razon_norm) VALUES ('Cliente Uno', 'CLIENTE UNO'), ('Cliente Dos', 'CLIENTE DOS'), ('Cliente Tres', 'CLIENTE TRES')");
raw.exec("INSERT INTO productos (codigo_sku, nombre, gramaje, categoria, stock_entero, kg_por_bulto, unidades_por_bulto) VALUES ('LD-P', 'Papas Línea', '400 g', 'PAPAS', 5000, 10, 30), ('LD-S', 'Salsa Línea', '1 kg', 'SALSAS', 5000, 5, 12)");
const ID = sku => raw.prepare('SELECT id_producto i FROM productos WHERE codigo_sku = ?').get(sku).i, P = ID('LD-P'), S = ID('LD-S');
let nroPed = 0;
function pedido(zona, cliente, items) {   // items = [[id_producto, bultos]]
  const nro = 'PV-LD' + (++nroPed), r = raw.prepare("INSERT INTO pedidos_venta (nro, id_cliente, zona, estado, tipo, fecha, creado_ts, creado_rol) VALUES (?, ?, ?, 'PENDIENTE', 'NOTA_ENTREGA', '2026-11-18', ?, 'Ventas')").run(nro, cliente, zona, Date.now());
  const idp = Number(r.lastInsertRowid);
  for (const [pr, b] of items) {
    const p = raw.prepare('SELECT * FROM productos WHERE id_producto = ?').get(pr);
    raw.prepare('INSERT INTO pedido_venta_lineas (id_pedido, id_producto, sku, nombre, bultos, kg_por_bulto, precio_base_cents, precio_pp_cents, precio_mora_cents, alicuota) VALUES (?,?,?,?,?,?,1000,1000,1000,0)').run(idp, pr, p.codigo_sku, p.nombre, b, p.kg_por_bulto);
    raw.prepare('UPDATE productos SET stock_apartado = stock_apartado + ? WHERE id_producto = ?').run(b, pr);
  }
  return idp;
}
const lineasDe = idp => raw.prepare('SELECT id, id_producto, bultos FROM pedido_venta_lineas WHERE id_pedido = ?').all(idp);
const linea = async nombre => (await LS.listaLineas(db)).lineas.find(l => l.nombre === nombre);
const sel = (idp, f = 1) => lineasDe(idp).map(l => ({id_linea: l.id, bultos: Math.floor(l.bultos * f)}));

/* ---------- 2 y 3. Crear líneas, una zona en una sola línea, «Sin línea» ---------- */
let v = await LS.listaLineas(db);
assert.deepEqual(v.capacidad, {papa_kg: 10000, salsa_kg: 15000}); assert.equal(v.lineas.length, 0);
assert.ok(v.zonas_posibles.includes('Aragua') && v.zonas_posibles.includes('Capital') && v.zonas_posibles.includes('Oriente') && v.zonas_posibles.includes('Sin zona'));
assert.ok(!v.zonas_posibles.includes('Distrito Capital'));
const p1 = pedido('Aragua', 1, [[P, 400]]), p2 = pedido('Carabobo', 2, [[P, 200], [S, 600]]), p3 = pedido('Lara', 3, [[P, 100]]);   // Aragua 4.000 papa · Carabobo 2.000 papa + 3.000 salsa · Lara 1.000 papa
v = await LS.crearLinea(ger, {nombre: 'Centro', zonas: ['Aragua', 'Carabobo', 'Sin zona']});
assert.equal(v.lineas.length, 1);
v = await LS.crearLinea(ger, {nombre: 'Occidente', zonas: ['Aragua', 'Lara']});   // Aragua pasa a Occidente: sale de Centro
const centro = v.lineas.find(l => l.nombre === 'Centro'), occ = v.lineas.find(l => l.nombre === 'Occidente');
assert.deepEqual(centro.zonas.map(z => z.zona).sort(), ['Carabobo', 'Sin zona']); assert.deepEqual(occ.zonas.map(z => z.zona).sort(), ['Aragua', 'Lara']);
assert.equal(raw.prepare("SELECT COUNT(*) c FROM linea_zonas WHERE zona = 'Aragua'").get().c, 1);
ok('una zona vive en una sola línea: asignarla a otra la saca de la primera');
assert.ok(v.sin_linea.zonas.some(z => z.zona === 'Miranda') && !v.sin_linea.zonas.some(z => z.zona === 'Aragua') && v.sin_linea.zonas.every(z => z.zona !== 'Sin zona'));
ok('las zonas que no están en ninguna línea salen en «Sin línea» (y «Sin zona» se puede asignar)');
await LS.cambiarLinea(ger, centro.id_linea, {zonas: ['Carabobo', 'Aragua']});   // Aragua vuelve a Centro: Occidente se queda con Lara
v = await LS.listaLineas(db); assert.deepEqual(v.lineas.find(l => l.nombre === 'Occidente').zonas.map(z => z.zona), ['Lara']);
await LS.cambiarLinea(ger, centro.id_linea, {zonas: ['Carabobo', 'Aragua']});   // sin cambios: no falla

/* ---------- 4. Permisos ---------- */
await rechaza(LS.crearLinea(lg, {nombre: 'X1', zonas: []}), /Solo Gerencia/, 403);
await rechaza(LS.cambiarLinea(lg, centro.id_linea, {nombre: 'Otro'}), /Solo Gerencia/, 403);
await rechaza(LS.borrarLinea(lg, centro.id_linea), /Solo Gerencia/, 403);
await rechaza(LS.crearLinea(ven, {nombre: 'X2', zonas: []}), /Solo Gerencia/, 403);
const { rutasProduccion } = await import('../produccion/rutas.js');
const llama = async (rol, m, ruta, cuerpo) => { const r = await rutasProduccion(new Request('http://x/api/p' + ruta, {method: m, headers: {'x-rol': rol, 'content-type': 'application/json'}, body: cuerpo ? JSON.stringify(cuerpo) : undefined}), {DB: db}, new URL('http://x/api/p' + ruta)); return {st: r.status, j: await r.json()}; };
assert.equal((await llama('ventas', 'GET', '/lineas')).st, 403); assert.equal((await llama('adm', 'GET', '/lineas')).st, 403); assert.equal((await llama('produccion', 'GET', '/lineas')).st, 403);
assert.equal((await llama('empaque', 'GET', '/lineas')).st, 200); assert.equal((await llama('dueno', 'GET', '/lineas')).st, 200);
assert.equal((await llama('empaque', 'POST', '/lineas', {nombre: 'X3', zonas: []})).st, 403); assert.equal((await llama('ventas', 'POST', '/lineas/1/borrar')).st, 403);
ok('Logística y Ventas reciben 403 al crear, cambiar o borrar; Ventas, Administración y Producción no leen las líneas; Logística y Gerencia sí');

/* ---------- 5. Nombres ---------- */
await rechaza(LS.crearLinea(ger, {nombre: 'CENTRO', zonas: []}), /Ya hay una línea con ese nombre/, 409);
await rechaza(LS.crearLinea(ger, {nombre: ' c ', zonas: []}), /mínimo 2 letras/, 400);
await rechaza(LS.crearLinea(ger, {nombre: 'x'.repeat(41), zonas: []}), /muy largo/, 400);
await rechaza(LS.cambiarLinea(ger, occ.id_linea, {nombre: 'centro'}), /Ya hay una línea con ese nombre/, 409);
await rechaza(LS.crearLinea(ger, {nombre: 'Zona rara', zonas: ['Narnia']}), /no existe/, 400);
ok('nombre repetido (aunque cambien las mayúsculas), muy corto, muy largo o zona inexistente: error en lenguaje simple');

/* ---------- Cálculo combinado, aporte por zona y estados ---------- */
v = await LS.listaLineas(db);
let c = v.lineas.find(l => l.nombre === 'Centro');   // Aragua 4.000 papa + Carabobo 2.000 papa 3.000 salsa = 6.000 papa (60 %) + 3.000 salsa (20 %) = 80 %
assert.equal(c.kg_papa, 6000); assert.equal(c.kg_salsa, 3000); assert.equal(c.kilos, 9000); assert.equal(c.ocupacion_pct, 80); assert.equal(c.estado, 'ESPERA');
assert.equal(c.zonas.find(z => z.zona === 'Aragua').aporte_pct, 40); assert.equal(c.zonas.find(z => z.zona === 'Carabobo').aporte_pct, 40); assert.equal(c.pedidos, 2); assert.equal(c.clientes, 2);
assert.equal(v.lineas.find(l => l.nombre === 'Occidente').estado, 'ESPERA'); assert.equal(v.lineas.find(l => l.nombre === 'Occidente').ocupacion_pct, 10);
ok('mezcla papa + salsa: 6.000 kg de papa + 3.000 kg de salsa = 80 % del camión (zonas aportan 40 % y 40 %)');
await LS.crearLinea(ger, {nombre: 'Vacía', zonas: []}); assert.equal((await linea('Vacía')).estado, 'SIN_PEDIDOS');

/* ---------- 6. Zona pausada ---------- */
await PS.pausar(lg, 'Carabobo', 'Camino cerrado');
c = await linea('Centro'); assert.equal(c.ocupacion_pct, 40); assert.equal(c.kg_salsa, 0); assert.equal(c.zonas.find(z => z.zona === 'Carabobo').pausada, true); assert.equal(c.estado, 'ESPERA');
await PS.pausar(lg, 'Aragua', 'Sin camión');
assert.equal((await linea('Centro')).estado, 'PAUSADA');
await PS.reanudar(lg, 'Aragua'); await PS.reanudar(lg, 'Carabobo');
ok('una zona pausada no suma a la línea y sale marcada; con todas pausadas la línea queda Pausada');

/* ---------- Detalle: tipo por línea de pedido y sin dinero ---------- */
const det = await LS.detalleLinea(db, String(c.id_linea));
assert.equal(det.pedidos.length, 2); assert.ok(det.pedidos.every(p => p.lineas.every(l => ['papa', 'salsa'].includes(l.tipo)))); assert.equal(det.ocupacion_pct, 80);
assert.equal((await LS.detalleLinea(db, 'sin')).nombre, 'Sin línea');
await rechaza(LS.detalleLinea(db, '999'), /no existe/, 404);
const ve = JSON.stringify((await llama('empaque', 'GET', '/lineas/' + c.id_linea)).j) + JSON.stringify((await llama('empaque', 'GET', '/lineas')).j);
assert.ok(!/precio|monto|cents|costo|usd|total/i.test(ve.replace(/total_?/g, '').replace(/"nombre":"[^"]*"/g, ''))); assert.ok(!/precio_base|cents/.test(ve));
assert.ok(!/precio|cents|monto/i.test(JSON.stringify(sinDinero(det))));
ok('las respuestas de líneas para Logística no llevan dinero');

/* ---------- 8. Armar salida por línea: mezcla de zonas, 100 % y «Gerencia prevalece» ---------- */
// bajo el 100 % es libre: Logística arma sin motivo
let r = await PS.armarSalida(lg, {id_linea: c.id_linea, lineas: [...sel(p1), ...sel(p2)]});
assert.equal(r.kg_papa, 6000); assert.equal(r.kg_salsa, 3000); assert.equal(r.ocupacion_pct, 80);
const sal = raw.prepare('SELECT * FROM salidas WHERE id_salida = ?').get(r.id_salida);
assert.equal(sal.id_linea, c.id_linea); assert.equal(sal.zona, 'Centro'); assert.equal(sal.ocupacion_pct, 80); assert.equal(sal.kg_papa, 6000); assert.equal(sal.kg_salsa, 3000); assert.equal(sal.cap_papa_kg, 10000); assert.equal(sal.cap_salsa_kg, 15000); assert.equal(sal.meta_kg, null);
assert.equal(raw.prepare('SELECT COUNT(DISTINCT id_pedido) c FROM salida_lineas WHERE id_salida = ?').get(r.id_salida).c, 2);
assert.equal((await linea('Centro')).estado, 'ARMADA');
ok('Logística arma una salida de la línea con pedidos de dos zonas, 80 % sin pedir motivo; guarda papa, salsa y porcentaje');
await rechaza(PS.armarSalida(lg, {id_linea: c.id_linea, lineas: sel(p1)}), /libres/, 409);
await rechaza(PS.armarSalida(lg, {zona: 'Aragua', lineas: sel(p1)}), /está en la línea Centro/, 409, 'ZONA_EN_LINEA');
// una zona sin línea se arma sola
const p5 = pedido('Miranda', 1, [[P, 50]]);
r = await PS.armarSalida(lg, {zona: 'Miranda', lineas: sel(p5)}); assert.equal(r.ocupacion_pct, 5); assert.equal(raw.prepare('SELECT id_linea FROM salidas WHERE id_salida = ?').get(r.id_salida).id_linea, null);
await PS.anularSalida(lg, r.id_salida);

// exceso: Occidente (Lara + Aragua queda en Centro) — armamos un caso de exceso con capacidad baja
await PS.guardarAjustes(ger, {cap_papa_kg: '1000', cap_salsa_kg: '1500'});   // un camión = 1.000 kg de papa
const pa = pedido('Lara', 2, [[P, 60]]), pb = pedido('Lara', 3, [[P, 60]]), pc = pedido('Lara', 1, [[P, 60]]);   // Lara: 100 (p3) + 600 + 600 + 600 = 1.900 kg
const oc = await linea('Occidente'); assert.ok(oc.ocupacion_pct > 100); assert.equal(oc.estado, 'LLENA'); assert.equal(oc.exceso, true); assert.equal(oc.gerencia_decidio, false);
const rl = await PS.armarSalida(lg, {id_linea: oc.id_linea, lineas: [...sel(pa)]});   // Logística elige 600 kg (60 %) mientras Gerencia no decidió
assert.equal(rl.ocupacion_pct, 60);
await rechaza(PS.armarSalida(lg, {id_linea: oc.id_linea, lineas: [...sel(pa), ...sel(pb)]}), /libres/, 409);
const lgPasa = await rechaza(PS.armarSalida(lg, {id_linea: oc.id_linea, lineas: [...sel(pb), ...sel(pc)]}), /pasa del 100 %/, 403, 'DECIDE_DUENO'); assert.ok(lgPasa);
ok('si la línea pasa del 100 %, Logística elige qué pedidos salen (hasta 100 %) mientras Gerencia no haya decidido; un camión que pasa del 100 % solo lo arma Gerencia');
// Gerencia elige otra cosa: su decisión reemplaza la propuesta de Logística (no cargada)
const rg = await PS.armarSalida(ger, {id_linea: oc.id_linea, lineas: [...sel(pb), ...sel(pc)]});   // 1.200 kg = 120 %: Gerencia puede
assert.equal(rg.ocupacion_pct, 120); assert.deepEqual(rg.reemplazadas, [raw.prepare('SELECT nro FROM salidas WHERE id_salida = ?').get(rl.id_salida).nro]);
assert.equal(raw.prepare('SELECT estado FROM salidas WHERE id_salida = ?').get(rl.id_salida).estado, 'ANULADA');
assert.equal((await linea('Occidente')).gerencia_decidio, true);
ok('Gerencia elige y su decisión prevalece: la propuesta de Logística sin cargar se anula y sus pedidos quedan libres');
await rechaza(PS.armarSalida(lg, {id_linea: oc.id_linea, lineas: sel(pa)}), /Gerencia ya eligió/, 409, 'GERENCIA_DECIDIO');
await rechaza(PS.anularSalida(lg, rg.id_salida), /Gerencia eligió/, 403, 'DECIDIO_GERENCIA');
ok('Logística no puede armar otra salida ni anular la que Gerencia eligió; lo que sobra espera la siguiente salida');
await PS.anularSalida(ger, rg.id_salida);
await PS.guardarAjustes(ger, {cap_papa_kg: '10000', cap_salsa_kg: '15000'});

/* ---------- 9. Mover una zona con pedidos en una salida armada ---------- */
await rechaza(LS.cambiarLinea(ger, c.id_linea, {zonas: ['Carabobo']}), /tiene pedidos en la salida SAL-\d+ de la línea Centro/, 409, 'ZONA_EN_SALIDA');
await rechaza(LS.cambiarLinea(ger, occ.id_linea, {zonas: ['Lara', 'Aragua']}), /tiene pedidos en la salida/, 409);
await rechaza(LS.borrarLinea(ger, c.id_linea), /armada/, 409, 'LINEA_EN_SALIDA');
await PS.anularSalida(lg, sal.id_salida);
v = await LS.cambiarLinea(ger, c.id_linea, {zonas: ['Carabobo']}); assert.deepEqual(v.lineas.find(l => l.nombre === 'Centro').zonas.map(z => z.zona), ['Carabobo']);
assert.ok(v.sin_linea.zonas.some(z => z.zona === 'Aragua'));
ok('no se mueve una zona ni se borra su línea mientras haya una salida armada con sus pedidos (409); tras anularla, sí, y la zona queda «Sin línea»');
v = await LS.borrarLinea(ger, (await linea('Vacía')).id_linea); assert.ok(!v.lineas.some(l => l.nombre === 'Vacía'));

/* ---------- 10. Salida vieja por zona sigue cargándose y despachándose ---------- */
const idV = await VR.siguiente(db, 'salida'); raw.prepare("INSERT INTO salidas (id_salida, nro, zona, estado, kilos, meta_kg, motivo, creado_ts, creado_rol) VALUES (?, 'SAL-VIEJA', 'Lara', 'ARMANDO', 100, 15000, 'prueba vieja', ?, 'Logística')").run(idV, Date.now());
const l3 = lineasDe(p3)[0]; raw.prepare('INSERT INTO salida_lineas (id_salida, id_pedido, id_linea, id_producto, bultos, kilos) VALUES (?,?,?,?,100,1000)').run(idV, p3, l3.id, P);
raw.prepare('UPDATE salidas SET kilos = 1000 WHERE id_salida = ?').run(idV);
assert.equal((await linea('Occidente')).salidas_armando, 1);   // la vieja se cuenta como salida armada de su zona
await PS.cargarSalida(lg, idV, {lineas: [{id_linea: l3.id, bultos: 100}]});
const dd = await PS.despachar(lg, idV, {motivo: 'despacho viejo antes de la meta'}); assert.ok(dd.documentos.length >= 1);
assert.equal(raw.prepare('SELECT estado FROM salidas WHERE id_salida = ?').get(idV).estado, 'DESPACHADA');
ok('una salida vieja por zona (sin línea) se cuenta en su línea, se carga y se despacha como antes (con la meta que tenía guardada)');
// una salida nueva por línea también despacha: sin motivo aunque lleve menos del 100 %
const pn = pedido('Carabobo', 2, [[P, 10]]); const rn = await PS.armarSalida(lg, {id_linea: (await linea('Centro')).id_linea, lineas: sel(pn)});
await PS.cargarSalida(lg, rn.id_salida, {lineas: sel(pn)});
const dn = await PS.despachar(lg, rn.id_salida, {}); assert.ok(dn.documentos.length >= 1);
ok('una salida por línea con menos del 100 % se despacha libre, sin motivo');

/* ---------- 11. Capacidades en Ajustes ---------- */
let a = await PS.ajustes(db); assert.equal(a.cap_papa_kg, 10000); assert.equal(a.cap_salsa_kg, 15000); assert.equal(a.meta_kg, 15000);
await rechaza(PS.guardarAjustes(ger, {meta_kg: '15000', cap_papa_kg: '', cap_salsa_kg: '15000'}), /no puede quedar vacía/, 400);
await rechaza(PS.guardarAjustes(ger, {cap_papa_kg: '0', cap_salsa_kg: '15000'}), /mayor que cero/, 400);
await rechaza(PS.guardarAjustes(ger, {cap_papa_kg: '10000', cap_salsa_kg: '-5'}), /mayor que cero/, 400);
await rechaza(PS.guardarAjustes(lg, {cap_papa_kg: '1', cap_salsa_kg: '1'}), /Solo el Gerente/, 403);
a = await PS.guardarAjustes(ger, {cap_papa_kg: '12000', cap_salsa_kg: '16000'}); assert.equal(a.cap_papa_kg, 12000); assert.equal(a.cap_salsa_kg, 16000); assert.equal(a.meta_kg, 15000);   // la meta de producción del panel no cambia
assert.equal((await LS.listaLineas(db)).capacidad.papa_kg, 12000);
await PS.guardarAjustes(ger, {cap_papa_kg: '10000', cap_salsa_kg: '15000'});
ok('Ajustes: Gerencia cambia las capacidades; vacías, cero o negativas se rechazan; Logística no puede; la meta de producción (15 t) queda igual');

/* ---------- 12 y 13. Auditoría ---------- */
const aud = raw.prepare("SELECT accion FROM auditoria_sistema WHERE ent = 'produccion' ORDER BY ts, rowid").all().map(x => x.accion);
for (const t of ['creó la línea', 'cambió la línea', 'borró la línea', 'armó salida', 'despachó la salida', 'cambió los ajustes']) assert.ok(aud.includes(t), 'falta auditar: ' + t);
const antes = raw.prepare("SELECT detalle FROM auditoria_sistema WHERE accion = 'cambió la línea' ORDER BY ts DESC LIMIT 1").get().detalle; assert.ok(/antes/.test(antes) && /despues/.test(antes));
ok('la auditoría registra crear, cambiar (antes y después) y borrar la línea, armar y despachar');
console.log(`\n${n} comprobaciones pasaron.`);
