/* Hacer una compra · Administración › Compras. Se elige el proveedor, se eligen los productos en tarjetas (como «Hacer una venta») y se
   escriben los datos de la compra (cantidad, precio, factura, fecha, contado o crédito). Al confirmar queda «pedida al proveedor»
   y Recepción la ve como pendiente de recibir. Todo lo valida también el servidor (/api/v/compras). */
const CPD = {prov: null, pq: '', bq: '', todos: false, cant: {}, precio: {}, cond: 'CREDITO', plazo: '', factura: '', fecha: '', id_banco: '', err: '', busy: false, pedidos: null, cargando: false, bancos: null, inv: null};
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
    cpApi('GET', '/bancos').then(r => { CPD.bancos = r.bancos || []; }).catch(() => { CPD.bancos = []; }),
    cpApi('GET', '/compras/insumos').then(r => { CPD.inv = r.insumos || []; }).catch(() => { CPD.inv = []; })]).finally(() => { CPD.cargando = false; render(); });
}
const cpProvs = () => (DATA.proveedores || []).filter(p => p.tipo === 'papa' || p.tipo === 'insumo');
const cpProv = () => cpProvs().find(p => p.id === CPD.prov) || null;
/* Insumos del inventario general que se compran directo (agua, almidón, empaque…): salen como productos «INV:codigo» en su unidad, sin crearlos en el catálogo */
const cpInvProds = () => (CPD.inv || []).map(a => ({id: a.id, n: a.n, cat: /^INV:bolsa-/.test(a.id) ? 'Bolsas por presentación' : 'Inventario general', tipo: 'insumo', unidad: a.unidad, inv: true, ultimo_usd: a.ultimo_usd, precios_prov: a.precios_prov}));
const cpProductos = () => [...(DATA.productosPapa || []), ...(DATA.insumos || []), ...cpInvProds()];
/* La papa cruda se compra SIEMPRE por saco (4.1): cantidad en sacos y precio por saco; 43 kg por saco solo es una referencia (el peso real se mide al recibir con 5 sacos de muestra) */
const KG_SACO_REF = 43;
const cpPapa = p => !!p && p.tipo === 'papa' && String(p.cat || '').toLowerCase().trim() === 'papa cruda';
const cpUni = p => cpPapa(p) ? 'saco' : (p.unidad || 'kg');
/* Productos de ese proveedor; si no hay relación cargada se muestran todos */
const cpTrae = pv => Array.isArray(pv && pv.trae) ? pv.trae : [];   // lo que trae el proveedor: [{id, ref}] (ficha del proveedor)
const cpDelProv = pv => { if (!pv) return []; const t = cpTrae(pv), ids = new Set(t.map(x => x.id)); return cpProductos().filter(p => ids.has(p.id) || p.prov === pv.id || (!t.length && !p.prov && p.provSug === pv.id)); };
function cpVisibles() {
  const pv = cpProv(), propios = cpDelProv(pv), todo = CPD.todos || !propios.length;
  return {lista: Busca.filtrar(todo ? cpProductos() : propios, CPD.bq, p => [p.n, p.cat]), propios, sinRelacion: !!pv && !propios.length};
}
/* Precio de referencia: el de la última compra de ese producto con ese proveedor; si no hay, el histórico del proveedor (igual que Papa e insumos) */
function cpRef(p) {
  const pv = cpProv(); if (!pv) return null;
  const t = cpTrae(pv).find(x => x.id === p.id); if (t && t.ref > 0) return t.ref;   // precio de referencia puesto en la ficha del proveedor
  if (p.inv) { const pp = p.precios_prov || {}; return pp[pv.id] != null ? pp[pv.id] : (p.ultimo_usd != null ? p.ultimo_usd : null); }   // último precio de compra de ese insumo (con ese proveedor; si no, con cualquiera)
  if (cpPapa(p)) return null;   // el histórico de la papa está en kg: no sirve como precio por saco
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
  const q = CPD.cant[p.id] || '', on = cpN(q) > 0, ref = cpRef(p), u = cpUni(p), paso = cpPapa(p) ? 1 : (p.kgSaco > 0 ? p.kgSaco : 1);
  return `<article class="v-prod cp-prod ${on ? 'on' : ''}" data-id="${cpT(p.id)}">${cpIcono(p)}<div class="v-prod-b"><p class="v-prod-n">${cpT(p.n)}</p><p class="v-prod-g">${cpT(p.cat)}</p>
    <p class="v-prod-p">${ref != null ? `<b class="v-pv">$ ${N2.format(ref)}</b><span class="v-sub">${p.inv ? 'último precio de compra' : 'precio de referencia'} por ${u}</span>` : `<span class="v-prod-s">${cpPapa(p) ? 'Se compra por saco · referencia ' + KG_SACO_REF + ' kg por saco' : 'Sin precio de referencia'}</span>`}</p>
    <div class="v-step"><button type="button" class="v-sb" data-act="cpQty" data-id="${cpT(p.id)}" data-d="-1" aria-label="Quitar ${paso} ${u} de ${cpT(p.n)}">−</button>
    <input type="text" inputmode="decimal" class="v-q cp-q" data-cp="cant" data-id="${cpT(p.id)}" value="${cpT(q)}" placeholder="0" aria-label="Cantidad de ${cpT(p.n)} en ${u}"><span class="cp-u">${u}</span>
    <button type="button" class="v-sb" data-act="cpQty" data-id="${cpT(p.id)}" data-d="1" aria-label="Agregar ${paso} ${u} de ${cpT(p.n)}">+</button></div>
    ${on ? `<label class="cp-pu">Precio por ${u} ($)<input type="text" inputmode="decimal" data-cp="precio" data-id="${cpT(p.id)}" value="${cpT(cpPrecio(p))}"></label>` : ''}</div></article>`;
}
function cpGrid() {
  const v = cpVisibles();
  return `<div class="v-grid cp-grid" id="cp-grid">${v.lista.length ? v.lista.map(cpTarjeta).join('') : '<p class="hint">Ningún producto coincide con la búsqueda.</p>'}</div>`;
}
const cpProvItems = q => { const l = Busca.filtrar(cpProvs(), q, p => [p.nombre, p.rif, p.rubro]); return l.length ? l.map(p => `<li><button type="button" class="v-pk-b" data-act="cpProv" data-id="${cpT(p.id)}"><b>${p.nombre}</b><span>${cpT(p.rubro)} · ${p.cond === 'Crédito' ? 'crédito ' + cpT(p.plazo) : 'contado'}</span></button></li>`).join('') : '<li class="hint" style="padding:8px">No hay proveedores con ese texto.</li>'; };
function cpP1() {
  const pv = cpProv();
  const pend = (CPD.pedidos || []).filter(x => x.estado === 'PEDIDA');
  const lista = pend.length ? `<h3 class="cp-h3">Pedidos por recibir (${pend.length})</h3><ul class="cp-ped">${pend.slice(0, 6).map(x => `<li class="cp-pedf"><div><b>${cpT(x.nro)}</b> · ${cpT(x.proveedor)}<br><span class="muted">${fd(x.fecha)} · $ ${cpN2(x.total_usd)} · ${x.condicion === 'CONTADO' ? 'contado' : 'crédito ' + x.plazo_dias + ' días'}</span></div>${lvl('c-recibir') >= 2 ? `<button type="button" class="btn sm pri" data-act="cpIrRecibir" data-nro="${cpT(x.nro)}">Recibir</button>` : ''}</li>`).join('')}</ul>` : '';
  if (!pv) return `<div class="v-pick"><label class="fld">Buscar proveedor<input type="search" class="v-pk-in" ${Busca.atr('c-prov')} value="${cpT(CPD.pq)}" placeholder="Nombre, RIF o qué vende"></label>
    <div class="cp-pvb"><button type="button" class="btn sm pri" data-act="pvNuevo" data-o="compra">${ic('plus', 16)}Nuevo proveedor</button><a class="btn sm ghost" href="#catalogos">Administrar proveedores</a></div>
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
    ${v.propios.length ? `<div class="v-cats" role="group" aria-label="Qué productos ver"><button type="button" class="v-cat" aria-pressed="${!CPD.todos}" data-act="cpTodos" data-v="0">Lo de este proveedor</button><button type="button" class="v-cat" aria-pressed="${CPD.todos}" data-act="cpTodos" data-v="1">Ver todos los productos</button></div>` : '<span class="hint">Este proveedor aún no tiene productos marcados (se ven todos). Márcalos en su ficha: «Administrar proveedores».</span>'}</div>
    <div id="cp-grid-w">${cpGrid()}</div>`;
}
function cpP3() {
  const pv = cpProv(), ls = cpLineas(), tot = cpTotal(), contado = CPD.cond === 'CONTADO', bancos = CPD.bancos || [];
  if (!pv) return '<p class="hint">Elige el proveedor y los productos para ver el total.</p>';
  const filas = ls.length ? `<ul class="v-lin cp-lin">${ls.map(l => `<li><span class="v-lin-n">${cpT(l.p.n)}</span><span class="v-lin-c">${cpN2(l.cant)} ${cpUni(l.p)} × $ ${N2.format(l.pu)}</span><b>$ ${cpN2(Math.round(l.cant * l.pu * 100) / 100)}</b></li>`).join('')}</ul>` : '<p class="hint">Todavía no has elegido productos.</p>';
  return `<div class="v-p3w"><div class="v-p3-l">${filas}</div><div class="v-p3-f">
    <div class="v-tot"><p class="v-tot-t"><span>Total</span><b>$ ${cpN2(tot)}</b></p><p class="hint v-ref">${S.tasa > 0 ? '≈ ' + cpBsTxt(tot) + ' a la tasa BCV ' + N2.format(S.tasa) : 'No hay tasa BCV guardada.'}</p></div>
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
  const paso = cpPapa(p) ? 1 : (p.kgSaco > 0 ? p.kgSaco : 1), n = Math.max(0, Math.round((cpN(CPD.cant[id]) + d * paso) * 1000) / 1000);
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
    toast('Compra ' + esc(r.nro) + ' hecha: queda pedida a ' + pv.nombre + ' y Producción la recibe cuando llegue.');
    if (typeof CRX !== 'undefined') { CRX.por = null; CRX.difs = null; }   // la lista de «Recibir» se vuelve a pedir: la compra nueva aparece al instante
    Object.assign(CPD, {prov: null, pq: '', bq: '', todos: false, cant: {}, precio: {}, factura: '', fecha: HOY_ISO, id_banco: '', plazo: '', cond: 'CREDITO', err: '', pedidos: null});
  } catch (er) { CPD.err = er.message; }
  finally { CPD.busy = false; render(); }
}

/* ---------- Proveedores: alta y edición en un cuadro (se usa aquí y en la pantalla Proveedores) ----------
   Solo Gerencia y Administración. El servidor también lo exige (src/acceso.js). Desactivar no borra: las compras anteriores conservan el nombre. */
const PV_DIAS = ['7', '20', '21', '25'];
const pvLimpio = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const pvClave = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function pvRif(s) {
  const t = String(s || '').toUpperCase().replace(/[\s.]/g, '');
  if (!/^[JVEG]-?\d{8}-?\d$/.test(t)) return null;
  const d = t.replace(/\D/g, ''); return t[0] + '-' + d.slice(0, 8) + '-' + d.slice(8);
}
function pvCondDe(p) {
  if (!p || p.cond !== 'Crédito') return {c: 'Contado', sel: '7', otro: ''};
  if (p.abonos || p.plazo === 'Abonos semanales') return {c: 'Abonos', sel: '7', otro: ''};
  const d = String(p.dias || ''); return PV_DIAS.includes(d) ? {c: 'Credito', sel: d, otro: ''} : {c: 'Credito', sel: 'otro', otro: d};
}
/* «Qué vende»: lista con casillas de lo que trae el proveedor (insumos del inventario y productos de compras), cada uno con precio de referencia opcional */
function pvItems() {
  const prods = [...(DATA.productosPapa || []).map(p => ({...p, t: 'papa'})), ...(DATA.insumos || []).map(p => ({...p, t: 'insumo'}))].map(p => ({id: p.id, n: p.n, u: cpUni(p), g: 'Productos de compras', t: p.t}));
  const inv = (CPD.inv || []).map(a => ({id: a.id, n: a.n, u: a.unidad, g: 'Insumos del inventario', t: 'insumo'}));
  return [...inv, ...prods];
}
/* Filas de la lista «Qué vende». sel = Map(id → precio de referencia, número o texto escrito) con lo que está marcado */
function pvListaHtml(sel) {
  let g = '', h = '';
  pvItems().forEach(it => {
    if (it.g !== g) { g = it.g; h += `<p class="pv-g" data-pvgt="${it.t}">${cpT(g)}</p>`; }
    const on = sel.has(it.id), ref = sel.get(it.id), rv = ref == null || ref === '' || (typeof ref === 'number' && !(ref > 0)) ? '' : ref;
    h += `<div class="pv-it ${on ? 'on' : ''}" data-pvt="${it.t}" data-pvid="${cpT(it.id)}"><label class="pv-ck"><input type="checkbox" data-pvk="${cpT(it.id)}" ${on ? 'checked' : ''}><span>${cpT(it.n)}</span><span class="muted">${cpT(it.u)}</span></label>
      <label class="pv-ref" ${on ? '' : 'hidden'}>Precio de referencia (opcional)<span class="pv-ref-i">$<input type="text" inputmode="decimal" data-pvr="${cpT(it.id)}" value="${cpT(rv)}" placeholder="por ${cpT(it.u)}" aria-label="Precio de referencia de ${cpT(it.n)}, por ${cpT(it.u)}"></span></label></div>`;
  });
  return h || '<p class="hint">No hay productos cargados.</p>';
}
function pvTraeHtml(q, p) {
  const sel = new Map((p ? (Array.isArray(p.trae) ? p.trae : cpDelProv(p).map(x => ({id: x.id, ref: null}))) : []).map(t => [t.id, t.ref]));
  const otro = p ? (Array.isArray(p.trae) ? (p.otro || '') : (cpDelProv(p).length ? '' : (p.rubro === 'Sin rubro' ? '' : (p.rubro || '')))) : '';
  return `<fieldset class="fld pv-trae"><legend>Qué vende (marca lo que trae este proveedor)</legend><div class="pv-lista">${pvListaHtml(sel)}</div>
    <div class="pv-nuevo-w" id="pv-nw"><button type="button" class="btn" id="pv-pn" data-act="pvProdNuevo">+ Producto nuevo</button>
    <div class="pv-nuevo" id="pv-nf" hidden><p class="pv-nuevo-t">Producto nuevo</p>
      <label class="fld">Nombre<input type="text" id="pv-nn" maxlength="60" autocomplete="off" placeholder="Ej.: Vinagre, Papa granola"></label>
      <div class="row2"><label class="fld">Tipo<select id="pv-nt"><option value="insumo">Insumo</option><option value="papa">Papa</option></select></label>
      <label class="fld">Unidad<select id="pv-nu"><option value="kg">Kilos (kg)</option><option value="saco">Sacos</option><option value="litro">Litros</option><option value="unidad">Unidades</option><option value="caja">Cajas</option></select></label></div>
      <p class="hint">Sin precio: el precio se escribe al hacer la compra.</p>
      <p class="err" id="pv-ne" role="alert" hidden></p>
      <div class="btnrow"><button type="button" class="btn pri" data-act="pvProdCrear">Crear producto</button><button type="button" class="btn" data-act="pvProdCancelar">Cancelar</button></div></div></div>
    <label class="fld">Otra cosa que vende y no está en la lista (opcional)<input type="text" id="pv-ru" maxlength="80" value="${cpT(otro)}" placeholder="Ej.: Repuestos, ferretería"></label></fieldset>`;
}
async function pvAbrir(id, origen) {
  if (lvl('catalogos') < 2) return toast('Tu rol no puede agregar ni editar proveedores.', 'warn');
  try { CPD.inv = (await cpApi('GET', '/compras/insumos')).insumos || []; } catch (e) { CPD.inv = CPD.inv || []; }
  pvModal(id, origen);
}
function pvModal(id, origen) {
  if (lvl('catalogos') < 2) return toast('Tu rol no puede agregar ni editar proveedores.', 'warn');
  const p = id ? one('proveedores', id) : null; if (id && !p) return;
  const q = p || {nombre: '', rif: '', rubro: '', tipo: 'insumo', tel: '', correo: '', direccion: ''}, cd = pvCondDe(p);
  const tipos = [['papa', 'Papa (materia prima)'], ['insumo', 'Insumos'], ...(origen === 'compra' && !(p && p.tipo === 'general') ? [] : [['general', 'Compras generales']])];
  modal(id ? 'Editar proveedor' : 'Nuevo proveedor', `<div class="form" id="pv-form" data-id="${cpT(id || '')}" data-o="${origen}">
    <label class="fld">Nombre<input type="text" id="pv-n" maxlength="100" value="${cpT(q.nombre)}" autocomplete="off"></label>
    <label class="fld">RIF<input type="text" id="pv-r" maxlength="14" value="${cpT(q.rif)}" placeholder="J-12345678-9" autocomplete="off"></label>
    <label class="fld">Qué se le compra<select id="pv-t">${tipos.map(([k, t]) => `<option value="${k}" ${q.tipo === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    ${pvTraeHtml(q, p)}
    <div class="row2"><label class="fld">Condición de pago<select id="pv-c"><option value="Contado" ${cd.c === 'Contado' ? 'selected' : ''}>De contado</option><option value="Credito" ${cd.c === 'Credito' ? 'selected' : ''}>A crédito</option><option value="Abonos" ${cd.c === 'Abonos' ? 'selected' : ''}>Abonos semanales</option></select></label>
    <label class="fld" id="pv-dw" ${cd.c === 'Credito' ? '' : 'hidden'}>Días de plazo<select id="pv-ds">${PV_DIAS.map(d => `<option value="${d}" ${cd.sel === d ? 'selected' : ''}>${d} días</option>`).join('')}<option value="otro" ${cd.sel === 'otro' ? 'selected' : ''}>Otro número</option></select></label></div>
    <label class="fld" id="pv-ow" ${cd.c === 'Credito' && cd.sel === 'otro' ? '' : 'hidden'}>Otro plazo, en días<input type="text" id="pv-do" inputmode="numeric" maxlength="3" value="${cpT(cd.otro)}"></label>
    <div class="row2"><label class="fld">Teléfono (opcional)<input type="tel" id="pv-te" maxlength="20" value="${cpT(q.tel)}" placeholder="0414-0000000" autocomplete="off"></label>
    <label class="fld">Correo (opcional)<input type="email" id="pv-co" maxlength="100" value="${cpT(q.correo)}" autocomplete="off"></label></div>
    <label class="fld">Dirección (opcional)<input type="text" id="pv-di" maxlength="200" value="${cpT(q.direccion)}" autocomplete="off"></label>
    <p class="err" id="pv-e" role="alert" hidden></p>
    <div class="btnrow"><button type="button" class="btn pri" data-act="pvGuardar">${ic('check', 16)}Guardar</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`);
  pvFiltrar();
  const i = $('#pv-n'); if (i) i.focus();
}
/* La lista de «Qué vende» solo muestra lo que corresponde a «Qué se le compra»: papa → papa; insumos → insumos; compras generales → solo «Otra cosa» */
function pvFiltrar() {
  const f = $('#pv-form'), t = f && $('#pv-t'); if (!t) return;
  f.querySelectorAll('.pv-it,.pv-g').forEach(el => { el.hidden = (el.dataset.pvt || el.dataset.pvgt) !== t.value; });
  const l = f.querySelector('.pv-lista'); let n = l.querySelector('.pv-vacio');
  const hay = [...f.querySelectorAll('.pv-it')].some(el => !el.hidden);
  if (!n) { n = document.createElement('p'); n.className = 'hint pv-vacio'; l.appendChild(n); }
  n.hidden = hay; n.textContent = 'Para este tipo de compra no hay productos en la lista. Escribe lo que vende en «Otra cosa».';
  const nw = $('#pv-nw'); if (nw) nw.hidden = t.value === 'general';   // compras generales no tienen lista: no hay productos que agregar
}
/* «+ Producto nuevo»: pide nombre, tipo y unidad (sin precio); el servidor lo crea y aquí queda marcado sin perder lo ya escrito en el cuadro */
function pvProdNuevo() {
  const f = $('#pv-nf'), t = $('#pv-t'); if (!f || !t) return;
  $('#pv-nt').value = t.value === 'papa' ? 'papa' : 'insumo'; $('#pv-nu').value = t.value === 'papa' ? 'saco' : 'kg'; $('#pv-nn').value = ''; $('#pv-ne').hidden = true;
  f.hidden = false; $('#pv-pn').hidden = true; $('#pv-nn').focus(); f.scrollIntoView({block: 'nearest'});
}
function pvProdCancelar() { const f = $('#pv-nf'); if (!f) return; f.hidden = true; $('#pv-pn').hidden = false; }
async function pvProdCrear() {
  const e = $('#pv-ne'), nombre = pvLimpio($('#pv-nn') && $('#pv-nn').value); if (!e || CPD.busy) return; e.hidden = true;
  const falla = m => { e.textContent = m; e.hidden = false; };
  if (nombre.length < 2) return falla('Escribe el nombre del producto.');
  const tipo = $('#pv-nt').value, unidad = $('#pv-nu').value, clave = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (pvItems().some(x => clave(x.n) === clave(nombre))) return falla('Ya existe un producto llamado «' + nombre + '». Búscalo en la lista.');
  CPD.busy = true;
  try {
    const r = (await cpApi('POST', '/compras/productos', {nombre, tipo, unidad})).producto, uni = unidad === 'litro' ? 'L' : unidad === 'unidad' ? 'und' : unidad;
    if (r.tipo === 'insumo') { CPD.inv = [...(CPD.inv || []).filter(a => a.id !== r.id), {id: r.id, n: r.n, unidad: uni}]; }
    else if (!(DATA.productosPapa || []).some(x => x.id === r.id)) (DATA.productosPapa = DATA.productosPapa || []).push({id: r.id, n: r.n, cat: r.n, sk: r.n, tipo: 'papa', unidad: uni, kgSaco: unidad === 'saco' ? KG_SACO_REF : null});
    const sel = new Map(); document.querySelectorAll('#pv-form [data-pvk]').forEach(k => { if (k.checked) { const rr = $('#pv-form').querySelector('[data-pvr="' + k.dataset.pvk.replace(/"/g, '') + '"]'); sel.set(k.dataset.pvk, rr ? rr.value : null); } });
    sel.set(r.id, null);
    $('#pv-form .pv-lista').innerHTML = pvListaHtml(sel);
    const t = $('#pv-t'), cambio = t.value !== r.tipo; if (cambio) t.value = r.tipo;   // para poder marcarlo, «Qué se le compra» pasa al tipo del producto nuevo
    pvFiltrar(); pvProdCancelar();
    const fila = document.querySelector('#pv-form [data-pvid="' + r.id.replace(/"/g, '') + '"]'); if (fila) fila.scrollIntoView({block: 'nearest'});
    toast('Producto «' + r.n + '» creado y marcado.' + (cambio ? ' «Qué se le compra» ahora dice «' + (r.tipo === 'papa' ? 'Papa' : 'Insumos') + '».' : ''));
  } catch (er) { falla(er.message || 'No se pudo crear el producto.'); }
  finally { CPD.busy = false; }
}
document.addEventListener('change', e => {
  const t = e.target; if (t && t.dataset && t.dataset.pvk != null && $('#pv-form')) { const fila = t.closest('.pv-it'); if (fila) { fila.classList.toggle('on', t.checked); fila.querySelector('.pv-ref').hidden = !t.checked; } return; }
  if (!t || !t.id || !$('#pv-form')) return;
  if (t.id === 'pv-t') pvFiltrar();
  if (t.id === 'pv-c' || t.id === 'pv-ds') { const cr = $('#pv-c').value === 'Credito'; $('#pv-dw').hidden = !cr; $('#pv-ow').hidden = !(cr && $('#pv-ds').value === 'otro'); }
});
document.addEventListener('input', e => { const t = e.target; if (t && (t.id === 'pv-do')) { const v = t.value.replace(/\D/g, ''); if (v !== t.value) t.value = v; } if (t && t.dataset && t.dataset.pvr != null) { const v = t.value.replace(/[^0-9.,]/g, ''); if (v !== t.value) t.value = v; } });
function pvLeer(id) {
  const v = x => pvLimpio($('#' + x).value), nombre = v('pv-n'), otro = v('pv-ru'), tel = v('pv-te'), correo = v('pv-co'), dir = v('pv-di'), c = $('#pv-c').value;
  if (!nombre) return {err: 'Falta el nombre del proveedor.'};
  if (nombre.length > 100) return {err: 'El nombre es muy largo (máximo 100 letras).'};
  if (!v('pv-r')) return {err: 'Falta el RIF.'};
  const rif = pvRif(v('pv-r')); if (!rif) return {err: 'El RIF no es válido. Escríbelo así: J-12345678-9 (empieza con J, V, E o G).'};
  if (rows('proveedores').some(x => x.id !== id && pvClave(x.rif) === pvClave(rif))) return {err: 'Ya hay un proveedor con ese RIF.'};
  const trae = [], nombres = [], todos = pvItems();
  for (const k of document.querySelectorAll('#pv-form [data-pvk]')) {
    if (!k.checked || k.closest('.pv-it').hidden) continue;
    const it = todos.find(x => x.id === k.dataset.pvk), r = $('#pv-form').querySelector('[data-pvr="' + k.dataset.pvk.replace(/"/g, '') + '"]'), txt = r ? r.value.trim() : '';
    let ref = null; if (txt) { ref = cpN(txt); if (!(ref > 0) || ref > 1e6) return {err: 'El precio de referencia de ' + (it ? it.n : 'un producto') + ' debe ser un número mayor que cero (o déjalo vacío).'}; }
    trae.push({id: k.dataset.pvk, ref}); if (it) nombres.push(it.n);
  }
  if (!trae.length && !otro) return {err: 'Marca al menos lo que trae el proveedor (o escribe qué vende en «Otra cosa»).'};
  const rubro = [...nombres, ...(otro ? [otro] : [])].join(', ');
  if (tel && (!/^[0-9+()\-\s.]+$/.test(tel) || tel.replace(/\D/g, '').length < 7 || tel.replace(/\D/g, '').length > 15)) return {err: 'El teléfono solo puede llevar números, espacios y los signos + - ( ).'};
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) return {err: 'El correo no es válido. Ejemplo: ventas@empresa.com'};
  let cond = 'Contado', plazo = 'Contado', dias = 0, abonos = null;
  if (c === 'Abonos') { cond = 'Crédito'; plazo = 'Abonos semanales'; dias = 7; abonos = 4; }
  else if (c === 'Credito') {
    const d = $('#pv-ds').value === 'otro' ? parseInt($('#pv-do').value, 10) : parseInt($('#pv-ds').value, 10);
    if (!(d >= 1 && d <= 365)) return {err: 'Escribe los días de plazo (un número entre 1 y 365).'};
    cond = 'Crédito'; plazo = d + ' días'; dias = d;
  }
  return {d: {nombre, rif, rubro, trae, otro, tipo: $('#pv-t').value, cond, plazo, dias, abonos, tel, correo, direccion: dir}};
}
Object.assign(Svc, {
  async guardarProveedor(id, d) {
    if (lvl('catalogos') < 2) throw fail('Tu rol no puede agregar ni editar proveedores.');
    if (!id) {
      const usados = new Set(rows('proveedores').map(x => x.id));
      do { id = await nextId('P', 0, 'P', ''); } while (usados.has(id));
      await W.set('proveedores', id, {...d, hist: null, rechazo: null, entrega: d.tipo === 'papa' ? 2 : d.tipo === 'insumo' ? 5 : 7, orden: Date.now()});
      await Svc.audit('prov', id, d.nombre, 'agregó', {}); return id;
    }
    const prev = one('proveedores', id) || {}, ch = {};
    Object.keys(d).forEach(k => { const a = prev[k] == null ? '' : prev[k], b = d[k] == null ? '' : d[k], s = x => typeof x === 'object' ? JSON.stringify(x) : String(x); if (s(a) !== s(b)) ch[k] = [typeof a === 'object' ? s(a) : a, typeof b === 'object' ? s(b) : b]; });
    await W.update('proveedores', id, d);
    if (Object.keys(ch).length) await Svc.audit('prov', id, d.nombre, 'modificó', ch);
    return id;
  }
});
Object.assign(ENT_LBL, {trae: 'Lo que trae', otro: 'Otra cosa que vende', correo: 'Correo', direccion: 'Dirección', plazo: 'Plazo', abonos: 'Abonos'});
async function pvGuardar() {
  const f = $('#pv-form'), e = $('#pv-e'); if (!f || CPD.busy) return; e.hidden = true;
  const id = f.dataset.id, origen = f.dataset.o, r = pvLeer(id);
  if (r.err) { e.textContent = r.err; e.hidden = false; return; }
  CPD.busy = true;
  try {
    const nid = await Svc.guardarProveedor(id, r.d);
    await waitFor(() => (DATA.proveedores || []).some(p => p.id === nid));
    closeModal(); toast(id ? 'Cambios guardados.' : 'Proveedor agregado.');
    if (origen === 'compra' && !id) { CPD.prov = nid; CPD.pq = ''; cpAlElegirProv(); }
  } catch (er) { console.error(er); e.textContent = errMsg(er); e.hidden = false; }
  finally { CPD.busy = false; render(); }
}
async function pvActivar(id, activo) {
  if (S.busy['pvact']) return; S.busy['pvact'] = true;
  try { await Svc.archivar('proveedores', id, !activo); toast(activo ? 'Proveedor activado.' : 'Proveedor desactivado: ya no sale en la lista de compras, pero las compras anteriores conservan su nombre.'); if (CPD.prov === id && !activo) CPD.prov = null; }
  catch (er) { console.error(er); toast(esc(errMsg(er)), 'err'); }
  finally { delete S.busy['pvact']; render(); }
}

Object.assign(PERM_DEF, {'c-pedido': 'adm:2'});
Object.assign(SCREENS, {'c-pedido': {mod: 'adm', g: 'Compras', t: 'Hacer una compra', s: 'Hacer una compra', ic: 'cart', r: scrCompraPedido}});
S.perm = permInit();
Object.assign(ACT_REQ, {cpHacer: ['c-pedido', 2], pvNuevo: ['catalogos', 2], pvEditar: ['catalogos', 2], pvGuardar: ['catalogos', 2], pvActivar: ['catalogos', 2], pvProdNuevo: ['catalogos', 2], pvProdCrear: ['catalogos', 2], pvProdCancelar: ['catalogos', 2]});
Object.assign(ACT_LBL, {cpHacer: 'hacer compras a proveedores', pvNuevo: 'agregar proveedores', pvEditar: 'editar proveedores', pvGuardar: 'guardar proveedores', pvActivar: 'activar o desactivar proveedores', pvProdNuevo: 'agregar productos nuevos', pvProdCrear: 'agregar productos nuevos', pvProdCancelar: 'agregar productos nuevos'});
['cpHacer', 'pvGuardar', 'pvActivar', 'pvProdCrear'].forEach(k => WRITE_ACTS.add(k));
Object.assign(ACT, {
  cpIrRecibir: el => { if (typeof CRX !== 'undefined') { CRX.por = null; CRX.pendSel = el.dataset.nro; CRX.msg = ''; } location.hash = '#c-recibir'; },
  pvNuevo: el => pvAbrir('', el.dataset.o || 'cat'), pvEditar: el => pvAbrir(el.dataset.id, el.dataset.o || 'cat'), pvGuardar: () => pvGuardar(), pvActivar: el => pvActivar(el.dataset.id, el.dataset.v === '1'),
  pvProdNuevo: () => pvProdNuevo(), pvProdCrear: () => pvProdCrear(), pvProdCancelar: () => pvProdCancelar(),
  cpProv: el => { CPD.prov = el.dataset.id; cpAlElegirProv(); },
  cpCambiarProv: () => { Object.assign(CPD, {prov: null, pq: '', bq: '', cant: {}, precio: {}, err: ''}); render(); },
  cpTodos: el => { CPD.todos = el.dataset.v === '1'; render(); },
  cpQty: el => cpQty(el.dataset.id, +el.dataset.d),
  cpCond: el => { CPD.cond = el.dataset.v; CPD.err = ''; cpRefrescarTotales(); },
  cpHacer: () => cpHacer()
});
