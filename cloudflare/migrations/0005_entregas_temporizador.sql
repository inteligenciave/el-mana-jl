/* Entrega con foto + temporizador de descuentos. Sin claves foráneas (igual que el portal): «Borrar datos de ejemplo» no debe fallar por estas tablas. */

/* Una foto de entrega por factura/nota. La foto va como texto base64 (JPEG ya comprimido en el navegador); `mini` es la miniatura para las listas. */
CREATE TABLE IF NOT EXISTS entregas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_documento INTEGER NOT NULL,
  fecha_hora TEXT NOT NULL,                 -- instante de la entrega (ISO UTC): desde aquí corren los días
  foto_ts INTEGER NOT NULL,                 -- lo mismo en milisegundos
  subido_ts INTEGER NOT NULL,
  subido_rol TEXT NOT NULL,                 -- quién subió la foto
  foto TEXT NOT NULL,                       -- JPEG en base64 (sin prefijo data:)
  mini TEXT,                                -- miniatura JPEG en base64
  foto_bytes INTEGER NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'SUBIDA' CHECK (estado IN ('SUBIDA','CONFIRMADA','RECHAZADA','REEMPLAZADA')),
  confirmado_ts INTEGER,
  confirmado_rol TEXT,
  motivo_rechazo TEXT,
  ejemplo INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ent_doc ON entregas (id_documento);
CREATE INDEX IF NOT EXISTS ent_estado ON entregas (estado);
/* Solo una entrega vigente por documento */
CREATE UNIQUE INDEX IF NOT EXISTS ent_vigente ON entregas (id_documento) WHERE estado IN ('SUBIDA','CONFIRMADA');

/* Ajustes de crédito: UNA fila. Los días son datos del dueño (7 y 21). Descuentos y recargo arrancan VACÍOS: no se inventan. */
CREATE TABLE IF NOT EXISTS ajustes_credito (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  dias_tramo1 INTEGER NOT NULL,
  dias_tramo2 INTEGER NOT NULL,
  descuento1_pct REAL,
  descuento2_pct REAL,
  recargo_mora_pct REAL,
  actualizado_ts INTEGER,
  actualizado_rol TEXT
);
INSERT OR IGNORE INTO ajustes_credito (id, dias_tramo1, dias_tramo2) VALUES (1, 7, 21);

/* «No recibí esto»: mientras está ABIERTA, el temporizador de ese documento está en pausa. */
CREATE TABLE IF NOT EXISTS disputas_entrega (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_documento INTEGER NOT NULL,
  id_cliente INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'ABIERTA' CHECK (estado IN ('ABIERTA','RESUELTA')),
  nota_cliente TEXT,
  creado_ts INTEGER NOT NULL,
  resuelto_ts INTEGER,
  resuelto_rol TEXT,
  resolucion TEXT CHECK (resolucion IN ('ENTREGA_VALIDA','NO_ENTREGADA')),
  nota_resolucion TEXT,
  ejemplo INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS disp_doc ON disputas_entrega (id_documento);
CREATE INDEX IF NOT EXISTS disp_cli ON disputas_entrega (id_cliente, estado);
CREATE UNIQUE INDEX IF NOT EXISTS disp_abierta ON disputas_entrega (id_documento) WHERE estado = 'ABIERTA';
