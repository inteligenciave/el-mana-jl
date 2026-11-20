# Informe UAT-B (Producción, Recepción, Despacho, Jefe de producción, Empaque, Dueño, Portal del cliente)

Sistema local http://localhost:8799 · Datos de prueba con prefijo "UATB-". Solo se identifica y describe.

## Resumen (se completa al final)

Totales (conté cada prueba numerada de abajo; las observaciones sin número no se cuentan):
- Pasó: 25 (incluye 4 "pasó con detalle")
- Falló: 5 (2.3 kg negativos aceptados; 1.6 datos sin rol en /api/all y /api/batch (corregido el 20/11/2026); 5.3 pedido del portal da "Error interno"; 5.4 reporte de pago del portal da "Error interno"; 2.6 mensaje "+0 unidades" mal)
- No probado: 4 (tramo de 21 días y vencimiento de entrega; enlace vencido por fecha; pedido "por confirmar" y su aprobación; pago "por verificar" exitoso — los dos últimos por el error 500)
- No existe aún: 9 (tarjetas por zona, kilos por zona, meta 15 t, semáforo, despachar antes de 15 t, pausar zona, dividir pedido, rol Producción con cierre de turno y etapas lavado/fritado por kilos, enlace entre inventario producido y vendible)

Lo más importante (gravedad alta):
1. Portal del cliente: enviar un pedido y reportar un pago fallan con "Error interno" (D1_ERROR: Wrong number of parameter bindings; archivo cloudflare/src/cliente/repo.js, líneas 22 y 37). El cliente no puede pedir ni avisar pagos.
2. CORREGIDO el 20/11/2026: /api/all y /api/batch ahora piden puesto y revisan el permiso de cada colección; cada puesto solo recibe los datos que su pantalla necesita (empleados sin cédula, teléfono ni tarifa salvo Gerencia y Recursos humanos). Pendiente: el puesto aún viaja sin clave (login con claves pausado).
Gravedad media: kg facturados negativos se guardan en Recepción; el inventario que sube Producción no es el que ven Ventas ni el portal; tablas de Despachos en móvil con botones fuera de la vista; "Ventas hechas" de Gerencia cuenta dos veces las notas ya facturadas (a confirmar si es la regla).
Cosas que sí funcionaron bien: menús por puesto, doble clic sin duplicados, cierre de lote y empaque suben el stock de Producción, comprimir foto (1,0 MB a 99 KB), temporizador de 7 días, disputa "No recibí esto" (pausa el plazo), aislamiento entre clientes, enlaces inválidos/revocados, límite de intentos, cifras de Gerencia coinciden con los datos, portal sin desborde en los 4 tamaños.

Datos de prueba que quedaron en la base local (prefijo UATB-): clientes UATB-Cliente 1 (id 33) y 2 (id 34), nota de entrega NE-000016 (cliente 34), entrega con foto id 6 (confirmada), una disputa abierta, recepciones REC-0419/0420, empaque EMP-0005 (lote L-1111 cerrado, dato de ejemplo), enlaces del portal. Tres códigos de enlace se mostraron en este informe de trabajo; el del cliente 2 fue revocado y reemplazado.

---

## Sección 1. Entrar a cada puesto (en curso)

### 1.1 Pantalla "¿Quién eres?"
- Qué hice: abrí http://localhost:8799/ en 1366x768.
- Esperaba: lista de puestos con explicación sencilla.
- Qué pasó: aparecen 9 tarjetas (Dueño, Administración, Custodio, Recepción, Jefe de producción, Empaque, Ventas, Cobranza, Nómina) con "Ve:" y botón Entrar. Aviso al pie: elegir rol no es seguridad.
- Resultado: pasó. Gravedad: -
- Repetir: abrir la raíz del sitio.

