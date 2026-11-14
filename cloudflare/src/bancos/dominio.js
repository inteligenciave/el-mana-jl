/* Bancos · reglas puras (sin base de datos ni HTTP). */
export const ROLES_GESTIONA = ['dueno', 'adm'];
export const puedeGestionar = rol => ROLES_GESTIONA.includes(rol);
export const MSG_SIN_PERMISO = 'Solo el Dueño y Administración agregan, editan o desactivan bancos.';
export const MONEDAS = {BS: 'Bolívares', USD: 'Dólares'};
export const MSG_LISTA_VACIA = 'Todavía no hay bancos cargados. Pídele al Dueño o a Administración que los carguen';

/* Datos de un banco como llegan de la pantalla. Devuelve {banco} o {error} */
export function validarBanco(b) {
  const x = b || {}, t = (v, n) => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim().slice(0, n);
  const nombre = t(x.nombre, 60), moneda = String(x.moneda || '').toUpperCase();
  if (!nombre) return {error: 'Escribe el nombre del banco.'};
  if (!MONEDAS[moneda]) return {error: 'Elige la moneda de la cuenta: bolívares o dólares.'};
  return {banco: {nombre, moneda, cuenta_numero: t(x.cuenta_numero, 40) || null, cuenta_titular: t(x.cuenta_titular, 80) || null}};
}
