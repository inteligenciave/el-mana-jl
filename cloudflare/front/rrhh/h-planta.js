/* En planta hoy (marcas de entrada y salida) y Pagar nómina (por semana, quincena o mes, con préstamos y recibo).
   Todo el cálculo de montos lo hace el servidor (/api/h/*); aquí solo se muestra y se pide. Solo Gerencia y Nómina. */
const HP = {d: null, cargando: false, ts: 0, rol: null, busy: {}, q: '', nom: null, nomClave: '', nomCarg: false, nomTs: 0, per: 'quincena', ref: null, pm: null, error: ''};
const hpN = (n, d = 2) => Number(n || 0).toLocaleString('es-VE', {minimumFractionDigits: d, maximumFractionDigits: d});
const hpBs = n => 'Bs ' + hpN(n);
const hpHora = ts => { const d = new Date(ts - 4 * 3600e3), p = n => String(n).padStart(2, '0'); return p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()); }; /* hora de Venezuela (UTC-4) */
const hpFecha = s => s ? s.split('-').reverse().join('/') : '';
const hpArea = a => (typeof AREA_MAP !== 'undefined' && AREA_MAP[a]) || a || '';
async function hpApi(m, ruta, cuerpo) {
  const r = await fetch('/api/h' + ruta, {method: m, headers: {'content-type': 'application/json', 'x-rol': S.rol}, body: cuerpo ? JSON.stringify(cuerpo) : undefined});
  let j = {}; try { j = await r.json(); } catch (e) { /* sin cuerpo */ }
  if (!r.ok) { const e = new Error(j.error || 'No se pudo completar la operación.'); e.status = r.status; e.datos = j; throw e; }
  return j;
}
const hpReset = () => { if (HP.rol !== S.rol) { HP.rol = S.rol; HP.d = null; HP.nom = null; HP.nomClave = ''; HP.error = ''; HP.q = ''; } };

