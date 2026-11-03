// PURE v0.9 client: group calls, push, live captions, screen share, recording, E2E chat, stories.
import {speakPure} from './tts.js';
const $=s=>document.querySelector(s);
const b64u={enc:buf=>btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''),dec:s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((s.length+3)%4)),c=>c.charCodeAt(0))};
let C=null,socket=null,me=null;
const el=(tag,attrs={},html='')=>{const e=document.createElement(tag);for(const [k,v] of Object.entries(attrs))k==='class'?e.className=v:e.setAttribute(k,v);if(html)e.innerHTML=html;return e;};

/* ---------------- E2E (ECDH P-256 + AES-GCM) ---------------- */
const idb=(()=>{let p;const open=()=>p??=new Promise((ok,no)=>{const r=indexedDB.open('pure-e2e',1);r.onupgradeneeded=()=>r.result.createObjectStore('keys');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
 const tx=async(mode,fn)=>{const db=await open();return new Promise((ok,no)=>{const t=db.transaction('keys',mode);const r=fn(t.objectStore('keys'));t.oncomplete=()=>ok(r?.result);t.onerror=()=>no(t.error);});};
 return {get:k=>tx('readonly',s=>s.get(k)),set:(k,v)=>tx('readwrite',s=>s.put(v,k))};})();
const e2e={pair:null,myFp:null,peers:new Map(),shared:new Map(),ready:null,plain:new Map()};
async function sha256Hex(s){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function e2eSetup(){
 if(!crypto.subtle||!window.indexedDB)return;
 const slot='pair.'+me.id;let pair=await idb.get(slot).catch(()=>null);
 if(!pair){pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveKey']);await idb.set(slot,pair);}
 e2e.pair=pair;const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);const pubJwk={kty:'EC',crv:'P-256',x:jwk.x,y:jwk.y};
 let server=null;try{server=await C.api('/e2e/key/'+me.id);}catch{}
 if(!server||server.jwk.x!==pubJwk.x||server.jwk.y!==pubJwk.y){const r=await C.api('/e2e/key',{jwk:pubJwk},'PUT');e2e.myFp=r.fingerprint;}else e2e.myFp=server.fingerprint;
}
async function peerKey(id,fresh=false){
 if(!fresh&&e2e.peers.has(id))return e2e.peers.get(id);
 let k=null;try{k=await C.api('/e2e/key/'+id);}catch(e){if(e.status!==404)throw e;}
 e2e.peers.set(id,k);e2e.shared.delete(id);
 if(k){const seen=localStorage.getItem('pure.e2e.seen.'+me.id+'.'+id);if(seen&&seen!==k.fingerprint){localStorage.removeItem('pure.e2e.verified.'+me.id+'.'+id);C.toast('⚠️ กุญแจเข้ารหัสของคู่สนทนาเปลี่ยน ตรวจสอบรหัสความปลอดภัยอีกครั้ง');}localStorage.setItem('pure.e2e.seen.'+me.id+'.'+id,k.fingerprint);}
 return k;
}
async function sharedKey(id){
 if(e2e.shared.has(id))return e2e.shared.get(id);const k=await peerKey(id);if(!k||!e2e.pair)return null;
 const pub=await crypto.subtle.importKey('jwk',{...k.jwk,ext:true},{name:'ECDH',namedCurve:'P-256'},false,[]);
 const key=await crypto.subtle.deriveKey({name:'ECDH',public:pub},e2e.pair.privateKey,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 e2e.shared.set(id,key);return key;
}
const aad=(a,b)=>new TextEncoder().encode('pure-e2e1|'+[a,b].sort().join('|'));
async function encryptOutgoing(peerId,text){
 try{if(!text||/^\s*@pure\b/i.test(text)||!e2e.pair)return text;const key=await sharedKey(peerId);if(!key)return text;
  const iv=crypto.getRandomValues(new Uint8Array(12));const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(me.id,peerId)},key,new TextEncoder().encode(text));
  const out='e2e1:'+b64u.enc(iv)+':'+b64u.enc(ct);e2e.plain.set(out,text);return out;}catch{return text;}
}
async function decrypt(peerId,payload){
 if(e2e.plain.has(payload))return e2e.plain.get(payload);
 const [,iv,ct]=payload.split(':');const key=await sharedKey(peerId);if(!key)throw new Error('no key');
 const pt=new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:b64u.dec(iv),additionalData:aad(me.id,peerId)},key,b64u.dec(ct)));
 e2e.plain.set(payload,pt);if(e2e.plain.size>2000)e2e.plain.delete(e2e.plain.keys().next().value);return pt;
}
async function afterRender(box){
 const peer=C.state.peer;updateLockButton();if(!peer||C.state.group)return;
 for(const art of box.querySelectorAll('article[data-message-id]')){const m=C.state.messages.find(x=>String(x.id)===art.dataset.messageId);if(!m?.text?.startsWith('e2e1:'))continue;const span=art.querySelector('.message-original');if(!span||span.dataset.e2e)continue;span.dataset.e2e='1';art.classList.add('e2e');
  span.textContent='🔒 กำลังถอดรหัส…';decrypt(peer.id,m.text).then(t=>{span.textContent=t;span.title='เข้ารหัสต้นทางถึงปลายทาง';}).catch(()=>{span.textContent='🔒 ถอดรหัสไม่ได้ (กุญแจเปลี่ยนหรือเปิดจากอุปกรณ์อื่น)';span.classList.add('e2e-fail');});}
}
function safetyNumber(a,b){return sha256Hex([a,b].sort().join(':')).then(h=>{const digits=[];for(let i=0;i<60;i+=5)digits.push(String(parseInt(h.slice(i,i+5),16)%100000).padStart(5,'0'));return digits.join(' ');});}
async function updateLockButton(){
 const btn=$('#e2e-lock');if(!btn)return;const peer=C.state.peer;btn.hidden=!peer||!!C.state.group;if(btn.hidden)return;
 const k=await peerKey(peer.id).catch(()=>null);if(C.state.peer!==peer)return;
 const verified=k&&localStorage.getItem('pure.e2e.verified.'+me.id+'.'+peer.id)===k.fingerprint;
 btn.classList.toggle('on',!!k);btn.classList.toggle('verified',!!verified);btn.setAttribute('aria-label',k?(verified?'เข้ารหัสแล้ว · ยืนยันแล้ว':'เข้ารหัสแล้ว · ยังไม่ยืนยัน'):'คู่สนทนายังไม่เปิดการเข้ารหัส');btn.title=btn.getAttribute('aria-label');
}
async function openSafety(){
 const peer=C.state.peer;if(!peer)return;const k=await peerKey(peer.id,true).catch(()=>null);const d=$('#e2e-dialog');
 if(!k||!e2e.myFp){d.querySelector('.e2e-body').innerHTML=`<p>${C.esc(peer.name)} ยังไม่เปิดการเข้ารหัส ข้อความจะถูกส่งแบบปกติ (เข้ารหัสระหว่างทางด้วย HTTPS) จนกว่าอีกฝ่ายจะเปิดแอปเวอร์ชัน 0.9 ขึ้นไป</p>`;d.querySelector('#e2e-verify').hidden=true;d.showModal();return;}
 const num=await safetyNumber(e2e.myFp,k.fingerprint);const verified=localStorage.getItem('pure.e2e.verified.'+me.id+'.'+peer.id)===k.fingerprint;
 d.querySelector('.e2e-body').innerHTML=`<p>ข้อความในแชตนี้เข้ารหัสต้นทางถึงปลายทาง เซิร์ฟเวอร์เก็บได้เฉพาะข้อความที่อ่านไม่ออก</p><p class="e2e-num" aria-label="รหัสความปลอดภัย">${num}</p><p class="muted">เทียบตัวเลขนี้กับ ${C.esc(peer.name)} ต่อหน้าหรือผ่านวิดีโอคอล ถ้าตรงกันแปลว่าไม่มีใครดักกลาง</p><p class="muted small">ลายนิ้วมือของคุณ: <code>${e2e.myFp.slice(0,32)}</code><br>ของ ${C.esc(peer.name)}: <code>${k.fingerprint.slice(0,32)}</code></p><p class="muted small">หมายเหตุ: กุญแจเก็บในเบราว์เซอร์/แอปเครื่องนี้ ถ้าเปิดจากอุปกรณ์อื่นจะอ่านข้อความเข้ารหัสเดิมไม่ได้ · ข้อความที่ขึ้นต้นด้วย @pure ส่งแบบไม่เข้ารหัสเพื่อให้ AI อ่านได้</p>`;
 const v=d.querySelector('#e2e-verify');v.hidden=false;v.textContent=verified?'✓ ยืนยันแล้ว (กดเพื่อยกเลิก)':'ทำเครื่องหมายว่ายืนยันแล้ว';
 v.onclick=()=>{const key='pure.e2e.verified.'+me.id+'.'+peer.id;if(verified)localStorage.removeItem(key);else localStorage.setItem(key,k.fingerprint);d.close();updateLockButton();};d.showModal();
}

