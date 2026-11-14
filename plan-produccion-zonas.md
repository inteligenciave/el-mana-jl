# Plan: Producción por zonas, venta por bulto, inventario por turno y tasa BCV automática

Para: el Dueño. Hecho por: Planificador. Fecha: 14-11-2026.
Alcance: solo copia local (`wrangler dev --local`, puerto 8799). **No se despliega nada a Cloudflare** sin tu autorización.
Este documento es un plan: no se ha cambiado ningún archivo del sistema.

---

## 0. Cómo está hoy (lo que leí en el código)

Esto es lo que encontré. Sirve para entender qué cambia.

1. **Vender hoy = despachar.** En «Nueva venta» (`front/ventas/v-pedido.js`) el vendedor elige cliente y productos y aprieta «Generar nota de entrega» o «Generar factura». En ese momento el sistema crea el documento y **resta las existencias** (`src/ventas/servicio.js`, función `crearVenta`). No existe un «pedido pendiente que espera producción».
2. **Se vende por unidad (bolsa), no por bulto.** Las cantidades y las existencias (`productos.stock_entero`) están en unidades. No hay kilos por bulto en ningún lado.
3. **Hay dos inventarios de producto terminado que no se hablan:**
   - el del módulo de Ventas (base D1, tabla `productos`, columna `stock_entero`), que sube con el botón «Entrada de inventario»;
   - el de las pantallas viejas de Producción (`app-source.html`: «Producto terminado», «Empaque»), que vive en otra parte de la base (colecciones `productos` tipo «pres» y `movimientos`) y en parte son datos de ejemplo fijos.
4. **La zona del cliente es texto libre** (`clientes.zona`). «Zona A», «zona a» y «ZONA A » hoy serían tres zonas distintas.
5. **Almacén en proceso** (pantalla vieja) muestra lotes por etapas fijas («Lavado y pelado», «Corte», «Freído», «Enfriado y reposo») que el propio código marca como «supuestas». No registra kilos que entran y salen por etapa ni cierres de turno.
6. **Despachos** (pantalla vieja) son notas con vehículo y chofer guardadas aparte; no están unidas a las notas de entrega del módulo de Ventas.
7. **La tasa la escribe una persona:** en la cabecera (todos los montos en Bs), en «Cobrar y liquidar» (campo «Tasa del día») y en «Nueva venta» cuando el cliente pagó ahora (usa la de la cabecera). El servidor acepta la tasa que le manda la pantalla.
8. **No existe el rol «Producción».** Existen «Jefe de producción» (`jefeprod`) y «Empaque y despacho» (`empaque`).
9. No hay pruebas automáticas en el proyecto (no hay `package.json` ni carpeta de pruebas). Las pruebas de este plan son guiones a mano o con `curl` contra el puerto 8799.

---

## 1. Lo que pediste (decisiones ya cerradas)

- Producción ve los pedidos **agrupados por zona**, en tarjetas. Cada tarjeta: espera del pedido más antiguo, cantidad de pedidos, monto en dinero y **kilos acumulados**.
- Orden de las tarjetas: **kilos primero**; si empatan, **la que más espera**; si siguen empatadas, **la de más dinero**.
- La tarjeta abre una pantalla con todos los pedidos de los clientes de esa zona (datos del pedido, cantidades, presentaciones).
- **Regla de 15 toneladas:** se suman los kilos de **todos** los pedidos pendientes de la zona. La primera zona que llega a 15 t sale primero.
- **Semáforo:** verde = llegó a 15 t; ámbar = cerca; rojo = lejos o esperando mucho. Los cortes de ámbar y rojo los defines tú (se guardan como ajustes; el sistema no inventa números).
- **Movimientos por zona:** despachar aunque no llegue a 15 t (con motivo), postergar o pausar una zona, dividir un pedido en dos salidas. Si una zona pasa de 15 t, **tú decides en cada caso** qué pedidos entran.
- Cada producto/presentación guarda **kg por bulto y unidades por bulto**, cargados una vez. Todos los pedidos y facturas convierten bultos a kilos. El catálogo de venta pasa a ser **por bulto**.
- **Sin inventario de producto terminado no se vende:** el producto se ve bloqueado con el aviso «Sin inventario» y los bultos disponibles.
- El inventario de producto terminado **sube solo** con lo que Producción sube al cerrar el turno.
- **Almacén de producto en proceso** con etapas recepción, lavado, fritado y empacado, registrado como kilos que entran y salen de cada etapa.
- El cierre de turno lo hace un rol nuevo **«Producción»** o el Dueño. Al cerrar se compara lo declarado con lo registrado y lo empacado se suma al terminado.
- **Tasa BCV automática:** se consulta una vez al día; si falla, se usa la última guardada y se avisa. Se quita el campo manual de tasa en cobros y ventas para todos los roles.

