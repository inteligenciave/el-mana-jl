/* Cambios de precio · casos de uso. No conoce HTTP.
   Gerente: el cambio rige de una vez y queda en la auditoría. Administración: queda un cambio PENDIENTE y el valor anterior sigue vigente
   (las ventas no se tocan: leen los mismos precios de siempre) hasta que el Gerente lo apruebe o lo rechace. */
import * as P from './dominio.js';
import * as R from './repo.js';
import * as E from '../entregas/dominio.js';
import {ROL_TXT, nomRol} from '../ventas/permisos.js';

export const err = (status, message, extra = {}) => Object.assign(new Error(message), {status, message, extra});
const rolTxt = ctx => nomRol(ctx.rol);
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

/* ---------- a) Precio por bulto de una categoría (Minorista, Mayorista, Gran Mayor) y modalidad (contado/crédito) ---------- */
export async function listasPrecios(ctx) {
  if (!P.puedeVerCambios(ctx.rol)) throw err(403, P.MSG_SIN_PERMISO);
  const [prods, filas, cli, arch] = await Promise.all([R.listarProductos(ctx.db), R.listarPreciosLista(ctx.db), R.clientesPorCategoria(ctx.db), R.listarArchivo(ctx.db)]);
  const por = new Map(prods.map(p => [p.id_producto, {id_producto: p.id_producto, codigo_sku: p.codigo_sku, nombre: p.nombre, gramaje: p.gramaje, listas: {}}]));
  for (const f of filas) { const x = por.get(f.id_producto); if (x) x.listas[f.lista] = {contado_cents: f.contado_cents, credito_cents: f.credito_cents}; }
  const listas = P.LISTAS.map(n => ({nombre: n, clientes: cli.por[n] || 0, productos_con_precio: filas.filter(f => f.lista === n).length}));
  return {productos: [...por.values()], listas, clientes_sin_categoria: cli.sin, archivadas: {listas: [...new Set(arch.map(f => f.lista))], filas: arch.length}};
}
/* Las listas por zona archivadas (A, B, «Propia · estado»): solo para consultar o copiar a mano a las categorías */
export async function listasArchivadas(ctx) {
  if (!P.puedeVerCambios(ctx.rol)) throw err(403, P.MSG_SIN_PERMISO);
  const [filas, estados] = await Promise.all([R.listarArchivo(ctx.db), R.estadosArchivo(ctx.db)]);
  const por = new Map();
  for (const f of filas) { const x = por.get(f.lista) || por.set(f.lista, {nombre: f.lista, estados: estados.filter(e => e.lista === f.lista).map(e => e.estado), precios: []}).get(f.lista); x.precios.push({producto: ((f.nombre || '') + ' ' + (f.gramaje || '')).trim(), contado_cents: f.contado_cents, credito_cents: f.credito_cents}); }
  return {listas: [...por.values()]};
}
export async function cambiarPrecioLista(ctx, b) {
  const modo = modoOExigir(ctx);
  b = b || {};
  const nuevaFila = b.modalidad === 'ambos';
  const e0 = P.validarLista(b.lista, b.modalidad); if (e0) throw err(400, e0);
  const id = Number(b.id_producto); if (!Number.isInteger(id) || id < 1) throw err(400, 'Elige un producto.');
  const p = await R.getProducto(ctx.db, id); if (!p) throw err(404, 'Producto no encontrado.');
  const fila = await R.getPrecioLista(ctx.db, id, b.lista), nombre = `${nomProd(p)} · ${b.lista}`;
  /* Producto sin precio en la categoría: se cargan los dos precios juntos (contado y crédito) */
  if (!fila || nuevaFila) {
    if (fila) throw err(409, 'Ese producto ya tiene precio en ' + b.lista + '. Cambia el de contado o el de crédito.');
    const co = P.validarPrecioBulto(b.precio_contado), cr = P.validarPrecioBulto(b.precio_credito);
    if (co.error || cr.error) throw err(400, 'Este producto todavía no tiene precio en ' + b.lista + ': escribe el precio de contado y el de crédito por bulto. ' + (co.error ? 'Contado: ' + co.error : 'Crédito: ' + cr.error));
    const clave = P.claveLista(id, b.lista, 'ambos'), campos = {lista_contado_cents: {antes: null, despues: co.cents}, lista_credito_cents: {antes: null, despues: cr.cents}};
    const det = {lista: b.lista, modalidad: 'ambos', contado: co.cents / 100, credito: cr.cents / 100};
    if (modo === 'directo') {
      await R.lote(ctx.db, [R.stUpsertPrecioLista(ctx.db, id, b.lista, co.cents, cr.cents), R.stCerrarPendiente(ctx.db, clave, rolTxt(ctx), 'El Gerente fijó el precio directamente.'), ...audit(ctx, 'precio', p.codigo_sku, nombre, 'cargó el precio por bulto de la categoría', det)]);
      return {estado: 'APLICADO', mensaje: 'Precio cargado: ya rige para los clientes ' + b.lista + '.'};
    }
    await guardarPendiente(ctx, {tipo: 'PRODUCTO', clave, titulo: nombre, detalle: {items: [{id, nombre, lista: b.lista, modalidad: 'ambos', campos}]}}, audit(ctx, 'precio', p.codigo_sku, nombre, 'pidió cargar el precio por bulto de la categoría (pendiente de aprobar)', det));
    return PENDIENTE;
  }
  const v = P.validarPrecioBulto(b.precio); if (v.error) throw err(400, v.error);
  const campo = P.campoLista(b.modalidad), antes = b.modalidad === 'contado' ? fila.contado_cents : fila.credito_cents;
  if (antes === v.cents) return SIN_CAMBIOS;
  const clave = P.claveLista(id, b.lista, b.modalidad), campos = {[campo]: {antes, despues: v.cents}};
  const det = {lista: b.lista, modalidad: b.modalidad, antes: antes / 100}, que = b.modalidad === 'contado' ? 'de contado' : 'a crédito';
  if (modo === 'directo') {
    await R.lote(ctx.db, [R.stPrecioLista(ctx.db, id, b.lista, b.modalidad, v.cents), R.stCerrarPendiente(ctx.db, clave, rolTxt(ctx), 'El Gerente fijó el precio directamente.'),
      ...audit(ctx, 'precio', p.codigo_sku, nombre, `cambió el precio ${que} por bulto`, {...det, despues: v.cents / 100})]);
    return {estado: 'APLICADO', mensaje: 'Precio cambiado: ya rige.'};
  }
  await guardarPendiente(ctx, {tipo: 'PRODUCTO', clave, titulo: nombre, detalle: {items: [{id, nombre, lista: b.lista, modalidad: b.modalidad, campos}]}},
    audit(ctx, 'precio', p.codigo_sku, nombre, `pidió cambiar el precio ${que} por bulto (pendiente de aprobar)`, {...det, nuevo: v.cents / 100}));
  return PENDIENTE;
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
  if (c.tipo === 'PRODUCTO') return it.map(i => i.lista && i.modalidad === 'ambos' ? R.stUpsertPrecioLista(db, i.id, i.lista, i.campos.lista_contado_cents.despues, i.campos.lista_credito_cents.despues) : i.lista ? R.stPrecioLista(db, i.id, i.lista, i.modalidad, i.campos[P.campoLista(i.modalidad)].despues) : R.stPrecioProducto(db, i.id, i.campos.precio_ref_cents.despues));
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
