/* Turnos (quiénes estuvieron y qué se hizo), parámetros de turnos y bonos, y asistencia automática.
   Todo el cálculo lo hace el servidor (/api/h/turno, /parametros, /bonos, /asistencia); aquí solo se muestra y se pide.
   Usa las funciones de h-planta.js (hpApi, hpN, hpBs, hpHora, hpArea, hpCab). */
const HT = {d: null, cargando: false, ts: 0, rol: null, fecha: '', turno: '', err: '', modo: '', montos: {}, busy: false, k: ''};
const htHoy = () => new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10);
const htHora = ts => ts ? hpHora(ts) : '—';
const htH = n => hpN(n, 2).replace(/,00$/, '');
const htKg = n => hpN(n, 1) + ' kg';
const htReset = () => {
  if (HT.rol !== S.rol) { HT.rol = S.rol; HT.d = null; HT.err = ''; HT.k = ''; HT.modo = ''; HT.montos = {}; }
  if (!HT.fecha) HT.fecha = htHoy();
  if (!HT.turno) HT.turno = (new Date(Date.now() - 4 * 3600e3).getUTCHours() < 12) ? 'Mañana' : 'Tarde';
};
const htEsTurnos = () => S.route === 'turnos' || S.route === 'rh-turnos';
function htCargar(forzar) {
  if (HT.cargando) return; const k = HT.fecha + '|' + HT.turno; HT.cargando = true;
  hpApi('GET', '/turno?fecha=' + HT.fecha + '&turno=' + encodeURIComponent(HT.turno)).then(d => { if (k === HT.fecha + '|' + HT.turno) { HT.d = d; HT.k = k; HT.err = ''; if (!HT.modo || forzar) HT.modo = (d.bono && d.bono.modo_por_defecto) || 'turno'; } })
    .catch(e => { console.error(e); HT.err = e.message; HT.d = null; HT.k = k; })
    .finally(() => { HT.cargando = false; HT.ts = Date.now(); if (htEsTurnos()) { if (HT.fecha + '|' + HT.turno !== k) htCargar(); else render(); } });
}
const htMarcaH = (a, b) => a.horario && a.horario.definido ? esc(a.horario.inicio) + ' a ' + esc(a.horario.fin) + ' · ' + htH(a.horario.horas) + ' h' : 'Sin horario cargado';
function htControles(d) {
  const t = k => `<button type="button" class="btn ${HT.turno === k ? 'pri' : ''}" data-act="htTurno" data-v="${k}" aria-pressed="${HT.turno === k}">${k}</button>`;
  return `<div class="tn-bar"><label class="fld tn-f">Día<input type="date" id="tn-fecha" value="${esc(HT.fecha)}" max="${htHoy()}"></label><div class="hp-seg" role="group" aria-label="Turno">${t('Mañana')}${t('Tarde')}</div>
    <button type="button" class="btn" data-act="htHoy">Hoy</button>${d ? `<span class="chip c-info tn-hor">${htMarcaH(d)}</span>` : ''}
    ${can('rh-params') ? '<a class="btn tn-par" href="#rh-params">Parámetros de turnos y bonos</a>' : ''}</div>`;
}
function htBono(d) {
  const b = d.bono; if (!b) return `<div class="tn-bono">${stat('Kilos del turno', htKg(d.kilos_bono), 'Salen de ' + esc(((d.produccion.kilos_por_etapa || []).find(e => e.etapa === 'empacado') || {}).nombre || 'Empacado'))}</div>`;
  const ap = b.aplicado, sin = b.estado === 'sin_parametros';
  const mt = sin ? '<span class="chip c-warn">Sin parámetros</span>' : b.monto > 0 ? `<b>${hpBs(b.monto)}</b>` : `<span class="muted">${esc(b.texto)}</span>`;
  const tiles = `<div class="tn-t"><span>Kilos (${esc(b.etapa_nombre || '')})</span><b>${htKg(b.kilos)}</b></div><div class="tn-t"><span>Meta del turno</span><b>${b.meta_kg > 0 ? htKg(b.meta_kg) : '—'}</b></div>
    <div class="tn-t"><span>Cumplimiento</span><b>${b.cumplimiento === null ? '—' : hpN(b.cumplimiento, 1) + ' %'}</b></div><div class="tn-t tn-m"><span>Bono calculado</span>${mt}</div>`;
  let acc = '';
  if (ap) acc = `<div class="tn-ap"><span class="chip c-ok">Bono aplicado: ${hpBs(ap.total)} · ${ap.modo === 'turno' ? 'Turno completo' : 'Empleado por empleado'}</span><span class="muted">${esc(ap.quien)}, ${htHora(ap.ts)}</span>${b.puede_deshacer ? '<button type="button" class="btn sm" data-act="htBonoDeshacer">Deshacer</button>' : ''}</div>`;
  else if (b.puede_aplicar && b.monto > 0 && d.personas.length) {
    const bt = (k, t) => `<button type="button" class="btn ${HT.modo === k ? 'pri' : ''}" data-act="htModo" data-v="${k}" aria-pressed="${HT.modo === k}">${t}</button>`;
    acc = `<div class="tn-ap"><div class="hp-seg" role="group" aria-label="Cómo se da el bono">${bt('turno', 'Turno completo')}${bt('persona', 'Empleado por empleado')}</div><button type="button" class="btn pri" data-act="htBonoAplicar" ${HT.busy ? 'disabled' : ''}>Aplicar bono</button>${HT.modo === 'persona' ? `<span class="muted" id="tn-sum">${htSuma(b)}</span>` : ''}</div>`;
  }
  return `<div class="tn-bono">${tiles}${acc}</div>`;
}
const htSuma = b => { const t = Object.values(HT.montos).reduce((a, v) => a + (+v || 0), 0); return 'Asignado ' + hpBs(t) + ' de ' + hpBs(b.monto); };
function htPersonas(d) {
  const b = d.bono, pers = b && !b.aplicado && b.puede_aplicar && b.monto > 0 && HT.modo === 'persona', din = d.ve_dinero, ap = b && b.aplicado;
  const bonoDe = id => ap ? ((ap.filas.find(f => f.empleado_id === id) || {}).monto || 0) : 0;
  const cols = [{h: 'Persona', f: p => `<b>${esc(p.nombre)}</b><br><span class="muted">${esc(p.cargo || '—')}</span>`}, {h: 'Entró y salió', f: p => htHora(p.entrada_ts) + ' a ' + (p.abierta ? '<span class="chip c-ok">En planta</span>' : htHora(p.salida_ts))},
    {h: 'Horas', r: 1, f: p => p.abierta ? '—' : htH(p.horas) + '<br><span class="muted">turno ' + htH(p.horas_turno) + '</span>'}, {h: 'Horas extra', r: 1, f: p => p.abierta ? '—' : p.horas_extra ? `<b>${htH(p.horas_extra)}</b>` + (din ? `<br><span class="muted">${hpBs(p.extra_bs)}</span>` : '') : '—'}];
  if (din) cols.push({h: 'Valor de la hora', r: 1, f: p => p.valor_hora === undefined ? '—' : hpBs(p.valor_hora) + `<br><span class="muted">extra ${hpBs(p.valor_hora_extra)}</span>`});
  if (pers) cols.push({h: 'Bono (Bs)', r: 1, f: p => `<input type="number" class="tn-in" data-bono="${esc(p.empleado_id)}" inputmode="decimal" min="0" step="0.01" value="${HT.montos[p.empleado_id] ?? ''}" aria-label="Bono de ${esc(p.nombre)}">`});
  else if (ap) cols.push({h: 'Bono', r: 1, f: p => bonoDe(p.empleado_id) ? '<b>' + hpBs(bonoDe(p.empleado_id)) + '</b>' : '—'});
  const t = d.totales, nota = d.horario.definido ? '' : `<p class="hp-vacio">Sin horario cargado para este turno: se usa la jornada de ${htH(d.jornada_usada)} horas de la nómina.</p>`;
  return card('Quiénes estuvieron', table(cols, d.personas, {empty: 'Nadie marcó entrada en este turno.', cls: 'tn-tab', foot: d.personas.length ? `<tr class="tsum"><td>${t.personas} ${t.personas === 1 ? 'persona' : 'personas'}</td><td></td><td class="r">${htH(t.horas)}</td><td class="r">${htH(t.horas_extra)}</td>${din ? '<td></td>' : ''}${pers || ap ? '<td></td>' : ''}</tr>` : ''}) + nota, {cls: 'tn-izq'});
}
function htHechos(d) {
  const P = d.produccion, lis = (arr, f, vacio) => arr.length ? `<ul class="tn-ul">${arr.map(f).join('')}</ul>` : `<p class="hp-vacio">${vacio}</p>`;
  const kg = table([{h: 'Etapa', f: e => esc(e.nombre)}, {h: 'Entró', r: 1, f: e => e.entra_kg ? htKg(e.entra_kg) : '—'}, {h: 'Salió', r: 1, f: e => e.sale_kg ? `<b>${htKg(e.sale_kg)}</b>` : '—'}], P.kilos_por_etapa, {});
  const sh = P.sin_hora, shT = [[sh.lotes, 'lotes'], [sh.recepciones, 'recepciones'], [sh.mermas, 'mermas'], [sh.empaque, 'empaques'], [sh.notas_de_entrega, 'notas de entrega']].filter(x => x[0] > 0).map(x => x[0] + ' ' + x[1]).join(', ');
  return card('Lo hecho en el turno', `<div class="tn-sec"><h3>Kilos por etapa</h3>${kg}</div>
    <div class="tn-sec"><h3>Mermas · ${P.mermas.cantidad} (${htKg(P.mermas.total_kg)})</h3>${lis(P.mermas.items, m => `<li><span>${esc(m.prod || m.etapa)} · ${hpN(m.cant, 1)} ${esc(m.un)}${m.causa ? ' · ' + esc(m.causa) : ''}</span><time>${esc(m.hora)}</time></li>`, 'Sin mermas')}</div>
    <div class="tn-sec"><h3>Lotes abiertos · ${P.lotes_abiertos.length}</h3>${lis(P.lotes_abiertos, l => `<li><span><b>${esc(l.id)}</b> · ${htKg(l.cruda_kg)} · ${esc(l.quien)}</span><time>${esc(l.hora)}</time></li>`, 'Ninguno')}</div>
    <div class="tn-sec"><h3>Lotes cerrados · ${P.lotes_cerrados.length}</h3>${lis(P.lotes_cerrados, l => `<li><span><b>${esc(l.id)}</b> · ${htKg(l.granel_kg)} a granel · ${esc(l.quien)}</span><time>${esc(l.hora)}</time></li>`, 'Ninguno')}</div>
    <div class="tn-sec"><h3>Recepciones · ${P.recepciones.length}</h3>${lis(P.recepciones, r => `<li><span><b>${esc(r.id)}</b> · ${esc(r.item)} · ${htKg(r.kg)}${r.quien ? ' · ' + esc(r.quien) : ''}</span><time>${esc(r.hora)}</time></li>`, 'Ninguna')}</div>
    <div class="tn-sec"><h3>Empaque · ${P.empaques.length}</h3>${lis(P.empaques, e => `<li><span>${esc(e.pres)} · ${e.bultos ? e.bultos + (e.bultos === 1 ? ' bulto' : ' bultos') : hpN(e.und, 0) + ' und'}${e.quien ? ' · ' + esc(e.quien) : ''}</span><time>${esc(e.hora)}</time></li>`, 'Nada empacado')}</div>
    <div class="tn-sec"><h3>Despachos · ${P.despachos.length}</h3>${lis(P.despachos, s => `<li><span><b>${esc(s.nro)}</b> · ${htKg(s.kilos)} · ${esc(s.quien)}</span><time>${esc(s.hora)}</time></li>`, 'Ninguno')}</div>
    ${shT ? `<p class="tn-sh"><b>Sin hora anotada</b> (no se asignan a un turno): ${shT}.</p>` : ''}`, {cls: 'tn-der'});
}
function scrTurnos() {
  htReset();
  if (!window.__EM_HTTP) return card('', emptyState('Este módulo necesita el servidor', 'Funciona en la versión con base de datos (Cloudflare).'));
  const k = HT.fecha + '|' + HT.turno, nuevo = HT.k !== k;
  if (nuevo || (!HT.cargando && Date.now() - HT.ts > 5000)) { if (nuevo) HT.d = null; htCargar(nuevo); }
  const d = HT.d, envoltura = h => (S.route === 'rh-turnos' && hpTabsOn() ? h : '<div class="tn-panel">' + h + '</div>');
  if (!d) return htControles(null) + (HT.err ? `<p class="err" role="alert">${esc(HT.err)}</p>` : '') + (HT.cargando || nuevo ? card('', emptyState('Cargando…', 'Un momento.')) : '');
  const aviso = d.horario_partido_al_mediodia ? '<p class="hp-vacio">Los horarios no están cargados: lo hecho se reparte hasta las 12:00 (Mañana) y desde las 12:00 (Tarde).</p>' : '';
  return htControles(d) + (HT.err ? `<p class="err" role="alert">${esc(HT.err)}</p>` : '') + envoltura(htBono(d) + aviso + `<div class="tn-grid">${htPersonas(d)}${htHechos(d)}</div>`);
}
async function htBonoAplicar() {
  const d = HT.d, b = d && d.bono; if (!b || HT.busy) return; HT.busy = true; HT.err = '';
  try { const r = await hpApi('POST', '/bonos', {fecha: HT.fecha, turno: HT.turno, modo: HT.modo, montos: HT.modo === 'persona' ? HT.montos : undefined}); HT.d = r; HT.montos = {}; HP.nomClave = ''; HP.resTs = 0; toast('Bono aplicado: ' + hpBs(r.bono.aplicado.total) + '.'); }
  catch (e) { HT.err = e.message; toast(esc(e.message), 'err'); }
  finally { HT.busy = false; render(); }
}
async function htBonoDeshacer() {
  if (HT.busy) return; HT.busy = true; HT.err = '';
  try { HT.d = await hpApi('POST', '/bonos/deshacer', {fecha: HT.fecha, turno: HT.turno}); HT.montos = {}; HP.nomClave = ''; HP.resTs = 0; toast('Bono deshecho.'); }
  catch (e) { HT.err = e.message; toast(esc(e.message), 'err'); }
  finally { HT.busy = false; render(); }
}

