# Plan: «todo justificado según lo que hereda»

Para: el Dueño. Hecho por: Planificador. Fecha: 15-11-2026.
Alcance: solo copia local (`wrangler dev --local`, puerto 8799). Nada se despliega ni se migra en remoto sin tu autorización.
Este documento es solo un plan: no se cambió ningún archivo del sistema ni la base.

---

## 0. La regla en una frase

**Cada etapa solo puede usar lo que le llegó de la etapa anterior.** Si alguien intenta usar más, el sistema lo frena. Si la diferencia es real (merma, conteo, ajuste), la persona escribe el motivo, queda registrada y la aprueba el Jefe de producción. El Dueño ve todas.

Decisiones ya cerradas por ti (no se vuelven a preguntar):
- (a) Ninguna etapa usa más de lo que heredó.
- (b) Vale para todo el recorrido: pedir, recibir, producir, empacar, inventario, vender, cargar y despachar.
- (c) Si no cuadra: se bloquea y se pide motivo; queda registrado.
- (d) Aprueba el Jefe de producción; el Dueño ve todas.

**Esto reemplaza una decisión anterior.** En `plan-recorrido.md` (P3) quedó «merma: solo se muestra la diferencia; la causa es opcional». Con esta orden, la causa pasa a ser **obligatoria** y la diferencia necesita aprobación.

**No se duplica trabajo:** otro agente está bloqueando ahora el «avanzar etapa sin kilos» y el «cerrar turno en cero» (`src/produccion/servicio.js`, mensaje `MSG_KILOS`, líneas 194–233). Este plan empieza después de eso y lo da por hecho (Fase H0).

---

## 1. Lo que hay hoy (leído en el código)

| Paso | Dónde vive hoy | ¿Ya frena el exceso? |
|---|---|---|
| Pedir al proveedor | Colección vieja `solicitudes_compra` (JSON en `docs`). Estado «Pedida al proveedor» con kg esperados **aún no existe** (decidido en P4, sin construir). | No |
| Recibir | Colección vieja `recepciones` (JSON), escrita desde la pantalla por `/api/batch` sin reglas del servidor. Tiene kg facturados (`qf`) y kg de balanza (`kgRec`). | No |
| Producir (recepción, lavado, fritado) | `turnos` + `movimientos_proceso` (kilos que ENTRAN y SALEN por etapa). El turno **no está atado** a una recepción. | Solo «hay kilos en la etapa anterior» (no compara cantidades) |
| Empacar | `empaque_turno` (bultos por producto). Exige kilos en empacado > 0. | No compara bultos × kg por bulto contra kilos fritos |
| Inventario | `cerrarTurno` suma bultos declarados a `productos.stock_entero`; compara declarado contra registrado y crea ajustes **sin motivo ni aprobación**. | Parcial: bultos declarados sin anotar se rechazan; declarar MÁS de lo anotado se acepta |
| Vender / apartar | `pedidos_venta`; disparador `trg_apartado_maximo` impide apartar más de lo que hay. | **Sí** (bloqueo duro) |
| Cargar el camión | `salidas` (estado ARMANDO). El conteo al cargar (P7) **no existe**. | Armar no pasa lo apartado libre (**sí**); cargar no existe |
| Despachar | `despachar` emite documento con lo armado. | Sí contra el pedido; no contra lo cargado (no hay carga) |
| Llegada al cliente | `entregas`: total de bultos distinto → disputa y pausa del reloj. | Sí (ya existe) |

«Mis tareas» (`/api/r/tareas`, plan-recorrido R2) **todavía no existe**.

---

## 2. Tabla etapa por etapa

«Exceso» = intentar usar más de lo heredado. «Faltante» = usar o declarar menos (merma, pérdida, error).

