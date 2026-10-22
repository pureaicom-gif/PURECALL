import {setupLocalization} from './localization.js';
import {mountStudio,stopStudio} from './studio.js';
import {plainText} from './plain-text.js';
import {setupTranslation} from './translation.js';
import {createOutbox} from './outbox.js';
import {setupStickers} from './stickers.js';
import {editPhoto} from './photo-editor.js';
import {openSecretary,secretaryActive} from './secretary.js';
import {mountSocial,stopSocial,openPersonal} from './social.js';
import {playSound,mountSounds,soundAccount,setupCallAudio,resetCallAudio,startRingtone,stopRingtone} from './sounds.js';
import {scanFriend} from './qr-scanner.js';
import {mountCompanion,stopCompanion,petMotion,reactPet,speakPetActivity,isPetVoiceEnabled} from './pet-companion.js';
import {drawPetScene} from './pet-renderer.js';
import {PET_SPECIES,speciesName} from './pet-catalog.js';
import {createWorkspace} from './chat-workspace.js';
import {mountNearby} from './nearby.js';
import {mountMarketplace} from './marketplace.js';
const newId=()=>crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=n=>`<svg><use href="#${n}"/></svg>`;
const state={user:null,friends:[],groups:[],groupInvites:[],peer:null,group:null,messages:[],tab:'chats',chatFilter:'direct',pet:null,visit:null,generatedImageFile:null};
let socket,register=false,toastTimer,petFrame,typingTimer,typingLast=0,call=null,readBusy=false;
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4500);}
async function api(path,body,method){const res=await fetch('/api'+path,{signal:AbortSignal.timeout(body instanceof FormData?120000:30000),method:method||(body?'POST':'GET'),headers:body instanceof FormData?{}:body?{'Content-Type':'application/json'}:{},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});const data=await res.json();if(!res.ok)throw Object.assign(new Error(data.error||'เชื่อมต่อไม่สำเร็จ'),{status:res.status});return data;}
const safe=fn=>(...args)=>{try{return Promise.resolve(fn(...args)).catch(e=>toast(e.message));}catch(e){toast(e.message);}};
const initial=u=>(u.name||u.handle||'P').slice(0,1).toUpperCase();
const time=t=>new Date(t).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});

function notifyIncomingMessage(title,text,peerId,groupId){playSound('message').catch(()=>{});
  toast(` ${title}: ${text.slice(0,60)}`);
  try{
    if(window.PureAndroid?.notifyMessage) window.PureAndroid.notifyMessage(title,text,peerId||'',groupId||'');
    else if('Notification' in window&&Notification.permission==='granted') new Notification(title,{body:text,icon:'/logo.svg'});
  }catch(e){}
}

$('#auth-toggle').onclick=()=>{register=!register;$('#name-label').hidden=!register;$('#display-name').required=register;$('#auth-title').textContent=register?'พื้นที่ใหม่ เริ่มที่คุณ':'กลับมาเจอกันอีกแล้ว';$('#auth-sub').textContent=register?'สร้างบัญชี แล้วชวนคนสำคัญมาคุยกัน':'เข้าสู่ระบบ แล้วเริ่มบทสนทนาดี ๆ';$('#auth-submit').textContent=register?'สร้าง PURE ID ':'เข้าสู่ระบบ ';$('#auth-toggle').textContent=register?'มีบัญชีแล้ว? เข้าสู่ระบบ':'ยังไม่มีบัญชี? สร้าง PURE ID';$('#password').autocomplete=register?'new-password':'current-password';$('#auth-error').textContent='';};
$('#auth-form').onsubmit=async e=>{e.preventDefault();$('#auth-submit').disabled=true;$('#auth-error').textContent='';try{const d=await api(register?'/register':'/login',{handle:$('#handle').value,name:$('#display-name').value,password:$('#password').value});$('#password').value='';await enter(d.user);}catch(e){$('#auth-error').textContent=e.message;}finally{$('#auth-submit').disabled=false;}};
const workspace=createWorkspace({state,esc,icon,renderConversations,toast});
const translator=setupTranslation({api,state});
const queuePanel=document.createElement('section');queuePanel.id='outbox-panel';queuePanel.hidden=true;$('#composer').before(queuePanel);
const outbox=createOutbox({id:newId,online:()=>navigator.onLine&&!!socket?.connected,changed:renderOutbox,send:async item=>{const owner=state.user?.id;const d=await api(item.group?'/groups/'+item.target+'/messages':'/messages/'+item.target,{text:item.text,clientId:item.clientId});if(state.user?.id!==owner)return;if((item.group?state.group?.id:state.peer?.id)===item.target&&!state.messages.some(m=>m.id===d.message.id)){state.messages.push(d.message);renderMessages();}}});
function renderOutbox(){const rows=outbox.list().filter(x=>x.target===(state.group?.id||state.peer?.id)&&x.group===!!state.group);queuePanel.hidden=!rows.length;queuePanel.innerHTML=rows.map(x=>'<div class="outbox-row"><span>'+esc(x.text)+'</span><small>'+esc(x.error||'รอส่ง · ส่งอัตโนมัติเมื่อเชื่อมต่อ')+'</small>'+(x.error?'<button type="button" data-retry="'+esc(x.clientId)+'">ลองใหม่</button>':'')+'<button type="button" data-cancel="'+esc(x.clientId)+'">นำออกจากคิว</button></div>').join('');}
queuePanel.onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.retry)outbox.retry(b.dataset.retry);if(b.dataset.cancel)outbox.remove(b.dataset.cancel);};
window.addEventListener('online',()=>outbox.flush());


async function refreshGroups(){try{const data=await api('/groups');state.groups=data.groups;state.groupInvites=data.invites||[];renderConversations();}catch(e){}}

async function enter(user){
  state.user=user;setupLocalization(user);outbox.login(user.id);soundAccount(user.id);workspace.login();$('#auth').hidden=true;$('#app').hidden=false;$('#my-avatar').textContent=initial(user);
  try{if('Notification' in window&&Notification.permission==='default')Notification.requestPermission().catch(()=>{});}catch(e){}
  socket?.disconnect();socket=io();
  socket.on('connect',safe(async()=>{$('#connection-dot').classList.add('connected');outbox.flush();$('#connection-label').textContent='เชื่อมต่อแล้ว';await refreshFriends();await refreshGroups();if(state.peer)await openChat(state.peer);else if(state.group)await openGroup(state.group);checkUrlParams();}));
  socket.on('disconnect',()=>{$('#connection-dot').classList.remove('connected');$('#connection-label').textContent='ขาดการเชื่อมต่อ • กำลังลองใหม่';if(call)finishCall();});
  socket.on('connect_error',()=>{$('#connection-label').textContent='เชื่อมต่อไม่ได้ • ตรวจเซิร์ฟเวอร์/บัญชี';});
  socket.on('friends',safe(async()=>{const prior=new Set(state.friends.filter(f=>f.status==='pending'&&f.incoming).map(f=>f.id));await refreshFriends();for(const f of state.friends.filter(f=>f.status==='pending'&&f.incoming&&!prior.has(f.id))){playSound('message').catch(()=>{});toast('คำขอเป็นเพื่อนใหม่จาก '+f.name);}if(state.peer&&!state.friends.some(f=>f.id===state.peer.id&&f.status==='accepted')){state.peer=null;$('#conversation').hidden=true;$('#chat-empty').hidden=false;$('#app').classList.remove('chat-open');}}));
  socket.on('group:created',safe(async g=>{await refreshGroups();toast('เข้าร่วมกลุ่ม: '+g.name);}));
  socket.on('group:invite',safe(async g=>{await refreshGroups();$('#filter-groups').click();toast('มีคำเชิญเข้ากลุ่มใหม่: '+g.name);}));
  socket.on('group:invite-answered',safe(refreshGroups));
  socket.on('group:updated',safe(async g=>{await refreshGroups();if(state.group?.id===g.id){state.group.name=g.name;peerHeader();}}));
  socket.on('group:role',safe(async g=>{await refreshGroups();if(state.group?.id===g.groupId){Object.assign(state.group,state.groups.find(x=>x.id===g.groupId)||{});peerHeader();}}));
  socket.on('group:removed',safe(async g=>{await refreshGroups();if(state.group?.id===g.id){state.group=null;state.messages=[];$('#app').classList.remove('chat-open');$('#conversation').hidden=true;$('#chat-empty').hidden=false;}}));
  socket.on('group:message',safe(async m=>{
    if(state.group&&state.group.id===m.group_id){
      if(!state.messages.some(x=>x.id===m.id)){state.messages.push(m);renderMessages();}
    }else if(m.sender!==user.id){
      const g=state.groups.find(x=>x.id===m.group_id);
      notifyIncomingMessage((g?g.name:'กลุ่ม')+` · ${m.senderName||'สมาชิก'}`,m.file?'ส่งไฟล์แนบ':m.text,null,m.group_id);
    }
    await refreshGroups();
  }));
  socket.on('group:message-deleted',({id,groupId})=>{if(state.group?.id===groupId){const message=state.messages.find(m=>m.id===id);if(message){message.deleted=true;message.text='';message.file=null;renderMessages(false);}}});
  socket.on('presence',p=>{const f=state.friends.find(f=>f.id===p.id);if(f)f.online=p.online;renderConversations();if(state.peer?.id===p.id){state.peer.online=p.online;peerHeader();}});
  socket.on('message',safe(async m=>{
    if(state.peer&&[m.sender,m.receiver].includes(state.peer.id)){
      if(!state.messages.some(x=>x.id===m.id)){state.messages.push(m);renderMessages();}
      await markRead();
    }else if(m.sender!==user.id){
      const friend=state.friends.find(f=>f.id===m.sender);
      notifyIncomingMessage(friend?friend.name:'ข้อความใหม่',m.file?'ส่งไฟล์แนบ':m.text,m.sender,null);
    }
    await refreshFriends();
  }));
  socket.on('message:deleted',({id})=>{const message=state.messages.find(m=>m.id===id);if(state.peer&&message){message.deleted=true;message.text='';message.file=null;renderMessages(false);}});
  socket.on('typing',({peer,groupId,active=true})=>{if((peer===state.peer?.id||groupId===state.group?.id)&&active){showTyping(state.group?'มีคนกำลังพิมพ์':'กำลังพิมพ์');clearTimeout(typingTimer);typingTimer=setTimeout(()=>showTyping(''),1800);}else if((peer===state.peer?.id||groupId===state.group?.id)&&active===false){clearTimeout(typingTimer);showTyping('');}});
  socket.on('read',({peer,through})=>{if(peer===state.peer?.id){state.messages.forEach(m=>{if(m.sender===user.id&&m.id<=through)m.seen=Date.now();});renderMessages(false);}});
  socket.on('call:incoming',incoming);socket.on('call:accepted',safe(onAccepted));socket.on('call:signal',data=>onSignal(data).catch(e=>{toast(e.message);endCall();}));
  socket.on('announcement',({text,from})=>toast(' ประกาศจาก '+(from||'แอดมิน')+': '+text));
  socket.on('call:end',({id,reason})=>{if(call?.id===id){finishCall();toast(reason==='missed'?'ไม่มีผู้รับสาย':'สิ้นสุดการโทร');}});
  await refreshFriends();await refreshGroups();checkUrlParams();
}

