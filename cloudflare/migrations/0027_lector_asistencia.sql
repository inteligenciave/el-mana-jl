-- Importar del lector de huellas (Hikvision): marcas crudas aparte + asistencia derivada por persona y día. Solo agrega. Aplicar SOLO con --local hasta que el dueño autorice.
-- Marcas tal como las dio el lector (nunca se editan). La clave única evita duplicar si se importa el mismo archivo dos veces.
CREATE TABLE IF NOT EXISTS lector_marcas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL,               -- «Person ID» del lector, sin la comilla inicial
  momento TEXT NOT NULL,              -- AAAA-MM-DD HH:MM:SS (hora de Venezuela, como la da el lector)
  fecha TEXT NOT NULL,                -- AAAA-MM-DD
  ts INTEGER NOT NULL,                -- instante (ms)
  nombre_lector TEXT,                 -- nombre escrito en el lector (puede estar incompleto: no se usa para identificar)
  departamento TEXT,
  punto TEXT,
  fuente TEXT NOT NULL DEFAULT 'archivo',   -- archivo | envio
  quien TEXT NOT NULL,
  creado_ts INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS lector_marcas_uno ON lector_marcas (codigo, momento);
CREATE INDEX IF NOT EXISTS lector_marcas_fecha ON lector_marcas (fecha);
-- Lo entendido por persona y día. Solo «confirmado» alimenta la asistencia (se copia a «marcas»).
CREATE TABLE IF NOT EXISTS lector_dias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL,
  fecha TEXT NOT NULL,
  empleado_id TEXT,                   -- vacío mientras el código no esté asociado a una persona
  estado TEXT NOT NULL CHECK (estado IN ('codigo_nuevo','por_revisar','sin_turno','confirmado','descartado')),
  motivo TEXT,
  turno TEXT,
  entrada_ts INTEGER,
  salida_ts INTEGER,
  n_marcas INTEGER NOT NULL DEFAULT 0,
  decidio TEXT,                       -- puesto que confirmó/descartó (vacío si fue automático)
  ts INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS lector_dias_uno ON lector_dias (codigo, fecha);
CREATE INDEX IF NOT EXISTS lector_dias_estado ON lector_dias (estado, fecha);
-- De dónde viene cada marca de la asistencia (vacío = marcada a mano en «En planta hoy»)
ALTER TABLE marcas ADD COLUMN origen TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS marcas_lector_uno ON marcas (empleado_id, fecha) WHERE origen = 'lector';
