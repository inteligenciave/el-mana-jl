/* Datos de PRUEBA para la base LOCAL (http://localhost:8800). Repetible: volver a correrlo no duplica nada.
   Uso: node scripts/datos-prueba/cargar.mjs   (BASE=http://localhost:8800 por defecto; se niega a correr si no es local)
   Todo lo creado termina en «(prueba)». Lo que se creó/cambió queda anotado en estado.json para poder limpiarlo con limpiar.mjs. */
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const BASE = process.env.BASE || 'http://localhost:8800';
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) { console.error('Solo local.'); process.exit(1); }
const EST = fileURLToPath(new URL('./estado.json', import.meta.url));
const estado = existsSync(EST) ? JSON.parse(readFileSync(EST, 'utf8')) : {};
estado.empleados ||= []; estado.clientes ||= {}; estado.precios ||= [];
const H = {'x-rol': 'dueno', 'content-type': 'application/json'};
const api = async (m, p, b, extra = {}) => { const r = await fetch(BASE + p, {method: m, headers: {...H, ...extra}, body: b ? JSON.stringify(b) : undefined}); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return {s: r.status, j}; };
const ok = (r, q) => { if (r.s >= 400) throw new Error(q + ' -> ' + r.s + ' ' + JSON.stringify(r.j)); return r.j; };
const SUF = ' (prueba)';

/* ---- 1) PERSONAL ---- [id, nombre, puesto, area, cargo, grupo(1|2|0)] ; las 3 primeras ya existían como «Prueba…» y se reutilizan */
const P = [
  ['E09', 'Prueba Mantenimiento', 'Producción', 'Mantenimiento', 'Mecánico', 1], ['ZZ1', 'Prueba Admin Ventas', 'Ventas', 'Ventas', 'Vendedor', 0], ['ZZ2', 'Prueba Producción Vieja', 'Producción', 'Fritura', 'Operario de fritura', 2],
  ['TP01', 'Gerente Uno', 'Gerencia', 'Directiva', 'Gerente', 0], ['TP02', 'Administrador Uno', 'Administración', 'Administración', 'Administrador', 0], ['TP03', 'Auxiliar Contable', 'Administración', 'Administración', 'Asistente administrativo', 0],
  ['TP04', 'Vendedor Dos', 'Ventas', 'Ventas', 'Vendedor', 0], ['TP05', 'Analista de Personal', 'Recursos humanos', 'Recursos humanos', 'Analista de RRHH', 0],
  ['TP06', 'Cocinero Uno', 'Producción', 'Cocina', 'Cocinero', 1], ['TP07', 'Cocinera Dos', 'Producción', 'Cocina', 'Cocinero', 2], ['TP08', 'Pelador Tres', 'Producción', 'Cocina', 'Pelador', 1],
  ['TP09', 'Fritura Uno', 'Producción', 'Fritura', 'Operario de fritura', 1], ['TP10', 'Fritura Tres', 'Producción', 'Fritura', 'Operario de fritura', 2],
  ['TP11', 'Mecánico Dos', 'Producción', 'Mantenimiento', 'Mecánico', 2],
  ['TP12', 'Salsero Uno', 'Producción', 'Línea salsera', 'Operario de salsas', 1], ['TP13', 'Salsera Dos', 'Producción', 'Línea salsera', 'Operario de salsas', 2], ['TP14', 'Envasador Tres', 'Producción', 'Línea salsera', 'Envasador', 1],
  ['TP15', 'Empacador Uno', 'Logística', 'Empaque', 'Empacador', 2], ['TP16', 'Empacadora Dos', 'Logística', 'Empaque', 'Empacador', 1], ['TP17', 'Empacador Tres', 'Logística', 'Empaque', 'Empacador', 2],
  ['TP18', 'Almacenista Uno', 'Logística', 'Almacén', 'Almacenista', 1], ['TP19', 'Almacenista Dos', 'Logística', 'Almacén', 'Almacenista', 2],
  ['TP20', 'Chofer Uno', 'Logística', 'Despacho / Choferes', 'Chofer', 1], ['TP21', 'Chofer Dos', 'Logística', 'Despacho / Choferes', 'Chofer', 2]];
const PLANTA = ['Producción', 'Logística'];
const todos = ok(await api('GET', '/api/c/empleados'), 'leer personal');
let n = 0;
for (const [id, nom, puesto, area, cargo] of P) {
  n++; const ant = todos.find(e => e.id === id), planta = PLANTA.includes(puesto), chofer = area === 'Despacho / Choferes';
  if (ant && !(String(ant.n).includes('(prueba)') || /^Prueba/.test(ant.n))) throw new Error('El id ' + id + ' es una persona real; no se toca.');
  const d = {...(ant || {}), id, n: nom + SUF, puesto, area, cargo, estado: 'activo', es_chofer: chofer, turno: '', codigo_lector: (ant && ant.codigo_lector) || '',
    cedula: 'V-' + String(n).padStart(8, '0'), tel: '0400-' + String(n).padStart(7, '0'), ingreso: '2026-0' + (1 + n % 9) + '-15', pago: 'dia', tarifa: planta ? 5 : 8, antig: 0, orden: ant && ant.orden != null ? ant.orden : 9000 + n};
  ok(await api('PUT', '/api/c/empleados/' + id, d), 'guardar ' + id);
  if (!estado.empleados.includes(id)) estado.empleados.push(id);
}
/* grupos: se conservan los integrantes que ya había y se suman los de prueba */
const sem = ok(await api('GET', '/api/h/grupos'), 'grupos');
for (const g of [1, 2]) {
  const actual = sem.grupos.find(x => x.id === g).miembros.map(m => m.id), mios = P.filter(p => p[5] === g).map(p => p[0]);
  ok(await api('PUT', '/api/h/grupos/miembros', {grupo_id: g, empleados: [...new Set([...actual, ...mios])]}), 'miembros grupo ' + g);
}

