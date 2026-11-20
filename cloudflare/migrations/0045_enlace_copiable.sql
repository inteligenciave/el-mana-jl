-- Enlace personal del portal del cliente: se guarda el código del enlace (ya es largo y al azar, 256 bits) para poder copiarlo y reenviarlo.
-- Los enlaces anteriores no lo tienen (solo se guardó su huella): para esos clientes hay que «Generar enlace nuevo» una vez.
ALTER TABLE cliente_enlaces ADD COLUMN token_claro TEXT;
