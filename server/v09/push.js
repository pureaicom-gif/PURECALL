// Incoming-call / message notifications while the app is closed.
// Web Push (VAPID) works out of the box (keys auto-generated into DATA_DIR/vapid.json unless VAPID_* env is set).
// FCM (Android native) is enabled only when FCM_SERVICE_ACCOUNT (path or inline JSON) is configured.
import webpush from 'web-push';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createSign} from 'node:crypto';

export function createPush({db,dataDir,log,fetcher=fetch}){
 let vapid={publicKey:process.env.VAPID_PUBLIC_KEY,privateKey:process.env.VAPID_PRIVATE_KEY};
 if(!vapid.publicKey||!vapid.privateKey){const file=join(dataDir,'vapid.json');if(existsSync(file))vapid=JSON.parse(readFileSync(file,'utf8'));else{vapid=webpush.generateVAPIDKeys();writeFileSync(file,JSON.stringify(vapid),{mode:0o600});}}
 webpush.setVapidDetails(process.env.VAPID_SUBJECT||'mailto:admin@purefxai.store',vapid.publicKey,vapid.privateKey);
 let fcm=null;const fcmRaw=process.env.FCM_SERVICE_ACCOUNT;
 if(fcmRaw){try{fcm=JSON.parse(fcmRaw.trim().startsWith('{')?fcmRaw:readFileSync(fcmRaw,'utf8'));}catch(e){log.warn('fcm config invalid',{error:e.message});}}
 let fcmToken=null;
 async function fcmAccess(){
  if(fcmToken&&fcmToken.exp>Date.now()+60000)return fcmToken.token;
  const now=Math.floor(Date.now()/1000),b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned=b64({alg:'RS256',typ:'JWT'})+'.'+b64({iss:fcm.client_email,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
  const sig=createSign('RSA-SHA256').update(unsigned).sign(fcm.private_key).toString('base64url');
  const r=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion='+unsigned+'.'+sig,signal:AbortSignal.timeout(10000)});
  const j=await r.json();if(!r.ok)throw new Error('FCM auth '+r.status);fcmToken={token:j.access_token,exp:Date.now()+j.expires_in*1000};return fcmToken.token;
 }
 const subs=uid=>db.prepare('SELECT * FROM push_subscriptions WHERE user_id=?').all(uid);
 const drop=id=>db.prepare('DELETE FROM push_subscriptions WHERE id=?').run(id);
 async function send(uid,payload,{ttl=45,urgency='high'}={}){
  let delivered=0;
  for(const s of subs(uid)){
   try{
    if(s.kind==='web'){await webpush.sendNotification({endpoint:s.endpoint,keys:JSON.parse(s.keys)},JSON.stringify(payload),{TTL:ttl,urgency});delivered++;}
    else if(fcm){const token=await fcmAccess();const r=await fetcher(`https://fcm.googleapis.com/v1/projects/${fcm.project_id}/messages:send`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({message:{token:s.endpoint,data:Object.fromEntries(Object.entries(payload).map(([k,v])=>[k,typeof v==='string'?v:JSON.stringify(v)])),android:{priority:'high',ttl:ttl+'s'}}}),signal:AbortSignal.timeout(10000)});if(r.status===404||r.status===400)drop(s.id);else if(r.ok)delivered++;}
   }catch(e){if(e.statusCode===404||e.statusCode===410)drop(s.id);else log.warn('push failed',{kind:s.kind,error:e.message});}
  }
  return delivered;
 }
 return {
  publicKey:vapid.publicKey,fcmEnabled:!!fcm,send,
  has:uid=>subs(uid).some(s=>s.kind==='web'||fcm),
  subscribe(uid,{kind,endpoint,keys}){db.prepare('INSERT INTO push_subscriptions(user_id,kind,endpoint,keys,created) VALUES(?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,keys=excluded.keys').run(uid,kind,endpoint,keys?JSON.stringify(keys):null,Date.now());},
  unsubscribe(uid,endpoint){db.prepare('DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?').run(uid,endpoint);},
 };
}
