/* Panel diario · Ideamia: lo mínimo para que se pueda instalar en el celular.
   Siempre se pide primero la versión nueva a internet (así nadie queda con una versión vieja);
   la copia guardada solo se usa si no hay señal, para que la app abra igual con lo último que se vio.
   Los datos (Apps Script, Trello) no pasan por acá: van directo, como siempre. */
const CACHE = 'panel-ideamia-v2';   // 22/10/2026: se renueva para borrar las copias viejas guardadas en los celulares
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  // 24/10/2026: los archivos con versión (app.js?v=109, styles.css?v=98…) nunca cambian: se sirven de la copia guardada al instante.
  // Cuando sale una versión nueva cambia el número en index.html (que siempre se pide a internet), así que nadie queda con una vieja.
  if (/[?&]v=/.test(u.search)) {
    e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => {
      if (res && res.ok) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(r, copia)); }
      return res;
    })));
    return;
  }
  e.respondWith(
    fetch(r).then(res => {
      if (res && res.ok) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(r, copia)); }
      return res;
    }).catch(() => caches.match(r).then(m => m || caches.match(r, { ignoreSearch: true })).then(m => m || Response.error()))
  );
});
