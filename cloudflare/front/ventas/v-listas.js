/* Listas y salidas: pagos recibidos (día/semana), quién debe y desde cuándo, comisiones, asientos, inventario y auditoría. Todo con CSV para Excel. */
const vVendSel = (clave, valor, accion) => `<label class="fld">Vendedor<select data-act-change="${accion}" data-vf="${clave}"><option value="">Todos</option>${V.vendedores.map(v => `<option value="${v.id}" ${String(valor) === String(v.id) ? 'selected' : ''}>${vtxt(v.nombre)}</option>`).join('')}</select></label>`;

/* ---------- Pagos recibidos ---------- */
async function vPagosCargar() {
  const f = V.pagos.f; if (!f.desde && !f.hasta && !V.pagos.init) { f.desde = vLunes(vHoy()); f.hasta = vHoy(); }
  V.pagos.init = true;
  try { V.pagos.filas = await vApi('GET', '/pagos' + vQS({desde: f.desde, hasta: f.hasta, vendedor: f.vendedor, estado: f.estado === 'TODOS' ? '' : f.estado})); } catch (e) { vErr(e); V.pagos.filas = []; }
  render();
}
/* Qué se puede buscar en un pago (solo datos de pagos): se usa igual para filtrar la tabla y para las sugerencias */
const V_DEF_PAGO = [
  {tipo: 'Cliente', valores: x => x.cliente, detalle: x => x.cliente_rif || 'sin RIF'}, {tipo: 'RIF', valores: x => x.cliente_rif, detalle: x => x.cliente},
  {tipo: 'Recibo', valores: x => x.recibo, detalle: x => x.cliente + ' · ' + vusd(x.usd)},
  {tipo: 'Nota o factura', valores: x => (x.docs || '').split(/[|\s]+/).filter(Boolean), detalle: x => x.cliente},
  {tipo: 'Banco', valores: x => x.banco, detalle: x => 'pagos recibidos'}, {tipo: 'Referencia', valores: x => x.referencia, detalle: x => (x.banco || '—') + ' · ' + x.cliente}
];
const vPagosVisibles = () => Busca.filtrar(V.pagos.filas || [], V.pagos.f.q, Busca.textosDe(V_DEF_PAGO));
function scrPagos() {
  return vPantalla(() => {
    if (!V.pagos.init) vPagosCargar();
    const f = V.pagos.f, filas = V.pagos.filas == null ? null : vPagosVisibles(), act = (filas || []).filter(x => x.estado === 'ACTIVO');
    const totBs = act.reduce((t, x) => t + x.monto_bs, 0), totUsd = act.reduce((t, x) => t + x.usd, 0), puedeAnular = lvl('v-pagos') >= 3;
    const rapidos = [['hoy', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes'], ['todo', 'Todo']].map(([k, t]) => `<button type="button" class="btn sm" data-act="vPagosRango" data-v="${k}">${t}</button>`).join('');
    const tabla = filas == null ? '<p class="hint">Cargando pagos…</p>' : table([
      {h: 'Fecha', f: x => vfecha(x.fecha_pago)}, {h: 'Recibo', f: x => `<button type="button" class="btn sm ghost" data-act="vVerPago" data-id="${x.id_pago}">${vtxt(x.recibo)}</button>`},
      {h: 'Cliente', f: x => vtxt(x.cliente)}, {h: 'Vendedor', f: x => vtxt(x.vendedor || '—')}, {h: 'Notas', f: x => vtxt(x.notas || 'sin aplicar')},
      {h: 'Banco · referencia', f: x => `${vtxt(x.banco || '—')} · <span class="mono">${vtxt(x.referencia || 'sin ref.')}</span>`},
      {h: 'Monto Bs', r: 1, f: x => vbs(x.monto_bs)}, {h: 'Tasa', r: 1, f: x => N2.format(x.tasa)}, {h: '$', r: 1, f: x => `<b>${vusd(x.usd)}</b>`},
      {h: 'Estado', f: x => x.estado === 'ANULADO' ? `<span class="chip c-crit" title="${esc(x.motivo_anulacion || '')}">Anulado</span>` : `<span class="chip c-ok">Activo</span>${x.retroactivo ? ' <span class="chip c-warn">con PIN</span>' : ''}${x.origen === 'importado' ? ' <span class="chip c-n">importado</span>' : ''}`},
      {h: '', f: x => puedeAnular && x.estado === 'ACTIVO' ? `<button type="button" class="btn sm" data-act="vAnular" data-id="${x.id_pago}">Anular</button>` : ''}
    ], filas, {empty: Busca.norm(f.q) ? 'Ningún pago coincide en este rango de fechas. Prueba con «Todo» para buscar en todas las fechas.' : 'No hay pagos con este filtro.', foot: filas && filas.length ? `<tr class="v-foot"><td colspan="6">Total de pagos activos (${act.length})</td><td class="r">${vbs(totBs)}</td><td></td><td class="r"><b>${vusd(totUsd)}</b></td><td colspan="2"></td></tr>` : ''});
    return `${vph('Ventas y liquidación', 'Pagos recibidos', 'Lista del día o de la semana, con recibo imprimible y exportación a Excel.', `<button type="button" class="btn" data-act="vPagosCSV">${ic('download', 16)}Descargar CSV</button>`)}
    ${card('Filtros', `<div class="form"><div class="row3"><label class="fld">Desde<input type="date" data-act-change="vPagosFiltro" data-vf="desde" value="${esc(f.desde)}"></label><label class="fld">Hasta<input type="date" data-act-change="vPagosFiltro" data-vf="hasta" value="${esc(f.hasta)}"></label>${vVendSel('vendedor', f.vendedor, 'vPagosFiltro')}</div>
      <div class="row3"><label class="fld">Estado<select data-act-change="vPagosFiltro" data-vf="estado"><option value="ACTIVO" ${f.estado === 'ACTIVO' ? 'selected' : ''}>Solo activos</option><option value="ANULADO" ${f.estado === 'ANULADO' ? 'selected' : ''}>Solo anulados</option><option value="TODOS" ${f.estado === 'TODOS' ? 'selected' : ''}>Todos</option></select></label>
      <label class="fld">Buscar<input type="search" aria-label="Buscar pagos" ${Busca.atr('v-pagos')} value="${esc(f.q)}" placeholder="Cliente, RIF, RC-, nota, banco o referencia"></label><div class="v-rap"><span class="hint">Atajos</span><div class="btnrow">${rapidos}</div></div></div></div>`)}
    ${card('Pagos', tabla)}`;
  });
}
async function vPagosCSV() {
  if (!V.pagos.filas) return;
  await vCSV('pagos-' + vHoy() + '.csv', ['Fecha de pago', 'Recibo', 'Cliente', 'Vendedor', 'Notas', 'Banco', 'Referencia', 'Monto Bs', 'Tasa', 'USD', 'Estado', 'Motivo de anulación'],
    vPagosVisibles().map(x => [x.fecha_pago, x.recibo, x.cliente, x.vendedor || '', x.notas || '', x.banco || '', x.referencia || '', x.monto_bs, x.tasa, x.usd, x.estado, x.motivo_anulacion || '']));
}
function vAnular(id) {
  modal('Anular el pago ' + 'RC-' + String(id).padStart(5, '0'), `<div class="form"><p>El pago no se borra: queda marcado como <b>anulado</b> con el motivo y la persona que lo anuló, y la nota vuelve a quedar pendiente.</p>
    <label class="fld">Motivo de la anulación<input type="text" id="v-motivo" maxlength="200" placeholder="Por ejemplo: referencia mal escrita"></label><p class="err" id="v-an-e" role="alert" hidden></p>
    <div class="btnrow"><button type="button" class="btn pri" id="v-an-ok">Anular el pago</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`);
  $('#v-motivo').focus();
  $('#v-an-ok').addEventListener('click', async () => {
    const e = $('#v-an-e'); e.hidden = true;
    try { await vApi('POST', '/pagos/' + id + '/anular', {motivo: $('#v-motivo').value}); closeModal(); toast('Pago anulado.'); V.clientes = null; V.deuda.data = null; V.deuda.base = null; await vPagosCargar(); }
    catch (er) { e.textContent = er.message; e.hidden = false; }
  });
}

/* ---------- Quién debe y desde cuándo ---------- */
async function vDeudaCargar() {
  const f = V.deuda.f, n = V.deuda.n = (V.deuda.n || 0) + 1; /* si llega una respuesta vieja mientras se sigue escribiendo, se descarta */
  try { const r = await vApi('GET', '/deuda' + vQS({vendedor: f.vendedor, q: f.q})); if (n !== V.deuda.n) return; V.deuda.data = r; V.deuda.ts = Date.now(); if (!f.q) V.deuda.base = r; } catch (e) { vErr(e); V.deuda.data = {clientes: [], total: 0}; V.deuda.ts = Date.now(); }
  render();
}
const V_DEF_DEUDA = [{tipo: 'Cliente', valores: c => c.razon_social, detalle: c => 'debe ' + vusd(c.saldo)}, {tipo: 'RIF', valores: c => c.rif, detalle: c => c.razon_social}, {tipo: 'Nota o factura', valores: c => c.notas.map(n => n.nro), detalle: c => c.razon_social}];
/* Días de atraso: los días desde la nota más antigua menos el plazo de crédito del cliente (sin plazo, cuenta desde la emisión) */
const vDeudaMora = c => Math.max(0, c.dias_desde - (c.dias_credito || 0));
/* Teléfono para WhatsApp y llamadas: solo dígitos, con código de país 58 si falta */
function vTelDigitos(t) {
  let d = String(t || '').replace(/\D/g, '').replace(/^00/, ''); if (!d) return '';
  if (d.startsWith('58') && d.length >= 12) return d;
  return '58' + d.replace(/^0+/, '');
}
function vMensajeCobro(c) {
  const mora = vDeudaMora(c), atraso = mora > 0 ? `con ${mora} ${mora === 1 ? 'día' : 'días'} de atraso` : `pendiente desde hace ${c.dias_desde} ${c.dias_desde === 1 ? 'día' : 'días'}`;
  return `Hola, ${c.razon_social}. Le escribimos de El Maná JL. Le recordamos que tiene un saldo de ${vusd(c.saldo)} ${atraso}. ¿Nos indica en qué fecha realizará el pago? Gracias.`;
}
function vTarjetaDeuda(c, abierto) {
  const mora = vDeudaMora(c), venc = mora > 0, tel = vTelDigitos(c.telefono), n = c.notas.length;
  const wa = tel ? `<a class="btn v-dq-b" href="https://wa.me/${tel}?text=${encodeURIComponent(vMensajeCobro(c))}" target="_blank" rel="noopener">WhatsApp</a>` : `<span class="btn v-dq-b v-dq-off" aria-disabled="true" role="link">WhatsApp</span>`;
  const ll = tel ? `<a class="btn v-dq-b" href="tel:+${tel}">Llamar</a>` : `<span class="btn v-dq-b v-dq-off" aria-disabled="true" role="link">Llamar</span>`;
  return `<article class="v-dq-c ${venc ? 'venc' : 'ok'}"><div class="v-dq-h"><h3>${vtxt(c.razon_social)}</h3><span class="chip ${venc ? 'c-warn' : 'c-ok'}">${venc ? mora + (mora === 1 ? ' día' : ' días') + ' de atraso' : 'Al corriente'}</span></div>
    <p class="v-dq-m">${vusd(c.saldo)}</p><p class="v-dq-s">${c.vendedor ? vtxt(c.vendedor) + ' · ' : ''}${n} ${n === 1 ? 'nota pendiente' : 'notas pendientes'}</p>
    <div class="v-dq-a"><button type="button" class="btn pri v-dq-b v-dq-cobrar" data-act="vCobModal" data-id="${c.id_cliente}">${ic('coins', 18)}Registrar cobro</button>${wa}${ll}
    <button type="button" class="btn ghost v-dq-b" data-act="vDeudaVer" data-id="${c.id_cliente}" aria-expanded="${abierto}">${abierto ? 'Ocultar detalle' : 'Ver detalle'}</button></div>
    ${abierto ? `<div class="v-dq-d">${table([{h: 'Nota / factura', f: x => `<button type="button" class="btn sm ghost" data-act="vVerDoc" data-id="${x.id_documento}">${vtxt(x.nro)}</button>`}, {h: 'Fecha', f: x => vfecha(x.fecha)}, {h: 'Días', r: 1, f: x => x.dias}, {h: 'Saldo', r: 1, f: x => `<b>${vusd(x.saldo)}</b>`}], c.notas)}</div>` : ''}</article>`;
}
function scrDeuda() {
  return vPantalla(() => {
    const f = V.deuda.f, d = V.deuda.data, est = V.deuda.est || 'todos', abiertos = V.deuda.abierto || new Set(); if (!d || Date.now() - (V.deuda.ts || 0) > 5000) vDeudaCargar(); /* se actualiza al volver a esta pantalla */
    const todos = d ? d.clientes.slice().sort((a, b) => vDeudaMora(b) - vDeudaMora(a) || b.saldo_cents - a.saldo_cents) : [];
    const venc = todos.filter(c => vDeudaMora(c) > 0), vista = est === 'vencidos' ? venc : est === 'corriente' ? todos.filter(c => vDeudaMora(c) === 0) : todos;
    const filt = [['todos', 'Todos', todos.length], ['vencidos', 'Vencidos', venc.length], ['corriente', 'Al corriente', todos.length - venc.length]];
    const lista = !d ? '<p class="hint">Cargando…</p>' : !vista.length ? emptyState('No hay clientes aquí', 'Prueba con otro filtro o con otra búsqueda.') : `<div class="v-dq-grid">${vista.map(c => vTarjetaDeuda(c, abiertos.has(c.id_cliente))).join('')}</div>`;
    return `${vph('Ventas y liquidación', 'Quién debe', '', `<button type="button" class="btn" data-act="vDeudaCSV">${ic('download', 16)}Descargar CSV</button>`)}
    <div class="v-dq-top"><label class="fld v-dq-bus"><span class="sr">Buscar cliente</span><input type="search" aria-label="Buscar cliente" ${Busca.atr('v-deuda')} value="${esc(f.q)}" placeholder="Buscar cliente"></label>
      <div class="v-dq-fil" role="group" aria-label="Filtrar">${filt.map(([k, t, n]) => `<button type="button" class="v-dq-f" data-act="vDeudaEst" data-v="${k}" aria-pressed="${est === k}">${t} <b>${n}</b></button>`).join('')}</div>
      ${d ? `<p class="v-dq-res"><span>Por cobrar <b>${vusd(d.total)}</b></span><span><b>${d.clientes.length}</b> ${d.clientes.length === 1 ? 'cliente' : 'clientes'}</span></p>` : ''}</div>
    ${lista}`;
  });
}
async function vDeudaCSV() {
  const d = V.deuda.data; if (!d) return;
  await vCSV('quien-debe-' + vHoy() + '.csv', ['Cliente', 'Vendedor', 'Zona', 'Nota o factura', 'Tipo', 'Emisión', 'Días', 'Total USD', 'Saldo USD', 'Debe desde'],
    d.clientes.flatMap(c => c.notas.map(n => [c.razon_social, c.vendedor || '', c.zona || '', n.nro, n.sin_detalle ? 'Del Excel' : n.tipo === 'NOTA_ENTREGA' ? 'Nota de entrega' : 'Factura', n.fecha, n.dias, n.total, n.saldo, c.desde])));
}

/* ---------- Comisiones, asientos, inventario, auditoría ---------- */
async function vRepCargar() {
  const R = V.rep, f = R.f, q = vQS({desde: f.desde, hasta: f.hasta, vendedor: f.vendedor});
  try { R.data = await vApi('GET', R.tab === 'comisiones' ? '/comisiones' + q : R.tab === 'asientos' ? '/asientos' + q : R.tab === 'inventario' ? '/movimientos' : '/auditoria'); } catch (e) { vErr(e); R.data = []; }
  render();
}
function scrReportes(solo) {
  return vPantalla(() => {
    const R = V.rep; if (solo === 'auditoria' && R.tab !== 'auditoria') { R.tab = 'auditoria'; R.data = null; R.csv = ''; }
    if (!solo && R.tab === 'auditoria' && !(lvl('v-clientes') >= 3)) { R.tab = 'comisiones'; R.data = null; R.csv = ''; }
    const d = R.data; if (!d) vRepCargar();
    const tabs = [['comisiones', 'Comisiones'], ['asientos', 'Asientos contables'], ['inventario', 'Movimientos de inventario'], ...(lvl('v-clientes') >= 3 ? [['auditoria', 'Auditoría']] : [])];
    let cuerpo = '<p class="hint">Cargando…</p>', csv = '';
    if (d && R.tab === 'comisiones') {
      const por = {}; d.forEach(c => { const k = c.vendedor_nombre || 'Sin vendedor'; (por[k] ||= {base: 0, monto: 0, sinPct: 0}); por[k].base += c.base_neta; if (c.monto != null) por[k].monto += c.monto; else por[k].sinPct++; });
      cuerpo = `${table([{h: 'Vendedor', f: ([k]) => vtxt(k)}, {h: 'Base neta cobrada', r: 1, f: ([, v]) => vusd(v.base)}, {h: 'Comisión', r: 1, f: ([, v]) => v.sinPct ? `${vusd(v.monto)} <span class="muted">(${v.sinPct} sin porcentaje)</span>` : `<b>${vusd(v.monto)}</b>`}], Object.entries(por), {empty: 'Todavía no hay comisiones.'})}
        <h3 class="v-h3">Detalle</h3>${table([{h: 'Fecha', f: c => vfecha(c.fecha)}, {h: 'Nota', f: c => vtxt(c.nro_control_interno)}, {h: 'Cliente', f: c => vtxt(c.razon_social)}, {h: 'Vendedor', f: c => vtxt(c.vendedor_nombre || '—')}, {h: 'Base neta', r: 1, f: c => vusd(c.base_neta)}, {h: '%', r: 1, f: c => c.pct == null ? 'sin definir' : N2.format(c.pct)}, {h: 'Comisión', r: 1, f: c => c.monto == null ? '—' : vusd(c.monto)}], d)}`;
      csv = ['comisiones', ['Fecha', 'Nota', 'Cliente', 'Vendedor', 'Base neta USD', 'Porcentaje', 'Comisión USD'], d.map(c => [c.fecha, c.nro_control_interno, c.razon_social, c.vendedor_nombre || '', c.base_neta, c.pct == null ? '' : c.pct, c.monto == null ? '' : c.monto])];
    } else if (d && R.tab === 'asientos') {
      cuerpo = d.length ? d.map(a => `<div class="v-asi"><p><b>${vfecha(a.fecha)}</b> · ${vtxt(a.concepto)}${a.ejemplo ? ' <span class="chip c-warn">EJEMPLO</span>' : ''}</p>${table([{h: 'Cuenta', f: l => vtxt(l.cuenta)}, {h: 'Debe', r: 1, f: l => l.debe ? vc2(l.debe) : ''}, {h: 'Haber', r: 1, f: l => l.haber ? vc2(l.haber) : ''}], a.lineas)}</div>`).join('') : emptyState('Sin asientos todavía', 'Se generan solos al vender y cobrar.');
      csv = ['asientos', ['Fecha', 'Concepto', 'Cuenta', 'Debe USD', 'Haber USD'], d.flatMap(a => a.lineas.map(l => [a.fecha, a.concepto, l.cuenta, (l.debe || 0) / 100, (l.haber || 0) / 100]))];
    } else if (d && R.tab === 'inventario') {
      cuerpo = table([{h: 'Fecha', f: m => vfecha(m.fecha)}, {h: 'Producto', f: m => vtxt(m.nombre) + ` <span class="muted mono">${vtxt(m.codigo_sku)}</span>`}, {h: 'Movimiento', f: m => vtxt(m.tipo.toLowerCase().replace(/_/g, ' '))}, {h: 'Cantidad', r: 1, f: m => (m.cantidad > 0 ? '+' : '') + N0.format(m.cantidad)}, {h: 'Documento', r: 1, f: m => m.id_documento || '—'}], d, {empty: 'Sin movimientos.'});
      csv = ['inventario', ['Fecha', 'SKU', 'Producto', 'Movimiento', 'Cantidad', 'Documento'], d.map(m => [m.fecha, m.codigo_sku, m.nombre, m.tipo, m.cantidad, m.id_documento || ''])];
    } else if (d && R.tab === 'auditoria') {
      cuerpo = table([{h: 'Cuándo', f: a => new Date(a.ts).toLocaleString('es-VE')}, {h: 'Quién', f: a => vtxt(a.rol)}, {h: 'Qué', f: a => vtxt(a.accion)}, {h: 'Sobre', f: a => vtxt(a.ent) + ' ' + vtxt(a.ref)}, {h: 'Detalle', f: a => `<span class="v-det-t">${vtxt(a.detalle)}</span>`}], d, {empty: 'Sin registros.'});
      csv = ['auditoria', ['Cuándo', 'Quién', 'Acción', 'Entidad', 'Referencia', 'Detalle'], d.map(a => [new Date(a.ts).toISOString(), a.rol, a.accion, a.ent, a.ref, a.detalle])];
    }
    const filtros = R.tab === 'comisiones' || R.tab === 'asientos' ? `<div class="row3"><label class="fld">Desde<input type="date" data-act-change="vRepFiltro" data-vf="desde" value="${esc(R.f.desde)}"></label><label class="fld">Hasta<input type="date" data-act-change="vRepFiltro" data-vf="hasta" value="${esc(R.f.hasta)}"></label>${R.tab === 'comisiones' ? vVendSel('vendedor', R.f.vendedor, 'vRepFiltro') : ''}</div>` : '';
    V.rep.csv = csv;
    return `${solo ? vph('Gerencia', 'Auditoría', 'Todo lo que se registró o cambió en el sistema: quién, cuándo y qué. Solo se puede consultar.', csv ? `<button type="button" class="btn" data-act="vRepCSV">${ic('download', 16)}Descargar CSV</button>` : '') : vph('Ventas y liquidación', 'Comisiones, asientos e inventario', 'Lo que el sistema calcula solo al vender y cobrar.', csv ? `<button type="button" class="btn" data-act="vRepCSV">${ic('download', 16)}Descargar CSV</button>` : '')}
    ${solo ? '' : `<div class="v-tabs" role="tablist">${tabs.map(([k, t]) => `<button type="button" role="tab" aria-selected="${R.tab === k}" class="v-tab" data-act="vRepTab" data-v="${k}">${t}</button>`).join('')}</div>`}${filtros ? card('Filtros', `<div class="form">${filtros}</div>`) : ''}${card('', '<div class="v-cuerpo-sc">' + cuerpo + '</div>')}`;
  });
}

window.vAuditoriaScr = () => scrReportes('auditoria');

/* ---------- Registro de ventas: lo que de verdad se vendió (datos reales de la base) ---------- */
async function vRegVCargar() {
  const R = V.regv ||= {docs: null, deuda: null, ts: 0, cargando: false}; if (R.cargando) return; R.cargando = true;
  try {
    const [docs, deu, peds] = await Promise.all([vApi('GET', '/documentos' + vQS({desde: vRestar(vHoy(), 29), limite: 1000})), vApi('GET', '/deuda'), vApi('GET', '/pedidos-recientes').catch(() => [])]);
    R.docs = docs; R.deuda = deu; R.peds = peds; R.err = null;
  } catch (e) { R.err = e; R.docs = R.docs || []; }
  R.ts = Date.now(); R.cargando = false; render();
}
function scrRegVentas() {
  return vPantalla(() => {
    const R = V.regv ||= {docs: null, deuda: null, ts: 0, cargando: false};
    if (!R.cargando && (!R.docs || Date.now() - R.ts > 5000)) vRegVCargar(); /* se actualiza al volver a entrar */
    if (!R.docs) return card('', emptyState('Cargando…', 'Un momento.'));
    /* una nota que ya se facturó cuenta una sola vez (como factura); las anuladas no cuentan */
    const docs = R.docs.filter(d => !/^ANULAD/.test(d.estado || '') && d.estado !== 'FACTURADO_DESDE_NE');
    const hoy = vHoy(), lunes = vLunes(hoy), suma = f => docs.filter(f).reduce((a, d) => a + d.total_cents, 0) / 100;
    const por = {}; docs.forEach(d => { const k = d.vendedor_nombre || 'Sin vendedor', o = por[k] ||= {n: k, dia: 0, sem: 0, mes: 0, cli: new Set()}; const u = d.total_cents / 100; o.mes += u; o.cli.add(d.id_cliente); if (d.fecha_emision >= lunes) o.sem += u; if (d.fecha_emision === hoy) o.dia += u; });
    const vend = Object.values(por).sort((a, b) => b.mes - a.mes).slice(0, 5);
    const ult = docs.slice(0, 5), deu = R.deuda || {clientes: [], total: 0};
    const peds = (R.peds || []).slice(0, 8);
    return `${vph('Ventas y liquidación', 'Registro de ventas', 'Lo vendido en los últimos 30 días, con los datos reales del sistema.')}
    ${R.err ? `<p class="v-alerta">${ic('alert', 16)}No se pudo leer todo. Vuelve a entrar en un momento.</p>` : ''}
    <div class="v-stats">${stat('Ventas de hoy', vusd(suma(d => d.fecha_emision === hoy)), 'Total del día')}${stat('Ventas de la semana', vusd(suma(d => d.fecha_emision >= lunes)), 'Desde el lunes')}${stat('Ventas de 30 días', vusd(suma(() => true)), docs.length + (docs.length === 1 ? ' venta' : ' ventas'))}${stat('Por cobrar', vusd(deu.total || 0), (deu.clientes || []).length + ' cliente(s)')}</div>
    <div class="v-2c">${card('Por vendedor', table([{h: 'Vendedor', f: v => `<b>${vtxt(v.n)}</b>`}, {h: 'Hoy', r: 1, f: v => vusd(v.dia)}, {h: 'Semana', r: 1, f: v => vusd(v.sem)}, {h: '30 días', r: 1, f: v => vusd(v.mes)}, {h: 'Clientes', r: 1, f: v => v.cli.size}], vend, {empty: 'Todavía no hay ventas en estos días.'}))}
    ${card('Últimas ventas', table([{h: 'Fecha', f: d => vfecha(d.fecha_emision)}, {h: 'Documento', f: d => `<button type="button" class="btn sm ghost" data-act="vVerDoc" data-id="${d.id_documento}">${vtxt(d.numero_externo || d.nro_control_interno)}</button>`}, {h: 'Cliente', f: d => vtxt(d.razon_social)}, {h: 'Total', r: 1, f: d => `<b>${vusd(d.total_cents / 100)}</b>`}], ult, {empty: 'Todavía no hay ventas en estos días.'}))}</div>
    ${card('Pedidos recientes (PDF al vender)', table([{h: 'Pedido', f: p => `<b>${vtxt(p.nro)}</b>`}, {h: 'Fecha', f: p => vfecha(p.fecha)}, {h: 'Cliente', f: p => vtxt(p.razon_social)}, {h: 'Bultos', r: 1, f: p => N0.format(p.bultos)}, {h: 'Estado', f: p => vtxt(p.estado.toLowerCase())}, {h: '', f: p => `<button type="button" class="btn sm acc" data-act="vPdfPed" data-id="${p.id_pedido}">${ic('download', 14)}PDF de la ${p.tipo === 'FACTURA' ? 'factura' : 'nota'}</button>`}], peds, {empty: 'Todavía no hay pedidos.'}))}`;
  });
}
