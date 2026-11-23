const Updater={
  async checkAndUpdate(onProgress){
    const settings=Settings.load();
    if(settings.wifiOnly && navigator.connection && navigator.connection.type && navigator.connection.type!=='wifi' && navigator.connection.type!=='ethernet'){
      return {status:'skipped',reason:'Wi-Fiのみ更新がONで、現在はWi-Fi接続ではないため見送りました'}; }
    let manifest;
    try{ const r=await fetch('data/manifest.json?ts='+Date.now()); if(!r.ok) throw new Error('HTTP '+r.status); manifest=await r.json(); }
    catch(e){ return {status:'failed',reason:'更新データを取得できませんでした。前のデータを維持します'}; }
    const installed=await DB.allPacks(); let updated=0;
    for(const pack of installed){
      const info=(manifest.packs||[]).find(p=>p.id===pack.id); if(!info) continue;
      if(info.version===pack.version && manifest.version===await DB.getMeta('manifestVersion')) continue;
      try{
        const r=await fetch('data/'+info.file+'?ts='+Date.now()); if(!r.ok) throw new Error('bad');
        const total=+r.headers.get('Content-Length')||0; let buf='';
        if(r.body&&total&&onProgress){ const reader=r.body.getReader(); let got=0; const dec=new TextDecoder();
          while(true){ const {done,value}=await reader.read(); if(done)break; got+=value.length; buf+=dec.decode(value,{stream:true}); onProgress(info.id,Math.round(got/total*100)); } buf+=dec.decode();
        } else buf=await r.text();
        const data=JSON.parse(buf);
        if(!data.lines||!data.lines.length||data.lines.some(l=>!l.stations||l.stations.length<2)) throw new Error('検証失敗');
        data._size=buf.length; data._updatedAt=new Date().toISOString();
        await DB.putPack(data); updated++;
      }catch(e){ return {status:'failed',reason:'更新の検証に失敗したため、前のデータを維持します'}; }
    }
    await DB.setMeta('manifestVersion',manifest.version); await DB.setMeta('lastUpdateCheck',new Date().toISOString());
    return {status:'ok',updated};
  }
};
