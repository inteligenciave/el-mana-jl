-- Reversa de 0043. Las filas origen='cierre' con ref 'MC-%' quedan; el código viejo las ignora en turnos consolidados.
DROP INDEX IF EXISTS mermas_etapa_turno;
ALTER TABLE mermas_etapa DROP COLUMN persona;
ALTER TABLE merma_consolidada DROP COLUMN corregido_rol;
ALTER TABLE merma_consolidada DROP COLUMN corregido_ts;
ALTER TABLE merma_consolidada DROP COLUMN sin_explicar_kg;
ALTER TABLE merma_consolidada DROP COLUMN por_etapas;
