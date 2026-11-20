/* Pruebas de Personal: puestos y áreas. Migración 0035 (con su reversa, idempotente y sin adivinar), validación del servidor, turnos/grupos/bonos solo para planta
   y «Personal activo hoy». Base en memoria, datos inventados. Uso: node src/pruebas/areas-puestos.prueba.mjs */
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {crearDB} from './d1-falso.mjs';
import * as D from '../rrhh/dominio.js';
import * as AS from '../rrhh/areas-servicio.js';
import * as GS from '../rrhh/grupos-servicio.js';

let n = 0; const ok = m => { n++; console.log('  ok · ' + m); };
const rechaza = async (p, re, st) => { try { await p; } catch (e) { assert.match(String(e.message), re); if (st) assert.equal(e.status, st); return e; } assert.fail('debía rechazar: ' + re); };
const rechazaSync = (f, re) => { try { f(); } catch (e) { assert.match(String(e.message), re); assert.equal(e.status, 400); return; } assert.fail('debía rechazar: ' + re); };
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'), dir = path.join(raiz, 'migrations');
const sql35 = readFileSync(path.join(dir, '0035_puestos_areas_personal.sql'), 'utf8'), rev35 = readFileSync(path.join(raiz, 'reversa', '0035_puestos_areas_personal_reversa.sql'), 'utf8');

/* ---- 1. Listas: servidor y pantalla son la misma ---- */
{
  assert.deepEqual(D.PUESTOS, ['Gerencia', 'Administración', 'Ventas', 'Recursos humanos', 'Producción', 'Logística']);
  assert.deepEqual(D.PUESTOS_AREAS['Producción'], ['Cocina', 'Fritura', 'Mantenimiento', 'Línea salsera']); assert.deepEqual(D.PUESTOS_AREAS['Logística'], ['Empaque', 'Almacén', 'Despacho / Choferes']);
  assert.ok(!D.AREAS.includes('Administración y ventas'));
  const html = readFileSync(path.join(raiz, 'app-source.html'), 'utf8'), m = html.match(/const PUESTOS_AREAS = (\{[^;]*\});/); assert.ok(m, 'PUESTOS_AREAS en app-source.html');
  assert.deepEqual(eval('(' + m[1] + ')'), D.PUESTOS_AREAS); const a = html.match(/AREAS_ANTES = (\{[^;]*\});/); assert.ok(a);
  assert.deepEqual(eval('(' + a[1].replace(/AREA_SIN_DEFINIR/g, "'Sin definir'") + ')'), D.AREAS_ANTES);
  ok('puestos y áreas: la lista de la pantalla es la del servidor y «Administración y ventas» ya no es un área');
}

