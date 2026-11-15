-- La merma ya no se coloca ni tiene máximo en %: se CALCULA (lo que sale de una etapa menos lo que llega a la siguiente).
-- Cada diferencia faltante se resuelve eligiendo: «todavía está en la etapa anterior» o «fue merma» con un motivo de esta lista.
-- Solo se agregan tablas y se limpian los máximos que ya no se usan. Aplicar SOLO con --local.

-- Lista de motivos de merma: la edita solo el Dueño. «Otra» no se puede quitar y siempre pide texto.
CREATE TABLE IF NOT EXISTS motivos_merma (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1,
  es_otra INTEGER NOT NULL DEFAULT 0,
  orden INTEGER NOT NULL DEFAULT 0,
  creado_ts INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS motivos_merma_nombre ON motivos_merma (lower(nombre));
INSERT OR IGNORE INTO motivos_merma (nombre, activo, es_otra, orden, creado_ts) VALUES
  ('Cáscara', 1, 0, 1, 0), ('Tierra', 1, 0, 2, 0), ('Aceite', 1, 0, 3, 0), ('Derrame', 1, 0, 4, 0), ('Otra', 1, 1, 99, 0);

-- Merma real (y lo que «sigue en la etapa anterior») por etapa y motivo, para los KPIs.
-- origen: 'transicion' (salió de una etapa y no llegó a la siguiente), 'cierre' (diferencia al cerrar el turno), 'carga' (bultos que no subieron al camión)
-- clase: 'MERMA' (se perdió) o 'SIGUE' (todavía está en la etapa anterior; no es merma)
CREATE TABLE IF NOT EXISTS mermas_etapa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_turno INTEGER,
  etapa TEXT NOT NULL CHECK (etapa IN ('recepcion','lavado','fritado','empacado','carga')),
  origen TEXT NOT NULL CHECK (origen IN ('transicion','cierre','carga')),
  clase TEXT NOT NULL CHECK (clase IN ('MERMA','SIGUE')),
  kilos REAL NOT NULL CHECK (kilos > 0),         -- kg (o bultos si unidad = 'bultos')
  unidad TEXT NOT NULL DEFAULT 'kg' CHECK (unidad IN ('kg','bultos')),
  id_motivo INTEGER, motivo_nombre TEXT, texto TEXT,
  ref TEXT,                                       -- salida (carga)
  estado TEXT NOT NULL DEFAULT 'VIGENTE' CHECK (estado IN ('VIGENTE','ANULADA')),
  ts INTEGER NOT NULL, rol TEXT
);
CREATE INDEX IF NOT EXISTS mermas_etapa_ts ON mermas_etapa (ts, etapa);

-- Ya no hay máximo de merma en %
DELETE FROM config WHERE clave IN ('merma_esperada_pct_lavado','merma_esperada_pct_fritado','merma_esperada_pct_empacado');
