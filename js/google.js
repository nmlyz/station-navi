// Googleマップ Directions API による1回検索（結果は端末に保存しない・表示のみ）
const GoogleDir={
  key(){ return (Settings.load().gkey||'').trim(); },
  async search(from,to,mode,timeStr){
    const key=this.key(); if(!key) throw new Error('キー未設定');
    const d=new Date(); const parts=(timeStr||'').split(':'); d.setHours(+parts[0]||0,+parts[1]||0,0,0);
    if(mode!=='arr'&&d<new Date()) d.setTime(Date.now());
    const params=new URLSearchParams({origin:from+'駅',destination:to+'駅',mode:'transit',language:'ja',region:'jp',transit_mode:'rail',key});
    params.set(mode==='arr'?'arrival_time':'departure_time',String(Math.floor(d.getTime()/1000)));
    const res=await fetch('https://maps.googleapis.com/maps/api/directions/json?'+params.toString());
    return res.json();
  },
  html(j){
    if(j.status==='ZERO_RESULTS') return '<p class="muted">Googleマップでルートが見つかりませんでした。</p>';
    if(j.status!=='OK'){ const msg={REQUEST_DENIED:'キーが無効か、Directions APIが有効になっていません',OVER_QUERY_LIMIT:'利用上限に達しました',INVALID_REQUEST:'検索条件が正しくありません'}[j.status]||('Googleマップ検索エラー: '+j.status); return '<p class="muted">'+esc(msg)+(j.error_message?'（'+esc(j.error_message)+'）':'')+'</p>'; }
    const leg=j.routes[0].legs[0];
    let h='<div class="kv"><span><b>'+esc(leg.departure_time.text)+'発 → '+esc(leg.arrival_time.text)+'着</b></span><span class="muted">'+esc(leg.duration.text)+' / 乗換'+(j.routes[0].legs.length-1>=0?(leg.steps.filter(s=>s.travel_mode==='TRANSIT').length-1):0)+'回</span></div>';
    leg.steps.forEach(st=>{
      if(st.travel_mode==='TRANSIT'){ const t=st.transit_details;
        h+='<div class="kv"><span>'+esc(t.line.short_name||t.line.name||'')+' '+esc(t.headsign||'')+'行き<br><span class="muted">'+esc(t.departure_stop.name)+' → '+esc(t.arrival_stop.name)+'（'+t.num_stops+'駅）</span></span><span class="muted">'+esc(t.departure_time.text)+'発<br>'+esc(t.arrival_time.text)+'着</span></div>';
      } else if(st.travel_mode==='WALKING'&&st.duration.value>=60){ h+='<div class="kv"><span class="muted">徒歩</span><span class="muted">'+esc(st.duration.text)+'</span></div>'; }
    });
    return h+'<p class="muted" style="font-size:12px">Googleマップの検索結果です（ネット接続が必要・この結果は保存されません）</p>';
  }
};
