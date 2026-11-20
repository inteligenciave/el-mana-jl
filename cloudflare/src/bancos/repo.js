/* Bancos · capa de datos (único lugar con SQL de este módulo). */
import * as VR from '../ventas/repo.js';
export const all = VR.all, one = VR.one, lote = VR.lote, stAuditoria = VR.stAuditoria;
const bind = (db, sql, a = []) => db.prepare(sql).bind(...a);

export const listar = (db, todos) => VR.all(db, `SELECT * FROM bancos ${todos ? '' : 'WHERE activo = 1'} ORDER BY activo DESC, nombre COLLATE NOCASE, moneda`);
export const get = (db, id) => VR.one(db, 'SELECT * FROM bancos WHERE id = ?1', [id]);
export const porNombre = (db, nombre, moneda) => VR.one(db, 'SELECT * FROM bancos WHERE nombre = ?1 COLLATE NOCASE AND moneda = ?2', [nombre, moneda]);
export const stInsertar = (db, b) => bind(db, 'INSERT INTO bancos (nombre, moneda, cuenta_numero, cuenta_titular, telefono, cedula, rif, activo, creado_ts) VALUES (?1,?2,?3,?4,?5,?6,?7,1,?8)', [b.nombre, b.moneda, b.cuenta_numero, b.cuenta_titular, b.telefono, b.cedula, b.rif, Date.now()]);
export const stActualizar = (db, id, b) => bind(db, 'UPDATE bancos SET nombre = ?2, moneda = ?3, cuenta_numero = ?4, cuenta_titular = ?5, telefono = ?6, cedula = ?7, rif = ?8, actualizado_ts = ?9 WHERE id = ?1', [id, b.nombre, b.moneda, b.cuenta_numero, b.cuenta_titular, b.telefono, b.cedula, b.rif, Date.now()]);
export const stActivo = (db, id, activo) => bind(db, 'UPDATE bancos SET activo = ?2, actualizado_ts = ?3 WHERE id = ?1', [id, activo ? 1 : 0, Date.now()]);
