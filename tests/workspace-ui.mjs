import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPureServer} from '../server/index.js';
const dir=mkdtempSync(join(tmpdir(),'pure-workspace-')),server=createPureServer({dataDir:dir,scan:false});
await new Promise(r=>server.http.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.http.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
try{
 const a=await browser.newContext({viewport:{width:1440,height:960}}),b=await browser.newContext(),c=await browser.newContext();
 const post=async(ctx,path,data)=>{const r=await ctx.request.post(base+'/api'+path,{data});assert.ok(r.ok(),await r.text());return r.json();};
 const alice=(await post(a,'/register',{handle:'workspace_alice',name:'Alice · อลิซ',password:'workspace-pass-123'})).user;
 const mint=(await post(b,'/register',{handle:'workspace_mint',name:'Mint · มิ้นท์',password:'workspace-pass-123'})).user;
 const moon=(await post(c,'/register',{handle:'workspace_moon',name:'Moon · มูน',password:'workspace-pass-123'})).user;
 for(const [ctx,user] of [[b,mint],[c,moon]]){await post(a,'/friends',{id:user.id});await post(ctx,'/friends/'+alice.id+'/respond',{accept:true});}
 await post(b,'/messages/'+alice.id,{text:'เย็นนี้ไปเดินเล่นกันไหม',clientId:'workspace-message-one'});
 const p=await a.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base);await p.locator('#app').waitFor({state:'visible'});
 await p.locator('[data-filter="unread"]').click();await p.locator(`[data-peer="${mint.id}"]`).waitFor();assert.equal(await p.locator('[data-peer]').count(),1);
 await p.locator('[data-filter="all"]').click();await p.locator(`[data-peer="${mint.id}"]`).click();
 await p.locator('#message-input').fill('ร่างสำหรับมิ้นท์');await p.locator(`[data-peer="${moon.id}"]`).click();assert.equal(await p.locator('#message-input').inputValue(),'');
 await p.locator('#message-input').fill('ร่างสำหรับมูน');await p.locator(`[data-peer="${mint.id}"]`).click();assert.equal(await p.locator('#message-input').inputValue(),'ร่างสำหรับมิ้นท์');
 await p.reload();await p.locator(`[data-peer="${mint.id}"]`).click();assert.equal(await p.locator('#message-input').inputValue(),'ร่างสำหรับมิ้นท์');
 await p.locator('#send-button').click();await p.locator('#messages').getByText('ร่างสำหรับมิ้นท์',{exact:true}).waitFor();
 await p.locator(`[data-peer="${moon.id}"]`).click();await p.locator(`[data-peer="${mint.id}"]`).click();assert.equal(await p.locator('#message-input').inputValue(),'');
 await p.locator('#file-input').setInputFiles({name:'weekend-plan.txt',mimeType:'text/plain',buffer:Buffer.from('Weekend plan')});await p.locator('#messages').getByText(/weekend-plan.txt/).waitFor();
 await p.locator('#search-room').click();await p.locator('#room-query').fill('เดินเล่น');assert.equal(await p.locator('.message:visible').count(),1);
 await p.locator('#room-query').fill('');await p.locator('#room-files').check();assert.equal(await p.locator('.message:visible').count(),1);assert.match(await p.locator('.message:visible').innerText(),/weekend-plan/);
 await p.locator('#search-room').click();assert.equal(await p.locator('.message:visible').count(),3);
 await p.screenshot({path:'docs/screenshots/20-workspace-chat.png'});
 await p.locator('.assistant-shortcut').first().click();await p.locator('.assistant-ideas button').first().click();assert.match(await p.locator('#ai-prompt').inputValue(),/คำทักทาย/);await p.screenshot({path:'docs/screenshots/21-workspace-assistant.png'});await p.locator('[data-close="ai-dialog"]').click();
 await p.locator('[data-tab="friends"]').click();await p.locator('.nearby-card h3').waitFor();assert.equal(await p.locator('.circle-stats strong').first().innerText(),'2');await p.screenshot({path:'docs/screenshots/22-workspace-friends.png'});
 await p.setViewportSize({width:390,height:844});await p.screenshot({path:'docs/screenshots/23-workspace-friends-mobile.png'});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await p.locator('[data-tab="chats"]').click();await p.locator(`[data-peer="${mint.id}"]`).click();await p.screenshot({path:'docs/screenshots/24-workspace-chat-mobile.png'});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);console.log('PASS: unread filter, per-peer drafts across reload, sent draft cleared, text/file search, assistant suggestions, friend totals, desktop/mobile no overflow');
}finally{await browser.close();await server.close();rmSync(dir,{recursive:true,force:true});}
