/* Pantalla de venta (Fase 1: despacho). Tres paneles en una sola pantalla:
   1) cliente y condiciones · 2) catálogo · 3) pedido y facturación. Cantidades solo enteras. */
const vPed = () => V.ped ||= {cid: null, cli: null, precios: {}, cant: {}, metodo: '', obs: '', cat: 'TODAS', verSin: false, cond: 'CREDITO', banco: '', ref: '', pag: 0};

/* Pedido en curso: se guarda en este navegador para no perderlo si se recarga la página */
const V_PED_LS = 'elmana:pedido-en-curso';
function vPedGuardar() {
  try {
    const P = V.ped; if (!P || !P.cid || !Object.keys(P.cant || {}).length) { localStorage.removeItem(V_PED_LS); return; }
    localStorage.setItem(V_PED_LS, JSON.stringify({cid: P.cid, cant: P.cant, metodo: P.metodo || '', obs: P.obs || '', rol: S.rol, ts: Date.now()}));
  } catch (e) { /* sin almacenamiento */ }
}
const vPedBorrarGuardado = () => { try { localStorage.removeItem(V_PED_LS); } catch (e) { /* sin almacenamiento */ } };
async function vPedRecuperar() {
  if (V.pedRec) return; V.pedRec = true;
  try {
    const g = JSON.parse(localStorage.getItem(V_PED_LS) || 'null'), P = vPed();
    if (!g || !g.cid || g.rol !== S.rol || !g.cant || Date.now() - g.ts > 86400e3 || P.cid) return;
    P.cant = g.cant; P.metodo = g.metodo || ''; P.obs = g.obs || '';
    await vPedElegir(g.cid);
    if (P.cli && Object.keys(P.cant).length) toast('Recuperamos el pedido que tenías sin terminar (' + esc(P.cli.razon_social) + '). Revísalo antes de generar el documento.', 'warn');
    else vPedBorrarGuardado();
  } catch (e) { /* si no se puede recuperar, se empieza de cero */ }
}
function vImg(p) {
  if (p.imagen_blanca_url) return `<img class="v-img" src="${esc(p.imagen_blanca_url)}" alt="${esc(p.nombre)}" loading="lazy">`;
  /* Sin foto todavía: un recuadro con el nombre (no se inventa ninguna imagen) */
  return `<span class="v-img v-img-n" role="img" aria-label="${esc(p.nombre)} ${esc(p.gramaje || '')}"><span>${esc(p.nombre)}<br>${esc(p.gramaje || '')}</span></span>`;
}
function vPedLineas() {
  const P = vPed(), out = [];
  for (const p of V.productos) {
    const q = P.cant[p.id_producto] || 0, pr = P.precios[p.id_producto]; if (!(q > 0) || !pr || pr.base == null) continue;
    out.push({id_producto: p.id_producto, p, cantidad: q, precio_base_cents: vc(pr.base), precio_pp_cents: vc(pr.pp), precio_mora_cents: vc(pr.mora), alicuota: p.alicuota_iva});
  }
  return out;
}
function vPedEstado() {
  const P = vPed(), ls = vPedLineas(), cli = P.cli;
  const tot = VD.totalesLineas(ls, 0, cli ? cli.descuento_fijo_pct : null);
  const lim = cli ? VD.revisarLimite(cli, cli.deuda_cents, tot.total) : {ok: true, sinLimite: true, disponible: null};
  const sinStock = ls.filter(l => l.cantidad > vDisp(l.p));
  const sinPeso = ls.filter(l => !VD.bultoCompleto(l.p));
  const motivo = !cli ? 'Elige un cliente.' : !ls.length ? 'Agrega al menos un producto.' : sinPeso.length ? 'Hay productos sin kg o sin unidades por bulto (' + sinPeso.map(l => l.p.nombre + ': falta ' + VD.faltaBulto(l.p)).join('; ') + '): el Dueño o Administración debe completarlo.' : sinStock.length ? 'Sin inventario: hay cantidades mayores que lo disponible.' : !lim.ok ? 'El pedido supera el crédito disponible del cliente.' : '';
  return {ls, tot, lim, sinStock, motivo};
}
const vDisp = p => p.disponible != null ? p.disponible : p.stock_entero;
const vModTxt = m => m === 'FACTURA_DIRECTA' ? 'Factura directa' : 'Nota de entrega';
const vPlazo = d => d == null ? '<span class="muted">sin definir</span>' : d + ' días';

