-- Reversa de 0036. Quita la lista «trae» de las fichas de proveedor (el texto «rubro» y el campo «prov» de los productos nunca se tocaron).
UPDATE docs SET data = json_remove(data, '$.trae', '$.otro'), updated = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE col = 'proveedores' AND json_extract(data, '$.trae') IS NOT NULL;
UPDATE ver SET v = v + 1 WHERE id = 1;