/* ---------- Parámetros de turnos y bonos ---------- */
const HR = {p: null, F: null, cargando: false, ts: 0, rol: null, err: '', ok: '', busy: false};
function hrDe(p) { return {horarios: JSON.parse(JSON.stringify(p.horarios)), bono: JSON.parse(JSON.stringify(p.bono)), pagos: {...p.pagos}}; }
function hrCargar() {
  if (HR.cargando) return; HR.cargando = true;
  hpApi('GET', '/parametros').then(p => { HR.p = p; if (!HR.F) HR.F = hrDe(p); HR.err = ''; }).catch(e => { console.error(e); HR.err = e.message; })
    .finally(() => { HR.cargando = false; HR.ts = Date.now(); if (S.route === 'rh-params') render(); });
}
function hrLeer() {
  if (!HR.F || !document.getElementById('pm-jor')) return; const g = k => (document.getElementById(k) || {}).value || '', F = HR.F;
  F.horarios['Mañana'] = {inicio: g('pm-hm-i'), fin: g('pm-hm-f')}; F.horarios['Tarde'] = {inicio: g('pm-ht-i'), fin: g('pm-ht-f')};
  F.pagos = {nomJornada: g('pm-jor'), nomRecargo: g('pm-rec'), nomLey: g('pm-ley')};
  F.bono = {...F.bono, tipo: g('pm-tipo'), valor: g('pm-val'), meta_kg: g('pm-meta'), minimo_kg: g('pm-min'), etapa: g('pm-etapa'), reparto: g('pm-rep'), tramos: F.bono.tramos.map((t, i) => ({desde: g('pm-td-' + i), pct: g('pm-tp-' + i)}))};
}
function scrParams() {
  if (!window.__EM_HTTP) return card('', emptyState('Este módulo necesita el servidor', 'Funciona en la versión con base de datos (Cloudflare).'));
  if (HR.rol !== S.rol) { HR.rol = S.rol; HR.p = null; HR.F = null; HR.err = ''; HR.ok = ''; }
  if (!HR.p) { hrCargar(); return card('', HR.err ? emptyState('No se pudo cargar', esc(HR.err)) : emptyState('Cargando…', 'Un momento.')); }
  if (!HR.cargando && !HR.F) HR.F = hrDe(HR.p);
  const p = HR.p, F = HR.F, ed = p.puede_editar, dis = ed ? '' : 'disabled';
  const num = (id, l, v, st, mx) => `<label class="fld">${l}<input type="number" id="${id}" inputmode="decimal" min="0" ${mx ? 'max="' + mx + '"' : ''} step="${st}" value="${esc(v ?? '')}" ${dis}></label>`;
  const hrHM = v => { const m = /^(\d{1,2}):(\d{2})$/.exec(v || ''); return m ? +m[1] * 60 + +m[2] : null; };
  const hrTxt = v => { const m = hrHM(v); if (m === null) return ''; const h = Math.floor(m / 60), mi = m % 60; return (h % 12 || 12) + ':' + String(mi).padStart(2, '0') + (h < 12 ? ' a.m.' : ' p.m.'); };
  const hrOps = (v, vacio, desde) => { const l = ['<option value=""' + (v ? '' : ' selected') + '>' + vacio + '</option>']; let hay = !v; for (let m = 0; m < 1440; m += 30) { if (desde !== undefined && desde !== null && m <= desde && String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0') !== v) continue; const x = String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); if (x === v) hay = true; l.push(`<option value="${x}" ${x === v ? 'selected' : ''}>${hrTxt(x)}</option>`); } if (!hay && hrHM(v) !== null) l.push(`<option value="${esc(v)}" selected>${hrTxt(v)}</option>`); return l.join(''); };
  const HR_PRE = {'Mañana': [['06:00', '14:00'], ['07:00', '15:00'], ['08:00', '16:00']], 'Tarde': [['14:00', '22:00'], ['15:00', '23:00'], ['12:00', '20:00']]};
  const hor = t => {
    const k = t === 'Mañana' ? 'm' : 't', h = F.horarios[t], a = hrHM(h.inicio), b = hrHM(h.fin);
    const pre = HR_PRE[t].map(([i, f]) => `<button type="button" class="btn tn-pre${h.inicio === i && h.fin === f ? ' on acc' : ' ghost'}" data-act="hrPreset" data-t="${t}" data-i="${i}" data-f="${f}" aria-pressed="${h.inicio === i && h.fin === f}" ${dis}>${hrTxt(i)} a ${hrTxt(f)}</button>`).join('');
    let res;
    if (a !== null && b !== null && b > a) { const d = b - a; res = `<b>${Math.floor(d / 60)} horas${d % 60 ? ' y ' + (d % 60) + ' minutos' : ''}</b> de trabajo`; }
    else if (a !== null && b !== null) res = '<span class="tn-av">La hora de salida debe ser después de la de entrada. El turno no puede pasar de medianoche.</span>';
    else if (a === null && b === null) res = `Sin horario: se cuenta una jornada de ${htH(+F.pagos.nomJornada || 8)} horas`;
    else res = '<span class="tn-av">Falta elegir la hora de ' + (a === null ? 'entrada' : 'salida') + '.</span>';
    return `<div class="tn-hr"><b class="tn-ht">Turno ${t === 'Mañana' ? 'de la mañana' : 'de la tarde'}</b><div class="tn-pres">${pre}</div><div class="tn-sel"><label class="fld">Entra<select id="pm-h${k}-i" ${dis}>${hrOps(h.inicio, 'Elegir hora')}</select></label><label class="fld">Sale<select id="pm-h${k}-f" ${dis}>${hrOps(h.fin, 'Elegir hora', a)}</select></label></div><p class="tn-res">${res}</p></div>`;
  };
  const sel = (id, v, ops) => `<select id="${id}" ${dis}>${ops.map(([k, t]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  const tr = F.bono.tramos.map((t, i) => `<div class="tn-tr"><label class="fld">Cumplimiento desde (%)<input type="number" id="pm-td-${i}" min="0" max="300" step="1" value="${esc(t.desde ?? '')}" ${dis}></label><label class="fld">Paga (% del bono)<input type="number" id="pm-tp-${i}" min="0" max="300" step="1" value="${esc(t.pct ?? '')}" ${dis}></label>${ed ? `<button type="button" class="btn sm" data-act="hrQuitar" data-i="${i}">Quitar</button>` : ''}</div>`).join('');
  const pedir = ed ? '' : `<div class="btnrow tn-ped"><p class="hint">${ic('lock', 16)} Solo Gerencia cambia estos parámetros.</p>${typeof solBtn === 'function' ? solBtn('Una regla de pago de nómina') : ''}</div>`;
  return `${HR.err ? `<p class="err" role="alert">${esc(HR.err)}</p>` : ''}${HR.ok ? `<p class="hint">${esc(HR.ok)}</p>` : ''}
  <div class="tn-panel"><div class="tn-pgrid">
    ${card('Horario por turno', `${ed ? '<p class="hint">Toca un horario típico o elige las horas en las listas.</p>' : ''}<div class="form">${hor('Mañana')}${hor('Tarde')}</div>`)}
    ${card('Reglas de pago de nómina', `<div class="form row3">${num('pm-jor', 'Jornada completa (horas)', F.pagos.nomJornada, 0.5, 24)}${num('pm-rec', 'Recargo de hora extra (%)', F.pagos.nomRecargo, 1)}${num('pm-ley', 'Deducciones de ley (%)', F.pagos.nomLey, 0.1, 100)}</div>`)}
    ${card('Bono de producción', `<div class="form"><div class="row3"><label class="fld">Se paga${sel('pm-tipo', F.bono.tipo, [['por_kilo', 'Por kilo'], ['fijo', 'Monto fijo']])}</label>${num('pm-val', F.bono.tipo === 'fijo' ? 'Monto (Bs)' : 'Valor por kilo (Bs)', F.bono.valor, 0.01)}<label class="fld">Kilos que cuentan${sel('pm-etapa', F.bono.etapa, p.etapas.map(e => [e.k, e.t]))}</label></div>
      <div class="row3">${num('pm-meta', 'Meta de kilos por turno', F.bono.meta_kg, 1)}${num('pm-min', 'Mínimo de kilos para ganar el bono', F.bono.minimo_kg, 1)}<label class="fld">Reparto habitual${sel('pm-rep', F.bono.reparto, [['turno', 'Turno completo'], ['persona', 'Empleado por empleado']])}</label></div>
      <div class="tn-trs"><b>Escalones de cumplimiento</b>${tr || '<p class="hp-vacio">Sin escalones: el bono completo se gana al llegar a la meta.</p>'}${ed && F.bono.tramos.length < 8 ? '<button type="button" class="btn sm" data-act="hrAgregar">Agregar escalón</button>' : ''}</div></div>`)}
    <div class="tn-pie">${ed ? `<button type="button" class="btn pri" data-act="hrGuardar" ${HR.busy ? 'disabled' : ''}>Guardar parámetros</button>` : ''}${pedir}</div>
  </div></div>`;
}
async function hrGuardar() {
  if (HR.busy) return; hrLeer(); HR.busy = true; HR.err = ''; HR.ok = '';
  try { HR.p = await hpApi('PUT', '/parametros', HR.F); HR.F = hrDe(HR.p); HR.ok = 'Parámetros guardados.'; toast('Parámetros guardados.'); HP.nomClave = ''; HT.k = ''; }
  catch (e) { HR.err = e.message; toast(esc(e.message), 'err'); }
  finally { HR.busy = false; render(); }
}

/* ---------- Asistencia: se llena sola con las marcas (se sincroniza al entrar) ---------- */
const HA = {q: '', ts: 0, busy: false};
function haSync() {
  const q = S.nomQ; if (!window.__EM_HTTP || !q || HA.busy || (HA.q === q && Date.now() - HA.ts < 15000)) return; HA.busy = true; HA.q = q;
  hpApi('GET', '/asistencia?q=' + q).then(() => { HA.ts = Date.now(); }).catch(e => { console.error(e); HA.ts = Date.now(); }).finally(() => { HA.busy = false; });
}

/* ---------- Registro en el sistema ---------- */
{ const i = HP_TABS.findIndex(t => t[0] === 'rh-planta'); HP_TABS.splice(i + 1, 0, ['rh-turnos', 'Turnos']); HP_TABS.push(['rh-params', 'Parámetros']); }
Object.assign(PERM_DEF, {turnos: 'jefeprod:1', 'rh-turnos': 'rrhh:1 adm:2', 'rh-params': 'rrhh:1 adm:1'});
Object.assign(SCREENS, {
  turnos: {mod: 'prod', g: 'Planta', t: 'Turnos', s: 'Turnos', ic: 'calendar', r: scrTurnos},
  'rh-turnos': {mod: 'adm', g: 'En planta', t: 'Turnos', s: 'Turnos', ic: 'calendar', r: scrTurnos},
  'rh-params': {mod: 'adm', g: 'En planta', t: 'Parámetros de turnos y bonos', s: 'Parámetros', ic: 'sliders', r: scrParams}
});
{ const sc = SCREENS.asistencia; if (sc) { const f = sc.r; sc.r = function () { haSync(); return f.apply(this, arguments); }; } }
S.perm = permInit();
Object.assign(ACT_REQ, {htBonoAplicar: ['rh-turnos', 2], htBonoDeshacer: ['rh-turnos', 3], hrGuardar: ['rh-params', 3]});
Object.assign(ACT_LBL, {htBonoAplicar: 'aplicar bonos de producción', htBonoDeshacer: 'deshacer bonos de producción', hrGuardar: 'cambiar los parámetros de turnos y bonos'});
['htBonoAplicar', 'htBonoDeshacer', 'hrGuardar'].forEach(k => WRITE_ACTS.add(k));
Object.assign(ACT, {
  htTurno: el => { HT.turno = el.dataset.v; HT.modo = ''; HT.montos = {}; HT.err = ''; render(); }, htHoy: () => { HT.fecha = htHoy(); HT.modo = ''; HT.montos = {}; HT.err = ''; render(); },
  htModo: el => { HT.modo = el.dataset.v; const b = HT.d && HT.d.bono; HT.montos = {}; if (HT.modo === 'persona' && b) HT.d.personas.forEach((p, i) => { HT.montos[p.empleado_id] = b.reparto_sugerido[i]; }); render(); },
  htBonoAplicar: () => htBonoAplicar(), htBonoDeshacer: () => htBonoDeshacer(), hrGuardar: () => hrGuardar(),
  hrPreset: el => { hrLeer(); HR.F.horarios[el.dataset.t] = {inicio: el.dataset.i, fin: el.dataset.f}; render(); },
  hrAgregar: () => { hrLeer(); HR.F.bono.tramos.push({desde: '', pct: ''}); render(); }, hrQuitar: el => { hrLeer(); HR.F.bono.tramos.splice(+el.dataset.i, 1); render(); }
});
if (!window.__htListeners) {
  window.__htListeners = true;
  document.addEventListener('change', e => { const t = e.target; if (t && /^pm-h[mt]-[if]$/.test(t.id || '')) { hrLeer(); render(); return; } if (t && t.id === 'tn-fecha' && /^\d{4}-\d{2}-\d{2}$/.test(t.value)) { HT.fecha = t.value; HT.modo = ''; HT.montos = {}; HT.err = ''; render(); } });
  document.addEventListener('input', e => {
    const t = e.target; if (!t || !t.dataset || t.dataset.bono === undefined) return;
    HT.montos[t.dataset.bono] = t.value; const s = document.getElementById('tn-sum'); if (s && HT.d && HT.d.bono) s.textContent = htSuma(HT.d.bono);
  });
  /* En pantallas angostas el panel se ajusta al alto libre para que la página no tenga scroll */
  let htFit = 0;
  const htAjustar = () => { htFit = 0; document.querySelectorAll('.tn-tab').forEach(tb => { const hs = [...tb.querySelectorAll('thead th')].map(h => h.textContent.trim()); tb.querySelectorAll('tr').forEach(tr => [...tr.children].forEach((td, i) => { if (td.tagName === 'TD' && i > 0 && hs[i] && td.dataset.l !== hs[i] && !tr.classList.contains('tsum')) td.dataset.l = hs[i]; else if (td.tagName === 'TD' && tr.classList.contains('tsum') && hs[i] && i > 0) td.dataset.l = hs[i]; })); }); document.querySelectorAll('.tn-panel').forEach(p => { if (window.innerWidth > 900 || p.closest('.rh-panel')) { p.style.maxHeight = ''; return; } const mn = document.querySelector('main'), r = p.getBoundingClientRect(), ex = mn ? Math.max(0, mn.getBoundingClientRect().bottom - r.bottom) : 0, lim = window.innerHeight - r.top - ex - 2; p.style.maxHeight = Math.max(160, Math.floor(lim)) + 'px'; p.style.overflow = 'auto'; }); };
  new MutationObserver(() => { if (!htFit) htFit = requestAnimationFrame(htAjustar); }).observe(document.body, {childList: true, subtree: true});
  window.addEventListener('resize', htAjustar);
  setInterval(() => { const m = document.getElementById('modal'); if (htEsTurnos() && HT.d && !HT.cargando && !HT.busy && !document.hidden && !(m && !m.hidden) && !document.activeElement.classList.contains('tn-in')) htCargar(); }, 30000);
}
