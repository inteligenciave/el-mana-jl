/* Cambios de precio · casos de uso. No conoce HTTP.
   Gerente: el cambio rige de una vez y queda en la auditoría. Administración: queda un cambio PENDIENTE y el valor anterior sigue vigente
   (las ventas no se tocan: leen los mismos precios de siempre) hasta que el Gerente lo apruebe o lo rechace. */
import * as P from './dominio.js';
import * as R from './repo.js';
import * as E from '../entregas/dominio.js';
import {ROL_TXT} from '../ventas/permisos.js';
import * as VD from '../ventas/dominio.js';

export const err = (status, message, extra = {}) => Object.assign(new Error(message), {status, message, extra});
const rolTxt = ctx => ROL_TXT[ctx.rol] || ctx.rol;
const txt = (v, max = 200) => (v == null ? '' : String(v)).trim().slice(0, max);
const audit = (ctx, ent, ref, nom, accion, detalle) => R.stAuditoria(ctx.db, {rol: ctx.rol, rolTxt: rolTxt(ctx), ent, ref, nom, accion, detalle});
const nomProd = p => `${p.nombre} ${p.gramaje || ''}`.trim();
const nombresLineas = detalle => P.lineasDe(detalle);

/* Qué modo tiene el rol para cambiar precios; si no tiene, 403 con mensaje claro */
function modoOExigir(ctx) {
  const m = P.modoDe(ctx.rol);
  if (!m) throw err(403, P.MSG_SIN_PERMISO);
  return m;
}
async function guardarPendiente(ctx, c, auditoria) {
  try { await R.lote(ctx.db, [R.stCambio(ctx.db, {...c, pedido_rol: rolTxt(ctx)}), ...auditoria]); }
  catch (e) {
    if (/UNIQUE/i.test(String((e && e.message) || e))) throw err(409, 'Ya hay un cambio de precio de esto esperando la respuesta del Gerente. Espera a que lo apruebe o lo rechace antes de pedir otro.', {codigo: 'YA_PENDIENTE'});
    throw e;
  }
}
const SIN_CAMBIOS = {estado: 'SIN_CAMBIOS', mensaje: 'No hay nada que cambiar: el valor es el mismo.'};
const PENDIENTE = {estado: 'PENDIENTE', mensaje: 'Cambio de precio enviado al Gerente para aprobar. Mientras tanto sigue vigente el precio anterior.'};

