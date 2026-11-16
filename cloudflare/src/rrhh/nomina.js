/* Pagar nómina · reglas de montos (puras: sin base de datos ni HTTP). Misma fórmula de la nómina por quincena de la pantalla «Nómina»:
   base = días × tarifa (o horas × tarifa); hora extra = horas extra × valor de la hora × (1 + recargo %); ley = (base + extra) × ley %;
   neto = base + extra + bonos − ley − préstamo. Todo en bolívares. */
import {NOMINA_PAGA} from '../acceso.js';
export const puedePagar = rol => NOMINA_PAGA.includes(rol);
export const MSG_SIN_NOMINA = 'Solo Gerencia y Nómina y RRHH ven y pagan la nómina.';
export const PERIODOS = {semana: 'Semana', quincena: 'Quincena', mes: 'Mes'};
export const FORMAS = ['Efectivo', 'Transferencia', 'Pago móvil'];
/* Cuotas de préstamo que se descuentan por período (por defecto): la semana no descuenta (se descuenta en la quincena) */
export const CUOTAS_POR_PERIODO = {semana: 0, quincena: 1, mes: 2};
export const r2 = n => Math.round(((+n || 0) + (n < 0 ? -1e-9 : 1e-9)) * 100) / 100;
const p2 = n => String(n).padStart(2, '0');
const dnum = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
const iso = n => new Date(n * 864e5).toISOString().slice(0, 10);
export const fechaOk = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && iso(dnum(s)) === s;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fdl = s => s.split('-').reverse().join('/');
/* Período que contiene la fecha `ref`: semana (lunes a domingo), quincena (1-15 / 16-fin) o mes */
export function periodo(tipo, ref) {
  if (!PERIODOS[tipo] || !fechaOk(ref)) return null;
  const [y, m, d] = ref.split('-').map(Number), ult = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let desde, hasta, etiqueta;
  if (tipo === 'semana') { const n = dnum(ref), dow = (new Date(n * 864e5).getUTCDay() + 6) % 7; desde = iso(n - dow); hasta = iso(n - dow + 6); etiqueta = 'Semana del ' + fdl(desde) + ' al ' + fdl(hasta); }
  else if (tipo === 'quincena') { const a = d <= 15; desde = y + '-' + p2(m) + '-' + (a ? '01' : '16'); hasta = y + '-' + p2(m) + '-' + (a ? '15' : p2(ult)); etiqueta = (a ? '1ª' : '2ª') + ' quincena de ' + MESES[m - 1] + ' ' + y; }
  else { desde = y + '-' + p2(m) + '-01'; hasta = y + '-' + p2(m) + '-' + p2(ult); etiqueta = MESES[m - 1][0].toUpperCase() + MESES[m - 1].slice(1) + ' de ' + y; }
  return {tipo, desde, hasta, etiqueta};
}
/* Una fecha dentro del período anterior (-1) o siguiente (+1) */
export function mover(tipo, ref, paso) {
  const p = periodo(tipo, ref); if (!p) return null;
  const [y, m] = p.desde.split('-').map(Number);
  if (tipo === 'semana') return iso(dnum(p.desde) + 7 * paso);
  if (tipo === 'mes') return new Date(Date.UTC(y, m - 1 + paso, 1)).toISOString().slice(0, 10);
  const prim = p.desde.endsWith('-01');
  if (paso > 0) return prim ? y + '-' + p2(m) + '-16' : new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  return prim ? new Date(Date.UTC(y, m - 2, 16)).toISOString().slice(0, 10) : y + '-' + p2(m) + '-01';
}
/* Claves de quincena («AAAA-MM-1» / «AAAA-MM-2») que caen completas dentro del período: de ahí sale lo anotado a mano en Asistencia */
export function quincenasDentro(desde, hasta) {
  const out = [];
  for (let n = dnum(desde.slice(0, 7) + '-01'); n <= dnum(hasta);) {
    const [y, m] = iso(n).split('-'), ult = new Date(Date.UTC(+y, +m, 0)).getUTCDate(), ini = y + '-' + m + '-';
    if (ini + '01' >= desde && ini + '15' <= hasta) out.push(y + '-' + m + '-1');
    if (ini + '16' >= desde && ini + p2(ult) <= hasta) out.push(y + '-' + m + '-2');
    n = dnum(ini + p2(ult)) + 1;
  }
  return out;
}
/* Cálculo de una persona en el período.
   e: ficha (pago 'dia'|'hora', tarifa) · pol: {nomJornada, nomRecargo, nomLey} · manual: asistencias a mano de las quincenas dentro del período
   dias: {fecha: horas marcadas} (marcas cerradas) · jor: {fecha: horas del turno ese día} (si falta, se usa la jornada de la política) · bonosProd: bonos de producción del período
   prestamos: préstamos de la persona · tipo: semana|quincena|mes */
