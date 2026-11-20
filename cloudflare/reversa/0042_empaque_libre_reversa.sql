-- Reversa de 0042: quita la tabla del empaque libre. OJO: el inventario ya sumado queda como está (no se resta solo).
DROP INDEX IF EXISTS empl_tipo;
DROP TABLE IF EXISTS empaque_libre;
