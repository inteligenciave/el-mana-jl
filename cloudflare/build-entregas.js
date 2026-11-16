/* Entrega con foto + temporizador: genera (1) el paquete que build.js pega en la app del equipo y (2) public/mis-entregas.html,
   una página mínima para el cliente (enlace personal `/mis-entregas.html#CODIGO`) que el portal puede enlazar o sustituir por EntregasPortal.montar().
   Lo llama build.js: require('./build-entregas.js')(leer, comoModulo) */
const fs = require('fs'), path = require('path');
module.exports = function (leer, comoModulo) {
  const FRONT = ['e-core.js', 'e-entregas.js', 'e-cobranza.js'];
  const js = '(function () {\n"use strict";\n' + comoModulo('src/entregas/dominio.js', 'ED') + comoModulo('src/entregas/permisos.js', 'EP') + FRONT.map(f => '/* ---- ' + f + ' ---- */\n' + leer('front/entregas/' + f)).join('\n') + '\n})();';
  if (/<\/script/i.test(js)) throw new Error('El front de entregas contiene </script>');
  const css = leer('front/entregas/entregas.css');
  const portalJS = leer('front/entregas/portal-entregas.js');
  if (/<\/script/i.test(portalJS)) throw new Error('portal-entregas.js contiene </script>');
  const pagina = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">'
    + '<title>Mis entregas · El Maná JL</title>' + require('./brand-meta.js')({title: 'Mis entregas · El Maná JL', ruta: '/mis-entregas'}) + '<style>body{margin:0;background:#f6f4ef;color:#1b1b1b;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}header{background:#C92121;color:#fff;padding:14px 16px}header h1{margin:0;font-size:19px}main{max-width:640px;margin:0 auto;padding:16px}</style></head>'
    + '<body><header><h1>Mis entregas y plazos</h1></header><main><div id="x"></div></main><script>\n' + portalJS + '\n'
    + 'const t=(location.hash||"").slice(1);const x=document.getElementById("x");if(!t){x.innerHTML="<p>Abre el enlace personal que te enviaron.</p>"}else{EntregasPortal.montar(x,{token:t})}\n</script></body></html>';
  fs.mkdirSync(path.join(__dirname, 'public'), {recursive: true});
  fs.writeFileSync(path.join(__dirname, 'public', 'mis-entregas.html'), pagina);
  return {js, css};
};
