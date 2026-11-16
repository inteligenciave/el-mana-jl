/* Importación única desde el Excel de cobranza. Se lee en el navegador (SheetJS), se muestra una vista previa, la persona confirma
   la limpieza de nombres (nunca se fusiona solo) y se envía por lotes pequeños. El archivo no se modifica ni se sube entero. */
const VI_COLS = {vend: 0, zona: 1, fecha: 2, ne: 3, cliente: 4, total: 5, fechaPago: 8, bs: 9, tasa: 10, banco: 12, ref: 13};
const vImp = () => V.imp ||= {estado: 'vacio', archivo: '', notas: [], avisos: [], hojas: 0, sinRef: 0, grupos: [], gsel: {}, ejemplo: false, prog: 0, res: null};
function vCargarXLSX() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((ok, ko) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = ok; s.onerror = () => ko(new Error('No se pudo cargar el lector de Excel. Revisa la conexión a internet.')); document.head.appendChild(s); });
}
function vFechaCelda(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') { const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null; }
  if (v instanceof Date) return v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0');
  const s = String(v).trim(); let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/); if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  return null;
}
const vNumCelda = v => { if (v == null || v === '') return NaN; if (typeof v === 'number') return v; return vNum(v); };
const vTextoCelda = v => v == null ? '' : String(v).trim().replace(/\s+/g, ' ');

