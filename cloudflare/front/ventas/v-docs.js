/* Documentos imprimibles del módulo: nota de entrega, factura, nota de crédito/débito y recibo de pago.
   El membrete y los números fiscales salen de la configuración; el formato fiscal está por confirmar con el contador. */
const vAvisoFiscal = '<p class="v-aviso">Formato fiscal por confirmar con el contador. Este documento no declara cumplimiento de ninguna normativa; el membrete, la numeración y los datos fiscales se configuran en Clientes, catálogo y ajustes.</p>';
const vc2 = c => vusd(c / 100);
function vMembrete(cfg, tituloDoc, numeros) {
  const datos = [cfg.membrete_rif && 'RIF ' + cfg.membrete_rif, cfg.membrete_direccion, cfg.membrete_telefono].filter(Boolean).map(vtxt).join(' · ');
  return `<div class="dh"><div class="dh-id">${logoImg('doc-logo')}<div><h3>${vtxt(cfg.membrete_razon || 'El Maná JL')}</h3><p>${datos || 'Membrete sin completar (RIF y dirección en ajustes)'}</p></div></div>
    <div style="text-align:right"><p class="v-doc-t">${tituloDoc}</p>${numeros}</div></div>`;
}
const vTipoDoc = d => d.tipo_origen === 'NOTA_ENTREGA' ? 'NOTA DE ENTREGA' : 'FACTURA';

