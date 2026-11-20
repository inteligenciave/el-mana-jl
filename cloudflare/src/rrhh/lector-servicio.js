/* Importar del lector · casos de uso (sin HTTP). Las reglas de lectura y de entrada/salida están en lector.js (módulo puro).
   Lo confirmado se copia a la tabla «marcas» (la misma de «En planta hoy»), así que alimenta la asistencia, los turnos y la nómina que ya existen. */
import * as L from './lector.js';
import * as R from './lector-repo.js';
import * as D from './dominio.js';
import {cargarParam, sincronizarAsistencia, quincenaDe, err} from './turnos-servicio.js';
import {nomRol} from '../ventas/permisos.js';
import {resolverTurnos} from './grupos-servicio.js';
import * as T from './turnos.js';

const audit = (ctx, ref, nom, accion, detalle) => R.stAuditoria(ctx.db, {rol: ctx.rol, rolTxt: nomRol(ctx.rol), ent: 'lector', ref, nom, accion, detalle});
const exigir = ctx => { if (!D.puedeLector(ctx.rol)) throw err(403, D.MSG_SIN_LECTOR); };
const MAX_MARCAS = 20000;
const trozos = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
const minF = a => a.reduce((x, y) => (x < y ? x : y)), maxF = a => a.reduce((x, y) => (x > y ? x : y));
const llave = m => m.codigo + '|' + m.momento;
const MOT_MANUAL = 'Esa persona ya tiene marcas anotadas ese día en «En planta hoy»: decide cuáles valen.';
const MOT_CONFLICTO = 'Este código está en la ficha de dos personas. Corrige una de las dos en Personal.';

/* Qué hace falta para decidir: personas por código, horarios de turno, el turno que le tocaba a cada quien (su grupo de la semana o su turno fijo) y el único ajuste.
   desde/hasta: fechas que se van a entender (el turno de cada fecha se mira con una semana de margen) */
async function contexto(db, desde, hasta) {
  const hoy = T.fechaVE(Date.now()), d0 = desde || hoy, h0 = hasta || hoy;
  const [emps, par, aj, res] = await Promise.all([R.empleados(db), cargarParam(db), R.ajusteLector(db), resolverTurnos(db, T.mueveDia(d0, -1), T.mueveDia(h0, 1))]);
  const por = new Map(), conflictos = new Set();
  for (const e of emps) {
    const c = L.codigoDe(e.codigo_lector); if (!c) continue;
    if (por.has(c) || conflictos.has(c)) { conflictos.add(c); continue; }
    por.set(c, {empleado_id: e.id, nombre: e.n || e.id, turno: e.turno || ''});
  }
  for (const c of conflictos) por.delete(c);
  const turnoDe = (p, fecha) => res({id: p.empleado_id, turno: p.turno}, fecha).turno || '';
  return {codigos: por, conflictos, horarios: par.horarios, horariosEn: f => T.parEn(par, f).horarios, turnoDe, minEntre: aj && +aj.min_entre_marcas > 0 ? +aj.min_entre_marcas : null, empleados: emps};
}
const horariosCargados = c => Object.fromEntries(L.TURNOS.map(t => [t, !!L.ventanaDe(c.horarios, t)]));
const deCruda = m => ({codigo: m.codigo, momento: m.momento, fecha: m.fecha, ts: m.ts, nombre: m.nombre_lector});