---

## 2. Orden de las etapas (de la más chica e independiente a la más grande)

| Etapa | Qué entrega | Depende de |
|---|---|---|
| 1 | Tasa BCV automática | nada |
| 2 | Kilos y unidades por bulto en el catálogo | nada |
| 3 | Rol «Producción», almacén en proceso y cierre de turno (inventario terminado en bultos) | 2 |
| 4 | Zonas como lista oficial (no texto libre) | nada |
| 5 | Venta por bulto, con bloqueo «Sin inventario» y pedidos que quedan pendientes de despacho | 2, 3, 4 |
| 6 | Tablero de Producción por zonas (solo ver) | 5 |
| 7 | Movimientos por zona: armar salida, despachar, despachar sin llegar, pausar, dividir pedido | 6 |
| 8 | Unir las pantallas viejas (Despachos, Empaque, Producto terminado, En proceso) y limpieza | 3, 7 |

Cada etapa se termina, se prueba (QA) y se te muestra antes de empezar la siguiente. Las etapas 1, 2 y 4 se pueden hacer en paralelo.

Regla de arquitectura en todas las etapas (la misma de Ventas): `migrations/*.sql` (datos) → `dominio.js` (reglas puras, sin base ni pantalla) → `repo.js` (único que toca la base) → `servicio.js` (casos de uso) → `rutas.js` (HTTP y permisos). Las pantallas solo hablan con la API, nunca con la base. Colores de marca rojo `#C92121` y amarillo `#F2B72E`. Pantallas sin scroll (se pagina, como ya hace el catálogo de «Nueva venta»). Todo buscador usa `front/comun/buscar.js`.

---

## Etapa 1 · Tasa BCV automática

**Qué cambia para la gente:** nadie vuelve a escribir la tasa. Se ve «Tasa BCV de hoy: … (fecha)». Si la consulta de hoy falló, se ve un aviso amarillo: «Usando la última tasa guardada, del día …».

**Datos (migración `0003_tasa_bcv.sql`):**
- Tabla nueva `tasas_bcv`: fecha (una fila por día), valor, fuente, momento en que se obtuvo, y si fue automática o de respaldo.
- En `config`: la dirección de la fuente y el estado de la última consulta (vacíos hasta que tú confirmes la fuente).

**Archivos a tocar:**
- Nuevo `src/tasa/dominio.js` (leer y validar el número que publica la fuente; elegir la tasa vigente para una fecha), `src/tasa/repo.js`, `src/tasa/servicio.js` (consultar una vez al día, guardar, respaldo).
- `src/worker.js`: agregar la tarea diaria programada (`scheduled`) y la ruta `GET /api/v/tasa`. Además, como respaldo, la primera petición del día dispara la consulta si la tarea programada no corrió (útil en local).
- `wrangler.toml`: agregar el horario diario (`[triggers] crons`). En local se prueba con `wrangler dev --local --test-scheduled`. **No se despliega.**
- `src/ventas/servicio.js`: `cobrar` y `vender` **ignoran la tasa que mande la pantalla** y usan la tasa BCV vigente para la fecha del pago. Si no hay ninguna tasa guardada, el cobro se bloquea con un mensaje claro.
- `front/ventas/v-cobro.js`: quitar el campo «Tasa del día»; mostrar la tasa BCV y su fecha. `front/ventas/v-registro.js`: quitar las validaciones de tasa escrita.
- `front/ventas/v-pedido.js`: «Pagó ahora» ya no envía tasa; el «≈ Bs» usa la tasa BCV.
- `front/ventas/v-docs.js`: el recibo dice «Tasa BCV» en vez de «Tasa escrita».
- `app-source.html`: la casilla de tasa de la cabecera pasa a ser solo lectura (muestra la tasa BCV); se quita `setTasa` / `saveTasa`; `S.tasa` se llena desde `/api/v/tasa`. Esto afecta también a Préstamos, Nómina, Control de gestión y exportaciones, que usan `S.tasa` (pasan a usar la BCV sin más cambios).
- `front/ventas/v-importar.js`: **no cambia**. El Excel histórico trae su propia tasa por pago y se respeta.

