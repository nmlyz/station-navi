// Googleマップ Directions（JavaScript API）による1回検索（結果は端末に保存しない・表示のみ）
const GoogleDir={
  key(){ return (Settings.load().gkey||'').trim(); },
  _load(key){ return new Promise((res,rej)=>{
    if(window.google&&google.maps&&google.maps.DirectionsService) return res();
    const sc=document.createElement('script');
    sc.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(key)+'&language=ja';
    sc.onload=()=>res(); sc.onerror=()=>rej(new Error('Googleマップの読み込みに失敗しました'));
    document.head.appendChild(sc); }); },
  async search(from,to,mode,timeStr){
    const key=this.key(); if(!key) throw new Error('キーが未設定です');
    await this._load(key);
    const d=new Date(); const parts=(timeStr||'').split(':'); d.setHours(+parts[0]||0,+parts[1]||0,0,0);
    if(mode!=='arr'&&d<new Date()) d.setTime(Date.now());
    const svc=new google.maps.DirectionsService();
    const req={origin:from+'駅',destination:to+'駅',travelMode:google.maps.TravelMode.TRANSIT,transitOptions:{modes:[google.maps.TransitMode.RAIL]}};
    req.transitOptions[mode==='arr'?'arrivalTime':'departureTime']=d;
    try{ return await svc.route(req); }
    catch(e){ const st=String(e&&e.message?e.message:e);
      const msg={REQUEST_DENIED:'キーが無効か、Maps JavaScript API / Directions API が有効になっていません',OVER_QUERY_LIMIT:'利用上限に達しました',ZERO_RESULTS:'Googleマップでルートが見つかりませんでした',INVALID_REQUEST:'検索条件が正しくありません',NOT_FOUND:'駅が見つかりませんでした'}[st]||('Googleマップ検索エラー: '+st);
      throw new Error(msg); }
  },
  html(result){
    const leg=result.routes[0].legs[0];
    const transitSteps=leg.steps.filter(s=>s.travel_mode==='TRANSIT');
    let h='<div class="kv"><span><b>'+esc(leg.departure_time.text)+'発 → '+esc(leg.arrival_time.text)+'着</b></span><span class="muted">'+esc(leg.duration.text)+' / 乗換'+Math.max(0,transitSteps.length-1)+'回</span></div>';
    leg.steps.forEach(st=>{
      if(st.travel_mode==='TRANSIT'){ const t=st.transit;
        h+='<div class="kv"><span>'+esc((t.line&&(t.line.short_name||t.line.name))||'')+' '+esc(t.headsign||'')+'行き<br><span class="muted">'+esc(t.departure_stop.name)+' → '+esc(t.arrival_stop.name)+'（'+t.num_stops+'駅）</span></span><span class="muted">'+esc(t.departure_time.text)+'発<br>'+esc(t.arrival_time.text)+'着</span></div>';
      } else if(st.travel_mode==='WALKING'&&st.duration.value>=60){ h+='<div class="kv"><span class="muted">徒歩</span><span class="muted">'+esc(st.duration.text)+'</span></div>'; }
    });
    return h+'<p class="muted" style="font-size:12px">Googleマップの検索結果です（ネット接続が必要・この結果は保存されません）</p>';
  }
};
