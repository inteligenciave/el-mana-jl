-- Reversa de 0040. Quita el bono nocturno y vuelve bonos_esquemas a la forma de 0038 (sin la medida «asistencia_nocturna»).
-- Los bonos nocturnos ya aplicados (bonos_aplicados / bonos_aplicados_emp) no se tocan: siguen contando en la nómina.
CREATE TABLE bonos_esquemas_vieja (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  forma TEXT NOT NULL CHECK (forma IN ('meta_fija','escalones','por_unidad','actividad')),
  fuente TEXT NOT NULL CHECK (fuente IN ('bultos_empaque','kilos_empaque','kilos_fritado','fritura','actividad')),
  quienes TEXT NOT NULL CHECK (quienes IN ('turno','empaque','fritura','grupo_turno','area','actividad')),
  params TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1,
  archivado INTEGER NOT NULL DEFAULT 0,
  base INTEGER NOT NULL DEFAULT 0,
  creado_ts INTEGER NOT NULL,
  actualizado_ts INTEGER NOT NULL,
  quien TEXT,
  destino TEXT,
  desde_ts INTEGER NOT NULL DEFAULT 0
);
INSERT INTO bonos_esquemas_vieja (id, codigo, nombre, forma, fuente, quienes, params, activo, archivado, base, creado_ts, actualizado_ts, quien, destino, desde_ts)
  SELECT id, codigo, nombre, forma, fuente, quienes, params, activo, archivado, base, creado_ts, actualizado_ts, quien, destino, desde_ts FROM bonos_esquemas WHERE fuente <> 'asistencia_nocturna';
DROP TABLE bonos_esquemas;
ALTER TABLE bonos_esquemas_vieja RENAME TO bonos_esquemas;