/* ---- 2. Migración 0035 con datos viejos ---- */
const base = () => { const m = new DatabaseSync(':memory:'); for (const f of readdirSync(dir).filter(x => x.endsWith('.sql') && x < '0035').sort()) m.exec(readFileSync(path.join(dir, f), 'utf8')); return m; };
const ins = (m, id, e) => m.prepare("INSERT INTO docs (col, id, data, updated) VALUES ('empleados', ?, ?, 1)").run(id, JSON.stringify({id, n: 'Persona ' + id, ...e}));
const dato = (m, id) => JSON.parse(m.prepare("SELECT data FROM docs WHERE col = 'empleados' AND id = ?").get(id).data);
{
  const m = base();
  ins(m, 'A1', {area: 'Administración y ventas', turno: ''}); ins(m, 'A2', {area: 'Administración y ventas'}); ins(m, 'P1', {area: 'Producción', turno: 'Diurno'}); ins(m, 'P2', {area: 'Freído y procesamiento'});
  ins(m, 'S1', {area: 'Línea salsera'}); ins(m, 'E1', {area: 'Empaque'}); ins(m, 'L1', {area: 'Almacén'}); ins(m, 'L2', {area: 'Almacén y recepción'}); ins(m, 'C1', {area: 'Logística'}); ins(m, 'X1', {area: 'Otra cosa'});
  m.exec(sql35);
  const q = id => { const e = dato(m, id); return e.puesto + '/' + e.area; };
  assert.equal(q('A1'), 'Administración/Administración'); assert.equal(q('A2'), 'Administración/Administración'); assert.equal(q('P1'), 'Producción/Sin definir'); assert.equal(q('P2'), 'Producción/Sin definir');
  assert.equal(q('S1'), 'Producción/Línea salsera'); assert.equal(q('E1'), 'Logística/Empaque'); assert.equal(q('L1'), 'Logística/Almacén'); assert.equal(q('L2'), 'Logística/Almacén'); assert.equal(q('C1'), 'Logística/Despacho / Choferes');
  assert.equal(dato(m, 'X1').puesto, undefined); assert.equal(dato(m, 'P1').turno, 'Diurno');
  ok('migración 0035: cada área vieja pasa a su puesto y área; «Administración y ventas» → Administración; Producción queda «Sin definir»; lo desconocido y el turno no se tocan');
  assert.equal(m.prepare('SELECT COUNT(*) c FROM areas_respaldo').get().c, 9); assert.equal(m.prepare("SELECT COUNT(*) c FROM areas_respaldo WHERE motivo = 'ventas' AND revisada = 0").get().c, 2);
  /* idempotente: una persona reasignada a mano no se vuelve a tocar */
  m.prepare("UPDATE docs SET data = json_set(data, '$.puesto', 'Ventas', '$.area', 'Ventas') WHERE id = 'A2'").run(); m.exec(sql35);
  assert.equal(q('A2'), 'Ventas/Ventas'); assert.equal(m.prepare('SELECT COUNT(*) c FROM areas_respaldo').get().c, 9); ok('migración 0035: correrla otra vez no cambia nada (idempotente)');
  m.exec(rev35);
  assert.equal(dato(m, 'A1').area, 'Administración y ventas'); assert.equal(dato(m, 'A2').area, 'Administración y ventas'); assert.equal(dato(m, 'P2').area, 'Freído y procesamiento'); assert.equal(dato(m, 'L2').area, 'Almacén y recepción'); assert.equal(dato(m, 'P1').area, 'Producción');
  assert.equal(dato(m, 'E1').puesto, undefined); assert.equal(dato(m, 'E1').area, 'Empaque'); assert.equal(m.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE name = 'areas_respaldo'").get().c, 0);
  ok('reversa 0035: cada persona recupera su área anterior, se quita el puesto y el respaldo');
  m.exec(sql35); assert.equal(q('A1'), 'Administración/Administración'); ok('ida, vuelta e ida otra vez: sin errores');
}

/* ---- 3. Validación del servidor ---- */
{
  const v = (a, b) => D.validarEmpleado(a, b);
  v(null, {puesto: 'Producción', area: 'Cocina', turno: 'Diurno'}); v(null, {puesto: 'Logística', area: 'Despacho / Choferes', turno: 'Nocturno'}); v(null, {puesto: 'Ventas', area: 'Ventas', turno: ''});
  for (const p of D.PUESTOS) for (const a of D.PUESTOS_AREAS[p]) v(null, {puesto: p, area: a});
  ok('se puede crear persona con cada puesto y cada área de la lista');
  rechazaSync(() => v(null, {puesto: 'Ventas', area: 'Cocina'}), /puesto y su área/); rechazaSync(() => v(null, {puesto: 'Producción', area: 'Empaque'}), /puesto y su área/);
  rechazaSync(() => v(null, {puesto: 'Administración', area: 'Administración y ventas'}), /puesto y su área/); rechazaSync(() => v(null, {area: 'Administración y ventas'}), /puesto y su área/); rechazaSync(() => v(null, {area: 'Inventada'}), /puesto y su área/);
  rechazaSync(() => v(null, {puesto: 'Producción', area: 'Sin definir'}), /puesto y su área/);
  ok('el área vieja «Administración y ventas», un área de otro puesto o «Sin definir» nuevo se rechazan');
  rechazaSync(() => v(null, {puesto: 'Administración', area: 'Administración', turno: 'Diurno'}), /solo para el personal de planta/); rechazaSync(() => v(null, {puesto: 'Gerencia', area: 'Directiva', turno: 'Nocturno'}), /solo para el personal de planta/);
  rechazaSync(() => v({puesto: 'Producción', area: 'Cocina', turno: 'Diurno'}, {puesto: 'Recursos humanos', area: 'Recursos humanos', turno: 'Diurno'}), /solo para el personal de planta/);
  ok('turno Diurno/Nocturno solo con puestos de planta (Gerencia, Administración, Ventas y Recursos humanos se rechazan)');
  v({puesto: 'Producción', area: 'Sin definir'}, {puesto: 'Producción', area: 'Sin definir', retiro: 'pend'}); v({area: 'Administración y ventas', turno: 'Diurno'}, {area: 'Administración y ventas', turno: 'Diurno', arch: true});
  ok('lo ya guardado no se rompe: se puede archivar o pedir retiro sin tocar el área ni el turno viejos');
}

/* ---- 4. Reglas de planta, «activo hoy» ---- */
{
  const e = (puesto, area, extra) => ({puesto, area, ...extra});
  for (const [p, a] of [['Gerencia', 'Directiva'], ['Administración', 'Administración'], ['Ventas', 'Ventas'], ['Recursos humanos', 'Recursos humanos']]) assert.equal(D.esPlanta(e(p, a)), false);
  for (const [p, a] of [['Producción', 'Cocina'], ['Producción', 'Mantenimiento'], ['Logística', 'Almacén'], ['Logística', 'Empaque']]) assert.equal(D.esPlanta(e(p, a)), true);
  assert.equal(D.esPlanta({area: 'Administración y ventas'}), false); assert.equal(D.esPlanta({area: 'Empaque'}), true); ok('planta = puestos Producción y Logística (incluida Mantenimiento); oficina queda fuera, también con datos viejos');
  assert.equal(D.cuentaEnPlanta(e('Administración', 'Administración')), false); assert.equal(D.cuentaEnPlanta(e('Ventas', 'Ventas')), false); assert.equal(D.cuentaEnPlanta({area: 'Administración y ventas'}), false);
  assert.equal(D.cuentaEnPlanta(e('Logística', 'Despacho / Choferes')), false); assert.equal(D.cuentaEnPlanta(e('Producción', 'Cocina', {cargo: 'Chofer'})), false);
  assert.equal(D.cuentaEnPlanta(e('Gerencia', 'Directiva')), true); assert.equal(D.cuentaEnPlanta(e('Recursos humanos', 'Recursos humanos')), true); assert.equal(D.cuentaEnPlanta(e('Producción', 'Fritura')), true);
  ok('«Personal activo hoy»: sin choferes, Administración ni Ventas; Gerencia y Recursos humanos sí cuentan (duda abierta del dueño)');
}

/* ---- 5. Grupos solo con planta + aviso de revisión (con base en memoria) ---- */
{
  const db = crearDB(), raw = db.raw, put = (id, e) => raw.prepare("INSERT INTO docs (col, id, data, updated) VALUES ('empleados', ?, ?, 1)").run(id, JSON.stringify({id, n: 'Persona ' + id, estado: 'activo', ...e}));
  put('G1', {puesto: 'Producción', area: 'Cocina'}); put('G2', {puesto: 'Logística', area: 'Empaque'}); put('O1', {puesto: 'Administración', area: 'Administración'}); put('O2', {puesto: 'Ventas', area: 'Ventas', cargo: 'Vendedor'});
  const ctx = {db, rol: 'dueno'};
  await rechaza(GS.guardarMiembros(ctx, {grupo_id: 1, empleados: ['G1', 'O1']}), /solo para el personal de planta/, 409); await GS.guardarMiembros(ctx, {grupo_id: 1, empleados: ['G1', 'G2']});
  const g = await GS.grupos(ctx, null); assert.deepEqual(g.sin_grupo, []); assert.equal(g.grupos[0].miembros.length, 2); ok('un grupo de turno no acepta personal de oficina y la lista «sin grupo» solo trae planta');
  await rechaza(GS.excepcion(ctx, {semana: '2026-11-16', empleado_id: 'O1', grupo_id: 2}), /solo para el personal de planta/, 409); ok('mover a alguien de oficina de grupo se rechaza');
  /* aviso de revisión */
  raw.exec("INSERT INTO areas_respaldo VALUES ('O1', NULL, 'Administración y ventas', 'ventas', 0, 1)");
  put('P9', {puesto: 'Producción', area: 'Sin definir'});
  let r = await AS.revision(ctx); assert.deepEqual(r.personas.map(p => p.id).sort(), ['O1', 'P9']); assert.equal(r.total, 2);
  assert.equal((await AS.revision({db, rol: 'rrhh'})).total, 2); await rechaza(AS.revision({db, rol: 'ventas'}), /Solo Gerencia y Recursos humanos/, 403);
  ok('«Revisa estas personas»: salen quienes eran de Administración y ventas y quien quedó con área sin definir; lo ven Gerencia y Recursos humanos, no Ventas');
  await rechaza(AS.revisar(ctx, {empleado_id: 'P9', accion: 'quedarse'}), /Elige el área/, 400); await rechaza(AS.revisar(ctx, {empleado_id: 'P9', accion: 'asignar', puesto: 'Producción', area: 'Empaque'}), /puesto y su área/, 400);
  r = await AS.revisar(ctx, {empleado_id: 'P9', accion: 'asignar', puesto: 'Producción', area: 'Fritura'}); assert.equal(r.total, 1); assert.equal(JSON.parse(raw.prepare("SELECT data FROM docs WHERE id = 'P9'").get().data).area, 'Fritura');
  r = await AS.revisar(ctx, {empleado_id: 'O1', accion: 'ventas'}); assert.equal(r.total, 0); const o1 = JSON.parse(raw.prepare("SELECT data FROM docs WHERE id = 'O1'").get().data); assert.equal(o1.puesto, 'Ventas'); assert.equal(o1.area, 'Ventas');
  assert.equal(raw.prepare("SELECT revisada FROM areas_respaldo WHERE empleado_id = 'O1'").get().revisada, 1); assert.ok(raw.prepare("SELECT COUNT(*) c FROM auditoria_sistema WHERE ent = 'emp'").get().c >= 2); ok('reasignar a Ventas o elegir el área quita a la persona del aviso y queda en la auditoría');
  raw.exec("INSERT INTO areas_respaldo VALUES ('O2', NULL, 'Administración y ventas', 'ventas', 0, 1)"); put('O3', {puesto: 'Administración', area: 'Administración'}); raw.exec("INSERT INTO areas_respaldo VALUES ('O3', NULL, 'Administración y ventas', 'ventas', 0, 1)");
  r = await AS.revisar(ctx, {empleado_id: 'O3', accion: 'quedarse'}); assert.equal(r.total, 0); ok('«Se queda en Administración» confirma sin cambiar nada y no vuelve a salir');
  await rechaza(AS.revisar({db, rol: 'adm'}, {empleado_id: 'O3', accion: 'ventas'}), /Solo Gerencia y Recursos humanos/, 403); ok('solo Gerencia y Recursos humanos reasignan');
}

console.log('\n' + n + ' pruebas de puestos y áreas pasaron.');