### 1.2 Recepción solo ve lo suyo
- Qué hice: Entrar como Recepción.
- Esperaba: solo la pantalla de Producción > Recibir.
- Qué pasó: menú lateral con "Producción" y "Cambiar rol". En Opciones: Recibir, Mermas, Materia prima, Inventario, Equipo, Manual. En el mapa de inicio las demás áreas dicen "Sin acceso: el rol Recepción no ve esta área". Al recargar la página (F5) se mantiene el puesto.
- Resultado: pasó.

### 1.3 Jefe de producción
- Menú: Producción y Despacho (coincide con "Ve: Producción, Despacho"). Accesos rápidos: Nueva recepción, Cerrar lote del turno, Registrar empaque, Notas de entrega. Resultado: pasó.

### 1.4 Cambiar de puesto escribiendo la dirección (#jefeprod) con otro puesto activo
- Qué hice: estando como Recepción, escribí en la barra #jefeprod.
- Qué pasó: no cambió de puesto; mostró la pantalla de inicio (mapa). El sistema avisa que no es seguridad. Resultado: pasó (informativo).

## Sección 2. Producción (en curso)

### 2.1 Guardar recepción con doble clic
- Qué hice: como Recepción, llené "UATB-rec1 prueba" y di doble clic a "Guardar y enviar a Administración".
- Esperaba: una sola recepción.
- Qué pasó: se creó una sola (REC-0419). Resultado: pasó.

### 2.2 Guardar con campos vacíos
- Qué hice: dejé "Sacos" vacío y Kg facturados -5, y guardé.
- Qué pasó: mensaje "Indica la cantidad de sacos y los kg facturados." Pero el mensaje queda abajo del formulario, lejos del botón en pantalla chica; en el pantallazo no se ve nada cambiar arriba. Resultado: pasó con detalle. Gravedad baja.

### 2.3 Kg facturados negativos
- Qué hice: con sacos=3 y Kg facturados = -5, guardé.
- Esperaba: rechazo ("no puede ser negativo").
- Qué pasó: guardó REC-0420 con qf = -5 (comprobado en /api/all). Aparece en la lista del Jefe de producción como pendiente de validar.
- Resultado: FALLÓ. Gravedad media.
- Repetir: Recepción > Nueva recepción > poner -5 en Kg facturados y 3 sacos > Guardar.

### 2.4 Cerrar lote con vacíos / negativos (Jefe de producción > Producir > Cerrar lote L-1111)
- Qué hice: apreté "Cerrar lote y pasar a empaque" con los campos vacíos; luego con kg a granel = -50 y aceite = 10.
- Esperaba: mensaje claro y que no se guarde.
- Qué pasó: vacío -> "Indica los kg a granel y el aceite consumido." (bien). Con -50 la pantalla calculó "Rendimiento -2,7 %" y "Aceite -20 %" y avisó "Rendimiento bajo: revisar el lote"; al guardar no se grabó nada (el lote siguió "En proceso"), pero el mensaje mostrado fue el mismo de "indica los kg", que no explica que el negativo no vale.
- Resultado: pasó con detalle (mensaje poco claro). Gravedad baja.

### 2.5 Avanzar etapa y cerrar lote (doble clic)
- Qué hice: "Avanzar de «Freído» a «Enfriado y reposo»"; luego kg granel 420, aceite 180 y doble clic en "Cerrar lote y pasar a empaque".
- Qué pasó: mensajes "Lote L-1111: ahora en Enfriado y reposo." y "Lote L-1111 cerrado: rendimiento 23,0 %. Pasa a empaque." El lote quedó Cerrado una sola vez (API: granel 420, aceite 180). Rendimiento 420/1830 = 22,95 % (ok).
- Resultado: pasó. Nota: este lote es dato de ejemplo (L-1111), no lleva prefijo UATB.
- Observación: la lista de etapas del lote es corta (Freído -> Enfriado y reposo); no hay pantalla separada para "lavado" ni "fritado" con kilos de entrada/salida por etapa (ver 3.x "no existe aún").

