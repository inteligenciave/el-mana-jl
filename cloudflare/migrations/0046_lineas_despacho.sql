-- 0046 · Líneas de despacho: grupos de zonas que llenan un mismo camión. La capacidad del camión se mide por tipo de producto (papa / salsas).
CREATE TABLE IF NOT EXISTS lineas_despacho (
  id_linea INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  orden INTEGER NOT NULL DEFAULT 0,
  creado_ts INTEGER NOT NULL,
  creado_rol TEXT,
  actualizado_ts INTEGER,
  ejemplo INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS linea_nombre_unico ON lineas_despacho (nombre COLLATE NOCASE);
-- Una zona en UNA sola línea: la zona es la clave. Sin fila = «Sin línea». Sin claves foráneas (como pedidos y salidas).
CREATE TABLE IF NOT EXISTS linea_zonas (
  zona TEXT PRIMARY KEY,
  id_linea INTEGER NOT NULL,
  desde_ts INTEGER NOT NULL,
  rol TEXT
);
CREATE INDEX IF NOT EXISTS linz_linea ON linea_zonas (id_linea);
-- Salida armada por línea (id_linea nulo = salida vieja por zona). Foto de la carga al armar.
ALTER TABLE salidas ADD COLUMN id_linea INTEGER;
ALTER TABLE salidas ADD COLUMN kg_papa REAL;
ALTER TABLE salidas ADD COLUMN kg_salsa REAL;
ALTER TABLE salidas ADD COLUMN ocupacion_pct REAL;
ALTER TABLE salidas ADD COLUMN cap_papa_kg REAL;
ALTER TABLE salidas ADD COLUMN cap_salsa_kg REAL;
-- Capacidad del camión lleno (decisión del dueño): 10.000 kg de papa o 15.000 kg de salsas. INSERT OR IGNORE: nunca pisa un valor ya cargado.
-- meta_zona_kg (meta de producción del panel) queda como está.
INSERT OR IGNORE INTO config (clave, valor) VALUES ('cap_papa_kg', '10000'), ('cap_salsa_kg', '15000');
