/* Producción por zonas · pantallas: Pedidos por zona (tablero y salidas), Turno, En proceso, Inventario terminado y Ajustes.
   Solo habla con la API (/api/p/*). Los permisos reales los comprueba el servidor; aquí solo se ordena lo que cada puesto ve. */
const PR = {rutas: {}, z: null, tab: null, turno: null, proc: null, inv: null, aj: null, cargando: {}, busy: false, rol: null, sel: {}, sals: null};
const prN = (n, d = 0) => Number(n || 0).toLocaleString('es-VE', {minimumFractionDigits: d, maximumFractionDigits: d});
const prKg = n => prN(n, n % 1 ? 1 : 0) + ' kg';
const prT = s => esc(s == null ? '' : s);
/* Fecha para personas: 2026-11-16 se ve 16/11/2026 y 2026-11 se ve 11/2026 */
const prFe = s => { const m = String(s == null ? '' : s).match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/); return m ? (m[3] ? m[3] + '/' : '') + m[2] + '/' + m[1] : String(s == null ? '' : s); };
const prMover = () => S.rol === 'dueno' || S.rol === 'empaque'; /* Logística arma y despacha */
const prEmpacaOk = () => S.rol === 'dueno' || S.rol === 'empaque'; /* Logística anota lo empacado */
const prTurnoOk = () => S.rol === 'dueno' || S.rol === 'produccion';
async function prApi(m, ruta, cuerpo) {
  const r = await fetch('/api/p' + ruta, {method: m, headers: {'content-type': 'application/json', 'x-rol': S.rol}, body: cuerpo ? JSON.stringify(cuerpo) : undefined});
  let j = {}; try { j = await r.json(); } catch (e) { /* sin cuerpo */ }
  if (!r.ok) { const e = new Error(j.error || 'No se pudo completar la operación.'); e.status = r.status; e.codigo = j.codigo; e.datos = j; throw e; }
  return j;
}
function prCargar(k, ruta, destino) {
  if (PR.cargando[k]) return; PR.cargando[k] = true; PR.rutas[destino] = ruta;
  prApi('GET', ruta).then(r => { PR[destino] = r; }).catch(e => { console.error(e); PR[destino] = {error: e.message}; }).finally(() => { PR.cargando[k] = false; render(); });
}
const prRefrescar = (...ks) => { for (const k of ks) PR[k] = null; render(); };
/* Vistas vivas: lo que ya se cargó del servidor (condiciones para producir, turno, resumen, proceso, inventario) se repide en silencio cuando algo cambió
   aquí o en otro puesto, y solo se redibuja si la respuesta es distinta. */
