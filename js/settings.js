const Settings={
  load(){ try{return Object.assign({autoUpdate:true,wifiOnly:false,dark:'auto',mobileUpdate:true},JSON.parse(localStorage.getItem('sn-settings')||'{}'));}catch(e){return{autoUpdate:true,wifiOnly:false,dark:'auto'};} },
  save(s){ localStorage.setItem('sn-settings',JSON.stringify(s)); },
  setup(){ try{return JSON.parse(localStorage.getItem('sn-setup')||'null');}catch(e){return null;} },
  saveSetup(s){ localStorage.setItem('sn-setup',JSON.stringify(s)); },
  clearAll(){ localStorage.removeItem('sn-setup'); localStorage.removeItem('sn-settings'); localStorage.removeItem('sn-favs'); localStorage.removeItem('sn-history'); localStorage.removeItem('sn-commutes'); }
};
