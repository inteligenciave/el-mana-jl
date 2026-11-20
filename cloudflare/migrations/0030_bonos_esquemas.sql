-- 0030 · Modificaciones del cliente, fase 3: bonos en dólares (esquemas editables, aplicación al cerrar el turno con opción de deshacer) y fritura por persona.
-- Solo agrega tablas y siembra los tres bonos nuevos. No borra nada: la regla vieja de bono (documento ajustes/turnos_bonos) y los bonos ya aplicados (bonos_turno) se conservan.
-- Aplicar SOLO con --local hasta que el dueño autorice.

-- Esquemas de bono. forma: meta_fija | escalones | por_unidad | actividad. fuente: de dónde sale lo medido. quienes: a quién se paga.
CREATE TABLE IF NOT EXISTS bonos_esquemas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,                 -- empaque | produccion | fritura | propio-N
  nombre TEXT NOT NULL,
  forma TEXT NOT NULL CHECK (forma IN ('meta_fija','escalones','por_unidad','actividad')),
  fuente TEXT NOT NULL CHECK (fuente IN ('bultos_empaque','kilos_empaque','kilos_fritado','fritura')),
  quienes TEXT NOT NULL CHECK (quienes IN ('turno','empaque','fritura')),
  params TEXT NOT NULL,                        -- JSON: metas y montos en DÓLARES
  activo INTEGER NOT NULL DEFAULT 1,
  archivado INTEGER NOT NULL DEFAULT 0,
  base INTEGER NOT NULL DEFAULT 0,             -- 1 = uno de los tres bonos de fábrica (no se cambia su forma ni su fuente)
  creado_ts INTEGER NOT NULL,
  actualizado_ts INTEGER NOT NULL,
  quien TEXT
);
INSERT OR IGNORE INTO bonos_esquemas (codigo, nombre, forma, fuente, quienes, params, base, creado_ts, actualizado_ts, quien) VALUES
  ('empaque', 'Bono Empaque', 'meta_fija', 'bultos_empaque', 'empaque', '{"meta":130,"monto":3,"metas_presentacion":[{"gramos":1000,"meta":130},{"gramos":400,"meta":130},{"gramos":200,"meta":150}]}', 1, 0, 0, 'sistema'),
  ('produccion', 'Bono Producción', 'por_unidad', 'kilos_empaque', 'turno', '{"meta":1700,"monto_base":3,"bloque":100,"monto_bloque":1}', 1, 0, 0, 'sistema'),
  ('fritura', 'Bono Fritura', 'actividad', 'fritura', 'fritura', '{"monto":3}', 1, 0, 0, 'sistema');

-- Bonos aplicados por esquema, turno y día (el turno nocturno pertenece al día en que empieza). APLICADO entra a la nómina; REVISION = deshecho, no se paga.
CREATE TABLE IF NOT EXISTS bonos_aplicados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  esquema_id INTEGER NOT NULL,
  esquema_nombre TEXT NOT NULL,
  fecha TEXT NOT NULL,
  turno TEXT NOT NULL CHECK (turno IN ('Diurno','Nocturno')),
  estado TEXT NOT NULL DEFAULT 'APLICADO' CHECK (estado IN ('APLICADO','REVISION')),
  origen TEXT NOT NULL DEFAULT 'auto',         -- auto (al cerrar el turno) | manual
  medida REAL NOT NULL DEFAULT 0,
  monto_persona REAL NOT NULL DEFAULT 0,       -- USD
  total REAL NOT NULL DEFAULT 0,               -- USD
  detalle TEXT,
  quien TEXT NOT NULL,
  ts INTEGER NOT NULL,
  deshecho_quien TEXT,
  deshecho_ts INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS bonos_aplicados_uno ON bonos_aplicados (esquema_id, fecha, turno);
CREATE INDEX IF NOT EXISTS bonos_aplicados_fecha ON bonos_aplicados (fecha);
CREATE TABLE IF NOT EXISTS bonos_aplicados_emp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  aplicado_id INTEGER NOT NULL,
  empleado_id TEXT NOT NULL,
  fecha TEXT NOT NULL,
  monto REAL NOT NULL CHECK (monto >= 0)       -- USD
);
CREATE INDEX IF NOT EXISTS bonos_ap_emp ON bonos_aplicados_emp (empleado_id, fecha);
CREATE INDEX IF NOT EXISTS bonos_ap_id ON bonos_aplicados_emp (aplicado_id);

-- Archivo de lo viejo (sin uso, solo consulta): la regla de bono única anterior
CREATE TABLE IF NOT EXISTS bonos_archivo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  origen TEXT NOT NULL,
  data TEXT NOT NULL,
  nota TEXT,
  ts INTEGER NOT NULL
);
INSERT INTO bonos_archivo (origen, data, nota, ts)
  SELECT 'regla_anterior', json_extract(data, '$.bono'), 'Regla de bono de producción anterior (una sola, por turno). Quedó fuera de uso; el valor original en bolívares está en nomina_bs_respaldo si hubo conversión.', CAST(strftime('%s','now') AS INTEGER) * 1000
  FROM docs WHERE col = 'ajustes' AND id = 'turnos_bonos' AND json_extract(data, '$.bono') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM bonos_archivo WHERE origen = 'regla_anterior');

-- Personas por etapa (fritura): quién ejecutó la etapa dentro del turno de producción
CREATE TABLE IF NOT EXISTS etapa_personas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_turno INTEGER NOT NULL,
  etapa TEXT NOT NULL CHECK (etapa IN ('recepcion','lavado','fritado','empacado')),
  empleado_id TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'VIGENTE' CHECK (estado IN ('VIGENTE','ANULADO')),
  ts INTEGER NOT NULL,
  rol TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS etapa_personas_uno ON etapa_personas (id_turno, etapa, empleado_id) WHERE estado = 'VIGENTE';
CREATE INDEX IF NOT EXISTS etapa_personas_ts ON etapa_personas (etapa, ts);
