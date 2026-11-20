/* Recibir, diferencias e Inventario general.
   · «Recibir compra» (Producción): la compra aparece como «pendiente por llegar» apenas se registra. Al tocar Recibir queda LISTA en un solo paso:
     deuda (o pago) según lo realmente recibido. Papa cruda por saco: se cuentan los sacos y se pesan 5 de muestra; kilos del lote = promedio real × sacos.
     Si lo recibido difiere de lo comprado, una alarma pide confirmar y escribir el motivo.
   · «Diferencias de compras» (Administración): solo lectura de lo que llegó distinto, con su motivo. No hay paso de validación.
   · «Inventario general»: una sola cifra por artículo (papa, aceite, agua, sal, químicos, bolsones y una bolsa por cada presentación). Arranca con el conteo físico inicial; las compras suman;
     el consumo de planta y las mermas restan. Todo lo valida también el servidor (/api/v/compras, /api/v/inventario, /api/p/turno/consumo). */
const CRX = {rutas: {}, por: null, porTs: 0, difs: null, inv: null, cargando: {}, sel: '', f: {}, dif: null, motivo: '', obs: '', err: '', busy: false, conteo: {}, salida: {articulo: '', cantidad: '', nota: ''}, rep: {}, repNota: '', msg: ''};
const crT = s => esc(s == null ? '' : s);
const crN = v => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : 0; };
const crR2 = n => Math.round(n * 100) / 100;
async function crApi(m, ruta, cuerpo) {
  const r = await fetch(ruta, {method: m, headers: {'content-type': 'application/json', 'x-rol': S.rol}, body: cuerpo ? JSON.stringify(cuerpo) : undefined});
  let j = {}; try { j = await r.json(); } catch (e) { /* sin cuerpo */ }
  if (!r.ok) { const e = new Error(j.error || 'No se pudo completar la operación.'); e.status = r.status; e.extra = j; throw e; }
  return j;
}
function crCargar(k, ruta, destino) {
  if (CRX.cargando[k]) return; CRX.cargando[k] = true; CRX.rutas[destino] = ruta;
  crApi('GET', ruta).then(r => { CRX[destino] = r; if (destino === 'por') CRX.porTs = Date.now(); }).catch(e => { console.error(e); CRX[destino] = {error: e.message}; }).finally(() => { CRX.cargando[k] = false; render(); });
}
const crRefrescar = () => { CRX.por = null; CRX.difs = null; CRX.inv = null; };
/* Vistas vivas: por recibir, diferencias y existencias se repiden solas cuando algo cambió (aquí o en otro puesto), sin parpadeo ni perder lo escrito */
window.Vivo && Vivo.reg(() => ['por', 'difs', 'inv'].forEach(d => { if (CRX[d] && !CRX[d].error && CRX.rutas[d] && !CRX.cargando[d]) Vivo.sil(() => crApi('GET', CRX.rutas[d]), () => CRX[d], n => { CRX[d] = n; if (d === 'por') CRX.porTs = Date.now(); }); }));

