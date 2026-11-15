/* Casos de uso del portal del cliente y de las acciones del equipo sobre él. No conoce HTTP.
   Regla de oro: en las funciones del portal el cliente SIEMPRE sale del código personal (ctx.cliente); ninguna recibe un id de cliente de afuera. */
import * as D from '../ventas/dominio.js';
import * as VR from '../ventas/repo.js';
import * as VS from '../ventas/servicio.js';
import * as PRD from '../produccion/repo.js';
import {puede, ROL_TXT} from '../ventas/permisos.js';
import * as T from '../tasa/servicio.js';
import * as BS from '../bancos/servicio.js';
import * as C from './dominio.js';
import * as ED from '../entregas/dominio.js';
import * as R from './repo.js';
import {tasaReferencia} from './tasa-acceso.js';

export const err = (status, message, extra = {}) => Object.assign(new Error(message), {status, message, extra});
const dol = c => c == null ? null : c / 100;
const txt = (v, max = 200) => (v == null ? '' : String(v)).trim().slice(0, max);
const MSG_ENLACE = 'El enlace no es válido o ya venció. Pide uno nuevo a quien te atiende en El Maná JL.';

/* ================= Entrada con código personal ================= */
export async function autenticar(db, codigo, ip) {
  const ventana = C.ventanaDe();
  if (await R.intentos(db, ip, ventana) >= C.MAX_INTENTOS) throw err(429, 'Demasiados intentos con un código que no sirve. Espera unos minutos e inténtalo de nuevo.', {retry_after: 600});
  const fallo = async () => { await R.sumarIntento(db, ip, ventana); throw err(401, MSG_ENLACE, {codigo: 'ENLACE'}); };
  const t = String(codigo || '').trim();
  if (!C.TOKEN_RE.test(t)) return fallo();
  const e = await R.enlacePorHash(db, await C.huella(t));
  if (!e || e.revocado_ts || (e.vence_ts && e.vence_ts <= Date.now())) return fallo();
  const cliente = await VR.getCliente(db, e.id_cliente); if (!cliente) return fallo();
  if (!e.ultimo_uso_ts || Date.now() - e.ultimo_uso_ts > 5 * 60e3) await R.tocarUso(db, e.id);
  return {db, cliente, enlace: e};
}
const auditP = (ctx, ref, accion, detalle) => VR.stAuditoria(ctx.db, {rol: 'portal', rolTxt: 'Portal del cliente', ent: 'portal', ref, nom: ctx.cliente.razon_social, accion, detalle});
const auditE = (ctx, ent, ref, nom, accion, detalle) => VR.stAuditoria(ctx.db, {rol: ctx.rol, rolTxt: ROL_TXT[ctx.rol] || ctx.rol, ent, ref, nom, accion, detalle});
const exigir = (ctx, accion, msg) => { if (!puede(ctx.rol, accion, ctx.matriz)) throw err(403, msg || 'Tu rol no puede hacer esto.'); };

