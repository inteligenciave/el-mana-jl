/* Grupos rotativos · casos de uso (sin HTTP). Gerencia y Nómina arman los grupos y asignan el grupo completo a Diurno o Nocturno cada semana.
   Cada semana guarda quiénes estaban (historial). Una persona se puede mover de grupo SOLO una semana (excepción). */
import * as G from './grupos.js';
import * as R from './repo.js';
import * as D from './dominio.js';
import {nomRol} from '../ventas/permisos.js';
import {hoyVE} from '../ventas/dominio.js';
export const err = (status, message, extra = {}) => Object.assign(new Error(message), {status, message, extra});

const audit = (ctx, ref, nom, accion, detalle) => R.stAuditoria(ctx.db, {rol: ctx.rol, rolTxt: nomRol(ctx.rol), ent: 'grupo', ref, nom, accion, detalle});
/* Lo ya pagado o con bono aplicado no se cambia. Gerencia sí puede (es quien autoriza las correcciones); Nómina pide autorización. */
const fd = f => (/^\d{4}-\d{2}-\d{2}$/.test(String(f)) ? f.slice(8) + '/' + f.slice(5, 7) + '/' + f.slice(0, 4) : String(f || ''));
const finSemana = sem => new Date(Date.parse(sem + 'T00:00:00Z') + 6 * 864e5).toISOString().slice(0, 10);
async function cierres(db, desde, hasta) {
  const m = new Map(), g = id => m.get(id) || m.set(id, {pago: null, bono: null}).get(id);
  for (const x of await R.pagosEnRango(db, desde, hasta)) g(x.empleado_id).pago = {desde: x.desde, hasta: x.hasta};
  for (const x of await R.bonosEnRango(db, desde, hasta)) { const c = g(x.empleado_id); if (!c.bono || x.fecha > c.bono) c.bono = x.fecha; }
  return m;
}
const motivoCierre = c => [c.pago ? 'ya tiene pago de nómina del ' + fd(c.pago.desde) + ' al ' + fd(c.pago.hasta) : '', c.bono ? 'tiene un bono aplicado (último el ' + fd(c.bono) + ')' : ''].filter(Boolean).join(' y ');
async function exigirAbierto(ctx, ids, desde, hasta, queCambia) {
  if (ctx.rol === 'dueno' || !ids.length) return;
  const c = await cierres(ctx.db, desde, hasta), malos = [...new Set(ids)].filter(id => c.has(id));
  if (!malos.length) return;
  const por = new Map((await R.empleados(ctx.db)).map(e => [e.id, e])), frases = malos.slice(0, 3).map(id => (nombre(por.get(id)) || id) + ' ' + motivoCierre(c.get(id)));
  throw err(409, 'No se puede ' + queCambia + ': ' + frases.join('; ') + (malos.length > 3 ? ' y ' + (malos.length - 3) + ' persona(s) más' : '') + '. Lo ya pagado o con bono aplicado no se cambia. Si de verdad hay que corregirlo, pide autorización a Gerencia.', {bloqueado: true, personas: malos.map(id => nombre(por.get(id)) || id)});
}
const exigirAsigna = ctx => { if (!G.puedeAsignarGrupos(ctx.rol)) throw err(403, G.MSG_SIN_ASIGNAR); };
const nombre = e => (e && (e.n || e.id)) || '';
const persona = e => ({id: e.id, nombre: nombre(e), cargo: e.cargo || '', area: e.area || '', planta: D.esPlanta(e), turno_ficha: e.turno || ''});

/* Quién está en qué grupo y qué turno tiene cada grupo, para un rango de fechas. Devuelve una función (persona, fecha) → {turno, origen, grupo_id}.
   Es lo que usan marcar entrada, el lector y la nómina para saber el turno que le toca a cada persona. */
export async function resolverTurnos(db, desde, hasta) {
  const s0 = G.lunesDe(desde), s1 = G.lunesDe(hasta);
  const [gs, sn, mi] = await Promise.all([R.grupoSemanaEntre(db, s0, s1), R.grupoSemanaMiembrosEntre(db, s0, s1), R.grupoMiembros(db)]);
  const turnos = new Map(gs.map(r => [r.semana + '|' + r.grupo_id, r.turno])), snap = new Map(sn.map(r => [r.semana + '|' + r.empleado_id, r])), act = new Map(mi.map(m => [m.empleado_id, m.grupo_id]));
  return (emp, fecha) => {
    const sem = G.lunesDe(fecha), s = snap.get(sem + '|' + emp.id), gid = s ? s.grupo_id : act.get(emp.id) || null;
    return G.turnoEfectivo({fichaTurno: emp.turno, gid, turnoGrupo: gid ? turnos.get(sem + '|' + gid) : null});
  };
}
/* El turno que le toca a UNA persona en una fecha */
export async function turnoDe(db, emp, fecha) { return (await resolverTurnos(db, fecha, fecha))(emp, fecha); }

