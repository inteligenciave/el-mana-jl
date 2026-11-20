/* Portal del cliente (página pública /cliente.html). Habla SOLO con /api/c/portal/*; el enlace personal trae un código que viaja en la cabecera x-token.
   Nunca manda un id de cliente: el servidor lo saca del código. */
(function () {
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
window.esc = esc; /* lo usa el buscador común */
const N2 = new Intl.NumberFormat('es-VE', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const usd = x => x == null ? '—' : '$ ' + N2.format(x), bsf = x => x == null ? '—' : 'Bs ' + N2.format(x);
const fdl = s => { if (!s) return '—'; const [y, m, d] = String(s).slice(0, 10).split('-'); return d + '/' + m + '/' + y; };
const ic = {
  casa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
  caja: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/></svg>',
  hoja: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h7"/></svg>',
  camion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 6h11v10H2z"/><path d="M13 9h4l4 4v3h-8"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg>',
  moneda: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5c0-1 1.2-1.5 2.5-1.5s2.5.6 2.5 1.7c0 2.3-5 1.2-5 3.6 0 1.1 1.2 1.7 2.5 1.7s2.5-.6 2.5-1.5"/></svg>'
};

const S = {tok: '', vista: 'inicio', cuenta: null, perfil: null, cat: null, cart: {}, q: '', categoria: 'Todos', sub: 'docs', cargando: true, errLogin: '', enviando: false, hoja: null, pago: {banco: '', referencia: '', monto: '', fecha: '', nota: '', comp: null, compKb: 0, compOcupado: false, err: '', ok: ''}, nota: ''};

/* ---------- Servidor ---------- */
async function api(m, p, b) {
  const r = await fetch('/api/c/portal' + p, {method: m, headers: {'content-type': 'application/json', 'x-token': S.tok}, body: b ? JSON.stringify(b) : undefined});
  let j = {}; try { j = await r.json(); } catch (e) { /* sin cuerpo */ }
  if (!r.ok) { const e = new Error(j.error || 'No se pudo completar. Inténtalo de nuevo.'); e.status = r.status; e.info = j; throw e; }
  return j;
}
/* Las imágenes internas necesitan el código personal en la cabecera: se bajan con fetch y se muestran desde memoria */
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=', IMG_CACHE = new Map();
function imgsPendientes() {
  document.querySelectorAll('img[data-psrc]').forEach(im => {
    const u = im.getAttribute('data-psrc'); im.removeAttribute('data-psrc');
    const hit = IMG_CACHE.get(u); if (typeof hit === 'string') { im.src = hit; return; }
    const pr = hit || fetch(u, {headers: {'x-token': S.tok}}).then(r => r.ok ? r.blob() : Promise.reject(new Error('x'))).then(b => URL.createObjectURL(b));
    IMG_CACHE.set(u, pr);
    pr.then(o => { IMG_CACHE.set(u, o); im.src = o; }).catch(() => { IMG_CACHE.delete(u); });
  });
}
let imgT = 0;
new MutationObserver(() => { if (!imgT) imgT = setTimeout(() => { imgT = 0; imgsPendientes(); }, 30); }).observe(document.body, {childList: true, subtree: true});
const leerCodigo = () => (location.hash || '').replace(/^#(t=|k=)?/, '').trim();
const guardarEnlace = t => { try { if (t) localStorage.setItem('em_ct', t); else { localStorage.removeItem('em_ct'); sessionStorage.removeItem('em_ct'); } } catch (x) { /* sin almacenamiento */ } };
async function cargar() {
  S.cargando = true; pintar();
  try {
    const [yo, cat, cu] = await Promise.all([api('GET', '/yo'), api('GET', '/catalogo'), api('GET', '/cuenta')]);
    S.perfil = yo; S.cat = cat; S.cuenta = cu; S.errLogin = '';
    for (const id of Object.keys(S.cart)) { const p = cat.find(x => x.id_producto === +id); if (!p || p.sin_inventario) delete S.cart[id]; else S.cart[id] = Math.min(S.cart[id], p.disponible); }
  } catch (e) {
    if (e.status === 401 || e.status === 429) { S.tok = ''; S.errLogin = e.message; guardarEnlace(''); } else S.errLogin = e.message;
    S.perfil = null;
  }
  S.cargando = false; pintar();
}
async function refrescarCuenta() { try { const [yo, cu, cat] = await Promise.all([api('GET', '/yo'), api('GET', '/cuenta'), api('GET', '/catalogo')]); S.perfil = yo; S.cuenta = cu; S.cat = cat; } catch (e) { aviso(e.message, 1); } }
function aviso(t, mal) { if (!mal && window.Borrador) Borrador.exito(); const d = document.createElement('div'); d.className = 'tt' + (mal ? ' e' : ''); d.textContent = t; $('#toast').appendChild(d); setTimeout(() => d.remove(), mal ? 7000 : 4500); }

/* ---------- Carrito ---------- */
const prod = id => (S.cat || []).find(p => p.id_producto === +id);
const lineasCarrito = () => Object.entries(S.cart).filter(([, q]) => q > 0).map(([id, q]) => ({p: prod(id), q})).filter(x => x.p);
function totalCarrito() { let sub = 0; for (const {p, q} of lineasCarrito()) sub += q * p.precio; return Math.round(sub * 100) / 100; } /* sin IVA ni descuentos: el total final lo confirma Ventas */
function totalConIva() { let t = 0; for (const {p, q} of lineasCarrito()) t += q * p.precio * (1 + (p.iva ?? 16) / 100); return Math.round(t * 100) / 100; }
function ponerCant(id, n) {
  const p = prod(id); if (!p) return; n = Math.max(0, Math.min(p.disponible, Math.floor(+n || 0)));
  if (n) S.cart[id] = n; else delete S.cart[id];
  const q = $('#q-' + id); if (q) q.value = n || '';
  const card = $('#pr-' + id); if (card) card.classList.toggle('on', n > 0);
  const m = $('#m-' + id), mas = $('#mas-' + id); if (m) m.disabled = !n; if (mas) mas.disabled = n >= p.disponible;
  pintarResumen();
}
function pintarResumen() {
  const el = $('#resumen'); if (!el) return; const ls = lineasCarrito(), n = ls.reduce((t, x) => t + x.q, 0);
  el.hidden = !n; if (n) el.innerHTML = `<div><b>${usd(totalConIva())}</b><div class="sub">${n} ${n === 1 ? 'unidad' : 'unidades'} · con IVA, aproximado</div></div><button type="button" class="btn" data-a="revisar">Revisar pedido</button>`;
}

/* ---------- Pantallas ---------- */
const estadoDoc = d => d.estado === 'PENDIENTE' ? (d.vencido ? ['Vencido', 'mal'] : ['Por pagar', 'esp']) : d.estado === 'PAGADO' ? ['Pagado', 'ok'] : d.estado === 'FACTURADO_DESDE_NE' ? ['Facturada', 'n'] : d.estado === 'ANULADO' ? ['Anulado', 'mal'] : [d.estado, 'n'];
const cls = t => ({ok: 'c-ok', esp: 'c-esp', mal: 'c-mal', n: 'c-n'}[t] || 'c-n');
const chipE = (t, tono) => `<span class="chip ${cls(tono)}">${esc(t)}</span>`;
const tonoPedido = e => e === 'APROBADO' ? 'ok' : e === 'RECHAZADO' ? 'mal' : e === 'CANCELADO' ? 'n' : 'esp';
const tonoPago = e => e === 'CONFIRMADO' ? 'ok' : e === 'RECHAZADO' ? 'mal' : 'esp';

function vEntrada() {
  return `<div class="entrada"><div class="card"><img src="/icon-192.png" alt="El Maná JL"><h1>Mi cuenta · El Maná JL</h1>
    ${S.errLogin ? `<p class="aviso e" role="alert">${esc(S.errLogin)}</p>` : ''}
    <p class="sub">Pide tu enlace personal a El Maná JL.</p>
    <p class="sub">Te lo envían por WhatsApp. Al tocarlo entras directo, sin escribir nada.</p></div></div>`;
}
function vInicio() {
  const y = S.perfil, c = y.credito, usado = c.limite ? Math.min(100, Math.round((c.debe + c.por_confirmar) / c.limite * 100)) : 0;
  const bs = y.tasa && c.debe > 0 ? Math.round(c.debe * y.tasa.valor * 100) / 100 : null;
  return `<section class="card"><p class="sub">Hola, <b>${esc(y.cliente.nombre)}</b></p><h2 class="sr">Resumen</h2>
    <p class="sub" style="margin-top:8px">Lo que debes hoy</p><p class="grande">${usd(c.debe)}</p>
    ${bs ? `<p class="sub">Aproximadamente ${bsf(bs)} (tasa BCV del ${fdl(y.tasa.fecha)}: ${N2.format(y.tasa.valor)}). Es solo una guía.</p>` : ''}
    ${y.deuda_desde ? `<p class="sub">Debes desde el ${fdl(y.deuda_desde)} (hace ${y.dias_desde} ${y.dias_desde === 1 ? 'día' : 'días'}).</p>` : '<p class="sub">No tienes facturas ni notas por pagar.</p>'}
    <dl class="kv"><div><dt>Crédito disponible</dt><dd>${c.sin_limite ? 'Sin límite cargado' : usd(c.disponible)}</dd></div>${c.sin_limite ? '' : `<div><dt>Tu límite</dt><dd>${usd(c.limite)}</dd></div>`}</dl>
    ${c.sin_limite ? '' : `<div class="barra ${usado >= 90 ? 'c' : usado >= 70 ? 'w' : ''}" role="img" aria-label="Has usado ${usado} por ciento de tu crédito"><i style="width:${usado}%"></i></div><p class="sub">Has usado el ${usado} % de tu crédito${c.por_confirmar ? ' (incluye pedidos por confirmar)' : ''}.</p>`}</section>
  ${y.pedidos_por_confirmar ? `<p class="aviso i">Tienes <b>${y.pedidos_por_confirmar}</b> ${y.pedidos_por_confirmar === 1 ? 'pedido' : 'pedidos'} por confirmar. Ventas lo revisa y te avisamos aquí.</p>` : ''}
  ${y.pagos_por_verificar ? `<p class="aviso i">Tienes <b>${y.pagos_por_verificar}</b> ${y.pagos_por_verificar === 1 ? 'pago' : 'pagos'} por verificar. Administración lo revisa y lo aplica a tus facturas.</p>` : ''}
  ${y.restriccion ? `<p class="aviso e">${esc(y.restriccion)}</p>` : ''}
  <div class="acciones"><button class="btn" data-a="ir" data-v="pedir">Hacer un pedido</button><button class="btn am" data-a="ir" data-v="pagar">Reportar un pago</button><button class="btn lin" data-a="ir" data-v="cuenta">Ver mi cuenta</button></div>`;
}
const CATS = ['Todos', 'Papas', 'Salsas'];
const nomProd = p => (p.nombre + ' ' + (p.gramaje || '')).trim();
const defProd = [{tipo: 'Producto', valores: p => nomProd(p), detalle: p => p.sku}, {tipo: 'Código', valores: p => p.sku, detalle: p => p.nombre}];
function prodsVisibles() {
  let l = S.cat || []; if (S.categoria !== 'Todos') l = l.filter(p => p.categoria === (S.categoria === 'Papas' ? 'PAPAS' : 'SALSAS'));
  return Busca.filtrar(l, S.q, Busca.textosDe(defProd));
}
function htmlProd(p) {
  const q = S.cart[p.id_producto] || 0, ini = esc(p.nombre.replace(/^Papas?\s+|^Salsa\s+/i, '').slice(0, 2).toUpperCase() || 'EM');
  return `<div class="prod ${p.sin_inventario ? 'sin' : ''} ${q ? 'on' : ''}" id="pr-${p.id_producto}"><div class="foto">${p.imagen ? (p.imagen.startsWith('/api/c/portal/') ? `<img src="${PIXEL}" data-psrc="${esc(p.imagen)}" alt="">` : `<img src="${esc(p.imagen)}" alt="" loading="lazy">`) : `<span class="fnom">${esc(p.nombre)}</span>`}</div>
    <div><b>${esc(p.nombre)}</b><div class="p">${esc(p.gramaje || '')}<br>A crédito: <strong>${usd(p.precio)}</strong> por bulto${p.precio_pronto_pago ? `<br>De contado: <strong>${usd(p.precio_pronto_pago)}</strong> por bulto` : ''}</div></div>
    <div class="cant">${p.sin_inventario ? '<span class="chip c-mal">Sin inventario</span>' : `<span class="sub">Hay ${p.disponible}</span><div class="step"><button type="button" id="m-${p.id_producto}" data-a="menos" data-id="${p.id_producto}" aria-label="Quitar uno de ${esc(nomProd(p))}" ${q ? '' : 'disabled'}>−</button>
      <input id="q-${p.id_producto}" inputmode="numeric" pattern="[0-9]*" data-id="${p.id_producto}" class="qin" value="${q || ''}" placeholder="0" aria-label="Cantidad de ${esc(nomProd(p))}">
      <button type="button" id="mas-${p.id_producto}" data-a="mas" data-id="${p.id_producto}" aria-label="Agregar uno de ${esc(nomProd(p))}" ${q >= p.disponible ? 'disabled' : ''}>+</button></div>`}</div></div>`;
}
function vPedir() {
  const l = prodsVisibles(), y = S.perfil;
  return `<section class="card"><h2>Arma tu pedido</h2><p class="sub">Elige las cantidades. Tu pedido queda <b>por confirmar</b> hasta que Ventas lo apruebe.</p>
    ${y.restriccion ? `<p class="aviso e">${esc(y.restriccion)}</p>` : ''}
    <label class="fld bq-f" style="margin-top:12px">Buscar producto<input type="search" aria-label="Buscar producto" ${Busca.atr('portal-prod')} value="${esc(S.q)}" placeholder="Nombre, gramaje o código"></label>
    <div class="cats" role="group" aria-label="Tipo de producto">${CATS.map(c => `<button type="button" data-a="cat" data-v="${c}" aria-pressed="${S.categoria === c}">${c}</button>`).join('')}</div>
    <div class="prods" id="lista-prod">${l.length ? l.map(htmlProd).join('') : '<p class="vacio">No hay productos con ese texto.</p>'}</div></section>
    <div class="resumen" id="resumen" hidden></div>`;
}
Busca.registrar('portal-prod', {sugerir: q => Busca.sugerir(q, S.cat || [], defProd), vivo: q => { S.q = q; const e = $('#lista-prod'); if (e) { const l = prodsVisibles(); e.innerHTML = l.length ? l.map(htmlProd).join('') : '<p class="vacio">No hay productos con ese texto.</p>'; } }, espera: 120});

const filaDoc = d => { const [t, tn] = estadoDoc(d); return `<div class="item"><div class="top"><div><span class="num">${esc(d.numero)}</span> ${chipE(t, tn)}<div class="mini">${esc(d.tipo)}${d.factura_fiscal ? ' · fact. ' + esc(d.factura_fiscal) : ''} · ${fdl(d.fecha)}${d.vence ? ' · vence ' + fdl(d.vence) : ''}</div></div>
  <div class="monto">${usd(d.total)}<div class="mini">${d.saldo > 0 ? 'Debes ' + usd(d.saldo) : ''}</div></div></div><button type="button" class="btn lin sm ver" data-a="doc" data-id="${d.id}">Ver detalle</button> <button type="button" class="btn lin sm ver" data-a="pdfdoc" data-id="${d.id}">Descargar PDF</button></div>`; };
const filaPedVenta = p => `<div class="item"><div class="top"><div><span class="num">${esc(p.numero)}</span> ${chipE('Por despachar', 'esp')}<div class="mini">Pedido / ${esc(p.tipo)} · ${fdl(p.fecha)} · ${p.bultos} ${p.bultos === 1 ? 'bulto' : 'bultos'}</div></div></div><button type="button" class="btn lin sm ver" data-a="pdfped" data-id="${p.id}">Descargar PDF</button></div>`;
async function bajarPdf(ruta) {
  try { const d = await api('GET', ruta); await ElManaPDF.descargar(d, '/icon-192.png'); aviso('Se descargó el PDF ' + d.archivo + '.'); }
  catch (e) { aviso(e.message || 'No se pudo descargar el PDF.', 1); }
}
function vCuenta() {
  const cu = S.cuenta, r = cu.resumen, c = r.credito, subs = [['docs', 'Facturas y notas'], ['pagos', 'Mis pagos'], ['pedidos', 'Mis pedidos'], ['rep', 'Pagos reportados']];
  let cuerpo = '';
  if (S.sub === 'docs') cuerpo = ((cu.pedidos_venta || []).filter(p => p.estado !== 'DESPACHADO').length ? `<h2 style="margin:0 0 8px">Pedidos por despachar</h2><div class="lista" style="margin-bottom:14px">${cu.pedidos_venta.filter(p => p.estado !== 'DESPACHADO').map(filaPedVenta).join('')}</div>` : '') + (cu.documentos.length ? `<div class="lista">${cu.documentos.map(filaDoc).join('')}</div>` : '<p class="vacio">Todavía no tienes facturas ni notas de entrega.</p>')
    + (cu.notas.length ? `<h2 style="margin:18px 0 8px">Notas de crédito y débito</h2><div class="lista">${cu.notas.map(n => `<div class="item"><div class="top"><div><span class="num">${esc(n.tipo)} ${esc(n.numero || '')}</span><div class="mini">Sobre ${esc(n.sobre || '')} · ${fdl(n.fecha)}<br>${esc(n.motivo || '')}</div></div><div class="monto">${usd(n.total)}</div></div></div>`).join('')}</div>` : '');
  else if (S.sub === 'pagos') cuerpo = cu.pagos.length ? `<div class="lista">${cu.pagos.map(p => `<div class="item"><div class="top"><div><span class="num">${esc(p.recibo)}</span><div class="mini">${fdl(p.fecha)} · ${esc(p.banco || '')} · ref. ${esc(p.referencia || '—')}<br>${p.aplicado_a.length ? 'Aplicado a ' + esc(p.aplicado_a.join(', ')) : 'Sin aplicar todavía'}</div></div><div class="monto">${usd(p.usd)}<div class="mini">${bsf(p.monto_bs)}</div></div></div></div>`).join('')}</div>` : '<p class="vacio">Todavía no hay pagos registrados.</p>';
  else if (S.sub === 'pedidos') cuerpo = cu.pedidos.length ? `<div class="lista">${cu.pedidos.map(p => `<div class="item"><div class="top"><div><span class="num">${esc(p.codigo)}</span> ${chipE(p.estado_texto, tonoPedido(p.estado))}<div class="mini">${new Date(p.creado).toLocaleDateString('es-VE')} · ${p.lineas.map(l => esc(l.cantidad + ' × ' + l.nombre)).join(', ')}</div>${p.motivo_rechazo ? `<div class="mini"><b>Motivo:</b> ${esc(p.motivo_rechazo)}</div>` : ''}</div><div class="monto">${usd(p.total)}</div></div>${p.estado === 'POR_CONFIRMAR' ? `<button type="button" class="btn lin sm ver" data-a="cancelar" data-id="${p.id}">Cancelar pedido</button>` : ''}</div>`).join('')}</div>` : '<p class="vacio">Todavía no has hecho pedidos por aquí.</p>';
  else cuerpo = cu.reportes.length ? `<div class="lista">${cu.reportes.map(p => `<div class="item"><div class="top"><div><span class="num">${esc(p.codigo)}</span> ${chipE(p.estado_texto, tonoPago(p.estado))}<div class="mini">${fdl(p.fecha_pago)} · ${esc(p.banco)} · ref. ${esc(p.referencia)}${p.recibo ? '<br>Recibo ' + esc(p.recibo) : ''}</div>${p.motivo_rechazo ? `<div class="mini"><b>Motivo:</b> ${esc(p.motivo_rechazo)}</div>` : ''}</div><div class="monto">${bsf(p.monto_bs)}</div></div></div>`).join('')}</div>` : '<p class="vacio">Todavía no has reportado pagos.</p>';
  return `<section class="card"><p class="sub">Lo que debes</p><p class="grande">${usd(c.debe)}</p>
    <p class="sub">${r.deuda_desde ? `Desde el ${fdl(r.deuda_desde)} (hace ${r.dias_desde} ${r.dias_desde === 1 ? 'día' : 'días'}).` : 'No tienes deuda pendiente.'}</p>
    <dl class="kv"><div><dt>Crédito disponible</dt><dd>${c.sin_limite ? 'Sin límite cargado' : usd(c.disponible)}</dd></div>${r.cliente.dias_credito_normal != null ? `<div><dt>Plazo de crédito</dt><dd>${r.cliente.dias_credito_normal} días</dd></div>` : ''}${r.cliente.dias_pronto_pago != null ? `<div><dt>Pronto pago</dt><dd>hasta ${r.cliente.dias_pronto_pago} días</dd></div>` : ''}</dl></section>
    <div class="seg" role="group" aria-label="Qué ver">${subs.map(([k, t]) => `<button type="button" data-a="sub" data-v="${k}" aria-pressed="${S.sub === k}">${t}</button>`).join('')}</div>${cuerpo}`;
}
/* Bancos de la empresa: lista plegable con los datos para pagar. Si aun no hay ninguno, se explica y se deja escribir el banco. */
function datosBanco(id) {
  const b = id && S.bancos ? S.bancos.bancos.find(x => String(x.id) === String(id)) : null;
  if (!b) return '<p class="sub">Elige un banco para ver sus datos de cuenta.</p>';
  return '<p class="sub"><b>' + esc(b.nombre) + '</b> · ' + esc(b.moneda_txt) + (b.cuenta_numero ? '<br>Cuenta: ' + esc(b.cuenta_numero) : '') + (b.telefono ? '<br>Teléfono: ' + esc(b.telefono) : '') + (b.cedula ? '<br>Cédula: ' + esc(b.cedula) : '') + (b.rif ? '<br>RIF: ' + esc(b.rif) : '') + (b.cuenta_titular ? '<br>Titular: ' + esc(b.cuenta_titular) : '') + '</p>';
}
function bancoCampo(P) {
  const L = S.bancos;
  if (L === undefined) { cargarBancos(); return '<p class="sub ancho">Cargando los bancos…</p>'; }
  if (!L || !L.bancos.length) return '<p class="aviso i ancho">' + esc((L && L.mensaje_vacio) || 'Todavía no hay bancos cargados.') + '</p><label class="fld">Banco<input name="banco" value="' + esc(P.banco) + '" maxlength="40" required autocomplete="off" placeholder="Escribe el banco"></label>';
  return '<label class="fld">Banco al que pagaste<select name="id_banco" required><option value="">Elige el banco…</option>' + L.bancos.map(b => '<option value="' + b.id + '"' + (String(P.id_banco) === String(b.id) ? ' selected' : '') + '>' + esc(b.nombre + ' (' + b.moneda_txt.toLowerCase() + ')') + '</option>').join('') + '</select></label><div class="ancho" id="bco-datos" aria-live="polite">' + datosBanco(P.id_banco) + '</div>';
}
async function cargarBancos() { S.bancos = null; try { S.bancos = await api('GET', '/bancos'); } catch (e) { S.bancos = null; } pintar(); }
function vPagar() {
  const y = S.perfil, c = y.credito, P = S.pago, hoy = y.hoy, bs = y.tasa && c.debe > 0 ? Math.round(c.debe * y.tasa.valor * 100) / 100 : null;
  return `<section class="card"><h2>Reportar un pago</h2><p class="sub">Escribe los datos de tu transferencia o pago. Queda <b>por verificar</b>: Administración lo revisa y recién entonces se aplica a tus facturas.</p>
    ${c.debe > 0 ? `<p class="aviso i">Debes <b>${usd(c.debe)}</b>${bs ? ` (aprox. ${bsf(bs)} con la tasa BCV del ${fdl(y.tasa.fecha)})` : ''}. El monto final lo confirma el equipo.</p>` : ''}
    ${P.ok ? `<p class="aviso v" role="status">${esc(P.ok)}</p>` : ''}${P.err ? `<p class="aviso e" role="alert">${esc(P.err)}</p>` : ''}
    <form id="f-pago" class="form dos" style="margin-top:12px" novalidate>
      ${bancoCampo(P)}
      <label class="fld">Número de referencia<input name="referencia" value="${esc(P.referencia)}" maxlength="40" required autocomplete="off" inputmode="text" placeholder="Los números que te dio el banco"></label>
      <label class="fld">Monto pagado en bolívares (Bs)<input name="monto" value="${esc(P.monto)}" inputmode="decimal" required autocomplete="off" placeholder="0,00"><small>Usa coma para los decimales. Ejemplo: 1250,50</small></label>
      <label class="fld">Fecha del pago<input type="date" name="fecha" value="${esc(P.fecha || hoy)}" max="${esc(hoy)}" required></label>
      <label class="fld ancho">Nota (opcional)<input name="nota" value="${esc(P.nota)}" maxlength="200" placeholder="Por ejemplo: abono a la nota 1234"></label>
      <div class="fld ancho"><label for="f-comp">Foto o captura del comprobante (opcional)</label><input type="file" id="f-comp" accept="image/*">
        ${P.compOcupado ? '<small>Preparando la imagen…</small>' : P.comp ? `<div class="comp-prev"><img alt="Tu comprobante" src="data:image/jpeg;base64,${P.comp}"><div><small>Lista (${P.compKb} KB)</small><button type="button" class="btn lin" data-a="quitar-comp">Quitar</button></div></div>` : ''}</div>
      <div class="ancho"><button class="btn full" type="submit" ${S.enviando ? 'disabled' : ''}>${S.enviando ? 'Enviando…' : 'Enviar el reporte'}</button></div></form></section>
    <section class="card"><h2>Tus pagos reportados</h2>${S.cuenta.reportes.length ? `<div class="lista">${S.cuenta.reportes.slice(0, 8).map(p => `<div class="item"><div class="top"><div><span class="num">${esc(p.codigo)}</span> ${chipE(p.estado_texto, tonoPago(p.estado))}<div class="mini">${fdl(p.fecha_pago)} · ${esc(p.banco)} · ref. ${esc(p.referencia)}</div>${p.motivo_rechazo ? `<div class="mini"><b>Motivo:</b> ${esc(p.motivo_rechazo)}</div>` : ''}</div><div class="monto">${bsf(p.monto_bs)}</div></div></div>`).join('')}</div>` : '<p class="vacio">Todavía no has reportado pagos.</p>'}</section>`;
}
function vEntregas() { return '<section class="card"><h2>Mis entregas</h2><div id="ep-x"></div></section>'; }
const VISTAS = [['inicio', 'Inicio', 'casa'], ['pedir', 'Pedir', 'caja'], ['entregas', 'Entregas', 'camion'], ['cuenta', 'Mi cuenta', 'hoja'], ['pagar', 'Pagar', 'moneda']];
function pintar() {
  const foco = Busca.guardarFoco(), app = $('#app');
  if (S.cargando && !S.perfil) { app.innerHTML = '<div class="entrada"><p class="vacio">Cargando tu cuenta…</p></div>'; return; }
  if (!S.tok || !S.perfil) { app.innerHTML = vEntrada(); Busca.restaurarFoco(foco); return; }
  const y = S.perfil, pend = (y.pedidos_por_confirmar || 0) + (y.pagos_por_verificar || 0);
  const cuerpo = S.vista === 'pedir' ? vPedir() : S.vista === 'entregas' ? vEntregas() : S.vista === 'cuenta' ? vCuenta() : S.vista === 'pagar' ? vPagar() : vInicio();
  const tabs = `<nav class="tabs" aria-label="Secciones">${VISTAS.map(([k, t, i]) => `<button type="button" data-a="ir" data-v="${k}" ${S.vista === k ? 'aria-current="page"' : ''}>${ic[i]}<span>${t}</span>${k === 'cuenta' && pend ? `<span class="pt" aria-label="${pend} por revisar">${pend}</span>` : ''}</button>`).join('')}</nav>`;
  app.innerHTML = `<header class="cab"><div class="cab-i"><img src="/icon-192.png" alt=""><div><b>El Maná JL</b><small>${esc(y.cliente.nombre)}</small></div></div></header>${tabs}<main id="main" tabindex="-1">${cuerpo}</main>`;
  pintarResumen(); Busca.restaurarFoco(foco);
  if (S.vista === 'entregas' && typeof EntregasPortal !== 'undefined' && $('#ep-x')) EntregasPortal.montar($('#ep-x'), {token: S.tok});
}

/* ---------- Hoja (revisar pedido, detalle) ---------- */
function abrirHoja(html) { cerrarHoja(); const v = document.createElement('div'); v.className = 'vel'; v.id = 'vel'; v.innerHTML = `<div class="hoja" role="dialog" aria-modal="true" aria-label="Detalle">${html}</div>`; document.body.appendChild(v); const b = v.querySelector('.x'); b && b.focus(); document.body.style.overflow = 'hidden'; }
function cerrarHoja() { const v = $('#vel'); if (v) v.remove(); document.body.style.overflow = ''; }
function hojaPedido(err) {
  const ls = lineasCarrito(), y = S.perfil, c = y.credito, tot = totalConIva(), pasa = !c.sin_limite && tot > c.disponible;
  abrirHoja(`<button type="button" class="x" data-a="cerrar" aria-label="Cerrar">×</button><h2>Revisa tu pedido</h2>
    <div class="lista">${ls.map(({p, q}) => `<div class="item"><div class="top"><div><span class="num">${esc(nomProd(p))}</span><div class="mini">${q} × ${usd(p.precio)}</div></div><div class="monto">${usd(Math.round(q * p.precio * 100) / 100)}</div></div></div>`).join('')}</div>
    <div class="tot"><p><span>Subtotal</span><span>${usd(totalCarrito())}</span></p><p class="g"><span>Total con IVA (aprox.)</span><span>${usd(tot)}</span></p></div>
    <p class="sub" style="margin:6px 0 10px">El total final lo confirma Ventas al aprobar el pedido (incluye tus condiciones).</p>
    ${pasa ? `<p class="aviso e" role="alert">Este pedido supera tu crédito disponible (${usd(c.disponible)}). Reporta un pago o quita productos.</p>` : ''}
    ${err ? `<p class="aviso e" role="alert">${esc(err)}</p>` : ''}
    <label class="fld">Nota para Ventas (opcional)<textarea id="nota-pedido" maxlength="300" placeholder="Por ejemplo: entregar en la mañana">${esc(S.nota)}</textarea></label>
    <div class="fila" style="margin-top:12px"><button type="button" class="btn" data-a="enviar-pedido" ${S.enviando || pasa ? 'disabled' : ''}>${S.enviando ? 'Enviando…' : 'Enviar pedido'}</button><button type="button" class="btn lin" data-a="cerrar">Seguir armando</button></div>`);
}
async function enviarPedido() {
  if (S.enviando) return; const nt = $('#nota-pedido'); if (nt) S.nota = nt.value; S.enviando = true; hojaPedido();
  try {
    const r = await api('POST', '/pedidos', {lineas: lineasCarrito().map(x => ({id_producto: x.p.id_producto, cantidad: x.q})), nota: S.nota});
    S.cart = {}; S.nota = ''; S.enviando = false; cerrarHoja(); await refrescarCuenta(); S.vista = 'cuenta'; S.sub = 'pedidos'; pintar();
    abrirHoja(`<button type="button" class="x" data-a="cerrar" aria-label="Cerrar">×</button><h2>Pedido recibido</h2><p class="aviso v">Tu pedido <b>${esc(r.codigo)}</b> por ${usd(r.total)} quedó <b>por confirmar</b>. Ventas lo revisa y verás aquí cuando lo aprueben.</p><button type="button" class="btn full" data-a="cerrar">Listo</button>`);
  } catch (e) { S.enviando = false; if (e.info && (e.info.codigo === 'SIN_STOCK')) { await refrescarCuenta(); pintar(); } hojaPedido(e.message); }
}
async function verDoc(id) {
  try {
    const d = await api('GET', '/documentos/' + id);
    abrirHoja(`<button type="button" class="x" data-a="cerrar" aria-label="Cerrar">×</button><h2>${esc(d.tipo)} ${esc(d.numero)}</h2><p class="sub">${d.factura_fiscal ? 'Factura fiscal ' + esc(d.factura_fiscal) + ' · ' : ''}Emitida el ${fdl(d.fecha)}${d.vence ? ' · vence el ' + fdl(d.vence) : ''}</p>
      ${d.sin_detalle ? '<p class="aviso i">Este documento viene del registro anterior y solo tiene el monto total.</p>' : `<div class="lista" style="margin-top:10px">${d.lineas.map(l => `<div class="item"><div class="top"><div><span class="num">${esc(l.nombre)}</span><div class="mini">${l.cantidad} × ${usd(l.precio)}</div></div><div class="monto">${usd(Math.round(l.cantidad * l.precio * 100) / 100)}</div></div></div>`).join('')}</div>`}
      <div class="tot"><p><span>Subtotal</span><span>${usd(d.subtotal)}</span></p>${d.descuento ? `<p><span>Descuento</span><span>− ${usd(d.descuento)}</span></p>` : ''}<p><span>IVA</span><span>${usd(d.iva)}</span></p><p class="g"><span>Total</span><span>${usd(d.total)}</span></p><p><span>Pagado</span><span>${usd(d.pagado)}</span></p><p><b>Debes</b><b>${usd(d.saldo)}</b></p></div>
      <button type="button" class="btn lin full" style="margin-top:12px" data-a="cerrar">Cerrar</button>`);
  } catch (e) { aviso(e.message, 1); }
}
async function enviarPago(f) {
  if (S.enviando) return; const P = S.pago, v = n => f.elements[n] ? f.elements[n].value : '';
  Object.assign(P, {banco: v('banco'), id_banco: v('id_banco'), referencia: v('referencia'), monto: v('monto'), fecha: v('fecha'), nota: v('nota'), err: '', ok: ''});
  const monto = Number(String(P.monto).trim().replace(/\./g, '').replace(',', '.'));
  if (S.bancos && S.bancos.bancos.length ? !P.id_banco : !P.banco.trim()) { P.err = 'Elige el banco.'; return pintar(); }
  if (!P.referencia.trim()) { P.err = 'Escribe el número de referencia.'; return pintar(); }
  if (!(monto > 0)) { P.err = 'Escribe el monto en bolívares. Ejemplo: 1250,50'; return pintar(); }
  S.enviando = true; pintar();
  try {
    const r = await api('POST', '/pagos', {banco: P.banco, id_banco: P.id_banco || undefined, referencia: P.referencia, monto_bs: monto, fecha_pago: P.fecha, nota: P.nota, comprobante: P.comp || undefined});
    Object.assign(P, {banco: '', id_banco: '', referencia: '', monto: '', fecha: '', nota: '', comp: null, compKb: 0, err: '', ok: `${r.codigo}: ${r.mensaje}`}); S.enviando = false; await refrescarCuenta(); pintar();
  } catch (e) { S.enviando = false; P.err = e.message; pintar(); }
}

/* ---------- Eventos ---------- */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a, id = b.dataset.id;
  if (a === 'ir') { S.vista = b.dataset.v; S.pago.ok = ''; pintar(); window.scrollTo(0, 0); }
  else if (a === 'cat') { S.categoria = b.dataset.v; pintar(); }
  else if (a === 'sub') { S.sub = b.dataset.v; pintar(); }
  else if (a === 'mas') ponerCant(id, (S.cart[id] || 0) + 1);
  else if (a === 'menos') ponerCant(id, (S.cart[id] || 0) - 1);
  else if (a === 'revisar') hojaPedido();
  else if (a === 'enviar-pedido') enviarPedido();
  else if (a === 'cerrar') cerrarHoja();
  else if (a === 'quitar-comp') { S.pago.comp = null; S.pago.compKb = 0; pintar(); }
  else if (a === 'doc') verDoc(id);
  else if (a === 'pdfdoc') bajarPdf('/documentos/' + id + '/pdf');
  else if (a === 'pdfped') bajarPdf('/pedidos-venta/' + id + '/pdf');
  else if (a === 'cancelar') { if (!confirm('¿Cancelar este pedido?')) return; try { await api('POST', '/pedidos/' + id + '/cancelar'); await refrescarCuenta(); pintar(); aviso('Pedido cancelado.'); } catch (er) { aviso(er.message, 1); } }
});
document.addEventListener('input', e => { const t = e.target; if (t.classList && t.classList.contains('qin')) { const l = t.value.replace(/\D/g, ''); if (l !== t.value) t.value = l; ponerCant(t.dataset.id, l === '' ? 0 : +l); } });
document.addEventListener('change', async e => {
  if (e.target.name === 'id_banco' && e.target.closest('#f-pago')) { S.pago.id_banco = e.target.value; const d = $('#bco-datos'); if (d) d.innerHTML = datosBanco(e.target.value); return; }
  if (e.target.id !== 'f-comp') return; const P = S.pago, f = e.target.files && e.target.files[0]; if (!f) return;
  const f2 = document.getElementById('f-pago'); if (f2) Object.assign(P, {banco: f2.elements.banco ? f2.elements.banco.value : P.banco, id_banco: f2.elements.id_banco ? f2.elements.id_banco.value : P.id_banco, referencia: f2.elements.referencia.value, monto: f2.elements.monto.value, fecha: f2.elements.fecha.value, nota: f2.elements.nota.value});
  P.err = ''; P.ok = ''; P.compOcupado = true; P.comp = null; pintar();
  try { const r = await EntregasPortal.comprimir(f); P.comp = r.foto; P.compKb = r.kb; } catch (er) { P.err = er.message; }
  P.compOcupado = false; pintar();
});
document.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.id === 'f-pago') enviarPago(e.target);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarHoja(); });
document.addEventListener('click', e => { if (e.target.id === 'vel') cerrarHoja(); });

