# Cómo publicar una versión con seguridad

Lista paso a paso. **Nada de esto se hace sin la autorización expresa del dueño.** Cada comando se corre desde `C:\Users\Aleja\El mana-puestos\cloudflare` (rama `puestos-6`), salvo que se indique otra cosa.

## ADVERTENCIA antes de empezar: la rama de «acceso con clave»

La carpeta principal `C:\Users\Aleja\El mana` (rama local `main`, trabajo pausado de **acceso con clave**) **choca con `puestos-6`**:

- Su migración `0026_acceso_clave.sql` **no tiene reversa**.
- Cambia los mismos archivos que ya cambiaron los 6 puestos (`worker.js`, `app-source.html`, `build.js`, `wrangler.toml`, `pantallas.js`, `primeros-pasos.js`).
- Esa carpeta no tiene los 6 puestos ni Sentry en sus commits.

Por eso: **se publica siempre desde `puestos-6`**, nunca desde la carpeta principal. No se mezcla ni se hace `merge` de la rama de claves con una publicación normal. Cuando el dueño decida activar las claves, primero hay que unirla en una rama aparte, **renumerar su migración** (a 0039 o la siguiente libre), escribirle una reversa y probarlo todo en local. Ojo: el `main` **local** está atrasado respecto al `main` de GitHub; lo que está en GitHub (`origin/main`) es la línea de `puestos-6`. Se sube con `git push origin puestos-6:main`, nunca con `git push` suelto desde la carpeta principal.

## Lista de pasos

### 0. Autorización
- [ ] El dueño dijo «sí, publica» **para esta versión** (no sirve un «sí» de otra vez).
- [ ] Se le mostró: versión propuesta (ver `VERSIONES.md`), qué cambia en palabras de negocio, qué migraciones se aplican y qué pasa con los datos.

### 1. Preparar el código
- [ ] Estar en la rama correcta: `git branch --show-current` debe decir `puestos-6`.
- [ ] `git status`: ver qué hay cambiado. Todo lo que se publica debe estar en un commit (paso 8).
- [ ] `node build.js` (genera `public/index.html`, `cliente.html`, `mis-entregas.html`).

### 2. Pruebas (en local, servidor en puerto 8800)
- [ ] Correr las pruebas de `src/pruebas/` y `src/*/*.prueba.mjs` (por ejemplo `node src/pruebas/atomico.prueba.mjs`). Las que piden servidor vivo, con el servidor local encendido.
- [ ] Recorrer a mano los 6 puestos en `http://localhost:8800` con datos de ejemplo.
- [ ] Revisar celular (375 x 812) en las pantallas que cambiaron.

### 3. Respaldo de la base real y marca de Time Travel
(Estos pasos solo **leen** la base real; el respaldo se guarda **solo en la computadora**, nunca en GitHub.)
- [ ] `npx wrangler d1 export elmana-jl --remote --output ../respaldo-pre-vX.Y.sql`
- [ ] `npx wrangler d1 time-travel info elmana-jl` y **anotar la marca (bookmark)** que devuelve.
- [ ] Anotar el ID de la versión activa actual: `npx wrangler deployments list` (el que dice 100 %). Es el punto de regreso del Worker.
- [ ] Ver qué migraciones ya están en la base real: `npx wrangler d1 migrations list elmana-jl --remote`.

### 4. Migraciones (solo si esta versión trae)
- [ ] Revisar que **cada migración nueva tenga su reversa** en `cloudflare/reversa/`. Si falta, **no se publica**.
- [ ] Aplicar en orden: `npx wrangler d1 migrations apply elmana-jl --remote`. (Aplica todas las pendientes por número, de menor a mayor.)
- [ ] Confirmar con `npx wrangler d1 migrations list elmana-jl --remote` que ninguna quedó pendiente.

### 5. Publicar el Worker
- [ ] `npx wrangler deploy`
- [ ] Anotar el **ID de versión** que muestra al terminar (ejemplo `7acf069e-...`).

### 6. Verificación en el sitio real
- [ ] `https://elmana-jl.talosbot.workers.dev/api/health` responde bien.
- [ ] Entrar a «Elige tu puesto» y abrir 1 o 2 pantallas de lo que cambió.
- [ ] Revisar Sentry unos minutos por errores nuevos.
- [ ] Si algo falla: ir a «Cómo volver atrás» (abajo) **ya**, sin esperar.

