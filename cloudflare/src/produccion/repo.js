/* Producción por zonas · capa de datos: ÚNICO lugar con SQL de pedidos de venta, salidas, pausas y turnos.
   Las funciones `st*` devuelven sentencias preparadas para juntarlas en UN solo lote atómico (como en Ventas). */
import {all, one, run, lote} from '../ventas/repo.js';
export {all, one, run, lote};
const bind = (db, sql, a = []) => db.prepare(sql).bind(...a);

/* ---------- Pedidos de venta ---------- */
export const stInsertarPedido = (db, p) => bind(db, `INSERT INTO pedidos_venta (id_pedido, nro, id_cliente, estado_ve, zona, estado, tipo, fecha, creado_ts, creado_rol, creado_rol_cod, id_vendedor, descuento_pct, metodo_pago, observaciones, lista_precios, pago_json, ejemplo) VALUES (?1,?2,?3,?4,?5,'PENDIENTE',?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)`,
  [p.id_pedido, p.nro, p.id_cliente, p.estado_ve ?? null, p.zona, p.tipo, p.fecha, Date.now(), p.creado_rol ?? null, p.creado_rol_cod ?? null, p.id_vendedor ?? null, p.descuento_pct ?? null, p.metodo_pago ?? null, p.observaciones ?? null, p.lista_precios ?? null, p.pago_json ?? null, p.ejemplo ? 1 : 0]);
export const stInsertarPedidoLinea = (db, idPedido, l) => bind(db, 'INSERT INTO pedido_venta_lineas (id_pedido, id_producto, sku, nombre, bultos, kg_por_bulto, precio_base_cents, precio_pp_cents, precio_mora_cents, alicuota) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)',
  [idPedido, l.id_producto, l.sku, l.nombre, l.cantidad, l.kg_por_bulto, l.precio_base_cents, l.precio_pp_cents, l.precio_mora_cents, l.alicuota]);
export const getPedido = (db, id) => one(db, 'SELECT p.*, c.razon_social, c.rif_id FROM pedidos_venta p JOIN clientes c ON c.id_cliente = p.id_cliente WHERE p.id_pedido = ?1', [id]);
export const lineasDePedido = (db, id) => all(db, 'SELECT * FROM pedido_venta_lineas WHERE id_pedido = ?1 ORDER BY id', [id]);
/* Lo que un cliente ya tiene pedido y sin despachar (compromete su crédito): total estimado de lo pendiente, en centavos */
export async function comprometidoCliente(db, idCliente) {
  const rows = await all(db, `SELECT p.id_pedido, p.descuento_pct, l.bultos - l.bultos_despachados - l.bultos_anulados AS pend, l.precio_base_cents, l.alicuota FROM pedidos_venta p JOIN pedido_venta_lineas l ON l.id_pedido = p.id_pedido WHERE p.id_cliente = ?1 AND p.estado IN ('PENDIENTE','PARCIAL')`, [idCliente]);
  return rows;
}
/* Líneas pendientes de todos los pedidos abiertos (opcionalmente de una zona), con datos del pedido, el cliente y lo ya puesto en salidas armándose */
export function lineasPendientes(db, zona = null) {
  return all(db, `SELECT l.*, pr.categoria, p.nro, p.zona, p.fecha, p.estado AS estado_pedido, p.id_cliente, p.descuento_pct, p.tipo, p.creado_rol, p.pago_json IS NOT NULL AS paga_ahora, c.razon_social,
    COALESCE((SELECT SUM(sl.bultos) FROM salida_lineas sl JOIN salidas s ON s.id_salida = sl.id_salida WHERE sl.id_linea = l.id AND s.estado = 'ARMANDO'), 0) AS en_salida
    FROM pedido_venta_lineas l JOIN pedidos_venta p ON p.id_pedido = l.id_pedido JOIN clientes c ON c.id_cliente = p.id_cliente LEFT JOIN productos pr ON pr.id_producto = l.id_producto
    WHERE p.estado IN ('PENDIENTE','PARCIAL') AND l.bultos - l.bultos_despachados - l.bultos_anulados > 0 AND (?1 IS NULL OR p.zona = ?1) ORDER BY p.fecha, p.id_pedido, l.id`, [zona]);
}
export const lineaConPedido = (db, idLinea) => one(db, `SELECT l.*, p.zona, p.estado AS estado_pedido, p.nro, p.id_cliente, p.fecha, p.descuento_pct, p.tipo, p.creado_rol, p.creado_rol_cod, p.pago_json, p.metodo_pago, p.observaciones, p.lista_precios, p.id_vendedor,
  COALESCE((SELECT SUM(sl.bultos) FROM salida_lineas sl JOIN salidas s ON s.id_salida = sl.id_salida WHERE sl.id_linea = l.id AND s.estado = 'ARMANDO'), 0) AS en_salida
  FROM pedido_venta_lineas l JOIN pedidos_venta p ON p.id_pedido = l.id_pedido WHERE l.id = ?1`, [idLinea]);
export const stAnularLineaPendiente = (db, idLinea) => bind(db, 'UPDATE pedido_venta_lineas SET bultos_anulados = bultos - bultos_despachados WHERE id = ?1', [idLinea]);
export const stEstadoPedido = (db, id, estado) => bind(db, 'UPDATE pedidos_venta SET estado = ?2 WHERE id_pedido = ?1', [id, estado]);
/* Recalcula el estado del pedido según lo que falta: despachado si no queda nada, parcial si ya salió algo */
export const stRecalcularPedido = (db, id) => bind(db, `UPDATE pedidos_venta SET estado = CASE
  WHEN (SELECT COALESCE(SUM(bultos - bultos_despachados - bultos_anulados), 0) FROM pedido_venta_lineas WHERE id_pedido = ?1) = 0 THEN 'DESPACHADO'
  WHEN (SELECT COALESCE(SUM(bultos_despachados), 0) FROM pedido_venta_lineas WHERE id_pedido = ?1) > 0 THEN 'PARCIAL' ELSE 'PENDIENTE' END WHERE id_pedido = ?1 AND estado <> 'ANULADO'`, [id]);
