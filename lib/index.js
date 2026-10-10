// Host half: the stage director and the thought outline. Authenticated routes
// make one extra model call each (per user message / per finished reasoning)
// through DSH's own LLM service and model selection, and return validated
// JSON. No key is read by the plugin itself.
import {createRequire} from 'node:module';
import {BlockAssembler,ReasoningEffortId,createUserMessage} from '@deepseek-ai/dsh-llm';

const require=createRequire(import.meta.url);
const {SYSTEM_PROMPT,SPRITE_PROMPT,buildRequest,buildSpriteRequest,parseScript,parseRig,holdActor}=require('../src/director-script.cjs');
const {OUTLINE_PROMPT,buildOutlineRequest,parseOutline}=require('../src/outline.cjs');

export const name='thought-window';
export const inject=['webServer','connection','llm','agentDefaultModel'];

const ROUTE='/thought-window-director';
const MAX_BODY=64*1024;
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
// The reasoning effort to request: 'off' for quick calls, the lightest
// available level for the illustrator; null when the model offers no choice.
async function effortFor(llm,provider,model,think){
 try{
  const ids=((await llm.resolveModelInfo?.(provider,model))?.reasoning?.efforts||[]).map(e=>e.id);
  if(!think)return ids.includes('off')?'off':null;
  return ['low','minimal','medium'].find(id=>ids.includes(id))||null;
 }catch{return null;}
}
// One model call with DSH's default model; a reply that does not parse gets
// one more try at a lower temperature.
async function callModel(ctx,{system,text,parse,label,temperature,debug,think=false,maxTokens=MAX_OUTPUT_TOKENS,timeout=TIMEOUT_MS}){
 const selection=ctx.agentDefaultModel.currentSelection();
 if(!selection?.provider||!selection?.model)throw Object.assign(Error('当前没有可用的默认模型'),{status:409});
 const {provider,model}=selection,started=Date.now(),effort=await effortFor(ctx.llm,provider,model,think);
 const usage={inputTokens:0,outputTokens:0,cacheReadTokens:0,totalTokens:0};
 let firstError=null;
 for(let attempt=0;;attempt++){
  const note=attempt?'\n\nYour previous reply was not valid JSON. Reply again with strictly valid JSON only (commas between all array items).':'';
  const options={
   provider,model,system,temperature:attempt?.3:temperature,maxTokens,signal:AbortSignal.timeout(timeout),
   messages:[createUserMessage({content:[{type:'text',text:text+note}],source:{kind:'plugin',plugin:'dsh-thought-window'}})],
   ...(effort?{reasoningEffort:ReasoningEffortId(effort)}:{})
  };
  const assembler=new BlockAssembler();
  for await(const chunk of ctx.llm.stream(options))assembler.push(chunk);
  for(const key of Object.keys(usage))usage[key]+=assembler.usage?.[key]||0;
  const finish=assembler.finish;
  if(finish&&finish.kind!=='stop'&&finish.kind!=='max-tokens')throw Error(finish.failure?.message||'模型调用未正常结束：'+finish.kind);
  const reply=assembler.blocks().filter(b=>b.type==='text').map(b=>b.text).join('');
  try{return {ok:true,value:parse(reply),model:{provider,model},usage,attempts:attempt+1,...(firstError?{firstError}:{}),ms:Date.now()-started};}
  catch(error){if(attempt>=1)throw Error(label+'格式错误：'+error.message);firstError=error.message;if(debug===true)firstError+=' · raw: '+reply;}
 }
}
async function direct(ctx,request){
 const {value,...rest}=await callModel(ctx,{system:SYSTEM_PROMPT,text:buildRequest(request),parse:parseScript,label:'导演剧本',temperature:.7,debug:request.debug});
 // The actor changes only on an explicit request in the user's message.
 return {...rest,script:holdActor(value,request.input,request.previous)};
}
// The illustrator thinks before drawing: reasoning stays on, with room for it.
async function drawSprite(ctx,request){
 const {value,...rest}=await callModel(ctx,{system:SPRITE_PROMPT,text:buildSpriteRequest(request),parse:parseRig,label:'角色画像',temperature:.6,debug:request.debug,think:true,maxTokens:16000,timeout:150_000});
 return {...rest,rig:value};
}
async function outline(ctx,request){
 const {value,...rest}=await callModel(ctx,{system:OUTLINE_PROMPT,text:buildOutlineRequest(request),parse:parseOutline,label:'思路提纲',temperature:.3,debug:request.debug});
 return {...rest,outline:value};
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
   const action=path===ROUTE+'/scene'?direct:path===ROUTE+'/outline'?outline:path===ROUTE+'/sprite'?drawSprite:null;
   if(!action||req.method!=='POST'||req.headers['x-thought-window']!=='1')return send(res,404,{ok:false,error:'not found'});
   let request;try{request=JSON.parse(await readBody(req)||'{}');}catch(error){if(error?.status)throw error;return send(res,400,{ok:false,error:'invalid JSON body'});}
   if(action===drawSprite?typeof request.draw!=='string'||!request.draw.trim():typeof request.input!=='string'||!request.input.trim())return send(res,400,{ok:false,error:action===drawSprite?'draw is required':'input is required'});
   if(action===outline&&(typeof request.reasoning!=='string'||!request.reasoning.trim()))return send(res,400,{ok:false,error:'reasoning is required'});
   send(res,200,await action(ctx,request));
  }catch(error){
   ctx.logger?.warn?.(`[thought-window] route: ${error instanceof Error?error.message:String(error)}`);
   send(res,error?.status||502,{ok:false,error:error instanceof Error?error.message:String(error)});
  }
 }}),'thought-window: stage director and outline routes');
}
