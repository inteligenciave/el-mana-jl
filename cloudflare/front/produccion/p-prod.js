/* Producción por zonas · pantallas: Pedidos por zona (tablero y salidas), Turno, En proceso, Inventario terminado y Ajustes.
   Solo habla con la API (/api/p/*). Los permisos reales los comprueba el servidor; aquí solo se ordena lo que cada puesto ve. */
const PR = {z: null, tab: null, turno: null, proc: null, inv: null, aj: null, cargando: {}, busy: false, rol: null, sel: {}, sals: null};
const prN = (n, d = 0) => Number(n || 0).toLocaleString('es-VE', {minimumFractionDigits: d, maximumFractionDigits: d});
const prKg = n => prN(n, n % 1 ? 1 : 0) + ' kg';
const prT = s => esc(s == null ? '' : s);
const prMover = () => S.rol === 'dueno' || S.rol === 'jefeprod';
const prTurnoOk = () => S.rol === 'dueno' || S.rol === 'produccion';
async function prApi(m, ruta, cuerpo) {
  const r = await fetch('/api/p' + ruta, {method: m, headers: {'content-type': 'application/json', 'x-rol': S.rol}, body: cuerpo ? JSON.stringify(cuerpo) : undefined});
  let j = {}; try { j = await r.json(); } catch (e) { /* sin cuerpo */ }
  if (!r.ok) { const e = new Error(j.error || 'No se pudo completar la operación.'); e.status = r.status; e.codigo = j.codigo; e.datos = j; throw e; }
  return j;
}
function prCargar(k, ruta, destino) {
  if (PR.cargando[k]) return; PR.cargando[k] = true;
  prApi('GET', ruta).then(r => { PR[destino] = r; }).catch(e => { console.error(e); PR[destino] = {error: e.message}; }).finally(() => { PR.cargando[k] = false; render(); });
}
const prRefrescar = (...ks) => { for (const k of ks) PR[k] = null; render(); };
function prEspera(tit, k, ruta, dest) {
  if (PR.rol !== S.rol) { PR.rol = S.rol; PR.tab = PR.turno = PR.proc = PR.inv = PR.aj = PR.z = PR.sals = PR.por = PR.dif = PR.libres = PR.mot = null; }
  if (!window.__EM_HTTP) return ph('Producción', tit, '', '') + card('', emptyState('Este módulo necesita el servidor', 'Funciona en la versión con base de datos.'));
  if (!PR[dest]) { prCargar(k, ruta, dest); return ph('Producción', tit, '', '') + card('', emptyState('Cargando…', 'Un momento.')); }
  if (PR[dest].error) return ph('Producción', tit, '', '') + card('', emptyState('No se pudo cargar', prT(PR[dest].error)));
  return null;
}
const prSem = z => z.semaforo.color === 'verde' ? '<span class="chip c-ok">Llegó a la meta</span>' : z.semaforo.color === 'ambar' ? '<span class="chip c-warn">Cerca de la meta</span>' : '<span class="chip">No llegó</span>';
const prBarra = (kg, meta) => `<div class="pr-bar" role="img" aria-label="${prN(kg)} de ${prN(meta)} kg"><span class="${kg >= meta ? 'ok' : ''}" style="width:${Math.min(100, meta > 0 ? kg / meta * 100 : 0)}%"></span></div>`;

