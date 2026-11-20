-- 0033 · Compras en un solo paso: ya no existe «Por validar». Al recibir, la compra queda lista (compra efectiva, deuda o pago, almacén).
-- Esta migración pasa a «lista» las compras que quedaron recibidas esperando validación (flujo de la fase 4): crea su compra efectiva,
-- su cuenta por pagar (si es a crédito) y la entrada al almacén de materia prima, SOBRE LO REALMENTE RECIBIDO, y da por atendidos sus avisos.
-- Las compras sin recibir siguen «pendientes por llegar»; lo que nunca llega no genera nada. No borra nada. Aplicar SOLO con --local hasta que el dueño autorice.
-- Marcas para poder deshacer: compras/cxp/movimientos con "mig":"0033", pedidos con validada_rol = 'migracion', avisos con detalle.mig = '0033'.
DROP TABLE IF EXISTS _mig0033;
CREATE TABLE _mig0033 AS
  SELECT r.id AS rec_id, 'C-' || substr(r.id, 5) AS cid, json_extract(r.data, '$.pedido') AS nro, p.proveedor_id AS prov, p.condicion AS condicion, p.plazo_dias AS plazo_dias, p.factura AS fact,
         l.unidad AS unidad, l.precio_usd AS pu,
         CASE WHEN l.unidad = 'saco' THEN json_extract(r.data, '$.recibido') ELSE COALESCE(json_extract(r.data, '$.kgRec'), json_extract(r.data, '$.recibido')) END AS cant,
         json_extract(r.data, '$.fecha') AS fecha, json_extract(r.data, '$.entProm') AS ent_prom, json_extract(r.data, '$.entReal') AS ent_real,
         json_extract(r.data, '$.sub') AS sub, json_extract(r.data, '$.cat') AS cat, json_extract(r.data, '$.item') AS item, json_extract(r.data, '$.sk') AS sk,
         json_extract(r.data, '$.motivo') AS motivo, COALESCE(json_extract(r.data, '$.kgRec'), json_extract(r.data, '$.recibido')) AS kg,
         COALESCE((SELECT json_extract(pv.data, '$.abonos') FROM docs pv WHERE pv.col = 'proveedores' AND pv.id = p.proveedor_id), 0) AS abonos
  FROM docs r
  JOIN compras_pedidos p ON p.nro = json_extract(r.data, '$.pedido')
  JOIN compras_pedido_lineas l ON l.pedido_id = p.id AND l.producto_id = json_extract(r.data, '$.producto_id')
  WHERE r.col = 'recepciones' AND json_extract(r.data, '$.estado') = 'verificado'
    AND p.estado = 'RECIBIDA' AND p.validada_ts IS NULL AND json_extract(r.data, '$.recibido') > 0;

INSERT OR IGNORE INTO docs (col, id, data, updated)
  SELECT 'compras', cid, json_object('id', cid, 'fam', 'MP', 'recId', rec_id, 'prov', prov, 'sub', sub, 'cat', cat, 'item', item, 'sk', sk, 'unidad', unidad, 'qf', cant, 'pu', pu,
         'cond', CASE WHEN condicion = 'CREDITO' THEN 'Crédito' ELSE 'Contado' END, 'plazo', CASE WHEN condicion = 'CREDITO' THEN plazo_dias || ' días' ELSE 'Contado' END,
         'motivo', motivo, 'fecha', fecha, 'entProm', ent_prom, 'entReal', ent_real, 'pedido', nro, 'fact', fact, 'mig', '0033'), CAST(strftime('%s','now') AS INTEGER) * 1000
  FROM _mig0033;

INSERT OR IGNORE INTO docs (col, id, data, updated)
  SELECT 'cxp', 'CXP-' || cid, json_object('id', 'CXP-' || cid, 'compraId', cid, 'prov', prov, 'total', round(cant * pu, 2),
         'cuota', CASE WHEN abonos > 0 THEN round(round(cant * pu, 2) / abonos, 2) ELSE NULL END, 'vence', date(fecha, '+' || COALESCE(plazo_dias, 0) || ' days'), 'fecha', fecha, 'mig', '0033'), CAST(strftime('%s','now') AS INTEGER) * 1000
  FROM _mig0033 WHERE condicion = 'CREDITO';

INSERT OR IGNORE INTO docs (col, id, data, updated)
  SELECT 'movimientos', 'MV-ENT-' || rec_id, json_object('id', 'MV-ENT-' || rec_id, 'almacen', 'MP', 'item', sk, 'tipo', 'entrada', 'cant', kg, 'fecha', fecha, 'ref', rec_id || ' / ' || cid, 'mig', '0033'), CAST(strftime('%s','now') AS INTEGER) * 1000
  FROM _mig0033;

UPDATE docs SET data = json_set(data, '$.estado', 'almacen', '$.compraId', (SELECT m.cid FROM _mig0033 m WHERE m.rec_id = docs.id),
       '$.validacion', json_object('pu', (SELECT m.pu FROM _mig0033 m WHERE m.rec_id = docs.id), 'cond', (SELECT CASE WHEN m.condicion = 'CREDITO' THEN 'Crédito' ELSE 'Contado' END FROM _mig0033 m WHERE m.rec_id = docs.id),
       'plazo', (SELECT CASE WHEN m.condicion = 'CREDITO' THEN m.plazo_dias || ' días' ELSE 'Contado' END FROM _mig0033 m WHERE m.rec_id = docs.id),
       'qfPago', (SELECT m.cant FROM _mig0033 m WHERE m.rec_id = docs.id), 'por', 'migracion', 'ts', CAST(strftime('%s','now') AS INTEGER) * 1000, 'mig', '0033')),
       updated = CAST(strftime('%s','now') AS INTEGER) * 1000
  WHERE col = 'recepciones' AND id IN (SELECT rec_id FROM _mig0033);

-- Avisos: los que solo decían «por validar» se dan por atendidos; los que traían diferencia pasan a ser avisos de diferencia (siguen sin ver)
UPDATE alertas_admin SET detalle = json_set(COALESCE(detalle, '{}'), '$.mig', '0033'), tipo = 'RECEPCION_CON_DIFERENCIA'
  WHERE tipo = 'RECEPCION_POR_VALIDAR' AND estado = 'PENDIENTE' AND COALESCE(json_extract(detalle, '$.con_diferencia'), 0) = 1;
UPDATE alertas_admin SET detalle = json_set(COALESCE(detalle, '{}'), '$.mig', '0033'), estado = 'ATENDIDA', atendida_ts = CAST(strftime('%s','now') AS INTEGER) * 1000, atendida_rol = 'migracion'
  WHERE tipo = 'RECEPCION_POR_VALIDAR' AND estado = 'PENDIENTE';

-- Pedidos: pasan a «listos» (sin validación pendiente), incluso los que no recibieron nada
UPDATE compras_pedidos SET validada_ts = COALESCE(recibida_ts, CAST(strftime('%s','now') AS INTEGER) * 1000), validada_rol = 'migracion'
  WHERE estado = 'RECIBIDA' AND validada_ts IS NULL;

UPDATE ver SET v = v + 1 WHERE id = 1;
DROP TABLE IF EXISTS _mig0033;
