# Plan: el recorrido simple (pedir → recibir → producir → empacar → inventario → vender → cargar → despachar)

Para: el Dueño. Hecho por: Planificador. Fecha: 14-11-2026. Solo plan: no se tocó código, base ni migraciones.
Todo local (`wrangler dev --local`, puerto 8799). Sin deploy. No se pone ninguna cifra de negocio por ti.
Este plan **no repite** lo ya decidido en `plan-produccion-zonas.md` (venta aparta bultos y el documento sale al despachar, 15 t por zona, inventario inicial en bultos, rol «Producción» nuevo, movimientos con motivo). Lo usa como base.

---

## 0. Lo que hay hoy (leído en el código)

- **Dos mundos que no se hablan.** Recepción, compras de MP, lotes, empaque, reposiciones y despachos viven en las pantallas viejas (`app-source.html`, colecciones `docs`: `recepciones`, `compras`, `lotes`, `empaques`, `reposiciones`, `despachos`, `solicitudes_compra`). Ventas, inventario terminado, entregas con foto y precios viven en tablas D1 nuevas (`productos`, `documentos_venta`, `movimientos_inventario`, `entregas`).
- **Ya existe un «registro que viaja» a medias:** la recepción guarda kg facturados y kg de balanza; Administración la valida y se vuelve compra y entrada a MP (`recibido → validado → compra → almacen`). El lote se abre con kg de papa cruda de una compra y se cierra con kg a granel y aceite. Pero el empaque no está atado al lote ni suma al inventario de ventas.
- **Inventario terminado de ventas** = `productos.stock_entero`; el servidor ya lo trata como bultos al vender (mensaje «hay N bultos»). Sube con el botón «Entrada de inventario» (`entradaStock`) y baja al vender.
- **Kg y unidades por bulto** ya están en `productos` (migración 0006) y existe `kilosDeBultos()` en `src/ventas/dominio.js`.
- **Etapa 3 del plan anterior (turno, etapas, cierre) NO está construida:** no hay `src/produccion/`, ni rol `produccion` en `ROL_TXT` (`src/ventas/permisos.js`), ni tablas de turno.
- **Zona** hoy sale del estado del cliente (`envio_zona`, `estados_lista`); no hay tabla `zonas`.
- **Roles reales en el código:** `dueno, adm, custodio, recep, jefeprod, empaque` (empaque y despacho es UN rol), `ventas, cobranza, rrhh`.
- **Siguiente migración libre: `0012`.** Los nombres `0005_produccion…0008_salidas` del plan anterior ya están ocupados por otras cosas; se renumeran.
- Portal y entrega con foto quedaron a medias y sin verificar (handoff): hay que comprobar que la versión local arranca antes de construir encima.

---

## 1. El recorrido en 8 pasos

Regla de oro: **cada cifra se escribe una sola vez**, en el paso donde nace. Los pasos siguientes la ven ya puesta y solo agregan lo suyo.

