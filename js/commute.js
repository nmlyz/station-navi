const Commute={
  list(){ try{return JSON.parse(localStorage.getItem('sn-commutes')||'[]');}catch(e){return[];} },
  saveAll(a){ localStorage.setItem('sn-commutes',JSON.stringify(a)); },
  add(c){ const a=Commute.list(); c.id=Date.now(); a.push(c); Commute.saveAll(a); return a; },
  remove(id){ Commute.saveAll(Commute.list().filter(c=>c.id!==id)); }
};

const CommuteMode={
  enabled(){ return localStorage.getItem('sn-commute-mode')==='on'; },
  setEnabled(on){ localStorage.setItem('sn-commute-mode',on?'on':'off'); if(on){ this.start(); } else { this.stop(); this.hide(); } },
  timer:null, shownFor:null, snoozed:false,
  plan(){ const list=Commute.list(); if(!list.length) return null; const p=list[0];
    const h=new Date().getHours();
    return h<14?{from:p.from,to:p.to,when:'行き'}:{from:p.to,to:p.from,when:'帰り'}; },
  distKm(aLat,aLon,bLat,bLon){ const R=6371,rad=d=>d*Math.PI/180;
    const dLat=rad(bLat-aLat),dLon=rad(bLon-aLon);
    const a=Math.sin(dLat/2)**2+Math.cos(rad(aLat))*Math.cos(rad(bLat))*Math.sin(dLon/2)**2;
    return 2*R*Math.asin(Math.sqrt(a)); },
  start(){ if(this.timer) return; this.tick(); this.timer=setInterval(()=>this.tick(),60000); },
  stop(){ if(this.timer){ clearInterval(this.timer); this.timer=null; } },
  async tick(){ if(!this.enabled()||typeof GRAPH==='undefined'||!GRAPH||document.visibilityState==='hidden') return;
    const plan=this.plan(); if(!plan) return;
    const st=GRAPH.stations.get(plan.from); if(!st||st.lat==null||st.lon==null) return;
    let pos; try{ pos=await getPosition(); }catch(e){ return; }
    const d=this.distKm(pos.coords.latitude,pos.coords.longitude,st.lat,st.lon);
    if(d<=0.45){ if(this.shownFor!==plan.from){ this.shownFor=plan.from; this.snoozed=false; if(navigator.vibrate) navigator.vibrate([120,60,120]); }
      if(!this.snoozed) this.show(plan,d); }
    else if(d>0.7){ this.shownFor=null; this.snoozed=false; this.hide(); } },
  show(plan,d){ const box=document.getElementById('commuteAlert'); if(!box) return;
    const r=findRoutes(GRAPH,plan.from,plan.to,8); if(!r) return;
    const s=r.segments.find(x=>!x.lineId.startsWith('walk-'))||r.segments[0];
    const board=s.stations[0], alight=s.stations[s.stations.length-1];
    const dir=directionOf(s.line,board,alight); const types=usableTypes(s.line,board,alight);
    box.innerHTML='<div style="display:flex;justify-content:space-between;align-items:flex-start"><b>🚃 通勤モード（'+plan.when+'）</b><button id="caClose" class="sub" style="width:auto;padding:4px 12px">✕ 閉じる</button></div>'
      +'<div style="font-size:15px;margin-top:4px">'+esc(plan.from)+'駅の近くです（約'+Math.round(d*1000)+'m）→ '+esc(plan.to)+'方面</div>'
      +'<span class="linechip" style="background:'+s.line.color+';margin-top:8px">'+esc(s.line.name)+'</span>'
      +'<div style="font-size:23px;font-weight:800;line-height:1.45;margin-top:6px">'+esc(types[0]||'')+' '+esc(dir.terminal)+'行き<br>に乗ってください</div>'
      +'<div style="font-size:14px;margin-top:4px">'+esc(plan.from)+' → '+esc(plan.to)+'（約'+r.minutes+'分・乗換'+r.transfers+'回）</div>'
      +'<div style="font-size:12px;opacity:.8;margin-top:2px">この表示は駅から離れるまで出続けます</div>';
    box.classList.remove('hidden');
    box.querySelector('#caClose').onclick=()=>{ this.snoozed=true; this.hide(); }; },
  hide(){ const box=document.getElementById('commuteAlert'); if(box) box.classList.add('hidden'); }
};
