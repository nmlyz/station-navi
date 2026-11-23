const DB = {
  db:null,
  open(){return new Promise((res,rej)=>{const r=indexedDB.open('station-navi',1);
    r.onupgradeneeded=()=>{r.result.createObjectStore('packs',{keyPath:'id'});r.result.createObjectStore('meta',{keyPath:'key'});};
    r.onsuccess=()=>{DB.db=r.result;res(r.result)};r.onerror=()=>rej(r.error);});},
  async tx(store,mode,fn){if(!DB.db)await DB.open();return new Promise((res,rej)=>{const t=DB.db.transaction(store,mode);const s=t.objectStore(store);const out=fn(s);t.oncomplete=()=>res(out&&out._v);t.onerror=()=>rej(t.error);});},
  req(q){return new Promise((res,rej)=>{q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});},
  async putPack(p){await DB.open();return DB.req(DB.db.transaction('packs','readwrite').objectStore('packs').put(p));},
  async getPack(id){await DB.open();return DB.req(DB.db.transaction('packs').objectStore('packs').get(id));},
  async allPacks(){await DB.open();return DB.req(DB.db.transaction('packs').objectStore('packs').getAll());},
  async delPack(id){await DB.open();return DB.req(DB.db.transaction('packs','readwrite').objectStore('packs').delete(id));},
  async setMeta(k,v){await DB.open();return DB.req(DB.db.transaction('meta','readwrite').objectStore('meta').put({key:k,value:v}));},
  async getMeta(k){await DB.open();const r=await DB.req(DB.db.transaction('meta').objectStore('meta').get(k));return r?r.value:null;}
};
