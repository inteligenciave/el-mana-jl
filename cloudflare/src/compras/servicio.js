/* Compras · casos de uso. «Hacer una compra»: Administración y Gerente registran el pedido al proveedor (estado PEDIDA);
   Recepción lo ve como pendiente de recibir (solo lectura). No conoce HTTP. */
import * as C from './dominio.js';
import * as R from './repo.js';
import * as T from '../tasa/servicio.js';
import * as Bancos from '../bancos/servicio.js';
import * as ID from '../inventario/dominio.js';
import {ROL_TXT, nomRol} from '../ventas/permisos.js';

export const err = (status, message, extra = {}) => Object.assign(new Error(message), {status, message, extra});
const exigir = ctx => { if (!C.puedeComprar(ctx.rol)) throw err(403, C.MSG_SIN_PERMISO); };
export const fila = (p, ls) => ({id: p.id, nro: p.nro, proveedor_id: p.proveedor_id, proveedor: p.proveedor_nombre, fecha: p.fecha, factura: p.factura, condicion: p.condicion, plazo_dias: p.plazo_dias, banco: p.banco_nombre,
  tasa: p.tasa, total_usd: p.total_usd_cents / 100, total_bs: p.total_bs_cents / 100, estado: p.estado, pide: nomRol(p.rol), creado_ts: p.creado_ts,
  recepcion_id: p.recepcion_id || null, recibida_ts: p.recibida_ts || null, con_diferencia: !!p.con_diferencia, validada_ts: p.validada_ts || null,
  lineas: ls.filter(l => l.pedido_id === p.id).map(l => ({producto_id: l.producto_id, producto: l.producto_nombre, unidad: l.unidad, cantidad: l.cantidad, precio_usd: l.precio_usd, subtotal_usd: l.subtotal_cents / 100, ...(l.unidad === 'saco' ? {kg_referencia: l.cantidad * C.KG_SACO_REF} : {})}))});

/* Lista: Administración y Gerente ven todo; Producción solo lo pendiente de recibir (sin precios ni banco). */
export async function listar(ctx, estado) {
  const adm = C.puedeComprar(ctx.rol);
  if (!adm && ctx.rol !== 'produccion') throw err(403, C.MSG_SIN_PERMISO);
  const est = adm ? (['PEDIDA', 'RECIBIDA', 'ANULADA'].includes(estado) ? estado : null) : 'PEDIDA';
  const ps = await R.listar(ctx.db, est), ls = await R.lineasDe(ctx.db, ps.map(p => p.id));
  const out = ps.map(p => fila(p, ls));
  if (adm) return {pedidos: out};
  return {pedidos: out.map(p => ({id: p.id, nro: p.nro, proveedor: p.proveedor, fecha: p.fecha, estado: p.estado, lineas: p.lineas.map(l => ({producto_id: l.producto_id, producto: l.producto, unidad: l.unidad, cantidad: l.cantidad, papa: l.unidad === 'saco', ...(l.kg_referencia ? {kg_referencia: l.kg_referencia} : {})}))}))};
}

/* Producto de una línea: del catálogo de compras o, si es «INV:codigo», un insumo del inventario general (en su unidad). Devuelve null si no existe. */
export async function resolverProducto(db, id) {
  if (!C.esInv(id)) return R.producto(db, id);
  const cod = C.codigoInv(id), a = cod === 'papa' ? null : await R.articuloInv(db, cod);
  return a && a.activo ? {tipo: 'insumo', n: a.nombre, cat: a.nombre, sk: a.codigo, unidad: a.unidad, inv: a.codigo} : null;
}
/* Insumos del inventario que se pueden comprar directo: los que NO tienen ya un producto en el catálogo de compras (así no salen dos veces). La papa va siempre por su producto (por saco). */
export async function insumosDirectos(ctx) {
  exigir(ctx);
  const cubiertos = new Set((await R.productosCatalogo(ctx.db)).filter(p => !p.arch && (p.tipo === 'papa' || p.tipo === 'insumo')).map(p => ID.articuloDe(p).codigo));
  const ult = {}; for (const x of await R.preciosInv(ctx.db)) { const u = ult[x.producto_id] || (ult[x.producto_id] = {por_prov: {}}); u.ultimo_usd = x.precio_usd; u.por_prov[x.proveedor_id] = x.precio_usd; }   // último precio pagado por cada insumo (en general y por proveedor)
  /* «Bolsas sin presentación» (empaque) ya no se compra: las compras van a la bolsa de cada presentación; esa existencia la reparte Gerencia/Administración */
  return {insumos: (await R.articulosInv(ctx.db)).filter(a => a.codigo !== 'papa' && a.codigo !== 'empaque' && !cubiertos.has(a.codigo)).map(a => ({id: C.PREFIJO_INV + a.codigo, n: a.nombre, unidad: a.unidad, ...(ult[C.PREFIJO_INV + a.codigo] ? {ultimo_usd: ult[C.PREFIJO_INV + a.codigo].ultimo_usd, precios_prov: ult[C.PREFIJO_INV + a.codigo].por_prov} : {})}))};
}

