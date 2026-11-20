/* Pruebas de la fase 4: papa por saco con muestra de 5 (4.1) y compras e inventario (4.2): alarma de diferencia, flujo único recibir → validar con aviso,
   inventario general consolidado con conteo inicial y descuento por consumo y merma. Base en memoria, datos inventados, tasa fija.
   Uso: node src/pruebas/fase4.prueba.mjs */
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {crearDB} from './d1-falso.mjs';
import * as C from '../compras/dominio.js';
import * as CS from '../compras/servicio.js';
import * as RC from '../compras/recepcion-servicio.js';
import * as ID from '../inventario/dominio.js';
import * as IS from '../inventario/servicio.js';
import * as PS from '../produccion/servicio.js';
import {rutasCompras} from '../compras/rutas.js';
import {rutasInventario} from '../inventario/rutas.js';
import {rutasProduccion} from '../produccion/rutas.js';

let n = 0; const ok = m => { n++; console.log('  ok · ' + m); };
const rechaza = async (p, re, st) => { try { await p; } catch (e) { assert.match(String(e.message), re); if (st) assert.equal(e.status, st); return e; } assert.fail('debía rechazar: ' + re); };

const db = crearDB(), raw = db.raw;
const hoy = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10);
/* tasa fija de prueba: nunca se consulta al BCV real */
raw.prepare("INSERT INTO config (clave, valor) VALUES ('tasa_ultimo_intento', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor").run(new Date().toISOString());
raw.prepare("INSERT INTO tasas_bcv (fecha, valor, fuente, obtenida_en, origen) VALUES (?,?,?,?,'DEV')").run(hoy, 500, 'prueba', 'x');
const doc = (col, id, o) => raw.prepare('INSERT INTO docs (col, id, data, updated) VALUES (?, ?, ?, 1)').run(col, id, JSON.stringify({id, ...o}));
doc('proveedores', 'P1', {nombre: 'Papas del Valle', tipo: 'papa', cond: 'Crédito', dias: 20, rif: 'J-12345678-9'});
doc('proveedores', 'P4', {nombre: 'Aceites SA', tipo: 'insumo', cond: 'Contado'});
doc('productos', 'PAPA-cruda', {tipo: 'papa', n: 'Papa cruda', cat: 'Papa cruda', sk: 'Papa cruda', kgSaco: 50});
doc('productos', 'PAPA-seca', {tipo: 'papa', n: 'Papa seca', cat: 'Papa seca', sk: 'Papa seca', kgSaco: 25});
doc('productos', 'INS-aceite', {tipo: 'insumo', n: 'Aceite vegetal', cat: 'Aceite', sk: 'Aceite', kgSaco: 18});
const adm = {db, rol: 'adm'}, prod = {db, rol: 'produccion'}, dueno = {db, rol: 'dueno'}, ventas = {db, rol: 'ventas'};
const hacer = (o = {}) => CS.crear(adm, {proveedor_id: 'P1', factura: 'F-' + Math.random().toString(36).slice(2, 8), fecha: hoy, condicion: 'CREDITO', plazo_dias: 20, lineas: [{producto_id: 'PAPA-cruda', cantidad: 100, precio_usd: 20}], ...o});
const P5 = [43, 44, 42, 43.5, 42.5];   // promedio 43

