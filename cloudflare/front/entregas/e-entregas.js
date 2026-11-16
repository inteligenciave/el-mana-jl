/* Pantalla «Entregas con foto» (Despachos): subir la foto que manda el transporte, ver miniaturas, ampliar, confirmar o rechazar,
   y la lista de facturas y notas con «entrega sin verificar». */
const E_TABS = [['SUBIDA', 'Por confirmar'], ['SIN', 'Sin verificar'], ['CONFIRMADA', 'Confirmadas'], ['RECHAZADA', 'Rechazadas'], ['LLEG', 'Del cliente']];
const E_CHIP = {SUBIDA: ['warn', 'Por confirmar'], CONFIRMADA: ['ok', 'Confirmada'], RECHAZADA: ['crit', 'Rechazada']};

async function eCargar() {
  if (EN.cargando) return; EN.cargando = true;
  try { [EN.lista, EN.sin, EN.lleg] = await Promise.all([eApi('GET', '/'), eApi('GET', '/sin-verificar'), eApi('GET', '/llegadas')]); EN.err = null; }
  catch (e) { EN.err = e; EN.lista = EN.lista || []; EN.sin = EN.sin || []; EN.lleg = EN.lleg || []; }
  finally { EN.cargando = false; }
  render();
}
const eConteo = k => k === 'LLEG' ? (EN.lleg || []).length : k === 'SIN' ? (EN.sin || []).length : (EN.lista || []).filter(x => x.estado === k).length;
const E_DEF_ENT = [{tipo: 'Documento', valores: x => x.nro, detalle: x => x.cliente}, {tipo: 'Cliente', valores: x => x.cliente, detalle: x => x.nro}, {tipo: 'RIF', valores: x => x.rif, detalle: x => x.cliente}];
const eFilas = () => Busca.filtrar(EN.tab === 'LLEG' ? (EN.lleg || []) : EN.tab === 'SIN' ? (EN.sin || []) : (EN.lista || []).filter(x => x.estado === EN.tab), EN.q, Busca.textosDe(E_DEF_ENT));
const ePorPagina = () => innerWidth >= 1000 ? Math.max(3, Math.min(8, Math.floor((innerHeight - 360) / 70))) : 5;

/* Miniaturas: solo las de la página visible, en una petición liviana (~5 KB cada una) */
async function eMinis(ids) {
  const faltan = ids.filter(i => !(i in EN.minis)); if (!faltan.length) return;
  faltan.forEach(i => { EN.minis[i] = null; });
  try { const r = await eApi('GET', '/minis' + eQS({ids: faltan.join(',')})); for (const i of faltan) EN.minis[i] = r[i] || ''; } catch (e) { faltan.forEach(i => { delete EN.minis[i]; }); return; }
  for (const i of faltan) document.querySelectorAll(`.e-th[data-mini="${i}"]`).forEach(b => { if (EN.minis[i]) b.innerHTML = `<img alt="Miniatura de la entrega" src="data:image/jpeg;base64,${EN.minis[i]}">`; });
}
const eThumb = x => `<button type="button" class="e-th" data-act="eVerFoto" data-id="${x.id}" data-mini="${x.id}" aria-label="Ampliar la foto de ${etxt(x.nro)}">${EN.minis[x.id] ? `<img alt="Miniatura de la entrega" src="data:image/jpeg;base64,${EN.minis[x.id]}">` : ic('camera', 22)}</button>`;