export const stDespacharLinea = (db, idLinea, n) => bind(db, 'UPDATE pedido_venta_lineas SET bultos_despachados = bultos_despachados + ?2 WHERE id = ?1', [idLinea, n]);
export const stLimpiarPago = (db, idPedido) => bind(db, 'UPDATE pedidos_venta SET pago_json = NULL WHERE id_pedido = ?1', [idPedido]);
export const stApartado = (db, idProducto, delta) => bind(db, 'UPDATE productos SET stock_apartado = stock_apartado + ?2 WHERE id_producto = ?1', [idProducto, delta]);
export const listarPedidos = (db, {estado, zona, cliente, limite = 200} = {}) => all(db, `SELECT p.*, c.razon_social, (SELECT COALESCE(SUM(l.bultos),0) FROM pedido_venta_lineas l WHERE l.id_pedido = p.id_pedido) AS bultos,
  (SELECT COALESCE(SUM(l.bultos * l.kg_por_bulto),0) FROM pedido_venta_lineas l WHERE l.id_pedido = p.id_pedido) AS kilos FROM pedidos_venta p JOIN clientes c ON c.id_cliente = p.id_cliente
  WHERE (?1 IS NULL OR p.estado = ?1) AND (?2 IS NULL OR p.zona = ?2) AND (?3 IS NULL OR p.id_cliente = ?3) ORDER BY p.id_pedido DESC LIMIT ?4`, [estado || null, zona || null, cliente || null, limite]);
export const salidasArmandoDePedido = (db, idPedido) => one(db, "SELECT COUNT(*) AS n FROM salida_lineas sl JOIN salidas s ON s.id_salida = sl.id_salida WHERE sl.id_pedido = ?1 AND s.estado = 'ARMANDO'", [idPedido]);

/* ---------- Ajustes (tabla config de Ventas) ---------- */
export const stConfig = (db, clave, valor) => bind(db, 'INSERT INTO config (clave, valor) VALUES (?1, ?2) ON CONFLICT(clave) DO UPDATE SET valor = ?2', [clave, valor == null ? '' : String(valor)]);
export async function leerAjustes(db) {
  const r = await all(db, "SELECT clave, valor FROM config WHERE clave IN ('meta_zona_kg','cap_papa_kg','cap_salsa_kg','semaforo_ambar_kg','tolerancia_cierre_kg','conteo_inicial_ts','herencia_desde_ts','carga_desde_ts')");
  const c = Object.fromEntries(r.map(x => [x.clave, x.valor]));
  return {herenciaDesde: +c.herencia_desde_ts || 0, cargaDesde: +c.carga_desde_ts || 0, meta: +c.meta_zona_kg || 0, capPapa: +c.cap_papa_kg || 0, capSalsa: +c.cap_salsa_kg || 0, corteAmbar: +c.semaforo_ambar_kg || 0, tolerancia: +c.tolerancia_cierre_kg || 0, conteoInicialTs: +c.conteo_inicial_ts || 0};
}

/* ---------- Líneas de despacho ---------- */
export const listarLineas = db => all(db, 'SELECT * FROM lineas_despacho ORDER BY orden, nombre COLLATE NOCASE');
export const getLinea = (db, id) => one(db, 'SELECT * FROM lineas_despacho WHERE id_linea = ?1', [id]);
export const zonasAsignadas = db => all(db, 'SELECT zona, id_linea FROM linea_zonas ORDER BY zona');
export const stCrearLinea = (db, nombre, rol, ejemplo = 0) => bind(db, 'INSERT INTO lineas_despacho (nombre, orden, creado_ts, creado_rol, ejemplo) VALUES (?1, (SELECT COALESCE(MAX(orden), 0) + 1 FROM lineas_despacho), ?2, ?3, ?4)', [nombre, Date.now(), rol, ejemplo ? 1 : 0]);
export const stRenombrarLinea = (db, id, nombre) => bind(db, 'UPDATE lineas_despacho SET nombre = ?2, actualizado_ts = ?3 WHERE id_linea = ?1', [id, nombre, Date.now()]);
export const stBorrarLinea = (db, id) => bind(db, 'DELETE FROM lineas_despacho WHERE id_linea = ?1', [id]);
export const stAsignarZona = (db, zona, id, rol) => bind(db, 'INSERT OR REPLACE INTO linea_zonas (zona, id_linea, desde_ts, rol) VALUES (?1, ?2, ?3, ?4)', [zona, id, Date.now(), rol]);
export const stAsignarZonaANueva = (db, zona, nombre, rol) => bind(db, 'INSERT OR REPLACE INTO linea_zonas (zona, id_linea, desde_ts, rol) VALUES (?1, (SELECT id_linea FROM lineas_despacho WHERE nombre = ?2 COLLATE NOCASE), ?3, ?4)', [zona, nombre, Date.now(), rol]);
export const stQuitarZonasDeLinea = (db, id) => bind(db, 'DELETE FROM linea_zonas WHERE id_linea = ?1', [id]);
export const stQuitarZona = (db, zona) => bind(db, 'DELETE FROM linea_zonas WHERE zona = ?1', [zona]);
export const zonasConocidas = db => all(db, "SELECT DISTINCT zona FROM (SELECT zona FROM pedidos_venta UNION SELECT zona FROM salidas UNION SELECT zona FROM zona_pausas) WHERE zona IS NOT NULL AND zona <> ''");
/* Pedidos metidos en salidas armadas (ARMANDO) de una línea: sirven para no mover una zona mientras haya salida armada con sus pedidos */
export const zonasEnSalidasDeLinea = (db, idLinea) => all(db, "SELECT DISTINCT p.zona, s.nro FROM salidas s JOIN salida_lineas sl ON sl.id_salida = s.id_salida JOIN pedidos_venta p ON p.id_pedido = sl.id_pedido WHERE s.id_linea = ?1 AND s.estado = 'ARMANDO'", [idLinea]);
export const salidasArmandoDeGrupo = (db, idLinea, zona) => all(db, "SELECT * FROM salidas WHERE estado = 'ARMANDO' AND ((?1 IS NOT NULL AND id_linea = ?1) OR (?1 IS NULL AND id_linea IS NULL AND zona = ?2))", [idLinea ?? null, zona ?? null]);

