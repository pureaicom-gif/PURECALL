import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {io} from 'socket.io-client';
import {createPureServer} from '../server/index.js';
import {migrate,MIGRATIONS} from '../server/v09/migrations.js';
import {sniff} from '../server/v09/sniff.js';
import {validJwk,E2E_RE} from '../server/v09/features.js';

const PNG=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4ae0000000049454e44ae426082','hex');
const jwk=()=>({kty:'EC',crv:'P-256',x:Buffer.alloc(32,1).toString('base64url'),y:Buffer.alloc(32,2).toString('base64url')});

async function boot(t,extra={}){
 const dir=mkdtempSync(join(tmpdir(),'pure-v09-')),captions=[];
 const gemini={status:()=>({configured:true}),scan(){},async generate(prompt,{audio}={}){captions.push({prompt,audio});return {text:'```json\n{"text":"สวัสดีครับ","translations":{"en":"Hello"}}\n```'};}};
 const server=createPureServer({dataDir:dir,scan:false,gemini,...extra});
 await new Promise(r=>server.http.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.http.address().port,sockets=[];
 t.after(async()=>{sockets.forEach(s=>s.disconnect());await server.close();rmSync(dir,{recursive:true,force:true});});
 async function req(path,body,cookie,method){const res=await fetch(base+path,{method:method||(body?'POST':'GET'),headers:{...(body instanceof FormData||!body?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});const type=res.headers.get('content-type')||'';return {status:res.status,headers:res.headers,data:type.includes('json')?await res.json():await res.text(),cookie:res.headers.get('set-cookie')?.split(';')[0]};}
 async function user(handle){const r=await req('/api/register',{handle,name:handle,password:'a-correct-password'});assert.equal(r.status,201);return {id:r.data.user.id,cookie:r.cookie};}
 async function befriend(a,b){await req('/api/friends',{id:b.id},a.cookie);assert.equal((await req('/api/friends/'+a.id+'/respond',{accept:true},b.cookie)).status,200);}
 async function connect(u){const s=io(base,{extraHeaders:{Cookie:u.cookie},transports:['websocket'],forceNew:true});sockets.push(s);await new Promise((ok,no)=>{s.once('connect',ok);s.once('connect_error',no);});return s;}
 const event=(s,name,ms=3000)=>new Promise((ok,no)=>{const tm=setTimeout(()=>{s.off(name,done);no(new Error('timeout '+name));},ms);function done(d){clearTimeout(tm);ok(d);}s.once(name,done);});
 const emit=(s,name,data)=>new Promise(ok=>s.emit(name,data,ok));
 return {server,base,req,user,befriend,connect,event,emit,captions,dir};
}

test('migrations are versioned and idempotent; sniffing and validators',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE users(id TEXT PRIMARY KEY);CREATE TABLE messages(id INTEGER PRIMARY KEY,text TEXT)');
 assert.deepEqual(migrate(db),MIGRATIONS.map(m=>m.version));assert.deepEqual(migrate(db),[]);
 assert.ok(db.prepare('PRAGMA table_info(messages)').all().some(c=>c.name==='encrypted'));
 assert.equal(sniff(PNG),'image/png');assert.equal(sniff(Buffer.from('<html><script>alert(1)</script>')),null);
 assert.equal(sniff(Buffer.from([0x1a,0x45,0xdf,0xa3,0,0,0,0,0,0,0,0])),'video/webm');
 assert.ok(validJwk(jwk()));assert.ok(!validJwk({...jwk(),d:'secret'}));assert.ok(!validJwk({...jwk(),crv:'P-384'}));
 assert.ok(E2E_RE.test('e2e1:'+'A'.repeat(16)+':'+'B'.repeat(40)));assert.ok(!E2E_RE.test('e2e1:short:xx'));
});

test('healthz, security headers, JSON errors without stacks',async t=>{
 const {req,base}=await boot(t);
 const h=await req('/healthz');assert.equal(h.status,200);assert.equal(h.data.ok,true);assert.equal(h.data.version,'0.12.0');
 assert.match(h.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.match(h.headers.get('content-security-policy'),/worker-src 'self'/);
 assert.equal(h.headers.get('x-powered-by'),null);
 const bad=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{oops'});assert.equal(bad.status,400);const body=await bad.text();assert.doesNotMatch(body,/at |SyntaxError/);
 const r=await req('/api/health');assert.equal(r.data.version,'0.12.0');
});

test('E2E: public-key directory, ciphertext-only storage, legacy plaintext still works',async t=>{
 const {req,user,befriend,server}=await boot(t);const a=await user('e2e_a'),b=await user('e2e_b'),c=await user('e2e_c');await befriend(a,b);
 assert.equal((await req('/api/e2e/key',{jwk:{...jwk(),d:'leak'}},a.cookie,'PUT')).status,400);
 const put=await req('/api/e2e/key',{jwk:jwk()},a.cookie,'PUT');assert.equal(put.status,200);assert.match(put.data.fingerprint,/^[0-9a-f]{64}$/);
 assert.equal((await req('/api/e2e/key/'+a.id,null,b.cookie)).data.fingerprint,put.data.fingerprint);
 assert.equal((await req('/api/e2e/key/'+a.id,null,c.cookie)).status,403);
 assert.equal((await req('/api/e2e/key/'+b.id,null,a.cookie)).status,404);
 const ct='e2e1:'+Buffer.alloc(12,7).toString('base64url')+':'+Buffer.alloc(64,9).toString('base64url');
 const sent=await req('/api/messages/'+b.id,{text:ct,clientId:'e1'},a.cookie);assert.equal(sent.status,201);
 assert.equal((await req('/api/messages/'+b.id,{text:'e2e1:not valid!',clientId:'e2'},a.cookie)).status,400);
 assert.equal((await req('/api/messages/'+b.id,{text:'สวัสดีแบบเดิม',clientId:'e3'},a.cookie)).status,201);
 const rows=server.db.prepare('SELECT text,encrypted FROM messages ORDER BY id').all();
 assert.deepEqual(rows.map(r=>r.encrypted),[1,0]);assert.equal(rows[0].text,ct);
 const list=(await req('/api/messages/'+a.id,null,b.cookie)).data.messages;assert.equal(list.length,2);assert.equal(list[0].text,ct);
});

test('Stories: text/image, mime sniffing, visibility, viewers, 24h expiry',async t=>{
 const {req,user,befriend,server}=await boot(t);const a=await user('st_a'),b=await user('st_b'),c=await user('st_c');await befriend(a,b);
 assert.equal((await req('/api/stories',(()=>{const f=new FormData();return f;})(),a.cookie)).status,400);
 const tf=new FormData();tf.set('text','วันนี้อากาศดี');tf.set('bg','#101010');const text=await req('/api/stories',tf,a.cookie);assert.equal(text.status,201);assert.equal(text.data.story.kind,'text');
 const fake=new FormData();fake.set('media',new Blob(['<script>x</script>'],{type:'image/png'}),'x.png');assert.equal((await req('/api/stories',fake,a.cookie)).status,415);
 const img=new FormData();img.set('media',new Blob([PNG],{type:'application/octet-stream'}),'p.png');const pic=await req('/api/stories',img,a.cookie);assert.equal(pic.status,201);assert.equal(pic.data.story.mime,'image/png');
 const feedB=(await req('/api/stories',null,b.cookie)).data.reels;assert.equal(feedB.length,1);assert.equal(feedB[0].items.length,2);assert.equal(feedB[0].unseen,true);
 assert.equal((await req('/api/stories',null,c.cookie)).data.reels.length,0);
 assert.equal((await req(pic.data.story.media,null,c.cookie)).status,404);
 const media=await req(pic.data.story.media,null,b.cookie);assert.equal(media.status,200);assert.equal(media.headers.get('content-type'),'image/png');
 assert.equal((await req('/api/stories/'+pic.data.story.id+'/view',{},b.cookie)).status,200);
 assert.equal((await req('/api/stories',null,b.cookie)).data.reels[0].items[1].seen,true);
 assert.equal((await req('/api/stories/'+pic.data.story.id+'/viewers',null,b.cookie)).status,403);
 const v=await req('/api/stories/'+pic.data.story.id+'/viewers',null,a.cookie);assert.deepEqual(v.data.viewers.map(x=>x.id),[b.id]);
 server.db.prepare('UPDATE stories SET expires=?').run(Date.now()-1);
 assert.equal((await req('/api/stories',null,b.cookie)).data.reels.length,0);
 assert.equal(server.db.prepare('SELECT COUNT(*) n FROM stories').get().n,0);
});

test('Push: VAPID config, validated subscriptions, offline friend can be rung',async t=>{
 const {req,user,befriend,connect,emit,base}=await boot(t);const a=await user('pu_a'),b=await user('pu_b');await befriend(a,b);
 const cfg=await req('/api/push/config',null,a.cookie);assert.match(cfg.data.vapidPublicKey,/^[A-Za-z0-9_-]{80,}$/);assert.equal(cfg.data.fcm,false);
 assert.equal((await req('/api/push/subscribe',{endpoint:'http://insecure',keys:{p256dh:'x',auth:'y'}},b.cookie)).status,400);
 const sa=await connect(a);
 assert.equal((await emit(sa,'call:start',{peer:b.id,video:false})).error,'เพื่อนออฟไลน์');
 assert.equal((await req('/api/push/subscribe',{endpoint:'https://push.invalid/abc',keys:{p256dh:'BNc'+'a'.repeat(84),auth:'a'.repeat(22)}},b.cookie)).status,201);
 const ring=await emit(sa,'call:start',{peer:b.id,video:true});assert.ok(ring.id,'call allowed while peer offline thanks to push');
 const sb=io(base,{extraHeaders:{Cookie:b.cookie},transports:['websocket'],forceNew:true});t.after(()=>sb.disconnect());
 const incoming=await new Promise((ok,no)=>{sb.once('call:incoming',ok);setTimeout(()=>no(new Error('no redelivery')),3000);});assert.equal(incoming.id,ring.id);assert.equal(incoming.video,true);
});

test('Group call mesh signaling, 6-person cap, captions with translation, recording notice',async t=>{
 const {req,user,befriend,connect,event,emit,captions}=await boot(t);
 const owner=await user('gc_owner');const others=[];for(let i=0;i<6;i++){const u=await user('gc_m'+i);await befriend(owner,u);others.push(u);}
 const g=(await req('/api/groups',{name:'ทีม',memberIds:others.map(o=>o.id)},owner.cookie)).data.group;
 for(const o of others)assert.equal((await req('/api/groups/'+g.id+'/invite-response',{accept:true},o.cookie)).status,200);
 const outsider=await user('gc_out');
 const so=await connect(owner),ss=[];for(const o of others)ss.push(await connect(o));const sx=await connect(outsider);
 assert.ok((await emit(sx,'gcall:start',{groupId:g.id})).error);
 const ringP=event(ss[0],'gcall:ring');const {room}=await emit(so,'gcall:start',{groupId:g.id,video:true});assert.ok(room);assert.equal((await ringP).room,room);
 const j0=await emit(so,'gcall:join',{room});assert.deepEqual(j0.peers,[]);
 const joinedP=event(so,'gcall:joined');const j1=await emit(ss[0],'gcall:join',{room});assert.deepEqual(j1.peers.map(p=>p.id),[owner.id]);assert.equal((await joinedP).user.id,others[0].id);
 const sigP=event(so,'gcall:signal');ss[0].emit('gcall:signal',{room,to:owner.id,signal:{type:'offer',sdp:'v=0'}});const sig=await sigP;assert.equal(sig.from,others[0].id);assert.equal(sig.signal.type,'offer');
 assert.ok((await emit(sx,'gcall:join',{room})).error);
 for(let i=1;i<5;i++)assert.ok((await emit(ss[i],'gcall:join',{room})).room);
 assert.match((await emit(ss[5],'gcall:join',{room})).error,/6/);
 // captions
 ss[0].emit('caption:lang',{lang:'en'});await new Promise(r=>setTimeout(r,50));
 const capP=event(ss[0],'caption');const ack=await emit(so,'caption:audio',{room,data:Buffer.from('fakeaudio').toString('base64'),mime:'audio/webm;codecs=opus',lang:'th'});assert.equal(ack.ok,true);
 const cap=await capP;assert.equal(cap.text,'สวัสดีครับ');assert.equal(cap.translation,'Hello');assert.equal(captions[0].audio.mime,'audio/webm');
 assert.ok((await emit(sx,'caption:audio',{room,data:'AAAA',mime:'audio/webm',lang:'th'})).error);
 assert.ok((await emit(so,'caption:audio',{room,data:'AAAA',mime:'text/html',lang:'th'})).error);
 const recP=event(ss[1],'call:recording');so.emit('call:recording',{room,active:true});const rec=await recP;assert.equal(rec.by.id,owner.id);assert.equal(rec.active,true);
 const leftP=event(so,'gcall:left');ss[0].emit('gcall:leave',{room});assert.equal((await leftP).user,others[0].id);
});

test('Helper relay: sealed E2E envelopes deliver once; forged/redirected/plaintext rejected',async t=>{
 const {sealEnvelope}=await import('../server/v09/relay.js');
 const {req,user,befriend}=await boot(t);const a=await user('relaya'),b=await user('relayb'),c=await user('relayc');await befriend(a,b);
 const k=(await req('/api/relay/key',null,a.cookie)).data.key;assert.ok(k.length>20);
 const text='e2e1:'+'A'.repeat(16)+':'+'C'.repeat(40),ts=Date.now();
 const env=sealEnvelope(k,{from:a.id,to:b.id,clientId:'r1',ts,text});
 const send=envs=>req('/api/relay/deliver',{envelopes:envs});
 let r=await send([env,{...env,to:c.id},{...env,clientId:'r2'},sealEnvelope(k,{from:a.id,to:b.id,clientId:'r3',ts,text:'hello plain'}),sealEnvelope(k,{from:a.id,to:c.id,clientId:'r4',ts,text}),sealEnvelope(k,{from:a.id,to:b.id,clientId:'r5',ts:ts-8*86400000,text})]);
 assert.deepEqual(r.data.results.map(x=>x.status),['delivered','bad-mac','bad-mac','not-e2e','not-friends','expired']);
 assert.equal((await send([env])).data.results[0].status,'duplicate');
 const msgs=(await req('/api/messages/'+a.id,null,b.cookie)).data;const list=msgs.messages||msgs;assert.equal(list.filter(m=>m.client_id==='r1'||m.clientId==='r1').length,1);
 assert.equal((await req('/api/relay/key')).status,401);
});
