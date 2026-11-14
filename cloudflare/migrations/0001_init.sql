-- Documentos: una fila por documento de la app (coleccion + id). Es el mismo modelo que usa el Artifact.
CREATE TABLE IF NOT EXISTS docs (
  col TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  updated INTEGER NOT NULL,
  PRIMARY KEY (col, id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS docs_col ON docs (col);

-- Concesiones (locks) cortas para numerar documentos sin repetir ids
CREATE TABLE IF NOT EXISTS locks (
  name TEXT PRIMARY KEY,
  holder TEXT NOT NULL,
  until INTEGER NOT NULL
) WITHOUT ROWID;

-- Contador de version: sube con cada escritura; los navegadores lo consultan para saber si deben recargar
CREATE TABLE IF NOT EXISTS ver (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  v INTEGER NOT NULL
);
INSERT OR IGNORE INTO ver (id, v) VALUES (1, 0);
