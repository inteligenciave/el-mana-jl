/* Cambios de precio · reglas puras (sin base de datos, sin HTTP). Se inlinea también en la página (build.js quita `export`).
   Quién puede qué:
   · Gerente: cambia y RIGE de una vez.
   · Administración: PROPONE; queda pendiente y el valor anterior sigue vigente hasta que el Gerente apruebe.
   · Cualquier otro rol: no puede colocar ni modificar precios. */
export const ROLES_DIRECTO = ['dueno'];
export const ROLES_PROPONE = ['adm'];
export const ROLES_RESUELVE = ['dueno'];
export const ROLES_VE = ['dueno', 'adm'];
/* 'directo' | 'pendiente' | null (sin permiso) */
export const modoDe = rol => ROLES_DIRECTO.includes(rol) ? 'directo' : ROLES_PROPONE.includes(rol) ? 'pendiente' : null;
export const puedeResolver = rol => ROLES_RESUELVE.includes(rol);
export const puedeVerCambios = rol => ROLES_VE.includes(rol);
export const MSG_SIN_PERMISO = 'Solo el Gerente y Administración pueden colocar o cambiar precios.';
export const MSG_SOLO_DUENO = 'Solo el Gerente aprueba o rechaza cambios de precio.';

export const TIPOS = {PRODUCTO: 'Precio por bulto', CLIENTE: 'Precios especiales por cliente', CREDITO: 'Plazos y porcentajes de crédito'};
export const ESTADO_TXT = {PENDIENTE: 'Pendiente de aprobar', APROBADO: 'Aprobado', RECHAZADO: 'Rechazado'};

/* Cada dato que se puede cambiar: nombre en lenguaje de negocio y tipo de valor */
export const CAMPOS = {
  precio_ref_cents: ['Precio por bulto', 'usd'],
  lista_contado_cents: ['Precio de contado por bulto', 'usd'],
  lista_credito_cents: ['Precio a crédito por bulto', 'usd'],
  precio_base_credito_cents: ['Precio a crédito por bulto', 'usd'],
  precio_pronto_pago_cents: ['Precio de pronto pago por bulto', 'usd'],
  precio_mora_vencido_cents: ['Precio con mora por bulto', 'usd'],
  pct_descuento_pp: ['Descuento por pronto pago', 'pct'],
  pct_recargo_mora: ['Recargo por mora', 'pct'],
  dias_tramo1: ['Días del primer plazo', 'dias'],
  dias_tramo2: ['Días del segundo plazo', 'dias'],
  descuento1_pct: ['Descuento del primer plazo', 'pct'],
  descuento2_pct: ['Descuento del segundo plazo', 'pct'],
  recargo_mora_pct: ['Recargo por mora', 'pct']
};
const CAMPOS_REGLA = ['precio_base_credito_cents', 'precio_pronto_pago_cents', 'precio_mora_vencido_cents', 'pct_descuento_pp', 'pct_recargo_mora'];
const CAMPOS_CREDITO = ['dias_tramo1', 'dias_tramo2', 'descuento1_pct', 'descuento2_pct', 'recargo_mora_pct'];
export const camposRegla = () => CAMPOS_REGLA.slice();
export const camposCredito = () => CAMPOS_CREDITO.slice();

const aCents = n => Math.round(Number(n) * 100);
const vacio = v => v === '' || v == null;

/* Texto de un valor para mostrar (sin códigos): 1,50 · 12 % · 7 días · «sin cargar» */
/* Los precios siempre son POR BULTO: el texto lo dice. */
export function textoValor(campo, v) {
  if (v == null) return 'sin cargar';
  const tipo = (CAMPOS[campo] || [])[1];
  if (tipo === 'usd') return '$ ' + (v / 100).toFixed(2).replace('.', ',') + ' por bulto';
  if (tipo === 'pct') return String(v).replace('.', ',') + ' %';
  if (tipo === 'dias') return v + (v === 1 ? ' día' : ' días');
  return String(v);
}

