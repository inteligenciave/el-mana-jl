/* Herencia · pantallas (H7): faltantes (todavía está atrás / fue merma), excesos en espera, Diferencias, carga del camión,
   papa de recepciones validadas y motivos de merma. Comparte el ámbito de p-prod.js. Todo se decide en el servidor. */
Object.assign(PR, {por: null, dif: null, difF: 'PENDIENTE', libres: null, mot: null, rs: null, cz: null, cnt: null, cntTs: 0, cargaSal: null});
const prEtq = {recepcion: 'Recepción', lavado: 'Lavado', fritado: 'Fritado', empacado: 'Empacado'};
const prHoy = () => PR.por && PR.por.diferencias ? PR.por.diferencias : [];

/* ---------- Elegir qué pasó con lo que falta ---------- */
function prResolver(o) { PR.rs = Object.assign({paso: 'elegir', err: ''}, o); prRsPintar(); }
function prRsPintar() {
  const r = PR.rs, m = (r.motivos || []), kg = prN(r.kg, r.kg % 1 ? 1 : 0) + ' ' + (r.unidad || 'kg');
  const fin = `<p class="err" id="pr-e" role="alert" ${r.err ? '' : 'hidden'}>${prT(r.err)}</p>`;
  let cuerpo;
  if (r.paso === 'elegir') cuerpo = `<p class="pr-falta">Falta <b>${kg}</b></p>${r.sub ? `<p class="pr-sub">${prT(r.sub)}</p>` : ''}
    <div class="pr-dos"><button type="button" class="btn pri pr-gran" data-act="prRsAnt">Todavía está en la etapa anterior</button><button type="button" class="btn pr-gran" data-act="prRsMerma">Fue merma</button></div>
    ${r.parcial ? '<button type="button" class="btn sm" data-act="prRsParcial">Es parte de un lote: lo resuelvo después</button>' : ''}`;
  else if (r.paso === 'motivo') cuerpo = `<p>¿Qué pasó con ${kg}?</p><div class="pr-mots">${m.map(x => `<button type="button" class="btn pr-gran" data-act="prRsMot" data-id="${x.id}" data-otra="${x.es_otra ? 1 : 0}">${prT(x.nombre)}</button>`).join('')}</div><button type="button" class="btn sm" data-act="prRsAtras">Atrás</button>`;
  else cuerpo = `<label class="fld">¿Qué fue? (obligatorio)<input type="text" id="pr-otra" maxlength="120" value="${prT(r.texto || '')}"></label><div class="btnrow"><button type="button" class="btn pri" data-act="prRsOtra">Guardar</button><button type="button" class="btn" data-act="prRsAtras">Atrás</button></div>`;
  modal(prT(r.titulo), `<div class="form">${cuerpo}${fin}</div>`);
  const i = $('#pr-otra'); if (i) i.focus();
}
async function prRsEnviar(f, id, tx, parcial) {
  if (PR.busy) return; PR.busy = true;
  try { await PR.rs.fn(f, id, tx, parcial); if (!PR.rs.sigue) closeModal(); }
  catch (er) { PR.rs.err = er.message; if (f !== 'MERMA') PR.rs.paso = 'elegir'; prRsPintar(); }
  finally { PR.busy = false; }
}

/* ---------- Exceso: llegó menos de lo que se quiere usar, queda en espera del Gerente ---------- */
function prExcesoModal(ruta, base, j) {
  PR.ex = {ruta, base};
  modal('Llegó menos de lo que anotas', `<div class="form"><p>${prT(j.error)}</p><p class="pr-sub">Si sigues, queda en espera hasta que el Gerente lo apruebe.</p>
    <label class="fld">Qué pasó<select id="pr-ex-t">${(j.tipos || []).map(t => `<option value="${prT(t.k)}">${prT(t.t)}</option>`).join('')}</select></label>
    <label class="fld">Explica (obligatorio)<input type="text" id="pr-ex-m" maxlength="200"></label>
    <p class="err" id="pr-e" role="alert" hidden></p><div class="btnrow"><button type="button" class="btn pri" data-act="prExOk">Pedir aprobación</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`);
  $('#pr-ex-m').focus();
}
async function prExOk() {
  const e = $('#pr-e'); e.hidden = true; if (PR.busy) return; PR.busy = true;
  try { const r = await prApi('POST', PR.ex.ruta, Object.assign({}, PR.ex.base, {motivo: $('#pr-ex-m').value, tipo: $('#pr-ex-t').value})); closeModal(); toast(esc(r.mensaje || 'Quedó en espera del Jefe.')); prRefrescar('turno', 'proc', 'por', 'cnt'); }
  catch (er) { e.textContent = er.message; e.hidden = false; } finally { PR.busy = false; }
}

