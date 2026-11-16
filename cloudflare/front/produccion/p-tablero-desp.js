/* Logística · pantalla de inicio: una tarjeta por zona (kg listos, avance a la meta, pedidos y clientes, estado).
   Usa solo lo que el puesto puede leer: pedidos (/pedidos) y salidas (/salidas). Al tocar una tarjeta abre «Despachos» con esa zona. */
const EMZ_BASE = ['Lara', 'Trujillo', 'Yaracuy', 'Capital', 'Miranda', 'Aragua', 'Carabobo', 'Oriente']; /* las zonas de venta; si aparece otra en un pedido, se suma sola */
PR.emz = null; PR.zonaDesp = null;
async function emzCargar() {
  if (PR.emzBusy) return; PR.emzBusy = true;
  try {
    const [pen, par, sal, tab] = await Promise.all([prApi('GET', '/pedidos?estado=PENDIENTE'), prApi('GET', '/pedidos?estado=PARCIAL'), prApi('GET', '/salidas'), prApi('GET', '/tablero').catch(() => null)]);
    const det = await Promise.all(par.map(p => prApi('GET', '/pedidos/' + p.id_pedido).catch(() => null)));
    const filas = pen.map(p => ({zona: p.zona, cli: p.razon_social, ped: p.id_pedido, bultos: +p.bultos || 0, kilos: +p.kilos || 0}));
    par.forEach((p, i) => { const d = det[i]; if (!d) return; let b = 0, k = 0; (d.lineas || []).forEach(l => { b += l.pendiente; k += l.pendiente * l.kg_por_bulto; }); if (b > 0) filas.push({zona: p.zona, cli: p.razon_social, ped: p.id_pedido, bultos: b, kilos: k}); });
    const ls = Array.isArray(sal) ? sal : [], armadas = ls.filter(s => s.estado === 'ARMANDO'), meta = (tab && +tab.meta_kg) || (ls.length ? +ls[0].meta_kg || 0 : 0), pausadas = new Set(((tab && tab.pausadas) || []).map(z => z.zona));
    PR.emz = {filas, armadas, meta, pausadas, ts: Date.now(), zonas: [...new Set(EMZ_BASE.concat([...pausadas]).concat(pen.concat(par).map(p => p.zona)).concat(ls.map(s => s.zona)).filter(Boolean))]};
  } catch (e) { console.error(e); if (!PR.emz) PR.emz = {error: e.message, ts: Date.now()}; }
  finally { PR.emzBusy = false; render(); }
}
const emzT = kg => kg >= 1000 ? prN(kg / 1000, kg % 1000 ? 1 : 0) + ' t' : prKg(kg);
function emzTarjetas(E) {
  const meta = E.meta, E_PAUSA = E.pausadas || new Set(), out = E.zonas.map(z => {
    const f = E.filas.filter(x => x.zona === z), a = E.armadas.filter(s => s.zona === z), cli = [...new Set(f.map(x => x.cli))];
    const kilos = f.reduce((s, x) => s + x.kilos, 0), bultos = f.reduce((s, x) => s + x.bultos, 0), pedidos = new Set(f.map(x => x.ped)).size;
    const pausada = E_PAUSA.has(z), llego = !pausada && meta > 0 && kilos >= meta, armada = a.length > 0;
    return {zona: z, kilos, bultos, pedidos, cli, nArm: a.length, bArm: a.reduce((s, x) => s + (+x.bultos || 0), 0), listo: !pausada && (llego || armada), llego, armada, pausada};
  });
  return out.sort((x, y) => (y.listo - x.listo) || (y.kilos - x.kilos) || x.zona.localeCompare(y.zona, 'es'));
}
function scrTablero() {
  if (!window.__EM_HTTP) return ph('Logística', 'Zonas', '', '') + card('', emptyState('Este módulo necesita el servidor', 'Funciona en la versión con base de datos.'));
  if (PR.rol !== S.rol) { PR.rol = S.rol; PR.tab = PR.turno = PR.proc = PR.inv = PR.aj = PR.z = PR.sals = PR.emz = null; }
  PR.zonaDesp = null;
  if (!PR.emz || (Date.now() - PR.emz.ts > 30000 && !PR.emzBusy)) { if (!PR.emz) { emzCargar(); return ph('Logística', 'Zonas', '', '') + card('', emptyState('Cargando…', 'Un momento.')); } setTimeout(emzCargar, 0); }
  const E = PR.emz; if (E.error) return ph('Logística', 'Zonas', '', '') + card('', emptyState('No se pudo cargar', prT(E.error)));
  const tj = z => `<article class="em-card ${z.listo ? 'ok' : z.kilos > 0 ? 'warn' : ''}"><button type="button" class="em-b" data-act="emzAbrir" data-z="${prT(z.zona)}" aria-label="Abrir el despacho de la zona ${prT(z.zona)}">
    <h3>${prT(z.zona)}</h3>
    <p class="em-big">${prN(z.kilos)} <small>kg listos</small></p>
    ${E.meta > 0 ? `${prBarra(z.kilos, E.meta)}<p class="em-sub">de la meta de ${emzT(E.meta)} (${prN(Math.round(z.kilos / E.meta * 100))} %)</p>` : `<p class="em-sub">&nbsp;</p>`}
    <p class="em-est">${z.pausada ? '<span class="chip c-n">Pausada</span>' : z.llego ? '<span class="chip c-ok">Lista: llegó a la meta</span>' : z.armada ? '<span class="chip c-ok">Salida armada</span>' : z.kilos > 0 ? '<span class="chip c-warn">En espera</span>' : '<span class="chip c-n">Sin pedidos</span>'}</p>
    <p class="em-ped"><b>${prN(z.pedidos)}</b> pedido${z.pedidos === 1 ? '' : 's'} · <b>${prN(z.cli.length)}</b> cliente${z.cli.length === 1 ? '' : 's'}${z.armada ? ' · ' + prN(z.nArm) + ' salida' + (z.nArm === 1 ? '' : 's') + ' por cargar' : ''}</p>
    ${z.cli.length ? `<p class="em-cli">${z.cli.slice(0, 2).map(prT).join(', ')}${z.cli.length > 2 ? ' y ' + (z.cli.length - 2) + ' más' : ''}</p>` : ''}</button></article>`;
  return `${ph('Logística', 'Zonas', '', '')}<div class="em-grid">${emzTarjetas(E).map(tj).join('')}</div>`;
}
Object.assign(PERM_DEF, {'em-tablero': 'empaque:1'});
Object.assign(SCREENS, {'em-tablero': {mod: 'prod', g: 'Despacho', t: 'Zonas', s: 'Zonas', ic: 'truck', r: scrTablero}});
S.perm = permInit();
Object.assign(ACT, {
  emzAbrir: el => { PR.zonaDesp = el.dataset.z; PR.sals = null; enter('despachos');
    /* en computador «Despachos» viene en pestañas: se deja abierta la de esta zona */
    let n = 0; const t = setInterval(() => { const b = [...document.querySelectorAll('[data-cp-tab]')].find(x => /^Zona /.test(x.textContent.trim())); if (b) { clearInterval(t); b.click(); } else if (++n > 20) clearInterval(t); }, 60); },
  emzTodas: () => { PR.zonaDesp = null; render(); }
});
