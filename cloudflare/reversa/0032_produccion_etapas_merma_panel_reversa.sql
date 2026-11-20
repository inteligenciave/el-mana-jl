-- Reversa de 0032. Se pierde: el catálogo de etapas, las marcas de avance por etapa, la merma consolidada y la jornada/grupo de cada turno.
-- Los movimientos, diferencias, mermas y personas por etapa que usan etapas nuevas (despiedre, rallado, etc.) se BORRAN para poder volver a la regla de 4 etapas.
-- Las filas de las 4 etapas viejas (recepcion, lavado, fritado, empacado) se conservan sin cambios.
DROP TABLE IF EXISTS merma_consolidada;
DROP TABLE IF EXISTS etapa_avance;
DROP TABLE IF EXISTS etapas_proceso;
DELETE FROM config WHERE clave LIKE 'arranque_min_%';
ALTER TABLE turnos DROP COLUMN grupo_id;
ALTER TABLE turnos DROP COLUMN fecha_jornada;
ALTER TABLE turnos DROP COLUMN jornada;

DELETE FROM movimientos_proceso WHERE etapa NOT IN ('recepcion','lavado','fritado','empacado');
CREATE TABLE movimientos_proceso_v (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_turno INTEGER NOT NULL,
  etapa TEXT NOT NULL CHECK (etapa IN ('recepcion','lavado','fritado','empacado')),
  sentido TEXT NOT NULL CHECK (sentido IN ('ENTRA','SALE')),
  kilos REAL NOT NULL CHECK (kilos > 0),
  nota TEXT,
  rol TEXT,
  ts INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'VIGENTE',
  id_diferencia INTEGER,
  ajuste INTEGER NOT NULL DEFAULT 0
);
INSERT INTO movimientos_proceso_v (id, id_turno, etapa, sentido, kilos, nota, rol, ts, estado, id_diferencia, ajuste) SELECT id, id_turno, etapa, sentido, kilos, nota, rol, ts, estado, id_diferencia, ajuste FROM movimientos_proceso;
DROP TABLE movimientos_proceso;
ALTER TABLE movimientos_proceso_v RENAME TO movimientos_proceso;
CREATE INDEX IF NOT EXISTS movp_turno ON movimientos_proceso (id_turno);

DELETE FROM diferencias WHERE etapa NOT IN ('pedido_proveedor','recepcion_mp','recepcion','lavado','fritado','empacado','cierre','carga');
CREATE TABLE diferencias_v (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  etapa TEXT NOT NULL CHECK (etapa IN ('pedido_proveedor','recepcion_mp','recepcion','lavado','fritado','empacado','cierre','carga')),
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
INSERT INTO diferencias_v (id, etapa, origen_tipo, origen_id, id_producto, unidad, heredado, usado, diferencia, tipo, motivo, esperada, estado, retiene, creado_ts, creado_rol, decidido_ts, decidido_rol, nota_decision)
  SELECT id, etapa, origen_tipo, origen_id, id_producto, unidad, heredado, usado, diferencia, tipo, motivo, esperada, estado, retiene, creado_ts, creado_rol, decidido_ts, decidido_rol, nota_decision FROM diferencias;
DROP TABLE diferencias;
ALTER TABLE diferencias_v RENAME TO diferencias;
CREATE INDEX IF NOT EXISTS dif_estado ON diferencias (estado, etapa);
CREATE INDEX IF NOT EXISTS dif_origen ON diferencias (origen_tipo, origen_id);

DELETE FROM mermas_etapa WHERE etapa NOT IN ('recepcion','lavado','fritado','empacado','carga');
CREATE TABLE mermas_etapa_v (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_turno INTEGER,
  etapa TEXT NOT NULL CHECK (etapa IN ('recepcion','lavado','fritado','empacado','carga')),
  origen TEXT NOT NULL CHECK (origen IN ('transicion','cierre','carga')),
  clase TEXT NOT NULL CHECK (clase IN ('MERMA','SIGUE')),
  kilos REAL NOT NULL CHECK (kilos > 0),
  unidad TEXT NOT NULL DEFAULT 'kg' CHECK (unidad IN ('kg','bultos')),
  id_motivo INTEGER, motivo_nombre TEXT, texto TEXT,
  ref TEXT,
  estado TEXT NOT NULL DEFAULT 'VIGENTE' CHECK (estado IN ('VIGENTE','ANULADA')),
  ts INTEGER NOT NULL, rol TEXT
);
INSERT INTO mermas_etapa_v (id, id_turno, etapa, origen, clase, kilos, unidad, id_motivo, motivo_nombre, texto, ref, estado, ts, rol) SELECT id, id_turno, etapa, origen, clase, kilos, unidad, id_motivo, motivo_nombre, texto, ref, estado, ts, rol FROM mermas_etapa;
DROP TABLE mermas_etapa;
ALTER TABLE mermas_etapa_v RENAME TO mermas_etapa;
CREATE INDEX IF NOT EXISTS mermas_etapa_ts ON mermas_etapa (ts, etapa);

DELETE FROM etapa_personas WHERE etapa NOT IN ('recepcion','lavado','fritado','empacado');
CREATE TABLE etapa_personas_v (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_turno INTEGER NOT NULL,
  etapa TEXT NOT NULL CHECK (etapa IN ('recepcion','lavado','fritado','empacado')),
  empleado_id TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'VIGENTE' CHECK (estado IN ('VIGENTE','ANULADO')),
  ts INTEGER NOT NULL,
  rol TEXT
);
INSERT INTO etapa_personas_v (id, id_turno, etapa, empleado_id, estado, ts, rol) SELECT id, id_turno, etapa, empleado_id, estado, ts, rol FROM etapa_personas;
DROP TABLE etapa_personas;
ALTER TABLE etapa_personas_v RENAME TO etapa_personas;
CREATE UNIQUE INDEX IF NOT EXISTS etapa_personas_uno ON etapa_personas (id_turno, etapa, empleado_id) WHERE estado = 'VIGENTE';
CREATE INDEX IF NOT EXISTS etapa_personas_ts ON etapa_personas (etapa, ts);
