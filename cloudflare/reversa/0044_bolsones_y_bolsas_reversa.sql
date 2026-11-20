-- Reversa de 0044: vuelve el nombre «Material de empaque» y quita «Bolsones» con sus movimientos, conteo y parámetro.
UPDATE inv_articulos SET nombre = 'Material de empaque' WHERE codigo = 'empaque';
DELETE FROM inv_movimientos WHERE articulo = 'bolsones';
DELETE FROM inv_conteo WHERE articulo = 'bolsones';
DELETE FROM inv_articulos WHERE codigo = 'bolsones';
DELETE FROM config WHERE clave = 'kg_por_bolson';
