# Informe F9 (corto)

## Qué pasó
Se hicieron las 5 decisiones del dueño y se repitieron las pruebas por API y en pantalla (rol dueno/adm/ventas, 1366x768 y celular).

## Qué corregí
1. **Menú lateral:** el grupo «Sesión» quedó junto y con menos espacios; el marco cabe en 768 px sin scroll.
2. **Clientes:** una sola lista (estado → zona → lista de precios). Migración `0014` (solo local). No se perdió ningún cliente. Duplicados detectados, SIN fusionar: CL-001 y cliente 12; CL-003 y cliente 11.
3. **Tasa:** encabezado y Compras usan la misma tasa vigente del servidor.
4. **Botones de fotos y comprobantes:** probados con clic real y archivos JPG/PNG grandes, sin tipo, PDF y HEIC (portal «Pagar», Entregas «Ya llegó», Despachos, Cobranza «Ver comprobante»). Ahora: no se repinta la pantalla mientras se elige el archivo, y hay mensajes claros para PDF y HEIC.
5. **Etapa 8:** Empaque y Despachos descuentan del inventario único (disponible = existencias − apartado). El portal muestra el disponible. Al aprobar un pedido del portal se pide el banco.
6. **Pruebas repetidas:** Pagó ahora, bancos vacíos (pantalla Bancos muestra aviso claro; la venta sin banco se acepta), tramo 21 días, enlace vencido, pedido por confirmar → aprobación, pago por verificar → confirmación, comprobante/llegada, zonas: correctas.

## Qué queda abierto
- «Estados y listas» sin revisar a fondo en pantalla; recepción con kg −5 sin repetir.
- HEIC real y cámara real de celular: sin probar (solo archivos simulados).
- Empaque y Despachos viejos quedaron sin formulario propio (usan el nuevo).
- Listas largas de clientes sin paginación.
- Tasa 0 si el servidor falla.
- Heredados: hora del cron y fuente BCV.
- Datos de prueba (UATA-/UATB-/UATF1-) se dejaron. Bancos reales reactivados; banco 14 (de prueba) queda desactivado.
