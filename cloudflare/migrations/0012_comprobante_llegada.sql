/* Portal del cliente: comprobante de pago y llegada del despacho con foto. Sin claves foráneas (igual que el resto del portal).
   Las imágenes ya vienen comprimidas desde el navegador (JPEG en base64, sin prefijo data:). */
ALTER TABLE pagos_reportados ADD COLUMN comprobante TEXT;
ALTER TABLE pagos_reportados ADD COLUMN comprobante_bytes INTEGER;

/* Llegada del despacho avisada por el cliente: una por documento. Guarda quién subió la foto y cuándo. */
CREATE TABLE IF NOT EXISTS llegadas_cliente (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_documento INTEGER NOT NULL,
  id_cliente INTEGER NOT NULL,
  foto TEXT NOT NULL,
  mini TEXT,
  foto_bytes INTEGER NOT NULL DEFAULT 0,
  foto_ts INTEGER NOT NULL,                 -- cuándo se subió la foto
  subido_por TEXT NOT NULL DEFAULT 'Cliente',
  bultos_recibidos INTEGER NOT NULL CHECK (bultos_recibidos >= 0),
  bultos_despachados INTEGER,               -- el total del documento al momento de avisar (vacío si el documento no tiene detalle)
  coincide INTEGER,                         -- 1 coincide · 0 no coincide · vacío no se pudo comparar
  arranco_reloj INTEGER NOT NULL DEFAULT 0, -- 1 si esta fue la primera foto y de aquí corren los días
  ejemplo INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS lleg_doc ON llegadas_cliente (id_documento);
CREATE INDEX IF NOT EXISTS lleg_cli ON llegadas_cliente (id_cliente);