| # | Etapa | Qué hereda | De qué registro sale | Límite que se valida | Si se pasa | Si falta | Quién aprueba | Mensaje (lenguaje simple) |
|---|---|---|---|---|---|---|---|---|
| 1 | Pedir al proveedor | Lo que pidió el almacén | `solicitudes_compra` (cantidad pedida) | Lo pedido al proveedor ≤ lo solicitado | Motivo obligatorio → diferencia en espera | Se permite (se pide menos) sin motivo | Jefe de producción | «Estás pidiendo más de lo que se solicitó. Escribe por qué.» |
| 2 | Recibir | Kg esperados del pedido al proveedor | Solicitud «pedida al proveedor» | Kg de balanza ≤ kg esperados | Motivo obligatorio; la recepción queda **en espera** hasta aprobar | Motivo obligatorio (faltó mercancía); la recepción sigue | Jefe de producción (Adm. lo ve al validar) | «Llegó más de lo pedido (X kg de más). Escribe por qué.» / «Llegó menos de lo pedido. Escribe qué pasó.» |
| 3 | Producción · entrada (recepción del turno) | Kg de recepciones validadas y aún sin usar | `recepciones` validadas, menos lo ya tomado por otros turnos | Kg que entran al turno ≤ kg validados libres | **Bloqueo duro** (no se puede usar papa que no se recibió) | — | — | «Solo quedan X kg de papa recibida. No puedes anotar más.» |
| 4 | Lavado | Kg que salieron de recepción | `movimientos_proceso` (SALE de recepción, menos lo que ya entró a lavado) | Entra a lavado ≤ disponible | Motivo → movimiento **en espera** | Lo que no pasa se queda como saldo; se explica al cerrar | Jefe de producción | «Solo llegaron X kg de recepción. No puedes lavar más sin explicar por qué.» |
| 5 | Fritado | Kg que salieron de lavado | Igual, SALE de lavado | Entra a fritado ≤ disponible | Motivo → en espera | Igual | Jefe de producción | «Solo hay X kg lavados. No puedes freír más sin explicar por qué.» |
| 6 | Empacado (kilos) | Kg que salieron de fritado | Igual, SALE de fritado | Entra a empacado ≤ disponible | Motivo → en espera | Igual | Jefe de producción | «Solo hay X kg fritos. No puedes empacar más sin explicar por qué.» |
| 4–6 | Salida de cada etapa | Lo que entró a esa misma etapa | ENTRA de la etapa | Sale ≤ entró | Motivo → en espera | — | Jefe de producción | «De esta etapa no puede salir más de lo que entró (X kg).» |
| 7 | Empacado (bultos) | Kg que entraron a empacado | ENTRA de empacado | Bultos × kg por bulto ≤ kg en empacado | Motivo → en espera | Sobrante de kilos se explica al cerrar | Jefe de producción | «Con X kg solo salen N bultos de este producto. Escribe por qué hay más.» |
| 8 | Inventario (cierre de turno) | Bultos anotados en el turno | `empaque_turno` | Bultos declarados ≤ anotados | **Bloqueo duro** (primero se anotan) | Motivo obligatorio por producto | Jefe de producción | «Anotaste N bultos y declaras menos. Escribe qué pasó.» |
| 8 | Cierre: saldo de cada etapa | Lo registrado en cada etapa | Saldo ENTRA − SALE | Declarado = registrado | Sobra: motivo → en espera | Merma: motivo (o merma esperada, ver §4) | Jefe de producción | «En fritado quedaron X kg sin explicar. Escribe qué pasó (merma, error, otro).» |
| 9 | Vender / apartar | Bultos disponibles | `stock_entero − stock_apartado` | Pedido ≤ disponible | **Bloqueo duro** (ya existe) | — | — | «Sin inventario: solo hay N bultos disponibles.» (ya existe) |
| 10 | Armar salida | Bultos apartados sin salida | `pedido_venta_lineas` pendientes | Armado ≤ libre (ya existe) | **Bloqueo duro** (ya existe) | — | — | (ya existe) |
| 11 | Cargar el camión (nuevo) | Bultos armados en la salida | `salida_lineas` | Cargado ≤ armado | **Bloqueo duro** | Motivo; lo que faltó vuelve a pendiente del pedido (P7) | Jefe de producción | «Se armaron N bultos y cargaste menos. Escribe qué pasó; lo que falta queda pendiente.» |
| 12 | Despachar | Bultos cargados | `salida_lineas.bultos_cargados` | El documento se emite con lo cargado, no con lo armado | **Bloqueo duro** | — | — | «Primero cuenta lo que subió al camión.» |
| 13 | Llegada al cliente | Bultos despachados | Documento emitido | Ya existe: total distinto → disputa | (ya existe) | (ya existe) | Dueño (ya existe) | (ya existe) |

