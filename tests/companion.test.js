import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPureServer} from '../server/index.js';
import {createGemini} from '../server/gemini.js';
import {PET_SPECIES} from '../public/pet-catalog.js';

test('AI pets, skins, nearby consent, request flow, separate private assistant',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'pure-v02-')),calls=[];
 const fake={status:()=>({configured:true,model:'fixture'}),generate:async(prompt,options)=>{calls.push({prompt,options});return {text:'สวัสดี เรามาเล่นด้วยกันนะ',model:'fixture'};}};
 const server=createPureServer({dataDir:dir,scan:false,gemini:fake});await new Promise(r=>server.http.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.http.address().port;
 t.after(async()=>{await server.close();rmSync(dir,{recursive:true,force:true});});
 async function api(path,body,cookie,method){const r=await fetch(base+'/api'+path,{method:method||(body?'POST':'GET'),headers:{...(cookie?{Cookie:cookie}:{}),...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 async function user(handle){return api('/register',{handle,name:handle,password:'test-pass-123'});}
 const a=await user('owner_pet'),b=await user('friend_near'),c=await user('private_user');
 await t.test('species selection and paid skins persist without double charge',async()=>{
  for(const s of PET_SPECIES){const r=await api('/pet',{name:'น้องนุ่ม',kind:s.id},a.cookie);assert.equal(r.status,200);assert.equal(r.data.pet.kind,s.id);}
  assert.equal((await api('/pet',{name:'x',kind:'not-a-species'},a.cookie)).status,400);
  const bought=await api('/pet-ai/skin',{skin:'midnight',price:0},a.cookie);assert.equal(bought.data.pet.coins,60);assert.equal(bought.data.pet.skin,'midnight');
  assert.equal((await api('/pet-ai/skin',{skin:'midnight'},a.cookie)).data.pet.coins,60);
  assert.equal((await api('/pet-ai/skin',{skin:'wizard'},a.cookie)).status,400);
  await api('/pet-ai/personality',{personality:'gentle'},a.cookie);assert.equal((await api('/pet',null,a.cookie)).data.pet.personality,'gentle');
 });
 await t.test('AI pet context private, limited and distinct from assistant',async()=>{
  assert.equal((await api('/pet-ai')).status,401);await api('/pet-ai/chat',{text:'วันนี้มีความสุข'},a.cookie);
  assert.match(calls.at(-1).options.system,/น้องนุ่ม/);assert.equal(calls.at(-1).options.history.length,0);
  await api('/pet-ai/chat',{text:'จำที่คุยได้ไหม'},a.cookie);assert.equal(calls.at(-1).options.history.length,2);
  assert.equal((await api('/pet-ai',null,b.cookie)).data.history.length,0);
  await api('/assistant',{prompt:'ช่วยร่างข้อความ'},a.cookie);assert.match(calls.at(-1).options.system,/PURE AI/);assert.equal(calls.at(-1).options.history.length,0);
  assert.equal((await api('/assistant',null,a.cookie)).data.history.length,2);assert.equal((await api('/pet-ai',null,a.cookie)).data.history.length,4);
  await api('/pet-ai/history',null,a.cookie,'DELETE');assert.equal((await api('/pet-ai',null,a.cookie)).data.history.length,0);assert.equal((await api('/assistant',null,a.cookie)).data.history.length,2);
 });
 await t.test('microphone upload forwarded as WAV, never saved as a file',async()=>{
  const wav=Buffer.alloc(100);wav.write('RIFF',0);wav.writeUInt32LE(92,4);wav.write('WAVE',8);const form=new FormData();form.append('audio',new Blob([wav],{type:'audio/wav'}),'voice.wav');const r=await api('/pet-ai/voice',form,a.cookie);assert.equal(r.status,200);assert.equal(calls.at(-1).options.audio.mime,'audio/wav');assert.equal(Buffer.from(calls.at(-1).options.audio.data,'base64').length,100);
  const invalid=new FormData();invalid.append('audio',new Blob(['not audio'],{type:'audio/wav'}),'wrong.wav');assert.equal((await api('/pet-ai/voice',invalid,a.cookie)).status,400);
  assert.equal(server.db.prepare('SELECT COUNT(*) n FROM files').get().n,0);
 });
 await t.test('nearby is mutual opt-in, approximate and excludes private/blocked users',async()=>{
  assert.equal((await api('/nearby',null,a.cookie)).data.enabled,false);
  assert.equal((await api('/nearby',{lat:13.75,lon:100.5},a.cookie)).status,400);
  await api('/nearby',{lat:13.75345,lon:100.50432,consent:true},a.cookie);
  assert.equal((await api('/nearby',null,a.cookie)).data.users.length,0);
  await api('/nearby',{lat:13.76,lon:100.51,consent:true},b.cookie);
  const list=(await api('/nearby',null,a.cookie)).data.users;assert.equal(list.length,1);assert.equal(list[0].id,b.data.user.id);assert.ok(!('lat' in list[0]));assert.ok(!('lon' in list[0]));assert.ok(!list.some(u=>u.id===c.data.user.id));
  assert.equal(server.db.prepare('SELECT lat FROM nearby_locations WHERE owner=?').get(a.data.user.id).lat,13.75);
  await api('/friends',{id:b.data.user.id},a.cookie);const req=(await api('/friends',null,b.cookie)).data.friends[0];assert.equal(req.incoming,true);assert.equal(req.status,'pending');
  await api('/friends/'+a.data.user.id+'/respond',{accept:true},b.cookie);assert.equal((await api('/friends',null,a.cookie)).data.friends[0].status,'accepted');
  await api('/block/'+b.data.user.id,{},a.cookie);assert.equal((await api('/nearby',null,a.cookie)).data.users.length,0);
  await api('/nearby',null,b.cookie,'DELETE');assert.equal((await api('/nearby',null,b.cookie)).data.enabled,false);
  server.db.prepare('UPDATE nearby_locations SET expires=0 WHERE owner=?').run(a.data.user.id);assert.equal((await api('/nearby',null,a.cookie)).data.enabled,false);
 });
});
test('Gemini native request contains system, role history and audio',async()=>{
 let request;const g=createGemini({key:'fake',model:'mock',fetcher:async(url,options)=>{request=JSON.parse(options.body);return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:'answer'}]}}]})};}});
 await g.generate('speak',{system:'pet instructions',history:[{role:'user',text:'hi'},{role:'model',text:'hello'}],audio:{mime:'audio/wav',data:'AA=='}});
 assert.equal(request.systemInstruction.parts[0].text,'pet instructions');assert.equal(request.contents.length,3);assert.equal(request.contents[2].parts[1].inlineData.mimeType,'audio/wav');
});

