/* Entrega con foto + temporizador de descuentos · DOMINIO PURO (sin base de datos, sin HTTP, sin pantalla).
   Lo usan el servidor y las páginas (build la inlinea quitando `export`, por eso no importa nada).
   Regla del dueño: los días de crédito corren DESDE la fecha y hora de la foto de entrega. Sin foto no arrancan.
   Tramo 1: hasta `dias_tramo1` días (descuento A) · Tramo 2: hasta `dias_tramo2` días (descuento B) · después: vencida (mora).
   NADA de porcentajes inventados: descuento A, descuento B y recargo llegan de la tabla ajustes_credito; vacíos = no se aplica nada. */

export const MS_DIA = 864e5;
export const AJUSTES_DEF = {dias_tramo1: 7, dias_tramo2: 21, descuento1_pct: null, descuento2_pct: null, recargo_mora_pct: null};
export const ESTADO_TXT = {SIN_VERIFICAR: 'Entrega sin verificar', TRAMO1: 'Descuento A vigente', TRAMO2: 'Descuento B vigente', VENCIDA: 'Vencida', PAUSADA: 'En pausa (reclamo abierto)'};

const pctOrNull = v => (v == null || v === '' || !Number.isFinite(Number(v))) ? null : Number(v);

/* Ajustes tal como vienen de la base (o vacíos): días enteros y porcentajes o null */
export function normalizarAjustes(a) {
  const x = a || {};
  const d1 = Number.isInteger(+x.dias_tramo1) && +x.dias_tramo1 > 0 ? +x.dias_tramo1 : AJUSTES_DEF.dias_tramo1;
  const d2 = Number.isInteger(+x.dias_tramo2) && +x.dias_tramo2 > d1 ? +x.dias_tramo2 : Math.max(AJUSTES_DEF.dias_tramo2, d1 + 1);
  return {dias_tramo1: d1, dias_tramo2: d2, descuento1_pct: pctOrNull(x.descuento1_pct), descuento2_pct: pctOrNull(x.descuento2_pct), recargo_mora_pct: pctOrNull(x.recargo_mora_pct)};
}
/* Lista de lo que el dueño todavía no cargó */
export function ajustesFaltantes(a) {
  const n = normalizarAjustes(a), f = [];
  if (n.descuento1_pct == null) f.push('descuento A (tramo 1)');
  if (n.descuento2_pct == null) f.push('descuento B (tramo 2)');
  if (n.recargo_mora_pct == null) f.push('recargo por mora');
  return f;
}
/* Valida lo que escribe el dueño. Devuelve {error} o {ajustes}. Campo vacío = null (sin cargar). */
export function validarAjustes(b) {
  const x = b || {}, num = v => (v === '' || v == null) ? null : Number(v);
  const d1 = num(x.dias_tramo1), d2 = num(x.dias_tramo2);
  if (!Number.isInteger(d1) || d1 < 1 || d1 > 365) return {error: 'Los días del tramo 1 deben ser un entero entre 1 y 365.'};
  if (!Number.isInteger(d2) || d2 > 3650) return {error: 'Los días del tramo 2 deben ser un entero.'};
  if (d2 <= d1) return {error: 'Los días del tramo 2 deben ser mayores que los del tramo 1.'};
  const out = {dias_tramo1: d1, dias_tramo2: d2};
  for (const [k, t] of [['descuento1_pct', 'El descuento A'], ['descuento2_pct', 'El descuento B'], ['recargo_mora_pct', 'El recargo por mora']]) {
    const v = num(x[k]);
    if (v != null && (!Number.isFinite(v) || v < 0 || v > 100)) return {error: t + ' debe ser un porcentaje entre 0 y 100 (o quedar vacío).'};
    out[k] = v == null ? null : Math.round(v * 100) / 100;
  }
  return {ajustes: out};
}

/* Milisegundos en pausa dentro de [entrega_ts, ahora]. pausas = [{desde_ts, hasta_ts|null}] (null = sigue abierta). */
export function pausadoMs(pausas, entregaTs, ahora) {
  let t = 0;
  for (const p of pausas || []) {
    const d = Math.max(p.desde_ts, entregaTs), h = Math.min(p.hasta_ts == null ? ahora : p.hasta_ts, ahora);
    if (h > d) t += h - d;
  }
  return t;
}