| # | Paso | Quién | Entra | Sale | Ya existe | Falta |
|---|---|---|---|---|---|---|
| 1 | **Pedir la mercancía** | Adm. y compras (la necesidad la levanta cualquier almacén) | Solicitud: qué y cuánto se necesita | Pedido al proveedor: proveedor, kg o sacos esperados | `solicitudes_compra` (Pendiente → Atendida) en «Existencias» | Estado «Pedida al proveedor» con kg esperados, para que Recepción lo vea como tarea |
| 2 | **Recibir** | Recepción; valida Adm. | kg esperados (del paso 1, ya puestos) | kg facturados, kg de balanza, calidad; diferencia visible | Pantalla Recepción y validación en Compras de MP | Abrir la recepción desde el pedido (sin reescribir proveedor ni producto) |
| 3 | **Producir** | Jefe de producción | kg de papa tomados de una o más recepciones validadas | kg que salen de cada etapa (lavado, fritado); merma por etapa | Lotes viejos (abrir, avanzar etapa, cerrar con granel y aceite) | Ficha de turno en D1 con kg por etapa y atada a la recepción |
| 4 | **Empacar** | Empaque y despacho | kg fritos que llegan (del paso 3, ya puestos) | **bultos por producto**; el sistema calcula kg = bultos × kg por bulto | Registro de empaque viejo (unidades, sin atar al inventario) | Empaque como etapa de la misma ficha, en bultos |
| 5 | **Cargar en inventario** | Producción o Dueño (cierre de turno) | Bultos empacados del turno | Bultos que suben a `productos.stock_entero`; resumen kg entró / produjo / empacó | `movimientos_inventario`, `stock_entero`, «Entrada de inventario» manual | Cierre de turno que sube el inventario solo; conteo inicial una vez; quitar la entrada manual |
| 6 | **Vender** | Ventas | Bultos disponibles (inventario − apartado) | Pedido con bultos y kg; aparta bultos; suma kg a su zona | Venta por bulto con tope de existencias; crea el documento al vender | Pedido que aparta (decisión ya tomada: documento al despachar) |
| 7 | **Cargar el camión** | Jefe de producción o Dueño arma; Empaque y despacho carga | Pedidos pendientes de la zona (kg y bultos ya puestos) | Salida: qué bultos suben, kg totales, vehículo, chofer | Flota y despachos viejos (sin unión con ventas) | Salida por zona con conteo de bultos al cargar |
| 8 | **Despachar** | Empaque y despacho | Salida cargada | Documento emitido, inventario físico baja, foto de entrega | Entrega con foto (`entregas`), temporizador de crédito | Unir foto a la salida; emitir el documento al salir |

---

## 2. Modelo de datos mínimo para que kilos y bultos cuadren

**Idea:** dos «fichas» que viajan. La **ficha de turno** (pasos 2 a 5) y la **ficha de pedido** (pasos 6 a 8). Cada paso agrega filas a su ficha; nadie vuelve a escribir lo de antes.

### 2.1 Ficha de turno (migración `0012_turnos.sql`)
- `turnos` (la ficha): id, fecha, estado (`ABIERTO → PRODUCIENDO → EMPACANDO → POR_CERRAR → CERRADO`), quién abrió, quién cerró, observaciones. Reutiliza el diseño `turnos` de la Etapa 3 del plan anterior.
- `turno_entradas`: de qué recepción viene la papa. Guarda `ref_compra` (id de la compra validada en `docs` col `compras`) y kg tomados. **El servidor lee los kg de esa compra** en la tabla `docs` (misma base): la pantalla no los vuelve a pedir; solo pregunta «¿cuántos de esos kg entran hoy?».
- `movimientos_proceso` (del plan anterior): turno, etapa (recepción, lavado, fritado, empacado), kg que entran, kg que salen, causa de merma (lista de causas que ya existe en Mermas), rol, momento. **Lo que sale de una etapa es lo que entra a la siguiente** (se copia solo).
- `turno_bultos`: turno, producto, bultos. Los kg se calculan con `kg_por_bulto` congelado en la fila (para que un cambio de catálogo no mueva turnos viejos).
- Cierre: escribe en `movimientos_inventario` (tabla existente) tipo `ENTRADA_CIERRE_TURNO`, con una columna nueva `id_turno`, y suma a `productos.stock_entero`. No se crea otro inventario.

### 2.2 Ficha de pedido (migraciones siguientes; ya diseñadas en el plan anterior, Etapas 5 y 7)
- `pedidos` + `pedido_lineas` (bultos, kg congelados, bultos ya despachados): aparta bultos.
- `salidas` + `salida_lineas` (qué bultos de qué pedido suben al camión) + vehículo y chofer de la flota.
- `entregas` (existe): se le agrega `id_salida` para que la foto cierre la salida.
- `documentos_venta` (existe): nace al despachar, apuntando al pedido.

### 2.3 Cuadre visible (se calcula, no se guarda)
- **Planta, por turno:** kg recibidos → kg que entran a producir → kg fritos → kg empacados (bultos × kg/bulto). Cada flecha muestra la diferencia en kg y % como **merma**, con su causa si la anotaron. Sin tolerancia cargada: solo se muestra, no bloquea (decisión ya tomada).
- **Inventario, por producto:** inicial + cierres de turno − despachado = físico; físico − apartado = disponible.
- **Salida:** bultos pedidos = bultos cargados = bultos entregados; cualquier diferencia queda a la vista con quién la registró.
- Todo con `auditoria_sistema` (quién, cuándo, qué cifra).

