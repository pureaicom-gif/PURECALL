import test from 'node:test';
import assert from 'node:assert/strict';
import {searchInternet} from '../server/web-search.js';
import {createJevRunner} from '../server/jev-run.js';

test('web research searches public sources and recovers when Hermes returns no answer',async()=>{
 let searched='',asked='';
 const html='<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fguide&amp;rut=x">Guide &amp; facts</a><a class="result__snippet" href="#">A useful <b>verified</b> result.</a>';
 const results=await searchInternet('PURE search test',{fetcher:async(url)=>{searched=url;return {ok:true,text:async()=>html};}});
 assert.match(searched,/PURE%20search%20test/);assert.deepEqual(results,[{title:'Guide & facts',url:'https://example.org/guide',snippet:'A useful verified result.'}]);
 const runner=createJevRunner({gemini:{generate:async(prompt)=>{asked=prompt;return {text:'สรุปจากแหล่งเว็บ https://example.org/guide และ https://invented.invalid/source'};}},fetcher:async()=>{throw Error('local AI offline');},hermes:async()=>({text:''}),webSearch:async query=>{assert.equal(query,'ค้นเว็บเกี่ยวกับ PURE');return results;}});
 const answer=await runner.run({prompt:'ค้นเว็บเกี่ยวกับ PURE',engine:'jev',allowCloud:true});
 assert.match(asked,/https:\/\/example\.org\/guide/);assert.match(answer.text,/https:\/\/example\.org\/guide/);assert.doesNotMatch(answer.text,/invented\.invalid/);assert.match(answer.route.reason,/เว็บ/);
});
