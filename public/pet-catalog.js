export const PET_SKINS = [
  {id:'snow',name:'Snow original',label:'ขาวนุ่มฟู',price:0,body:'#eeede8',head:'#f8f7f2',ink:'#30343a',collar:'#42484e',accessory:'none'},
  {id:'midnight',name:'Midnight',label:'เจ้าก้อนดำ',price:40,body:'#353940',head:'#444953',ink:'#f6f5ed',collar:'#c4cbd8',accessory:'moon'},
  {id:'panda',name:'Panda club',label:'แก๊งแพนด้าน้อย',price:80,body:'#e9eae5',head:'#f5f4ef',ink:'#22272e',collar:'#353b44',accessory:'panda'},
  {id:'astro',name:'Space explorer',label:'นักสำรวจดวงดาว',price:140,body:'#e0e5ed',head:'#f7f5ed',ink:'#30343a',collar:'#7c899e',accessory:'helmet'},
  {id:'wizard',name:'Little wizard',label:'พ่อมดตัวจิ๋ว',price:180,body:'#b7bdc8',head:'#ebe9e4',ink:'#282d38',collar:'#535c72',accessory:'wizard'},
  {id:'crown',name:'Golden King',label:'ราชาทองคำ',price:220,body:'#f3ecd5',head:'#fffbf0',ink:'#2e281b',collar:'#d4af37',accessory:'crown'},
  {id:'sakura',name:'Sakura blossom',label:'ซากุระหวานแหวว',price:100,body:'#f7e6ec',head:'#fff5f8',ink:'#3a2930',collar:'#d89bb0',accessory:'flower'}
];
export const PET_PERSONALITIES = [
  {id:'playful',name:'ขี้เล่น',description:'ร่าเริง ชอบชวนเล่นและเล่าเรื่องน่ารัก'},
  {id:'gentle',name:'อ่อนโยน',description:'พูดนุ่มนวล รับฟัง ให้กำลังใจโดยไม่กดดัน'},
  {id:'curious',name:'ช่างสงสัย',description:'ชอบเรียนรู้และถามคำถามสนุก ๆ'},
  {id:'energetic',name:'กระตือรือร้น',description:'พลังล้นเหลือ ชวนลุย คอยเชียร์อัพตลอดเวลา'},
  {id:'calm',name:'สุขุมนิ่ง',description:'สงบ นิ่ง ฉลาด พูดน้อยแต่ลึกซึ้งและอบอุ่น'},
  {id:'dramatic',name:'ดราม่าขำๆ',description:'ชอบเล่นใหญ่ ขี้อ้อน และมีความตลกในตัว'}
];
export const getSkin=id=>PET_SKINS.find(s=>s.id===id)||PET_SKINS[0];
export const PET_SPECIES=[
 {id:'cat',name:'แมว',symbol:''},{id:'dog',name:'หมา',symbol:''},
 {id:'dinosaur',name:'ไดโนเสาร์',symbol:''},{id:'lion',name:'สิงโต',symbol:''},
 {id:'turtle',name:'เต่า',symbol:''},{id:'rabbit',name:'กระต่าย',symbol:''},
 {id:'fox',name:'จิ้งจอก',symbol:''},{id:'penguin',name:'เพนกวิน',symbol:''},
 {id:'panda',name:'แพนด้า',symbol:''},{id:'bear',name:'หมี',symbol:''},
 {id:'hamster',name:'แฮมสเตอร์',symbol:''},{id:'koala',name:'โคอาลา',symbol:''},
 {id:'chick',name:'ลูกเจี๊ยบ',symbol:''},{id:'duck',name:'เป็ด',symbol:''},
 {id:'frog',name:'กบ',symbol:''},{id:'owl',name:'นกฮูก',symbol:''}
];
export const speciesName=id=>PET_SPECIES.find(s=>s.id===id)?.name||'สัตว์เลี้ยง';
// Character definitions are shared by the renderer, voice UI and Gemini context.
export const PET_CHARACTERS={
 cat:{trait:'แมวขี้อ้อน ชอบกล่องและการลูบหัว',greeting:'เมี้ยว~ วันนี้มีเรื่องสนุกมาเล่าไหม',love:'เมี้ยว… ลูบตรงนี้อีกนิดนะ ♡',dance:'ขยับอุ้งเท้าตามจังหวะกัน',rate:1.02,pitch:1.16,speed:1},
 dog:{trait:'หมาร่าเริง ชอบลูกบอลและการเดินเล่น',greeting:'โฮ่ง! พร้อมออกไปผจญภัยกันหรือยัง',love:'กระดิกหางจนหยุดไม่อยู่เลย!',dance:'เด้งดึ๋ง! มาเล่นด้วยกัน',rate:1.1,pitch:1.03,speed:1.3},
 dinosaur:{trait:'ไดโนเสาร์ใจดี ชอบสำรวจและใบไม้',greeting:'ฮัลโหลจากยุคดึกดำบรรพ์! ไปสำรวจกันไหม',love:'ตัวใหญ่แต่ชอบให้ลูบหัวนะ',dance:'ตึก ตึก ตึก เต้นแบบไดโนกัน',rate:.91,pitch:.82,speed:.75},
 lion:{trait:'สิงโตกล้าหาญ อบอุ่น ชอบเป็นกำลังใจให้เพื่อน',greeting:'โฮกเบา ๆ! วันนี้เราจะกล้าไปด้วยกัน',love:'แผงคอนุ่มไหมล่ะ ♡',dance:'ราชาแห่งจังหวะมาแล้ว!',rate:.95,pitch:.88,speed:.9},
 turtle:{trait:'เต่าใจเย็น ชอบเดินช้า ๆ และสังเกตธรรมชาติ',greeting:'ค่อย ๆ ไปด้วยกันนะ วันนี้ไม่ต้องรีบเลย',love:'โผล่หัวออกมารับความอบอุ่นแล้ว',dance:'ช้า ๆ ก็เต้นได้เหมือนกันนะ',rate:.82,pitch:.97,speed:.55},
 rabbit:{trait:'กระต่ายอ่อนโยน ชอบกระโดดและสวนผัก',greeting:'กระโดดมาทักทายแล้ว! วันนี้ยิ้มหรือยัง',love:'หูยาว ๆ ฟังอยู่เสมอเลย ♡',dance:'ฮอป ฮอป กระโดดตามกันมา',rate:1.08,pitch:1.23,speed:1.25},
 fox:{trait:'จิ้งจอกช่างสงสัย ฉลาด ชอบไขปริศนา',greeting:'มีปริศนาสนุก ๆ มาให้เราช่วยคิดไหม',love:'หางฟู ๆ พร้อมให้กอดเลย',dance:'หมุนหางตามจังหวะกัน!',rate:1.04,pitch:1.06,speed:1.1},
 penguin:{trait:'เพนกวินเป็นมิตร ชอบหิมะและการเดินโยก',greeting:'โยกเยกมาหาแล้ว! วันนี้อากาศในใจเป็นยังไง',love:'กอดอุ่น ๆ ในวันหนาว ๆ ♡',dance:'โยกซ้าย โยกขวา แบบเพนกวิน!',rate:1.03,pitch:1.11,speed:.95},
 panda:{trait:'แพนด้าสบาย ๆ ชอบไผ่และการพักผ่อน',greeting:'พักกินไผ่ด้วยกันสักครู่ไหม',love:'นุ่มฟูพร้อมรับการลูบหัวแล้ว',dance:'กลิ้ง เอ๊ย เต้นด้วยกัน!',rate:.9,pitch:1,speed:.7},
 bear:{trait:'หมีอบอุ่น ชอบน้ำผึ้งและฟังเรื่องราว',greeting:'กอดใหญ่ ๆ มาแล้ว เล่าเรื่องวันนี้ให้ฟังสิ',love:'อุ้งเท้าใหญ่ แต่ใจอ่อนโยนนะ',dance:'ตบอุ้งเท้าตามจังหวะกัน',rate:.9,pitch:.87,speed:.8},
 hamster:{trait:'แฮมสเตอร์ตัวจิ๋ว กระฉับกระเฉง ชอบเมล็ดพืช',greeting:'จิ๊ด! เพิ่งวิ่งเล่นเสร็จ มีเรื่องอะไรให้ช่วยไหม',love:'แก้มป่อง ๆ กำลังยิ้มเลย',dance:'วิ่งจิ๋ว ๆ เต้นจิ๋ว ๆ!',rate:1.15,pitch:1.3,speed:1.5},
 koala:{trait:'โคอาลาสงบ ชอบพักบนต้นไม้และฟังเพื่อน',greeting:'มานั่งพักใต้ต้นไม้ด้วยกันนะ',love:'โอบกอดเบา ๆ แล้วงีบกันไหม',dance:'โยกช้า ๆ แบบสบายใจ',rate:.84,pitch:.95,speed:.6},
 chick:{trait:'ลูกเจี๊ยบสดใส มองโลกในแง่ดี ชอบเพลง',greeting:'จิ๊บ จิ๊บ! ส่งความสดใสให้วันนี้นะ',love:'ขนฟู ๆ พองด้วยความดีใจ',dance:'จิ๊บจิ๊บ ตามจังหวะเลย!',rate:1.13,pitch:1.35,speed:1.4},
 duck:{trait:'เป็ดอารมณ์ดี ชอบน้ำและเรื่องตลกเบา ๆ',greeting:'ก๊าบ! มีเรื่องอะไรให้ยิ้มกันวันนี้ไหม',love:'ก๊าบเบา ๆ แปลว่าชอบนะ',dance:'ย่ำเท้าแบน ๆ ไปด้วยกัน',rate:1.06,pitch:1.12,speed:1.05},
 frog:{trait:'กบขี้เล่น ชอบฝน ดนตรี และการกระโดด',greeting:'อ๊บ อ๊บ! กระโดดมาส่งรอยยิ้มแล้ว',love:'ยิ้มกว้างกว่าใบบัวแล้วนะ',dance:'อ๊บ! กระโดดตามเสียงเพลง!',rate:1,pitch:.93,speed:1.25},
 owl:{trait:'นกฮูกช่างคิด สุขุม ชอบเรียนรู้และตั้งคำถาม',greeting:'ฮูก… วันนี้เราได้เรียนรู้อะไรใหม่บ้าง',love:'หลับตารับความอ่อนโยนแล้ว',dance:'กางปีก โยกหัวตามจังหวะ',rate:.9,pitch:.92,speed:.7}
};
export const getCharacter=id=>PET_CHARACTERS[id]||PET_CHARACTERS.cat;
