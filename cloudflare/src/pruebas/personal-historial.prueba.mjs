/* Regresión: «Personal» no debe quedar vacía por una fila del historial con forma distinta.
   El historial de cambios (entHist) recibe cambios como [antes, después] o como {antes:{…}, despues:{…}} y no debe lanzar.
   Uso: node src/pruebas/personal-historial.prueba.mjs */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(path.join(raiz, 'app-source.html'), 'utf8');
const ini = html.indexOf('function entHist(kinds) {'), fin = html.indexOf('/* Formulario de edición', ini);
assert.ok(ini > 0 && fin > ini, 'entHist en app-source.html');
let filas = [];
const esc = s => String(s), ENT_LBL = {puesto: 'Puesto', area: 'Área'}, rows = () => filas, card = (t, c) => c, table = (cols, L) => L.map(a => cols.map(c => c.f(a)).join('|')).join('\n');
const entHist = new Function('rows', 'card', 'table', 'esc', 'ENT_LBL', html.slice(ini, fin) + '; return entHist;')(rows, card, table, esc, ENT_LBL);
const base = {ts: 1, rol: 'Gerencia', ent: 'emp', ref: 'EH06', nom: 'Ana', accion: 'x'};
filas = [
  {...base, cambios: {puesto: ['Producción', 'Logística'], area: ['', 'Almacén']}},
  {...base, cambios: {antes: {puesto: 'Producción', area: 'Sin definir'}, despues: {puesto: 'Producción', area: 'Fritura'}}},
  {...base, cambios: {}}, {...base}, {...base, cambios: {area: 'Cocina'}}
];
const t = entHist(['emp']);
assert.match(t, /Área: Sin definir → Fritura/); assert.match(t, /Puesto: Producción → Logística/);
console.log('  ok · el historial de Personal acepta todas las formas de cambio'); 
/* Las rutas de Personal tienen vista registrada */
for (const r of ['personal', 'asistencia', 'nomina']) assert.ok(html.split(/\r?\n/).some(l => l.includes("'" + r + "':") && /\{mod:'adm'.*r:scr/.test(l)), 'vista de ' + r);
console.log('  ok · las rutas de Personal tienen vista');