/* ---------- En planta hoy ---------- */
function hpCargar() {
  if (HP.cargando) return; HP.cargando = true;
  hpApi('GET', '/hoy').then(d => { HP.d = d; HP.error = ''; }).catch(e => { console.error(e); HP.error = e.message; if (!HP.d) HP.d = {presentes: [], trabajadores: [], total: 0, por_turno: {}}; })
    .finally(() => { HP.cargando = false; HP.ts = Date.now(); if (S.route === 'rh-planta') render(); });
}
const hpPuedeMarcar = () => lvlOf(S.rol, 'rh-planta') >= 2;
function hpFilas() {
  const q = (HP.q || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''), puede = hpPuedeMarcar();
  const L = (HP.d.trabajadores || []).filter(t => !q || (t.nombre + ' ' + t.cargo + ' ' + hpArea(t.area)).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q));
  if (!L.length) return `<p class="hp-vacio">${q ? 'Nadie coincide con lo que escribiste.' : 'No hay personas activas en Personal.'}</p>`;
  return L.map(t => {
    const dentro = t.estado === 'dentro', sinTurno = !t.turno && !dentro;
    const est = dentro ? `<span class="chip c-ok">Entró ${hpHora(t.entrada_ts)}</span>` : t.estado === 'salio' ? `<span class="chip c-n">Salió ${hpHora(t.salida_ts)}</span>` : '';
    const btn = !puede ? '' : dentro ? `<button type="button" class="btn hp-btn hp-sal" data-act="hpMarcar" data-id="${esc(t.empleado_id)}" data-t="salida">Marcó salida</button>`
      : `<button type="button" class="btn pri hp-btn" data-act="hpMarcar" data-id="${esc(t.empleado_id)}" data-t="entrada" ${sinTurno ? 'disabled' : ''}>Marcó entrada</button>`;
    return `<div class="hp-fila"><div class="hp-q"><b>${esc(t.nombre)}</b><span>${esc(t.cargo || '—')} · ${esc(hpArea(t.area))}</span><span class="hp-chips">${t.turno ? `<span class="chip c-info">${esc(t.turno)}</span>` : '<span class="chip c-warn">Falta el turno en Personal</span>'}${est}</span></div>${btn}</div>`;
  }).join('');
}
function scrPlanta() {
  hpReset();
  if (!window.__EM_HTTP) return card('', emptyState('Este módulo necesita el servidor', 'Funciona en la versión con base de datos (Cloudflare).'));
  if (!HP.d) { hpCargar(); return card('', emptyState('Cargando…', 'Un momento.')); }
  if (!HP.cargando && Date.now() - HP.ts > 5000) hpCargar(); /* se actualiza al volver a entrar */
  const d = HP.d, pt = d.por_turno || {}, turnos = ['Mañana', 'Tarde'];
  const col = t => { const L = (d.presentes || []).filter(p => p.turno === t);
    return `<section class="card hp-turno"><div class="card-b"><h2>${t} <span class="hp-n">${L.length}</span></h2>${L.length ? L.map(p => `<div class="hp-p"><div><b>${esc(p.nombre)}</b><span>${esc(p.cargo || '—')} · ${esc(hpArea(p.area))}</span></div><time>Entró ${hpHora(p.entrada_ts)}</time></div>`).join('') : '<p class="hp-vacio">Nadie en este turno</p>'}</div></section>`; };
  return `<div class="hp-top">${turnos.map(t => `<div class="hp-tn"><b>${pt[t] || 0}</b><span>${t}</span></div>`).join('')}
    <span class="muted hp-nota">Personal activo hoy: sin choferes ni administración</span>
    ${can('rh-pagar') ? '<a class="btn pri hp-pagar" href="#rh-pagar">Pagar nómina</a>' : ''}</div>
  ${HP.error ? `<p class="err" role="alert">${esc(HP.error)}</p>` : ''}
  <div class="hp-grid"><div class="hp-izq">${d.total ? turnos.map(col).join('') : card('', emptyState('Nadie ha marcado entrada hoy', 'Cuando alguien llegue, márcalo en la lista de al lado.'))}</div>
    <section class="card hp-marcar"><div class="card-b"><h2>Marcar entrada y salida</h2><label class="fld hp-bus">Buscar<input type="search" id="hp-q" value="${esc(HP.q)}" placeholder="Nombre o cargo" autocomplete="off"></label><div class="hp-lista" id="hp-lista">${hpFilas()}</div></div></section></div>`;
}
async function hpMarcar(el) {
  const id = el.dataset.id, t = el.dataset.t; if (HP.busy[id]) return; HP.busy[id] = true;
  try { const r = await hpApi('POST', '/' + t, {empleado_id: id}); toast(esc(r.nombre) + (t === 'entrada' ? ': entrada marcada a las ' + hpHora(r.entrada_ts) + '.' : ': salida marcada a las ' + hpHora(r.salida_ts) + '.')); }
  catch (e) { toast(esc(e.message), 'err'); }
  finally { delete HP.busy[id]; HP.ts = 0; HP.resTs = 0; HP.d && hpCargar(); }
}
/* La búsqueda filtra la lista sin repintar la pantalla (no se pierde el cursor) */
if (!window.__hpListeners) {
  window.__hpListeners = true;
  document.addEventListener('input', e => {
    const t = e.target; if (!t || !t.id) return;
    if (t.id === 'hp-q') { HP.q = t.value; const l = document.getElementById('hp-lista'); if (l && HP.d) l.innerHTML = hpFilas(); }
    else if (t.id === 'hp-dm' || t.id === 'hp-dc') hpPmNeto();
  });
  document.addEventListener('change', e => { const t = e.target; if (t && t.id === 'hp-dc') hpPmNeto(); });
  setInterval(() => { const m = document.getElementById('modal'); if (S.route === 'rh-planta' && HP.d && !HP.cargando && !document.hidden && !(m && !m.hidden)) hpCargar(); }, 30000);
}