async function refreshFriends(){state.friends=(await api('/friends')).friends;renderConversations();if(state.tab==='friends')renderFriends();}

function renderConversations(){
  workspace.update();const q=$('#chat-search').value.toLowerCase();
  if(state.chatFilter==='groups'){
    const list=state.groups.filter(g=>g.name.toLowerCase().includes(q));
    $('#friend-count').textContent=list.length+(state.groupInvites?.length||0);
    const invites=(state.groupInvites||[]).map(inv=>`<div class="group-invite-card"><div><strong>${esc(inv.name)}</strong><small>${esc(inv.inviter_name)} ชวนคุณเข้ากลุ่ม</small></div><button type="button" class="primary invite-accept" data-invite-accept="${esc(inv.id)}">เข้าร่วม</button><button type="button" class="secondary invite-decline" data-invite-decline="${esc(inv.id)}">ปฏิเสธ</button></div>`).join('');
    const groups=list.map(g=>`<button class="friend-row ${state.group?.id===g.id?'selected':''}" data-group="${esc(g.id)}"><span class="avatar" style="background:#202938;"></span><span class="row-content"><strong>${esc(g.name)}</strong><small style="color:#74c0fc;display:inline;margin-left:4px;">(${g.member_count} คน)</small><p>${esc(g.last_text?(g.last_sender===state.user.id?'คุณ: ':g.last_sender==='pure-ai'?' PURE AI: ':'')+g.last_text:'เริ่มคุยในกลุ่ม')}</p></span><span class="row-meta"><span>${g.last_created?time(g.last_created):''}</span></span></button>`).join('');
    $('#conversations').innerHTML=invites+groups+(invites||groups?'':`<div class="empty-list">${q?'ไม่พบกลุ่ม':'ยังไม่มีกลุ่มแชต<br>กดปุ่ม "+ สร้างกลุ่ม" เพื่อเริ่มกลุ่ม'}</div>`);
    return;
  }
  const list=state.friends.filter(f=>f.status==='accepted'&&workspace.matches(f)&&(f.name.toLowerCase().includes(q)||f.handle.includes(q))).sort((a,b)=>(b.last?.created||0)-(a.last?.created||0));
  $('#friend-count').textContent=list.length;
  $('#conversations').innerHTML=list.length?list.map(f=>`<button class="friend-row ${state.peer?.id===f.id?'selected':''}" data-peer="${esc(f.id)}"><span class="avatar">${esc(initial(f))}</span><span class="row-content"><strong>${esc(f.name)}</strong><p>${esc(f.last?(f.last.sender===state.user.id?'คุณ: ':f.last.sender==='pure-ai'?' PURE AI: ':'')+(f.last.file_id?'ส่งไฟล์แนบ':f.last.text):'เริ่มบทสนทนาใหม่กัน')}</p></span><span class="row-meta"><span>${f.last?time(f.last.created):f.online?'ออนไลน์':''}</span>${f.unread?`<b class="badge">${f.unread}</b>`:''}</span></button>`).join(''):`<div class="empty-list">${q?'ไม่พบบทสนทนา':'ยังไม่มีบทสนทนา<br>เพิ่มเพื่อนด้วย PURE ID เพื่อเริ่มคุย'}</div>`;
}

$('#chat-search').oninput=renderConversations;
$('#filter-direct').onclick=()=>{state.chatFilter='direct';$('#filter-direct').classList.add('active');$('#filter-groups').classList.remove('active');$('#list-label-text').textContent='บทสนทนาทั้งหมด';renderConversations();};
$('#filter-groups').onclick=()=>{state.chatFilter='groups';$('#filter-groups').classList.add('active');$('#filter-direct').classList.remove('active');$('#list-label-text').textContent='กลุ่มทั้งหมด';renderConversations();};
$('#btn-create-group').onclick=()=>openCreateGroupModal();

$('#conversations').onclick=safe(async e=>{
  const accept=e.target.closest('[data-invite-accept]'),decline=e.target.closest('[data-invite-decline]');
  if(accept||decline){const id=(accept||decline).dataset[accept?'inviteAccept':'inviteDecline'];await api('/groups/'+encodeURIComponent(id)+'/invite-response',{accept:!!accept});await refreshGroups();if(accept){toast('เข้าร่วมกลุ่มแล้ว');const group=state.groups.find(g=>g.id===id);if(group)await openGroup(group);}else toast('ปฏิเสธคำเชิญแล้ว');return;}
  const bPeer=e.target.closest('[data-peer]');
  if(bPeer)await openChat(state.friends.find(f=>f.id===bPeer.dataset.peer));
  const bGroup=e.target.closest('[data-group]');
  if(bGroup)await openGroup(state.groups.find(g=>g.id===bGroup.dataset.group));
});

function tab(name){stopStudio();stopSocial();stopCompanion();state.tab=name;cancelAnimationFrame(petFrame);document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));$('#chat-list').hidden=name!=='chats';$('#chat-panel').hidden=name!=='chats';$('#page').hidden=name==='chats';$('#app').classList.remove('chat-open');if(name==='studio')safe(()=>mountStudio({api,esc,state,toast}))();if(name==='timeline')safe(()=>mountSocial({api,esc,state,toast}))();if(name==='market')safe(()=>mountMarketplace({api,esc,state,toast,refreshFriends}))();if(name==='friends')renderFriends();if(name==='pet')safe(()=>loadPet())();if(name==='profile')safe(renderProfile)();}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.tab));for(const id of ['new-chat','empty-add'])$('#'+id).onclick=()=>tab('friends');$('#pet-shortcut').onclick=()=>tab('pet');$('#my-avatar').onclick=()=>tab('profile');$('#back-chat').onclick=()=>{$('#app').classList.remove('chat-open');state.peer=null;state.group=null;};

function peerHeader(){
  if(state.group){
    $('#peer-name').textContent=state.group.name;$('#peer-avatar').textContent='';$('#peer-status').textContent='สมาชิก '+state.group.member_count+' คน • มี PURE AI คอยช่วย';
    $('#voice-call').hidden=true;$('#video-call').hidden=true;$('#visit-peer').hidden=true;
    $('#group-manage').hidden=!['owner','admin'].includes(state.group.role);
    return;
  }
  $('#group-manage').hidden=true;
  $('#voice-call').hidden=false;$('#video-call').hidden=false;$('#visit-peer').hidden=false;
  $('#peer-name').textContent=state.peer.name;$('#peer-avatar').textContent=initial(state.peer);$('#peer-status').textContent=state.peer.online?'ออนไลน์ตอนนี้':'ออฟไลน์';
}

async function openGroup(grp){
  if(!grp)return;state.group=grp;state.peer=null;tab('chats');$('#app').classList.add('chat-open');$('#chat-empty').hidden=true;$('#conversation').hidden=false;$('#ai-quick-bar').hidden=true;peerHeader();$('#typing').textContent='';$('#messages').textContent='กำลังโหลด…';
  const data=await api('/groups/'+grp.id+'/messages');if(state.group?.id!==grp.id)return;state.messages=data.messages;renderMessages();renderConversations();
}

