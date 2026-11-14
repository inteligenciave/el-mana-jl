-- Módulo de Ventas y Liquidación Dual (+ cobranza). Contrato de datos.
-- Importes en dólares: centavos enteros (columnas *_cents). Todas las tablas llevan `ejemplo` (0/1) para poder borrar solo los datos de muestra.

CREATE TABLE IF NOT EXISTS vendedores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  comision_pct REAL,                       -- editable; vacío = sin porcentaje cargado (no se inventa)
  activo INTEGER NOT NULL DEFAULT 1,
  ejemplo INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS listas_precio (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  ejemplo INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS clientes (
  id_cliente INTEGER PRIMARY KEY AUTOINCREMENT,
  rif_id TEXT UNIQUE,
  razon_social TEXT NOT NULL,
  razon_norm TEXT NOT NULL,
  modalidad_despacho_pref TEXT NOT NULL DEFAULT 'NOTA_ENTREGA' CHECK (modalidad_despacho_pref IN ('NOTA_ENTREGA','FACTURA_DIRECTA')),
  id_lista_base INTEGER REFERENCES listas_precio(id),
  descuento_fijo_pct REAL,
  dias_pronto_pago INTEGER,
  dias_credito_normal INTEGER,
  limite_credito_cents INTEGER,
  saldo_deuda_cents INTEGER NOT NULL DEFAULT 0,   -- caché: se recalcula en cada escritura desde los documentos
  id_vendedor INTEGER REFERENCES vendedores(id),
  zona TEXT,
  telefono TEXT,
  origen TEXT NOT NULL DEFAULT 'manual',
  ejemplo INTEGER NOT NULL DEFAULT 0,
  creado_ts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS clientes_norm ON clientes (razon_norm);
CREATE INDEX IF NOT EXISTS clientes_social ON clientes (razon_social);

CREATE TABLE IF NOT EXISTS productos (
  id_producto INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo_sku TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  gramaje TEXT,
  categoria TEXT NOT NULL DEFAULT 'PAPAS' CHECK (categoria IN ('PAPAS','SALSAS')),
  imagen_blanca_url TEXT,
  stock_entero INTEGER NOT NULL DEFAULT 0 CHECK (stock_entero >= 0),
  alicuota_iva REAL NOT NULL DEFAULT 16,
  precio_ref_cents INTEGER,                        -- precio de referencia (distribuidor); base si el cliente no tiene regla
  activo INTEGER NOT NULL DEFAULT 1,
  orden INTEGER NOT NULL DEFAULT 0,
  ejemplo INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS reglas_precio_tiempo_cliente (
  id_regla INTEGER PRIMARY KEY AUTOINCREMENT,
  id_cliente INTEGER NOT NULL REFERENCES clientes(id_cliente),
  id_producto INTEGER NOT NULL REFERENCES productos(id_producto),
  precio_pronto_pago_cents INTEGER,
  precio_base_credito_cents INTEGER,
  precio_mora_vencido_cents INTEGER,
  pct_descuento_pp REAL,
  pct_recargo_mora REAL,
  ejemplo INTEGER NOT NULL DEFAULT 0,
  UNIQUE (id_cliente, id_producto)
);

CREATE TABLE IF NOT EXISTS documentos_venta (
  id_documento INTEGER PRIMARY KEY,               -- se asigna desde `secuencias`
  nro_control_interno TEXT NOT NULL UNIQUE,
  nro_factura_fiscal TEXT,
  numero_externo TEXT,                             -- N° N/E del Excel importado
  tipo_origen TEXT NOT NULL CHECK (tipo_origen IN ('NOTA_ENTREGA','FACTURA')),
  estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','FACTURADO_DESDE_NE','PAGADO','ANULADO')),
  fecha_emision TEXT NOT NULL,
  fecha_vencimiento TEXT,
  id_cliente INTEGER NOT NULL REFERENCES clientes(id_cliente),
  id_vendedor INTEGER REFERENCES vendedores(id),
  subtotal_base_cents INTEGER NOT NULL DEFAULT 0,
  descuento_pct REAL,
  descuento_cents INTEGER NOT NULL DEFAULT 0,
  iva_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  metodo_pago TEXT,
  observaciones TEXT,
  afecta_inventario INTEGER NOT NULL DEFAULT 1,
  id_ne_origen INTEGER,                            -- factura nacida de una nota de entrega
  sin_lineas INTEGER NOT NULL DEFAULT 0,           -- importado del Excel: solo monto, sin detalle
  caso_liquidacion INTEGER,
  fecha_liquidacion TEXT,
  origen TEXT NOT NULL DEFAULT 'manual',
  creado_rol TEXT,
  creado_ts INTEGER NOT NULL DEFAULT 0,
  ejemplo INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS doc_cliente ON documentos_venta (id_cliente, estado);
CREATE INDEX IF NOT EXISTS doc_fecha ON documentos_venta (fecha_emision);
CREATE UNIQUE INDEX IF NOT EXISTS doc_numext ON documentos_venta (numero_externo) WHERE numero_externo IS NOT NULL;

CREATE TABLE IF NOT EXISTS documento_lineas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_documento INTEGER NOT NULL REFERENCES documentos_venta(id_documento),
  id_producto INTEGER NOT NULL REFERENCES productos(id_producto),
  sku TEXT NOT NULL,
  nombre TEXT NOT NULL,
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  precio_base_cents INTEGER NOT NULL,
  precio_pp_cents INTEGER NOT NULL,                -- precios de los 3 casos, congelados al vender
  precio_mora_cents INTEGER NOT NULL,
  alicuota REAL NOT NULL,
  ejemplo INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS lin_doc ON documento_lineas (id_documento);

CREATE TABLE IF NOT EXISTS notas_ajuste_fiscal (
  id_nota_ajuste INTEGER PRIMARY KEY,
  id_factura_origen INTEGER NOT NULL REFERENCES documentos_venta(id_documento),
  tipo_nota TEXT NOT NULL CHECK (tipo_nota IN ('NOTA_CREDITO','NOTA_DEBITO')),
  nro_fiscal_nota TEXT,
  fecha_emision TEXT NOT NULL,
  motivo_ajuste TEXT,
  base_imponible_ajuste_cents INTEGER NOT NULL,
  iva_ajuste_cents INTEGER NOT NULL,
  total_ajuste_cents INTEGER NOT NULL,
  id_pago INTEGER,
  ejemplo INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS movimientos_inventario (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_producto INTEGER NOT NULL,
  cantidad INTEGER NOT NULL,                        -- negativo = salida
  tipo TEXT NOT NULL,
  id_documento INTEGER,
  fecha TEXT NOT NULL,
  ts INTEGER NOT NULL,
  ejemplo INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pagos (
  id_pago INTEGER PRIMARY KEY,                      -- número de recibo
  fecha_pago TEXT NOT NULL,
  id_cliente INTEGER NOT NULL REFERENCES clientes(id_cliente),
  id_vendedor INTEGER,
  monto_bs_cents INTEGER NOT NULL,
  tasa REAL NOT NULL,
  usd_cents INTEGER NOT NULL,
  banco TEXT,
  referencia TEXT,
  ref_norm TEXT,
  dup_key TEXT,
  estado TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','ANULADO')),
  motivo_anulacion TEXT,
  anulado_ts INTEGER,
  anulado_rol TEXT,
  observacion TEXT,
  retroactivo INTEGER NOT NULL DEFAULT 0,
  exonera_mora INTEGER NOT NULL DEFAULT 0,
  origen TEXT NOT NULL DEFAULT 'manual',
  creado_rol TEXT,
  creado_ts INTEGER NOT NULL DEFAULT 0,
  ejemplo INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS pagos_fecha ON pagos (fecha_pago);
CREATE INDEX IF NOT EXISTS pagos_cli ON pagos (id_cliente);
CREATE INDEX IF NOT EXISTS pagos_banco_ref ON pagos (ref_norm);
-- Un índice único parcial evita que dos guardados simultáneos dejen la misma referencia dos veces
CREATE UNIQUE INDEX IF NOT EXISTS pagos_dup ON pagos (dup_key) WHERE estado = 'ACTIVO' AND dup_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS pago_aplicaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_pago INTEGER NOT NULL REFERENCES pagos(id_pago),
  id_documento INTEGER NOT NULL REFERENCES documentos_venta(id_documento),
  usd_cents INTEGER NOT NULL CHECK (usd_cents > 0),
  liquido INTEGER NOT NULL DEFAULT 0,
  ejemplo INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS apl_doc ON pago_aplicaciones (id_documento);
CREATE INDEX IF NOT EXISTS apl_pago ON pago_aplicaciones (id_pago);

CREATE TABLE IF NOT EXISTS comisiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_documento INTEGER NOT NULL,
  id_pago INTEGER,
  id_vendedor INTEGER,
  base_neta_cents INTEGER NOT NULL,
  pct REAL,
  monto_cents INTEGER,
  fecha TEXT NOT NULL,
  ejemplo INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS asientos_contables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  id_documento INTEGER,
  id_pago INTEGER,
  concepto TEXT NOT NULL,
  lineas TEXT NOT NULL,                              -- JSON [{cuenta, debe, haber}] en centavos
  ejemplo INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS secuencias (
  nombre TEXT PRIMARY KEY,
  n INTEGER NOT NULL
) WITHOUT ROWID;
INSERT OR IGNORE INTO secuencias (nombre, n) VALUES ('documento', 0), ('pago', 0), ('nota_ajuste', 0), ('ne', 0), ('factura_ctl', 0), ('factura_fiscal', 0), ('nc_fiscal', 0), ('nd_fiscal', 0);

CREATE TABLE IF NOT EXISTS config (
  clave TEXT PRIMARY KEY,
  valor TEXT
) WITHOUT ROWID;
INSERT OR IGNORE INTO config (clave, valor) VALUES ('ref_corta_max', '6'), ('iva_pct_defecto', '16'), ('dias_alerta_deuda', ''),
  ('fiscal_prefijo_factura', ''), ('fiscal_prefijo_nc', ''), ('fiscal_prefijo_nd', ''),
  ('membrete_razon', ''), ('membrete_rif', ''), ('membrete_direccion', ''), ('membrete_telefono', ''), ('pin_hash', ''), ('pin_sal', '');

CREATE TABLE IF NOT EXISTS auditoria_sistema (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  rol TEXT,
  ent TEXT NOT NULL,
  ref TEXT,
  accion TEXT NOT NULL,
  detalle TEXT
);
CREATE INDEX IF NOT EXISTS aud_ts ON auditoria_sistema (ts);

-- Las 3 presentaciones oficiales del manual (SKU y precio de referencia del manual). El stock arranca en 0: se carga o se edita en pantalla.
INSERT OR IGNORE INTO productos (codigo_sku, nombre, gramaje, categoria, precio_ref_cents, orden) VALUES
 ('EMJL-PAP-400', 'Papas Doraditas Cabello de Ángel', '400 g', 'PAPAS', 180, 1),
 ('EMJL-PAP-1000', 'Papas Doraditas Cabello de Ángel', '1 kg', 'PAPAS', 420, 2),
 ('EMJL-PAP-200', 'Papas para Perros y Hamburguesas', '200 g', 'PAPAS', 100, 3);
