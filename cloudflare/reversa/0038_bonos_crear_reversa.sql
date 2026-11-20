-- Reversa de 0038. Vuelve bonos_esquemas a la forma de 0030 (sin destino ni «rige desde»).
-- Se pierden los bonos creados con las medidas o destinatarios nuevos (fuente «actividad»; quienes «grupo_turno», «area», «actividad»): no caben en la tabla anterior.
-- Los bonos ya aplicados (bonos_aplicados / bonos_aplicados_emp) no se tocan: siguen contando en la nómina.
CREATE TABLE bonos_esquemas_vieja (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  forma TEXT NOT NULL CHECK (forma IN ('meta_fija','escalones','por_unidad','actividad')),
  fuente TEXT NOT NULL CHECK (fuente IN ('bultos_empaque','kilos_empaque','kilos_fritado','fritura')),
  quienes TEXT NOT NULL CHECK (quienes IN ('turno','empaque','fritura')),
  params TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1,
  archivado INTEGER NOT NULL DEFAULT 0,
  base INTEGER NOT NULL DEFAULT 0,
  creado_ts INTEGER NOT NULL,
  actualizado_ts INTEGER NOT NULL,
  quien TEXT
);
INSERT INTO bonos_esquemas_vieja (id, codigo, nombre, forma, fuente, quienes, params, activo, archivado, base, creado_ts, actualizado_ts, quien)
  SELECT id, codigo, nombre, forma, fuente, quienes, params, activo, archivado, base, creado_ts, actualizado_ts, quien FROM bonos_esquemas
  WHERE fuente IN ('bultos_empaque','kilos_empaque','kilos_fritado','fritura') AND quienes IN ('turno','empaque','fritura');
DROP TABLE bonos_esquemas;
ALTER TABLE bonos_esquemas_vieja RENAME TO bonos_esquemas;
