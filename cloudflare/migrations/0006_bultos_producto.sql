-- Etapa 2: peso por bulto del producto terminado. Vacío al inicio: NO se rellena con cifras inventadas.
-- Solo el Dueño y Administración lo cargan/corrigen (lo valida el servidor). Sin kg_por_bulto el producto no se puede vender.
ALTER TABLE productos ADD COLUMN kg_por_bulto REAL CHECK (kg_por_bulto IS NULL OR kg_por_bulto > 0);
ALTER TABLE productos ADD COLUMN unidades_por_bulto INTEGER CHECK (unidades_por_bulto IS NULL OR unidades_por_bulto > 0);