// ---- 1. Papa por saco (4.1): reglas puras ----
assert.equal(C.KG_SACO_REF, 43); assert.equal(C.MUESTRA_SACOS, 5);
assert.deepEqual(C.estadisticaMuestra(P5), {n: 5, prom: 43, desv: 0.71}); assert.equal(C.kilosDelLote(43, 100), 4300); assert.equal(C.kilosDelLote(41.6, 100), 4160); ok('promedio de 5 sacos y kilos del lote = promedio real × sacos (no 43 fijo)');
assert.equal(C.esPapaCruda({tipo: 'papa', cat: 'Papa cruda'}), true); assert.equal(C.esPapaCruda({tipo: 'papa', cat: 'Papa seca'}), false); assert.equal(C.esPapaCruda({tipo: 'insumo', cat: 'Aceite'}), false); ok('solo la papa cruda va por saco');
const lp = [{producto_id: 'A', producto_nombre: 'Papa cruda', unidad: 'saco', cantidad: 100, papa: true}, {producto_id: 'B', producto_nombre: 'Aceite', unidad: 'kg', cantidad: 900, papa: false}];
const val = (lineas, extra = {}) => C.validarRecepcion({lineas, ...extra}, lp);
assert.match(val([{producto_id: 'A', recibido: 100, pesadas: [43, 43, 43, 43]}, {producto_id: 'B', recibido: 900}]).error, /Pesa 5 sacos/); ok('con 4 pesadas no se puede recibir: la muestra de 5 es obligatoria');
assert.match(val([{producto_id: 'A', recibido: 100}, {producto_id: 'B', recibido: 900}]).error, /Pesa 5 sacos/); assert.match(val([{producto_id: 'A', recibido: 100, pesadas: [43, 43, 43, 43, 0]}, {producto_id: 'B', recibido: 900}]).error, /Pesa 5 sacos/); ok('sin pesadas o con una pesada en cero tampoco');
assert.match(val([{producto_id: 'A', recibido: 3, pesadas: P5}, {producto_id: 'B', recibido: 900}]).error, /al menos 5 sacos/); assert.match(val([{producto_id: 'A', recibido: 99.5, pesadas: P5}, {producto_id: 'B', recibido: 900}]).error, /entero/); ok('menos de 5 sacos o sacos con decimales: se rechaza');
const v1 = val([{producto_id: 'A', recibido: 100, pesadas: P5}, {producto_id: 'B', recibido: 900}]); assert.equal(v1.datos.lineas[0].kg, 4300); assert.equal(v1.datos.lineas[0].muestra.prom, 43); ok('recepción correcta: 100 sacos con promedio 43 = 4.300 kg');
assert.match(val([{producto_id: 'A', recibido: 100, pesadas: P5}]).error, /Falta anotar lo que llegó de Aceite/); ok('hay que anotar todos los productos del pedido');
assert.deepEqual(C.diferenciasDe(lp, {A: 100, B: 900}), []); assert.equal(C.diferenciasDe(lp, {A: 98, B: 900})[0].diferencia, -2); assert.equal(C.diferenciasDe(lp, {A: 100, B: 910}).length, 1); ok('diferencia: igual no avisa; menos o más sí');

// ---- 2. Orden de compra por saco ----
let ped = await hacer(); assert.equal(ped.lineas[0].unidad, 'saco'); assert.equal(ped.lineas[0].kg_referencia, 4300); assert.equal(ped.total_usd, 2000); ok('la papa cruda se compra por saco: 100 sacos × $ 20 = $ 2.000 (referencia 4.300 kg)');
await rechaza(hacer({lineas: [{producto_id: 'PAPA-cruda', cantidad: 10.5, precio_usd: 20}]}), /número entero de sacos/, 400); ok('sacos con decimales no se aceptan');
const seca = await hacer({lineas: [{producto_id: 'PAPA-seca', cantidad: 10.5, precio_usd: 2}]}); assert.equal(seca.lineas[0].unidad, 'kg'); ok('la papa seca sigue en kg');

