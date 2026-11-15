# Informe UAT-A (Dueño, Ventas, Cobranza, Administración)

Entorno: http://localhost:8799 (local). Datos de prueba con prefijo "UATA-" (clientes UATA-Cliente Lara id 31 y UATA-Sin Lista Zulia id 32; documentos NE-000014, NE-000015, FA-000015).
Solo se identifica y describe; no se juzga.

## Resumen (se completa al final)
Totales aproximados (filas de las tablas): pasó 67 (incluye los "pasó con observación"); falló 11; no probado 4; observaciones sueltas unas 29.

Fallas principales (de mayor a menor importancia):
1. Media: el documento (nota/factura) no muestra kg, número de cuenta del banco ni tasa/Bs (2.14).
2. Media: el servidor acepta una venta sin banco si se llama directo a la API (2.11b).
3. Media: al recargar la página a mitad de venta el pedido se pierde sin aviso (2.16/6.3).
4. Media: "Registro de ventas" muestra cifras de ejemplo que no son los datos reales (2.19).
5. Media: "Quién debe" no se refresca sola cuando otra persona cambia datos; hay que recargar (4.2).
6. Media: bancos aceptan letras en el número de cuenta (5.9) y nombres sin límite (5.10).
7. Media: cantidad "1.5" se convierte en 15 sin avisar (2.7).
8. Media: cobro con fecha pasada deja la pantalla con filas en blanco; se usó la misma tasa del día 16/11 para un pago del 10/11 (3.6b, 3.6c).
No probado: venta "Pagó ahora" completa (3.13), pestaña "Estados y listas" en pantalla (5.16), bancos sugeridos (5.12), nombre de cliente muy largo (6.9).

---

## Sección 1. Puestos y menús

