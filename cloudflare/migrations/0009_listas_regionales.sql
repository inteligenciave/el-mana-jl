-- Listas de precios regionales (A y B) con precio por bulto de CONTADO y de CREDITO, en dolares (centavos enteros).
-- Reemplazan los niveles de precio del catalogo: el precio_ref_cents anterior queda solo como respaldo para productos sin lista.
-- Los precios los carga el Dueño (carga inicial auditada); esta migracion NO trae precios, solo la estructura.
CREATE TABLE IF NOT EXISTS precios_lista (
  id_producto INTEGER NOT NULL REFERENCES productos(id_producto),
  lista TEXT NOT NULL CHECK (lista IN ('A','B')),
  contado_cents INTEGER NOT NULL CHECK (contado_cents > 0),
  credito_cents INTEGER NOT NULL CHECK (credito_cents > 0),
  actualizado_ts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (id_producto, lista)
);
-- Ficha del cliente: que lista regional usa (se deduce de la zona si no se elige) y a donde se le entrega.
ALTER TABLE clientes ADD COLUMN lista_regional TEXT CHECK (lista_regional IS NULL OR lista_regional IN ('A','B'));
ALTER TABLE clientes ADD COLUMN direccion_entrega TEXT;
-- Documentos NUEVOS: ubicacion de envio congelada al emitir (no cambia si luego se edita la ficha) y lista usada.
ALTER TABLE documentos_venta ADD COLUMN envio_zona TEXT;
ALTER TABLE documentos_venta ADD COLUMN envio_direccion TEXT;
ALTER TABLE documentos_venta ADD COLUMN lista_precios TEXT;