/* Pantalla «Grupos» de una semana */
export async function grupos(ctx, semana) {
  if (!G.puedeVerGrupos(ctx.rol)) throw err(403, G.MSG_SIN_VER_GRUPOS);
  const hoy = hoyVE(), actual = G.lunesDe(hoy), sem = semana ? (G.fechaOk(String(semana)) ? G.lunesDe(String(semana)) : null) : actual;
  if (!sem) throw err(400, 'La semana no es válida.');
  const [emps, mi, gs, sn, recientes] = await Promise.all([R.empleados(ctx.db), R.grupoMiembros(ctx.db), R.grupoSemanaEntre(ctx.db, sem, sem), R.grupoSemanaMiembrosEntre(ctx.db, sem, sem), R.gruposSemanasRecientes(ctx.db, actual, 12)]);
  const por = new Map(emps.map(e => [e.id, e])), activos = emps.filter(D.activo), casa = new Map(mi.map(m => [m.empleado_id, m.grupo_id])), turnos = new Map(gs.map(r => [r.grupo_id, r.turno]));
  /* Quién estaba en cada grupo esa semana: lo guardado de esa semana; si no hay nada guardado, los integrantes de hoy */
  const guardado = new Map(sn.map(r => [r.empleado_id, r]));
  const enSemana = new Map(); /* emp → {gid, excepcion} */
  if (turnos.size) for (const [emp, r] of guardado) enSemana.set(emp, {gid: r.grupo_id, excepcion: !!r.excepcion});
  for (const [emp, gid] of casa) if (!enSemana.has(emp)) enSemana.set(emp, {gid, excepcion: false});
  const lista = G.GRUPOS.map(g => {
    const m = [...enSemana].filter(([, x]) => x.gid === g.id).map(([emp, x]) => ({...persona(por.get(emp) || {id: emp}), excepcion: x.excepcion, grupo_origen: casa.get(emp) || null, activo: !!por.get(emp) && D.activo(por.get(emp))})).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    return {id: g.id, nombre: g.nombre, turno: turnos.get(g.id) || null, miembros: m};
  });
  const sinGrupo = activos.filter(e => !casa.has(e.id) && D.esPlanta(e)).map(persona).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const historial = [];
  if (recientes.length) {
    const desde = recientes[recientes.length - 1].semana, [hs, hm] = await Promise.all([R.grupoSemanaEntre(ctx.db, desde, actual), R.grupoSemanaMiembrosEntre(ctx.db, desde, actual)]);
    for (const {semana: w} of recientes) historial.push({semana: w, grupos: G.GRUPOS.map(g => ({id: g.id, nombre: g.nombre, turno: (hs.find(x => x.semana === w && x.grupo_id === g.id) || {}).turno || null,
      miembros: hm.filter(x => x.semana === w && x.grupo_id === g.id).map(x => nombre(por.get(x.empleado_id)) || x.empleado_id + (x.excepcion ? ' (solo esa semana)' : '')).sort((a, b) => a.localeCompare(b, 'es'))}))});
  }
  const cie = await cierres(ctx.db, sem, finSemana(sem)), bloquea = ctx.rol !== 'dueno';
  for (const g of lista) { for (const m of g.miembros) { const c = cie.get(m.id); m.bloqueo = c ? {pagado: !!c.pago, bono: !!c.bono, texto: motivoCierre(c)} : null; } g.bloqueado = g.miembros.some(m => m.bloqueo); }
  return {semana: sem, semana_actual: actual, anterior: G.masSemanas(sem, -1), siguiente: G.masSemanas(sem, 1), puede_asignar: G.puedeAsignarGrupos(ctx.rol), bloquea, asignada: turnos.size > 0, grupos: lista, sin_grupo: sinGrupo, historial};
}