export function calcular({e, pol, manual, dias, jor: jorDias, bonosProd, prestamos, tipo}) {
  const jor = +pol.nomJornada || 8, rec = +pol.nomRecargo || 0, ley = +pol.nomLey || 0, t = +e.tarifa || 0, porHora = e.pago === 'hora';
  const jd = f => (jorDias && +jorDias[f] > 0 ? +jorDias[f] : jor), hrDe = d => (porHora ? t : t / d);
  const fechas = Object.keys(dias || {}).filter(f => dias[f] > 0), conMarcas = fechas.length > 0;
  const man = (manual || []).reduce((a, x) => ({dias: a.dias + (+x.dias || 0), horas: a.horas + (+x.horas || 0), extra: a.extra + (+x.extra || 0), bonos: a.bonos + (+x.bonos || 0)}), {dias: 0, horas: 0, extra: 0, bonos: 0});
  let nd, nh, ne, origen, extraBase = 0, sinHorario = false;
  if (conMarcas) {
    nd = fechas.length; nh = fechas.reduce((a, f) => a + Math.min(dias[f], jd(f)), 0); ne = fechas.reduce((a, f) => a + Math.max(0, dias[f] - jd(f)), 0); origen = 'marcas';
    extraBase = fechas.reduce((a, f) => a + Math.max(0, dias[f] - jd(f)) * hrDe(jd(f)), 0); sinHorario = fechas.some(f => !(jorDias && +jorDias[f] > 0));
  } else if (man.dias || man.horas || man.extra) { nd = man.dias; nh = man.horas; ne = man.extra; origen = 'asistencia'; extraBase = ne * hrDe(jor); sinHorario = true; }
  else { nd = nh = ne = 0; origen = 'ninguno'; }
  const base = r2(porHora ? nh * t : nd * t), extra = r2(extraBase * (1 + rec / 100)), bp = r2(bonosProd), bonos = r2(man.bonos + bp), deley = r2((base + extra) * ley / 100), bruto = r2(base + extra + bonos - deley);
  const act = (prestamos || []).filter(p => p.pagadas < p.cuotas).sort((a, b) => String(a.id).localeCompare(String(b.id))).map(p => { const cuota = (+p.monto || 0) / (+p.cuotas || 1) * (+p.tasa || 0); return {id: p.id, cuota_bs: r2(cuota), restan: r2(p.cuotas - p.pagadas), cuotas: p.cuotas, pagadas: p.pagadas, saldo_bs: r2((p.cuotas - p.pagadas) * cuota), motivo: p.motivo || ''}; });
  const saldo = r2(act.reduce((a, p) => a + p.saldo_bs, 0));
  let porDescontar = CUOTAS_POR_PERIODO[tipo] || 0, sug = 0;
  for (const p of act) { const k = Math.min(porDescontar, p.restan); sug += k * p.cuota_bs; porDescontar -= k; }
  sug = Math.max(0, Math.min(r2(sug), saldo, bruto));
  return {origen, dias: r2(nd), horas: r2(nh), horas_extra: r2(ne), sin_horario: sinHorario, base, extra, bonos, bonos_produccion: bp, ley: deley, bruto, prestamos: act, saldo_prestamo: saldo, descuento_sugerido: sug, neto_sugerido: r2(bruto - sug)};
}
/* Valida el pago pedido y devuelve el descuento final y el reparto entre préstamos, o {error} */
export function validarPago(c, b, hoy) {
  const forma = String((b && b.forma) || '').trim();
  if (!FORMAS.includes(forma)) return {error: 'Elige la forma de pago: Efectivo, Transferencia o Pago móvil.'};
  const fecha = b.fecha ? String(b.fecha) : hoy; if (!fechaOk(fecha)) return {error: 'La fecha del pago no es válida.'};
  const nota = String(b.nota || '').trim(); if (nota.length > 200) return {error: 'La nota es muy larga: usa 200 letras o menos.'};
  if (c.origen === 'ninguno' && !(c.bonos > 0)) return {error: 'No hay marcas ni asistencia anotada de esta persona en el período: no hay nada que pagar.'};
  if (!(c.bruto >= 0)) return {error: 'El pago de esta persona da un monto negativo: revisa sus datos.'};
  let desc = 0;
  if (b.descontar) {
    if (!c.prestamos.length) return {error: 'Esta persona no tiene un préstamo activo.'};
    const v = b.monto_descuento;
    desc = v === undefined || v === null || v === '' ? c.descuento_sugerido : +v;
    if (!Number.isFinite(desc) || desc < 0) return {error: 'El descuento debe ser un monto igual o mayor que cero.'};
    desc = r2(desc);
    if (desc > c.saldo_prestamo + 0.005) return {error: 'No se puede descontar más de lo que queda del préstamo (' + c.saldo_prestamo.toFixed(2) + ' Bs).'};
  }
  if (desc > c.bruto + 0.005) return {error: 'El descuento no puede ser mayor que el pago: el neto quedaría en negativo.'};
  let resto = desc; const reparto = [];
  for (const p of c.prestamos) { if (resto <= 0.004) break; const bs = r2(Math.min(resto, p.saldo_bs)); reparto.push({id: p.id, bs, cuotas: p.cuota_bs > 0 ? Math.round(bs / p.cuota_bs * 100) / 100 : 0}); resto = r2(resto - bs); }
  return {ok: {fecha, forma, nota, descuento: desc, reparto, neto: r2(c.bruto - desc)}};
}
