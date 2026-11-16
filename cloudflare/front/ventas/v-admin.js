/* Clientes, catálogo, vendedores y ajustes del módulo. Lo que define dinero (precios, plazos, límites, comisiones, numeración fiscal, PIN) lo edita solo el Gerente. */
const vVal = id => { const e = document.getElementById(id); return e ? e.value : ''; };
const vDec = id => { const s = vVal(id); if (s.trim() === '') return ''; const n = vNum(s); return Number.isNaN(n) ? NaN : n; };
const vFld = (id, t, v, o = {}) => `<label class="fld">${t}<input type="${o.type || 'text'}" id="${id}" value="${esc(v ?? '')}" ${o.ph ? `placeholder="${esc(o.ph)}"` : ''} ${o.max ? `maxlength="${o.max}"` : ''} ${o.inputmode ? `inputmode="${o.inputmode}"` : ''} ${o.dis ? 'disabled' : ''}>${o.sm ? `<small>${o.sm}</small>` : ''}</label>`;

/* ---------- Clientes ---------- */
async function vAdmClientes() { try { V.adm.clientes = await vApi('GET', '/clientes?limite=500'); } catch (e) { vErr(e); V.adm.clientes = []; } render(); }
function vClienteModal(c) {
  const dueno = lvl('v-clientes') >= 3, nuevo = !c; c = c || {modalidad_despacho_pref: 'NOTA_ENTREGA'};
  const cond = dueno ? `<h3 class="v-h3">Condiciones comerciales (las define el Gerente)</h3><div class="row2">${vFld('vc-desc', 'Descuento fijo (%)', c.descuento_fijo_pct, {inputmode: 'decimal', ph: 'ninguno'})}${vFld('vc-lim', 'Límite de crédito ($)', c.limite_credito_cents == null ? '' : c.limite_credito_cents / 100, {inputmode: 'decimal', ph: 'sin límite'})}</div>
      <div class="row2">${vFld('vc-pp', 'Días de pronto pago', c.dias_pronto_pago, {inputmode: 'numeric', ph: 'sin definir', sm: 'Pagando hasta este día desde la emisión se aplica el precio de pronto pago.'})}${vFld('vc-cr', 'Días de crédito normal', c.dias_credito_normal, {inputmode: 'numeric', ph: 'sin definir', sm: 'Pasado este día se aplica el precio de mora.'})}</div>` : '';
  modal(nuevo ? 'Cliente nuevo' : 'Cliente: ' + vtxt(c.razon_social), `<div class="form">${vFld('vc-rs', 'Razón social o nombre', c.razon_social, {max: 150})}<div class="row2">${vFld('vc-rif', 'RIF o identificación', c.rif_id, {max: 20})}<label class="fld">Estado del cliente (obligatorio)<select id="vc-zona">${vZonaOpciones(c.zona)}</select></label></div>${vFld('vc-dir', 'Dirección de entrega', c.direccion_entrega, {max: 200})}<p class="hint" id="vc-lista-t">${vListaTxt(c.zona)}</p>
    <div class="row3"><label class="fld">Vendedor<select id="vc-vend"><option value="">Sin vendedor</option>${V.vendedores.map(v => `<option value="${v.id}" ${c.id_vendedor === v.id ? 'selected' : ''}>${vtxt(v.nombre)}</option>`).join('')}</select></label>
    <label class="fld">Modalidad habitual<select id="vc-mod"><option value="NOTA_ENTREGA" ${c.modalidad_despacho_pref === 'NOTA_ENTREGA' ? 'selected' : ''}>Nota de entrega</option><option value="FACTURA_DIRECTA" ${c.modalidad_despacho_pref === 'FACTURA_DIRECTA' ? 'selected' : ''}>Factura directa</option></select></label>${vFld('vc-tel', 'Teléfono', c.telefono, {max: 30})}</div>
    ${cond}<p class="err" id="vc-e" role="alert" hidden></p><div class="btnrow"><button type="button" class="btn pri" data-act="vClienteGuardar" data-id="${c.id_cliente || ''}">Guardar</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`);
}
/* Estado → zona → lista de precios (automático). Los 24 estados se pueden elegir; los que no tienen lista salen marcados "sin precios". */
function vZonaOpciones(actual) {
  const real = VD.estadoReal(actual), op = n => { const l = VD.listaDeEstado(n); return '<option value="' + n + '" ' + (n === real ? 'selected' : '') + '>' + n + (l ? ' · Lista ' + esc(l) : ' · sin precios') + '</option>'; };
  const con = VD.ESTADOS.filter(n => VD.listaDeEstado(n)), sin = VD.ESTADOS.filter(n => !VD.listaDeEstado(n));
  return '<option value="">Elige el estado…</option>' + (actual && !real ? '<option value="' + esc(actual) + '" selected>' + esc(actual) + ' (no es un estado: elige otro)</option>' : '') +
    '<optgroup label="Con lista de precios">' + con.map(op).join('') + '</optgroup><optgroup label="Sin precios (no se vende hasta que el Gerente asigne lista)">' + sin.map(op).join('') + '</optgroup>';
}
const vListaTxt = est => { const e = VD.estadoReal(est); if (!e) return 'Estado · Zona · Lista: <b>falta elegir el estado</b>. De ahí sale la lista de precios.'; const l = VD.listaDeEstado(e);
  return 'Estado · Zona · Lista: <b>' + e + ' · ' + VD.zonaDeEstado(e) + ' · ' + (l ? 'Lista ' + esc(l) : 'sin precios') + '</b>' + (l ? '' : '<br><span class="v-alerta-i">' + VD.MSG_SIN_LISTA_ESTADO + '</span>'); };
