/* Casos de uso del módulo de Ventas y Liquidación Dual. Usa el dominio (reglas) y el repo (datos). No conoce HTTP. */
import * as D from './dominio.js';
import * as R from './repo.js';
import {puede, puedePesoBulto, ROL_TXT} from './permisos.js';
import * as T from '../tasa/servicio.js';
import * as PR from '../precios/repo.js';
import * as PD from '../precios/dominio.js';
import * as BS from '../bancos/servicio.js';
import * as PRD from '../produccion/repo.js';

export const err = (status, message, extra = {}) => Object.assign(new Error(message), {status, message, extra});
const pad = (n, w = 6) => String(n).padStart(w, '0');
const txt = (v, max = 200) => (v == null ? '' : String(v)).trim().slice(0, max);
const numOrNull = v => (v === '' || v == null) ? null : (Number.isFinite(+v) ? +v : NaN);
const pctOk = v => v == null || (Number.isFinite(v) && v >= 0 && v <= 100);
const centsOrNull = v => { const n = numOrNull(v); return n == null ? null : (Number.isNaN(n) || n < 0 ? NaN : D.aCents(n)); };
const exigir = (ctx, accion, msg) => { if (!puede(ctx.rol, accion, ctx.matriz)) throw err(403, msg || 'Tu rol no puede hacer esto.'); };
export const audit = (ctx, ent, ref, nom, accion, detalle) => R.stAuditoria(ctx.db, {rol: ctx.rol, rolTxt: ROL_TXT[ctx.rol] || ctx.rol, ent, ref, nom, accion, detalle});
export const enLote = async (db, stmts) => {
  try { return await R.lote(db, stmts); }
  catch (e) {
    const m = String((e && e.message) || e);
    if (/SIN_STOCK_DISPONIBLE/.test(m)) throw err(409, 'Sin inventario: alguien más acaba de apartar esos bultos. Revisa lo disponible e inténtalo de nuevo.', {codigo: 'SIN_STOCK'});
    if (/CHECK constraint/i.test(m) && /stock/i.test(m)) throw err(409, 'No hay existencias suficientes para algún producto del pedido.', {codigo: 'SIN_STOCK'});
    if (/UNIQUE/i.test(m) && /dup_key|pagos_dup/i.test(m)) throw err(409, 'Esa referencia ya fue registrada por otra persona hace un instante.', {codigo: 'DUPLICADO'});
    if (/UNIQUE/i.test(m) && /rif_id/i.test(m)) throw err(409, 'Ya existe un cliente con ese RIF.', {codigo: 'RIF_REPETIDO'});
    if (/UNIQUE/i.test(m) && /numero_externo|doc_numext/i.test(m)) throw err(409, 'Ese número de nota de entrega ya existe.', {codigo: 'NE_REPETIDA'});
    throw e;
  }
};
const dol = c => c == null ? null : c / 100;

/* ---------- Arranque: todo lo que la pantalla necesita para empezar ---------- */
export async function arranque(db) {
  const estadosLista = await cargarMapaListas(db);
  const [productos, vendedores, listas, cfg, ej] = await Promise.all([R.listarProductos(db), R.listarVendedores(db), R.listarListas(db), R.leerConfig(db), R.contarEjemplo(db)]);
  const {pin_hash, pin_sal, ...cfgPublica} = cfg;
  /* Inventario único: stock_entero = bultos en bodega; disponible = lo que se puede vender (sin lo apartado por pedidos) */
  for (const p of productos) p.disponible = Math.max(0, (p.stock_entero || 0) - (p.stock_apartado || 0));
  return {hoy: D.hoyVE(), estados_lista: estadosLista, productos, vendedores, listas, config: cfgPublica, pinConfigurado: !!pin_hash, ejemplo: ej,
    secuencias: {factura: await R.leerSecuencia(db, 'factura_fiscal'), nc: await R.leerSecuencia(db, 'nc_fiscal'), nd: await R.leerSecuencia(db, 'nd_fiscal')}};
}

/* ---------- Catálogo ---------- */
export async function guardarProducto(ctx, id, b) {
  exigir(ctx, 'catalogo', 'Solo el Dueño cambia el catálogo (precios, alícuota, SKU).');
  const c = {codigo_sku: txt(b.codigo_sku, 30), nombre: txt(b.nombre, 120), gramaje: txt(b.gramaje, 25), categoria: b.categoria === 'SALSAS' ? 'SALSAS' : 'PAPAS', imagen_blanca_url: txt(b.imagen_blanca_url, 255) || null,
    alicuota_iva: numOrNull(b.alicuota_iva) ?? D.IVA_DEFECTO, precio_ref_cents: null};   // el precio ya no se carga aquí: rige la lista de precios (Administración → Precios)
  if (!c.codigo_sku || !c.nombre) throw err(400, 'El SKU y el nombre son obligatorios.');
  if (!pctOk(c.alicuota_iva)) throw err(400, 'La alícuota de IVA no es válida.');
  if (id) {
    const prev = await R.getProducto(ctx.db, id); if (!prev) throw err(404, 'Producto no encontrado.');
    c.precio_ref_cents = prev.precio_ref_cents ?? null;
    await enLote(ctx.db, [R.stActualizarProducto(ctx.db, id, c), PR.stCerrarPendiente(ctx.db, PD.claveProducto(id), ROL_TXT[ctx.rol] || ctx.rol, 'El Dueño fijó el precio directamente.'), ...audit(ctx, 'producto', c.codigo_sku, c.nombre, 'modificó', {antes: {precio: dol(prev.precio_ref_cents), iva: prev.alicuota_iva}, despues: {precio: dol(c.precio_ref_cents), iva: c.alicuota_iva}})]);
    return R.getProducto(ctx.db, id);
  }
  await enLote(ctx.db, [R.stInsertarProducto(ctx.db, {...c, orden: 99}), ...audit(ctx, 'producto', c.codigo_sku, c.nombre, 'agregó', {})]);
  return {ok: true};
}
/* Peso por bulto: solo Dueño y Administración (comprobado aquí con el rol, no solo en pantalla). Vacío = sin cargar; no se inventa. */
export async function guardarPesoBulto(ctx, id, b) {
  if (!puedePesoBulto(ctx.rol)) throw err(403, 'Solo el Dueño y Administración cargan o corrigen los kg y las unidades por bulto.');
  const kg = D.validarKgBulto(b.kg_por_bulto); if (!kg.ok) throw err(400, kg.msg);
  const un = D.validarUnidadesBulto(b.unidades_por_bulto); if (!un.ok) throw err(400, un.msg);
  const p = await R.getProducto(ctx.db, id); if (!p) throw err(404, 'Producto no encontrado.');
  await enLote(ctx.db, [R.stPesoBulto(ctx.db, id, kg.valor, un.valor), ...audit(ctx, 'producto', p.codigo_sku, p.nombre, 'cargó peso por bulto', {antes: {kg_por_bulto: p.kg_por_bulto ?? null, unidades_por_bulto: p.unidades_por_bulto ?? null}, despues: {kg_por_bulto: kg.valor, unidades_por_bulto: un.valor}})]);
  return R.getProducto(ctx.db, id);
}
/* Entrada manual de inventario: solo el Dueño y con motivo. La producción entra sola al cerrar el turno. */
export async function entradaStock(ctx, idProducto, cantidad, nota) {
  if (ctx.rol !== 'dueno') throw err(403, 'Solo el Dueño suma bultos a mano. La producción entra sola al cerrar el turno.');
  if (!D.entero(cantidad)) throw err(400, 'La cantidad debe ser un número entero mayor que cero.');
  if (txt(nota, 100).length < 3) throw err(400, 'Escribe el motivo de la entrada.');
  const p = await R.getProducto(ctx.db, idProducto); if (!p) throw err(404, 'Producto no encontrado.');
  await enLote(ctx.db, [R.stStock(ctx.db, idProducto, cantidad), R.stMovimiento(ctx.db, {id_producto: idProducto, cantidad, tipo: 'ENTRADA', fecha: D.hoyVE()}), ...audit(ctx, 'inventario', p.codigo_sku, p.nombre, 'entrada de inventario', {cantidad, nota: txt(nota, 100)})]);
  return R.getProducto(ctx.db, idProducto);
}
export async function guardarVendedor(ctx, id, b) {
  exigir(ctx, 'condiciones', 'Solo el Dueño cambia vendedores y comisiones.');
  const nombre = txt(b.nombre, 80), pct = numOrNull(b.comision_pct);
  if (!nombre) throw err(400, 'El nombre es obligatorio.'); if (!pctOk(pct) || Number.isNaN(pct)) throw err(400, 'El porcentaje de comisión debe estar entre 0 y 100.');
  const st = id ? R.stActualizarVendedor(ctx.db, id, {nombre, comision_pct: pct}) : R.stInsertarVendedor(ctx.db, {nombre, comision_pct: pct});
  await enLote(ctx.db, [st, ...audit(ctx, 'vendedor', id || nombre, nombre, id ? 'modificó' : 'agregó', {comision_pct: pct})]);
  return R.listarVendedores(ctx.db);
}

