/* Cobranza: plazos desde la entrega, reclamos «no recibí esto» y Ajustes de crédito (solo Gerente). */
const E_EST = {TRAMO1: ['ok', 'Descuento A'], TRAMO2: ['warn', 'Descuento B'], VENCIDA: ['crit', 'Vencida'], PAUSADA: ['n', 'En pausa']};
const E_FILTROS = [['TODOS', 'Todos'], ['TRAMO1', 'Descuento A'], ['TRAMO2', 'Descuento B'], ['VENCIDA', 'Vencidas'], ['PAUSADA', 'En pausa']];

async function ePlazosCargar() {
  if (EN.pl.cargando) return; EN.pl.cargando = true;
  try { const [d, ds] = await Promise.all([eApi('GET', '/plazos'), eApi('GET', '/disputas')]); EN.pl.data = d; EN.pl.disputas = ds; EN.pl.err = null; }
  catch (e) { EN.pl.err = e; EN.pl.data = EN.pl.data || {documentos: [], ajustes: {faltantes: []}, resumen: {}, sin_verificar: 0}; EN.pl.disputas = EN.pl.disputas || []; }
  finally { EN.pl.cargando = false; }
  render();
}
const E_DEF_PLZ = [{tipo: 'Documento', valores: x => x.nro, detalle: x => x.cliente}, {tipo: 'Cliente', valores: x => x.cliente, detalle: x => x.nro}, {tipo: 'RIF', valores: x => x.rif, detalle: x => x.cliente}];
const ePlzFilas = () => Busca.filtrar((EN.pl.data.documentos || []).filter(d => EN.pl.f === 'TODOS' || d.estado === EN.pl.f), EN.pl.q, Busca.textosDe(E_DEF_PLZ));
const eRestante = d => d.estado === 'VENCIDA' ? `vencida hace ${d.dias_vencida} d` : d.estado === 'PAUSADA' ? 'plazo detenido' : ED.textoRestante(d.restante_ms);
const ePct = d => d.descuento_pct != null ? '− ' + N2.format(d.descuento_pct) + ' %' : d.recargo_pct != null ? '+ ' + N2.format(d.recargo_pct) + ' %' : '<span class="muted">sin cargar</span>';

