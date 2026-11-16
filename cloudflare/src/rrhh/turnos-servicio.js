/* Turnos, asistencia automática, parámetros y bonos de producción · casos de uso (sin HTTP).
   Todos los montos se calculan aquí. Sueldos y tarifas solo para Gerencia y Recursos humanos; Producción y Administración ven horas y kilos, no dinero de personas. */
import * as T from './turnos.js';
import * as R from './repo.js';
import * as D from './dominio.js';
import {ROL_TXT, nomRol} from '../ventas/permisos.js';
import {hoyVE} from '../ventas/dominio.js';

export const err = (status, message, extra = {}) => Object.assign(new Error(message), {status, message, extra});
const audit = (ctx, ref, nom, accion, detalle) => R.stAuditoria(ctx.db, {rol: ctx.rol, rolTxt: nomRol(ctx.rol), ent: 'turno', ref, nom, accion, detalle});
const fechaOk = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const POL0 = {nomJornada: 8, nomRecargo: 0, nomLey: 0};
export const cargarParam = async db => T.parametros(await R.parametrosDoc(db));
export const cargarPol = async db => ({...POL0, ...(await R.politicas(db))});
/* Rango de instantes de un día de Venezuela */
const rangoDia = f => { const [y, m, d] = f.split('-').map(Number), ini = Date.UTC(y, m - 1, d, 4); return [ini, ini + 864e5]; };

/* ---------- Parámetros ---------- */
export async function parametros(ctx) {
  if (!T.puedeVerParam(ctx.rol)) throw err(403, T.MSG_SIN_PARAM);
  const par = await cargarParam(ctx.db), pol = await cargarPol(ctx.db), hor = {};
  for (const t of T.TURNOS) hor[t] = T.horarioDe(par, t);
  return {...par, horarios_calculados: hor, pagos: {nomJornada: +pol.nomJornada || 8, nomRecargo: +pol.nomRecargo || 0, nomLey: +pol.nomLey || 0}, puede_editar: T.puedeEditarParam(ctx.rol), puede_aplicar: T.puedeAplicarBono(ctx.rol), etapas: T.ETAPAS_KG};
}
export async function guardarParametros(ctx, b) {
  if (!T.puedeVerParam(ctx.rol)) throw err(403, T.MSG_SIN_PARAM);
  if (!T.puedeEditarParam(ctx.rol)) throw err(403, T.MSG_SOLO_GERENCIA);
  const v = T.validarParametros(b); if (v.error) throw err(400, v.error);
  const o = v.ok, st = [R.stParametros(ctx.db, {horarios: o.horarios, bono: o.bono}), R.stVer(ctx.db)];
  if (o.conPagos) st.push(R.stPolNomina(ctx.db, o.pol));
  st.push(...audit(ctx, 'parametros', 'Parámetros de turnos y bonos', 'cambió los parámetros de turnos y bonos', {horarios: o.horarios, bono: o.bono, pagos: o.conPagos ? o.pol : undefined}));
  await R.lote(ctx.db, st);
  return parametros(ctx);
}

