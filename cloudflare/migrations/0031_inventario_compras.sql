-- 0031 · Modificaciones del cliente, fase 4: papa por saco (4.1), compra enlazada con su recepción y alarma de diferencia, aviso a Administración,
-- inventario general consolidado de materia prima e insumos y descuento por consumo y merma (4.2).
-- No borra nada: las recepciones y compras viejas quedan como estaban. Aplicar SOLO con --local hasta que el dueño autorice.
-- Las sentencias ADD COLUMN corren una sola vez (D1 lleva el registro de migraciones).

-- Enlace de la orden de compra con su recepción y con su validación
ALTER TABLE compras_pedidos ADD COLUMN recepcion_id TEXT;                          -- base de los números de recepción (REC-<nro>-1, REC-<nro>-2...)
ALTER TABLE compras_pedidos ADD COLUMN recibida_ts INTEGER;
ALTER TABLE compras_pedidos ADD COLUMN recibida_rol TEXT;
ALTER TABLE compras_pedidos ADD COLUMN con_diferencia INTEGER NOT NULL DEFAULT 0;  -- 1 = lo recibido difirió de lo comprado (confirmado con motivo)
ALTER TABLE compras_pedidos ADD COLUMN validada_ts INTEGER;
ALTER TABLE compras_pedidos ADD COLUMN validada_rol TEXT;

-- Diferencias entre lo comprado y lo recibido: una fila por producto, con el motivo escrito por quien confirmó
CREATE TABLE IF NOT EXISTS compras_diferencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nro TEXT NOT NULL,                       -- número del pedido de compra
  recepcion_id TEXT,
  producto_id TEXT NOT NULL,
  producto_nombre TEXT NOT NULL,
  unidad TEXT NOT NULL,
  comprado REAL NOT NULL,
  recibido REAL NOT NULL,
  diferencia REAL NOT NULL,                -- recibido - comprado (negativo = llegó menos)
  motivo TEXT NOT NULL,
  rol TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS compras_dif_nro ON compras_diferencias (nro);
CREATE INDEX IF NOT EXISTS compras_dif_ts ON compras_diferencias (ts);

-- Avisos dentro del sistema para Administración (alerta + tarjeta pendiente)
CREATE TABLE IF NOT EXISTS alertas_admin (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,                      -- RECEPCION_POR_VALIDAR
  ref TEXT NOT NULL,                       -- número del pedido
  titulo TEXT NOT NULL,
  detalle TEXT,                            -- JSON
  estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','ATENDIDA')),
  creado_ts INTEGER NOT NULL, creado_rol TEXT,
  atendida_ts INTEGER, atendida_rol TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS alertas_admin_ref ON alertas_admin (tipo, ref);
CREATE INDEX IF NOT EXISTS alertas_admin_estado ON alertas_admin (estado, id);

-- Inventario general: artículos y libro de movimientos (el saldo es la suma de movimientos desde el conteo inicial)
CREATE TABLE IF NOT EXISTS inv_articulos (
  codigo TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  unidad TEXT NOT NULL,
  minimo REAL NOT NULL DEFAULT 0,
  orden INTEGER NOT NULL DEFAULT 99,
  activo INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO inv_articulos (codigo, nombre, unidad, minimo, orden) VALUES
  ('papa', 'Papa cruda', 'kg', 0, 1), ('aceite', 'Aceite', 'kg', 0, 2), ('agua', 'Agua', 'L', 0, 3),
  ('sal', 'Sal', 'kg', 0, 4), ('quimicos', 'Químicos', 'kg', 0, 5), ('empaque', 'Material de empaque', 'und', 0, 6);
CREATE TABLE IF NOT EXISTS inv_movimientos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  articulo TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('ENTRADA','SALIDA')),
  cantidad REAL NOT NULL CHECK (cantidad > 0),
  origen TEXT NOT NULL CHECK (origen IN ('conteo_inicial','compra','consumo','merma')),
  ref TEXT NOT NULL,                       -- recepción, consumo o merma de origen (evita anotar dos veces lo mismo)
  id_turno INTEGER,                        -- turno de producción, si lo hay
  nota TEXT,
  rol TEXT,
  ts INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS inv_mov_ref ON inv_movimientos (origen, ref, articulo);
CREATE INDEX IF NOT EXISTS inv_mov_art ON inv_movimientos (articulo, ts);
-- Conteo físico inicial (una sola vez): lo contado por artículo, aunque sea cero
CREATE TABLE IF NOT EXISTS inv_conteo (
  articulo TEXT PRIMARY KEY,
  cantidad REAL NOT NULL CHECK (cantidad >= 0),
  ts INTEGER NOT NULL, rol TEXT
);