async function vClienteGuardar(id) {
  const dueno = lvl('v-clientes') >= 3, b = {razon_social: vVal('vc-rs'), rif_id: vVal('vc-rif'), zona: vVal('vc-zona'), direccion_entrega: vVal('vc-dir'), telefono: vVal('vc-tel'), id_vendedor: vVal('vc-vend'), modalidad_despacho_pref: vVal('vc-mod')};
  if (dueno) Object.assign(b, {descuento_fijo_pct: vDec('vc-desc'), limite_credito_usd: vDec('vc-lim'), dias_pronto_pago: vDec('vc-pp'), dias_credito_normal: vDec('vc-cr')});
  const e = $('#vc-e'); e.hidden = true;
  try { const rc = await vApi(id ? 'PUT' : 'POST', '/clientes' + (id ? '/' + id : ''), b); closeModal(); toast(rc && rc.aviso_lista ? 'Cliente guardado. ' + esc(rc.aviso_lista) : 'Cliente guardado.'); V.clientes = null; await vAdmClientes(); if (V.ped && V.ped.cid) vPedElegir(V.ped.cid); }
  catch (er) { e.textContent = er.message; e.hidden = false; }
}
async function vReglasModal(idCliente) {
  try {
    const r = await vApi('GET', '/clientes/' + idCliente + '/precios'), rm = Object.fromEntries(r.reglas.map(x => [x.id_producto, x])), pm = Object.fromEntries(r.precios.map(x => [x.id_producto, x])), cd = x => x == null ? '' : x / 100;
    modal('Precios por producto: ' + vtxt(r.cliente.razon_social), `<div class="form">
      <div class="tw"><table class="v-reglas"><thead><tr><th>Producto</th><th class="r">Rige hoy, por bulto</th><th class="r">A crédito, por bulto ($)</th><th class="r">Pronto pago, por bulto ($)</th><th class="r">Con mora, por bulto ($)</th><th class="r">Dcto. PP %</th><th class="r">Recargo mora %</th></tr></thead><tbody>
      ${V.productos.map(p => { const x = rm[p.id_producto] || {}; return `<tr data-p="${p.id_producto}"><td>${vtxt(p.nombre)} ${vtxt(p.gramaje || '')}</td><td class="r">${(pm[p.id_producto] || {}).base == null ? '—' : vusd(pm[p.id_producto].base)}</td>
        <td><input class="v-dec" data-r="base" value="${cd(x.precio_base_credito_cents)}"></td><td><input class="v-dec" data-r="pp" value="${cd(x.precio_pronto_pago_cents)}"></td><td><input class="v-dec" data-r="mora" value="${cd(x.precio_mora_vencido_cents)}"></td>
        <td><input class="v-dec" data-r="dpp" value="${x.pct_descuento_pp ?? ''}"></td><td><input class="v-dec" data-r="rm" value="${x.pct_recargo_mora ?? ''}"></td></tr>`; }).join('')}</tbody></table></div>
      <p class="err" id="vr-e" role="alert" hidden></p><div class="btnrow"><button type="button" class="btn pri" data-act="vReglasGuardar" data-id="${idCliente}">Guardar precios</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`);
  } catch (e) { vErr(e); }
}
async function vReglasGuardar(id) {
  const g = (tr, k) => { const v = tr.querySelector(`[data-r="${k}"]`).value; return v.trim() === '' ? '' : vNum(v); };
  const reglas = [...document.querySelectorAll('.v-reglas tbody tr')].map(tr => ({id_producto: +tr.dataset.p, precio_base_credito: g(tr, 'base'), precio_pronto_pago: g(tr, 'pp'), precio_mora_vencido: g(tr, 'mora'), pct_descuento_pp: g(tr, 'dpp'), pct_recargo_mora: g(tr, 'rm')}));
  const e = $('#vr-e'); e.hidden = true;
  try { await vApi('PUT', '/clientes/' + id + '/reglas', {reglas}); closeModal(); toast('Precios del cliente guardados.'); if (V.ped && V.ped.cid === id) vPedElegir(id); }
  catch (er) { e.textContent = er.message; e.hidden = false; }
}

