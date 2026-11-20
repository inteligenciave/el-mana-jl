-- Reversa de 0033. Deshace SOLO lo que hizo la migración: borra las compras efectivas, cuentas por pagar y entradas de almacén marcadas "mig":"0033",
-- devuelve esas recepciones a «verificado» y esos pedidos a «por validar», y reabre los avisos. No toca lo recibido después (flujo de un solo paso).
-- Ojo: si una cuenta por pagar migrada ya recibió pagos, la reversa la borraría; úsala solo recién aplicada la migración.
UPDATE docs SET data = json_remove(json_set(data, '$.estado', 'verificado'), '$.compraId', '$.validacion'), updated = CAST(strftime('%s','now') AS INTEGER) * 1000
  WHERE col = 'recepciones' AND json_extract(data, '$.validacion.mig') = '0033';
DELETE FROM docs WHERE col IN ('compras', 'cxp', 'movimientos') AND json_extract(data, '$.mig') = '0033';
UPDATE compras_pedidos SET validada_ts = NULL, validada_rol = NULL WHERE validada_rol = 'migracion';
UPDATE alertas_admin SET tipo = 'RECEPCION_POR_VALIDAR', estado = 'PENDIENTE', atendida_ts = NULL, atendida_rol = NULL, detalle = json_remove(detalle, '$.mig')
  WHERE json_extract(detalle, '$.mig') = '0033';
UPDATE ver SET v = v + 1 WHERE id = 1;