/* Entiende las marcas (las del archivo + las ya guardadas de esos mismos días) y devuelve un día por persona */
async function entender(db, ctxD, marcasArchivo, soloPares) {
  const desde = minF(marcasArchivo.map(m => m.fecha)), hasta = maxF(marcasArchivo.map(m => m.fecha)), union = new Map();
  /* un turno nocturno termina al día siguiente: se miran también las marcas de un día antes y de un día después */
  for (const m of await R.crudasEntre(db, T.mueveDia(desde, -1), T.mueveDia(hasta, 1))) union.set(llave(m), deCruda(m));
  for (const m of marcasArchivo) if (!union.has(llave(m))) union.set(llave(m), m);
  const codigosArchivo = new Set(marcasArchivo.map(m => m.codigo)), delArchivo = new Set(marcasArchivo.map(m => m.codigo + '|' + m.ts));
  const dias = L.resolverMarcas([...union.values()].filter(m => codigosArchivo.has(m.codigo)), ctxD).filter(d => soloPares ? soloPares.has(d.codigo + '|' + d.fecha) : d.marcas.some(t => delArchivo.has(d.codigo + '|' + t))), guardados = new Map((await R.diasEntre(db, desde, hasta)).map(d => [d.codigo + '|' + d.fecha, d]));
  return {desde, hasta, dias: await Promise.all(dias.map(async d => {
    const g = guardados.get(d.codigo + '|' + d.fecha);
    if (d.estado === 'codigo_nuevo' && ctxD.conflictos.has(d.codigo)) d = {...d, motivo: MOT_CONFLICTO};
    if (g && g.estado === 'confirmado') return {...d, id: g.id, estado: 'ya_guardado', motivo: 'Ya estaba guardado.', turno: g.turno || d.turno, entrada_ts: g.entrada_ts, salida_ts: g.salida_ts, propuesta: false};
    if (g && g.estado === 'descartado') return {...d, id: g.id, estado: 'descartado', motivo: 'Este día fue descartado.'};
    if (d.estado === 'listo' && (await R.marcasDelDia(db, d.empleado_id, d.fecha)).length) return {...d, id: g ? g.id : null, estado: 'por_revisar', motivo: MOT_MANUAL};
    return {...d, id: g ? g.id : null};
  }))};
}
const publico = d => ({id: d.id || null, codigo: d.codigo, fecha: d.fecha, empleado_id: d.empleado_id, empleado: d.empleado || '', nombre_lector: d.nombre_lector || '', estado: d.estado, motivo: d.motivo || '', turno: d.turno || '', turno_sugerido: d.turno_sugerido || '', marcas: d.marcas, n: d.n, entrada_ts: d.entrada_ts || null, salida_ts: d.salida_ts || null, propuesta: !!d.propuesta});
const resumen = dias => { const cnt = {}; for (const d of dias) cnt[d.estado] = (cnt[d.estado] || 0) + 1; return {marcas: L.contarMarcas(dias), dias: cnt, personas: new Set(dias.map(d => d.codigo)).size}; };
const leer = b => {
  const m = b && b.marcas;
  if (Array.isArray(m)) { if (m.length > MAX_MARCAS) throw err(413, 'Son demasiadas marcas de una sola vez.'); return L.normalizarMarcas(m); }
  const t = String((b && b.texto) || ''); if (!t.trim()) throw err(400, 'Elige el archivo del lector.');
  const r = L.leerArchivo(t); if (r.error) throw err(400, r.error); if (r.marcas.length > MAX_MARCAS) throw err(413, 'El archivo tiene demasiadas marcas.');
  return r;
};
const sinCodigos = (ctxD, dias) => {
  const m = new Map();
  for (const d of dias) if (d.estado === 'codigo_nuevo') { const x = m.get(d.codigo) || m.set(d.codigo, {codigo: d.codigo, nombre_lector: d.nombre_lector, marcas: 0, dias: 0, repetido: ctxD.conflictos.has(d.codigo)}).get(d.codigo); x.marcas += d.n; x.dias++; }
  return [...m.values()];
};
const listaPersonas = ctxD => ctxD.empleados.filter(D.activo).map(e => ({id: e.id, nombre: e.n || e.id, area: e.area || '', cargo: e.cargo || '', turno: e.turno || '', codigo_lector: L.codigoDe(e.codigo_lector)})).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

/* VISTA PREVIA: no escribe nada */
export async function vista(ctx, b) {
  exigir(ctx);
  const r = leer(b), ctxD = await contexto(ctx.db, minF(r.marcas.map(m => m.fecha)), maxF(r.marcas.map(m => m.fecha)));
  if (!r.marcas.length) throw err(400, 'No encontré marcas en ese archivo.' + (r.ignoradas.length ? ' Las ' + r.ignoradas.length + ' filas tienen datos que no entiendo.' : ''));
  const e = await entender(ctx.db, ctxD, r.marcas), dias = e.dias.map(publico);
  const ya = new Set((await R.crudasEntre(ctx.db, e.desde, e.hasta)).map(llave)), repetidas = r.marcas.filter(m => ya.has(llave(m))).length;
  return {archivo: {formato: r.formato, marcas: r.marcas.length, ya_guardadas: repetidas, nuevas: r.marcas.length - repetidas, ignoradas: r.ignoradas.slice(0, 20), n_ignoradas: r.ignoradas.length, desde: e.desde, hasta: e.hasta},
    dias, resumen: resumen(dias), codigos_nuevos: sinCodigos(ctxD, dias), personas: listaPersonas(ctxD), ajustes: {min_entre_marcas: ctxD.minEntre}, horarios_cargados: horariosCargados(ctxD)};
}

