/* Importar del lector · capa de datos (único lugar con SQL de esta función). */
import * as VR from '../ventas/repo.js';
export {empleados, empleado, stAuditoria, lote, stVer} from './repo.js';
const bind = (db, sql, a = []) => db.prepare(sql).bind(...a);

export const crudasEntre = (db, desde, hasta) => VR.all(db, 'SELECT codigo, momento, fecha, ts, nombre_lector FROM lector_marcas WHERE fecha >= ?1 AND fecha <= ?2 ORDER BY ts', [desde, hasta]);
/* Si ya estaba (mismo código y misma hora) no hace nada: así importar dos veces el mismo archivo no duplica */
export const stCruda = (db, m, fuente, quien, ts) => bind(db, 'INSERT OR IGNORE INTO lector_marcas (codigo, momento, fecha, ts, nombre_lector, departamento, punto, fuente, quien, creado_ts) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)', [m.codigo, m.momento, m.fecha, m.ts, m.nombre || null, m.departamento || null, m.punto || null, fuente, quien, ts]);
export const diasEntre = (db, desde, hasta) => VR.all(db, 'SELECT * FROM lector_dias WHERE fecha >= ?1 AND fecha <= ?2', [desde, hasta]);
export const diasPendientes = db => VR.all(db, "SELECT * FROM lector_dias WHERE estado IN ('codigo_nuevo','por_revisar','sin_turno') ORDER BY fecha, codigo");
export const diasDeCodigo = (db, codigo) => VR.all(db, "SELECT * FROM lector_dias WHERE codigo = ?1 AND estado IN ('codigo_nuevo','por_revisar','sin_turno') ORDER BY fecha", [codigo]);
export const diaPorId = (db, id) => VR.one(db, 'SELECT * FROM lector_dias WHERE id = ?1', [id]);
/* Solo se reescribe un día que sigue pendiente: lo confirmado o descartado por una persona no se toca */
export const stDia = (db, d, ts) => bind(db, `INSERT INTO lector_dias (codigo, fecha, empleado_id, estado, motivo, turno, entrada_ts, salida_ts, n_marcas, decidio, ts) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)
  ON CONFLICT(codigo, fecha) DO UPDATE SET empleado_id = excluded.empleado_id, estado = excluded.estado, motivo = excluded.motivo, turno = excluded.turno, entrada_ts = excluded.entrada_ts, salida_ts = excluded.salida_ts, n_marcas = excluded.n_marcas, decidio = excluded.decidio, ts = excluded.ts
  WHERE lector_dias.estado IN ('codigo_nuevo','por_revisar','sin_turno')`, [d.codigo, d.fecha, d.empleado_id || null, d.estado, d.motivo || null, d.turno || null, d.entrada_ts || null, d.salida_ts || null, d.n_marcas, d.decidio || null, ts]);
export const stDiaDecidido = (db, id, estado, d, ts) => bind(db, "UPDATE lector_dias SET estado = ?2, turno = ?3, entrada_ts = ?4, salida_ts = ?5, decidio = ?6, ts = ?7 WHERE id = ?1 AND estado IN ('codigo_nuevo','por_revisar','sin_turno')", [id, estado, d.turno || null, d.entrada_ts || null, d.salida_ts || null, d.decidio || null, ts]);
export const marcasDelDia = (db, emp, fecha) => VR.all(db, 'SELECT id, origen FROM marcas WHERE empleado_id = ?1 AND fecha = ?2', [emp, fecha]);
/* La asistencia vigente (tabla «marcas», la misma de «En planta hoy») recibe el día confirmado */
export const stMarcaLector = (db, m, ts) => bind(db, "INSERT INTO marcas (empleado_id, fecha, entrada_ts, salida_ts, turno, quien, creado_ts, origen) VALUES (?1,?2,?3,?4,?5,?6,?7,'lector')", [m.empleado_id, m.fecha, m.entrada_ts, m.salida_ts, m.turno, m.quien, ts]);
export const stCodigoEmpleado = (db, id, codigo, ts) => bind(db, "UPDATE docs SET data = json_set(data, '$.codigo_lector', ?2), updated = ?3 WHERE col = 'empleados' AND id = ?1", [id, codigo, ts]);
export const ajusteLector = async db => { const r = await VR.one(db, "SELECT data FROM docs WHERE col = 'ajustes' AND id = 'lector'"); try { return r ? JSON.parse(r.data) : {}; } catch (e) { return {}; } };
export const stAjusteLector = (db, doc) => bind(db, "INSERT INTO docs (col, id, data, updated) VALUES ('ajustes', 'lector', ?1, ?2) ON CONFLICT(col, id) DO UPDATE SET data = ?1, updated = ?2", [JSON.stringify({...doc, id: 'lector'}), Date.now()]);