async function openChat(peer){
  if(!peer)return;state.peer=peer;state.group=null;workspace.open();tab('chats');$('#app').classList.add('chat-open');$('#chat-empty').hidden=true;$('#conversation').hidden=false;$('#ai-quick-bar').hidden=true;peerHeader();$('#typing').textContent='';$('#messages').textContent='กำลังโหลด…';
  const data=await api('/messages/'+peer.id);if(state.peer?.id!==peer.id)return;state.messages=data.messages;renderMessages();renderConversations();await markRead();
}

function renderMessages(scroll=true){
  renderOutbox();
  const box=$('#messages'),old=box.scrollTop;
  box.innerHTML=(state.messages.length>=50?'<button class="load-older" id="load-older">โหลดข้อความก่อนหน้า</button>':'')+state.messages.map(m=>{
    const mine=m.sender===state.user.id;
    const isAi=m.isAi||m.sender==='pure-ai';
    let file='';
    if(m.file){
      const url='/api/files/'+encodeURIComponent(m.file.id);
      if(m.file.mime.startsWith('image/')){
        file=`<button type="button" class="media-preview-trigger" data-preview-media="${esc(m.file.id)}" aria-label="ดูภาพ ${esc(m.file.name)}"><img src="${url}" loading="lazy" alt="${esc(m.file.name)}"></button><a class="media-download" href="${url}?download=1" download>ดาวน์โหลดภาพ</a>`;
      }else if(m.file.mime.startsWith('video/')){
        file=`<button type="button" class="media-preview-trigger video-preview-trigger" data-preview-media="${esc(m.file.id)}" aria-label="ดูวิดีโอ ${esc(m.file.name)}"><video src="${url}" muted playsinline preload="metadata"></video><span>เปิดดูวิดีโอ</span></button><a class="media-download" href="${url}?download=1" download>ดาวน์โหลดวิดีโอ</a>`;
      }else if(m.file.mime.startsWith('audio/')){
        file=`<audio src="${url}" controls preload="metadata"></audio>`;
      }else{
        file=`<a class="file-download-card" href="${url}?download=1" target="_blank" rel="noopener"><span></span><span>${esc(m.file.name)} · ${(m.file.size/1024).toFixed(0)} KB</span></a>`;
      }
    }
    const senderName=m.senderName||m.sender_name||(mine?state.user.name:state.peer?.name)||'PURE';
    const senderTag=(state.group&&!mine&&!isAi)?`<span class="group-sender-tag">${esc(senderName)}</span>`:'';
    const seenStatus=mine?(m.seen?'<span class="seen-mark read">✓✓ อ่านแล้ว</span>':'<span class="seen-mark sent">✓ ส่งแล้ว</span>'):'';
    const originalText=`<span class="message-original">${esc(m.text)}</span>`;
    const bubbleContent=m.deleted?'<span class="recalled-message">ยกเลิกข้อความแล้ว</span>':isAi?`<span style="display:block;font-size:10px;font-weight:600;color:#facc15;margin-bottom:4px;"> PURE AI</span>${file}${originalText}`:`${senderTag}${file}${originalText}`;
    const avatar=m.senderAvatar?`<img src="${esc(m.senderAvatar)}" alt="">`:esc((senderName||'P').slice(0,1).toUpperCase());
    return `<article data-message-id="${m.id}" data-file="${!!m.file}" class="message ${mine?'mine':''} ${isAi?'ai-msg':''}"><span class="message-avatar" title="${esc(senderName)}">${avatar}</span><div class="message-content"><div class="bubble ${isAi?'ai-bubble':''}">${bubbleContent}</div><time>${time(m.created)}${seenStatus}${mine&&!m.deleted?` <button type="button" class="message-unsend" data-unsend="${m.id}" aria-label="ยกเลิกข้อความ">ยกเลิก</button>`:''}</time></div></article>`;
  }).join('');
  if(!state.messages.length)box.innerHTML='<div class="empty-list">ทักทายกันสักหน่อย <br><small style="color:#74c0fc;">พิมพ์ @pure ตามด้วยข้อความเพื่อสั่ง AI ได้เลย</small></div>';
  workspace.messages();translator.render();if(scroll)box.scrollTop=box.scrollHeight;else box.scrollTop=old;
  box.querySelectorAll('[data-preview-media]').forEach(button=>button.onclick=()=>{const message=state.messages.find(item=>item.file?.id===button.dataset.previewMedia);if(message)openSharedMedia(message.file);});
  box.querySelectorAll('[data-unsend]').forEach(button=>button.onclick=safe(async()=>{if(!confirm('ยกเลิกข้อความนี้สำหรับทุกคนในห้องแชต?'))return;button.disabled=true;const id=Number(button.dataset.unsend),path=state.group?'/groups/'+encodeURIComponent(state.group.id)+'/messages/'+id:'/messages/'+id;await api(path,null,'DELETE');const message=state.messages.find(m=>m.id===id);if(message){message.deleted=true;message.text='';message.file=null;renderMessages(false);}}));
  $('#load-older')?.addEventListener('click',safe(async()=>{
    const h=box.scrollHeight;
    if(state.peer){
      const d=await api('/messages/'+state.peer.id+'?before='+state.messages[0].id);if(!d.messages.length){$('#load-older').remove();return;}state.messages=[...d.messages,...state.messages];renderMessages(false);box.scrollTop+=box.scrollHeight-h;
    }else if(state.group){
      const d=await api('/groups/'+state.group.id+'/messages?before='+state.messages[0].id);if(!d.messages.length){$('#load-older').remove();return;}state.messages=[...d.messages,...state.messages];renderMessages(false);box.scrollTop+=box.scrollHeight-h;
    }
  }));
}

function showTyping(label){const host=$('#typing');if(!host)return;host.replaceChildren();if(!label)return;const text=document.createElement('span');text.textContent=label;const dots=document.createElement('span');dots.className='typing-dots';dots.setAttribute('aria-hidden','true');for(let i=0;i<3;i++)dots.append(document.createElement('i'));host.append(text,dots);}

function openSharedMedia(file){
  const dialog=$('#media-viewer'),stage=$('#media-viewer-stage'),download=$('#media-viewer-download'),url='/api/files/'+encodeURIComponent(file.id);
  stage.replaceChildren();
  const media=document.createElement(file.mime.startsWith('video/')?'video':'img');media.src=url;media.className='media-viewer-content';media.alt=file.name;
  if(media instanceof HTMLVideoElement){media.controls=true;media.playsInline=true;media.autoplay=true;}
  stage.append(media);download.href=url+'?download=1';download.download=file.name;download.textContent='ดาวน์โหลด';$('#media-viewer-name').textContent=file.name;
  if(!dialog.open)dialog.showModal();
}

async function markRead(){
  if(readBusy||document.hidden||state.tab!=='chats'||!state.peer||!state.messages.length)return;
  const unread=state.messages.filter(m=>m.sender===state.peer.id&&!m.seen);if(!unread.length)return;
  readBusy=true;try{await api('/messages/'+state.peer.id+'/read',{through:state.messages.at(-1).id});unread.forEach(m=>m.seen=Date.now());const f=state.friends.find(f=>f.id===state.peer.id);if(f)f.unread=0;renderConversations();}finally{readBusy=false;}
}
document.addEventListener('visibilitychange',safe(markRead));
let pendingSend=null;

$('#composer').onsubmit=safe(async e=>{
 e.preventDefault();const input=$('#message-input'),text=input.value.trim(),group=state.group?.id,peer=state.peer?.id;if(!text||(!peer&&!group))return;if(text.length>5000)return toast('ข้อความไม่เกิน 5,000 ตัวอักษร');
 outbox.enqueue({target:group||peer,group:!!group,text});input.value='';if(peer)workspace.sent(peer,text);
});

$('#message-input').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('#composer').requestSubmit();}};
$('#message-input').oninput=()=>{
  const peer=state.peer?.id,groupId=state.group?.id,active=!!$('#message-input').value.trim();if((peer||groupId)&&Date.now()-typingLast>700){socket.emit('typing',{...(peer?{peer}:{groupId}),active});typingLast=Date.now();}
};

$('#attach').onclick=()=>$('#file-input').click();
async function enhancePhoto(file){const form=new FormData();form.append('image',file);form.append('operation','enhance');const d=await api('/ai/photo',form);const bytes=Uint8Array.from(atob(d.image.data),c=>c.charCodeAt(0));return new File([bytes],'pure-ai-photo.'+(d.image.mime==='image/png'?'png':'jpg'),{type:d.image.mime});}
$('#file-input').onchange=safe(async()=>{
  let file=$('#file-input').files[0];if(!file||(!state.peer&&!state.group))return;
  const group=state.group?.id,peer=state.peer?.id,user=state.user.id;
  if(file.size>25*1024*1024){$('#file-input').value='';return toast('ไฟล์ใหญ่เกิน 25 MB');}
  $('#attach').disabled=true;
  try{
    if(['image/jpeg','image/png','image/webp'].includes(file.type)){file=await editPhoto(file,{enhance:enhancePhoto});if(!file)return;}
    if(state.user.id!==user)return;toast('กำลังส่งไฟล์…');const form=new FormData();form.append('file',file);
    const d=await api(group?'/groups/'+group+'/files':'/files/'+peer,form);
    await api(group?'/groups/'+group+'/messages':'/messages/'+peer,{fileId:d.file.id,clientId:newId()});toast('ส่งไฟล์แล้ว');
  }finally{$('#attach').disabled=false;$('#file-input').value='';}
});
setupStickers({api,state,toast,onSent:message=>{const active=message.group_id?state.group?.id===message.group_id:state.peer?.id===message.receiver||state.peer?.id===message.sender;if(active&&!state.messages.some(item=>item.id===message.id)){state.messages.push(message);renderMessages();}}});