/* ---------- Pedidos por zona ---------- */
function scrZonas() {
  if (PR.z) return scrZonaDetalle();
  const w = prEspera('Pedidos por zona', 'tab', '/tablero', 'tab'); if (w) return w;
  const T = PR.tab, tj = z => `<article class="pr-card ${z.semaforo.color === 'verde' ? 'ok' : z.semaforo.color === 'ambar' ? 'warn' : ''} ${z.pausada ? 'pausa' : ''}"><button type="button" class="pr-card-b" data-act="prZona" data-z="${prT(z.zona)}" aria-label="Abrir la zona ${prT(z.zona)}">
    <h3>${prT(z.zona)}</h3><p class="pr-big">${prKg(z.kilos)}</p>${prBarra(z.kilos, T.meta_kg)}<p class="pr-sub">${T.meta_kg > 0 ? 'Meta ' + prKg(T.meta_kg) + (z.falta_kg ? ' · faltan ' + prKg(z.falta_kg) : '') : ''}</p>
    <p>${z.pausada ? '<span class="chip c-warn">Pausada: ' + prT(z.pausa_motivo) + '</span>' : prSem(z)}</p>
    <dl class="pr-dl"><div><dt>Pedidos</dt><dd>${prN(z.pedidos)}</dd></div><div><dt>Espera</dt><dd>${z.espera_dias ? prN(z.espera_dias) + ' día(s)' : 'hoy'}</dd></div><div><dt>Por cobrar o despachar</dt><dd>US$ ${prN(z.monto, 2)}</dd></div></dl></button></article>`;
  return `${ph('Producción', 'Pedidos por zona', 'Cada zona espera ' + prKg(T.meta_kg) + ' para salir. Primero va la que tiene más kilos, luego la que espera más y luego la de más dinero.', '')}
    ${T.activas.length ? `<div class="pr-grid">${T.activas.map(tj).join('')}</div>` : card('', emptyState('No hay pedidos por despachar', 'Cuando Ventas registre pedidos, cada zona aparece aquí.'))}
    ${T.pausadas.length ? `<h3 class="pr-h">Zonas pausadas</h3><div class="pr-grid">${T.pausadas.map(tj).join('')}</div>` : ''}`;
}
function scrZonaDetalle() {
  const w = prEspera('Zona ' + PR.z.nombre, 'zd', '/zonas/' + encodeURIComponent(PR.z.nombre), 'zdata'); if (w) return w;
  const Z = PR.zdata, mover = prMover(), sel = PR.sel;
  const filas = Z.pedidos.map(p => `<div class="pr-ped"><label class="pr-ped-h"><input type="checkbox" data-act-change="prSel" data-p="${p.id_pedido}" ${sel[p.id_pedido] ? 'checked' : ''} ${mover && !Z.pausada ? '' : 'disabled'}> <b>${prT(p.nro)}</b> · ${prT(p.cliente)} <span class="muted">· ${prT(p.fecha)}</span>${p.paga_ahora ? ' <span class="chip c-ok">Pagó ahora</span>' : ''}</label>
    <ul class="pr-lin">${p.lineas.map(l => `<li><span>${prT(l.nombre)}</span><span class="muted">${prN(l.pendiente)} bultos · ${prKg(l.pendiente * l.kg_por_bulto)}${l.en_salida ? ' · ' + prN(l.en_salida) + ' ya en una salida' : ''}</span>
      ${mover && !Z.pausada && sel[p.id_pedido] && l.libre > 0 ? `<input class="pr-q" type="text" inputmode="numeric" data-act-change="prQ" data-l="${l.id_linea}" data-p="${p.id_pedido}" data-max="${l.libre}" data-kg="${l.kg_por_bulto}" value="${prN((sel[p.id_pedido].l || {})[l.id_linea] ?? l.libre)}" aria-label="Bultos de ${prT(l.nombre)} que salen"> <span class="muted">bultos que salen</span>` : ''}</li>`).join('')}</ul></div>`).join('');
  const kSel = prKilosSel(Z);
  const salidas = Z.salidas_armando.map(s => `<div class="pr-sal"><span><b>${prT(s.nro)}</b> · ${prKg(s.kilos)} · ${prN(s.pedidos)} pedido(s)</span><span class="btnrow">${mover ? `<button type="button" class="btn pri sm" data-act="prDespachar" data-id="${s.id_salida}" data-k="${s.kilos}">Despachar</button><button type="button" class="btn sm" data-act="prAnularSal" data-id="${s.id_salida}">Anular</button>` : ''}</span></div>`).join('');
  return `${ph('Producción', 'Zona ' + Z.zona, '', '')}<div class="btnrow"><button type="button" class="btn sm" data-act="prVolver">Volver a todas las zonas</button>${mover ? (Z.pausada ? '<button type="button" class="btn sm" data-act="prReanudar">Reanudar la zona</button>' : '<button type="button" class="btn sm" data-act="prPausar">Pausar la zona</button>') : ''}</div>
    ${card('', `<div class="pr-res"><p class="pr-big">${prKg(Z.kilos)}</p><p>${prSem(Z)}${Z.pausada ? ' <span class="chip c-warn">Pausada: ' + prT(Z.pausa_motivo) + '</span>' : ''}</p>${prBarra(Z.kilos, Z.meta_kg)}<p class="pr-sub">Meta ${prKg(Z.meta_kg)}${Z.falta_kg ? ' · faltan ' + prKg(Z.falta_kg) : ''}</p></div>`)}
    ${Z.salidas_armando.length ? card('Salidas armadas', salidas) : ''}
    ${(Z.salidas_despachadas || []).length ? card('Últimas salidas despachadas', `<ul class="pr-lin">${Z.salidas_despachadas.map(s => `<li><span><b>${prT(s.nro)}</b> · ${prKg(s.kilos)}</span><span class="muted">${prT([s.vehiculo, s.chofer].filter(Boolean).join(' · ') || 'Sin vehículo ni chofer')}</span></li>`).join('')}</ul>`) : ''}
    ${card('Pedidos por despachar', Z.pedidos.length ? filas + (mover && !Z.pausada ? `<div class="pr-pie"><span id="pr-ks">Sale en esta salida: <b>${prKg(kSel)}</b>${Z.meta_kg > 0 && kSel > 0 && kSel < Z.meta_kg ? ' · menos de la meta: pedirá el motivo' : ''}</span><button type="button" class="btn pri" data-act="prArmar" ${kSel > 0 ? '' : 'disabled'}>Armar salida con lo marcado</button></div>` : '') : emptyState('Sin pedidos pendientes', 'Esta zona no tiene nada por despachar.'))}`;
}
function prKilosSel(Z) {
  let k = 0; for (const p of Z.pedidos) { const s = PR.sel[p.id_pedido]; if (!s) continue; for (const l of p.lineas) { const n = (s.l || {})[l.id_linea] ?? l.libre; k += Math.min(n, l.libre) * l.kg_por_bulto; } }
  return Math.round(k * 1000) / 1000;
}
function prArmarModal() {
  const Z = PR.zdata, k = prKilosSel(Z), bajo = Z.meta_kg > 0 && k < Z.meta_kg;
  const dividen = Z.pedidos.some(p => PR.sel[p.id_pedido] && p.lineas.some(l => ((PR.sel[p.id_pedido].l || {})[l.id_linea] ?? l.libre) < l.pendiente));
  modal('Armar salida', `<div class="form"><p>Salen <b>${prKg(k)}</b> de la zona ${prT(Z.zona)}.${dividen ? ' Algún pedido sale en dos partes.' : ''}</p>${bajo || dividen ? `<label class="fld">Motivo (obligatorio)<input type="text" id="pr-mot" maxlength="200" placeholder="${bajo ? 'Por qué sale antes de llegar a la meta' : 'Por qué se divide el pedido'}"></label>` : ''}
    <p class="err" id="pr-e" role="alert" hidden></p><div class="btnrow"><button type="button" class="btn pri" data-act="prArmarOk">Armar salida</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`);
  const m = $('#pr-mot'); if (m) m.focus();
}
async function prArmarOk() {
  const Z = PR.zdata, e = $('#pr-e'); e.hidden = true; if (PR.busy) return; PR.busy = true;
  const lineas = []; for (const p of Z.pedidos) { const s = PR.sel[p.id_pedido]; if (!s) continue; for (const l of p.lineas) { const n = Math.min((s.l || {})[l.id_linea] ?? l.libre, l.libre); if (n > 0) lineas.push({id_linea: l.id_linea, bultos: n}); } }
  try { const r = await prApi('POST', '/salidas', {zona: Z.zona, lineas, motivo: ($('#pr-mot') || {}).value || ''}); closeModal(); PR.sel = {}; toast('Salida ' + esc(r.nro) + ' armada (' + prKg(r.kilos) + '). Falta despacharla.'); prRefrescar('zdata', 'tab'); }
  catch (er) { e.textContent = er.message; e.hidden = false; } finally { PR.busy = false; }
}
function prDespacharModal(id, kilos) {
  const Z = PR.zdata, bajo = Z.meta_kg > 0 && kilos < Z.meta_kg;
  flAbrirDespacho(id, kilos, campos => modal('Despachar salida', `<div class="form"><p>Se emiten las notas o facturas de lo que sale (${prKg(kilos)}) y baja el inventario.</p>${campos}
    ${bajo ? '<label class="fld">Motivo para despachar antes de la meta<input type="text" id="pr-mot" maxlength="200"></label>' : ''}<p class="err" id="pr-e" role="alert" hidden></p>
    <div class="btnrow"><button type="button" class="btn pri" data-act="prDespacharOk" data-id="${id}">Despachar</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`));
}
async function prDespacharOk(id) {
  const e = $('#pr-e'); e.hidden = true; if (PR.busy) return; PR.busy = true;
  try { const r = await prApi('POST', '/salidas/' + id + '/despachar', {...flElegidos(), motivo: ($('#pr-mot') || {}).value || ''}); closeModal();
    toast('Despachado. Documentos: ' + r.documentos.map(d => esc(d.nro)).join(', ') + '.' + (r.vehiculo || r.chofer ? ' Sale con ' + [r.vehiculo, r.chofer].filter(Boolean).map(esc).join(', chofer ') + '.' : '') + ((r.avisos || []).length ? ' Aviso: ' + r.avisos.map(esc).join(' ') : '') + (r.cobros.some(c => !c.ok) ? ' Un cobro no se pudo registrar: queda a crédito.' : '')); prRefrescar('zdata', 'tab', 'inv', 'sals'); }
  catch (er) { e.textContent = er.message; e.hidden = false; } finally { PR.busy = false; }
}
function prPausaModal() {
  modal('Pausar la zona', `<div class="form"><p>Mientras está pausada no se le arman salidas ni compite en el orden.</p><label class="fld">Motivo (obligatorio)<input type="text" id="pr-mot" maxlength="200"></label><p class="err" id="pr-e" role="alert" hidden></p>
    <div class="btnrow"><button type="button" class="btn pri" data-act="prPausarOk">Pausar</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`); $('#pr-mot').focus();
}
async function prPausarOk() {
  const e = $('#pr-e'); e.hidden = true; try { await prApi('POST', '/zonas/pausar', {zona: PR.z.nombre, motivo: $('#pr-mot').value}); closeModal(); toast('Zona pausada.'); prRefrescar('zdata', 'tab'); } catch (er) { e.textContent = er.message; e.hidden = false; }
}