/* ---------- Clientes ---------- */
function leerCliente(b, prev, permitidoCondiciones) {
  const c = {
    rif_id: txt(b.rif_id, 20).toUpperCase() || null, razon_social: txt(b.razon_social, 150), modalidad_despacho_pref: b.modalidad_despacho_pref === 'FACTURA_DIRECTA' ? 'FACTURA_DIRECTA' : 'NOTA_ENTREGA',
    id_vendedor: b.id_vendedor ? +b.id_vendedor : null, zona: D.estadoReal(b.zona), telefono: txt(b.telefono, 30) || null,
    direccion_entrega: b.direccion_entrega === undefined ? (prev ? prev.direccion_entrega : null) : (txt(b.direccion_entrega, 200) || null),
    lista_regional: null
  };
  if (!c.zona) throw err(400, D.MSG_ELEGIR_ZONA);
  c.lista_regional = D.listaRegional(c.zona);   // solo referencia: la lista que rige sale siempre del estado
  if (!c.razon_social) throw err(400, 'La razón social es obligatoria.');
  if (String(b.razon_social).trim().length > 150) throw err(400, 'El nombre del cliente es muy largo: usa 150 letras o menos.');
  c.razon_norm = D.normNombre(c.razon_social);
  const cond = {id_lista_base: b.id_lista_base ? +b.id_lista_base : null, descuento_fijo_pct: numOrNull(b.descuento_fijo_pct), dias_pronto_pago: numOrNull(b.dias_pronto_pago), dias_credito_normal: numOrNull(b.dias_credito_normal), limite_credito_cents: centsOrNull(b.limite_credito_usd)};
  if (permitidoCondiciones) {
    if (!pctOk(cond.descuento_fijo_pct) || Number.isNaN(cond.descuento_fijo_pct)) throw err(400, 'El descuento debe estar entre 0 y 100 %.');
    for (const k of ['dias_pronto_pago', 'dias_credito_normal']) if (cond[k] != null && (!Number.isInteger(cond[k]) || cond[k] < 0)) throw err(400, 'Los días deben ser enteros de cero en adelante.');
    if (cond.dias_pronto_pago != null && cond.dias_credito_normal != null && cond.dias_pronto_pago > cond.dias_credito_normal) throw err(400, 'Los días de pronto pago no pueden superar los días de crédito.');
    if (Number.isNaN(cond.limite_credito_cents)) throw err(400, 'El límite de crédito no es válido.');
    Object.assign(c, cond);
  } else Object.assign(c, prev ? {id_lista_base: prev.id_lista_base, descuento_fijo_pct: prev.descuento_fijo_pct, dias_pronto_pago: prev.dias_pronto_pago, dias_credito_normal: prev.dias_credito_normal, limite_credito_cents: prev.limite_credito_cents} : {id_lista_base: null, descuento_fijo_pct: null, dias_pronto_pago: null, dias_credito_normal: null, limite_credito_cents: null});
  return c;
}
export async function cargarMapaListas(db) { const m = await R.leerEstadosLista(db); D.setMapaListas(m); return m; }
export async function guardarCliente(ctx, id, b) {
  await cargarMapaListas(ctx.db);
  exigir(ctx, 'editarCliente', 'Tu rol no registra clientes.');
  const prev = id ? await R.getCliente(ctx.db, id) : null; if (id && !prev) throw err(404, 'Cliente no encontrado.');
  const c = leerCliente(b, prev, puede(ctx.rol, 'condiciones', ctx.matriz));
  if (!id) { const dup = await R.clientePorNorm(ctx.db, c.razon_norm); if (dup) throw err(409, 'Ya existe un cliente con ese nombre: ' + dup.razon_social, {codigo: 'CLIENTE_REPETIDO', existente: dup.id_cliente}); }
  if (c.rif_id) { const r = await R.clientePorRif(ctx.db, c.rif_id); if (r && r.id_cliente !== id) throw err(409, 'Ya existe un cliente con ese RIF: ' + r.razon_social, {codigo: 'RIF_REPETIDO'}); }
  if (id) {
    const cambios = {}; for (const k of Object.keys(c)) if (k !== 'razon_norm' && String(prev[k] ?? '') !== String(c[k] ?? '')) cambios[k] = [prev[k] ?? '', c[k] ?? ''];
    await enLote(ctx.db, [R.stActualizarCliente(ctx.db, id, c), ...(Object.keys(cambios).length ? audit(ctx, 'cliente', id, c.razon_social, 'modificó', cambios) : [])]);
    const nuevo = await R.getCliente(ctx.db, id), antes = D.listaDeCliente(prev), ahora = D.listaDeCliente(nuevo);
    return antes !== ahora ? {...nuevo, aviso_lista: `Ahora usa la lista ${ahora} (zona ${nuevo.zona}). Sus ventas nuevas usan esa lista; las ventas ya emitidas no cambian.`} : nuevo;
  }
  await enLote(ctx.db, [R.stInsertarCliente(ctx.db, c), ...audit(ctx, 'cliente', c.razon_social, c.razon_social, 'agregó', {})]);
  const nuevo = await R.clientePorNorm(ctx.db, c.razon_norm); return R.getCliente(ctx.db, nuevo.id_cliente);
}
/* Los precios especiales por cliente (reglas) se cambian en src/precios/servicio.js: el Dueño rige de una vez, Administración deja un cambio pendiente. */
/* Precio de un producto para un cliente según su lista regional (A o B). Si el producto tiene lista y el cliente no la tiene, no se vende. */
export async function contextoPrecios(db, cli) { await cargarMapaListas(db); const lista = D.listaDeCliente(cli); return {lista, ...await R.contextoListas(db, lista)}; }
export function precioDe(p, regla, cx) {
  const tiene = cx.conLista.has(p.id_producto);
  if (tiene && !cx.lista && !(regla && regla.precio_base_credito_cents != null)) return {sinLista: true};
  return {pr: D.preciosProducto(p, regla, tiene ? cx.lp.get(p.id_producto) : null)};
}
/* Precios efectivos de todos los productos para un cliente + su situación de crédito */
export async function preciosCliente(db, idCliente) {
  const cli = await R.getCliente(db, idCliente); if (!cli) throw err(404, 'Cliente no encontrado.');
  const [prods, reglas, cx] = await Promise.all([R.listarProductos(db), R.reglasDeCliente(db, idCliente), contextoPrecios(db, cli)]);
  const rm = new Map(reglas.map(r => [r.id_producto, r]));
  const compC = (await PRD.comprometidoCliente(db, idCliente)).reduce((a, f) => a + D.totalesLineas([{cantidad: f.pend, precio_base_cents: f.precio_base_cents, precio_pp_cents: f.precio_base_cents, precio_mora_cents: f.precio_base_cents, alicuota: f.alicuota}], 0, f.descuento_pct).total, 0);
  return {comprometido: dol(compC), cliente: cli, lista: cx.lista, sin_lista: !cx.lista && prods.some(p => cx.conLista.has(p.id_producto)), mensaje_sin_lista: !cx.lista ? D.mensajeSinLista(cli) : null, reglas, precios: prods.map(p => { const x = precioDe(p, rm.get(p.id_producto), cx).pr || {}; return {id_producto: p.id_producto, regla: rm.has(p.id_producto), base: dol(x.base ?? null), pp: dol(x.pp ?? null), mora: dol(x.mora ?? null)}; })};
}

