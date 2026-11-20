-- 0040 · Bono nocturno: bono por trabajar de noche, para quien marcó asistencia en el turno Nocturno. Se SUMA a los otros bonos.
-- El monto NO está definido: nace en $0 (no paga) y Gerencia lo escribe en Bonos. Nada se inventa.
-- Reconstruye bonos_esquemas (SQLite no deja ampliar la lista de medidas permitidas): copia todo lo que había y agrega la medida «asistencia_nocturna».
-- Se puede correr de nuevo sin dañar nada. Aplicar SOLO con --local hasta que el dueño autorice.
CREATE TABLE bonos_esquemas_nueva (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  forma TEXT NOT NULL CHECK (forma IN ('meta_fija','escalones','por_unidad','actividad')),
  fuente TEXT NOT NULL CHECK (fuente IN ('bultos_empaque','kilos_empaque','kilos_fritado','fritura','actividad','asistencia_nocturna')),
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
INSERT INTO bonos_esquemas_nueva (id, codigo, nombre, forma, fuente, quienes, params, activo, archivado, base, creado_ts, actualizado_ts, quien, destino, desde_ts)
  SELECT id, codigo, nombre, forma, fuente, quienes, params, activo, archivado, base, creado_ts, actualizado_ts, quien, destino, desde_ts FROM bonos_esquemas;
DROP TABLE bonos_esquemas;
ALTER TABLE bonos_esquemas_nueva RENAME TO bonos_esquemas;
INSERT OR IGNORE INTO bonos_esquemas (codigo, nombre, forma, fuente, quienes, params, base, creado_ts, actualizado_ts, quien) VALUES
  ('nocturno', 'Bono nocturno', 'actividad', 'asistencia_nocturna', 'turno', '{"monto":0}', 1, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, 'sistema');