| # | Prueba | Esperado | Pasó | Resultado | Gravedad |
|---|---|---|---|---|---|
| 1.1 | Entrar como Ventas | Solo ve "Ventas" | Menú: Hacer una venta, Clientes y catálogo, Quién debe, Cobros hechos, Registro de ventas, Lista de clientes, Pedidos de clientes | PASÓ | - |
| 1.2 | Entrar como Cobranza | Solo Administración (cobro, cobros hechos, quién debe, pagos por revisar, plazos, comisiones) | Coincide | PASÓ | - |
| 1.3 | Entrar como Administración | Administración completa (compras, cobrar, precios, bancos, personal) | Coincide (incluye Bancos de la empresa y Precios) | PASÓ | - |
| 1.4 | Entrar como Dueño | 7 pantallas (Gerencia, Ventas, Administración, Producción, Despacho, Logística, Cliente) | Coincide | PASÓ | - |
| 1.5 | Ventas escribe en la barra la dirección de pantallas ajenas (#v-cobro, #p-bancos, #gerencia, #p-aprobar, #compras-mp, #planta) | Lo regresa a su pantalla | Muestra "Hacer una venta" | PASÓ | - |
| 1.6 | Permisos en el servidor (curl con x-rol) | Ventas/Cobranza no aprueban precios ni ven auditoría | Ventas: precios/pendientes 403, auditoría 403, comisiones 403. Cobranza: precios 403. Adm: precios 200, auditoría 403. Dueño: todo 200. RRHH: clientes/pagos/deuda 403 | PASÓ | - |
| 1.7 | Cambiar rol | Vuelve a "¿Quién eres?" | Funciona; aviso "Entraste como ..." | PASÓ | - |
| 1.8 | Pantalla "¿Quién eres?" | Texto claro | Dice "elegir un rol solo cambia lo que ves en pantalla, no es seguridad. Quien tenga el enlace puede cambiar de rol". La tarjeta de Ventas dice "en la versión completa registrará los pedidos" aunque ya los registra | PASÓ con observación (texto desactualizado) | Baja |
| 1.9 | Ventas lee la lista de bancos con números de cuenta por API (GET /bancos = 200) | Reservado a quien cobra | Ventas y Cobranza reciben cuentas | OBSERVACIÓN | Baja |

Pasos para repetir 1.5: entrar como Ventas, cambiar la dirección a `#p-bancos`.

---

## Sección 2. Venta completa (rol Ventas)

| # | Qué hice | Esperaba | Qué pasó | Resultado | Gravedad |
|---|---|---|---|---|---|
| 2.1 | Buscar cliente: "abasto", "ABASTO LUNA", "bodega esquina", "Abastó", "  luna  ", RIF "J-00000101", "j00000101", "00000103" | Encuentra sin importar mayúsculas, tildes, espacios, guiones del RIF | Encontró en todos los casos. "zzz" muestra "No hay clientes con ese texto." | PASÓ | - |
| 2.1b | API /clientes?q=UATA-Cliente (con guion en el nombre) | Encontrar | Devuelve lista vacía (la pantalla sí lo encuentra). Con "UATA" o "Sin Lista" sí encuentra | FALLÓ (solo API) | Baja |
| 2.2 | Cliente nuevo: guardar vacío | Aviso | "Elige el estado del cliente: de ahí sale su lista de precios." | PASÓ | - |
| 2.3 | Cliente nuevo: con estado pero sin nombre | Aviso | "La razón social es obligatoria." | PASÓ | - |
| 2.4 | Cliente nuevo completo (Lara, Vendedor 1) | Se crea con lista A | Creado id 31, lista A, vendedor 7 | PASÓ | - |
| 2.5 | Cliente en estado "sin precios" (Zulia) | No deja vender, explica | Aviso rojo "Todavía no hay lista de precios para este estado. Pídele al Dueño que la asigne."; sin botones +/-; API responde SIN_LISTA | PASÓ | - |
| 2.6 | Botones + y cantidad escrita (2 bultos de 400 g, 3 de 1 kg) | Subtotal 324,68; IVA 16% 51,95; total 376,63; Bs a tasa 914,02 = 344.248,03 | Coincide con el cálculo | PASÓ | - |
| 2.7 | Letras y signos en cantidad | Rechaza | Letras se borran. "-5" queda 5, "1.5" queda 15, "5e2" queda 52 (el punto se ignora) | PASÓ con observación: "1.5" se convierte en 15 sin avisar | Media |
| 2.8 | Cantidad mayor que el stock (99999) | Tope y aviso | Se ajusta a 415 y avisa "Solo hay 415 bultos en existencia de ...". El aviso sigue visible después de cambiar a cantidades válidas (7, 0) | PASÓ con observación | Baja |
| 2.9 | Producto sin inventario (salsas) | No deja | Tarjeta "Sin existencias" y bloqueada; API: SIN_STOCK "hay 0 bultos" | PASÓ | - |
| 2.10 | API: cantidad negativa, decimal, sin líneas, rol RRHH, sin rol | Rechaza | Todas rechazadas con mensaje | PASÓ | - |
| 2.11 | Generar sin elegir banco (pantalla) | Pide banco | Aviso "Elige el banco en «Método de pago» antes de generar el documento." y marca el campo | PASÓ | - |
| 2.11b | Generar sin banco por API directa | Rechaza | Crea NE-000015 sin método de pago (la regla solo está en la pantalla) | FALLÓ | Media |
| 2.12 | Nota de entrega a crédito con banco Banesco, doble clic en Generar | Un solo documento | Solo NE-000014 (no hubo duplicado). Existencias bajaron 310→308 y 460→457 | PASÓ | - |
| 2.13 | Factura a crédito (4 bultos 200 g, Mercantil) | FA con IVA | FA-000015, subtotal 122,00, IVA 19,52, total 141,52 | PASÓ | - |
| 2.14 | Revisar el documento | Bultos, kg, banco+cuenta, tasa, envío | Muestra: cliente, RIF, vendedor, ubicación de envío, bultos × precio, banco (solo el nombre), IVA, total, saldo. NO muestra kg, número de cuenta ni tasa/Bs | FALLÓ | Media |
| 2.15 | Texto del documento | Claro | Dice "Membrete sin completar (RIF y dirección en ajustes)" y "Formato fiscal por confirmar con el contador" | Observación | Baja |
| 2.16 | Recargar la página a mitad de venta | Aviso o conservar | El pedido se pierde sin aviso (el puesto se conserva) | FALLÓ (usabilidad) | Media |
| 2.17 | Cambiar de cliente con productos cargados | Aviso | El pedido se vacía sin preguntar | Observación | Baja |
| 2.18 | "Pagó ahora" como Ventas | No disponible para Ventas | Solo aparece "A crédito" (Pagó ahora requiere permiso de cobro) | PASÓ (se prueba en sección 3 con Cobranza) | - |
| 2.19 | Pantalla "Registro de ventas" | Coincide con la base | Muestra cifras de ejemplo fijas (US$ 169.300, 15 vendedores, clientes "Andrés/Beatriz...") distintas a la base real (3 vendedores). Dice "datos de ejemplo" | FALLÓ (confusión) | Media |
| 2.20 | Aviso "6 sugerencias. Usa las flechas y Enter." | Oculto | Es texto de lectores de pantalla, no visto en pantalla | PASÓ | - |

Cruce con la base: NE-000014 total_cents 37663, IVA 5195, subtotal 32468, método Banesco, envío Lara + dirección, lista A, saldo 37663: coincide con lo mostrado.


---

## Sección 3. Cobros (Cobranza y Dueño)

| # | Qué hice | Esperaba | Qué pasó | Resultado | Gravedad |
|---|---|---|---|---|---|
| 3.1 | Registrar pago sin llenar nada, luego solo monto | Avisos claros | "Escribe el monto en bolívares." y "Escribe el banco y el número de referencia." | PASÓ | - |
| 3.2 | Letras en "Monto recibido (Bs)" | Rechazar | El campo acepta "abc" y escribe; al registrar avisa que escriba el monto | PASÓ con observación (el campo no filtra letras) | Baja |
| 3.3 | Tasa BCV | Sin campo manual | No hay campo; se ve "Tasa BCV: 914,02 Bs por US$ 1 · del 16/11/2026". A la API se le mandó tasa=5 y la ignoró (usó 914,0218) | PASÓ | - |
| 3.3b | La tasa dice "del 16/11/2026" siendo hoy 14/11/2026 | Fecha entendible | Una persona puede dudar por qué es una fecha futura (BCV publica la del próximo día hábil) | OBSERVACIÓN | Baja |
| 3.4 | Pago parcial: Bs 91.402,18 (US$ 100) a NE-000014 con "Repartir el pago", doble clic en Registrar | Un solo pago; deuda baja 100 | RC-00019, un solo recibo. Deuda 575,34 a 475,34; saldo NE-000014 276,63 | PASÓ | - |
| 3.5 | Misma referencia y mismo banco (Banesco 9990001) | Bloquear | Ventana "Referencia repetida: no se guardó" con recibo existente, cliente, fecha, monto y botón "Ver el pago existente" | PASÓ | - |
| 3.6 | Fecha pasada (10/11/2026) | Pide PIN | Ventana "PIN de gerencia". PIN 0000: "PIN de gerencia incorrecto." PIN 4321: pago RC-00020 registrado (US$ 50) | PASÓ | - |
| 3.6b | Tras el pago de fecha pasada | Mostrar notas | Pantalla queda en la fecha 10/11 y las filas de notas salen sin número y con "La fecha de pago es anterior a la emisión." Para seguir hay que volver a poner la fecha de hoy. El pago quedó "sin aplicar" (saldo a favor) | OBSERVACIÓN: confuso | Media |
| 3.6c | Tasa usada en pago de fecha pasada | Tasa del día de esa fecha | El pago del 10/11 usó la misma tasa 914,0218 (la del 16/11) | OBSERVACIÓN / no se pudo comprobar si existe tasa histórica | Media |
| 3.7 | Pago completo NE-000015 (Bs 52.272,90 = US$ 57,19) | Nota queda pagada | RC-00021; NE-000015 pagada y se generó FA-000016 (la nota se cobra emitiendo factura). Deuda cliente 418,15 | PASÓ | - |
| 3.7b | Factura FA-000016 en la API | Saldo 0 | estado PAGADO pero saldo_cents 5719 y pagado 0 (la deuda total sí está bien: 418,15) | OBSERVACIÓN | Baja |
| 3.8 | Anular pago sin motivo (Dueño) | Pide motivo | "Escribe el motivo de la anulación." | PASÓ | - |
| 3.9 | Anular con motivo RC-00022 (sin aplicar) | Queda ANULADO | Quedó ANULADO con motivo | PASÓ | - |
| 3.10 | Anular RC-00019 (aplicado, API) | Deuda vuelve a subir | Deuda 418,15 a 518,15 (= 376,63 + 141,52); NE-000014 sin abonos | PASÓ | - |
| 3.11 | Cobranza intenta anular | No puede | Pantalla sin botón "Anular"; API: "Solo el Dueño anula pagos." | PASÓ | - |
| 3.12 | Recibo RC-00022 | Datos completos | Banco, referencia, monto Bs, tasa, equivalente US$, recibido por | PASÓ | - |
| 3.13 | "Pagó ahora" en la venta | Disponible para Cobranza/Adm/Dueño | Solo se revisó en el código (no aparece a Ventas); NO se ejecutó una venta "Pagó ahora" completa | NO PROBADO (falta de tiempo) | - |
| 3.14 | Tabla de notas pendientes en 1366 | Todo visible | La tabla tiene barra horizontal y la última columna ("Falta / Aplicar este pago") queda parcialmente fuera hasta desplazar | OBSERVACIÓN | Baja |

Nota de herramienta: al cambiar de puesto con comandos de programa a veces no cambiaba; con clic real sí funcionó (no se considera falla del sistema).

---

## Sección 4. Cuentas por cobrar ("Quién debe")

| # | Qué hice | Esperaba | Qué pasó | Resultado | Gravedad |
|---|---|---|---|---|---|
| 4.1 | Abrir "Quién debe" (Dueño) y comparar con la API /deuda | Mismas cifras | Tras recargar: total US$ 1.026,11, 6 clientes, por vendedor (V1 955,81 con 5 clientes; V2 70,30) y por zona (Lara 527,20; Carabobo 278,61; Aragua 120; D. Capital 70,30; Yaracuy 30) coinciden con la API | PASÓ | - |
| 4.2 | Anulé un pago por API (sin usar la pantalla) con la pantalla abierta | La pantalla se actualiza | Siguió mostrando US$ 983,30 (dato anterior) hasta recargar la página; ni cambiar de pantalla la refrescó | FALLÓ / OBSERVACIÓN (no se refresca sola; cambios hechos por otra persona no se ven hasta recargar) | Media |
| 4.3 | Filtrar por vendedor (V2) | Solo sus clientes | US$ 70,30, 1 cliente | PASÓ | - |
| 4.4 | Buscar "luna", "LUNA", "j-00000101", "00000101", "sol", "bodega", "uata", "FA-000015" | Filtra por nombre, RIF, nota o factura | Todas filtran bien (FA-000015 muestra el cliente); "zzzz" muestra 0 clientes. Cada búsqueda tarda cerca de 1 a 2 segundos | PASÓ | - |
| 4.5 | Buscar RIF sin guiones "J00000101" y "sín rif" | Encontrar | No encuentra (en Ventas sí encontraba "j00000101") | OBSERVACIÓN: criterio distinto entre pantallas | Baja |
| 4.6 | Con búsqueda sin resultados | Mensaje | Muestra "US$ 0,00 · 0 cliente(s)" sin frase explicativa | OBSERVACIÓN | Baja |
| 4.7 | Aviso "Los días de alerta no están definidos: el Dueño puede fijarlos en Clientes, catálogo y ajustes..." | Entendible | Entendible; apunta a pantalla del Dueño | PASÓ | - |
| 4.8 | Filtro "Todos" del vendedor | Muestra todos | Funciona con selección real; la opción "Todos" no tiene valor propio (vacía) | PASÓ | - |

---

## Sección 5. Administración: precios, bancos, estado del cliente

| # | Qué hice | Esperaba | Qué pasó | Resultado | Gravedad |
|---|---|---|---|---|---|
| 5.1 | Precios por lista (Administración): pantalla | Ver lista A/B con contado y crédito, Bs a tasa de hoy | Coincide con la base (por ej. 200 g crédito US$ 30,50 = Bs 27.877,66) | PASÓ | - |
| 5.2 | Cambio de precio con precio vacío / letras / -5 / 0 / número enorme | Avisos | "Escribe el precio por bulto."; "El precio por bulto debe ser un número mayor que cero."; "Ese precio es demasiado alto: revísalo." (el campo acepta teclear letras y avisa al enviar) | PASÓ | - |
| 5.3 | Administración pide cambiar 200 g crédito lista A a US$ 31,50 | Queda pendiente; sigue vigente el precio anterior | Aviso "Cambio de precio enviado al Dueño para aprobar. Mientras tanto sigue vigente el precio anterior."; la venta siguió usando 30,50; contador de pendientes = 1 | PASÓ | - |
| 5.4 | Administración y Ventas intentan aprobar o cambiar precio directo (API) | Rechazo | Adm: "Solo el Dueño aprueba o rechaza cambios de precio."; Ventas: "Solo el Dueño y Administración pueden colocar o cambiar precios." | PASÓ | - |
| 5.5 | Dueño aprueba en "Precios por aprobar" | Precio nuevo rige | "Cambio aprobado: el precio nuevo ya rige."; el cliente ve 31,50; lista de pendientes queda vacía con texto claro | PASÓ | - |
| 5.6 | Restaurar el precio (Dueño, por API) | Vuelve a 30,50 | Quedó en 30,50 (los datos de ejemplo no quedaron alterados) | PASÓ | - |
| 5.7 | Bancos: agregar sin nombre | Aviso | "Escribe el nombre del banco." | PASÓ | - |
| 5.8 | Bancos: nombre repetido (Banesco, "banesco ") | Bloquear | "Ya existe un banco con ese nombre y esa moneda." en ambos | PASÓ | - |
| 5.9 | Bancos: número de cuenta con letras ("abc") | Rechazar | Se guardó "abc" como número de cuenta | FALLÓ | Media |
| 5.10 | Bancos: nombre de más de 300 caracteres | Límite | Se guardó sin límite; la fila de la tabla crece mucho | FALLÓ | Baja |
| 5.11 | Editar banco y Desactivar | Cambia; el banco desactivado no se puede elegir | "Banco actualizado." y "Banco desactivado: ya no se puede elegir, pero los cobros anteriores conservan su nombre." (claro). Ventas ve 10 bancos activos | PASÓ | - |
| 5.12 | Bancos sugeridos | Botones para agregar con un clic | No apareció la sección porque los 10 bancos ya existen (queda sin probar) | NO PROBADO | - |
| 5.13 | Tabla de bancos con pantalla de 1089 px | Se lee completa | El número de cuenta y el titular quedan en columnas cortadas y hay que desplazar a la derecha; filas muy altas | OBSERVACIÓN | Baja |
| 5.14 | Estado del cliente: Administración intenta asignar lista a Zulia | Solo Dueño | "Solo el Dueño asigna listas de precios a los estados." | PASÓ | - |
| 5.15 | Dueño asigna Zulia a lista A (API) | El cliente de Zulia pasa a poder comprar | Cliente UATA-Sin Lista queda con lista A y precio 49,30; al quitar la lista vuelve a "sin precios". Cambio inmediato sin aprobación (esperado para el Dueño) | PASÓ | - |
| 5.16 | Pestaña "Estados y listas" por pantalla | Ver y cambiar | La pestaña no abrió con comandos del programa y se agotó el tiempo; solo se probó por API | NO PROBADO en pantalla | - |
| 5.17 | Datos de prueba que quedaron | Informar | Bancos UATA-Banco Prueba editado y UATA-Banco Largo (desactivados, no se pueden borrar desde la pantalla) | INFORMATIVO | Baja |

---

## Sección 6. Errores humanos

| # | Qué hice | Esperaba | Qué pasó | Resultado | Gravedad |
|---|---|---|---|---|---|
| 6.1 | Doble clic en "Generar nota de entrega" | Un solo documento | Un solo NE-000014 | PASÓ | - |
| 6.2 | Doble clic en "Registrar pago" | Un solo pago | Un solo RC-00019 | PASÓ | - |
| 6.3 | Recargar la página a mitad de venta | Aviso o conservar el pedido | El pedido se pierde sin aviso (mantiene el puesto) | FALLÓ | Media |
| 6.4 | Letras en cantidad de bultos | Rechazar | Las letras se borran; "1.5" se convierte en 15; "5e2" en 52 | PASÓ con observación | Media |
| 6.5 | Letras en monto Bs y en precio nuevo | Aviso | Avisan al enviar (no filtran al teclear) | PASÓ | - |
| 6.6 | Letras en número de cuenta de banco | Rechazar | Aceptó "abc" | FALLÓ | Media |
| 6.7 | Campos vacíos (cliente, banco, pago, precio, motivo de anulación) | Avisos | Todos con aviso claro en español | PASÓ | - |
| 6.8 | Textos largos: nombre de banco de 300 caracteres | Límite | Aceptado sin límite | FALLÓ | Baja |
| 6.9 | Textos largos en observaciones y nombre de cliente | Límite | El campo de observaciones tiene tope de 300 caracteres en pantalla; no se probó el nombre de cliente largo | NO PROBADO (nombre de cliente) | - |
| 6.10 | Misma referencia de pago repetida | Bloquear | Bloqueó con ventana clara | PASÓ | - |
| 6.11 | Cambiar de cliente con pedido armado | Aviso | Vacía el pedido sin preguntar | OBSERVACIÓN | Baja |

---

## Sección 7. Usabilidad (¿lo entiende una persona no técnica?)

| # | Pantalla | Observación | Resultado | Gravedad |
|---|---|---|---|---|
| 7.1 | Elegir puesto | Cada tarjeta explica en lenguaje simple qué ve. Advierte que no es seguridad. Texto de Ventas dice "en la versión completa registrará los pedidos" aunque ya los registra | PASÓ con observación | Baja |
| 7.2 | Hacer una venta | Tres bloques claros (cliente, catálogo, pedido). Avisos útiles: "Sin existencias", "Solo hay 415 bultos...", lista sin precios con explicación | PASÓ | - |
| 7.3 | Venta: "Método de pago (banco)" es obligatorio incluso a crédito | Una persona puede no entender por qué debe elegir banco si no pagó; el botón "A crédito" aparece como único botón (parece un solo botón sin alternativa para Ventas) | OBSERVACIÓN | Baja |
| 7.4 | Venta: aviso de banco sale como mensaje oscuro abajo a la derecha que tapa el botón "Siguiente" y desaparece solo | Se entiende, pero dura poco | OBSERVACIÓN | Baja |
| 7.5 | Documentos: "Membrete sin completar (RIF y dirección en ajustes)", "Formato fiscal por confirmar con el contador", "Asientos contables automáticos", "Movimientos de inventario" | Lenguaje de contabilidad; una persona de ventas puede no entenderlo | OBSERVACIÓN | Baja |
| 7.6 | Registro de ventas | Muestra cifras de ejemplo fijas (vendedores "Andrés, Beatriz...", 200 clientes) que no son los datos reales; el aviso "datos de ejemplo" es pequeño | OBSERVACIÓN | Media |
| 7.7 | Registrar cobro | Pasos 1, 2 y 3 numerados; columnas con términos como "Caso", "Ruta A/B", "Documento emitido al cobrar" que no se explican | OBSERVACIÓN | Media |
| 7.8 | Cobro con fecha pasada | Pide PIN con mensaje claro, pero después deja la pantalla en esa fecha y filas en blanco con "La fecha de pago es anterior a la emisión." | OBSERVACIÓN | Media |
| 7.9 | Referencia repetida y anulación | Mensajes muy claros, con datos del pago existente | PASÓ | - |
| 7.10 | "Quién debe" | Totales, tabla por vendedor y zona, buscador con ejemplo de texto | PASÓ | - |
| 7.11 | Precios y bancos | Mensajes de resultado claros ("Mientras tanto sigue vigente el precio anterior") | PASÓ | - |
| 7.12 | Fechas de tasa | "Tasa BCV 914,02 · 16/11/2026" siendo hoy 14/11 puede confundir | OBSERVACIÓN | Baja |

---

## Sección 8. Aparatos, marca y consola

Se midió con el navegador integrado (el panel a veces cambió de ancho y reinició el tamaño; se volvió a fijar). Pantallas revisadas: Hacer una venta, Registrar cobro, Quién debe, Cobros hechos, Precios, Bancos, Gerencia, Precios por aprobar.

| # | Tamaño | Qué pasó | Resultado | Gravedad |
|---|---|---|---|---|
| 8.1 | 1366x768 | Sin desborde horizontal en ninguna pantalla. La pantalla de venta mide 857 px de alto y necesita desplazar unos 90 px | PASÓ con observación | Baja |
| 8.2 | 1366x680 | Sin desborde horizontal. Venta 769 px de alto (desplazar ~90 px); botones Generar visibles | PASÓ con observación | Baja |
| 8.3 | Tableta 768x1024 | Sin desborde horizontal. Cambia a diseño tipo móvil con barra inferior y resumen "0 producto(s) US$ 0,00 · Ver pedido" | PASÓ | - |
| 8.4 | Móvil 375x812 | Sin desborde horizontal del documento. La tabla de bancos se corta a la derecha (hay que deslizar para ver cuenta y titular). El botón "Opciones" tiene el texto un poco más ancho que la caja. El encabezado ocupa casi 40% de la altura | PASÓ con observación | Baja |
| 8.5 | Tabla de notas del cobro (escritorio) | Barra de desplazamiento horizontal; última columna parcialmente fuera | OBSERVACIÓN | Baja |
| 8.6 | Marca | Encabezado y botón principal rojo rgb(201,33,33) = #C92121; botones amarillos rgb(242,183,46) = #F2B72E | PASÓ | - |
| 8.7 | Consola del navegador | Solo errores provocados a propósito (códigos 400, 403, 409 por pruebas de validación). Además aparecieron 2 errores "Cannot read properties of undefined (reading 'querySelector')" al cambiar de puesto con comandos del programa (no con clic real); no se pudo confirmar si ocurre con una persona | OBSERVACIÓN | Baja |
| 8.8 | Tamaño vuelto a "desktop" | Hecho | - | - |

Pasos para repetir 8.x: abrir el menú del panel de vista (o usar resize) y recorrer #v-pedido, #v-cobro, #p-bancos.

---

## Datos de prueba que quedaron en la base local
- Clientes: UATA-Cliente Lara (id 31), UATA-Sin Lista Zulia (id 32).
- Documentos: NE-000014, NE-000015, FA-000015, FA-000016 (generada al cobrar NE-000015).
- Pagos: RC-00019 (anulado), RC-00020 (US$ 50 sin aplicar, fecha 10/11), RC-00021 (completo NE-000015), RC-00022 (anulado).
- Bancos: UATA-Banco Prueba editado y UATA-Banco Largo (desactivados).
- Existencias bajaron en 2, 3, 1 y 4 bultos por las ventas de prueba. Precio 200 g lista A restaurado a US$ 30,50; Zulia sin lista (como estaba).