/* Guarda lo entendido de cada día: los claros pasan a la asistencia, el resto queda pendiente */
async function guardarDias(ctx, dias) {
  const ts = Date.now(), st = [], quincenas = new Set(), res = {confirmados: 0, pendientes: 0, sin_cambio: 0};
  for (const d of dias) {
    if (d.estado === 'ya_guardado' || d.estado === 'descartado') { res.sin_cambio++; continue; }
    const est = d.estado === 'listo' ? 'confirmado' : d.estado, motivo = d.motivo;
    const guardaHoras = est === 'confirmado' || d.propuesta;
    st.push(R.stDia(ctx.db, {codigo: d.codigo, fecha: d.fecha, empleado_id: d.empleado_id, estado: est, motivo, turno: d.turno, entrada_ts: guardaHoras ? d.entrada_ts : null, salida_ts: guardaHoras ? d.salida_ts : null, n_marcas: d.n, decidio: null}, ts));
    if (est === 'confirmado') { st.push(R.stMarcaLector(ctx.db, {empleado_id: d.empleado_id, fecha: d.fecha, entrada_ts: d.entrada_ts, salida_ts: d.salida_ts, turno: d.turno, quien: ctx.rol}, ts)); quincenas.add(quincenaDe(d.fecha) + '|' + d.empleado_id); res.confirmados++; }
    else res.pendientes++;
  }
  for (let i = 0; i < st.length; i += 100) await R.lote(ctx.db, st.slice(i, i + 100));
  for (const k of quincenas) { const [q, emp] = k.split('|'); try { await sincronizarAsistencia(ctx.db, q, emp); } catch (e) { console.error(e); } }
  return res;
}

/* CONFIRMAR LA IMPORTACIÓN: guarda las marcas crudas (sin duplicar) y la asistencia de los días claros */
export async function importar(ctx, b, fuente = 'archivo') {
  exigir(ctx);
  const r = leer(b);
  if (!r.marcas.length) throw err(400, 'No hay marcas para guardar.');
  const ctxD = await contexto(ctx.db, minF(r.marcas.map(m => m.fecha)), maxF(r.marcas.map(m => m.fecha))), ts = Date.now();
  const ya = new Set((await R.crudasEntre(ctx.db, minF(r.marcas.map(m => m.fecha)), maxF(r.marcas.map(m => m.fecha)))).map(llave)), nuevas = r.marcas.filter(m => !ya.has(llave(m)));
  const sts = nuevas.map(m => R.stCruda(ctx.db, m, fuente, ctx.rol, ts));
  for (let i = 0; i < sts.length; i += 100) await R.lote(ctx.db, sts.slice(i, i + 100));
  const e = await entender(ctx.db, ctxD, r.marcas), g = await guardarDias(ctx, e.dias);
  await R.lote(ctx.db, [R.stVer(ctx.db), ...audit(ctx, fuente + ' ' + e.desde + ' a ' + e.hasta, 'Importar del lector', 'importó marcas del lector', {formato: r.formato, marcas_archivo: r.marcas.length, marcas_nuevas: nuevas.length, marcas_repetidas: r.marcas.length - nuevas.length, dias_confirmados: g.confirmados, dias_por_revisar: g.pendientes})]);
  const v = await vista(ctx, b);
  return {guardado: {marcas_nuevas: nuevas.length, marcas_repetidas: r.marcas.length - nuevas.length, dias_confirmados: g.confirmados, dias_pendientes: g.pendientes}, ...v};
}

