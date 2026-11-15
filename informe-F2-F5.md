# Informe F2 a F5 (correcciones UAT, solo local)

Sin `wrangler deploy`, sin migraciones remotas, sin commits. `node build.js` termina bien. Consola del navegador: sin errores de programa; solo respuestas 400/403/409 provocadas a propósito en las pruebas y cortes de conexión cuando hubo que reiniciar `wrangler dev`.
Decisiones usadas: Gerencia cuenta una nota ya facturada una sola vez (como factura); la tasa se muestra con la fecha para la que rige, sin cambiar la lógica; datos UATA-/UATB- se dejan.

## Archivos cambiados (en esta tarea)
- `cloudflare/src/ventas/servicio.js` (banco obligatorio al vender, detalle del documento con kg, cuenta y tasa, filas de cobro con fecha pasada, largo del nombre del cliente)
- `cloudflare/src/ventas/repo.js` (búsqueda de cliente con guion)
- `cloudflare/src/bancos/dominio.js` (cuenta solo cifras y guiones, largos máximos)
- `cloudflare/front/ventas/v-docs.js`, `v-cobro.js`, `v-pedido.js`, `v-core.js`, `v-listas.js`, `v-registro.js`
- `cloudflare/front/pantallas/pantallas.js` (Gerencia sin doble conteo y fecha de la tasa)
- `cloudflare/app-source.html` (Recepción, Empaque, rótulo de la tasa, Despachos en móvil, barra inferior)
- `cloudflare/public/index.html` (regenerado con `node build.js`)
- Informe: `C:\Users\Aleja\El mana\informe-F2-F5.md`

## F2 Ventas y documentos
| Ítem | Resultado |
|---|---|
| Servidor exige banco (crédito) | PASÓ. POST /api/v/ventas sin `metodo_pago` responde 400 «Elige el banco…» (FALTA_BANCO); con banco crea la nota. Regla: se exige cuando la empresa ya cargó bancos activos (igual que la pantalla). |
| Servidor exige banco (contado) | PASÓ. Con `pago.id_banco` toma el nombre del banco; con banco escrito que no existe en la lista y sin método de pago, rechaza. Venta «Pagó ahora» completa por API: creó NE-000018 y su factura FA-000017. |
| Documento: kg, banco con cuenta, tasa/Bs | PASÓ en pantalla (modal de NE-000017): Kilos totales 12,00 kg; Banco Bancamiga con número de cuenta y titular; Tasa BCV 914,02 y total en Bs. La tasa del documento es la de su fecha de emisión. |
| Búsqueda de cliente con guion | PASÓ. /api/v/clientes?q=UATA-Cliente devuelve UATA-Cliente Lara. |
| Cobro con fecha pasada: sin filas en blanco | PASÓ. Con fecha 10/11 cada fila muestra número, fecha y el motivo («Esta nota se emitió después de la fecha del pago…»). |
| Cobro con fecha pasada: pantalla vuelve a hoy tras registrar | HECHO en código (se reinicia la fecha a hoy). NO ejecutado: no se registró otro pago de fecha pasada. |
| Tasa de ESA fecha | La lógica ya usa la tasa vigente en la fecha del pago (`tasaPara`). En la base local solo existe la tasa 16/11, así que el 10/11 usa la más cercana. Ahora la pantalla lo dice: «rige para el 16/11/2026 (no hay tasa guardada del 10/11/2026: se usa la más cercana)». No se insertó una tasa falsa del 10/11 para no alterar la tasa de hoy. |
| Fecha de la tasa 16/11 siendo hoy 14/11 | PASÓ como rótulo: encabezado «Rige 16/11/2026», cobro y Gerencia «Rige para el 16/11/2026». |