// ---- 3. Recepción enlazada: sin diferencia ----
await rechaza(RC.recibir({db, rol: 'ventas'}, {nro: ped.nro}), /Solo Producción/, 403); await rechaza(RC.recibir(adm, {nro: ped.nro}), /Solo Producción/, 403); ok('solo Producción y el Gerente reciben');
const por = await RC.porRecibir(prod); assert.ok(por.pedidos.find(p => p.nro === ped.nro)); assert.equal(por.kg_saco_referencia, 43); assert.equal(por.sacos_de_muestra, 5); assert.equal(por.pedidos[0].lineas[0].producto_id !== undefined, true); ok('Producción ve lo pendiente de recibir (sin precios), con la referencia de 43 kg y la muestra de 5');
assert.equal(JSON.stringify(por).includes('precio'), false);
await rechaza(RC.recibir(prod, {nro: ped.nro, lineas: [{producto_id: 'PAPA-cruda', recibido: 100, pesadas: [43, 43]}]}), /Pesa 5 sacos/, 400); ok('la recepción exige las 5 pesadas');
// inventario aún sin conteo inicial
const r1 = await RC.recibir(prod, {nro: ped.nro, lineas: [{producto_id: 'PAPA-cruda', recibido: 100, pesadas: [41, 42, 41.5, 42.5, 41]}]});
assert.equal(r1.con_diferencia, false); assert.equal(r1.recepciones[0].kg, 4160); ok('recibido igual a lo comprado: pasa sin alarma; kg = promedio real 41,6 × 100 = 4.180 (no 4.300)');
const dR = JSON.parse(raw.prepare("SELECT data FROM docs WHERE col='recepciones' AND id=?").get('REC-' + ped.nro + '-1').data);
assert.equal(dR.estado, 'almacen'); assert.equal(dR.compraId, 'C-' + ped.nro + '-1'); assert.equal(dR.cat, 'Papa cruda'); assert.equal(dR.kgRec, 4160); assert.equal(dR.muestra.n, 5); assert.equal(dR.pedido, ped.nro); ok('la recepción queda enlazada con su orden de compra y con las 5 pesadas guardadas');
assert.equal(raw.prepare('SELECT estado, recepcion_id, con_diferencia FROM compras_pedidos WHERE nro=?').get(ped.nro).estado, 'RECIBIDA'); ok('la orden pasa a RECIBIDA (antes no pasaba nunca)');
await rechaza(RC.recibir(prod, {nro: ped.nro, lineas: [{producto_id: 'PAPA-cruda', recibido: 100, pesadas: P5}]}), /ya se recibió/, 409); ok('no se recibe dos veces');
assert.equal(raw.prepare("SELECT COUNT(*) c FROM compras_diferencias").get().c, 0);

// ---- 4. Aviso a Administración ----
assert.equal(raw.prepare('SELECT COUNT(*) c FROM alertas_admin WHERE ref=?').get(ped.nro).c, 0); ok('recibir sin diferencia no genera avisos: la compra queda lista sola');
const cx1 = raw.prepare("SELECT data FROM docs WHERE col='cxp'").all().map(r => JSON.parse(r.data)).find(x => x.compraId === 'C-' + ped.nro + '-1'); assert.equal(cx1.total, 2000); assert.equal(raw.prepare("SELECT validada_ts FROM compras_pedidos WHERE nro=?").get(ped.nro).validada_ts > 0, true); ok('al recibir ya quedó la compra efectiva y la deuda al proveedor: 100 sacos × $ 20 = $ 2.000');
await rechaza(RC.diferencias(prod), /Solo Administración/, 403); assert.equal(typeof RC.validar, 'undefined'); assert.equal(typeof RC.porValidar, 'undefined'); ok('Producción no ve las diferencias y ya no existe «validar»');

// ---- 5. Producción puede usar la papa apenas se recibe (sin esperar la validación) ----
raw.exec('DELETE FROM turnos'); raw.prepare("INSERT INTO turnos (fecha, estado, abierto_ts, abierto_rol, inicio_ts) VALUES ('2026-01-05', 'ABIERTO', ?, 'Producción', 1)").run(Date.now()); const tn = raw.prepare("SELECT id_turno FROM turnos WHERE estado = 'ABIERTO'").get().id_turno;
const libres = await PS.recepcionesLibres(db); assert.equal(libres.length, 1); assert.equal(libres[0].kg_libres, 4160); ok('la papa recibida ya sale como disponible para el turno (decisión del dueño)');