/* ================= Lo que ve el cliente ================= */
async function situacionCredito(db, cli) {
  const ab = await R.totalesAbiertos(db, cli.id_cliente), deuda = cli.deuda_cents;
  const lim = cli.limite_credito_cents, disp = lim == null ? null : Math.max(0, lim - deuda - ab.total_cents);
  return {deuda_cents: deuda, abiertos_cents: ab.total_cents, limite_cents: lim, disponible_cents: disp};
}
export async function perfil(ctx) {
  const {db, cliente: c} = ctx, cr = await situacionCredito(db, c);
  const pend = (await VR.documentosPendientesDe(db, c.id_cliente)).filter(d => d.saldo_cents > 0), hoy = D.hoyVE();
  const desde = pend.length ? pend[0].fecha_emision : null;
  const [ped, pag, tasa] = await Promise.all([R.totalesAbiertos(db, c.id_cliente), R.abiertosPagos(db, c.id_cliente), tasaReferencia(db)]);
  return {hoy, cliente: {nombre: c.razon_social, dias_pronto_pago: c.dias_pronto_pago, dias_credito_normal: c.dias_credito_normal, vence_enlace: ctx.enlace.vence_ts || null},
    credito: {debe: dol(cr.deuda_cents), por_confirmar: dol(cr.abiertos_cents), limite: dol(cr.limite_cents), disponible: dol(cr.disponible_cents), sin_limite: cr.limite_cents == null},
    deuda_desde: desde, dias_desde: desde ? D.diasEntre(desde, hoy) : null, pedidos_por_confirmar: ped.n, pagos_por_verificar: pag,
    restriccion: C.restriccionZona(c), tasa};
}
export async function catalogo(ctx) {
  const {db, cliente: c} = ctx;
  const [prods, reglas] = await Promise.all([VR.listarProductos(db), VR.reglasDeCliente(db, c.id_cliente)]), rm = new Map(reglas.map(r => [r.id_producto, r])), cx = await VS.contextoPrecios(db, c);
  const out = [];
  for (const p of prods) {
    const pr = VS.precioDe(p, rm.get(p.id_producto), cx).pr; if (!pr) continue; // sin precio cargado: no se ofrece
    out.push({id_producto: p.id_producto, sku: p.codigo_sku, nombre: p.nombre, gramaje: p.gramaje, categoria: p.categoria, imagen: p.imagen_blanca_url || null,
      precio: dol(pr.base), precio_pronto_pago: pr.pp < pr.base ? dol(pr.pp) : null, iva: p.alicuota_iva, disponible: Math.max(0, p.stock_entero - (p.stock_apartado || 0)), sin_inventario: p.stock_entero - (p.stock_apartado || 0) <= 0, ...C.extraProducto(p)});
  }
  return out;
}
export async function crearPedido(ctx, b) {
  const {db, cliente: cli} = ctx;
  const rest = C.restriccionZona(cli); if (rest) throw err(409, rest, {codigo: 'ZONA'});
  const ev = C.validarLineasPortal(b && b.lineas); if (ev) throw err(400, ev);
  if ((await R.totalesAbiertos(db, cli.id_cliente)).n >= C.MAX_PEDIDOS_ABIERTOS) throw err(409, 'Ya tienes varios pedidos esperando confirmación. Espera a que Ventas los revise.', {codigo: 'MUCHOS_ABIERTOS'});
  const ls = b.lineas.map(l => ({id_producto: +l.id_producto, cantidad: +l.cantidad}));
  const prods = await VR.productosPorIds(db, ls.map(l => l.id_producto)), pm = new Map(prods.map(p => [p.id_producto, p]));
  const rm = new Map((await VR.reglasDeCliente(db, cli.id_cliente)).map(r => [r.id_producto, r])), cx = await VS.contextoPrecios(db, cli);
  const sin = [], lineas = [];
  for (const l of ls) {
    const p = pm.get(l.id_producto); if (!p || !p.activo) throw err(400, 'Uno de los productos ya no está disponible.');
    const pd = VS.precioDe(p, rm.get(p.id_producto), cx); if (pd.sinLista) throw err(409, 'Todavía no tenemos tu lista de precios: avisa a quien te atiende para que complete tu zona.', {codigo: 'SIN_LISTA'}); const pr = pd.pr; if (!pr) throw err(400, `«${p.nombre} ${p.gramaje || ''}» no está disponible para pedir.`);
    const nom = `${p.nombre} ${p.gramaje || ''}`.trim();
    const libre = Math.max(0, p.stock_entero - (p.stock_apartado || 0));   // disponible = existencias − apartado por pedidos
    if (libre <= 0) { sin.push({id_producto: p.id_producto, nombre: nom, disponible: 0}); continue; }
    if (l.cantidad > libre) { sin.push({id_producto: p.id_producto, nombre: nom, disponible: libre}); continue; }
    lineas.push({id_producto: p.id_producto, sku: p.codigo_sku, nombre: nom, cantidad: l.cantidad, precio_cents: pr.base, precio_base_cents: pr.base, alicuota: p.alicuota_iva});
  }
  if (sin.length) throw err(409, sin.map(s => s.disponible ? `«${s.nombre}»: solo hay ${s.disponible}.` : `«${s.nombre}»: Sin inventario.`).join(' '), {codigo: 'SIN_STOCK', productos: sin});
  const tot = D.totalesLineas(lineas, 0, cli.descuento_fijo_pct), cr = await situacionCredito(db, cli);
  if (cr.limite_cents != null && tot.total > cr.disponible_cents) throw err(409, `Este pedido (US$ ${(tot.total / 100).toFixed(2)}) supera tu crédito disponible (US$ ${(cr.disponible_cents / 100).toFixed(2)}). Reporta un pago o pide un pedido más pequeño.`, {codigo: 'LIMITE_CREDITO', disponible: dol(cr.disponible_cents), total: dol(tot.total)});
  const id = await R.siguiente(db, 'pedido_portal'), nota = txt(b.nota, 300);
  await R.lote(db, [R.stPedido(db, {id, id_cliente: cli.id_cliente, total_cents: tot.total, nota, id_enlace: ctx.enlace.id, ejemplo: cli.ejemplo}), ...lineas.map(l => R.stPedidoLinea(db, id, l)), ...auditP(ctx, C.codigoPedido(id), 'envió un pedido', {total_usd: dol(tot.total), lineas: lineas.length})]);
  return {id, codigo: C.codigoPedido(id), estado: 'POR_CONFIRMAR', total: dol(tot.total), mensaje: 'Recibimos tu pedido. Queda por confirmar hasta que Ventas lo apruebe.'};
}
async function armarPedidos(db, filas) {
  const ls = await R.lineasDePedidos(db, filas.map(p => p.id));
  return filas.map(p => ({id: p.id, codigo: C.codigoPedido(p.id), estado: p.estado, estado_texto: C.ESTADOS_PEDIDO[p.estado], total: dol(p.total_cents), nota: p.nota, creado: p.creado_ts, motivo_rechazo: p.motivo_rechazo || null,
    lineas: ls.filter(l => l.id_pedido === p.id).map(l => ({nombre: l.nombre, cantidad: l.cantidad, precio: dol(l.precio_cents)}))}));
}
export async function misPedidos(ctx) { return armarPedidos(ctx.db, await R.pedidosDeCliente(ctx.db, ctx.cliente.id_cliente)); }
export async function cancelarPedido(ctx, id) {
  const p = await R.getPedido(ctx.db, id);
  if (!p || p.id_cliente !== ctx.cliente.id_cliente) throw err(404, 'No encontramos ese pedido.');   // ajeno = no existe
  if (!await R.moverPedido(ctx.db, id, 'POR_CONFIRMAR', 'CANCELADO', {ts: Date.now(), rol: 'Cliente'})) throw err(409, 'Ese pedido ya no se puede cancelar.');
  await VR.lote(ctx.db, auditP(ctx, C.codigoPedido(id), 'canceló su pedido', {}));
  return {ok: true};
}

