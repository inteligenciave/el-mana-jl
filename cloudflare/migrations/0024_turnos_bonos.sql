-- Bonos de producción por turno (se calculan con los kilos del turno y se aplican al turno o por persona). Solo agrega. Aplicar SOLO con --local.
CREATE TABLE IF NOT EXISTS bonos_turno (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,                -- AAAA-MM-DD (hora de Venezuela)
  turno TEXT NOT NULL CHECK (turno IN ('Mañana','Tarde')),
  modo TEXT NOT NULL CHECK (modo IN ('turno','persona')),
  kilos REAL NOT NULL DEFAULT 0,      -- kilos del turno con los que se calculó
  calculado REAL NOT NULL DEFAULT 0,  -- monto calculado por el sistema (Bs)
  total REAL NOT NULL DEFAULT 0,      -- monto repartido (Bs)
  detalle TEXT,                       -- JSON: cumplimiento, parámetros usados
  quien TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS bonos_turno_uno ON bonos_turno (fecha, turno);
CREATE TABLE IF NOT EXISTS bonos_turno_emp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bono_id INTEGER NOT NULL,
  empleado_id TEXT NOT NULL,
  fecha TEXT NOT NULL,
  monto REAL NOT NULL CHECK (monto >= 0)
);
CREATE INDEX IF NOT EXISTS bonos_emp_fecha ON bonos_turno_emp (empleado_id, fecha);
CREATE INDEX IF NOT EXISTS bonos_emp_bono ON bonos_turno_emp (bono_id);
