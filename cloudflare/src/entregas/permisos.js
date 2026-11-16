/* Quién puede qué en Entregas. Sin dependencias (se inlinea en la página). El Gerente puede todo.
   Despachos = rol «Empaque y despacho» (empaque) y «Jefe de producción» (jefeprod). Cobranza = cobranza y Administración (adm). */
export const ENT_ACCIONES = {
  ver: ['dueno', 'jefeprod', 'empaque', 'cobranza', 'adm'],
  subir: ['dueno', 'jefeprod', 'empaque'],
  confirmar: ['dueno', 'jefeprod'],
  cobranza: ['dueno', 'cobranza', 'adm'],
  verCobranza: ['dueno', 'cobranza', 'adm', 'ventas'],   // ver plazos y reclamos (Ventas solo mira)
  ajustes: ['dueno']
};
export const entPuede = (rol, accion) => (ENT_ACCIONES[accion] || []).includes(rol);
