/* Marcas · capa de datos (único lugar con SQL de este módulo). */
import * as VR from '../ventas/repo.js';
export const all = VR.all, one = VR.one, lote = VR.lote, stAuditoria = VR.stAuditoria;
const bind = (db, sql, a = []) => db.prepare(sql).bind(...a);

export async function empleados(db) {
  const r = await VR.all(db, "SELECT data FROM docs WHERE col = 'empleados'");
  const out = []; for (const x of r) { try { out.push(JSON.parse(x.data)); } catch (e) { /* fila dañada: se ignora */ } }
  return out;
}
export const empleado = async (db, id) => { const r = await VR.one(db, "SELECT data FROM docs WHERE col = 'empleados' AND id = ?1", [id]); try { return r ? JSON.parse(r.data) : null; } catch (e) { return null; } };
export const delDia = (db, fecha) => VR.all(db, 'SELECT * FROM marcas WHERE fecha = ?1 ORDER BY entrada_ts', [fecha]);
export const abierta = (db, emp, fecha) => VR.one(db, 'SELECT * FROM marcas WHERE empleado_id = ?1 AND fecha = ?2 AND salida_ts IS NULL', [emp, fecha]);
export const stEntrada = (db, m) => bind(db, 'INSERT INTO marcas (empleado_id, fecha, entrada_ts, turno, quien, creado_ts) VALUES (?1,?2,?3,?4,?5,?3)', [m.empleado_id, m.fecha, m.ts, m.turno, m.quien]);
export const stSalida = (db, id, ts) => bind(db, 'UPDATE marcas SET salida_ts = ?2 WHERE id = ?1 AND salida_ts IS NULL', [id, ts]);
export const entre = (db, desde, hasta) => VR.all(db, 'SELECT * FROM marcas WHERE fecha >= ?1 AND fecha <= ?2 AND salida_ts IS NOT NULL ORDER BY fecha, entrada_ts', [desde, hasta]);

/* ---------- Pagar nómina ---------- */
const docs = async (db, col) => (await VR.all(db, 'SELECT id, data FROM docs WHERE col = ?1', [col])).map(x => { try { return JSON.parse(x.data); } catch (e) { return null; } }).filter(Boolean);
export const asistencias = db => docs(db, 'asistencia');
export const prestamos = db => docs(db, 'prestamos');
export const politicas = async db => { const r = await VR.one(db, "SELECT data FROM docs WHERE col = 'ajustes' AND id = 'politicas'"); try { return r ? JSON.parse(r.data) : {}; } catch (e) { return {}; } };
export const pagosSolapados = (db, desde, hasta) => VR.all(db, 'SELECT * FROM pagos_nomina WHERE desde <= ?2 AND hasta >= ?1 ORDER BY id', [desde, hasta]);
export const pagoDe = (db, id) => VR.one(db, 'SELECT * FROM pagos_nomina WHERE id = ?1', [id]);
export const stPago = (db, p) => bind(db, 'INSERT INTO pagos_nomina (empleado_id, periodo, desde, hasta, base, extra, bonos, ley, descuento_prestamo, neto, prestamos, detalle, fecha, forma, nota, quien, ts) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)',
  [p.empleado_id, p.periodo, p.desde, p.hasta, p.base, p.extra, p.bonos, p.ley, p.descuento_prestamo, p.neto, JSON.stringify(p.prestamos), JSON.stringify(p.detalle), p.fecha, p.forma, p.nota || null, p.quien, p.ts]);
/* Suma lo descontado a «pagadas» del préstamo (solo si nadie lo cambió antes) */
export const stCuotas = (db, id, antes, despues) => bind(db, "UPDATE docs SET data = json_set(data, '$.pagadas', ?3), updated = ?4 WHERE col = 'prestamos' AND id = ?1 AND json_extract(data, '$.pagadas') = ?2", [id, antes, despues, Date.now()]);

