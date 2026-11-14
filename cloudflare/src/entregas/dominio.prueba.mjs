/* Pruebas del dominio de entregas (sin base de datos). Uso: node src/entregas/dominio.prueba.mjs */
import assert from 'node:assert/strict';
import * as E from './dominio.js';
import * as V from '../ventas/dominio.js';
const A = {dias_tramo1: 7, dias_tramo2: 21, descuento1_pct: 5, descuento2_pct: 2, recargo_mora_pct: 3}, T0 = Date.UTC(2026, 10, 1, 15, 0, 0), D = 864e5;
const est = (d, aj = A, pausas = []) => E.calcularTemporizador({entrega_ts: T0, ahora: T0 + d * D, ajustes: aj, pausas});
// 1) fechas distintas
for (const [d, e, dias] of [[0, 'TRAMO1', 0], [6.99, 'TRAMO1', 6], [7, 'TRAMO1', 7], [7.01, 'TRAMO2', 7], [21, 'TRAMO2', 21], [21.01, 'VENCIDA', 21], [40, 'VENCIDA', 40]]) { const r = est(d); assert.equal(r.estado, e, 'd=' + d); assert.equal(r.dias, dias, 'dias d=' + d); }
assert.equal(est(3).descuento_pct, 5); assert.equal(est(10).descuento_pct, 2); assert.equal(est(30).recargo_pct, 3); assert.equal(est(30).dias_vencida, 9);
// 2) sin foto no arranca
const s = E.calcularTemporizador({entrega_ts: null, ahora: T0, ajustes: A}); assert.equal(s.estado, 'SIN_VERIFICAR'); assert.equal(s.corre, false); assert.equal(s.dias, null);
// 3) ajustes vacíos: días y «vencida», sin descuento ni recargo, con aviso
for (const d of [3, 10, 30]) { const r = est(d, {dias_tramo1: 7, dias_tramo2: 21}); assert.equal(r.descuento_pct, null); assert.equal(r.recargo_pct, null); assert.equal(r.aplica_ajuste, false); assert.ok(r.aviso); }
assert.equal(est(30, {}).estado, 'VENCIDA'); assert.equal(est(30, {}).ajustes_faltantes.length, 3);
// 4) cuenta regresiva y pausa
assert.equal(Math.round(est(1).restante_ms / D * 100) / 100, 6);
const p = est(30, A, [{desde_ts: T0 + 3 * D, hasta_ts: T0 + 20 * D}]); assert.equal(p.estado, 'TRAMO2'); assert.equal(p.dias, 13); // 30 - 17 días en pausa
const pa = est(30, A, [{desde_ts: T0 + 3 * D, hasta_ts: null}]); assert.equal(pa.estado, 'PAUSADA'); assert.equal(pa.dias, 3); assert.equal(pa.vence_ts, null);
assert.equal(E.calcularTemporizador({entrega_ts: T0, ahora: T0 + 5 * D, ajustes: A, pausas: [{desde_ts: T0 - 9 * D, hasta_ts: T0 - 1 * D}]}).dias, 5, 'pausa anterior a la entrega no cuenta');
// 5) cuánto pagar hoy
let m = E.montoHoy({total_cents: 11600, pagado_cents: 1000, temporizador: est(2)}); assert.deepEqual([m.normal_cents, m.hoy_cents, m.aplica], [10600, 10020, true]); // 11600*0.95=11020 - 1000
m = E.montoHoy({total_cents: 11600, temporizador: est(2, {})}); assert.deepEqual([m.hoy_cents, m.aplica], [11600, false]);
m = E.montoHoy({total_cents: 10000, temporizador: est(30)}); assert.equal(m.hoy_cents, 10300);
assert.equal(E.usdABs(10020, 36.5), 365730);
// 6) integración con el motor: sin cambios si no aplica; con descuento si aplica
const lineas = [{cantidad: 10, precio_base_cents: 100, precio_pp_cents: 90, precio_mora_cents: 110, alicuota: 16}], cli = {dias_pronto_pago: 5, dias_credito_normal: 15};
for (const tipo of ['NOTA_ENTREGA', 'FACTURA']) {
  const doc = {tipo_origen: tipo, fecha_emision: '2026-11-01', total_cents: 1160}, args = {doc, lineas, cliente: cli, fechaPago: '2026-11-04'};
  const base = V.calcularLiquidacion(args), neutra = V.calcularLiquidacion({...args, cliente: {dias_pronto_pago: null, dias_credito_normal: null}});
  const sinAj = E.ajustarLiquidacion(base, neutra, est(2, {}), doc); assert.equal(sinAj.neto_cents, base.neto_cents); assert.equal(sinAj.nota, base.nota); assert.equal(sinAj.entrega.ajuste_aplicado, false);
  assert.equal(E.ajustarLiquidacion(base, neutra, null, doc).neto_cents, base.neto_cents);
  const con = E.ajustarLiquidacion(base, neutra, est(2), doc); assert.equal(con.neto_cents, 1102); assert.equal(con.entrega.ajuste_aplicado, true); // 1160 * 0.95
  if (tipo === 'FACTURA') assert.equal(con.nota.tipo, 'NOTA_CREDITO'), assert.equal(con.nota.total, 58);
  const mora = E.ajustarLiquidacion(base, neutra, est(30), doc); assert.equal(mora.neto_cents, 1195); // 1160 * 1.03 = 1194.8
  if (tipo === 'FACTURA') assert.equal(mora.nota.tipo, 'NOTA_DEBITO');
}
// 7) validación de ajustes y fotos
assert.ok(E.validarAjustes({dias_tramo1: 7, dias_tramo2: 7}).error); assert.ok(E.validarAjustes({dias_tramo1: 7, dias_tramo2: 21, descuento1_pct: 120}).error);
assert.deepEqual(E.validarAjustes({dias_tramo1: 7, dias_tramo2: 21, descuento1_pct: '', recargo_mora_pct: '2.5'}).ajustes, {dias_tramo1: 7, dias_tramo2: 21, descuento1_pct: null, descuento2_pct: null, recargo_mora_pct: 2.5});
assert.ok(E.validarFoto('hola', null)); assert.equal(E.validarFoto('/9j/' + 'A'.repeat(200), null), null); assert.ok(E.validarFoto('/9j/' + 'A'.repeat(E.MAX_FOTO_CHARS), null)); assert.ok(E.validarFoto('iVBOR' + 'A'.repeat(200), null));
console.log('Dominio de entregas: todas las pruebas pasan.');
