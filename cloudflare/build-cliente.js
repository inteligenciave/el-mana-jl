/* Portal del cliente: arma public/cliente.html (página pública, aparte de la aplicación interna) y devuelve el JS y el CSS
   de las pantallas internas para que build.js los incluya en public/index.html. Lo llama build.js. */
const fs = require('fs'), path = require('path');
const leer = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const buscarJS = leer('front/comun/buscar.js'), buscarCSS = leer('front/comun/buscar.css'), portalJS = leer('front/cliente/portal.js'), entregasJS = leer('front/entregas/portal-entregas.js'), portalCSS = leer('front/cliente/portal.css'), pdfJS = leer('front/comun/pdf.js');
for (const [n, t] of [['buscar.js', buscarJS], ['portal.js', portalJS], ['pdf.js', pdfJS], ['portal-entregas.js', entregasJS]]) if (/<\/script/i.test(t)) throw new Error(n + ' contiene </script>');
const html = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<title>Mi cuenta · El Maná JL</title>\n<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><meta name="theme-color" content="#C92121">\n'
  + '<link rel="icon" href="/favicon.ico" sizes="any"><link rel="apple-touch-icon" href="/apple-touch-icon.png">\n<style>' + buscarCSS + '\n' + portalCSS + '</style></head>\n<body><div id="app"></div><div id="toast" aria-live="polite"></div>\n<noscript><p style="padding:20px">Para ver tu cuenta necesitas activar JavaScript.</p></noscript>\n<script>\n' + leer('front/comun/borrador.js') + '\n</script>\n<script>\n' + buscarJS + '\n</script>\n<script>\n' + pdfJS + '\n</script>\n<script>\n' + entregasJS + '\n</script>\n<script>\n' + portalJS + '\n</script></body></html>';
const out = path.join(__dirname, 'public', 'cliente.html');
fs.mkdirSync(path.dirname(out), {recursive: true}); fs.writeFileSync(out, html);
console.log('ok', out, html.length, 'bytes');
const equipoJS = ['(function () {', '"use strict";', leer('front/cliente/c-equipo.js'), '})();'].join('\n');
if (/<\/script/i.test(equipoJS)) throw new Error('c-equipo.js contiene </script>');
module.exports = {equipoJS, equipoCSS: leer('front/cliente/cliente.css')};