**Pruebas (QA):**
1. Con la fuente disponible: se guarda la tasa del día una sola vez aunque se llame varias veces.
2. Con la fuente caída (simulada): se usa la última guardada, aparece el aviso y queda registrado el fallo.
3. Sin ninguna tasa guardada: el cobro se bloquea con mensaje; no se guarda un pago con tasa vacía.
4. Mandar a mano una tasa distinta en `POST /api/v/cobros`: el servidor la ignora y usa la BCV.
5. Cobro con fecha anterior a hoy (con PIN): usa la tasa de esa fecha (ver pregunta P-T2).
6. Ningún rol ve un campo para escribir la tasa (Dueño, Administración, Cobranza, Ventas).
7. La importación del Excel sigue guardando la tasa de cada fila.

**Riesgos:** la página del BCV puede cambiar de formato o no responder; por eso la lectura va en una sola función del dominio, con respaldo y aviso. Los fines de semana y feriados el BCV no publica: hay que decidir qué tasa rige (P-T1).

---

## Etapa 2 · Kilos y unidades por bulto en el catálogo

**Qué cambia para la gente:** en «Clientes, catálogo y ajustes → Productos», el Dueño carga una vez, por presentación, **kg por bulto** y **unidades por bulto**. Un producto sin esos datos se marca «Falta kg por bulto» y (desde la Etapa 5) no se puede vender.

**Datos (migración `0004_bultos.sql`):**
- `productos`: columnas nuevas `kg_por_bulto` y `unidades_por_bulto` (vacías al inicio; **no se rellenan con números inventados**).
- `documento_lineas`: columnas nuevas `unidad` (las líneas viejas quedan como «UNIDAD»; las nuevas serán «BULTO»), `kg_por_bulto` (congelado al vender, como ya se congelan los precios) y `kg_linea`.
- Las facturas y notas viejas quedan como están (sin kilos), porque se hicieron por unidad.

**Archivos a tocar:** `src/ventas/dominio.js` (función que convierte bultos a kilos), `src/ventas/repo.js` y `servicio.js` (`guardarProducto` acepta y valida los dos campos, solo números mayores que cero; queda en auditoría quién los cambió), `front/ventas/v-admin.js` (dos campos en el formulario de producto y columna en la lista).

**Pruebas (QA):** guardar, editar y dejar vacío; rechazar cero, negativos y texto; solo el Dueño puede cambiarlos; el cambio aparece en auditoría; una venta vieja no cambia sus números.

**Riesgo:** si se cambia el kg por bulto de un producto, los pedidos ya hechos **no** se recalculan (por eso se congela en la línea).

---

## Etapa 3 · Rol «Producción», almacén en proceso y cierre de turno

**Qué cambia para la gente:**
- Aparece el rol **«Producción»**.
- Pantalla nueva **«Turno»**: se abre el turno, se registran los kilos que **entran** y **salen** de cada etapa (recepción, lavado, fritado, empacado) y, en empacado, los **bultos por presentación**.
- **Cerrar turno** (rol Producción o Dueño): la persona declara lo que contó/pesó; el sistema lo pone al lado de lo registrado durante el turno y muestra la diferencia por etapa. Al confirmar, **los bultos empacados se suman al producto terminado**. Es la única vía normal por la que sube el terminado.
- Se quita (o se restringe, ver P-I2) el botón «Entrada de inventario» de Ventas.

