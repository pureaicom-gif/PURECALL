import multer from 'multer';
import {rateLimit} from 'express-rate-limit';
export function installPhotoAI(app,{auth,gemini}){
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:1,fields:1},fileFilter:(_,f,cb)=>{if(!['image/jpeg','image/png','image/webp'].includes(f.mimetype))return cb(Object.assign(new Error('รองรับ JPEG, PNG และ WebP'),{status:415}));cb(null,true);}}).single('image');
 const busy=new Set();
 app.post('/api/ai/photo',auth,rateLimit({windowMs:60000,limit:4,keyGenerator:req=>req.user.id,message:{error:'ลองใหม่ในหนึ่งนาที'}}),upload,async(req,res)=>{
 if(!req.file)return res.status(400).json({error:'เลือกรูปก่อนใช้งาน'});if(busy.has(req.user.id))return res.status(409).json({error:'Gemini กำลังปรับภาพก่อนหน้า'});
 const operation=req.body.operation||'enhance';if(!['enhance','caption'].includes(operation))return res.status(400).json({error:'เลือกปรับภาพหรือแคปชัน'});
 busy.add(req.user.id);try{const image={mime:req.file.mimetype,data:req.file.buffer.toString('base64')};
 if(operation==='caption'){const result=await gemini.generate('ช่วยเสนอแคปชันภาษาไทยสำหรับภาพนี้ 3 แบบ สั้น เป็นกันเอง ไม่เดาชื่อบุคคลหรือข้อมูลส่วนตัว',{image});return res.json({text:result.text});}
 const result=await gemini.generateImage('ปรับภาพนี้ให้ดูสะอาดสวยงามเป็นธรรมชาติ โดยรักษาบุคคลและเนื้อหาต้นฉบับ',{style:'enhance',image});res.json({image:{mime:result.mime,data:result.buffer.toString('base64')}});
 }catch{res.status(502).json({error:'Gemini ปรับภาพไม่ได้ในขณะนี้ ตรวจสิทธิ์โมเดลภาพหรือใช้ตัวปรับแสงในเครื่องแทน'});}finally{busy.delete(req.user.id);}
 });
}
