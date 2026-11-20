-- Reversa de 0034. Quita el artículo Almidón del inventario general y sus movimientos y conteo (si los hubiera).
DELETE FROM inv_movimientos WHERE articulo = 'almidon';
DELETE FROM inv_conteo WHERE articulo = 'almidon';
DELETE FROM inv_articulos WHERE codigo = 'almidon';