function scrPlazos() {
  return ePantalla(() => {
    const P = EN.pl; if (!P.data) { ePlazosCargar(); return card('', emptyState('Cargando…', 'Un momento.')); }
    const d = P.data, abiertas = (P.disputas || []).filter(x => x.estado === 'ABIERTA').length, falt = d.ajustes.faltantes || [];
    const avisos = (falt.length ? `<div class="v-alerta v-aviso" role="status">${ic('alert', 18)}<span><b>Faltan datos del Gerente: ${falt.join(', ')}.</b> Mientras estén vacíos se muestran los días y «vencida», pero no se aplica descuento ni recargo.${lvl('e-ajustes') >= 3 ? ' <a class="lnk" href="#e-ajustes">Cargarlos ahora</a>' : ''}</span></div>` : '')
      + (d.sin_verificar ? `<div class="v-alerta v-aviso" role="status">${ic('alert', 18)}<span><b>${d.sin_verificar} documento(s) con entrega sin verificar:</b> su plazo no ha arrancado. Avisa a Despachos para que suban la foto.</span></div>` : '');
    const tabs = `<button type="button" class="v-cat" data-act="ePlzTab" data-v="plazos" aria-pressed="${P.tab === 'plazos'}">Plazos (${d.documentos.length})</button><button type="button" class="v-cat" data-act="ePlzTab" data-v="reclamos" aria-pressed="${P.tab === 'reclamos'}">Reclamos (${abiertas} abiertos)</button>`;
    let cuerpo;
    if (P.tab === 'reclamos') {
      const ds = P.disputas || [], n = innerWidth >= 1000 ? 5 : 4, pags = Math.max(1, Math.ceil(ds.length / n)); P.pagR = Math.min(P.pagR || 0, pags - 1);
      cuerpo = ds.length ? `<ul class="e-lista">${ds.slice(P.pagR * n, P.pagR * n + n).map(x => `<li class="e-row"><span class="e-th e-th0">${ic('alert', 22)}</span><div class="e-b"><p class="e-n"><b>${etxt(x.nro)}</b> <span class="muted">${etxt(x.cliente)} · ${eUsd(x.total)}</span></p>
        <p class="e-s">«No recibí esto» · ${eTs(x.creado_ts)}${x.nota_cliente ? ' · ' + etxt(x.nota_cliente) : ''}</p>${x.estado === 'RESUELTA' ? `<p class="e-s">Resuelto por ${etxt(x.resuelto_rol)}: ${x.resolucion === 'NO_ENTREGADA' ? 'no se entregó (entrega rechazada)' : 'la entrega era válida (plazo reanudado)'} · ${etxt(x.nota_resolucion || '')}</p>` : ''}</div>
        <div class="e-a">${x.estado === 'ABIERTA' ? chip('Plazo en pausa', 'warn') + (lvl('e-plazos') >= 2 ? `<button type="button" class="btn sm pri" data-act="eResolver" data-id="${x.id}">Resolver</button>` : '') : chip('Resuelto', 'ok')}</div></li>`).join('')}</ul>${ds.length > n ? `<div class="e-pag"><button type="button" class="btn sm" data-act="ePagR" data-d="-1" ${P.pagR === 0 ? 'disabled' : ''}>Anterior</button><span>Página ${P.pagR + 1} de ${pags}</span><button type="button" class="btn sm" data-act="ePagR" data-d="1" ${P.pagR >= pags - 1 ? 'disabled' : ''}>Siguiente</button></div>` : ''}`
        : emptyState('Sin reclamos', 'Cuando un cliente pulse «no recibí esto» en su portal, aparecerá aquí y su plazo se pausa.');
    } else {
      const filas = ePlzFilas(), n = innerWidth >= 1000 ? Math.max(3, Math.min(8, Math.floor((innerHeight - 470) / 50))) : 5, pags = Math.max(1, Math.ceil(filas.length / n)); P.pag = Math.min(P.pag, pags - 1);
      const r = d.resumen || {}, stats = `<div class="v-stats">${stat('Descuento A', r.tramo1 || 0, 'hasta ' + d.ajustes.dias_tramo1 + ' días')}${stat('Descuento B', r.tramo2 || 0, 'hasta ' + d.ajustes.dias_tramo2 + ' días')}${stat('Vencidas', r.vencidas || 0, 'pasaron ' + d.ajustes.dias_tramo2 + ' días', (r.vencidas || 0) ? 'crit' : '')}${stat('En pausa', r.pausadas || 0, 'reclamo abierto')}${stat('Sin verificar', r.sin_verificar || 0, 'sin foto')}</div>`;
      const filtros = E_FILTROS.map(([k, t]) => `<button type="button" class="v-cat" data-act="ePlzFiltro" data-v="${k}" aria-pressed="${P.f === k}">${t}</button>`).join('');
      cuerpo = `${stats}<div class="e-tabs">${filtros}</div><label class="fld bq-f">Buscar<input type="search" aria-label="Buscar en los plazos" ${Busca.atr('e-plz')} value="${esc(P.q)}" placeholder="Número, cliente o RIF"></label>
        ${table([{h: 'Documento', f: x => `<b>${etxt(x.nro)}</b><br><span class="muted">${etxt(x.cliente)}</span>`}, {h: 'Entrega', f: x => eFechaHora(x.fecha_hora)}, {h: 'Días', r: 1, f: x => x.dias}, {h: 'Estado', f: x => chip(E_EST[x.estado][1], E_EST[x.estado][0]) + `<br><span class="muted">${eRestante(x)}</span>`},
          {h: 'Ajuste', r: 1, f: ePct}, {h: 'Saldo', r: 1, f: x => eUsd(x.saldo)}, {h: 'Pagar hoy', r: 1, f: x => `<b>${eUsd(x.pagar_hoy)}</b>`}], filas.slice(P.pag * n, P.pag * n + n), {empty: 'Ningún documento con este filtro.'})}
        ${filas.length > n ? `<div class="e-pag"><button type="button" class="btn sm" data-act="ePagP" data-d="-1" ${P.pag === 0 ? 'disabled' : ''}>Anterior</button><span>Página ${P.pag + 1} de ${pags} · ${filas.length} en total</span><button type="button" class="btn sm" data-act="ePagP" data-d="1" ${P.pag >= pags - 1 ? 'disabled' : ''}>Siguiente</button></div>` : ''}`;
    }
    return `${ph('Ventas y liquidación', 'Plazos y reclamos de entrega', '', '')}${avisos}${card('Plazos desde la entrega', `<div class="e-tabs">${tabs}</div>${cuerpo}`, {})}`;
  });
}
function eResolverModal(id) {
  const x = (EN.pl.disputas || []).find(d => d.id === id); if (!x) return;
  modal('Resolver el reclamo de ' + etxt(x.nro), `<div class="form"><p>${etxt(x.cliente)} dice que <b>no recibió</b> este documento${x.nota_cliente ? ': «' + etxt(x.nota_cliente) + '»' : ''}. Su plazo está en pausa.</p>
    <label class="e-op"><input type="radio" name="e-res" value="ENTREGA_VALIDA" checked><span><b>La entrega sí se hizo</b><br><span class="muted">El plazo se reanuda desde donde quedó.</span></span></label>
    <label class="e-op"><input type="radio" name="e-res" value="NO_ENTREGADA"><span><b>No se entregó</b><br><span class="muted">La foto se rechaza y el documento vuelve a «entrega sin verificar».</span></span></label>
    <label class="fld">Nota (obligatoria)<input type="text" id="e-nota" maxlength="300" placeholder="Qué se averiguó con el transporte o el cliente"></label><p class="err" id="e-rs-e" role="alert" hidden></p>
    <div class="btnrow"><button type="button" class="btn pri" id="e-rs-ok">Resolver</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`);
  $('#e-nota').focus();
  $('#e-rs-ok').addEventListener('click', async () => {
    const e = $('#e-rs-e'); e.hidden = true;
    try { const r = await eApi('POST', '/disputas/' + id + '/resolver', {resolucion: document.querySelector('input[name="e-res"]:checked').value, nota: $('#e-nota').value}); closeModal(); toast(esc(r.plazo)); EN.pl.data = null; EN.lista = null; await ePlazosCargar(); }
    catch (er) { e.textContent = er.message; e.hidden = false; }
  });
}

