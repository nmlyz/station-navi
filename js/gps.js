function getPosition(){return new Promise((res,rej)=>{ if(!navigator.geolocation) return rej(new Error('この端末は位置情報に対応していません'));
  navigator.geolocation.getCurrentPosition(res,rej,{enableHighAccuracy:true,timeout:10000}); });}
function nearestStations(graph,lat,lon,limit=6){
  const R=6371, rad=d=>d*Math.PI/180; const out=[];
  graph.stations.forEach(st=>{ if(st.lat==null)return; const dLat=rad(st.lat-lat),dLon=rad(st.lon-lon);
    const a=Math.sin(dLat/2)**2+Math.cos(rad(lat))*Math.cos(rad(st.lat))*Math.sin(dLon/2)**2;
    out.push({name:st.name,km:Math.round(2*R*Math.asin(Math.sqrt(a))*10)/10}); });
  return out.sort((a,b)=>a.km-b.km).slice(0,limit);
}
