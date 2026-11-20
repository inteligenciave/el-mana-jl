/* Turnos, asistencia automática, parámetros y bonos de producción · casos de uso (sin HTTP).
   Todos los montos se calculan aquí. Sueldos y tarifas solo para Gerencia y Recursos humanos; Producción y Administración ven horas y kilos, no dinero de personas. */
import * as T from './turnos.js';
import * as R from './repo.js';
import * as D from './dominio.js';
import {ROL_TXT, nomRol} from '../ventas/permisos.js';
import {hoyVE} from '../ventas/dominio.js';
import * as TA from '../tasa/servicio.js';

export const err = (status, message, extra = {}) => Object.assign(new Error(message), {status, message, extra});
const audit = (ctx, ref, nom, accion, detalle) => R.stAuditoria(ctx.db, {rol: ctx.rol, rolTxt: nomRol(ctx.rol), ent: 'turno', ref, nom, accion, detalle});
const fechaOk = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const POL0 = {nomJornada: 8, nomRecargo: 0, nomLey: 0};
export const cargarParam = async (db, fecha) => T.parametros(await R.parametrosDoc(db), fecha);
export const cargarPol = async db => ({...POL0, ...(await R.politicas(db))});
/* Tasa BCV vigente hoy para mostrar el equivalente en Bs (null si no hay ninguna guardada). Los montos de nómina son en dólares. */
export const tasaHoy = async db => { try { const t = await TA.vigente(db, hoyVE()); return t ? {valor: t.valor, fecha: t.fecha} : null; } catch (e) { return null; } };

