# Acuerdos de la maqueta: Sistema El Maná JL

Maqueta: `sistema-produccion.html`.
Fecha simulada de la maqueta: miércoles 11 de noviembre de 2026. Todos los nombres, RIF, cédulas y montos son de ejemplo.

Origen de cada decisión:
- **Dueño**: lo pidió el dueño.
- **Supuesto**: lo decidió el consultor y hay que confirmarlo.

## 1. Decisiones generales

| # | Decisión | Origen |
|---|---|---|
| 1 | Dos módulos, PRODUCCIÓN y ADMINISTRATIVO, con selector en la cabecera | Dueño |
| 2 | Pantallas densas para el dueño en PC; pantallas de captura con botones grandes para el personal en teléfono o tableta | Dueño |
| 3 | Marca: azul marino #14365F, naranja #E8892B, verde #2E7D5B; tema claro y oscuro | Dueño |
| 4 | Montos en US$ con su equivalente en Bs. La tasa se edita en la cabecera y recalcula todo | Dueño |
| 5 | La nómina se calcula y se paga solo en Bs | Dueño |
| 6 | Rol simulado que cambia lo que se ve. Se elige en la portada y en la cabecera; al elegirlo, la portada se adapta | Dueño |
| 7 | Roles y permisos segmentados por área (ver la sección 6) | Dueño pidió segmentar; la matriz es un supuesto pendiente de confirmar |
| 8 | Validar recepciones (compra efectiva) es "aprobar" y lo hacen Administración y compras o el Dueño | Supuesto |
| 8b | Primera pantalla: portada "Mapa de procesos", copiada del mapa del dueño, con tarjetas que se pueden tocar y abren cada área | Dueño |
| 9 | Tasa inicial de ejemplo: 236,50 Bs/US$ | Supuesto |

## 2. Producción

| # | Decisión | Origen |
|---|---|---|
| 10 | Producción no compra: recepciona. Al guardar, la recepción va a Administración, que la valida, y se convierte en compra efectiva y en entrada al almacén de MP. Recorrido visible: recibido → validado → compra efectiva → en almacén | Dueño |
| 11 | La recepción registra proveedor, quién recibe, producto, sacos × kg por saco, kg facturados, kg recibidos, calidad y observaciones | Dueño |
| 12 | Insumos: pesaje por muestra (media poblacional) con promedio, desviación estándar y estimado = promedio × sacos, comparado contra lo facturado | Dueño |
| 13 | Papa: se pesa todo en la balanza de plataforma, sin muestra | Supuesto |
| 14 | Tolerancia de peso en recepción: 2 %. Si se supera, la compra se paga sobre los kg recibidos | Supuesto (editable en Políticas) |
| 15 | Calidad en 4 niveles: A óptima, B aceptable, C con defectos, rechazo parcial | Supuesto |
| 16 | Almacenes: Materia prima, En proceso, Producto terminado y Logística | Dueño |
| 17 | Logística, sub-almacén 1 "Insumos": MP lista para empaque, controlada por bulto pesado y etiquetado con ID y peso | Dueño |
| 18 | Logística, sub-almacén 2: **[NECESITA ACLARACIÓN]**. Ver la sección 5 | Pendiente |
| 19 | Etapas de "En proceso". **Papa**: lavado y pelado, corte, freído, enfriado. **Salsa**: mezclado, cocción, envasado | Supuesto |
| 20 | Turno diurno único; papa cruda → papa frita a granel; rendimiento = kg granel ÷ kg papa cruda | Dueño (fórmula: supuesto) |
| 21 | Aceite de una sola marca; el consumo varía entre 40 y 45 % | Dueño |
| 22 | Ese 40–45 % se calcula como kg de aceite ÷ kg de papa frita producida | Supuesto |
| 23 | Rendimiento por debajo de 24 % abre una revisión del lote | Supuesto |
| 24 | Salsas: 5 productos. Mostaza 3,75 kg (dato del dueño). Salsa de tomate 3,75 kg, mayonesa 3,6 kg, ajo 3,6 kg y picante 1 kg son supuestos | Dueño / Supuesto |
| 25 | Papas: 6 presentaciones más granel | Dueño |
| 26 | Gramajes de las papas: 20, 35, 60, 150, 250 y 400 g | Supuesto |
| 27 | Trazabilidad de empaque: código = lote + presentación (ej. L1105-P35) | Supuesto |
| 28 | Reposición controlada: se pide, se aprueba y luego se empaca | Dueño (flujo: supuesto) |
| 29 | Despachos: nota de entrega imprimible; flota de 2 camiones y 1 autobús; destinos salseras y distribuidores | Dueño |
| 30 | El envío de sal y bolsones de la línea de papas a la línea salsera se registra como transferencia interna (TR) | Dueño (forma: supuesto) |
| 31 | Cotejo producción vs compra: rendimiento por lote y por proveedor, y costo por kg útil | Dueño (indicador de costo: supuesto) |

