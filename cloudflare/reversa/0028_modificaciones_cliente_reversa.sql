-- Reversa de 0028. Devuelve las listas archivadas a su sitio y quita los campos nuevos.
-- Se pierden: teléfono/cédula/RIF de los bancos, la categoría de cada cliente y el vínculo vendedor-empleado.
-- Los precios cargados en Minorista/Mayorista/Gran Mayor se quitan (las listas A/B/Propia vuelven a regir).
DELETE FROM precios_lista WHERE lista IN ('Minorista','Mayorista','Gran Mayor');
INSERT OR REPLACE INTO precios_lista (id_producto, lista, contado_cents, credito_cents, actualizado_ts)
  SELECT id_producto, lista, contado_cents, credito_cents, actualizado_ts FROM precios_lista_archivo;
INSERT OR REPLACE INTO estados_lista (estado, lista, actualizado_ts)
  SELECT estado, lista, actualizado_ts FROM estados_lista_archivo;
DROP TABLE IF EXISTS precios_lista_archivo;
DROP TABLE IF EXISTS estados_lista_archivo;
DROP INDEX IF EXISTS vendedores_empleado;
ALTER TABLE vendedores DROP COLUMN empleado_id;
ALTER TABLE clientes DROP COLUMN categoria_precio;
ALTER TABLE bancos DROP COLUMN rif;
ALTER TABLE bancos DROP COLUMN cedula;
ALTER TABLE bancos DROP COLUMN telefono;
