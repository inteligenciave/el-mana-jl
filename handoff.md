# Handoff — El Maná JL (sistema Cloudflare)

Actualizado: 2026-11-16. Sitio real: https://elmana-jl.talosbot.workers.dev (versión 9d886edc, commit 36bd6e9 en `main`). Local: `npx wrangler dev --local --port 8799 --test-scheduled` desde `C:\Users\Aleja\El mana\cloudflare`.
**Regla:** `wrangler deploy` y migraciones `--remote` solo con autorización expresa del dueño y con respaldo previo de la base real (`npx wrangler d1 export elmana-jl --remote --output ../respaldo-pre-<algo>.sql`). Commits solo si el dueño lo pide. Los `respaldo-*.sql` del repo no se commitean.

## Reglas del dueño (CLAUDE.md global y memoria)
- Antes de cada orden nueva: entrevista con botones (mín. 4, máx. 100, rondas ≤4, recomendación primero, lenguaje simple); al cerrar, «entendí esto: …». Seguimientos y confirmaciones exentos. Solo la sesión principal entrevista.
- Tarea nueva con otra en curso → subagente Sonnet 5.5 (`model:"sonnet"`). Cambios grandes de infraestructura/planificación/reglas: preguntar antes si quiere plan con Opus 5.5.
- Usuarios NO técnicos: simple, sin jerga. Ahorro de tokens. No inventar cifras; los informes solo identifican.
- Marca: rojo #C92121, amarillo #F2B72E, blanco, gris casi negro. Sin scroll de página a 1366x768 (probar también 375x812). Semáforo solo verde/ámbar. Dinero «$», nunca «US$». NUNCA mostrar «Dueño»: «Gerente» en frases, «Gerencia» como puesto (clave interna `dueno` no se toca). Lo que solo cambia Gerencia, los demás no lo ven: usan «Pedir autorización».

## Arquitectura
Worker + D1. `node build.js` genera `public/index.html`, `cliente.html`, `mis-entregas.html` desde `app-source.html` + `front/*` + `src/*/dominio.js`. Capas dominio/repo/servicio/rutas en `src/*`. Rol por header `x-rol` (sin login real); portal por `x-token`. Permisos en `src/acceso.js`, `PERM_DEF` y matriz en DB (`ajustes/matriz`), más Funciones extra por puesto. Migraciones hasta 0024 (en la base real están aplicadas hasta 0024).
Rutas: `/api/v/*` ventas/bancos/tasa/compras, `/api/c/*` colecciones y portal, `/api/p/*` producción por zonas, `/api/f/*` flota, `/api/h/*` RRHH (hoy, conteo, horas, turno, parametros, bonos, asistencia, resumen, nomina, pagos, entrada, salida), `/api/s/*` solicitudes de autorización.
Tasa BCV: cron cada hora (`0 * * * *`) + refresco cada 30 min al cobrar; si falla, queda la última.

