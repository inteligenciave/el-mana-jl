# Bitácora de cambios — El Maná JL

Todo lo de aquí se hizo y se probó **en la computadora local** (puerto 8799). **No se ha subido a Cloudflare** (sin deploy y sin migraciones en producción). Fecha de la bitácora: 14-11-2026.

## Lo que se hizo

### Flota de vehículos y choferes al despachar (15-11-2026, local)
- La ventana «Despachar salida» (Producción › Pedidos por zona) ahora tiene listas plegables: Vehículo (flota activa) y Chofer (personas de Personal con cargo de chofer o conductor, o marcadas «Es chofer» en su ficha). Al elegir un vehículo con chofer habitual, el chofer se completa solo.
- Dueño y Administración ven «+ Agregar vehículo» dentro de la lista (placa, tipo, marca, capacidad) y la pantalla nueva Administración › Flota › Vehículos (alta, edición, estado: activo, en taller, fuera de servicio; seguro y documentos con fecha de vencimiento y aviso ámbar desde 30 días antes o vencidos). Los demás puestos solo eligen (el servidor responde 403 si intentan escribir). La flota empieza vacía.
- Solo salen en la lista los vehículos activos. Si la salida supera los kilos o bultos del vehículo, o hay documentos por vencer, aparece un aviso (no bloquea).
- La salida guarda el vehículo y el chofer (id y texto de respaldo; las salidas viejas con texto libre siguen igual). Se ven en el aviso al despachar y en «Últimas salidas despachadas» de cada zona.
- Personal: casilla nueva «Es chofer» en la ficha.
- Archivos: migrations/0018_flota.sql (solo --local), src/flota/* (dominio, repo, servicio, rutas /api/f/*), src/acceso.js, src/worker.js, src/produccion/servicio.js y repo.js, front/produccion/p-flota.js (nuevo), p-prod.js, produccion.css, front/pantallas/pantallas.js, build.js, app-source.html (casilla de Personal).

### Lo que escribes se guarda si la página se actualiza (15-11-2026, local)
- Si la página se recarga (F5) o se cierra por error, lo que estabas escribiendo vuelve: campos de formularios, filtros y búsquedas, la pestaña abierta y la pantalla donde estabas. Sale un aviso corto «Recuperamos lo que estabas escribiendo».
- Se guarda solo en este navegador, por pantalla y por rol, y dura 24 horas. Se borra al enviar o guardar, al cancelar, al cerrar la ventana sin guardar y al «Cambiar rol» o salir. Nunca se guardan contraseñas, PIN, claves, números de cuenta ni tarjetas.
- Aplica a todas las pantallas internas; el portal del cliente guarda también el carrito y la pantalla. Si el navegador no deja guardar, todo funciona igual.
- Archivos: front/comun/borrador.js (nuevo), build.js, build-cliente.js, app-source.html (una línea al arrancar), front/comun/compacto.js (pestañas), front/cliente/portal.js.

### PDF de nota de entrega y factura (15-11-2026, local)
- Ya se descarga el ARCHIVO PDF real (no la vista de impresión): `Nota-NE-000030.pdf`, `Factura-FA-000014.pdf`. Al VENDER sale el PDF del pedido rotulado «Pedido / Nota de entrega» (o «Pedido / Factura») con su número PED- (sin numeración fiscal nueva); al despachar, el de la nota o factura definitiva (NE-/FA-).
- Trae empresa, cliente, número y fecha, tasa BCV del día de emisión, bultos y kilos, precio por bulto, total en US$ y Bs, condición y plazo, cuenta bancaria, ubicación de envío (estado, zona, dirección) y la marca roja/amarilla con logo. Funciona sin internet (generador propio, sin librerías).
- Dónde: Ventas → al registrar una venta sale una ventana con «Descargar PDF»; «Registro de ventas» tiene «Pedidos recientes»; la ventana de cada nota/factura tiene «Descargar PDF». Portal del cliente → «Facturas y notas» (pedidos por despachar y documentos), solo los suyos (documento ajeno: 404).
- Archivos: front/comun/pdf.js (nuevo), src/ventas/servicio.js, rutas.js, src/cliente/servicio.js, rutas.js, front/ventas/v-docs.js, v-pedido.js, v-listas.js, v-registro.js, front/cliente/portal.js, build.js, build-cliente.js.

### Asistencia: botones de horas sin cortarse (15-11-2026, local)
- En la tarjeta de quien cobra por hora, los botones −8 −1 / +1 +8 ya caben dentro de la tarjeta en pantalla de computador (botones más angostos, mismo uso). Revisadas Asistencia y Nómina: ninguna tarjeta se sale.

### Sistema más compacto (15-11-2026, local)
- Menos espacio en blanco en computador: menú más angosto, cabecera y tarjetas más bajas, tablas y botones más juntos, totales en una línea, filtros en una fila, listas largas con su propio desplazamiento. Quién debe, Cobros hechos, Registro de ventas, Clientes, Precios, Bancos, Entregas y Producción por zonas ya caben sin desplazar la pantalla a 1366x768. Textos e información iguales; el celular no cambia.
- Archivos: cloudflare/front/comun/compacto.css (nuevo), build.js, front/cliente/portal.css, ajustes menores en v-listas.js y e-cobranza.js. Detalle y pendientes en informe-compactar.md.

### Tasa del dólar (BCV) automática
- La tasa la trae el sistema solo desde la página oficial del BCV; ya no se escribe a mano.
- Si el BCV no tiene la tasa de una fecha, se usa la más reciente anterior; si no hay ninguna anterior (por ejemplo la primera publicación), se usa la más cercana posterior.
- El sistema vuelve a consultar al abrirse si la última consulta tiene más de 30 minutos.
- Además hay una consulta programada cada hora (cron `0 * * * *` en `cloudflare/wrangler.toml`), para recoger la tasa apenas aparece.
- El servidor ignora cualquier tasa que mande la pantalla.

### Productos en bultos y kilos
- Cada producto guarda **kilos por bulto** y **unidades por bulto**; son obligatorios para poder vender. No se rellenaron con cifras inventadas.
- Solo el Dueño y Administración los cargan o corrigen.
- El catálogo, la venta y la factura trabajan en bultos y muestran los kilos.

### Pantallas por rol y lanzador «Opciones»
- Hay 7 pantallas, una por puesto, y un lanzador «Opciones» para entrar a ellas.
- Solo el Dueño puede darle a un puesto funciones extra (aparecen en «Más opciones»). Eso solo cambia qué se ve; los permisos reales siguen igual.

### Precios por bulto y listas
- Los precios son por bulto, de contado y de crédito, en dólares.
- Solo Administración y el Dueño ven y manejan precios. Si **Administración** cambia un precio, queda **pendiente** hasta que el Dueño lo apruebe; mientras tanto sigue valiendo el anterior. Si lo cambia el Dueño, rige de una vez (queda registrado).
- Hay dos listas, **A** y **B**.
- Cada **estado** (los 24) apunta a **una zona/lista**. Varios estados pueden compartir lista. Un estado sin lista queda «sin precios» hasta que el Dueño le asigne una.
- El Dueño puede crear **listas propias**. Solo el Dueño asigna listas a los estados.
- Los precios reales se cargaron desde el Excel del dueño a la base **local**. Esos archivos de datos no están en este repositorio.

### Bancos
- Lista de bancos de la empresa (nombre, moneda Bs o USD, cuenta, titular). Arranca vacía: no se inventó ningún banco. Solo Dueño y Administración agregan, editan o desactivan (desactivar no borra).

### Catálogo y factura
- El catálogo y la factura muestran bultos y la **ubicación de envío** (zona y dirección), que queda fija al emitir aunque luego se edite la ficha del cliente.

### Clientes de ejemplo
- Se crearon clientes de ejemplo para probar. Los de «Zona Ejemplo» (ids 9 al 16) aún no tienen lista asignada.

### Limpieza de pantallas
- Se quitaron los textos de ayuda que estorbaban.

### Plan del recorrido
- `plan-recorrido.md` describe el recorrido de 8 pasos (pedir, recibir, producir, empacar, inventario, vender, cargar, despachar). Decisiones del Dueño ya tomadas:
  - P1: la ficha es un turno, anotando de qué recepciones vino la papa.
  - P2: Jefe de producción anota lavado y fritado; Empaque y despacho anota los bultos; Producción cierra el turno.
  - P3: de la merma solo se muestra la diferencia; la causa es opcional.
  - P4: Administración marca la solicitud como «pedida al proveedor»; Recepción la ve como tarea pendiente.
  - P5: se unen las pantallas viejas de producción, empaque e inventario; lo viejo queda solo para leer.
  - P6: las salsas van después; primero papas.
  - P7: Empaque y despacho cuenta al cargar el camión; la diferencia se muestra y lo que faltó queda pendiente.
  - P8: el aviso de tarea nueva es un contador grande en «Mis tareas» (sin WhatsApp).
  - P9: metas sugeridas con las últimas 4 semanas; «a tiempo» = día fijado por zona; el Dueño las ajusta.
  - P10: costo por bulto: primero papa e insumos, luego el resto.

## Cambios en la base de datos (migraciones 0003 a 0011)

Están en `cloudflare/migrations/`. Las 0001 y 0002 son la base inicial y las ventas.

| Número | Qué hace |
|---|---|
| 0003 | Guarda la tasa BCV de cada día y la fuente oficial. |
| 0004 | Portal del cliente: enlaces personales revocables. |
| 0005 | Entrega con foto y temporizador de días de crédito. |
| 0006 | Kilos por bulto y unidades por bulto en cada producto. |
| 0007 | Cambios de precio pendientes de aprobación del Dueño. |
| 0008 | Bancos de la empresa (arranca vacía). |
| 0009 | Listas de precios A y B (contado y crédito por bulto) y ubicación de envío del cliente. |
| 0010 | Funciones extra por puesto en «Más opciones». |
| 0011 | Listas con nombre propio y cada estado apunta a una lista. |
| 0012 | Comprobante y foto de llegada. |
| 0013 | Producción por zonas. |
| 0014 | Clientes unificados: una sola lista con estado, zona y lista de precios (solo local). |

## Pendiente

- **F9 hecho (ver `informe-F9.md`):** menú compacto, clientes unificados, tasa única, fotos y comprobantes, inventario único en Empaque/Despachos.
- Decidir los 2 duplicados de clientes (CL-001 con cliente 12, CL-003 con cliente 11).
- Probar HEIC real y cámara de celular real.
- Plan del recorrido: R0, R1, K1. Listas propias: renombrar y borrar.
- Decisión del Dueño: si Administración crea productos.
- Subir todo a Cloudflare: solo con autorización expresa del Dueño.

- Producción por turno: ya no se avanza de etapa, no se anotan bultos ni se cierra el turno sin kilos mayores que cero (servidor y pantalla; aviso «Escribe los kilos…»). Turno 5 (cerrado en ceros) reabierto; turnos 1, 3 y 4 listados sin tocar. Respaldo: respaldo-sin-kilos/.

- Herencia en el servidor (H0 a H5): migración 0015 (solo local), tabla de diferencias con aprobación del Jefe/Dueño, límites por etapa en lavado, fritado, empacado, cierre de turno, papa de recepciones validadas y conteo al cargar el camión; despachar solo lo cargado. Merma máxima por etapa la carga solo el Dueño (vacía). Sin pantallas todavía (H7). Ver informe-herencia-servidor.md.

- Rediseño de pantallas largas (15-11, solo computador, local): Recepción, Empaque, Despachos, Compras de papa e insumos, Control de gestión, Análisis de compras, Mermas, Nómina, Asistencia y Plazos y reclamos ya caben en 1366x768 sin desplazar la página. Se agrupan en pestañas dentro de la pantalla (nuevo `front/comun/compacto.js` + reglas en `compacto.css`), formularios de Recepción y Registrar merma en columnas, gráficas más bajas. Nada se quitó; el celular queda igual. Ver `informe-rediseno.md`.

- Gráficas (Mermas, Gestión, Análisis y demás pestañas «Gráficas»): ya no se encimaban las etiquetas; 2 gráficas por fila, altura según nº de barras (≥38 px por barra) y etiquetas largas con más ancho; el panel se desplaza por dentro, la página no. (app-source.html, front/comun/compacto.css)

- 2026-11-15 · Producción (servidor): la merma se calcula (sale de una etapa menos llega a la siguiente); cada diferencia se resuelve como «sigue en la etapa anterior» o «merma» con motivo de lista editable por el Dueño; cierre exige resolverlas; `GET /api/p/kpi-merma`. Migración 0016 (solo --local). Ver informe-herencia-servidor.md.

- 2026-11-15 · Producción (pantallas H7/H8): en el Turno, cuando llega menos de lo que salió aparece «Falta X kg» con «Todavía está en la etapa anterior» / «Fue merma» (motivos de la lista; «Otra» pide texto); el cierre no deja cerrar con faltantes sin explicar; nueva pestaña «Diferencias» (Aprobar/Rechazar, «Espera al Dueño»), «Motivos de merma» (Dueño), toma de papa de recepciones validadas, conteo de la carga del camión y tarjetas de merma real en Gerencia. Ventana «Opciones»: ya no se cierra ni pierde lugar con los refrescos; se cierra con clic fuera, Esc o al elegir una tarjeta (sin botón nuevo). Solo local, sin deploy.

- 2026-11-15 · Compras (nueva pantalla «Hacer una compra», local): Administración › Compras, primera opción. Se elige el proveedor (buscador) y los productos en tarjetas como «Hacer una venta» (si el proveedor tiene productos asignados se muestran esos, con opción «Todos»; si no, todos), con cantidad, precio por kilo o unidad (precio de referencia de la última compra o el histórico), total en US$ y en Bs a la tasa BCV, factura del proveedor, fecha, contado (con banco) o crédito (con plazo en días). Al confirmar queda «pedida al proveedor» (CP-00001…) y Recepción la ve como pendiente de recibir (solo lectura, sin precios). Servidor: migración 0017 (solo local), `src/compras/*`, ruta `/api/v/compras/pedidos`; valida cantidad y precio mayores que cero, proveedor y productos del catálogo, banco obligatorio de contado, plazo de crédito, factura única por proveedor; auditoría; 403 para los demás puestos. «Papa e insumos» y «Recepciones por validar» no se tocaron.
