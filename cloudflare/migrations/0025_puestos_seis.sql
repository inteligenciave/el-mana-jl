-- De 10 puestos a 6: Gerencia, Administración, Producción, Logística (clave empaque), Ventas, Nómina (clave rrhh).
-- Desaparecen recep, jefeprod (pasan a produccion) y custodio, cobranza (pasan a adm). NO toca la auditoría ni el historial (se lee «(antes)»).
-- Antes de cambiar algo, se guarda lo anterior en respaldo_puestos; la reversa está en cloudflare/reversa/0025_puestos_seis_reversa.sql.
CREATE TABLE IF NOT EXISTS respaldo_puestos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tabla TEXT NOT NULL,
  clave TEXT NOT NULL,
  dato TEXT,
  ts INTEGER NOT NULL
);

-- 1) Respaldo
INSERT INTO respaldo_puestos (tabla, clave, dato, ts)
  SELECT 'docs:ajustes', id, data, CAST(strftime('%s','now') AS INTEGER) * 1000 FROM docs WHERE col = 'ajustes' AND id = 'matriz';
INSERT INTO respaldo_puestos (tabla, clave, dato, ts)
  SELECT 'pantallas_extras', rol || '|' || clave, CAST(asignado_ts AS TEXT), CAST(strftime('%s','now') AS INTEGER) * 1000
  FROM pantallas_extras WHERE rol IN ('recep', 'jefeprod', 'custodio', 'cobranza');
INSERT INTO respaldo_puestos (tabla, clave, dato, ts)
  SELECT 'solicitudes_autorizacion', CAST(id AS TEXT), rol, CAST(strftime('%s','now') AS INTEGER) * 1000
  FROM solicitudes_autorizacion WHERE estado = 'PENDIENTE' AND rol IN ('recep', 'jefeprod', 'custodio', 'cobranza');
INSERT INTO respaldo_puestos (tabla, clave, dato, ts)
  SELECT 'pedidos_venta', CAST(id_pedido AS TEXT), creado_rol_cod, CAST(strftime('%s','now') AS INTEGER) * 1000
  FROM pedidos_venta WHERE estado IN ('PENDIENTE', 'PARCIAL') AND creado_rol_cod IN ('recep', 'jefeprod', 'custodio', 'cobranza');
INSERT INTO respaldo_puestos (tabla, clave, dato, ts)
  SELECT 'compras_pedidos', CAST(id AS TEXT), rol, CAST(strftime('%s','now') AS INTEGER) * 1000
  FROM compras_pedidos WHERE estado = 'PEDIDA' AND rol IN ('recep', 'jefeprod', 'custodio', 'cobranza');

-- 2) Matriz nueva: la marca puestos:6 hace que la página y el servidor usen la propuesta inicial de los 6 puestos
--    (lo que el Gerente cambie después se guarda aquí con la misma marca). Si no había matriz guardada, valen las de fábrica.
UPDATE docs SET data = '{"puestos":6,"perm":{},"cobranzaEnAdm":true}', updated = CAST(strftime('%s','now') AS INTEGER) * 1000
  WHERE col = 'ajustes' AND id = 'matriz';

-- 3) Funciones extra de los 4 puestos que desaparecen
DELETE FROM pantallas_extras WHERE rol IN ('recep', 'jefeprod', 'custodio', 'cobranza');

-- 4) Lo que sigue abierto pasa al puesto nuevo (el historial cerrado no se toca)
UPDATE solicitudes_autorizacion SET rol = CASE rol WHEN 'recep' THEN 'produccion' WHEN 'jefeprod' THEN 'produccion' ELSE 'adm' END
  WHERE estado = 'PENDIENTE' AND rol IN ('recep', 'jefeprod', 'custodio', 'cobranza');
UPDATE pedidos_venta SET creado_rol_cod = CASE creado_rol_cod WHEN 'recep' THEN 'produccion' WHEN 'jefeprod' THEN 'produccion' ELSE 'adm' END
  WHERE estado IN ('PENDIENTE', 'PARCIAL') AND creado_rol_cod IN ('recep', 'jefeprod', 'custodio', 'cobranza');
UPDATE compras_pedidos SET rol = CASE rol WHEN 'recep' THEN 'produccion' WHEN 'jefeprod' THEN 'produccion' ELSE 'adm' END
  WHERE estado = 'PEDIDA' AND rol IN ('recep', 'jefeprod', 'custodio', 'cobranza');

-- 5) Que las pantallas abiertas se recarguen
UPDATE ver SET v = v + 1 WHERE id = 1;
