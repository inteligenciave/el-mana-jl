/* Manuales por puesto dentro de Ayuda. Cada puesto ve el suyo; Gerencia ve los seis.
   Los textos salen de docs/manuales/*.md (generados en manuales-datos.js). No toca primeros-pasos.js: envuelve scrAyuda. */
(function () {
  const D = window.MANUALES_DATA || {};
  const POR_ROL = {dueno: 'gerencia', adm: 'administracion', produccion: 'produccion', empaque: 'logistica', ventas: 'ventas', rrhh: 'recursos-humanos'};
  const PDF = {gerencia: 'Gerencia', administracion: 'Administracion', produccion: 'Produccion', logistica: 'Logistica', ventas: 'Ventas', 'recursos-humanos': 'Recursos-humanos'};
  const ORDEN = ['gerencia', 'administracion', 'produccion', 'logistica', 'ventas', 'recursos-humanos'];
  const st = document.createElement('style');
  st.textContent = '.mn{max-width:860px;margin:0 auto}.mn h2{font-size:20px;margin:22px 0 8px;color:#C92121}.mn h3{font-size:16px;margin:16px 0 6px}.mn ol{padding-left:24px;margin:6px 0}.mn li{margin:6px 0;line-height:1.45;font-size:15px}.mn p{line-height:1.45;font-size:15px}.mn hr{border:0;border-top:1px solid #ddd;margin:18px 0}.mn figure{margin:10px 0}.mn img{display:block;width:100%;height:auto;border:1px solid #ddd;border-radius:6px}.mn figcaption{font-size:12px;color:#666;margin-top:4px}.mn-nota{background:#FFF7DD;border-left:4px solid #F2B72E;padding:8px 12px;margin:8px 0;font-size:14px;border-radius:4px;line-height:1.4}.mn-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px}.mn-bar .mn-pdf{margin-left:auto;background:#C92121;color:#fff;text-decoration:none;padding:9px 14px;border-radius:8px;font-weight:700;font-size:14px}.mn-sel{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}.mn-sel button{border:1px solid #C92121;background:#fff;color:#C92121;border-radius:999px;padding:6px 12px;font-weight:600;cursor:pointer}.mn-sel button[aria-current="true"]{background:#C92121;color:#fff}';
  document.head.appendChild(st);
  function vista() {
    const prop = POR_ROL[S.rol], todos = S.rol === 'dueno';
    let k = prop; if (todos) k = D[S.mnPuesto] ? S.mnPuesto : 'gerencia';
    const m = D[k]; if (!m) return '<p>El manual de este puesto todavía no está disponible.</p>';
    const sel = todos ? '<div class="mn-sel" role="group" aria-label="Puesto">' + ORDEN.map(x => '<button type="button" data-act="mnPuesto" data-p="' + x + '"' + (x === k ? ' aria-current="true"' : '') + '>' + D[x].n + '</button>').join('') + '</div>' : '';
    return '<div class="mn">' + sel + '<div class="mn-bar"><h2 style="margin:0">Manual de ' + m.n + '</h2><a class="mn-pdf" href="/manuales/pdf/Manual-' + PDF[k] + '.pdf" download>Descargar PDF</a></div>' + m.html + '</div>';
  }
  Object.assign(ACT, {mnPuesto: el => { S.mnPuesto = el.dataset.p; render(); }});
  const orig = window.scrAyuda;
  window.scrAyuda = function () {
    let h = orig.apply(this, arguments);
    if (!POR_ROL[S.rol]) return h;
    const activa = S.ayTab === 'mnl';
    const rotulo = S.rol === 'dueno' ? 'Manuales por puesto' : 'Manual de mi puesto';
    const boton = '<button type="button" class="v-tab" data-act="ayTab" data-t="mnl"' + (activa ? ' aria-current="page"' : '') + '>' + rotulo + '</button>';
    if (activa) h = h.replace(' aria-current="page"', '');
    h = h.replace('</nav>', boton + '</nav>');
    if (activa) h = h.replace(/<div class="un-panel">[\s\S]*$/, '<div class="un-panel">' + vista() + '</div>');
    return h;
  };
})();
