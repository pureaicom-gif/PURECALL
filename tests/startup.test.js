import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('occupied port identifies PURE versus another application without crashing or stopping either',async()=>{
 for(const pure of [true,false]){
 const dir=mkdtempSync(join(tmpdir(),'pure-startup-')),http=createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(pure?{ok:true,name:'PURE',version:'test'}:{name:'other'}));});
 await new Promise(r=>http.listen(0,'127.0.0.1',r));
 try{const child=spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:String(http.address().port),HOST:'127.0.0.1',DATA_DIR:dir,GEMINI_API_KEY:'',GEMINI_MODEL:''},windowsHide:true});let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
 const code=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{child.kill();reject(Error('startup did not exit'));},10000);child.on('exit',code=>{clearTimeout(timeout);resolve(code);});child.on('error',reject);});
 assert.equal(code,pure?0:1);assert.match(output,pure?/already running/:/already used by another application/);assert.doesNotMatch(output,/Unhandled|throw er/);assert.equal((await fetch('http://127.0.0.1:'+http.address().port)).status,200);
 }finally{await new Promise(r=>http.close(r));rmSync(dir,{recursive:true,force:true});}
 }
});
