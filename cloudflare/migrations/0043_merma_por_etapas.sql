-- 0043 · Merma por etapas al cierre del turno. Solo agrega columnas e índice. Aplicar SOLO con --local hasta que el dueño autorice.
ALTER TABLE merma_consolidada ADD COLUMN por_etapas INTEGER NOT NULL DEFAULT 0;   -- 1 = el detalle está en mermas_etapa (origen 'cierre', ref MC-<id_turno>)
ALTER TABLE merma_consolidada ADD COLUMN sin_explicar_kg REAL NOT NULL DEFAULT 0;  -- calculada − suma anotada (negativo si sobra)
ALTER TABLE merma_consolidada ADD COLUMN corregido_ts INTEGER;
ALTER TABLE merma_consolidada ADD COLUMN corregido_rol TEXT;
ALTER TABLE mermas_etapa ADD COLUMN persona TEXT;                                   -- nombre de quien anota (vacío hasta que exista sesión con clave)
CREATE INDEX IF NOT EXISTS mermas_etapa_turno ON mermas_etapa (id_turno, origen, estado);