/* EL TEMPORIZADOR. entrega_ts = instante de la foto (null/undefined = sin foto válida: no arranca).
   Devuelve el estado, los días, cuánto falta para que termine el tramo y el descuento o recargo VIGENTE (null si el dueño no lo cargó). */
export function calcularTemporizador({entrega_ts, ahora, pausas = [], ajustes}) {
  const a = normalizarAjustes(ajustes), ml = ajustesFaltantes(a);
  const base = {dias_tramo1: a.dias_tramo1, dias_tramo2: a.dias_tramo2, ajustes_faltantes: ml, descuento_pct: null, recargo_pct: null, aplica_ajuste: false, aviso: null};
  if (entrega_ts == null) return {...base, estado: 'SIN_VERIFICAR', tramo: 0, corre: false, pausada: false, dias: null, transcurrido_ms: null, restante_ms: null, vence_ts: null, caso: null, dias_vencida: null};
  const pausada = (pausas || []).some(p => p.hasta_ts == null);
  const ef = Math.max(0, ahora - entrega_ts - pausadoMs(pausas, entrega_ts, ahora)); // tiempo corrido, sin las pausas
  const t1 = a.dias_tramo1 * MS_DIA, t2 = a.dias_tramo2 * MS_DIA;
  const tramo = ef <= t1 ? 1 : ef <= t2 ? 2 : 3, fin = tramo === 1 ? t1 : tramo === 2 ? t2 : null;
  const descuento = tramo === 1 ? a.descuento1_pct : tramo === 2 ? a.descuento2_pct : null, recargo = tramo === 3 ? a.recargo_mora_pct : null;
  const restante = fin == null ? 0 : fin - ef;
  let aviso = null;
  if (tramo === 1 && descuento == null) aviso = 'El Dueño todavía no cargó el descuento A: se muestran los días pero no se aplica descuento.';
  else if (tramo === 2 && descuento == null) aviso = 'El Dueño todavía no cargó el descuento B: se muestran los días pero no se aplica descuento.';
  else if (tramo === 3 && recargo == null) aviso = 'Vencida. El Dueño todavía no cargó el recargo por mora: no se aplica recargo.';
  return {...base, estado: pausada ? 'PAUSADA' : tramo === 1 ? 'TRAMO1' : tramo === 2 ? 'TRAMO2' : 'VENCIDA', tramo, corre: !pausada, pausada,
    dias: Math.floor(ef / MS_DIA), transcurrido_ms: ef, restante_ms: restante, vence_ts: (pausada || fin == null) ? null : ahora + restante,
    dias_vencida: tramo === 3 ? Math.floor((ef - t2) / MS_DIA) : null,
    descuento_pct: descuento, recargo_pct: recargo, aplica_ajuste: (tramo < 3 ? descuento : recargo) != null, aviso,
    caso: tramo === 1 ? 1 : tramo === 2 ? 2 : 3}; // caso del manual: 1 pronto pago · 2 en plazo · 3 vencido (mora)
}

/* Cuenta regresiva legible: «6 d 04 h 12 min» */
export function textoRestante(ms) {
  if (ms == null) return '—';
  if (ms <= 0) return '0 min';
  const d = Math.floor(ms / MS_DIA), h = Math.floor(ms % MS_DIA / 36e5), m = Math.floor(ms % 36e5 / 6e4);
  return d > 0 ? `${d} d ${String(h).padStart(2, '0')} h ${String(m).padStart(2, '0')} min` : h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}

/* Cuánto pagar hoy, en centavos de dólar. El descuento o el recargo se aplican al total del documento (base e IVA en la misma proporción)
   y se descuenta lo ya abonado. Sin porcentaje cargado, el monto es el normal. */
export function montoHoy({total_cents, pagado_cents = 0, temporizador}) {
  const t = temporizador || {}, pct = t.descuento_pct != null ? -t.descuento_pct : (t.recargo_pct != null ? t.recargo_pct : 0);
  const normal = Math.max(0, total_cents - pagado_cents);
  const ajustado = Math.max(0, Math.round(total_cents * (1 + pct / 100)) - pagado_cents);
  return {normal_cents: normal, hoy_cents: ajustado, diferencia_cents: ajustado - normal, aplica: pct !== 0 && t.aplica_ajuste === true};
}
export const usdABs = (cents, tasa) => (tasa > 0 && cents != null) ? Math.round(cents * tasa) : null; // centavos de Bs

