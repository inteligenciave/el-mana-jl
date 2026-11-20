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
  auditoria:         {r: ['dueno', 'adm'], w: Object.keys(ROL_TXT)},  // solo AGREGAR: worker.js rechaza editar, borrar o sobrescribir; agrega cualquier puesto con sesión
  /* Dinero de compras y pagos a proveedores: solo Gerencia y Administración (los demás puestos no los ven ni los escriben) */
  cxp:               {r: ['dueno', 'adm'], w: ['dueno', 'adm']},
  pagos:             {r: ['dueno', 'adm'], w: ['dueno', 'adm']},
  /* Compras (precios): solo Gerencia y Administración; el costo de las mermas de Producción y Logística lo calcula el servidor (src/costo-merma.js) */
  compras:           {r: ['dueno', 'adm'], w: ['dueno', 'adm']},
  recepciones:       {r: null, w: ['dueno', 'adm', 'produccion']},                         // Producción recibe; Administración valida
  partidas:          {r: null, w: ['dueno', 'adm']},
  movimientos:       {r: null, w: ['dueno', 'adm', 'produccion', 'empaque']},
  lotes:             {r: null, w: ['dueno', 'produccion', 'empaque']},
  salsas_lotes:      {r: null, w: ['dueno', 'produccion', 'empaque']},
  empaques:          {r: null, w: ['dueno', 'produccion', 'empaque']},
  bultos:            {r: null, w: ['dueno', 'produccion', 'empaque']},
  reposiciones:      {r: null, w: ['dueno', 'adm', 'produccion', 'empaque', 'ventas']},
  despachos:         {r: null, w: ['dueno', 'produccion', 'empaque']},
  flota:             {r: null, w: ['dueno', 'adm', 'empaque']},
  mermas:            {r: null, w: ['dueno', 'adm', 'produccion', 'empaque']},
  solicitudes_compra:{r: null, w: ['dueno', 'adm', 'produccion', 'empaque']},
  jornada_rrhh:      {r: ['dueno', 'rrhh', 'adm', 'produccion'], w: ['dueno', 'rrhh']},   // turnos del día (ver src/rrhh)
  meta:              {r: null, w: null},                                                   // contadores de números (REC-0001…): los usan todos los puestos
  ajustes:           {r: null, w: null}                                                    // por documento: ver AJ_LEE / AJ_ESCRIBE
};
/* Todo lo que no está en la lista de arriba (colecciones nuevas o desconocidas) solo lo lee Gerencia. */
/* Documentos sueltos de «ajustes» */
const AJ_LEE = {tel_clientes: ['dueno', 'adm', 'ventas'], turnos_bonos: ['dueno', 'adm', 'rrhh'], lector: ['dueno', 'rrhh']};
const AJ_ESCRIBE = {matriz: ['dueno'], metas_mes: ['dueno'], tel_clientes: ['dueno', 'adm', 'ventas'], turnos_bonos: ['dueno'], lector: ['dueno', 'rrhh']};
/* Campos de «ajustes/politicas» que solo cambia Gerencia (reglas de pago de nómina): el lote genérico los rechaza a los demás puestos */
export const POL_SOLO_DUENO = ['nomJornada', 'nomRecargo', 'nomLey'];
/* ¿Esta operación cambia alguno de esos campos respecto a lo guardado (`actual`)? Si solo reenvía los mismos valores, no cuenta. */
export function cambiaCamposDueno(rol, op, actual) {
  if (rol === 'dueno' || !op || op.c !== 'ajustes' || op.id !== 'politicas' || !op.d || typeof op.d !== 'object') return false;
  const cur = actual || {}, esSet = op.op === 'set' || op.op === undefined;
  return POL_SOLO_DUENO.some(k => (esSet || k in op.d) && (+op.d[k] || 0) !== (+cur[k] || 0));
}
/* Campos de empleados visibles para quien no es RRHH ni Gerente */
const EMP_PUBLICO = ['id', 'n', 'area', 'cargo', 'antig', 'orden', 'arch', 'archTs', 'archPor', 'estado', 'retiro', 'puesto', 'turno', 'es_chofer', 'codigo_lector'];   // sin cédula, teléfono, tarifa ni forma de pago
/* Reglas de pago de nómina dentro de «ajustes/politicas»: las ven Gerencia, Administración y Recursos humanos */
const POL_DINERO = ['nomJornada', 'nomRecargo', 'nomLey'], POL_VEN = ['dueno', 'adm', 'rrhh'];
const PROV_PRECIO = ['hist'], PROV_VEN = ['dueno', 'adm'];
const SIN_COSTOS = ['produccion', 'empaque'];   // Producción y Logística no ven precios ni costos   // precio histórico del proveedor