## 3. Administración

| # | Decisión | Origen |
|---|---|---|
| 32 | Compras de MP en dos grupos: MP propia (papa cruda, papa seca) e insumos complementarios (sal, metabisulfito, aceite, azúcar, empaques, químicos, aditivos), cada uno de contado o a crédito | Dueño |
| 33 | Compras generales clasificadas por partidas contables: activo, pasivo o gasto; fijo o no fijo; tangible o intangible | Dueño |
| 34 | Catálogo de partidas propuesto. **1** Activo (circulante, fijo tangible, intangible). **2** Pasivo (circulante, no circulante). **6** Gastos (producción, flota, fijos) | Supuesto |
| 35 | Toda compra a crédito genera sola la cuenta 2.1.1 Cuentas por pagar. Las partidas de pasivo no se eligen al comprar | Supuesto |
| 36 | Al registrar una compra general se muestra su clasificación y el asiento (débito partida, crédito CxP, caja chica o banco) | Supuesto |
| 37 | Motivo de compra obligatorio, para el análisis "qué, a quién y por qué" | Supuesto |
| 38 | Plazos de cuentas por pagar: papa con abonos semanales; salsera, químicos y aceites a 20–25 días; sal y azúcar a 7 días | Dueño |
| 39 | El abono semanal de papa es 1/4 de la factura | Supuesto |
| 40 | Hortícola Valle Alto paga a 21 días | Supuesto |
| 41 | Tablero de CxP: vencido, vence hoy, esta semana, próximos 30 días, por proveedor, antigüedad, alarmas y calendario | Dueño |
| 42 | La alarma de CxP avisa 3 días antes del vencimiento | Supuesto (editable) |
| 43 | Puntaje de proveedor (0–100): a tiempo 20 %, merma 20 %, calidad 20 %, precio vs histórico 15 %, costo por kg útil 15 %, plazo 10 % | Supuesto |
| 44 | Recomendación según puntaje: 80 o más, mantener; 65 a 79, negociar; menos de 65, sustituir | Supuesto |
| 45 | Caja chica con fondo finito y editable (US$ 1.500) y umbral de US$ 100 para compras de contado | Dueño |
| 46 | Arqueo: efectivo + comprobantes + préstamos por cobrar = fondo, con alerta de faltante o sobrante | Dueño (fórmula con préstamos: supuesto) |
| 47 | Los préstamos salen de la caja chica y lo descontado por nómina regresa a la caja | Supuesto |
| 48 | Reponer la caja chica cuando quede menos del 30 % del fondo | Supuesto (editable) |
| 49 | La reposición se bloquea si hay gastos sin justificar o sin comprobante completo | Supuesto |
| 50 | Cada gasto exige factura o nota de entrega con número, proveedor, RIF, fecha y monto, más adjunto | Dueño |
| 51 | En el sistema funcional, el adjunto se sube al almacén de archivos de la plataforma si el visor tiene permiso; si no, solo se guarda el nombre y la pantalla lo avisa | Limitación conocida |
| 52 | Préstamos solo en días fijos del mes (1 y 15), con política editable: tope US$ 80, máximo 4 cuotas, 3 meses de antigüedad y un préstamo activo por empleado | Dueño (valores: supuesto) |
| 53 | El descuento por nómina se hace en Bs a la tasa del día de entrega | Supuesto, **[A CONFIRMAR]** |
| 54 | Recibo de préstamo imprimible | Dueño |
| 55 | Ventas: precio B si el cliente paga antes de 21 días; después, precio FULL | Dueño |
| 56 | Precio B = FULL menos 8 % | Supuesto |
| 57 | Crédito máximo a clientes: 30 días; pasado eso, la factura está vencida | Supuesto |
| 58 | Cliente inactivo: sin pedido en 30 días | Supuesto |
| 59 | Nómina por área con sueldos, extras, bonos y préstamos descontados; 58 trabajadores | Dueño (cifras: ejemplo) |
| 60 | Gastos fijos: gasoil, gasolina, alquiler, servicios. Gastos variables: repuestos y mantenimiento de flota y de planta | Dueño (servicios: supuesto) |
| 61 | Control de gestión: ventas por vendedor (día, semana, mes), inventario de MP, deudores y vencimientos, mejores y peores productos, gastos y nómina | Dueño |
| 62 | Manual de procedimientos con 8 procesos, cada uno con responsable, pasos, documentos y controles | Dueño |
| 63 | En el manual: pagos de CxP los martes y viernes; doble firma sobre US$ 1.000; visto bueno del dueño si el precio sube más de 5 % sobre el histórico | Supuesto |

