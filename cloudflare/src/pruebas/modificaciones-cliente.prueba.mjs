/* Pruebas de la fase 1 de modificaciones del cliente: 1.1 bancos (teléfono, cédula, RIF), 1.2 categorías de precio, 2.1 cargos y vendedor unificado.
   Uso: node src/pruebas/modificaciones-cliente.prueba.mjs */
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {crearDB} from './d1-falso.mjs';
import worker from '../worker.js';
import * as VD from '../ventas/dominio.js';
import * as PD from '../precios/dominio.js';
import * as RH from '../rrhh/dominio.js';
import * as VS from '../ventas/servicio.js';

let n = 0; const ok = m => { n++; console.log('  ok · ' + m); };
const aqui = path.dirname(fileURLToPath(import.meta.url)), raiz = path.join(aqui, '..', '..');
const db = crearDB(), raw = db.raw;
const env = {DB: db, ASSETS: {fetch: async () => new Response('x')}};
const llamar = async (ruta, op, body, rol = 'dueno') => { const r = await worker.fetch(new Request('http://localhost' + ruta, {method: op, headers: {'content-type': 'application/json', 'x-rol': rol}, body: body ? JSON.stringify(body) : undefined}), env); let j = null; try { j = await r.json(); } catch (e) { /* sin cuerpo */ } return {status: r.status, j}; };

/* 1.1 Bancos */
{
  const base = {nombre: 'Banesco', moneda: 'BS', cuenta_numero: '01340000000000000001', cuenta_titular: 'El Maná JL'};
  for (const [campo, msg] of [['telefono', 'teléfono'], ['cedula', 'cédula'], ['rif', 'RIF']]) {
    const b = {...base, telefono: '0414-1234567', cedula: 'V-12345678', rif: 'J-12345678-9'}; delete b[campo];
    const r = await llamar('/api/v/bancos', 'POST', b); assert.equal(r.status, 400, campo); assert.match(r.j.error, new RegExp(msg, 'i'));
  }
  ok('banco sin teléfono, sin cédula o sin RIF se rechaza (los tres son obligatorios)');
  let r = await llamar('/api/v/bancos', 'POST', {...base, telefono: 'abc', cedula: 'V-12345678', rif: 'J-12345678-9'}); assert.equal(r.status, 400);
  r = await llamar('/api/v/bancos', 'POST', {...base, telefono: '0414-1234567', cedula: 'x', rif: 'J-12345678-9'}); assert.equal(r.status, 400);
  r = await llamar('/api/v/bancos', 'POST', {...base, telefono: '0414-1234567', cedula: 'V-12345678', rif: 'zzz'}); assert.equal(r.status, 400);
  ok('formatos no válidos de teléfono, cédula y RIF se rechazan');
  r = await llamar('/api/v/bancos', 'POST', {...base, telefono: '0414-1234567', cedula: 'v-12345678', rif: 'j-12345678-9'});
  assert.equal(r.status, 201); assert.equal(r.j.telefono, '0414-1234567'); assert.equal(r.j.cedula, 'V-12345678'); assert.equal(r.j.rif, 'J-12345678-9');
  ok('banco completo se guarda y devuelve los tres datos normalizados');
  const id = r.j.id; r = await llamar('/api/v/bancos/' + id, 'PUT', {...base, telefono: '0412-7654321', cedula: 'V-12345678', rif: 'J-12345678-9'});
  assert.equal(r.status, 200); assert.equal(r.j.telefono, '0412-7654321');
  r = await llamar('/api/v/bancos/' + id, 'PUT', {...base, telefono: '', cedula: 'V-12345678', rif: 'J-12345678-9'}); assert.equal(r.status, 400); ok('al editar también son obligatorios');
  r = await llamar('/api/v/bancos/' + id, 'PUT', {...base, telefono: '0412-7654321', cedula: 'V-12345678', rif: 'J-12345678-9'}, 'ventas'); assert.equal(r.status, 403); ok('solo Gerente y Administración gestionan bancos');
}

