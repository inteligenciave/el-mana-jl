-- Flota: tipo «Autobús», capacidad de pasajeros y ubicación anotada a mano (sin GPS). Solo agrega. Aplicar SOLO con --local.
-- SQLite no permite ampliar la lista de tipos de una tabla ya creada: se reconstruye la tabla conservando todos sus datos.
CREATE TABLE flota_nueva (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  placa TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('CAMION','FURGONETA','MONTACARGAS','AUTOBUS','OTRO')),
  marca_modelo TEXT,
  capacidad_bultos INTEGER,
  capacidad_kg REAL,
  estado TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','EN_TALLER','FUERA_SERVICIO')),
  seguro_vence TEXT,
  documentos_vence TEXT,
  chofer_id TEXT,
  creado_ts INTEGER NOT NULL,
  actualizado_ts INTEGER,
  capacidad_pasajeros INTEGER,
  ubicacion TEXT NOT NULL DEFAULT 'PLANTA' CHECK (ubicacion IN ('PLANTA','RUTA')),  -- aplica a vehículos ACTIVOS; taller y fuera de servicio salen de «estado»
  destino TEXT,                      -- texto corto (máx. 60) cuando está en ruta
  carga_kg REAL,                     -- carga anotada a mano al salir en ruta (si no hay salida vinculada)
  salida_id INTEGER,                 -- salida de despacho vinculada (salidas.id_salida)
  ubicacion_ts INTEGER,              -- fecha y hora del último cambio de ubicación
  ubicacion_rol TEXT                 -- quién lo hizo
);
INSERT INTO flota_nueva (id, placa, tipo, marca_modelo, capacidad_bultos, capacidad_kg, estado, seguro_vence, documentos_vence, chofer_id, creado_ts, actualizado_ts)
  SELECT id, placa, tipo, marca_modelo, capacidad_bultos, capacidad_kg, estado, seguro_vence, documentos_vence, chofer_id, creado_ts, actualizado_ts FROM flota;
DROP TABLE flota;
ALTER TABLE flota_nueva RENAME TO flota;
CREATE UNIQUE INDEX IF NOT EXISTS flota_placa ON flota (placa COLLATE NOCASE);
