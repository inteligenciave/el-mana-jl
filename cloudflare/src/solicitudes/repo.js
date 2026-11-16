/* Solicitudes de autorización · capa de datos (único lugar con SQL de este módulo). */
import * as VR from '../ventas/repo.js';
export const all = VR.all, one = VR.one;
const bind = (db, sql, a = []) => db.prepare(sql).bind(...a);
export const crear = (db, rol, s, ts) => bind(db, "INSERT INTO solicitudes_autorizacion (rol, pantalla, asunto, motivo, estado, creado_ts) VALUES (?1, ?2, ?3, ?4, 'PENDIENTE', ?5)", [rol, s.pantalla, s.asunto, s.motivo, ts]).run();
export const get = (db, id) => VR.one(db, 'SELECT * FROM solicitudes_autorizacion WHERE id = ?1', [id]);
export const propias = (db, rol) => VR.all(db, 'SELECT * FROM solicitudes_autorizacion WHERE rol = ?1 ORDER BY id DESC LIMIT 100', [rol]);
export const todas = db => VR.all(db, "SELECT * FROM solicitudes_autorizacion ORDER BY CASE estado WHEN 'PENDIENTE' THEN 0 ELSE 1 END, id DESC LIMIT 200");
export const pendientes = async db => ((await VR.one(db, "SELECT COUNT(*) AS n FROM solicitudes_autorizacion WHERE estado = 'PENDIENTE'")) || {}).n || 0;
/* Solo resuelve si sigue pendiente (evita responder dos veces) */
export const resolver = (db, id, estado, respuesta, ts, por) => bind(db, "UPDATE solicitudes_autorizacion SET estado = ?2, respuesta = ?3, resuelto_ts = ?4, resuelto_por = ?5 WHERE id = ?1 AND estado = 'PENDIENTE'", [id, estado, respuesta, ts, por]).run();