/* ---------- Pausas ---------- */
export const pausasActivas = db => all(db, 'SELECT * FROM zona_pausas WHERE reanudada_ts IS NULL ORDER BY id');
export const stPausar = (db, zona, motivo, rol) => bind(db, 'INSERT INTO zona_pausas (zona, motivo, desde_ts, rol) VALUES (?1,?2,?3,?4)', [zona, motivo, Date.now(), rol]);
export const stReanudar = (db, zona, rol) => bind(db, 'UPDATE zona_pausas SET reanudada_ts = ?2, reanuda_rol = ?3 WHERE zona = ?1 AND reanudada_ts IS NULL', [zona, Date.now(), rol]);

/* ---------- Salidas ---------- */
export const stInsertarSalida = (db, s) => bind(db, "INSERT INTO salidas (id_salida, nro, zona, estado, kilos, meta_kg, motivo, creado_ts, creado_rol, id_linea, kg_papa, kg_salsa, ocupacion_pct, cap_papa_kg, cap_salsa_kg) VALUES (?1,?2,?3,'ARMANDO',?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)", [s.id_salida, s.nro, s.zona, s.kilos, s.meta_kg ?? null, s.motivo ?? null, Date.now(), s.creado_rol ?? null, s.id_linea ?? null, s.kg_papa ?? null, s.kg_salsa ?? null, s.ocupacion_pct ?? null, s.cap_papa_kg ?? null, s.cap_salsa_kg ?? null]);
export const stInsertarSalidaLinea = (db, idSalida, l) => bind(db, 'INSERT INTO salida_lineas (id_salida, id_pedido, id_linea, id_producto, bultos, kilos) VALUES (?1,?2,?3,?4,?5,?6)', [idSalida, l.id_pedido, l.id_linea, l.id_producto, l.bultos, l.kilos]);
export const getSalida = (db, id) => one(db, 'SELECT * FROM salidas WHERE id_salida = ?1', [id]);
export const lineasDeSalida = (db, id) => all(db, `SELECT sl.*, l.nombre, l.sku, l.kg_por_bulto, l.precio_base_cents, l.precio_pp_cents, l.precio_mora_cents, l.alicuota, p.nro AS nro_pedido, p.id_cliente, c.razon_social FROM salida_lineas sl JOIN pedido_venta_lineas l ON l.id = sl.id_linea JOIN pedidos_venta p ON p.id_pedido = sl.id_pedido JOIN clientes c ON c.id_cliente = p.id_cliente WHERE sl.id_salida = ?1 ORDER BY sl.id_pedido, sl.id`, [id]);
export const documentosDeSalida = (db, id) => all(db, 'SELECT sd.id_pedido, sd.id_documento, d.nro_control_interno, d.tipo_origen, d.total_cents FROM salida_documentos sd JOIN documentos_venta d ON d.id_documento = sd.id_documento WHERE sd.id_salida = ?1', [id]);
export const stSalidaDespachada = (db, id, vehiculo, chofer, motivo, rol, vehiculoId = null, choferId = null) => bind(db, "UPDATE salidas SET estado = 'DESPACHADA', vehiculo = ?2, chofer = ?3, motivo = ?4, despachada_ts = ?5, despachada_rol = ?6, vehiculo_id = ?7, chofer_id = ?8 WHERE id_salida = ?1 AND estado = 'ARMANDO'", [id, vehiculo || null, chofer || null, motivo || null, Date.now(), rol, vehiculoId, choferId]);
export const stSalidaAnulada = (db, id) => bind(db, "UPDATE salidas SET estado = 'ANULADA' WHERE id_salida = ?1 AND estado = 'ARMANDO'", [id]);
/* Conteo al cargar el camión */
export const stCargarSalida = (db, id, rol) => bind(db, "UPDATE salidas SET cargada_ts = ?2, cargada_rol = ?3 WHERE id_salida = ?1 AND estado = 'ARMANDO' AND cargada_ts IS NULL", [id, Date.now(), rol]);
export const stCargaLinea = (db, idSalida, idLinea, n) => bind(db, 'UPDATE salida_lineas SET bultos_cargados = ?3 WHERE id_salida = ?1 AND id_linea = ?2', [idSalida, idLinea, n]);
export const stAnularCarga = (db, idSalida) => [bind(db, "UPDATE salidas SET cargada_ts = NULL, cargada_rol = NULL WHERE id_salida = ?1 AND estado = 'ARMANDO'", [idSalida]), bind(db, 'UPDATE salida_lineas SET bultos_cargados = NULL WHERE id_salida = ?1', [idSalida])];
export const difDeSalida = (db, idSalida) => all(db, "SELECT * FROM diferencias WHERE etapa = 'carga' AND origen_tipo = 'salida' AND origen_id = ?1 AND estado IN ('PENDIENTE','APROBADA') ORDER BY id DESC", [String(idSalida)]);
export const stDocumentoDeSalida = (db, idSalida, idPedido, idDocumento) => bind(db, 'INSERT INTO salida_documentos (id_salida, id_pedido, id_documento) VALUES (?1,?2,?3)', [idSalida, idPedido, idDocumento]);
export const listarSalidas = (db, {estado, limite = 100} = {}) => all(db, `SELECT s.*, (SELECT COUNT(DISTINCT sl.id_pedido) FROM salida_lineas sl WHERE sl.id_salida = s.id_salida) AS pedidos, (SELECT COALESCE(SUM(sl.bultos),0) FROM salida_lineas sl WHERE sl.id_salida = s.id_salida) AS bultos,
  (SELECT group_concat(d.nro_control_interno, ', ') FROM salida_documentos sd JOIN documentos_venta d ON d.id_documento = sd.id_documento WHERE sd.id_salida = s.id_salida) AS documentos
  FROM salidas s WHERE (?1 IS NULL OR s.estado = ?1) ORDER BY s.id_salida DESC LIMIT ?2`, [estado || null, limite]);

