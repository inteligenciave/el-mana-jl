-- 0028 · Modificaciones del cliente, fase 1: 1.1 cuentas bancarias, 1.2 categorías de precio, 2.1 cargos (vendedor). Solo agrega y archiva: no borra datos.
-- Aplicar SOLO con --local hasta que el dueño autorice. Las sentencias ADD COLUMN corren una sola vez (D1 lleva el registro de migraciones); el resto es repetible sin daño.

-- 1.1 Cuentas bancarias: teléfono (Pago Móvil), cédula y RIF. Los bancos que ya existen quedan con los tres vacíos; son obligatorios al crear o editar (lo valida el servidor).
ALTER TABLE bancos ADD COLUMN telefono TEXT;
ALTER TABLE bancos ADD COLUMN cedula TEXT;
ALTER TABLE bancos ADD COLUMN rif TEXT;

-- 1.2 Categoría de precio del cliente (reemplaza por completo a las listas A, B y «Propia · estado»). Vacía hasta que se asigne en la ficha; sin categoría no se le vende.
ALTER TABLE clientes ADD COLUMN categoria_precio TEXT CHECK (categoria_precio IS NULL OR categoria_precio IN ('Minorista','Mayorista','Gran Mayor'));
-- Las listas por zona se ARCHIVAN (se copian aparte y dejan de usarse); no se borra ningún precio.
CREATE TABLE IF NOT EXISTS precios_lista_archivo (
  id_producto INTEGER NOT NULL,
  lista TEXT NOT NULL,
  contado_cents INTEGER NOT NULL,
  credito_cents INTEGER NOT NULL,
  actualizado_ts INTEGER NOT NULL DEFAULT 0,
  archivado_ts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (id_producto, lista)
);
INSERT OR IGNORE INTO precios_lista_archivo (id_producto, lista, contado_cents, credito_cents, actualizado_ts, archivado_ts)
  SELECT id_producto, lista, contado_cents, credito_cents, actualizado_ts, CAST(strftime('%s','now') AS INTEGER) * 1000 FROM precios_lista WHERE lista NOT IN ('Minorista','Mayorista','Gran Mayor');
DELETE FROM precios_lista WHERE lista NOT IN ('Minorista','Mayorista','Gran Mayor');
CREATE TABLE IF NOT EXISTS estados_lista_archivo (
  estado TEXT PRIMARY KEY,
  lista TEXT NOT NULL,
  actualizado_ts INTEGER NOT NULL DEFAULT 0,
  archivado_ts INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO estados_lista_archivo (estado, lista, actualizado_ts, archivado_ts)
  SELECT estado, lista, actualizado_ts, CAST(strftime('%s','now') AS INTEGER) * 1000 FROM estados_lista;
DELETE FROM estados_lista;
-- Cambios de precio de listas viejas que seguían pendientes ya no se pueden aplicar: quedan rechazados con el motivo.
UPDATE cambios_precio SET estado = 'RECHAZADO', resuelto_rol = 'Sistema', resuelto_ts = CAST(strftime('%s','now') AS INTEGER) * 1000, motivo = 'Las listas por zona se archivaron: el precio ahora va por categoría.'
  WHERE estado = 'PENDIENTE' AND clave LIKE 'L:%';

-- 2.1 Vendedor unificado: un vendedor de la lista puede venir de un empleado con cargo «Vendedor» (el vínculo evita duplicarlo).
ALTER TABLE vendedores ADD COLUMN empleado_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS vendedores_empleado ON vendedores (empleado_id) WHERE empleado_id IS NOT NULL;
