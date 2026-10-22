// Durable per-account text queue. A retry always keeps the original clientId.
export function createOutbox({storage=localStorage,send,changed=()=>{},online=()=>navigator.onLine,id=()=>crypto.randomUUID()}){
 let owner=null,items=[],running=false,epoch=0,timer;
 const key=()=>`pure.outbox.${owner}`;
 const save=()=>{storage.setItem(key(),JSON.stringify(items));changed(items.map(x=>({...x})));};
 const schedule=()=>{clearTimeout(timer);if(owner&&items.some(x=>!x.error))timer=setTimeout(()=>flush(),5000);};
 async function flush(){if(running||!owner||!online())return;schedule();running=true;const current=epoch;
  try{for(const item of [...items]){if(current!==epoch||!online())break;if(item.error)continue;try{await send(item);if(current!==epoch)break;items=items.filter(x=>x.clientId!==item.clientId);save();}catch(e){if(current!==epoch)break;if(e.status>=400&&e.status<500&&![408,429].includes(e.status)){item.error=e.status===401?'เข้าสู่ระบบอีกครั้งเพื่อส่ง':e.message||'ส่งไม่ได้';save();}else break;}}}
  finally{running=false;if(current===epoch)schedule();else if(owner)queueMicrotask(flush);}
 }
 return {
  login(user){epoch++;clearTimeout(timer);owner=user;items=[];try{const stored=JSON.parse(storage.getItem(key())||'[]');items=Array.isArray(stored)?stored.filter(x=>typeof x.clientId==='string'&&typeof x.target==='string'&&typeof x.text==='string'&&x.text.length<=5000).slice(0,100):[];}catch{}changed(items);},
  enqueue({target,group=false,text}){if(!owner)throw Error('เข้าสู่ระบบก่อนส่ง');if(items.length>=100)throw Error('มีข้อความรอส่งครบ 100 ข้อความ กรุณาส่งหรือลบก่อน');const item={clientId:id(),target,group:!!group,text,created:Date.now()};items.push(item);try{save();}catch{items.pop();throw Error('บันทึกข้อความรอส่งไม่ได้ พื้นที่ในเครื่องอาจเต็ม');}void flush();return item;},
  retry(clientId){const item=items.find(x=>x.clientId===clientId);if(item){delete item.error;save();void flush();}},
  remove(clientId){items=items.filter(x=>x.clientId!==clientId);save();},
  logout(){epoch++;clearTimeout(timer);owner=null;items=[];changed(items);},
  list:()=>items.map(x=>({...x})),flush
 };
}
