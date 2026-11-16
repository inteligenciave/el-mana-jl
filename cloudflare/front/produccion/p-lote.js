/* Lote de papa en ventana emergente (Producir): al tocar un lote se abre un flujo por pasos.
   Pasos: Resumen, una etapa por paso (con sus kilos), Cierre (kg a granel y aceite) y Mermas del lote.
   Reutiliza el modal del sistema, Svc.avanzarEtapa / Svc.cerrarLote / Svc.regMerma (vía ACT.avanzarEtapa, ACT.cerrarLote, ACT.regMerma)
   y los kilos de la planta de /api/p/proceso. No crea endpoints nuevos. Los permisos reales los comprueba el servidor. */
const LM_CLAVE = ['pelado', 'corte', 'freido', null];            // etapa del lote → etapa de merma
const LM_TURNO = {'Lavado y pelado': 'lavado', 'Freído': 'fritado'}; // etapa del lote → etapa del turno (/api/p/proceso)
const LM_CORTA = ['Lavado y pelado', 'Corte', 'Freído', 'Enfriado y reposo'];
const lmNd = '<span class="muted">Sin datos</span>';
const lmPuede = () => lvl('produccion') >= 2;
const lmEvs = l => (mrBL()[l.id] || []).filter(e => e.kg > 0);
const lmKg = n => (n > 0 || n === 0) && n != null ? kg(n, n % 1 ? 1 : 0) : lmNd;

/* El lote tal como está ahora (con lo que se acaba de guardar, mientras la base lo confirma) */
function lmLote() {
  const L = S.lm; if (!L) return null;
  const l = S.lotes.find(x => x.id === L.id); if (!l) return null;
  if (L.over) { if (Object.keys(L.over).every(k => l[k] === L.over[k]) || l.estado === 'Cerrado') L.over = null; else return Object.assign({}, l, L.over); }
  return l;
}
const lmIdx = l => l.estado === 'Cerrado' ? ETAPAS.length : Math.max(0, ETAPAS.indexOf(l.etapa));
function lmPasos(l) {
  if (!lmPuede()) return [{t: 'Resumen', k: 'res'}];
  return [{t: 'Resumen', k: 'res'}, ...ETAPAS.map((e, i) => ({t: LM_CORTA[i], k: 'et', i})), {t: 'Cierre', k: 'cie'}, {t: 'Mermas', k: 'mer'}];
}
function lmHecho(p, l) {
  const L = S.lm;
  if (p.k === 'res') return L.max > 0;
  if (p.k === 'et') return l.estado === 'Cerrado' || lmIdx(l) > p.i;
  if (p.k === 'cie') return l.estado === 'Cerrado';
  return lmEvs(l).length > 0;
}

/* ---------- Abrir y cerrar ---------- */
function lmAbrir(el, id, paso) {
  const l = S.lotes.find(x => x.id === (id || el.dataset.id)); if (!l) return; if (paso == null && el.dataset.paso) paso = +el.dataset.paso;
  const prev = el.matches && el.matches('tr') ? (el.querySelector('button') || el) : el;
  S.lm = {id: l.id, paso: 0, max: 0, over: null, prev};
  S.mrErr = ''; S.lotForm.granel = ''; S.lotForm.aceite = '';
  if (window.__EM_HTTP && lmPuede()) prApi('GET', '/proceso').then(r => { PR.proc = r; if (S.lm && S.lm.id === l.id && !$('#modal').hidden) lmRepintarSuave(); }).catch(() => { /* sin esa cifra: se muestra «Sin datos» */ });
  if (paso != null && lmPuede()) { S.lm.paso = paso; S.lm.max = paso; }
  lmPintar();
}
function lmAlCerrar() {
  const L = S.lm; S.lm = null; S.mrErr = '';
  const t = L && (L.prev && L.prev.isConnected ? L.prev : document.querySelector('.lm-lnk[data-id="' + L.id + '"]'));
  if (t) { try { t.focus(); } catch (e) { /* nada */ } }
}
/* Repinta sin tocar lo que la persona está escribiendo */
function lmRepintarSuave() { const a = document.activeElement; if (a && a.closest && a.closest('#modal') && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) return; lmPintar(); }