/* Lee todas las hojas con el formato de 15 columnas. Las filas sin N/E con pagos son abonos adicionales de la nota anterior. */
function vImpLeer(wb) {
  const notas = [], avisos = [], vistos = new Map(); let hojas = 0;
  for (const nombre of wb.SheetNames) {
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[nombre], {header: 1, raw: true, defval: null});
    const h = filas.findIndex(r => vTextoCelda(r[0]).toUpperCase() === 'VENDEDOR' && r.length >= 10);
    if (h < 0) { avisos.push(`La hoja «${nombre.trim()}» no tiene la fila de títulos (VENDEDOR…): se omitió.`); continue; }
    hojas++; let actual = null;
    for (let i = h + 1; i < filas.length; i++) {
      const r = filas[i]; if (!r || r.every(c => c == null || c === '')) continue;
      const ne = vTextoCelda(r[VI_COLS.ne]), cli = vTextoCelda(r[VI_COLS.cliente]), bs = vNumCelda(r[VI_COLS.bs]);
      if (ne && cli) {
        const monto = Math.round(vNumCelda(r[VI_COLS.total]) * 100) / 100, fecha = vFechaCelda(r[VI_COLS.fecha]);
        if (!(monto > 0) || !fecha) { avisos.push(`Hoja «${nombre.trim()}», fila ${i + 1}: la nota ${ne} no tiene monto o fecha válidos: se omitió.`); actual = null; continue; }
        if (vistos.has(ne)) { avisos.push(`La nota ${ne} aparece más de una vez (hoja «${nombre.trim()}»): se usa la primera.`); actual = null; continue; }
        actual = {numero: ne, fecha, cliente: cli, vendedor: vTextoCelda(r[VI_COLS.vend]), zona: vTextoCelda(r[VI_COLS.zona]), monto, pagos: [], hoja: nombre.trim()}; vistos.set(ne, true); notas.push(actual);
      } else if (!ne && bs > 0) {
        if (!actual) { avisos.push(`Hoja «${nombre.trim()}», fila ${i + 1}: hay un pago sin nota anterior: se omitió.`); continue; }
      } else if (ne && !cli) { avisos.push(`Hoja «${nombre.trim()}», fila ${i + 1}: la nota ${ne} no tiene cliente: se omitió.`); actual = null; continue; }
      else continue;
      if (!actual) continue;
      if (bs > 0) {
        const tasa = vNumCelda(r[VI_COLS.tasa]), fp = vFechaCelda(r[VI_COLS.fechaPago]);
        if (!(tasa > 0) || !fp) { avisos.push(`Hoja «${nombre.trim()}», fila ${i + 1}: un pago de la nota ${actual.numero} no tiene tasa o fecha: se omitió.`); continue; }
        actual.pagos.push({fecha: fp, bs: Math.round(bs * 100) / 100, tasa, banco: vTextoCelda(r[VI_COLS.banco]), ref: vTextoCelda(r[VI_COLS.ref])});
      }
    }
  }
  return {notas, avisos, hojas};
}
async function vImpArchivo(el) {
  const f = el.files && el.files[0]; if (!f) return; const I = vImp();
  Object.assign(I, {estado: 'leyendo', archivo: f.name, res: null, notas: [], avisos: [], grupos: [], gsel: {}}); render();
  try {
    await vCargarXLSX(); const wb = XLSX.read(await f.arrayBuffer(), {type: 'array'}), r = vImpLeer(wb);
    Object.assign(I, {notas: r.notas, avisos: r.avisos, hojas: r.hojas, estado: r.notas.length ? 'listo' : 'vacio'});
    I.sinRef = r.notas.reduce((t, n) => t + n.pagos.filter(p => !VD.normRef(p.ref)).length, 0);
    I.grupos = VD.sugerirGrupos([...new Set(r.notas.map(n => n.cliente))]);
    I.gsel = Object.fromEntries(I.grupos.map((g, i) => [i, {unificar: false, canon: g[0]}]));
    if (!r.notas.length) toast('No se encontraron notas en el archivo.', 'warn');
  } catch (e) { console.error(e); I.estado = 'vacio'; vErr(e); }
  render();
}
/* Nombre final de cada cliente: solo cambia si la persona confirmó unificar ese grupo */
function vImpMapa() {
  const I = vImp(), m = {};
  I.grupos.forEach((g, i) => { const s = I.gsel[i]; if (s && s.unificar) g.forEach(n => { m[n] = s.canon; }); });
  return m;
}
function vImpResumen() {
  const I = vImp(), m = vImpMapa(), nombres = new Set(I.notas.map(n => m[n.cliente] || n.cliente));
  return {notas: I.notas.length, pagos: I.notas.reduce((t, n) => t + n.pagos.length, 0), clientes: nombres.size, monto: I.notas.reduce((t, n) => t + n.monto, 0), sinPago: I.notas.filter(n => !n.pagos.length).length};
}
async function vImpEnviar() {
  const I = vImp(), m = vImpMapa(), TAM = 20; if (!I.notas.length) return;
  I.estado = 'enviando'; I.prog = 0; const tot = {notas: 0, notasOmitidas: [], pagos: 0, pagosOmitidos: [], clientesNuevos: 0, sinReferencia: 0}; render();
  try {
    for (let i = 0; i < I.notas.length; i += TAM) {
      const lote = I.notas.slice(i, i + TAM).map(n => ({...n, cliente: m[n.cliente] || n.cliente})), r = await vApi('POST', '/importar', {notas: lote, ejemplo: !!I.ejemplo});
      tot.notas += r.notas; tot.pagos += r.pagos; tot.clientesNuevos += r.clientesNuevos; tot.sinReferencia += r.sinReferencia; tot.notasOmitidas.push(...r.notasOmitidas); tot.pagosOmitidos.push(...r.pagosOmitidos);
      I.prog = Math.min(I.notas.length, i + TAM); render();
    }
    I.res = tot; I.estado = 'fin'; V.clientes = null; V.deuda.data = null; V.pagos.filas = null; V.adm.clientes = null; await vBoot(true);
  } catch (e) { console.error(e); I.estado = 'listo'; I.res = tot; vErr(e); }
  render();
}
function scrImportar() {
  return vPantalla(() => {
    const I = vImp(), m = vImpMapa();
    let cuerpo = '';
    if (I.estado === 'enviando') cuerpo = card('Importando…', `<div class="v-meter ok" role="progressbar" aria-valuenow="${I.prog}" aria-valuemax="${I.notas.length}"><span style="width:${I.prog / I.notas.length * 100}%"></span></div><p class="hint">${I.prog} de ${I.notas.length} notas enviadas. No cierres la página.</p>`);
    else if (I.estado === 'fin' && I.res) {
      const r = I.res;
      cuerpo = card('Importación terminada', `<div class="v-stats">${stat('Notas importadas', N0.format(r.notas))}${stat('Pagos importados', N0.format(r.pagos))}${stat('Clientes nuevos', N0.format(r.clientesNuevos))}${stat('Pagos sin referencia', N0.format(r.sinReferencia), 'quedaron marcados en la observación')}</div>
        ${r.notasOmitidas.length ? `<p class="hint"><b>Notas omitidas (${r.notasOmitidas.length}):</b> ${r.notasOmitidas.slice(0, 30).map(x => vtxt(x.numero) + ' (' + vtxt(x.motivo) + ')').join(', ')}${r.notasOmitidas.length > 30 ? '…' : ''}</p>` : ''}
        ${r.pagosOmitidos.length ? `<p class="hint"><b>Pagos omitidos (${r.pagosOmitidos.length}):</b> ${r.pagosOmitidos.slice(0, 30).map(x => vtxt(x.numero) + ' ' + vtxt(x.referencia || '') + ' (' + vtxt(x.motivo) + ')').join('; ')}</p>` : ''}
        
        <div class="btnrow"><a class="btn pri" href="#v-deuda">Ver quién debe</a><button type="button" class="btn" data-act="vImpOtro">Importar otro archivo</button></div>`);
    } else {
      const rs = I.estado === 'listo' ? vImpResumen() : null;
      cuerpo = card('1 · Elegir el archivo', `<div class="form">
        <label class="fld">Archivo Excel (.xlsx) del libro de un vendedor<input type="file" accept=".xlsx,.xls" data-act-change="vImpArchivo"></label>${I.estado === 'leyendo' ? '<p class="hint">Leyendo el archivo…</p>' : ''}</div>`);
      if (rs) {
        cuerpo += card('2 · Vista previa', `<div class="v-stats">${stat('Hojas leídas', N0.format(I.hojas))}${stat('Notas', N0.format(rs.notas), '$ ' + N2.format(rs.monto))}${stat('Pagos', N0.format(rs.pagos), rs.sinPago + ' nota(s) sin pagos')}${stat('Clientes', N0.format(rs.clientes), 'tras tu limpieza de nombres')}</div>
          ${I.sinRef ? `<p class="hint">${I.sinRef} pago(s) no traen referencia: se importan, pero quedan marcados y no se pueden comparar contra repetidos.</p>` : ''}
          ${I.avisos.length ? `<details class="v-det"><summary>${I.avisos.length} aviso(s) al leer el archivo</summary><ul class="list">${I.avisos.slice(0, 60).map(a => `<li>${vtxt(a)}</li>`).join('')}</ul></details>` : ''}
          ${table([{h: 'N/E', f: n => vtxt(n.numero)}, {h: 'Fecha', f: n => vfecha(n.fecha)}, {h: 'Cliente', f: n => vtxt(m[n.cliente] || n.cliente) + (m[n.cliente] && m[n.cliente] !== n.cliente ? ` <span class="muted">(en el archivo: ${vtxt(n.cliente)})</span>` : '')}, {h: 'Vendedor', f: n => vtxt(n.vendedor)}, {h: 'Monto $', r: 1, f: n => vusd(n.monto)}, {h: 'Pagos', r: 1, f: n => n.pagos.length}], I.notas.slice(0, 15), {empty: ''})}
          ${I.notas.length > 15 ? `<p class="hint">Se muestran las primeras 15 de ${I.notas.length} notas.</p>` : ''}`);
        cuerpo += card('3 · Limpieza de nombres (tú decides)', I.grupos.length ? `<p class="hint">Estos nombres se parecen. <b>Nada se junta solo</b>: marca «Unificar» solo en los grupos que de verdad son el mismo cliente y elige con qué nombre quedan.</p>
          ${I.grupos.map((g, i) => { const s = I.gsel[i]; return `<fieldset class="v-grupo"><legend>Grupo ${i + 1} · ${g.length} nombres</legend><div class="v-grupo-n">${g.map(n => `<label class="v-radio"><input type="radio" name="vg${i}" data-act-change="vGrupoCanon" data-g="${i}" data-n="${esc(n)}" ${s.canon === n ? 'checked' : ''}><span>${vtxt(n)}</span></label>`).join('')}</div>
            <label class="toggle"><input type="checkbox" data-act-change="vGrupoUnificar" data-g="${i}" ${s.unificar ? 'checked' : ''}><span>Son el mismo cliente: unificar con el nombre marcado</span></label></fieldset>`; }).join('')}`
          : '<p class="hint">No se encontraron nombres parecidos. Cada nombre del archivo será un cliente.</p>');
        cuerpo += card('4 · Importar', `<div class="form"><label class="toggle"><input type="checkbox" data-act-change="vImpEjemplo" ${I.ejemplo ? 'checked' : ''}><span>Marcar todo como datos de EJEMPLO (solo para pruebas; se puede borrar con un botón)</span></label>
          <div class="btnrow"><button type="button" class="btn pri" data-act="vImpEnviar">${ic('download', 16)}Importar ${rs.notas} notas</button></div></div>`);
      }
    }
    return `${vph('Ventas y liquidación', 'Importar del Excel de cobranza', 'Carga única del historial: notas por cobrar y pagos ya recibidos, con vista previa antes de guardar.')}${cuerpo}`;
  });
}
