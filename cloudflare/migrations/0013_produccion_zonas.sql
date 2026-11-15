-- F6 + F8 (etapas 3 a 7): inventario único apartado por pedido, turnos de producción, pedidos por zona y salidas.
-- Inventario único del producto terminado = productos.stock_entero (bultos físicos). Lo que está apartado por pedidos = stock_apartado.
-- Disponible para vender = stock_entero - stock_apartado. Esta migración NO carga cifras de negocio (solo la meta fija de 15 t).

ALTER TABLE productos ADD COLUMN stock_apartado INTEGER NOT NULL DEFAULT 0 CHECK (stock_apartado >= 0);

-- Nunca se aparta más de lo que hay (también frena a dos personas que piden el último bulto al mismo tiempo: el lote entero se revierte)
CREATE TRIGGER IF NOT EXISTS trg_apartado_maximo AFTER UPDATE OF stock_apartado, stock_entero ON productos
WHEN NEW.stock_apartado > NEW.stock_entero
BEGIN SELECT RAISE(ABORT, 'SIN_STOCK_DISPONIBLE'); END;

ALTER TABLE movimientos_inventario ADD COLUMN id_turno INTEGER;
ALTER TABLE movimientos_inventario ADD COLUMN nota TEXT;
ALTER TABLE documentos_venta ADD COLUMN id_pedido INTEGER;
ALTER TABLE documentos_venta ADD COLUMN id_salida INTEGER;
ALTER TABLE documento_lineas ADD COLUMN kg_por_bulto REAL;

-- Pedido de venta: aparta bultos; la nota de entrega o factura se emite al DESPACHAR. Sin claves foráneas (como el portal): «Borrar ejemplo» no debe fallar.
CREATE TABLE IF NOT EXISTS pedidos_venta (
  id_pedido INTEGER PRIMARY KEY AUTOINCREMENT,
  nro TEXT NOT NULL UNIQUE,
  id_cliente INTEGER NOT NULL,
  estado_ve TEXT,                              -- estado de Venezuela del cliente al vender (congelado)
  zona TEXT NOT NULL,                          -- zona de despacho (sale del estado; congelada)
  estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','PARCIAL','DESPACHADO','ANULADO')),
  tipo TEXT NOT NULL CHECK (tipo IN ('NOTA_ENTREGA','FACTURA')),
  fecha TEXT NOT NULL,
  creado_ts INTEGER NOT NULL,
  creado_rol TEXT,
  creado_rol_cod TEXT,
  id_vendedor INTEGER,
  descuento_pct REAL,
  metodo_pago TEXT,
  observaciones TEXT,
  lista_precios TEXT,
  pago_json TEXT,                              -- «pagó ahora»: banco y referencia; se cobra al emitir el primer documento
  ejemplo INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS pedv_estado ON pedidos_venta (estado, zona);
CREATE INDEX IF NOT EXISTS pedv_cliente ON pedidos_venta (id_cliente, estado);

CREATE TABLE IF NOT EXISTS pedido_venta_lineas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_pedido INTEGER NOT NULL,
  id_producto INTEGER NOT NULL,
  sku TEXT NOT NULL,
  nombre TEXT NOT NULL,
  bultos INTEGER NOT NULL CHECK (bultos > 0),
  bultos_despachados INTEGER NOT NULL DEFAULT 0 CHECK (bultos_despachados >= 0),
  bultos_anulados INTEGER NOT NULL DEFAULT 0 CHECK (bultos_anulados >= 0),
  kg_por_bulto REAL NOT NULL,                  -- congelado al vender
  precio_base_cents INTEGER NOT NULL,
  precio_pp_cents INTEGER NOT NULL,
  precio_mora_cents INTEGER NOT NULL,
  alicuota REAL NOT NULL,
  CHECK (bultos_despachados + bultos_anulados <= bultos)
);
CREATE INDEX IF NOT EXISTS pedvl_pedido ON pedido_venta_lineas (id_pedido);

