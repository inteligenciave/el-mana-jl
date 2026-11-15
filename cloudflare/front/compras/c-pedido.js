/* Hacer una compra · Administración › Compras. Se elige el proveedor, se eligen los productos en tarjetas (como «Hacer una venta») y se
   escriben los datos de la compra (cantidad, precio, factura, fecha, contado o crédito). Al confirmar queda «pedida al proveedor»
   y Recepción la ve como pendiente de recibir. Todo lo valida también el servidor (/api/v/compras). */
const CPD = {prov: null, pq: '', bq: '', todos: false, cant: {}, precio: {}, cond: 'CREDITO', plazo: '', factura: '', fecha: '', id_banco: '', err: '', busy: false, pedidos: null, cargando: false, bancos: null};
const cpT = s => esc(s == null ? '' : s);
const cpN = v => { const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : 0; };
async function cpApi(m, ruta, cuerpo) {
  const r = await fetch('/api/v' + ruta, {method: m, headers: {'content-type': 'application/json', 'x-rol': S.rol}, body: cuerpo ? JSON.stringify(cuerpo) : undefined});
  let j = {}; try { j = await r.json(); } catch (e) { /* sin cuerpo */ }
  if (!r.ok) { const e = new Error(j.error || 'No se pudo completar la operación.'); e.status = r.status; throw e; }
  return j;
}
function cpCargar() {
  if (CPD.cargando) return; CPD.cargando = true;
  Promise.all([cpApi('GET', '/compras/pedidos').then(r => { CPD.pedidos = r.pedidos; }).catch(e => { console.error(e); CPD.pedidos = []; }),
    cpApi('GET', '/bancos').then(r => { CPD.bancos = r.bancos || []; }).catch(() => { CPD.bancos = []; })]).finally(() => { CPD.cargando = false; render(); });
}
const cpProvs = () => (DATA.proveedores || []).filter(p => p.tipo === 'papa' || p.tipo === 'insumo');
const cpProv = () => cpProvs().find(p => p.id === CPD.prov) || null;
const cpProductos = () => [...(DATA.productosPapa || []), ...(DATA.insumos || [])];
const cpUni = p => p.unidad || 'kg';
/* Productos de ese proveedor; si no hay relación cargada se muestran todos */
const cpDelProv = pv => pv ? cpProductos().filter(p => p.prov === pv.id || (!p.prov && p.provSug === pv.id)) : [];
function cpVisibles() {
  const pv = cpProv(), propios = cpDelProv(pv), todo = CPD.todos || !propios.length;
  return {lista: Busca.filtrar(todo ? cpProductos() : propios, CPD.bq, p => [p.n, p.cat]), propios, sinRelacion: !!pv && !propios.length};
}
/* Precio de referencia: el de la última compra de ese producto con ese proveedor; si no hay, el histórico del proveedor (igual que Papa e insumos) */
function cpRef(p) {
  const pv = cpProv(); if (!pv) return null;
  const u = (S.compras || []).filter(c => c.prov === pv.id && c.pu && (c.item === p.n || c.sk === p.sk)).slice(-1)[0];
  return u ? u.pu : (pv.hist != null ? pv.hist : null);
}
const cpPrecio = p => CPD.precio[p.id] != null ? CPD.precio[p.id] : (cpRef(p) != null ? String(cpRef(p)) : '');
function cpLineas() {
  return cpProductos().filter(p => cpN(CPD.cant[p.id]) > 0).map(p => ({p, cant: cpN(CPD.cant[p.id]), pu: cpN(cpPrecio(p))}));
}
const cpTotal = () => Math.round(cpLineas().reduce((a, l) => a + Math.round(l.cant * l.pu * 1e6) / 1e4, 0)) / 100;
const cpBsTxt = usdv => S.tasa > 0 ? 'Bs ' + N2.format(usdv * S.tasa) : 'sin tasa BCV';
const cpN2 = v => N2.format(v);