/* ---------------- Push (Web Push + Android/FCM hooks) ---------------- */
async function setupPush(interactive=false){
 try{
  const cfg=await C.api('/push/config');
  if(window.PureAndroid?.fcmToken){const t=String(window.PureAndroid.fcmToken()||'');if(t)await C.api('/push/subscribe',{kind:'fcm',endpoint:t});}
  if(!('serviceWorker' in navigator)||!('PushManager' in window)||!cfg.vapidPublicKey)return false;
  const reg=await navigator.serviceWorker.register('/sw.js');
  if(Notification.permission==='default'){if(!interactive){$('#push-enable')?.removeAttribute('hidden');return false;}if(await Notification.requestPermission()!=='granted')return false;}
  if(Notification.permission!=='granted')return false;
  let sub=await reg.pushManager.getSubscription();
  if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64u.dec(cfg.vapidPublicKey)});
  const j=sub.toJSON();await C.api('/push/subscribe',{kind:'web',endpoint:j.endpoint,keys:j.keys});$('#push-enable')?.setAttribute('hidden','');return true;
 }catch(e){if(interactive)C.toast('เปิดการแจ้งเตือนไม่สำเร็จ: '+e.message);return false;}
}
function nativeCallNotify(name,video,url){try{if(document.hidden&&window.PureAndroid?.notifyCall)window.PureAndroid.notifyCall(name||'PURE',video?'วิดีโอคอลเข้า':'สายเรียกเข้า',url||'/');}catch{}}

/* ---------------- Media helpers ---------------- */
async function userMedia(video){if(!navigator.mediaDevices?.getUserMedia)throw new Error('โทรต้องใช้ HTTPS หรือ localhost และอนุญาตกล้อง/ไมค์');return navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:video?{facingMode:'user',width:{ideal:640},height:{ideal:480}}:false});}
async function screenMedia(){if(!navigator.mediaDevices?.getDisplayMedia)throw new Error('อุปกรณ์นี้ไม่รองรับการแชร์หน้าจอ');return navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:15,max:30}},audio:false});}

