// Dijkstra over (station,line) states. Edge weight = minutes between adjacent stations (pack data).
// Transfer at same station name = 5 min and +1 transfer.
function buildGraph(packs){
  const stations=new Map(), lines=new Map();
  packs.forEach(p=>p.lines.forEach(l=>{
    lines.set(l.id,l);
    l.stations.forEach((s,i)=>{ if(!stations.has(s.name)) stations.set(s.name,{name:s.name,lines:[],lat:s.lat,lon:s.lon,prefs:p.prefs});
      const st=stations.get(s.name); if(!st.lines.includes(l.id))st.lines.push(l.id); if(s.lat&&!st.lat){st.lat=s.lat;st.lon=s.lon;} });
  }));
  return {stations,lines};
}
function findRoutes(graph,from,to,transferPenalty){
  const {stations,lines}=graph;
  if(!stations.has(from)||!stations.has(to)) return null;
  const startKeys=stations.get(from).lines.map(l=>from+'|'+l);
  const dist=new Map(), prev=new Map(), pq=[];
  startKeys.forEach(k=>{dist.set(k,0);pq.push([0,k,0]);});
  const push=(d,k,t)=>{pq.push([d,k,t]);};
  while(pq.length){
    pq.sort((a,b)=>a[0]-b[0]); const [d,key,tr]=pq.shift();
    if(d>dist.get(key)) continue;
    const [stName,lineId]=key.split('|'); const line=lines.get(lineId);
    const idx=line.stations.findIndex(s=>s.name===stName);
    // ride to neighbours
    [idx-1,idx+1].forEach(j=>{ if(j<0||j>=line.stations.length)return;
      const ns=line.stations[j]; const w=Math.abs(ns.min&&j>idx?ns.min:(line.stations[idx].min||2))||2;
      const nd=d+(j>idx?(ns.min||2):(line.stations[idx].min||2)); const nk=ns.name+'|'+lineId;
      if(nd<(dist.get(nk)??Infinity)){dist.set(nk,nd);prev.set(nk,{from:key,via:'ride'});push(nd,nk,tr);} });
    // transfer
    stations.get(stName).lines.forEach(l2=>{ if(l2===lineId)return; const nk=stName+'|'+l2; const nd=d+transferPenalty;
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
