/* Turnos, horas extra y bono de producción · reglas puras (sin base de datos ni HTTP). Montos en DÓLARES (al pagar se pasan a Bs con la tasa BCV del día de pago); todo se calcula en el servidor.
   Turnos: Diurno 07:00-17:00 y Nocturno 18:00-05:00 (cruza la medianoche y pertenece al día en que EMPIEZA). */
import {TURNOS_VE, TURNOS_DINERO, PARAM_VE, PARAM_EDITA, HORARIO_EDITA, BONO_APLICA} from '../acceso.js';
export const puedeVerTurnos = rol => TURNOS_VE.includes(rol);
export const veDinero = rol => TURNOS_DINERO.includes(rol);
export const puedeVerParam = rol => PARAM_VE.includes(rol);
export const puedeEditarParam = rol => PARAM_EDITA.includes(rol);
export const puedeEditarHorario = rol => HORARIO_EDITA.includes(rol);
export const puedeAplicarBono = rol => BONO_APLICA.includes(rol);
export const MSG_SIN_TURNOS = 'Tu puesto no ve los turnos.';
export const MSG_SIN_PARAM = 'Tu puesto no ve los parámetros de turnos y bonos.';
export const MSG_SOLO_GERENCIA = 'Solo Gerencia cambia estos parámetros. Si necesitas un cambio, usa «Pedir autorización».';
export const MSG_SOLO_HORARIOS = 'Nómina cambia solo los horarios de los turnos. Las reglas de pago y el bono los cambia Gerencia: usa «Pedir autorización».';
export const MSG_SIN_BONO = 'Solo Gerencia y Administración aplican los bonos.';
export const TURNOS = ['Diurno', 'Nocturno'];
/* Horarios que fijó el dueño; sirven de valor por defecto cuando Parámetros no tiene otros guardados */
export const HORARIOS_FIJOS = {Diurno: {inicio: '07:00', fin: '17:00'}, Nocturno: {inicio: '18:00', fin: '05:00'}};
export const MSG_ELIGE_TURNO = 'Elige el turno: Diurno o Nocturno.';
export const ETAPAS_KG = [{k: 'recepcion', t: 'Recepción'}, {k: 'lavado', t: 'Lavado'}, {k: 'fritado', t: 'Fritado'}, {k: 'empacado', t: 'Empacado'}];
export const r2 = n => Math.round(((+n || 0) + (n < 0 ? -1e-9 : 1e-9)) * 100) / 100;
export const r3 = n => Math.round(((+n || 0) + 1e-9) * 1000) / 1000;

/* ---------- Horario ---------- */
export const minDe = s => { const m = /^(\d{2}):(\d{2})$/.exec(String(s || '')); if (!m) return null; const h = +m[1], mi = +m[2]; return h > 23 || mi > 59 ? null : h * 60 + mi; };
export const horaOk = s => minDe(s) !== null;
/* Parámetros por defecto: nada cargado (no se inventan cifras) */
export const PARAM0 = {
  horarios: {Diurno: {...HORARIOS_FIJOS.Diurno}, Nocturno: {...HORARIOS_FIJOS.Nocturno}},
  bono: {tipo: 'por_kilo', valor: 0, meta_kg: 0, minimo_kg: 0, etapa: 'empacado', tramos: [], reparto: 'turno'}
};
/* Mezcla lo guardado con los valores por defecto.
   Los horarios se guardan con su historial (cada cambio dice desde qué día vale): `fecha` elige los horarios que valían ese día (por defecto, hoy). Un cambio nunca reescribe los días anteriores. */
