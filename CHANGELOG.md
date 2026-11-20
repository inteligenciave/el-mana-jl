# Cambios por versión — El Maná JL

Formato: una sección por versión publicada, con **Agregado**, **Cambiado** y **Corregido**, escrito en lenguaje de negocio. La política de números y la tabla con los IDs de Cloudflare están en `VERSIONES.md`. Para publicar, ver `PUBLICAR.md`.

Este archivo es la bitácora **por versión publicada**. El detalle técnico día a día de la etapa anterior sigue en `CAMBIOS.md` (no se reescribe).

---

## Sin publicar (solo en la computadora, rama `puestos-6`)

Estado al 2026-11-20. **Nada de esto está en el sitio real.** Todavía sin commit. Próxima versión sugerida: **v2.0**. Migraciones locales **0027 a 0038**, todas con reversa en `cloudflare/reversa/`. Fuentes: `handoff.md` y los `avance-*.md` / `informe-*.md` de la carpeta principal.

### Agregado
- **Importar del lector de huellas** (0027): pantalla en Nómina, campo «Código del lector», marcas crudas aparte, asistencia por persona y día, con reglas: dos marcas «Listo» solo si encajan con el turno, sin turno queda «Sin turno» hasta que Nómina confirme, las marcas a mano no se pisan.
- **Cuentas bancarias con datos obligatorios** (0028): teléfono (Pago Móvil), cédula y RIF; los bancos viejos quedan marcados «falta cargar».
- **Precios por categoría** (0028): Minorista, Mayorista y Gran Mayor reemplazan las listas A, B y «Propia · estado»; la categoría es obligatoria al crear un cliente.
- **Cargos del personal** (0028): lista de 14 cargos; las personas con cargo Vendedor aparecen como vendedores.
- **Turnos Diurno y Nocturno y grupos rotativos por semana** (0029); pantalla «Grupos de turno».
- **Nómina en dólares** (0029): todo se calcula en USD y se paga en Bs con la tasa BCV del día de pago (si no hay tasa de ese día, la última anterior).
- **Bonos en dólares** (0030): Empaque, Producción y Fritura con metas y montos editables, seguimiento en vivo del turno, aplicación automática al cerrar el turno con opción de deshacer, y marca por persona en la etapa de fritado.
- **Crear bonos nuevos** (0038): solo Gerencia crea; Administración cambia metas y montos; Nómina solo ve. Rigen desde el siguiente turno.
- **Papa por sacos, recepción verificada y alarma de diferencia** (0031), con inventario general de insumos (agua, sal, químicos, aceite, almidón) (0034).
- **Condiciones para producir** siempre visibles en verde/rojo (papa, aceite, agua, sal, químicos, almidón, personal del turno) y botón «Iniciar producción» que se habilita solo con todo en verde.
- **Producción rehecha** (0032): turno activo siempre por hora/horario (sin abrir ni «continuar» turno a mano), Producción recibe sus insumos en su propia pantalla, etapas una a la vez con «Terminar etapa», merma consolidada al cierre, descuento de inventario y fritura por persona.
- **Panel de producción** y **barras de inventario** en el resumen de Gerencia (verde, amarillo, rojo; mínimo editable por Gerencia), con refresco automático cada pocos segundos.
- **Proveedores de ejemplo** y lo que trae cada proveedor con precio de referencia (0036).
- **Áreas dentro de cada puesto en Personal** (0035): «Administración y ventas» se separa en Administración y Ventas.
- **Nómina edita horarios de turnos** (0037): avisos a Gerencia, y lo ya pagado o con bono aplicado queda bloqueado (se pide autorización).
- **Examen de medición de clics** (herramienta de pruebas, no cambia el sistema) y su informe `informe-clics.md`.

### Cambiado
- **Compras en un solo paso** (0033): ya no existe «Por validar»; al recibir la compra queda lista (compra efectiva, deuda o pago, almacén).
- **Pantalla «Grupos de turno»** reordenada.
- **Compras:** agua, almidón y empaque se compran como insumo directo.
- **Bonos viejos en Bs** quedan archivados (no se borran); lo ya aplicado sigue contando en nómina.
- **Listas de precios viejas por zona** quedan archivadas; los cambios de precio pendientes de listas viejas quedan rechazados.

### Corregido
- Pantalla «Personal» que salía vacía por el historial de cambios.
- Las pruebas del examen de fase 2 ya no consultan el BCV real (usan una tasa fija).

