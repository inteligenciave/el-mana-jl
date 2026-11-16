/* Pantallas internas del portal de clientes (para el equipo): ficha del cliente con su enlace, pedidos por confirmar y pagos por verificar.
   Todo pasa por cApi() -> /api/v/portal/* (el servidor vuelve a comprobar el rol). Listas paginadas: sin scroll en pantalla grande. */
const CP = {fich: {lista: null, sel: null, ficha: null, q: '', pag: 0, cargandoFicha: false, ultimo: null}, ped: {filas: null, pag: 0, q: ''}, pag: {filas: null, pag: 0, q: ''}, res: null, busy: {}};
const CP_FILAS_LISTA = 7, CP_FILAS = 4;
async function cApi(metodo, ruta, cuerpo) {
  const r = await fetch('/api/v/portal' + ruta, {method: metodo, headers: {'content-type': 'application/json', 'x-rol': S.rol}, body: cuerpo ? JSON.stringify(cuerpo) : undefined});
  let j = {}; try { j = await r.json(); } catch (e) { /* sin cuerpo */ }
  if (!r.ok) { const e = new Error(j.error || 'No se pudo completar la operación.'); e.status = r.status; e.info = j; throw e; }
  return j;
}
const cusd = x => x == null ? '—' : '$ ' + N2.format(x), cbs = x => x == null ? '—' : 'Bs ' + N2.format(x);
const cfec = ts => ts ? new Date(ts).toLocaleDateString('es-VE', {day: '2-digit', month: '2-digit', year: 'numeric'}) : '—';
const cPantalla = fn => window.__EM_HTTP ? fn() : ph('Portal de clientes', 'Portal de clientes', '', '') + card('', emptyState('Este módulo necesita el servidor', 'Funciona en la versión con base de datos (Cloudflare).'));
const cErr = e => toast(esc(e && e.message ? e.message : 'No se pudo completar la operación.'), 'err');
const cPag = (n, pag, tam, clave) => {
  const tot = Math.max(1, Math.ceil(n / tam));
  return n > tam ? `<div class="cp-pag"><button type="button" class="btn sm" data-act="cPag" data-k="${clave}" data-d="-1" ${pag <= 0 ? 'disabled' : ''} aria-label="Página anterior">‹ Anterior</button><span>Página ${pag + 1} de ${tot} · ${n} en total</span><button type="button" class="btn sm" data-act="cPag" data-k="${clave}" data-d="1" ${pag >= tot - 1 ? 'disabled' : ''} aria-label="Página siguiente">Siguiente ›</button></div>` : '';
};
async function cResumen() { try { CP.res = await cApi('GET', '/resumen'); } catch (e) { /* el resumen es solo un aviso */ } }
async function cRun(clave, fn, ok) {
  if (CP.busy[clave]) return; CP.busy[clave] = true; render();
  try { const r = await fn(); if (ok) toast(typeof ok === 'function' ? ok(r) : ok); return r; } catch (e) { console.error(e); cErr(e); } finally { delete CP.busy[clave]; render(); }
}