---

## 3. La ruta de tareas por rol

**Qué es una tarea:** una ficha cuyo estado espera a tu rol. No se guarda aparte: el servidor la calcula del estado (así nunca se desordena).

| Estado de la ficha | Tarea que aparece | Para |
|---|---|---|
| Solicitud pendiente | «N cosas por pedir al proveedor» | Adm. y compras |
| Pedida al proveedor | «N pedidos por recibir» | Recepción |
| Recibida | «N recepciones por validar» | Adm. y compras |
| Validada y sin usar | «N kg listos para producir» | Jefe de producción |
| Turno produciendo | «Turno de hoy: anotar lavado / fritado» | Jefe de producción |
| Turno empacando | «N kg fritos por empacar» | Empaque y despacho |
| Turno por cerrar | «Cerrar el turno de hoy» | Producción o Dueño |
| Zona en 15 t o con salida armada | «Zona X lista para cargar» | Jefe de producción / Dueño |
| Salida armada | «Cargar camión de la zona X» | Empaque y despacho |
| Salida cargada | «Despachar y subir foto» | Empaque y despacho |

**Cómo se marca el paso siguiente:** cada tarea abre una sola tarjeta con lo ya escrito arriba (solo lectura) y los campos de ese paso. Un botón grande: «Listo: pasa a Empaque» (el nombre del siguiente rol en el botón). Al tocarlo, el servidor revisa los números, cambia el estado y la tarea aparece en la lista del otro rol. Botón secundario «Devolver» con motivo, para corregir un paso anterior sin borrar nada.

**Dónde se ve:** cada una de las 7 pantallas (`front/pantallas/pantallas.js`) gana una primera pestaña **«Mis tareas»**: lista corta con contadores grandes («3 pedidos por recibir»), sin scroll (se pagina). El número también sale como insignia en el lanzador.

**Línea de tiempo simple:** en cada ficha, una franja de 8 puntos (Pedido · Recibido · Producido · Empacado · En inventario · Vendido · Cargado · Despachado). Hecho = rojo de marca con ✓; actual = amarillo; pendiente = gris. Debajo de cada punto, kg y bultos de ese paso, y la merma entre puntos. El Dueño tiene una vista «En qué va todo» con una línea por ficha abierta.

Rutas nuevas: `GET /api/r/tareas` (lista del rol), `GET /api/r/ficha/:tipo/:id` (línea de tiempo). Módulo `src/ruta/` (dominio: qué estado es tarea de qué rol; servicio: junta turnos, compras de `docs`, pedidos y salidas).

---

## 4. Pantallas viejas que se unen o desaparecen (propuesta; lo que borre una función se te pregunta en la sección 6)

| Pantalla (clave) | Pasa a ser |
|---|---|
| `planta` (Resumen de planta) | **Se reemplaza** por «En qué va todo» (línea de tiempo) |
| `recepcion` | Se queda, pero se abre desde la tarea «por recibir»; sin reescribir proveedor ni producto |
| `compras-mp` (Recepciones por validar) | Se queda para Adm.; la bandeja pasa a «Mis tareas» de Adm. |
| `produccion` + `alm-proceso` | **Se unen** en «Turno» (etapas con kg que entran y salen) |
| `empaque` (registro) | **Se une** a «Turno» como paso Empacar, en bultos |
| `mermas` (captura) | La captura **se une** a cada paso del turno; el reporte de mermas se queda |
| `alm-pt` + parte de producto terminado de `inventario` / `inventario-adm` | **Se unen** en «Inventario terminado» único (D1, bultos y kg: físico, apartado, disponible) |
| «Entrada de inventario» (en `v-clientes`) | **Desaparece**; queda solo el conteo inicial único |
| `despachos` (notas viejas) | **Se une** con `e-entregas` en «Carga y despacho»; las notas viejas quedan solo para leer |
| `log-dev` y la pantalla «Logística» | **Desaparecen** (vacías) |
| `alm-logistica` (bultos y etiquetas) | Se queda en Despacho mientras decides el sub-almacén 2 |
| `cotejo` | Se queda; lee de las fichas de turno |
| `alm-mp`, `ventas`, `c-pedidos`, `v-pedido` | Se quedan (v-pedido cambia en la etapa de venta) |