export async function cuenta(ctx) {
  const {db, cliente: c} = ctx, hoy = D.hoyVE();
  const [docs, notas, pagos, pedidos, reportes, per] = await Promise.all([VR.listarDocumentos(db, {cliente: c.id_cliente, limite: 200}), R.notasAjusteDeCliente(db, c.id_cliente),
    VR.listarPagos(db, {cliente: c.id_cliente, estado: 'ACTIVO', limite: 100}), misPedidos(ctx), R.pagosReportadosDe(db, c.id_cliente), perfil(ctx)]);
  const aplic = await R.documentosDeAplicacion(db, pagos.map(p => p.id_pago));
  return {resumen: per,
    documentos: docs.map(d => ({id: d.id_documento, numero: d.numero_externo || d.nro_control_interno, factura_fiscal: d.nro_factura_fiscal, tipo: d.tipo_origen === 'FACTURA' ? 'Factura' : 'Nota de entrega', fecha: d.fecha_emision, vence: d.fecha_vencimiento,
      total: dol(d.total_cents), pagado: dol(d.pagado_cents), saldo: d.estado === 'PENDIENTE' ? dol(d.saldo_cents) : 0, estado: d.estado, vencido: d.estado === 'PENDIENTE' && !!d.fecha_vencimiento && d.fecha_vencimiento < hoy, dias: D.diasEntre(d.fecha_emision, hoy)})),
    notas: notas.map(n => ({tipo: n.tipo_nota === 'NOTA_CREDITO' ? 'Nota de crédito' : 'Nota de débito', numero: n.nro_fiscal_nota, fecha: n.fecha_emision, motivo: n.motivo_ajuste, total: dol(n.total_ajuste_cents), sobre: n.nro_factura_fiscal || n.nro_control_interno})),
    pagos: pagos.map(p => ({recibo: C.recibo(p.id_pago), fecha: p.fecha_pago, banco: p.banco, referencia: p.referencia, monto_bs: dol(p.monto_bs_cents), usd: dol(p.usd_cents), aplicado_a: aplic.filter(a => a.id_pago === p.id_pago).map(a => a.numero_externo || a.nro_control_interno)})),
    pedidos, pedidos_venta: await pedidosVentaDe(db, c.id_cliente), reportes: reportes.map(formatoReporte)};
}
/* PDF para el cliente: solo SUS documentos y pedidos (ajeno = no existe) */
export async function pdfDocumento(ctx, id) {
  const d = await VR.getDocumento(ctx.db, id);
  if (!d || d.id_cliente !== ctx.cliente.id_cliente) throw err(404, 'No encontramos ese documento.');
  return VS.datosPdfDocumento(ctx.db, id);
}
export async function pdfPedidoVenta(ctx, id) {
  const p = await PRD.getPedido(ctx.db, id);
  if (!p || p.id_cliente !== ctx.cliente.id_cliente || p.estado === 'ANULADO') throw err(404, 'No encontramos ese pedido.');
  return VS.datosPdfPedido(ctx.db, id);
}
export async function pedidosVentaDe(db, idCliente) {
  return (await PRD.listarPedidos(db, {cliente: idCliente, limite: 50})).filter(p => p.estado !== 'ANULADO').map(p => ({id: p.id_pedido, numero: p.nro, tipo: p.tipo === 'FACTURA' ? 'Factura' : 'Nota de entrega', fecha: p.fecha, estado: p.estado, bultos: p.bultos}));
}
export async function detalleDocumento(ctx, id) {
  const d = await VR.getDocumento(ctx.db, id);
  if (!d || d.id_cliente !== ctx.cliente.id_cliente) throw err(404, 'No encontramos ese documento.');   // ajeno = no existe
  const ls = await VR.lineasDe(ctx.db, id);
  return {numero: d.numero_externo || d.nro_control_interno, factura_fiscal: d.nro_factura_fiscal, tipo: d.tipo_origen === 'FACTURA' ? 'Factura' : 'Nota de entrega', fecha: d.fecha_emision, vence: d.fecha_vencimiento, estado: d.estado,
    subtotal: dol(d.subtotal_base_cents), descuento: dol(d.descuento_cents), iva: dol(d.iva_cents), total: dol(d.total_cents), pagado: dol(d.pagado_cents), saldo: d.estado === 'PENDIENTE' ? dol(d.saldo_cents) : 0, sin_detalle: !!d.sin_lineas,
    lineas: ls.map(l => ({nombre: l.nombre, cantidad: l.cantidad, precio: dol(l.precio_base_cents)}))};
}
const formatoReporte = r => ({id: r.id, codigo: C.codigoReporte(r.id), estado: r.estado, estado_texto: C.ESTADOS_PAGO[r.estado], fecha_pago: r.fecha_pago, banco: r.banco, referencia: r.referencia, monto_bs: dol(r.monto_bs_cents), nota: r.nota, creado: r.creado_ts, motivo_rechazo: r.motivo_rechazo || null,
  recibo: r.id_pago ? C.recibo(r.id_pago) : null, tiene_comprobante: !!r.tiene_comprobante});