/* ---------- Ficha del cliente ---------- */
const C_DEF_CLI = [{tipo: 'Cliente', valores: c => c.razon_social, detalle: c => c.rif_id || ''}, {tipo: 'RIF', valores: c => c.rif_id, detalle: c => c.razon_social}, {tipo: 'Zona', valores: c => c.zona, detalle: c => c.razon_social}, {tipo: 'Vendedor', valores: c => c.vendedor, detalle: c => c.razon_social}];
async function cCargarLista() { try { CP.fich.lista = await cApi('GET', '/clientes?limite=500'); } catch (e) { cErr(e); CP.fich.lista = CP.fich.lista || []; } render(); }
async function cCargarFicha(id) {
  CP.fich.sel = id; CP.fich.ficha = null; CP.fich.codigo = null; render();
  try { const f = await cApi('GET', '/clientes/' + id); if (CP.fich.sel === id) { CP.fich.ficha = f; render(); } } catch (e) { cErr(e); }
}
function cEstadoEnlace(f) {
  const e = f.enlace_activo; if (!e) return '<span class="chip c-n">Sin enlace activo</span>';
  return `<span class="chip c-ok">Enlace activo</span> <span class="mini">termina en ${esc(e.token_fin)} · ${e.vence_ts ? 'vence el ' + cfec(e.vence_ts) : 'no vence'}</span>`;
}
function cFichaHTML() {
  const F = CP.fich, f = F.ficha;
  if (!F.sel) return `<div class="cp-vacio">${ic('users', 30)}<p>Elige un cliente de la lista para ver su ficha y manejar su enlace del portal.</p></div>`;
  if (!f) return '<p class="hint">Cargando la ficha…</p>';
  const c = f.cliente, puede = lvl('c-ficha') >= 2, cod = F.codigo;
  const linkCompleto = cod ? location.origin + cod.ruta : '';
  return `<div class="cp-ficha"><div class="cp-fh"><div><h2>${esc(c.razon_social)}</h2><p class="hint">${c.ejemplo ? '<span class="chip c-n">EJEMPLO</span> ' : ''}${esc(c.telefono || 'sin teléfono')}</p></div><div>${cEstadoEnlace(f)}</div></div>
    <dl class="cp-kv"><div><dt>RIF</dt><dd>${esc(c.rif_id || '—')}</dd></div><div><dt>Zona</dt><dd>${esc(c.zona || '—')}</dd></div><div><dt>Límite de crédito</dt><dd>${cusd(c.limite_credito_usd)}</dd></div><div><dt>Debe hoy</dt><dd>${cusd(c.deuda)}</dd></div>
      <div><dt>Nivel de precio</dt><dd>${esc(c.nivel_precio || '—')}</dd></div><div><dt>Vendedor</dt><dd>${esc(c.vendedor || '—')}</dd></div></dl>
    ${cod ? `<div class="cp-codigo" role="status"><p><b>Código nuevo.</b> ${esc(cod.aviso)}</p><label class="fld">Enlace para enviar al cliente<input type="text" readonly id="cp-link" value="${esc(linkCompleto)}" onfocus="this.select()"></label>
      <div class="btnrow"><button type="button" class="btn pri" data-act="cCopiar">${ic('clip', 16)}Copiar enlace</button><button type="button" class="btn" data-act="cOcultar">Ya lo envié</button></div></div>` : ''}
    ${puede ? `<div class="cp-acc"><label class="fld cp-dias">Vigencia en días (vacío = no vence)<input type="text" inputmode="numeric" id="cp-dias" maxlength="4" placeholder="Ej.: 30"></label>
      <button type="button" class="btn pri" data-act="cEnlaceGen" ${CP.busy.enl ? 'disabled' : ''}>${f.enlace_activo ? 'Generar uno nuevo (anula el anterior)' : 'Generar enlace'}</button>
      ${f.enlace_activo ? `<button type="button" class="btn" data-act="cEnlaceRev" ${CP.busy.enl ? 'disabled' : ''}>Revocar enlace</button>` : ''}</div>` : '<p class="hint">Tu rol puede ver la ficha pero no generar ni revocar enlaces.</p>'}
    <div class="cp-dos"><div><h3>Pedidos por confirmar (${f.pedidos.length})</h3>${f.pedidos.length ? f.pedidos.map(p => `<p class="cp-li"><b>${esc(p.codigo)}</b> · ${cusd(p.total)}<br><span class="mini">${p.lineas.map(l => esc(l.cantidad + ' × ' + l.nombre)).join(', ')}</span></p>`).join('') : '<p class="hint">Ninguno.</p>'}</div>
      <div><h3>Pagos por verificar (${f.pagos.length})</h3>${f.pagos.length ? f.pagos.map(p => `<p class="cp-li"><b>${esc(p.codigo)}</b> · ${cbs(p.monto_bs)}<br><span class="mini">${esc(p.banco)} · ref. ${esc(p.referencia)} · ${fdl(p.fecha_pago)}</span></p>`).join('') : '<p class="hint">Ninguno.</p>'}</div></div></div>`;
}
function scrCFicha() {
  return cPantalla(() => {
    const F = CP.fich; if (!F.lista) { cCargarLista(); return card('', emptyState('Cargando…', 'Un momento.')); }
    const l = Busca.filtrar(F.lista, F.q, Busca.textosDe(C_DEF_CLI)), tam = CP_FILAS_LISTA, n = l.length; F.pag = Math.min(F.pag, Math.max(0, Math.ceil(n / tam) - 1));
    const vista = l.slice(F.pag * tam, F.pag * tam + tam);
    const items = vista.length ? vista.map(c => `<li><button type="button" class="cp-it ${F.sel === c.id_cliente ? 'on' : ''}" data-act="cElegir" data-id="${c.id_cliente}"><span><b>${esc(c.razon_social)}</b><span class="mini">${esc(c.rif_id || 'sin RIF')} · ${esc(c.zona || 'sin zona')}</span></span>
      <span class="cp-tags">${c.enlace_activo ? '<span class="chip c-ok">Enlace</span>' : ''}${c.pedidos_por_confirmar ? `<span class="chip c-warn">${c.pedidos_por_confirmar} pedido${c.pedidos_por_confirmar > 1 ? 's' : ''}</span>` : ''}${c.pagos_por_verificar ? `<span class="chip c-warn">${c.pagos_por_verificar} pago${c.pagos_por_verificar > 1 ? 's' : ''}</span>` : ''}</span></button></li>`).join('') : '<li class="hint">Ningún cliente coincide.</li>';
    return `${ph('Portal de clientes', 'Ficha del cliente y su enlace', '', '')}<div class="cp-cols"><section class="card cp-izq"><div class="card-b"><label class="fld">Buscar cliente<input type="search" aria-label="Buscar cliente" ${Busca.atr('c-cli')} value="${esc(F.q)}" placeholder="Nombre, RIF, zona o vendedor"></label>
      <ul class="cp-lista">${items}</ul>${cPag(n, F.pag, tam, 'fich')}</div></section><section class="card cp-der"><div class="card-b">${cFichaHTML()}</div></section></div>`;
  });
}
Busca.registrar('c-cli', {sugerir: q => Busca.sugerir(q, CP.fich.lista || [], C_DEF_CLI), vivo: q => { CP.fich.q = q; CP.fich.pag = 0; render(); }, espera: 150});

