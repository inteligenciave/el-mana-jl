-- 0035 · Personal: cada persona tiene un PUESTO y, dentro, su ÁREA. «Administración y ventas» se separa en Administración y Ventas.
-- Aplicar SOLO con --local hasta que el dueño autorice. No borra datos: lo anterior queda en areas_respaldo (para la reversa y para el aviso de revisión).
-- Se puede correr de nuevo sin dañar nada: solo toca a quien todavía no tiene puesto.
--   Administración y ventas      -> puesto Administración, área Administración (aviso: ¿son de Ventas?)
--   Producción / Freído y proc.  -> puesto Producción, área «Sin definir» (aviso: elegir Cocina, Fritura o Mantenimiento)
--   Línea salsera                -> puesto Producción, área Línea salsera
--   Empaque                      -> puesto Logística, área Empaque
--   Almacén / Almacén y recep.   -> puesto Logística, área Almacén
--   Logística                    -> puesto Logística, área Despacho / Choferes

CREATE TABLE IF NOT EXISTS areas_respaldo (
  empleado_id TEXT PRIMARY KEY,
  puesto_anterior TEXT,
  area_anterior TEXT,
  motivo TEXT NOT NULL,          -- 'ventas' (¿son de Ventas?), 'sin_area' (elegir el área de Producción) o 'equivalente'
  revisada INTEGER NOT NULL DEFAULT 0,
  ts INTEGER NOT NULL
);

INSERT OR IGNORE INTO areas_respaldo (empleado_id, puesto_anterior, area_anterior, motivo, revisada, ts)
  SELECT id, json_extract(data, '$.puesto'), json_extract(data, '$.area'),
    CASE json_extract(data, '$.area') WHEN 'Administración y ventas' THEN 'ventas' WHEN 'Producción' THEN 'sin_area' WHEN 'Freído y procesamiento' THEN 'sin_area' ELSE 'equivalente' END,
    CASE WHEN json_extract(data, '$.area') IN ('Administración y ventas', 'Producción', 'Freído y procesamiento') THEN 0 ELSE 1 END,
    CAST(strftime('%s','now') AS INTEGER) * 1000
  FROM docs WHERE col = 'empleados' AND json_extract(data, '$.puesto') IS NULL
    AND json_extract(data, '$.area') IN ('Administración y ventas', 'Producción', 'Freído y procesamiento', 'Línea salsera', 'Empaque', 'Almacén', 'Almacén y recepción', 'Logística', 'Logística (choferes y ayudantes)');

UPDATE docs SET
  data = json_set(data,
    '$.puesto', CASE json_extract(data, '$.area')
      WHEN 'Administración y ventas' THEN 'Administración'
      WHEN 'Producción' THEN 'Producción' WHEN 'Freído y procesamiento' THEN 'Producción' WHEN 'Línea salsera' THEN 'Producción'
      ELSE 'Logística' END,
    '$.area', CASE json_extract(data, '$.area')
      WHEN 'Administración y ventas' THEN 'Administración'
      WHEN 'Producción' THEN 'Sin definir' WHEN 'Freído y procesamiento' THEN 'Sin definir'
      WHEN 'Línea salsera' THEN 'Línea salsera' WHEN 'Empaque' THEN 'Empaque'
      WHEN 'Almacén' THEN 'Almacén' WHEN 'Almacén y recepción' THEN 'Almacén'
      ELSE 'Despacho / Choferes' END),
  updated = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE col = 'empleados' AND json_extract(data, '$.puesto') IS NULL
  AND json_extract(data, '$.area') IN ('Administración y ventas', 'Producción', 'Freído y procesamiento', 'Línea salsera', 'Empaque', 'Almacén', 'Almacén y recepción', 'Logística', 'Logística (choferes y ayudantes)')
  AND id IN (SELECT empleado_id FROM areas_respaldo);
