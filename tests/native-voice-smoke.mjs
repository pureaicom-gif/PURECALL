import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const adb='tools/android-sdk/platform-tools/adb.exe',run=(...a)=>execFileSync(adb,a,{encoding:'utf8',timeout:20000});
const fixture=createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(`<!doctype html><meta name="viewport" content="width=device-width"><body style="background:#111;color:white;font:20px sans-serif"><h1>PURE Native Test</h1><button id="voice" style="padding:30px">TEST VOICE</button><p id="result">WAIT</p><script>document.querySelector('#voice').onclick=()=>location.href='pure-tts://speak?text='+encodeURIComponent('สวัสดีจากสัตว์เลี้ยง PURE')+'&id=smoke';window.addEventListener('pure-tts-state',e=>document.querySelector('#result').textContent='TTS_'+e.detail.state);</script></body>`);});
await new Promise(r=>fixture.listen(3120,'127.0.0.1',r));
function nodes(){run('shell','uiautomator','dump','/sdcard/pure-voice.xml');return [...run('shell','cat','/sdcard/pure-voice.xml').matchAll(/<node\b[^>]*>/g)].map(m=>Object.fromEntries([...m[0].matchAll(/([\w:-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]])));}
function tap(n){assert.ok(n);const [a,b,c,d]=n.bounds.match(/\d+/g).map(Number);run('shell','input','tap',String((a+c)>>1),String((b+d)>>1));}
try{
 run('reverse','tcp:3120','tcp:3120');run('shell','am','force-stop','app.pure.chat');run('shell','am','start','-n','app.pure.chat/.MainActivity');tap(nodes().find(n=>n.class==='android.widget.EditText'));run('shell','input','keyevent','123');run('shell','input','keyevent',...Array(60).fill('67'));run('shell','input','text','http://localhost:3120');run('shell','input','keyevent','4');tap(nodes().find(n=>n.text==='เชื่อมต่อเซิร์ฟเวอร์  ↗'));tap(nodes().find(n=>n.text==='เปิดทดสอบ'));
 let tree;for(let i=0;i<12;i++){tree=nodes();if(tree.some(n=>n.text==='TEST VOICE'))break;await new Promise(r=>setTimeout(r,250));}tap(tree.find(n=>n.text==='TEST VOICE'));
 let result;for(let i=0;i<15;i++){result=nodes().find(n=>n.text.startsWith('TTS_'));if(result)break;await new Promise(r=>setTimeout(r,250));}
 assert.ok(result,'Native TTS callback did not arrive');console.log('PASS native TTS URL stays in trusted WebView and returns callback: '+result.text+' (error means Thai voice unavailable on emulator; not a live quality test)');
}finally{run('reverse','--remove','tcp:3120');run('shell','am','force-stop','app.pure.chat');await new Promise(r=>fixture.close(r));}
