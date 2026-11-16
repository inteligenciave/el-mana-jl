/* Entregas · casos de uso: foto de entrega, temporizador, ajustes, reclamos «no recibí esto» y datos para el portal del cliente. No conoce HTTP. */
import * as E from './dominio.js';
import * as R from './repo.js';
import {entPuede, nomRol} from './permisos.js';
import {ROL_TXT} from '../ventas/permisos.js';
import * as VR from '../ventas/repo.js';
import * as VD from '../ventas/dominio.js';
import {tasaReferencia} from '../cliente/tasa-acceso.js';

export const err = (status, message, extra = {}) => Object.assign(new Error(message), {status, message, extra});
const txt = (v, max = 300) => (v == null ? '' : String(v)).trim().slice(0, max);
const nroDoc = d => d.numero_externo || d.nro_control_interno;
const rolTxt = ctx => nomRol(ctx.rol);
const exigir = (ctx, accion, msg) => { if (!entPuede(ctx.rol, accion)) throw err(403, msg || 'Tu rol no tiene acceso a esta información.'); };
const audit = (ctx, ref, nom, accion, detalle) => R.stAuditoria(ctx.db, {rol: ctx.rol, rolTxt: rolTxt(ctx), ent: 'entrega', ref, nom, accion, detalle});
const dol = c => c == null ? null : c / 100;
export const MAX_RECLAMOS = 3; // tope de reclamos por documento: cada uno pausa el plazo, así que no puede repetirse sin fin

/* ---------- Ajustes de crédito ---------- */
export async function leerAjustes(db) { return E.normalizarAjustes(await R.leerAjustes(db)); }
export async function verAjustes(db) {
  const fila = await R.leerAjustes(db), a = E.normalizarAjustes(fila);
  return {...a, faltantes: E.ajustesFaltantes(a), actualizado_ts: fila ? fila.actualizado_ts : null, actualizado_rol: fila ? fila.actualizado_rol : null};
}
/* Guardar los ajustes: src/precios/servicio.js (cambiarAjustesCredito). El Gerente rige de una vez; Administración deja un cambio pendiente de aprobar. */

/* ---------- Temporizador de un documento (lo que usan Cobranza, el portal y la liquidación) ---------- */
export async function temporizadorDe(db, idDoc, ahora = Date.now(), ajustes) {
  const [ent, aj] = await Promise.all([R.entregaDeDoc(db, idDoc), ajustes || R.leerAjustes(db)]);
  const pausas = ent ? await R.pausasDe(db, [idDoc]) : [];
  return E.calcularTemporizador({entrega_ts: ent ? ent.foto_ts : null, ahora, pausas, ajustes: aj});
}
/* Liquidación de un documento con el temporizador de entrega (solo lectura: es la función que Ventas llamará desde su `liquidar`).
   Si el temporizador no aplica (sin foto o sin porcentaje cargado), el resultado es IDÉNTICO al motor de siempre. */
export async function liquidarConEntrega(db, doc, cli, fechaPago, exonerar, ahora = Date.now()) {
  const lineas = await VR.lineasDe(db, doc.id_documento), args = {doc, lineas, cliente: cli, fechaPago, exonerarMora: exonerar};
  const base = VD.calcularLiquidacion(args);
  const t = await temporizadorDe(db, doc.id_documento, ahora);
  if (exonerar || !t.aplica_ajuste) return {liq: E.ajustarLiquidacion(base, base, null, doc), temporizador: t};
  const neutra = VD.calcularLiquidacion({...args, cliente: {...cli, dias_pronto_pago: null, dias_credito_normal: null}});
  return {liq: E.ajustarLiquidacion(base, neutra, t, doc), temporizador: t};
}
export async function previsualizarLiquidacion(ctx, idDoc, fecha) {
  exigir(ctx, 'ver');
  const doc = await VR.getDocumento(ctx.db, idDoc); if (!doc) throw err(404, 'Documento no encontrado.');
  const cli = await VR.getCliente(ctx.db, doc.id_cliente), f = fecha || VD.hoyVE(); if (!VD.fechaValida(f)) throw err(400, 'Fecha no válida.');
  const ahora = fecha ? Date.parse(f + 'T23:59:59-04:00') : Date.now();
  const r = await liquidarConEntrega(ctx.db, doc, cli, f, false, ahora), base = VD.calcularLiquidacion({doc, lineas: await VR.lineasDe(ctx.db, idDoc), cliente: cli, fechaPago: f});
  return {fecha: f, documento: nroDoc(doc), temporizador: r.temporizador, neto: dol(r.liq.neto_cents), neto_motor_actual: dol(base.neto_cents), ajuste_aplicado: !!(r.liq.entrega && r.liq.entrega.ajuste_aplicado), nota: r.liq.nota ? {tipo: r.liq.nota.tipo, total: dol(r.liq.nota.total)} : null};
}

