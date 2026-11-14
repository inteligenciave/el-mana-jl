/* Portal del cliente. Sin claves foráneas a propósito: «Borrar datos de ejemplo» de Ventas elimina clientes y no debe fallar por estas tablas. */
CREATE TABLE IF NOT EXISTS cliente_enlaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_cliente INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,            -- SHA-256 del código; el código nunca se guarda
  token_fin TEXT NOT NULL,                    -- últimos 4 caracteres, solo para reconocerlo en la ficha
  creado_ts INTEGER NOT NULL,
  creado_rol TEXT,
  vence_ts INTEGER,                           -- vacío = no vence
  revocado_ts INTEGER,
  revocado_rol TEXT,
  ultimo_uso_ts INTEGER
);
CREATE INDEX IF NOT EXISTS enlaces_cli ON cliente_enlaces (id_cliente);

CREATE TABLE IF NOT EXISTS portal_intentos (
  ip TEXT NOT NULL,
  ventana INTEGER NOT NULL,                   -- bloque de 15 minutos
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip, ventana)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS pedidos_portal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_cliente INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'POR_CONFIRMAR' CHECK (estado IN ('POR_CONFIRMAR','APROBANDO','APROBADO','RECHAZADO','CANCELADO')),
  total_cents INTEGER NOT NULL,
  nota TEXT,
  creado_ts INTEGER NOT NULL,
  id_enlace INTEGER,
  resuelto_ts INTEGER,
  resuelto_rol TEXT,
  motivo_rechazo TEXT,
  id_documento INTEGER,
  ejemplo INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS pedp_cli ON pedidos_portal (id_cliente, estado);

CREATE TABLE IF NOT EXISTS pedido_portal_lineas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_pedido INTEGER NOT NULL,
  id_producto INTEGER NOT NULL,
  sku TEXT NOT NULL,
  nombre TEXT NOT NULL,
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  precio_cents INTEGER NOT NULL,
  alicuota REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS pedpl_ped ON pedido_portal_lineas (id_pedido);

CREATE TABLE IF NOT EXISTS pagos_reportados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_cliente INTEGER NOT NULL,
  fecha_pago TEXT NOT NULL,
  banco TEXT NOT NULL,
  referencia TEXT NOT NULL,
  ref_norm TEXT NOT NULL,
  dup_key TEXT,
  monto_bs_cents INTEGER NOT NULL,
  nota TEXT,
  estado TEXT NOT NULL DEFAULT 'POR_VERIFICAR' CHECK (estado IN ('POR_VERIFICAR','VERIFICANDO','CONFIRMADO','RECHAZADO')),
  creado_ts INTEGER NOT NULL,
  id_enlace INTEGER,
  resuelto_ts INTEGER,
  resuelto_rol TEXT,
  motivo_rechazo TEXT,
  id_pago INTEGER,
  ejemplo INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS pagr_cli ON pagos_reportados (id_cliente, estado);
-- Misma regla que los pagos: banco + referencia no se repite (si la referencia es corta, también el monto)
CREATE UNIQUE INDEX IF NOT EXISTS pagr_dup ON pagos_reportados (dup_key) WHERE estado IN ('POR_VERIFICAR','VERIFICANDO','CONFIRMADO') AND dup_key IS NOT NULL;

INSERT OR IGNORE INTO secuencias (nombre, n) VALUES ('pedido_portal', 0), ('pago_reportado', 0);
