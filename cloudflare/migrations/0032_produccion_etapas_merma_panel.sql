-- 0032 · Modificaciones del cliente, fase 5: etapas del proceso como DATOS (5.3), jornada del turno de producción (5.1/6),
-- merma consolidada (5.3 bis), avance por etapa. No borra datos: las filas de movimientos, diferencias, mermas y personas por etapa se copian tal cual
-- (las claves viejas recepcion, lavado, fritado y empacado se conservan, por eso los bonos de fritura y de kilos de empaque siguen funcionando).
-- Aplicar SOLO con --local hasta que el dueño autorice. Las sentencias ADD COLUMN corren una sola vez (D1 lleva el registro).

-- 1) Catálogo de etapas (datos, no listas fijas). kilos = 1: en esa etapa se anotan kilos que entran y salen (la regla «no pasar más de lo que hay» se aplica entre etapas con kilos).
CREATE TABLE IF NOT EXISTS etapas_proceso (
  clave TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  orden INTEGER NOT NULL,
  padre TEXT,                                -- subetapa: clave de la etapa a la que pertenece (Empaque)
  kilos INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO etapas_proceso (clave, nombre, orden, padre, kilos) VALUES
  ('recepcion', 'Recepción de insumos', 1, NULL, 1),
  ('despiedre', 'Despiedre', 2, NULL, 0),
  ('lavado', 'Lavado', 3, NULL, 1),
  ('rallado', 'Rallado', 4, NULL, 0),
  ('tina_almidon', 'Tina de almidón', 5, NULL, 0),
  ('centrifugado', 'Centrifugado', 6, NULL, 0),
  ('fritado', 'Freído', 7, NULL, 1),
  ('centrifugadora_final', 'Centrifugadora final', 8, NULL, 0),
  ('salado', 'Salado', 9, NULL, 0),
  ('empacado', 'Empaque', 10, NULL, 1),
  ('empaque_control_calidad', 'Control de calidad', 101, 'empacado', 0),
  ('empaque_pesaje', 'Pesaje', 102, 'empacado', 0),
  ('empaque_sellado', 'Sellado', 103, 'empacado', 0),
  ('empaque_armado', 'Armado de producto terminado', 104, 'empacado', 0),
  ('almacen_despacho', 'Almacén y despacho', 11, NULL, 0);

-- 2) Las cuatro tablas con la etapa fija se rehacen SIN el CHECK de etapa, copiando todo lo histórico
CREATE TABLE movimientos_proceso_n (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_turno INTEGER NOT NULL,
  etapa TEXT NOT NULL,
  sentido TEXT NOT NULL CHECK (sentido IN ('ENTRA','SALE')),
  kilos REAL NOT NULL CHECK (kilos > 0),
  nota TEXT,
  rol TEXT,
  ts INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'VIGENTE',
  id_diferencia INTEGER,
  ajuste INTEGER NOT NULL DEFAULT 0
);
INSERT INTO movimientos_proceso_n (id, id_turno, etapa, sentido, kilos, nota, rol, ts, estado, id_diferencia, ajuste)
  SELECT id, id_turno, etapa, sentido, kilos, nota, rol, ts, estado, id_diferencia, ajuste FROM movimientos_proceso;
DROP TABLE movimientos_proceso;
ALTER TABLE movimientos_proceso_n RENAME TO movimientos_proceso;
CREATE INDEX IF NOT EXISTS movp_turno ON movimientos_proceso (id_turno);
CREATE INDEX IF NOT EXISTS movp_etapa_ts ON movimientos_proceso (etapa, ts);

CREATE TABLE diferencias_n (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  etapa TEXT NOT NULL,
  origen_tipo TEXT NOT NULL,
  origen_id TEXT NOT NULL,
  id_producto INTEGER,
  unidad TEXT NOT NULL CHECK (unidad IN ('kg','bultos')),
  heredado REAL NOT NULL,
  usado REAL NOT NULL,
  diferencia REAL NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('MERMA','ERROR_ANOTACION','AJUSTE_BALANZA','FALTO_MERCANCIA','OTRO')),
  motivo TEXT NOT NULL,
  esperada INTEGER NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','APROBADA','RECHAZADA','AUTOMATICA')),
  retiene INTEGER NOT NULL DEFAULT 0,
  creado_ts INTEGER NOT NULL, creado_rol TEXT,
  decidido_ts INTEGER, decidido_rol TEXT, nota_decision TEXT
);
INSERT INTO diferencias_n (id, etapa, origen_tipo, origen_id, id_producto, unidad, heredado, usado, diferencia, tipo, motivo, esperada, estado, retiene, creado_ts, creado_rol, decidido_ts, decidido_rol, nota_decision)
  SELECT id, etapa, origen_tipo, origen_id, id_producto, unidad, heredado, usado, diferencia, tipo, motivo, esperada, estado, retiene, creado_ts, creado_rol, decidido_ts, decidido_rol, nota_decision FROM diferencias;
