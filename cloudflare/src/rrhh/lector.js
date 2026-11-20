/* Lector de huellas (Hikvision, «Original Records Report») · reglas puras: leer el archivo y decidir entrada y salida.
   Sin base de datos ni HTTP: lo usa la pantalla «Importar del lector» y mañana puede usarlo un envío automático o un puente local.
   El lector NO distingue entrada de salida: se decide con el horario del turno de cada persona (los que ya cargó Gerencia en «Parámetros»).
   El turno nocturno (18:00 a 05:00) cruza la medianoche y pertenece al día en que EMPIEZA: su salida de la madrugada se junta con la entrada de la tarde anterior.
   Si las marcas parecen de un turno que no es el que le tocaba a la persona esa semana (su grupo), el día queda «por revisar» para Nómina.
   Aquí no hay ninguna cifra inventada: lo único configurable es «minutos mínimos entre dos marcas» (vacío = no se usa). */

export const COLUMNAS = ['Person ID', 'Name', 'Department', 'Time', 'Attendance Status', 'Attendance Check Point', 'Custom Name', 'Data Source', 'Handling Type', 'Temperature', 'Abnormal'];
export const ESTADOS = ['listo', 'por_revisar', 'sin_turno', 'codigo_nuevo'];
export const TURNOS = ['Diurno', 'Nocturno'];

/* Bytes → texto. El CSV del lector viene en latin-1 (Ñ y tildes); si es UTF-8 válido se respeta. */
export function decodificar(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try { return new TextDecoder('utf-8', {fatal: true}).decode(u).replace(/^﻿/, ''); }
  catch (e) { return new TextDecoder('windows-1252').decode(u); }
}

/* ---------- Lectura del archivo ---------- */
const limpiar = s => String(s ?? '').replace(/ /g, ' ').trim();
const ENTIDADES = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' '};
const sinEntidades = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
  return ENTIDADES[e.toLowerCase()] ?? m;
});

/* CSV con comillas; separador coma, punto y coma o tabulador (se adivina con la primera línea con «Person ID») */
export function filasCsv(texto) {
  const t = String(texto || '').replace(/^﻿/, ''), primera = t.split(/\r?\n/).find(l => /person\s*id/i.test(l)) || t.split(/\r?\n/)[0] || '';
  const sep = [',', ';', '\t'].map(s => [s, primera.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const filas = []; let fila = [], c = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === sep) { fila.push(c); c = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; fila.push(c); c = ''; if (fila.some(x => x !== '')) filas.push(fila); fila = []; }
    else c += ch;
  }
  fila.push(c); if (fila.some(x => x !== '')) filas.push(fila);
  return filas;
}

