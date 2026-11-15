# Herencia (H0 a H5): informe del servidor

Solo copia local (puerto 8799). Migración `0015_herencia.sql` aplicada con `--local`. Respaldo previo: `respaldo-pre-herencia/`. Nada de pantallas: eso es H7.

## Por fase
- **H0** hecho y verificado: avanzar etapa sin kilos devuelve 400 («Escribe los kilos para pasar a la siguiente etapa.»). El cierre en cero ya lo bloqueaba el otro agente (sin duplicar).
- **H1** hecho y verificado: tabla `diferencias`; Ventas al aprobar 403; rechazar sin nota 400; aprobar dos veces 409; queda en `auditoria_sistema`; si la anotó el Jefe, solo el Dueño decide (403 al Jefe). Dueño y Jefe ven la lista; los demás 403.
- **H2** hecho y verificado: recepción sale 100, lavado entra 101 sin motivo = 409 `disponible:100`; con motivo = 201, EN_ESPERA y saldo 0; aprobar = 101; rechazar = 0 (movimiento RECHAZADO); fritado 50 de 60 = ok; sale de lavado más de lo que entró = 409. Todas las sumas cuentan solo VIGENTE. Los ajustes del cierre no se heredan a la etapa siguiente.
- **H3** hecho y verificado: empaque 5 bultos de 12 kg con 50 kg = 409 («solo salen 4»); con motivo queda en espera y frena el cierre; declarar más bultos que los anotados = 409; declarar menos o saldo de etapa distinto sin motivo = 400 con la lista; con motivo = 200 y diferencia MERMA; exceso de kilos al cerrar con motivo = 409 EN_ESPERA y se cierra tras aprobar; merma dentro del máximo del Dueño = AUTOMATICA (probado con lavado 5 % y máximo 10 %). Máximos solo Dueño (Jefe 403, 150 % = 400). Máximos vacíos (nada inventado); los dejé vacíos de nuevo.
- **H4** hecho y verificado: recepción validada 500 kg, toma 300; otro turno pide 250 = 409 `disponible:200`; no validada = 409; inexistente = 404.
- **H5** hecho y verificado: cargar 11 de 10 = 409; cargar 8 sin motivo = 400; con motivo = 200, pedido queda con 2 pendientes y la nota sale con 8; despachar sin cargar = 409; rechazo del Dueño anula el conteo y se vuelve a contar. Salidas armadas antes del 15-nov (`carga_desde_ts`) siguen saliendo sin conteo.

## Decisiones que tomé (revisar)
- La regla rige desde `herencia_desde_ts` (momento de la migración): lo anterior no se revisa. Por eso los kilos viejos de prueba no estorban.
- Entrar a recepción por `/turno/movimiento` sigue libre (compatibilidad con la pantalla actual); la vía con control es `/turno/recepcion`. Lo mismo la salida de recepción no se limita. Queda para decidir si se cierra la vía libre al activar las pantallas.
- Exceso al cerrar con motivo: el turno NO se cierra; queda la diferencia en espera y se cierra de nuevo cuando se aprueba (rechazada = se declara otra vez).
- Falta de carga y mermas quedan PENDIENTE pero no frenan; rechazar una falta de carga anula el conteo.
- Bug previo arreglado: las respuestas 403 de `/api/p` daban 500 (faltaba exportar `err`).
- No verificado: H6 (no se hizo, depende de R4); `tolerancia_cierre_kg` sigue sin usar (sin borrar); producto sin peso por bulto ahora no se puede empacar (409).

## Endpoints nuevos (para H7)
- `GET /api/p/diferencias?estado=&etapa=&desde=&hasta=` (Dueño, Jefe) · `GET /api/p/diferencias/contador` → `{pendientes, mas_vieja_horas}`
- `POST /api/p/diferencias/:id/aprobar|rechazar` `{nota}` (rechazar exige nota)
- `POST /api/p/turno/recepcion` `{id_recepcion, kilos}` · `GET /api/p/turno/recepciones-libres`
- `POST /api/p/salidas/:id/cargar` `{lineas:[{id_linea, bultos}], motivo?, tipo?}` (id_linea = línea del pedido; hay que contar todas) · Empaque ya puede leer `/salidas`
- `POST /turno/movimiento` y `/turno/empaque`: aceptan `{motivo, tipo}`; sin motivo, 409 `{codigo:'EXCEDE_HEREDADO', disponible, tipos[]}`; con motivo, 201 `{en_espera:true, diferencia, mensaje}`.
- `POST /turno/cerrar`: `{etapas, bultos, motivos:{etapas:{lavado:{tipo,motivo}}, bultos:{id:{tipo,motivo}}}}`; errores: 400 `FALTAN_MOTIVOS {faltan[]}`, 409 `EN_ESPERA`, 409 `BULTOS_DE_MAS`.
- `GET /turno` ahora trae por etapa `llego_kg` y `puede_salir_kg`, más `empaque_libre_kg` y `en_espera`; movimientos y empaque traen `estado` (VIGENTE/EN_ESPERA/RECHAZADO).
- `POST /api/p/ajustes` acepta `merma_max_pct_lavado|fritado|empacado` (solo Dueño; vacío = sin máximo); `GET /ajustes` devuelve `merma_max_pct`.
- Tipos de motivo: MERMA «Merma del proceso», ERROR_ANOTACION «Error al anotar», AJUSTE_BALANZA «Balanza», FALTO_MERCANCIA «Faltó mercancía», OTRO «Otro».