/* ---------- Pintar ---------- */
function lmPintar(foco) {
  const L = S.lm; if (!L) return;
  const l = lmLote(); if (!l) { closeModal(); return; }
  const pasos = lmPasos(l), n = pasos.length; L.paso = Math.max(0, Math.min(L.paso, n - 1)); L.max = Math.max(L.max, L.paso);
  const p = pasos[L.paso], cerrado = l.estado === 'Cerrado';
  const marcas = n > 1 ? `<nav class="lm-pasos" aria-label="Pasos del lote"><ol>${pasos.map((q, i) => {
    const h = lmHecho(q, l), cur = i === L.paso, ok = i <= L.max;
    return `<li class="${h ? 'hecho' : ''} ${cur ? 'cur' : ''}"><button type="button" class="lm-p" data-act="lmIr" data-i="${i}" ${ok ? '' : 'disabled'} ${cur ? 'aria-current="step"' : ''} aria-label="Paso ${i + 1} de ${n}: ${q.t}${h ? ', hecho' : ''}"><span class="lm-n">${h ? ic('check', 14) : i + 1}</span><span class="lm-t">${q.t}</span></button></li>`;
  }).join('')}</ol></nav>` : '';
  const cuerpo = p.k === 'res' ? lmResumen(l) : p.k === 'et' ? lmEtapa(l, p.i) : p.k === 'cie' ? lmCierre(l) : lmMermas(l);
  const pie = `<div class="lm-pie">${L.paso > 0 ? `<button type="button" class="btn" data-act="lmNav" data-d="-1"><span aria-hidden="true">←</span>Anterior</button>` : '<span></span>'}${L.paso < n - 1 ? `<button type="button" class="btn pri" data-act="lmNav" data-d="1">Siguiente<span class="lm-sn">: ${pasos[L.paso + 1].t}</span>${ic('arrow', 16)}</button>` : `<button type="button" class="btn ${n > 1 ? 'pri' : ''}" data-act="closeModal">${n > 1 ? 'Terminar' : 'Cerrar'}</button>`}</div>`;
  modal(`Lote ${l.id} ${cerrado ? chip('Cerrado', 'ok') : chip('En proceso', 'info')}`, `${marcas}<div class="lm-c"><h3 id="lm-h" tabindex="-1">${n > 1 ? `<span class="lm-cnt">Paso ${L.paso + 1} de ${n}</span> ` : ''}${p.k === 'res' ? 'Resumen del lote' : p.k === 'et' ? `Etapa ${p.i + 1} de ${ETAPAS.length}: ${ETAPAS[p.i]}` : p.k === 'cie' ? 'Cierre del lote' : 'Mermas de este lote'}</h3>${cuerpo}</div>${pie}`);
  const box = $('#modal .mbox'); if (box) box.classList.add('lm');
  const t = foco && $(foco) || $('#lm-h'); if (t) t.focus({preventScroll: true});
}

function lmResumen(l) {
  const ev = lmEvs(l), mUsd = sum(ev, e => e.usd), cerrado = l.estado === 'Cerrado' && l.granel, cuando = l.ts ? new Date(l.ts).toLocaleString('es-VE', {dateStyle: 'medium', timeStyle: 'short'}) : fd(l.fecha);
  const cierre = l.cerro || l.tsCierre ? `${l.cerro ? esc(l.cerro) : 'Sin datos'}${l.tsCierre ? ' · ' + new Date(l.tsCierre).toLocaleString('es-VE', {dateStyle: 'medium', timeStyle: 'short'}) : ''}` : '';
  return `<dl class="kv">
    <div><dt>Papa que entró</dt><dd>${lmKg(l.cruda)}</dd></div>
    <div><dt>Proveedor</dt><dd style="font-size:15px">${esc(prov(l.prov).nombre)}<small>Compra ${esc(l.compra)}</small></dd></div>
    <div class="hl"><dt>Rendimiento actual</dt><dd>${cerrado ? pct(l.granel / l.cruda * 100) : lmNd}${cerrado ? '' : '<small>Se calcula al cerrar el lote</small>'}</dd></div>
    <div><dt>Papa frita a granel</dt><dd>${cerrado ? lmKg(l.granel) : lmNd}</dd></div>
    <div><dt>Aceite consumido</dt><dd>${cerrado && l.aceite ? lmKg(l.aceite) + `<small>${pct(l.aceite / l.granel * 100)} de la papa frita</small>` : lmNd}</dd></div>
    <div><dt>Dónde va</dt><dd style="font-size:15px">${cerrado ? 'Cerrado: pasó a empaque' : esc(l.etapa || 'Sin datos')}</dd></div>
    <div><dt>Lo abrió</dt><dd style="font-size:15px">${l.quien ? esc(l.quien) : lmNd}<small>${cuando}</small></dd></div>
    ${cierre ? `<div><dt>Lo cerró</dt><dd style="font-size:15px">${cierre}</dd></div>` : ''}
    <div><dt>Mermas anotadas</dt><dd>${ev.length ? ev.length + `<small>${usd(mUsd)} en total</small>` : 'Ninguna'}</dd></div>
  </dl>${lmPuede() ? '<p class="hint" style="margin-top:12px">Con «Siguiente» pasas por cada etapa, el cierre y las mermas.</p>' : `<p class="hint" style="margin-top:12px">${ic('lock', 16)} Tu puesto ve solo el resumen del lote. Quien lo registra es Producción o Gerencia.</p>`}`;
}

