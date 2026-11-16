/* Permisos de Producción y zonas. Se comprueban en el servidor con el rol de la cabecera x-rol (la pantalla solo los repite para ordenar).
   Turnos: rol «Producción» y Gerente. Movimientos por zona (armar salida, despachar, pausar, dividir): Gerente y Jefe de producción. Ajustes y conteo inicial: solo el Gerente.
   Herencia: aprueban o rechazan diferencias el Jefe de producción y el Gerente (si el Jefe anotó la diferencia, solo el Gerente). Cargar el camión: Empaque y despacho, Jefe y Gerente. */
export const PUEDE = {
  ver: ['dueno', 'jefeprod', 'produccion'],
  verSalidas: ['dueno', 'jefeprod', 'produccion', 'empaque'],
  turno: ['dueno', 'produccion'],
  mover: ['dueno', 'jefeprod'],
  aprobar: ['dueno', 'jefeprod'],
  verDif: ['dueno', 'jefeprod'],
  cargar: ['dueno', 'jefeprod', 'empaque'],
  dueno: ['dueno']
};
export const puede = (rol, accion) => (PUEDE[accion] || []).includes(rol);
