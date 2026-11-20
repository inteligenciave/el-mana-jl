/* Importar del lector (Hikvision «Original Records Report»): subir el archivo, ver lo entendido, asociar códigos nuevos, resolver lo dudoso y guardar.
   Toda la lectura y la regla de entrada/salida la hace el servidor (/api/h/lector/*, módulo src/rrhh/lector.js); aquí solo se muestra y se pide.
   Usa hpApi, hpFecha, hpHora, hpN, hpTabsOn de h-planta.js. Solo Gerencia y Nómina. */
const HL = {rol: null, vista: null, texto: '', nombre: '', busy: '', err: '', sub: 'importar', pend: null, pendCarg: false, filtro: 'todos', sel: {}, guardado: null, ajuste: null, aj: ''};
const hlEst = {listo: ['Listo', 'ok'], por_revisar: ['Por revisar', 'warn'], sin_turno: ['Sin turno', 'info'], codigo_nuevo: ['Código nuevo', 'crit'], ya_guardado: ['Ya guardado', 'n'], descartado: ['Descartado', 'n']};
const hlChip = e => { const x = hlEst[e] || [e, 'n']; return `<span class="chip c-${x[1]}">${x[0]}</span>`; };
const hlHoras = arr => (arr || []).map(t => hpHora(t)).join(' · ');
const hlDia = f => { const d = new Date(f + 'T12:00:00Z'); return ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][d.getUTCDay()] + ' ' + hpFecha(f).slice(0, 5); };
const hlReset = () => { if (HL.rol !== S.rol) { Object.assign(HL, {rol: S.rol, vista: null, texto: '', nombre: '', busy: '', err: '', sub: 'importar', pend: null, filtro: 'todos', sel: {}, guardado: null, ajuste: null}); } };

function hlPendCargar(forzar) {
  if (HL.pendCarg || (HL.pend && !forzar)) return; HL.pendCarg = true;
  hpApi('GET', '/lector/pendientes').then(d => { HL.pend = d; HL.ajuste = d.ajustes ? d.ajustes.min_entre_marcas : null; }).catch(e => { console.error(e); HL.pend = {dias: [], codigos_nuevos: [], personas: []}; HL.err = e.message; })
    .finally(() => { HL.pendCarg = false; if (S.route === 'rh-lector') render(); });
}
async function hlLeerArchivo(file) {
  if (!file) return;
  HL.err = ''; HL.guardado = null; HL.nombre = file.name; HL.vista = null; HL.busy = 'vista'; render();
  try {
    const buf = await file.arrayBuffer(); let t;
    try { t = new TextDecoder('utf-8', {fatal: true}).decode(buf); } catch (e) { t = new TextDecoder('windows-1252').decode(buf); } /* el CSV del lector viene en latin-1 */
    HL.texto = t.replace(/^﻿/, ''); HL.vista = await hpApi('POST', '/lector/vista', {texto: HL.texto}); HL.filtro = 'todos'; HL.sel = {};
  } catch (e) { HL.err = e.message; HL.texto = ''; }
  finally { HL.busy = ''; render(); }
}
async function hlGuardar() {
  if (!HL.texto || HL.busy) return; HL.busy = 'guardar'; HL.err = ''; render();
  try {
    const r = await hpApi('POST', '/lector/importar', {texto: HL.texto}); HL.vista = r; HL.guardado = r.guardado; HL.pend = null; HP.nomClave = ''; HP.resTs = 0; HA.ts = 0;
    toast('Guardado: ' + r.guardado.dias_confirmados + ' días pasaron a la asistencia' + (r.guardado.dias_pendientes ? ' y ' + r.guardado.dias_pendientes + ' esperan tu revisión' : '') + '.');
  } catch (e) { HL.err = e.message; toast(esc(e.message), 'err'); }
  finally { HL.busy = ''; render(); }
}
async function hlRefrescar() { if (!HL.texto) return; try { const v = await hpApi('POST', '/lector/vista', {texto: HL.texto}); HL.vista = v; } catch (e) { HL.err = e.message; } }
async function hlAsociar(codigo) {
  const sel = document.getElementById('hl-sel-' + codigo), id = sel ? sel.value : ''; if (!id) { toast('Elige a qué persona pertenece ese código.', 'err'); return; }
  if (HL.busy) return; HL.busy = 'cod'; render();
  try { const r = await hpApi('POST', '/lector/codigo', {codigo, empleado_id: id}); toast('Listo: el código ' + esc(codigo) + ' quedó en la ficha de ' + esc(r.nombre) + '.'); await hlRefrescar(); HL.pend = null; HA.ts = 0; }
  catch (e) { HL.err = e.message; toast(esc(e.message), 'err'); }
  finally { HL.busy = ''; render(); }
}
async function hlResolver(id, accion) {
  if (HL.busy) return; const g = k => (document.getElementById(k + id) || {}).value || ''; HL.busy = 'res'; HL.err = ''; render();
  try {
    await hpApi('POST', '/lector/resolver', {id, accion, entrada: g('hl-e-'), salida: g('hl-s-'), turno: g('hl-t-')});
    toast(accion === 'confirmar' ? 'Día confirmado: ya cuenta en la asistencia.' : 'Día descartado.'); HL.pend = null; HA.ts = 0; await hlRefrescar();
  } catch (e) { HL.err = e.message; toast(esc(e.message), 'err'); }
  finally { HL.busy = ''; render(); }
}
async function hlGuardarAjuste() {
  const v = (document.getElementById('hl-aj') || {}).value || ''; HL.busy = 'aj'; HL.err = '';
  try { const r = await hpApi('PUT', '/lector/ajustes', {min_entre_marcas: v}); HL.ajuste = r.min_entre_marcas; toast('Ajuste guardado.'); await hlRefrescar(); HL.pend = null; }
  catch (e) { HL.err = e.message; toast(esc(e.message), 'err'); }
  finally { HL.busy = ''; render(); }
}

