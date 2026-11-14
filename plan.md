# Plan de persistencia: Sistema El Maná JL

Objetivo: pasar la maqueta (datos en memoria) a un sistema con datos guardados en la base compartida del Artifact (capacidad `db`), sin perder funciones. Un solo archivo `sistema-produccion.html`, ordenado en secciones: (1) semilla de ejemplo, (2) capa de datos, (3) aplicación.

## 1. Base de datos: colecciones y formas de documento

Ids estables y legibles (`REC-0398`, `C-0398`, `P1`). Todo documento lleva su `id` dentro del cuerpo. Fechas `AAAA-MM-DD`. Dinero en US$ (número); la nómina en Bs.

**Ajustes y catálogos (sobreviven a "empezar en limpio")**
- `ajustes/tasa` `{valor, fecha}` · `ajustes/politicas` `{fondo, umbral, repPct, comprobante, diasPrestamo, tope, cuotasMax, antig, unActivo, alertaCxP, diasPrecioB, descB, tolRec}` · `ajustes/matriz` `{perm:{pantalla:{rol:0-3}}, mods:{rol:[prod|adm]}}` · `ajustes/recibidores` `{lista:[nombres]}` · `gestion/resumen` (cifras de ejemplo de ventas y cartera; reemplaza a ajustes/ventas_meta)
- `roles/{rol}` `{nombre, desc, orden}` (los 9 confirmados)
- `partidas/{cod}` `{cod, n, parent, hoja, nat, fijo, tang, auto}`
- `productos/{id}` `{tipo:'mp'|'pres'|'salsa', n, cat, sk, u, min, fam, grupo, recep, kgSaco, prov, orden}` (materias primas, 6 presentaciones y granel, 5 salsas)
- `meta/estado` `{modo:'ejemplo'|'limpio', ts}` · `meta/seq-<SERIE>` `{n}` (contadores)

**Maestros (con ejemplo; se crean desde "Proveedores y personal")**
- `proveedores/{id}` `{nombre, rif, rubro, tipo:'papa'|'insumo'|'general', cond, plazo, dias, abonos, hist, rechazo, activo, orden}`
- `empleados/{id}` `{n, area, antig}` · `flota/{id}` `{id, tipo:'truck'|'bus', chofer, estado, dest}`

**Compras y pagos**
- `recepciones/{REC-n}` `{fecha, prov, productoId, item, cat, sk, sub, unidad, sacos, kgSaco, qf (kg facturados), kgRec, muestra:{n,prom,desv}, calidad, recibe, fact, obs, motivo, entProm, entReal, estado:'recibido'|'validado'|'compra'|'almacen', validacion:{pu,cond,por,ts}, compraId}`
- `compras/{C-n | G-n}` `{fam:'MP'|'GEN', recId, prov, sub, cat, item, sk, unidad, qty (base de pago), pu, cond, plazo, partida, motivo, fecha, entProm, entReal}`
- `cxp/{CXP-<compraId>}` `{compraId, prov, total, cuota (abono, si aplica), vence, fecha}`
- `pagos/{PG-n}` `{cxpId, compraId, monto, fecha, ref, rol}`
- `movimientos/{MV-..}` `{almacen:'MP'|'PT', item, tipo:'saldo'|'entrada'|'salida', cant, fecha, ref, nota}`

**Producción, empaque y salida**
- `lotes/{L-xxxx}` `{fecha, compra, prov, cruda, granel, aceite, estado:'En proceso'|'Cerrado', etapa}` · `salsas_lotes/{id}` `{n, pres, und, lote, etapa}`
- `empaques/{id}` `{fecha, hora, lote, pres, und, kg, bolsasMerma}` · `reposiciones/{RP-n}` `{pres, cant, pide, motivo, estado}`
- `bultos/{BLT-..}` `{lote, cont, kg, ubic, est}` · `despachos/{NE-n | TR-n}` `{fecha, veh, chofer, dest, rif, tipo, estado, items:[{d,c,u,l}]}`

