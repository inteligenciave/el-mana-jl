/* Pruebas de guardado atómico, numeración sin huecos, cobros/nómina sin duplicar, tasa futura y destrabado del portal.
   Uso: node src/pruebas/atomico.prueba.mjs */
import assert from 'node:assert/strict';
import {crearDB} from './d1-falso.mjs';
import worker from '../worker.js';
import * as R from '../ventas/repo.js';
import * as TD from '../tasa/dominio.js';
import * as TS from '../tasa/servicio.js';
import * as PR from '../rrhh/repo.js';
import * as CR from '../cliente/repo.js';

let n = 0; const ok = m => { n++; console.log('  ok · ' + m); };
const db = crearDB(), raw = db.raw;
const env = {DB: db, ASSETS: {fetch: async () => new Response('x')}};
const llamar = (ruta, op, body, rol = 'dueno') => worker.fetch(new Request('http://localhost' + ruta, {method: op, headers: {'content-type': 'application/json', 'x-rol': rol}, body: body ? JSON.stringify(body) : undefined}), env, {waitUntil() {}});
const cuenta = col => raw.prepare('SELECT COUNT(*) AS n FROM docs WHERE col = ?').get(col).n;

/* 1. Lote atómico */
{
  const antes = cuenta('proveedores'), v0 = raw.prepare('SELECT v FROM ver WHERE id=1').get().v;
  let r = await llamar('/api/batch', 'POST', {ops: [
    {op: 'set', c: 'proveedores', id: 'P1', d: {n: 'Uno'}},
    {op: 'update', c: 'proveedores', id: 'P1', d: {n: 'Uno B'}},
    {op: 'update', c: 'proveedores', id: 'NO-EXISTE', d: {n: 'x'}}]});
  assert.equal(r.status, 404); assert.equal(cuenta('proveedores'), antes); ok('si una operación falla, el lote no guarda nada');
  r = await llamar('/api/batch', 'POST', {ops: [
    {op: 'set', c: 'proveedores', id: 'P1', d: {n: 'Uno'}},
    {op: 'update', c: 'proveedores', id: 'P1', d: {n: 'Uno B'}},
    {op: 'set', c: 'proveedores', id: 'P2', d: {n: 'Dos'}}]});
  assert.equal(r.status, 200); const d = JSON.parse(raw.prepare("SELECT data FROM docs WHERE col='proveedores' AND id='P1'").get().data);
  assert.equal(d.n, 'Uno B'); assert.equal(cuenta('proveedores'), antes + 2);
  assert.equal(raw.prepare('SELECT v FROM ver WHERE id=1').get().v, v0 + 1); ok('lote bueno: la edición ve la anterior y la versión sube una sola vez');
  r = await llamar('/api/batch', 'POST', {ops: [{op: 'set', c: 'proveedores', id: 'P3', d: {n: 'Tres'}}, {op: 'set', c: 'cxp', id: 'X', d: {a: 1}}]}, 'empaque');
  assert.equal(cuenta('proveedores'), antes + 2); ok('lote con permiso denegado a medias no guarda nada (estado ' + r.status + ')');
}

/* 2. Numeración sin huecos */
{
  const a = R.numerador(db), b = R.numerador(db);
  const n1 = await a.tomar('factura_fiscal'), n2 = await b.tomar('factura_fiscal');
  assert.equal(n1, n2);
  await db.batch(a.guardas());
  await assert.rejects(db.batch(b.guardas()), /secuencias\.n/);
  assert.equal(await R.leerSecuencia(db, 'factura_fiscal'), n1); ok('dos ventas a la vez: una toma el número, la otra falla sin dejar hueco');
  const c = R.numerador(db), k1 = await c.tomar('documento'), k2 = await c.tomar('documento');
  assert.equal(k2, k1 + 1);
  await assert.rejects(db.batch([...c.guardas(), db.prepare('INSERT INTO docs (col, id, data, updated) VALUES (NULL, NULL, NULL, NULL)')]));
  assert.equal(await R.leerSecuencia(db, 'documento'), k1 - 1); ok('si el guardado falla, el contador no avanza');
}

/* 3. Nómina: no se paga dos veces */
{
  const p = {empleado_id: 'E1', periodo: 'semana', desde: '2026-11-09', hasta: '2026-11-15', base: 1, extra: 0, bonos: 0, ley: 0, descuento_prestamo: 0, neto: 1, prestamos: [], detalle: {}, fecha: '2026-11-16', forma: 'Efectivo', nota: '', quien: 'dueno', ts: 1};
  await db.batch([PR.stPago(db, p), PR.stGuardaPago(db)]);
  await assert.rejects(db.batch([PR.stPago(db, {...p, desde: '2026-11-12', hasta: '2026-11-18'}), PR.stGuardaPago(db), db.prepare("UPDATE docs SET data = 'cambio' WHERE col = 'proveedores'")]), /ver\.v/);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM pagos_nomina').get().n, 1);
  assert.equal(raw.prepare("SELECT COUNT(*) n FROM docs WHERE data = 'cambio'").get().n, 0); ok('segundo pago de nómina solapado se rechaza y no deja nada a medias');
}

