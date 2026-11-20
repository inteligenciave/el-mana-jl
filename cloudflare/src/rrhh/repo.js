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
/* Marcas de hoy + las entradas todavía abiertas de antes (el turno nocturno que empezó ayer sigue abierto después de la medianoche) */
export const delDiaYAbiertas = (db, fecha, desdeTs) => VR.all(db, 'SELECT * FROM marcas WHERE fecha = ?1 OR (salida_ts IS NULL AND entrada_ts >= ?2) ORDER BY entrada_ts', [fecha, desdeTs]);
/* La entrada abierta más reciente de la persona (sirve para marcar la salida de un turno que cruzó la medianoche) */
export const abiertaDe = (db, emp, desdeTs) => VR.one(db, 'SELECT * FROM marcas WHERE empleado_id = ?1 AND salida_ts IS NULL AND entrada_ts >= ?2 ORDER BY entrada_ts DESC LIMIT 1', [emp, desdeTs]);
export const stQuitarEntrada = (db, id) => bind(db, 'DELETE FROM marcas WHERE id = ?1 AND salida_ts IS NULL AND origen IS NULL', [id]);
export const stSalida = (db, id, ts) => bind(db, 'UPDATE marcas SET salida_ts = ?2 WHERE id = ?1 AND salida_ts IS NULL', [id, ts]);
export const entre = (db, desde, hasta) => VR.all(db, 'SELECT * FROM marcas WHERE fecha >= ?1 AND fecha <= ?2 AND salida_ts IS NOT NULL ORDER BY fecha, entrada_ts', [desde, hasta]);

/* ---------- Pagar nómina ---------- */
const docs = async (db, col) => (await VR.all(db, 'SELECT id, data FROM docs WHERE col = ?1', [col])).map(x => { try { return JSON.parse(x.data); } catch (e) { return null; } }).filter(Boolean);
export const asistencias = db => docs(db, 'asistencia');
export const prestamos = db => docs(db, 'prestamos');
export const politicas = async db => { const r = await VR.one(db, "SELECT data FROM docs WHERE col = 'ajustes' AND id = 'politicas'"); try { return r ? JSON.parse(r.data) : {}; } catch (e) { return {}; } };
export const pagosSolapados = (db, desde, hasta) => VR.all(db, 'SELECT * FROM pagos_nomina WHERE desde <= ?2 AND hasta >= ?1 ORDER BY id', [desde, hasta]);
export const pagoDe = (db, id) => VR.one(db, 'SELECT * FROM pagos_nomina WHERE id = ?1', [id]);
/* El pago solo entra si NADIE más pagó a esta persona en fechas que se cruzan (condición dentro de la misma sentencia). */
export const stPago = (db, p) => bind(db, `INSERT INTO pagos_nomina (empleado_id, periodo, desde, hasta, base, extra, bonos, ley, descuento_prestamo, neto, prestamos, detalle, fecha, forma, nota, quien, ts, moneda, tasa, tasa_fecha, neto_bs, neto_usd)
  SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,'USD',?18,?19,?20,?10 WHERE NOT EXISTS (SELECT 1 FROM pagos_nomina WHERE empleado_id = ?1 AND desde <= ?4 AND hasta >= ?3)`,
  [p.empleado_id, p.periodo, p.desde, p.hasta, p.base, p.extra, p.bonos, p.ley, p.descuento_prestamo, p.neto, JSON.stringify(p.prestamos), JSON.stringify(p.detalle), p.fecha, p.forma, p.nota || null, p.quien, p.ts, p.tasa ?? null, p.tasa_fecha ?? null, p.neto_bs ?? null]);
/* Va justo después de stPago: si el pago no entró (ya existía otro), rompe el bloque completo (NOT NULL) y no se guarda NADA (ni descuento de préstamo ni auditoría). */
export const stGuardaPago = db => bind(db, 'UPDATE ver SET v = CASE WHEN changes() > 0 THEN v ELSE NULL END WHERE id = 1');
/* Suma lo descontado a «pagadas» del préstamo (solo si nadie lo cambió antes) */
export const stCuotas = (db, id, antes, despues) => bind(db, "UPDATE docs SET data = json_set(data, '$.pagadas', ?3), updated = ?4 WHERE col = 'prestamos' AND id = ?1 AND json_extract(data, '$.pagadas') = ?2", [id, antes, despues, Date.now()]);

