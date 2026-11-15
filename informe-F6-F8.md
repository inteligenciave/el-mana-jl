# Informe F6 y F8 (inventario único, producción por zonas) - solo local

Sin `wrangler deploy`, sin migraciones remotas, sin commits. `node build.js` termina bien. wrangler dev sigue activo en el puerto 8799.

## Qué quedó hecho
- **Inventario único (F6):** la existencia del producto terminado es `productos.stock_entero`, en bultos. Ventas apartó/dispone sobre esa misma cifra: disponible = existencias menos apartado. El cierre de turno suma ahí y Ventas lo ve al instante. Conteo inicial en bultos, una sola vez, solo el Dueño. Entrada manual: solo el Dueño y con motivo (antes la podían hacer otros roles).
- **Etapa 2 (kg y unidades por bulto):** ya existía (migración 0006). Solo se agregó que cada documento guarda los kg por bulto del momento y la nota/factura los muestra.
- **Etapa 3:** rol nuevo «Producción» (más el Dueño). Turno: abrir, anotar kilos que entran/salen en recepción, lavado, fritado y empacado, anotar bultos empacados por producto, cerrar. Al cerrar se comparan los kilos declarados contra los anotados, se suman los bultos al inventario y todo queda en auditoría. Pantalla «En proceso (kilos)» con el saldo por etapa.
- **Etapa 4 y 6:** zonas = la zona del estado del cliente (la que ya existía). Tablero con una tarjeta por zona: kilos acumulados, meta 15 t, kilos que faltan, pedidos, días de espera, dinero. Orden: kilos, luego espera, luego dinero. Semáforo solo verde (llegó a la meta) o ámbar (solo si el Dueño carga un corte); sin corte cargado no hay ámbar.
- **Etapa 5:** vender = registrar un PEDIDO que aparta bultos. Sin inventario disponible no se vende (mensaje «Sin inventario»). La nota o factura se emite al DESPACHAR, con los precios y kilos congelados en el pedido. Se agregó kilos por línea y total en la venta.
- **Etapa 7:** Dueño y Jefe de producción: armar salida con lo que se elija, despachar antes de la meta con motivo obligatorio, pausar/reanudar zona (con motivo), dividir un pedido en dos salidas (motivo obligatorio), anular salida. Si la zona pasó de la meta decide solo el Dueño. Todo queda en auditoría.

## Archivos
- Migración: `cloudflare/migrations/0013_produccion_zonas.sql` (aplicada solo en local)
- Nuevos: `src/produccion/dominio.js`, `permisos.js`, `repo.js`, `servicio.js`, `rutas.js`; `front/produccion/p-prod.js`, `produccion.css`
- Cambiados: `src/worker.js` (ruta `/api/p/*`), `src/ventas/servicio.js` (pedido en vez de documento al vender, documento al despachar, cobro al despachar, entrada solo Dueño, disponible), `src/ventas/repo.js`, `src/ventas/permisos.js` (rol Producción), `front/ventas/v-pedido.js`, `front/ventas/v-admin.js`, `front/pantallas/pantallas.js`, `app-source.html` (rol y pantallas), `build.js`, `public/index.html` (regenerado)
- No se tocó: `src/cliente`, `src/entregas`, `front/cliente`, `front/entregas`.

## Pruebas (API con x-rol y pantalla)
PASARON:
- Pedido de 3+2 bultos: aparta, kilos 48 correctos; tablero y zona los muestran.
- Pedir más de lo disponible: rechazado con «Sin inventario…» (409).
- Rol Ventas no puede armar salida (403); Jefe sin motivo bajo la meta (400); con motivo y dividiendo un pedido: ok.
- Más bultos de los libres en una salida: rechazado. Despachar: emite NE con kg por bulto y baja existencias y apartado a la vez; el pedido queda PARCIAL.
- Pausar zona (Jefe): la zona pasa a pausadas y no deja armar; reanudar ok.
- Con meta bajada a 40 kg y zona sobre la meta: Jefe bloqueado («decide el Dueño»); Jefe no puede cambiar ajustes. Meta restaurada a 15.000.
- Anular pedido (Dueño): libera lo apartado.
- Turno: Jefe no puede abrirlo; Producción sí; un segundo turno abierto se rechaza; kilos negativos rechazados; cierre con diferencia (-0,5 kg y -1 bulto) suma los bultos declarados al inventario.
- Entrada manual: Administración rechazada; Dueño sin motivo rechazado. Conteo inicial: no Dueño rechazado, menor que lo apartado rechazado, una vez ok, segunda vez rechazada. Se dejó la bandera local del conteo en vacío para poder probarlo de nuevo.
- «Pagó ahora»: factura FA-000018 emitida al despachar y cobrada (RC-00025).
- Sin x-rol: 401. Pantalla: tablero, detalle de zona, selección con cantidades, modal de armar salida, turno abierto y anotado, mobile 375 sin desborde horizontal, venta con «Disponibles», kilos y botones «Registrar pedido».
- Consola: sin errores de programa del código nuevo (los avisos que aparecen son del inyector de pruebas y respuestas 4xx provocadas).

## No verificado o pendiente
- Pantalla de Ajustes, Inventario y conteo inicial por clic (probados solo por API).
- Despachar y anular salida por clic en la pantalla (probados por API).
- Aprobar un pedido del portal del cliente de punta a punta: `src/cliente` no se tocó y sigue llamando a `vender`, que ahora devuelve el número de pedido en `nro_control_interno` y `id_documento` vacío (la columna del portal lo permite). No se corrió ese flujo.
- El portal sigue mostrando `stock_entero` (no el disponible) en «alcanza».
- Sin scroll a 1366x768: en el navegador de prueba TODAS las pantallas, también las que ya existían, miden unos 857 px de alto con 768 de ventana (marco general de la app), así que no se pudo dejar en cero; las pantallas nuevas no agregan más que ~20 px (inventario).
- Etapa 8 (unificar pantallas antiguas de Empaque/Despachos con las nuevas): no se hizo; conviven. Las pantallas viejas de empaque y despacho no descuentan del inventario único.

## Decisiones propias
- Pedido de venta y salida son tablas nuevas; el documento (nota/factura) nace al despachar, uno por pedido por salida.
- «Pagó ahora»: se guarda el pago en el pedido y se cobra con el primer documento emitido (con el puesto de quien vendió); lo que se despache después queda a crédito.
- Crédito: se cuenta deuda más lo pedido y sin despachar; la pantalla lo rotula «Deuda y pedidos por despachar».
- Cierre de turno: el inventario sube con los bultos DECLARADOS al cerrar (si no se escribe, los anotados). Los kilos declarados por etapa generan un ajuste para que el saldo coincida. Solo un turno abierto a la vez.
- Etapas fijas (recepción, lavado, fritado, empacado). Meta 15.000 kg guardada como ajuste que solo cambia el Dueño; corte ámbar y tolerancia vacíos hasta que el Dueño los cargue (no se inventaron cifras).
- Vehículo y chofer son texto libre y opcionales.
- Al aplicar migraciones locales también se aplicó la 0012 del otro agente (solo en local, inofensivo).
- Datos de prueba que quedaron en la base local: PED-000001 a 000004, NE-000019, FA-000018, SAL-00001/2, un turno cerrado, RC-00025.