// ---- 6. Inventario general: conteo inicial, compras, consumo, merma ----
let inv = await IS.ver(dueno); assert.equal(inv.conteo_inicial_hecho, false); assert.equal(inv.articulos.length, 11); assert.ok(inv.articulos.every(a => a.estado === 'SIN_CONTEO' && a.saldo === 0)); ok('sin conteo inicial el inventario avisa que falta y no cuenta nada');
await rechaza(IS.conteoInicial(prod, {conteos: [{articulo: 'papa', cantidad: 1}]}), /Solo Gerencia y Administración/, 403); await rechaza(IS.conteoInicial(adm, {conteos: [{articulo: 'papa', cantidad: -1}]}), /0 o más/, 400); await rechaza(IS.conteoInicial(adm, {conteos: [{articulo: 'papa', cantidad: 1}, {articulo: 'papa', cantidad: 2}]}), /repetido/); await rechaza(IS.conteoInicial(adm, {conteos: [{articulo: 'nada', cantidad: 1}]}), /no existe/, 404); ok('conteo inicial: permisos, negativos, repetidos y artículos que no existen');
inv = await IS.conteoInicial(adm, {conteos: [{articulo: 'papa', cantidad: 1000}, {articulo: 'aceite', cantidad: 200}, {articulo: 'agua', cantidad: 5000}, {articulo: 'sal', cantidad: 50}, {articulo: 'quimicos', cantidad: 10}, {articulo: 'empaque', cantidad: 3000}]});
const sal = c => inv.articulos.find(a => a.codigo === c).saldo;
assert.equal(inv.conteo_inicial_hecho, true); assert.equal(sal('papa'), 1000); assert.equal(sal('agua'), 5000); assert.equal(inv.conteo.length, 11); ok('el conteo físico inicial deja el saldo exactamente en lo contado');
await rechaza(IS.conteoInicial(dueno, {conteos: [{articulo: 'papa', cantidad: 9}]}), /ya se cargó/, 409); ok('el conteo inicial se carga una sola vez');
// Compra nueva con la papa y el aceite: suma al saldo acumulado, sin agotar lo anterior
ped = await hacer({lineas: [{producto_id: 'PAPA-cruda', cantidad: 100, precio_usd: 20}]});
const ped2 = await CS.crear(adm, {proveedor_id: 'P4', factura: 'ACE-1', fecha: hoy, condicion: 'CREDITO', plazo_dias: 7, lineas: [{producto_id: 'INS-aceite', cantidad: 900, precio_usd: 1.5}]});
await RC.recibir(prod, {nro: ped.nro, lineas: [{producto_id: 'PAPA-cruda', recibido: 100, pesadas: P5}]}); inv = await IS.ver(dueno); assert.equal(sal('papa'), 1000 + 4300); ok('una compra nueva se SUMA al saldo existente (1.000 + 4.300 = 5.300 kg), sin aislar lotes');
await RC.recibir(prod, {nro: ped2.nro, lineas: [{producto_id: 'INS-aceite', recibido: 900}]}); inv = await IS.ver(dueno); assert.equal(sal('aceite'), 1100); ok('el aceite recibido suma: 200 + 900 = 1.100 kg');
// papa tomada por el turno baja el inventario
await PS.tomarRecepcion(prod, {id_recepcion: 'REC-' + ped.nro + '-1', kilos: 1000}); inv = await IS.ver(dueno); assert.equal(sal('papa'), 4300); ok('la papa que toma el turno RESTA del inventario general (5.300 − 1.000 = 4.300)');
const pcons = await PS.registrarConsumo(prod, {articulo: 'aceite', cantidad: 120, nota: 'fritura'}); assert.equal(pcons.consumos.length, 2); assert.equal(pcons.inventario.articulos.find(a => a.codigo === 'aceite').saldo, 980); ok("consumo de aceite registrado en el turno (la papa tomada también cuenta como consumo): 1.100 − 120 = 980");
for (const [a, c] of [['agua', 800], ['sal', 10], ['quimicos', 2], ['empaque', 500]]) await PS.registrarConsumo(prod, {articulo: a, cantidad: c});
inv = await IS.ver(dueno); assert.deepEqual([sal('agua'), sal('sal'), sal('quimicos'), sal('empaque')], [4200, 40, 8, 2500]); ok('agua, sal, químicos y material de empaque también descuentan');
await rechaza(PS.registrarConsumo(prod, {articulo: 'aceite', cantidad: 0}), /mayor que cero/, 400); await rechaza(PS.registrarConsumo(prod, {articulo: 'nada', cantidad: 1}), /no está en el inventario/, 400); await rechaza(PS.registrarConsumo({db, rol: 'ventas'}, {articulo: 'aceite', cantidad: 1}), /Solo Producción/, 403); ok('consumo: cantidad en cero, artículo desconocido y puesto sin permiso se rechazan');
inv = await IS.registrarMerma(prod, {articulo: 'papa', cantidad: 100, nota: 'papa podrida en el almacén'}); assert.equal(inv.articulos.find(a => a.codigo === 'papa').saldo, 4200); assert.equal(inv.articulos.find(a => a.codigo === 'papa').mermas, 100); ok('merma de inventario con motivo: resta (4.300 − 100 = 4.200)');
await rechaza(IS.registrarMerma(prod, {articulo: 'papa', cantidad: 5}), /motivo/, 400); ok('la merma pide el motivo escrito');
const t1 = await PS.consumosDelTurno(prod); assert.equal(t1.consumos.length >= 5, true); ok('los consumos quedan atados al turno (base del panel de la fase 6)');
await IS.fijarMinimo(adm, 'papa', {minimo: 5000}); inv = await IS.ver(adm); assert.equal(inv.articulos.find(a => a.codigo === 'papa').estado, 'BAJO'); ok('mínimo de aviso: papa bajo el mínimo se marca BAJO');
await rechaza(IS.ver(ventas), /no ve el inventario/, 403); ok('Ventas no ve el inventario general');

