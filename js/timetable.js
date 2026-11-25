// 実時刻表データ（事業者公式時刻表から機械抽出したものだけを収録）。
// TTDATA[lineId] = {types:[], dests:[], st:{駅名:{f:{w:[[分,種別idx,行先idx]],e:[...]},l:{...}}}}
// f=駅順で先頭駅方面(toFirst), l=最終駅方面(toLast), w=平日, e=土休日。分は始発日基準（深夜は1440超）。
let TTDATA={};
const TTCache=new Map();
function jpHolidays(year){
  const key='jpHol'+year; if(jpHolidays._c&&jpHolidays._c.key===key) return jpHolidays._c.set;
  const set=new Set(); const add=(m,d)=>set.add(m+'/'+d);
  add(1,1); add(2,11); add(2,23); add(4,29); add(5,3); add(5,4); add(5,5); add(8,11); add(11,3); add(11,23);
  const nthMon=(m,n)=>{ const d=new Date(year,m-1,1); const off=(8-d.getDay())%7; return 1+off+(n-1)*7; };
  add(1,nthMon(1,2)); add(7,nthMon(7,3)); add(9,nthMon(9,3)); add(10,nthMon(10,2));
  const sf=Math.floor(20.8431+0.242194*(year-1980))-Math.floor((year-1980)/4); add(3,sf);
  const af=Math.floor(23.2488+0.242194*(year-1980))-Math.floor((year-1980)/4); add(9,af);
  // 振替休日（祝日が日曜なら翌月曜、連休は繰り越し）
  [...set].forEach(k=>{ const [m,d]=k.split('/').map(Number); const dt=new Date(year,m-1,d);
    if(dt.getDay()===0){ let nx=new Date(dt); do{ nx.setDate(nx.getDate()+1); }while(set.has((nx.getMonth()+1)+'/'+nx.getDate())); set.add((nx.getMonth()+1)+'/'+nx.getDate()); } });
  // 国民の休日（祝日に挟まれた平日）
  for(let m=1;m<=12;m++){ const dim=new Date(year,m,0).getDate();
    for(let d=2;d<dim;d++){ if(set.has(m+'/'+(d-1))&&set.has(m+'/'+(d+1))&&!set.has(m+'/'+d)){ const dt=new Date(year,m-1,d); if(dt.getDay()!==0) set.add(m+'/'+d); } } }
  jpHolidays._c={key,set}; return set;
}
function jpDayType(date){ const dow=date.getDay(); if(dow===0||dow===6) return 'e';
  return jpHolidays(date.getFullYear()).has((date.getMonth()+1)+'/'+date.getDate())?'e':'w'; }
function ttService(date){ // Date → {svc:サービス日Date, mins:サービス分}
  const svc=new Date(date); let mins=date.getHours()*60+date.getMinutes();
  if(date.getHours()<4){ mins+=1440; svc.setDate(svc.getDate()-1); }
  return {svc,mins};
}
function ttTrains(lineId,station,dirKey,date){
  const tt=TTDATA[lineId]; if(!tt||!tt.st) return null;
  const st=tt.st[station]; if(!st) return null;
  const dir=st[dirKey]; if(!dir) return null;
  const dt=jpDayType(date); const arr=dir[dt]||dir[dt==='w'?'e':'w']; if(!arr||!arr.length) return null;
  const key=lineId+'|'+station+'|'+dirKey+'|'+dt;
  if(TTCache.has(key)) return TTCache.get(key);
  const out=arr.map(a=>({m:a[0],type:tt.types[a[1]],dest:tt.dests[a[2]]}));
  TTCache.set(key,out); return out;
}
function ttDirKey(line,board,alight){ const n=line.stations.map(x=>x.name); return n.indexOf(board)<n.indexOf(alight)?'l':'f'; }
function ttDestRank(line,board,alight,dest){
  const n=line.stations.map(x=>x.name); const bi=n.indexOf(board), ai=n.indexOf(alight), di=n.indexOf(dest);
  if(di<0) return 100000; // 直通先など路線の先 → 最も遠い扱い
  return (di-bi)*(bi<ai?1:-1);
}
function ttRideable(line,board,alight,tr){
  const n=line.stations.map(x=>x.name); const bi=n.indexOf(board), ai=n.indexOf(alight), di=n.indexOf(tr.dest);
  if(di>=0){ if(bi<ai&&di<ai) return false; if(bi>ai&&di>ai) return false; }
  const t=line.types.find(x=>x.name===tr.type);
  if(t){ if(t.stops!=='all'&&!t.stops.includes(alight)) return false; }
  else if(tr.type.includes('特急')) return false;
  return true;
}
function ttDestSet(line,board,alight,depDate){
  const {svc}=ttService(depDate);
  const all=ttTrains(line.id,board,ttDirKey(line,board,alight),svc); if(!all) return null;
  const seen=new Map();
  all.forEach(tr=>{ if(ttRideable(line,board,alight,tr)&&!seen.has(tr.dest)) seen.set(tr.dest,ttDestRank(line,board,alight,tr.dest)); });
  if(!seen.size) return null;
  const out=[...seen.entries()].sort((a,b)=>a[1]-b[1]).map(e=>e[0]);
  if(!out.includes(alight)) out.push(alight);
  return out;
}
function ttSnap(r,s,depDate){
  const board=s.stations[0], alight=s.stations[s.stations.length-1];
  const {svc,mins}=ttService(depDate);
  const all=ttTrains(s.lineId,board,ttDirKey(s.line,board,alight),svc); if(!all) return null;
  const ride=all.filter(tr=>ttRideable(s.line,board,alight,tr)); if(!ride.length) return null;
  const pool=ride.filter(tr=>tr.m>=mins&&tr.m<=mins+240); if(!pool.length) return null;
  const i=s._i; let train=null;
  const pick=r.trainSel&&r.trainSel[i];
  if(pick!=null) train=pool.find(tr=>tr.m===pick)||null;
  if(!train&&r.destSel&&r.destSel[i]){ const want=ttDestRank(s.line,board,alight,r.destSel[i]);
    const c=pool.filter(tr=>ttDestRank(s.line,board,alight,tr.dest)>=want); if(c.length) train=c[0]; }
  if(!train&&r.typeSel&&r.typeSel[i]){ const c=pool.filter(tr=>tr.type===r.typeSel[i]); if(c.length) train=c[0]; }
  if(!train) train=pool[0];
  const date=new Date(svc); date.setHours(0,train.m,0,0);
  const next=pool.slice(0,5);
  return {train,date,next};
}
function fmtMin(m){ const h=Math.floor(m/60)%24, mm=m%60; return String(h).padStart(2,'0')+':'+String(mm).padStart(2,'0'); }
