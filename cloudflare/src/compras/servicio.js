/* Compras · casos de uso. «Hacer una compra»: Administración y Gerente registran el pedido al proveedor (estado PEDIDA);
   Recepción lo ve como pendiente de recibir (solo lectura). No conoce HTTP. */
import * as C from './dominio.js';
import * as R from './repo.js';
import * as T from '../tasa/servicio.js';
import * as Bancos from '../bancos/servicio.js';
import {ROL_TXT} from '../ventas/permisos.js';

export const err = (status, message, extra = {}) => Object.assign(new Error(message), {status, message, extra});
const exigir = ctx => { if (!C.puedeComprar(ctx.rol)) throw err(403, C.MSG_SIN_PERMISO); };
const fila = (p, ls) => ({id: p.id, nro: p.nro, proveedor_id: p.proveedor_id, proveedor: p.proveedor_nombre, fecha: p.fecha, factura: p.factura, condicion: p.condicion, plazo_dias: p.plazo_dias, banco: p.banco_nombre,
  tasa: p.tasa, total_usd: p.total_usd_cents / 100, total_bs: p.total_bs_cents / 100, estado: p.estado, pide: ROL_TXT[p.rol] || p.rol, creado_ts: p.creado_ts,
  lineas: ls.filter(l => l.pedido_id === p.id).map(l => ({producto_id: l.producto_id, producto: l.producto_nombre, unidad: l.unidad, cantidad: l.cantidad, precio_usd: l.precio_usd, subtotal_usd: l.subtotal_cents / 100}))});

/* Lista: Administración y Gerente ven todo; Recepción y Jefe de producción solo lo pendiente de recibir (sin precios ni banco). */
export async function listar(ctx, estado) {
  const adm = C.puedeComprar(ctx.rol);
  if (!adm && ctx.rol !== 'recep' && ctx.rol !== 'jefeprod') throw err(403, C.MSG_SIN_PERMISO);
  const est = adm ? (['PEDIDA', 'RECIBIDA', 'ANULADA'].includes(estado) ? estado : null) : 'PEDIDA';
  const ps = await R.listar(ctx.db, est), ls = await R.lineasDe(ctx.db, ps.map(p => p.id));
  const out = ps.map(p => fila(p, ls));
  if (adm) return {pedidos: out};
  return {pedidos: out.map(p => ({id: p.id, nro: p.nro, proveedor: p.proveedor, fecha: p.fecha, estado: p.estado, lineas: p.lineas.map(l => ({producto: l.producto, unidad: l.unidad, cantidad: l.cantidad}))}))};
}

export async function crear(ctx, cuerpo) {
  exigir(ctx);
  const v = C.validarPedido(cuerpo); if (v.error) throw err(400, v.error);
  const d = v.datos;
  const prov = await R.proveedor(ctx.db, d.proveedor_id);
  if (!prov || prov.arch) throw err(400, 'Ese proveedor no existe o está archivado. Elige otro de la lista.');
  const norm = C.normFactura(d.factura);
  if (await R.porFactura(ctx.db, d.proveedor_id, norm)) throw err(409, 'Ya hay una compra con la factura ' + d.factura + ' de ' + prov.nombre + '. Revisa el número.', {codigo: 'FACTURA_REPETIDA'});
  let banco = null;
  if (d.condicion === 'CONTADO') banco = await Bancos.elegido(ctx.db, d.id_banco);
  const lineas = [];
  for (const l of d.lineas) {
    const pr = await R.producto(ctx.db, l.producto_id);
    if (!pr || pr.arch || (pr.tipo !== 'papa' && pr.tipo !== 'insumo')) throw err(400, 'Hay un producto que no está en el catálogo de compras.');
    lineas.push({producto_id: l.producto_id, producto_nombre: pr.n, unidad: pr.unidad || 'kg', cantidad: l.cantidad, precio_usd: l.precio_usd, subtotal_cents: C.subtotalCents(l.cantidad, l.precio_usd)});
  }
  const total_usd_cents = lineas.reduce((a, l) => a + l.subtotal_cents, 0);
  const t = await T.tasaPara(ctx.db, null);   // tasa BCV vigente: la pone el servidor, no la pantalla
  const nro = 'CP-' + String((await R.ultimoNro(ctx.db)) + 1).padStart(5, '0');
  const ped = {nro, proveedor_id: d.proveedor_id, proveedor_nombre: prov.nombre, fecha: d.fecha, factura: d.factura, factura_norm: norm, condicion: d.condicion, plazo_dias: d.plazo_dias,
    id_banco: banco ? banco.id : null, banco_nombre: banco ? banco.nombre : null, tasa: t.valor, total_usd_cents, total_bs_cents: C.aBsCents(total_usd_cents, t.valor), rol: ctx.rol};
  try {
    await R.lote(ctx.db, [R.stPedido(ctx.db, ped), ...lineas.map(l => R.stLinea(ctx.db, nro, l)),
      ...R.stAuditoria(ctx.db, {rol: ctx.rol, rolTxt: ROL_TXT[ctx.rol] || ctx.rol, ent: 'compra', ref: nro, nom: prov.nombre, accion: 'hizo un pedido de compra al proveedor', detalle: {factura: d.factura, condicion: d.condicion, plazo_dias: d.plazo_dias, banco: ped.banco_nombre, total_usd: total_usd_cents / 100, productos: lineas.length}})]);
  } catch (e) {
    if (/UNIQUE/i.test(String((e && e.message) || e))) throw err(409, 'Ya hay una compra con la factura ' + d.factura + ' de ' + prov.nombre + '. Revisa el número.', {codigo: 'FACTURA_REPETIDA'});
    throw e;
  }
  const p = (await R.listar(ctx.db, null)).find(x => x.nro === nro);
  return fila(p, await R.lineasDe(ctx.db, [p.id]));
}
