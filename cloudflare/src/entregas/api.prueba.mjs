/* Pruebas por API de Entregas contra un `wrangler dev --local` ya encendido. SOLO LOCAL.
   Uso: node src/entregas/api.prueba.mjs http://localhost:8801     (necesita los datos de ejemplo cargados) */
import assert from 'node:assert/strict';
const B = process.argv[2] || 'http://localhost:8801';
if (!/^https?:\/\/(localhost|127\.0\.0\.1)/.test(B)) throw new Error('Solo se prueba en local.');
const JPG = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
const v = async (rol, m, p, b) => { const r = await fetch(B + '/api/v/entregas' + p, {method: m, headers: {'content-type': 'application/json', ...(rol ? {'x-rol': rol} : {})}, body: b ? JSON.stringify(b) : undefined}); let j = {}; try { j = await r.json(); } catch (e) { } return {s: r.status, j}; };
const c = async (tok, m, p, b) => { const r = await fetch(B + '/api/c/entregas' + p, {method: m, headers: {'content-type': 'application/json', ...(tok ? {'x-token': tok} : {})}, body: b ? JSON.stringify(b) : undefined}); let j = {}; try { j = await r.json(); } catch (e) { } return {s: r.status, j}; };
let n = 0; const ok = (cond, t) => { assert.ok(cond, t); n++; };

// Permisos y ajustes
ok((await v(null, 'GET', '/ajustes')).s === 401, 'sin rol = 401');
let a = await v('dueno', 'GET', '/ajustes'); ok(a.j.dias_tramo1 === 7 && a.j.dias_tramo2 === 21, 'días 7/21 como datos del dueño');
const aj0 = a.j; // se restaura al final
ok((await v('cobranza', 'PUT', '/ajustes', {dias_tramo1: 7, dias_tramo2: 21})).s === 403, 'solo el Dueño cambia ajustes');
ok((await v('dueno', 'PUT', '/ajustes', {dias_tramo1: 21, dias_tramo2: 7})).s === 400, 'tramo 2 debe ser mayor');
ok((await v('dueno', 'PUT', '/ajustes', {dias_tramo1: 7, dias_tramo2: 21, descuento1_pct: 150})).s === 400, 'porcentaje fuera de rango');
await v('dueno', 'PUT', '/ajustes', {dias_tramo1: 7, dias_tramo2: 21, descuento1_pct: '', descuento2_pct: '', recargo_mora_pct: ''});