/* El «.xls» del lector es una tabla HTML (y le faltan las etiquetas <tr>): se leen todas las celdas en orden y se cortan por el número de columnas del encabezado */
export function filasHtml(texto) {
  const celdas = []; const re = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi; let m;
  while ((m = re.exec(String(texto || '')))) celdas.push(limpiar(sinEntidades(m[1].replace(/<[^>]*>/g, ''))));
  const i = celdas.findIndex(x => /^person\s*id$/i.test(x)); if (i < 0) return [];
  let n = 1; while (i + n < celdas.length && !/^\d{4}-\d{2}-\d{2} /.test(celdas[i + n]) && !/^'?\d+$/.test(celdas[i + n]) && n < 40) n++;
  const nCol = n, filas = [];
  for (let k = i; k + nCol <= celdas.length; k += nCol) filas.push(celdas.slice(k, k + nCol));
  return filas;
}

const quitaAcentos = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const clave = s => quitaAcentos(limpiar(s)).toLowerCase().replace(/\s+/g, ' ');
const RE_MOMENTO = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/;
/* Instante (ms) de un «AAAA-MM-DD HH:MM:SS» en hora de Venezuela (UTC-4); null si no es una fecha real */
export function instanteDe(momento) {
  const m = RE_MOMENTO.exec(String(momento || '').trim()); if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const ts = Date.UTC(y, mo - 1, d, h + 4, mi, s), v = new Date(ts - 4 * 3600e3);
  return v.getUTCFullYear() === y && v.getUTCMonth() === mo - 1 && v.getUTCDate() === d ? ts : null;
}
export const fechaDe = momento => String(momento).slice(0, 10);
/* Minutos del día (con decimales por los segundos) de un instante, hora de Venezuela */
export const minDelDia = ts => { const d = new Date(ts - 4 * 3600e3); return d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60; };
export const horaTxt = ts => { if (!ts) return '—'; const d = new Date(ts - 4 * 3600e3); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); };
/* El código viene con una comilla inicial (Excel): se quita */
export const codigoDe = s => limpiar(s).replace(/^['’`´]+/, '').trim();

/* Lee un archivo del lector (CSV o tabla HTML ".xls") ya convertido a texto.
   Devuelve {formato, marcas: [{codigo, nombre, departamento, momento, fecha, ts, punto}], ignoradas: [{fila, motivo}], total_filas}.
   Las marcas repetidas dentro del mismo archivo (mismo código y misma hora) se cuentan una sola vez. */
export function leerArchivo(texto) {
  const t = String(texto || '');
  const esHtml = /<t[dr]\b/i.test(t.slice(0, 200000)) && /<table/i.test(t);
  const filas = esHtml ? filasHtml(t) : filasCsv(t), formato = esHtml ? 'xls' : 'csv';
  const h = filas.findIndex(f => f.some(x => /^person\s*id$/i.test(limpiar(x))));
  if (h < 0) return {formato, marcas: [], ignoradas: [], total_filas: 0, error: 'No reconozco este archivo. Debe ser el «Original Records Report» del lector, con las columnas «Person ID» y «Time».'};
  const enc = filas[h].map(clave), col = n => enc.indexOf(clave(n));
  const iId = col('Person ID'), iNom = col('Name'), iDep = col('Department'), iT = col('Time'), iPto = col('Attendance Check Point');
  if (iId < 0 || iT < 0) return {formato, marcas: [], ignoradas: [], total_filas: 0, error: 'Al archivo le falta la columna «Person ID» o «Time».'};
  const marcas = [], ignoradas = [], vistos = new Set();
  for (let k = h + 1; k < filas.length; k++) {
    const f = filas[k], codigo = codigoDe(f[iId]), momento = limpiar(f[iT]);
    if (!codigo && !momento) continue;
    if (!codigo) { ignoradas.push({fila: k + 1, motivo: 'Sin código de persona'}); continue; }
    const ts = instanteDe(momento); if (ts === null) { ignoradas.push({fila: k + 1, motivo: 'Fecha u hora no válida'}); continue; }
    const mm = momento.replace('T', ' '), id = codigo + '|' + mm; if (vistos.has(id)) continue; vistos.add(id);
    marcas.push({codigo, nombre: limpiar(f[iNom]), departamento: limpiar(f[iDep]), momento: mm, fecha: fechaDe(mm), ts, punto: iPto >= 0 ? limpiar(f[iPto]) : ''});
  }
  return {formato, marcas, ignoradas, total_filas: filas.length - h - 1};
}

/* Valida marcas que llegan ya en JSON (envío automático del lector o puente local). Mismo resultado que leerArchivo. */
export function normalizarMarcas(lista) {
  const marcas = [], ignoradas = [], vistos = new Set();
  (Array.isArray(lista) ? lista : []).forEach((x, k) => {
    const codigo = codigoDe(x && (x.codigo ?? x.person_id ?? x.personId)), momento = limpiar(x && (x.momento ?? x.time ?? x.hora)).replace('T', ' ').slice(0, 19), ts = instanteDe(momento);
    if (!codigo) { ignoradas.push({fila: k + 1, motivo: 'Sin código de persona'}); return; }
    if (ts === null) { ignoradas.push({fila: k + 1, motivo: 'Fecha u hora no válida'}); return; }
    const id = codigo + '|' + momento; if (vistos.has(id)) return; vistos.add(id);
    marcas.push({codigo, nombre: limpiar(x.nombre ?? x.name), departamento: limpiar(x.departamento ?? x.department), momento, fecha: fechaDe(momento), ts, punto: limpiar(x.punto ?? x.dispositivo)});
  });
  return {formato: 'json', marcas, ignoradas, total_filas: Array.isArray(lista) ? lista.length : 0};
}

/* Agrupa por persona (código) y día, marcas ordenadas */
export function agruparPorDia(marcas) {
  const g = new Map();
  for (const m of marcas) { const k = m.codigo + '|' + m.fecha; (g.get(k) || g.set(k, {codigo: m.codigo, fecha: m.fecha, marcas: []}).get(k)).marcas.push(m); }
  for (const d of g.values()) d.marcas.sort((a, b) => a.ts - b.ts);
  return [...g.values()].sort((a, b) => a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0);
}
const mueveDia = (f, n) => new Date(Date.parse(f + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
/* Instante (ms) en que empieza un día (00:00 hora de Venezuela) */
export const inicioDia = fecha => { const [y, m, d] = fecha.split('-').map(Number); return Date.UTC(y, m - 1, d, 4); };
/* Agrupa por persona y DÍA DE TURNO: la marca de la madrugada de quien venía de un turno nocturno se junta con su entrada de la tarde anterior (el nocturno pertenece al día en que empieza).
   turnoDe(persona, fecha) → 'Diurno' | 'Nocturno' | '' (el turno que le tocaba esa fecha). Sin turnoDe se usa el turno fijo de la ficha. */
export function agruparPorTurnoDia(marcas, {codigos, horarios, turnoDe}) {
  const td = turnoDe || ((p, f) => p.turno), hn = ventanaDe(horarios, 'Nocturno'), hd = ventanaDe(horarios, 'Diurno'), g = new Map();
  const finNoc = hn ? hn.fin - 1440 : 300, iniNoc = hn ? hn.ini : 1080, iniDia = hd ? hd.ini : 420;
  for (const m of marcas) {
    let fecha = m.fecha; const p = codigos.get(m.codigo);
    if (p) {
      const ayer = mueveDia(m.fecha, -1);
      if (td(p, ayer) === 'Nocturno') {
        /* hasta dónde puede ser todavía la salida del nocturno de ayer: si hoy ya le toca Diurno, hasta la mitad entre su salida y la entrada del diurno; si no, hasta la mitad entre su salida y su próxima entrada */
        const corte = td(p, m.fecha) === 'Diurno' ? (finNoc + iniDia) / 2 : (finNoc + iniNoc) / 2;
        if (minDelDia(m.ts) < corte) fecha = ayer;
      }
    }
    const k = m.codigo + '|' + fecha; (g.get(k) || g.set(k, {codigo: m.codigo, fecha, marcas: []}).get(k)).marcas.push(m);
  }
  for (const d of g.values()) d.marcas.sort((a, b) => a.ts - b.ts);
  return [...g.values()].sort((a, b) => a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0);
}

/* ---------- Entrada y salida por el horario del turno ---------- */
const minHora = s => { const m = /^(\d{2}):(\d{2})$/.exec(String(s || '')); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null; };
/* Ventana de un turno a partir de lo guardado en Parámetros ({inicio:'06:00', fin:'14:00'}); null si no está cargado */
/* Si el fin es menor que el inicio el turno cruza la medianoche: fin se mide desde la medianoche del día en que EMPIEZA (puede pasar de 1440) */
export function ventanaDe(horarios, turno) {
  const h = horarios && horarios[turno]; if (!h) return null;
  const a = minHora(h.inicio), b = minHora(h.fin); return a !== null && b !== null && a !== b ? {turno, ini: a, fin: b < a ? b + 1440 : b, cruza: b < a} : null;
}
const mas = (arr, f) => arr.reduce((a, x) => (a === null || f(x) < f(a) ? x : a), null);

/* Decide un día.
   entrada: {marcas: [{ts}], turno: 'Diurno'|'Nocturno'|'' (el que le tocaba a la persona ese día), horarios: {Diurno:{inicio,fin}, Nocturno:{...}}, minEntre: minutos o null, fecha: día del turno AAAA-MM-DD}
   salida:  {estado: 'listo'|'por_revisar'|'sin_turno', motivo, entrada_ts, salida_ts, turno, turno_sugerido, propuesta (true si entrada/salida son solo una propuesta), n}
   Solo «listo» se guarda solo; «sin_turno» y «por_revisar» esperan a Nómina. */
export function resolverDia({marcas, turno, horarios, minEntre, fecha}) {
  /* minutos desde la medianoche del día del turno (pasan de 1440 si la marca es de la madrugada siguiente) */
  const ini0 = fecha ? inicioDia(fecha) : null, ms = [...marcas].sort((a, b) => a.ts - b.ts), n = ms.length, mins = ms.map(m => ini0 === null ? minDelDia(m.ts) : (m.ts - ini0) / 60000);
  const tieneTurno = TURNOS.includes(turno), vent = tieneTurno ? ventanaDe(horarios, turno) : null;
  const base = {n, turno: tieneTurno ? turno : '', turno_sugerido: '', entrada_ts: null, salida_ts: null, propuesta: false, motivo: ''};
  /* ¿A qué turno parecen pertenecer estas marcas? (solo si hay horarios cargados) */
  const defs = TURNOS.map(t => ventanaDe(horarios, t)).filter(Boolean);
  if (defs.length && n >= 1) { const puntaje = v => Math.abs(mins[0] - v.ini) + (n > 1 ? Math.abs(mins[n - 1] - v.fin) : 0); const w = mas(defs, puntaje); base.turno_sugerido = w.turno; }
  const primera = ms[0], ultima = ms[n - 1];
  /* Con turno y horario: la marca más cercana al inicio es la entrada y la más cercana al fin es la salida */
  const porTurno = v => {
    const e = mas(ms.map((m, i) => ({m, i})), x => Math.abs(mins[x.i] - v.ini)), s = mas(ms.map((m, i) => ({m, i})), x => Math.abs(mins[x.i] - v.fin));
    return e && s && e.i !== s.i && e.m.ts < s.m.ts ? {entrada_ts: e.m.ts, salida_ts: s.m.ts} : null;
  };
  if (n === 1) {
    const sug = vent ? (Math.abs(mins[0] - vent.ini) <= Math.abs(mins[0] - vent.fin) ? 'parece una entrada' : 'parece una salida') : '';
    return {...base, estado: 'por_revisar', motivo: 'Solo tiene una marca' + (sug ? ' (' + sug + ')' : '') + '. Falta la otra: confirma la hora o descártala.'};
  }
  if (n > 2) {
    const p = vent ? porTurno(vent) : null, ent = p ? p.entrada_ts : primera.ts, sal = p ? p.salida_ts : ultima.ts;
    return {...base, estado: 'por_revisar', motivo: 'Tiene ' + n + ' marcas ese día. Revisa cuáles son la entrada y la salida.', entrada_ts: ent, salida_ts: sal > ent ? sal : null, propuesta: sal > ent};
  }
  /* n === 2 */
  const juntas = Number.isFinite(+minEntre) && +minEntre > 0 && (ultima.ts - primera.ts) / 60000 < +minEntre;
  if (!tieneTurno) return {...base, estado: 'sin_turno', motivo: 'No tiene turno asignado en Personal: se tomó la primera marca como entrada y la última como salida.', entrada_ts: primera.ts, salida_ts: ultima.ts, propuesta: true, ...(juntas ? {estado: 'por_revisar', motivo: 'Las dos marcas están muy juntas (menos de ' + minEntre + ' minutos).'} : {})};
  if (!vent) return {...base, estado: 'sin_turno', motivo: 'El turno ' + turno + ' no tiene horario cargado en Parámetros: se tomó la primera marca como entrada y la última como salida.', entrada_ts: primera.ts, salida_ts: ultima.ts, propuesta: true, ...(juntas ? {estado: 'por_revisar', motivo: 'Las dos marcas están muy juntas (menos de ' + minEntre + ' minutos).'} : {})};
  const p = porTurno(vent), mitad = (vent.ini + vent.fin) / 2, par = {entrada_ts: p ? p.entrada_ts : primera.ts, salida_ts: p ? p.salida_ts : ultima.ts};
  if (juntas) return {...base, ...par, estado: 'por_revisar', propuesta: true, motivo: 'Las dos marcas están muy juntas (menos de ' + minEntre + ' minutos).'};
  if (base.turno_sugerido && base.turno_sugerido !== turno) return {...base, ...par, estado: 'por_revisar', propuesta: true, motivo: 'Las marcas parecen del turno ' + base.turno_sugerido + ' y a esta persona le tocaba el turno ' + turno + ' esa semana.'};
  if (mins[0] > mitad || mins[1] < mitad) return {...base, ...par, estado: 'por_revisar', propuesta: true, motivo: 'Las dos marcas caen en la misma mitad del turno ' + turno + ' (' + (mins[0] > mitad ? 'cerca del final' : 'cerca del inicio') + '): no se sabe si falta una entrada o una salida.'};
  return {...base, ...par, estado: 'listo', motivo: ''};
}

/* Corre resolverDia sobre todo un archivo.
   codigos: Map codigo → {empleado_id, nombre, turno (el fijo de la ficha)}; turnoDe(persona, fecha): el turno que le tocaba esa fecha (grupo de la semana o turno fijo). */
export function resolverMarcas(marcas, {codigos, horarios, horariosEn, minEntre, turnoDe}) {
  const td = turnoDe || ((p, f) => p.turno);
  return agruparPorTurnoDia(marcas, {codigos, horarios, turnoDe: td}).map(d => {
    const p = codigos.get(d.codigo), b = {codigo: d.codigo, fecha: d.fecha, nombre_lector: (d.marcas[0] || {}).nombre || '', marcas: d.marcas.map(m => m.ts), empleado_id: p ? p.empleado_id : null, empleado: p ? p.nombre : ''};
    if (!p) return {...b, estado: 'codigo_nuevo', motivo: 'Este código del lector todavía no está asociado a ninguna persona.', n: d.marcas.length, turno: '', entrada_ts: null, salida_ts: null, propuesta: false, turno_sugerido: ''};
    return {...b, ...resolverDia({marcas: d.marcas, turno: td(p, d.fecha), horarios: horariosEn ? horariosEn(d.fecha) : horarios, minEntre, fecha: d.fecha})};
  });
}

/* Cuenta marcas (no días) por estado final, para el resumen */
export function contarMarcas(dias) {
  const c = {listo: 0, por_revisar: 0, sin_turno: 0, codigo_nuevo: 0, ya_guardado: 0, descartado: 0};
  for (const d of dias) c[d.estado] = (c[d.estado] || 0) + (d.n_marcas ?? d.n ?? (d.marcas ? d.marcas.length : 0));
  return c;
}
