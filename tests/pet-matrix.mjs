import {chromium} from '@playwright/test';
import {createPureServer} from '../server/index.js';
import {mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const dir=mkdtempSync(join(tmpdir(),'pure-matrix-')),server=createPureServer({dataDir:dir,scan:false});await new Promise(r=>server.http.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.http.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{const p=await browser.newPage({viewport:{width:1400,height:1500}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/pet-gallery.html');await p.locator('.pet-gallery-card').last().waitFor();await p.locator('#gallery-pause').click();
 const results=await p.evaluate(async()=>{const {PET_SPECIES,PET_SKINS,getCharacter}=await import('/pet-catalog.js'),{drawPetScene}=await import('/pet-renderer.js');const canvas=document.createElement('canvas');canvas.width=420;canvas.height=380;const c=canvas.getContext('2d'),actions=['idle','wave','love','dance','talk','sleep','eat','wash'];let renders=0,distinct=true,distinctActions=true,traits=true;for(const skin of PET_SKINS){const images=[];for(const species of PET_SPECIES){const poses=[];traits&&=!!getCharacter(species.id).greeting;for(const action of actions){drawPetScene(c,{kind:species.id,skin:skin.id,decor:1},1250,{type:action,until:performance.now()+10000});poses.push(canvas.toDataURL());renders++;}distinctActions&&=new Set(poses).size===actions.length;images.push(poses[0]);}distinct&&=new Set(images).size===PET_SPECIES.length;}return {renders,distinct,distinctActions,traits,species:PET_SPECIES.length,skins:PET_SKINS.length};});
 assert.equal(results.species,16);assert.equal(results.skins,7);assert.ok(results.distinct,'Some species look identical');assert.ok(results.distinctActions,'Some reactions do not change rendering');assert.ok(results.traits);mkdirSync('docs/screenshots',{recursive:true});
 for(const skin of ['snow','midnight','astro','wizard','crown','sakura','panda']){await p.locator('#gallery-skin').selectOption(skin);await p.screenshot({path:'docs/screenshots/pets-all-'+skin+'.png',fullPage:true});}
 await p.setViewportSize({width:390,height:844});await p.locator('#gallery-skin').selectOption('snow');await p.screenshot({path:'docs/screenshots/pets-gallery-mobile.png',fullPage:true});assert.deepEqual(errors,[]);console.log('PASS: '+results.renders+' renders = 16 species × 7 skins × 8 poses; all species distinct, all actions distinct, complete character metadata, no canvas/page errors');
}finally{await browser.close();await server.close();rmSync(dir,{recursive:true,force:true});}