function vDocHTML(det) {
  const d = det.documento, cfg = det.membrete || {}, ne = d.tipo_origen === 'NOTA_ENTREGA';
  const nums = `<p class="mono">Control interno ${vtxt(d.nro_control_interno)}</p>${d.numero_externo ? `<p class="mono">N/E del Excel ${vtxt(d.numero_externo)}</p>` : ''}${!ne ? `<p class="mono">Factura ${d.nro_factura_fiscal ? vtxt(d.nro_factura_fiscal) : 'sin número asignado'}</p>` : ''}<p>Emitida ${vfecha(d.fecha_emision)}</p>`;
  const nuevo = d.envio_zona != null; // documento nuevo: bultos, precio por bulto y ubicación de envío congelada
  const bultos = n => N0.format(n) + (n === 1 ? ' bulto' : ' bultos');
  const lineas = det.lineas.length && nuevo ? table([{h: 'Descripción', f: l => vtxt(l.nombre) + ` <span class="muted mono">${vtxt(l.sku)}</span>`}, {h: 'Cantidad × precio por bulto = total', r: 1, f: l => `${bultos(l.cantidad)} × ${vc2(l.precio_base_cents)} por bulto = <b>${vc2(l.cantidad * l.precio_base_cents)}</b>`}], det.lineas)
    : det.lineas.length ? table([{h: 'Cant.', r: 1, f: l => N0.format(l.cantidad)}, {h: 'Descripción', f: l => vtxt(l.nombre) + ` <span class="muted mono">${vtxt(l.sku)}</span>`}, {h: 'Precio', r: 1, f: l => vc2(l.precio_base_cents)}, {h: 'Subtotal', r: 1, f: l => vc2(l.cantidad * l.precio_base_cents)}], det.lineas)
    : '<p class="hint">Importada del Excel de cobranza: no trae detalle de productos, solo el monto.</p>';
  const tot = det.lineas.length ? `<div class="v-tot"><p><span>Subtotal</span><b>${vc2(d.subtotal_base_cents)}</b></p>${d.descuento_cents ? `<p><span>Descuento ${d.descuento_pct ? N2.format(d.descuento_pct) + ' %' : ''}</span><b>- ${vc2(d.descuento_cents)}</b></p>` : ''}<p><span>IVA</span><b>${vc2(d.iva_cents)}</b></p><p class="v-tot-t"><span>Total</span><b>${vc2(d.total_cents)}</b></p></div>`
    : `<div class="v-tot"><p class="v-tot-t"><span>Total</span><b>${vc2(d.total_cents)}</b></p></div>`;
  const notas = det.notas.map(n => vNotaHTML(n, d, cfg)).join('');
  const hija = det.factura_resultante ? `<p class="hint">Al cobrarse se emitió la factura <b>${vtxt(det.factura_resultante.nro_factura_fiscal || det.factura_resultante.nro_control_interno)}</b>; esta nota no volvió a descontar inventario.</p>` : '';
  return `<div class="doc">${vMembrete(cfg, vTipoDoc(d), nums)}
    <div class="meta"><div><b>Cliente</b>${vtxt(d.razon_social)}</div><div><b>RIF</b>${vtxt(d.rif_id || '—')}</div><div><b>Vendedor</b>${vtxt(d.vendedor_nombre || '—')}</div><div><b>Estado</b>${vtxt(d.estado.replace(/_/g, ' ').toLowerCase())}</div>
    ${nuevo ? `<div><b>Ubicación de envío</b>${(d.envio_zona && d.envio_direccion) ? vtxt(d.envio_zona) + ' · ' + vtxt(d.envio_direccion) : '<span class="v-alerta-i">Falta zona/dirección de entrega</span>' + (d.envio_zona || d.envio_direccion ? ' (' + vtxt(d.envio_zona || d.envio_direccion) + ')' : '')}</div>` : ''}${d.fecha_vencimiento ? `<div><b>Crédito hasta</b>${vfecha(d.fecha_vencimiento)}</div>` : ''}${d.metodo_pago ? `<div><b>Método de pago</b>${vtxt(d.metodo_pago)}</div>` : ''}</div>
    ${lineas}${tot}
    ${ne ? '' : ''}
    ${d.observaciones ? `<p class="hint">${vtxt(d.observaciones)}</p>` : ''}${hija}
    <div class="firmas"><div>Despachado por</div><div>Recibido conforme</div></div>${vAvisoFiscal}${notas}</div>`;
}
function vNotaHTML(n, f, cfg) {
  const nd = n.tipo_nota === 'NOTA_DEBITO';
  return `<div class="v-pb"></div>${vMembrete(cfg, nd ? 'NOTA DE DÉBITO' : 'NOTA DE CRÉDITO', `<p class="mono">${vtxt(n.nro_fiscal_nota)}</p><p>Emitida ${vfecha(n.fecha_emision)}</p>`)}
    <div class="meta"><div><b>Cliente</b>${vtxt(f.razon_social)}</div><div><b>RIF</b>${vtxt(f.rif_id || '—')}</div><div><b>Afecta a la factura</b>${vtxt(f.nro_factura_fiscal || f.nro_control_interno)}</div><div><b>Motivo</b>${vtxt(n.motivo_ajuste)}</div></div>
    <div class="v-tot"><p><span>Base imponible</span><b>${vc2(n.base_imponible_ajuste_cents)}</b></p><p><span>IVA</span><b>${vc2(n.iva_ajuste_cents)}</b></p><p class="v-tot-t"><span>Total ${nd ? 'a cargar' : 'a favor del cliente'}</span><b>${vc2(n.total_ajuste_cents)}</b></p></div>
    ${vAvisoFiscal}`;
}
async function vDocModal(id) {
  try {
    const det = await vApi('GET', '/documentos/' + id), d = det.documento;
    const asi = det.asientos.length ? `<details class="noprint v-det"><summary>Asientos contables automáticos (${det.asientos.length})</summary>${det.asientos.map(a => `<p class="hint"><b>${vfecha(a.fecha)}</b> · ${vtxt(a.concepto)}</p>${table([{h: 'Cuenta', f: l => vtxt(l.cuenta)}, {h: 'Debe', r: 1, f: l => l.debe ? vc2(l.debe) : ''}, {h: 'Haber', r: 1, f: l => l.haber ? vc2(l.haber) : ''}], a.lineas)}`).join('')}</details>` : '';
    const mov = det.movimientos.length ? `<p class="hint noprint">Movimientos de inventario de este documento: ${det.movimientos.map(m => (m.cantidad > 0 ? '+' : '') + m.cantidad + ' (' + vtxt(m.tipo.toLowerCase().replace(/_/g, ' ')) + ')').join(', ')}.</p>` : '<p class="hint noprint">Este documento no movió inventario (la salida ya se registró en la nota de entrega, o viene del Excel).</p>';
    const pago = `<p class="hint noprint">Abonado ${vc2(d.pagado_cents)} · saldo ${vc2(d.saldo_cents)}.</p>`;
    modal(vTipoDoc(d) + ' ' + vtxt(d.nro_control_interno), vDocHTML(det) + pago + mov + asi + docBar(vTipoDoc(d) + ' ' + d.nro_control_interno));
  } catch (e) { vErr(e); }
}

