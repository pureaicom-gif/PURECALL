// PURE service worker: shows incoming-call / message notifications while the app is closed.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('push',e=>{
 let d={};try{d=e.data?.json()||{};}catch{d={title:'PURE',body:e.data?.text()};}
 const call=d.type==='call'||d.type==='gcall';
 e.waitUntil(self.registration.showNotification(d.title||'PURE',{body:d.body||'',icon:'/logo.svg',badge:'/logo.svg',tag:d.tag||d.type||'pure',renotify:true,requireInteraction:call,vibrate:call?[400,200,400,200,400]:[120],data:{url:d.url||'/'},actions:call?[{action:'open',title:'รับสาย'},{action:'dismiss',title:'ปฏิเสธ'}]:[]}));
});
self.addEventListener('notificationclick',e=>{
 e.notification.close();if(e.action==='dismiss')return;
 const url=new URL(e.notification.data?.url||'/',self.location.origin).href;
 e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{for(const c of list){if(new URL(c.url).origin===self.location.origin){c.navigate(url).catch(()=>{});return c.focus();}}return self.clients.openWindow(url);}));
});