/* ---------------- Active call abstraction (1:1 or group) ---------------- */
// Returns {kind:'1:1'|'group', pcs:[RTCPeerConnection], stream, target:{callId}|{room}}
function active(){
 if(G)return {kind:'group',pcs:[...G.peers.values()].map(p=>p.pc),stream:G.stream,target:{room:G.room},remoteStreams:[...G.peers.values()].map(p=>p.stream).filter(Boolean)};
 const c=C.getCall();if(c?.pc&&c.id)return {kind:'1:1',pcs:[c.pc],stream:c.stream,target:{callId:c.id},ctx:c,remoteStreams:[$('#remote-video').srcObject].filter(Boolean)};
 return null;
}
const extras={screen:null,camTrack:null,recorder:null,captions:null};
async function renegotiate1to1(ctx){const offer=await ctx.pc.createOffer();await ctx.pc.setLocalDescription(offer);socket.emit('call:signal',{id:ctx.id,signal:{description:ctx.pc.localDescription}});}
async function toggleScreen(){
 const a=active();if(!a)return;
 if(extras.screen){stopScreen();return;}
 let s;try{s=await screenMedia();}catch(e){if(e.name!=='NotAllowedError')C.toast(e.message);return;}
 const track=s.getVideoTracks()[0];extras.screen=s;extras.camTrack=a.stream.getVideoTracks()[0]||null;track.onended=stopScreen;
 for(const pc of a.pcs){const sender=pc.getSenders().find(x=>x.track?.kind==='video')||pc.getTransceivers().find(t=>t.receiver.track?.kind==='video'&&t.direction!=='inactive')?.sender;
  if(sender){await sender.replaceTrack(track);}else if(a.kind==='1:1'){pc.addTrack(track,a.stream);await renegotiate1to1(a.ctx);}}
 setLocalPreview(s);markButtons();if(G)socket.emit('gcall:state',{room:G.room,...G.state(),screen:true});
}
function stopScreen(){
 const a=active();const s=extras.screen;extras.screen=null;s?.getTracks().forEach(t=>t.stop());
 if(a)for(const pc of a.pcs){const sender=pc.getSenders().find(x=>x.track?.kind==='video'||x.track===null);if(sender&&(sender.track===null||sender.track?.readyState==='ended'))sender.replaceTrack(extras.camTrack||null).catch(()=>{});}
 setLocalPreview(a?.stream);markButtons();if(G)socket.emit('gcall:state',{room:G.room,...G.state(),screen:false});
}
function setLocalPreview(stream){if(G){const v=$('#gcall-grid [data-me] video');if(v)v.srcObject=stream||null;}else{const v=$('#local-video');if(v){v.srcObject=stream||null;if(stream?.getVideoTracks().length)v.hidden=false;}}}
function markButtons(){for(const b of document.querySelectorAll('[data-x="screen"]'))b.classList.toggle('active',!!extras.screen);for(const b of document.querySelectorAll('[data-x="record"]'))b.classList.toggle('active',!!extras.recorder);for(const b of document.querySelectorAll('[data-x="captions"]'))b.classList.toggle('active',!!extras.captions);}

/* Recording: local MediaRecorder; consent notice broadcast to everyone in the call */
function toggleRecord(){
 const a=active();if(!a)return;if(extras.recorder){extras.recorder.stop();return;}
 if(!window.MediaRecorder){C.toast('อุปกรณ์นี้ไม่รองรับการบันทึก');return;}
 if(!confirm('เริ่มบันทึกสายนี้ลงเครื่องของคุณ?\nทุกคนในสายจะเห็นแจ้งเตือนว่ากำลังบันทึก กรุณาขอความยินยอมก่อน'))return;
 const ac=new AudioContext(),dest=ac.createMediaStreamDestination();
 for(const s of [a.stream,...a.remoteStreams])if(s?.getAudioTracks().length)ac.createMediaStreamSource(s).connect(dest);
 const video=(extras.screen?.getVideoTracks()[0])||a.remoteStreams.flatMap(s=>s.getVideoTracks())[0]||a.stream.getVideoTracks()[0];
 const out=new MediaStream([...dest.stream.getAudioTracks(),...(video?[video]:[])]);
 const mime=['video/webm;codecs=vp8,opus','video/webm','audio/webm'].find(m=>MediaRecorder.isTypeSupported(m))||'';
 const rec=new MediaRecorder(out,mime?{mimeType:mime}:{});const chunks=[];rec.ondataavailable=e=>e.data.size&&chunks.push(e.data);
 rec.onstop=()=>{ac.close();extras.recorder=null;markButtons();showRecBanner(null,'me');socket.emit('call:recording',{...a.target,active:false});const blob=new Blob(chunks,{type:rec.mimeType||'video/webm'});if(blob.size){const url=URL.createObjectURL(blob);const link=el('a',{href:url,download:'PURE-call-'+new Date().toISOString().replace(/[:.]/g,'-')+'.webm'});document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);C.toast('บันทึกไฟล์สายลงเครื่องแล้ว');}};
 rec.start(1000);extras.recorder=rec;markButtons();socket.emit('call:recording',{...a.target,active:true});showRecBanner('คุณ','me');
}
const recBy=new Map();
function showRecBanner(name,id){if(name)recBy.set(id,name);else recBy.delete(id);for(const b of document.querySelectorAll('.rec-banner')){b.hidden=!recBy.size;b.textContent='● กำลังบันทึกสาย · '+[...recBy.values()].join(', ');}}