const eTextoLlegada = l => 'El cliente recibió <b>' + l.recibidos + '</b>' + (l.despachados != null ? ' de ' + l.despachados : '') + ' bultos' + (l.coincide === false ? ' · <b>no coincide</b>' : '');
function eFilaLleg(x) {
  return `<li class="e-row"><button type="button" class="e-th" data-act="eVerLlegada" data-id="${x.id}" aria-label="Ver la foto que subió el cliente de ${etxt(x.nro)}">${ic('camera', 22)}</button><div class="e-b"><p class="e-n"><b>${etxt(x.nro)}</b> <span class="muted">${x.tipo === 'NOTA_ENTREGA' ? 'Nota de entrega' : 'Factura'}</span></p><p class="e-s">${etxt(x.cliente)}</p>
    <p class="e-s">${eTextoLlegada(x)} · ${eTs(x.foto_ts)}${x.arranco_reloj ? ' · su foto arrancó el plazo' : ''}</p></div>
    <div class="e-a">${x.coincide === false ? chip('No coincide', 'crit') : x.coincide ? chip('Coincide', 'ok') : chip('Sin comparar', 'warn')}<button type="button" class="btn sm" data-act="eVerLlegada" data-id="${x.id}">Ver foto</button></div></li>`;
}
function eFilaEntrega(x) {
  const [tono, txt] = E_CHIP[x.estado], puedeConf = lvl('e-entregas') >= 3;
  return `<li class="e-row">${eThumb(x)}<div class="e-b"><p class="e-n"><b>${etxt(x.nro)}</b> <span class="muted">${x.tipo === 'NOTA_ENTREGA' ? 'Nota de entrega' : 'Factura'}</span></p><p class="e-s">${etxt(x.cliente)}</p><p class="e-s">Entrega ${eFechaHora(x.fecha_hora)} · subió ${etxt(x.subido_rol)} · ${x.kb} KB</p>${x.llegada ? `<p class="e-s">${eTextoLlegada(x.llegada)}</p>` : ''}</div>
    <div class="e-a">${chip(txt, tono)}${x.estado === 'SUBIDA' && puedeConf ? `<button type="button" class="btn sm pri" data-act="eConfirmar" data-id="${x.id}">Confirmar</button>` : ''}<button type="button" class="btn sm" data-act="eVerFoto" data-id="${x.id}">Ver</button></div></li>`;
}
function eFilaSin(x) {
  const puedeSubir = lvl('e-entregas') >= 2;
  return `<li class="e-row"><span class="e-th e-th0">${ic('truck', 22)}</span><div class="e-b"><p class="e-n"><b>${etxt(x.nro)}</b> <span class="muted">${x.tipo === 'NOTA_ENTREGA' ? 'Nota de entrega' : 'Factura'} · ${eUsd(x.total)}</span></p><p class="e-s">${etxt(x.cliente)}</p>
    <p class="e-s">Emitida ${fdl(x.fecha_emision)} (hace ${x.dias_sin_foto} d)${x.ultima === 'RECHAZADA' ? ` · foto rechazada: ${etxt(x.motivo || '')}` : ''}</p></div>
    <div class="e-a">${chip('Entrega sin verificar', 'warn')}${puedeSubir ? `<button type="button" class="btn sm pri" data-act="eElegirDoc" data-id="${x.id_documento}">Subir foto</button>` : ''}</div></li>`;
}
function eSubirCard() {
  const U = EN.up, puede = lvl('e-entregas') >= 2;
  if (!puede) return card('Subir foto de entrega', '<p class="hint">Tu rol solo consulta las entregas. La foto la sube Despachos, el Jefe de producción o el Gerente.</p>');
  let cuerpo;
  if (!U.doc) {
    const lista = Busca.filtrar(EN.sin || [], U.q, Busca.textosDe(E_DEF_ENT)).slice(0, 5);
    cuerpo = `<label class="fld">1. Busca la factura o nota<input type="search" aria-label="Buscar la factura o nota de la entrega" ${Busca.atr('e-doc')} value="${esc(U.q)}" placeholder="Número, cliente o RIF"></label>
      <ul class="v-pk-list" id="e-doc-lista">${eDocItems(lista)}</ul>`;
  } else {
    const d = (EN.sin || []).find(x => x.id_documento === U.doc.id_documento) || U.doc;
    cuerpo = `<div class="e-doc"><p><b>${etxt(d.nro)}</b> · ${etxt(d.cliente)}</p><p class="hint">${d.tipo === 'NOTA_ENTREGA' ? 'Nota de entrega' : 'Factura'} · ${eUsd(d.total)}</p><button type="button" class="btn sm ghost" data-act="eCambiarDoc">Cambiar documento</button></div>
      <label class="fld e-file">2. Foto que mandó el transporte<input type="file" accept="image/*" data-act-change="eFoto" aria-label="Elegir la foto de entrega"></label>
      ${U.ocupado ? '<p class="hint">Comprimiendo la foto…</p>' : ''}
      ${U.aviso ? `<p class="err" role="alert">${etxt(U.aviso)}</p>` : ''}
      ${U.foto ? `<div class="e-prev"><img alt="Vista previa de la foto ya comprimida" src="${U.vista}"><p class="e-size" aria-live="polite"><b>${eBytes(U.antes)} → ${eBytes(U.despues)}</b></p></div>
      <label class="fld">3. Hora real de la entrega (vacío = ahora)<input type="datetime-local" data-ek="up.hora" value="${esc(U.hora)}"></label>
      
      <div class="btnrow"><button type="button" class="btn pri" data-act="eSubir" ${EN.busy.subir ? 'disabled' : ''}>${ic('check', 16)}Guardar la entrega</button></div>` : ''}`;
  }
  return card('Subir foto de entrega', cuerpo);
}
const eDocItems = lista => lista.length ? lista.map(x => `<li><button type="button" class="v-pk-b" data-act="eElegirDoc" data-id="${x.id_documento}"><b>${etxt(x.nro)}</b><span>${etxt(x.cliente)} · ${eUsd(x.total)} · ${x.tipo === 'NOTA_ENTREGA' ? 'nota' : 'factura'}</span></button></li>`).join('') : '<li class="hint" style="padding:8px">No hay documentos sin foto con ese texto.</li>';