/* Precio por bulto: dólares con hasta 2 decimales, mayor que cero. Devuelve {cents} o {error} */
export function validarPrecioBulto(v) {
  if (vacio(v)) return {error: 'Escribe el precio por bulto.'};
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return {error: 'El precio por bulto debe ser un número mayor que cero.'};
  if (n > 1000000) return {error: 'Ese precio es demasiado alto: revísalo.'};
  const c = aCents(n);
  if (Math.abs(c / 100 - n) > 1e-9) return {error: 'El precio solo puede tener hasta 2 decimales.'};
  return {cents: c};
}

/* Precios especiales de un cliente. Entrada como la manda la pantalla (dólares y porcentajes; vacío = sin fijar).
   Devuelve {reglas: [{id_producto, precio_*_cents, pct_*}]} o {error}. Una regla con todo vacío significa «quitar la regla». */
export function normalizarReglas(reglas) {
  if (!Array.isArray(reglas)) return {error: 'Faltan los precios del cliente.'};
  const vistos = new Set(), out = [];
  for (const r of reglas) {
    const id = Number(r && r.id_producto);
    if (!Number.isInteger(id) || id < 1) return {error: 'Hay un producto no válido en la lista.'};
    if (vistos.has(id)) return {error: 'Un producto aparece dos veces en la lista.'};
    vistos.add(id);
    const x = {id_producto: id};
    for (const [k, campoIn, esUsd] of [['precio_base_credito_cents', 'precio_base_credito', 1], ['precio_pronto_pago_cents', 'precio_pronto_pago', 1], ['precio_mora_vencido_cents', 'precio_mora_vencido', 1], ['pct_descuento_pp', 'pct_descuento_pp', 0], ['pct_recargo_mora', 'pct_recargo_mora', 0]]) {
      const v = r[campoIn];
      if (vacio(v)) { x[k] = null; continue; }
      const n = Number(String(v).replace(',', '.'));
      if (!Number.isFinite(n) || n < 0) return {error: 'Hay un precio o porcentaje que no es válido.'};
      if (esUsd) { const c = aCents(n); if (Math.abs(c / 100 - n) > 1e-9) return {error: 'Los precios solo pueden tener hasta 2 decimales.'}; x[k] = c; }
      else { if (n > 100) return {error: 'Los porcentajes deben estar entre 0 y 100.'}; x[k] = Math.round(n * 100) / 100; }
    }
    out.push(x);
  }
  return {reglas: out};
}
export const reglaVacia = x => CAMPOS_REGLA.every(k => x[k] == null);

/* Qué campos cambian entre lo guardado y lo nuevo. Devuelve {campo: {antes, despues}} (vacío si nada cambia). */
export function diferencias(campos, antes, despues) {
  const d = {};
  for (const k of campos) {
    const a = antes ? (antes[k] ?? null) : null, b = despues ? (despues[k] ?? null) : null;
    if (a !== b) d[k] = {antes: a, despues: b};
  }
  return d;
}

/* Líneas listas para mostrar de un cambio: [{que, campo, antes, despues}] (textos de negocio) */
export function lineasDe(detalle) {
  const out = [];
  for (const it of (detalle && detalle.items) || []) for (const [k, v] of Object.entries(it.campos || {})) out.push({que: it.nombre || '', campo: (CAMPOS[k] || [k])[0], antes: textoValor(k, v.antes), despues: textoValor(k, v.despues)});
  return out;
}

/* Clave única de lo que se cambia (un solo cambio pendiente por clave) */
export const claveProducto = id => 'P:' + id;
export const claveCliente = id => 'C:' + id;
export const CLAVE_CREDITO = 'CRED';

/* Listas de precios (A y B): precio por bulto de contado y a crédito. La clave es única por producto + lista + modalidad. */
export const LISTAS = ['A', 'B'] /* listas de partida; el Gerente puede crear listas propias de un estado */, MODALIDADES = ['contado', 'credito'];
export const claveLista = (id, lista, mod) => 'L:' + id + ':' + lista + ':' + mod;
export const campoLista = mod => 'lista_' + mod + '_cents';
export function validarLista(lista, mod) {
  if (typeof lista !== 'string' || !lista.trim() || lista.length > 40 || lista.includes(':')) return 'Elige una lista de precios.';
  if (!MODALIDADES.includes(mod)) return 'Elige si es el precio de contado o a crédito.';
  return null;
}
