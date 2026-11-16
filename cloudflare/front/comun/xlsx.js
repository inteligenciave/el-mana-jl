/* Generador mínimo de .xlsx (hoja de cálculo real de Excel), sin librerías ni internet.
   Un .xlsx es un ZIP con XML dentro: aquí se arma el ZIP «sin compresión» (store) con CRC32 y los XML mínimos.
   d = {hoja, titulo, subtitulo, cols: [{h, tipo: 'txt'|'usd'|'kg'|'int'|'pct', w}], filas: [[valor,…]], totales: [valor,…] | null, nota}
   Con título, periodo, encabezado en negrita con los colores de la marca, columnas anchas, formatos de número y fila de totales. */
const ElManaXLSX = (() => {
  const enc = new TextEncoder();
  const tabla = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = tabla[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[m])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const letra = i => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };

  /* ZIP sin compresión */
  function zip(archivos) {
    const partes = [], central = []; let pos = 0;
    const u16 = n => [n & 255, (n >> 8) & 255], u32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
    const fecha = new Date(), dosT = (fecha.getHours() << 11) | (fecha.getMinutes() << 5) | (fecha.getSeconds() >> 1), dosF = ((fecha.getFullYear() - 1980) << 9) | ((fecha.getMonth() + 1) << 5) | fecha.getDate();
    for (const [nombre, texto] of archivos) {
      const nom = enc.encode(nombre), dat = enc.encode(texto), crc = crc32(dat);
      const cab = [0x50, 0x4B, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosT), ...u16(dosF), ...u32(crc), ...u32(dat.length), ...u32(dat.length), ...u16(nom.length), ...u16(0)];
      partes.push(new Uint8Array(cab), nom, dat);
      central.push({nom, crc, n: dat.length, pos});
      pos += cab.length + nom.length + dat.length;
    }
    const iniC = pos;
    for (const c of central) {
      const cab = [0x50, 0x4B, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosT), ...u16(dosF), ...u32(c.crc), ...u32(c.n), ...u32(c.n), ...u16(c.nom.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(c.pos)];
      partes.push(new Uint8Array(cab), c.nom); pos += cab.length + c.nom.length;
    }
    partes.push(new Uint8Array([0x50, 0x4B, 5, 6, 0, 0, 0, 0, ...u16(central.length), ...u16(central.length), ...u32(pos - iniC), ...u32(iniC), 0, 0]));
    const total = partes.reduce((a, p) => a + p.length, 0), out = new Uint8Array(total); let o = 0; for (const p of partes) { out.set(p, o); o += p.length; } return out;
  }

  const ESTILO = {txt: 4, usd: 5, kg: 6, int: 7, pct: 8}, ESTILO_TOT = {txt: 9, usd: 10, kg: 11, int: 12, pct: 13};
  const ESTILOS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="3"><numFmt numFmtId="164" formatCode="&quot;$&quot;\\ #,##0.00"/><numFmt numFmtId="165" formatCode="#,##0.00"/><numFmt numFmtId="166" formatCode="0.00&quot;%&quot;"/></numFmts>' +
    '<fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="15"/><color rgb="FFC92121"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF6B6B6B"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF1A1A1A"/><name val="Calibri"/></font></fonts>' +
    '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFC92121"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2B72E"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFCCCCCC"/></left><right style="thin"><color rgb="FFCCCCCC"/></right><top style="thin"><color rgb="FFCCCCCC"/></top><bottom style="thin"><color rgb="FFCCCCCC"/></bottom><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="14">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
    '<xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
    '<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
    '<xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="164" fontId="4" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="165" fontId="4" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="3" fontId="4" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="166" fontId="4" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  function hoja(d) {
    const nc = d.cols.length, filas = []; let r = 0;
    const celda = (c, f, valor, estilo, num) => num && valor !== '' && valor != null && isFinite(valor) ? `<c r="${letra(c)}${f}" s="${estilo}"><v>${+valor}</v></c>` : `<c r="${letra(c)}${f}" s="${estilo}" t="inlineStr"><is><t xml:space="preserve">${esc(valor)}</t></is></c>`;
    const fila = (cells, alto) => { filas.push(`<row r="${++r}"${alto ? ` ht="${alto}" customHeight="1"` : ''}>${cells}</row>`); return r; };
    fila(celda(0, r + 1, d.titulo, 1), 24);
    fila(celda(0, r + 1, d.subtitulo || '', 2));
    fila('');
    const filaCab = fila(d.cols.map((c, i) => celda(i, r + 1, c.h, 3)).join(''), 30);
    d.filas.forEach(f => { const n = r + 1; fila(d.cols.map((c, i) => celda(i, n, f[i], ESTILO[c.tipo] || 4, c.tipo !== 'txt')).join('')); });
    if (d.totales) { const n = r + 1; fila(d.cols.map((c, i) => celda(i, n, d.totales[i], ESTILO_TOT[c.tipo] || 9, c.tipo !== 'txt')).join('')); }
    if (d.nota) { fila(''); fila(celda(0, r + 1, d.nota, 2)); }
    const anchos = d.cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.w || 16}" customWidth="1"/>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${letra(nc - 1)}${r}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${filaCab}" topLeftCell="A${filaCab + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${anchos}</cols><sheetData>${filas.join('')}</sheetData><pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="${nc > 5 ? 'landscape' : 'portrait'}"/></worksheet>`;
  }

  function generar(d) {
    const nombreHoja = esc(String(d.hoja || 'Reporte').replace(/[\\/?*\[\]:]/g, ' ').slice(0, 31));
    return zip([
      ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
      ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${nombreHoja}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
      ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
      ['xl/styles.xml', ESTILOS],
      ['xl/worksheets/sheet1.xml', hoja(d)]
    ]);
  }
  function descargar(d, nombre) {
    const bytes = generar(d), blob = new Blob([bytes], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 15000); return bytes;
  }
  return {generar, descargar};
})();