function scrEntregas() {
  return ePantalla(() => {
    if (EN.lista === null) { eCargar(); return card('', emptyState('Cargando…', 'Un momento.')); }
    if (EN.err && !EN.lista.length && !EN.sin.length) return card('', emptyState('No se pudo cargar', etxt(EN.err.message), '<button type="button" class="btn pri" data-act="eRecargar">Reintentar</button>'));
    const filas = eFilas(), n = ePorPagina(), pags = Math.max(1, Math.ceil(filas.length / n)); EN.pag = Math.min(EN.pag, pags - 1);
    const vis = filas.slice(EN.pag * n, EN.pag * n + n), sin = (EN.sin || []).length;
    setTimeout(() => eMinis(EN.tab === 'SIN' || EN.tab === 'LLEG' ? [] : vis.map(x => x.id)), 0);
    const aviso = sin ? `<div class="v-alerta v-aviso" role="status">${ic('alert', 18)}<span><b>${sin} factura(s) o nota(s) con entrega sin verificar.</b> Sin la foto de entrega, el plazo de crédito del cliente no arranca. Despachos: pídele la foto al transporte.</span></div>` : '';
    const tabs = E_TABS.map(([k, t]) => `<button type="button" class="v-cat" data-act="eTab" data-v="${k}" aria-pressed="${EN.tab === k}">${t} (${eConteo(k)})</button>`).join('');
    const lista = vis.length ? `<ul class="e-lista">${vis.map(x => EN.tab === 'LLEG' ? eFilaLleg(x) : EN.tab === 'SIN' ? eFilaSin(x) : eFilaEntrega(x)).join('')}</ul>` : emptyState(EN.q ? 'Nada coincide' : EN.tab === 'SIN' ? 'Todo verificado' : EN.tab === 'LLEG' ? 'Sin avisos de clientes' : 'Sin entregas aquí', EN.q ? 'Prueba con otro texto.' : EN.tab === 'SIN' ? 'No hay facturas ni notas esperando foto.' : EN.tab === 'LLEG' ? 'Cuando un cliente avise que le llegó el pedido, verás aquí su foto y el total de bultos.' : 'Cuando suban fotos, aparecerán en esta lista.');
    const pie = filas.length > n ? `<div class="e-pag"><button type="button" class="btn sm" data-act="ePag" data-d="-1" ${EN.pag === 0 ? 'disabled' : ''}>Anterior</button><span>Página ${EN.pag + 1} de ${pags} · ${filas.length} en total</span><button type="button" class="btn sm" data-act="ePag" data-d="1" ${EN.pag >= pags - 1 ? 'disabled' : ''}>Siguiente</button></div>` : '';
    return `${ph('Planta · salida', 'Entregas con foto', '', '')}${aviso}
    <div class="e-2c">${eSubirCard()}${card('Entregas', `<div class="e-tabs">${tabs}</div><label class="fld bq-f">Buscar<input type="search" aria-label="Buscar entregas" ${Busca.atr('e-ent')} value="${esc(EN.q)}" placeholder="Número, cliente o RIF"></label>${lista}${pie}`)}</div>`;
  });
}

