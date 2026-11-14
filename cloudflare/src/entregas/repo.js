/* Entregas · capa de datos (único lugar con SQL de este módulo). Reutiliza los ayudantes de Ventas. */
import {all, one, run, lote} from '../ventas/repo.js';
import * as VR from '../ventas/repo.js';
export {all, one, run, lote};
export const stAuditoria = VR.stAuditoria;
const bind = (db, sql, a = []) => db.prepare(sql).bind(...a);
const marcas = ids => ids.map((_, i) => '?' + (i + 1)).join(',');

const PAGADO = "COALESCE((SELECT SUM(a.usd_cents) FROM pago_aplicaciones a JOIN pagos p ON p.id_pago = a.id_pago WHERE a.id_documento = d.id_documento AND p.estado = 'ACTIVO'), 0)";
const COLS_DOC = 'd.id_documento, d.nro_control_interno, d.numero_externo, d.tipo_origen, d.estado AS estado_doc, d.fecha_emision, d.total_cents, d.id_cliente, c.razon_social, c.rif_id';
const VIGENTE = "e.estado IN ('SUBIDA','CONFIRMADA')";

/* ---------- Ajustes ---------- */
export const leerAjustes = db => one(db, 'SELECT * FROM ajustes_credito WHERE id = 1');
export const stGuardarAjustes = (db, a, rol) => bind(db, 'UPDATE ajustes_credito SET dias_tramo1 = ?1, dias_tramo2 = ?2, descuento1_pct = ?3, descuento2_pct = ?4, recargo_mora_pct = ?5, actualizado_ts = ?6, actualizado_rol = ?7 WHERE id = 1',
  [a.dias_tramo1, a.dias_tramo2, a.descuento1_pct, a.descuento2_pct, a.recargo_mora_pct, Date.now(), rol]);

/* ---------- Documentos ---------- */
export const documento = (db, id) => one(db, `SELECT ${COLS_DOC}, d.origen, d.sin_lineas, ${PAGADO} AS pagado_cents FROM documentos_venta d JOIN clientes c ON c.id_cliente = d.id_cliente WHERE d.id_documento = ?1`, [id]);

/* Facturas y notas pendientes de cobro SIN foto vigente: «entrega sin verificar». Las importadas del Excel (historia) no entran. */
export const sinVerificar = db => all(db, `SELECT ${COLS_DOC}, (SELECT e.estado FROM entregas e WHERE e.id_documento = d.id_documento ORDER BY e.id DESC LIMIT 1) AS ultima, (SELECT e.motivo_rechazo FROM entregas e WHERE e.id_documento = d.id_documento ORDER BY e.id DESC LIMIT 1) AS ultimo_motivo
  FROM documentos_venta d JOIN clientes c ON c.id_cliente = d.id_cliente
  WHERE d.estado = 'PENDIENTE' AND d.origen <> 'importado' AND NOT EXISTS (SELECT 1 FROM entregas e WHERE e.id_documento = d.id_documento AND ${VIGENTE})
  ORDER BY d.fecha_emision, d.id_documento`);

/* ---------- Entregas (la foto NO viaja en las listas) ---------- */
const COLS_ENT = 'e.id, e.id_documento, e.fecha_hora, e.foto_ts, e.subido_ts, e.subido_rol, e.foto_bytes, e.estado, e.confirmado_ts, e.confirmado_rol, e.motivo_rechazo, e.ejemplo';
export const listarEntregas = (db, {estado}) => all(db, `SELECT ${COLS_ENT}, ${COLS_DOC} FROM entregas e JOIN documentos_venta d ON d.id_documento = e.id_documento JOIN clientes c ON c.id_cliente = d.id_cliente
  WHERE e.estado <> 'REEMPLAZADA' ${estado ? 'AND e.estado = ?1' : ''} ORDER BY e.foto_ts DESC, e.id DESC LIMIT 500`, estado ? [estado] : []);
export const entregaPorId = (db, id) => one(db, `SELECT ${COLS_ENT}, ${COLS_DOC} FROM entregas e JOIN documentos_venta d ON d.id_documento = e.id_documento JOIN clientes c ON c.id_cliente = d.id_cliente WHERE e.id = ?1`, [id]);
export const fotoDe = (db, id) => one(db, 'SELECT foto FROM entregas WHERE id = ?1', [id]);
export const minisDe = (db, ids) => ids.length ? all(db, `SELECT id, mini FROM entregas WHERE id IN (${marcas(ids)})`, ids) : Promise.resolve([]);
export const entregaVigente = (db, idDoc) => one(db, `SELECT e.id, e.estado, e.foto_ts, e.fecha_hora FROM entregas e WHERE e.id_documento = ?1 AND ${VIGENTE}`, [idDoc]);
export const stReemplazar = (db, id) => bind(db, "UPDATE entregas SET estado = 'REEMPLAZADA' WHERE id = ?1 AND estado = 'SUBIDA'", [id]);
export const stInsertarEntrega = (db, e) => bind(db, "INSERT INTO entregas (id_documento, fecha_hora, foto_ts, subido_ts, subido_rol, foto, mini, foto_bytes, estado, ejemplo) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'SUBIDA',?9)",
  [e.id_documento, e.fecha_hora, e.foto_ts, Date.now(), e.subido_rol, e.foto, e.mini || null, e.foto_bytes, e.ejemplo ? 1 : 0]);