/* Live captions: short audio chunks -> server (Gemini) -> transcript + translation */
function captionLang(){return localStorage.getItem('pure.caption.lang')||((navigator.language||'th').startsWith('th')?'th':'en');}
function toggleCaptions(){
 const a=active();if(!a)return;if(extras.captions){extras.captions.stop();return;}
 if(!window.MediaRecorder){C.toast('อุปกรณ์นี้ไม่รองรับคำบรรยายสด');return;}
 const lang=captionLang();socket.emit('caption:lang',{lang});
 const track=a.stream.getAudioTracks()[0];if(!track){C.toast('ไม่มีไมค์ในสาย');return;}
 const mime=['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4'].find(m=>MediaRecorder.isTypeSupported(m))||'';
 let stopped=false,rec=null,errors=0;
 const cycle=()=>{if(stopped)return;const s=new MediaStream([track]);rec=new MediaRecorder(s,{...(mime?{mimeType:mime}:{}),audioBitsPerSecond:24000});const parts=[];rec.ondataavailable=e=>e.data.size&&parts.push(e.data);
  rec.onstop=async()=>{if(!stopped)cycle();const blob=new Blob(parts,{type:(rec.mimeType||'audio/webm').split(';')[0]});if(blob.size<1500||!track.enabled)return;const buf=new Uint8Array(await blob.arrayBuffer());let bin='';for(let i=0;i<buf.length;i+=8192)bin+=String.fromCharCode(...buf.subarray(i,i+8192));const data=btoa(bin);if(data.length>95000)return;
   const cur=active();if(!cur)return;try{const r=await socket.timeout(15000).emitWithAck('caption:audio',{...cur.target,data,mime:blob.type,lang:captionLang()});if(r?.error&&++errors===1)C.toast('คำบรรยาย: '+r.error);}catch{}};
  rec.start();setTimeout(()=>rec.state==='recording'&&rec.stop(),3200);};
 extras.captions={stop(){stopped=true;try{rec?.stop();}catch{}extras.captions=null;markButtons();for(const b of document.querySelectorAll('.captions'))b.hidden=true;}};
 for(const b of document.querySelectorAll('.captions'))b.hidden=false;cycle();markButtons();C.toast(lang==='th'?'เปิดคำบรรยายสด · คุณพูดไทย แปลเป็นอังกฤษให้อีกฝ่าย':'Live captions on · you speak English, translated to Thai');
}
function onCaption(c){
 if(c.translation&&c.from!==me.id&&localStorage.getItem('pure.caption.speak')==='1')speakPure(c.translation,{lang:captionLang()});
 for(const box of document.querySelectorAll('.captions')){box.hidden=false;const line=el('p',{class:'caption-line'});line.innerHTML=`<b>${C.esc(c.from===me.id?'คุณ':c.name)}</b> ${C.esc(c.translation||c.text)}${c.translation?`<small>${C.esc(c.text)}</small>`:''}`;box.append(line);while(box.children.length>3)box.firstElementChild.remove();setTimeout(()=>line.remove(),9000);}
}
function stopExtras(){if(extras.recorder)try{extras.recorder.stop();}catch{}extras.captions?.stop();if(extras.screen){extras.screen.getTracks().forEach(t=>t.stop());extras.screen=null;}recBy.clear();showRecBanner(null,'');markButtons();}

/* ---------------- 1:1 call hooks ---------------- */
function onPeerConnection(ctx){if(!ctx.pc.getTransceivers().some(t=>t.sender.track?.kind==='video')&&!ctx.video){/* audio call: screen share renegotiates */}}
async function iceRestart(ctx){try{if(!ctx.pc||!ctx.id||ctx.pc.signalingState!=='stable')return;const offer=await ctx.pc.createOffer({iceRestart:true});await ctx.pc.setLocalDescription(offer);socket.emit('call:signal',{id:ctx.id,signal:{description:ctx.pc.localDescription}});}catch{}}
function onCallEnd(){stopExtras();}

