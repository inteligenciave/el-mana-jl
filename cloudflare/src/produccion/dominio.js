/* Dominio puro de Producción por zonas: kilos, tarjetas, semáforo, reglas de salida y cierre de turno.
   Sin base de datos, sin HTTP, sin pantalla. Importa solo el dominio de Ventas (kilos y totales). Ninguna cifra de negocio está escrita aquí:
   la meta de 15 t y los cortes vienen de los ajustes. */
import {totalesLineas, kilosDeBultos, diasEntre} from '../ventas/dominio.js';

/* Etapas CON KILOS por defecto (las 4 de siempre). Desde la fase 5 el catálogo real vive en la tabla etapas_proceso (datos) y el servidor la lee;
   esta lista solo es el valor de respaldo cuando no hay catálogo. */
export const ETAPAS = [{k: 'recepcion', t: 'Recepción'}, {k: 'lavado', t: 'Lavado'}, {k: 'fritado', t: 'Fritado'}, {k: 'empacado', t: 'Empacado'}];
export const etapaValida = (k, etapas = ETAPAS) => etapas.some(e => e.k === k);
export const nombreEtapa = (k, etapas = ETAPAS) => (etapas.find(e => e.k === k) || {t: k}).t;
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
export function compararCierre({registradoEtapas, declaradoEtapas, registradoBultos, declaradoBultos, tolerancia, etapas: lista = ETAPAS}) {
  const tol = tolerancia > 0 ? tolerancia : null;
  const etapas = lista.map(e => { const reg = r3(registradoEtapas[e.k] || 0), dec = r3(declaradoEtapas[e.k] || 0), dif = r3(dec - reg); return {etapa: e.k, nombre: e.t, registrado_kg: reg, declarado_kg: dec, diferencia_kg: dif, fuera_tolerancia: tol != null && Math.abs(dif) > tol}; });
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
export function disponiblesProceso(filas, mermasTrans = {}, etapas = ETAPAS) {
  const g = {}; for (const f of filas) g[`${f.etapa}|${f.sentido}|${f.ajuste ? f.ajuste : 0}`] = r3(f.kg || 0);
  const v = (e, s, a) => g[`${e}|${s}|${a}`] || 0, out = {};
  etapas.forEach((e, i) => {
    const entra = r3(v(e.k, 'ENTRA', 0) + v(e.k, 'ENTRA', 1) + v(e.k, 'ENTRA', 2) + v(e.k, 'ENTRA', 3)), sale = r3(v(e.k, 'SALE', 0) + v(e.k, 'SALE', 1));
    const p = i > 0 ? etapas[i - 1].k : null;
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
export const msgEntra = (etapa, n, anterior = 'la etapa anterior') => MSG_ENTRA[etapa] ? MSG_ENTRA[etapa](n) : `Solo llegaron ${n} kg de ${anterior}. No puedes anotar más sin explicar por qué.`;
export {kilosDeBultos};

/* ---------- Fase 5: catálogo de etapas (datos), arranque, merma consolidada y panel ---------- */
/* Etapas principales con kilos, en orden: las que forman la cadena «no pasar más de lo que hay» */
export const etapasConKilos = cat => (cat || []).filter(e => e.activo && !e.padre && e.kilos).sort((a, b) => a.orden - b.orden).map(e => ({k: e.clave, t: e.nombre}));
/* Etapas principales y sus subetapas, para la lista de avance */
export function etapasLista(cat) {
  const act = (cat || []).filter(e => e.activo), subs = act.filter(e => e.padre).sort((a, b) => a.orden - b.orden);
  return act.filter(e => !e.padre).sort((a, b) => a.orden - b.orden).map(e => ({k: e.clave, nombre: e.nombre, orden: e.orden, kilos: !!e.kilos, sub: subs.filter(x => x.padre === e.clave).map(x => ({k: x.clave, nombre: x.nombre}))}));
}
export const claveEtapaValida = (k, cat) => (cat || []).some(e => e.activo && e.clave === k);

/* 5.1 Los cinco insumos críticos que deben estar disponibles antes de arrancar */
/* g = cómo se dice en el aviso: «la» (comprarla), «lo» (comprarlo) o «los» (comprarlos) */
export const INSUMOS_CRITICOS = [{codigo: 'papa', nombre: 'Papa cruda', g: 'la'}, {codigo: 'aceite', nombre: 'Aceite', g: 'lo'}, {codigo: 'agua', nombre: 'Agua', g: 'la'}, {codigo: 'sal', nombre: 'Sal', g: 'la'}, {codigo: 'quimicos', nombre: 'Químicos', g: 'los'}, {codigo: 'almidon', nombre: 'Almidón', g: 'lo'}, {codigo: 'bolsones', nombre: 'Bolsones', g: 'los'}];
export const MSG_SIN_PRESENTES = 'Nadie del grupo de planta ha marcado entrada. Recursos humanos debe registrar la asistencia.';
/* Una bolsa por presentación: con el nombre de la bolsa el aviso dice cuál falta */
export const msgFaltanBolsas = (hay, necesitas, nombre) => necesitas == null ? (nombre ? `Falta la «${nombre}». Administración debe comprarla y Producción recibirla.` : 'No hay bolsas de presentación. Administración debe comprarlas y Producción recibirlas.') : `Faltan bolsas${nombre ? ' de «' + nombre + '»' : ' de presentación'}: hay ${hay} y necesitas ${necesitas}. Administración debe comprarlas y Producción recibirlas.`;
export const MSG_SIN_CONTEO_BOLSAS = 'No se puede verificar las bolsas de presentación: Administración debe cargar el conteo inicial del inventario.';
export const MSG_SIN_GRUPO = 'No hay grupo de turno con personal: Recursos humanos debe armar el grupo.';
const msgFalta = i => `${i.g === 'los' ? 'Faltan' : 'Falta'} ${i.nombre.toLowerCase()}. Administración debe comprar${i.g} y Producción recibir${i.g}.`;
export const JORNADAS = ['Diurno', 'Nocturno'];
const fmtN = n => (Math.round(n * 1000) / 1000).toLocaleString('es-VE', {maximumFractionDigits: 3});
/* Evalúa si se puede arrancar. saldos = {codigo: {saldo, unidad}}, minimos = {codigo: n} (el mismo mínimo del inventario; 0 o vacío = alcanza con que haya saldo),
   personal = {ok, motivo, ...}. Devuelve {ok, insumos[], personal, faltan[]} con un texto por cada recurso que falta. */
export function evaluarArranque({conteoHecho, saldos = {}, minimos = {}, personal}) {
  const insumos = INSUMOS_CRITICOS.map(i => {
    const s = saldos[i.codigo] || {}, saldo = +s.saldo || 0, unidad = s.unidad || '', req = +minimos[i.codigo] > 0 ? +minimos[i.codigo] : 0;
    if (!conteoHecho) return {codigo: i.codigo, nombre: i.nombre, unidad, saldo: null, requerido: req || null, ok: false, motivo: `No se puede verificar ${i.nombre.toLowerCase()}: Administración debe cargar el conteo inicial del inventario.`};
    const ok = saldo > req;   // mismo criterio que la barra del inventario: en o bajo el mínimo es rojo (comprar ya)
    return {codigo: i.codigo, nombre: i.nombre, unidad, saldo, requerido: req || null, ok, motivo: ok ? '' : req > 0 ? `Falta ${i.nombre.toLowerCase()}: hay ${fmtN(saldo)} ${unidad} y el mínimo es ${fmtN(req)} ${unidad}: hay que comprar y recibir más.` : msgFalta(i)};
  });
  const pers = personal || {ok: false, motivo: MSG_SIN_GRUPO};
  const faltan = [...insumos.filter(x => !x.ok).map(x => x.motivo), ...(pers.ok ? [] : [pers.motivo])];
  return {ok: faltan.length === 0, insumos, personal: pers, faltan};
}
/* Qué turno de RRHH toca ahora: el que está en curso; entre dos turnos, el que empieza primero. horarioDe y par vienen de RRHH. */
export function jornadaProxima(par, min, horarioDe) {
  const hs = JORNADAS.map(t => ({t, h: horarioDe(par, t)})).filter(x => x.h.definido); if (!hs.length) return min >= 360 && min < 1080 ? 'Diurno' : 'Nocturno';
  let mejor = hs[0].t, dist = 1e9; for (const x of hs) { const d = (x.h.ini_min % 1440 - min + 1440) % 1440; if (d < dist) { dist = d; mejor = x.t; } }
  return mejor;
}

/* 5.3 bis · Merma consolidada: lo que se tomó menos lo que pasa a empaque. La persona confirma o corrige el total y lo explica. */
export function mermaCalculada(tomados, aEmpaque) { const t = r3(+tomados || 0), e = r3(+aEmpaque || 0); return {tomados_kg: t, a_empaque_kg: e, calculada_kg: Math.max(0, r3(t - e))}; }
/* Devuelve {ok: {kilos, nota, desglose}} o {error, codigo} */
export function validarMermaConsolidada(b, calculada, motivos = []) {
  b = b || {};
  const crudo = b.kilos === '' || b.kilos == null ? calculada : b.kilos, k = validarKilos(crudo, {permitirCero: true}); if (!k.ok) return {error: k.msg, codigo: 'KILOS'};
  const nota = String(b.nota || '').trim().slice(0, 200), difiere = Math.abs(k.valor - calculada) > 0.0004;
  const desglose = [];
  if (Array.isArray(b.desglose) && b.desglose.length) {
    if (b.desglose.length > 20) return {error: 'Son demasiados motivos.', codigo: 'DESGLOSE'};
    for (const d of b.desglose) {
      const m = motivos.find(x => x.id === +d.id_motivo && x.activo !== 0); if (!m) return {error: 'Elige el motivo de la lista.', codigo: 'MOTIVO'};
      const kd = validarKilos(d.kilos); if (!kd.ok) return {error: m.nombre + ': ' + kd.msg, codigo: 'DESGLOSE'};
      const texto = String(d.texto || '').trim().slice(0, 120); if (m.es_otra && texto.length < 3) return {error: 'Elegiste «Otra»: escribe qué fue.', codigo: 'MOTIVO_OTRA'};
      desglose.push({id_motivo: m.id, motivo: m.nombre, kilos: kd.valor, texto: texto || null});
    }
    const suma = r3(desglose.reduce((a, d) => a + d.kilos, 0)); if (Math.abs(suma - k.valor) > 0.01) return {error: `Los motivos suman ${suma} kg y la merma es ${k.valor} kg: deben coincidir.`, codigo: 'DESGLOSE'};
  }
  if (difiere && nota.length < 3) return {error: `El sistema calcula ${calculada} kg y escribes ${k.valor} kg: explica por qué cambia (mínimo 3 letras).`, codigo: 'NOTA'};
  if (k.valor > 0 && !desglose.length && nota.length < 3) return {error: 'Escribe el motivo de la merma o reparte los kilos por motivo.', codigo: 'NOTA'};
  return {ok: {kilos: k.valor, nota, desglose}};
}

/* 6 · Panel: filtros combinables. Un turno entra si cumple TODOS los filtros pedidos. */
const fechaOkP = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const mesOkP = s => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
export function validarFiltrosPanel(q = {}) {
  const f = {turno: q.turno || '', dia: q.dia || '', semana: q.semana || '', mes: q.mes || ''};
  if (f.turno && !JORNADAS.includes(f.turno)) return {error: 'El turno debe ser Diurno o Nocturno.'};
  if (f.dia && !fechaOkP(f.dia)) return {error: 'El día no es válido.'};
  if (f.semana && !fechaOkP(f.semana)) return {error: 'La semana no es válida.'};
  if (f.mes && !mesOkP(f.mes)) return {error: 'El mes no es válido (AAAA-MM).'};
  return {ok: f};
}
export const cumpleFiltros = (t, f, lunesDe) => (!f.turno || t.jornada === f.turno) && (!f.dia || t.fecha === f.dia) && (!f.semana || lunesDe(t.fecha) === lunesDe(f.semana)) && (!f.mes || t.fecha.slice(0, 7) === f.mes);

/* ---------- Merma por etapas al cierre del turno ---------- */
/* Filas de la lista: etapas activas, sin subetapas, entre la papa tomada (recepcion) y Empaque (empacado). Salen del catálogo: si el Gerente agrega, renombra o quita una, la lista cambia sola. */
export function etapasMerma(cat) {
  const lista = etapasLista(cat), ini = lista.find(e => e.k === 'recepcion'), fin = lista.find(e => e.k === 'empacado');
  return lista.filter(e => (!ini || e.orden > ini.orden) && (!fin || e.orden < fin.orden)).map(e => ({k: e.k, nombre: e.nombre, orden: e.orden, kilos: e.kilos}));
}
/* Tramos medidos: cada etapa con kilos entre Recepción y Empaque (Lavado, Freído) mide lo que entró menos lo que salió; las demás etapas se reparten en el tramo de la última etapa con kilos anterior
   (las que están antes de la primera, en la primera). sumas = {etapa: {entra, sale}}. Devuelve [{k, nombre, medido_kg, etapas:[k]}]. */
export function tramosMerma(etapasM, sumas = {}) {
  const anclas = etapasM.filter(e => e.kilos); if (!anclas.length) return [];
  const tr = anclas.map(a => { const s = sumas[a.k] || {}; return {k: a.k, nombre: a.nombre, medido_kg: Math.max(0, r3((+s.entra || 0) - (+s.sale || 0))), etapas: []}; });
  for (const e of etapasM) { let i = 0; anclas.forEach((a, j) => { if (a.orden <= e.orden) i = j; }); tr[i].etapas.push(e.k); }
  return tr;
}
export const tolerMerma = calculada => Math.max(1, r3(Math.abs(calculada) * 0.01));
/* b = {filas:[{etapa, kilos, id_motivo, texto}], nota}. Devuelve {ok:{filas, suma, sin_explicar, nota}} o {error, codigo, ...}.
   Fila vacía o en 0 = sin pérdida en esa etapa (no se guarda). Con kilos pide motivo; «Otra» pide texto. Si la suma no cuadra con la calculada (más de la tolerancia) pide una nota y la diferencia queda como «sin explicar». */
export function validarMermaEtapas(b, {calculada, tomada, etapas, motivos = []}) {
  b = b || {}; const filas = Array.isArray(b.filas) ? b.filas : [];
  if (filas.length > 30) return {error: 'Son demasiadas filas.', codigo: 'FILAS'};
  const out = [], vistas = new Set(), nombre = k => (etapas.find(e => e.k === k) || {nombre: k}).nombre;
  for (const f of filas) {
    const crudo = f && f.kilos; if (crudo === '' || crudo == null) continue;
    const kk = validarKilos(crudo, {permitirCero: true}); if (!kk.ok) return {error: `${nombre(f.etapa)}: ${kk.msg}`, codigo: 'KILOS', etapa: f.etapa};
    if (kk.valor === 0) continue;
    if (!etapas.some(e => e.k === f.etapa)) return {error: 'Esa etapa no está en la lista de merma.', codigo: 'ETAPA', etapa: f.etapa};
    if (vistas.has(f.etapa)) return {error: `${nombre(f.etapa)} está repetida.`, codigo: 'REPETIDA', etapa: f.etapa}; vistas.add(f.etapa);
    if (kk.valor < 0.1) return {error: `${nombre(f.etapa)}: el mínimo es 0,1 kg.`, codigo: 'KILOS', etapa: f.etapa};
    const m = motivos.find(x => x.id === +f.id_motivo && x.activo !== 0); if (!m) return {error: `${nombre(f.etapa)}: elige el motivo principal.`, codigo: 'MOTIVO', etapa: f.etapa};
    const texto = String(f.texto || '').trim().slice(0, 120); if (m.es_otra && texto.length < 3) return {error: `${nombre(f.etapa)}: elegiste «Otra», escribe qué fue.`, codigo: 'MOTIVO_OTRA', etapa: f.etapa};
    out.push({etapa: f.etapa, kilos: kk.valor, id_motivo: m.id, motivo: m.nombre, texto: m.es_otra ? texto : null});
  }
  const C = r3(calculada), suma = r3(out.reduce((a, x) => a + x.kilos, 0)), nota = String(b.nota || '').trim().slice(0, 200);
  if (C > 0 && !out.length) return {error: 'Anota en qué etapa se perdió la papa.', codigo: 'SIN_FILAS'};
  if (suma > r3(tomada) + 0.0004) return {error: `Anotaste ${suma} kg de merma y el turno solo tomó ${r3(tomada)} kg de papa.`, codigo: 'EXCEDE', suma};
  const dif = r3(C - suma);
  if (Math.abs(dif) > tolerMerma(C) && nota.length < 3) return {error: `La merma calculada es ${C} kg y anotaste ${suma} kg. Escribe por qué no cuadra (mínimo 3 letras).`, codigo: 'NO_CUADRA', suma, calculada: C, diferencia: dif};
  return {ok: {filas: out, suma, sin_explicar: dif, nota}};
}