export async function reportarPago(ctx, b) {
  const {db, cliente: cli} = ctx, hoy = D.hoyVE();
  const bl = await BS.elegido(db, b && b.id_banco); if (bl) b = {...b, banco: bl.nombre}; // banco elegido de la lista: su nombre manda
  const v = C.validarPagoReportado(b, hoy); if (v.error) throw err(400, v.error);
  let comprobante = null, comprobante_bytes = null;
  if (b.comprobante != null && b.comprobante !== '') {   // foto o captura del comprobante: JPEG ya comprimido en el navegador
    if (typeof b.comprobante === 'string' && b.comprobante.length > ED.MAX_FOTO_CHARS) throw err(413, 'La imagen del comprobante es demasiado grande. Toma otra foto o una captura más pequeña.');
    const m = ED.validarFoto(b.comprobante, null); if (m) throw err(400, 'La imagen del comprobante no es válida. Elige otra foto o captura.');
    comprobante = b.comprobante; comprobante_bytes = ED.bytesDeB64(comprobante);
  }
  const x = v.ok, cfg = await VR.leerConfig(db), max = +cfg.ref_corta_max || 6, bco = D.normBanco(x.banco), refN = D.normRef(x.referencia);
  if (await R.abiertosPagos(db, cli.id_cliente) >= C.MAX_PAGOS_ABIERTOS) throw err(409, 'Ya tienes varios pagos esperando verificación. Espera a que Cobranza los revise.', {codigo: 'MUCHOS_ABIERTOS'});
  // El mensaje es el mismo si la referencia es de otro cliente o tuya: no se cuenta nada de nadie.
  const dup = () => err(409, 'Esa referencia de ese banco ya está registrada. Revisa el número; si es correcto, avisa a quien te atiende.', {codigo: 'DUPLICADO'});
  for (const ex of await VR.posiblesDuplicados(db, bco, refN)) if (D.compararDuplicado({banco: bco, referencia: refN, monto_bs_cents: x.monto_bs_cents}, ex, max) === 'bloquea') throw dup();
  const key = D.dupKey(bco, refN, x.monto_bs_cents, max), id = await R.siguiente(db, 'pago_reportado');
  try {
    await R.lote(db, [R.stPagoReportado(db, {id, id_cliente: cli.id_cliente, fecha_pago: x.fecha_pago, banco: x.banco, id_banco: bl ? bl.id : null, referencia: x.referencia, ref_norm: refN, dup_key: key, monto_bs_cents: x.monto_bs_cents, nota: x.nota, id_enlace: ctx.enlace.id, ejemplo: cli.ejemplo, comprobante, comprobante_bytes}),
      ...auditP(ctx, C.codigoReporte(id), 'reportó un pago', {monto_bs: dol(x.monto_bs_cents), banco: bco, referencia: refN, fecha_pago: x.fecha_pago, con_comprobante: !!comprobante})]);
  } catch (e) { if (/UNIQUE/i.test(String((e && e.message) || e))) throw dup(); throw e; }
  return {id, codigo: C.codigoReporte(id), estado: 'POR_VERIFICAR', mensaje: 'Recibimos tu reporte. Queda por verificar: Cobranza lo revisa y recién entonces se aplica a tus facturas.'};
}

