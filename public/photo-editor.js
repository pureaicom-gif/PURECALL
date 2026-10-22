const presets = {natural:[100,100,100],soft:[106,92,92],mono:[100,108,0],crisp:[102,118,112]};
let active = false;
const icon = path => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">${path}</svg>`;
const rotateIcon = icon('<path d="M4 9a8 8 0 1 1 1 9M4 3v6h6"/>');
const closeIcon = icon('<path d="m6 6 12 12M18 6 6 18"/>');

/** Returns the confirmed local edit, or null when dismissed. Never uploads a photo. */
export async function editPhoto(file, {enhance}={}) {
  if (active) throw new Error('กรุณาปิดหน้าปรับรูปเดิมก่อน');
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('ปรับรูปได้เฉพาะ JPG, PNG และ WebP');
  if (file.size > 25 * 1024 * 1024) throw new Error('รูปต้องมีขนาดไม่เกิน 25 MB');
  active = true;
  let bitmap;
  try { bitmap = await createImageBitmap(file, {imageOrientation:'from-image'}); }
  catch { active = false; throw new Error('เปิดรูปนี้ไม่ได้ กรุณาเลือกรูป JPG, PNG หรือ WebP ใหม่'); }
  if (!bitmap.width || !bitmap.height) { bitmap.close(); active = false; throw new Error('รูปภาพไม่มีขนาดที่ใช้งานได้'); }
  const originalBitmap=bitmap;const previousFocus = document.activeElement;
  const dialog = document.createElement('dialog'); dialog.className = 'pure-photo-editor';
  dialog.setAttribute('aria-labelledby','pure-photo-title');
  dialog.innerHTML = `<header><div><span class="photo-eyebrow">PURE / PHOTO STUDIO</span><h2 id="pure-photo-title">แต่งรูปก่อนส่ง</h2></div><button type="button" data-close aria-label="ยกเลิกแต่งรูป">${closeIcon}</button></header>
    <div class="photo-preview"><div class="photo-canvas-wrap"><canvas aria-label="ภาพตัวอย่างหลังปรับแต่ง"></canvas><div class="crop-frame" role="slider" aria-label="ลากเพื่อเลื่อนกรอบครอป" tabindex="0"><span class="crop-resize" aria-label="ลากเพื่อปรับขนาด"></span></div></div><span class="photo-preview-label">ลากกรอบเพื่อเลือกส่วนภาพ</span></div>
    <div class="photo-toolbar"><button type="button" data-before aria-pressed="false">ดูต้นฉบับ</button><button type="button" data-rotate>${rotateIcon}หมุนรูป</button><button type="button" data-reset>เริ่มใหม่</button></div>
    <div class="photo-crop-tools" role="group" aria-label="ครอปภาพ"><span>สัดส่วนครอป</span>${[['original','เต็มภาพ'],['square','1:1'],['portrait','4:5'],['landscape','16:9']].map(([id,label])=>`<button type="button" data-crop="${id}" aria-pressed="${id==='original'}">${label}</button>`).join('')}<label>กำหนดเอง <input type="number" data-ratio-w min="1" max="100" value="3" aria-label="ตัวตั้งสัดส่วนครอป"></label><span>:</span><input type="number" data-ratio-h min="1" max="100" value="2" aria-label="ตัวหารสัดส่วนครอป"><button type="button" data-custom-crop>ใช้สัดส่วน</button></div>
    <div class="photo-output-size"><span>ขนาดไฟล์ที่ส่ง (พิกเซล)</span><label>กว้าง <input type="number" data-output-w min="1" max="4096" value="1"></label><span>×</span><label>สูง <input type="number" data-output-h min="1" max="4096" value="1"></label><button type="button" data-use-crop-size>ใช้ขนาดครอป</button></div>
    <div class="photo-settings"><div class="photo-presets" role="group" aria-label="โทนรูป">${[['natural','ธรรมชาติ'],['soft','ละมุน'],['mono','ขาวดำ'],['crisp','คมชัด']].map(([id,label])=>`<button type="button" data-preset="${id}" aria-pressed="${id==='natural'}">${label}</button>`).join('')}</div>
    ${[['brightness','ความสว่าง',50,150],['contrast','คอนทราสต์',50,150],['saturation','สี',0,180]].map(([id,label,min,max])=>`<label class="photo-slider">${label}<output data-value="${id}">100%</output><input aria-label="${label}" data-adjust="${id}" type="range" min="${min}" max="${max}" value="100"></label>`).join('')}
    ${enhance?'<button type="button" data-enhance>ให้ AI ปรับภาพ</button><p class="photo-help">ส่งภาพเพื่อปรับแต่งเมื่อกดปุ่มนี้ แล้วตรวจภาพก่อนส่งอีกครั้ง</p>':''}<p class="photo-help">ปรับแต่งบนเครื่องของคุณด้วยฟิลเตอร์ ไม่ใช่การสร้างภาพด้วย AI · ต้นฉบับไม่ถูกแก้ไข</p></div>
    <p class="photo-error" role="alert"></p><footer><button type="button" data-close>ยกเลิก</button><button type="button" class="photo-confirm" data-save>ใช้รูปนี้</button></footer>`;
  const canvas = dialog.querySelector('canvas'), ctx = canvas.getContext('2d');
  const scale = Math.min(1,2048 / Math.max(bitmap.width,bitmap.height));
  let width = Math.max(1,Math.round(bitmap.width*scale)), height = Math.max(1,Math.round(bitmap.height*scale));
  let rotation=0,before=false,brightness=100,contrast=100,saturation=100,busy=false,finished=false,cropRect=null;
  const frame=dialog.querySelector('.crop-frame'),outputW=dialog.querySelector('[data-output-w]'),outputH=dialog.querySelector('[data-output-h]');
  function fullSize(){return {w:rotation%2?height:width,h:rotation%2?width:height};}
  function crop(){const s=fullSize();return cropRect||{x:0,y:0,w:s.w,h:s.h};}
  function syncCrop(updateOutput=false){const r=crop(),s=fullSize();frame.style.left=(r.x/s.w*100)+'%';frame.style.top=(r.y/s.h*100)+'%';frame.style.width=(r.w/s.w*100)+'%';frame.style.height=(r.h/s.h*100)+'%';if(updateOutput){outputW.value=Math.max(1,Math.round(r.w));outputH.value=Math.max(1,Math.round(r.h));}}
  function setRatio(ratio){const {w:fw,h:fh}=fullSize();let w,h;if(fw/fh>ratio){h=fh;w=h*ratio;}else{w=fw;h=w/ratio;}cropRect={x:(fw-w)/2,y:(fh-h)/2,w,h};before=false;dialog.querySelectorAll('[data-crop]').forEach(b=>b.setAttribute('aria-pressed','false'));syncCrop(true);render();}
  function outputCanvas(){const area=crop(),out=document.createElement('canvas'),ow=Math.max(1,Math.min(4096,Number(outputW.value)||Math.round(area.w))),oh=Math.max(1,Math.min(4096,Number(outputH.value)||Math.round(area.h)));out.width=ow;out.height=oh;out.getContext('2d').drawImage(canvas,area.x,area.y,area.w,area.h,0,0,ow,oh);return out;}
  function render() {
    const fullWidth=rotation%2?height:width,fullHeight=rotation%2?width:height,source=document.createElement('canvas');source.width=fullWidth;source.height=fullHeight;const sourceCtx=source.getContext('2d');
    sourceCtx.save(); sourceCtx.translate(fullWidth/2,fullHeight/2);sourceCtx.rotate(rotation*Math.PI/2);
    sourceCtx.filter=before?'none':`brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
    sourceCtx.drawImage(before?originalBitmap:bitmap,-width/2,-height/2,width,height);sourceCtx.restore();
    canvas.width=fullWidth;canvas.height=fullHeight;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(source,0,0);
    syncCrop();
    dialog.querySelector('.photo-preview-label').textContent=before?'ต้นฉบับ':'หลังปรับ';
    dialog.querySelector('[data-before]').setAttribute('aria-pressed',String(before));
  }
  function sync() {
    for(const [id,value] of Object.entries({brightness,contrast,saturation})) {dialog.querySelector(`[data-adjust="${id}"]`).value=value;dialog.querySelector(`[data-value="${id}"]`).textContent=value+'%';}
    render();
  }
  document.body.append(dialog);
  return new Promise(resolve=>{
    function finish(result) {if(finished)return;finished=true;bitmap.close();if(originalBitmap!==bitmap)originalBitmap.close();dialog.close();dialog.remove();active=false;if(previousFocus?.isConnected)previousFocus.focus();resolve(result);}
    dialog.addEventListener('cancel',e=>{e.preventDefault();finish(null);});
    dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>finish(null));
    dialog.querySelector('[data-before]').onclick=()=>{before=!before;render();};
    dialog.querySelector('[data-rotate]').onclick=()=>{rotation=(rotation+1)%4;cropRect=null;dialog.querySelectorAll('[data-crop]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.crop==='original')));syncCrop(true);render();};
    dialog.querySelectorAll('[data-crop]').forEach(button=>button.onclick=()=>{const ratio=({square:1,portrait:4/5,landscape:16/9})[button.dataset.crop];if(!ratio){cropRect=null;before=false;dialog.querySelectorAll('[data-crop]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));syncCrop(true);render();}else{setRatio(ratio);button.setAttribute('aria-pressed','true');}});
    dialog.querySelector('[data-custom-crop]').onclick=()=>{const a=Math.max(1,Math.min(100,Number(dialog.querySelector('[data-ratio-w]').value)||1)),b=Math.max(1,Math.min(100,Number(dialog.querySelector('[data-ratio-h]').value)||1));setRatio(a/b);};
    dialog.querySelector('[data-use-crop-size]').onclick=()=>{const r=crop();outputW.value=Math.round(r.w);outputH.value=Math.round(r.h);};
    for(const input of [outputW,outputH])input.onchange=()=>{input.value=String(Math.max(1,Math.min(4096,Number(input.value)||1)));};
    let drag=null;frame.addEventListener('pointerdown',e=>{if(before)return;const bounds=canvas.getBoundingClientRect(),area=crop();drag={type:e.target.closest('.crop-resize')?'resize':'move',startX:e.clientX,startY:e.clientY,rect:{...area},scaleX:fullSize().w/bounds.width,scaleY:fullSize().h/bounds.height};frame.setPointerCapture(e.pointerId);e.preventDefault();});
    frame.addEventListener('pointermove',e=>{if(!drag)return;const s=fullSize(),dx=(e.clientX-drag.startX)*drag.scaleX,dy=(e.clientY-drag.startY)*drag.scaleY,r=drag.rect;if(drag.type==='move'){cropRect={...r,x:Math.max(0,Math.min(s.w-r.w,r.x+dx)),y:Math.max(0,Math.min(s.h-r.h,r.y+dy))};}else{cropRect={...r,w:Math.max(32,Math.min(s.w-r.x,r.w+dx)),h:Math.max(32,Math.min(s.h-r.y,r.h+dy))};}syncCrop();});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])frame.addEventListener(event,()=>{drag=null;});
    dialog.querySelector('[data-reset]').onclick=()=>{if(bitmap!==originalBitmap)bitmap.close();bitmap=originalBitmap;width=Math.max(1,Math.round(bitmap.width*scale));height=Math.max(1,Math.round(bitmap.height*scale));rotation=0;cropRect=null;before=false;brightness=contrast=saturation=100;choose('natural');dialog.querySelectorAll('[data-crop]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.crop==='original')));syncCrop(true);sync();};
    function choose(id){dialog.querySelectorAll('[data-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.preset===id)));}
    dialog.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{[brightness,contrast,saturation]=presets[b.dataset.preset];before=false;choose(b.dataset.preset);sync();});
    dialog.querySelectorAll('[data-adjust]').forEach(input=>input.oninput=()=>{const v=Number(input.value);if(input.dataset.adjust==='brightness')brightness=v;if(input.dataset.adjust==='contrast')contrast=v;if(input.dataset.adjust==='saturation')saturation=v;before=false;choose('');sync();});
    dialog.querySelector('[data-enhance]')?.addEventListener('click',async()=>{
      if(busy)return;busy=true;const button=dialog.querySelector('[data-enhance]');button.disabled=true;button.textContent='AI กำลังปรับภาพ…';dialog.querySelector('[data-save]').disabled=true;
      try{before=false;render();const blob=await new Promise(resolve=>outputCanvas().toBlob(resolve,'image/png'));if(!blob)throw Error('เตรียมรูปไม่สำเร็จ');const result=await enhance(new File([blob],'pure-photo.png',{type:'image/png'}));const updated=await createImageBitmap(result);if(finished){updated.close();return;}if(bitmap!==originalBitmap)bitmap.close();bitmap=updated;const ratio=Math.min(1,2048/Math.max(bitmap.width,bitmap.height));width=Math.round(bitmap.width*ratio);height=Math.round(bitmap.height*ratio);rotation=0;cropRect=null;brightness=contrast=saturation=100;choose('natural');dialog.querySelectorAll('[data-crop]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.crop==='original')));syncCrop(true);sync();dialog.querySelector('.photo-error').textContent='ปรับภาพแล้ว ตรวจภาพก่อนกดใช้รูปนี้';}
      catch(e){if(!finished)dialog.querySelector('.photo-error').textContent=e.message||'AI ปรับภาพไม่ได้ ลองใช้ฟิลเตอร์ในเครื่อง';}
      finally{busy=false;if(!finished){button.disabled=false;button.textContent='ให้ AI ปรับภาพ';dialog.querySelector('[data-save]').disabled=false;}}
    });
    dialog.querySelector('[data-save]').onclick=()=>{
      if(busy)return;busy=true;before=false;render();const button=dialog.querySelector('[data-save]');button.disabled=true;button.textContent='กำลังเตรียมรูป…';
      const type=file.type==='image/png'?'image/png':'image/jpeg';
      outputCanvas().toBlob(blob=>{if(finished)return;if(!blob){busy=false;button.disabled=false;button.textContent='ใช้รูปนี้';dialog.querySelector('.photo-error').textContent='บันทึกรูปไม่สำเร็จ กรุณาลองอีกครั้ง';return;}finish(new File([blob],file.name.replace(/\.[^.]+$/,'')+'-pure.'+(type==='image/png'?'png':'jpg'),{type,lastModified:Date.now()}));},type,.92);
    };
    try {sync();dialog.showModal();dialog.querySelector('[data-close]').focus();dialog.scrollTop=0;} catch {finish(null);}
  });
}
