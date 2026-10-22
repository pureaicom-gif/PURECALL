import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPureServer } from '../server/index.js';

const dir=mkdtempSync(join(tmpdir(),'pure-ui-')),server=createPureServer({dataDir:dir,scan:false});
await new Promise(r=>server.http.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.http.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']});
const errors=[];
try{
 const a=await browser.newContext({viewport:{width:1440,height:960},permissions:['camera','microphone']}),b=await browser.newContext({viewport:{width:390,height:844},permissions:['camera','microphone'],isMobile:true,hasTouch:true});
 const pa=await a.newPage(),pb=await b.newPage();for(const p of [pa,pb])p.on('pageerror',e=>errors.push(e.message));
 mkdirSync('docs/screenshots',{recursive:true});await pa.goto(base);await pa.screenshot({path:'docs/screenshots/01-welcome-desktop.png'});
 async function signup(p,handle,name){await p.goto(base);await p.locator('#auth-toggle').click();await p.locator('#handle').fill(handle);await p.locator('#display-name').fill(name);await p.locator('#password').fill('test-password-123');await p.locator('#auth-submit').click();await p.locator('#app').waitFor({state:'visible'});}
 await signup(pa,'pure_alice','Alice · อลิซ');await signup(pb,'pure_mint','Mint · มิ้นท์');
 await pa.locator('[data-tab="friends"]').click();await pa.locator('#friend-query').fill('pure_mint');await pa.locator('#find-friend button').click();await pa.locator('[data-add]').click();
 await pb.locator('[data-tab="friends"]').click();await pb.locator('[data-accept]').click();await pb.locator('[data-chat]').waitFor();await pb.locator('[data-chat]').click();
 await pa.locator('[data-chat]').waitFor();await pa.locator('[data-chat]').click();
 await pa.locator('#message-input').fill('เฮ้ วันนี้เป็นยังไงบ้าง ☀');await pa.locator('#send-button').click();await pb.locator('#messages').getByText('เฮ้ วันนี้เป็นยังไงบ้าง ☀',{exact:true}).waitFor();
 await pb.locator('#message-input').fill('ดีเลย! เพิ่งเล่นกับ Mochi เสร็จ 🐈');await pb.locator('#send-button').click();await pa.locator('#messages').getByText('ดีเลย! เพิ่งเล่นกับ Mochi เสร็จ 🐈',{exact:true}).waitFor();
 await pa.locator('#message-input').fill('ไว้โทรคุยกันนะ วันนี้มีเรื่องจะเล่าเยอะเลย');await pa.locator('#send-button').click();await pb.locator('#messages').getByText('ไว้โทรคุยกันนะ วันนี้มีเรื่องจะเล่าเยอะเลย',{exact:true}).waitFor();
 await pa.locator('#file-input').setInputFiles({name:'hello-pure.txt',mimeType:'text/plain',buffer:Buffer.from('PURE attachment integration test')});await pb.getByText(/hello-pure.txt/).waitFor();
 await pa.locator('#message-input').fill('<img src=x onerror=alert(1)>');await pa.locator('#send-button').click();await pb.locator('#messages').getByText('<img src=x onerror=alert(1)>',{exact:true}).waitFor();assert.equal(await pb.locator('.messages img').count(),0);
 await pa.screenshot({path:'docs/screenshots/02-chat-desktop.png'});await pb.screenshot({path:'docs/screenshots/03-chat-mobile.png'});
 await pa.locator('#video-call').click();await pb.locator('#accept-call').waitFor({state:'visible'});await pb.locator('#accept-call').click();await pa.waitForFunction(()=>document.querySelector('#call-status').textContent==='เชื่อมต่อแล้ว',null,{timeout:20000});await pb.waitForFunction(()=>document.querySelector('#remote-video').srcObject?.getVideoTracks().length===1);await pa.locator('#mute-call').click();assert.match(await pa.locator('#mute-call').getAttribute('class'),/off/);await pa.screenshot({path:'docs/screenshots/04-video-test.png'});await pa.locator('#end-call').click();await pb.locator('#call-dialog').waitFor({state:'hidden'});
 await pb.locator('#back-chat').click();await pb.locator('[data-tab="pet"]').click();await pb.locator('#pet-canvas').waitFor();await pb.locator('[data-action="play"]').click();await pb.getByText('◈ 108 เหรียญ',{exact:true}).waitFor();await pb.screenshot({path:'docs/screenshots/05-pet-mobile.png'});
 await pa.locator('[data-tab="pet"]').click();await pa.locator('#pet-canvas').waitFor();await pa.screenshot({path:'docs/screenshots/06-pet-desktop.png'});
 await pb.locator('[data-tab="profile"]').click();await pb.locator('#pet-name').fill('น้องมะลิ');await pb.locator('#pet-kind').selectOption('dog');await pb.locator('#pet-settings button').click();await pb.locator('[data-tab="pet"]').click();await pb.getByText('น้องมะลิ',{exact:true}).waitFor();
 await pa.locator('[data-tab="profile"]').click();await pa.locator('#profile-ai').click();await pa.locator('#ai-prompt').fill('ช่วยคิดคำทักทาย');await pa.locator('#ai-submit').click();await pa.getByText('ผู้ดูแลยังไม่ได้ตั้งค่า API key และโมเดล',{exact:true}).waitFor();await pa.locator('[data-close="ai-dialog"]').click();
 await pb.reload();await pb.locator('#app').waitFor();await pb.locator('[data-tab="pet"]').click();await pb.getByText('น้องมะลิ',{exact:true}).waitFor();
 assert.deepEqual(errors,[]);console.log('PASS: desktop/mobile signup, friends, realtime chat, file upload, XSS escaping, real WebRTC fake-device video + mute + hangup, pet persistence, AI unavailable UI; no page errors');
}finally{await browser.close();await server.close();rmSync(dir,{recursive:true,force:true});}
