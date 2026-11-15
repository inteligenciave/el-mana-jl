/* Capa de acceso a datos del módulo de Ventas: ÚNICO lugar con SQL.
   Las lecturas devuelven filas; las funciones `st*` devuelven sentencias preparadas para que el servicio las junte en UN solo lote atómico. */

const bind = (db, sql, a = []) => db.prepare(sql).bind(...a);
export const all = async (db, sql, a = []) => (await bind(db, sql, a).all()).results;
export const one = (db, sql, a = []) => bind(db, sql, a).first();
export const run = (db, sql, a = []) => bind(db, sql, a).run();
export const lote = (db, stmts) => stmts.length ? db.batch(stmts) : Promise.resolve([]);

/* Cuánto se ha abonado a un documento (solo pagos activos) y su saldo contra el total del documento */
const PAGADO = "COALESCE((SELECT SUM(a.usd_cents) FROM pago_aplicaciones a JOIN pagos p ON p.id_pago = a.id_pago WHERE a.id_documento = d.id_documento AND p.estado = 'ACTIVO'), 0)";
const SALDO = `MAX(0, d.total_cents - ${PAGADO})`;
export const SQL_DEUDA_CLIENTE = `COALESCE((SELECT SUM(${SALDO}) FROM documentos_venta d WHERE d.id_cliente = c.id_cliente AND d.estado = 'PENDIENTE'), 0)`;

/* ---------- Secuencias (asignación atómica de números) ---------- */
export async function siguiente(db, nombre) { const r = await one(db, 'UPDATE secuencias SET n = n + 1 WHERE nombre = ?1 RETURNING n', [nombre]); return r.n; }
export async function reservar(db, nombre, k) { const r = await one(db, 'UPDATE secuencias SET n = n + ?2 WHERE nombre = ?1 RETURNING n', [nombre, k]); return r.n - k + 1; } // primer número del rango
export const fijarSecuencia = (db, nombre, n) => run(db, 'UPDATE secuencias SET n = ?2 WHERE nombre = ?1', [nombre, n]);
export const leerSecuencia = async (db, nombre) => (await one(db, 'SELECT n FROM secuencias WHERE nombre = ?1', [nombre])).n;

/* ---------- Configuración ---------- */
export async function leerConfig(db) { const r = await all(db, 'SELECT clave, valor FROM config'); return Object.fromEntries(r.map(x => [x.clave, x.valor])); }
export const stConfig = (db, clave, valor) => bind(db, 'INSERT INTO config (clave, valor) VALUES (?1, ?2) ON CONFLICT(clave) DO UPDATE SET valor = ?2', [clave, valor == null ? '' : String(valor)]);
export async function leerMatriz(db) { const r = await one(db, "SELECT data FROM docs WHERE col = 'ajustes' AND id = 'matriz'"); try { return r ? JSON.parse(r.data) : null; } catch (e) { return null; } }

/* ---------- Auditoría (tabla propia + reflejo en la colección `auditoria` que ya muestra el sistema) ---------- */
export function stAuditoria(db, {rol, rolTxt, ent, ref, nom, accion, detalle}) {
  const ts = Date.now(), id = 'AU-' + ts.toString(36) + Math.random().toString(36).slice(2, 5);
  return [
    bind(db, 'INSERT INTO auditoria_sistema (ts, rol, ent, ref, accion, detalle) VALUES (?1, ?2, ?3, ?4, ?5, ?6)', [ts, rolTxt || rol, ent, String(ref ?? ''), accion, JSON.stringify(detalle || {})]),
    bind(db, "INSERT INTO docs (col, id, data, updated) VALUES ('auditoria', ?1, ?2, ?3) ON CONFLICT(col, id) DO NOTHING", [id, JSON.stringify({id, ts, rol: rolTxt || rol, ent, ref: String(ref ?? ''), nom: nom || String(ref ?? ''), accion, cambios: detalle || {}}), ts]),
    bind(db, 'UPDATE ver SET v = v + 1 WHERE id = 1')
  ];
}
export const listarAuditoria = (db, limite = 100) => all(db, 'SELECT * FROM auditoria_sistema ORDER BY id DESC LIMIT ?1', [limite]);