const horNorm = h0 => { const h = h0 || {}, hor = {}; for (const t of TURNOS) { const i = String((h[t] && h[t].inicio) || ''), f = String((h[t] && h[t].fin) || ''); hor[t] = i && f ? {inicio: i, fin: f} : {...HORARIOS_FIJOS[t]}; } return hor; };
export const horariosEn = (historial, fecha, ultimo) => { if (!historial || !historial.length) return ultimo; let r = null; for (const x of historial) if (x.desde <= fecha) r = x.horarios; return r || historial[0].horarios; };
export function parametros(doc, fecha) {
  const d = doc || {}, b = d.bono || {};
  const historial = (Array.isArray(d.historial) ? d.historial : []).filter(x => x && /^\d{4}-\d{2}-\d{2}$/.test(String(x.desde))).map(x => ({desde: String(x.desde), horarios: horNorm(x.horarios), quien: x.quien || '', ts: +x.ts || 0})).sort((a, c) => (a.desde < c.desde ? -1 : a.desde > c.desde ? 1 : 0));
  const hor = horariosEn(historial, fecha || fechaVE(Date.now()), horNorm(d.horarios));
  return {horarios: hor, historial, bono: {tipo: b.tipo === 'fijo' ? 'fijo' : 'por_kilo', valor: +b.valor || 0, meta_kg: +b.meta_kg || 0, minimo_kg: +b.minimo_kg || 0, etapa: ETAPAS_KG.some(e => e.k === b.etapa) ? b.etapa : 'empacado',
    tramos: Array.isArray(b.tramos) ? b.tramos.map(x => ({desde: +x.desde || 0, pct: +x.pct || 0})).sort((a, c) => a.desde - c.desde) : [], reparto: b.reparto === 'persona' ? 'persona' : 'turno'}};
}
/* Los mismos parámetros, con los horarios que valían en esa fecha (para días pasados: asistencia, nómina, importar del lector) */
export const parEn = (par, fecha) => (par.historial && par.historial.length ? {...par, horarios: horariosEn(par.historial, fecha, par.horarios)} : par);
/* Duración y ventana de un turno. Si el fin es menor o igual que el inicio, el turno cruza la medianoche (fin_min se mide desde la medianoche del día en que EMPIEZA y puede pasar de 1440). */
export function horarioDe(par, turno) {
  const h = par.horarios[turno] || {}, a = minDe(h.inicio), b = minDe(h.fin);
  if (a === null || b === null || a === b) return {definido: false, inicio: '', fin: '', horas: null, ini_min: null, fin_min: null, cruza: false};
  const cruza = b < a, fin = cruza ? b + 1440 : b;
  return {definido: true, inicio: h.inicio, fin: h.fin, horas: (fin - a) / 60, ini_min: a, fin_min: fin, cruza};
}
const hm = m => String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
/* Huecos entre turnos (horas en que no hay ningún turno): lo que se marque ahí queda «por revisar». Solo si los dos turnos tienen horario. */
export function huecosDe(hor) {
  const d = horarioDe({horarios: hor}, 'Diurno'), n = horarioDe({horarios: hor}, 'Nocturno'); if (!d.definido || !n.definido || d.cruza || !n.cruza) return [];
  const r = [], finN = n.fin_min - 1440; if (d.ini_min > finN) r.push({desde: hm(finN), hasta: hm(d.ini_min)}); if (n.ini_min > d.fin_min) r.push({desde: hm(d.fin_min), hasta: hm(n.ini_min)});
  return r;
}
/* Reglas de un par de horarios: el diurno no pasa la medianoche, el nocturno SÍ la cruza (termina en la madrugada del día siguiente) y no se pisan. Devuelve un texto de error o ''. */
export function errorHorarios(hor, exigirAmbos) {
  const d = horarioDe({horarios: hor}, 'Diurno'), n = horarioDe({horarios: hor}, 'Nocturno');
  if (exigirAmbos && (!d.definido || !n.definido)) return 'Escribe la hora de entrada y de salida de los dos turnos, el diurno y el nocturno.';
  if (d.definido && d.cruza) return 'El turno diurno no puede terminar al día siguiente. Si un turno pasa la medianoche, es el nocturno.';
  if (n.definido && !n.cruza) return 'El turno nocturno tiene que pasar la medianoche: su hora de salida es de madrugada del día siguiente (por ejemplo 5:00 a.m.).';
  if (d.definido && n.definido) {
    if (d.ini_min < n.fin_min - 1440) return 'Los turnos se pisan: el diurno entra a las ' + d.inicio + ' y el nocturno todavía no ha terminado (sale a las ' + n.fin + ').';
    if (d.fin_min > n.ini_min) return 'Los turnos se pisan: el diurno sale a las ' + d.fin + ' y el nocturno ya entra a las ' + n.inicio + '.';
  }
  return '';
}
/* Valida lo que manda Gerencia (o Nómina, solo horarios: opts.exigirHorarios). Devuelve {ok: {horarios, bono, pol}} o {error} */
export function validarParametros(b, opts) {
  const x = b || {}, num = (v, mx, nom) => { if (v === '' || v === null || v === undefined) return 0; const n = +v; if (!Number.isFinite(n) || n < 0 || n > mx) throw new Error('«' + nom + '» debe ser un número entre 0 y ' + mx + '.'); return n; };
  try {
    const hor = {};
    for (const t of TURNOS) {
      const h = (x.horarios && x.horarios[t]) || {}, ini = String(h.inicio || '').trim(), fin = String(h.fin || '').trim();
      if (!ini && !fin) { hor[t] = {inicio: '', fin: ''}; continue; }
      if (!horaOk(ini) || !horaOk(fin)) throw new Error('El horario de ' + t + ' debe tener hora de inicio y de fin (formato 24 horas, por ejemplo 06:00).');
      if (minDe(fin) === minDe(ini)) throw new Error('En el turno ' + t + ' la hora de fin no puede ser igual a la de inicio. Si termina al día siguiente, escribe la hora de fin (por ejemplo 05:00).');
      hor[t] = {inicio: ini, fin};
    }
    { const e = errorHorarios(hor, !!(opts && opts.exigirHorarios)); if (e) throw new Error(e); }
    const bo = x.bono || {}, tr = Array.isArray(bo.tramos) ? bo.tramos : [];
    if (tr.length > 8) throw new Error('Puedes poner hasta 8 escalones de cumplimiento.');
    const tramos = tr.filter(r => r && (String(r.desde ?? '') !== '' || String(r.pct ?? '') !== '')).map(r => ({desde: num(r.desde, 300, 'Cumplimiento del escalón'), pct: num(r.pct, 300, 'Bono del escalón')})).sort((a, c) => a.desde - c.desde);
    if (new Set(tramos.map(r => r.desde)).size !== tramos.length) throw new Error('Dos escalones tienen el mismo cumplimiento.');
    const bono = {tipo: bo.tipo === 'fijo' ? 'fijo' : 'por_kilo', valor: r2(num(bo.valor, 1e9, 'Valor del bono')), meta_kg: r3(num(bo.meta_kg, 1e7, 'Meta de kilos')), minimo_kg: r3(num(bo.minimo_kg, 1e7, 'Mínimo de kilos')),
      etapa: ETAPAS_KG.some(e => e.k === bo.etapa) ? bo.etapa : 'empacado', tramos, reparto: bo.reparto === 'persona' ? 'persona' : 'turno'};
    const p = x.pagos || {}, jor = num(p.nomJornada, 24, 'Jornada completa'), pol = {nomJornada: jor > 0 ? jor : 8, nomRecargo: num(p.nomRecargo, 300, 'Recargo de horas extra'), nomLey: num(p.nomLey, 100, 'Deducciones de ley')};
    return {ok: {horarios: hor, bono, pol, conPagos: !!x.pagos}};
  } catch (e) { return {error: e.message}; }
}

