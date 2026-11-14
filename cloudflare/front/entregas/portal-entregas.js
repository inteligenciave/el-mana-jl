/* Entregas en el PORTAL DEL CLIENTE: por factura, cuenta regresiva, descuento vigente, «cuánto pagar hoy» (US$ y Bs) y el botón «No recibí esto».
   Autocontenido: no depende de la app del equipo. Uso desde cualquier página del portal:
     EntregasPortal.montar(document.getElementById('x'), {token: 'CODIGO_PERSONAL'});   // pide /api/c/entregas/estado con la cabecera x-token
     EntregasPortal.html(estado)  → solo el HTML de las tarjetas (si el portal ya tiene `estado` de /api/c/entregas/estado)
   Rutas: GET /api/c/entregas/estado · POST /api/c/entregas/no-recibi {id_documento, nota}. */
const EntregasPortal = (() => {
  const N2 = new Intl.NumberFormat('es-VE', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const usd = x => x == null ? '—' : 'US$ ' + N2.format(x), bs = x => x == null ? '—' : 'Bs ' + N2.format(x);
  const fecha = s => { const d = new Date(String(s).slice(0, 10) + 'T12:00:00'); return isNaN(d) ? '—' : d.toLocaleDateString('es-VE', {day: '2-digit', month: '2-digit', year: 'numeric'}); };
  const fechaHora = ts => new Date(ts).toLocaleString('es-VE', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'});
  const MS = 864e5;
  const cuenta = ms => { if (ms == null) return '—'; if (ms <= 0) return '0 min'; const d = Math.floor(ms / MS), h = Math.floor(ms % MS / 36e5), m = Math.floor(ms % 36e5 / 6e4), s = Math.floor(ms % 6e4 / 1e3); return d > 0 ? `${d} d ${String(h).padStart(2, '0')} h ${String(m).padStart(2, '0')} min` : `${h} h ${String(m).padStart(2, '0')} min ${String(s).padStart(2, '0')} s`; };
  let st = {token: null, el: null, estado: null, desfase: 0, timer: null, err: null};

  const CSS = `.ep{display:grid;gap:12px;font-family:inherit}.ep *{box-sizing:border-box}
  .ep-c{background:#fff;color:#1b1b1b;border:1px solid #ddd;border-radius:14px;padding:14px;display:grid;gap:8px}
  .ep-h{display:flex;justify-content:space-between;gap:8px;align-items:baseline;flex-wrap:wrap}.ep-h b{font-size:17px}.ep-h span{color:#666;font-size:13px}
  .ep-chip{display:inline-block;border-radius:999px;padding:3px 10px;font-size:12.5px;font-weight:600;background:#eee;color:#333}
  .ep-ok{background:#E3F4E6;color:#1B6B2C}.ep-warn{background:#FFF1CC;color:#7A5200}.ep-crit{background:#FBE0E0;color:#A31B1B}
  .ep-cd{font-size:26px;font-weight:700;line-height:1.15;color:#C92121}.ep-cd small{display:block;font-size:13px;font-weight:500;color:#555;margin-top:2px}
  .ep-pay{background:#FFF8E1;border:1px solid #F2B72E;border-radius:10px;padding:10px 12px;display:grid;gap:2px}.ep-pay b{font-size:20px}.ep-pay span{font-size:13px;color:#555}
  .ep-btn{min-height:46px;border-radius:10px;border:1px solid #C92121;background:#fff;color:#C92121;font-weight:600;font-size:15px;padding:0 14px;cursor:pointer}.ep-btn.p{background:#C92121;color:#fff}.ep-btn:disabled{opacity:.5}
  .ep-f{display:grid;gap:8px}.ep-f textarea{width:100%;min-height:70px;border:1px solid #bbb;border-radius:8px;padding:8px;font:inherit}
  .ep-m{color:#555;font-size:13px}.ep-e{color:#A31B1B;font-size:13.5px}.ep-vacio{text-align:center;color:#555;padding:20px}`;

  function tarjeta(d) {
    const t = d.temporizador, p = d.pagar, tasa = st.estado.tasa;
    let estado, cd = '';
    if (!d.entrega) { estado = '<span class="ep-chip ep-warn">Entrega sin verificar</span>'; cd = '<p class="ep-m">Tu plazo de pago empieza cuando se confirma la foto de entrega de esta mercancía.</p>'; }
    else if (t.pausada) { estado = '<span class="ep-chip ep-warn">Plazo en pausa</span>'; cd = '<p class="ep-m">Avisaste que no recibiste esto. Mientras Cobranza lo revisa, tu plazo no corre.</p>'; }
    else if (t.tramo === 3) { estado = '<span class="ep-chip ep-crit">Vencida</span>'; cd = `<p class="ep-m">Pasaron ${t.dias} días desde la entrega${t.dias_vencida ? ` (${t.dias_vencida} después del plazo)` : ''}.${t.recargo_pct != null ? ` Recargo por mora: ${N2.format(t.recargo_pct)} %.` : ''}</p>`; }
    else {
      estado = `<span class="ep-chip ${t.descuento_pct != null ? 'ep-ok' : ''}">${t.tramo === 1 ? 'Primer plazo' : 'Segundo plazo'}</span>`;
      cd = `<div class="ep-cd" data-vence="${t.vence_ts}">${cuenta(t.restante_ms)}<small>${t.descuento_pct != null ? `para pagar con ${N2.format(t.descuento_pct)} % de descuento` : 'que le quedan a este plazo'} · entregada el ${fechaHora(d.entrega.fecha_hora)}</small></div>`;
    }
    const mostrarPago = d.entrega || p.normal_usd != null;
    const pago = mostrarPago ? `<div class="ep-pay"><span>${p.descuento_aplicado ? 'Pagando hoy con el descuento' : p.recargo_aplicado ? 'Pagando hoy (con recargo por mora)' : 'Saldo a pagar'}</span><b>${usd(p.hoy_usd)}</b>${p.hoy_bs != null ? `<span>${bs(p.hoy_bs)} · tasa BCV ${N2.format(tasa.valor)} del ${fecha(tasa.fecha)}${tasa.es_de_hoy ? '' : ' (última publicada)'}</span>` : '<span>Equivalente en bolívares no disponible por ahora.</span>'}${p.descuento_aplicado ? `<span>Ahorras ${usd((p.normal_usd - p.hoy_usd))} frente a pagar sin descuento (${usd(p.normal_usd)}).</span>` : ''}</div>` : '';
    const rec = d.reclamo ? '<p class="ep-m">Ya avisaste que no lo recibiste. Estamos revisando.</p>' : d.puede_reclamar ? `<button type="button" class="ep-btn" data-ep="reclamar" data-id="${d.id_documento}">No recibí esto</button>` : '<p class="ep-m">Este documento ya tuvo reclamos: comunícate con Cobranza.</p>';
    return `<article class="ep-c" data-doc="${d.id_documento}"><div class="ep-h"><b>${d.tipo === 'NOTA_ENTREGA' ? 'Nota de entrega' : 'Factura'} ${esc(d.nro)}</b><span>Emitida ${fecha(d.fecha_emision)} · ${usd(d.total)}</span></div><div>${estado}</div>${cd}${pago}<div data-form="${d.id_documento}">${rec}</div></article>`;
  }
  const html = estado => estado.documentos.length ? `<div class="ep">${estado.documentos.map(d => tarjeta(d)).join('')}</div>` : '<div class="ep"><p class="ep-vacio">No tienes facturas ni notas pendientes de pago.</p></div>';

  async function api(metodo, ruta, cuerpo) {
    const r = await fetch('/api/c/entregas' + ruta, {method: metodo, headers: {'content-type': 'application/json', 'x-token': st.token}, body: cuerpo ? JSON.stringify(cuerpo) : undefined});
    let j = {}; try { j = await r.json(); } catch (e) { /* sin cuerpo */ }
    if (!r.ok) { const e = new Error(j.error || 'No se pudo completar la operación.'); e.status = r.status; throw e; }
    return j;
  }
  async function cargar() {
    try { st.estado = await api('GET', '/estado'); st.desfase = st.estado.ahora - Date.now(); st.err = null; } catch (e) { st.err = e; }
    pintar();
  }
  function pintar() {
    if (!st.el) return;
    st.el.innerHTML = st.err ? `<div class="ep"><p class="ep-e" role="alert">${esc(st.err.message)}</p></div>` : html(st.estado);
  }
  function tic() {
    if (!st.el || !st.estado) return;
    const ahora = Date.now() + st.desfase; let vencido = false;
    st.el.querySelectorAll('[data-vence]').forEach(e => { const ms = +e.dataset.vence - ahora; if (ms <= 0) vencido = true; const n = e.firstChild; if (n && n.nodeType === 3) n.nodeValue = cuenta(ms); });
    if (vencido) { cargar(); }
  }
  function formulario(id) {
    const c = st.el.querySelector(`[data-form="${id}"]`); if (!c) return;
    c.innerHTML = `<div class="ep-f"><label>¿Qué pasó? (opcional)<textarea maxlength="300" data-ep-nota placeholder="Por ejemplo: no llegó el pedido"></textarea></label><p class="ep-m">Tu plazo de pago se pone en pausa hasta que Cobranza lo revise.</p><p class="ep-e" data-ep-err role="alert" hidden></p>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="ep-btn p" data-ep="enviar" data-id="${id}">Enviar aviso</button><button type="button" class="ep-btn" data-ep="cancelar">Cancelar</button></div></div>`;
    c.querySelector('textarea').focus();
  }
  async function enviar(id, btn) {
    const c = st.el.querySelector(`[data-form="${id}"]`), e = c.querySelector('[data-ep-err]'); e.hidden = true; btn.disabled = true;
    try { const r = await api('POST', '/no-recibi', {id_documento: id, nota: c.querySelector('[data-ep-nota]').value}); await cargar(); const n = st.el.querySelector(`[data-form="${id}"]`); if (n) n.insertAdjacentHTML('afterbegin', `<p class="ep-m" role="status">${esc(r.mensaje)}</p>`); }
    catch (er) { e.textContent = er.message; e.hidden = false; btn.disabled = false; }
  }
  function montar(el, {token}) {
    st.token = token; st.el = el; el.innerHTML = '<div class="ep"><p class="ep-vacio">Cargando…</p></div>';
    if (!document.getElementById('ep-css')) { const s = document.createElement('style'); s.id = 'ep-css'; s.textContent = CSS; document.head.appendChild(s); }
    el.addEventListener('click', ev => {
      const b = ev.target.closest('[data-ep]'); if (!b) return;
      if (b.dataset.ep === 'reclamar') formulario(+b.dataset.id);
      else if (b.dataset.ep === 'cancelar') pintar();
      else if (b.dataset.ep === 'enviar') enviar(+b.dataset.id, b);
    });
    clearInterval(st.timer); st.timer = setInterval(tic, 1000);
    return cargar();
  }
  return {montar, html, cuenta, recargar: cargar, CSS};
})();