**Bloqueo duro vs. bloqueo con motivo.** Donde algo no existe físicamente (papa no recibida, bultos no anotados, inventario no disponible, bultos no cargados) no hay motivo que lo arregle: se frena siempre. Donde el peso o el conteo real puede diferir (balanza, agua, merma), se frena y se pide motivo.

**Lo que «sobra» queda en espera; lo que «falta» se explica.** Un exceso con motivo no se puede usar en la etapa siguiente hasta que el Jefe lo apruebe (así nadie trabaja con kilos dudosos). Un faltante (merma) se registra con su motivo y la operación sigue; el Jefe aprueba la explicación después. (Pregunta 3.)

**Cómo se calcula «lo que llegó».** Disponible de una etapa = lo que salió de la etapa anterior − lo que ya entró a esta, contando todos los turnos (es el mismo saldo que hoy muestra «En proceso (kilos)»). Así, fritos que quedaron de ayer se pueden empacar hoy.

---

## 3. Modelo de datos mínimo (migración `0015_herencia.sql`, solo `--local`)

Se aplica con `npx wrangler d1 migrations apply <base> --local`. **Nunca `--remote`** sin tu autorización.

```sql
-- Diferencias: todo lo que no cuadra con lo heredado, con su motivo y su aprobación
CREATE TABLE IF NOT EXISTS diferencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  etapa TEXT NOT NULL CHECK (etapa IN ('pedido_proveedor','recepcion_mp','recepcion','lavado','fritado','empacado','cierre','carga')),
  origen_tipo TEXT NOT NULL,          -- 'turno' | 'recepcion' | 'solicitud' | 'salida'
  origen_id TEXT NOT NULL,            -- id del turno, recepción, solicitud o salida
  id_producto INTEGER,                -- solo bultos
  unidad TEXT NOT NULL CHECK (unidad IN ('kg','bultos')),
  heredado REAL NOT NULL,             -- lo que le llegó
  usado REAL NOT NULL,                -- lo que se quiso usar o se declaró
  diferencia REAL NOT NULL,           -- usado - heredado (positivo = sobra, negativo = falta)
  tipo TEXT NOT NULL CHECK (tipo IN ('MERMA','ERROR_ANOTACION','AJUSTE_BALANZA','FALTO_MERCANCIA','OTRO')),
  motivo TEXT NOT NULL,               -- mínimo 3 letras
  esperada INTEGER NOT NULL DEFAULT 0,-- 1 = dentro de la merma esperada que fijó el Dueño
  estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','APROBADA','RECHAZADA','AUTOMATICA')),
  retiene INTEGER NOT NULL DEFAULT 0, -- 1 = hay un movimiento en espera que solo cuenta si se aprueba
  creado_ts INTEGER NOT NULL, creado_rol TEXT,
  decidido_ts INTEGER, decidido_rol TEXT, nota_decision TEXT
);
CREATE INDEX IF NOT EXISTS dif_estado ON diferencias (estado, etapa);
CREATE INDEX IF NOT EXISTS dif_origen ON diferencias (origen_tipo, origen_id);

-- Movimientos de proceso en espera (exceso con motivo): no cuentan hasta aprobar
ALTER TABLE movimientos_proceso ADD COLUMN estado TEXT NOT NULL DEFAULT 'VIGENTE'; -- VIGENTE | EN_ESPERA | RECHAZADO
ALTER TABLE movimientos_proceso ADD COLUMN id_diferencia INTEGER;
ALTER TABLE empaque_turno ADD COLUMN estado TEXT NOT NULL DEFAULT 'VIGENTE';
ALTER TABLE empaque_turno ADD COLUMN id_diferencia INTEGER;

-- De qué recepciones vino la papa del turno (decisión P1 de plan-recorrido)
CREATE TABLE IF NOT EXISTS turno_recepciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_turno INTEGER NOT NULL, id_recepcion TEXT NOT NULL, kilos REAL NOT NULL CHECK (kilos > 0), ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS turec_rec ON turno_recepciones (id_recepcion);

-- Conteo al cargar el camión (P7) sin rehacer la tabla salidas
ALTER TABLE salidas ADD COLUMN cargada_ts INTEGER;
ALTER TABLE salidas ADD COLUMN cargada_rol TEXT;
ALTER TABLE salida_lineas ADD COLUMN bultos_cargados INTEGER;

-- Ajustes vacíos: el sistema no inventa cifras
INSERT OR IGNORE INTO config (clave, valor) VALUES
 ('merma_esperada_pct_lavado',''), ('merma_esperada_pct_fritado',''), ('merma_esperada_pct_empacado',''),
 ('herencia_desde_ts','');          -- momento en que se activó la regla (lo anterior no se revisa)
```