---

## 5. Etapas de construcción (empieza por Producción → Inventario)

Cada etapa se termina, se verifica en corto y se te muestra antes de la siguiente. Verificación = `node build.js` + migración `--local` + guion `curl` contra el puerto 8799 + 1 recorrido por pantalla y consola sin errores. Subagentes Sonnet (`model: "sonnet"`), pocos y agrupados.

**R0 · Arranque seguro (1 subagente, corto)**
- Alcance: comprobar que lo parcial (portal, entregas) no rompe la versión local; aplicar 0004/0005 si faltan.
- Verificar: build sin error, pantallas abren, consola limpia. Riesgo: encontrar roturas que frenen R1 (se te avisa).

**R1 · Ficha de turno (servidor) (1 subagente)**
- Alcance: `0012_turnos.sql` (turnos, turno_entradas, movimientos_proceso, turno_bultos, `id_turno` en movimientos_inventario); `src/produccion/{dominio,repo,servicio,rutas,permisos}.js`; rol `produccion` en `ROL_TXT`; `worker.js` delega `/api/p/*`.
- Reglas: lo que sale de una etapa no puede pasar lo que entró; bultos enteros > 0; producto sin kg por bulto no se empaca; turno cerrado no se toca; cierre una sola vez.
- Verificar: guion curl: abrir → tomar kg de una compra validada → lavado → fritado → bultos → cerrar; `stock_entero` sube exacto; rol Ventas rechazado (403). Riesgo: leer `docs` JSON desde D1 (se encapsula en `repo.js`).

**R2 · Pantalla «Turno» + «Mis tareas» (1 subagente; puede ir en paralelo con R1 si se fija antes el formato de la API)**
- Alcance: `front/produccion/p-turno.js`, `front/ruta/r-tareas.js`, `src/ruta/*`, pestaña «Mis tareas» en `pantallas.js`, `build.js`, rol en `ROLES`/`PERM_DEF` de `app-source.html`.
- Verificar: un turno completo solo con toques y números (sin escribir dos veces un kg); la tarea pasa de Jefe de producción a Empaque y a Producción; sin scroll a 375 px. Riesgo: archivos compartidos (`app-source.html`, `build.js`): releer antes de editar.

**R3 · Inventario terminado único (1 subagente)**
- Alcance: conteo inicial en bultos (una vez, Dueño); quitar `entradaStock` de la pantalla y de la ruta; pantalla «Inventario terminado» con inicial + turnos − despachos; `alm-pt` lee de aquí.
- Verificar: inicial cargado dos veces → rechazado; el número coincide con la suma de movimientos. Riesgo: datos de ejemplo con 500 bultos sembrados (`ENTRADA_EJEMPLO`) se distinguen del real.

**R4 · Pedir y recibir con tareas (1 subagente)**
- Alcance: estado «Pedida al proveedor» en `solicitudes_compra` (kg esperados); Recepción abre desde el pedido; la recepción validada aparece como «kg listos para producir». Línea de tiempo de los pasos 1-5.
- Verificar: pedido → recepción → validación → turno sin reescribir datos; diferencia esperado/facturado/balanza visible. Riesgo: estas colecciones viven en `docs`; no se migran ahora.

**R5 · Vender apartando (1 subagente)** — Etapa 5 del plan anterior (pedidos, disponible = físico − apartado, kg por zona). Riesgo alto: toca venta y cobro; repetir pruebas del plan de Ventas.

**R6 · Cargar el camión (1 subagente)** — Etapas 6 y 7 del plan anterior (tarjetas por zona, salida, conteo de bultos al cargar, 15 t, motivo).

**R7 · Despachar (junto con R6 o aparte, 1 subagente)** — salida → documento → inventario baja → foto (`entregas.id_salida`) → crédito corre.

**R8 · Unir pantallas viejas y prueba de punta a punta (1 subagente)** — lista de la sección 4; recorrido completo de los 8 pasos con cada rol; colores de marca; sin scroll.