/* ---------- Parámetros ---------- */
const fd = f => (/^\d{4}-\d{2}-\d{2}$/.test(String(f)) ? f.slice(8) + '/' + f.slice(5, 7) + '/' + f.slice(0, 4) : String(f || ''));
const sumaDia = (f, n) => new Date(Date.parse(f + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const horTxt = h => ['Diurno', 'Nocturno'].map(t => t + ' ' + ((h[t] && h[t].inicio) || '—') + ' a ' + ((h[t] && h[t].fin) || '—')).join(' · ');
const avisoFila = x => ({id: x.id, rol: x.rol, rol_txt: nomRol(x.rol), resumen: x.resumen, detalle: (() => { try { return JSON.parse(x.detalle || '{}'); } catch (e) { return {}; } })(), creado_ts: x.creado_ts, visto: !!x.visto_ts, visto_ts: x.visto_ts || null});
export async function parametros(ctx) {
  if (!T.puedeVerParam(ctx.rol)) throw err(403, T.MSG_SIN_PARAM);
  const par = await cargarParam(ctx.db), pol = await cargarPol(ctx.db), hor = {}, hoy = hoyVE(), cierre = await R.ultimoCierre(ctx.db);
  for (const t of T.TURNOS) hor[t] = T.horarioDe(par, t);
  /* Un horario nuevo solo puede empezar después de lo ya pagado o con bono aplicado (Gerencia sí puede corregirlo). Nunca antes de hoy. */
  const minima = ctx.rol === 'dueno' || !cierre || cierre < hoy ? hoy : sumaDia(cierre, 1);
  const proximos = par.historial.filter(x => x.desde > hoy).map(x => ({desde: x.desde, horarios: x.horarios, quien_txt: nomRol(x.quien) || ''}));
  const out = {horarios: par.horarios, bono: par.bono, horarios_calculados: hor, huecos: T.huecosDe(par.horarios), proximos, pagos: {nomJornada: +pol.nomJornada || 8, nomRecargo: +pol.nomRecargo || 0, nomLey: +pol.nomLey || 0}, puede_editar: T.puedeEditarParam(ctx.rol), puede_editar_horarios: T.puedeEditarHorario(ctx.rol),
    puede_aplicar: T.puedeAplicarBono(ctx.rol), etapas: T.ETAPAS_KG, hoy, desde_minima: minima, ultimo_cierre: cierre};
  if (ctx.rol === 'dueno') { out.avisos = (await R.avisos(ctx.db)).map(avisoFila); out.avisos_pendientes = await R.avisosPendientes(ctx.db); }
  return out;
}
/* Horarios de Diurno y Nocturno (Gerencia y Nómina). Valen desde `desde` (por defecto hoy) hacia adelante: no cambian días anteriores.
   Nómina no puede empezar el cambio en días ya pagados o con bono aplicado; Gerencia sí (es quien autoriza esas correcciones).
   Reglas de pago y bono: solo Gerencia. Todo cambio queda en auditoría con el valor anterior y el nuevo; si lo hace Nómina, Gerencia recibe un aviso. */
export async function guardarParametros(ctx, b) {
  if (!T.puedeVerParam(ctx.rol)) throw err(403, T.MSG_SIN_PARAM);
  const gerente = T.puedeEditarParam(ctx.rol); if (!gerente && !T.puedeEditarHorario(ctx.rol)) throw err(403, T.MSG_SOLO_GERENCIA);
  const hoy = hoyVE(), desde = String((b && b.desde) || hoy);
  if (!fechaOk(desde)) throw err(400, 'La fecha desde la que vale el cambio no es válida.');
  if (desde < hoy) throw err(409, 'El horario nuevo solo puede empezar desde hoy en adelante: los días que ya pasaron no se cambian.', {bloqueado: true});
  if (desde > sumaDia(hoy, 365)) throw err(400, 'Esa fecha queda muy lejos: elige una dentro del próximo año.');
  const doc = await R.parametrosDoc(ctx.db), par = T.parametros(doc, desde);
  const v = T.validarParametros(gerente ? b : {horarios: b && b.horarios}, {exigirHorarios: !gerente}); if (v.error) throw err(400, v.error);
  const o = v.ok, nuevos = T.parametros({horarios: o.horarios}).horarios;
  if (!gerente) { /* Nómina no cambia reglas de pago ni bono: si manda algo de eso y es distinto de lo guardado, se rechaza */
    const vv = T.validarParametros(b || {}), pol = await cargarPol(ctx.db);
    if (b && b.bono && vv.ok && JSON.stringify(vv.ok.bono) !== JSON.stringify(par.bono)) throw err(403, T.MSG_SOLO_HORARIOS);
    if (b && b.pagos && vv.ok && (+vv.ok.pol.nomJornada !== (+pol.nomJornada || 8) || +vv.ok.pol.nomRecargo !== (+pol.nomRecargo || 0) || +vv.ok.pol.nomLey !== (+pol.nomLey || 0))) throw err(403, T.MSG_SOLO_HORARIOS);
  }
  const cambia = JSON.stringify(nuevos) !== JSON.stringify(par.horarios) || par.historial.some(x => x.desde > desde); /* guardar desde una fecha reemplaza también los cambios programados para después */
  if (cambia && !gerente) {
    const cierre = await R.ultimoCierre(ctx.db);
    if (cierre && desde <= cierre) throw err(409, 'No se puede cambiar el horario desde el ' + fd(desde) + ': hay pagos de nómina o bonos aplicados hasta el ' + fd(cierre) + '. Elige el ' + fd(sumaDia(cierre, 1)) + ' o un día después. Si de verdad hay que corregir lo ya pagado, pide autorización a Gerencia.', {bloqueado: true, ultimo_cierre: cierre, desde_minima: sumaDia(cierre, 1)});
  }
  const ts = Date.now();
  let historial = par.historial.length ? par.historial.map(x => ({desde: x.desde, horarios: x.horarios, quien: x.quien, ts: x.ts})) : [{desde: '0000-01-01', horarios: par.horarios, quien: '', ts: 0}];
  if (cambia) historial = [...historial.filter(x => x.desde < desde), {desde, horarios: nuevos, quien: ctx.rol, ts}].slice(-60);
  const st = [R.stParametros(ctx.db, {horarios: historial[historial.length - 1].horarios, bono: gerente ? o.bono : par.bono, historial}), R.stVer(ctx.db)];
  if (gerente && o.conPagos) st.push(R.stPolNomina(ctx.db, o.pol));
  const detalle = {desde, horarios_antes: par.horarios, horarios_despues: nuevos, ...(gerente ? {bono: o.bono, pagos: o.conPagos ? o.pol : undefined} : {})};
  st.push(...audit(ctx, 'parametros', 'Parámetros de turnos y bonos', cambia ? 'cambió los horarios de los turnos desde el ' + fd(desde) + ' (antes: ' + horTxt(par.horarios) + '; ahora: ' + horTxt(nuevos) + ')' : 'cambió los parámetros de turnos y bonos', detalle));
  if (cambia && !gerente) st.push(R.stAviso(ctx.db, {rol: ctx.rol, ts, resumen: nomRol(ctx.rol) + ' cambió el horario de los turnos desde el ' + fd(desde) + '. Antes: ' + horTxt(par.horarios) + '. Ahora: ' + horTxt(nuevos) + '.', detalle: {desde, antes: par.horarios, despues: nuevos}}));
  await R.lote(ctx.db, st);
  return parametros(ctx);
}
/* Avisos a Gerencia (solo Gerencia) */
export async function avisos(ctx) {
  if (ctx.rol !== 'dueno') throw err(403, 'Solo Gerencia ve estos avisos.');
  return {avisos: (await R.avisos(ctx.db)).map(avisoFila), pendientes: await R.avisosPendientes(ctx.db)};
}
export async function avisoVisto(ctx, b) {
  if (ctx.rol !== 'dueno') throw err(403, 'Solo Gerencia ve estos avisos.');
  const ts = Date.now(), id = b && b.id !== undefined && b.id !== null && b.id !== '' ? +b.id : null;
  if (id !== null && !(id > 0)) throw err(400, 'Aviso no válido.');
  await R.lote(ctx.db, [id ? R.stAvistoUno(ctx.db, id, ctx.rol, ts) : R.stAvistoTodos(ctx.db, ctx.rol, ts), R.stVer(ctx.db)]);
  return avisos(ctx);
}

/* ---------- Pantalla «Turnos» ---------- */
const topar = (arr, n = 30) => arr.slice(0, n);
/* Lo hecho en el turno. La ventana del turno sale del horario (el nocturno termina al día siguiente); lo que no trae hora no se asigna y se cuenta aparte («sin hora»). */
async function produccion(db, fecha, turno, par) {
  const [d, h] = T.ventanaTs(par, fecha, turno), cae = ts => ts > 0 && ts >= d && ts < h, dias = [fecha, ...(T.horarioDe(par, turno).cruza ? [T.mueveDia(fecha, 1)] : [])];
  const tsHora = (f, hh) => { const mm = T.minDe(hh); if (mm === null) return null; const [y, m, dd] = f.split('-').map(Number); return Date.UTC(y, m - 1, dd, 4) + mm * 60e3; };
  const dd = async col => (await Promise.all(dias.map(f => R.docsFecha(db, col, f)))).flat();
  const [mov, emp, lotes, recs, mer, empq, sal, desp] = await Promise.all([R.movProceso(db, d, h), R.empaqueTurno(db, d, h), R.lotesDelDia(db, fecha, d, h), dd('recepciones'), dd('mermas'), dd('empaques'), R.salidasDespachadas(db, d, h), R.docsFecha(db, 'despachos', fecha)]);
  const sinHora = {lotes: 0, recepciones: 0, mermas: 0, empaque: 0, notas_de_entrega: desp.length};
  const kg = T.ETAPAS_KG.map(e => { const m = mov.filter(x => x.etapa === e.k && cae(x.ts)); return {etapa: e.k, nombre: e.t, entra_kg: T.r3(m.filter(x => x.sentido === 'ENTRA').reduce((a, x) => a + x.kilos, 0)), sale_kg: T.r3(m.filter(x => x.sentido === 'SALE').reduce((a, x) => a + x.kilos, 0))}; });
  const abiertos = [], cerrados = [];
  for (const l of lotes) {
    if (l.ts > 0 && cae(l.ts)) abiertos.push({id: l.id, cruda_kg: +l.cruda || 0, quien: l.quien || '—', hora: T.horaTxt(l.ts)});
    else if (l.fecha === fecha && !(l.ts > 0)) sinHora.lotes++;
    if (l.tsCierre > 0 && cae(l.tsCierre)) cerrados.push({id: l.id, granel_kg: +l.granel || 0, aceite_kg: +l.aceite || 0, quien: l.cerro || '—', hora: T.horaTxt(l.tsCierre)});
  }
  const recepciones = [], mermas = [], empaques = [], salidas = sal.filter(x => cae(x.despachada_ts)).map(x => ({nro: x.nro, zona: x.zona, kilos: T.r3(x.kilos), quien: nomRol(x.despachada_rol) || '—', hora: T.horaTxt(x.despachada_ts)}));
  for (const r of recs) { if (r.ts > 0) { if (cae(r.ts)) recepciones.push({id: r.id, item: r.item || '', kg: +r.kgRec || 0, prov: r.prov || '', quien: r.recibe || '', hora: T.horaTxt(r.ts)}); } else if (r.fecha === fecha) sinHora.recepciones++; }
  for (const m of mer) { if (m.ts > 0) { if (cae(m.ts)) mermas.push({id: m.id, etapa: m.etapa || '', prod: m.prod || '', cant: +m.cant || 0, un: m.un || '', causa: m.causa || '', quien: m.quien || '', hora: T.horaTxt(m.ts)}); } else if (m.fecha === fecha) sinHora.mermas++; }
  for (const e of empq) { const ts = tsHora(e.fecha || fecha, e.hora); if (ts === null) { if ((e.fecha || fecha) === fecha) sinHora.empaque++; continue; } if (cae(ts)) empaques.push({id: e.id, pres: e.pres || '', und: +e.und || 0, bultos: 0, kg: +e.kg || 0, hora: e.hora, quien: ''}); }
  for (const x of emp.filter(y => cae(y.ts))) empaques.push({id: '', pres: x.nombre, und: 0, bultos: x.bultos, kg: 0, hora: T.horaTxt(x.ts), quien: nomRol(x.rol) || ''});
  return {kilos_por_etapa: kg, lotes_abiertos: abiertos, lotes_cerrados: cerrados, recepciones: topar(recepciones), mermas: {total_kg: T.r3(mermas.filter(m => String(m.un).toLowerCase() === 'kg').reduce((a, m) => a + m.cant, 0)), cantidad: mermas.length, items: topar(mermas)},
    empaques: topar(empaques), despachos: salidas, sin_hora: sinHora};
}
export async function turno(ctx, fecha, turno) {
  if (!T.puedeVerTurnos(ctx.rol)) throw err(403, T.MSG_SIN_TURNOS);
  fecha = fecha || hoyVE(); if (!fechaOk(fecha)) throw err(400, 'La fecha no es válida.');
  turno = turno || 'Diurno'; if (!T.TURNOS.includes(turno)) throw err(400, T.MSG_ELIGE_TURNO);
  const db = ctx.db, dinero = T.veDinero(ctx.rol);
  const [par, pol, emps, marcas] = await Promise.all([cargarParam(db, fecha), cargarPol(db), R.empleados(db), R.marcasDia(db, fecha)]);
  const tasa = dinero ? await tasaHoy(db) : null, hor = T.horarioDe(par, turno), jor = +pol.nomJornada || 8, dur = hor.definido ? hor.horas : jor, por = new Map(emps.map(e => [e.id, e]));
  const g = new Map();
  for (const m of marcas.filter(x => x.turno === turno)) {
    const a = g.get(m.empleado_id) || {empleado_id: m.empleado_id, entrada_ts: m.entrada_ts, salida_ts: 0, horas: 0, abierta: false};
    a.entrada_ts = Math.min(a.entrada_ts, m.entrada_ts); if (!m.salida_ts) a.abierta = true; else a.salida_ts = Math.max(a.salida_ts, m.salida_ts); a.horas += D.horasDe(m); g.set(m.empleado_id, a);
  }
  const personas = [...g.values()].map(a => {
    const e = por.get(a.empleado_id), pt = T.partirHoras(a.horas, dur);
    const base = {empleado_id: a.empleado_id, nombre: e ? e.n || e.id : a.empleado_id, cargo: e ? e.cargo || '' : '', area: e ? e.area || '' : '', entrada_ts: a.entrada_ts, salida_ts: a.abierta ? null : a.salida_ts, abierta: a.abierta, horas: T.r2(a.horas), horas_turno: T.r2(pt.normales), horas_extra: T.r2(pt.extra)};
    if (dinero && e) { const v = T.valoresHora(e, dur, pol.nomRecargo); Object.assign(base, v, {extra_usd: T.r2(pt.extra * v.valor_hora_extra)}); }
    return base;
  }).sort((x, y) => x.entrada_ts - y.entrada_ts);
  const prod = await produccion(db, fecha, turno, par), kgBono = (prod.kilos_por_etapa.find(e => e.etapa === 'empacado') || {entra_kg: 0}).entra_kg;
  const out = {fecha, turno, horario: {definido: hor.definido, inicio: hor.inicio, fin: hor.fin, horas: hor.horas, cruza: hor.cruza, ventana_ts: T.ventanaTs(par, fecha, turno)}, moneda: 'USD', tasa, jornada_usada: hor.definido ? null : jor, horario_partido_al_mediodia: T.horarioPartido(par),
    personas, totales: {personas: personas.length, horas: T.r2(personas.reduce((a, p) => a + p.horas, 0)), horas_extra: T.r2(personas.reduce((a, p) => a + p.horas_extra, 0))}, produccion: prod, kilos_bono: kgBono, ve_dinero: dinero};
  return out;
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
    if (dia.dur === null) { const hh = T.horarioDe(T.parEn(par, m.fecha), m.turno); dia.dur = hh.definido ? hh.horas : (+pol.nomJornada || 8); }
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
