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
  if (!HT.turno) HT.turno = (new Date(Date.now() - 4 * 3600e3).getUTCHours() >= 5 && new Date(Date.now() - 4 * 3600e3).getUTCHours() < 17) ? 'Diurno' : 'Nocturno';
};
const htEsTurnos = () => S.route === 'turnos' || S.route === 'rh-turnos';
function htCargar(forzar) {
  if (HT.cargando) return; const k = HT.fecha + '|' + HT.turno; HT.cargando = true;
  hpApi('GET', '/turno?fecha=' + HT.fecha + '&turno=' + encodeURIComponent(HT.turno)).then(d => { if (k === HT.fecha + '|' + HT.turno) { HT.d = d; HT.k = k; HT.err = ''; if (!HT.modo || forzar) HT.modo = (d.bono && d.bono.modo_por_defecto) || 'turno'; } })
    .catch(e => { console.error(e); HT.err = e.message; HT.d = null; HT.k = k; })
    .finally(() => { HT.cargando = false; HT.ts = Date.now(); if (htEsTurnos()) { if (HT.fecha + '|' + HT.turno !== k) htCargar(); else render(); } });
}
const htMarcaH = (a, b) => a.horario && a.horario.definido ? esc(a.horario.inicio) + ' a ' + esc(a.horario.fin) + (a.horario.cruza ? ' (del día siguiente)' : '') + ' · ' + htH(a.horario.horas) + ' h' : 'Sin horario cargado';
function htControles(d) {
  const t = k => `<button type="button" class="btn ${HT.turno === k ? 'pri' : ''}" data-act="htTurno" data-v="${k}" aria-pressed="${HT.turno === k}">${k}</button>`;
  return `<div class="tn-bar"><label class="fld tn-f">Día<input type="date" id="tn-fecha" value="${esc(HT.fecha)}" max="${htHoy()}"></label><div class="hp-seg" role="group" aria-label="Turno">${t('Diurno')}${t('Nocturno')}</div>
    <button type="button" class="btn" data-act="htHoy">Hoy</button>${d ? `<span class="chip c-info tn-hor">${htMarcaH(d)}</span>` : ''}
    ${window.pantVe && window.pantVe(S.rol, 'rh-params') ? '<a class="btn tn-par" href="#rh-params">Horarios y reglas de pago</a>' : ''}</div>`;
}
function htBono(d) {
  const kg = ((d.produccion.kilos_por_etapa || []).find(e => e.etapa === 'empacado') || {}).entra_kg || 0;
  return `<div class="tn-bono">${stat('Kilos a Empaque', htKg(kg), 'Producto terminado que llegó a empaque')}${can('rh-bonos') ? '<a class="btn tn-par" href="#rh-bonos">Ver bonos de este turno</a>' : ''}</div>`;
}
function htPersonas(d) {
  const din = d.ve_dinero;
  const cols = [{h: 'Persona', f: p => `<b>${esc(p.nombre)}</b><br><span class="muted">${esc(p.cargo || '—')}</span>`}, {h: 'Entró y salió', f: p => htHora(p.entrada_ts) + ' a ' + (p.abierta ? '<span class="chip c-ok">En planta</span>' : htHora(p.salida_ts))},
    {h: 'Horas', r: 1, f: p => p.abierta ? '—' : htH(p.horas) + '<br><span class="muted">turno ' + htH(p.horas_turno) + '</span>'}, {h: 'Horas extra', r: 1, f: p => p.abierta ? '—' : p.horas_extra ? `<b>${htH(p.horas_extra)}</b>` + (din ? `<br><span class="muted">${hpUsd(p.extra_usd)}</span>` : '') : '—'}];
  if (din) cols.push({h: 'Valor de la hora', r: 1, f: p => p.valor_hora === undefined ? '—' : hpUsd(p.valor_hora) + `<br><span class="muted">extra ${hpUsd(p.valor_hora_extra)}</span>`});
  const t = d.totales, nota = d.horario.definido ? '' : `<p class="hp-vacio">Sin horario cargado para este turno: se usa la jornada de ${htH(d.jornada_usada)} horas de la nómina.</p>`;
  return card('Quiénes estuvieron', table(cols, d.personas, {empty: 'Nadie marcó entrada en este turno.', cls: 'tn-tab', foot: d.personas.length ? `<tr class="tsum"><td>${t.personas} ${t.personas === 1 ? 'persona' : 'personas'}</td><td></td><td class="r">${htH(t.horas)}</td><td class="r">${htH(t.horas_extra)}</td>${din ? '<td></td>' : ''}</tr>` : ''}) + nota, {cls: 'tn-izq'});
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
  const aviso = d.horario_partido_al_mediodia ? '<p class="hp-vacio">Los horarios no están cargados: lo hecho se reparte hasta las 12:00 (Diurno) y desde las 12:00 (Nocturno).</p>' : '';
  return htControles(d) + (HT.err ? `<p class="err" role="alert">${esc(HT.err)}</p>` : '') + envoltura(htBono(d) + aviso + `<div class="tn-grid">${htPersonas(d)}${htHechos(d)}</div>`);
}
/* ---------- Horarios y reglas de pago ---------- */
const HR = {p: null, F: null, cargando: false, ts: 0, rol: null, err: '', ok: '', busy: false};
function hrDe(p) { return {horarios: JSON.parse(JSON.stringify(p.horarios)), bono: JSON.parse(JSON.stringify(p.bono)), pagos: {...p.pagos}, desde: p.desde_minima || p.hoy || ''}; }
function hrCargar() {
  if (HR.cargando) return; HR.cargando = true;
  hpApi('GET', '/parametros').then(p => { HR.p = p; if (!HR.F) HR.F = hrDe(p); HR.err = ''; }).catch(e => { console.error(e); HR.err = e.message; })
    .finally(() => { HR.cargando = false; HR.ts = Date.now(); if (S.route === 'rh-params' || S.route === 'rh-grupos') render(); else if (S.route === 'personal') document.querySelectorAll('#pf-turno option[value]').forEach(o => { o.textContent = window.hrTurnoEtiqueta(o.value); }); });
}
function hrLeer() {
  if (!HR.F) return; const g = k => (document.getElementById(k) || {}).value || '', F = HR.F;
  if (document.getElementById('pm-hd-i')) { F.horarios['Diurno'] = {inicio: g('pm-hd-i'), fin: g('pm-hd-f')}; F.horarios['Nocturno'] = {inicio: g('pm-hn-i'), fin: g('pm-hn-f')}; }
  if (document.getElementById('pm-jor')) F.pagos = {nomJornada: g('pm-jor'), nomRecargo: g('pm-rec'), nomLey: g('pm-ley')};
  if (document.getElementById('pm-desde')) F.desde = g('pm-desde');
}
/* Desde cuándo vale el cambio, huecos sin turno y cambios ya programados */
const hrFechaTxt = f => (typeof hpFecha === 'function' ? hpFecha(f) : f);
const hrHorTxt = h => ['Diurno', 'Nocturno'].map(t => `${t} ${esc((h[t] || {}).inicio || '—')} a ${esc((h[t] || {}).fin || '—')}`).join(' · ');
function hrExtra(p, F, edH, disH) {
  const hz = (p.huecos || []).map(x => `${esc(x.desde)} a ${esc(x.hasta)}`).join(' y '), cerrado = p.ultimo_cierre && !p.puede_editar && p.desde_minima > p.hoy;
  const desde = edH ? `<label class="fld tn-desde">El cambio empieza el<input type="date" id="pm-desde" min="${esc(p.desde_minima || p.hoy || '')}" value="${esc(F.desde || p.desde_minima || '')}" ${disH}></label>
    <p class="hint">${cerrado ? ic('lock', 14) + ' Ya hay pagos de nómina o bonos aplicados hasta el ' + hrFechaTxt(p.ultimo_cierre) + ': lo ya pagado no se cambia, por eso el horario nuevo solo puede empezar desde el ' + hrFechaTxt(p.desde_minima) + '. Si de verdad hay que corregir lo pagado, pide autorización a Gerencia. ' + (typeof solBtn === 'function' ? solBtn('Corregir algo ya pagado o con bono aplicado', '', 'rh-params') : '') : 'Por defecto empieza hoy. Los días anteriores se quedan con el horario que tenían.'}</p>` : '';
  const prox = (p.proximos || []).length ? `<div class="tn-prox"><b>Cambios ya programados</b><ul>${p.proximos.map(x => `<li>Desde el ${hrFechaTxt(x.desde)}: ${hrHorTxt(x.horarios)}</li>`).join('')}</ul><span class="muted">Para cancelarlo, guarda otra vez el horario que quieres con la fecha de hoy.</span></div>` : '';
  return `${desde}<p class="hint">${hz ? 'Sin turno de ' + hz + ': las marcas de esas horas quedan «por revisar» en Nómina.' : 'Los dos turnos se tocan sin horas vacías entre ellos.'}</p>${prox}`;
}
/* Gerencia: avisos de cambios de horario hechos por Nómina */
function hrAvisos(p) {
  if (!p.avisos || !p.avisos.length) return '';
  const nuevos = p.avisos.filter(a => !a.visto), fecha = ts => new Date(ts - 4 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
  const fila = a => `<li class="${a.visto ? '' : 'on'}"><span>${a.visto ? '' : '<b class="chip c-warn">Nuevo</b> '}${esc(a.resumen)} <span class="muted">(${fecha(a.creado_ts)})</span></span>${a.visto ? '' : `<button type="button" class="btn sm" data-act="hrAvisoVisto" data-id="${a.id}">Visto</button>`}</li>`;
  return card('Aviso: Nómina cambió horarios de turno' + (nuevos.length ? ' (' + nuevos.length + ' por ver)' : ''), `<ul class="tn-avisos">${p.avisos.slice(0, 8).map(fila).join('')}</ul>${nuevos.length > 1 ? '<div class="btnrow"><button type="button" class="btn sm" data-act="hrAvisoVisto" data-id="">Marcar todos como vistos</button></div>' : ''}`, {sub: 'Cada cambio también quedó en Auditoría con el valor anterior y el nuevo.'});
}
/* Tarjeta «Horario por turno» (presets, horas, desde cuándo vale): la usan Gerencia › Ajustes y, para Recursos humanos, «Grupos y turnos» */
function hrHorarioCard(p, F, titulo) {
  const edH = p.puede_editar_horarios, disH = edH ? '' : 'disabled';
  const hrHM = v => { const m = /^(\d{1,2}):(\d{2})$/.exec(v || ''); return m ? +m[1] * 60 + +m[2] : null; };
  const hrTxt = v => { const m = hrHM(v); if (m === null) return ''; const h = Math.floor(m / 60), mi = m % 60; return (h % 12 || 12) + ':' + String(mi).padStart(2, '0') + (h < 12 ? ' a.m.' : ' p.m.'); };
  const hrOps = (v, vacio, desde) => { const l = ['<option value=""' + (v ? '' : ' selected') + '>' + vacio + '</option>']; let hay = !v; for (let m = 0; m < 1440; m += 30) { if (desde !== undefined && desde !== null && m <= desde && String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0') !== v) continue; const x = String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); if (x === v) hay = true; l.push(`<option value="${x}" ${x === v ? 'selected' : ''}>${hrTxt(x)}</option>`); } if (!hay && hrHM(v) !== null) l.push(`<option value="${esc(v)}" selected>${hrTxt(v)}</option>`); return l.join(''); };
  const HR_PRE = {Diurno: [['07:00', '17:00'], ['06:00', '16:00'], ['08:00', '17:00']], Nocturno: [['18:00', '05:00'], ['19:00', '06:00'], ['20:00', '05:00']]};
  const hor = t => {
    const k = t === 'Diurno' ? 'd' : 'n', h = F.horarios[t], a = hrHM(h.inicio), b = hrHM(h.fin);
    const pre = HR_PRE[t].map(([i, f]) => `<button type="button" class="btn tn-pre${h.inicio === i && h.fin === f ? ' on acc' : ' ghost'}" data-act="hrPreset" data-t="${t}" data-i="${i}" data-f="${f}" aria-pressed="${h.inicio === i && h.fin === f}" ${disH}>${hrTxt(i)} a ${hrTxt(f)}</button>`).join('');
    let res;
    if (a !== null && b !== null && b !== a) { const d = b > a ? b - a : b + 1440 - a; res = `<b>${Math.floor(d / 60)} horas${d % 60 ? ' y ' + (d % 60) + ' minutos' : ''}</b> de trabajo${b < a ? ' (termina al día siguiente)' : ''}`; }
    else if (a !== null && b !== null) res = '<span class="tn-av">La hora de salida debe ser distinta de la de entrada.</span>';
    else if (a === null && b === null) res = `Sin horario: se cuenta una jornada de ${htH(+F.pagos.nomJornada || 8)} horas`;
    else res = '<span class="tn-av">Falta elegir la hora de ' + (a === null ? 'entrada' : 'salida') + '.</span>';
    return `<div class="tn-hr"><b class="tn-ht">Turno ${t === 'Diurno' ? 'diurno' : 'nocturno'}</b><div class="tn-pres">${pre}</div><div class="tn-sel"><label class="fld">Entra<select id="pm-h${k}-i" ${disH}>${hrOps(h.inicio, 'Elegir hora')}</select></label><label class="fld">Sale<select id="pm-h${k}-f" ${disH}>${hrOps(h.fin, 'Elegir hora')}</select></label></div><p class="tn-res">${res}</p></div>`;
  };
  return card(titulo || 'Horario por turno', `${edH ? '<p class="hint">Toca un horario típico o elige las horas en las listas. El cambio vale desde el día que elijas hacia adelante: los días que ya pasaron no se tocan.</p>' : ''}<div class="form">${hor('Diurno')}${hor('Nocturno')}</div>${hrExtra(p, F, edH, disH)}`);
}
/* Horario real de un turno para mostrarlo en otras pantallas (Personas). Sin dato cargado, solo el nombre del turno: nunca horas inventadas. */
window.hrTurnoEtiqueta = nombre => {
  if (HR.rol !== S.rol) { HR.rol = S.rol; HR.p = null; HR.F = null; HR.err = ''; HR.ok = ''; HR.pidio = false; }
  const h = HR.p && HR.p.horarios && HR.p.horarios[nombre];
  if (!HR.p && !HR.cargando && !HR.err && !HR.pidio && window.__EM_HTTP) { HR.pidio = true; hrCargar(); }
  const q = v => String(v || '').replace(/^0(\d:)/, '$1');
  return h && h.inicio && h.fin ? nombre + ' (' + q(h.inicio) + ' a ' + q(h.fin) + ')' : nombre;
};
/* Tarjeta al final de «Grupos y turnos»: Recursos humanos sigue cambiando el horario de cada turno con las mismas reglas de siempre */
function hrTarjetaGrupos() {
  if (!window.__EM_HTTP) return '';
  if (HR.rol !== S.rol) { HR.rol = S.rol; HR.p = null; HR.F = null; HR.err = ''; HR.ok = ''; HR.pidio = false; }
  const T = 'Horario de cada turno';
  if (!HR.p) { if (!HR.err) hrCargar(); return card(T, HR.err ? `<p class="err" role="alert">${esc(HR.err)}</p>` : '<p class="hint">Cargando…</p>'); }
  if (!HR.cargando && !HR.F) HR.F = hrDe(HR.p);
  const p = HR.p;
  if (!p.puede_editar_horarios) return card(T, `<p>${hrHorTxt(p.horarios)}</p><p class="hint">Si hace falta cambiarlo, pide autorización a Gerencia.</p>${typeof solBtn === 'function' ? solBtn('Una regla de pago de nómina', '', 'rh-params') : ''}`);
  return `${HR.err ? `<p class="err" role="alert">${esc(HR.err)}</p>` : ''}${HR.ok ? `<p class="hint">${esc(HR.ok)}</p>` : ''}${hrAvisos(p)}<div class="tn-panel">${hrHorarioCard(p, HR.F, T)}<div class="tn-pie"><button type="button" class="btn pri" data-act="hrGuardar" ${HR.busy ? 'disabled' : ''}>Guardar horarios</button></div></div>`;
}
window.hrTarjetaGrupos = hrTarjetaGrupos;
function scrParams() {
  if (!window.__EM_HTTP) return card('', emptyState('Este módulo necesita el servidor', 'Funciona en la versión con base de datos (Cloudflare).'));
  if (HR.rol !== S.rol) { HR.rol = S.rol; HR.p = null; HR.F = null; HR.err = ''; HR.ok = ''; }
  if (!HR.p) { hrCargar(); return card('', HR.err ? emptyState('No se pudo cargar', esc(HR.err)) : emptyState('Cargando…', 'Un momento.')); }
  if (!HR.cargando && !HR.F) HR.F = hrDe(HR.p);
  const p = HR.p, F = HR.F, ed = p.puede_editar, dis = ed ? '' : 'disabled', edH = p.puede_editar_horarios, disH = edH ? '' : 'disabled';
  const num = (id, l, v, st, mx) => `<label class="fld">${l}<input type="number" id="${id}" inputmode="decimal" min="0" ${mx ? 'max="' + mx + '"' : ''} step="${st}" value="${esc(v ?? '')}" ${dis}></label>`;
  const sel = (id, v, ops) => `<select id="${id}" ${dis}>${ops.map(([k, t]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  const tr = F.bono.tramos.map((t, i) => `<div class="tn-tr"><label class="fld">Cumplimiento desde (%)<input type="number" id="pm-td-${i}" min="0" max="300" step="1" value="${esc(t.desde ?? '')}" ${dis}></label><label class="fld">Paga (% del bono)<input type="number" id="pm-tp-${i}" min="0" max="300" step="1" value="${esc(t.pct ?? '')}" ${dis}></label>${ed ? `<button type="button" class="btn sm" data-act="hrQuitar" data-i="${i}">Quitar</button>` : ''}</div>`).join('');
  const pedir = ed ? '' : `<div class="btnrow tn-ped"><p class="hint">${ic('lock', 16)} ${edH ? 'Tú cambias los horarios de los turnos. Las reglas de pago y el bono los cambia solo Gerencia.' : 'Solo Gerencia cambia estos parámetros.'}</p>${typeof solBtn === 'function' ? solBtn('Una regla de pago de nómina') : ''}</div>`;
  return `${HR.err ? `<p class="err" role="alert">${esc(HR.err)}</p>` : ''}${HR.ok ? `<p class="hint">${esc(HR.ok)}</p>` : ''}${hrAvisos(p)}
  <div class="tn-panel"><div class="tn-pgrid">
    ${hrHorarioCard(p, F)}
    ${card('Reglas de pago de nómina', `<div class="form row3">${num('pm-jor', 'Jornada completa (horas)', F.pagos.nomJornada, 0.5, 24)}${num('pm-rec', 'Recargo de hora extra (%)', F.pagos.nomRecargo, 1)}${num('pm-ley', 'Deducciones de ley (%)', F.pagos.nomLey, 0.1, 100)}</div>`)}
    <div class="tn-pie">${edH ? `<button type="button" class="btn pri" data-act="hrGuardar" ${HR.busy ? 'disabled' : ''}>${ed ? 'Guardar parámetros' : 'Guardar horarios'}</button>` : ''}${pedir}</div>
  </div></div>`;
}
async function hrGuardar() {
  if (HR.busy) return; hrLeer(); HR.busy = true; HR.err = ''; HR.ok = '';
  try {
    const F = HR.F, cuerpo = HR.p && HR.p.puede_editar ? F : {horarios: F.horarios, desde: F.desde};
    HR.p = await hpApi('PUT', '/parametros', cuerpo); HR.F = hrDe(HR.p); HR.ok = HR.p.puede_editar ? 'Parámetros guardados.' : 'Horarios guardados. Gerencia recibió un aviso del cambio.'; toast(HR.p.puede_editar ? 'Parámetros guardados.' : 'Horarios guardados.'); HP.nomClave = ''; HT.k = '';
  }
  catch (e) {
    if (e.datos && e.datos.bloqueado) { HR.err = ''; modal('Esto ya no se puede cambiar', `<div class="form"><p>${esc(e.message)}</p><div class="btnrow">${typeof solBtn === 'function' ? solBtn('Corregir algo ya pagado o con bono aplicado', 'pri', 'rh-params') : ''}<button type="button" class="btn" data-act="closeModal">Entendido</button></div></div>`); }
    else { HR.err = e.message; toast(esc(e.message), 'err'); }
  }
  finally { HR.busy = false; render(); }
}

/* ---------- Asistencia: se llena sola con las marcas (se sincroniza al entrar) ---------- */
const HA = {q: '', ts: 0, busy: false};
function haSync() {
  const q = S.nomQ; if (!window.__EM_HTTP || !q || HA.busy || (HA.q === q && Date.now() - HA.ts < 15000)) return; HA.busy = true; HA.q = q;
  hpApi('GET', '/asistencia?q=' + q).then(() => { HA.ts = Date.now(); }).catch(e => { console.error(e); HA.ts = Date.now(); }).finally(() => { HA.busy = false; });
}

/* ---------- Registro en el sistema ---------- */
{ const i = HP_TABS.findIndex(t => t[0] === 'rh-planta'); HP_TABS.splice(i + 1, 0, ['rh-turnos', 'Turnos']); HP_TABS.push(['rh-grupos', 'Grupos y turnos'], ['nomina', 'Nómina anterior']); }
Object.assign(PERM_DEF, {turnos: 'produccion:1', 'rh-turnos': 'rrhh:1 adm:2', 'rh-params': 'rrhh:2 adm:1'});
Object.assign(SCREENS, {
  turnos: {mod: 'prod', g: 'Planta', t: 'Turnos', s: 'Turnos', ic: 'calendar', r: scrTurnos},
  'rh-turnos': {mod: 'adm', g: 'En planta', t: 'Turnos', s: 'Turnos', ic: 'calendar', r: scrTurnos},
  'rh-params': {mod: 'adm', g: 'En planta', t: 'Horarios y reglas de pago', s: 'Horarios y pago', ic: 'sliders', r: scrParams}
});
{ const sc = SCREENS.asistencia; if (sc) { const f = sc.r; sc.r = function () { haSync(); return f.apply(this, arguments); }; } }
S.perm = permInit();
/* El nivel de la matriz guardada por Gerencia puede ser viejo: el servidor es quien decide quién edita (Gerencia y Nómina), aquí solo se exige poder ver la pantalla */
Object.assign(ACT_REQ, {hrGuardar: ['rh-params', 1]});
Object.assign(ACT_LBL, {hrGuardar: 'cambiar los horarios de los turnos'});
['hrGuardar'].forEach(k => WRITE_ACTS.add(k));
Object.assign(ACT, {
  htTurno: el => { HT.turno = el.dataset.v; HT.modo = ''; HT.montos = {}; HT.err = ''; render(); }, htHoy: () => { HT.fecha = htHoy(); HT.modo = ''; HT.montos = {}; HT.err = ''; render(); },
  hrGuardar: () => hrGuardar(),
  hrAvisoVisto: async el => { try { await hpApi('POST', '/avisos/visto', el.dataset.id ? {id: +el.dataset.id} : {}); HR.p = await hpApi('GET', '/parametros'); } catch (e) { toast(esc(e.message), 'err'); } render(); },
  hrPreset: el => { hrLeer(); HR.F.horarios[el.dataset.t] = {inicio: el.dataset.i, fin: el.dataset.f}; render(); },
  hrAgregar: () => { hrLeer(); HR.F.bono.tramos.push({desde: '', pct: ''}); render(); }, hrQuitar: el => { hrLeer(); HR.F.bono.tramos.splice(+el.dataset.i, 1); render(); }
});
if (!window.__htListeners) {
  window.__htListeners = true;
  document.addEventListener('change', e => { const t = e.target; if (t && /^pm-h[mt]-[if]$/.test(t.id || '')) { hrLeer(); render(); return; } if (t && t.id === 'tn-fecha' && /^\d{4}-\d{2}-\d{2}$/.test(t.value)) { HT.fecha = t.value; HT.modo = ''; HT.montos = {}; HT.err = ''; render(); } });
  /* En pantallas angostas el panel se ajusta al alto libre para que la página no tenga scroll */
  let htFit = 0;
  const htAjustar = () => { htFit = 0; document.querySelectorAll('.tn-tab').forEach(tb => { const hs = [...tb.querySelectorAll('thead th')].map(h => h.textContent.trim()); tb.querySelectorAll('tr').forEach(tr => [...tr.children].forEach((td, i) => { if (td.tagName === 'TD' && i > 0 && hs[i] && td.dataset.l !== hs[i] && !tr.classList.contains('tsum')) td.dataset.l = hs[i]; else if (td.tagName === 'TD' && tr.classList.contains('tsum') && hs[i] && i > 0) td.dataset.l = hs[i]; })); }); document.querySelectorAll('.tn-panel').forEach(p => { if (window.innerWidth > 900 || p.closest('.rh-panel')) { p.style.maxHeight = ''; return; } const mn = document.querySelector('main'), r = p.getBoundingClientRect(), ex = mn ? Math.max(0, mn.getBoundingClientRect().bottom - r.bottom) : 0, lim = window.innerHeight - r.top - ex - 2; p.style.maxHeight = Math.max(160, Math.floor(lim)) + 'px'; p.style.overflow = 'auto'; }); };
  new MutationObserver(() => { if (!htFit) htFit = requestAnimationFrame(htAjustar); }).observe(document.body, {childList: true, subtree: true});
  window.addEventListener('resize', htAjustar);
  setInterval(() => { const m = document.getElementById('modal'); if (htEsTurnos() && HT.d && !HT.cargando && !HT.busy && !document.hidden && !(m && !m.hidden) && !document.activeElement.classList.contains('tn-in')) htCargar(); }, 30000);
}
