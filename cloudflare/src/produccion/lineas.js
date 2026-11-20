/* Líneas de despacho · dominio puro (sin base de datos ni HTTP).
   Una línea es un grupo de zonas que llenan UN mismo camión. El camión se llena por tipo de producto:
   % lleno = kg de papa ÷ capacidad de papa + kg de salsa ÷ capacidad de salsa (todo lo que no es papa cuenta como salsa).
   Las capacidades (10.000 kg de papa y 15.000 kg de salsas al inicio) las cambia Gerencia en Ajustes: aquí no hay cifras de negocio escritas. */
import {pendienteLinea, SIN_ZONA} from './dominio.js';

const r3 = n => Math.round(n * 1000) / 1000;
export const SIN_LINEA = 'sin';
export const ESTADOS_LINEA = {LLENA: 'Camión lleno', ARMADA: 'Salida armada', ESPERA: 'En espera', SIN_PEDIDOS: 'Sin pedidos', PAUSADA: 'Pausada'};

/* 'SALSAS' → salsa; 'PAPAS', vacío o desconocido → papa (la capacidad más chica: lo desconocido se cuenta con cuidado) */
export const tipoCarga = categoria => String(categoria || '').toUpperCase() === 'SALSAS' ? 'salsa' : 'papa';
export const zonaDeFila = f => f.zona || SIN_ZONA;

/* Fracción del camión que ocupa la carga. Una capacidad en 0 o vacía no se divide: ese término cuenta 0 y se marca sin_capacidad. */
export function ocupacion({kgPapa = 0, kgSalsa = 0}, {capPapa = 0, capSalsa = 0}) {
  const sinCap = (+kgPapa > 0 && !(+capPapa > 0)) || (+kgSalsa > 0 && !(+capSalsa > 0));
  const fr = (+capPapa > 0 ? +kgPapa / +capPapa : 0) + (+capSalsa > 0 ? +kgSalsa / +capSalsa : 0);
  return {fraccion: fr, pct: Math.round(fr * 1000) / 10, sin_capacidad: sinCap};
}
export const pctDe = (kgPapa, kgSalsa, caps) => ocupacion({kgPapa, kgSalsa}, caps).pct;

/* Kilos pendientes de una fila: {kg_papa, kg_salsa}. libres = solo lo que todavía no está en una salida armada. */
export function kilosDeFila(f, {libres = false} = {}) {
  const n = libres ? Math.max(0, pendienteLinea(f) - (+f.en_salida || 0)) : pendienteLinea(f), kg = n * (+f.kg_por_bulto || 0);
  return tipoCarga(f.categoria) === 'salsa' ? {kg_papa: 0, kg_salsa: kg} : {kg_papa: kg, kg_salsa: 0};
}

function agrupar(filas) {
  const g = {kg_papa: 0, kg_salsa: 0, pedidos: new Set(), clientes: new Set()};
  for (const f of filas) { if (pendienteLinea(f) <= 0) continue; const k = kilosDeFila(f); g.kg_papa += k.kg_papa; g.kg_salsa += k.kg_salsa; g.pedidos.add(f.id_pedido); g.clientes.add(f.id_cliente); }
  return g;
}

/* Arma la vista de líneas.
   filas = líneas de pedido pendientes (con zona, categoria, kg_por_bulto, id_pedido, id_cliente, en_salida…)
   lineas = [{id_linea, nombre, orden, ejemplo}], asignacion = Map zona → id_linea, pausas = Map zona → motivo
   caps = {capPapa, capSalsa}, salidas = salidas ARMANDO [{id_salida, id_linea, zona, …}], zonasPosibles = lista de zonas conocidas */
