/* Compras · reglas puras (sin base de datos). «Hacer una compra»: pedido al proveedor eligiendo productos. */
export const ROLES_COMPRAS = ['dueno', 'adm'];
export const puedeComprar = rol => ROLES_COMPRAS.includes(rol);
export const MSG_SIN_PERMISO = 'Solo Administración y el Dueño hacen compras.';
export const normFactura = s => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const fechaOk = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const num = v => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) ? Number(v) : NaN;

/* Valida el cuerpo; devuelve {error} o {datos}. El proveedor, los productos y el banco se comprueban luego contra sus catálogos. */
export function validarPedido(b) {
  if (!b || typeof b !== 'object') return {error: 'Faltan los datos de la compra.'};
  const proveedor_id = String(b.proveedor_id ?? '').trim();
  if (!proveedor_id) return {error: 'Elige el proveedor.'};
  if (!Array.isArray(b.lineas) || !b.lineas.length) return {error: 'Elige al menos un producto.'};
  if (b.lineas.length > 40) return {error: 'Demasiados productos en una sola compra.'};
  const lineas = [], vistos = new Set();
  for (const l of b.lineas) {
    const producto_id = String((l && l.producto_id) || '').trim(); if (!producto_id) return {error: 'Hay un producto sin identificar.'};
    if (vistos.has(producto_id)) return {error: 'Un producto está repetido en la compra.'};
    vistos.add(producto_id);
    const cantidad = num(l.cantidad), precio_usd = num(l.precio_usd);
    if (!(cantidad > 0) || cantidad > 1e7) return {error: 'La cantidad de cada producto debe ser mayor que cero.'};
    if (!(precio_usd > 0) || precio_usd > 1e6) return {error: 'El precio de cada producto debe ser mayor que cero.'};
    lineas.push({producto_id, cantidad, precio_usd});
  }
  const factura = String(b.factura ?? '').trim();
  if (!factura) return {error: 'Escribe el número de factura del proveedor.'};
  if (factura.length > 40 || !normFactura(factura)) return {error: 'El número de factura no es válido.'};
  const fecha = String(b.fecha ?? '').trim();
  if (!fechaOk(fecha)) return {error: 'Escribe la fecha de la factura.'};
  const condicion = String(b.condicion ?? '').toUpperCase();
  if (condicion !== 'CONTADO' && condicion !== 'CREDITO') return {error: 'Elige si es de contado o a crédito.'};
  let plazo_dias = null, id_banco = null;
  if (condicion === 'CREDITO') {
    plazo_dias = num(b.plazo_dias);
    if (!Number.isInteger(plazo_dias) || plazo_dias < 1 || plazo_dias > 365) return {error: 'A crédito, escribe el plazo en días (de 1 a 365).'};
  } else {
    id_banco = num(b.id_banco);
    if (!Number.isInteger(id_banco) || id_banco < 1) return {error: 'De contado, elige el banco o la cuenta de donde se paga.'};
  }
  return {datos: {proveedor_id, lineas, factura, fecha, condicion, plazo_dias, id_banco}};
}
/* Subtotal en centavos (cantidad × precio, con precios de hasta 6 decimales) */
export const subtotalCents = (cantidad, precio) => Math.round(Math.round(cantidad * precio * 1e6) / 1e4);
export const aBsCents = (usdCents, tasa) => Math.round(usdCents * tasa);
