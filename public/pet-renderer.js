import {getSkin,getCharacter} from './pet-catalog.js';
export function drawPetScene(c,p,t,motion={}) {
 const s=getSkin(p.skin),active=motion.until>performance.now()?motion.type:'idle',talk=active==='talk'||active==='eat',happy=['love','dance','wave'].includes(active),speed=getCharacter(p.kind).speed;
 t*=speed;
 const ellipse=(x,y,rx,ry,color)=>{c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();};
 const rect=(x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
 const path=(points,color)=>{c.fillStyle=color;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill();};
 c.clearRect(0,0,420,380);if(motion.arena){
 const sky=c.createLinearGradient(0,0,0,380);sky.addColorStop(0,'#171e2b');sky.addColorStop(1,'#596575');rect(0,0,420,380,sky);
 ellipse(326,65,29,29,'#e4e8eb');for(let i=0;i<22;i++)ellipse((i*79+17)%420,(i*31+13)%150,1,1,'#a6b7ce');
 path([[0,210],[80,96],[163,198],[257,116],[420,224],[420,380],[0,380]],'#303c4c');path([[0,247],[120,182],[218,231],[335,150],[420,235],[420,380],[0,380]],'#414e5d');
 ellipse(210,320,250,66,'#232e3c');ellipse(210,305,137,38,'#536173');c.strokeStyle='#acbbce';c.lineWidth=2;c.beginPath();c.ellipse(210,305,127,30,0,0,Math.PI*2);c.stroke();
 }else{rect(0,0,420,260,'#d7d8d8');rect(0,260,420,120,'#777b80');c.strokeStyle='#666b73';c.lineWidth=1;
 for(let y=270;y<380;y+=27){c.beginPath();c.moveTo(0,y);c.lineTo(420,y);c.stroke();}
 for(let x=-300;x<700;x+=95){c.beginPath();c.moveTo(210+(x-210)*.4,260);c.lineTo(x,380);c.stroke();}
 rect(266,54,108,137,'#62666c');rect(273,61,94,123,'#f2f2ed');rect(280,69,80,107,'#abb2b6');ellipse(333,95,15,15,'#e3e6e5');rect(318,62,5,122,'#62666c');rect(273,121,94,5,'#62666c');rect(22,123,86,6,'#f1f1ed');rect(39,92,23,30,'#595d63');rect(67,84,13,38,'#999fa2');rect(85,101,9,21,'#babbb9');
 ellipse(215,296,116,30,'#565b62');c.strokeStyle='#8d9299';c.lineWidth=2;c.beginPath();c.ellipse(215,296,106,23,0,0,Math.PI*2);c.stroke();
 if(p.decor){rect(40,241,32,39,'#565b60');rect(54,191,4,58,'#555e57');ellipse(43,210,17,9,'#7c877e');ellipse(68,196,17,9,'#7c877e');ellipse(68,227,17,9,'#7c877e');}
 }
 const jump=active==='dance'?Math.abs(Math.sin(t/130))*14:happy?Math.abs(Math.sin(t/220))*7:0;
 c.save();c.translate(204+Math.sin(t/2400)*10,239+Math.sin(t/450)*2-jump);if(active==='dance')c.rotate(Math.sin(t/180)*.11);
 let faceY=-26,faceX=0,eyes=16;
 if(p.kind==='turtle'){
  ellipse(-36,40,15,13,s.head);ellipse(32,active==='wave'?30+Math.sin(t/100)*6:40,15,13,s.head);ellipse(0,8,56,44,s.collar);ellipse(0,5,47,36,s.body);
  for(const [x,y]of [[0,1],[-28,5],[28,5],[0,27]])path([[x,y-13],[x+13,y-6],[x+13,y+7],[x,y+14],[x-13,y+7],[x-13,y-6]],s.collar);
  ellipse(0,-38,28,25,s.head);faceY=-40;eyes=11;
 }else if(p.kind==='dinosaur'){
  path([[28,34],[90,15+Math.sin(t/250)*7],[50,52],[-2,45]],s.body);ellipse(0,19,42,38,s.body);ellipse(4,26,23,25,s.head);rect(-30,37,20,20,s.body);rect(14,37,20,20,s.body);rect(-25,-41,29,53,s.body);ellipse(-6,-44,37,27,s.head);ellipse(18,-36,20,17,s.head);
  ellipse(-30,8,10,7,s.collar);ellipse(29,active==='wave'?-1+Math.sin(t/100)*7:8,10,7,s.collar);
  for(let i=0;i<4;i++)path([[-26,11-i*15],[-42,6-i*15],[-26,-4-i*15]],s.collar);faceX=-3;faceY=-44;eyes=13;
 }else if(p.kind==='penguin'){
  ellipse(0,1,43,62,s.collar);ellipse(0,17,28,41,s.head);ellipse(-43,4,12,32,s.collar);ellipse(43,active==='wave'?-9+Math.sin(t/100)*9:4,12,32,s.collar);ellipse(-18,57,21,8,s.collar);ellipse(18,57,21,8,s.collar);ellipse(0,-31,37,32,s.collar);ellipse(-12,-29,20,26,s.head);ellipse(12,-29,20,26,s.head);faceY=-35;
 }else if(p.kind==='chick'){
  ellipse(0,14,35,34,s.body);ellipse(0,-24,36,32,s.head);ellipse(-34,14,10,18,s.collar);ellipse(34,active==='wave'?Math.sin(t/90)*10:14,10,18,s.collar);rect(-15,41,3,10,s.collar);rect(12,41,3,10,s.collar);ellipse(-15,51,10,4,s.collar);ellipse(15,51,10,4,s.collar);path([[-9,-51],[-8,-65],[-1,-57],[4,-68],[9,-51]],s.collar);faceY=-24;eyes=12;
 }else if(p.kind==='owl'){
  ellipse(0,12,38,40,s.body);ellipse(0,16,24,28,s.head);path([[-30,-32],[-36,-64],[-16,-44]],s.collar);path([[30,-32],[36,-64],[16,-44]],s.collar);ellipse(0,-26,42,34,s.body);ellipse(-38,10,12,28,s.collar);ellipse(38,active==='wave'?-3+Math.sin(t/100)*7:10,12,28,s.collar);ellipse(-16,-26,20,24,s.head);ellipse(16,-26,20,24,s.head);for(const x of [-10,0,10])path([[x-3,12],[x,18],[x+3,12]],s.collar);ellipse(-15,50,12,4,s.collar);ellipse(15,50,12,4,s.collar);faceY=-26;eyes=16;
 }else if(p.kind==='frog'){
  ellipse(0,20,40,32,s.body);ellipse(0,22,27,23,s.head);ellipse(-37,35,22,17,s.body);ellipse(37,35,22,17,s.body);ellipse(-32,49,24,6,s.collar);ellipse(32,49,24,6,s.collar);ellipse(-20,-42,16,16,s.body);ellipse(20,-42,16,16,s.body);ellipse(0,-22,46,28,s.head);ellipse(-25,22,7,15,s.collar);ellipse(25,active==='wave'?7+Math.sin(t/100)*7:22,7,15,s.collar);faceY=-38;eyes=20;
 }else if(p.kind==='duck'){
  path([[27,30],[61,12],[48,41]],s.body);ellipse(0,17,41,34,s.body);ellipse(0,-24,33,31,s.head);ellipse(-34,16,10,20,s.collar);ellipse(34,active==='wave'?Math.sin(t/100)*10:16,10,20,s.collar);path([[-24,47],[-31,57],[-7,55],[-8,47]],s.collar);path([[24,47],[31,57],[7,55],[8,47]],s.collar);faceY=-24;eyes=12;
 }else{
  if(p.kind==='fox'){path([[25,33],[87,4],[73,57],[29,51]],s.body);path([[87,4],[76,43],[60,23]],s.head);}
  else if(p.kind==='rabbit')ellipse(35,37,16,16,s.head);
  else if(p.kind==='panda'||p.kind==='bear'||p.kind==='hamster'||p.kind==='koala')ellipse(32,38,10,10,s.collar);
  else{c.strokeStyle=s.body;c.lineWidth=15;c.lineCap='round';c.beginPath();c.moveTo(31,22);c.quadraticCurveTo(75,15,56,-18+Math.sin(t/(happy?140:300))*9);c.stroke();}
  ellipse(0,16,p.kind==='hamster'?42:37,p.kind==='hamster'?38:44,s.body);ellipse(-22,46,14,12,p.kind==='panda'?s.collar:s.body);ellipse(22,46,14,12,p.kind==='panda'?s.collar:s.body);
  if(p.kind==='panda'){ellipse(-30,17,13,25,s.collar);ellipse(30,17,13,25,s.collar);}
  if(p.kind==='bear')ellipse(0,24,23,25,s.head);
  if(p.kind==='lion'){ellipse(0,-27,54,48,s.collar);for(let i=0;i<12;i++){const a=i*Math.PI/6;ellipse(Math.cos(a)*43,-27+Math.sin(a)*38,14,14,s.collar);}ellipse(-29,-54,13,13,s.head);ellipse(29,-54,13,13,s.head);}
  else if(p.kind==='rabbit'){ellipse(-22,-72,12,41,s.head);ellipse(22,-72,12,41,s.head);ellipse(-22,-77,5,25,s.body);ellipse(22,-77,5,25,s.body);}
  else if(p.kind==='dog'){ellipse(-37,-27,15,34,s.collar);ellipse(37,-27,15,34,s.collar);}
  else if(p.kind==='panda'){ellipse(-30,-56,15,15,s.collar);ellipse(30,-56,15,15,s.collar);}
  else if(p.kind==='bear'){ellipse(-32,-56,16,16,s.body);ellipse(-32,-56,9,9,s.collar);ellipse(32,-56,16,16,s.body);ellipse(32,-56,9,9,s.collar);}
  else if(p.kind==='hamster'){ellipse(-28,-50,12,12,s.body);ellipse(-28,-50,7,7,s.collar);ellipse(28,-50,12,12,s.body);ellipse(28,-50,7,7,s.collar);ellipse(-36,-16,12,10,s.head);ellipse(36,-16,12,10,s.head);}
  else if(p.kind==='koala'){ellipse(-40,-46,20,20,s.collar);ellipse(-40,-46,12,12,s.head);ellipse(40,-46,20,20,s.collar);ellipse(40,-46,12,12,s.head);}
  else{path([[-39,-28],[-38,-73],[-8,-50],[8,-50],[38,-73],[39,-28]],s.head);}
  ellipse(0,-26,43,35,s.head);
  if(p.kind==='hamster'){ellipse(-31,-12,17,15,s.body);ellipse(31,-12,17,15,s.body);}
  if(p.kind==='bear')ellipse(0,-9,21,16,s.body);
  if(p.kind==='fox'){path([[-38,-18],[0,5],[-7,-22]],s.body);path([[38,-18],[0,5],[7,-22]],s.body);}
  if(p.kind==='panda'){ellipse(-15,-26,11,13,'#444951');ellipse(15,-26,11,13,'#444951');}
  if(p.kind==='koala'){ellipse(0,-16,8,12,s.ink);}
  rect(-25,3,50,6,s.collar);ellipse(0,10,5,5,'#c9c6b7');
 }
 if(s.accessory==='panda'){ellipse(faceX-eyes,faceY,11,14,'#444951');ellipse(faceX+eyes,faceY,11,14,'#444951');}
 const eyeColor=s.accessory==='panda'||p.kind==='panda'?'#f5f5ee':s.ink,blink=Math.sin(t/900)>.985||active==='sleep';
 for(const ex of [-eyes,eyes])ellipse(faceX+ex,faceY,3.8,blink?1:happy?3:5.5,eyeColor);
 if(p.kind==='duck'){ellipse(faceX,faceY+15,18,talk?7+Math.abs(Math.sin(t/85))*3:7,s.collar);rect(faceX-12,faceY+15,24,1,s.head);}
 else if(['penguin','chick','owl'].includes(p.kind))path([[faceX-7,faceY+11],[faceX+7,faceY+11],[faceX,faceY+19]],s.collar);
 else if(['frog','turtle','dinosaur'].includes(p.kind)){ellipse(faceX-4,faceY+12,1.4,1.4,s.ink);ellipse(faceX+4,faceY+12,1.4,1.4,s.ink);}
 else if(p.kind!=='koala')path([[faceX-4,faceY+12],[faceX+4,faceY+12],[faceX,faceY+16]],s.ink);
 if(p.kind!=='duck'){if(talk)ellipse(faceX,faceY+22,p.kind==='frog'?12:5,2+Math.abs(Math.sin(t/85))*5,s.ink);else{c.strokeStyle=s.ink;c.lineWidth=1.5;c.beginPath();c.arc(faceX,faceY+(p.kind==='frog'?14:18),p.kind==='frog'?14:6,0,Math.PI);c.stroke();}}
 if(p.kind==='hamster'){rect(faceX-4,faceY+22,3,6,'#ffffff');rect(faceX+1,faceY+22,3,6,'#ffffff');}
 if(s.accessory==='moon'){c.fillStyle='#e1e5ed';c.font='18px sans-serif';c.fillText('☾',-8,faceY-17);}
 if(s.accessory==='helmet'){c.strokeStyle='#f1f6ff';c.lineWidth=3;c.beginPath();c.ellipse(faceX,faceY-2,57,51,0,0,Math.PI*2);c.stroke();c.strokeStyle='#ffffff80';c.beginPath();c.arc(faceX,faceY-2,48,3.9,4.6);c.stroke();}
 if(s.accessory==='wizard'){path([[-50,faceY-27],[0,faceY-104],[44,faceY-27]],'#4b546a');rect(-55,faceY-30,108,8,'#2f3749');c.fillStyle='#e2e5ed';c.font='18px sans-serif';c.fillText('✦',-9,faceY-50);}
 if(s.accessory==='crown'){path([[-24,faceY-32],[-30,faceY-54],[-12,faceY-42],[0,faceY-58],[12,faceY-42],[30,faceY-54],[24,faceY-32]],'#d4af37');ellipse(0,faceY-42,3,3,'#fff');}
 if(s.accessory==='flower'){for(let i=0;i<5;i++){const a=i*Math.PI*2/5;ellipse(faceX+30+Math.cos(a)*7,faceY-39+Math.sin(a)*7,5.5,5.5,'#e892a8');}ellipse(faceX+30,faceY-39,3.5,3.5,'#f5e8ce');}
 if(active==='wave'&&!['turtle','dinosaur','penguin','chick','duck','owl','frog'].includes(p.kind)){c.save();c.translate(34,9);c.rotate(-.8+Math.sin(t/100)*.4);ellipse(0,-12,10,24,p.kind==='panda'?s.collar:s.body);c.restore();}
 if(active==='love'){c.fillStyle='#faf5ee';c.font='24px sans-serif';c.fillText('♡',-58,-85-Math.sin(t/250)*8);c.fillText('♡',46,-65-Math.cos(t/220)*8);}
 if(active==='sleep'){c.fillStyle='#f1f3f9';c.font='20px sans-serif';c.fillText('z Z',39,-80);}
 if(active==='eat'){ellipse(0,63,31,9,'#e8edf5');path([[-30,63],[-24,78],[24,78],[30,63]],'#444e61');ellipse(0,63,24,5,'#8996a9');for(let i=0;i<4;i++)ellipse(-13+i*8,61+Math.sin(t/120+i)*2,3,2,'#dce4f0');ellipse(faceX+15,faceY+17,2,2,'#d5c6ad');}
 if(active==='wash'){for(let i=0;i<9;i++){const x=-47+(i%3)*45,y=27-Math.floor(i/3)*34-Math.sin(t/280+i)*9;c.strokeStyle='#f2f8ff';c.lineWidth=2;c.beginPath();c.arc(x,y,5+i%3*3,0,Math.PI*2);c.stroke();}ellipse(-21,-3,13,7,'#f7fbff');ellipse(-7,-7,12,9,'#f7fbff');ellipse(8,-3,12,7,'#f7fbff');}
 c.restore();
}