/* ================= Lo que hace el equipo ================= */
export async function resumenEquipo(ctx) { exigir(ctx, 'ver', 'Tu rol no ve esta información.'); return R.resumenEquipo(ctx.db); }

export async function listaClientes(ctx, {q = '', limite = 100} = {}) {
  exigir(ctx, 'verClientes', 'Tu rol no ve clientes.');
  const [cs, cnt] = await Promise.all([VR.buscarClientes(ctx.db, {q, limite}), R.conteosPorCliente(ctx.db)]);
  return cs.map(c => ({id_cliente: c.id_cliente, razon_social: c.razon_social, rif_id: c.rif_id, zona: c.zona, vendedor: c.vendedor_nombre, limite_credito_usd: dol(c.limite_credito_cents), deuda: dol(c.deuda_cents), ejemplo: !!c.ejemplo,
    enlace_activo: cnt.enlaces.has(c.id_cliente), pedidos_por_confirmar: cnt.pedidos.get(c.id_cliente) || 0, pagos_por_verificar: cnt.pagos.get(c.id_cliente) || 0}));
}
export async function fichaCliente(ctx, id) {
  exigir(ctx, 'verClientes', 'Tu rol no ve clientes.');
  const c = await VR.getCliente(ctx.db, id); if (!c) throw err(404, 'Cliente no encontrado.');
  const [enlaces, lista, peds, pags] = await Promise.all([R.enlacesDe(ctx.db, id), R.nombreLista(ctx.db, c.id_lista_base), armarPedidos(ctx.db, await R.pedidosDeCliente(ctx.db, id)), R.pagosReportadosDe(ctx.db, id)]), ahora = Date.now();
  const est = e => e.revocado_ts ? 'Revocado' : (e.vence_ts && e.vence_ts <= ahora) ? 'Vencido' : 'Activo';
  return {cliente: {id_cliente: c.id_cliente, razon_social: c.razon_social, rif_id: c.rif_id, zona: c.zona, telefono: c.telefono, vendedor: c.vendedor_nombre, nivel_precio: lista ? lista.nombre : null, descuento_fijo_pct: c.descuento_fijo_pct,
    dias_pronto_pago: c.dias_pronto_pago, dias_credito_normal: c.dias_credito_normal, limite_credito_usd: dol(c.limite_credito_cents), deuda: dol(c.deuda_cents), ejemplo: !!c.ejemplo},
    enlaces: enlaces.map(e => ({...e, estado: est(e)})), enlace_activo: enlaces.find(e => est(e) === 'Activo') || null,
    pedidos: peds.filter(p => ['POR_CONFIRMAR', 'APROBANDO'].includes(p.estado)), pedidos_recientes: peds.slice(0, 5), pagos: pags.filter(p => ['POR_VERIFICAR', 'VERIFICANDO'].includes(p.estado)).map(formatoReporte), pagos_recientes: pags.slice(0, 5).map(formatoReporte)};
}
export async function generarEnlace(ctx, id, dias) {
  exigir(ctx, 'editarCliente', 'Tu rol no genera enlaces de clientes.');
  const c = await VR.getCliente(ctx.db, id); if (!c) throw err(404, 'Cliente no encontrado.');
  let vence = null;
  if (dias != null && dias !== '') { const n = Number(dias); if (!Number.isInteger(n) || n < 1 || n > 3650) throw err(400, 'Los días de vigencia deben ser un entero entre 1 y 3650, o vacío para que no venza.'); vence = Date.now() + n * 864e5; }
  const codigo = C.nuevoCodigo();
  await R.lote(ctx.db, [R.stRevocarActivos(ctx.db, id, ROL_TXT[ctx.rol] || ctx.rol), R.stNuevoEnlace(ctx.db, {id_cliente: id, token_hash: await C.huella(codigo), token_fin: codigo.slice(-4), creado_rol: ROL_TXT[ctx.rol] || ctx.rol, vence_ts: vence}),
    ...auditE(ctx, 'portal', c.razon_social, c.razon_social, 'generó un enlace del portal', {vence: vence ? new Date(vence).toISOString().slice(0, 10) : 'no vence'})]);
  return {codigo, ruta: '/cliente.html#' + codigo, termina_en: codigo.slice(-4), vence_ts: vence, aviso: 'Este código se muestra solo ahora. Guárdalo o envíalo ya: después no se puede volver a ver (solo generar uno nuevo).'};
}
export async function revocarEnlace(ctx, id) {
  exigir(ctx, 'editarCliente', 'Tu rol no revoca enlaces de clientes.');
  const c = await VR.getCliente(ctx.db, id); if (!c) throw err(404, 'Cliente no encontrado.');
  await R.lote(ctx.db, [R.stRevocarActivos(ctx.db, id, ROL_TXT[ctx.rol] || ctx.rol), ...auditE(ctx, 'portal', c.razon_social, c.razon_social, 'revocó el enlace del portal', {})]);
  return {ok: true};
}

