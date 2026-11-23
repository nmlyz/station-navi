const KANJI_VARIANTS={'澤':'沢','邊':'辺','廣':'広','櫻':'桜','瀧':'滝','龍':'竜','嶋':'島','鐵':'鉄','國':'国','會':'会','營':'営','圓':'円','萬':'万','條':'条','來':'来','樂':'楽','檜':'桧','濱':'浜','澁':'渋','峯':'峰','巖':'岩','靑':'青','髙':'高','渕':'淵','惠':'恵','ヶ':'ケ','ヵ':'カ','﨑':'崎','崗':'岡','舘':'館','蘆':'芦','遙':'遥','瑶':'','盃':'杯','頸':'頚','鷺':'鷺','齋':'斉','齊':'斉','鹽':'塩','麴':'麹','瓣':'弁','辯':'弁'};
function normalizeName(s){
  s=String(s||'').trim().replace(/駅$/,'');
  s=s.replace(/[ぁ-ん]/g,c=>String.fromCharCode(c.charCodeAt(0)+0x60)); // hiragana->katakana
  s=s.split('').map(c=>KANJI_VARIANTS[c]!==undefined?KANJI_VARIANTS[c]:c).join('');
  return s;
}
function stationKeys(st){ const ks=[normalizeName(st.name)]; if(st.yomi) ks.push(normalizeName(st.yomi)); return ks; }
function suggestStations(graph,packs,q,limit=12){
  const nq=normalizeName(q); if(!nq) return [];
  const out=[]; const seen=new Set();
  graph.stations.forEach(st=>{ let score=-1;
    const keys=stationKeys(st);
    if(keys.some(k=>k===nq))score=0; else if(keys.some(k=>k.startsWith(nq)))score=1; else if(keys.some(k=>k.includes(nq)))score=2;
    else if(st.lines.some(id=>normalizeName(graph.lines.get(id).name).includes(nq)))score=3;
    else if((st.prefs||[]).some(p=>normalizeName(p).includes(nq)))score=4;
    if(score>=0&&!seen.has(st.name)){seen.add(st.name);out.push({station:st,score});} });
  return out.sort((a,b)=>a.score-b.score||a.station.name.localeCompare(b.station.name,'ja')).slice(0,limit);
}
function resolveStation(graph,q){
  if(!graph) return null; const nq=normalizeName(q); if(!nq) return null;
  let exact=null;
  graph.stations.forEach(st=>{ if(stationKeys(st).some(k=>k===nq)) exact=st.name; });
  return exact;
}
function suggestLines(graph,q,limit=10){
  const nq=normalizeName(q); const out=[];
  graph.lines.forEach(l=>{ if(l.id.startsWith('walk-'))return; const nl=normalizeName(l.name); const yl=l.yomi?normalizeName(l.yomi):'';
    let score=-1; if(nl===nq||yl===nq)score=0; else if(nl.startsWith(nq)||yl.startsWith(nq))score=1; else if(nl.includes(nq)||yl.includes(nq))score=2;
    else if(normalizeName(l.operator).includes(nq))score=3;
    if(score>=0) out.push({line:l,score}); });
  return out.sort((a,b)=>a.score-b.score).slice(0,limit);
}
