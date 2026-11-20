-- 0029 · Modificaciones del cliente, fase 2: 2.2 turnos Diurno/Nocturno y grupos rotativos + nómina en dólares. No borra datos: lo anterior queda respaldado.
-- Aplicar SOLO con --local hasta que el dueño autorice. Antes de aplicarla en la base real: tener cargada la tasa BCV (se usa la MÁS RECIENTE para pasar de Bs a $; si no hay ninguna, los montos NO se convierten y config.nomina_usd_tasa queda vacío).
-- Las sentencias ALTER ... ADD COLUMN corren una sola vez (D1 lleva el registro de migraciones).

-- ============ Tasa usada para pasar los montos actuales de Bs a $ (queda registrada) ============
INSERT OR REPLACE INTO config (clave, valor) SELECT 'nomina_usd_tasa', CAST(valor AS TEXT) FROM tasas_bcv ORDER BY fecha DESC LIMIT 1;
INSERT OR REPLACE INTO config (clave, valor) SELECT 'nomina_usd_tasa_fecha', fecha FROM tasas_bcv ORDER BY fecha DESC LIMIT 1;
INSERT OR IGNORE INTO config (clave, valor) VALUES ('nomina_usd_tasa', ''), ('nomina_usd_tasa_fecha', '');

-- Respaldo de cada monto en bolívares que se convierte (para la reversa y para no perder nada)
CREATE TABLE IF NOT EXISTS nomina_bs_respaldo (
  tabla TEXT NOT NULL,
  ref TEXT NOT NULL,
  campo TEXT NOT NULL,
  valor_bs REAL NOT NULL,
  PRIMARY KEY (tabla, ref, campo)
);

-- ============ 2.2 Turnos: Mañana pasa a Diurno y Tarde pasa a Nocturno (decisión del dueño) ============
-- marcas: se reconstruye sin el candado Mañana/Tarde. El turno nocturno cruza la medianoche y pertenece al día en que EMPIEZA (la columna «fecha» ya es ese día).
CREATE TABLE marcas_nueva (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empleado_id TEXT NOT NULL,
  fecha TEXT NOT NULL,
  entrada_ts INTEGER NOT NULL,
  salida_ts INTEGER,
  turno TEXT NOT NULL CHECK (turno IN ('Diurno','Nocturno')),
  quien TEXT NOT NULL,
  creado_ts INTEGER NOT NULL,
  origen TEXT
);
INSERT INTO marcas_nueva (id, empleado_id, fecha, entrada_ts, salida_ts, turno, quien, creado_ts, origen)
  SELECT id, empleado_id, fecha, entrada_ts, salida_ts, CASE turno WHEN 'Mañana' THEN 'Diurno' ELSE 'Nocturno' END, quien, creado_ts, origen FROM marcas;
DROP TABLE marcas;
ALTER TABLE marcas_nueva RENAME TO marcas;
CREATE INDEX IF NOT EXISTS marcas_fecha ON marcas (fecha);
CREATE UNIQUE INDEX IF NOT EXISTS marcas_abierta ON marcas (empleado_id, fecha) WHERE salida_ts IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS marcas_lector_uno ON marcas (empleado_id, fecha) WHERE origen = 'lector';

-- bonos_turno: igual (y sus montos pasan a dólares)
CREATE TABLE bonos_turno_nueva (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  turno TEXT NOT NULL CHECK (turno IN ('Diurno','Nocturno')),
  modo TEXT NOT NULL CHECK (modo IN ('turno','persona')),
  kilos REAL NOT NULL DEFAULT 0,
  calculado REAL NOT NULL DEFAULT 0,  -- ahora en DÓLARES
  total REAL NOT NULL DEFAULT 0,      -- ahora en DÓLARES
  detalle TEXT,
  quien TEXT NOT NULL,
  ts INTEGER NOT NULL
);
INSERT INTO nomina_bs_respaldo (tabla, ref, campo, valor_bs) SELECT 'bonos_turno', CAST(id AS TEXT), 'calculado', calculado FROM bonos_turno WHERE (SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') <> '';
INSERT INTO nomina_bs_respaldo (tabla, ref, campo, valor_bs) SELECT 'bonos_turno', CAST(id AS TEXT), 'total', total FROM bonos_turno WHERE (SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') <> '';
INSERT INTO bonos_turno_nueva (id, fecha, turno, modo, kilos, calculado, total, detalle, quien, ts)
  SELECT id, fecha, CASE turno WHEN 'Mañana' THEN 'Diurno' ELSE 'Nocturno' END, modo, kilos,
    CASE WHEN (SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') = '' THEN calculado ELSE ROUND(calculado / CAST((SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') AS REAL), 2) END,
    CASE WHEN (SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') = '' THEN total ELSE ROUND(total / CAST((SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') AS REAL), 2) END,
    detalle, quien, ts FROM bonos_turno;