/* ---------- Fase 1: vender ---------- */
export async function crearVenta(ctx, b, o = {}) {
  const {db} = ctx;
  if (!['NOTA_ENTREGA', 'FACTURA'].includes(b.tipo)) throw err(400, 'Elige generar nota de entrega o factura.');
  const ev = D.validarPedido(b.lineas); if (ev) throw err(400, ev);
  const cli = await R.getCliente(db, +b.id_cliente); if (!cli) throw err(404, 'Elige un cliente.');
  const prods = await R.productosPorIds(db, b.lineas.map(l => l.id_producto)), pm = new Map(prods.map(p => [p.id_producto, p]));
  const rm = new Map((await R.reglasDeCliente(db, cli.id_cliente)).map(r => [r.id_producto, r])), cx = await contextoPrecios(db, cli);
  const lineas = b.lineas.map(l => {
    const p = pm.get(l.id_producto); if (!p || !p.activo) throw err(400, 'Producto no disponible.');
    const pd = precioDe(p, rm.get(p.id_producto), cx); if (pd.sinLista) throw err(409, D.mensajeSinLista(cli), {codigo: 'SIN_LISTA'}); const pr = pd.pr; if (!pr) throw err(400, `«${p.nombre} ${p.gramaje || ''}» no tiene precio cargado.`);
    if (!o.ejemplo && !D.bultoCompleto(p)) throw err(409, D.MSG_SIN_PESO(`${p.nombre} ${p.gramaje || ''}`.trim(), D.faltaBulto(p)), {codigo: 'SIN_PESO_BULTO', falta: D.faltaBulto(p), id_producto: p.id_producto});
    if (l.cantidad > p.stock_entero - (p.stock_apartado || 0)) throw err(409, `Sin inventario de «${p.nombre} ${p.gramaje || ''}»: hay ${Math.max(0, p.stock_entero - (p.stock_apartado || 0))} bultos disponibles.`, {codigo: 'SIN_STOCK'});
    return {id_producto: p.id_producto, sku: p.codigo_sku, nombre: `${p.nombre} ${p.gramaje || ''}`.trim(), cantidad: l.cantidad, precio_base_cents: pr.base, precio_pp_cents: pr.pp, precio_mora_cents: pr.mora, alicuota: p.alicuota_iva};
  });
  const tot = D.totalesLineas(lineas, 0, cli.descuento_fijo_pct);
  const lim = D.revisarLimite(cli, cli.deuda_cents, tot.total);
  if (!lim.ok) throw err(409, `El pedido (US$ ${(tot.total / 100).toFixed(2)}) supera el crédito disponible (US$ ${(lim.disponible / 100).toFixed(2)}).`, {codigo: 'LIMITE_CREDITO', disponible: dol(lim.disponible), total: dol(tot.total)});
  const fecha = o.fecha || D.hoyVE(), cfg = await R.leerConfig(db), ej = o.ejemplo ? 1 : (cli.ejemplo ? 1 : 0);
  const envio = D.ubicacionEnvio(cli); // se congela en el documento: no cambia si luego se edita la ficha
  const id = await R.siguiente(db, 'documento'), esNE = b.tipo === 'NOTA_ENTREGA';
  const ctl = (esNE ? 'NE-' : 'FA-') + pad(await R.siguiente(db, esNE ? 'ne' : 'factura_ctl'));
  const fiscal = esNE ? null : (cfg.fiscal_prefijo_factura || '') + pad(await R.siguiente(db, 'factura_fiscal'), 8);
  const doc = {id_documento: id, nro_control_interno: ctl, nro_factura_fiscal: fiscal, tipo_origen: b.tipo, estado: 'PENDIENTE', fecha_emision: fecha, fecha_vencimiento: cli.dias_credito_normal != null ? D.sumarDias(fecha, cli.dias_credito_normal) : null,
    id_cliente: cli.id_cliente, id_vendedor: cli.id_vendedor, subtotal_base_cents: tot.subtotal, descuento_pct: cli.descuento_fijo_pct, descuento_cents: tot.descuento, iva_cents: tot.iva, total_cents: tot.total,
    metodo_pago: txt(b.metodo_pago, 40) || null, observaciones: txt(b.observaciones, 300) || null, envio_zona: envio.zona, envio_direccion: envio.direccion, lista_precios: cx.lista, afecta_inventario: 1, origen: 'manual', creado_rol: ROL_TXT[ctx.rol] || ctx.rol, ejemplo: ej};
  const asi = esNE ? D.asientoEmisionNE({total: tot.total}) : D.asientoEmisionFactura(tot);
  const st = [R.stInsertarDocumento(db, doc), ...lineas.map(l => R.stInsertarLinea(db, id, l, ej)),
    ...lineas.flatMap(l => [R.stStock(db, l.id_producto, -l.cantidad), R.stMovimiento(db, {id_producto: l.id_producto, cantidad: -l.cantidad, tipo: esNE ? 'SALIDA_NOTA_ENTREGA' : 'SALIDA_FACTURA', id_documento: id, fecha, ejemplo: ej})]),
    R.stAsiento(db, {fecha, id_documento: id, concepto: asi.concepto, lineas: asi.lineas, ejemplo: ej}), R.stSaldoCliente(db, cli.id_cliente),
    ...(o.sinAuditoria ? [] : audit(ctx, 'venta', ctl, cli.razon_social, esNE ? 'generó nota de entrega' : 'generó factura', {total_usd: dol(tot.total), lineas: lineas.length}))];
  await enLote(db, st);
  return {id_documento: id, nro_control_interno: ctl, nro_factura_fiscal: fiscal, tipo_origen: b.tipo, fecha_emision: fecha, envio: envio.texto, aviso_envio: envio.completa ? null : D.MSG_FALTA_ENVIO + ': completa la ficha del cliente (zona y dirección de entrega) para que la entrega salga bien.', totales: {subtotal: dol(tot.subtotal), descuento: dol(tot.descuento), iva: dol(tot.iva), total: dol(tot.total)}};
}
export async function vender(ctx, b) {
  exigir(ctx, 'vender', 'Tu rol no puede generar notas de entrega ni facturas.');
  const pg = b.pago && typeof b.pago === 'object' ? b.pago : null;
  { /* el banco es obligatorio (crédito y contado) cuando la empresa ya cargó bancos */
    const activos = (await BS.listaParaCliente(ctx.db)).bancos;
    if (activos.length) {
      const bp = pg && pg.id_banco != null && pg.id_banco !== '' ? await BS.elegido(ctx.db, pg.id_banco) : null;
      if (bp && !txt(b.metodo_pago, 40)) b = {...b, metodo_pago: bp.nombre};
      if (!txt(b.metodo_pago, 40)) throw err(400, 'Elige el banco en «Método de pago» antes de generar el documento.', {codigo: 'FALTA_BANCO'});
    }
  }
  if (pg) {
    exigir(ctx, 'cobrar', 'Tu rol no registra pagos: genera la venta a crédito.');
    const bl = await BS.elegido(ctx.db, pg.id_banco); if (bl) pg.banco = bl.nombre;
    if (!D.normBanco(pg.banco) || !D.normRef(pg.referencia)) throw err(400, 'Para cobrar ahora escribe el banco y el número de referencia.');
    pg.tasaBCV = (await T.tasaPara(ctx.db, D.hoyVE())).valor; // la tasa la pone el servidor (BCV); lo que mande la pantalla se ignora
    const max = +(await R.leerConfig(ctx.db)).ref_corta_max || 6, bco = D.normBanco(pg.banco), rf = D.normRef(pg.referencia);
    for (const ex of await R.posiblesDuplicados(ctx.db, bco, rf)) if (D.compararDuplicado({banco: bco, referencia: rf, monto_bs_cents: 0}, ex, max) === 'bloquea') throw err(409, 'Esa referencia ya está registrada para ese banco. No se generó la venta: revisa la referencia.', {codigo: 'DUPLICADO', existente: formatoPago(ex)});
  }
  /* La venta ahora es un PEDIDO: aparta los bultos y espera su zona. La nota o factura se emite al despachar. */
  return crearPedido(ctx, b, {pago: pg ? {id_banco: pg.id_banco ?? null, banco: pg.banco, referencia: pg.referencia} : null});
}

/* Cobro de una venta «Pagó ahora»: se hace al emitir el primer documento del pedido (pronto pago), con el mismo motor de liquidación. */
export async function cobrarContado(ctx, idCliente, idDocumento, nroDoc, pg) {
  try {
    const hoy = D.hoyVE(), tasa = (await T.tasaPara(ctx.db, hoy)).valor, pre = await previsualizar(ctx.db, {id_cliente: idCliente, fecha: hoy, docs: [idDocumento]}), d = pre.documentos[0];
    if (!d || d.error || !(d.restante_cents > 0)) throw err(400, (d && d.error) || 'No hay saldo por cobrar.');
    const bs = Math.ceil(d.restante_cents / 100 * tasa * 100) / 100;
    const c = await cobrar(ctx, {id_cliente: idCliente, fecha_pago: hoy, monto_bs: bs, tasa, banco: pg.banco, id_banco: pg.id_banco, referencia: pg.referencia, observacion: 'Cobrado al despachar ' + nroDoc, aplicaciones: [{id_documento: idDocumento, usd: d.restante}]});
    return {ok: true, recibo: c.recibo, usd: c.usd, monto_bs: bs};
  } catch (e) { return {ok: false, error: e.message || 'No se pudo registrar el pago.'}; }
}

/* Pedido de venta: congela precios, kilos y zona; aparta los bultos (inventario único). Sin inventario disponible no se vende. */
export async function crearPedido(ctx, b, o = {}) {
  const {db} = ctx;
  if (!['NOTA_ENTREGA', 'FACTURA'].includes(b.tipo)) throw err(400, 'Elige generar nota de entrega o factura.');
  const ev = D.validarPedido(b.lineas); if (ev) throw err(400, ev);
  const cli = await R.getCliente(db, +b.id_cliente); if (!cli) throw err(404, 'Elige un cliente.');
  const prods = await R.productosPorIds(db, b.lineas.map(l => l.id_producto)), pm = new Map(prods.map(p => [p.id_producto, p]));
  const rm = new Map((await R.reglasDeCliente(db, cli.id_cliente)).map(r => [r.id_producto, r])), cx = await contextoPrecios(db, cli);
  const lineas = b.lineas.map(l => {
    const p = pm.get(l.id_producto); if (!p || !p.activo) throw err(400, 'Producto no disponible.');
    const nom = `${p.nombre} ${p.gramaje || ''}`.trim();
    const pd = precioDe(p, rm.get(p.id_producto), cx); if (pd.sinLista) throw err(409, D.mensajeSinLista(cli), {codigo: 'SIN_LISTA'}); const pr = pd.pr; if (!pr) throw err(400, `«${nom}» no tiene precio cargado.`);
    if (!D.bultoCompleto(p)) throw err(409, D.MSG_SIN_PESO(nom, D.faltaBulto(p)), {codigo: 'SIN_PESO_BULTO', falta: D.faltaBulto(p), id_producto: p.id_producto});
    const disp = Math.max(0, p.stock_entero - (p.stock_apartado || 0));
    if (l.cantidad > disp) throw err(409, `Sin inventario de «${nom}»: hay ${disp} bultos disponibles.`, {codigo: 'SIN_STOCK', id_producto: p.id_producto, disponible: disp});
    return {id_producto: p.id_producto, sku: p.codigo_sku, nombre: nom, cantidad: l.cantidad, kg_por_bulto: p.kg_por_bulto, precio_base_cents: pr.base, precio_pp_cents: pr.pp, precio_mora_cents: pr.mora, alicuota: p.alicuota_iva};
  });
  const tot = D.totalesLineas(lineas, 0, cli.descuento_fijo_pct);
  const comprometido = await PRD.comprometidoCliente(db, cli.id_cliente);   // lo ya pedido y sin despachar también cuenta contra el crédito
  const compC = comprometido.reduce((a, f) => a + D.totalesLineas([{cantidad: f.pend, precio_base_cents: f.precio_base_cents, precio_pp_cents: f.precio_base_cents, precio_mora_cents: f.precio_base_cents, alicuota: f.alicuota}], 0, f.descuento_pct).total, 0);
  const lim = D.revisarLimite(cli, (cli.deuda_cents || 0) + compC, tot.total);
  if (!lim.ok) throw err(409, `El pedido (US$ ${(tot.total / 100).toFixed(2)}) supera el crédito disponible (US$ ${(Math.max(0, lim.disponible) / 100).toFixed(2)}).`, {codigo: 'LIMITE_CREDITO', disponible: dol(lim.disponible), total: dol(tot.total)});
  const fecha = o.fecha || D.hoyVE(), ej = cli.ejemplo ? 1 : 0, zona = D.zonaDeEstado(cli.zona) || 'Sin zona';
  const id = await R.siguiente(db, 'pedido_venta'), nro = 'PED-' + pad(id);
  const kilos = Math.round(lineas.reduce((a, l) => a + l.cantidad * l.kg_por_bulto, 0) * 1000) / 1000;
  const st = [PRD.stInsertarPedido(db, {id_pedido: id, nro, id_cliente: cli.id_cliente, estado_ve: D.estadoReal(cli.zona), zona, tipo: b.tipo, fecha, creado_rol: ROL_TXT[ctx.rol] || ctx.rol, creado_rol_cod: ctx.rol, id_vendedor: cli.id_vendedor, descuento_pct: cli.descuento_fijo_pct, metodo_pago: txt(b.metodo_pago, 40) || null, observaciones: txt(b.observaciones, 300) || null, lista_precios: cx.lista, pago_json: o.pago ? JSON.stringify(o.pago) : null, ejemplo: ej}),
    ...lineas.map(l => PRD.stInsertarPedidoLinea(db, id, l)), ...lineas.map(l => PRD.stApartado(db, l.id_producto, l.cantidad)),
    ...audit(ctx, 'venta', nro, cli.razon_social, 'registró pedido', {total_usd: dol(tot.total), bultos: lineas.reduce((a, l) => a + l.cantidad, 0), kilos, zona})];
  await enLote(db, st);
  const envio = D.ubicacionEnvio(cli);
  return {id_documento: null, id_pedido: id, nro_pedido: nro, nro_control_interno: nro, tipo_origen: b.tipo, fecha_emision: fecha, pedido: true, zona, kilos, condicion: o.pago ? 'CONTADO' : 'CREDITO',
    aviso_envio: envio.completa ? null : D.MSG_FALTA_ENVIO + ': completa la ficha del cliente (zona y dirección de entrega) para que la entrega salga bien.',
    totales: {subtotal: dol(tot.subtotal), descuento: dol(tot.descuento), iva: dol(tot.iva), total: dol(tot.total)}};
}

