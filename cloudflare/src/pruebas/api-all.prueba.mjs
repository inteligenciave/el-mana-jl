/* Pruebas del acceso por puesto a las colecciones generales (/api/all, /api/batch, /api/c/*).
   Cierran el hueco de que cualquier puesto leyera empleados con cédula y tarifa, pagos, cuentas por pagar, etc.
   Uso: node src/pruebas/api-all.prueba.mjs */
import assert from 'node:assert/strict';
import {crearDB} from './d1-falso.mjs';
import worker from '../worker.js';
import {conservarOcultos} from '../acceso.js';

let n = 0; const ok = m => { n++; console.log('  ok · ' + m); };
const db = crearDB(), raw = db.raw;
const env = {DB: db, ASSETS: {fetch: async () => new Response('x')}};
const llamar = (ruta, op = 'GET', body, rol) => worker.fetch(new Request('http://localhost' + ruta, {method: op, headers: {'content-type': 'application/json', ...(rol ? {'x-rol': rol} : {})}, body: body ? JSON.stringify(body) : undefined}), env, {waitUntil() {}});
const poner = (col, id, d) => raw.prepare('INSERT INTO docs (col, id, data, updated) VALUES (?,?,?,?)').run(col, id, JSON.stringify({...d, id}), Date.now());
const todo = async rol => (await llamar('/api/all', 'GET', null, rol)).json();
const PUESTOS = ['dueno', 'adm', 'produccion', 'empaque', 'ventas', 'rrhh'];

poner('empleados', 'E1', {n: 'Ana', area: 'Empaque', cargo: 'Operaria', cedula: 'V-12345678', tel: '0414-5551234', tarifa: 9.5, pago: 'Pago movil', turno: 'Diurno', codigo_lector: '101'});
poner('cxp', 'CXP-1', {compraId: 'C-1', total: 500});
poner('pagos', 'PG-1', {cxpId: 'CXP-1', monto: 100});
poner('compras', 'C-1', {item: 'Papa', qf: 100, pu: 0.4});
poner('prestamos', 'PR-1', {emp: 'E1', monto: 50});
poner('caja_gastos', 'G-1', {monto: 20});
poner('asistencia', 'A-1', {emp: 'E1', bonos: 5});
poner('clientes', 'CL-1', {nombre: 'Tienda', credito: 100});
poner('gestion', 'GE-1', {items: []});
poner('proveedores', 'P1', {nombre: 'Prov', hist: 0.41, cond: 'Contado'});
poner('ajustes', 'politicas', {tolRec: 2, nomJornada: 10, nomRecargo: 0, nomLey: 0});
poner('lotes', 'L-1', {cruda: 100});
poner('cosa_nueva', 'X1', {secreto: 1});

/* 1. Sin puesto o con un puesto que no existe */
{
  for (const [ruta, op, b] of [['/api/all', 'GET'], ['/api/c/empleados', 'GET'], ['/api/c/cxp', 'GET'], ['/api/c/cxp/CXP-1', 'GET'], ['/api/batch', 'POST', {ops: []}]]) {
    const r = await llamar(ruta, op, b); assert.equal(r.status, 403, ruta);
    const r2 = await llamar(ruta, op, b, 'hacker'); assert.equal(r2.status, 403, ruta + ' con puesto falso');
  }
  ok('sin puesto o con un puesto inventado: 403 en todas las rutas generales');
}

/* 2. Gerencia ve todo */
{
  const j = await todo('dueno'), e = j.cols.empleados[0];
  assert.equal(e.cedula, 'V-12345678'); assert.equal(e.tarifa, 9.5); assert.equal(e.tel, '0414-5551234');
  for (const c of ['cxp', 'pagos', 'compras', 'prestamos', 'caja_gastos', 'asistencia', 'clientes', 'gestion', 'lotes']) assert.ok(j.cols[c].length === 1, c);
  assert.equal(j.cols.proveedores[0].hist, 0.41); assert.equal(j.cols.ajustes.find(a => a.id === 'politicas').nomJornada, 10);
  assert.ok(j.cols.cosa_nueva.length === 1); ok('Gerencia ve todo, incluida una coleccion nueva');
}

