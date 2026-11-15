/* Bancos · reglas puras (sin base de datos ni HTTP). */
export const ROLES_GESTIONA = ['dueno', 'adm'];
export const puedeGestionar = rol => ROLES_GESTIONA.includes(rol);
export const MSG_SIN_PERMISO = 'Solo el Dueño y Administración agregan, editan o desactivan bancos.';
export const MONEDAS = {BS: 'Bolívares', USD: 'Dólares'};
export const MSG_LISTA_VACIA = 'Todavía no hay bancos cargados. Pídele al Dueño o a Administración que los carguen';

/* Datos de un banco como llegan de la pantalla. Devuelve {banco} o {error} */
export function validarBanco(b) {
  const x = b || {}, t = (v, n) => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim().slice(0, n);
  const largo = v => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim().length;
  const nombre = t(x.nombre, 60), moneda = String(x.moneda || '').toUpperCase();
  if (!nombre) return {error: 'Escribe el nombre del banco.'};
  if (largo(x.nombre) > 60) return {error: 'El nombre del banco es muy largo: usa 60 letras o menos.'};
  if (largo(x.cuenta_titular) > 80) return {error: 'El titular es muy largo: usa 80 letras o menos.'};
  if (largo(x.cuenta_numero) > 40) return {error: 'El número de cuenta es muy largo: usa 40 cifras o menos.'};
  if (t(x.cuenta_numero, 40) && !/^[0-9-]+$/.test(t(x.cuenta_numero, 40))) return {error: 'El número de cuenta solo puede llevar cifras y guiones.'};
  if (!MONEDAS[moneda]) return {error: 'Elige la moneda de la cuenta: bolívares o dólares.'};
  return {banco: {nombre, moneda, cuenta_numero: t(x.cuenta_numero, 40) || null, cuenta_titular: t(x.cuenta_titular, 80) || null}};
}
