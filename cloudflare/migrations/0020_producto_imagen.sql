-- Imagen del producto (ya comprimida en el navegador, máximo 180 KB). Se guarda aparte para no inflar /arranque ni los listados.
CREATE TABLE IF NOT EXISTS producto_imagenes (
  id_producto INTEGER PRIMARY KEY REFERENCES productos(id_producto) ON DELETE CASCADE,
  mime TEXT NOT NULL DEFAULT 'image/jpeg',
  datos TEXT NOT NULL,   -- base64
  bytes INTEGER NOT NULL,
  ts INTEGER NOT NULL
);