## 4. Zonas grises (a confirmar con el dueño)

1. **Base del % de aceite.** ¿El 40–45 % es sobre la papa frita, sobre la papa cruda, o sobre el aceite repuesto en la freidora?
2. **Lotes y compras.** Hoy una compra puede alimentar varios lotes, como C-0409, que va a L-1105 y L-1111. Para medir con justicia el rendimiento por proveedor, conviene que cada lote use la papa de una sola compra.
3. **Papa seca.** No se mide su rendimiento. ¿Cómo entra al proceso: se mezcla con la papa fresca o va a otro producto?
4. **Tasa de los préstamos.** ¿El descuento usa la tasa del día de entrega o la del día de pago de nómina?
5. **Precio B.** ¿Cuánto vale el descuento del precio B y cuál es el plazo máximo de crédito a clientes?
6. **Quién valida.** ¿Administración y compras es una persona distinta del dueño? ¿Quién ocupa cada uno de los 9 roles? ¿Una persona puede tener varios roles?
7. **Salsera.** El dueño habla de la "salsera" como proveedor a 20–25 días y también como cliente (las salseras reciben despachos). ¿La línea salsera compra insumos a un proveedor externo de salsas, o se refiere a otra cosa?
8. **Etapas y nombres.** Faltan las etapas reales del proceso y los nombres reales de las 6 presentaciones.
9. **Arqueo.** ¿Los préstamos por cobrar cuentan dentro del fondo de caja chica, o el fondo se repone al prestar?

## 5. [NECESITA ACLARACIÓN]: sub-almacén 2 de Logística

El dueño no definió qué guarda. En la maqueta aparece con la marca visible [NECESITA ACLARACIÓN]. Hay dos hipótesis:

- **A. Empaques:** bolsas impresas y bolsones. Hoy se registran como insumo dentro del almacén de MP.
- **B. Producto listo para despacho:** pedidos armados por nota de entrega antes de cargar el vehículo.

## 6. Roles y matriz de permisos (supuesto, pendiente de confirmar con el dueño)

El dueño pidió segmentar los roles por área. La matriz la propuso el consultor y se puede editar en la pantalla **Roles y permisos**, que solo ve el Dueño. La matriz editada se guarda en la base compartida y no vuelve a la propuesta al recargar; el botón "Restaurar propuesta" la devuelve al valor inicial. La sección 7 reemplaza la lista de roles por módulo.

Hay cuatro niveles:
- **— Sin acceso:** el área aparece en la portada atenuada, con candado y el motivo.
- **Ver:** consulta.
- **Registrar:** carga datos.
- **Aprobar:** valida, paga o autoriza.

| Rol | Qué hace |
|---|---|
| Dueño | Todo, con nivel Aprobar. Es el único que ve Control de gestión y Roles y permisos |
| Administración y compras | Valida recepciones (Aprobar), registra compras generales y pagos de CxP (Registrar) |
| Custodio de caja chica | Gastos de caja chica, préstamos y políticas (Registrar) |
| Recepción | Registra recepciones; ve el almacén de MP y la bandeja de compras |
| Jefe de producción | Cierra lotes (Registrar), aprueba reposiciones de empaque (Aprobar), ve el cotejo |
| Empaque y despacho | Empaque, producto terminado, bultos de logística y despachos (Registrar) |
| Ventas (vendedor) | Ve producto terminado, empaque, despachos y ventas |
| Cobranza | Ventas y cuentas por cobrar (Registrar) |
| Nómina y RRHH | Nómina (Registrar); ve los préstamos |