/* ---------- Foto de entrega ---------- */
const fmtEntrega = e => ({id: e.id, id_documento: e.id_documento, nro: nroDoc(e), tipo: e.tipo_origen, cliente: e.razon_social, rif: e.rif_id, total: dol(e.total_cents), fecha_emision: e.fecha_emision, estado: e.estado, fecha_hora: e.fecha_hora, foto_ts: e.foto_ts,
  subido_rol: e.subido_rol, subido_ts: e.subido_ts, kb: Math.round(e.foto_bytes / 1024), confirmado_rol: e.confirmado_rol, confirmado_ts: e.confirmado_ts, motivo_rechazo: e.motivo_rechazo, ejemplo: !!e.ejemplo});

const fmtLlegadaCorta = l => l ? {id: l.id, recibidos: l.bultos_recibidos, despachados: l.bultos_despachados, coincide: l.coincide == null ? null : !!l.coincide, foto_ts: l.foto_ts} : null;
export async function subirEntrega(ctx, b) {
  exigir(ctx, 'subir', 'Tu puesto no sube fotos de entrega: lo hacen Logística y el Gerente.');
  const {db} = ctx, ahora = Date.now(), id = +b.id_documento;
  if (!Number.isInteger(id) || id <= 0) throw err(400, 'Elige la factura o nota de entrega.');
  const msg = E.validarFoto(b.foto, b.mini); if (msg) throw err(400, msg);
  const doc = await R.documento(db, id); if (!doc) throw err(404, 'Documento no encontrado.');
  if (doc.estado_doc === 'ANULADO') throw err(409, 'Ese documento está anulado.');
  let foto_ts = ahora;
  if (b.fecha_hora) { // el transporte la mandó antes: se puede indicar la hora real de la entrega
    foto_ts = Date.parse(b.fecha_hora); if (!Number.isFinite(foto_ts)) throw err(400, 'La fecha y hora de la entrega no son válidas.');
    if (foto_ts > ahora + 5 * 60e3) throw err(400, 'La entrega no puede estar en el futuro.');
    if (foto_ts < Date.parse(doc.fecha_emision + 'T00:00:00-04:00')) throw err(400, 'La entrega no puede ser anterior a la emisión del documento (' + doc.fecha_emision + ').');
  }
  const vig = await R.entregaVigente(db, id);
  if (vig && vig.estado === 'CONFIRMADA') throw err(409, 'Este documento ya tiene la entrega confirmada: su plazo ya está corriendo. Si la foto es incorrecta, recházala primero.', {codigo: 'YA_CONFIRMADA'});
  if (vig && vig.subido_rol === 'Cliente' && vig.foto_ts < foto_ts) foto_ts = vig.foto_ts;   // la primera foto que llegó (la del cliente) es la que manda para los días
  const st = [];
  if (vig) st.push(R.stReemplazar(db, vig.id));
  st.push(R.stInsertarEntrega(db, {id_documento: id, fecha_hora: new Date(foto_ts).toISOString(), foto_ts, subido_rol: rolTxt(ctx), foto: b.foto, mini: b.mini, foto_bytes: E.bytesDeB64(b.foto), ejemplo: false}));
  st.push(...audit(ctx, nroDoc(doc), doc.razon_social, vig ? 'reemplazó la foto de entrega' : 'subió la foto de entrega', {documento: nroDoc(doc), fecha_hora: new Date(foto_ts).toISOString(), kb: Math.round(E.bytesDeB64(b.foto) / 1024), hora_indicada: !!b.fecha_hora}));
  try { await R.lote(db, st); }
  catch (e) { if (/UNIQUE/i.test(String(e && e.message))) throw err(409, 'Otra persona subió la foto de este documento hace un instante.', {codigo: 'DUPLICADO'}); throw e; }
  return {ok: true, id_documento: id, documento: nroDoc(doc), fecha_hora: new Date(foto_ts).toISOString(), temporizador: await temporizadorDe(db, id, ahora)};
}
export async function listarEntregas(ctx, {estado, q}) {
  exigir(ctx, 'ver');
  if (estado && !['SUBIDA', 'CONFIRMADA', 'RECHAZADA'].includes(estado)) throw err(400, 'Estado no válido.');
  const crudas = await R.listarEntregas(ctx.db, {estado}), llegs = new Map((await R.llegadasDe(ctx.db, [...new Set(crudas.map(e => e.id_documento))])).map(l => [l.id_documento, l]));
  const filas = crudas.map(e => ({...fmtEntrega(e), llegada: fmtLlegadaCorta(llegs.get(e.id_documento))})), n = String(q || '').trim().toUpperCase();
  return n ? filas.filter(f => [f.nro, f.cliente, f.rif].some(x => String(x || '').toUpperCase().includes(n))) : filas;
}
export async function minis(ctx, ids) {
  exigir(ctx, 'ver');
  const lista = [...new Set(ids)].filter(Number.isInteger).slice(0, 12);
  return Object.fromEntries((await R.minisDe(ctx.db, lista)).map(r => [r.id, r.mini]));
}
export async function fotoCompleta(ctx, id) {
  exigir(ctx, 'ver');
  const e = await R.entregaPorId(ctx.db, id); if (!e) throw err(404, 'Entrega no encontrada.');
  return {...fmtEntrega(e), foto: (await R.fotoDe(ctx.db, id)).foto};
}
export async function sinVerificar(ctx) {
  exigir(ctx, 'ver');
  const filas = await R.sinVerificar(ctx.db), hoy = VD.hoyVE();
  return filas.map(d => ({id_documento: d.id_documento, nro: nroDoc(d), tipo: d.tipo_origen, cliente: d.razon_social, rif: d.rif_id, fecha_emision: d.fecha_emision, dias_sin_foto: VD.diasEntre(d.fecha_emision, hoy), total: dol(d.total_cents), ultima: d.ultima, motivo: d.ultimo_motivo}));
}
export async function resolverEntrega(ctx, id, accion, motivo) {
  exigir(ctx, 'confirmar', 'Confirmar o rechazar una entrega lo hace el Gerente.');
  const e = await R.entregaPorId(ctx.db, id); if (!e) throw err(404, 'Entrega no encontrada.');
  if (accion === 'confirmar') {
    if (e.estado !== 'SUBIDA') throw err(409, 'Esta entrega ya no está por confirmar.');
    await R.lote(ctx.db, [R.stResolverEntrega(ctx.db, id, 'CONFIRMADA', rolTxt(ctx), null), ...audit(ctx, nroDoc(e), e.razon_social, 'confirmó la entrega', {documento: nroDoc(e)})]);
  } else if (accion === 'rechazar') {
    const m = txt(motivo, 200); if (m.length < 3) throw err(400, 'Escribe el motivo del rechazo.');
    if (!['SUBIDA', 'CONFIRMADA'].includes(e.estado)) throw err(409, 'Esta entrega ya fue rechazada o reemplazada.');
    await R.lote(ctx.db, [R.stResolverEntrega(ctx.db, id, 'RECHAZADA', rolTxt(ctx), m), ...audit(ctx, nroDoc(e), e.razon_social, 'rechazó la foto de entrega', {documento: nroDoc(e), motivo: m})]);
  } else throw err(400, 'Acción no válida.');
  return {ok: true};
}

