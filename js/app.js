const $=s=>document.querySelector(s);
let PACKS=[], GRAPH=null, MANIFEST=null, TAB='home';
let searchState={from:'',to:'',mode:'dep',time:''};
function toast(m){const t=$('#toast');t.textContent=m;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),2600);}
function esc(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function fmtDT(v){ const d=new Date(v); if(isNaN(d)) return String(v||''); return d.toLocaleString('ja-JP',{year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}); }
function fmtTime(d){return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
function applyTheme(){const s=Settings.load();document.body.classList.toggle('dark',s.dark==='dark');document.body.classList.toggle('light',s.dark==='light');}
async function reloadGraph(){ PACKS=await DB.allPacks(); GRAPH=buildGraph(PACKS); updateNet(); }
function updateNet(){ const on=navigator.onLine; const b=$('#netBadge'); b.textContent=on?'オンライン':'オフライン'; b.classList.toggle('off',!on);
  const bar=$('#offlineBar'); if(!on){ bar.classList.remove('hidden'); const last=PACKS.map(p=>p._updatedAt||p.updated).sort().pop()||'未取得';
    bar.textContent='オフラインモード｜保存データで検索できます｜データ最終更新: '+fmtDT(last)+'｜運行情報などのリアルタイム情報は利用できません'; }
  else bar.classList.add('hidden'); }
async function ensureManifest(){ if(MANIFEST) return MANIFEST; try{MANIFEST=await (await fetch('data/manifest.json')).json();}catch(e){ MANIFEST={packs:[],unsupportedPrefs:[]}; } return MANIFEST; }
async function downloadPack(id,btn){
  const m=await ensureManifest(); const info=m.packs.find(p=>p.id===id); if(!info) return;
  try{ if(btn){btn.disabled=true;btn.textContent='ダウンロード中…';}
    const r=await fetch('data/'+info.file); if(!r.ok) throw new Error('HTTP '+r.status);
    const total=+r.headers.get('Content-Length')||0; let buf='';
    if(r.body&&total){ const rd=r.body.getReader(); const dec=new TextDecoder(); let got=0;
      while(true){const {done,value}=await rd.read(); if(done)break; got+=value.length; buf+=dec.decode(value,{stream:true});
        const pr=$('#prog-'+id); if(pr){pr.value=Math.round(got/total*100);} const pt=$('#progtext-'+id); if(pt)pt.textContent=Math.round(got/total*100)+'%';}
      buf+=dec.decode(); } else buf=await r.text();
    const data=JSON.parse(buf);
    if(!data.lines||data.lines.some(l=>!l.stations||l.stations.length<2)) throw new Error('データ検証に失敗しました');
    data._size=buf.length; data._updatedAt=new Date().toISOString(); await DB.putPack(data);
    await reloadGraph(); toast(info.name+' を保存しました'); render();
  }catch(e){ toast('ダウンロードに失敗しました。通信を確認して再試行してください（再開できます）'); if(btn){btn.disabled=false;btn.textContent='再試行';} }
}
/* ---------- Views ---------- */
function nav(tab){ TAB=tab; document.querySelectorAll('.tabbar button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab)); render(); const m=document.querySelector('main'); if(m) m.scrollTop=0; }
function render(){ ({home:viewHome,search:viewSearch,favs:viewFavs,downloads:viewDownloads,settings:viewSettings}[TAB]||viewHome)(); }
function stationInput(id,label,val){ return `<label>${label}</label><input id="${id}" autocomplete="off" placeholder="駅名・路線名・都道府県" value="${esc(val)}"><div id="${id}-sug" class="suggest hidden"></div>`; }
function bindSuggest(inputId,key,onPick){
  const inp=$('#'+inputId), box=$('#'+inputId+'-sug'); if(!inp||!box) return;
  inp.addEventListener('input',()=>{ if(inp.dataset.picked&&inp.dataset.picked!==inp.value.trim()) delete inp.dataset.picked;
    const items=GRAPH?suggestStations(GRAPH,PACKS,inp.value):[];
    if(!items.length){box.classList.add('hidden');return;}
    box.innerHTML=items.map(x=>`<button type="button" data-st="${esc(x.station.name)}">${esc(x.station.name)}<small>${x.station.lines.map(id=>GRAPH.lines.get(id).name).join(' / ')}</small></button>`).join('');
    box.classList.remove('hidden');
    box.querySelectorAll('button').forEach(b=>b.onclick=()=>{ inp.value=b.dataset.st; inp.dataset.picked=b.dataset.st; if(key)searchState[key]=b.dataset.st; if(onPick)onPick(b.dataset.st); box.classList.add('hidden'); }); });
  if(inp.value.trim()&&GRAPH&&resolveStation(GRAPH,inp.value.trim())===inp.value.trim()) inp.dataset.picked=inp.value.trim();
}
function searchCard(prefill){
  const setup=Settings.setup()||{};
  if(prefill){ searchState.from=searchState.from||setup.from||''; searchState.to=searchState.to||setup.to||''; }
  const now=new Date(); if(!searchState.time) searchState.time=fmtTime(now);
  return `<div class="card"><h2>乗換検索</h2>
  ${stationInput('fromInput','出発駅',searchState.from)}
  <div class="row" style="margin-top:8px"><button class="sub swap" id="swapBtn" title="入れ替え"><svg class="ic" style="width:17px;height:17px;vertical-align:-3px"><use href="#i-swap"/></svg> 入れ替え</button><button class="sub" id="gpsBtn"><svg class="ic" style="width:17px;height:17px;vertical-align:-3px"><use href="#i-pin"/></svg> 現在地から検索</button></div>
  <div id="nearby"></div>
  ${stationInput('toInput','到着駅',searchState.to)}
  <label>時刻の指定（24時間表示）</label><div class="row"><select id="timeMode"><option value="dep" ${searchState.mode==='dep'?'selected':''}>出発時刻</option><option value="arr" ${searchState.mode==='arr'?'selected':''}>到着希望時刻</option></select><input type="time" id="timeInput" value="${esc(searchState.time)}"></div>
  <div class="muted" id="time24" style="margin-top:2px">入力中の時刻（24時間表示）: ${esc(searchState.time||'')}</div>
  <div style="height:12px"></div><button id="doSearch" style="width:100%">検索する</button>
  <div id="results"></div></div>`;
}
function bindSearchCard(){
  bindSuggest('fromInput','from'); bindSuggest('toInput','to');
  const sw=$('#swapBtn'); if(sw) sw.onclick=()=>{ const fi=$('#fromInput'),ti=$('#toInput');
    [searchState.from,searchState.to]=[searchState.to,searchState.from];
    if(fi&&ti){ const v=fi.value,p=fi.dataset.picked; fi.value=ti.value; if(ti.dataset.picked)fi.dataset.picked=ti.dataset.picked; else delete fi.dataset.picked; ti.value=v; if(p)ti.dataset.picked=p; else delete ti.dataset.picked; } };
  const gps=$('#gpsBtn'); if(gps) gps.onclick=async()=>{ const nb=$('#nearby'); nb.innerHTML='<p class="muted">位置情報を取得中…（この操作のときだけ取得します）</p>';
    try{ const pos=await getPosition(); const near=nearestStations(GRAPH,pos.coords.latitude,pos.coords.longitude);
      if(!near.length){ nb.innerHTML='<p class="muted">座標データのある駅が近くに見つかりませんでした。通常の駅検索をご利用ください。</p>'; return; }
      nb.innerHTML='<h3>最寄り駅（位置情報は保存・送信しません）</h3>'+near.map(n=>`<button class="sub" style="width:100%;margin-bottom:6px" data-near="${esc(n.name)}">${esc(n.name)}（約${n.km}km）</button>`).join('');
      nb.querySelectorAll('[data-near]').forEach(b=>b.onclick=()=>{ searchState.from=b.dataset.near; render(); const fi=$('#fromInput'); if(fi){fi.dataset.picked=b.dataset.near;} });
    }catch(e){ nb.innerHTML='<p class="muted">位置情報を取得できませんでした。通常の駅検索をご利用ください。</p>'; } };
  const ds=$('#doSearch'); if(ds) ds.onclick=doSearch;
}
let LAST=null, SORTMODE='rec';
const TYPE_FACTOR={'特急':0.8,'京王ライナー':0.8,'通勤特快':0.82,'快速急行':0.82,'通勤特急':0.82,'中央特快':0.85,'青梅特快':0.85,'新快速':0.85,'急行':0.88,'快速':0.9,'通勤快速':0.9,'通勤急行':0.9,'区間急行':0.93,'準急':0.95,'通勤準急':0.95,'区間準急':0.97,'普通':1.1,'各駅停車':1.15};
const OPEN_VIA=new Set();
function segMinutes(s){ let m=0; for(let i=1;i<s.stations.length;i++){ const st=s.line.stations.find(x=>x.name===s.stations[i]); m+=(st?st.min:2)||2; } return Math.max(1,Math.round(m*(s._factor||1))); }
function displaySegments(r){
  const out=[];
  for(let i=0;i<r.segments.length;i++){ const s=r.segments[i];
    if(s.lineId.startsWith('walk-')){ out.push({...s,_i:i,_factor:1}); continue; }
    const types=usableTypes(s.line,s.stations[0],s.stations[s.stations.length-1]);
    const type=(r.typeSel&&r.typeSel[i])||types[0]||'';
    const dir=directionOf(s.line,s.stations[0],s.stations[s.stations.length-1]);
    const dest=(r.destSel&&r.destSel[i])||dir.terminal;
    const allNames=s.line.stations.map(x=>x.name); const bIdx=allNames.indexOf(s.stations[0]), tIdx=allNames.indexOf(dir.terminal);
    const step2=(tIdx>=bIdx)?1:-1; const fwd=[]; for(let k=bIdx+step2;k!==tIdx+step2;k+=step2) fwd.push(allNames[k]);
    const destOpts=fwd.concat(dir.dests.filter(d=>!allNames.includes(d)));
    const item={...s,_i:i,_factor:(TYPE_FACTOR[type]!=null?TYPE_FACTOR[type]:1),_type:type,_dest:dest,_types:types,_dests:destOpts,_trunc:false};
    const names=s.line.stations.map(x=>x.name); const bi=names.indexOf(s.stations[0]), ai=names.indexOf(s.stations[s.stations.length-1]), di=names.indexOf(dest);
    if(di>=0&&((bi<ai&&di>bi&&di<ai)||(bi>ai&&di<bi&&di>ai))){
      const step=bi<ai?1:-1; const st=[]; for(let k=bi;k!==di+step;k+=step) st.push(names[k]);
      item.stations=st; item._trunc=true; out.push(item);
      const rr=(typeof LAST!=='undefined'&&LAST)?findRoutes(GRAPH,dest,LAST.to,8):null;
      if(rr) rr.segments.forEach(es=>out.push({...es,_i:-1,_factor:1,_extra:true}));
      break;
    }
    out.push(item);
  }
  return out;
}
function routeTotalMinutes(r){
  const ds=r._ds||displaySegments(r);
  let total=0; ds.forEach((s,i)=>{ total+=segMinutes(s); if(i<ds.length-1) total+=s.lineId.startsWith('walk-')?0:5; });
  return total;
}
function computeTimes(r){
  const ds=r._ds||displaySegments(r);
  const deps=[], arrs=[]; let t=new Date(r.baseDep);
  ds.forEach((s,i)=>{ let dep;
    if(r.depOverrides&&r.depOverrides[i]){ const [h,m]=r.depOverrides[i].split(':').map(Number); dep=new Date(t); dep.setHours(h,m,0,0); if(dep<t) dep=t; }
    else dep=new Date(t);
    const arr=new Date(dep.getTime()+segMinutes(s)*60000);
    deps.push(dep); arrs.push(arr);
    const wait=s.lineId.startsWith('walk-')?0:5;
    t=new Date(arr.getTime()+wait*60000);
  });
  return {deps,arrs,total:Math.round((arrs[arrs.length-1]-deps[0])/60000),ds};
}
function doSearch(){
  const fi=$('#fromInput'), ti=$('#toInput');
  if(!fi.dataset.picked||fi.dataset.picked!==fi.value.trim()||!ti.dataset.picked||ti.dataset.picked!==ti.value.trim()){
    $('#results').innerHTML='<p>駅は文字を入力するだけでは検索できません。出てきた候補をタップして選んでから検索してください。</p>';
    toast('駅は候補から選んでください'); return; }
  searchState.from=fi.value.trim(); searchState.to=ti.value.trim();
  searchState.mode=$('#timeMode').value; searchState.time=$('#timeInput').value||fmtTime(new Date());
  const box=$('#results');
  if(!GRAPH||!PACKS.length){ box.innerHTML='<p>駅データが未ダウンロードです。「ダウンロード」タブから地域データを保存してください。</p>'; return; }
  const fromR=resolveStation(GRAPH,searchState.from), toR=resolveStation(GRAPH,searchState.to);
  if(!fromR||!toR){
    const bad=!fromR?searchState.from:searchState.to;
    const cands=suggestStations(GRAPH,PACKS,bad,8);
    box.innerHTML='<p>「'+esc(bad)+'」という駅は保存データにありません。候補から選んでください。</p>'+(cands.length?cands.map(c=>'<button class="sub" style="width:100%;margin-bottom:6px" data-pick="'+esc(c.station.name)+'">'+esc(c.station.name)+'<small style="display:block" class="muted">'+c.station.lines.map(id=>GRAPH.lines.get(id).name).join(' / ')+'</small></button>').join(''):'<p class="muted">候補がありません。保存済み地域の駅名で入力してください。</p>');
    box.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{ if(!fromR){$('#fromInput').value=b.dataset.pick; searchState.from=b.dataset.pick;} else {$('#toInput').value=b.dataset.pick; searchState.to=b.dataset.pick;} doSearch(); });
    return;
  }
  searchState.from=fromR; searchState.to=toR; $('#fromInput').value=fromR; $('#toInput').value=toR;
  if(fromR===toR){ box.innerHTML='<p>出発駅と到着駅が同じです。</p>'; return; }
  const seen=new Set(), routes=[];
  const sigOf=r=>r.segments.map(s=>s.lineId+':'+s.stations[0]+'-'+s.stations[s.stations.length-1]).join('|');
  const setup0=Settings.setup()||{}; const fam=matchFamiliarLines(GRAPH,setup0.line||'');
  if(fam.size){ const r=findRoutes(GRAPH,fromR,toR,8,fam);
    if(r&&r.segments.every(s=>s.lineId.startsWith('walk-')||fam.has(s.lineId))){ routes.push({label:'いつもの路線',...r}); seen.add(sigOf(r)); } }
  const base=findRoutes(GRAPH,fromR,toR,5);
  const cand=[];
  [['最速',5],['乗換少なめ',14],['標準',8],['最速',3],['乗換少なめ',20]].forEach(([label,pen])=>{ const r=findRoutes(GRAPH,fromR,toR,pen); if(r) cand.push({label,...r}); });
  if(base){ base.segments.map(s=>s.lineId).filter(id=>!id.startsWith('walk-')).forEach(lid=>{ const r=findRoutes(GRAPH,fromR,toR,8,null,new Set([lid])); if(r) cand.push({label:'別ルート',...r}); });
    base.segments.slice(1).map(s=>s.stations[0]).forEach(st=>{ const r=findRoutes(GRAPH,fromR,toR,8,null,null,new Set([st])); if(r) cand.push({label:'別ルート',...r}); }); }
  cand.forEach(r=>{ if(seen.has(sigOf(r)))return; seen.add(sigOf(r)); routes.push(r); });
  if(!routes.length){ box.innerHTML='<p>保存済みデータの範囲では経路が見つかりませんでした。</p>'; return; }
  const [hh,mm]=searchState.time.split(':').map(Number);
  routes.forEach(r=>{ r.fare=routeFare(r); r.depOverrides={}; r.typeSel={}; r.destSel={};
    const anchor=new Date(); anchor.setHours(hh,mm,0,0);
    r.baseDep=searchState.mode==='arr'?new Date(anchor.getTime()-routeTotalMinutes(r)*60000):anchor; });
  const first=routes[0]; if(first.label==='最速') first.label='おすすめ（最速）'; else if(routes.length>1&&routes[1].label==='最速') routes[1].label='最速';
  if(first.label==='いつもの路線') first.label='おすすめ（いつもの路線）';
  LAST={routes:routes.slice(0,5),from:fromR,to:toR};
  const hist=JSON.parse(localStorage.getItem('sn-history')||'[]'); hist.unshift({from:fromR,to:toR,at:Date.now()});
  localStorage.setItem('sn-history',JSON.stringify(hist.filter((h,i,arr)=>arr.findIndex(x=>x.from===h.from&&x.to===h.to)===i).slice(0,10)));
  renderRoutes();
}
function renderRoutes(reorder){
  const box=$('#results'); if(!box||!LAST) return;
  if(reorder===false&&LAST.order) { var routes=LAST.order.slice(); }
  else { var routes=LAST.routes.slice(); }
  if(reorder!==false){ if(SORTMODE==='fast') routes.sort((a,b)=>computeTimes(a).total-computeTimes(b).total);
  if(SORTMODE==='cheap') routes.sort((a,b)=>(a.fare??1e9)-(b.fare??1e9));
  if(SORTMODE==='few') routes.sort((a,b)=>a.transfers-b.transfers||computeTimes(a).total-computeTimes(b).total); LAST.order=routes.slice(); }
  box.innerHTML='<label>並び替え</label><select id="sortSel"><option value="rec" '+(SORTMODE==='rec'?'selected':'')+'>おすすめ順</option><option value="fast" '+(SORTMODE==='fast'?'selected':'')+'>速さ順</option><option value="cheap" '+(SORTMODE==='cheap'?'selected':'')+'>値段順（安い順）</option><option value="few" '+(SORTMODE==='few'?'selected':'')+'>乗換が少ない順</option></select>'
   + routes.map(r=>{
    r._ds=displaySegments(r); const CT=computeTimes(r); const deps=CT.deps, arrs=CT.arrs; r._total=CT.total;
    const segsHtml=CT.ds.map((s,si)=>{
      const board=s.stations[0], alight=s.stations[s.stations.length-1];
      const isWalk=s.lineId.startsWith('walk-');
      const sig=esc(r.segments.map(x=>x.lineId).join(','));
      if(isWalk) return '<div class="timeline" style="--lc:#888">'
        +'<div class="stop"><div class="big">'+esc(board)+'駅 <input type="time" class="seg-dep" data-sig="'+sig+'" data-seg="'+si+'" value="'+fmtTime(deps[si])+'" style="width:118px;display:inline-block;font-size:15px;padding:6px">発</div>'
        +'<span class="linechip" style="background:#888">徒歩連絡</span><div style="margin-top:6px">徒歩で移動してください（'+segMinutes(s)+'分）</div></div>'
        +'<div class="stop"><b>'+esc(alight)+'駅</b> <span class="muted">'+fmtTime(arrs[si])+'着</span>'+(si<CT.ds.length-1?'<div class="muted">ここで乗り換え</div>':'<div class="good">目的地に到着</div>')+'</div></div>';
      const dir=directionOf(s.line,board,s.stations[s.stations.length-1]);
      const types=s._extra?usableTypes(s.line,board,alight):(s._types||[]);
      const curType=s._extra?(types[0]||''):s._type;
      const curDest=s._extra?dir.terminal:s._dest;
      const typeCtl=s._extra?'<b>'+esc(curType)+'</b>':'<select class="seg-type" data-sig="'+sig+'" data-i="'+s._i+'">'+types.map(t=>'<option '+(t===curType?'selected':'')+'>'+esc(t)+'</option>').join('')+'</select>';
      const destCtl=s._extra?'<b>'+esc(curDest)+'行き</b>':'<select class="seg-dest" data-sig="'+sig+'" data-i="'+s._i+'">'+(s._dests||[]).map(d=>'<option '+(d===curDest?'selected':'')+'>'+esc(d)+'</option>').join('')+'</select> 行き';
      const allN=s.line.stations.map(x=>x.name); const bI=allN.indexOf(board), aI=allN.indexOf(alight);
      const oppTerm=bI<aI?allN[0]:allN[allN.length-1];
      const platMap=s.line.platforms&&s.line.platforms[board];
      const platNum=platMap?platMap[bI<aI?'toLast':'toFirst']:null;
      return '<div class="timeline" style="--lc:'+s.line.color+'">'
        +'<div class="stop"><div class="big">'+esc(board)+'駅 <input type="time" class="seg-dep" data-sig="'+sig+'" data-seg="'+si+'" value="'+fmtTime(deps[si])+'" style="width:118px;display:inline-block;font-size:15px;padding:6px">発</div>'
        +'<span class="linechip" style="background:'+s.line.color+'">'+esc(s.line.name)+'</span>'
        +'<div class="board"><div class="board-head"><svg class="ic"><use href="#i-train"/></svg>'+typeCtl+' '+destCtl+'</div>'
        +'<div class="muted" style="font-size:14px;margin-top:2px">に乗ってください</div>'
        +(s._trunc?'<div style="margin-top:6px;padding:8px;border:2px solid #d43a2f;border-radius:8px"><b>⚠ その電車は'+esc(alight)+'止まりです</b><br>'+esc(alight)+'で降りて、下のルートに乗り換えてください（自動で組み直しました）</div>':'')
        +(s._extra?'<div class="muted" style="margin-top:4px">（乗り間違え対応で組み直した区間）</div>':'')
        +'<div class="dep-line"><span>発車目安 <b>'+fmtTime(deps[si])+'</b> 発</span>'+(platNum?'<span class="plat">'+esc(platNum)+'番ホーム</span>':'<span class="muted">ホーム番号: 情報未取得</span>')+'</div>'
        +'<ul class="okng">'
        +'<li class="ok"><svg class="ic"><use href="#i-check"/></svg><span><b>乗っていい</b>: '+esc(dir.terminal)+'行き（この方面の電車）<br><span class="muted">行き先が途中の駅止まりの電車も、降りる駅を通るなら乗れます</span></span></li>'
        +'<li class="ng"><svg class="ic"><use href="#i-ban"/></svg><span><b>乗ったらダメ</b>: '+esc(oppTerm)+'行き（逆方向）</span></li>'
        +'</ul>'
        +'<div class="muted" style="margin-top:6px">この区間に停車する種別: '+(types.length?types.map(esc).join(' / '):'情報未取得')+'</div>'
        +'<div class="muted">種別や行き先を間違えて乗ったときは、上の種別・行き先を変更すると時刻とルートが組み直されます。</div>'
        +'</div></div>'
        +'<div class="stop"><b>'+esc(alight)+'駅</b> <span class="muted">'+fmtTime(arrs[si])+'着</span>'+(si<CT.ds.length-1?'<div class="muted">ここで乗り換え（乗換目安 5分）</div>':'<div class="good">目的地に到着</div>')+'</div></div>'
        +(()=>{ const key=sig+'|'+si; const open=OPEN_VIA.has(key);
          const typeObj=s.line.types.find(t=>t.name===curType);
          let cum=0; const rows=s.stations.map((nm,k)=>{ if(k>0){ const st=s.line.stations.find(x=>x.name===nm); cum+=((st?st.min:2)||2)*(s._factor||1); }
            const isStop=!typeObj||typeObj.stops==='all'||typeObj.stops.includes(nm);
            const tag=k===0?'乗車':(k===s.stations.length-1?'降車':(isStop?'停車':'通過'));
            return '<div class="kv"><span>'+(k===0||k===s.stations.length-1?'<b>':'')+esc(nm)+'駅'+(k===0||k===s.stations.length-1?'</b>':'')+'</span><span class="muted">'+tag+(k>0?' ・ +'+Math.round(cum)+'分':'')+'</span></div>'; }).join('');
          return '<button class="sub via-btn" data-via="'+key+'" style="width:100%;margin-top:6px">駅間（経由駅一覧）'+(open?' ▲':' ▼')+'</button>'
            +'<div class="via-list" '+(open?'':'hidden')+' style="margin-top:6px">'+rows+'</div>'; })();
    }).join('');
    return '<div class="card" style="margin-top:12px"><div class="result-head"><span class="big">'+r._total+'分</span><span>'+fmtTime(computeTimes(r).deps[0])+' → '+fmtTime(computeTimes(r).arrs[computeTimes(r).arrs.length-1])+'</span></div>'
    +'<div class="muted">'+esc(r.label)+'｜乗換 '+r.transfers+'回｜運賃: '+(r.fare!=null?'¥'+r.fare:'情報未取得')+'｜時刻表: 情報未取得（発着は目安）</div>'
    +'<div class="muted">各区間の発時刻は変更できます。変更すると後ろの時刻が自動で再計算されます。</div>'
    + segsHtml
    +'<div class="row" style="margin-top:10px"><button class="sub" data-favroute="'+esc(LAST.from)+'|'+esc(LAST.to)+'"><svg class="ic" style="width:17px;height:17px;vertical-align:-3px"><use href="#i-star"/></svg> お気に入りに保存</button></div></div>';
  }).join('');
  $('#sortSel').onchange=e=>{ SORTMODE=e.target.value; renderRoutes(); };
  box.querySelectorAll('.seg-dep').forEach(inp=>inp.onchange=()=>{
    const r=LAST.routes.find(x=>x.segments.map(y=>y.lineId).join(',')===inp.dataset.sig); if(!r) return;
    r.depOverrides[+inp.dataset.seg]=inp.value; renderRoutes(false); toast('時刻を再計算しました'); });
  box.querySelectorAll('.seg-type').forEach(sel=>sel.onchange=()=>{ const r=LAST.routes.find(x=>x.segments.map(y=>y.lineId).join(',')===sel.dataset.sig); if(!r)return; r.typeSel[+sel.dataset.i]=sel.value; r._ds=null; renderRoutes(false); toast('種別を変更して再計算しました'); });
  box.querySelectorAll('.seg-dest').forEach(sel=>sel.onchange=()=>{ const r=LAST.routes.find(x=>x.segments.map(y=>y.lineId).join(',')===sel.dataset.sig); if(!r)return; r.destSel[+sel.dataset.i]=sel.value; r._ds=null; renderRoutes(false); toast('行き先を変更して組み直しました'); });
  box.querySelectorAll('.via-btn').forEach(b=>b.onclick=()=>{ const k=b.dataset.via; if(OPEN_VIA.has(k)) OPEN_VIA.delete(k); else OPEN_VIA.add(k); renderRoutes(false); });
  box.querySelectorAll('[data-favroute]').forEach(b=>b.onclick=()=>{ const favs=JSON.parse(localStorage.getItem('sn-favs')||'[]');
    favs.unshift({from:LAST.from,to:LAST.to}); localStorage.setItem('sn-favs',JSON.stringify(favs.slice(0,20))); toast('お気に入りに保存しました'); });
}
function viewHome(){
  const setup=Settings.setup()||{}; const commutes=Commute.list();
  const hist=JSON.parse(localStorage.getItem('sn-history')||'[]');
  $('#view').innerHTML=`
  <div class="card"><h2>${esc(setup.pref||'地域未設定')} の通勤・通学</h2>
  ${commutes.length?commutes.map(c=>{ const fam=matchFamiliarLines(GRAPH,setup.line||'');
    let rFam=null; if(fam.size&&GRAPH&&GRAPH.stations.has(c.from)&&GRAPH.stations.has(c.to)){ const rr=findRoutes(GRAPH,c.from,c.to,8,fam); if(rr&&rr.segments.every(s=>s.lineId.startsWith('walk-')||fam.has(s.lineId))) rFam=rr; }
    const rFast=GRAPH&&GRAPH.stations.has(c.from)&&GRAPH.stations.has(c.to)?findRoutes(GRAPH,c.from,c.to,5):null;
    const depFor=(r)=>{ const [h,m]=c.arriveBy.split(':').map(Number); const d=new Date(); d.setHours(h,m,0,0); return fmtTime(new Date(d.getTime()-routeTotalMinutes(r)*60000)); };
    let sug='経路データ未取得';
    if(c.arriveBy&&(rFam||rFast)){ const parts=[];
      if(rFam) parts.push('いつもの路線の出発目安 '+depFor(rFam)+'（所要 '+routeTotalMinutes(rFam)+'分・乗換'+rFam.transfers+'回）');
      if(rFast&&(!rFam||routeTotalMinutes(rFast)!==routeTotalMinutes(rFam))) parts.push('最速なら出発目安 '+depFor(rFast)+'（所要 '+routeTotalMinutes(rFast)+'分・乗換'+rFast.transfers+'回）');
      sug='到着希望 '+c.arriveBy+' → '+parts.join(' ／ '); }
    return `<div class="kv"><span><b>${esc(c.name)}</b><br><span class="muted">${esc(c.from)} → ${esc(c.to)}（${esc((c.days||[]).join('・')||'毎日')}）</span><br><span class="muted">${esc(sug)}</span></span><button class="sub" data-go="${esc(c.from)}|${esc(c.to)}"${c.arriveBy?` data-arrive="${esc(c.arriveBy)}"`:''}>検索</button></div>`;}).join(''):'<p class="muted">通勤・通学経路は未登録です。設定タブから登録できます。</p>'}
  </div>
  ${searchCard(true)}
  <div class="card"><h2>運行情報</h2><p class="muted">リアルタイム運行情報: 情報未取得。公共交通オープンデータセンター（ODPT）等は利用登録・APIキーが必要なため、本アプリにはキーを埋め込んでいません。遅延・運休などの最新情報は各事業者の公式発表でご確認ください。保存済みデータを最新情報のように表示することはありません。</p></div>
  ${hist.length?`<div class="card"><h2>最近の検索</h2>${hist.map(h=>`<div class="kv"><span>${esc(h.from)} → ${esc(h.to)}</span><button class="sub" data-go="${esc(h.from)}|${esc(h.to)}">検索</button></div>`).join('')}</div>`:''}`;
  bindSearchCard();
  const ti=$('#timeInput'); if(ti) ti.onchange=()=>{ const el=$('#time24'); if(el) el.textContent='入力中の時刻（24時間表示）: '+(ti.value||''); };
  document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{ const [f,t]=b.dataset.go.split('|'); searchState.from=f; searchState.to=t;
    if(b.dataset.arrive){ searchState.mode='arr'; searchState.time=b.dataset.arrive; } else { searchState.mode='dep'; searchState.time=fmtTime(new Date()); }
    nav('search'); setTimeout(doSearch,0); });
}
function viewSearch(){ $('#view').innerHTML=searchCard(true); bindSearchCard();
  const ti=$('#timeInput'); if(ti) ti.onchange=()=>{ const el=$('#time24'); if(el) el.textContent='入力中の時刻（24時間表示）: '+(ti.value||''); }; }
function viewFavs(){
  const favs=JSON.parse(localStorage.getItem('sn-favs')||'[]');
  $('#view').innerHTML=`<div class="card"><h2>お気に入りルート</h2>${favs.length?favs.map((f,i)=>`<div class="kv"><span>${esc(f.from)} → ${esc(f.to)}</span><span><button class="sub" data-go="${esc(f.from)}|${esc(f.to)}">検索</button> <button class="sub" data-del="${i}">削除</button></span></div>`).join(''):'<p class="muted">お気に入りはまだありません。検索結果から保存できます。</p>'}</div>`;
  document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{ const [f,t]=b.dataset.go.split('|'); searchState.from=f; searchState.to=t; nav('search'); setTimeout(doSearch,0); });
  document.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{ const a=JSON.parse(localStorage.getItem('sn-favs')||'[]'); a.splice(+b.dataset.del,1); localStorage.setItem('sn-favs',JSON.stringify(a)); render(); });
}
async function viewDownloads(){
  const m=await ensureManifest(); const installed={}; PACKS.forEach(p=>installed[p.id]=p);
  $('#view').innerHTML=`<div class="card"><h2>ダウンロード管理</h2>
  <p class="muted">駅・路線データはIndexedDBに保存され、オフラインでも検索できます。全国一括ではなく地域別です。</p>
  ${m.packs.map(p=>{ const ins=installed[p.id]; return `<div class="card"><b>${esc(p.name)}</b>
    <div class="kv"><span>状態</span><span>${ins?'保存済み':'未保存'}</span></div>
    <div class="lineslist"><span class="muted">路線</span><br>${p.lines.map(esc).join('、')}</div>
    ${ins?`<div class="kv"><span>容量</span><span>${ins._size?Math.round(ins._size/1024)+' KB':'―'}</span></div><div class="kv"><span>最終更新</span><span>${esc(fmtDT(ins._updatedAt||ins.updated))}</span></div>`:''}
    <progress id="prog-${p.id}" value="0" max="100" class="hidden"></progress><div id="progtext-${p.id}" class="muted"></div>
    <div class="row" style="margin-top:8px">${ins?`<button class="sub" data-upd="${p.id}">更新を確認</button><button class="danger" data-delpack="${p.id}">削除</button>`:`<button data-dl="${p.id}">ダウンロード</button>`}</div></div>`;}).join('')}
  <div class="row"><button class="sub" id="checkUpdate">今すぐ更新を確認</button><button class="sub" id="gtfsBtn">GTFS-JPを読み込む</button></div>
  <input type="file" id="gtfsFiles" multiple accept=".txt,.csv" class="hidden">
  <p class="muted">GTFS-JP: 事業者・自治体が公開するGTFS（stops.txt / routes.txt / trips.txt / stop_times.txt）を端末上で解析して取り込みます。外部送信はしません。</p>
  <div id="updResult" class="muted"></div></div>
  <div class="card"><h2>未対応の都道府県</h2><p class="muted">以下は同梱データパックが無く未対応です（ダミーデータは表示しません）。GTFS-JPを公開している事業者のデータを取り込むことで利用できます。<br>${(m.unsupportedPrefs||[]).map(esc).join('、')}</p></div>`;
  document.querySelectorAll('[data-dl]').forEach(b=>b.onclick=()=>{ $('#prog-'+b.dataset.dl).classList.remove('hidden'); downloadPack(b.dataset.dl,b); });
  document.querySelectorAll('[data-upd]').forEach(b=>b.onclick=async()=>{ const r=await Updater.checkAndUpdate((id,pct)=>{const pr=$('#prog-'+id); if(pr){pr.classList.remove('hidden');pr.value=pct;}}); $('#updResult').textContent=r.status==='ok'?('更新完了（更新 '+r.updated+' 件）'):(r.reason||'更新できませんでした'); await reloadGraph(); });
  document.querySelectorAll('[data-delpack]').forEach(b=>b.onclick=async()=>{ await DB.delPack(b.dataset.delpack); await reloadGraph(); toast('削除しました'); render(); });
  $('#checkUpdate').onclick=async()=>{ const r=await Updater.checkAndUpdate(); $('#updResult').textContent=r.status==='ok'?('更新完了（更新 '+r.updated+' 件）'):(r.reason||''); await reloadGraph(); };
  $('#gtfsBtn').onclick=()=>$('#gtfsFiles').click();
  $('#gtfsFiles').onchange=importGTFS;
}
async function importGTFS(ev){
  const files={}; for(const f of ev.target.files) files[f.name]=await f.text();
  try{
    if(!files['stops.txt']||!files['routes.txt']||!files['trips.txt']||!files['stop_times.txt']) throw new Error('stops.txt / routes.txt / trips.txt / stop_times.txt が必要です');
    const csv=t=>{ const lines=t.trim().split(/\r?\n/); const head=lines[0].split(',').map(s=>s.trim());
      return lines.slice(1).filter(Boolean).map(l=>{ const v=l.split(','); const o={}; head.forEach((h,i)=>o[h]=(v[i]||'').trim()); return o; }); };
    const stops={}; csv(files['stops.txt']).forEach(s=>stops[s.stop_id]=s.stop_name);
    const routes={}; csv(files['routes.txt']).forEach(r=>routes[r.route_id]=r.route_long_name||r.route_short_name||r.route_id);
    const trips=csv(files['trips.txt']); const byRoute={};
    const stByTrip={}; csv(files['stop_times.txt']).forEach(st=>{ (stByTrip[st.trip_id]=stByTrip[st.trip_id]||[]).push(st); });
    trips.forEach(t=>{ const sts=(stByTrip[t.trip_id]||[]).sort((a,b)=>+a.stop_sequence-+b.stop_sequence); if(sts.length>1&&(!byRoute[t.route_id]||sts.length>byRoute[t.route_id].length)) byRoute[t.route_id]=sts; });
    const lines=Object.entries(byRoute).map(([rid,sts],i)=>({id:'gtfs-'+rid,name:routes[rid]||rid,color:'#555555',operator:'GTFS-JP取込',types:[{name:'各駅停車',stops:'all'}],through:{},
      stations:sts.map((s,j)=>{ let min=0; if(j>0){ const p=sts[j-1]; const toSec=x=>{const[a,b,c]=x.split(':').map(Number);return a*3600+b*60+c;}; min=Math.max(1,Math.round((toSec(s.departure_time)-toSec(p.departure_time))/60)); } return {name:stops[s.stop_id]||s.stop_id,min}; })}));
    if(!lines.length) throw new Error('路線を構築できませんでした');
    await DB.putPack({id:'gtfs-'+Date.now(),name:'GTFS-JP取込データ',region:'取込',prefs:[],version:'gtfs',updated:new Date().toISOString(),_updatedAt:new Date().toISOString(),source:'利用者が端末上で取り込んだGTFS-JP',lines});
    await reloadGraph(); toast('GTFS-JPを取り込みました（'+lines.length+'路線）'); render();
  }catch(e){ toast('GTFS取込に失敗: '+e.message); }
}
function viewSettings(){
  const s=Settings.load(); const setup=Settings.setup()||{}; const commutes=Commute.list();
  $('#view').innerHTML=`<div class="card"><h2>設定</h2>
  <div class="kv"><span>利用地域</span><span>${esc(setup.pref||'未設定')}</span></div>
  <div class="kv"><span>よく使う出発駅</span><span>${esc(setup.from||'未設定')}</span></div>
  <div class="kv"><span>よく使う目的駅</span><span>${esc(setup.to||'未設定')}</span></div>
  <div class="kv"><span>よく使う路線</span><span>${esc(setup.line||'未設定')}</span></div>
  <div class="kv"><span>よく使う乗換駅</span><span>${esc(setup.transfer||'未設定')}</span></div>
  <button class="sub" id="editSetup" style="width:100%">セットアップをやり直す</button>
  <div class="switch"><span>自動更新（起動時・復帰時・6時間ごと）</span><input type="checkbox" id="swAuto" ${s.autoUpdate?'checked':''}></div>
  <div class="switch"><span>Wi-Fiのときだけ更新</span><input type="checkbox" id="swWifi" ${s.wifiOnly?'checked':''}></div>
  <div class="switch"><span>モバイル通信での更新を許可</span><input type="checkbox" id="swMobile" ${s.mobileUpdate!==false?'checked':''}></div>
  <label>表示モード</label><select id="selDark"><option value="auto" ${s.dark==='auto'?'selected':''}>自動</option><option value="light" ${s.dark==='light'?'selected':''}>ライト</option><option value="dark" ${s.dark==='dark'?'selected':''}>ダーク</option></select>
  <div style="height:10px"></div><button class="danger" id="resetAll" style="width:100%">設定と保存データを初期化</button>
  <p class="muted">アカウント・メール・電話番号は不要です。設定と履歴はこの端末内（localStorage / IndexedDB）にのみ保存され、外部送信しません。GPSは「現在地から検索」を押したときだけ使います。</p></div>
  <div class="card"><h2>通勤・通学経路の登録</h2>
  <label>名前</label><input id="cName" placeholder="例: 通勤（行き）">
  <label>自宅の最寄り駅</label><input id="cFrom" placeholder="駅名を入力して候補から選択" autocomplete="off"><div id="cFrom-sug" class="suggest hidden"></div>
  <label>職場・学校の最寄り駅</label><input id="cTo" placeholder="駅名を入力して候補から選択" autocomplete="off"><div id="cTo-sug" class="suggest hidden"></div>
  <label>到着希望時刻</label><input type="time" id="cArrive">
  <label>利用する曜日（カンマ区切り）</label><input id="cDays" placeholder="月,火,水,木,金">
  <div style="height:10px"></div><button id="cAdd" style="width:100%">登録する</button>
  ${commutes.map(c=>`<div class="kv"><span><b>${esc(c.name)}</b><br><span class="muted">${esc(c.from)} → ${esc(c.to)} / 到着希望 ${esc(c.arriveBy||'未設定')}</span></span><button class="sub" data-cdel="${c.id}">削除</button></div>`).join('')}
  </div>
  <div class="card"><h2>通勤モード（GPS連動ポップアップ）</h2>
  <div class="switch"><span>通勤モードをONにする</span><input type="checkbox" id="cmToggle"></div>
  <p class="muted" id="cmStatus">現在OFFです</p>
  <p class="muted">ONにすると、アプリを開いている間に1分ごとに現在地を確認し、登録した通勤経路の駅（午前は自宅側、午後は職場・学校側）から約450m以内に入ると「何行きに乗ればいいか」をポップアップで表示します。駅から離れるまで表示し続けます。位置情報は端末内でのみ使い、外部送信しません。</p></div>`;
  $('#editSetup').onclick=()=>showSetup(true);
  const save=()=>{ const ns={...Settings.load(),autoUpdate:$('#swAuto').checked,wifiOnly:$('#swWifi').checked,mobileUpdate:$('#swMobile').checked,dark:$('#selDark').value}; Settings.save(ns); applyTheme(); toast('設定を保存しました'); };
  ['swAuto','swWifi','swMobile','selDark'].forEach(id=>$('#'+id).onchange=save);
  $('#resetAll').onclick=async()=>{ Settings.clearAll(); const packs=await DB.allPacks(); for(const p of packs) await DB.delPack(p.id); await reloadGraph(); toast('初期化しました'); showSetup(false); render(); };
  bindSuggest('cFrom',null); bindSuggest('cTo',null);
  const cmT=$('#cmToggle'); if(cmT){ cmT.checked=CommuteMode.enabled();
    cmT.onchange=()=>{ CommuteMode.setEnabled(cmT.checked); $('#cmStatus').textContent=cmT.checked?(Commute.list().length?'現在ONです（アプリを開いている間だけ動作します）':'ONにしました。通勤経路が未登録の場合は先に登録してください。'):'OFFにしました。'; if(cmT.checked) CommuteMode.tick(); };
    $('#cmStatus').textContent=CommuteMode.enabled()?'現在ONです（アプリを開いている間だけ動作します）':'現在OFFです'; }
  $('#cAdd').onclick=()=>{ const name=$('#cName').value.trim(); if($('#cFrom').dataset.picked!==$('#cFrom').value.trim()||$('#cTo').dataset.picked!==$('#cTo').value.trim()){ toast('駅は候補をタップして選んでください'); return; } const fromR=resolveStation(GRAPH,$('#cFrom').value.trim()),toR=resolveStation(GRAPH,$('#cTo').value.trim());
    if(!name||!fromR||!toR){ toast('名前と、候補にある駅を選んでください'); return; } const from=fromR,to=toR;
    Commute.add({name,from,to,arriveBy:$('#cArrive').value,days:$('#cDays').value.split(',').map(x=>x.trim()).filter(Boolean)}); toast('通勤経路を登録しました'); render(); };
  document.querySelectorAll('[data-cdel]').forEach(b=>b.onclick=()=>{ Commute.remove(+b.dataset.cdel); render(); });
}
function showSetup(force){
  const prefs=['東京都','神奈川県','埼玉県','千葉県','大阪府','京都府','兵庫県','奈良県'];
  const cur=Settings.setup()||{};
  const modal=$('#setupModal'); modal.classList.remove('hidden');
  modal.innerHTML=`<div class="sheet"><h2>Station Navi セットアップ</h2>
  <p class="muted">設定はこの端末内にだけ保存されます。アカウント登録は不要です。駅と路線は、入力した文字への候補から選んでください（実在する駅・路線だけが選べます）。</p>
  <label>居住・利用地域（都道府県）</label><select id="suPref">${prefs.map(p=>`<option ${cur.pref===p?'selected':''}>${p}</option>`).join('')}</select>
  <label>よく利用する出発駅</label><input id="suFrom" autocomplete="off" placeholder="駅名を入力" value="${esc(cur.from||'')}"><div id="suFrom-sug" class="suggest hidden"></div><div id="suFrom-err" class="muted"></div>
  <label>よく利用する目的駅</label><input id="suTo" autocomplete="off" placeholder="駅名を入力" value="${esc(cur.to||'')}"><div id="suTo-sug" class="suggest hidden"></div><div id="suTo-err" class="muted"></div>
  <label>よく利用する路線（候補から選んで追加、複数可）</label><input id="suLineInput" autocomplete="off" placeholder="路線名を入力"><div id="suLine-sug" class="suggest hidden"></div>
  <div id="suLineChips" style="margin-top:8px"></div>
  <label>通勤・通学の有無</label><select id="suCommute"><option value="commute" ${cur.commute==='commute'?'selected':''}>通勤</option><option value="school" ${cur.commute==='school'?'selected':''}>通学</option><option value="none" ${cur.commute==='none'?'selected':''}>なし</option></select>
  <label>よく使う乗換駅（候補から選んで追加、複数可）</label><input id="suTransferInput" autocomplete="off" placeholder="駅名を入力"><div id="suTransferInput-sug" class="suggest hidden"></div>
  <div id="suTransferChips" style="margin-top:8px"></div>
  <div class="row" style="margin-top:10px"><button class="sub" id="suGps"><svg class="ic" style="width:17px;height:17px;vertical-align:-3px"><use href="#i-pin"/></svg> 現在地を使う</button></div><div id="suNear" class="muted"></div>
  <div style="height:12px"></div><button id="suDone" style="width:100%">設定して始める</button>
  ${force?'<div style="height:8px"></div><button class="sub" id="suCancel" style="width:100%">キャンセル</button>':''}</div>`;
  const cancel=$('#suCancel'); if(cancel) cancel.onclick=()=>modal.classList.add('hidden');
  // chips state
  const lineSel=[], transferSel=[];
  const drawChips=(boxId,arr)=>{ const box=$(boxId); box.innerHTML=arr.map((v,i)=>'<span class="linechip" style="background:#445;margin:0 6px 6px 0">'+esc(v)+' <a href="#" data-chip="'+i+'" style="color:#fff;text-decoration:none">✕</a></span>').join('');
    box.querySelectorAll('[data-chip]').forEach(x=>x.onclick=e=>{e.preventDefault();arr.splice(+x.dataset.chip,1);drawChips(boxId,arr);}); };
  if(cur.line){ const fam=GRAPH?matchFamiliarLines(GRAPH,cur.line):new Set(); fam.forEach(id=>{ const n=GRAPH.lines.get(id).name; if(!lineSel.includes(n))lineSel.push(n); }); }
  if(cur.transfer){ cur.transfer.split(/\s+/).filter(Boolean).forEach(t=>{ const r=GRAPH?resolveStation(GRAPH,t):null; if(r&&!transferSel.includes(r))transferSel.push(r); }); }
  drawChips('#suLineChips',lineSel); drawChips('#suTransferChips',transferSel);
  bindSuggest('suFrom',null); bindSuggest('suTo',null);
  ['suFrom','suTo'].forEach(id=>{ const el=$('#'+id); if(el&&el.value.trim()&&GRAPH&&resolveStation(GRAPH,el.value.trim())===el.value.trim()) el.dataset.picked=el.value.trim(); });
  bindSuggest('suTransferInput',null,v=>{ if(!transferSel.includes(v))transferSel.push(v); $('#suTransferInput').value=''; drawChips('#suTransferChips',transferSel); });
  const li=$('#suLineInput'), lbox=$('#suLine-sug');
  li.addEventListener('input',()=>{ if(!GRAPH){lbox.classList.add('hidden');return;}
    const items=suggestLines(GRAPH,li.value,10); if(!items.length){lbox.classList.add('hidden');return;}
    lbox.innerHTML=items.map(x=>'<button type="button" data-line="'+esc(x.line.name)+'">'+esc(x.line.name)+'<small>'+esc(x.line.operator)+'</small></button>').join('');
    lbox.classList.remove('hidden');
    lbox.querySelectorAll('button').forEach(b=>b.onclick=()=>{ if(!lineSel.includes(b.dataset.line))lineSel.push(b.dataset.line); li.value=''; lbox.classList.add('hidden'); drawChips('#suLineChips',lineSel); }); });
  const ensurePack=async()=>{ const pref=$('#suPref').value; const info=(MANIFEST.packs||[]).find(p=>(p.prefs||[]).includes(pref));
    if(info&&!(await DB.getPack(info.id))){ toast(pref+' のデータを読み込んでいます'); await downloadPack(info.id,null); } };
  $('#suPref').onchange=ensurePack; if(!PACKS.length) ensurePack();
  $('#suGps').onclick=async()=>{ try{ const pos=await getPosition(); $('#suNear').textContent='位置を取得しました（保存・送信はしません）。緯度'+pos.coords.latitude.toFixed(3)+' 経度'+pos.coords.longitude.toFixed(3);
    }catch(e){ $('#suNear').textContent='位置情報を取得できませんでした。手入力で設定できます。'; } };
  $('#suDone').onclick=async()=>{ await ensurePack();
    const fromV=$('#suFrom').value.trim(), toV=$('#suTo').value.trim();
    if((fromV&&$('#suFrom').dataset.picked!==fromV)||(toV&&$('#suTo').dataset.picked!==toV)){ toast('駅は候補をタップして選んでください'); return; }
    const fromR=fromV?resolveStation(GRAPH,fromV):'', toR=toV?resolveStation(GRAPH,toV):'';
    let ok=true;
    $('#suFrom-err').textContent=fromV&&!fromR?'この駅は候補にありません。入力して候補から選んでください。':''; if(fromV&&!fromR)ok=false;
    $('#suTo-err').textContent=toV&&!toR?'この駅は候補にありません。入力して候補から選んでください。':''; if(toV&&!toR)ok=false;
    if(!ok){ toast('駅は候補から選んでください'); return; }
    Settings.saveSetup({pref:$('#suPref').value,from:fromR||'',to:toR||'',line:lineSel.join(' '),commute:$('#suCommute').value,transfer:transferSel.join(' ')});
    modal.classList.add('hidden'); if(fromR)searchState.from=fromR; if(toR)searchState.to=toR; render(); toast('設定を保存しました'); };
}
/* ---------- Boot ---------- */
(async function boot(){
  applyTheme(); registerSW(); if(CommuteMode.enabled()) CommuteMode.start();
  if(window.navigator.standalone===false && !(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)) document.body.classList.add('inbrowser');
  document.addEventListener('gesturestart',e=>e.preventDefault());
  document.addEventListener('gesturechange',e=>e.preventDefault());
  document.addEventListener('touchmove',e=>{ if(e.touches.length>1) e.preventDefault(); },{passive:false});
  await DB.open(); await ensureManifest(); await reloadGraph();
  document.querySelectorAll('.tabbar button').forEach(b=>b.onclick=()=>nav(b.dataset.tab));
  window.addEventListener('online',async()=>{ updateNet(); const s=Settings.load(); if(s.autoUpdate){ await Updater.checkAndUpdate(); await reloadGraph(); if(TAB==='downloads')render(); } });
  window.addEventListener('offline',updateNet);
  render();
  if(!Settings.setup()) showSetup(false);
  const s=Settings.load();
  if(s.autoUpdate && navigator.onLine){ Updater.checkAndUpdate().then(async()=>{ await reloadGraph(); }); }
  setInterval(async()=>{ const st=Settings.load(); if(st.autoUpdate&&navigator.onLine){ await Updater.checkAndUpdate(); await reloadGraph(); } },6*60*60*1000);
})();
