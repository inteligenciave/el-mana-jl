# Handoff — El Maná JL (sistema Cloudflare)

Fecha: 2026-11-14. Todo es LOCAL (`wrangler dev --local --port 8799` desde `C:\Users\Aleja\El mana\cloudflare`). **Prohibido** `wrangler deploy` y migraciones `--remote` sin autorización expresa del dueño. Sin commits salvo que lo pida.

## Reglas del dueño (CLAUDE.md global)
- Antes de cada orden nueva: entrevista con botones (mín. 4, máx. 100 preguntas, rondas de ≤4, recomendación primero marcada, lenguaje simple); al cerrar, "entendí esto: …". Seguimientos y confirmaciones quedan exentos.
- Tarea nueva con otra en curso → a un subagente (Sonnet 5.5, `model:"sonnet"`). Cambios grandes de infraestructura/planificación/reglas: preguntar antes si quiere plan con Opus 5.5.
- No inventar cifras de negocio (memoria `entrevista-sin-supuestos`); informes solo identifican, sin juzgar (`informe-solo-identificar`).
- Marca: rojo #C92121, amarillo #F2B72E, blanco, gris casi negro; verde/ámbar solo en semáforos. Sin scroll en pantallas. Buscadores con `front/comun/buscar.js`.

## Arquitectura
Worker + D1. `node build.js` genera `public/index.html` desde `app-source.html` + `front/*` + `src/*/dominio.js`. Capas dominio/repo/servicio/rutas. Rol por header `x-rol` (`dueno, ventas, cobranza, adm, custodio, rrhh`…). El artifact de Claude (demo v8) no se toca.

## Hecho y verificado (local)
- Catálogo lista/tarjetas, menú lateral ocultable, Nueva venta sin scroll (3×3 con imagen), venta a crédito o contado, cuentas por cobrar con totales por vendedor/zona, buscadores unificados, cabeceras eliminadas, menú ordenado por importancia.
- **Etapa 1 – Tasa BCV automática** (migración `0003_tasa_bcv.sql`, `src/tasa/*`, cron `0 21 * * *`): consulta diaria al BCV, respaldo a la última tasa con aviso, fin de semana = última publicada, cobro con fecha pasada = tasa de ese día, el servidor ignora la tasa que manda la pantalla, campo manual eliminado. Probado por API y navegador.

## A medias (agentes detenidos con "Pausa todo"; sin reporte final, SIN verificar)
- **Portal del cliente**: `src/cliente/*`, `front/cliente/*`, migración `0004_portal_cliente.sql`, `plan-portal-cliente.md`. Diseño: enlace/código personal revocable (token hasheado), pedidos "por confirmar" hasta que Ventas apruebe, pagos "por verificar" hasta que Cobranza confirme, ficha interna (zona, crédito, precio, vendedor), rutas `/api/c/*`.
- **Entrega con foto + temporizador**: `src/entregas/*`, `front/entregas/*`, migración `0005_entregas_temporizador.sql`. Despachos sube la foto del transporte (comprimida en navegador, base64 en D1, mostrar tamaño antes/después); días de crédito corren desde la foto; sin foto no arranca y se avisa a Despachos; tramos 7 y 21 días con porcentajes y mora que carga el dueño en Ajustes (vacíos = solo muestra días/"vencida" y avisa a Cobranza); cliente ve cuenta regresiva, descuento vigente y cuánto pagar hoy; botón "no recibí esto" pausa el temporizador hasta que Cobranza resuelva.
- **Primer paso al retomar**: revisar que lo parcial no rompa la versión local (`node build.js`, aplicar migraciones 0004/0005 con `--local`, recorrer pantallas, consola sin errores), luego reanudar esos agentes o rehacer lo faltante. Ambos tocan archivos compartidos (`worker.js`, `build.js`, menú de `app-source.html`): releer antes de editar.

## Plan de producción por zonas (`plan-produccion-zonas.md`, 8 etapas)
1 Tasa BCV ✅ · 2 Kilos y unidades por bulto en `productos` · 3 Rol Producción, turnos, movimientos por etapa, cierre de turno · 4 Tabla `zonas` · 5 Venta por bulto, bloqueo "Sin inventario", pedido pendiente en la zona · 6 Tablero de zonas con semáforo · 7 Salidas (despachar antes de 15 t, pausar, dividir) · 8 Unir pantallas viejas y pruebas de punta a punta. Ya está también: portal (etapa 9) y entrega con foto como módulos adicionales.

### Decisiones cerradas del dueño
- Zonas por tarjeta; orden: kilos → espera → dinero. 15 t = suma de kilos de TODOS los pedidos pendientes de la zona (valor fijo, ajuste solo Dueño). Semáforo = cercanía a 15 t; cortes los carga el dueño después (mientras tanto solo verde al llegar a 15 t).
- Cada producto guarda kg por bulto y unidades por bulto; facturas convierten bultos a kg; catálogo por bulto; precio por bulto por nivel (y especiales por cliente por bulto).
- Factura/nota se emite al DESPACHAR; al vender se apartan bultos; los días de crédito corren desde ahí (hoy: desde la foto de entrega).
- Sin inventario de producto terminado no se vende (producto bloqueado con aviso). Inventario inicial = conteo en bultos cargado una vez; luego solo sube con lo que Producción cierra por turno.
- Almacén en proceso (recepción, lavado, fritado, empacado): kilos que entran/salen por etapa. Cierre de turno por rol nuevo "Producción" o Dueño (jefe de producción y empaque siguen).
- Movimientos (despachar antes de 15 t con motivo, pausar, dividir): Dueño y jefe de producción. Si pasa de 15 t, el Dueño decide en cada caso.
- Tasa: BCV automática, sin campo manual.

## Pendientes del dueño
- Hora de la consulta diaria de la tasa (provisional 17:00 Venezuela) y confirmar la fuente (https://www.bcv.org.ve/, guardada en `config`).
- Porcentajes de descuento (7 y 21 días) y mora; cortes del semáforo; tolerancia del cierre de turno.
- Contador: efectos fiscales de emitir al despachar y de dividir pedidos.
- Almacenamiento: base `elmana-jl` ≈ 350 KB (0,07 % de 500 MB); plan gratis/pago no confirmado. Si hay muchas fotos, pasar a R2.

## Otros pendientes
- Aviso 409 y de fecha "30 no cumple yyyy-MM-dd" en consola sin atribuir (probablemente previos).
- Extender "sin scroll" a Cobrar, Deuda, Pagos; barras de búsqueda en Cuentas por pagar, Asistencia, Nómina, Despachos, Recepción, Producción, almacenes y Reportes de Ventas (sin respuesta del dueño aún).
- Probar Ruta B, mora, NC/ND y anulación por pantalla.
- Selector de lista de precios (3 niveles) no agregado.
- Deploy a Cloudflare: solo con autorización del dueño.

## Archivos clave
`C:\Users\Aleja\El mana\`: `plan-produccion-zonas.md`, `plan-portal-cliente.md`, `plan-ventas.md`, `acuerdos.md`, `marca.md`, `guia-entrevista-adm-compras-rrhh.md`. Transcripción previa: `C:\Users\Aleja\.claude\projects\C--Users-Aleja-El-mana\ca08ed5b-3769-4fbc-b2d5-80a60754ed88.jsonl`.
