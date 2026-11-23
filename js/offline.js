function registerSW(){ if('serviceWorker' in navigator){ navigator.serviceWorker.register('sw.js').catch(e=>console.warn('SW',e)); } }
function onlineStatus(){ return navigator.onLine; }
