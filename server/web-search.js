const decode=s=>String(s||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#x27;|&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ');
const text=s=>decode(String(s||'').replace(/<br\s*\/?\s*>/gi,' ').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();

export async function searchInternet(query,{fetcher=fetch}={}){
 const url='https://html.duckduckgo.com/html/?q='+encodeURIComponent(String(query).slice(0,500));
 const response=await fetcher(url,{headers:{'User-Agent':'Mozilla/5.0 (compatible; PURE/0.8; +https://purefxai.com)'},signal:AbortSignal.timeout(18000)});
 if(!response.ok)throw Error('ค้นเว็บไม่สำเร็จ กรุณาลองใหม่');
 const html=(await response.text()).slice(0,1500000),results=[];
 for(const match of html.matchAll(/<a\b[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)){
  let href=decode(match[1]);try{const resolved=new URL(href, 'https://duckduckgo.com');href=resolved.searchParams.get('uddg')||resolved.href;}catch{continue;}
  if(!/^https?:\/\//i.test(href)||/duckduckgo\.com\/l\//i.test(href))continue;
  const after=html.slice(match.index+match[0].length,match.index+match[0].length+2400),snippet=text(after.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i)?.[1]||'');
  const title=text(match[2]);if(title&&snippet)results.push({title,url:href,snippet});if(results.length>=6)break;
 }
 if(!results.length)throw Error('ค้นเว็บแล้วไม่พบผลลัพธ์ที่อ่านได้');
 return results;
}
