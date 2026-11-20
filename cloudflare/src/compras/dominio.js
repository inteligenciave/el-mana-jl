/* Compras · reglas puras (sin base de datos). «Hacer una compra»: pedido al proveedor eligiendo productos. */
export const ROLES_COMPRAS = ['dueno', 'adm'];
export const puedeComprar = rol => ROLES_COMPRAS.includes(rol);
export const MSG_SIN_PERMISO = 'Solo Administración y el Gerente hacen compras.';
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
/* Insumos del inventario general que se compran directo (agua, almidón, empaque…): el producto de la línea se llama «INV:codigo» y no hace falta crearlo en el catálogo */
export const PREFIJO_INV = 'INV:';
export const esInv = id => String(id || '').startsWith(PREFIJO_INV);
export const codigoInv = id => String(id || '').slice(PREFIJO_INV.length);
/* ---------- Producto nuevo desde el cuadro del proveedor (sin precio) ---------- */
export const UNIDADES_NUEVO = {kg: 'kg', saco: 'saco', litro: 'L', l: 'L', unidad: 'und', und: 'und', caja: 'caja'};
export const MSG_SIN_NUEVO = 'Solo Administración y el Gerente agregan productos nuevos.';
export const sinTilde = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const claveNombre = s => sinTilde(s).replace(/\s+/g, ' ');
export const slugNombre = s => sinTilde(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'producto';
/* Valida {nombre, tipo, unidad}; devuelve {error} o {datos:{nombre, tipo, unidad}} */
export function validarProductoNuevo(b) {
  if (!b || typeof b !== 'object') return {error: 'Faltan los datos del producto.'};
  const nombre = String(b.nombre ?? '').replace(/\s+/g, ' ').trim();
  if (nombre.length < 2) return {error: 'Escribe el nombre del producto.'};
  if (nombre.length > 60) return {error: 'El nombre es muy largo (máximo 60 letras).'};
  const tipo = String(b.tipo ?? '').toLowerCase();
  if (tipo !== 'papa' && tipo !== 'insumo') return {error: 'Elige si es una papa o un insumo.'};
  const unidad = UNIDADES_NUEVO[sinTilde(b.unidad)];
  if (!unidad) return {error: 'Elige la unidad: kilos, sacos, litros, unidades o cajas.'};
  return {datos: {nombre, tipo, unidad}};
}
/* Subtotal en centavos (cantidad × precio, con precios de hasta 6 decimales) */
export const subtotalCents = (cantidad, precio) => Math.round(Math.round(cantidad * precio * 1e6) / 1e4);
export const aBsCents = (usdCents, tasa) => Math.round(usdCents * tasa);

/* ---------- Papa por saco (4.1) ---------- */
export const KG_SACO_REF = 43;        // peso de referencia de un saco de papa cruda (solo referencia: el peso real sale de la muestra)
export const MUESTRA_SACOS = 5;       // sacos que se pesan en cada recepción de papa cruda
export const KG_SACO_MAX = 120;       // tope de cordura para una pesada
export const esPapaCruda = pr => !!pr && pr.tipo === 'papa' && String(pr.cat || '').toLowerCase().trim() === 'papa cruda';
const r2 = n => Math.round(n * 100) / 100;
/* Peso promedio y dispersión de las pesadas de muestra */
export function estadisticaMuestra(pesadas) {
  const n = pesadas.length, prom = pesadas.reduce((a, x) => a + x, 0) / n, varz = pesadas.reduce((a, x) => a + (x - prom) ** 2, 0) / n;
  return {n, prom: r2(prom), desv: r2(Math.sqrt(varz))};
}
/* Kilos del lote = peso promedio real de la muestra × sacos recibidos */
export const kilosDelLote = (prom, sacos) => r2(prom * sacos);

/* ---------- Recepción (verificación física) enlazada con la orden de compra ---------- */
export const ROLES_RECIBIR = ['dueno', 'produccion'];
export const ROLES_VER_DIF = ['dueno', 'adm'];
export const MSG_SIN_RECIBIR = 'Solo Producción y el Gerente reciben la mercancía.';
export const MSG_SIN_VER_DIF = 'Solo Administración y el Gerente ven las diferencias de las compras.';
const EPS = 1e-9;
/* ¿Difiere lo recibido de lo comprado? Devuelve una fila por producto que no coincide. */
export function diferenciasDe(lineasPedido, recibidos) {
  const out = [];
  for (const l of lineasPedido) {
    const rec = recibidos[l.producto_id] ?? 0, dif = Math.round((rec - l.cantidad) * 1e6) / 1e6;
    if (Math.abs(dif) > EPS) out.push({producto_id: l.producto_id, producto: l.producto_nombre, unidad: l.unidad, comprado: l.cantidad, recibido: rec, diferencia: dif});
  }
  return out;
}
/* Valida lo que escribió quien recibe. lineasPedido = [{producto_id, producto_nombre, unidad, cantidad, papa}].
   Devuelve {error} o {datos:{lineas:[{producto_id, recibido, pesadas?, muestra?, kg?}], confirmar, motivo, obs}}. */
export function validarRecepcion(b, lineasPedido) {
  if (!b || typeof b !== 'object') return {error: 'Faltan los datos de la recepción.'};
  if (!Array.isArray(b.lineas) || !b.lineas.length) return {error: 'Anota lo que llegó de cada producto.'};
  const dados = new Map();
  for (const l of b.lineas) { const id = String((l && l.producto_id) || '').trim(); if (!id || dados.has(id)) return {error: 'Hay un producto sin identificar o repetido en la recepción.'}; dados.set(id, l); }
  const lineas = [];
  for (const p of lineasPedido) {
    const l = dados.get(p.producto_id); if (!l) return {error: 'Falta anotar lo que llegó de ' + p.producto_nombre + '.'};
    const recibido = num(l.recibido);
    if (!(recibido >= 0) || recibido > 1e7) return {error: 'Lo recibido de ' + p.producto_nombre + ' debe ser 0 o más.'};
    if (p.papa) {
      if (!Number.isInteger(recibido)) return {error: 'La papa cruda se recibe por sacos: escribe un número entero de sacos.'};
      if (recibido === 0) { lineas.push({producto_id: p.producto_id, recibido: 0}); continue; }
      if (recibido < MUESTRA_SACOS) return {error: 'Para pesar la muestra hacen falta al menos ' + MUESTRA_SACOS + ' sacos. Llegaron ' + recibido + '.'};
      const pes = Array.isArray(l.pesadas) ? l.pesadas.map(num) : [];
      if (pes.length !== MUESTRA_SACOS || pes.some(x => !(x > 0))) return {error: 'Pesa ' + MUESTRA_SACOS + ' sacos de muestra de ' + p.producto_nombre + ' y escribe el peso de cada uno.'};
      if (pes.some(x => x > KG_SACO_MAX)) return {error: 'Hay una pesada de más de ' + KG_SACO_MAX + ' kg: revísala.'};
      const m = estadisticaMuestra(pes);
      lineas.push({producto_id: p.producto_id, recibido, pesadas: pes, muestra: m, kg: kilosDelLote(m.prom, recibido)});
    } else lineas.push({producto_id: p.producto_id, recibido});
  }
  const motivo = String(b.motivo ?? '').trim().slice(0, 200), obs = String(b.obs ?? '').trim().slice(0, 200);
  return {datos: {lineas, confirmar: b.confirmar_diferencia === true, motivo, obs}};
}
