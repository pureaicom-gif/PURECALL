import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPureServer} from '../server/index.js';
import {PET_SPECIES,getCharacter} from '../public/pet-catalog.js';
const dir=mkdtempSync(join(tmpdir(),'pure-pet-ui-')),requests=[];
const fixture={status:()=>({configured:true,model:'TEST-FIXTURE',catalog:[],lastScan:null}),generate:async(prompt,options)=>{requests.push({prompt,options});return {text:options.audio?'ได้ยินเสียงแล้ว มาเล่นกันนะ':'สวัสดี วันนี้อยากชวนเราเล่นอะไรดี',model:'TEST-FIXTURE'};}};
const server=createPureServer({dataDir:dir,scan:false,gemini:fixture});await new Promise(r=>server.http.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.http.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']});
try{
 const context=await browser.newContext({viewport:{width:1360,height:960},permissions:['microphone','geolocation'],geolocation:{latitude:13.75,longitude:100.5}});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 await p.addInitScript(()=>{window.__spoken=[];window.__voiceProfiles=[];window.speechSynthesis.speak=u=>{window.__spoken.push(u.text);window.__voiceProfiles.push({rate:u.rate,pitch:u.pitch});u.onstart?.();setTimeout(()=>u.onend?.(),80);};});
 await p.goto(base);await p.locator('#auth-toggle').click();await p.locator('#handle').fill('pet_tester');await p.locator('#display-name').fill('PURE Tester');await p.locator('#password').fill('test-password-123');await p.locator('#auth-submit').click();await p.locator('#app').waitFor();await p.locator('[data-tab="pet"]').click();await p.locator('[data-species="dinosaur"]').click();await p.locator('[data-species="dinosaur"].chosen').waitFor();
 await p.locator('[data-pet-jump="room"]').click();await p.locator('#pet-canvas').click();await p.screenshot({path:'docs/screenshots/10-dinosaur.png'});
 for(const {id:kind} of PET_SPECIES){await p.locator('[data-species="'+kind+'"]').click();await p.locator('[data-species="'+kind+'"].chosen').waitFor();await p.locator('[data-react="greet"]').click();const spoken=await p.evaluate(()=>({text:window.__spoken.at(-1),voice:window.__voiceProfiles.at(-1)}));assert.equal(spoken.text,getCharacter(kind).greeting);assert.ok(Math.abs(spoken.voice.rate-getCharacter(kind).rate)<.001);}
 await p.locator('[data-skin="midnight"]').click();await p.locator('[data-skin="midnight"].chosen').waitFor();await p.locator('#pet-personality').selectOption('gentle');
 const beforeVoice=await p.evaluate(()=>window.__spoken.length);await p.locator('#pet-chat-input').fill('วันนี้ดีใจมากเลย');await p.locator('#pet-chat-send').click();await p.locator('#pet-chat-history').getByText('สวัสดี วันนี้อยากชวนเราเล่นอะไรดี',{exact:true}).waitFor();assert.equal(await p.evaluate(()=>window.__spoken.length),beforeVoice+1);
 await p.locator('#pet-record').click();await p.getByRole('button',{name:'■ หยุดและส่งเสียง',exact:true}).waitFor();await p.waitForTimeout(700);await p.locator('#pet-record').click();await p.locator('#pet-chat-history').getByText('ได้ยินเสียงแล้ว มาเล่นกันนะ',{exact:true}).waitFor();assert.ok(requests.some(r=>r.options.audio?.mime==='audio/wav'));assert.ok(await p.evaluate(()=>window.__spoken.length)>=2);
 await p.locator('.companion-section').scrollIntoViewIfNeeded();await p.screenshot({path:'docs/screenshots/11-pet-ai-skins.png'});
 await p.locator('[data-tab="friends"]').click();await p.locator('#nearby-enable').click();await p.locator('#nearby-disable').waitFor();assert.equal((await context.request.get(base+'/api/nearby').then(r=>r.json())).enabled,true);
 const other=await browser.newContext({permissions:['geolocation'],geolocation:{latitude:13.76,longitude:100.51}});await other.request.post(base+'/api/register',{data:{handle:'near_friend',name:'เพื่อนใกล้ตัว',password:'test-password-123'}});await other.request.post(base+'/api/nearby',{data:{lat:13.76,lon:100.51,consent:true}});
 await p.locator('#nearby-enable').click();await p.locator('[data-nearby-request]').waitFor();await p.screenshot({path:'docs/screenshots/12-nearby.png'});await p.locator('[data-nearby-request]').click();await p.getByText('รอตอบรับ',{exact:true}).waitFor();
 await p.locator('#nearby-disable').click();await p.getByText('ยังไม่เปิดเผยตำแหน่ง',{exact:true}).waitFor();
 await p.locator('[data-tab="chats"]').click();await p.locator('.assistant-shortcut').click();await p.locator('#ai-prompt').fill('ช่วยวางแผนวันหยุด');await p.locator('#ai-submit').click();await p.locator('#assistant-history .pet-chat-message').last().getByText('สวัสดี วันนี้อยากชวนเราเล่นอะไรดี',{exact:true}).waitFor();
 const assistant=await context.request.get(base+'/api/assistant').then(r=>r.json());assert.equal(assistant.history.length,2);const pet=await context.request.get(base+'/api/pet-ai').then(r=>r.json());assert.equal(pet.history.length,4);
 await p.locator('#clear-assistant').click();await p.waitForFunction(()=>document.querySelector('#assistant-history').children.length===0);assert.deepEqual(errors,[]);
 console.log('PASS UI: all 16 species selected, unique greetings and voice rates, purchased/equipped skin, personality, pet text + captured WAV + TTS dispatch, nearby consent + friend request, independent assistant; Gemini/TTS replies are fixtures');
}finally{await browser.close();await server.close();rmSync(dir,{recursive:true,force:true});}