### 2.6 Registrar empaque (kilos) y que suba el inventario terminado
- Qué hice: Jefe de producción > Empacar: lote L-1111, Papas 35 g, 500 unidades, 17,5 kg, 5 bolsas dañadas, doble clic en "Registrar empaque y sumar al stock".
- Esperaba: un registro, mensaje "+500 unidades", stock 3.200 -> 3.700.
- Qué pasó: un solo registro (EMP-0005). El stock pasó a 3.700 (se ve tras ~1 segundo; justo después del clic aún mostraba 3.200). El mensaje dijo "+0 unidades al producto terminado" (error de texto: el código limpia el campo antes de armar el mensaje, app-source.html línea ~4572). La tabla "Empaque de hoy" muestra 17,5 kg como "18 kg" (redondeo).
- Resultado: pasó con fallo de mensaje. Gravedad baja (el mensaje confunde; el dato sí es correcto).
- Repetir: #empaque > rellenar > Registrar; leer el mensaje verde.

### 2.7 Inventario de Producción vs inventario de Ventas
- Qué hice: tras subir 500 und de Papas 35 g, miré el inventario del módulo de Ventas (GET /api/v/arranque).
- Qué pasó: Ventas tiene 8 productos por bultos (stock_entero, p. ej. 400 g = 307, 1 kg = 457) y NO incluye "Papas 35 g"; no cambió nada. Son dos inventarios separados (ya lo dice plan-produccion-zonas.md, punto 3).
- Resultado: no existe aún el enlace (lo producido no sube lo vendible). Gravedad media.

### 2.8 Sin inventario no se vende
- Qué hice: por API, vendedor pide 99.999 bultos del producto 1.
- Qué pasó: 409 "Existencias insuficientes de «Papas Doraditas Cabello de Ángel 400 g»: hay 307 bultos." Con rol Recepción: 403 "Tu rol no puede generar notas de entrega ni facturas." Desde la pantalla Nueva venta no lo probé (es del otro probador).
- Resultado: pasó (API).

### 2.9 Subir lo producido / cerrar turno con rol "Producción"
- No existe el rol "Producción" (roles: dueño, adm, custodio, recep, jefeprod, empaque, ventas, cobranza, rrhh) ni "cierre de turno" que compare declarado vs registrado ni almacén en proceso por kilos en cada etapa (recepción, lavado, fritado, empacado). Resultado: no existe aún (plan-produccion-zonas.md lo describe como plan, sin implementar).

## Sección 3. Zonas / pedidos
- Tarjetas por zona, kilos acumulados, meta 15 t, semáforo, despachar antes de 15 t con motivo, pausar/postergar zona, dividir pedido: no existe aún en la versión local (búsqueda en front/ y src/ sin pantalla ni ruta; solo existe el plan). Resultado: no existe aún (6 pruebas).
- Solo hay "zona" como texto libre del cliente y listas de precio regionales.

## Sección 4. Despacho y entrega
### 4.1 Pantalla Despachos del equipo (Jefe de producción > Despacho)
- Qué hice: abrí "Notas de entrega" desde Producción como Jefe de producción.
- Qué pasó: lista de camiones/chofer con estado (En ruta, Disponible, Cargando) y tabla de notas con botones "Marcar en ruta" / "Marcar entregada". Esa pantalla (datos de ejemplo NE-22xx) no tiene foto ni temporizador.
- Resultado: pasó (solo lectura; no marqué nada).

### 4.2 Subir foto de entrega, comprimir, temporizador 7/21 días, disputa "no recibí esto"
- La función existe en el servidor (/api/v/entregas, /api/c/entregas/no-recibi) y en el código (front/entregas/e-entregas.js, pantalla "Entregas con foto"), pero no encontré en el menú de los puestos Jefe de producción, Empaque ni Dueño un acceso a esa pantalla: el menú Despacho muestra solo "Despachos". Tampoco tuve un documento entregable con foto propio. Resultado: no probado por pantalla (no hallé la ruta de acceso). Pendiente de que el responsable indique dónde se abre.
- Sí confirmé con la API que ya hay una entrega de ejemplo en estado RECHAZADA subida por "Empaque y despacho" (GET /api/v/entregas).
- Subir archivo que no es imagen: no probado (mismo motivo).