/* Integración con el motor de liquidación de Ventas (aislada). `liqBase` es lo que devolvió calcularLiquidacion() con las reglas de siempre.
   Si no hay foto, o el dueño no cargó el porcentaje del tramo actual, devuelve `liqBase` SIN TOCAR (los cobros existentes no cambian).
   Si hay porcentaje, rehace el neto con el descuento/recargo del tramo (Ruta A: factura con el ajuste · Ruta B: nota de crédito/débito) sobre `liqNeutra`
   (la liquidación calculada con precios base, caso «en plazo»).
   Uso: const neutra = calcularLiquidacion({...args, cliente: {dias_pronto_pago: null, dias_credito_normal: null}});
        const liq = ajustarLiquidacion(calcularLiquidacion(args), neutra, temporizador, doc); */
export function ajustarLiquidacion(liqBase, liqNeutra, temporizador, doc) {
  const t = temporizador;
  if (!t || !t.aplica_ajuste || liqNeutra.ruta == null) return {...liqBase, entrega: t ? {estado: t.estado, tramo: t.tramo, dias: t.dias, ajuste_aplicado: false} : null};
  const pct = t.descuento_pct != null ? -t.descuento_pct : t.recargo_pct, k = 1 + pct / 100;
  const mk = o => ({base: Math.round(o.base * k), iva: Math.round((o.iva || 0) * k), total: Math.round(o.base * k) + Math.round((o.iva || 0) * k)});
  const info = {estado: t.estado, tramo: t.tramo, dias: t.dias, ajuste_aplicado: true, pct};
  const out = {...liqNeutra, dias: t.dias, caso: t.caso, casoCalculado: t.caso, exonerado: false, entrega: info};
  const orig = liqNeutra.final; // en Ruta B es el documento original; en A, el total con precios base
  if (liqNeutra.ruta === 'SIN_DETALLE') { const f = mk({base: doc.total_cents, iva: 0}); out.final = f; out.neto_cents = f.total; return out; }
  const fin = mk(orig);
  if (liqNeutra.ruta === 'A') { out.final = {...orig, base: fin.base, iva: fin.iva, total: fin.total}; out.neto_cents = fin.total; out.comision_base_cents = fin.base; return out; }
  // Ruta B: la factura no se toca; la diferencia sale en una nota
  const dif = {base: Math.abs(orig.base - fin.base), iva: Math.abs(orig.iva - fin.iva)}, tot = dif.base + dif.iva;
  if (pct < 0 && tot > 0) { out.nota = {tipo: 'NOTA_CREDITO', base: dif.base, iva: dif.iva, total: tot, motivo: 'Descuento por pago en el tramo ' + t.tramo + ' desde la entrega'}; out.neto_cents = orig.total - tot; }
  else if (pct > 0 && tot > 0) { out.nota = {tipo: 'NOTA_DEBITO', base: dif.base, iva: dif.iva, total: tot, motivo: 'Recargo por pago vencido (desde la entrega)'}; out.neto_cents = orig.total + tot; }
  else out.neto_cents = orig.total;
  out.comision_base_cents = fin.base;
  return out;
}

/* Valida una foto ya comprimida: JPEG en base64, tamaño acotado */
export const MAX_FOTO_CHARS = 450000, MAX_MINI_CHARS = 40000;
export function validarFoto(foto, mini) {
  const b64 = s => typeof s === 'string' && s.length > 100 && /^[A-Za-z0-9+/]+={0,2}$/.test(s) && s.startsWith('/9j/');
  if (!b64(foto)) return 'La foto no es una imagen JPEG válida.';
  if (foto.length > MAX_FOTO_CHARS) return 'La foto sigue siendo demasiado grande después de comprimirla.';
  if (mini != null && mini !== '' && (!b64(mini) || mini.length > MAX_MINI_CHARS)) return 'La miniatura no es válida.';
  return null;
}
export const bytesDeB64 = s => Math.floor(String(s).length * 3 / 4) - (String(s).endsWith('==') ? 2 : String(s).endsWith('=') ? 1 : 0);
