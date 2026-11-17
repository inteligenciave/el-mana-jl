/* Pagar nómina · casos de uso (sin HTTP). Todos los montos se calculan aquí; la pantalla solo muestra y pide. Solo Gerencia y Recursos humanos. */
import * as N from './nomina.js';
import * as D from './dominio.js';
import * as R from './repo.js';
import {ROL_TXT, nomRol} from '../ventas/permisos.js';
import {hoyVE} from '../ventas/dominio.js';
import * as T from './turnos.js';
import {err} from './servicio.js';

const exigir = ctx => { if (!N.puedePagar(ctx.rol)) throw err(403, N.MSG_SIN_NOMINA); };
const audit = (ctx, ref, nom, accion, detalle) => R.stAuditoria(ctx.db, {rol: ctx.rol, rolTxt: nomRol(ctx.rol), ent: 'nomina', ref, nom, accion, detalle});
const POL0 = {nomJornada: 8, nomRecargo: 0, nomLey: 0};
function elegirPeriodo(tipo, ref, hoy) { const p = N.periodo(tipo, ref || hoy); if (!p) throw err(400, 'Elige semana, quincena o mes y una fecha válida.'); return p; }
/* Datos de todo el período, leídos una sola vez */
async function cargar(db, p) {
  const [emps, asis, pres, pol, marcas, pagos, par, bon] = await Promise.all([R.empleados(db), R.asistencias(db), R.prestamos(db), R.politicas(db), R.entre(db, p.desde, p.hasta), R.pagosSolapados(db, p.desde, p.hasta), R.parametrosDoc(db), R.bonosEntre(db, p.desde, p.hasta)]);
  const qs = new Set(N.quincenasDentro(p.desde, p.hasta)), dias = {}, jor = {}, P = T.parametros(par);
  for (const m of marcas) {
    const d = (dias[m.empleado_id] ||= {}), j = (jor[m.empleado_id] ||= {}); d[m.fecha] = (d[m.fecha] || 0) + D.horasDe(m);
    const h = T.horarioDe(P, m.turno); if (h.definido && !(m.fecha in j)) j[m.fecha] = h.horas; /* horas reales del turno; sin horario cargado, la jornada de la política */
  }
  return {emps, asis: asis.filter(a => qs.has(a.q)), pres, pol: {...POL0, ...pol}, dias, jor, par: P, bonos: Object.fromEntries(bon.map(x => [x.empleado_id, x.monto])), pagos};
}
const calcDe = (C, e, tipo) => N.calcular({e, pol: C.pol, tipo, manual: C.asis.filter(a => a.emp === e.id), dias: C.dias[e.id] || {}, jor: C.jor[e.id] || {}, bonosProd: C.bonos[e.id] || 0, prestamos: C.pres.filter(x => x.emp === e.id)});
/* Valor de la hora del turno y de la hora extra (con recargo) de la persona: horas del turno de su ficha, o la jornada de la política si no tiene turno u horario */
const valorHoraDe = (C, e) => { const h = T.TURNOS.includes(e.turno) ? T.horarioDe(C.par, e.turno) : {definido: false}, d = h.definido ? h.horas : +C.pol.nomJornada || 8; return {...T.valoresHora(e, d, C.pol.nomRecargo), horas_turno: d, turno_con_horario: h.definido}; };
const pagoTxt = x => x && ({id: x.id, desde: x.desde, hasta: x.hasta, periodo: x.periodo, neto: x.neto, fecha: x.fecha, forma: x.forma});

/* Lista del período: una fila por persona activa (o con pago en el período), con sus montos y si ya se le pagó */
export async function nomina(ctx, tipo, ref) {
  exigir(ctx); const hoy = hoyVE(), p = elegirPeriodo(tipo, ref, hoy), C = await cargar(ctx.db, p);
  const ids = new Set(C.pagos.map(x => x.empleado_id));
  const filas = C.emps.filter(e => D.activo(e) || ids.has(e.id)).sort((a, b) => String(a.n || '').localeCompare(String(b.n || ''), 'es')).map(e => ({
    empleado_id: e.id, nombre: e.n || e.id, cargo: e.cargo || '', area: e.area || '', pago_por: e.pago === 'hora' ? 'hora' : 'dia', tarifa: +e.tarifa || 0, turno: T.TURNOS.includes(e.turno) ? e.turno : '', ...valorHoraDe(C, e), ...calcDe(C, e, p.tipo), pagado: pagoTxt(C.pagos.find(x => x.empleado_id === e.id)) || null}));
  const tot = k => N.r2(filas.reduce((a, f) => a + (+f[k] || 0), 0));
  return {parametros: {horarios: C.par.horarios, jornada: +C.pol.nomJornada || 8}, periodo: p, anterior: N.mover(p.tipo, p.desde, -1), siguiente: N.mover(p.tipo, p.desde, 1), hoy, politicas: C.pol, cuotas_por_periodo: N.CUOTAS_POR_PERIODO[p.tipo], filas,
    totales: {personas: filas.length, pagadas: filas.filter(f => f.pagado).length, base: tot('base'), extra: tot('extra'), bonos: tot('bonos'), horas_extra: tot('horas_extra'), ley: tot('ley'), descuento_sugerido: tot('descuento_sugerido'), neto_sugerido: tot('neto_sugerido')}};
}
const recibo = (x, e) => ({id: x.id, empleado_id: x.empleado_id, nombre: e ? e.n || e.id : x.empleado_id, cedula: e ? e.cedula || '' : '', cargo: e ? e.cargo || '' : '', area: e ? e.area || '' : '', periodo: x.periodo, periodo_txt: N.periodo(x.periodo, x.desde).etiqueta, desde: x.desde, hasta: x.hasta,
  base: x.base, extra: x.extra, bonos: x.bonos, ley: x.ley, descuento_prestamo: x.descuento_prestamo, neto: x.neto, prestamos: JSON.parse(x.prestamos || '[]'), detalle: JSON.parse(x.detalle || '{}'), fecha: x.fecha, forma: x.forma, nota: x.nota || '', quien: nomRol(x.quien), ts: x.ts});