/* ---------- Cobranza: plazos, avisos y reclamos ---------- */
const publicoTemp = t => ({estado: t.estado, tramo: t.tramo, dias: t.dias, dias_vencida: t.dias_vencida, restante_ms: t.restante_ms, vence_ts: t.vence_ts, descuento_pct: t.descuento_pct, recargo_pct: t.recargo_pct, aplica_ajuste: t.aplica_ajuste, pausada: t.pausada, caso: t.caso});
export async function plazos(ctx, ahora = Date.now()) {
  exigir(ctx, 'verCobranza', 'Esta pantalla es de Administración, Ventas y el Gerente.');
  const [filas, aj] = await Promise.all([R.conEntrega(ctx.db), R.leerAjustes(ctx.db)]);
  const pausas = await R.pausasDe(ctx.db, filas.map(f => f.id_documento)), porDoc = new Map();
  for (const p of pausas) (porDoc.get(p.id_documento) || porDoc.set(p.id_documento, []).get(p.id_documento)).push(p);
  const docs = filas.map(f => {
    const t = E.calcularTemporizador({entrega_ts: f.foto_ts, ahora, pausas: porDoc.get(f.id_documento) || [], ajustes: aj}), m = E.montoHoy({total_cents: f.total_cents, pagado_cents: f.pagado_cents, temporizador: t});
    return {id_documento: f.id_documento, nro: nroDoc(f), tipo: f.tipo_origen, cliente: f.razon_social, rif: f.rif_id, fecha_hora: f.fecha_hora, total: dol(f.total_cents), saldo: dol(m.normal_cents), pagar_hoy: dol(m.hoy_cents), estado_entrega: f.estado_entrega, ...publicoTemp(t), aviso: t.aviso};
  });
  const sv = await R.sinVerificar(ctx.db), a = E.normalizarAjustes(aj);
  const cuenta = k => docs.filter(d => d.estado === k).length;
  return {ahora, ajustes: {...a, faltantes: E.ajustesFaltantes(a)}, documentos: docs, sin_verificar: sv.length,
    resumen: {tramo1: cuenta('TRAMO1'), tramo2: cuenta('TRAMO2'), vencidas: cuenta('VENCIDA'), pausadas: cuenta('PAUSADA'), sin_verificar: sv.length}};
}
export async function listarDisputas(ctx, estado) {
  exigir(ctx, 'verCobranza', 'Esta pantalla es de Administración, Ventas y el Gerente.');
  return (await R.listarDisputas(ctx.db, estado === 'ABIERTA' || estado === 'RESUELTA' ? estado : null)).map(x => ({id: x.id, id_documento: x.id_documento, nro: nroDoc(x), cliente: x.razon_social, rif: x.rif_id, total: dol(x.total_cents), estado: x.estado, nota_cliente: x.nota_cliente, creado_ts: x.creado_ts,
    resuelto_ts: x.resuelto_ts, resuelto_rol: x.resuelto_rol, resolucion: x.resolucion, nota_resolucion: x.nota_resolucion}));
}
export async function resolverDisputa(ctx, id, {resolucion, nota}) {
  exigir(ctx, 'cobranza', 'Resolver reclamos lo hace Administración o el Gerente.');
  if (!['ENTREGA_VALIDA', 'NO_ENTREGADA'].includes(resolucion)) throw err(400, 'Elige cómo se resuelve el reclamo.');
  const n = txt(nota, 300); if (n.length < 3) throw err(400, 'Escribe una nota de la resolución.');
  const x = await R.disputaPorId(ctx.db, id); if (!x) throw err(404, 'Reclamo no encontrado.');
  if (x.estado !== 'ABIERTA') throw err(409, 'Este reclamo ya fue resuelto.');
  const doc = await R.documento(ctx.db, x.id_documento), ts = Date.now(), st = [R.stResolverDisputa(ctx.db, id, resolucion, rolTxt(ctx), n, ts)];
  if (resolucion === 'NO_ENTREGADA') { const v = await R.entregaVigente(ctx.db, x.id_documento); if (v) st.push(R.stResolverEntrega(ctx.db, v.id, 'RECHAZADA', rolTxt(ctx), 'Reclamo del cliente: no recibió la mercancía. ' + n)); }
  st.push(...audit(ctx, nroDoc(doc), doc.razon_social, 'resolvió el reclamo de entrega', {documento: nroDoc(doc), resolucion, nota: n}));
  await R.lote(ctx.db, st);
  return {ok: true, resolucion, plazo: resolucion === 'ENTREGA_VALIDA' ? 'El plazo se reanuda desde donde quedó.' : 'La entrega quedó sin verificar: Despachos debe subir una foto nueva.'};
}

