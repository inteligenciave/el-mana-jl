/* Marcas de entrada y salida · reglas puras (sin base de datos ni HTTP). */
import {RRHH_MARCA, RRHH_VE, RRHH_CONTEO, LECTOR_USA} from '../acceso.js';
export const puedeMarcar = rol => RRHH_MARCA.includes(rol);
export const puedeVer = rol => RRHH_VE.includes(rol);
export const puedeContar = rol => RRHH_CONTEO.includes(rol);
export const puedeLector = rol => LECTOR_USA.includes(rol);
export const MSG_SIN_LECTOR = 'Solo Gerencia y Nómina importan las marcas del lector.';
export const MSG_SIN_MARCAR = 'Solo Gerencia y Recursos humanos marcan entradas y salidas.';
export const MSG_SIN_VER = 'Solo Gerencia y Recursos humanos ven quién está en planta.';
export const MSG_SIN_CONTEO = 'Tu puesto no puede ver cuántas personas hay en planta.';
export const TURNOS = ['Diurno', 'Nocturno'];
export const turnoValido = t => TURNOS.includes(t);
/* Puestos y áreas de Personal (la MISMA lista está en app-source.html; una prueba vigila que no se separen).
   Cada persona tiene un PUESTO y, dentro, su ÁREA. `area` sigue siendo el valor más específico (lo leen nómina, reportes, turnos y «Personal activo hoy»); `puesto` es un campo nuevo.
   Turnos Diurno/Nocturno, grupos 1/2 y bonos aplican SOLO a los puestos de planta (Producción y Logística, con todas sus áreas). «Administración y ventas» (lista vieja) quedó separada. */
export const PUESTOS_AREAS = {'Gerencia': ['Directiva'], 'Administración': ['Administración'], 'Ventas': ['Ventas'], 'Recursos humanos': ['Recursos humanos'],
  'Producción': ['Cocina', 'Fritura', 'Mantenimiento', 'Línea salsera'], 'Logística': ['Empaque', 'Almacén', 'Despacho / Choferes']};
export const PUESTOS = Object.keys(PUESTOS_AREAS);
export const PUESTOS_PLANTA = ['Producción', 'Logística'];
export const AREAS = PUESTOS.flatMap(p => PUESTOS_AREAS[p]);
export const AREAS_PLANTA = PUESTOS_PLANTA.flatMap(p => PUESTOS_AREAS[p]);
export const AREA_SIN_DEFINIR = 'Sin definir';
export const AREA_VIEJA = 'Administración y ventas';
/* Nombres de antes: se traducen a puesto + área. «Producción» sola no dice si es Cocina, Fritura o Mantenimiento: queda «Sin definir» hasta que Recursos humanos elija. */
export const AREAS_ANTES = {'Producción': ['Producción', AREA_SIN_DEFINIR], 'Empaque': ['Logística', 'Empaque'], 'Línea salsera': ['Producción', 'Línea salsera'], 'Almacén': ['Logística', 'Almacén'], 'Logística': ['Logística', 'Despacho / Choferes'],
  'Freído y procesamiento': ['Producción', AREA_SIN_DEFINIR], 'Almacén y recepción': ['Logística', 'Almacén'], 'Logística (choferes y ayudantes)': ['Logística', 'Despacho / Choferes'], [AREA_VIEJA]: ['Administración', 'Administración']};
