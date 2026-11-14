/* Pantalla de cobro (Fase 2: liquidación). Rachell escribe el pago una sola vez; el sistema calcula el caso por días,
   la ruta (A: nota de entrega a factura · B: factura a nota de crédito o débito), el neto a cobrar y el recibo. */
const vCob = () => V.cob ||= {cid: null, cli: null, q: '', fecha: '', monto: '', banco: '', ref: '', obs: '', exonerar: false, prev: null, apl: {}};
const vNum = s => { s = String(s ?? '').trim().replace(/\s/g, ''); if (!s) return NaN; if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); return Number(s); };
const vRutaTxt = r => r === 'A' ? 'Ruta A: nota de entrega, se factura al cobrar' : r === 'B' ? 'Ruta B: factura ya emitida, se ajusta con nota' : 'Importada del Excel: se cobra el monto, sin repreciar';
const vCasoChip = d => d.error ? `<span class="chip c-crit">${vtxt(d.error)}</span>` : `<span class="chip c-${d.caso === 1 ? 'ok' : d.caso === 2 ? 'n' : 'warn'}">${vtxt(d.caso_texto)}</span>`;

/* La tasa la pone el servidor (BCV vigente en la fecha del pago): llega con las notas pendientes y aquí solo se lee. */
const vCobTasa = () => { const t = vCob().prev && vCob().prev.tasa; return t && t.valor > 0 ? t.valor : NaN; };
function vTasaAviso(t, fecha) {
  if (!t) return `<p class="v-alerta">${ic('alert', 16)}No hay tasa BCV guardada para el ${vfecha(fecha)}: no se puede registrar el pago hasta que el Dueño o Administración consulten la tasa.</p>`;
  return `<p class="v-tasa"><b>Tasa BCV: ${N2.format(t.valor)} Bs por US$ 1</b> <span class="muted">· del ${vfecha(t.fecha)}${t.fecha < fecha ? ' (la última publicada hasta esa fecha)' : ''}</span></p>${t.respaldo ? `<p class="v-alerta v-aviso">${ic('alert', 16)}Usando la última tasa guardada, del día ${vfecha(t.fecha)}: la consulta al BCV falló.</p>` : ''}`;
}
function vCobUsd() {
  const C = vCob(), bs = vNum(C.monto), t = vCobTasa();
  if (!(bs > 0) || !(t > 0)) return 0;
  return Math.round(Math.round(bs * 100) / t) / 100;
}
const vCobAplicado = () => Object.values(vCob().apl).reduce((a, x) => a + (vNum(x) > 0 ? Math.round(vNum(x) * 100) : 0), 0) / 100;
function vCobResumenHTML() {
  const usdp = vCobUsd(), apl = vCobAplicado(), resto = Math.round((usdp - apl) * 100) / 100;
  return `<dl class="v-dl v-res"><div><dt>Pago en dólares</dt><dd id="v-usd"><b>${vusd(usdp)}</b></dd></div><div><dt>Aplicado a notas</dt><dd><b>${vusd(apl)}</b></dd></div>
    <div><dt>${resto < 0 ? 'Se pasa por' : 'Sin aplicar'}</dt><dd><b class="${resto < 0 ? 'v-neg' : ''}">${vusd(Math.abs(resto))}</b></dd></div></dl>${resto < 0 ? `<p class="v-alerta">${ic('alert', 16)}Lo aplicado supera el pago. Baja el monto de alguna nota.</p>` : ''}`;
}
function vCobDocs() {
  const C = vCob(), pv = C.prev; if (!pv) return '<p class="hint">Cargando notas pendientes…</p>';
  if (!pv.documentos.length) return '<p class="hint">Este cliente no tiene notas ni facturas pendientes de cobro.</p>';
  const hayMora = pv.documentos.some(d => d.caso === 3);
  const tabla = table([
    {h: 'Nota / factura', f: d => `<button type="button" class="btn sm ghost" data-act="vVerDoc" data-id="${d.id_documento}">${vtxt(d.nro || '')}</button>`},
    {h: 'Emisión', f: d => vfecha(d.fecha_emision)}, {h: 'Días', r: 1, f: d => d.dias ?? '—'},
    {h: 'Caso', f: d => vCasoChip(d)}, {h: 'Ruta', f: d => `<span class="v-ruta" title="${esc(vRutaTxt(d.ruta))}">${vtxt(d.ruta === 'SIN_DETALLE' ? 'Excel' : d.ruta || '')}</span>`},
    {h: 'Documento emitido al cobrar', f: d => d.error ? '' : d.ruta === 'A' ? `Factura por ${vusd(d.final.total)}` : d.nota ? `${d.nota.tipo === 'NOTA_CREDITO' ? 'Nota de crédito' : 'Nota de débito'} por ${vusd(d.nota.total)}` : d.ruta === 'B' ? 'Sin ajuste' : '—'},
    {h: 'Neto a cobrar', r: 1, f: d => d.error ? '' : vusd(d.neto)}, {h: 'Ya abonado', r: 1, f: d => d.error ? '' : vusd(d.pagado)}, {h: 'Falta', r: 1, f: d => d.error ? '' : `<b>${vusd(d.restante)}</b>`},
    {h: 'Aplicar este pago (US$)', f: d => d.error ? '' : `<div class="v-apl"><input type="text" inputmode="decimal" class="v-dec" data-apl="${d.id_documento}" value="${esc(C.apl[d.id_documento] ?? '')}" aria-label="Monto a aplicar a ${esc(d.nro || '')}" ${d.restante <= 0 ? 'disabled' : ''}><button type="button" class="btn sm ghost" data-act="vAplTodo" data-id="${d.id_documento}" ${d.restante <= 0 ? 'disabled' : ''}>Todo</button></div>`}
  ], pv.documentos, {empty: 'Sin notas pendientes.'});
  return `${tabla}${hayMora ? `<label class="toggle v-exo"><input type="checkbox" data-act-change="vCobExo" ${C.exonerar ? 'checked' : ''}><span>Exonerar el recargo por mora (exige el PIN de gerencia y queda en la auditoría)</span></label>` : ''}
    <div class="btnrow"><button type="button" class="btn" data-act="vAplRepartir">${ic('compare', 16)}Repartir el pago (más antigua primero)</button><button type="button" class="btn ghost" data-act="vAplLimpiar">Limpiar</button></div>`;
}
async function vCobCargar() {
  const C = vCob(); if (!C.cid) return;
  try { C.prev = await vApi('GET', '/clientes/' + C.cid + '/pendientes' + vQS({fecha: C.fecha || vHoy(), exonerar: C.exonerar ? 1 : ''})); } catch (e) { vErr(e); C.prev = {documentos: []}; }
  render();
}
async function vCobElegir(id) {
  const C = vCob();
  try { const r = await vApi('GET', '/clientes/' + id + '/precios'); C.cli = r.cliente; } catch (e) { return vErr(e); }
  C.cid = id; C.prev = null; C.apl = {}; C.fecha = C.fecha || vHoy(); render(); vCobCargar();
}
function scrCobro() {
  return vPantalla(() => {
    const C = vCob(), hoy = vHoy(), retro = C.fecha && C.fecha < hoy;
    const form = !C.cli ? '' : `<div class="form v-pago"><div class="row3"><label class="fld">Fecha del pago<input type="date" data-act-change="vCobFecha" value="${esc(C.fecha || hoy)}" max="${hoy}"></label>
      <label class="fld">Monto recibido (Bs)<input type="text" inputmode="decimal" class="v-dec" data-vk="cob.monto" value="${esc(C.monto)}" placeholder="0,00"></label>
      <div class="fld" id="v-tasa" aria-live="polite">${C.prev ? vTasaAviso(C.prev.tasa, C.fecha || hoy) : '<p class="hint">Consultando la tasa…</p>'}</div></div>
      <div class="row3">${vBancoCampo('cob', C, 'Banco de origen')}
      <label class="fld">Número de referencia<input type="text" data-vk="cob.ref" value="${esc(C.ref)}" maxlength="40" autocomplete="off"></label>
      <label class="fld">Observación<input type="text" data-vk="cob.obs" value="${esc(C.obs)}" maxlength="200" placeholder="Opcional"></label></div>
      ${retro ? `<p class="v-alerta v-pin">${ic('lock', 16)}La fecha es anterior a hoy: para registrar este pago el sistema pedirá el <b>PIN de gerencia</b> y quedará en la auditoría.</p>` : ''}
      <div id="v-res">${vCobResumenHTML()}</div>
      <div class="btnrow"><button type="button" class="btn pri" data-act="vCobrar" ${V.busy.cobrar ? 'disabled' : ''}>${ic('coins', 18)}Registrar pago</button></div></div>`;
    return `${vph('Ventas y liquidación · Fase 2', 'Cobrar y liquidar', 'Escribe el pago una sola vez. Verás qué caso corresponde por los días transcurridos y qué documento se emite.')}
    ${card('1 · Cliente', C.cli ? `<div class="v-cli-b"><div><p class="v-cli-n">${vtxt(C.cli.razon_social)}</p><p class="mono">${vtxt(C.cli.rif_id || 'sin RIF')} · debe ${vusd(C.cli.deuda_cents / 100)}</p></div><button type="button" class="btn sm ghost" data-act="vCobOtro">Cambiar cliente</button></div>` : vPicker('cob', null, C.q))}
    ${C.cli ? card('2 · Notas y facturas pendientes (al ' + vfecha(C.fecha || hoy) + ')', `<div id="v-docs">${vCobDocs()}</div>`, {}) : ''}
    ${C.cli ? card('3 · Datos del pago', form) : ''}`;
  });
}
function vCobRefrescarRes() { const r = $('#v-res'); if (r) r.innerHTML = vCobResumenHTML(); }

