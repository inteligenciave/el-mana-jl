/* Dominio puro del módulo de Ventas y Liquidación Dual. Sin base de datos, sin HTTP, sin DOM.
   Lo usan el servidor (src/ventas/servicio.js) y la página (build.js lo inlinea quitando `export`).
   Importes en centavos enteros. Nada de cifras de negocio inventadas: porcentajes, días y precios vienen de los datos. */

export const IVA_DEFECTO = 16; // el manual fija IVA 16 %; cada producto guarda su alícuota editable

export const aCents = v => Math.round(Number(v) * 100);
export const deCents = c => c == null ? null : c / 100;
export const entero = n => typeof n === 'number' && Number.isInteger(n) && n > 0;

/* ---------- Fechas (AAAA-MM-DD). La fecha del servidor se toma en hora de Venezuela (UTC-4). ---------- */
export const hoyVE = (ahora = Date.now()) => new Date(ahora - 4 * 3600e3).toISOString().slice(0, 10);
const diaNum = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
export const diasEntre = (desde, hasta) => Math.round(diaNum(hasta) - diaNum(desde));
export const sumarDias = (s, n) => new Date((diaNum(s) + n) * 864e5).toISOString().slice(0, 10);
export const fechaValida = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(diaNum(s)) && new Date(diaNum(s) * 864e5).toISOString().slice(0, 10) === s;

/* ---------- Precios por cliente y producto: base / pronto pago / mora ---------- */
/* Precios por BULTO. `lp` = fila de la lista regional del cliente para este producto ({contado_cents, credito_cents}).
   Con lista regional: crédito = base y contado = pronto pago. Sin lista (productos viejos) rige el precio de referencia. Los precios especiales del cliente mandan sobre la lista. */
export function preciosProducto(prod, regla, lp) {
  const r = regla || {};
  const base = r.precio_base_credito_cents ?? (lp ? lp.credito_cents : prod.precio_ref_cents);
  if (base == null) return null; // sin precio cargado: no se puede vender
  const ppDef = lp && r.precio_base_credito_cents == null ? lp.contado_cents : base;
  const pp = r.precio_pronto_pago_cents ?? (r.pct_descuento_pp != null ? Math.round(base * (1 - r.pct_descuento_pp / 100)) : ppDef);
  const mora = r.precio_mora_vencido_cents ?? (r.pct_recargo_mora != null ? Math.round(base * (1 + r.pct_recargo_mora / 100)) : base);
  return {base, pp, mora};
}

/* Lista regional del cliente: la elegida en su ficha o, si no, la que sale de su zona.
   A = Lara, Trujillo, Yaracuy. B = Capital, Miranda, Aragua, Carabobo, Oriente. Sin zona reconocida: null (hay que completarla). */
const sinTildes = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
/* Zona de venta = ESTADO de Venezuela. El cliente elige el estado; la zona (Oriente, Capital…) y la lista (A/B) salen de él.
   El mapa estado → lista vive en la tabla estados_lista (el Dueño asigna lista a un estado nuevo); estos valores son los de partida. */
