# Handoff — El Maná JL (sistema Cloudflare)

Actualizado: 2026-11-14 (noche). **TODO PAUSADO.** Todo es LOCAL (`npx wrangler dev --local --port 8799 --test-scheduled` desde `C:\Users\Aleja\El mana\cloudflare`). **Prohibido** `wrangler deploy` y migraciones `--remote` sin autorización expresa del dueño. Commits solo si el dueño lo pide (hay cambios sin commit: ver `git status`).

## Reglas del dueño (CLAUDE.md global y memoria)
- Antes de cada orden nueva: entrevista con botones (mín. 4, máx. 100, rondas ≤4, recomendación primero, lenguaje simple); al cerrar, "entendí esto: …". Seguimientos y confirmaciones exentos.
- Tarea nueva con otra en curso → subagente Sonnet 5.5 (`model:"sonnet"`). Cambios grandes de infraestructura/planificación/reglas: preguntar antes si quiere plan con Opus 5.5.
- Usuarios NO técnicos: simple, sin jerga ni textos de ayuda. Ahorro de tokens: agrupar subagentes, verificaciones cortas. No inventar cifras; informes solo identifican.
- Marca: rojo #C92121, amarillo #F2B72E, blanco, gris casi negro. Sin scroll a 1366x768. Semáforo solo verde/ámbar.

## Arquitectura
Worker + D1. `node build.js` genera `public/index.html`, `cliente.html`, `mis-entregas.html` desde `app-source.html` + `front/*` + `src/*/dominio.js`. Capas dominio/repo/servicio/rutas en `src/*`. Rol por header `x-rol` (sin login real); portal del cliente por token (`x-token`). `src/acceso.js` define permisos por puesto para `/api/all`, `/api/batch`, `/api/c/<coleccion>`. Rutas: `/api/v/*` (ventas, bancos, tasa, portal), `/api/c/*` (portal cliente y colecciones), `/api/p/*` (producción por zonas). Migraciones 0003–0013 en `cloudflare/migrations` (0012 comprobante/llegada, 0013 producción por zonas), aplicadas SOLO en local.

## Borrador (guardado de lo que se escribe) — 15-11-2026
`front/comun/borrador.js` (primer script en index.html y cliente.html): localStorage `elmana:borr:d:<ctx>` por rol+pantalla (portal: hash del código + vista), 24 h, debounce 400 ms, MutationObserver restaura campos (solo si el campo sigue en su valor original y dentro de 20 s tras entrar a la pantalla). Borra en éxito (toast verde), cancelar/cerrar modal, cambiarRol/salir. Excluye password/file/hidden, `data-nodraft`, `data-act-change` y ids/names con pass, pin, token, cuenta, tarjeta, etc. API: `Borrador.registrar(clave,get,set)`, `.tab(ruta,i)`, `.exito()`, `.limpiar()`, `.sesion()`. Ganchos: finishBoot en app-source.html, compacto.js (pestañas), portal.js (carrito/vista). No tocado: v-pedido ya guarda su carrito aparte (V_PED_LS). Pendiente de probar: portal con sesión de cliente real; mis-entregas.html no incluye el módulo.

