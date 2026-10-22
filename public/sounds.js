let ctx,activeAudio,account='',last={},speaker=false;
let ringtoneTimer;
const names={classic:'Classic Chime',bubble:'Bubble Pop',crystal:'Crystal',bell:'Bell',custom:'ไฟล์ของฉัน',off:'ปิดเสียง'};
const db=()=>new Promise((resolve,reject)=>{const r=indexedDB.open('pure-sounds',1);r.onupgradeneeded=()=>r.result.createObjectStore('audio');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
const key=(channel)=>account+':'+channel;
async function blobStore(channel='message',value){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('audio',value===undefined?'readonly':'readwrite'),store=tx.objectStore('audio');let result,legacy;const r=value===undefined?store.get(key(channel)):store.put(value,key(channel));r.onsuccess=()=>{result=r.result;};if(value===undefined&&channel==='message'){const old=store.get(account);old.onsuccess=()=>{legacy=old.result;};}tx.oncomplete=()=>{resolve(result||legacy);d.close();};tx.onerror=()=>{reject(tx.error);d.close();};});}
function setting(channel='message'){try{return localStorage.getItem('pure.sound.'+account+'.'+channel)||(channel==='message'?localStorage.getItem('pure.sound.'+account):null)||'classic';}catch{return 'classic';}}
export async function playSound(channel='message',preview=false){if(typeof channel==='boolean'){preview=channel;channel='message';}if(!preview&&Date.now()-(last[channel]||0)<1500)return;last[channel]=Date.now();const type=setting(channel);if(type==='off')return;
 if(type==='custom'){const blob=await blobStore(channel);if(!blob)return;const url=URL.createObjectURL(blob);activeAudio?.pause();const a=new Audio(url);activeAudio=a;a.onended=()=>URL.revokeObjectURL(url);a.onerror=()=>URL.revokeObjectURL(url);await a.play();setTimeout(()=>{a.pause();URL.revokeObjectURL(url);},5000);return;}
 ctx||=new AudioContext();await ctx.resume();const notes=({classic:[660,880],bubble:[440,660,990],crystal:[1046,1318,1568],bell:[523,1046]})[type]||[660];notes.forEach((hz,i)=>{const o=ctx.createOscillator(),g=ctx.createGain(),at=ctx.currentTime+i*.12;o.type='sine';o.frequency.value=hz;g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(.13,at+.012);g.gain.exponentialRampToValueAtTime(.001,at+.5);o.connect(g);g.connect(ctx.destination);o.start(at);o.stop(at+.55);});
}
export function startRingtone(){stopRingtone();playSound('call').catch(()=>{});ringtoneTimer=setInterval(()=>playSound('call').catch(()=>{}),2600);}
export function stopRingtone(){clearInterval(ringtoneTimer);ringtoneTimer=null;}
export function soundAccount(id){account=id;}
export function mountSounds({state,toast}){account=state.user.id;const host=document.querySelector('.profile-grid>div');if(!host)return;const card=document.createElement('section');card.className='card notification-settings';const options=Object.entries(names).map(([id,label])=>`<option value="${id}">${label}</option>`).join('');card.innerHTML=`<h3><svg><use href="#speaker"/></svg> เสียงแยกตามประเภท</h3><div class="sound-channel" data-channel="message"><h4>ข้อความและคำขอเพื่อน</h4><select aria-label="เสียงแจ้งเตือนข้อความ">${options}</select><div class="sound-actions"><label class="secondary">เลือกไฟล์เสียง<input type="file" accept=".mp3,.wav,.ogg,.m4a,audio/*" hidden></label><button class="secondary" data-preview>ทดลองฟัง</button></div></div><div class="sound-channel" data-channel="call"><h4>สายเรียกเข้า</h4><select aria-label="เสียงเรียกเข้า">${options}</select><div class="sound-actions"><label class="secondary">เลือกไฟล์เสียง<input type="file" accept=".mp3,.wav,.ogg,.m4a,audio/*" hidden></label><button class="secondary" data-preview>ทดลองฟัง</button></div></div><button class="secondary" data-system>ตั้งค่าเสียง Android</button><p class="muted">การตั้งค่าและไฟล์เสียงแยกตามบัญชีผู้ใช้ และจัดเก็บในเครื่องนี้ · ไฟล์ไม่เกิน 5 MB</p>`;host.append(card);
 card.querySelectorAll('.sound-channel').forEach(section=>{const channel=section.dataset.channel,select=section.querySelector('select'),file=section.querySelector('input[type=file]');select.value=setting(channel);select.onchange=()=>{try{localStorage.setItem('pure.sound.'+account+'.'+channel,select.value);}catch{toast('เครื่องนี้บันทึกการตั้งค่าไม่ได้');}};section.querySelector('[data-preview]').onclick=()=>playSound(channel,true).catch(()=>toast('เล่นเสียงไม่ได้ เลือกไฟล์เสียงที่เครื่องรองรับ'));file.onchange=async e=>{const f=e.target.files[0];if(!f)return;if(f.size>5*1024*1024||!(/\.(mp3|wav|ogg|m4a)$/i.test(f.name))){toast('เลือก MP3, WAV, OGG หรือ M4A ไม่เกิน 5 MB');return;}try{await blobStore(channel,f);select.value='custom';select.onchange();toast('บันทึกเสียงไว้ในเครื่องแล้ว');}catch{toast('บันทึกไฟล์เสียงไม่ได้');}finally{file.value='';}};});
 card.querySelector('[data-system]').onclick=()=>{if(/PUREAndroid/.test(navigator.userAgent))location.href='pure-audio://settings';else toast('เมนูนี้ใช้ใน APK Android');};
}
export function updateAudioUI(on){
  const b=document.querySelector('#speaker-call');
  const route=document.querySelector('#call-audio-route');
  const icon=document.querySelector('#speaker-call-icon');
  if(b){
    b.hidden=false;
    b.disabled=false;
    b.classList.toggle('on',on);
    b.setAttribute('aria-pressed',String(on));
    b.setAttribute('aria-label',on?'สลับเป็นลำโพงแนบหูโทรศัพท์':'สลับเป็นลำโพงนอก');
    b.title=on?'กำลังใช้ลำโพงนอก (แตะเพื่อเปลี่ยนเป็นลำโพงแนบหู)':'กำลังใช้ลำโพงโทรศัพท์ (แตะเพื่อเปิดลำโพงนอก)';
  }
  if(icon)icon.setAttribute('href',on?'#speaker':'#phone');
  if(route){
    route.classList.toggle('speaker-on',on);
    route.innerHTML=`<svg style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"><use href="${on?'#speaker':'#phone'}"/></svg><span>${on?'ลำโพงนอก (สปีกเกอร์)':'ลำโพงโทรศัพท์ (แนบหู)'}</span>`;
  }
}
export function applySpeaker(on,toast){
  if(window.PureAndroid?.setSpeakerphone){
    try{window.PureAndroid.setSpeakerphone(on);}catch(e){console.warn(e);}
  }else if(/PUREAndroid/.test(navigator.userAgent)){
    location.href='pure-audio://speaker?on='+on;
  }
  const remote=document.querySelector('#remote-video');
  if(remote&&typeof remote.setSinkId==='function'&&navigator.mediaDevices?.enumerateDevices){
    navigator.mediaDevices.enumerateDevices().then(devs=>{
      const outputs=devs.filter(d=>d.kind==='audiooutput');
      if(outputs.length>1){
        const match=outputs.find(d=>on?/speaker|loudspeaker/i.test(d.label):/earpiece|handset|receiver|phone/i.test(d.label))||(on?outputs[outputs.length-1]:outputs[0]);
        if(match)remote.setSinkId(match.deviceId).catch(()=>{});
      }
    }).catch(()=>{});
  }
}
export function toggleSpeaker(toast){
  speaker=!speaker;
  updateAudioUI(speaker);
  applySpeaker(speaker,toast);
  if(toast)toast(speaker?'เปิดลำโพงนอก (สปีกเกอร์)':'สลับเป็นลำโพงโทรศัพท์ (แนบหู)');
}
export function setupCallAudio(video,toast){
  const b=document.querySelector('#speaker-call');
  const route=document.querySelector('#call-audio-route');
  speaker=!!video;
  if(b){
    b.hidden=false;
    b.disabled=false;
    b.onclick=()=>toggleSpeaker(toast);
  }
  if(route){
    route.onclick=()=>toggleSpeaker(toast);
  }
  updateAudioUI(speaker);
  applySpeaker(speaker,toast);
  window.onPureAudioState=detail=>{
    if(detail?.error)return;
    if(typeof detail?.speaker==='boolean'){
      speaker=detail.speaker;
      updateAudioUI(speaker);
    }
  };
}
window.addEventListener('pure-audio-state',e=>window.onPureAudioState?.(e.detail));
export function resetCallAudio(){
  if(window.PureAndroid?.resetAudio)try{window.PureAndroid.resetAudio();}catch(e){}
  else if(/PUREAndroid/.test(navigator.userAgent))location.href='pure-audio://reset';
  window.onPureAudioState=null;
}
