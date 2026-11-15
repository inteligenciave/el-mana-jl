# Plan para resolver lo que dejó la prueba UAT (16 fallos, 8 no probados, 9 que no existen)

Fuente: `informe-uat-A.md` e `informe-uat-B.md`. Todo se hace en LOCAL; sin desplegar a Cloudflare sin autorización del dueño. Respaldo previo de la base: `respaldo-pre-uat`.
Reparto: un agente Sonnet 5.5 por fase, una fase a la vez cuando tocan los mismos archivos.

## A. Los 16 fallos (agrupados por causa; cada fase termina con su prueba de repetición)

| # | Fallo | Dónde | Fase |
|---|---|---|---|
| 1 | Portal: "Enviar pedido" da Error interno (menos `?` que valores) | `src/cliente/repo.js` línea 22 | F1 |
| 2 | Portal: "Reportar un pago" da Error interno (mismo error) | `src/cliente/repo.js` línea 37 | F1 |
| 3 | `/api/all` entrega todos los datos (cédula, teléfono, tarifa) sin identificarse | `src/worker.js` | F1 |
| 4 | `/api/batch` acepta escrituras sin puesto | `src/worker.js` | F1 |
| 5 | Venta sin banco aceptada si se llama directo a la API (2.11b) | `src/ventas/servicio.js` | F2 |
| 6 | Documento sin kg, número de cuenta ni tasa/Bs (2.14) | `front/ventas/v-docs.js` | F2 |
| 7 | Búsqueda de cliente por API falla con guion (2.1b) | `src/ventas/repo.js` | F2 |
| 8 | Recargar a mitad de venta pierde el pedido sin avisar (2.16, 6.3) | `front/ventas/v-pedido.js` | F3 |
| 9 | "Registro de ventas" muestra cifras fijas de ejemplo (2.19) | `app-source.html` | F3 |
| 10 | "Quién debe" no se refresca sola (4.2) | `front/ventas/v-listas.js` | F3 |
| 11 | Bancos aceptan letras en número de cuenta (5.9, 6.6) | `src/bancos/*` | F4 |
| 12 | Bancos sin límite de largo del nombre (5.10, 6.8) | `src/bancos/*` | F4 |
| 13 | Recepción acepta "Kg facturados" = −5 | `app-source.html` recepción | F4 |
| 14 | Empaque dice "+0 unidades" aunque suma | `app-source.html` empaque | F4 |
| 15 | Dos inventarios separados: lo que sube Producción no lo ve Ventas ni el portal | ver F6 | F6 |
| 16 | (observación media) Gerencia cuenta dos veces 9 notas ya facturadas (416,23) | Gerencia | F5 |

Observaciones menores del informe que se arreglan junto a su fase: cantidad "1.5" pasa a 15 sin avisar (F4); cobro con fecha pasada deja filas en blanco y usó la tasa del 16/11 para el 10/11 (F2); pantalla Entregas con foto no está en el menú (F5); en móvil, botones de Despachos fuera de vista y "Administración" cortado en la barra inferior (F5); la tasa BCV dice 16/11 siendo hoy 14/11 (F2, se confirma con el dueño: el BCV publica la del siguiente día hábil).

## B. Los 8 no probados (se prueban después de arreglar lo que los bloqueaba)

| # | Prueba | Se hace en |
|---|---|---|
| 1 | Venta "Pagó ahora" completa (3.13) | F7, tras F2 |
| 2 | Pestaña "Estados y listas" por pantalla (5.16) | F7 |
| 3 | Bancos sugeridos con la lista vacía (5.12) | F7: restaurar lista de bancos vacía y probar el clic |
| 4 | Nombre de cliente muy largo (6.9) | F4 (se agrega el límite) y F7 |
| 5 | Tramo de 21 días y vencimiento de la entrega | F7: mover la fecha de la foto en la base de prueba |
| 6 | Enlace del portal vencido por fecha | F7 |
| 7 | Pedido "por confirmar" y su aprobación por Ventas | F7, tras F1 |
| 8 | Pago reportado "por verificar" y confirmación de Cobranza | F7, tras F1 |

