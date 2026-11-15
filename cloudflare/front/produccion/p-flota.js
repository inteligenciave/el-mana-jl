/* Flota de vehículos · pantalla de Administración y listas del modal «Despachar salida».
   Los choferes salen de Personal (nómina); no se escriben a mano. La flota arranca vacía: no se carga ningún vehículo por nuestra cuenta.
   Agregan y editan Dueño y Administración (el servidor lo vuelve a comprobar); los demás puestos solo eligen. */
const FL = {lista: null, chof: null, cargando: false, busy: false, rol: null, filtro: 'activos', dsp: null};
const flPuede = () => S.rol === 'dueno' || S.rol === 'adm';
const FL_TIPOS = [['CAMION', 'Camión'], ['FURGONETA', 'Furgoneta'], ['MONTACARGAS', 'Montacargas'], ['OTRO', 'Otro']];
const FL_EST = [['ACTIVO', 'Activo'], ['EN_TALLER', 'En taller'], ['FUERA_SERVICIO', 'Fuera de servicio']];
async function flApi(m, ruta, cuerpo) {
  const r = await fetch('/api/f' + ruta, {method: m, headers: {'content-type': 'application/json', 'x-rol': S.rol}, body: cuerpo ? JSON.stringify(cuerpo) : undefined});
  let j = {}; try { j = await r.json(); } catch (e) { /* sin cuerpo */ }
  if (!r.ok) { const e = new Error(j.error || 'No se pudo completar la operación.'); e.status = r.status; throw e; }
  return j;
}
const flFecha = iso => iso ? iso.split('-').reverse().join('/') : '';
const flCap = v => [v.capacidad_bultos ? prN(v.capacidad_bultos) + ' bultos' : '', v.capacidad_kg ? prKg(v.capacidad_kg) : ''].filter(Boolean).join(' · ');
const flAv = v => (v.avisos || []).map(a => `<span class="chip c-warn">${prT(a.texto)}</span>`).join(' ');
function flCargar() {
  if (FL.cargando) return; FL.cargando = true;
  Promise.all([flApi('GET', '/vehiculos?todos=1'), flApi('GET', '/choferes')]).then(([a, b]) => { FL.lista = a.vehiculos; FL.chof = b.choferes; })
    .catch(e => { console.error(e); FL.lista = []; FL.chof = []; FL.error = e.message; }).finally(() => { FL.cargando = false; render(); });
}
function scrFlota() {
  if (FL.rol !== S.rol) { FL.rol = S.rol; FL.lista = null; FL.error = ''; }
  if (!window.__EM_HTTP) return ph('Administración', 'Flota de vehículos') + card('', emptyState('Este módulo necesita el servidor', 'Funciona en la versión con base de datos (Cloudflare).'));
  if (!FL.lista) { flCargar(); return ph('Administración', 'Flota de vehículos') + card('', emptyState('Cargando…', 'Un momento.')); }
  const ver = FL.lista.filter(v => FL.filtro === 'todos' || v.estado === 'ACTIVO');
  const filtros = `<div class="btnrow"><button type="button" class="btn sm ${FL.filtro === 'activos' ? 'pri' : ''}" data-act="flFiltro" data-v="activos">Activos</button><button type="button" class="btn sm ${FL.filtro === 'todos' ? 'pri' : ''}" data-act="flFiltro" data-v="todos">Todos</button>${flPuede() ? '<button type="button" class="btn pri sm" data-act="flNuevo">Agregar vehículo</button>' : ''}</div>`;
  return `${ph('Administración', 'Flota de vehículos')}${filtros}
  ${card('', ver.length ? table([{h: 'Placa', f: v => `<b>${prT(v.placa)}</b>`}, {h: 'Tipo', f: v => prT(v.tipo_txt)}, {h: 'Marca y modelo', f: v => prT(v.marca_modelo) || '<span class="muted">—</span>'}, {h: 'Capacidad', f: v => prT(flCap(v)) || '<span class="muted">—</span>'},
    {h: 'Estado', f: v => `<span class="chip ${v.estado === 'ACTIVO' ? 'c-ok' : 'c-warn'}">${prT(v.estado_txt)}</span>`},
    {h: 'Seguro vence', f: v => v.seguro_vence ? prT(flFecha(v.seguro_vence)) : '<span class="muted">—</span>'}, {h: 'Documentos vencen', f: v => v.documentos_vence ? prT(flFecha(v.documentos_vence)) : '<span class="muted">—</span>'},
    {h: 'Aviso', f: v => flAv(v) || '<span class="muted">—</span>'}, {h: 'Chofer habitual', f: v => v.chofer_nombre ? prT(v.chofer_nombre) : '<span class="muted">—</span>'},
    ...(flPuede() ? [{h: '', f: v => `<button type="button" class="btn sm" data-act="flEditar" data-id="${v.id}">Editar</button> <select class="fl-est" data-act-change="flEstado" data-id="${v.id}" aria-label="Estado de ${prT(v.placa)}">${FL_EST.map(([k, t]) => `<option value="${k}" ${k === v.estado ? 'selected' : ''}>${t}</option>`).join('')}</select>`}] : [])], ver)
    : emptyState(FL.error ? 'No se pudo leer la flota' : 'Todavía no hay vehículos', FL.error || (flPuede() ? 'Usa «Agregar vehículo» para cargar el primero.' : 'Pídele al Dueño o a Administración que los carguen.')))}`;
}
/* Formulario de vehículo. pre = prefijo de los campos; mini = solo placa, tipo, marca y capacidad */
function flForm(v, pre, mini) {
  const o = (L, cur) => L.map(([k, t]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${t}</option>`).join('');
  return `<div class="row2"><label class="fld">Placa<input type="text" id="${pre}placa" maxlength="12" value="${prT(v.placa)}" autocomplete="off"></label><label class="fld">Tipo<select id="${pre}tipo">${o(FL_TIPOS, v.tipo || 'CAMION')}</select></label></div>
    <label class="fld">Marca y modelo<input type="text" id="${pre}marca" maxlength="60" value="${prT(v.marca_modelo)}"></label>
    <div class="row2"><label class="fld">Capacidad en bultos<input type="text" inputmode="numeric" id="${pre}cb" value="${v.capacidad_bultos || ''}"></label><label class="fld">Capacidad en kilos<input type="text" inputmode="decimal" id="${pre}ck" value="${v.capacidad_kg || ''}"></label></div>
    ${mini ? '' : `<div class="row2"><label class="fld">Estado<select id="${pre}est">${o(FL_EST, v.estado || 'ACTIVO')}</select></label><label class="fld">Chofer habitual<select id="${pre}cho"><option value="">Ninguno</option>${(FL.chof || []).map(c => `<option value="${prT(c.id)}" ${c.id === v.chofer_id ? 'selected' : ''}>${prT(c.nombre)}</option>`).join('')}</select></label></div>
    <div class="row2"><label class="fld">Seguro vence<input type="date" id="${pre}seg" value="${prT(v.seguro_vence)}"></label><label class="fld">Documentos vencen<input type="date" id="${pre}doc" value="${prT(v.documentos_vence)}"></label></div>`}`;
}
const flLeer = (pre, mini) => { const g = k => ($('#' + pre + k) || {}).value || ''; return {placa: g('placa'), tipo: g('tipo'), marca_modelo: g('marca'), capacidad_bultos: g('cb'), capacidad_kg: g('ck'), ...(mini ? {} : {estado: g('est'), chofer_id: g('cho'), seguro_vence: g('seg'), documentos_vence: g('doc')})}; };
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

Object.assign(PERM_DEF, {'fl-flota': 'adm:2'});
Object.assign(SCREENS, {'fl-flota': {mod: 'adm', g: 'Flota', t: 'Flota de vehículos', s: 'Flota', ic: 'truck', r: scrFlota}});
S.perm = permInit();
const FLACT_REQ = {flGuardar: ['fl-flota', 2], flNuevo: ['fl-flota', 2], flEditar: ['fl-flota', 2], flEstado: ['fl-flota', 2]};
Object.assign(ACT_REQ, FLACT_REQ); Object.assign(ACT_LBL, {flGuardar: 'guardar vehículos', flNuevo: 'agregar vehículos', flEditar: 'editar vehículos', flEstado: 'cambiar el estado de un vehículo'}); ['flGuardar', 'flEstado'].forEach(k => WRITE_ACTS.add(k));
Object.assign(ACT, {
  flFiltro: el => { FL.filtro = el.dataset.v; render(); }, flNuevo: () => flModal(0), flEditar: el => flModal(+el.dataset.id), flGuardar: el => flGuardar(+el.dataset.id), flEstado: el => flEstado(+el.dataset.id, el.value),
  flVehSel: () => flVehCambio(), flChoSel: () => {}, flMiniGuardar: () => flMiniGuardar(), flMiniCancelar: () => flMiniCancelar()
});