**Datos (migración `0005_produccion.sql`):**
- `etapas_proceso`: las cuatro etapas que nombraste, con su orden (editables por el Dueño si lo decides, P-P1).
- `turnos`: fecha, estado (abierto / cerrado), quién abrió, quién cerró, observaciones.
- `movimientos_proceso`: turno, etapa, entra o sale, kilos, nota, rol, momento.
- `cierre_turno`: por etapa, kilos declarados frente a kilos registrados y la diferencia; por presentación, bultos empacados declarados.
- `productos`: columna nueva `stock_bultos` (entera, nunca negativa). La existencia en unidades (`stock_entero`) queda como historia (ver P-I1 sobre el punto de partida).
- `movimientos_inventario`: se reutiliza con un tipo nuevo «ENTRADA_CIERRE_TURNO» y la unidad.
- `config`: tolerancia de diferencia en el cierre (vacía hasta que la definas).

**Archivos a tocar:**
- Nuevo módulo `src/produccion/` (`dominio.js`, `repo.js`, `servicio.js`, `rutas.js`, `permisos.js`) con rutas bajo `/api/p/*`; `src/worker.js` solo delega.
- `src/ventas/permisos.js`: agregar `produccion: 'Producción'` a `ROL_TXT` (el servidor rechaza roles que no conoce).
- `app-source.html`: agregar el rol en `ROLES`, `ROLE_DESC`, `MODS_DEF` (módulo Producción) y sus permisos en `PERM_DEF`.
- Nuevo `front/produccion/p-turno.js` (+ `p-core.js`, `p-registro.js`, `produccion.css`); `build.js` los agrega a la página igual que hace con Ventas.
- `src/ventas/servicio.js` y `rutas.js`: `entradaStock` se quita o queda solo para el Dueño con motivo (P-I2).

**Pruebas (QA):**
1. Producción abre turno, registra entradas y salidas por etapa y cierra; el terminado sube exactamente los bultos empacados declarados.
2. Un rol sin permiso (Ventas, Cobranza) no puede abrir ni cerrar turno, ni por pantalla ni llamando la API.
3. No se puede cerrar dos veces el mismo turno; no se puede registrar en un turno cerrado.
4. La diferencia declarado − registrado se muestra por etapa; con tolerancia vacía solo se muestra, no bloquea.
5. Kilos negativos, vacíos o texto se rechazan.
6. Todo queda en auditoría (quién, cuándo, qué cifras).
7. «Entrada de inventario» ya no está disponible para quien no corresponde.

**Riesgos:** dos fuentes de inventario conviviendo hasta la Etapa 8; varias personas registrando a la vez en el mismo turno (se guarda en lote, como ya hace Ventas).

---

## Etapa 4 · Zonas como lista oficial

**Qué cambia para la gente:** la zona del cliente se elige de una lista, no se escribe. El Dueño administra la lista (crear, renombrar, desactivar).

**Datos (migración `0006_zonas.sql`):**
- Tabla `zonas` (nombre, activa).
- `clientes`: columna nueva `id_zona`. La columna de texto `zona` se conserva como historia.
- **Paso de los textos actuales a la lista:** el sistema **sugiere** grupos de nombres parecidos (reutiliza la función `sugerirGrupos` que ya existe para clientes repetidos) y **tú confirmas** cada grupo. Nada se une solo. Los clientes sin zona quedan como «Sin zona».

**Archivos a tocar:** `src/ventas/` (repo, servicio, rutas: lista de zonas y asignación), `front/ventas/v-admin.js` (selector de zona en el cliente y pestaña «Zonas»), `front/ventas/v-listas.js` («Quién debe» ya agrupa por zona: pasa a usar la lista).

**Pruebas (QA):** sugerencia de grupos con nombres parecidos; nada se une sin confirmar; cliente nuevo exige zona (o queda «Sin zona», según P-Z1); renombrar una zona no cambia a qué zona pertenece cada cliente; el reporte de deuda por zona sigue cuadrando con el total.

---

## Etapa 5 · Venta por bulto, bloqueo «Sin inventario» y pedido pendiente de despacho

**Qué cambia para la gente (Nueva venta):**
- Las cantidades son **bultos**. Cada tarjeta muestra: precio por bulto, kg por bulto y **bultos disponibles**.
- Producto sin inventario: tarjeta bloqueada con **«Sin inventario»** y «0 bultos disponibles». No se puede agregar.
- El pedido muestra los **kilos** de cada línea y el **total en kilos**.
- Orden del catálogo «con prioridad por kilos» (cómo exactamente: P-V3).
- Al generar, el pedido **queda pendiente de despacho en la zona del cliente** y aparece en el tablero de Producción (Etapa 6).

