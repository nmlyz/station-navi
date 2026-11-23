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
function nav(tab){ TAB=tab; document.querySelectorAll('.tabbar button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab)); render(); }
function render(){ ({home:viewHome,search:viewSearch,favs:viewFavs,downloads:viewDownloads,settings:viewSettings}[TAB]||viewHome)(); }
function stationInput(id,label,val){ return `<label>${label}</label><input id="${id}" autocomplete="off" placeholder="駅名・路線名・都道府県" value="${esc(val)}"><div id="${id}-sug" class="suggest hidden"></div>`; }
function bindSuggest(inputId,key){
  const inp=$('#'+inputId), box=$('#'+inputId+'-sug'); if(!inp) return;
  inp.addEventListener('input',()=>{ const items=GRAPH?suggestStations(GRAPH,PACKS,inp.value):[];
    if(!items.length){box.classList.add('hidden');return;}
    box.innerHTML=items.map(x=>`<button type="button" data-st="${esc(x.station.name)}">${esc(x.station.name)}<small>${x.station.lines.map(id=>GRAPH.lines.get(id).name).join(' / ')}</small></button>`).join('');
    box.classList.remove('hidden');
    box.querySelectorAll('button').forEach(b=>b.onclick=()=>{ inp.value=b.dataset.st; searchState[key]=b.dataset.st; box.classList.add('hidden'); }); });
  inp.addEventListener('change',()=>{searchState[key]=inp.value.trim();});
}
function searchCard(prefill){
  const setup=Settings.setup()||{};
  if(prefill){ searchState.from=searchState.from||setup.from||''; searchState.to=searchState.to||setup.to||''; }
  const now=new Date(); if(!searchState.time) searchState.time=fmtTime(now);
  return `<div class="card"><h2>乗換検索</h2>
  ${stationInput('fromInput','出発駅',searchState.from)}
  <div class="row" style="margin-top:8px"><button class="sub swap" id="swapBtn" title="入れ替え">⇅ 入れ替え</button><button class="sub" id="gpsBtn">📍 現在地から検索</button></div>
  <div id="nearby"></div>
  ${stationInput('toInput','到着駅',searchState.to)}
  <label>時刻の指定</label><div class="row"><select id="timeMode"><option value="dep" ${searchState.mode==='dep'?'selected':''}>出発時刻</option><option value="arr" ${searchState.mode==='arr'?'selected':''}>到着希望時刻</option></select><input type="time" id="timeInput" value="${esc(searchState.time)}"></div>
  <div style="height:12px"></div><button id="doSearch" style="width:100%">検索する</button>
  <div id="results"></div></div>`;
}
function bindSearchCard(){
  bindSuggest('fromInput','from'); bindSuggest('toInput','to');
  const sw=$('#swapBtn'); if(sw) sw.onclick=()=>{ [searchState.from,searchState.to]=[searchState.to,searchState.from]; render(); };
  const gps=$('#gpsBtn'); if(gps) gps.onclick=async()=>{ const nb=$('#nearby'); nb.innerHTML='<p class="muted">位置情報を取得中…（この操作のときだけ取得します）</p>';
    try{ const pos=await getPosition(); const near=nearestStations(GRAPH,pos.coords.latitude,pos.coords.longitude);
      if(!near.length){ nb.innerHTML='<p class="muted">座標データのある駅が近くに見つかりませんでした。通常の駅検索をご利用ください。</p>'; return; }
      nb.innerHTML='<h3>最寄り駅（位置情報は保存・送信しません）</h3>'+near.map(n=>`<button class="sub" style="width:100%;margin-bottom:6px" data-near="${esc(n.name)}">${esc(n.name)}（約${n.km}km）</button>`).join('');
      nb.querySelectorAll('[data-near]').forEach(b=>b.onclick=()=>{ searchState.from=b.dataset.near; render(); });
    }catch(e){ nb.innerHTML='<p class="muted">位置情報を取得できませんでした。通常の駅検索をご利用ください。</p>'; } };
  const ds=$('#doSearch'); if(ds) ds.onclick=doSearch;
}
function doSearch(){
  searchState.from=$('#fromInput').value.trim(); searchState.to=$('#toInput').value.trim();
  searchState.mode=$('#timeMode').value; searchState.time=$('#timeInput').value||fmtTime(new Date());
  const box=$('#results');
  if(!GRAPH||!PACKS.length){ box.innerHTML='<p>駅データが未ダウンロードです。「ダウンロード」タブから地域データを保存してください。</p>'; return; }
  if(!GRAPH.stations.has(searchState.from)||!GRAPH.stations.has(searchState.to)){ box.innerHTML='<p>駅が見つかりません。保存済みデータに含まれる駅名で入力してください。未対応の地域は「ダウンロード」タブで確認できます。</p>'; return; }
  if(searchState.from===searchState.to){ box.innerHTML='<p>出発駅と到着駅が同じです。</p>'; return; }
  const seen=new Set(), routes=[];
  const sigOf=r=>r.segments.map(s=>s.lineId+':'+s.stations[0]+'-'+s.stations[s.stations.length-1]).join('|');
  // User's registered lines first: a route built only from those lines is the top suggestion.
  const setup0=Settings.setup()||{}; const fam=matchFamiliarLines(GRAPH,setup0.line||'');
  if(fam.size){ const r=findRoutes(GRAPH,searchState.from,searchState.to,8,fam);
    if(r){ const onlyFam=r.segments.every(s=>s.lineId.startsWith('walk-')||fam.has(s.lineId));
      if(onlyFam){ routes.push({label:'おすすめ（いつもの路線）',...r}); seen.add(sigOf(r)); } } }
  const variants=[['最速',5],['乗換少なめ',14],['標準',8]];
  const rest=[];
  variants.forEach(([label,pen])=>{ const r=findRoutes(GRAPH,searchState.from,searchState.to,pen); if(!r) return;
    if(seen.has(sigOf(r))) return; seen.add(sigOf(r)); rest.push({label,...r}); });
  rest.sort((a,b)=>a.minutes-b.minutes);
  if(rest.length&&!routes.length) rest[0].label='おすすめ（最速）';
  routes.push(...rest);
  if(!routes.length){ box.innerHTML='<p>保存済みデータの範囲では経路が見つかりませんでした。</p>'; return; }
  const hist=JSON.parse(localStorage.getItem('sn-history')||'[]'); hist.unshift({from:searchState.from,to:searchState.to,at:Date.now()});
  localStorage.setItem('sn-history',JSON.stringify(hist.filter((h,i,a)=>a.findIndex(x=>x.from===h.from&&x.to===h.to)===i).slice(0,10)));
  const [hh,mm]=searchState.time.split(':').map(Number);
  box.innerHTML=routes.map((r,ri)=>{
    let cursor=new Date(); cursor.setHours(hh,mm,0,0);
    if(searchState.mode==='arr') cursor=new Date(cursor.getTime()-r.minutes*60000);
    const dep=new Date(cursor); let t=new Date(cursor);
    const segsHtml=r.segments.map((s,si)=>{
      const board=s.stations[0], alight=s.stations[s.stations.length-1];
      const dir=directionOf(s.line,board,alight); const types=usableTypes(s.line,board,alight);
      let segMin=0; for(let i=1;i<s.stations.length;i++){ const st=s.line.stations.find(x=>x.name===s.stations[i]); segMin+=(st?st.min:2)||2; }
      const depT=fmtTime(t); t=new Date(t.getTime()+segMin*60000); const arrT=fmtTime(t);
      if(si<r.segments.length-1) t=new Date(t.getTime()+5*60000);
      return `<div class="timeline" style="--lc:${s.line.color}">
        <div class="stop"><div class="big">${esc(board)}駅 <span class="muted">${depT}発（目安）</span></div>
        <span class="linechip" style="background:${s.line.color}">${esc(s.line.name)}</span>
        <div style="margin-top:6px"><b>${esc(dir.terminal)}方面</b> の電車に乗ってください</div>
        <div class="muted">行き先の候補: ${dir.dests.map(esc).join(' / ')}</div>
        <div class="muted">この区間に停車する種別: ${types.length?types.map(esc).join(' / '):'情報未取得'}</div>
        <div class="muted">ホーム番号: 情報未取得</div></div>
        <div class="stop"><b>${esc(alight)}駅</b> <span class="muted">${arrT}着（目安）</span>${si<r.segments.length-1?`<div class="muted">ここで乗り換え（乗換目安 5分）</div>`:'<div class="good">目的地に到着</div>'}</div>
      </div>`; }).join('');
    const arr=new Date(dep.getTime()+r.minutes*60000);
    return `<div class="card" style="margin-top:12px"><div class="result-head"><span class="big">${r.minutes}分</span><span>${fmtTime(dep)} → ${fmtTime(arr)}</span></div>
    <div class="muted">${esc(r.label)}｜乗換 ${r.transfers}回｜運賃: 情報未取得｜時刻表: 情報未取得（発着は所要時間からの目安表示です）</div>
    ${segsHtml}
    <div class="row" style="margin-top:10px"><button class="sub" data-fav="${ri}">⭐ お気に入りに保存</button></div></div>`;
  }).join('');
  box.querySelectorAll('[data-fav]').forEach(b=>b.onclick=()=>{ const favs=JSON.parse(localStorage.getItem('sn-favs')||'[]');
    favs.unshift({from:searchState.from,to:searchState.to}); localStorage.setItem('sn-favs',JSON.stringify(favs.slice(0,20))); toast('お気に入りに保存しました'); });
}
function viewHome(){
  const setup=Settings.setup()||{}; const commutes=Commute.list();
  const hist=JSON.parse(localStorage.getItem('sn-history')||'[]');
  $('#view').innerHTML=`
  <div class="card"><h2>${esc(setup.pref||'地域未設定')} の通勤・通学</h2>
  ${commutes.length?commutes.map(c=>{ const r=GRAPH&&GRAPH.stations.has(c.from)&&GRAPH.stations.has(c.to)?findRoutes(GRAPH,c.from,c.to,8):null;
    let sug='経路データ未取得'; if(r&&c.arriveBy){ const [h,m]=c.arriveBy.split(':').map(Number); const d=new Date(); d.setHours(h,m,0,0); sug='到着希望 '+c.arriveBy+' → 出発目安 '+fmtTime(new Date(d.getTime()-r.minutes*60000))+'（所要 '+r.minutes+'分・乗換'+r.transfers+'回）'; }
    return `<div class="kv"><span><b>${esc(c.name)}</b><br><span class="muted">${esc(c.from)} → ${esc(c.to)}（${esc((c.days||[]).join('・')||'毎日')}）</span><br><span class="muted">${esc(sug)}</span></span><button class="sub" data-go="${esc(c.from)}|${esc(c.to)}">検索</button></div>`;}).join(''):'<p class="muted">通勤・通学経路は未登録です。設定タブから登録できます。</p>'}
  </div>
  ${searchCard(true)}
  <div class="card"><h2>運行情報</h2><p class="muted">リアルタイム運行情報: 情報未取得。公共交通オープンデータセンター（ODPT）等は利用登録・APIキーが必要なため、本アプリにはキーを埋め込んでいません。遅延・運休などの最新情報は各事業者の公式発表でご確認ください。保存済みデータを最新情報のように表示することはありません。</p></div>
  ${hist.length?`<div class="card"><h2>最近の検索</h2>${hist.map(h=>`<div class="kv"><span>${esc(h.from)} → ${esc(h.to)}</span><button class="sub" data-go="${esc(h.from)}|${esc(h.to)}">検索</button></div>`).join('')}</div>`:''}`;
  bindSearchCard();
  document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{ const [f,t]=b.dataset.go.split('|'); searchState.from=f; searchState.to=t; nav('search'); setTimeout(doSearch,0); });
}
function viewSearch(){ $('#view').innerHTML=searchCard(true); bindSearchCard(); }
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
  <label>自宅の最寄り駅</label><input id="cFrom" placeholder="駅名">
  <label>職場・学校の最寄り駅</label><input id="cTo" placeholder="駅名">
  <label>到着希望時刻</label><input type="time" id="cArrive">
  <label>利用する曜日（カンマ区切り）</label><input id="cDays" placeholder="月,火,水,木,金">
  <div style="height:10px"></div><button id="cAdd" style="width:100%">登録する</button>
  ${commutes.map(c=>`<div class="kv"><span><b>${esc(c.name)}</b><br><span class="muted">${esc(c.from)} → ${esc(c.to)} / 到着希望 ${esc(c.arriveBy||'未設定')}</span></span><button class="sub" data-cdel="${c.id}">削除</button></div>`).join('')}
  </div>`;
  $('#editSetup').onclick=()=>showSetup(true);
  const save=()=>{ const ns={...Settings.load(),autoUpdate:$('#swAuto').checked,wifiOnly:$('#swWifi').checked,mobileUpdate:$('#swMobile').checked,dark:$('#selDark').value}; Settings.save(ns); applyTheme(); toast('設定を保存しました'); };
  ['swAuto','swWifi','swMobile','selDark'].forEach(id=>$('#'+id).onchange=save);
  $('#resetAll').onclick=async()=>{ Settings.clearAll(); const packs=await DB.allPacks(); for(const p of packs) await DB.delPack(p.id); await reloadGraph(); toast('初期化しました'); showSetup(false); render(); };
  $('#cAdd').onclick=()=>{ const name=$('#cName').value.trim(),from=$('#cFrom').value.trim(),to=$('#cTo').value.trim();
    if(!name||!from||!to){ toast('名前・出発駅・到着駅を入力してください'); return; }
    Commute.add({name,from,to,arriveBy:$('#cArrive').value,days:$('#cDays').value.split(',').map(x=>x.trim()).filter(Boolean)}); toast('通勤経路を登録しました'); render(); };
  document.querySelectorAll('[data-cdel]').forEach(b=>b.onclick=()=>{ Commute.remove(+b.dataset.cdel); render(); });
}
function showSetup(force){
  const m=MANIFEST||{packs:[]}; const prefs=['東京都','神奈川県','埼玉県','千葉県','大阪府','京都府','兵庫県','奈良県'];
  const modal=$('#setupModal'); modal.classList.remove('hidden');
  modal.innerHTML=`<div class="sheet"><h2>Station Navi セットアップ</h2>
  <p class="muted">設定はこの端末内にだけ保存されます。アカウント登録は不要です。選んだ地域の駅データをダウンロードします。</p>
  <label>居住・利用地域（都道府県）</label><select id="suPref">${prefs.map(p=>`<option>${p}</option>`).join('')}</select>
  <label>よく利用する出発駅</label><input id="suFrom" placeholder="駅名を入力">
  <label>よく利用する目的駅</label><input id="suTo" placeholder="駅名を入力">
  <label>よく利用する路線</label><input id="suLine" placeholder="路線名を入力（複数は空白区切り）">
  <label>通勤・通学の有無</label><select id="suCommute"><option value="commute">通勤</option><option value="school">通学</option><option value="none">なし</option></select>
  <label>よく使う乗換駅</label><input id="suTransfer" placeholder="駅名を入力（複数は空白区切り）">
  <div class="row" style="margin-top:10px"><button class="sub" id="suGps">📍 現在地を使う</button></div><div id="suNear" class="muted"></div>
  <div style="height:12px"></div><button id="suDone" style="width:100%">設定して始める</button>
  ${force?'<div style="height:8px"></div><button class="sub" id="suCancel" style="width:100%">キャンセル</button>':''}</div>`;
  const cancel=$('#suCancel'); if(cancel) cancel.onclick=()=>modal.classList.add('hidden');
  $('#suGps').onclick=async()=>{ try{ const pos=await getPosition(); $('#suNear').textContent='位置を取得しました（保存・送信はしません）。最寄り駅の判定にはダウンロード後のデータを使います。現在地: 緯度'+pos.coords.latitude.toFixed(3)+' 経度'+pos.coords.longitude.toFixed(3);
    }catch(e){ $('#suNear').textContent='位置情報を取得できませんでした。手入力で設定できます。'; } };
  $('#suDone').onclick=async()=>{ const pref=$('#suPref').value;
    Settings.saveSetup({pref,from:$('#suFrom').value.trim(),to:$('#suTo').value.trim(),line:$('#suLine').value.trim(),commute:$('#suCommute').value,transfer:$('#suTransfer').value.trim()});
    modal.classList.add('hidden'); render();
    const packInfo=(MANIFEST.packs||[]).find(p=>(p.prefs||[]).includes(pref));
    if(packInfo && !(await DB.getPack(packInfo.id))){ toast(pref+' のデータをダウンロードします'); await downloadPack(packInfo.id,null); render(); } };
}
/* ---------- Boot ---------- */
(async function boot(){
  applyTheme(); registerSW();
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