Notas:
- No se cambian reglas de tablas existentes (no se rehace ninguna tabla), solo se agregan columnas con valor por defecto: lo de hoy queda «VIGENTE».
- Todas las sumas de proceso (`sumasTurno`, `proceso`) pasan a contar solo `estado = 'VIGENTE'`.
- Cada aprobación o rechazo también va a `auditoria_sistema` (como ya se hace).
- Pedir y recibir viven en colecciones viejas (JSON). Para validarlos en el servidor hace falta una ruta propia (hoy la pantalla las escribe por `/api/batch` sin reglas). Eso es la Fase H6.

---

## 4. Merma esperada (sin inventar porcentajes)

- Cada etapa (lavado, fritado, empacado) pierde peso de forma natural. El sistema **no** sabe cuánto es normal y **no** lo supone.
- Ajuste nuevo que **solo el Dueño** carga: «merma esperada máxima» por etapa, en % de lo que entró en el turno. Empieza vacío.
- Con el ajuste **vacío**: toda diferencia pide motivo y va al Jefe (con un toque se elige «Merma del proceso» como motivo).
- Con el ajuste **cargado**: si la merma del turno está dentro del máximo, se registra sola como «merma normal» (estado AUTOMATICA, sin aprobación, se ve en los KPI). Si pasa del máximo, pide motivo y va al Jefe.
- La sugerencia del número sale de los datos reales: después de 4 semanas el sistema muestra al Dueño la merma real promedio por etapa (P9 de plan-recorrido) y él decide. Pregunta 1.
- El ajuste viejo `tolerancia_cierre_kg` (kilos, vacío) queda sin uso para no tener dos reglas; se pregunta si se borra al construir H3.

---

## 5. Pantallas y «Mis tareas»

**Al anotar (Turno, Empaque, Cargar, Recepción):**
- Junto a cada campo se ve en grande «Te llegaron X kg» (o «N bultos»).
- Si se escribe más, el botón cambia a «Explicar diferencia»: abre una ventana con el número de más o de menos, una lista corta de motivos (Merma del proceso, Error al anotar, Balanza, Faltó mercancía, Otro) y un campo de texto corto. Sin textos de ayuda.
- Lo que queda en espera se ve en ámbar con «Esperando al Jefe de producción».

**Al cerrar el turno:** por cada etapa con saldo distinto se pide el motivo antes de habilitar «Cerrar turno».

**Jefe de producción · «Mis tareas»:**
- Tarea «N diferencias por aprobar», con contador grande (P8: contador al abrir la pantalla, sin WhatsApp).
- Cada tarjeta: etapa, quién, cuánto llegó, cuánto se usó, la diferencia, el motivo. Dos botones: «Aprobar» y «Rechazar» (rechazar pide una frase).
- Si «Mis tareas» (plan-recorrido R2) aún no está construida, la misma lista va como pestaña «Diferencias» en la pantalla de Producción y el contador sale como insignia. Cuando exista R2, se agrega como una tarea más (sin rehacer nada).

**Dueño:** pestaña «Diferencias» con todas (pendientes, aprobadas, rechazadas, automáticas), filtro por etapa y fecha. Puede aprobar también.

---

## 6. KPIs para Gerencia (solo se calculan con lo registrado)

| KPI | Cómo se calcula |
|---|---|
| Merma por etapa (kg y %) | Diferencias de cierre tipo MERMA ÷ kg que entraron a la etapa, por turno y por semana |
| Merma normal vs. fuera de lo esperado | Cuenta de AUTOMATICA contra PENDIENTE/APROBADA (solo cuando el Dueño cargó el máximo) |
| Diferencias por etapa | Cantidad y kg/bultos por etapa y por tipo de motivo |
| Pendientes de aprobar | Cuántas y desde hace cuántas horas la más vieja |
| Tiempo de aprobación | Promedio entre `creado_ts` y `decidido_ts` |
| Rechazadas | % rechazadas por etapa (señal de anotaciones mal hechas) |
| Recibido vs. pedido | Kg recibidos − kg pedidos al proveedor, por proveedor |
| Faltantes al cargar | Bultos armados − cargados por salida y por zona |
| Disputas de llegada | Ya existen en `entregas`; solo se suman al tablero |

