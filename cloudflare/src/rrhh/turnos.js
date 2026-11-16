/* Turnos, horas extra y bono de producción · reglas puras (sin base de datos ni HTTP). Montos en bolívares; todo se calcula en el servidor. */
import {TURNOS_VE, TURNOS_DINERO, PARAM_VE, PARAM_EDITA, BONO_APLICA} from '../acceso.js';
export const puedeVerTurnos = rol => TURNOS_VE.includes(rol);
export const veDinero = rol => TURNOS_DINERO.includes(rol);
export const puedeVerParam = rol => PARAM_VE.includes(rol);
export const puedeEditarParam = rol => PARAM_EDITA.includes(rol);
export const puedeAplicarBono = rol => BONO_APLICA.includes(rol);
export const MSG_SIN_TURNOS = 'Tu puesto no ve los turnos.';
export const MSG_SIN_PARAM = 'Tu puesto no ve los parámetros de turnos y bonos.';
export const MSG_SOLO_GERENCIA = 'Solo Gerencia cambia estos parámetros. Si necesitas un cambio, usa «Pedir autorización».';
export const MSG_SIN_BONO = 'Solo Gerencia y Administración aplican los bonos.';
export const TURNOS = ['Mañana', 'Tarde'];
export const ETAPAS_KG = [{k: 'recepcion', t: 'Recepción'}, {k: 'lavado', t: 'Lavado'}, {k: 'fritado', t: 'Fritado'}, {k: 'empacado', t: 'Empacado'}];
export const r2 = n => Math.round(((+n || 0) + (n < 0 ? -1e-9 : 1e-9)) * 100) / 100;
export const r3 = n => Math.round(((+n || 0) + 1e-9) * 1000) / 1000;

/* ---------- Horario ---------- */
export const minDe = s => { const m = /^(\d{2}):(\d{2})$/.exec(String(s || '')); if (!m) return null; const h = +m[1], mi = +m[2]; return h > 23 || mi > 59 ? null : h * 60 + mi; };
export const horaOk = s => minDe(s) !== null;
/* Parámetros por defecto: nada cargado (no se inventan cifras) */
export const PARAM0 = {
  horarios: {'Mañana': {inicio: '', fin: ''}, 'Tarde': {inicio: '', fin: ''}},
  bono: {tipo: 'por_kilo', valor: 0, meta_kg: 0, minimo_kg: 0, etapa: 'empacado', tramos: [], reparto: 'turno'}
};
/* Mezcla lo guardado con los valores por defecto */
export function parametros(doc) {
  const d = doc || {}, h = d.horarios || {}, b = d.bono || {};
  const hor = {}; for (const t of TURNOS) hor[t] = {inicio: String((h[t] && h[t].inicio) || ''), fin: String((h[t] && h[t].fin) || '')};
  return {horarios: hor, bono: {tipo: b.tipo === 'fijo' ? 'fijo' : 'por_kilo', valor: +b.valor || 0, meta_kg: +b.meta_kg || 0, minimo_kg: +b.minimo_kg || 0, etapa: ETAPAS_KG.some(e => e.k === b.etapa) ? b.etapa : 'empacado',
    tramos: Array.isArray(b.tramos) ? b.tramos.map(x => ({desde: +x.desde || 0, pct: +x.pct || 0})).sort((a, c) => a.desde - c.desde) : [], reparto: b.reparto === 'persona' ? 'persona' : 'turno'}};
}
/* Duración y ventana de un turno. Sin horario cargado: sin ventana y sin duración (se usa la jornada de la nómina). */
export function horarioDe(par, turno) {
  const h = par.horarios[turno] || {}, a = minDe(h.inicio), b = minDe(h.fin);
  if (a === null || b === null || b <= a) return {definido: false, inicio: '', fin: '', horas: null, ini_min: null, fin_min: null};
  return {definido: true, inicio: h.inicio, fin: h.fin, horas: (b - a) / 60, ini_min: a, fin_min: b};
}
/* Valida lo que manda Gerencia. Devuelve {ok: {horarios, bono, pol}} o {error} */
export function validarParametros(b) {
  const x = b || {}, num = (v, mx, nom) => { if (v === '' || v === null || v === undefined) return 0; const n = +v; if (!Number.isFinite(n) || n < 0 || n > mx) throw new Error('«' + nom + '» debe ser un número entre 0 y ' + mx + '.'); return n; };
  try {
    const hor = {};
    for (const t of TURNOS) {
      const h = (x.horarios && x.horarios[t]) || {}, ini = String(h.inicio || '').trim(), fin = String(h.fin || '').trim();
      if (!ini && !fin) { hor[t] = {inicio: '', fin: ''}; continue; }
      if (!horaOk(ini) || !horaOk(fin)) throw new Error('El horario de ' + t + ' debe tener hora de inicio y de fin (formato 24 horas, por ejemplo 06:00).');
      if (minDe(fin) <= minDe(ini)) throw new Error('En el turno ' + t + ' la hora de fin debe ser después de la de inicio.');
      hor[t] = {inicio: ini, fin};
    }
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
/* A qué turno cae un minuto del día. Sin horarios cargados: Mañana hasta las 12:00 y Tarde desde las 12:00 (se avisa en pantalla). */
export function turnoDeMin(par, min) {
  const hs = TURNOS.map(t => ({t, h: horarioDe(par, t)}));
  if (hs.some(x => x.h.definido)) { const x = hs.find(y => y.h.definido && min >= y.h.ini_min && min < y.h.fin_min); return x ? x.t : null; }
  return min < 720 ? 'Mañana' : 'Tarde';
}
export const horarioPartido = par => !TURNOS.some(t => horarioDe(par, t).definido);
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
  if (tot > calc.monto + 0.005) return {error: 'Lo asignado (' + tot.toFixed(2) + ' Bs) pasa del bono del turno (' + calc.monto.toFixed(2) + ' Bs).'};
  return {ok: {modo, filas}};
}