export const puedeLeer = (rol, c, id) => {
  if (c === 'ajustes' && id && AJ_LEE[id]) return AJ_LEE[id].includes(rol);
  const g = REGLAS[c]; if (!g) return rol === 'dueno'; return !g.r || g.r.includes(rol) || c === 'empleados';
};
export const puedeEscribir = (rol, c, id) => {
  if (c === 'ajustes' && AJ_ESCRIBE[id]) return AJ_ESCRIBE[id].includes(rol);
  const g = REGLAS[c]; if (!g) return rol === 'dueno';
  return g.w ? g.w.includes(rol) : true;
};
/* Quita lo que el puesto no debe ver de un documento ya leído */
export function filtrarDoc(rol, c, d) {
  if (c === 'empleados' && !['dueno', 'rrhh'].includes(rol)) { const o = {}; for (const k of EMP_PUBLICO) if (d[k] !== undefined) o[k] = d[k]; return o; }
  if (c === 'ajustes' && d && d.id === 'politicas' && !POL_VEN.includes(rol)) { const o = {...d}; for (const k of POL_DINERO) delete o[k]; return o; }
  if (c === 'proveedores' && d && !PROV_VEN.includes(rol)) { const o = {...d}; for (const k of PROV_PRECIO) delete o[k]; return o; }
  if (c === 'mermas' && d && SIN_COSTOS.includes(rol)) { const o = {...d}; delete o.usd; return o; }
  if (c === 'recepciones' && d && d.validacion && SIN_COSTOS.includes(rol)) { const o = {...d, validacion: {...d.validacion}}; delete o.validacion.pu; return o; }
  if (c === 'ajustes' && d && d.id === 'politicas' && SIN_COSTOS.includes(rol)) { const o = {...d}; delete o.mrCostoSalsa; return o; }
  return d;
}
/* Al guardar, un puesto que no ve ciertos campos no los puede borrar ni cambiar: se conservan los guardados (así un documento que le llegó recortado no pierde datos al devolverlo). */
export function conservarOcultos(rol, c, nuevo, ant) {
  if (rol && SIN_COSTOS.includes(rol) && nuevo && ((c === 'mermas' && ant) || (c === 'recepciones' && ant && ant.validacion) || (c === 'ajustes' && nuevo.id === 'politicas'))) {
    const o = {...nuevo};
    if (c === 'mermas') { if ('usd' in ant) o.usd = ant.usd; }
    else if (c === 'recepciones') o.validacion = {...(o.validacion || {}), ...(ant.validacion.pu !== undefined ? {pu: ant.validacion.pu} : {})};
    else if (ant && 'mrCostoSalsa' in ant) o.mrCostoSalsa = ant.mrCostoSalsa; else delete o.mrCostoSalsa;
    return conservarOcultos2(rol, c, o, ant);
  }
  return conservarOcultos2(rol, c, nuevo, ant);
}
function conservarOcultos2(rol, c, nuevo, ant) {
  const campos = c === 'proveedores' && !PROV_VEN.includes(rol) ? PROV_PRECIO : c === 'ajustes' && nuevo && nuevo.id === 'politicas' && !POL_VEN.includes(rol) ? POL_DINERO : null;
  if (!rol || !campos || !nuevo) return nuevo;
  const o = {...nuevo}; for (const k of campos) { if (ant && k in ant) o[k] = ant[k]; else delete o[k]; } return o;
}

/* Flota (vehículos de la empresa): agregan, editan y cambian el estado Gerente y Administración; los demás puestos válidos solo eligen (ven los activos). */
export const FLOTA_GESTIONA = ['dueno', 'adm'];

/* Ubicación de los vehículos (dónde están y qué cargan): la anotan Gerencia, Administración y Logística; los demás puestos solo ven. */
export const FLOTA_UBICA = ['dueno', 'adm', 'empaque'];

/* Marcas de entrada y salida del personal (pantalla «En planta hoy»): marcan y ven quién está Gerencia y Recursos humanos; el conteo (solo cifras) también lo lee Administración. */
export const RRHH_MARCA = ['dueno', 'rrhh'];
export const RRHH_VE = ['dueno', 'rrhh'];
export const RRHH_CONTEO = ['dueno', 'rrhh', 'adm'];

/* Importar del lector de huellas (marcas crudas, códigos y asistencia que sale de ellas): solo Gerencia y Nómina (Recursos humanos). */
export const LECTOR_USA = ['dueno', 'rrhh'];

/* Grupos rotativos (Grupo 1 y Grupo 2): quién integra cada grupo y qué turno tiene cada semana. Asignan Gerencia y Nómina (Recursos humanos); Producción y Administración solo ven. */
export const GRUPOS_ASIGNA = ['dueno', 'rrhh'];
export const GRUPOS_VE = ['dueno', 'rrhh', 'adm', 'produccion'];

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
/* Horarios de Diurno y Nocturno: los cambian Gerencia y Nómina (Recursos humanos). Nómina solo cambia horarios: las reglas de pago y el bono siguen siendo de Gerencia. Cada cambio queda en auditoría y avisa a Gerencia. */
export const HORARIO_EDITA = ['dueno', 'rrhh'];
export const BONO_APLICA = ['dueno', 'adm'];

/* Bonos (esquemas, seguimiento en vivo, aplicación al cerrar el turno): los ven Gerencia, Administración y Nómina; los EDITAN y deshacen Gerencia y Administración (decisión del dueño). */
export const BONOS_VE = ['dueno', 'adm', 'rrhh'];
export const BONOS_EDITA = ['dueno', 'adm'];
/* Crear bonos NUEVOS (decisión del dueño): solo Gerencia. Administración sigue cambiando metas y montos de los que ya existen. */
export const BONOS_CREA = ['dueno'];