/* ---------- Turnos, parámetros y bonos de producción ---------- */
export const parametrosDoc = async db => { const r = await VR.one(db, "SELECT data FROM docs WHERE col = 'ajustes' AND id = 'turnos_bonos'"); try { return r ? JSON.parse(r.data) : {}; } catch (e) { return {}; } };
export const stParametros = (db, doc) => bind(db, "INSERT INTO docs (col, id, data, updated) VALUES ('ajustes', 'turnos_bonos', ?1, ?2) ON CONFLICT(col, id) DO UPDATE SET data = ?1, updated = ?2", [JSON.stringify({...doc, id: 'turnos_bonos'}), Date.now()]);
/* Lo ya cerrado: último día cubierto por un pago de nómina o con un bono aplicado (null si no hay nada). Un horario nuevo solo puede empezar después. */
export const ultimoCierre = async db => { const r = await VR.one(db, "SELECT MAX(f) AS f FROM (SELECT MAX(hasta) AS f FROM pagos_nomina UNION ALL SELECT MAX(fecha) FROM bonos_aplicados WHERE estado = 'APLICADO' UNION ALL SELECT MAX(fecha) FROM bonos_turno)"); return (r && r.f) || null; };
/* Por persona: pagos de nómina que tocan el rango y bonos aplicados dentro del rango (para bloquear cambios de grupo ya pagados) */
export const pagosEnRango = (db, desde, hasta) => VR.all(db, 'SELECT empleado_id, desde, hasta FROM pagos_nomina WHERE hasta >= ?1 AND desde <= ?2', [desde, hasta]);
export const bonosEnRango = (db, desde, hasta) => VR.all(db, "SELECT empleado_id, fecha FROM (SELECT e.empleado_id, e.fecha FROM bonos_aplicados_emp e JOIN bonos_aplicados a ON a.id = e.aplicado_id WHERE a.estado = 'APLICADO' AND e.fecha >= ?1 AND e.fecha <= ?2 UNION ALL SELECT empleado_id, fecha FROM bonos_turno_emp WHERE fecha >= ?1 AND fecha <= ?2)", [desde, hasta]);
/* Avisos a Gerencia */
export const stAviso = (db, a) => bind(db, 'INSERT INTO avisos_turnos (tipo, rol, resumen, detalle, creado_ts) VALUES (?1,?2,?3,?4,?5)', [a.tipo || 'horario', a.rol, a.resumen, JSON.stringify(a.detalle || {}), a.ts]);
export const avisos = db => VR.all(db, 'SELECT * FROM avisos_turnos ORDER BY CASE WHEN visto_ts IS NULL THEN 0 ELSE 1 END, id DESC LIMIT 30');
export const avisosPendientes = async db => ((await VR.one(db, 'SELECT COUNT(*) AS n FROM avisos_turnos WHERE visto_ts IS NULL')) || {}).n || 0;
export const stAvistoUno = (db, id, rol, ts) => bind(db, 'UPDATE avisos_turnos SET visto_ts = ?3, visto_por = ?2 WHERE id = ?1 AND visto_ts IS NULL', [id, rol, ts]);
export const stAvistoTodos = (db, rol, ts) => bind(db, 'UPDATE avisos_turnos SET visto_ts = ?2, visto_por = ?1 WHERE visto_ts IS NULL', [rol, ts]);
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
/* Bonos del período: los de la regla vieja (ya en $) más los de los esquemas nuevos que están APLICADOS (los deshechos, en revisión, no se pagan) */
/* Parte de los bonos que es bono nocturno (para mostrarlo aparte en nómina y recibos; ya va dentro del total de bonos) */
export const bonosNocturnoEntre = (db, desde, hasta) => VR.all(db, "SELECT e.empleado_id, SUM(e.monto) AS monto FROM bonos_aplicados_emp e JOIN bonos_aplicados a ON a.id = e.aplicado_id JOIN bonos_esquemas s ON s.id = a.esquema_id WHERE a.estado = 'APLICADO' AND s.fuente = 'asistencia_nocturna' AND e.fecha >= ?1 AND e.fecha <= ?2 GROUP BY e.empleado_id", [desde, hasta]);
export const bonosEntre = (db, desde, hasta) => VR.all(db, "SELECT empleado_id, SUM(monto) AS monto FROM (SELECT empleado_id, monto FROM bonos_turno_emp WHERE fecha >= ?1 AND fecha <= ?2 UNION ALL SELECT e.empleado_id, e.monto FROM bonos_aplicados_emp e JOIN bonos_aplicados a ON a.id = e.aplicado_id WHERE a.estado = 'APLICADO' AND e.fecha >= ?1 AND e.fecha <= ?2) GROUP BY empleado_id", [desde, hasta]);
export const asisDoc = async (db, id) => { const r = await VR.one(db, "SELECT data FROM docs WHERE col = 'asistencia' AND id = ?1", [id]); try { return r ? JSON.parse(r.data) : null; } catch (e) { return null; } };
export const stAsistencia = (db, id, doc) => bind(db, "INSERT INTO docs (col, id, data, updated) VALUES ('asistencia', ?1, ?2, ?3) ON CONFLICT(col, id) DO UPDATE SET data = ?2, updated = ?3", [id, JSON.stringify({...doc, id}), Date.now()]);