/* ---------- Pedidos por confirmar ---------- */
const C_DEF_PED = [{tipo: 'Cliente', valores: p => p.cliente, detalle: p => p.codigo}, {tipo: 'Pedido', valores: p => p.codigo, detalle: p => p.cliente}, {tipo: 'RIF', valores: p => p.rif_id, detalle: p => p.cliente}, {tipo: 'Zona', valores: p => p.zona, detalle: p => p.cliente}];
async function cCargarPedidos() { try { CP.ped.filas = await cApi('GET', '/pedidos?estado=POR_CONFIRMAR'); } catch (e) { cErr(e); CP.ped.filas = CP.ped.filas || []; } render(); }
function scrCPedidos() {
  return cPantalla(() => {
    const P = CP.ped; if (!P.filas) { cCargarPedidos(); return card('', emptyState('Cargando…', 'Un momento.')); }
    const l = Busca.filtrar(P.filas, P.q, Busca.textosDe(C_DEF_PED)), tam = CP_FILAS, n = l.length; P.pag = Math.min(P.pag, Math.max(0, Math.ceil(n / tam) - 1));
    const puede = lvl('c-pedidos') >= 2;
    const cuerpo = l.slice(P.pag * tam, P.pag * tam + tam).map(p => `<article class="cp-tarj"><div class="cp-t1"><div><b>${esc(p.codigo)}</b> · ${esc(p.cliente)}<div class="mini">${esc(p.rif_id || '')} · ${esc(p.zona || 'sin zona')} · ${cfec(p.creado)}</div></div><div class="cp-monto">${cusd(p.total)}</div></div>
      <p class="cp-lin">${p.lineas.map(x => esc(x.cantidad + ' × ' + x.nombre)).join(' · ')}</p>${p.nota ? `<p class="mini"><b>Nota del cliente:</b> ${esc(p.nota)}</p>` : ''}
      <div class="cp-t2">${p.alcanza ? '<span class="chip c-ok">Hay inventario</span>' : '<span class="chip c-crit">Falta inventario</span>'}
      ${puede ? `${(() => { const L = vBancos(); return L && L.bancos && L.bancos.length ? `<label class="cp-sel">Banco<select id="cp-banco-${p.id}"><option value="">Elige el banco…</option>${L.bancos.map(b => `<option value="${esc(b.nombre)}">${esc(b.nombre)}</option>`).join('')}</select></label>` : ''; })()}<label class="cp-sel">Generar como<select id="cp-tipo-${p.id}"><option value="NOTA_ENTREGA" ${p.tipo_sugerido === 'NOTA_ENTREGA' ? 'selected' : ''}>Nota de entrega</option><option value="FACTURA" ${p.tipo_sugerido === 'FACTURA' ? 'selected' : ''}>Factura</option></select></label>
      <button type="button" class="btn pri sm" data-act="cPedAprobar" data-id="${p.id}" ${CP.busy['p' + p.id] ? 'disabled' : ''}>Aprobar</button><button type="button" class="btn sm" data-act="cPedRechazar" data-id="${p.id}">Rechazar</button>` : ''}</div></article>`).join('');
    return `${ph('Portal de clientes', 'Pedidos por confirmar', '', '')}${card('', `<label class="fld">Buscar pedido<input type="search" aria-label="Buscar pedido" ${Busca.atr('c-ped')} value="${esc(P.q)}" placeholder="Cliente, RIF, zona o código PP-"></label>
      <p class="hint">Al aprobar se genera la nota de entrega o factura normal y baja el inventario. Si algo falla (por ejemplo falta inventario), el pedido sigue aquí y se ve el motivo.</p>
      <div class="cp-tarjs">${cuerpo || '<p class="vacio">No hay pedidos por confirmar.</p>'}</div>${cPag(n, P.pag, tam, 'ped')}`)}`;
  });
}
Busca.registrar('c-ped', {sugerir: q => Busca.sugerir(q, CP.ped.filas || [], C_DEF_PED), vivo: q => { CP.ped.q = q; CP.ped.pag = 0; render(); }, espera: 150});

