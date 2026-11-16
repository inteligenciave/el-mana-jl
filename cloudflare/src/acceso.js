/* Acceso por puesto a las colecciones de la app principal (/api/all, /api/batch, /api/c/*).
   El puesto llega en la cabecera x-rol (igual que en /api/v/*). Sin puesto válido: 403.
   Solo se restringen las colecciones sensibles; el resto lo ven y escriben todos los puestos válidos
   (la app todavía no tiene inicio de sesión real: esto frena el acceso anónimo, no la suplantación del puesto). */
import {ROL_TXT} from './ventas/permisos.js';

export const rolDe = req => { const r = (req.headers.get('x-rol') || '').trim(); return ROL_TXT[r] ? r : null; };

/* r = quién lee completo · w = quién escribe. Colección que no aparece aquí: todos los puestos válidos. */
const REGLAS = {
  empleados:         {r: ['dueno', 'rrhh'], w: ['dueno', 'rrhh']},                       // cédula, teléfono, tarifa: los demás reciben solo nombre/área
  asistencia:        {r: ['dueno', 'rrhh'], w: ['dueno']},                               // se llena sola con las marcas (src/rrhh); a mano ya no se anota
  prestamos:         {r: ['dueno', 'rrhh', 'adm'], w: ['dueno', 'adm']},                 // Administración entrega los préstamos; Recursos humanos los ve y los descuenta
  caja_gastos:       {r: ['dueno', 'adm'], w: ['dueno', 'adm']},
  caja_reposiciones: {r: ['dueno', 'adm'], w: ['dueno', 'adm']},
  caja_arqueos:      {r: ['dueno', 'adm'], w: ['dueno', 'adm']},
  gestion:           {r: ['dueno', 'adm', 'ventas'], w: ['dueno', 'adm', 'ventas']},
  productos:         {r: null, w: ['dueno', 'produccion']},                                // existencias y fichas de producto: todos leen; solo Gerencia y Producción las cambian a mano (Ventas solo descuenta al vender)
  proveedores:       {r: null, w: ['dueno', 'adm']},                                       // todos los puestos ven los proveedores; solo Gerencia y Administración los crean, editan o desactivan
  clientes:          {r: ['dueno', 'adm', 'ventas'], w: ['dueno', 'ventas']},               // Administración solo ve los clientes
  auditoria:         {r: ['dueno', 'adm'], w: Object.keys(ROL_TXT)}   // solo AGREGAR: worker.js rechaza editar, borrar o sobrescribir; agrega cualquier puesto con sesión
};
/* Documentos sueltos de «ajustes» */
const AJ_LEE = {tel_clientes: ['dueno', 'adm', 'ventas'], turnos_bonos: ['dueno', 'adm', 'rrhh']};
const AJ_ESCRIBE = {matriz: ['dueno'], metas_mes: ['dueno'], tel_clientes: ['dueno', 'adm', 'ventas'], turnos_bonos: ['dueno']};
/* Campos de «ajustes/politicas» que solo cambia Gerencia (reglas de pago de nómina): el lote genérico los rechaza a los demás puestos */
export const POL_SOLO_DUENO = ['nomJornada', 'nomRecargo', 'nomLey'];
/* ¿Esta operación cambia alguno de esos campos respecto a lo guardado (`actual`)? Si solo reenvía los mismos valores, no cuenta. */
export function cambiaCamposDueno(rol, op, actual) {
  if (rol === 'dueno' || !op || op.c !== 'ajustes' || op.id !== 'politicas' || !op.d || typeof op.d !== 'object') return false;
  const cur = actual || {}, esSet = op.op === 'set' || op.op === undefined;
  return POL_SOLO_DUENO.some(k => (esSet || k in op.d) && (+op.d[k] || 0) !== (+cur[k] || 0));
}
/* Campos de empleados visibles para quien no es RRHH ni Gerente */
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

/* Flota (vehículos de la empresa): agregan, editan y cambian el estado Gerente y Administración; los demás puestos válidos solo eligen (ven los activos). */
export const FLOTA_GESTIONA = ['dueno', 'adm'];

/* Ubicación de los vehículos (dónde están y qué cargan): la anotan Gerencia, Administración y Logística; los demás puestos solo ven. */
export const FLOTA_UBICA = ['dueno', 'adm', 'empaque'];

/* Marcas de entrada y salida del personal (pantalla «En planta hoy»): marcan y ven quién está Gerencia y Recursos humanos; el conteo (solo cifras) también lo lee Administración. */
export const RRHH_MARCA = ['dueno', 'rrhh'];
export const RRHH_VE = ['dueno', 'rrhh'];
export const RRHH_CONTEO = ['dueno', 'rrhh', 'adm'];

/* Pagar nómina (montos de sueldo, descuentos de préstamo y recibos): solo Gerencia y Recursos humanos. */
export const NOMINA_PAGA = ['dueno', 'rrhh'];

/* Turnos, horarios, horas extra y bonos de producción:
   ven la pantalla «Turnos» Gerencia, Producción, Recursos humanos y Administración (sin sueldos ni tarifas para Producción y Administración);
   los parámetros (horarios, valor de la hora, recargo, bonos y su cumplimiento) los ven Gerencia, Administración y Recursos humanos y los MODIFICA SOLO Gerencia;
   aplican un bono (al turno o por persona) Gerencia y Administración. */
export const TURNOS_VE = ['dueno', 'produccion', 'rrhh', 'adm'];
export const TURNOS_DINERO = ['dueno', 'rrhh'];
export const PARAM_VE = ['dueno', 'adm', 'rrhh'];
export const PARAM_EDITA = ['dueno'];
export const BONO_APLICA = ['dueno', 'adm'];