/* Quién integra un grupo (la lista completa de integrantes). Una persona está en un solo grupo: si estaba en el otro, se mueve. */
export async function guardarMiembros(ctx, b) {
  exigirAsigna(ctx);
  if (!G.grupoValido(b && b.grupo_id)) throw err(400, 'Elige el Grupo 1 o el Grupo 2.');
  const gid = +b.grupo_id, ids = [...new Set((Array.isArray(b.empleados) ? b.empleados : []).map(x => String(x || '').trim()).filter(Boolean))];
  if (ids.length > 200) throw err(400, 'Son demasiadas personas para un grupo.');
  const emps = await R.empleados(ctx.db), por = new Map(emps.map(e => [e.id, e]));
  const yaEnGrupo = new Set((await R.grupoMiembros(ctx.db)).map(m => m.empleado_id));
  for (const id of ids) { const e = por.get(id); if (!e) throw err(404, 'Una de las personas ya no existe.'); if (!D.activo(e)) throw err(409, nombre(e) + ' ya no está activa en Personal.'); if (!D.esPlanta(e) && !yaEnGrupo.has(id)) throw err(409, nombre(e) + ' es de ' + (e.puesto || e.area || 'oficina') + ': ' + D.MSG_TURNO_SOLO_PLANTA); }
  const antes = new Map((await R.grupoMiembros(ctx.db)).map(m => [m.empleado_id, m.grupo_id])), ts = Date.now(), semActual = G.lunesDe(hoyVE(ts));
  const salen = [...antes].filter(([e, g]) => g === gid && !ids.includes(e)).map(([e]) => nombre(por.get(e)) || e), entran = ids.filter(id => antes.get(id) !== gid), movidos = entran.filter(id => antes.has(id)).map(id => nombre(por.get(id)));
  const salenIds = [...antes].filter(([e, g]) => g === gid && !ids.includes(e)).map(([e]) => e);
  await exigirAbierto(ctx, [...salenIds, ...entran], semActual, '9999-12-31', 'cambiar los integrantes del Grupo ' + gid);
  await R.lote(ctx.db, [R.stGrupoVaciar(ctx.db, gid), ...ids.map(id => R.stGrupoPoner(ctx.db, id, gid, ts)), ...R.stSnapDesde(ctx.db, semActual, ctx.rol, ts), R.stVer(ctx.db),
    ...audit(ctx, 'Grupo ' + gid, 'Grupo ' + gid, 'cambió los integrantes del Grupo ' + gid, {integrantes: ids.map(id => nombre(por.get(id))), salen, entran: entran.map(id => nombre(por.get(id))), movidos_desde_otro_grupo: movidos})]);
  return grupos(ctx, semActual);
}

/* Asigna el grupo completo a un turno esa semana. Por defecto el otro grupo recibe el turno contrario (rotan). */
export async function asignarSemana(ctx, b) {
  exigirAsigna(ctx);
  const v = G.validarAsignacion(b); if (v.error) throw err(400, v.error);
  const o = v.ok, ts = Date.now(), otro0 = G.GRUPOS.find(g => g.id !== o.grupo_id), ya = new Map((await R.grupoSemanaEntre(ctx.db, o.semana, o.semana)).map(r => [r.grupo_id, r.turno]));
  if (!(ya.get(o.grupo_id) === o.turno && (!o.ambos || ya.get(otro0.id) === G.opuesto(o.turno)))) { /* si no cambia nada, no hay nada que bloquear */
    const gids = o.ambos ? [o.grupo_id, otro0.id] : [o.grupo_id], snap = await R.grupoSemanaMiembrosEntre(ctx.db, o.semana, o.semana), casa = await R.grupoMiembros(ctx.db);
    const afectados = [...snap.filter(x => gids.includes(x.grupo_id)).map(x => x.empleado_id), ...casa.filter(x => gids.includes(x.grupo_id)).map(x => x.empleado_id)];
    await exigirAbierto(ctx, afectados, o.semana, finSemana(o.semana), 'cambiar el turno del Grupo ' + o.grupo_id + ' en la semana del ' + fd(o.semana));
  }
  const st = [R.stGrupoSemana(ctx.db, o.semana, o.grupo_id, o.turno, ctx.rol, ts)], otro = G.GRUPOS.find(g => g.id !== o.grupo_id);
  if (o.ambos) st.push(R.stGrupoSemana(ctx.db, o.semana, otro.id, G.opuesto(o.turno), ctx.rol, ts));
  await R.lote(ctx.db, [...st, ...R.stSnapSemana(ctx.db, o.semana, ctx.rol, ts), R.stVer(ctx.db),
    ...audit(ctx, o.semana + ' Grupo ' + o.grupo_id, 'Grupo ' + o.grupo_id, 'asignó el Grupo ' + o.grupo_id + ' al turno ' + o.turno + ' (semana del ' + o.semana + ')', {semana: o.semana, grupo: o.grupo_id, turno: o.turno, otro_grupo: o.ambos ? {grupo: otro.id, turno: G.opuesto(o.turno)} : null})]);
  return grupos(ctx, o.semana);
}

