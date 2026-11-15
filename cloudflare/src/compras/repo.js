/* Compras · capa de datos (único lugar con SQL de este módulo). Proveedores y productos viven en la colección `docs` de la app principal. */
import * as VR from '../ventas/repo.js';
export const all = VR.all, one = VR.one, lote = VR.lote, stAuditoria = VR.stAuditoria;
const bind = (db, sql, a = []) => db.prepare(sql).bind(...a);
const doc = async (db, col, id) => { const r = await VR.one(db, 'SELECT data FROM docs WHERE col = ?1 AND id = ?2', [col, id]); try { return r ? JSON.parse(r.data) : null; } catch (e) { return null; } };
export const proveedor = (db, id) => doc(db, 'proveedores', id);
export const producto = (db, id) => doc(db, 'productos', id);
export const porFactura = (db, prov, norm) => VR.one(db, 'SELECT id, nro FROM compras_pedidos WHERE proveedor_id = ?1 AND factura_norm = ?2', [prov, norm]);
export const ultimoNro = async db => { const r = await VR.one(db, 'SELECT COALESCE(MAX(id), 0) AS m FROM compras_pedidos'); return r.m; };
export const stPedido = (db, p) => bind(db, "INSERT INTO compras_pedidos (nro, proveedor_id, proveedor_nombre, fecha, factura, factura_norm, condicion, plazo_dias, id_banco, banco_nombre, tasa, total_usd_cents, total_bs_cents, estado, rol, creado_ts) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,'PEDIDA',?14,?15)",
  [p.nro, p.proveedor_id, p.proveedor_nombre, p.fecha, p.factura, p.factura_norm, p.condicion, p.plazo_dias, p.id_banco, p.banco_nombre, p.tasa, p.total_usd_cents, p.total_bs_cents, p.rol, Date.now()]);
export const stLinea = (db, nro, l) => bind(db, 'INSERT INTO compras_pedido_lineas (pedido_id, producto_id, producto_nombre, unidad, cantidad, precio_usd, subtotal_cents) VALUES ((SELECT id FROM compras_pedidos WHERE nro = ?1), ?2, ?3, ?4, ?5, ?6, ?7)', [nro, l.producto_id, l.producto_nombre, l.unidad, l.cantidad, l.precio_usd, l.subtotal_cents]);
export const listar = (db, estado) => VR.all(db, `SELECT * FROM compras_pedidos ${estado ? 'WHERE estado = ?1' : ''} ORDER BY id DESC LIMIT 200`, estado ? [estado] : []);
export const lineasDe = (db, ids) => ids.length ? VR.all(db, `SELECT * FROM compras_pedido_lineas WHERE pedido_id IN (${ids.map((_, i) => '?' + (i + 1)).join(',')}) ORDER BY id`, ids) : Promise.resolve([]);