function lmEtapa(l, i) {
  const idx = lmIdx(l), m = mrLote(l), k = LM_CLAVE[i], ult = i === ETAPAS.length - 1;
  const hecha = idx > i, actual = idx === i && l.estado !== 'Cerrado';
  let ent = null, perd = null;
  if (hecha || actual) {
    if (k) { const st = m.st[k]; ent = st.ent; perd = st.lost; }
    else { const f = m.st.freido; ent = f.ent != null ? f.ent - f.lost : null; }
  }
  const estado = hecha ? chip('Terminada', 'ok') : actual ? chip('En curso', 'info') : chip('Todavía no llega', 'n');
  const turno = PR.proc && Array.isArray(PR.proc.etapas) && LM_TURNO[ETAPAS[i]] ? PR.proc.etapas.find(e => e.k === LM_TURNO[ETAPAS[i]]) : null;
  const sigue = ent != null && perd != null ? Math.max(0, ent - perd) : ent;
  const mp = k ? mrPuede(k) : false;
  return `<p>${estado}</p>
    <dl class="kv" style="margin-top:10px">
      <div><dt>Kilos que entraron</dt><dd>${ent != null ? lmKg(ent) : lmNd}</dd></div>
      <div><dt>Merma anotada</dt><dd>${k ? (perd != null ? (perd ? kg(perd, 1) : '0 kg') : lmNd) : '—'}</dd></div>
      <div class="hl"><dt>Kilos que siguen</dt><dd>${sigue != null ? lmKg(sigue) : lmNd}</dd></div>
    </dl>
    ${turno ? `<p class="hint" style="margin-top:10px">En la planta, sumando todos los lotes y turnos: hay <b>${prKg(turno.saldo_kg)}</b> en esta etapa (entraron ${prKg(turno.entra_kg)}, salieron ${prKg(turno.sale_kg)}).</p>` : ''}
    ${ent == null && !hecha && !actual ? `<p class="hint" style="margin-top:10px">Esta etapa empieza cuando termines «${ETAPAS[i - 1]}».</p>` : ''}
    <div class="btnrow" style="margin-top:14px">
      ${actual && !ult ? `<button type="button" class="btn pri xl" data-act="avanzarEtapa" data-id="${l.id}">${ic('check')}Terminé esta etapa: pasar a «${ETAPAS[i + 1]}»</button>` : ''}
      ${actual && ult ? '<p class="hint">Es la última etapa. Cuando la papa esté lista, sigue con el cierre del lote.</p>' : ''}
      ${(hecha || actual) && mp ? `<button type="button" class="btn" data-act="lmMermaEt" data-i="${i}">${ic('plus', 16)}Anotar una merma de esta etapa</button>` : ''}
    </div>`;
}

