/* Pruebas de lector.js (lectura del archivo y regla de entrada/salida) con filas SINTÉTICAS (no hay datos reales de nadie).
   Uso: node src/rrhh/lector.prueba.mjs */
import assert from 'node:assert/strict';
import * as L from './lector.js';

let n = 0; const ok = m => { n++; console.log('  ok · ' + m); };
const COL = 'Person ID,Name,Department,Time,Attendance Status,Attendance Check Point,Custom Name,Data Source,Handling Type,Temperature,Abnormal';
const fila = (id, nom, t) => `'${id},${nom},LJC,${t},None,PUNTO LECTOR_Door1,-,Original Records,-,-,-`;
const csv = [COL, fila(1001, 'Ana Perez', '2026-10-02 08:24:14'), fila(1001, 'Ana Perez', '2026-10-02 16:01:00'), fila(1002, 'NIÑO TEST', '2026-10-02 07:55:00'), fila(1002, 'NIÑO TEST', '2026-10-02 07:55:00'), 'x,y', fila(1003, 'Malo', '2026-13-45 99:00:00')].join('\r\n');
const par = {Diurno: {inicio: '07:00', fin: '17:00'}, Nocturno: {inicio: '18:00', fin: '05:00'}};
const T = (h, m = 0, d = '2026-10-02') => L.instanteDe(`${d} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
const dia = (horas, turno, extra = {}) => L.resolverDia({marcas: horas.map(([h, m, f]) => ({ts: T(h, m, f)})), turno, horarios: par, minEntre: null, fecha: '2026-10-02', ...extra});

// ---- Lectura del CSV ----
let r = L.leerArchivo(csv);
assert.equal(r.formato, 'csv'); assert.equal(r.marcas.length, 3, 'repetida en el archivo cuenta una vez'); assert.equal(r.ignoradas.length, 2, 'fila corta y fecha imposible se ignoran');
assert.equal(r.marcas[0].codigo, '1001', 'se quita la comilla inicial del Person ID'); ok('CSV: comilla inicial fuera, repetidas y fechas malas');
assert.equal(L.leerArchivo('hola').error.startsWith('No reconozco'), true); ok('archivo que no es del lector → error claro');
assert.equal(L.leerArchivo(['Person ID;Name;Department;Time', '5;Ana;X;2026-10-02 08:00:00'].join('\n')).marcas.length, 1); ok('separador punto y coma');
assert.equal(L.leerArchivo(['Person ID,Name,Time', `'7,"Pérez, Ana",2026-10-02 08:00:00`].join('\n')).marcas[0].nombre, 'Pérez, Ana'); ok('campos con comillas y coma');

// ---- Codificación latin-1 ----
const latin = Uint8Array.from(Buffer.from(COL + '\n' + fila(1004, 'NIÑO ÁNGEL', '2026-10-02 08:00:00'), 'latin1'));
assert.equal(L.leerArchivo(L.decodificar(latin)).marcas[0].nombre, 'NIÑO ÁNGEL'); assert.equal(L.decodificar(Buffer.from('ñ', 'utf8')), 'ñ'); ok('latin-1 y UTF-8 se leen bien (Ñ y tildes)');

// ---- Tabla HTML «.xls» (sin etiquetas <tr> de apertura, como la del lector) ----
const td = x => `<td align="center">${x}</td>`, cab = COL.split(',').map(td).join('');
const datos = [["'1001", 'Ana &amp; Co', 'LJC', '2026-10-02 08:24:14'], ["'1001", 'Ana &amp; Co', 'LJC', '2026-10-02 16:01:00']].map(v => v.map(td).join('') + ['None', 'PUNTO', '-', 'Original Records', '-', '-', '-'].map(td).join('') + '</tr>').join('\n');
const html = `<html><body><table><tr><td colspan=11><b>Original Records Report</b></td></tr><tr>${cab}</tr>\n${datos}</table></body></html>`;
r = L.leerArchivo(html); assert.equal(r.formato, 'xls'); assert.equal(r.marcas.length, 2); assert.equal(r.marcas[0].nombre, 'Ana & Co'); assert.equal(r.marcas[0].codigo, '1001'); ok('.xls (tabla HTML): mismas columnas y mismos datos que el CSV');

// ---- Instantes: hora de Venezuela (UTC-4) ----
assert.equal(L.instanteDe('2026-10-02 08:00:00'), Date.UTC(2026, 9, 2, 12, 0, 0)); assert.equal(L.horaTxt(T(8, 5)), '08:05'); assert.equal(L.instanteDe('2026-02-30 08:00:00'), null); ok('hora de Venezuela y fechas imposibles');

// ---- Entrada/salida por el horario del turno ----
let d = dia([[7, 24], [17, 1]], 'Diurno'); assert.equal(d.estado, 'listo'); assert.equal(d.entrada_ts, T(7, 24)); assert.equal(d.salida_ts, T(17, 1)); ok('Diurno 07-17 con marcas 07:24 y 17:01: la primera es entrada y la segunda salida → listo');
d = dia([[7, 3], [17, 5]], 'Diurno'); assert.equal(d.estado, 'listo'); assert.equal(d.entrada_ts, T(7, 3)); assert.equal(d.salida_ts, T(17, 5)); ok('Diurno: 07:03 y 17:05 → listo, entrada y salida');
d = dia([[18, 2], [5, 3, '2026-10-03']], 'Nocturno'); assert.equal(d.estado, 'listo'); assert.equal(d.turno, 'Nocturno'); assert.equal(d.entrada_ts, T(18, 2)); assert.equal(d.salida_ts, T(5, 3, '2026-10-03')); ok('Nocturno cruza la medianoche: entrada 18:02 y salida 05:03 del día siguiente → listo');
d = dia([[18, 2], [5, 3, '2026-10-03']], 'Diurno'); assert.equal(d.estado, 'por_revisar'); assert.match(d.motivo, /parecen del turno Nocturno/); ok('marcas de noche en alguien al que le tocaba Diurno (su grupo) → por revisar para Nómina');
d = dia([[7, 0], [17, 0]], 'Nocturno'); assert.equal(d.estado, 'por_revisar'); assert.match(d.motivo, /parecen del turno Diurno/); ok('marcas de día en alguien al que le tocaba Nocturno → por revisar');
d = dia([[8, 0]], 'Diurno'); assert.equal(d.estado, 'por_revisar'); assert.match(d.motivo, /una marca/); assert.equal(d.entrada_ts, null); ok('una sola marca → por revisar, sin inventar la otra');
d = dia([[7, 0], [7, 1], [17, 0]], 'Diurno'); assert.equal(d.estado, 'por_revisar'); assert.equal(d.n, 3); assert.equal(d.entrada_ts, T(7, 0)); assert.equal(d.propuesta, true); ok('3 marcas → por revisar con propuesta (la más cercana al inicio y al fin)');
d = dia([[7, 0], [7, 2], [16, 59], [17, 0]], 'Diurno'); assert.equal(d.estado, 'por_revisar'); ok('4 marcas → por revisar');
d = dia([[8, 0], [8, 20]], 'Diurno'); assert.equal(d.estado, 'por_revisar'); assert.match(d.motivo, /misma mitad/); ok('dos marcas juntas del mismo lado del turno → por revisar');
d = dia([[7, 0], [17, 0]], 'Diurno', {minEntre: 700}); assert.equal(d.estado, 'por_revisar'); assert.match(d.motivo, /muy juntas/); d = dia([[7, 0], [17, 0]], 'Diurno', {minEntre: 60}); assert.equal(d.estado, 'listo'); ok('«minutos mínimos entre marcas» solo se usa si está configurado');
d = dia([[8, 0], [16, 0]], ''); assert.equal(d.estado, 'sin_turno'); assert.equal(d.entrada_ts, T(8, 0)); assert.equal(d.salida_ts, T(16, 0)); assert.equal(d.propuesta, true); ok('sin turno: respaldo primera=entrada, última=salida, estado «sin turno»');
d = L.resolverDia({marcas: [{ts: T(8)}, {ts: T(16)}], turno: 'Diurno', horarios: {Diurno: {inicio: '', fin: ''}, Nocturno: {inicio: '', fin: ''}}}); assert.equal(d.estado, 'sin_turno'); assert.match(d.motivo, /no tiene horario/); ok('turno sin horario cargado → «sin turno» (no se inventan horas)');
d = dia([[8, 0]], ''); assert.equal(d.estado, 'por_revisar'); ok('sin turno y una marca → por revisar');
d = L.resolverDia({marcas: [{ts: T(18)}, {ts: T(5, 0, '2026-10-03')}], turno: '', horarios: par, fecha: '2026-10-02'}); assert.equal(d.turno_sugerido, 'Nocturno'); ok('se deduce a qué turno parecen las marcas');

// ---- Todo un archivo ----
const marcas = L.leerArchivo(csv).marcas, cod = new Map([['1001', {empleado_id: 'E1', nombre: 'Ana', turno: 'Diurno'}]]);
const dias = L.resolverMarcas(marcas, {codigos: cod, horarios: par, minEntre: null});
assert.equal(dias.find(x => x.codigo === '1002').estado, 'codigo_nuevo'); assert.equal(dias.find(x => x.codigo === '1001').empleado, 'Ana');
const c = L.contarMarcas(dias); assert.equal(c.codigo_nuevo, 1); assert.equal(c.listo + c.por_revisar + c.sin_turno + c.codigo_nuevo, 3); ok('códigos sin asociar → «código nuevo»; el conteo suma todas las marcas');
const j = L.normalizarMarcas([{codigo: "'9", momento: '2026-10-02T08:00:00'}, {codigo: '9', momento: '2026-10-02 08:00:00'}, {codigo: '', momento: 'x'}]); assert.equal(j.marcas.length, 1); assert.equal(j.ignoradas.length, 1); ok('marcas en JSON (envío automático) pasan por las mismas reglas');
console.log(`\n${n} pruebas de lector.js pasaron.`);
