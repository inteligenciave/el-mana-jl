/* Bonos (en dólares): seguimiento en vivo del turno, bonos y metas (editar y crear), y bonos aplicados con opción de deshacer.
   Todo lo calcula el servidor (/api/h/bonos*); aquí solo se muestra y se pide. Ven Gerencia, Administración y Nómina; editan Gerencia y Administración.
   Usa hpApi, hpN, hpUsd, hpFecha, hpHora de h-planta.js. */
const HB = {tab: 'vivo', viv: null, lis: null, cargV: false, cargL: false, rol: null, err: '', busy: false, ts: 0, fecha: '', turno: '', F: null, msg: ''};
const hbHoy = () => new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10);
const hbN = (n, d) => hpN(n, d === undefined ? (n % 1 ? 1 : 0) : d);
const hbUn = u => u === 'kg' ? ' kg' : u === 'bultos' ? ' bultos' : '';
const hbPuede = () => !!((HB.viv && HB.viv.puede_editar) || (HB.lis && HB.lis.puede_editar));
function hbCargarV(forzar) {
  if (HB.cargV) return; HB.cargV = true; const k = HB.fecha + '|' + HB.turno;
  hpApi('GET', '/bonos/seguimiento' + (HB.fecha && HB.turno ? '?fecha=' + HB.fecha + '&turno=' + encodeURIComponent(HB.turno) : '')).then(d => { if (k === HB.fecha + '|' + HB.turno) { HB.viv = d; HB.err = ''; } })
    .catch(e => { console.error(e); HB.err = e.message; })
    .finally(() => { HB.cargV = false; HB.ts = Date.now(); if (S.route === 'rh-bonos') { if (k !== HB.fecha + '|' + HB.turno) { HB.viv = null; hbCargarV(); } else render(); } });
}
function hbCargarL() {
  if (HB.cargL) return; HB.cargL = true;
  hpApi('GET', '/bonos').then(d => { HB.lis = d; HB.err = ''; }).catch(e => { console.error(e); HB.err = e.message; }).finally(() => { HB.cargL = false; if (S.route === 'rh-bonos') render(); });
}
const hbRefrescar = () => { HB.viv = null; HB.lis = null; render(); };
const hbFormaTxt = (l, k) => ((l.formas.find(x => x.k === k)) || {}).t || k;
const hbFuenteTxt = (l, k) => ((l.fuentes.find(x => x.k === k)) || {}).t || k;
const hbQuienesTxt = (l, k, e) => k === 'area' && e && e.destino ? 'Las personas del área ' + e.destino.area + ' (las que marcaron)' : k === 'actividad' && e && e.destino ? 'Quienes hicieron: ' + (((l.etapas || []).find(x => x.k === e.destino.etapa)) || {}).t : ((l.quienes.find(x => x.k === k)) || {}).t || k;
const hbRige = e => e.rige ? ' Empieza a regir en el turno ' + e.rige.turno + ' del ' + hpFecha(e.rige.fecha) + '.' : '';
const hbPres = g => g >= 1000 && g % 1000 === 0 ? (g / 1000) + ' kg' : g + ' g';
/* Resumen en palabras de las metas y montos de un bono */
function hbResumen(e) {
  const p = e.params || {}, u = hbUn(e.unidad);
  if (e.fuente === 'asistencia_nocturna') return (p.monto > 0 ? hpUsd(p.monto) + ' fijos por noche a cada persona que marcó asistencia en el turno Nocturno.' : 'SIN MONTO DEFINIDO: no se paga hasta que Gerencia escriba el monto en «Cambiar metas y montos».') + ' Condición: haber marcado asistencia en el turno Nocturno. Se suma a los otros bonos.';
  if (e.forma === 'actividad') return hpUsd(p.monto) + ' fijos por jornada a cada persona marcada en la fritura.';
  if (e.forma === 'meta_fija') {
    if (p.metas_presentacion && p.metas_presentacion.length) return 'Meta por presentación: ' + p.metas_presentacion.map(m => hbPres(m.gramos) + ' = ' + m.meta + ' bultos').join(' · ') + '. Igual o más cumple. ' + hpUsd(p.monto) + ' a cada persona.';
    return 'Al llegar a ' + hbN(p.meta) + u + ': ' + hpUsd(p.monto) + ' a cada persona.';
  }
  if (e.forma === 'escalones') return (p.escalones || []).map(x => 'desde ' + hbN(x.desde) + u + ' = ' + hpUsd(x.monto)).join(' · ');
  return 'Sin bono antes de ' + hbN(p.meta) + u + '. Al llegar: ' + hpUsd(p.monto_base) + ' base, más ' + hpUsd(p.monto_bloque) + ' por cada bloque COMPLETO de ' + hbN(p.bloque) + u + ' por encima' + (p.tope ? ' (tope ' + hpUsd(p.tope) + ')' : '') + '.';
}
const hbBarra = (ev) => `<div class="pr-bar" role="img" aria-label="Avance ${ev.avance} %"><span class="${ev.califica ? 'ok' : ''}" style="width:${ev.avance}%"></span></div>`;