function lmCierre(l) {
  if (l.estado === 'Cerrado') {
    const g = +l.granel || 0, a = +l.aceite || 0, r = l.cruda > 0 ? g / l.cruda * 100 : 0, ap = g ? a / g * 100 : 0;
    return `<p>${chip('Lote cerrado', 'ok')}</p><dl class="kv" style="margin-top:10px"><div><dt>Papa frita a granel</dt><dd>${lmKg(l.granel)}</dd></div><div><dt>Aceite consumido</dt><dd>${l.aceite ? kg(l.aceite) : lmNd}</dd></div>
      <div class="hl"><dt>Rendimiento</dt><dd>${g ? pct(r) : lmNd}</dd></div><div class="hl"><dt>Aceite / kg papa frita</dt><dd>${g && a ? pct(ap) : lmNd}</dd></div></dl>
      <p style="margin-top:8px">${g ? (r < 24 ? chip('Rendimiento bajo: revisar el lote', 'crit') : chip('Rendimiento normal', 'ok')) : ''} ${a && g ? (ap > 45 ? chip('Aceite sobre 45 %', 'warn') : chip('Aceite en rango', 'ok')) : ''}</p>
      <p class="hint" style="margin-top:10px">Ya pasó a empaque. Si hubo mermas después de pesar, anótalas en el siguiente paso.</p>`;
  }
  const f = S.lotForm;
  return `<div class="form"><p class="hint">Papa cruda que entró: <b>${kg(l.cruda)}</b>. Pesa la papa frita a granel y el aceite que se gastó.</p>
    <label class="fld">Kg de papa frita a granel<input id="lf-granel" class="big" type="number" inputmode="decimal" data-k="lotForm.granel" value="${f.granel}"></label>
    <label class="fld">Kg de aceite consumido<input id="lf-aceite" class="big" type="number" inputmode="decimal" data-k="lotForm.aceite" value="${f.aceite}"></label>
    <div id="lot-calc">${lotCalcHTML()}</div>
    <button type="button" class="btn pri xl" data-act="cerrarLote" data-id="${l.id}">${ic('check')}Cerrar lote y pasar a empaque</button></div>`;
}

