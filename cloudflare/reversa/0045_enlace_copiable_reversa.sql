-- Reversa de 0045: quita el código guardado de los enlaces. Los enlaces dejan de poder copiarse (siguen funcionando con su huella).
ALTER TABLE cliente_enlaces DROP COLUMN token_claro;