/* ---------- a) Precio por bulto de una lista (A/B) y modalidad (contado/crédito) ---------- */
export async function listasPrecios(ctx) {
  if (!P.puedeVerCambios(ctx.rol)) throw err(403, P.MSG_SIN_PERMISO);
  const filas = await R.listarPreciosLista(ctx.db), por = new Map();
  for (const f of filas) {
    const x = por.get(f.id_producto) || por.set(f.id_producto, {id_producto: f.id_producto, codigo_sku: f.codigo_sku, nombre: f.nombre, gramaje: f.gramaje, listas: {}}).get(f.id_producto);
    x.listas[f.lista] = {contado_cents: f.contado_cents, credito_cents: f.credito_cents};
  }
  const mapa = await R.leerEstadosLista(ctx.db), nombres = await R.nombresListas(ctx.db);
  const estados = VD.ESTADOS.map(e => ({estado: e, zona: VD.zonaDeEstado(e), lista: mapa[e] || null}));
  const listas = nombres.map(n => ({nombre: n, propia: !['A', 'B'].includes(n), estados: estados.filter(x => x.lista === n).map(x => x.estado)}));
  return {productos: [...por.values()], listas, estados};
}
async function estadosDeLista(db, lista) { const m = await R.leerEstadosLista(db); return Object.keys(m).filter(e => m[e] === lista).sort(); }
const soloDueno = ctx => { if (ctx.rol !== 'dueno') throw err(403, 'Solo el Gerente asigna listas de precios a los estados.'); };
/* El Gerente apunta un estado a una lista que ya existe (o lo deja sin precios con lista = null) */
export async function asignarListaEstado(ctx, b) {
  soloDueno(ctx); b = b || {};
  const estado = VD.estadoReal(b.estado); if (!estado) throw err(400, 'Elige un estado de Venezuela.');
  const lista = b.lista == null || b.lista === '' ? null : String(b.lista);
  if (lista && !(await R.nombresListas(ctx.db)).includes(lista)) throw err(400, 'Esa lista de precios no existe.');
  const antes = (await R.leerEstadosLista(ctx.db))[estado] || null;
  if (antes === lista) return SIN_CAMBIOS;
  await R.lote(ctx.db, [R.stEstadoLista(ctx.db, estado, lista), ...audit(ctx, 'precio', estado, 'Estado ' + estado, lista ? 'asignó la lista ' + lista : 'dejó el estado sin lista de precios', {antes, despues: lista})]);
  return {estado: 'APLICADO', mensaje: lista ? `${estado} ahora usa la lista ${lista}. Las ventas ya emitidas no cambian.` : `${estado} quedó sin precios: no se vende hasta que le asignes una lista.`};
}
/* El Gerente le da precios propios a un estado: se crea una lista nueva copiando otra y el estado pasa a usarla */
export async function darPreciosPropios(ctx, b) {
  soloDueno(ctx); b = b || {};
  const estado = VD.estadoReal(b.estado); if (!estado) throw err(400, 'Elige un estado de Venezuela.');
  const nombres = await R.nombresListas(ctx.db), actual = (await R.leerEstadosLista(ctx.db))[estado] || null;
  const origen = b.copiar_de ? String(b.copiar_de) : actual;
  if (!origen || !nombres.includes(origen)) throw err(400, 'Elige de qué lista copiar los precios de partida (por ejemplo A o B).');
  if (actual && actual.startsWith('Propia · ' + estado)) throw err(409, estado + ' ya tiene precios propios.');
  let nueva = 'Propia · ' + estado, n = 2; while (nombres.includes(nueva)) nueva = 'Propia · ' + estado + ' ' + n++;
  await R.lote(ctx.db, [R.stCopiarLista(ctx.db, nueva, origen), R.stEstadoLista(ctx.db, estado, nueva), ...audit(ctx, 'precio', estado, 'Estado ' + estado, 'le dio precios propios (lista ' + nueva + ', copiada de ' + origen + ')', {antes: actual, despues: nueva, copiada_de: origen})]);
  return {estado: 'APLICADO', lista: nueva, mensaje: `${estado} ahora tiene su propia lista (${nueva}), copiada de ${origen}. Edítala en Precios por lista sin afectar a los demás estados.`};
}
export async function cambiarPrecioLista(ctx, b) {
  const modo = modoOExigir(ctx);
  b = b || {};
  const e0 = P.validarLista(b.lista, b.modalidad); if (e0) throw err(400, e0);
  const v = P.validarPrecioBulto(b.precio); if (v.error) throw err(400, v.error);
  const id = Number(b.id_producto); if (!Number.isInteger(id) || id < 1) throw err(400, 'Elige un producto.');
  const fila = await R.getPrecioLista(ctx.db, id, b.lista); if (!fila) throw err(404, 'Ese producto no tiene precio en la lista ' + b.lista + '.');
  const p = await R.getProducto(ctx.db, id), campo = P.campoLista(b.modalidad), antes = b.modalidad === 'contado' ? fila.contado_cents : fila.credito_cents;
  if (antes === v.cents) return SIN_CAMBIOS;
  const nombre = `${nomProd(p)} · lista ${b.lista}`, clave = P.claveLista(id, b.lista, b.modalidad), campos = {[campo]: {antes, despues: v.cents}};
  const det = {lista: b.lista, modalidad: b.modalidad, antes: antes / 100}, que = b.modalidad === 'contado' ? 'de contado' : 'a crédito';
  if (modo === 'directo') {
    await R.lote(ctx.db, [R.stPrecioLista(ctx.db, id, b.lista, b.modalidad, v.cents), R.stCerrarPendiente(ctx.db, clave, rolTxt(ctx), 'El Gerente fijó el precio directamente.'),
      ...audit(ctx, 'precio', p.codigo_sku, nombre, `cambió el precio ${que} por bulto`, {...det, despues: v.cents / 100})]);
    return {estado: 'APLICADO', mensaje: 'Precio cambiado: ya rige.', estados_afectados: await estadosDeLista(ctx.db, b.lista)};
  }
  await guardarPendiente(ctx, {tipo: 'PRODUCTO', clave, titulo: nombre, detalle: {items: [{id, nombre, lista: b.lista, modalidad: b.modalidad, campos}]}},
    audit(ctx, 'precio', p.codigo_sku, nombre, `pidió cambiar el precio ${que} por bulto (pendiente de aprobar)`, {...det, nuevo: v.cents / 100}));
  return {...PENDIENTE, estados_afectados: await estadosDeLista(ctx.db, b.lista)};
}

