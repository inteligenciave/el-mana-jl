/* Genera public/index.html desde ../sistema-produccion.html (la misma app del Artifact) y activa la capa de datos de la API.
   Uso: node build.js */
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, 'app-source.html'), out = path.join(__dirname, 'public', 'index.html');
let h = fs.readFileSync(src, 'utf8');
if (!h.includes('makeHttpBackend')) throw new Error('La app no trae la capa de datos HTTP: reconstruye sistema-produccion.html');
const metasMarca = require('./brand-meta.js');
const metas = '<title>' + metasMarca.TITLE + '</title>\n' + metasMarca({manifest: true, ruta: '/'});
h = h.replace(/<title>[^<]*<\/title>\s*/, '');

/* Módulo de Ventas y Liquidación: dominio y permisos (los MISMOS archivos que usa el Worker, sin `export`) + front/ventas/*.js y .css */
const leer = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
function comoModulo(archivo, nombre) {
  const nombres = [];
  const t = leer(archivo).replace(/^export\s+(async\s+)?(function|const|let)\s+([A-Za-z0-9_$]+)/gm, (m, a, k, n) => { nombres.push(n); return (a || '') + k + ' ' + n; });
  if (/^\s*import\s/m.test(t)) throw new Error(archivo + ' no puede importar nada para ir en la página');
  return 'const ' + nombre + ' = (() => {\n' + t + '\nreturn {' + nombres.join(', ') + '};\n})();\n';
}
const FRONT = ['v-core.js', 'v-docs.js', 'v-pedido.js', 'v-cobro.js', 'v-listas.js', 'v-admin.js', 'v-importar.js', 'v-rep-ventas.js', 'v-registro.js'];
const ventasJS = '(function () {\n"use strict";\n' + comoModulo('src/ventas/dominio.js', 'VD') + comoModulo('src/ventas/permisos.js', 'VP') + FRONT.map(f => '/* ---- ' + f + ' ---- */\n' + leer('front/ventas/' + f)).join('\n') + '\n})();';
const ventasCSS = leer('front/ventas/ventas.css');
const pdfJS = leer('front/comun/pdf.js') + ';' + leer('front/comun/xlsx.js'); /* generador de PDF (sin librerías): nota de entrega y factura */
if (/<\/script/i.test(pdfJS)) throw new Error('pdf.js contiene </script>');
const buscarJS = leer('front/comun/buscar.js'), buscarCSS = leer('front/comun/buscar.css'); /* buscador común de todo el sistema */
if (/<\/script/i.test(leer('front/comun/borrador.js'))) throw new Error('borrador.js contiene </script>');
if (/<\/script/i.test(buscarJS)) throw new Error('buscar.js contiene </script>');
if (/<\/script/i.test(ventasJS)) throw new Error('El front de ventas contiene </script>');
const ENT = require('./build-entregas.js')(leer, comoModulo); /* Entrega con foto + temporizador (módulo aditivo) */
const CLI = require('./build-cliente.js'); /* Portal del cliente: public/cliente.html + pantallas internas (módulo aditivo) */
const PRE = {js: '(function () {\n"use strict";\n' + leer('front/precios/p-precios.js') + '\n})();\n(function () {\n"use strict";\n' + leer('front/bancos/p-bancos.js') + '\n})();\n(function () {\n"use strict";\n' + leer('front/compras/c-pedido.js') + '\n})();' + '\n(function () {\n"use strict";\n' + leer('front/compras/c-recibir.js') + '\n})();', css: leer('front/precios/precios.css') + leer('front/compras/compras.css')}; /* Cambios de precio con aprobación del Gerente */
if (/<\/script/i.test(PRE.js)) throw new Error('p-precios.js contiene </script>');
const PROD = {js: '(function () {\n"use strict";\n' + leer('front/produccion/p-prod.js') + '\n' + leer('front/produccion/p-herencia.js') + '\n' + leer('front/produccion/p-asistente.js') + '\n' + leer('front/produccion/p-panel.js') + '\n' + leer('front/produccion/p-resumen.js') +'\n' + leer('front/produccion/p-lote.js') + '\n' + leer('front/produccion/p-flota.js') + '\n' + leer('front/produccion/p-tablero-desp.js') + '\n' + leer('front/produccion/lg-empacar.js') + '\n' + leer('front/rrhh/h-planta.js') + '\n' + leer('front/rrhh/h-areas.js') + '\n' + leer('front/rrhh/h-grupos.js') + '\n' + leer('front/rrhh/h-turnos.js') + '\n' + leer('front/rrhh/h-bonos.js') + '\n' + leer('front/rrhh/h-lector.js') + '\n})();', css: leer('front/produccion/produccion.css') + leer('front/rrhh/rrhh.css')}; /* Producción por zonas: turnos, pedidos por zona, salidas */
if (/<\/script/i.test(PROD.js)) throw new Error('p-prod.js contiene </script>');
const PAN = {js: leer('front/pantallas/pantallas.js'), css: leer('front/pantallas/pantallas.css')};
if (/<\/script/i.test(PAN.js)) throw new Error('pantallas.js contiene </script>');
const PP = {js: leer('front/comun/primeros-pasos.js')}; /* Primeros pasos (dentro de Ayuda) */
if (/<\/script/i.test(PP.js)) throw new Error('primeros-pasos.js contiene </script>');
const doc = '<!doctype html><html lang="es" data-theme="light"><head><script>window.__EM_HTTP = true;</script>' + '\n' + metas + '\n' + h + '\n<style>/* Buscador común */\n' + buscarCSS + '/* Ventas y liquidación */\n' + ventasCSS + '/* Entregas */\n' + ENT.css + '/* Portal de clientes (equipo) */\n' + CLI.equipoCSS + '/* Cambios de precio */\n' + PRE.css + '/* Producción por zonas */\n' + PROD.css + '/* Las 7 pantallas */\n' + PAN.css + '/* Compacto (va al final) */\n' + leer('front/comun/compacto.css') + '</style>\n<script>\n' + leer('front/comun/borrador.js') + '\n</script>\n<script>\n' + buscarJS + '\n</script>\n<script>\n' + pdfJS + '\n</script>\n<script>\n' + ventasJS + '\n</script>\n<script>\n' + ENT.js + '\n</script>\n<script>\n' + CLI.equipoJS + '\n</script>\n<script>\n' + PRE.js + '\n</script>\n<script>\n' + PROD.js + '\n</script>\n<script>\n' + PAN.js + '\n</script>\n<script>\n' + PP.js + '\n</script>\n<script>\n' + leer('front/comun/manuales-datos.js') + '\n</script>\n<script>\n' + leer('front/comun/manuales.js') + '\n</script>\n<script>\n' + leer('front/comun/compacto.js') + '\n</script>\n</html>';
fs.mkdirSync(path.dirname(out), {recursive: true});
fs.writeFileSync(out, doc);
console.log('ok', out, doc.length, 'bytes');
