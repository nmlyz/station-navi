// Dijkstra over (station,line) states. Edge weight = minutes between adjacent stations (pack data).
// Transfer at same station name = 5 min and +1 transfer.
function buildGraph(packs){
  const stations=new Map(), lines=new Map();
  packs.forEach(p=>p.lines.forEach(l=>{
    lines.set(l.id,l);
    l.stations.forEach((s,i)=>{ if(!stations.has(s.name)) stations.set(s.name,{name:s.name,lines:[],lat:s.lat,lon:s.lng,prefs:p.prefs,yomi:s.yomi});
      const st=stations.get(s.name); if(!st.lines.includes(l.id))st.lines.push(l.id); if(s.lat&&!st.lat){st.lat=s.lat;st.lon=s.lng;} if(s.yomi&&!st.yomi)st.yomi=s.yomi; });
  }));
  // Walking transfer links between differently-named adjacent stations (real interchange pairs)
  const LINKS=[["武蔵溝ノ口","溝の口",3],["仲御徒町","御徒町",4],["東銀座","銀座",3],["新御茶ノ水","御茶ノ水",3],["淡路町","小伝馬町",4]];
  LINKS.forEach(([a,b,mins],i)=>{ if(!stations.has(a)||!stations.has(b))return;
    const lid='walk-'+i; const wl={id:lid,name:'徒歩連絡',color:'#888888',operator:'徒歩',types:[{name:'徒歩',stops:'all'}],through:{},stations:[{name:a,min:0},{name:b,min:mins}]};
    lines.set(lid,wl); [a,b].forEach(n=>{ if(!stations.get(n).lines.includes(lid)) stations.get(n).lines.push(lid); }); });
  return {stations,lines};
}
function matchFamiliarLines(graph,text){
  const tokens=String(text||'').split(/[\s,、・]+/).filter(Boolean).map(t=>t.replace(/線$/,''));
  const set=new Set(); if(!tokens.length) return set;
  graph.lines.forEach((l,id)=>{ if(id.startsWith('walk-'))return;
    const core=l.name.replace(/^JR/,'').replace(/^東京メトロ/,'').replace(/^大阪メトロ/,'').replace(/^東急/,'').replace(/^京王/,'').replace(/^小田急/,'小田急').replace(/線(支線)?$/,'').replace(/支線$/,'');
    const raw=l.name.replace(/線(支線)?$/,'');
    tokens.forEach(t=>{ if(t.length>=2&&core.length>=2&&(raw.includes(t)||core.includes(t)||t.includes(core))) set.add(id); }); });
  return set;
}
function findRoutes(graph,from,to,transferPenalty,familiar,banned,bannedStations){
  const isBanned=id=>banned&&banned.has(id);
  const lineCost=id=>{ if(!familiar||!familiar.size) return 0; if(id.startsWith('walk-')) return 0; return familiar.has(id)?0:40; };
  const {stations,lines}=graph;
  if(!stations.has(from)||!stations.has(to)) return null;
  const dist=new Map(), prev=new Map(), pq=[];
  stations.get(from).lines.filter(l=>!isBanned(l)).forEach(l=>{const k=from+'|'+l; const c=lineCost(l); dist.set(k,c);pq.push([c,k,0]);});
  const push=(d,k,t)=>{pq.push([d,k,t]);};
  while(pq.length){
    pq.sort((a,b)=>a[0]-b[0]); const [d,key,tr]=pq.shift();
    if(d>dist.get(key)) continue;
    const [stName,lineId]=key.split('|'); const line=lines.get(lineId);
    const idx=line.stations.findIndex(s=>s.name===stName);
    // ride to neighbours
    [idx-1,idx+1].forEach(j=>{ if(j<0||j>=line.stations.length)return;
      const ns=line.stations[j]; if(bannedStations&&bannedStations.has(ns.name)&&ns.name!==to) return; const w=Math.abs(ns.min&&j>idx?ns.min:(line.stations[idx].min||2))||2;
      const nd=d+(j>idx?(ns.min||2):(line.stations[idx].min||2)); const nk=ns.name+'|'+lineId;
      if(nd<(dist.get(nk)??Infinity)){dist.set(nk,nd);prev.set(nk,{from:key,via:'ride'});push(nd,nk,tr);} });
    // transfer
    if(bannedStations&&bannedStations.has(stName)&&stName!==from&&stName!==to) return;
    stations.get(stName).lines.forEach(l2=>{ if(l2===lineId||isBanned(l2))return; const nk=stName+'|'+l2; const nd=d+transferPenalty+lineCost(l2);
      if(nd<(dist.get(nk)??Infinity)){dist.set(nk,nd);prev.set(nk,{from:key,via:'transfer'});push(nd,nk,tr+1);} });
  }
  let best=null,bestKey=null;
  stations.get(to).lines.forEach(l=>{const k=to+'|'+l; if(dist.has(k)&&(best===null||dist.get(k)<best)){best=dist.get(k);bestKey=k;}});
  if(bestKey===null) return null;
  const path=[]; let cur=bestKey;
  while(cur){path.unshift(cur); cur=prev.get(cur)?prev.get(cur).from:null;}
  // group into segments
  const segs=[]; let seg=null;
  path.forEach(k=>{const [nm,lid]=k.split('|'); const line=lines.get(lid);
    if(!seg||seg.lineId!==lid){ if(seg)segs.push(seg); seg={lineId:lid,line,stations:[nm]}; } else seg.stations.push(nm); });
  if(seg)segs.push(seg);
  // drop 1-station trailing segment caused by final transfer state
  const clean=segs.filter((s,i)=>s.stations.length>1||i===0);
  let minutes=0, transfers=Math.max(0,clean.length-1);
  clean.forEach(s=>{ for(let i=1;i<s.stations.length;i++){ const st=s.line.stations.find(x=>x.name===s.stations[i]); minutes+= (st?st.min:2)||2; }});
  minutes+=transfers*5;
  return {segments:clean,minutes,transfers};
}
function usableTypes(line,board,alight){
  return line.types.filter(t=>{ if(t.stops==='all')return true; return t.stops.includes(board)&&t.stops.includes(alight); }).map(t=>t.name);
}
function directionOf(line,board,alight){
  const i=line.stations.findIndex(s=>s.name===board), j=line.stations.findIndex(s=>s.name===alight);
  const term=line.stations[i<j?line.stations.length-1:0].name;
  const dests=[term]; const th=line.through&&line.through[term]; if(th) th.forEach(d=>{if(!dests.includes(d))dests.push(d);});
  return {terminal:term,dests};
}