/* Turno de trabajo del día (Diurno/Nocturno) abierto por Recursos humanos: un documento por fecha en docs «jornada_rrhh». Es distinto del turno de producción (kilos). */
export const jornadaDoc = async (db, fecha) => { const r = await VR.one(db, "SELECT data FROM docs WHERE col = 'jornada_rrhh' AND id = ?1", [fecha]); try { return r ? JSON.parse(r.data) : {fecha, turnos: {}}; } catch (e) { return {fecha, turnos: {}}; } };
export const stJornada = (db, fecha, doc) => bind(db, "INSERT INTO docs (col, id, data, updated) VALUES ('jornada_rrhh', ?1, ?2, ?3) ON CONFLICT(col, id) DO UPDATE SET data = ?2, updated = ?3", [fecha, JSON.stringify(doc), Date.now()]);

/* ---------- Grupos rotativos ---------- */
export const grupoMiembros = db => VR.all(db, 'SELECT empleado_id, grupo_id FROM grupo_miembros');
export const grupoSemanaEntre = (db, desde, hasta) => VR.all(db, 'SELECT semana, grupo_id, turno, quien, ts FROM grupo_semana WHERE semana >= ?1 AND semana <= ?2', [desde, hasta]);
export const grupoSemanaMiembrosEntre = (db, desde, hasta) => VR.all(db, 'SELECT semana, empleado_id, grupo_id, excepcion FROM grupo_semana_miembros WHERE semana >= ?1 AND semana <= ?2', [desde, hasta]);
export const gruposSemanasRecientes = (db, hasta, n) => VR.all(db, 'SELECT DISTINCT semana FROM grupo_semana WHERE semana <= ?1 ORDER BY semana DESC LIMIT ?2', [hasta, n]);
export const stGrupoSemana = (db, semana, gid, turno, quien, ts) => bind(db, 'INSERT INTO grupo_semana (semana, grupo_id, turno, quien, ts) VALUES (?1,?2,?3,?4,?5) ON CONFLICT(semana, grupo_id) DO UPDATE SET turno = ?3, quien = ?4, ts = ?5', [semana, gid, turno, quien, ts]);
/* Guarda quiénes estaban en cada grupo esa semana (las excepciones de esa semana no se tocan) */
export const stSnapSemana = (db, semana, quien, ts) => [
  bind(db, 'DELETE FROM grupo_semana_miembros WHERE semana = ?1 AND excepcion = 0', [semana]),
  bind(db, 'INSERT OR IGNORE INTO grupo_semana_miembros (semana, empleado_id, grupo_id, excepcion, quien, ts) SELECT gs.semana, gm.empleado_id, gm.grupo_id, 0, ?2, ?3 FROM grupo_semana gs JOIN grupo_miembros gm ON gm.grupo_id = gs.grupo_id WHERE gs.semana = ?1', [semana, quien, ts])];
/* Lo mismo para esta semana y las que vienen (las semanas pasadas quedan como estaban: es el historial) */
export const stSnapDesde = (db, desde, quien, ts) => [
  bind(db, 'DELETE FROM grupo_semana_miembros WHERE semana >= ?1 AND excepcion = 0', [desde]),
  bind(db, 'INSERT OR IGNORE INTO grupo_semana_miembros (semana, empleado_id, grupo_id, excepcion, quien, ts) SELECT gs.semana, gm.empleado_id, gm.grupo_id, 0, ?2, ?3 FROM grupo_semana gs JOIN grupo_miembros gm ON gm.grupo_id = gs.grupo_id WHERE gs.semana >= ?1', [desde, quien, ts])];
export const stGrupoVaciar = (db, gid) => bind(db, 'DELETE FROM grupo_miembros WHERE grupo_id = ?1', [gid]);
export const stGrupoPoner = (db, emp, gid, ts) => bind(db, 'INSERT OR REPLACE INTO grupo_miembros (empleado_id, grupo_id, ts) VALUES (?1,?2,?3)', [emp, gid, ts]);
export const stExcepcion = (db, semana, emp, gid, quien, ts) => bind(db, 'INSERT OR REPLACE INTO grupo_semana_miembros (semana, empleado_id, grupo_id, excepcion, quien, ts) VALUES (?1,?2,?3,1,?4,?5)', [semana, emp, gid, quien, ts]);
export const stExcepcionQuitar = (db, semana, emp) => bind(db, 'DELETE FROM grupo_semana_miembros WHERE semana = ?1 AND empleado_id = ?2 AND excepcion = 1', [semana, emp]);
/* Puesto y área de una persona (turno: '' lo borra al pasar a oficina; null lo deja). Revisión tras la migración 0035. */
export const stPuestoArea = (db, id, puesto, area, turno, ts) => bind(db, "UPDATE docs SET data = json_set(data, '$.puesto', ?2, '$.area', ?3, '$.turno', COALESCE(?4, json_extract(data, '$.turno'), '')), updated = ?5 WHERE col = 'empleados' AND id = ?1", [id, puesto, area, turno, ts]);
export const stAreaRevisada = (db, id) => bind(db, 'UPDATE areas_respaldo SET revisada = 1 WHERE empleado_id = ?1', [id]);