test('pet voice synthesis, chirp sound cues, activity speech and toggle state', async () => {
 const {
  isPetVoiceEnabled,
  setPetVoiceEnabled,
  playPetChirp,
  speak,
  speakPetActivity,
  stopSpeakingVoice
 } = await import('../public/pet-companion.js');

 const storage = new Map();
 globalThis.localStorage = {
  getItem: k => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v))
 };

 assert.equal(isPetVoiceEnabled(), true);
 setPetVoiceEnabled(false);
 assert.equal(isPetVoiceEnabled(), false);
 setPetVoiceEnabled(true);
 assert.equal(isPetVoiceEnabled(), true);

 let androidSpoke = null;
 globalThis.PureAndroid = {
  speakText: (text, rate, pitch) => {
   androidSpoke = { text, rate, pitch };
   return true;
  },
  stopSpeak: () => {
   androidSpoke = null;
  }
 };

 speak('สวัสดีโฮสต์จ้า ฅ', true, () => {}, { rate: 1.05, pitch: 1.2 }, 'cat');
 assert.ok(androidSpoke);
 assert.match(androidSpoke.text, /สวัสดีโฮสต์จ้า/);
 assert.equal(androidSpoke.rate, 1.05);

 let bubbleText = '';
 globalThis.document = {
  querySelector: sel => {
   if (sel === '.pet-speech-bubble') return { set textContent(v) { bubbleText = v; }, get textContent() { return bubbleText; } };
   return null;
  }
 };

 speakPetActivity('feed', { kind: 'cat', name: 'เหมียวน้อย' });
 assert.ok(bubbleText.length > 0);
 assert.ok(androidSpoke);

 speakPetActivity('play', { kind: 'dog', name: 'ตูบน้อย' });
 assert.ok(bubbleText.length > 0);

 speakPetActivity('wash', { kind: 'rabbit', name: 'กระต่าย' });
 assert.ok(bubbleText.length > 0);

 speakPetActivity('sleep', { kind: 'bear', name: 'หมีน้อย' });
 assert.ok(bubbleText.length > 0);

 assert.doesNotThrow(() => {
  playPetChirp('cat', 'feed');
  playPetChirp('dog', 'play');
  playPetChirp('chick', 'wash');
  playPetChirp('frog', 'sleep');
  playPetChirp('panda', 'greet');
 });

 stopSpeakingVoice();
 assert.equal(androidSpoke, null);

 delete globalThis.localStorage;
 delete globalThis.PureAndroid;
 delete globalThis.document;
});