/* ---------- Productos ---------- */
const vImgInterna = u => /^\/api\/v\/productos\/\d+\/imagen/.test(u || '');
function vProductoModal(p) {
  const nuevo = !p; p = p || {categoria: 'PAPAS', alicuota_iva: 16};
  V.pImg = {orig: p.imagen_blanca_url || null, nueva: null, quitar: false, ocupado: false};
  modal(nuevo ? 'Producto nuevo' : 'Producto: ' + vtxt(p.nombre), `<div class="form"><div class="row2">${vFld('vp-sku', 'SKU', p.codigo_sku, {max: 30})}${vFld('vp-nom', 'Nombre', p.nombre, {max: 120})}</div>
    <div class="row3">${vFld('vp-gr', 'Gramaje', p.gramaje, {max: 25})}<label class="fld">Categoría<select id="vp-cat"><option value="PAPAS" ${p.categoria === 'PAPAS' ? 'selected' : ''}>Papas</option><option value="SALSAS" ${p.categoria === 'SALSAS' ? 'selected' : ''}>Salsas</option></select></label>${vFld('vp-iva', 'IVA (%)', p.alicuota_iva, {inputmode: 'decimal'})}</div>
    <div class="fld"><span>Imagen del producto (fondo blanco)</span><div class="v-imgsel"><div id="vp-prev" class="v-imgprev"></div>
      <div class="btnrow"><label class="btn" id="vp-elegir"><span id="vp-elegir-t">Elegir imagen</span><input type="file" id="vp-file" accept="image/*" hidden></label><button type="button" class="btn" id="vp-quitar" hidden>Quitar</button></div></div>
      <small class="hint" id="vp-imgmsg">Opcional. Se reduce sola para que pese poco.</small></div>
    <p class="err" id="vp-e" role="alert" hidden></p><div class="btnrow"><button type="button" class="btn pri" data-act="vProductoGuardar" data-id="${p.id_producto || ''}">Guardar</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`);
  vProdImgPintar();
}
function vProdImgPintar() {
  const I = V.pImg, prev = $('#vp-prev'); if (!prev) return;
  const hay = !!(I.nueva || (!I.quitar && I.orig));
  prev.innerHTML = I.nueva ? `<img src="data:image/jpeg;base64,${I.nueva.b64}" alt="Vista previa">` : hay ? (vImgInterna(I.orig) ? `<img src="${V_PIXEL}" data-vsrc="${esc(I.orig)}" alt="Imagen actual">` : `<img src="${esc(I.orig)}" alt="Imagen actual">`) : '<span class="hint">Sin imagen</span>';
  $('#vp-elegir-t').textContent = I.ocupado ? 'Preparando…' : hay ? 'Cambiar' : 'Elegir imagen';
  $('#vp-quitar').hidden = !hay;
  if (I.nueva) $('#vp-imgmsg').textContent = 'Lista: pesa ' + Math.max(1, Math.round(I.nueva.bytes / 1024)) + ' KB. Se guardará al pulsar Guardar.';
}
document.addEventListener('change', async e => {
  if (!e.target || e.target.id !== 'vp-file') return;
  const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f || !V.pImg) return;
  const er = $('#vp-e'); er.hidden = true; V.pImg.ocupado = true; vProdImgPintar();
  try { V.pImg.nueva = await vComprimirImagen(f); V.pImg.quitar = false; }
  catch (x) { er.textContent = x.message; er.hidden = false; }
  V.pImg.ocupado = false; vProdImgPintar();
});
document.addEventListener('click', e => { if (e.target && e.target.id === 'vp-quitar' && V.pImg) { V.pImg.nueva = null; V.pImg.quitar = true; $('#vp-imgmsg').textContent = 'La imagen se quitará al pulsar Guardar.'; vProdImgPintar(); } });
async function vProductoGuardar(id) {
  const I = V.pImg || {}, e = $('#vp-e');
  if (I.ocupado) { e.textContent = 'Espera un momento: la imagen se está preparando.'; e.hidden = false; return; }
  const b = {codigo_sku: vVal('vp-sku'), nombre: vVal('vp-nom'), gramaje: vVal('vp-gr'), categoria: vVal('vp-cat'), alicuota_iva: vDec('vp-iva'), imagen_blanca_url: I.quitar ? null : (I.orig || null)}; e.hidden = true;
  try {
    const r = await vApi(id ? 'PUT' : 'POST', '/productos' + (id ? '/' + id : ''), b), pid = id || (r && r.id_producto);
    if (I.nueva) {
      try { if (!pid) throw new Error('no se pudo identificar el producto nuevo'); await vApi('PUT', '/productos/' + pid + '/imagen', {imagen_base64: I.nueva.b64}); }
      catch (x) { await vBoot(true); closeModal(); toast('El producto se guardó, pero la imagen no: ' + esc(x.message) + '. Ábrelo y súbela de nuevo.', 'warn'); return; }
    }
    closeModal(); toast('Producto guardado.'); await vBoot(true);
  }
  catch (er) { e.textContent = er.message; e.hidden = false; }
}
/* Total de kilos del producto terminado (solo de los que tienen peso; los demás se cuentan aparte, sin inventar kilos) */
function vTotalKilos(lista) {
  const con = lista.filter(VD.tienePesoBulto), sin = lista.length - con.length, inc = lista.filter(p => !VD.bultoCompleto(p)).length;
  const kg = con.reduce((a, p) => a + VD.kilosDeBultos(p.stock_entero, p.kg_por_bulto), 0), bu = lista.reduce((a, p) => a + p.stock_entero, 0);
  return `<p class="v-totkg"><b>Total: ${N0.format(bu)} bultos</b> · <b>${N2.format(kg)} kg</b> (${N2.format(kg / 1000)} t)${sin ? ` · <span class="chip c-warn">${sin} producto(s) sin kg por bulto: sus kilos no se suman</span>` : ''}${inc ? ` · <span class="chip c-warn">${inc} producto(s) con datos de bulto incompletos (kg y unidades): no se pueden vender</span>` : ''}</p>`;
}
function vPesoModal(p) {
  modal('Peso de bulto: ' + vtxt(p.nombre) + ' ' + vtxt(p.gramaje || ''), `<div class="form">
    <div class="row2">${vFld('vw-kg', 'Kilos por bulto', p.kg_por_bulto == null ? '' : p.kg_por_bulto, {inputmode: 'decimal', ph: 'sin cargar'})}${vFld('vw-un', 'Unidades por bulto', p.unidades_por_bulto == null ? '' : p.unidades_por_bulto, {inputmode: 'numeric', ph: 'sin cargar'})}</div>
    <p class="err" id="vw-e" role="alert" hidden></p><div class="btnrow"><button type="button" class="btn pri" data-act="vPesoGuardar" data-id="${p.id_producto}">Guardar</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`);
  $('#vw-kg').focus();
}
async function vPesoGuardar(id) {
  const e = $('#vw-e'); e.hidden = true;
  try { await vApi('PUT', '/productos/' + id + '/peso', {kg_por_bulto: vDec('vw-kg'), unidades_por_bulto: vDec('vw-un')}); closeModal(); toast('Kg y unidades por bulto guardados.'); await vBoot(true); }
  catch (er) { e.textContent = er.message; e.hidden = false; }
}
function vEntradaModal(p) {
  modal('Entrada de inventario: ' + vtxt(p.nombre) + ' ' + vtxt(p.gramaje || ''), `<div class="form"><p>Existencias actuales: <b>${N0.format(p.stock_entero)}</b> bultos. La producción entra sola al cerrar el turno; esto es solo para correcciones del Gerente.</p>
    <label class="fld">Bultos que entran (número entero)<input type="text" inputmode="numeric" class="v-int" id="ve-q" maxlength="7"></label>${vFld('ve-n', 'Motivo (obligatorio)', '', {max: 100, ph: 'Por qué se suman estos bultos'})}<p class="err" id="ve-e" role="alert" hidden></p>
    <div class="btnrow"><button type="button" class="btn pri" data-act="vEntradaGuardar" data-id="${p.id_producto}">Registrar entrada</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`);
  $('#ve-q').focus();
}
async function vEntradaGuardar(id) {
  const e = $('#ve-e'); e.hidden = true;
  try { await vApi('POST', '/productos/' + id + '/entrada', {cantidad: +vVal('ve-q'), nota: vVal('ve-n')}); closeModal(); toast('Entrada registrada.'); await vBoot(true); }
  catch (er) { e.textContent = er.message; e.hidden = false; }
}