/* ---------- Turnos ---------- */
export const turnoAbierto = db => one(db, "SELECT * FROM turnos WHERE estado = 'ABIERTO'");
export const getTurno = (db, id) => one(db, 'SELECT * FROM turnos WHERE id_turno = ?1', [id]);
export const listarTurnos = (db, limite = 10) => all(db, 'SELECT * FROM turnos ORDER BY id_turno DESC LIMIT ?1', [limite]);
export const stAbrirTurno = (db, fecha, rol, obs) => bind(db, "INSERT INTO turnos (fecha, estado, abierto_ts, abierto_rol, observaciones) VALUES (?1,'ABIERTO',?2,?3,?4)", [fecha, Date.now(), rol, obs || null]);
/* enEspera = true: queda EN_ESPERA atado a la diferencia que se insertó justo antes en el mismo lote (last_insert_rowid) */
export const stMovProceso = (db, idTurno, etapa, sentido, kilos, nota, rol, {enEspera = false, ajuste = 0} = {}) => bind(db, `INSERT INTO movimientos_proceso (id_turno, etapa, sentido, kilos, nota, rol, ts, estado, id_diferencia, ajuste) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,${enEspera ? 'last_insert_rowid()' : 'NULL'},?9)`, [idTurno, etapa, sentido, kilos, nota || null, rol, Date.now(), enEspera ? 'EN_ESPERA' : 'VIGENTE', ajuste]);
export const stEmpaque = (db, idTurno, idProducto, bultos, rol, {enEspera = false} = {}) => bind(db, `INSERT INTO empaque_turno (id_turno, id_producto, bultos, rol, ts, estado, id_diferencia) VALUES (?1,?2,?3,?4,?5,?6,${enEspera ? 'last_insert_rowid()' : 'NULL'})`, [idTurno, idProducto, bultos, rol, Date.now(), enEspera ? 'EN_ESPERA' : 'VIGENTE']);
export const movimientosDeTurno = (db, id) => all(db, 'SELECT * FROM movimientos_proceso WHERE id_turno = ?1 ORDER BY id DESC', [id]);
export const empaqueDeTurno = (db, id) => all(db, 'SELECT e.*, p.nombre, p.gramaje FROM empaque_turno e JOIN productos p ON p.id_producto = e.id_producto WHERE e.id_turno = ?1 ORDER BY e.id DESC', [id]);
export const sumasTurno = async (db, id) => ({
  etapas: await all(db, "SELECT etapa, sentido, SUM(kilos) AS kg FROM movimientos_proceso WHERE id_turno = ?1 AND estado = 'VIGENTE' GROUP BY etapa, sentido", [id]),
  bultos: await all(db, "SELECT id_producto, SUM(bultos) AS bultos FROM empaque_turno WHERE id_turno = ?1 AND estado = 'VIGENTE' GROUP BY id_producto", [id])
});
export const stCerrarTurno = (db, id, rol, json) => bind(db, "UPDATE turnos SET estado = 'CERRADO', cerrado_ts = ?2, cerrado_rol = ?3, cierre_json = ?4 WHERE id_turno = ?1 AND estado = 'ABIERTO'", [id, Date.now(), rol, JSON.stringify(json)]);
/* En proceso: kilos acumulados que entraron y salieron de cada etapa (todos los turnos) */
export const saldosProceso = db => all(db, "SELECT etapa, sentido, SUM(kilos) AS kg FROM movimientos_proceso WHERE estado = 'VIGENTE' GROUP BY etapa, sentido");
/* Entradas de la etapa en un turno sin contar los ajustes del cierre (para el % de merma) */
export const entradasTurnoSinAjuste = (db, idTurno) => all(db, "SELECT etapa, SUM(kilos) AS kg FROM movimientos_proceso WHERE id_turno = ?1 AND estado = 'VIGENTE' AND sentido = 'ENTRA' AND ajuste = 0 GROUP BY etapa", [idTurno]);
/* Herencia: lo vigente (todos los turnos) desde que rige la regla, separado por ajustes del cierre */
export const procesoHerencia = (db, desde) => all(db, "SELECT etapa, sentido, ajuste, SUM(kilos) AS kg FROM movimientos_proceso WHERE estado = 'VIGENTE' AND ts >= ?1 GROUP BY etapa, sentido, ajuste", [desde]);
export const kgEmpacadosTurno = async (db, idTurno) => (await one(db, "SELECT COALESCE(SUM(e.bultos * p.kg_por_bulto), 0) AS kg FROM empaque_turno e JOIN productos p ON p.id_producto = e.id_producto WHERE e.id_turno = ?1 AND e.estado = 'VIGENTE'", [idTurno])).kg;

