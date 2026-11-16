/* COMPACTO: en computador (>=1024 px) las pantallas largas se reparten en pestañas dentro de la misma pantalla (una a la vez) y lo que sobre
   se desplaza por dentro, nunca la página. No quita nada: solo agrupa lo que ya estaba. El celular queda igual. */
(function () {
"use strict";
/* ruta -> [nombre de pestaña, [inicios de título de lo que lleva (o selector si empieza con «.»)], opciones]. Lo que no se nombra va a su propia pestaña. */
const G = ['Gráficas', 'Comparar', 'Kg facturados'];
const CFG = {
  produccion: [['Lotes', ['.pe-wrap']], ['Línea salsera', ['Línea salsera']], ['Mermas', ['Mermas de esta etapa']], ['Gráficas', ['Gráficas', 'Comparar', 'Papa frita producida']], ['Exportar', ['Exportar']]],
  recepcion: [['Nueva recepción', ['Nueva recepción']], ['Recientes', ['Recorrido', 'Recepciones recientes'], 'g2'], ['Mermas', ['Mermas de esta etapa']], ['Gráficas', G], ['Exportar', ['Exportar']]],
  empaque: [['Empaque de hoy', ['Empaque de hoy', 'Anotar lo empacado', 'Existencias']], ['Mermas', ['Mermas de esta etapa']], ['Gráficas', ['Gráficas', 'Comparar', 'Empacado hoy']], ['Exportar', ['Exportar']]],
  despachos: [['Notas de entrega', ['.fleet', 'Notas de entrega', 'Despachar un pedido']], ['Mermas', ['Mermas de esta etapa']], ['Gráficas', ['Gráficas', 'Comparar', 'Despachos por vehículo']], ['Exportar', ['Exportar']]],
  'compras-mp': [['Por validar', ['Recepciones por validar']], ['Compras efectivas', ['Compras efectivas']], ['Gráficas', ['Gráficas', 'Comparar', 'Compras por periodo']], ['Exportar', ['Exportar']]],
  gestion: [['Atención hoy', ['Lo que necesita']], ['Ventas', ['Ventas por día', 'Productos más']], ['Deudas y gastos', ['Deudores', 'Gastos y nómina']], ['Gráficas', ['Gráficas', 'Comparar', 'Costo de las mermas']], ['Exportar', ['Exportar']]],
  analisis: [['Proveedores', ['Ranking', 'Concentración']], ['Qué se compró', ['Qué se compró']], ['Lote por lote', ['Lote por lote']], ['Rendimiento', ['Rendimiento', 'Lectura', 'Recomendaciones']], ['Gráficas', ['Gráficas', 'Comparar', 'Materia prima frente']]],
  mermas: [['Alertas', ['Alertas']], ['Registrar merma', ['Registrar merma']], ['Por etapa y causa', ['Merma por etapa', 'Causas principales', 'Mermas por proveedor']], ['Tolerancias', ['Tolerancias']], ['Gráficas', ['Gráficas', 'Comparar', 'Merma % por proceso']], ['Exportar', ['Exportar']]],
  nomina: [['Nómina', ['Nómina por área', 'Reglas de pago']], ['Recibos de pago', ['Recibos de pago']], ['Gastos fijos', ['Gastos fijos']], ['Gráficas', ['Gráficas', 'Comparar', 'Nómina pagada']], ['Exportar', ['Exportar']]],
  inventario: [['Existencia', ['Existencia frente', 'Inventario']], ['Límites y movimientos', ['Límites de', 'Movimientos de']], ['Solicitudes de compra', ['Solicitudes de compra']]],
  'inventario-adm': [['Existencia', ['Existencia frente', 'Inventario']], ['Límites y movimientos', ['Límites de', 'Movimientos de']], ['Solicitudes de compra', ['Solicitudes de compra']]],
  asistencia: [['Asistencia', ['.as-grid']], ['Exportar', ['Exportar']]]
};
const MEMO = {};
const wide = () => window.innerWidth >= 1024;
const HEAD = el => /^(NAV|H1)$/.test(el.tagName) || /\b(v-top|perm-note|v-alerta|tiles|pt-bar|rh-cab)\b/.test(el.className) || el.matches('label.fld');
const clave = el => { const h = el.matches('h2,h3') ? el : el.querySelector('h2,h3,b'); return h ? h.textContent.trim().toLowerCase() : ''; };
function aplanar(wrap) { /* saca las tarjetas de las columnas 3/2 y de las pilas para poder repartirlas */
  let pasa = true;
  while (pasa) { pasa = false; [...wrap.children].forEach(c => { if (c.matches('.cols.c32,.stack,.un-panel')) { c.replaceWith(...c.children); pasa = true; } }); }
}
function compactar(root) {
  const wrap = root.querySelector('.wrap'); if (!wrap || !wide()) return;
  const ruta = S.route, cfg = CFG[ruta]; if (!cfg || wrap.querySelector('.cp-panel')) return;
  aplanar(wrap);
  const cab = [], sec = [];
  [...wrap.children].forEach(c => { if (HEAD(c)) cab.push(c); else sec.push(c); });
  /* un título suelto se pega a lo que sigue */
  const grupos = []; let pend = [];
  sec.forEach(e => { if (e.matches('h2')) pend.push(e); else { grupos.push(pend.concat(e)); pend = []; } });
  if (pend.length) grupos.push(pend);
  const tabs = cfg.map(c => ({n: c[0], p: c[1].map(x => x.toLowerCase()), o: c[2] || '', els: []})), extra = [];
  grupos.forEach(g => {
    const hit = tabs.find(t => g.some(e => t.p.some(p => p[0] === '.' ? (e.matches(p) || !!e.querySelector(p)) : clave(e).startsWith(p))));
    if (hit) hit.els.push(...g); else { const n = (g.map(clave).find(Boolean) || 'Más'); extra.push({n: n.charAt(0).toUpperCase() + n.slice(1), p: [], o: '', els: g}); }
  });
  const all = tabs.filter(t => t.els.length).concat(extra);
  cab.forEach(e => wrap.appendChild(e));
  if (all.length < 2) { if (all.length) { const pn = document.createElement('div'); pn.className = 'cp-panel'; all[0].els.forEach(e => pn.appendChild(e)); wrap.appendChild(pn); } return; }
  let ini = MEMO[ruta]; if (ini === undefined) { try { ini = window.Borrador ? Borrador.tab(ruta) : 0; } catch (e) { ini = 0; } } const act = Math.min(ini || 0, all.length - 1);
  const bar = document.createElement('div'); bar.className = 'v-tabs cp-tabs'; bar.setAttribute('role', 'tablist');
  bar.innerHTML = all.map((t, i) => `<button type="button" class="v-tab" role="tab" data-cp-tab="${i}" aria-selected="${i === act}">${t.n.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</button>`).join('');
  wrap.appendChild(bar);
  all.forEach((t, i) => { const pn = document.createElement('div'); pn.className = 'cp-panel' + (t.o ? ' cp-' + t.o : ''); pn.dataset.cp = i; if (i !== act) pn.hidden = true; t.els.forEach(e => pn.appendChild(e)); wrap.appendChild(pn); });
}
function ajustar() {
  if (!wide()) { document.querySelectorAll('#main .un-panel').forEach(pn => { pn.style.maxHeight = ''; }); return; }
  document.querySelectorAll('#main .cp-panel:not([hidden]), #main .un-panel').forEach(pn => { pn.style.maxHeight = ''; const t = pn.getBoundingClientRect().top; pn.style.maxHeight = Math.max(160, window.innerHeight - t - 16) + 'px'; });
}
window.cpCompactar = function (root) { try { compactar(root); ajustar(); requestAnimationFrame(ajustar); setTimeout(ajustar, 250); } catch (e) { console.error(e); } };
document.addEventListener('click', ev => {
  const b = ev.target.closest && ev.target.closest('[data-cp-tab]'); if (!b) return;
  const i = +b.dataset.cpTab, wrap = b.closest('.wrap'); MEMO[S.route] = i; try { if (window.Borrador) Borrador.tab(S.route, i); } catch (e) { /* sin borrador */ }
  wrap.querySelectorAll('[data-cp-tab]').forEach(x => x.setAttribute('aria-selected', x === b));
  wrap.querySelectorAll('.cp-panel').forEach(p => { p.hidden = +p.dataset.cp !== i; });
  ajustar(); try { Charts.mount(); } catch (e) { /* sin gráficas */ }
});
let ancho = wide();
window.addEventListener('resize', () => { if (wide() !== ancho) { ancho = wide(); try { render(); } catch (e) { /* sin pantalla */ } } else ajustar(); });
window.addEventListener('load', () => setTimeout(ajustar, 300));
})();