function renderFriends(){queueMicrotask(()=>mountNearby({api,esc,state,toast,refreshFriends}));const accepted=state.friends.filter(f=>f.status==='accepted'),pending=state.friends.filter(f=>f.status==='pending');const isAdmin=state.user.role==='admin'||state.user.isAdmin;$('#page').innerHTML=`<header class="page-header"><div><p class="eyebrow">MAKE YOUR CIRCLE A LITTLE BIGGER</p><h1>คนของคุณ<span class="tiny-dot">.</span></h1><p class="muted">ความสัมพันธ์ดี ๆ เริ่มจากคำทักทาย</p></div></header><form id="find-friend" class="search-form"><input id="friend-query" placeholder="ค้นหา PURE ID หรือชื่อ" minlength="1" maxlength="24" required><button class="primary">ค้นหา </button></form><div id="search-results"></div><section class="friend-recommendations"><h2>เพื่อนที่คุณอาจรู้จัก</h2><div id="friend-suggestions" class="friend-suggestions">กำลังหาเพื่อนที่อาจรู้จัก…</div></section><p class="section-label">คำขอเป็นเพื่อน · ${pending.length}</p><div>${pending.map(f=>friendCard(f,f.incoming?`<button class="primary" data-accept="${f.id}">รับ</button><button class="secondary" data-reject="${f.id}">ปฏิเสธ</button>`:'<small>รอตอบรับ</small>')).join('')||'<p class="muted">ไม่มีคำขอใหม่</p>'}</div><p class="section-label">เพื่อนทั้งหมด · ${accepted.length}</p>${accepted.map(f=>friendCard(f,`<button class="secondary" data-visit="${f.id}" aria-label="เยี่ยมสัตว์เลี้ยง">ฅ</button><button class="icon-button" data-call-voice="${f.id}" title="โทรเสียง" aria-label="โทรเสียง"><svg style="width:16px;height:16px;"><use href="#phone"/></svg></button><button class="primary" data-chat="${f.id}">แชต</button><button class="icon-button" data-block="${f.id}" aria-label="บล็อก">×</button>`)).join('')||'<div class="card muted">แชร์ PURE ID ของคุณ <b>@'+esc(state.user.handle)+'</b> ให้เพื่อน แล้วเริ่มเพิ่มเพื่อนกัน</div>'}`;workspace.friends();api('/friend-suggestions').then(d=>{const box=$('#friend-suggestions');if(!box)return;box.innerHTML=d.users.map(u=>friendCard(u,`<small>${u.mutualFriends?`เพื่อนร่วมกัน ${u.mutualFriends} คน`:'สมาชิก PURE'}</small><button class="primary" data-add="${u.id}">เพิ่มเพื่อน</button>`)).join('')||'<p class="muted">ตอนนี้ยังไม่มีคำแนะนำ ลองค้นหา PURE ID ของเพื่อนดูนะ</p>';}).catch(()=>{$('#friend-suggestions').textContent='โหลดคำแนะนำไม่สำเร็จ';});$('#find-friend').onsubmit=safe(async e=>{e.preventDefault();const q=$('#friend-query').value.trim();if(!q)return;const data=await api('/users?q='+encodeURIComponent(q));$('#search-results').innerHTML=data.users.map(f=>{const isFriend=state.friends.some(x=>x.id===f.id&&x.status==='accepted');const isPending=state.friends.some(x=>x.id===f.id&&x.status==='pending');let actions='';if(isAdmin){actions=`<button class="icon-button" data-call-voice="${f.id}" title="โทรเสียง"><svg style="width:16px;height:16px;"><use href="#phone"/></svg></button><button class="primary" data-direct-chat="${f.id}">แชต</button>`+(!isFriend?`<button class="secondary" data-add="${f.id}">แอดเพื่อน</button>`:'');}else if(isFriend){actions=`<button class="icon-button" data-call-voice="${f.id}" title="โทรเสียง"><svg style="width:16px;height:16px;"><use href="#phone"/></svg></button><button class="primary" data-chat="${f.id}">แชต</button>`;}else if(isPending){actions='<small>รอตอบรับ</small>';}else{actions=`<button class="primary" data-add="${f.id}">เพิ่มเพื่อน +</button>`;}return friendCard(f,actions);}).join('')||'<p class="muted">ไม่พบผู้ใช้นี้</p>';});}
function friendCard(f,actions){return `<div class="friend-card"><div class="avatar">${esc(initial(f))}</div><div class="details"><strong>${esc(f.name)}</strong><small>@${esc(f.handle)}${f.online?' · ออนไลน์':''}</small></div>${actions}</div>`;}
$('#page').addEventListener('click',safe(async e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset;if(d.add){await api('/friends',{id:d.add});toast(state.user.role==='admin'||state.user.isAdmin?'เพิ่มเพื่อนสำเร็จแล้ว':'ส่งคำขอแล้ว');await refreshFriends();}if(d.directChat){let f=state.friends.find(x=>x.id===d.directChat);if(!f){const dres=await api('/profiles/'+encodeURIComponent(d.directChat));f=dres.profile;}if(f)await openChat(f);}if(d.callVoice){let f=state.friends.find(x=>x.id===d.callVoice);if(!f){const dres=await api('/profiles/'+encodeURIComponent(d.callVoice));f=dres.profile;}if(f){state.peer=f;peerHeader();startCall(false);}}if(d.accept||d.reject){await api('/friends/'+(d.accept||d.reject)+'/respond',{accept:!!d.accept});await refreshFriends();}if(d.chat)await openChat(state.friends.find(f=>f.id===d.chat));if(d.block&&confirm('บล็อกเพื่อนคนนี้? จะไม่สามารถส่งข้อความหรือโทรหากันได้')){await api('/block/'+d.block,{});await refreshFriends();}if(d.visit){tab('pet');await loadPet(d.visit);}if(d.action){b.disabled=true;try{const result=await api('/pet/action',{action:d.action});state.pet=result.pet;renderPet();reactPet(({feed:'eat',play:'dance',wash:'wash',sleep:'sleep',decorate:'wave'})[d.action]);speakPetActivity(d.action,state.pet);toast(({feed:'อิ่มแล้ว ขอบคุณนะ ♡',play:'เล่นด้วยกันแล้วมีความสุข +8 เหรียญ',wash:'สะอาด หอม พร้อมกอด',sleep:'เติมพลังให้น้องแล้ว',decorate:'ต้นไม้ใหม่ของเรา'})[d.action]);}finally{b.disabled=false;}}if(d.homepet)await loadPet();}));
async function loadPet(peer){const data=await api('/pet'+(peer?'/'+peer:''));if(state.tab!=='pet')return;state.pet=data.pet;state.visit=data.owner||null;renderPet();}
function renderPet(){cancelAnimationFrame(petFrame);const p=state.pet,v=state.visit;$('#page').innerHTML=`<header class="page-header"><div><p class="eyebrow">YOUR LITTLE HAPPY PLACE</p><h1>${v?'ห้องของ '+esc(v.name):'โลกใบเล็กของเรา'}<span class="tiny-dot">.</span></h1><p class="muted">${v?'แวะมาทักทายเพื่อนตัวน้อย':'อีกหนึ่งความสุขที่รอคุณกลับมา'}</p></div>${v?'<button class="secondary" data-homepet="1">กลับห้องฉัน</button>':`<span class="secondary">◈ ${p.coins} เหรียญ</span>`}</header><div class="pet-layout"><div><div class="pet-stage"><span class="pet-stage-label">${v?'VISITING':'HOME SWEET HOME'}</span><canvas id="pet-canvas" width="420" height="380" aria-label="สัตว์เลี้ยง 2D ในห้องส่วนตัว"></canvas><div class="pet-stage-bottom"><div><strong>${esc(p.name)}</strong><small>${speciesName(p.kind)} · เพื่อนคนโปรดของคุณ</small></div><span>LV. ${p.level}</span></div></div>${!v?`<div class="pet-actions"><button class="pet-action" data-action="feed"><b>♧</b>ให้อาหาร<small>−10 เหรียญ</small></button><button class="pet-action" data-action="play"><b>◉</b>เล่นด้วยกัน<small>+8 เหรียญ</small></button><button class="pet-action" data-action="wash"><b></b>อาบน้ำ<small>สะอาด +30</small></button><button class="pet-action" data-action="sleep"><b>☾</b>นอนพัก<small>พลังงาน +25</small></button></div>`:''}</div><div><div class="card"><h3>วันนี้น้องเป็นยังไงบ้าง</h3>${[['food','ความอิ่ม'],['joy','ความสุข'],['clean','ความสะอาด'],['energy','พลังงาน']].map(([key,label])=>`<div class="stat"><div class="stat-label"><span>${label}</span><span>${Math.round(p[key])} / 100</span></div><progress max="100" value="${p[key]}" aria-label="${label}"></progress></div>`).join('')}<small>EXP ${p.xp} · ดูแลน้องเพื่อเติบโตไปด้วยกัน</small></div><div class="card"><p class="eyebrow">A ROOM WITH PERSONALITY</p><h3>เพิ่มความสดชื่นให้ห้อง</h3><p class="muted">ต้นไม้เล็ก ๆ สำหรับโลกใบเล็กของเรา</p>${!v?`<button class="secondary" data-action="decorate" ${p.decor?'disabled':''}>${p.decor?'มีต้นไม้ในห้องแล้ว ✓':'ซื้อต้นไม้ · 80 เหรียญ'}</button>`:'<small>ของแต่งห้องของเพื่อน</small>'}</div><p class="muted">สถานะและเหรียญบันทึกบนเซิร์ฟเวอร์<br>ทำกิจกรรมได้ทุก 3 วินาที</p></div></div>`;animatePet();mountCompanion({api,esc,state,toast,renderPet,isCalling:()=>!!call});}
function animatePet(){const canvas=$('#pet-canvas');if(!canvas)return;const c=canvas.getContext('2d');function draw(t){if(!canvas.isConnected)return;drawPetScene(c,state.pet,t,petMotion);petFrame=requestAnimationFrame(draw);}petFrame=requestAnimationFrame(draw);}
async function renderProfile(){
  const [ai,p]=await Promise.all([api('/ai/models'),api('/pet')]);if(state.tab!=='profile')return;
  const isAdmin=state.user.role==='admin'||state.user.isAdmin;
  $('#page').innerHTML=`<header class="page-header"><div><p class="eyebrow">MAKE YOURSELF AT HOME</p><h1>พื้นที่ของคุณ<span class="tiny-dot">.</span></h1></div></header><div class="profile-grid"><div><div class="card"><div class="avatar">${esc(initial(state.user))}</div><h2>${esc(state.user.name)}${isAdmin?' <span class="role-badge admin"> แอดมิน</span>':''}</h2><p class="profile-id">@${esc(state.user.handle)}</p><p class="muted">ส่ง PURE ID หรือ QR Code ให้เพื่อนเพื่อเพิ่มคุณ</p><div style="display:flex;gap:8px;margin-top:10px;"><button id="copy-id" class="secondary" style="flex:1;">คัดลอก PURE ID</button><button id="profile-show-qr" class="primary" style="flex:1;"><svg style="width:16px;height:16px;vertical-align:middle;margin-right:4px;"><use href="#qr"/></svg>QR ของฉัน</button></div></div><div class="card"><h3>ตั้งชื่อเพื่อนตัวน้อย</h3><form id="pet-settings"><label>ชื่อสัตว์เลี้ยง</label><input id="pet-name" value="${esc(p.pet.name)}" maxlength="24" required><label>สัตว์เลี้ยง</label><select id="pet-kind">${PET_SPECIES.map(s=>`<option value="${s.id}" ${p.pet.kind===s.id?'selected':''}>${s.symbol} ${s.name}</option>`).join('')}</select><br><br><button class="primary">บันทึก</button></form></div><div class="card"><h3> เปลี่ยนรหัสผ่าน</h3><form id="change-pwd-form"><label>รหัสผ่านปัจจุบัน</label><input id="cur-pwd" type="password" required autocomplete="current-password"><label>รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)</label><input id="new-pwd" type="password" minlength="8" maxlength="128" required autocomplete="new-password"><label>ยืนยันรหัสผ่านใหม่</label><input id="confirm-pwd" type="password" minlength="8" maxlength="128" required autocomplete="new-password"><p class="muted">หลังเปลี่ยนสำเร็จ ระบบจะออกจากระบบบนอุปกรณ์อื่นเพื่อความปลอดภัย</p><br><br><button class="secondary" style="width:100%;">บันทึกรหัสผ่านใหม่</button></form></div><button id="logout" class="secondary">ออกจากระบบทุกอุปกรณ์</button></div><div>${isAdmin?`<div class="card admin-card"><div style="display:flex;justify-content:space-between;align-items:center;"><h3> แผงควบคุมผู้ดูแลระบบ (Admin)</h3><div><button id="admin-popout" class="btn-gold btn-sm" style="margin-right:6px;"> หน้าต่างแยก </button><button id="admin-rescan" class="secondary" style="font-size:11px;padding:6px 12px;"> สแกน AI</button></div></div><div id="admin-stats-container"><small class="muted">กำลังโหลดข้อมูลระบบ...</small></div></div>`:''}<div class="card"><h3><svg style="width:18px;height:18px;vertical-align:middle;margin-right:6px;"><use href="#pure-p"/></svg> PURE AI อัจฉริยะ</h3><p class="muted">${ai.configured?'พร้อมใช้งาน':'กำลังปรับปรุงระบบ'}</p><p class="muted" style="margin-top:10px;">ใช้งานได้ทันทีในทุกห้องแชต เพียงพิมพ์ @pure หรือแตะปุ่ม PURE AI</p><br><button id="profile-ai" class="secondary">เปิดผู้ช่วย AI</button></div><div class="card"><h3>${icon('wifi')} ใกล้กัน แม้ไม่มีอินเทอร์เน็ต</h3><p class="muted">ใน APK กดเมนู “ออฟไลน์” เพื่อคุยผ่าน Wi-Fi / ฮอตสปอต หรือ Bluetooth กับเครื่องที่ติดตั้ง PURE เหมือนกัน</p><small>โหมดออฟไลน์รองรับข้อความตัวต่อตัว แยกจากประวัติแชตบนเซิร์ฟเวอร์</small></div><div class="card"><h3>เกี่ยวกับ PURE 0.8.0</h3><p class="muted">รองรับแชตกลุ่ม, PURE AI ในแชต (@pure), สัตว์เลี้ยงพูดได้, สลับลำโพง/หูฟัง, ไทม์ไลน์ Reel และสแกน QR แอดเพื่อน</p></div></div></div>`;
  mountSounds({state,toast});const accountCard=document.createElement('div');accountCard.className='card';accountCard.innerHTML='<h3>ปรับแต่งบัญชี</h3><form id="account-profile"><label>ชื่อที่แสดง<input id="account-name" maxlength="40" required></label><label>PURE ID<input id="account-handle" minlength="3" maxlength="24" pattern="[a-zA-Z0-9_]+" required></label><button class="secondary">บันทึกบัญชี</button></form><button id="my-timeline" class="text-button">เปิดโปรไฟล์และ Bio ของฉัน </button>';document.querySelector('.profile-grid>div').prepend(accountCard);$('#account-name').value=state.user.name;$('#account-handle').value=state.user.handle;$('#account-handle').disabled=state.user.role!=='admin';$('#account-profile').onsubmit=safe(async e=>{e.preventDefault();const d=await api('/account/profile',{name:$('#account-name').value,handle:$('#account-handle').value});state.user=d.user;$('#my-avatar').textContent=initial(state.user);toast('บันทึกบัญชีแล้ว');renderProfile();});$('#my-timeline').onclick=()=>openPersonal(state.user.id,{api,esc,state,toast});$('#copy-id').onclick=safe(async()=>{await navigator.clipboard.writeText(state.user.handle);toast('คัดลอก PURE ID แล้ว');});
  $('#profile-show-qr').onclick=()=>showMyQr();
  $('#logout').onclick=safe(async()=>{await api('/logout',{});outbox.logout();socket.disconnect();location.reload();});
  $('#pet-settings').onsubmit=safe(async e=>{e.preventDefault();await api('/pet',{name:$('#pet-name').value,kind:$('#pet-kind').value});toast('บันทึกแล้ว');});
  $('#change-pwd-form').onsubmit=safe(async e=>{e.preventDefault();const cur=$('#cur-pwd').value,nw=$('#new-pwd').value;if(nw!==$('#confirm-pwd').value){toast('รหัสผ่านใหม่และช่องยืนยันไม่ตรงกัน');$('#confirm-pwd').focus();return;}const button=$('#change-pwd-form button');button.disabled=true;try{await api('/password',{currentPassword:cur,newPassword:nw});toast('เปลี่ยนรหัสผ่านแล้ว อุปกรณ์อื่นถูกออกจากระบบ');setTimeout(()=>location.reload(),900);}finally{button.disabled=false;}});
  if(isAdmin){safe(async()=>{const data=await api('/admin/overview');const el=$('#admin-stats-container');if(!el)return;el.innerHTML=`<div class="admin-stat-grid"><div class="admin-stat-box"><strong>${data.stats.users}</strong><small>ผู้ใช้ทั้งหมด</small></div><div class="admin-stat-box"><strong>${data.stats.online}</strong><small>ออนไลน์ขณะนี้</small></div><div class="admin-stat-box"><strong>${data.stats.messages}</strong><small>ข้อความทั้งหมด</small></div><div class="admin-stat-box"><strong>${data.stats.files}</strong><small>ไฟล์ในระบบ</small></div></div><p class="muted" style="margin:8px 0;font-size:11px;">เซิร์ฟเวอร์รัน: ${Math.floor(data.server.uptime/60)} นาที | RAM: ${data.server.memory} MB | Node: ${data.server.node}</p><div style="max-height:220px;overflow:auto;margin-top:10px;"><table class="admin-users-table"><thead><tr><th>ID</th><th>ชื่อ</th><th>สิทธิ์</th><th>สร้างเมื่อ</th></tr></thead><tbody>${data.users.map(u=>`<tr><td>@${esc(u.handle)}</td><td>${esc(u.name)}</td><td>${u.role==='admin'?'<span class="role-badge admin">แอดมิน</span>':'<span class="admin-badge-user">ผู้ใช้</span>'}</td><td><small>${new Date(u.created).toLocaleDateString('th-TH')}</small></td></tr>`).join('')}</tbody></table></div>`;const popout=$('#admin-popout');if(popout)popout.onclick=()=>{window.open('/admin','PureAdminWindow','width=1150,height=850,resizable=yes,scrollbars=yes');};const btn=$('#admin-rescan');if(btn)btn.onclick=safe(async()=>{btn.disabled=true;try{await api('/admin/ai/scan');toast('สแกนโมเดล AI เรียบร้อยแล้ว');renderProfile();}finally{btn.disabled=false;}});})();}
  $('#profile-ai').onclick=()=>openAssistant();
}

