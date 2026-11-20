-- Reversa de 0035. Devuelve a cada persona el área que tenía antes (guardada en areas_respaldo), quita el campo puesto y borra el respaldo.
UPDATE docs SET data = json_set(data, '$.area', (SELECT r.area_anterior FROM areas_respaldo r WHERE r.empleado_id = docs.id)), updated = CAST(strftime('%s','now') AS INTEGER) * 1000
  WHERE col = 'empleados' AND id IN (SELECT empleado_id FROM areas_respaldo);
-- Personas creadas después de la migración: su área nueva vuelve a la lista vieja
UPDATE docs SET data = json_set(data, '$.area', CASE json_extract(data, '$.area')
    WHEN 'Cocina' THEN 'Producción' WHEN 'Fritura' THEN 'Producción' WHEN 'Mantenimiento' THEN 'Producción' WHEN 'Sin definir' THEN 'Producción'
    WHEN 'Despacho / Choferes' THEN 'Logística'
    WHEN 'Directiva' THEN 'Administración y ventas' WHEN 'Administración' THEN 'Administración y ventas' WHEN 'Ventas' THEN 'Administración y ventas' WHEN 'Recursos humanos' THEN 'Administración y ventas'
    ELSE json_extract(data, '$.area') END), updated = CAST(strftime('%s','now') AS INTEGER) * 1000
  WHERE col = 'empleados' AND json_extract(data, '$.puesto') IS NOT NULL AND id NOT IN (SELECT empleado_id FROM areas_respaldo);
UPDATE docs SET data = json_remove(data, '$.puesto') WHERE col = 'empleados' AND json_extract(data, '$.puesto') IS NOT NULL;
DROP TABLE IF EXISTS areas_respaldo;