/* Mueve a una persona de grupo SOLO esa semana (grupo_id vacío = vuelve a su grupo). */
export async function excepcion(ctx, b) {
  exigirAsigna(ctx);
  const semana = String((b && b.semana) || ''); if (!G.fechaOk(semana)) throw err(400, 'La semana no es válida.');
  const sem = G.lunesDe(semana), id = String((b && b.empleado_id) || '').trim(), e = id ? await R.empleado(ctx.db, id) : null; if (!e) throw err(404, 'Elige a la persona.');
  if (!D.esPlanta(e)) throw err(409, nombre(e) + ' es de ' + (e.puesto || e.area || 'oficina') + ': ' + D.MSG_TURNO_SOLO_PLANTA);
  const casa = (await R.grupoMiembros(ctx.db)).find(m => m.empleado_id === id); if (!casa) throw err(409, nombre(e) + ' no está en ningún grupo: primero agrégala a uno.');
  const ts = Date.now(), vuelve = b.grupo_id === null || b.grupo_id === undefined || b.grupo_id === '' || +b.grupo_id === casa.grupo_id;
  if (!vuelve && !G.grupoValido(b.grupo_id)) throw err(400, 'Elige el Grupo 1 o el Grupo 2.');
  await exigirAbierto(ctx, [id], sem, finSemana(sem), (vuelve ? 'devolver a ' : 'mover a ') + nombre(e) + (vuelve ? ' a su grupo' : ' de grupo') + ' la semana del ' + fd(sem));
  if (!vuelve) {
    const asignados = await R.grupoSemanaEntre(ctx.db, sem, sem); if (!asignados.length) throw err(409, 'Primero asigna los grupos de esa semana a Diurno y Nocturno.');
    await R.lote(ctx.db, [R.stExcepcion(ctx.db, sem, id, +b.grupo_id, ctx.rol, ts), R.stVer(ctx.db), ...audit(ctx, sem + ' ' + id, nombre(e), 'movió a ' + nombre(e) + ' al Grupo ' + (+b.grupo_id) + ' solo la semana del ' + sem, {semana: sem, desde_grupo: casa.grupo_id, al_grupo: +b.grupo_id})]);
  } else {
    await R.lote(ctx.db, [R.stExcepcionQuitar(ctx.db, sem, id), ...R.stSnapSemana(ctx.db, sem, ctx.rol, ts), R.stVer(ctx.db), ...audit(ctx, sem + ' ' + id, nombre(e), 'devolvió a ' + nombre(e) + ' a su grupo la semana del ' + sem, {semana: sem, grupo: casa.grupo_id})]);
  }
  return grupos(ctx, sem);
}

/* Fase 5 (bloqueo de arranque): ¿quién trabaja el turno `jornada` el día `fecha`? Primero el grupo que Gerencia/Nómina asignó a ese turno esa semana
   (con la foto de integrantes de la semana, o los actuales si no hay foto). Si no hay grupos armados, las personas activas cuya ficha dice ese turno (turno fijo).
   Devuelve {ok, motivo, grupo_id, nombre, miembros:[{id,nombre}], fijo}. */
export async function personalDeTurno(db, fecha, jornada) {
  const sem = G.lunesDe(fecha), [gs, sn, mi, emps] = await Promise.all([R.grupoSemanaEntre(db, sem, sem), R.grupoSemanaMiembrosEntre(db, sem, sem), R.grupoMiembros(db), R.empleados(db)]);
  const por = new Map(emps.filter(D.activo).map(e => [e.id, e])), fila = gs.find(r => r.turno === jornada);
  if (fila) {
    const ids = sn.filter(x => x.grupo_id === fila.grupo_id).map(x => x.empleado_id);
    const base = ids.length ? ids : mi.filter(m => m.grupo_id === fila.grupo_id).map(m => m.empleado_id);
    const miembros = [...new Set(base)].filter(id => por.has(id)).map(id => ({id, nombre: nombre(por.get(id))}));
    const g = (G.GRUPOS.find(x => x.id === fila.grupo_id) || {}).nombre || 'Grupo ' + fila.grupo_id;
    return miembros.length ? {ok: true, motivo: '', grupo_id: fila.grupo_id, nombre: g, miembros, fijo: false}
      : {ok: false, motivo: 'No hay grupo de turno con personal: Recursos humanos debe armar el grupo.', grupo_id: fila.grupo_id, nombre: g, miembros: [], fijo: false};
  }
  const fijos = [...por.values()].filter(e => e.turno === jornada && D.esPlanta(e)).map(e => ({id: e.id, nombre: nombre(e)}));
  return fijos.length ? {ok: true, motivo: '', grupo_id: null, nombre: 'Turno ' + jornada, miembros: fijos, fijo: true}
    : {ok: false, motivo: 'No hay grupo de turno con personal: Recursos humanos debe armar el grupo.', grupo_id: null, nombre: '', miembros: [], fijo: false};
}