const PR_VIVAS = ['arr', 'panArr', 'res', 'turno', 'proc', 'por', 'inv'];   /* p-tablero-desp.js suma 'lin' y 'ldata' */
window.Vivo && Vivo.reg(() => PR_VIVAS.forEach(d => { if (PR[d] && !PR[d].error && PR.rutas[d] && !PR.cargando[d]) Vivo.sil(() => prApi('GET', PR.rutas[d]), () => PR[d], n => { PR[d] = n; }); }));
function prEspera(tit, k, ruta, dest) {
  if (PR.rol !== S.rol) { PR.rol = S.rol; PR.tab = PR.turno = PR.proc = PR.inv = PR.aj = PR.z = PR.sals = PR.por = PR.dif = PR.libres = PR.mot = PR.personal = null; }
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
    <h3>${prT(z.zona)}</h3><p class="pr-big">${prKg(z.kilos)}</p><p class="pr-sub">${z.linea ? 'Línea ' + prT(z.linea.linea) + ' · aporta ' + prN(z.linea.aporte_pct, z.linea.aporte_pct % 1 ? 1 : 0) + ' %' : 'Sin línea'}</p>
    <p>${z.pausada ? '<span class="chip c-warn">Pausada: ' + prT(z.pausa_motivo) + '</span>' : ''}</p>
    <dl class="pr-dl"><div><dt>Pedidos</dt><dd>${prN(z.pedidos)}</dd></div><div><dt>Espera</dt><dd>${z.espera_dias ? prN(z.espera_dias) + ' día(s)' : 'hoy'}</dd></div>${S.rol === 'empaque' ? '' : `<div><dt>Por cobrar o despachar</dt><dd>$ ${prN(z.monto, 2)}</dd></div>`}</dl></button></article>`;
  return `${ph('Producción', 'Pedidos por zona', 'Cada zona sale en el camión de su línea. Primero va la que tiene más kilos, luego la que espera más' + (S.rol === 'empaque' ? '.' : ' y luego la de más dinero.'), '')}
    ${T.activas.length ? `<div class="pr-grid">${T.activas.map(tj).join('')}</div>` : card('', emptyState('No hay pedidos por despachar', 'Cuando Ventas registre pedidos, cada zona aparece aquí.'))}
    ${T.pausadas.length ? `<h3 class="pr-h">Zonas pausadas</h3><div class="pr-grid">${T.pausadas.map(tj).join('')}</div>` : ''}`;
}
function scrZonaDetalle() {
  const w = prEspera('Zona ' + PR.z.nombre, 'zd', '/zonas/' + encodeURIComponent(PR.z.nombre), 'zdata'); if (w) return w;
  const Z = PR.zdata, mover = prMover(), sel = PR.sel;
  const filas = Z.pedidos.map(p => `<div class="pr-ped"><label class="pr-ped-h"><input type="checkbox" data-act-change="prSel" data-p="${p.id_pedido}" ${sel[p.id_pedido] ? 'checked' : ''} ${mover2 ? '' : 'disabled'}> <b>${prT(p.nro)}</b> · ${prT(p.cliente)} <span class="muted">· ${prT(p.fecha)}</span>${p.paga_ahora ? ' <span class="chip c-ok">Pagó ahora</span>' : ''}</label>
    <ul class="pr-lin">${p.lineas.map(l => `<li><span>${prT(l.nombre)}</span><span class="muted">${prN(l.pendiente)} bultos · ${prKg(l.pendiente * l.kg_por_bulto)}${l.en_salida ? ' · ' + prN(l.en_salida) + ' ya en una salida' : ''}</span>
      ${mover2 && sel[p.id_pedido] && l.libre > 0 ? `<input class="pr-q" type="text" inputmode="numeric" data-act-change="prQ" data-l="${l.id_linea}" data-p="${p.id_pedido}" data-max="${l.libre}" data-kg="${l.kg_por_bulto}" value="${prN((sel[p.id_pedido].l || {})[l.id_linea] ?? l.libre)}" aria-label="Bultos de ${prT(l.nombre)} que salen"> <span class="muted">bultos que salen</span>` : ''}</li>`).join('')}</ul></div>`).join('');
  const kSel = prKilosSel(Z), enLinea = !!Z.linea, mover2 = mover && !Z.pausada && !enLinea;
  const salidas = Z.salidas_armando.map(s => `<div class="pr-sal"><span><b>${prT(s.nro)}</b> · ${prKg(s.kilos)} · ${prN(s.pedidos)} pedido(s)</span><span class="btnrow">${mover ? `<button type="button" class="btn pri sm" data-act="prDespachar" data-id="${s.id_salida}" data-k="${s.kilos}" data-nm="${s.ocupacion_pct != null ? 1 : 0}">Despachar</button><button type="button" class="btn sm" data-act="prAnularSal" data-id="${s.id_salida}">Anular</button>` : ''}</span></div>`).join('');
  return `${ph('Producción', 'Zona ' + Z.zona, '', '')}<div class="btnrow"><button type="button" class="btn sm" data-act="prVolver">Volver a todas las zonas</button>${enLinea ? `<button type="button" class="btn sm" data-act="lnIrLinea" data-id="${Z.linea.id_linea}">Ir a la línea ${prT(Z.linea.nombre)}</button>` : ''}${mover ? (Z.pausada ? '<button type="button" class="btn sm" data-act="prReanudar">Reanudar la zona</button>' : '<button type="button" class="btn sm" data-act="prPausar">Pausar la zona</button>') : ''}</div>
    ${card('', `<div class="pr-res"><p class="pr-big">${prKg(Z.kilos)}</p><p>${Z.pausada ? '<span class="chip c-warn">Pausada: ' + prT(Z.pausa_motivo) + '</span>' : enLinea ? '<span class="chip c-ok">Línea ' + prT(Z.linea.nombre) + ' · aporta ' + prN(Z.linea.aporte_pct, Z.linea.aporte_pct % 1 ? 1 : 0) + ' %</span>' : '<span class="chip c-n">Sin línea</span>'}</p>${enLinea ? '<p class="pr-sub">Esta zona se arma desde su línea, mezclando zonas en un mismo camión.</p>' : ''}</div>`)}
    ${Z.salidas_armando.length ? card('Salidas armadas', salidas) : ''}
    ${(Z.salidas_despachadas || []).length ? card('Últimas salidas despachadas', `<ul class="pr-lin">${Z.salidas_despachadas.map(s => `<li><span><b>${prT(s.nro)}</b> · ${prKg(s.kilos)}</span><span class="muted">${prT([s.vehiculo, s.chofer].filter(Boolean).join(' · ') || 'Sin vehículo ni chofer')}</span></li>`).join('')}</ul>`) : ''}
    ${card('Pedidos por despachar', Z.pedidos.length ? filas + (mover2 ? `<div class="pr-pie"><span id="pr-ks">Sale en esta salida: <b>${prKg(kSel)}</b></span><button type="button" class="btn pri" data-act="prArmar" ${kSel > 0 ? '' : 'disabled'}>Armar salida con lo marcado</button></div>` : '') : emptyState('Sin pedidos pendientes', 'Esta zona no tiene nada por despachar.'))}`;
}
function prKilosSel(Z) {
  let k = 0; for (const p of Z.pedidos) { const s = PR.sel[p.id_pedido]; if (!s) continue; for (const l of p.lineas) { const n = (s.l || {})[l.id_linea] ?? l.libre; k += Math.min(n, l.libre) * l.kg_por_bulto; } }
  return Math.round(k * 1000) / 1000;
}
function prArmarModal() {
  const Z = PR.zdata, k = prKilosSel(Z), bajo = false;
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
function prDespacharModal(id, kilos, nuevo) {
  const Z = PR.zdata, bajo = !nuevo && !!Z && Z.meta_kg > 0 && kilos < Z.meta_kg;   /* salida nueva (por línea): salir con menos del 100 % es libre */
  flAbrirDespacho(id, kilos, campos => modal('Despachar salida', `<div class="form"><p>Se emiten las notas o facturas de lo que sale (${prKg(kilos)}) y baja el inventario.</p>${campos}
    ${bajo ? '<label class="fld">Motivo para despachar antes de la meta<input type="text" id="pr-mot" maxlength="200"></label>' : ''}<p class="err" id="pr-e" role="alert" hidden></p>
    <div class="btnrow"><button type="button" class="btn pri" data-act="prDespacharOk" data-id="${id}">Despachar</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`));
}
async function prDespacharOk(id) {
  const e = $('#pr-e'); e.hidden = true; if (PR.busy) return; PR.busy = true;
  try { const r = await prApi('POST', '/salidas/' + id + '/despachar', {...flElegidos(), motivo: ($('#pr-mot') || {}).value || ''}); closeModal();
    toast('Despachado. Documentos: ' + r.documentos.map(d => esc(d.nro)).join(', ') + '.' + (r.vehiculo || r.chofer ? ' Sale con ' + [r.vehiculo, r.chofer].filter(Boolean).map(esc).join(', chofer ') + '.' : '') + ((r.avisos || []).length ? ' Aviso: ' + r.avisos.map(esc).join(' ') : '') + (r.cobros.some(c => !c.ok) ? ' Un cobro no se pudo registrar: queda a crédito.' : '')); prRefrescar('zdata', 'tab', 'inv', 'sals', 'lin', 'ldata'); }
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
/* Fritura: quién la ejecutó en este turno (cada persona marcada cobra el Bono Fritura de su jornada) */
function prFrituraHTML(t, ok) {
  const marc = t.personas_fritura || [], ya = new Set(marc.map(x => x.id));
  if (ok && !PR.personal && !PR.cargando.personal) prCargar('personal', '/turno/personal', 'personal');
  const lista = PR.personal && PR.personal.personas ? PR.personal.personas.filter(x => !ya.has(x.id)) : [];
  const chips = marc.length ? `<ul class="pr-lin">${marc.map(x => `<li><span>${prT(x.nombre)}</span>${ok ? `<button type="button" class="btn sm" data-act="prFriQuitar" data-id="${prT(x.id)}" aria-label="Quitar a ${prT(x.nombre)} de la fritura">Quitar</button>` : ''}</li>`).join('')}</ul>` : '<p class="muted">Nadie marcado todavía.</p>';
  return `<div class="pr-fri"><h4>Quién fríe en este turno</h4>${chips}${ok ? `<div class="pr-mov"><select id="pr-fri-p" aria-label="Persona que fríe"><option value="">Elige a la persona</option>${[['Marcaron entrada hoy', lista.filter(x => x.con_entrada)], ['Fritura', lista.filter(x => !x.con_entrada && x.area === 'Fritura')], ['Otros operadores de planta', lista.filter(x => !x.con_entrada && x.area !== 'Fritura')]].filter(g => g[1].length).map(g => `<optgroup label="${g[0]}">${g[1].map(x => `<option value="${prT(x.id)}">${prT(x.nombre)}</option>`).join('')}</optgroup>`).join('')}</select><button type="button" class="btn sm" data-act="prFriMarcar">Marcar</button></div>` : ''}</div>`;
}
const prUltimos = D => D.ultimos.length ? card('Últimos turnos cerrados', `<ul class="pr-lin">${D.ultimos.map(u => `<li><span>${prT(prFe(u.fecha))}</span><span class="muted">${prT(u.cerrado_rol || '')}</span></li>`).join('')}</ul>`) : '';
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
    ${I.movimientos.length ? card('Últimas entradas', `<ul class="pr-lin">${I.movimientos.map(m => `<li><span>${prT(m.nombre)} · ${m.tipo === 'ENTRADA_CIERRE_TURNO' ? 'cierre de turno' : m.tipo === 'CONTEO_INICIAL' ? 'conteo inicial' : 'entrada del Gerente'}${m.nota && m.tipo === 'ENTRADA' ? ' · ' + prT(m.nota) : ''}</span><span class="muted">${prT(m.fecha)} · ${m.cantidad > 0 ? '+' : ''}${prN(m.cantidad)} bultos</span></li>`).join('')}</ul>`) : ''}`;
}
function prConteoModal() {
  modal('Conteo inicial en bultos', `<div class="form"><p>Se carga una sola vez. Escribe los bultos que hay hoy de cada producto (0 si no hay).</p>${PR.inv.productos.map(p => `<label class="fld">${prT(p.nombre)}<input type="text" inputmode="numeric" class="pr-ci" data-p="${p.id_producto}" value="${p.existencias}"></label>`).join('')}
    <p class="err" id="pr-e" role="alert" hidden></p><div class="btnrow"><button type="button" class="btn pri" data-act="prConteoOk">Guardar el conteo</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`);
}
async function prConteoOk() {
  const e = $('#pr-e'); e.hidden = true; if (PR.busy) return; PR.busy = true; const conteos = [...document.querySelectorAll('.pr-ci')].map(i => ({id_producto: +i.dataset.p, bultos: i.value}));
  try { await prApi('POST', '/inventario/conteo-inicial', {conteos}); closeModal(); toast('Conteo inicial guardado.'); prRefrescar('inv'); } catch (er) { e.textContent = er.message; e.hidden = false; } finally { PR.busy = false; }
}