// ---- 7. Alarma de diferencia: confirmar y motivo ----
const ped3 = await hacer({lineas: [{producto_id: 'PAPA-cruda', cantidad: 100, precio_usd: 20}]});
const cuerpoDif = {nro: ped3.nro, lineas: [{producto_id: 'PAPA-cruda', recibido: 90, pesadas: P5}]};
const e1 = await rechaza(RC.recibir(prod, cuerpoDif), /no es lo que se compró/, 409); assert.equal(e1.extra.codigo, 'DIFERENCIA'); assert.equal(e1.extra.diferencias[0].diferencia, -10); assert.equal(raw.prepare('SELECT estado FROM compras_pedidos WHERE nro=?').get(ped3.nro).estado, 'PEDIDA'); ok('si llegaron menos sacos de los comprados: ALARMA y no se guarda nada');
await rechaza(RC.recibir(prod, {...cuerpoDif, confirmar_diferencia: true}), /motivo de la diferencia/, 400); await rechaza(RC.recibir(prod, {...cuerpoDif, confirmar_diferencia: true, motivo: 'ab'}), /motivo de la diferencia/, 400); ok('confirmar sin escribir el motivo tampoco pasa');
const kgAntes = sal('papa'); const r3 = await RC.recibir(prod, {...cuerpoDif, confirmar_diferencia: true, motivo: 'El camión dejó 10 sacos en otro depósito'});
assert.equal(r3.con_diferencia, true); const rd = raw.prepare('SELECT * FROM compras_diferencias WHERE nro=?').get(ped3.nro); assert.equal(rd.comprado, 100); assert.equal(rd.recibido, 90); assert.equal(rd.diferencia, -10); assert.match(rd.motivo, /otro depósito/); assert.equal(rd.rol, 'produccion'); ok('confirmada con motivo: queda el registro de la diferencia (comprado 100, recibido 90, −10, quién y por qué)');
inv = await IS.ver(dueno); assert.equal(sal('papa') - kgAntes, 3870); ok('al inventario entra lo realmente recibido: 90 sacos × 43 = 3.870 kg (no lo comprado)');
const b3 = await RC.diferencias(adm); const t3 = b3.diferencias.find(d => d.nro === ped3.nro); assert.equal(t3.diferencia, -10); assert.equal(t3.sin_ver, true); assert.match(t3.motivo, /otro depósito/); assert.equal(b3.sin_ver, 1); assert.match(raw.prepare('SELECT titulo FROM alertas_admin WHERE ref=?').get(ped3.nro).titulo, /llegó distinto/); ok('Administración ve la diferencia y el motivo en su aviso');
assert.equal(b3.diferencias.length, 1); ok('lista de diferencias para reclamar al proveedor');
// más de lo comprado también alarma; cero sacos también
const ped4 = await CS.crear(adm, {proveedor_id: 'P4', factura: 'ACE-2', fecha: hoy, condicion: 'CREDITO', plazo_dias: 7, lineas: [{producto_id: 'INS-aceite', cantidad: 900, precio_usd: 1.5}]});
await rechaza(RC.recibir(prod, {nro: ped4.nro, lineas: [{producto_id: 'INS-aceite', recibido: 950}]}), /no es lo que se compró/, 409); ok('si llegó MÁS de lo comprado también hay alarma');
await RC.recibir(prod, {nro: ped4.nro, lineas: [{producto_id: 'INS-aceite', recibido: 0}], confirmar_diferencia: true, motivo: 'No llegó el camión'}); assert.equal(raw.prepare('SELECT COUNT(*) c FROM docs WHERE col=? AND id LIKE ?').get('recepciones', 'REC-' + ped4.nro + '%').c, 0); ok('si no llegó nada: queda la diferencia con motivo y ninguna recepción');