Ruta: `GET /api/p/kpi-diferencias?desde=&hasta=`. La ven el Dueño y quien hoy ve Gerencia. Sin metas inventadas: las metas salen de P9 (últimas 4 semanas, el Dueño ajusta).

---

## 7. Datos que ya existen y turnos cerrados

- **Turnos cerrados:** no se tocan. Su `cierre_json` sigue igual. No se crean diferencias para el pasado (Pregunta 5).
- **Fecha de activación:** al terminar H2 se guarda `herencia_desde_ts`. Las reglas valen desde ese momento. Los KPI empiezan ahí.
- **Turno abierto al activar:** lo ya anotado cuenta como VIGENTE; lo que se anote después pasa por la regla. Al cerrar, se aplica la regla nueva.
- **Salidas armadas antes de activar el conteo de carga (H5):** se pueden despachar como hoy (sin conteo); las nuevas exigen cargar primero.
- **Recepciones viejas:** las validadas antes de H4 quedan disponibles para tomar en turnos con sus kg de balanza; no se exige que tengan pedido al proveedor.
- **Datos de prueba** UATA-/UATB-/UATF1-, PED-00000x, SAL-0000x quedan; no afectan.
- **Respaldo** antes de migrar: copiar la base local (como `respaldo-pre-uat/`) en `respaldo-pre-herencia/`.

---

## 8. Riesgos

1. **Frenar el trabajo real:** si el Jefe no está, lo que sobra queda en espera. Mitigación: el Dueño también puede aprobar; los faltantes no frenan.
2. **Muchos motivos sin merma esperada:** fritado siempre pierde peso; mientras el Dueño no cargue el máximo, cada turno pedirá motivo. Mitigación: motivo «Merma del proceso» de un toque.
3. **Pedir y recibir están en el sistema viejo (JSON):** hoy no tienen reglas en el servidor; un cambio por pantalla podría saltarse la validación. Mitigación: ruta propia en H6 y quitar la escritura directa de esas colecciones por `/api/batch` para quien no sea Dueño.
4. **Choque con el otro agente:** toca `src/produccion/servicio.js` ahora mismo. Mitigación: H0 espera a que termine y releer antes de editar.
5. **Archivos compartidos** (`app-source.html`, `build.js`, `pantallas.js`): un subagente por vez.
6. **Redondeos de kilos:** comparar con 3 decimales (`r3`, como hoy) para no pedir motivo por 0,0001 kg.
7. **El Jefe aprueba lo suyo:** según P2, el Jefe anota lavado y fritado; aprobar sus propias diferencias no controla nada (Pregunta 4). Nota: hoy el código solo deja anotar el turno a Producción y Dueño; el reparto de P2 depende de R2.
8. **Aprobar quien no ve el campo:** el Jefe aprueba diferencias de recepción y de carga, que no son de su área. Es tu decisión (d); Adm. igual las ve al validar.

---

## 9. Orden de construcción (fases pequeñas, un subagente Sonnet cada una)

Pruebas por API con `curl` contra `http://127.0.0.1:8799` y cabecera `x-rol`. Cada fase termina con `node build.js` sin errores y un informe corto.

**H0 · Comprobar el bloqueo de ceros (sin código nuevo).**
- Confirmar que el trabajo del otro agente quedó: avanzar etapa sin kilos → 400; cerrar turno en cero → 400.
- Acepta: dos `curl` devuelven 400 con mensaje simple.

**H1 · Migración 0015 + diferencias (servidor).** `migrations/0015_herencia.sql`, `src/produccion/dominio.js` (función pura `revisarHerencia(heredado, usado, mermaMaxPct)` → `{ok}`, `{exceso, dif}` o `{falta, dif, esperada}`), `repo.js`, `servicio.js`, `rutas.js`.
- Rutas: `GET /api/p/diferencias?estado=`, `POST /api/p/diferencias/:id/aprobar` `{nota}`, `POST /api/p/diferencias/:id/rechazar` `{nota}`, `GET /api/p/diferencias/contador`.
- Permisos nuevos: `aprobar: ['dueno','jefeprod']`; ver todas: `dueno`.
- Acepta: migración aplica en local sin error; Ventas al aprobar → 403; rechazar sin nota → 400; aprobar dos veces → 409; queda en `auditoria_sistema`.