/* ---------- Diferencias (herencia) ---------- */
export const stDiferencia = (db, d) => bind(db, `INSERT INTO diferencias (etapa, origen_tipo, origen_id, id_producto, unidad, heredado, usado, diferencia, tipo, motivo, esperada, estado, retiene, creado_ts, creado_rol) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)`,
  [d.etapa, d.origen_tipo, String(d.origen_id), d.id_producto ?? null, d.unidad, d.heredado, d.usado, d.diferencia, d.tipo, d.motivo, d.esperada ? 1 : 0, d.estado || 'PENDIENTE', d.retiene ? 1 : 0, Date.now(), d.creado_rol ?? null]);
export const getDiferencia = (db, id) => one(db, 'SELECT * FROM diferencias WHERE id = ?1', [id]);
export const ultimaDiferencia = db => one(db, 'SELECT * FROM diferencias ORDER BY id DESC LIMIT 1');
export const listarDiferencias = (db, {estado, etapa, desde, hasta, limite = 200} = {}) => all(db, `SELECT * FROM diferencias WHERE (?1 IS NULL OR estado = ?1) AND (?2 IS NULL OR etapa = ?2) AND (?3 IS NULL OR creado_ts >= ?3) AND (?4 IS NULL OR creado_ts <= ?4) ORDER BY id DESC LIMIT ?5`, [estado || null, etapa || null, desde || null, hasta || null, limite]);
export const contadorDiferencias = db => one(db, "SELECT COUNT(*) AS n, MIN(creado_ts) AS mas_vieja_ts FROM diferencias WHERE estado = 'PENDIENTE'");
export const stDecidirDiferencia = (db, id, estado, rol, nota) => bind(db, "UPDATE diferencias SET estado = ?2, decidido_ts = ?3, decidido_rol = ?4, nota_decision = ?5 WHERE id = ?1 AND estado = 'PENDIENTE'", [id, estado, Date.now(), rol, nota || null]);
export const stMovsDeDiferencia = (db, id, estado) => bind(db, "UPDATE movimientos_proceso SET estado = ?2 WHERE id_diferencia = ?1 AND estado = 'EN_ESPERA'", [id, estado]);
export const stEmpaqueDeDiferencia = (db, id, estado) => bind(db, "UPDATE empaque_turno SET estado = ?2 WHERE id_diferencia = ?1 AND estado = 'EN_ESPERA'", [id, estado]);
/* Diferencias que retienen algo y siguen pendientes en un turno (frenan el cierre) */
export const retenidasDeTurno = (db, idTurno) => all(db, "SELECT * FROM diferencias WHERE retiene = 1 AND estado = 'PENDIENTE' AND origen_tipo IN ('turno','cierre') AND origen_id = ?1", [String(idTurno)]);
export const difDeCierre = (db, idTurno, etapa, idProducto = null) => all(db, "SELECT * FROM diferencias WHERE origen_tipo = 'cierre' AND origen_id = ?1 AND etapa = ?2 AND COALESCE(id_producto, 0) = COALESCE(?3, 0) ORDER BY id DESC", [String(idTurno), etapa, idProducto]);

/* ---------- Papa tomada de recepciones validadas ---------- */
export const tomadoDeRecepcion = async (db, idRec) => (await one(db, 'SELECT COALESCE(SUM(kilos), 0) AS kg FROM turno_recepciones WHERE id_recepcion = ?1', [idRec])).kg;
export const stTomarRecepcion = (db, idTurno, idRec, kilos, rol) => bind(db, 'INSERT INTO turno_recepciones (id_turno, id_recepcion, kilos, ts, rol) VALUES (?1,?2,?3,?4,?5)', [idTurno, idRec, kilos, Date.now(), rol]);
export const recepcionesDeTurno = (db, idTurno) => all(db, 'SELECT * FROM turno_recepciones WHERE id_turno = ?1 ORDER BY id', [idTurno]);
export const getRecepcionDoc = async (db, id) => { const r = await one(db, "SELECT data FROM docs WHERE col = 'recepciones' AND id = ?1", [id]); return r ? JSON.parse(r.data) : null; };
export const stEntradaCierre = (db, idProducto, bultos, idTurno, fecha) => bind(db, "INSERT INTO movimientos_inventario (id_producto, cantidad, tipo, fecha, ts, id_turno, nota) VALUES (?1,?2,'ENTRADA_CIERRE_TURNO',?3,?4,?5,'Cierre de turno')", [idProducto, bultos, fecha, Date.now(), idTurno]);
export const stConteoInicial = (db, idProducto, delta, fecha) => bind(db, "INSERT INTO movimientos_inventario (id_producto, cantidad, tipo, fecha, ts, nota) VALUES (?1,?2,'CONTEO_INICIAL',?3,?4,'Conteo inicial en bultos')", [idProducto, delta, fecha, Date.now()]);
export const stFijarStock = (db, idProducto, bultos) => bind(db, 'UPDATE productos SET stock_entero = ?2 WHERE id_producto = ?1', [idProducto, bultos]);