/* ---------- Turnos, parámetros y bonos de producción ---------- */
export const parametrosDoc = async db => { const r = await VR.one(db, "SELECT data FROM docs WHERE col = 'ajustes' AND id = 'turnos_bonos'"); try { return r ? JSON.parse(r.data) : {}; } catch (e) { return {}; } };
export const stParametros = (db, doc) => bind(db, "INSERT INTO docs (col, id, data, updated) VALUES ('ajustes', 'turnos_bonos', ?1, ?2) ON CONFLICT(col, id) DO UPDATE SET data = ?1, updated = ?2", [JSON.stringify({...doc, id: 'turnos_bonos'}), Date.now()]);
export const stPolNomina = (db, p) => bind(db, "UPDATE docs SET data = json_set(json_set(json_set(data, '$.nomJornada', ?1), '$.nomRecargo', ?2), '$.nomLey', ?3), updated = ?4 WHERE col = 'ajustes' AND id = 'politicas'", [p.nomJornada, p.nomRecargo, p.nomLey, Date.now()]);
export const stVer = db => bind(db, 'UPDATE ver SET v = v + 1 WHERE id = 1');
export const marcasDia = (db, fecha) => VR.all(db, 'SELECT * FROM marcas WHERE fecha = ?1 ORDER BY entrada_ts', [fecha]);
export const movProceso = (db, d, h) => VR.all(db, "SELECT etapa, sentido, kilos, ts, rol FROM movimientos_proceso WHERE ts >= ?1 AND ts < ?2 AND estado = 'VIGENTE'", [d, h]);
export const empaqueTurno = (db, d, h) => VR.all(db, "SELECT e.bultos, e.ts, e.rol, p.nombre FROM empaque_turno e JOIN productos p ON p.id_producto = e.id_producto WHERE e.ts >= ?1 AND e.ts < ?2 AND e.estado = 'VIGENTE'", [d, h]);
export const docsFecha = async (db, col, fecha) => (await VR.all(db, "SELECT data FROM docs WHERE col = ?1 AND json_extract(data, '$.fecha') = ?2", [col, fecha])).map(x => { try { return JSON.parse(x.data); } catch (e) { return null; } }).filter(Boolean);
export const lotesDelDia = async (db, fecha, d, h) => (await VR.all(db, "SELECT data FROM docs WHERE col = 'lotes' AND (json_extract(data, '$.fecha') = ?1 OR (json_extract(data, '$.tsCierre') >= ?2 AND json_extract(data, '$.tsCierre') < ?3))", [fecha, d, h])).map(x => { try { return JSON.parse(x.data); } catch (e) { return null; } }).filter(Boolean);
export const salidasDespachadas = (db, d, h) => VR.all(db, "SELECT nro, zona, kilos, despachada_ts, despachada_rol FROM salidas WHERE estado = 'DESPACHADA' AND despachada_ts >= ?1 AND despachada_ts < ?2", [d, h]);
export const bonoDe = (db, fecha, turno) => VR.one(db, 'SELECT * FROM bonos_turno WHERE fecha = ?1 AND turno = ?2', [fecha, turno]);
export const bonoFilas = (db, id) => VR.all(db, 'SELECT empleado_id, monto FROM bonos_turno_emp WHERE bono_id = ?1 ORDER BY id', [id]);
export const bonoPorId = (db, id) => VR.one(db, 'SELECT * FROM bonos_turno WHERE id = ?1', [id]);
export const stBono = (db, b) => bind(db, 'INSERT INTO bonos_turno (fecha, turno, modo, kilos, calculado, total, detalle, quien, ts) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)', [b.fecha, b.turno, b.modo, b.kilos, b.calculado, b.total, JSON.stringify(b.detalle || {}), b.quien, b.ts]);
export const stBonoEmp = (db, fecha, turno, f) => bind(db, 'INSERT INTO bonos_turno_emp (bono_id, empleado_id, fecha, monto) VALUES ((SELECT id FROM bonos_turno WHERE fecha = ?1 AND turno = ?2), ?3, ?1, ?4)', [fecha, turno, f.empleado_id, f.monto]);
export const stBonoBorrar = (db, id) => [bind(db, 'DELETE FROM bonos_turno_emp WHERE bono_id = ?1', [id]), bind(db, 'DELETE FROM bonos_turno WHERE id = ?1', [id])];
export const bonosEntre = (db, desde, hasta) => VR.all(db, 'SELECT empleado_id, SUM(monto) AS monto FROM bonos_turno_emp WHERE fecha >= ?1 AND fecha <= ?2 GROUP BY empleado_id', [desde, hasta]);
export const asisDoc = async (db, id) => { const r = await VR.one(db, "SELECT data FROM docs WHERE col = 'asistencia' AND id = ?1", [id]); try { return r ? JSON.parse(r.data) : null; } catch (e) { return null; } };
export const stAsistencia = (db, id, doc) => bind(db, "INSERT INTO docs (col, id, data, updated) VALUES ('asistencia', ?1, ?2, ?3) ON CONFLICT(col, id) DO UPDATE SET data = ?2, updated = ?3", [id, JSON.stringify({...doc, id}), Date.now()]);