export async function reciboDe(ctx, id) {
  exigir(ctx); const x = await R.pagoDe(ctx.db, id); if (!x) throw err(404, 'No se encontró ese pago.');
  return recibo(x, await R.empleado(ctx.db, x.empleado_id));
}
/* Registra el pago de una persona: guarda el pago y suma la cuota descontada al préstamo, todo en una sola operación */
export async function pagar(ctx, b) {
  exigir(ctx); const hoy = hoyVE(), id = String((b && b.empleado_id) ?? '').trim();
  if (!/^[A-Za-z0-9_.~:@+-]{1,120}$/.test(id)) throw err(400, 'Elige a la persona.');
  const p = elegirPeriodo(String(b.periodo || ''), String(b.ref || '') || null, hoy), e = await R.empleado(ctx.db, id); if (!e) throw err(404, 'Esa persona no existe.');
  const C = await cargar(ctx.db, p), ya = C.pagos.find(x => x.empleado_id === id);
  if (ya) throw err(409, (e.n || 'Esta persona') + ' ya tiene un pago registrado que cubre estas fechas (' + ya.desde.split('-').reverse().join('/') + ' al ' + ya.hasta.split('-').reverse().join('/') + '). No se puede pagar dos veces.', {codigo: 'YA_PAGADO', pago_id: ya.id});
  const c = calcDe(C, e, p.tipo), v = N.validarPago(c, b, hoy); if (v.error) throw err(400, v.error);
  const o = v.ok, ts = Date.now(), st = [];
  const pago = {empleado_id: id, periodo: p.tipo, desde: p.desde, hasta: p.hasta, base: c.base, extra: c.extra, bonos: c.bonos, ley: c.ley, descuento_prestamo: o.descuento, neto: o.neto, prestamos: o.reparto, detalle: {origen: c.origen, dias: c.dias, horas: c.horas, horas_extra: c.horas_extra, bonos_produccion: c.bonos_produccion}, fecha: o.fecha, forma: o.forma, nota: o.nota, quien: ctx.rol, ts};
  st.push(R.stPago(ctx.db, pago), R.stGuardaPago(ctx.db));
  for (const r of o.reparto) { const pr = C.pres.find(x => x.id === r.id), antes = +pr.pagadas || 0; st.push(R.stCuotas(ctx.db, r.id, antes, Math.round((antes + r.cuotas) * 100) / 100)); }
  st.push(...audit(ctx, id, e.n, 'registró el pago de nómina', {periodo: p.etiqueta, neto: o.neto, descuento_prestamo: o.descuento}));
  try { await R.lote(ctx.db, st); }
  catch (x) { if (/NOT NULL constraint failed: ver\.v/i.test(String((x && x.message) || x))) throw err(409, (e.n || 'Esta persona') + ' ya tiene un pago registrado que cubre estas fechas (otra persona lo acaba de guardar). No se guardó nada.', {codigo: 'YA_PAGADO'}); throw x; }
  const nuevo = (await R.pagosSolapados(ctx.db, p.desde, p.hasta)).find(x => x.empleado_id === id);
  return recibo(nuevo, e);
}

/* Franja de resumen de Recursos humanos (siempre visible arriba): quién está en planta, total y pendientes del período y préstamos activos */
export async function resumen(ctx, tipo, ref) {
  exigir(ctx); const hoy = hoyVE(), p = elegirPeriodo(tipo, ref, hoy), C = await cargar(ctx.db, p);
  const porE = new Map(C.emps.map(e => [e.id, e])), abiertas = (await R.delDia(ctx.db, hoy)).filter(m => !m.salida_ts && D.cuentaEnPlanta(porE.get(m.empleado_id))), pt = Object.fromEntries(D.TURNOS.map(t => [t, abiertas.filter(m => m.turno === t).length]));
  const ids = new Set(C.pagos.map(x => x.empleado_id)); let total = 0, pendientes = 0, personas = 0;
  for (const e of C.emps.filter(e => D.activo(e) || ids.has(e.id))) {
    const c = calcDe(C, e, p.tipo), pag = C.pagos.find(x => x.empleado_id === e.id);
    if (!pag && c.origen === 'ninguno' && !(c.bonos > 0)) continue;
    personas++; if (pag) total += pag.neto; else { total += c.neto_sugerido; pendientes++; }
  }
  const act = C.pres.filter(x => x.pagadas < x.cuotas), saldo = act.reduce((a, x) => a + (x.cuotas - x.pagadas) * (x.monto / x.cuotas) * x.tasa, 0);
  return {periodo: p, en_planta: {total: abiertas.length, por_turno: pt}, nomina: {total_pagar: N.r2(total), personas, pendientes}, prestamos: {activos: act.length, saldo_bs: N.r2(saldo)}};
}
