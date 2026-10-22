import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPureServer } from '../server/index.js';

test('market listings are public, seller-managed, searchable, and can be marked sold',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'pure-market-test-'));
 const server=createPureServer({dataDir:dir,scan:false,gemini:{scan(){},status:()=>({configured:false}),generate:async()=>{throw Error('not used');}}});
 await new Promise(resolve=>server.http.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.http.address().port;
 const request=async(path,body,user,method)=>{const response=await fetch(base+'/api'+path,{method:method||(body?'POST':'GET'),headers:{...(user?{Cookie:user.cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:response.headers.get('content-type')?.includes('json')?await response.json():await response.text()};};
 try{
  const createUser=async handle=>{const response=await fetch(base+'/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({handle,name:handle,password:'market-test-password'})});const data=await response.json();return {id:data.user.id,cookie:response.headers.get('set-cookie').split(';')[0]};};
  const seller=await createUser('market_seller'),buyer=await createUser('market_buyer');
  const created=await request('/marketplace',{title:'PURE Camera',description:'Excellent condition',price:250.5},seller);
  assert.equal(created.status,201);assert.equal(created.data.listing.price,250.5);
  const listed=await request('/marketplace?q=Camera',null,buyer);assert.equal(listed.status,200);assert.equal(listed.data.listings[0].title,'PURE Camera');
  assert.equal((await request('/marketplace/'+created.data.listing.id,{status:'sold'},buyer,'PATCH')).status,403);
  assert.equal((await request('/marketplace/'+created.data.listing.id,null,buyer,'DELETE')).status,403);
  assert.equal((await request('/marketplace/'+created.data.listing.id,{status:'sold'},seller,'PATCH')).data.listing.status,'sold');
  assert.equal((await request('/marketplace',null,buyer)).data.listings.length,0);
  assert.equal((await request('/marketplace?mine=1',null,seller)).data.listings.length,1);
  assert.equal((await request('/marketplace/'+created.data.listing.id,null,seller,'DELETE')).status,200);
 }finally{await server.close();rmSync(dir,{recursive:true,force:true});}
});
