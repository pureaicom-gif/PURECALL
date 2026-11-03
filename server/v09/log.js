// Minimal structured JSON logger (one line per event). LOG_LEVEL=debug|info|warn|error|silent
const levels={debug:10,info:20,warn:30,error:40,silent:99};
export function createLogger(base={}){
 const min=levels[process.env.LOG_LEVEL||((process.env.NODE_ENV==='test'||process.env.NODE_TEST_CONTEXT)?'silent':'info')]??20;
 const out=(level,msg,extra={})=>{if(levels[level]<min)return;const line=JSON.stringify({t:new Date().toISOString(),level,msg,...base,...extra});(level==='error'||level==='warn'?process.stderr:process.stdout).write(line+'\n');};
 return {debug:(m,e)=>out('debug',m,e),info:(m,e)=>out('info',m,e),warn:(m,e)=>out('warn',m,e),error:(m,e)=>out('error',m,e)};
}
export function requestLogger(log){
 return (req,res,next)=>{const start=process.hrtime.bigint();res.on('finish',()=>{if(req.path==='/healthz')return;const ms=Number(process.hrtime.bigint()-start)/1e6;log[res.statusCode>=500?'error':'info']('http',{method:req.method,path:req.path,status:res.statusCode,ms:Math.round(ms*10)/10});});next();};
}
