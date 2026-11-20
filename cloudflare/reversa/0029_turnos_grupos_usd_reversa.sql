-- Reversa de 0029. Vuelve a Mañana/Tarde, devuelve los montos a bolívares y quita grupos y columnas nuevas.
-- Montos: si el monto no cambió desde la migración se restaura el valor ORIGINAL en Bs (tabla nomina_bs_respaldo); si cambió o es nuevo, se multiplica por la tasa de la migración (config.nomina_usd_tasa).
-- Se pierde: los grupos rotativos y su historial semanal; la tasa y la moneda de los pagos nuevos (se dejan en Bs al cambio de cada pago); el matiz «Nocturno cruza medianoche» (queda como Tarde).
-- Si config.nomina_usd_tasa está vacío, los montos no se tocan (no se había convertido nada).

-- Pagos de nómina: los hechos en $ vuelven a Bs con SU tasa
UPDATE pagos_nomina SET base = ROUND(base * tasa, 2), extra = ROUND(extra * tasa, 2), bonos = ROUND(bonos * tasa, 2), ley = ROUND(ley * tasa, 2), descuento_prestamo = ROUND(descuento_prestamo * tasa, 2), neto = COALESCE(neto_bs, ROUND(neto * tasa, 2))
  WHERE moneda = 'USD' AND tasa > 0;
ALTER TABLE pagos_nomina DROP COLUMN neto_usd;
ALTER TABLE pagos_nomina DROP COLUMN neto_bs;
ALTER TABLE pagos_nomina DROP COLUMN tasa_fecha;
ALTER TABLE pagos_nomina DROP COLUMN tasa;
ALTER TABLE pagos_nomina DROP COLUMN moneda;