/* ---------- Hora y turno de un hecho ---------- */
/* Minutos desde medianoche en hora de Venezuela (UTC-4) y fecha de un instante */
export const minVE = ts => { const d = new Date(ts - 4 * 3600e3); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
export const fechaVE = ts => new Date(ts - 4 * 3600e3).toISOString().slice(0, 10);
/* Día anterior / siguiente de una fecha AAAA-MM-DD */
export const mueveDia = (f, n) => new Date(Date.parse(f + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
/* Dónde cae un instante: el turno y el DÍA AL QUE PERTENECE ese turno (el nocturno que cruza la medianoche pertenece al día en que empieza).
   {turno, fecha}; turno es null en el hueco entre dos turnos (por defecto 17:00 a 18:00). */
export function ubicar(par, ts) {
  const min = minVE(ts), fecha = fechaVE(ts);
  for (const t of TURNOS) {
    const h = horarioDe(par, t); if (!h.definido) continue;
    if (!h.cruza) { if (min >= h.ini_min && min < h.fin_min) return {turno: t, fecha}; continue; }
    if (min >= h.ini_min) return {turno: t, fecha};
    if (min < h.fin_min - 1440) return {turno: t, fecha: mueveDia(fecha, -1)};
  }
  return {turno: null, fecha};
}
/* A qué turno cae un minuto del día (sin mirar a qué día pertenece). Sin horarios cargados: de 06:00 a 18:00 Diurno y el resto Nocturno. */
export function turnoDeMin(par, min) {
  const hs = TURNOS.map(t => ({t, h: horarioDe(par, t)}));
  if (hs.some(x => x.h.definido)) {
    const x = hs.find(y => y.h.definido && (y.h.cruza ? (min >= y.h.ini_min || min < y.h.fin_min - 1440) : (min >= y.h.ini_min && min < y.h.fin_min))); return x ? x.t : null;
  }
  return min >= 360 && min < 1080 ? 'Diurno' : 'Nocturno';
}
export const horarioPartido = par => !TURNOS.some(t => horarioDe(par, t).definido);
/* Ventana en instantes (ms) del turno que EMPIEZA en la fecha dada (el nocturno termina al día siguiente) */
export function ventanaTs(par, fecha, turno) {
  const h = horarioDe(par, turno), [y, m, d] = fecha.split('-').map(Number), base = Date.UTC(y, m - 1, d, 4);
  if (!h.definido) return [base, base + 864e5];
  return [base + h.ini_min * 60e3, base + h.fin_min * 60e3];
}
/* Fecha (AAAA-MM-DD) del turno al que pertenece un instante cualquiera para ese turno: sirve para marcar la entrada de quien llega después de la medianoche a un turno nocturno */
export const fechaDelTurno = (par, turno, ts) => { const h = horarioDe(par, turno), min = minVE(ts), f = fechaVE(ts); return h.definido && h.cruza && min < h.fin_min - 1440 ? mueveDia(f, -1) : f; };
/* "HH:MM" o instante → minutos del día (los datos que solo guardan hora de reloj) */
export const horaTxt = ts => { const m = minVE(ts); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };

/* ---------- Horas ---------- */
/* Horas del día de una persona: normales hasta la duración del turno; lo que pase es hora extra */
export function partirHoras(horas, dur) { const h = Math.max(0, +horas || 0), d = dur > 0 ? dur : 0; return {normales: d ? Math.min(h, d) : h, extra: d ? Math.max(0, h - d) : 0}; }

/* Valor de la hora y de la hora extra (con recargo %) a partir de la tarifa de la persona */
export function valoresHora(e, durHoras, rec) {
  const t = +e.tarifa || 0, hr = e.pago === 'hora' ? t : t / (durHoras > 0 ? durHoras : 8);
  return {valor_hora: r2(hr), valor_hora_extra: r2(hr * (1 + (+rec || 0) / 100))};
}

/* ---------- Bono de producción ---------- */
export function calcularBono(par, kilos) {
  const b = par.bono, k = r3(kilos), meta = b.meta_kg, base = {kilos: k, meta_kg: meta, minimo_kg: b.minimo_kg, cumplimiento: meta > 0 ? Math.round(k / meta * 1000) / 10 : null, etapa: b.etapa, tipo: b.tipo, valor: b.valor, pct_bono: 0, monto: 0};
  if (!(b.valor > 0) || !(meta > 0)) return {...base, estado: 'sin_parametros', texto: 'Sin parámetros'};
  if (k < b.minimo_kg) return {...base, estado: 'bajo_minimo', texto: 'No llega al mínimo de ' + b.minimo_kg + ' kg'};
  const cum = k / meta * 100;
  let pct = 0;
  if (b.tramos.length) { for (const t of b.tramos) if (cum + 1e-9 >= t.desde) pct = t.pct; } else pct = cum + 1e-9 >= 100 ? 100 : 0;
  if (!(pct > 0)) return {...base, estado: 'sin_cumplir', texto: 'No llega a la meta'};
  const bruto = b.tipo === 'fijo' ? b.valor : k * b.valor;
  return {...base, estado: 'ok', pct_bono: pct, monto: r2(bruto * pct / 100), texto: 'Cumplimiento ' + base.cumplimiento + ' %'};
}
/* Reparte un monto parejo entre las personas (los centavos sobrantes van a las primeras) */
export function repartirParejo(monto, ids) {
  const n = ids.length; if (!n || !(monto > 0)) return ids.map(id => ({empleado_id: id, monto: 0}));
  const cent = Math.round(monto * 100), base = Math.floor(cent / n); let resto = cent - base * n;
  return ids.map(id => { const c = base + (resto-- > 0 ? 1 : 0); return {empleado_id: id, monto: c / 100}; });
}
/* Valida lo que se aplica. presentes: ids de quienes marcaron en el turno. Devuelve {ok: {modo, filas}} o {error} */
export function validarBono(b, calc, presentes) {
  const modo = b && b.modo; if (modo !== 'turno' && modo !== 'persona') return {error: 'Elige si el bono va a todo el turno o persona por persona.'};
  if (!presentes.length) return {error: 'Nadie marcó entrada en ese turno: no hay a quién darle el bono.'};
  if (modo === 'turno') {
    if (!(calc.monto > 0)) return {error: calc.estado === 'sin_parametros' ? 'Sin parámetros: Gerencia debe cargar la meta y el valor del bono.' : 'Ese turno no ganó bono (' + calc.texto + ').'};
    return {ok: {modo, filas: repartirParejo(calc.monto, presentes)}};
  }
  const m = (b && b.montos) || {}, filas = [];
  for (const id of Object.keys(m)) {
    if (!presentes.includes(id)) return {error: 'Solo se puede dar bono a quienes marcaron entrada en ese turno.'};
    const v = m[id]; if (v === '' || v === null || v === undefined) continue; const n = +v;
    if (!Number.isFinite(n) || n < 0) return {error: 'Cada bono debe ser un monto igual o mayor que cero.'};
    if (n > 0) filas.push({empleado_id: id, monto: r2(n)});
  }
  if (!filas.length) return {error: 'Escribe el bono de al menos una persona.'};
  const tot = r2(filas.reduce((a, f) => a + f.monto, 0));
  if (!(calc.monto > 0)) return {error: calc.estado === 'sin_parametros' ? 'Sin parámetros: Gerencia debe cargar la meta y el valor del bono.' : 'Ese turno no ganó bono (' + calc.texto + ').'};
  if (tot > calc.monto + 0.005) return {error: 'Lo asignado ($ ' + tot.toFixed(2) + ') pasa del bono del turno ($ ' + calc.monto.toFixed(2) + ').'};
  return {ok: {modo, filas}};
}