$('#visit-peer').onclick=()=>{const id=state.peer?.id;tab('pet');safe(()=>loadPet(id))();};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$('#'+b.dataset.close).close());

// AI In-Chat Quick Bar
$('#ai-open').onclick=()=>{
  const bar=$('#ai-quick-bar');
  bar.hidden=!bar.hidden;
};
$('#ai-quick-close').onclick=()=>{$('#ai-quick-bar').hidden=true;};

function selectAiTab(tabName){
  $('#tab-ai-draft').classList.toggle('active',tabName==='draft');
  $('#tab-ai-image').classList.toggle('active',tabName==='image');
  $('#tab-ai-ask').classList.toggle('active',tabName==='ask');
  $('#pane-ai-draft').hidden=tabName!=='draft';
  $('#pane-ai-image').hidden=tabName!=='image';
  $('#pane-ai-ask').hidden=tabName!=='ask';
}
$('#tab-ai-draft').onclick=()=>selectAiTab('draft');
$('#tab-ai-image').onclick=()=>selectAiTab('image');
$('#tab-ai-ask').onclick=()=>selectAiTab('ask');
$('#tab-ai-summary').onclick=()=>{const input=$('#message-input');$('#ai-quick-bar').hidden=true;input.value='@pure สรุปแชตล่าสุด';input.focus();};

