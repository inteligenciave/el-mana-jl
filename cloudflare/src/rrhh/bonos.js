/* Bonos · reglas puras (sin base de datos ni HTTP). TODO en DÓLARES; al pagar la nómina se pasa a Bs con la tasa BCV del día de pago.
   Un «esquema» dice qué se mide (fuente), cómo se paga (forma), a quién (quienes) y con qué metas y montos (params).
   Formas: meta_fija (al llegar a la meta se paga un monto) · escalones (el monto del escalón más alto alcanzado) · por_unidad (base al llegar a la meta + monto por cada bloque COMPLETO por encima) · actividad (monto fijo por haber hecho la labor). */
import {BONOS_VE, BONOS_EDITA, BONOS_CREA} from '../acceso.js';
import {AREAS_PLANTA, areaReal} from './dominio.js';
export const puedeVerBonos = rol => BONOS_VE.includes(rol);
export const puedeEditarBonos = rol => BONOS_EDITA.includes(rol);
export const puedeCrearBonos = rol => BONOS_CREA.includes(rol);
export const MSG_SIN_CREAR = 'Solo Gerencia crea bonos nuevos. Administración cambia metas y montos de los que ya existen.';
export const MSG_SIN_BONOS = 'Tu puesto no ve los bonos.';
export const MSG_SIN_EDITAR = 'Solo Gerencia y Administración cambian los bonos.';
export const r2 = n => Math.round(((+n || 0) + (n < 0 ? -1e-9 : 1e-9)) * 100) / 100;
export const r3 = n => Math.round(((+n || 0) + 1e-9) * 1000) / 1000;

export const FORMAS = [{k: 'meta_fija', t: 'Meta fija'}, {k: 'escalones', t: 'Por escalones'}, {k: 'por_unidad', t: 'Base más extra por cada bloque'}, {k: 'actividad', t: 'Por actividad (monto fijo)'}];
export const FUENTES = [
  {k: 'kilos_empaque', t: 'Kilos de producto terminado que llegan a Empaque', un: 'kg'},
  {k: 'bultos_empaque', t: 'Bultos empacados', un: 'bultos'},
  {k: 'kilos_fritado', t: 'Kilos que salen de Fritado', un: 'kg'},
  {k: 'fritura', t: 'Haber ejecutado la fritura (marca por persona)', un: 'jornada'},
  {k: 'actividad', t: 'Haber hecho una actividad (marca por persona)', un: 'jornada'},
  {k: 'asistencia_nocturna', t: 'Haber marcado asistencia en el turno Nocturno', un: 'personas', fabrica: true}
];
export const COD_NOCTURNO = 'nocturno';
export const MSG_NOCTURNO_SIN_MONTO = 'Sin monto definido: Gerencia debe escribirlo para que se pague.';
export const QUIENES = [{k: 'turno', t: 'Todas las personas que marcaron en el turno'}, {k: 'empaque', t: 'Quienes trabajaron en Empaque ese turno'}, {k: 'fritura', t: 'Quienes ejecutaron la fritura'},
  {k: 'grupo_turno', t: 'El grupo asignado a ese turno (los que marcaron)'}, {k: 'area', t: 'Las personas de un área (las que marcaron)'}, {k: 'actividad', t: 'Quienes hicieron una actividad (marca por persona)'}];
/* Actividades con marca por persona que ya existen en el sistema (hoy solo la fritura; las demás etapas se agregan cuando tengan marca por persona) */
export const ETAPAS_MARCA = [{k: 'fritado', t: 'Fritura'}];
export const AREAS_BONO = AREAS_PLANTA;
export const etapaTxt = k => (ETAPAS_MARCA.find(x => x.k === k) || {}).t || k;
const unDe = f => (FUENTES.find(x => x.k === f) || {}).un || '';

/* ---------- Presentación (gramaje) ---------- */
/* «1 kg», «400 g», «0,4 kg», «200gr» → gramos (null si no se entiende) */
export function gramosDe(txt) {
  const m = /(\d+(?:[.,]\d+)?)\s*(kilos?|kgs?|k|gramos?|grs?|g)\b/i.exec(String(txt || '')); if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.')), kg = /^k/i.test(m[2]); if (!(n > 0)) return null;
  return Math.round(kg ? n * 1000 : n);
}
export const presTxt = g => g >= 1000 && g % 1000 === 0 ? (g / 1000) + ' kg' : g + ' g';

