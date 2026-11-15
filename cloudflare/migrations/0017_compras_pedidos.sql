-- Pedidos de compra al proveedor («Hacer una compra»). Solo agrega tablas. Aplicar SOLO con --local.
-- Estado: PEDIDA (esperando que Recepción reciba la mercancía) -> RECIBIDA (cuando se enlace con la recepción) | ANULADA.
CREATE TABLE IF NOT EXISTS compras_pedidos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nro TEXT NOT NULL UNIQUE,
  proveedor_id TEXT NOT NULL,
  proveedor_nombre TEXT NOT NULL,
  fecha TEXT NOT NULL,
  factura TEXT NOT NULL,
  factura_norm TEXT NOT NULL,
  condicion TEXT NOT NULL CHECK (condicion IN ('CONTADO','CREDITO')),
  plazo_dias INTEGER,
  id_banco INTEGER,
  banco_nombre TEXT,
  tasa REAL NOT NULL,
  total_usd_cents INTEGER NOT NULL,
  total_bs_cents INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'PEDIDA' CHECK (estado IN ('PEDIDA','RECIBIDA','ANULADA')),
  rol TEXT NOT NULL,
  creado_ts INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS compras_pedidos_factura ON compras_pedidos (proveedor_id, factura_norm);
CREATE INDEX IF NOT EXISTS compras_pedidos_estado ON compras_pedidos (estado, id);
CREATE TABLE IF NOT EXISTS compras_pedido_lineas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL REFERENCES compras_pedidos(id),
  producto_id TEXT NOT NULL,
  producto_nombre TEXT NOT NULL,
  unidad TEXT NOT NULL,
  cantidad REAL NOT NULL CHECK (cantidad > 0),
  precio_usd REAL NOT NULL CHECK (precio_usd > 0),
  subtotal_cents INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS compras_lineas_pedido ON compras_pedido_lineas (pedido_id);
