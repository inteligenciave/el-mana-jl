# Versiones de El Maná JL

Este documento dice **qué es una versión, cómo se numera y qué se publicó hasta hoy**. Está escrito para personas no técnicas.

Sitio real: https://elmana-jl.talosbot.workers.dev
Repositorio privado: https://github.com/inteligenciave/el-mana-jl

## 1. Qué es una versión

Una versión es **cada vez que se publica el sistema en el sitio real** (cada deploy). No es cada cambio que se hace en la computadora: lo que está solo en la computadora se llama «Sin publicar» y vive en `CHANGELOG.md`.

Cada versión queda marcada con tres cosas que van juntas:

1. **Un número** (v1.0, v1.1, v2.0…).
2. **Una etiqueta en el repositorio** (`v1.1`) que apunta al momento exacto del código que se publicó.
3. **El ID de versión de Cloudflare** (ejemplo `3e30e7a2`): es el «botón de volver atrás» del sitio. Con ese ID se puede regresar el sitio a esa versión en minutos.

## 2. Qué se guarda en GitHub (y qué no)

| Se guarda | No se guarda (nunca) |
|---|---|
| El código del sistema | Respaldos de la base de datos (`respaldo-*.sql`): tienen nómina y datos de clientes |
| Las migraciones (`cloudflare/migrations/`) y su reversa (`cloudflare/reversa/`) | Claves, contraseñas, `.dev.vars` |
| Esta documentación y la bitácora de versiones | Fotos pesadas, QR e iconos de trabajo |

Los respaldos de la base se hacen antes de cada publicación y se guardan **solo en la computadora del dueño** (más el «Time Travel» de Cloudflare, que conserva 30 días).

**Subir a GitHub solo con permiso expreso del dueño, cada vez.** Primero se prepara y se le muestra qué se sube; después, con su «sí», se sube.

## 3. Cómo se numera

Formato: `vMAYOR.MENOR` (ejemplo `v1.0`, `v1.1`, `v2.0`).

- **Sube el número MAYOR (v1.x a v2.0)** cuando la publicación cambia la forma de trabajar o toca los datos de forma grande: migraciones que reordenan datos existentes, cambios de puestos o permisos, nómina o dinero que se calculan distinto, pantallas principales rehechas. Estas versiones siempre se publican con respaldo y Time Travel, y el dueño avisa al equipo antes.
- **Sube el MENOR (v1.0 a v1.1)** cuando son mejoras o arreglos que no cambian cómo se trabaja: una pantalla nueva opcional, un reporte, un arreglo, un texto.
- **Arreglo urgente sobre una versión:** se numera como menor (v1.1 a v1.2). No se usan tres números.
- Una versión que se publicó y se **revirtió** conserva su número y se anota «revertida» (no se reutiliza el número).

**Nombre de la etiqueta:** `v1.1`, con mensaje `v1.1 · 2026-12-01 · resumen corto`. Una etiqueta por publicación.

**Dónde se crea la versión:** siempre en la rama `puestos-6` (carpeta `C:\Users\Aleja\El mana-puestos`), que hoy es la línea buena del proyecto. En GitHub esa línea es la rama `main` del remoto. La carpeta principal `C:\Users\Aleja\El mana` tiene trabajo pausado de «acceso con clave» y **no se publica desde ahí** (ver advertencia en `PUBLICAR.md`).

## 4. Plantilla de cada entrada

Al publicar se copia este bloque a la tabla de la sección 5 (y el detalle a `CHANGELOG.md`):

```
### vX.Y · AAAA-MM-DD
- Versión de Cloudflare (ID): ________
- Commit: ________
- Etiqueta: vX.Y
- Migraciones aplicadas en la base real: ninguna / 00NN, 00NN
- Qué cambió (en palabras de negocio, 2 a 5 líneas): ________
- Respaldo previo: archivo local respaldo-pre-vX.Y.sql (no va a GitHub)
- Marca de Time Travel previa: ________
- Cómo volver atrás: wrangler rollback <ID de la versión anterior> + reversa de migración si aplica (ver PUBLICAR.md)
- Verificado por: ________   Autorizó la publicación: ________
```

## 5. Tabla histórica (reconstruida)

Fuente: lista real de versiones de Cloudflare (`wrangler versions list`, consultada el 2026-11-20), historial de git y `handoff.md`. **Todas las versiones de Cloudflare anteriores a esta política se publicaron sin etiqueta ni número.** Se les puso el nombre «sin número» y se deja su ID para poder volver atrás.

Hora de Cloudflare en UTC; hora de commit en Venezuela (UTC-4). Cuando el commit se asignó **solo por coincidencia de hora** (no hay un registro escrito que lo diga) se marca «probable».