/* ---------- Recibir compra ---------- */
const crPedido = () => ((CRX.por && CRX.por.pedidos) || []).find(p => p.nro === CRX.sel) || null;
function crFormDe(p) { const f = {}; p.lineas.forEach(l => { f[l.producto_id] = {recibido: '', pesadas: ['', '', '', '', '']}; }); return f; }
function crCalcLinea(l) {
  const x = CRX.f[l.producto_id] || {recibido: '', pesadas: []}, rec = crN(x.recibido);
  if (!l.papa) return {rec, ok: x.recibido !== ''};
  const pes = x.pesadas.map(crN).filter(v => v > 0), prom = pes.length ? pes.reduce((a, v) => a + v, 0) / pes.length : 0;
  return {rec, pes: pes.length, prom: crR2(prom), kg: crR2(prom * rec), ok: x.recibido !== '' && (rec === 0 || (pes.length === 5 && rec >= 5))};
}
const crDifs = p => p.lineas.map(l => { const c = crCalcLinea(l); return c.ok ? {producto: l.producto, unidad: l.unidad, comprado: l.cantidad, recibido: c.rec, diferencia: crR2(c.rec - l.cantidad)} : null; }).filter(d => d && Math.abs(d.diferencia) > 1e-9);
function crCalcHTML(l) {
  const c = crCalcLinea(l); if (!l.papa) return '';
  if (!c.pes) return '<p class="hint">Pesa 5 sacos y escribe el peso de cada uno. La referencia es 43 kg por saco, pero lo que vale es lo que marca la balanza.</p>';
  return '<p class="cr-calc"><b>' + N2.format(c.prom) + ' kg</b> por saco (promedio de ' + c.pes + ' de 5)' + (c.pes === 5 && c.rec > 0 ? ' · <b>' + N0.format(c.kg) + ' kg</b> en el lote (' + N0.format(c.rec) + ' sacos)' : '') + '</p>';
}
function crLinea(l) {
  const x = CRX.f[l.producto_id] || {recibido: '', pesadas: []};
  if (!l.papa) return `<div class="cr-lin"><p class="cr-lin-t"><b>${crT(l.producto)}</b><span class="muted">Se compró: ${N2.format(l.cantidad)} ${crT(l.unidad)}</span></p>
    <label class="fld">Lo que llegó (${crT(l.unidad)})<input type="text" inputmode="decimal" data-cr="rec" data-id="${crT(l.producto_id)}" value="${crT(x.recibido)}" autocomplete="off"></label></div>`;
  return `<div class="cr-lin"><p class="cr-lin-t"><b>${crT(l.producto)}</b><span class="muted">Se compraron: ${N0.format(l.cantidad)} sacos (≈ ${N0.format(l.cantidad * 43)} kg de referencia)</span></p>
    <label class="fld">Sacos que llegaron<input type="text" inputmode="numeric" data-cr="rec" data-id="${crT(l.producto_id)}" value="${crT(x.recibido)}" autocomplete="off"></label>
    <fieldset class="cr-mu"><legend>Pesa 5 sacos de muestra (kg de cada uno) · obligatorio</legend><div class="cr-mu-g">${[0, 1, 2, 3, 4].map(i => `<input type="text" inputmode="decimal" data-cr="pes" data-id="${crT(l.producto_id)}" data-i="${i}" value="${crT(x.pesadas[i])}" placeholder="Saco ${i + 1}" aria-label="Peso del saco ${i + 1} de muestra" autocomplete="off">`).join('')}</div>
    <div id="cr-calc-${crT(l.producto_id)}">${crCalcHTML(l)}</div></fieldset></div>`;
}
function crAlarma(difs, pedido) {
  const lista = (difs || []).map(d => `<li><b>${crT(d.producto)}</b>: se compraron ${N2.format(d.comprado)} ${crT(d.unidad)} y llegaron ${N2.format(d.recibido)} (${d.diferencia > 0 ? '+' : ''}${N2.format(d.diferencia)})</li>`).join('');
  if (!lista) return '';
  return `<div class="cr-alarma" role="alert"><p class="cr-al-t">${ic('alert')}Lo que llegó NO es lo que se compró</p><ul>${lista}</ul>
    <label class="fld">Escribe el motivo de la diferencia (obligatorio)<textarea data-cr="motivo" rows="2" maxlength="200" placeholder="Ej.: el camión dejó 10 sacos en otro depósito">${crT(CRX.motivo)}</textarea></label>
    <p class="hint">Al confirmar queda registrada la diferencia, con tu nombre y el motivo, y Administración la ve junto a la compra.</p></div>`;
}
function crForm(p) {
  const difs = CRX.dif || crDifs(p);
  return `<div class="cr-form"><p class="cr-h"><b>${crT(p.nro)}</b> · ${crT(p.proveedor)} · factura ${crT(p.factura)}</p>${p.lineas.map(crLinea).join('')}
    <label class="fld">Observaciones (opcional)<input type="text" data-cr="obs" maxlength="200" value="${crT(CRX.obs)}"></label>
    <div id="cr-alarma">${crAlarma(difs, p)}</div>
    ${CRX.err ? `<p class="err" role="alert">${ic('alert')}${crT(CRX.err)}</p>` : ''}
    <div class="btnrow"><button type="button" class="btn pri xl" data-act="crRecibir" ${CRX.busy ? 'disabled' : ''}>${ic('check')}${difs.length ? 'CONFIRMAR LA DIFERENCIA Y RECIBIR' : 'RECIBIR'}</button><button type="button" class="btn" data-act="crVolver">Elegir otra compra</button></div></div>`;
}
function scrCRecibir() {
  if (!window.__EM_HTTP) return card('', emptyState('Este módulo necesita el servidor', 'Funciona en la versión con base de datos (Cloudflare).'));
  if (CRX.por === null) { crCargar('por', '/api/v/compras/por-recibir', 'por'); return card('', emptyState('Cargando…', 'Un momento.')); }
  if (CRX.por.error) return card('Recibir compra', emptyState('No se pudo cargar', crT(CRX.por.error)));
  if (!CRX.sel && !CRX.busy && Date.now() - CRX.porTs > 8000) crCargar('por', '/api/v/compras/por-recibir', 'por');   // trae las compras nuevas sin borrar la lista actual
  if (CRX.pendSel) { const q = CRX.por.pedidos.find(x => x.nro === CRX.pendSel); CRX.pendSel = ''; if (q) Object.assign(CRX, {sel: q.nro, f: crFormDe(q), dif: null, motivo: '', obs: '', err: ''}); }   // viene del botón «Recibir» de Hacer una compra
  const ps = CRX.por.pedidos, p = crPedido();
  const msg = CRX.msg ? `<p class="cr-ok" role="status">${ic('check')}${crT(CRX.msg)}</p>` : '';
  if (p) return `<h1 class="sr">Recibir compra</h1>${msg}${card('Recibir la compra: lo que llegó', crForm(p))}`;
  const grande = ps.length ? `<ul class="cr-ped cr-grande">${ps.map(x => `<li><div><b>${crT(x.nro)}</b> · ${crT(x.proveedor)}<br><span class="muted">${fd(x.fecha)} · ${x.lineas.map(l => crT(l.producto) + ' ' + N0.format(l.cantidad) + ' ' + crT(l.unidad)).join(', ')}</span></div><button type="button" class="btn pri xl" data-act="crElegir" data-nro="${crT(x.nro)}">Recibir</button></li>`).join('')}</ul>` : emptyState('Nada por recibir', 'Cuando Administración haga una compra, aparece aquí como pedida.');
  const hoy = (CRX.por.hoy || []).map(h => { const menos = h.diferencia < 0, mas = h.diferencia > 0; return `<li class="${menos || mas ? 'cr-dif' : ''}"><span>${crT(h.producto)} · ${N0.format(h.cantidad)} ${crT(h.unidad)} · ${crT(h.estado)}</span>${menos || mas ? `<b>${menos ? 'Llegó menos' : 'Llegó más'}</b><em>${crT(h.motivo)}</em>` : ''}</li>`; }).join('');
  return `<h1 class="sr">Recibir compra</h1>${msg}${card('Pedidas por recibir', grande, {sub: 'Pedida → Recibida → En almacén. Toca Recibir cuando llegue: la compra queda lista con lo que de verdad llegó. La papa cruda se recibe por sacos: cuenta los sacos y pesa 5 de muestra.'})}${card('Recibidas hoy', hoy ? `<ul class="cr-hoy">${hoy}</ul>` : '<p class="muted">Hoy todavía no se ha recibido nada.</p>')}`;
}
async function crRecibir() {
  const p = crPedido(); if (!p || CRX.busy) return; CRX.err = '';
  const falla = m => { CRX.err = m; render(); };
  const lineas = [];
  for (const l of p.lineas) {
    const x = CRX.f[l.producto_id], c = crCalcLinea(l);
    if (x.recibido === '') return falla('Escribe lo que llegó de ' + l.producto + ' (si no llegó nada, escribe 0).');
    if (l.papa && c.rec > 0 && c.pes !== 5) return falla('Pesa los 5 sacos de muestra de ' + l.producto + '.');
    lineas.push(l.papa ? {producto_id: l.producto_id, recibido: c.rec, pesadas: c.rec > 0 ? x.pesadas.map(crN) : undefined} : {producto_id: l.producto_id, recibido: c.rec});
  }
  const difs = crDifs(p);
  if (difs.length) { CRX.dif = difs; if (CRX.motivo.trim().length < 3) return falla('Escribe el motivo de la diferencia para poder confirmar.'); }
  CRX.busy = true; render();
  try {
    const r = await crApi('POST', '/api/v/compras/recibir', {nro: p.nro, lineas, obs: CRX.obs, ...(difs.length ? {confirmar_diferencia: true, motivo: CRX.motivo} : {})});
    CRX.msg = 'Compra ' + p.nro + ' recibida' + (r.con_diferencia ? ' con diferencia registrada' : '') + '. ' + r.aviso; Object.assign(CRX, {sel: '', f: {}, dif: null, motivo: '', obs: ''}); crRefrescar();
    if (r.recepciones && r.recepciones[0]) toast(CRX.msg);
  } catch (e) { if (e.extra && e.extra.codigo === 'DIFERENCIA') CRX.dif = e.extra.diferencias; CRX.err = e.message; }
  finally { CRX.busy = false; render(); }
}