/* ---------- Recibo de pago ---------- */
function vReciboHTML(det) {
  const p = det.pago, cfg = det.membrete || {};
  const apl = det.aplicaciones.length ? table([{h: 'Nota / factura', f: a => vtxt(a.numero_externo || a.nro_control_interno)}, {h: 'Emisión', f: a => vfecha(a.fecha_emision)}, {h: 'Aplicado', r: 1, f: a => vc2(a.usd_cents)}, {h: 'Saldo después', r: 1, f: a => a.saldo_actual_cents == null ? '—' : vc2(a.saldo_actual_cents)}, {h: '', f: a => a.liquido ? 'liquidada' : 'abono'}], det.aplicaciones) : '<p class="hint">Este pago no se aplicó todavía a ninguna nota: queda como saldo a favor del cliente.</p>';
  const emit = det.liquidados.flatMap(l => [l.factura && `Factura ${vtxt(l.factura.nro_factura_fiscal || l.factura.nro_control_interno)} (de la nota ${vtxt(l.documento)})`, ...l.notas.map(n => `${n.tipo_nota === 'NOTA_DEBITO' ? 'Nota de débito' : 'Nota de crédito'} ${vtxt(n.nro_fiscal_nota)} sobre ${vtxt(l.documento)}: ${vc2(n.total_ajuste_cents)}`)]).filter(Boolean);
  return `<div class="doc">${vMembrete(cfg, 'RECIBO DE PAGO', `<p class="mono">${vtxt(det.recibo)}</p><p>Fecha de pago ${vfecha(p.fecha_pago)}</p>${p.estado === 'ANULADO' ? '<p class="v-anulado">ANULADO</p>' : ''}`)}
    <div class="meta"><div><b>Cliente</b>${vtxt(p.razon_social)}</div><div><b>RIF</b>${vtxt(p.rif_id || '—')}</div><div><b>Banco</b>${vtxt(p.banco || '—')}</div><div><b>Referencia</b>${vtxt(p.referencia || 'sin referencia')}</div>
    <div><b>Monto</b>${vbs(p.monto_bs_cents / 100)}</div><div><b>${p.origen === 'importado' ? 'Tasa del Excel' : 'Tasa BCV'}</b>${N2.format(p.tasa)} Bs por US$ 1</div><div><b>Equivale a</b>${vc2(p.usd_cents)}</div><div><b>Recibido por</b>${vtxt(p.creado_rol || '—')}</div></div>
    ${apl}${emit.length ? `<p class="hint"><b>Documentos emitidos con este pago:</b> ${emit.join('; ')}.</p>` : ''}
    ${p.estado === 'ANULADO' ? `<p class="hint"><b>Motivo de anulación:</b> ${vtxt(p.motivo_anulacion)}</p>` : ''}
    ${det.sin_aplicar_cents > 0 && p.estado === 'ACTIVO' ? `<p class="hint">Saldo a favor sin aplicar: ${vc2(det.sin_aplicar_cents)}.</p>` : ''}
    <div class="firmas"><div>Recibido por (Administración)</div><div>Entregado por (cliente)</div></div>${vAvisoFiscal}</div>`;
}
async function vReciboModal(id) {
  try { const det = await vApi('GET', '/pagos/' + id); modal('Recibo ' + vtxt(det.recibo), vReciboHTML(det) + docBar('Recibo ' + det.recibo)); }
  catch (e) { vErr(e); }
}