export const ESTADOS = ['Amazonas', 'Anzoátegui', 'Apure', 'Aragua', 'Barinas', 'Bolívar', 'Carabobo', 'Cojedes', 'Delta Amacuro', 'Distrito Capital', 'Falcón', 'Guárico', 'Lara', 'Mérida', 'Miranda', 'Monagas', 'Nueva Esparta', 'Portuguesa', 'Sucre', 'Táchira', 'Trujillo', 'Vargas', 'Yaracuy', 'Zulia'];
export const LISTA_INICIAL = {Lara: 'A', Trujillo: 'A', Yaracuy: 'A', 'Distrito Capital': 'B', Miranda: 'B', Aragua: 'B', Carabobo: 'B', Anzoátegui: 'B', Monagas: 'B', Sucre: 'B', Mérida: 'B', 'Nueva Esparta': 'B'};
let MAPA = {...LISTA_INICIAL};
export const setMapaListas = m => { MAPA = {...(m || {})}; };
export const getMapaListas = () => ({...MAPA});
/* Estado exacto (sin importar mayúsculas ni tildes): devuelve el nombre oficial o null */
export const estadoReal = e => ESTADOS.find(n => sinTildes(n) === sinTildes(String(e || '').trim())) || null;
export const zonaDeEstado = e => { const n = estadoReal(e); return !n ? null : ['Anzoátegui', 'Monagas', 'Sucre'].includes(n) ? 'Oriente' : n === 'Distrito Capital' ? 'Capital' : n; };
export const listaDeEstado = e => { const n = estadoReal(e); return n && MAPA[n] ? MAPA[n] : null; };
export const listaRegional = e => { const l = listaDeEstado(e); return l === 'A' || l === 'B' ? l : null; };   // columna de referencia (solo A/B)
export const listaDeCliente = cli => listaDeEstado(cli && cli.zona);   // cli.zona guarda el ESTADO
export const MSG_ELEGIR_ZONA = 'Elige el estado del cliente: de ahí sale su lista de precios.';
export const MSG_SIN_LISTA_ESTADO = 'Todavía no hay lista de precios para este estado. Pídele al Dueño que la asigne.';
export const MSG_SIN_LISTA = MSG_ELEGIR_ZONA + ' Hasta entonces no se le puede vender.';
export const mensajeSinLista = cli => estadoReal(cli && cli.zona) ? MSG_SIN_LISTA_ESTADO : MSG_ELEGIR_ZONA;
export const MSG_FALTA_ENVIO = 'Falta zona/dirección de entrega';
/* Ubicación de envío para congelar en el documento: {zona, direccion, texto, completa} */
export function ubicacionEnvio(cli) {
  const zona = String((cli && cli.zona) || '').trim(), direccion = String((cli && cli.direccion_entrega) || '').trim();
  const completa = !!(zona && direccion);
  /* '' (no null) marca que el documento es nuevo y trae ubicación de envío congelada */
  return {zona, direccion, completa, texto: completa ? zona + ' · ' + direccion : MSG_FALTA_ENVIO};
}

/* Caso temporal: 1 pronto pago, 2 en plazo, 3 vencido. Un umbral vacío elimina ese caso. */
export function casoTiempo(dias, diasPP, diasCred) {
  if (diasPP != null && dias <= diasPP) return 1;
  if (diasCred != null && dias > diasCred) return 3;
  return 2;
}
export const CASO_TXT = {1: 'Pronto pago', 2: 'Pago en plazo', 3: 'Pago vencido (mora)'};
const CAMPO = {0: 'precio_base_cents', 1: 'precio_pp_cents', 2: 'precio_base_cents', 3: 'precio_mora_cents'};

/* Totales de un conjunto de líneas con los precios del caso (0 = base). El descuento fijo del cliente se aplica sobre el subtotal. */
export function totalesLineas(lineas, caso = 0, descPct = null) {
  const campo = CAMPO[caso];
  let subtotal = 0, ivaBruto = 0;
  for (const l of lineas) { const s = l.cantidad * l[campo]; subtotal += s; ivaBruto += s * (l.alicuota ?? IVA_DEFECTO) / 100; }
  const f = descPct ? 1 - descPct / 100 : 1;
  const descuento = descPct ? Math.round(subtotal * descPct / 100) : 0;
  const base = subtotal - descuento, iva = Math.round(ivaBruto * f);
  return {subtotal, descuento, base, iva, total: base + iva};
}

