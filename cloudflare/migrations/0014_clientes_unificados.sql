-- Lista UNICA de clientes: la de Ventas (tabla clientes) pasa a ser la unica. Los clientes de la lista vieja de Administracion
-- (coleccion docs/clientes) se copian aqui SIN BORRAR nada de la lista vieja y SIN fusionar duplicados: si ya existe un cliente
-- con el mismo RIF o el mismo nombre, NO se copia y queda anotado en clientes_duplicados_revision para que lo decida una persona.
ALTER TABLE clientes ADD COLUMN estado_cliente TEXT NOT NULL DEFAULT 'activo' CHECK (estado_cliente IN ('activo','inactivo','archivado'));
ALTER TABLE clientes ADD COLUMN id_origen TEXT;   -- id que tenia en la lista vieja de Administracion (CL-001...)

CREATE TABLE IF NOT EXISTS clientes_duplicados_revision (
  id_origen TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  rif TEXT,
  motivo TEXT NOT NULL,
  id_cliente_existente INTEGER
);

INSERT OR IGNORE INTO clientes_duplicados_revision (id_origen, nombre, rif, motivo, id_cliente_existente)
SELECT json_extract(d.data,'$.id'), json_extract(d.data,'$.nombre'), json_extract(d.data,'$.rif'),
  CASE WHEN EXISTS (SELECT 1 FROM clientes c WHERE c.rif_id IS NOT NULL AND c.rif_id = json_extract(d.data,'$.rif')) THEN 'mismo RIF' ELSE 'mismo nombre' END,
  (SELECT c.id_cliente FROM clientes c WHERE (c.rif_id IS NOT NULL AND c.rif_id = json_extract(d.data,'$.rif')) OR c.razon_norm = upper(trim(replace(replace(replace(replace(json_extract(d.data,'$.nombre'),'(',''),')',''),'.',''),'-',' '))) LIMIT 1)
FROM docs d WHERE d.col = 'clientes'
  AND EXISTS (SELECT 1 FROM clientes c WHERE (c.rif_id IS NOT NULL AND c.rif_id = json_extract(d.data,'$.rif')) OR c.razon_norm = upper(trim(replace(replace(replace(replace(json_extract(d.data,'$.nombre'),'(',''),')',''),'.',''),'-',' '))));

INSERT INTO clientes (rif_id, razon_social, razon_norm, dias_credito_normal, id_vendedor, telefono, origen, ejemplo, creado_ts, estado_cliente, id_origen)
SELECT json_extract(d.data,'$.rif'), json_extract(d.data,'$.nombre'),
  upper(trim(replace(replace(replace(replace(json_extract(d.data,'$.nombre'),'(',''),')',''),'.',''),'-',' '))),
  json_extract(d.data,'$.credito'),
  (SELECT v.id FROM vendedores v WHERE upper(v.nombre) = upper(json_extract(d.data,'$.vend')) LIMIT 1),
  NULLIF(trim(json_extract(d.data,'$.tel')),''), 'admin_lista_vieja',
  CASE WHEN lower(json_extract(d.data,'$.nombre')) LIKE '%(ejemplo)%' THEN 1 ELSE 0 END, CAST(strftime('%s','now') AS INTEGER) * 1000,
  CASE WHEN json_extract(d.data,'$.arch') THEN 'archivado' WHEN json_extract(d.data,'$.estado') = 'inactivo' THEN 'inactivo' ELSE 'activo' END,
  json_extract(d.data,'$.id')
FROM docs d WHERE d.col = 'clientes'
  AND json_extract(d.data,'$.id') NOT IN (SELECT id_origen FROM clientes_duplicados_revision);

-- Nombre normalizado igual que el de la app (sin tildes, mayusculas, signos como espacio)
UPDATE clientes SET razon_norm = trim(replace(replace(replace(upper(
  replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(razon_social,
  'á','A'),'é','E'),'í','I'),'ó','O'),'ú','U'),'ñ','N'),'Á','A'),'É','E'),'Í','I'),'Ó','O'),'Ú','U'),'Ñ','N')),
  '(',' '),')',' '),'-',' ')) WHERE origen = 'admin_lista_vieja';
UPDATE clientes SET razon_norm = replace(replace(replace(razon_norm,'  ',' '),'  ',' '),'  ',' ') WHERE origen = 'admin_lista_vieja';