// Sin verificar → subir foto
const sv = (await v('empaque', 'GET', '/sin-verificar')).j; ok(sv.length >= 3, 'hay documentos sin verificar');
const [d1, d2, d3] = sv; let pz = await v('cobranza', 'GET', '/plazos');
ok(pz.j.sin_verificar === sv.length, 'Cobranza ve el aviso de sin verificar'); ok(!pz.j.documentos.some(x => x.id_documento === d1.id_documento), 'sin foto el plazo no arranca');
ok((await v('ventas', 'POST', '/', {id_documento: d1.id_documento, foto: JPG})).s === 403, 'ventas no sube fotos');
ok((await v('empaque', 'POST', '/', {id_documento: d1.id_documento, foto: 'hola'})).s === 400, 'foto inválida');
ok((await v('empaque', 'POST', '/', {id_documento: d1.id_documento, foto: 'iVBORw0KGgo' + 'A'.repeat(300)})).s === 400, 'PNG rechazado');
ok((await v('empaque', 'POST', '/', {id_documento: d1.id_documento, foto: JPG, fecha_hora: new Date(Date.now() + 36e5).toISOString()})).s === 400, 'entrega futura rechazada');
ok((await v('empaque', 'POST', '/', {id_documento: 999999, foto: JPG})).s === 404, 'documento inexistente');
let up = await v('empaque', 'POST', '/', {id_documento: d1.id_documento, foto: JPG, mini: JPG}); ok(up.s === 201 && up.j.temporizador.estado === 'TRAMO1', 'subir foto arranca el tramo 1');
ok(up.j.temporizador.descuento_pct === null && up.j.temporizador.aviso, 'con ajustes vacíos no hay descuento y se avisa');
up = await v('empaque', 'POST', '/', {id_documento: d1.id_documento, foto: JPG, mini: JPG}); ok(up.s === 201, 'reemplazar una foto por confirmar');
ok((await v('empaque', 'POST', `/${(await v('dueno', 'GET', '/?estado=SUBIDA')).j.find(x => x.id_documento === d1.id_documento).id}/confirmar`, {})).s === 403, 'empaque no confirma');
const lista = (await v('dueno', 'GET', '/?estado=SUBIDA')).j, e1 = lista.find(x => x.id_documento === d1.id_documento); ok(e1 && !('foto' in e1), 'la lista no trae la foto');
ok((await v('jefeprod', 'POST', `/${e1.id}/confirmar`, {})).s === 200, 'jefeprod confirma');
ok((await v('empaque', 'POST', '/', {id_documento: d1.id_documento, foto: JPG})).s === 409, 'no se reemplaza una entrega confirmada');
ok((await v('jefeprod', 'POST', `/${e1.id}/rechazar`, {})).s === 400, 'rechazar pide motivo');
const f = await v('cobranza', 'GET', `/${e1.id}/foto`); ok(f.s === 200 && f.j.foto === JPG, 'ampliación entrega la foto');
const mi = await v('cobranza', 'GET', `/minis?ids=${e1.id}`); ok(mi.j[e1.id] === JPG, 'miniatura liviana');
// Hora real indicada: hace 8 días → tramo 2; hace 30 días (antes de emitir) → rechazado
const hace = d => new Date(Date.now() - d * 864e5).toISOString();
ok((await v('empaque', 'POST', '/', {id_documento: d2.id_documento, foto: JPG, fecha_hora: hace(30)})).s === 400, 'no puede ser anterior a la emisión');
// Descuentos cargados por el Dueño
await v('dueno', 'PUT', '/ajustes', {dias_tramo1: 7, dias_tramo2: 21, descuento1_pct: 5, descuento2_pct: 2, recargo_mora_pct: 3});
pz = await v('cobranza', 'GET', '/plazos'); const p1 = pz.j.documentos.find(x => x.id_documento === d1.id_documento);
ok(p1.estado === 'TRAMO1' && p1.descuento_pct === 5 && Math.abs(p1.pagar_hoy - p1.saldo * 0.95) < 0.02, 'tramo 1: 5 % y pagar hoy con descuento');
// Pruebas con fechas distintas (simulación de pago): integración con el motor
const liq = async fecha => (await v('cobranza', 'GET', `/documento/${d1.id_documento}/liquidacion?fecha=${fecha}`)).j;
const hoy = new Date(Date.now() - 4 * 36e5).toISOString().slice(0, 10), mas = d => new Date(Date.parse(hoy + 'T12:00:00Z') + d * 864e5).toISOString().slice(0, 10);
const L0 = await liq(hoy), L10 = await liq(mas(10)), L30 = await liq(mas(30));
ok(L0.temporizador.estado === 'TRAMO1' && L0.ajuste_aplicado, 'hoy: descuento A aplicado en la liquidación');
ok(L10.temporizador.estado === 'TRAMO2' && L10.ajuste_aplicado && L10.neto > L0.neto, 'a los 10 días: descuento B (menor)');
ok(L30.temporizador.estado === 'VENCIDA' && L30.neto > L10.neto, 'a los 30 días: vencida con recargo');
await v('dueno', 'PUT', '/ajustes', {dias_tramo1: 7, dias_tramo2: 21, descuento1_pct: '', descuento2_pct: '', recargo_mora_pct: ''});
const V0 = await liq(mas(30)); ok(V0.temporizador.estado === 'VENCIDA' && !V0.ajuste_aplicado && V0.neto === V0.neto_motor_actual, 'ajustes vacíos: vencida, sin recargo y el motor actual queda igual');
await v('dueno', 'PUT', '/ajustes', {dias_tramo1: 7, dias_tramo2: 21, descuento1_pct: 5, descuento2_pct: 2, recargo_mora_pct: 3});