/* Emite la nota o factura de lo que SALE en un despacho. Devuelve las sentencias (van en el mismo lote que la salida) y el resumen.
   Precios, kilos y descuento son los congelados en el pedido; baja el apartado y las existencias a la vez. */
export async function documentoDeDespacho(ctx, pedido, lineas, idSalida, fecha) {
  const {db} = ctx, cli = await R.getCliente(db, pedido.id_cliente), esNE = pedido.tipo === 'NOTA_ENTREGA', ej = pedido.ejemplo ? 1 : 0;
  const tot = D.totalesLineas(lineas, 0, pedido.descuento_pct), cfg = await R.leerConfig(db), envio = D.ubicacionEnvio(cli);
  const id = await R.siguiente(db, 'documento'), ctl = (esNE ? 'NE-' : 'FA-') + pad(await R.siguiente(db, esNE ? 'ne' : 'factura_ctl'));
  const fiscal = esNE ? null : (cfg.fiscal_prefijo_factura || '') + pad(await R.siguiente(db, 'factura_fiscal'), 8);
  const doc = {id_documento: id, nro_control_interno: ctl, nro_factura_fiscal: fiscal, tipo_origen: pedido.tipo, estado: 'PENDIENTE', fecha_emision: fecha, fecha_vencimiento: cli.dias_credito_normal != null ? D.sumarDias(fecha, cli.dias_credito_normal) : null,
    id_cliente: cli.id_cliente, id_vendedor: pedido.id_vendedor, subtotal_base_cents: tot.subtotal, descuento_pct: pedido.descuento_pct, descuento_cents: tot.descuento, iva_cents: tot.iva, total_cents: tot.total,
    metodo_pago: pedido.metodo_pago, observaciones: pedido.observaciones, envio_zona: envio.zona, envio_direccion: envio.direccion, lista_precios: pedido.lista_precios, afecta_inventario: 1, origen: 'manual', creado_rol: pedido.creado_rol, ejemplo: ej};
  const asi = esNE ? D.asientoEmisionNE({total: tot.total}) : D.asientoEmisionFactura(tot);
  const st = [R.stInsertarDocumento(db, doc), R.stDocPedido(db, id, pedido.id_pedido, idSalida), ...lineas.map(l => R.stInsertarLinea(db, id, l, ej)),
    ...lineas.flatMap(l => [PRD.stApartado(db, l.id_producto, -l.cantidad), R.stStock(db, l.id_producto, -l.cantidad), R.stMovimiento(db, {id_producto: l.id_producto, cantidad: -l.cantidad, tipo: esNE ? 'SALIDA_NOTA_ENTREGA' : 'SALIDA_FACTURA', id_documento: id, fecha, ejemplo: ej})]),
    R.stAsiento(db, {fecha, id_documento: id, concepto: asi.concepto, lineas: asi.lineas, ejemplo: ej}), R.stSaldoCliente(db, cli.id_cliente)];
  return {id_documento: id, nro: ctl, tipo: pedido.tipo, total: dol(tot.total), st};
}

export async function detalleDocumento(db, id) {
  const d = await R.getDocumento(db, id); if (!d) throw err(404, 'Documento no encontrado.');
  const [lineas, notas, asientos, movs, hija] = await Promise.all([R.lineasDe(db, id), R.notasDe(db, id), R.listarAsientos(db, {limite: 500}).then(a => a.filter(x => x.id_documento === id)), R.movimientosDe(db, id), R.facturaDeNE(db, id)]);
  const cfg = await R.leerConfig(db); const {pin_hash, pin_sal, ...pub} = cfg;
  /* Datos para imprimir: kg totales, cuenta del banco elegido y la tasa BCV del día de emisión */
  const prs = new Map((await R.productosPorIds(db, [...new Set(lineas.map(l => l.id_producto))])).map(p => [p.id_producto, p]));
  const lineasKg = lineas.map(l => { const kb = l.kg_por_bulto > 0 ? l.kg_por_bulto : (prs.get(l.id_producto) && prs.get(l.id_producto).kg_por_bulto); return {...l, kg_total: kb > 0 ? Math.round(l.cantidad * kb * 1000) / 1000 : null}; });
  const kgTotal = lineasKg.length && lineasKg.every(l => l.kg_total != null) ? Math.round(lineasKg.reduce((a, l) => a + l.kg_total, 0) * 1000) / 1000 : null;
  const bk = d.metodo_pago ? await R.one(db, 'SELECT nombre, moneda, cuenta_numero, cuenta_titular FROM bancos WHERE nombre = ?1 COLLATE NOCASE ORDER BY activo DESC LIMIT 1', [d.metodo_pago]) : null;
  let tasa = null; try { const t = await T.vigente(db, d.fecha_emision); tasa = t ? {valor: t.valor, fecha: t.fecha} : null; } catch (e) { tasa = null; }
  return {documento: d, lineas: lineasKg, kg_total: kgTotal, banco: bk || null, tasa, notas, asientos: asientos.map(a => ({...a, lineas: JSON.parse(a.lineas)})), movimientos: movs, factura_resultante: hija || null, membrete: pub};
}

/* ---------- PDF de la nota de entrega / factura ----------
   Datos ya listos para que el navegador arme el archivo PDF (ventas y portal del cliente usan el MISMO armado).
   · Al VENDER solo existe el pedido (PED-): se entrega un PDF rotulado «Pedido / Nota de entrega» (o «Pedido / Factura»), sin numeración fiscal nueva.
   · Al DESPACHAR nacen la nota (NE-) o factura (FA-) definitivas: ese PDF lleva su número real. */