/* ---------- Vendedores ---------- */
function vVendedorModal(v) {
  const nuevo = !v; v = v || {};
  modal(nuevo ? 'Vendedor nuevo' : 'Vendedor: ' + vtxt(v.nombre), `<div class="form">${vFld('vv-nom', 'Nombre', v.nombre, {max: 80})}${vFld('vv-pct', 'Comisión (% de la base neta cobrada, sin IVA)', v.comision_pct, {inputmode: 'decimal', ph: 'sin definir', sm: 'Vacío: la comisión queda sin calcular, no se inventa un porcentaje.'})}
    <p class="err" id="vv-e" role="alert" hidden></p><div class="btnrow"><button type="button" class="btn pri" data-act="vVendedorGuardar" data-id="${v.id || ''}">Guardar</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`);
}
async function vVendedorGuardar(id) {
  const e = $('#vv-e'); e.hidden = true;
  try { await vApi(id ? 'PUT' : 'POST', '/vendedores' + (id ? '/' + id : ''), {nombre: vVal('vv-nom'), comision_pct: vDec('vv-pct')}); closeModal(); toast('Vendedor guardado.'); await vBoot(true); }
  catch (er) { e.textContent = er.message; e.hidden = false; }
}

/* ---------- Ajustes ---------- */
async function vAjustesGuardar() {
  const b = {}; for (const [k, id] of [['membrete_razon', 'va-razon'], ['membrete_rif', 'va-rif'], ['membrete_direccion', 'va-dir'], ['membrete_telefono', 'va-tel'], ['fiscal_prefijo_factura', 'va-pf'], ['fiscal_prefijo_nc', 'va-pc'], ['fiscal_prefijo_nd', 'va-pd'], ['dias_alerta_deuda', 'va-alerta'], ['ref_corta_max', 'va-ref'], ['siguiente_factura', 'va-sf'], ['siguiente_nc', 'va-sc'], ['siguiente_nd', 'va-sd']]) b[k] = vVal(id);
  await vRun('ajustes', () => vApi('PUT', '/config', b), 'Ajustes guardados.'); await vBoot(true);
}
async function vPinGuardar() { const p = vVal('va-pin'); await vRun('pin', () => vApi('PUT', '/pin', {pin: p}), 'PIN de gerencia guardado.'); await vBoot(true); }
function vAjustesHTML() {
  const dueno = lvl('v-clientes') >= 3, c = V.cfg, dis = !dueno, s = V.seq || {};
  const ej = V.ejemplo || {};
  return `${!dueno ? '' : ''}
    ${card('Membrete de los documentos', `<div class="form"><div class="row2">${vFld('va-razon', 'Razón social', c.membrete_razon, {dis, max: 150})}${vFld('va-rif', 'RIF', c.membrete_rif, {dis, max: 30})}</div><div class="row2">${vFld('va-dir', 'Dirección fiscal', c.membrete_direccion, {dis, max: 150})}${vFld('va-tel', 'Teléfono', c.membrete_telefono, {dis, max: 40})}</div></div>`, {})}
    ${card('Numeración fiscal (por confirmar con el contador)', `<div class="form">
      <div class="row3">${vFld('va-pf', 'Prefijo de facturas', c.fiscal_prefijo_factura, {dis, max: 10})}${vFld('va-pc', 'Prefijo de notas de crédito', c.fiscal_prefijo_nc, {dis, max: 10})}${vFld('va-pd', 'Prefijo de notas de débito', c.fiscal_prefijo_nd, {dis, max: 10})}</div>
      <div class="row3">${vFld('va-sf', 'Próximo número de factura', (s.factura || 0) + 1, {dis, inputmode: 'numeric'})}${vFld('va-sc', 'Próximo número de nota de crédito', (s.nc || 0) + 1, {dis, inputmode: 'numeric'})}${vFld('va-sd', 'Próximo número de nota de débito', (s.nd || 0) + 1, {dis, inputmode: 'numeric'})}</div></div>`)}
    ${card('Cobranza', `<div class="form"><div class="row2">${vFld('va-ref', 'Referencia completa desde (caracteres)', c.ref_corta_max, {dis, inputmode: 'numeric', sm: 'Una referencia con menos caracteres solo se considera repetida si también coincide el monto.'})}${vFld('va-alerta', 'Marcar deuda como urgente desde (días)', c.dias_alerta_deuda, {dis, inputmode: 'numeric', ph: 'sin definir', sm: 'Vacío: no se marca ninguna.'})}</div>
      ${dueno ? `<div class="btnrow"><button type="button" class="btn pri" data-act="vAjustesGuardar">Guardar ajustes</button></div>` : ''}</div>`)}
    ${card('PIN de gerencia', dueno ? `<div class="form"><p class="hint">${V.pin ? 'Ya hay un PIN configurado.' : 'Todavía no hay PIN: sin él no se pueden registrar pagos con fecha anterior ni exonerar recargos.'} Se guarda cifrado; nunca se muestra.</p><div class="row2">${vFld('va-pin', V.pin ? 'Nuevo PIN (4 a 12 dígitos)' : 'PIN (4 a 12 dígitos)', '', {type: 'password', inputmode: 'numeric', max: 12})}<div class="v-rap"><button type="button" class="btn pri" data-act="vPinGuardar">${V.pin ? 'Cambiar PIN' : 'Crear PIN'}</button></div></div></div>` : '')}
    ${card('Datos de ejemplo', dueno ? `<div class="form"><p class="hint">Ahora hay ${ej.clientes || 0} cliente(s), ${ej.documentos || 0} documento(s), ${ej.pagos || 0} pago(s) y ${ej.productos || 0} producto(s) de ejemplo (todos marcados EJEMPLO, con nombres y montos inventados). Borrarlos no toca nada que hayas cargado tú.</p>
      <div class="btnrow"><button type="button" class="btn" data-act="vEjemploCargar" ${ej.clientes ? 'disabled' : ''}>Cargar datos de ejemplo</button><button type="button" class="btn" data-act="vEjemploBorrar" ${ej.clientes || ej.productos ? '' : 'disabled'}>Borrar datos de ejemplo</button></div></div>` : '')}`;
}
async function vEjemploBorrar() {
  modal('Borrar los datos de ejemplo', `<div class="form"><p>Se borrarán solo los clientes, documentos, pagos, precios y productos marcados <b>EJEMPLO</b>, y las existencias de tus productos volverán a lo que eran antes. <b>No se puede deshacer.</b></p><div class="btnrow"><button type="button" class="btn pri" data-act="vEjemploBorrarOk">Sí, borrar el ejemplo</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`);
}

