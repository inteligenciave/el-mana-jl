-- Reversa de 0039. Quita la marca de inicio de producción del turno (el turno sigue igual).
ALTER TABLE turnos DROP COLUMN inicio_rol;
ALTER TABLE turnos DROP COLUMN inicio_ts;