Matriz propuesta. Pantallas en filas, roles en columnas. El Dueño aprueba todo; el Mapa de procesos lo ven todos.

| Pantalla | Adm. y compras | Custodio | Recepción | Jefe prod. | Empaque y desp. | Ventas | Cobranza | RRHH |
|---|---|---|---|---|---|---|---|---|
| Resumen de planta | Ver | — | Ver | Aprobar | Ver | — | — | — |
| Recepción | Ver | — | Registrar | Ver | — | — | — | — |
| Almacén MP | Ver | — | Ver | Ver | — | — | — | — |
| En proceso | — | — | — | Registrar | Ver | — | — | — |
| Producto terminado | — | — | — | Ver | Registrar | Ver | — | — |
| Logística | — | — | Ver | Ver | Registrar | — | — | — |
| Producción y rendimiento | — | — | — | Registrar | Ver | — | — | — |
| Empaque y stock | — | — | — | Aprobar | Registrar | Ver | — | — |
| Despachos | — | — | — | Ver | Registrar | Ver | — | — |
| Cotejo | Ver | — | — | Ver | — | — | — | — |
| Control de gestión | — | — | — | — | — | — | — | — |
| Compras de MP | Aprobar | — | Ver | — | — | — | — | — |
| Compras generales | Registrar | Ver | — | — | — | — | — | — |
| Análisis de compras | Ver | — | — | — | — | — | — | — |
| Cuentas por pagar | Registrar | — | — | — | — | — | — | — |
| Caja chica | Ver | Registrar | — | — | — | — | — | — |
| Préstamos | — | Registrar | — | — | — | — | — | Ver |
| Políticas | Ver | Registrar | — | — | — | — | — | — |
| Ventas y cobranza | — | — | — | — | — | Ver | Registrar | — |
| Nómina y gastos | Ver | — | — | — | — | — | — | Registrar |
| Manual | Ver | Ver | Ver | Ver | Ver | Ver | Ver | Ver |

Permiso mínimo que pide cada acción:

| Nivel | Acciones |
|---|---|
| **Registrar** | Guardar recepción, registrar pago o abono, cerrar lote, pesar bulto, registrar compra general, registrar gasto y pedir reposición de caja, entregar préstamo, guardar políticas |
| **Aprobar** | Validar compra, aprobar reposición de empaque |

Si el rol no alcanza, el botón aparece con candado y un aviso explica el permiso que se tiene.

**A confirmar:**
- ¿El vendedor debe ver solo sus clientes y sus ventas? En la maqueta ve todo lo de ventas.
- ¿Cobranza puede registrar cobros, o solo ver?
- ¿El custodio de caja chica puede cambiar las políticas, o solo proponerlas al dueño?
- ¿Hay más roles, por ejemplo choferes o un supervisor de la línea salsera?

## 7. Sistema funcional: persistencia, acceso y datos

**Persistencia.** Todo se guarda en la base compartida del Artifact (capacidad `db`): recepciones, compras, cuentas por pagar, almacenes, pagos, caja chica y arqueos, préstamos y recibos, lotes, empaque, bultos, notas de entrega, políticas, matriz de roles, tasa de cambio y catálogos. Los datos derivados (saldos, stock, vencimientos) se calculan al mostrar, no se guardan. Si la base no está disponible, se usa un respaldo en el navegador solo para pruebas locales.

**Sin autenticación (decisión del dueño).** No hay usuarios ni contraseñas. El rol es solo un selector, con un aviso discreto en la aplicación. Cualquiera con el enlace puede cambiar de rol y, por tanto, ver o registrar lo que ese rol permite. El control real de quién abre el enlace es el menú Compartir de la plataforma.

**Datos.** La base arranca con datos de ejemplo. Solo el Dueño ve "Borrar datos de ejemplo / empezar en limpio" (doble confirmación; deja tasa, políticas, matriz, quién recibe, productos y partidas) y "Cargar datos de ejemplo". En modo limpio hay que dar de alta proveedores y personal en Catálogos antes de recibir. Moneda: USD con equivalente en Bs; la tasa se edita y se guarda; la nómina es en Bs.

