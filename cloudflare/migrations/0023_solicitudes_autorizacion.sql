-- Solicitudes de autorización: un puesto pide al Gerente permiso para cambiar algo. Solo agrega. Aplicar SOLO con --local.
CREATE TABLE IF NOT EXISTS solicitudes_autorizacion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rol TEXT NOT NULL,
  pantalla TEXT,
  asunto TEXT NOT NULL,
  motivo TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','APROBADA','RECHAZADA')),
  respuesta TEXT,
  creado_ts INTEGER NOT NULL,
  resuelto_ts INTEGER,
  resuelto_por TEXT
);
CREATE INDEX IF NOT EXISTS ix_solic_rol ON solicitudes_autorizacion (rol, creado_ts);
CREATE INDEX IF NOT EXISTS ix_solic_estado ON solicitudes_autorizacion (estado, creado_ts);
