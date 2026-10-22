export function installNearby(app,{db,auth,blocked,pub}) {
 const run=(sql,...p)=>db.prepare(sql).run(...p),one=(sql,...p)=>db.prepare(sql).get(...p);
 const prune=()=>run('DELETE FROM nearby_locations WHERE expires<=?',Date.now());
 const distance=(a,b)=>{const r=Math.PI/180,dlat=(b.lat-a.lat)*r,dlon=(b.lon-a.lon)*r,h=Math.sin(dlat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dlon/2)**2;return 6371*2*Math.asin(Math.min(1,Math.sqrt(h)));};
 app.post('/api/nearby',auth,(req,res)=>{
  const {lat,lon,consent}=req.body;
  if(consent!==true||typeof lat!=='number'||typeof lon!=='number'||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return res.status(400).json({error:'ต้องยินยอมและส่งพิกัดที่ถูกต้อง'});
  prune();const expires=Date.now()+3600000;
  run('INSERT INTO nearby_locations VALUES(?,?,?,?) ON CONFLICT(owner) DO UPDATE SET lat=excluded.lat,lon=excluded.lon,expires=excluded.expires',req.user.id,Math.round(lat*100)/100,Math.round(lon*100)/100,expires);
  res.json({enabled:true,expires});
 });
 app.delete('/api/nearby',auth,(req,res)=>{run('DELETE FROM nearby_locations WHERE owner=?',req.user.id);res.json({enabled:false});});
 app.get('/api/nearby',auth,(req,res)=>{
  prune();const me=one('SELECT * FROM nearby_locations WHERE owner=?',req.user.id);if(!me)return res.json({enabled:false,users:[]});
  const users=db.prepare('SELECT u.id,u.name,u.handle,n.lat,n.lon FROM nearby_locations n JOIN users u ON u.id=n.owner WHERE n.owner!=? AND n.expires>? AND n.lat BETWEEN ? AND ?').all(req.user.id,Date.now(),me.lat-.5,me.lat+.5)
   .filter(u=>!blocked(req.user.id,u.id)).map(u=>({u,d:distance(me,u)})).filter(x=>x.d<=50).sort((a,b)=>a.d-b.d).slice(0,30)
   .map(({u,d})=>({...pub(u),distance:d<1?'น้อยกว่า 1 กม.':d<5?'1–5 กม.':d<10?'5–10 กม.':d<25?'10–25 กม.':'25–50 กม.'}));
  res.json({enabled:true,expires:me.expires,users});
 });
 const timer=setInterval(prune,60000);timer.unref();
 return ()=>clearInterval(timer);
}