/* ---------- Pagos por verificar ---------- */
const C_DEF_PAG = [{tipo: 'Cliente', valores: p => p.cliente, detalle: p => p.codigo}, {tipo: 'Reporte', valores: p => p.codigo, detalle: p => p.cliente}, {tipo: 'Banco', valores: p => p.banco, detalle: p => p.cliente}, {tipo: 'Referencia', valores: p => p.referencia, detalle: p => p.cliente}, {tipo: 'RIF', valores: p => p.rif_id, detalle: p => p.cliente}];
async function cCargarPagos() { try { CP.pag.filas = await cApi('GET', '/pagos?estado=POR_VERIFICAR'); } catch (e) { cErr(e); CP.pag.filas = CP.pag.filas || []; } render(); }
function scrCPagos() {
  return cPantalla(() => {
    const P = CP.pag; if (!P.filas) { cCargarPagos(); return card('', emptyState('Cargando…', 'Un momento.')); }
    const l = Busca.filtrar(P.filas, P.q, Busca.textosDe(C_DEF_PAG)), tam = CP_FILAS, n = l.length; P.pag = Math.min(P.pag, Math.max(0, Math.ceil(n / tam) - 1));
    const puede = lvl('c-pagos') >= 2, hoy = new Date().toISOString().slice(0, 10);
    const cuerpo = l.slice(P.pag * tam, P.pag * tam + tam).map(p => `<article class="cp-tarj"><div class="cp-t1"><div><b>${esc(p.codigo)}</b> · ${esc(p.cliente)}<div class="mini">${esc(p.rif_id || '')} · ${esc(p.banco)} · ref. <span class="mono">${esc(p.referencia)}</span> · pagó el ${fdl(p.fecha_pago)}</div></div><div class="cp-monto">${cbs(p.monto_bs)}</div></div>
      ${p.nota ? `<p class="mini"><b>Nota del cliente:</b> ${esc(p.nota)}</p>` : ''}
      <div class="cp-t2">${p.tiene_comprobante ? `<button type="button" class="btn sm" data-act="cPagComprobante" data-id="${p.id}">Ver comprobante</button>` : '<span class="chip c-n">Sin comprobante</span>'}${p.fecha_pago < hoy ? '<span class="chip c-warn">Fecha pasada: pide el PIN de gerencia</span>' : '<span class="chip c-n">Del día</span>'}
      ${puede ? `${p.fecha_pago < hoy ? `<label class="cp-sel">PIN<input type="password" id="cp-pin-${p.id}" autocomplete="off" inputmode="numeric" maxlength="12" placeholder="PIN"></label>` : ''}<button type="button" class="btn pri sm" data-act="cPagConfirmar" data-id="${p.id}" ${CP.busy['g' + p.id] ? 'disabled' : ''}>Confirmar y aplicar</button><button type="button" class="btn sm" data-act="cPagRechazar" data-id="${p.id}">Rechazar</button>` : ''}</div></article>`).join('');
    return `${ph('Portal de clientes', 'Pagos por verificar', '', '')}${card('', `<label class="fld">Buscar pago<input type="search" aria-label="Buscar pago" ${Busca.atr('c-pag')} value="${esc(P.q)}" placeholder="Cliente, RIF, banco, referencia o código PR-"></label>
      <p class="hint">Revisa en el banco que el pago exista. Al confirmar se registra el pago y se aplica a las facturas más antiguas primero.</p>
      <div class="cp-tarjs">${cuerpo || '<p class="vacio">No hay pagos por verificar.</p>'}</div>${cPag(n, P.pag, tam, 'pag')}`)}`;
  });
}
Busca.registrar('c-pag', {sugerir: q => Busca.sugerir(q, CP.pag.filas || [], C_DEF_PAG), vivo: q => { CP.pag.q = q; CP.pag.pag = 0; render(); }, espera: 150});