## Sección 5. Portal del cliente
Preparé dos clientes de prueba (UATB-Cliente 1 = id 33, UATB-Cliente 2 = id 34) por API y generé el enlace del 1 desde Dueño > Cliente > Fichas y enlaces.

### 5.1 Generar enlace personal (Dueño)
- Esperaba: un enlace que se ve una sola vez. Pasó: "Enlace activo termina en 1ZBU · no vence"; mensaje claro "Este código se muestra solo ahora...". Botones: Copiar enlace, Ya lo envié, Generar uno nuevo, Revocar. Resultado: pasó.
- Vigencia en días inválida (0, -3, "abc"): la API responde "Los días de vigencia deben ser un entero entre 1 y 3650...". Pasó. Rol Recepción: "Tu rol no genera enlaces de clientes." Pasó.
- Detalle: la lista de clientes de la pantalla Fichas no incluye clientes creados después de abrir el sistema hasta recargar la página (dice "Ningún cliente coincide"). Gravedad baja.

### 5.2 Entrar con el enlace
- Abrí /cliente.html#<código>: carga "Cargando tu cuenta...", luego "Hola, UATB-Cliente 1", deuda US$ 0,00, crédito "Sin límite cargado", botones Hacer un pedido / Reportar un pago / Ver mi cuenta. Resultado: pasó.
- Detalle: el código queda visible en la barra de direcciones después de entrar. Gravedad baja.
- Sin enlace (mis-entregas.html sin código): "Abre el enlace personal que te enviaron." Pasó.

### 5.3 Armar pedido y enviar ("por confirmar")
- Qué hice: Pedir > 2 bultos de Papas 400 g > Revisar pedido (US$ 98,60 + IVA = 114,38, cálculo correcto) > doble clic en "Enviar pedido".
- Esperaba: pedido "por confirmar".
- Qué pasó: mensaje rojo "Error interno." y no se creó nada (API: pedidos = 0). La consola muestra 500 en /api/c/portal/pedidos. Con curl el detalle es: "D1_ERROR: Wrong number of parameter bindings for SQL query." Causa probable: cloudflare/src/cliente/repo.js línea 22 (stPedido): el INSERT tiene 7 marcadores (?1..?7) pero se le pasan 8 valores (el último es id_banco).
- Resultado: FALLÓ. Gravedad ALTA (el cliente no puede hacer pedidos).
- Repetir: abrir enlace del cliente > Pedir > sumar un producto > Revisar pedido > Enviar pedido.
- Bien: los productos sin existencia salen apagados con "Sin inventario" (Mayonesa, Salsa de tomate, Mostaza) y los demás muestran "Hay 307".

### 5.4 Reportar un pago ("por verificar")
- Vacío: "Elige el banco." Letras en el monto: "Escribe el monto en bolívares. Ejemplo: 1250,50" (claro; pasó). Negativo (-10): mismo mensaje (pasó).
- Con todo correcto (Bancamiga, ref UATB778899, 1250,50, fecha 14/11/2026), clic en "Enviar el reporte": "Error interno." (POST /api/c/portal/pagos 500, mismo "Wrong number of parameter bindings"; el INSERT de pagos_reportados en repo.js línea 37 tiene 13 marcadores y probablemente recibe uno más). No quedó ningún pago reportado.
- Resultado: FALLÓ. Gravedad ALTA.

### 5.5 Estado de cuenta
- Después de crear (por API) una nota de entrega para UATB-Cliente 2 (NE-000016, US$ 57,19), con su enlace: debe 57,19; lista el documento y su detalle. Resultado: pasó (por API; la pantalla "Mi cuenta" no la recorrí con datos por falta de tiempo).