// Draft logic
document.querySelectorAll('.ai-chip').forEach(b=>{
  b.onclick=()=>{
    const txt=b.dataset.draft;
    $('#ai-draft-text').textContent=txt;
    $('#ai-draft-preview').hidden=false;
  };
});
$('#btn-ai-draft-go').onclick=safe(async()=>{
  const p=$('#ai-draft-prompt').value.trim();if(!p)return;
  $('#btn-ai-draft-go').disabled=true;$('#ai-draft-text').textContent='กำลังช่วยคิด...';$('#ai-draft-preview').hidden=false;
  try{
    const d=await api('/assistant',{prompt:p});
    $('#ai-draft-text').textContent=d.text;
  }finally{$('#btn-ai-draft-go').disabled=false;}
});
$('#btn-ai-insert').onclick=()=>{
  $('#message-input').value=$('#ai-draft-text').textContent;
  $('#ai-quick-bar').hidden=true;
  $('#message-input').focus();
};
$('#btn-ai-send-direct').onclick=safe(async()=>{
  const txt=$('#ai-draft-text').textContent;if(!txt)return;
  $('#ai-quick-bar').hidden=true;
  if(state.group){
    await api('/groups/'+state.group.id+'/messages',{text:txt,clientId:newId()});
    await refreshGroups();
  }else if(state.peer){
    await api('/messages/'+state.peer.id,{text:txt,clientId:newId()});
    await refreshFriends();
  }
});

// Image logic
let activeImageStyle='anime';
document.querySelectorAll('.ai-style-chip').forEach(b=>{
  b.onclick=()=>{
    document.querySelectorAll('.ai-style-chip').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    activeImageStyle=b.dataset.style;
  };
});
$('#btn-ai-image-go').onclick=safe(async()=>{
  const prompt=$('#ai-image-prompt').value.trim();if(!prompt)return toast('พิมพ์คำอธิบายภาพที่ต้องการ');
  $('#btn-ai-image-go').disabled=true;
  $('#ai-image-preview').hidden=false;
  $('#ai-image-loading').style.display='block';
  $('#ai-image-loading').textContent=' กำลังสร้างรูปภาพด้วย AI สักครู่...';
  $('#ai-image-result').style.display='none';
  $('#ai-image-actions').style.display='none';
  try{
    const d=await api('/ai/image',{prompt,style:activeImageStyle,peer:state.peer?.id,groupId:state.group?.id});
    state.generatedImageFile=d.file;
    $('#ai-image-loading').style.display='none';
    $('#ai-image-result').src=d.file.url;
    $('#ai-image-result').style.display='block';
    $('#ai-image-actions').style.display='flex';
  }catch(e){
    $('#ai-image-loading').textContent='สร้างรูปภาพไม่สำเร็จ: '+e.message;
  }finally{$('#btn-ai-image-go').disabled=false;}
});
$('#btn-ai-send-image').onclick=safe(async()=>{
  if(!state.generatedImageFile)return;
  const fileId=state.generatedImageFile.id;
  $('#ai-quick-bar').hidden=true;
  if(state.group){
    await api('/groups/'+state.group.id+'/messages',{fileId,clientId:newId()});
    await refreshGroups();
  }else if(state.peer){
    await api('/messages/'+state.peer.id,{fileId,clientId:newId()});
    await refreshFriends();
  }
  toast('ส่งรูปภาพเข้าแชตเรียบร้อย ');
});

// Ask logic
$('#btn-ai-ask-go').onclick=safe(async()=>{
  const p=$('#ai-ask-prompt').value.trim();if(!p)return;
  $('#btn-ai-ask-go').disabled=true;$('#ai-ask-text').textContent='กำลังหาข้อมูล...';$('#ai-ask-preview').hidden=false;
  try{
    const d=await api('/assistant',{prompt:p});
    $('#ai-ask-text').textContent=d.text;
  }finally{$('#btn-ai-ask-go').disabled=false;}
});
$('#btn-ai-ask-insert').onclick=()=>{
  $('#message-input').value=$('#ai-ask-text').textContent;
  $('#ai-quick-bar').hidden=true;
  $('#message-input').focus();
};
$('#btn-ai-ask-send').onclick=safe(async()=>{
  const txt=$('#ai-ask-text').textContent;if(!txt)return;
  $('#ai-quick-bar').hidden=true;
  if(state.group){
    await api('/groups/'+state.group.id+'/messages',{text:txt,clientId:newId()});
    await refreshGroups();
  }else if(state.peer){
    await api('/messages/'+state.peer.id,{text:txt,clientId:newId()});
    await refreshFriends();
  }
});

// QR Code Modal & Functions
function showMyQr(){
  if(!state.user)return;
  $('#my-qr-name').textContent=state.user.name;
  $('#my-qr-handle').textContent='@'+state.user.handle;
  $('#my-qr-box').innerHTML='<img src="/api/qr" width="240" height="240" alt="QR Code ของคุณ">';
  $('#qr-dialog').showModal();
}
$('#open-my-qr').onclick=()=>showMyQr();
$('#empty-qr').onclick=()=>showMyQr();
$('#copy-friend-link').onclick=safe(async()=>{
  await navigator.clipboard.writeText(location.origin+'/?add='+state.user.handle);
  toast('คัดลอกลิงก์แอดเพื่อนเรียบร้อย ✓');
});
$('#btn-scan-camera').onclick=()=>{$('#qr-dialog').close();scanFriend(checkAndConfirmFriend,toast);};

let pendingAddUser=null;
async function checkAndConfirmFriend(handle){
  try{
    const clean=handle.replace('@','').trim();if(!clean)return;
    const d=await api('/users?q='+encodeURIComponent(clean));
    const target=d.users.find(u=>u.handle.toLowerCase()===clean.toLowerCase());
    if(!target) return toast('ไม่พบผู้ใช้ @'+clean);
    pendingAddUser=target;
    $('#confirm-avatar').textContent=initial(target);
    $('#confirm-name').textContent=target.name;
    $('#confirm-handle').textContent='@'+target.handle;
    $('#add-friend-confirm-dialog').showModal();
  }catch(e){toast(e.message);}
}
$('#btn-do-add-friend').onclick=safe(async()=>{
  if(!pendingAddUser)return;
  await api('/friends',{id:pendingAddUser.id});
  $('#add-friend-confirm-dialog').close();
  toast('ส่งคำขอเพิ่มเป็นเพื่อนแล้ว! ');
  await refreshFriends();
});

function checkUrlParams(){
  try{
    const p=new URLSearchParams(location.search);
    if(p.has('add')){
      const handle=p.get('add');
      checkAndConfirmFriend(handle);
      window.history.replaceState({},document.title,location.pathname);
    }
  }catch(e){}
}
window.addEventListener('pure-add-friend',e=>{
  if(e.detail?.handle) checkAndConfirmFriend(e.detail.handle);
});
window.addEventListener('pure-open-peer',safe(async e=>{
  const peerId=e.detail?.peerId;if(!peerId)return;
  const p=state.friends.find(f=>f.id===peerId);
  if(p)await openChat(p);
}));
window.addEventListener('pure-open-group',safe(async e=>{
  const groupId=e.detail?.groupId;if(!groupId)return;
  const g=state.groups.find(x=>x.id===groupId);
  if(g)await openGroup(g);
}));