/* ---------- Turno ---------- */
function scrTurno() {
  const w = prEspera('Turno', 'turno', '/turno', 'turno'); if (w) return w;
  const D = PR.turno, t = D.turno, ok = prTurnoOk();
  if (t && !PR.por) prCargar('por', '/turno/por-resolver', 'por');
  if (!t) return `${ph('Producción', 'Turno', 'Aquí se anotan los kilos de cada etapa y los bultos empacados.', '')}${card('', `<p>No hay un turno abierto.</p>${ok ? '<button type="button" class="btn pri" data-act="prAbrirTurno">Abrir turno de hoy</button>' : '<p class="muted">Lo abre Producción o el Dueño.</p>'}`)}${prUltimos(D)}`;
  const etapas = t.etapas.map(e => `<article class="pr-card"><h3>${prT(e.nombre)}</h3><p class="pr-big">${prKg(e.saldo_kg)}</p><p class="pr-sub">Entró ${prKg(e.entra_kg)} · salió ${prKg(e.sale_kg)}</p>${ok ? `<div class="pr-mov"><input type="text" inputmode="decimal" id="pr-k-${e.k}" placeholder="Kilos" aria-label="Kilos de ${prT(e.nombre)}"><button type="button" class="btn sm" data-act="prMov" data-e="${e.k}" data-s="ENTRA">Entra</button><button type="button" class="btn sm" data-act="prMov" data-e="${e.k}" data-s="SALE">Sale</button></div>` : ''}</article>`).join('');
  const prods = D.productos.map(p => `<option value="${p.id_producto}">${prT(p.nombre)}</option>`).join('');
  return `${ph('Producción', 'Turno del ' + prT(t.fecha), 'Anota lo que entra y sale de cada etapa y lo que se empaca. Al cerrar, los bultos suman al inventario.', '')}
    ${prHoy().length ? card('Faltan kilos por explicar', prPorHTML()) : ''}
    <div class="pr-grid">${etapas}</div>
    ${ok ? prRecepcionCard() : ''}
    ${card('Empacado', `${ok ? `<div class="pr-mov"><select id="pr-prod" aria-label="Producto">${prods}</select><input type="text" inputmode="numeric" id="pr-b" placeholder="Bultos" aria-label="Bultos empacados"><button type="button" class="btn sm" data-act="prEmp">Anotar</button></div>` : ''}
      ${t.bultos_por_producto.length ? `<ul class="pr-lin">${t.empaque.map(x => `<li><span>${prT(x.nombre)}</span><span class="muted">${prN(x.bultos)} bultos</span></li>`).join('')}</ul>` : '<p class="muted">Todavía no se anotó nada empacado.</p>'}`)}
    ${ok ? `<div class="btnrow"><button type="button" class="btn pri" data-act="prCerrarTurno">Cerrar turno</button>${prHoy().length ? '<span class="muted">Primero explica los kilos que faltan.</span>' : ''}</div>` : ''}`;
}
const prUltimos = D => D.ultimos.length ? card('Últimos turnos cerrados', `<ul class="pr-lin">${D.ultimos.map(u => `<li><span>${prT(u.fecha)}</span><span class="muted">${prT(u.cerrado_rol || '')}</span></li>`).join('')}</ul>`) : '';
async function prAccion(fn, ok) { if (PR.busy) return; PR.busy = true; try { await fn(); if (ok) toast(ok); } catch (er) { toast(esc(er.message), 'err'); } finally { PR.busy = false; } }
function prCerrarModal() {
  const t = PR.turno.turno, ps = new Map(PR.turno.productos.map(p => [p.id_producto, p.nombre]));
  modal('Cerrar turno', `<div class="form"><p>Escribe cuántos kilos quedaron realmente en cada etapa y cuántos bultos se empacaron. Si lo dejas igual a lo anotado, no cambia.</p>
    ${t.etapas.map(e => `<label class="fld">${prT(e.nombre)} (anotado ${prKg(e.saldo_kg)})<input type="text" inputmode="decimal" class="pr-c-e" data-e="${e.k}" value="${prN(e.saldo_kg, 0)}"></label>`).join('')}
    ${t.bultos_por_producto.map(b => `<label class="fld">${prT(ps.get(b.id_producto) || 'Producto')} · bultos empacados<input type="text" inputmode="numeric" class="pr-c-b" data-p="${b.id_producto}" value="${b.bultos}"></label>`).join('')}
    <p class="err" id="pr-e" role="alert" hidden></p><div class="btnrow"><button type="button" class="btn pri" data-act="prCerrarOk">Cerrar turno</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`);
}
async function prCerrarOk() {
  const e = $('#pr-e'); e.hidden = true; if (PR.busy) return; PR.busy = true; const etapas = {}, bultos = {};
  document.querySelectorAll('.pr-c-e').forEach(i => { etapas[i.dataset.e] = i.value.replace(/\./g, '').replace(',', '.'); }); document.querySelectorAll('.pr-c-b').forEach(i => { bultos[i.dataset.p] = i.value; });
  if (!Object.values(etapas).some(v => Number(v) > 0)) { e.textContent = 'Escribe los kilos de cada etapa para cerrar el turno.'; e.hidden = false; PR.busy = false; return; }
  try { await prCerrarEnviar({etapas, bultos}); }
  catch (er) { if (er.codigo === 'FALTAN_MOTIVOS' && er.datos && er.datos.faltan) { PR.busy = false; prCzIniciar({etapas, bultos}, er.datos); } else { e.textContent = er.message; e.hidden = false; } } finally { PR.busy = false; }
}