### 5.6 Un cliente nunca ve datos de otro
- Con el enlace del Cliente 1 pedí el documento 37 (del Cliente 2) y los documentos 1 a 40: 404 "No encontramos ese documento." en todos. Su cuenta no muestra la deuda del otro. Mandar id_cliente=31 o x-rol: dueno junto con el código no cambia el resultado (sigue siendo UATB-Cliente 1). Resultado: pasó.

### 5.7 Enlace inválido, revocado, vencido, intentos
- Sin código o código inventado: 401 "El enlace no es válido o ya venció. Pide uno nuevo..." Pasó.
- Revocar el enlace del Cliente 2: el enlace deja de servir (401). Pasó.
- Después de 6 intentos con códigos malos seguidos, desde la misma conexión devuelve 429 "Demasiados intentos con un código que no sirve. Espera unos minutos..." (dice 600 s, pero el bloqueo duró hasta el fin de la ventana fija de 15 minutos, unos 7 min en mi caso) y durante ese tiempo tampoco deja entrar al enlace bueno (en local todas las conexiones se ven como una sola, "local"). Resultado: pasó (protección esperada). Observación baja: el mensaje dice "unos minutos" y el aviso técnico 600 s, que no coincide con el tiempo real.
- Enlace vencido por fecha: no probado (no se puede vencer sin editar la base; el mínimo es 1 día).

## Sección 6. Gerencia del Dueño
- Qué hice: Entrar como Dueño; leer las 5 tarjetas y cruzar con /api/v/documentos, /pagos y /deuda.
- Tarjetas: Ventas hechas 35 ventas / US$ 2.312,39; Cobros recibidos 19 cobros / US$ 925,56; Por cobrar US$ 1.026,11 con 6 clientes; Precios por aprobar 0; Tasa Bs 914,02.
- Cruce: documentos = 35 y suma = 2.312,39 (coincide); pagos con estado ACTIVO = 19 y suma 925,56 (hay 3 anulados que suman aparte, no cuentan: coincide); deuda total = 1.026,11 y 6 clientes (coincide).
- Observación: "Ventas hechas" suma las 9 notas ya convertidas en factura (FACTURADO_DESDE_NE) y también sus facturas: son 416,23 contados dos veces si se piensa en ventas reales (sin las facturas derivadas serían US$ 1.896,16). Gravedad media (puede ser la regla deseada; conviene confirmarlo).
- Observación: la tasa muestra "Al día. Fecha: 16/11/2026" mientras el sistema dice que hoy es 14/11/2026. Gravedad baja.
- Resultado: pasó (las cifras coinciden con los datos).

## Sección 1 (completa). Puestos y seguridad
### 1.5 Menús por puesto (medidos en pantalla)
- Recepción: Producción. Jefe de producción: Producción y Despacho. Empaque y despacho: Producción y Despacho. Administración: solo Administración. Dueño: Gerencia, Ventas, Administración, Producción, Despacho, Logística, Cliente (7). "Cambiar rol" siempre disponible. Pasó.
- Recepción escribiendo en la barra de direcciones #gerencia, #compras-mp, #despachos, #c-ficha, #v-pedido: siempre vuelve a su pantalla Recibir. Pasó.
- API con rol Recepción: crear venta, ver entregas, ver pagos, ver documentos, resumen del portal, asignar funciones extra y confirmar entrega: todos 403 con mensaje claro. Pasó.
- Al recargar (F5) se mantiene el puesto. Si se escribe a mano la dirección de otro puesto no cambia de puesto. Pasó.

