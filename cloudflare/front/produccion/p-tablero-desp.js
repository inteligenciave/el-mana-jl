/* Logística · pantalla de inicio «Zonas»: una tarjeta por LÍNEA de despacho (un grupo de zonas que llenan un mismo camión).
   Cada tarjeta suma los kilos de sus zonas y dice qué tan lleno va el camión: % = kg de papa ÷ capacidad de papa + kg de salsa ÷ capacidad de salsa.
   Al abrir una línea se ven sus zonas, sus pedidos (mezclando zonas) y se arma la salida del camión. Gerencia organiza las líneas con «Organizar líneas».
   Lee todo de GET /api/p/lineas y /api/p/lineas/:id (el servidor hace las cuentas); no hay lista fija de zonas. Sin dinero. */
PR.lin = null; PR.linSel = null; PR.ldata = null; PR.lsel = {}; PR.linDesp = null; PR.lnRol = null; PR.org = null; PR.orgBorrar = null; PR.zonaDesp = null;
PR_VIVAS.push('lin', 'ldata');
const lnT = kg => kg >= 1000 ? prN(kg / 1000, 1) + ' t' : prKg(kg);   // 6.000 kg se ve «6,0 t»; 500 kg se ve «500 kg»
const lnPct = p => prN(p, p % 1 ? 1 : 0) + ' %';
const lnBarra = p => `<div class="pr-bar" role="img" aria-label="${lnPct(p)} del camión"><span class="${p >= 100 ? 'ok' : ''}" style="width:${Math.min(100, Math.max(0, p))}%"></span></div>`;
const LN_CHIP = {LLENA: 'c-ok', ARMADA: 'c-ok', ESPERA: 'c-warn', SIN_PEDIDOS: 'c-n', PAUSADA: 'c-n'};
const lnChip = l => `<span class="chip ${LN_CHIP[l.estado] || 'c-n'}">${prT(l.estado_txt)}</span>`;
const lnZonasTxt = l => l.zonas.length ? l.zonas.map(z => prT(z.zona)).join(' · ') : 'Sin zonas todavía';
const lnPl = (n, s, p) => prN(n) + ' ' + (n === 1 ? s : p);

function lnTarjeta(l) {
  return `<article class="em-card est-${l.estado}"><button type="button" class="em-b" data-act="lnAbrir" data-id="${l.id_linea}" aria-label="Abrir la línea ${prT(l.nombre)}">
    <h3>${prT(l.nombre)}</h3><p class="em-zs">${lnZonasTxt(l)}</p>
    <p class="em-big">${lnPct(l.ocupacion_pct)} <small>del camión</small></p>${lnBarra(l.ocupacion_pct)}
    <p class="em-sub">Papa ${lnT(l.kg_papa)} · Salsa ${lnT(l.kg_salsa)}</p>
    <p class="em-est">${lnChip(l)}${l.exceso ? ' <span class="chip c-warn">Pasa del 100 %</span>' : ''}</p>
    <p class="em-ped">${lnPl(l.pedidos, 'pedido', 'pedidos')} · ${lnPl(l.clientes, 'cliente', 'clientes')}${l.salidas_armando ? ' · ' + lnPl(l.salidas_armando, 'salida', 'salidas') + ' por cargar' : ''}</p></button></article>`;
}
function lnSinTarjeta(S0) {
  const con = S0.zonas.filter(z => z.kilos > 0), sin = S0.zonas.length - con.length;
  return `<article class="em-card sin"><button type="button" class="em-b" data-act="lnAbrir" data-id="sin" aria-label="Abrir las zonas sin línea">
    <h3>Sin línea</h3><p class="em-zs">${con.length ? con.slice(0, 3).map(z => prT(z.zona) + ' ' + lnT(z.kilos)).join(' · ') + (con.length > 3 ? ' · +' + (con.length - 3) : '') : 'Ninguna zona con pedidos'}</p>
    <p class="em-big">${lnT(S0.kilos)} <small>listos</small></p><p class="em-sub">${sin ? lnPl(sin, 'zona', 'zonas') + ' sin pedidos' : '&nbsp;'}</p>
    <p class="em-est"><span class="chip c-n">Se arman por zona</span></p><p class="em-ped">${lnPl(S0.pedidos, 'pedido', 'pedidos')} · ${lnPl(S0.clientes, 'cliente', 'clientes')}</p></button></article>`;
}
function scrTablero() {
  if (!window.__EM_HTTP) return ph('Logística', 'Zonas', '', '') + card('', emptyState('Este módulo necesita el servidor', 'Funciona en la versión con base de datos.'));
  if (PR.lnRol !== S.rol) { PR.lnRol = S.rol; PR.lin = PR.ldata = null; PR.linSel = null; PR.lsel = {}; }
  PR.zonaDesp = null; PR.linDesp = null;
  if (PR.linSel) return scrLineaDetalle();
  const acc = S.rol === 'dueno' ? '<button type="button" class="btn pri sm" data-act="lnOrgAbrir">Organizar líneas</button>' : '';
  const w = prEspera('Zonas', 'lin', '/lineas', 'lin'); if (w) return w;
  const V = PR.lin, cap = V.capacidad || {};
  const nota = `<p class="em-nota">Camión lleno: ${lnT(cap.papa_kg || 0)} de papa o ${lnT(cap.salsa_kg || 0)} de salsas, o la mezcla de las dos. Cada tarjeta es una línea y suma sus zonas.</p>`;
  const vacia = !V.lineas.length ? `<p class="em-nota em-aviso">${S.rol === 'dueno' ? 'Todavía no hay líneas: toca «Organizar líneas» para crear la primera.' : 'Gerencia todavía no armó las líneas. Mientras tanto cada zona se arma sola.'}</p>` : '';
  return `${ph('Logística', 'Zonas', '', '')}<div class="em-fila">${nota}${acc}</div>${vacia}<div class="em-grid">${V.lineas.map(lnTarjeta).join('')}${lnSinTarjeta(V.sin_linea)}</div>`;
}