/* ---------- Ajustes de crédito (solo Gerente) ---------- */
async function eAjustesCargar() { try { EN.aj.data = await eApi('GET', '/ajustes'); EN.aj.err = null; } catch (e) { EN.aj.err = e; EN.aj.data = {}; } render(); }
function scrAjustes() {
  return ePantalla(() => {
    const A = EN.aj; if (!A.data) { eAjustesCargar(); return card('', emptyState('Cargando…', 'Un momento.')); }
    const a = A.data, v = k => a[k] == null ? '' : a[k], puede = lvl('e-ajustes') >= 3, dis = puede ? '' : 'disabled';
    const f = (k, t, extra = '') => `<label class="fld">${t}<input type="text" inputmode="decimal" id="e-aj-${k}" value="${esc(v(k))}" ${dis} ${extra}></label>`;
    return `${ph('Ventas y liquidación', 'Ajustes de crédito', '', '')}
    ${a.faltantes && a.faltantes.length ? `<div class="v-alerta v-aviso" role="status">${ic('alert', 18)}<span><b>Sin cargar: ${a.faltantes.join(', ')}.</b> Mientras estén vacíos no se aplica ningún descuento ni recargo; solo se muestran los días y «vencida».</span></div>` : ''}
    ${card('Plazos y porcentajes', `<div class="form">
      <div class="row2">${f('dias_tramo1', 'Días del tramo 1 (descuento A)')}${f('dias_tramo2', 'Días del tramo 2 (descuento B)')}</div>
      <div class="row3">${f('descuento1_pct', 'Descuento A (%)', 'placeholder="vacío = sin descuento"')}${f('descuento2_pct', 'Descuento B (%)', 'placeholder="vacío = sin descuento"')}${f('recargo_mora_pct', 'Recargo por mora (%)', 'placeholder="vacío = sin recargo"')}</div>
      
      <p class="err" id="e-aj-e" role="alert" hidden></p>${puede ? `<div class="btnrow"><button type="button" class="btn pri" data-act="eAjustesGuardar" ${EN.busy.aj ? 'disabled' : ''}>${S.rol === 'dueno' ? 'Guardar ajustes' : 'Enviar al Gerente para aprobar'}</button></div>` : ''}</div>`)}`;
  });
}
async function eAjustesGuardar() {
  const g = k => $('#e-aj-' + k).value.trim().replace(',', '.'), err = $('#e-aj-e'); err.hidden = true;
  const b = {dias_tramo1: g('dias_tramo1'), dias_tramo2: g('dias_tramo2'), descuento1_pct: g('descuento1_pct'), descuento2_pct: g('descuento2_pct'), recargo_mora_pct: g('recargo_mora_pct')};
  const val = ED.validarAjustes(b); if (val.error) { err.textContent = val.error; err.hidden = false; return; }
  const r = await eRun('aj', () => eApi('PUT', '/ajustes', val.ajustes), x => esc(x.mensaje || 'Ajustes guardados.'));
  if (r) { EN.aj.data = null; EN.pl.data = null; }
}