/* ---------- Pagar nómina ---------- */
const HP_PER = [['semana', 'Semana'], ['quincena', 'Quincena'], ['mes', 'Mes']];
const hpClave = () => HP.per + '|' + (HP.ref || '');
function hpCargarNom(forzar) {
  if (HP.nomCarg) return; const k = hpClave(); HP.nomCarg = true;
  hpApi('GET', '/nomina?periodo=' + HP.per + (HP.ref ? '&ref=' + HP.ref : '')).then(d => { HP.nom = d; HP.nomClave = k; HP.error = ''; }).catch(e => { console.error(e); HP.error = e.message; HP.nom = null; HP.nomClave = k; })
    .finally(() => { HP.nomCarg = false; HP.nomTs = Date.now(); if (hpClave() !== k) { HP.nomClave = ''; } if (S.route === 'rh-pagar') render(); });
}
const hpPropio = () => lvlOf(S.rol, 'rh-pagar') >= 2;
function scrPagar() {
  hpReset();
  if (!window.__EM_HTTP) return card('', emptyState('Este módulo necesita el servidor', 'Funciona en la versión con base de datos (Cloudflare).'));
  if (HP.nomClave !== hpClave() || (HP.nom && !HP.nomCarg && Date.now() - HP.nomTs > 5000)) { const nuevo = HP.nomClave !== hpClave(); if (nuevo) HP.nom = null; hpCargarNom(); if (nuevo) return card('', emptyState('Cargando…', 'Un momento.')); }
  const N = HP.nom, bar = `<div class="hp-per"><div class="hp-seg" role="group" aria-label="Período">${HP_PER.map(([k, t]) => `<button type="button" class="btn ${HP.per === k ? 'pri' : ''}" data-act="hpPer" data-v="${k}" aria-pressed="${HP.per === k}">${t}</button>`).join('')}</div>
    ${N ? `<b class="hp-pl">${esc(N.periodo.etiqueta)}</b><div class="hp-nav"><button type="button" class="btn" data-act="hpMover" data-r="${N.anterior}">Anterior</button><button type="button" class="btn" data-act="hpMover" data-r="${N.siguiente}">Siguiente</button><button type="button" class="btn" data-act="hpMover" data-r="">Hoy</button></div>` : ''}</div>`;
  if (!N) return bar + card('', emptyState('No se pudo cargar la nómina', esc(HP.error || 'Intenta de nuevo.')));
  const sinDatos = f => f.origen === 'ninguno' && !(f.bonos > 0) && !f.pagado, F = N.filas.slice().sort((x, y) => sinDatos(x) - sinDatos(y)), pend = F.filter(f => !f.pagado);
  const acc = f => f.pagado ? `<span class="chip c-ok">Pagado</span> <button type="button" class="btn sm" data-act="hpRecibo" data-pid="${f.pagado.id}">Recibo</button>`
    : (f.origen === 'ninguno' && !(f.bonos > 0)) ? '<span class="muted">Sin marcas ni asistencia</span>' : hpPropio() ? `<button type="button" class="btn pri sm" data-act="hpPagoAbrir" data-id="${esc(f.empleado_id)}">Registrar pago</button>` : '';
  const tabla = table([
    {h: 'Persona', f: f => `<b>${esc(f.nombre)}</b><br><span class="muted">${esc(f.cargo || '—')}</span>`},
    {h: 'Trabajó', f: f => f.origen === 'ninguno' ? '<span class="muted">—</span>' : `${hpN(f.dias, f.dias % 1 ? 1 : 0)} días · ${hpN(f.horas, 1)} h<br><span class="muted">${f.origen === 'marcas' ? 'Según las marcas' : 'Según Asistencia'}${f.sin_horario ? ' · jornada de ' + hpN(N.parametros.jornada, 1) + ' h (sin horario del turno)' : ''}</span>`},
    {h: 'Valor de la hora', r: 1, f: f => hpBs(f.valor_hora) + '<br><span class="muted">extra ' + hpBs(f.valor_hora_extra) + '</span>'},
    {h: 'Horas extra', r: 1, f: f => f.horas_extra ? hpN(f.horas_extra, 1) + ' h<br><span class="muted">' + hpBs(f.extra) + '</span>' : '—'},
    {h: 'Bonos', r: 1, f: f => f.bonos ? hpBs(f.bonos) + (f.bonos_produccion ? '<br><span class="muted">producción ' + hpBs(f.bonos_produccion) + '</span>' : '') : '—'},
    {h: 'Préstamo', r: 1, f: f => f.prestamos.length ? (f.descuento_sugerido ? '−' + hpBs(f.descuento_sugerido) : '—') + `<br><span class="muted">Saldo ${hpBs(f.saldo_prestamo)}</span>` : '—'},
    {h: 'Total a pagar', r: 1, f: f => `<b>${hpBs(f.pagado ? f.pagado.neto : f.neto_sugerido)}</b>`},
    {h: '', f: acc}], F, {empty: 'No hay personas activas en Personal.', cls: 'hp-tabla', foot: `<tr class="tsum"><td>Total</td><td></td><td></td><td class="r">${hpN(N.totales.horas_extra, 1)} h<br>${hpBs(N.totales.extra)}</td><td class="r">${hpBs(N.totales.bonos)}</td><td></td><td class="r">${hpBs(N.filas.reduce((a, f) => a + (f.pagado ? f.pagado.neto : f.neto_sugerido), 0))}</td><td></td></tr>`});
  return `${bar}${HP.error ? `<p class="err" role="alert">${esc(HP.error)}</p>` : ''}${card('', tabla)}`;
}
function hpPagoAbrir(id) {
  const N = HP.nom, f = N && N.filas.find(x => x.empleado_id === id); if (!f) return;
  const pr = f.prestamos, sug = f.descuento_sugerido; HP.pm = {id, f};
  const linea = (t, v, neg) => v ? `<div class="hp-ln"><span>${t}</span><b>${neg ? '−' : ''}${hpBs(v)}</b></div>` : '';
  modal('Registrar pago · ' + esc(f.nombre), `<div class="form hp-pm"><p class="hp-sub"><b>${esc(N.periodo.etiqueta)}</b> · ${esc(f.cargo || '')}</p>
    ${linea(f.pago_por === 'hora' ? 'Pago base (' + hpN(f.horas, 1) + ' h)' : 'Pago base (' + hpN(f.dias, f.dias % 1 ? 1 : 0) + ' días)', f.base)}${linea('Horas extra (' + hpN(f.horas_extra, 1) + ' h)', f.extra)}${linea('Bonos', f.bonos)}${linea('Deducciones de ley', f.ley, 1)}
    ${pr.length ? `<div class="hp-prest"><label class="toggle"><input type="checkbox" id="hp-dc" ${sug > 0 ? 'checked' : ''}>Descontar la cuota del préstamo</label>
      <p class="muted">${pr.map(p => esc(p.id) + ': cuota ' + hpBs(p.cuota_bs) + ' · quedan ' + hpN(p.restan, p.restan % 1 ? 1 : 0) + (p.restan === 1 ? ' cuota' : ' cuotas')).join(' · ')} · saldo ${hpBs(f.saldo_prestamo)}</p>
      <label class="fld">Monto a descontar (Bs)<input type="number" id="hp-dm" inputmode="decimal" min="0" step="0.01" max="${f.saldo_prestamo}" value="${sug}"></label></div>` : ''}
    <p class="hp-neto">Neto a pagar <b id="hp-nt">${hpBs(f.neto_sugerido)}</b></p>
    <div class="row2"><label class="fld">Fecha del pago<input type="date" id="hp-f" value="${N.hoy}"></label><label class="fld">Forma de pago<select id="hp-fo"><option>Efectivo</option><option>Transferencia</option><option>Pago móvil</option></select></label></div>
    <label class="fld">Nota (opcional)<input type="text" id="hp-nota" maxlength="200" autocomplete="off"></label>
    <p class="err" id="hp-e" role="alert" hidden></p><div class="btnrow"><button type="button" class="btn pri" id="hp-ok" data-act="hpPagoGuardar">Confirmar pago</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`);
  hpPmNeto();
}
/* Vista previa del neto al cambiar el descuento (el servidor vuelve a calcular y validar todo al confirmar) */
function hpPmNeto() {
  const pm = HP.pm; if (!pm) return; const f = pm.f, dc = document.getElementById('hp-dc'), dm = document.getElementById('hp-dm'), nt = document.getElementById('hp-nt'), e = document.getElementById('hp-e'), ok = document.getElementById('hp-ok'); if (!nt) return;
  const d = dc && dc.checked ? (dm && dm.value !== '' ? +dm.value : f.descuento_sugerido) : 0; let msg = '';
  if (!(d >= 0)) msg = 'El descuento debe ser un monto igual o mayor que cero.'; else if (d > f.saldo_prestamo + 0.005) msg = 'No se puede descontar más de lo que queda del préstamo (' + hpBs(f.saldo_prestamo) + ').'; else if (d > f.bruto + 0.005) msg = 'El descuento no puede ser mayor que el pago.';
  nt.textContent = hpBs(Math.max(0, f.bruto - (d > 0 ? d : 0)));
  if (e && !pm.srv) { e.textContent = msg; e.hidden = !msg; } if (ok) ok.disabled = !!msg;
}
async function hpPagoGuardar() {
  const pm = HP.pm, N = HP.nom; if (!pm || !N || HP.busy.pago) return; const g = k => (document.getElementById(k) || {}).value || '', e = document.getElementById('hp-e'), dc = document.getElementById('hp-dc');
  HP.busy.pago = true; pm.srv = false; e.hidden = true;
  try {
    const r = await hpApi('POST', '/pagos', {empleado_id: pm.id, periodo: N.periodo.tipo, ref: N.periodo.desde, descontar: !!(dc && dc.checked), monto_descuento: dc && dc.checked ? g('hp-dm') : undefined, fecha: g('hp-f'), forma: g('hp-fo'), nota: g('hp-nota')});
    closeModal(); HP.pm = null; toast('Pago registrado: ' + esc(r.nombre) + ', ' + hpBs(r.neto) + '.'); HP.nomClave = ''; HP.resTs = 0; hpCargarNom(); hpRecibo(r);
  } catch (er) {
    pm.srv = true; e.innerHTML = esc(er.message) + (er.datos && er.datos.pago_id ? ` <button type="button" class="btn sm" data-act="hpRecibo" data-pid="${er.datos.pago_id}">Ver el recibo</button>` : ''); e.hidden = false;
  } finally { delete HP.busy.pago; }
}
function hpRecibo(r) {
  const ln = (t, v, neg) => v ? [t, (neg ? '−' : '') + hpBs(v)] : null, d = r.detalle || {};
  const filas = [ln('Pago base (' + (d.origen === 'marcas' ? 'según las marcas' : 'según Asistencia') + ')', r.base), ln('Horas extra (' + hpN(d.horas_extra, 1) + ' h)', r.extra), ln('Bonos', r.bonos), ln('Deducciones de ley', r.ley, 1), ln('Préstamo descontado', r.descuento_prestamo, 1)].filter(Boolean);
  modal('Recibo de pago · ' + esc(r.nombre), `<div class="doc" id="doc-print"><div class="dh"><div class="dh-id">${logoImg('doc-logo')}<div><h3>El Maná JL</h3><p>Recibo de pago de nómina</p></div></div><div style="text-align:right"><p class="mono">N.º ${r.id}</p><p>${esc(r.periodo_txt)}</p></div></div>
    <div class="meta"><div><b>Empleado</b>${esc(r.nombre)}</div><div><b>Cédula</b>${esc(r.cedula) || '________________'}</div><div><b>Cargo</b>${esc(r.cargo) || '—'}</div><div><b>Área</b>${esc(hpArea(r.area))}</div></div>
    ${table([{h: 'Concepto', f: x => x[0]}, {h: 'Monto', r: 1, f: x => x[1]}], filas, {foot: `<tr class="tsum"><td>Neto a pagar</td><td class="r">${hpBs(r.neto)}</td></tr>`})}
    <p style="margin-top:8px">Período del ${hpFecha(r.desde)} al ${hpFecha(r.hasta)}. Pagado el ${hpFecha(r.fecha)} · ${esc(r.forma)}, en bolívares.${r.nota ? ' Nota: ' + esc(r.nota) : ''}</p><div class="firmas"><div>Firma del empleado</div><div>Firma de Administración</div></div></div>${docBar('Recibo de pago ' + r.nombre)}`);
}

