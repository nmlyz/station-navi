const VERSION='station-navi-v1.8.5';
const SHELL=['./','index.html','css/style.css?v=1.8.5','js/database.js?v=1.8.5','js/routing.js?v=1.8.5','js/search.js?v=1.8.5','js/gps.js?v=1.8.5','js/settings.js?v=1.8.5','js/commute.js?v=1.8.5','js/timetable.js?v=1.8.5','js/updater.js?v=1.8.5','js/offline.js?v=1.8.5','js/app.js?v=1.8.5','manifest.json','assets/icons/icon.svg','assets/icons/icon-192.png','assets/icons/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{ const url=new URL(e.request.url);
  const isNav=e.request.mode==='navigate'||url.pathname.endsWith('.html');
  const isData=url.pathname.includes('/data/');
  if(isNav||isData){ // network-first so app and data updates always land
    e.respondWith(fetch(e.request).then(r=>{ const cp=r.clone(); caches.open(VERSION).then(c=>c.put(e.request,cp)); return r; }).catch(()=>caches.match(e.request).then(h=>h||caches.match('index.html'))));
    return; }
  e.respondWith(caches.match(e.request,{ignoreSearch:false}).then(hit=>hit||fetch(e.request).catch(()=>caches.match('index.html')))); });