/* ---------- Validación de un esquema (lo que mandan Gerencia y Administración) ---------- */
const num = (v, max, campo, {min = 0, entero = false} = {}) => {
  if (v === '' || v === null || v === undefined) throw new Error(campo + ': escribe un número.');
  const n = +v; if (!Number.isFinite(n) || n < min || n > max) throw new Error(campo + ': debe estar entre ' + min + ' y ' + max + '.');
  if (entero && !Number.isInteger(n)) throw new Error(campo + ': debe ser un número entero.');
  return n;
};
/* Devuelve {ok: {nombre, forma, fuente, quienes, params, activo}} o {error}. actual = el esquema guardado (si se edita uno de fábrica no se cambian forma, fuente ni a quién). */
export function validarEsquema(b, actual, estructuraFija = false) {
  try {
    b = b || {};
    const nombre = String(b.nombre ?? (actual && actual.nombre) ?? '').replace(/\s+/g, ' ').trim(); if (nombre.length < 2 || nombre.length > 60) throw new Error('Escribe el nombre del bono (2 a 60 letras).');
    const fija = !!(actual && (actual.base || estructuraFija)); /* de fábrica o ya creado y quien edita no es Gerencia: solo metas, montos y nombre */
    const forma = fija ? actual.forma : String(b.forma || ''), fuente = fija ? actual.fuente : String(b.fuente || ''), quienes = fija ? actual.quienes : String(b.quienes || '');
    if (!FORMAS.some(x => x.k === forma)) throw new Error('Elige cómo se paga el bono.');
    if (!FUENTES.some(x => x.k === fuente)) throw new Error('Elige qué se mide.');
    if (!QUIENES.some(x => x.k === quienes)) throw new Error('Elige a quién se le paga.');
    if (fuente === 'asistencia_nocturna' && !(actual && actual.base)) throw new Error('El bono nocturno ya existe: cambia su monto en la lista.');
    if (fuente === 'asistencia_nocturna' && (forma !== 'actividad' || quienes !== 'turno')) throw new Error('El bono nocturno se paga como monto fijo a quien marcó en el turno Nocturno.');
    if ((forma === 'actividad') !== (fuente === 'fritura' || fuente === 'actividad' || fuente === 'asistencia_nocturna')) throw new Error('El pago por actividad va con una medida de actividad, y esas medidas solo se pagan por actividad.');
    if (quienes === 'fritura' && fuente !== 'fritura') throw new Error('«Quienes ejecutaron la fritura» solo va con la medida de fritura.');
    /* A quién y qué actividad: se toman de lo existente (áreas de planta, actividades con marca por persona) */
    const p0 = b.params || {}, d0 = fija ? ((actual && actual.destino) || {}) : (b.destino || {}), etapaIn = fija ? ((actual.params || {}).etapa) : (b.etapa ?? p0.etapa ?? d0.etapa);
    let destino = null, etapaFuente;
    if (quienes === 'area') { const a = areaReal(String(b.area ?? d0.area ?? '')); if (!a || !AREAS_BONO.includes(a)) throw new Error('Elige el área a la que se le paga.'); destino = {area: a}; }
    if (quienes === 'actividad') { const k = String(fija ? d0.etapa : (b.etapa ?? d0.etapa ?? '')); if (!ETAPAS_MARCA.some(x => x.k === k)) throw new Error('Elige la actividad cuyas personas cobran.'); destino = {etapa: k}; }
    if (fuente === 'actividad') { const k = String(etapaIn || ''); if (!ETAPAS_MARCA.some(x => x.k === k)) throw new Error('Elige la actividad que se mide.'); etapaFuente = k; }
    const p = b.params || {}, tope = v => (v === '' || v === null || v === undefined) ? 0 : num(v, 1e6, 'Tope');
    let params;
    if (forma === 'meta_fija') {
      params = {meta: r3(num(p.meta, 1e7, 'Meta')), monto: r2(num(p.monto, 1e5, 'Monto ($)'))};
      if (fuente === 'bultos_empaque' && Array.isArray(p.metas_presentacion) && p.metas_presentacion.length) {
        if (p.metas_presentacion.length > 10) throw new Error('Máximo 10 presentaciones.');
        const vistos = new Set();
        params.metas_presentacion = p.metas_presentacion.map(m => { const g = num(m.gramos, 50000, 'Gramos de la presentación', {min: 1, entero: true}); if (vistos.has(g)) throw new Error('La presentación ' + presTxt(g) + ' está repetida.'); vistos.add(g); return {gramos: g, meta: num(m.meta, 1e6, 'Meta de ' + presTxt(g), {min: 1, entero: true})}; });
      }
    } else if (forma === 'escalones') {
      const es = Array.isArray(p.escalones) ? p.escalones : []; if (!es.length || es.length > 10) throw new Error('Agrega de 1 a 10 escalones.');
      const lista = es.map(e => ({desde: r3(num(e.desde, 1e7, 'Escalón: desde', {min: 0.001})), monto: r2(num(e.monto, 1e5, 'Escalón: monto ($)'))})).sort((a, c) => a.desde - c.desde);
      for (let i = 1; i < lista.length; i++) if (lista[i].desde === lista[i - 1].desde) throw new Error('Dos escalones empiezan en el mismo valor.');
      params = {escalones: lista};
    } else if (forma === 'por_unidad') {
      params = {meta: r3(num(p.meta, 1e7, 'Meta', {min: 0.001})), monto_base: r2(num(p.monto_base, 1e5, 'Monto base ($)')), bloque: r3(num(p.bloque, 1e7, 'Tamaño del bloque', {min: 0.001})), monto_bloque: r2(num(p.monto_bloque, 1e5, 'Monto por bloque ($)'))};
      const t = tope(p.tope); if (t > 0) params.tope = r2(t);
    } else params = {monto: r2(num(p.monto, 1e5, 'Monto ($)'))};
    if (etapaFuente) params.etapa = etapaFuente;
    return {ok: {nombre, forma, fuente, quienes, destino, params, activo: b.activo === undefined ? (actual ? !!actual.activo : true) : !!b.activo}};
  } catch (e) { return {error: e.message}; }
}