/* ---------- Portal del cliente: lo que ve el cliente (ctx = {db, cliente}, el cliente sale del código, nunca de un parámetro) ---------- */
export async function estadoPortal(ctx, ahora = Date.now()) {
  const {db, cliente} = ctx, [docs, aj, tasa, disp] = await Promise.all([R.docsPendientesCliente(db, cliente.id_cliente), R.leerAjustes(db), tasaReferencia(db), R.disputasDeCliente(db, cliente.id_cliente)]);
  const ids = docs.map(d => d.id_documento), pausas = await R.pausasDe(db, ids), porDoc = new Map();
  for (const p of pausas) (porDoc.get(p.id_documento) || porDoc.set(p.id_documento, []).get(p.id_documento)).push(p);
  const [bultos, llegs] = await Promise.all([R.bultosDe(db, ids), R.llegadasDe(db, ids)]);
  const a = E.normalizarAjustes(aj);
  const documentos = docs.map(d => {
    const t = E.calcularTemporizador({entrega_ts: d.foto_ts, ahora, pausas: porDoc.get(d.id_documento) || [], ajustes: aj}), m = E.montoHoy({total_cents: d.total_cents, pagado_cents: d.pagado_cents, temporizador: t});
    const abierta = disp.find(x => x.id_documento === d.id_documento && x.estado === 'ABIERTA'), nRec = disp.filter(x => x.id_documento === d.id_documento).length;
    return {id_documento: d.id_documento, nro: nroDoc(d), tipo: d.tipo_origen, fecha_emision: d.fecha_emision, total: dol(d.total_cents), pagado: dol(d.pagado_cents),
      entrega: d.foto_ts ? {fecha_hora: d.fecha_hora, por: d.subido_rol === 'Cliente' ? 'cliente' : 'despachos'} : null,
      bultos_despachados: (bultos.find(x => x.id_documento === d.id_documento) || {}).n ?? null,
      llegada: (l => l ? {bultos_recibidos: l.bultos_recibidos, coincide: l.coincide == null ? null : !!l.coincide, foto_ts: l.foto_ts} : null)(llegs.find(x => x.id_documento === d.id_documento)),
      temporizador: {...publicoTemp(t), texto: E.ESTADO_TXT[t.estado], restante_texto: E.textoRestante(t.restante_ms)},
      pagar: {normal_usd: dol(m.normal_cents), hoy_usd: dol(m.hoy_cents), hoy_bs: tasa ? dol(E.usdABs(m.hoy_cents, tasa.valor)) : null, normal_bs: tasa ? dol(E.usdABs(m.normal_cents, tasa.valor)) : null, descuento_aplicado: m.aplica && m.hoy_cents < m.normal_cents, recargo_aplicado: m.aplica && m.hoy_cents > m.normal_cents},
      reclamo: abierta ? {estado: 'ABIERTA', creado_ts: abierta.creado_ts} : null, puede_reclamar: !abierta && nRec < MAX_RECLAMOS};
  });
  return {ahora, tramos: {dias_tramo1: a.dias_tramo1, dias_tramo2: a.dias_tramo2}, tasa, documentos};
}
/* El cliente avisa la llegada: foto + UN total de bultos recibidos. La primera foto (la suya o la de Despachos) arranca el reloj.
   Si el total no coincide con lo despachado se abre un reclamo (el mismo de «no recibí esto») y el plazo queda en pausa. */
