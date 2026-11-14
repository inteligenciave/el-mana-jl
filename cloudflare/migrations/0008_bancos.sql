-- Bancos de la empresa. La lista arranca VACIA: no se inventa ningun banco ni cuenta.
-- Solo el Dueno y Administracion los agregan, editan o desactivan (lo valida el servidor). Desactivar no borra.
CREATE TABLE IF NOT EXISTS bancos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  moneda TEXT NOT NULL CHECK (moneda IN ('BS','USD')),
  cuenta_numero TEXT,
  cuenta_titular TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  creado_ts INTEGER NOT NULL DEFAULT 0,
  actualizado_ts INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS bancos_nombre_moneda ON bancos (nombre COLLATE NOCASE, moneda);
ALTER TABLE pagos ADD COLUMN id_banco INTEGER;
ALTER TABLE pagos_reportados ADD COLUMN id_banco INTEGER;