/* ---------- En proceso ---------- */
function scrProceso() {
  const w = prEspera('En proceso', 'proc', '/proceso', 'proc'); if (w) return w;
  return `${ph('Producción', 'En proceso', 'Kilos que hay ahora en cada etapa, sumando todos los turnos.', '')}<div class="pr-grid">${PR.proc.etapas.map(e => `<article class="pr-card"><h3>${prT(e.nombre)}</h3><p class="pr-big">${prKg(e.saldo_kg)}</p><p class="pr-sub">Entró ${prKg(e.entra_kg)} · salió ${prKg(e.sale_kg)}</p></article>`).join('')}</div>`;
}

/* ---------- Inventario del producto terminado ---------- */
function scrInventario() {
  const w = prEspera('Inventario terminado', 'inv', '/inventario', 'inv'); if (w) return w;
  const I = PR.inv, dueno = S.rol === 'dueno';
  return `${ph('Producción', 'Inventario del producto terminado', 'Un solo inventario, en bultos: lo que cierra Producción lo ve Ventas, y lo apartado ya no se puede vender.', '')}
    ${dueno && !I.conteo_inicial_hecho ? `<div class="btnrow"><button type="button" class="btn pri" data-act="prConteo">Cargar el conteo inicial</button></div>` : ''}
    ${card('', table([{h: 'Producto', f: p => `<b>${prT(p.nombre)}</b>`}, {h: 'En bodega', r: 1, f: p => prN(p.existencias) + ' bultos'}, {h: 'Apartado por pedidos', r: 1, f: p => prN(p.apartado)}, {h: 'Disponible para vender', r: 1, f: p => p.disponible > 0 ? '<b>' + prN(p.disponible) + '</b>' : '<span class="chip c-warn">Sin inventario</span>'}, {h: 'Kilos en bodega', r: 1, f: p => p.kilos == null ? '<span class="muted">falta kg por bulto</span>' : prKg(p.kilos)}], I.productos))}
    ${I.movimientos.length ? card('Últimas entradas', `<ul class="pr-lin">${I.movimientos.map(m => `<li><span>${prT(m.nombre)} · ${m.tipo === 'ENTRADA_CIERRE_TURNO' ? 'cierre de turno' : m.tipo === 'CONTEO_INICIAL' ? 'conteo inicial' : 'entrada del Dueño'}${m.nota && m.tipo === 'ENTRADA' ? ' · ' + prT(m.nota) : ''}</span><span class="muted">${prT(m.fecha)} · ${m.cantidad > 0 ? '+' : ''}${prN(m.cantidad)} bultos</span></li>`).join('')}</ul>`) : ''}`;
}
function prConteoModal() {
  modal('Conteo inicial en bultos', `<div class="form"><p>Se carga una sola vez. Escribe los bultos que hay hoy de cada producto (0 si no hay).</p>${PR.inv.productos.map(p => `<label class="fld">${prT(p.nombre)}<input type="text" inputmode="numeric" class="pr-ci" data-p="${p.id_producto}" value="${p.existencias}"></label>`).join('')}
    <p class="err" id="pr-e" role="alert" hidden></p><div class="btnrow"><button type="button" class="btn pri" data-act="prConteoOk">Guardar el conteo</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`);
}
async function prConteoOk() {
  const e = $('#pr-e'); e.hidden = true; if (PR.busy) return; PR.busy = true; const conteos = [...document.querySelectorAll('.pr-ci')].map(i => ({id_producto: +i.dataset.p, bultos: i.value}));
  try { await prApi('POST', '/inventario/conteo-inicial', {conteos}); closeModal(); toast('Conteo inicial guardado.'); prRefrescar('inv'); } catch (er) { e.textContent = er.message; e.hidden = false; } finally { PR.busy = false; }
}

