# Bitácora de cambios — El Maná JL

Todo lo de aquí se hizo y se probó **en la computadora local** (puerto 8799). **No se ha subido a Cloudflare** (sin deploy y sin migraciones en producción). Fecha de la bitácora: 14-11-2026.

## Lo que se hizo

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

## Pendiente

- **Tasa en el módulo Compras:** muestra 1.079,00 y debería mostrar 914,02 (la tasa automática). Hay que unificarlas.
- **Pantallas «Quién debe» y «Cobros hechos»:** todavía tienen scroll; deben quedar sin scroll.
- **Plan del recorrido:** faltan las etapas R0 (comprobar que la versión local arranca bien), R1 (ficha de turno en el servidor) y K1 (indicadores con los datos que ya existen).
- **Listas propias:** falta poder renombrarlas y borrarlas.
- **Clientes «Zona Ejemplo» (ids 9 al 16):** no tienen lista asignada.
- **Decisión del Dueño:** si Administración puede crear productos o solo cargar precios y bultos.
- Portal del cliente y entrega con foto quedaron a medias de verificar (ver `handoff.md`).
- Subir todo a Cloudflare: solo con autorización expresa del Dueño.
