export function createGemini({key='',model='',fallback='',imageModel=process.env.GEMINI_IMAGE_MODEL||'gemini-3.1-flash-image',fetcher=fetch}) {
  let catalog=[], lastScan=null, error=null;
  async function request(path, options={}) {
    const res=await fetcher(`https://generativelanguage.googleapis.com/v1beta/${path}`,{...options,headers:{'x-goog-api-key':key,'Content-Type':'application/json'},signal:options.signal||AbortSignal.timeout(30000)});
    const json=await res.json();
    if(!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    return json;
  }
  function autoSelectModel(cat) {
    const score = name => {
      let s = 0;
      if (name.includes('2.5')) s += 50;
      else if (name.includes('2.0')) s += 40;
      else if (name.includes('1.5')) s += 30;
      if (name.includes('flash')) s += 10;
      if (name.includes('pro')) s += 5;
      if (name.includes('exp')) s -= 2;
      return s;
    };
    return [...cat].sort((a,b)=>score(b.name)-score(a.name))[0]?.name || null;
  }

  async function scan() {
    if(!key) return;
    try {
      let list=[],page='';
      do {
        const data=await request(`models?pageSize=1000${page?'&pageToken='+encodeURIComponent(page):''}`);
        list.push(...(data.models||[])); page=data.nextPageToken||'';
      } while(page);
      catalog=list.filter(m=>m.supportedGenerationMethods?.includes('generateContent')).map(m=>({name:m.name.replace('models/',''),displayName:m.displayName,inputTokenLimit:m.inputTokenLimit}));
      if(!model && catalog.length) {
        model = autoSelectModel(catalog) || catalog[0].name;
      }
      lastScan=new Date().toISOString(); error=null;
    } catch { error='ตรวจรายชื่อโมเดลไม่สำเร็จ ตรวจสอบคีย์และการเชื่อมต่อ'; }
  }

  async function generateImage(prompt,{style='anime',image}={}) {
    if(!key)throw Object.assign(new Error('ผู้ดูแลยังไม่ได้ตั้งค่า Gemini API key'),{status:503});
    if(!/^[a-zA-Z0-9._-]+$/.test(imageModel))throw new Error('ชื่อโมเดลภาพไม่ถูกต้อง');
    const styles={anime:'Original expressive illustration',realistic:'Natural photorealistic lighting','3d':'Polished 3D illustration',cyberpunk:'Neon futuristic illustration',fantasy:'Dreamy fantasy painting',enhance:'Improve lighting, exposure, color balance and clarity naturally. Preserve the original person identity, body proportions, scene, objects and text. No invented objects, no beauty reshaping.'};
    const parts=[{text:(styles[style]||styles.anime)+'. '+prompt.trim()}];if(image)parts.push({inlineData:{mimeType:image.mime,data:image.data}});
    const result=await request('models/'+imageModel+':generateContent',{method:'POST',signal:AbortSignal.timeout(90000),body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{responseModalities:['TEXT','IMAGE']}})});
    const output=result.candidates?.flatMap(c=>c.content?.parts||[]).find(p=>p.inlineData?.mimeType?.startsWith('image/'))?.inlineData;
    if(!output||!['image/png','image/jpeg','image/webp'].includes(output.mimeType))throw new Error('Gemini ยังไม่ส่งภาพกลับมา ลองใหม่หรือตรวจโมเดลภาพ');
    const buffer=Buffer.from(output.data,'base64');if(buffer.length>20*1024*1024)throw new Error('ภาพผลลัพธ์ใหญ่เกินกำหนด');
    return {buffer,mime:output.mimeType,model:imageModel};
  }

  return {
    scan,
    generateImage,
    status:()=>({configured:!!key,model:model||autoSelectModel(catalog)||null,fallback:fallback||null,catalog,lastScan,error}),
    async generate(prompt, {system,history=[],audio,image}={}) {
      const activeModel = model || autoSelectModel(catalog);
      if(!key || !activeModel) throw Object.assign(new Error('ผู้ดูแลยังไม่ได้ตั้งค่า API key และโมเดล'),{status:503});
      for(const candidate of [...new Set([activeModel,fallback].filter(Boolean))]) {
        if(!/^[a-zA-Z0-9._-]+$/.test(candidate)) continue;
        try {
          const parts=[{text:prompt}];
          if(image)parts.push({inlineData:{mimeType:image.mime,data:image.data}});
          if(audio)parts.push({inlineData:{mimeType:audio.mime,data:audio.data}});
          const contents=[...history.map(m=>({role:m.role,parts:[{text:m.text}]})),{role:'user',parts}];
          const data=await request(`models/${candidate}:generateContent`,{method:'POST',body:JSON.stringify({contents,...(system?{systemInstruction:{parts:[{text:system}]}}:{}),generationConfig:{maxOutputTokens:1024}})});
          const text=data.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('');
          if(!text) throw new Error('No text');
          return {text,model:candidate};
        } catch {}
      }
      throw Object.assign(new Error('PURE AI ตอบไม่ได้ในขณะนี้ กรุณาลองใหม่ภายหลัง'),{status:502});
    }
  };
}