/* ---------- Ajustes (solo el Dueño) ---------- */
function scrAjustes() {
  const w = prEspera('Ajustes de zonas', 'aj', '/ajustes', 'aj'); if (w) return w;
  const A = PR.aj, v = n => n == null ? '' : String(n).replace('.', ',');
  return `${ph('Producción', 'Ajustes de zonas', 'Solo el Dueño cambia estas cifras.', '')}${card('', `<div class="form pr-form"><label class="fld">Meta por zona (kilos)<input type="text" inputmode="decimal" id="pr-a-m" value="${v(A.meta_kg)}"></label>
    <label class="fld">Corte del semáforo ámbar (kilos, opcional)<input type="text" inputmode="decimal" id="pr-a-c" value="${v(A.corte_ambar_kg)}" placeholder="Vacío: sin ámbar"></label>
    <label class="fld">Diferencia permitida al cerrar el turno (kilos, opcional)<input type="text" inputmode="decimal" id="pr-a-t" value="${v(A.tolerancia_kg)}" placeholder="Vacío: sin marcar diferencias"></label>
    <p class="err" id="pr-e" role="alert" hidden></p><div class="btnrow"><button type="button" class="btn pri" data-act="prAjGuardar">Guardar</button></div></div>`)}`;
}
async function prAjGuardar() {
  const e = $('#pr-e'); e.hidden = true; if (PR.busy) return; PR.busy = true; const g = id => $(id).value.trim().replace(',', '.');
  try { PR.aj = await prApi('POST', '/ajustes', {meta_kg: g('#pr-a-m'), corte_ambar_kg: g('#pr-a-c'), tolerancia_kg: g('#pr-a-t')}); toast('Ajustes guardados.'); PR.tab = null; render(); }
  catch (er) { e.textContent = er.message; e.hidden = false; } finally { PR.busy = false; }
}