export async function pedidosEquipo(ctx, estado) {
  exigir(ctx, 'ver', 'Tu rol no ve pedidos.');
  const filas = await R.pedidosEquipo(ctx.db, estado === 'TODOS' ? null : (estado || 'POR_CONFIRMAR'));
  const ps = await armarPedidos(ctx.db, filas), prods = await VR.listarProductos(ctx.db), st = new Map(prods.map(p => [p.id_producto, Math.max(0, p.stock_entero - (p.stock_apartado || 0))]));
  const lin = await R.lineasDePedidos(ctx.db, filas.map(p => p.id));
  return ps.map(p => { const f = filas.find(x => x.id === p.id); return {...p, id_cliente: f.id_cliente, cliente: f.razon_social, rif_id: f.rif_id, zona: f.zona, tipo_sugerido: f.modalidad_despacho_pref === 'FACTURA_DIRECTA' ? 'FACTURA' : 'NOTA_ENTREGA', id_documento: f.id_documento,
    resuelto_rol: f.resuelto_rol, alcanza: lin.filter(l => l.id_pedido === p.id).every(l => (st.get(l.id_producto) || 0) >= l.cantidad)}; });
}
export async function aprobarPedido(ctx, id, b = {}) {
  exigir(ctx, 'vender', 'Tu rol no puede aprobar pedidos (genera notas de entrega o facturas).');
  const p = await R.getPedido(ctx.db, id); if (!p) throw err(404, 'Pedido no encontrado.');
  const tipo = b.tipo === 'FACTURA' || b.tipo === 'NOTA_ENTREGA' ? b.tipo : (p.modalidad_despacho_pref === 'FACTURA_DIRECTA' ? 'FACTURA' : 'NOTA_ENTREGA');
  const lineas = (await R.lineasDePedidos(ctx.db, [id])).map(l => ({id_producto: l.id_producto, cantidad: l.cantidad}));
  if (!await R.moverPedido(ctx.db, id, 'POR_CONFIRMAR', 'APROBANDO')) throw err(409, 'Este pedido ya fue atendido por otra persona.');
  let v;
  try { v = await VS.vender(ctx, {id_cliente: p.id_cliente, tipo, lineas, metodo_pago: txt(b.metodo_pago, 40) || undefined, observaciones: 'Pedido del portal ' + C.codigoPedido(id) + (p.nota ? ' · ' + p.nota : '')}); }
  catch (e) { await R.moverPedido(ctx.db, id, 'APROBANDO', 'POR_CONFIRMAR'); throw e; }   // sigue por confirmar: el equipo ve el motivo y decide
  await R.moverPedido(ctx.db, id, 'APROBANDO', 'APROBADO', {ts: Date.now(), rol: ROL_TXT[ctx.rol] || ctx.rol, id_documento: v.id_documento});
  await VR.lote(ctx.db, auditE(ctx, 'portal', C.codigoPedido(id), p.razon_social, 'aprobó el pedido del portal', {documento: v.nro_control_interno, total_usd: v.totales && v.totales.total}));
  return {ok: true, documento: v.nro_control_interno, tipo, totales: v.totales};
}
export async function rechazarPedido(ctx, id, motivo) {
  exigir(ctx, 'vender', 'Tu rol no puede rechazar pedidos.');
  const m = txt(motivo, 200); if (m.length < 3) throw err(400, 'Escribe el motivo (el cliente lo va a ver).');
  const p = await R.getPedido(ctx.db, id); if (!p) throw err(404, 'Pedido no encontrado.');
  if (!await R.moverPedido(ctx.db, id, 'POR_CONFIRMAR', 'RECHAZADO', {ts: Date.now(), rol: ROL_TXT[ctx.rol] || ctx.rol, motivo: m})) throw err(409, 'Este pedido ya fue atendido por otra persona.');
  await VR.lote(ctx.db, auditE(ctx, 'portal', C.codigoPedido(id), p.razon_social, 'rechazó el pedido del portal', {motivo: m}));
  return {ok: true};
}

