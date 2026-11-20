/* Pantalla Producir: dos pestañas, «Producir» (turno activo, requisitos y etapas; p-asistente.js) y «Resumen» (Turno, Día, Semana, Mes; sin dinero). Usa /api/p/resumen. Comparte el ámbito de p-prod.js. */
Object.assign(PR, {rp: 'turno', rs: {}, rsRol: null, vista: 'producir'});
const prRpNom = {turno: 'Turno', dia: 'Día', semana: 'Semana', mes: 'Mes'};
const prCant = (n, u) => prN(n) + ' ' + u + (n === 1 ? '' : 's');
const prPctS = v => v == null ? 'Sin datos' : prN(v, 1) + ' %';
function prRpCargar(k) {
  const r = PR.rs[k]; if ((r && Date.now() - r.t < 20000) || PR.cargando['rs' + k]) return; PR.cargando['rs' + k] = true;
  prApi('GET', '/resumen?periodo=' + k).then(d => { PR.rs[k] = {t: Date.now(), d}; }).catch(e => { console.error(e); PR.rs[k] = {t: Date.now(), d: {error: e.message}}; }).finally(() => { PR.cargando['rs' + k] = false; render(); });
}
function prRpCuando(d) {
  if (d.periodo === 'turno') return d.turno ? 'Turno ' + (d.turno.jornada ? d.turno.jornada + ' · ' : '') + 'del ' + prFe(d.turno.fecha) + (d.turno.estado === 'ABIERTO' ? ' (abierto ahora)' : ' (cerrado)') : '';
  if (d.periodo === 'dia') return 'Hoy, ' + prFe(d.desde);
  if (d.periodo === 'semana') return 'Esta semana: del ' + prFe(d.desde) + ' al ' + prFe(d.hasta);
  return 'Este mes: ' + prFe(d.ref.slice(0, 7));
}
function prRpAvisos(d) {
  const av = d.avisos || [];
  return card('Avisos', av.length ? `<ul class="pr-avs">${av.map(a => `<li class="${a.nivel === 'rojo' ? 'mal' : 'warn'}"><b>${prT(a.titulo)}</b><span>${prT(a.texto)}</span></li>`).join('')}</ul>` : '<p class="muted">Sin avisos: todo en orden.</p>', {cls: 'pr-avcard'});
}
function prRpTarjetas(d) {
  const pr = d.produccion, e = d.empaque, hayEmp = e.productos.length > 0;
  const emp = hayEmp ? `<ul class="pr-lin">${e.bultos > 0 ? `<li><span>Papas</span><b>${prCant(e.bultos, 'bulto')}</b></li>` : ''}${e.paquetes > 0 ? `<li><span>Salsas</span><b>${prCant(e.paquetes, 'paquete')}</b></li>` : ''}</ul>` : '<p class="muted">Aún no hay bultos ni paquetes anotados.</p>';
  const me = d.merma_etapas || [], ver = PR.mermaTodas ? me : me.slice(0, 3), usd = v => '$ ' + prN(v, 2);
  const lista = me.length ? `<ul class="pr-lin pr-mer">${ver.map(x => `<li><span>${prT(x.nombre)}</span><b>${prKg(x.kg)}${x.costo_usd != null ? ' · ' + usd(x.costo_usd) : ''}</b></li>`).join('')}</ul>${me.length > 3 ? `<button type="button" class="btn sm" data-act="prMerTodas">${PR.mermaTodas ? 'Ver menos' : 'Ver todas (' + me.length + ')'}</button>` : ''}` : '<p class="muted">Sin datos de merma por etapa.</p>';
  const sin = d.sin_explicar_kg && Math.abs(d.sin_explicar_kg) > 0.0004 ? `<li><span>Sin explicar</span><b>${prKg(d.sin_explicar_kg)}</b></li>` : '';
  return `<div class="pr-rg">
    ${card('Producido', `<p class="pr-big">${prKg(pr.kilos_producidos)}</p>${emp}`)}
    ${card('Merma', `<p class="pr-big">${prKg(pr.merma_kg)}</p><ul class="pr-lin"><li><span>Sobre la papa tomada</span><b>${prPctS(pr.merma_pct)}</b></li>${sin}${d.costo_merma_usd != null ? `<li><span>Costo de la merma</span><b>${usd(d.costo_merma_usd)}</b></li>` : ''}</ul><p class="pr-sub">Merma por etapa</p>${lista}`)}
    ${card('Papa y rendimiento', `<p class="pr-big">${prKg(pr.papa_tomada_kg)}</p><ul class="pr-lin"><li><span>Papa tomada del inventario</span><b>${pr.papa_tomada_kg > 0 ? 'Sí' : 'Nada'}</b></li><li><span>Rendimiento (producto ÷ papa usada)</span><b>${prPctS(pr.rendimiento_pct)}</b></li></ul>`)}
    ${card('Personal y turnos', `<p class="pr-big">${d.personas > 0 ? prCant(d.personas, 'persona') : 'Sin datos'}</p><ul class="pr-lin"><li><span>Turnos cerrados</span><b>${prN(d.turnos_cerrados)} de ${prN(d.turnos)}</b></li></ul>`)}</div>`;
}
function scrResumenProd() {
  if (PR.rsRol !== S.rol) { PR.rsRol = S.rol; PR.rs = {}; PR.rp = 'turno'; }
  prRpCargar(PR.rp); if (window.prMerEtCargar) window.prMerEtCargar();
  const tabs = `<div class="pr-rtabs" role="tablist" aria-label="Periodo del resumen">${Object.keys(prRpNom).map(k => `<button type="button" role="tab" class="btn ${PR.rp === k ? 'pri' : ''}" data-act="prRpTab" data-k="${k}" aria-selected="${PR.rp === k}">${prRpNom[k]}</button>`).join('')}</div>`;
  const r = PR.rs[PR.rp]; let cuerpo;
  /* Orden: 1) gráficas y comparativos, 2) lo producido, merma, papa, personal, 3) al final los avisos, y «Exportar este reporte» */
  const graf = typeof cpPanel === 'function' ? cpPanel('pr-resumen') : '';
  if (!r) cuerpo = card('', emptyState('Cargando el resumen…', 'Un momento.'));
  else if (r.d.error) cuerpo = card('', emptyState('No se pudo cargar', prT(r.d.error)));
  else if (!r.d.turnos) cuerpo = graf + `<p class="hint">${PR.rp === 'turno' ? '' : prT(prRpCuando(r.d))}</p>` + card('', emptyState(PR.rp === 'turno' ? 'Todavía no hay turnos' : PR.rp === 'dia' ? 'Hoy no hay turnos' : PR.rp === 'semana' ? 'Esta semana no hay turnos' : 'Este mes no hay turnos', 'Cuando se produzca, aquí aparecen los kilos, la merma y el personal.')) + prRpAvisos(r.d);
  else cuerpo = graf + `<p class="hint">${prT(prRpCuando(r.d))}</p>${prRpTarjetas(r.d)}${prRpAvisos(r.d)}`;
  if (r && !r.d.error && can('planta') && typeof expBar === 'function') cuerpo += expBar('planta');
  if (S.rol === 'dueno') cuerpo += prCorrTarjeta();
  return tabs + cuerpo;
}
function scrProducir() {
  if (!window.__EM_HTTP) return ph('Producción', 'Producir', '', '') + card('', emptyState('Este módulo necesita el servidor', 'Funciona en la versión con base de datos.'));
  const tab = (k, n) => `<button type="button" role="tab" class="btn ${PR.vista === k ? 'pri' : ''}" data-act="prVista" data-k="${k}" aria-selected="${PR.vista === k}">${n}</button>`;
  return `${ph('Producción', 'Producir', '', '')}<div class="pr-vtabs" role="tablist" aria-label="Producir">${tab('producir', 'Producir')}${tab('resumen', 'Resumen')}</div>${PR.vista === 'resumen' ? scrResumenProd() : scrAsistente()}`;
}
SCREENS['pr-turno'].r = scrProducir;
Object.assign(ACT, {
  prRpTab: el => { PR.rp = prRpNom[el.dataset.k] ? el.dataset.k : 'turno'; render(); },
  prMerTodas: () => { PR.mermaTodas = !PR.mermaTodas; render(); },
  prVista: el => { PR.vista = el.dataset.k === 'resumen' ? 'resumen' : 'producir'; render(); }
});