/* ---------- Seguimiento en vivo ---------- */
function hbVivo() {
  const d = HB.viv, t = k => `<button type="button" class="btn ${(HB.turno || d.turno) === k ? 'pri' : ''}" data-act="hbTurno" data-v="${k}" aria-pressed="${(HB.turno || d.turno) === k}">${k}</button>`;
  const h = d.horario, hor = h.definido ? esc(h.inicio) + ' a ' + esc(h.fin) + (h.cruza ? ' (del día siguiente)' : '') : 'Sin horario cargado';
  const estado = d.es_el_activo ? (d.en_curso ? '<span class="chip c-ok">Turno en curso</span>' : '<span class="chip c-warn">Entre turnos: se muestra el último</span>') : '<span class="chip">Otro turno</span>';
  const bar = `<div class="tn-bar"><label class="fld tn-f">Día<input type="date" id="bn-fecha" value="${esc(d.fecha)}" max="${hbHoy()}"></label><div class="hp-seg" role="group" aria-label="Turno">${t('Diurno')}${t('Nocturno')}</div>
    <button type="button" class="btn" data-act="hbActivo">Turno activo</button><span class="chip c-info">${hor}</span>${estado}</div>`;
  const r = d.resumen, tiles = `<div class="tn-bono"><div class="tn-t"><span>Kilos a Empaque</span><b>${hbN(r.kilos_empaque)} kg</b></div><div class="tn-t"><span>Bultos empacados</span><b>${hbN(r.bultos)}</b></div>
    <div class="tn-t"><span>Personas en el turno</span><b>${r.presentes}</b></div><div class="tn-t"><span>En Empaque</span><b>${r.en_empaque}</b></div><div class="tn-t"><span>En la fritura</span><b>${r.fritura}</b></div>
    <div class="tn-t tn-m"><span>${d.es_el_activo && d.en_curso ? 'Bonos que van ganados' : 'Bonos del turno'}</span><b>${hpUsd(d.total)}</b>${d.tasa ? `<span class="muted">≈ ${hpBs(d.total * d.tasa.valor)} (tasa de hoy)</span>` : ''}</div></div>`;
  const cards = d.esquemas.length ? d.esquemas.map(hbTarjeta).join('') : card('', emptyState('No hay bonos activos', 'Actívalos o crea uno en «Bonos y metas».'));
  return bar + (HB.err ? `<p class="err" role="alert">${esc(HB.err)}</p>` : '') + tiles + `<div class="tn-grid hb-grid">${cards}</div>`;
}
function hbTarjeta(x) {
  const e = x.esquema, ev = x.evaluacion, ap = x.aplicado, puede = hbPuede();
  const chip = ev.sin_monto && !ap ? '<span class="chip c-warn">Sin monto definido</span>' : ap ? (ap.estado === 'APLICADO' ? '<span class="chip c-ok">Aplicado</span>' : '<span class="chip c-warn">En revisión (no se paga)</span>') : ev.califica ? '<span class="chip c-ok">Califica</span>' : '<span class="chip c-warn">Aún no califica</span>';
  let det = '';
  if (Array.isArray(ev.detalle)) det = `<ul class="pr-lin">${ev.detalle.map(f => `<li><span>${esc(f.nombre)}</span><span class="${f.cumple ? '' : 'muted'}">${hbN(f.bultos)} de ${hbN(f.meta)} bultos${f.cumple ? ' · cumple' : ' · faltan ' + hbN(f.falta)}</span></li>`).join('')}</ul>`;
  const valor = e.forma === 'actividad' ? (e.fuente === 'asistencia_nocturna' ? `<p class="pr-big">${hbN(ev.valor)} ${ev.valor === 1 ? 'persona' : 'personas'}</p>` : '') : `<p class="pr-big">${hbN(ev.valor)}${hbUn(ev.unidad)}</p>`;
  const acc = !puede ? '' : ap ? (ap.estado === 'APLICADO' ? `<button type="button" class="btn sm" data-act="hbDeshacer" data-id="${ap.id}" ${HB.busy ? 'disabled' : ''}>Deshacer</button>` : `<button type="button" class="btn sm pri" data-act="hbAplicar" data-e="${e.id}" ${HB.busy ? 'disabled' : ''}>Volver a aplicar</button>`)
    : `<button type="button" class="btn sm" data-act="hbAplicar" data-e="${e.id}" ${HB.busy ? 'disabled' : ''}>Aplicar ahora</button>`;
  const pers = x.personas.length ? `<details class="hb-det"><summary>${x.personas.length} ${x.personas.length === 1 ? 'persona' : 'personas'}${ev.monto > 0 ? ' · ' + hpUsd(ev.monto) + ' c/u' : ''}</summary><p class="muted">${x.personas.map(p => esc(p.nombre)).join(', ')}</p></details>` : '<p class="muted">Todavía no hay personas para este bono.</p>';
  const pie = ap ? `<p class="muted">${ap.estado === 'APLICADO' ? 'Aplicado ' + (ap.origen === 'auto' ? 'solo al cerrar el turno' : 'a mano') + ': ' + hpUsd(ap.total) + ' · ' + esc(ap.quien) + ', ' + hpHora(ap.ts) : 'Lo deshizo ' + esc(ap.deshecho_quien || '') + (ap.deshecho_ts ? ', ' + hpHora(ap.deshecho_ts) : '')}</p>`
    : ev.califica ? `<p class="muted">Se aplicará solo al cerrar el turno: ${hpUsd(x.total_estimado)} en total.</p>` : '';
  return `<section class="card hb-card ${ev.califica ? 'hb-ok' : ''}"><div class="card-b"><h2>${esc(e.nombre)} ${chip}</h2><p class="muted">${esc(hbResumen(e))}</p>${valor}${hbBarra(ev)}<p class="hb-est"><b>${esc(ev.texto)}</b></p>${det}${pers}${pie}${acc ? `<div class="btnrow">${acc}</div>` : ''}</div></section>`;
}