export async function pagosEquipo(ctx, estado) {
  exigir(ctx, 'verPagos', 'Tu rol no ve pagos.');
  const filas = await R.pagosReportadosEquipo(ctx.db, estado === 'TODOS' ? null : (estado || 'POR_VERIFICAR'));
  return filas.map(r => ({...formatoReporte(r), id_cliente: r.id_cliente, cliente: r.razon_social, rif_id: r.rif_id, zona: r.zona, resuelto_rol: r.resuelto_rol}));
}
/* Comprobante de un pago reportado: lo ve el equipo que verifica pagos (Cobranza, Administración, Dueño…) */
export async function comprobantePago(ctx, id) {
  exigir(ctx, 'verPagos', 'Tu rol no ve pagos.');
  const r = await R.comprobanteDe(ctx.db, id); if (!r) throw err(404, 'Pago reportado no encontrado.');
  if (!r.comprobante) throw err(404, 'Este pago no trae comprobante.');
  return {comprobante: r.comprobante};
}
export async function confirmarPago(ctx, id, b = {}) {
  exigir(ctx, 'cobrar', 'Tu rol no registra pagos.');
  const r = await R.getPagoReportado(ctx.db, id); if (!r) throw err(404, 'Pago reportado no encontrado.');
  if (!await R.moverPagoReportado(ctx.db, id, 'POR_VERIFICAR', 'VERIFICANDO')) throw err(409, 'Este pago ya fue atendido por otra persona.');
  try {
    const tasa = (await T.tasaPara(ctx.db, r.fecha_pago)).valor, usdC = D.usdDeBs(r.monto_bs_cents, tasa);
    const pre = await VS.previsualizar(ctx.db, {id_cliente: r.id_cliente, fecha: r.fecha_pago});
    const rep = D.repartirAntiguoPrimero(usdC, pre.documentos.filter(d => !d.error && d.restante_cents > 0).map(d => ({id_documento: d.id_documento, fecha_emision: d.fecha_emision, pendiente_cents: d.restante_cents})));
    const c = await VS.cobrar(ctx, {id_cliente: r.id_cliente, fecha_pago: r.fecha_pago, monto_bs: r.monto_bs_cents / 100, banco: r.banco, id_banco: (r.id_banco && (await BS.elegido(ctx.db, r.id_banco).catch(() => null))) ? r.id_banco : null, referencia: r.referencia, pin: b.pin, observacion: 'Pago reportado por el cliente en el portal ' + C.codigoReporte(id),
      aplicaciones: rep.aplicaciones.map(a => ({id_documento: a.id_documento, usd: a.usd_cents / 100}))});
    await R.moverPagoReportado(ctx.db, id, 'VERIFICANDO', 'CONFIRMADO', {ts: Date.now(), rol: ROL_TXT[ctx.rol] || ctx.rol, id_pago: c.id_pago});
    await VR.lote(ctx.db, auditE(ctx, 'portal', C.codigoReporte(id), r.razon_social, 'confirmó el pago reportado', {recibo: c.recibo, usd: c.usd}));
    return {ok: true, recibo: c.recibo, usd: c.usd, aplicado: c.aplicado, sin_aplicar: c.sin_aplicar, liquidaciones: c.liquidaciones, avisos: c.avisos};
  } catch (e) { await R.moverPagoReportado(ctx.db, id, 'VERIFICANDO', 'POR_VERIFICAR'); throw e; }   // sigue por verificar
}
export async function rechazarPago(ctx, id, motivo) {
  exigir(ctx, 'cobrar', 'Tu rol no registra pagos.');
  const m = txt(motivo, 200); if (m.length < 3) throw err(400, 'Escribe el motivo (el cliente lo va a ver).');
  const r = await R.getPagoReportado(ctx.db, id); if (!r) throw err(404, 'Pago reportado no encontrado.');
  if (!await R.moverPagoReportado(ctx.db, id, 'POR_VERIFICAR', 'RECHAZADO', {ts: Date.now(), rol: ROL_TXT[ctx.rol] || ctx.rol, motivo: m})) throw err(409, 'Este pago ya fue atendido por otra persona.');
  await VR.lote(ctx.db, auditE(ctx, 'portal', C.codigoReporte(id), r.razon_social, 'rechazó el pago reportado', {motivo: m}));
  return {ok: true};
}

/* Bancos activos con los datos de cuenta para que el cliente pague (solo nombre, moneda, número y titular) */
export const bancosParaCliente = ctx => BS.listaParaCliente(ctx.db);