**Decisión de fondo (P-V1, la más importante del plan):** cuándo nace el documento y cuándo baja el inventario. Opciones:
- **Opción A (recomendada):** al vender se crea un **pedido** que **aparta** los bultos (el disponible baja, el físico no) y compromete el crédito. La **nota de entrega o factura se emite al despachar**, solo por lo que sale en esa salida, y ahí baja el inventario físico. Ventaja: dividir un pedido en dos salidas da dos documentos limpios, los días de crédito cuentan desde la entrega y no hay factura de mercancía que no salió. Costo: cambia el flujo actual de «Generar nota/factura» y el «Pagó ahora» (se vuelve un anticipo que se aplica al despachar).
- **Opción B:** se sigue emitiendo la nota/factura al vender, como hoy, y el inventario baja al vender. El despacho solo marca «salió». Ventaja: menos cambio. Costo: los días de crédito y pronto pago corren mientras la mercancía espera las 15 t; dividir un pedido no divide el documento ya emitido (consultar al contador).

**Datos (migración `0007_pedidos.sql`, según la opción elegida):**
- Opción A: tablas `pedidos` y `pedido_lineas` (cliente, zona congelada al vender, fecha, estado: pendiente / en salida / despachado / anulado; líneas con bultos, kg y precios congelados; bultos ya despachados).
- Opción B: columnas nuevas en `documentos_venta` (`estado_despacho`, `id_zona`, `fecha_despacho`) y en `documento_lineas` (`bultos_despachados`). No se toca la regla de estados que ya existe (SQLite no permite cambiarla sin rehacer la tabla).
- Disponible para vender = bultos físicos − bultos apartados en pedidos pendientes.

**Archivos a tocar:** `src/ventas/dominio.js` (validar pedido por bultos, disponible, kilos), `servicio.js` (`crearVenta`/`vender`), `repo.js`, `rutas.js`; `front/ventas/v-pedido.js` (tarjetas, líneas, totales en kg, bloqueo), `v-docs.js` (los documentos muestran bultos y kilos), `v-registro.js` (buscador del catálogo).

**Pruebas (QA):**
1. Producto sin kg por bulto o sin inventario: bloqueado en pantalla **y** rechazado por el servidor si se llama la API directo.
2. Dos vendedores piden el último bulto al mismo tiempo: solo uno lo logra.
3. Kilos del pedido = suma de bultos × kg por bulto de cada línea.
4. El pedido aparece pendiente en la zona correcta del cliente.
5. Límite de crédito, precios por cliente, descuento e IVA siguen funcionando igual que hoy (repetir las pruebas del plan de Ventas).
6. Los documentos viejos (por unidad) se siguen viendo y cobrando igual.

**Riesgo:** es el cambio que más toca lo que ya funciona (venta y cobro). Por eso va después de tener catálogo, inventario y zonas listos, y se prueba completo antes de seguir.

---

## Etapa 6 · Tablero de Producción por zonas (solo ver)

**Qué cambia para la gente:** pantalla nueva **«Pedidos por zona»** (rol Producción, Jefe de producción, Dueño).
- Una **tarjeta por zona** con: kilos acumulados y cuánto falta para 15 t, espera del pedido más antiguo (días), cantidad de pedidos, monto en dinero y el **semáforo**.
- Orden: kilos (más primero) → espera (más antigua primero) → dinero (más primero).
- Al tocar la tarjeta se abre **la zona**: cada pedido con cliente, número, fecha, días esperando, y sus líneas (presentación, bultos, kg, monto). Paginado, sin scroll.

**Reglas (en `src/produccion/dominio.js`, sin números inventados):**
- Meta de salida: 15 t (dato tuyo), guardada como ajuste para poder cambiarla.
- Verde: kilos ≥ meta. Ámbar y rojo: según los cortes que definas (P-Z2). **Mientras los cortes estén vacíos**, la tarjeta solo dice «llegó» o «no llegó» y muestra los kilos, sin color ámbar o rojo.
- Pedidos de zonas pausadas se muestran aparte (Etapa 7).