/* Marcas guardadas de unos días pendientes, ya entendidas con la ficha actual de cada persona */
async function entenderPendientes(db, ctxD, pend) {
  const pares = new Set(pend.map(d => d.codigo + '|' + d.fecha)), cods = new Set(pend.map(d => d.codigo)), desde = minF(pend.map(d => d.fecha)), hasta = maxF(pend.map(d => d.fecha));
  const marcas = (await R.crudasEntre(db, T.mueveDia(desde, -1), T.mueveDia(hasta, 1))).filter(m => cods.has(m.codigo)).map(deCruda);
  return L.resolverMarcas(marcas, ctxD).filter(d => pares.has(d.codigo + '|' + d.fecha)).map(d => (d.estado === 'codigo_nuevo' && ctxD.conflictos.has(d.codigo) ? {...d, motivo: MOT_CONFLICTO} : d));
}

/* Asocia un código del lector a una persona (queda en su ficha «Código del lector») y vuelve a entender los días que esperaban ese código */
export async function asociarCodigo(ctx, b) {
  exigir(ctx);
  const codigo = L.codigoDe(b && b.codigo), id = String((b && b.empleado_id) || '').trim();
  if (!codigo) throw err(400, 'Falta el código del lector.'); if (!id) throw err(400, 'Elige a la persona.');
  const ctxD = await contexto(ctx.db), e = ctxD.empleados.find(x => x.id === id);
  if (!e) throw err(404, 'Esa persona no existe.');
  const otro = ctxD.empleados.find(x => x.id !== id && L.codigoDe(x.codigo_lector) === codigo); if (otro) throw err(409, 'El código ' + codigo + ' ya es de ' + (otro.n || otro.id) + '. Quítaselo en Personal primero.');
  const previo = L.codigoDe(e.codigo_lector); if (previo && previo !== codigo) throw err(409, (e.n || id) + ' ya tiene el código ' + previo + '. Cámbialo en Personal si de verdad es otro.');
  await R.lote(ctx.db, [R.stCodigoEmpleado(ctx.db, id, codigo, Date.now()), R.stVer(ctx.db), ...audit(ctx, id, e.n, 'asoció un código del lector', {codigo})]);
  const pend = await R.diasDeCodigo(ctx.db, codigo); let g = {confirmados: 0, pendientes: 0};
  if (pend.length) g = await guardarDias(ctx, await entenderPendientes(ctx.db, await contexto(ctx.db, minF(pend.map(d => d.fecha)), maxF(pend.map(d => d.fecha))), pend));
  return {ok: true, codigo, empleado_id: id, nombre: e.n || id, confirmados: g.confirmados, pendientes: g.pendientes};
}

/* Días que esperan a Nómina (de cualquier importación) */
export async function pendientes(ctx) {
  exigir(ctx);
  const pend = await R.diasPendientes(ctx.db), ctxD = await contexto(ctx.db, pend.length ? minF(pend.map(d => d.fecha)) : null, pend.length ? maxF(pend.map(d => d.fecha)) : null), vacio = {dias: [], codigos_nuevos: [], personas: listaPersonas(ctxD), horarios_cargados: horariosCargados(ctxD), ajustes: {min_entre_marcas: ctxD.minEntre}};
  if (!pend.length) return vacio;
  const ids = new Map(pend.map(d => [d.codigo + '|' + d.fecha, d.id])), dias = await entenderPendientes(ctx.db, ctxD, pend);
  return {...vacio, dias: dias.map(d => publico({...d, id: ids.get(d.codigo + '|' + d.fecha)})), codigos_nuevos: sinCodigos(ctxD, dias)};
}

