-- Reversa de 0037. Quita la tabla de avisos a Gerencia y el historial de horarios del documento de parámetros.
-- Se pierde: los avisos guardados y el historial de cambios de horario (queda el último horario guardado en ajustes/turnos_bonos, que es el que vale hoy o el próximo).
-- La auditoría del sistema conserva quién cambió cada horario, cuándo y qué valor tenía antes y después.
DROP TABLE IF EXISTS avisos_turnos;
UPDATE docs SET data = json_remove(data, '$.historial') WHERE col = 'ajustes' AND id = 'turnos_bonos';
