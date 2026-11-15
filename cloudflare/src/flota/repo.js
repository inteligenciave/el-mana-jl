/* Flota · capa de datos (único lugar con SQL de este módulo). */
import * as VR from '../ventas/repo.js';
export const all = VR.all, one = VR.one, lote = VR.lote, stAuditoria = VR.stAuditoria;
const bind = (db, sql, a = []) => db.prepare(sql).bind(...a);

export const listar = (db, todos) => VR.all(db, `SELECT * FROM flota ${todos ? '' : "WHERE estado = 'ACTIVO'"} ORDER BY CASE estado WHEN 'ACTIVO' THEN 0 ELSE 1 END, placa COLLATE NOCASE`);
export const get = (db, id) => VR.one(db, 'SELECT * FROM flota WHERE id = ?1', [id]);
export const porPlaca = (db, placa) => VR.one(db, 'SELECT * FROM flota WHERE placa = ?1 COLLATE NOCASE', [placa]);
const A = v => [v.placa, v.tipo, v.marca_modelo, v.capacidad_bultos, v.capacidad_kg, v.estado, v.seguro_vence, v.documentos_vence, v.chofer_id];
export const stInsertar = (db, v) => bind(db, 'INSERT INTO flota (placa, tipo, marca_modelo, capacidad_bultos, capacidad_kg, estado, seguro_vence, documentos_vence, chofer_id, creado_ts) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)', [...A(v), Date.now()]);
export const stActualizar = (db, id, v) => bind(db, 'UPDATE flota SET placa = ?2, tipo = ?3, marca_modelo = ?4, capacidad_bultos = ?5, capacidad_kg = ?6, estado = ?7, seguro_vence = ?8, documentos_vence = ?9, chofer_id = ?10, actualizado_ts = ?11 WHERE id = ?1', [id, ...A(v), Date.now()]);
export const stEstado = (db, id, estado) => bind(db, 'UPDATE flota SET estado = ?2, actualizado_ts = ?3 WHERE id = ?1', [id, estado, Date.now()]);
/* Personas de nómina (colección «empleados» de la tabla docs) */
export async function empleados(db) {
  const r = await VR.all(db, "SELECT data FROM docs WHERE col = 'empleados'");
  const out = []; for (const x of r) { try { out.push(JSON.parse(x.data)); } catch (e) { /* fila dañada: se ignora */ } }
  return out;
}
