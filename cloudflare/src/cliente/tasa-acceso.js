/* Único punto donde el portal toca la tasa BCV (solo lectura, para mostrar un equivalente en bolívares de referencia).
   Si el módulo de tasa cambia o falla, el portal sigue funcionando sin mostrar el equivalente. */
import * as T from '../tasa/servicio.js';

export async function tasaReferencia(db) {
  try { const t = await T.vigente(db); return t ? {valor: t.valor, fecha: t.fecha, es_de_hoy: !!t.es_de_hoy} : null; }
  catch (e) { return null; }
}
