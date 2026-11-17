/* Tasa BCV · reglas puras (sin base de datos ni red): leer lo que publica la fuente y elegir la tasa vigente para una fecha. */
const MESES = {enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12};
const quitarTildes = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

export const fechaValida = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;

/* "236,5037" o "1.236,50" (formato venezolano) a número. NaN si no es un número claro. */
export function numeroVE(t) {
  let s = String(t == null ? '' : t).trim().replace(/\s/g, '');
  if (!/^\d[\d.,]*$/.test(s)) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/* Lee el HTML de la página oficial del BCV. Devuelve {valor, fecha|null} o lanza Error con un mensaje claro.
   Es el ÚNICO lugar que conoce el formato de la página: si el BCV lo cambia, solo se toca esta función. */
export function leerTasaBCV(html) {
  const h = String(html || '');
  const i = h.search(/id=["']dolar["']/i);
  if (i < 0) throw new Error('La página del BCV no trae el bloque del dólar (cambió el formato).');
  const m = h.slice(i, i + 1500).match(/<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/i);
  const valor = m ? numeroVE(m[1]) : NaN;
  if (!(valor > 0)) throw new Error('No se pudo leer un número válido de la tasa del dólar.');
  return {valor, fecha: fechaValor(h)};
}
/* "Fecha Valor" de la página: atributo content="2026-11-16T..." o texto "Lunes, 16 Noviembre 2026". null si no aparece. */
export function fechaValor(html) {
  const h = String(html || ''), i = h.search(/fecha\s+valor/i); if (i < 0) return null;
  const t = h.slice(i, i + 600), iso = t.match(/content=["'](\d{4}-\d{2}-\d{2})/);
  if (iso && fechaValida(iso[1])) return iso[1];
  const x = quitarTildes(t.replace(/<[^>]*>/g, ' ')).toLowerCase().match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
  if (x && MESES[x[2]]) { const f = `${x[3]}-${String(MESES[x[2]]).padStart(2, '0')}-${x[1].padStart(2, '0')}`; if (fechaValida(f)) return f; }
  return null;
}

/* ¿La fecha es posterior a hoy? (fechas AAAA-MM-DD) */
export const esFuturo = (fecha, hoy) => typeof fecha === 'string' && fecha > hoy;

/* La tasa vigente para una fecha es la más reciente publicada hasta ese día (fin de semana y feriado = la última publicada).
   `filas` = [{fecha, valor, ...}] en cualquier orden. null si no hay ninguna hasta esa fecha. */
export function vigenteEn(filas, fecha) {
  let mejor = null;
  for (const f of filas) if (f.fecha <= fecha && (!mejor || f.fecha > mejor.fecha)) mejor = f;
  return mejor; /* sin ninguna hasta esa fecha: null (nunca se usa una tasa de fecha posterior) */
}
/* Estado para mostrar: respaldo = la última consulta falló y se usa lo ya guardado. */
export const armarEstado = (fila, hoy, ultimoEstado, ultimoError) => !fila ? null : {valor: fila.valor, fecha: fila.fecha, origen: fila.origen, fuente: fila.fuente, obtenida_en: fila.obtenida_en,
  respaldo: ultimoEstado === 'FALLO', error: ultimoEstado === 'FALLO' ? (ultimoError || 'No se pudo consultar la tasa.') : null, es_de_hoy: fila.fecha === hoy};