## C. Los 9 que no existen aún (corresponden a las etapas del `plan-produccion-zonas.md`)

| # | Falta | Etapa del plan |
|---|---|---|
| 1 | Tarjetas por zona | Etapa 6 |
| 2 | Kilos por zona | Etapa 6 (depende de kg por bulto, etapa 2) |
| 3 | Meta de 15 t | Etapa 6 |
| 4 | Semáforo | Etapa 6 |
| 5 | Despachar antes de 15 t | Etapa 7 |
| 6 | Pausar zona | Etapa 7 |
| 7 | Dividir pedido | Etapa 7 |
| 8 | Rol Producción con cierre de turno | Etapa 3 |
| 9 | Etapas lavado y fritado por kilos | Etapa 3 |

## Fases y orden

- **F0 Preparación**: cerrar la base local en un respaldo nuevo; decidir qué se hace con los datos UATA-/UATB- (borrarlos restaurando `respaldo-pre-uat` o dejarlos).
- **F1 Críticos (seguridad y portal)**: corregir marcadores de `cliente/repo.js`; exigir puesto en `/api/all` y `/api/batch` (y que cada puesto solo lea y escriba lo suyo; solo localhost sin puesto para desarrollo). Prueba: pedido y pago desde el portal; llamada sin puesto da 403.
- **F2 Ventas y documentos**: el servidor exige banco al generar (crédito y contado); el documento muestra kg totales, banco con cuenta y tasa/Bs; arreglar búsqueda con guion; cobro con fecha pasada usa la tasa vigente de ESA fecha y sin filas en blanco.
- **F3 Pantallas vivas**: el pedido se guarda en el navegador y se recupera con aviso; "Registro de ventas" con datos reales; "Quién debe" se refresca al volver a la pantalla y tras cada cobro.
- **F4 Validaciones**: número de cuenta solo cifras y guiones; largo máximo de nombres (banco y cliente); kg facturados > 0; cantidades enteras (avisar con "1.5"); mensaje de Empaque correcto.
- **F5 Observaciones**: confirmar con el dueño cómo cuenta Gerencia las notas ya facturadas; enlace al menú de Entregas con foto; ajustes móviles (Despachos y barra inferior).
- **F6 Inventario único**: decidir con el dueño una sola fuente de producto terminado (la de Ventas, en bultos) y que Producción la alimente al cerrar turno. Esta fase se hace junto con las etapas 2 y 3 del plan de producción, para no hacerlo dos veces.
- **F7 Pruebas pendientes**: repetir los 8 no probados.
- **F8 Producción por zonas**: etapas 2, 3, 4, 5, 6 y 7 del `plan-produccion-zonas.md` (kg por bulto, rol Producción y turnos, zonas, venta por bulto, tablero con semáforo, salidas). Son los 9 faltantes.
- **F9 Repetición completa**: volver a pasar los dos informes (A y B) con 2 agentes Sonnet 5.5 y comparar contra este plan. La lista de pruebas debe quedar en 0 fallos y 0 no probados; "no existe" solo si el dueño lo posterga.

## Decisiones que necesito del dueño
1. Seguridad: ¿mientras no haya inicio de sesión real, basta con exigir el puesto, o se publica solo cuando haya inicio de sesión?
2. Gerencia: ¿las notas ya facturadas se cuentan una vez (como factura) o dos?
3. Inventario: ¿se confirma una sola fuente (la de Ventas, en bultos)?
4. Datos de prueba UATA-/UATB-: ¿borrar y restaurar el respaldo?
5. Tasa: ¿se acepta que se muestre la fecha de la tasa del siguiente día hábil, o debe mostrar la de hoy?
6. Confirmar hora de la consulta de tasa y la fuente (pendientes de antes).

## Cómo se verifica cada fase
Cada fase termina con: la prueba del informe que falló, repetida igual; consola del navegador sin errores; `node build.js` sin errores; y la pantalla afectada revisada en 1366×768 y móvil. Un agente Sonnet de pruebas confirma antes de pasar a la siguiente fase.