export const stResolverEntrega = (db, id, estado, rol, motivo) => bind(db, "UPDATE entregas SET estado = ?2, confirmado_ts = ?3, confirmado_rol = ?4, motivo_rechazo = ?5 WHERE id = ?1 AND estado IN ('SUBIDA','CONFIRMADA')", [id, estado, Date.now(), rol, motivo || null]);

/* ---------- Plazos: documentos pendientes con foto vigente, y sus pausas ---------- */
export const conEntrega = db => all(db, `SELECT ${COLS_DOC}, ${PAGADO} AS pagado_cents, e.id AS id_entrega, e.foto_ts, e.fecha_hora, e.estado AS estado_entrega
  FROM entregas e JOIN documentos_venta d ON d.id_documento = e.id_documento JOIN clientes c ON c.id_cliente = d.id_cliente WHERE ${VIGENTE} AND d.estado = 'PENDIENTE' ORDER BY e.foto_ts`);
export const entregaDeDoc = (db, idDoc) => one(db, `SELECT e.id AS id_entrega, e.foto_ts, e.fecha_hora, e.estado AS estado_entrega FROM entregas e WHERE e.id_documento = ?1 AND ${VIGENTE}`, [idDoc]);
export const pausasDe = (db, ids) => ids.length ? all(db, `SELECT id_documento, creado_ts AS desde_ts, resuelto_ts AS hasta_ts FROM disputas_entrega WHERE id_documento IN (${marcas(ids)})`, ids) : Promise.resolve([]);

/* ---------- Disputas ---------- */
const COLS_DISP = 'x.id, x.id_documento, x.id_cliente, x.estado, x.nota_cliente, x.creado_ts, x.resuelto_ts, x.resuelto_rol, x.resolucion, x.nota_resolucion';
export const listarDisputas = (db, estado) => all(db, `SELECT ${COLS_DISP}, ${COLS_DOC} FROM disputas_entrega x JOIN documentos_venta d ON d.id_documento = x.id_documento JOIN clientes c ON c.id_cliente = x.id_cliente
  ${estado ? 'WHERE x.estado = ?1' : ''} ORDER BY (x.estado = 'ABIERTA') DESC, x.creado_ts DESC LIMIT 300`, estado ? [estado] : []);
export const disputaPorId = (db, id) => one(db, `SELECT ${COLS_DISP} FROM disputas_entrega x WHERE x.id = ?1`, [id]);
export const disputaAbierta = (db, idDoc) => one(db, "SELECT id, creado_ts FROM disputas_entrega WHERE id_documento = ?1 AND estado = 'ABIERTA'", [idDoc]);
export const contarDisputas = async (db, idDoc) => (await one(db, 'SELECT COUNT(*) AS n FROM disputas_entrega WHERE id_documento = ?1', [idDoc])).n;
export const stNuevaDisputa = (db, d) => bind(db, 'INSERT INTO disputas_entrega (id_documento, id_cliente, nota_cliente, creado_ts, ejemplo) VALUES (?1,?2,?3,?4,?5)', [d.id_documento, d.id_cliente, d.nota_cliente || null, d.creado_ts, d.ejemplo ? 1 : 0]);
export const stResolverDisputa = (db, id, resolucion, rol, nota, ts) => bind(db, "UPDATE disputas_entrega SET estado = 'RESUELTA', resolucion = ?2, resuelto_rol = ?3, nota_resolucion = ?4, resuelto_ts = ?5 WHERE id = ?1 AND estado = 'ABIERTA'", [id, resolucion, rol, nota || null, ts]);
export const disputasDeCliente = (db, idCliente) => all(db, 'SELECT id, id_documento, estado, creado_ts, resuelto_ts, resolucion FROM disputas_entrega WHERE id_cliente = ?1 ORDER BY id DESC LIMIT 100', [idCliente]);
/* Documentos pendientes de UN cliente (el portal nunca recibe un id: viene del código) */
export const docsPendientesCliente = (db, idCliente) => all(db, `SELECT ${COLS_DOC}, d.origen, ${PAGADO} AS pagado_cents, (SELECT e.foto_ts FROM entregas e WHERE e.id_documento = d.id_documento AND ${VIGENTE}) AS foto_ts, (SELECT e.fecha_hora FROM entregas e WHERE e.id_documento = d.id_documento AND ${VIGENTE}) AS fecha_hora
  FROM documentos_venta d JOIN clientes c ON c.id_cliente = d.id_cliente WHERE d.id_cliente = ?1 AND d.estado = 'PENDIENTE' ORDER BY d.fecha_emision, d.id_documento`, [idCliente]);