// Group Creation Modal
function openCreateGroupModal(){
  const accepted=state.friends.filter(f=>f.status==='accepted');
  const box=$('#group-friend-select');
  box.innerHTML=accepted.length?accepted.map(f=>`
    <label style="display:flex;align-items:center;gap:10px;padding:6px;cursor:pointer;border-bottom:1px solid #232730;">
      <input type="checkbox" name="group-member" value="${esc(f.id)}" style="width:16px;height:16px;">
      <span class="avatar" style="width:28px;height:28px;font-size:12px;">${esc(initial(f))}</span>
      <span style="font-size:12px;">${esc(f.name)} <small class="muted">@${esc(f.handle)}</small></span>
    </label>
  `).join(''):'<p class="muted" style="padding:10px;font-size:11px;">ยังไม่มีเพื่อนที่ยอมรับคำขอ</p>';
  $('#new-group-name').value='';
  $('#group-dialog').showModal();
}
$('#create-group-form').onsubmit=safe(async e=>{
  e.preventDefault();
  const name=$('#new-group-name').value.trim();if(!name)return;
  const checked=[...document.querySelectorAll('input[name="group-member"]:checked')].map(c=>c.value);
  if(!checked.length) return toast('กรุณาเลือกเพื่อนอย่างน้อย 1 คน');
  $('#create-group-submit').disabled=true;
  try{
    const d=await api('/groups',{name,memberIds:checked});
    $('#group-dialog').close();
  toast('สร้างกลุ่มแล้ว · ส่งคำเชิญ '+d.invited+' คน');
    await refreshGroups();
    const newGrp=state.groups.find(g=>g.id===d.group.id)||d.group;
    await openGroup(newGrp);
  }finally{$('#create-group-submit').disabled=false;}
});

async function openGroupManager(){
  const current=state.group;if(!current||!['owner','admin'].includes(current.role))return;
  const {group}=await api('/groups/'+encodeURIComponent(current.id));
  $('#group-rename').value=group.name;
  const memberList=$('#group-member-list');
  memberList.innerHTML=group.members.map(member=>`<div class="group-member-item"><span class="group-member-name"><strong>${esc(member.name)}</strong><small>@${esc(member.handle)} · ${member.role==='owner'?'เจ้าของ':member.role==='admin'?'ผู้ดูแล':'สมาชิก'}</small></span>${group.userRole==='owner'&&member.role!=='owner'?`<select data-member-role="${esc(member.id)}" aria-label="สิทธิ์ ${esc(member.name)}"><option value="member" ${member.role==='member'?'selected':''}>สมาชิก</option><option value="admin" ${member.role==='admin'?'selected':''}>ผู้ดูแล</option></select>`:''}${member.role!=='owner'&&(group.userRole==='owner'||(group.userRole==='admin'&&member.role==='member'))?`<button type="button" class="text-button" data-member-remove="${esc(member.id)}">นำออก</button>`:''}</div>`).join('');
  const pending=$('#group-pending-invites');pending.innerHTML=group.invites?.length?'<h3>รอเพื่อนตอบรับ</h3>'+group.invites.map(inv=>`<p class="muted group-pending-invite">${esc(inv.name)} · @${esc(inv.handle)}</p>`).join(''):'';
  const memberIds=new Set([...group.members.map(m=>m.id),...(group.invites||[]).map(m=>m.id)]);
  const eligible=state.friends.filter(friend=>friend.status==='accepted'&&!memberIds.has(friend.id));
  $('#group-add-list').innerHTML=eligible.length?eligible.map(friend=>`<label class="group-add-friend"><input type="checkbox" value="${esc(friend.id)}"><span>${esc(friend.name)} <small>@${esc(friend.handle)}</small></span></label>`).join(''):'<p class="muted">ไม่มีเพื่อนที่เพิ่มได้ในตอนนี้</p>';
  $('#group-add-submit').disabled=!eligible.length;$('#group-add-submit').textContent='ส่งคำเชิญให้เพื่อนที่เลือก';
  if(!$('#group-management-dialog').open)$('#group-management-dialog').showModal();
}
$('#group-manage').onclick=safe(openGroupManager);
$('#group-rename-form').onsubmit=safe(async e=>{e.preventDefault();if(!state.group)return;const name=$('#group-rename').value.trim();const result=await api('/groups/'+encodeURIComponent(state.group.id),{name},'PATCH');state.group.name=result.name;await refreshGroups();peerHeader();toast('เปลี่ยนชื่อกลุ่มแล้ว');});
$('#group-member-list').onclick=safe(async e=>{const button=e.target.closest('[data-member-remove]');if(!button||!state.group)return;if(!confirm('นำสมาชิกคนนี้ออกจากกลุ่มหรือไม่?'))return;await api('/groups/'+encodeURIComponent(state.group.id)+'/members/'+encodeURIComponent(button.dataset.memberRemove),null,'DELETE');await openGroupManager();await refreshGroups();});
$('#group-member-list').onchange=safe(async e=>{const select=e.target.closest('[data-member-role]');if(!select||!state.group)return;await api('/groups/'+encodeURIComponent(state.group.id)+'/members/'+encodeURIComponent(select.dataset.memberRole),{role:select.value},'PATCH');await openGroupManager();await refreshGroups();});
$('#group-add-submit').onclick=safe(async()=>{if(!state.group)return;const userIds=[...$('#group-add-list').querySelectorAll('input:checked')].map(input=>input.value);if(!userIds.length)return toast('เลือกเพื่อนที่ต้องการเชิญก่อน');const result=await api('/groups/'+encodeURIComponent(state.group.id)+'/members',{userIds});await openGroupManager();await refreshGroups();toast('ส่งคำเชิญแล้ว '+result.invited+' คน');});

const aiSend=async()=>{const input=$('#ai-prompt'),text=input.value.trim(),btn=$('#ai-submit');if(!text||btn.disabled)return;btn.disabled=true;$('#ai-use').hidden=true;$('#ai-status').textContent='';const box=assistantBox(),own=document.createElement('div'),wait=document.createElement('div');own.className='pet-chat-message own';own.innerHTML='<small>คุณ</small><p></p>';own.querySelector('p').textContent=text;wait.className='pet-chat-message ai-typing';wait.innerHTML='<small>PURE AI</small><p>กำลังคิด…</p>';box.append(own,wait);box.scrollTop=box.scrollHeight;input.value='';try{const d=await api('/assistant',{prompt:text,engine:'jev',allowCloud:true});if(d.clarify){wait.remove();renderAssistantHistory(d.history);const pick=document.createElement('div');pick.className='pet-chat-message ai-choices';pick.innerHTML='<small>PURE AI</small><p>อยากให้ช่วยเรื่องไหน? เลือกแล้วเติมรายละเอียดต่อได้เลย</p>';for(const o of d.options){const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=o.title;b.onclick=()=>{input.value=o.starter;pick.remove();input.focus();};pick.append(b);}assistantBox().append(pick);assistantBox().scrollTop=assistantBox().scrollHeight;return;}renderAssistantHistory(d.history);$('#ai-result').textContent=plainText(d.text);$('#ai-status').textContent='';$('#ai-use').hidden=!state.peer&&!state.group;}catch(err){wait.classList.remove('ai-typing');wait.querySelector('p').textContent=err.message;input.value=text;}finally{btn.disabled=false;input.focus();}};
$('#ai-form').onsubmit=e=>{e.preventDefault();aiSend();};
$('#ai-prompt').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&matchMedia('(pointer:fine)').matches){e.preventDefault();aiSend();}};
$('#ai-use').onclick=()=>{$('#message-input').value=$('#ai-result').textContent;$('#ai-dialog').close();};