const r2 = n => Math.round(n * 100) / 100;
async function _datosPdfBase(db, cli, fechaTasa) {
  const cfg = await R.leerConfig(db); let tasa = null;
  try { const t = await T.vigente(db, fechaTasa); tasa = t ? {valor: t.valor, fecha: t.fecha} : null; } catch (e) { tasa = null; }
  return {cfg, tasa, empresa: {razon: cfg.membrete_razon || 'El Maná JL', rif: cfg.membrete_rif || '', direccion: cfg.membrete_direccion || '', telefono: cfg.membrete_telefono || ''}};
}
async function _bancoPdf(db, nombre) {
  const bk = nombre ? await R.one(db, 'SELECT nombre, moneda, cuenta_numero, cuenta_titular FROM bancos WHERE nombre = ?1 COLLATE NOCASE ORDER BY activo DESC LIMIT 1', [nombre]) : null;
  return nombre ? {nombre: (bk && bk.nombre) || nombre, cuenta: (bk && bk.cuenta_numero) || '', titular: (bk && bk.cuenta_titular) || ''} : null;
}
const _plazoTxt = cli => cli && cli.dias_credito_normal != null ? `Crédito normal hasta ${cli.dias_credito_normal} días` + (cli.dias_pronto_pago != null ? ` · pronto pago hasta ${cli.dias_pronto_pago} días` : '') : (cli && cli.dias_pronto_pago != null ? `Pronto pago hasta ${cli.dias_pronto_pago} días` : '');
export async function datosPdfPedido(db, id) {
  const p = await PRD.getPedido(db, id); if (!p) throw err(404, 'Pedido no encontrado.');
  const [ls, cli] = [await PRD.lineasDePedido(db, id), await R.getCliente(db, p.id_cliente)];
  const {tasa, empresa} = await _datosPdfBase(db, cli, p.fecha), ne = p.tipo === 'NOTA_ENTREGA';
  const lineas = ls.map(l => ({nombre: l.nombre, sku: l.sku, bultos: l.bultos, kg_bulto: l.kg_por_bulto, kg: Math.round(l.bultos * l.kg_por_bulto * 1000) / 1000, precio_bulto: dol(l.precio_base_cents), total: dol(l.bultos * l.precio_base_cents)}));
  const tot = D.totalesLineas(ls.map(l => ({cantidad: l.bultos, precio_base_cents: l.precio_base_cents, alicuota: l.alicuota})), 0, p.descuento_pct);
  const envio = D.ubicacionEnvio(cli), contado = !!p.pago_json;
  return {kind: 'pedido', tipo: ne ? 'NOTA_ENTREGA' : 'FACTURA', titulo: ne ? 'NOTA DE ENTREGA' : 'FACTURA', rotulo: 'PEDIDO / ' + (ne ? 'NOTA DE ENTREGA' : 'FACTURA') + ' (por despachar)', definitivo: false, numero: p.nro, fecha: p.fecha, estado: p.estado,
    archivo: (ne ? 'Nota-' : 'Factura-') + p.nro + '.pdf', aviso: `Este es el pedido ${p.nro}: se entregó al vender. La ${ne ? 'nota de entrega' : 'factura'} con su número definitivo se emite al despachar.`,
    empresa, cliente: {razon: cli.razon_social, rif: cli.rif_id || '', vendedor: cli.vendedor_nombre || ''}, tasa, lineas,
    totales: {subtotal: dol(tot.subtotal), descuento: dol(tot.descuento), descuento_pct: p.descuento_pct || 0, iva: dol(tot.iva), total: dol(tot.total), total_bs: tasa ? r2(tot.total / 100 * tasa.valor) : null, bultos: ls.reduce((a, l) => a + l.bultos, 0), kilos: Math.round(ls.reduce((a, l) => a + l.bultos * l.kg_por_bulto, 0) * 1000) / 1000},
    condicion: contado ? 'De contado (pronto pago)' : 'A crédito', plazo: _plazoTxt(cli), vence: null, banco: await _bancoPdf(db, p.metodo_pago),
    envio: {estado: p.estado_ve || D.estadoReal(cli.zona) || '', zona: p.zona || '', direccion: envio.direccion}, observaciones: p.observaciones || ''};
}
export async function datosPdfDocumento(db, id) {
  const d = await R.getDocumento(db, id); if (!d) throw err(404, 'Documento no encontrado.');
  const [ls, cli] = [await R.lineasDe(db, id), await R.getCliente(db, d.id_cliente)];
  const {tasa, empresa} = await _datosPdfBase(db, cli, d.fecha_emision), ne = d.tipo_origen === 'NOTA_ENTREGA';
  const prs = new Map((await R.productosPorIds(db, [...new Set(ls.map(l => l.id_producto))])).map(p => [p.id_producto, p]));
  const lineas = ls.map(l => { const kb = l.kg_por_bulto > 0 ? l.kg_por_bulto : ((prs.get(l.id_producto) || {}).kg_por_bulto || null); return {nombre: l.nombre, sku: l.sku, bultos: l.cantidad, kg_bulto: kb, kg: kb ? Math.round(l.cantidad * kb * 1000) / 1000 : null, precio_bulto: dol(l.precio_base_cents), total: dol(l.cantidad * l.precio_base_cents)}; });
  const kilos = lineas.length && lineas.every(l => l.kg != null) ? Math.round(lineas.reduce((a, l) => a + l.kg, 0) * 1000) / 1000 : null;
  const zonaEnv = d.envio_zona || (cli.zona || ''), numero = d.numero_externo || d.nro_control_interno;
  return {kind: 'documento', tipo: d.tipo_origen, titulo: ne ? 'NOTA DE ENTREGA' : 'FACTURA', rotulo: '', definitivo: true, numero, nro_fiscal: d.nro_factura_fiscal || '', fecha: d.fecha_emision, estado: d.estado,
    archivo: (ne ? 'Nota-' : 'Factura-') + d.nro_control_interno + '.pdf', aviso: '',
    empresa, cliente: {razon: d.razon_social, rif: d.rif_id || '', vendedor: d.vendedor_nombre || ''}, tasa, lineas,
    totales: {subtotal: dol(d.subtotal_base_cents), descuento: dol(d.descuento_cents), descuento_pct: d.descuento_pct || 0, iva: dol(d.iva_cents), total: dol(d.total_cents), total_bs: tasa ? r2(d.total_cents / 100 * tasa.valor) : null, bultos: lineas.reduce((a, l) => a + l.bultos, 0), kilos},
    condicion: d.fecha_vencimiento ? 'A crédito' : (d.estado === 'PAGADO' ? 'Pagada' : 'A crédito'), plazo: _plazoTxt(cli), vence: d.fecha_vencimiento || null, banco: await _bancoPdf(db, d.metodo_pago),
    envio: {estado: D.estadoReal(zonaEnv) || '', zona: D.zonaDeEstado(zonaEnv) || '', direccion: d.envio_direccion || cli.direccion_entrega || ''}, observaciones: d.observaciones || '', sin_detalle: !lineas.length};
}
/* Pedidos de venta recientes (para bajar su PDF desde ventas) */
export const pedidosRecientes = db => PRD.listarPedidos(db, {limite: 60}).then(rs => rs.map(p => ({id_pedido: p.id_pedido, nro: p.nro, fecha: p.fecha, razon_social: p.razon_social, tipo: p.tipo, estado: p.estado, bultos: p.bultos, kilos: Math.round(p.kilos * 1000) / 1000, zona: p.zona})));

/* ---------- Fase 2: liquidación ---------- */
const CAMPO_CASO = {1: 'precio_pp_cents', 2: 'precio_base_cents', 3: 'precio_mora_cents'};
async function liquidar(db, doc, cli, fechaPago, exonerar) {
  const lineas = await R.lineasDe(db, doc.id_documento);
  const liq = D.calcularLiquidacion({doc, lineas, cliente: cli, fechaPago, exonerarMora: exonerar});
  const restante = Math.max(0, liq.neto_cents - doc.pagado_cents);
  return {lineas, liq, restante};
}
export async function previsualizar(db, {id_cliente, fecha, docs, exonerar}) {
  const cli = await R.getCliente(db, +id_cliente); if (!cli) throw err(404, 'Cliente no encontrado.');
  const f = fecha || D.hoyVE(); if (!D.fechaValida(f)) throw err(400, 'Fecha no válida.');
  const pend = await R.documentosPendientesDe(db, cli.id_cliente), out = [];
  for (const d of pend) {
    if (docs && !docs.includes(d.id_documento)) continue;
    if (D.diasEntre(d.fecha_emision, f) < 0) { out.push({id_documento: d.id_documento, nro: d.numero_externo || d.nro_control_interno, tipo_origen: d.tipo_origen, fecha_emision: d.fecha_emision, restante: dol(d.saldo_cents), error: 'Esta nota se emitió después de la fecha del pago: no se puede aplicar.'}); continue; }
    const {liq, restante} = await liquidar(db, d, cli, f, !!exonerar);
    out.push({id_documento: d.id_documento, nro: d.numero_externo || d.nro_control_interno, tipo_origen: d.tipo_origen, fecha_emision: d.fecha_emision, sin_lineas: !!d.sin_lineas, total: dol(d.total_cents), pagado: dol(d.pagado_cents),
      dias: liq.dias, caso: liq.caso, caso_texto: D.CASO_TXT[liq.caso], ruta: liq.ruta, neto: dol(liq.neto_cents), restante: dol(restante), restante_cents: restante, nota: liq.nota ? {tipo: liq.nota.tipo, base: dol(liq.nota.base), iva: dol(liq.nota.iva), total: dol(liq.nota.total)} : null,
      final: liq.final ? {base: dol(liq.final.base), iva: dol(liq.final.iva), total: dol(liq.final.total)} : null, exonerado: liq.exonerado});
  }
  return {fecha: f, hoy: D.hoyVE(), tasa: await T.vigente(db, f), documentos: out, deuda_cliente: dol(cli.deuda_cents)};
}