/* ---------- Liquidación (Fase 2). Devuelve qué se debe cobrar y qué documentos fiscales nacen. ---------- */
export function calcularLiquidacion({doc, lineas, cliente, fechaPago, exonerarMora = false}) {
  const dias = diasEntre(doc.fecha_emision, fechaPago);
  let caso = casoTiempo(dias, cliente.dias_pronto_pago, cliente.dias_credito_normal);
  const casoReal = caso;
  if (exonerarMora && caso === 3) caso = 2;
  const out = {dias, caso, casoCalculado: casoReal, exonerado: exonerarMora && casoReal === 3, ruta: null, nota: null, final: null, neto_cents: 0, comision_base_cents: null};
  if (doc.sin_lineas || !lineas.length) { // importado del Excel: solo monto
    out.ruta = 'SIN_DETALLE'; out.final = {base: doc.total_cents, iva: 0, total: doc.total_cents}; out.neto_cents = doc.total_cents; return out;
  }
  const orig = totalesLineas(lineas, 0, doc.descuento_pct), fin = totalesLineas(lineas, caso, doc.descuento_pct);
  if (doc.tipo_origen === 'NOTA_ENTREGA') { // Ruta A: se factura al cobrar, con los precios del caso
    out.ruta = 'A'; out.final = fin; out.neto_cents = fin.total; out.comision_base_cents = fin.base; return out;
  }
  out.ruta = 'B'; out.final = orig; // Ruta B: la factura ya existe y es inmutable
  if (caso === 1 && orig.base - fin.base > 0) {
    out.nota = {tipo: 'NOTA_CREDITO', base: orig.base - fin.base, iva: orig.iva - fin.iva, total: (orig.base - fin.base) + (orig.iva - fin.iva), motivo: 'Descuento por pronto pago'};
    out.neto_cents = orig.total - out.nota.total; out.comision_base_cents = fin.base;
  } else if (caso === 3 && fin.base - orig.base > 0) {
    out.nota = {tipo: 'NOTA_DEBITO', base: fin.base - orig.base, iva: fin.iva - orig.iva, total: (fin.base - orig.base) + (fin.iva - orig.iva), motivo: 'Recargo por pago vencido'};
    out.neto_cents = orig.total + out.nota.total; out.comision_base_cents = fin.base;
  } else { out.neto_cents = orig.total; out.comision_base_cents = orig.base; }
  return out;
}

/* ---------- Asientos contables (nombres de cuenta por confirmar con el contador) ---------- */
export const CTA = {cxc: 'Cuentas por Cobrar Clientes', cxcTransito: 'Cuentas por Cobrar en tránsito (nota de entrega)', ventas: 'Ventas', ventasTransito: 'Ventas en tránsito (nota de entrega)',
  ivaDebito: 'Débito Fiscal IVA', descPP: 'Descuentos sobre Ventas Pronto Pago', ajusteMora: 'Ingresos por Ajuste de Precio / Mora', banco: 'Bancos'};
const L = (cuenta, debe = 0, haber = 0) => ({cuenta, debe, haber});
export const asientoEmisionFactura = t => ({concepto: 'Emisión de factura', lineas: [L(CTA.cxc, t.total), L(CTA.ventas, 0, t.base), L(CTA.ivaDebito, 0, t.iva)]});
export const asientoEmisionNE = t => ({concepto: 'Nota de entrega (cuenta por cobrar en tránsito, sin débito fiscal)', lineas: [L(CTA.cxcTransito, t.total), L(CTA.ventasTransito, 0, t.total)]});
export const asientoNC = n => ({concepto: 'Nota de crédito por pronto pago', lineas: [L(CTA.descPP, n.base), L(CTA.ivaDebito, n.iva), L(CTA.cxc, 0, n.total)]});
export const asientoND = n => ({concepto: 'Nota de débito por pago vencido', lineas: [L(CTA.cxc, n.total), L(CTA.ajusteMora, 0, n.base), L(CTA.ivaDebito, 0, n.iva)]});
export const asientoConversionNE = (ne, fin) => ({concepto: 'Liquidación de nota de entrega: se emite la factura definitiva', lineas: [L(CTA.cxcTransito, 0, ne.total), L(CTA.ventasTransito, ne.total, 0), L(CTA.cxc, fin.total), L(CTA.ventas, 0, fin.base), L(CTA.ivaDebito, 0, fin.iva)]});
export const asientoCobro = usd => ({concepto: 'Cobro por transferencia', lineas: [L(CTA.banco, usd), L(CTA.cxc, 0, usd)]});

/* ---------- Pagos: referencia, duplicados, reparto ---------- */
export const normBanco = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
export const normRef = s => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const esRefCorta = (ref, max = 6) => normRef(ref).length < max;

/* Clave única en la base: referencia completa = banco|ref; referencia corta (últimos dígitos) = banco|ref|monto en Bs */
export function dupKey(banco, ref, montoBsCents, max = 6) {
  const b = normBanco(banco), r = normRef(ref);
  if (!b || !r) return null;
  return esRefCorta(r, max) ? `${b}|${r}|${montoBsCents}` : `${b}|${r}`;
}

