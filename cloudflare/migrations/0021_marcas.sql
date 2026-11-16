-- Marcas diarias de entrada y salida del personal (En planta hoy). Solo agrega. Aplicar SOLO con --local.
CREATE TABLE IF NOT EXISTS marcas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empleado_id TEXT NOT NULL,          -- id de la persona en la colección «empleados»
  fecha TEXT NOT NULL,                -- AAAA-MM-DD en hora de Venezuela (UTC-4)
  entrada_ts INTEGER NOT NULL,
  salida_ts INTEGER,                  -- vacío mientras la persona sigue en planta
  turno TEXT NOT NULL CHECK (turno IN ('Mañana','Tarde')),
  quien TEXT NOT NULL,                -- puesto que marcó la entrada
  creado_ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS marcas_fecha ON marcas (fecha);
-- Una sola entrada abierta por persona y día
CREATE UNIQUE INDEX IF NOT EXISTS marcas_abierta ON marcas (empleado_id, fecha) WHERE salida_ts IS NULL;