**H2 · Herencia en lavado, fritado y empacado (kilos).**
- `registrarMovimiento`: entra ≤ disponible de la etapa anterior; sale ≤ entró. Exceso sin motivo → 409 `{codigo:'EXCEDE_HEREDADO', disponible}`. Con `{motivo, tipo}` → movimiento EN_ESPERA + diferencia PENDIENTE (`retiene=1`). Aprobar → VIGENTE; rechazar → RECHAZADO.
- Todas las sumas cuentan solo VIGENTE. Se guarda `herencia_desde_ts`.
- Acepta: recepción sale 100 → lavado entra 101 sin motivo = 409 con `disponible: 100`; con motivo = 200 y el saldo de lavado sigue en 0 hasta aprobar; tras aprobar = 101; tras rechazar = 0; fritado entra 50 de 60 lavados = 200 sin motivo.

**H3 · Empaque y cierre de turno.**
- `registrarEmpaque`: bultos × kg por bulto ≤ kg en empacado; exceso → igual que H2.
- `cerrarTurno`: bultos declarados > anotados → 409 duro; menos → motivo por producto. Saldo de etapa ≠ declarado → motivo por etapa; merma dentro del máximo cargado → AUTOMATICA. Sin motivo → 400 con la lista de etapas que faltan. Ajuste de merma esperada solo Dueño en `guardarAjustes`.
- Los faltantes no frenan el cierre (quedan PENDIENTE); un exceso PENDIENTE sí lo frena (pregunta 3).
- Acepta: producto 10 kg/bulto, 95 kg en empacado, 10 bultos sin motivo → 409; cierre con fritado registrado 70 y declarado 0 sin motivo → 400; con motivo → 200 y una diferencia MERMA −70; con máximo del Dueño cargado y merma dentro → AUTOMATICA; declarar 12 bultos con 10 anotados → 409.

**H4 · El turno toma papa de recepciones validadas.**
- `POST /api/p/turno/recepcion` `{id_recepcion, kilos}`: lee la recepción validada (colección `recepciones`), kg libres = `kgRec` − lo tomado en `turno_recepciones`. Exceso → 409 duro. Crea el movimiento ENTRA de recepción.
- Acepta: recepción validada de 500 kg, dos turnos toman 300 y 250 → el segundo 409 con `disponible: 200`; recepción no validada → 409.

**H5 · Cargar el camión y despachar lo cargado.**
- `POST /api/p/salidas/:id/cargar` `{lineas:[{id_linea, bultos}]}` (Empaque y despacho, Jefe, Dueño). Más que lo armado → 409 duro; menos → motivo → diferencia FALTA (carga) y esos bultos vuelven a pendiente del pedido.
- `despachar`: exige `cargada_ts` (salvo salidas armadas antes de activar) y emite con `bultos_cargados`.
- Acepta: salida de 10 → cargar 11 = 409; cargar 8 sin motivo = 400; con motivo = 200, el pedido queda con 2 pendientes y la nota sale con 8; despachar sin cargar = 409.

**H6 · Pedir al proveedor y recibir (depende de R4 de plan-recorrido).**
- Ruta propia para marcar la solicitud «pedida al proveedor» con kg esperados y para guardar la recepción; el servidor compara pedida ≤ solicitada y recibida ≤ esperada; diferencia con motivo; una recepción con exceso queda en espera y no se puede validar ni tomar en un turno hasta aprobarla.
- Quitar la escritura directa de `recepciones` y `solicitudes_compra` por `/api/batch` para los demás puestos.
- Acepta: esperados 1.000 kg, recibe 1.050 sin motivo = 409; con motivo = 200 y H4 no la deja tomar hasta aprobar; recibe 950 sin motivo = 400.

**H7 · Pantallas.** `front/produccion/*`, `front/pantallas/pantallas.js`, `app-source.html`, `build.js`.
- «Te llegaron X» junto a cada campo, ventana «Explicar diferencia», ámbar «Esperando al Jefe», pestaña «Diferencias» (Jefe y Dueño) con contador; tarea en «Mis tareas» si R2 existe.
- Acepta: sin scroll a 1366x768 y sin desborde a 375 px; las acciones de H2–H6 funcionan por clic; el contador baja al aprobar.