S.tok = leerCodigo();
if (S.tok) { if (!/^[A-Za-z0-9_-]{43}$/.test(S.tok)) { S.tok = ''; S.errLogin = 'El enlace no está completo. Pide uno nuevo a El Maná JL.'; } else guardarEnlace(S.tok); try { history.replaceState(null, '', location.pathname); } catch (x) { /* nada */ } }
if (!S.tok && !S.errLogin) { try { S.tok = localStorage.getItem('em_ct') || sessionStorage.getItem('em_ct') || ''; } catch (x) { /* nada */ } }
/* Borrador: lo que la persona estaba escribiendo y dónde estaba (solo en este navegador, 24 h; el código personal nunca se guarda) */
try {
  if (window.Borrador) {
    const hh = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
    Borrador.config({ctx: () => S.tok ? 'p:' + hh(S.tok) + ':' + S.vista : null, aviso: t => aviso(t)});
    Borrador.registrar('portal', () => ({vista: S.vista, cat: S.categoria, sub: S.sub, q: S.q, nota: S.nota, cart: S.cart, pago: {banco: S.pago.banco, id_banco: S.pago.id_banco, referencia: S.pago.referencia, monto: S.pago.monto, fecha: S.pago.fecha, nota: S.pago.nota}}),
      v => { if (!v) return; S.vista = v.vista || S.vista; S.categoria = v.cat || S.categoria; S.sub = v.sub || S.sub; S.q = v.q || ''; S.nota = v.nota || ''; Object.assign(S.cart, v.cart || {}); Object.assign(S.pago, v.pago || {}); if (S.perfil) pintar(); },
      () => S.tok ? 'p:' + hh(S.tok) + ':*' : null);
  }
} catch (e) { /* sin borrador */ }
if (S.tok) cargar(); else { S.cargando = false; pintar(); }
})();
