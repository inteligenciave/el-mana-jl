/* Inventario general · capa de datos (único lugar con SQL de este módulo). */
import * as VR from '../ventas/repo.js';
export const all = VR.all, one = VR.one, lote = VR.lote;
const bind = (db, sql, a = []) => db.prepare(sql).bind(...a);

export async function inicioTs(db) { const r = await one(db, "SELECT valor FROM config WHERE clave = 'inv_inicio_ts'"); return r ? (+r.valor || 0) : 0; }
export const stInicio = (db, ts) => bind(db, "INSERT INTO config (clave, valor) VALUES ('inv_inicio_ts', ?1) ON CONFLICT(clave) DO UPDATE SET valor = ?1", [String(ts)]);
export const articulos = db => all(db, 'SELECT * FROM inv_articulos WHERE activo = 1 ORDER BY orden, nombre');
export const articulo = (db, codigo) => one(db, 'SELECT * FROM inv_articulos WHERE codigo = ?1', [codigo]);
export const stArticulo = (db, a) => bind(db, 'INSERT OR IGNORE INTO inv_articulos (codigo, nombre, unidad, minimo, orden) VALUES (?1, ?2, ?3, 0, 99)', [a.codigo, a.nombre, a.unidad]);
export const stMinimo = (db, codigo, minimo) => bind(db, 'UPDATE inv_articulos SET minimo = ?2 WHERE codigo = ?1', [codigo, minimo]);
/* m = {articulo, tipo, cantidad, origen, ref, id_turno, nota, rol} */
export const stMov = (db, m, ts = Date.now()) => bind(db, 'INSERT INTO inv_movimientos (articulo, tipo, cantidad, origen, ref, id_turno, nota, rol, ts) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)',
  [m.articulo, m.tipo, m.cantidad, m.origen, String(m.ref), m.id_turno ?? null, m.nota || null, m.rol ?? null, ts]);
export const stConteo = (db, articulo, cantidad, rol, ts) => bind(db, 'INSERT INTO inv_conteo (articulo, cantidad, ts, rol) VALUES (?1,?2,?3,?4)', [articulo, cantidad, ts, rol]);
/* Saldo = movimientos desde el arranque (el conteo inicial lleva la misma marca de tiempo). Sin arranque (desde = 9e15) no cuenta nada. */
export const saldos = (db, desde) => all(db, "SELECT articulo, SUM(CASE tipo WHEN 'ENTRADA' THEN cantidad ELSE -cantidad END) AS saldo, SUM(CASE WHEN tipo = 'ENTRADA' AND origen = 'compra' THEN cantidad ELSE 0 END) AS compras, SUM(CASE WHEN origen = 'consumo' THEN cantidad ELSE 0 END) AS consumos, SUM(CASE WHEN origen = 'merma' THEN cantidad ELSE 0 END) AS mermas FROM inv_movimientos WHERE ts >= ?1 GROUP BY articulo", [desde]);
export const movimientos = (db, desde, limite = 60) => all(db, 'SELECT m.*, a.nombre AS articulo_nombre, a.unidad FROM inv_movimientos m LEFT JOIN inv_articulos a ON a.codigo = m.articulo WHERE m.ts >= ?1 ORDER BY m.id DESC LIMIT ?2', [desde, limite]);
export const consumosDeTurno = (db, idTurno) => all(db, "SELECT m.*, a.nombre AS articulo_nombre, a.unidad FROM inv_movimientos m LEFT JOIN inv_articulos a ON a.codigo = m.articulo WHERE m.id_turno = ?1 AND m.origen = 'consumo' ORDER BY m.id", [idTurno]);
export const conteos = db => all(db, 'SELECT c.*, a.nombre, a.unidad FROM inv_conteo c LEFT JOIN inv_articulos a ON a.codigo = c.articulo ORDER BY a.orden');

export const stConfigInv = (db, clave, valor) => bind(db, 'INSERT INTO config (clave, valor) VALUES (?1, ?2) ON CONFLICT(clave) DO UPDATE SET valor = ?2', [clave, String(valor)]);
