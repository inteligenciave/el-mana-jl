/* Permisos de Producción y zonas. Se comprueban en el servidor con el rol de la cabecera x-rol (la pantalla solo los repite para ordenar).
   Producción (clave produccion): lleva el turno (abrir, kilos por etapa, recibir papa, cerrar) y ve el turno, lo que hay en proceso y las diferencias.
   Logística (clave empaque): empaca por turno (anota los bultos), ve las zonas y los pedidos SIN dinero, arma y despacha salidas, cuenta la carga.
   Aprobar o rechazar diferencias, anular pedidos y los ajustes: solo el Gerente. */
export const PUEDE = {
  verTurno: ['dueno', 'produccion', 'empaque'],
  verSalidas: ['dueno', 'empaque'],
  turno: ['dueno', 'produccion'],
  empacar: ['dueno', 'empaque'],
  mover: ['dueno', 'empaque'],
  aprobar: ['dueno'],
  verDif: ['dueno', 'produccion', 'empaque'],
  cargar: ['dueno', 'empaque'],
  dueno: ['dueno']
};
/* Puestos que NUNCA reciben dinero de /api/p (precios, montos, totales): se quita en el servidor antes de responder */
export const SIN_DINERO = ['empaque', 'produccion'];
const CLAVE_DINERO = /monto|precio|cents|descuento|costo|usd|pago_json|metodo_pago|lista_precios|alicuota|^total$|^total_/i;
export function sinDinero(v) {
  if (Array.isArray(v)) return v.map(sinDinero);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) if (!CLAVE_DINERO.test(k)) o[k] = sinDinero(v[k]); return o; }
  return v;
}
export const puede = (rol, accion) => (PUEDE[accion] || []).includes(rol);