/* ---------- Pantalla «Turnos» ---------- */
const topar = (arr, n = 30) => arr.slice(0, n);
/* Lo hecho en el turno. Cada hecho se asigna a Mañana o Tarde por su hora y el horario del turno; lo que no trae hora no se asigna y se cuenta aparte («sin hora»). */
async function produccion(db, fecha, turno, par) {
  const [d, h] = rangoDia(fecha), cae = ts => ts > 0 && T.fechaVE(ts) === fecha && T.turnoDeMin(par, T.minVE(ts)) === turno;
  const [mov, emp, lotes, recs, mer, empq, sal, desp] = await Promise.all([R.movProceso(db, d, h), R.empaqueTurno(db, d, h), R.lotesDelDia(db, fecha, d, h), R.docsFecha(db, 'recepciones', fecha), R.docsFecha(db, 'mermas', fecha), R.docsFecha(db, 'empaques', fecha), R.salidasDespachadas(db, d, h), R.docsFecha(db, 'despachos', fecha)]);
  const sinHora = {lotes: 0, recepciones: 0, mermas: 0, empaque: 0, notas_de_entrega: desp.length};
  const kg = T.ETAPAS_KG.map(e => { const m = mov.filter(x => x.etapa === e.k && cae(x.ts)); return {etapa: e.k, nombre: e.t, entra_kg: T.r3(m.filter(x => x.sentido === 'ENTRA').reduce((a, x) => a + x.kilos, 0)), sale_kg: T.r3(m.filter(x => x.sentido === 'SALE').reduce((a, x) => a + x.kilos, 0))}; });
  const abiertos = [], cerrados = [];
  for (const l of lotes) {
    if (l.ts > 0 && T.fechaVE(l.ts) === fecha) { if (cae(l.ts)) abiertos.push({id: l.id, cruda_kg: +l.cruda || 0, quien: l.quien || '—', hora: T.horaTxt(l.ts)}); }
    else if (l.fecha === fecha && !(l.ts > 0)) sinHora.lotes++;
    if (l.tsCierre > 0 && cae(l.tsCierre)) cerrados.push({id: l.id, granel_kg: +l.granel || 0, aceite_kg: +l.aceite || 0, quien: l.cerro || '—', hora: T.horaTxt(l.tsCierre)});
  }
  const recepciones = [], mermas = [], empaques = [], salidas = sal.filter(x => cae(x.despachada_ts)).map(x => ({nro: x.nro, zona: x.zona, kilos: T.r3(x.kilos), quien: nomRol(x.despachada_rol) || '—', hora: T.horaTxt(x.despachada_ts)}));
  for (const r of recs) { if (r.ts > 0) { if (cae(r.ts)) recepciones.push({id: r.id, item: r.item || '', kg: +r.kgRec || 0, prov: r.prov || '', quien: r.recibe || '', hora: T.horaTxt(r.ts)}); } else sinHora.recepciones++; }
  for (const m of mer) { if (m.ts > 0) { if (cae(m.ts)) mermas.push({id: m.id, etapa: m.etapa || '', prod: m.prod || '', cant: +m.cant || 0, un: m.un || '', causa: m.causa || '', quien: m.quien || '', hora: T.horaTxt(m.ts)}); } else sinHora.mermas++; }
  for (const e of empq) { const mm = T.minDe(e.hora); if (mm === null) { sinHora.empaque++; continue; } if (T.turnoDeMin(par, mm) === turno) empaques.push({id: e.id, pres: e.pres || '', und: +e.und || 0, bultos: 0, kg: +e.kg || 0, hora: e.hora, quien: ''}); }
  for (const x of emp.filter(y => cae(y.ts))) empaques.push({id: '', pres: x.nombre, und: 0, bultos: x.bultos, kg: 0, hora: T.horaTxt(x.ts), quien: nomRol(x.rol) || ''});
  return {kilos_por_etapa: kg, lotes_abiertos: abiertos, lotes_cerrados: cerrados, recepciones: topar(recepciones), mermas: {total_kg: T.r3(mermas.filter(m => String(m.un).toLowerCase() === 'kg').reduce((a, m) => a + m.cant, 0)), cantidad: mermas.length, items: topar(mermas)},
    empaques: topar(empaques), despachos: salidas, sin_hora: sinHora};
}
export async function turno(ctx, fecha, turno) {
  if (!T.puedeVerTurnos(ctx.rol)) throw err(403, T.MSG_SIN_TURNOS);
  fecha = fecha || hoyVE(); if (!fechaOk(fecha)) throw err(400, 'La fecha no es válida.');
  turno = turno || 'Mañana'; if (!T.TURNOS.includes(turno)) throw err(400, 'Elige el turno: Mañana o Tarde.');
  const db = ctx.db, dinero = T.veDinero(ctx.rol), verBono = T.puedeVerParam(ctx.rol);
  const [par, pol, emps, marcas] = await Promise.all([cargarParam(db), cargarPol(db), R.empleados(db), R.marcasDia(db, fecha)]);
  const hor = T.horarioDe(par, turno), jor = +pol.nomJornada || 8, dur = hor.definido ? hor.horas : jor, por = new Map(emps.map(e => [e.id, e]));
  const g = new Map();
  for (const m of marcas.filter(x => x.turno === turno)) {
    const a = g.get(m.empleado_id) || {empleado_id: m.empleado_id, entrada_ts: m.entrada_ts, salida_ts: 0, horas: 0, abierta: false};
    a.entrada_ts = Math.min(a.entrada_ts, m.entrada_ts); if (!m.salida_ts) a.abierta = true; else a.salida_ts = Math.max(a.salida_ts, m.salida_ts); a.horas += D.horasDe(m); g.set(m.empleado_id, a);
  }
  const personas = [...g.values()].map(a => {
    const e = por.get(a.empleado_id), pt = T.partirHoras(a.horas, dur);
    const base = {empleado_id: a.empleado_id, nombre: e ? e.n || e.id : a.empleado_id, cargo: e ? e.cargo || '' : '', area: e ? e.area || '' : '', entrada_ts: a.entrada_ts, salida_ts: a.abierta ? null : a.salida_ts, abierta: a.abierta, horas: T.r2(a.horas), horas_turno: T.r2(pt.normales), horas_extra: T.r2(pt.extra)};
    if (dinero && e) { const v = T.valoresHora(e, dur, pol.nomRecargo); Object.assign(base, v, {extra_bs: T.r2(pt.extra * v.valor_hora_extra)}); }
    return base;
  }).sort((x, y) => x.entrada_ts - y.entrada_ts);
  const prod = await produccion(db, fecha, turno, par), kgBono = (prod.kilos_por_etapa.find(e => e.etapa === par.bono.etapa) || {sale_kg: 0}).sale_kg;
  const out = {fecha, turno, horario: {definido: hor.definido, inicio: hor.inicio, fin: hor.fin, horas: hor.horas}, jornada_usada: hor.definido ? null : jor, horario_partido_al_mediodia: T.horarioPartido(par),
    personas, totales: {personas: personas.length, horas: T.r2(personas.reduce((a, p) => a + p.horas, 0)), horas_extra: T.r2(personas.reduce((a, p) => a + p.horas_extra, 0))}, produccion: prod, kilos_bono: kgBono, ve_dinero: dinero};
  if (verBono) {
    const calc = T.calcularBono(par, kgBono), ap = await R.bonoDe(db, fecha, turno);
    out.bono = {...calc, reparto_sugerido: T.repartirParejo(calc.monto, personas.map(p => p.empleado_id)).map(x => x.monto), etapa_nombre: (T.ETAPAS_KG.find(e => e.k === par.bono.etapa) || {}).t, modo_por_defecto: par.bono.reparto, puede_aplicar: T.puedeAplicarBono(ctx.rol), puede_deshacer: T.puedeEditarParam(ctx.rol),
      aplicado: ap ? {id: ap.id, modo: ap.modo, total: ap.total, calculado: ap.calculado, quien: nomRol(ap.quien), ts: ap.ts, filas: (await R.bonoFilas(db, ap.id)).map(f => ({...f, nombre: (por.get(f.empleado_id) || {}).n || f.empleado_id}))} : null};
  }
  return out;
}
/* Aplica el bono del turno: a todo el turno (parejo) o persona por persona. Una sola vez por turno y día. */
export async function aplicarBono(ctx, b) {
  if (!T.puedeAplicarBono(ctx.rol)) throw err(403, T.MSG_SIN_BONO);
  const fecha = String((b && b.fecha) || ''), tn = String((b && b.turno) || ''); if (!fechaOk(fecha)) throw err(400, 'La fecha no es válida.'); if (!T.TURNOS.includes(tn)) throw err(400, 'Elige el turno: Mañana o Tarde.');
  const db = ctx.db; if (await R.bonoDe(db, fecha, tn)) throw err(409, 'Ese turno ya tiene su bono aplicado.', {codigo: 'YA_APLICADO'});
  const [par, marcas] = await Promise.all([cargarParam(db), R.marcasDia(db, fecha)]), presentes = [...new Set(marcas.filter(x => x.turno === tn).map(x => x.empleado_id))];
  const [d, h] = rangoDia(fecha), mov = await R.movProceso(db, d, h);
  const kg = T.r3(mov.filter(x => x.etapa === par.bono.etapa && x.sentido === 'SALE' && T.fechaVE(x.ts) === fecha && T.turnoDeMin(par, T.minVE(x.ts)) === tn).reduce((a, x) => a + x.kilos, 0));
  const calc = T.calcularBono(par, kg), v = T.validarBono(b, calc, presentes); if (v.error) throw err(400, v.error);
  const o = v.ok, total = T.r2(o.filas.reduce((a, f) => a + f.monto, 0)), emps = new Map((await R.empleados(db)).map(e => [e.id, e]));
  try {
    await R.lote(db, [R.stBono(db, {fecha, turno: tn, modo: o.modo, kilos: kg, calculado: calc.monto, total, detalle: {cumplimiento: calc.cumplimiento, pct_bono: calc.pct_bono, meta_kg: calc.meta_kg}, quien: ctx.rol, ts: Date.now()}), ...o.filas.map(f => R.stBonoEmp(db, fecha, tn, f)),
      ...audit(ctx, fecha + ' ' + tn, 'Bono del turno ' + tn + ' ' + fecha, 'aplicó el bono de producción', {modo: o.modo, kilos: kg, calculado: calc.monto, total, personas: o.filas.map(f => ({nombre: (emps.get(f.empleado_id) || {}).n || f.empleado_id, monto: f.monto}))})]);
  } catch (e) { if (/UNIQUE/i.test(String((e && e.message) || e))) throw err(409, 'Ese turno ya tiene su bono aplicado.', {codigo: 'YA_APLICADO'}); throw e; }
  return turno(ctx, fecha, tn);
}
/* Deshace el bono de un turno (solo Gerencia y solo si todavía no hay un pago de nómina de esas personas que cubra esa fecha) */
export async function anularBono(ctx, b) {
  if (!T.puedeEditarParam(ctx.rol)) throw err(403, 'Solo Gerencia deshace un bono aplicado.');
  const fecha = String((b && b.fecha) || ''), tn = String((b && b.turno) || ''), ap = fechaOk(fecha) ? await R.bonoDe(ctx.db, fecha, tn) : null; if (!ap) throw err(404, 'Ese turno no tiene bono aplicado.');
  const pagados = await R.pagosSolapados(ctx.db, fecha, fecha), ids = new Set((await R.bonoFilas(ctx.db, ap.id)).map(f => f.empleado_id));
  if (pagados.some(p => ids.has(p.empleado_id))) throw err(409, 'Ese bono ya entró en un pago de nómina: no se puede deshacer.');
  await R.lote(ctx.db, [...R.stBonoBorrar(ctx.db, ap.id), ...audit(ctx, fecha + ' ' + tn, 'Bono del turno ' + tn + ' ' + fecha, 'deshizo el bono de producción', {total: ap.total})]);
  return turno(ctx, fecha, tn);
}

