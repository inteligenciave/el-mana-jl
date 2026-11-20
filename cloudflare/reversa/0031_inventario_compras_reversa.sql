-- Reversa de 0031. Quita el inventario general, los avisos a Administración, las diferencias de compra y las columnas de enlace del pedido.
-- Se pierde: lo guardado en esas tablas (movimientos del inventario general, conteo inicial, avisos y diferencias registradas) y el enlace pedido-recepción.
-- Las recepciones guardadas como documentos (docs / recepciones) y sus compras NO se tocan.
DROP TABLE IF EXISTS inv_conteo;
DROP TABLE IF EXISTS inv_movimientos;
DROP TABLE IF EXISTS inv_articulos;
DROP TABLE IF EXISTS alertas_admin;
DROP TABLE IF EXISTS compras_diferencias;
DELETE FROM config WHERE clave = 'inv_inicio_ts';
ALTER TABLE compras_pedidos DROP COLUMN validada_rol;
ALTER TABLE compras_pedidos DROP COLUMN validada_ts;
ALTER TABLE compras_pedidos DROP COLUMN con_diferencia;
ALTER TABLE compras_pedidos DROP COLUMN recibida_rol;
ALTER TABLE compras_pedidos DROP COLUMN recibida_ts;
ALTER TABLE compras_pedidos DROP COLUMN recepcion_id;