/* ---------- Anotar kilos del turno (con faltante) ---------- */
async function prMovimiento(etapa, sentido, kilos) {
  const base = {etapa, sentido, kilos};
  try { await prApi('POST', '/turno/movimiento', base); toast('Anotado.'); prRefrescar('turno', 'proc', 'por'); }
  catch (er) {
    const j = er.datos || {};
    if (er.codigo === 'FALTA_RESOLVER' && j.motivos) prResolver({titulo: 'Falta en ' + (prEtq[etapa] || etapa), kg: j.diferencia_kg, motivos: j.motivos, parcial: true, sub: 'Salieron ' + prKg(j.salieron_kg) + ' y llegan ' + prKg(j.llegan_kg) + '.',
      fn: async (f, id, tx, par) => { const r = await prApi('POST', '/turno/movimiento', Object.assign({}, base, par ? {parcial: true} : {faltante: f, id_motivo: id, texto: tx})); toast(esc(r.mensaje || 'Anotado.')); prRefrescar('turno', 'proc', 'por', 'cnt'); }});
    else if (er.codigo === 'EXCEDE_HEREDADO') prExcesoModal('/turno/movimiento', base, Object.assign({error: er.message}, j));
    else toast(esc(er.message), 'err');
  }
}
async function prEmpaque(id_producto, bultos) {
  const base = {id_producto, bultos};
  try { await prApi('POST', '/turno/empaque', base); toast('Anotado.'); prRefrescar('turno'); }
  catch (er) { if (er.codigo === 'EXCEDE_HEREDADO') prExcesoModal('/turno/empaque', base, Object.assign({error: er.message}, er.datos || {})); else toast(esc(er.message), 'err'); }
}

/* ---------- Faltantes sin resolver (tarjeta del turno) ---------- */
function prPorHTML() {
  const L = prHoy(); if (!L.length) return '';
  return `<div class="pr-por">${L.map(d => `<div class="pr-por-f"><span class="pr-falta">Falta <b>${prKg(d.kilos)}</b> en ${prT(prEtq[d.etapa] || d.etapa)}</span>
    ${prTurnoOk() ? `<span class="btnrow"><button type="button" class="btn pri" data-act="prPorAnt" data-e="${prT(d.etapa)}">Todavía está en la etapa anterior</button><button type="button" class="btn" data-act="prPorMerma" data-e="${prT(d.etapa)}">Fue merma</button></span>` : '<span class="muted">Lo resuelve Producción.</span>'}</div>`).join('')}</div>`;
}
function prPorResolver(etapa, merma) {
  const d = prHoy().find(x => x.etapa === etapa); if (!d) return;
  const fn = async (f, id, tx) => { await prApi('POST', '/turno/resolver-diferencia', {etapa, faltante: f, id_motivo: id, texto: tx}); toast('Listo.'); prRefrescar('turno', 'proc', 'por', 'cnt'); };
  prResolver({titulo: 'Falta en ' + (prEtq[etapa] || etapa), kg: d.kilos, motivos: PR.por.motivos, fn, paso: merma ? 'motivo' : 'elegir'});
}

