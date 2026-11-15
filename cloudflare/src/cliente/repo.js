/* Acceso a datos del portal del cliente: ÚNICO lugar con SQL de estas tablas. Usa las utilidades de la capa de Ventas. */
import {all, one, run} from '../ventas/repo.js';
export {siguiente, one, all, run, lote} from '../ventas/repo.js';

const bind = (db, sql, a = []) => db.prepare(sql).bind(...a);

/* ---------- Enlaces ---------- */
export const stNuevoEnlace = (db, e) => bind(db, 'INSERT INTO cliente_enlaces (id_cliente, token_hash, token_fin, creado_ts, creado_rol, vence_ts) VALUES (?1,?2,?3,?4,?5,?6)', [e.id_cliente, e.token_hash, e.token_fin, Date.now(), e.creado_rol, e.vence_ts ?? null]);
export const stRevocarActivos = (db, idCliente, rol) => bind(db, 'UPDATE cliente_enlaces SET revocado_ts = ?2, revocado_rol = ?3 WHERE id_cliente = ?1 AND revocado_ts IS NULL', [idCliente, Date.now(), rol]);
export const enlacePorHash = (db, h) => one(db, 'SELECT * FROM cliente_enlaces WHERE token_hash = ?1', [h]);
export const tocarUso = (db, id) => run(db, 'UPDATE cliente_enlaces SET ultimo_uso_ts = ?2 WHERE id = ?1', [id, Date.now()]);
export const enlacesDe = (db, idCliente) => all(db, 'SELECT id, token_fin, creado_ts, creado_rol, vence_ts, revocado_ts, revocado_rol, ultimo_uso_ts FROM cliente_enlaces WHERE id_cliente = ?1 ORDER BY id DESC LIMIT 10', [idCliente]);

/* ---------- Intentos con código inválido (por IP, en D1: valen entre instancias del Worker) ---------- */
export async function intentos(db, ip, ventana) { const r = await one(db, 'SELECT n FROM portal_intentos WHERE ip = ?1 AND ventana = ?2', [ip, ventana]); return r ? r.n : 0; }
export async function sumarIntento(db, ip, ventana) {
  await run(db, 'INSERT INTO portal_intentos (ip, ventana, n) VALUES (?1, ?2, 1) ON CONFLICT(ip, ventana) DO UPDATE SET n = n + 1', [ip, ventana]);
  await run(db, 'DELETE FROM portal_intentos WHERE ventana < ?1', [ventana - 4]);
}

/* ---------- Pedidos del portal ---------- */
export const stPedido = (db, p) => bind(db, "INSERT INTO pedidos_portal (id, id_cliente, estado, total_cents, nota, creado_ts, id_enlace, ejemplo) VALUES (?1,?2,'POR_CONFIRMAR',?3,?4,?5,?6,?7)", [p.id, p.id_cliente, p.total_cents, p.nota ?? null, Date.now(), p.id_enlace ?? null, p.ejemplo ? 1 : 0]);
export const stPedidoLinea = (db, idPedido, l) => bind(db, 'INSERT INTO pedido_portal_lineas (id_pedido, id_producto, sku, nombre, cantidad, precio_cents, alicuota) VALUES (?1,?2,?3,?4,?5,?6,?7)', [idPedido, l.id_producto, l.sku, l.nombre, l.cantidad, l.precio_cents, l.alicuota]);
export const pedidosDeCliente = (db, idCliente) => all(db, 'SELECT * FROM pedidos_portal WHERE id_cliente = ?1 ORDER BY id DESC LIMIT 50', [idCliente]);
export const getPedido = (db, id) => one(db, 'SELECT p.*, c.razon_social, c.rif_id, c.modalidad_despacho_pref FROM pedidos_portal p JOIN clientes c ON c.id_cliente = p.id_cliente WHERE p.id = ?1', [id]);
export const pedidosEquipo = (db, estado) => all(db, 'SELECT p.*, c.razon_social, c.rif_id, c.zona, c.modalidad_despacho_pref FROM pedidos_portal p JOIN clientes c ON c.id_cliente = p.id_cliente WHERE (?1 IS NULL OR p.estado = ?1) ORDER BY p.id DESC LIMIT 200', [estado || null]);
export async function lineasDePedidos(db, ids) { if (!ids.length) return []; return all(db, `SELECT * FROM pedido_portal_lineas WHERE id_pedido IN (${ids.map((_, i) => '?' + (i + 1)).join(',')}) ORDER BY id`, ids); }
export async function totalesAbiertos(db, idCliente) { const r = await one(db, "SELECT COALESCE(SUM(total_cents),0) AS t, COUNT(*) AS n FROM pedidos_portal WHERE id_cliente = ?1 AND estado IN ('POR_CONFIRMAR','APROBANDO')", [idCliente]); return {total_cents: r.t, n: r.n}; }
/* Cambio de estado atómico: solo si sigue en el estado esperado. Devuelve true si este llamado fue el que lo cambió. */
export async function moverPedido(db, id, de, a, campos = {}) {
  const r = await run(db, 'UPDATE pedidos_portal SET estado = ?3, resuelto_ts = COALESCE(?4, resuelto_ts), resuelto_rol = COALESCE(?5, resuelto_rol), motivo_rechazo = COALESCE(?6, motivo_rechazo), id_documento = COALESCE(?7, id_documento) WHERE id = ?1 AND estado = ?2',
    [id, de, a, campos.ts ?? null, campos.rol ?? null, campos.motivo ?? null, campos.id_documento ?? null]);
  return !!(r.meta && r.meta.changes > 0);
}