/* 3. Empleados: solo Recursos humanos y Gerencia ven cédula, teléfono y tarifa */
{
  for (const rol of PUESTOS) {
    const e = (await todo(rol)).cols.empleados[0], completo = ['dueno', 'rrhh'].includes(rol);
    assert.equal('cedula' in e, completo, rol); assert.equal('tel' in e, completo, rol); assert.equal('tarifa' in e, completo, rol); assert.equal('pago' in e, completo, rol);
    assert.equal(e.n, 'Ana');   // el nombre sí lo ven todos
    const u = await (await llamar('/api/c/empleados/E1', 'GET', null, rol)).json(); assert.equal('cedula' in u, completo, rol + ' (uno solo)');
    const l = await (await llamar('/api/c/empleados', 'GET', null, rol)).json(); assert.equal('tarifa' in l[0], completo, rol + ' (lista)');
  }
  const p = (await todo('produccion')).cols.empleados[0]; assert.equal(p.codigo_lector, '101'); assert.equal(p.turno, 'Diurno');
  ok('empleados: cedula, telefono, tarifa y forma de pago solo para Gerencia y Recursos humanos; Produccion recibe nombre, codigo y turno');
}

/* 4. Dinero: cada colección solo para los puestos que la necesitan */
{
  const QUIEN = {cxp: ['dueno', 'adm'], pagos: ['dueno', 'adm'], prestamos: ['dueno', 'adm', 'rrhh'], caja_gastos: ['dueno', 'adm'], asistencia: ['dueno', 'rrhh'],
    clientes: ['dueno', 'adm', 'ventas'], gestion: ['dueno', 'adm', 'ventas'], compras: ['dueno', 'adm']};
  for (const rol of PUESTOS) {
    const j = await todo(rol);
    for (const [c, ok_] of Object.entries(QUIEN)) assert.equal(j.cols[c].length, ok_.includes(rol) ? 1 : 0, `${c} para ${rol}`);
    assert.equal((j.cols.cosa_nueva || []).length, rol === 'dueno' ? 1 : 0, 'coleccion desconocida para ' + rol);
    const l = await llamar('/api/c/cxp', 'GET', null, rol), d = await llamar('/api/c/cxp/CXP-1', 'GET', null, rol);
    if (['dueno', 'adm'].includes(rol)) { assert.equal(d.status, 200); } else { assert.equal(d.status, 403, 'cxp suelto para ' + rol); assert.deepEqual(await l.json(), [], 'cxp lista para ' + rol); }
  }
  ok('cuentas por pagar, pagos, caja, prestamos, asistencia, clientes y gestion: solo los puestos que las ven en su pantalla');
}

/* 5. Datos de pago de nómina y precio de proveedor ocultos a quien no los usa */
{
  for (const rol of PUESTOS) {
    const j = await todo(rol), pol = j.cols.ajustes.find(a => a.id === 'politicas'), pv = j.cols.proveedores[0];
    const ve = ['dueno', 'adm', 'rrhh'].includes(rol); assert.equal('nomJornada' in pol, ve, 'nomina ' + rol); assert.equal(pol.tolRec, 2);
    assert.equal('hist' in pv, ['dueno', 'adm'].includes(rol), 'precio proveedor ' + rol);
  }
  ok('valor de la hora de nomina y precio historico de proveedor: solo Gerencia, Administracion (y Recursos humanos la nomina)');
}