## F3 Pantallas vivas
| Ítem | Resultado |
|---|---|
| Pedido en curso se guarda y se recupera | PASÓ. Con pedido armado (3 bultos) se guardó en el navegador; al recargar volvió el cliente y las cantidades con el aviso «Recuperamos el pedido que tenías sin terminar…». Se borra al generar el documento y al cambiar de cliente; solo recupera para el mismo puesto y hasta 24 h. |
| «Registro de ventas» con datos reales | PASÓ. Ahora muestra ventas de hoy, de la semana y de 30 días, por cobrar, por vendedor y últimas ventas, desde la base (ya no las cifras de ejemplo fijas). Observación: a 1366x768 la página mide unos 1100 px de alto (hay que desplazar); no se pidió ajustarla más. |
| «Quién debe» se refresca | PASÓ. Con la pantalla abierta (1.140,49) se registró un pago por API (US$ 1); al salir y volver mostró 1.139,49. También se limpia tras cada cobro, anulación y venta desde la pantalla (no probado el clic de «Registrar pago» en pantalla). |

## F4 Validaciones
| Ítem | Resultado |
|---|---|
| Cuenta de banco solo cifras y guiones | PASÓ. «abc» y «0134-1234 5678» (con espacio) rechazados: «El número de cuenta solo puede llevar cifras y guiones.» |
| Largo máximo de nombres | PASÓ. Banco: 60 letras (titular 80, cuenta 40); cliente: 150. Con 300 caracteres responde un aviso claro en vez de cortar sin decir nada. |
| Kg facturados > 0 en Recepción | PASÓ. Con -5 y 3 sacos: «Los sacos y los kg facturados deben ser mayores que cero.» (también aviso emergente) y no guarda. Solo en la pantalla; la ruta antigua /api/batch no valida (queda fuera del alcance). |
| Cantidades enteras con aviso | PASÓ. Al escribir «1.5» avisa «Los bultos se cuentan completos…» y dice cómo se tomó la cifra (15). El punto/coma tecleado se bloquea con el mismo aviso. |
| Mensaje de Empaque «+0 unidades» | CORREGIDO en código (guarda las unidades antes de limpiar el formulario). NO ejecutado en pantalla: no se registró otro empaque para no cambiar existencias. |

## F5 Observaciones
| Ítem | Resultado |
|---|---|
| Gerencia sin doble conteo | HECHO. «Ventas hechas» ahora excluye las notas con estado FACTURADO_DESDE_NE (cuentan solo como factura). Mismo criterio en el Registro de ventas. Comprobado: 29 documentos / US$ 2.069,03 por API con ese criterio. |
| Enlace «Entregas con foto» en el menú | PASÓ. Ya aparece en Despacho (Jefe de producción: Despachos, Entregas con foto, Bultos y etiquetas). El cambio estaba en el menú del árbol de trabajo anterior a esta tarea. |
| Móvil: Despachos | PASÓ a 375x812. A 640 px o menos las notas pasan a tarjetas con «Ver nota» y «Marcar…» visibles; sin desborde horizontal. |
| Móvil: barra inferior «Administración» | PASÓ. Letra de 10 px en pantallas de 420 px o menos; el texto mide 68 px dentro de 75 px de columna. |

## Lo no verificado
- Registrar un pago de fecha pasada desde la pantalla (reinicio de la fecha) y el «Registrar pago» por clic tras un cobro (refresco de «Quién debe»).
- Mensaje de Empaque corregido en pantalla.
- La tasa histórica real de una fecha anterior (no existe en la base local).
- Revisión en 1366x768 de todas las pantallas tocadas (solo se midió Registro de ventas; la pantalla de venta con el pedido recuperado se vio en pantalla).
- El banco obligatorio no se exige cuando la empresa no tiene ningún banco activo cargado (igual que la pantalla).

## Datos de prueba que quedaron
Se crearon en la base local: NE-000017, NE-000018, FA-000017 (cliente UATA-Cliente Lara) y el pago RC-00024 (US$ 1). Se reinició `wrangler dev` (puerto 8799) porque dejó de responder; sigue activo con `--test-scheduled`.
