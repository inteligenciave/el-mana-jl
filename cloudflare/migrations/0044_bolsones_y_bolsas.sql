-- 0044 · Dos materiales distintos en el inventario general.
-- «Material de empaque» (código empaque) pasa a llamarse «Bolsas de presentación»: conserva todo su histórico (movimientos, conteo, mínimo).
-- Nuevo artículo «Bolsones» (bolsas grandes para la papa a granel, las usa Producción). Sin conteo propio: el conteo inicial ya está hecho, su saldo sube con las compras que se reciban.
-- El parámetro «kilos por bolsón» (config kg_por_bolson) arranca en 16 (decisión del dueño); INSERT OR IGNORE: nunca pisa un valor ya cargado. Gerencia o Administración lo pueden cambiar.
UPDATE inv_articulos SET nombre = 'Bolsas de presentación' WHERE codigo = 'empaque';
INSERT OR IGNORE INTO inv_articulos (codigo, nombre, unidad, minimo, orden) VALUES ('bolsones', 'Bolsones', 'und', 0, 8);
INSERT OR IGNORE INTO config (clave, valor) VALUES ('kg_por_bolson', '16');