/* Compara un pago nuevo con uno existente. 'bloquea' | 'aviso' | null */
export function compararDuplicado(nuevo, ex, max = 6) {
  const bn = normBanco(nuevo.banco), be = normBanco(ex.banco);
  if (!bn || !be || bn !== be) return null;
  const rn = normRef(nuevo.referencia), re = normRef(ex.referencia);
  if (!rn || !re) return null;
  const mismoMonto = Number(nuevo.monto_bs_cents) === Number(ex.monto_bs_cents);
  if (rn === re) return rn.length >= max ? 'bloquea' : (mismoMonto ? 'bloquea' : 'aviso');
  const [corta, larga] = rn.length < re.length ? [rn, re] : [re, rn];
  if (corta.length >= 3 && corta.length < max && larga.endsWith(corta)) return mismoMonto ? 'bloquea' : 'aviso';
  return null;
}

/* Reparte un pago en dólares entre documentos, el más antiguo primero, sin pasar del saldo de cada uno */
export function repartirAntiguoPrimero(usdCents, docs) {
  let resto = usdCents; const out = [];
  for (const d of [...docs].sort((a, b) => String(a.fecha_emision).localeCompare(String(b.fecha_emision)) || a.id_documento - b.id_documento)) {
    if (resto <= 0) break;
    const a = Math.min(resto, d.pendiente_cents); if (a > 0) { out.push({id_documento: d.id_documento, usd_cents: a}); resto -= a; }
  }
  return {aplicaciones: out, sinAplicar: resto};
}
export const usdDeBs = (bsCents, tasa) => Math.round(bsCents / tasa);

/* ---------- Límite de crédito ---------- */
export function revisarLimite(cliente, deudaCents, totalPedidoCents) {
  if (cliente.limite_credito_cents == null) return {ok: true, sinLimite: true, disponible: null};
  const disponible = cliente.limite_credito_cents - deudaCents;
  return {ok: totalPedidoCents <= disponible, sinLimite: false, disponible};
}

/* ---------- Peso por bulto (producto terminado) ---------- */
/* kg por bulto: número mayor que cero (vacío = sin cargar). Devuelve {ok, valor} o {ok:false, msg}. Nunca inventa un valor. */
export function validarKgBulto(v) {
  if (v === '' || v == null) return {ok: false, msg: 'Escribe los kilos por bulto (un número mayor que cero).'};
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return {ok: false, msg: 'Los kilos por bulto deben ser un número mayor que cero.'};
  if (n > 100000) return {ok: false, msg: 'Los kilos por bulto no parecen correctos (máximo 100.000).'};
  return {ok: true, valor: Math.round(n * 1000) / 1000};
}
export function validarUnidadesBulto(v) {
  if (v === '' || v == null) return {ok: false, msg: 'Escribe las unidades por bulto (un número entero mayor que cero).'};
  const n = typeof v === 'number' ? v : (/^\d+$/.test(String(v).trim()) ? Number(String(v).trim()) : NaN);
  if (!Number.isInteger(n) || n <= 0) return {ok: false, msg: 'Las unidades por bulto deben ser un número entero mayor que cero.'};
  return {ok: true, valor: n};
}
export const tienePesoBulto = p => !!p && p.kg_por_bulto != null && Number(p.kg_por_bulto) > 0;
/* kilos = bultos × kg por bulto; null si el producto no tiene peso cargado (no se inventa) */
export const kilosDeBultos = (bultos, kgPorBulto) => (kgPorBulto != null && Number(kgPorBulto) > 0) ? Math.round(Number(bultos) * Number(kgPorBulto) * 1000) / 1000 : null;
export const tieneUnidadesBulto = p => !!p && p.unidades_por_bulto != null && Number(p.unidades_por_bulto) > 0;
export const bultoCompleto = p => tienePesoBulto(p) && tieneUnidadesBulto(p);
/* qué datos de bulto faltan: 'kg por bulto', 'unidades por bulto' o ambos; '' si está completo */
export const faltaBulto = p => [tienePesoBulto(p) ? '' : 'kg por bulto', tieneUnidadesBulto(p) ? '' : 'unidades por bulto'].filter(Boolean).join(' y ');
export const MSG_SIN_PESO = (nombre, falta = 'kg por bulto y unidades por bulto') => `«${nombre}» no se puede vender: le falta ${falta}. El Dueño o Administración debe completarlo en Productos e inventario.`;

