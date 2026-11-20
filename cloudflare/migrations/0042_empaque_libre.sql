-- 0042 · Empaque de Logística sobre la papa a granel (sin necesidad de un turno abierto) y merma de empaque.
-- Solo agrega una tabla. tipo EMPAQUE = bultos anotados por Logística (suman al inventario de producto terminado al instante); MERMA = kilos perdidos al empacar.
CREATE TABLE IF NOT EXISTS empaque_libre (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL CHECK (tipo IN ('EMPAQUE','MERMA')),
  id_producto INTEGER,
  bultos INTEGER,
  kg REAL NOT NULL CHECK (kg > 0),
  motivo TEXT,
  ts INTEGER NOT NULL,
  rol TEXT,
  estado TEXT NOT NULL DEFAULT 'VIGENTE'
);
CREATE INDEX IF NOT EXISTS empl_tipo ON empaque_libre (tipo, estado);