function hlTiles(v) {
  const m = v.resumen.marcas, a = v.archivo, d = v.resumen.dias, t = (l, n, dd, tono) => `<div class="hl-t hl-${tono}"><span>${l}</span><b>${n}</b><small>${dd}</small></div>`, dias = n => (n || 0) + (n === 1 ? ' día' : ' días');
  return `<div class="hl-tiles">${t('Listo', m.listo, dias(d.listo), 'ok')}${t('Por revisar', m.por_revisar, dias(d.por_revisar), 'warn')}${t('Sin turno', m.sin_turno, dias(d.sin_turno), 'info')}${t('Código nuevo', m.codigo_nuevo, dias(d.codigo_nuevo), 'crit')}</div>
    <p class="hl-res">Las cifras grandes son <b>marcas</b>. El archivo trae <b>${a.marcas}</b> marcas de <b>${v.resumen.personas}</b> personas, del ${hpFecha(a.desde)} al ${hpFecha(a.hasta)}${a.ya_guardadas ? `; ${a.ya_guardadas} ya estaban guardadas (no se repiten)` : ''}${m.ya_guardado || m.descartado ? `. Ya decididas antes: ${m.ya_guardado + m.descartado}` : ''}.${a.n_ignoradas ? ` No entendí ${a.n_ignoradas} filas.` : ''}</p>`;
}
function hlCodigos(v) {
  const L = v.codigos_nuevos || []; if (!L.length) return '';
  const opts = v.personas.map(p => `<option value="${esc(p.id)}">${esc(p.nombre)}${p.codigo_lector ? ' (ya tiene código ' + esc(p.codigo_lector) + ')' : ''}</option>`).join('');
  return card('Códigos nuevos: ¿de quién son?', `<p class="hint">El lector manda un código por persona. Elige a quién pertenece cada uno; queda guardado en su ficha (Personal › «Código del lector») y no se vuelve a preguntar.</p>
    <div class="hl-cods">${L.map(c => `<div class="hl-cod"><div class="hl-cq"><b>Código ${esc(c.codigo)}</b><span>En el lector figura como «${esc(c.nombre_lector || '—')}» · ${c.marcas} ${c.marcas === 1 ? 'marca' : 'marcas'} en ${c.dias} ${c.dias === 1 ? 'día' : 'días'}</span>${c.repetido ? '<span class="chip c-crit">Está en la ficha de dos personas</span>' : ''}</div>
      <div class="hl-ca"><select id="hl-sel-${esc(c.codigo)}" aria-label="Persona del código ${esc(c.codigo)}"><option value="">Elige a la persona…</option>${opts}</select><button type="button" class="btn pri" data-act="hlAsociar" data-c="${esc(c.codigo)}" ${HL.busy ? 'disabled' : ''}>Asociar</button></div></div>`).join('')}</div>`);
}
const hlFiltros = (v, dias) => {
  const c = {todos: dias.length}; for (const d of dias) c[d.estado] = (c[d.estado] || 0) + 1;
  const b = (k, t) => c[k] ? `<button type="button" class="btn sm ${HL.filtro === k ? 'pri' : ''}" data-act="hlFiltro" data-v="${k}" aria-pressed="${HL.filtro === k}">${t} · ${c[k]}</button>` : '';
  return `<div class="hl-fil">${b('todos', 'Todos')}${b('listo', 'Listo')}${b('por_revisar', 'Por revisar')}${b('sin_turno', 'Sin turno')}${b('codigo_nuevo', 'Código nuevo')}${b('ya_guardado', 'Ya guardado')}${b('descartado', 'Descartado')}</div>`;
};
function hlFilaDia(d) {
  const quien = d.empleado ? `<b>${esc(d.empleado)}</b>` : `<b>Código ${esc(d.codigo)}</b>`;
  const sub = d.empleado ? esc(d.nombre_lector && d.nombre_lector.toLowerCase() !== d.empleado.toLowerCase() ? 'En el lector: ' + d.nombre_lector : '') : esc(d.nombre_lector || '');
  const ent = d.entrada_ts ? hpHora(d.entrada_ts) : '—', sal = d.salida_ts ? hpHora(d.salida_ts) : '—', prop = d.propuesta && d.estado !== 'ya_guardado' ? ' <small class="muted">(propuesta)</small>' : '';
  return `<div class="hl-fila"><div class="hl-p">${quien}<span>${sub}</span></div><div class="hl-d">${hlDia(d.fecha)}</div>
    <div class="hl-h"><span>Entrada</span><b>${ent}</b></div><div class="hl-h"><span>Salida</span><b>${sal}</b></div><div class="hl-h"><span>Turno</span><b>${esc(d.turno || (d.turno_sugerido ? '(' + d.turno_sugerido + '?)' : '—'))}</b></div>
    <div class="hl-e">${hlChip(d.estado)}${prop}</div><div class="hl-m"><span class="hl-marcas">Marcas: ${hlHoras(d.marcas)}</span>${d.motivo && d.estado !== 'ya_guardado' ? `<span class="hl-mot">${esc(d.motivo)}</span>` : ''}</div></div>`;
}
function hlTabla(v) {
  const todos = v.dias, vis = todos.filter(d => HL.filtro === 'todos' || d.estado === HL.filtro), orden = {codigo_nuevo: 0, por_revisar: 1, sin_turno: 2, listo: 3, ya_guardado: 4, descartado: 5};
  vis.sort((a, b) => orden[a.estado] - orden[b.estado] || (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (a.empleado || a.codigo).localeCompare(b.empleado || b.codigo, 'es')));
  return card('Lo que entendí, por persona y día', hlFiltros(v, todos) + (vis.length ? `<div class="hl-tabla">${vis.map(hlFilaDia).join('')}</div>` : '<p class="hp-vacio">No hay días con este filtro.</p>'), {sub: 'Entrada y salida se deciden con el horario del turno de cada persona (Parámetros).'});
}
function hlImportar() {
  const v = HL.vista, ocupado = !!HL.busy;
  const subida = card('Importar del lector', `<p class="hint">Sube el archivo que sacas del lector de huellas (el «Original Records Report», en <b>.csv</b> o <b>.xls</b>). Primero verás lo que se entendió; <b>no se guarda nada hasta que confirmes</b>.</p>
    <div class="hl-sube"><label class="btn pri hl-file" ${ocupado ? 'aria-disabled="true"' : ''}>${ic('plus', 16)}Elegir archivo<input type="file" id="hl-archivo" accept=".csv,.xls,.xlsx,.txt,.html,text/csv,application/vnd.ms-excel" ${ocupado ? 'disabled' : ''} hidden></label>
    <span class="hl-nom">${HL.nombre ? esc(HL.nombre) : 'Ningún archivo elegido'}</span>${HL.busy === 'vista' ? '<span class="muted">Leyendo…</span>' : ''}</div>
    ${HL.err ? `<p class="err" role="alert">${ic('alert')}${esc(HL.err)}</p>` : ''}`);
  if (!v) return subida + hlAjuste();
  const listos = v.resumen.dias.listo || 0, hay = (v.resumen.dias.listo || 0) + (v.resumen.dias.por_revisar || 0) + (v.resumen.dias.sin_turno || 0) + (v.resumen.dias.codigo_nuevo || 0), g = HL.guardado;
  const barra = g ? `<div class="hl-ok" role="status">${ic('check', 18)}<div><b>Guardado.</b> ${g.marcas_nuevas} marcas nuevas${g.marcas_repetidas ? ` (${g.marcas_repetidas} ya estaban)` : ''}. ${g.dias_confirmados} días pasaron a la asistencia${g.dias_pendientes ? `; ${g.dias_pendientes} días esperan tu decisión en «Por revisar»` : ''}.</div></div>`
    : hay ? `<div class="hl-conf"><div><b>¿Guardamos?</b><p class="hint">Se guardan las marcas tal como las dio el lector y los <b>${listos}</b> días claros pasan a la asistencia. Lo demás queda en «Por revisar» para que lo decidas.</p></div><button type="button" class="btn pri hl-go" data-act="hlGuardar" ${ocupado ? 'disabled' : ''}>${HL.busy === 'guardar' ? 'Guardando…' : 'Guardar en la asistencia'}</button></div>`
    : '<p class="hp-vacio">Todo lo de este archivo ya estaba decidido.</p>';
  const sinH = Object.entries(v.horarios_cargados || {}).filter(x => !x[1]).map(x => x[0]);
  const aviso = sinH.length ? `<p class="hl-aviso">${ic('alert', 15)}Falta el horario del turno ${sinH.join(' y ')} en Parámetros: las personas de ese turno aparecen como «Sin turno» y no se guardan solas.</p>` : '';
  return subida + card('Resumen del archivo', hlTiles(v) + aviso + barra) + hlCodigos(v) + hlTabla(v) + hlAjuste();
}
function hlAjuste() {
  const a = HL.ajuste ?? (HL.vista ? HL.vista.ajustes.min_entre_marcas : null);
  return `<details class="hl-aj"><summary>Ajuste: marcas muy juntas</summary><p class="hint">Si dos marcas de una persona están a menos de estos minutos, no se guardan solas: quedan «Por revisar». Déjalo vacío si no quieres usar esta regla. No hay ninguna cifra puesta de fábrica.</p>
    <div class="hl-ajf"><label class="fld">Minutos mínimos entre dos marcas<input type="number" id="hl-aj" min="0" max="600" step="1" inputmode="numeric" value="${a ?? ''}" placeholder="Sin usar"></label><button type="button" class="btn" data-act="hlAjuste" ${HL.busy ? 'disabled' : ''}>Guardar ajuste</button></div></details>`;
}
function hlPendientes() {
  if (!HL.pend) { hlPendCargar(); return card('', emptyState('Cargando…', 'Un momento.')); }
  const P = HL.pend, L = P.dias.filter(d => d.estado !== 'codigo_nuevo'), v = {codigos_nuevos: P.codigos_nuevos, personas: P.personas};
  const fila = d => {
    const prop = d.entrada_ts && d.salida_ts, hv = x => x ? new Date(x - 4 * 3600e3).toISOString().slice(11, 16) : '';
    return `<div class="hl-pf"><div class="hl-p"><b>${esc(d.empleado || 'Código ' + d.codigo)}</b><span>${hlDia(d.fecha)} · ${hlChip(d.estado)}</span></div><div class="hl-m"><span class="hl-marcas">Marcas: ${hlHoras(d.marcas)}</span><span class="hl-mot">${esc(d.motivo)}</span></div>
      <div class="hl-ed"><label class="fld">Entrada<input type="time" id="hl-e-${d.id}" value="${hv(d.entrada_ts)}"></label><label class="fld">Salida<input type="time" id="hl-s-${d.id}" value="${hv(d.salida_ts)}"></label>
      <label class="fld">Turno<select id="hl-t-${d.id}"><option value="">${d.turno ? d.turno : d.turno_sugerido ? d.turno_sugerido + ' (parece)' : 'Elegir…'}</option><option>Diurno</option><option>Nocturno</option></select></label>
      <button type="button" class="btn pri" data-act="hlResolver" data-id="${d.id}" data-a="confirmar" ${HL.busy ? 'disabled' : ''}>Confirmar</button><button type="button" class="btn" data-act="hlResolver" data-id="${d.id}" data-a="descartar" ${HL.busy ? 'disabled' : ''}>Descartar</button></div>${prop ? '' : '<p class="hint">Escribe la hora de entrada y la de salida para poder confirmar.</p>'}</div>`;
  };
  return (HL.err ? `<p class="err" role="alert">${ic('alert')}${esc(HL.err)}</p>` : '') + hlCodigos(v) + card('Días por revisar', L.length ? `<p class="hint">Confirma el día (puedes corregir las horas) o descártalo. Lo que confirmes pasa a la asistencia.</p><div class="hl-pl">${L.map(fila).join('')}</div>` : '<p class="hp-vacio">No hay días esperando.</p>');
}
function scrLector() {
  hlReset(); if (!window.__EM_HTTP) return card('', emptyState('Este módulo necesita el servidor', 'Funciona en la versión con base de datos (Cloudflare).'));
  if (!HL.pend && !HL.pendCarg) hlPendCargar();
  const n = HL.pend ? HL.pend.dias.length : 0, t = (k, x) => `<button type="button" class="btn ${HL.sub === k ? 'pri' : ''}" data-act="hlSub" data-v="${k}" aria-pressed="${HL.sub === k}">${x}</button>`;
  return `<div class="hl-wrap"><div class="hp-seg hl-sub" role="group" aria-label="Importar del lector">${t('importar', 'Importar archivo')}${t('pend', 'Por revisar' + (n ? ' · ' + n : ''))}</div>${HL.sub === 'importar' ? hlImportar() : hlPendientes()}</div>`;
}