/* ---------- Asistencia por quincena, llenada sola con las marcas ---------- */
const p2 = n => String(n).padStart(2, '0');
export const quincenaDe = f => { const [y, m, d] = f.split('-'); return y + '-' + m + '-' + (+d <= 15 ? 1 : 2); };
export function rangoQuincena(q) { const [y, m, k] = q.split('-').map(Number), ult = new Date(Date.UTC(y, m, 0)).getUTCDate(); return k === 1 ? [y + '-' + p2(m) + '-01', y + '-' + p2(m) + '-15'] : [y + '-' + p2(m) + '-16', y + '-' + p2(m) + '-' + p2(ult)]; }
/* Recalcula y guarda la asistencia de la quincena a partir de las marcas cerradas. Si la persona tenía datos anotados a mano, se guardan aparte (manual_prev) y no se pierden. */
export async function sincronizarAsistencia(db, q, soloEmp) {
  const [desde, hasta] = rangoQuincena(q), [par, pol, marcas] = await Promise.all([cargarParam(db), cargarPol(db), R.entre(db, desde, hasta)]);
  const por = new Map();
  for (const m of marcas) {
    if (soloEmp && m.empleado_id !== soloEmp) continue;
    const a = por.get(m.empleado_id) || {}, dia = a[m.fecha] || (a[m.fecha] = {h: 0, dur: null}); dia.h += D.horasDe(m);
    if (dia.dur === null) { const hh = T.horarioDe(par, m.turno); dia.dur = hh.definido ? hh.horas : (+pol.nomJornada || 8); }
    por.set(m.empleado_id, a);
  }
  const st = [], res = {};
  for (const [emp, dias] of por) {
    const fs = Object.keys(dias).filter(f => dias[f].h > 0); if (!fs.length) continue;
    const hh = T.r2(fs.reduce((a, f) => a + T.partirHoras(dias[f].h, dias[f].dur).normales, 0)), ex = T.r2(fs.reduce((a, f) => a + T.partirHoras(dias[f].h, dias[f].dur).extra, 0));
    const id = 'AS-' + q + '-' + emp, cur = (await R.asisDoc(db, id)) || {q, emp, dias: 0, horas: 0, extra: 0, bonos: 0}, nuevo = {...cur, q, emp, dias: fs.length, horas: hh, extra: ex, auto: 1};
    if (!cur.auto && !cur.manual_prev && (cur.dias || cur.horas || cur.extra)) nuevo.manual_prev = {dias: cur.dias || 0, horas: cur.horas || 0, extra: cur.extra || 0};
    res[emp] = {dias: fs.length, horas: hh, extra: ex};
    if (cur.auto && cur.dias === fs.length && cur.horas === hh && cur.extra === ex) continue;
    st.push(R.stAsistencia(db, id, nuevo));
  }
  if (st.length) await R.lote(db, [...st, R.stVer(db)]);
  return res;
}
export async function asistencia(ctx, q) {
  if (!D.puedeVer(ctx.rol)) throw err(403, D.MSG_SIN_VER);
  q = q || quincenaDe(hoyVE()); if (!/^\d{4}-(0[1-9]|1[0-2])-[12]$/.test(q)) throw err(400, 'La quincena no es válida.');
  const res = await sincronizarAsistencia(ctx.db, q), [desde, hasta] = rangoQuincena(q), emps = await R.empleados(ctx.db), por = new Map(emps.map(e => [e.id, e]));
  return {q, desde, hasta, personas: Object.entries(res).map(([id, v]) => ({empleado_id: id, nombre: (por.get(id) || {}).n || id, ...v}))};
}