// ---- 8. Un solo paso: recibir deja la compra lista, con la deuda sobre lo REALMENTE recibido ----
const cid3 = 'C-' + ped3.nro + '-1', cp3 = JSON.parse(raw.prepare("SELECT data FROM docs WHERE col='compras' AND id=?").get(cid3).data); assert.equal(cp3.qf, 90); assert.equal(cp3.unidad, 'saco'); assert.equal(cp3.pu, 20); assert.equal(cp3.cond, 'Crédito'); assert.equal(cp3.pedido, ped3.nro); ok('la compra efectiva vale lo RECIBIDO: 90 sacos × $ 20 (no los 100 pedidos)');
const cx = raw.prepare("SELECT data FROM docs WHERE col='cxp'").all().map(r => JSON.parse(r.data)).find(x => x.compraId === cid3); assert.equal(cx.total, 1800); assert.equal(cx.vence, (() => { const t = new Date(hoy + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + 20); return t.toISOString().slice(0, 10); })()); ok('a crédito la deuda es $ 1.800 (no $ 2.000) con vencimiento a 20 días');
const recV = JSON.parse(raw.prepare("SELECT data FROM docs WHERE col='recepciones' AND id=?").get('REC-' + ped3.nro + '-1').data); assert.equal(recV.estado, 'almacen'); assert.equal(recV.compraId, cid3); ok('la recepción pasa a «almacén» con su compra efectiva enlazada');
const mv3 = JSON.parse(raw.prepare("SELECT data FROM docs WHERE col='movimientos' AND id=?").get('MV-ENT-REC-' + ped3.nro + '-1').data); assert.equal(mv3.cant, 3870); assert.equal(mv3.item, 'Papa cruda'); ok('el almacén de materia prima del flujo anterior también sube (3.870 kg): ya no queda desfasado del inventario general');
assert.equal(raw.prepare('SELECT COUNT(*) c FROM docs WHERE col IN (?, ?) AND (id LIKE ? OR id LIKE ?)').get('compras', 'cxp', '%' + ped4.nro + '%', '%CP-00000%').c, 0); ok('lo que nunca llegó (cero sacos) no genera compra ni deuda');
assert.equal((await RC.contadorDiferencias(adm)).sin_ver, 2); await RC.verDiferencia(adm, {nro: ped3.nro}); assert.equal(raw.prepare('SELECT estado FROM alertas_admin WHERE ref=?').get(ped3.nro).estado, 'ATENDIDA'); assert.equal((await RC.contadorDiferencias(adm)).sin_ver, 1); await rechaza(RC.verDiferencia(prod, {nro: ped3.nro}), /Solo Administración/, 403); ok('Administración marca la diferencia como vista');
inv = await IS.ver(dueno); assert.equal(sal('papa'), kgAntes + 3870); ok('el inventario suma una sola vez, al recibir');

