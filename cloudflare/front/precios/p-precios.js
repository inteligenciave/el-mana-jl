/* Cambios de precio · pantallas del equipo. Todos los precios son POR BULTO.
   Dueño: sus cambios rigen de una vez y aprueba o rechaza los de Administración (Gerencia → «Precios por aprobar»).
   Administración: sus cambios quedan pendientes hasta que el Dueño responda (Administración → «Precios»). */
const PP = {prod: null, cli: null, cambios: null, cargando: {}, pag: {}, filtro: 'PENDIENTE', busy: {}};
const pHTTP = () => !!window.__EM_HTTP;
const ptxt = s => esc(s == null ? '' : s);
const pDueno = () => S.rol === 'dueno';
const pFecha = ts => ts ? new Date(ts).toLocaleString('es-VE', {day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'}) : '—';
const pUsdBulto = c => c == null ? '<span class="muted">sin precio</span>' : 'US$ ' + N2.format(c / 100) + ' por bulto';
const pNom = p => ptxt(p.nombre) + ' ' + ptxt(p.gramaje || '');
const P_POR_PAG = 6, P_TARJ_PAG = 3;

async function pApi(m, ruta, cuerpo) {
  const r = await fetch('/api/v/precios' + ruta, {method: m, headers: {'content-type': 'application/json', 'x-rol': S.rol}, body: cuerpo ? JSON.stringify(cuerpo) : undefined});
  let j = {}; try { j = await r.json(); } catch (e) { /* sin cuerpo */ }
  if (!r.ok) { const e = new Error(j.error || 'No se pudo completar la operación.'); e.status = r.status; throw e; }
  return j;
}
async function pGet(ruta) {
  const r = await fetch('/api/v' + ruta, {headers: {'x-rol': S.rol}}); const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'No se pudo leer.'); return j;
}
const pErr = e => toast(esc(e && e.message ? e.message : 'No se pudo completar la operación.'), 'err');
async function pCargar(clave, fn) {
  if (PP.cargando[clave]) return; PP.cargando[clave] = true;
  try { await fn(); } catch (e) { console.error(e); PP[clave] = PP[clave] || []; }
  delete PP.cargando[clave]; render();
}
const pCargarProd = () => pCargar('prod', async () => { PP.prod = (await pGet('/arranque')).productos; });
const pCargarCli = () => pCargar('cli', async () => { PP.cli = await pGet('/clientes?limite=500'); });
const pCargarCambios = () => pCargar('cambios', async () => { PP.cambios = (await pApi('GET', '/cambios')).cambios; PP.ts = Date.now(); });
const pRecargar = () => { PP.cambios = null; PP.prod = null; PP.listas = null; PP.lm = null; };
const pPendientes = () => (PP.cambios || []).filter(c => c.estado === 'PENDIENTE');
const pUltimo = clave => (PP.cambios || []).find(c => c.clave === clave);   // la lista viene de la más nueva a la más vieja

/* Si cambia el puesto o pasaron más de 20 segundos, se vuelve a leer del servidor */
function pFrescura() {
  if (PP.rol !== S.rol) { PP.rol = S.rol; PP.cambios = PP.prod = PP.cli = PP.listas = null; PP.pag = {}; }
  else if (PP.cambios && Date.now() - (PP.ts || 0) > 20000 && !PP.cargando.cambios) PP.cambios = null;
}
function pPantalla(fn) {
  pFrescura();
  if (!pHTTP()) return ph('Precios', 'Precios', '', '') + card('', emptyState('Este módulo necesita el servidor', 'Funciona en la versión con base de datos (Cloudflare).'));
  return fn();
}
function pPaginar(k, total, porPag) {
  const n = Math.max(1, Math.ceil(total / porPag)), p = Math.min(PP.pag[k] || 0, n - 1); PP.pag[k] = p;
  return {desde: p * porPag, hasta: p * porPag + porPag, html: n > 1 ? `<div class="btnrow p-pag"><button type="button" class="btn sm" data-act="pPag" data-k="${k}" data-d="-1" ${p === 0 ? 'disabled' : ''}>Anterior</button><span class="hint">Página ${p + 1} de ${n}</span><button type="button" class="btn sm" data-act="pPag" data-k="${k}" data-d="1" ${p >= n - 1 ? 'disabled' : ''}>Siguiente</button></div>` : ''};
}
const pLineaHTML = l => `<li><span>${ptxt(l.que)}${l.que ? ': ' : ''}${ptxt(l.campo)}</span> <s class="muted">${ptxt(l.antes)}</s> → <b>${ptxt(l.despues)}</b></li>`;
const pChip = c => c.estado === 'PENDIENTE' ? '<span class="chip c-warn">Cambio de precio pendiente de aprobar</span>' : c.estado === 'RECHAZADO' ? '<span class="chip c-crit">Rechazado</span>' : '<span class="chip c-ok">Aprobado</span>';

/* ---------- Administración / Dueño: precios por lista (A y B), contado y crédito, todo POR BULTO ---------- */
const P_MOD = {contado: 'de contado', credito: 'a crédito'};
const pCentsATxt = c => N2.format(c / 100);
const pBs = c => { const t = S.tasaInfo && S.tasaInfo.valor; return t ? 'Bs ' + N2.format(c / 100 * t) : ''; };
const pCargarListas = () => pCargar('listas', async () => { const r = await pApi('GET', '/listas'); PP.listas = r.productos; PP.lm = {listas: r.listas, estados: r.estados}; });
function pCelda(p, lista, mod) {
  const x = (p.listas || {})[lista]; if (!x) return '<td class="r muted">—</td>';
  const c = mod === 'contado' ? x.contado_cents : x.credito_cents, cam = pUltimo('L:' + p.id_producto + ':' + lista + ':' + mod);
  const pend = cam && cam.estado === 'PENDIENTE', rech = cam && cam.estado === 'RECHAZADO';
  const nuevo = pend && cam.lineas[0] ? cam.lineas[0].despues.replace(' por bulto', '') : '';
  return `<td class="r p-cel"><button type="button" class="p-cbtn" data-act="pEditar" data-id="${p.id_producto}" data-l="${lista}" data-m="${mod}" aria-label="Cambiar precio ${P_MOD[mod]} por bulto de ${pNom(p)}, lista ${lista}"><b>US$ ${pCentsATxt(c)}</b><span class="p-bs">${pBs(c)}</span>${pend ? `<span class="chip c-warn">Pendiente de aprobar: ${ptxt(nuevo)}</span>` : ''}${rech ? `<span class="chip c-crit" title="${ptxt(cam.motivo || '')}">Rechazado${cam.motivo ? ': ' + ptxt(cam.motivo.slice(0, 40)) : ''}</span>` : ''}</button></td>`;
}
const pEstadosDe = n => (((PP.lm && PP.lm.listas) || []).find(l => l.nombre === n) || {}).estados || [];
const pTxtEstados = n => { const e = pEstadosDe(n); return e.length ? e.join(', ') : 'ningún estado'; };
function scrPrecios() {
  return pPantalla(() => {
    if (!PP.listas || !PP.lm) { pCargarListas(); return card('', emptyState('Cargando…', 'Un momento.')); }
    if (!PP.cambios) pCargarCambios();
    const t = S.tasaInfo && S.tasaInfo.valor, ls = PP.lm.listas, sel = ls.find(l => l.nombre === PP.sel) ? PP.sel : (ls[0] && ls[0].nombre), sinPrecios = PP.lm.estados.filter(e => !e.lista).length;
    return `${ph('Precios', 'Precios por lista')}
    
    <div class="p-tabs" role="tablist">${ls.map(l => `<button type="button" role="tab" class="btn sm ${l.nombre === sel ? 'pri' : ''}" aria-selected="${l.nombre === sel}" data-act="pLista" data-n="${ptxt(l.nombre)}">Lista ${ptxt(l.nombre)}</button>`).join('')}<button type="button" class="btn sm" data-act="pEstados">Estados y listas${sinPrecios ? ' <span class="chip c-warn">' + sinPrecios + ' sin precios</span>' : ''}</button></div>
    <p class="hint">Estados con la lista ${ptxt(sel)}: <b>${ptxt(pTxtEstados(sel))}</b> · ${t ? 'Bs: referencia a tasa BCV de hoy (Bs ' + N2.format(t) + ' por US$)' : 'Sin tasa BCV hoy'}</p>
    ${card('', `<div class="tw"><table class="p-listas"><thead><tr><th>Producto</th><th class="r">Contado · por bulto</th><th class="r">Crédito · por bulto</th></tr></thead><tbody>
      ${PP.listas.filter(p => (p.listas || {})[sel]).map(p => `<tr><td><b>${pNom(p)}</b></td>${pCelda(p, sel, 'contado')}${pCelda(p, sel, 'credito')}</tr>`).join('')}</tbody></table></div>`)}`;
  });
}
/* Estados y listas: cada estado usa UNA lista; varios pueden compartirla. Solo el Dueño cambia la asignación. */
function pEstadosModal() {
  const dueno = pDueno(), ls = PP.lm.listas;
  modal('Estados y listas de precios', `
    <div class="p-est"><table class="p-listas"><thead><tr><th>Estado</th><th>Zona</th><th>Lista</th><th></th></tr></thead><tbody>${PP.lm.estados.map(e => `<tr><td><b>${ptxt(e.estado)}</b></td><td>${ptxt(e.zona)}</td>
      <td><select data-estado="${ptxt(e.estado)}" aria-label="Lista de ${ptxt(e.estado)}" ${dueno ? '' : 'disabled'}><option value="" ${e.lista ? '' : 'selected'}>Sin precios</option>${ls.map(l => `<option value="${ptxt(l.nombre)}" ${l.nombre === e.lista ? 'selected' : ''}>Lista ${ptxt(l.nombre)}</option>`).join('')}</select></td>
      <td>${dueno ? `<button type="button" class="btn sm" data-act="pPropios" data-e="${ptxt(e.estado)}" ${e.lista && /^Propia/.test(e.lista) ? 'disabled' : ''}>Precios propios</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
    <div class="btnrow"><button type="button" class="btn" data-act="closeModal">Cerrar</button></div>`);
}
const pRefrescarEstados = async () => { pRecargar(); await pCargarListas(); if (typeof vBoot === 'function') vBoot(true); pEstadosModal(); render(); };
async function pEstadoLista(estado, lista) {
  try { const r = await pApi('PUT', '/estado', {estado, lista: lista || null}); toast(esc(r.mensaje)); await pRefrescarEstados(); }
  catch (er) { toast(esc(er.message)); }
}
async function pPropios(estado) {
  const act = (PP.lm.estados.find(e => e.estado === estado) || {}).lista;
  try { const r = await pApi('POST', '/estado/propios', {estado, copiar_de: act || 'A'}); toast(esc(r.mensaje)); PP.sel = r.lista; await pRefrescarEstados(); }
  catch (er) { toast(esc(er.message)); }
}
function pEditarModal(id, lista, mod) {
  const p = (PP.listas || []).find(x => x.id_producto === id); if (!p) return;
  const x = p.listas[lista], c = mod === 'contado' ? x.contado_cents : x.credito_cents, dueno = pDueno(), cam = pUltimo('L:' + id + ':' + lista + ':' + mod), bloqueado = !dueno && cam && cam.estado === 'PENDIENTE';
  modal(`Precio ${P_MOD[mod]} por bulto · lista ${lista}`, `<div class="form"><p><b>${pNom(p)}</b><br>Precio vigente: <b>US$ ${pCentsATxt(c)} por bulto</b> <span class="muted">(${pBs(c) || 'sin tasa BCV'})</span></p>
    ${bloqueado ? '<p class="v-alerta v-aviso" role="status">Ya hay un cambio pendiente de aprobar para este precio. Espera la respuesta del Dueño.</p>' : ''}
    <label class="fld">Precio nuevo por bulto (US$)<input type="text" inputmode="decimal" id="p-nuevo" placeholder="Ej.: 45,00" ${bloqueado ? 'disabled' : ''}></label>
    <p class="hint"><b>Este cambio aplica a: ${ptxt(pTxtEstados(lista))}.</b></p>
    <p class="err" id="p-e" role="alert" hidden></p><div class="btnrow"><button type="button" class="btn pri" data-act="pEditarOk" data-id="${id}" data-l="${lista}" data-m="${mod}" ${bloqueado ? 'disabled' : ''}>${dueno ? 'Cambiar precio' : 'Enviar para aprobar'}</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`);
  const i = $('#p-nuevo'); if (i && !bloqueado) i.focus();
}
async function pEditarOk(id, lista, mod) {
  const e = $('#p-e'); e.hidden = true; if (PP.busy.cambiar) return; PP.busy.cambiar = true;
  try { const r = await pApi('PUT', '/lista', {id_producto: id, lista, modalidad: mod, precio: $('#p-nuevo').value}); closeModal(); toast(esc(r.mensaje)); pRecargar(); render(); }
  catch (er) { e.textContent = er.message; e.hidden = false; }
  finally { delete PP.busy.cambiar; }
}

/* ---------- Precios especiales por cliente (por bulto) ---------- */
const P_DEF_CLI = [{tipo: 'Cliente', valores: c => c.razon_social, detalle: c => c.rif_id || 'sin RIF'}, {tipo: 'RIF', valores: c => c.rif_id, detalle: c => c.razon_social}];
function scrPreciosCliente() {
  return pPantalla(() => {
    if (!PP.cli) { pCargarCli(); return card('', emptyState('Cargando…', 'Un momento.')); }
    if (!PP.cambios) pCargarCambios();
    const lista = barraFiltrar('p-cli', PP.cli, P_DEF_CLI), pg = pPaginar('cli', lista.length, P_POR_PAG);
    return `${ph('Precios', 'Precios por cliente')}
    <div class="v-bar2">${barra('p-cli', 'Nombre o RIF del cliente', PP.cli, P_DEF_CLI)}</div>
    ${card('', table([{h: 'Cliente', f: c => `<b>${ptxt(c.razon_social)}</b><br><span class="muted mono">${ptxt(c.rif_id || 'sin RIF')}</span>`}, {h: 'Estado del cambio', f: c => { const x = pUltimo('C:' + c.id_cliente); return !x || x.estado === 'APROBADO' ? '' : x.estado === 'PENDIENTE' ? '<span class="chip c-warn">Pendiente de aprobar</span>' : `<span class="chip c-crit">Rechazado${x.motivo ? ': ' + ptxt(x.motivo) : ''}</span>`; }},
      {h: '', f: c => `<button type="button" class="btn sm" data-act="pReglas" data-id="${c.id_cliente}">Precios por bulto</button>`}], lista.slice(pg.desde, pg.hasta), {empty: 'Ningún cliente coincide con la búsqueda.'}) + pg.html)}`;
  });
}
async function pReglasModal(id) {
  try {
    if (!PP.prod) PP.prod = (await pGet('/arranque')).productos;
    if (!PP.cambios) PP.cambios = (await pApi('GET', '/cambios')).cambios;
    const r = await pGet('/clientes/' + id + '/precios'), rm = Object.fromEntries(r.reglas.map(x => [x.id_producto, x])), pm = Object.fromEntries(r.precios.map(x => [x.id_producto, x])), cd = x => x == null ? '' : String(x / 100).replace('.', ','), c = pUltimo('C:' + id), bloqueado = !pDueno() && c && c.estado === 'PENDIENTE';
    modal('Precios por bulto: ' + ptxt(r.cliente.razon_social), `<div class="form">
      ${bloqueado ? '<p class="v-alerta v-aviso" role="status">Ya hay un cambio pendiente de aprobar para este cliente. Espera la respuesta del Dueño.</p>' : ''}
      <div class="tw"><table class="v-reglas p-reglas"><thead><tr><th>Producto</th><th class="r">Rige hoy, por bulto</th><th class="r">A crédito, por bulto (US$)</th><th class="r">Pronto pago, por bulto (US$)</th><th class="r">Con mora, por bulto (US$)</th><th class="r">Descuento pronto pago %</th><th class="r">Recargo por mora %</th></tr></thead><tbody>
      ${PP.prod.map(p => { const x = rm[p.id_producto] || {}; return `<tr data-p="${p.id_producto}"><td>${pNom(p)}</td><td class="r">${(pm[p.id_producto] || {}).base == null ? '—' : 'US$ ' + N2.format(pm[p.id_producto].base)}</td>
        <td><input class="v-dec" data-r="precio_base_credito" value="${cd(x.precio_base_credito_cents)}" ${bloqueado ? 'disabled' : ''}></td><td><input class="v-dec" data-r="precio_pronto_pago" value="${cd(x.precio_pronto_pago_cents)}" ${bloqueado ? 'disabled' : ''}></td><td><input class="v-dec" data-r="precio_mora_vencido" value="${cd(x.precio_mora_vencido_cents)}" ${bloqueado ? 'disabled' : ''}></td>
        <td><input class="v-dec" data-r="pct_descuento_pp" value="${x.pct_descuento_pp == null ? '' : String(x.pct_descuento_pp).replace('.', ',')}" ${bloqueado ? 'disabled' : ''}></td><td><input class="v-dec" data-r="pct_recargo_mora" value="${x.pct_recargo_mora == null ? '' : String(x.pct_recargo_mora).replace('.', ',')}" ${bloqueado ? 'disabled' : ''}></td></tr>`; }).join('')}</tbody></table></div>
      <p class="err" id="p-e" role="alert" hidden></p><div class="btnrow"><button type="button" class="btn pri" data-act="pReglasOk" data-id="${id}" ${bloqueado ? 'disabled' : ''}>${pDueno() ? 'Guardar precios' : 'Enviar para aprobar'}</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`);
  } catch (e) { pErr(e); }
}
async function pReglasOk(id) {
  const e = $('#p-e'); e.hidden = true; if (PP.busy.reglas) return; PP.busy.reglas = true;
  const reglas = [...document.querySelectorAll('.p-reglas tbody tr')].map(tr => { const o = {id_producto: +tr.dataset.p}; tr.querySelectorAll('[data-r]').forEach(i => { o[i.dataset.r] = i.value.trim(); }); return o; });
  try { const r = await pApi('PUT', '/cliente/' + id, {reglas}); closeModal(); toast(esc(r.mensaje)); pRecargar(); render(); }
  catch (er) { e.textContent = er.message; e.hidden = false; }
  finally { delete PP.busy.reglas; }
}

/* ---------- Administración: cómo van mis cambios ---------- */
function scrEstadoCambios() {
  return pPantalla(() => {
    if (!PP.cambios) { pCargarCambios(); return card('', emptyState('Cargando…', 'Un momento.')); }
    const F = [['PENDIENTE', 'Pendientes de aprobar'], ['RECHAZADO', 'Rechazados'], ['APROBADO', 'Aprobados'], ['', 'Todos']];
    const lista = PP.cambios.filter(c => !PP.filtro || c.estado === PP.filtro), pg = pPaginar('est', lista.length, P_POR_PAG);
    return `${ph('Precios', 'Mis cambios de precio')}
    <div class="v-tabs" role="tablist">${F.map(([k, t]) => `<button type="button" role="tab" aria-selected="${PP.filtro === k}" class="v-tab" data-act="pFiltro" data-v="${k}">${t}${k === 'PENDIENTE' && pPendientes().length ? ' (' + pPendientes().length + ')' : ''}</button>`).join('')}</div>
    ${card('', table([{h: 'Qué se cambia', f: c => `<b>${ptxt(c.titulo)}</b><br><span class="muted">${ptxt(c.tipo_txt)}</span>`}, {h: 'Cambio', f: c => `<ul class="p-lin">${c.lineas.slice(0, 2).map(pLineaHTML).join('')}</ul>${c.lineas.length > 2 ? `<button type="button" class="btn sm" data-act="pVerTodo" data-id="${c.id}">Ver los ${c.lineas.length} cambios</button>` : ''}`},
      {h: 'Estado', f: c => pChip(c) + (c.estado === 'RECHAZADO' && c.motivo ? `<br><span class="muted">Motivo: ${ptxt(c.motivo)}</span>` : '')}, {h: 'Pedido', f: c => `${ptxt(c.pedido_por)}<br><span class="muted">${pFecha(c.pedido_ts)}</span>`}], lista.slice(pg.desde, pg.hasta), {empty: 'No hay cambios de precio en esta lista.'}) + pg.html)}`;
  });
}
function pVerTodo(id) {
  const c = (PP.cambios || []).find(x => x.id === id); if (!c) return;
  modal(ptxt(c.titulo), `<div class="form"><p>${pChip(c)} · pedido por ${ptxt(c.pedido_por)} el ${pFecha(c.pedido_ts)}</p><ul class="p-lin">${c.lineas.map(pLineaHTML).join('')}</ul><div class="btnrow"><button type="button" class="btn" data-act="closeModal">Cerrar</button></div></div>`);
}

/* ---------- Gerencia: lista de cambios por aprobar (solo el Dueño) ---------- */
function scrAprobar() {
  return pPantalla(() => {
    if (!PP.cambios) { pCargarCambios(); return card('', emptyState('Cargando…', 'Un momento.')); }
    const lista = pPendientes(), pg = pPaginar('apr', lista.length, P_TARJ_PAG);
    const tarj = c => `<article class="card p-cambio"><div class="card-b"><p><b>${ptxt(c.titulo)}</b> ${pChip(c)}</p><p class="hint">${ptxt(c.tipo_txt)} · pedido por ${ptxt(c.pedido_por)} el ${pFecha(c.pedido_ts)}</p>
      <ul class="p-lin">${c.lineas.slice(0, 4).map(pLineaHTML).join('')}</ul>${c.lineas.length > 4 ? `<button type="button" class="btn sm" data-act="pVerTodo" data-id="${c.id}">Ver los ${c.lineas.length} cambios</button>` : ''}
      <div class="btnrow"><button type="button" class="btn pri" data-act="pAprobar" data-id="${c.id}" ${PP.busy['r' + c.id] ? 'disabled' : ''}>Aprobar</button><button type="button" class="btn" data-act="pRechazar" data-id="${c.id}" ${PP.busy['r' + c.id] ? 'disabled' : ''}>Rechazar</button></div></div></article>`;
    return `${ph('Gerencia', 'Cambios de precio por aprobar')}
    ${lista.length ? `<div class="p-cambios">${lista.slice(pg.desde, pg.hasta).map(tarj).join('')}</div>${pg.html}`
      : card('', emptyState('No hay cambios de precio por aprobar', 'Cuando Administración pida un cambio de precio aparecerá aquí para que lo apruebes o lo rechaces.'))}`;
  });
}
async function pResolver(id, accion, motivo) {
  if (PP.busy['r' + id]) return; PP.busy['r' + id] = true; render();
  try { const r = await pApi('POST', '/cambios/' + id + '/' + accion, accion === 'rechazar' ? {motivo} : {}); toast(accion === 'aprobar' ? 'Cambio aprobado: el precio nuevo ya rige.' : 'Cambio rechazado: sigue el precio anterior.'); closeModal(); }
  catch (e) { pErr(e); }
  finally { delete PP.busy['r' + id]; pRecargar(); render(); }
}
function pRechazarModal(id) {
  const c = (PP.cambios || []).find(x => x.id === id); if (!c) return;
  modal('Rechazar el cambio de ' + ptxt(c.titulo), `<div class="form"><p>Se queda el precio anterior y Administración verá que fue rechazado.</p><label class="fld">Motivo (opcional)<input type="text" id="p-mot" maxlength="200" placeholder="Por qué no se aprueba"></label>
    <div class="btnrow"><button type="button" class="btn pri" data-act="pRechazarOk" data-id="${id}">Rechazar</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`);
  $('#p-mot').focus();
}

/* ---------- Registro en la aplicación ---------- */
Object.assign(PERM_DEF, {'p-precios': 'adm:2', 'p-clientes': 'adm:2', 'p-estado': 'adm:1', 'p-aprobar': ''});
Object.assign(SCREENS, {
  'p-precios':  {mod: 'adm', g: 'Precios', t: 'Precios por lista', s: 'Por lista', ic: 'tag', r: scrPrecios},
  'p-clientes': {mod: 'adm', g: 'Precios', t: 'Precios por cliente', s: 'Por cliente', ic: 'users', r: scrPreciosCliente},
  'p-estado':   {mod: 'adm', g: 'Precios', t: 'Mis cambios de precio', s: 'Mis cambios', ic: 'receipt', r: scrEstadoCambios},
  'p-aprobar':  {mod: 'adm', g: 'Gerencia', t: 'Cambios de precio por aprobar', s: 'Por aprobar', ic: 'check', r: scrAprobar}
});
S.perm = permInit();
const PACT_REQ = {pEstadoLista: ['p-precios', 3], pPropios: ['p-precios', 3], pEditarOk: ['p-precios', 2], pReglasOk: ['p-clientes', 2], pAprobar: ['p-aprobar', 3], pRechazarOk: ['p-aprobar', 3]};
const PACT_LBL = {pEstadoLista: 'asignar listas a estados', pPropios: 'dar precios propios a un estado', pEditarOk: 'cambiar precios', pReglasOk: 'cambiar precios por cliente', pAprobar: 'aprobar cambios de precio', pRechazarOk: 'rechazar cambios de precio'};
Object.assign(ACT_REQ, PACT_REQ); Object.assign(ACT_LBL, PACT_LBL); Object.keys(PACT_REQ).forEach(k => WRITE_ACTS.add(k));
Object.assign(ACT, {
  pLista: el => { PP.sel = el.dataset.n; render(); }, pEstados: () => pEstadosModal(), pPropios: el => pPropios(el.dataset.e),
  pPag: el => { if (el.disabled) return; PP.pag[el.dataset.k] = Math.max(0, (PP.pag[el.dataset.k] || 0) + (+el.dataset.d)); render(); },
  pFiltro: el => { PP.filtro = el.dataset.v; PP.pag.est = 0; render(); },
  pEditar: el => pEditarModal(+el.dataset.id, el.dataset.l, el.dataset.m), pEditarOk: el => pEditarOk(+el.dataset.id, el.dataset.l, el.dataset.m),
  pReglas: el => pReglasModal(+el.dataset.id), pReglasOk: el => pReglasOk(+el.dataset.id),
  pVerTodo: el => pVerTodo(+el.dataset.id),
  pAprobar: el => pResolver(+el.dataset.id, 'aprobar'), pRechazar: el => pRechazarModal(+el.dataset.id), pRechazarOk: el => pResolver(+el.dataset.id, 'rechazar', $('#p-mot').value)
});
/* Insignia en el menú: cuántos cambios esperan al Dueño */
const _badgesP = badges;
badges = function () {
  const b = _badgesP(); pFrescura();
  if (S.entry === 'in' && (S.rol === 'dueno' || S.rol === 'adm') && pHTTP()) { if (!PP.cambios) pCargarCambios(); b['p-aprobar'] = [pPendientes().length, 'w']; b['p-estado'] = [S.rol === 'adm' ? pPendientes().length : 0, 'w']; }
  return b;
};
window.pPendientesN = () => pPendientes().length;
window.pCambiosCargados = () => !!PP.cambios;

document.addEventListener('change', e => { const t = e.target; if (t && t.dataset && t.dataset.estado && t.tagName === 'SELECT') pEstadoLista(t.dataset.estado, t.value); });