async function verificarPin(ctx, pin, motivo) {
  const cfg = await R.leerConfig(ctx.db);
  const fallo = async (msg, accion) => { await R.lote(ctx.db, audit(ctx, 'seguridad', 'PIN', 'PIN de gerencia', accion, {motivo})); throw err(403, msg, {codigo: 'PIN'}); };
  if (!cfg.pin_hash) return fallo('Esta operación exige el PIN de gerencia y todavía no hay uno configurado. El Dueño debe crearlo.', 'PIN exigido sin PIN configurado');
  if (!pin) throw err(403, 'Esta operación exige el PIN de gerencia: ' + motivo + '.', {codigo: 'PIN_REQUERIDO'});
  if (await hashPin(pin, cfg.pin_sal) !== cfg.pin_hash) return fallo('PIN de gerencia incorrecto.', 'PIN incorrecto');
}
async function hashPin(pin, sal) { const b = new TextEncoder().encode(sal + ':' + pin); return [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map(x => x.toString(16).padStart(2, '0')).join(''); }
export async function fijarPin(ctx, pin) {
  exigir(ctx, 'config', 'Solo el Dueño cambia el PIN de gerencia.');
  if (!/^\d{4,12}$/.test(String(pin || ''))) throw err(400, 'El PIN debe tener de 4 a 12 dígitos.');
  const sal = crypto.randomUUID();
  await enLote(ctx.db, [R.stConfig(ctx.db, 'pin_sal', sal), R.stConfig(ctx.db, 'pin_hash', await hashPin(String(pin), sal)), ...audit(ctx, 'seguridad', 'PIN', 'PIN de gerencia', 'cambió el PIN', {})]);
  return {ok: true};
}

const formatoPago = p => ({id_pago: p.id_pago, fecha_pago: p.fecha_pago, cliente: p.razon_social, banco: p.banco, referencia: p.referencia, monto_bs: dol(p.monto_bs_cents), usd: dol(p.usd_cents), estado: p.estado, recibo: 'RC-' + pad(p.id_pago, 5)});

export async function cobrar(ctx, b, o = {}) {
  exigir(ctx, 'cobrar', 'Tu rol no registra pagos.');
  const {db} = ctx, hoy = D.hoyVE(), cfg = await R.leerConfig(db), max = +cfg.ref_corta_max || 6;
  const fecha = b.fecha_pago || hoy;
  if (!D.fechaValida(fecha)) throw err(400, 'La fecha de pago no es válida.');
  if (fecha > hoy) throw err(400, 'La fecha de pago no puede ser futura.');
  const cli = await R.getCliente(db, +b.id_cliente); if (!cli) throw err(404, 'Elige un cliente.');
  const bs = Number(b.monto_bs);
  if (!(bs > 0)) throw err(400, 'Escribe el monto en bolívares.');
  const tasaInfo = await T.tasaPara(db, fecha), tasa = tasaInfo.valor; // tasa BCV vigente en la fecha del pago; la que mande la pantalla se ignora
  const bcoLista = await BS.elegido(db, b.id_banco); // banco elegido de la lista de la empresa (opcional): su nombre manda
  const banco = D.normBanco(bcoLista ? bcoLista.nombre : b.banco), refN = D.normRef(b.referencia);
  if (!banco) throw err(400, 'Escribe el banco.'); if (!refN) throw err(400, 'Escribe el número de referencia.');
  const bsC = D.aCents(bs), usdC = D.usdDeBs(bsC, tasa);
  if (usdC <= 0) throw err(400, 'El equivalente en dólares es cero: revisa monto y tasa.');
  const apls = Array.isArray(b.aplicaciones) ? b.aplicaciones.map(a => ({id_documento: +a.id_documento, usd_cents: D.aCents(a.usd)})) : [];
  if (apls.some(a => !Number.isInteger(a.id_documento) || !(a.usd_cents > 0))) throw err(400, 'Hay un monto aplicado no válido.');
  if (new Set(apls.map(a => a.id_documento)).size !== apls.length) throw err(400, 'Un documento aparece dos veces.');
  const totalApl = apls.reduce((t, a) => t + a.usd_cents, 0);
  if (totalApl > usdC) throw err(400, `Lo aplicado a las notas (US$ ${(totalApl / 100).toFixed(2)}) supera el pago (US$ ${(usdC / 100).toFixed(2)}).`);

  // Duplicados
  const avisos = [];
  for (const ex of await R.posiblesDuplicados(db, banco, refN)) {
    const r = D.compararDuplicado({banco, referencia: refN, monto_bs_cents: bsC}, ex, max);
    if (r === 'bloquea') throw err(409, 'Esa referencia ya está registrada para ese banco. No se guardó el pago.', {codigo: 'DUPLICADO', existente: formatoPago(ex)});
    if (r === 'aviso') avisos.push({mensaje: 'Hay un pago del mismo banco con la misma terminación de referencia pero otro monto. Confirma que no es el mismo.', existente: formatoPago(ex)});
  }
  // Candado de fecha y exoneración
  const retro = fecha < hoy, exonera = !!b.exonerar_mora;
  if (retro || exonera) await verificarPin(ctx, b.pin ? String(b.pin) : '', retro && exonera ? 'fecha de pago anterior a hoy y exoneración de recargo' : retro ? 'fecha de pago anterior a hoy' : 'exoneración del recargo por mora');

  // Liquidación por documento
  const pend = new Map((await R.documentosPendientesDe(db, cli.id_cliente)).map(d => [d.id_documento, d]));
  const liquidaciones = [], st = [], idPago = await R.siguiente(db, 'pago'), ej = cli.ejemplo ? 1 : 0;
  let vendedorPago = cli.id_vendedor;
  for (const a of apls) {
    const d = pend.get(a.id_documento); if (!d) throw err(400, 'Un documento no está pendiente de este cliente.');
    if (D.diasEntre(d.fecha_emision, fecha) < 0) throw err(400, 'La fecha de pago es anterior a la emisión del documento ' + (d.numero_externo || d.nro_control_interno) + '.');
    const {lineas, liq, restante} = await liquidar(db, d, cli, fecha, exonera);
    if (a.usd_cents > restante) throw err(400, `Al documento ${d.numero_externo || d.nro_control_interno} solo se le puede aplicar US$ ${(restante / 100).toFixed(2)} (monto a cobrar según la fecha de pago: ${D.CASO_TXT[liq.caso].toLowerCase()}).`);
    vendedorPago = d.id_vendedor ?? vendedorPago;
    const liquida = a.usd_cents === restante;
    st.push(R.stAplicacion(db, {id_pago: idPago, id_documento: d.id_documento, usd_cents: a.usd_cents, liquido: liquida, ejemplo: ej}));
    if (!liquida) continue;
    const info = {id_documento: d.id_documento, nro: d.numero_externo || d.nro_control_interno, ruta: liq.ruta, caso: liq.caso, caso_texto: D.CASO_TXT[liq.caso], dias: liq.dias, exonerado: liq.exonerado, nota: null, factura: null};
    if (liq.ruta === 'SIN_DETALLE') st.push(R.stEstadoDocumento(db, d.id_documento, 'PAGADO', null, fecha));
    else if (liq.ruta === 'A') {
      const idF = await R.siguiente(db, 'documento'), ctlF = 'FA-' + pad(await R.siguiente(db, 'factura_ctl')), fisF = (cfg.fiscal_prefijo_factura || '') + pad(await R.siguiente(db, 'factura_fiscal'), 8), f = liq.final;
      st.push(R.stInsertarDocumento(db, {id_documento: idF, nro_control_interno: ctlF, nro_factura_fiscal: fisF, tipo_origen: 'FACTURA', estado: 'PAGADO', fecha_emision: fecha, id_cliente: cli.id_cliente, id_vendedor: d.id_vendedor, subtotal_base_cents: f.subtotal, descuento_pct: d.descuento_pct, descuento_cents: f.descuento, iva_cents: f.iva, total_cents: f.total,
        afecta_inventario: 0, id_ne_origen: d.id_documento, envio_zona: d.envio_zona, envio_direccion: d.envio_direccion, lista_precios: d.lista_precios, caso_liquidacion: liq.caso, fecha_liquidacion: fecha, observaciones: 'Factura definitiva de la nota de entrega ' + d.nro_control_interno + (liq.exonerado ? ' (recargo por mora exonerado con PIN)' : ''), metodo_pago: d.metodo_pago, origen: 'manual', creado_rol: ROL_TXT[ctx.rol] || ctx.rol, ejemplo: ej}));
      for (const l of lineas) { const p = l[CAMPO_CASO[liq.caso === 3 && liq.exonerado ? 2 : liq.caso]]; st.push(R.stInsertarLinea(db, idF, {...l, precio_base_cents: p, precio_pp_cents: p, precio_mora_cents: p}, ej)); }
      st.push(R.stEstadoDocumento(db, d.id_documento, 'FACTURADO_DESDE_NE', liq.caso, fecha));
      const asi = D.asientoConversionNE({total: d.total_cents}, f); st.push(R.stAsiento(db, {fecha, id_documento: idF, id_pago: idPago, concepto: asi.concepto, lineas: asi.lineas, ejemplo: ej}));
      info.factura = {id_documento: idF, nro_control_interno: ctlF, nro_factura_fiscal: fisF, total: dol(f.total), sin_mover_inventario: true};
    } else { // Ruta B
      st.push(R.stEstadoDocumento(db, d.id_documento, 'PAGADO', liq.caso, fecha));
      if (liq.nota) {
        const idN = await R.siguiente(db, 'nota_ajuste'), nd = liq.nota.tipo === 'NOTA_DEBITO', fis = ((nd ? cfg.fiscal_prefijo_nd : cfg.fiscal_prefijo_nc) || '') + pad(await R.siguiente(db, nd ? 'nd_fiscal' : 'nc_fiscal'), 8);
        st.push(R.stInsertarNotaAjuste(db, {id_nota_ajuste: idN, id_factura_origen: d.id_documento, tipo_nota: liq.nota.tipo, nro_fiscal_nota: fis, fecha_emision: fecha, motivo_ajuste: liq.nota.motivo, base: liq.nota.base, iva: liq.nota.iva, total: liq.nota.total, id_pago: idPago, ejemplo: ej}));
        const asi = nd ? D.asientoND(liq.nota) : D.asientoNC(liq.nota); st.push(R.stAsiento(db, {fecha, id_documento: d.id_documento, id_pago: idPago, concepto: asi.concepto, lineas: asi.lineas, ejemplo: ej}));
        info.nota = {id_nota_ajuste: idN, tipo: liq.nota.tipo, nro_fiscal: fis, base: dol(liq.nota.base), iva: dol(liq.nota.iva), total: dol(liq.nota.total), factura_origen: d.nro_factura_fiscal};
      }
    }
    if (liq.comision_base_cents != null) {
      const v = d.id_vendedor ? await R.getVendedor(db, d.id_vendedor) : null, pct = v ? v.comision_pct : null;
      st.push(R.stComision(db, {id_documento: d.id_documento, id_pago: idPago, id_vendedor: d.id_vendedor, base_neta_cents: liq.comision_base_cents, pct, monto_cents: pct == null ? null : Math.round(liq.comision_base_cents * pct / 100), fecha, ejemplo: ej}));
      info.comision = {base_neta: dol(liq.comision_base_cents), pct, monto: pct == null ? null : dol(Math.round(liq.comision_base_cents * pct / 100))};
    }
    liquidaciones.push(info);
  }
  const asC = D.asientoCobro(usdC);
  const pago = {id_pago: idPago, fecha_pago: fecha, id_cliente: cli.id_cliente, id_vendedor: vendedorPago, monto_bs_cents: bsC, tasa, usd_cents: usdC, banco, id_banco: bcoLista ? bcoLista.id : null, referencia: String(b.referencia).trim().slice(0, 40), ref_norm: refN, dup_key: D.dupKey(banco, refN, bsC, max), observacion: txt(b.observacion, 300) || null,
    retroactivo: retro, exonera_mora: exonera, origen: o.origen || 'manual', creado_rol: ROL_TXT[ctx.rol] || ctx.rol, ejemplo: ej};
  const todo = [R.stInsertarPago(db, pago), ...st, R.stAsiento(db, {fecha, id_pago: idPago, concepto: asC.concepto, lineas: asC.lineas, ejemplo: ej}), R.stSaldoCliente(db, cli.id_cliente),
    ...audit(ctx, 'pago', 'RC-' + pad(idPago, 5), cli.razon_social, 'registró el pago', {usd: dol(usdC), bs: bs, tasa, banco, referencia: refN, fecha_pago: fecha, retroactivo: retro ? 'autorizado con PIN de gerencia' : false, exonera_mora: exonera ? 'autorizada con PIN de gerencia' : false, liquidaciones: liquidaciones.map(l => l.nro + ' (' + l.caso_texto + ')')})];
  await enLote(db, todo);
  return {id_pago: idPago, recibo: 'RC-' + pad(idPago, 5), usd: dol(usdC), aplicado: dol(totalApl), sin_aplicar: dol(usdC - totalApl), avisos, liquidaciones};
}

export async function anularPago(ctx, id, motivo) {
  exigir(ctx, 'anularPago', 'Solo el Dueño anula pagos.');
  const m = txt(motivo, 200); if (m.length < 3) throw err(400, 'Escribe el motivo de la anulación.');
  const p = await R.getPago(ctx.db, id); if (!p) throw err(404, 'Pago no encontrado.'); if (p.estado !== 'ACTIVO') throw err(409, 'El pago ya está anulado.');
  if ((await R.contarLiquidadosPor(ctx.db, id)).n > 0) throw err(409, 'Este pago liquidó un documento con detalle (emitió factura o nota). Anularlo exige una nota de crédito: por confirmar con el contador.', {codigo: 'LIQUIDO'});
  const apls = await R.aplicacionesDe(ctx.db, id), st = [R.stAnularPago(ctx.db, id, m, ROL_TXT[ctx.rol] || ctx.rol)];
  for (const a of apls) if (a.liquido) st.push(R.stEstadoDocumento(ctx.db, a.id_documento, 'PENDIENTE', null, null));
  const as = {concepto: 'Anulación de cobro ' + 'RC-' + pad(id, 5), lineas: [{cuenta: D.CTA.cxc, debe: p.usd_cents, haber: 0}, {cuenta: D.CTA.banco, debe: 0, haber: p.usd_cents}]};
  st.push(R.stAsiento(ctx.db, {fecha: D.hoyVE(), id_pago: id, concepto: as.concepto, lineas: as.lineas, ejemplo: p.ejemplo}), R.stSaldoCliente(ctx.db, p.id_cliente), ...audit(ctx, 'pago', 'RC-' + pad(id, 5), p.razon_social, 'anuló el pago', {motivo: m, usd: dol(p.usd_cents)}));
  await enLote(ctx.db, st);
  return formatoPago({...(await R.getPago(ctx.db, id))});
}
export async function detallePago(db, id) {
  const p = await R.getPago(db, id); if (!p) throw err(404, 'Pago no encontrado.');
  const apls = await R.aplicacionesDe(db, id), cfg = await R.leerConfig(db), {pin_hash, pin_sal, ...pub} = cfg;
  const liquidados = [];
  for (const a of apls) {
    const d = await R.getDocumento(db, a.id_documento);
    if (a.liquido) liquidados.push({documento: a.numero_externo || a.nro_control_interno, notas: await R.notasDe(db, a.id_documento), factura: await R.facturaDeNE(db, a.id_documento)});
    a.saldo_actual_cents = d ? d.saldo_cents : null;
  }
  return {pago: p, recibo: 'RC-' + pad(id, 5), aplicaciones: apls, liquidados, membrete: pub, sin_aplicar_cents: p.usd_cents - apls.reduce((t, a) => t + a.usd_cents, 0)};
}

/* ---------- Salidas ---------- */
export async function deuda(db, params) {
  const filas = await R.pendientesParaDeuda(db, {...params, qn: params && params.q ? D.normNombre(params.q) : ''}), hoy = D.hoyVE(), m = new Map();
  for (const f of filas) {
    if (f.saldo_cents <= 0) continue;
    const c = m.get(f.id_cliente) || m.set(f.id_cliente, {id_cliente: f.id_cliente, razon_social: f.razon_social, rif: f.rif_id, zona: f.zona, vendedor: f.vendedor_nombre, saldo_cents: 0, desde: f.fecha_emision, notas: []}).get(f.id_cliente);
    const dias = D.diasEntre(f.fecha_emision, hoy); c.saldo_cents += f.saldo_cents; if (f.fecha_emision < c.desde) c.desde = f.fecha_emision;
    c.notas.push({id_documento: f.id_documento, nro: f.numero_externo || f.nro_control_interno, tipo: f.tipo_origen, fecha: f.fecha_emision, dias, total: dol(f.total_cents), saldo: dol(f.saldo_cents), sin_detalle: !!f.sin_lineas});
  }
  const out = [...m.values()].map(c => ({...c, saldo: dol(c.saldo_cents), dias_desde: D.diasEntre(c.desde, hoy)})).sort((a, b) => b.dias_desde - a.dias_desde || b.saldo_cents - a.saldo_cents);
  const agr = clave => { const g = new Map(); for (const c of out) { const k = c[clave] || 'Sin asignar'; const x = g.get(k) || g.set(k, {nombre: k, clientes: 0, saldo_cents: 0, mas_antigua: c.desde}).get(k); x.clientes++; x.saldo_cents += c.saldo_cents; if (c.desde < x.mas_antigua) x.mas_antigua = c.desde; } return [...g.values()].map(x => ({nombre: x.nombre, clientes: x.clientes, saldo: dol(x.saldo_cents), dias_desde: D.diasEntre(x.mas_antigua, hoy)})).sort((a, b) => b.saldo - a.saldo); };
  return {hoy, clientes: out, total: dol(out.reduce((t, c) => t + c.saldo_cents, 0)), por_vendedor: agr('vendedor'), por_zona: agr('zona')};
}
export async function listaPagos(db, p) { return (await R.listarPagos(db, p)).map(x => ({...formatoPago(x), id_cliente: x.id_cliente, cliente_rif: x.cliente_rif, docs: x.docs_txt, vendedor: x.vendedor_nombre, notas: x.notas, aplicado: dol(x.aplicado_cents), tasa: x.tasa, motivo_anulacion: x.motivo_anulacion, origen: x.origen, retroactivo: !!x.retroactivo, ejemplo: !!x.ejemplo, creado_rol: x.creado_rol})); }

export async function guardarConfig(ctx, b) {
  exigir(ctx, 'config', 'Solo el Dueño cambia la configuración.');
  const claves = ['membrete_razon', 'membrete_rif', 'membrete_direccion', 'membrete_telefono', 'fiscal_prefijo_factura', 'fiscal_prefijo_nc', 'fiscal_prefijo_nd', 'dias_alerta_deuda', 'ref_corta_max'], st = [];
  for (const k of claves) if (k in b) { const v = txt(b[k], 150); if (k === 'ref_corta_max' && !(/^\d+$/.test(v) && +v >= 4 && +v <= 20)) throw err(400, 'La longitud mínima de una referencia completa debe estar entre 4 y 20.'); if (k === 'dias_alerta_deuda' && v && !/^\d+$/.test(v)) throw err(400, 'Los días de alerta deben ser un entero.'); st.push(R.stConfig(ctx.db, k, v)); }
  for (const [campo, seq] of [['siguiente_factura', 'factura_fiscal'], ['siguiente_nc', 'nc_fiscal'], ['siguiente_nd', 'nd_fiscal']]) if (b[campo] != null && b[campo] !== '') { const n = +b[campo]; if (!Number.isInteger(n) || n < 1) throw err(400, 'El próximo número fiscal debe ser un entero desde 1.'); await R.fijarSecuencia(ctx.db, seq, n - 1); }
  await enLote(ctx.db, [...st, ...audit(ctx, 'config', 'ventas', 'Configuración de ventas', 'modificó', Object.fromEntries(Object.entries(b).filter(([k]) => k !== 'pin')))]);
  return arranque(ctx.db);
}

/* ---------- Importación única desde el Excel de cobranza (llega ya limpia y confirmada desde la pantalla) ---------- */
export async function importarLote(ctx, b) {
  await cargarMapaListas(ctx.db);
  exigir(ctx, 'importar', 'Tu rol no importa datos.');
  const {db} = ctx, ej = b.ejemplo ? 1 : 0, cfg = await R.leerConfig(db), max = +cfg.ref_corta_max || 6;
  if (!Array.isArray(b.notas) || b.notas.length > 40) throw err(400, 'Envía hasta 40 notas por lote.');
  const res = {notas: 0, notasOmitidas: [], pagos: 0, pagosOmitidos: [], clientesNuevos: 0, sinReferencia: 0}, vcache = new Map(), ccache = new Map();
  const vend = async n => { const k = D.normNombre(n); if (!k) return null; if (vcache.has(k)) return vcache.get(k); let v = await R.vendedorPorNombre(db, n.trim()); if (!v) { await R.lote(db, [R.stInsertarVendedor(db, {nombre: n.trim(), ejemplo: ej})]); v = await R.vendedorPorNombre(db, n.trim()); } vcache.set(k, v.id); return v.id; };
  const cli = async (nombre, vid, zona) => { const norm = D.normNombre(nombre); if (ccache.has(norm)) return ccache.get(norm); let c = await R.clientePorNorm(db, norm); if (!c) { await R.lote(db, [R.stInsertarCliente(db, {razon_social: nombre.trim(), razon_norm: norm, id_vendedor: vid, zona, lista_regional: D.listaRegional(zona), origen: 'importado', ejemplo: ej})]); c = await R.clientePorNorm(db, norm); res.clientesNuevos++; } ccache.set(norm, c.id_cliente); return c.id_cliente; };
  const claves = [];
  for (const n of b.notas) for (const p of n.pagos || []) { const bsC = D.aCents(p.bs), k = D.dupKey(p.banco, p.ref, bsC, max); if (k) claves.push(k); }
  const existentes = await R.clavesExistentes(db, claves), vistas = new Set();
  const nuevosDocs = []; let st = [];
  const idsReservados = b.notas.length ? await R.reservar(db, 'documento', b.notas.length) : 0;
  let idxDoc = 0;
  for (const n of b.notas) {
    const numero = txt(n.numero, 20), monto = Number(n.monto);
    if (!numero || !(monto > 0) || !D.fechaValida(n.fecha) || !txt(n.cliente)) { res.notasOmitidas.push({numero, motivo: 'datos incompletos o no válidos'}); continue; }
    if (nuevosDocs.includes(numero) || await R.one(db, 'SELECT 1 x FROM documentos_venta WHERE numero_externo = ?1', [numero])) { res.notasOmitidas.push({numero, motivo: 'esa nota ya existe'}); continue; }
    nuevosDocs.push(numero);
    const zonaN = D.estadoReal(n.zona);
    if (!zonaN && !(await R.clientePorNorm(db, D.normNombre(txt(n.cliente, 150))))) { res.notasOmitidas.push({numero, motivo: 'el cliente es nuevo y su estado no es uno de los 24 estados de Venezuela'}); nuevosDocs.pop(); continue; }
    const vid = await vend(txt(n.vendedor, 80)), cid = await cli(txt(n.cliente, 150), vid, zonaN), id = idsReservados + idxDoc++, totalC = D.aCents(monto);
    let pagado = 0; const aps = [];
    const idsPago = (n.pagos || []).length ? await R.reservar(db, 'pago', n.pagos.length) : 0; let ip = 0;
    for (const p of n.pagos || []) {
      const bsC = D.aCents(p.bs), tasa = Number(p.tasa), refN = D.normRef(p.ref), banco = D.normBanco(p.banco);
      if (!(bsC > 0) || !(tasa > 0) || !D.fechaValida(p.fecha)) { res.pagosOmitidos.push({numero, motivo: 'pago con datos incompletos'}); ip++; continue; }
      const key = D.dupKey(banco, refN, bsC, max);
      if (key && (existentes.has(key) || vistas.has(key))) { res.pagosOmitidos.push({numero, referencia: p.ref, motivo: 'referencia repetida (banco + referencia)'}); ip++; continue; }
      if (key) vistas.add(key); if (!refN) res.sinReferencia++;
      const usdC = D.usdDeBs(bsC, tasa), idP = idsPago + ip++, aplic = Math.max(0, Math.min(usdC, totalC - pagado)); pagado += aplic;
      st.push(R.stInsertarPago(db, {id_pago: idP, fecha_pago: p.fecha, id_cliente: cid, id_vendedor: vid, monto_bs_cents: bsC, tasa, usd_cents: usdC, banco: banco || null, referencia: txt(p.ref, 40) || null, ref_norm: refN || null, dup_key: key, origen: 'importado', creado_rol: ROL_TXT[ctx.rol] || ctx.rol, ejemplo: ej, observacion: 'Importado del Excel de cobranza' + (refN ? '' : ' (sin referencia)')}));
      if (aplic > 0) aps.push({id_pago: idP, id_documento: id, usd_cents: aplic, liquido: pagado >= totalC, ejemplo: ej}); res.pagos++;
    }
    st.unshift(R.stInsertarDocumento(db, {id_documento: id, nro_control_interno: 'NE-I' + pad(id), numero_externo: numero, tipo_origen: 'NOTA_ENTREGA', estado: pagado >= totalC ? 'PAGADO' : 'PENDIENTE', fecha_emision: n.fecha, id_cliente: cid, id_vendedor: vid, subtotal_base_cents: totalC, iva_cents: 0, total_cents: totalC, sin_lineas: 1, afecta_inventario: 0, origen: 'importado', creado_rol: ROL_TXT[ctx.rol] || ctx.rol, ejemplo: ej, observacion: null}));
    st.push(...aps.map(a => R.stAplicacion(db, a))); res.notas++;
  }
  const idsCli = [...new Set(ccache.values())];
  st.push(...idsCli.map(c => R.stSaldoCliente(db, c)), ...audit(ctx, 'importación', 'Excel de cobranza', 'Importación', 'importó un lote', {notas: res.notas, pagos: res.pagos, omitidas: res.notasOmitidas.length}));
  await enLote(db, st);
  return res;
}

/* ---------- Datos de ejemplo (sintéticos) ---------- */
const EJ_PROD = [['Papas Naturales', '150 g', 'PAPAS'], ['Papas Onduladas', '150 g', 'PAPAS'], ['Papas Picantes', '150 g', 'PAPAS'], ['Papas Limón', '150 g', 'PAPAS'], ['Papas BBQ', '150 g', 'PAPAS'], ['Papas Queso', '150 g', 'PAPAS'],
  ['Papas Naturales', '35 g', 'PAPAS'], ['Papas Naturales', '60 g', 'PAPAS'], ['Papas Naturales', '1 kg', 'PAPAS'], ['Salsa Queso Cheddar', '200 g', 'SALSAS'], ['Salsa BBQ Ahumada', '200 g', 'SALSAS'], ['Salsa de Maíz', '200 g', 'SALSAS'],
  ['Salsa Tocineta', '200 g', 'SALSAS'], ['Salsa de Ajo', '200 g', 'SALSAS'], ['Salsa Mostaza', '200 g', 'SALSAS'], ['Salsa Mayonesa', '200 g', 'SALSAS'], ['Salsa de Tomate', '200 g', 'SALSAS']];
export async function cargarEjemplo(ctx) {
  await cargarMapaListas(ctx.db);
  exigir(ctx, 'ejemplo', 'Solo el Dueño carga los datos de ejemplo.');
  const {db} = ctx, hoy = D.hoyVE();
  if ((await R.contarEjemplo(db)).clientes > 0) throw err(409, 'Los datos de ejemplo ya están cargados.');
  await enLote(db, [R.stInsertarVendedor(db, {nombre: 'Vendedor 1 (EJEMPLO)', comision_pct: 5, ejemplo: 1}), R.stInsertarVendedor(db, {nombre: 'Vendedor 2 (EJEMPLO)', comision_pct: null, ejemplo: 1}), R.stInsertarVendedor(db, {nombre: 'Vendedor 3 (EJEMPLO)', comision_pct: null, ejemplo: 1}),
    ...EJ_PROD.map((p, i) => R.stInsertarProducto(db, {codigo_sku: 'EMJL-EJ-' + pad(i + 1, 2), nombre: p[0], gramaje: p[1], categoria: p[2], precio_ref_cents: null, orden: 10 + i, ejemplo: 1}))]);
  await R.run(db, "INSERT INTO listas_precio (nombre, ejemplo) VALUES ('Lista general (EJEMPLO)', 1)");
  const lista = (await R.listarListas(db)).find(l => l.ejemplo), vs = await R.listarVendedores(db), V = n => vs.find(v => v.nombre.startsWith('Vendedor ' + n + ' (EJ')).id;
  const prods = await R.listarProductos(db);
  await enLote(db, [...prods.map(p => R.stStock(db, p.id_producto, 500)), ...prods.map(p => R.stMovimiento(db, {id_producto: p.id_producto, cantidad: 500, tipo: 'ENTRADA_EJEMPLO', fecha: hoy, ejemplo: 1}))]);
  const clientes = [
    {n: 'Bodega La Esquina (EJEMPLO)', rif: 'J-00000101-0', mod: 'NOTA_ENTREGA', pp: 8, cr: 21, lim: 2000, v: V(1), zona: 'Lara'},
    {n: 'Supermercado Los Pinos (EJEMPLO)', rif: 'J-00000102-0', mod: 'FACTURA_DIRECTA', pp: 8, cr: 21, lim: 2000, v: V(1), zona: 'Trujillo'},
    {n: 'Abasto El Puente (EJEMPLO)', rif: 'J-00000103-0', mod: 'NOTA_ENTREGA', pp: 5, cr: 15, lim: 150, v: V(2), zona: 'Distrito Capital'},
    {n: 'Distribuidora Centro (EJEMPLO)', rif: 'J-00000104-0', mod: 'NOTA_ENTREGA', pp: null, cr: null, lim: null, v: V(3), zona: 'Anzoátegui'}];
  await enLote(db, clientes.map(c => R.stInsertarCliente(db, {rif_id: c.rif, razon_social: c.n, razon_norm: D.normNombre(c.n), modalidad_despacho_pref: c.mod, id_lista_base: lista.id, dias_pronto_pago: c.pp, dias_credito_normal: c.cr, limite_credito_cents: c.lim == null ? null : c.lim * 100, id_vendedor: c.v, zona: c.zona, lista_regional: D.listaRegional(c.zona), direccion_entrega: 'Dirección de ejemplo, ' + c.zona, ejemplo: 1})));
  const cl = Object.fromEntries((await R.buscarClientes(db, {q: 'EJEMPLO', limite: 20})).map(c => [c.rif_id, c]));
  const pk = k => prods.find(p => p.codigo_sku === k).id_producto;
  const reglas = [];
  for (const rif of ['J-00000101-0', 'J-00000102-0']) for (const k of ['EMJL-PAP-400', 'EMJL-PAP-1000', 'EMJL-PAP-200']) reglas.push(R.stUpsertRegla(db, cl[rif].id_cliente, {id_producto: pk(k), pct_descuento_pp: 10, pct_recargo_mora: 15, ejemplo: 1}));
  await enLote(db, reglas);
  const ctx2 = {...ctx, rol: 'dueno'}, op = {ejemplo: true, sinAuditoria: true};
  const ventas = [[0, 3, 'NOTA_ENTREGA'], [0, 15, 'NOTA_ENTREGA'], [0, 40, 'NOTA_ENTREGA'], [1, 3, 'FACTURA'], [1, 15, 'FACTURA'], [1, 40, 'FACTURA'], [3, 10, 'NOTA_ENTREGA']];
  for (const [ci, dias, tipo] of ventas) await crearVenta(ctx2, {id_cliente: cl[clientes[ci].rif].id_cliente, tipo, metodo_pago: 'Transferencia', observaciones: 'Documento de ejemplo', lineas: [{id_producto: pk('EMJL-PAP-400'), cantidad: 20}, {id_producto: pk('EMJL-PAP-1000'), cantidad: 5}, {id_producto: pk('EMJL-PAP-200'), cantidad: 12}]}, {...op, fecha: D.sumarDias(hoy, -dias)});
  await R.lote(db, audit(ctx, 'ejemplo', 'ventas', 'Datos de ejemplo', 'cargó los datos de ejemplo', {}));
  return R.contarEjemplo(db);
}
export async function borrarEjemplo(ctx) {
  exigir(ctx, 'ejemplo', 'Solo el Dueño borra los datos de ejemplo.');
  const r = await R.borrarEjemplo(ctx.db);
  await R.lote(ctx.db, audit(ctx, 'ejemplo', 'ventas', 'Datos de ejemplo', 'borró los datos de ejemplo', r));
  return {...r, ejemplo: await R.contarEjemplo(ctx.db)};
}