**Archivos a tocar:** `src/produccion/` (función que arma y ordena las tarjetas; consulta de pedidos pendientes por zona), ruta `GET /api/p/zonas` y `GET /api/p/zonas/:id`; nuevo `front/produccion/p-zonas.js`.

**Pruebas (QA):** con datos de ejemplo de varias zonas, verificar a mano los kilos, el orden y los desempates; una zona que llega justo a 15 t sale verde; cortes vacíos no pintan ámbar ni rojo; cambiar un corte cambia el color sin tocar código; Ventas y Cobranza no ven la pantalla; la pantalla cabe sin scroll en computadora y en teléfono.

---

## Etapa 7 · Movimientos por zona

**Qué cambia para la gente (dentro de la pantalla de la zona):**
- **Armar salida:** se eligen los pedidos (o parte de ellos) que salen. Si la zona pasa de 15 t, **el Dueño elige** qué entra; el sistema muestra cuántos kilos lleva la salida.
- **Despachar sin llegar a 15 t:** pide **motivo** obligatorio y queda en auditoría.
- **Postergar o pausar zona:** con motivo (y fecha de regreso si la decides, P-M2). La zona pausada no compite en el orden.
- **Dividir un pedido en dos salidas:** se indica cuántos bultos de cada línea salen ahora; el resto queda pendiente en la zona con su antigüedad original.
- **Despachar:** baja el inventario físico, emite el documento si se eligió la Opción A, marca los pedidos como despachados y registra vehículo y chofer de la flota que ya existe.

**Datos (migración `0008_salidas.sql`):** tablas `salidas` (zona, estado: armando / despachada / anulada, kilos, motivo si no llegó a la meta, vehículo, chofer, quién y cuándo), `salida_lineas` (qué bultos de qué línea de pedido van), `zona_pausas` (zona, motivo, desde, hasta, quién).

**Archivos a tocar:** `src/produccion/` (servicio de salidas con validaciones: no despachar más bultos de los pedidos ni de los que hay), rutas `/api/p/salidas/*`, `/api/p/zonas/:id/pausa`; `front/produccion/p-zonas.js` y `p-salida.js`.

**Pruebas (QA):**
1. Salida con zona en 15 t o más: entra solo lo que el Dueño marcó.
2. Salida con menos de 15 t sin motivo: rechazada; con motivo: pasa y queda en auditoría.
3. Dividir: 1ª salida con parte de los bultos; el resto sigue pendiente con la fecha original; la suma de ambas salidas = el pedido.
4. Pausar: la zona sale del orden y vuelve al reanudar.
5. Despachar dos veces la misma salida, o con más bultos que los apartados: rechazado.
6. Inventario físico después de despachar = antes − bultos despachados.
7. Solo los roles autorizados (P-M1) ven y usan cada botón; el servidor también lo comprueba.

---

## Etapa 8 · Unir las pantallas viejas y limpieza

| Pantalla | Hoy | Después |
|---|---|---|
| **Despachos** | Notas con vehículo y chofer, aparte de Ventas | Lista las **salidas** de la Etapa 7 (zona, kilos, pedidos, documento, vehículo, estado). Las notas viejas quedan como historia de solo lectura. |
| **Empaque** | Tabla de ejemplo y reposiciones | El registro de empaque pasa a ser la etapa «empacado» del turno (bultos por presentación). Las reposiciones se mantienen si las sigues usando (P-P3). |
| **Producto terminado** | Existencias de otra parte de la base, con datos de ejemplo | Muestra el inventario único en **bultos y kilos** por presentación: físico, apartado y disponible. |
| **Almacén en proceso** | Lotes por etapas «supuestas» | Kilos que entran y salen por etapa en el turno abierto y en los últimos turnos. |
| **Nueva venta (v-pedido)** | Por unidad, tasa de la cabecera | Por bulto, kilos, bloqueo «Sin inventario», tasa BCV (Etapas 1 y 5). |
| **Cobrar (v-cobro)** | Tasa escrita a mano | Tasa BCV automática, sin campo (Etapa 1). |