/* ---------- Cerrar el turno ---------- */
function prCerrarBloqueo() {
  modal('Antes de cerrar el turno', `<div class="form"><p>Hay kilos que faltan. Di qué pasó con cada uno y vuelve a cerrar.</p>${prPorHTML()}<div class="btnrow"><button type="button" class="btn" data-act="closeModal">Entendido</button></div></div>`);
}
async function prCerrarEnviar(cuerpo) {
  const r = await prApi('POST', '/turno/cerrar', cuerpo); closeModal();
  const dif = r.cierre.etapas.filter(x => x.diferencia_kg).map(x => x.nombre + ' ' + prKg(x.diferencia_kg));
  toast('Turno cerrado. Se sumaron ' + prN(r.bultos_sumados) + ' bultos al inventario.' + (dif.length ? ' Diferencias: ' + dif.join(', ') + '.' : '')); prRefrescar('turno', 'proc', 'inv', 'por', 'cnt');
}
function prCzIniciar(base, j) {
  PR.cz = {base, cola: (j.faltan || []).slice(), res: {etapas: {}, transiciones: {}}, mot: {etapas: {}, bultos: {}}, tipos: j.tipos || [], motivos: j.motivos || []};
  prCzSiguiente();
}
function prCzSiguiente() {
  const z = PR.cz, f = z.cola.shift();
  if (!f) { const c = Object.assign({}, z.base, {resoluciones: z.res, motivos: z.mot}); PR.cz = null; prCerrarEnviar(c).catch(er => { toast(esc(er.message), 'err'); prRefrescar('turno', 'por'); }); return; }
  if (f.tipo !== 'bultos' && f.diferencia < 0) {
    const fn = async (fa, id, tx) => { const o = {faltante: fa, id_motivo: id, texto: tx}; (f.tipo === 'transicion' ? z.res.transiciones : z.res.etapas)[f.etapa] = o; setTimeout(prCzSiguiente, 0); };
    prResolver({titulo: 'Falta en ' + f.nombre, kg: -f.diferencia, motivos: z.motivos, fn, sigue: true, sub: f.tipo === 'transicion' ? 'Salieron de ' + f.nombre_anterior + ' y no llegaron.' : 'Al cerrar, esta etapa tiene menos de lo anotado.'});
  } else {
    const sobra = f.diferencia > 0, n = prN(Math.abs(f.diferencia), f.unidad === 'kg' && Math.abs(f.diferencia) % 1 ? 1 : 0) + ' ' + (f.unidad === 'kg' ? 'kg' : 'bultos');
    modal('Explica la diferencia', `<div class="form"><p><b>${prT(f.nombre)}</b>: ${sobra ? 'sobran' : 'faltan'} ${n}.</p>${sobra ? '<p class="pr-sub">Queda en espera hasta que el Jefe lo apruebe.</p>' : ''}
      <label class="fld">Qué pasó<select id="pr-ex-t">${z.tipos.map(t => `<option value="${prT(t.k)}">${prT(t.t)}</option>`).join('')}</select></label><label class="fld">Explica (obligatorio)<input type="text" id="pr-ex-m" maxlength="200"></label>
      <p class="err" id="pr-e" role="alert" hidden></p><div class="btnrow"><button type="button" class="btn pri" data-act="prCzMot">Seguir</button></div></div>`);
    PR.czItem = f; $('#pr-ex-m').focus();
  }
}
function prCzMot() {
  const m = $('#pr-ex-m').value.trim(), e = $('#pr-e'); if (m.length < 3) { e.textContent = 'Escribe qué pasó.'; e.hidden = false; return; }
  const f = PR.czItem, o = {tipo: $('#pr-ex-t').value, motivo: m};
  if (f.tipo === 'bultos') PR.cz.mot.bultos[f.id_producto] = o; else PR.cz.mot.etapas[f.etapa] = o;
  setTimeout(prCzSiguiente, 0);
}