**K1 · KPIs con datos de hoy (1 subagente; puede ir en paralelo con R1, no toca producción)**
- Alcance: `src/kpi/{dominio,repo,servicio,rutas}.js` con `GET /api/k/resumen?periodo=`; tabla `metas_kpi` (migración `0013_metas_kpi.sql`); tarjetas F1-F5 en Gerencia y en Ventas/Cobranza (sección 6).
- Verificar: cada tarjeta = la misma cifra que ya muestran «Quién debe» y «Cobros hechos»; Ventas no ve la tarjeta de Cobranza (403). Riesgo: datos de ejemplo mezclados (se marcan como hoy en Gerencia).

**K2 · KPIs de planta (junto con R2 o justo después)** — P1-P3 en Gerencia y en la pantalla de Producción, leyendo las fichas de turno.

**K3 · KPIs de venta, carga y entrega (junto con R6-R7)** — P4-P6; F6 cuando haya costos cargados; F7 cuando caja, nómina y CxP se lean en un solo lugar.

Total: 7 a 9 subagentes Sonnet en serie (R1, R2 y K1 pueden ir en paralelo). Nada de esto requiere deploy.

---

## 6. Medir con KPIs (finanzas y proceso, siguiendo los 8 pasos)

**Reglas:** cada KPI se calcula al mostrar desde los registros (no se guardan totales). Sin datos suficientes: solo el número, sin color. Semáforo solo cuando el Dueño confirma la meta y carga los cortes. La meta de 15 t es fija. No se ponen cifras por ti.

### 6.1 Finanzas
| # | KPI (en una frase) | Fórmula con los datos del recorrido | De dónde sale | ¿Hoy? |
|---|---|---|---|---|
| F1 | **Vendido**: cuánto se vendió en el periodo | Σ `total_cents` de documentos no anulados, por vendedor, zona (`envio_zona`) y producto (líneas) | `documentos_venta`, `documento_lineas` | **Sí** |
| F2 | **Cobrado**: cuánto entró de clientes | Σ `usd` de pagos activos en el periodo | `pagos`, `pago_aplicaciones` | **Sí** |
| F3 | **Por cobrar**: cuánto nos deben hoy | Σ saldo de documentos pendientes (lo mismo que «Quién debe»), por vendedor y zona | servicio de deuda existente | **Sí** |
| F4 | **Antigüedad de la deuda**: cuánto es nuevo y cuánto es viejo | Por cobrar repartido en tramos de días desde la entrega; los tramos son los 7 y 21 días ya cargados | `entregas.fecha_hora` (o emisión si no hay foto), `ajustes_credito` | **Sí** (parcial: sin foto se usa la emisión y se avisa) |
| F5 | **Mora**: cuánto está vencido | Σ saldo de documentos pasados del último tramo; % = mora ÷ por cobrar | igual que F4 | **Sí** |
| F6 | **Costo y margen por bulto**: cuánto cuesta y cuánto deja cada bulto | Costo del turno ÷ bultos del turno, por producto según sus kg; margen = precio promedio por bulto vendido − costo por bulto | `turnos`+`turno_entradas` (kg de papa) × precio validado de la compra (`docs` compras `pu`); insumos del turno; costos que cargue el Dueño | **No**: necesita R1 y los costos de la pregunta 10 |
| F7 | **Gastos y flujo de caja**: qué entró y qué salió cada día | Entradas = cobros del día; salidas = pagos a proveedores + gastos de caja chica + nómina pagada + compras de contado; saldo del día = entradas − salidas | `pagos` (D1); `docs`: `cxp`/`pagos` de proveedores, `caja_gastos`, `asistencia`/nómina, `compras` | **Parcial**: entradas sí; salidas están en las pantallas viejas, se leen en K3 |

**Costos que hacen falta para F6 (no se inventan; tú los confirmas):** papa (ya sale del precio validado en cada compra), aceite e insumos usados en el turno (precio de su compra × lo usado, si se anota en el turno), empaque (bolsas y bultos), mano de obra de planta (de nómina, repartida por turno) y gastos fijos de planta (de gastos). Sin un costo cargado, la tarjeta dice «falta el costo de …» en vez de un número.