/* ---------- Evaluación ---------- */
/* medida: {valor, por_presentacion: [{gramos, nombre, bultos}]}  ·  devuelve {califica, monto (por persona, USD), valor, unidad, meta, falta, avance (0 a 100), texto, detalle} */
export function evaluar(esq, medida) {
  const f = esq.forma, p = esq.params || {}, un = unDe(esq.fuente), v = r3(medida && medida.valor || 0), fin = (o) => ({unidad: un, valor: v, meta: null, falta: null, avance: 0, detalle: null, ...o});
  if (f === 'actividad' && esq.fuente === 'asistencia_nocturna') {
    const m = r2(p.monto), sinMonto = !(m > 0);
    return fin({califica: v > 0 && !sinMonto, monto: v > 0 && !sinMonto ? m : 0, avance: v > 0 && !sinMonto ? 100 : 0, sin_monto: sinMonto,
      texto: sinMonto ? 'Sin monto definido: no se paga todavía' + (v > 0 ? ' (' + v + (v === 1 ? ' persona marcó' : ' personas marcaron') + ' de noche)' : '') : v > 0 ? v + (v === 1 ? ' persona marcó' : ' personas marcaron') + ' en el turno Nocturno' : 'Nadie marcó todavía en el turno Nocturno'});
  }
  if (f === 'actividad') return fin({califica: v > 0, monto: v > 0 ? r2(p.monto) : 0, avance: v > 0 ? 100 : 0, texto: v > 0 ? 'Hay personas marcadas en ' + (esq.fuente === 'actividad' ? 'la actividad «' + etapaTxt(p.etapa) + '»' : 'la fritura') : 'Nadie marcado en ' + (esq.fuente === 'actividad' ? 'la actividad «' + etapaTxt(p.etapa) + '»' : 'la fritura') + ' todavía'});
  if (f === 'meta_fija') {
    const mp = Array.isArray(p.metas_presentacion) && p.metas_presentacion.length ? p.metas_presentacion : null;
    if (mp && esq.fuente === 'bultos_empaque') {
      const por = (medida && medida.por_presentacion) || [], filas = mp.map(m => { const b = por.filter(x => x.gramos === m.gramos).reduce((a, x) => a + x.bultos, 0); return {gramos: m.gramos, nombre: presTxt(m.gramos), bultos: b, meta: m.meta, falta: Math.max(0, m.meta - b), cumple: b >= m.meta}; });
      const ok = filas.some(x => x.cumple), cerca = [...filas].sort((a, c) => (c.bultos / c.meta) - (a.bultos / a.meta))[0];
      return fin({califica: ok, monto: ok ? r2(p.monto) : 0, meta: cerca ? cerca.meta : null, falta: ok ? 0 : (cerca ? cerca.falta : null), avance: ok ? 100 : Math.min(99, Math.floor(cerca ? cerca.bultos / cerca.meta * 100 : 0)), detalle: filas,
        texto: ok ? 'Califica: ' + filas.filter(x => x.cumple).map(x => x.nombre).join(', ') + ' llegó a la meta' : cerca ? 'Aún no: faltan ' + cerca.falta + ' bultos de ' + cerca.nombre + ' (meta ' + cerca.meta + ')' : 'Aún no'});
    }
    const meta = r3(p.meta), ok = meta > 0 && v >= meta;
    return fin({califica: ok, monto: ok ? r2(p.monto) : 0, meta, falta: ok ? 0 : r3(Math.max(0, meta - v)), avance: ok ? 100 : meta > 0 ? Math.min(99, Math.floor(v / meta * 100)) : 0, texto: ok ? 'Califica: llegó a la meta' : 'Aún no: faltan ' + r3(Math.max(0, meta - v)) + ' ' + un});
  }
  if (f === 'escalones') {
    const es = [...(p.escalones || [])].sort((a, c) => a.desde - c.desde), alc = es.filter(e => v >= e.desde), sig = es.find(e => v < e.desde), top = alc[alc.length - 1];
    return fin({califica: !!top, monto: top ? r2(top.monto) : 0, meta: sig ? sig.desde : (top ? top.desde : null), falta: sig ? r3(sig.desde - v) : 0, avance: top && !sig ? 100 : sig ? Math.min(99, Math.floor(v / sig.desde * 100)) : 0,
      texto: top ? 'Califica: escalón desde ' + top.desde + ' ' + un + (sig ? ' · faltan ' + r3(sig.desde - v) + ' ' + un + ' para el siguiente' : ' (el más alto)') : sig ? 'Aún no: faltan ' + r3(sig.desde - v) + ' ' + un : 'Aún no'});
  }
  /* por_unidad: base al llegar a la meta + monto por cada bloque COMPLETO por encima de la meta */
  const meta = r3(p.meta), bl = r3(p.bloque);
  if (!(meta > 0)) return fin({califica: false, monto: 0, texto: 'Sin meta cargada'});
  if (v < meta) return fin({califica: false, monto: 0, meta, falta: r3(meta - v), avance: Math.min(99, Math.floor(v / meta * 100)), texto: 'Aún no: faltan ' + r3(meta - v) + ' ' + un + ' para el bono base'});
  const bloques = bl > 0 ? Math.floor((v - meta) / bl + 1e-9) : 0; let monto = r2(p.monto_base + bloques * p.monto_bloque); if (p.tope > 0) monto = Math.min(monto, r2(p.tope));
  const faltaSig = bl > 0 ? r3(bl - ((v - meta) - bloques * bl)) : 0;
  return fin({califica: true, monto, meta, falta: 0, avance: 100, detalle: {bloques}, texto: 'Califica: ' + (bloques ? bloques + (bloques === 1 ? ' bloque completo' : ' bloques completos') + ' sobre la meta' : 'llegó a la meta') + (bl > 0 ? ' · faltan ' + faltaSig + ' ' + un + ' para el siguiente bloque' : '')});
}