/* ---------- Diferencias de compras (Administración, solo lectura) ---------- */
const crHoras = ts => { const h = Math.floor((Date.now() - ts) / 3600e3); return h < 1 ? 'hace menos de una hora' : h < 24 ? 'hace ' + h + ' h' : 'hace ' + Math.floor(h / 24) + ' d'; };
function scrCDif() {
  if (!window.__EM_HTTP) return card('', emptyState('Este módulo necesita el servidor', 'Funciona en la versión con base de datos (Cloudflare).'));
  if (CRX.difs === null) { crCargar('difs', '/api/v/compras/diferencias', 'difs'); return card('', emptyState('Cargando…', 'Un momento.')); }
  if (CRX.difs.error) return card('Diferencias de compras', emptyState('No se pudo cargar', crT(CRX.difs.error)));
  const d = CRX.difs, msg = CRX.msg ? `<p class="cr-ok" role="status">${ic('check')}${crT(CRX.msg)}</p>` : '';
  const aviso = d.sin_ver ? `<div class="cr-aviso" role="status">${ic('alert')}<b>${d.sin_ver} compra${d.sin_ver > 1 ? 's' : ''} con diferencia sin ver.</b></div>` : '';
  const lista = d.diferencias.length ? `<ul class="cr-ped">${d.diferencias.map(x => `<li><div><b>${crT(x.nro)}</b> · ${crT(x.producto)}${x.sin_ver ? ' ' + chip('Sin ver', 'warn') : ''}<br><span class="muted">Se compraron ${N2.format(x.comprado)} ${crT(x.unidad)}, llegaron ${N2.format(x.recibido)} (${x.diferencia > 0 ? '+' : ''}${N2.format(x.diferencia)}). Motivo: «${crT(x.motivo)}» · ${crT(x.rol)} · ${crHoras(x.ts)}</span></div>${x.sin_ver ? `<button type="button" class="btn sm" data-act="crVisto" data-nro="${crT(x.nro)}">Ya la vi</button>` : ''}</li>`).join('')}</ul>` : emptyState('Todo llegó como se compró', 'Aquí aparece lo que llegue distinto a lo comprado, con el motivo que escribió Producción.');
  return `<h1 class="sr">Diferencias de compras</h1>${msg}${aviso}${card('Lo que llegó distinto a lo comprado', lista, {sub: 'Cada compra queda lista apenas Producción la recibe y se paga solo lo que llegó. Esta lista sirve para reclamar al proveedor.'})}`;
}
async function crVisto(nro) {
  if (CRX.busy) return; CRX.busy = true; render();
  try { await crApi('POST', '/api/v/compras/diferencias/visto', {nro}); CRX.msg = ''; crRefrescar(); }
  catch (e) { toast(esc(e.message), 'err'); crRefrescar(); }
  finally { CRX.busy = false; render(); }
}

