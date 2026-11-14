/* Bancos de la empresa · pantalla de Administración (consulta para quien la ve; agregar, editar y desactivar solo Dueño y Administración).
   La lista arranca vacía: no se carga ningún banco por nuestra cuenta. */
const BK = {lista: null, cargando: false, busy: false, rol: null, filtro: 'activos'};
const bkPuede = () => S.rol === 'dueno' || S.rol === 'adm';
const bkT = s => esc(s == null ? '' : s);
async function bkApi(m, ruta, cuerpo) {
  const r = await fetch('/api/v/bancos' + ruta, {method: m, headers: {'content-type': 'application/json', 'x-rol': S.rol}, body: cuerpo ? JSON.stringify(cuerpo) : undefined});
  let j = {}; try { j = await r.json(); } catch (e) { /* sin cuerpo */ }
  if (!r.ok) { const e = new Error(j.error || 'No se pudo completar la operación.'); e.status = r.status; throw e; }
  return j;
}
function bkCargar() {
  if (BK.cargando) return; BK.cargando = true;
  bkApi('GET', '/?todos=1').then(r => { BK.lista = r; }).catch(e => { console.error(e); BK.lista = {bancos: [], mensaje_vacio: 'No se pudo leer la lista de bancos.'}; }).finally(() => { BK.cargando = false; render(); });
}
function scrBancos() {
  if (BK.rol !== S.rol) { BK.rol = S.rol; BK.lista = null; }
  if (!window.__EM_HTTP) return ph('Administración', 'Bancos', '', '') + card('', emptyState('Este módulo necesita el servidor', 'Funciona en la versión con base de datos (Cloudflare).'));
  if (!BK.lista) { bkCargar(); return ph('Administración', 'Bancos', '', '') + card('', emptyState('Cargando…', 'Un momento.')); }
  const todos = BK.lista.bancos, ver = todos.filter(b => BK.filtro === 'todos' || b.activo);
  const filtros = `<div class="btnrow"><button type="button" class="btn sm ${BK.filtro === 'activos' ? 'pri' : ''}" data-act="bkFiltro" data-v="activos">Activos</button><button type="button" class="btn sm ${BK.filtro === 'todos' ? 'pri' : ''}" data-act="bkFiltro" data-v="todos">Todos (con desactivados)</button>${bkPuede() ? '<button type="button" class="btn pri sm" data-act="bkNuevo">Agregar banco</button>' : ''}</div>`;
  return `${ph('Administración', 'Bancos de la empresa')}${filtros}
  ${card('', ver.length ? table([{h: 'Banco', f: b => `<b>${bkT(b.nombre)}</b>`}, {h: 'Moneda de la cuenta', f: b => bkT(b.moneda_txt)}, {h: 'Número de cuenta', f: b => bkT(b.cuenta_numero) || '<span class="muted">sin cargar</span>'}, {h: 'Titular', f: b => bkT(b.cuenta_titular) || '<span class="muted">sin cargar</span>'},
    {h: 'Estado', f: b => b.activo ? '<span class="chip c-ok">Activo</span>' : '<span class="chip c-warn">Desactivado</span>'},
    ...(bkPuede() ? [{h: '', f: b => `<button type="button" class="btn sm" data-act="bkEditar" data-id="${b.id}">Editar</button> <button type="button" class="btn sm" data-act="bkActivo" data-id="${b.id}" data-v="${b.activo ? 0 : 1}">${b.activo ? 'Desactivar' : 'Activar'}</button>`}] : [])], ver)
    : emptyState('Todavía no hay bancos cargados', bkPuede() ? 'Usa «Agregar banco» para cargar el primero.' : 'Pídele al Dueño o a Administración que los carguen.'))}`;
}
function bkModal(id) {
  const b = id ? BK.lista.bancos.find(x => x.id === id) : {nombre: '', moneda: 'BS', cuenta_numero: '', cuenta_titular: ''}; if (!b) return;
  modal(id ? 'Editar banco' : 'Agregar banco', `<div class="form"><label class="fld">Nombre del banco<input type="text" id="bk-n" maxlength="60" value="${bkT(b.nombre)}"></label>
    <label class="fld">Moneda de la cuenta<select id="bk-m"><option value="BS" ${b.moneda === 'BS' ? 'selected' : ''}>Bolívares</option><option value="USD" ${b.moneda === 'USD' ? 'selected' : ''}>Dólares</option></select></label>
    <label class="fld">Número de cuenta<input type="text" id="bk-c" maxlength="40" value="${bkT(b.cuenta_numero)}" autocomplete="off"></label>
    <label class="fld">Titular de la cuenta<input type="text" id="bk-t" maxlength="80" value="${bkT(b.cuenta_titular)}"></label>
    <p class="err" id="bk-e" role="alert" hidden></p><div class="btnrow"><button type="button" class="btn pri" data-act="bkGuardar" data-id="${id || 0}">Guardar</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`);
  const i = $('#bk-n'); if (i) i.focus();
}
async function bkGuardar(id) {
  const e = $('#bk-e'); e.hidden = true; if (BK.busy) return; BK.busy = true;
  const cuerpo = {nombre: $('#bk-n').value, moneda: $('#bk-m').value, cuenta_numero: $('#bk-c').value, cuenta_titular: $('#bk-t').value};
  try { await bkApi(id ? 'PUT' : 'POST', id ? '/' + id : '/', cuerpo); closeModal(); toast(id ? 'Banco actualizado.' : 'Banco agregado.'); BK.lista = null; render(); }
  catch (er) { e.textContent = er.message; e.hidden = false; }
  finally { BK.busy = false; }
}
async function bkActivo(id, activo) {
  if (BK.busy) return; BK.busy = true;
  try { await bkApi('POST', '/' + id + (activo ? '/activar' : '/desactivar')); toast(activo ? 'Banco activado.' : 'Banco desactivado: ya no se puede elegir, pero los cobros anteriores conservan su nombre.'); BK.lista = null; render(); }
  catch (er) { toast(esc(er.message), 'err'); }
  finally { BK.busy = false; }
}
Object.assign(PERM_DEF, {'p-bancos': 'adm:1'});
Object.assign(SCREENS, {'p-bancos': {mod: 'adm', g: 'Bancos', t: 'Bancos de la empresa', s: 'Bancos', ic: 'wallet', r: scrBancos}});
S.perm = permInit();
const BKACT_REQ = {bkGuardar: ['p-bancos', 2], bkActivo: ['p-bancos', 2], bkNuevo: ['p-bancos', 2], bkEditar: ['p-bancos', 2]};
Object.assign(ACT_REQ, BKACT_REQ); Object.assign(ACT_LBL, {bkGuardar: 'guardar bancos', bkActivo: 'activar o desactivar bancos', bkNuevo: 'agregar bancos', bkEditar: 'editar bancos'}); ['bkGuardar', 'bkActivo'].forEach(k => WRITE_ACTS.add(k));
Object.assign(ACT, {
  bkFiltro: el => { BK.filtro = el.dataset.v; render(); },
  bkNuevo: () => bkModal(0), bkEditar: el => bkModal(+el.dataset.id), bkGuardar: el => bkGuardar(+el.dataset.id), bkActivo: el => bkActivo(+el.dataset.id, +el.dataset.v === 1)
});