**Entrada y visibilidad por módulo (SUPUESTO, pendiente de confirmar).** Portada con dos puertas, PRODUCCIÓN y ADMINISTRACIÓN; luego se elige el rol de ese módulo y se entra a sus pantallas. Botones "Cambiar rol" e "Inicio". El Dueño aparece en ambas puertas. La última elección se recuerda solo en el navegador. Módulos visibles por rol, editables por el Dueño:

| Rol | Módulos |
|---|---|
| Dueño | Producción y Administración |
| Administración y compras | Administración |
| Custodio de caja chica | Administración (caja chica, préstamos, políticas, manual) |
| Recepción | Producción |
| Jefe de producción | Producción |
| Empaque y despacho | Producción (empaque, almacén PT, logística, despachos) |
| Ventas (vendedor) | Administración |
| Cobranza | Administración |
| Nómina y RRHH | Administración |

Una pantalla fuera de los módulos del rol redirige a su inicio con aviso "sin acceso".

**Limitaciones.**
- Ventas, cobranza, nómina, gastos fijos y cuentas por cobrar son cifras de ejemplo, sin captura.
- Las líneas de salsas no tienen captura. Bolsas y bolsones no se reciben todavía.
- No hay tablero por área: Control de gestión es solo del Dueño.
- El vendedor ve toda la pantalla de ventas y no captura pedidos.
- La matriz se guarda completa: si dos Dueños la editan a la vez, gana el último.
- Las pantallas Roles y Datos son solo del Dueño y están bajo Administración.

## 8. Gráficas de barras para reportes (decisión del dueño)

- Librería: Chart.js 4.4.1 desde cdnjs. Solo gráficas de barras, en todas las pantallas que tengan una comparación, un reporte o una medición (inventario completo en `plan.md`).
- Control único Diario | Semanal | Mensual, con rango navegable (‹ ›) y comparación contra el periodo anterior: barras agrupadas actual vs anterior. Diario = 7 días vs 7; Semanal = 4 semanas vs 4; Mensual = 2 meses vs 2 (el mes en curso se marca "(en curso)" y es parcial).
- Los datos se calculan desde los registros guardados; no se guardan totales.
- Cada gráfica tiene tabla alternativa, estado vacío, tooltip con US$ y Bs a la tasa vigente y se redibuja al cambiar tema, rol o tasa. En el celular (375 px) la leyenda va debajo y no hay scroll horizontal.
- Cada rol ve solo las gráficas de su área, según la matriz de permisos de la sección 6.
- Colores de la marca: actual en azul de marca, anterior en gris azulado, segunda medida en verde, crítico en rojo.
- Ventas, cobranza, precio B vs FULL, nómina y gastos fijos/variables no tienen captura todavía: se dibujan con datos de ejemplo sembrados y llevan la marca "Datos de ejemplo".
- Al ejemplo se le agregó historial (más de 8 semanas y 3 meses) para que las comparaciones tengan sentido. "Empezar en limpio" lo borra todo y las gráficas muestran estado vacío.
- Limitaciones conocidas: los totales de ventas del historial no coinciden con las cifras antiguas de vendedores del Control de gestión (ambas son ejemplo independiente); cobranza, stock y aging son fotos de hoy sin comparación contra periodo anterior (los cobros aún no se capturan); producción diaria es escasa (2 a 3 lotes por semana).

## 9. Mermas por proceso (decisión del dueño)

**Qué hace:** pantalla «Mermas por proceso» (Producción › Planta) con captura por etapa, reporte (tabla por etapa, causas en Pareto, lotes y proveedores con más merma, registros recientes) y 9 gráficas con el control Diario/Semanal/Mensual. Cada pantalla de etapa lleva una tarjeta «Mermas de esta etapa» con el semáforo y un botón para registrar.

**Etapas:** Recepción · Almacén de materia prima · Pelado y lavado · Corte · Freído · Escurrido y sazonado · Descarte de producto quebrado · Salsa (mezcla y cocción) · Salsa (envasado) · Empaque · Almacén de terminado y logística · Despachos (devoluciones y daños).

