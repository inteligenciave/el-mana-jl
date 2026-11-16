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
    d.idx = d.filas.map(f => Busca.norm([f.nombre].concat((f.detalle || []).map(x => x.nombre)).join(' '))); /* índice normalizado (sin tildes ni mayúsculas), construido UNA vez por carga */ d.ts = Date.now(); R.cache[k] = d;
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
  if (completo) return {total: d.totales.total, bultos: d.totales.bultos, paquetes: d.totales.paquetes, pedidos: d.totales.pedidos, pct: d.totales.pct};
  const s = k => vis.reduce((a, f) => a + f[k], 0);
  return {total: Math.round(s('total') * 100) / 100, bultos: s('bultos'), paquetes: s('paquetes'), pedidos: ex ? s('pedidos') : null, pct: Math.round(s('pct') * 100) / 100};
}
/* Papas se cuentan en BULTOS y salsas en PAQUETES: dos columnas, nunca se suman entre sí */
const rvCant = (n, aplica) => aplica ? N0.format(n) : '<span class="muted">—</span>';
const rvAbierta = (R, f) => R.tab === 'rubro' ? R.abiertos[f.nombre] !== false : !!R.abiertos[f.nombre];
function rvTablaHTML() {
  const R = rvEstado(), d = R.cache[rvClave(R)], t = RV_TABS.find(x => x[0] === R.tab); R.abiertos ||= {};
  if (R.desde > R.hasta) return '<p class="v-alerta">La fecha «Desde» no puede ser posterior a «Hasta».</p>';
  if (S.rol === 'ventas' && !R.vend) return '<p class="hint">Elige tu nombre arriba para ver tus ventas.</p>';
  if (R.err) return `<p class="v-alerta">${ic('alert', 16)}${esc(R.err.message || 'No se pudo cargar el reporte.')}</p>`;
  if (!d) return '<p class="hint">Cargando el reporte…</p>';
  const vis = rvVisibles(d), T = rvFilasTotales(d, vis), prod = R.tab === 'producto', gt = d.totales.total || 0;
  const th = (h, r) => `<th class="${r ? 'r' : ''}" scope="col">${h}</th>`;
  const fila = f => {
    const abre = !prod && (f.detalle || []).length, op = abre && rvAbierta(R, f);
    const nom = abre ? `<button type="button" class="rv-exp" data-act="rvAbrir" data-v="${esc(f.nombre)}" aria-expanded="${op}" title="${op ? 'Ocultar' : 'Ver'} las presentaciones">${op ? '▾' : '▸'} <b>${vtxt(f.nombre)}</b></button>` : `<b>${vtxt(f.nombre)}</b>`;
    const celdaB = prod ? rvCant(f.bultos, f.rubro === 'Papas') : N0.format(f.bultos), celdaP = prod ? rvCant(f.paquetes, f.rubro === 'Salsas') : N0.format(f.paquetes);
    let h = `<tr class="rv-main"><td>${nom}</td><td class="r">${vusd(f.total)}</td><td class="r">${celdaB}</td><td class="r">${celdaP}</td><td class="r">${N0.format(f.pedidos)}</td><td class="r">${N2.format(f.pct)} %</td></tr>`;
    if (op) h += f.detalle.map(x => `<tr class="rv-sub"><td><span class="rv-pres">${vtxt(x.nombre)}</span></td><td class="r">${vusd(x.total)}</td><td class="r">${rvCant(x.cantidad, x.unidad === 'Bultos')}</td><td class="r">${rvCant(x.cantidad, x.unidad === 'Paquetes')}</td><td class="r">${N0.format(x.pedidos)}</td><td class="r">${N2.format(gt ? Math.round(x.total * 10000 / gt) / 100 : 0)} %</td></tr>`).join('');
    return h;
  };
  const foot = vis.length ? `<tr class="v-foot"><td>${vis.length === d.filas.length ? 'Total' : 'Total de lo que se ve'}</td><td class="r">${vusd(T.total)}</td><td class="r">${N0.format(T.bultos)}</td><td class="r">${N0.format(T.paquetes)}</td><td class="r">${T.pedidos == null ? '—' : N0.format(T.pedidos)}</td><td class="r">${N2.format(T.pct)} %</td></tr>` : '';
  return `<div class="tw"><table class="rv-t"><thead><tr>${th(t[2] + (prod ? ' (presentación)' : ''))}${th('Total vendido $', 1)}${th('Bultos <small>(papas)</small>', 1)}${th('Paquetes <small>(salsas)</small>', 1)}${th('Pedidos', 1)}${th('% del total', 1)}</tr></thead><tbody>${vis.length ? vis.map(fila).join('') : `<tr><td colspan="6" class="empty-row">${Busca.norm(R.q) ? 'Nada coincide con lo que escribiste.' : 'No hay ventas en este periodo.'}</td></tr>`}${foot}</tbody></table></div>`;
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
  const t = RV_TABS.find(x => x[0] === R.tab), vis = rvVisibles(d), T = rvFilasTotales(d, vis), q = R.q.trim(), prod = R.tab === 'producto', gt = d.totales.total || 0;
  const ventas = S.rol === 'ventas' ? (V.vendedores.find(v => String(v.id) === String(R.vend)) || {}).nombre : '';
  const filas = [];
  vis.forEach(f => {
    filas.push(Object.assign([f.nombre, f.total, prod ? (f.rubro === 'Papas' ? f.bultos : '') : f.bultos, prod ? (f.rubro === 'Salsas' ? f.paquetes : '') : f.paquetes, f.pedidos, f.pct], {sub: false}));
    if (!prod) (f.detalle || []).forEach(x => filas.push(Object.assign(['    ' + x.nombre, x.total, x.unidad === 'Bultos' ? x.cantidad : '', x.unidad === 'Paquetes' ? x.cantidad : '', x.pedidos, gt ? Math.round(x.total * 10000 / gt) / 100 : 0], {sub: true})));
  });
  return {
    base: t[3], titulo: 'Ventas ' + t[1].toLowerCase(), hoja: t[1], agrupado: !prod,
    subtitulo: 'Periodo: del ' + rvFechaTxt(R.desde) + ' al ' + rvFechaTxt(R.hasta) + (ventas ? ' · Vendedor: ' + ventas : '') + (q ? ' · Búsqueda: «' + q + '»' : ''),
    cols: [{h: t[2] + (prod ? ' (presentación)' : ' / presentación'), tipo: 'txt', w: 46}, {h: 'Total vendido $', tipo: 'usd', w: 20}, {h: 'Bultos (papas)', tipo: 'int', w: 15}, {h: 'Paquetes (salsas)', tipo: 'int', w: 17}, {h: 'Pedidos', tipo: 'int', w: 12}, {h: '% del total', tipo: 'pct', w: 13}],
    filas, totales: ['Total', T.total, T.bultos, T.paquetes, T.pedidos == null ? '' : T.pedidos, T.pct],
    nota: d.nota
  };
}
const rvNombre = (a, ext) => { const R = rvEstado(); return a.base.charAt(0).toUpperCase() + a.base.slice(1) + '_' + R.desde + '_al_' + R.hasta + '.' + ext; };
Object.assign(ACT, {
  rvAbrir: el => { const R = rvEstado(); R.abiertos ||= {}; const f = (R.cache[rvClave(R)] || {filas: []}).filas.find(x => x.nombre === el.dataset.v); if (f) R.abiertos[f.nombre] = !rvAbierta(R, f); const c = document.getElementById('rv-tabla'); if (c) c.innerHTML = rvTablaHTML(); },
  rvTab: el => { const R = rvEstado(); R.tab = el.dataset.v; R.q = ''; R.abiertos = {}; render(); },
  rvRango: el => { rvFijar(el.dataset.v); rvEstado().q = ''; render(); },
  rvFecha: el => { const R = rvEstado(); if (!el.value) return; R[el.dataset.k] = el.value; R.rango = 'otro'; render(); },
  rvVend: el => { const R = rvEstado(); R.vend = el.value; try { localStorage.setItem('elmana:miVendedor', el.value); } catch (e) { /* sin almacenamiento */ } render(); },
  rvExcel: () => { const a = rvArchivo(); if (!a) return; ElManaXLSX.descargar(a, rvNombre(a, 'xlsx')); toast('Se descargó el Excel ' + esc(rvNombre(a, 'xlsx')) + '.', 'ok'); },
  rvPdf: async () => {
    const a = rvArchivo(); if (!a) return;
    try {
      await ElManaPDF.descargarTabla({titulo: a.titulo, subtitulo: a.subtitulo, nota: a.nota, archivo: rvNombre(a, 'pdf'),
        cols: [{h: a.cols[0].h, al: 'l', w: 4.6}, {h: 'Total vendido $', al: 'r', w: 2}, {h: 'Bultos (papas)', al: 'r', w: 1.5}, {h: 'Paquetes (salsas)', al: 'r', w: 1.7}, {h: 'Pedidos', al: 'r', w: 1.2}, {h: '% del total', al: 'r', w: 1.4}], agrupado: a.agrupado,
        filas: a.filas.map(f => Object.assign([f[0].trim(), vusd(f[1]), f[2] === '' ? '' : N0.format(f[2]), f[3] === '' ? '' : N0.format(f[3]), N0.format(f[4]), N2.format(f[5]) + ' %'], {sub: f.sub})),
        totales: [a.totales[0], vusd(a.totales[1]), N0.format(a.totales[2]), N0.format(a.totales[3]), a.totales[4] === '' ? '—' : N0.format(a.totales[4]), N2.format(a.totales[5]) + ' %']}, typeof LOGO_SRC === 'string' ? LOGO_SRC : '/icon-192.png');
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