### 7. Registrar la versión
- [ ] Completar la entrada en la tabla de `VERSIONES.md` (plantilla de la sección 4) con: fecha, ID de Cloudflare, commit, migraciones, marca de Time Travel.
- [ ] Mover lo de «Sin publicar» a su sección de versión en `CHANGELOG.md`.

### 8. Commit y etiqueta (SIN subir todavía)
Ver la sección «Crear commit y etiqueta» abajo. Se crean **en local**.

### 9. Aviso al dueño antes de subir a GitHub
- [ ] Mostrar al dueño `git log origin/main..HEAD --stat` (qué archivos se suben) y confirmar que **no hay** `respaldo*.sql`, claves ni `.dev.vars`.
- [ ] Esperar su permiso expreso. Solo entonces: `git push origin puestos-6:main` y `git push origin vX.Y`.

## Tabla de migraciones y su reversa

La reversa deshace **solo la estructura y la transformación de la migración**; los datos que la gente ingresó después pueden perderse. Para volver a un punto exacto en el tiempo, la herramienta es Time Travel (ver abajo).

Ruta: migración en `cloudflare/migrations/`, reversa en `cloudflare/reversa/`. Estado «real» = aplicada en la base real (según el handoff, por confirmar con `migrations list`).

| N.º | Qué hace | Reversa | En la base real |
|---|---|---|---|
| 0001 | Base inicial (documentos) | No tiene (es el origen) | Sí |
| 0002 | Ventas y cobranza | No tiene | Sí |
| 0003 | Tasa BCV por día | No tiene | Sí |
| 0004 | Portal del cliente | No tiene | Sí |
| 0005 | Entrega con foto y temporizador | No tiene | Sí |
| 0006 | Kilos y unidades por bulto | No tiene | Sí |
| 0007 | Cambios de precio pendientes | No tiene | Sí |
| 0008 | Bancos | No tiene | Sí |
| 0009 | Listas de precios regionales | No tiene | Sí |
| 0010 | Funciones extra por puesto | No tiene | Sí |
| 0011 | Listas con nombre, estado a lista | No tiene | Sí |
| 0012 | Comprobante y foto de llegada | No tiene | Sí |
| 0013 | Producción por zonas | No tiene | Sí |
| 0014 | Clientes unificados | No tiene | Sí |
| 0015 | Herencia entre etapas | No tiene | Sí |
| 0016 | Merma calculada | No tiene | Sí |
| 0017 | Pedidos de compra | No tiene | Sí |
| 0018 | Flota de vehículos | No tiene | Sí |
| 0019 | Flota: ubicación y autobús | No tiene | Sí |
| 0020 | Imagen del producto | No tiene | Sí |
| 0021 | Marcas de entrada y salida | No tiene | Sí |
| 0022 | Pagos de nómina | No tiene | Sí |
| 0023 | Solicitudes de autorización | No tiene | Sí |
| 0024 | Bonos por turno | No tiene | Sí |
| 0025 | De 10 a 6 puestos | `reversa/0025_puestos_seis_reversa.sql` | Sí (publicada con `3e30e7a2`) |
| 0026 | Acceso con clave (**solo en la rama `main` de la carpeta principal**) | **NO TIENE** | No |
| 0027 | Importar del lector de huellas | `0027_lector_asistencia_reversa.sql` | No |
| 0028 | Modificaciones del cliente 1: bancos, categorías, cargos | `0028_modificaciones_cliente_reversa.sql` | No |
| 0029 | Turnos Diurno/Nocturno, grupos, nómina en USD | `0029_turnos_grupos_usd_reversa.sql` | No |
| 0030 | Bonos en USD | `0030_bonos_esquemas_reversa.sql` | No |
| 0031 | Sacos, recepción verificada, inventario general | `0031_inventario_compras_reversa.sql` | No |
| 0032 | Etapas como datos, merma consolidada, panel | `0032_produccion_etapas_merma_panel_reversa.sql` | No |
| 0033 | Compras en un solo paso | `0033_compras_sin_validar_reversa.sql` (usarla solo recién aplicada la migración: puede borrar pagos hechos después) | No |
| 0034 | Almidón como artículo de inventario | `0034_inventario_almidon_reversa.sql` | No |
| 0035 | Puestos y áreas en Personal | `0035_puestos_areas_personal_reversa.sql` | No |
| 0036 | Lo que trae cada proveedor | `0036_proveedor_trae_reversa.sql` | No |
| 0037 | Nómina edita turnos (avisos) | `0037_nomina_turnos_reversa.sql` | No |
| 0038 | Crear bonos nuevos | `0038_bonos_crear_reversa.sql` (no es repetible, ver `informe-errores-fases.md`) | No |