**Archivos a tocar:** `app-source.html` (`scrDespachos`, `scrEmpaque`, `scrAlmPT`, `scrAlmProceso` leen de la API nueva; los atajos de «Mapa» y «Resumen de planta» apuntan a las pantallas nuevas), `build.js`.

**Pruebas (QA):** recorrido completo de punta a punta en local: abrir turno → registrar etapas → cerrar turno → vender por bulto → ver la zona subir → armar y despachar salida → cobrar con tasa BCV. Revisar cada rol (qué ve y qué no). Revisar teléfono (375 px) y computadora sin scroll. Revisar colores de marca.

---

## 3. Riesgos generales

1. **Cambio del flujo de venta (Etapa 5):** es lo que más puede romper lo que hoy funciona. Se hace después de tener todo lo demás y se repiten las pruebas del plan de Ventas.
2. **Inventario de partida:** al pasar de unidades a bultos y a «solo sube por cierre de turno», hay que decidir con qué existencias se arranca (P-I1). Si no, el sistema empezaría en cero y nadie podría vender.
3. **Dos catálogos de productos** (Ventas y las pantallas viejas de Producción) hasta la Etapa 8. Hay que definir cuál manda: la propuesta es que mande el de Ventas (base D1).
4. **Fuente de la tasa BCV:** puede cambiar de formato o caerse. Hay respaldo y aviso, pero si falla muchos días seguidos la tasa queda vieja.
5. **Zonas de texto libre:** si los nombres actuales están muy mezclados, la limpieza toma tiempo tuyo para confirmar grupos.
6. **Sin inicio de sesión real:** el rol se declara en la pantalla (limitación que ya existe). Sirve para ordenar y dejar auditoría, no para frenar a alguien con mala intención.
7. **Fiscal:** emitir el documento al despachar o al vender, y dividir pedidos, puede tener efectos fiscales. **Por confirmar con el contador.**
8. **Migraciones de base:** SQLite no permite cambiar reglas de columnas existentes; por eso se agregan columnas y tablas nuevas en vez de modificar las viejas. Cada migración se prueba primero sobre una copia local.

---

## 4. Preguntas abiertas para el Dueño

Están agrupadas por etapa. Donde hay recomendación, va primero. **No se pone ninguna cifra por ti:** donde haga falta un número, la respuesta es tuya.

**Tasa BCV (Etapa 1)**
- **P-T1.** Fines de semana y feriados (el BCV no publica): ¿se usa la última tasa publicada? (recomendado) ¿u otra regla?
- **P-T2.** Un cobro con fecha pasada (con PIN): ¿se usa la tasa BCV de **esa fecha**? (recomendado) ¿o la de hoy?
- **P-T3.** ¿La consulta sale de la página oficial del BCV? (recomendado) ¿o tienes otra fuente de confianza?
- **P-T4.** ¿La tasa de la cabecera (préstamos, nómina, tablero) también pasa a ser la BCV automática y deja de editarse? (recomendado) ¿o solo cobros y ventas?
- **P-T5.** ¿A qué hora del día se consulta? (el BCV publica en la tarde la tasa del día hábil siguiente).

**Catálogo y venta (Etapas 2 y 5)**
- **P-V1.** ¿Cuándo se emite la nota de entrega o factura y cuándo baja el inventario: al despachar (Opción A, recomendada) o al vender (Opción B)?
- **P-V2.** ¿El precio por bulto se carga aparte por el Dueño (recomendado) o se calcula como precio por unidad × unidades por bulto? (Hoy los precios, también los especiales por cliente, están por unidad.)
- **P-V3.** «Prioridad por kilos» en el catálogo, ¿qué quiere decir? a) los productos de bulto más pesado aparecen primero; b) se ordenan por los que más kilos se venden; c) otra cosa.
- **P-V4.** ¿Se permite vender bultos sueltos por unidad (detal) en algún caso, o nunca más? (pediste por bulto; confirmo que el detal desaparece del todo).
- **P-V5.** «Pagó ahora» (contado): con la Opción A el pago entra como anticipo y se aplica al despachar. ¿Te sirve así?

