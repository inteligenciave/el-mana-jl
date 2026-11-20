-- Reversa de 0047: quita los disparadores, junta los movimientos de todas las bolsas por presentación en «empaque» (el saldo total no cambia) y vuelve el nombre «Bolsas de presentación».
-- Los repartos se descartan (salían de «empaque» y entraban a una bolsa: sumados dan cero). La tabla vuelve a no admitir el origen «reparto».
DROP TRIGGER IF EXISTS trg_bolsa_presentacion_nueva;
DROP TRIGGER IF EXISTS trg_bolsa_presentacion_cambia;
CREATE TABLE inv_movimientos_v (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  articulo TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('ENTRADA','SALIDA')),
  cantidad REAL NOT NULL CHECK (cantidad > 0),
  origen TEXT NOT NULL CHECK (origen IN ('conteo_inicial','compra','consumo','merma')),
  ref TEXT NOT NULL,
  id_turno INTEGER,
  nota TEXT,
  rol TEXT,
  ts INTEGER NOT NULL
);
INSERT INTO inv_movimientos_v (articulo, tipo, cantidad, origen, ref, id_turno, nota, rol, ts)
  SELECT CASE WHEN articulo LIKE 'bolsa-%' THEN 'empaque' ELSE articulo END, tipo, SUM(cantidad), origen, ref, MAX(id_turno), MAX(nota), MAX(rol), MIN(ts)
  FROM inv_movimientos WHERE origen <> 'reparto' GROUP BY CASE WHEN articulo LIKE 'bolsa-%' THEN 'empaque' ELSE articulo END, tipo, origen, ref ORDER BY MIN(id);
DROP TABLE inv_movimientos;
ALTER TABLE inv_movimientos_v RENAME TO inv_movimientos;
CREATE UNIQUE INDEX IF NOT EXISTS inv_mov_ref ON inv_movimientos (origen, ref, articulo);
CREATE INDEX IF NOT EXISTS inv_mov_art ON inv_movimientos (articulo, ts);
DELETE FROM inv_conteo WHERE articulo LIKE 'bolsa-%';
DELETE FROM inv_articulos WHERE codigo LIKE 'bolsa-%';
UPDATE inv_articulos SET nombre = 'Bolsas de presentación' WHERE codigo = 'empaque';
