/* Etiquetas de marca para el <head>: vista previa al compartir (WhatsApp/redes), iconos y app instalable.
   Las usan build.js (index), build-cliente.js y build-entregas.js. */
const SITE = 'https://elmana-jl.talosbot.workers.dev';
const TITLE = 'El Maná JL';
const DESC = 'Sistema de El Maná JL';
const ALT = 'El Maná JL';
const esc = t => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
/* opts.manifest: enlaza la app instalable (solo la app del equipo; el portal del cliente no se instala) */
module.exports = function metasMarca(opts = {}) {
  const url = SITE + (opts.ruta || '/');
  const t = opts.title || TITLE, d = opts.desc || DESC;
  return [
    '<meta name="description" content="' + esc(d) + '">',
    '<meta name="theme-color" content="#C92121">',
    '<link rel="icon" href="/favicon.ico" sizes="any">',
    '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">',
    '<link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png">',
    '<link rel="icon" type="image/png" sizes="512x512" href="/icons/icon-512.png">',
    '<link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png">',
    opts.manifest ? '<link rel="manifest" href="/manifest.webmanifest">' : '',
    opts.manifest ? '<meta name="mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-title" content="El Maná">\n<meta name="apple-mobile-web-app-status-bar-style" content="default">' : '',
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="El Maná JL">',
    '<meta property="og:title" content="' + esc(t) + '">',
    '<meta property="og:description" content="' + esc(d) + '">',
    '<meta property="og:locale" content="es_VE">',
    '<meta property="og:url" content="' + url + '">',
    '<meta property="og:image" content="' + SITE + '/img/compartir.png">',
    '<meta property="og:image:type" content="image/png">',
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta property="og:image:alt" content="' + esc(ALT) + '">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="' + esc(t) + '">',
    '<meta name="twitter:description" content="' + esc(d) + '">',
    '<meta name="twitter:image" content="' + SITE + '/img/compartir.png">',
    '<meta name="twitter:image:alt" content="' + esc(ALT) + '">'
  ].filter(Boolean).join('\n');
};
module.exports.TITLE = TITLE;
