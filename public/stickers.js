export const STICKER_PACKS = [{id:'pure-anime-vol-01',name:'PURE Anime Friends',version:1,cols:4,rows:3,url:'/stickers/pure-pack-01.png',items:[
  ['hello','ทักทาย','Hello'],['love','รักเลย','Love'],['thanks','ขอบคุณ','Thank you'],['yes','เยี่ยมเลย','Great!'],
  ['laugh','ขำมาก','LOL'],['sleep','ง่วงแล้ว','Sleepy'],['cheer','สู้ ๆ นะ','You got this'],['sorry','ขอโทษนะ','Sorry'],
  ['wow','ว้าว','Wow'],['wait','รอแป๊บ','Wait a sec'],['wink','แอบยิ้ม','Wink'],['welcome','ยินดีต้อนรับ','Welcome']
].map(([id,th,en],index)=>({id,label:th,labelEn:en,caption:th+' · '+en,index,pack:'pure-anime-vol-01'}))}];
export const STICKERS=STICKER_PACKS.flatMap(pack=>pack.items.map(item=>({...item,url:pack.url,cols:pack.cols,rows:pack.rows})));

const uid=()=>crypto.randomUUID?.()||Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
async function rasterize(sticker){
  const image=new Image();image.src=sticker.url;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
  const w=image.naturalWidth/sticker.cols,h=image.naturalHeight/sticker.rows,x=sticker.index%sticker.cols*w,y=Math.floor(sticker.index/sticker.cols)*h;
  canvas.getContext('2d').drawImage(image,x,y,w,h,0,0,512,512);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!blob)throw new Error('สร้างสติ๊กเกอร์ไม่สำเร็จ ลองอีกครั้ง');
  return new File([blob],'PURE-'+sticker.id+'.png',{type:'image/png'});
}

export function setupStickers({api,state,toast,onSent=()=>{}}){
  const composer=document.querySelector('#composer');if(!composer||document.querySelector('#sticker-open'))return;
  const trigger=document.createElement('button');trigger.id='sticker-open';trigger.type='button';trigger.className='icon-button';trigger.setAttribute('aria-label','สติ๊กเกอร์ PURE');trigger.title='สติ๊กเกอร์ PURE';
  trigger.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M5 3h14a2 2 0 0 1 2 2v9l-7 7H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 21v-5a2 2 0 0 1 2-2h5M8 9h.01M15 9h.01M8 12c2 3 5 3 7 0"/></svg>';
  composer.querySelector('#message-input').before(trigger);
  const dialog=document.createElement('dialog');dialog.id='sticker-dialog';dialog.className='pure-stickers';dialog.setAttribute('aria-labelledby','sticker-title');
  dialog.innerHTML='<header><div><span class="sticker-eyebrow">PURE ORIGINALS / VOL. 01</span><h2 id="sticker-title">PURE Anime Friends</h2><p>เพื่อนอนิเมะสาวและหนุ่ม 12 อารมณ์ · Thai & English</p></div><button type="button" class="icon-button sticker-close" aria-label="ปิดสติ๊กเกอร์">×</button></header><div class="sticker-grid"></div><footer><p class="sticker-status" role="status" aria-live="polite">เลือกสติกเกอร์เพื่อดูตัวอย่างก่อนส่ง</p><button type="button" class="primary sticker-send" disabled>ส่งสติกเกอร์</button></footer>';
  const future=document.createElement('button');future.type='button';future.className='sticker-create-future';future.disabled=true;future.title='เปิดให้ใช้ในอัปเดตถัดไป';future.textContent='สร้างสติกเกอร์ของฉัน · เร็ว ๆ นี้';dialog.querySelector('footer').prepend(future);
  document.body.append(dialog);
  const grid=dialog.querySelector('.sticker-grid'),status=dialog.querySelector('.sticker-status'),send=dialog.querySelector('.sticker-send');
  let target=null,selected=null,pending=null,busy=false;
  for(const sticker of STICKERS){
    const button=document.createElement('button');button.type='button';button.className='sticker-tile';button.dataset.sticker=sticker.id;button.setAttribute('aria-label',sticker.label);button.setAttribute('aria-pressed','false');
    const art=document.createElement('div');art.className='sticker-art';art.setAttribute('aria-hidden','true');
    const img=document.createElement('img');img.src=sticker.url;img.alt='';img.width=160;img.height=120;img.style.width=(sticker.cols*100)+'%';img.style.height=(sticker.rows*100)+'%';img.style.left=(-(sticker.index%sticker.cols)*100)+'%';img.style.top=(-Math.floor(sticker.index/sticker.cols)*100)+'%';art.append(img);
    const label=document.createElement('span');label.innerHTML='<strong></strong><small></small>';label.querySelector('strong').textContent=sticker.label;label.querySelector('small').textContent=sticker.labelEn;button.append(art,label);grid.append(button);
    button.onclick=()=>{if(busy)return;selected=sticker;pending=null;for(const b of grid.children)b.setAttribute('aria-pressed',String(b===button));status.textContent=sticker.label+' / '+sticker.labelEn+' · ส่งถึง '+target.name;send.disabled=false;send.textContent='ส่งสติกเกอร์';};
  }
  trigger.onclick=()=>{
    if(!state.user||(!state.peer&&!state.group))return toast('เลือกเพื่อนหรือกลุ่มก่อนส่งสติ๊กเกอร์');
    const next={id:state.group?.id||state.peer.id,group:!!state.group,user:state.user.id,name:state.group?.name||state.peer.name||'เพื่อน'};
    if(!target||target.id!==next.id||target.group!==next.group||target.user!==next.user){pending=null;selected=null;send.disabled=true;for(const b of grid.children)b.setAttribute('aria-pressed','false');}
    target=next;status.textContent=selected?selected.label+' · ส่งถึง '+target.name:'เลือกสติ๊กเกอร์ · ส่งถึง '+target.name;dialog.showModal();
  };
  dialog.querySelector('.sticker-close').onclick=()=>dialog.close();
  send.onclick=async()=>{
    if(busy||!selected||!target)return;
    if(state.user?.id!==target.user){dialog.close();pending=null;return toast('บัญชีเปลี่ยนแล้ว กรุณาเปิดสติ๊กเกอร์อีกครั้ง');}
    if(!pending)pending={clientId:uid(),fileId:null,sticker:selected,target:{...target}};
    const job=pending;busy=true;send.disabled=true;status.textContent='กำลังส่งถึง '+job.target.name+'…';
    try{
      if(!job.fileId){const form=new FormData();form.append('file',await rasterize(job.sticker));const route=job.target.group?'/groups/'+encodeURIComponent(job.target.id)+'/files':'/files/'+encodeURIComponent(job.target.id);const data=await api(route,form);job.fileId=data.file.id;}
      if(state.user?.id!==job.target.user)throw new Error('บัญชีเปลี่ยนระหว่างส่ง กรุณาเข้าสู่บัญชีเดิม');
      const route=job.target.group?'/groups/'+encodeURIComponent(job.target.id)+'/messages':'/messages/'+encodeURIComponent(job.target.id);
      const result=await api(route,{fileId:job.fileId,clientId:job.clientId});onSent(result.message);pending=null;selected=null;for(const b of grid.children)b.setAttribute('aria-pressed','false');dialog.close();toast('ส่งสติ๊กเกอร์แล้ว');
    }catch(error){status.textContent=error.message||'ส่งไม่สำเร็จ';send.textContent='ลองส่งอีกครั้ง';}
    finally{busy=false;send.disabled=!selected;}
  };
  return {close:()=>dialog.close()};
}