function cpIcono(p) { return `<span class="v-img v-img-n cp-ic" aria-hidden="true">${ic(p.tipo === 'papa' ? 'potato' : 'box', 26)}</span>`; }
function cpTarjeta(p) {
  const q = CPD.cant[p.id] || '', on = cpN(q) > 0, ref = cpRef(p), u = cpUni(p), paso = p.kgSaco > 0 ? p.kgSaco : 1;
  return `<article class="v-prod cp-prod ${on ? 'on' : ''}" data-id="${cpT(p.id)}">${cpIcono(p)}<div class="v-prod-b"><p class="v-prod-n">${cpT(p.n)}</p><p class="v-prod-g">${cpT(p.cat)}</p>
    <p class="v-prod-p">${ref != null ? `<b class="v-pv">US$ ${N2.format(ref)}</b><span class="v-sub">precio de referencia por ${u}</span>` : '<span class="v-prod-s">Sin precio de referencia</span>'}</p>
    <div class="v-step"><button type="button" class="v-sb" data-act="cpQty" data-id="${cpT(p.id)}" data-d="-1" aria-label="Quitar ${paso} ${u} de ${cpT(p.n)}">−</button>
    <input type="text" inputmode="decimal" class="v-q cp-q" data-cp="cant" data-id="${cpT(p.id)}" value="${cpT(q)}" placeholder="0" aria-label="Cantidad de ${cpT(p.n)} en ${u}"><span class="cp-u">${u}</span>
    <button type="button" class="v-sb" data-act="cpQty" data-id="${cpT(p.id)}" data-d="1" aria-label="Agregar ${paso} ${u} de ${cpT(p.n)}">+</button></div>
    ${on ? `<label class="cp-pu">Precio por ${u} (US$)<input type="text" inputmode="decimal" data-cp="precio" data-id="${cpT(p.id)}" value="${cpT(cpPrecio(p))}"></label>` : ''}</div></article>`;
}
function cpGrid() {
  const v = cpVisibles();
  return `<div class="v-grid cp-grid" id="cp-grid">${v.lista.length ? v.lista.map(cpTarjeta).join('') : '<p class="hint">Ningún producto coincide con la búsqueda.</p>'}</div>`;
}
const cpProvItems = q => { const l = Busca.filtrar(cpProvs(), q, p => [p.nombre, p.rif, p.rubro]); return l.length ? l.map(p => `<li><button type="button" class="v-pk-b" data-act="cpProv" data-id="${cpT(p.id)}"><b>${p.nombre}</b><span>${cpT(p.rubro)} · ${p.cond === 'Crédito' ? 'crédito ' + cpT(p.plazo) : 'contado'}</span></button></li>`).join('') : '<li class="hint" style="padding:8px">No hay proveedores con ese texto.</li>'; };
function cpP1() {
  const pv = cpProv();
  const pend = (CPD.pedidos || []).filter(x => x.estado === 'PEDIDA');
  const lista = pend.length ? `<h3 class="cp-h3">Pedidos por recibir (${pend.length})</h3><ul class="cp-ped">${pend.slice(0, 6).map(x => `<li><b>${cpT(x.nro)}</b> · ${cpT(x.proveedor)}<br><span class="muted">${fd(x.fecha)} · US$ ${cpN2(x.total_usd)} · ${x.condicion === 'CONTADO' ? 'contado' : 'crédito ' + x.plazo_dias + ' días'}</span></li>`).join('')}</ul>` : '';
  if (!pv) return `<div class="v-pick"><label class="fld">Buscar proveedor<input type="search" class="v-pk-in" ${Busca.atr('c-prov')} value="${cpT(CPD.pq)}" placeholder="Nombre, RIF o qué vende"></label>
    <ul class="v-pk-list" id="cp-pk">${cpProvItems(CPD.pq)}</ul></div>${lista}`;
  return `<div class="v-cli"><p class="v-cli-n">${pv.nombre}</p><p class="mono">${cpT(pv.rif || 'sin RIF')}</p>
    <dl class="v-dl"><div><dt>Vende</dt><dd>${cpT(pv.rubro)}</dd></div><div><dt>Pago habitual</dt><dd>${pv.cond === 'Crédito' ? 'Crédito · ' + cpT(pv.plazo) : 'Contado'}</dd></div></dl>
    <button type="button" class="btn sm ghost" data-act="cpCambiarProv">Cambiar proveedor</button></div>${lista}`;
}
function cpP2() {
  const pv = cpProv();
  if (!pv) return '<p class="hint">Primero elige el proveedor.</p>';
  const v = cpVisibles();
  return `<div class="v-barra v-barra1"><input type="search" class="v-bq" ${Busca.atr('c-prod')} value="${cpT(CPD.bq)}" placeholder="Buscar producto" aria-label="Buscar producto" maxlength="40">
    ${v.propios.length ? `<div class="v-cats" role="group" aria-label="Qué productos ver"><button type="button" class="v-cat" aria-pressed="${!CPD.todos}" data-act="cpTodos" data-v="0">De este proveedor</button><button type="button" class="v-cat" aria-pressed="${CPD.todos}" data-act="cpTodos" data-v="1">Todos</button></div>` : '<span class="hint">Se muestran todos los productos</span>'}</div>
    <div id="cp-grid-w">${cpGrid()}</div>`;
}
function cpP3() {
  const pv = cpProv(), ls = cpLineas(), tot = cpTotal(), contado = CPD.cond === 'CONTADO', bancos = CPD.bancos || [];
  if (!pv) return '<p class="hint">Elige el proveedor y los productos para ver el total.</p>';
  const filas = ls.length ? `<ul class="v-lin cp-lin">${ls.map(l => `<li><span class="v-lin-n">${cpT(l.p.n)}</span><span class="v-lin-c">${cpN2(l.cant)} ${cpUni(l.p)} × US$ ${N2.format(l.pu)}</span><b>US$ ${cpN2(Math.round(l.cant * l.pu * 100) / 100)}</b></li>`).join('')}</ul>` : '<p class="hint">Todavía no has elegido productos.</p>';
  return `<div class="v-p3w"><div class="v-p3-l">${filas}</div><div class="v-p3-f">
    <div class="v-tot"><p class="v-tot-t"><span>Total</span><b>US$ ${cpN2(tot)}</b></p><p class="hint v-ref">${S.tasa > 0 ? '≈ ' + cpBsTxt(tot) + ' a la tasa BCV ' + N2.format(S.tasa) : 'No hay tasa BCV guardada.'}</p></div>
    <div class="row2"><label class="fld">Nº de factura del proveedor<input type="text" data-cp="factura" value="${cpT(CPD.factura)}" maxlength="40"></label>
    <label class="fld">Fecha de la factura<input type="date" data-cp="fecha" value="${cpT(CPD.fecha)}"></label></div>
    <fieldset class="v-cond"><legend>¿Cómo se paga?</legend><div class="v-vistas" role="group" aria-label="Condición de pago">${[['CREDITO', 'A crédito'], ['CONTADO', 'De contado']].map(([k, t]) => `<button type="button" class="v-cat" aria-pressed="${CPD.cond === k}" data-act="cpCond" data-v="${k}">${t}</button>`).join('')}</div></fieldset>
    ${contado ? `<label class="fld">Banco o cuenta<select data-cp="id_banco"><option value="">Elige el banco…</option>${bancos.map(b => `<option value="${b.id}" ${String(CPD.id_banco) === String(b.id) ? 'selected' : ''}>${cpT(b.nombre + ' (' + (b.moneda_txt || '').toLowerCase() + ')')}</option>`).join('')}</select></label>`
      : `<label class="fld">Plazo en días<input type="text" inputmode="numeric" data-cp="plazo" value="${cpT(CPD.plazo)}" maxlength="3" placeholder="${pv.dias ? pv.dias : ''}"></label>`}
    ${CPD.err ? `<p class="err" role="alert">${ic('alert')}${cpT(CPD.err)}</p>` : ''}
    <div class="v-acc"><button type="button" class="btn pri xl" data-act="cpHacer" ${CPD.busy ? 'disabled' : ''}>${ic('check')}HACER LA COMPRA</button></div></div></div>`;
}
function scrCompraPedido() {
  if (!window.__EM_HTTP) return ph('Administración', 'Hacer una compra', '', '') + card('', emptyState('Este módulo necesita el servidor', 'Funciona en la versión con base de datos (Cloudflare).'));
  if (CPD.pedidos === null) { cpCargar(); return card('', emptyState('Cargando…', 'Un momento.')); }
  if (!CPD.fecha) CPD.fecha = HOY_ISO;
  return `<h1 class="sr">Hacer una compra</h1><div class="cp-3"><section class="card cp-p1" aria-labelledby="cp1t"><div class="card-h"><h2 id="cp1t">Proveedor</h2></div><div class="card-b" id="cp1">${cpP1()}</div></section>
    <section class="card cp-p2" aria-labelledby="cp2t"><div class="card-h"><h2 id="cp2t">Productos</h2></div><div class="card-b" id="cp2">${cpP2()}</div></section>
    <section class="card cp-p3" aria-labelledby="cp3t"><div class="card-h"><h2 id="cp3t">Datos de la compra</h2></div><div class="card-b" id="cp3">${cpP3()}</div></section></div>`;
}
/* Refrescos parciales: no se pierde el foco al escribir */
function cpRefrescarTotales() {
  const p3 = $('#cp3'); if (!p3) return;
  const act = document.activeElement, keep = act && act.dataset && act.dataset.cp ? [act.dataset.cp, act.dataset.id || '', act.selectionStart] : null;
  p3.innerHTML = cpP3();
  if (keep) { const n = [...p3.querySelectorAll('[data-cp]')].find(x => x.dataset.cp === keep[0]); if (n) { n.focus(); try { n.setSelectionRange(keep[2], keep[2]); } catch (e) { /* tipo sin selección */ } } }
}
function cpMarcarTarjeta(id) {
  const p = cpProductos().find(x => x.id === id), el = document.querySelector('.cp-prod[data-id="' + id + '"]'); if (!p || !el) return;
  const on = cpN(CPD.cant[id]) > 0, had = !!el.querySelector('.cp-pu');
  el.classList.toggle('on', on);
  if (on !== had) { const foco = document.activeElement === el.querySelector('.cp-q'), pos = foco ? el.querySelector('.cp-q').selectionStart : 0; const n = document.createElement('div'); n.innerHTML = cpTarjeta(p); el.replaceWith(n.firstElementChild); if (foco) { const q = document.querySelector('.cp-prod[data-id="' + id + '"] .cp-q'); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (e) { /* sin selección */ } } } }
}
function cpAjustar() {
  const el = document.querySelector('.cp-3'); if (!el) return;
  if (innerWidth < 1000) { el.style.removeProperty('--cp-alto'); return; }
  const nuevo = Math.max(460, Math.floor(innerHeight - el.getBoundingClientRect().top - 56)) + 'px';
  if (el.style.getPropertyValue('--cp-alto') !== nuevo) el.style.setProperty('--cp-alto', nuevo);
}
(function () { const prev = window.vAjustar; window.vAjustar = function () { if (typeof prev === 'function') prev(); cpAjustar(); }; window.addEventListener('resize', cpAjustar); })();