/* Exportar «Merma del proceso por etapa»: las filas salen del servidor (no de los datos viejos del navegador). Se cargan una vez y se refrescan cada medio minuto. */
window.prMerEtCargar = function () {
  const c = window.__MERMA_ET; if (c && Date.now() - c.t < 30000) return c.filas; if (window.__MERMA_ET_BUSY) return c ? c.filas : [];
  window.__MERMA_ET_BUSY = true;
  prApi('GET', '/merma-etapas').then(d => { window.__MERMA_ET = {t: Date.now(), filas: d.filas || []}; }).catch(e => { console.error(e); window.__MERMA_ET = {t: Date.now(), filas: []}; }).finally(() => { window.__MERMA_ET_BUSY = false; });
  return c ? c.filas : [];
};

/* El Gerente corrige la merma de un turno ya cerrado (con una nota obligatoria): lista de turnos cerrados y ventana con una fila por etapa */
function prCorrTarjeta() {
  if (!PR.ult) { prCargar('ult', '/turno', 'ult'); return card('Turnos cerrados', emptyState('Cargando…', 'Un momento.')); }
  const L = (PR.ult.ultimos || []);
  return card('Corregir la merma de un turno cerrado', L.length ? `<ul class="pr-lin">${L.map(u => `<li><span>${prT(prFe(u.fecha))}</span><button type="button" class="btn sm" data-act="prCorrAbrir" data-id="${u.id_turno}">Corregir merma</button></li>`).join('')}</ul>` : '<p class="muted">Todavía no hay turnos cerrados.</p>');
}
async function prCorrAbrir(id) {
  let M; try { M = await prApi('GET', '/turnos/' + id + '/merma'); } catch (e) { return toast(esc(e.message), 'err'); }
  PR.corr = M; const por = new Map((M.registrada && M.registrada.filas || []).map(f => [f.etapa, f]));
  const fila = e => { const f = por.get(e.k) || {}; return `<li class="pr-mf-row" data-e="${prT(e.k)}"><div class="pr-mf-h"><label><b>${prT(e.nombre)}</b></label><span class="pr-mf-in"><input type="text" inputmode="decimal" class="pc-k" data-e="${prT(e.k)}" value="${prT(f.kilos ? prIn(f.kilos) : '')}" placeholder="0" aria-label="Kilos en ${prT(e.nombre)}"><span class="muted">kg</span></span></div>
    <div class="pr-mf-m"><select class="pc-m" data-e="${prT(e.k)}" aria-label="Motivo en ${prT(e.nombre)}"><option value="">Motivo</option>${M.motivos.map(m => `<option value="${m.id}" ${f.id_motivo === m.id ? 'selected' : ''}>${prT(m.nombre)}</option>`).join('')}</select><input type="text" class="pc-t" data-e="${prT(e.k)}" maxlength="120" placeholder="¿Qué fue? (si es «Otra»)" value="${prT(f.texto || '')}"></div></li>`; };
  modal('Corregir la merma · ' + prFe(M.fecha), `<div class="form"><p>Merma calculada: <b>${prKg(M.calculada_kg)}</b>. Anotada: <b>${M.registrada ? prKg(M.registrada.kilos) : '—'}</b>.</p><ul class="pr-mf-l">${M.etapas.map(fila).join('')}</ul>
    <label class="fld">Por qué no cuadra (si la suma difiere)<input type="text" id="pc-nota" maxlength="200" value="${prT(M.registrada && M.registrada.nota || '')}"></label>
    <label class="fld">Por qué corriges este turno cerrado (obligatorio)<input type="text" id="pc-corr" maxlength="200"></label><p class="err" id="pc-e" role="alert" hidden></p>
    <div class="btnrow"><button type="button" class="btn pri" data-act="prCorrGuardar" data-id="${id}">Guardar corrección</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`);
}
async function prCorrGuardar(id) {
  if (PR.busy) return; const M = PR.corr, filas = [];
  for (const e of M.etapas) { const k = document.querySelector('.pc-k[data-e="' + e.k + '"]'), kg = prNum(k && k.value); if (kg > 0) filas.push({etapa: e.k, kilos: String(kg), id_motivo: document.querySelector('.pc-m[data-e="' + e.k + '"]').value || '', texto: document.querySelector('.pc-t[data-e="' + e.k + '"]').value});}
  PR.busy = true;
  try { await prApi('POST', '/turnos/' + id + '/merma/corregir', {filas, nota: $('#pc-nota').value, correccion: $('#pc-corr').value}); closeModal(); PR.ult = null; PR.res = null; PR.rs = {}; window.__MERMA_ET = null; toast('Merma corregida.'); render(); }
  catch (er) { const x = $('#pc-e'); if (x) { x.textContent = er.message; x.hidden = false; } else toast(esc(er.message), 'err'); } finally { PR.busy = false; }
}
Object.assign(ACT_REQ, {prCorrAbrir: ['pr-turno', 2], prCorrGuardar: ['pr-turno', 2]}); Object.assign(ACT_LBL, {prCorrGuardar: 'corregir la merma'}); WRITE_ACTS.add('prCorrGuardar');
Object.assign(ACT, {prCorrAbrir: el => prCorrAbrir(+el.dataset.id), prCorrGuardar: el => prCorrGuardar(+el.dataset.id)});