-- Salidas (despachos por zona)
CREATE TABLE IF NOT EXISTS salidas (
  id_salida INTEGER PRIMARY KEY AUTOINCREMENT,
  nro TEXT NOT NULL UNIQUE,
  zona TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'ARMANDO' CHECK (estado IN ('ARMANDO','DESPACHADA','ANULADA')),
  kilos REAL NOT NULL DEFAULT 0,
  meta_kg REAL,                                -- meta vigente cuando se armó
  motivo TEXT,                                 -- obligatorio si sale con menos de la meta
  vehiculo TEXT,
  chofer TEXT,
  creado_ts INTEGER NOT NULL,
  creado_rol TEXT,
  despachada_ts INTEGER,
  despachada_rol TEXT
);
CREATE TABLE IF NOT EXISTS salida_lineas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_salida INTEGER NOT NULL,
  id_pedido INTEGER NOT NULL,
  id_linea INTEGER NOT NULL,                   -- pedido_venta_lineas.id
  id_producto INTEGER NOT NULL,
  bultos INTEGER NOT NULL CHECK (bultos > 0),
  kilos REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS salil_salida ON salida_lineas (id_salida);
CREATE INDEX IF NOT EXISTS salil_linea ON salida_lineas (id_linea);
CREATE TABLE IF NOT EXISTS salida_documentos (
  id_salida INTEGER NOT NULL,
  id_pedido INTEGER NOT NULL,
  id_documento INTEGER NOT NULL,
  PRIMARY KEY (id_salida, id_pedido)
);

-- Pausa de una zona (no compite en el orden ni se le arma salida hasta reanudarla)
CREATE TABLE IF NOT EXISTS zona_pausas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zona TEXT NOT NULL,
  motivo TEXT NOT NULL,
  desde_ts INTEGER NOT NULL,
  rol TEXT,
  reanudada_ts INTEGER,
  reanuda_rol TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS zona_pausa_activa ON zona_pausas (zona) WHERE reanudada_ts IS NULL;

-- Turnos de producción: kilos que entran y salen de cada etapa y bultos empacados por presentación
CREATE TABLE IF NOT EXISTS turnos (
  id_turno INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'ABIERTO' CHECK (estado IN ('ABIERTO','CERRADO')),
  abierto_ts INTEGER NOT NULL,
  abierto_rol TEXT,
  cerrado_ts INTEGER,
  cerrado_rol TEXT,
  observaciones TEXT,
  cierre_json TEXT                             -- declarado, registrado y diferencias al cerrar
);
CREATE UNIQUE INDEX IF NOT EXISTS turno_abierto ON turnos (estado) WHERE estado = 'ABIERTO';
CREATE TABLE IF NOT EXISTS movimientos_proceso (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_turno INTEGER NOT NULL,
  etapa TEXT NOT NULL CHECK (etapa IN ('recepcion','lavado','fritado','empacado')),
  sentido TEXT NOT NULL CHECK (sentido IN ('ENTRA','SALE')),
  kilos REAL NOT NULL CHECK (kilos > 0),
  nota TEXT,
  rol TEXT,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS movp_turno ON movimientos_proceso (id_turno);
CREATE TABLE IF NOT EXISTS empaque_turno (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_turno INTEGER NOT NULL,
  id_producto INTEGER NOT NULL,
  bultos INTEGER NOT NULL CHECK (bultos > 0),
  rol TEXT,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS empt_turno ON empaque_turno (id_turno);

-- Ajustes de producción: la meta de 15 t es fija y solo el Dueño la cambia. Los cortes del semáforo y la tolerancia los carga el Dueño después (vacíos = no se inventan).
INSERT OR IGNORE INTO config (clave, valor) VALUES ('meta_zona_kg', '15000'), ('semaforo_ambar_kg', ''), ('tolerancia_cierre_kg', ''), ('conteo_inicial_ts', '');
INSERT OR IGNORE INTO secuencias (nombre, n) VALUES ('pedido_venta', 0), ('salida', 0);
