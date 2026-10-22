import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter,once} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {io} from 'socket.io-client';
import {createPureServer} from '../server/index.js';
test('live audio relay, private memory, opt-out, interrupt and disconnect cleanup',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'pure-live-test-')),upstreams=[];
 class Fake extends EventEmitter{constructor(){super();this.sent=[];upstreams.push(this);setTimeout(()=>this.emit('open'),10);}send(raw){const m=JSON.parse(raw);this.sent.push(m);if(m.setup)setTimeout(()=>this.emit('message',Buffer.from(JSON.stringify({setupComplete:{}}))),5);}close(){this.closed=true;this.emit('close');}}
 const server=createPureServer({dataDir:dir,scan:false,liveKey:'fixture-key',liveConnect:()=>new Fake()});await new Promise(r=>server.http.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.http.address().port;let socket,second;
 const api=async(cookie,path,body,method)=>{const r=await fetch(base+'/api'+path,{method:method||(body?'POST':'GET'),headers:{cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});assert.equal(r.status,200);return r.json();};
 try{const users=[];for(const handle of ['live_alice','live_mint']){const r=await fetch(base+'/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({handle,name:handle,password:'test-live-password'})});users.push(r.headers.get('set-cookie').split(';')[0]);}
 await api(users[0],'/secretary/memory',{notes:'ชอบชาเขียว'});assert.equal((await api(users[1],'/secretary')).notes,'');
 socket=io(base,{extraHeaders:{Cookie:users[0]},transports:['websocket']});await once(socket,'connect');
 const ready=once(socket,'secretary:ready');assert.deepEqual(await socket.timeout(2000).emitWithAck('secretary:start',{remember:true}),{ok:true});await ready;
 assert.match(upstreams[0].sent[0].setup.systemInstruction.parts[0].text,/ชาเขียว/);
 second=io(base,{extraHeaders:{Cookie:users[0]},transports:['websocket']});await once(second,'connect');assert.ok((await second.timeout(2000).emitWithAck('secretary:start',{remember:true})).error);
 socket.emit('secretary:audio',Buffer.alloc(2048).toString('base64'));await new Promise(r=>setTimeout(r,40));assert.equal(upstreams[0].sent[1].realtimeInput.audio.mimeType,'audio/pcm;rate=16000');
 const audio=once(socket,'secretary:audio'),turn=once(socket,'secretary:turn');upstreams[0].emit('message',Buffer.from(JSON.stringify({serverContent:{modelTurn:{parts:[{inlineData:{mimeType:'audio/pcm;rate=24000',data:'AAAA'}}]},inputTranscription:{text:'ฉันชอบชาเขียว'},outputTranscription:{text:'จำไว้แล้วค่ะ'},turnComplete:true}})));assert.equal((await audio)[0].data,'AAAA');await turn;
 assert.equal((await api(users[0],'/secretary')).history.length,2);assert.equal((await api(users[1],'/secretary')).history.length,0);
 const interrupted=once(socket,'secretary:interrupted');upstreams[0].emit('message',Buffer.from(JSON.stringify({serverContent:{interrupted:true}})));await interrupted;
 const ended=once(socket,'secretary:end');socket.emit('secretary:stop');await ended;assert.equal(upstreams[0].closed,true);
 const ready2=once(socket,'secretary:ready');await socket.timeout(2000).emitWithAck('secretary:start',{remember:false});await ready2;const turn2=once(socket,'secretary:turn');upstreams[1].emit('message',Buffer.from(JSON.stringify({serverContent:{inputTranscription:{text:'ไม่บันทึกข้อความนี้'},turnComplete:true}})));await turn2;assert.equal((await api(users[0],'/secretary')).history.length,2);
 socket.disconnect();await new Promise(r=>setTimeout(r,40));assert.equal(upstreams[1].closed,true);await api(users[0],'/secretary/memory',null,'DELETE');assert.deepEqual((await api(users[0],'/secretary')).history,[]);
 }finally{socket?.disconnect();second?.disconnect();await server.close();rmSync(dir,{recursive:true,force:true});}
});