/* ---------- Merma calculada: motivos y registro por etapa ---------- */
export const listarMotivos = (db, todos = false) => all(db, `SELECT * FROM motivos_merma ${todos ? '' : 'WHERE activo = 1'} ORDER BY orden, id`);
export const getMotivo = (db, id) => one(db, 'SELECT * FROM motivos_merma WHERE id = ?1', [id]);
export const motivoPorNombre = (db, nombre) => one(db, 'SELECT * FROM motivos_merma WHERE lower(nombre) = lower(?1)', [nombre]);
export const stMotivoNuevo = (db, nombre) => bind(db, 'INSERT INTO motivos_merma (nombre, activo, es_otra, orden, creado_ts) VALUES (?1, 1, 0, (SELECT COALESCE(MAX(orden), 0) + 1 FROM motivos_merma WHERE es_otra = 0), ?2)', [nombre, Date.now()]);
export const stMotivoEditar = (db, id, nombre, activo, orden) => bind(db, 'UPDATE motivos_merma SET nombre = ?2, activo = ?3, orden = ?4 WHERE id = ?1', [id, nombre, activo ? 1 : 0, orden]);
/* m = {id_turno, etapa, origen, clase, kilos, unidad, motivo:{id,nombre}|null, texto, ref, rol} */
export const stMerma = (db, m) => bind(db, "INSERT INTO mermas_etapa (id_turno, etapa, origen, clase, kilos, unidad, id_motivo, motivo_nombre, texto, ref, estado, ts, rol, persona) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'VIGENTE',?11,?12,?13)",
  [m.id_turno ?? null, m.etapa, m.origen, m.clase, m.kilos, m.unidad || 'kg', m.motivo ? m.motivo.id : null, m.motivo ? m.motivo.nombre : null, m.texto || null, m.ref != null ? String(m.ref) : null, Date.now(), m.rol ?? null, m.persona || null]);
export const stAnularMermasDeSalida = (db, idSalida) => bind(db, "UPDATE mermas_etapa SET estado = 'ANULADA' WHERE origen = 'carga' AND ref = ?1", [String(idSalida)]);
/* Merma ya justificada entre la etapa anterior y cada etapa (resta lo que falta por llegar) */
export async function mermasTransicion(db, desde) {
  const r = await all(db, "SELECT etapa, SUM(kilos) AS kg FROM mermas_etapa WHERE origen = 'transicion' AND clase = 'MERMA' AND estado = 'VIGENTE' AND ts >= ?1 GROUP BY etapa", [desde]);
  return Object.fromEntries(r.map(x => [x.etapa, x.kg]));
}
export const mermasPorMotivo = (db, desde, hasta) => all(db, "SELECT etapa, id_motivo, motivo_nombre, unidad, SUM(kilos) AS kg, COUNT(*) AS veces FROM mermas_etapa WHERE clase = 'MERMA' AND estado = 'VIGENTE' AND ts >= ?1 AND ts <= ?2 GROUP BY etapa, id_motivo, motivo_nombre, unidad", [desde, hasta]);
export const mermasOtras = (db, desde, hasta) => all(db, "SELECT etapa, texto, SUM(kilos) AS kg, unidad FROM mermas_etapa m JOIN motivos_merma mm ON mm.id = m.id_motivo WHERE mm.es_otra = 1 AND m.clase = 'MERMA' AND m.estado = 'VIGENTE' AND m.ts >= ?1 AND m.ts <= ?2 GROUP BY etapa, texto, unidad ORDER BY kg DESC", [desde, hasta]);
export const siguenPorEtapa = (db, desde, hasta) => all(db, "SELECT etapa, SUM(kilos) AS kg FROM mermas_etapa WHERE clase = 'SIGUE' AND estado = 'VIGENTE' AND ts >= ?1 AND ts <= ?2 GROUP BY etapa", [desde, hasta]);
export const entradasPeriodo = (db, desde, hasta) => all(db, "SELECT etapa, SUM(kilos) AS kg FROM movimientos_proceso WHERE sentido = 'ENTRA' AND ajuste = 0 AND estado = 'VIGENTE' AND ts >= ?1 AND ts <= ?2 GROUP BY etapa", [desde, hasta]);
export const mermasTransPeriodo = (db, desde, hasta) => all(db, "SELECT etapa, SUM(kilos) AS kg FROM mermas_etapa WHERE origen = 'transicion' AND clase = 'MERMA' AND estado = 'VIGENTE' AND ts >= ?1 AND ts <= ?2 GROUP BY etapa", [desde, hasta]);