**Quién registra (supuesto):** Jefe de producción y Dueño, todas las etapas y aprueban; Recepción, Recepción y Almacén de MP; Empaque y despacho, Empaque, Almacén de terminado y Despachos; Administración solo ve, y solo si el Dueño le habilita el módulo Producción. Lo que registra un rol sin nivel de aprobar queda «pendiente» hasta que el Jefe de producción lo aprueba; mientras tanto ya cuenta en los reportes.

**Causas (editables):** Deterioro, Error de proceso, Equipo, Calidad de proveedor, Humedad, Manipulación, Otro.

**Cálculo:**
- Merma % de una etapa = perdido ÷ lo que entró a esa etapa. Valor por defecto del semáforo: dentro de la tolerancia, «alerta» hasta 25 % por encima, «fuera» más allá (editable).
- Merma acumulada del lote = 1 − producto de lo que sobrevive en cada etapa (de Recepción a Despacho).
- Rendimiento neto = rendimiento medido al cerrar el lote × lo que sobrevive después de pesar la papa frita (sazonado, quebrado, empaque, almacén, despacho). Las pérdidas de pelado, corte y freído ya están dentro del rendimiento medido; se muestran como «rendimiento perdido» en puntos.
- Costo = kg × costo promedio: la papa, lo pagado por el lote (costo por kg recibido); lo posterior, costo por kg útil del lote; la salsa, 1,20 US$/kg (supuesto).
- La diferencia de peso de Recepción no se escribe otra vez: sale de cada recepción y se une a este reporte. Si la compra se pagó sobre kg recibidos, esa merma cuenta como kg pero no cuesta US$. Las «bolsas dañadas» del registro de Empaque crean solas su merma (no se duplican).
- Al registrar mermas de Almacén de MP o de terminado en unidades, se descuenta del stock.

**Tolerancias supuestas (% perdido ÷ entrada de la etapa), A CONFIRMAR con el dueño:** Recepción 2 (la tolerancia de peso que ya existía) · Almacén MP 1 · Pelado 8 · Corte 3 · Freído 4 · Sazonado 2 · Quebrado 1,5 · Salsa mezcla 2 · Salsa envasado 1,5 · Empaque 1,5 · Almacén terminado 0,5 · Despachos 0,5. Se editan en Políticas (Dueño) y en la propia pantalla de mermas (Dueño y Jefe de producción).

**Necesita confirmación del dueño:** porcentajes reales de tolerancia por etapa; si las causas son las correctas; quién aprueba; costo de la salsa por kg; si el pelado y corte deben medirse como «descarte» o incluir cáscara; si Administración debe ver la pantalla.

**Datos de ejemplo:** versión de historial 3; mermas coherentes con los lotes, compras y empaques sembrados (el proveedor Hortícola Valle Alto pierde más). «Empezar en limpio» las borra y la pantalla muestra estados vacíos.

## 10. Marca, caja chica, WhatsApp, personal y exportación (decisión del dueño)

**Marca (ajuste final):** tema claro por defecto: fondos y tarjetas blancos; rojo #C92121 en cabecera, botones principales y acentos; amarillo #F2B72E bien visible (franjas de encabezado de sección, chips, botones secundarios, fila o pestaña activa, KPI destacados, iconos de módulo, bordes de tarjetas importantes); texto gris casi negro; verde y ámbar solo para semáforos; sin azul marino ni naranja. Logo en la cabecera, la portada, notas, recibos y reportes impresos. Tipografías: Alfa Slab One (títulos), Inter (cifras y texto), Lobster (acentos). El modo oscuro automático se desactivó (siempre claro).

**Caja chica:** el único comprobante es la **nota de entrega** (ya no se ofrece «Factura»; los gastos antiguos se muestran como nota de entrega).

**WhatsApp:** en cuentas por cobrar y clientes inactivos, botón que abre wa.me con un mensaje listo, y «Ver todos». El teléfono vive en el cliente (guardable por el rol permitido). Sin teléfono, el botón avisa. No se envía nada solo: la persona toca «enviar» en WhatsApp.