/* Producto nuevo (sin precio) desde el cuadro del proveedor. Insumo → artículo del inventario general (entra a Existencias, mínimo 0 por definir) que se compra y recibe como «INV:codigo».
   Papa → producto del catálogo de compras (aparece en los productos de papa). Nombre único sin distinguir mayúsculas ni tildes. */
export async function crearProducto(ctx, cuerpo) {
  exigir(ctx);
  const v = C.validarProductoNuevo(cuerpo); if (v.error) throw err(400, v.error);
  const d = v.datos, clave = C.claveNombre(d.nombre);
  const arts = await R.nombresArticulosInv(ctx.db), prods = await R.productosCatalogo(ctx.db);
  if (arts.some(a => C.claveNombre(a.nombre) === clave) || prods.some(p => C.claveNombre(p.n) === clave)) throw err(409, 'Ya existe un producto llamado «' + d.nombre + '». Búscalo en la lista.', {codigo: 'NOMBRE_REPETIDO'});
  const slug = C.slugNombre(d.nombre), aud = id => R.stAuditoria(ctx.db, {rol: ctx.rol, rolTxt: nomRol(ctx.rol), ent: 'prod', ref: id, nom: d.nombre, accion: 'agregó un producto nuevo', detalle: {tipo: d.tipo, unidad: d.unidad}});
  let id, st;
  if (d.tipo === 'insumo') {
    const usados = new Set(arts.map(a => a.codigo)); let cod = slug, i = 2; while (usados.has(cod)) cod = slug + '-' + (i++);
    id = C.PREFIJO_INV + cod; st = [R.stArticuloInvNuevo(ctx.db, {codigo: cod, nombre: d.nombre, unidad: d.unidad})];
  } else {
    const usados = new Set(await R.idsProductos(ctx.db)); let pid = 'PAPA-' + slug, i = 2; while (usados.has(pid)) pid = 'PAPA-' + slug + '-' + (i++);
    id = pid; st = [R.stDoc(ctx.db, 'productos', id, {tipo: 'papa', n: d.nombre, cat: d.nombre, sk: d.nombre, unidad: d.unidad, kgSaco: d.unidad === 'saco' ? C.KG_SACO_REF : null, prov: null, orden: Date.now()})];
  }
  try { await R.lote(ctx.db, [...st, R.stVer(ctx.db), ...aud(id)]); }
  catch (e) { if (/UNIQUE/i.test(String((e && e.message) || e))) throw err(409, 'Ya existe un producto llamado «' + d.nombre + '».', {codigo: 'NOMBRE_REPETIDO'}); throw e; }
  return {producto: {id, n: d.nombre, tipo: d.tipo, unidad: d.unidad}};
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
    const pr = await resolverProducto(ctx.db, l.producto_id);
    if (!pr || pr.arch || (pr.tipo !== 'papa' && pr.tipo !== 'insumo')) throw err(400, 'Hay un producto que no está en el catálogo de compras.');
    const papa = C.esPapaCruda(pr);   // la papa cruda se compra SIEMPRE por saco (cantidad = sacos, precio = por saco)
    if (papa && !Number.isInteger(l.cantidad)) throw err(400, 'La papa cruda se compra por saco: escribe un número entero de sacos.');
    lineas.push({producto_id: l.producto_id, producto_nombre: pr.n, unidad: papa ? 'saco' : (pr.unidad || 'kg'), cantidad: l.cantidad, precio_usd: l.precio_usd, subtotal_cents: C.subtotalCents(l.cantidad, l.precio_usd)});
  }
  const total_usd_cents = lineas.reduce((a, l) => a + l.subtotal_cents, 0);
  const t = await T.tasaPara(ctx.db, null);   // tasa BCV vigente: la pone el servidor, no la pantalla
  const nro = 'CP-' + String((await R.ultimoNro(ctx.db)) + 1).padStart(5, '0');
  const ped = {nro, proveedor_id: d.proveedor_id, proveedor_nombre: prov.nombre, fecha: d.fecha, factura: d.factura, factura_norm: norm, condicion: d.condicion, plazo_dias: d.plazo_dias,
    id_banco: banco ? banco.id : null, banco_nombre: banco ? banco.nombre : null, tasa: t.valor, total_usd_cents, total_bs_cents: C.aBsCents(total_usd_cents, t.valor), rol: ctx.rol};
  try {
    await R.lote(ctx.db, [R.stPedido(ctx.db, ped), ...lineas.map(l => R.stLinea(ctx.db, nro, l)),
      ...R.stAuditoria(ctx.db, {rol: ctx.rol, rolTxt: nomRol(ctx.rol), ent: 'compra', ref: nro, nom: prov.nombre, accion: 'hizo un pedido de compra al proveedor', detalle: {factura: d.factura, condicion: d.condicion, plazo_dias: d.plazo_dias, banco: ped.banco_nombre, total_usd: total_usd_cents / 100, productos: lineas.length}})]);
  } catch (e) {
    if (/UNIQUE/i.test(String((e && e.message) || e))) throw err(409, 'Ya hay una compra con la factura ' + d.factura + ' de ' + prov.nombre + '. Revisa el número.', {codigo: 'FACTURA_REPETIDA'});
    throw e;
  }
  const p = (await R.listar(ctx.db, null)).find(x => x.nro === nro);
  return fila(p, await R.lineasDe(ctx.db, [p.id]));
}
