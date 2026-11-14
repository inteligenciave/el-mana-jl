-- Listas de precios con NOMBRE (hoy A y B; el Dueño puede crear listas propias de un estado) y cada ESTADO apunta a UNA lista.
-- Varios estados pueden compartir lista. Un estado que no aparece aquí queda "sin precios" hasta que el Dueño le asigne lista.
CREATE TABLE precios_lista_nueva (
  id_producto INTEGER NOT NULL REFERENCES productos(id_producto),
  lista TEXT NOT NULL CHECK (length(lista) BETWEEN 1 AND 40),
  contado_cents INTEGER NOT NULL CHECK (contado_cents > 0),
  credito_cents INTEGER NOT NULL CHECK (credito_cents > 0),
  actualizado_ts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (id_producto, lista)
);
INSERT INTO precios_lista_nueva SELECT id_producto, lista, contado_cents, credito_cents, actualizado_ts FROM precios_lista;
DROP TABLE precios_lista;
ALTER TABLE precios_lista_nueva RENAME TO precios_lista;
CREATE TABLE IF NOT EXISTS estados_lista (
  estado TEXT PRIMARY KEY,
  lista TEXT NOT NULL CHECK (length(lista) BETWEEN 1 AND 40),
  actualizado_ts INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO estados_lista (estado, lista) VALUES
  ('Lara','A'),('Trujillo','A'),('Yaracuy','A'),
  ('Distrito Capital','B'),('Miranda','B'),('Aragua','B'),('Carabobo','B'),
  ('Anzoátegui','B'),('Monagas','B'),('Sucre','B'),('Mérida','B'),('Nueva Esparta','B');