| Núm. | Fecha y hora (UTC) | ID de Cloudflare | Commit | Migraciones en la base real | Qué se publicó | Estado |
|---|---|---|---|---|---|---|
| sin número | 2026-11-15 07:01 | `c9d21c50` | `b7fe730` (probable) | por confirmar (de 0001 hasta 0014 o 0015) | Producción por zonas, herencia entre etapas, compras, flota, PDF, pantallas compactas | Reemplazada |
| sin número | 2026-11-16 02:10 | `19b406e2` | por confirmar (no coincide con ningún commit) | por confirmar | Versión intermedia; no hay registro de qué contenía | Reemplazada |
| sin número | 2026-11-16 07:05 | `3fec57ca` | `df4e847` (probable) | por confirmar (hasta 0024 a fines de ese día según el handoff) | Resumen de Administración, zonas de Empaque, Quién debe, marcas y nómina, turnos y bonos, solicitudes de autorización, auditoría protegida | Reemplazada |
| sin número | 2026-11-16 15:33 | `9d886edc` | `36bd6e9` en `main` (confirmado en handoff) | hasta 0024 (según handoff) | Primeros pasos en Ayuda, horario de turnos fácil, pantallas unidas en pestañas | Reemplazada |
| sin número | 2026-11-16 17:11 | `81a4fe45` | `36f2e4b` (probable, por hora) | hasta 0024 | Pantallas largas en pestañas y pedido sin scroll lateral en celular | Reemplazada |
| sin número | 2026-11-16 17:18 | `622aeabe` | sin commit en ese momento (Sentry se commiteó después como `17cf1cb`) | ninguna | Sentry: reporte de errores sin datos personales (confirmado en handoff) | Reemplazada |
| sin número | 2026-11-16 21:10 | `3e30e7a2` | `f6b5ad4` (rama `puestos-6`) | **0025** (puestos_seis) aplicada | Seis puestos: Gerencia, Administración, Producción, Logística, Ventas, Nómina (confirmado en handoff). Respaldo previo `respaldo-pre-puestos6.sql`; Time Travel antes: `0000006c-00000000-00005125-3469beabfb10797dd8ae0e925f9c199d` | Reemplazada |
| sin número | 2026-11-17 06:09 | `7df91dd3` | `e90c8cd` (probable, por hora) | ninguna conocida (por confirmar) | Banner para compartir, app instalable, reportes de ventas por rubro/vendedor/zona/producto, Recursos humanos abre y cierra turno, botón atrás en celular, cabecera compacta | Reemplazada |
| sin número | 2026-11-17 06:39 | `4ffdfee1` | `756a0c7` (probable, por hora) | ninguna conocida (por confirmar) | Una sola lista de vehículos (Flota) | Reemplazada |
| **v1.0 (propuesta, por confirmar con el dueño)** | 2026-11-17 15:53 | **`7acf069e`** | **`e9c7675`** (probable, por hora; es la punta de `puestos-6` y de `main` en GitHub) | ninguna conocida; la base real debería estar en 0025 (por confirmar con `wrangler d1 migrations list`) | Arreglos del informe de revisión: tasa, pagos de RRHH, ventas, cliente, worker y pruebas | **ACTIVA hoy** (100 %) |

Notas honestas sobre lo que no se pudo comprobar:

- El handoff dice que el sitio estaba en `3e30e7a2`, pero Cloudflare muestra tres publicaciones posteriores (17 de noviembre). La **activa hoy es `7acf069e`**.
- No hay registro escrito de qué migraciones se aplicaron con cada publicación anterior a `3e30e7a2`; solo consta «hasta 0024» al 16 de noviembre. Para confirmarlo hay que consultar la base real en modo lectura (`wrangler d1 migrations list elmana-jl --remote`), lo cual no se hizo aquí.
- La etiqueta `v1.0` **no existe todavía**: se crea cuando el dueño apruebe cuál versión es la primera numerada (la propuesta es la activa hoy). Se puede etiquetar el commit `e9c7675` sin publicar nada.
- Los números de las versiones sin número no se asignan para no inventar historia. Si el dueño lo pide, se pueden etiquetar como `v0.1` a `v0.9` solo con los commits marcados «probable» después de confirmarlos.

## 6. Próxima versión

Lo que hay hecho en local y sin publicar (migraciones 0027 a 0038, Producción rehecha, compras en un solo paso, nómina en USD, bonos, áreas de Personal, etc.) está resumido en `CHANGELOG.md`, sección «Sin publicar». Por su tamaño y por tocar nómina y datos, corresponde **v2.0** (siguiendo la regla de la sección 3, suponiendo que `7acf069e` sea v1.0).

Para publicarla, seguir `PUBLICAR.md`.