/* 4. Cobro: no se cobra de más ni dos veces la misma nota */
{
  raw.exec("INSERT INTO clientes (id_cliente, razon_social, razon_norm, rif_id) VALUES (1, 'C', 'c', 'J-1')");
  raw.exec("INSERT INTO documentos_venta (id_documento, nro_control_interno, tipo_origen, fecha_emision, id_cliente, subtotal_base_cents, descuento_cents, iva_cents, total_cents) VALUES (1, 'NE-1', 'NOTA_ENTREGA', '2026-11-01', 1, 100, 0, 0, 100)");
  const pago = i => raw.exec(`INSERT INTO pagos (id_pago, fecha_pago, id_cliente, monto_bs_cents, tasa, usd_cents, banco, referencia, ref_norm, dup_key, origen, creado_ts) VALUES (${i}, '2026-11-02', 1, 100, 1, 100, 'B', '${i}', '${i}', 'k${i}', 'manual', 1)`);
  const ap = id => R.stAplicacion(db, {id_pago: id, id_documento: 1, usd_cents: 100, liquido: 1});
  pago(1); await db.batch([ap(1), R.stGuardaCobro(db, 1, 0, 100)]);
  pago(2); await assert.rejects(db.batch([ap(2), R.stGuardaCobro(db, 1, 0, 100)]), /documentos_venta\.estado/);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM pago_aplicaciones').get().n, 1); ok('dos cobros a la misma nota: el segundo se rechaza y no aplica de más');
}

/* 5. Tasa: sin fechas futuras */
{
  assert.equal(TD.vigenteEn([{fecha: '2026-11-20', valor: 1}], '2026-11-17'), null);
  assert.equal(TD.vigenteEn([{fecha: '2026-11-10', valor: 1}, {fecha: '2026-11-20', valor: 2}], '2026-11-17').valor, 1);
  ok('la tasa vigente nunca es de una fecha posterior');
  await assert.rejects(TS.cargarTasaDev(db, {fecha: '2999-01-01', valor: 5}), /futura/);
  await assert.rejects(TS.tasaPara(db, '2999-01-01'), /futura/);
  const html = '<div id="dolar"><strong> 40,00 </strong></div> Fecha Valor <span content="2999-01-01T00:00:00">x</span>';
  await db.prepare("INSERT OR REPLACE INTO config (clave, valor) VALUES ('tasa_fuente_url', 'http://x.test/')").run();
  const r = await TS.consultar(db, {fetchFn: async () => new Response(html)});
  assert.equal(r.ok, false); assert.equal(raw.prepare("SELECT COUNT(*) n FROM tasas_bcv WHERE fecha = '2999-01-01'").get().n, 0); ok('una tasa del BCV con fecha futura no se guarda');
}

/* 6. Portal: lo trabado vuelve a la cola */
{
  raw.exec("INSERT INTO pedidos_portal (id_cliente, estado, total_cents, creado_ts, resuelto_ts) VALUES (1, 'APROBANDO', 5, 1, 1)");
  raw.exec(`INSERT INTO pedidos_portal (id_cliente, estado, total_cents, creado_ts, resuelto_ts) VALUES (1, 'APROBANDO', 5, 1, ${Date.now()})`);
  assert.equal(await CR.destrabar(db), 1);
  assert.deepEqual(raw.prepare('SELECT estado FROM pedidos_portal ORDER BY id').all().map(x => x.estado), ['POR_CONFIRMAR', 'APROBANDO']); ok('un pedido «aprobando» viejo vuelve a «por confirmar»; el reciente no se toca');
}

/* 7. Descarga solo de lo cambiado */
{
  const r = await (await llamar('/api/all', 'GET')).json(); assert.ok(r.now && !r.delta); const t = r.now;
  await new Promise(x => setTimeout(x, 15));
  await llamar('/api/batch', 'POST', {ops: [{op: 'set', c: 'proveedores', id: 'P9', d: {n: 'Nueve'}}]});
  const d = await (await llamar('/api/all?since=' + t, 'GET')).json();
  assert.ok(d.delta); assert.deepEqual(d.cols.proveedores.map(x => x.id), ['P9']); assert.equal(d.cols.productos.length, 0); ok('con «since» solo baja lo que cambió');
  await llamar('/api/c/proveedores/P9?motivo=prueba', 'DELETE');
  const d2 = await (await llamar('/api/all?since=' + t, 'GET')).json();
  assert.deepEqual(d2.quitar.proveedores, ['P9']); ok('lo anulado llega en «quitar»');
}
console.log('\n' + n + ' pruebas pasaron');