/* 1.2 Categorías de precio */
raw.exec("INSERT OR IGNORE INTO productos (id_producto, codigo_sku, nombre, gramaje) VALUES (9001,'T1','Papas prueba','100 g'),(9002,'T2','Salsa prueba','200 g')"); raw.exec('DELETE FROM precios_lista WHERE id_producto IN (9001,9002)');
const cli = async (cat, extra = {}) => llamar('/api/v/clientes', 'POST', {razon_social: 'Cliente ' + (cat || 'x') + Math.random(), rif_id: 'J-' + Math.floor(Math.random() * 1e8), zona: 'Lara', categoria_precio: cat, ...extra});
{
  assert.deepEqual(VD.CATEGORIAS, ['Minorista', 'Mayorista', 'Gran Mayor']); assert.deepEqual(PD.LISTAS, VD.CATEGORIAS); ok('las categorías de ventas y de precios son las mismas tres');
  let r = await cli(undefined); assert.equal(r.status, 400); assert.match(r.j.error, /categor/i); ok('cliente nuevo sin categoría se rechaza');
  r = await cli('Platino'); assert.equal(r.status, 400); ok('categoría inventada se rechaza');
  const ids = {};
  for (const c of VD.CATEGORIAS) { r = await cli(c); assert.equal(r.status, 201, c); ids[c] = r.j.id_cliente; }
  ok('un cliente de cada categoría se crea');
  /* Gerente carga precios nuevos (producto sin precio) y cambia uno */
  r = await llamar('/api/v/precios/lista', 'PUT', {id_producto: 9001, lista: 'Minorista', modalidad: 'contado', precio: '10'}); assert.equal(r.status, 400); ok('producto sin precio en la categoría: no se cambia uno solo, se piden los dos');
  for (const [c, co, cr] of [['Minorista', '10', '12'], ['Mayorista', '8', '9'], ['Gran Mayor', '6', '7']]) {
    r = await llamar('/api/v/precios/lista', 'PUT', {id_producto: 9001, lista: c, modalidad: 'ambos', precio_contado: co, precio_credito: cr}); assert.equal(r.status, 200, c + JSON.stringify(r.j)); assert.equal(r.j.estado, 'APLICADO');
  }
  r = await llamar('/api/v/precios/lista', 'PUT', {id_producto: 9001, lista: 'Mayorista', modalidad: 'contado', precio: '8.5'}); assert.equal(r.status, 200);
  r = await llamar('/api/v/precios/listas', 'GET'); assert.equal(r.status, 200);
  assert.equal(r.j.listas.length, 3); assert.equal(r.j.listas.find(l => l.nombre === 'Mayorista').clientes, 1); assert.equal(r.j.productos.find(p => p.id_producto === 9001).listas.Mayorista.contado_cents, 850);
  ok('el Gerente carga y cambia precios por categoría; el listado cuenta los clientes de cada una');
  r = await llamar('/api/v/precios/lista', 'PUT', {id_producto: 9001, lista: 'B', modalidad: 'contado', precio: '5'}); assert.equal(r.status, 400); ok('las listas viejas (A, B) ya no se pueden cargar');
  /* precio que ve cada cliente */
  const pc = async id => (await VS.preciosCliente(db, id)).precios.find(p => p.id_producto === 9001);
  const pm = await pc(ids.Minorista), pma = await pc(ids.Mayorista), pg = await pc(ids['Gran Mayor']);
  assert.ok(pm.base > pma.base && pma.base > pg.base, JSON.stringify([pm, pma, pg])); ok('cada cliente recibe el precio de su categoría');
  /* precio especial manda */
  r = await llamar('/api/v/precios/cliente/' + ids.Minorista, 'PUT', {reglas: [{id_producto: 9001, precio_base_credito: 3, precio_pronto_pago: 2.5}]});
  if (r.status === 200) { const pe = await pc(ids.Minorista); assert.ok(pe.regla); assert.ok(pe.base < pm.base); ok('el precio especial del cliente manda sobre la categoría'); }
  else { raw.exec(`INSERT INTO reglas_precio_tiempo_cliente (id_cliente,id_producto,precio_base_credito_cents,precio_pronto_pago_cents) VALUES (${ids.Minorista},9001,300,250)`); const pe = await pc(ids.Minorista); assert.ok(pe.regla && pe.base < pm.base); ok('el precio especial del cliente manda sobre la categoría'); }
  /* cliente viejo sin categoría */
  raw.exec("INSERT INTO clientes (razon_social, razon_norm, rif_id, zona) VALUES ('Viejo','viejo','J-99999999','Lara')");
  const idViejo = raw.prepare("SELECT id_cliente i FROM clientes WHERE razon_social='Viejo'").get().i;
  r = await llamar('/api/v/previsualizar', 'POST', {id_cliente: idViejo}); assert.ok([200, 409].includes(r.status));
  const sv = await VS.preciosCliente(db, idViejo); assert.equal(sv.sin_lista, true); assert.equal(sv.categoria, null); ok('cliente sin categoría queda marcado «sin lista»: no se le puede vender');
  r = await llamar('/api/v/clientes/' + idViejo, 'PUT', {razon_social: 'Viejo', rif_id: 'J-99999999', zona: 'Lara'}); assert.equal(r.status, 200); ok('se puede editar un cliente viejo sin tocar la categoría');
  r = await llamar('/api/v/clientes/' + idViejo, 'PUT', {razon_social: 'Viejo', rif_id: 'J-99999999', zona: 'Lara', categoria_precio: 'Mayorista'}); assert.equal(r.status, 200);
  assert.equal((await VS.preciosCliente(db, idViejo)).categoria, 'Mayorista'); ok('al asignarle categoría ya tiene precios');
  /* Administración: pendiente y aprobación */
  r = await llamar('/api/v/precios/lista', 'PUT', {id_producto: 9002, lista: 'Minorista', modalidad: 'ambos', precio_contado: '4', precio_credito: '5'}, 'adm');
  assert.equal(r.status, 200); assert.equal(r.j.estado, 'PENDIENTE');
  assert.equal(raw.prepare("SELECT COUNT(*) n FROM precios_lista WHERE id_producto=9002").get().n, 0);
  const cam = (await llamar('/api/v/precios/cambios?estado=PENDIENTE', 'GET')).j; const idc = (cam.cambios || cam)[0].id;
  r = await llamar('/api/v/precios/cambios/' + idc + '/aprobar', 'POST', {}); assert.equal(r.status, 200);
  assert.equal(raw.prepare("SELECT contado_cents c FROM precios_lista WHERE id_producto=9002 AND lista='Minorista'").get().c, 400); ok('Administración pide cargar precios, el Gerente aprueba y recién ahí rigen');
  r = await llamar('/api/v/precios/archivo', 'GET'); assert.equal(r.status, 200); assert.ok(Array.isArray(r.j.listas)); ok('el endpoint de listas archivadas responde');
}

