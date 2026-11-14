-- Cambios de precio con aprobación del Dueño. Sin claves foráneas (igual que portal y entregas): «Borrar datos de ejemplo» no debe fallar por esta tabla.
-- El Dueño cambia precios y rigen de una vez (queda en auditoría). Administración los PROPONE: queda un cambio pendiente y el valor anterior sigue vigente hasta que el Dueño apruebe.
CREATE TABLE IF NOT EXISTS cambios_precio (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL CHECK (tipo IN ('PRODUCTO','CLIENTE','CREDITO')),   -- precio por bulto del producto · precios especiales de un cliente · plazos y porcentajes de crédito
  clave TEXT NOT NULL,                      -- qué se cambia: 'P:12' producto, 'C:5' cliente, 'CRED' ajustes de crédito
  titulo TEXT NOT NULL,                     -- nombre que se muestra (producto, cliente o «Plazos y porcentajes de crédito»)
  detalle TEXT NOT NULL,                    -- JSON con lo anterior y lo nuevo, listo para aplicar
  estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','APROBADO','RECHAZADO')),
  pedido_rol TEXT NOT NULL,
  pedido_ts INTEGER NOT NULL,
  resuelto_rol TEXT,
  resuelto_ts INTEGER,
  motivo TEXT                               -- motivo del rechazo (opcional)
);
CREATE INDEX IF NOT EXISTS cp_estado ON cambios_precio (estado, id);
-- Solo un cambio pendiente por cada cosa que se cambia: evita pedidos duplicados y carreras
CREATE UNIQUE INDEX IF NOT EXISTS cp_pendiente_unico ON cambios_precio (clave) WHERE estado = 'PENDIENTE';