/* ---------------- Group calls (mesh, ≤6) ---------------- */
let G=null;const rooms=new Map();// groupId -> room id (active rooms we know of)
function tile(id,name,isMe){let t=$(`#gcall-grid [data-user="${CSS.escape(id)}"]`);if(t)return t;t=el('div',{class:'gtile','data-user':id,...(isMe?{'data-me':''}:{})},`<video autoplay playsinline ${isMe?'muted':''}></video><div class="gtile-avatar">${C.esc((name||'?').slice(0,1).toUpperCase())}</div><span class="gtile-name">${C.esc(isMe?'คุณ':name)}</span><span class="gtile-state"></span>`);$('#gcall-grid').append(t);layout();return t;}
function layout(){const n=$('#gcall-grid').children.length;$('#gcall-grid').dataset.n=n;$('#gcall-count').textContent=n+'/6 คน';}
async function newPeer(user,initiator){
 const rtc=G.rtc;const pc=new RTCPeerConnection({iceServers:rtc.iceServers});const p={pc,user,queued:[],stream:null};G.peers.set(user.id,p);
 G.stream.getTracks().forEach(t=>pc.addTrack(t,G.stream));if(!G.stream.getVideoTracks().length)pc.addTransceiver('video',{direction:'sendrecv'});
 if(extras.screen){const s=pc.getSenders().find(x=>x.track?.kind==='video')||pc.getTransceivers().find(t=>t.receiver.track.kind==='video').sender;s.replaceTrack(extras.screen.getVideoTracks()[0]);}
 const t=tile(user.id,user.name);
 pc.onicecandidate=e=>e.candidate&&socket.emit('gcall:signal',{room:G.room,to:user.id,signal:{candidate:e.candidate}});
 pc.ontrack=e=>{p.stream=e.streams[0]||new MediaStream([e.track]);const v=t.querySelector('video');v.srcObject=p.stream;v.play().catch(()=>{});if(e.track.kind==='video'){e.track.onunmute=()=>t.classList.add('has-video');e.track.onmute=()=>t.classList.remove('has-video');}};
 pc.onconnectionstatechange=async()=>{t.dataset.conn=pc.connectionState;if(pc.connectionState==='failed'&&initiator&&G){try{const o=await pc.createOffer({iceRestart:true});await pc.setLocalDescription(o);socket.emit('gcall:signal',{room:G.room,to:user.id,signal:{description:pc.localDescription}});}catch{}}};
 if(initiator){const o=await pc.createOffer();await pc.setLocalDescription(o);socket.emit('gcall:signal',{room:G.room,to:user.id,signal:{description:pc.localDescription}});}
 return p;
}
function dropPeer(uid){const p=G?.peers.get(uid);if(!p)return;p.pc.close();G.peers.delete(uid);$(`#gcall-grid [data-user="${CSS.escape(uid)}"]`)?.remove();layout();}
async function joinRoom(room,videoPref){
 if(G||C.getCall()){C.toast('กำลังอยู่ในสายอื่น');return;}
 G={room,peers:new Map(),stream:null,rtc:null,state(){return {mic:!!this.stream?.getAudioTracks()[0]?.enabled,cam:!!this.stream?.getVideoTracks()[0]?.enabled};}};
 const d=$('#gcall-dialog');$('#gcall-grid').innerHTML='';$('#gcall-status').textContent='กำลังเข้าร่วม…';d.showModal();
 try{
  const info=await socket.timeout(10000).emitWithAck('gcall:join',{room});if(info.error)throw new Error(info.error);
  const video=videoPref??info.video;G.stream=await userMedia(video);G.rtc=await C.api('/rtc');if(!G||G.room!==room){G?.stream?.getTracks().forEach(t=>t.stop());return;}
  $('#gcall-title').textContent=info.group?.name||'สายกลุ่ม';rooms.set(info.group?.id,room);
  const mt=tile(me.id,me.name,true);mt.querySelector('video').srcObject=G.stream;mt.classList.toggle('has-video',video);
  $('#gcall-cam').hidden=!video;$('#gcall-status').textContent=info.peers.length?'เชื่อมต่อแล้ว':'รอสมาชิกเข้าร่วม…';
  for(const u of info.peers)await newPeer(u,true);
 }catch(e){C.toast(e.message);leaveGroup();}
}
async function startGroupCall(groupId,video){
 if(G||C.getCall())return;try{const r=await socket.timeout(10000).emitWithAck('gcall:start',{groupId,video});if(r.error)throw new Error(r.error);await joinRoom(r.room,video);}catch(e){C.toast(e.message);}
}
function leaveGroup(){if(!G)return;const g=G;G=null;stopExtras();socket?.emit('gcall:leave',{room:g.room});for(const p of g.peers.values())p.pc.close();g.stream?.getTracks().forEach(t=>t.stop());$('#gcall-grid').innerHTML='';if($('#gcall-dialog').open)$('#gcall-dialog').close();}
async function onGSignal({room,from,signal}){
 if(!G||G.room!==room||!G.stream)return;let p=G.peers.get(from);
 if(!p){const u=C.friendById(from)||{id:from,name:'สมาชิก'};p=await newPeer(u,false);}
 const pc=p.pc;
 if(signal.description){await pc.setRemoteDescription(signal.description);for(const c of p.queued)await pc.addIceCandidate(c).catch(()=>{});p.queued=[];if(signal.description.type==='offer'){await pc.setLocalDescription(await pc.createAnswer());socket.emit('gcall:signal',{room,to:from,signal:{description:pc.localDescription}});}}
 else if(signal.candidate){if(pc.remoteDescription)await pc.addIceCandidate(signal.candidate).catch(()=>{});else p.queued.push(signal.candidate);}
}
function onRing(r){
 if(r.group?.id)rooms.set(r.group.id,r.room);updateJoinPill();if(r.silent||G||C.getCall())return;
 nativeCallNotify('สายกลุ่ม · '+(r.group?.name||''),r.video,'/?gcall='+r.room);
 const d=$('#gring-dialog');d.querySelector('.gring-title').textContent=r.group?.name||'กลุ่ม';d.querySelector('.gring-sub').textContent=(r.from?.name||'สมาชิก')+' เริ่ม'+(r.video?'วิดีโอคอล':'โทร')+'กลุ่ม';
 d.querySelector('#gring-join').onclick=()=>{d.close();joinRoom(r.room,r.video);};d.querySelector('#gring-decline').onclick=()=>d.close();if(!d.open)d.showModal();clearTimeout(d._t);d._t=setTimeout(()=>d.open&&d.close(),40000);
}
function updateJoinPill(){const pill=$('#gcall-join-pill');if(!pill)return;const gid=C.state.group?.id;const room=gid&&rooms.get(gid);pill.hidden=!room||!!G;pill.onclick=()=>room&&joinRoom(room);}

/* ---------------- Stories ---------------- */
let reels=[];
async function loadStories(){try{reels=(await C.api('/stories')).reels;}catch{reels=[];}renderStoryBar();markAvatarRings();}
function renderStoryBar(){
 const bar=$('#stories-bar');if(!bar)return;const mine=reels.find(r=>r.user.id===me.id);
 const av=u=>u.avatar?`<img src="${C.esc(u.avatar)}" alt="">`:C.esc((u.name||'?').slice(0,1).toUpperCase());
 bar.innerHTML=`<button class="story-chip add" data-story-add aria-label="เพิ่มสตอรี่"><span class="story-ring ${mine?'':'none'}"><span class="story-av">${av(me)}</span><i>+</i></span><small>สตอรี่ของคุณ</small></button>`+reels.filter(r=>r.user.id!==me.id).map(r=>`<button class="story-chip" data-story-user="${C.esc(r.user.id)}" aria-label="ดูสตอรี่ของ ${C.esc(r.user.name)}"><span class="story-ring ${r.unseen?'':'seen'}"><span class="story-av">${av(r.user)}</span></span><small>${C.esc(r.user.name)}</small></button>`).join('');
 bar.querySelector('[data-story-add]').onclick=()=>mine?openViewer(me.id):openComposer();
 bar.querySelector('[data-story-add] i').onclick=e=>{e.stopPropagation();openComposer();};
 bar.querySelectorAll('[data-story-user]').forEach(b=>b.onclick=()=>openViewer(b.dataset.storyUser));
}
function markAvatarRings(){const ids=new Map(reels.map(r=>[r.user.id,r.unseen]));for(const row of document.querySelectorAll('#conversations [data-peer],#conversations [data-id]')){const id=row.dataset.peer||row.dataset.id;const a=row.querySelector('.avatar');if(!a)continue;a.classList.toggle('has-story',ids.has(id));a.classList.toggle('story-unseen',!!ids.get(id));}
 const pa=$('#peer-avatar');if(pa){const id=C.state.peer?.id;pa.classList.toggle('has-story',!!id&&ids.has(id));pa.classList.toggle('story-unseen',!!id&&!!ids.get(id));}}