document.addEventListener('input', e => {
  const t = e.target; if (!t || !t.dataset || !t.dataset.cp) return;
  const k = t.dataset.cp, id = t.dataset.id;
  if (k === 'cant') { CPD.cant[id] = t.value.replace(/[^0-9.,]/g, ''); if (CPD.cant[id] !== t.value) t.value = CPD.cant[id]; CPD.err = ''; cpMarcarTarjeta(id); cpRefrescarTotales(); }
  else if (k === 'precio') { CPD.precio[id] = t.value.replace(/[^0-9.,]/g, ''); if (CPD.precio[id] !== t.value) t.value = CPD.precio[id]; CPD.err = ''; cpRefrescarTotales(); }
  else if (k === 'plazo') { CPD.plazo = t.value.replace(/\D/g, ''); if (CPD.plazo !== t.value) t.value = CPD.plazo; }
  else if (k === 'factura') CPD.factura = t.value;
  else if (k === 'fecha') CPD.fecha = t.value;
});
document.addEventListener('change', e => { const t = e.target; if (t && t.dataset && t.dataset.cp === 'id_banco') CPD.id_banco = t.value; });

Busca.registrar('c-prov', {sugerir: q => Busca.sugerir(q, cpProvs(), [{tipo: 'Proveedor', valores: p => [p.nombre.replace(/&[a-z]+;/g, ''), p.rif], detalle: p => p.rubro}, {tipo: 'Vende', valores: p => p.rubro, detalle: p => p.nombre.replace(/&[a-z]+;/g, '')}]),
  elegir: it => { CPD.prov = it.it.id; cpAlElegirProv(); }, vivo: q => { CPD.pq = q; const ul = $('#cp-pk'); if (ul) ul.innerHTML = cpProvItems(q); }});