/* ---------- Mermas del lote: mismo formulario y mismo servicio que la pantalla de Mermas ---------- */
const lmEtapasMerma = l => mrEtapasMias().filter(e => e.og.kind === 'lote' && e.u.includes('kg') && !e.decl && (MR_PRE.includes(e.k) || l.granel));
function lmMermas(l) {
  const ets = lmEtapasMerma(l), f = S.mrForm, evs = lmEvs(l).slice().reverse();
  const lista = evs.length ? `<ul class="list lm-merl">${evs.map(e => `<li><div class="l-main"><p class="l-t">${esc((mrEt(e.et) || {t: e.et}).t)} · ${N1.format(e.kg)} kg${e.usd ? ' · ' + usd(e.usd) : ''}</p><p class="l-s">${esc(e.causa)} · ${esc(e.quien || '')} · ${fd(e.f)}${e.obs ? ' · ' + esc(e.obs) : ''}</p></div></li>`).join('')}</ul>` : '<p class="hint">Todavía no hay mermas anotadas en este lote.</p>';
  if (!ets.length) return `${lista}<p class="hint" style="margin-top:10px">${ic('lock', 16)} Tu puesto no anota mermas de este lote. Pídelo a Producción.</p>`;
  if (!ets.find(e => e.k === f.etapa)) { f.etapa = (ets.find(e => e.k === LM_CLAVE[Math.min(lmIdx(l), 2)]) || ets[0]).k; mrReset(); }
  f.un = 'kg'; f.og = l.id; mrFix(); f.og = l.id;
  const cs = mrCausas(), e = mrEt(f.etapa);
  return `${lista}<div class="form lm-mf" id="lm-mr" style="margin-top:14px"><h4 class="lm-h4">Anotar una merma</h4>
    <label class="fld">Etapa donde se perdió<select id="mr-et" data-act-change="lmMrEtapa">${ets.map(x => `<option value="${x.k}" ${x.k === f.etapa ? 'selected' : ''}>${x.t}</option>`).join('')}</select><small>${e ? e.hint : ''}</small></label>
    <div class="row2"><label class="fld">Kg perdidos<input id="mr-cant" class="big" type="number" inputmode="decimal" min="0" data-k="mrForm.cant" value="${f.cant}"></label>
    <label class="fld">Causa<select id="mr-causa" data-k="mrForm.causa">${cs.map(c => `<option value="${esc(c)}" ${c === f.causa ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label></div>
    <label class="fld">Observación (opcional)<input id="mr-obs" type="text" maxlength="160" data-k="mrForm.obs" value="${esc(f.obs)}"></label>
    <div id="mr-calc">${mrCalcHTML()}</div>
    ${S.mrErr ? `<p class="err" role="alert">${ic('alert')}${S.mrErr}</p>` : ''}
    <button type="button" class="btn pri xl" data-act="regMerma">${ic('check')}Registrar merma</button>
    <p class="hint">Queda guardada sin aprobación y se avisa a Gerencia y Administración.</p></div>`;
}

/* ---------- Después de guardar ---------- */
function lmTrasAvanzar(id, etapa) { if (!S.lm || S.lm.id !== id) return; S.lm.over = {etapa}; S.lm.paso = Math.min(S.lm.paso + 1, lmPasos(lmLote()).length - 1); lmPintar(); }
function lmTrasCerrar(id, g, a) { if (!S.lm || S.lm.id !== id) return; S.lm.over = {estado: 'Cerrado', etapa: null, granel: g, aceite: a}; const n = lmPasos(lmLote()).length; S.lm.paso = n - 1; S.lm.max = n - 1; S.mrErr = ''; lmPintar(); }
async function lmTrasMerma(id) {
  const L = S.lm; if (!L) return;
  await waitFor(() => (S.mermas || []).some(m => m.id === id), 4000);
  if (S.lm !== L) return; S.mrErr = ''; S.mrForm.cant = ''; S.mrForm.obs = ''; lmPintar('#mr-cant');
}

/* ---------- Acciones ---------- */
Object.assign(ACT, {
  lmAbrir: el => lmAbrir(el),
  lmIr: el => { const L = S.lm; if (!L) return; const i = +el.dataset.i; if (i <= L.max) { L.paso = i; S.mrErr = ''; lmPintar(); } },
  lmNav: el => { const L = S.lm; if (!L) return; L.paso += +el.dataset.d; S.mrErr = ''; lmPintar(); },
  lmMermaEt: el => { const L = S.lm; if (!L) return; const l = lmLote(), j = lmPasos(l).findIndex(x => x.k === 'mer'); if (j < 0) return; L.paso = j; L.max = Math.max(L.max, j); S.mrErr = ''; lmPintarMer(LM_CLAVE[+el.dataset.i]); },
  lmMrEtapa: el => { if (!S.lm) return; S.mrForm.etapa = el.value; S.mrErr = ''; mrReset(); lmPintar('#mr-et'); }
});
function lmPintarMer(k) {
  const l = lmLote(); if (!l) return; const ets = lmEtapasMerma(l);
  if (ets.find(e => e.k === k)) { S.mrForm.etapa = k; S.mrForm.cant = ''; mrReset(); }
  lmPintar('#mr-cant');
}
Object.assign(window, {lmLote, lmPintar, lmAlCerrar, lmTrasAvanzar, lmTrasCerrar, lmTrasMerma});

/* Teclado: Tab se queda dentro de la ventana mientras el lote está abierto */
document.addEventListener('keydown', e => {
  if (e.key !== 'Tab' || !S.lm) return; const m = $('#modal'); if (!m || m.hidden) return;
  const fs = [...m.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.offsetParent !== null); if (!fs.length) return;
  const a = document.activeElement, i = fs.indexOf(a);
  if (e.shiftKey && (i <= 0)) { e.preventDefault(); fs[fs.length - 1].focus(); } else if (!e.shiftKey && (i === fs.length - 1 || i < 0 && a && !m.contains(a))) { e.preventDefault(); fs[0].focus(); }
});

/* ---------- Tarjetas por etapa (pantalla Producir) ---------- */
S.pe = null;   // null = tarjetas; número = etapa abierta; 'todos' = lista completa
const peClave = i => LM_CLAVE[i];
function peDatos(i, st) {
  const ls = S.lotes.filter(l => l.estado === 'En proceso' && l.etapa === ETAPAS[i]);
  const k = peClave(i), x = k ? st.find(o => o.k === k) : null;
  const sem = x && x.n > 0 && x.pct != null ? (x.sem.t === 'ok' ? 'ok' : 'warn') : null;   // solo verde o ámbar
  return {ls, kilos: ls.length ? sum(ls, l => l.cruda) : null, pct: x && x.pct != null ? x.pct : null, sem};
}
/* Empaque: lotes cerrados con empaque iniciado (o cerrados hace poco) y kilos de papa frita todavía sin empacar */
function peEmp(st) {
  const E = rows('empaques'), x = st.find(o => o.k === 'empaque'), por = {};
  E.forEach(e => { const o = (por[e.lote] ||= {kg: 0, und: 0}); o.kg += +e.kg || 0; o.und += +e.und || 0; });
  const ls = S.lotes.filter(l => l.estado === 'Cerrado' && l.granel && l.granel - (por[l.id] ? por[l.id].kg : 0) > 0.5 && (por[l.id] || l.fecha >= addDays(HOY_ISO, -3)));
  const falta = sum(ls, l => l.granel - (por[l.id] ? por[l.id].kg : 0)), hecho = sum(ls, l => por[l.id] ? por[l.id].kg : 0);
  return {ls, kilos: ls.length ? falta : null, hecho, pct: x && x.pct != null ? x.pct : null, sem: x && x.n > 0 && x.pct != null ? (x.sem.t === 'ok' ? 'ok' : 'warn') : null, emp: true};
}
const peNombre = i => i === 4 ? 'Empaque' : ETAPAS[i];
const PE_ET = ['Pelado', 'Corte', 'Freído', 'Enfriado', 'Empaque'];
S.peVerTodos = false;
/* Estado de un lote en el recorrido: i = etapa actual (0-3 en la línea, 4 = por empacar, 5 = terminado) */
function peEstado(l, porEmp) {
  if (l.estado === 'En proceso') { const i = Math.max(0, ETAPAS.indexOf(l.etapa)); return {i, sigue: 'Sigue: ' + ETAPAS[i], pend: true}; }
  if (porEmp[l.id]) return {i: 4, sigue: 'Por empacar', pend: true};
  return {i: 5, sigue: 'Terminado', pend: false};
}
function peMini(i, st) {
  const d = i === 4 ? peEmp(st) : peDatos(i, st);
  return `<li class="pe-m ${d.sem || ''}"><h3>${peNombre(i)}</h3><p class="pe-mk">${d.kilos != null ? kg(d.kilos) : 'Sin kilos'}<span> · ${d.ls.length} ${d.ls.length === 1 ? 'lote' : 'lotes'}</span></p>
    <p class="pe-mm">${d.pct != null ? 'Merma 30 días: <b>' + pct(d.pct) + '</b>' : 'Sin datos de merma'}</p></li>`;
}
function peFila(l, porEmp) {
  const e = peEstado(l, porEmp), kil = l.estado === 'En proceso' ? l.cruda : (porEmp[l.id] ? porEmp[l.id].falta : l.granel);
  const barra = PE_ET.map((n, k) => `<li class="${k < e.i ? 'done' : k === e.i ? 'cur' : 'pend'}"><i></i><span>${n}</span></li>`).join('');
  return `<li><button type="button" class="pe-lote${e.pend ? ' hl' : ''}" data-act="peLote" data-id="${l.id}" aria-label="Lote ${l.id}, ${e.sigue}. Abrir">
    <span class="pe-l1"><b class="mono">${l.id}</b><small>${fd(l.fecha)}</small></span>
    <ol class="pe-bar">${barra}</ol>
    <span class="pe-l3"><b>${kil != null ? kg(kil) : lmNd}</b><small>${e.sigue}</small></span><span class="pe-chev" aria-hidden="true">›</span></button></li>`;
}
function peHTML(proc) { return `<section class="pe-wrap">${peHTML0(proc)}</section>`; }
function peHTML0() {
  const w = mr30(), st = mrStages(w.a, w.z), E = peEmp(st), porEmp = {};
  E.ls.forEach(l => { const g = l.granel - sum(rows('empaques').filter(x => x.lote === l.id), x => +x.kg || 0); porEmp[l.id] = {falta: g}; });
  const pri = S.lotes.filter(l => l.estado === 'En proceso' || porEmp[l.id]).sort((a, b) => (b.ts || 0) - (a.ts || 0) || (a.fecha < b.fecha ? 1 : -1));
  const resto = S.lotes.filter(l => !pri.includes(l)).sort((a, b) => (b.ts || 0) - (a.ts || 0) || (a.fecha < b.fecha ? 1 : -1));
  const todos = pri.concat(resto), N = Math.max(6, pri.length), lista = S.peVerTodos ? todos : todos.slice(0, N);
  return `<div class="pe-top"><div><h2 class="pe-h">Lotes en producción</h2><p class="pe-hint">${lmPuede() ? 'Toca un lote para ver su recorrido y anotar lo que sigue.' : 'Toca un lote para ver su recorrido.'}</p></div>${lmPuede() ? '<button type="button" class="btn pe-nuevo" data-act="peNuevo">+ Abrir lote nuevo</button>' : ''}</div>
  <ul class="pe-mini" aria-label="Resumen por etapa">${[0, 1, 2, 3, 4].map(i => peMini(i, st)).join('')}</ul>
  ${todos.length ? `<ul class="pe-lista">${lista.map(l => peFila(l, porEmp)).join('')}</ul>` : '<p class="hint">Todavía no hay lotes. Abre el primero con «+ Abrir lote nuevo».</p>'}
  ${todos.length > N ? `<p class="pe-mas"><button type="button" class="btn sm" data-act="peVerTodos">${S.peVerTodos ? 'Ver menos' : 'Ver todos (' + todos.length + ')'}</button></p>` : ''}`;
}
Object.assign(ACT, {
  peLote: el => {
    const id = el.dataset.id, l = S.lotes.find(x => x.id === id); if (!l) return;
    if (l.estado !== 'En proceso') { const e = peEmp(mrStages(mr30().a, mr30().z)); if (e.ls.some(x => x.id === id) && lvl('empaque') >= 2) return ACT.peEmpLote(el); return lmAbrir(el, id); }
    lmAbrir(el, id, lmPuede() ? Math.max(0, ETAPAS.indexOf(l.etapa)) + 1 : undefined);
  },
  peVerTodos: () => { S.peVerTodos = !S.peVerTodos; render(); },
  peEmpLote: el => { if (lvl('empaque') < 2) return toast('Tu puesto no registra empaque.', 'warn'); S.empForm.lote = el.dataset.id; S.empErr = ''; enter('empaque'); },
  peNuevo: () => peNuevoPintar()
});
/* Abrir lote nuevo: ventana emergente con el mismo formulario de siempre (pueden estar varios lotes en proceso) */
function peNuevoPintar() {
  const f = S.lotForm, ops = papaOps();
  modal('Abrir lote nuevo', ops.length ? `<div class="form"><p class="hint">Elige la compra de papa y cuántos kg entran a la línea. El lote empieza en «${ETAPAS[0]}».</p>
    <label class="fld">Compra de papa que alimenta el lote<select id="lf-compra" data-k="lotForm.compra">${ops.map(c => `<option value="${c.id}" ${c.id === f.compra ? 'selected' : ''}>${c.id} · ${esc(prov(c.prov).nombre)} · ${kg(c.kgRec ?? c.qf)}</option>`).join('')}</select></label>
    <label class="fld">Kg de papa cruda que entran a la línea<input id="lf-cruda" class="big" type="number" inputmode="decimal" data-k="lotForm.cruda" value="${f.cruda}"><small>Se descuentan del almacén de materia prima</small></label>
    ${S.lotMsg ? `<p class="err" role="alert">${ic('alert')}${S.lotMsg}</p>` : ''}
    <button type="button" class="btn pri xl" data-act="abrirLote">${ic('flame')}Abrir lote</button></div>` : emptyState('No hay papa disponible para un lote', 'Hace falta una compra de papa ya validada y en el almacén (Compras de materia prima).'));
  const t = $('#lf-cruda') || $('#modal .iconbtn'); if (t) t.focus();
}
const _abrir = ACT.abrirLote;
ACT.abrirLote = async el => {
  const id = await _abrir(el), m = $('#modal');
  if (typeof id === 'string') { closeModal(); S.pe = null; render(); }
  else if (m && !m.hidden && m.querySelector('#lf-cruda')) peNuevoPintar();
};
Object.assign(window, {peHTML});