/* ---------- Pantalla Diferencias ---------- */
const prDifEst = {PENDIENTE: 'Por aprobar', APROBADA: 'Aprobada', RECHAZADA: 'Rechazada', AUTOMATICA: 'Automática'};
function scrDif() {
  const dueno = S.rol === 'dueno', f = PR.difF, ruta = '/diferencias' + (f === 'TODAS' ? '' : '?estado=' + f);
  const w = prEspera('Diferencias', 'dif', ruta, 'dif'); if (w) return w;
  const L = Array.isArray(PR.dif) ? PR.dif : [], filtros = [['PENDIENTE', 'Por aprobar'], ['APROBADA', 'Aprobadas'], ['RECHAZADA', 'Rechazadas']].concat(dueno ? [['AUTOMATICA', 'Automáticas'], ['TODAS', 'Todas']] : []);
  const tarj = d => {
    const sobra = d.diferencia > 0, u = d.unidad === 'kg' ? 'kg' : 'bultos', espDueno = d.estado === 'PENDIENTE' && !dueno;
    return `<article class="pr-dif ${d.estado === 'PENDIENTE' ? 'pend' : ''}"><div class="pr-dif-t"><b>${prT(d.etapa_texto)}</b><span class="chip ${d.estado === 'APROBADA' || d.estado === 'AUTOMATICA' ? 'c-ok' : d.estado === 'PENDIENTE' ? 'c-warn' : ''}">${prDifEst[d.estado] || d.estado}</span></div>
      <p>${sobra ? 'Sobran' : 'Faltan'} <b>${prN(Math.abs(d.diferencia), 1)} ${u}</b> · llegó ${prN(d.heredado, 1)}, se usó ${prN(d.usado, 1)} · lo anotó ${prT(d.creado_por)}</p>
      <p class="pr-sub">${prT(d.tipo_texto)}: ${prT(d.motivo)}${d.nota_decision ? ' · Nota: ' + prT(d.nota_decision) : ''}</p>
      ${d.estado === 'PENDIENTE' ? (espDueno ? '<p><span class="chip c-warn">Espera al Gerente</span></p>' : `<div class="btnrow"><button type="button" class="btn pri" data-act="prDifAprobar" data-id="${d.id}">Aprobar</button><button type="button" class="btn" data-act="prDifRechazar" data-id="${d.id}">Rechazar</button></div>`) : ''}</article>`;
  };
  return `${ph('Producción', 'Diferencias', '', '')}<div class="btnrow pr-filtros">${filtros.map(([k, t]) => `<button type="button" class="btn sm ${k === f ? 'pri' : ''}" data-act="prDifFiltro" data-f="${k}" aria-pressed="${k === f}">${t}</button>`).join('')}</div>
    ${L.length ? `<div class="pr-scroll">${L.map(tarj).join('')}</div>` : card('', emptyState('No hay diferencias aquí', f === 'PENDIENTE' ? 'No hay nada por aprobar.' : 'Todavía no hay ninguna.'))}`;
}
function prRechazoModal(id) {
  modal('Rechazar', `<div class="form"><label class="fld">Escribe por qué (obligatorio)<input type="text" id="pr-nota" maxlength="200"></label><p class="err" id="pr-e" role="alert" hidden></p><div class="btnrow"><button type="button" class="btn pri" data-act="prDifRechazarOk" data-id="${id}">Rechazar</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`); $('#pr-nota').focus();
}
async function prDecidir(id, que, nota) {
  if (PR.busy) return; PR.busy = true;
  try { await prApi('POST', '/diferencias/' + id + '/' + que, {nota}); closeModal(); toast(que === 'aprobar' ? 'Aprobada.' : 'Rechazada.'); PR.cntTs = 0; prRefrescar('dif', 'turno', 'por'); }
  catch (er) { const e = $('#pr-e'); if (e && !$('#modal').hidden) { e.textContent = er.message; e.hidden = false; } else toast(esc(er.message), 'err'); } finally { PR.busy = false; }
}

/* ---------- Carga del camión ---------- */
async function prCargaAbrir(id) {
  try {
    const s = await prApi('GET', '/salidas/' + id); PR.cargaSal = s;
    modal('Contar la carga · ' + prT(s.nro), `<div class="form"><p>Escribe cuántos bultos subieron de verdad al camión.</p>${s.lineas.map(l => `<label class="fld">${prT(l.nombre)} · ${prT(l.nro_pedido)} (armados ${prN(l.bultos)})<input type="text" inputmode="numeric" class="pr-cg" data-l="${l.id_linea}" data-b="${l.bultos}" value="${l.bultos}"></label>`).join('')}
      <p class="err" id="pr-e" role="alert" hidden></p><div class="btnrow"><button type="button" class="btn pri" data-act="prCargaOk">Guardar la carga</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`);
  } catch (er) { toast(esc(er.message), 'err'); }
}
function prCargaOk() {
  const e = $('#pr-e'); e.hidden = true; const s = PR.cargaSal; let falta = 0;
  const lineas = [...document.querySelectorAll('.pr-cg')].map(i => { const n = parseInt(String(i.value).replace(/\D/g, ''), 10) || 0; falta += Math.max(0, +i.dataset.b - n); return {id_linea: +i.dataset.l, bultos: n}; });
  const enviar = extra => prApi('POST', '/salidas/' + s.id_salida + '/cargar', Object.assign({lineas}, extra || {}));
  const ok = () => { toast('Carga contada.'); prRefrescar('sals', 'zdata', 'dif'); PR.cntTs = 0; };
  if (PR.busy) return; PR.busy = true;
  enviar().then(() => { closeModal(); ok(); }).catch(er => {
    if (er.codigo === 'FALTA_RESOLVER') { const j = er.datos || {}; prResolver({titulo: 'Faltan bultos en la carga', kg: falta, unidad: 'bultos', motivos: j.motivos || [], sub: 'Lo que no subió queda pendiente en el pedido.', fn: async (f, id, tx) => { await enviar({faltante: f, id_motivo: id, texto: tx}); ok(); }}); }
    else { e.textContent = er.message; e.hidden = false; }
  }).finally(() => { PR.busy = false; });
}
function prCargaCard() {
  if (!(S.rol === 'dueno' || S.rol === 'empaque') || !window.__EM_HTTP) return '';
  if (PR.rol !== S.rol) { PR.rol = S.rol; PR.tab = PR.turno = PR.proc = PR.inv = PR.aj = PR.z = PR.sals = null; }
  if (!PR.sals) { prCargar('sals', '/salidas?estado=ARMANDO', 'sals'); return card('Contar la carga de las salidas', '<p class="hint">Cargando…</p>'); }
  const L0 = Array.isArray(PR.sals) ? PR.sals : [], zf = PR.zonaDesp, L = zf ? L0.filter(s => s.zona === zf) : L0;
  return card(zf ? 'Zona ' + prT(zf) + ': contar la carga' : 'Contar la carga de las salidas', L.length ? `<ul class="pr-lin">${L.map(s => `<li><span><b>${prT(s.nro)}</b> · ${prT(s.zona)} · ${prN(s.bultos)} bultos</span>${s.cargada_ts ? '<span class="chip c-ok">Carga contada</span>' : `<button type="button" class="btn pri sm" data-act="prCargaAbrir" data-id="${s.id_salida}">Contar la carga</button>`}</li>`).join('')}</ul>` : '<p class="muted">' + (zf ? 'No hay salidas armadas por cargar en esta zona.' : 'No hay salidas armadas por cargar.') + '</p>', zf ? {act: '<button type="button" class="btn sm" data-act="emzTodas">Ver todas las zonas</button>'} : {});
}

