-- 0036 · Lo que trae cada proveedor. Cada proveedor guarda en su ficha una lista «trae» = [{id, ref}]:
--   id  = un producto del catálogo de compras (su id) o un insumo del inventario general («INV:agua», «INV:almidon», «INV:empaque»…)
--   ref = precio de referencia en dólares por unidad (opcional, null si no hay)
-- Se llena con lo que ya existía, sin quitar nada: (1) los productos cuyo campo «prov» apunta al proveedor y (2) agua, almidón y material de empaque
-- cuando el texto «qué vende» los menciona (esos tres no tienen producto en el catálogo; se compran directo del inventario). El texto «rubro» y el campo «prov» de los productos NO se tocan.
-- Los proveedores que ya tienen «trae» no se vuelven a tocar. Aplicar SOLO con --local hasta que el dueño autorice.
UPDATE docs SET data = json_set(data, '$.trae', json((
  SELECT COALESCE(json_group_array(json_object('id', x.id, 'ref', NULL)), '[]') FROM (
    SELECT p.id AS id FROM docs p WHERE p.col = 'productos' AND json_extract(p.data, '$.prov') = docs.id
    UNION SELECT 'INV:agua' WHERE lower(COALESCE(json_extract(docs.data, '$.rubro'), '')) LIKE '%agua%'
    UNION SELECT 'INV:almidon' WHERE lower(COALESCE(json_extract(docs.data, '$.rubro'), '')) LIKE '%almid%'
    UNION SELECT 'INV:empaque' WHERE lower(COALESCE(json_extract(docs.data, '$.rubro'), '')) LIKE '%empaque%'
    ORDER BY 1) x))),
  updated = CAST(strftime('%s','now') AS INTEGER) * 1000
  WHERE col = 'proveedores' AND json_extract(data, '$.trae') IS NULL;
UPDATE ver SET v = v + 1 WHERE id = 1;