/* ---------- Inventario general ---------- */
const crPuedeConteo = () => S.rol === 'dueno' || S.rol === 'adm', crPuedeSalida = () => S.rol === 'dueno' || S.rol === 'produccion';
const crEst = a => a.estado === 'REVISAR' ? chip('Revisar: saldo negativo', 'crit') : a.estado === 'SIN_CONTEO' ? chip('Falta el conteo inicial', 'n') : !(a.saldo > 0) ? chip('Sin existencia', 'crit') : a.estado === 'BAJO' ? chip('Bajo el mínimo', 'warn') : !(+a.minimo > 0) ? chip('Sin mínimo definido', 'n') : chip('Suficiente', 'ok');
function crConteoForm(inv) {
  return card('Conteo físico inicial', crPuedeConteo() ? `<p class="hint">Cuenta lo que hay hoy de cada artículo y escríbelo. Se carga una sola vez; desde ahí cada compra suma y cada consumo o merma resta. Lo que no cuentes queda en 0.</p>
    <div class="cr-cg">${inv.articulos.map(a => `<label class="fld">${crT(a.nombre)} (${crT(a.unidad)})<input type="text" inputmode="decimal" data-cr="conteo" data-id="${crT(a.codigo)}" value="${crT(CRX.conteo[a.codigo] ?? '')}" placeholder="0" autocomplete="off"></label>`).join('')}</div>
    ${CRX.err ? `<p class="err" role="alert">${ic('alert')}${crT(CRX.err)}</p>` : ''}<div class="btnrow"><button type="button" class="btn pri" data-act="crConteo" ${CRX.busy ? 'disabled' : ''}>${ic('check', 16)}Cargar el conteo inicial</button></div>` : emptyState('Falta el conteo inicial', 'Administración o el Gerente cargan primero lo que hay en el almacén.'));
}
function crSalidaForm(inv) {
  if (!crPuedeSalida() || !inv.conteo_inicial_hecho) return '';
  const s = CRX.salida;
  return card('Anotar consumo o merma', `<p class="hint">Consumo = lo que se gastó produciendo (el consumo del turno abierto). Merma = lo que se perdió (pide motivo). Los dos restan del inventario general.</p>
    <div class="row2"><label class="fld">Artículo<select data-cr="s-art"><option value="">Elige…</option>${inv.articulos.map(a => `<option value="${crT(a.codigo)}" ${s.articulo === a.codigo ? 'selected' : ''}>${crT(a.nombre)} (${crT(a.unidad)})</option>`).join('')}</select></label>
    <label class="fld">Cantidad<input type="text" inputmode="decimal" data-cr="s-cant" value="${crT(s.cantidad)}" autocomplete="off"></label></div>
    <label class="fld">Motivo o nota (obligatorio en merma)<input type="text" data-cr="s-nota" maxlength="200" value="${crT(s.nota)}"></label>
    ${CRX.err ? `<p class="err" role="alert">${ic('alert')}${crT(CRX.err)}</p>` : ''}
    <div class="btnrow"><button type="button" class="btn pri" data-act="crConsumo" ${CRX.busy ? 'disabled' : ''}>Anotar consumo del turno</button><button type="button" class="btn" data-act="crMerma" ${CRX.busy ? 'disabled' : ''}>Anotar merma</button></div>`);
}
/* «Repartir bolsas sin presentación» (Gerencia y Administración): las bolsas que quedaron bajo el artículo viejo pasan a la bolsa de cada presentación. No cambia el total. */
function crRepartoForm(inv) {
  const sin = inv.articulos.find(a => a.codigo === 'empaque'), dest = inv.articulos.filter(a => /^bolsa-/.test(a.codigo));
  if (!crPuedeConteo() || !inv.conteo_inicial_hecho || !sin || !(sin.saldo > 0) || !dest.length) return '';
  const tot = dest.reduce((a, x) => a + (parseInt(CRX.rep[x.codigo], 10) || 0), 0);
  return card('Repartir bolsas sin presentación', `<p class="hint">Hay <b>${N0.format(sin.saldo)}</b> bolsas que no están asignadas a ninguna presentación. Escribe cuántas van a cada una; el total que repartes sale de «Bolsas sin presentación» y no cambia el total de bolsas.</p>
    <div class="cr-cg">${dest.map(a => `<label class="fld">${crT(a.nombre)} (hay ${N0.format(a.saldo)})<input type="text" inputmode="numeric" data-cr="rep" data-id="${crT(a.codigo)}" value="${crT(CRX.rep[a.codigo] ?? '')}" placeholder="0" autocomplete="off"></label>`).join('')}</div>
    <label class="fld">Nota (por qué o de dónde vienen)<input type="text" data-cr="rep-nota" maxlength="200" value="${crT(CRX.repNota)}"></label>
    <p class="hint" id="cr-rep-tot">Vas a repartir ${N0.format(tot)} de ${N0.format(sin.saldo)} bolsas.</p>
    ${CRX.err ? `<p class="err" role="alert">${ic('alert')}${crT(CRX.err)}</p>` : ''}<div class="btnrow"><button type="button" class="btn pri" data-act="crReparto" ${CRX.busy ? 'disabled' : ''}>Repartir las bolsas</button></div>`);
}
async function crReparto() {
  if (CRX.busy) return; CRX.err = '';
  const reparto = Object.entries(CRX.rep).filter(([, v]) => String(v).trim() !== '').map(([articulo, cantidad]) => ({articulo, cantidad}));
  CRX.busy = true; render();
  try { await crApi('POST', '/api/v/inventario/repartir-bolsas', {reparto, nota: CRX.repNota}); CRX.msg = 'Bolsas repartidas entre las presentaciones.'; CRX.rep = {}; CRX.repNota = ''; crRefrescar(); }
  catch (e) { CRX.err = e.message; }
  finally { CRX.busy = false; render(); }
}
function scrInvGeneral() {
  if (!window.__EM_HTTP) return card('', emptyState('Este módulo necesita el servidor', 'Funciona en la versión con base de datos (Cloudflare).'));
  if (CRX.inv === null) { crCargar('inv', '/api/v/inventario', 'inv'); return card('', emptyState('Cargando…', 'Un momento.')); }
  const inv = CRX.inv; if (inv.error) return card('Inventario general', emptyState('No se pudo cargar', crT(inv.error)));
  const msg = CRX.msg ? `<p class="cr-ok" role="status">${ic('check')}${crT(CRX.msg)}</p>` : '';
  if (!inv.conteo_inicial_hecho) return `<h1 class="sr">Inventario general</h1>${msg}${crConteoForm(inv)}`;
  return `<h1 class="sr">Inventario general</h1>${msg}<div class="tiles">${inv.articulos.slice(0, 4).map(a => stat(crT(a.nombre), N0.format(a.saldo) + ' ' + crT(a.unidad), a.minimo > 0 ? 'Mínimo ' + N0.format(a.minimo) : '', a.estado === 'REVISAR' || a.estado === 'BAJO' ? 'crit' : 'ok')).join('')}</div>
    ${card('Existencias consolidadas', table([{h: 'Artículo', f: a => `<b>${crT(a.nombre)}</b>`}, {h: 'Existencia', r: 1, f: a => `<b>${N2.format(a.saldo)}</b> ${crT(a.unidad)}`}, {h: 'Compras', r: 1, f: a => N2.format(a.compras)}, {h: 'Consumo', r: 1, f: a => N2.format(a.consumos)}, {h: 'Mermas', r: 1, f: a => N2.format(a.mermas)}, {h: 'Estado', f: crEst}], inv.articulos), {sub: 'Saldo = conteo inicial + compras recibidas − consumo de planta − mermas. Cada compra nueva se suma sin separar lotes.'})}
    ${crRepartoForm(inv)}
    ${crSalidaForm(inv)}
    ${card('Últimos movimientos', inv.movimientos.length ? table([{h: 'Cuándo', f: m => new Date(m.ts).toLocaleString('es-VE', {day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'})}, {h: 'Artículo', f: m => crT(m.articulo)}, {h: 'Tipo', f: m => m.tipo === 'ENTRADA' ? chip('Entra', 'ok') : chip('Sale', 'warn')}, {h: 'Cantidad', r: 1, f: m => N2.format(m.cantidad) + ' ' + crT(m.unidad)}, {h: 'Origen', f: m => ({compra: 'Compra', consumo: 'Consumo', merma: 'Merma', conteo_inicial: 'Conteo inicial', reparto: 'Reparto de bolsas'}[m.origen] || crT(m.origen)) + (m.nota ? '<br><span class="muted">' + crT(m.nota) + '</span>' : '')}], inv.movimientos) : emptyState('Sin movimientos', 'Aparecen cuando se recibe una compra o se anota un consumo.'))}`;
}
async function crConteo() {
  if (CRX.busy) return; CRX.err = '';
  const inv = CRX.inv, conteos = inv.articulos.map(a => ({articulo: a.codigo, cantidad: crN(CRX.conteo[a.codigo])}));
  CRX.busy = true; render();
  try { await crApi('POST', '/api/v/inventario/conteo-inicial', {conteos}); CRX.msg = 'Conteo inicial cargado. Desde ahora el inventario se actualiza solo.'; CRX.conteo = {}; crRefrescar(); }
  catch (e) { CRX.err = e.message; }
  finally { CRX.busy = false; render(); }
}
async function crSalida(tipo) {
  if (CRX.busy) return; CRX.err = ''; const s = CRX.salida;
  CRX.busy = true; render();
  try {
    if (tipo === 'merma') await crApi('POST', '/api/v/inventario/merma', {articulo: s.articulo, cantidad: crN(s.cantidad), nota: s.nota});
    else await crApi('POST', '/api/p/turno/consumo', {articulo: s.articulo, cantidad: crN(s.cantidad), nota: s.nota});
    CRX.msg = tipo === 'merma' ? 'Merma anotada.' : 'Consumo anotado.'; CRX.salida = {articulo: '', cantidad: '', nota: ''}; crRefrescar();
  } catch (e) { CRX.err = e.message; }
  finally { CRX.busy = false; render(); }
}

