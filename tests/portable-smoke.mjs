import { spawn,execFileSync } from 'node:child_process';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve,join } from 'node:path';
import assert from 'node:assert/strict';
const cwd=resolve('dist/PURE-Server-Windows'),data=mkdtempSync(join(tmpdir(),'pure-portable-'));
const p=spawn(process.env.ComSpec||'cmd.exe',['/d','/c','START-SERVER.cmd'],{cwd,env:{...process.env,PORT:'3102',DATA_DIR:data},windowsHide:true});
let out='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>out+=d);
try{
 let ready=false;
 for(let n=0;n<40;n++){try{const r=await fetch('http://127.0.0.1:3102/api/health');if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
 assert.ok(ready,'portable failed: '+out);
 const response=await fetch('http://127.0.0.1:3102/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({handle:'portable_test',name:'Portable test',password:'portable-pass-123'})});assert.equal(response.status,201);
 const index=await fetch('http://127.0.0.1:3102/');assert.match(await index.text(),/PURE/);
 console.log('PASS: actual START-SERVER.cmd launches bundled Node + production dependencies; health, database registration, static UI');
}finally{try{execFileSync('taskkill',['/pid',String(p.pid),'/t','/f'],{stdio:'ignore',windowsHide:true});}catch{}await new Promise(r=>setTimeout(r,300));rmSync(data,{recursive:true,force:true});}
