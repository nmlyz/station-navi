const VERSION='station-navi-v1.2.0';
const SHELL=['./','index.html','css/style.css?v=1.2.0','js/database.js?v=1.2.0','js/routing.js?v=1.2.0','js/search.js?v=1.2.0','js/gps.js?v=1.2.0','js/settings.js?v=1.2.0','js/commute.js?v=1.2.0','js/updater.js?v=1.2.0','js/offline.js?v=1.2.0','js/app.js?v=1.2.0','manifest.json','data/manifest.json','assets/icons/icon.svg','assets/icons/icon-192.png','assets/icons/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{ const url=new URL(e.request.url);
  if(url.pathname.includes('/data/packs/')){ e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{const cp=r.clone();caches.open(VERSION).then(c=>c.put(e.request,cp));return r;}))); return; }
  e.respondWith(caches.match(e.request,{ignoreSearch:false}).then(hit=>hit||fetch(e.request).catch(()=>caches.match('index.html')))); });