function vPedP1() {
  const P = vPed(), cli = P.cli;
  if (!cli) return `<div class="v-p1-vacio">${vPicker('ped', null, P.q || '')}<button type="button" class="btn sm" data-act="vNuevoCliente">${ic('plus', 16)}Cliente nuevo</button></div>`;
  return `<div class="v-cli"><p class="v-cli-n">${vtxt(cli.razon_social)}</p><p class="mono">${vtxt(cli.rif_id || 'sin RIF')}${cli.ejemplo ? ' <span class="chip c-warn">EJEMPLO</span>' : ''}</p>
    <dl class="v-dl"><div><dt>Vendedor</dt><dd>${vtxt(cli.vendedor_nombre || '—')}</dd></div><div><dt>Estado · Zona · Lista</dt><dd>${vtxt(VD.estadoReal(cli.zona) || 'falta estado')}${VD.estadoReal(cli.zona) ? ' · ' + vtxt(VD.zonaDeEstado(cli.zona)) : ''} · ${P.lista ? 'Lista ' + vtxt(P.lista) : '<span class="v-alerta-i">sin precios</span>'}</dd></div>
    <div><dt>Modalidad habitual</dt><dd>${vModTxt(cli.modalidad_despacho_pref)}</dd></div><div><dt>Pronto pago hasta</dt><dd>${vPlazo(cli.dias_pronto_pago)}</dd></div>
    <div><dt>Crédito normal hasta</dt><dd>${vPlazo(cli.dias_credito_normal)}</dd></div><div><dt>Descuento fijo</dt><dd>${cli.descuento_fijo_pct != null ? N2.format(cli.descuento_fijo_pct) + ' %' : '<span class="muted">ninguno</span>'}</dd></div></dl>
    <div id="v-cred">${vPedCredito()}</div><button type="button" class="btn sm ghost" data-act="vCambiarCliente">Cambiar cliente</button></div>`;
}
function vPedCredito() {
  const P = vPed(), cli = P.cli; if (!cli) return '';
  const e = vPedEstado(), deuda = cli.deuda_cents / 100;
  if (cli.limite_credito_cents == null) return `<p class="v-cred"><span>Deuda y pedidos por despachar</span><b>${vusd(deuda)}</b></p><p class="hint">Este cliente no tiene límite de crédito definido: el sistema no bloquea por monto. ${vOk(true, 'sin límite')}</p>`;
  const lim = cli.limite_credito_cents / 100, usado = deuda + e.tot.total / 100, pct = Math.min(100, usado / lim * 100), tono = usado > lim ? 'crit' : pct >= 80 ? 'warn' : 'ok';
  return `<p class="v-cred"><span>Límite de crédito</span><b>${vusd(lim)}</b></p><p class="v-cred"><span>Deuda y pedidos por despachar</span><b>${vusd(deuda)}</b></p><p class="v-cred"><span>Disponible</span><b>${vusd(Math.max(0, lim - deuda))}</b></p>
    <div class="v-meter ${tono}" role="img" aria-label="Crédito usado con este pedido: ${N2.format(pct)} %"><span style="width:${pct}%"></span></div>
    <p class="hint">Con este pedido: ${vusd(usado)} de ${vusd(lim)} (${N0.format(Math.round(usado / lim * 100))} %).</p>
    ${usado > lim ? `<p class="v-alerta">${ic('alert', 16)}El pedido supera el crédito disponible. No se puede generar: pide al Dueño ampliar el límite o baja las cantidades.</p>` : ''}`;
}
function vPedTarjeta(p) {
  const P = vPed(), pr = P.precios[p.id_producto], q = P.cant[p.id_producto] || 0, sp = !VD.bultoCompleto(p), sinPrecio = !!P.cli && (!pr || pr.base == null), sinStock = vDisp(p) <= 0;
  const sin = !P.cli || sinPrecio || sinStock || sp;
  const cond = (P.cond || 'CREDITO') === 'CONTADO';
  const valor = !P.cli || sinPrecio ? null : (cond && pr.pp != null ? pr.pp : pr.base);
  const precio = valor == null ? '<b class="v-pv">—</b>' : '<b class="v-pv">' + vusd(valor) + '</b>';
  const etq = valor == null ? 'Precio por bulto' : 'por bulto' + (cond ? ' (contado)' : ' (crédito)');
  const aviso = sp ? 'No se puede vender: falta ' + VD.faltaBulto(p) : sinStock ? 'Sin inventario' : sinPrecio && !P.sinLista ? 'Sin precio' : '';
  return `<article class="v-prod ${q > 0 ? 'on' : ''} ${sin ? 'sin' : ''}" data-id="${p.id_producto}" title="${esc(p.nombre)} ${esc(p.gramaje || '')} · ${esc(p.codigo_sku)} · Hay ${N0.format(vDisp(p))} bultos disponibles">${vImg(p)}<div class="v-prod-b"><p class="v-prod-n">${vtxt(p.nombre)}</p><p class="v-prod-g">${vtxt(p.gramaje || '')}${p.unidades_por_bulto ? '<span class="v-ub">' + N0.format(p.unidades_por_bulto) + ' unidades por bulto</span>' : ''}${p.ejemplo ? ' · EJEMPLO' : ''}<span class="v-ex"> · ${sinStock ? 'Sin inventario' : 'Disponibles: ' + N0.format(vDisp(p)) + ' bultos'}</span></p>
    <p class="v-prod-p">${aviso ? `<span class="v-prod-s crit">${aviso}</span>` : `${precio}<span class="v-sub">${etq}</span>`}</p>
    ${P.cli && P.sinLista ? '' : `<div class="v-step"><button type="button" class="v-sb" data-act="vQty" data-id="${p.id_producto}" data-d="-1" aria-label="Quitar un bulto de ${esc(p.nombre)}" ${sin || q <= 0 ? 'aria-disabled="true"' : ''}>−</button>
    <input type="text" inputmode="numeric" pattern="[0-9]*" class="v-int v-q" data-id="${p.id_producto}" value="${q}" aria-label="Bultos de ${esc(p.nombre)} ${esc(p.gramaje || '')}" ${sin ? 'aria-disabled="true" readonly tabindex="-1"' : ''}>
    <button type="button" class="v-sb" data-act="vQty" data-id="${p.id_producto}" data-d="1" aria-label="Agregar un bulto de ${esc(p.nombre)}" ${sin ? 'aria-disabled="true"' : ''}>+</button></div>`}</div></article>`;
}
function vVista() { try { return localStorage.getItem('elmana:vista') === 'lista' ? 'lista' : 'tarjeta'; } catch (e) { return 'tarjeta'; } }
function vPedP2() {
  const P = vPed(), cats = [['TODAS', 'Todas'], ['PAPAS', 'Papas'], ['SALSAS', 'Salsas']];
  return `<div class="v-barra v-barra1"><input type="search" class="v-bq" ${Busca.atr('v-prod')} value="${esc(P.bq || '')}" placeholder="Buscar producto" aria-label="Buscar producto por nombre o código" maxlength="40"><div class="v-cats" role="group" aria-label="Categoría">${cats.map(([k, t]) => `<button type="button" class="v-cat" aria-pressed="${P.cat === k}" data-act="vCat" data-v="${k}">${t}${k === 'TODAS' ? ' (' + V.productos.length + ')' : ''}</button>`).join('')}</div><div class="v-vistas" role="group" aria-label="Ver catálogo como">${[['tarjeta', 'Tarjetas'], ['lista', 'Lista']].map(([k, t]) => `<button type="button" class="v-cat v-vista" aria-pressed="${vVista() === k}" data-act="vVista" data-v="${k}">${t}</button>`).join('')}</div></div>
    <div id="v-grid-w">${vPedGrid()}</div>`;
}
const V_PAG = (extra = 0) => {
  const lista = vVista() === 'lista';
  if (innerWidth < 1000) return lista ? 7 : 6;
  const el = document.querySelector('.v-3'), panel = (el && parseInt(el.style.getPropertyValue('--v-alto'))) || Math.max(460, innerHeight - 161);
  const w = (document.getElementById('v-grid-w') || {}).clientWidth || Math.round(innerWidth * 0.55 - 50);
  const alto = panel - 96 - extra; // alto del panel menos título, buscador/categorías, avisos y paginador
  if (lista) return Math.max(3, Math.floor(alto / 50));
  const cols = Math.max(1, Math.min(4, Math.floor((w + 5) / 305))); // igual que el CSS: columnas de 300 px como mínimo
  const alto2 = w < 560 ? alto - 44 : alto, fila = cols >= 3 ? 84 : 112; // con menos columnas la tarjeta ocupa más alto; si la barra de filtros baja de línea, se resta
  return cols * Math.max(2, Math.floor(alto2 / fila));
};
function vPedGrid() {
  const P = vPed();
  const lista = Busca.filtrar(V.productos.filter(p => P.cat === 'TODAS' || p.categoria === P.cat), P.bq, Busca.textosDe(V_DEF_PROD));
  const n = V_PAG(0), pags = Math.max(1, Math.ceil(lista.length / n)); P.pag = Math.min(Math.max(0, P.pag || 0), pags - 1);
  const vis = lista.slice(P.pag * n, P.pag * n + n);
  const pager = pags > 1 ? `<div class="v-pager"><button type="button" class="btn sm ghost" data-act="vPag" data-d="-1" ${P.pag <= 0 ? 'aria-disabled="true"' : ''}>← Anterior</button><span>Página ${P.pag + 1} de ${pags} · ${lista.length} productos</span><button type="button" class="btn sm ghost" data-act="vPag" data-d="1" ${P.pag >= pags - 1 ? 'aria-disabled="true"' : ''}>Siguiente →</button></div>` : '';
  const aviso = P.cli && P.sinLista ? `<p class="v-alerta v-sinlista" role="status">${ic('alert', 16)}<span><b>${esc(P.msgLista || 'Este cliente no tiene lista de precios.')}</b></span></p>` : '';
  return aviso + `<div class="v-grid ${vVista() === 'lista' ? 'v-lista' : ''}" id="v-grid">${vis.length ? vis.map(vPedTarjeta).join('') : '<p class="hint">Ningún producto coincide con la búsqueda.</p>'}</div>${pager}`;
}
function vPedP3() {
  const P = vPed(), e = vPedEstado(), cli = P.cli, lineas = e.ls;
  const filas = lineas.length ? `<ul class="v-lin">${lineas.map(l => `<li class="${l.cantidad > vDisp(l.p) ? 'mal' : ''}"><span class="v-lin-n">${vtxt(l.p.nombre)} ${vtxt(l.p.gramaje || '')}</span><span class="v-lin-c">${N0.format(l.cantidad)} bulto(s) (${N2.format(l.cantidad * (l.p.kg_por_bulto || 0))} kg) × ${vusd(l.precio_base_cents / 100)}</span><b>${vusd(l.cantidad * l.precio_base_cents / 100)}</b>${l.cantidad > vDisp(l.p) ? `<em>solo hay ${N0.format(vDisp(l.p))} bultos</em>` : ''}</li>`).join('')}</ul>` : '<p class="hint">Todavía no hay productos en el pedido.</p>';
  const t = e.tot, bsRef = t.total / 100 * S.tasa;
  const pref = cli ? cli.modalidad_despacho_pref : null, ocupado = V.busy.vender;
  const hoy = new Date().toLocaleDateString('es-VE', {day: '2-digit', month: '2-digit', year: 'numeric'});
  return `<div class="v-p3w"><div class="v-p3-l"><dl class="v-op"><div><dt>Nº de pedido</dt><dd>Se asigna al registrar</dd></div><div><dt>Kilos del pedido</dt><dd>${N2.format(lineas.reduce((a, l) => a + l.cantidad * (l.p.kg_por_bulto || 0), 0))} kg</dd></div><div><dt>Fecha</dt><dd>${hoy}</dd></div></dl>${filas}</div><div class="v-p3-f"><div class="v-tot"><p><span>Subtotal</span><b>${vusd(t.subtotal / 100)}</b></p><p><span>Descuento${cli && cli.descuento_fijo_pct ? ' ' + N2.format(cli.descuento_fijo_pct) + ' %' : ''}</span><b>${t.descuento ? '- ' + vusd(t.descuento / 100) : vusd(0)}</b></p><p><span>IVA</span><b>${vusd(t.iva / 100)}</b></p>
    <p class="v-tot-t"><span>Total</span><b>${vusd(t.total / 100)}</b></p><p class="hint v-ref">${S.tasa > 0 ? `≈ ${vbs(bsRef)} a la tasa BCV ${N2.format(S.tasa)}${S.tasaInfo && S.tasaInfo.respaldo ? ' (última guardada: la consulta de hoy falló)' : ''}` : 'Sin tasa BCV guardada todavía.'}</p></div>
    <div class="row2">${vMetodoBanco(P)}<label class="fld">Observaciones<input type="text" data-vk="ped.obs" value="${esc(P.obs)}" placeholder="Opcional" maxlength="300"></label></div>
    <fieldset class="v-cond"><legend>¿Cómo paga?</legend><div class="v-vistas" role="group" aria-label="Condición de pago">${[['CREDITO', 'A crédito'], ['CONTADO', 'Pagó ahora']].filter(([k]) => k !== 'CONTADO' || lvlOf(S.rol, 'v-cobro') >= 2).map(([k, t]) => `<button type="button" class="v-cat" aria-pressed="${(P.cond || 'CREDITO') === k}" data-act="vCond" data-v="${k}">${t}</button>`).join('')}</div>
    ${(P.cond || 'CREDITO') === 'CONTADO' ? `<div class="row2">${vBancoCampo('ped', P, 'Escribe el banco')}<label class="fld">Nº de referencia<input type="text" data-vk="ped.ref" value="${esc(P.ref || '')}" maxlength="40" inputmode="numeric"></label></div><p class="hint v-h1">Entra el dinero ahora a precio de pronto pago; no queda deuda.</p>` : `<p class="hint v-h1">Cuenta por cobrar${cli && cli.dias_credito_normal != null ? ' a ' + cli.dias_credito_normal + ' días' : ''}; el pago se carga después.</p>`}</fieldset>
    ${e.motivo ? `<p class="hint v-motivo">${ic('info', 14)}${e.motivo}</p>` : ''}
    <div class="v-acc"><button type="button" class="btn acc ${pref === 'NOTA_ENTREGA' ? 'v-pref' : ''}" data-act="vGenerar" data-t="NOTA_ENTREGA" ${e.motivo || ocupado ? 'disabled' : ''}>REGISTRAR PEDIDO · NOTA DE ENTREGA</button>
    <button type="button" class="btn pri ${pref === 'FACTURA_DIRECTA' ? 'v-pref' : ''}" data-act="vGenerar" data-t="FACTURA" ${e.motivo || ocupado ? 'disabled' : ''}>REGISTRAR PEDIDO · FACTURA</button></div></div></div>`;
}
function scrPedido() {
  return vPantalla(() => {
    if (!V.pedRec) vPedRecuperar();
    const e = vPedEstado();
    return `<div class="v-3"><section class="card v-p1" aria-labelledby="vp1t"><div class="card-h"><h2 id="vp1t">Cliente y condiciones</h2></div><div class="card-b" id="vp1">${vPedP1()}</div></section>
    <section class="card v-p2" aria-labelledby="vp2t"><div class="card-h"><h2 id="vp2t">Catálogo</h2></div><div class="card-b" id="vp2">${vPedP2()}</div></section>
    <section class="card v-p3" aria-labelledby="vp3t"><div class="card-h"><h2 id="vp3t">Pedido y facturación</h2></div><div class="card-b" id="vp3">${vPedP3()}</div></section></div>
    <div class="v-bar noprint"><span id="v-bar-n">${e.ls.length} producto(s)</span><b id="v-bar-t">${vusd(e.tot.total / 100)}</b><a class="btn sm acc" href="#vp3" data-act="vIrPedido">Ver pedido</a></div>`;
  });
}
function vPedRefrescar(soloTotales) {
  vPedGuardar();
  const c = $('#v-cred'), p3 = $('#vp3'), bar = $('#v-bar-t'); if (!p3) return;
  const act = document.activeElement, keep = act && act.dataset && act.dataset.vk ? [act.dataset.vk, act.selectionStart] : null;
  if (c) c.innerHTML = vPedCredito(); p3.innerHTML = vPedP3(); if (bar) bar.textContent = vusd(vPedEstado().tot.total / 100); const bn = $('#v-bar-n'); if (bn) bn.textContent = vPedEstado().ls.length + ' producto(s)';
  if (keep) { const n = p3.querySelector(`[data-vk="${keep[0]}"]`); if (n) { n.focus(); try { n.setSelectionRange(keep[1], keep[1]); } catch (e) { /* tipo sin selección */ } } }
}
function vPedTarjetaRefrescar(id) {
  const p = V.productos.find(x => x.id_producto === id), el = document.querySelector(`.v-prod[data-id="${id}"]`); if (!p || !el) return;
  const q = vPed().cant[id] || 0; el.classList.toggle('on', q > 0);
  const inp = el.querySelector('.v-q'); if (inp && inp !== document.activeElement) inp.value = q;
  const bs = el.querySelectorAll('.v-sb'); if (bs[0]) { if (q <= 0) bs[0].setAttribute('aria-disabled', 'true'); else bs[0].removeAttribute('aria-disabled'); }
}
function vPedBloqueo(p) {
  const P = vPed(), pr = P.precios[p.id_producto];
  if (!P.cli) return 'Primero elige un cliente en el panel de la izquierda: los precios dependen de él.';
  if (!pr || pr.base == null) return 'Este producto no tiene precio cargado para este cliente.';
  if (!VD.bultoCompleto(p)) return 'A este producto le falta ' + VD.faltaBulto(p) + ', así que no se puede vender. El Dueño o Administración debe completarlo en Clientes, catálogo y ajustes → Productos e inventario.';
  if (vDisp(p) <= 0) return 'Sin inventario: este producto no tiene bultos disponibles.';
  return '';
}
function vPedPonerCantidad(id, n, delta) {
  const p = V.productos.find(x => x.id_producto === id); if (!p) return;
  const bl = vPedBloqueo(p), cur = vPed().cant[id] || 0;
  const volver = () => { const i = document.querySelector(`.v-q[data-id="${id}"]`); if (i) i.value = cur; };
  if (bl) { volver(); return toast(bl, 'warn'); }
  if (delta < 0 && cur <= 0) return toast('La cantidad ya está en 0: no hay nada que quitar.', 'warn');
  if (n > vDisp(p)) { toast('Solo hay ' + N0.format(vDisp(p)) + ' bultos disponibles de ' + esc(p.nombre) + '.', 'warn'); n = vDisp(p); if (n === cur) return volver(); }
  n = Math.max(0, Math.min(n, 999999)); vPed().cant[id] = n; if (!n) delete vPed().cant[id];
  vPedTarjetaRefrescar(id); vPedRefrescar();
}
async function vPedElegir(id) {
  try {
    const r = await vApi('GET', '/clientes/' + id + '/precios'), P = vPed();
    P.cid = id; P.cli = {...r.cliente, deuda_cents: r.cliente.deuda_cents + Math.round((r.comprometido || 0) * 100)}; P.lista = r.lista || null; P.sinLista = !!r.sin_lista; P.msgLista = r.mensaje_sin_lista || ''; P.precios = Object.fromEntries(r.precios.map(x => [x.id_producto, x]));
    // si hay productos sin precio para este cliente, se quitan del pedido
    for (const k of Object.keys(P.cant)) if (!P.precios[k] || P.precios[k].base == null) delete P.cant[k];
    vPedGuardar(); render();
  } catch (e) { vErr(e); }
}
async function vPedGenerar(tipo) {
  const P = vPed(), e = vPedEstado(); if (e.motivo) return toast(esc(e.motivo), 'warn');
  const contado = P.cond === 'CONTADO';
  if (contado && (!vBancoListo(P) || !(P.ref || '').trim())) return toast('Para cobrar ahora escribe el banco y el número de referencia.', 'warn');
  const L = V.bancos, hayBancos = !!(L && L.bancos && L.bancos.length);
  if (contado && hayBancos && !P.metodo) { const b = L.bancos.find(x => String(x.id) === String(P.id_banco)); if (b) P.metodo = b.nombre; }
  if (hayBancos && !P.metodo) { const f = document.querySelector('select[data-vk="ped.metodo"]'); if (f) { f.focus(); f.classList.add('v-falta'); } return toast('Elige el banco en «Método de pago» antes de generar el documento.', 'warn'); }
  const body = {id_cliente: P.cid, tipo, metodo_pago: P.metodo, observaciones: P.obs, lineas: e.ls.map(l => ({id_producto: l.id_producto, cantidad: l.cantidad}))};
  if (contado) body.pago = {banco: P.banco, id_banco: P.id_banco || undefined, referencia: P.ref}; // la tasa la pone el servidor (BCV)
  const r = await vRun('vender', () => vApi('POST', '/ventas', body), x => 'Pedido ' + esc(x.nro_pedido) + ' registrado (zona ' + esc(x.zona) + ', ' + N2.format(x.kilos) + ' kg). La ' + (tipo === 'FACTURA' ? 'factura' : 'nota de entrega') + ' sale cuando se despache.' + (x.condicion === 'CONTADO' ? ' Se cobra al despachar.' : '') + (x.aviso_envio ? ' AVISO: ' + esc(x.aviso_envio) : ''));
  if (!r) { if (V.err === null) { /* el error ya se avisó */ } await vBoot(true); return; }
  if (r.pago_error) toast('La venta quedó a crédito porque el pago no se registró: ' + esc(r.pago_error), 'warn');
  P.banco = ''; P.id_banco = ''; P.ref = ''; P.cond = 'CREDITO';
  const cid = P.cid; P.cant = {}; P.obs = ''; P.metodo = ''; vPedBorrarGuardado();
  V.clientes = null; V.deuda.data = null; V.deuda.base = null; await vBoot(true); await vPedElegir(cid);
  if (r.id_pedido) modal('Venta registrada', `<p>El pedido <b>${esc(r.nro_pedido)}</b> quedó registrado. Ya puedes descargar el PDF de la ${tipo === 'FACTURA' ? 'factura' : 'nota de entrega'} para entregarlo al cliente.</p>
    <p class="hint">Este PDF dice «Pedido / ${tipo === 'FACTURA' ? 'Factura' : 'Nota de entrega'}». Al despachar se emite el documento definitivo con su número.</p>
    <div class="btnrow"><button type="button" class="btn acc" data-act="vPdfPed" data-id="${r.id_pedido}">${ic('download', 16)}Descargar PDF de la ${tipo === 'FACTURA' ? 'factura' : 'nota de entrega'}</button><button type="button" class="btn" data-act="closeModal">Cerrar</button></div>`);
}

/* Método de pago previsto: lista plegable con los bancos cargados (si no hay bancos, se escribe) */
function vMetodoBanco(P) {
  const L = vBancos();
  if (!L || !L.bancos.length) return '<label class="fld">Método de pago (banco)<input type="text" data-vk="ped.metodo" value="' + esc(P.metodo) + '" placeholder="Opcional" maxlength="40"></label>';
  return '<label class="fld">Método de pago (banco)<select data-vk="ped.metodo"><option value="">Elige el banco…</option>' + L.bancos.map(b => '<option value="' + esc(b.nombre) + '"' + (P.metodo === b.nombre ? ' selected' : '') + '>' + esc(b.nombre + ' (' + b.moneda_txt.toLowerCase() + ')') + '</option>').join('') + '</select></label>';
}