## Estado de lo hecho (todo en la página real)
- **Pantallas unidas en pestañas** (`front/pantallas/pantallas.js`, mecanismo UNI): cada pantalla vieja conserva su clave (permisos, #enlaces); una opción de menú con barra de pestañas; la pestaña solo aparece si ese puesto ya veía esa clave. `ROLE_HOME`: adm → resumen, cobranza → Quién debe, empaque → tablero de zonas, rrhh → En planta hoy. Cobranza quedó dentro de Administración. Gerencia: Resumen, Por aprobar, Auditoría, Ajustes (9 pestañas). Producción/Despacho (Fase 7) y PIN por persona (Fase 8) NO se aplicaron por decisión del dueño.
- **Auditoría protegida (Fase 0):** borrar ahora ANULA (motivo ≥3 letras, quién y cuándo; se listan con `?anulados=1`); `auditoria` solo se agrega; `auditoria_sistema` guarda puesto/fecha/colección/id/acción/antes-después; borrado masivo solo en localhost.
- **Producción:** Recibir y Producir como botones principales; Empaque ve tarjetas por zona en kg (meta 15 t) sin dinero.
- **Nómina y RRHH:** En planta hoy, marcas entrada/salida (necesitan turno asignado en Personal), Pagar nómina (semana/quincena/mes, bonos, horas extra, préstamos, un solo pago por período), pestañas, pantalla Turnos. Bonos por kilos con parámetros editables solo por Gerencia (adm y rrhh ven). Hora extra = horas sobre la duración del turno (o jornada de 8 h sin horario); recargo hoy 0 %.
- **Horario por turno (Ajustes › Turnos y bonos):** botones de un toque + listas «Entra/Sale» cada 30 min + duración visible; solo Gerencia edita. Turnos que cruzan medianoche NO se pueden guardar (regla en `src/rrhh/turnos.js`).
- **Ayuda › Primeros pasos** (`front/comun/primeros-pasos.js`): 48 pasos en 4 secciones (empezar desde cero, día a día, cierre de quincena/mes, cuando algo sale mal); cada puesto ve solo los suyos (Gerencia 48; Adm 17; Nómina y RRHH 11; Jefe de producción 9; Ventas 7; Custodio 6; Empaque 6; Recepción 5; Producción 4); casillas guardadas en localStorage por puesto; insignia de pendientes en el botón Ayuda; Gerencia con selector «Ver los pasos de».
- **Solicitudes de autorización** (`src/solicitudes/*`), Cobranza como tarjetas «Quién debe», flota, PDF, compactado de pantallas, Borrador (guardado de lo que se escribe): ver `CAMBIOS.md`.

## Pendiente / por decidir
1. Dueño: confirmar recargo de hora extra (hoy 0 %) y cargar horarios de turnos y parámetros de bonos (sin horario: se cuenta jornada de 8 h).
2. Dueño: ¿permitir turnos de noche (cruzar medianoche)? Es cambio de reglas en el servidor.
3. Dueño: decidir Fase 7 (Producción/Despacho) y Fase 8 (PIN); darle al puesto Producción acceso a Producir/Recibir (matriz guardada `{jefeprod:2, empaque:1}`).
4. Primeros pasos: no incluye entregas con foto (`e-entregas`) ni «Cambiar ubicación» de Empaque (`fl-desp`); no existe flujo «Conciliar» (cubierto con confirmar pagos del portal, Cobros hechos y Arqueo); el nivel para guardar «Reglas de caja y nómina» se supuso 2 (Gerencia y Custodio). Los pasos por puesto dependen de la matriz de permisos de cada base.
5. Revisar en la página real: que Gerencia no vea botones de borrado masivo; Primeros pasos y horario de turnos tras el deploy (no se abrió el sitio real después de subir).
6. Pantallas que aún hacen scroll de página a 1366x768: Resumen de planta, Comparar, Equipo (`catprod`), Bultos y etiquetas, Entregas con foto. En 375 px: v-pedido (scroll horizontal ~158 px) y Gerente › Ajustes sin revisar.
7. «Pedidos» en Ventas podría mostrar solo los del portal (no «los míos»); puesto Producción sin botones Recibir/Producir.
8. Datos: tasa del sistema 914,02 vs Compras 1.079,00 sin explicar; lote L-1115-2 y 6 lotes viejos «En proceso»; subida de foto/comprobante con error pendiente; duplicados de clientes (CL-001↔12, CL-003↔11) y 12 clientes viejos sin estado/vendedor; probar HEIC y cámara real; portal con sesión de cliente real; UAT de F7/F9; Etapa 8 (unir pantallas viejas de Empaque/Despachos, que no descuentan del inventario único); H6 (pedir/recibir) pendiente; pedido de compras no enlaza aún con solicitudes ni cuentas por pagar; etiqueta «Gerencia · Gerencia» en cabecera.

## Archivos clave (`C:\Users\Aleja\El mana\`)
`CAMBIOS.md` (bitácora, desactualizada respecto a lo subido desde la herencia: ver commits), `README.md`, `marca.md`, `acuerdos.md`, `plan-*.md`, `informe-*.md`, respaldos `respaldo-*.sql` (incl. `respaldo-pre-deploy3.sql` = base real antes del último deploy). Transcripción de trabajo: `C:\Users\Aleja\.claude\projects\C--Users-Aleja-El-mana\ca08ed5b-3769-4fbc-b2d5-80a60754ed88.jsonl`.