**H8 · KPIs.** `GET /api/p/kpi-diferencias` y tarjetas en Gerencia.
- Acepta: con los datos de prueba de H2–H5, cada KPI de §6 da el número que se calcula a mano; sin datos muestra «Sin datos», nunca un número inventado.

Orden: H0 → H1 → H2 → H3 → (H4 y H5 en paralelo) → H6 (cuando exista R4) → H7 → H8. H7 puede ir partiendo cuando H2 esté hecho si se fija antes el formato del 409.

---

## 10. Preguntas para el Dueño (6)

1. **¿Cómo se define la merma normal de cada etapa?**
   - a) **Tú cargas un máximo en % por etapa; dentro de eso se registra sola, por encima pide motivo y aprobación.** *(Recomendado: el Jefe solo revisa lo raro.)*
   - b) Toda merma pide motivo y aprobación siempre, sin máximo.
   - c) Un máximo en kilos por turno en vez de %.

2. **Mientras no cargues ese máximo, ¿qué pasa con la merma?**
   - a) **Pide motivo (un toque: «Merma del proceso») y va al Jefe.** *(Recomendado: cumple tu orden desde el primer día.)*
   - b) Se registra sola sin aprobación hasta que cargues el máximo.

3. **Cuando alguien usa MÁS de lo que le llegó y explica el motivo, ¿se puede usar ya?**
   - a) **No: queda en espera hasta que el Jefe lo apruebe.** *(Recomendado: nadie trabaja con kilos dudosos.)*
   - b) Sí, se usa ya y el Jefe aprueba después.

4. **Si el que anotó la diferencia es el propio Jefe de producción, ¿quién la aprueba?**
   - a) **El Dueño.** *(Recomendado: nadie se aprueba a sí mismo.)*
   - b) El mismo Jefe.

5. **¿Qué hacemos con los turnos que ya se cerraron?**
   - a) **Nada: la regla vale desde el día que se active.** *(Recomendado: no se reescribe el pasado.)*
   - b) Mostrar sus diferencias como «históricas», solo para leer.

6. **Si el Jefe rechaza una diferencia, ¿qué pasa?**
   - a) **Lo anotado se anula y la persona lo vuelve a anotar bien.** *(Recomendado: el número malo no queda contando.)*
   - b) Se queda anotado, marcado como rechazado, y lo corrige el Dueño.

## 11. Decisiones del Dueño (2026-11-15)
1. Merma: el Dueño carga un máximo en % por etapa; dentro del máximo se registra sola, por encima pide motivo y aprobación.
2. Sin máximo cargado: pide motivo («Merma del proceso») y va al Jefe.
3. Exceso con motivo: queda en espera hasta que el Jefe lo apruebe.
4. Si el Jefe anotó la diferencia: la aprueba el Dueño.
5. Turnos ya cerrados: no se tocan; la regla vale desde su activación.
6. Rechazo: lo anotado se anula y se vuelve a anotar bien.
7. Confirmado: reemplaza P3 de plan-recorrido.md; el motivo ahora es obligatorio.

## 12. Corrección del Dueño sobre la merma (2026-11-15) — REEMPLAZA decisiones 1 y 2 de la sección 11
- La merma NO se coloca ni tiene máximo en %: se CALCULA sola como la diferencia entre lo que sale de una etapa y lo que llega a la siguiente (ej.: salen 100 kg, llegan 99 → diferencia 1 kg).
- Ante cada diferencia el sistema pide elegir qué fue: «todavía está en la etapa anterior (no se sacó completo)» o «fue merma».
- Si no se sacó completo: ese kilo queda disponible en la etapa anterior para sacarlo después.
- Si fue merma: se justifica con botones de motivo (cáscara, tierra, aceite, derrame, otra con texto); las opciones las ajusta el Dueño. Se mide la merma real en los KPIs.
- Toda diferencia se justifica siempre; ya no hay máximo cargado a mano.
- El exceso (llega MÁS de lo que salió) sigue en espera hasta que el Jefe lo apruebe (decisión 3 vigente).
