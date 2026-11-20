-- 0041 · Un solo mínimo por insumo (el del inventario). Lo fijan Gerencia y Administración.
-- Antes había dos: el de arranque (config 'arranque_min_*') y el de aviso del inventario. Se conserva el MAYOR de los dos.
-- No borra nada: las filas viejas de config quedan sin uso (la reversa no necesita restaurarlas).
UPDATE inv_articulos SET minimo = MAX(COALESCE(minimo, 0), COALESCE((SELECT CAST(valor AS REAL) FROM config WHERE clave = 'arranque_min_' || inv_articulos.codigo), 0));