### 6.2 Proceso
| # | KPI | Fórmula | De dónde sale | ¿Hoy? |
|---|---|---|---|---|
| P1 | **Kilos y bultos por etapa** | kg recibidos, kg a producir, kg fritos, bultos y kg empacados, por turno y periodo | `docs` compras (`kgRec`), `turno_entradas`, `movimientos_proceso`, `turno_bultos` | No (R1) |
| P2 | **Merma entre etapas** | (kg que entran − kg que salen) ÷ kg que entran, por etapa; merma total = 1 − kg empacados ÷ kg tomados | `movimientos_proceso` | No (R1) |
| P3 | **Diferencia de recepción** | (kg balanza − kg facturados) ÷ kg facturados | `docs` compras | **Sí** (ya está en la validación; falta sumarlo) |
| P4 | **Avance a 15 t por zona** | Σ kg de pedidos pendientes de la zona ÷ 15 000 kg | `pedidos`, `pedido_lineas` | No (R5); hoy solo una aproximación con documentos pendientes |
| P5 | **Entregas a tiempo** | entregas con foto ÷ salidas despachadas; «a tiempo» se mide contra la fecha que tú definas (pregunta 9) | `entregas`, `salidas` | Parcial: hoy ventas con y sin foto |
| P6 | **Reclamos «no recibí esto»** | Reclamos abiertos y resueltos; % = reclamos ÷ entregas | `disputas_entrega` | **Sí** |
| P7 | **Días de crédito corridos** | Promedio de días desde la foto hasta hoy (o hasta el pago) de lo por cobrar | `entregas`, `pagos` | **Sí** |

Opcional futuro (no pedido): tiempo entre pasos (de recibido a empacado, de vendido a despachado).

### 6.3 Metas sugeridas
- **Método:** meta sugerida = promedio real del propio sistema en las últimas semanas (cuántas, pregunta 9). Se muestra «sugerida, pendiente de confirmar».
- Solo el Dueño la confirma o cambia; queda en `auditoria_sistema`. Tabla `metas_kpi`: kpi, valor, estado (sugerida / confirmada), quién, cuándo.
- Sin semanas suficientes de datos: no hay sugerencia ni color, solo el número.

### 6.4 Cómo se ven
- **Gerencia (Dueño):** fila de tarjetas por paso del recorrido (Comprar · Producir · Inventario · Vender · Cobrar · Despachar · Caja), con control Diario | Semanal | Mensual que ya existe. Cada tarjeta: número grande, una línea simple («Te deben US$ … de … clientes»), y meta si está confirmada. Tocar abre el detalle por vendedor, zona o producto. Sin scroll: se pagina.
- **Por rol, dentro de «Mis tareas»:** máximo 3 tarjetas de su paso. Adm.: F7 y P3. Recepción: P3. Jefe de producción/Producción: P1, P2. Empaque y despacho: P5, P6. Ventas: F1 propio y P4 de sus zonas. Cobranza: F2-F5, P7. RRHH y Custodio: nada nuevo (salvo gastos de caja para Custodio, si lo apruebas).
- El servidor filtra por rol (no solo la pantalla).

### 6.5 Orden de construcción
1. **K1** (ya hay datos): F1-F5, P3, P6, P7.
2. **K2** con R1-R2: P1, P2.
3. **K3** con R5-R7: P4, P5, F6 (cuando haya costos), F7 completo.

---

## 7. Preguntas abiertas para el Dueño (10)

1. **¿Qué es una «ficha» de producción?**
   - a) **Un turno** (todo lo del día), anotando de qué recepciones vino la papa. *(Recomendado: es como se trabaja hoy, turno diurno único, y es lo más simple.)*
   - b) Un lote por cada compra de papa (mide mejor el rendimiento por proveedor, pero son más fichas).
   - c) Un turno con varios lotes adentro.

2. **¿Quién anota los kilos de cada etapa?**
   - a) **Jefe de producción** anota lavado y fritado; **Empaque y despacho** anota los bultos; **Producción** cierra. *(Recomendado.)*
   - b) Una sola persona anota todo el turno.
   - c) Cada etapa tiene su propio responsable (habría que crear roles).

3. **Cuando una etapa pierde kilos (merma), ¿qué se pide?**
   - a) **Solo se muestra la diferencia** y, si quieren, eligen la causa de la lista que ya existe. *(Recomendado mientras no cargues tolerancias.)*
   - b) La causa es obligatoria siempre.
   - c) No se pide nada, solo se muestra.