/* ---------- Ajustes (solo el Gerente) ---------- */
function scrAjustes() {
  const w = prEspera('Ajustes de zonas', 'aj', '/ajustes', 'aj'); if (w) return w;
  const A = PR.aj, v = n => n == null ? '' : String(n).replace('.', ',');
  return `${ph('Producción', 'Ajustes de zonas', 'Solo el Gerente cambia estas cifras.', '')}${card('', `<div class="form pr-form"><label class="fld">Capacidad del camión en papa (kilos)<input type="text" inputmode="decimal" id="pr-a-cp" value="${v(A.cap_papa_kg)}"></label>
    <label class="fld">Capacidad del camión en salsas (kilos)<input type="text" inputmode="decimal" id="pr-a-cs" value="${v(A.cap_salsa_kg)}"></label>
    <p class="hint">El camión está lleno cuando kilos de papa ÷ capacidad de papa + kilos de salsas ÷ capacidad de salsas llega a 100 %.</p>
    <label class="fld">Meta de producción del panel (kilos)<input type="text" inputmode="decimal" id="pr-a-m" value="${v(A.meta_kg)}"></label>
    <label class="fld">Corte del semáforo ámbar (kilos, opcional)<input type="text" inputmode="decimal" id="pr-a-c" value="${v(A.corte_ambar_kg)}" placeholder="Vacío: sin ámbar"></label>
    <label class="fld">Diferencia permitida al cerrar el turno (kilos, opcional)<input type="text" inputmode="decimal" id="pr-a-t" value="${v(A.tolerancia_kg)}" placeholder="Vacío: sin marcar diferencias"></label>
    <p class="err" id="pr-e" role="alert" hidden></p><div class="btnrow"><button type="button" class="btn pri" data-act="prAjGuardar">Guardar</button></div></div>`)}`;
}
async function prAjGuardar() {
  const e = $('#pr-e'); e.hidden = true; if (PR.busy) return; PR.busy = true; const g = id => $(id).value.trim().replace(',', '.');
  try { PR.aj = await prApi('POST', '/ajustes', {meta_kg: g('#pr-a-m'), cap_papa_kg: g('#pr-a-cp'), cap_salsa_kg: g('#pr-a-cs'), corte_ambar_kg: g('#pr-a-c'), tolerancia_kg: g('#pr-a-t')}); toast('Ajustes guardados.'); PR.tab = null; render(); }
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
  return card('Anotar lo empacado', '<p>Lo empacado lo anota Logística en «Empacar por turno» y, al cerrar el turno, se suma al inventario único.</p>' + (prEmpacaOk() ? '<div class="btnrow"><a class="btn pri" href="#lg-empacar">Ir a empacar</a></div>' : ''));
}
function despachoUnicoCard() {
  return prCargaCard() + card('Despachar un pedido', '<p>Los despachos se arman por zona desde los pedidos de Ventas. Al despachar se emite la nota o factura y baja el inventario único.</p>' + (prMover() ? '<div class="btnrow"><a class="btn pri" href="#pr-zonas">Ir a pedidos por zona</a></div>' : ''));
}

