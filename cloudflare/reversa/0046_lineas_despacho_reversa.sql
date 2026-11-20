-- Reversa de 0046: quita las líneas de despacho y sus columnas en salidas.
-- OJO: las salidas armadas por línea quedan solo con «zona» (que guarda el nombre de la línea) y sin el porcentaje del camión.
DROP INDEX IF EXISTS linz_linea;
DROP TABLE IF EXISTS linea_zonas;
DROP INDEX IF EXISTS linea_nombre_unico;
DROP TABLE IF EXISTS lineas_despacho;
ALTER TABLE salidas DROP COLUMN id_linea;
ALTER TABLE salidas DROP COLUMN kg_papa;
ALTER TABLE salidas DROP COLUMN kg_salsa;
ALTER TABLE salidas DROP COLUMN ocupacion_pct;
ALTER TABLE salidas DROP COLUMN cap_papa_kg;
ALTER TABLE salidas DROP COLUMN cap_salsa_kg;
DELETE FROM config WHERE clave IN ('cap_papa_kg', 'cap_salsa_kg');