### 1.6 Datos de otro puesto sin identificarse (API vieja de planta)
- Qué hice: GET /api/all sin ningún rol y con rol Recepción/Jefe/Empaque; POST /api/batch sin rol con lista vacía.
- Qué pasó: /api/all devuelve todo sin pedir rol, incluidas colecciones de empleados (cédula, teléfono, tarifa de pago), pagos, caja chica, préstamos, clientes, auditoría. /api/batch acepta escrituras sin rol (respondió ok con 0 operaciones). Las rutas nuevas /api/v/ sí exigen rol y verifican permisos. La pantalla avisa que elegir puesto "no es seguridad".
- Resultado: falló frente a "cada puesto solo ve lo suyo" (a nivel de datos). CORREGIDO el 20/11/2026: el servidor ahora pide puesto y permiso por colección. Queda como límite conocido que el puesto aún no se comprueba con clave.
- Repetir: curl localhost:8799/api/all (sin cabeceras).

## Sección 7. Errores humanos (resumen de lo probado)
- Doble clic en guardar recepción: una sola recepción (pasó). Doble clic en cerrar lote: un solo cierre (pasó). Doble clic en registrar empaque: un solo registro (pasó). Doble clic en "Enviar pedido" del portal: sin duplicado, pero porque falla con error 500 (ver 5.3).
- Recargar a mitad: lo escrito en un formulario (observaciones de recepción) se pierde al recargar la página, sin aviso. Resultado: pasó/informativo. Gravedad baja.
- Vacíos: mensaje claro en recepción, cierre de lote y reporte de pago (pasó). Pero el mensaje de recepción aparece abajo, lejos del botón en pantallas chicas.
- Letras en números: el campo numérico del navegador no deja escribirlas; en el portal (campo de texto) las letras dan "Escribe el monto en bolívares. Ejemplo: 1250,50" (pasó).
- Negativos: Kg facturados -5 en recepción SE GUARDA (falló, 2.3). Kg a granel -50 en cierre de lote no se guarda pero con mensaje equivocado (2.4).
- Archivo que no es imagen en subida de foto de entrega: no probado (no pude abrir esa pantalla; ver 4.2).

## Sección 8. Usabilidad (lo que entendería una persona no técnica)
- Bien: "¿Quién eres?" con una frase por puesto; botones grandes "Entrar"; en el portal, textos como "Tu pedido queda por confirmar hasta que Ventas lo apruebe" y "Lo que debes hoy" son claros; bancos con nombre; "Sin inventario" en rojo.
- Mejorable: "Error interno." en el portal no dice qué hacer (debería sugerir intentar de nuevo o avisar a la empresa). Palabras técnicas en pantallas de planta: "media poblacional", "Desviación estándar", "Variación", "Trazabilidad" (Recepción, pantalla Recibir) sin explicación. Mensaje "+0 unidades" en empaque confunde. El mensaje de error de recepción queda fuera de la vista. "Despacho" muestra "Marcar en ruta/entregada" sin pedir confirmación (no lo ejecuté).
- Resultado: informativo. Gravedad baja/media.

## Sección 9. Aparatos (1366x768, 1366x680, tableta 768x1024, móvil 375x812)
Pantallas medidas: Recepción>Recibir, Jefe>Resumen, Producir, Empacar, Despachos, Gerencia y Cliente>Fichas.
- Ninguna pantalla produce desplazamiento horizontal de la página en ningún tamaño (pasó).
- 1366x680: Gerencia mide 769 px de alto (9 px más que la ventana: aparece una barra de desplazamiento vertical sin necesidad). Gravedad baja.
- Móvil 375: las tablas (Despachos, Producir, Empacar) son más anchas que la pantalla y se desplazan de lado dentro de su cuadro, sin pista visual; en Despachos las columnas Estado y los botones "Ver nota" / "Marcar entregada" quedan fuera de la vista hasta deslizar. Gravedad media.
- Móvil 375: en la barra inferior el nombre "Administración" se corta ("Administració"). Gravedad baja.
- Móvil 375, Recepción: el menú inferior (Producción/Menú) y el formulario se ven bien; los botones se alcanzan.
- Marca: rojo de cabecera y amarillo de líneas/botones coinciden visualmente con #C92121 y #F2B72E (no medí los valores píxel a píxel).
- Consola de la app principal: sin errores ni avisos propios. En el portal: errores 500 solo al enviar pedido y reportar pago (5.3 y 5.4).

