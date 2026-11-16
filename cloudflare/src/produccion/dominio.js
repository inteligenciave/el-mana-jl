/* Dominio puro de Producción por zonas: kilos, tarjetas, semáforo, reglas de salida y cierre de turno.
   Sin base de datos, sin HTTP, sin pantalla. Importa solo el dominio de Ventas (kilos y totales). Ninguna cifra de negocio está escrita aquí:
   la meta de 15 t y los cortes vienen de los ajustes. */
import {totalesLineas, kilosDeBultos, diasEntre} from '../ventas/dominio.js';

export const ETAPAS = [{k: 'recepcion', t: 'Recepción'}, {k: 'lavado', t: 'Lavado'}, {k: 'fritado', t: 'Fritado'}, {k: 'empacado', t: 'Empacado'}];
export const etapaValida = k => ETAPAS.some(e => e.k === k);
export const nombreEtapa = k => (ETAPAS.find(e => e.k === k) || {t: k}).t;
export const SIN_ZONA = 'Sin zona';
const r3 = n => Math.round(n * 1000) / 1000;

/* Kilos: número mayor que cero (acepta coma decimal). Devuelve {ok, valor} o {ok:false, msg}. */
export function validarKilos(v, {permitirCero = false} = {}) {
  if (v === '' || v == null) return {ok: false, msg: 'Escribe los kilos.'};
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
  if (!Number.isFinite(n)) return {ok: false, msg: 'Los kilos deben ser un número.'};
  if (n < 0 || (!permitirCero && n === 0)) return {ok: false, msg: permitirCero ? 'Los kilos no pueden ser negativos.' : 'Los kilos deben ser mayores que cero.'};
  if (n > 10000000) return {ok: false, msg: 'Los kilos no parecen correctos.'};
  return {ok: true, valor: r3(n)};
}
export function validarBultos(v, {permitirCero = false} = {}) {
  const n = typeof v === 'number' ? v : (/^\d+$/.test(String(v ?? '').trim()) ? Number(String(v).trim()) : NaN);
  if (!Number.isInteger(n) || n < 0 || (!permitirCero && n === 0)) return {ok: false, msg: 'Los bultos deben ser un número entero' + (permitirCero ? '.' : ' mayor que cero.')};
  if (n > 9999999) return {ok: false, msg: 'Los bultos no parecen correctos.'};
  return {ok: true, valor: n};
}
/* Ajuste numérico opcional (vacío = sin definir). */
export function validarAjuste(v, nombre) {
  if (v === '' || v == null) return {ok: true, valor: ''};
  const n = Number(String(v).trim().replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0 || n > 10000000) return {ok: false, msg: nombre + ' debe ser un número mayor que cero (o déjalo vacío).'};
  return {ok: true, valor: String(r3(n))};
}

/* Pendiente de una línea de pedido: lo que falta despachar */
export const pendienteLinea = l => Math.max(0, l.bultos - l.bultos_despachados - l.bultos_anulados);
export const zonaDe = ped => ped.zona || SIN_ZONA;

/* Semáforo: solo verde y ámbar. Verde = la zona llegó a la meta. Ámbar solo si el Gerente cargó un corte y la zona ya lo pasó sin llegar.
   Sin corte cargado: ni ámbar ni nada, solo «llegó» o «no llegó». */
export function semaforo(kilos, meta, corteAmbar) {
  if (meta > 0 && kilos >= meta) return {color: 'verde', texto: 'Llegó a la meta'};
  if (corteAmbar > 0 && kilos >= corteAmbar) return {color: 'ambar', texto: 'Cerca de la meta'};
  return {color: null, texto: 'No llegó'};
}

/* Arma las tarjetas por zona. filas = líneas pendientes con datos de su pedido:
   {id_pedido, zona, fecha, descuento_pct, bultos, bultos_despachados, bultos_anulados, kg_por_bulto, precio_base_cents, alicuota}
   pausas = Set de zonas pausadas. Orden: kilos (más primero), espera (más antigua primero), dinero (más primero). Pausadas aparte. */
export function armarTarjetas(filas, {meta, corteAmbar, pausas = new Set(), hoy}) {
  const zonas = new Map(), porPedido = new Map();
  for (const f of filas) {
    const p = pendienteLinea(f); if (p <= 0) continue;
    const z = zonaDe(f);
    const zz = zonas.get(z) || zonas.set(z, {zona: z, kilos: 0, pedidos: new Set(), mas_antigua: f.fecha}).get(z);
    zz.kilos = r3(zz.kilos + p * f.kg_por_bulto); zz.pedidos.add(f.id_pedido); if (f.fecha < zz.mas_antigua) zz.mas_antigua = f.fecha;
    const kp = porPedido.get(f.id_pedido) || porPedido.set(f.id_pedido, {zona: z, desc: f.descuento_pct, lineas: []}).get(f.id_pedido);
    kp.lineas.push({cantidad: p, precio_base_cents: f.precio_base_cents, precio_pp_cents: f.precio_base_cents, precio_mora_cents: f.precio_base_cents, alicuota: f.alicuota});
  }
  for (const kp of porPedido.values()) { const z = zonas.get(kp.zona); z.cents = (z.cents || 0) + totalesLineas(kp.lineas, 0, kp.desc).total; }
  const out = [...zonas.values()].map(z => ({zona: z.zona, kilos: z.kilos, pedidos: z.pedidos.size, monto_cents: z.cents || 0, espera_dias: Math.max(0, diasEntre(z.mas_antigua, hoy)), mas_antigua: z.mas_antigua,
    falta_kg: meta > 0 ? Math.max(0, r3(meta - z.kilos)) : null, semaforo: semaforo(z.kilos, meta, corteAmbar), pausada: pausas.has(z.zona)}));
  const cmp = (a, b) => b.kilos - a.kilos || b.espera_dias - a.espera_dias || b.monto_cents - a.monto_cents || a.zona.localeCompare(b.zona);
  return {activas: out.filter(z => !z.pausada).sort(cmp), pausadas: out.filter(z => z.pausada).sort(cmp)};
}

