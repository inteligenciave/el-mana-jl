/* Cambios de precio · capa de datos (único lugar con SQL de este módulo). Reutiliza los ayudantes de Ventas.
   Las funciones `st*` devuelven sentencias preparadas para juntarlas en UN solo lote atómico. */
import {all, one, run, lote} from '../ventas/repo.js';
import * as VR from '../ventas/repo.js';
export {all, one, run, lote};
export const stAuditoria = VR.stAuditoria;
const bind = (db, sql, a = []) => db.prepare(sql).bind(...a);

/* ---------- Lecturas ---------- */
export const getProducto = VR.getProducto;
export const getCliente = VR.getCliente;
export const reglasDeCliente = VR.reglasDeCliente;
export const listarProductos = VR.listarProductos;
export const getPrecioLista = (db, id, lista) => one(db, 'SELECT * FROM precios_lista WHERE id_producto = ?1 AND lista = ?2', [id, lista]);
export const listarPreciosLista = db => all(db, 'SELECT l.*, p.nombre, p.gramaje, p.codigo_sku, p.orden FROM precios_lista l JOIN productos p ON p.id_producto = l.id_producto ORDER BY p.orden, p.id_producto, l.lista');
export const stCopiarLista = (db, nueva, origen) => bind(db, 'INSERT INTO precios_lista (id_producto, lista, contado_cents, credito_cents, actualizado_ts) SELECT id_producto, ?1, contado_cents, credito_cents, ?3 FROM precios_lista WHERE lista = ?2', [nueva, origen, Date.now()]);
export const leerEstadosLista = VR.leerEstadosLista;
export const stEstadoLista = VR.stEstadoLista;
export const nombresListas = async db => (await all(db, 'SELECT DISTINCT lista FROM precios_lista ORDER BY lista')).map(r => r.lista);
export const leerAjustes = db => one(db, 'SELECT * FROM ajustes_credito WHERE id = 1');
export const getCambio = (db, id) => one(db, 'SELECT * FROM cambios_precio WHERE id = ?1', [id]);
export const listarCambios = (db, estado, limite = 200) => estado
  ? all(db, 'SELECT * FROM cambios_precio WHERE estado = ?1 ORDER BY id DESC LIMIT ?2', [estado, limite])
  : all(db, 'SELECT * FROM cambios_precio ORDER BY id DESC LIMIT ?1', [limite]);
export const contarPendientes = async db => (await one(db, "SELECT COUNT(*) n FROM cambios_precio WHERE estado = 'PENDIENTE'")).n;

/* ---------- Escrituras ---------- */
export const stCambio = (db, c) => bind(db, "INSERT INTO cambios_precio (tipo, clave, titulo, detalle, estado, pedido_rol, pedido_ts) VALUES (?1,?2,?3,?4,'PENDIENTE',?5,?6)", [c.tipo, c.clave, c.titulo, JSON.stringify(c.detalle), c.pedido_rol, Date.now()]);
/* Reclamar el cambio: solo uno gana aunque lleguen dos resoluciones a la vez (la segunda no encuentra nada «pendiente») */
export const reclamar = (db, id, estado, rol, motivo) => run(db, "UPDATE cambios_precio SET estado = ?2, resuelto_rol = ?3, resuelto_ts = ?4, motivo = ?5 WHERE id = ?1 AND estado = 'PENDIENTE'", [id, estado, rol, Date.now(), motivo || null]);
export const soltar = (db, id, estado) => run(db, 'UPDATE cambios_precio SET estado = \'PENDIENTE\', resuelto_rol = NULL, resuelto_ts = NULL, motivo = NULL WHERE id = ?1 AND estado = ?2', [id, estado]);
/* Si el Dueño fija el valor directamente, el cambio pendiente de esa misma cosa queda sin efecto */
export const stCerrarPendiente = (db, clave, rolTxt, motivo) => bind(db, "UPDATE cambios_precio SET estado = 'RECHAZADO', resuelto_rol = ?2, resuelto_ts = ?3, motivo = ?4 WHERE clave = ?1 AND estado = 'PENDIENTE'", [clave, rolTxt, Date.now(), motivo]);

/* Aplicar el valor nuevo (lo mismo que hace un cambio directo del Dueño) */
export const stPrecioProducto = (db, id, cents) => bind(db, 'UPDATE productos SET precio_ref_cents = ?2 WHERE id_producto = ?1', [id, cents]);
export const stPrecioLista = (db, id, lista, mod, cents) => bind(db, `UPDATE precios_lista SET ${mod === 'contado' ? 'contado_cents' : 'credito_cents'} = ?3, actualizado_ts = ?4 WHERE id_producto = ?1 AND lista = ?2`, [id, lista, cents, Date.now()]);
export const stUpsertRegla = VR.stUpsertRegla;
export const stBorrarRegla = VR.stBorrarRegla;
export const stAjustes = (db, a, rol) => bind(db, 'UPDATE ajustes_credito SET dias_tramo1 = ?1, dias_tramo2 = ?2, descuento1_pct = ?3, descuento2_pct = ?4, recargo_mora_pct = ?5, actualizado_ts = ?6, actualizado_rol = ?7 WHERE id = 1',
  [a.dias_tramo1, a.dias_tramo2, a.descuento1_pct, a.descuento2_pct, a.recargo_mora_pct, Date.now(), rol]);
