-- 0039 · Producción: siempre hay un turno activo (según la hora) y la producción se INICIA con un botón cuando todos los requisitos están en verde.
-- Se agrega la marca de inicio. Los turnos que ya existían cuentan como ya iniciados (así no se rompe ningún turno abierto ni cerrado).
-- Aplicar SOLO con --local hasta que el dueño autorice.
ALTER TABLE turnos ADD COLUMN inicio_ts INTEGER;
ALTER TABLE turnos ADD COLUMN inicio_rol TEXT;
UPDATE turnos SET inicio_ts = abierto_ts, inicio_rol = abierto_rol WHERE inicio_ts IS NULL;
