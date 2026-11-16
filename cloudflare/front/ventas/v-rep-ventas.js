/* Reportes de ventas dentro de «Registro de ventas»: Por rubro, Por vendedor, Por zona y Por producto.
   Los datos los arma el servidor (/api/v/reportes/ventas) con los mismos documentos que el Registro. Aquí: periodo, buscador, tabla y descargas (Excel y PDF propios). */
const RV_TABS = [['rubro', 'Por rubro', 'Rubro', 'ventas-por-rubro'], ['vendedor', 'Por vendedor', 'Vendedor', 'ventas-por-vendedor'], ['zona', 'Por zona', 'Zona', 'ventas-por-zona'], ['producto', 'Por producto', 'Producto', 'ventas-por-producto']];
const RV_RANGOS = [['hoy', 'Hoy'], ['semana', 'Esta semana'], ['quincena', 'Quincena'], ['mes', 'Este mes'], ['pasado', 'Mes pasado']];
const rvVe = () => ['dueno', 'adm', 'ventas'].includes(S.rol);
const rvEstado = () => V.rv ||= {tab: 'rubro', rango: 'mes', desde: '', hasta: '', q: '', cache: {}, cargando: '', err: null, vend: (() => { try { return localStorage.getItem('elmana:miVendedor') || ''; } catch (e) { return ''; } })()};
const rv2 = n => String(n).padStart(2, '0');
function rvFijar(k) {
  const R = rvEstado(), h = vHoy(), [y, m, d] = h.split('-').map(Number); R.rango = k;
  if (k === 'hoy') [R.desde, R.hasta] = [h, h];
  else if (k === 'semana') [R.desde, R.hasta] = [vLunes(h), h];
  else if (k === 'quincena') [R.desde, R.hasta] = [h.slice(0, 8) + (d <= 15 ? '01' : '16'), h];
  else if (k === 'pasado') { const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1; [R.desde, R.hasta] = [py + '-' + rv2(pm) + '-01', VD.sumarDias(h.slice(0, 8) + '01', -1)]; }
  else [R.desde, R.hasta] = [h.slice(0, 8) + '01', h];
}
const rvClave = R => [R.tab, R.desde, R.hasta, S.rol === 'ventas' ? R.vend : ''].join('|');
async function rvCargar() {
  const R = rvEstado(); if (!R.desde) rvFijar(R.rango);
  if (R.desde > R.hasta) return;
  if (S.rol === 'ventas' && !R.vend) return;
  const k = rvClave(R), c = R.cache[k]; if (c && Date.now() - c.ts < 20000) return; if (R.cargando === k) return;
  R.cargando = k; R.err = null;
  try {
    const d = await vApi('GET', '/reportes/ventas' + vQS({agrupar: R.tab, desde: R.desde, hasta: R.hasta, vendedor: S.rol === 'ventas' ? R.vend : ''}));
    d.idx = d.filas.map(f => Busca.norm(f.nombre)); /* índice normalizado (sin tildes ni mayúsculas), construido UNA vez por carga */ d.ts = Date.now(); R.cache[k] = d;
  } catch (e) { R.err = e; }
  if (R.cargando === k) R.cargando = '';
  render();
}
function rvVisibles(d) {
  const q = Busca.norm(rvEstado().q); if (!q) return d.filas;
  const t = q.split(' ').filter(Boolean); return d.filas.filter((f, i) => t.every(w => d.idx[i].includes(w)));
}
function rvFilasTotales(d, vis) {
  const completo = vis.length === d.filas.length, ex = ['vendedor', 'zona'].includes(rvEstado().tab);
  if (completo) return {total: d.totales.total, kilos: d.totales.kilos, bultos: d.totales.bultos, pedidos: d.totales.pedidos, pct: d.totales.pct};
  const s = k => vis.reduce((a, f) => a + f[k], 0);
  return {total: Math.round(s('total') * 100) / 100, kilos: Math.round(s('kilos') * 1000) / 1000, bultos: s('bultos'), pedidos: ex ? s('pedidos') : null, pct: Math.round(s('pct') * 100) / 100};
}
function rvTablaHTML() {
  const R = rvEstado(), d = R.cache[rvClave(R)], t = RV_TABS.find(x => x[0] === R.tab);
  if (R.desde > R.hasta) return '<p class="v-alerta">La fecha «Desde» no puede ser posterior a «Hasta».</p>';
  if (S.rol === 'ventas' && !R.vend) return '<p class="hint">Elige tu nombre arriba para ver tus ventas.</p>';
  if (R.err) return `<p class="v-alerta">${ic('alert', 16)}${esc(R.err.message || 'No se pudo cargar el reporte.')}</p>`;
  if (!d) return '<p class="hint">Cargando el reporte…</p>';
  const vis = rvVisibles(d), T = rvFilasTotales(d, vis);
  return table([{h: t[2], f: f => `<b>${vtxt(f.nombre)}</b>`}, {h: 'Total vendido $', r: 1, f: f => vusd(f.total)}, {h: 'Kilos', r: 1, f: f => N2.format(f.kilos)}, {h: 'Bultos', r: 1, f: f => N0.format(f.bultos)}, {h: 'Pedidos', r: 1, f: f => N0.format(f.pedidos)}, {h: '% del total', r: 1, f: f => N2.format(f.pct) + ' %'}], vis,
    {empty: Busca.norm(R.q) ? 'Nada coincide con lo que escribiste.' : 'No hay ventas en este periodo.', foot: vis.length ? `<tr class="v-foot"><td>${vis.length === d.filas.length ? 'Total' : 'Total de lo que se ve'}</td><td class="r">${vusd(T.total)}</td><td class="r">${N2.format(T.kilos)}</td><td class="r">${N0.format(T.bultos)}</td><td class="r">${T.pedidos == null ? '—' : N0.format(T.pedidos)}</td><td class="r">${N2.format(T.pct)} %</td></tr>` : ''});
}
const rvFechaTxt = f => f.slice(8, 10) + '/' + f.slice(5, 7) + '/' + f.slice(0, 4);
function rvPanel() {
  const R = rvEstado(); if (!rvVe()) return '';
  rvCargar();
  const miVend = S.rol === 'ventas' ? `<label class="fld rv-quien">Soy el vendedor<select data-act-change="rvVend"><option value="">Elige tu nombre</option>${V.vendedores.map(v => `<option value="${v.id}" ${String(R.vend) === String(v.id) ? 'selected' : ''}>${vtxt(v.nombre)}</option>`).join('')}</select></label>` : '';
  const tabs = `<div class="v-tabs" role="tablist" aria-label="Reportes de ventas">${RV_TABS.map(([k, t]) => `<button type="button" role="tab" aria-selected="${R.tab === k}" class="v-tab" data-act="rvTab" data-v="${k}">${t}</button>`).join('')}</div>`;
  const rap = RV_RANGOS.map(([k, t]) => `<button type="button" class="btn sm rv-rap" data-act="rvRango" data-v="${k}" aria-pressed="${R.rango === k}">${t}</button>`).join('');
  const d = R.cache[rvClave(R)], hay = d && d.filas.length;
  return card('Reportes de ventas', `${tabs}${miVend}
    <div class="rv-per"><div class="rv-rapidos" role="group" aria-label="Periodo">${rap}</div>
    <div class="rv-fechas"><label class="fld">Desde<input type="date" class="rv-fecha" data-act-change="rvFecha" data-k="desde" value="${esc(R.desde)}"></label><label class="fld">Hasta<input type="date" class="rv-fecha" data-act-change="rvFecha" data-k="hasta" value="${esc(R.hasta)}"></label></div></div>
    <div class="rv-barra"><label class="fld rv-bus"><span class="sr">Buscar</span><input type="search" class="rv-q" aria-label="Buscar en el reporte" placeholder="Buscar ${esc(RV_TABS.find(x => x[0] === R.tab)[2].toLowerCase())}" value="${esc(R.q)}" autocomplete="off"></label>
    <div class="btnrow"><button type="button" class="btn" data-act="rvExcel" ${hay ? '' : 'disabled'}>${ic('download', 16)}Descargar Excel</button><button type="button" class="btn" data-act="rvPdf" ${hay ? '' : 'disabled'}>${ic('download', 16)}Descargar PDF</button></div></div>
    <p class="rv-periodo"><b>Del ${rvFechaTxt(R.desde)} al ${rvFechaTxt(R.hasta)}</b>${S.rol === 'ventas' ? '' : ' · Todas las ventas'}</p>
    <div id="rv-tabla" class="rv-tabla">${rvTablaHTML()}</div>
    <p class="hint">Cuenta notas de entrega y facturas (sin anuladas) por su fecha de emisión, igual que el Registro de ventas.${S.rol === 'ventas' ? ' Aquí solo ves tus propias ventas.' : ''}</p>`);
}
/* Datos del archivo: SOLO la pestaña abierta, con lo que se ve (filtro incluido) */
function rvArchivo() {
  const R = rvEstado(), d = R.cache[rvClave(R)]; if (!d) return null;
  const t = RV_TABS.find(x => x[0] === R.tab), vis = rvVisibles(d), T = rvFilasTotales(d, vis), q = R.q.trim();
  const ventas = S.rol === 'ventas' ? (V.vendedores.find(v => String(v.id) === String(R.vend)) || {}).nombre : '';
  return {
    base: t[3], titulo: 'Ventas ' + t[1].toLowerCase(), hoja: t[1],
    subtitulo: 'Periodo: del ' + rvFechaTxt(R.desde) + ' al ' + rvFechaTxt(R.hasta) + (ventas ? ' · Vendedor: ' + ventas : '') + (q ? ' · Búsqueda: «' + q + '»' : ''),
    cols: [{h: t[2], tipo: 'txt', w: 38}, {h: 'Total vendido $', tipo: 'usd', w: 20}, {h: 'Kilos', tipo: 'kg', w: 14}, {h: 'Bultos', tipo: 'int', w: 12}, {h: 'Pedidos', tipo: 'int', w: 12}, {h: '% del total', tipo: 'pct', w: 13}],
    filas: vis.map(f => [f.nombre, f.total, f.kilos, f.bultos, f.pedidos, f.pct]),
    totales: ['Total', T.total, T.kilos, T.bultos, T.pedidos == null ? '' : T.pedidos, T.pct],
    nota: d.nota
  };
}
const rvNombre = (a, ext) => { const R = rvEstado(); return a.base.charAt(0).toUpperCase() + a.base.slice(1) + '_' + R.desde + '_al_' + R.hasta + '.' + ext; };
Object.assign(ACT, {
  rvTab: el => { const R = rvEstado(); R.tab = el.dataset.v; R.q = ''; render(); },
  rvRango: el => { rvFijar(el.dataset.v); rvEstado().q = ''; render(); },
  rvFecha: el => { const R = rvEstado(); if (!el.value) return; R[el.dataset.k] = el.value; R.rango = 'otro'; render(); },
  rvVend: el => { const R = rvEstado(); R.vend = el.value; try { localStorage.setItem('elmana:miVendedor', el.value); } catch (e) { /* sin almacenamiento */ } render(); },
  rvExcel: () => { const a = rvArchivo(); if (!a) return; ElManaXLSX.descargar(a, rvNombre(a, 'xlsx')); toast('Se descargó el Excel ' + esc(rvNombre(a, 'xlsx')) + '.', 'ok'); },
  rvPdf: async () => {
    const a = rvArchivo(); if (!a) return;
    try {
      await ElManaPDF.descargarTabla({titulo: a.titulo, subtitulo: a.subtitulo, nota: a.nota, archivo: rvNombre(a, 'pdf'),
        cols: [{h: a.cols[0].h, al: 'l', w: 4}, {h: 'Total vendido $', al: 'r', w: 2}, {h: 'Kilos', al: 'r', w: 1.5}, {h: 'Bultos', al: 'r', w: 1.2}, {h: 'Pedidos', al: 'r', w: 1.2}, {h: '% del total', al: 'r', w: 1.4}],
        filas: a.filas.map(f => [f[0], vusd(f[1]), N2.format(f[2]), N0.format(f[3]), N0.format(f[4]), N2.format(f[5]) + ' %']),
        totales: [a.totales[0], vusd(a.totales[1]), N2.format(a.totales[2]), N0.format(a.totales[3]), a.totales[4] === '' ? '—' : N0.format(a.totales[4]), N2.format(a.totales[5]) + ' %']}, typeof LOGO_SRC === 'string' ? LOGO_SRC : '/icon-192.png');
      toast('Se descargó el PDF ' + esc(rvNombre(a, 'pdf')) + '.', 'ok');
    } catch (e) { vErr(e); }
  }
});
/* Buscador del reporte: filtra al escribir y solo repinta la tabla (no pierde el cursor) */
document.addEventListener('input', e => {
  const t = e.target; if (!t || !t.classList || !t.classList.contains('rv-q')) return;
  const R = rvEstado(); R.q = t.value; const c = document.getElementById('rv-tabla'); if (c) c.innerHTML = rvTablaHTML();
});
/* Los enlaces «Ver detalle» de las tarjetas de ventas (data-rv="mes") abren este reporte con ese periodo */
document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('[data-rv]'); if (a) { rvFijar(a.dataset.rv); rvEstado().q = ''; } }, true);