4. **Paso 1, «pedir la mercancía»: ¿dónde empieza?**
   - a) **Adm. marca la solicitud como «pedida al proveedor»** con lo que se espera recibir; Recepción la ve como tarea. *(Recomendado.)*
   - b) El sistema empieza en Recepción (el pedido al proveedor se sigue haciendo fuera).
   - c) Otro rol hace el pedido (dime cuál).

5. **Pantallas que se quitan o se unen (sección 4): ¿se puede?**
   - a) **Sí, unir; lo viejo queda solo para leer.** *(Recomendado.)*
   - b) Sí, pero mantener «Reposiciones de empaque» (pedir y aprobar antes de empacar).
   - c) Quiero revisarlas una por una.

6. **Salsas: ¿entran ya a esta ruta?**
   - a) **Después; primero papas.** *(Recomendado: las salsas no tienen captura hoy.)*
   - b) Sí, desde el principio, con sus propias etapas.

7. **Al cargar el camión, ¿quién cuenta los bultos y qué pasa si no cuadra con el pedido?**
   - a) **Empaque y despacho cuenta al subir; la diferencia se muestra y el pedido queda con lo que faltó pendiente.** *(Recomendado.)*
   - b) No se cuenta: se da por cargado lo de la salida.
   - c) Lo confirma el Jefe de producción.

8. **¿Cómo se entera cada persona de que tiene una tarea nueva?**
   - a) **Al abrir su pantalla: contador grande en «Mis tareas».** *(Recomendado: no cuesta nada y no envía mensajes.)*
   - b) Además, un botón para avisar por WhatsApp (la persona toca enviar, como en Cobranza).

9. **Metas sugeridas: ¿con cuántas semanas de historia se calculan, y qué es «entrega a tiempo»?**
   - a) **Las últimas 4 semanas; «a tiempo» = despachada el día que tú fijes para la zona.** *(Recomendado: reacciona rápido a cambios.)*
   - b) Las últimas 8 o 12 semanas (más estable, tarda más en tener sugerencia).
   - c) Sin metas sugeridas; las escribo yo.

10. **Costo por bulto: ¿con qué costos empezamos?**
   - a) **Primero papa e insumos (salen de las compras ya validadas); mano de obra y gastos fijos después.** *(Recomendado: se puede medir pronto y sin inventar.)*
   - b) Todo desde el inicio (papa, insumos, empaque, nómina de planta y gastos fijos), aunque tarde más.
   - c) Todavía no medir costo ni margen.

**Para el contador (no es decisión tuya, ya estaba pendiente):** emitir el documento al despachar y dividir pedidos.

---

## 8. Próximo paso
Con tus respuestas a 1, 2 y 3 se puede empezar R0 + R1; K1 puede empezar ya (usa datos que existen). R2 necesita la 8; R4 la 4; R8 la 5; las metas la 9; F6 la 10.

## 8. Decisiones del dueño (2026-11-14)
- P1: la ficha es **un turno**, anotando de qué recepciones vino la papa.
- P2: **Jefe de producción** anota lavado y fritado; **Empaque y despacho** anota los bultos; **Producción** cierra el turno.
- P3: merma: **solo se muestra la diferencia**; la causa es opcional.
- P5: **se unen** las pantallas viejas de producción, empaque e inventario; lo viejo queda solo para leer.
- Pendientes de respuesta: P4 (dónde empieza «pedir»), P6 (salsas), P7 (conteo al cargar camión), P8 (aviso de tarea nueva), P9 y P10 (metas y costos).
- Orden: R0 (comprobar versión local) y R1 (ficha de turno en el servidor) pueden empezar; K1 (KPIs con datos que ya existen) puede ir en paralelo.

### Decisiones del dueño, segunda ronda (2026-11-14)
- P4: Administración marca la solicitud como "pedida al proveedor"; Recepción la ve como tarea pendiente.
- P6: salsas después; primero papas.
- P7: Empaque y despacho cuenta al cargar el camión; la diferencia se muestra y lo que faltó queda pendiente.
- P8: aviso de tarea nueva = contador grande en "Mis tareas" al abrir la pantalla (sin WhatsApp).
- P9: metas sugeridas con las últimas 4 semanas; "a tiempo" = día fijado por zona; el Dueño las ajusta.
- P10: costo por bulto: primero papa e insumos, luego el resto.
