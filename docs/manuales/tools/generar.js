/* Convierte los .md de los manuales en: datos para la app, página de impresión y copia de imágenes. */
const fs = require('fs'), path = require('path');
const M = path.join(__dirname, '..'), CF = path.join(M, '..', '..', 'cloudflare');
const PUESTOS = [['gerencia','Gerencia'],['administracion','Administración'],['produccion','Producción'],['logistica','Logística'],['ventas','Ventas'],['recursos-humanos','Recursos humanos']];
const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const inl = s => esc(s).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/`(.+?)`/g,'<code>$1</code>');
function conv(md, base) {
  const out = []; let ol = false, nImg = 0, nPasos = 0, nota = [];
  const cierraOl = () => { if (ol) { out.push('</ol>'); ol = false; } };
  const cierraNota = () => { if (nota.length) { out.push('<div class="mn-nota">' + nota.map(inl).join('<br>') + '</div>'); nota = []; } };
  for (const raw of md.split(/\r?\n/)) {
    const l = raw.trimEnd(); let m;
    if (!l.trim()) { continue; }
    if ((m = l.match(/^> ?(.*)$/))) { cierraOl(); nota.push(m[1]); continue; }
    cierraNota();
    if ((m = l.match(/^# (.*)$/))) { cierraOl(); continue; }
    if ((m = l.match(/^## (.*)$/))) { cierraOl(); out.push('<h2>' + inl(m[1]) + '</h2>'); continue; }
    if ((m = l.match(/^### (.*)$/))) { cierraOl(); out.push('<h3>' + inl(m[1]) + '</h3>'); continue; }
    if (/^---+$/.test(l)) { cierraOl(); out.push('<hr>'); continue; }
    if ((m = l.match(/^!\[(.*?)\]\((.*?)\)$/))) { cierraOl(); nImg++; out.push('<figure><img src="' + base + path.basename(m[2]) + '" alt="' + esc(m[1]) + '" loading="lazy"><figcaption>' + esc(m[1]) + '</figcaption></figure>'); continue; }
    if ((m = l.match(/^(\d+)\. (.*)$/))) { if (!ol) { out.push('<ol start="' + m[1] + '">'); ol = true; } nPasos++; out.push('<li>' + inl(m[2]) + '</li>'); continue; }
    cierraOl(); out.push('<p>' + inl(l) + '</p>');
  }
  cierraOl(); cierraNota();
  return {html: out.join('\n'), nImg, nPasos};
}
const datos = {}, res = [];
fs.mkdirSync(path.join(M, 'print'), {recursive: true});
for (const [slug, nombre] of PUESTOS) {
  const md = fs.readFileSync(path.join(M, slug + '.md'), 'utf8');
  const a = conv(md, '/manuales/img/'), b = conv(md, '../img/');
  datos[slug] = {n: nombre, html: a.html, pasos: a.nPasos, fotos: a.nImg};
  fs.writeFileSync(path.join(M, 'print', slug + '.html'), b.html);
  res.push(slug + ': ' + a.nPasos + ' pasos, ' + a.nImg + ' capturas');
}
const dir = path.join(CF, 'public', 'manuales', 'img'); fs.mkdirSync(dir, {recursive: true});
for (const f of fs.readdirSync(path.join(M, 'img'))) if (f.endsWith('.png')) fs.copyFileSync(path.join(M, 'img', f), path.join(dir, f));
fs.writeFileSync(path.join(CF, 'front', 'comun', 'manuales-datos.js'), '/* GENERADO por docs/manuales/tools/generar.js desde docs/manuales/*.md: no editar a mano. */\nwindow.MANUALES_DATA = ' + JSON.stringify(datos) + ';\n');
console.log(res.join('\n'));
