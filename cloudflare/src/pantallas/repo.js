/* Funciones extra por rol · capa de datos (único lugar con SQL de este módulo). */
import {all, lote, stAuditoria} from '../ventas/repo.js';
export {stAuditoria};
export const listar = db => all(db, 'SELECT rol, clave FROM pantallas_extras ORDER BY rol, clave');
export const listarDe = (db, rol) => all(db, 'SELECT rol, clave FROM pantallas_extras WHERE rol = ?1 ORDER BY clave', [rol]);
/* Reemplaza la lista del rol y deja la auditoría en el mismo lote (todo o nada) */
export const reemplazar = (db, rol, claves, aud) => lote(db, [
  db.prepare('DELETE FROM pantallas_extras WHERE rol = ?1').bind(rol),
  ...claves.map(c => db.prepare('INSERT INTO pantallas_extras (rol, clave, asignado_ts) VALUES (?1, ?2, ?3)').bind(rol, c, Date.now())),
  ...stAuditoria(db, aud)
]);