/* ---------- Validación de un pedido ---------- */
export function validarPedido(lineas) {
  if (!Array.isArray(lineas) || !lineas.length) return 'El pedido no tiene productos.';
  const vistos = new Set();
  for (const l of lineas) {
    if (!entero(l.cantidad)) return 'Las cantidades deben ser números enteros mayores que cero.';
    if (!Number.isInteger(l.id_producto)) return 'Producto no válido.';
    if (vistos.has(l.id_producto)) return 'Hay un producto repetido en el pedido.';
    vistos.add(l.id_producto);
  }
  return null;
}

/* ---------- Nombres de cliente: clave de comparación y sugerencia de grupos (nunca se fusiona solo) ---------- */
export const normNombre = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[.,;:()\-_/\\'"]/g, ' ').replace(/\s+/g, ' ').trim();
const RUIDO = new Set(['MARKET', 'C', 'A', 'CA', 'SA', 'S', 'DE', 'LA', 'EL', 'LOS', 'LAS']);
export function claveBase(s) {
  const t = normNombre(s).split(' ').filter(w => w && !/^\d+$/.test(w) && !RUIDO.has(w));
  return t.join(' ');
}
/* Agrupa nombres que comparten la misma base o cuando una base es prefijo (por palabras) de la otra. Devuelve solo grupos de 2 o más. */
export function sugerirGrupos(nombres) {
  const lista = [...new Set(nombres.filter(Boolean))].map(n => ({n, b: claveBase(n)})).filter(x => x.b);
  const padre = lista.map((_, i) => i), raiz = i => padre[i] === i ? i : (padre[i] = raiz(padre[i]));
  const prefijo = (a, b) => a === b || b.startsWith(a + ' ') || a.startsWith(b + ' ');
  for (let i = 0; i < lista.length; i++) for (let j = i + 1; j < lista.length; j++) if (prefijo(lista[i].b, lista[j].b)) padre[raiz(j)] = raiz(i);
  const g = new Map(); lista.forEach((x, i) => { const r = raiz(i); (g.get(r) || g.set(r, []).get(r)).push(x.n); });
  return [...g.values()].filter(a => a.length > 1).map(a => a.sort((x, y) => x.length - y.length || x.localeCompare(y)));
}

/* ---------- CSV para Excel en español: BOM UTF-8, separador «;», coma decimal ---------- */
export const csvCelda = v => {
  if (typeof v === 'number') return String(Number.isInteger(v) ? v : Math.round(v * 100) / 100).replace('.', ',');
  const s = String(v ?? ''); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
export const aCSV = (cabeceras, filas) => '﻿' + [cabeceras, ...filas].map(r => r.map(csvCelda).join(';')).join('\r\n');

/* Imagen de producto: tope de 180 KB ya decodificada y debe ser un JPEG válido (el navegador la comprime antes de enviarla). */
export const IMG_PRODUCTO_MAX = 180 * 1024;
export function validarImagenProducto(b64) {
  if (typeof b64 !== 'string' || b64.length < 100) return {ok: false, status: 400, msg: 'No llegó ninguna imagen.'};
  if (b64.length > IMG_PRODUCTO_MAX * 1.4) return {ok: false, status: 413, msg: 'La imagen pesa demasiado: el máximo es 180 KB.'};
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64) || b64.length % 4) return {ok: false, status: 400, msg: 'La imagen no es válida.'};
  const bytes = Math.floor(b64.length * 3 / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
  if (bytes > IMG_PRODUCTO_MAX) return {ok: false, status: 413, msg: 'La imagen pesa demasiado: el máximo es 180 KB.'};
  const ini = atob(b64.slice(0, 8)), fin = atob(b64.slice(-8));
  if (ini.charCodeAt(0) !== 0xFF || ini.charCodeAt(1) !== 0xD8 || ini.charCodeAt(2) !== 0xFF || fin.charCodeAt(fin.length - 2) !== 0xFF || fin.charCodeAt(fin.length - 1) !== 0xD9) return {ok: false, status: 400, msg: 'La imagen debe ser una foto JPG válida.'};
  return {ok: true, bytes};
}
export const esImagenInterna = u => typeof u === 'string' && /^\/api\/v\/productos\/\d+\/imagen/.test(u);
