export function createWorkspace({state,esc,icon,renderConversations,toast}) {
 const $=s=>document.querySelector(s);
 let filter='all', drafts={};
 const key=()=>`pure.drafts.${state.user?.id}`;
 const save=()=>{try{sessionStorage.setItem(key(),JSON.stringify(drafts));}catch{}};
 const filters=document.createElement('div');filters.className='chat-filters';filters.setAttribute('aria-label','กรองบทสนทนา');
 filters.innerHTML='<button data-filter="all" class="chosen" aria-pressed="true">ทั้งหมด</button><button data-filter="unread" aria-pressed="false">ยังไม่อ่าน <span id="unread-total">0</span></button><button data-filter="online" aria-pressed="false">ออนไลน์</button>';
 $('.search-box').after(filters);
 filters.onclick=e=>{const b=e.target.closest('[data-filter]');if(!b)return;filter=b.dataset.filter;filters.querySelectorAll('button').forEach(x=>{const on=x===b;x.classList.toggle('chosen',on);x.setAttribute('aria-pressed',on);});renderConversations();};
 const search=document.createElement('button');search.id='search-room';search.className='icon-button';search.setAttribute('aria-label','ค้นหาข้อความและไฟล์');search.innerHTML=icon('search');$('.conversation-header').append(search);
 const bar=document.createElement('div');bar.className='room-tools';bar.hidden=true;bar.innerHTML='<input id="room-query" placeholder="ค้นหาในข้อความที่โหลดแล้ว" aria-label="ค้นหาข้อความในห้อง"><label><input type="checkbox" id="room-files"> ไฟล์เท่านั้น</label><span id="room-count" role="status"></span>';
 $('.conversation-header').after(bar);
 const apply=()=>{const q=$('#room-query').value.trim().toLocaleLowerCase(),files=$('#room-files').checked;let count=0;$('#messages').querySelectorAll('.message').forEach(row=>{const matches=row.textContent.toLocaleLowerCase().includes(q)&&(!files||row.dataset.file==='true');row.hidden=!matches;if(matches)count++;});$('#room-count').textContent=`${count} ข้อความ`;};
 search.onclick=()=>{bar.hidden=!bar.hidden;search.setAttribute('aria-expanded',!bar.hidden);if(bar.hidden){$('#room-query').value='';$('#room-files').checked=false;apply();}else $('#room-query').focus();};
 bar.oninput=apply;
 $('#message-input').addEventListener('input',()=>{const input=$('#message-input');input.style.height='auto';input.style.height=Math.min(input.scrollHeight,120)+'px';if(state.peer){drafts[state.peer.id]=input.value;if(!input.value)delete drafts[state.peer.id];save();}});
 const ideas=document.createElement('div');ideas.className='assistant-ideas';ideas.innerHTML=['ช่วยร่างคำทักทายเพื่อนแบบเป็นกันเอง','ช่วยวางแผนวันหยุดแบบประหยัด','ช่วยอธิบายเรื่องที่ฉันสงสัยให้ง่ายขึ้น'].map((text,i)=>`<button type="button" data-idea="${esc(text)}"><span>0${i+1}</span>${['เริ่มบทสนทนา','วางแผนด้วยกัน','เรียนรู้เรื่องใหม่'][i]} </button>`).join('');$('#ai-form').before(ideas);ideas.onclick=e=>{const b=e.target.closest('[data-idea]');if(b){$('#ai-prompt').value=b.dataset.idea;$('#ai-prompt').focus();}};
 return {
  login(){try{drafts=JSON.parse(sessionStorage.getItem(key())||'{}');if(!drafts||typeof drafts!=='object'||Array.isArray(drafts))drafts={};}catch{drafts={};}},
  matches(f){return filter==='all'||(filter==='unread'?f.unread>0:f.online);},
  update(){const unread=state.friends.filter(f=>f.status==='accepted').reduce((sum,f)=>sum+(f.unread||0),0);$('#unread-total').textContent=unread;const requests=state.friends.filter(f=>f.status==='pending'&&f.incoming).length;const nav=$('[data-tab="friends"]');nav.setAttribute('aria-label',requests?`เพื่อน มี ${requests} คำขอใหม่`:'เพื่อน');nav.dataset.count=requests||'';},
  open(){bar.hidden=true;search.setAttribute('aria-expanded','false');$('#room-query').value='';$('#room-files').checked=false;$('#message-input').value=typeof drafts[state.peer.id]==='string'?drafts[state.peer.id]:'';$('#message-input').style.height='auto';},
  sent(peer,text){if(drafts[peer]===text||drafts[peer]?.trim()===text){delete drafts[peer];save();}$('#message-input').style.height='auto';},
  messages(){apply();},
  friends(){const header=$('#page .page-header');if(!header)return;const people=state.friends.filter(f=>f.status==='accepted'),requests=state.friends.filter(f=>f.status==='pending'&&f.incoming);const stats=document.createElement('div');stats.className='circle-stats';stats.innerHTML=`<div><strong>${people.length}</strong><span>เพื่อนในพื้นที่ของคุณ</span></div><div><strong>${people.filter(f=>f.online).length}</strong><span>ออนไลน์ตอนนี้</span></div><div><strong>${requests.length}</strong><span>คำขอที่รอตอบรับ</span></div>`;header.after(stats);const share=document.createElement('button');share.className='secondary share-id';share.textContent='คัดลอก @'+state.user.handle;share.onclick=async()=>{try{await navigator.clipboard.writeText(state.user.handle);toast('คัดลอก PURE ID แล้ว');}catch{toast('PURE ID ของคุณ: @'+state.user.handle);}};header.append(share);},
 };
}
