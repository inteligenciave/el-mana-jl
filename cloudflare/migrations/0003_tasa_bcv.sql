/* Etapa 1 · Tasa BCV automática.
   Una fila por día (fecha valor publicada por el BCV). El servidor toma la tasa de aquí; la pantalla ya no la manda.
   origen: AUTO = consultada a la fuente oficial · DEV = cargada a mano SOLO en pruebas locales (no existe en producción). */
CREATE TABLE IF NOT EXISTS tasas_bcv (
  fecha TEXT PRIMARY KEY CHECK (fecha GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  valor REAL NOT NULL CHECK (valor > 0),
  fuente TEXT NOT NULL,
  obtenida_en TEXT NOT NULL,
  origen TEXT NOT NULL DEFAULT 'AUTO' CHECK (origen IN ('AUTO', 'DEV'))
) WITHOUT ROWID;

/* Fuente: página oficial del BCV (P-T3, opción recomendada). Se puede cambiar en la tabla config.
   El estado de la última consulta arranca vacío (OK o FALLO después de cada consulta). */
INSERT OR IGNORE INTO config (clave, valor) VALUES
  ('tasa_fuente_url', 'https://www.bcv.org.ve/'),
  ('tasa_ultimo_estado', ''),
  ('tasa_ultimo_intento', ''),
  ('tasa_ultimo_dia', ''),
  ('tasa_ultimo_error', '');