/* ---------- b) Precios especiales de un cliente (precios por bulto y porcentajes de su regla) ---------- */
export async function cambiarPreciosCliente(ctx, idCliente, reglas) {
  const modo = modoOExigir(ctx);
  const cli = await R.getCliente(ctx.db, idCliente); if (!cli) throw err(404, 'Cliente no encontrado.');
  const n = P.normalizarReglas(reglas); if (n.error) throw err(400, n.error);
  const prods = new Map((await R.listarProductos(ctx.db)).map(p => [p.id_producto, p]));
  const hoy = new Map((await R.reglasDeCliente(ctx.db, idCliente)).map(r => [r.id_producto, r]));
  const items = [];
  for (const x of n.reglas) {
    const prod = prods.get(x.id_producto) || await R.getProducto(ctx.db, x.id_producto); if (!prod) throw err(400, 'Hay un producto que ya no existe en la lista.');
    const antes = hoy.get(x.id_producto) || null, nueva = P.reglaVacia(x) ? null : x;
    const campos = P.diferencias(P.camposRegla(), antes, nueva);
    if (Object.keys(campos).length) items.push({id: x.id_producto, nombre: nomProd(prod), campos, regla: nueva});
  }
  if (!items.length) return SIN_CAMBIOS;
  const clave = P.claveCliente(idCliente);
  const resumen = items.map(i => ({producto: i.nombre, cambios: Object.fromEntries(Object.entries(i.campos).map(([k, v]) => [k, {antes: v.antes, despues: v.despues}]))}));
  if (modo === 'directo') {
    await R.lote(ctx.db, [...items.map(i => i.regla ? R.stUpsertRegla(ctx.db, idCliente, i.regla) : R.stBorrarRegla(ctx.db, idCliente, i.id)),
      R.stCerrarPendiente(ctx.db, clave, rolTxt(ctx), 'El Gerente fijó los precios directamente.'),
      ...audit(ctx, 'precio', idCliente, cli.razon_social, 'cambió precios especiales del cliente', {productos: items.length, cambios: resumen})]);
    return {estado: 'APLICADO', mensaje: 'Precios del cliente cambiados: ya rigen.', reglas: await R.reglasDeCliente(ctx.db, idCliente)};
  }
  await guardarPendiente(ctx, {tipo: 'CLIENTE', clave, titulo: cli.razon_social, detalle: {items}},
    audit(ctx, 'precio', idCliente, cli.razon_social, 'pidió cambiar precios especiales del cliente (pendiente de aprobar)', {productos: items.length, cambios: resumen}));
  return PENDIENTE;
}

/* ---------- c) Plazos y porcentajes de crédito (descuento de los tramos 7 y 21 días y recargo por mora) ---------- */
export async function cambiarAjustesCredito(ctx, b) {
  const modo = modoOExigir(ctx);
  const v = E.validarAjustes(b); if (v.error) throw err(400, v.error);
  const hoy = E.normalizarAjustes(await R.leerAjustes(ctx.db));
  const campos = P.diferencias(P.camposCredito(), hoy, v.ajustes);
  if (!Object.keys(campos).length) return SIN_CAMBIOS;
  const titulo = 'Plazos y porcentajes de crédito';
  if (modo === 'directo') {
    await R.lote(ctx.db, [R.stAjustes(ctx.db, v.ajustes, rolTxt(ctx)), R.stCerrarPendiente(ctx.db, P.CLAVE_CREDITO, rolTxt(ctx), 'El Gerente fijó los ajustes directamente.'),
      ...audit(ctx, 'ajustes_credito', 'Ajustes de crédito', titulo, 'cambió los ajustes de crédito', {antes: hoy, despues: v.ajustes})]);
    return {estado: 'APLICADO', mensaje: 'Ajustes guardados: ya rigen.'};
  }
  await guardarPendiente(ctx, {tipo: 'CREDITO', clave: P.CLAVE_CREDITO, titulo, detalle: {items: [{id: 1, nombre: titulo, campos, ajustes: v.ajustes}]}},
    audit(ctx, 'ajustes_credito', 'Ajustes de crédito', titulo, 'pidió cambiar los ajustes de crédito (pendiente de aprobar)', {antes: hoy, nuevo: v.ajustes}));
  return PENDIENTE;
}

