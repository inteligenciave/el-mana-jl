/* Reportes de ventas (por rubro, vendedor, zona o producto) calculados con los MISMOS documentos que el Registro de ventas:
   notas de entrega y facturas, sin anuladas y sin la nota que ya se facturó (cuenta una sola vez, como factura), por fecha de emisión.
   El total de $ de cada documento se reparte entre sus líneas según el peso de cada una, así la suma por rubro/producto cuadra al centavo con el Registro. */
import * as R from './repo.js';
import * as D from './dominio.js';

const err = (status, message) => Object.assign(new Error(message), {status, message});
const SIN_DETALLE = 'Sin detalle (importado del Excel)';
const AGRUPAR = ['rubro', 'vendedor', 'zona', 'producto'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
/* Rubros: SOLO dos, Papas y Salsas. Se clasifica por la categoría del producto; si falta, por el nombre. */
const RUBROS = ['Papas', 'Salsas'];
const rubroTxt = (c, nombre) => { const s = String(c || '').trim().toUpperCase(); if (s === 'SALSAS' || s === 'SALSA') return 'Salsas'; if (s === 'PAPAS' || s === 'PAPA') return 'Papas';
  return /salsa|mayonesa|mostaza|ketchup|catsup|aderezo/i.test(String(nombre || '')) ? 'Salsas' : 'Papas'; };
/* Presentación = producto + gramaje, escrita igual en todos los reportes (p. ej. «Papas Doraditas Cabello de Ángel 400 g») */
const presentacion = l => { const n = String(l.pnombre || l.lnombre || '').trim(), g = String(l.gramaje || '').trim().replace(/\s*(kg|g)$/i, ' $1').trim(); return g && !n.toLowerCase().includes(g.toLowerCase()) ? n + ' ' + g : n; };

/* Reparte `total` centavos entre pesos (mayor resto): la suma da exactamente `total` */
export function repartir(total, pesos) {
  const sum = pesos.reduce((a, b) => a + b, 0), n = pesos.length;
  if (!n) return [];
  const base = pesos.map(w => sum > 0 ? Math.floor(total * w / sum) : Math.floor(total / n));
  let resto = total - base.reduce((a, b) => a + b, 0);
  const orden = pesos.map((w, i) => ({i, f: sum > 0 ? (total * w) % sum / sum : 0})).sort((a, b) => b.f - a.f || a.i - b.i);
  for (let k = 0; resto > 0 && n; k = (k + 1) % n, resto--) base[orden[k].i]++;
  return base;
}

/* quien: {rol, vendedor} — Gerencia y Administración ven todo; Ventas solo el vendedor indicado; los demás, 403 */
export async function reporteVentas(db, {agrupar, desde, hasta, rol, vendedor}) {
  if (!AGRUPAR.includes(agrupar)) throw err(400, 'Elige cómo agrupar: rubro, vendedor, zona o producto.');
  if (!ISO.test(desde || '') || !ISO.test(hasta || '')) throw err(400, 'Las fechas deben ser AAAA-MM-DD.');
  if (desde > hasta) throw err(400, 'La fecha «Desde» no puede ser posterior a «Hasta».');
  const soloVendedor = rol === 'ventas';
  if (soloVendedor && !vendedor) throw err(400, 'Elige tu nombre de vendedor para ver tus ventas.');
  const a = [desde, hasta]; let filtro = '';
  if (soloVendedor) { a.push(vendedor); filtro = ' AND d.id_vendedor = ?3'; }
  const filas = await R.all(db, `SELECT d.id_documento, d.total_cents, d.sin_lineas, d.id_vendedor, v.nombre AS vend, d.envio_zona, c.zona AS czona,
      l.id AS lid, l.id_producto, l.nombre AS lnombre, l.cantidad, l.precio_base_cents, p.nombre AS pnombre, p.gramaje, p.categoria
    FROM documentos_venta d JOIN clientes c ON c.id_cliente = d.id_cliente LEFT JOIN vendedores v ON v.id = d.id_vendedor
    LEFT JOIN documento_lineas l ON l.id_documento = d.id_documento LEFT JOIN productos p ON p.id_producto = l.id_producto
    WHERE d.estado NOT IN ('ANULADO','FACTURADO_DESDE_NE') AND d.fecha_emision >= ?1 AND d.fecha_emision <= ?2${filtro} ORDER BY d.id_documento, l.id`, a);
  const docs = new Map();
  for (const f of filas) { let d = docs.get(f.id_documento); if (!d) docs.set(f.id_documento, d = {f, lineas: []}); if (f.lid != null) d.lineas.push(f); }
  const grupos = new Map(), docsTot = new Set();
  let tot = {cents: 0, bultos: 0, paquetes: 0}, sinClasif = 0;
  if (agrupar === 'rubro') for (const r of RUBROS) grupos.set('n:' + r, {nombre: r, cents: 0, bultos: 0, paquetes: 0, ped: new Set(), det: new Map()});
  for (const [id, d] of docs) {
    const h = d.f, total = h.total_cents || 0;
    const vendedorN = h.vend || 'Sin vendedor', zona = D.zonaDeEstado(h.envio_zona || h.czona) || 'Sin zona';
    const items = d.lineas.length ? d.lineas : [{pnombre: SIN_DETALLE, id_producto: null, cantidad: 0, precio_base_cents: 0, categoria: null, sinDetalle: true}];
    const pesos = items.map(l => l.sinDetalle ? 1 : l.cantidad * (l.precio_base_cents || 0) || l.cantidad);
    const partes = repartir(total, pesos);
    if (agrupar !== 'rubro' || d.lineas.length) { tot.cents += total; docsTot.add(id); } else sinClasif += total;
    items.forEach((l, i) => {
      if (agrupar === 'rubro' && l.sinDetalle) return;
      const rubro = l.sinDetalle ? '' : rubroTxt(l.categoria, l.pnombre || l.lnombre), cant = l.cantidad || 0, esSalsa = rubro === 'Salsas';
      const pres = l.sinDetalle ? SIN_DETALLE : presentacion(l);
      const nombre = agrupar === 'vendedor' ? vendedorN : agrupar === 'zona' ? zona : agrupar === 'rubro' ? rubro : pres;
      const clave = agrupar === 'producto' && l.id_producto != null ? 'p' + l.id_producto : 'n:' + nombre;
      let g = grupos.get(clave); if (!g) grupos.set(clave, g = {nombre, rubro, cents: 0, bultos: 0, paquetes: 0, ped: new Set(), det: new Map()});
      g.cents += partes[i]; g.ped.add(id);
      if (esSalsa) { g.paquetes += cant; tot.paquetes += cant; } else if (rubro) { g.bultos += cant; tot.bultos += cant; }
      const dk = l.id_producto != null ? 'p' + l.id_producto : 'n:' + pres;
      let x = g.det.get(dk); if (!x) g.det.set(dk, x = {nombre: pres, rubro, unidad: esSalsa ? 'Paquetes' : rubro ? 'Bultos' : '', cents: 0, cantidad: 0, ped: new Set()});
      x.cents += partes[i]; x.cantidad += cant; x.ped.add(id);
    });
  }
  const filasOut = [...grupos.values()].map(g => ({nombre: g.nombre, rubro: agrupar === 'producto' ? (g.rubro || '') : '', total: g.cents / 100, bultos: g.bultos, paquetes: g.paquetes, pedidos: g.ped.size, pct: tot.cents ? Math.round(g.cents * 10000 / tot.cents) / 100 : 0,
      detalle: agrupar === 'producto' ? [] : [...g.det.values()].map(x => ({nombre: x.nombre, rubro: x.rubro, unidad: x.unidad, cantidad: x.cantidad, total: x.cents / 100, pedidos: x.ped.size})).sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, 'es'))}))
    .sort(agrupar === 'rubro' ? (x, y) => RUBROS.indexOf(x.nombre) - RUBROS.indexOf(y.nombre) : (x, y) => y.total - x.total || x.nombre.localeCompare(y.nombre, 'es'));
  return {agrupar, desde, hasta, filas: filasOut, totales: {total: tot.cents / 100, bultos: tot.bultos, paquetes: tot.paquetes, pedidos: docsTot.size, pct: filasOut.length ? 100 : 0},
    nota: 'Cuenta notas de entrega y facturas (sin anuladas) por su fecha de emisión, igual que el Registro de ventas. Papas se cuentan en bultos y salsas en paquetes (nunca se suman entre sí). Las ventas importadas del Excel no traen detalle de productos: solo suman el monto.' + (sinClasif ? ' Por rubro no incluye $ ' + (sinClasif / 100).toFixed(2) + ' de ventas importadas sin detalle, que no se pueden clasificar en Papas o Salsas.' : ''), solo_vendedor: soloVendedor};
}
