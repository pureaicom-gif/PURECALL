export function installAccountProfile(app,{db,auth}){
 app.post('/api/account/profile',auth,(req,res)=>{
 const {name,handle}=req.body;if(typeof name!=='string'||!name.trim()||name.length>40)return res.status(400).json({error:'ชื่อ 1–40 ตัวอักษร'});
 const normalized=typeof handle==='string'?handle.toLowerCase():req.user.handle;
 if(normalized!==req.user.handle&&req.user.role!=='admin')return res.status(403).json({error:'เปลี่ยน PURE ID ได้เฉพาะบัญชีแอดมิน'});
 if(!/^[a-z0-9_]{3,24}$/.test(normalized))return res.status(400).json({error:'PURE ID ใช้ a-z 0-9 _ จำนวน 3–24 ตัว'});
 try{db.prepare('UPDATE users SET name=?,handle=? WHERE id=?').run(name.trim(),normalized,req.user.id);}catch{return res.status(409).json({error:'PURE ID นี้ถูกใช้แล้ว'});}
 res.json({user:{id:req.user.id,name:name.trim(),handle:normalized,role:req.user.role,isAdmin:req.user.role==='admin'}});
 });
}
