// Host half: the stage director. One authenticated route makes one extra model
// call per user message through DSH's own LLM service and model selection,
// and returns a validated stage script. No key is read by the plugin itself.
import {createRequire} from 'node:module';
import {BlockAssembler,ReasoningEffortId,createUserMessage} from '@deepseek-ai/dsh-llm';

const require=createRequire(import.meta.url);
const {SYSTEM_PROMPT,buildRequest,parseScript}=require('../src/director-script.cjs');

export const name='thought-window';
export const inject=['webServer','connection','llm','agentDefaultModel'];

const ROUTE='/thought-window-director';
const MAX_BODY=32*1024;
const TIMEOUT_MS=60_000;
const MAX_OUTPUT_TOKENS=4000;

function send(res,status,value){
 const body=JSON.stringify(value);
 res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(body),'cache-control':'no-store'});
 res.end(body);
}
function readBody(req){
 return new Promise((resolve,reject)=>{
  const chunks=[];let size=0;
  req.on('data',chunk=>{size+=chunk.length;if(size>MAX_BODY){reject(Object.assign(Error('request too large'),{status:413}));req.destroy();}else chunks.push(chunk);});
  req.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));
  req.on('error',reject);
 });
}
async function reasoningOff(llm,provider,model){
 try{const info=await llm.resolveModelInfo?.(provider,model);return info?.reasoning?.efforts?.some(e=>e.id==='off')??false;}catch{return false;}
}
async function direct(ctx,request){
 const selection=ctx.agentDefaultModel.currentSelection();
 if(!selection?.provider||!selection?.model)throw Object.assign(Error('当前没有可用的默认模型'),{status:409});
 const {provider,model}=selection,started=Date.now(),off=await reasoningOff(ctx.llm,provider,model);
 const usage={inputTokens:0,outputTokens:0,cacheReadTokens:0,totalTokens:0};
 let firstError=null;
 // A reply that is not valid JSON gets one more try, at a lower temperature.
 for(let attempt=0;;attempt++){
  const note=attempt?'\n\nYour previous reply was not valid JSON. Reply again with strictly valid JSON only (commas between all array items).':'';
  const options={
   provider,model,system:SYSTEM_PROMPT,temperature:attempt?.3:.7,maxTokens:MAX_OUTPUT_TOKENS,signal:AbortSignal.timeout(TIMEOUT_MS),
   messages:[createUserMessage({content:[{type:'text',text:buildRequest(request)+note}],source:{kind:'plugin',plugin:'dsh-thought-window'}})],
   ...(off?{reasoningEffort:ReasoningEffortId('off')}:{})
  };
  const assembler=new BlockAssembler();
  for await(const chunk of ctx.llm.stream(options))assembler.push(chunk);
  for(const key of Object.keys(usage))usage[key]+=assembler.usage?.[key]||0;
  const finish=assembler.finish;
  if(finish&&finish.kind!=='stop'&&finish.kind!=='max-tokens')throw Error(finish.failure?.message||'模型调用未正常结束：'+finish.kind);
  const text=assembler.blocks().filter(b=>b.type==='text').map(b=>b.text).join('');
  try{return {ok:true,script:parseScript(text),model:{provider,model},usage,attempts:attempt+1,...(firstError?{firstError}:{}),ms:Date.now()-started};}
  catch(error){if(attempt>=1)throw Error('导演剧本格式错误：'+error.message);firstError=error.message;if(request.debug===true)firstError+=' · raw: '+text;}
 }
}
export function apply(ctx){
 ctx.effect(()=>ctx.webServer.register({kind:'prefix',path:ROUTE,handler:async(req,res)=>{
  try{
   // Same Host/Origin fence and signed browser cookie as DSH's own API.
   const rejection=ctx.connection.requestRejection(req);
   if(rejection!==undefined)return send(res,rejection,{ok:false,error:rejection===401?'unauthorized':'forbidden'});
   const path=new URL(req.url||'/','http://dsh.invalid').pathname;
   if(path===ROUTE+'/status'&&req.method==='GET'){
    let selection=null;try{selection=ctx.agentDefaultModel.currentSelection();}catch{}
    return send(res,200,{ok:true,model:selection?.provider?{provider:selection.provider,model:selection.model}:null});
   }
   // A custom header forces a CORS preflight, so other sites cannot trigger calls.
   if(path!==ROUTE+'/scene'||req.method!=='POST'||req.headers['x-thought-window']!=='1')return send(res,404,{ok:false,error:'not found'});
   let request;try{request=JSON.parse(await readBody(req)||'{}');}catch(error){if(error?.status)throw error;return send(res,400,{ok:false,error:'invalid JSON body'});}
   if(typeof request.input!=='string'||!request.input.trim())return send(res,400,{ok:false,error:'input is required'});
   send(res,200,await direct(ctx,request));
  }catch(error){
   ctx.logger?.warn?.(`[thought-window] director: ${error instanceof Error?error.message:String(error)}`);
   send(res,error?.status||502,{ok:false,error:error instanceof Error?error.message:String(error)});
  }
 }}),'thought-window: stage director route');
}
