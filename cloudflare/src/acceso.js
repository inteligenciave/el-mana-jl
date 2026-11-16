/* Acceso por puesto a las colecciones de la app principal (/api/all, /api/batch, /api/c/*).
   El puesto llega en la cabecera x-rol (igual que en /api/v/*). Sin puesto válido: 403.
   Solo se restringen las colecciones sensibles; el resto lo ven y escriben todos los puestos válidos
   (la app todavía no tiene inicio de sesión real: esto frena el acceso anónimo, no la suplantación del puesto). */
import {ROL_TXT} from './ventas/permisos.js';

export const rolDe = req => { const r = (req.headers.get('x-rol') || '').trim(); return ROL_TXT[r] ? r : null; };

/* r = quién lee completo · w = quién escribe. Colección que no aparece aquí: todos los puestos válidos. */
const REGLAS = {
  empleados:         {r: ['dueno', 'rrhh'], w: ['dueno', 'rrhh']},                       // cédula, teléfono, tarifa: los demás reciben solo nombre/área
  asistencia:        {r: ['dueno', 'rrhh'], w: ['dueno', 'rrhh']},
  prestamos:         {r: ['dueno', 'rrhh', 'custodio', 'adm'], w: ['dueno', 'custodio']},
  caja_gastos:       {r: ['dueno', 'adm', 'custodio'], w: ['dueno', 'custodio']},
  caja_reposiciones: {r: ['dueno', 'adm', 'custodio'], w: ['dueno', 'custodio']},
  caja_arqueos:      {r: ['dueno', 'adm', 'custodio'], w: ['dueno', 'custodio']},
  gestion:           {r: ['dueno', 'adm', 'ventas', 'cobranza'], w: ['dueno', 'ventas', 'cobranza']},
  productos:         {r: null, w: ['dueno', 'jefeprod', 'produccion']},                    // existencias y fichas de producto: todos leen; solo Gerencia, Jefe de producción y Producción las cambian a mano (Ventas solo descuenta al vender)
  proveedores:       {r: null, w: ['dueno', 'adm']},                                       // todos los puestos ven los proveedores; solo Gerencia y Administración los crean, editan o desactivan
  clientes:          {r: ['dueno', 'adm', 'ventas', 'cobranza'], w: ['dueno', 'adm', 'ventas', 'cobranza']},
  auditoria:         {r: ['dueno', 'adm'], w: null}
};
/* Documentos sueltos de «ajustes» */
const AJ_LEE = {tel_clientes: ['dueno', 'adm', 'ventas', 'cobranza']};
const AJ_ESCRIBE = {matriz: ['dueno'], metas_mes: ['dueno'], tel_clientes: ['dueno', 'ventas', 'cobranza']};
/* Campos de empleados visibles para quien no es RRHH ni Dueño */
const EMP_PUBLICO = ['id', 'n', 'area', 'cargo', 'antig', 'orden', 'arch', 'archTs', 'archPor', 'estado', 'retiro'];

export const puedeLeer = (rol, c, id) => {
  if (c === 'ajustes' && id && AJ_LEE[id]) return AJ_LEE[id].includes(rol);
  const g = REGLAS[c]; return !g || !g.r || g.r.includes(rol) || c === 'empleados';
};
export const puedeEscribir = (rol, c, id) => {
  if (c === 'ajustes' && AJ_ESCRIBE[id]) return AJ_ESCRIBE[id].includes(rol);
  const g = REGLAS[c]; if (!g) return true;
  return g.w ? g.w.includes(rol) : true;
};
/* Quita lo que el puesto no debe ver de un documento ya leído */
export function filtrarDoc(rol, c, d) {
  if (c === 'empleados' && !['dueno', 'rrhh'].includes(rol)) { const o = {}; for (const k of EMP_PUBLICO) if (d[k] !== undefined) o[k] = d[k]; return o; }
  return d;
}

/* Flota (vehículos de la empresa): agregan, editan y cambian el estado Dueño y Administración; los demás puestos válidos solo eligen (ven los activos). */
export const FLOTA_GESTIONA = ['dueno', 'adm'];

/* Ubicación de los vehículos (dónde están y qué cargan): la anotan Gerencia, Administración y Empaque y despacho; los demás puestos solo ven. */
export const FLOTA_UBICA = ['dueno', 'adm', 'empaque'];