/* ---------- Pestañas de Nómina y franja de resumen (siempre visible arriba) ---------- */
const HP_TABS = [['rh-planta', 'En planta hoy'], ['personal', 'Personas'], ['asistencia', 'Asistencia'], ['rh-pagar', 'Nómina'], ['prestamos', 'Préstamos']];
const hpTabsOn = () => S.rol === 'rrhh' || S.rol === 'dueno';
function hpResCargar() {
  const k = hpClave(); if (HP.resCarg) return; HP.resCarg = true;
  hpApi('GET', '/resumen?periodo=' + HP.per + (HP.ref ? '&ref=' + HP.ref : '')).then(d => { HP.res = d; HP.resClave = k; }).catch(e => { console.error(e); HP.res = null; HP.resClave = k; })
    .finally(() => { HP.resCarg = false; HP.resTs = Date.now(); if (hpTabsOn() && HP_TABS.some(t => t[0] === S.route)) render(); });
}
function hpCab(act) {
  if (HP.resRol !== S.rol) { HP.resRol = S.rol; HP.res = null; HP.resClave = ''; }
  if (!HP.resCarg && (HP.resClave !== hpClave() || Date.now() - (HP.resTs || 0) > 5000)) hpResCargar();
  const R = HP.res, ok = R && HP.resClave === hpClave(), v = f => ok ? f(R) : '…', pt = ok ? R.en_planta.por_turno : {};
  const c = (t, n, s, tono) => '<div class="rh-c' + (tono ? ' rh-' + tono : '') + '"><span>' + t + '</span><b>' + n + '</b><small>' + (s || '&nbsp;') + '</small></div>';
  return '<div class="rh-cab"><div class="rh-franja">' + c('Personal activo hoy', v(r => r.en_planta.total), (ok ? 'Mañana ' + (pt['Mañana'] || 0) + ' · Tarde ' + (pt['Tarde'] || 0) + '<br>' : '') + 'sin choferes ni administración') +
    c('Total a pagar', v(r => hpBs(r.nomina.total_pagar)), ok ? esc(R.periodo.etiqueta) : '') + c('Préstamos activos', v(r => r.prestamos.activos), ok ? 'Saldo ' + hpBs(R.prestamos.saldo_bs) : '') +
    c('Pagos pendientes', v(r => r.nomina.pendientes), ok ? 'de ' + R.nomina.personas + (R.nomina.personas === 1 ? ' persona' : ' personas') : '', ok && R.nomina.pendientes > 0 ? 'amb' : ok ? 'ver' : '') + '</div></div>';
}

