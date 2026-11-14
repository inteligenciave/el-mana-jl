/* ---------- Calendario reutilizable (Cuentas por pagar y Cuentas por cobrar) ----------
   Un solo componente: cada pantalla le pasa su configuración (eventos, filtros, acciones). Los eventos salen de los registros guardados. */
const CAL_EST = {
  vencido: {t: 'Vencido', ic: 'alert', cls: 'e-v'},
  hoy: {t: 'Vence hoy', ic: 'flame', cls: 'e-h'},
  proximo: {t: 'Próximo', ic: 'calendar', cls: 'e-p'},
  hecho: {t: 'Pagado / cobrado', ic: 'check', cls: 'e-ok'}
};
const CAL_ORD = ['vencido', 'hoy', 'proximo', 'hecho'];
const calSt = id => (S.cal ||= {})[id] || (S.cal[id] = {mes: HOY_ISO.slice(0, 7), dia: null, est: 'Todos', who: 'Todos', vend: 'Todos'});
const calEstOf = (date, hecho) => hecho ? 'hecho' : date < HOY_ISO ? 'vencido' : date === HOY_ISO ? 'hoy' : 'proximo';
const calMonthLabel = m => { const [y, mm] = m.split('-'); return MESES[+mm - 1] + ' ' + y; };
const calShift = (m, d) => { let [y, mm] = m.split('-').map(Number); const i = y * 12 + (mm - 1) + d; return `${Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`; };
const calWho = (id, e) => e.who;

/* Eventos de Cuentas por pagar: vencimientos pendientes (la cuota si es abono) y pagos hechos */
function cxpEvents() {
  const out = cxpList().map(c => ({k: 'cxp-' + c.id, date: c.vence, tipo: 'venc', who: prov(c.prov).nombre, doc: c.id, usd: c.due, saldo: c.saldo, abono: !!c.abono, estado: calEstOf(c.vence, false), dias: c.d, raw: c}));
  rows('pagos').forEach(p => { const c = S.compras.find(x => x.id === p.compraId); if (!c) return; out.push({k: 'pg-' + p.id, date: p.fecha, tipo: 'pago', who: prov(c.prov).nombre, doc: c.id, usd: p.monto, saldo: 0, estado: 'hecho', dias: dias(p.fecha)}); });
  return out;
}
/* Eventos de Cuentas por cobrar: dos fechas por factura (fin del crédito y último día del precio B) y los cobros hechos */
function cxcEvents() {
  const P = S.pol, out = [], dB = +P.diasPrecioB || 21, dC = 30;
  (DATA.cxc || []).forEach(c => {
    const vc = addDays(c.fecha, dC), vb = addDays(c.fecha, dB), pb = c.monto * (1 - P.descB / 100);
    out.push({k: 'cxc-' + c.fact, date: vc, tipo: 'venc', who: c.cli, vend: c.vend, doc: c.fact, usd: c.monto, estado: calEstOf(vc, false), dias: dias(vc), raw: c});
    out.push({k: 'cxb-' + c.fact, date: vb, tipo: 'precioB', who: c.cli, vend: c.vend, doc: c.fact, usd: pb, estado: calEstOf(vb, false), dias: dias(vb), raw: c});
  });
  (DATA.cxcCobros || []).forEach(x => out.push({k: 'cb-' + x.fact, date: x.fecha, tipo: 'cobro', who: x.cli || '', vend: x.vend || '', doc: x.fact, usd: x.monto, estado: 'hecho', dias: dias(x.fecha)}));
  return out;
}
const CAL_TIPO = {venc: 'Vencimiento', precioB: 'Último día de precio B', pago: 'Pago registrado', cobro: 'Cobro registrado'};
const calDiasTxt = e => e.estado === 'hecho' ? 'Registrado el ' + fdl(e.date) : e.dias < 0 ? 'Venció hace ' + -e.dias + ' d' : e.dias === 0 ? 'Vence hoy' : 'Faltan ' + e.dias + ' d';