const sinT = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const buscar = (lista, x) => lista.find(n => sinT(n) === sinT(x)) || null;
export const puestoReal = p => buscar(PUESTOS, p);
export const areaReal = a => buscar(AREAS, a);
export const areasDe = p => PUESTOS_AREAS[puestoReal(p)] || [];
export const puestoDeArea = a => PUESTOS.find(p => PUESTOS_AREAS[p].includes(areaReal(a))) || null;
/* Puesto y área de una persona. Si no tiene puesto guardado, sale del área (también la vieja). */
export function puestoAreaDe(e) {
  const x = e || {}, ar = String(x.area || '').trim(), pu = puestoReal(x.puesto);
  if (pu) return {puesto: pu, area: ar};
  const real = areaReal(ar); if (real) return {puesto: puestoDeArea(real), area: real};
  const k = Object.keys(AREAS_ANTES).find(n => sinT(n) === sinT(ar)); return k ? {puesto: AREAS_ANTES[k][0], area: AREAS_ANTES[k][1]} : {puesto: null, area: ar};
}
export const puestoDe = e => puestoAreaDe(e).puesto;
/* ¿Puesto de oficina (Gerencia, Administración, Ventas, Recursos humanos)? */
export const esPuestoOficina = e => !!e && PUESTOS.includes(puestoDe(e)) && !PUESTOS_PLANTA.includes(puestoDe(e));
/* Planta = Producción y Logística; quien no tiene puesto claro (datos viejos) cuenta como planta para no quitarle lo que ya tenía */
export const esPlanta = e => !!e && !esPuestoOficina(e);
export const MSG_AREA = 'Elige el puesto y su área de la lista.';
export const MSG_TURNO_SOLO_PLANTA = 'Los turnos, grupos y bonos son solo para el personal de planta (puestos Producción y Logística).';
/* Al guardar una persona (lo llama el Worker): puesto y área deben ser de la lista (el área, de las de ese puesto) y el turno fijo solo va con puestos de planta.
   Lo ya guardado no se rompe: solo se valida lo que cambia. Quien no manda puesto (datos de ejemplo, versiones viejas) se valida por su área; «Administración y ventas» ya no se acepta. */
export function validarEmpleado(ant, nuevo) {
  const n = nuevo || {}, a0 = ant ? String(ant.area || '') : null, a1 = String(n.area || ''), p0 = ant ? String(ant.puesto || '') : null, p1 = String(n.puesto || '');
  if (!ant || a1 !== a0 || p1 !== p0) {
    if (puestoReal(p1)) { if (!areasDe(p1).includes(a1) && !(a1 === AREA_SIN_DEFINIR && ant && a1 === a0)) throw {status: 400, message: MSG_AREA}; }
    else if (p1 || !(areaReal(a1) || (AREAS_ANTES[a1] && a1 !== AREA_VIEJA))) throw {status: 400, message: MSG_AREA};
  }
  const t0 = ant ? String(ant.turno || '') : '', t1 = String(n.turno || '');
  if (t1 && (!ant || t1 !== t0 || a1 !== a0 || p1 !== p0) && !esPlanta(n)) throw {status: 400, message: MSG_TURNO_SOLO_PLANTA};
}
/* «Personal activo hoy» NO cuenta choferes (cargo chofer o área Despacho / Choferes) ni a quienes son de Administración o Ventas. Gerencia y Recursos humanos SÍ cuentan por ahora. */
export const esChofer = e => !!e && (e.es_chofer === true || e.es_chofer === 1 || /(chofer|conductor)/i.test(String(e.cargo || '')) || sinT(puestoAreaDe(e).area) === sinT('Despacho / Choferes'));
export const esAdmin = e => !!e && ['Administración', 'Ventas'].includes(puestoDe(e));
export const cuentaEnPlanta = e => !!e && !esChofer(e) && !esAdmin(e);
/* Cargos de la empresa (2.1): SOLO informativos. Se eligen en la ficha del empleado (Nómina) y el cargo «Vendedor» alimenta la lista de vendedores al agregar clientes.
   No son puestos de entrada ni módulos y no cambian ningún permiso. La misma lista está en app-source.html (la ficha del empleado); una prueba vigila que no se separen. */
export const CARGOS = ['Presidente', 'Vicepresidente', 'Gerente', 'Administrador', 'Vendedor', 'Supervisor de Planta', 'Supervisor de Producción', 'Supervisor de Cocina', 'Cocineros', 'Supervisor de Empaque', 'Almacén', 'Control de Calidad', 'Mecánicos Industriales', 'Mantenimiento'];
const sinTild = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
export const cargoReal = c => CARGOS.find(n => sinTild(n) === sinTild(c)) || null;
export const esCargoVendedor = c => sinTild(c) === 'vendedor';
export const activo = e => !!e && !e.arch && e.estado !== 'retirado';
/* Horas de entrada a salida (con decimales); sin salida: 0 */
export const horasDe = m => (m.salida_ts && m.entrada_ts ? Math.max(0, (m.salida_ts - m.entrada_ts) / 36e5) : 0);