DROP TABLE bonos_turno;
ALTER TABLE bonos_turno_nueva RENAME TO bonos_turno;
CREATE UNIQUE INDEX IF NOT EXISTS bonos_turno_uno ON bonos_turno (fecha, turno);
INSERT INTO nomina_bs_respaldo (tabla, ref, campo, valor_bs) SELECT 'bonos_turno_emp', CAST(id AS TEXT), 'monto', monto FROM bonos_turno_emp WHERE (SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') <> '';
UPDATE bonos_turno_emp SET monto = ROUND(monto / CAST((SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') AS REAL), 2) WHERE (SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') <> '';

-- Fichas de personal: turno fijo (Mañana→Diurno, Tarde→Nocturno)
UPDATE docs SET data = json_set(data, '$.turno', CASE json_extract(data, '$.turno') WHEN 'Mañana' THEN 'Diurno' ELSE 'Nocturno' END)
  WHERE col = 'empleados' AND json_extract(data, '$.turno') IN ('Mañana','Tarde');
-- Importación del lector: días ya entendidos
UPDATE lector_dias SET turno = CASE turno WHEN 'Mañana' THEN 'Diurno' ELSE 'Nocturno' END WHERE turno IN ('Mañana','Tarde');
-- Turnos de trabajo abiertos/cerrados por día (docs jornada_rrhh)
UPDATE docs SET data = json_remove(json_set(data, '$.turnos."Diurno"', json(json_extract(data, '$.turnos."Mañana"'))), '$.turnos."Mañana"')
  WHERE col = 'jornada_rrhh' AND json_type(data, '$.turnos."Mañana"') IS NOT NULL;
UPDATE docs SET data = json_remove(json_set(data, '$.turnos."Nocturno"', json(json_extract(data, '$.turnos."Tarde"'))), '$.turnos."Tarde"')
  WHERE col = 'jornada_rrhh' AND json_type(data, '$.turnos."Tarde"') IS NOT NULL;
-- Parámetros: horarios fijos del dueño (Diurno 07:00-17:00, Nocturno 18:00-05:00); los anteriores se guardan en horarios_antes_0029
UPDATE docs SET data = json_set(data, '$.horarios_antes_0029', json(COALESCE(json_extract(data, '$.horarios'), '{}')), '$.horarios', json('{"Diurno":{"inicio":"07:00","fin":"17:00"},"Nocturno":{"inicio":"18:00","fin":"05:00"}}'))
  WHERE col = 'ajustes' AND id = 'turnos_bonos';

-- ============ 2.2 Grupos rotativos ============
CREATE TABLE IF NOT EXISTS grupos (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE
);
INSERT OR IGNORE INTO grupos (id, nombre) VALUES (1, 'Grupo 1'), (2, 'Grupo 2');
-- Integrantes de hoy (una persona está en un solo grupo)
CREATE TABLE IF NOT EXISTS grupo_miembros (
  empleado_id TEXT PRIMARY KEY,
  grupo_id INTEGER NOT NULL REFERENCES grupos(id),
  ts INTEGER NOT NULL
);
-- Qué turno tiene cada grupo cada semana (semana = su lunes, AAAA-MM-DD)
CREATE TABLE IF NOT EXISTS grupo_semana (
  semana TEXT NOT NULL,
  grupo_id INTEGER NOT NULL REFERENCES grupos(id),
  turno TEXT NOT NULL CHECK (turno IN ('Diurno','Nocturno')),
  quien TEXT NOT NULL,
  ts INTEGER NOT NULL,
  PRIMARY KEY (semana, grupo_id)
);
-- Historial: quiénes estaban en cada grupo cada semana. excepcion = 1: la persona estuvo esa semana en otro grupo que el suyo.
CREATE TABLE IF NOT EXISTS grupo_semana_miembros (
  semana TEXT NOT NULL,
  empleado_id TEXT NOT NULL,
  grupo_id INTEGER NOT NULL,
  excepcion INTEGER NOT NULL DEFAULT 0,
  quien TEXT,
  ts INTEGER NOT NULL,
  PRIMARY KEY (semana, empleado_id)
);
CREATE INDEX IF NOT EXISTS grupo_semana_miembros_grupo ON grupo_semana_miembros (semana, grupo_id);

-- ============ Nómina en dólares ============
-- Fichas: tarifa (por día u hora) pasa de Bs a $
INSERT OR IGNORE INTO nomina_bs_respaldo (tabla, ref, campo, valor_bs)
  SELECT 'docs:empleados', id, 'tarifa', json_extract(data, '$.tarifa') FROM docs
  WHERE col = 'empleados' AND json_extract(data, '$.tarifa') > 0 AND (SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') <> '';
UPDATE docs SET data = json_set(data, '$.tarifa', ROUND(json_extract(data, '$.tarifa') / CAST((SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') AS REAL), 4))
  WHERE col = 'empleados' AND json_extract(data, '$.tarifa') > 0 AND (SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') <> '';
-- Asistencia por quincena: bonos anotados a mano
INSERT OR IGNORE INTO nomina_bs_respaldo (tabla, ref, campo, valor_bs)
  SELECT 'docs:asistencia', id, 'bonos', json_extract(data, '$.bonos') FROM docs
  WHERE col = 'asistencia' AND json_extract(data, '$.bonos') > 0 AND (SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') <> '';
UPDATE docs SET data = json_set(data, '$.bonos', ROUND(json_extract(data, '$.bonos') / CAST((SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') AS REAL), 2))
  WHERE col = 'asistencia' AND json_extract(data, '$.bonos') > 0 AND (SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') <> '';
-- Parámetros del bono de producción: el valor pasa de Bs a $
INSERT OR IGNORE INTO nomina_bs_respaldo (tabla, ref, campo, valor_bs)
  SELECT 'docs:ajustes', id, 'bono.valor', json_extract(data, '$.bono.valor') FROM docs
  WHERE col = 'ajustes' AND id = 'turnos_bonos' AND json_extract(data, '$.bono.valor') > 0 AND (SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') <> '';
UPDATE docs SET data = json_set(data, '$.bono.valor', ROUND(json_extract(data, '$.bono.valor') / CAST((SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') AS REAL), 4))
  WHERE col = 'ajustes' AND id = 'turnos_bonos' AND json_extract(data, '$.bono.valor') > 0 AND (SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') <> '';
-- Pagos ya hechos: se pagaron en bolívares y así quedan (moneda = 'Bs'); neto_usd es solo su equivalente a la tasa de esta migración, para sumar con los nuevos.
-- Los pagos nuevos se guardan en $ (moneda = 'USD') con la tasa BCV del día de pago y su equivalente en Bs.
ALTER TABLE pagos_nomina ADD COLUMN moneda TEXT NOT NULL DEFAULT 'Bs';
ALTER TABLE pagos_nomina ADD COLUMN tasa REAL;
ALTER TABLE pagos_nomina ADD COLUMN tasa_fecha TEXT;
ALTER TABLE pagos_nomina ADD COLUMN neto_bs REAL;
ALTER TABLE pagos_nomina ADD COLUMN neto_usd REAL;
UPDATE pagos_nomina SET neto_bs = neto,
  neto_usd = CASE WHEN (SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') = '' THEN NULL ELSE ROUND(neto / CAST((SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') AS REAL), 2) END;