/* ---------- Registro en la aplicación ---------- */
Object.assign(ICONS, {camera: '<path d="M4 8h3l1.6-2.4h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.6"/>'});
Object.assign(PERM_DEF, {'e-entregas': 'jefeprod:3 empaque:2', 'e-plazos': 'cobranza:2 adm:1 ventas:1', 'e-ajustes': 'adm:3'});
Object.assign(SCREENS, {
  'e-entregas': {mod: 'prod', g: 'Planta', t: 'Entregas con foto', s: 'Entregas', ic: 'camera', r: scrEntregas},
  'e-plazos':   {mod: 'adm', g: 'Ventas y liquidación', t: 'Plazos y reclamos de entrega', s: 'Plazos', ic: 'calendar', r: scrPlazos},
  'e-ajustes':  {mod: 'adm', g: 'Ventas y liquidación', t: 'Ajustes de crédito', s: 'Ajustes', ic: 'sliders', r: scrAjustes}
});
S.perm = permInit();
const EACT_REQ = {eSubir: ['e-entregas', 2], eFoto: ['e-entregas', 2], eConfirmar: ['e-entregas', 3], eRechazar: ['e-entregas', 3], eResolver: ['e-plazos', 2], eAjustesGuardar: ['e-ajustes', 3]};
const EACT_LBL = {eSubir: 'subir fotos de entrega', eFoto: 'subir fotos de entrega', eConfirmar: 'confirmar entregas', eRechazar: 'rechazar fotos de entrega', eResolver: 'resolver reclamos de entrega', eAjustesGuardar: 'cambiar los ajustes de crédito'};
Object.assign(ACT_REQ, EACT_REQ); Object.assign(ACT_LBL, EACT_LBL); Object.keys(EACT_REQ).forEach(k => WRITE_ACTS.add(k));