## Flota y choferes al despachar — 15-11-2026
Migración local 0018_flota.sql (tabla `flota` + `salidas.vehiculo_id`/`chofer_id`). Servidor: src/flota/* en /api/f/* (GET /vehiculos, /choferes; POST/PUT /vehiculos, POST /vehiculos/:id/estado). Gestionan solo dueno y adm (src/acceso.js FLOTA_GESTIONA); el resto solo lee los activos. Choferes = docs col 'empleados' activos con cargo chofer/conductor o `es_chofer` (casilla en Personal). `despachar` acepta vehiculo_id/chofer_id (o los textos viejos), rechaza vehículo no activo (409) y devuelve `avisos` (capacidad y vencimientos, sin bloqueo). Front: front/produccion/p-flota.js (dentro del bundle de Producción), pantalla 'fl-flota' en Administración › Flota. Verificado con datos UATF- (ya borrados); el despacho real se probó sobre una COPIA de la base (la salida SAL-00014 de la base viva sigue ARMANDO).

## Hecho esta sesión (todo local)
- **F1** (portal y seguridad): portal ya recibe pedidos y pagos; sin x-rol → 403 en `/api/all`, `/api/batch`, `/api/c/*`; empleados sin cédula/teléfono/tarifa salvo Dueño y RRHH. Efecto: pantalla Personal vista como Administración cuenta "por día: 24, por hora: 0".
- **F2–F5** (`informe-F2-F5.md`): banco obligatorio en servidor; documento con kg, cuenta y tasa; búsqueda con guion; cobro fecha pasada; pedido recuperable al recargar; Registro de ventas real; Quién debe refresca; validaciones (cuenta, largos, kg>0, enteros); Gerencia sin doble conteo; Entregas en menú; ajustes móviles. Sin verificar en pantalla: pago fecha pasada, refresco de Quién debe tras clic, mensaje Empaque, 1366x768 de todas las pantallas.
- **Portal: comprobante y llegada** (`informe-portal-foto.md`): cliente adjunta comprobante al reportar pago (Cobranza: «Ver comprobante»); pestaña «Entregas» con «Ya llegó mi pedido» (foto + total de bultos); primera foto (cliente o Despachos) arranca el reloj; total distinto → disputa y pausa. Fotos comprimidas a base64 (~100–300 KB c/u). Sin estado "en camino/entregado". No probado con cámara real de celular.
- **F6/F8 producción por zonas** (`informe-F6-F8.md`): inventario único `productos.stock_entero` en bultos (disponible = existencias − apartado); rol «Producción» con turnos y cierre; kilos por etapa; tablero de zonas con meta 15 t (ajuste solo Dueño), semáforo (verde al llegar; ámbar solo si el Dueño carga corte); despachar antes de meta con motivo, pausar zona, dividir pedido; vender crea PEDIDO que aparta bultos, la nota/factura nace al DESPACHAR; sin inventario no se vende. Etapa 8 (unir pantallas viejas Empaque/Despachos) NO hecha: conviven y las viejas no descuentan del inventario único. Pedido del portal → aprobación por Ventas no probado tras el cambio (vender ahora devuelve número de pedido).
- Decisiones por defecto usadas: Gerencia cuenta nota facturada una vez; tasa se muestra con "Rige para…"; datos de prueba UATA-/UATB-/UATF1- se dejan.

## Pendiente (tras F9; detalle en `informe-F9.md`)
1. Dueño decide los 2 duplicados de clientes (CL-001↔cliente 12, CL-003↔cliente 11) y los 12 clientes viejos sin estado ni vendedor.
2. Probar HEIC real y cámara de celular real (fallo de fotos: se corrigió y probó con archivos simulados; confirmar con el dueño en su aparato).
3. Revisar «Estados y listas» en pantalla; recepción con kg −5.
4. Heredados: hora del cron y fuente BCV; descuentos/mora/semáforo en Ajustes; efectos fiscales; R2 si crecen las fotos; Pantalla Personal para Administración; deploy solo con autorización.
5. Datos de prueba UATA-/UATB-/UATF1- siguen en la base local; `respaldo-pre-uat/` es la copia previa.

## Compactar (15-11, local)
- Orden del dueño: compactar todas las pantallas. Hecho con `cloudflare/front/comun/compacto.css` (solo >=1024 px, al final de la hoja; ajustar medidas ahí) + final de `front/cliente/portal.css`. Ventas/cobranza/precios/bancos/entregas/zonas caben en 1366x768; siguen largas recepción, mermas, gerencia, compras, análisis, nómina. Portal del cliente sin medir con sesión. Ver `informe-compactar.md`. Sin commit ni deploy.

## Archivos clave (`C:\Users\Aleja\El mana\`)
`plan-produccion-zonas.md`, `plan-portal-cliente.md`, `plan-correcciones-uat.md`, `informe-uat-A.md`, `informe-uat-B.md`, `informe-F2-F5.md`, `informe-portal-foto.md`, `informe-F6-F8.md`, `plan-recorrido.md`, `CAMBIOS.md`, `README.md`, `respaldo-pre-uat/`, `wrangler-dev.log`. Transcripción: `C:\Users\Aleja\.claude\projects\C--Users-Aleja-El-mana\ca08ed5b-3769-4fbc-b2d5-80a60754ed88.jsonl`.

## Estado herencia (2026-11-15)
H0 a H5 listas en el servidor y probadas por curl (informe-herencia-servidor.md); migración 0015 solo local; respaldo en respaldo-pre-herencia/. Falta: H6 (pedir/recibir, depende de R4), H7 pantallas, H8 KPIs. Datos de prueba UATH-/PED-000016/SAL-00011-12 quedan marcados.

## Rediseño de pantallas largas (15-11, local, front)
- `front/comun/compacto.js` (inyectado al final por `build.js`; gancho `cpCompactar` en `renderMain` de `app-source.html`) reparte en pestañas, solo >=1024 px, las pantallas de su tabla CFG (recepcion, empaque, despachos, compras-mp, gestion, analisis, mermas, nomina, asistencia). El panel activo se desplaza por dentro si sobra; la página mide 768. Reglas en `compacto.css`. Formularios en columnas con `cp-c3`/`cp-c2` (Recepción, Registrar merma). Detalle y pendientes en `informe-rediseno.md`.

## Merma calculada (servidor listo, falta pantalla H7)
Migración 0016 aplicada solo local. Endpoints y cuerpos en informe-herencia-servidor.md (sección «Corrección del Dueño»). Pantallas deben enviar `faltante/id_motivo/texto` al anotar llegadas, cerrar turno y cargar camión. Turno 5 quedó cerrado; el abierto es el 8.

## Pantallas de la herencia (H7/H8) y ventana Opciones (2026-11-15)
Hecho en front (solo local, `node build.js` aplicado): front/produccion/p-herencia.js (nuevo, entra al mismo bloque de p-prod.js), p-prod.js, produccion.css, pantallas.js (pestañas Diferencias y Motivos de merma, tarjetas KPI en Gerencia, arreglo de Opciones). Informe: informe-herencia-pantallas.md. Falta: probar «Contar la carga» con una salida armada real, y caso «anotó el Jefe → Espera al Dueño» (solo probado por código). H6 sigue pendiente.

- 2026-11-15 · PDF real de nota/factura: `front/comun/pdf.js` (generador propio, sin librerías; `ElManaPDF.descargar(datos, logo)`), datos del servidor en `GET /api/v/pdf/pedido/:id` y `/pdf/documento/:id` (+ `/pedidos-recientes`) y, para el cliente, `GET /api/c/portal/documentos/:id/pdf` y `/pedidos-venta/:id/pdf` (solo suyos; ajeno 404). Al vender = PDF del pedido PED- rotulado «Pedido / Nota…»; al despachar = NE-/FA-. Botones en ventana de venta, Registro de ventas, modal de documento y portal. Prueba UATD- (PED-000018) anulada; enlaces de prueba revocados.

## Hacer una compra (2026-11-15, local)
Pantalla `c-pedido` (front/compras/c-pedido.js + compras.css, enganchada en build.js dentro del bloque PRE y primera opción de Compras en pantallas.js). Servidor: migración 0017 (tablas `compras_pedidos`, `compras_pedido_lineas`), `src/compras/{dominio,repo,servicio,rutas}.js`, ruta `/api/v/compras/pedidos` (GET lista; POST crea; solo Dueño y Administración; Recepción y Jefe de producción listan lo PEDIDA sin precios). Estado PEDIDA; falta el paso siguiente: que Recepción abra la recepción desde el pedido y lo marque RECIBIDA (H6 / R4). No se enlaza aún con `solicitudes_compra` ni con Cuentas por pagar. Catálogo = productos papa/insumo; proveedor↔producto por `provSug`; los empaques (bolsas) no están en el catálogo de productos, hay que cargarlos para comprarlos aquí. Datos de prueba UATC- ya borrados.
