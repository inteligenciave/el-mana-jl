/* Fase 6 · Panel ejecutivo de Producción: consumo real de insumos, kilos producidos contra consumo y mermas.
   Filtros que se combinan: Turno (Diurno/Nocturno), Día, Semana y Mes. Sin dinero. Lo ven Gerencia, Administración y supervisores.
   El mínimo de cada insumo es UNO solo (el del inventario): se cambia en el Resumen de Gerencia o de Administración. Comparte el ámbito de p-prod.js. */
Object.assign(PR, {pan: null, pf: {turno: '', dia: '', semana: '', mes: ''}, panArr: null});
const prPanQ = () => Object.entries(PR.pf).filter(([, v]) => v).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
const prPct = v => v == null ? '—' : prN(v, 1) + ' %';
function prPanFiltros() {
  const f = PR.pf;
  return `<div class="pr-filtros form"><label class="fld">Turno<select id="pp-turno"><option value="">Todos</option>${['Diurno', 'Nocturno'].map(t => `<option ${f.turno === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="fld">Día<input type="date" id="pp-dia" value="${prT(f.dia)}"></label><label class="fld">Semana (cualquier día de ella)<input type="date" id="pp-semana" value="${prT(f.semana)}"></label>
    <label class="fld">Mes<input type="month" id="pp-mes" value="${prT(f.mes)}"></label>
    <div class="btnrow"><button type="button" class="btn pri" data-act="prPanAplicar">Ver</button><button type="button" class="btn" data-act="prPanLimpiar">Quitar filtros</button></div>
    <p class="hint">Los filtros se combinan. Sin ninguno se muestra el mes actual.</p></div>`;
}
function scrPanel() {
  const q = prPanQ(), w = prEspera('Panel', 'pan', '/panel' + (q ? '?' + q : ''), 'pan'); if (w) return `${w}${prPanFiltros()}`;
  const P = PR.pan, pr = P.produccion, f = P.filtros;
  const filas = P.filas.length ? `<div class="tabla-scroll"><table class="tbl"><thead><tr><th>Día</th><th>Turno</th><th>Papa tomada</th><th>Producido</th><th>Merma</th><th>Merma %</th></tr></thead><tbody>${P.filas.map(x => `<tr><td>${prT(prFe(x.fecha))}</td><td>${prT(x.jornada || '—')}</td><td>${prKg(x.papa_tomada_kg)}</td><td>${prKg(x.kilos_producidos)}</td><td>${prKg(x.merma_kg)}${x.merma_consolidada ? '' : ' <span class="muted">(por etapa)</span>'}</td><td>${prPct(x.merma_pct)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No hay turnos con esos filtros.</p>';
  return `${ph('Producción', 'Panel de producción', 'Qué se consumió, qué se produjo y cuánto se perdió. Combina turno, día, semana y mes.', '')}${prPanFiltros()}
    <p class="hint">Viendo: ${[f.turno, f.dia && 'día ' + prFe(f.dia), f.semana && 'semana de ' + prFe(f.semana), f.mes && 'mes ' + prFe(f.mes)].filter(Boolean).map(prT).join(' · ') || 'todo'} · ${prN(P.turnos)} turno(s)</p>
    ${card('Consumo real', `<ul class="pr-lin">${P.consumo.map(c => `<li><span>${prT(c.nombre)}</span><b>${prN(c.cantidad, c.cantidad % 1 ? 1 : 0)} ${prT(c.unidad)}</b></li>`).join('')}</ul>`)}
    ${card('Producido contra consumo y mermas', `<ul class="pr-lin"><li><span>Papa tomada</span><b>${prKg(pr.papa_tomada_kg)}</b></li><li><span>Kilos producidos</span><b>${prKg(pr.kilos_producidos)}</b></li><li><span>Rendimiento</span><b>${prPct(pr.rendimiento_pct)}</b></li><li><span>Merma</span><b>${prKg(pr.merma_kg)}</b></li><li><span>Merma sobre papa tomada</span><b>${prPct(pr.merma_pct)}</b></li></ul>`)}
    ${card('Por turno', filas)}`;
}
Object.assign(PERM_DEF, {'pr-panel': 'produccion:1 empaque:1 adm:2'});
SCREENS['pr-panel'] = {mod: 'prod', g: 'Turno', t: 'Panel de producción', s: 'Panel', ic: 'chart', r: scrPanel};
S.perm = permInit();
Object.assign(ACT, {
  prPanAplicar: () => { PR.pf = {turno: $('#pp-turno').value, dia: $('#pp-dia').value, semana: $('#pp-semana').value, mes: $('#pp-mes').value}; PR.pan = null; render(); },
  prPanLimpiar: () => { PR.pf = {turno: '', dia: '', semana: '', mes: ''}; PR.pan = null; render(); }
});
