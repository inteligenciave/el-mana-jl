/* Bancos · reglas puras (sin base de datos ni HTTP). */
export const ROLES_GESTIONA = ['dueno', 'adm'];
export const puedeGestionar = rol => ROLES_GESTIONA.includes(rol);
export const MSG_SIN_PERMISO = 'Solo el Gerente y Administración agregan, editan o desactivan bancos.';
export const MONEDAS = {BS: 'Bolívares', USD: 'Dólares'};
export const MSG_LISTA_VACIA = 'Todavía no hay bancos cargados. Pídele al Gerente o a Administración que los carguen';

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
  /* Teléfono (Pago Móvil), cédula y RIF: los tres son obligatorios */
  const telefono = t(x.telefono, 20), cedula = t(x.cedula, 15).toUpperCase().replace(/\s/g, ''), rif = t(x.rif, 16).toUpperCase().replace(/\s/g, '');
  const cifrasTel = telefono.replace(/\D/g, '').length;
  if (!telefono) return {error: 'Escribe el número de teléfono (Pago Móvil).'};
  if (!/^\+?[0-9][0-9 -]*[0-9]$/.test(telefono) || cifrasTel < 7 || cifrasTel > 15) return {error: 'El teléfono solo puede llevar cifras (con código de área), guiones y espacios. Ejemplo: 0414-1234567.'};
  if (!cedula) return {error: 'Escribe la cédula de identidad (titular de la cuenta o su representante).'};
  if (!/^[VE]?-?[0-9]{5,10}$/.test(cedula)) return {error: 'La cédula lleva V o E y cifras. Ejemplo: V-12345678.'};
  if (!rif) return {error: 'Escribe el RIF (cuentas jurídicas o comerciales).'};
  if (!/^[JGVEPC]-?[0-9]{8,9}(-?[0-9])?$/.test(rif)) return {error: 'El RIF lleva una letra (J, G, V, E, P o C) y cifras. Ejemplo: J-12345678-9.'};
  return {banco: {nombre, moneda, cuenta_numero: t(x.cuenta_numero, 40) || null, cuenta_titular: t(x.cuenta_titular, 80) || null, telefono, cedula, rif}};
}
