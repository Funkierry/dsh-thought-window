'use strict';
// Run metrics from DSH's own records: per-step timing and output tokens on
// assistant nodes, call/return times on tool results, and the session
// projections (tokenUsage, contextPressure, todos, sessionStats). Nothing here
// is estimated from text; a value DSH did not provide stays null.
const num=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
const textOf=content=>(Array.isArray(content)?content:[]).filter(b=>b?.type==='text').map(b=>String(b.text??'')).join('\n');

// Spans of the latest turn: one per model step and one per tool call, on the
// wall clock. A span still running has end null (the caller draws it to now).
function turnSpans(legacy,running){
 const nodes=legacy?.nodes||[],at=nodes.findLastIndex(n=>n.kind==='user'||n.kind==='steering');
 if(at<0)return {turn:null,start:null,spans:[]};
 const input=nodes[at],turn=input.turn,start=num(input.time),spans=[],calls=new Map();
 let cursor=start;
 for(const node of nodes.slice(at+1)){
  if(node.kind==='assistant'){
   const t=node.timing||{},s=num(t.stepStartTime)??cursor,e=num(t.completedTime)??num(node.time);
   const tools=(node.blocks||[]).filter(b=>b.kind==='tool-call');
   const reasoning=(node.blocks||[]).filter(b=>b.kind==='reasoning').reduce((n,b)=>n+String(b.text||'').length,0);
   const text=(node.blocks||[]).filter(b=>b.kind==='text').reduce((n,b)=>n+String(b.text||'').length,0);
   spans.push({id:'step:'+node.step,kind:'llm',label:'step '+(node.step+1),start:s,end:e,first:num(t.firstTokenTime),tokens:num(node.usage?.outputTokens),reasoning,text,status:node.interrupted?'stopped':'done'});
   for(const b of tools)calls.set(b.callId,{name:b.name||'tool',args:b.argsRaw||'',start:e});
   cursor=e??cursor;
  }else if(node.kind==='tool-result'){
   const call=calls.get(node.callId)||{name:node.name||'tool',args:''};
   const s=num(node.callTime)??call.start??cursor,e=num(node.time);
   spans.push({id:'tool:'+node.callId,kind:'tool',label:call.name,args:call.args,start:s,end:e,status:node.isError?'error':'done',result:textOf(node.content).slice(0,400)});
   calls.delete(node.callId);cursor=Math.max(cursor??0,e??0)||cursor;
  }else if(node.kind==='turn-error'){
   spans.push({id:'error:'+node.seq,kind:'error',label:'error',start:num(node.time),end:num(node.time),status:'error',result:String(node.message||'')});
  }
 }
 for(const call of legacy?.runningCalls||[]){
  if(spans.some(s=>s.id==='tool:'+call.callId))continue;
  spans.push({id:'tool:'+call.callId,kind:'tool',label:call.name||'tool',args:call.argsRaw||'',start:num(call.time)??cursor,end:null,status:'running'});
  calls.delete(call.callId);
 }
 if(running&&legacy?.partial&&!spans.some(s=>s.id==='step:'+legacy.partial.step&&s.kind==='llm'))
  spans.push({id:'step:'+legacy.partial.step,kind:'llm',label:'step '+(legacy.partial.step+1),start:cursor,end:null,status:'running'});
 return {turn,start,spans};
}
function sum(spans,kind,now){return spans.filter(s=>s.kind===kind&&s.start!=null).reduce((n,s)=>n+Math.max(0,(s.end??now)-s.start),0);}

// Everything the HUD and the data scenes need, for one moment `now`.
function runMetrics(legacy,running,projections={},now=Date.now()){
 const {turn,start,spans}=turnSpans(legacy,running);
 const llm=spans.filter(s=>s.kind==='llm'),tools=spans.filter(s=>s.kind==='tool');
 const decoded=llm.filter(s=>s.tokens!=null&&s.first!=null&&s.end!=null&&s.end>s.first);
 const tokens=llm.reduce((n,s)=>n+(s.tokens||0),0);
 const decodeMs=decoded.reduce((n,s)=>n+(s.end-s.first),0);
 const firstStep=llm[0];
 const usage=projections.tokenUsage,pressure=projections.contextPressure;
 const billed=usage?(usage.uncachedInputTokens||0)+(usage.cacheReadTokens||0)+(usage.cacheWriteTokens||0):0;
 const used=num(pressure?.projectedTokens)??num(pressure?.pressureTokens),window=num(pressure?.contextWindow);
 const todos=(Array.isArray(projections.todos)?projections.todos:[]).filter(t=>t&&typeof t.content==='string').map(t=>({content:t.content,status:['pending','in_progress','completed'].includes(t.status)?t.status:'pending'}));
 const last=spans.reduce((m,s)=>Math.max(m,s.end??(running?now:0)),start||0);
 return {
  turn,start,spans,running:!!running,
  elapsedMs:start!=null?Math.max(0,(running?now:last)-start):null,
  llmMs:sum(spans,'llm',now),toolMs:sum(spans,'tool',now),
  ttftMs:firstStep?.first!=null&&firstStep.start!=null?Math.max(0,firstStep.first-firstStep.start):null,
  steps:llm.length,tools:tools.length,toolErrors:tools.filter(s=>s.status==='error').length,
  outputTokens:llm.some(s=>s.tokens!=null)?tokens:null,
  tokensPerSecond:decodeMs>0?tokens/(decodeMs/1000):null,
  usage:usage?{input:billed,output:usage.outputTokens||0,cacheRead:usage.cacheReadTokens||0,cacheWrite:usage.cacheWriteTokens||0,uncached:usage.uncachedInputTokens||0,cacheHit:billed?usage.cacheReadTokens/billed:null}:null,
  context:used!=null&&window?{used,window,share:Math.min(1,used/window)}:null,
  todos,session:projections.sessionStats||null
 };
}
const fmtMs=ms=>ms==null?'—':ms<1000?Math.round(ms)+'ms':ms<60000?(ms/1000).toFixed(1)+'s':Math.floor(ms/60000)+'m'+String(Math.round(ms%60000/1000)).padStart(2,'0')+'s';
const fmtTok=n=>n==null?'—':n<1000?String(Math.round(n)):n<1e6?(n/1000).toFixed(n<1e4?1:0)+'k':(n/1e6).toFixed(1)+'M';
module.exports={turnSpans,runMetrics,fmtMs,fmtTok};
