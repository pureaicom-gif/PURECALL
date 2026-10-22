import { rateLimit } from 'express-rate-limit';
import { plainText } from '../public/plain-text.js';
import { createJevRunner } from './jev-run.js';
import { needsChoice } from './jev.js';
const SYSTEM='You are PURE AI, a friendly assistant inside the PURE social app, chatting with one user. Continue the conversation naturally and use the earlier messages as context; never restart or repeat yourself. Reply in Thai unless the user requests another language. Write plain text only: never use markdown symbols such as #, *, **, ---, tables or code fences. Use short paragraphs; for lists use 1. 2. 3. on separate lines. Keep replies concise (about 120 words) unless the user asks for more, offer at most 3 options, and when helpful end with one short follow-up question. You only see this assistant conversation. You cannot access friend chats, pet chats, location, files or change app settings. Do not claim actions you cannot perform.';
export function installAssistant(app,{db,auth,gemini,fetcher,hermes}) {
 const runner=createJevRunner({gemini,fetcher,hermes});
 const busy=new Set(),history=owner=>db.prepare('SELECT id,role,text,created FROM assistant_chats WHERE owner=? ORDER BY id DESC LIMIT 20').all(owner).reverse();
 app.get('/api/assistant',auth,async(req,res)=>{let models=[];try{models=await runner.catalog();}catch{}res.json({history:history(req.user.id),ready:gemini.status().configured&&!!gemini.status().model,local:models.length});});
 app.delete('/api/assistant',auth,(req,res)=>{if(busy.has(req.user.id))return res.status(409).json({error:'รอคำตอบก่อนลบประวัติ'});db.prepare('DELETE FROM assistant_chats WHERE owner=?').run(req.user.id);res.json({ok:true});});
 app.post('/api/assistant',auth,rateLimit({windowMs:60000,limit:8,keyGenerator:req=>req.user.id}),async(req,res)=>{
  const {prompt}=req.body,owner=req.user.id;
  if(typeof prompt!=='string'||!prompt.trim()||prompt.length>8000)return res.status(400).json({error:'พิมพ์ข้อความ 1–8,000 ตัวอักษร'});
  const engine='jev',allowCloud=!(req.body.allowCloud===false||req.body.allowCloud==='false');
  if(engine==='jev'&&needsChoice(prompt))return res.json({clarify:true,options:[{title:'ค้นข้อมูลจากอินเทอร์เน็ต',starter:'ค้นเว็บเกี่ยวกับ '},{title:'ช่วยเขียนหรือวางแผน',starter:'ช่วยวางแผน '},{title:'คุยและอธิบายเรื่องที่สงสัย',starter:'ช่วยอธิบาย '}],history:history(owner)});
  if(busy.has(owner))return res.status(409).json({error:'ผู้ช่วยกำลังตอบอยู่'});busy.add(owner);
  try{
   const past=history(owner).slice(-12).map(m=>({...m,text:plainText(m.text)}));
   const out=await runner.run({prompt:prompt.trim(),history:past,engine,allowCloud,system:SYSTEM});const answer={text:plainText(out.text)||out.text,route:out.route};
   db.exec('BEGIN IMMEDIATE');try{const insert=db.prepare('INSERT INTO assistant_chats(owner,role,text,created) VALUES(?,?,?,?)');insert.run(owner,'user',prompt.trim(),Date.now());insert.run(owner,'model',answer.text,Date.now());db.prepare('DELETE FROM assistant_chats WHERE owner=? AND id NOT IN(SELECT id FROM assistant_chats WHERE owner=? ORDER BY id DESC LIMIT 20)').run(owner,owner);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
   res.json({...answer,history:history(owner)});
  }finally{busy.delete(owner);}
 });
}