/* Reglas para armar y despachar una salida. Devuelve {ok} o {ok:false, status, msg, codigo}. */
export function reglasSalida({rol, kilosSalida, kilosZona, meta, motivo, divide}) {
  const m = String(motivo || '').trim();
  if (meta > 0 && (kilosZona > meta || kilosSalida > meta) && rol !== 'dueno') return {ok: false, status: 403, codigo: 'DECIDE_DUENO', msg: 'La zona pasó de la meta: en ese caso decide el Gerente qué pedidos salen.'};
  if (meta > 0 && kilosSalida < meta && m.length < 3) return {ok: false, status: 400, codigo: 'MOTIVO', msg: 'Esta salida lleva menos de la meta. Escribe el motivo para despachar antes.'};
  if (divide && m.length < 3) return {ok: false, status: 400, codigo: 'MOTIVO', msg: 'Para dividir un pedido escribe el motivo.'};
  return {ok: true};
}

/* Cierre de turno: pone lado a lado lo declarado y lo registrado */
export function compararCierre({registradoEtapas, declaradoEtapas, registradoBultos, declaradoBultos, tolerancia}) {
  const tol = tolerancia > 0 ? tolerancia : null;
  const etapas = ETAPAS.map(e => { const reg = r3(registradoEtapas[e.k] || 0), dec = r3(declaradoEtapas[e.k] || 0), dif = r3(dec - reg); return {etapa: e.k, nombre: e.t, registrado_kg: reg, declarado_kg: dec, diferencia_kg: dif, fuera_tolerancia: tol != null && Math.abs(dif) > tol}; });
  const ids = new Set([...Object.keys(registradoBultos), ...Object.keys(declaradoBultos)]);
  const bultos = [...ids].map(id => { const reg = registradoBultos[id] || 0, dec = declaradoBultos[id] || 0; return {id_producto: +id, registrado: reg, declarado: dec, diferencia: dec - reg}; });
  return {etapas, bultos, tolerancia_kg: tol};
}

/* ---------- Herencia: cada etapa solo usa lo que le llegó ---------- */
export const TIPOS_DIF = [{k: 'MERMA', t: 'Merma del proceso'}, {k: 'ERROR_ANOTACION', t: 'Error al anotar'}, {k: 'AJUSTE_BALANZA', t: 'Balanza'}, {k: 'FALTO_MERCANCIA', t: 'Faltó mercancía'}, {k: 'OTRO', t: 'Otro'}];
export const tipoDifValido = k => TIPOS_DIF.some(t => t.k === k);
export const ETAPAS_MERMA = ['lavado', 'fritado', 'empacado'];
const SOLO_EXCESO = ['ERROR_ANOTACION', 'AJUSTE_BALANZA', 'OTRO'];
export const tipoParaExceso = t => SOLO_EXCESO.includes(t) ? t : 'OTRO';
export const motivoValido = m => String(m || '').trim().length >= 3;
/* Cuánto falta por llegar a una etapa y cuánto puede salir de ella (la merma se calcula, no se coloca).
   filas = sumas por etapa/sentido/ajuste de lo vigente desde que rige la regla. ajuste: 0 normal, 1 ajuste al cerrar, 2 «no se sacó completo» (vuelve a la etapa anterior, resta lo que falta por llegar), 3 devuelto al cerrar.
   mermasTrans = {etapa: kg} de merma ya justificada entre la etapa anterior y esa etapa.
   entra = kilos que salieron de la etapa anterior y todavía no llegan ni se justificaron; sale = kilos que están en la etapa y pueden salir. */
export function disponiblesProceso(filas, mermasTrans = {}) {
  const g = {}; for (const f of filas) g[`${f.etapa}|${f.sentido}|${f.ajuste ? f.ajuste : 0}`] = r3(f.kg || 0);
  const v = (e, s, a) => g[`${e}|${s}|${a}`] || 0, out = {};
  ETAPAS.forEach((e, i) => {
    const entra = r3(v(e.k, 'ENTRA', 0) + v(e.k, 'ENTRA', 1) + v(e.k, 'ENTRA', 2) + v(e.k, 'ENTRA', 3)), sale = r3(v(e.k, 'SALE', 0) + v(e.k, 'SALE', 1));
    const p = i > 0 ? ETAPAS[i - 1].k : null;
    out[e.k] = {entra: p ? Math.max(0, r3(v(p, 'SALE', 0) - v(p, 'ENTRA', 2) - v(e.k, 'ENTRA', 0) - (mermasTrans[e.k] || 0))) : null, sale: Math.max(0, r3(entra - sale))};
  });
  return out;
}
export const OPCIONES_FALTANTE = [{k: 'ANTERIOR', t: 'Todavía está en la etapa anterior (no se sacó completo)'}, {k: 'MERMA', t: 'Fue merma'}];
export const MSG_ENTRA = {
  lavado: n => `Solo llegaron ${n} kg de recepción. No puedes lavar más sin explicar por qué.`,
  fritado: n => `Solo hay ${n} kg lavados. No puedes freír más sin explicar por qué.`,
  empacado: n => `Solo hay ${n} kg fritos. No puedes empacar más sin explicar por qué.`
};
export {kilosDeBultos};