/* ---------- Bonos y metas ---------- */
function hbLista() {
  const l = HB.lis, ed = l.puede_editar, act = l.esquemas.filter(e => !e.archivado), arch = l.esquemas.filter(e => e.archivado);
  const fila = e => `<section class="card hb-card"><div class="card-b"><h2>${esc(e.nombre)} ${e.activo ? '<span class="chip c-ok">Activo</span>' : '<span class="chip">Apagado</span>'}${e.base ? ' <span class="chip c-info">De fábrica</span>' : ''}${e.fuente === 'asistencia_nocturna' && !(e.params && e.params.monto > 0) ? ' <span class="chip c-warn">Sin monto definido</span>' : ''}</h2>
    <p>${esc(hbResumen(e))}</p><p class="muted">${esc(hbFormaTxt(l, e.forma))} · Se mide: ${esc(hbFuenteTxt(l, e.fuente))} · Se paga a: ${esc(hbQuienesTxt(l, e.quienes, e))}</p>${e.rige ? `<p class="hint">${esc(hbRige(e).trim())} No toca turnos ya empezados.</p>` : ''}
    ${ed ? `<div class="btnrow"><button type="button" class="btn sm pri" data-act="hbEditar" data-id="${e.id}">Cambiar metas y montos</button><button type="button" class="btn sm" data-act="hbActivar" data-id="${e.id}">${e.activo ? 'Apagar' : 'Encender'}</button>${e.base ? '' : `<button type="button" class="btn sm" data-act="hbArchivar" data-id="${e.id}" data-v="1">Archivar</button>`}</div>` : ''}</div></section>`;
  const viejo = l.archivo_viejo.length ? card('Regla anterior (archivada, sin uso)', l.archivo_viejo.map(a => { const b = a.data || {}; return `<p class="muted">${b.tipo === 'fijo' ? 'Monto fijo' : 'Por kilo'} · valor ${hpUsd(b.valor)} · meta ${hbN(b.meta_kg)} kg${(b.tramos || []).length ? ' · ' + b.tramos.length + ' escalones' : ''}. Quedó archivada al pasar a los bonos nuevos; no se borró.</p>`; }).join(''), {sub: 'Los bonos que ya se habían aplicado siguen en la nómina.'}) : '';
  const archC = arch.length ? card('Bonos archivados', arch.map(e => `<div class="hp-p"><div><b>${esc(e.nombre)}</b><span>${esc(hbResumen(e))}</span></div>${ed ? `<button type="button" class="btn sm" data-act="hbArchivar" data-id="${e.id}" data-v="0">Restaurar</button>` : ''}</div>`).join('')) : '';
  return `${HB.err ? `<p class="err" role="alert">${esc(HB.err)}</p>` : ''}${HB.msg ? `<p class="hint">${esc(HB.msg)}</p>` : ''}<div class="btnrow">${l.puede_crear ? '<button type="button" class="btn pri" data-act="hbNuevo">Crear bono</button>' : ''}${ed ? '' : '<p class="hint">Solo Gerencia y Administración cambian los bonos.</p>'}${ed && !l.puede_crear ? '<p class="hint">Administración cambia metas y montos. Solo Gerencia crea bonos nuevos.</p>' : ''}</div>
    <div class="tn-grid hb-grid">${act.map(fila).join('')}</div>${archC}${viejo}`;
}
/* ---------- Bonos aplicados ---------- */
function hbAplicados() {
  const l = HB.lis, ed = l.puede_editar;
  const chip = a => a.estado === 'APLICADO' ? '<span class="chip c-ok">Aplicado</span>' : '<span class="chip c-warn">En revisión</span>';
  return card('Últimos bonos aplicados', table([{h: 'Día', f: a => hpFecha(a.fecha)}, {h: 'Turno', f: a => esc(a.turno)}, {h: 'Bono', f: a => esc(a.esquema)}, {h: 'Estado', f: chip}, {h: 'Por persona', r: 1, f: a => hpUsd(a.monto_persona)}, {h: 'Total', r: 1, f: a => hpUsd(a.total)},
    {h: 'Cómo', f: a => a.origen === 'auto' ? 'Al cerrar el turno' : 'A mano'}, ...(ed ? [{h: '', f: a => a.estado === 'APLICADO' ? `<button type="button" class="btn sm" data-act="hbDeshacer" data-id="${a.id}">Deshacer</button>` : `<button type="button" class="btn sm" data-act="hbReaplicar" data-f="${esc(a.fecha)}" data-t="${esc(a.turno)}" data-e="${a.esquema_id || ''}">Volver a aplicar</button>`}] : [])], l.ultimos, {empty: 'Todavía no se aplicó ningún bono.', cls: 'tn-tab'}),
    {sub: 'Los bonos se aplican solos al cerrar el turno de Producción. Si deshaces uno, queda en revisión y no se paga hasta que lo vuelvas a aplicar.'});
}
function scrBonos() {
  if (!window.__EM_HTTP) return card('', emptyState('Este módulo necesita el servidor', 'Funciona en la versión con base de datos (Cloudflare).'));
  if (HB.rol !== S.rol) { HB.rol = S.rol; HB.viv = HB.lis = null; HB.err = ''; HB.fecha = HB.turno = ''; }
  const tab = (k, t) => `<button type="button" class="btn ${HB.tab === k ? 'pri' : ''}" data-act="hbTab" data-v="${k}" aria-pressed="${HB.tab === k}">${t}</button>`;
  const tabs = `<div class="hp-seg hb-tabs" role="group" aria-label="Vista de bonos">${tab('vivo', 'Turno en vivo')}${tab('lista', 'Bonos y metas')}${tab('aplicados', 'Bonos aplicados')}</div>`;
  let cuerpo;
  if (HB.tab === 'vivo') {
    if (!HB.viv || Date.now() - HB.ts > 5000) { if (!HB.viv) HB.viv = null; if (!HB.cargV) hbCargarV(); }
    cuerpo = HB.viv ? hbVivo() : (HB.err ? `<p class="err" role="alert">${esc(HB.err)}</p>` : card('', emptyState('Cargando…', 'Un momento.')));
  } else {
    if (!HB.lis) { if (!HB.cargL) hbCargarL(); cuerpo = HB.err ? `<p class="err" role="alert">${esc(HB.err)}</p>` : card('', emptyState('Cargando…', 'Un momento.')); }
    else cuerpo = HB.tab === 'lista' ? hbLista() : hbAplicados();
  }
  return `<div class="tn-bar">${tabs}</div><div class="tn-panel">${cuerpo}</div>`;
}