/* ---------- Registro en la aplicación ---------- */
Object.assign(PERM_DEF, {'c-ficha': 'ventas:2 adm:2 cobranza:1', 'c-pedidos': 'ventas:2 adm:2 cobranza:1', 'c-pagos': 'adm:2 cobranza:2 ventas:1'});
Object.assign(SCREENS, {
  'c-ficha':   {mod: 'adm', g: 'Portal de clientes', t: 'Ficha del cliente y su enlace', s: 'Fichas', ic: 'users', r: scrCFicha},
  'c-pedidos': {mod: 'adm', g: 'Portal de clientes', t: 'Pedidos por confirmar', s: 'Pedidos', ic: 'cart', r: scrCPedidos},
  'c-pagos':   {mod: 'adm', g: 'Portal de clientes', t: 'Pagos por verificar', s: 'Pagos', ic: 'receipt', r: scrCPagos}
});
S.perm = permInit();
const CACT_REQ = {cEnlaceGen: ['c-ficha', 2], cEnlaceRev: ['c-ficha', 2], cPedAprobar: ['c-pedidos', 2], cPedRechazar: ['c-pedidos', 2], cPagConfirmar: ['c-pagos', 2], cPagRechazar: ['c-pagos', 2]};
const CACT_LBL = {cEnlaceGen: 'generar enlaces de clientes', cEnlaceRev: 'revocar enlaces de clientes', cPedAprobar: 'aprobar pedidos', cPedRechazar: 'rechazar pedidos', cPagConfirmar: 'confirmar pagos', cPagRechazar: 'rechazar pagos'};
Object.assign(ACT_REQ, CACT_REQ); Object.assign(ACT_LBL, CACT_LBL); Object.keys(CACT_REQ).forEach(k => WRITE_ACTS.add(k));