/* ---------- Pagos reportados ---------- */
/* El comprobante (imagen en base64) NUNCA viaja en las listas: solo un aviso de que existe. Se pide aparte, de uno en uno. */
const COLS_PAGO = 'p.id, p.id_cliente, p.fecha_pago, p.banco, p.referencia, p.ref_norm, p.dup_key, p.monto_bs_cents, p.nota, p.estado, p.creado_ts, p.id_enlace, p.resuelto_ts, p.resuelto_rol, p.motivo_rechazo, p.id_pago, p.ejemplo, p.id_banco, (p.comprobante IS NOT NULL) AS tiene_comprobante';
export const comprobanteDe = (db, id) => one(db, 'SELECT comprobante, id_cliente FROM pagos_reportados WHERE id = ?1', [id]);
export const stPagoReportado = (db, p) => bind(db, "INSERT INTO pagos_reportados (id, id_cliente, fecha_pago, banco, referencia, ref_norm, dup_key, monto_bs_cents, nota, estado, creado_ts, id_enlace, ejemplo, id_banco, comprobante, comprobante_bytes) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'POR_VERIFICAR',?10,?11,?12,?13,?14,?15)",
  [p.id, p.id_cliente, p.fecha_pago, p.banco, p.referencia, p.ref_norm, p.dup_key ?? null, p.monto_bs_cents, p.nota ?? null, Date.now(), p.id_enlace ?? null, p.ejemplo ? 1 : 0, p.id_banco ?? null, p.comprobante ?? null, p.comprobante_bytes ?? null]);
export const pagosReportadosDe = (db, idCliente) => all(db, `SELECT ${COLS_PAGO} FROM pagos_reportados p WHERE p.id_cliente = ?1 ORDER BY p.id DESC LIMIT 50`, [idCliente]);
export const getPagoReportado = (db, id) => one(db, `SELECT ${COLS_PAGO}, c.razon_social, c.rif_id FROM pagos_reportados p JOIN clientes c ON c.id_cliente = p.id_cliente WHERE p.id = ?1`, [id]);
export const pagosReportadosEquipo = (db, estado) => all(db, `SELECT ${COLS_PAGO}, c.razon_social, c.rif_id, c.zona FROM pagos_reportados p JOIN clientes c ON c.id_cliente = p.id_cliente WHERE (?1 IS NULL OR p.estado = ?1) ORDER BY p.id DESC LIMIT 200`, [estado || null]);
export async function abiertosPagos(db, idCliente) { return (await one(db, "SELECT COUNT(*) AS n FROM pagos_reportados WHERE id_cliente = ?1 AND estado IN ('POR_VERIFICAR','VERIFICANDO')", [idCliente])).n; }
export async function moverPagoReportado(db, id, de, a, campos = {}) {
  const r = await run(db, 'UPDATE pagos_reportados SET estado = ?3, resuelto_ts = COALESCE(?4, resuelto_ts), resuelto_rol = COALESCE(?5, resuelto_rol), motivo_rechazo = COALESCE(?6, motivo_rechazo), id_pago = COALESCE(?7, id_pago) WHERE id = ?1 AND estado = ?2',
    [id, de, a, campos.ts ?? null, campos.rol ?? null, campos.motivo ?? null, campos.id_pago ?? null]);
  return !!(r.meta && r.meta.changes > 0);
}

/* ---------- Conteos para el equipo ---------- */
export async function resumenEquipo(db) {
  const a = await one(db, "SELECT COUNT(*) AS n FROM pedidos_portal WHERE estado IN ('POR_CONFIRMAR','APROBANDO')");
  const b = await one(db, "SELECT COUNT(*) AS n FROM pagos_reportados WHERE estado IN ('POR_VERIFICAR','VERIFICANDO')");
  return {pedidos_por_confirmar: a.n, pagos_por_verificar: b.n};
}
export async function conteosPorCliente(db) {
  const [p, g, e] = await Promise.all([
    all(db, "SELECT id_cliente, COUNT(*) AS n FROM pedidos_portal WHERE estado IN ('POR_CONFIRMAR','APROBANDO') GROUP BY id_cliente"),
    all(db, "SELECT id_cliente, COUNT(*) AS n FROM pagos_reportados WHERE estado IN ('POR_VERIFICAR','VERIFICANDO') GROUP BY id_cliente"),
    all(db, 'SELECT id_cliente, MAX(id) AS id, MAX(vence_ts) AS vence_ts FROM cliente_enlaces WHERE revocado_ts IS NULL GROUP BY id_cliente')]);
  return {pedidos: new Map(p.map(x => [x.id_cliente, x.n])), pagos: new Map(g.map(x => [x.id_cliente, x.n])), enlaces: new Set(e.map(x => x.id_cliente))};
}
export const nombreLista = (db, id) => id ? one(db, 'SELECT nombre FROM listas_precio WHERE id = ?1', [id]) : Promise.resolve(null);

/* ---------- Estado de cuenta del cliente (siempre filtrado por id_cliente) ---------- */
export const notasAjusteDeCliente = (db, idCliente) => all(db, 'SELECT n.id_nota_ajuste, n.tipo_nota, n.nro_fiscal_nota, n.fecha_emision, n.motivo_ajuste, n.total_ajuste_cents, d.nro_factura_fiscal, d.nro_control_interno FROM notas_ajuste_fiscal n JOIN documentos_venta d ON d.id_documento = n.id_factura_origen WHERE d.id_cliente = ?1 ORDER BY n.id_nota_ajuste DESC LIMIT 100', [idCliente]);
export const documentosDeAplicacion = (db, ids) => ids.length ? all(db, `SELECT a.id_pago, d.nro_control_interno, d.numero_externo FROM pago_aplicaciones a JOIN documentos_venta d ON d.id_documento = a.id_documento WHERE a.id_pago IN (${ids.map((_, i) => '?' + (i + 1)).join(',')})`, ids) : Promise.resolve([]);