/* ---------- Detalle de una línea: sus zonas, sus pedidos y el armado del camión ---------- */
function scrLineaDetalle() {
  const w = prEspera('Zonas', 'ld', '/lineas/' + PR.linSel, 'ldata'); if (w) return w;
  const D = PR.ldata, sin = PR.linSel === 'sin', mover = prMover(), ger = S.rol === 'dueno', cap = D.capacidad || {};
  const volver = '<button type="button" class="btn sm" data-act="lnVolver">Volver a las líneas</button>';
  PR.linDesp = sin ? null : {id: D.id_linea, nombre: D.nombre, zonas: D.zonas.map(z => z.zona)};
  const zonas = D.zonas.map(z => `<button type="button" class="ln-z ${z.pausada ? 'pausa' : ''}" data-act="lnZona" data-z="${prT(z.zona)}" aria-label="Abrir la zona ${prT(z.zona)}"><b>${prT(z.zona)}</b><span>${lnT(z.kilos)}${sin ? '' : ' · ' + lnPct(z.aporte_pct)}</span>
    <small>${z.pausada ? 'Pausada: ' + prT(z.pausa_motivo || '') : lnPl(z.pedidos, 'pedido', 'pedidos')}</small></button>`).join('');
  const nota = !D.exceso ? '' : D.gerencia_decidio ? 'Gerencia ya eligió qué pedidos salen; lo que sobra espera a la siguiente salida.' : ger ? 'Pasa del 100 %: elige qué pedidos salen; lo que sobra espera a la siguiente salida. Tu decisión manda sobre la de Logística.' : 'Pasa del 100 %: puedes elegir qué pedidos salen mientras Gerencia no decida; si Gerencia decide, su elección manda.';
  const resumen = sin ? `<p class="em-big">${lnT(D.kilos)} <small>listos en zonas sin línea</small></p><p class="em-sub">Estas zonas se arman una por una: toca la zona.</p>` :
    `<p class="em-big">${lnPct(D.ocupacion_pct)} <small>del camión</small> ${lnChip(D)}${D.exceso ? ' <span class="chip c-warn">Pasa del 100 %</span>' : ''}</p>${lnBarra(D.ocupacion_pct)}
     <p class="em-sub">Papa ${lnT(D.kg_papa)} de ${lnT(cap.papa_kg || 0)} · Salsa ${lnT(D.kg_salsa)} de ${lnT(cap.salsa_kg || 0)}</p>${nota ? `<p class="em-sub">${nota}</p>` : ''}`;
  const sals = (D.salidas_armando || []).map(s => { const nuevo = s.ocupacion_pct != null, deGer = nuevo && s.creado_rol === 'Gerencia';
    return `<div class="pr-sal"><span><b>${prT(s.nro)}</b> · ${nuevo ? lnPct(s.ocupacion_pct) + ' · ' : ''}${prKg(s.kilos)} · ${lnPl(s.pedidos, 'pedido', 'pedidos')}${deGer ? ' <span class="chip c-ok">Eligió Gerencia</span>' : ''}${s.cargada_ts ? ' <span class="chip c-ok">Carga contada</span>' : ''}</span>
      <span class="btnrow">${mover ? `${s.cargada_ts ? '' : `<button type="button" class="btn sm" data-act="prCargaAbrir" data-id="${s.id_salida}">Contar la carga</button>`}<button type="button" class="btn pri sm" data-act="prDespachar" data-id="${s.id_salida}" data-k="${s.kilos}" data-nm="${nuevo ? 1 : 0}">Despachar</button>${deGer && !ger ? '' : `<button type="button" class="btn sm" data-act="prAnularSal" data-id="${s.id_salida}">Anular</button>`}` : ''}</span></div>`; }).join('');
  const desp = (D.salidas_despachadas || []).length ? `<ul class="pr-lin">${D.salidas_despachadas.map(s => `<li><span><b>${prT(s.nro)}</b> · ${prKg(s.kilos)}</span><span class="muted">${prT([s.vehiculo, s.chofer].filter(Boolean).join(' · ') || 'Sin vehículo ni chofer')}</span></li>`).join('')}</ul>` : '';
  /* En «Sin línea» los pedidos solo se ven: se arman por zona. */
  const puedeArmar = mover && !sin, bloqueaLog = D.exceso && D.gerencia_decidio && !ger, sel = PR.lsel;
  const fila = p => `<div class="pr-ped"><label class="pr-ped-h"><input type="checkbox" data-act-change="lnSel" data-p="${p.id_pedido}" ${sel[p.id_pedido] ? 'checked' : ''} ${puedeArmar && !p.pausada && !bloqueaLog ? '' : 'disabled'}> <b>${prT(p.nro)}</b> · ${prT(p.cliente)} <span class="muted">· ${prT(p.fecha)}</span>${p.paga_ahora ? ' <span class="chip c-ok">Pagó ahora</span>' : ''}${p.pausada ? ' <span class="chip c-warn">Zona pausada</span>' : ''}</label>
    <ul class="pr-lin">${p.lineas.map(l => `<li><span>${prT(l.nombre)} <small class="muted">(${l.tipo === 'salsa' ? 'salsa' : 'papa'})</small></span><span class="muted">${prN(l.pendiente)} bultos · ${prKg(l.pendiente * l.kg_por_bulto)}${l.en_salida ? ' · ' + prN(l.en_salida) + ' ya en una salida' : ''}</span>
      ${puedeArmar && !p.pausada && sel[p.id_pedido] && l.libre > 0 ? `<input class="pr-q" type="text" inputmode="numeric" data-act-change="lnQ" data-l="${l.id_linea}" data-p="${p.id_pedido}" data-max="${l.libre}" value="${prN((sel[p.id_pedido].l || {})[l.id_linea] ?? l.libre)}" aria-label="Bultos de ${prT(l.nombre)} que salen"> <span class="muted">bultos que salen</span>` : ''}</li>`).join('')}</ul></div>`;
  const porZona = []; for (const p of D.pedidos) { let g = porZona.find(x => x[0] === p.zona); if (!g) { g = [p.zona, []]; porZona.push(g); } g[1].push(p); }
  const lista = porZona.map(([z, ps]) => `<h4 class="ln-zh">${prT(z)}</h4>${ps.map(fila).join('')}`).join('');
  const k = lnKilosSel(D), pie = puedeArmar && D.pedidos.length ? `<div class="pr-pie"><span id="pr-ks">${k.pct > 0 ? `Sale en este camión: <b>${lnPct(k.pct)}</b> (Papa ${lnT(k.kp)} · Salsa ${lnT(k.ks)})${k.pct > 100 ? (ger ? ' · pasa del 100 %: lo decides tú' : ' · pasa del 100 %: solo Gerencia') : ''}` : 'Marca los pedidos que salen en este camión.'}</span>
    <button type="button" class="btn pri" data-act="lnArmar" ${k.pct > 0 && (k.pct <= 100 || ger) ? '' : 'disabled'}>Armar salida con lo marcado</button></div>` : '';
  return `${ph('Logística', 'Zonas', '', '')}<div class="btnrow ln-volver">${volver}</div><div class="ln-det"><div class="ln-izq"><h2 class="ln-t">${prT(D.nombre)}</h2>${card('', `<div class="pr-res">${resumen}</div>`)}
    <div class="ln-zonas">${zonas || '<p class="muted">Esta línea todavía no tiene zonas.</p>'}</div>
    ${sals ? card('Salidas armadas', sals) : ''}${desp ? card('Últimas salidas despachadas', desp) : ''}</div>
    <div class="ln-der">${card('Pedidos por despachar', D.pedidos.length ? `<div class="ln-lista">${lista}</div>${pie}` : emptyState('Sin pedidos pendientes', 'Esta ' + (sin ? 'agrupación' : 'línea') + ' no tiene nada por despachar.'))}</div></div>`;
}
function lnKilosSel(D) {
  let kp = 0, ks = 0; for (const p of D.pedidos) { const s = PR.lsel[p.id_pedido]; if (!s || p.pausada) continue; for (const l of p.lineas) { const n = Math.min((s.l || {})[l.id_linea] ?? l.libre, l.libre), kg = n * l.kg_por_bulto; if (l.tipo === 'salsa') ks += kg; else kp += kg; } }
  const c = D.capacidad || {}, pct = Math.round(((c.papa_kg > 0 ? kp / c.papa_kg : 0) + (c.salsa_kg > 0 ? ks / c.salsa_kg : 0)) * 1000) / 10;
  return {kp: Math.round(kp * 1000) / 1000, ks: Math.round(ks * 1000) / 1000, pct};
}
function lnArmarModal() {
  const D = PR.ldata, k = lnKilosSel(D), dividen = D.pedidos.some(p => PR.lsel[p.id_pedido] && p.lineas.some(l => ((PR.lsel[p.id_pedido].l || {})[l.id_linea] ?? l.libre) < l.pendiente));
  modal('Armar salida', `<div class="form"><p>Sale <b>${lnPct(k.pct)}</b> del camión de la línea ${prT(D.nombre)} (Papa ${lnT(k.kp)} · Salsa ${lnT(k.ks)}).${dividen ? ' Algún pedido sale en dos partes.' : ''}${k.pct < 100 ? ' Sale con menos del 100 %: si quieres, cuenta por qué.' : ''}</p>
    ${!dividen && k.pct < 100 ? '<label class="fld">Motivo (opcional, con tus palabras)<input type="text" id="pr-mot" maxlength="200" placeholder="Por qué sale con menos del 100 %"></label>' : ''}
    ${dividen ? '<label class="fld">Motivo (obligatorio)<input type="text" id="pr-mot" maxlength="200" placeholder="Por qué se divide el pedido"></label>' : ''}
    <p class="err" id="pr-e" role="alert" hidden></p><div class="btnrow"><button type="button" class="btn pri" data-act="lnArmarOk">Armar salida</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`);
  const m = $('#pr-mot'); if (m) m.focus();
}
async function lnArmarOk() {
  const D = PR.ldata, e = $('#pr-e'); e.hidden = true; if (PR.busy) return; PR.busy = true;
  const lineas = []; for (const p of D.pedidos) { const s = PR.lsel[p.id_pedido]; if (!s || p.pausada) continue; for (const l of p.lineas) { const n = Math.min((s.l || {})[l.id_linea] ?? l.libre, l.libre); if (n > 0) lineas.push({id_linea: l.id_linea, bultos: n}); } }
  try { const r = await prApi('POST', '/salidas', {id_linea: D.id_linea, lineas, motivo: ($('#pr-mot') || {}).value || ''}); closeModal(); PR.lsel = {};
    toast('Salida ' + esc(r.nro) + ' armada: ' + lnPct(r.ocupacion_pct) + ' del camión.' + ((r.reemplazadas || []).length ? ' Reemplaza la propuesta ' + r.reemplazadas.map(esc).join(', ') + '.' : '') + ' Falta despacharla.'); prRefrescar('lin', 'ldata', 'tab', 'sals'); }
  catch (er) { e.textContent = er.message; e.hidden = false; } finally { PR.busy = false; }
}