Las migraciones 0001 a 0024 **no tienen archivo de reversa** (solo agregan). Para deshacerlas hay que usar Time Travel.
Regla de oro: **ninguna migración nueva se publica sin su reversa.** Cuando se agregue una migración mayor a 0038, actualizar esta tabla.
La 0029 duplica respaldos de montos en Bs (tabla `nomina_bs_respaldo`); la reversa usa esa tabla.

## Cómo volver atrás

Hay dos cosas distintas que se pueden regresar: el **programa** (Worker) y la **base de datos**.

### A. Regresar solo el programa (rápido, no toca datos)
Sirve cuando la pantalla nueva falla pero la base está bien.
1. Buscar el ID de la versión anterior en `VERSIONES.md` (o `npx wrangler versions list`).
2. `npx wrangler rollback <ID-de-la-versión-anterior>` (pide un mensaje; confirmar).
3. Verificar `https://elmana-jl.talosbot.workers.dev/api/health`.
Importante: si la versión nueva **aplicó migraciones**, el programa viejo puede no entender la base nueva. En ese caso se hace también B.

### B. Deshacer migraciones (con su reversa)
1. Regresar primero el programa (A), para que nadie escriba datos nuevos con reglas nuevas.
2. Correr la reversa de la **última migración hacia atrás**, una por una y en orden inverso (0038, 0037, 0036…): `npx wrangler d1 execute elmana-jl --remote --file=reversa/00NN_..._reversa.sql`.
3. Si la migración ya está registrada como aplicada y se quiere volver a aplicar después, hay que quitar su registro de la tabla de migraciones (`d1_migrations`) con ayuda de quien mantiene el sistema; no improvisar.
4. Leer el encabezado de cada reversa: dice qué **se pierde**.

### C. Regresar toda la base a un momento anterior (Time Travel, último recurso)
Cloudflare conserva 30 días. **Esto borra todo lo ingresado después de ese momento** (ventas, asistencia, pagos).
1. Avisar al dueño y confirmar que acepta perder lo posterior.
2. `npx wrangler d1 time-travel restore elmana-jl --bookmark=<marca-anotada-en-el-paso-3>`  (o `--timestamp=...`).
3. Regresar también el programa (A).
Alternativa si Time Travel no sirve: importar el respaldo local `respaldo-pre-vX.Y.sql` (solo con ayuda de quien mantiene el sistema; reemplaza la base).

### Marcas de regreso conocidas
- Antes de `3e30e7a2` (puestos): Time Travel `0000006c-00000000-00005125-3469beabfb10797dd8ae0e925f9c199d`; respaldo local `respaldo-pre-puestos6.sql` (carpeta principal).
- Versión activa hoy: `7acf069e`. Anteriores: ver `VERSIONES.md`.

## Crear commit y etiqueta de una versión (SIN subir)

Esto **no se ejecuta aquí**: es la receta para cuando el dueño autorice la publicación y esté verificada. Hay un script de ayuda: `docs/crear-version.ps1` (por defecto solo **muestra** qué haría; no hace nada sin `-Ejecutar`, y nunca hace `push`).

Pasos a mano (equivalentes), desde `C:\Users\Aleja\El mana-puestos`:

```
git branch --show-current            # debe decir puestos-6
git status --short                   # revisar: sin respaldo*.sql, sin .dev.vars
git add -A                           # el .gitignore deja fuera lo privado
git status --short                   # revisar de nuevo lo que quedó listo
git commit -m "vX.Y · resumen corto en palabras de negocio"
git tag -a vX.Y -m "vX.Y · AAAA-MM-DD · Cloudflare <ID> · migraciones 00NN-00NN"
git log --oneline -3 ; git show vX.Y --stat | head
```

Luego **parar y avisar al dueño**. Solo con su permiso expreso:

```
git push origin puestos-6:main
git push origin vX.Y
```

Para etiquetar la versión activa hoy sin publicar nada (cuando el dueño apruebe v1.0): `git tag -a v1.0 e9c7675 -m "v1.0 · 2026-11-17 · Cloudflare 7acf069e"` (la etiqueta apunta a un commit, no cambia el código).