function openComposer(){
 const d=$('#story-compose');const f=d.querySelector('form');f.reset();d.querySelector('.story-preview').innerHTML='';d.querySelector('.story-preview').style.background='#000';d.showModal();
 const file=f.elements.media,text=f.elements.text,bg=f.elements.bg;const prev=()=>{const p=d.querySelector('.story-preview');p.style.background=bg.value;const fl=file.files[0];p.innerHTML='';if(fl){const u=URL.createObjectURL(fl);p.append(fl.type.startsWith('video/')?el('video',{src:u,muted:'',autoplay:'',loop:'',playsinline:''}):el('img',{src:u,alt:''}));}if(text.value)p.append(el('p',{class:'story-text'},C.esc(text.value)));};
 file.onchange=text.oninput=bg.oninput=prev;
 f.onsubmit=C.safe(async e=>{e.preventDefault();const fl=file.files[0];if(fl&&fl.size>30*1024*1024)throw new Error('ไฟล์ใหญ่เกิน 30MB');if(!fl&&!text.value.trim())throw new Error('ใส่ข้อความ ภาพ หรือวิดีโอ');const fd=new FormData();if(fl)fd.append('media',fl);fd.append('text',text.value.trim());fd.append('bg',bg.value);const btn=f.querySelector('[type=submit]');btn.disabled=true;try{await C.api('/stories',fd);d.close();C.toast('โพสต์สตอรี่แล้ว · อยู่ได้ 24 ชั่วโมง');await loadStories();}finally{btn.disabled=false;}});
}
let viewer=null;
function openViewer(uid){const idx=reels.findIndex(r=>r.user.id===uid);if(idx<0)return;const reel=reels[idx];const start=Math.max(0,reel.items.findIndex(i=>!i.seen));viewer={ri:idx,ii:uid===me.id?0:start,timer:null};$('#story-viewer').showModal();showStory();}
function showStory(){
 clearTimeout(viewer?.timer);const d=$('#story-viewer');const reel=reels[viewer.ri];if(!reel){d.close();return;}const s=reel.items[viewer.ii];if(!s){nextReel();return;}
 const mine=reel.user.id===me.id;d.querySelector('.sv-bars').innerHTML=reel.items.map((_,i)=>`<span class="${i<viewer.ii?'done':i===viewer.ii?'now':''}"></span>`).join('');
 d.querySelector('.sv-who').innerHTML=`<strong>${C.esc(mine?'สตอรี่ของคุณ':reel.user.name)}</strong> <small>${ago(s.created)}</small>`;
 const stage=d.querySelector('.sv-stage');stage.style.background=s.bg||'#000';stage.innerHTML='';let dur=6000;
 if(s.kind==='image')stage.append(el('img',{src:s.media,alt:s.text||'สตอรี่'}));
 if(s.kind==='video'){const v=el('video',{src:s.media,autoplay:'',playsinline:''});v.onloadedmetadata=()=>{clearTimeout(viewer.timer);viewer.timer=setTimeout(next,Math.min(30000,(v.duration||6)*1000+300));};stage.append(v);dur=30000;}
 if(s.text)stage.append(el('p',{class:'story-text'+(s.kind==='text'?' big':'')},C.esc(s.text)));
 const foot=d.querySelector('.sv-foot');foot.innerHTML='';
 if(mine){foot.innerHTML=`<button class="sv-views" type="button">👁 ผู้ชม ${s.views||0} คน</button><button class="sv-del" type="button">ลบ</button>`;foot.querySelector('.sv-views').onclick=C.safe(async()=>{clearTimeout(viewer.timer);const r=await C.api('/stories/'+s.id+'/viewers');const list=el('div',{class:'sv-list'},'<h3>ผู้ชม</h3>'+(r.viewers.map(v=>`<p><b>${C.esc(v.name)}</b> <small>${ago(v.viewed)}</small></p>`).join('')||'<p class="muted">ยังไม่มีผู้ชม</p>'));stage.append(list);});foot.querySelector('.sv-del').onclick=C.safe(async()=>{if(!confirm('ลบสตอรี่นี้?'))return;await C.api('/stories/'+s.id,null,'DELETE');reel.items.splice(viewer.ii,1);if(!reel.items.length){d.close();}else showStory();loadStories();});}
 else if(!s.seen){s.seen=true;C.api('/stories/'+s.id+'/view',{}).catch(()=>{});reel.unseen=reel.items.some(i=>!i.seen);}
 viewer.timer=setTimeout(next,dur);
}
function next(){if(!viewer)return;viewer.ii++;showStory();}
function prev(){if(!viewer)return;if(viewer.ii>0)viewer.ii--;showStory();}
function nextReel(){viewer.ri++;viewer.ii=0;if(viewer.ri>=reels.length||reels[viewer.ri].user.id===me.id){$('#story-viewer').close();return;}showStory();}
function ago(t){const m=Math.round((Date.now()-t)/60000);return m<1?'เมื่อสักครู่':m<60?m+' นาทีที่แล้ว':Math.round(m/60)+' ชม.ที่แล้ว';}

