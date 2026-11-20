/* Logística · «Empacar»: Logística empaca la papa a granel que dejó Producción (kilos terminados de lotes y turnos, cerrados o no) menos lo ya empacado o mermado.
   No necesita turno abierto. Lo anotado suma al inventario de producto terminado al instante (Ventas lo puede vender enseguida). Sin precios ni dinero. */
PR_VIVAS.push('granel');
const lgKg = n => prN(n, Math.abs(n % 1) > 0.0004 ? 1 : 0) + ' kg';
function scrEmpacar() {
  const w = prEspera('Empacar', 'granel', '/empaque/granel', 'granel'); if (w) return w;
  const G = PR.granel, ok = prEmpacaOk(), Q = G.requisitos || {ok: true, bolsas: {conteo_ok: true, por_producto: {}}, personal: {ok: true}}, bloq = !Q.ok;
  const fq = (v, nom, txt) => `<li class="${v ? 'ok' : 'mal'}"><span class="pr-ic" aria-hidden="true">${v ? '✓' : '✗'}</span><span class="pr-cn"><b>${prT(nom)}</b><span>${prT(txt)}</span></span><span class="pr-sr">${v ? 'Cumplido' : 'Falta'}</span></li>`;
  /* una bolsa por presentación: cada una en verde o rojo; si falta la de una presentación solo esa fila queda bloqueada */
  const bol = p => p.bolsa || {ok: false, saldo: 0, minimo: 0, motivo: ''};
  const filasBolsa = Q.bolsas.conteo_ok ? G.productos.map(p => { const b = bol(p); return fq(b.ok, b.nombre || ('Bolsa ' + p.nombre), b.ok ? 'Hay ' + prN(b.saldo) + ' bolsas' + (b.bajo ? ' (quedan pocas, mínimo ' + prN(b.minimo) + ')' : '') : b.motivo); }).join('') : fq(false, 'Bolsas de presentación', Q.bolsas.motivo);
  const reqs = `<ul class="pr-cond lg-req">${filasBolsa}${fq(Q.personal.ok, 'Personal en planta', Q.personal.ok ? prN(Q.personal.presentes) + (Q.personal.presentes === 1 ? ' persona marcó' : ' personas marcaron') + ' entrada (' + prT(Q.personal.grupo) + ')' : Q.personal.motivo)}</ul>${bloq ? `<p class="pr-cres mal" role="alert"><b>No se puede anotar el empaque.</b> Cumple lo que está en rojo.</p>` : ''}`;
  const filas = G.productos.map(p => { const b = bol(p), off = bloq || !b.ok; return `<li class="lg-fila${b.ok ? '' : ' lg-sin'}"><label for="lg-b-${p.id_producto}"><b>${prT(p.nombre)}</b><small>${p.bolsas_por_bulto ? '1 bulto = ' + prN(p.bolsas_por_bulto) + ' bolsas · ' : ''}${lgKg(p.kg_por_bulto)} por bulto · en inventario: ${prN(p.existencias)}${b.ok && p.max_bultos_bolsas != null ? ' · con sus bolsas alcanzan ' + prN(p.max_bultos_bolsas) + ' bultos' : ''}${!b.ok && Q.bolsas.conteo_ok ? ' · <em>falta su bolsa</em>' : ''}</small></label><input type="text" inputmode="numeric" id="lg-b-${p.id_producto}" data-id="${p.id_producto}" data-kg="${p.kg_por_bulto}" data-bpb="${p.bolsas_por_bulto || 0}" data-bsal="${b.ok ? b.saldo : 0}" data-bnom="${prT(b.nombre || p.nombre)}" ${off ? 'disabled ' : ''}class="lg-b" placeholder="Bultos" aria-label="Bultos de ${prT(p.nombre)}"></li>`; }).join('');
  const form = ok ? `<ul class="lg-lista">${filas || '<li class="muted">No hay presentaciones de papa con el peso por bulto cargado. Pídele a Administración que lo cargue.</li>'}</ul>
    <details class="lg-merma"><summary>Merma de empaque (opcional)</summary><div class="pr-mov"><input type="text" inputmode="decimal" id="lg-mk" placeholder="Kilos" aria-label="Kilos de merma de empaque"><select id="lg-mm" aria-label="Motivo de la merma">${G.motivos.map(m => `<option>${prT(m)}</option>`).join('')}</select></div></details>
    <p class="muted" id="lg-uso">Escribe cuántos bultos empacaste de cada presentación: el sistema calcula los kilos y los resta del granel.</p>
    <div class="btnrow"><button type="button" class="btn pri xl" data-act="prEmpLibre" ${bloq ? 'disabled aria-disabled="true"' : ''}>Anotar empaque</button></div>` : '<p class="muted">Tu puesto solo consulta lo empacado.</p>';
  const rec = G.recientes.length ? `<ul class="pr-lin">${G.recientes.map(x => `<li><span>${x.tipo === 'MERMA' ? 'Merma de empaque · ' + prT(x.motivo) : prT(x.nombre)}</span><span class="muted">${x.tipo === 'MERMA' ? lgKg(x.kg) : prN(x.bultos) + ' bultos · ' + lgKg(x.kg)}</span></li>`).join('')}</ul>` : '<p class="muted">Todavía no se anotó nada empacado.</p>';
  return `${ph('Logística', 'Empacar', 'Lo que empacas sale de la papa a granel que dejó Producción y suma al inventario de producto terminado.', '')}
    <div class="lg-granel" role="status"><span>Papa a granel disponible</span><b>${lgKg(G.disponible_kg)}</b><small>Producida ${lgKg(G.producido_kg)} · empacada ${lgKg(G.empacado_kg)} · merma de empaque ${lgKg(G.merma_kg)}</small></div>
    ${card('Requisitos para empacar', reqs)}
    ${card('Anotar empaque', form)}
    ${card('Lo anotado últimamente', rec)}`;
}
function lgUso() {
  const G = PR.granel; if (!G) return;
  let kg = 0, bol = 0, falta = ''; document.querySelectorAll('.lg-b').forEach(i => { const n = parseInt(String(i.value).replace(/\D/g, ''), 10); if (n > 0) { kg += n * Number(i.dataset.kg); const b = n * Number(i.dataset.bpb || 0); bol += b; if (!falta && b > Number(i.dataset.bsal || 0)) falta = i.dataset.bnom; } });
  const m = parseFloat(String(($('#lg-mk') || {}).value || '').replace(',', '.')); if (m > 0) kg += m;
  const e = $('#lg-uso'); if (!e) return;
  e.textContent = kg > 0 ? 'Vas a usar ' + lgKg(Math.round(kg * 1000) / 1000) + ' de ' + lgKg(G.disponible_kg) + ' disponibles y ' + prN(bol) + ' bolsas (una por presentación).' + (kg > G.disponible_kg + 0.0004 ? ' Es más de lo que hay: baja la cantidad.' : '') + (falta ? ' No alcanzan las bolsas de «' + falta + '»: baja la cantidad.' : '') : 'Escribe cuántos bultos empacaste de cada presentación: el sistema calcula los kilos y los resta del granel.';
  e.classList.toggle('err', kg > G.disponible_kg + 0.0004 || !!falta);
}
document.addEventListener('input', ev => { if (ev.target && ev.target.closest && ev.target.closest('.lg-lista, .lg-merma')) lgUso(); });
Object.assign(PERM_DEF, {'lg-empacar': 'empaque:2'});
Object.assign(SCREENS, {'lg-empacar': {mod: 'prod', g: 'Logística', t: 'Empacar', s: 'Empacar', ic: 'pack', r: scrEmpacar}});
Object.assign(ACT_REQ, {prEmpLibre: ['lg-empacar', 2]}); Object.assign(ACT_LBL, {prEmpLibre: 'anotar lo empacado'});
Object.assign(ACT, {
  prEmpLibre: () => prAccion(async () => {
    const items = [...document.querySelectorAll('.lg-b')].map(i => ({id_producto: +i.dataset.id, bultos: String(i.value).trim()})).filter(x => x.bultos !== '');
    const mk = String(($('#lg-mk') || {}).value || '').trim().replace(',', '.');
    PR.granel = await prApi('POST', '/empaque/anotar', {items, merma: mk ? {kg: mk, motivo: ($('#lg-mm') || {}).value} : null});
    document.querySelectorAll('.lg-b, #lg-mk').forEach(i => { i.value = ''; }); render();
  }, 'Empaque anotado: ya suma al inventario.')
});
S.perm = permInit();