function cMotivo(titulo, texto, btn, cb) {
  modal(titulo, `<div class="form"><p>${texto}</p><label class="fld">Motivo (el cliente lo va a ver)<input type="text" id="cp-motivo" maxlength="200" placeholder="Por ejemplo: la referencia no aparece en el banco"></label><p class="err" id="cp-mot-e" role="alert" hidden></p>
    <div class="btnrow"><button type="button" class="btn pri" id="cp-mot-ok">${btn}</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`);
  $('#cp-motivo').focus();
  $('#cp-mot-ok').addEventListener('click', async () => { const e = $('#cp-mot-e'); e.hidden = true; try { await cb($('#cp-motivo').value); closeModal(); } catch (er) { e.textContent = er.message; e.hidden = false; } });
}
const cId = el => +el.dataset.id;
Object.assign(ACT, {
  cPag: el => { if (el.disabled) return; const k = el.dataset.k; CP[k].pag += +el.dataset.d; render(); },
  cElegir: el => cCargarFicha(cId(el)),
  cOcultar: () => { CP.fich.codigo = null; render(); },
  cCopiar: async () => { const i = $('#cp-link'); if (!i) return; try { await navigator.clipboard.writeText(i.value); toast('Enlace copiado.'); } catch (e) { i.select(); toast('Selecciona y copia el enlace con Ctrl+C.', 'warn'); } },
  cEnlaceGen: async el => {
    const id = CP.fich.sel, d = ($('#cp-dias') || {}).value || '';
    const r = await cRun('enl', () => cApi('POST', '/clientes/' + id + '/enlace', {dias: d.trim() === '' ? null : +d}), 'Enlace generado. Cópialo ahora: no se vuelve a mostrar.');
    if (r) { CP.fich.codigo = r; CP.fich.lista = null; cCargarFicha(id); CP.fich.codigo = r; render(); }
  },
  cEnlaceRev: () => { const id = CP.fich.sel; modal('Revocar el enlace', `<div class="form"><p>El cliente no podrá entrar con su código actual. Podrás generar uno nuevo cuando quieras.</p><div class="btnrow"><button type="button" class="btn pri" id="cp-rev-ok">Sí, revocar</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`);
    $('#cp-rev-ok').addEventListener('click', async () => { closeModal(); const r = await cRun('enl', () => cApi('POST', '/clientes/' + id + '/enlace/revocar', {}), 'Enlace revocado.'); if (r) { CP.fich.lista = null; CP.fich.codigo = null; cCargarFicha(id); } }); },
  cPedAprobar: async el => {
    const id = cId(el), t = ($('#cp-tipo-' + id) || {}).value, bs = $('#cp-banco-' + id), banco = bs ? bs.value : '';
    if (bs && !banco) return toast('Elige el banco antes de aprobar.', 'warn');
    const r = await cRun('p' + id, () => cApi('POST', '/pedidos/' + id + '/aprobar', {tipo: t, metodo_pago: banco || undefined}), r => 'Pedido aprobado: se generó ' + r.documento + '.');
    if (r) { CP.ped.filas = null; CP.fich.lista = null; }
  },
  cPedRechazar: el => { const id = cId(el); cMotivo('Rechazar el pedido', 'El pedido no se borra: queda como rechazado y el cliente ve el motivo.', 'Rechazar pedido', async m => { await cApi('POST', '/pedidos/' + id + '/rechazar', {motivo: m}); toast('Pedido rechazado.'); CP.ped.filas = null; CP.fich.lista = null; render(); }); },
  cPagComprobante: async el => {
    const id = cId(el), p = (CP.pag.filas || []).find(x => x.id === id); modal('Comprobante de ' + esc(p ? p.codigo : ''), '<div class="cp-comp" id="cp-comp"><p class="mini">Cargando la imagen…</p></div>');
    try { const r = await cApi('GET', '/pagos/' + id + '/comprobante'); const b = $('#cp-comp'); if (b) b.innerHTML = '<img alt="Comprobante de pago del cliente" src="data:image/jpeg;base64,' + r.comprobante + '">' + (p ? '<p class="mini">' + esc(p.cliente) + ' · ' + cbs(p.monto_bs) + ' · ref. ' + esc(p.referencia) + '</p>' : ''); }
    catch (e) { const b = $('#cp-comp'); if (b) b.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; }
  },
  cPagConfirmar: async el => {
    const id = cId(el), pin = ($('#cp-pin-' + id) || {}).value || undefined;
    const r = await cRun('g' + id, () => cApi('POST', '/pagos/' + id + '/confirmar', {pin}), r => 'Pago confirmado. Recibo ' + r.recibo + ' por ' + cusd(r.usd) + '.');
    if (r) { CP.pag.filas = null; CP.fich.lista = null; V.clientes = null; if (V.deuda) V.deuda.data = null; if (V.pagos) V.pagos.filas = null; }
  },
  cPagRechazar: el => { const id = cId(el); cMotivo('Rechazar el pago reportado', 'No se registra ningún pago: queda como rechazado y el cliente ve el motivo.', 'Rechazar pago', async m => { await cApi('POST', '/pagos/' + id + '/rechazar', {motivo: m}); toast('Pago rechazado.'); CP.pag.filas = null; CP.fich.lista = null; render(); }); }
});
