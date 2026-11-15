-- Flota de la empresa (vehículos) y vínculo con las salidas. Solo agrega. Aplicar SOLO con --local.
-- La flota empieza vacía: no se carga ningún vehículo por nuestra cuenta.
CREATE TABLE IF NOT EXISTS flota (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  placa TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('CAMION','FURGONETA','MONTACARGAS','OTRO')),
  marca_modelo TEXT,
  capacidad_bultos INTEGER,
  capacidad_kg REAL,
  estado TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','EN_TALLER','FUERA_SERVICIO')),
  seguro_vence TEXT,                 -- AAAA-MM-DD
  documentos_vence TEXT,             -- AAAA-MM-DD
  chofer_id TEXT,                    -- id de la persona en la colección «empleados» (chofer por defecto, opcional)
  creado_ts INTEGER NOT NULL,
  actualizado_ts INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS flota_placa ON flota (placa COLLATE NOCASE);
-- La salida guarda el id elegido; los textos vehiculo/chofer de siempre quedan como respaldo (salidas anteriores con texto libre).
ALTER TABLE salidas ADD COLUMN vehiculo_id INTEGER;
ALTER TABLE salidas ADD COLUMN chofer_id TEXT;
