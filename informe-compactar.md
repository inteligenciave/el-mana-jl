# Informe: compactar el sistema (1366x768, computador)

Cambio central: nuevo `cloudflare/front/comun/compacto.css` (va al final de la hoja; solo desde 1024 px de ancho, el celular queda igual) + bloque «COMPACTO» al final de `front/cliente/portal.css` (portal del cliente, desde 900 px). Menos relleno y márgenes, menú lateral 252→200 px, cabecera más baja, filas de tabla y botones más bajos (cuerpo 14 px, botones ≥28 px), tarjetas de totales en una línea, filtros en una fila, y listas largas con altura propia (desplazamiento solo dentro de la lista). Textos e información sin cambios.
Medición: `document.documentElement.scrollHeight` a 1366x768, rol Dueño, datos de ejemplo. 768 = cabe sin desplazamiento.

| Pantalla | Antes (px) | Después (px) |
|---|---|---|
| Quién debe | 1575 (1237 medido por el dueño) | 768 |
| Cobros hechos | 2781 | 768 |
| Registro de ventas | 1054 | 768 |
| Clientes y catálogo / Clientes | 3972 | 768 |
| Hacer una venta (catálogo) | 768 | 768 |
| Registrar cobro | 768 | 768 |
| Comisiones y asientos | 1478 | 768 |
| Precios por lista / por cliente / Bancos | 768 / 803 / 1276 | 768 / 768 / 768 |
| Entregas con foto | 989 | 768 |
| Plazos y reclamos (Cobranza) | 1142 | 785 |
| Pedidos zona / Turno / Ajustes / Inventario terminado (Producción) | 768 / 768 / 768 / 919 | 768 |
| Recepción | 2715 | 2036 |
| Empaque | 2591 | 1558 |
| Despachos | 3477 | 1667 |
| Compras de papa e insumos | 6409 | 3469 |
| Compras generales | 4586 | 2615 |
| Cuentas por pagar | 4764 | 2375 |
| Personal / Asistencia / Nómina | 3497 / 3514 / 4660 | 1079 / 1967 / 2631 |
| Control de gestión (Gerencia) | 7327 | 5013 |
| Roles (Quién ve qué) | 12987 | 1610 |
| Análisis de compras | 16719 | 4396 |

## Pendientes
- Pantallas largas de formularios y tableros de Producción/Compras/Gerencia (recepción, mermas 4732, gestión 5013, compras, análisis, nómina, asistencia, inventario 1693) siguen con desplazamiento de la página: son muchas tarjetas apiladas; para que quepan sin desplazar hay que rediseñar su distribución (decisión del dueño).
- Plazos y reclamos: 785 px (17 px de más) con los datos de ejemplo.
- Portal del cliente (cliente.html, mis-entregas.html): compactado en computador pero NO medido con sesión: generar un enlace de portal escribe en la base (prohibido en esta tarea). Revisar con un enlace real.
- Celular 375 px: sin desbordes horizontales en ninguna de las pantallas medidas (las reglas nuevas no aplican en celular).
- Solo capturas ya revisadas: Hacer una venta, Quién debe, Cobros hechos, Recepción.
