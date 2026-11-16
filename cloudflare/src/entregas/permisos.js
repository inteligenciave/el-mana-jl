/* Quién puede qué en Entregas. Sin dependencias (se inlinea en la página). El Gerente puede todo.
   Entregas con foto = Logística (clave empaque); confirmar o rechazar: solo el Gerente. Cobranza = Administración (adm). */
export const ENT_ACCIONES = {
  ver: ['dueno', 'empaque', 'adm'],
  subir: ['dueno', 'empaque'],
  confirmar: ['dueno'],
  cobranza: ['dueno', 'adm'],
  verCobranza: ['dueno', 'adm', 'ventas'],   // ver plazos y reclamos (Ventas solo mira)
  ajustes: ['dueno']
};
export const entPuede = (rol, accion) => (ENT_ACCIONES[accion] || []).includes(rol);
