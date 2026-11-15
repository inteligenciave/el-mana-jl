/* Generador mínimo de PDF (sin librerías, sin internet): arma el ARCHIVO PDF real de una nota de entrega o factura
   a partir del JSON que entrega el servidor (/pdf/pedido/:id o /pdf/documento/:id). Lo usan Ventas y el portal del cliente.
   Fuentes estándar Helvetica (vienen en todo lector de PDF); logo JPEG incrustado. El texto queda legible/extraíble. */
const ElManaPDF = (() => {
  const RED = [0.788, 0.129, 0.129], YEL = [0.949, 0.718, 0.18], INK = [0.1, 0.1, 0.1], GRY = [0.42, 0.42, 0.42], LINE = [0.8, 0.8, 0.8], SOFT = [0.97, 0.95, 0.9];
  const W = 595.28, H = 841.89, M = 40;
  /* Anchos Helvetica / Helvetica-Bold (AFM) de los caracteres 32..126, en milésimas de punto */
  const WR = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  const WB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
  const CP = {'€': 128, '‚': 130, '„': 132, '…': 133, '‘': 145, '’': 146, '“': 147, '”': 148, '•': 149, '–': 150, '—': 151, '™': 153};
  const baseDe = c => { const s = c.normalize('NFD').replace(/[̀-ͯ]/g, ''); return s.length ? s.charCodeAt(0) : 63; };
  const cod = ch => { const c = ch.charCodeAt(0); if (c >= 32 && c < 127) return c; if (CP[ch]) return CP[ch]; if (c >= 160 && c < 256) return c; return 63; };
  const bytesTxt = t => { let o = ''; for (const ch of String(t == null ? '' : t)) o += String.fromCharCode(cod(ch)); return o; };
  const esc = s => s.replace(/[\\()]/g, m => '\\' + m);
  const anchoCh = (ch, b) => { const c = ch.charCodeAt(0); const k = c >= 32 && c < 127 ? c : (c >= 160 && c < 256 ? baseDe(ch) : 63); return ((b ? WB : WR)[(k >= 32 && k < 127 ? k : 63) - 32]) || 556; };
  const ancho = (t, sz, b) => { let a = 0; for (const ch of String(t == null ? '' : t)) a += anchoCh(ch, b); return a * sz / 1000; };
  const f2 = n => (Math.round(n * 100) / 100).toFixed(2);
  function envolver(t, sz, b, max) {
    const pal = String(t == null ? '' : t).split(/\s+/).filter(Boolean), out = []; let cur = '';
    for (let w of pal) {
      while (ancho(w, sz, b) > max) { let k = w.length; while (k > 1 && ancho(w.slice(0, k), sz, b) > max) k--; if (cur) { out.push(cur); cur = ''; } out.push(w.slice(0, k)); w = w.slice(k); }
      const prueba = cur ? cur + ' ' + w : w;
      if (ancho(prueba, sz, b) <= max) cur = prueba; else { if (cur) out.push(cur); cur = w; }
    }
    if (cur) out.push(cur); return out.length ? out : [''];
  }
  const N = (n, d = 2) => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('es-VE', {minimumFractionDigits: d, maximumFractionDigits: d});
  const usd = n => 'US$ ' + N(n);
  const bs = n => 'Bs ' + N(n);
  const fecha = f => { const m = String(f || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '/' + m[2] + '/' + m[1] : String(f || ''); };

  /* ---- lienzo de páginas ---- */
  function Lienzo() {
    const pags = []; let c = null;
    const col = (a, st) => a.map(x => x.toFixed(3)).join(' ') + (st ? ' RG' : ' rg');
    const cmdRect = (x, y, w, h, relleno, borde) => { const o = ['q']; if (relleno) o.push(col(relleno)); if (borde) o.push(col(borde, 1) + ' 0.6 w'); o.push(`${f2(x)} ${f2(H - y - h)} ${f2(w)} ${f2(h)} re ${relleno && borde ? 'B' : relleno ? 'f' : 'S'}`, 'Q'); return o; };
    return {
      nueva() { c = []; pags.push(c); },
      get pags() { return pags; },
      rect(x, y, w, h, relleno, borde) { c.push(...cmdRect(x, y, w, h, relleno, borde)); },
      marca() { return c.length; },
      rectAntes(pos, x, y, w, h, relleno, borde) { c.splice(pos, 0, ...cmdRect(x, y, w, h, relleno, borde)); },
      linea(x1, y1, x2, y2, color = LINE, g = 0.6) { c.push(`q ${col(color, 1)} ${g} w ${f2(x1)} ${f2(H - y1)} m ${f2(x2)} ${f2(H - y2)} l S Q`); },
      /* y = línea base (desde arriba); al = 'l' | 'r' | 'c' alrededor de x */
      texto(t, x, y, sz = 9, o = {}) {
        const s = String(t == null ? '' : t); if (!s) return; const b = !!o.b, w = ancho(s, sz, b);
        const xx = o.al === 'r' ? x - w : o.al === 'c' ? x - w / 2 : x;
        c.push(`BT ${col(o.color || INK)} /${b ? 'F2' : 'F1'} ${sz} Tf ${f2(xx)} ${f2(H - y)} Td (${esc(bytesTxt(s))}) Tj ET`);
      },
      imagen(x, y, w, h) { c.push(`q ${f2(w)} 0 0 ${f2(h)} ${f2(x)} ${f2(H - y - h)} cm /Im1 Do Q`); }
    };
  }

  function armar(paginas, logo, titulo) {
    const objs = []; const add = s => { objs.push(s); return objs.length; };
    const catalogo = add(''), arbol = add(''), f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'), f2o = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    let im = 0; if (logo) im = add({stream: logo.bytes, dic: `/Type /XObject /Subtype /Image /Width ${logo.w} /Height ${logo.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`});
    const kids = [];
    for (const cont of paginas) {
      const flujo = cont.join('\n'), cs = add({stream: flujo, dic: ''});
      const pg = add(`<< /Type /Page /Parent ${arbol} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2o} 0 R >>${im ? ` /XObject << /Im1 ${im} 0 R >>` : ''} >> /Contents ${cs} 0 R >>`);
      kids.push(pg + ' 0 R');
    }
    const info = add(`<< /Title (${esc(bytesTxt(titulo))}) /Producer (El Mana JL) /Creator (El Mana JL) >>`);
    objs[catalogo - 1] = `<< /Type /Catalog /Pages ${arbol} 0 R >>`;
    objs[arbol - 1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
    let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'; const pos = [];
    objs.forEach((o, i) => {
      pos.push(out.length); out += `${i + 1} 0 obj\n`;
      if (typeof o === 'string') out += o + '\nendobj\n';
      else { const s = o.stream; out += `<< ${o.dic} /Length ${s.length} >>\nstream\n` + s + '\nendstream\nendobj\n'; }
    });
    const xr = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + pos.map(p => String(p).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length + 1} /Root ${catalogo} 0 R /Info ${info} 0 R >>\nstartxref\n${xr}\n%%EOF\n`;
    const u = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) u[i] = out.charCodeAt(i) & 255; return u;
  }

  /* ---- el documento ---- */
  function generar(d, logo) {
    const L = Lienzo(), T = d.totales || {}, E = d.empresa || {}, cli = d.cliente || {}, envio = d.envio || {};
    const lineas = d.lineas || [], pedido = d.kind === 'pedido';
    const nPag = () => L.pags.length;
    const franja = () => { L.rect(0, 0, W, 9, RED); L.rect(0, 9, W, 3.5, YEL); };
    L.nueva(); franja();
    /* encabezado: logo + empresa | tipo y número */
    let x0 = M; if (logo) { L.imagen(M, 26, 52, 52 * logo.h / logo.w); x0 = M + 62; }
    L.texto(E.razon || 'El Maná JL', x0, 44, 15, {b: 1, color: RED});
    const datos = [E.rif && 'RIF ' + E.rif, E.telefono && 'Tel. ' + E.telefono].filter(Boolean).join('  ·  ');
    if (datos) L.texto(datos, x0, 58, 8.5, {color: GRY});
    let yy = 69; for (const ln of envolver(E.direccion || '', 8.5, 0, 280).slice(0, 2)) { if (ln) { L.texto(ln, x0, yy, 8.5, {color: GRY}); yy += 11; } }
    L.texto(d.titulo, W - M, 44, 18, {b: 1, al: 'r', color: INK});
    L.texto('N.º ' + d.numero, W - M, 61, 12, {b: 1, al: 'r', color: RED});
    if (d.nro_fiscal) L.texto('Factura fiscal ' + d.nro_fiscal, W - M, 74, 9, {al: 'r'});
    L.texto('Fecha de emisión: ' + fecha(d.fecha), W - M, d.nro_fiscal ? 86 : 75, 9.5, {al: 'r'});
    let y = 100;
    if (pedido) {
      L.rect(M, y, W - 2 * M, 22, YEL); L.texto(d.rotulo, M + 8, y + 15, 10, {b: 1});
      L.texto('Aún no despachado', W - M - 8, y + 15, 9, {al: 'r', b: 1}); y += 30;
    }
    /* datos del cliente y condiciones (dos columnas) */
    const colW = (W - 2 * M - 12) / 2, campo = (x, y0, rot, val, ancho0) => {
      L.texto(rot.toUpperCase(), x, y0, 7, {b: 1, color: GRY}); let yl = y0 + 11;
      for (const ln of envolver(val || '—', 9.5, 0, ancho0)) { L.texto(ln, x, yl, 9.5); yl += 11.5; } return yl;
    };
    const filaTop = y, posCajas = L.marca(); y += 4;
    let yA = y + 10, yB = y + 10; const xB = M + colW + 12;
    yA = campo(M + 8, yA, 'Cliente', cli.razon, colW - 16) + 3; yA = campo(M + 8, yA, 'RIF', cli.rif, colW - 16) + 3;
    if (cli.vendedor) yA = campo(M + 8, yA, 'Vendedor', cli.vendedor, colW - 16) + 3;
    const ub = [envio.estado && 'Estado: ' + envio.estado, envio.zona && 'Zona: ' + envio.zona, envio.direccion && 'Dirección: ' + envio.direccion].filter(Boolean).join('  ·  ');
    yA = campo(M + 8, yA, 'Ubicación de envío', ub || 'Falta completar la zona y la dirección de entrega', colW - 16) + 3;
    yB = campo(xB + 8, yB, 'Tasa BCV del día de emisión', d.tasa ? `${N(d.tasa.valor, 4)} Bs por US$ 1  (${fecha(d.tasa.fecha)})` : 'Sin tasa guardada para esa fecha', colW - 16) + 3;
    yB = campo(xB + 8, yB, 'Condición de pago', [d.condicion, d.plazo].filter(Boolean).join(' · ') + (d.vence ? ' · vence el ' + fecha(d.vence) : ''), colW - 16) + 3;
    const bk = d.banco ? [d.banco.nombre, d.banco.cuenta && 'Cuenta ' + d.banco.cuenta, d.banco.titular && 'Titular: ' + d.banco.titular].filter(Boolean).join(' · ') : 'No se eligió un banco';
    yB = campo(xB + 8, yB, 'Cuenta bancaria para el pago', bk, colW - 16) + 3;
    const alto = Math.max(yA, yB) - filaTop + 2;
    L.rectAntes(posCajas, xB, filaTop, colW, alto, SOFT, LINE); L.rectAntes(posCajas, M, filaTop, colW, alto, SOFT, LINE);
    y = filaTop + alto + 14;
    /* tabla */
    const cols = [{h: 'Producto', x: M + 6, w: 214, al: 'l'}, {h: 'Bultos', x: M + 290, al: 'r'}, {h: 'Kilos', x: M + 352, al: 'r'}, {h: 'Precio x bulto', x: M + 432, al: 'r'}, {h: 'Total US$', x: W - M - 6, al: 'r'}];
    const cabTabla = () => { L.rect(M, y, W - 2 * M, 18, RED); for (const c of cols) L.texto(c.h, c.x, y + 12.5, 8.5, {b: 1, al: c.al, color: [1, 1, 1]}); y += 18; };
    cabTabla();
    const limite = () => H - 150;
    if (!lineas.length) { L.texto('Documento importado del Excel: no trae detalle de productos, solo el monto total.', M + 6, y + 16, 9, {color: GRY}); y += 28; }
    lineas.forEach((l, i) => {
      const nom = envolver(l.nombre, 9, 0, cols[0].w), h = Math.max(1, nom.length) * 11 + 8;
      if (y + h > limite()) { L.nueva(); franja(); y = 36; cabTabla(); }
      if (i % 2) L.rect(M, y, W - 2 * M, h, [0.985, 0.985, 0.985]);
      nom.forEach((t, k) => L.texto(t, cols[0].x, y + 12 + k * 11, 9));
      L.texto(N(l.bultos, 0), cols[1].x, y + 12, 9, {al: 'r', b: 1}); L.texto(l.kg != null ? N(l.kg, 2) + ' kg' : '—', cols[2].x, y + 12, 9, {al: 'r'});
      L.texto(usd(l.precio_bulto), cols[3].x, y + 12, 9, {al: 'r'}); L.texto(usd(l.total), cols[4].x, y + 12, 9, {al: 'r', b: 1});
      L.linea(M, y + h, W - M, y + h); y += h;
    });
    /* totales */
    if (y + 170 > H - 60) { L.nueva(); franja(); y = 36; }
    y += 12; const tx = W - M - 230, tw = 230, fila = (rot, val, o = {}) => { L.texto(rot, tx + 8, y + 11, o.sz || 9.5, {b: o.b, color: o.color}); L.texto(val, tx + tw - 8, y + 11, o.sz || 9.5, {al: 'r', b: o.b, color: o.color}); y += o.h || 16; };
    const y0 = y;
    L.texto('Bultos: ' + N(T.bultos, 0), M, y + 11, 9.5, {b: 1}); L.texto('Kilos totales: ' + (T.kilos != null ? N(T.kilos, 2) + ' kg' : '—'), M, y + 27, 9.5, {b: 1});
    fila('Subtotal', usd(T.subtotal)); if (T.descuento) fila('Descuento' + (T.descuento_pct ? ' ' + N(T.descuento_pct, 2) + ' %' : ''), '- ' + usd(T.descuento));
    fila('IVA', usd(T.iva)); L.rect(tx, y - 1, tw, 24, RED); y += 1; fila('TOTAL US$', usd(T.total), {b: 1, color: [1, 1, 1], sz: 11, h: 24});
    fila('Total en Bs' + (d.tasa ? ' (tasa ' + N(d.tasa.valor, 2) + ')' : ''), T.total_bs != null ? bs(T.total_bs) : '—', {b: 1});
    L.linea(tx, y0 - 2, tx + tw, y0 - 2, YEL, 1.5);
    y += 6;
    if (d.observaciones) { for (const ln of envolver('Observaciones: ' + d.observaciones, 8.5, 0, W - 2 * M)) { L.texto(ln, M, y + 10, 8.5, {color: GRY}); y += 11; } y += 4; }
    if (d.aviso) { const ls = envolver(d.aviso, 8.5, 0, W - 2 * M - 16); L.rect(M, y, W - 2 * M, ls.length * 11 + 8, [1, 0.97, 0.85], YEL); ls.forEach((t, k) => L.texto(t, M + 8, y + 13 + k * 11, 8.5)); y += ls.length * 11 + 14; }
    /* firmas y pie */
    if (y + 34 > H - 70) { L.nueva(); franja(); y = 60; }
    const yfi = Math.max(y + 34, H - 100);
    L.linea(M, yfi, M + 170, yfi, INK, 0.6); L.linea(W - M - 170, yfi, W - M, yfi, INK, 0.6);
    L.texto(pedido ? 'Vendedor' : 'Despachado por', M, yfi + 11, 8.5, {color: GRY}); L.texto('Recibido conforme', W - M - 170, yfi + 11, 8.5, {color: GRY});
    const total = nPag();
    /* pie con número de página en cada hoja */
    const pie = [];
    for (let i = 0; i < total; i++) { L.pags[i].push(`BT ${RED.map(v => v.toFixed(3)).join(' ')} rg /F1 7.5 Tf ${M} ${f2(24)} Td (${esc(bytesTxt(d.titulo + ' ' + d.numero + ' · ' + (E.razon || 'El Maná JL')))}) Tj ET`);
      const pg = 'Página ' + (i + 1) + ' de ' + total; L.pags[i].push(`BT 0.42 0.42 0.42 rg /F1 7.5 Tf ${f2(W - M - ancho(pg, 7.5))} ${f2(24)} Td (${esc(bytesTxt(pg))}) Tj ET`); }
    return armar(L.pags.map(p => p.map(String)), logo, d.titulo + ' ' + d.numero);
  }

  /* Logo: cualquier imagen (data URL o ruta del mismo sitio) → JPEG RGB sobre fondo blanco, para incrustarlo sin librerías */
  function cargarLogo(src) {
    return new Promise(res => {
      if (!src || typeof Image === 'undefined') return res(null);
      const im = new Image();
      im.onload = () => {
        try {
          const w = Math.min(im.naturalWidth, 200), h = Math.round(w * im.naturalHeight / im.naturalWidth), cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.drawImage(im, 0, 0, w, h);
          const b = atob(cv.toDataURL('image/jpeg', 0.9).split(',')[1]); res({bytes: b, w, h});
        } catch (e) { res(null); }
      };
      im.onerror = () => res(null); im.src = src;
    });
  }
  function bajar(bytes, nombre) {
    const blob = new Blob([bytes], {type: 'application/pdf'}), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 15000);
  }
  /* Punto de entrada: datos del servidor → archivo descargado */
  async function descargar(d, logoSrc) {
    const bytes = generar(d, await cargarLogo(logoSrc)); bajar(bytes, d.archivo || 'Documento.pdf'); return bytes;
  }
  return {generar, descargar, cargarLogo};
})();