Object.assign(PERM_DEF, {'rh-planta': 'rrhh:2', 'rh-pagar': 'rrhh:2'});
Object.assign(SCREENS, {
  'rh-planta': {mod: 'adm', g: 'En planta', t: 'En planta hoy', s: 'En planta hoy', ic: 'users', r: scrPlanta},
  'rh-pagar': {mod: 'adm', g: 'En planta', t: 'Pagar nómina', s: 'Pagar nómina', ic: 'coins', r: scrPagar}
});
ROLE_HOME.rrhh = 'rh-planta';
S.perm = permInit();
Object.assign(ACT_REQ, {hpMarcar: ['rh-planta', 2], hpPagoAbrir: ['rh-pagar', 2], hpPagoGuardar: ['rh-pagar', 2]});
Object.assign(ACT_LBL, {hpMarcar: 'marcar entradas y salidas', hpPagoAbrir: 'registrar pagos de nómina', hpPagoGuardar: 'registrar pagos de nómina'});
['hpMarcar', 'hpPagoGuardar'].forEach(k => WRITE_ACTS.add(k));
Object.assign(ACT, {
  hpMarcar: el => hpMarcar(el), hpPagoAbrir: el => hpPagoAbrir(el.dataset.id), hpPagoGuardar: () => hpPagoGuardar(),
  hpPer: el => { HP.per = el.dataset.v; HP.ref = null; HP.error = ''; render(); }, hpMover: el => { HP.ref = el.dataset.r || null; HP.error = ''; render(); },
  hpRecibo: async el => { try { hpRecibo(await hpApi('GET', '/pagos/' + el.dataset.pid)); } catch (e) { toast(esc(e.message), 'err'); } }
});