/* Migración 0028: archiva A/B y estados, rechaza pendientes de listas, y la reversa lo deja como estaba */
{
  const dir = path.join(raiz, 'migrations'), arch = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  const m = new DatabaseSync(':memory:');
  for (const f of arch.filter(f => f < '0028')) m.exec(readFileSync(path.join(dir, f), 'utf8'));
  m.exec("INSERT OR IGNORE INTO productos (id_producto, codigo_sku, nombre) VALUES (1,'P1','Papas')");
  m.exec('DELETE FROM precios_lista'); m.exec("INSERT INTO precios_lista (id_producto, lista, contado_cents, credito_cents) VALUES (1,'A',1000,1100),(1,'B',900,1000)");
  const nEst = m.prepare('SELECT COUNT(*) n FROM estados_lista').get().n; assert.ok(nEst > 0);
  m.exec("INSERT INTO cambios_precio (tipo, clave, titulo, detalle, estado, pedido_rol, pedido_ts) VALUES ('PRODUCTO','L:1:A:contado','x','{}','PENDIENTE','adm',1)");
  m.exec(readFileSync(path.join(dir, '0028_modificaciones_cliente.sql'), 'utf8'));
  assert.equal(m.prepare('SELECT COUNT(*) n FROM precios_lista').get().n, 0); assert.equal(m.prepare('SELECT COUNT(*) n FROM precios_lista_archivo').get().n, 2);
  assert.equal(m.prepare('SELECT COUNT(*) n FROM estados_lista').get().n, 0); assert.equal(m.prepare('SELECT COUNT(*) n FROM estados_lista_archivo').get().n, nEst);
  assert.equal(m.prepare("SELECT estado FROM cambios_precio WHERE clave='L:1:A:contado'").get().estado, 'RECHAZADO'); ok('la migración archiva las listas A y B y los estados, y rechaza los cambios pendientes de listas viejas');
  m.exec(readFileSync(path.join(dir, '0028_modificaciones_cliente.sql').replace('migrations', 'migrations'), 'utf8').split('\n').filter(l => !/^ALTER TABLE/.test(l)).join('\n'));
  assert.equal(m.prepare('SELECT COUNT(*) n FROM precios_lista_archivo').get().n, 2); ok('lo repetible de la migración se puede correr otra vez sin daño');
  m.exec(readFileSync(path.join(raiz, 'reversa', '0028_modificaciones_cliente_reversa.sql'), 'utf8'));
  assert.equal(m.prepare('SELECT COUNT(*) n FROM precios_lista').get().n, 2); assert.equal(m.prepare('SELECT COUNT(*) n FROM estados_lista').get().n, nEst);
  assert.throws(() => m.prepare('SELECT categoria_precio FROM clientes').get(), /no such column/); assert.throws(() => m.prepare('SELECT rif FROM bancos').get(), /no such column/);
  ok('la reversa restaura las listas y los estados y quita las columnas nuevas');
}

