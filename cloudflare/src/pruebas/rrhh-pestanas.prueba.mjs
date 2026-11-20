/* Recursos humanos simplificado: 5 pestañas (En planta hoy, Personas, Bonos, Pagar nómina, Grupos y turnos), botones pequeños adentro,
   «Parámetros» fuera de RRHH (sigue en Gerencia › Ajustes y en Bonos de Administración) y las claves viejas siguen existiendo.
   Prueba estática: lee los archivos del front. Uso: node src/pruebas/rrhh-pestanas.prueba.mjs */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const leer = f => readFileSync(path.join(raiz, f), 'utf8');
const pant = leer('front/pantallas/pantallas.js'), pp = leer('front/comun/primeros-pasos.js'), turnos = leer('front/rrhh/h-turnos.js'), grupos = leer('front/rrhh/h-grupos.js'), app = leer('app-source.html');
let n = 0; const ok = t => { n++; console.log('  ok · ' + t); };

/* ---- UNI de «nom» ---- */
const i0 = pant.indexOf("UNI.push({p: 'nom'"), i1 = pant.indexOf("{p: 'adm', n: 'Bonos'", i0);
assert.ok(i0 > 0 && i1 > i0, 'bloque UNI de nom');
const bloque = pant.slice(i0, i1);
const entradas = [...bloque.matchAll(/^\s*\['([a-z-]+)', '([^']+)'(?:, \[([^\]]*)\])?/gm)].map(m => ({k: m[1], n: m[2], alias: (m[3] || '').split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean)}));
assert.deepEqual(entradas.map(e => e.n), ['En planta hoy', 'Personas', 'Bonos', 'Pagar nómina', 'Grupos y turnos']);
ok('la pantalla de RRHH tiene exactamente 5 pestañas, en el orden pedido');
const alias = k => entradas.find(e => e.k === k).alias;
assert.deepEqual(alias('rh-planta'), ['asistencia', 'rh-lector']);
assert.deepEqual(alias('rh-pagar'), ['prestamos', 'nomina']);
assert.deepEqual(alias('rh-grupos'), ['rh-turnos', 'turnos']);
ok('Asistencia y Lector son de «En planta hoy»; Préstamos y Nómina anterior de «Pagar nómina»; Turnos de «Grupos y turnos»');
for (const [k, subs] of [['rh-planta', ['Hoy', 'Asistencia', 'Lector de huellas']], ['rh-pagar', ['Pagar', 'Préstamos', 'Nómina anterior']], ['rh-grupos', ['Grupos', 'Quiénes estuvieron']]]) {
  const m = new RegExp("\\['" + k + "', '[^']+', \\[[^\\]]*\\], \\{sub: \\[(.*?)\\]\\}\\]").exec(bloque); assert.ok(m, 'sub-pestañas de ' + k);
  assert.deepEqual([...m[1].matchAll(/\['[a-z-]+', '([^']+)'\]/g)].map(x => x[1]), subs);
}
ok('cada pestaña madre trae sus botones pequeños con los nombres pedidos');
assert.ok(!bloque.includes('rh-params'), '«Parámetros» no está en la pantalla de RRHH');
ok('«Parámetros» ya no está en la pantalla de Recursos humanos');

/* ---- PANT: nom sin rh-params; ger y adm lo conservan ---- */
const linea = k => pant.split(/\r?\n/).find(l => l.includes("{k: '" + k + "'"));
const nom = pant.slice(pant.indexOf("{k: 'nom'"), pant.indexOf('];', pant.indexOf("{k: 'nom'")));
assert.ok(!nom.includes('rh-params'));
for (const k of ['rh-planta', 'rh-grupos', 'rh-bonos', 'rh-turnos', "'turnos'", 'personal', 'asistencia', 'rh-lector', 'rh-pagar', 'prestamos', 'nomina']) assert.ok(nom.includes(k.startsWith("'") ? k : "'" + k + "'"), 'sigue ' + k);
assert.ok(pant.includes("['rh-params', 'Horarios y reglas de pago']"), 'Gerencia › Ajustes renombrado');
assert.ok(!pant.includes("'Turnos y bonos'"));
assert.ok(linea('adm').length > 0 && pant.includes("['rh-params', 'Parámetros de turnos y bonos']"), 'Administración conserva su pestaña de Parámetros');
assert.ok(pant.includes("{p: 'adm', n: 'Bonos', siempre: true, m: [['rh-bonos', 'Bonos y metas'], ['rh-turnos', 'Turnos', ['turnos']], ['rh-params', 'Parámetros']]}"));
ok('Parámetros sigue en Gerencia (con el nuevo nombre) y en Administración, sin cambios');

/* ---- permisos y ruta vieja ---- */
assert.match(turnos, /'rh-params': 'rrhh:2 adm:1'/); assert.match(turnos, /hrGuardar: \['rh-params', 1\]/);
ok('los permisos no cambian: RRHH conserva el permiso de la clave rh-params para guardar horarios');
assert.match(pant, /route === 'rh-params' && S\.rol !== 'dueno' && !window\.pantVe\(S\.rol, 'rh-params'\) && can\('rh-grupos'\)/);
ok('la ruta vieja #rh-params lleva a «Grupos y turnos» solo a quien ya no la ve');
for (const k of ['rh-planta', 'rh-grupos', 'personal', 'asistencia', 'rh-lector', 'rh-bonos', 'rh-turnos', 'turnos', 'rh-params', 'rh-pagar', 'prestamos', 'nomina']) {
  const reg = new RegExp("'?" + k + "'?:\\s*\\{mod"); assert.ok([pant, turnos, grupos, leer('front/rrhh/h-planta.js'), leer('front/rrhh/h-bonos.js'), leer('front/rrhh/h-lector.js'), app].some(s => reg.test(s)), 'SCREENS ' + k);
}
ok('todas las claves viejas siguen registradas como pantallas (enlaces, «Ir aquí» y avisos siguen válidos)');

/* ---- horario dentro de Grupos y turnos ---- */
assert.match(grupos, /window\.hrTarjetaGrupos/);
assert.match(turnos, /Horario de cada turno/); assert.match(turnos, /function hrHorarioCard/);
assert.match(turnos, /solBtn\('Corregir algo ya pagado o con bono aplicado', '', 'rh-params'\)/);
assert.ok(!/card\('Bonos'/.test(turnos), 'sin la tarjeta «Bonos» en Horarios y reglas de pago');
ok('«Grupos y turnos» trae la tarjeta «Horario de cada turno» y Ajustes ya no tiene la tarjeta «Bonos»');

/* ---- Personas: horario real ---- */
assert.ok(!/Diurno \(7:00 a 17:00\)|Nocturno \(18:00 a 05:00\)/.test(app), 'sin horas fijas en Personas');
assert.match(app, /hrTurnoEtiqueta\('Diurno'\)/); assert.match(turnos, /window\.hrTurnoEtiqueta/);
ok('Personas muestra el horario real del turno (ya no el texto fijo 7:00 a 17:00)');

/* ---- Primeros pasos ---- */
const pasos = [...pp.matchAll(/\{id: '([^']+)', s: \d, k: '([^']+)'(?:, n: \d)?(?:, r: \[([^\]]*)\])?/g)].map(m => ({id: m[1], k: m[2], r: (m[3] || '').replace(/'/g, '').split(',').map(s => s.trim()).filter(Boolean)}));
for (const p of pasos) if (p.k === 'rh-params') assert.ok(!p.r.includes('rrhh') && p.r.length, 'el paso ' + p.id + ' apunta a rh-params y es de RRHH');
assert.equal(pasos.find(p => p.id === 'a-params-nom').k, 'rh-grupos');
assert.ok(!/«Grupos de turno»|«Importar del lector»/.test(pp));
ok('Primeros pasos: ningún paso de RRHH apunta a Parámetros y los textos usan los nombres nuevos');
console.log(`\n${n} comprobaciones de «RRHH simplificado» pasaron.`);
