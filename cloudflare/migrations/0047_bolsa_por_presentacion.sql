-- 0047 · Una bolsa por cada presentación de producto terminado (en vez de un solo artículo «Bolsas de presentación»).
-- · «empaque» pasa a llamarse «Bolsas sin presentación»: conserva su historial y su saldo para que Gerencia/Administración lo repartan entre presentaciones.
-- · Cada presentación de papa (productos PAPAS) tiene su artículo «Bolsa <presentación>» con código bolsa-<id_producto>, con su propia existencia, mínimo y compras. La lista sale sola:
--   al crear/renombrar/archivar una presentación, un disparador crea/renombra/archiva su bolsa. Sin creación manual. Los bolsones no cambian.
-- · inv_movimientos admite el origen «reparto» (mover bolsas sin presentación a una presentación): se reconstruye la tabla conservando todo.
UPDATE inv_articulos SET nombre = 'Bolsas sin presentación' WHERE codigo = 'empaque';
CREATE TABLE inv_movimientos_n (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  articulo TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('ENTRADA','SALIDA')),
  cantidad REAL NOT NULL CHECK (cantidad > 0),
  origen TEXT NOT NULL CHECK (origen IN ('conteo_inicial','compra','consumo','merma','reparto')),
  ref TEXT NOT NULL,
  id_turno INTEGER,
  nota TEXT,
  rol TEXT,
  ts INTEGER NOT NULL
);
INSERT INTO inv_movimientos_n (id, articulo, tipo, cantidad, origen, ref, id_turno, nota, rol, ts) SELECT id, articulo, tipo, cantidad, origen, ref, id_turno, nota, rol, ts FROM inv_movimientos;
DROP TABLE inv_movimientos;
ALTER TABLE inv_movimientos_n RENAME TO inv_movimientos;
CREATE UNIQUE INDEX IF NOT EXISTS inv_mov_ref ON inv_movimientos (origen, ref, articulo);
CREATE INDEX IF NOT EXISTS inv_mov_art ON inv_movimientos (articulo, ts);
-- Una bolsa por cada presentación de papa que ya existe (las archivadas quedan archivadas)
INSERT OR IGNORE INTO inv_articulos (codigo, nombre, unidad, minimo, orden, activo)
  SELECT 'bolsa-' || id_producto, 'Bolsa ' || nombre || CASE WHEN gramaje IS NOT NULL AND gramaje <> '' AND instr(nombre, gramaje) = 0 THEN ' ' || gramaje ELSE '' END, 'und', 0, 100 + id_producto, activo
  FROM productos WHERE categoria = 'PAPAS';
-- Presentación nueva → su bolsa aparece sola
CREATE TRIGGER IF NOT EXISTS trg_bolsa_presentacion_nueva AFTER INSERT ON productos WHEN NEW.categoria = 'PAPAS'
BEGIN
  INSERT OR IGNORE INTO inv_articulos (codigo, nombre, unidad, minimo, orden, activo)
  VALUES ('bolsa-' || NEW.id_producto, 'Bolsa ' || NEW.nombre || CASE WHEN NEW.gramaje IS NOT NULL AND NEW.gramaje <> '' AND instr(NEW.nombre, NEW.gramaje) = 0 THEN ' ' || NEW.gramaje ELSE '' END, 'und', 0, 100 + NEW.id_producto, NEW.activo);
END;
-- Presentación renombrada, archivada o que pasa a ser de papa → su bolsa la sigue
CREATE TRIGGER IF NOT EXISTS trg_bolsa_presentacion_cambia AFTER UPDATE OF nombre, gramaje, activo, categoria ON productos WHEN NEW.categoria = 'PAPAS'
BEGIN
  INSERT OR IGNORE INTO inv_articulos (codigo, nombre, unidad, minimo, orden, activo)
  VALUES ('bolsa-' || NEW.id_producto, 'Bolsa ' || NEW.nombre, 'und', 0, 100 + NEW.id_producto, NEW.activo);
  UPDATE inv_articulos SET activo = NEW.activo, nombre = 'Bolsa ' || NEW.nombre || CASE WHEN NEW.gramaje IS NOT NULL AND NEW.gramaje <> '' AND instr(NEW.nombre, NEW.gramaje) = 0 THEN ' ' || NEW.gramaje ELSE '' END
  WHERE codigo = 'bolsa-' || NEW.id_producto;
END;