function calFiltrar(cfg, st) {
  return cfg.events().filter(e => (st.est === 'Todos' || e.estado === st.est) && (st.who === 'Todos' || e.who === st.who) && (st.vend === 'Todos' || !cfg.vend || e.vend === st.vend));
}
function calCard(id) {
  const cfg = CAL_CFG[id], st = calSt(id), all = cfg.events();
  const ev = calFiltrar(cfg, st), mes = ev.filter(e => e.date.slice(0, 7) === st.mes);
  const main = e => e.tipo === 'venc' || e.tipo === 'pago' || e.tipo === 'cobro';
  const pend = all.filter(e => main(e) && e.estado !== 'hecho');
  const sem = pend.filter(e => e.dias >= 0 && e.dias <= 6);
  const venc = pend.filter(e => e.estado === 'vencido');
  const delMes = mes.filter(main);
  const [y, m] = st.mes.split('-').map(Number), nd = new Date(y, m, 0).getDate(), off = (new Date(y, m - 1, 1).getDay() + 6) % 7, iso = d => `${st.mes}-${String(d).padStart(2, '0')}`;
  const byDay = {}; mes.forEach(e => (byDay[e.date] ||= []).push(e));
  const worst = list => CAL_ORD.find(s => list.some(e => e.estado === s));
  const dayInfo = d => { const l = byDay[iso(d)] || [], mn = l.filter(main), b = l.filter(e => e.tipo === 'precioB'); return {l, mn, b, tot: sum(mn, e => e.usd), w: worst(l)}; };
  const sel = st.dia && st.dia.slice(0, 7) === st.mes ? (byDay[st.dia] || []) : null;
  const label = (d, i) => `${d} de ${calMonthLabel(st.mes)}: ${i.mn.length} ${cfg.docs}${i.mn.length ? ', ' + usd(i.tot) : ''}${i.b.length ? ', ' + i.b.length + ' con último día de precio B' : ''}${i.w ? ', ' + CAL_EST[i.w].t : ''}`;
  const cell = d => {
    const i = dayInfo(d), c = iso(d), est = i.w ? CAL_EST[i.w] : null;
    return `<button type="button" class="${est ? est.cls : ''} ${c === HOY_ISO ? 'today' : ''}" aria-pressed="${st.dia === c}" aria-label="${esc(label(d, i))}" data-act="calDay" data-id="${id}" data-v="${c}"><span class="d">${d}${est ? ic(est.ic, 12) : ''}</span>${i.mn.length ? `<span class="a">US$ ${N0.format(i.tot)}</span><span class="a n">${i.mn.length} ${cfg.docs.slice(0, 4)}.</span>` : ''}${i.b.length ? `<span class="a bb" title="Último día de precio B">B · ${i.b.length}</span>` : ''}</button>`;
  };
  const cells = []; for (let k = 0; k < off; k++) cells.push('<button type="button" class="o" tabindex="-1" aria-hidden="true"></button>'); for (let d = 1; d <= nd; d++) cells.push(cell(d));
  const days = Object.keys(byDay).sort();
  const listRow = c => { const l = byDay[c], i = dayInfo(+c.slice(8)), est = CAL_EST[i.w] || CAL_EST.proximo, wd = D(c).toLocaleDateString('es-VE', {weekday: 'short'}).replace('.', '');
    return `<li><button type="button" class="${est.cls} ${c === HOY_ISO ? 'today' : ''}" aria-pressed="${st.dia === c}" aria-label="${esc(label(+c.slice(8), i))}" data-act="calDay" data-id="${id}" data-v="${c}"><span class="ld"><b>${+c.slice(8)}</b><small>${wd}</small></span><span class="lm">${i.mn.length ? `<b>US$ ${N2.format(i.tot)}</b> · ${i.mn.length} ${cfg.docs}` : ''}${i.b.length ? `<span class="bb">B · ${i.b.length} con último día de precio B</span>` : ''}</span><span class="ls">${ic(est.ic, 14)}${est.t}</span></button></li>`; };
  const filtros = `<div class="cal2-f"><label class="fld">${cfg.whoL}<select data-act-change="calF" data-id="${id}" data-f="who"><option>Todos</option>${[...new Set(all.map(e => e.who).filter(Boolean))].sort().map(w => `<option value="${esc(w)}" ${st.who === w ? 'selected' : ''}>${w}</option>`).join('')}</select></label>
    ${cfg.vend ? `<label class="fld">Vendedor<select data-act-change="calF" data-id="${id}" data-f="vend"><option>Todos</option>${[...new Set(all.map(e => e.vend).filter(Boolean))].sort().map(w => `<option value="${esc(w)}" ${st.vend === w ? 'selected' : ''}>${w}</option>`).join('')}</select></label>` : ''}
    <label class="fld">Estado<select data-act-change="calF" data-id="${id}" data-f="est"><option>Todos</option>${CAL_ORD.map(s => `<option value="${s}" ${st.est === s ? 'selected' : ''}>${CAL_EST[s].t}</option>`).join('')}</select></label></div>`;
  const panel = sel === null ? `<p class="hint" style="margin-top:10px">Toca un día para ver sus ${cfg.docs}.</p>` : `<div class="cal2-p"><h3>${fdl(st.dia)}</h3>${sel.length ? `<ul class="cal2-ev">${sel.map(e => { const est = CAL_EST[e.estado]; return `<li class="${est.cls}"><div class="ev-h"><b>${e.who || '—'}</b><span class="chip c-n">${ic(est.ic, 13)}${est.t}</span></div>
      <p class="ev-s"><span class="mono">${e.doc}</span> · ${CAL_TIPO[e.tipo]}${e.abono ? ' (abono)' : ''}${e.vend ? ' · Vendedor ' + e.vend : ''}</p>
      <p class="ev-m">${money(e.usd)}</p><p class="ev-s">${calDiasTxt(e)}${e.abono ? ' · saldo ' + usd(e.saldo) : ''}</p>${cfg.acts(e)}</li>`; }).join('')}</ul>` : '<p class="hint">Nada este día con los filtros elegidos.</p>'}</div>`;
  const resumen = `<div class="cal2-s"><div><small>Total del mes</small><b>${money(sum(delMes, e => e.usd))}</b><span>${delMes.length} ${cfg.docs}</span></div><div class="s-v"><small>Vencido</small><b>${money(sum(venc, e => e.usd))}</b><span>${venc.length} ${cfg.docs}</span></div><div><small>${cfg.sem}</small><b>${money(sum(sem, e => e.usd))}</b><span>${sem.length} ${cfg.docs}</span></div></div>`;
  const body = `${resumen}${filtros}
    <div class="cal2-nav"><button type="button" class="btn sm" data-act="calNav" data-id="${id}" data-d="-1" aria-label="Mes anterior">‹</button><b class="cal2-m" aria-live="polite">${calMonthLabel(st.mes)}</b><button type="button" class="btn sm" data-act="calNav" data-id="${id}" data-d="1" aria-label="Mes siguiente">›</button><button type="button" class="btn sm" data-act="calNav" data-id="${id}" data-d="0">Hoy</button></div>
    ${mes.length ? `<div class="cal2-grid cal" role="grid" aria-label="${esc(cfg.t + ' de ' + calMonthLabel(st.mes))}">${['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(x => `<div class="dh">${x}</div>`).join('')}${cells.join('')}</div>
      <ul class="cal2-list">${days.map(listRow).join('')}</ul>` : emptyState('Nada en ' + calMonthLabel(st.mes), 'No hay ' + cfg.docs + ' con estos filtros. Cambia de mes con las flechas o quita un filtro.')}
    <div class="legend cal2-lg">${CAL_ORD.map(s => `<span class="${CAL_EST[s].cls}">${ic(CAL_EST[s].ic, 13)}${CAL_EST[s].t}</span>`).join('')}${cfg.vend ? `<span class="bb">B = último día de precio B</span>` : ''}<span><i style="border:2px solid var(--pri)"></i>Hoy</span></div>
    ${panel}`;
  return card(cfg.t, body, {sub: cfg.sub, cls: 'cal2-card'});
}
const CAL_CFG = {
  cxp: {t: 'Calendario de vencimientos', sub: 'Monto en US$ por día (en abonos, la cuota). Los pagos hechos aparecen en verde.', docs: 'documentos', whoL: 'Proveedor', sem: 'Por pagar esta semana', events: cxpEvents, vend: false,
    acts: e => e.estado !== 'hecho' && lvl('cxp') >= 2 ? `<div class="btnrow"><button type="button" class="btn sm pri" data-act="pagar" data-id="${e.doc}">${e.abono ? 'Registrar abono' : 'Registrar pago'}</button></div>` : ''},
  cxc: {t: 'Calendario de cobranza', sub: 'Dos fechas por factura: fin del crédito (30 días, supuesto) y último día para conservar el precio B.', docs: 'facturas', whoL: 'Cliente', sem: 'Por cobrar esta semana', events: cxcEvents, vend: true,
    acts: e => { if (e.estado === 'hecho' || e.tipo === 'cobro') return ''; const c = e.raw; return `<div class="btnrow">${lvl('ventas') >= 2 ? `<button type="button" class="btn sm pri" data-act="cxcCobro" data-fact="${esc(c.fact)}">Registrar cobro</button>` : ''}${waBtn(c.cli, waMsgCxc({...c, d: -dias(c.fecha)}))}</div>`; }}
};
const CAL_ACT = {
  calNav: el => { const st = calSt(el.dataset.id), d = +el.dataset.d; st.mes = d === 0 ? HOY_ISO.slice(0, 7) : calShift(st.mes, d); st.dia = null; render(); },
  calDay: el => { const st = calSt(el.dataset.id); st.dia = st.dia === el.dataset.v ? null : el.dataset.v; render(); },
  calF: el => { calSt(el.dataset.id)[el.dataset.f] = el.value; calSt(el.dataset.id).dia = null; render(); },
  cxcCobro: el => run('cobro:' + el.dataset.fact, () => Svc.regCobro(el.dataset.fact), r => `Cobro de ${usd(r.monto)} registrado a ${waNom(r.cli)}.`)
};
Object.assign(Svc, {
  async regCobro(fact) {
    const c = (DATA.cxc || []).find(x => x.fact === fact); if (!c) throw fail('Esa factura ya fue cobrada o no existe.');
    return withLease('cobros', async () => {
      const cur = (await B.get('gestion', 'cobros')) || {items: []};
      if (cur.items.some(x => x.fact === fact)) throw fail('Esa factura ya tiene un cobro registrado.');
      const P = S.pol, d = -dias(c.fecha), monto = round2(d <= P.diasPrecioB ? c.monto * (1 - P.descB / 100) : c.monto);
      const it = {fact, cli: c.cli, vend: c.vend, fecha: HOY_ISO, monto, full: c.monto, rol: S.rol, ts: Date.now()};
      await W.set('gestion', 'cobros', {items: [...cur.items, it]});
      return it;
    });
  }
});
