# Plan · Portal del cliente

Objetivo: que cada cliente entre con un enlace personal, vea solo lo suyo, arme pedidos y reporte pagos; el equipo aprueba y verifica antes de que algo toque inventario o facturas.

## Decisiones
- **Entrada:** enlace/código personal de 43 caracteres al azar (256 bits). En la base solo se guarda su huella (SHA-256); el código completo se muestra una sola vez al generarlo. Revocable, con vencimiento opcional. Un cliente tiene un solo enlace activo (generar uno nuevo revoca el anterior). Nunca se usa el RIF ni números seguidos.
- **Enlace:** `/cliente.html#CODIGO`. El código va después del `#`, así no queda en registros del servidor; el portal lo manda en la cabecera `x-token`.
- **Seguridad:** el servidor saca el cliente del código y filtra todo por él (nunca recibe un id de cliente). Intentos con código inválido: máximo 10 cada 15 minutos por IP (tabla en D1, vale entre instancias); respuesta genérica. Mensajes de duplicado sin datos de otros clientes. Rutas del portal: `/api/c/portal/*`; las de `/api/v/*` no se usan desde el portal. Rutas del equipo: `/api/v/portal/*` (con rol, como el resto de Ventas).
- **Pedido propio:** catálogo con el precio del cliente (reglas de Ventas), bloqueo «Sin inventario» y límite de crédito (deuda + pedidos por confirmar). Queda `POR_CONFIRMAR`. Al aprobar Ventas se llama a `vender` (el mismo flujo normal) y el pedido queda `APROBADO` con el documento generado. Rechazar pide motivo.
- **Estado de cuenta:** deuda, desde cuándo, documentos (facturas/notas de entrega), notas de crédito/débito, pagos con recibo, pedidos y pagos reportados.
- **Reportar pago:** banco, referencia, monto en Bs, fecha. Queda `POR_VERIFICAR`; no toca facturas. Se bloquea banco + referencia repetidos (contra pagos ya registrados y contra otros reportes). Al confirmar, Cobranza llama a `cobrar` (tasa BCV del servidor, PIN si la fecha es anterior a hoy) y el pago se reparte al documento más antiguo primero.
- **Equipo:** ficha del cliente (RIF, zona, límite, nivel de precio, vendedor) con generar/revocar enlace; pantallas «Pedidos por confirmar» y «Pagos por verificar». Buscador `Busca` y sin deslizar la página en PC.
- **Marca:** rojo #C92121, amarillo #F2B72E, blanco, gris casi negro; móvil primero.

## Piezas (archivos nuevos; solo cambios aditivos en worker.js y build.js)
- `migrations/0004_portal_cliente.sql` · `src/cliente/{dominio,repo,servicio,rutas,tasa-acceso}.js`
- `front/cliente/portal.{js,css}` (página pública) · `front/cliente/c-*.js`, `cliente.css` (pantallas del equipo, grupo «Portal de clientes»)
- `build-cliente.js` (genera `public/cliente.html` y el paquete para la app)

## Ganchos (no se construyen)
- Kilos por bulto / bultos / zonas: `src/cliente/dominio.js` → `extraProducto()` y `restriccionZona()` devuelven vacío hoy.
- Tasa BCV: se lee de `src/tasa/servicio.js` (`vigente`) solo desde `tasa-acceso.js`; si falla, el portal no muestra el equivalente en Bs.

## Pruebas
API (token válido, vencido, revocado, inválido repetido → 429, cliente A no ve cliente B, pedido sin inventario/sobre crédito, aprobar, reporte de pago duplicado, confirmar). Navegador a 390 px y 1366 px, sin errores de consola.