// Portal del cliente
const cli = (await (await fetch(B + '/api/v/clientes?limite=500', {headers: {'x-rol': 'dueno'}})).json()), docs1 = await (await fetch(B + '/api/v/documentos/' + d1.id_documento, {headers: {'x-rol': 'dueno'}})).json();
const idCli = docs1.documento.id_cliente, otro = (await (await fetch(B + '/api/v/documentos/' + d3.id_documento, {headers: {'x-rol': 'dueno'}})).json()).documento.id_cliente;
const enlace = await (await fetch(B + `/api/v/portal/clientes/${idCli}/enlace`, {method: 'POST', headers: {'x-rol': 'dueno', 'content-type': 'application/json'}, body: '{}'})).json(); const tok = enlace.codigo || enlace.token; ok(tok, 'enlace de prueba generado');
ok((await c(null, 'GET', '/estado')).s === 401, 'sin código = 401'); ok((await c('x'.repeat(43), 'GET', '/estado')).s === 401, 'código inválido = 401');
const est = await c(tok, 'GET', '/estado'); ok(est.s === 200, 'portal: estado'); const dd = est.j.documentos.find(x => x.id_documento === d1.id_documento);
ok(dd && dd.temporizador.estado === 'TRAMO1' && dd.temporizador.restante_ms > 6.9 * 864e5 && dd.pagar.descuento_aplicado, 'portal: cuenta regresiva y descuento vigente');
ok(dd.pagar.hoy_usd < dd.pagar.normal_usd, 'portal: cuánto pagar hoy con descuento'); console.log('   tasa para Bs:', JSON.stringify(est.j.tasa), 'hoy_bs:', dd.pagar.hoy_bs);
ok(est.j.documentos.every(x => !('id_cliente' in x)), 'el portal no expone ids de cliente');
if (otro !== idCli) { ok((await c(tok, 'POST', '/no-recibi', {id_documento: d3.id_documento})).s === 404, 'no se puede reclamar un documento de otro cliente'); }
const nr = await c(tok, 'POST', '/no-recibi', {id_documento: d1.id_documento, nota: 'No llegó la mercancía'}); ok(nr.s === 201, 'no recibí esto crea el reclamo');
ok((await c(tok, 'POST', '/no-recibi', {id_documento: d1.id_documento})).s === 409, 'reclamo repetido = 409');
const est2 = await c(tok, 'GET', '/estado'); const d1b = est2.j.documentos.find(x => x.id_documento === d1.id_documento); ok(d1b.temporizador.estado === 'PAUSADA' && d1b.reclamo, 'el temporizador queda en pausa');
pz = await v('cobranza', 'GET', '/plazos'); ok(pz.j.resumen.pausadas >= 1, 'Cobranza ve el plazo en pausa');
const ds = (await v('cobranza', 'GET', '/disputas?estado=ABIERTA')).j, disp = ds.find(x => x.id_documento === d1.id_documento); ok(disp, 'Cobranza ve el reclamo');
ok((await v('ventas', 'POST', `/disputas/${disp.id}/resolver`, {resolucion: 'ENTREGA_VALIDA', nota: 'ok'})).s === 403, 'ventas no resuelve');
ok((await v('cobranza', 'POST', `/disputas/${disp.id}/resolver`, {resolucion: 'ENTREGA_VALIDA'})).s === 400, 'resolver pide nota');
ok((await v('cobranza', 'POST', `/disputas/${disp.id}/resolver`, {resolucion: 'ENTREGA_VALIDA', nota: 'Confirmado con el transportista'})).s === 200, 'resolver: la entrega era válida');
const est3 = await c(tok, 'GET', '/estado'); const d1c = est3.j.documentos.find(x => x.id_documento === d1.id_documento); ok(d1c.temporizador.estado === 'TRAMO1' && !d1c.reclamo, 'el plazo se reanuda');
// Resolver como «no entregada» deja la entrega sin verificar
const e2 = await v('empaque', 'POST', '/', {id_documento: d2.id_documento, foto: JPG}); ok(e2.s === 201, 'foto del segundo documento');
const idCli2 = (await (await fetch(B + '/api/v/documentos/' + d2.id_documento, {headers: {'x-rol': 'dueno'}})).json()).documento.id_cliente;
const en2 = await (await fetch(B + `/api/v/portal/clientes/${idCli2}/enlace`, {method: 'POST', headers: {'x-rol': 'dueno', 'content-type': 'application/json'}, body: '{}'})).json();
ok((await c(en2.codigo || en2.token, 'POST', '/no-recibi', {id_documento: d2.id_documento})).s === 201, 'segundo reclamo');
const disp2 = (await v('dueno', 'GET', '/disputas?estado=ABIERTA')).j.find(x => x.id_documento === d2.id_documento);
ok((await v('cobranza', 'POST', `/disputas/${disp2.id}/resolver`, {resolucion: 'NO_ENTREGADA', nota: 'El transporte no entregó'})).s === 200, 'resolver: no se entregó');
ok((await v('empaque', 'GET', '/sin-verificar')).j.some(x => x.id_documento === d2.id_documento), 'vuelve a «entrega sin verificar»');
// Restaurar ajustes y dejar limpio lo de prueba
await v('dueno', 'PUT', '/ajustes', {dias_tramo1: aj0.dias_tramo1, dias_tramo2: aj0.dias_tramo2, descuento1_pct: aj0.descuento1_pct, descuento2_pct: aj0.descuento2_pct, recargo_mora_pct: aj0.recargo_mora_pct});
console.log(`API de entregas: ${n} comprobaciones pasan.`);