/* Quiénes cobran: ids según el esquema.
   ctx = {presentes: ids con marca en el turno, empaque: ids de Empaque que marcaron, fritura: ids marcados en la fritura, grupo: ids del grupo asignado al turno que marcaron, etapas: {etapa: ids marcados}, emps: Map id → ficha} */
export function destinatarios(esq, ctx) {
  const d = esq.destino || {}, q = esq.quienes;
  const ids = q === 'fritura' ? ctx.fritura : q === 'empaque' ? ctx.empaque : q === 'grupo_turno' ? ctx.grupo : q === 'area' ? ctx.presentes.filter(id => ctx.emps && ctx.emps.get(id) && areaReal(ctx.emps.get(id).area) === d.area)
    : q === 'actividad' ? (ctx.etapas && ctx.etapas[d.etapa]) : ctx.presentes;
  return [...new Set(ids || [])];
}
/* ¿Es de Empaque? Por el área o el cargo de la ficha */
export const esDeEmpaque = e => !!e && /empaque/i.test(String(e.area || '') + ' ' + String(e.cargo || ''));

/* Texto corto de a quién se paga (para pantallas y auditoría) */
export function quienesTxt(esq) {
  const d = esq.destino || {};
  return esq.quienes === 'area' ? 'Personas del área ' + (d.area || '') : esq.quienes === 'actividad' ? 'Quienes hicieron: ' + etapaTxt(d.etapa) : (QUIENES.find(x => x.k === esq.quienes) || {}).t || esq.quienes;
}
/* ¿El bono ya rige para el turno que empieza en `inicioTs`? (un bono nuevo rige desde el SIGUIENTE turno; no toca turnos ya empezados o cerrados) */
export const rigeEn = (esq, inicioTs) => !(esq.desde_ts > 0) || inicioTs >= esq.desde_ts;