**Caja chica y personal**
- `caja_gastos/{CC-n}` `{fecha, tipo, num, prov, rif, monto, cat, just, adjNombre, adjId, repId}` · `caja_reposiciones/{RC-n}` `{fecha, monto, gastoIds}` · `caja_arqueos/{AQ-n}` `{fecha, contado, esperado, rol}`
- `prestamos/{PR-n}` `{emp, fecha, monto, cuotas, pagadas, tasa, motivo}` (el recibo se dibuja desde este documento)

**Ventas y gestión** (agregados sin pantalla de captura todavía): `cobranza/{factura}` `{cli, vend, fact, fecha, monto}`, `clientes_inactivos`, `vendedores` `{n, mes, orden}`, `ventas_dia/{fecha}` `{v}`, `ventas_producto/{id}` `{n, v}`, `nomina/{area}` `{area, n, base, extras, bonos}` (Bs), `gastos_operativos/{id}` `{tipo:'fijo'|'variable', concepto, monto}`.

**No se guarda lo derivado:** existencias (suma de `movimientos`), saldo de cada cuenta por pagar (`total` menos `pagos`), arqueo esperado, aging, calendario, rankings, puntajes, rendimiento, costo por kg útil, tablero.

## 2. Relaciones clave (todo por id)

Validar una recepción (solo Administración o Dueño) ejecuta, en orden y cada paso guardado: (1) `recepciones.estado = validado` con precio y condición; (2) crea `compras/C-n` con `recId`, y la recepción pasa a `compra` con `compraId`; (3) si es crédito, crea `cxp/CXP-C-n` (vence = hoy + plazo del proveedor; cuota = total/abonos si el proveedor paga por abonos); (4) crea `movimientos/MV-ENT-REC-n` (entrada al almacén MP) y la recepción pasa a `almacen`. Los ids de los pasos 3 y 4 son deterministas, así que repetir el proceso no duplica. Si el proceso se corta, la bandeja ofrece "Continuar" y retoma desde el estado guardado. Pagar un abono crea un `pagos/PG-n` y adelanta `cxp.vence`. Cerrar un lote actualiza `lotes` y crea su bulto. Reponer caja crea `caja_reposiciones` y marca cada gasto con `repId`.

## 3. Capa de acceso a datos

Un único módulo (sección "Capa de datos") habla con la base. Tres niveles, de abajo hacia arriba:
1. **Backend** con interfaz fija `{subscribe, set, update, remove, acquire}`. Hay dos: `db` (capacidad real del Artifact, `claude.use('db')`) y `local` (localStorage, solo si `db` no está disponible; todo en try/catch, con aviso visible "Modo local: datos solo de este navegador").
2. **Store**: copia en memoria de cada colección, alimentada por `onSnapshot` (una suscripción por colección, 30 en total, bajo el tope de 64). Las pantallas leen de aquí, de forma síncrona, mediante selectores (`S.compras`, `S.stock`, `DATA.proveedores`…) que arman las vistas derivadas.
3. **Servicios** (`Svc.*`): las únicas funciones que escriben (validar, pagar, registrar gasto…). Las pantallas llaman a `Svc`, nunca a la base. Así se puede cambiar la interfaz sin tocar datos.

Estados de pantalla: cargando (hasta el primer snapshot de todas las colecciones, con tope de 10 s), error (aviso con el motivo; la escucha sigue viva) y vacío (cada lista tiene su mensaje; con base sin sembrar se ofrece cargar el ejemplo).

## 4. Varios usuarios a la vez

- Los cambios de otros llegan por snapshot y redibujan la pantalla; si hay un campo en edición, el redibujo espera a que se suelte el foco.
- Una escritura a la vez por documento (cola por ruta); escrituras con último-gana, por eso las acciones críticas (validar, pagar, reservar número) usan `acquire` (lease corto) y releen el estado antes de escribir.
- Números consecutivos (`REC`, `C`, `CC`…) se reservan bajo lease en `meta/seq-*` y se verifica que el id no exista.
- Sin login: el rol es un selector guardado en el navegador de cada persona. No es seguridad. Con la regla por defecto de `db`, quien tenga acceso de colaborador o superior puede escribir. Los viewers solo leen y la pantalla lo avisa.

## 5. Datos de ejemplo y empezar en limpio

