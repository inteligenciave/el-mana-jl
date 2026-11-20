/* Compras · capa de datos (único lugar con SQL de este módulo). Proveedores y productos viven en la colección `docs` de la app principal. */
import * as VR from '../ventas/repo.js';
export const all = VR.all, one = VR.one, lote = VR.lote, stAuditoria = VR.stAuditoria;
const bind = (db, sql, a = []) => db.prepare(sql).bind(...a);
const doc = async (db, col, id) => { const r = await VR.one(db, 'SELECT data FROM docs WHERE col = ?1 AND id = ?2', [col, id]); try { return r ? JSON.parse(r.data) : null; } catch (e) { return null; } };
export const articuloInv = (db, codigo) => VR.one(db, 'SELECT codigo, nombre, unidad, activo FROM inv_articulos WHERE codigo = ?1', [codigo]);
/* Precios de compra de los insumos del inventario (INV:codigo), del más viejo al más nuevo: de ahí sale el último precio de referencia (solo Administración y Gerencia llegan aquí) */
export const preciosInv = db => VR.all(db, "SELECT l.producto_id, l.precio_usd, p.proveedor_id FROM compras_pedido_lineas l JOIN compras_pedidos p ON p.id = l.pedido_id WHERE l.producto_id LIKE 'INV:%' AND p.estado <> 'ANULADA' ORDER BY p.id, l.id");
export const articulosInv = db => VR.all(db, 'SELECT codigo, nombre, unidad FROM inv_articulos WHERE activo = 1 ORDER BY orden, nombre');
export const productosCatalogo = async db => (await VR.all(db, "SELECT data FROM docs WHERE col = 'productos'")).map(r => { try { return JSON.parse(r.data); } catch (e) { return null; } }).filter(Boolean);
export const nombresArticulosInv = db => VR.all(db, 'SELECT codigo, nombre FROM inv_articulos');
export const idsProductos = async db => (await VR.all(db, "SELECT id FROM docs WHERE col = 'productos'")).map(r => r.id);
export const stArticuloInvNuevo = (db, a) => bind(db, 'INSERT INTO inv_articulos (codigo, nombre, unidad, minimo, orden, activo) VALUES (?1, ?2, ?3, 0, 99, 1)', [a.codigo, a.nombre, a.unidad]);
export const proveedor = (db, id) => doc(db, 'proveedores', id);
export const producto = (db, id) => doc(db, 'productos', id);
export const porFactura = (db, prov, norm) => VR.one(db, 'SELECT id, nro FROM compras_pedidos WHERE proveedor_id = ?1 AND factura_norm = ?2', [prov, norm]);
export const ultimoNro = async db => { const r = await VR.one(db, 'SELECT COALESCE(MAX(id), 0) AS m FROM compras_pedidos'); return r.m; };
export const stPedido = (db, p) => bind(db, "INSERT INTO compras_pedidos (nro, proveedor_id, proveedor_nombre, fecha, factura, factura_norm, condicion, plazo_dias, id_banco, banco_nombre, tasa, total_usd_cents, total_bs_cents, estado, rol, creado_ts) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,'PEDIDA',?14,?15)",
  [p.nro, p.proveedor_id, p.proveedor_nombre, p.fecha, p.factura, p.factura_norm, p.condicion, p.plazo_dias, p.id_banco, p.banco_nombre, p.tasa, p.total_usd_cents, p.total_bs_cents, p.rol, Date.now()]);
export const stLinea = (db, nro, l) => bind(db, 'INSERT INTO compras_pedido_lineas (pedido_id, producto_id, producto_nombre, unidad, cantidad, precio_usd, subtotal_cents) VALUES ((SELECT id FROM compras_pedidos WHERE nro = ?1), ?2, ?3, ?4, ?5, ?6, ?7)', [nro, l.producto_id, l.producto_nombre, l.unidad, l.cantidad, l.precio_usd, l.subtotal_cents]);
export const listar = (db, estado) => VR.all(db, `SELECT * FROM compras_pedidos ${estado ? 'WHERE estado = ?1' : ''} ORDER BY id DESC LIMIT 200`, estado ? [estado] : []);
export const lineasDe = (db, ids) => ids.length ? VR.all(db, `SELECT * FROM compras_pedido_lineas WHERE pedido_id IN (${ids.map((_, i) => '?' + (i + 1)).join(',')}) ORDER BY id`, ids) : Promise.resolve([]);