/* ---------- Catálogos ---------- */
export const listarProductos = db => all(db, 'SELECT * FROM productos WHERE activo = 1 ORDER BY orden, id_producto');
export const productosPorIds = (db, ids) => ids.length ? all(db, `SELECT * FROM productos WHERE id_producto IN (${ids.map((_, i) => '?' + (i + 1)).join(',')})`, ids) : Promise.resolve([]);
export const getProducto = (db, id) => one(db, 'SELECT * FROM productos WHERE id_producto = ?1', [id]);
export const stActualizarProducto = (db, id, c) => bind(db, 'UPDATE productos SET nombre = ?2, gramaje = ?3, categoria = ?4, imagen_blanca_url = ?5, alicuota_iva = ?6, precio_ref_cents = ?7, codigo_sku = ?8, ejemplo = 0 WHERE id_producto = ?1',
  [id, c.nombre, c.gramaje, c.categoria, c.imagen_blanca_url, c.alicuota_iva, c.precio_ref_cents, c.codigo_sku]);
export const stInsertarProducto = (db, c) => bind(db, 'INSERT INTO productos (codigo_sku, nombre, gramaje, categoria, imagen_blanca_url, stock_entero, alicuota_iva, precio_ref_cents, orden, ejemplo) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)',
  [c.codigo_sku, c.nombre, c.gramaje, c.categoria, c.imagen_blanca_url || null, c.stock_entero || 0, c.alicuota_iva ?? 16, c.precio_ref_cents ?? null, c.orden ?? 99, c.ejemplo ? 1 : 0]);
export const stPesoBulto = (db, id, kg, unid) => bind(db, 'UPDATE productos SET kg_por_bulto = ?2, unidades_por_bulto = ?3 WHERE id_producto = ?1', [id, kg, unid]);
export const stStock = (db, id, delta) => bind(db, 'UPDATE productos SET stock_entero = stock_entero + ?2 WHERE id_producto = ?1', [id, delta]);
export const stMovimiento = (db, m) => bind(db, 'INSERT INTO movimientos_inventario (id_producto, cantidad, tipo, id_documento, fecha, ts, ejemplo) VALUES (?1,?2,?3,?4,?5,?6,?7)', [m.id_producto, m.cantidad, m.tipo, m.id_documento ?? null, m.fecha, Date.now(), m.ejemplo ? 1 : 0]);

export const listarVendedores = db => all(db, 'SELECT * FROM vendedores WHERE activo = 1 ORDER BY nombre');
export const getVendedor = (db, id) => one(db, 'SELECT * FROM vendedores WHERE id = ?1', [id]);
export const vendedorPorNombre = (db, n) => one(db, 'SELECT * FROM vendedores WHERE UPPER(nombre) = UPPER(?1)', [n]);
export const stInsertarVendedor = (db, v) => bind(db, 'INSERT INTO vendedores (nombre, comision_pct, ejemplo) VALUES (?1, ?2, ?3)', [v.nombre, v.comision_pct ?? null, v.ejemplo ? 1 : 0]);
export const stActualizarVendedor = (db, id, v) => bind(db, 'UPDATE vendedores SET nombre = ?2, comision_pct = ?3, ejemplo = 0 WHERE id = ?1', [id, v.nombre, v.comision_pct ?? null]);
export const listarListas = db => all(db, 'SELECT * FROM listas_precio ORDER BY id');