- El ejemplo es un bloque JS (`SEED_SRC`) con ids estables; `buildSeed()` lo convierte a documentos. Al abrir con `meta/estado` ausente, se siembra solo (con lease). Sembrar es idempotente.
- Pantalla "Datos" (solo Dueño, doble confirmación: aviso y luego escribir BORRAR): **Empezar en limpio** borra movimientos, maestros de ejemplo y contadores y deja presentaciones, productos, partidas, roles, matriz, políticas y tasa. **Volver a cargar el ejemplo** borra todo lo operativo y siembra de nuevo.

## Correcciones tras la construcción
- Los 9 roles son fijos (no hay usuarios); `ajustes/matriz` guarda también `mods` (módulos visibles por rol). Una sola función de permisos (`lvlOf`) decide pantalla y acción.
- Entrada por portada (Producción / Administración) y elección de rol; la última elección va solo en localStorage (`elmana:pref`).
- Pantalla Catálogos (proveedores y personal) y equipo y flota en Producción; en modo limpio se dan de alta ahí.
- Los bloqueos de edición simultánea usan la colección `locks`; los contadores, `meta/seq-<SERIE>`; el modo, `meta/estado.modo`.
- El adjunto usa `assets` si hay permiso; si no, solo el nombre y un aviso.
- La página tiene tres bloques de script: semilla, capa de datos y aplicación.


## Gráficas de barras (Chart.js 4.4.1)

Un solo componente reutilizable (`charts.js` dentro de la página): cada gráfica es una definición en `CH` y cada pantalla lista las suyas en `CP_SCR`. Los datos se calculan siempre desde los registros guardados mediante la capa de acceso; no se guardan agregados. Control global Diario | Semanal | Mensual con comparación contra el periodo anterior (barras agrupadas actual vs anterior). Ventana: Diario = 7 días vs los 7 previos; Semanal = 4 semanas (lunes a domingo) vs las 4 previas; Mensual = 2 meses vs los 2 previos. Cada gráfica tiene tabla alternativa ("Ver como tabla"), estado vacío, tooltip en US$ y Bs a la tasa vigente, y se destruye al cambiar de pantalla. Cada gráfica está atada a la pantalla de la matriz de permisos que la gobierna.

### Inventario: pantalla, qué compara o mide, gráfica

| Pantalla | Qué compara o mide | Gráficas |
|---|---|---|
| Control de gestión | Resumen de todo el negocio por periodo | ventas total, ventas por vendedor, ventas por producto, compras MP vs generales, compras contado vs crédito, compras por proveedor, producción kg, rendimiento %, consumo de aceite %, CxP pagado, aging CxP, aging cobranza, caja chica gastos vs reposición, gastos total, nómina, despachos por vehículo (16) |
| Planta (inicio) | Producción y existencias del día | producción kg, stock de producto terminado (2) |
| Recepción | Muestra vs facturado, diferencias por proveedor | kg recibidos, diferencia muestra vs facturado (2) |
| Almacén de materia prima | Stock vs mínimo | stock MP (1) |
| Almacén en proceso | Material en proceso | en proceso (1) |
| Almacén de producto terminado | Stock y salidas | stock PT, salidas (2) |
| Almacén de logística | Existencias de logística | logística (1) |
| Producción | Lotes, rendimiento, aceite | kg, rendimiento %, consumo de aceite % (3) |
| Empaque | Empacado hoy, reposición, stock por presentación | empaque hoy, reposición, stock PT (3) |
| Despachos | Por vehículo y por tipo/destino | por vehículo, por tipo (2) |
| Cotejo | Teórico vs real | kg, rendimiento, costo (3) |
| Compras de MP | Compras en el tiempo, contado vs crédito, por proveedor | serie de compras, contado vs crédito, por proveedor (3) |
| Compras generales | Gastos generales | gastos total, por categoría (2) |
| Análisis de compras y ranking de proveedores | Tipo, condición, proveedor, puntaje, merma, precio, plazo | compras por tipo, contado vs crédito, por proveedor, puntaje, merma, precio, plazo (7) |
| Cuentas por pagar | Pagado, aging, vencimientos, por proveedor | pagado, aging, por proveedor (3) |
| Caja chica | Gastos por destino, arqueo, reposición | gastos, gastos vs reposición, por categoría, arqueo (4) |
| Préstamos | Saldo y recuperación | saldo, recuperación (2) |
| Ventas | Por vendedor y producto, cobranza, precio B vs FULL | total, por vendedor, por producto, aging cobranza, cobranza por vendedor, precio B vs FULL (6) |
| Nómina y gastos | Nómina por periodo y área, gastos fijos vs variables | nómina, nómina por área, gastos fijos vs variables, gastos total (4) |