// ---- Fare engine: fares are looked up from operator fare tables transcribed
// from the operators' published fare charts. Operators without a transcribed
// table return null and the UI shows 情報未取得.
const FARE_TABLES={
 // 運賃表は各事業者の公式運賃表から転記したものだけを入れる。
 // 未転記の事業者は運賃を表示しない（情報未取得）。
};
function segDistanceKm(line,board,alight){
  const i=line.stations.findIndex(s=>s.name===board), j=line.stations.findIndex(s=>s.name===alight);
  if(i<0||j<0) return 0;
  const a=line.stations[i], b=line.stations[j];
  if(a.cum!=null&&b.cum!=null) return Math.abs(b.cum-a.cum);
  const totalMin=line.stations.reduce((a,s)=>a+(s.min||0),0)||1;
  let mins=0; for(let k=Math.min(i,j)+1;k<=Math.max(i,j);k++) mins+=line.stations[k].min||2;
  const lineKm=line.km||(line.stations.length-1)*1.3;
  return lineKm*mins/totalMin;
}
function segFare(line,board,alight){
  const t=FARE_TABLES[line.operator]; if(!t) return null;
  const km=segDistanceKm(line,board,alight); if(km<=0) return null;
  for(const [lim,yen] of t){ if(km<=lim) return yen; } return t[t.length-1][1];
}
function fareFromTable(op,km){ const t=FARE_TABLES[op]; if(!t||km<=0) return null; for(const [lim,yen] of t){ if(km<=lim) return yen; } return t[t.length-1][1]; }
function routeFare(route){
  // Consecutive segments on the same JR company are charged as one JR journey.
  let total=0, ok=true; let jrOp=null, jrKm=0;
  const flush=()=>{ if(jrOp){ const f=fareFromTable(jrOp,jrKm); if(f===null) ok=false; else total+=f; jrOp=null; jrKm=0; } };
  route.segments.forEach(s=>{ if(s.lineId.startsWith('walk-'))return;
    const board=s.stations[0], alight=s.stations[s.stations.length-1]; const op=s.line.operator;
    if(op==='JR東日本'||op==='JR西日本'){ if(jrOp&&jrOp!==op) flush(); jrOp=op; jrKm+=segDistanceKm(s.line,board,alight); return; }
    flush(); const f=segFare(s.line,board,alight); if(f===null){ok=false;return;} total+=f; });
  flush(); return ok?total:null;
}