DROP TABLE diferencias;
ALTER TABLE diferencias_n RENAME TO diferencias;
CREATE INDEX IF NOT EXISTS dif_estado ON diferencias (estado, etapa);
CREATE INDEX IF NOT EXISTS dif_origen ON diferencias (origen_tipo, origen_id);

CREATE TABLE mermas_etapa_n (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_turno INTEGER,
  etapa TEXT NOT NULL,
  origen TEXT NOT NULL CHECK (origen IN ('transicion','cierre','carga')),
  clase TEXT NOT NULL CHECK (clase IN ('MERMA','SIGUE')),
  kilos REAL NOT NULL CHECK (kilos > 0),
  unidad TEXT NOT NULL DEFAULT 'kg' CHECK (unidad IN ('kg','bultos')),
  id_motivo INTEGER, motivo_nombre TEXT, texto TEXT,
  ref TEXT,
  estado TEXT NOT NULL DEFAULT 'VIGENTE' CHECK (estado IN ('VIGENTE','ANULADA')),
  ts INTEGER NOT NULL, rol TEXT
);
INSERT INTO mermas_etapa_n (id, id_turno, etapa, origen, clase, kilos, unidad, id_motivo, motivo_nombre, texto, ref, estado, ts, rol)
  SELECT id, id_turno, etapa, origen, clase, kilos, unidad, id_motivo, motivo_nombre, texto, ref, estado, ts, rol FROM mermas_etapa;
DROP TABLE mermas_etapa;
ALTER TABLE mermas_etapa_n RENAME TO mermas_etapa;
CREATE INDEX IF NOT EXISTS mermas_etapa_ts ON mermas_etapa (ts, etapa);

CREATE TABLE etapa_personas_n (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_turno INTEGER NOT NULL,
  etapa TEXT NOT NULL,
  empleado_id TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'VIGENTE' CHECK (estado IN ('VIGENTE','ANULADO')),
  ts INTEGER NOT NULL,
  rol TEXT
);
INSERT INTO etapa_personas_n (id, id_turno, etapa, empleado_id, estado, ts, rol) SELECT id, id_turno, etapa, empleado_id, estado, ts, rol FROM etapa_personas;
DROP TABLE etapa_personas;
ALTER TABLE etapa_personas_n RENAME TO etapa_personas;
CREATE UNIQUE INDEX IF NOT EXISTS etapa_personas_uno ON etapa_personas (id_turno, etapa, empleado_id) WHERE estado = 'VIGENTE';
CREATE INDEX IF NOT EXISTS etapa_personas_ts ON etapa_personas (etapa, ts);

-- 3) Jornada del turno de producción (filtro Diurno/Nocturno del panel y bloqueo de arranque)
ALTER TABLE turnos ADD COLUMN jornada TEXT;          -- Diurno | Nocturno (vacío en turnos anteriores a esta fase)
ALTER TABLE turnos ADD COLUMN fecha_jornada TEXT;    -- día al que pertenece (el nocturno pertenece al día en que empieza)
ALTER TABLE turnos ADD COLUMN grupo_id INTEGER;      -- grupo que trabajó ese turno

-- 4) Avance por etapa: las etapas sin kilos (y las subetapas de Empaque) se marcan como hechas
CREATE TABLE IF NOT EXISTS etapa_avance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_turno INTEGER NOT NULL,
  etapa TEXT NOT NULL,
  ts INTEGER NOT NULL,
  rol TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS etapa_avance_uno ON etapa_avance (id_turno, etapa);

-- 5) Merma consolidada: UN solo registro por turno, al cierre del proceso (antes de empaque). Reemplaza las mermas por etapa.
-- La papa que toma el turno ya baja del inventario general; este registro NO resta otra vez (descontado_inv_kg queda en 0 a propósito).
CREATE TABLE IF NOT EXISTS merma_consolidada (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_turno INTEGER NOT NULL,
  tomados_kg REAL NOT NULL,                  -- papa que tomó el turno (Recepción)
  a_empaque_kg REAL NOT NULL,                -- kilos que pasan a Empaque
  calculada_kg REAL NOT NULL,                -- tomados - a empaque (lo que calcula el sistema)
  kilos REAL NOT NULL CHECK (kilos >= 0),    -- lo que la persona confirmó o corrigió
  nota TEXT,
  desglose TEXT,                             -- JSON: [{id_motivo, motivo, kilos, texto}]
  descontado_inv_kg REAL NOT NULL DEFAULT 0,
  ts INTEGER NOT NULL, rol TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS merma_consolidada_turno ON merma_consolidada (id_turno);
CREATE INDEX IF NOT EXISTS merma_consolidada_ts ON merma_consolidada (ts);

-- 6) Mínimos de arranque por insumo: los fija Gerencia o Administración y se guardan en config como arranque_min_<articulo>. Nada que sembrar.
