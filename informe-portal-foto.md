# Informe · Portal del cliente: comprobante de pago y llegada del despacho

Todo local (nada de deploy, migración remota ni commit). Migración nueva: `0012_comprobante_llegada.sql` (ya aplicada en la base local).

## Qué se construyó
1. **Comprobante de pago.** Al reportar un pago el cliente puede adjuntar foto o captura (cámara o galería). Se comprime en el navegador (máx. 1000 px, JPEG 0,6; si pasa del tope baja calidad y tamaño) y se guarda como base64 en `pagos_reportados.comprobante`. El pago sigue "por verificar". En «Pagos por verificar» de Cobranza aparece el botón **Ver comprobante** (o «Sin comprobante»). La imagen no viaja en las listas: se pide aparte.
2. **Llegada del despacho.** En el portal hay una pestaña nueva **Entregas**. Cada documento tiene «Ya llegó mi pedido»: foto + UN total de bultos recibidos (entero 0 o más).
   - La primera foto (cliente o Despachos) arranca el reloj. Si ya había foto de Despachos, la del cliente solo se guarda. Si la del cliente fue primero y Despachos sube después, se conserva la hora del cliente.
   - Si el total no coincide con los bultos del documento se abre un reclamo (mismo flujo «no recibí esto») y el plazo queda en pausa hasta resolverlo.
   - Se guarda quién subió la foto y cuándo (`llegadas_cliente`: subido_por, foto_ts, bultos, si arrancó el reloj).
   - Despachos ve la foto del cliente y su cantidad en Entregas: pestaña nueva «Del cliente» y una línea «El cliente recibió X de Y bultos» en cada entrega.
   - Ventas ahora puede ver (solo mirar) Plazos y Reclamos; resolver sigue siendo de Cobranza, Administración y Dueño.

## Archivos
- Nuevos: `cloudflare/migrations/0012_comprobante_llegada.sql`
- Servidor: `src/entregas/{dominio,permisos,repo,servicio,rutas}.js`, `src/cliente/{repo,servicio,rutas}.js`
- Portal cliente: `front/cliente/portal.js`, `portal.css`, `front/entregas/portal-entregas.js`, `build-cliente.js` (ahora incluye portal-entregas.js en `cliente.html`)
- Equipo: `front/cliente/c-equipo.js`, `cliente.css`, `front/entregas/{e-core,e-entregas,e-cobranza}.js`
- Regenerados: `public/cliente.html`, `public/index.html`, `public/mis-entregas.html` (con `node build.js`)
- No toqué `app-source.html`, `src/ventas`, `front/ventas`.

## Rutas nuevas
- Cliente (x-token): `POST /api/c/entregas/llegada {id_documento, foto, mini, bultos_recibidos}`; `POST /api/c/portal/pagos` acepta `comprobante`.
- Equipo (x-rol): `GET /api/v/portal/pagos/:id/comprobante`, `GET /api/v/entregas/llegadas`, `/llegadas/minis`, `/llegadas/:id/foto`.

## Pruebas por API (curl): pasaron
- Total que coincide (doc 27): reloj arrancó con la foto del cliente, sin reclamo.
- Total distinto (doc 30, 5 de 1): reclamo ABIERTO, estado del plazo PAUSADA, visible para Ventas y Cobranza.
- Despachos primero (doc 31) y luego el cliente: `arranco_reloj=false`, hora intacta.
- Cliente primero (doc 27) y luego Despachos: se conserva la hora del cliente.
- Repetir aviso: 409. Documento de otro cliente: 404. Total negativo o decimal: 400. Archivo no JPEG: 400. Imagen enorme: 413. Token inválido: 401.
- Pago con comprobante: queda POR_VERIFICAR, `tiene_comprobante=true`, Cobranza lo descarga; Empaque recibe 403; comprobante inválido: 400; pago sin comprobante sigue funcionando.
- Ventas: ve plazos y reclamos (200), no puede resolver (403).

## Pruebas en navegador: pasaron
- 1366x768: adjuntar captura grande (3000x2000) en «Pagar» se comprime a ~103 KB y el pago se envía; Cobranza abre «Ver comprobante» y ve la imagen (1000x667). Aviso de llegada desde la pestaña Entregas con 20 de 26 bultos: plazo en pausa y reclamo. Despachos ve el aviso del cliente con la foto.
- 375x812: pestaña Entregas y tarjetas sin desbordar (ancho 375). Las 5 pestañas caben.
- Consola: sin errores nuevos atribuibles a este trabajo (la consola compartida mostraba errores 400/403/409 de pruebas ajenas y de otros agentes).
- Los datos de prueba que creé (avisos, reclamos, entregas y pagos de prueba) se borraron de la base local.

## No verificado
- Cámara real en un celular (se simuló con archivos desde script).
- Pantalla de Plazos con rol Ventas en el navegador (solo por API).
- La pestaña «Del cliente» se renombró en el código después de la prueba visual (antes decía «Avisos de clientes»); no se volvió a mirar.
- Cuántas fotos caben en D1 a largo plazo (cada una ~100-300 KB en base64; si crecen, pasar a R2).
- «Entregado / en camino» no existe como estado en el sistema: el aviso de llegada se permite en cualquier documento del cliente que no esté anulado. Si un documento no tiene detalle de bultos (importado), se guarda el total pero no se puede comparar y no abre reclamo.
- Las pestañas Entregas del equipo ya tenían scroll vertical a 1366x768; no medí si lo empeora la pestaña nueva.