### Antes de publicar (pendientes conocidos)
- El dueño debe cargar precios de las 3 categorías y asignar categoría a los clientes existentes (sin categoría no se les puede vender).
- Revisar sueldos y tarifas en $ por empleado, uno por uno, después de migrar.
- Faltan el monto y condiciones del bono nocturno (lo dará el dueño).
- Conviven dos flujos de recepción de compras (menús viejos sin «(anterior)»); ver `informe-errores-fases.md`.
- **Conflicto con «acceso con clave» (rama `main` de la carpeta principal):** su migración `0026_acceso_clave` no tiene reversa y choca con esta línea. No publicar ambas sin unirlas primero. Ver `PUBLICAR.md`.

---

## Versiones publicadas

> Las versiones de Cloudflare anteriores a la política de números se resumen aquí sin número. Para IDs, fechas y commits ver la tabla de `VERSIONES.md`.

### v1.0 (propuesta, por confirmar) · 2026-11-17 · Cloudflare `7acf069e`
Commit `e9c7675`. Migraciones nuevas: ninguna conocida (por confirmar).
- **Corregido:** arreglos del informe de revisión: tasa del dólar, pagos de Recursos humanos, ventas, portal del cliente, worker y pruebas.

### Sin número · 2026-11-17 · `4ffdfee1` (commit probable `756a0c7`)
- **Cambiado:** una sola lista de vehículos (Flota); Despachos y Gerencia leen la nueva y se retira la vieja.

### Sin número · 2026-11-17 · `7df91dd3` (commit probable `e90c8cd`)
- **Agregado:** banner para compartir por WhatsApp y redes, iconos y app instalable en el teléfono.
- **Agregado:** reportes de ventas por rubro, vendedor, zona y producto, con Excel y PDF; unidades por presentación (bultos de papas, paquetes de salsas).
- **Agregado:** Recursos humanos abre y cierra el turno del día (Mañana/Tarde) y se ve quién marcó cada entrada.
- **Cambiado:** el puesto «Nómina» pasa a llamarse «Recursos humanos» en pantalla; cabecera compacta en celular; botón atrás del celular recorre pantallas sin sacar de la app; Logística no ve dinero; «Personal activo hoy» sin choferes ni administración; punto de equilibrio dice «No calculado» si faltan datos.
- **Corregido:** desbordes de pantalla en celular.

### Sin número · 2026-11-16 · `3e30e7a2` (commit `f6b5ad4`) · migración 0025
- **Cambiado:** de 10 a **6 puestos**: Gerencia, Administración, Producción, Logística, Ventas y Nómina. Entrada «Elige tu puesto» con 6 tarjetas. Los permisos se reiniciaron a lo esencial (el Gerente los amplía en Ajustes).
- **Agregado:** pantalla Logística › Empacar. Reversa disponible: `0025_puestos_seis_reversa.sql`.

### Sin número · 2026-11-16 · `622aeabe`
- **Agregado:** Sentry, reporte de errores sin datos personales (no cambia nada visible para el usuario).

### Sin número · 2026-11-16 · `81a4fe45` (commit probable `36f2e4b`)
- **Cambiado:** pantallas largas en pestañas (planta, comparar, equipo, bultos) y pedido sin scroll lateral en celular.

### Sin número · 2026-11-16 · `9d886edc` (commit `36bd6e9`)
- **Agregado:** «Primeros pasos» en Ayuda (48 pasos por puesto); horario de turnos fácil; pantallas unidas en pestañas.

### Sin número · 2026-11-16 · `3fec57ca` (commit probable `df4e847`)
- **Agregado:** resumen de Administración, zonas de Empaque, tarjetas «Quién debe», marcas y nómina, turnos y bonos, solicitudes de autorización, auditoría protegida (borrar ahora anula).

### Sin número · 2026-11-16 · `19b406e2`
- Contenido por confirmar (no hay registro).

### Sin número · 2026-11-15 · `c9d21c50` (commit probable `b7fe730`)
- **Agregado:** producción por zonas, herencia entre etapas, compras, flota, PDF de notas y facturas, pantallas compactas. Detalle en `CAMBIOS.md`.

### Antes de la primera publicación en Cloudflare · 2026-11-14 · commit `78fff00`
- Versión inicial del sistema y su bitácora de cambios (ventas, tasa BCV automática, precios por bulto, bancos, portal del cliente). No consta ID de Cloudflare.