/* ---------- Pantallas viejas de Empaque y Despachos: ahora usan el inventario único ---------- */
function invUnicoCard() {
  if (!window.__EM_HTTP) return '';
  if (PR.rol !== S.rol) { PR.rol = S.rol; PR.tab = PR.turno = PR.proc = PR.inv = PR.aj = PR.z = PR.sals = null; }
  if (!PR.inv) { prCargar('inv', '/inventario', 'inv'); return card('Existencias de producto terminado', '<p class="hint">Cargando…</p>'); }
  if (PR.inv.error) return card('Existencias de producto terminado', '<p class="hint">' + prT(PR.inv.error) + '</p>');
  return card('Existencias de producto terminado', table([{h: 'Producto', f: p => '<b>' + prT(p.nombre) + '</b> <span class="muted">' + prT(p.gramaje || '') + '</span>'}, {h: 'En bodega', r: 1, f: p => prN(p.existencias) + ' bultos'}, {h: 'Apartado por pedidos', r: 1, f: p => prN(p.apartado)}, {h: 'Disponible para vender', r: 1, f: p => '<b>' + prN(p.disponible) + '</b>'}], PR.inv.productos, {empty: 'Todavía no hay productos.'}), {sub: 'Un solo inventario: el mismo que ve Ventas y el portal'});
}
function empaqueUnicoCard() {
  return card('Anotar lo empacado', '<p>Lo empacado se anota en el turno de Producción y, al cerrarlo, se suma al inventario único.</p>' + (prTurnoOk() ? '<div class="btnrow"><a class="btn pri" href="#pr-turno">Ir al turno</a></div>' : ''));
}
function despachoUnicoCard() {
  return prCargaCard() + card('Despachar un pedido', '<p>Los despachos se arman por zona desde los pedidos de Ventas. Al despachar se emite la nota o factura y baja el inventario único.</p>' + (prMover() ? '<div class="btnrow"><a class="btn pri" href="#pr-zonas">Ir a pedidos por zona</a></div>' : ''));
}

