/* Bonos · capa de datos (único lugar con SQL de los bonos nuevos). */
import * as VR from '../ventas/repo.js';
export const all = VR.all, one = VR.one, lote = VR.lote, stAuditoria = VR.stAuditoria;
const bind = (db, sql, a = []) => db.prepare(sql).bind(...a);
const dec = x => { if (!x) return x; let params = {}, destino = null; try { params = JSON.parse(x.params); } catch (e) { /* se deja vacío */ } try { destino = x.destino ? JSON.parse(x.destino) : null; } catch (e) { /* sin destino */ } return {...x, params, destino, desde_ts: +x.desde_ts || 0, activo: !!x.activo, archivado: !!x.archivado, base: !!x.base}; };

/* ---------- Esquemas ---------- */
export const esquemas = async db => (await VR.all(db, 'SELECT * FROM bonos_esquemas ORDER BY base DESC, id')).map(dec);
export const esquema = async (db, id) => dec(await VR.one(db, 'SELECT * FROM bonos_esquemas WHERE id = ?1', [id]));
export const stEsquemaNuevo = (db, e, ts, quien, desdeTs) => bind(db, 'INSERT INTO bonos_esquemas (codigo, nombre, forma, fuente, quienes, params, activo, archivado, base, creado_ts, actualizado_ts, quien, destino, desde_ts) VALUES (?1,?2,?3,?4,?5,?6,?7,0,0,?8,?8,?9,?10,?11)',
  ['propio-' + ts.toString(36) + Math.random().toString(36).slice(2, 4), e.nombre, e.forma, e.fuente, e.quienes, JSON.stringify(e.params), e.activo ? 1 : 0, ts, quien, e.destino ? JSON.stringify(e.destino) : null, desdeTs || 0]);
export const stEsquemaEditar = (db, id, e, ts, quien) => bind(db, 'UPDATE bonos_esquemas SET nombre = ?2, forma = ?3, fuente = ?4, quienes = ?5, params = ?6, activo = ?7, actualizado_ts = ?8, quien = ?9, destino = ?10 WHERE id = ?1', [id, e.nombre, e.forma, e.fuente, e.quienes, JSON.stringify(e.params), e.activo ? 1 : 0, ts, quien, e.destino ? JSON.stringify(e.destino) : null]);
export const stEsquemaArchivar = (db, id, archivar, ts, quien) => bind(db, 'UPDATE bonos_esquemas SET archivado = ?2, activo = CASE WHEN ?2 = 1 THEN 0 ELSE activo END, actualizado_ts = ?3, quien = ?4 WHERE id = ?1', [id, archivar ? 1 : 0, ts, quien]);
export const archivoViejo = async db => (await VR.all(db, 'SELECT * FROM bonos_archivo ORDER BY id')).map(x => { let d = null; try { d = JSON.parse(x.data); } catch (e) { /* dañado */ } return {id: x.id, origen: x.origen, data: d, nota: x.nota, ts: x.ts}; });

/* ---------- Lo medido en una ventana de tiempo [d, h) (solo lo VIGENTE) ---------- */
/* Kilos de producto terminado que llegan a Empaque: lo que entra a «empacado» menos los ajustes que bajan lo llegado (ajuste 1 = declarado de menos al cerrar, 2 = no se sacó completo) */
export const kilosEmpaque = async (db, d, h) => { const r = await VR.one(db, "SELECT COALESCE(SUM(CASE WHEN sentido = 'ENTRA' THEN kilos WHEN sentido = 'SALE' AND ajuste IN (1,2) THEN -kilos ELSE 0 END), 0) AS kg FROM movimientos_proceso WHERE etapa = 'empacado' AND estado = 'VIGENTE' AND ts >= ?1 AND ts < ?2", [d, h]); return r ? r.kg : 0; };
export const kilosSalenFritado = async (db, d, h) => { const r = await VR.one(db, "SELECT COALESCE(SUM(kilos), 0) AS kg FROM movimientos_proceso WHERE etapa = 'fritado' AND sentido = 'SALE' AND ajuste = 0 AND estado = 'VIGENTE' AND ts >= ?1 AND ts < ?2", [d, h]); return r ? r.kg : 0; };
export const bultosPorProducto = (db, d, h) => VR.all(db, "SELECT p.id_producto, p.nombre, p.gramaje, SUM(e.bultos) AS bultos FROM empaque_turno e JOIN productos p ON p.id_producto = e.id_producto WHERE e.estado = 'VIGENTE' AND e.ts >= ?1 AND e.ts < ?2 GROUP BY p.id_producto, p.nombre, p.gramaje", [d, h]);
export const personasEnVentana = (db, etapa, d, h) => VR.all(db, "SELECT empleado_id, MIN(ts) AS ts FROM etapa_personas WHERE etapa = ?3 AND estado = 'VIGENTE' AND ts >= ?1 AND ts < ?2 GROUP BY empleado_id", [d, h, etapa]);
export const friturasEnVentana = (db, d, h) => personasEnVentana(db, 'fritado', d, h);
export const marcasTurno = (db, fecha, turno) => VR.all(db, 'SELECT DISTINCT empleado_id FROM marcas WHERE fecha = ?1 AND turno = ?2', [fecha, turno]);