/* Pestaña Préstamos: solo lectura, los préstamos que aún tienen cuotas por pagar */
function hpPrestamos() {
  const L = (S.prestamos || []).filter(p => p.pagadas < p.cuotas).slice().reverse(), cuota = p => p.monto / p.cuotas * p.tasa, saldo = p => (p.cuotas - p.pagadas) * cuota(p);
  return card('Préstamos activos', table([
    {h: 'Persona', f: p => '<b>' + esc(emp(p.emp).n) + '</b><br><span class="muted">' + esc(p.motivo || '') + '</span>'},
    {h: 'Cuota', r: 1, f: p => bs(cuota(p))}, {h: 'Pagadas', r: 1, f: p => p.pagadas + ' de ' + p.cuotas}, {h: 'Saldo', r: 1, f: p => '<b>' + bs(saldo(p)) + '</b>'}], L, {empty: 'No hay préstamos activos.'}));
}
{ const sc = SCREENS.prestamos; if (sc) { const f = sc.r; sc.r = function () { return hpTabsOn() ? hpPrestamos() : f.apply(this, arguments); }; } }
/* La barra de pestañas ahora es la de «Personal» (front/pantallas/pantallas.js); aquí solo queda la franja de resumen, para Nómina y Gerencia */
window.hpCabUni = k => hpTabsOn() && HP_TABS.some(t => t[0] === k) ? hpCab(k) : '';