/* ---------- Organizar líneas (solo Gerencia): crear, renombrar, mover zonas, borrar ---------- */
function lnOrgPintar(msg) {
  const V = PR.org; if (!V) return;
  const lineas = V.lineas.slice().sort((a, b) => (a.orden || 0) - (b.orden || 0) || a.nombre.localeCompare(b.nombre, 'es')), sueltas = V.sin_linea.zonas;
  const opc = zona => `<select data-act-change="lnMover" data-z="${prT(zona)}" aria-label="Mover la zona ${prT(zona)} a una línea"><option value="">Mover a…</option>${lineas.map(l => `<option value="${l.id_linea}">${prT(l.nombre)}</option>`).join('')}</select>`;
  const bloque = l => `<section class="ln-org"><div class="ln-org-h"><input type="text" class="ln-nom" maxlength="40" value="${prT(l.nombre)}" data-act-change="lnRenombrar" data-id="${l.id_linea}" aria-label="Nombre de la línea">
    ${PR.orgBorrar === l.id_linea ? `<button type="button" class="btn sm pri" data-act="lnBorrarOk" data-id="${l.id_linea}">Sí, borrar</button><button type="button" class="btn sm" data-act="lnBorrarNo">No</button>` : `<button type="button" class="btn sm" data-act="lnBorrar" data-id="${l.id_linea}">Borrar línea</button>`}</div>
    <div class="ln-chips">${l.zonas.length ? l.zonas.map(z => `<span class="ln-chip">${prT(z.zona)}<button type="button" data-act="lnQuitar" data-id="${l.id_linea}" data-z="${prT(z.zona)}" aria-label="Sacar ${prT(z.zona)} de la línea ${prT(l.nombre)}">×</button></span>`).join('') : '<small class="muted">Sin zonas: elige abajo en «Sin línea».</small>'}</div>
    ${PR.orgBorrar === l.id_linea ? '<p class="hint">Sus zonas quedan «Sin línea». ¿Borrar esta línea?</p>' : ''}</section>`;
  modal('Organizar líneas', `<div class="form ln-form"><p class="hint">Cada zona va en una sola línea. Las zonas que no estén en ninguna salen como «Sin línea» y se arman solas.</p>
    <div class="ln-nueva"><input type="text" id="ln-nuevo" maxlength="40" placeholder="Nombre de la línea nueva" aria-label="Nombre de la línea nueva"><button type="button" class="btn pri sm" data-act="lnNueva">Nueva línea</button></div>
    <p class="err" id="pr-e" role="alert" ${msg ? '' : 'hidden'}>${prT(msg || '')}</p>
    ${lineas.map(bloque).join('')}
    <section class="ln-org"><h4>Sin línea</h4>${sueltas.length ? `<ul class="ln-sueltas">${sueltas.map(z => `<li><span>${prT(z.zona)}${z.kilos > 0 ? ' <small class="muted">' + lnT(z.kilos) + '</small>' : ''}</span>${lineas.length ? opc(z.zona) : ''}</li>`).join('')}</ul>` : '<p class="muted">Todas las zonas están en una línea.</p>'}</section>
    <div class="btnrow"><button type="button" class="btn pri" data-act="closeModal">Listo</button></div></div>`);
}
async function lnOrgAbrir() { try { PR.orgBorrar = null; PR.org = await prApi('GET', '/lineas'); lnOrgPintar(); } catch (er) { toast(esc(er.message), 'err'); } }
async function lnOrg(fn) {
  if (PR.busy) return; PR.busy = true;
  try { await fn(); PR.org = await prApi('GET', '/lineas'); PR.orgBorrar = null; PR.lin = PR.ldata = PR.tab = null; lnOrgPintar(); }
  catch (er) { try { PR.org = await prApi('GET', '/lineas'); } catch (e2) { /* sin respuesta */ } lnOrgPintar(er.message); }
  finally { PR.busy = false; }
}
const lnOrgLinea = id => (PR.org.lineas.find(l => l.id_linea === id) || {zonas: []});
Object.assign(ACT_REQ, {lnArmarOk: ['pr-zonas', 2], lnOrgAbrir: ['pr-aj', 3], lnNueva: ['pr-aj', 3], lnRenombrar: ['pr-aj', 3], lnQuitar: ['pr-aj', 3], lnMover: ['pr-aj', 3], lnBorrarOk: ['pr-aj', 3]});
Object.assign(ACT_LBL, {lnArmarOk: 'armar salidas', lnOrgAbrir: 'organizar las líneas', lnNueva: 'crear líneas', lnRenombrar: 'cambiar líneas', lnQuitar: 'cambiar líneas', lnMover: 'cambiar líneas', lnBorrarOk: 'borrar líneas'});
['lnArmarOk', 'lnNueva', 'lnRenombrar', 'lnQuitar', 'lnMover', 'lnBorrarOk'].forEach(k => WRITE_ACTS.add(k));
Object.assign(PERM_DEF, {'em-tablero': 'empaque:1'});
Object.assign(SCREENS, {'em-tablero': {mod: 'prod', g: 'Despacho', t: 'Zonas', s: 'Zonas', ic: 'truck', r: scrTablero}});
S.perm = permInit();
Object.assign(ACT, {
  emzTodas: () => { PR.zonaDesp = null; PR.linDesp = null; render(); },
  lnAbrir: el => { PR.linSel = el.dataset.id; PR.ldata = null; PR.lsel = {}; render(); },
  lnVolver: () => { PR.linSel = null; PR.ldata = null; PR.lsel = {}; PR.lin = null; render(); },
  lnIrLinea: el => { PR.linSel = el.dataset.id; PR.ldata = null; PR.lsel = {}; PR.z = null; PR.zdata = null; enter('em-tablero'); },
  lnZona: el => { PR.z = {nombre: el.dataset.z}; PR.zdata = null; PR.sel = {}; enter('pr-zonas'); },
  lnSel: el => { const id = el.dataset.p; if (el.checked) PR.lsel[id] = {l: {}}; else delete PR.lsel[id]; render(); },
  lnQ: el => { const max = +el.dataset.max, id = el.dataset.p; let n = parseInt(String(el.value).replace(/\D/g, ''), 10); if (!(n >= 0)) n = max; n = Math.min(n, max); (PR.lsel[id].l ||= {})[el.dataset.l] = n; render(); },
  lnArmar: () => lnArmarModal(), lnArmarOk: () => lnArmarOk(),
  lnOrgAbrir: () => lnOrgAbrir(),
  lnNueva: () => { const v = ($('#ln-nuevo') || {}).value || ''; lnOrg(() => prApi('POST', '/lineas', {nombre: v, zonas: []})); },
  lnRenombrar: el => lnOrg(() => prApi('POST', '/lineas/' + el.dataset.id, {nombre: el.value})),
  lnQuitar: el => { const id = +el.dataset.id; lnOrg(() => prApi('POST', '/lineas/' + id, {zonas: lnOrgLinea(id).zonas.map(z => z.zona).filter(z => z !== el.dataset.z)})); },
  lnMover: el => { const a = +el.value; if (!a) return; const z = el.dataset.z; lnOrg(() => prApi('POST', '/lineas/' + a, {zonas: lnOrgLinea(a).zonas.map(x => x.zona).concat(z)})); },
  lnBorrar: el => { PR.orgBorrar = +el.dataset.id; lnOrgPintar(); },
  lnBorrarNo: () => { PR.orgBorrar = null; lnOrgPintar(); },
  lnBorrarOk: el => lnOrg(() => prApi('POST', '/lineas/' + el.dataset.id + '/borrar', {}))
});