export async function registrarLlegada(ctx, b, ahora = Date.now()) {
  const {db, cliente} = ctx, id = +(b && b.id_documento);
  if (!Number.isInteger(id) || id <= 0) throw err(400, 'Documento no válido.');
  const bv = E.validarBultos(b.bultos_recibidos); if (bv.error) throw err(400, bv.error);
  const msg = E.validarFoto(b.foto, b.mini); if (msg) throw err(400, msg);
  const doc = await R.documento(db, id);
  if (!doc || doc.id_cliente !== cliente.id_cliente || doc.estado_doc === 'ANULADO') throw err(404, 'No encontramos ese documento en tu cuenta.');   // misma respuesta si es de otro cliente
  if (await R.llegadaDeDoc(db, id)) throw err(409, 'Ya avisaste la llegada de este despacho.', {codigo: 'YA_AVISADO'});
  const despachados = ((await R.bultosDe(db, [id]))[0] || {}).n ?? null, coincide = despachados == null ? null : bv.n === despachados;
  const vig = await R.entregaVigente(db, id), arranca = !vig, kb = E.bytesDeB64(b.foto);
  const st = [];
  if (arranca) st.push(R.stInsertarEntrega(db, {id_documento: id, fecha_hora: new Date(ahora).toISOString(), foto_ts: ahora, subido_rol: 'Cliente', foto: b.foto, mini: b.mini, foto_bytes: kb, ejemplo: cliente.ejemplo}));
  st.push(R.stInsertarLlegada(db, {id_documento: id, id_cliente: cliente.id_cliente, foto: b.foto, mini: b.mini, foto_bytes: kb, foto_ts: ahora, bultos_recibidos: bv.n, bultos_despachados: despachados, coincide, arranco_reloj: arranca, ejemplo: cliente.ejemplo}));
  let reclamo = false;
  if (coincide === false && !await R.disputaAbierta(db, id) && await R.contarDisputas(db, id) < MAX_RECLAMOS) {
    reclamo = true;
    st.push(R.stNuevaDisputa(db, {id_documento: id, id_cliente: cliente.id_cliente, nota_cliente: `Recibí ${bv.n} bultos de ${despachados} despachados.`, creado_ts: ahora, ejemplo: cliente.ejemplo}));
  }
  st.push(...R.stAuditoria(db, {rol: 'portal', rolTxt: 'Portal del cliente', ent: 'entrega', ref: nroDoc(doc), nom: cliente.razon_social, accion: 'el cliente avisó la llegada del despacho', detalle: {documento: nroDoc(doc), recibidos: bv.n, despachados, coincide, arranco_reloj: arranca, reclamo, kb: Math.round(kb / 1024)}}));
  try { await R.lote(db, st); }
  catch (e) { if (/UNIQUE/i.test(String(e && e.message))) throw err(409, 'Ya avisaste la llegada de este despacho.', {codigo: 'YA_AVISADO'}); throw e; }
  const mensaje = coincide === false ? 'Recibimos tu aviso. El total no coincide con lo despachado: Ventas y Cobranza lo revisan y tu plazo queda en pausa mientras tanto.'
    : arranca ? 'Listo, gracias. Tu plazo de pago empezó con tu foto.' : 'Listo, gracias. Tu plazo de pago ya venía corriendo desde la primera foto de la entrega.';
  return {ok: true, coincide, reclamo, arranco_reloj: arranca, mensaje};
}
export async function listarLlegadas(ctx) {
  exigir(ctx, 'ver');
  return (await R.listarLlegadas(ctx.db)).map(l => ({id: l.id, id_documento: l.id_documento, nro: nroDoc(l), tipo: l.tipo_origen, cliente: l.razon_social, rif: l.rif_id, recibidos: l.bultos_recibidos, despachados: l.bultos_despachados, coincide: l.coincide == null ? null : !!l.coincide, foto_ts: l.foto_ts, subido_por: l.subido_por, arranco_reloj: !!l.arranco_reloj, kb: Math.round(l.foto_bytes / 1024)}));
}
export async function minisLlegada(ctx, ids) {
  exigir(ctx, 'ver');
  const lista = [...new Set(ids)].filter(Number.isInteger).slice(0, 12);
  return Object.fromEntries((await R.minisLlegada(ctx.db, lista)).map(r => [r.id, r.mini]));
}
export async function fotoLlegada(ctx, id) {
  exigir(ctx, 'ver');
  const l = await R.llegadaPorId(ctx.db, id); if (!l) throw err(404, 'Aviso de llegada no encontrado.');
  return {id: l.id, nro: nroDoc(l), cliente: l.razon_social, recibidos: l.bultos_recibidos, despachados: l.bultos_despachados, coincide: l.coincide == null ? null : !!l.coincide, foto_ts: l.foto_ts, subido_por: l.subido_por, foto: (await R.fotoLlegada(ctx.db, id)).foto};
}
export async function noRecibi(ctx, idDoc, nota, ahora = Date.now()) {
  const {db, cliente} = ctx, id = +idDoc;
  if (!Number.isInteger(id) || id <= 0) throw err(400, 'Documento no válido.');
  const doc = await R.documento(db, id);
  if (!doc || doc.id_cliente !== cliente.id_cliente || doc.estado_doc !== 'PENDIENTE') throw err(404, 'No encontramos ese documento en tu cuenta.'); // misma respuesta si es de otro cliente
  if (await R.disputaAbierta(db, id)) throw err(409, 'Ya reportaste que no recibiste esto: Cobranza lo está revisando y tu plazo está en pausa.', {codigo: 'YA_ABIERTO'});
  if (await R.contarDisputas(db, id) >= MAX_RECLAMOS) throw err(409, 'Este documento ya tuvo reclamos anteriores. Comunícate directamente con Cobranza.', {codigo: 'TOPE'});
  const n = txt(nota, 300);
  try {
    await R.lote(db, [R.stNuevaDisputa(db, {id_documento: id, id_cliente: cliente.id_cliente, nota_cliente: n, creado_ts: ahora, ejemplo: cliente.ejemplo}),
      ...R.stAuditoria(db, {rol: 'portal', rolTxt: 'Portal del cliente', ent: 'entrega', ref: nroDoc(doc), nom: cliente.razon_social, accion: 'el cliente reportó «no recibí esto»', detalle: {documento: nroDoc(doc), nota: n}})]);
  } catch (e) { if (/UNIQUE/i.test(String(e && e.message))) throw err(409, 'Ya reportaste que no recibiste esto.', {codigo: 'YA_ABIERTO'}); throw e; }
  return {ok: true, mensaje: 'Recibimos tu aviso. Cobranza lo revisará y tu plazo queda en pausa mientras tanto.'};
}
