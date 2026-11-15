-- H1/H2/H3/H4/H5: «cada etapa solo usa lo que heredó». Solo se agregan tablas y columnas con valor por defecto; no se rehace ninguna tabla.

-- Diferencias: todo lo que no cuadra con lo heredado, con su motivo y su aprobación
CREATE TABLE IF NOT EXISTS diferencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  etapa TEXT NOT NULL CHECK (etapa IN ('pedido_proveedor','recepcion_mp','recepcion','lavado','fritado','empacado','cierre','carga')),
  origen_tipo TEXT NOT NULL,          -- 'turno' | 'cierre' | 'recepcion' | 'solicitud' | 'salida'
  origen_id TEXT NOT NULL,            -- id del turno, recepción, solicitud o salida
  id_producto INTEGER,                -- solo bultos
  unidad TEXT NOT NULL CHECK (unidad IN ('kg','bultos')),
  heredado REAL NOT NULL,             -- lo que le llegó
  usado REAL NOT NULL,                -- lo que se quiso usar o se declaró
  diferencia REAL NOT NULL,           -- usado - heredado (positivo = sobra, negativo = falta)
  tipo TEXT NOT NULL CHECK (tipo IN ('MERMA','ERROR_ANOTACION','AJUSTE_BALANZA','FALTO_MERCANCIA','OTRO')),
  motivo TEXT NOT NULL,
  esperada INTEGER NOT NULL DEFAULT 0,-- 1 = dentro de la merma máxima que fijó el Dueño
  estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','APROBADA','RECHAZADA','AUTOMATICA')),
  retiene INTEGER NOT NULL DEFAULT 0, -- 1 = hay un movimiento en espera que solo cuenta si se aprueba
  creado_ts INTEGER NOT NULL, creado_rol TEXT,
  decidido_ts INTEGER, decidido_rol TEXT, nota_decision TEXT
);
CREATE INDEX IF NOT EXISTS dif_estado ON diferencias (estado, etapa);
CREATE INDEX IF NOT EXISTS dif_origen ON diferencias (origen_tipo, origen_id);

-- Movimientos y empaque en espera (exceso con motivo): no cuentan hasta que se aprueben
ALTER TABLE movimientos_proceso ADD COLUMN estado TEXT NOT NULL DEFAULT 'VIGENTE';   -- VIGENTE | EN_ESPERA | RECHAZADO
ALTER TABLE movimientos_proceso ADD COLUMN id_diferencia INTEGER;
ALTER TABLE movimientos_proceso ADD COLUMN ajuste INTEGER NOT NULL DEFAULT 0;         -- 1 = ajuste al cerrar el turno (no se hereda a la etapa siguiente)
ALTER TABLE empaque_turno ADD COLUMN estado TEXT NOT NULL DEFAULT 'VIGENTE';
ALTER TABLE empaque_turno ADD COLUMN id_diferencia INTEGER;

-- De qué recepciones vino la papa del turno
CREATE TABLE IF NOT EXISTS turno_recepciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_turno INTEGER NOT NULL, id_recepcion TEXT NOT NULL, kilos REAL NOT NULL CHECK (kilos > 0), ts INTEGER NOT NULL, rol TEXT
);
CREATE INDEX IF NOT EXISTS turec_rec ON turno_recepciones (id_recepcion);

-- Conteo al cargar el camión
ALTER TABLE salidas ADD COLUMN cargada_ts INTEGER;
ALTER TABLE salidas ADD COLUMN cargada_rol TEXT;
ALTER TABLE salida_lineas ADD COLUMN bultos_cargados INTEGER;

-- Ajustes vacíos: el sistema no inventa cifras. Las dos fechas marcan desde cuándo vale la regla (lo anterior no se revisa).
INSERT OR IGNORE INTO config (clave, valor) VALUES
 ('merma_esperada_pct_lavado',''), ('merma_esperada_pct_fritado',''), ('merma_esperada_pct_empacado',''),
 ('herencia_desde_ts', CAST(CAST(strftime('%s','now') AS INTEGER) * 1000 AS TEXT)),
 ('carga_desde_ts', CAST(CAST(strftime('%s','now') AS INTEGER) * 1000 AS TEXT));
