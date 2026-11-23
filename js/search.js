function suggestStations(graph,packs,q,limit=12){
  q=(q||'').trim(); if(!q) return [];
  const out=[]; const seen=new Set();
  graph.stations.forEach(st=>{ let score=-1;
    if(st.name===q)score=0; else if(st.name.startsWith(q))score=1; else if(st.name.includes(q))score=2;
    else if(st.lines.some(id=>graph.lines.get(id).name.includes(q)))score=3;
    else if((st.prefs||[]).some(p=>p.includes(q)))score=4;
    if(score>=0&&!seen.has(st.name)){seen.add(st.name);out.push({station:st,score});} });
  return out.sort((a,b)=>a.score-b.score||a.station.name.localeCompare(b.station.name,'ja')).slice(0,limit);
}
