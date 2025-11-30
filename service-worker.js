const CACHE_NAME = 'flac-player-cache-v2';
const URLS = ['/', '/flacapp.html', '/assets/styles.css', '/assets/player.js', '/manifest.json'];

self.addEventListener('install', e=>{
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache=>cache.addAll(URLS)).then(self.skipWaiting())
  );
});

self.addEventListener('activate', e=>{
  e.waitUntil(clients.claim());
});

// Stale-while-revalidate strategy for app shell
self.addEventListener('fetch', event=>{
  const req = event.request;
  if(req.method !== 'GET') return;
  event.respondWith(
    caches.match(req).then(cached=>{
      const network = fetch(req).then(resp=>{
        if(resp && resp.type === 'basic'){
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(c=>c.put(req, copy));
        }
        return resp;
      }).catch(()=>null);
      return cached || network;
    })
  );
});
