// Playwright e2e smoke for v0.9: login, E2E chat, 1:1 call signaling, group call, stories. Also writes screenshots.
// Run: node tests/v09-e2e.mjs [screenshotDir]
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPureServer} from '../server/index.js';

const shots=process.argv[2]||null;
const dir=mkdtempSync(join(tmpdir(),'pure-v09-e2e-'));
const server=createPureServer({dataDir:dir,scan:false});
await new Promise(r=>server.http.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.http.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required','--disable-features=WebRtcHideLocalIpsWithMdns','--force-webrtc-ip-handling-policy=default']});
const errors=[];
const shot=async(page,name)=>{if(shots)await page.screenshot({path:join(shots,'purecall-app-'+name+'.png')});};
async function person(handle,name,viewport={width:1280,height:820}){
 const ctx=await browser.newContext({viewport,permissions:['camera','microphone'],locale:'th-TH'});await ctx.addInitScript(()=>{const O=window.RTCPeerConnection;window.__pcs=[];window.RTCPeerConnection=function(...a){const pc=new O(...a);window.__pcs.push(pc);return pc;};window.RTCPeerConnection.prototype=O.prototype;});const page=await ctx.newPage();
 page.on('pageerror',e=>errors.push(handle+': '+e.message));page.on('console',m=>{if(m.type()==='error'&&!/favicon|401|404|Failed to load resource/.test(m.text()))errors.push(handle+': '+m.text());});
 const r=await page.request.post(base+'/api/register',{data:{handle,name,password:handle+'-pass-123'}});assert.equal(r.status(),201,'register '+handle);
 return {ctx,page,user:(await r.json()).user,api:async(path,data,method)=>{const res=await page.request.fetch(base+'/api'+path,{method:method||(data?'POST':'GET'),data});return {status:res.status(),data:await res.json().catch(()=>null)};}};
}
try{
 const a=await person('alice_v09','Alice'),b=await person('bob_v09','Bob');
 assert.equal((await a.api('/friends',{id:b.user.id})).status<300,true);
 assert.equal((await b.api('/friends/'+a.user.id+'/respond',{accept:true})).status,200);
 const group=(await a.api('/groups',{name:'ทีม PURE',memberIds:[b.user.id]})).data.group;
 await b.api('/groups/'+group.id+'/invite-response',{accept:true});
 await b.api('/stories',{text:'สวัสดีจาก Bob ✨',bg:'#101018'}).catch(()=>{});
 const fd=await b.page.request.post(base+'/api/stories',{multipart:{text:'วันนี้อากาศดีมาก ☀️',bg:'#0d1b2a'}});assert.equal(fd.status(),201);

 // Login (session cookie from registration) and load app
 for(const p of [a,b]){await p.page.goto(base+'/');await p.page.locator('#chat-list').waitFor({state:'visible',timeout:20000});await p.page.locator('#connection-dot.connected').waitFor({state:'attached',timeout:15000});}
 await a.page.locator('#stories-bar [data-story-user]').first().waitFor({timeout:10000});
 assert.ok(await a.page.locator('#stories-bar .story-ring:not(.seen)').count()>=1,'unseen ring visible');
 await a.page.waitForTimeout(800);await shot(a.page,'chats');

 // E2E chat
 await a.page.locator(`[data-peer="${b.user.id}"]`).click();
 await a.page.locator('#e2e-lock.on').waitFor({timeout:10000});
 await a.page.locator('#message-input').first().fill('สวัสดี นี่คือข้อความเข้ารหัส 🔒');
 await a.page.locator('#composer').evaluate(f=>f.requestSubmit());
 await b.page.locator(`[data-peer="${a.user.id}"]`).click();
 await b.page.getByText('สวัสดี นี่คือข้อความเข้ารหัส 🔒').first().waitFor({timeout:10000});
 const row=server.db.prepare('SELECT text,encrypted FROM messages ORDER BY id DESC LIMIT 1').get();
 assert.match(row.text,/^e2e1:/,'server stores ciphertext only');assert.equal(row.encrypted,1);
 await b.api('/messages/'+a.user.id,{text:'ข้อความเก่าแบบปกติยังใช้ได้',clientId:'legacy-1'});
 await a.page.getByText('ข้อความเก่าแบบปกติยังใช้ได้').first().waitFor({timeout:10000});
 await shot(a.page,'e2e-chat');
 await a.page.locator('#e2e-lock').click();await a.page.locator('#e2e-dialog .e2e-num').waitFor();
 const numA=await a.page.locator('#e2e-dialog .e2e-num').textContent();
 await b.page.locator('#e2e-lock').click();const numB=await b.page.locator('#e2e-dialog .e2e-num').textContent();
 assert.equal(numA,numB,'safety numbers match');await shot(a.page,'e2e-verify');
 for(const p of [a,b])await p.page.locator('#e2e-dialog [data-close]').click();

 // 1:1 call signaling
 await a.page.locator('#video-call').click();
 await b.page.locator('#accept-call:not([hidden])').waitFor({timeout:10000});await b.page.locator('#accept-call').click();
 // Signaling check: offer/answer fully exchanged on both sides (ICE itself may not complete in sandboxed CI without network interfaces)
 for(const p of [a,b])await p.page.waitForFunction(()=>window.__pcs.some(pc=>pc.signalingState==='stable'&&pc.remoteDescription&&pc.currentLocalDescription),null,{timeout:20000});
 await a.page.waitForTimeout(1200);await shot(a.page,'call');
 await a.page.locator('#end-call').click();await b.page.locator('#call-dialog').waitFor({state:'hidden',timeout:10000});

 // Group call (mesh)
 await a.page.locator('#filter-groups').click();await a.page.locator(`[data-group="${group.id}"]`).click();
 await a.page.locator('#video-call').click();await a.page.locator('#gcall-dialog[open]').waitFor({timeout:10000});
 await b.page.locator('#gring-dialog[open]').waitFor({timeout:10000});await b.page.locator('#gring-join').click();
 for(const p of [a,b]){await p.page.waitForFunction(()=>document.querySelectorAll('#gcall-grid .gtile').length===2,null,{timeout:15000});await p.page.waitForFunction(()=>window.__pcs.filter(pc=>pc.signalingState==='stable'&&pc.remoteDescription&&pc.connectionState!=='closed').length>=1,null,{timeout:20000});}
 await a.page.waitForTimeout(1200);await shot(a.page,'group-call');
 await b.page.locator('#gcall-leave').click();await a.page.waitForFunction(()=>document.querySelectorAll('#gcall-grid .gtile').length===1,null,{timeout:10000});
 await a.page.locator('#gcall-leave').click();

 // Stories viewer + viewers list
 await a.page.locator('#stories-bar [data-story-user]').first().click();await a.page.locator('#story-viewer[open] .story-text').waitFor();await shot(a.page,'story');
 await a.page.locator('#story-viewer .sv-close').click();
 await b.page.reload();await b.page.locator('#stories-bar [data-story-add]').click();await b.page.locator('#story-viewer .sv-views').click();await b.page.getByText('Alice').last().waitFor({timeout:8000});
 await b.page.locator('#story-viewer .sv-close').click();

 // Mobile + other pages for screenshots
 if(shots){
  const m=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,storageState:await a.ctx.storageState()});const mp=await m.newPage();await mp.goto(base+'/');await mp.locator('#connection-dot.connected').waitFor({state:'attached',timeout:15000});await mp.waitForTimeout(800);await mp.screenshot({path:join(shots,'purecall-app-mobile.png')});
  for(const [path,name] of [['/pet-gallery.html','pet-gallery'],['/timeline-preview.html','timeline']]){await mp.goto(base+path);await mp.waitForTimeout(1200);await mp.screenshot({path:join(shots,'purecall-app-'+name+'.png')});}
  for(const tab of ['studio','pet','timeline']){const btn=a.page.locator(`.rail [data-tab="${tab}"]`);if(await btn.count()){await btn.first().click();await a.page.waitForTimeout(1500);await shot(a.page,'tab-'+tab);}}
  server.db.prepare("UPDATE users SET role='admin' WHERE id=?").run(a.user.id);await a.page.goto(base+'/admin');await a.page.waitForTimeout(1500);await shot(a.page,'admin');
 }
 const bad=errors.filter(e=>!/Permissions|NotAllowed|net::ERR|push/i.test(e));
 assert.deepEqual(bad,[],'no page errors');
 console.log('v0.9 e2e smoke: OK');
}finally{await browser.close();await server.close?.();rmSync(dir,{recursive:true,force:true});}