Sin gráfica por no tener medición: mapa, catálogos (proveedores y personal), equipo y flota, políticas, manual, roles, datos.

Datos de ejemplo sin captura (ventas, cobranza, precio B vs FULL, nómina, gastos fijos/variables): se dibujan desde lo sembrado y llevan la marca discreta "Datos de ejemplo" mientras la base esté en modo ejemplo.

### Historial sembrado (versión HIST_V = 2)

- `meta/estado` suma el campo `hv` (versión del historial). Si una base de ejemplo ya sembrada tiene `hv` menor, `Svc.migrarHist()` agrega el historial bajo el candado `seed` (idempotente, ids estables).
- Compras MP: ids `C-0300...` con recepción `REC-0300...`, cuentas por pagar y pagos `PG-H-<id>-<k>`; lotes cerrados `L-MMDD`. Compras generales `G-0050...`. Caja chica `CC-001..CC-028` con reposiciones `RC-H1..H3`; arqueos `AQ-0000A..G`; despachos `NE-2250...` (Entregada).
- `gestion/ventas_hist`: `{vend, prod, dias:[[fecha,total,[por vendedor],[por producto]]]}`; `gestion/nomina_hist`: `{items:[{f,bs}]}` (6 quincenas).
- Cubre del 2026-08-01 al día sembrado (más de 8 semanas y 3 meses).

## Mermas por proceso (modelo de datos)

Objetivo: registrar la pérdida en CADA etapa, calcular merma % por etapa y acumulada por lote, valorarla en US$ (con equivalente en Bs) y verla en reportes, gráficas, Cotejo, Análisis de proveedores y Control de gestión.

### Colección `mermas` (id estable `MR-0001...`, contador `meta/seq-MR`)
`{id, fecha, etapa, lote, rec, prod, pres, cant, un, causa, rol, quien, obs, usd, estado, auto, ent, ref}`
- `etapa`: recepcion, almmp, pelado, corte, freido, sazonado, quebrado, salsa_mezcla, salsa_env, empaque, almpt, despacho.
- `lote` (lote de papa `L-...`), `rec` (recepción de origen, para recepción y almacén MP), `ref` (lote de salsa o nota de entrega).
- `cant` + `un` ('kg' o 'und'); `usd` = kg × costo promedio de la etapa (guardado al registrar; el equivalente en Bs se calcula con la tasa vigente).
- `estado`: `pend` (registrado, espera aprobación del Jefe de producción) o `apr`. Los registros de quien ya tiene nivel de aprobar nacen aprobados.
- `auto`: 1 si el sistema lo creó solo (bolsas dañadas al registrar un empaque; ids `MR-E-<empaque>`).
- `ent`: kg que entraron a la etapa, solo cuando no se pueden medir solos (salsa).
- Merma de recepción (diferencia muestra/facturado) NO se duplica: se calcula en vivo desde `recepciones` (kg facturados - kg pesados). Los descartes por calidad sí son registros.
- Almacenes: al registrar almmp / almpt la merma descuenta del stock correspondiente (movimiento `MOV` con ref al registro).

### Catálogo de causas: `ajustes/causas_merma` `{lista:[...]}` editable (Deterioro, Error de proceso, Equipo, Calidad de proveedor, Humedad, Manipulación, Otro).
### Tolerancias: en `ajustes/politicas` (claves `mr_<etapa>`, % perdido ÷ entrada de la etapa; recepción usa `tolRec`) y `mrAlerta` (% sobre tolerancia para pasar de alerta a fuera).