/* ---------- Papa de recepciones validadas ---------- */
function prRecepcionCard() {
  if (!PR.libres) { prCargar('libres', '/turno/recepciones-libres', 'libres'); return ''; }
  const L = Array.isArray(PR.libres) ? PR.libres : []; if (!L.length) return '';
  return `<div class="pr-mov pr-rec"><select id="pr-rec" aria-label="Recepción validada">${L.map(r => `<option value="${prT(r.id)}">${prT(r.id)} · ${prT(r.prov || '')} · libres ${prN(r.kg_libres)} kg</option>`).join('')}</select><input type="text" inputmode="decimal" id="pr-rec-k" placeholder="Kilos" aria-label="Kilos que toma el turno"><button type="button" class="btn sm" data-act="prRecTomar">Tomar papa</button></div>`;
}

/* ---------- Motivos de merma (Gerente) ---------- */
function scrMotivos() {
  const w = prEspera('Motivos de merma', 'mot', '/motivos-merma?todos=1', 'mot'); if (w) return w;
  const L = Array.isArray(PR.mot) ? PR.mot : [];
  return `${ph('Producción', 'Motivos de merma', '', '')}${card('Opciones que ve Producción al marcar una merma', `<ul class="pr-lin pr-mlist">${L.map(m => `<li>${m.es_otra ? `<b>${prT(m.nombre)}</b><span class="muted">Siempre está: pide escribir qué fue.</span>` : `<input type="text" class="pr-mn" maxlength="40" value="${prT(m.nombre)}" data-act-change="prMotNombre" data-id="${m.id}" aria-label="Nombre del motivo"><button type="button" class="btn sm ${m.activo ? '' : 'pri'}" data-act="prMotActivo" data-id="${m.id}" data-a="${m.activo ? 0 : 1}">${m.activo ? 'Ocultar' : 'Volver a mostrar'}</button>`}</li>`).join('')}</ul>
    <div class="pr-mov"><input type="text" id="pr-mot-n" maxlength="40" placeholder="Nuevo motivo" aria-label="Nuevo motivo"><button type="button" class="btn pri sm" data-act="prMotNuevo">Agregar</button></div>`)}`;
}

/* ---------- Contador de diferencias por aprobar (insignia en el lanzador) ---------- */
const _bad = badges;
badges = function () {
  const b = _bad();
  if (S.rol === 'dueno' && window.__EM_HTTP) {
    if (Date.now() - PR.cntTs > 20000 && !PR.cntBusy) { PR.cntBusy = true; PR.cntTs = Date.now(); prApi('GET', '/diferencias/contador').then(c => { const n = (PR.cnt || {}).pendientes; PR.cnt = c; if (n !== c.pendientes) render(); }).catch(() => {}).finally(() => { PR.cntBusy = false; }); }
    b['pr-dif'] = [(PR.cnt || {}).pendientes || 0, 'w'];
  }
  return b;
};

