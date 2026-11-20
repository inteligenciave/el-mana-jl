/* Inventario general · reglas puras (sin base de datos). Una sola cifra por artículo: papa cruda, aceite, agua, sal, químicos y material de empaque
   (y lo que más se compre). El saldo es lo contado al arrancar más las entradas por compra, menos consumos y mermas. */
export const ROLES_VER = ['dueno', 'adm', 'produccion'];
export const ROLES_CONTEO = ['dueno', 'adm'];        // cargan el conteo físico inicial
export const ROLES_CONSUMO = ['dueno', 'produccion']; // anotan consumos y mermas de planta
export const MSG_SIN_VER = 'Tu puesto no ve el inventario general.';
export const MSG_SIN_CONTEO = 'Solo Gerencia y Administración cargan el conteo inicial.';
export const MSG_SIN_CONSUMO = 'Solo Producción y el Gerente anotan consumos y mermas.';

/* Los 7 artículos base (los mismos de la migración) */
export const ARTICULOS_BASE = [
  {codigo: 'papa', nombre: 'Papa cruda', unidad: 'kg'}, {codigo: 'aceite', nombre: 'Aceite', unidad: 'kg'}, {codigo: 'agua', nombre: 'Agua', unidad: 'L'},
  {codigo: 'sal', nombre: 'Sal', unidad: 'kg'}, {codigo: 'quimicos', nombre: 'Químicos', unidad: 'kg'}, {codigo: 'empaque', nombre: 'Bolsas sin presentación', unidad: 'und'}, {codigo: 'bolsones', nombre: 'Bolsones', unidad: 'und'}, {codigo: 'almidon', nombre: 'Almidón', unidad: 'kg'}
];
/* Una bolsa por cada presentación de papa: artículo bolsa-<id_producto> (lo crea la base al crearse la presentación, migración 0047). «empaque» = bolsas sin presentación, que Gerencia reparte. */
export const PREFIJO_BOLSA = 'bolsa-';
export const esBolsa = c => String(c || '').startsWith(PREFIJO_BOLSA);
export const codigoBolsa = idProducto => PREFIJO_BOLSA + idProducto;
const sinTilde = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const slug = s => sinTilde(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
const POR_CAT = {'papa cruda': 'papa', aceite: 'aceite', agua: 'agua', sal: 'sal', quimicos: 'quimicos', aditivos: 'quimicos', metabisulfito: 'quimicos', empaques: 'empaque', empaque: 'empaque', 'bolsas de presentacion': 'empaque', 'bolsas sin presentacion': 'empaque', bolsones: 'bolsones', bolson: 'bolsones', almidon: 'almidon'};
/* A qué artículo del inventario general pertenece un producto del catálogo de compras ({cat, sk, n, unidad}). Lo que no está en la lista se vuelve un artículo propio. */
export function articuloDe(pr) {
  if (pr && pr.inv) { const b = ARTICULOS_BASE.find(a => a.codigo === pr.inv); return {codigo: pr.inv, nombre: b ? b.nombre : String(pr.n || pr.inv), unidad: String(pr.unidad || (b && b.unidad) || 'kg')}; }   // insumo comprado directo del inventario
  const c = sinTilde(pr && pr.cat), k = sinTilde(pr && pr.sk);
  const cod = POR_CAT[c] || POR_CAT[k] || slug((pr && (pr.cat || pr.sk || pr.n)) || 'otro') || 'otro';
  const base = ARTICULOS_BASE.find(a => a.codigo === cod);
  return {codigo: cod, nombre: base ? base.nombre : String((pr && (pr.cat || pr.sk || pr.n)) || 'Otro'), unidad: base ? base.unidad : String((pr && pr.unidad) || 'kg')};
}
const num = v => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) ? Number(String(v).replace(',', '.')) : NaN;
export const r3 = n => Math.round(n * 1000) / 1000;
/* Conteo inicial: [{articulo, cantidad}] con cantidades de 0 o más; sin repetidos */
export function validarConteo(b) {
  if (!b || !Array.isArray(b.conteos) || !b.conteos.length) return {error: 'Escribe lo contado de cada artículo.'};
  if (b.conteos.length > 200) return {error: 'Demasiados artículos.'};
  const vistos = new Set(), conteos = [];
  for (const c of b.conteos) {
    const articulo = String((c && c.articulo) || '').trim(); if (!articulo) return {error: 'Hay un artículo sin identificar.'};
    if (vistos.has(articulo)) return {error: 'Un artículo está repetido en el conteo.'};
    vistos.add(articulo);
    const cantidad = num(c.cantidad); if (!(cantidad >= 0) || cantidad > 1e9) return {error: 'La cantidad contada de cada artículo debe ser 0 o más.'};
    conteos.push({articulo, cantidad: r3(cantidad)});
  }
  return {conteos};
}
/* Consumo de planta o merma: un artículo y una cantidad mayor que cero */
export function validarSalida(b, {pideMotivo = false} = {}) {
  if (!b || typeof b !== 'object') return {error: 'Faltan los datos.'};
  const articulo = String(b.articulo ?? '').trim(); if (!articulo) return {error: 'Elige el artículo.'};
  const cantidad = num(b.cantidad); if (!(cantidad > 0) || cantidad > 1e9) return {error: 'La cantidad debe ser mayor que cero.'};
  const nota = String(b.nota ?? b.motivo ?? '').trim().slice(0, 200);
  if (pideMotivo && nota.length < 3) return {error: 'Escribe el motivo de la merma.'};
  return {datos: {articulo, cantidad: r3(cantidad), nota}};
}
/* Estado de un saldo frente a su mínimo */
export const estadoSaldo = (saldo, minimo) => saldo < 0 ? 'REVISAR' : (minimo > 0 && saldo < minimo) ? 'BAJO' : 'OK';
/* Semáforo de insumos de producción (tarjeta «Inventario de producción» de Gerencia).
   rojo = en o bajo el mínimo (comprar ya) · amarillo = hasta 1,5 veces el mínimo (ir comprando) · verde = por encima · sin_minimo = Gerencia aún no lo define. */
export const UMBRAL_AMARILLO = 1.5;
export const INSUMOS_ARRANQUE = ['papa', 'aceite', 'agua', 'sal', 'quimicos', 'almidon'];
export function nivelInsumo(saldo, minimo) {
  const s = Number(saldo) || 0, m = Number(minimo) || 0;
  if (!(m > 0)) return 'sin_minimo';
  if (s <= m) return 'rojo';
  return s <= m * UMBRAL_AMARILLO ? 'amarillo' : 'verde';
}