/* ---------- Registrar ---------- */
function vCobArmar() {
  const C = vCob(), apl = Object.entries(C.apl).map(([id, v]) => ({id_documento: +id, usd: vNum(v)})).filter(a => a.usd > 0);
  return {id_cliente: C.cid, fecha_pago: C.fecha || vHoy(), monto_bs: vNum(C.monto), banco: C.banco, id_banco: C.id_banco || undefined, referencia: C.ref, observacion: C.obs, exonerar_mora: !!C.exonerar, aplicaciones: apl};
}
function vCobPedirPin(motivo, siguiente) {
  modal('PIN de gerencia', `<div class="form"><p>${vtxt(motivo)}</p><label class="fld">PIN de gerencia<input type="password" inputmode="numeric" id="v-pin" autocomplete="off" maxlength="12"></label><p class="err" id="v-pin-e" role="alert" hidden></p>
    <div class="btnrow"><button type="button" class="btn pri" id="v-pin-ok">Confirmar</button><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`);
  const inp = $('#v-pin'); inp.focus();
  const ok = async () => { const e = $('#v-pin-e'); e.hidden = true; try { await siguiente(inp.value); } catch (er) { e.textContent = er.message; e.hidden = false; } };
  $('#v-pin-ok').addEventListener('click', ok); inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') ok(); });
}
async function vCobEnviar(pin) {
  const C = vCob(), cuerpo = vCobArmar(); if (pin) cuerpo.pin = pin;
  V.busy.cobrar = true;
  try {
    const r = await vApi('POST', '/cobros', cuerpo); closeModal();
    toast('Pago ' + esc(r.recibo) + ' registrado: ' + vusd(r.usd) + '.');
    Object.assign(C, {monto: '', banco: '', id_banco: '', ref: '', obs: '', apl: {}, exonerar: false}); const cid = C.cid;
    V.clientes = null; await vBoot(true); await vCobElegir(cid);
    vCobExito(r);
  } catch (e) {
    if (e.info && e.info.codigo === 'DUPLICADO') { closeModal(); vCobDuplicado(e); }
    else if (e.info && (e.info.codigo === 'PIN' || e.info.codigo === 'PIN_REQUERIDO') && pin) throw e;
    else if (e.info && (e.info.codigo === 'PIN' || e.info.codigo === 'PIN_REQUERIDO')) vCobPedirPin(e.message, p => vCobEnviar(p));
    else if (pin) throw e; else vErr(e);
  } finally { delete V.busy.cobrar; render(); }
}
function vCobDuplicado(e) {
  const x = e.info.existente || {};
  modal('Referencia repetida: no se guardó', `<div class="v-dup"><p class="v-alerta">${ic('alert', 16)}${vtxt(e.message)}</p>
    <dl class="v-dl"><div><dt>Recibo existente</dt><dd><b>${vtxt(x.recibo)}</b></dd></div><div><dt>Cliente</dt><dd>${vtxt(x.cliente)}</dd></div><div><dt>Fecha</dt><dd>${vfecha(x.fecha_pago)}</dd></div>
    <div><dt>Banco y referencia</dt><dd>${vtxt(x.banco)} · ${vtxt(x.referencia)}</dd></div><div><dt>Monto</dt><dd>${vbs(x.monto_bs)} (${vusd(x.usd)})</dd></div></dl>
    <div class="btnrow"><button type="button" class="btn pri" data-act="vVerPago" data-id="${x.id_pago}">Ver el pago existente</button><button type="button" class="btn" data-act="closeModal">Cerrar</button></div></div>`);
}
function vCobExito(r) {
  const liq = r.liquidaciones.map(l => `<li><b>${vtxt(l.nro)}</b>: ${vtxt(l.caso_texto)} (${l.dias} días) · ${l.ruta === 'A' ? 'se emitió la factura ' + vtxt(l.factura.nro_factura_fiscal || l.factura.nro_control_interno) + ' por ' + vusd(l.factura.total) + ', sin descontar inventario otra vez' : l.ruta === 'B' ? (l.nota ? (l.nota.tipo === 'NOTA_CREDITO' ? 'nota de crédito ' : 'nota de débito ') + vtxt(l.nota.nro_fiscal) + ' por ' + vusd(l.nota.total) : 'sin nota de ajuste') : 'liquidada por el monto del Excel'}${l.comision ? ` · comisión: base ${vusd(l.comision.base_neta)}${l.comision.monto != null ? ', ' + vusd(l.comision.monto) + ' (' + N2.format(l.comision.pct) + ' %)' : ', porcentaje del vendedor sin definir'}` : ''}</li>`).join('');
  const av = r.avisos.map(a => `<p class="v-alerta">${ic('alert', 16)}${vtxt(a.mensaje)} (recibo ${vtxt(a.existente.recibo)}, ${vbs(a.existente.monto_bs)})</p>`).join('');
  modal('Pago registrado', `<div class="form"><p><b>${vtxt(r.recibo)}</b> · ${vusd(r.usd)} · aplicado ${vusd(r.aplicado)}${r.sin_aplicar > 0 ? ` · saldo a favor sin aplicar ${vusd(r.sin_aplicar)}` : ''}</p>${av}${liq ? `<ul class="list">${liq}</ul>` : ''}
    <div class="btnrow"><button type="button" class="btn pri" data-act="vVerPago" data-id="${r.id_pago}">${ic('print', 16)}Ver e imprimir el recibo</button><button type="button" class="btn" data-act="closeModal">Seguir cobrando</button></div></div>`);
}