Object.assign(PERM_DEF, {'pr-dif': 'produccion:1 empaque:1', 'pr-mot': ''});
Object.assign(SCREENS, {
  'pr-dif': {mod: 'prod', g: 'Zonas', t: 'Diferencias', s: 'Diferencias', ic: 'alert', r: scrDif},
  'pr-mot': {mod: 'prod', g: 'Zonas', t: 'Motivos de merma', s: 'Motivos de merma', ic: 'sliders', r: scrMotivos}
});
S.perm = permInit();
const PRACT_H = {prDifAprobar: ['pr-dif', 2], prDifRechazarOk: ['pr-dif', 2], prRecTomar: ['pr-turno', 2], prPorAnt: ['pr-turno', 2], prPorMerma: ['pr-turno', 2], prMotNombre: ['pr-mot', 3], prMotActivo: ['pr-mot', 3], prMotNuevo: ['pr-mot', 3]};
Object.assign(ACT_REQ, PRACT_H); Object.assign(ACT_LBL, {prDifAprobar: 'aprobar diferencias', prDifRechazarOk: 'rechazar diferencias', prRecTomar: 'tomar papa de una recepción', prPorAnt: 'resolver faltantes', prPorMerma: 'resolver faltantes', prMotNombre: 'cambiar los motivos', prMotActivo: 'cambiar los motivos', prMotNuevo: 'cambiar los motivos'});
Object.keys(PRACT_H).forEach(k => WRITE_ACTS.add(k));
Object.assign(ACT, {
  prRsAnt: () => prRsEnviar('ANTERIOR'), prRsMerma: () => { PR.rs.paso = 'motivo'; prRsPintar(); }, prRsAtras: () => { PR.rs.paso = PR.rs.paso === 'otra' ? 'motivo' : 'elegir'; PR.rs.err = ''; prRsPintar(); },
  prRsParcial: () => prRsEnviar(null, null, null, true),
  prRsMot: el => { if (el.dataset.otra === '1') { PR.rs.id = +el.dataset.id; PR.rs.paso = 'otra'; PR.rs.err = ''; prRsPintar(); } else prRsEnviar('MERMA', +el.dataset.id, ''); },
  prRsOtra: () => { const t = ($('#pr-otra').value || '').trim(); if (!t) { PR.rs.err = 'Escribe qué fue.'; prRsPintar(); return; } PR.rs.texto = t; prRsEnviar('MERMA', PR.rs.id, t); },
  prExOk: () => prExOk(), prCzMot: () => prCzMot(),
  prPorAnt: el => prPorResolver(el.dataset.e, false), prPorMerma: el => prPorResolver(el.dataset.e, true),
  prDifFiltro: el => { PR.difF = el.dataset.f; PR.dif = null; render(); },
  prDifAprobar: el => prDecidir(el.dataset.id, 'aprobar', ''), prDifRechazar: el => prRechazoModal(el.dataset.id),
  prDifRechazarOk: el => { const n = ($('#pr-nota').value || '').trim(); if (n.length < 3) { const e = $('#pr-e'); e.textContent = 'Escribe por qué la rechazas.'; e.hidden = false; return; } prDecidir(el.dataset.id, 'rechazar', n); },
  prCargaAbrir: el => prCargaAbrir(+el.dataset.id), prCargaOk: () => prCargaOk(),
  prRecTomar: () => prAccion(async () => { await prApi('POST', '/turno/recepcion', {id_recepcion: $('#pr-rec').value, kilos: $('#pr-rec-k').value.replace(/\./g, '').replace(',', '.')}); PR.libres = null; prRefrescar('turno', 'proc'); }, 'Papa tomada para este turno.'),
  prMotNombre: el => prAccion(async () => { await prApi('POST', '/motivos-merma/' + el.dataset.id, {nombre: el.value}); prRefrescar('mot'); }, 'Guardado.'),
  prMotActivo: el => prAccion(async () => { await prApi('POST', '/motivos-merma/' + el.dataset.id, {activo: el.dataset.a === '1'}); prRefrescar('mot'); }, 'Guardado.'),
  prMotNuevo: () => prAccion(async () => { await prApi('POST', '/motivos-merma', {nombre: $('#pr-mot-n').value}); prRefrescar('mot'); }, 'Motivo agregado.')
});
Object.assign(window, {prApi, prCargaCard});