/* ---------- Fase 5: catálogo de etapas, jornada del turno, avance, merma consolidada, arranque y panel ---------- */
export const listarEtapas = db => all(db, 'SELECT clave, nombre, orden, padre, kilos, activo FROM etapas_proceso ORDER BY orden, clave');
export const getEtapa = (db, clave) => one(db, 'SELECT * FROM etapas_proceso WHERE clave = ?1', [clave]);
export const stEtapaEditar = (db, clave, nombre, orden, kilos, activo) => bind(db, 'UPDATE etapas_proceso SET nombre = ?2, orden = ?3, kilos = ?4, activo = ?5 WHERE clave = ?1', [clave, nombre, orden, kilos ? 1 : 0, activo ? 1 : 0]);
export const stEtapaNueva = (db, clave, nombre, orden, padre, kilos) => bind(db, 'INSERT INTO etapas_proceso (clave, nombre, orden, padre, kilos, activo) VALUES (?1,?2,?3,?4,?5,1)', [clave, nombre, orden, padre || null, kilos ? 1 : 0]);
export const stAbrirTurnoJornada = (db, fecha, rol, obs, j = {}) => bind(db, "INSERT INTO turnos (fecha, estado, abierto_ts, abierto_rol, observaciones, jornada, fecha_jornada, grupo_id) VALUES (?1,'ABIERTO',?2,?3,?4,?5,?6,?7)", [fecha, Date.now(), rol, obs || null, j.jornada || null, j.fecha_jornada || null, j.grupo_id ?? null]);
export const avanceDeTurno = (db, idTurno) => all(db, 'SELECT etapa, ts, rol FROM etapa_avance WHERE id_turno = ?1', [idTurno]);
export const stMarcarAvance = (db, idTurno, etapa, rol) => bind(db, 'INSERT OR IGNORE INTO etapa_avance (id_turno, etapa, ts, rol) VALUES (?1,?2,?3,?4)', [idTurno, etapa, Date.now(), rol]);
export const stQuitarAvance = (db, idTurno, etapa) => bind(db, 'DELETE FROM etapa_avance WHERE id_turno = ?1 AND etapa = ?2', [idTurno, etapa]);
export const kilosPapaTomada = async (db, idTurno) => (await one(db, "SELECT COALESCE(SUM(kilos), 0) AS kg FROM movimientos_proceso WHERE id_turno = ?1 AND etapa = 'recepcion' AND sentido = 'ENTRA' AND estado = 'VIGENTE'", [idTurno])).kg;
export const kilosAEmpaque = async (db, idTurno) => (await one(db, "SELECT COALESCE(SUM(CASE WHEN sentido = 'ENTRA' AND ajuste IN (0,1) THEN kilos WHEN sentido = 'SALE' AND ajuste IN (1,2) THEN -kilos ELSE 0 END), 0) AS kg FROM movimientos_proceso WHERE id_turno = ?1 AND etapa = 'empacado' AND estado = 'VIGENTE'", [idTurno])).kg;
export const getMermaConsolidada = (db, idTurno) => one(db, 'SELECT * FROM merma_consolidada WHERE id_turno = ?1', [idTurno]);
export const stMermaConsolidada = (db, m) => bind(db, 'INSERT INTO merma_consolidada (id_turno, tomados_kg, a_empaque_kg, calculada_kg, kilos, nota, desglose, descontado_inv_kg, ts, rol) VALUES (?1,?2,?3,?4,?5,?6,?7,0,?8,?9)',
  [m.id_turno, m.tomados_kg, m.a_empaque_kg, m.calculada_kg, m.kilos, m.nota || null, JSON.stringify(m.desglose || []), Date.now(), m.rol ?? null]);
export const turnosRecientes = (db, limite = 800) => all(db, 'SELECT * FROM turnos ORDER BY id_turno DESC LIMIT ?1', [limite]);
export const consumosPorTurno = (db, ids) => ids.length ? all(db, `SELECT id_turno, articulo, SUM(cantidad) AS cantidad FROM inv_movimientos WHERE origen = 'consumo' AND id_turno IN (${ids.map(() => '?').join(',')}) GROUP BY id_turno, articulo`, ids) : Promise.resolve([]);
export const kilosProducidosPorTurno = (db, ids) => ids.length ? all(db, `SELECT id_turno, COALESCE(SUM(CASE WHEN sentido = 'ENTRA' AND ajuste IN (0,1) THEN kilos WHEN sentido = 'SALE' AND ajuste IN (1,2) THEN -kilos ELSE 0 END), 0) AS kg FROM movimientos_proceso WHERE etapa = 'empacado' AND estado = 'VIGENTE' AND id_turno IN (${ids.map(() => '?').join(',')}) GROUP BY id_turno`, ids) : Promise.resolve([]);
export const papaTomadaPorTurno = (db, ids) => ids.length ? all(db, `SELECT id_turno, COALESCE(SUM(kilos), 0) AS kg FROM movimientos_proceso WHERE etapa = 'recepcion' AND sentido = 'ENTRA' AND estado = 'VIGENTE' AND id_turno IN (${ids.map(() => '?').join(',')}) GROUP BY id_turno`, ids) : Promise.resolve([]);
export const mermasConsolidadasPorTurno = (db, ids) => ids.length ? all(db, `SELECT id_turno, kilos FROM merma_consolidada WHERE id_turno IN (${ids.map(() => '?').join(',')})`, ids) : Promise.resolve([]);
export const mermasViejasPorTurno = (db, ids) => ids.length ? all(db, `SELECT id_turno, COALESCE(SUM(kilos), 0) AS kg FROM mermas_etapa WHERE clase = 'MERMA' AND estado = 'VIGENTE' AND unidad = 'kg' AND etapa <> 'carga' AND id_turno IN (${ids.map(() => '?').join(',')}) GROUP BY id_turno`, ids) : Promise.resolve([]);
export const empaquePorTurno = (db, ids) => ids.length ? all(db, `SELECT e.id_turno, p.id_producto, p.nombre, p.categoria, SUM(e.bultos) AS cantidad FROM empaque_turno e JOIN productos p ON p.id_producto = e.id_producto WHERE e.estado = 'VIGENTE' AND e.id_turno IN (${ids.map(() => '?').join(',')}) GROUP BY e.id_turno, p.id_producto`, ids) : Promise.resolve([]);
export const mermasEtapaPorTurno = (db, ids) => ids.length ? all(db, `SELECT id_turno, etapa, COALESCE(SUM(kilos), 0) AS kg FROM mermas_etapa WHERE clase = 'MERMA' AND estado = 'VIGENTE' AND unidad = 'kg' AND etapa <> 'carga' AND id_turno IN (${ids.map(() => '?').join(',')}) GROUP BY id_turno, etapa`, ids) : Promise.resolve([]);
/* ---------- Merma por etapas al cierre (filas en mermas_etapa, origen 'cierre', ref MC-<turno>; cabecera en merma_consolidada) ---------- */
export const mermasCierreDeTurno = (db, id) => all(db, "SELECT * FROM mermas_etapa WHERE origen = 'cierre' AND ref = ?1 AND estado = 'VIGENTE' AND clase = 'MERMA' ORDER BY id", ['MC-' + id]);
export const mermasCierrePorTurnos = (db, ids) => ids.length ? all(db, `SELECT id_turno, etapa, kilos, motivo_nombre, texto, rol, persona, ts FROM mermas_etapa WHERE origen = 'cierre' AND ref LIKE 'MC-%' AND estado = 'VIGENTE' AND clase = 'MERMA' AND id_turno IN (${ids.map(() => '?').join(',')}) ORDER BY id_turno, id`, ids) : Promise.resolve([]);
export const cabecerasPorTurnos = (db, ids) => ids.length ? all(db, `SELECT id_turno, kilos, calculada_kg, tomados_kg, por_etapas, sin_explicar_kg, nota, corregido_ts, corregido_rol, ts, rol FROM merma_consolidada WHERE id_turno IN (${ids.map(() => '?').join(',')})`, ids) : Promise.resolve([]);
export const stMermaConsolidadaEtapas = (db, m) => bind(db, 'INSERT INTO merma_consolidada (id_turno, tomados_kg, a_empaque_kg, calculada_kg, kilos, nota, desglose, descontado_inv_kg, ts, rol, por_etapas, sin_explicar_kg) VALUES (?1,?2,?3,?4,?5,?6,?7,0,?8,?9,1,?10)',
  [m.id_turno, m.tomados_kg, m.a_empaque_kg, m.calculada_kg, m.kilos, m.nota || null, JSON.stringify(m.desglose || []), Date.now(), m.rol ?? null, m.sin_explicar_kg]);