// ---- 9. Atomicidad y rutas HTTP ----
const antes = raw.prepare('SELECT COUNT(*) c FROM inv_movimientos').get().c;
const ped5 = await hacer(); raw.prepare("INSERT INTO inv_movimientos (articulo, tipo, cantidad, origen, ref, ts) VALUES ('papa','ENTRADA',1,'compra',?,?)").run('REC-' + ped5.nro + '-1', Date.now());
await assert.rejects(RC.recibir(prod, {nro: ped5.nro, lineas: [{producto_id: 'PAPA-cruda', recibido: 100, pesadas: P5}]})); assert.equal(raw.prepare('SELECT estado FROM compras_pedidos WHERE nro=?').get(ped5.nro).estado, 'PEDIDA'); assert.equal(raw.prepare("SELECT COUNT(*) c FROM docs WHERE col='recepciones' AND id=?").get('REC-' + ped5.nro + '-1').c, 0); ok('si algo falla a medias no queda nada a medias (todo o nada)');
const rq = (m, ruta, rol, cuerpo) => new Request('http://x' + ruta, {method: m, headers: {'x-rol': rol, 'content-type': 'application/json'}, body: cuerpo ? JSON.stringify(cuerpo) : undefined});
let r = await rutasCompras(rq('GET', '/api/v/compras/por-recibir', 'produccion'), {DB: db}, new URL('http://x/api/v/compras/por-recibir')); assert.equal(r.status, 200);
r = await rutasCompras(rq('GET', '/api/v/compras/diferencias', 'produccion'), {DB: db}, new URL('http://x/api/v/compras/diferencias')); assert.equal(r.status, 403);
r = await rutasCompras(rq('GET', '/api/v/compras/diferencias/contador', 'adm'), {DB: db}, new URL('http://x/api/v/compras/diferencias/contador')); assert.equal(r.status, 200);
r = await rutasCompras(rq('POST', '/api/v/compras/validar', 'adm', {nro: 'CP-00000'}), {DB: db}, new URL('http://x/api/v/compras/validar')); assert.equal(r.status, 404); r = await rutasCompras(rq('GET', '/api/v/compras/por-validar', 'adm'), {DB: db}, new URL('http://x/api/v/compras/por-validar')); assert.equal(r.status, 404);
r = await rutasInventario(rq('GET', '/api/v/inventario', 'adm'), {DB: db}, new URL('http://x/api/v/inventario')); assert.equal(r.status, 200); assert.equal((await r.json()).articulos.length >= 6, true);
r = await rutasInventario(rq('POST', '/api/v/inventario/consumo', 'produccion', {articulo: 'sal', cantidad: 1}), {DB: db}, new URL('http://x/api/v/inventario/consumo')); assert.equal(r.status, 201);
r = await rutasInventario(rq('GET', '/api/v/inventario', 'ventas'), {DB: db}, new URL('http://x/api/v/inventario')); assert.equal(r.status, 403);
r = await rutasProduccion(rq('GET', '/api/p/turno/consumos', 'produccion'), {DB: db}, new URL('http://x/api/p/turno/consumos')); assert.equal(r.status, 200);
r = await rutasProduccion(rq('POST', '/api/p/turno/consumo', 'produccion', {articulo: 'sal', cantidad: 1}), {DB: db}, new URL('http://x/api/p/turno/consumo')); assert.equal(r.status, 201); ok('rutas HTTP: permisos y respuestas');

// ---- 10. Migración 0031 con datos de ejemplo, y su reversa ----
{
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations'), rv = path.join(dir, '..', 'reversa', '0031_inventario_compras_reversa.sql');
  const m = new DatabaseSync(':memory:'), fs = readdirSync(dir).filter(x => x.endsWith('.sql')).sort();
  for (const f of fs.filter(x => x < '0031')) m.exec(readFileSync(path.join(dir, f), 'utf8'));
  m.prepare("INSERT INTO compras_pedidos (nro, proveedor_id, proveedor_nombre, fecha, factura, factura_norm, condicion, plazo_dias, tasa, total_usd_cents, total_bs_cents, estado, rol, creado_ts) VALUES ('CP-1','P1','X','2026-11-01','F1','F1','CREDITO',20,1,100,100,'PEDIDA','adm',1)").run();
  m.exec(readFileSync(path.join(dir, '0031_inventario_compras.sql'), 'utf8'));
  const cols = m.prepare("PRAGMA table_info(compras_pedidos)").all().map(c => c.name);
  for (const c of ['recepcion_id', 'recibida_ts', 'recibida_rol', 'con_diferencia', 'validada_ts', 'validada_rol']) assert.ok(cols.includes(c), c);
  assert.equal(m.prepare("SELECT con_diferencia FROM compras_pedidos").get().con_diferencia, 0); assert.equal(m.prepare('SELECT COUNT(*) c FROM inv_articulos').get().c, 6); ok('migración 0031: el pedido viejo queda intacto y se crean los 6 artículos base');
  m.exec(readFileSync(rv, 'utf8'));
  const cols2 = m.prepare("PRAGMA table_info(compras_pedidos)").all().map(c => c.name);
  assert.ok(!cols2.includes('recepcion_id') && !cols2.includes('validada_rol')); assert.equal(m.prepare("SELECT COUNT(*) c FROM compras_pedidos").get().c, 1);
  for (const t of ['inv_articulos', 'inv_movimientos', 'inv_conteo', 'alertas_admin', 'compras_diferencias']) assert.equal(m.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE name=?").get(t).c, 0, t);
  ok('reversa: se quitan las tablas y columnas nuevas y el pedido viejo sigue ahí');
}
console.log('\n' + n + ' pruebas de la fase 4 pasaron.');
