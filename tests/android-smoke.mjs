import { execFileSync,spawn } from 'node:child_process';
import { readdirSync,mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const adb='tools/android-sdk/platform-tools/adb.exe';
const java='tools/jdk/'+readdirSync('tools/jdk')[0]+'/bin/java.exe';
const run=(...args)=>execFileSync(adb,args,{encoding:'utf8',timeout:20000});
const decode=s=>s.replace(/&#10;/g,'\n').replace(/&amp;/g,'&').replace(/&quot;/g,'"');
function nodes(){run('shell','uiautomator','dump','/sdcard/pure-ui.xml');const xml=run('shell','cat','/sdcard/pure-ui.xml');return [...xml.matchAll(/<node\b[^>]*>/g)].map(m=>Object.fromEntries([...m[0].matchAll(/([\w:-]+)="([^"]*)"/g)].map(a=>[a[1],decode(a[2])])));}
function tapNode(n){assert.ok(n,'UI node not found');const [x1,y1,x2,y2]=n.bounds.match(/\d+/g).map(Number);run('shell','input','tap',String(Math.round((x1+x2)/2)),String(Math.round((y1+y2)/2)));}
function tap(text){tapNode(nodes().find(n=>n.text===text));}
function screenshot(name){run('shell','screencap','-p','/sdcard/pure-screen.png');run('pull','/sdcard/pure-screen.png','docs/screenshots/'+name);}
function peer(mode,pin){const p=spawn(java,['-cp','tools/java-tests','NearbyTestPeer',mode,pin]);let out='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>out+=d);p.on('error',e=>out+=e);return {p,output:()=>out};}
async function until(fn,ms=20000){const start=Date.now();while(Date.now()-start<ms){const r=fn();if(r)return r;await new Promise(r=>setTimeout(r,350));}throw new Error('Timed out');}
mkdirSync('docs/screenshots',{recursive:true});
run('shell','am','force-stop','app.pure.chat');run('shell','am','start','-n','app.pure.chat/.MainActivity');
screenshot('07-android-launch.png');tap('ออฟไลน์ · Wi-Fi / Bluetooth');tap('สร้างห้อง Wi-Fi');
const hostState=nodes().find(n=>n.text.includes('รหัสจับคู่:'));assert.ok(hostState);const pin=hostState.text.match(/รหัสจับคู่: (\d{6})/)[1];
run('forward','tcp:39877','tcp:39876');
const client=peer('client',pin);
try{
 await until(()=>client.output().includes('ANDROID_ACK_RECEIVED'));
 let tree=nodes();assert.ok(tree.some(n=>n.text.includes('สวัสดีจากโหมดออฟไลน์ PURE')));
 tapNode(tree.find(n=>n.class==='android.widget.EditText'));run('shell','input','text','Hello-nearby');run('shell','input','keyevent','4');tap('ส่ง ↗');await until(()=>client.output().includes('PASS_NATIVE_BIDIRECTIONAL'));
 assert.ok(nodes().some(n=>n.text.includes('ถึงเครื่องเพื่อนแล้ว')));screenshot('08-android-offline-wifi.png');
 console.log('PASS Android Wi-Fi host: encrypted Unicode message received, reply sent and ACK rendered');
}finally{client.p.kill();run('forward','--remove','tcp:39877');}
tap('ยกเลิกการเชื่อมต่อ / ปิดห้อง');
const host=peer('host','246810');
try{
 await until(()=>host.output().includes('LISTENING'));tap('เข้าห้อง Wi-Fi');let edits=nodes().filter(n=>n.class==='android.widget.EditText');tapNode(edits[0]);run('shell','input','text','10.0.2.2');edits=nodes().filter(n=>n.class==='android.widget.EditText');tapNode(edits[1]);run('shell','input','text','246810');tap('เชื่อมต่อ');await until(()=>host.output().includes('ANDROID_ACK_RECEIVED'));
 tapNode(nodes().find(n=>n.class==='android.widget.EditText'));run('shell','input','text','Hello-nearby');run('shell','input','keyevent','4');tap('ส่ง ↗');await until(()=>host.output().includes('PASS_NATIVE_BIDIRECTIONAL'));
 console.log('PASS Android Wi-Fi client: connects to host and exchanges acknowledged encrypted messages');
}finally{host.p.kill();}
tap('ยกเลิกการเชื่อมต่อ / ปิดห้อง');run('shell','input','keyevent','4');
tap('เชื่อมต่อเซิร์ฟเวอร์  ↗');tap('เปิดทดสอบ');await until(()=>nodes().some(n=>n.text.includes('กลับมาเจอกันอีกแล้ว')),30000);screenshot('09-android-online-login.png');
console.log('PASS APK install/launch, nearby host/client, online WebView loads server UI');