/* 6. Escritura separada de la lectura */
{
  const ESCRIBE = {cxp: ['dueno', 'adm'], pagos: ['dueno', 'adm'], compras: ['dueno', 'adm'], lotes: ['dueno', 'produccion', 'empaque'], empleados: ['dueno', 'rrhh'], caja_gastos: ['dueno', 'adm'], despachos: ['dueno', 'produccion', 'empaque']};
  for (const rol of PUESTOS) for (const [c, quien] of Object.entries(ESCRIBE)) {
    const r = await llamar('/api/batch', 'POST', {ops: [{op: 'set', c, id: 'T-' + rol, d: c === 'empleados' ? {n: 'Prueba'} : {a: 1}}]}, rol);
    assert.equal(r.status !== 403, quien.includes(rol), `${rol} escribe ${c}: ${r.status}`);   // empleados tiene sus propias validaciones (400): lo que importa es que no sea 403
  }
  const r = await llamar('/api/c/cxp/CXP-1', 'PUT', {total: 1}, 'produccion'); assert.equal(r.status, 403);
  const r2 = await llamar('/api/c/pagos/PG-1?motivo=prueba', 'DELETE', null, 'ventas'); assert.equal(r2.status, 403);
  ok('escribir tambien exige el puesto correcto (por lote, por documento y al borrar)');
}

/* 7. Un puesto que no ve un campo no lo pierde ni lo cambia al guardar */
{
  const ant = {id: 'politicas', tolRec: 2, nomJornada: 10, nomRecargo: 1, nomLey: 0};
  const g = conservarOcultos('produccion', 'ajustes', {id: 'politicas', tolRec: 5, nomJornada: 999}, ant);
  assert.equal(g.tolRec, 5); assert.equal(g.nomJornada, 10); assert.equal(g.nomRecargo, 1);
  assert.equal(conservarOcultos('adm', 'ajustes', {id: 'politicas', nomJornada: 12}, ant).nomJornada, 12);
  const p = conservarOcultos('empaque', 'proveedores', {id: 'P1', nombre: 'X'}, {id: 'P1', nombre: 'Y', hist: 0.41});
  assert.equal(p.hist, 0.41);
  /* y por la ruta real: Produccion no puede cambiar reglas de nomina ni siquiera con el documento recortado */
  const r = await llamar('/api/c/ajustes/politicas', 'PUT', {tolRec: 5}, 'produccion'); assert.equal(r.status, 403);
  assert.equal((await todo('dueno')).cols.ajustes.find(a => a.id === 'politicas').nomJornada, 10);
  ok('lo que un puesto no ve no se pierde ni se cambia al guardar');
}

/* 8. Solo Gerencia y Administración ven compras (precios) */
{
  assert.equal((await todo('ventas')).cols.compras.length, 0); assert.equal((await todo('rrhh')).cols.compras.length, 0);
  assert.equal((await todo('produccion')).cols.compras.length, 0); assert.equal((await todo('empaque')).cols.compras.length, 0);
  ok('compras: solo las ven Gerencia y Administración');
}

/* 9. Producción y Logística no ven costos: la merma se valora en el servidor y no se les devuelve */
{
  poner('compras', 'C-2', {item: 'Papa', qf: 100, pu: 0.5, kgRec: 100, rec: 'REC-2'});
  poner('ajustes', 'politicas2', {});
  const r = await llamar('/api/batch', 'POST', {ops: [{op: 'set', c: 'mermas', id: 'MR-1', d: {etapa: 'pelado', rec: 'REC-2', cant: 10, un: 'kg', kg: 10, usd: 999}}]}, 'produccion');
  assert.equal(r.status, 200);
  const g = JSON.parse(raw.prepare("SELECT data FROM docs WHERE col='mermas' AND id='MR-1'").get().data); assert.equal(g.usd, 5);   // 10 kg × 0,5 $/kg, no lo que mandó el navegador
  assert.equal((await todo('produccion')).cols.mermas.find(m => m.id === 'MR-1').usd, undefined);
  assert.equal((await todo('empaque')).cols.mermas.find(m => m.id === 'MR-1').usd, undefined);
  assert.equal((await todo('dueno')).cols.mermas.find(m => m.id === 'MR-1').usd, 5);
  ok('mermas: el costo lo calcula el servidor y Producción y Logística no lo reciben');
}

console.log(`\n${n} pruebas de acceso por puesto: todo bien`);