## Sección 4 (actualización). La pantalla "Entregas con foto" SÍ existe
Se abre escribiendo la dirección #e-entregas (módulo Despacho > Entregas con foto); no la encontré como botón en el menú de Despacho (el menú solo mostraba "Despachos"). Corrige lo dicho en 4.2.
### 4.3 Subir foto (comprime)
- Qué hice (Dueño): busqué NE-000016 (UATB-Cliente 2), subí una foto PNG de 3000x2000 (1,0 MB), doble clic en "Guardar la entrega".
- Qué pasó: aparece "1,0 MB → 99 KB" (la comprimió a 1024x683); se creó una sola entrega (id 6, estado "Por confirmar") a pesar del doble clic. Resultado: pasó.
### 4.4 Archivo que no es imagen
- Un .txt: "Ese archivo no es una imagen. Elige una foto (JPG, PNG o similar)." Un texto con nombre .jpg: "No se pudo leer esa imagen. Prueba con una foto JPG o PNG." Por API, foto falsa: 400 "La foto no es una imagen JPEG válida." Resultado: pasó (mensajes claros).
### 4.5 Confirmar y temporizador 7/21 días
- Confirmé la entrega por API (Dueño): ok; confirmar otra vez: 409 "Esta entrega ya no está por confirmar." (pasó). Plazos: NE-000016 pasa a "TRAMO1", tiempo restante 604.788.544 ms (casi exactos 7 días), ajustes dias_tramo1=7, dias_tramo2=21. El aviso dice "El Dueño todavía no cargó el descuento A: se muestran los días pero no se aplica descuento" (descuentos y recargo de mora sin cargar). Resultado: pasó para 7 días; el cambio al tramo de 21 días y el vencimiento no se pudieron probar (habría que mover la fecha). Estado: no probado.
### 4.6 Permisos de entrega
- Empaque intentando rechazar: 403 "Confirmar o rechazar una entrega lo hace el Jefe de producción o el Dueño." Cobranza subiendo foto: 403 claro. Sin documento: 400 "Elige la factura o nota de entrega." Resultado: pasó.
### 4.7 Disputa "no recibí esto"
- Qué hice: con el enlace del Cliente 2 abrí mis-entregas.html#<código> en móvil 375. Se ve "Nota de entrega NE-000016 · Primer plazo · 6 d 23 h 58 min · entregada el 14/11, 09:14 p. m. · Saldo US$ 57,19 (Bs 52.272,91 a 914,02)". Apreté "No recibí esto" y luego "Enviar aviso" con doble clic.
- Qué pasó: queda "Plazo en pausa", "Recibimos tu aviso. Cobranza lo revisará y tu plazo queda en pausa", y se creó una sola disputa ABIERTA (API /entregas/disputas). Cuenta de Bs correcta (57,19 x 914,02 = 52.272,91). Resultado: pasó.
- Detalles bajos: dos frases casi iguales seguidas ("Recibimos tu aviso..." y "Ya avisaste que no lo recibiste. Estamos revisando."); desde el portal principal (cliente.html) no hay botón ni enlace para llegar a esta pantalla ni a "No recibí esto"; en "Ver detalle" de la nota tampoco.

## Sección 9 (portal del cliente)
- cliente.html con enlace en 1366x768, 1366x680, 768x1024 y 375x812, pestañas Inicio, Pedir, Mi cuenta y Pagar: sin desborde horizontal, ningún botón fuera de pantalla, ningún botón de menos de 40 px de alto. En móvil hay barra inferior de pestañas y barra fija de "Revisar pedido" que se ve completa. Colores rojo y amarillo de marca. Resultado: pasó.
- Cálculos a la vista: 2 x US$ 49,30 + IVA = US$ 114,38 (correcto); deuda US$ 57,19 = Bs 52.272,91 (correcto).