/* ---------- Clientes ---------- */
const COLS_CLI = 'c.*, v.nombre AS vendedor_nombre';
export function buscarClientes(db, {q = '', limite = 50, vendedor = null} = {}) {
  const t = '%' + q.trim().toUpperCase() + '%';
  const tn = '%' + q.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[.,;:()\-_/\'"]/g, ' ').replace(/\s+/g, ' ').trim() + '%'; // igual que razon_norm: el guion cuenta como espacio
  const filtros = ["c.estado_cliente <> 'archivado'"], a = [];
  if (q.trim()) { a.push(tn, t); filtros.push(`(c.razon_norm LIKE ?${a.length - 1} OR UPPER(COALESCE(c.rif_id,'')) LIKE ?${a.length} OR UPPER(c.razon_social) LIKE ?${a.length})`); }
  if (vendedor) { a.push(vendedor); filtros.push(`c.id_vendedor = ?${a.length}`); }
  a.push(limite);
  return all(db, `SELECT ${COLS_CLI}, ${SQL_DEUDA_CLIENTE} AS deuda_cents FROM clientes c LEFT JOIN vendedores v ON v.id = c.id_vendedor ${filtros.length ? 'WHERE ' + filtros.join(' AND ') : ''} ORDER BY c.razon_social LIMIT ?${a.length}`, a);
}
export const getCliente = (db, id) => one(db, `SELECT ${COLS_CLI}, ${SQL_DEUDA_CLIENTE} AS deuda_cents FROM clientes c LEFT JOIN vendedores v ON v.id = c.id_vendedor WHERE c.id_cliente = ?1`, [id]);
export const clientePorNorm = (db, norm) => one(db, 'SELECT * FROM clientes WHERE razon_norm = ?1', [norm]);
export const clientePorRif = (db, rif) => one(db, 'SELECT * FROM clientes WHERE rif_id = ?1', [rif]);
const cliArgs = c => [c.rif_id || null, c.razon_social, c.razon_norm, c.modalidad_despacho_pref || 'NOTA_ENTREGA', c.id_lista_base ?? null, c.descuento_fijo_pct ?? null, c.dias_pronto_pago ?? null, c.dias_credito_normal ?? null, c.limite_credito_cents ?? null, c.id_vendedor ?? null, c.zona || null, c.telefono || null, c.lista_regional || null, c.direccion_entrega || null];
export const stInsertarCliente = (db, c) => bind(db, 'INSERT INTO clientes (rif_id, razon_social, razon_norm, modalidad_despacho_pref, id_lista_base, descuento_fijo_pct, dias_pronto_pago, dias_credito_normal, limite_credito_cents, id_vendedor, zona, telefono, lista_regional, direccion_entrega, origen, ejemplo, creado_ts) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)',
  [...cliArgs(c), c.origen || 'manual', c.ejemplo ? 1 : 0, Date.now()]);
export const stActualizarCliente = (db, id, c) => bind(db, 'UPDATE clientes SET rif_id = ?2, razon_social = ?3, razon_norm = ?4, modalidad_despacho_pref = ?5, id_lista_base = ?6, descuento_fijo_pct = ?7, dias_pronto_pago = ?8, dias_credito_normal = ?9, limite_credito_cents = ?10, id_vendedor = ?11, zona = ?12, telefono = ?13, lista_regional = ?14, direccion_entrega = ?15 WHERE id_cliente = ?1', [id, ...cliArgs(c)]);
export const stSaldoCliente = (db, id) => bind(db, `UPDATE clientes SET saldo_deuda_cents = (SELECT ${SQL_DEUDA_CLIENTE.replace(/c\.id_cliente/g, 'clientes.id_cliente')} ) WHERE id_cliente = ?1`, [id]);
/* Listas regionales: conLista = ids de productos con precios de lista; lp = Map id -> fila de la lista pedida */
export async function contextoListas(db, lista) {
  const rows = await all(db, 'SELECT * FROM precios_lista');
  return {conLista: new Set(rows.map(r => r.id_producto)), lp: new Map(rows.filter(r => r.lista === lista).map(r => [r.id_producto, r]))};
}
export const leerEstadosLista = async db => Object.fromEntries((await all(db, 'SELECT estado, lista FROM estados_lista')).map(r => [r.estado, r.lista]));
export const stEstadoLista = (db, estado, lista) => lista ? bind(db, 'INSERT INTO estados_lista (estado, lista, actualizado_ts) VALUES (?1,?2,?3) ON CONFLICT(estado) DO UPDATE SET lista = ?2, actualizado_ts = ?3', [estado, lista, Date.now()]) : bind(db, 'DELETE FROM estados_lista WHERE estado = ?1', [estado]);
export const reglasDeCliente = (db, id) => all(db, 'SELECT * FROM reglas_precio_tiempo_cliente WHERE id_cliente = ?1', [id]);
export const stUpsertRegla = (db, idCliente, r) => bind(db, `INSERT INTO reglas_precio_tiempo_cliente (id_cliente, id_producto, precio_pronto_pago_cents, precio_base_credito_cents, precio_mora_vencido_cents, pct_descuento_pp, pct_recargo_mora, ejemplo) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)
  ON CONFLICT(id_cliente, id_producto) DO UPDATE SET precio_pronto_pago_cents = ?3, precio_base_credito_cents = ?4, precio_mora_vencido_cents = ?5, pct_descuento_pp = ?6, pct_recargo_mora = ?7, ejemplo = ?8`,
  [idCliente, r.id_producto, r.precio_pronto_pago_cents ?? null, r.precio_base_credito_cents ?? null, r.precio_mora_vencido_cents ?? null, r.pct_descuento_pp ?? null, r.pct_recargo_mora ?? null, r.ejemplo ? 1 : 0]);
export const stBorrarRegla = (db, idCliente, idProducto) => bind(db, 'DELETE FROM reglas_precio_tiempo_cliente WHERE id_cliente = ?1 AND id_producto = ?2', [idCliente, idProducto]);

/* ---------- Documentos ---------- */
export const getDocumento = (db, id) => one(db, `SELECT d.*, ${PAGADO} AS pagado_cents, ${SALDO} AS saldo_cents, c.razon_social, c.rif_id, v.nombre AS vendedor_nombre FROM documentos_venta d JOIN clientes c ON c.id_cliente = d.id_cliente LEFT JOIN vendedores v ON v.id = d.id_vendedor WHERE d.id_documento = ?1`, [id]);
export const lineasDe = (db, id) => all(db, 'SELECT * FROM documento_lineas WHERE id_documento = ?1 ORDER BY id', [id]);
export const documentosPendientesDe = (db, idCliente) => all(db, `SELECT d.*, ${PAGADO} AS pagado_cents, ${SALDO} AS saldo_cents FROM documentos_venta d WHERE d.id_cliente = ?1 AND d.estado = 'PENDIENTE' ORDER BY d.fecha_emision, d.id_documento`, [idCliente]);
export function listarDocumentos(db, {cliente, estado, tipo, desde, hasta, limite = 300} = {}) {
  const f = [], a = [];
  const p = (cond, v) => { a.push(v); f.push(cond.replace('?', '?' + a.length)); };
  if (cliente) p('d.id_cliente = ?', cliente); if (estado) p('d.estado = ?', estado); if (tipo) p('d.tipo_origen = ?', tipo); if (desde) p('d.fecha_emision >= ?', desde); if (hasta) p('d.fecha_emision <= ?', hasta);
  a.push(limite);
  return all(db, `SELECT d.*, ${PAGADO} AS pagado_cents, ${SALDO} AS saldo_cents, c.razon_social, v.nombre AS vendedor_nombre FROM documentos_venta d JOIN clientes c ON c.id_cliente = d.id_cliente LEFT JOIN vendedores v ON v.id = d.id_vendedor ${f.length ? 'WHERE ' + f.join(' AND ') : ''} ORDER BY d.fecha_emision DESC, d.id_documento DESC LIMIT ?${a.length}`, a);
}
export const stInsertarDocumento = (db, d) => bind(db, `INSERT INTO documentos_venta (id_documento, nro_control_interno, nro_factura_fiscal, numero_externo, tipo_origen, estado, fecha_emision, fecha_vencimiento, id_cliente, id_vendedor, subtotal_base_cents, descuento_pct, descuento_cents, iva_cents, total_cents, metodo_pago, observaciones, afecta_inventario, id_ne_origen, sin_lineas, caso_liquidacion, fecha_liquidacion, origen, creado_rol, creado_ts, ejemplo, envio_zona, envio_direccion, lista_precios) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,?26,?27,?28,?29)`,
  [d.id_documento, d.nro_control_interno, d.nro_factura_fiscal ?? null, d.numero_externo ?? null, d.tipo_origen, d.estado || 'PENDIENTE', d.fecha_emision, d.fecha_vencimiento ?? null, d.id_cliente, d.id_vendedor ?? null, d.subtotal_base_cents, d.descuento_pct ?? null, d.descuento_cents || 0, d.iva_cents || 0, d.total_cents, d.metodo_pago ?? null, d.observaciones ?? null, d.afecta_inventario ?? 1, d.id_ne_origen ?? null, d.sin_lineas ? 1 : 0, d.caso_liquidacion ?? null, d.fecha_liquidacion ?? null, d.origen || 'manual', d.creado_rol ?? null, Date.now(), d.ejemplo ? 1 : 0, d.envio_zona ?? null, d.envio_direccion ?? null, d.lista_precios ?? null]);
export const stInsertarLinea = (db, idDoc, l, ejemplo) => bind(db, 'INSERT INTO documento_lineas (id_documento, id_producto, sku, nombre, cantidad, precio_base_cents, precio_pp_cents, precio_mora_cents, alicuota, ejemplo, kg_por_bulto) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)',
  [idDoc, l.id_producto, l.sku, l.nombre, l.cantidad, l.precio_base_cents, l.precio_pp_cents, l.precio_mora_cents, l.alicuota, ejemplo ? 1 : 0, l.kg_por_bulto ?? null]);
export const stDocPedido = (db, idDoc, idPedido, idSalida) => bind(db, 'UPDATE documentos_venta SET id_pedido = ?2, id_salida = ?3 WHERE id_documento = ?1', [idDoc, idPedido, idSalida]);
export const disponiblePorProducto = db => all(db, 'SELECT id_producto, stock_entero, stock_apartado FROM productos');
export const stEstadoDocumento = (db, id, estado, caso, fecha) => bind(db, 'UPDATE documentos_venta SET estado = ?2, caso_liquidacion = ?3, fecha_liquidacion = ?4 WHERE id_documento = ?1', [id, estado, caso ?? null, fecha ?? null]);
export const stInsertarNotaAjuste = (db, n) => bind(db, 'INSERT INTO notas_ajuste_fiscal (id_nota_ajuste, id_factura_origen, tipo_nota, nro_fiscal_nota, fecha_emision, motivo_ajuste, base_imponible_ajuste_cents, iva_ajuste_cents, total_ajuste_cents, id_pago, ejemplo) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)',
  [n.id_nota_ajuste, n.id_factura_origen, n.tipo_nota, n.nro_fiscal_nota, n.fecha_emision, n.motivo_ajuste, n.base, n.iva, n.total, n.id_pago ?? null, n.ejemplo ? 1 : 0]);
export const notasDe = (db, idFactura) => all(db, 'SELECT * FROM notas_ajuste_fiscal WHERE id_factura_origen = ?1', [idFactura]);
export const facturaDeNE = (db, idNE) => one(db, 'SELECT * FROM documentos_venta WHERE id_ne_origen = ?1', [idNE]);
export const stAsiento = (db, a) => bind(db, 'INSERT INTO asientos_contables (fecha, id_documento, id_pago, concepto, lineas, ejemplo) VALUES (?1,?2,?3,?4,?5,?6)', [a.fecha, a.id_documento ?? null, a.id_pago ?? null, a.concepto, JSON.stringify(a.lineas), a.ejemplo ? 1 : 0]);
export const listarAsientos = (db, {desde, hasta, limite = 300} = {}) => all(db, 'SELECT * FROM asientos_contables WHERE (?1 IS NULL OR fecha >= ?1) AND (?2 IS NULL OR fecha <= ?2) ORDER BY id DESC LIMIT ?3', [desde || null, hasta || null, limite]);
export const stComision = (db, c) => bind(db, 'INSERT INTO comisiones (id_documento, id_pago, id_vendedor, base_neta_cents, pct, monto_cents, fecha, ejemplo) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)', [c.id_documento, c.id_pago ?? null, c.id_vendedor ?? null, c.base_neta_cents, c.pct ?? null, c.monto_cents ?? null, c.fecha, c.ejemplo ? 1 : 0]);
export const listarComisiones = (db, {desde, hasta, vendedor, limite = 500} = {}) => all(db, `SELECT m.*, v.nombre AS vendedor_nombre, d.nro_control_interno, c.razon_social FROM comisiones m LEFT JOIN vendedores v ON v.id = m.id_vendedor JOIN documentos_venta d ON d.id_documento = m.id_documento JOIN clientes c ON c.id_cliente = d.id_cliente
  WHERE (?1 IS NULL OR m.fecha >= ?1) AND (?2 IS NULL OR m.fecha <= ?2) AND (?3 IS NULL OR m.id_vendedor = ?3) ORDER BY m.id DESC LIMIT ?4`, [desde || null, hasta || null, vendedor || null, limite]);
export const movimientosDe = (db, idDoc) => all(db, 'SELECT * FROM movimientos_inventario WHERE id_documento = ?1', [idDoc]);

/* ---------- Pagos ---------- */
export const stInsertarPago = (db, p) => bind(db, `INSERT INTO pagos (id_pago, fecha_pago, id_cliente, id_vendedor, monto_bs_cents, tasa, usd_cents, banco, referencia, ref_norm, dup_key, observacion, retroactivo, exonera_mora, origen, creado_rol, creado_ts, ejemplo, id_banco) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19)`,
  [p.id_pago, p.fecha_pago, p.id_cliente, p.id_vendedor ?? null, p.monto_bs_cents, p.tasa, p.usd_cents, p.banco ?? null, p.referencia ?? null, p.ref_norm ?? null, p.dup_key ?? null, p.observacion ?? null, p.retroactivo ? 1 : 0, p.exonera_mora ? 1 : 0, p.origen || 'manual', p.creado_rol ?? null, Date.now(), p.ejemplo ? 1 : 0, p.id_banco ?? null]);
export const stAplicacion = (db, a) => bind(db, 'INSERT INTO pago_aplicaciones (id_pago, id_documento, usd_cents, liquido, ejemplo) VALUES (?1,?2,?3,?4,?5)', [a.id_pago, a.id_documento, a.usd_cents, a.liquido ? 1 : 0, a.ejemplo ? 1 : 0]);
export const getPago = (db, id) => one(db, 'SELECT p.*, c.razon_social, c.rif_id, v.nombre AS vendedor_nombre FROM pagos p JOIN clientes c ON c.id_cliente = p.id_cliente LEFT JOIN vendedores v ON v.id = p.id_vendedor WHERE p.id_pago = ?1', [id]);
export const aplicacionesDe = (db, idPago) => all(db, 'SELECT a.*, d.nro_control_interno, d.nro_factura_fiscal, d.tipo_origen, d.fecha_emision, d.numero_externo, d.estado AS doc_estado, d.total_cents FROM pago_aplicaciones a JOIN documentos_venta d ON d.id_documento = a.id_documento WHERE a.id_pago = ?1 ORDER BY a.id', [idPago]);
export const posiblesDuplicados = (db, banco, refNorm) => all(db, `SELECT p.*, c.razon_social FROM pagos p JOIN clientes c ON c.id_cliente = p.id_cliente WHERE p.estado = 'ACTIVO' AND p.banco = ?1 AND p.ref_norm IS NOT NULL AND (p.ref_norm = ?2 OR p.ref_norm LIKE ?3 OR (length(p.ref_norm) >= 3 AND instr(?2, p.ref_norm) > 0)) LIMIT 20`, [banco, refNorm, '%' + refNorm]);
export const clavesExistentes = async (db, claves) => { const out = new Set(); for (let i = 0; i < claves.length; i += 80) { const part = claves.slice(i, i + 80); (await all(db, `SELECT dup_key FROM pagos WHERE estado = 'ACTIVO' AND dup_key IN (${part.map((_, k) => '?' + (k + 1)).join(',')})`, part)).forEach(r => out.add(r.dup_key)); } return out; };
export const stAnularPago = (db, id, motivo, rol) => bind(db, "UPDATE pagos SET estado = 'ANULADO', motivo_anulacion = ?2, anulado_ts = ?3, anulado_rol = ?4 WHERE id_pago = ?1 AND estado = 'ACTIVO'", [id, motivo, Date.now(), rol]);
export function listarPagos(db, {desde, hasta, vendedor, q, estado, cliente, limite = 2000} = {}) {
  const f = [], a = [];
  const p = (cond, v) => { a.push(v); f.push(cond.split('?').join('?' + a.length)); };
  if (desde) p('p.fecha_pago >= ?', desde); if (hasta) p('p.fecha_pago <= ?', hasta); if (vendedor) p('p.id_vendedor = ?', vendedor); if (estado) p('p.estado = ?', estado); if (cliente) p('p.id_cliente = ?', cliente);
  if (q && q.trim()) { const t = '%' + q.trim().toUpperCase() + '%'; a.push(t); f.push(`(c.razon_norm LIKE ?${a.length} OR UPPER(COALESCE(p.referencia,'')) LIKE ?${a.length})`); }
  a.push(limite);
  return all(db, `SELECT p.*, c.razon_social, c.rif_id AS cliente_rif, v.nombre AS vendedor_nombre, (SELECT group_concat(d.nro_control_interno || ' ' || COALESCE(d.numero_externo, '') || ' ' || COALESCE(d.nro_factura_fiscal, ''), '|') FROM pago_aplicaciones a JOIN documentos_venta d ON d.id_documento = a.id_documento WHERE a.id_pago = p.id_pago) AS docs_txt, (SELECT group_concat(COALESCE(d.numero_externo, d.nro_control_interno), ', ') FROM pago_aplicaciones a JOIN documentos_venta d ON d.id_documento = a.id_documento WHERE a.id_pago = p.id_pago) AS notas,
    (SELECT COALESCE(SUM(a.usd_cents),0) FROM pago_aplicaciones a WHERE a.id_pago = p.id_pago) AS aplicado_cents FROM pagos p JOIN clientes c ON c.id_cliente = p.id_cliente LEFT JOIN vendedores v ON v.id = p.id_vendedor ${f.length ? 'WHERE ' + f.join(' AND ') : ''} ORDER BY p.fecha_pago DESC, p.id_pago DESC LIMIT ?${a.length}`, a);
}
export const pendientesParaDeuda = (db, {vendedor, q, qn} = {}) => {
  const f = ["d.estado = 'PENDIENTE'"], a = [];
  if (vendedor) { a.push(vendedor); f.push('d.id_vendedor = ?' + a.length); }
  if (q && q.trim()) { /* nombre (sin tildes) o RIF del cliente, o número de nota/factura (interno, externo o fiscal) */
    a.push('%' + (qn || q).trim().toUpperCase() + '%'); const n = a.length; a.push('%' + q.trim().toUpperCase() + '%'); const r = a.length;
    f.push(`(c.razon_norm LIKE ?${n} OR UPPER(COALESCE(c.rif_id,'')) LIKE ?${r} OR UPPER(d.nro_control_interno) LIKE ?${r} OR UPPER(COALESCE(d.numero_externo,'')) LIKE ?${r} OR UPPER(COALESCE(d.nro_factura_fiscal,'')) LIKE ?${r})`);
  }
  return all(db, `SELECT d.id_documento, c.rif_id, d.nro_control_interno, d.numero_externo, d.tipo_origen, d.fecha_emision, d.total_cents, d.sin_lineas, d.id_cliente, c.razon_social, c.zona, v.nombre AS vendedor_nombre, ${SALDO} AS saldo_cents FROM documentos_venta d JOIN clientes c ON c.id_cliente = d.id_cliente LEFT JOIN vendedores v ON v.id = d.id_vendedor WHERE ${f.join(' AND ')} ORDER BY c.razon_social, d.fecha_emision`, a);
};
export const contarLiquidadosPor = (db, idPago) => one(db, "SELECT COUNT(*) AS n FROM pago_aplicaciones a JOIN documentos_venta d ON d.id_documento = a.id_documento WHERE a.id_pago = ?1 AND a.liquido = 1 AND d.sin_lineas = 0", [idPago]);

/* ---------- Datos de ejemplo: borrar solo lo marcado ---------- */
export async function borrarEjemplo(db) {
  const tablas = ['pago_aplicaciones', 'comisiones', 'asientos_contables', 'notas_ajuste_fiscal', 'documento_lineas', 'pagos', 'documentos_venta', 'reglas_precio_tiempo_cliente'];
  const st = [];
  // las existencias vuelven a lo que eran antes de las ventas y entradas de ejemplo
  st.push(bind(db, 'UPDATE productos SET stock_entero = MAX(0, stock_entero - COALESCE((SELECT SUM(m.cantidad) FROM movimientos_inventario m WHERE m.id_producto = productos.id_producto AND m.ejemplo = 1), 0)) WHERE ejemplo = 0'));
  st.push(bind(db, 'DELETE FROM movimientos_inventario WHERE ejemplo = 1'));
  for (const t of tablas) st.push(bind(db, `DELETE FROM ${t} WHERE ejemplo = 1`));
  st.push(bind(db, 'DELETE FROM clientes WHERE ejemplo = 1'));
  st.push(bind(db, 'DELETE FROM vendedores WHERE ejemplo = 1 AND id NOT IN (SELECT id_vendedor FROM clientes WHERE id_vendedor IS NOT NULL) AND id NOT IN (SELECT id_vendedor FROM documentos_venta WHERE id_vendedor IS NOT NULL)'));
  st.push(bind(db, 'DELETE FROM listas_precio WHERE ejemplo = 1 AND id NOT IN (SELECT id_lista_base FROM clientes WHERE id_lista_base IS NOT NULL)'));
  st.push(bind(db, 'DELETE FROM productos WHERE ejemplo = 1 AND id_producto NOT IN (SELECT id_producto FROM documento_lineas) AND id_producto NOT IN (SELECT id_producto FROM reglas_precio_tiempo_cliente)'));
  await lote(db, st);
  const q = async s => (await one(db, s)).n;
  return {clientes: await q('SELECT COUNT(*) n FROM clientes'), productosEjemploRestantes: await q('SELECT COUNT(*) n FROM productos WHERE ejemplo = 1')};
}
export const contarEjemplo = async db => ({clientes: (await one(db, 'SELECT COUNT(*) n FROM clientes WHERE ejemplo = 1')).n, documentos: (await one(db, 'SELECT COUNT(*) n FROM documentos_venta WHERE ejemplo = 1')).n, pagos: (await one(db, 'SELECT COUNT(*) n FROM pagos WHERE ejemplo = 1')).n, productos: (await one(db, 'SELECT COUNT(*) n FROM productos WHERE ejemplo = 1')).n});