/* ---------- Recepción enlazada, diferencias y avisos ---------- */
export const pedidoPorNro = (db, nro) => VR.one(db, 'SELECT * FROM compras_pedidos WHERE nro = ?1', [nro]);
export const lineasDePedido = (db, id) => VR.all(db, 'SELECT * FROM compras_pedido_lineas WHERE pedido_id = ?1 ORDER BY id', [id]);
export const recepcionesDePedido = async (db, nro) => (await VR.all(db, "SELECT id, data FROM docs WHERE col = 'recepciones' AND id LIKE ?1 ORDER BY id", ['REC-' + nro + '-%'])).map(r => { try { return JSON.parse(r.data); } catch (e) { return null; } }).filter(Boolean);
export const stDoc = (db, col, id, data) => bind(db, 'INSERT INTO docs (col, id, data, updated) VALUES (?1, ?2, ?3, ?4)', [col, id, JSON.stringify({id, ...data}), Date.now()]);
export const stDocActualizar = (db, col, id, data) => bind(db, 'UPDATE docs SET data = ?3, updated = ?4 WHERE col = ?1 AND id = ?2', [col, id, JSON.stringify({id, ...data}), Date.now()]);
export const stVer = db => bind(db, 'UPDATE ver SET v = v + 1 WHERE id = 1');
export const stRecibido = (db, nro, p) => bind(db, "UPDATE compras_pedidos SET estado = 'RECIBIDA', recepcion_id = ?2, recibida_ts = ?3, recibida_rol = ?4, con_diferencia = ?5, validada_ts = ?3, validada_rol = ?4 WHERE nro = ?1 AND estado = 'PEDIDA'", [nro, p.recepcion_id, Date.now(), p.rol, p.con_diferencia ? 1 : 0]);
export const stDiferencia = (db, d) => bind(db, 'INSERT INTO compras_diferencias (nro, recepcion_id, producto_id, producto_nombre, unidad, comprado, recibido, diferencia, motivo, rol, ts) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)',
  [d.nro, d.recepcion_id || null, d.producto_id, d.producto_nombre, d.unidad, d.comprado, d.recibido, d.diferencia, d.motivo, d.rol, Date.now()]);
export const diferenciasDe = (db, nro) => VR.all(db, 'SELECT * FROM compras_diferencias WHERE nro = ?1 ORDER BY id', [nro]);
export const listarDiferencias = (db, limite = 100) => VR.all(db, 'SELECT * FROM compras_diferencias ORDER BY id DESC LIMIT ?1', [limite]);
export const stAlerta = (db, a) => bind(db, "INSERT INTO alertas_admin (tipo, ref, titulo, detalle, estado, creado_ts, creado_rol) VALUES (?1,?2,?3,?4,'PENDIENTE',?5,?6) ON CONFLICT(tipo, ref) DO NOTHING", [a.tipo, a.ref, a.titulo, JSON.stringify(a.detalle || {}), Date.now(), a.rol]);
export const stAtenderAlerta = (db, tipo, ref, rol) => bind(db, "UPDATE alertas_admin SET estado = 'ATENDIDA', atendida_ts = ?3, atendida_rol = ?4 WHERE tipo = ?1 AND ref = ?2 AND estado = 'PENDIENTE'", [tipo, ref, Date.now(), rol]);
export const alertas = (db, estado) => VR.all(db, `SELECT * FROM alertas_admin ${estado ? 'WHERE estado = ?1' : ''} ORDER BY id DESC LIMIT 100`, estado ? [estado] : []);
export const proveedorDoc = proveedor;
export async function config(db, clave) { const r = await VR.one(db, 'SELECT valor FROM config WHERE clave = ?1', [clave]); return r ? r.valor : null; }

/* Lo recibido HOY contra una compra (para la lista «Recibidas hoy») y las diferencias de hoy */
export const recepcionesHoy = async (db, fecha) => (await VR.all(db, "SELECT data FROM docs WHERE col = 'recepciones' AND json_extract(data, '$.pedido') IS NOT NULL AND json_extract(data, '$.entReal') = ?1 ORDER BY updated DESC", [fecha])).map(r => { try { return JSON.parse(r.data); } catch (e) { return null; } }).filter(Boolean);
export const diferenciasDesde = (db, ts) => VR.all(db, 'SELECT * FROM compras_diferencias WHERE ts >= ?1 ORDER BY id DESC', [ts]);