Busca.registrar('c-prod', {sugerir: q => Busca.sugerir(q, cpProductos(), [{tipo: 'Producto', valores: p => p.n, detalle: p => p.cat}, {tipo: 'Categoría', valores: p => p.cat, detalle: p => p.n}]),
  vivo: q => { CPD.bq = q; const g = $('#cp-grid-w'); if (g) g.innerHTML = cpGrid(); }});
function cpAlElegirProv() { const pv = cpProv(); CPD.todos = false; CPD.bq = ''; CPD.precio = {}; CPD.err = ''; if (pv) { CPD.cond = pv.cond === 'Contado' ? 'CONTADO' : 'CREDITO'; CPD.plazo = pv.dias ? String(pv.dias) : ''; } render(); }
function cpQty(id, d) {
  const p = cpProductos().find(x => x.id === id); if (!p) return;
  const paso = p.kgSaco > 0 ? p.kgSaco : 1, n = Math.max(0, Math.round((cpN(CPD.cant[id]) + d * paso) * 1000) / 1000);
  if (n > 0) CPD.cant[id] = String(n); else delete CPD.cant[id];
  CPD.err = ''; const q = document.querySelector('.cp-prod[data-id="' + id + '"] .cp-q'); if (q) q.value = CPD.cant[id] || '';
  cpMarcarTarjeta(id); cpRefrescarTotales();
}
async function cpHacer() {
  if (CPD.busy) return;
  const pv = cpProv(), ls = cpLineas(); CPD.err = '';
  const falla = m => { CPD.err = m; cpRefrescarTotales(); };
  if (!pv) return falla('Elige el proveedor.');
  if (!ls.length) return falla('Elige al menos un producto.');
  if (ls.some(l => !(l.pu > 0))) return falla('Escribe el precio de cada producto elegido.');
  const cuerpo = {proveedor_id: pv.id, lineas: ls.map(l => ({producto_id: l.p.id, cantidad: l.cant, precio_usd: l.pu})), factura: CPD.factura, fecha: CPD.fecha, condicion: CPD.cond};
  if (CPD.cond === 'CREDITO') cuerpo.plazo_dias = CPD.plazo; else cuerpo.id_banco = CPD.id_banco;
  CPD.busy = true; cpRefrescarTotales();
  try {
    const r = await cpApi('POST', '/compras/pedidos', cuerpo);
    toast('Compra ' + esc(r.nro) + ' hecha: queda pedida a ' + pv.nombre + ' y Recepción la verá pendiente de recibir.');
    Object.assign(CPD, {prov: null, pq: '', bq: '', todos: false, cant: {}, precio: {}, factura: '', fecha: HOY_ISO, id_banco: '', plazo: '', cond: 'CREDITO', err: '', pedidos: null});
  } catch (er) { CPD.err = er.message; }
  finally { CPD.busy = false; render(); }
}

Object.assign(PERM_DEF, {'c-pedido': 'adm:2'});
Object.assign(SCREENS, {'c-pedido': {mod: 'adm', g: 'Compras', t: 'Hacer una compra', s: 'Hacer una compra', ic: 'cart', r: scrCompraPedido}});
S.perm = permInit();
Object.assign(ACT_REQ, {cpHacer: ['c-pedido', 2]}); Object.assign(ACT_LBL, {cpHacer: 'hacer compras a proveedores'}); WRITE_ACTS.add('cpHacer');
Object.assign(ACT, {
  cpProv: el => { CPD.prov = el.dataset.id; cpAlElegirProv(); },
  cpCambiarProv: () => { Object.assign(CPD, {prov: null, pq: '', bq: '', cant: {}, precio: {}, err: ''}); render(); },
  cpTodos: el => { CPD.todos = el.dataset.v === '1'; render(); },
  cpQty: el => cpQty(el.dataset.id, +el.dataset.d),
  cpCond: el => { CPD.cond = el.dataset.v; CPD.err = ''; cpRefrescarTotales(); },
  cpHacer: () => cpHacer()
});