**Inventario y producción (Etapa 3)**
- **P-I1.** ¿Con qué existencias de producto terminado se arranca? a) un conteo físico inicial que carga el Dueño una sola vez, en bultos (recomendado); b) convertir lo que hay hoy en unidades a bultos; c) empezar en cero.
- **P-I2.** «Entrada de inventario» manual: ¿se quita del todo, o queda solo para el Dueño con motivo (por ejemplo, devoluciones o ajustes de conteo)?
- **P-P1.** ¿Las etapas son exactamente recepción, lavado, fritado y empacado, o falta alguna (por ejemplo corte, sazonado, salsas)? ¿El Dueño puede editarlas después?
- **P-P2.** Al cerrar el turno, si lo declarado no coincide con lo registrado: ¿solo se muestra la diferencia (recomendado al inicio), se pide motivo, o se bloquea hasta que apruebe el Dueño? ¿Cuál es la tolerancia? (cifra tuya)
- **P-P3.** El rol «Producción», ¿es nuevo y separado de «Jefe de producción» y «Empaque y despacho», o reemplaza a alguno? ¿Qué más puede ver o hacer?
- **P-P4.** ¿Puede haber más de un turno abierto a la vez (por ejemplo, papas y salsas)? ¿Las salsas entran en este mismo esquema?
- **P-P5.** ¿Las reposiciones de empaque (pedir y aprobar) se siguen usando?

**Zonas y semáforo (Etapas 4 y 6)**
- **P-Z1.** Cliente sin zona: ¿se obliga a elegir zona para poder venderle (recomendado) o va a una tarjeta «Sin zona»?
- **P-Z2.** Cortes del semáforo (cifras tuyas): ¿ámbar desde cuántos kilos (o qué porcentaje de las 15 t)? ¿Rojo cuando tenga menos de cuántos kilos? ¿Y rojo también cuando el pedido más antiguo pase de cuántos días?
- **P-Z3.** Si un cliente cambia de zona con pedidos pendientes, ¿los pedidos se quedan en la zona donde se tomaron (recomendado) o se mudan con él?
- **P-Z4.** El «monto en dinero» de la tarjeta, ¿es el total con IVA (recomendado, es lo que dice el pedido) o sin IVA?

**Movimientos por zona (Etapa 7)**
- **P-M1.** ¿Quién puede despachar sin llegar a 15 t, pausar una zona y dividir un pedido: solo el Dueño (recomendado), o también Producción con motivo?
- **P-M2.** Pausar una zona, ¿hasta una fecha o hasta que alguien la reanude?
- **P-M3.** Las 15 t, ¿son la capacidad de un vehículo? ¿Cambia según el vehículo (camión 1, camión 2, autobús)? Si sí, ¿cuánto carga cada uno? (cifras tuyas)
- **P-M4.** Una salida, ¿lleva siempre una sola zona, o puede juntar zonas cercanas?

**Al contador (no son decisiones tuyas, pero frenan la Etapa 5 y 7):** emitir la factura al despachar y dividir un pedido en dos documentos; mostrar bultos y kilos en la factura fiscal.

---

## 5. Próximo paso

Cuando respondas las preguntas de la Etapa 1 (P-T1 a P-T5), se puede empezar por la tasa BCV, que no depende de nada más. Las Etapas 2 y 4 pueden ir en paralelo. La Etapa 5 no arranca sin tu respuesta a **P-V1**.

---
## Decisiones del dueño (cierre del plan)
- Factura/nota: se emite al DESPACHAR; al vender se apartan los bultos (Opción A). Los días de crédito corren desde el despacho.
- Inventario inicial: conteo inicial en bultos, cargado una vez.
- Precio por bulto: se carga por bulto en cada producto, por nivel de precio (y precios especiales por cliente por bulto).
- Rol "Producción": nuevo; jefe de producción y empaque siguen igual.
- Movimientos (despachar antes de 15 t, pausar, dividir): Dueño y jefe de producción, con motivo.
- 15 t: valor fijo, ajuste que solo el Dueño cambia.
- Tasa BCV: fin de semana = última publicada; cobro con fecha pasada = tasa de ese día.
- Cortes del semáforo y tolerancia del cierre: los carga el dueño en Ajustes después (mientras tanto solo verde al llegar a 15 t; sin tolerancia).
- Pendiente para el contador: efectos fiscales de emitir al despachar y dividir pedidos.
