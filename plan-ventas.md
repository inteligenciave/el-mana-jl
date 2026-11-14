# Plan: Módulo de Ventas y Liquidación Dual (con "Cargar pagos")

Un solo módulo, dos partes: **vender** (Mayra, Ventas) y **cobrar/liquidar** (Rachell, Administración). El Dueño aprueba.
Fuente: Manual Técnico del Módulo de Ventas V2.0 + órdenes del dueño. No se despliega nada: solo copia local (puerto 8799, `--local`).

## 1. Capas (arquitectura-sdd-soc)
- `migrations/0002_ventas.sql`: contrato de datos (SQL).
- `src/ventas/dominio.js`: reglas puras (precios por caso, liquidación, IVA, duplicados, validación). Sin BD ni HTTP. Se inlinea también en la página.
- `src/ventas/repo.js`: ÚNICA capa que toca D1. `src/ventas/servicio.js`: casos de uso (vender, liquidar, cobrar, anular, importar). `src/ventas/rutas.js`: HTTP + permisos + auditoría. `src/worker.js` solo delega `/api/v/*`.
- `front/ventas/*.js|css`: UI en archivos propios; `build.js` los inyecta en `public/index.html`. La UI solo habla con `/api/v/*`, nunca con la BD.

## 2. Contrato de datos (tablas nuevas, nombres del manual)
`clientes` (rif_id UNIQUE, razon_social, modalidad_despacho_pref, id_lista_base, descuento_fijo_pct, dias_pronto_pago, dias_credito_normal, limite_credito_usd, saldo_deuda_usd, id_vendedor) · `reglas_precio_tiempo_cliente` (UNIQUE cliente+producto; 3 precios + 2 %) · `productos` (CHECK stock_entero >= 0) · `documentos_venta` (+ `afecta_inventario`, `id_ne_origen`, `origen` manual/importado) · `notas_ajuste_fiscal` (NC/ND) · `auditoria_sistema` (además se refleja en la colección `auditoria` que ya usa el sistema). Apoyo: `vendedores`, `listas_precio`, `documento_lineas` (precios congelados al vender), `movimientos_inventario`, `pagos`, `pago_aplicaciones`, `comisiones`, `asientos_contables`, `secuencias`, `config`. Importes en dólares guardados en **centavos enteros** en las tablas nuevas (las columnas DECIMAL del manual se exponen como dólares en la API). Todas llevan `ejemplo` 0/1.
Saldo de un documento = total − abonos activos (se calcula; `saldo_deuda_usd` del cliente es caché recalculada en cada escritura).

## 3. Reglas de negocio (lo que dice el manual; nada inventado)
- Días = fecha de pago − fecha de emisión. Caso 1 ≤ dias_pronto_pago; Caso 2 hasta dias_credito_normal; Caso 3 más. Si un umbral está vacío, ese caso no existe.
- Precio por caso: precio fijo de la regla, o % sobre el base; si no hay ninguno, el precio no cambia. Porcentajes, días, límites y precios por cliente son campos editables; en el ejemplo llevan "EJEMPLO".
- IVA 16 % (columna `alicuota_iva` por producto, editable). Límite de crédito: pedido > límite − deuda ⇒ se bloquea (sin límite cargado ⇒ no se verifica).
- Fase 1: NOTA DE ENTREGA o FACTURA descuentan stock entero (cantidades enteras validadas en UI y en servidor). NE: sin débito fiscal. Factura: inmutable.
- Fase 2 Ruta A (salió con NE): al liquidar se emite la factura con los precios del caso, `afecta_inventario = 0`, y la NE pasa a `FACTURADO_DESDE_NE`. Ruta B (salió con factura): Caso 1 ⇒ nota de crédito, Caso 3 ⇒ nota de débito (base + IVA, referencia a la factura), Caso 2 ⇒ recibo simple.
- Un documento se liquida cuando lo abonado alcanza el neto del caso de la fecha de ese pago; antes es abono parcial (el caso se decide por la fecha del pago que completa). Es una decisión mía (el manual no trata abonos): **por confirmar**.
- Candado: fecha de pago anterior a hoy, o exonerar recargo de mora ⇒ PIN de gerencia (se guarda solo su huella SHA-256; sin PIN configurado no se permite) + auditoría.
- Comisión: sobre la base neta cobrada sin IVA, al liquidar. El % del vendedor es campo editable vacío (no se inventa).
- Asientos: los dos del manual (Ruta B caso 1 y caso 3) más los de emisión y cobro; nombres de cuenta por confirmar con el contador.
- Fiscal: numeración fiscal y membrete son configurables (`config`). El formato legal (máquina fiscal o imprenta, SENIAT, talonarios matriz/sucursal) está **por confirmar con el contador**; no se afirma cumplimiento.

## 4. Cobranza / pagos
Pago = fecha, cliente, monto Bs, tasa (la escribe Rachell), USD = Bs ÷ tasa, banco, referencia, aplicaciones a una o varias notas/facturas (un documento admite varios abonos). Anular = marcar con motivo (nunca borrar); no se anula un pago que liquidó un documento con detalle (haría falta una nota de crédito: por confirmar).
**Duplicados**: clave = banco normalizado + referencia normalizada (solo letras y números). Referencia de 6 o más caracteres ⇒ bloquea si coincide banco+referencia. Referencia corta (menos de 6, "últimos dígitos") ⇒ bloquea solo si además coincide el monto en Bs (dos pagos distintos pueden terminar igual); si coincide terminación y no el monto, avisa pero deja. También se compara una referencia corta con el final de una larga (mismo banco y monto). El aviso muestra el pago existente. Un índice único parcial en la BD evita la carrera de dos guardados a la vez. El umbral 6 es editable en `config`.
Salidas: recibo imprimible, lista por fecha/vendedor, "quién debe y desde cuándo" (días desde el despacho), CSV con BOM UTF-8 y `;`.

## 5. Importador único (Excel de cobranza, 15 columnas por libro de vendedor)
Columnas: VENDEDOR, ZONA, FECHA (despacho), N° N/E, CLIENTE, TOTAL FACTURAS, ABONO, TOTAL DEUDA, FECHA (pago), MONTO BS, TASA, $, BANCO, REFERENCIA, MES. Las filas sin vendedor/N/E son abonos extra de la nota anterior. Se lee en el navegador (SheetJS), vista previa, y limpieza asistida de nombres: se sugieren grupos ("X", "X 2", "X MARKET"); **nada se fusiona sin que la persona lo confirme**. Las notas importadas quedan "sin detalle de líneas" (se cobran por el monto del Excel, sin repreciar). Los abonos del Excel se importan como pagos "importado" (los sin referencia quedan marcados). Envío por lotes pequeños, idempotente. Solo lectura de los .xlsx; nada real a la base remota.

## 6. Permisos
Pantallas nuevas en la matriz: `v-pedido`, `v-cobro`, `v-pagos`, `v-deuda`, `v-clientes`, `v-importar`. Por defecto: ventas y administración registran; condiciones de crédito, anular pagos, PIN y membrete requieren nivel 3 (Dueño). El servidor re-verifica con la matriz guardada (cabecera `x-rol`; el sistema no tiene usuarios reales, igual que hoy).

## 7. Riesgos
Sin autenticación real (el rol es declarado). Numeración fiscal: puede dejar saltos si un guardado falla tras reservar el número. Tamaño de lotes D1. Fotos: marcador de marca. Anulación de ventas y de pagos que liquidaron: no incluida.
