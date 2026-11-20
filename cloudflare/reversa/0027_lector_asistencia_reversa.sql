-- Reversa de 0027: quita lo del lector. Las marcas de asistencia que vinieron del lector se borran de «marcas» (origen = 'lector'); las marcadas a mano no se tocan.
DELETE FROM marcas WHERE origen = 'lector';
DROP INDEX IF EXISTS marcas_lector_uno;
ALTER TABLE marcas DROP COLUMN origen;
DROP TABLE IF EXISTS lector_dias;
DROP TABLE IF EXISTS lector_marcas;