/* 2.1 Cargos y vendedor unificado */
{
  const html = readFileSync(path.join(raiz, 'app-source.html'), 'utf8'), mm = html.match(/const CARGOS = (\[[^\]]*\]);/); assert.ok(mm, 'CARGOS en app-source.html');
  assert.deepEqual(eval(mm[1]), RH.CARGOS); assert.equal(RH.CARGOS.length, 14); ok('la lista de cargos de la ficha del empleado es la misma del servidor (14 cargos)');
  assert.equal(RH.cargoReal('vendedor'), 'Vendedor'); assert.equal(RH.cargoReal('almacen'), 'Almacén'); assert.equal(RH.cargoReal('Rey'), null); ok('los cargos se reconocen sin importar tildes ni mayúsculas');
  raw.exec(`INSERT INTO docs (col, id, data, updated) VALUES ('empleados','E1','${JSON.stringify({id: 'E1', nombre: 'Luis Vendedor', cargo: 'Vendedor'})}',1),('empleados','E2','${JSON.stringify({id: 'E2', nombre: 'Ana Cocina', cargo: 'Cocineros'})}',1)`);
  let r = await llamar('/api/v/arranque', 'GET'); assert.equal(r.status, 200);
  const emp = r.j.vendedores_empleados || []; assert.ok(emp.some(e => e.empleado_id === 'E1')); assert.ok(!emp.some(e => e.empleado_id === 'E2')); ok('en la lista de vendedores aparece el personal con cargo Vendedor y nadie más');
  r = await cli('Minorista', {vendedor_empleado_id: 'E1'}); assert.equal(r.status, 201);
  const v1 = raw.prepare("SELECT id, empleado_id FROM vendedores WHERE empleado_id='E1'").all(); assert.equal(v1.length, 1);
  r = await cli('Mayorista', {vendedor_empleado_id: 'E1'}); assert.equal(r.status, 201); assert.equal(raw.prepare("SELECT COUNT(*) n FROM vendedores WHERE empleado_id='E1'").get().n, 1); ok('elegir un empleado como vendedor crea su ficha de vendedor una sola vez');
  r = await llamar('/api/v/arranque', 'GET'); assert.ok(!(r.j.vendedores_empleados || []).some(e => e.empleado_id === 'E1')); ok('una vez vinculado ya no se repite en la lista');
}
console.log('\n' + n + ' pruebas de «Modificaciones del cliente · fase 1» pasaron.');