export const stAnularMermasCierre = (db, id) => bind(db, "UPDATE mermas_etapa SET estado = 'ANULADA' WHERE origen = 'cierre' AND ref = ?1 AND estado = 'VIGENTE'", ['MC-' + id]);
export const stActualizarCabecera = (db, id, m) => bind(db, 'UPDATE merma_consolidada SET kilos = ?2, nota = ?3, desglose = ?4, sin_explicar_kg = ?5, por_etapas = 1, corregido_ts = ?6, corregido_rol = ?7 WHERE id_turno = ?1',
  [id, m.kilos, m.nota || null, JSON.stringify(m.desglose || []), m.sin_explicar_kg, m.corregido_rol ? Date.now() : null, m.corregido_rol ?? null]);
export const sumasEntraSale = async (db, id) => { const o = {}; for (const x of await all(db, "SELECT etapa, sentido, SUM(kilos) AS kg FROM movimientos_proceso WHERE id_turno = ?1 AND estado = 'VIGENTE' GROUP BY etapa, sentido", [id])) (o[x.etapa] = o[x.etapa] || {entra: 0, sale: 0})[x.sentido === 'ENTRA' ? 'entra' : 'sale'] = x.kg; return o; };
/* Turno activo: la producción se inicia una sola vez (sin vuelta atrás) */
export const stIniciarProduccion = (db, idTurno, rol, grupo) => bind(db, "UPDATE turnos SET inicio_ts = ?2, inicio_rol = ?3, grupo_id = COALESCE(?4, grupo_id) WHERE id_turno = ?1 AND estado = 'ABIERTO' AND inicio_ts IS NULL", [idTurno, Date.now(), rol, grupo ?? null]);
export const turnoPorId = (db, id) => one(db, 'SELECT * FROM turnos WHERE id_turno = ?1', [id]);

/* ---------- Empaque libre de Logística (papa a granel disponible) ---------- */
export const kilosTerminadosTodos = async db => (await one(db, "SELECT COALESCE(SUM(CASE WHEN sentido = 'ENTRA' AND ajuste IN (0,1) THEN kilos WHEN sentido = 'SALE' AND ajuste IN (1,2) THEN -kilos ELSE 0 END), 0) AS kg FROM movimientos_proceso WHERE etapa = 'empacado' AND estado = 'VIGENTE'", [])).kg;
export const kgEmpacadosEnTurnos = async db => (await one(db, "SELECT COALESCE(SUM(e.bultos * p.kg_por_bulto), 0) AS kg FROM empaque_turno e JOIN productos p ON p.id_producto = e.id_producto WHERE e.estado = 'VIGENTE'", [])).kg;
export const kgLibres = async (db, tipo) => (await one(db, "SELECT COALESCE(SUM(kg), 0) AS kg FROM empaque_libre WHERE tipo = ?1 AND estado = 'VIGENTE'", [tipo])).kg;
export const stEmpaqueLibre = (db, tipo, idProducto, bultos, kg, motivo, rol) => bind(db, 'INSERT INTO empaque_libre (tipo, id_producto, bultos, kg, motivo, ts, rol) VALUES (?1,?2,?3,?4,?5,?6,?7)', [tipo, idProducto, bultos, kg, motivo, Date.now(), rol]);
export const stEntradaEmpaque = (db, idProducto, bultos, fecha) => bind(db, "INSERT INTO movimientos_inventario (id_producto, cantidad, tipo, fecha, ts, nota) VALUES (?1,?2,'ENTRADA_CIERRE_TURNO',?3,?4,'Empaque de Logística')", [idProducto, bultos, fecha, Date.now()]);
export const empaquesLibresRecientes = db => all(db, "SELECT e.tipo, e.bultos, e.kg, e.motivo, e.ts, p.nombre FROM empaque_libre e LEFT JOIN productos p ON p.id_producto = e.id_producto WHERE e.estado = 'VIGENTE' ORDER BY e.id DESC LIMIT 12", []);
