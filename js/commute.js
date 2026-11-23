const Commute={
  list(){ try{return JSON.parse(localStorage.getItem('sn-commutes')||'[]');}catch(e){return[];} },
  saveAll(a){ localStorage.setItem('sn-commutes',JSON.stringify(a)); },
  add(c){ const a=Commute.list(); c.id=Date.now(); a.push(c); Commute.saveAll(a); return a; },
  remove(id){ Commute.saveAll(Commute.list().filter(c=>c.id!==id)); }
};