/* ---------- Lista y resolución ---------- */
const presentar = c => { const detalle = JSON.parse(c.detalle); return {id: c.id, clave: c.clave, tipo: c.tipo, tipo_txt: P.TIPOS[c.tipo], titulo: c.titulo, estado: c.estado, estado_txt: P.ESTADO_TXT[c.estado], pedido_por: c.pedido_rol, pedido_ts: c.pedido_ts, resuelto_por: c.resuelto_rol, resuelto_ts: c.resuelto_ts, motivo: c.motivo, lineas: nombresLineas(detalle)}; };
export async function listarCambios(ctx, estado) {
  if (!P.puedeVerCambios(ctx.rol)) throw err(403, 'Tu rol no ve los cambios de precio.');
  if (estado && !P.ESTADO_TXT[estado]) throw err(400, 'Estado no válido.');
  const [filas, pendientes] = await Promise.all([R.listarCambios(ctx.db, estado || null), R.contarPendientes(ctx.db)]);
  return {pendientes, cambios: filas.map(presentar)};
}
export async function cantidadPendientes(ctx) {
  if (!P.puedeVerCambios(ctx.rol)) throw err(403, 'Tu rol no ve los cambios de precio.');
  return {pendientes: await R.contarPendientes(ctx.db)};
}

function sentenciasDeAplicar(db, c, detalle, rol) {
  const it = detalle.items || [];
  if (c.tipo === 'PRODUCTO') return it.map(i => i.lista ? R.stPrecioLista(db, i.id, i.lista, i.modalidad, i.campos[P.campoLista(i.modalidad)].despues) : R.stPrecioProducto(db, i.id, i.campos.precio_ref_cents.despues));
  if (c.tipo === 'CLIENTE') { const idCli = Number(c.clave.slice(2)); return it.map(i => i.regla ? R.stUpsertRegla(db, idCli, i.regla) : R.stBorrarRegla(db, idCli, i.id)); }
  if (c.tipo === 'CREDITO') return it.map(i => R.stAjustes(db, i.ajustes, rol));
  throw err(500, 'Tipo de cambio desconocido.');
}

export async function resolver(ctx, id, accion, motivo) {
  if (!P.puedeResolver(ctx.rol)) throw err(403, P.MSG_SOLO_DUENO);
  if (!['aprobar', 'rechazar'].includes(accion)) throw err(400, 'Acción no válida.');
  const c = await R.getCambio(ctx.db, id); if (!c) throw err(404, 'Cambio no encontrado.');
  const ya = () => err(409, `Este cambio ya fue ${c.estado === 'APROBADO' ? 'aprobado' : 'rechazado'}${c.estado === 'PENDIENTE' ? '' : ' (' + (c.resuelto_rol || 'por el Gerente') + ')'}: no se puede resolver de nuevo.`, {codigo: 'YA_RESUELTO'});
  if (c.estado !== 'PENDIENTE') throw ya();
  const estado = accion === 'aprobar' ? 'APROBADO' : 'RECHAZADO', mot = accion === 'rechazar' ? (txt(motivo, 200) || null) : null;
  const gana = await R.reclamar(ctx.db, id, estado, rolTxt(ctx), mot);                 // solo una resolución puede ganar
  if (!(gana.meta && gana.meta.changes > 0)) { const otra = await R.getCambio(ctx.db, id); c.estado = otra ? otra.estado : c.estado; c.resuelto_rol = otra && otra.resuelto_rol; throw ya(); }
  const detalle = JSON.parse(c.detalle), lineas = nombresLineas(detalle).map(l => `${l.que}: ${l.campo} ${l.antes} → ${l.despues}`);
  try {
    if (accion === 'aprobar') await R.lote(ctx.db, [...sentenciasDeAplicar(ctx.db, c, detalle, rolTxt(ctx)), ...audit(ctx, 'precio', 'CP-' + id, c.titulo, 'aprobó el cambio de precio pedido por ' + c.pedido_rol, {cambios: lineas})]);
    else await R.lote(ctx.db, audit(ctx, 'precio', 'CP-' + id, c.titulo, 'rechazó el cambio de precio pedido por ' + c.pedido_rol, {cambios: lineas, motivo: mot}));
  } catch (e) { await R.soltar(ctx.db, id, estado); throw e; }                           // si no se pudo aplicar, el cambio vuelve a quedar pendiente
  return presentar(await R.getCambio(ctx.db, id));
}
