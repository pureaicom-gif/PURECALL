import {PET_SPECIES,PET_SKINS,getCharacter} from './pet-catalog.js';
import {drawPetScene} from './pet-renderer.js';
const grid=document.querySelector('#gallery-grid'),skin=document.querySelector('#gallery-skin'),motion=document.querySelector('#gallery-motion');
for(const s of PET_SKINS){const option=document.createElement('option');option.value=s.id;option.textContent=s.name;skin.append(option);}
const scenes=PET_SPECIES.map(s=>{const article=document.createElement('article');article.className='pet-gallery-card';const canvas=document.createElement('canvas');canvas.width=420;canvas.height=380;canvas.setAttribute('aria-label',s.name);const title=document.createElement('h2');title.textContent=s.name;const description=document.createElement('p');description.textContent=getCharacter(s.id).trait;article.append(canvas,title,description);grid.append(article);return {canvas,kind:s.id,c:canvas.getContext('2d')};});
let paused=false,last=0,time=1600;
function draw(t){time=t;for(const s of scenes)drawPetScene(s.c,{kind:s.kind,skin:skin.value,decor:0},t,{type:motion.value,until:performance.now()+5000});}
document.querySelector('#gallery-pause').onclick=e=>{paused=!paused;e.target.textContent=paused?'เล่นภาพ':'หยุดภาพ';};skin.onchange=()=>draw(time);motion.onchange=()=>draw(time);
function frame(t){if(!paused&&!document.hidden&&t-last>65){draw(t);last=t;}requestAnimationFrame(frame);}draw(time);requestAnimationFrame(frame);