Object.assign(window, {invUnicoCard, empaqueUnicoCard, despachoUnicoCard});   // las usan las pantallas viejas de Empaque y Despachos

/* ---------- Registro en la app ---------- */
Object.assign(PERM_DEF, {'pr-zonas': 'jefeprod:2 produccion:1', 'pr-turno': 'produccion:2 jefeprod:1', 'pr-proc': 'produccion:1 jefeprod:1 empaque:1 recep:1', 'pr-inv': 'produccion:1 jefeprod:1 empaque:1', 'pr-invv': 'ventas:1 adm:1 cobranza:1', 'pr-aj': ''});
Object.assign(SCREENS, {
  'pr-zonas': {mod: 'prod', g: 'Zonas', t: 'Pedidos por zona', s: 'Pedidos por zona', ic: 'truck', r: scrZonas},
  'pr-turno': {mod: 'prod', g: 'Turno', t: 'Turno de producción', s: 'Turno', ic: 'flame', r: scrTurno},
  'pr-proc': {mod: 'prod', g: 'Existencias', t: 'En proceso', s: 'En proceso', ic: 'flame', r: scrProceso},
  'pr-inv': {mod: 'prod', g: 'Existencias', t: 'Inventario terminado', s: 'Inventario terminado', ic: 'tag', r: scrInventario},
  'pr-invv': {mod: 'adm', g: 'Inventario', t: 'Inventario terminado', s: 'Inventario terminado', ic: 'tag', r: scrInventario},
  'pr-aj': {mod: 'prod', g: 'Zonas', t: 'Ajustes de zonas', s: 'Ajustes', ic: 'settings', r: scrAjustes}
});
S.perm = permInit();
const PRACT_REQ = {prArmarOk: ['pr-zonas', 2], prDespacharOk: ['pr-zonas', 2], prAnularSal: ['pr-zonas', 2], prPausarOk: ['pr-zonas', 2], prReanudar: ['pr-zonas', 2], prAbrirTurno: ['pr-turno', 2], prMov: ['pr-turno', 2], prEmp: ['pr-turno', 2], prCerrarOk: ['pr-turno', 2], prConteoOk: ['pr-inv', 3], prAjGuardar: ['pr-aj', 3]};
Object.assign(ACT_REQ, PRACT_REQ); Object.assign(ACT_LBL, {prArmarOk: 'armar salidas', prDespacharOk: 'despachar', prAnularSal: 'anular salidas', prPausarOk: 'pausar zonas', prReanudar: 'reanudar zonas', prAbrirTurno: 'abrir el turno', prMov: 'anotar kilos del turno', prEmp: 'anotar lo empacado', prCerrarOk: 'cerrar el turno', prConteoOk: 'cargar el conteo inicial', prAjGuardar: 'guardar los ajustes'});
Object.keys(PRACT_REQ).forEach(k => WRITE_ACTS.add(k));
Object.assign(ACT, {
  prZona: el => { PR.z = {nombre: el.dataset.z}; PR.zdata = null; PR.sel = {}; render(); },
  prVolver: () => { PR.z = null; PR.zdata = null; PR.sel = {}; PR.tab = null; render(); },
  prSel: el => { const id = el.dataset.p; if (el.checked) PR.sel[id] = {l: {}}; else delete PR.sel[id]; render(); },
  prQ: el => { const max = +el.dataset.max, id = el.dataset.p; let n = parseInt(String(el.value).replace(/\D/g, ''), 10); if (!(n >= 0)) n = max; n = Math.min(n, max); (PR.sel[id].l ||= {})[el.dataset.l] = n; render(); },
  prArmar: () => prArmarModal(), prArmarOk: () => prArmarOk(),
  prDespachar: el => prDespacharModal(+el.dataset.id, +el.dataset.k), prDespacharOk: el => prDespacharOk(+el.dataset.id),
  prAnularSal: el => prAccion(async () => { await prApi('POST', '/salidas/' + el.dataset.id + '/anular'); prRefrescar('zdata', 'tab'); }, 'Salida anulada: los pedidos quedan libres.'),
  prPausar: () => prPausaModal(), prPausarOk: () => prPausarOk(),
  prReanudar: () => prAccion(async () => { await prApi('POST', '/zonas/reanudar', {zona: PR.z.nombre}); prRefrescar('zdata', 'tab'); }, 'Zona reanudada.'),
  prAbrirTurno: () => prAccion(async () => { await prApi('POST', '/turno/abrir', {}); prRefrescar('turno'); }, 'Turno abierto.'),
  prMov: el => { if (!PR.busy) prMovimiento(el.dataset.e, el.dataset.s, $('#pr-k-' + el.dataset.e).value); },
  prEmp: () => { if (!PR.busy) prEmpaque(+$('#pr-prod').value, $('#pr-b').value); },
  prCerrarTurno: () => prHoy().length ? prCerrarBloqueo() : prCerrarModal(), prCerrarOk: () => prCerrarOk(),
  prConteo: () => prConteoModal(), prConteoOk: () => prConteoOk(), prAjGuardar: () => prAjGuardar()
});