document.addEventListener('input', e => {
  const t = e.target; if (!t || !t.dataset || !t.dataset.cr) return;
  const k = t.dataset.cr, id = t.dataset.id;
  if (k === 'rec' || k === 'pes') {
    const v = t.value.replace(/[^0-9.,]/g, ''); if (v !== t.value) t.value = v;
    const x = CRX.f[id]; if (!x) return; if (k === 'rec') x.recibido = v; else x.pesadas[+t.dataset.i] = v;
    CRX.err = ''; CRX.dif = null;
    const p = crPedido(), l = p && p.lineas.find(y => y.producto_id === id), c = document.getElementById('cr-calc-' + id), a = document.getElementById('cr-alarma');
    if (c && l) c.innerHTML = crCalcHTML(l);
    if (a && p) { const d = crDifs(p); a.innerHTML = crAlarma(d, p); const b = document.querySelector('[data-act="crRecibir"]'); if (b) b.lastChild.textContent = d.length ? 'CONFIRMAR LA DIFERENCIA Y RECIBIR' : 'RECIBIR'; }
  } else if (k === 'motivo') CRX.motivo = t.value;
  else if (k === 'obs') CRX.obs = t.value;
  else if (k === 'conteo') { CRX.conteo[id] = t.value.replace(/[^0-9.,]/g, ''); if (CRX.conteo[id] !== t.value) t.value = CRX.conteo[id]; }
  else if (k === 's-cant') CRX.salida.cantidad = t.value.replace(/[^0-9.,]/g, '');
  else if (k === 's-nota') CRX.salida.nota = t.value;
  else if (k === 'rep') { CRX.rep[id] = t.value.replace(/[^0-9]/g, ''); if (CRX.rep[id] !== t.value) t.value = CRX.rep[id]; const e2 = document.getElementById('cr-rep-tot'), sin = CRX.inv && CRX.inv.articulos.find(a => a.codigo === 'empaque'); if (e2 && sin) e2.textContent = 'Vas a repartir ' + N0.format(Object.values(CRX.rep).reduce((a, v) => a + (parseInt(v, 10) || 0), 0)) + ' de ' + N0.format(sin.saldo) + ' bolsas.'; }
  else if (k === 'rep-nota') CRX.repNota = t.value;
});
document.addEventListener('change', e => { const t = e.target; if (t && t.dataset && t.dataset.cr === 's-art') CRX.salida.articulo = t.value; });

