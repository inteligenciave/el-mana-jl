-- 0038 · Crear bonos nuevos (solo Gerencia): nuevas medidas y destinatarios, y «rige desde el siguiente turno».
-- Reconstruye bonos_esquemas (SQLite no deja ampliar las listas permitidas de una columna). No pierde datos: copia todo lo que había.
-- Nuevo: fuente «actividad»; quienes «grupo_turno», «area», «actividad»; destino (JSON: el área o la actividad elegida); desde_ts (instante desde el que rige; 0 = siempre).
-- Aplicar SOLO con --local hasta que el dueño autorice.
CREATE TABLE bonos_esquemas_nueva (
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
  destino TEXT,                                -- JSON: {"area":"Empaque"} o {"etapa":"fritado"} según «quienes»
  desde_ts INTEGER NOT NULL DEFAULT 0          -- el bono rige para turnos que empiezan en este instante o después
);
INSERT INTO bonos_esquemas_nueva (id, codigo, nombre, forma, fuente, quienes, params, activo, archivado, base, creado_ts, actualizado_ts, quien, destino, desde_ts)
  SELECT id, codigo, nombre, forma, fuente, quienes, params, activo, archivado, base, creado_ts, actualizado_ts, quien, NULL, 0 FROM bonos_esquemas;
DROP TABLE bonos_esquemas;
ALTER TABLE bonos_esquemas_nueva RENAME TO bonos_esquemas;