/* ---------- Formulario de un bono ---------- */
function hbNuevoForm() { return {id: null, base: false, fija: false, area: '', etapa: 'fritado', nombre: '', forma: 'meta_fija', fuente: 'kilos_empaque', quienes: 'turno', activo: true, params: {meta: '', monto: '', metas_presentacion: [], escalones: [{desde: '', monto: ''}], monto_base: '', bloque: '', monto_bloque: '', tope: ''}}; }
function hbFormDe(e) { const p = e.params || {}, d = e.destino || {}; return {id: e.id, base: e.base, fija: e.base || !(HB.lis && HB.lis.puede_crear), area: d.area || '', etapa: d.etapa || p.etapa || 'fritado', nombre: e.nombre, forma: e.forma, fuente: e.fuente, quienes: e.quienes, activo: e.activo, params: {meta: p.meta ?? '', monto: p.monto ?? '', metas_presentacion: (p.metas_presentacion || []).map(m => ({...m})), escalones: (p.escalones || [{desde: '', monto: ''}]).map(x => ({...x})), monto_base: p.monto_base ?? '', bloque: p.bloque ?? '', monto_bloque: p.monto_bloque ?? '', tope: p.tope ?? ''}}; }
function hbLeer() {
  const F = HB.F; if (!F || !document.getElementById('hb-nom')) return; const g = k => { const el = document.getElementById(k); return el ? el.value : ''; };
  F.nombre = g('hb-nom'); if (!F.fija) { F.forma = g('hb-forma') || F.forma; F.fuente = g('hb-fuente') || F.fuente; F.quienes = g('hb-quienes') || F.quienes; F.area = g('hb-area') || F.area; F.etapa = g('hb-etapa') || F.etapa; }
  const P = F.params; P.meta = g('hb-meta'); P.monto = g('hb-monto'); P.monto_base = g('hb-mbase'); P.bloque = g('hb-bloque'); P.monto_bloque = g('hb-mbloque'); P.tope = g('hb-tope');
  P.metas_presentacion = P.metas_presentacion.map((m, i) => ({gramos: g('hb-pg-' + i), meta: g('hb-pm-' + i)})); P.escalones = P.escalones.map((x, i) => ({desde: g('hb-ed-' + i), monto: g('hb-em-' + i)}));
}
function hbForma(l) {
  const F = HB.F, P = F.params, un = hbUn((l.fuentes.find(x => x.k === F.fuente) || {}).un), dis = F.fija ? 'disabled' : '';
  const num = (id, lab, v, st = 'any') => `<label class="fld">${lab}<input type="number" id="${id}" inputmode="decimal" min="0" step="${st}" value="${esc(v ?? '')}"></label>`;
  const sel = (id, v, ops, d) => `<select id="${id}" ${d || ''} data-cambia="1">${ops.map(o => `<option value="${o.k}" ${v === o.k ? 'selected' : ''}>${esc(o.t)}</option>`).join('')}</select>`;
  let cuerpo = '';
  if (F.forma === 'meta_fija') {
    cuerpo = `<div class="row3">${num('hb-meta', 'Meta' + (un ? ' (' + un.trim() + ')' : ''), P.meta)}${num('hb-monto', 'Monto por persona ($)', P.monto, '0.01')}</div>`;
    if (F.fuente === 'bultos_empaque') cuerpo += `<div class="tn-trs"><b>Meta por presentación (bultos)</b><p class="hint">Si agregas presentaciones, cada una se compara con su propia meta (igual o más cumple). Sin presentaciones se usa la meta de arriba con todos los bultos.</p>${P.metas_presentacion.map((m, i) => `<div class="tn-tr">${num('hb-pg-' + i, 'Presentación (gramos)', m.gramos, '1')}${num('hb-pm-' + i, 'Meta de bultos', m.meta, '1')}<button type="button" class="btn sm" data-act="hbQuitarPres" data-i="${i}">Quitar</button></div>`).join('')}<button type="button" class="btn sm" data-act="hbAgregarPres">Agregar presentación</button></div>`;
  } else if (F.forma === 'escalones') {
    cuerpo = `<div class="tn-trs"><b>Escalones</b><p class="hint">Se paga el monto del escalón más alto que se alcance.</p>${P.escalones.map((x, i) => `<div class="tn-tr">${num('hb-ed-' + i, 'Desde' + (un ? ' (' + un.trim() + ')' : ''), x.desde)}${num('hb-em-' + i, 'Monto por persona ($)', x.monto, '0.01')}${P.escalones.length > 1 ? `<button type="button" class="btn sm" data-act="hbQuitarEsc" data-i="${i}">Quitar</button>` : ''}</div>`).join('')}${P.escalones.length < 10 ? '<button type="button" class="btn sm" data-act="hbAgregarEsc">Agregar escalón</button>' : ''}</div>`;
  } else if (F.forma === 'por_unidad') {
    cuerpo = `<div class="row3">${num('hb-meta', 'Meta (sin bono antes)', P.meta)}${num('hb-mbase', 'Monto base al llegar ($)', P.monto_base, '0.01')}</div><div class="row3">${num('hb-bloque', 'Tamaño del bloque', P.bloque)}${num('hb-mbloque', 'Monto por bloque COMPLETO ($)', P.monto_bloque, '0.01')}${num('hb-tope', 'Tope por persona ($, opcional)', P.tope, '0.01')}</div>`;
  } else cuerpo = F.fuente === 'asistencia_nocturna' ? num('hb-monto', 'Monto por noche, por persona ($)', P.monto, '0.01') + '<p class="hint">Condición: haber marcado asistencia en el turno Nocturno. Se suma a los otros bonos. Con $ 0 no se paga: escribe el monto cuando esté definido.</p>' : num('hb-monto', 'Monto fijo por jornada ($)', P.monto, '0.01');
  /* Un bono nuevo usa solo las medidas y destinatarios de los datos que ya existen; «fritura» es el bono de fábrica y su medida propia. */
  const fuentes = F.fija ? l.fuentes : F.forma === 'actividad' ? l.fuentes.filter(f => f.k === 'actividad') : l.fuentes.filter(f => f.k !== 'fritura' && f.k !== 'actividad' && !f.fabrica);
  const quien = F.fija ? l.quienes : l.quienes.filter(q => q.k !== 'fritura' && q.k !== 'empaque');
  const etapaSel = F.fuente === 'actividad' || F.quienes === 'actividad' ? `<label class="fld">Actividad${sel('hb-etapa', F.etapa, (l.etapas || []).map(x => ({k: x.k, t: x.t})), dis)}</label>` : '';
  const areaSel = F.quienes === 'area' ? `<label class="fld">Área${sel('hb-area', F.area, [{k: '', t: 'Elige el área…'}, ...(l.areas || []).map(a => ({k: a, t: a}))], dis)}</label>` : '';
  const aviso = F.id ? 'Los cambios valen para los turnos que aún no tienen el bono aplicado.' : 'Queda ACTIVO desde el siguiente turno: no toca los turnos que ya empezaron o cerraron.';
  return `<div class="form"><label class="fld">Nombre del bono<input type="text" id="hb-nom" maxlength="60" value="${esc(F.nombre)}"></label>
    <div class="row3"><label class="fld">Cómo se paga${sel('hb-forma', F.forma, l.formas, dis)}</label><label class="fld">Qué se mide${sel('hb-fuente', F.fuente, fuentes, dis)}</label><label class="fld">A quién${sel('hb-quienes', F.quienes, quien, dis)}</label></div>
    ${areaSel || etapaSel ? `<div class="row3">${areaSel}${etapaSel}</div>` : ''}
    ${cuerpo}<p class="hint">Todo en dólares. El pago a bolívares usa la tasa del día de pago. ${aviso}</p>
    <p class="err" id="hb-e" role="alert" hidden></p><div class="btnrow"><button type="button" class="btn pri" data-act="hbGuardar">Guardar</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`;
}
const hbModal = () => { modal(HB.F.id ? 'Cambiar «' + esc(HB.F.nombre || 'bono') + '»' : 'Crear un bono nuevo', hbForma(HB.lis)); };
async function hbGuardar() {
  if (HB.busy) return; hbLeer(); const F = HB.F, P = F.params, e = document.getElementById('hb-e'); HB.busy = true;
  const params = F.forma === 'meta_fija' ? {meta: P.meta, monto: P.monto, metas_presentacion: F.fuente === 'bultos_empaque' ? P.metas_presentacion : []} : F.forma === 'escalones' ? {escalones: P.escalones} : F.forma === 'por_unidad' ? {meta: P.meta, monto_base: P.monto_base, bloque: P.bloque, monto_bloque: P.monto_bloque, tope: P.tope} : {monto: P.monto};
  try { HB.lis = await hpApi(F.id ? 'PUT' : 'POST', '/bonos/esquemas' + (F.id ? '/' + F.id : ''), {nombre: F.nombre, forma: F.forma, fuente: F.fuente, quienes: F.quienes, area: F.quienes === 'area' ? F.area : undefined, etapa: F.fuente === 'actividad' || F.quienes === 'actividad' ? F.etapa : undefined, activo: F.activo, params}); HB.viv = null; HB.F = null; HB.msg = 'Bono guardado.'; closeModal(); toast('Bono guardado.'); }
  catch (er) { if (e) { e.textContent = er.message; e.hidden = false; } else toast(esc(er.message), 'err'); }
  finally { HB.busy = false; render(); }
}
async function hbAccion(m, ruta, cuerpo, ok) {
  if (HB.busy) return; HB.busy = true; HB.err = '';
  try { const r = await hpApi(m, ruta, cuerpo); HB.viv = null; HB.lis = r && r.formas ? r : null; HB.msg = ''; HP.nomClave = ''; HP.resTs = 0; if (ok) toast(ok(r)); }
  catch (e) { HB.err = e.message; toast(esc(e.message), 'err'); }
  finally { HB.busy = false; render(); }
}

