/* Service worker mínimo: solo para que el navegador ofrezca "Instalar aplicación".
   No guarda NADA en caché y siempre va a la red (las actualizaciones del sistema llegan al instante
   y ningún dato de /api queda guardado en el dispositivo). */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return; /* el navegador resuelve el resto sin intervención */
  e.respondWith(fetch(e.request));
});