Object.assign(PERM_DEF, {'c-recibir': 'produccion:2', 'c-dif': 'adm:2', 'inv-general': 'adm:1 produccion:1'});
Object.assign(SCREENS, {
  'c-recibir': {mod: 'adm', mods: ['adm', 'prod'], g: 'Compras', t: 'Recibir compra', s: 'Recibir compra', ic: 'clip', r: scrCRecibir},
  'c-dif': {mod: 'adm', g: 'Compras', t: 'Diferencias de compras', s: 'Diferencias', ic: 'alert', r: scrCDif},
  'inv-general': {mod: 'adm', mods: ['adm', 'prod'], g: 'Existencias', t: 'Inventario general', s: 'Inventario general', ic: 'box', r: scrInvGeneral}
});
S.perm = permInit();
Object.assign(ACT_REQ, {crRecibir: ['c-recibir', 2], crVisto: ['c-dif', 2], crConteo: ['inv-general', 1], crConsumo: ['inv-general', 1], crMerma: ['inv-general', 1], crReparto: ['inv-general', 1]});
Object.assign(ACT_LBL, {crRecibir: 'recibir compras', crVisto: 'marcar diferencias como vistas', crConteo: 'cargar el conteo inicial', crConsumo: 'anotar consumos', crMerma: 'anotar mermas', crReparto: 'repartir bolsas sin presentación'});
['crRecibir', 'crVisto', 'crConteo', 'crConsumo', 'crMerma', 'crReparto'].forEach(k => WRITE_ACTS.add(k));
Object.assign(ACT, {
  crElegir: el => { const p = ((CRX.por && CRX.por.pedidos) || []).find(x => x.nro === el.dataset.nro); if (!p) return; Object.assign(CRX, {sel: p.nro, f: crFormDe(p), dif: null, motivo: '', obs: '', err: '', msg: ''}); render(); },
  crVolver: () => { Object.assign(CRX, {sel: '', f: {}, dif: null, motivo: '', obs: '', err: ''}); render(); },
  crRecibir: () => crRecibir(), crVisto: el => crVisto(el.dataset.nro), crConteo: () => crConteo(), crConsumo: () => crSalida('consumo'), crMerma: () => crSalida('merma'), crReparto: () => crReparto()
});