const EACT = {
  eRecargar: () => { EN.lista = null; render(); },
  eTab: el => { EN.tab = el.dataset.v; EN.pag = 0; render(); },
  ePag: el => { if (el.disabled) return; EN.pag = Math.max(0, EN.pag + (+el.dataset.d)); render(); },
  eVerFoto: el => eVerFoto(eId(el)),
  eVerLlegada: el => eVerLlegada(eId(el)),
  eElegirDoc: el => { const d = (EN.sin || []).find(x => x.id_documento === eId(el)); if (!d) return; EN.up = {...EN.up, doc: d, foto: null, mini: null, aviso: '', vista: '', hora: ''}; if (EN.tab !== 'SIN') EN.tab = EN.tab; render(); },
  eCambiarDoc: () => { EN.up = {...EN.up, doc: null, foto: null, mini: null, aviso: '', vista: '', q: ''}; render(); },
  eFoto: async el => {
    const file = el.files && el.files[0], U = EN.up; if (!file) return;
    U.aviso = ''; U.foto = null; U.ocupado = true; render();
    try { const r = await eComprimir(file); Object.assign(U, {foto: r.foto, mini: r.mini, antes: r.antes, despues: r.despues, lado: r.lado, calidad: r.calidad, vista: 'data:image/jpeg;base64,' + r.foto}); }
    catch (e) { U.aviso = e.message; }
    U.ocupado = false; render();
  },
  eSubir: async () => {
    const U = EN.up; if (!U.doc || !U.foto) return toast('Elige el documento y la foto.', 'warn');
    const b = {id_documento: U.doc.id_documento, foto: U.foto, mini: U.mini}; if (U.hora) b.fecha_hora = new Date(U.hora).toISOString();
    const r = await eRun('subir', () => eApi('POST', '/', b), x => 'Entrega de ' + esc(x.documento) + ' guardada. Su plazo de crédito corre desde ' + eFechaHora(x.fecha_hora) + '.');
    if (r) { EN.up = {doc: null, q: '', foto: null, mini: null, antes: 0, despues: 0, aviso: '', vista: '', hora: '', ocupado: false, lado: 0, calidad: 0}; EN.lista = null; EN.tab = 'SUBIDA'; EN.pag = 0; EN.pl.data = null; }
  },
  eConfirmar: async el => { const id = eId(el); const r = await eRun('conf' + id, () => eApi('POST', '/' + id + '/confirmar', {}), 'Entrega confirmada.'); if (r) { closeModal(); EN.lista = null; EN.pl.data = null; render(); } },
  eRechazar: el => eRechazarModal(eId(el)),
  ePlzTab: el => { EN.pl.tab = el.dataset.v; render(); },
  ePlzFiltro: el => { EN.pl.f = el.dataset.v; EN.pl.pag = 0; render(); },
  ePagP: el => { if (el.disabled) return; EN.pl.pag = Math.max(0, EN.pl.pag + (+el.dataset.d)); render(); },
  ePagR: el => { if (el.disabled) return; EN.pl.pagR = Math.max(0, (EN.pl.pagR || 0) + (+el.dataset.d)); render(); },
  eResolver: el => eResolverModal(eId(el)),
  eAjustesGuardar: () => eAjustesGuardar()
};
Object.assign(ACT, EACT);
document.addEventListener('input', e => { const t = e.target; if (t && t.dataset && t.dataset.ek === 'up.hora') EN.up.hora = t.value; });

/* Buscadores (cada uno busca SOLO en los datos de su pantalla) */
Busca.registrar('e-ent', {sugerir: q => Busca.sugerir(q, EN.tab === 'SIN' ? (EN.sin || []) : (EN.lista || []), E_DEF_ENT), vivo: q => { EN.q = q; EN.pag = 0; render(); }, espera: 150});
Busca.registrar('e-doc', {sugerir: q => Busca.sugerir(q, EN.sin || [], E_DEF_ENT), vivo: q => { EN.up.q = q; const ul = $('#e-doc-lista'); if (ul) ul.innerHTML = eDocItems(Busca.filtrar(EN.sin || [], q, Busca.textosDe(E_DEF_ENT)).slice(0, 5)); }, espera: 100,
  elegir: it => { const d = it.it; if (d) EACT.eElegirDoc({dataset: {id: d.id_documento}}); }});
Busca.registrar('e-plz', {sugerir: q => Busca.sugerir(q, (EN.pl.data || {documentos: []}).documentos, E_DEF_PLZ), vivo: q => { EN.pl.q = q; EN.pl.pag = 0; render(); }, espera: 150});
