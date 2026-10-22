import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPureServer} from '../server/index.js';

const dir=mkdtempSync(join(tmpdir(),'pure-admin-ui-'));
const server=createPureServer({dataDir:dir,scan:false});
await new Promise(resolve=>server.http.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.http.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('pageerror',error=>errors.push(error.message));
  const registration=await page.request.post(base+'/api/register',{data:{handle:'admin_ui',name:'Admin UI',password:'admin-ui-pass-123'}});
  assert.equal(registration.status(),201);
  const {user}=await registration.json();
  server.db.prepare("UPDATE users SET role='admin' WHERE id=?").run(user.id);
  await page.context().clearCookies();

  await page.goto(base+'/admin');
  assert.equal(await page.locator('link[rel="stylesheet"][href="/admin.css"]').count(),1);
  assert.equal(await page.locator('body').evaluate(element=>getComputedStyle(element).backgroundColor),'rgb(11, 13, 17)');
  await page.locator('#login-handle').fill('admin_ui');
  await page.locator('#login-password').fill('admin-ui-pass-123');
  await page.locator('#login-btn').click();
  await page.locator('.dashboard-intro').waitFor({state:'visible'});
  await page.getByRole('tab',{name:'ผู้ใช้และบัญชี'}).click();
  await page.locator('#tab-users').waitFor({state:'visible'});
  await page.locator('#search-user').fill('admin_ui');
  await page.getByText('@admin_ui',{exact:true}).waitFor({state:'visible'});
  await page.getByRole('tab',{name:'สถานะ AI'}).click();
  await page.locator('#tab-ai').waitFor({state:'visible'});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors.filter(error=>error.includes('Content Security Policy')),[]);
  console.log('PASS admin UI: CSP-safe styling/scripts, admin login, dashboard tabs and user search');
}finally{
  await browser.close();
  await server.close();
  rmSync(dir,{recursive:true,force:true});
}