**Personal y nómina:** alta, edición y baja de empleados (la baja la pide Recursos Humanos y la aprueba el Dueño; con préstamo activo no se retira; se archivan, no se borran, y el Dueño restaura). Altas y archivo de insumos, presentaciones y salsas (con existencias no se archiva) y de proveedores. Pago por hora o por día con tarifa en Bs. Asistencia por quincena (días u horas, horas extra, bonos) y nómina calculada por área y por persona, con recibo de pago. Quincena: 1 al 15 y 16 al fin de mes.
- Supuestos A CONFIRMAR por el Dueño (Nómina › Reglas de pago): recargo de hora extra (hoy 0 %), deducciones de ley (hoy 0 %), jornada completa de 8 horas. No se inventó ningún porcentaje legal.
- El préstamo se descuenta solo de la quincena en curso; las anteriores usan lo guardado.
- Datos de ejemplo: 24 empleados ficticios y 8 quincenas de asistencia (historial versión 5).

**Exportación de reportes (un solo componente):** barra «Exportar este reporte» en cada pantalla de reporte. Periodo: un día, una semana (lunes a domingo), un mes o un rango. Segmentable por área (Producción, Empaque, Línea salsera, Almacén, Logística, Administración y ventas) y limitada a lo que el rol puede ver (Dueño ve 14 conjuntos; Ventas y Cobranza, 1). Cada archivo trae periodo, área, tasa usada, rol y fecha de generación.
- CSV: UTF-8 con BOM, separador punto y coma, coma decimal (Excel en español).
- Impresión: hoja con logo, o «Guardar como PDF» desde el cuadro de impresión del navegador. Notas de entrega, recibos de préstamo y recibos de pago tienen botón «Imprimir o guardar PDF».
- En el Artifact, la descarga e impresión dependen del permiso del visor; la impresión real a papel o PDF se valida en la versión de Cloudflare.
- Los lotes de salsa y las cuentas por cobrar no llevan fecha de periodo: se exportan completos (se avisa en pantalla).

**Corrección:** la ventana emergente cerrada seguía cubriendo la pantalla (oscurecía y bloqueaba toques). Se arregló con `[hidden]{display:none}`.

## 11. Versión en Cloudflare, tipografía y calendario (fase B)
- Versión pública en https://elmana-jl.talosbot.workers.dev (Worker + D1 + frontend estático). Acceso abierto con aviso "datos de ejemplo — no cargar datos reales"; el rol es solo un selector (sin usuarios ni contraseñas). Riesgo asumido: cualquiera con el enlace puede ver y modificar los datos de ejemplo.
- Los adjuntos guardan solo el nombre (sin R2). Se mantienen los botones de borrar y recargar ejemplo.
- Tipografía: Inter 700 con cifras tabulares para todas las cifras y montos; Alfa Slab One solo en títulos; Lobster solo en acentos. Las tarjetas KPI ajustan su tamaño con clamp() y la rejilla reparte sin tarjeta huérfana.
- Calendario: un solo componente (calendar.js) usado en Cuentas por pagar y Cuentas por cobrar. Vista mensual (lun–dom) con navegación y "Hoy"; en móvil se muestra como lista. Estados: vencido, vence hoy, próximo, pagado/cobrado (con icono y texto, no solo color). En cobrar hay dos tipos de evento: vencimiento del crédito (supuesto: 30 días, por confirmar) y último día del precio B (21 días). Se exporta el mes a CSV/PDF.

## 12. Solo Cloudflare: notas de entrega, altas y ediciones, inventario (el Artifact de Claude no se toca; queda como demo, versión 8)
- Ventas, cobranza, cuentas por cobrar, calendario, WhatsApp, exportaciones y caja chica usan "nota de entrega" (prefijo N-); "factura" queda solo como "factura de compra (proveedor)" en recepción, compras, cuentas por pagar y manual de esas áreas. Los pagos y préstamos usan "recibo".
- Clientes: pantalla propia (alta, edición, archivo). El Dueño es el único que cambia tipo de precio (B/FULL) y crédito. Proveedores: edición (la condición y el plazo de pago los cambia solo el Dueño; el plazo de entrega lo edita Administración). Insumos, presentaciones y salsas: edición. Personal: la tarifa de pago la cambia solo el Dueño. Todo cambio queda en "Historial de cambios" (quién, qué y cuándo).
- Inventario actual: una pantalla con todos los almacenes; mínimos y máximos editables por el rol del almacén; alertas por rol (insignia, tarjeta en el inicio); solicitudes de compra a Administración. Supuestos por confirmar: máximo de ejemplo = 4 veces el mínimo; plazo de entrega de ejemplo (papa 2, insumos 5, generales 7 días); reposición de producto terminado = 2 días.
