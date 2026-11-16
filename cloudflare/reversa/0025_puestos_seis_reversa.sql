-- REVERSA de 0025_puestos_seis.sql. Devuelve la matriz, las funciones extra, las solicitudes, los pedidos de venta y los pedidos de compra
-- a lo que había antes, usando la copia guardada en respaldo_puestos. Úsala SOLO junto con la versión anterior de la página.
-- Aplicar con:  npx wrangler d1 execute elmana-jl --local --file reversa/0025_puestos_seis_reversa.sql   (la base real solo con autorización del dueño)
UPDATE docs SET data = (SELECT dato FROM respaldo_puestos WHERE tabla = 'docs:ajustes' AND clave = 'matriz' ORDER BY id LIMIT 1)
  WHERE col = 'ajustes' AND id = 'matriz' AND EXISTS (SELECT 1 FROM respaldo_puestos WHERE tabla = 'docs:ajustes' AND clave = 'matriz');
INSERT OR IGNORE INTO pantallas_extras (rol, clave, asignado_ts)
  SELECT substr(clave, 1, instr(clave, '|') - 1), substr(clave, instr(clave, '|') + 1), CAST(dato AS INTEGER) FROM respaldo_puestos WHERE tabla = 'pantallas_extras';
UPDATE solicitudes_autorizacion SET rol = (SELECT dato FROM respaldo_puestos r WHERE r.tabla = 'solicitudes_autorizacion' AND r.clave = CAST(solicitudes_autorizacion.id AS TEXT) ORDER BY r.id LIMIT 1)
  WHERE CAST(id AS TEXT) IN (SELECT clave FROM respaldo_puestos WHERE tabla = 'solicitudes_autorizacion');
UPDATE pedidos_venta SET creado_rol_cod = (SELECT dato FROM respaldo_puestos r WHERE r.tabla = 'pedidos_venta' AND r.clave = CAST(pedidos_venta.id_pedido AS TEXT) ORDER BY r.id LIMIT 1)
  WHERE CAST(id_pedido AS TEXT) IN (SELECT clave FROM respaldo_puestos WHERE tabla = 'pedidos_venta');
UPDATE compras_pedidos SET rol = (SELECT dato FROM respaldo_puestos r WHERE r.tabla = 'compras_pedidos' AND r.clave = CAST(compras_pedidos.id AS TEXT) ORDER BY r.id LIMIT 1)
  WHERE CAST(id AS TEXT) IN (SELECT clave FROM respaldo_puestos WHERE tabla = 'compras_pedidos');
UPDATE ver SET v = v + 1 WHERE id = 1;
-- La tabla respaldo_puestos se conserva (por si hay que volver a mirar). Para volver a aplicar la migración hay que vaciarla antes: DELETE FROM respaldo_puestos;