### Cálculo
- merma % de la etapa = perdido ÷ entrada de esa etapa. Entradas encadenadas por lote: cruda → (pelado, corte, freído) → granel (frito medido al cerrar) → (sazonado, quebrado) → empacado.
- Pre-peso (pelado, corte, freído) ya están dentro del rendimiento medido; post-peso (sazonado, quebrado, empaque, almacén, despacho) bajan el rendimiento neto.
- Acumulada del lote = 1 - producto sobreviviente (producto de (1 - merma_etapa)). Rendimiento neto = rendimiento medido × (1 - merma post-peso).
- Semáforo: <= tolerancia verde; <= tolerancia × (1 + mrAlerta/100) alerta; más, fuera.
- Costo de la merma = kg × costo promedio (papa: costo del lote; resto: costo de compra promedio) y entra a Control de gestión.

### Gráficas nuevas (barras, control Diario/Semanal/Mensual con comparación)
Merma % por proceso, merma kg por causa, merma US$ por causa, merma por lote, merma por proveedor, flujo de pérdida por etapa (entrada → salida), tendencia de merma (kg), costo de mermas en Control de gestión.

### Historial: HIST_V = 3 agrega mermas de ejemplo coherentes con los lotes sembrados (ids `MR-H...`), idempotente.

## Marca, personal, caja chica, WhatsApp y exportación (plan técnico)

- Marca: tokens en `brand.css` (rojo #C92121, amarillo #F2B72E, blanco, gris casi negro); `data-theme="light"` fijo; logo embebido (`brand.js`, `logoImg(cls)`).
- Caja chica: comprobante único «Nota de entrega».
- WhatsApp: `wa.js` (`waBtn`, `waMsgCxc`, `waMsgInac`); teléfonos en `ajustes/tel_clientes`.
- Personal: colecciones `empleados` (pago `hora|dia`, `tarifa`, `arch`) y `asistencia` (`{quincena, emp, dias, horas, extra, bonos}`); `personal.js` calcula la nómina; archivado lógico con `arch`, `archTs`, `archPor`. `HIST_V = 5`.
- Gráficas nuevas: nómina por área y evolución de nómina (`nom_area`, `nomina`), más las 9 de mermas (sección 9).
- Exportación: `export.js` con `EXP_SETS` (14 conjuntos con pantalla de permiso, área y filas por periodo), `expBar(ruta)` (se dibuja desde `renderMain`), `expCSV`, `printHTML`, `docBar`. Las pantallas no llevan copias propias.
- Pendiente: versión Cloudflare (Worker + D1) con la misma capa de datos apuntando a la API; ver carpeta `cloudflare/`.

## Plan técnico: Cloudflare, tipografía y calendario
- Una sola fuente de código (carpeta de trabajo con assemble.js) genera sistema-produccion.html (Artifact) y cloudflare/public/index.html (build.js agrega window.__EM_HTTP).
- Capa de datos: backend 'http' (http_backend.js) contra /api/* del Worker; endpoints tipados con lista blanca de colecciones, límite de tamaño (900 KB), mismo origen y límite por IP.
- Redespliegue: cd cloudflare; node build.js; npx wrangler d1 migrations apply elmana-jl --remote (solo si hay migración nueva); npx wrangler deploy.
- Calendario: calendar.js (eventos desde cxp/pagos y cxc/cobros, sin duplicar datos); acción cxcCobro con permiso de ventas; export calcxp/calcxc.

## Plan técnico: notas de entrega, entidades e inventario (solo Cloudflare)
- Fuente única en el scratchpad; `CF=1 OUT=cloudflare/app-source.html node assemble.js` aplica terminos.js (solo Cloudflare) y `node build.js` genera public/index.html. El Artifact no se publica con estos cambios.
- Nuevas colecciones (lista blanca del Worker): clientes, auditoria, solicitudes_compra. Migración de datos al subir HIST_V a 7 (clientes, N- en cartera y cobros, CC-036 completo, máximos y plazos de entrega); no hay cambio de esquema SQL en D1.
- Inventario derivado de movimientos: nada duplicado; solo se guardan límites, solicitudes y plazos.
