const fs = require('fs'), path = require('path');
const {chromium} = require('C:/Users/Aleja/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright-core');
const M = path.join(__dirname, '..'), CF = path.join(M, '..', '..', 'cloudflare');
const P = [['gerencia','Gerencia','Gerencia'],['administracion','Administración','Administracion'],['produccion','Producción','Produccion'],['logistica','Logística','Logistica'],['ventas','Ventas','Ventas'],['recursos-humanos','Recursos humanos','Recursos-humanos']];
const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(CF, 'public', 'icon-192.png')).toString('base64');
const css = `@page{size:Letter;margin:16mm 15mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;font-size:15pt;line-height:1.45;margin:0}
.portada{height:245mm;background:#C92121;color:#fff;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;page-break-after:always;border-bottom:14px solid #F2B72E}
.portada img{width:130px;height:130px;border-radius:24px;background:#fff;padding:8px;margin-bottom:30px}.portada .t{font-size:20pt;letter-spacing:2px;text-transform:uppercase;color:#F2B72E;font-weight:700}.portada h1{font-size:50pt;margin:10px 0 18px;line-height:1.1}.portada .s{font-size:16pt;max-width:130mm}
h2{font-size:21pt;color:#C92121;margin:20px 0 8px;border-bottom:3px solid #F2B72E;padding-bottom:3px;page-break-after:avoid}h3{font-size:17pt;margin:14px 0 6px;page-break-after:avoid}
ol{padding-left:26px;margin:6px 0}li{margin:7px 0;page-break-inside:avoid}p{margin:6px 0}hr{display:none}
figure{margin:12px 0;page-break-inside:avoid;text-align:center}img.c,figure img{width:100%;border:1.5px solid #bbb;border-radius:6px}figcaption{font-size:11pt;color:#555;margin-top:3px}
.mn-nota{background:#FFF7DD;border-left:6px solid #F2B72E;padding:8px 12px;margin:10px 0;font-size:13.5pt;page-break-inside:avoid}b{color:#111}`;
(async () => {
  const b = await chromium.launch(); fs.mkdirSync(path.join(M, 'pdf'), {recursive: true});
  for (const [slug, nombre, f] of P) {
    const cuerpo = fs.readFileSync(path.join(M, 'print', slug + '.html'), 'utf8').split(' loading="lazy"').join('');
    const html = `<!doctype html><html lang="es"><meta charset="utf-8"><title>Manual de ${nombre}</title><style>${css}</style><body><section class="portada"><img src="${logo}" alt=""><div class="t">El Maná JL</div><h1>Manual de<br>${nombre}</h1><div class="s">Pasos cortos, con el nombre exacto de cada botón y pantalla</div></section>${cuerpo}</body></html>`;
    const hp = path.join(M, 'print', slug + '-pdf.html'); fs.writeFileSync(hp, html);
    const pg = await b.newPage(); await pg.goto('file:///' + hp.split(path.sep).join('/'), {waitUntil: 'load'});
    await pg.evaluate(() => Promise.all([...document.images].map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; }))));
    const out = path.join(M, 'pdf', 'Manual-' + f + '.pdf');
    await pg.pdf({path: out, format: 'Letter', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: '<div style="font-size:9px;width:100%;text-align:center;color:#666">Manual de ' + nombre + ' · El Maná JL · página <span class="pageNumber"></span> de <span class="totalPages"></span></div>', margin: {top: '16mm', bottom: '18mm', left: '15mm', right: '15mm'}});
    console.log(out, Math.round(fs.statSync(out).size / 1024) + ' KB'); await pg.close();
    fs.unlinkSync(hp);
  }
  await b.close();
})();
