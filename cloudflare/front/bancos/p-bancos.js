/* Bancos de la empresa · pantalla de Administración (consulta para quien la ve; agregar, editar y desactivar solo Gerente y Administración).
   La lista arranca vacía: no se carga ningún banco por nuestra cuenta. */
const BK = {lista: null, cargando: false, busy: false, rol: null, filtro: 'activos'};
const bkPuede = () => S.rol === 'dueno' || S.rol === 'adm';
/* Bancos sugeridos: nombres frecuentes en Venezuela con número de cuenta de EJEMPLO (solo el código del banco; no es una cuenta real). Se agregan con un clic y el Gerente o Administración reemplaza el número. */
const BK_SUG = [['Banesco', '0134'], ['Banco de Venezuela', '0102'], ['Mercantil', '0105'], ['BBVA Provincial', '0108'], ['BNC', '0191'], ['Bancamiga', '0172'], ['Banplus', '0174'], ['Banco Bicentenario', '0175'], ['Banco del Tesoro', '0163'], ['Banco Exterior', '0115']].map(([nombre, cod]) => ({nombre, cuenta_numero: cod + '-0000-00-0000000000', cuenta_titular: '', telefono: '', cedula: '', rif: ''}));
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
  const hay = new Set(todos.filter(b => b.moneda === 'BS').map(b => b.nombre.toLowerCase())), faltan = BK_SUG.filter(x => !hay.has(x.nombre.toLowerCase()));
  const sug = bkPuede() && faltan.length ? card('Bancos sugeridos', `<p class="sub">Elige el banco: se abre el formulario con su nombre. Completa número de cuenta, titular, teléfono, cédula y RIF (los tres últimos son obligatorios).</p><div class="btnrow">${faltan.map(x => `<button type="button" class="btn sm" data-act="bkSug" data-n="${bkT(x.nombre)}">${bkT(x.nombre)}</button>`).join('')}</div>`) : '';
  return `${ph('Administración', 'Bancos de la empresa')}${filtros}${sug}
  ${card('', ver.length ? table([{h: 'Banco', f: b => `<b>${bkT(b.nombre)}</b>`}, {h: 'Moneda de la cuenta', f: b => bkT(b.moneda_txt)}, {h: 'Número de cuenta', f: b => bkT(b.cuenta_numero) || '<span class="muted">sin cargar</span>'}, {h: 'Titular', f: b => bkT(b.cuenta_titular) || '<span class="muted">sin cargar</span>'}, {h: 'Teléfono (Pago Móvil)', f: b => bkT(b.telefono) || '<span class="muted">falta cargar</span>'}, {h: 'Cédula', f: b => bkT(b.cedula) || '<span class="muted">falta cargar</span>'}, {h: 'RIF', f: b => bkT(b.rif) || '<span class="muted">falta cargar</span>'},
    {h: 'Estado', f: b => b.activo ? '<span class="chip c-ok">Activo</span>' : '<span class="chip c-warn">Desactivado</span>'},
    ...(bkPuede() ? [{h: '', f: b => `<button type="button" class="btn sm" data-act="bkEditar" data-id="${b.id}">Editar</button> <button type="button" class="btn sm" data-act="bkActivo" data-id="${b.id}" data-v="${b.activo ? 0 : 1}">${b.activo ? 'Desactivar' : 'Activar'}</button>`}] : [])], ver)
    : emptyState('Todavía no hay bancos cargados', bkPuede() ? 'Usa «Agregar banco» para cargar el primero.' : 'Pídele al Gerente o a Administración que los carguen.'))}`;
}
function bkModal(id, previo) {
  const b = id ? BK.lista.bancos.find(x => x.id === id) : {nombre: '', moneda: 'BS', cuenta_numero: '', cuenta_titular: '', telefono: '', cedula: '', rif: '', ...(previo || {})}; if (!b) return;
  modal(id ? 'Editar banco' : 'Agregar banco', `<div class="form"><label class="fld">Nombre del banco<input type="text" id="bk-n" maxlength="60" value="${bkT(b.nombre)}"></label>
    <label class="fld">Moneda de la cuenta<select id="bk-m"><option value="BS" ${b.moneda === 'BS' ? 'selected' : ''}>Bolívares</option><option value="USD" ${b.moneda === 'USD' ? 'selected' : ''}>Dólares</option></select></label>
    <label class="fld">Número de cuenta<input type="text" id="bk-c" maxlength="40" value="${bkT(b.cuenta_numero)}" autocomplete="off"></label>
    <label class="fld">Titular de la cuenta<input type="text" id="bk-t" maxlength="80" value="${bkT(b.cuenta_titular)}"></label>
    <label class="fld">Teléfono (Pago Móvil) · obligatorio<input type="tel" id="bk-tel" maxlength="20" value="${bkT(b.telefono)}" inputmode="tel" autocomplete="off" placeholder="0414-1234567"></label>
    <label class="fld">Cédula de identidad (titular o representante) · obligatorio<input type="text" id="bk-ced" maxlength="15" value="${bkT(b.cedula)}" autocomplete="off" placeholder="V-12345678"></label>
    <label class="fld">RIF (cuentas jurídicas o comerciales) · obligatorio<input type="text" id="bk-rif" maxlength="16" value="${bkT(b.rif)}" autocomplete="off" placeholder="J-12345678-9"></label>
    <p class="err" id="bk-e" role="alert" hidden></p><div class="btnrow"><button type="button" class="btn pri" data-act="bkGuardar" data-id="${id || 0}">Guardar</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`);
  const i = $('#bk-n'); if (i) i.focus();
}
async function bkGuardar(id) {
  const e = $('#bk-e'); e.hidden = true; if (BK.busy) return; BK.busy = true;
  const cuerpo = {nombre: $('#bk-n').value, moneda: $('#bk-m').value, cuenta_numero: $('#bk-c').value, cuenta_titular: $('#bk-t').value, telefono: $('#bk-tel').value, cedula: $('#bk-ced').value, rif: $('#bk-rif').value};
  const falta = !cuerpo.telefono.trim() ? 'Escribe el número de teléfono (Pago Móvil).' : !cuerpo.cedula.trim() ? 'Escribe la cédula de identidad.' : !cuerpo.rif.trim() ? 'Escribe el RIF.' : '';
  if (falta) { e.textContent = falta; e.hidden = false; BK.busy = false; return; }
  try { await bkApi(id ? 'PUT' : 'POST', id ? '/' + id : '/', cuerpo); closeModal(); toast(id ? 'Banco actualizado.' : 'Banco agregado.'); BK.lista = null; render(); }
  catch (er) { e.textContent = er.message; e.hidden = false; }
  finally { BK.busy = false; }
}
function bkSugerido(n) { const x = BK_SUG.find(s => s.nombre === n); if (x) bkModal(0, x); }
async function bkActivo(id, activo) {
  if (BK.busy) return; BK.busy = true;
  try { await bkApi('POST', '/' + id + (activo ? '/activar' : '/desactivar')); toast(activo ? 'Banco activado.' : 'Banco desactivado: ya no se puede elegir, pero los cobros anteriores conservan su nombre.'); BK.lista = null; render(); }
  catch (er) { toast(esc(er.message), 'err'); }
  finally { BK.busy = false; }
}
Object.assign(PERM_DEF, {'p-bancos': 'adm:1'});
Object.assign(SCREENS, {'p-bancos': {mod: 'adm', g: 'Bancos', t: 'Bancos de la empresa', s: 'Bancos', ic: 'wallet', r: scrBancos}});
S.perm = permInit();
const BKACT_REQ = {bkGuardar: ['p-bancos', 2], bkActivo: ['p-bancos', 2], bkNuevo: ['p-bancos', 2], bkEditar: ['p-bancos', 2], bkSug: ['p-bancos', 2]};
Object.assign(ACT_REQ, BKACT_REQ); Object.assign(ACT_LBL, {bkGuardar: 'guardar bancos', bkActivo: 'activar o desactivar bancos', bkNuevo: 'agregar bancos', bkEditar: 'editar bancos', bkSug: 'agregar bancos sugeridos'}); ['bkGuardar', 'bkActivo'].forEach(k => WRITE_ACTS.add(k));
Object.assign(ACT, {
  bkFiltro: el => { BK.filtro = el.dataset.v; render(); },
  bkSug: el => bkSugerido(el.dataset.n), bkNuevo: () => bkModal(0), bkEditar: el => bkModal(+el.dataset.id), bkGuardar: el => bkGuardar(+el.dataset.id), bkActivo: el => bkActivo(+el.dataset.id, +el.dataset.v === 1)
});
