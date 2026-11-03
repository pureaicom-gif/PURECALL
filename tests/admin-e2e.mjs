// Playwright e2e for the in-app Admin (admin-only nav, Voice Studio generate/play/history, users ban, server/release/content).
// Run: node tests/admin-e2e.mjs [screenshotDir]
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPureServer} from '../server/index.js';
import {createTts,DEFAULT_VOICE} from '../server/tts.js';

const shots=process.argv[2]||null;
const dir=mkdtempSync(join(tmpdir(),'pure-admin-e2e-'));
writeFileSync(join(dir,'version.json'),JSON.stringify({versionCode:16,versionName:'0.9.0',apkUrl:'https://github.com/purefxaidev/purecall-web/releases/download/v0.9.0/PURE-0.9.0-release.apk'}));
const rate=44100,secs=1.2,n=Math.round(rate*secs),pcm=Buffer.alloc(n*2);for(let i=0;i<n;i++)pcm.writeInt16LE(Math.round(Math.sin(i/rate*2*Math.PI*440)*6000),i*2);
const hdr=Buffer.alloc(44);hdr.write('RIFF',0);hdr.writeUInt32LE(36+pcm.length,4);hdr.write('WAVEfmt ',8);hdr.writeUInt32LE(16,16);hdr.writeUInt16LE(1,20);hdr.writeUInt16LE(1,22);hdr.writeUInt32LE(rate,24);hdr.writeUInt32LE(rate*2,28);hdr.writeUInt16LE(2,32);hdr.writeUInt16LE(16,34);hdr.write('data',36);hdr.writeUInt32LE(pcm.length,40);
const wav=Buffer.concat([hdr,pcm]);
const fetcher=async url=>{if(url.endsWith('/api/voices'))return new Response(JSON.stringify({samples:[{name:DEFAULT_VOICE},{name:'นางเอก.wav'}]}),{status:200});if(url.includes('/v1/audio/speech'))return new Response('',{status:501});await new Promise(r=>setTimeout(r,300));return new Response(wav,{status:200,headers:{'content-type':'audio/wav'}});};
const server=createPureServer({dataDir:dir,scan:false,tts:createTts({dataDir:dir,fetcher})});
await new Promise(r=>server.http.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.http.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const errors=[];
async function person(handle,viewport){const ctx=await browser.newContext({viewport,locale:'th-TH',isMobile:viewport.width<500,hasTouch:viewport.width<500});const page=await ctx.newPage();page.on('pageerror',e=>errors.push(handle+': '+e.message));const r=await page.request.post(base+'/api/register',{data:{handle,name:handle,password:handle+'-pass-123'}});assert.equal(r.status(),201);return {ctx,page,user:(await r.json()).user};}
try{
 const joe=await person('joe_user',{width:390,height:844});
 const boss=await person('boss_admin',{width:390,height:844});
 const desk=await browser.newContext({viewport:{width:1280,height:820},locale:'th-TH'});
 server.db.prepare("UPDATE users SET role='admin' WHERE handle='boss_admin'").run();
 await joe.page.goto(base+'/');await joe.page.locator('#chat-list').waitFor({timeout:20000});
 assert.equal(await joe.page.locator('#nav-admin').isVisible(),false,'admin nav hidden for normal user');
 const p=boss.page;await p.goto(base+'/');await p.locator('#chat-list').waitFor({timeout:20000});
 await p.locator('#nav-admin').scrollIntoViewIfNeeded();assert.ok(await p.locator('#nav-admin').isVisible(),'admin nav visible');
 await p.locator('#nav-admin').click();await p.locator('#adm-gen').waitFor();
 await p.locator('#adm-voice-sel option',{hasText:'นางเอก.wav'}).waitFor({state:'attached'});
 if(shots)await p.screenshot({path:join(shots,'admin-voice-mobile.png'),fullPage:false});
 await p.locator('#adm-q').selectOption('high');await p.locator('#adm-gen').click();
 await p.locator('#adm-player:not([hidden])').waitFor({timeout:15000});await p.locator('#adm-hist .adm-item').first().waitFor();
 assert.match(await p.locator('#adm-dl').getAttribute('download'),/\.wav$/);
 await p.waitForTimeout(400);if(shots)await p.screenshot({path:join(shots,'admin-voice-generated-mobile.png'),fullPage:true});
 await p.locator('[data-adm="users"]').click();await p.locator(`[data-ban="${joe.user.id}"]`).waitFor();
 p.once('dialog',d=>d.accept());await p.locator(`[data-ban="${joe.user.id}"]`).click();await p.locator('.adm-tag.red').waitFor();
 if(shots)await p.screenshot({path:join(shots,'admin-users-mobile.png')});
 assert.equal((await joe.page.request.get(base+'/api/me')).status(),401,'banned user logged out');
 for(const k of ['server','release','content']){await p.locator(`[data-adm="${k}"]`).click();await p.locator(`#adm-${k} .adm-card, #adm-${k} .adm-tile`).first().waitFor();await p.waitForTimeout(200);if(shots)await p.screenshot({path:join(shots,`admin-${k}-mobile.png`),fullPage:true});}
 assert.match(await p.locator('#adm-release-body').innerText(),/0\.9\.0/);
 // desktop
 await desk.addCookies((await boss.ctx.cookies()).map(c=>c));const dp=await desk.newPage();await dp.goto(base+'/');await dp.locator('#chat-list').waitFor();await dp.locator('#nav-admin').click();await dp.locator('#adm-hist .adm-item').first().waitFor();if(shots)await dp.screenshot({path:join(shots,'admin-voice-desktop.png')});
 assert.deepEqual(errors,[]);console.log('admin e2e ok');
}finally{await browser.close();await server.close();server.http.close();rmSync(dir,{recursive:true,force:true});}