const instante = (fecha, s) => { const m = /^(\d{2}):(\d{2})$/.exec(String(s || '').trim()); return m ? L.instanteDe(fecha + ' ' + m[1] + ':' + m[2] + ':00') : null; };
/* Hora escrita a mano: si queda antes de la entrada es de la madrugada siguiente (turno nocturno) */
const instanteDespues = (fecha, s, entrada) => { const t = instante(fecha, s); return t !== null && entrada && t <= entrada ? t + 864e5 : t; };
/* Nómina decide un día pendiente: confirmar (con la entrada y la salida propuestas o corregidas) o descartar */
export async function resolver(ctx, b) {
  exigir(ctx);
  const dia = await R.diaPorId(ctx.db, +(b && b.id) || 0); if (!dia) throw err(404, 'No encuentro ese día.');
  if (!['codigo_nuevo', 'por_revisar', 'sin_turno'].includes(dia.estado)) throw err(409, 'Ese día ya fue ' + (dia.estado === 'confirmado' ? 'confirmado' : 'descartado') + '.');
  const accion = String((b && b.accion) || ''), ts = Date.now(), ctxD = await contexto(ctx.db, dia.fecha, dia.fecha), pers = ctxD.codigos.get(dia.codigo) || null;
  if (accion === 'descartar') {
    await R.lote(ctx.db, [R.stDiaDecidido(ctx.db, dia.id, 'descartado', {turno: dia.turno, entrada_ts: dia.entrada_ts, salida_ts: dia.salida_ts, decidio: ctx.rol}, ts), R.stVer(ctx.db), ...audit(ctx, dia.codigo + ' ' + dia.fecha, pers ? pers.nombre : dia.codigo, 'descartó un día del lector', {fecha: dia.fecha, motivo: dia.motivo})]);
    return {ok: true, estado: 'descartado'};
  }
  if (accion !== 'confirmar') throw err(400, 'Elige confirmar o descartar.');
  if (!pers) throw err(409, 'Primero asocia el código ' + dia.codigo + ' a una persona.');
  const v = (await entenderPendientes(ctx.db, ctxD, [dia]))[0] || {};
  const entrada = b.entrada ? instante(dia.fecha, b.entrada) : (v.entrada_ts || dia.entrada_ts), salida = b.salida ? instanteDespues(dia.fecha, b.salida, entrada) : (v.salida_ts || dia.salida_ts);
  if (!entrada || !salida) throw err(400, 'Escribe la hora de entrada y la de salida (por ejemplo 06:00).');
  if (salida <= entrada) throw err(400, 'La salida debe ser después de la entrada.');
  const turno = String(b.turno || ctxD.turnoDe(pers, dia.fecha) || pers.turno || v.turno_sugerido || ''); if (!L.TURNOS.includes(turno)) throw err(400, T.MSG_ELIGE_TURNO);
  if ((await R.marcasDelDia(ctx.db, pers.empleado_id, dia.fecha)).length) throw err(409, pers.nombre + ' ya tiene marcas ese día en «En planta hoy». Revisa cuáles valen antes de confirmar.');
  await R.lote(ctx.db, [R.stDiaDecidido(ctx.db, dia.id, 'confirmado', {turno, entrada_ts: entrada, salida_ts: salida, decidio: ctx.rol}, ts), R.stMarcaLector(ctx.db, {empleado_id: pers.empleado_id, fecha: dia.fecha, entrada_ts: entrada, salida_ts: salida, turno, quien: ctx.rol}, ts), R.stVer(ctx.db),
    ...audit(ctx, dia.codigo + ' ' + dia.fecha, pers.nombre, 'confirmó un día del lector', {fecha: dia.fecha, entrada: L.horaTxt(entrada), salida: L.horaTxt(salida), turno})]);
  try { await sincronizarAsistencia(ctx.db, quincenaDe(dia.fecha), pers.empleado_id); } catch (e) { console.error(e); }
  return {ok: true, estado: 'confirmado', entrada_ts: entrada, salida_ts: salida};
}

/* El único ajuste: minutos mínimos entre dos marcas (vacío = no se usa) */
export async function ajustes(ctx) { exigir(ctx); const a = await R.ajusteLector(ctx.db); return {min_entre_marcas: +a.min_entre_marcas > 0 ? +a.min_entre_marcas : null}; }
export async function guardarAjustes(ctx, b) {
  exigir(ctx);
  const v = b && b.min_entre_marcas; let n = null;
  if (v !== '' && v !== null && v !== undefined) { n = +v; if (!Number.isFinite(n) || n < 0 || n > 600) throw err(400, 'Los minutos deben ser un número entre 0 y 600 (déjalo vacío para no usarlo).'); if (n === 0) n = null; }
  await R.lote(ctx.db, [R.stAjusteLector(ctx.db, {min_entre_marcas: n}), R.stVer(ctx.db), ...audit(ctx, 'lector', 'Importar del lector', 'cambió los minutos mínimos entre marcas', {min_entre_marcas: n})]);
  return ajustes(ctx);
}
