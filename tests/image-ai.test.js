import test from 'node:test';
import assert from 'node:assert/strict';
import {createGemini} from '../server/gemini.js';
test('Gemini image enhancement uses Google, explicit image model and preserves output MIME',async()=>{
 let request;const gemini=createGemini({key:'fixture-secret',imageModel:'gemini-image-fixture',fetcher:async(url,options)=>{request={url,options};return {ok:true,json:async()=>({candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:Buffer.from('image-result').toString('base64')}}]}}]})};}});
 const result=await gemini.generateImage('adjust light',{style:'enhance',image:{mime:'image/jpeg',data:'fixture-base64'}});
 assert.equal(new URL(request.url).hostname,'generativelanguage.googleapis.com');assert.ok(request.url.endsWith('/gemini-image-fixture:generateContent'));assert.equal(request.options.headers['x-goog-api-key'],'fixture-secret');const body=JSON.parse(request.options.body);assert.deepEqual(body.generationConfig.responseModalities,['TEXT','IMAGE']);assert.deepEqual(body.contents[0].parts[1].inlineData,{mimeType:'image/jpeg',data:'fixture-base64'});assert.match(body.contents[0].parts[0].text,/Preserve the original person identity/);assert.equal(result.mime,'image/png');assert.equal(result.buffer.toString(),'image-result');
});
test('Gemini rejects missing image results and reports missing configuration',async()=>{
 const gemini=createGemini({key:'fixture',fetcher:async()=>({ok:true,json:async()=>({candidates:[{content:{parts:[{text:'No image'}]}}]})})});await assert.rejects(gemini.generateImage('test'),/Gemini/);await assert.rejects(createGemini({}).generateImage('test'),e=>e.status===503);
});
