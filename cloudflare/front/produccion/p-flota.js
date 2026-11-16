/* Flota de vehículos · pantalla de Administración y listas del modal «Despachar salida».
   Los choferes salen de Personal (nómina); no se escriben a mano. La flota arranca vacía: no se carga ningún vehículo por nuestra cuenta.
   Agregan y editan Dueño y Administración (el servidor lo vuelve a comprobar); los demás puestos solo eligen. */
const FL = {lista: null, chof: null, cargando: false, busy: false, rol: null, filtro: 'activos', dsp: null};
const flPuede = () => S.rol === 'dueno' || S.rol === 'adm';
const flUbica = () => S.rol === 'dueno' || S.rol === 'adm' || S.rol === 'empaque'; /* quién anota dónde está cada vehículo (el servidor lo vuelve a comprobar) */
const FL_TIPOS = [['CAMION', 'Camión'], ['FURGONETA', 'Furgoneta'], ['MONTACARGAS', 'Montacargas'], ['AUTOBUS', 'Autobús'], ['OTRO', 'Otro']];
const FL_EST = [['ACTIVO', 'Activo'], ['EN_TALLER', 'En taller'], ['FUERA_SERVICIO', 'Fuera de servicio']];
async function flApi(m, ruta, cuerpo) {
  const r = await fetch('/api/f' + ruta, {method: m, headers: {'content-type': 'application/json', 'x-rol': S.rol}, body: cuerpo ? JSON.stringify(cuerpo) : undefined});
  let j = {}; try { j = await r.json(); } catch (e) { /* sin cuerpo */ }
  if (!r.ok) { const e = new Error(j.error || 'No se pudo completar la operación.'); e.status = r.status; throw e; }
  return j;
}
const flFecha = iso => iso ? iso.split('-').reverse().join('/') : '';
const flCap = v => [v.capacidad_bultos ? prN(v.capacidad_bultos) + ' bultos' : '', v.capacidad_kg ? prKg(v.capacidad_kg) : '', v.capacidad_pasajeros ? prN(v.capacidad_pasajeros) + ' pasajeros' : ''].filter(Boolean).join(' · ');
/* Dónde está y qué lleva, en texto simple (también lo usa la tarjeta «Vehículos» de Gerencia) */
const flDondeTxt = v => v.donde === 'RUTA' ? 'En ruta' + (v.destino ? ' a ' + v.destino : '') : (v.donde_txt || 'En la planta');
const flDesdeTxt = v => { if (!v.desde_ts) return ''; const d = new Date(v.desde_ts), p = n => String(n).padStart(2, '0'); return 'desde ' + p(d.getDate()) + '/' + p(d.getMonth() + 1) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); };
const flCargaTxt = v => {
  const c = v.carga || {};
  if (c.tipo === 'personal') return 'Transporte de personal';
  if (c.tipo === 'salida' || c.tipo === 'manual') {
    const k = c.kilos > 0 ? (v.capacidad_kg ? prN(c.kilos, c.kilos % 1 ? 1 : 0) + ' de ' + prKg(v.capacidad_kg) : prKg(c.kilos)) : '', b = c.tipo === 'salida' && c.bultos > 0 ? prN(c.bultos) + (c.bultos === 1 ? ' bulto' : ' bultos') : '';
    return [k, b].filter(Boolean).join(' · ') || 'Sin carga anotada';
  }
  return 'Sin carga anotada';
};
window.flTxt = {donde: flDondeTxt, desde: flDesdeTxt, carga: flCargaTxt};
const flAv = v => (v.avisos || []).map(a => `<span class="chip c-warn">${prT(a.texto)}</span>`).join(' ');
function flCargar() {
  if (FL.cargando) return; FL.cargando = true;
  Promise.all([flApi('GET', '/vehiculos?todos=1'), flApi('GET', '/choferes')]).then(([a, b]) => { FL.lista = a.vehiculos; FL.chof = b.choferes; })
    .catch(e => { console.error(e); FL.lista = []; FL.chof = []; FL.error = e.message; }).finally(() => { FL.cargando = false; render(); });
}
const flAct = n => S.route === 'fl-desp' ? n + 'D' : n;
const flCab = () => S.route === 'fl-desp' ? 'Despacho' : 'Administración';
const flDonde = v => `<b>${prT(flDondeTxt(v))}</b>${v.desde_ts ? `<br><span class="muted">${prT(flDesdeTxt(v))}${v.por_rol && ROLES[v.por_rol] ? ' · ' + prT(ROLES[v.por_rol]) : ''}</span>` : ''}`;
function scrFlota() {
  if (FL.rol !== S.rol) { FL.rol = S.rol; FL.lista = null; FL.error = ''; }
  if (!window.__EM_HTTP) return ph(flCab(), 'Vehículos') + card('', emptyState('Este módulo necesita el servidor', 'Funciona en la versión con base de datos (Cloudflare).'));
  if (!FL.lista) { flCargar(); return ph(flCab(), 'Vehículos') + card('', emptyState('Cargando…', 'Un momento.')); }
  const ver = FL.lista.filter(v => FL.filtro === 'todos' || v.estado === 'ACTIVO');
  const filtros = `<div class="btnrow"><button type="button" class="btn sm ${FL.filtro === 'activos' ? 'pri' : ''}" data-act="flFiltro" data-v="activos">Activos</button><button type="button" class="btn sm ${FL.filtro === 'todos' ? 'pri' : ''}" data-act="flFiltro" data-v="todos">Todos</button>${flPuede() ? '<button type="button" class="btn pri sm" data-act="flNuevo">Agregar vehículo</button>' : ''}</div>`;
  return `${ph(flCab(), 'Vehículos')}${filtros}
  ${card('', ver.length ? table([{h: 'Placa', f: v => `<b>${prT(v.placa)}</b>`}, {h: 'Vehículo', f: v => prT(v.marca_modelo) || '<span class="muted">—</span>'}, {h: 'Dónde está', f: flDonde}, {h: 'Carga', f: v => prT(flCargaTxt(v))}, {h: 'Tipo', f: v => prT(v.tipo_txt)}, {h: 'Capacidad', f: v => prT(flCap(v)) || '<span class="muted">—</span>'},
    {h: 'Estado', f: v => `<span class="chip ${v.estado === 'ACTIVO' ? 'c-ok' : 'c-warn'}">${prT(v.estado_txt)}</span>`},
    {h: 'Seguro vence', f: v => v.seguro_vence ? prT(flFecha(v.seguro_vence)) : '<span class="muted">—</span>'}, {h: 'Documentos vencen', f: v => v.documentos_vence ? prT(flFecha(v.documentos_vence)) : '<span class="muted">—</span>'},
    {h: 'Aviso', f: v => flAv(v) || '<span class="muted">—</span>'}, {h: 'Chofer habitual', f: v => v.chofer_nombre ? prT(v.chofer_nombre) : '<span class="muted">—</span>'},
    ...(flUbica() ? [{h: '', f: v => `<button type="button" class="btn sm" data-act="${flAct('flUbic')}" data-id="${v.id}">Cambiar ubicación</button>${flPuede() ? ` <button type="button" class="btn sm" data-act="flEditar" data-id="${v.id}">Editar</button> <select class="fl-est" data-act-change="flEstado" data-id="${v.id}" aria-label="Estado de ${prT(v.placa)}">${FL_EST.map(([k, t]) => `<option value="${k}" ${k === v.estado ? 'selected' : ''}>${t}</option>`).join('')}</select>` : ''}`}] : [])], ver)
    : emptyState(FL.error ? 'No se pudo leer la flota' : 'Todavía no hay vehículos', FL.error || (flPuede() ? 'Usa «Agregar vehículo» para cargar el primero.' : 'Gerencia o Administración los cargan.')))}`;
}
/* Formulario de vehículo. pre = prefijo de los campos; mini = solo placa, tipo, marca y capacidad */
function flForm(v, pre, mini) {
  const o = (L, cur) => L.map(([k, t]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${t}</option>`).join('');
  return `<div class="row2"><label class="fld">Placa<input type="text" id="${pre}placa" maxlength="12" value="${prT(v.placa)}" autocomplete="off"></label><label class="fld">Tipo<select id="${pre}tipo">${o(FL_TIPOS, v.tipo || 'CAMION')}</select></label></div>
    <label class="fld">Marca y modelo<input type="text" id="${pre}marca" maxlength="60" value="${prT(v.marca_modelo)}"></label>
    <div class="row2"><label class="fld">Capacidad en bultos<input type="text" inputmode="numeric" id="${pre}cb" value="${v.capacidad_bultos || ''}"></label><label class="fld">Capacidad en kilos<input type="text" inputmode="decimal" id="${pre}ck" value="${v.capacidad_kg || ''}"></label></div>
    ${mini ? '' : `<label class="fld">Capacidad de pasajeros<input type="text" inputmode="numeric" id="${pre}cp" value="${v.capacidad_pasajeros || ''}"></label>`}
    ${mini ? '' : `<div class="row2"><label class="fld">Estado<select id="${pre}est">${o(FL_EST, v.estado || 'ACTIVO')}</select></label><label class="fld">Chofer habitual<select id="${pre}cho"><option value="">Ninguno</option>${(FL.chof || []).map(c => `<option value="${prT(c.id)}" ${c.id === v.chofer_id ? 'selected' : ''}>${prT(c.nombre)}</option>`).join('')}</select></label></div>
    <div class="row2"><label class="fld">Seguro vence<input type="date" id="${pre}seg" value="${prT(v.seguro_vence)}"></label><label class="fld">Documentos vencen<input type="date" id="${pre}doc" value="${prT(v.documentos_vence)}"></label></div>`}`;
}
const flLeer = (pre, mini) => { const g = k => ($('#' + pre + k) || {}).value || ''; return {placa: g('placa'), tipo: g('tipo'), marca_modelo: g('marca'), capacidad_bultos: g('cb'), capacidad_kg: g('ck'), ...(mini ? {} : {capacidad_pasajeros: g('cp'), estado: g('est'), chofer_id: g('cho'), seguro_vence: g('seg'), documentos_vence: g('doc')})}; };
function flModal(id) {
  const v = id ? FL.lista.find(x => x.id === id) : {}; if (!v) return;
  modal(id ? 'Editar vehículo' : 'Agregar vehículo', `<div class="form">${flForm(v, 'fl-', false)}<p class="err" id="fl-e" role="alert" hidden></p><div class="btnrow"><button type="button" class="btn pri" data-act="flGuardar" data-id="${id || 0}">Guardar</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`);
  const i = $('#fl-placa'); if (i) i.focus();
}
async function flGuardar(id) {
  const e = $('#fl-e'); e.hidden = true; if (FL.busy) return; FL.busy = true;
  try { await flApi(id ? 'PUT' : 'POST', id ? '/vehiculos/' + id : '/vehiculos', flLeer('fl-', false)); closeModal(); toast(id ? 'Vehículo actualizado.' : 'Vehículo agregado.'); FL.lista = null; render(); }
  catch (er) { e.textContent = er.message; e.hidden = false; } finally { FL.busy = false; }
}
async function flEstado(id, estado) {
  if (FL.busy) return; FL.busy = true;
  try { await flApi('POST', '/vehiculos/' + id + '/estado', {estado}); toast('Estado actualizado.'); } catch (er) { toast(esc(er.message), 'err'); }
  finally { FL.busy = false; FL.lista = null; render(); }
}

/* ---------- Cambiar ubicación (sin GPS: la anota una persona) ---------- */
const FL_DONDE = [['PLANTA', 'En la planta'], ['RUTA', 'En ruta'], ['TALLER', 'En taller'], ['FUERA_SERVICIO', 'Fuera de servicio']];
function flUbicModal(id, desp) {
  const v = (FL.lista || []).find(x => x.id === id); if (!v) return;
  const g = desp ? 'D' : '', bus = v.tipo === 'AUTOBUS';
  modal('Cambiar ubicación', `<div class="form"><p><b>${prT(v.marca_modelo || v.placa)}</b> · ${prT(v.placa)}</p>
    <label class="fld">¿Dónde está?<select id="flu-d" data-act-change="flUbicSel">${FL_DONDE.map(([k, t]) => `<option value="${k}" ${k === v.donde ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <div id="flu-r" ${v.donde === 'RUTA' ? '' : 'hidden'}><label class="fld">¿A dónde va?<input type="text" id="flu-dest" maxlength="60" value="${prT(v.destino)}" autocomplete="off"></label>
    ${bus ? '' : `<label class="fld">Carga en kilos (opcional)<input type="text" inputmode="decimal" id="flu-kg" value="${v.carga && v.carga.tipo === 'manual' ? v.carga.kilos : ''}"></label>`}</div>
    <p class="err" id="flu-e" role="alert" hidden></p><div class="btnrow"><button type="button" class="btn pri" data-act="flUbicGuardar${g}" data-id="${id}">Guardar</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`);
}
async function flUbicGuardar(id) {
  const e = $('#flu-e'); e.hidden = true; if (FL.busy) return; FL.busy = true;
  const g = k => ($('#' + k) || {}).value || '';
  try { await flApi('POST', '/vehiculos/' + id + '/ubicacion', {donde: g('flu-d'), destino: g('flu-dest'), carga_kg: g('flu-kg')}); closeModal(); toast('Ubicación actualizada.'); FL.lista = null; render(); }
  catch (er) { e.textContent = er.message; e.hidden = false; } finally { FL.busy = false; }
}

/* ---------- Listas plegables del modal «Despachar salida» ---------- */
const flEtiqueta = v => [v.placa, v.tipo_txt, v.marca_modelo].filter(Boolean).join(' · ') + (flCap(v) ? ' (' + flCap(v) + ')' : '');
function flCamposDespacho() {
  const D = FL.dsp, hay = D.veh.length > 0;
  return `<label class="fld">Vehículo<select id="pr-veh" data-act-change="flVehSel"><option value="">${hay || D.puede ? 'Sin vehículo' : 'No hay vehículos cargados'}</option>${D.veh.map(v => `<option value="${v.id}">${prT(flEtiqueta(v))}${v.avisos.length ? ' · revisar documentos' : ''}</option>`).join('')}${D.puede ? '<option value="nuevo">+ Agregar vehículo</option>' : ''}</select></label>
    ${D.puede ? `<div id="fl-mini" class="fl-mini" hidden><div class="form">${flForm({}, 'flm-', true)}<p class="err" id="fl-me" role="alert" hidden></p><div class="btnrow"><button type="button" class="btn pri sm" data-act="flMiniGuardar">Guardar vehículo</button><button type="button" class="btn sm" data-act="flMiniCancelar">Cancelar</button></div></div></div>` : ''}
    <label class="fld">Chofer<select id="pr-cho" data-act-change="flChoSel"><option value="">${D.cho.length ? 'Sin chofer' : 'No hay choferes en Personal'}</option>${D.cho.map(c => `<option value="${prT(c.id)}">${prT(c.nombre)}</option>`).join('')}</select></label>
    <div id="fl-av" class="fl-av" aria-live="polite" hidden></div>`;
}
async function flAbrirDespacho(id, kilos, plantilla) {
  const Z = PR.zdata, s = (Z.salidas_armando || []).find(x => x.id_salida === id) || {};
  let a, b; try { [a, b] = await Promise.all([flApi('GET', '/vehiculos'), flApi('GET', '/choferes')]); } catch (er) { toast(esc(er.message), 'err'); return; }
  FL.dsp = {id, kilos, bultos: s.bultos || 0, veh: a.vehiculos, cho: b.choferes, puede: a.puede_gestionar};
  plantilla(flCamposDespacho());
}
function flAvisosDespacho() {
  const D = FL.dsp, box = $('#fl-av'), v = D.veh.find(x => String(x.id) === ($('#pr-veh') || {}).value); if (!box) return;
  const L = [];
  if (v) {
    if (v.capacidad_kg && D.kilos > v.capacidad_kg) L.push('La salida pesa ' + prKg(D.kilos) + ' y este vehículo carga ' + prKg(v.capacidad_kg) + '.');
    if (v.capacidad_bultos && D.bultos > v.capacidad_bultos) L.push('La salida lleva ' + prN(D.bultos) + ' bultos y este vehículo carga ' + prN(v.capacidad_bultos) + '.');
    (v.avisos || []).forEach(a => L.push(a.texto));
  }
  box.innerHTML = L.map(t => `<p>${prT(t)}</p>`).join(''); box.hidden = !L.length;
}
function flVehCambio() {
  const sel = $('#pr-veh'), mini = $('#fl-mini'), nuevo = sel.value === 'nuevo'; if (mini) mini.hidden = !nuevo;
  const v = D_veh(sel.value), cho = $('#pr-cho');
  if (v && v.chofer_id && cho && !cho.value && FL.dsp.cho.some(c => c.id === v.chofer_id)) cho.value = v.chofer_id;
  flAvisosDespacho(); if (nuevo) { const i = $('#flm-placa'); if (i) i.focus(); }
}
const D_veh = val => FL.dsp.veh.find(x => String(x.id) === val);
async function flMiniGuardar() {
  const e = $('#fl-me'); e.hidden = true; if (FL.busy) return; FL.busy = true;
  try {
    const n = await flApi('POST', '/vehiculos', flLeer('flm-', true)); const a = await flApi('GET', '/vehiculos'); FL.dsp.veh = a.vehiculos; FL.lista = null;
    const sel = $('#pr-veh'); sel.innerHTML = flCamposDespacho().match(/<select id="pr-veh"[^>]*>([\s\S]*?)<\/select>/)[1]; sel.value = String(n.id);
    $('#fl-mini').hidden = true; toast('Vehículo agregado.'); flVehCambio();
  } catch (er) { e.textContent = er.message; e.hidden = false; } finally { FL.busy = false; }
}
function flMiniCancelar() { $('#pr-veh').value = ''; $('#fl-mini').hidden = true; flAvisosDespacho(); }
/* Lo que se envía al despachar: ids elegidos (el servidor guarda además el texto de respaldo) */
function flElegidos() {
  const v = ($('#pr-veh') || {}).value || '', c = ($('#pr-cho') || {}).value || '';
  if (v === 'nuevo') throw new Error('Guarda el vehículo nuevo o elige otro de la lista.');
  return {vehiculo_id: v ? +v : null, chofer_id: c || null};
}

Object.assign(PERM_DEF, {'fl-flota': 'adm:2', 'fl-desp': 'empaque:2 jefeprod:1'}); /* Empaque y despacho anota la ubicación; Jefe de producción solo ve */
Object.assign(SCREENS, {'fl-flota': {mod: 'adm', g: 'Flota', t: 'Vehículos', s: 'Vehículos', ic: 'truck', r: scrFlota}, 'fl-desp': {mod: 'prod', g: 'Despacho', t: 'Vehículos', s: 'Vehículos', ic: 'truck', r: scrFlota}});
S.perm = permInit();
const FLACT_REQ = {flGuardar: ['fl-flota', 2], flNuevo: ['fl-flota', 2], flEditar: ['fl-flota', 2], flEstado: ['fl-flota', 2], flUbic: ['fl-flota', 2], flUbicGuardar: ['fl-flota', 2], flUbicD: ['fl-desp', 2], flUbicGuardarD: ['fl-desp', 2]};
Object.assign(ACT_REQ, FLACT_REQ); Object.assign(ACT_LBL, {flGuardar: 'guardar vehículos', flNuevo: 'agregar vehículos', flEditar: 'editar vehículos', flEstado: 'cambiar el estado de un vehículo', flUbic: 'cambiar la ubicación de un vehículo', flUbicD: 'cambiar la ubicación de un vehículo', flUbicGuardar: 'cambiar la ubicación de un vehículo', flUbicGuardarD: 'cambiar la ubicación de un vehículo'}); ['flGuardar', 'flEstado', 'flUbicGuardar', 'flUbicGuardarD'].forEach(k => WRITE_ACTS.add(k));
Object.assign(ACT, {
  flFiltro: el => { FL.filtro = el.dataset.v; render(); }, flNuevo: () => flModal(0), flEditar: el => flModal(+el.dataset.id), flGuardar: el => flGuardar(+el.dataset.id), flEstado: el => flEstado(+el.dataset.id, el.value),
  flUbic: el => flUbicModal(+el.dataset.id, false), flUbicD: el => flUbicModal(+el.dataset.id, true), flUbicGuardar: el => flUbicGuardar(+el.dataset.id), flUbicGuardarD: el => flUbicGuardar(+el.dataset.id),
  flUbicSel: el => { const r = $('#flu-r'); if (r) r.hidden = el.value !== 'RUTA'; },
  flVehSel: () => flVehCambio(), flChoSel: () => {}, flMiniGuardar: () => flMiniGuardar(), flMiniCancelar: () => flMiniCancelar()
});