/* ---------- Ampliación ---------- */
async function eVerLlegada(id) {
  const x = (EN.lleg || []).find(e => e.id === id); if (!x) return;
  modal('Llegada de ' + etxt(x.nro), `<div class="e-big"><div class="e-bigi" id="e-bigi"><p class="hint">Cargando la foto…</p></div>
    <dl class="v-dl"><div><dt>Cliente</dt><dd>${etxt(x.cliente)}</dd></div><div><dt>Bultos que dice haber recibido</dt><dd>${x.recibidos}${x.despachados != null ? ' de ' + x.despachados + ' despachados' : ''}</dd></div><div><dt>Foto subida por</dt><dd>${etxt(x.subido_por)} · ${eTs(x.foto_ts)}</dd></div></dl></div>`);
  try { const r = await eApi('GET', '/llegadas/' + id + '/foto'); const box = $('#e-bigi'); if (box) box.innerHTML = `<img alt="Foto de la llegada de ${etxt(x.nro)}" src="data:image/jpeg;base64,${r.foto}">`; } catch (e) { eErr(e); }
}
async function eVerFoto(id) {
  const x = (EN.lista || []).find(e => e.id === id); if (!x) return;
  const cab = f => `<div class="e-big"><div class="e-bigi" id="e-bigi">${EN.fotos[id] ? `<img alt="Foto de la entrega de ${etxt(x.nro)}" src="data:image/jpeg;base64,${EN.fotos[id]}">` : (EN.minis[id] ? `<img class="e-borr" alt="Cargando foto" src="data:image/jpeg;base64,${EN.minis[id]}"><p class="hint e-carg">Cargando la foto…</p>` : '<p class="hint">Cargando la foto…</p>')}</div>
    <dl class="v-dl"><div><dt>Documento</dt><dd>${etxt(x.nro)}</dd></div><div><dt>Cliente</dt><dd>${etxt(x.cliente)}</dd></div><div><dt>Hora de la entrega</dt><dd>${eFechaHora(x.fecha_hora)}</dd></div><div><dt>Subida por</dt><dd>${etxt(x.subido_rol)} · ${eTs(x.subido_ts)}</dd></div>
    <div><dt>Estado</dt><dd>${chip(E_CHIP[x.estado][1], E_CHIP[x.estado][0])}</dd></div>${x.confirmado_rol ? `<div><dt>${x.estado === 'RECHAZADA' ? 'Rechazada por' : 'Confirmada por'}</dt><dd>${etxt(x.confirmado_rol)}</dd></div>` : ''}</dl>
    ${x.motivo_rechazo ? `<p class="hint">Motivo del rechazo: ${etxt(x.motivo_rechazo)}</p>` : ''}
    <div class="btnrow">${x.estado === 'SUBIDA' && lvl('e-entregas') >= 3 ? `<button type="button" class="btn pri" data-act="eConfirmar" data-id="${id}">Confirmar entrega</button>` : ''}${['SUBIDA', 'CONFIRMADA'].includes(x.estado) && lvl('e-entregas') >= 3 ? `<button type="button" class="btn" data-act="eRechazar" data-id="${id}">Rechazar foto</button>` : ''}</div></div>`;
  modal('Entrega ' + etxt(x.nro), cab());
  if (!EN.fotos[id]) {
    try {
      const r = await eApi('GET', '/' + id + '/foto'); const k = Object.keys(EN.fotos); if (k.length >= 6) delete EN.fotos[k[0]]; EN.fotos[id] = r.foto;
      const box = $('#e-bigi'); if (box) box.innerHTML = `<img alt="Foto de la entrega de ${etxt(x.nro)}" src="data:image/jpeg;base64,${r.foto}">`;
    } catch (e) { eErr(e); }
  }
}
function eRechazarModal(id) {
  const x = (EN.lista || []).find(e => e.id === id); if (!x) return;
  modal('Rechazar la foto de ' + etxt(x.nro), `<div class="form"><p>El plazo de crédito deja de correr y el documento vuelve a quedar con <b>entrega sin verificar</b> hasta subir otra foto.</p>
    <label class="fld">Motivo<input type="text" id="e-motivo" maxlength="200" placeholder="Por ejemplo: la foto no se ve o es de otra entrega"></label><p class="err" id="e-rm-e" role="alert" hidden></p>
    <div class="btnrow"><button type="button" class="btn pri" id="e-rm-ok">Rechazar</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`);
  $('#e-motivo').focus();
  $('#e-rm-ok').addEventListener('click', async () => {
    const e = $('#e-rm-e'); e.hidden = true;
    try { await eApi('POST', '/' + id + '/rechazar', {motivo: $('#e-motivo').value}); closeModal(); toast('Foto rechazada.'); delete EN.fotos[id]; await eCargar(); }
    catch (er) { e.textContent = er.message; e.hidden = false; }
  });
}