/* ---- 2) ASISTENCIA: abrir el turno de ahora y marcar a todo el grupo, dejando 2 sin marcar ---- */
const hoy0 = ok(await api('GET', '/api/h/hoy'), 'hoy');
const jor = ok(await api('GET', '/api/h/jornada'), 'jornada');
/* el turno de «ahora» = el que le toca a los integrantes de grupo según /hoy (el más frecuente) */
const turnosGr = hoy0.trabajadores.filter(t => t.grupo_id && t.planta).map(t => t.turno);
const turno = [...turnosGr].sort((a, b) => turnosGr.filter(x => x === b).length - turnosGr.filter(x => x === a).length)[0] || 'Diurno';
if (jor.turnos[turno].estado !== 'abierto') ok(await api('POST', '/api/h/jornada/abrir', {turno}), 'abrir turno');
const r = await api('POST', '/api/h/entrada/grupo', {turno});
let marcadas = 0; const sinMarcar = [];
if (r.s === 201) {
  marcadas = r.j.marcadas;
  /* dos personas de prueba (de planta, no choferes) del grupo quedan sin marcar */
  const cand = hoy0.trabajadores.filter(t => estado.empleados.includes(t.empleado_id) && t.planta && t.turno === turno && !/Chofer/.test(t.cargo) && t.estado === 'fuera').slice(-2);
  for (const c of cand) { ok(await api('POST', '/api/h/entrada/quitar', {empleado_id: c.empleado_id}), 'quitar'); sinMarcar.push(c.nombre); }
} else if (r.s !== 409) throw new Error('entrada grupo ' + r.s + JSON.stringify(r.j));
estado.turno_marcado = turno;

/* ---- 3) CLIENTES Y PRECIOS ---- */
const CAT = {'Bodega La Esquina (EJEMPLO)': 'Minorista', 'Supermercado Los Pinos (EJEMPLO)': 'Minorista', 'Minimarket Estrella (EJEMPLO)': 'Minorista', 'Abasto El Puente (EJEMPLO)': 'Mayorista', 'Bodega Sol (EJEMPLO)': 'Mayorista', 'Distribuidora Centro (EJEMPLO)': 'Gran Mayor'};
const cli = ok(await api('GET', '/api/v/clientes?limite=500'), 'clientes');
for (const c of cli) {
  const cat = CAT[c.razon_social]; if (!cat) continue;
  if (c.categoria_precio !== cat) {
    if (!(c.id_cliente in estado.clientes)) estado.clientes[c.id_cliente] = c.categoria_precio || null;
    ok(await api('PUT', '/api/v/clientes/' + c.id_cliente, {rif_id: c.rif_id, razon_social: c.razon_social, modalidad_despacho_pref: c.modalidad_despacho_pref, id_vendedor: c.id_vendedor, zona: c.zona, telefono: c.telefono, direccion_entrega: c.direccion_entrega,
      id_lista_base: c.id_lista_base, descuento_fijo_pct: c.descuento_fijo_pct, dias_pronto_pago: c.dias_pronto_pago, dias_credito_normal: c.dias_credito_normal, limite_credito_usd: c.limite_credito_cents == null ? null : c.limite_credito_cents / 100, categoria_precio: cat}), 'cliente ' + c.id_cliente);
  }
}
/* precios por bulto, contado/crédito: Minorista = base, Mayorista = -10 %, Gran Mayor = -20 % (valores de prueba) */
const BASE_P = {1: 10, 2: 20, 3: 6, 56: 15}, F = {Minorista: 1, Mayorista: 0.9, 'Gran Mayor': 0.8};
const listas = ok(await api('GET', '/api/v/precios/listas'), 'listas');
for (const [idp, b] of Object.entries(BASE_P)) for (const [lista, f] of Object.entries(F)) {
  const prod = listas.productos.find(p => p.id_producto === +idp); if (!prod || prod.listas[lista]) continue;   /* ya tiene precio: no se pisa */
  ok(await api('PUT', '/api/v/precios/lista', {id_producto: +idp, lista, modalidad: 'ambos', precio_contado: +(b * f).toFixed(2), precio_credito: +(b * f * 1.1).toFixed(2)}), 'precio ' + idp + lista);
  if (!estado.precios.some(x => x[0] === +idp && x[1] === lista)) estado.precios.push([+idp, lista]);
}
writeFileSync(EST, JSON.stringify(estado, null, 1));
const cnt = ok(await api('GET', '/api/h/conteo'), 'conteo');
console.log(JSON.stringify({personas_prueba: estado.empleados.length, turno, marcadas_ahora: marcadas, sin_marcar: sinMarcar, activos_hoy: cnt, clientes_con_categoria: Object.keys(estado.clientes).length, precios_creados: estado.precios.length}, null, 1));
