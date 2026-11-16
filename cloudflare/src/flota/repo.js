/* Flota · capa de datos (único lugar con SQL de este módulo). */
import * as VR from '../ventas/repo.js';
export const all = VR.all, one = VR.one, lote = VR.lote, stAuditoria = VR.stAuditoria;
const bind = (db, sql, a = []) => db.prepare(sql).bind(...a);

export const listar = (db, todos) => VR.all(db, `SELECT * FROM flota ${todos ? '' : "WHERE estado = 'ACTIVO'"} ORDER BY CASE estado WHEN 'ACTIVO' THEN 0 ELSE 1 END, placa COLLATE NOCASE`);
export const get = (db, id) => VR.one(db, 'SELECT * FROM flota WHERE id = ?1', [id]);
export const porPlaca = (db, placa) => VR.one(db, 'SELECT * FROM flota WHERE placa = ?1 COLLATE NOCASE', [placa]);
const A = v => [v.placa, v.tipo, v.marca_modelo, v.capacidad_bultos, v.capacidad_kg, v.estado, v.seguro_vence, v.documentos_vence, v.chofer_id, v.capacidad_pasajeros];
export const stInsertar = (db, v) => bind(db, 'INSERT INTO flota (placa, tipo, marca_modelo, capacidad_bultos, capacidad_kg, estado, seguro_vence, documentos_vence, chofer_id, capacidad_pasajeros, creado_ts, ubicacion_ts) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?11)', [...A(v), Date.now()]);
export const stActualizar = (db, id, v) => bind(db, 'UPDATE flota SET placa = ?2, tipo = ?3, marca_modelo = ?4, capacidad_bultos = ?5, capacidad_kg = ?6, estado = ?7, seguro_vence = ?8, documentos_vence = ?9, chofer_id = ?10, capacidad_pasajeros = ?11, actualizado_ts = ?12 WHERE id = ?1', [id, ...A(v), Date.now()]);
/* Estado de servicio + ubicación anotada, con fecha y puesto de quien lo hizo */
export const stUbicacion = (db, id, u) => bind(db, 'UPDATE flota SET estado = ?2, ubicacion = ?3, destino = ?4, carga_kg = ?5, salida_id = ?6, ubicacion_ts = ?7, ubicacion_rol = ?8, actualizado_ts = ?7 WHERE id = ?1', [id, u.estado, u.ubicacion, u.destino, u.carga_kg, u.salida_id, Date.now(), u.rol]);
/* Salida de despacho reciente asignada a este vehículo (armándose, o despachada en las últimas 72 horas) */
export const salidaReciente = (db, vid) => VR.one(db, "SELECT id_salida FROM salidas WHERE vehiculo_id = ?1 AND (estado = 'ARMANDO' OR (estado = 'DESPACHADA' AND despachada_ts >= ?2)) ORDER BY id_salida DESC LIMIT 1", [vid, Date.now() - 72 * 3600 * 1000]);
export async function salidasPorId(db, ids) {
  if (!ids.length) return new Map();
  const r = await VR.all(db, `SELECT s.id_salida, s.nro, s.estado, s.kilos, COALESCE((SELECT SUM(l.bultos) FROM salida_lineas l WHERE l.id_salida = s.id_salida), 0) AS bultos FROM salidas s WHERE s.id_salida IN (${ids.map((_, i) => '?' + (i + 1)).join(',')})`, ids);
  return new Map(r.map(x => [x.id_salida, x]));
}
/* Personas de nómina (colección «empleados» de la tabla docs) */
export async function empleados(db) {
  const r = await VR.all(db, "SELECT data FROM docs WHERE col = 'empleados'");
  const out = []; for (const x of r) { try { out.push(JSON.parse(x.data)); } catch (e) { /* fila dañada: se ignora */ } }
  return out;
}