-- Fichas, asistencia y parámetros del bono: de $ a Bs
UPDATE docs SET data = json_set(data, '$.tarifa', COALESCE(
    (SELECT r.valor_bs FROM nomina_bs_respaldo r WHERE r.tabla = 'docs:empleados' AND r.ref = docs.id AND r.campo = 'tarifa' AND ROUND(r.valor_bs / CAST((SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') AS REAL), 4) = json_extract(docs.data, '$.tarifa')),
    ROUND(json_extract(data, '$.tarifa') * CAST((SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') AS REAL), 2)))
  WHERE col = 'empleados' AND json_extract(data, '$.tarifa') > 0 AND (SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') <> '';
UPDATE docs SET data = json_set(data, '$.bonos', COALESCE(
    (SELECT r.valor_bs FROM nomina_bs_respaldo r WHERE r.tabla = 'docs:asistencia' AND r.ref = docs.id AND r.campo = 'bonos' AND ROUND(r.valor_bs / CAST((SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') AS REAL), 2) = json_extract(docs.data, '$.bonos')),
    ROUND(json_extract(data, '$.bonos') * CAST((SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') AS REAL), 2)))
  WHERE col = 'asistencia' AND json_extract(data, '$.bonos') > 0 AND (SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') <> '';
UPDATE docs SET data = json_set(data, '$.bono.valor', COALESCE(
    (SELECT r.valor_bs FROM nomina_bs_respaldo r WHERE r.tabla = 'docs:ajustes' AND r.ref = docs.id AND r.campo = 'bono.valor' AND ROUND(r.valor_bs / CAST((SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') AS REAL), 4) = json_extract(docs.data, '$.bono.valor')),
    ROUND(json_extract(data, '$.bono.valor') * CAST((SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') AS REAL), 2)))
  WHERE col = 'ajustes' AND id = 'turnos_bonos' AND json_extract(data, '$.bono.valor') > 0 AND (SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') <> '';
-- Horarios anteriores
UPDATE docs SET data = json_remove(json_set(data, '$.horarios', json(json_extract(data, '$.horarios_antes_0029'))), '$.horarios_antes_0029')
  WHERE col = 'ajustes' AND id = 'turnos_bonos' AND json_type(data, '$.horarios_antes_0029') IS NOT NULL;
-- Si no había horarios antes, el doc se queda con los nuevos; se llevan a las claves viejas
UPDATE docs SET data = json_set(json_remove(data, '$.horarios."Diurno"', '$.horarios."Nocturno"'), '$.horarios."Mañana"', json('{"inicio":"","fin":""}'), '$.horarios."Tarde"', json('{"inicio":"","fin":""}'))
  WHERE col = 'ajustes' AND id = 'turnos_bonos' AND json_type(data, '$.horarios."Diurno"') IS NOT NULL;

-- Bonos de producción: de $ a Bs y de vuelta a Mañana/Tarde
UPDATE bonos_turno_emp SET monto = COALESCE(
    (SELECT r.valor_bs FROM nomina_bs_respaldo r WHERE r.tabla = 'bonos_turno_emp' AND r.ref = CAST(bonos_turno_emp.id AS TEXT) AND r.campo = 'monto' AND ROUND(r.valor_bs / CAST((SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') AS REAL), 2) = bonos_turno_emp.monto),
    ROUND(monto * CAST((SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') AS REAL), 2))
  WHERE (SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') <> '';
CREATE TABLE bonos_turno_vieja (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  turno TEXT NOT NULL CHECK (turno IN ('Mañana','Tarde')),
  modo TEXT NOT NULL CHECK (modo IN ('turno','persona')),
  kilos REAL NOT NULL DEFAULT 0,
  calculado REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  detalle TEXT,
  quien TEXT NOT NULL,
  ts INTEGER NOT NULL
);
INSERT INTO bonos_turno_vieja (id, fecha, turno, modo, kilos, calculado, total, detalle, quien, ts)
  SELECT b.id, b.fecha, CASE b.turno WHEN 'Diurno' THEN 'Mañana' ELSE 'Tarde' END, b.modo, b.kilos,
    CASE WHEN (SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') = '' THEN b.calculado
      ELSE COALESCE((SELECT r.valor_bs FROM nomina_bs_respaldo r WHERE r.tabla = 'bonos_turno' AND r.ref = CAST(b.id AS TEXT) AND r.campo = 'calculado' AND ROUND(r.valor_bs / CAST((SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') AS REAL), 2) = b.calculado), ROUND(b.calculado * CAST((SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') AS REAL), 2)) END,
    CASE WHEN (SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') = '' THEN b.total
      ELSE COALESCE((SELECT r.valor_bs FROM nomina_bs_respaldo r WHERE r.tabla = 'bonos_turno' AND r.ref = CAST(b.id AS TEXT) AND r.campo = 'total' AND ROUND(r.valor_bs / CAST((SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') AS REAL), 2) = b.total), ROUND(b.total * CAST((SELECT valor FROM config WHERE clave = 'nomina_usd_tasa') AS REAL), 2)) END,
    b.detalle, b.quien, b.ts FROM bonos_turno b;
DROP TABLE bonos_turno;
ALTER TABLE bonos_turno_vieja RENAME TO bonos_turno;
CREATE UNIQUE INDEX IF NOT EXISTS bonos_turno_uno ON bonos_turno (fecha, turno);

-- Marcas
CREATE TABLE marcas_vieja (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empleado_id TEXT NOT NULL,
  fecha TEXT NOT NULL,
  entrada_ts INTEGER NOT NULL,
  salida_ts INTEGER,
  turno TEXT NOT NULL CHECK (turno IN ('Mañana','Tarde')),
  quien TEXT NOT NULL,
  creado_ts INTEGER NOT NULL,
  origen TEXT
);
INSERT INTO marcas_vieja (id, empleado_id, fecha, entrada_ts, salida_ts, turno, quien, creado_ts, origen)
  SELECT id, empleado_id, fecha, entrada_ts, salida_ts, CASE turno WHEN 'Diurno' THEN 'Mañana' ELSE 'Tarde' END, quien, creado_ts, origen FROM marcas;
DROP TABLE marcas;
ALTER TABLE marcas_vieja RENAME TO marcas;
CREATE INDEX IF NOT EXISTS marcas_fecha ON marcas (fecha);
CREATE UNIQUE INDEX IF NOT EXISTS marcas_abierta ON marcas (empleado_id, fecha) WHERE salida_ts IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS marcas_lector_uno ON marcas (empleado_id, fecha) WHERE origen = 'lector';

UPDATE docs SET data = json_set(data, '$.turno', CASE json_extract(data, '$.turno') WHEN 'Diurno' THEN 'Mañana' ELSE 'Tarde' END)
  WHERE col = 'empleados' AND json_extract(data, '$.turno') IN ('Diurno','Nocturno');
UPDATE lector_dias SET turno = CASE turno WHEN 'Diurno' THEN 'Mañana' ELSE 'Tarde' END WHERE turno IN ('Diurno','Nocturno');
UPDATE docs SET data = json_remove(json_set(data, '$.turnos."Mañana"', json(json_extract(data, '$.turnos."Diurno"'))), '$.turnos."Diurno"')
  WHERE col = 'jornada_rrhh' AND json_type(data, '$.turnos."Diurno"') IS NOT NULL;
UPDATE docs SET data = json_remove(json_set(data, '$.turnos."Tarde"', json(json_extract(data, '$.turnos."Nocturno"'))), '$.turnos."Nocturno"')
  WHERE col = 'jornada_rrhh' AND json_type(data, '$.turnos."Nocturno"') IS NOT NULL;

-- Grupos y respaldo
DROP INDEX IF EXISTS grupo_semana_miembros_grupo;
DROP TABLE IF EXISTS grupo_semana_miembros;
DROP TABLE IF EXISTS grupo_semana;
DROP TABLE IF EXISTS grupo_miembros;
DROP TABLE IF EXISTS grupos;
DROP TABLE IF EXISTS nomina_bs_respaldo;
DELETE FROM config WHERE clave IN ('nomina_usd_tasa', 'nomina_usd_tasa_fecha');