function callUI(peer,inbound,video){$('#call-name').textContent=peer.name;$('#call-avatar').textContent=initial(peer);$('#call-status').textContent=inbound?'สายเรียกเข้า':'กำลังโทร…';$('#accept-call').hidden=!inbound;$('#mute-call').hidden=inbound;$('#camera-call').hidden=inbound||!video;$('#speaker-call').hidden=false;setupCallAudio(video,toast);$('.call-person').hidden=false;$('#local-video').hidden=!video;$('#mute-call').classList.remove('off');$('#camera-call').classList.remove('off');if(!$('#call-dialog').open)$('#call-dialog').showModal();}
async function media(video){if(!navigator.mediaDevices?.getUserMedia)throw new Error('โทรต้องใช้ HTTPS หรือ localhost และอนุญาตกล้อง/ไมค์');return navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:video?{facingMode:'user',width:640,height:480}:false});}
async function setupPC(ctx){setupCallAudio(ctx.video,toast);const rtc=await api('/rtc');if(call!==ctx)return;ctx.pc=new RTCPeerConnection({iceServers:rtc.iceServers});ctx.stream.getTracks().forEach(t=>ctx.pc.addTrack(t,ctx.stream));$('#local-video').srcObject=ctx.stream;ctx.pc.onicecandidate=e=>{if(e.candidate&&ctx.id)socket.emit('call:signal',{id:ctx.id,signal:{candidate:e.candidate}});};ctx.pc.ontrack=e=>{$('#remote-video').srcObject=e.streams[0];$('#remote-video').play().catch(()=>{});if(e.track.kind==='video')$('.call-person').hidden=true;};ctx.pc.onconnectionstatechange=()=>{if(call!==ctx)return;const status=ctx.pc.connectionState;$('#call-status').textContent=status==='connected'?'เชื่อมต่อแล้ว':status==='disconnected'?'สัญญาณขาด…':'กำลังเชื่อมต่อ…';if(status==='failed'){toast('เชื่อมต่อสายไม่ได้ ตรวจสอบ TURN และเครือข่าย');endCall();}};if(!rtc.turnConfigured)toast('ยังไม่มี TURN การโทรข้ามเครือข่ายบางชนิดอาจไม่สำเร็จ');}
async function startCall(video){if(call||secretaryActive()||!state.peer)return;const ctx={peer:state.peer,id:null,video,queued:[]};call=ctx;callUI(ctx.peer,false,video);try{ctx.stream=await media(video);if(call!==ctx){ctx.stream.getTracks().forEach(t=>t.stop());return;}await setupPC(ctx);if(call!==ctx)return;const result=await socket.timeout(10000).emitWithAck('call:start',{peer:ctx.peer.id,video});if(call!==ctx){if(result.id)socket.emit('call:end',{id:result.id});return;}if(result.error)throw new Error(result.error);ctx.id=result.id;}catch(e){if(call===ctx)endCall();toast(e.message);}}
function incoming(data){if(call||secretaryActive()){socket.emit('call:end',{id:data.id});return;}call={id:data.id,peer:data.from,video:data.video,queued:[],incoming:true};startRingtone();callUI(data.from,true,data.video);}
$('#voice-call').onclick=()=>startCall(false);$('#video-call').onclick=()=>startCall(true);
$('#accept-call').onclick=async()=>{const ctx=call;if(!ctx)return;$('#accept-call').disabled=true;try{ctx.stream=await media(ctx.video);if(call!==ctx){ctx.stream.getTracks().forEach(t=>t.stop());return;}await setupPC(ctx);if(call!==ctx)return;$('#accept-call').hidden=true;$('#mute-call').hidden=false;$('#camera-call').hidden=!ctx.video;$('#speaker-call').hidden=false;setupCallAudio(ctx.video,toast);$('#call-status').textContent='กำลังเชื่อมต่อ…';socket.emit('call:accept',{id:ctx.id});}catch(e){toast(e.message);endCall();}finally{$('#accept-call').disabled=false;}};
async function onAccepted({id}){const ctx=call;if(ctx?.id!==id||!ctx.pc)return;try{const offer=await ctx.pc.createOffer();await ctx.pc.setLocalDescription(offer);socket.emit('call:signal',{id,signal:{description:ctx.pc.localDescription}});}catch(e){toast(e.message);endCall();}}
async function onSignal({id,signal}){const ctx=call;if(ctx?.id!==id||!ctx.pc)return;if(signal.description){await ctx.pc.setRemoteDescription(signal.description);for(const candidate of ctx.queued)await ctx.pc.addIceCandidate(candidate);ctx.queued=[];if(signal.description.type==='offer'){const answer=await ctx.pc.createAnswer();await ctx.pc.setLocalDescription(answer);socket.emit('call:signal',{id,signal:{description:ctx.pc.localDescription}});}}else if(signal.candidate){if(ctx.pc.remoteDescription)await ctx.pc.addIceCandidate(signal.candidate);else ctx.queued.push(signal.candidate);}}
function finishCall(){stopRingtone();resetCallAudio();if(!call)return;const ctx=call;call=null;ctx.stream?.getTracks().forEach(t=>t.stop());ctx.pc?.close();$('#remote-video').srcObject=null;$('#local-video').srcObject=null;$('#call-dialog').close();}
function endCall(){if(call?.id)socket.emit('call:end',{id:call.id});finishCall();}
$('#end-call').onclick=endCall;$('#call-dialog').addEventListener('cancel',e=>{e.preventDefault();endCall();});$('#mute-call').onclick=()=>{const t=call?.stream?.getAudioTracks()[0];if(t){t.enabled=!t.enabled;$('#mute-call').classList.toggle('off',!t.enabled);$('#mute-call').setAttribute('aria-label',t.enabled?'ปิดไมค์':'เปิดไมค์');}};$('#camera-call').onclick=()=>{const t=call?.stream?.getVideoTracks()[0];if(t){t.enabled=!t.enabled;$('#camera-call').classList.toggle('off',!t.enabled);}};
const bootStartedAt=performance.now();
async function hideBoot(){const boot=document.querySelector('#boot');await new Promise(resolve=>setTimeout(resolve,Math.max(0,5200-(performance.now()-bootStartedAt))));boot.classList.add('is-leaving');await new Promise(resolve=>setTimeout(resolve,950));boot.hidden=true;}
async function restoreLogin(){
  try{const d=await api('/me');await hideBoot();enter(d.user).catch(e=>toast(e.message));}
  catch(e){if(e.status===401){await hideBoot();document.querySelector('#auth').hidden=false;}else{document.querySelector('#boot-status').textContent='กำลังรอเซิร์ฟเวอร์ บัญชีของคุณยังไม่ได้ออกจากระบบ';setTimeout(restoreLogin,4000);}}
}restoreLogin();

function assistantBox(){let box=$('#assistant-history');if(!box){box=document.createElement('div');box.id='assistant-history';box.className='assistant-history';$('#ai-form').before(box);}return box;}
function renderAssistantHistory(history){const box=assistantBox();box.innerHTML=history.map(m=>'<div class="pet-chat-message '+(m.role==='user'?'own':'')+'"><small>'+(m.role==='user'?'คุณ':'PURE AI')+'</small><p>'+esc(plainText(m.text))+'</p></div>').join('');$('#ai-dialog').classList.toggle('has-history',history.length>0);requestAnimationFrame(()=>{box.scrollTop=box.scrollHeight;});}
async function openAssistant(){$('#ai-result').hidden=true;$('#ai-dialog').showModal();try{const d=await api('/assistant');renderAssistantHistory(d.history);}catch(e){toast(e.message);}$('#ai-prompt').focus();}
const assistantShortcut=document.createElement('button');assistantShortcut.className='assistant-shortcut';assistantShortcut.innerHTML=icon('pure-p')+'<span><strong>PURE AI</strong><small>ผู้ช่วยส่วนตัว พร้อมคุยกับคุณ</small></span>';$('#pet-shortcut').before(assistantShortcut);assistantShortcut.onclick=()=>openAssistant();
const aiFloat=document.createElement('button');aiFloat.type='button';aiFloat.className='pure-ai-float';aiFloat.setAttribute('aria-label','เปิด PURE AI ผู้ช่วยส่วนตัว');aiFloat.innerHTML=icon('pure-p')+'<span><strong>PURE AI</strong><small>มีอะไรให้ช่วยไหม?</small></span>';aiFloat.onclick=()=>openAssistant();$('#app').append(aiFloat);
const clearAssistant=document.createElement('button');clearAssistant.className='text-button';clearAssistant.id='clear-assistant';clearAssistant.textContent='ล้างประวัติผู้ช่วย AI';$('#ai-dialog').append(clearAssistant);clearAssistant.onclick=safe(async()=>{if(!confirm('ลบประวัติผู้ช่วย AI ทั้งหมด?'))return;await api('/assistant',null,'DELETE');renderAssistantHistory([]);$('#ai-result').textContent='';$('#ai-use').hidden=true;});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCompanion();else if(state.tab==='pet'&&state.pet)renderPet();});

document.querySelector('#peer-name').onclick=()=>{if(state.peer)openPersonal(state.peer.id,{api,esc,state,toast,refreshFriends});};
document.querySelector('#peer-avatar').onclick=()=>{if(state.peer)openPersonal(state.peer.id,{api,esc,state,toast,refreshFriends});};
document.addEventListener('click',e=>{const card=e.target.closest('.friend-card');if(card&&(e.target.closest('.avatar')||e.target.closest('.details'))){const id=card.querySelector('[data-chat]')?.dataset.chat||card.querySelector('[data-direct-chat]')?.dataset.directChat||card.querySelector('[data-add]')?.dataset.add;if(id)openPersonal(id,{api,esc,state,toast,refreshFriends});}});

window.addEventListener('pure-open-chat',safe(async e=>{
  const uid=e.detail?.userId;if(!uid)return;
  let p=state.friends.find(f=>f.id===uid);
  if(!p){const d=await api('/profiles/'+encodeURIComponent(uid));p=d.profile;}
  if(p)await openChat(p);
}));
window.addEventListener('pure-call-user',safe(async e=>{
  const uid=e.detail?.userId;if(!uid)return;
  let p=state.friends.find(f=>f.id===uid);
  if(!p){const d=await api('/profiles/'+encodeURIComponent(uid));p=d.profile;}
  if(p){state.peer=p;peerHeader();startCall(!!e.detail.video);}
}));

const secretaryButton=document.createElement('button');secretaryButton.className='assistant-shortcut';secretaryButton.id='secretary-open';secretaryButton.innerHTML=icon('mic')+'<span><strong>เลขา AI</strong><small>โทรคุยสด · ความจำส่วนตัว</small></span>';document.querySelector('#pet-shortcut').before(secretaryButton);secretaryButton.onclick=()=>openSecretary({api,socket,toast,isCalling:()=>!!call});

import './pure-icons.js';