Object.assign(window, {invUnicoCard, empaqueUnicoCard, despachoUnicoCard});   // las usan las pantallas viejas de Empaque y Despachos

/* ---------- Registro en la app ---------- */
Object.assign(PERM_DEF, {'pr-zonas': 'empaque:2', 'pr-turno': 'produccion:2 empaque:1', 'pr-proc': 'produccion:1', 'pr-inv': 'produccion:1 empaque:1', 'pr-invv': 'ventas:1 adm:1', 'pr-aj': ''});
Object.assign(SCREENS, {
  'pr-zonas': {mod: 'prod', g: 'Zonas', t: 'Pedidos por zona', s: 'Pedidos por zona', ic: 'truck', r: scrZonas},
  'pr-turno': {mod: 'prod', g: 'Turno', t: 'Turno de producción', s: 'Turno', ic: 'flame', r: () => ''},
  'pr-proc': {mod: 'prod', g: 'Existencias', t: 'En proceso', s: 'En proceso', ic: 'flame', r: scrProceso},
  'pr-inv': {mod: 'prod', g: 'Existencias', t: 'Inventario terminado', s: 'Inventario terminado', ic: 'tag', r: scrInventario},
  'pr-invv': {mod: 'adm', g: 'Inventario', t: 'Inventario terminado', s: 'Inventario terminado', ic: 'tag', r: scrInventario},
  'pr-aj': {mod: 'prod', g: 'Zonas', t: 'Ajustes de zonas', s: 'Ajustes', ic: 'settings', r: scrAjustes}
});
S.perm = permInit();
const PRACT_REQ = {prArmarOk: ['pr-zonas', 2], prDespacharOk: ['pr-zonas', 2], prAnularSal: ['pr-zonas', 2], prPausarOk: ['pr-zonas', 2], prReanudar: ['pr-zonas', 2], prMov: ['pr-turno', 2], prEmp: ['lg-empacar', 2], prCerrarOk: ['pr-turno', 2], prConteoOk: ['pr-inv', 3], prAjGuardar: ['pr-aj', 3]};
Object.assign(ACT_REQ, PRACT_REQ); Object.assign(ACT_LBL, {prArmarOk: 'armar salidas', prDespacharOk: 'despachar', prAnularSal: 'anular salidas', prPausarOk: 'pausar zonas', prReanudar: 'reanudar zonas', prMov: 'anotar kilos del turno', prEmp: 'anotar lo empacado', prCerrarOk: 'cerrar el turno', prConteoOk: 'cargar el conteo inicial', prAjGuardar: 'guardar los ajustes'});
Object.keys(PRACT_REQ).forEach(k => WRITE_ACTS.add(k));
Object.assign(ACT_REQ, {prFriMarcar: ['pr-turno', 2], prFriQuitar: ['pr-turno', 2]}); Object.assign(ACT_LBL, {prFriMarcar: 'marcar a quien fríe', prFriQuitar: 'quitar a alguien de la fritura'}); ['prFriMarcar', 'prFriQuitar'].forEach(k => WRITE_ACTS.add(k));
Object.assign(ACT, {
  prZona: el => { PR.z = {nombre: el.dataset.z}; PR.zdata = null; PR.sel = {}; render(); },
  prVolver: () => { PR.z = null; PR.zdata = null; PR.sel = {}; PR.tab = null; render(); },
  prSel: el => { const id = el.dataset.p; if (el.checked) PR.sel[id] = {l: {}}; else delete PR.sel[id]; render(); },
  prQ: el => { const max = +el.dataset.max, id = el.dataset.p; let n = parseInt(String(el.value).replace(/\D/g, ''), 10); if (!(n >= 0)) n = max; n = Math.min(n, max); (PR.sel[id].l ||= {})[el.dataset.l] = n; render(); },
  prArmar: () => prArmarModal(), prArmarOk: () => prArmarOk(),
  prDespachar: el => prDespacharModal(+el.dataset.id, +el.dataset.k, el.dataset.nm === '1'), prDespacharOk: el => prDespacharOk(+el.dataset.id),
  prAnularSal: el => prAccion(async () => { await prApi('POST', '/salidas/' + el.dataset.id + '/anular'); prRefrescar('zdata', 'tab', 'lin', 'ldata'); }, 'Salida anulada: los pedidos quedan libres.'),
  prPausar: () => prPausaModal(), prPausarOk: () => prPausarOk(),
  prReanudar: () => prAccion(async () => { await prApi('POST', '/zonas/reanudar', {zona: PR.z.nombre}); prRefrescar('zdata', 'tab'); }, 'Zona reanudada.'),
  prMov: el => { if (!PR.busy) prMovimiento(el.dataset.e, el.dataset.s, $('#pr-k-' + el.dataset.e).value); },
  prFriMarcar: () => { const v = ($('#pr-fri-p') || {}).value; if (!v) { toast('Elige a la persona que fríe.', 'err'); return; } prAccion(async () => { await prApi('POST', '/turno/persona-etapa', {etapa: 'fritado', empleado_id: v}); prRefrescar('turno'); }, 'Marcada en la fritura.'); },
  prFriQuitar: el => prAccion(async () => { await prApi('POST', '/turno/persona-etapa', {etapa: 'fritado', empleado_id: el.dataset.id, quitar: true}); prRefrescar('turno'); }, 'Quitada de la fritura.'),
  prEmp: () => { if (!PR.busy) prEmpaque(+$('#pr-prod').value, $('#pr-b').value); },
  prCerrarTurno: () => prHoy().length ? prCerrarBloqueo() : prCerrarModal(), prCerrarOk: () => prCerrarOk(),
  prConteo: () => prConteoModal(), prConteoOk: () => prConteoOk(), prAjGuardar: () => prAjGuardar()
});