## Datos de prueba
Borré lo mío en turnos, movimientos, diferencias, recepciones UATH y restauré el turno 5 abierto y el inventario del cierre. Quedan, marcados: cliente `UATH-Cliente prueba herencia`, PED-000016, SAL-00011/12, NE-000030/31 (inventario del producto 3 bajó 10 por esa venta). Turnos 1 a 4 intactos.


# Corrección del Dueño: la merma se CALCULA (migración 0016, solo --local)
Reemplaza H2/H3/H5 en lo de merma. Se eliminó el máximo de merma en % (ajustes `merma_max_pct_*` ya no existen; `GET /ajustes` ya no devuelve `merma_max_pct`).

## Reglas
- Merma = lo que sale de una etapa menos lo que llega a la siguiente (100 salen, 99 llegan = 1 kg). Toda diferencia faltante se resuelve eligiendo: `ANTERIOR` («todavía está en la etapa anterior»: el kilo queda disponible allá, su saldo y «puede salir» lo conservan) o `MERMA` (con motivo de la lista; «Otra» exige texto).
- Exceso (llega más) sigue igual: motivo, EN_ESPERA, lo aprueba el Jefe (si anotó el Jefe, el Dueño); rechazo anula.
- Cierre: por etapa compara lo declarado con lo registrado (y lo que salió de la etapa anterior contra lo que llegó). Cada diferencia faltante debe resolverse; si no, 400 `FALTAN_MOTIVOS`. «Anterior» en el cierre suma ese kilo a lo esperado en la etapa anterior.
- Tablas nuevas: `motivos_merma` (Cáscara, Tierra, Aceite, Derrame, Otra) y `mermas_etapa` (por etapa, motivo, clase MERMA/SIGUE, estado).

## Endpoints para H7
- `POST /turno/movimiento` (ENTRA a lavado/fritado/empacado con menos de lo que salió): sin resolver = 409 `FALTA_RESOLVER` (`salieron_kg, llegan_kg, diferencia_kg, opciones[], motivos[]`). Cuerpo extra: `{faltante:'ANTERIOR'|'MERMA', id_motivo, texto}`; `parcial:true` = es parte de un lote, se resuelve después. Motivo inválido 400 `MOTIVO`; «Otra» sin texto 400 `MOTIVO_OTRA`.
- `GET /turno/por-resolver` -> `{diferencias:[{etapa, etapa_anterior, kilos}], opciones, motivos}`
- `POST /turno/resolver-diferencia` `{etapa, faltante, id_motivo?, texto?}` (resuelve lo que quedó sin llegar a esa etapa; Producción/Dueño)
- `POST /turno/cerrar` agrega `resoluciones:{etapas:{lavado:{faltante,id_motivo,texto}}, transiciones:{lavado:{...}}}`; el 400 `FALTAN_MOTIVOS` trae `faltan[]` (tipo etapa|transicion|bultos), `opciones`, `motivos`. El exceso y los bultos siguen con `motivos:{etapas|bultos:{tipo,motivo}}`.
- `POST /salidas/:id/cargar`: si se cargó menos, mismo `faltante/id_motivo/texto` (409 `FALTA_RESOLVER` si falta). Ya no acepta solo `motivo/tipo` para el faltante. Rechazar la diferencia de carga anula su merma.
- `GET /motivos-merma[?todos=1]` (Producción, Jefe, Dueño, Empaque) · `POST /motivos-merma {nombre}` · `POST /motivos-merma/:id {nombre?, activo?, orden?}` (solo Dueño; «Otra» no se toca).
- `GET /kpi-merma?desde=&hasta=` (ms; Dueño y Jefe; por defecto desde que rige la regla): por etapa `entro_kg, base_kg, merma_kg, merma_pct, sigue_en_anterior_kg, por_motivo[], otras[]`, `total`, `carga_bultos`. % = merma / (kilos que entraron + merma entre etapas). Sin metas.

## Verificado con curl
Ventas 403 (movimiento, kpi, motivos); Producción 403 en kpi y edición de motivos; 100->99 sin elegir = 409; ANTERIOR = saldo de recepción 1 y luego se saca y llega; MERMA con motivo = 201; «Otra» sin texto = 400; exceso en espera, Jefe rechaza/aprueba, cierre bloqueado EN_ESPERA; cierre con diferencias sin clasificar = 400; cierre con ANTERIOR + MERMA correcto; KPI por etapa y motivo; carga faltante con rechazo.

## Datos de prueba
Limpié movimientos, diferencias, mermas, motivos de prueba y salida SAL-00013. El turno 5 quedó CERRADO y vacío (otro proceso abrió el turno 8 antes de que pudiera reabrirlo). Quedan filas de auditoría de la prueba.