/* ---------- Registro en el sistema ---------- */
{ const i = HP_TABS.findIndex(t => t[0] === 'asistencia'); HP_TABS.splice(i + 1, 0, ['rh-lector', 'Lector de huellas']); }
Object.assign(PERM_DEF, {'rh-lector': 'rrhh:2'});
Object.assign(SCREENS, {'rh-lector': {mod: 'adm', g: 'Ventas y personal', t: 'Importar del lector', s: 'Lector de huellas', ic: 'clip', r: scrLector}});
S.perm = permInit();
Object.assign(ACT_REQ, {hlGuardar: ['rh-lector', 2], hlAsociar: ['rh-lector', 2], hlResolver: ['rh-lector', 2], hlAjuste: ['rh-lector', 2]});
Object.assign(ACT_LBL, {hlGuardar: 'importar marcas del lector', hlAsociar: 'asociar códigos del lector', hlResolver: 'decidir días del lector', hlAjuste: 'cambiar el ajuste del lector'});
['hlGuardar', 'hlAsociar', 'hlResolver', 'hlAjuste'].forEach(k => WRITE_ACTS.add(k));
Object.assign(ACT, {
  hlSub: el => { HL.sub = el.dataset.v; HL.err = ''; if (HL.sub === 'pend') HL.pend = null; render(); }, hlFiltro: el => { HL.filtro = el.dataset.v; render(); },
  hlGuardar: () => hlGuardar(), hlAsociar: el => hlAsociar(el.dataset.c), hlResolver: el => hlResolver(+el.dataset.id, el.dataset.a), hlAjuste: () => hlGuardarAjuste()
});
if (!window.__hlListeners) {
  window.__hlListeners = true;
  document.addEventListener('change', e => { const t = e.target; if (t && t.id === 'hl-archivo' && t.files && t.files[0]) { const f = t.files[0]; t.value = ''; hlLeerArchivo(f); } });
}