export function armarLineas(filas, {lineas = [], asignacion = new Map(), pausas = new Map(), caps, salidas = [], zonasPosibles = []}) {
  const pausada = z => pausas.has(z), motivo = z => (pausas instanceof Map ? pausas.get(z) : null) || null;
  const todas = new Set(zonasPosibles); for (const f of filas) todas.add(zonaDeFila(f)); for (const z of asignacion.keys()) todas.add(z);
  const porZona = new Map(); for (const z of todas) porZona.set(z, []);
  for (const f of filas) porZona.get(zonaDeFila(f)).push(f);
  const zonaObj = z => {
    const g = agrupar(porZona.get(z)), oc = ocupacion({kgPapa: g.kg_papa, kgSalsa: g.kg_salsa}, caps);
    return {zona: z, kg_papa: r3(g.kg_papa), kg_salsa: r3(g.kg_salsa), kilos: r3(g.kg_papa + g.kg_salsa), pedidos: g.pedidos.size, clientes: g.clientes.size, aporte_pct: pausada(z) ? 0 : oc.pct,
      pausada: pausada(z), pausa_motivo: pausada(z) ? motivo(z) : null, salidas_armando: salidas.filter(s => s.id_linea == null && s.zona === z).length, _p: g};
  };
  const arma = (nombre, id_linea, orden, ejemplo, zonas) => {
    const zs = zonas.map(zonaObj), act = zs.filter(z => !z.pausada), peds = new Set(), cli = new Set();
    let kp = 0, ks = 0; for (const z of act) { kp += z.kg_papa; ks += z.kg_salsa; z._p.pedidos.forEach(x => peds.add(x)); z._p.clientes.forEach(x => cli.add(x)); }
    const oc = ocupacion({kgPapa: kp, kgSalsa: ks}, caps);
    const sals = salidas.filter(s => (id_linea != null && s.id_linea === id_linea) || (s.id_linea == null && zonas.includes(s.zona)));
    const l = {id_linea, nombre, orden, ejemplo: !!ejemplo, zonas: zs.map(({_p, ...z}) => z), kg_papa: r3(kp), kg_salsa: r3(ks), kilos: r3(kp + ks), ocupacion_pct: oc.pct, sin_capacidad: oc.sin_capacidad,
      pedidos: peds.size, clientes: cli.size, salidas_armando: sals.length, exceso: oc.pct > 100, gerencia_decidio: sals.some(x => x.de_gerencia)};
    l.estado = estadoLinea(l, zs.length > 0 && zs.every(z => z.pausada)); l.estado_txt = ESTADOS_LINEA[l.estado]; return l;
  };
  const idsLinea = new Set(lineas.map(l => l.id_linea)), enLinea = new Set([...asignacion.entries()].filter(([, id]) => idsLinea.has(id)).map(([z]) => z));
  const ls = lineas.map(l => arma(l.nombre, l.id_linea, l.orden, l.ejemplo, [...asignacion.entries()].filter(([, id]) => id === l.id_linea).map(([z]) => z).sort((a, b) => a.localeCompare(b, 'es'))));
  const rank = {LLENA: 0, ARMADA: 1, ESPERA: 2, SIN_PEDIDOS: 3, PAUSADA: 4};
  ls.sort((a, b) => rank[a.estado] - rank[b.estado] || b.ocupacion_pct - a.ocupacion_pct || a.nombre.localeCompare(b.nombre, 'es'));
  const sueltas = [...todas].filter(z => !enLinea.has(z)).sort((a, b) => a.localeCompare(b, 'es')), sl = arma('Sin línea', null, 9999, false, sueltas);
  const sin = {zonas: sl.zonas, kilos: sl.kilos, kg_papa: sl.kg_papa, kg_salsa: sl.kg_salsa, pedidos: sl.pedidos, clientes: sl.clientes, salidas_armando: sl.salidas_armando};
  return {lineas: ls, sin_linea: sin};
}

/* Estado de la tarjeta, en este orden. todasPausadas: la línea tiene zonas y todas están pausadas. */
export function estadoLinea(l, todasPausadas = false) {
  if (todasPausadas) return 'PAUSADA';
  if (l.ocupacion_pct >= 100) return 'LLENA';
  if (l.salidas_armando > 0) return 'ARMADA';
  if (l.kilos > 0) return 'ESPERA';
  return 'SIN_PEDIDOS';
}

export function validarNombreLinea(v) {
  const n = String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
  if (n.length < 2) return {ok: false, msg: 'Escribe el nombre de la línea (mínimo 2 letras).'};
  if (n.length > 40) return {ok: false, msg: 'El nombre de la línea es muy largo (máximo 40 letras).'};
  return {ok: true, valor: n};
}

/* Reglas para armar o despachar una salida por línea (o por zona suelta).
   ocSalida = % del camión de lo que sale; ocLinea = % de todo lo que hay en la línea; gerenciaDecidio = Gerencia ya tiene una salida armada en esta línea.
   - Solo Gerencia arma un camión que pasa del 100 %.
   - Si la línea pasa del 100 %, Logística elige qué pedidos salen mientras Gerencia no haya decidido; si Gerencia ya eligió, su decisión prevalece y lo que sobra espera.
   - Salir con menos del 100 % es libre: no pide motivo. Dividir un pedido sí pide motivo. */
export function reglasSalidaLinea({rol, ocSalida, ocLinea, gerenciaDecidio = false, motivo, divide}) {
  const m = String(motivo || '').trim();
  if (ocSalida > 100 && rol !== 'dueno') return {ok: false, status: 403, codigo: 'DECIDE_DUENO', msg: 'Esa salida pasa del 100 % del camión: solo Gerencia puede armarla así. Quita pedidos hasta llegar a 100 % o menos.'};
  if (ocLinea > 100 && gerenciaDecidio && rol !== 'dueno') return {ok: false, status: 409, codigo: 'GERENCIA_DECIDIO', msg: 'Gerencia ya eligió los pedidos de este camión. Lo que sobra espera a la siguiente salida.'};
  if (divide && m.length < 3) return {ok: false, status: 400, codigo: 'MOTIVO', msg: 'Para dividir un pedido escribe el motivo.'};
  return {ok: true};
}