/* ---------------- DOM ---------------- */
function buildDom(){
 const callBtns=`<button type="button" class="icon-button" data-x="speakcap" aria-pressed="false" aria-label="อ่านคำแปลออกเสียง" title="อ่านคำแปลออกเสียง (เสียง PURE)"><svg viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6L8 10H4zm12 -1a4 4 0 0 1 0 6"/></svg></button><button type="button" class="icon-button" data-x="screen" aria-label="แชร์หน้าจอ" title="แชร์หน้าจอ"><svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4M12 14V8m-3 3 3-3 3 3"/></svg></button><button type="button" class="icon-button" data-x="record" aria-label="บันทึกสาย" title="บันทึกสาย"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" fill="currentColor"/></svg></button><button type="button" class="icon-button" data-x="captions" aria-label="คำบรรยายสดและแปลภาษา" title="คำบรรยายสด (ไทย↔English)"><svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M10 10a2 2 0 1 0 0 4M17 10a2 2 0 1 0 0 4"/></svg></button><select class="caption-lang" aria-label="ภาษาที่คุณพูด"><option value="th">พูดไทย</option><option value="en">I speak English</option></select>`;
 const actions=$('#call-dialog .call-actions');if(actions&&!actions.querySelector('[data-x]')){$('#end-call').insertAdjacentHTML('beforebegin',callBtns);$('#call-dialog').insertAdjacentHTML('beforeend','<div class="rec-banner" role="alert" hidden></div><div class="captions" aria-live="polite" hidden></div>');}
 document.body.insertAdjacentHTML('beforeend',`
<dialog id="gcall-dialog" class="gcall" aria-label="สายกลุ่ม"><header class="gcall-top"><span class="eyebrow">PURE GROUP CALL</span><strong id="gcall-title">สายกลุ่ม</strong><span id="gcall-count">1/6 คน</span><span id="gcall-status"></span></header><div class="rec-banner" role="alert" hidden></div><div id="gcall-grid" class="gcall-grid"></div><div class="captions" aria-live="polite" hidden></div><div class="call-actions"><button type="button" id="gcall-mic" class="icon-button" aria-label="ปิดไมค์"><svg><use href="#mic"/></svg></button><button type="button" id="gcall-cam" class="icon-button" aria-label="ปิดกล้อง"><svg><use href="#video"/></svg></button>${callBtns}<button type="button" id="gcall-leave" class="hangup" aria-label="ออกจากสาย"><svg><use href="#phone"/></svg></button></div></dialog>
<dialog id="gring-dialog" class="gring" aria-label="สายกลุ่มเรียกเข้า"><span class="eyebrow">สายกลุ่มเรียกเข้า</span><h2 class="gring-title"></h2><p class="gring-sub"></p><div class="row"><button id="gring-decline" type="button" class="ghost">ไม่รับ</button><button id="gring-join" type="button" class="primary">เข้าร่วม</button></div></dialog>
<dialog id="e2e-dialog" class="e2e-dialog" aria-label="การเข้ารหัสต้นทางถึงปลายทาง"><h2>🔒 การเข้ารหัสต้นทางถึงปลายทาง</h2><div class="e2e-body"></div><div class="row"><button type="button" class="ghost" data-close>ปิด</button><button id="e2e-verify" type="button" class="primary">ยืนยันแล้ว</button></div></dialog>
<dialog id="story-compose" class="story-compose" aria-label="สร้างสตอรี่"><form method="dialog"><h2>สตอรี่ใหม่ <small>หายไปใน 24 ชม.</small></h2><div class="story-preview"></div><label class="file-pick">เลือกรูปหรือวิดีโอ<input name="media" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"></label><textarea name="text" maxlength="500" rows="2" placeholder="พิมพ์ข้อความบนสตอรี่ (ไม่บังคับ)" aria-label="ข้อความสตอรี่"></textarea><label class="bg-pick">พื้นหลัง <input name="bg" type="color" value="#000000"></label><div class="row"><button type="button" class="ghost" data-close>ยกเลิก</button><button type="submit" class="primary">แชร์สตอรี่</button></div></form></dialog>
<dialog id="story-viewer" class="story-viewer" aria-label="ดูสตอรี่"><div class="sv-bars"></div><div class="sv-who"></div><button type="button" class="sv-close" aria-label="ปิด">✕</button><div class="sv-stage"></div><button type="button" class="sv-prev" aria-label="ก่อนหน้า"></button><button type="button" class="sv-next" aria-label="ถัดไป"></button><div class="sv-foot"></div></dialog>`);
 const conv=$('#conversations');if(conv&&!$('#stories-bar'))conv.insertAdjacentHTML('beforebegin','<div id="stories-bar" class="stories-bar" role="list" aria-label="สตอรี่"></div>');
 const footer=$('#chat-list .list-footer');if(footer)footer.insertAdjacentHTML('beforebegin','<button id="push-enable" class="push-enable" type="button" hidden>🔔 เปิดการแจ้งเตือนสายเรียกเข้าแม้ปิดแอป</button>');
 const vc=$('#voice-call');if(vc){vc.insertAdjacentHTML('beforebegin','<button id="gcall-join-pill" class="join-pill" type="button" hidden>● เข้าร่วมสายกลุ่ม</button><button id="e2e-lock" class="icon-button e2e-lock" type="button" hidden aria-label="การเข้ารหัส"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></button>');}
 $('#e2e-lock')&&($('#e2e-lock').onclick=C.safe(openSafety));$('#push-enable')&&($('#push-enable').onclick=()=>setupPush(true));
 document.addEventListener('click',e=>{if(e.target.closest('[data-close]')){e.target.closest('dialog')?.close();return;}const b=e.target.closest('[data-x]');if(!b)return;({speakcap:()=>{const on=localStorage.getItem('pure.caption.speak')!=='1';localStorage.setItem('pure.caption.speak',on?'1':'0');document.querySelectorAll('[data-x="speakcap"]').forEach(x=>{x.classList.toggle('active',on);x.setAttribute('aria-pressed',String(on));});C.toast(on?'อ่านคำแปลออกเสียง: เปิด':'อ่านคำแปลออกเสียง: ปิด');},screen:toggleScreen,record:toggleRecord,captions:toggleCaptions})[b.dataset.x]?.();});
 document.addEventListener('change',e=>{if(e.target.matches('.caption-lang')){localStorage.setItem('pure.caption.lang',e.target.value);document.querySelectorAll('.caption-lang').forEach(s=>s.value=e.target.value);socket?.emit('caption:lang',{lang:e.target.value});}});
 document.querySelectorAll('.caption-lang').forEach(s=>s.value=captionLang());
 $('#gcall-leave').onclick=leaveGroup;$('#gcall-dialog').addEventListener('cancel',e=>{e.preventDefault();leaveGroup();});
 $('#gcall-mic').onclick=()=>{const t=G?.stream?.getAudioTracks()[0];if(!t)return;t.enabled=!t.enabled;$('#gcall-mic').classList.toggle('off',!t.enabled);$('#gcall-mic').setAttribute('aria-label',t.enabled?'ปิดไมค์':'เปิดไมค์');socket.emit('gcall:state',{room:G.room,...G.state(),screen:!!extras.screen});};
 $('#gcall-cam').onclick=()=>{const t=G?.stream?.getVideoTracks()[0];if(!t)return;t.enabled=!t.enabled;$('#gcall-cam').classList.toggle('off',!t.enabled);$('#gcall-grid [data-me]')?.classList.toggle('has-video',t.enabled);socket.emit('gcall:state',{room:G.room,...G.state(),screen:!!extras.screen});};
 const sv=$('#story-viewer');sv.querySelector('.sv-close').onclick=()=>sv.close();sv.querySelector('.sv-next').onclick=next;sv.querySelector('.sv-prev').onclick=prev;sv.addEventListener('close',()=>{clearTimeout(viewer?.timer);viewer=null;sv.querySelector('.sv-stage').innerHTML='';renderStoryBar();markAvatarRings();});
 sv.addEventListener('keydown',e=>{if(e.key==='ArrowRight')next();if(e.key==='ArrowLeft')prev();});
 new MutationObserver(()=>{markAvatarRings();updateJoinPill();}).observe($('#conversations')||document.body,{childList:true});
}

