/* Genera public/index.html desde ../sistema-produccion.html (la misma app del Artifact) y activa la capa de datos de la API.
   Uso: node build.js */
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, 'app-source.html'), out = path.join(__dirname, 'public', 'index.html');
let h = fs.readFileSync(src, 'utf8');
if (!h.includes('makeHttpBackend')) throw new Error('La app no trae la capa de datos HTTP: reconstruye sistema-produccion.html');
const SITE = 'https://elmana-jl.talosbot.workers.dev';
const TITLE = 'El Maná JL — Seguimiento productivo';
const DESC = 'Seguimiento productivo de El Maná JL: producción, compras, inventario y cobranza en un solo lugar.';
const ALT = 'El Maná JL: seguimiento productivo. Producción, compras, inventario y cobranza.';
const esc = t => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const metas = [
  '<title>' + TITLE + '</title>',
  '<meta name="description" content="' + esc(DESC) + '">',
  '<meta name="theme-color" content="#C92121">',
  '<link rel="icon" href="/favicon.ico" sizes="any">',
  '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
  '<link rel="manifest" href="/site.webmanifest">',
  '<meta property="og:type" content="website">',
  '<meta property="og:site_name" content="El Maná JL">',
  '<meta property="og:title" content="' + esc(TITLE) + '">',
  '<meta property="og:description" content="' + esc(DESC) + '">',
  '<meta property="og:locale" content="es_VE">',
  '<meta property="og:url" content="' + SITE + '/">',
  '<meta property="og:image" content="' + SITE + '/og-banner.png">',
  '<meta property="og:image:type" content="image/png">',
  '<meta property="og:image:width" content="1200">',
  '<meta property="og:image:height" content="630">',
  '<meta property="og:image:alt" content="' + esc(ALT) + '">',
  '<meta name="twitter:card" content="summary_large_image">',
  '<meta name="twitter:title" content="' + esc(TITLE) + '">',
  '<meta name="twitter:description" content="' + esc(DESC) + '">',
  '<meta name="twitter:image" content="' + SITE + '/og-banner.png">',
  '<meta name="twitter:image:alt" content="' + esc(ALT) + '">'
].join('\n');
h = h.replace(/<title>[^<]*<\/title>\s*/, '');

/* Módulo de Ventas y Liquidación: dominio y permisos (los MISMOS archivos que usa el Worker, sin `export`) + front/ventas/*.js y .css */
const leer = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
function comoModulo(archivo, nombre) {
  const nombres = [];
  const t = leer(archivo).replace(/^export\s+(async\s+)?(function|const|let)\s+([A-Za-z0-9_$]+)/gm, (m, a, k, n) => { nombres.push(n); return (a || '') + k + ' ' + n; });
  if (/^\s*import\s/m.test(t)) throw new Error(archivo + ' no puede importar nada para ir en la página');
  return 'const ' + nombre + ' = (() => {\n' + t + '\nreturn {' + nombres.join(', ') + '};\n})();\n';
}
const FRONT = ['v-core.js', 'v-docs.js', 'v-pedido.js', 'v-cobro.js', 'v-listas.js', 'v-admin.js', 'v-importar.js', 'v-registro.js'];
const ventasJS = '(function () {\n"use strict";\n' + comoModulo('src/ventas/dominio.js', 'VD') + comoModulo('src/ventas/permisos.js', 'VP') + FRONT.map(f => '/* ---- ' + f + ' ---- */\n' + leer('front/ventas/' + f)).join('\n') + '\n})();';
const ventasCSS = leer('front/ventas/ventas.css');
const pdfJS = leer('front/comun/pdf.js'); /* generador de PDF (sin librerías): nota de entrega y factura */
if (/<\/script/i.test(pdfJS)) throw new Error('pdf.js contiene </script>');
const buscarJS = leer('front/comun/buscar.js'), buscarCSS = leer('front/comun/buscar.css'); /* buscador común de todo el sistema */
if (/<\/script/i.test(leer('front/comun/borrador.js'))) throw new Error('borrador.js contiene </script>');
if (/<\/script/i.test(buscarJS)) throw new Error('buscar.js contiene </script>');
if (/<\/script/i.test(ventasJS)) throw new Error('El front de ventas contiene </script>');
const ENT = require('./build-entregas.js')(leer, comoModulo); /* Entrega con foto + temporizador (módulo aditivo) */
const CLI = require('./build-cliente.js'); /* Portal del cliente: public/cliente.html + pantallas internas (módulo aditivo) */
const PRE = {js: '(function () {\n"use strict";\n' + leer('front/precios/p-precios.js') + '\n})();\n(function () {\n"use strict";\n' + leer('front/bancos/p-bancos.js') + '\n})();\n(function () {\n"use strict";\n' + leer('front/compras/c-pedido.js') + '\n})();', css: leer('front/precios/precios.css') + leer('front/compras/compras.css')}; /* Cambios de precio con aprobación del Gerente */
if (/<\/script/i.test(PRE.js)) throw new Error('p-precios.js contiene </script>');
const PROD = {js: '(function () {\n"use strict";\n' + leer('front/produccion/p-prod.js') + '\n' + leer('front/produccion/p-herencia.js') + '\n' + leer('front/produccion/p-lote.js') + '\n' + leer('front/produccion/p-flota.js') + '\n' + leer('front/produccion/p-tablero-desp.js') + '\n' + leer('front/rrhh/h-planta.js') + '\n' + leer('front/rrhh/h-turnos.js') + '\n})();', css: leer('front/produccion/produccion.css') + leer('front/rrhh/rrhh.css')}; /* Producción por zonas: turnos, pedidos por zona, salidas */
if (/<\/script/i.test(PROD.js)) throw new Error('p-prod.js contiene </script>');
const PAN = {js: leer('front/pantallas/pantallas.js'), css: leer('front/pantallas/pantallas.css')};
if (/<\/script/i.test(PAN.js)) throw new Error('pantallas.js contiene </script>');
const doc = '<!doctype html><html lang="es" data-theme="light"><head><script>window.__EM_HTTP = true;</script>' + '\n' + metas + '\n' + h + '\n<style>/* Buscador común */\n' + buscarCSS + '/* Ventas y liquidación */\n' + ventasCSS + '/* Entregas */\n' + ENT.css + '/* Portal de clientes (equipo) */\n' + CLI.equipoCSS + '/* Cambios de precio */\n' + PRE.css + '/* Producción por zonas */\n' + PROD.css + '/* Las 7 pantallas */\n' + PAN.css + '/* Compacto (va al final) */\n' + leer('front/comun/compacto.css') + '</style>\n<script>\n' + leer('front/comun/borrador.js') + '\n</script>\n<script>\n' + buscarJS + '\n</script>\n<script>\n' + pdfJS + '\n</script>\n<script>\n' + ventasJS + '\n</script>\n<script>\n' + ENT.js + '\n</script>\n<script>\n' + CLI.equipoJS + '\n</script>\n<script>\n' + PRE.js + '\n</script>\n<script>\n' + PROD.js + '\n</script>\n<script>\n' + PAN.js + '\n</script>\n<script>\n' + leer('front/comun/compacto.js') + '\n</script>\n</html>';
fs.mkdirSync(path.dirname(out), {recursive: true});
fs.writeFileSync(out, doc);
console.log('ok', out, doc.length, 'bytes');