/* ---------- Aplicados ---------- */
export const aplicado = (db, esquemaId, fecha, turno) => VR.one(db, 'SELECT * FROM bonos_aplicados WHERE esquema_id = ?1 AND fecha = ?2 AND turno = ?3', [esquemaId, fecha, turno]);
export const aplicadosDeTurno = (db, fecha, turno) => VR.all(db, 'SELECT * FROM bonos_aplicados WHERE fecha = ?1 AND turno = ?2 ORDER BY id', [fecha, turno]);
export const aplicadoPorId = (db, id) => VR.one(db, 'SELECT * FROM bonos_aplicados WHERE id = ?1', [id]);
export const filasDe = (db, id) => VR.all(db, 'SELECT empleado_id, monto FROM bonos_aplicados_emp WHERE aplicado_id = ?1 ORDER BY id', [id]);
export const ultimosAplicados = (db, limite = 40) => VR.all(db, 'SELECT * FROM bonos_aplicados ORDER BY fecha DESC, id DESC LIMIT ?1', [limite]);
/* Inserta el encabezado (el id se toma de esquema+fecha+turno, que es único); si existe uno en REVISIÓN lo reemplaza */
export const stAplicar = (db, a) => bind(db, `INSERT INTO bonos_aplicados (esquema_id, esquema_nombre, fecha, turno, estado, origen, medida, monto_persona, total, detalle, quien, ts) VALUES (?1,?2,?3,?4,'APLICADO',?5,?6,?7,?8,?9,?10,?11)
  ON CONFLICT (esquema_id, fecha, turno) DO UPDATE SET estado = 'APLICADO', origen = ?5, medida = ?6, monto_persona = ?7, total = ?8, detalle = ?9, quien = ?10, ts = ?11, deshecho_quien = NULL, deshecho_ts = NULL WHERE bonos_aplicados.estado = 'REVISION'`,
  [a.esquema_id, a.esquema_nombre, a.fecha, a.turno, a.origen, a.medida, a.monto_persona, a.total, JSON.stringify(a.detalle || {}), a.quien, a.ts]);
/* Antes de reaplicar un bono que estaba en REVISIÓN se quitan sus filas viejas (si está APLICADO no se toca nada) */
export const stBorrarFilas = (db, esquemaId, fecha, turno) => bind(db, "DELETE FROM bonos_aplicados_emp WHERE aplicado_id = (SELECT id FROM bonos_aplicados WHERE esquema_id = ?1 AND fecha = ?2 AND turno = ?3 AND estado = 'REVISION')", [esquemaId, fecha, turno]);
/* La fila solo entra si el encabezado es el que acabamos de aplicar (mismo instante): dos aplicaciones a la vez no duplican pagos */
export const stFila = (db, esquemaId, fecha, turno, ts, f) => bind(db, "INSERT INTO bonos_aplicados_emp (aplicado_id, empleado_id, fecha, monto) SELECT id, ?5, ?2, ?6 FROM bonos_aplicados WHERE esquema_id = ?1 AND fecha = ?2 AND turno = ?3 AND ts = ?4 AND estado = 'APLICADO'", [esquemaId, fecha, turno, ts, f.empleado_id, f.monto]);
export const stDeshacer = (db, id, quien, ts) => bind(db, "UPDATE bonos_aplicados SET estado = 'REVISION', deshecho_quien = ?2, deshecho_ts = ?3 WHERE id = ?1 AND estado = 'APLICADO'", [id, quien, ts]);
export const stVer = db => bind(db, 'UPDATE ver SET v = v + 1 WHERE id = 1');

/* ---------- Personas por etapa (fritura) ---------- */
export const personasEtapa = (db, idTurno, etapa) => VR.all(db, "SELECT empleado_id, ts, rol FROM etapa_personas WHERE id_turno = ?1 AND etapa = ?2 AND estado = 'VIGENTE' ORDER BY id", [idTurno, etapa]);
export const stPersonaEtapa = (db, idTurno, etapa, emp, rol, ts) => bind(db, "INSERT OR IGNORE INTO etapa_personas (id_turno, etapa, empleado_id, estado, ts, rol) VALUES (?1,?2,?3,'VIGENTE',?4,?5)", [idTurno, etapa, emp, ts, rol]);
export const stQuitarPersonaEtapa = (db, idTurno, etapa, emp) => bind(db, "UPDATE etapa_personas SET estado = 'ANULADO' WHERE id_turno = ?1 AND etapa = ?2 AND empleado_id = ?3 AND estado = 'VIGENTE'", [idTurno, etapa, emp]);