/* ---------------- Wiring ---------------- */
let pendingUrl=null;
export const v09={
 init(ctx){C=ctx;buildDom();},
 attach(s,user){socket=s;me=user;e2e.peers.clear();e2e.shared.clear();
  s.on('connect',()=>{loadStories();if(G&&G.stream){/* rejoin after reconnect */s.timeout(8000).emitWithAck('gcall:join',{room:G.room}).then(info=>{if(info.error){C.toast(info.error);leaveGroup();}}).catch(()=>{});}if(pendingUrl){const p=pendingUrl;pendingUrl=null;setTimeout(()=>joinRoom(p),300);}});
  s.on('gcall:ring',onRing);s.on('gcall:joined',({room,user:u})=>{if(G?.room===room){tile(u.id,u.name);$('#gcall-status').textContent='เชื่อมต่อแล้ว';}});
  s.on('gcall:signal',d=>onGSignal(d).catch(()=>{}));s.on('gcall:left',({room,user:u})=>{if(G?.room===room)dropPeer(u);});
  s.on('gcall:ended',({room,reason})=>{for(const [g,r] of rooms)if(r===room)rooms.delete(g);updateJoinPill();if(G?.room===room){if(reason==='joined-elsewhere'){C.toast('เข้าร่วมสายนี้จากอุปกรณ์อื่นแล้ว');}leaveGroup();}});
  s.on('gcall:state',({room,user:uid,mic,cam,screen})=>{if(G?.room!==room)return;const t=$(`#gcall-grid [data-user="${CSS.escape(uid)}"]`);if(!t)return;t.classList.toggle('has-video',cam||screen);t.querySelector('.gtile-state').textContent=(mic?'':'🔇')+(screen?' 🖥':'');});
  s.on('call:recording',({by,active:on})=>{showRecBanner(on?by.name:null,by.id);if(on)C.toast('● '+by.name+' เริ่มบันทึกสาย');});
  s.on('caption',onCaption);
  s.on('call:incoming',d=>nativeCallNotify(d.from?.name,d.video,'/?call='+d.id));
  s.on('e2e:key-changed',({id})=>{e2e.peers.delete(id);e2e.shared.delete(id);if(C.state.peer?.id===id){updateLockButton();C.renderMessages(false);}});
  s.on('stories:changed',()=>loadStories());
  e2eSetup().then(()=>updateLockButton()).catch(e=>console.warn('e2e',e));setupPush(false);
 },
 encryptOutgoing,afterRender,onPeerConnection,iceRestart,onCallEnd,
 groupCall:(gid,video)=>{const r=rooms.get(gid);if(r)joinRoom(r,video);else startGroupCall(gid,video);},
 inGroupCall:()=>!!G,
 urlParams(p){if(p.has('gcall')){const r=p.get('gcall');history.replaceState({},document.title,location.pathname);if(socket?.connected)joinRoom(r);else pendingUrl=r;}},
 _test:{b64u,safetyNumber,aad}
};