/* ---------- Registro en el sistema ---------- */
{ const i = HP_TABS.findIndex(t => t[0] === 'rh-turnos'); HP_TABS.splice(i + 1, 0, ['rh-bonos', 'Bonos']); }
Object.assign(PERM_DEF, {'rh-bonos': 'rrhh:1 adm:2'});
Object.assign(SCREENS, {'rh-bonos': {mod: 'adm', g: 'En planta', t: 'Bonos', s: 'Bonos', ic: 'coins', r: scrBonos}});
Object.assign(ACT_REQ, {hbEditar: ['rh-bonos', 2], hbNuevo: ['rh-bonos', 2], hbGuardar: ['rh-bonos', 2], hbActivar: ['rh-bonos', 2], hbArchivar: ['rh-bonos', 2], hbAplicar: ['rh-bonos', 2], hbReaplicar: ['rh-bonos', 2], hbDeshacer: ['rh-bonos', 2]});
Object.assign(ACT_LBL, {hbEditar: 'cambiar los bonos', hbNuevo: 'crear bonos', hbGuardar: 'guardar un bono', hbActivar: 'encender o apagar un bono', hbArchivar: 'archivar un bono', hbAplicar: 'aplicar un bono', hbReaplicar: 'aplicar un bono', hbDeshacer: 'deshacer un bono'});
['hbGuardar', 'hbActivar', 'hbArchivar', 'hbAplicar', 'hbReaplicar', 'hbDeshacer'].forEach(k => WRITE_ACTS.add(k));
S.perm = permInit();
Object.assign(ACT, {
  hbTab: el => { HB.tab = el.dataset.v; HB.err = ''; HB.msg = ''; render(); },
  hbTurno: el => { HB.turno = el.dataset.v; HB.fecha = HB.fecha || (HB.viv ? HB.viv.fecha : hbHoy()); HB.viv = null; HB.err = ''; render(); },
  hbActivo: () => { HB.fecha = ''; HB.turno = ''; HB.viv = null; HB.err = ''; render(); },
  hbNuevo: () => { if (!(HB.lis && HB.lis.puede_crear)) return toast('Solo Gerencia crea bonos nuevos.', 'err'); HB.F = hbNuevoForm(); hbModal(); },
  hbEditar: el => { const e = HB.lis.esquemas.find(x => x.id === +el.dataset.id); if (!e) return; HB.F = hbFormDe(e); hbModal(); },
  hbAgregarPres: () => { hbLeer(); HB.F.params.metas_presentacion.push({gramos: '', meta: ''}); hbModal(); }, hbQuitarPres: el => { hbLeer(); HB.F.params.metas_presentacion.splice(+el.dataset.i, 1); hbModal(); },
  hbAgregarEsc: () => { hbLeer(); HB.F.params.escalones.push({desde: '', monto: ''}); hbModal(); }, hbQuitarEsc: el => { hbLeer(); HB.F.params.escalones.splice(+el.dataset.i, 1); hbModal(); },
  hbGuardar: () => hbGuardar(),
  hbActivar: el => { const e = HB.lis.esquemas.find(x => x.id === +el.dataset.id); if (e) hbAccion('PUT', '/bonos/esquemas/' + e.id, {nombre: e.nombre, forma: e.forma, fuente: e.fuente, quienes: e.quienes, area: (e.destino || {}).area, etapa: (e.destino || {}).etapa || (e.params || {}).etapa, activo: !e.activo, params: e.params}, () => e.activo ? 'Bono apagado.' : 'Bono encendido.'); },
  hbArchivar: el => hbAccion('POST', '/bonos/esquemas/' + el.dataset.id + '/archivar', {archivar: el.dataset.v === '1'}, () => el.dataset.v === '1' ? 'Bono archivado.' : 'Bono restaurado.'),
  hbAplicar: el => hbAccion('POST', '/bonos/aplicar', {fecha: HB.viv.fecha, turno: HB.viv.turno, esquema_id: +el.dataset.e}, () => 'Bono aplicado.'),
  hbReaplicar: el => hbAccion('POST', '/bonos/aplicar', {fecha: el.dataset.f, turno: el.dataset.t, esquema_id: el.dataset.e ? +el.dataset.e : undefined}, () => 'Bono aplicado de nuevo.'),
  hbDeshacer: el => hbAccion('POST', '/bonos/deshacer', {id: +el.dataset.id}, () => 'Bono deshecho: quedó en revisión y no se paga.')
});
if (!window.__hbListeners) {
  window.__hbListeners = true;
  document.addEventListener('change', e => {
    const t = e.target; if (!t) return;
    if (t.id === 'bn-fecha' && /^\d{4}-\d{2}-\d{2}$/.test(t.value)) { HB.fecha = t.value; HB.turno = HB.turno || (HB.viv ? HB.viv.turno : 'Diurno'); HB.viv = null; HB.err = ''; render(); return; }
    if (t.dataset && t.dataset.cambia && HB.F && /^hb-(forma|fuente|quienes|area|etapa)$/.test(t.id)) {
      hbLeer(); const l = HB.lis, F = HB.F;
      if (t.id === 'hb-forma') { if (F.forma === 'actividad') F.fuente = 'actividad'; else if (F.fuente === 'actividad' || F.fuente === 'fritura') F.fuente = 'kilos_empaque'; }
      if (t.id === 'hb-fuente') { if (F.fuente === 'actividad' || F.fuente === 'fritura') F.forma = 'actividad'; else if (F.forma === 'actividad') F.forma = 'meta_fija'; }
      if (F.quienes === 'fritura' || F.quienes === 'empaque') F.quienes = 'turno';
      hbModal();
    }
  });
  /* El seguimiento se renueva solo cada 30 segundos mientras se mira (no mientras se escribe) */
  setInterval(() => { const m = document.getElementById('modal'); if (S.route === 'rh-bonos' && HB.tab === 'vivo' && HB.viv && !HB.cargV && !HB.busy && !document.hidden && !(m && !m.hidden)) hbCargarV(); }, 30000);
}