/* ---------- Pantalla ---------- */
const V_DEF_CLI = [{tipo: 'Cliente', valores: c => c.razon_social, detalle: c => c.rif_id || 'sin RIF'}, {tipo: 'RIF', valores: c => c.rif_id, detalle: c => c.razon_social}];
function scrClientesVentas() {
  return vPantalla(() => {
    const A = V.adm, dueno = lvl('v-clientes') >= 3, reg = lvl('v-clientes') >= 2, inv = VP.puedeInventario(S.rol);
    const tabs = [['clientes', 'Clientes'], ['productos', 'Productos e inventario'], ['vendedores', 'Vendedores y comisiones'], ['ajustes', 'Ajustes']];
    let cuerpo = '';
    if (A.tab === 'clientes') {
      if (!A.clientes) vAdmClientes();
      const lista = Busca.filtrar(A.clientes || [], A.q, Busca.textosDe(V_DEF_CLI));
      cuerpo = `<div class="v-bar2"><label class="fld">Buscar<input type="search" aria-label="Buscar cliente" ${Busca.atr('adm-cli')} value="${esc(A.q)}" placeholder="Nombre o RIF del cliente"></label>${reg ? `<button type="button" class="btn pri" data-act="vNuevoCliente">${ic('plus', 16)}Cliente nuevo</button>` : ''}</div>
        ${A.clientes ? table([{h: 'Cliente', f: c => `<b>${vtxt(c.razon_social)}</b>${c.ejemplo ? ' <span class="chip c-warn">EJEMPLO</span>' : ''}${c.estado_cliente === 'inactivo' ? ' <span class="chip">Inactivo</span>' : ''}${VD.listaDeCliente(c) ? ' <span class="chip">Lista ' + esc(VD.listaDeCliente(c)) + '</span>' : VD.estadoReal(c.zona) ? ' <span class="chip c-crit">Sin precios</span>' : ' <span class="chip c-crit">Falta estado</span>'}<br><span class="muted mono">${vtxt(c.rif_id || 'sin RIF')}</span>`}, {h: 'Vendedor', f: c => vtxt(c.vendedor_nombre || '—')}, {h: 'Modalidad', f: c => vModTxt(c.modalidad_despacho_pref)},
          {h: 'Pronto pago · crédito', f: c => (c.dias_pronto_pago ?? '—') + ' · ' + (c.dias_credito_normal ?? '—') + ' días'}, {h: 'Límite', r: 1, f: c => c.limite_credito_usd == null ? 'sin límite' : vusd(c.limite_credito_usd)}, {h: 'Debe', r: 1, f: c => vusd(c.deuda)},
          {h: '', f: c => `<div class="btnrow">${reg ? `<button type="button" class="btn sm" data-act="vEditarCliente" data-id="${c.id_cliente}">Editar</button>` : ''}${dueno ? `<button type="button" class="btn sm" data-act="vReglas" data-id="${c.id_cliente}">Precios</button>` : ''}</div>`}], lista, {empty: 'No hay clientes todavía. Crea uno o importa el Excel de cobranza.'}) : '<p class="hint">Cargando…</p>'}`;
    } else if (A.tab === 'productos') {
      const lp = Busca.filtrar(V.productos, A.qp, Busca.textosDe(V_DEF_PROD));
      cuerpo = `<div class="v-bar2"><label class="fld">Buscar<input type="search" aria-label="Buscar producto" ${Busca.atr('adm-prod')} value="${esc(A.qp || '')}" placeholder="Nombre, gramaje o código SKU"></label>${inv ? `<button type="button" class="btn pri" data-act="vNuevoProducto">${ic('plus', 16)}Producto nuevo</button>` : ''}</div>
        ${table([{h: 'SKU', f: p => `<span class="mono">${vtxt(p.codigo_sku)}</span>`}, {h: 'Producto', f: p => vtxt(p.nombre) + (p.ejemplo ? ' <span class="chip c-warn">EJEMPLO</span>' : '')}, {h: 'Gramaje', f: p => vtxt(p.gramaje || '')}, {h: 'Categoría', f: p => p.categoria === 'SALSAS' ? 'Salsas' : 'Papas'}, {h: 'IVA', r: 1, f: p => N2.format(p.alicuota_iva) + ' %'}, {h: 'Bultos', r: 1, f: p => `<b>${N0.format(p.stock_entero)}</b>`}, {h: 'Kg por bulto', r: 1, f: p => VD.tienePesoBulto(p) ? N2.format(p.kg_por_bulto) : '<span class="chip c-warn">falta kg por bulto</span>'}, {h: 'Unid. por bulto', r: 1, f: p => VD.tieneUnidadesBulto(p) ? N0.format(p.unidades_por_bulto) : '<span class="chip c-warn">falta unidades</span>'}, {h: 'Kilos', r: 1, f: p => VD.tienePesoBulto(p) ? '<b>' + N2.format(VD.kilosDeBultos(p.stock_entero, p.kg_por_bulto)) + '</b>' : '<span class="muted">sin peso</span>'},
          ...(inv ? [{h: '', f: p => `<div class="btnrow"><button type="button" class="btn sm" data-act="vEditarProducto" data-id="${p.id_producto}">Editar</button><button type="button" class="btn sm" data-act="vPeso" data-id="${p.id_producto}">Peso de bulto</button><button type="button" class="btn sm" data-act="vEntrada" data-id="${p.id_producto}">Entrada</button></div>`}] : [])], lp, {empty: 'Ningún producto coincide con la búsqueda.'})}
        ${vTotalKilos(lp)}
        `;
    } else if (A.tab === 'vendedores') {
      cuerpo = `<div class="v-bar2">${dueno ? `<button type="button" class="btn pri" data-act="vNuevoVendedor">${ic('plus', 16)}Vendedor nuevo</button>` : ''}</div>
        ${table([{h: 'Vendedor', f: v => vtxt(v.nombre) + (v.ejemplo ? ' <span class="chip c-warn">EJEMPLO</span>' : '')}, {h: 'Comisión', r: 1, f: v => v.comision_pct == null ? '<span class="muted">sin definir</span>' : N2.format(v.comision_pct) + ' %'}, {h: '', f: v => dueno ? `<button type="button" class="btn sm" data-act="vEditarVendedor" data-id="${v.id}">Editar</button>` : ''}], V.vendedores, {empty: 'Sin vendedores.'})}`;
    } else cuerpo = vAjustesHTML();
    return `${vph('Ventas y liquidación', 'Clientes, catálogo y ajustes', 'Quién compra, qué se vende, con qué reglas de precio y cómo se numeran los documentos.')}
    <div class="v-tabs" role="tablist">${tabs.map(([k, t]) => `<button type="button" role="tab" aria-selected="${A.tab === k}" class="v-tab" data-act="vAdmTab" data-v="${k}">${t}</button>`).join('')}</div>${A.tab === 'ajustes' ? cuerpo : card('', cuerpo)}`;
  });
}

/* Al elegir la zona del cliente se muestra la lista de precios que le toca */
document.addEventListener('change', e => { if (e.target && e.target.id === 'vc-zona') { const t = $('#vc-lista-t'); if (t) t.innerHTML = vListaTxt(e.target.value); } });
