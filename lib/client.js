/* Thought Window 0.14.4 | MIT | See NOTICE.md for reference credits | platform React is provided by DSH */
window.__ModuleLoader__.load({id:"dsh-thought-window",factory:function(platformRequire){
"use strict";
const modules={"./work-data.cjs": function(module,exports,require){
'use strict';
const FILE_LIMIT=40,RUN_LIMIT=40,TEXT_LIMIT=8000;
const EMPTY_WORK=Object.freeze({files:[],runs:[],omitted:0});
const textOf=blocks=>(Array.isArray(blocks)?blocks:[]).filter(b=>b?.type==='text').map(b=>String(b.text??'')).join('\n');
const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
const pathValue=value=>typeof value==='string'&&value.trim()&&value.length<=4096&&!/[\x00-\x1f]/.test(value)?value:null;
const readArgs=raw=>{try{const args=JSON.parse(raw);return record(args)?args:null;}catch{return null;}};
const basename=path=>String(path).replace(/\\/g,'/').split('/').at(-1)||path;
function mutation(name,args){
 if(!args)return null;
 if(name==='write'&&typeof args.content==='string'&&pathValue(args.file_path))return {path:args.file_path,action:'write',lines:args.content.split('\n').length};
 if(name==='edit'&&pathValue(args.file_path)&&typeof args.old_string==='string'&&args.old_string.length&&typeof args.new_string==='string'&&args.old_string!==args.new_string)return {path:args.file_path,action:'edit'};
 if(name==='str_replace_editor'&&pathValue(args.path)){
  if(args.command==='create'&&typeof args.file_text==='string')return {path:args.path,action:'write',lines:args.file_text.split('\n').length};
  if(args.command==='str_replace'&&typeof args.old_str==='string'&&args.old_str.length&&(args.new_str===undefined||typeof args.new_str==='string'))return {path:args.path,action:'edit'};
  if(args.command==='insert'&&Number.isInteger(args.insert_line)&&args.insert_line>=0&&typeof args.new_str==='string')return {path:args.path,action:'edit'};
 }
 return null;
}
// Only documented terminal markers supply an exit code. A returned tool alone
// is not evidence that a program worked or a generated file passed a test.
function runState(call,args,result,running){
 if(!result)return {status:running?'running':'stopped',label:running?(call.active?'执行中':'等待返回'):'未收到结果',exitCode:null};
 const output=textOf(result.content),tail=output.trimEnd();
 const exit=/(?:^|\n)\[exit code: (-?\d+)\]$/.exec(tail);
 const signal=/(?:^|\n)\[killed by signal: ([^\]]+)\]$/.exec(tail);
 const blocked=/(?:^|\n)\[(?:timed out|sandbox:|runner failure|aborted)/i.test(tail);
 if(result.isError||blocked||signal)return {status:'error',label:signal?'进程被终止':blocked?'执行受阻':'调用失败',exitCode:exit?Number(exit[1]):null};
 if(exit)return {status:Number(exit[1])===0?'done':'error',label:'退出码 '+exit[1],exitCode:Number(exit[1])};
 if(args?.run_in_background===true)return {status:'submitted',label:'后台已提交',exitCode:null};
 if(['job_output','job_status','job_kill'].includes(call.name)){
  const job=/(?:^|\n)\[status: (running|completed|failed|killed)(?:, ([^\]\n]*))?\]$/.exec(tail);
  if(job){
   const code=/exit code: (-?\d+)/.exec(job[2]||''),exitCode=code?Number(code[1]):null;
   const status=job[1]==='running'?'running':job[1]!=='completed'||exitCode!==null&&exitCode!==0?'error':'done';
   return {status,label:job[1]==='running'?'后台运行中 · 上次查询':job[1]==='killed'?'后台任务已终止':job[1]==='failed'?'后台任务失败':exitCode!==null?'后台退出码 '+exitCode:'后台任务已结束',exitCode};
  }
 }
 if(['job_output','job_status'].includes(call.name))return {status:'done',label:'已收到运行记录',exitCode:null};
 return {status:'done',label:'调用已返回',exitCode:null};
}
function projectWork(legacy,running=false,deliverables,cwd=''){
 const all=legacy?.nodes||[],cut=all.findLastIndex(n=>n.kind==='user'),nodes=all.slice(Math.max(0,cut));
 const userSeq=all[cut]?.seq??-Infinity,calls=new Map(),results=new Map();
 const add=(call,meta={})=>{if(!call?.callId)return;const prior=calls.get(call.callId);calls.set(call.callId,{...prior,...meta,id:'tool:'+call.callId,callId:call.callId,name:call.name||call.call?.name||prior?.name||'',argsRaw:call.argsRaw??call.call?.argsRaw??prior?.argsRaw??''});};
 const visit=(call,meta={},depth=0)=>{if(depth>6)return;add(call,meta);if(call.kind==='tool-result')results.set(call.callId,call);for(const child of call.subCalls||[])visit(child,meta,depth+1);};
 for(const node of nodes){
  if(node.kind==='assistant')for(const block of node.blocks||[])if(block.kind==='tool-call')add(block,{turn:node.turn,seq:node.seq,time:node.time});
  if(node.kind==='tool-result'){
   visit(node,{seq:node.seq,time:node.callTime??node.time});
  }
 }
 const currentTurn=nodes.findLast(n=>n.kind==='assistant')?.turn??legacy?.partial?.turn;
 if(legacy?.partial)for(const block of legacy.partial.blocks||[])if(block.kind==='tool-call')add(block,{turn:legacy.partial.turn});
 for(const call of legacy?.runningCalls||[])if(calls.has(call.callId)||currentTurn!==undefined&&call.turn===currentTurn)visit(call,{active:true});
 const files=new Map(),runs=[];
 const root=String(cwd).replace(/\\/g,'/').replace(/\/+$/,'');
 const file=path=>{let key=path.replace(/\\/g,'/').replace(/^(?:\.\/)+/,'');if(root&&key.startsWith(root+'/'))key=key.slice(root.length+1);if(!files.has(key))files.set(key,{path,name:basename(path),status:'pending',action:'write',changes:0,declared:false,nodeId:null,description:''});return files.get(key);};
 for(const call of calls.values()){
  const args=readArgs(call.argsRaw),result=results.get(call.callId),change=mutation(call.name,args);
  if(change){
   const item=file(change.path);Object.assign(item,{action:change.action,status:result?(result.isError?'error':'done'):(running?'running':'stopped'),nodeId:call.id,seq:call.seq??null,lines:change.lines??null});
   if(result&&!result.isError)item.changes++;
   continue;
  }
  if(call.name==='present'&&args&&Array.isArray(args.files)&&result&&!result.isError){
   for(const declared of args.files.slice(0,FILE_LIMIT))if(pathValue(declared?.path))Object.assign(file(declared.path),{declared:true,status:'done',nodeId:call.id,description:typeof declared.description==='string'?declared.description.slice(0,400):''});
  }
  if(!['bash','pwsh','job_output','job_status','job_kill'].includes(call.name)||!args)continue;
  const command=typeof args.command==='string'?args.command:typeof args.job_id==='string'||typeof args.job_id==='number'?call.name+' '+args.job_id:'';
  if(!command)continue;
  const output=result?textOf(result.content):'',state=runState(call,args,result,running);
  runs.push({id:call.id,name:call.name,command:command.slice(0,4096),cwd:typeof args.workdir==='string'?args.workdir.slice(0,4096):'',...state,output:output.slice(-TEXT_LIMIT),truncated:output.length>TEXT_LIMIT,nodeId:call.id,time:call.time??null});
 }
 // The host's deliverables index also covers explicit presentations of files
 // produced by a shell. Never extract made-up files from closing prose.
 for(const row of deliverables?.produced||[])if(row.seq>=userSeq&&pathValue(row.path)){const item=file(row.path);if(!item.nodeId)Object.assign(item,{status:'done',action:'edit',changes:1});}
 for(const row of deliverables?.presented||[])if(row.seq>=userSeq&&pathValue(row.path)){const item=file(row.path);Object.assign(item,{declared:true,description:typeof row.description==='string'?row.description.slice(0,400):''});if(!item.seq||row.seq>=item.seq)item.status='done';}
 return {files:[...files.values()].slice(-FILE_LIMIT),runs:runs.slice(-RUN_LIMIT),omitted:Math.max(0,files.size-FILE_LIMIT)+Math.max(0,runs.length-RUN_LIMIT)};
}
// Same session-file address contract as DSH's chat openFile. Paths are data,
// never executable URLs, and a preview is opened only by an explicit click.
function fileAddress(sessionId,cwd,path){
 if(!pathValue(path)||!sessionId)throw Error('文件路径不可用');
 let normalized=path.replace(/\\/g,'/').replace(/^(?:\.\/)+/,'');
 const root=typeof cwd==='string'?cwd.replace(/\\/g,'/').replace(/\/+$/,''):'';
 if(root&&normalized.startsWith(root+'/'))normalized=normalized.slice(root.length+1);
 const encode=s=>encodeURIComponent(s).replace(/%3A/gi,':');
 return 'dsh-resource://file/session/'+encode(String(sessionId))+'/'+normalized.split('/').map(encode).join('/');
}
function validateWork(work){
 if(work===undefined)return;
 if(!record(work)||!Array.isArray(work.files)||work.files.length>FILE_LIMIT||!Array.isArray(work.runs)||work.runs.length>RUN_LIMIT||!Number.isInteger(work.omitted)||work.omitted<0)throw Error('成果记录格式错误');
 const str=(value,max)=>typeof value==='string'&&value.length<=max;
 for(const file of work.files)if(!record(file)||!pathValue(file.path)||!str(file.name,4096)||!['pending','running','stopped','error','done'].includes(file.status)||!['write','edit'].includes(file.action)||!str(file.description,400)||!(file.nodeId===null||str(file.nodeId,300))||typeof file.declared!=='boolean'||!Number.isInteger(file.changes)||file.changes<0)throw Error('文件记录无效');
 for(const run of work.runs)if(!record(run)||!str(run.id,300)||!str(run.nodeId,300)||!str(run.name,60)||!str(run.command,4096)||!str(run.cwd,4096)||!str(run.output,TEXT_LIMIT)||!str(run.label,100)||!['running','stopped','done','error','submitted'].includes(run.status)||!(run.exitCode===null||Number.isSafeInteger(run.exitCode)))throw Error('运行记录无效');
}
module.exports={projectWork,mutation,runState,fileAddress,validateWork,EMPTY_WORK,FILE_LIMIT,RUN_LIMIT,TEXT_LIMIT,basename};

},
"./host-bridge.cjs": function(module,exports,require){
'use strict';
const {fileAddress}=require('./work-data.cjs');
function createHostBridge(ctx){
 const service=name=>{try{return ctx.get?.(name);}catch{return undefined;}};
 return {
  cwd(sessionId){return service('sessions')?.list?.getSnapshot()?.byId?.[sessionId]?.cwd||'';},
  canOpen(){return typeof service('sidebarRight')?.openResource==='function';},
  openFile(sessionId,path){
   const sidebar=service('sidebarRight');if(!sidebar?.openResource)throw Error('当前宿主未提供文件预览入口，请使用聊天中的文件链接。');
   const cwd=service('sessions')?.list?.getSnapshot()?.byId?.[sessionId]?.cwd;
   sidebar.openResource(fileAddress(sessionId,cwd,path));
  },
  readPreview(sessionId){
   const sidebar=service('sidebarRight'),tab=sidebar?.active?.();
   const prefix='dsh-resource://file/session/'+encodeURIComponent(String(sessionId)).replace(/%3A/gi,':')+'/';
   const address=typeof tab?.contentId==='string'?tab.contentId:'';
   if(!sidebar?.isExpanded?.()||!address.startsWith(prefix))return {open:false,path:'',address:''};
   let path=address.slice(prefix.length);try{path=path.split('/').map(decodeURIComponent).join('/');}catch{}
   return {open:true,path,address};
  }
 };
}
module.exports={createHostBridge};

},
"./core.cjs": function(module,exports,require){
'use strict';
const {validateWork}=require('./work-data.cjs');

// Projection only: no network requests, inferred private thoughts, or model calls.
const MAX_NODES = 160;
const MAX_SOURCE = 12000;
const labels = {input:'输入', reasoning:'推理片段', compare:'比较 · 自动标签', check:'检查 · 自动标签', revise:'修正 · 自动标签', tool:'工具调用', answer:'回答', error:'运行错误', retry:'重试'};
const clip = (s, n) => String(s ?? '').slice(0, n);
const contentText = content => (Array.isArray(content) ? content : []).filter(b => b?.type === 'text').map(b => String(b.text ?? '')).join('\n');

function classify(text) {
  if (/(?:重新|修正|纠正|但是.*不|reconsider|instead|revise)/i.test(text)) return 'revise';
  if (/(?:验证|检查|测试|确认|verify|check|test\b)/i.test(text)) return 'check';
  if (/(?:比较|相比|方案.?[AB甲乙]|优缺点|compare|versus|alternative)/i.test(text)) return 'compare';
  return 'reasoning';
}

// Boundaries only depend on the prefix so streaming updates do not reshuffle IDs.
function segments(value) {
  const text = String(value ?? '');
  const result = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const length = i - start + 1;
    if ((length >= 55 && /[。！？\n]/u.test(text[i])) || length >= 220) {
      result.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < text.length && text.slice(start).trim()) result.push(text.slice(start));
  return result;
}

function project(legacy, running = false) {
  const nodes = [];
  const tools = new Map();
  let clipped = 0;
  function add(node) {
    const source = String(node.source ?? '');
    nodes.push({...node, label:labels[node.kind] || node.kind, source:clip(source, MAX_SOURCE), truncated:source.length > MAX_SOURCE, excerpt:clip(source.replace(/\s+/g, ' ').trim(), 92)});
  }
  function tool(call, meta = {}) {
    const id = `tool:${call.callId}`;
    if (!tools.has(id)) {
      add({id, kind:'tool', title:clip(call.name || call.call?.name || 'tool', 90), source:call.argsRaw ?? call.call?.argsRaw ?? '', status:running?'running':'stopped', ...meta});
      tools.set(id, nodes[nodes.length - 1]);
    }
    return tools.get(id);
  }
  function assistant(item, partial) {
    const blocks = item.blocks || [];
    blocks.forEach((block, bi) => {
      const base = {turn:item.turn, step:item.step, time:item.time, seq:item.seq, status:item.interrupted?'stopped':'done'};
      if (block.kind === 'tool-call') {
        tool(block, {...base,status:running&&!item.interrupted?'running':'stopped'});
      } else if (block.kind === 'reasoning' || block.kind === 'text') {
        const isReason = block.kind === 'reasoning';
        const pieces = isReason ? segments(block.text) : [String(block.text ?? '')];
        const offset = Math.max(0, pieces.length - 40);
        clipped += offset;
        pieces.slice(offset).forEach((source, j) => {
          if (!source.trim()) return;
          const kind = isReason ? classify(source) : 'answer';
          add({...base, id:`a:${item.turn}:${item.step}:${bi}:${offset+j}`, kind, title:clip(source.replace(/^[\s#*\-]+/, '').replace(/\s+/g,' ').trim(), 44), source,
            status:partial && bi===blocks.length-1 && j===pieces.length-offset-1 ? (running?'running':'stopped') : base.status});
        });
      }
    });
  }
  const records = legacy?.nodes || [];
  // Streaming and final forms can briefly coexist during host settlement.
  const finalized = new Set(records.filter(n=>n.kind==='assistant').map(n=>`${n.turn}:${n.step}`));
  for (const item of records) {
    const base = {time:item.time,seq:item.seq,turn:item.turn,step:item.step};
    if (item.kind === 'user' || item.kind === 'steering') {
      const source = contentText(item.content);
      add({...base,id:`${item.kind}:${item.seq}`,kind:'input',title:clip(source || '附件输入',44),source:source || '此消息含非文本附件，请在原生聊天中查看。',status:'done'});
    } else if (item.kind === 'assistant') {
      assistant(item,false);
    } else if (item.kind === 'tool-result') {
      const node = tool(item,{...base, parentCallId:item.parentCallId});
      const result = contentText(item.content) || String(item.error?.message ?? item.error ?? '（工具未返回文本）');
      const source = `参数\n${node.source}\n\n返回\n${result}`;
      Object.assign(node,{status:item.isError?'error':'done',source:clip(source,MAX_SOURCE),truncated:source.length>MAX_SOURCE,excerpt:clip(result.replace(/\s+/g,' '),92),time:item.callTime ?? node.time});
    } else if (item.kind === 'turn-error') {
      add({...base,id:`error:${item.seq}`,kind:'error',title:'运行中断',source:item.message,status:'error'});
    } else if (item.kind === 'model-retry') {
      add({...base,id:`retry:${item.seq}`,kind:'retry',title:'模型请求重试',source:item.message || item.reason || 'DSH 发起请求重试',status:'done'});
    }
    // Explicitly omit context, system prompts, unknown events, and binary blocks.
  }
  if (legacy?.partial && !finalized.has(`${legacy.partial.turn}:${legacy.partial.step}`)) assistant(legacy.partial,true);
  for (const call of legacy?.runningCalls || []) {
    const node = tool(call, {turn:call.turn,step:call.step,time:call.time,parentCallId:call.parentCallId});
    // A durable result wins over a stale running-call projection.
    if (!records.some(r=>r.kind==='tool-result' && r.callId===call.callId)) node.status=running?'running':'stopped';
  }
  const excess = Math.max(0,nodes.length-MAX_NODES);
  const visible = nodes.slice(excess);
  const ids = new Set(visible.map(n=>n.id));
  const edges = [];
  visible.forEach((n,i)=>{
    if(i) edges.push({from:visible[i-1].id,to:n.id,kind:'sequence'});
    if(n.parentCallId && ids.has(`tool:${n.parentCallId}`)) edges.push({from:`tool:${n.parentCallId}`,to:n.id,kind:'parent'});
  });
  return {nodes:visible, edges, running:!!running, omitted:clipped+excess, hasReasoning:nodes.some(n=>['reasoning','check','compare','revise'].includes(n.kind))};
}

// Total history is bounded by both frame count and text size, including long answers.
function appendFrame(frames, graph, time=Date.now(), maxFrames=90, maxBytes=4_000_000) {
  const signature=JSON.stringify(graph);
  if(frames.length && JSON.stringify(frames.at(-1).graph)===signature) return frames;
  const next=[...frames,{at:time,graph}];
  let size=next.reduce((sum,f)=>sum+JSON.stringify(f).length*2,0);
  while(next.length>1 && (next.length>maxFrames || size>maxBytes)) size-=JSON.stringify(next.shift()).length*2;
  return next;
}

function validateReplay(value) {
  if(!value || value.format!=='dsh-thought-window' || value.version!==1 || !Array.isArray(value.frames) || !value.frames.length || value.frames.length>90) throw Error('不支持的回放格式');
  if(JSON.stringify(value).length>6_000_000) throw Error('回放过大');
  const kinds=new Set(Object.keys(labels));
  for(const f of value.frames) {
    if(!Number.isFinite(f.at) || !f.graph || !Array.isArray(f.graph.nodes) || f.graph.nodes.length>MAX_NODES || !Array.isArray(f.graph.edges) || f.graph.edges.length>MAX_NODES*2) throw Error('回放节点格式错误');
    validateWork(f.graph.work);
    const ids=new Set();
    for(const n of f.graph.nodes) {
      if(typeof n.id!=='string' || n.id.length>300 || ids.has(n.id) || !kinds.has(n.kind) || !['done','running','stopped','error'].includes(n.status)) throw Error('回放节点无效');
      ids.add(n.id);
      for(const field of ['title','source','excerpt','label']) if(typeof n[field]!=='string' || n[field].length>MAX_SOURCE) throw Error('回放文本无效');
    }
    for(const e of f.graph.edges) if(!ids.has(e.from)||!ids.has(e.to)||!['sequence','parent'].includes(e.kind)) throw Error('回放连线无效');
  }
  return value.frames;
}
module.exports={project,segments,classify,appendFrame,validateReplay,contentText};

},
"./run-metrics.cjs": function(module,exports,require){
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

},
"./storage.cjs": function(module,exports,require){
'use strict';
const DB='dsh-thought-window-v1';
function openDB() {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('sessions',{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
async function transaction(mode,run) {
  const db=await openDB();
  try {
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction('sessions',mode);
      const result=run(tx.objectStore('sessions'));
      tx.oncomplete=()=>resolve(result?.result);
      tx.onerror=()=>reject(tx.error);
      tx.onabort=()=>reject(tx.error || Error('保存已取消'));
    });
  } finally {db.close();}
}
async function save(id,frames) {
  await transaction('readwrite',store=>store.put({id,updated:Date.now(),frames}));
  // Retain at most ten sessions in this plugin's own store.
  await transaction('readwrite',store=>{
    const req=store.getAll();
    req.onsuccess=()=>req.result.sort((a,b)=>b.updated-a.updated).slice(10).forEach(r=>store.delete(r.id));
    return req;
  });
}
const load=id=>transaction('readonly',store=>store.get(id));
const remove=id=>transaction('readwrite',store=>store.delete(id));
const clear=()=>transaction('readwrite',store=>store.clear());
module.exports={save,load,remove,clear};

},
"./scenes.cjs": function(module,exports,require){
'use strict';
// Deterministic presentation metadata derived only from visible source events.
const SCENES={
  idle:{title:'等待一个想法',en:'STANDBY',theme:'paper',mark:'○'},
  analysis:{title:'梳理问题',en:'THOUGHT ATLAS',theme:'night',mark:'✧'},
  plan:{title:'拆解与规划',en:'STEP SEQUENCER',theme:'blueprint',mark:'▤'},
  compare:{title:'并列比较',en:'BRANCH EXPLORER',theme:'violet',mark:'⑂'},
  search:{title:'检索与阅读',en:'SOURCE RADAR',theme:'phosphor',mark:'◎'},
  code:{title:'代码与结构',en:'CODE WORKBENCH',theme:'night',mark:'⌘'},
  math:{title:'公式与推导',en:'FORMULA BOARD',theme:'blueprint',mark:'∑'},
  execute:{title:'工具执行',en:'EXECUTION BUS',theme:'amber',mark:'▸'},
  check:{title:'检查与核验',en:'CHECK REGISTER',theme:'phosphor',mark:'☷'},
  revise:{title:'发现问题与修正',en:'REVISION DESK',theme:'amber',mark:'↶'},
  summary:{title:'整理回答',en:'RESPONSE ASSEMBLY',theme:'paper',mark:'▣'}
};
const THEMES={obsidian:'深黑仪表',paper:'纸白档案',night:'深海终端',amber:'琥珀显像管',phosphor:'荧光绿屏',violet:'紫晶像素',blueprint:'工程蓝图'};
const rules=[
 ['revise',/(修正|纠正|重新考虑|回滚|排除这个|改为|reconsider|revise|rollback|instead\b)/ig],
 ['compare',/(比较|对比|权衡|优缺点|方案\s*[AB甲乙]|vs\.?\b|compare|trade.?off|alternative)/ig],
 ['check',/(检查|验证|核验|测试|断言|verify|validation|checklist|test\b|assert)/ig],
 ['search',/(检索|搜索|查找|查阅|资料|参考来源|search|retrieve|look up|sources?\b)/ig],
 ['math',/(推导|公式|方程|概率|积分|矩阵|equation|formula|derive|integral)/ig],
 ['code',/(```|函数|接口|组件|代码|类定义|实现细节|function\b|interface\b|class\b|implement|code\b|schema)/ig],
 ['plan',/(计划|步骤|分解|拆解|首先|接下来|第[一二三四五六七八九十\d]+步|plan\b|steps?\b|first\b|next\b)/ig]
];
function turnNodes(graph){
  const index=graph.nodes.findLastIndex(n=>n.kind==='input');
  return graph.nodes.slice(Math.max(0,index));
}
function classifyScene(text){
  // Prefer a new heading or the current tail, not stale keywords earlier in a paragraph.
  const tail=String(text||'').slice(-1400);
  const heading=tail.split('\n').filter(Boolean).at(-1)||tail;
  let best={id:'analysis',score:0,match:'公开推理片段'};
  for(const [id,pattern] of rules){
    pattern.lastIndex=0;
    const matches=[...tail.matchAll(pattern)];
    if(!matches.length)continue;
    const last=matches.at(-1);
    const headPattern=new RegExp(pattern.source,'i');
    const start=heading.replace(/^[#\s\d.、\-]+/,'').slice(0,30);
    const first=headPattern.exec(start);
    const score=Math.min(matches.length,3)+(last.index/tail.length)*.5+(first&&first.index<8?2:0);
    if(score>best.score)best={id,score,match:last[0]};
  }
  return best;
}
function detectScene(graph){
  const nodes=turnNodes(graph), last=nodes.at(-1);
  const turn=nodes.find(n=>n.kind==='input')?.id||'history';
  const meta=(id,reason,node=last)=>({id,turn,reason,focusId:node?.id});
  if(!last)return meta('idle','等待对话事件');
  const running=nodes.findLast(n=>n.kind==='tool'&&n.status==='running');
  if(running&&graph.running)return meta('execute','工具正在运行',running);
  if(last.kind==='error'||last.kind==='retry'||last.kind==='tool'&&last.status==='error')return meta('revise','工具错误或运行重试');
  if(last.kind==='answer')return meta('summary',graph.running?'正在生成回答':'已观察到回答文本');
  if(last.kind==='tool')return meta('execute','工具返回了结果');
  if(last.kind==='input')return meta('analysis','收到新的输入');
  let detected=classifyScene(last.source);
  // A neutral continuation of the same public reasoning block keeps its context.
  if(detected.id==='analysis'&&/^a:/.test(last.id||'')){
    const block=last.id.replace(/:\d+$/,'');
    const previous=nodes.slice(0,-1).filter(n=>n.id?.replace(/:\d+$/,'')===block).reverse();
    for(const n of previous){const earlier=classifyScene(n.source);if(earlier.id!=='analysis'){detected=earlier;break;}}
  }
  return meta(detected.id,detected.id==='analysis'?'公开推理片段':`原文匹配「${detected.match}」`);
}
function routeScene(state,candidate,now,immediate=false){
  if(!state||state.turn!==candidate.turn||immediate)return {...candidate,since:now,pending:null};
  if(state.id===candidate.id)return {...state,...candidate,pending:null};
  const urgent=['execute','revise','summary'].includes(candidate.id);
  if(state.pending?.id!==candidate.id)return {...state,pending:{id:candidate.id,at:now}};
  if(now-state.pending.at>=(urgent?260:650)&&now-state.since>=(urgent?350:1400))return {...candidate,since:now,pending:null};
  return state;
}
function fragments(nodes,limit=6){
  const result=[];
  for(const node of nodes){
    const lines=String(node.source).split(/\n+|(?<=[。！？;；])\s*/u).map(s=>s.trim()).filter(Boolean);
    lines.forEach((text,index)=>result.push({key:node.id+':'+index,nodeId:node.id,text:text.slice(0,900),label:node.label,status:node.status}));
  }
  return result.slice(-limit);
}
function buildScene(graph,id){
  const nodes=turnNodes(graph);
  const input=nodes.find(n=>n.kind==='input');
  const reasoning=nodes.filter(n=>!['input','tool','answer','error','retry'].includes(n.kind));
  const relevant=reasoning.filter(n=>classifyScene(n.source).id===id);
  const focus=nodes.at(-1);
  const sourceNodes=relevant.length?relevant.slice(-4):reasoning.length?reasoning.slice(-3):focus?[focus]:[];
  const items=fragments(sourceNodes,8);
  const explicitSteps=items.filter(item=>/^(?:[-*#]\s*)?(?:第[一二三四五六七八九十\d]+步|步骤\s*\d|step\s*\d|\d+[.、])/i.test(item.text));
  const steps=explicitSteps.length?explicitSteps:items;
  const options=[];
  for(const node of sourceNodes){
    const pattern=/(?:方案|选项|Option|Approach)\s*([A-D甲乙丙丁一二三四1-4])\s*[:：.、]?/ig;
    const matches=[...node.source.matchAll(pattern)];
    matches.forEach((match,i)=>options.push({key:node.id+':option:'+i,nodeId:node.id,label:match[0].replace(/[:：.、]$/,''),text:node.source.slice(match.index+match[0].length,matches[i+1]?.index).trim().slice(0,900),status:node.status}));
  }
  const tools=nodes.filter(n=>n.kind==='tool').slice(-6);
  // Rejoin adjacent segments of a single source block so closing fences do not
  // replace the actual code. Every displayed line still comes from that block.
  const codeGroups=[];
  for(const node of reasoning){
    const key=/^a:/.test(node.id)?node.id.replace(/:\d+$/,''):node.id;
    const previous=codeGroups.at(-1);
    if(previous?.key===key){previous.text+=node.source;previous.nodes.push(node);}
    else codeGroups.push({key,text:node.source,nodes:[node]});
  }
  const codeGroup=codeGroups.findLast(g=>/```[^\n]*\n/.test(g.text));
  const codeMatch=codeGroup?.text.match(/```[^\n]*\n([\s\S]*?)(?:```|$)/);
  const codeNode=codeGroup?.nodes[0]||sourceNodes.at(-1);
  const code=codeMatch?codeMatch[1]:codeNode?.source||'';
  const formulas=[];
  for(const n of sourceNodes){
    const math=[...n.source.matchAll(/\$\$([\s\S]*?)\$\$|\$([^\n$]+)\$|([^\n。；$]{0,70}[=≈≤≥][^\n。；$]{1,120})/g)];
    math.forEach((m,i)=>formulas.push({key:n.id+':eq:'+i,nodeId:n.id,text:m[1]||m[2]||m[3]}));
  }
  return {id,info:SCENES[id]||SCENES.analysis,nodes,input,focus,items,steps,options:options.slice(-4),tools,code,codeNode,formulas:formulas.slice(-4),answer:nodes.findLast(n=>n.kind==='answer'),running:graph.running};
}
module.exports={SCENES,THEMES,turnNodes,classifyScene,detectScene,routeScene,buildScene};

},
"./choreography.cjs": function(module,exports,require){
'use strict';
// Scene geometry is presentation only. No synthetic model metrics are generated.
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const transitionFor=(from,to)=>{
  if(from===to)return 'reflow';
  return ({idle:'decode',analysis:'reflow',plan:'pan',compare:'fork',search:'orbit',code:'focus',math:'focus',execute:'conduit',check:'fold',revise:'rewind',summary:'gather'})[to]||'reflow';
};
function pointsFor(scene,count=48){
  return Array.from({length:count},(_,i)=>{
    const u=i/Math.max(1,count-1),col=i%12,row=Math.floor(i/12),a=u*Math.PI*2;
    switch(scene){
      case 'plan':return {x:68+(i%4)*166+(Math.floor(i/4)%3)*9,y:70+(i%4)*37+Math.floor(i/12)*10};
      case 'compare':return {x:i%2?438+(i%5)*12:112+(i%5)*12,y:95+Math.floor(i/2)*5};
      case 'search':return {x:320+Math.cos(a)*190,y:150+Math.sin(a)*92};
      case 'code':return {x:78+col*40,y:72+row*46};
      case 'math':return {x:54+u*530,y:150+Math.sin(u*Math.PI*4)*72};
      case 'execute':return {x:52+u*540,y:150+(i%3-1)*12};
      case 'check':return {x:88+col*42,y:68+row*48};
      case 'revise':return {x:i%2?360+(i%6)*27:62+(i%6)*27,y:72+Math.floor(i/6)*21};
      case 'summary':return {x:210+col*18,y:73+row*38};
      default:return {x:40+u*560,y:140+Math.sin(i*1.76)*70+Math.cos(i*.4)*26};
    }
  });
}
function flightPoints(from,to,count=48){
  const a=pointsFor(from,count),b=pointsFor(to,count);
  return a.map((start,i)=>({start,end:b[i],mid:{x:(start.x+b[i].x)/2+(b[i].y-start.y)*.12,y:(start.y+b[i].y)/2-(b[i].x-start.x)*.1},delay:(i%8)*13}));
}
function splitGeometry(width,ratio=.56){
  const value=Number.isFinite(ratio)?clamp(ratio,.35,.68):.56;
  return {ratio:value,stacked:width<920,panel:Math.max(0,Math.min(width*value,width-340))};
}
module.exports={transitionFor,pointsFor,flightPoints,splitGeometry};

},
"./transition.cjs": function(module,exports,require){
'use strict';
const React=require('react');
const {createElement:h,useState,useEffect,useLayoutEffect,useRef}=React;
const {transitionFor,flightPoints}=require('./choreography.cjs');
function useMotionAllowed(animate){
  const [reduced,setReduced]=useState(()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false);
  useEffect(()=>{const media=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');if(!media)return;const change=()=>setReduced(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
  return animate&&!reduced;
}
function TransitionStage({sceneKey,scene,children,animate,motion,instant}){
  const allowed=useMotionAllowed(animate)&&!instant;
  const previous=useRef(null),serial=useRef(0),active=useRef(null);
  const root=useRef(null),incoming=useRef(null),outgoing=useRef(null);
  const [cut,setCut]=useState(null);
  useLayoutEffect(()=>{
    const old=previous.current;
    if(!allowed){active.current?.();setCut(null);}
    else if(old&&old.key!==sceneKey){
      active.current?.();
      setCut({serial:++serial.current,from:old.scene,to:scene,kind:transitionFor(old.scene,scene),content:old.content});
    }
    previous.current={key:sceneKey,scene,content:children};
  },[sceneKey,allowed]);
  // Preserve the latest streamed text as the outgoing scene, without restarting a cut.
  useLayoutEffect(()=>{previous.current={key:sceneKey,scene,content:children};});
  useLayoutEffect(()=>{
    if(!cut||!allowed)return;
    const duration=motion==='calm'?220:760;
    const ease='cubic-bezier(.22,.72,.18,1)';
    const motions={
      reflow:['translateY(12px) scale(.985)','translateY(-8px) scale(1.01)'],
      pan:['translateX(48px)','translateX(-40px)'],
      fork:['scaleX(.88) translateY(12px)','scale(.96) translateY(-12px)'],
      orbit:['translateX(22px) rotate(1.5deg)','translateX(-20px) rotate(-1.5deg)'],
      focus:['scale(1.08)','scale(.93)'],
      conduit:['translateX(60px)','translateX(-46px)'],
      fold:['perspective(900px) rotateX(-9deg) translateY(14px)','perspective(900px) rotateX(8deg) translateY(-12px)'],
      rewind:['translateX(-38px)','translateX(35px)'],
      gather:['scale(.94) translateY(20px)','scale(1.04) translateY(-14px)'],
      decode:['scale(.98)','scale(1.02)']
    };
    const [enter,leave]=motions[cut.kind]||motions.reflow;
    const animations=[];
    const play=(el,frames,options)=>{if(el?.animate)animations.push(el.animate(frames,options));};
    // Align the carrier layer to the actual responsive SVG viewport before motion.
    const figure=incoming.current?.querySelector('.tw-film-figure svg');
    const field=root.current?.querySelector('.tw-flight-field');
    const oldFigure=outgoing.current?.querySelector('.tw-film-figure svg');
    const oldMatrix=oldFigure?.getScreenCTM(),newInverse=figure?.getScreenCTM()?.inverse();
    if(field&&figure){const box=figure.getBoundingClientRect(),base=root.current.getBoundingClientRect();Object.assign(field.style,{left:(box.left-base.left)+'px',top:(box.top-base.top)+'px',width:box.width+'px',height:box.height+'px',maxHeight:'none',aspectRatio:'auto'});}
    play(incoming.current,[{opacity:0,transform:motion==='calm'?'none':enter},{opacity:1,transform:'none'}],{duration,easing:ease,fill:'both'});
    play(outgoing.current,[{opacity:.85,transform:'none'},{opacity:0,transform:motion==='calm'?'none':leave}],{duration:duration*.7,easing:ease,fill:'both'});
    if(motion==='rich'){
      const flights=flightPoints(cut.from,cut.to);
      root.current?.querySelectorAll('.tw-flight-pixel').forEach((el,i)=>{
        const p={...flights[i]};
        if(oldMatrix&&newInverse){const point=new DOMPoint(p.start.x,p.start.y).matrixTransform(oldMatrix).matrixTransform(newInverse);p.start={x:point.x,y:point.y};p.mid={x:(p.start.x+p.end.x)/2+(p.end.y-p.start.y)*.12,y:(p.start.y+p.end.y)/2-(p.end.x-p.start.x)*.1};}
        play(el,[{opacity:0,transform:`translate(${p.start.x}px,${p.start.y}px) scale(.6)`},{opacity:.9,offset:.22},{opacity:.85,offset:.55,transform:`translate(${p.mid.x}px,${p.mid.y}px) scale(1.2)`},{opacity:0,transform:`translate(${p.end.x}px,${p.end.y}px) scale(.6)`}],{duration:duration*.85,delay:p.delay,easing:ease,fill:'both'});
      });
      const flightsMain=flightPoints(cut.from,cut.to,1)[0];
      play(root.current?.querySelector('.tw-flight-carrier'),[{opacity:0,transform:`translate(${flightsMain.start.x}px,${flightsMain.start.y}px)`},{opacity:1,offset:.18},{opacity:1,offset:.8},{opacity:0,transform:`translate(${flightsMain.end.x}px,${flightsMain.end.y}px)`}],{duration,easing:ease,fill:'both'});
    }
    const token=cut.serial;
    const timer=setTimeout(()=>{animations.forEach(a=>a.cancel());setCut(old=>old?.serial===token?null:old);},duration+140);
    const cancel=()=>{clearTimeout(timer);animations.forEach(a=>a.cancel());};
    active.current=cancel;
    return()=>{cancel();if(active.current===cancel)active.current=null;};
  },[cut,allowed,motion]);
  return h('div',{ref:root,className:'tw-continuity-stage','data-cut':cut?.kind||'hold'},
    cut?h('div',{ref:el=>{outgoing.current=el;if(el)el.inert=true;},className:'tw-shot-out','aria-hidden':true,key:'out:'+cut.serial},cut.content):null,
    h('div',{ref:incoming,className:'tw-shot-in'},children),
    cut&&allowed&&motion==='rich'?h('svg',{className:'tw-flight-field',viewBox:'0 0 640 300','aria-hidden':true,key:'flight:'+cut.serial},Array.from({length:48},(_,i)=>h('g',{key:i,className:'tw-flight-pixel'},i%3===0?h('text',{x:0,y:4},['·','+','▤','/'][i%4]):h('rect',{x:-1.5,y:-1.5,width:3,height:3}))),h('g',{className:'tw-flight-carrier'},h('rect',{x:-4,y:-4,width:8,height:8}),h('rect',{x:-9,y:-9,width:18,height:18,className:'tw-carrier-halo'}))):null);
}
module.exports={TransitionStage,useMotionAllowed};

},
"./figure.cjs": function(module,exports,require){
'use strict';
const {createElement:h}=require('react');
const {pointsFor}=require('./choreography.cjs');
const text=(s,n=28)=>String(s||'').replace(/\s+/g,' ').slice(0,n);
function fitText(value,width,size=12){let used=0,result='';for(const ch of [...text(value,500)]){const next=/[\u0000-\u00ff]/.test(ch)?size*.61:size;if(used+next>width-size)return result+'…';used+=next;result+=ch;}return result;}
const forms={idle:'BOOT',analysis:'CORPUS',plan:'PIPELINE',compare:'BRANCH',search:'RETRIEVE',code:'SOURCE',math:'DERIVE',execute:'EXECUTE',check:'REGISTER',revise:'REVISE',summary:'COMPOSE'};
const glyphs={
 G:['01111','10000','10000','10111','10001','10001','01111'],
 A:['01110','10001','10001','11111','10001','10001','10001'],B:['11110','10001','10001','11110','10001','10001','11110'],C:['01111','10000','10000','10000','10000','10000','01111'],D:['11110','10001','10001','10001','10001','10001','11110'],E:['11111','10000','10000','11110','10000','10000','11111'],I:['111','010','010','010','010','010','111'],L:['10000','10000','10000','10000','10000','10000','11111'],M:['10001','11011','10101','10101','10001','10001','10001'],O:['01110','10001','10001','10001','10001','10001','01110'],P:['11110','10001','10001','11110','10000','10000','10000'],R:['11110','10001','10001','11110','10100','10010','10001'],S:['01111','10000','10000','01110','00001','00001','11110'],T:['11111','00100','00100','00100','00100','00100','00100'],U:['10001','10001','10001','10001','10001','10001','01110'],V:['10001','10001','10001','10001','10001','01010','00100'],X:['10001','10001','01010','00100','01010','10001','10001']
};
function PixelWord({word,x=24,y=40,cell=4}){
  let offset=0;const bits=[];
  for(const [index,letter] of [...word].entries()){
    const rows=glyphs[letter]||glyphs.I;
    rows.forEach((row,r)=>[...row].forEach((value,c)=>{if(value==='1')bits.push(h('rect',{key:`${index}:${r}:${c}`,x:x+(offset+c)*cell,y:y+r*cell,width:cell-1,height:cell-1}));}));
    offset+=rows[0].length+1;
  }
  return h('g',{className:'tw-pixel-word'},bits);
}
function Figure({model,onSelect}){
  const id=model.id,items=model.items.slice(-6),points=pointsFor(id),total=model.nodes.length;
  const select=(nodeId)=>()=>{if(nodeId)onSelect(nodeId);};
  const node=(key,x,y,label,source,wide=145)=>h('g',{key,className:'tw-figure-node','data-figure-source':source,role:'button',tabIndex:0,'aria-label':'查看原文：'+label,onClick:select(source),onKeyDown:e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(source)();}}},h('title',null,label),h('rect',{x,y,width:wide,height:45,rx:0}),h('rect',{x:x-3,y:y-3,width:6,height:6,className:'tw-figure-dot'}),h('text',{x:x+12,y:y+19,className:'tw-svg-label'},fitText(label,wide-24)),h('text',{x:x+12,y:y+34,className:'tw-svg-meta'},source?fitText(source,wide-24,9):'等待原文'));
  const line=(key,d)=>h('path',{key,d,className:'tw-diagram-path',pathLength:1});
  let content;
  if(id==='idle'||id==='analysis'){
    const words=(items.map(n=>n.text).join(' ').match(/[A-Za-z_][\w.-]{2,18}|[\u4e00-\u9fff]{2,7}/g)||[]).slice(-22);
    content=h('g',null,line('stream','M 30 205 C 140 195 165 92 268 118 S 439 203 600 102'),
      h(PixelWord,{word:id==='idle'?'IDLE':'CORPUS',x:28,y:41,cell:5}),
      words.map((word,i)=>h('text',{key:i,x:40+(i%5)*119+(i%2)*10,y:115+Math.floor(i/5)*28,className:'tw-river-glyph',style:{'--delay':(i%8)*-.7+'s'}},word)),
      !words.length?h('text',{x:30,y:156,className:'tw-svg-label'},'等待公开文本落入画布。'):null,
      h('rect',{x:588,y:94,width:9,height:9,className:'tw-focus-cell'}));
  }else if(id==='plan'){
    const rows=model.steps.slice(-4),spacing=590/Math.max(1,rows.length);
    content=h('g',null,h(PixelWord,{word:'PIPE',x:27,y:36,cell:4}),
      rows.map((item,i)=>h('g',{key:item.key},i?line('line',`M ${85+(i-1)*spacing} ${115+(i-1)*32} H ${85+i*spacing} V ${115+i*32}`):null,
        node(item.key,25+i*spacing,92+i*32,item.text,item.nodeId,spacing-14),
        h('text',{x:25+i*spacing,y:158+i*32,className:'tw-svg-meta'},'SOURCE '+String(i+1).padStart(2,'0')))),
      h('text',{x:611,y:46,textAnchor:'end',className:'tw-svg-meta'},'步骤顺序 / '+rows.length));
  }else if(id==='compare'){
    const options=model.options.length?model.options.slice(0,4):items.slice(0,2).map((v,i)=>({...v,label:'片段 '+(i+1)}));
    content=h('g',null,h('text',{x:320,y:52,textAnchor:'middle',className:'tw-svg-label'},text(model.input?.source,30)||'并列阅读'),h('rect',{x:315,y:72,width:10,height:10,className:'tw-focus-cell'}),
      options.map((option,i)=>{const x=45+i*(550/Math.max(1,options.length-1)),tx=Math.max(12,Math.min(468,x-65));return h('g',{key:option.key},line('branch',`M 320 82 C 320 130 ${x} 100 ${x} 176`),node(option.key,tx,174,option.label,option.nodeId,160),h('text',{x:tx+12,y:239,className:'tw-svg-meta'},fitText(option.text,138,9)));}),
      h('text',{x:320,y:277,textAnchor:'middle',className:'tw-svg-meta'},'ALTERNATIVES / 不添加优劣评分'));
  }else if(id==='search'){
    content=h('g',null,[45,77,110].map(r=>h('circle',{key:r,cx:320,cy:150,r,className:'tw-map-ring'})),h('path',{d:'M 210 150 H 430 M 320 40 V 260',className:'tw-grid-line'}),
      h('g',{className:'tw-orbital-scan'},h('path',{d:'M 320 150 L 320 40 A 110 110 0 0 1 395 70 Z',className:'tw-radar-wedge'})),
      items.slice(0,4).map((item,i)=>{const x=i%2?455:25,y=i<2?57:193;return h('g',{key:item.key},line('thread',`M 320 150 Q ${x+70} 150 ${x+70} ${y+23}`),node(item.key,x,y,text(item.text,16),item.nodeId,158));}),
      h('rect',{x:315,y:145,width:10,height:10,className:'tw-focus-cell'}));
  }else if(id==='execute'){
    const tools=model.tools.slice(-3);
    content=h('g',null,h(PixelWord,{word:'EXECUTE',x:26,y:35,cell:6}),
      h('text',{x:608,y:74,textAnchor:'end',className:'tw-svg-meta'},model.running?'STREAM OPEN':'STREAM IDLE'),
      line('bus','M 40 185 H 600'),
      (tools.length?tools:[{id:null,title:'等待工具事件',status:'stopped'}]).map((tool,i)=>h('g',{key:tool.id||'empty'},node(tool.id||'waiting',42+i*195,147,tool.title,tool.id,165),h('text',{x:54+i*195,y:220,className:'tw-svg-meta'},({running:'● RUNNING',done:'■ RETURNED',error:'× ERROR',stopped:'Ⅱ STOPPED'})[tool.status]))),
      model.running?h('rect',{x:35,y:180,width:9,height:9,className:'tw-bus-dot'}):null);
  }else if(id==='math'){
    content=h('g',null,Array.from({length:12},(_,i)=>h('path',{key:i,d:`M ${28+i*52} 26 V 270`,className:'tw-grid-line'})),Array.from({length:5},(_,i)=>h('path',{key:'r'+i,d:`M 28 ${45+i*48} H 610`,className:'tw-grid-line'})),
      h('text',{x:557,y:113,className:'tw-sigma'},'∑'),h(PixelWord,{word:'DERIVE',x:27,y:37,cell:4}),
      (model.formulas.length?model.formulas:items).slice(0,3).map((item,i)=>h('g',{key:item.key,onClick:select(item.nodeId),className:'tw-formula-line'},h('text',{x:36,y:116+i*53,className:'tw-svg-meta'},'0'+(i+1)),h('text',{x:84,y:116+i*53,className:'tw-svg-equation'},text(item.text,41)))));
  }else if(id==='check'){
    content=h('g',null,h(PixelWord,{word:'REGISTER',x:28,y:30,cell:4}),
      items.slice(0,5).map((item,i)=>h('g',{key:item.key,className:'tw-register-line',onClick:select(item.nodeId),style:{'--order':i}},h('rect',{x:32,y:85+i*35,width:13,height:13,className:'tw-register-box'}),h('text',{x:63,y:96+i*35,className:'tw-svg-label'},text(item.text,37)),h('path',{d:`M 65 ${111+i*35} H 609`,className:'tw-grid-line'}),h('text',{x:593,y:96+i*35,className:'tw-svg-meta'},String(i+1).padStart(2,'0')))));
  }else if(id==='revise'){
    content=h('g',null,h(PixelWord,{word:'REVISE',x:28,y:32,cell:5}),
      h('path',{d:'M 299 153 H 342 M 332 144 L 344 153 L 332 162',className:'tw-revision-arrow'}),
      h('rect',{x:34,y:105,width:247,height:119,className:'tw-revision-before'}),h('rect',{x:363,y:105,width:247,height:119,className:'tw-revision-after'}),
      h('text',{x:49,y:133,className:'tw-svg-meta'},'REASSESS'),h('text',{x:377,y:133,className:'tw-svg-meta'},'REFRAME'),
      h('text',{x:49,y:164,className:'tw-svg-label'},text(model.nodes.find(n=>n.status==='error')?.source||items[0]?.text,18)),
      h('text',{x:377,y:164,className:'tw-svg-label'},text(items.at(-1)?.text,18)),
      h('path',{d:'M 49 190 H 255',className:'tw-redline'}));
  }else if(id==='summary'){
    content=h('g',null,h(PixelWord,{word:'COMPOSE',x:27,y:33,cell:4}),
      [0,1,2].map(i=>h('rect',{key:i,x:202-i*6,y:82-i*6,width:236,height:166,className:'tw-paper-layer'})),
      [0,1,2,3,4].map(i=>h('g',{key:i},h('rect',{x:214,y:103+i*25,width:6,height:6,className:'tw-figure-dot'}),h('path',{d:`M 233 ${106+i*25} H ${i===4?355:405}`,className:'tw-compose-line',style:{'--order':i}}))),
      h('text',{x:487,y:119,className:'tw-svg-meta'},model.running?'DRAFT':'RESPONSE'),h('text',{x:487,y:143,className:'tw-svg-meta'},'SOURCE TEXT'),h('rect',{x:416,y:216,width:9,height:9,className:'tw-focus-cell'}));
  }else{
    const codeLines=model.code.split('\n').filter(s=>s.trim()).slice(0,3);
    content=h('g',null,h(PixelWord,{word:'SOURCE',x:28,y:32,cell:5}),
      codeLines.map((source,i)=>h('g',{key:i},h('rect',{x:35+i*200,y:112,width:167,height:90,className:'tw-source-module'}),h('text',{x:48+i*200,y:137,className:'tw-svg-meta'},'SOURCE '+String(i+1).padStart(2,'0')),h('text',{x:48+i*200,y:170,className:'tw-svg-label'},fitText(source,141)),i<codeLines.length-1?line('l',`M ${202+i*200} 157 H ${231+i*200}`):null)),h('text',{x:38,y:250,className:'tw-svg-meta'},'按原文顺序摘录 / READ ONLY'));
  }
  return h('figure',{className:'tw-film-figure','data-form':id},h('div',{className:'tw-figure-register'},h('span',null,'/ '+(forms[id]||'TRACE').toLowerCase()),h('span',null,'SOURCE EVENTS '+String(total).padStart(2,'0'))),
    h('svg',{viewBox:'0 0 640 300',role:'img','aria-label':model.info.title+'示意图'},h('g',{className:'tw-ambient-points','aria-hidden':true},points.filter((_,i)=>i%2===0).map((p,i)=>h('rect',{key:i,x:p.x,y:p.y,width:2,height:2}))),content),
    h('figcaption',null,h('span',{className:'tw-caption-cell'}),h('span',{className:'tw-caption-text'},text(model.focus?.source,120)||'等待一个新的想法。')));
}
module.exports={Figure,PixelWord};

},
"./adaptive.cjs": function(module,exports,require){
'use strict';
const React=require('react');
const {createElement:h,useEffect,useRef,useState}=React;
const {SCENES,detectScene,routeScene,buildScene}=require('./scenes.cjs');
const {Figure}=require('./figure.cjs');
const {TransitionStage}=require('./transition.cjs');
const short=(text,length=180)=>String(text||'').slice(0,length);
const status={running:'运行中',done:'已返回',error:'失败',stopped:'已停止'};
function useDirector(graph,instant){
  const candidate=detectScene(graph);
  const latest=useRef(candidate);latest.current=candidate;
  const [route,setRoute]=useState(()=>routeScene(null,candidate,Date.now(),true));
  useEffect(()=>{
    if(instant){setRoute(routeScene(null,latest.current,Date.now(),true));return;}
    setRoute(old=>routeScene(old,latest.current,Date.now()));
    const timer=setInterval(()=>setRoute(old=>{
      const next=routeScene(old,latest.current,Date.now());
      return next.id===old.id&&next.turn===old.turn&&next.reason===old.reason&&next.focusId===old.focusId&&next.pending===old.pending?old:next;
    }),180);
    return()=>clearInterval(timer);
  },[instant,candidate.id,candidate.turn,candidate.reason,candidate.focusId]);
  return instant?candidate:route;
}
function SourceTile({item,index=0,onSelect,className='',children}){
  return h('button',{type:'button',className:'tw-scene-tile '+className,onClick:()=>onSelect(item.nodeId||item.id),'data-tw-node':item.nodeId||item.id,style:{'--order':index},title:'查看对应原文'},children||h(React.Fragment,null,h('span',{className:'tw-tile-label'},String(index+1).padStart(2,'0')+' / '+(item.label||'原文片段')),h('p',null,short(item.text||item.source,220))));
}
function Atlas({model,onSelect}){
  return h('div',{className:'tw-atlas'},
    h('div',{className:'tw-orbit-art','aria-hidden':true},h('i'),h('i'),h('i'),h('b',null,'✧')),
    h('div',{className:'tw-atlas-center'},h('small',null,'CURRENT QUESTION'),h('strong',null,short(model.input?.source,100)||'沿着当前片段，继续展开。')),
    h('div',{className:'tw-atlas-grid'},model.items.slice(-4).map((item,i)=>h(SourceTile,{item,index:i,onSelect,key:item.key}))),
    h('p',{className:'tw-scene-footnote'},model.items.length?'同一轮公开文本的分组；点击任意片段查看来源。':'收到公开推理或工具事件后，场景将自动切换。'));
}
function Plan({model,onSelect}){
  return h('div',{className:'tw-plan'},h('div',{className:'tw-scene-command'},'$ decompose → arrange → observe'),model.steps.slice(-6).map((item,i)=>h('div',{key:item.key,className:'tw-plan-step',style:{'--order':i}},h('span',{className:'tw-step-number'},String(i+1).padStart(2,'0')),h(SourceTile,{item,index:i,onSelect},h('small',null,'STEP / 原文顺序'),h('p',null,short(item.text,240))),h('span',{className:'tw-step-connector','aria-hidden':true},'↓'))),h('p',{className:'tw-scene-footnote'},'步骤来自原文分段，不自动判定任务已经完成。'));
}
function Compare({model,onSelect}){
  const named=model.options.length>0;
  const choices=named?model.options:model.items.slice(-4).map((item,i)=>({...item,label:'比较片段 '+(i+1)}));
  return h('div',{className:'tw-compare'},h('div',{className:'tw-branch-root'},h('span',null,'OBSERVE THE ALTERNATIVES'),h('strong',null,short(model.input?.source,80)||'把当前比较的内容，并排放在一起。')),
    h('div',{className:'tw-branch-lines','aria-hidden':true},'┌─────────┴─────────┐'),
    h('div',{className:'tw-branch-grid'},choices.map((item,i)=>h(SourceTile,{item,index:i,onSelect,key:item.key,className:'tw-branch-card'},h('span',{className:'tw-branch-symbol'},String.fromCharCode(65+i)),h('h3',null,item.label),h('p',null,short(item.text,340)),h('small',null,'SOURCE EXCERPT ↗')))),
    h('p',{className:'tw-scene-footnote'},named?'方案标题和描述摘自原文；不添加胜负或置信度。':'未发现明确方案标题，暂按原文片段并列展示。'));
}
function Search({model,onSelect}){
  return h('div',{className:'tw-search'},h('div',{className:'tw-search-upper'},h('div',{className:'tw-radar','aria-hidden':true},h('i',{className:'tw-radar-sweep'}),h('i',{className:'tw-radar-ring'}),h('b',null,'+'),model.items.slice(-4).map((_,i)=>h('span',{key:i,style:{left:[26,69,42,77][i]+'%',top:[32,28,68,61][i]+'%'}}))),h('div',null,h('small',null,'SOURCE SCANNER'),h('h3',null,'沿着线索，展开阅读。'),h('p',null,model.tools.length?`本轮观察到 ${model.tools.length} 次工具调用。`:'当前为检索相关文字，尚无工具返回。'),h('small',null,'雷达为氛围动效，不代表检索覆盖率'))),
    h('div',{className:'tw-search-results'},model.items.slice(-5).map((item,i)=>h(SourceTile,{item,index:i,onSelect,key:item.key,className:'tw-document-tile'},h('span',{className:'tw-document-icon'},'▤'),h('div',null,h('small',null,'FRAGMENT / '+String(i+1).padStart(2,'0')),h('p',null,short(item.text,240)))))),h('p',{className:'tw-scene-footnote'},'只展示已观察到的文本与工具事件。'));
}
function Code({model,onSelect}){
  return h('div',{className:'tw-code-board'},h('div',{className:'tw-code-bar'},h('span',null,'source / current fragment'),h('span',null,model.code.includes('\n')?'MULTILINE':'EXCERPT')),
    h('button',{type:'button',className:'tw-code-source',onClick:()=>model.codeNode&&onSelect(model.codeNode.id),'data-tw-node':model.codeNode?.id},
      h('div',{className:'tw-code-lines'},(model.code||'等待代码或接口相关原文…').split('\n').slice(0,28).map((line,i)=>h('div',{key:i},h('span',{'aria-hidden':true},String(i+1).padStart(2,'0')),h('code',null,line||' '))))),
    h('div',{className:'tw-code-bottom'},h('span',null,'READ ONLY / 原文'),h('span',{className:'tw-code-cursor'},'▮')),h('p',{className:'tw-scene-footnote'},'存在代码围栏时显示代码正文；否则显示接口或实现相关原文。'));
}
function MathBoard({model,onSelect}){
  const equations=model.formulas.length?model.formulas:model.items.slice(-3);
  return h('div',{className:'tw-math-board'},h('span',{className:'tw-math-watermark','aria-hidden':true},'∑'),h('div',{className:'tw-math-title'},'DERIVATION / 原文摘录'),equations.map((item,i)=>h(SourceTile,{item,index:i,onSelect,key:item.key,className:'tw-equation'},h('small',null,'EXPRESSION '+String(i+1).padStart(2,'0')),h('pre',null,short(item.text,400)))),h('p',{className:'tw-scene-footnote'},'公式按原文显示；此画布不执行数值计算或验证推导。'));
}
function Execute({model,onSelect}){
  return h('div',{className:'tw-execute'},h('div',{className:'tw-exec-bus','aria-hidden':true},h('span',null,'REQUEST'),h('i'),h('span',null,'TOOL'),h('i'),h('span',null,'RESULT')),
    model.tools.length?model.tools.map((tool,i)=>h(SourceTile,{item:tool,index:i,onSelect,key:tool.id,className:'tw-exec-card tw-exec-'+tool.status},h('div',{className:'tw-exec-heading'},h('strong',null,tool.title),h('span',null,status[tool.status])),h('div',{className:'tw-exec-meter','aria-hidden':true},Array.from({length:24},(_,j)=>h('i',{key:j,style:{'--cell':j}}))),h('pre',null,short(tool.excerpt||tool.source,260)))):h('p',{className:'tw-scene-placeholder'},'当前这一轮没有工具事件。'),
    h('p',{className:'tw-scene-footnote'},'运行灯只表示工具状态，不表示完成百分比。'));
}
function Check({model,onSelect}){
  return h('div',{className:'tw-check-board'},h('div',{className:'tw-check-heading'},h('span',null,'VERIFICATION REGISTER'),h('b',null,String(model.items.length).padStart(2,'0'))),model.items.map((item,i)=>{
    const marked=/^[-*]?\s*\[[xX]\]/.test(item.text);const reported=/(?:测试通过|验证通过|test[s]? passed|all checks passed)/i.test(item.text);
    return h(SourceTile,{item,index:i,onSelect,key:item.key,className:'tw-check-row'},h('span',{className:'tw-check-box'},marked?'×':'·'),h('div',null,h('p',null,short(item.text,220)),h('small',null,marked?'原文已勾选':reported?'原文报告通过 · 未独立核验':'核验相关片段 · 不推断完成状态')));
  }),h('p',{className:'tw-scene-footnote'},'生成了检查文字，并不等于实际检查已经通过。'));
}
function Revise({model,onSelect}){
  const problems=model.nodes.filter(n=>n.kind==='error'||n.kind==='tool'&&n.status==='error');
  return h('div',{className:'tw-revise'},h('div',{className:'tw-revise-banner'},h('span',null,'↶'),h('div',null,h('small',null,'REASSESS / REFRAME'),h('h3',null,'回到问题，调整方向。'))),h('div',{className:'tw-revise-columns'},
    h('section',null,h('h4',null,'观察到的问题'),problems.length?problems.slice(-3).map((n,i)=>h(SourceTile,{item:n,index:i,key:n.id,onSelect})):h('p',{className:'tw-scene-placeholder'},'当前没有工具错误；此场景来自修正相关文字。')),
    h('section',null,h('h4',null,'调整相关原文'),model.items.slice(-4).map((item,i)=>h(SourceTile,{item,index:i,onSelect,key:item.key})))),h('p',{className:'tw-scene-footnote'},'左右并列帮助阅读，不自动建立错误与修复之间的因果关系。'));
}
function Summary({model,onSelect}){
  const answer=model.answer;
  return h('div',{className:'tw-answer-board'},h('div',{className:'tw-answer-stamp'},model.running?'DRAFT / 生成中':'RESPONSE / 已观察到回答'),answer?h(SourceTile,{item:answer,onSelect,className:'tw-answer-page'},h('span',{className:'tw-answer-corner','aria-hidden':true},'▣'),h('small',null,'OUTPUT / 原始回答'),h('p',null,short(answer.source,1400))):h('p',{className:'tw-scene-placeholder'},'回答尚未出现。'),h('div',{className:'tw-answer-evidence'},model.items.slice(-3).map((item,i)=>h(SourceTile,{item,index:i,onSelect,key:item.key}))),h('p',{className:'tw-scene-footnote'},'下方保留本轮推理片段，点击可回看原文。'));
}
const renderers={idle:Atlas,analysis:Atlas,plan:Plan,compare:Compare,search:Search,code:Code,math:MathBoard,execute:Execute,check:Check,revise:Revise,summary:Summary};
function Adaptive({graph,route,sceneChoice,onSceneChoice,onSelect,selected,animate,motion,instant}){
  const id=sceneChoice==='auto'?route.id:sceneChoice;
  const model=buildScene(graph,id);
  const Renderer=renderers[id]||Atlas;
  const area=useRef(null);
  useEffect(()=>{if(area.current){area.current.scrollTop=0;const detail=area.current.querySelector('.tw-shot-in .tw-film-detail');if(detail)detail.scrollTop=0;}},[id,route.turn]);
  return h('div',{className:'tw-adaptive','data-scene':id},
    h('div',{className:'tw-director-bar'},h('span',{className:'tw-director-light'}),h('span',null,sceneChoice==='auto'?'AUTO SCENE / 文本规则':'PINNED / 固定模板'),h('select',{'aria-label':'场景模板',value:sceneChoice,onChange:e=>onSceneChoice(e.target.value)},h('option',{value:'auto'},'自动跟随内容'),Object.entries(SCENES).filter(([key])=>key!=='idle').map(([key,value])=>h('option',{value:key,key},value.title)))),
    h('header',{className:'tw-scene-heading'},h('span',{className:'tw-scene-symbol','aria-hidden':true},model.info.mark),h('div',null,h('small',null,model.info.en),h('h2',null,model.info.title)),h('span',{className:'tw-scene-reason',title:route.reason},sceneChoice==='auto'?route.reason:'内容持续更新')),
    h('div',{className:'tw-scene-viewport',ref:area,tabIndex:0,'aria-label':'自适应内容画布'},h(TransitionStage,{sceneKey:id+':'+route.turn,scene:id,animate,motion,instant},h('div',{className:'tw-film-shot','data-shot':id},h(Figure,{model,onSelect}),h('div',{className:'tw-film-detail'},h(Renderer,{model,onSelect}))))),
    h('nav',{className:'tw-scene-tape','aria-label':'最近事件原文'},h('span',null,'TRACE'),graph.nodes.slice(-8).map((n,i)=>h('button',{type:'button',key:n.id,onClick:()=>onSelect(n.id),'aria-pressed':selected===n.id,title:n.title,className:n.status==='running'?'tw-tape-live':''},String(graph.nodes.length-Math.min(graph.nodes.length,8)+i+1).padStart(2,'0')))),
    h('div',{className:'tw-scene-screenreader','aria-live':'polite'},model.info.title+'。'+(sceneChoice==='auto'?route.reason:'固定模板')));
}
module.exports={Adaptive,useDirector};

},
"./terminal.cjs": function(module,exports,require){
'use strict';
const React=require('react');
const {createElement:h,useEffect,useRef}=React;
const family=node=>node.kind==='input'?'IN':node.kind==='tool'?'IO':node.kind==='answer'?'OUT':node.kind==='error'?'ERR':'TH';
const brief=text=>Array.from(String(text||'').replace(/\s+/g,' ').trim()).slice(0,48).join('');
function Terminal({graph,selected,onSelect,animate,follow}){
  const scroll=useRef(null);
  useEffect(()=>{if(follow&&scroll.current)scroll.current.scrollTo({top:scroll.current.scrollHeight,behavior:animate?'smooth':'auto'});},[graph.nodes.length,follow,animate]);
  const counts={IN:0,TH:0,IO:0,OUT:0,ERR:0};graph.nodes.forEach(n=>counts[family(n)]++);
  const last=graph.nodes.at(-1);
  const sizes=graph.nodes.map(n=>Array.from(n.source).length);
  const maximum=Math.max(1,...sizes);
  const stream=graph.nodes.slice(-48);
  const recentInput=graph.nodes.findLast(n=>n.kind==='input');
  const recentTool=graph.nodes.findLast(n=>n.kind==='tool');
  return h('div',{className:'tw-terminal'},
    h('div',{className:'tw-term-heading'},h('strong',null,'trace.timeline()'),h('span',null,graph.running?'[ stream open ]':'[ stream idle ]')),
    h('div',{className:'tw-term-main'},
      h('nav',{className:'tw-index','aria-label':'事件分类索引'},h('span',null,'events/'),Object.entries(counts).map(([key,value])=>h('div',{key,className:'tw-index-item '+(last&&family(last)===key?'tw-index-current':'')},h('b',null,key),h('small',null,String(value).padStart(2,'0')))),h('span',{className:'tw-index-total'},graph.nodes.length+'/ '+graph.nodes.length),h('small',null,'loaded')),
      h('div',{className:'tw-term-trace'},
        h('div',{className:'tw-term-command'},h('span',null,'$'),h('strong',null,'observe --public --follow'),h('i',{className:graph.running?'tw-caret tw-pulse-caret':'tw-caret'})),
        h('div',{className:'tw-term-axis'},h('span',null,'event / 原文摘录'),h('span',null,'字数 →')),
        h('div',{className:'tw-term-rows',ref:scroll,tabIndex:0,'aria-label':'终端事件列表'},
          !graph.nodes.length?h('div',{className:'tw-term-idle'},h('div',{className:'tw-pixel-orbit','aria-hidden':true},'▧'),h('strong',null,'等待一条消息，点亮下一行。'),h('p',null,'public reasoning · tool calls · replies')):null,
          graph.nodes.map((node,i)=>{
            const count=sizes[i];const size=12+Math.sqrt(count/maximum)*27;
            return h('button',{type:'button',key:node.id,'data-tw-node':node.id,className:`tw-term-row tw-status-${node.status} ${selected===node.id?'tw-term-selected':''}`,onClick:()=>onSelect(node.id),'aria-pressed':selected===node.id},
              h('span',{className:'tw-row-index'},String(i+1).padStart(2,'0')),
              h('span',{className:'tw-row-copy'},h('strong',null,brief(node.title||node.source)||node.label),h('small',null,`${family(node)} / ${node.kind==='tool'?node.title:node.label}${node.turn!==undefined?' · t'+node.turn:''}`)),
              h('span',{className:'tw-row-leader','aria-hidden':true}),
              h('span',{className:'tw-row-bubble',style:{width:size,height:size},'aria-hidden':true}),h('span',{className:'tw-row-count'},count)
            );
          })
        ),
        h('div',{className:'tw-forward'},h('div',null,h('span',null,'event buffer'),h('span',null,'每格一个事件 · 非模型权重')),h('div',{className:'tw-buffer-cells'},Array.from({length:48},(_,i)=>h('i',{key:i,title:stream[i]?`${family(stream[i])} / ${stream[i].label}`:'empty',className:stream[i]?`tw-cell-${family(stream[i])} ${stream[i].status==='running'?'tw-cell-running':''}`:''}))))
      )
    ),
    h('div',{className:'tw-instruments'},
      h('section',{className:'tw-instrument'},h('h3',null,'stdin · latest'),h('p',null,brief(recentInput?.source)||'等待输入…'),h('small',null,'原始输入摘录')),
      h('section',{className:'tw-instrument'},h('h3',null,'io · execution'),h('p',null,recentTool?.title||'尚无工具调用'),h('small',null,recentTool?({done:'已完成',running:'正在运行',stopped:'已停止',error:'执行失败'}[recentTool.status]):'工具事件驱动')),
      h('section',{className:'tw-instrument tw-signal'},h('h3',null,'signal · chars'),h('svg',{viewBox:'0 0 200 40','aria-label':'最近事件原文字数变化'},h('path',{d:'M0 35H200',className:'tw-signal-axis'}),h('polyline',{points:sizes.slice(-24).map((n,i,a)=>`${i*196/Math.max(1,a.length-1)+2},${35-30*n/maximum}`).join(' '),className:'tw-signal-line'})),h('small',null,'横轴事件 / 纵轴字数'))
    )
  );
}
module.exports={Terminal};

},
"./process-data.cjs": function(module,exports,require){
'use strict';
const {turnNodes,classifyScene}=require('./scenes.cjs');
const LIMIT=240;
const OPS={input:['INPUT','接收问题'],analysis:['READ','阅读与理解'],constraint:['BOUND','约束条件'],plan:['PLAN','拆解步骤'],compare:['BRANCH','并列比较'],search:['LOOKUP','资料线索'],code:['SOURCE','代码片段'],math:['DERIVE','公式原文'],check:['CHECK','核验描述'],revise:['REVISE','调整方向'],request:['CALL','工具请求'],result:['RETURN','工具返回'],answer:['OUTPUT','回答片段'],error:['ERROR','运行错误'],retry:['RETRY','请求重试']};

// Prefix-stable boundaries, including fenced code. Source offsets are retained;
// this is a reading aid over public text, not generated or inferred reasoning.
function slices(source){
 const result=[];let start=0,fence=false;
 const add=end=>{let a=start,b=end;while(a<b&&/\s/u.test(source[a]))a++;while(b>a&&/\s/u.test(source[b-1]))b--;if(b>a)result.push({start:a,end:b,text:source.slice(a,b)});start=end;};
 for(let i=0;i<source.length;i++){
  const heading=i-start<72?source.slice(start,i).trim():'';
  const shortHeading=heading.length<70&&/[:：]$/.test(heading);
  if(source.slice(i,i+3)==='```'){if(!fence&&i>start&&!shortHeading)add(i);fence=!fence;i+=2;if(!fence)add(i+1);continue;}
  if(fence)continue;
  const size=i-start+1,ch=source[i];
  const period=ch==='.'&&(i+1===source.length||/\s/.test(source[i+1]))&&!/\d/.test(source[i-1]||'');
  if(ch==='\n'&&!shortHeading||size>=8&&(/[。！？；;!?]/u.test(ch)||period)||size>=240)add(i+1);
 }
 if(start<source.length)add(source.length);
 return result;
}
function role(text){
 const head=text.replace(/^[\s#*\-]+/,'');
 if(text.includes('```'))return /^```(?:math|latex|tex)\b/m.test(text)?'math':'code';
 if(/^(?:约束|限制|要求|必须|不能|不得|注意|constraint|must|requirement)/i.test(head))return 'constraint';
 if(/^(?:第[一二三四五六七八九十\d]+步|首先|接下来|计划|步骤|step\s*\d|plan\s*:)/i.test(head))return 'plan';
 if(/^(?:检查|核验|验证|check\s*:|verify\s*:)/i.test(head))return 'check';
 if(/^(?:修正|纠正|改为|重新考虑|revise\s*:)/i.test(head))return 'revise';
 if(/^(?:检索|搜索|查阅|资料线索|参考来源|search\s*:)/i.test(head))return 'search';
 if(/^(?:公式|推导|\$|\\\[)/.test(head))return 'math';
 return classifyScene(text).id;
}
// Coarse reading steps for the stage: neighbouring sentences merge until a step
// holds ~160 characters; code fences stay whole. Boundaries depend only on the
// prefix, so a streaming paragraph only ever extends its last step.
const COARSE=160;
function coarseSlices(source){
 const out=[];
 for(const part of slices(source)){
  const last=out.at(-1),fenced=/```/.test(part.text);
  if(last&&!fenced&&!last.fenced&&last.end-last.start<COARSE)Object.assign(last,{end:part.end,text:source.slice(last.start,part.end)});
  else out.push({...part,fenced});
 }
 return out.map(({start,end,text})=>({start,end,text}));
}
function buildProcess(graph,{coarse=false}={}){
 const nodes=turnNodes(graph),entries=[],groups=[];
 for(const node of nodes){
  const reasoning=['reasoning','compare','check','revise'].includes(node.kind);
  const key=reasoning&&/^a:/.test(node.id)?node.id.replace(/:\d+$/,''):node.id;
  let group=groups.at(-1);
  if(!reasoning||!group?.reasoning||group.key!==key){group={key,reasoning,nodes:[],text:''};groups.push(group);}
  group.nodes.push({node,start:group.text.length,end:group.text.length+node.source.length});group.text+=node.source;
 }
 for(const group of groups){
  const node=group.nodes[0].node;
  const emit=(part,kind,suffix)=>{
   const owners=group.nodes.filter(n=>n.end>part.start&&n.start<part.end),first=owners[0]||group.nodes[0];
   const spans=owners.map(n=>({nodeId:n.node.id,start:Math.max(0,part.start-n.start),end:Math.min(n.node.source.length,part.end-n.start)}));
   entries.push({id:suffix?node.id+':'+suffix:first.node.id+'@'+(part.start-first.start),nodeId:first.node.id,spans,kind,op:OPS[kind]?.[0]||'READ',label:OPS[kind]?.[1]||'原文片段',text:part.text,title:node.title,toolId:node.kind==='tool'?node.id:null,
    status:node.kind==='tool'?node.status:part.end<group.text.trimEnd().length?'done':group.nodes.at(-1).node.status,turn:node.turn,step:node.step,seq:node.seq});
  };
  if(node.kind==='tool'){
   const separator=group.text.indexOf('\n\n返回\n');
   const start=separator>=0&&group.text.startsWith('参数\n')?3:0;
   emit({start,end:separator>=0?separator:group.text.length,text:group.text.slice(start,separator>=0?separator:undefined)||'（无文本参数）'},'request','request');
   if(separator>=0)emit({start:separator+5,end:group.text.length,text:group.text.slice(separator+5)},'result','result');
  }else{
   const kind=group.reasoning?null:({input:'input',answer:'answer',error:'error',retry:'retry'})[node.kind]||'analysis';
   const parts=node.kind==='input'?[{start:0,end:group.text.length,text:group.text}]:(coarse&&group.reasoning?coarseSlices:slices)(group.text);
   parts.forEach(part=>emit(part,kind||role(part.text)));
  }
 }
 const excess=Math.max(0,entries.length-LIMIT);
 return {turn:nodes.find(n=>n.kind==='input')?.id||'history',entries:entries.slice(excess),omitted:excess+(graph.omitted||0),input:nodes.find(n=>n.kind==='input')?.source||'',running:graph.running,hasReasoning:groups.some(g=>g.reasoning)};
}
// New pieces append in observed order. A late tool result cannot reshuffle a
// queue the reader has already started. Initial history uses host source order.
function mergeQueue(previous,next){
 if(!previous||previous.turn!==next.turn)return next;
 const fresh=new Map(next.entries.map(e=>[e.id,e]));
 const entries=previous.entries.filter(e=>fresh.has(e.id)).map(e=>fresh.get(e.id));
 const seen=new Set(entries.map(e=>e.id));entries.push(...next.entries.filter(e=>!seen.has(e.id)));
 return {...next,entries:entries.slice(-LIMIT)};
}
function dwellMs(entry,seconds=8){return Math.max(seconds*1000,Math.min(20000,3000+Array.from(entry?.text||'').length*55));}
function formFor(entry){return ({plan:'pipeline',compare:'branches',request:'io',result:'io',code:'code',math:'formula',check:'checklist',revise:'revision',error:'revision',retry:'revision',search:'sources'})[entry?.kind]||'register';}
function boardEntries(entries,index){
 const focus=entries[index],form=formFor(focus);
 if(form==='io')return entries.filter(e=>e.toolId===focus.toolId);
 if(form==='branches'){
  const matching=entries.filter(e=>e.kind==='compare');
  const at=matching.findIndex(e=>e.id===focus.id);return matching.slice(Math.max(0,at-1),Math.max(0,at-1)+4);
 }
 const start=Math.max(0,index-3);return entries.slice(start,start+6);
}
module.exports={OPS,LIMIT,slices,coarseSlices,buildProcess,mergeQueue,dwellMs,formFor,boardEntries};

},
"./process.cjs": function(module,exports,require){
'use strict';
const React=require('react');
const {createElement:h,useState,useEffect,useMemo,useRef,useLayoutEffect}=React;
const {buildProcess,mergeQueue,dwellMs,formFor,boardEntries}=require('./process-data.cjs');
const {useMotionAllowed}=require('./transition.cjs');
const readPref=()=>{try{return Number(JSON.parse(localStorage.getItem('tw:reading-seconds'))) || 8;}catch{return 8;}};
const short=(text,n=100)=>Array.from(String(text||'').replace(/\s+/g,' ').trim()).slice(0,n).join('');
const titles={register:'source.register / 内容寄存器',pipeline:'plan.sequence / 步骤序列',branches:'options.compare / 并列阅读',io:'tool.exchange / 请求与返回',code:'source.code / 代码原文',formula:'formula.extract / 公式原文',checklist:'verification.log / 核验记录',revision:'revision.log / 修正记录',sources:'source.index / 资料索引'};
// Receiving and reading are separate: new pieces queue up and each one stays
// at least `seconds` (longer for long text). Shared by every reading view.
function useReadingQueue({graph,replaying=false,suspended=false,coarse=false}){
 const derived=useMemo(()=>buildProcess(graph,{coarse}),[graph,coarse]);
 const [queue,setQueue]=useState(derived),[active,setActive]=useState(derived.entries[0]?.id||null);
 const [playing,setPlaying]=useState(!replaying),[seconds,setSeconds]=useState(()=>[5,8,12].includes(readPref())?readPref():8);
 const [tick,setTick]=useState(0);
 const started=useRef(Date.now());
 useEffect(()=>{
  setQueue(old=>mergeQueue(old,derived));
  if(queue.turn!==derived.turn){setActive(derived.entries[0]?.id||null);started.current=Date.now();setPlaying(!replaying);}
  else if(replaying){setActive(derived.entries.at(-1)?.id||null);setPlaying(false);}
 },[derived,replaying]);
 const entries=queue.turn===derived.turn?queue.entries:derived.entries;
 const index=Math.max(0,entries.findIndex(e=>e.id===active)),focus=entries[index],pending=Math.max(0,entries.length-index-1);
 useEffect(()=>{started.current=Date.now();},[focus?.id,suspended]);
 useEffect(()=>{
  if(!playing||replaying||suspended)return;
  const timer=setInterval(()=>setTick(n=>n+1),300);return()=>clearInterval(timer);
 },[playing,replaying,suspended]);
 useEffect(()=>{
  if(playing&&!replaying&&!suspended&&pending&&Date.now()-started.current>=dwellMs(focus,seconds))setActive(entries[index+1].id);
 },[tick,playing,replaying,suspended,pending,seconds,focus?.id]);
 useEffect(()=>{try{localStorage.setItem('tw:reading-seconds',JSON.stringify(seconds));}catch{}},[seconds]);
 const choose=id=>{setActive(id);setPlaying(false);started.current=Date.now();};
 const change=offset=>choose(entries[Math.max(0,Math.min(entries.length-1,index+offset))]?.id);
 return {derived,queue,entries,index,focus,pending,playing,setPlaying,seconds,setSeconds,started,choose,change};
}
function SequenceMap({entries,index,choose,motionAllowed,motion}){
 const marker=useRef(null),previous=useRef(null);
 const start=Math.max(0,index-5),visible=entries.slice(start,start+12);
 const lane=e=>e.kind==='input'?0:e.toolId?2:e.kind==='answer'?3:1;
 const point=(entry,i)=>({x:56+i*498/Math.max(1,visible.length-1),y:19+lane(entry)*22});
 const points=visible.map(point),at=points[index-start];
 useLayoutEffect(()=>{
  const old=previous.current;previous.current=at;
  if(!old||!at||!motionAllowed||!marker.current?.animate)return;
  const animation=marker.current.animate([{transform:`translate(${old.x-at.x}px,${old.y-at.y}px)`},{transform:'none'}],{duration:motion==='calm'?220:1600,easing:'cubic-bezier(.22,.72,.18,1)'});
  return()=>animation.cancel();
 },[at?.x,at?.y,motionAllowed,motion]);
 return h('div',{className:'tw-sequence-map'},h('div',null,h('span',null,'trace.route / 阅读路径'),h('small',null,'连线 = 原文先后顺序')),
  h('svg',{viewBox:'0 0 580 105',role:'group','aria-label':'输入、公开推理、工具、回答的原文顺序图'},
   ['IN','TH','IO','OUT'].map((name,i)=>h('g',{key:name},h('text',{x:0,y:22+i*22},name),h('line',{x1:39,x2:568,y1:19+i*22,y2:19+i*22,className:'tw-route-axis'}))),
   points.slice(1).map((p,i)=>h('path',{key:visible[i+1].id,d:`M ${points[i].x} ${points[i].y} L ${p.x} ${p.y}`,className:'tw-route-line'})),
   visible.map((entry,i)=>h('g',{key:entry.id,role:'button',tabIndex:0,'aria-label':'阅读片段 '+(start+i+1)+'：'+entry.label,onClick:()=>choose(entry.id),onKeyDown:e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(entry.id);}}},h('title',null,entry.op+' / '+short(entry.text,60)),h('rect',{x:points[i].x-8,y:points[i].y-8,width:16,height:16,fill:'transparent'}),h('rect',{x:points[i].x-3,y:points[i].y-3,width:6,height:6,className:'tw-route-node','data-status':entry.status}),h('text',{x:points[i].x,y:points[i].y-8,textAnchor:'middle'},String(start+i+1).padStart(2,'0')))),
   at?h('rect',{ref:marker,x:at.x-5,y:at.y-5,width:10,height:10,className:'tw-route-marker','aria-hidden':true}):null));
}
function Process({graph,onSelect,animate,motion,replaying=false,suspended=false}){
 const {derived,queue,entries,index,focus,pending,playing,setPlaying,seconds,setSeconds,started,choose,change}=useReadingQueue({graph,replaying,suspended});
 const nav=useRef(null),stage=useRef(null),positions=useRef(new Map()),animations=useRef([]),readingForm=useRef(null);
 const motionAllowed=useMotionAllowed(animate);
 // Hold the layout while a streamed sentence grows. Category refinements must
 // not turn one readable step into several rapid scene changes.
 if(readingForm.current?.id!==focus?.id)readingForm.current={id:focus?.id,form:formFor(focus)};
 const form=readingForm.current?.form||'register',board=boardEntries(entries,index);
 useEffect(()=>{
  const row=nav.current?.querySelector('[aria-current=step]');
  if(row){const top=row.offsetTop,bottom=top+row.offsetHeight,box=nav.current;if(top<box.scrollTop)box.scrollTop=top;else if(bottom>box.scrollTop+box.clientHeight)box.scrollTop=bottom-box.clientHeight;}
 },[focus?.id]);
 useEffect(()=>{
  const box=stage.current,row=box?.querySelector('[aria-current=step]');
  if(row){const outer=box.getBoundingClientRect(),inner=row.getBoundingClientRect();if(inner.bottom>outer.bottom)box.scrollTop+=inner.bottom-outer.bottom+8;else if(inner.top<outer.top)box.scrollTop-=outer.top-inner.top+8;}
 },[focus?.id,form]);
 // Retain cell identity through steps. Animate changed positions and the focus
 // marker only; the frame, text and operation rail never dissolve or flicker.
 useLayoutEffect(()=>{
  animations.current.forEach(a=>a.cancel());animations.current=[];
  const next=new Map();
  stage.current?.querySelectorAll('[data-entry-card]').forEach(el=>{
   const rect=el.getBoundingClientRect(),id=el.dataset.entryCard,old=positions.current.get(id);next.set(id,rect);
   if(!motionAllowed||!el.animate)return;
   if(old){const x=old.x-rect.x,y=old.y-rect.y;if(Math.abs(x)+Math.abs(y)>1)animations.current.push(el.animate([{transform:`translate(${x}px,${y}px)`},{transform:'none'}],{duration:motion==='calm'?220:1400,easing:'cubic-bezier(.22,.72,.18,1)'}));}
   else animations.current.push(el.animate([{opacity:.35,transform:'translateY(10px)'},{opacity:1,transform:'none'}],{duration:motion==='calm'?220:1200,easing:'ease-out'}));
  });
  positions.current=next;
  return()=>{animations.current.forEach(a=>a.cancel());animations.current=[];};
 },[focus?.id,form,motionAllowed,motion]);
 const openSource=entry=>onSelect(entry.spans?.length?entry.spans.map(span=>span.nodeId):entry.nodeId);
 const getNum=entry=>String(entries.findIndex(e=>e.id===entry.id)+1).padStart(2,'0');
 const chars=entries.map(e=>Array.from(e.text).length),maximum=Math.max(1,...chars),latestError=entries.findLast(e=>e.status==='error');
 const status=e=>e.kind==='request'?e.status==='running'?'运行中':e.status==='error'?'调用失败':e.status==='done'?'已返回':'已停止':e.kind==='result'?e.status==='error'?'错误返回':'已收到结果':e.status==='running'?'接收中':e.status==='stopped'?'已停止':'已接收';
 const card=entry=>h('button',{type:'button',key:entry.id,className:'tw-register-cell '+(entry.id===focus?.id?'tw-reading-cell':''),'data-entry-card':entry.id,'data-status':entry.status,'aria-current':entry.id===focus?.id?'step':undefined,onClick:()=>choose(entry.id)},
  h('span',{className:'tw-cell-head'},h('b',null,getNum(entry)),h('span',null,entry.op),h('small',null,status(entry))),
  h('p',null,short(entry.text,form==='branches'?190:110)),h('span',{className:'tw-cell-tail'},h('span',null,entry.kind==='request'||entry.kind==='result'?entry.title:entry.label),h('span',null,Array.from(entry.text).length+' 字')));
 const request=entries.find(e=>e.toolId===focus?.toolId&&e.kind==='request');
 const result=entries.find(e=>e.toolId===focus?.toolId&&e.kind==='result');
 const code=focus?.text.match(/```[^\n]*\n([\s\S]*?)(?:```|$)/)?.[1]||focus?.text||'';
 const categories=[['公开推理',entries.filter(e=>!['input','answer','request','result','error','retry'].includes(e.kind)).length],['工具',new Set(entries.filter(e=>e.toolId).map(e=>e.toolId)).size],['回答片段',entries.filter(e=>e.kind==='answer').length]];
 return h('section',{className:'tw-process','data-form':form,'data-reading':playing?'playing':'paused','data-active-entry':focus?.id||'', 'aria-label':'逐条思路仪表'},
  h('div',{className:'tw-process-strip'},h('span',null,'PUBLIC TRACE / ',String(index+(focus?1:0)).padStart(2,'0'),' · ',focus?.op||'STANDBY'),
   h('svg',{viewBox:'0 0 240 22','aria-label':'近期片段字数，每条竖线代表一个原文片段'},chars.slice(-48).map((n,i,a)=>h('line',{key:i,x1:3+i*234/Math.max(1,a.length-1),x2:3+i*234/Math.max(1,a.length-1),y1:11-9*n/maximum,y2:11+9*n/maximum,stroke:'currentColor',strokeWidth:2}))),
   h('span',{className:latestError?'tw-process-error':''},graph.running?'● 接收中':latestError?'● 有错误记录':'■ 接收结束')),
  h('div',{className:'tw-process-deck'},
   h('section',{className:'tw-process-main tw-inset-frame'},
    h('header',{className:'tw-frame-caption'},h('span',null,'/ '+titles[form]),h('small',null,'原文顺序 · 非内部参数')),
    h('div',{className:'tw-process-topic'},h('small',null,'STDIN / 当前问题'),h('p',null,short(queue.input,110)||'等待输入，一起展开新的思路。')),
    h('div',{className:'tw-process-focusline'},h('span',null,focus?.label||'等待公开内容'),h('span',null,'READ ',String(index+(focus?1:0)).padStart(2,'0'),' / ',entries.length)),
    h('div',{ref:stage,className:'tw-process-board'},
     !focus?h('div',{className:'tw-process-idle'},h('b',null,'[ _ ]'),h('p',null,'公开推理、工具请求和返回将在这里逐条展开。')):
     form==='code'||form==='formula'?h('div',{className:'tw-process-code','data-entry-card':focus.id},h('span',null,form==='code'?'READ ONLY / 源码摘录':'EXPRESSION / 原文公式'),h('pre',null,code),h('button',{type:'button',onClick:()=>openSource(focus)},'打开来源 ↗')):
     form==='io'?h('div',{className:'tw-process-io'},h('div',{className:'tw-io-route'},h('span',null,'REQUEST'),h('i',{'aria-hidden':true}),h('b',null,focus.title),h('i',{'aria-hidden':true}),h('span',null,'RETURN')),h('div',{className:'tw-io-panels'},[request,result].map((entry,i)=>h('section',{key:i,'data-entry-card':entry?.id||'waiting'},h('header',null,i?'stdout / 返回原文':'stdin / 调用参数'),entry?h('pre',null,entry.text):h('p',{className:'tw-waiting-result'},'尚未收到返回'),entry?h('button',{type:'button',onClick:()=>openSource(entry)},'打开来源 ↗'):null)))):
     h('div',{className:'tw-process-cells'},board.map(card))),
    entries.length?h(SequenceMap,{entries,index,choose,motionAllowed,motion}):null,
    h('footer',{className:'tw-process-stats'},categories.map(([label,count])=>h('span',{key:label},h('b',null,String(count).padStart(2,'0')),' '+label)),h('small',null,'片段按原文拆分'))),
   h('aside',{className:'tw-ops tw-inset-frame','aria-label':'过程操作索引'},h('div',{className:'tw-frame-caption'},'ops / '+entries.length),h('nav',{ref:nav},entries.map(entry=>h('button',{type:'button',key:entry.id,'aria-current':entry.id===focus?.id?'step':undefined,onClick:()=>choose(entry.id),title:short(entry.text,100)},h('small',null,getNum(entry)),h('b',null,entry.op),h('span',null,entry.label))))),
  ),
  h('section',{className:'tw-process-source tw-inset-frame'},h('div',{className:'tw-frame-caption'},h('span',null,'stdout / 当前原文'),focus?h('button',{type:'button',onClick:()=>openSource(focus)},'完整来源 ↗'):null),h('div',{className:'tw-process-source-text',key:focus?.id,tabIndex:0},h('span',{'aria-hidden':true},'> '),focus?.text||'等待公开文本。')),
  h('div',{className:'tw-reading-controls'},h('button',{type:'button','aria-label':'上一条思路',disabled:index===0,onClick:()=>change(-1)},'←'),h('button',{type:'button',onClick:()=>{started.current=Date.now();setPlaying(!playing);},disabled:replaying},playing?'Ⅱ 暂停阅读':'▷ 继续逐条'),h('button',{type:'button','aria-label':'下一条思路',disabled:!pending,onClick:()=>change(1)},'→'),h('label',null,'停留 ',h('select',{'aria-label':'每步最少停留时间',value:seconds,onChange:e=>{setSeconds(Number(e.target.value));started.current=Date.now();}},[5,8,12].map(v=>h('option',{key:v,value:v},v+' 秒')))),h('span',{className:'tw-queue-status','aria-live':'polite'},pending?'后面还有 '+pending+' 条':'已到末尾'),h('button',{type:'button',disabled:!pending,onClick:()=>choose(entries.at(-1)?.id)},'跳到最新')),
  queue.omitted?h('p',{className:'tw-process-note'},'较早片段已省略；完整内容仍在左侧原生对话。'):null,
  !queue.hasReasoning&&entries.length?h('p',{className:'tw-process-note'},'本轮未提供公开推理；这里仅拆分输入、工具事件与回答。'):null);
}
module.exports={Process,useReadingQueue};

},
"./stage-data.cjs": function(module,exports,require){
'use strict';
// Measurements for the stage. Every number drawn there comes from this file:
// lengths, word segments with source offsets, character-bigram overlap, a fixed
// hash projection and observed arrival samples. None is a model-internal value.
const STOP=new Set(['我','你','他','她','它','我想','想要','接着','应该','关系','希望','帮我','请','做','让','给','一下','怎么','如何','为什么','的','了','是','在','和','与','或','及','把','被','将','对','从','也','都','就','而','并','但','这','那','这个','那个','一个','一些','我们','你们','他们','需要','可以','然后','如果','因为','所以','进行','当前','使用','通过','以及','没有','已经','还是','这样','这里','什么','怎么','时候','现在','部分','内容','问题','the','and','for','with','that','this','from','into','are','was','were','will','can','not','but','you','your','have','has','its','then','than','when','what','which','there','their','also','just','only','each','more','some']);
const segmenter=typeof Intl!=='undefined'&&Intl.Segmenter?new Intl.Segmenter('zh',{granularity:'word'}):null;
const chars=text=>Array.from(String(text||''));
const length=text=>chars(text).length;
const short=(text,n=40)=>{const list=chars(String(text||'').replace(/\s+/g,' ').trim());return list.length>n?list.slice(0,n-1).join('')+'…':list.join('');};
const isCJK=ch=>/[㐀-鿿豈-﫿]/u.test(ch);
const fmt=n=>Math.round(n).toLocaleString('en-US');

// Word chips with their offset in the entry text. Punctuation joins the
// previous chip so a sentence reads as words, not as separate symbols.
function words(text){
 const source=String(text||''),out=[];
 const push=(segment,index,word)=>{
  if(!segment.trim())return;
  if(!word&&out.length&&!/^[\[(（「《]/u.test(segment))out.at(-1).text+=segment;
  else out.push({text:segment,index,word});
 };
 if(segmenter)for(const s of segmenter.segment(source))push(s.segment,s.index,!!s.isWordLike);
 else{const re=/[A-Za-z0-9_]+|[㐀-鿿]|\S/gu;let m;while((m=re.exec(source)))push(m[0],m.index,/[\w㐀-鿿]/u.test(m[0]));}
 return out;
}
function keywords(texts,limit=12){
 const count=new Map();
 for(const text of texts)for(const w of words(text)){
  if(!w.word)continue;
  const key=w.text.replace(/[\p{P}\p{S}\s]+/gu,'').toLowerCase();
  const size=length(key);
  if(STOP.has(key)||/^\d+$/.test(key)||(isCJK(key[0])?size<2:size<3)||size>14)continue;
  count.set(key,(count.get(key)||0)+1);
 }
 return [...count].map(([word,n])=>({word,count:n})).sort((a,b)=>b.count-a.count||length(b.word)-length(a.word)).slice(0,limit);
}
function bigrams(text){
 const list=chars(String(text||'').toLowerCase().replace(/\s+/g,''));
 const set=new Set();
 if(list.length<2){if(list[0])set.add(list[0]);return set;}
 for(let i=0;i<list.length-1;i++)set.add(list[i]+list[i+1]);
 return set;
}
function jaccard(a,b){
 if(!a.size&&!b.size)return 0;
 let shared=0;for(const x of a)if(b.has(x))shared++;
 return shared/(a.size+b.size-shared);
}
function hash(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function random(seed){let a=seed>>>0;return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
// Bigram counts hashed into 48 buckets, then a fixed seeded projection to
// x/y/z in [0,1]. Similar wording lands nearby; it is not a semantic embedding.
function project(texts){
 const rng=random(7),axes=[0,1,2].map(()=>Array.from({length:48},()=>rng()*2-1));
 const raw=texts.map(text=>{
  const v=new Float64Array(48);for(const g of bigrams(text))v[hash(g)%48]+=1;
  const norm=Math.hypot(...v)||1;
  return axes.map(axis=>axis.reduce((sum,a,i)=>sum+a*v[i]/norm,0));
 });
 return raw.map(p=>p.map((value,d)=>{
  const list=raw.map(q=>q[d]),min=Math.min(...list),max=Math.max(...list);
  return max-min<1e-9?.5:(value-min)/(max-min);
 }));
}
function overlap(texts){
 const sets=texts.map(bigrams);
 return sets.map((a,i)=>sets.slice(0,i+1).map((b,j)=>i===j?1:jaccard(a,b)));
}
const PHASES={input:['00','STDIN'],request:['02','TOOL'],result:['02','TOOL'],answer:['03','OUTPUT'],error:['!!','ERROR'],retry:['!!','RETRY']};
const phaseOf=kind=>PHASES[kind]||['01','THINK'];

// Figure choice is a pure function of the queue position (and of which run
// records exist), so a streaming sentence keeps its drawing. Kinds with several
// drawings alternate along a run of the same kind; plain reasoning rotates
// through scenes that carry information. Data scenes need their data:
// avail = {timeline, tokens, todos, files}.
const BY_KIND={input:['glyph'],plan:['agentloop','todos','heatmap','grid'],constraint:['agentloop','constellation','tokenizer'],compare:['nexttoken','compare','constellation'],search:['radar','tokenizer','nexttoken'],code:['code'],math:['formula','spiral'],check:['todos','boot','radar','agentloop'],revise:['diff','redline'],error:['errorbig','timeline'],retry:['errorbig','diff'],request:['timeline','exec','agentloop'],result:['exec','timeline'],answer:['compose']};
const ROTATION=['tokenizer','timeline','radar','nexttoken','tokens','heatmap','agentloop','constellation','spiral','grid'];
const NEEDS={grid:2,nexttoken:3,radar:2,heatmap:3,constellation:3};
const DATA=['timeline','tokens','todos','files'];
function baseFigure(entries,index,avail={}){
 const entry=entries[index];
 if(!entry)return 'idle';
 if(entry.kind==='answer'&&/^\s*\|.*\|\s*$/m.test(entry.text))return 'table';
 const fits=id=>index+1>=(NEEDS[id]||0)&&(!DATA.includes(id)||!!avail[id]);
 // A tool that wrote todos or files shows what it wrote.
 if(entry.kind==='request'||entry.kind==='result'){
  if(/todo/i.test(entry.title)&&avail.todos)return 'todos';
  if(/write|edit|replace|create|patch|present|save/i.test(entry.title)&&avail.files)return 'files';
 }
 const options=BY_KIND[entry.kind];
 if(options){
  let run=0;for(let i=index-1;i>=0&&entries[i].kind===entry.kind;i--)run++;
  const usable=options.filter(fits);
  return usable.length?usable[run%usable.length]:options.find(id=>!DATA.includes(id))||'tokenizer';
 }
 for(let i=0;i<ROTATION.length;i++){const id=ROTATION[(index+i)%ROTATION.length];if(fits(id))return id;}
 return 'tokenizer';
}
function chooseFigure(entries,index,avail={}){
 const id=baseFigure(entries,index,avail),kind=entries[index]?.kind;
 if(index<1||['request','result','input','answer','code'].includes(kind))return id;
 const previous=chooseFigure(entries,index-1,avail);
 if(previous!==id)return id;
 // Same drawing as the step before: a kind with alternatives takes another one.
 const fits=f=>index+1>=(NEEDS[f]||0)&&(!DATA.includes(f)||avail[f]);
 const other=(BY_KIND[kind]||[]).find(f=>f!==id&&fits(f));
 if(other)return other;
 if(BY_KIND[kind])return id;
 {
  const at=ROTATION.indexOf(id);
  for(let i=1;i<ROTATION.length;i++){const next=ROTATION[(at+i)%ROTATION.length];if(index+1>=(NEEDS[next]||0)&&(!DATA.includes(next)||avail[next]))return next;}
 }
 return id;
}
function tableOf(text){
 return String(text||'').split('\n').filter(l=>/^\s*\|.*\|\s*$/.test(l)&&!/^[\s|:\-]+$/.test(l))
  .map(l=>l.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim()));
}
module.exports={words,keywords,bigrams,jaccard,hash,random,project,overlap,phaseOf,chooseFigure,tableOf,length,short,isCJK,fmt,chars};

},
"./stage-pages.cjs": function(module,exports,require){
'use strict';
// Whole-stage pages share the reading cursor, but have their own playback clock.
// A page is admitted only when its builder has the public data it needs.
const D=require('./stage-data.cjs');
const PAGE_SECONDS=3;
const PAGE_NAMES={glyph:'输入速写',tokenizer:'文本拆解',bars:'字数节奏',radar:'关键词雷达',grid:'步骤方格',mask:'片段关系',agentloop:'执行循环',constellation:'词语星图',heatmap:'词频热图',curve:'内容到达曲线',timeline:'运行时间线',tokens:'上下文用量',todos:'待办进度',files:'文件成果',actor:'角色舞台',outline:'思路提纲',code:'代码窗口',formula:'公式摘录',compare:'方案对照',diff:'修改对照',errorbig:'错误记录',exec:'工具往返',compose:'回答拼接',table:'回答表格'};
function stagePages(entries,index,{avail={},actor=true,outline=false}={}){
 const focus=entries[index];
 if(!focus)return actor?['actor']:['idle'];
 const upto=entries.slice(0,index+1),texts=upto.filter(e=>e.kind!=='input'||entries.length<2);
 const keywords=D.keywords(texts.map(e=>e.text),16).length;
 const ids=[focus.kind==='input'?'glyph':'tokenizer','bars'];
 const specialized={code:'code',math:'formula',compare:'compare',revise:'diff',error:'errorbig',retry:'errorbig',request:'exec',result:'exec',answer:D.tableOf(focus.text).length?'table':'compose'}[focus.kind];
 if(specialized)ids.unshift(specialized);
 if(keywords)ids.push('radar');
 if(upto.length>=2)ids.push('grid','mask');
 if(texts.length)ids.push('agentloop');
 if(keywords>=3)ids.push('constellation');
 if(texts.length>=2&&keywords>=2)ids.push('heatmap');
 if(upto.length>=2)ids.push('curve');
 for(const id of ['timeline','tokens','todos','files'])if(avail[id])ids.push(id);
 if(outline)ids.push('outline');
 if(actor)ids.push('actor');
 return [...new Set(ids)];
}
function nextPage(pages,current,offset=1){
 if(!pages.length)return null;
 const at=Math.max(0,pages.indexOf(current));
 return pages[((at+offset)%pages.length+pages.length)%pages.length];
}
// Finish the entrance within the first half of a 3 s page. Long staggered
// drawings otherwise finish appearing just as the next page starts.
function pacePage(spec){
 const max=Math.max(1,...(spec.marks||[]).map(m=>m.delay||0));
 return {...spec,marks:(spec.marks||[]).map(m=>({...m,delay:(m.delay||0)*Math.min(1,400/max)})),texts:(spec.texts||[]).map(t=>({...t,delay:Math.min(250,t.delay||0)}))};
}
module.exports={PAGE_SECONDS,PAGE_NAMES,stagePages,nextPage,pacePage};

},
"./stage-figures.cjs": function(module,exports,require){
'use strict';
// Figure builders: (context) -> target marks, texts and live decorations.
// Pure functions of the reading queue, so they are testable without a canvas.
// A mark is a cell of the drawing; `from` is where it is born (usually the
// figure's baseline, which makes drawings grow upward) and `delay` orders the
// build. Stable ids let a streaming update move only what changed. Sizes scale
// with the canvas (A.s) so a drawing fills the frame at any window size.
const D=require('./stage-data.cjs');
const TITLES={idle:'boot / standby',glyph:'stdin / query',bars:'think / length',curve:'stream / chars',cloud:'trace / point-set',mask:'trace / overlap',grid:'plan / sequence',compare:'options / compare',boot:'verify.log',exec:'tool.exchange',redline:'revision.log',code:'source.code',formula:'formula.extract',compose:'output / compose',table:'output / table',tokenizer:'tokenizer',agentloop:'agent / loop',diff:'revision.diff',spiral:'sampling / spiral',nexttoken:'next_token',errorbig:'stderr',timeline:'timeline',todos:'todos',tokens:'context / tokens',files:'files',outline:'thought / outline',radar:'keyword radar',heatmap:'word × step',constellation:'word constellation'};
const CAPTIONS={
 idle:'等待公开推理、工具事件或回答',
 glyph:'大字 = 输入中的关键词 · 下方为本轮高频词与出现次数',
 bars:'柱高 = 每个片段（或词）的字符数',
 curve:'上 = 累计字符 · 下 = 每步增量 · 横轴为观察到的到达顺序',
 cloud:'点群 = 片段 · 位置 = 字符二元组哈希投影，不是语义向量',
 mask:'格 = 两个片段的字符二元组重叠度 · 右上为尚未出现的片段',
 grid:'行 = 相邻片段 · 格中为该段文字的首字',
 compare:'塔 = 片段的逐字堆叠 · sim = 字符二元组 Jaccard，不表示优劣',
 boot:'日志行 = 已收到的原文片段 · CHK 不代表核验已通过',
 exec:'格 = 工具返回原文的逐字 · RET 只表示调用已返回',
 redline:'删除线表示后文调整了方向，不判定对错',
 code:'右侧条 = 每行长度',
 formula:'柱高 = 符号在原文中的出现次数',
 compose:'块 = 回答原文中的字符 · 末行为当前片段',
 table:'表格逐格摘自回答原文',
 outline:'思路提纲：推理结束后由模型根据公开推理归纳（额外 1 次调用）· 只整理原文，不代表结论正确'
};
const chunk=(text,size)=>{const list=D.chars(String(text||'').replace(/\s+/g,' ').trim()),out=[];for(let i=0;i<list.length;i+=size)out.push(list.slice(i,i+size).join(''));return out;};
const cjkRatio=text=>{const list=D.chars(text).filter(ch=>ch.trim());return list.length?list.filter(D.isCJK).length/list.length:0;};
const firstVisible=text=>D.chars(text).find(ch=>/[\p{L}\p{N}]/u.test(ch))||D.chars(text).find(ch=>ch.trim())||'·';
const units=ch=>D.isCJK(ch)||/[＀-￯　-〿]/u.test(ch)?2:1;
const span=text=>D.chars(text).reduce((s,ch)=>s+units(ch),0);
const charLevel=ch=>D.isCJK(ch)?.88:/[\p{L}\p{N}]/u.test(ch)?.62:.3;
// Monospace text: one unit is ~0.6 of the font size; CJK takes two units.
const fit=(text,size,widthPx)=>{const cols=Math.max(4,Math.floor(widthPx/(size*.6)));let used=0,out='';for(const ch of D.chars(String(text||'').replace(/\s+/g,' ').trim())){used+=units(ch);if(used>cols)return out.slice(0,-1)+'…';out+=ch;}return out;};
function wrap(text,cols,maxLines=99){
 const lines=[];
 for(const raw of String(text||'').split('\n')){
  let line='',used=0;
  for(const ch of raw){const u=units(ch);if(used+u>cols){lines.push(line);line='';used=0;}line+=ch;used+=u;}
  if(line.trim())lines.push(line);
 }
 return lines.slice(0,maxLines);
}
function area(box){
 const s=Math.max(.75,Math.min(1.7,Math.min(box.w/720,box.h/470))),pad=Math.round((box.w<420?10:18)*Math.min(s,1.3)),top=Math.round(Math.max(52,Math.min(130,box.h*.2)));
 return {s,pad,x:pad,y:top,w:Math.max(40,box.w-pad*2),h:Math.max(40,box.h-top-30*s),bottom:Math.round(box.h-30*s),right:box.w-pad};
}
const px=(A,n)=>Math.round(n*A.s);
function head(c,text,count,sub){
 const A=area(c.box),big=Math.max(17,px(A,27)),small=Math.max(10,px(A,12));
 const list=[{key:'head',text,count,x:A.pad,y:A.pad+big,size:big,color:'accent',weight:700}];
 if(sub!=null)list.push({key:'sub',text:fit(sub,small,A.w),x:A.pad,y:A.pad+big+small+8,size:small,color:'ink',level:.8});
 return list;
}
const tag=e=>e.status==='running'?'[ .. ]':e.status==='error'?'[ERR!]':'[ '+(({input:'IN  ',check:'CHK ',request:'CALL',result:'RET ',answer:'OUT ',revise:'REV ',error:'ERR!',retry:'RTRY',plan:'PLAN',compare:'CMP ',code:'SRC ',math:'EXPR',search:'SEEK'})[e.kind]||'READ')+']';

function bars(c){
 const A=area(c.box),upto=c.entries.slice(0,c.index+1),bySegment=upto.length>=6;
 let items=bySegment?upto.slice(-72).map(e=>({id:e.id,value:D.length(e.text),focus:e===c.focus}))
  :upto.flatMap(e=>D.words(e.text).filter(w=>w.word).map(w=>({id:e.id+'#'+w.index,value:D.length(w.text),focus:e===c.focus}))).slice(-72);
 if(!items.length)items=[{id:'empty',value:1,focus:true}];
 const n=items.length,max=Math.max(1,...items.map(i=>i.value)),cell=px(A,6);
 const bw=Math.max(4,Math.min(px(A,30),Math.floor(A.w*.88/n))),rows=Math.max(3,Math.min(Math.floor(A.h*.92/cell),Math.floor(2400/n)));
 const x0=A.x+(A.w-n*bw)/2,marks=[];
 items.forEach((item,i)=>{
  const k=Math.max(1,Math.round(item.value/max*rows)),x=x0+i*bw+1;
  for(let r=0;r<k;r++)marks.push({id:item.id+':'+r,x,y:A.bottom-(r+1)*cell+1,w:bw-2,h:cell-2,color:item.focus?'accent':'ink',level:.3+.7*item.value/max,delay:i*14+r*9,from:{x,y:A.bottom}});
 });
 const total=items.reduce((s,i)=>s+i.value,0);
 return {marks,baseline:A.bottom,texts:[...head(c,'{n} chars',{to:total},`${bySegment?'segments':'words'} = ${n} · max = ${max}`),{key:'axis',text:bySegment?'segment →':'word →',x:A.x,y:A.bottom+px(A,14),size:px(A,10),color:'muted'}]};
}

function curve(c){
 const A=area(c.box),plotH=A.h*.56,lowTop=A.y+A.h*.68,lowH=A.bottom-lowTop,s=c.samples||[];
 let points,steps;const observed=s.length>=4;
 if(observed){
  const t0=s[0].t,range=Math.max(1,s.at(-1).t-t0),max=Math.max(1,s.at(-1).chars);
  points=s.map(p=>({u:(p.t-t0)/range,v:p.chars/max}));steps=s.slice(1).map((p,i)=>Math.max(0,p.chars-s[i].chars));
 }else{
  const upto=c.entries.slice(0,c.index+1),total=Math.max(1,upto.reduce((a,e)=>a+D.length(e.text),0));let acc=0;
  points=[{u:0,v:0},...upto.map((e,i)=>({u:(i+1)/upto.length,v:(acc+=D.length(e.text))/total}))];steps=upto.map(e=>D.length(e.text));
 }
 const N=Math.max(24,Math.min(220,Math.floor(A.w/px(A,5)))),dot=Math.max(2,px(A,3)),marks=[];
 const at=u=>{let j=1;while(j<points.length-1&&points[j].u<u)j++;const a=points[j-1],b=points[j]||a,k=b.u-a.u>1e-9?(u-a.u)/(b.u-a.u):1;return a.v+(b.v-a.v)*Math.max(0,Math.min(1,k));};
 let hx=A.x,hy=A.y+plotH;
 for(let k=0;k<=N;k++){
  const x=A.x+k/N*A.w,y=A.y+plotH-at(k/N)*plotH,last=k===N;
  if(last){hx=x;hy=y;}
  marks.push({id:'c'+k,shape:'dot',x:x-dot/2,y:y-dot/2,w:last?dot*2:dot,h:last?dot*2:dot,color:last?'accent':'ink',level:last?1:.82,blink:last,delay:k*8,from:{x:x-dot/2,y:A.y+plotH}});
 }
 const shown=steps.slice(-60),M=Math.max(1,shown.length),bw=Math.max(3,Math.floor(A.w/M)),peak=Math.max(1,...shown),cell=px(A,5);
 shown.forEach((v,i)=>{const cells=Math.max(1,Math.round(v/peak*Math.floor(lowH/cell)));for(let r=0;r<cells;r++)marks.push({id:'d'+(steps.length-shown.length+i)+':'+r,x:A.x+i*bw,y:A.bottom-(r+1)*cell,w:Math.max(2,bw-2),h:cell-2,color:'accent',level:.55,delay:N*5+i*12+r*7,from:{x:A.x+i*bw,y:A.bottom}});});
 const total=observed?s.at(-1).chars:c.entries.slice(0,c.index+1).reduce((a,e)=>a+D.length(e.text),0);
 const seconds=observed?(s.at(-1).t-s[0].t)/1000:0,rate=seconds>0?Math.round(total/seconds):0,small=px(A,11);
 return {marks,baseline:A.y+plotH,texts:[...head(c,'{n} chars',{to:total},observed?`rate ≈ ${rate} chars/s · ${s.length} samples`:`by segment · ${steps.length} steps`),
  {key:'tip',text:D.fmt(total),x:Math.max(A.x+40,hx-8),y:hy-px(A,10),size:px(A,13),color:'accent',align:'right',delay:N*8},
  {key:'ylab',text:'Σ chars',x:A.x,y:A.y-6,size:small,color:'muted'},{key:'dlab',text:'Δ / step',x:A.x,y:lowTop-6,size:small,color:'muted'}]};
}

function grid(c){
 const A=area(c.box),start=Math.max(0,c.index-5),list=c.entries.slice(start,start+8),label=px(A,62);
 const longest=Math.max(1,...list.map(e=>D.length(e.text.replace(/\s+/g,' ')))),cols=Math.max(6,Math.min(40,Math.floor((A.w-label)/px(A,22)))),per=Math.max(1,Math.ceil(longest/cols));
 const shownCols=Math.max(4,Math.min(cols,Math.ceil(longest/per))),cw=Math.min(px(A,64),Math.floor((A.w-label)/shownCols)),gap=px(A,6),rh=Math.max(12,Math.min(px(A,34),Math.floor(A.h/Math.max(1,list.length))-gap)),top=A.y+Math.max(0,(A.h-list.length*(rh+gap))/2);
 const marks=[],texts=[];
 list.forEach((e,r)=>{
  const y=top+r*(rh+gap),focus=e===c.focus;
  texts.push({key:'row'+e.id,text:String(start+r+1).padStart(2,'0')+' '+e.op.slice(0,5),x:A.x,y:y+rh*.68,size:px(A,10),color:focus?'accent':'muted',delay:r*40});
  chunk(e.text,per).slice(0,cols).forEach((part,k)=>{const x=A.x+label+k*cw;marks.push({id:e.id+':'+k,shape:'cell',ch:firstVisible(part),x,y,w:cw-2,h:rh,color:focus?'accent':'ink',level:.2+.6*cjkRatio(part)+(focus?.18:0),delay:k*32+r*20,from:{x,y:y+rh},ref:e.id});});
 });
 const used=shownCols;
 return {marks,baseline:A.bottom,caption:`行 = 相邻片段 · 每格 ${per} 字，格中为该格首字`,texts:[...head(c,`${list.length} rows × {n} cells`,{to:marks.length},'pipeline of adjacent segments'),...texts],
  live:[{type:'sweep',x0:A.x+label,x1:A.x+label+used*cw,y0:top-4,y1:top+list.length*(rh+gap),period:3600}]};
}

function cloud(c){
 const A=area(c.box),upto=c.entries.slice(Math.max(0,c.index-39),c.index+1),P=D.project(upto.map(e=>e.text));
 const side=Math.min(A.w*.58,A.h*1.05),cx=A.x+A.w*.34,cy=A.y+A.h/2,budget=Math.floor(3000/Math.max(1,upto.length)),marks=[];
 upto.forEach((e,i)=>{
  const rng=D.random(D.hash(e.id)),size=D.length(e.text),k=Math.max(30,Math.min(240,budget,Math.round(size*4))),[pxv,pyv,pzv]=P[i];
  const ex=cx+(pxv-.5)*side*.85,ey=cy+(pyv-.5)*side*.8,r=side*.08+Math.sqrt(size)*2.6*A.s,focus=e===c.focus,dot=focus?px(A,3):Math.max(2,px(A,2));
  for(let j=0;j<k;j++){const a=rng()*Math.PI*2,d=r*Math.sqrt(-Math.log(1-rng()*.97))*.62;marks.push({id:e.id+':'+j,shape:'dot',x:ex+Math.cos(a)*d,y:ey+Math.sin(a)*d*.9,w:dot,h:dot,z:(pzv-.5)*side*.7+(rng()-.5)*r*2,color:focus?'accent':'ink',level:focus?1:.38+.5*rng(),delay:i*24+j*3,ref:e.id});}
 });
 const tx=A.x+A.w*.7,size=px(A,16),small=px(A,12),excerpt=wrap(c.focus?.text,Math.max(10,Math.floor((A.right-tx)/(small*.6))),4);
 return {marks,baseline:A.bottom,spin:{cx,speed:.24},texts:[...head(c,'trace / point set',null,`${upto.length} segments`),
  {key:'pts',text:'|points| = {n}',count:{to:marks.length},x:tx,y:A.y+size,size,color:'ink'},
  {key:'cl',text:'clustering ... {n}',count:{to:100,kind:'pct'},x:tx,y:A.y+size*2.6,size:small,color:'ink',level:.8},
  {key:'fx',text:'focus = #'+String(c.index+1).padStart(2,'0'),x:tx,y:A.y+size*5,size:small,color:'accent',delay:500},
  ...excerpt.map((line,i)=>({key:'ex'+i,text:line,x:tx,y:A.y+size*5+(i+1)*small*1.6,size:small,color:'ink',level:.75,delay:650+i*120}))]};
}

function mask(c){
 const A=area(c.box),n=Math.min(16,c.index+1),list=c.entries.slice(c.index+1-n,c.index+1),M=D.overlap(list.map(e=>e.text));
 const s=Math.max(8,Math.min(px(A,40),Math.floor(Math.min((A.w-px(A,170))/n,A.h/n)))),x0=A.x+Math.max(0,(A.w-px(A,170)-n*s)/2),y0=A.y+Math.max(0,(A.h-n*s)/2),marks=[];let sum=0,pairs=0;
 for(let i=0;i<n;i++)for(let j=0;j<n;j++){
  const id=list[i].id+'>'+list[j].id,x=x0+j*s,y=y0+i*s;
  if(j<=i){const v=M[i][j];if(i!==j){sum+=v;pairs++;}marks.push({id,x,y,w:s-3,h:s-3,color:i===n-1?'accent':'ink',level:i===j?.95:.1+.85*Math.min(1,v*3),delay:i*46+j*15,from:{x,y:y+s},ref:list[i].id});}
  else marks.push({id,shape:'glyph',ch:'-',x:x+s*.2,y:y+s*.2,w:s*.6,h:s*.6,color:'muted',level:.5,delay:i*46+j*15});
 }
 const tx=x0+n*s+px(A,22),size=px(A,15);
 return {marks,baseline:y0+n*s,texts:[...head(c,'overlap(i, j ≤ i)',null,`${n} × ${n} · diag = 1`),
  {key:'fut',text:'future:',x:tx,y:y0+size,size,color:'ink',delay:n*40},{key:'msk',text:'masked',x:tx,y:y0+size*2.5,size:px(A,19),color:'ink',weight:700,delay:n*40+200},
  {key:'mean',text:'mean = {n}',count:{to:pairs?sum/pairs:0,kind:'fixed2'},x:tx,y:y0+n*s-4,size:px(A,13),color:'accent',delay:n*50}]};
}

function glyph(c){
 // The input word the rest of the turn repeats most; longer words win ties.
 const A=area(c.box),input=c.focus?.text||'',turn=new Map(D.keywords(c.entries.map(e=>e.text),200).map(k=>[k.word,k.count]));
 const own=D.keywords([input],12).map(k=>({...k,score:(turn.get(k.word)||0)*3+D.length(k.word)})).sort((a,b)=>b.score-a.score);
 const word=D.chars(own[0]?.word||D.short(input,4).replace('…','')||'STDIN').slice(0,6).join('');
 const width=D.chars(word).reduce((s,ch)=>s+(D.isCJK(ch)?1:.62),0)||1,size=Math.max(28,Math.floor(Math.min(A.h*.5,A.w*.6/width))),step=Math.max(4,Math.round(size/26));
 const raster=c.box.raster?.(word,size,step),marks=[];
 if(raster){
  const ox=A.x+(A.w-raster.w)/2,oy=A.y+(A.h*.7-raster.h)/2,mx=raster.w/2,my=raster.h/2;
  raster.points.forEach((p,i)=>marks.push({id:'g'+i,x:ox+p.x,y:oy+p.y,w:step-1,h:step-1,color:'accent',level:.95,delay:Math.hypot(p.x-mx,p.y-my)/1.4,from:{x:ox+p.x,y:A.bottom}}));
 }
 const others=D.keywords(c.entries.map(e=>e.text),24).filter(k=>k.word!==word.toLowerCase()),size2=px(A,12),texts=[];
 let x=A.x,row=0;
 for(const [i,k] of others.entries()){
  const label=k.word+' ×'+k.count,w=(span(label)+3)*size2*.6;
  if(x+w>A.right){row++;x=A.x;}
  if(row>1)break;
  texts.push({key:'kw'+k.word,text:label,x,y:A.bottom-px(A,24)+row*size2*1.7,size:size2,color:k.count>1?'ink':'muted',level:k.count>1?.85:.6,delay:700+i*70});
  x+=w;
 }
 return {marks,baseline:A.bottom,texts:[...head(c,'{n} chars',{to:D.length(input)},'stdin = "'+D.short(input,60)+'"'),...texts]};
}

function boot(c){
 const A=area(c.box),size=px(A,13),lh=Math.round(size*1.55),maxRows=Math.max(2,Math.floor((A.h-px(A,34))/lh)),list=c.entries.slice(0,c.index+1).slice(-maxRows);
 const texts=list.map((e,i)=>({key:'l'+e.id,text:tag(e)+' '+fit(e.text,size,A.w-size*5),x:A.x,y:A.y+size+i*lh,size,color:e.status==='error'?'danger':e===c.focus?'accent':'ink',level:e===c.focus?1:.72,delay:i*90}));
 const all=c.entries.slice(0,90),cw=A.w/Math.max(1,all.length),bar=px(A,9),marks=all.map((e,i)=>({id:'f'+e.id,x:A.x+i*cw,y:A.bottom-bar,w:Math.max(2,cw-2),h:bar,color:i===c.index?'accent':e.status==='error'?'danger':'ink',level:i<=c.index?.85:.13,delay:i*9,from:{x:A.x,y:A.bottom-bar}}));
 return {marks,baseline:A.bottom,texts:[...head(c,'verify.log',null,`${c.index+1} / ${c.entries.length} received`),...texts,{key:'fwd',text:'forward',x:A.x,y:A.bottom-bar-6,size:px(A,10),color:'muted'}],
  live:[{type:'cursor',x:A.x,y:A.y+size+list.length*lh-size,w:size*.6,h:size}]};
}

function exec(c){
 const A=area(c.box),tool=c.focus?.toolId,request=c.entries.find(e=>e.toolId===tool&&e.kind==='request'),result=c.entries.find(e=>e.toolId===tool&&e.kind==='result');
 const status=request?.status||c.focus?.status,size=px(A,13),out=String(result?.text||'');
 const texts=[...head(c,'tool.exchange',null,(c.focus?.title||'tool')+' · '+(status==='running'?'running':status==='error'?'error':result?'returned':'requested')),
  {key:'cmd',text:'$ '+fit((c.focus?.title||'tool')+' '+(request?.text||''),size,A.w),x:A.x,y:A.y+size,size,color:'accent'}];
 // Payload: the returned text, one cell per character, rising row by row.
 const gridW=Math.floor(A.w*.56),gridTop=A.y+size*2.4,gridH=Math.max(20,A.bottom-px(A,72)-gridTop),count=Math.max(1,D.length(out.replace(/\s+/g,' ')));
 const gap=Math.max(1,px(A,2)),cell=Math.max(px(A,6),Math.min(px(A,26),Math.floor(Math.sqrt(gridW*gridH*.55/count))-gap)),cols=Math.max(8,Math.floor(gridW/(cell+gap))),gridRows=Math.max(2,Math.floor(gridH/(cell+gap)));
 const payload=D.chars(out.replace(/\s+/g,' ')).slice(0,cols*gridRows),marks=[];
 payload.forEach((ch,i)=>{const r=Math.floor(i/cols),k=i%cols,x=A.x+k*(cell+gap),y=gridTop+r*(cell+gap);if(ch.trim())marks.push({id:'p'+i,x,y,w:cell,h:cell,color:status==='error'?'danger':'ink',level:charLevel(ch),delay:r*45+k*4,from:{x,y:A.bottom}});});
 if(!payload.length)texts.push({key:'wait',text:status==='running'?'awaiting stdout …':'no stdout recorded',x:A.x,y:gridTop+size,size,color:'muted'});
 const tx=A.x+gridW+px(A,22),small=px(A,12),lines=out.split('\n').filter(l=>l.trim()),room=Math.max(1,Math.floor((A.bottom-px(A,70)-gridTop)/(small*1.6)));
 lines.slice(0,room).forEach((line,i)=>texts.push({key:'o'+i,text:fit(line,small,A.right-tx),x:tx,y:gridTop+small+i*small*1.6,size:small,color:status==='error'?'danger':'ink',level:.82,delay:500+i*90}));
 const inLen=D.length(request?.text),outLen=D.length(out),peak=Math.max(inLen,outLen,1),bc=px(A,8),slots=Math.floor((A.w-px(A,150))/(bc+2));
 [['stdin',inLen],['stdout',outLen]].forEach(([name,count],r)=>{
  const y=A.bottom-px(A,34)+r*px(A,18),k=count?Math.max(1,Math.round(count/peak*slots)):0,lx=A.x+px(A,64);
  texts.push({key:'b'+name,text:name,x:A.x,y:y+bc,size:px(A,11),color:'muted'},{key:'n'+name,text:'{n} chars',count:{to:count},x:lx+k*(bc+2)+6,y:y+bc,size:px(A,11),color:'ink',delay:300+k*6});
  for(let i=0;i<k;i++)marks.push({id:name+i,x:lx+i*(bc+2),y,w:bc,h:bc+2,color:r?'accent':'ink',level:.75,delay:200+r*150+i*6,from:{x:lx,y}});
 });
 texts.push({key:'st',text:status==='running'?'[ .. ] waiting for return':status==='error'?'[ERR!] returned an error':result?'[ RET ] call returned':'[ -- ] no return recorded',x:A.x,y:A.bottom-px(A,46),size:small,color:status==='error'?'danger':status==='running'?'accent':'ink',delay:300});
 const live=status==='running'?[{type:'ring',x:A.right-px(A,30),y:A.y+size,r:px(A,12)},{type:'sweep',x0:A.x,x1:A.x+cols*(cell+gap),y0:gridTop,y1:gridTop+gridRows*(cell+gap),period:1800}]:[];
 return {marks,texts,live,baseline:A.bottom};
}

function compare(c){
 const A=area(c.box);let list=c.entries.slice(0,c.index+1).filter(e=>e.kind==='compare').slice(-4);
 if(list.length<2)list=[c.entries[c.index-1],c.focus].filter(Boolean);
 const n=list.length,colW=(A.w-px(A,20))/n,per=6,base=A.bottom-px(A,30),need=Math.max(1,...list.map(e=>Math.ceil(D.length(e.text.replace(/\s+/g,''))/per)));
 const cs=Math.max(4,Math.min(px(A,30),Math.floor(colW*.7/per)-2,Math.floor((base-A.y-px(A,60))/need)-2)),marks=[],texts=[];
 list.forEach((e,i)=>{
  const glyphs=D.chars(e.text.replace(/\s+/g,'')),x0=A.x+i*colW+(colW-per*(cs+2))/2,focus=e===c.focus,letter=String.fromCharCode(65+i);
  glyphs.forEach((ch,idx)=>{const col=idx%per,row=Math.floor(idx/per),x=x0+col*(cs+2),y=base-(row+1)*(cs+2);if(y<A.y)return;marks.push({id:e.id+':'+idx,x,y,w:cs,h:cs,color:focus?'accent':'ink',level:charLevel(ch),delay:i*110+row*26+col*6,from:{x,y:base},ref:e.id});});
  const top=base-Math.ceil(glyphs.length/per)*(cs+2);
  texts.push({key:'L'+e.id,text:letter,x:x0,y:Math.max(A.y+px(A,20),top-px(A,10)),size:px(A,22),color:focus?'accent':'ink',weight:700,delay:i*110+300},{key:'S'+e.id,text:fit(e.text,px(A,10),colW-10),x:x0,y:base+px(A,16),size:px(A,10),color:'muted',delay:i*110});
 });
 if(n>=2){const s=D.jaccard(D.bigrams(list[n-2].text),D.bigrams(list[n-1].text));texts.push({key:'sim',text:`sim(${String.fromCharCode(63+n)}, ${String.fromCharCode(64+n)}) = {n}`,count:{to:s,kind:'fixed2'},x:A.right,y:A.y-px(A,16),size:px(A,18),color:'ink',align:'right',delay:600});}
 return {marks,baseline:base,texts:[...head(c,'options / compare',null,`${n} options · ${list.map(e=>D.length(e.text)).join(' / ')} chars`),...texts]};
}

function redline(c){
 const A=area(c.box),revise=c.focus?.kind==='revise',before=revise?c.entries[c.index-1]:c.focus,size=px(A,16),lh=Math.round(size*1.7),cols=Math.max(12,Math.floor(A.w/(size*.6)));
 const old=wrap(before?.text,cols,revise?4:5),fresh=revise?wrap(c.focus.text,cols,5):['↶ reassess / retry'],marks=[],texts=[];
 old.forEach((line,i)=>{
  const y=A.y+size+i*lh,w=Math.min(A.w,span(line)*size*.6);
  texts.push({key:'o'+i,text:line,x:A.x,y,size,color:revise?'ink':'danger',level:.5,delay:i*90});
  for(let x=0;x<w;x+=6)marks.push({id:'s'+i+':'+x,x:A.x+x,y:y-size*.38,w:6,h:Math.max(2,px(A,2)),color:'danger',level:.95,delay:500+i*160+x*1.2,from:{x:A.x,y:y-size*.38}});
 });
 const top=A.y+size+old.length*lh+lh;
 fresh.forEach((line,i)=>texts.push({key:'n'+i,text:line,x:A.x,y:top+i*lh,size,color:'accent',delay:1000+i*140}));
 return {marks,baseline:A.bottom,texts:[...head(c,(revise?'revise':c.focus?.kind==='retry'?'retry':'error')+' @'+String(c.index+1).padStart(2,'0'),null,revise?'redline over the previous segment':'run interrupted / retried'),...texts],
  live:[{type:'cursor',x:A.x+Math.min(A.w-8,span(fresh.at(-1)||'')*size*.6),y:top+(fresh.length-1)*lh-size*.85,w:size*.55,h:size,color:'danger'}]};
}

function code(c){
 const A=area(c.box),body=c.focus?.text.match(/```[^\n]*\n([\s\S]*?)(?:```|$)/)?.[1]??c.focus?.text??'',lines=body.replace(/\s+$/,'').split('\n');
 const size=Math.max(px(A,13),Math.min(px(A,24),Math.floor(A.h/(lines.length+3)/1.5))),lh=Math.round(size*1.5),room=Math.max(2,Math.floor((A.h-6)/lh)),shown=lines.slice(0,room),mapW=px(A,150),cols=Math.max(12,Math.floor((A.w-mapW-size*3)/(size*.6)));
 const texts=[...head(c,'source.code',null,`${lines.length} lines · ${D.length(body)} chars`)],marks=[];
 shown.forEach((line,i)=>{
  texts.push({key:'n'+i,text:String(i+1).padStart(2,'0'),x:A.x,y:A.y+size+i*lh,size:size-2,color:'muted',delay:i*70},{key:'c'+i,text:D.chars(line).slice(0,cols).join('')||' ',x:A.x+size*2.4,y:A.y+size+i*lh,size,color:'ink',delay:i*70+40});
 });
 const bar=Math.max(3,px(A,7));
 lines.slice(0,Math.floor(A.h/(bar+2))).forEach((line,i)=>{const w=Math.min(mapW-8,Math.max(2,span(line.trimEnd())*3*A.s));marks.push({id:'m'+i,x:A.right-mapW,y:A.y+i*(bar+2),w,h:bar,color:'accent',level:.65,delay:i*22,from:{x:A.right-mapW,y:A.bottom}});});
 return {marks,texts,baseline:A.bottom,live:[{type:'cursor',x:A.x+size*2.4+Math.min(cols,span(shown.at(-1)||''))*size*.6,y:A.y+(shown.length-1)*lh+2,w:size*.55,h:size}]};
}

function formula(c){
 const A=area(c.box),m=c.focus?.text.match(/\$\$([\s\S]*?)\$\$|\$([^\n$]+)\$|\\\[([\s\S]*?)\\\]/),expr=(m&&(m[1]||m[2]||m[3])||c.focus?.text||'').trim();
 const size=px(A,26),lines=wrap(expr,Math.max(10,Math.floor(A.w/(size*.6))),3),count=new Map();
 for(const ch of expr)if(/[=+\-*/^_<>≤≥≈≠∑∏∫√πλσμΔ∂∞(){}\[\]|!%]/u.test(ch))count.set(ch,(count.get(ch)||0)+1);
 const list=[...count].sort((a,b)=>b[1]-a[1]).slice(0,16),peak=Math.max(1,...list.map(x=>x[1])),bw=Math.min(px(A,44),Math.floor(A.w/Math.max(6,list.length))),cell=px(A,6),cellsMax=Math.floor(A.h*.4/cell),marks=[],texts=[];
 list.forEach(([ch,n],i)=>{const k=Math.max(1,Math.round(n/peak*cellsMax)),x=A.x+i*bw;for(let r=0;r<k;r++)marks.push({id:'s'+ch+':'+r,x,y:A.bottom-px(A,16)-(r+1)*cell,w:bw-6,h:cell-2,color:'ink',level:.4+.5*n/peak,delay:500+i*40+r*12,from:{x,y:A.bottom-px(A,16)}});texts.push({key:'k'+ch,text:ch,x:x+(bw-6)/2,y:A.bottom,size:px(A,13),color:'accent',align:'center',delay:500+i*40});});
 lines.forEach((line,i)=>texts.push({key:'f'+i,text:line,x:A.x,y:A.y+size+i*size*1.4,size,color:'ink',weight:700,delay:i*160}));
 return {marks,baseline:A.bottom,texts:[...head(c,'formula.extract',null,`${[...count.values()].reduce((a,b)=>a+b,0)} symbols · ${D.length(expr)} chars`),...texts]};
}

function compose(c){
 // The whole answer observed so far, the focus piece last: it grows like a page being written.
 const A=area(c.box),pieces=c.entries.slice(0,c.index+1).filter(e=>e.kind==='answer');
 const total=Math.max(1,pieces.reduce((s,e)=>s+D.length(e.text),0)),side=Math.max(px(A,7),Math.min(px(A,30),Math.floor(Math.sqrt(A.w*A.h*.42/total)))),bw=side,bh=Math.round(side*1.25),gap=Math.max(1,Math.round(side/5)),lh=bh+gap*2,perRow=Math.max(8,Math.floor(A.w/(bw+gap))),rowsMax=Math.max(2,Math.floor(A.h/lh));
 // Ids follow the character, not the slot: when the page reflows, blocks travel.
 const rows=[];let row=[],n=0;
 for(const piece of pieces){const focus=piece===c.focus;for(const ch of piece.text){n++;if(ch==='\n'){if(row.length)rows.push(row);row=[];continue;}row.push({ch,focus,n});if(row.length>=perRow){rows.push(row);row=[];}}if(row.length){rows.push(row);row=[];}}
 const visible=rows.slice(-rowsMax),marks=[];
 visible.forEach((list,r)=>list.forEach((item,k)=>{
  if(!item.ch.trim()||marks.length>=2600)return;
  const x=A.x+k*(bw+gap),y=A.y+r*lh;
  // Large blocks carry their character, small ones are the page's texture.
  marks.push({id:'t'+item.n,shape:bw>=14?'cell':'rect',ch:bw>=14?item.ch:undefined,x,y,w:bw,h:bh,color:item.focus?'accent':'ink',level:charLevel(item.ch),delay:r*55+k*3,from:{x,y:A.bottom}});
 }));
 const last=visible.at(-1)||[],chars=pieces.reduce((s,e)=>s+D.length(e.text),0);
 return {marks,baseline:A.bottom,texts:head(c,'{n} chars',{to:chars},`${rows.length} lines · ${pieces.length} pieces · focus ${D.length(c.focus?.text)} chars`),
  live:[{type:'cursor',x:A.x+last.length*(bw+gap),y:A.y+(visible.length-1)*lh-1,w:bw,h:bh+2}]};
}

function table(c){
 // Answer pieces are split per line, so the table is read from the answer so far.
 const answer=c.entries.slice(0,c.index+1).filter(e=>e.kind==='answer').map(e=>e.text).join('\n');
 const A=area(c.box),rows=D.tableOf(answer).slice(-10),cols=Math.min(6,Math.max(1,...rows.map(r=>r.length))),cw=A.w/cols,rh=Math.max(18,Math.min(px(A,34),Math.floor(A.h/Math.max(1,rows.length)))),size=px(A,13),marks=[],texts=[];
 rows.forEach((cells,r)=>{for(let k=0;k<cols;k++){const x=A.x+k*cw,y=A.y+r*rh,d=(r*cols+k)*60;
  marks.push({id:'c'+r+':'+k,shape:'frame',x,y,w:cw-4,h:rh-4,color:r?'muted':'accent',level:r?.6:.9,delay:d,from:{x,y:y+rh}});
  if(!r)marks.push({id:'h'+k,x,y,w:cw-4,h:rh-4,color:'accent',level:.18,delay:d});
  texts.push({key:'t'+r+':'+k,text:fit(cells[k]||'',size,cw-14),x:x+8,y:y+rh*.62,size,color:r?'ink':'accent',delay:d+80});
 }});
 return {marks,baseline:A.bottom,texts:[...head(c,`table ${rows.length} × ${cols}`,null,'cells extracted from the answer'),...texts]};
}

function idle(c){
 const A=area(c.box),raster=c.box.raster?.('TRACE',Math.floor(Math.min(A.h*.42,A.w*.18)),5),marks=[],size=px(A,13);
 if(raster){const ox=A.x+(A.w-raster.w)/2,oy=A.y+(A.h*.55-raster.h)/2;raster.points.forEach((p,i)=>marks.push({id:'i'+i,shape:'dot',x:ox+p.x,y:oy+p.y,w:2,h:2,color:'muted',level:.6,delay:i*1.5,from:{x:ox+p.x,y:A.bottom}}));}
 const lines=['[ OK ] thought-window attached','[ OK ] public trace channel open','[ .. ] waiting for stdin'];
 return {marks,baseline:A.bottom,texts:[...head(c,'standby',null,'no public events in this turn yet'),...lines.map((t,i)=>({key:'b'+i,text:t,x:A.x,y:A.bottom-size*4+i*size*1.5,size,color:i===2?'accent':'ink',delay:300+i*260}))],
  live:[{type:'cursor',x:A.x+span(lines[2])*size*.6+4,y:A.bottom-size*4+size*3-size*.85,w:size*.55,h:size}]};
}


// --- 0.10: scenes after the reference video, each driven by the reasoning text.

function tokenizer(c){
 // The current sentence cut into word chips, each with its source offset.
 const A=area(c.box),text=c.focus?.text||'',list=D.words(text).slice(0,80),size=px(A,17),small=Math.max(9,px(A,9)),rowH=Math.round(size*2.7),pad=Math.round(size*.45);
 const marks=[],texts=[];let x=A.x,y=A.y+8,row=0;
 const longest=list.reduce((m,w)=>D.length(w.text)>D.length(m?.text||'')?w:m,null);
 for(const [i,w] of list.entries()){
  const wpx=span(w.text)*size*.6+pad*2;
  if(x+wpx>A.right){row++;x=A.x;y+=rowH;}
  if(y+rowH>A.bottom)break;
  const hot=w===longest;
  marks.push({id:'k'+w.index,x,y,w:wpx-4,h:size*1.55,color:hot?'accent':'ink',level:hot?.32:.1,delay:i*45,from:{x,y:A.bottom}});
  marks.push({id:'u'+w.index,x,y:y+size*1.55,w:wpx-4,h:2,color:hot?'accent':'muted',level:.8,delay:i*45+60,from:{x,y:A.bottom}});
  texts.push({key:'t'+w.index,text:w.text,x:x+pad,y:y+size*1.12,size,color:hot?'accent':'ink',delay:i*45+80},{key:'o'+w.index,text:String((c.focus?.spans?.[0]?.start||0)+w.index),x:x+pad,y:y+size*1.55+small*1.3,size:small,color:'muted',delay:i*45+100});
  x+=wpx+6;
 }
 return {marks,baseline:A.bottom,caption:'词块 = 当前片段的分词 · 下方数字为原文字符偏移',texts:[...head(c,'tokenizer',null,`${list.length} words · ${D.length(text)} chars`),...texts]};
}

function agentloop(c){
 // THINK -> PLAN -> ACT -> OBSERVE, lit by what the turn has actually done.
 const A=area(c.box),upto=c.entries.slice(0,c.index+1),k=c.focus?.kind;
 const stage=k==='request'?2:k==='result'?3:['plan','constraint'].includes(k)?1:0;
 const last=kinds=>[...upto].reverse().find(e=>kinds.includes(e.kind));
 const boxes=[['THINK','reason()',last(['analysis','check','compare','search','math','code','revise'])],['PLAN','decompose()',last(['plan','constraint'])],['ACT','execute()',last(['request'])],['OBSERVE','observe()',last(['result'])]];
 const gap=px(A,26),bw=Math.floor((A.w-gap*3)/4),bh=px(A,74),y=A.y+6,marks=[],texts=[],size=px(A,14),small=px(A,10);
 boxes.forEach(([name,fn,entry],i)=>{
  const x=A.x+i*(bw+gap),on=i===stage,done=!!entry;
  marks.push({id:'box'+i,shape:'frame',x,y,w:bw,h:bh,color:on?'accent':done?'ink':'muted',level:on?1:done?.7:.35,delay:i*120,from:{x,y:y+bh}});
  if(on)marks.push({id:'fill'+i,x:x+2,y:y+2,w:bw-4,h:bh-4,color:'accent',level:.16,delay:i*120+80,blink:false,from:{x,y:y+bh}});
  texts.push({key:'n'+i,text:name,x:x+10,y:y+size*1.4,size,color:on?'accent':'ink',weight:700,delay:i*120+120},{key:'f'+i,text:fn,x:x+10,y:y+size*1.4+small*1.8,size:small,color:'muted',delay:i*120+160},
   {key:'e'+i,text:fit(entry?.text||'—',small,bw-20),x:x+10,y:y+bh-small*.9,size:small,color:'ink',level:.75,delay:i*120+220});
  if(i<3)for(let d=0;d<4;d++)marks.push({id:'ar'+i+'_'+d,x:x+bw+gap*(d+1)/5-2,y:y+bh/2-2,w:4,h:4,color:i<stage?'accent':'muted',level:.9,delay:i*120+200+d*40,from:{x:x+bw,y:y+bh/2}});
 });
 // The plan so far, as a tool-call style block.
 const plans=upto.filter(e=>['plan','constraint'].includes(e.kind)).slice(-7),tools=upto.filter(e=>e.kind==='request').slice(-2),top=y+bh+px(A,30),lh=Math.round(size*1.65);
 const lines=[['<steps>','muted'],...plans.map((e,i)=>[`  ${String(i+1).padStart(2,'0')}. ${D.short(e.text,80)}`,e===c.focus?'accent':'ink']),...tools.map(e=>[`  call ${e.title} ${D.short(e.text,50)}`,e===c.focus?'accent':'good']),['</steps>','muted']];
 const shown=lines.slice(0,Math.max(2,Math.min(lines.length,Math.floor((A.h*.5-bh)/lh))));
 shown.forEach(([text,color],i)=>texts.push({key:'l'+i+text.length,text:fit(text,size,A.w),x:A.x,y:top+i*lh,size,color,delay:500+i*110}));
 // Swimlanes: every segment so far, placed in its lane, filled up to the focus.
 const laneOf=e=>e.kind==='request'?2:e.kind==='result'?3:['plan','constraint'].includes(e.kind)?1:0;
 const all=c.entries.filter(e=>!['input','answer'].includes(e.kind)).slice(-48),lt=top+shown.length*lh+px(A,18),lane=Math.max(10,Math.min(px(A,22),Math.floor((A.bottom-lt)/4)-4)),label=px(A,62),cw=Math.max(6,Math.min(px(A,26),Math.floor((A.w-label)/Math.max(8,all.length))));
 ['THINK','PLAN','ACT','OBSERVE'].forEach((name,r)=>texts.push({key:'lane'+r,text:name,x:A.x,y:lt+r*(lane+4)+lane*.75,size:px(A,10),color:r===stage?'accent':'muted',delay:700}));
 all.forEach((e,i)=>{const r=laneOf(e),x=A.x+label+i*cw,yy=lt+r*(lane+4),past=c.entries.indexOf(e)<=c.index;
  marks.push({id:'sw'+e.id,x,y:yy,w:cw-2,h:lane,color:e===c.focus?'accent':r===2||r===3?'good':'ink',level:e===c.focus?1:past?.55:.12,delay:700+i*18,from:{x,y:A.bottom},ref:e.id});});
 return {marks,baseline:A.bottom,caption:'高亮 = 当前片段所处的环节 · 下方为本轮已出现的计划与工具调用',texts:[...head(c,'dsh · agent loop',null,['reasoning','planning','acting','observing'][stage]),...texts]};
}

function diff(c){
 // The previous line struck out, the revised one added, as a unified diff.
 const A=area(c.box),err=['error','retry'].includes(c.focus?.kind),before=err?c.focus:c.entries[c.index-1],after=err?null:c.focus;
 const size=px(A,15),lh=Math.round(size*1.7),cols=Math.max(12,Math.floor((A.w-size*3)/(size*.6))),gut=px(A,6);
 const old=wrap(before?.text,cols,5),fresh=after?wrap(after.text,cols,6):['↶ retry'],marks=[],texts=[];
 texts.push({key:'h1',text:'diff --git a/thought b/thought',x:A.x,y:A.y+size,size,color:'muted'},{key:'h2',text:`@@ -${c.index},${old.length} +${c.index+1},${fresh.length} @@`,x:A.x,y:A.y+size+lh,size,color:'accent',delay:150});
 [...old.map(t=>['-',t]),...fresh.map(t=>['+',t])].forEach(([sign,text],i)=>{
  const y=A.y+size+lh*(i+2),color=sign==='-'?'danger':'good';
  marks.push({id:'g'+i,x:A.x,y:y-size*.95,w:gut,h:lh-3,color,level:.85,delay:300+i*110,from:{x:A.x,y:A.bottom}});
  marks.push({id:'r'+i,x:A.x+gut+2,y:y-size*.95,w:A.w-gut-2,h:lh-3,color,level:.08,delay:300+i*110,from:{x:A.x,y:A.bottom}});
  texts.push({key:'d'+i+sign,text:sign+' '+text,x:A.x+gut+8,y,size,color,delay:360+i*110});
 });
 return {marks,baseline:A.bottom,caption:'红 = 被改写的上一段 · 绿 = 改写后的这一段 · 不判定对错',texts:[...head(c,err?'stderr · retry':'revision.diff',null,`${old.length} − / ${fresh.length} +`),...texts]};
}

function spiral(c){
 // The sentence's characters sampled onto a slowly turning spiral.
 // The current segment winds out from the centre (accent), earlier reasoning continues the arm.
 const A=area(c.box),own=D.chars((c.focus?.text||'').replace(/\s+/g,'')),before=D.chars(c.entries.slice(Math.max(0,c.index-8),c.index).map(e=>e.text).join('').replace(/\s+/g,'')).slice(-(200-Math.min(own.length,200)));
 const chars=[...own.slice(0,200),...before.reverse()].slice(0,200),cx=A.x+A.w*.55,cy=A.y+A.h*.48,rmax=Math.min(A.w*.42,A.h*.5),size=px(A,13),marks=[];
 chars.forEach((ch,i)=>{const u=i/Math.max(1,chars.length-1),a=u*Math.PI*11,r=rmax*(.06+.94*Math.sqrt(u)),x=cx+Math.cos(a)*r-size/2,y=cy+Math.sin(a)*r-size/2,mine=i<own.length;
  marks.push({id:'s'+i,shape:'glyph',ch,group:'spiral',x,y,w:size,h:size,color:mine?'accent':'ink',level:mine?.95:.25+.5*(1-u),delay:i*9,from:{x,y:A.bottom}});});
 const count=new Map();for(const ch of chars)count.set(ch,(count.get(ch)||0)+1);
 const topList=[...count].sort((a,b)=>b[1]-a[1]).slice(0,14),peak=Math.max(1,...topList.map(x=>x[1])),bw=px(A,9),bx=A.x,by=A.bottom-px(A,6);
 topList.forEach(([ch,n],i)=>{const h=Math.max(3,Math.round(n/peak*A.h*.22));marks.push({id:'h'+i,x:bx+i*(bw+3),y:by-h,w:bw,h,color:'accent',level:.7,delay:400+i*30,from:{x:bx+i*(bw+3),y:by}});});
 const share=chars.length?(topList[0]?.[1]||0)/chars.length:0;
 return {marks,baseline:A.bottom,motions:[{group:'spiral',type:'turn',cx:cx,cy:cy,size:rmax}],caption:'螺旋 = 当前片段（高亮）接着之前的推理文字 · 左下柱 = 字频',
  texts:[...head(c,'sampling · spiral',null,`${chars.length} chars · top "${topList[0]?.[0]||''}"`),{key:'pt',text:'p(top) = {n}',count:{to:share,kind:'fixed2'},x:A.x+topList.length*(bw+3)+12,y:by-4,size:px(A,12),color:'ink',delay:600}]};
}

function nexttoken(c){
 // Keyword shares so far (occurrence counts, not model probabilities).
 const A=area(c.box),texts=[],marks=[],upto=c.entries.slice(0,c.index+1),list=D.keywords(upto.map(e=>e.text),7),sum=Math.max(1,list.reduce((s,k)=>s+k.count,0));
 const size=px(A,15),lh=Math.round(size*2.3),labelW=size*7,barW=A.w*.42-labelW,focusText=(c.focus?.text||'').toLowerCase();
 list.forEach((k,i)=>{
  const y=A.y+size+i*lh,share=k.count/sum,n=Math.max(1,Math.round(k.count/list[0].count*barW/8)),hot=focusText.includes(k.word);
  texts.push({key:'w'+k.word,text:k.word,x:A.x,y,size,color:hot?'accent':'ink',delay:i*90},{key:'v'+k.word,text:'{n}',count:{to:share,kind:'fixed2'},x:A.x+labelW+n*8+8,y,size:size-2,color:'muted',delay:i*90+200});
  for(let j=0;j<n;j++)marks.push({id:'b'+k.word+j,x:A.x+labelW+j*8,y:y-size*.8,w:6,h:size*.9,color:hot?'accent':'ink',level:.75,delay:i*90+j*10,from:{x:A.x+labelW,y:y-size*.8}});
 });
 // The output column: the current sentence, word by word, the top word marked.
 const ox=A.x+A.w*.5,ow=A.right-ox,top=list[0]?.word;
 marks.push({id:'outbox',shape:'frame',x:ox,y:A.y,w:ow,h:A.h-4,color:'muted',level:.7,delay:100,from:{x:ox,y:A.bottom}});
 texts.push({key:'outt',text:'output',x:ox+10,y:A.y+size*1.2,size:px(A,11),color:'muted'});
 let x=ox+10,y=A.y+size*2.8;
 for(const [i,w] of D.words(c.focus?.text).slice(0,60).entries()){const wpx=span(w.text)*size*.6+size*.5;if(x+wpx>A.right-8){x=ox+10;y+=size*1.6;}if(y>A.bottom-10)break;const hot=w.text.toLowerCase().includes(top||'\u0000');texts.push({key:'o'+w.index,text:w.text,x,y,size,color:hot?'accent':'ink',level:hot?1:.75,delay:300+i*35});x+=wpx;}
 return {marks,baseline:A.bottom,caption:'条 = 关键词在本轮出现次数的占比，不是模型概率 · 右侧为当前片段',texts:[...head(c,'next_token · share',null,`${list.length} keywords · ${sum} hits`),...texts]};
}

function errorbig(c){
 // Errors take the whole stage: a big red word and the real message below.
 const A=area(c.box),word=c.focus?.kind==='retry'?'RETRY':'ERROR',size=Math.floor(Math.min(A.h*.42,A.w*.8/(word.length*.62))),step=Math.max(4,Math.round(size/22));
 const raster=c.box.raster?.(word,size,step),marks=[];
 if(raster){const ox=A.x+(A.w-raster.w)/2,oy=A.y+px(A,6);raster.points.forEach((p,i)=>marks.push({id:'e'+i,x:ox+p.x,y:oy+p.y,w:step-1,h:step-1,color:'danger',level:.95,delay:Math.abs(p.x-raster.w/2)/2,from:{x:ox+p.x,y:A.bottom}}));}
 const msg=wrap(c.focus?.text||'',Math.floor(A.w/(px(A,13)*.6)),5),small=px(A,13),top=A.y+(raster?raster.h:A.h*.4)+px(A,24);
 const texts=[{key:'x0',text:`Exception in turn ${c.focus?.turn??''}: ${c.focus?.label||''}`,x:A.x,y:top,size:small,color:'danger',delay:300},...msg.map((l,i)=>({key:'x'+(i+1),text:'    at '+l,x:A.x,y:top+(i+1)*small*1.6,size:small,color:'danger',level:.8,delay:400+i*100}))];
 return {marks,baseline:A.bottom,caption:'运行错误 / 重试的原文',texts:[...head(c,'stderr',null,word.toLowerCase()),...texts]};
}

// --- 0.11: scenes drawn from DSH's run records (timing, tools, todos, tokens, files).
const {fmtMs,fmtTok}=require('./run-metrics.cjs');
function empty(c,title,note){
 const A=area(c.box);
 return {marks:[],baseline:A.bottom,caption:'等待 DSH 的运行记录：'+note,texts:[...head(c,title,null,note),{key:'none',text:'[ .. ] '+note,x:A.x,y:A.y+px(A,20),size:px(A,13),color:'muted'}]};
}
function timeline(c){
 // One bar per model step and tool call, its length the recorded wall time.
 const m=c.metrics,spans=(m?.spans||[]).filter(s=>s.start!=null).slice(-14);
 if(!spans.length)return empty(c,'timeline · this turn','no timing recorded yet');
 const A=area(c.box),now=c.now||Date.now(),t0=m.start??spans[0].start,t1=Math.max(t0+1000,...spans.map(s=>s.end??now));
 const label=px(A,150),right=px(A,120),x0=A.x+label,x1=A.right-right,w=Math.max(40,x1-x0),cell=Math.max(4,px(A,6));
 const rh=Math.max(12,Math.min(px(A,26),Math.floor((A.h-px(A,40))/spans.length)-4)),size=px(A,12),marks=[],texts=[];
 const X=t=>x0+(t-t0)/(t1-t0)*w;
 spans.forEach((sp,i)=>{
  const y=A.y+px(A,24)+i*(rh+4),end=sp.end??now,a=X(sp.start),b=Math.max(a+cell,X(end));
  const color=sp.status==='error'?'danger':sp.kind==='tool'?'good':'accent';
  texts.push({key:'n'+sp.id,text:fit((sp.kind==='tool'?'⚙ ':'◆ ')+sp.label,size,label-10),x:A.x,y:y+rh*.72,size,color:sp.end==null?'accent':'ink',delay:i*80});
  for(let x=a,k=0;x<b-1;x+=cell,k++)marks.push({id:'b'+sp.id+'_'+k,x,y,w:Math.min(cell-1,b-x),h:rh,color,level:sp.kind==='llm'?.75:.85,blink:sp.end==null&&x+cell>=b-1,delay:i*80+k*6,from:{x:a,y:y+rh}});
  const extra=sp.kind==='llm'&&sp.tokens!=null?' · '+fmtTok(sp.tokens)+' tok':sp.status==='error'?' · error':'';
  texts.push({key:'d'+sp.id,text:fmtMs(end-sp.start)+extra,x:x1+8,y:y+rh*.72,size:size-1,color:sp.status==='error'?'danger':'muted',delay:i*80+200});
 });
 // Time axis.
 const span=t1-t0,step=[1e3,2e3,5e3,1e4,2e4,3e4,6e4,12e4,3e5].find(s=>span/s<=8)||6e5;
 for(let t=0,k=0;t<=span;t+=step,k++){marks.push({id:'ax'+k,x:X(t0+t),y:A.y+px(A,8),w:1,h:px(A,8),color:'muted',level:.8,delay:k*20,from:{x:X(t0+t),y:A.y+px(A,16)}});texts.push({key:'at'+k,text:fmtMs(t),x:X(t0+t)+3,y:A.y+px(A,14),size:px(A,9),color:'muted'});}
 const live=m.running?[{type:'sweep',x0:X(now)-1,x1:X(now),y0:A.y+px(A,20),y1:A.y+px(A,24)+spans.length*(rh+4),period:1000}]:[];
 return {marks,live,baseline:A.bottom,caption:'条长 = DSH 记录的真实耗时 · ◆ 模型步骤 · ⚙ 工具调用 · 红 = 出错',
  texts:[...head(c,'timeline · this turn',null,`${fmtMs(m.elapsedMs)} · ${m.steps} steps · ${m.tools} tools`+(m.toolErrors?` · ${m.toolErrors} failed`:'')),...texts]};
}
function todos(c){
 // The model's own todo list (DSH todos projection) as a progress board.
 const list=c.metrics?.todos||[];
 if(!list.length)return empty(c,'todos','no todo list in this session');
 const A=area(c.box),size=px(A,15),lh=Math.round(size*1.9),done=list.filter(t=>t.status==='completed').length,marks=[],texts=[];
 list.slice(0,Math.floor((A.h-px(A,60))/lh)).forEach((t,i)=>{
  const y=A.y+size+i*lh,box=t.status==='completed'?'[x]':t.status==='in_progress'?'[~]':'[ ]',color=t.status==='completed'?'good':t.status==='in_progress'?'accent':'ink';
  texts.push({key:'b'+i,text:box,x:A.x,y,size,color,delay:i*90},{key:'t'+i+t.content.length,text:fit(t.content,size,A.w-size*3),x:A.x+size*2.4,y,size,color,level:t.status==='completed'?.6:1,delay:i*90+60});
  if(t.status==='completed')marks.push({id:'s'+i,x:A.x+size*2.4,y:y-size*.35,w:Math.min(A.w-size*3,D.length(t.content)*size*.9),h:1.5,color:'good',level:.6,delay:i*90+300,from:{x:A.x+size*2.4,y:y-size*.35}});
  if(t.status==='in_progress')marks.push({id:'c'+i,x:A.x-px(A,10),y:y-size*.8,w:px(A,5),h:size,color:'accent',level:1,blink:true,delay:i*90,from:{x:A.x,y:A.bottom}});
 });
 const n=list.length,cw=Math.min(px(A,40),Math.floor(A.w/n)),by=A.bottom-px(A,14);
 list.forEach((t,i)=>marks.push({id:'p'+i,x:A.x+i*cw,y:by,w:cw-3,h:px(A,12),color:t.status==='completed'?'good':t.status==='in_progress'?'accent':'muted',level:t.status==='pending'?.25:.9,delay:400+i*40,from:{x:A.x,y:by}}));
 return {marks,baseline:A.bottom,caption:'清单来自模型调用的待办工具（DSH todos 投影）',texts:[...head(c,'{n} / '+n+' todos done',{to:done},list.find(t=>t.status==='in_progress')?.content?'now: '+list.find(t=>t.status==='in_progress').content:''),...texts]};
}
function tokens(c){
 // Context occupancy and the session's token buckets, as DSH accounts them.
 const m=c.metrics;
 if(!m?.context&&!m?.usage)return empty(c,'context · tokens','no token accounting served by this DSH');
 const A=area(c.box),size=px(A,13),marks=[],texts=[];let y=A.y+px(A,10);
 if(m.context){
  const cells=60,cw=Math.floor(A.w/cells),filled=Math.round(m.context.share*cells),h=px(A,26);
  texts.push({key:'ctx',text:`context  ${fmtTok(m.context.used)} / ${fmtTok(m.context.window)}`,x:A.x,y,size,color:'ink'});
  for(let i=0;i<cells;i++)marks.push({id:'cx'+i,x:A.x+i*cw,y:y+px(A,10),w:cw-2,h,color:m.context.share>.8&&i<filled?'danger':'accent',level:i<filled?.85:.12,delay:i*12,from:{x:A.x,y:y+px(A,10)+h}});
  texts.push({key:'cxp',text:'{n}',count:{to:m.context.share*100,kind:'pct'},x:A.right,y:y+px(A,10)+h+size*1.4,size:px(A,20),color:'accent',align:'right',weight:700,delay:500});
  y+=h+px(A,70);
 }
 if(m.usage){
  const rows=[['uncached input',m.usage.uncached,'ink'],['cache read',m.usage.cacheRead,'good'],['cache write',m.usage.cacheWrite,'muted'],['output',m.usage.output,'accent']].filter(r=>r[1]>0||r[0]==='cache read');
  const peak=Math.max(1,...rows.map(r=>r[1])),label=px(A,130),barW=A.w-label-px(A,90),lh=Math.round(size*2.1);
  rows.forEach(([name,v,color],i)=>{const yy=y+i*lh,n=Math.max(1,Math.round(v/peak*barW/8));
   texts.push({key:'u'+name,text:name,x:A.x,y:yy+size*.9,size,color:'ink',level:.85,delay:i*100},{key:'v'+name,text:fmtTok(v),x:A.x+label+n*8+8,y:yy+size*.9,size,color:'muted',delay:i*100+200});
   for(let j=0;j<n;j++)marks.push({id:'ub'+name+j,x:A.x+label+j*8,y:yy,w:6,h:size,color,level:.8,delay:i*100+j*5,from:{x:A.x+label,y:yy}});});
  if(m.usage.cacheHit!=null)texts.push({key:'hit',text:'cache hit {n}',count:{to:m.usage.cacheHit*100,kind:'pct'},x:A.x,y:y+rows.length*lh+size*1.2,size:px(A,16),color:'good',weight:700,delay:600});
 }
 const turn=[m.outputTokens!=null?`this turn ${fmtTok(m.outputTokens)} out`:null,m.tokensPerSecond?`${Math.round(m.tokensPerSecond)} tok/s`:null,m.ttftMs!=null?`first token ${fmtMs(m.ttftMs)}`:null].filter(Boolean).join(' · ');
 return {marks,baseline:A.bottom,caption:'上下文 = DSH contextPressure · 用量 = 会话累计 tokenUsage · 速度 = 本轮解码 token / 解码耗时',texts:[...head(c,'context · tokens',null,turn||'session totals'),...texts]};
}
function files(c){
 // Files this turn wrote, changed or delivered, grouped by directory.
 const list=(c.work?.files||[]).slice(-24);
 if(!list.length)return empty(c,'files','no file written in this turn');
 const A=area(c.box),size=px(A,13),lh=Math.round(size*1.85),groups=new Map(),marks=[],texts=[];
 for(const f of list){const dir=f.path.includes('/')?f.path.slice(0,f.path.lastIndexOf('/')):'.';if(!groups.has(dir))groups.set(dir,[]);groups.get(dir).push(f);}
 let row=0;const maxRows=Math.floor((A.h-px(A,10))/lh),peak=Math.max(1,...list.map(f=>f.changes||0));
 for(const [dir,items] of groups){
  if(row>=maxRows)break;
  texts.push({key:'g'+dir,text:'▸ '+fit(dir,size,A.w*.6)+'/',x:A.x,y:A.y+size+row*lh,size,color:'muted',delay:row*70});row++;
  for(const f of items){
   if(row>=maxRows)break;
   const y=A.y+size+row*lh,color=f.status==='error'?'danger':f.declared?'accent':'ink',n=f.changes?Math.max(1,Math.round(f.changes/peak*12)):1;
   texts.push({key:'f'+f.path,text:'  '+(f.action==='write'?'+ ':'~ ')+f.name,x:A.x+px(A,14),y,size,color,delay:row*70+40});
   for(let j=0;j<n;j++)marks.push({id:'c'+f.path+j,x:A.x+A.w*.55+j*px(A,10),y:y-size*.8,w:px(A,8),h:size*.9,color:f.status==='error'?'danger':'good',level:.8,delay:row*70+j*20,from:{x:A.x+A.w*.55,y:y}});
   texts.push({key:'s'+f.path,text:(f.changes?f.changes+' edits':'')+(f.declared?' · delivered':'')+(f.status==='error'?' · failed':''),x:A.x+A.w*.55+n*px(A,10)+8,y,size:size-1,color:'muted',delay:row*70+200});
   row++;
  }
 }
 return {marks,baseline:A.bottom,caption:'+ 新建 · ~ 修改 · 格数 = 确认的修改次数 · 来自工具记录与 DSH 交付索引',texts:[...head(c,`${list.length} file${list.length>1?'s':''}`,null,`${groups.size} folder${groups.size>1?'s':''} · ${list.filter(f=>f.declared).length} delivered`),...texts]};
}

// --- 0.12: keyword scenes. All three read the turn's public text up to the
// step being read: which words recur, where they first appear, and which
// appear together. Positions are hash projections, not semantic embeddings.
const occurrences=(text,word)=>{const t=String(text||'').toLowerCase(),w=word.toLowerCase();let n=0,i=0;while((i=t.indexOf(w,i))>=0){n++;i+=w.length;}return n;};
function keywordData(c,limit){
 const upto=c.entries.slice(0,c.index+1).filter(e=>e.kind!=='input'||c.entries.length<2);
 const all=upto.map(e=>e.text).join('\n'),kws=D.keywords(upto.map(e=>e.text),limit);
 const focus=new Set(D.keywords([c.focus?.text||''],20).map(k=>k.word));
 return {upto,all,kws,focus};
}
function radar(c){
 // Keywords as blips: distance from the centre = where the word first
 // appears in the turn (centre = early), size = how often it recurs.
 const {all,kws,focus}=keywordData(c,14),A=area(c.box);
 if(!kws.length)return empty(c,'keyword radar','no recurring words yet');
 const R=Math.min(A.w*.3,(A.bottom-A.y)*.46),cx=A.x+R+px(A,12),cy=A.y+(A.bottom-A.y)/2,marks=[],texts=[],dot=Math.max(2,px(A,2)),total=Math.max(1,D.length(all));
 for(let k=1;k<=4;k++){const r=R*k/4,n=Math.round(18+k*10);for(let i=0;i<n;i++){const a=i/n*Math.PI*2;marks.push({id:'ring'+k+'_'+i,x:cx+Math.cos(a)*r,y:cy+Math.sin(a)*r,w:dot,h:dot,color:'muted',level:.35,delay:k*80+i*4,from:{x:cx,y:A.bottom}});}}
 for(let i=-10;i<=10;i++){if(!i)continue;marks.push({id:'hx'+i,x:cx+i*R/10,y:cy,w:dot,h:dot,color:'line',level:.6,delay:300,from:{x:cx,y:A.bottom}},{id:'vy'+i,x:cx,y:cy+i*R/10,w:dot,h:dot,color:'line',level:.6,delay:300,from:{x:cx,y:A.bottom}});}
 const peak=Math.max(...kws.map(k=>k.count)),size=px(A,12);
 kws.forEach((k,i)=>{
  const first=Math.max(0,all.toLowerCase().indexOf(k.word)),r=R*(.12+.86*first/total),a=(D.hash(k.word)%360)*Math.PI/180,x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r,s=Math.max(4,px(A,5+9*k.count/peak)),hot=focus.has(k.word);
  marks.push({id:'b'+k.word,x:x-s/2,y:y-s/2,w:s,h:s,color:hot?'accent':'good',level:hot?1:.75,blink:hot,delay:500+i*70,from:{x:x-s/2,y:A.bottom}});
  texts.push({key:'bl'+k.word,text:k.word,x:x+s,y:y+size*.35,size,color:hot?'accent':'ink',level:hot?1:.7,delay:560+i*70});
 });
 // The register on the right: word, count, first offset.
 const lx=cx+R+px(A,36),lh=Math.round(size*1.7);
 kws.slice(0,Math.floor((A.bottom-A.y)/lh)).forEach((k,i)=>texts.push({key:'l'+k.word,text:fit(`${k.word.padEnd(8)} ×${k.count}  @${all.toLowerCase().indexOf(k.word)}`,size,A.right-lx),x:lx,y:A.y+size+i*lh,size,color:focus.has(k.word)?'accent':'ink',level:.85,delay:700+i*60}));
 return {marks,live:[{type:'radar',x:cx,y:cy,r:R,period:3600,color:'accent'}],baseline:A.bottom,caption:'距中心 = 词第一次出现的位置（越近越早）· 点大小 = 出现次数 · 高亮 = 当前片段里的词',
  texts:[...head(c,'keyword radar',null,`${kws.length} recurring words · ${D.length(all)} chars scanned`),...texts]};
}
function heatmap(c){
 // Rows: the turn's most frequent words. Columns: its steps so far.
 // A cell lights up by how often that word occurs in that step.
 const {upto,kws}=keywordData(c,8),A=area(c.box);
 const cols=upto.slice(-24);
 if(kws.length<2||cols.length<2)return empty(c,'word × step heatmap','needs two steps with recurring words');
 const size=px(A,12),label=px(A,110),cw=Math.max(8,Math.min(px(A,64),Math.floor((A.w-label)/cols.length))),ch=Math.max(8,Math.min(px(A,30),Math.floor((A.bottom-A.y-px(A,40))/kws.length))),marks=[],texts=[];
 const grid=kws.map(k=>cols.map(e=>occurrences(e.text,k.word))),peak=Math.max(1,...grid.flat());
 kws.forEach((k,r)=>{
  const y=A.y+r*ch;
  texts.push({key:'w'+k.word,text:fit(k.word,size,label-10),x:A.x,y:y+ch*.65,size,color:'ink',delay:r*60});
  cols.forEach((e,j)=>{const n=grid[r][j],x=A.x+label+j*cw,hot=e===c.focus;
   marks.push({id:'c'+r+'_'+j,x,y,w:cw-2,h:ch-2,color:hot?'accent':'good',level:n?.2+.75*n/peak:.05,delay:r*60+j*14,from:{x,y:A.bottom},ref:e.id});
   if(n&&ch>=size*1.3&&cw>=size*1.3)texts.push({key:'n'+r+'_'+j,text:String(n),x:x+cw/2-1,y:y+ch*.65,size:size-2,color:n/peak>.55?'paper':'ink',align:'center',delay:400+r*60+j*14});});
 });
 const fi=cols.indexOf(c.focus);
 if(fi>=0){const x=A.x+label+fi*cw;marks.push({id:'focus',shape:'frame',x:x-2,y:A.y-2,w:cw+2,h:kws.length*ch+2,color:'accent',level:1,delay:500,from:{x,y:A.bottom}});}
 cols.forEach((e,j)=>{if(j%Math.ceil(cols.length/12)===0)texts.push({key:'s'+j,text:'#'+String(c.entries.indexOf(e)+1).padStart(2,'0'),x:A.x+label+j*cw,y:A.y+kws.length*ch+size*1.4,size:size-2,color:e===c.focus?'accent':'muted',delay:600});});
 return {marks,baseline:A.bottom,caption:'行 = 本轮高频词 · 列 = 已读到的步骤 · 格亮度 = 该词在该步出现的次数 · 框 = 当前步骤',
  texts:[...head(c,'word × step',null,`${kws.length} words × ${cols.length} steps`),...texts]};
}
function constellation(c){
 // Words as stars (placed by a fixed hash projection); a line joins two
 // words that appear in the same step. Bright = in the current step.
 const {upto,kws,focus}=keywordData(c,16),A=area(c.box);
 if(kws.length<3)return empty(c,'word constellation','needs three recurring words');
 const pts=D.project(kws.map(k=>k.word)),size=px(A,12),marks=[],texts=[],dot=Math.max(2,px(A,2));
 const P=kws.map((k,i)=>({k,x:A.x+px(A,30)+pts[i][0]*(A.w-px(A,140)),y:A.y+px(A,16)+pts[i][1]*(A.bottom-A.y-px(A,40))}));
 const edges=new Map();
 for(const e of upto){const inside=P.filter(p=>occurrences(e.text,p.k.word));for(let i=0;i<inside.length;i++)for(let j=i+1;j<inside.length;j++){const key=inside[i].k.word+'|'+inside[j].k.word;edges.set(key,(edges.get(key)||0)+1);}}
 const peakE=Math.max(1,...edges.values());
 [...edges].sort((a,b)=>b[1]-a[1]).slice(0,40).forEach(([key,n],ei)=>{
  const [a,b]=key.split('|').map(w=>P.find(p=>p.k.word===w)),len=Math.hypot(b.x-a.x,b.y-a.y),steps=Math.max(3,Math.floor(len/(dot*4))),hot=focus.has(a.k.word)&&focus.has(b.k.word);
  for(let s=1;s<steps;s++){const u=s/steps;marks.push({id:'e'+ei+'_'+s,x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u,w:dot,h:dot,color:hot?'accent':'line',level:hot?.9:.25+.5*n/peakE,delay:300+ei*20+s*6,from:{x:a.x,y:A.bottom}});}
 });
 const peak=Math.max(...kws.map(k=>k.count));
 P.forEach((p,i)=>{const hot=focus.has(p.k.word),s=Math.max(4,px(A,4+8*p.k.count/peak));
  marks.push({id:'star'+p.k.word,x:p.x-s/2,y:p.y-s/2,w:s,h:s,color:hot?'accent':'ink',level:hot?1:.8,blink:hot,delay:i*50,from:{x:p.x-s/2,y:A.bottom}});
  texts.push({key:'sl'+p.k.word,text:p.k.word+(p.k.count>1?' ×'+p.k.count:''),x:p.x+s,y:p.y-s*.6,size,color:hot?'accent':'ink',level:hot?1:.75,delay:200+i*50});});
 return {marks,baseline:A.bottom,caption:'星 = 高频词（位置为固定哈希投影，非语义）· 连线 = 两词出现在同一步骤 · 亮 = 当前片段里的词',
  texts:[...head(c,'word constellation',null,`${kws.length} words · ${edges.size} pairings`),...texts]};
}

function outline(c){
 // Goal -> constraints -> options (chosen lit) -> decision -> risks, as a flow.
 const o=c.outline;
 if(!o)return empty(c,'thought / outline',c.outlineNote||'outline not ready');
 const A=area(c.box);
 // Laid out at full size first; shrunk step by step until the risks fit too.
 let laid;for(const k of [1,.88,.76,.66]){laid=layOutline(o,A,k);if(laid.end<=A.bottom)break;}
 const sub=[c.outlineModel,c.outlineTokens?c.outlineTokens+' tok':null].filter(Boolean).join(' · ');
 return {marks:laid.marks,baseline:A.bottom,caption:CAPTIONS.outline,texts:[...head(c,'thought / outline',null,sub||null),...laid.texts]};
}
function layOutline(o,A,k){
 const size=Math.max(10,Math.round(px(A,13)*k)),small=Math.max(9,Math.round(px(A,11)*k)),gap=Math.round(px(A,20)*k),pad=Math.round(px(A,10)*k),marks=[],texts=[];
 const cols=w=>Math.max(6,Math.floor((w-pad*2)/(size*.6)));
 let y=A.y,step=0;
 const arrow=(x,from,to,color,id)=>{for(let d=0,n=3;d<n;d++)marks.push({id:'ar'+id+d,x:x-2,y:from+(to-from)*(d+1)/(n+1)-2,w:4,h:4,color,level:.9,delay:step*160+d*50,from:{x:x-2,y:from}});};
 const box=(id,x,w,lines,{color='ink',label,fill=false,lead=0}={})=>{
  const h=pad*2+lines.length*Math.round(size*1.55)+(label?small*1.6:0);
  marks.push({id:'bx'+id,shape:'frame',x,y,w,h,color,level:fill?1:.75,delay:step*160,from:{x,y:y+h}});
  if(fill)marks.push({id:'bf'+id,x:x+2,y:y+2,w:w-4,h:h-4,color,level:.14,delay:step*160+60,from:{x,y:y+h}});
  let ty=y+pad;
  if(label){texts.push({key:'bl'+id,text:label,x:x+pad,y:ty+small,size:small,color:fill?color:'muted',weight:700,delay:step*160+80});ty+=small*1.6;}
  lines.forEach((line,i)=>texts.push({key:'bt'+id+i+line.length,text:line,x:x+pad,y:ty+size*(1.1+i*1.55),size,color:i<lead?color:'ink',weight:i<lead?700:400,delay:step*160+120+i*60}));
  return h;
 };
 const mid=A.x+A.w/2;
 // Goal.
 if(o.goal){const h=box('goal',A.x,A.w,wrap(o.goal,cols(A.w),2),{label:'GOAL',color:'accent'});arrow(mid,y+h,y+h+gap,'muted','g');y+=h+gap;step++;}
 // Constraints as a row of chips.
 if(o.constraints.length){
  const n=o.constraints.length,cw=Math.floor((A.w-(n-1)*px(A,8))/n);let tall=0;
  o.constraints.forEach((t,i)=>{tall=Math.max(tall,box('c'+i,A.x+i*(cw+px(A,8)),cw,wrap('◇ '+t,cols(cw),2),{label:i?null:'CONSTRAINTS'}));});
  // Chips without a label line up with the labelled first one.
  arrow(mid,y+tall,y+tall+gap,'muted','c');y+=tall+gap;step++;
 }
 // Options side by side; the chosen one is lit and points to the decision.
 let chosenX=mid;
 if(o.options.length){
  const n=o.options.length,ow=Math.floor((A.w-(n-1)*px(A,12))/n);let tall=0;
  o.options.forEach((opt,i)=>{
   const x=A.x+i*(ow+px(A,12)),lines=[fit(opt.name,size,ow-pad*2),...(opt.for?wrap('+ '+opt.for,cols(ow),2):[]),...(opt.against?wrap('− '+opt.against,cols(ow),2):[])];
   tall=Math.max(tall,box('o'+i,x,ow,lines,{label:opt.chosen?'OPTION ✓':'OPTION '+String.fromCharCode(65+i),color:opt.chosen?'accent':'ink',fill:opt.chosen,lead:1}));
   if(opt.chosen)chosenX=x+ow/2;
  });
  arrow(chosenX,y+tall,y+tall+gap,'accent','o');y+=tall+gap;step++;
 }
 // Decision.
 if(o.decision){const h=box('d',A.x,A.w,wrap(o.decision,cols(A.w),3),{label:'DECISION',color:'accent',fill:true});y+=h+px(A,14);step++;}
 // Risks and open questions.
 o.risks.forEach((r,i)=>{texts.push({key:'r'+i+r.length,text:fit('! '+r,size,A.w),x:A.x,y:y+size,size,color:'danger',level:.9,delay:step*160+i*90});y+=Math.round(size*1.7);});
 return {marks,texts,end:y};
}
const BUILDERS={idle,glyph,bars,curve,cloud,mask,grid,compare,boot,exec,redline,code,formula,compose,table,tokenizer,agentloop,diff,spiral,nexttoken,errorbig,timeline,todos,tokens,files,outline,radar,heatmap,constellation};
function buildFigure(id,context){
 const make=BUILDERS[id]||bars,spec=make(context);
 return {figure:id,title:TITLES[id]||id,caption:CAPTIONS[id]||'',marks:[],texts:[],live:[],...spec};
}
module.exports={buildFigure,TITLES,CAPTIONS,wrap,area,fit,span,FIGURES:Object.keys(BUILDERS)};

},
"./stage-engine.cjs": function(module,exports,require){
'use strict';
// Canvas stage. A figure is a list of target marks; the engine owns the
// particles that travel between figures, so one drawing turns into the next
// instead of being swapped. Marks nothing can carry are born at the figure's
// baseline and grow into place. Post-processing follows the reference PV:
// afterimage, soft glow and (in CSS) scanlines.
const SCRAMBLE='01#$%&*+=/<>[]{}~^:;!?abcdefx';
const FONT='Consolas,"SFMono-Regular","Microsoft YaHei",monospace';
const COLOR_NAMES=['paper','ink','muted','accent','danger','good','line'];
const easeOut=u=>1-Math.pow(1-u,3);
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,u)=>a+(b-a)*u;
const noise=(i,t)=>{const s=Math.sin(i*12.9898+t*78.233)*43758.5453;return s-Math.floor(s);};
const formatCount=(v,kind)=>kind==='fixed2'?v.toFixed(2):kind==='pct'?Math.round(v)+'%':Math.round(v).toLocaleString('en-US');
const rasterCache=new Map();
// Text → sampled pixels, for big glyph drawings. Cached per word/size/step.
function raster(text,size,step){
 const key=text+'|'+size+'|'+step;
 if(rasterCache.has(key))return rasterCache.get(key);
 const c=document.createElement('canvas'),x=c.getContext('2d',{willReadFrequently:true});
 const font=`700 ${size}px "Microsoft YaHei","PingFang SC",Consolas,sans-serif`;
 x.font=font;const w=Math.ceil(x.measureText(text).width)+4,h=Math.ceil(size*1.2);
 c.width=w;c.height=h;x.font=font;x.textBaseline='alphabetic';x.fillStyle='#fff';x.fillText(text,2,Math.round(size*.98));
 const data=x.getImageData(0,0,w,h).data,points=[];
 for(let y=0;y<h;y+=step)for(let px=0;px<w;px+=step)if(data[(y*w+px)*4+3]>110)points.push({x:px,y});
 const out={w,h,points:points.slice(0,2600)};
 if(rasterCache.size>40)rasterCache.clear();
 rasterCache.set(key,out);return out;
}
// Whole-figure actions for the director's actor: a pose per moment (offset,
// scale, rotation about the feet, per-row sway) applied to every particle of
// the group at draw time, so the drawing itself never has to be rebuilt.
// Leaps have anticipation (a crouch), stretch on take-off and a squash on
// landing; travelling actions cross the free width of the stage (act.range)
// and report which way they head (face), so the figure turns that way.
const lerpKeys=(keys,u)=>{
 if(!keys.length)return {dx:0,dy:0,rot:0,sx:1,sy:1};
 const list=keys[0].t>0?[{...keys.at(-1),t:keys.at(-1).t-1},...keys]:keys,next=list.find(k=>k.t>=u)||{...list[0],t:list[0].t+1};
 const prev=[...list].reverse().find(k=>k.t<=u)||list[0],span=next.t-prev.t||1,f=Math.max(0,Math.min(1,(u-prev.t)/span));
 const mix=k=>prev[k]+(next[k]-prev[k])*f;
 return {dx:mix('dx'),dy:mix('dy'),rot:mix('rot'),sx:mix('sx'),sy:mix('sy')};
};
const smooth=u=>u<=0?0:u>=1?1:u*u*(3-2*u);
// One leap over a cycle u (0..1): crouch, take off, fly an arc, land and squash.
function leap(p,u,height,{turn=0}={}){
 const crouch=.18,land=.84;
 if(u<crouch){const k=Math.sin(u/crouch*Math.PI/2);p.sy=1-.2*k;p.sx=1+.13*k;return;}
 if(u<land){const a=(u-crouch)/(land-crouch);p.dy=-4*a*(1-a)*height;p.sy=a<.25?1+.16*(1-a/.25):a>.8?1+.08*(a-.8)/.2:1;p.sx=1/p.sy;p.rot=turn*smooth(a);return;}
 const v=(u-land)/(1-land),k=Math.sin(v*Math.PI);p.sy=1-.2*k;p.sx=1+.14*k;p.rot=turn;
}
function pose(type,sec,size,span,act={}){
 const p={dx:0,dy:0,sx:1,sy:1,rot:0,sway:0,scatter:0,face:0},TAU=Math.PI*2;
 const range=act.range??span*.3,high=Math.max(0,act.rangeY??size*.6);
 const across=speed=>{const a=sec*speed;p.dx=Math.sin(a)*range;p.face=Math.cos(a)>=0?1:-1;};
 if(act.move){
  // A move the director defined: keyframes over one period, plus travel.
  const m=act.move,u=(sec/m.period)%1,k=lerpKeys(m.keys||[],u);
  p.dx=k.dx*size;p.dy=k.dy*size;p.rot=k.rot*Math.PI/180;p.sx=k.sx;p.sy=k.sy;
  const w=TAU/m.period;
  if(m.travel==='across'){const a=sec*w/4;p.dx+=Math.sin(a)*range;p.face=Math.cos(a)>=0?1:-1;}
  else if(m.travel==='circle'){const a=sec*w/2;p.dx+=Math.cos(a)*range*.7;p.dy+=Math.sin(a)*Math.min(high,size*.5)*.7-Math.min(high,size*.5)*.3;p.face=-Math.sin(a)>=0?1:-1;}
  else if(m.travel==='bounce')p.dy-=Math.abs(Math.sin(sec*Math.PI/m.period))*Math.min(high,size*.7);
  else if(m.travel==='updown')p.dy+=(Math.sin(sec*w)-1)*Math.min(high,size*.6)*.5;
  else if(m.travel==='zigzag'){const a=(sec/(m.period*2))%1,tri=a<.5?a*4-1:3-a*4;p.dx+=tri*range;p.face=a<.5?1:-1;p.dy-=Math.abs(Math.sin(sec*w*2))*size*.15;}
  return p;
 }
 switch(type){
  case 'dance':{
   // An eight-count: step left, step right, a turn, a hop, a pose.
   const u=(sec/4)%1,c=u*8,beat=c%1,bob=Math.abs(Math.sin(c*Math.PI));
   p.sway=.08*Math.sin(c*Math.PI);p.dy=-bob*size*.06;
   if(c<2)p.dx=-size*.25*smooth(c/2);
   else if(c<4)p.dx=-size*.25+size*.5*smooth((c-2)/2);
   else if(c<6){p.dx=size*.25*(1-smooth((c-4)/2));p.sx=Math.cos(smooth((c-4)/2)*TAU);}
   else if(c<7){leap(p,beat,Math.min(high,size*.28));}
   else{p.rot=.18*Math.sin(beat*Math.PI);p.sy=1-.06*Math.sin(beat*Math.PI);}
   break;}
  case 'jump':leap(p,(sec/1.8)%1,Math.min(high,size*.5));break;
  case 'happy':{leap(p,(sec/.9)%1,size*.16);p.rot+=.06*Math.sin(sec*7);break;}
  case 'cheer':{leap(p,(sec/1.4)%1,Math.min(high,size*.32));p.rot+=.05*Math.sin(sec*9);break;}
  case 'flip':{const k=Math.floor(sec/2.4);leap(p,(sec/2.4)%1,Math.min(high,size*.65),{turn:(k%2?-1:1)*TAU});break;}
  case 'spin':{const u=(sec/1.8)%1;p.sx=Math.cos(smooth(u)*TAU);p.dy=-Math.sin(u*Math.PI)*size*.08;break;}
  case 'wave':p.rot=.08*Math.sin(sec*3.2);p.sway=.05*Math.sin(sec*3.2);p.dy=-Math.abs(Math.sin(sec*1.6))*size*.03;break;
  case 'nod':{const u=(sec/1.2)%1;p.rot=.15*Math.sin(Math.min(1,u*2)*Math.PI);p.dy=-Math.sin(u*Math.PI)*size*.02;break;}
  case 'bow':{const u=(sec/3.2)%1,k=u<.25?smooth(u/.25):u<.55?1:u<.8?1-smooth((u-.55)/.25):0;p.rot=.48*k;p.sy=1-.05*k;break;}
  case 'shake':p.dx=Math.sin(sec*30)*size*.035*(.6+.4*Math.abs(Math.sin(sec*1.5)));break;
  case 'think':p.dy=-Math.sin(sec*1.2)*size*.03;p.rot=.06*Math.sin(sec*.7);p.sway=.03*Math.sin(sec*.9);break;
  case 'sleep':p.rot=.14;p.sy=1+.045*Math.sin(sec*1.1);p.sx=1-.02*Math.sin(sec*1.1);break;
  case 'sad':p.sy=.9+.03*Math.sin(sec*.8);p.sx=1.04;p.rot=-.06;p.dy=Math.sin(sec*.9)*2;break;
  case 'surprised':{const u=(sec/1.8)%1;if(u<.3)leap(p,u/.3,size*.25);else if(u<.5)p.dx=Math.sin(sec*45)*size*.03;p.sy*=u>=.3&&u<.5?1.06:1;break;}
  case 'sing':p.sway=.07*Math.sin(sec*2.4);p.rot=.06*Math.sin(sec*1.2);p.sy=1+.04*Math.sin(sec*4.8);p.dy=-Math.abs(Math.sin(sec*2.4))*size*.03;break;
  case 'eat':{const c=Math.max(0,Math.sin(sec*7));p.sy=1-.1*c;p.sx=1+.06*c;p.rot=.05*c;break;}
  case 'walk':across(.42);p.dy=-Math.abs(Math.sin(sec*5))*size*.05;p.rot=.05*Math.sin(sec*5);break;
  case 'run':across(.75);p.dy=-Math.abs(Math.sin(sec*8))*size*.1;p.rot=.12*p.face;p.sy=1+.05*Math.sin(sec*16);break;
  case 'crawl':across(.18);p.sy=1-.08*(Math.sin(sec*3.4)+1)/2;p.sx=1+.06*(Math.sin(sec*3.4)+1)/2;break;
  case 'hop':{across(.26);leap(p,(sec/.95)%1,Math.min(high,size*.26));break;}
  case 'bounce':{across(.34);leap(p,(sec/1.15)%1,Math.min(high,size*.62));break;}
  case 'roll':across(.5);p.rot=p.dx/(size*.5);break;
  case 'swim':{across(.34);const a=sec*1.2;p.dy=(Math.sin(a)-1)*Math.min(high,size*.7)*.5;p.rot=.18*Math.cos(a)*p.face;p.sway=.05*Math.sin(sec*4.5);break;}
  case 'dive':{
   // Leaps out and plunges back, alternating direction so it never jumps.
   const u=(sec/4)%1,dir=Math.floor(sec/4)%2?-1:1;
   p.dx=dir*(u*2-1)*range*.9;p.face=dir;p.dy=-Math.sin(u*Math.PI)*Math.min(high,size*.9);p.rot=dir*(u-.5)*1.8*Math.min(1,Math.sin(u*Math.PI)*2.5);break;}
  case 'fly':{across(.36);const lift=Math.min(high,size*1.2),a=sec*2;p.dy=-lift*.7+Math.sin(a)*size*.12;p.rot=-.14*Math.cos(a)*p.face;break;}
  case 'hover':p.dy=-Math.min(high,size*.6)*.5+Math.sin(sec*1.6)*size*.09;p.rot=.06*Math.sin(sec*1.1);break;
  case 'grow':{const k=1+.16*Math.sin(sec*1.6);p.sx=k;p.sy=k;break;}
  case 'type':p.dy=-Math.abs(Math.sin(sec*9))*2;p.rot=.03*Math.sin(sec*4.5);break;
  case 'explode':p.scatter=Math.max(0,Math.sin(sec*1.1))**3;break;
  case 'float':p.dy=Math.sin(sec*1.8)*size*.12;p.rot=.08*Math.sin(sec*1.1);break;
  case 'bob':p.dy=-Math.abs(Math.sin(sec*2.5))*size*.15;break;
  case 'sway':p.sway=.14*Math.sin(sec*1.3+(act.seed||0));break;
  case 'drift':p.dx=Math.sin(sec*.12+(act.seed||0))*span*.5;break;
  case 'none':break;
  case 'turn':p.rot=sec*.32;break;
  default:p.dy=-Math.abs(Math.sin(sec*1.6))*size*.03;p.sy=1+.03*Math.sin(sec*1.6);
 }
 return p;
}
// The pose of a group now. A new action blends in from the previous one, so
// changing from swim to dive (or any travel) never jumps across the stage.
const BLEND=800;
function poseAt(act,t){
 if(act._t===t)return act._q;
 let q=pose(act.type,(t-act.t0)/1000,act.size||100,act.span||300,act);
 if(act.prev){
  const u=(t-act.b0)/BLEND;
  if(u>=1)act.prev=null;
  else{const o=pose(act.prev.type,(t-act.prev.t0)/1000,act.prev.size||100,act.prev.span||300,act.prev),e=smooth(u),mix=k=>o[k]+(q[k]-o[k])*e;
   q={dx:mix('dx'),dy:mix('dy'),rot:mix('rot'),sx:mix('sx'),sy:mix('sy'),sway:mix('sway'),scatter:mix('scatter'),face:e<.5?o.face:q.face};}
 }
 act._t=t;act._q=q;return q;
}
// A follower (the speech bubble) moves with the actor but neither turns nor scales.
function place(act,s,p,t){
 const q=poseAt(act,t);
 if(act.follow)return {x:s.x+q.dx,y:s.y+Math.min(0,q.dy),w:s.w,h:s.h};
 const flip=q.face?q.face*(act.facing==='left'?-1:1):1;
 let rx=(s.x+s.w/2-act.cx)*q.sx*flip,ry=(s.y+s.h/2-act.cy)*q.sy;
 rx+=q.sway*ry;
 if(q.scatter){const d=Math.hypot(rx,ry)||1;rx+=(rx/d+(noise(p.n,5)-.5))*q.scatter*act.size*.7;ry+=(ry/d+(noise(p.n,6)-.5))*q.scatter*act.size*.7;}
 const c=Math.cos(q.rot),n=Math.sin(q.rot),w=s.w*Math.abs(q.sx),h=s.h*Math.abs(q.sy);
 return {x:act.cx+rx*c-ry*n+q.dx-w/2,y:act.cy+rx*n+ry*c+q.dy-h/2,w,h};
}
// Secondary motion that follows the actor: a trail of bubbles, sparkles or
// wind lines behind it, and dust puffs where it lands or runs.
function fxStep(act,t){
 const q=poseAt(act,t),size=act.size||100,x=act.cx+q.dx,y=act.cy-size*.5+q.dy,face=q.face||act.lastFace||1;
 act.lastFace=face;act.trail=act.trail||[];act.puffs=act.puffs||[];
 const last=act.trail.at(-1);
 if(!last||t-last.t>=70){act.trail.push({x,y,t,face});if(act.trail.length>32)act.trail.shift();}
 const ground=q.dy>-size*.03,moved=Math.abs(q.dx-(act.lastDx??q.dx));
 if(act.fx==='dust'){
  if(ground&&act.air)for(let k=0;k<6;k++)act.puffs.push({x:x+(k-2.5)*size*.12,t0:t,dir:k<3?-1:1,big:1});
  else if(ground&&moved>.4&&t-(act.lastPuff||0)>300){act.puffs.push({x:x-face*size*.3,t0:t,dir:-face,big:.6});act.lastPuff=t;}
 }
 act.air=!ground;act.lastDx=q.dx;
 act.puffs=act.puffs.filter(p=>t-p.t0<750);
}
function createEngine(canvas,options={}){
 const ctx=canvas.getContext('2d');
 const scene=document.createElement('canvas'),sctx=scene.getContext('2d');
 const glow=document.createElement('canvas'),gctx=glow.getContext('2d');
 let w=1,h=1,dpr=1,colors={},dark=true,particles=[],texts=new Map(),live=[],spin=null,acts=new Map(),key=null,builder=null,spec=null;
 const transparent=!!options.transparent;
 let animate=options.animate!==false,motion=options.motion||'rich',raf=0,last=0,dead=false,serial=0,settle=0,born=performance.now();
 const now=()=>performance.now();
 const speed=()=>motion==='calm'?.55:1;
 function readColors(){
  const style=getComputedStyle(canvas);
  for(const name of COLOR_NAMES)colors[name]=style.getPropertyValue('--'+name).trim()||colors[name]||({paper:'#070b14',ink:'#d5dfed',muted:'#8e9bb0',accent:'#98aafa',danger:'#f07470',good:'#96c4b4',line:'#3d4b62'})[name];
  const m=colors.paper.match(/^#([0-9a-f]{6})$/i);
  dark=m?parseInt(m[1].slice(0,2),16)+parseInt(m[1].slice(2,4),16)+parseInt(m[1].slice(4,6),16)<300:true;
 }
 function state(p,t){
  const u=p.dur>0?clamp((t-p.t0)/p.dur):1,e=easeOut(u),a=p.a,b=p.b;
  return {x:lerp(a.x,b.x,e),y:lerp(a.y,b.y,e),w:lerp(a.w,b.w,e),h:lerp(a.h,b.h,e),l:lerp(a.l,b.l,u<0?0:e)};
 }
 const target=m=>({x:m.x,y:m.y,w:m.w??4,h:m.h??4,l:m.level??.8});
 function assign(p,m){p.id=m.id;p.ref=m.ref;p.shape=m.shape||'rect';p.ch=m.ch;p.color=m.color||'ink';p.blink=!!m.blink;p.z=m.z||0;p.group=m.group;p.dying=false;}
 // Theme names or literal #rrggbb (sprite palettes come from the director).
 const paint=c=>colors[c]||(typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c)?c:colors.ink);
 function apply(next,instant){
  const t=now(),k=speed(),still=instant||!animate;
  const marks=(next.marks||[]).slice(0,3200);
  const alive=particles.filter(p=>!p.dying),used=new Set(),out=[];
  let pairs=[];
  if(next.sameKey){
   const byId=new Map(alive.map(p=>[p.id,p]));
   for(const m of marks){const p=byId.get(m.id);pairs.push([m,p]);if(p)used.add(p);}
  }else{
   // Continuity between drawings: carry particles by horizontal order.
   const order=(a,b)=>a.x-b.x||a.y-b.y;
   const from=alive.map(p=>({p,...state(p,t)})).sort(order),to=marks.map((m,i)=>({m,i,x:m.x,y:m.y})).sort(order);
   const ratio=from.length/Math.max(1,to.length);
   to.forEach((item,i)=>{const pick=from[Math.floor(i*ratio)];const p=pick&&!used.has(pick.p)?pick.p:null;if(p)used.add(p);pairs.push([item.m,p]);});
  }
  for(const [m,p] of pairs){
   const delay=(m.delay||0)*k;
   if(p){
    const cur=state(p,t),b=target(m),moved=Math.abs(cur.x-b.x)+Math.abs(cur.y-b.y)+Math.abs(cur.l-b.l)*20>.5;
    assign(p,m);
    if(still){p.a=b;p.b=b;p.dur=0;}
    else if(moved||!next.sameKey){p.a=cur;p.b=b;p.t0=t+(next.sameKey?0:80+delay*.6);p.dur=(next.sameKey?520:950)*k;}
    out.push(p);
   }else{
    const b=target(m),f=m.pop?b:m.from||{x:m.x,y:next.baseline??h};
    const p={n:serial++,a:still?b:{x:f.x,y:f.y,w:b.w,h:b.h,l:0},b,t0:m.pop?t:t+delay,dur:still?0:m.pop?110:760*k};
    assign(p,m);out.push(p);
   }
  }
  for(const p of alive)if(!used.has(p)){
   const cur=state(p,t);p.dying=true;p.ref=null;
   if(still)continue;
   if(next.swap){p.a=cur;p.b={...cur,l:0};p.t0=t;p.dur=110;out.push(p);continue;}
   p.a=cur;p.b={x:cur.x+(noise(p.n,1)-.5)*14,y:cur.y+18+noise(p.n,2)*46,w:Math.max(1,cur.w*.4),h:Math.max(1,cur.h*.4),l:0};p.t0=t+noise(p.n,3)*160;p.dur=560*k;p.shape=p.shape==='glyph'?'glyph':'dot';
   out.push(p);
  }
  particles=out;
  const seen=new Set();
  for(const s of next.texts||[]){
   seen.add(s.key);const old=texts.get(s.key),value=s.count?s.count.to:null;
   if(old&&!old.dying&&old.spec.text===s.text&&old.value===value){old.spec=s;continue;}
   texts.set(s.key,{spec:s,value,from:old?.dying?null:old?.shown||'',fromValue:old?.value??0,t0:still?-1e9:t+(s.delay||0)*k,dying:false});
  }
  for(const [name,item] of texts)if(!seen.has(name)){if(still||item.dying)texts.delete(name);else{item.dying=true;item.t0=t;}}
  live=(next.live||[]).map((x,i)=>({...x,t0:live[i]?.type===x.type?live[i].t0:t}));
  spin=next.spin?{...next.spin,t0:spin?.t0??t}:null;
  // One action per group (actor, props); an unchanged action keeps its clock.
  // A changed action keeps the old one to blend from; trails carry over.
  acts=new Map((next.motions||(next.motion?[next.motion]:[])).map(m=>{
   const old=acts.get(m.group),keep={trail:old?.trail,puffs:old?.puffs,lastFace:old?.lastFace};
   if(old&&old.type===m.type&&JSON.stringify(old.move||null)===JSON.stringify(m.move||null))return [m.group,{...m,...keep,t0:old.t0,prev:old.prev,b0:old.b0}];
   return [m.group,{...m,...keep,t0:t,prev:old&&!still?{...old,prev:null,_t:null}:null,b0:t}];
  }));
  // A pose-frame swap is not a new drawing: it must not restart the afterimage.
  settle=next.swap?Math.min(settle,t+150):t+(still?0:2600*k+Math.max(0,...marks.map(m=>m.delay||0))*k);
  wake();
 }
 function drawParticle(p,t){
  const s=state(p,t);
  if(t<p.t0&&s.l<=0)return;
  let level=s.l;
  if(p.blink)level*=Math.floor((t-born)/480)%2?.35:1;
  if(animate&&motion==='rich')level*=.86+.14*noise(p.n,Math.floor(t/90));
  if(level<=.01)return;
  let x=s.x;
  if(spin&&!p.dying){const a=(t-spin.t0)/1000*spin.speed,dx=s.x-spin.cx;x=spin.cx+dx*Math.cos(a)+p.z*Math.sin(a);level*=.65+.35*clamp(.5+(p.z*Math.cos(a)-dx*Math.sin(a))/160);}
  let y=s.y,pw=s.w,ph=s.h;
  const act=p.group&&!p.dying&&acts.get(p.group);
  if(act){const q=place(act,s,p,t);x=q.x;y=q.y;pw=q.w;ph=q.h;}
  sctx.globalAlpha=clamp(level);
  const color=paint(p.color);
  if(p.shape==='glyph'){sctx.fillStyle=color;sctx.font=`${Math.max(8,Math.round(ph*.9))}px ${FONT}`;sctx.textAlign='center';sctx.fillText(p.ch||'·',x+pw/2,y+ph*.8);return;}
  if(p.shape==='frame'){sctx.strokeStyle=color;sctx.lineWidth=1;sctx.strokeRect(Math.round(x)+.5,Math.round(y)+.5,pw,ph);return;}
  sctx.fillStyle=color;
  if(p.shape==='cell'){
   sctx.globalAlpha=clamp(level*.9);sctx.fillRect(x,y,pw,ph);
   sctx.globalAlpha=clamp(s.l);sctx.strokeStyle=color;sctx.lineWidth=1;sctx.strokeRect(Math.round(x)+.5,Math.round(y)+.5,pw-1,ph-1);
   if(p.ch&&ph>=10){sctx.fillStyle=level>.55?colors.paper:colors.ink;sctx.globalAlpha=clamp(s.l*1.1);sctx.font=`${Math.round(Math.min(ph*.62,pw*.72))}px ${FONT}`;sctx.textAlign='center';sctx.fillText(p.ch,x+pw/2,y+ph*.72);}
   return;
  }
  sctx.fillRect(x,y,pw,ph);
 }
 function drawText(item,t){
  const s=item.spec;
  let alpha=s.level??1;
  if(item.dying){const u=(t-item.t0)/260;if(u>=1)return false;alpha*=1-u;}
  else if(t<item.t0&&!item.from)return true;
  let text=s.text;
  if(s.count){const u=item.t0<0?1:easeOut(clamp((t-item.t0)/900));text=text.replace('{n}',formatCount(lerp(item.fromValue||0,s.count.to,u),s.count.kind));}
  if(!item.dying&&item.t0>0&&!s.count){
   const list=Array.from(text),old=Array.from(item.from||''),per=s.size>=18?34:16,rows=[];
   for(let i=0;i<list.length;i++){
    const at=item.t0+i*per,settled=at+110;
    if(t>=settled)rows.push(list[i]);
    else if(t>=at)rows.push(list[i]===' '?' ':SCRAMBLE[Math.floor(noise(i,Math.floor(t/45))*SCRAMBLE.length)]);
    else if(old[i]!==undefined)rows.push(old[i]);
    else break;
   }
   text=rows.join('');
  }
  if(!text)return true;
  item.shown=text;
  sctx.globalAlpha=clamp(alpha);sctx.fillStyle=paint(s.color);
  sctx.font=`${s.weight||400} ${s.size||12}px ${FONT}`;sctx.textAlign=s.align||'left';
  sctx.fillText(text,s.x,s.y);
  return true;
 }
 function drawLive(item,t){
  const color=paint(item.color||'accent');
  if(item.type==='sweep'){const u=((t-item.t0)/item.period)%1,x=lerp(item.x0,item.x1,u);sctx.globalAlpha=.85;sctx.fillStyle=color;sctx.fillRect(x,item.y0,1.5,item.y1-item.y0);sctx.globalAlpha=.18;sctx.fillRect(x-10,item.y0,10,item.y1-item.y0);}
  else if(item.type==='cursor'){if(Math.floor((t-born)/530)%2)return;sctx.globalAlpha=.9;sctx.fillStyle=color;sctx.fillRect(item.x,item.y,item.w||7,item.h||13);}
  else if(item.type==='float'){
   // Effects drift up from an anchor and fade: notes, hearts, sparkles, zzz...
   const glyphs=item.glyphs||['*'],n=item.count||6;sctx.fillStyle=color;sctx.textAlign='center';
   for(let i=0;i<n;i++){const u=(((t-item.t0)/(item.period||2400))+i/n)%1,gx=item.x+(i-(n-1)/2)*(item.spread||14)+Math.sin(u*6+i)*8,gy=item.y-u*(item.rise||60);sctx.globalAlpha=Math.sin(u*Math.PI)*.95;sctx.font=`${item.size||16}px ${FONT}`;sctx.fillText(glyphs[i%glyphs.length],gx,gy);}
  }
  else if(item.type==='rain'){sctx.fillStyle=color;for(let i=0;i<14;i++){const u=(((t-item.t0)/900)+noise(i,1))%1;sctx.globalAlpha=.55*(1-u);sctx.fillRect(item.x0+noise(i,2)*(item.x1-item.x0),item.y0+u*(item.y1-item.y0),1.5,8);}}
  else if(item.type==='dots'){sctx.fillStyle=color;for(let i=0;i<3;i++){sctx.globalAlpha=.35+.65*Math.max(0,Math.sin((t-item.t0)/220-i*.9));sctx.fillRect(item.x+i*(item.gap||9),item.y,item.size||5,item.size||5);}}
  else if(item.type==='bubbles'){
   // Rising bubbles that wobble and pop at the surface.
   sctx.strokeStyle=color;sctx.lineWidth=1;const n=item.count||12,period=item.period||5200;
   for(let i=0;i<n;i++){const u=(((t-item.t0)/period)+noise(i,7))%1,x=item.x0+noise(i,8)*(item.x1-item.x0)+Math.sin(u*9+i)*5,y=lerp(item.y1,item.y0,u),r=1.5+noise(i,9)*3.5;sctx.globalAlpha=.75*Math.sin(u*Math.PI);sctx.strokeRect(Math.round(x-r)+.5,Math.round(y-r)+.5,Math.round(r*2),Math.round(r*2));}
  }
  else if(item.type==='waves'){
   // A dotted surface line, travelling.
   sctx.fillStyle=color;const step=item.step||7,amp=item.amp||4;
   for(let x=item.x0,i=0;x<item.x1;x+=step,i++){const y=item.y+Math.sin(x/38+(t-item.t0)/520)*amp+Math.sin(x/13+(t-item.t0)/330)*amp*.35;sctx.globalAlpha=.7;sctx.fillRect(x,Math.round(y),step-3,2);}
  }
  else if(item.type==='snow'||item.type==='confetti'){
   const n=item.count||(item.type==='snow'?40:30),period=item.period||(item.type==='snow'?7000:3600),hues=['#ff6f91','#ffe08a','#98aafa','#96c4b4','#ff9f1c'];
   for(let i=0;i<n;i++){const u=(((t-item.t0)/period)+noise(i,3))%1,x=item.x0+noise(i,4)*(item.x1-item.x0)+Math.sin(u*7+i)*10,y=lerp(item.y0,item.y1,u);
    sctx.globalAlpha=.8*Math.min(1,(1-u)*4);sctx.fillStyle=item.type==='snow'?color:hues[i%hues.length];
    if(item.type==='snow')sctx.fillRect(x,y,2+noise(i,5)*2,2+noise(i,5)*2);else{const w=6*Math.abs(Math.cos(u*12+i));sctx.fillRect(x,y,Math.max(1,w),4);}}
  }
  else if(item.type==='fire'){
   // Flame particles rising from a base line, yellow to red.
   const n=item.count||26,hues=['#fff36b','#ffb84d','#ff7a3d','#e04f5f'];
   for(let i=0;i<n;i++){const u=(((t-item.t0)/900)+noise(i,11))%1,x=item.x0+noise(i,12)*(item.x1-item.x0)+Math.sin(u*8+i)*4*(1-u),y=item.y-u*(item.rise||60),s=Math.max(1,(1-u)*7);sctx.globalAlpha=.9*(1-u);sctx.fillStyle=hues[Math.min(3,Math.floor(u*4))];sctx.fillRect(x-s/2,y-s/2,s,s);}
  }
  else if(item.type==='radar'){
   // A rotating sweep with a fading wedge behind it.
   const a=((t-item.t0)/(item.period||3200))*Math.PI*2;sctx.strokeStyle=color;
   for(let k=0;k<18;k++){const b=a-k*.045;sctx.globalAlpha=.55*(1-k/18);sctx.beginPath();sctx.moveTo(item.x,item.y);sctx.lineTo(item.x+Math.cos(b)*item.r,item.y+Math.sin(b)*item.r);sctx.lineWidth=k?1:2;sctx.stroke();}
  }
  else if(item.type==='ring'){const u=((t-item.t0)%1400)/1400;sctx.globalAlpha=.8*(1-u);sctx.strokeStyle=color;sctx.lineWidth=1.5;sctx.beginPath();sctx.arc(item.x,item.y,item.r*(.4+u),0,Math.PI*2);sctx.stroke();sctx.globalAlpha=.9;sctx.fillStyle=color;sctx.fillRect(item.x-2,item.y-2,4,4);}
 }
 function drawFx(act,t){
  const size=act.size||100,trail=act.trail||[];
  if(act.fx==='bubbles'){
   sctx.strokeStyle=paint('#bfe3ff');sctx.lineWidth=1;
   trail.forEach((pt,i)=>{if(i%2)return;const age=(t-pt.t)/2200;if(age<.05||age>=1)return;const r=1.5+(i%3)*1.2+age*2,x=pt.x-pt.face*size*.42+Math.sin(age*9+i)*4,y=pt.y-age*size*.5;sctx.globalAlpha=.75*(1-age);sctx.strokeRect(Math.round(x-r)+.5,Math.round(y-r)+.5,Math.round(r*2),Math.round(r*2));});
  }else if(act.fx==='sparkles'){
   sctx.fillStyle=paint('#ffe08a');
   trail.forEach((pt,i)=>{if(i%3)return;const age=(t-pt.t)/2200;if(age<.05||age>=1)return;const s=Math.max(1,3*(1-age)),x=pt.x+Math.sin(i*1.7)*size*.35,y=pt.y+Math.cos(i*1.3)*size*.3-age*size*.3;sctx.globalAlpha=.85*(1-age);sctx.fillRect(x-s,y-.5,s*2+1,1.5);sctx.fillRect(x-.5,y-s,1.5,s*2+1);});
  }else if(act.fx==='wind'){
   const cur=trail.at(-1);if(!cur)return;sctx.fillStyle=paint('ink');
   for(let k=0;k<4;k++){const y=cur.y+(k-1.5)*size*.2,len=size*(.35+.15*((k*7)%3)),off=((t/9+k*37)%(size*.6)),x0=cur.x-cur.face*(size*.55+off);sctx.globalAlpha=.45*(1-off/(size*.6));for(let d=0;d<len;d+=6)sctx.fillRect(x0-cur.face*d,y,4,1.5);}
  }
  if(act.puffs?.length){
   sctx.fillStyle=paint('muted');
   for(const p of act.puffs){const u=(t-p.t0)/750,r=size*(.03+.09*u)*p.big;sctx.globalAlpha=.6*(1-u);sctx.beginPath();sctx.arc(p.x+p.dir*u*size*.22,act.cy-r*.6-u*size*.06,r,0,Math.PI*2);sctx.fill();}
  }
 }
 function draw(t){
  sctx.setTransform(dpr,0,0,dpr,0,0);
  sctx.globalCompositeOperation='source-over';
  // Afterimage: fade the previous frame toward the paper colour instead of clearing it.
  // A full clear once settled: 8-bit fading alone never reaches the paper colour.
  const trail=animate&&motion==='rich'&&t<settle;
  if(transparent){if(trail){sctx.globalCompositeOperation='destination-out';sctx.globalAlpha=.58;sctx.fillRect(0,0,w,h);sctx.globalCompositeOperation='source-over';}else sctx.clearRect(0,0,w,h);}
  else{sctx.globalAlpha=trail?.42:1;sctx.fillStyle=colors.paper;sctx.fillRect(0,0,w,h);}
  sctx.textBaseline='alphabetic';
  for(const act of acts.values())if(act.fx&&animate){fxStep(act,t);drawFx(act,t);}
  for(const p of particles)drawParticle(p,t);
  if(particles.length>3600||t>settle)particles=particles.filter(p=>!p.dying||t<p.t0+p.dur);
  for(const [name,item] of texts)if(drawText(item,t)===false)texts.delete(name);
  for(const item of live)drawLive(item,t);
  ctx.setTransform(1,0,0,1,0,0);ctx.globalCompositeOperation='copy';ctx.globalAlpha=1;ctx.drawImage(scene,0,0);
  if(animate&&dark&&motion==='rich'&&glow.width){
   gctx.globalCompositeOperation='copy';gctx.filter='blur(3px)';gctx.drawImage(scene,0,0,glow.width,glow.height);gctx.filter='none';
   ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.38;ctx.drawImage(glow,0,0,canvas.width,canvas.height);
  }
  ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
 }
 function frame(){
  raf=0;if(dead)return;
  const t=now(),busy=t<settle;
  // Full rate while drawings move; a calmer rate for blinking and flicker.
  if(busy||acts.size||t-last>=66){draw(t);last=t;}
  if(animate&&!document.hidden&&(busy||acts.size||live.length||spin||motion==='rich'||particles.some(p=>p.blink)))raf=requestAnimationFrame(frame);
 }
 function wake(){if(!raf&&!dead){if(animate)raf=requestAnimationFrame(frame);else{draw(now()+1e7);}}}
 function measure(){
  const rect=canvas.getBoundingClientRect();
  dpr=Math.min(2,globalThis.devicePixelRatio||1);w=Math.max(1,rect.width);h=Math.max(1,rect.height);
  for(const c of [canvas,scene]){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);}
  glow.width=Math.max(1,Math.round(w*dpr/4));glow.height=Math.max(1,Math.round(h*dpr/4));
  readColors();
 }
 const visibility=()=>{if(!document.hidden)wake();};
 document.addEventListener('visibilitychange',visibility);
 measure();
 return {
  show(nextKey,build){
   const same=nextKey===key;key=nextKey;builder=build;
   spec=build({w,h,raster});apply({...spec,sameKey:same},false);
   return spec;
  },
  resize(){
   const before=[w,h];measure();
   if(builder&&(Math.abs(before[0]-w)>1||Math.abs(before[1]-h)>1)){spec=builder({w,h,raster});apply({...spec,sameKey:true},true);}
   wake();
  },
  restyle(){readColors();wake();},
  setOptions(next){animate=next.animate!==false;motion=next.motion||motion;if(!animate&&raf){cancelAnimationFrame(raf);raf=0;}if(builder){spec=builder({w,h,raster});apply({...spec,sameKey:true},!animate);}wake();},
  hit(x,y){
   let best=null,dist=12;
   for(const p of particles){if(p.dying||!p.ref)continue;const s=state(p,now()),d=Math.hypot(s.x+s.w/2-x,s.y+s.h/2-y);if(d<dist){dist=d;best=p.ref;}}
   return best;
  },
  get count(){return particles.length;},
  destroy(){dead=true;if(raf)cancelAnimationFrame(raf);document.removeEventListener('visibilitychange',visibility);}
 };
}
module.exports={createEngine,raster,pose};

},
"./sprite-rig.cjs": function(module,exports,require){
'use strict';
// Vector actors. An actor is described as named parts (body, head, tail, fins,
// wings, arms, legs…) built from simple shapes on a W×H grid. This file
// validates such a rig and rasterizes it to pixel rows at any part pose, so an
// action moves limbs, tails and fins instead of only swapping two drawings.
// Pure: shared by the host (validation) and the browser (drawing).
const ROLES=['body','head','tail','fin','wing_l','wing_r','arm_l','arm_r','leg_l','leg_r','ear','eye','other'];
const LIMIT={min:10,max:48,parts:14,shapes:90,path:7000,colors:10};
const num=(v,d=0)=>typeof v==='number'&&Number.isFinite(v)?v:d;
const clampN=(v,a,b,d=a)=>Math.max(a,Math.min(b,num(v,d)));
const hex=v=>{const t=String(v||'').trim();if(/^#[0-9a-f]{6}$/i.test(t))return t.toLowerCase();if(/^#[0-9a-f]{3}$/i.test(t))return ('#'+[...t.slice(1)].map(c=>c+c).join('')).toLowerCase();return null;};

// ---- SVG path → polygons (absolute and relative M L H V C S Q T Z; A as a line).
function parsePath(d,map=(x,y)=>[x,y]){
 const tokens=String(d||'').slice(0,LIMIT.path).match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/g)||[];
 const polys=[];let poly=null,cmd='M',i=0,x=0,y=0,sx=0,sy=0,cx=0,cy=0,prev='';
 const n=()=>{const v=parseFloat(tokens[i++]);return Number.isFinite(v)?v:0;};
 const push=(px,py)=>{if(!poly){poly=[];polys.push(poly);}poly.push(map(px,py));};
 const curve=(pts,steps=8)=>{for(let k=1;k<=steps;k++){const t=k/steps,u=1-t;let px,py;
  if(pts.length===4){px=u*u*u*pts[0][0]+3*u*u*t*pts[1][0]+3*u*t*t*pts[2][0]+t*t*t*pts[3][0];py=u*u*u*pts[0][1]+3*u*u*t*pts[1][1]+3*u*t*t*pts[2][1]+t*t*t*pts[3][1];}
  else{px=u*u*pts[0][0]+2*u*t*pts[1][0]+t*t*pts[2][0];py=u*u*pts[0][1]+2*u*t*pts[1][1]+t*t*pts[2][1];}
  push(px,py);}};
 let guard=0;
 while(i<tokens.length&&guard++<20000){
  if(/[A-Za-z]/.test(tokens[i]))cmd=tokens[i++];
  const rel=cmd===cmd.toLowerCase(),C=cmd.toUpperCase(),ox=rel?x:0,oy=rel?y:0;
  if(C==='Z'){if(poly&&poly.length)poly=null;x=sx;y=sy;prev='Z';continue;}
  if(i>=tokens.length||/[A-Za-z]/.test(tokens[i])){i++;continue;}
  if(C==='M'){x=ox+n();y=oy+n();sx=x;sy=y;poly=null;push(x,y);cmd=rel?'l':'L';}
  else if(C==='L'){x=ox+n();y=oy+n();push(x,y);}
  else if(C==='H'){x=(rel?x:0)+n();push(x,y);}
  else if(C==='V'){y=(rel?y:0)+n();push(x,y);}
  else if(C==='C'){const a=[ox+n(),oy+n()],b=[ox+n(),oy+n()],e=[ox+n(),oy+n()];curve([[x,y],a,b,e]);cx=b[0];cy=b[1];x=e[0];y=e[1];}
  else if(C==='S'){const a=prev==='C'||prev==='S'?[2*x-cx,2*y-cy]:[x,y],b=[ox+n(),oy+n()],e=[ox+n(),oy+n()];curve([[x,y],a,b,e]);cx=b[0];cy=b[1];x=e[0];y=e[1];}
  else if(C==='Q'){const a=[ox+n(),oy+n()],e=[ox+n(),oy+n()];curve([[x,y],a,e]);cx=a[0];cy=a[1];x=e[0];y=e[1];}
  else if(C==='T'){const a=prev==='Q'||prev==='T'?[2*x-cx,2*y-cy]:[x,y],e=[ox+n(),oy+n()];curve([[x,y],a,e]);cx=a[0];cy=a[1];x=e[0];y=e[1];}
  else if(C==='A'){n();n();n();n();n();x=ox+n();y=oy+n();push(x,y);}
  else{i++;}
  prev=C;
 }
 return polys.filter(p=>p.length>=3);
}
function winding(polys,x,y){
 let w=0;
 for(const poly of polys)for(let k=0;k<poly.length;k++){
  const [x1,y1]=poly[k],[x2,y2]=poly[(k+1)%poly.length];
  if(y1<=y){if(y2>y&&(x2-x1)*(y-y1)-(x-x1)*(y2-y1)>0)w++;}
  else if(y2<=y&&(x2-x1)*(y-y1)-(x-x1)*(y2-y1)<0)w--;
 }
 return w;
}
const evenOdd=(polys,x,y)=>{let inside=false;for(const poly of polys)for(let k=0,j=poly.length-1;k<poly.length;j=k++){const [xi,yi]=poly[k],[xj,yj]=poly[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;}return inside;};
const bboxOf=pts=>{let a=Infinity,b=Infinity,c=-Infinity,d=-Infinity;for(const [x,y] of pts){a=Math.min(a,x);b=Math.min(b,y);c=Math.max(c,x);d=Math.max(d,y);}return [a,b,c,d];};

// ---- Shapes. Each compiles to {c, box:[x0,y0,x1,y1], hit(x,y)}.
function shape(raw,colors,w,h){
 if(!raw||typeof raw!=='object')return null;
 const c=typeof raw.c==='string'&&colors[raw.c]?raw.c:null;
 if(!c)return null;
 const lim=v=>clampN(v,-w*2,w*3);
 let out=null;
 const arr=(v,n)=>Array.isArray(v)&&v.length>=n&&v.slice(0,n).every(x=>typeof x==='number'&&Number.isFinite(x))?v.map(lim):null;
 if(arr(raw.rect,4)){const [x,y,rw,rh]=arr(raw.rect,4);out={box:[x,y,x+Math.abs(rw),y+Math.abs(rh)],hit:(px,py)=>px>=x&&px<x+Math.abs(rw)&&py>=y&&py<y+Math.abs(rh)};}
 else if(arr(raw.circle,3)){const [x,y,r]=arr(raw.circle,3),rr=Math.abs(r);out={box:[x-rr,y-rr,x+rr,y+rr],hit:(px,py)=>(px-x)**2+(py-y)**2<=rr*rr};}
 else if(arr(raw.ellipse,4)){
  const e=arr(raw.ellipse,4),[x,y]=e,rx=Math.abs(e[2])||.5,ry=Math.abs(e[3])||.5,a=num(raw.ellipse[4])*Math.PI/180,co=Math.cos(a),si=Math.sin(a),m=Math.max(rx,ry);
  out={box:[x-m,y-m,x+m,y+m],hit:(px,py)=>{const dx=px-x,dy=py-y,u=dx*co+dy*si,v=-dx*si+dy*co;return (u/rx)**2+(v/ry)**2<=1;}};
 }
 else if(Array.isArray(raw.poly)&&raw.poly.length>=6){
  const flat=raw.poly.slice(0,80).map(lim),pts=[];for(let k=0;k+1<flat.length;k+=2)pts.push([flat[k],flat[k+1]]);
  out={box:bboxOf(pts),hit:(px,py)=>winding([pts],px,py)!==0};
 }
 else if(arr(raw.line,4)){
  const [x1,y1,x2,y2]=arr(raw.line,4),r=clampN(raw.line[4],.5,8,1)/2,L=(x2-x1)**2+(y2-y1)**2||1e-9;
  out={box:[Math.min(x1,x2)-r,Math.min(y1,y2)-r,Math.max(x1,x2)+r,Math.max(y1,y2)+r],hit:(px,py)=>{const t=Math.max(0,Math.min(1,((px-x1)*(x2-x1)+(py-y1)*(y2-y1))/L));return (px-x1-t*(x2-x1))**2+(py-y1-t*(y2-y1))**2<=r*r;}};
 }
 else if(typeof raw.path==='string'){
  // Optional mapping of the path's own coordinates: vb [x,y,w,h] → to [x,y,w,h].
  const vb=arr(raw.vb,4),to=arr(raw.to,4);
  const map=vb&&to&&vb[2]&&vb[3]?(x,y)=>[to[0]+(x-vb[0])*to[2]/vb[2],to[1]+(y-vb[1])*to[3]/vb[3]]:(x,y)=>[x,y];
  let polys=parsePath(raw.path,map);
  if(raw.rule==='outer')polys=polys.slice(0,1);
  if(!polys.length)return null;
  const rule=raw.rule==='evenodd'?(px,py)=>evenOdd(polys,px,py):(px,py)=>winding(polys,px,py)!==0;
  out={box:bboxOf(polys.flat()),hit:rule};
 }
 if(!out)return null;
 // A clip rectangle keeps part of a shape (one path split into body and tail).
 const clip=arr(raw.clip,4);
 if(clip){const [x,y,cw,ch]=clip,hit=out.hit;out.hit=(px,py)=>px>=x&&px<x+cw&&py>=y&&py<y+ch&&hit(px,py);out.box=[Math.max(out.box[0],x),Math.max(out.box[1],y),Math.min(out.box[2],x+cw),Math.min(out.box[3],y+ch)];}
 return {c,...out,raw};
}

// ---- Rig validation. Returns {w,h,palette,outline,facing,view,parts} or null.
function compileRig(raw){
 if(!raw||typeof raw!=='object'||!Array.isArray(raw.parts))return null;
 const size=Array.isArray(raw.size)?raw.size:[raw.w,raw.h];
 const w=Math.round(clampN(size[0],LIMIT.min,LIMIT.max,32)),h=Math.round(clampN(size[1],LIMIT.min,LIMIT.max,32));
 const palette={};
 for(const [k,v] of Object.entries(raw.palette||{}).slice(0,LIMIT.colors)){const c=hex(v);if(/^[a-z]$/i.test(k)&&c)palette[k]=c;}
 if(!Object.keys(palette).length)return null;
 let total=0;
 const parts=raw.parts.slice(0,LIMIT.parts).map((p,i)=>{
  if(!p||typeof p!=='object'||!Array.isArray(p.shapes))return null;
  const shapes=[];
  for(const s of p.shapes){if(total>=LIMIT.shapes)break;const c=shape(s,palette,w,h);if(c){shapes.push(c);total++;}}
  if(!shapes.length)return null;
  const role=ROLES.includes(p.role)?p.role:'other';
  const pivot=Array.isArray(p.pivot)?[clampN(p.pivot[0],-w,w*2,w/2),clampN(p.pivot[1],-h,h*2,h/2)]:[w/2,h/2];
  return {role,pivot,z:clampN(p.z,-9,9,0),order:i,shapes};
 }).filter(Boolean).sort((a,b)=>a.z-b.z||a.order-b.order);
 if(!parts.length)return null;
 const outline=typeof raw.outline==='string'&&palette[raw.outline]?raw.outline:null;
 return {w,h,palette,outline,facing:raw.facing==='left'?'left':'right',view:raw.view==='side'?'side':'front',parts};
}
// The JSON form of a compiled rig (what is stored and sent back to the model).
function rigJson(rig){
 return {size:[rig.w,rig.h],palette:rig.palette,outline:rig.outline,facing:rig.facing,view:rig.view,
  parts:rig.parts.map(p=>({role:p.role,pivot:p.pivot,z:p.z,shapes:p.shapes.map(s=>s.raw)}))};
}

// ---- Rasterization. 3×3 samples per cell; the topmost colour that covers at
// least a third of the cell wins (so eyes and stripes survive), else the
// majority. An outline colour, when set, rings the drawing one cell outside.
function rasterize(rig,angles=[]){
 const pad=rig.outline?1:0,W=rig.w+pad*2,H=rig.h+pad*2,grid=[];
 const parts=rig.parts.map((p,i)=>{const a=-(angles[i]||0)*Math.PI/180;return {p,co:Math.cos(a),si:Math.sin(a),rad:a};});
 const sample=(x,y)=>{
  for(let k=parts.length-1;k>=0;k--){
   const {p,co,si}=parts[k],dx=x-p.pivot[0],dy=y-p.pivot[1],px=p.pivot[0]+dx*co-dy*si,py=p.pivot[1]+dx*si+dy*co;
   for(let j=p.shapes.length-1;j>=0;j--){const s=p.shapes[j];if(px<s.box[0]||px>s.box[2]||py<s.box[1]||py>s.box[3])continue;if(s.hit(px,py))return {c:s.c,o:k*1000+j};}
  }
  return null;
 };
 for(let y=0;y<H;y++){
  let row='';
  for(let x=0;x<W;x++){
   const hits=[];
   for(let j=0;j<3;j++)for(let i=0;i<3;i++){const s=sample(x-pad+(i+.5)/3,y-pad+(j+.5)/3);if(s)hits.push(s);}
   if(!hits.length){row+='.';continue;}
   const by=new Map();for(const s of hits){const e=by.get(s.c)||{n:0,o:-1};e.n++;e.o=Math.max(e.o,s.o);by.set(s.c,e);}
   const list=[...by].sort((a,b)=>b[1].o-a[1].o);
   const top=list.find(([,e])=>e.n>=3);
   if(top)row+=top[0];
   else if(hits.length>=5)row+=list.sort((a,b)=>b[1].n-a[1].n)[0][0];
   else row+='.';
  }
  grid.push(row);
 }
 if(pad){
  const out=grid.map(r=>[...r]);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(grid[y][x]==='.'&&[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>{const c=grid[y+dy]?.[x+dx];return c&&c!=='.'&&c!==rig.outline;}))out[y][x]=rig.outline;
  return out.map(r=>r.join(''));
 }
 return grid;
}

// ---- Part animation. Angles (degrees, clockwise) per role for each action:
// [amplitude, phase offset, base]. Paired roles alternate by half a cycle; in a
// front view the left side mirrors the right.
const ANIM={
 idle:{tail:[8],fin:[8,.5],ear:[4,.25],wing:[4]},
 think:{head:[4,0,8],tail:[6],fin:[5],ear:[3]},
 type:{arm:[14,0,-12],tail:[6],fin:[6]},
 nod:{head:[10,0,6],tail:[6],ear:[5]},
 wave:{arm_r:[28,0,-125],wing_r:[30,0,-35],fin:[22],tail:[14],ear:[6]},
 dance:{arm:[38,0,-60],leg:[18],head:[10],tail:[26],wing:[32],fin:[26],ear:[10]},
 jump:{arm:[16,0,-135],wing:[36],leg:[12],tail:[20],fin:[20]},
 happy:{arm:[18,0,-120],wing:[30],tail:[24],fin:[22],ear:[10],head:[6]},
 cheer:{arm:[22,0,-150],wing:[40],tail:[24],fin:[24],leg:[10]},
 hop:{leg:[20],arm:[16,0,-40],tail:[18],fin:[16],wing:[20],ear:[10]},
 bounce:{leg:[16],arm:[20,0,-90],tail:[20],fin:[18],wing:[24],ear:[12]},
 spin:{arm:[12,0,-70],tail:[16],fin:[14],wing:[16]},
 roll:{tail:[14],fin:[12],arm:[10,0,-30],leg:[10]},
 flip:{arm:[10,0,-150],leg:[14],tail:[18],fin:[16],wing:[24]},
 shake:{arm:[10,0,-110],ear:[16],tail:[28],fin:[20],head:[8]},
 surprised:{arm:[12,0,-140],ear:[14],tail:[20],wing:[26]},
 sleep:{tail:[3],head:[2,0,14],ear:[2,0,10]},
 sad:{head:[3,0,16],arm:[3,0,12],tail:[3,0,18],ear:[3,0,22],fin:[3,0,10]},
 walk:{leg:[22],arm:[18],tail:[12],head:[3],fin:[10],wing:[6],ear:[5]},
 run:{leg:[36],arm:[30],tail:[18],head:[4],fin:[16],wing:[10],ear:[8]},
 crawl:{leg:[14],arm:[18,0,-20],tail:[10],fin:[10]},
 swim:{tail:[26],fin:[20,.25],wing:[22],arm:[32],leg:[22],ear:[5]},
 dive:{tail:[22],fin:[16,.25],arm:[10,0,-150],leg:[10]},
 fly:{wing:[42],arm:[40,0,-60],fin:[26],tail:[12],leg:[8,0,-15]},
 hover:{wing:[30],fin:[16],tail:[10],arm:[12,0,-35]},
 grow:{arm:[20,0,-90],wing:[20],fin:[16],tail:[14]},
 explode:{arm:[30,0,-90],leg:[20],tail:[30],fin:[30],wing:[30]},
 sing:{head:[8],arm_r:[16,0,-70],tail:[12],fin:[12],wing:[14]},
 eat:{head:[12,0,8],tail:[10],fin:[10]},
 bow:{head:[5,0,22],arm:[5,0,18],tail:[6]}
};
const ACTION_NAMES=Object.keys(ANIM);
function roleSpec(table,role){
 if(table[role])return {spec:table[role],alt:0,mirror:false};
 const m=/^(arm|leg|wing)_([lr])$/.exec(role);
 if(m&&table[m[1]])return {spec:table[m[1]],alt:m[2]==='l'?.5:0,mirror:m[2]==='l'};
 return null;
}
// Angles for every part at phase u (0..1). `custom` is a move's part table:
// {role:[from,to]} oscillating between the two angles.
function partAngles(rig,action,u,custom=null){
 const table=ANIM[action]||ANIM.idle,TAU=Math.PI*2;
 return rig.parts.map(p=>{
  const own=custom&&(custom[p.role]||custom[p.role.replace(/_[lr]$/,'')]);
  if(Array.isArray(own)&&own.length>=2){
   const [a,b]=own.map(v=>clampN(v,-180,180,0)),mid=(a+b)/2,half=(b-a)/2,left=/_l$/.test(p.role)&&!custom[p.role];
   const v=mid+half*Math.sin(TAU*(u+(left?.5:0)));
   return left&&rig.view==='front'?-v:v;
  }
  const r=roleSpec(table,p.role);if(!r)return 0;
  const [amp=0,off=0,base=0]=r.spec,v=base+amp*Math.sin(TAU*(u+off+r.alt));
  return r.mirror&&rig.view==='front'?-v:v;
 });
}
const cache=new WeakMap();
// Pixel frames of one action: `count` evenly spaced phases of its cycle.
function framesFor(rig,action='idle',count=4,custom=null){
 let byAction=cache.get(rig);if(!byAction){byAction=new Map();cache.set(rig,byAction);}
 const key=action+'|'+count+'|'+(custom?JSON.stringify(custom):'');
 if(!byAction.has(key)){
  if(byAction.size>40)byAction.clear();
  byAction.set(key,Array.from({length:count},(_,k)=>rasterize(rig,partAngles(rig,action,k/count,custom))));
 }
 return byAction.get(key);
}
module.exports={ROLES,ACTION_NAMES,ANIM,parsePath,compileRig,rigJson,rasterize,partAngles,framesFor,hex};

},
"./sprite-presets.cjs": function(module,exports,require){
'use strict';
// Built-in cast, drawn as vector rigs (see sprite-rig.cjs). The director picks
// one by id when the user's subject matches, optionally recolouring it through
// the palette keys listed in PRESET_KEYS. The whale is DeepSeek's own mark: its
// outline is read at runtime from the host's favicon (never copied here); a
// hand-drawn whale of the same pose stands in when that is unavailable.
const {compileRig,rasterize,hex}=require('./sprite-rig.cjs');

const P=(palette,outline,parts,extra={})=>({palette,outline,parts,...extra});
const S={
 fish:P({o:'#ff8c42',y:'#ffd166',s:'#e85d04',w:'#ffffff',e:'#1b1430',k:'#2b1d3a'},'k',[
  {role:'tail',pivot:[9,11],z:-1,shapes:[{poly:[10,11,1,2.5,3.5,11,1,19.5],c:'s'}]},
  {role:'fin',pivot:[16,5],z:-1,shapes:[{poly:[11,5.5,15,0.5,22,5],c:'s'}]},
  {role:'body',pivot:[17,11],shapes:[{ellipse:[18,11,10,7.2],c:'o'},{ellipse:[19,13.8,7.5,3.4],c:'y'},{ellipse:[13.5,11,1.1,6],c:'s'},{ellipse:[17.5,11,1.1,6.6],c:'s'},{circle:[23.5,9,1.8],c:'w'},{circle:[24,9,0.95],c:'e'}]},
  {role:'fin',pivot:[17,12.5],z:2,shapes:[{poly:[16,12.5,21,16.5,15,16],c:'s'}]}
 ],{size:[30,22],facing:'right',view:'side'}),
 cat:P({o:'#f4a259',d:'#c46d2b',w:'#fff3e0',p:'#ff8fab',e:'#2d1e2f',k:'#2d1e2f'},'k',[
  {role:'tail',pivot:[7,14],z:-2,shapes:[{line:[7.5,14.5,3,9,2.4],c:'o'},{line:[3,9,4.5,3,2.4],c:'o'},{circle:[4.5,3,1.3],c:'d'}]},
  {role:'leg_r',pivot:[10,18],z:-1,shapes:[{rect:[8.6,17,2.8,7],c:'d'}]},
  {role:'leg_l',pivot:[23,18],z:-1,shapes:[{rect:[21.6,17,2.8,7],c:'d'}]},
  {role:'body',pivot:[17,16],shapes:[{ellipse:[16.5,16,10,5.6],c:'o'},{ellipse:[17.5,18.6,7,2.4],c:'w'},{ellipse:[13,11.6,1,2.6],c:'d'},{ellipse:[17,11.2,1,2.8],c:'d'}]},
  {role:'leg_l',pivot:[12,18],z:1,shapes:[{rect:[10.6,17,2.8,7],c:'o'},{rect:[10.4,23,3.2,1.2],c:'w'}]},
  {role:'leg_r',pivot:[25,18],z:1,shapes:[{rect:[23.6,17,2.8,7],c:'o'},{rect:[23.4,23,3.2,1.2],c:'w'}]},
  {role:'head',pivot:[25,13],z:2,shapes:[{poly:[22.5,7,23,1.5,27,5],c:'o'},{poly:[28,5,31.5,1.5,32,7],c:'o'},{poly:[23.4,6,23.7,3.2,25.8,5],c:'p'},{poly:[29.2,5,31,3.2,31.2,6],c:'p'},{circle:[27.5,9.5,5.4],c:'o'},{ellipse:[30.5,11.8,2.4,1.7],c:'w'},{circle:[29.5,8.5,0.95],c:'e'},{circle:[32.4,11,0.75],c:'p'}]}
 ],{size:[34,25],facing:'right',view:'side'}),
 dog:P({b:'#c68642',d:'#8b5a2b',w:'#fff1dc',e:'#231815',n:'#231815',k:'#2a1a12'},'k',[
  {role:'tail',pivot:[7,13],z:-2,shapes:[{line:[7.5,13.5,3,8,2.6],c:'b'},{circle:[3,8,1.4],c:'w'}]},
  {role:'leg_r',pivot:[10,19],z:-1,shapes:[{rect:[8.5,18,3,7],c:'d'}]},
  {role:'leg_l',pivot:[23,19],z:-1,shapes:[{rect:[21.5,18,3,7],c:'d'}]},
  {role:'body',pivot:[17,16],shapes:[{ellipse:[16.5,16.5,10.5,6],c:'b'},{ellipse:[18,19.5,7,2.4],c:'w'},{ellipse:[12,13.5,3.5,2.5],c:'d'}]},
  {role:'leg_l',pivot:[12,19],z:1,shapes:[{rect:[10.5,18,3,7],c:'b'},{rect:[10.3,24,3.4,1.2],c:'w'}]},
  {role:'leg_r',pivot:[25,19],z:1,shapes:[{rect:[23.5,18,3,7],c:'b'},{rect:[23.3,24,3.4,1.2],c:'w'}]},
  {role:'head',pivot:[25,13],z:2,shapes:[{circle:[27,9,5.2],c:'b'},{ellipse:[32,11,3.6,2.4],c:'w'},{circle:[35,10.4,1.1],c:'n'},{circle:[28.5,7.5,0.95],c:'e'}]},
  {role:'ear',pivot:[24.5,6],z:3,shapes:[{ellipse:[24,9,2,4.2,15],c:'d'}]}
 ],{size:[37,26],facing:'right',view:'side'}),
 bird:P({b:'#4d9de0',d:'#2e6fae',y:'#ffe08a',o:'#ff9f1c',e:'#1b1b2f',w:'#ffffff',k:'#1b2a44'},'k',[
  {role:'tail',pivot:[7,16],z:-1,shapes:[{poly:[8,14,0.5,10.5,1.5,17.5,8,18.5],c:'d'}]},
  {role:'leg_l',pivot:[13,20],z:-1,shapes:[{line:[13,20,12,25,1.2],c:'o'},{line:[11,25,13.5,25,1],c:'o'}]},
  {role:'leg_r',pivot:[16,20],z:-1,shapes:[{line:[16,20,17,25,1.2],c:'o'},{line:[16,25,18.5,25,1],c:'o'}]},
  {role:'body',pivot:[14,15],shapes:[{ellipse:[14,15,8,6],c:'b'},{ellipse:[15.5,17.5,5.5,3.4],c:'y'}]},
  {role:'head',pivot:[20,12],z:1,shapes:[{circle:[21,9,5],c:'b'},{poly:[25.3,7.6,30,9.4,25.3,11.2],c:'o'},{circle:[23,7.5,1.4],c:'w'},{circle:[23.5,7.5,0.85],c:'e'}]},
  {role:'wing_r',pivot:[12,13],z:2,shapes:[{ellipse:[11,15.5,6,3.6,-18],c:'d'}]}
 ],{size:[30,26],facing:'right',view:'side'}),
 rabbit:P({w:'#f8f8ff',g:'#d6d9ea',p:'#ffb3c6',e:'#2b2440',k:'#3a3550'},'k',[
  {role:'ear',pivot:[11,12],z:-1,shapes:[{ellipse:[10,6.5,2.6,6.8,-8],c:'w'},{ellipse:[10,7,1.2,4.8,-8],c:'p'}]},
  {role:'ear',pivot:[17,12],z:-1,shapes:[{ellipse:[18,6.5,2.6,6.8,8],c:'w'},{ellipse:[18,7,1.2,4.8,8],c:'p'}]},
  {role:'leg_l',pivot:[11,31],z:-1,shapes:[{ellipse:[10,33,3.2,1.8],c:'w'}]},
  {role:'leg_r',pivot:[17,31],z:-1,shapes:[{ellipse:[18,33,3.2,1.8],c:'w'}]},
  {role:'body',pivot:[14,27],shapes:[{ellipse:[14,27,6.8,6.2],c:'w'},{ellipse:[14,28.5,4,4],c:'g'}]},
  {role:'arm_l',pivot:[9,24],z:1,shapes:[{ellipse:[8.6,27,1.8,3.4],c:'w'}]},
  {role:'arm_r',pivot:[19,24],z:1,shapes:[{ellipse:[19.4,27,1.8,3.4],c:'w'}]},
  {role:'head',pivot:[14,21],z:2,shapes:[{circle:[14,16.5,7],c:'w'},{rect:[11,14.6,1,2],c:'e'},{rect:[16,14.6,1,2],c:'e'},{circle:[14,18.5,0.85],c:'p'},{circle:[9.6,18.6,1.1],c:'p'},{circle:[18.4,18.6,1.1],c:'p'}]}
 ],{size:[28,36],facing:'right',view:'front'}),
 robot:P({g:'#8fa3c7',l:'#d7e1f5',d:'#5a6b8c',y:'#fff36b',r:'#e04f5f',k:'#1b1f3b'},'k',[
  {role:'leg_l',pivot:[11,26],z:-1,shapes:[{rect:[9,26,4,7],c:'d'},{rect:[8,32,6,2],c:'k'}]},
  {role:'leg_r',pivot:[19,26],z:-1,shapes:[{rect:[17,26,4,7],c:'d'},{rect:[16,32,6,2],c:'k'}]},
  {role:'arm_l',pivot:[6.5,16.5],z:-1,shapes:[{rect:[3,16,3.6,9],c:'g'},{circle:[4.8,26,1.8],c:'d'}]},
  {role:'arm_r',pivot:[23.5,16.5],z:-1,shapes:[{rect:[23.4,16,3.6,9],c:'g'},{circle:[25.2,26,1.8],c:'d'}]},
  {role:'body',pivot:[15,20],shapes:[{rect:[7,15,16,11],c:'g'},{rect:[10.5,17.5,9,6],c:'l'},{circle:[15,20.5,1.4],c:'r'}]},
  {role:'head',pivot:[15,14],z:1,shapes:[{line:[15,4,15,1.5,1],c:'d'},{circle:[15,1.5,1.3],c:'r'},{rect:[8,4,14,10],c:'g'},{rect:[10,6,10,6],c:'l'},{rect:[11,7.5,2.2,2.2],c:'y'},{rect:[16.8,7.5,2.2,2.2],c:'y'},{rect:[12.5,10.6,5,1],c:'k'}]}
 ],{size:[30,35],facing:'right',view:'front'}),
 person:P({s:'#ffd7b5',h:'#3b2a20',c:'#4d6bfe',j:'#2b3a67',m:'#c0566b',e:'#1d1d2b',k:'#1d1d2b'},'k',[
  {role:'leg_l',pivot:[11,26],z:-1,shapes:[{rect:[8.6,26,4,10.5],c:'j'},{rect:[8,36,5,2],c:'e'}]},
  {role:'leg_r',pivot:[15,26],z:-1,shapes:[{rect:[13.4,26,4,10.5],c:'j'},{rect:[13,36,5,2],c:'e'}]},
  {role:'arm_l',pivot:[8,15.5],z:1,shapes:[{rect:[5,14.8,3,9.5],c:'c'},{circle:[6.5,25.4,1.6],c:'s'}]},
  {role:'arm_r',pivot:[18,15.5],z:1,shapes:[{rect:[18,14.8,3,9.5],c:'c'},{circle:[19.5,25.4,1.6],c:'s'}]},
  {role:'body',pivot:[13,20],shapes:[{rect:[8,14,10,12.5],c:'c'},{rect:[11.5,14,3,2],c:'s'}]},
  {role:'head',pivot:[13,13.5],z:2,shapes:[{circle:[13,8,5.4],c:'s'},{ellipse:[13,3.8,6,2.9],c:'h'},{rect:[7.3,3.8,2,4.4],c:'h'},{rect:[16.7,3.8,2,4.4],c:'h'},{circle:[10.5,8.5,0.85],c:'e'},{circle:[15.5,8.5,0.85],c:'e'},{line:[12,11.5,14,11.5,0.9],c:'m'}]}
 ],{size:[26,39],facing:'right',view:'front'}),
 ghost:P({w:'#eef2ff',g:'#c5cdf0',e:'#1c1a33',p:'#ffb3c6',k:'#3d3a66'},'k',[
  {role:'arm_l',pivot:[5,14],z:-1,shapes:[{ellipse:[3.2,15.5,2.6,1.6,-30],c:'w'}]},
  {role:'arm_r',pivot:[21,14],z:-1,shapes:[{ellipse:[22.8,15.5,2.6,1.6,30],c:'w'}]},
  {role:'body',pivot:[13,14],shapes:[{circle:[13,11,9],c:'w'},{rect:[4,11,18,13],c:'w'},{circle:[6.2,24,2.2],c:'w'},{circle:[10.7,24.6,2.2],c:'w'},{circle:[15.3,24,2.2],c:'w'},{circle:[19.8,24.6,2.2],c:'w'},{ellipse:[17,6,2,1.2,-30],c:'g'},{ellipse:[10,11,1.3,2],c:'e'},{ellipse:[16,11,1.3,2],c:'e'},{ellipse:[13,15.6,1.4,1.9],c:'e'},{circle:[7.5,14.4,1.1],c:'p'},{circle:[18.5,14.4,1.1],c:'p'}]}
 ],{size:[26,28],facing:'right',view:'front'}),
 octopus:P({p:'#ff6b9a',d:'#d94a7a',l:'#ffc2d6',w:'#ffffff',e:'#2a1530',k:'#3b1530'},'k',[
  {role:'leg_l',pivot:[8,17],z:-1,shapes:[{line:[8,17,5,24,3],c:'d'},{circle:[5,25,1.6],c:'d'}]},
  {role:'leg_r',pivot:[12.5,18],z:-1,shapes:[{line:[12.5,18,11.5,26,3],c:'p'},{circle:[11.5,27,1.6],c:'p'}]},
  {role:'leg_l',pivot:[17.5,18],z:-1,shapes:[{line:[17.5,18,18.5,26,3],c:'p'},{circle:[18.5,27,1.6],c:'p'}]},
  {role:'leg_r',pivot:[22,17],z:-1,shapes:[{line:[22,17,25,24,3],c:'d'},{circle:[25,25,1.6],c:'d'}]},
  {role:'body',pivot:[15,12],shapes:[{ellipse:[15,10.5,9.5,8.5],c:'p'},{circle:[11,5.5,1.3],c:'l'},{circle:[19,4.5,0.9],c:'l'},{circle:[11.5,11,1.8],c:'w'},{circle:[18.5,11,1.8],c:'w'},{circle:[11.8,11.2,0.95],c:'e'},{circle:[18.8,11.2,0.95],c:'e'},{ellipse:[15,15.2,1.6,1],c:'d'}]}
 ],{size:[30,29],facing:'right',view:'front'}),
 rocket:P({w:'#eef2ff',g:'#b8c2dc',r:'#e04f5f',b:'#4d6bfe',l:'#b9c8ff',o:'#ff9f1c',y:'#ffe08a',k:'#1d2340'},'k',[
  {role:'tail',pivot:[11,28],z:-2,shapes:[{poly:[7.5,28,11,36,14.5,28],c:'o'},{poly:[9.2,28,11,32.5,12.8,28],c:'y'}]},
  {role:'fin',pivot:[6,22],z:-1,shapes:[{poly:[6,19,1,28,6,26.5],c:'r'}]},
  {role:'fin',pivot:[16,22],z:-1,shapes:[{poly:[16,19,21,28,16,26.5],c:'r'}]},
  {role:'body',pivot:[11,15],shapes:[{ellipse:[11,15.5,5.6,13],c:'w'},{rect:[5,24,12,4.5],c:'g'},{ellipse:[11,4.5,3.4,4.5],c:'r'},{circle:[11,13,2.8],c:'b'},{circle:[10.2,12.2,1],c:'l'}]}
 ],{size:[22,36],facing:'right',view:'front'}),
 eggplant:P({p:'#6b2fa0',l:'#9a5fd0',g:'#3f8a3a',d:'#2c6b2a',w:'#ffffff',e:'#1d0f2b',k:'#2a1035'},'k',[
  {role:'arm_l',pivot:[5.5,18],z:-1,shapes:[{line:[5.5,18,1.5,22.5,1.6],c:'p'}]},
  {role:'arm_r',pivot:[18.5,18],z:-1,shapes:[{line:[18.5,18,22.5,22.5,1.6],c:'p'}]},
  {role:'leg_l',pivot:[9,29],z:-1,shapes:[{line:[9,29,8,33,1.6],c:'p'},{line:[6.5,33,9,33,1.2],c:'p'}]},
  {role:'leg_r',pivot:[15,29],z:-1,shapes:[{line:[15,29,16,33,1.6],c:'p'},{line:[15,33,17.5,33,1.2],c:'p'}]},
  {role:'body',pivot:[12,19],shapes:[{ellipse:[12,19.5,7.4,10.5,-8],c:'p'},{ellipse:[8.6,16,1.4,4,-8],c:'l'},{circle:[10,18.5,1.4],c:'w'},{circle:[14.5,18.5,1.4],c:'w'},{circle:[10.5,18.5,0.85],c:'e'},{circle:[14.5,18.5,0.85],c:'e'},{line:[11,22,13.6,22,0.9],c:'e'}]},
  {role:'head',pivot:[12,9.5],z:1,shapes:[{rect:[11.2,1.5,2.2,6],c:'d'},{poly:[5.5,10.5,8.5,6.5,12,9,15.5,6.5,18.5,10.5,12,12],c:'g'}]}
 ],{size:[24,34],facing:'right',view:'front'})
};
// The whale: DeepSeek's mark (50×50 favicon path), split into body and tail so
// the tail can beat. Holes in the mark show the light belly colour.
const WHALE_VB=[0,6.5,50,37.5],WHALE_TO=[0,0,40,30];
function whaleFromPath(d){
 const at={vb:WHALE_VB,to:WHALE_TO};
 return P({b:'#4d6bfe',l:'#c9d6ff',w:'#ffffff',k:'#16245e'},'k',[
  {role:'tail',pivot:[29.6,11],z:-1,shapes:[{path:d,...at,rule:'outer',clip:[26.4,-2,20,13.2],c:'b'}]},
  {role:'body',pivot:[18,18],shapes:[{path:d,...at,rule:'outer',clip:[-2,-2,28.4,40],c:'l'},{path:d,...at,rule:'outer',clip:[26.4,11.2,20,30],c:'l'},
   {path:d,...at,clip:[-2,-2,28.4,40],c:'b'},{path:d,...at,clip:[26.4,11.2,20,30],c:'b'},{circle:[21.6,14.5,1.1],c:'w'}]}
 ],{size:[40,30],facing:'left',view:'side'});
}
// Hand-drawn whale in the same pose, for when the host mark cannot be read.
const WHALE_FALLBACK=P({b:'#4d6bfe',l:'#c9d6ff',w:'#ffffff',k:'#16245e'},'k',[
 {role:'tail',pivot:[29,11],z:-1,shapes:[{poly:[27,12,29.5,4,28,0.8,31.5,3.5,34,7.5,39,3,38,7.5,34.5,11,31,14],c:'b'}]},
 {role:'body',pivot:[18,18],shapes:[{ellipse:[16,17.5,15.5,11.5],c:'b'},{poly:[24,25,29,28.5,31,26,27,22],c:'b'},{path:'M3.5 11 C10 11 16 14 20 19 C23 23 25 26 27 27.5 C22 29.5 15 28 11 25.5 C7 23 4 18 3.5 11 Z',c:'l'},{circle:[21.6,14.5,1.1],c:'w'}]}
],{size:[40,30],facing:'left',view:'side'});

// The host's mark is used only when it draws a whale-sized figure on the grid.
const usable=new Map();
function markUsable(d){
 if(!usable.has(d)){const rig=compileRig(whaleFromPath(d)),rows=rig?rasterize(rig):[],cells=rows.join('').replace(/\./g,'').length;usable.set(d,cells>=500);}
 return usable.get(d);
}
const PRESETS=Object.keys(S).concat('whale');
// Recolourable keys per preset, as told to the director.
const PRESET_KEYS={whale:'b=body,l=belly',fish:'o=body,y=belly,s=fins/stripes',cat:'o=fur,d=stripes,w=belly',dog:'b=fur,d=patches,w=belly',bird:'b=feathers,d=wing,y=belly,o=beak',rabbit:'w=fur,p=pink,g=belly',robot:'g=metal,d=dark metal,l=panel,y=eyes,r=light',person:'s=skin,h=hair,c=shirt,j=trousers',ghost:'w=body,g=shade',octopus:'p=body,d=back legs,l=spots',rocket:'w=hull,r=nose/fins,b=window',eggplant:'p=skin,l=shine,g=leaves'};
const raws=new Map();
// A compiled rig for a preset with optional colour overrides; `mark` is the
// DeepSeek path when the host provided it.
function presetRig(id,overrides={},mark=null){
 if(!PRESETS.includes(id))return null;
 const base=id==='whale'?(mark&&markUsable(mark)?whaleFromPath(mark):WHALE_FALLBACK):S[id];
 const palette={...base.palette};
 for(const [k,v] of Object.entries(overrides||{}))if(palette[k]&&k!==base.outline){const c=hex(v);if(c)palette[k]=c;}
 const key=id+'|'+JSON.stringify(palette)+'|'+(id==='whale'&&mark?mark.length:0);
 if(!raws.has(key)){if(raws.size>30)raws.clear();raws.set(key,compileRig({...base,palette}));}
 return raws.get(key);
}
module.exports={PRESETS,PRESET_KEYS,presetRig,whaleFromPath,WHALE_FALLBACK};

},
"./director-script.cjs": function(module,exports,require){
'use strict';
// Director script: the extra model call per user message. The model reads the
// message and returns a small JSON stage script: who the actor is (a built-in
// preset, recoloured if wanted, or a request to draw a new one), what it does
// in each phase (built-in actions or moves it defines itself), the scenery,
// props and effects. Shared by the host (prompt + parse) and the client
// (validation of cached scripts). Model output is data; nothing is evaluated.
const {ACTION_NAMES,ROLES,compileRig,rigJson}=require('./sprite-rig.cjs');
const {PRESETS,PRESET_KEYS,presetRig}=require('./sprite-presets.cjs');
const ACTIONS=ACTION_NAMES;
const EFFECTS=['notes','hearts','sparkles','rain','zzz','stars','question','exclaim','bubbles','snow','fire','confetti'];
const ENVS=['none','water','sky','space','night','grass','snow','city','stage'];
const TRAVEL=['none','across','circle','bounce','updown','zigzag'];
const PHASES=['think','tool','answer','done'];
const PLACES=['left','right','above','ground'];
const PROP_MOTIONS=['float','bob','spin','none'];
const DEFAULT_BEATS={think:'think',tool:'type',answer:'nod',done:'idle'};
const LIMITS={input:2000,context:500,say:40,name:24,draw:240,rows:32,cols:32,colors:10,frames:2,props:2,propSize:16,moves:4};
// Scenery that goes with an action when the model names none.
const ENV_FOR={swim:'water',dive:'water',fly:'sky',hover:'sky'};

const SYSTEM_PROMPT=[
 'You direct a pixel-art stage that accompanies a chat between a user and an AI assistant.',
 'Read the newest user message (plus a little context), understand what the user wants the on-stage character to BE and to DO, and stage it vividly.',
 'Reply with ONE JSON object only: no prose, no Markdown, no code fences.',
 '',
 'Schema:',
 '{"actor":{"name":short noun in the user\'s language,"keep":true when the previous actor stays,',
 '          "preset":one of '+PRESETS.join(', ')+' or null,"colors":{key:"#RRGGBB"} optional recolouring of the preset,',
 '          "draw":null or, when no preset fits, an English description for an illustrator (subject, key colours, distinctive features, side view or front view)},',
 ' "scene":"actor" or "terminal" (terminal when the user asks for code, a script, a command or programming),',
 ' "terminal":{"title":"e.g. fib.py - python","command":"e.g. python fib.py"} or null,',
 ' "env":one of '+ENVS.join(', ')+' (scenery behind the actor),',
 ' "beats":{"think":{"actions":[A,...],"say":S},"tool":{...},"answer":{...},"done":{...}},',
 ' "moves":{} or up to 4 custom moves: {"name":{"period":seconds,"travel":one of '+TRAVEL.join('|')+',"keys":[[t,dx,dy,rot,sx,sy],...],"parts":{role:[fromDeg,toDeg],...}}},',
 ' "props":[0 to 2 of {"name":short noun,"place":"left"|"right"|"above"|"ground","motion":"float"|"bob"|"spin"|"none","sprite":{"palette":{...},"rows":[...]}}],',
 ' "effects":[zero to two of '+EFFECTS.join(', ')+'],',
 ' "mood":one or two words}',
 '',
 'Presets and their recolourable keys: '+PRESETS.map(id=>id+' ('+PRESET_KEYS[id]+')').join('; ')+'.',
 'whale is the DeepSeek whale: use it for 鲸鱼 / whale / DeepSeek / 小鲸鱼. Use a preset whenever the subject is that kind of thing, recoloured to fit (金鱼 → fish with orange, 黑猫 → cat with black fur, 小女孩 → person with long hair colour).',
 'For any other subject set preset null and write "draw" (e.g. "a green dinosaur, side view facing right, round belly, small arms, spikes on its back").',
 '',
 'A (actions) is a built-in action or the name of one of your moves. Built-in: '+ACTIONS.join(', ')+'.',
 'Travelling actions move across the whole stage: swim, fly, run, walk, roll, bounce, hop, crawl, dive. Tails, fins, wings, arms and legs animate by themselves.',
 'think, tool and answer list 1 to 3 actions performed in turn; done lists 3 to 6 varied actions that form a little show (the stage adds an encore after them). Phases: think = the assistant is reasoning, tool = it runs a tool, answer = it writes the reply, done = the reply is finished (shown longest).',
 'S is what the character says in that phase, in the user\'s language, at most 18 CJK characters or 40 Latin characters; it may be "".',
 'Moves are for requests no built-in action covers (翻跟头, 打太极, 跳绳, 转圈圈). keys: up to 8 keyframes over one period, t from 0 to 1; dx and dy in body sizes (-1..1, dy negative is up), rot in degrees (360 = full turn), sx and sy scale (sx -1 mirrors). parts: role (arm, leg, wing, tail, fin, head, ear, or arm_l etc.) swinging between two angles (clockwise degrees).',
 'env: water for swimming/diving/sea creatures, sky for flying, space for rockets/stars, night for sleep, grass for walking outdoors, snow for winter, city for town, stage for performing, none otherwise.',
 '',
 'Directing rules:',
 '- The default actor is the DeepSeek whale (小鲸鱼). The actor changes ONLY when the user explicitly tells the assistant to be or become something ("你是一只猫", "变成恐龙", "扮演机器人", "be a cat"): then keep=false with a preset or draw.',
 '- Asking the current actor to do something ("你会跳舞吗", "你游一下泳"): keep=true, preset=null, draw=null, and make it DO it: put the requested action in answer and done (e.g. done.actions ["swim","dive","swim"], env "water", effects ["bubbles"]). Show it attempting the action even if the actor is unusual for it.',
 '- Every other message keeps the current actor (keep=true, preset=null, draw=null), even when it talks about animals, objects or other characters; the same actor reacts to the topic with actions, scenery and props.',
 '- Requests to write code: scene "terminal", tool/answer actions ["type"].',
 '- Be lively: vary actions between phases, pick fitting scenery, effects and a prop.',
 '- colors: only when the user names a colour or a variety (金鱼, 黑猫, 蓝色的…); otherwise keep the preset colours.',
 '',
 'Example for "你是一条金鱼": {"actor":{"name":"金鱼","keep":false,"preset":"fish","colors":{"o":"#ff7a00"},"draw":null},"scene":"actor","terminal":null,"env":"water","beats":{"think":{"actions":["swim"],"say":"咕噜咕噜…"},"tool":{"actions":["swim"],"say":""},"answer":{"actions":["swim","flip"],"say":""},"done":{"actions":["swim","dive"],"say":"我是一条金鱼！"}},"moves":{},"props":[],"effects":["bubbles"],"mood":"自在"}',
 'Example for "你会翻跟头吗" (previous actor 猫): {"actor":{"name":"猫","keep":true,"preset":null,"draw":null},"scene":"actor","terminal":null,"env":"grass","beats":{"think":{"actions":["think"],"say":"翻跟头？"},"tool":{"actions":["type"],"say":""},"answer":{"actions":["翻跟头"],"say":""},"done":{"actions":["翻跟头","cheer"],"say":"看我的！"}},"moves":{"翻跟头":{"period":1.4,"travel":"none","keys":[[0,0,0,0,1,0.85],[0.15,0,-0.1,0,1,1.1],[0.5,0,-0.7,180,1,1],[0.85,0,-0.1,360,1,1],[1,0,0,360,1,0.9]],"parts":{"leg":[-40,20],"tail":[-30,30]}}},"props":[],"effects":["sparkles"],"mood":"得意"}'
].join('\n');

// The illustrator: one more call (with reasoning) when no preset fits. It
// draws a vector rig that the stage rasterizes and animates part by part.
const SPRITE_PROMPT=[
 'You are a pixel-art character designer. Draw the requested subject as a vector rig that will be rasterized onto a coarse pixel grid and animated part by part.',
 'Reply with ONE JSON object only, no prose:',
 '{"size":[W,H],"palette":{"a":"#RRGGBB",...},"outline":"k","facing":"right"|"left","view":"side"|"front",',
 ' "parts":[{"role":R,"pivot":[x,y],"z":n,"shapes":[S,...]},...]}',
 'W and H are 24 to 40 grid units. Coordinates are in grid units (0,0 top-left, y down). One grid unit becomes one pixel.',
 'palette: 3 to 8 colours, one lowercase letter each; outline names a dark colour drawn automatically around the whole figure (do not draw outlines yourself).',
 'R (role) is one of: '+ROLES.join(', ')+'. Animated roles rotate about their pivot: tail, fin, wing_l, wing_r, arm_l, arm_r, leg_l, leg_r, ear, head. Put the pivot where the part joins the body (shoulder, hip, tail base).',
 'z orders parts (far limbs negative, near limbs positive); within a part later shapes paint over earlier ones.',
 'S (shape) is one of: {"rect":[x,y,w,h],"c":k} {"circle":[cx,cy,r],"c":k} {"ellipse":[cx,cy,rx,ry,rotationDeg],"c":k} {"poly":[x1,y1,x2,y2,...],"c":k} {"line":[x1,y1,x2,y2,width],"c":k} {"path":"SVG path d","c":k}.',
 'Craft: build a clear, recognisable silhouette first (body, head), then limbs, then details. Use shading with a second tone of the main colour (belly, underside). Small details (eyes, nose, buttons) need at least 1.5 units and should be centred on .5 coordinates. Keep everything inside the W×H box.',
 'The stage background is near-black: never fill large areas with black or very dark colours (use dark grey such as #4a4f5c for black fur, hair or clothes); only the outline may be near-black.',
 'Animals and vehicles that move horizontally: side view facing right with separate legs/fins/wings/tail parts. People, robots and standing characters: front view with arm_l/arm_r/leg_l/leg_r.',
 'Example (a goldfish): '+JSON.stringify({size:[30,22],palette:{o:'#ff8c42',y:'#ffd166',s:'#e85d04',w:'#ffffff',e:'#1b1430',k:'#2b1d3a'},outline:'k',facing:'right',view:'side',parts:[
  {role:'tail',pivot:[9,11],z:-1,shapes:[{poly:[10,11,1,2.5,3.5,11,1,19.5],c:'s'}]},
  {role:'fin',pivot:[16,5],z:-1,shapes:[{poly:[11,5.5,15,0.5,22,5],c:'s'}]},
  {role:'body',pivot:[17,11],z:0,shapes:[{ellipse:[18,11,10,7.2],c:'o'},{ellipse:[19,13.8,7.5,3.4],c:'y'},{ellipse:[13.5,11,1.1,6],c:'s'},{circle:[23.5,9,1.8],c:'w'},{circle:[24,9,0.95],c:'e'}]},
  {role:'fin',pivot:[17,12.5],z:2,shapes:[{poly:[16,12.5,21,16.5,15,16],c:'s'}]}]})
].join('\n');

// An explicit request to change the actor ("你是一只猫", "变成恐龙", "be a
// cat"). Questions such as "你是谁" or "你是不是" do not count.
const CAST=/(你|您)\s*(现在|就|来|先)?\s*(是|当|变成|变为|化身为?|扮演|变回|换成)(?!谁|不是|否|怎么|什么|哪|啥|如何|不|为什么|几|真的|在)|变成|变为|变回|换回|化身|扮演|假装(你|自己)?是|换(个|一个)?(形象|角色|造型|样子)|\b(be|become|turn into|act as|pretend to be)\s+(an?|the|my)\b|\byou\s*(are|'re)\s+(an?|the|my)\s+\w/i;
const castRequested=input=>CAST.test(String(input||''));
// Keeps the current actor when the message did not ask for a new one, whatever
// the model proposed.
function holdActor(script,input,previous){
 if(castRequested(input)||script.actor.keep)return script;
 return {...script,actor:{name:previous?.name||'小鲸鱼',keep:true,preset:null,colors:{},rig:null,sprite:null,draw:null}};
}
const clip=(text,n)=>Array.from(String(text??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim()).slice(0,n).join('');
const num=(v,d=0)=>typeof v==='number'&&Number.isFinite(v)?v:d;
const clampN=(v,a,b,d=a)=>Math.max(a,Math.min(b,num(v,d)));
function buildRequest({input,previous,context}={}){
 return 'Stage request as JSON:\n'+JSON.stringify({
  user_message:clip(input,LIMITS.input),
  previous_actor:previous?.name?clip(previous.name,LIMITS.name):'小鲸鱼 (the DeepSeek whale, default)',
  previous_user_message:context?.input?clip(context.input,LIMITS.context):null,
  previous_answer_excerpt:context?.answer?clip(context.answer,LIMITS.context):null
 });
}
function buildSpriteRequest({name,draw}={}){
 return 'Draw this character as a rig:\n'+JSON.stringify({name:clip(name,LIMITS.name),description:clip(draw,LIMITS.draw)});
}
// A drawn rig from the illustrator, validated; throws when unusable.
function normalizeRig(raw){
 const rig=compileRig(raw);
 if(!rig)throw Error('画像不是可用的部件图');
 const shapes=rig.parts.reduce((n,p)=>n+p.shapes.length,0);
 if(shapes<3)throw Error('画像太简单');
 return rigJson(rig);
}
const parseRig=text=>parseJson(text,normalizeRig,'模型没有返回 JSON 画像');
function color(value){
 const text=String(value||'').trim();
 if(/^#[0-9a-f]{6}$/i.test(text))return text.toLowerCase();
 if(/^#[0-9a-f]{3}$/i.test(text))return ('#'+[...text.slice(1)].map(c=>c+c).join('')).toLowerCase();
 return null;
}
function palette(value){
 const out={};
 for(const [key,hex] of Object.entries(value||{}).slice(0,LIMITS.colors)){const c=color(hex);if(/^[a-z0-9]$/i.test(key)&&key!=='.'&&c)out[key]=c;}
 return out;
}
const grid=(rows,colors,max)=>(Array.isArray(rows)?rows:[]).filter(r=>typeof r==='string').slice(0,max).map(r=>[...r.slice(0,max)].map(ch=>colors[ch]?ch:'.').join(''));
// Row sprites (props, and actors from scripts before 0.12): base and pose
// frames share one crop box, so frames line up cell for cell. Unknown
// characters become transparent; a scribble with too few cells is rejected.
function sprite(value,frames=[],max=LIMITS.rows,min=4){
 if(!value||typeof value!=='object')return null;
 const colors=palette(value.palette);
 if(!Object.keys(colors).length)return null;
 const base=grid(value.rows,colors,max);
 if(!base.length)return null;
 const h=base.length,w=Math.max(...base.map(r=>r.length));
 const pad=rows=>Array.from({length:h},(_,y)=>(rows[y]||'').padEnd(w,'.').slice(0,w));
 const sets=[pad(base),...(Array.isArray(frames)?frames:[]).slice(0,4).map(f=>grid(Array.isArray(f)?f:f?.rows,colors,max)).filter(f=>f.length>=h*.6).slice(0,LIMITS.frames).map(pad)];
 const rowsUsed=[...Array(h).keys()].filter(y=>sets.some(s=>/[^.]/.test(s[y]))),colsUsed=[...Array(w).keys()].filter(x=>sets.some(s=>s.some(r=>r[x]!=='.')));
 if(!rowsUsed.length)return null;
 const crop=s=>s.slice(rowsUsed[0],rowsUsed.at(-1)+1).map(r=>r.slice(colsUsed[0],colsUsed.at(-1)+1));
 const [rows,...poses]=sets.map(crop);
 const filled=rows.join('').replace(/\./g,'').length;
 if(rows.length<min||rows[0].length<min||filled<min*2)return null;
 return {palette:colors,rows,frames:poses.filter(f=>f.join('').replace(/\./g,'').length>=filled*.5),w:rows[0].length,h:rows.length};
}
// A custom move: body keyframes over one period plus part swings.
function move(value){
 if(!value||typeof value!=='object')return null;
 const keys=(Array.isArray(value.keys)?value.keys:[]).filter(Array.isArray).slice(0,8).map(k=>({t:clampN(k[0],0,1,0),dx:clampN(k[1],-1.5,1.5,0),dy:clampN(k[2],-1.5,1.5,0),rot:clampN(k[3],-720,720,0),sx:clampN(k[4],-2,2,1)||1,sy:clampN(k[5],.2,2,1)})).sort((a,b)=>a.t-b.t);
 const parts={};
 for(const [role,v] of Object.entries(value.parts||{}).slice(0,8))if((ROLES.includes(role)||['arm','leg','wing'].includes(role))&&Array.isArray(v)&&v.length>=2)parts[role]=[clampN(v[0],-180,180,0),clampN(v[1],-180,180,0)];
 const travel=TRAVEL.includes(value.travel)?value.travel:'none';
 if(!keys.length&&!Object.keys(parts).length&&travel==='none')return null;
 return {period:clampN(value.period,.4,8,1.6),travel,keys,parts};
}
function beat(value,phase,moves){
 const ok=a=>typeof a==='string'&&(ACTIONS.includes(a)||Object.hasOwn(moves,a));
 const list=(Array.isArray(value?.actions)?value.actions:[value?.action]).filter(ok).slice(0,phase==='done'?6:3);
 const actions=list.length?list:[DEFAULT_BEATS[phase]];
 return {action:actions[0],actions,say:clip(value?.say,LIMITS.say)};
}
function prop(value){
 if(!value||typeof value!=='object')return null;
 const drawn=sprite(value.sprite,[],LIMITS.propSize,2);
 if(!drawn)return null;
 return {name:clip(value.name,12),place:PLACES.includes(value.place)?value.place:'right',motion:PROP_MOTIONS.includes(value.motion)?value.motion:'float',sprite:{palette:drawn.palette,rows:drawn.rows,w:drawn.w,h:drawn.h}};
}
function normalizeScript(raw){
 if(!raw||typeof raw!=='object')throw Error('剧本不是对象');
 const actorIn=raw.actor&&typeof raw.actor==='object'?raw.actor:{};
 // Fields that slipped inside an unclosed "actor" belong to the script.
 raw={...raw};for(const k of ['scene','terminal','env','beats','moves','props','effects','mood'])if(raw[k]===undefined&&actorIn[k]!==undefined)raw[k]=actorIn[k];
 const keep=actorIn.keep===true;
 const preset=!keep&&PRESETS.includes(actorIn.preset)?actorIn.preset:null;
 // A rig drawn in the script itself, or rows from scripts before 0.12.
 const rig=!keep&&!preset&&actorIn.rig?compileRig(actorIn.rig):null;
 const rows=!keep&&!preset&&!rig?sprite(actorIn.sprite,actorIn.frames??actorIn.sprite?.frames):null;
 const draw=!keep&&!preset&&!rig&&!rows?clip(actorIn.draw,LIMITS.draw)||null:null;
 const actor={name:clip(actorIn.name,LIMITS.name)||'角色',keep,preset,colors:preset?Object.fromEntries(Object.entries(palette(actorIn.colors)).filter(([k])=>k!==presetRig(preset).outline&&presetRig(preset).palette[k])):{},rig:rig?rigJson(rig):null,sprite:rows,draw};
 const scene=raw.scene==='terminal'?'terminal':'actor';
 const t=raw.terminal&&typeof raw.terminal==='object'?raw.terminal:null;
 const moves={};
 for(const [name,value] of Object.entries(raw.moves&&typeof raw.moves==='object'?raw.moves:{}).slice(0,LIMITS.moves)){const m=move(value),key=clip(name,16);if(m&&key&&!ACTIONS.includes(key))moves[key]=m;}
 const beats={};for(const phase of PHASES)beats[phase]=beat(raw.beats?.[phase],phase,moves);
 const props=(Array.isArray(raw.props)?raw.props:[]).map(prop).filter(Boolean).slice(0,LIMITS.props);
 const effects=(Array.isArray(raw.effects)?raw.effects:[]).filter(e=>EFFECTS.includes(e)).slice(0,2);
 const acted=[...beats.answer.actions,...beats.done.actions].map(a=>ENV_FOR[a]).find(Boolean);
 const env=ENVS.includes(raw.env)&&raw.env!=='none'?raw.env:acted||'none';
 return {v:3,actor,scene,terminal:scene==='terminal'||t?{title:clip(t?.title,40),command:clip(t?.command,60)}:null,env,beats,moves,props,effects,mood:clip(raw.mood,16)};
}
// Long sprite arrays are where models slip: a missing comma between rows or a
// trailing comma. Those two are repaired; anything else is reported.
function repair(json){
 return json.replace(/,\s*([}\]])/g,'$1').replace(/(["\]}])\s*\n\s*(["\[{])/g,'$1,\n$2').replace(/(["\]}])[ \t]+(["\[{])/g,'$1,$2').replace(/"\s*"(?=[^:,\]}])/g,'","');
}
// The first complete object, by brace depth outside strings: drops an extra
// closing brace or trailing chatter after the JSON.
// closing brace or trailing chatter after the JSON; a missing closing brace or
// bracket at the end (an unclosed "actor" is the usual one) is appended.
function balanced(json){
 const open=[];let quoted=false,escaped=false;
 for(let i=0;i<json.length;i++){
  const ch=json[i];
  if(quoted){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')quoted=false;continue;}
  if(ch==='"')quoted=true;
  else if(ch==='{'||ch==='[')open.push(ch==='{'?'}':']');
  else if(ch==='}'||ch===']'){open.pop();if(!open.length)return json.slice(0,i+1);}
 }
 return json+open.reverse().join('');
}
// The first JSON object in a model reply, through `normalize`; a reply with a
// stray or missing brace, or missing commas, is repaired before giving up.
function parseJson(text,normalize,missing='模型没有返回 JSON'){
 const source=String(text||'').replace(/^\s*```(?:json)?/i,'').replace(/```\s*$/,'');
 const start=source.indexOf('{'),end=source.lastIndexOf('}');
 if(start<0)throw Error(missing);
 // A reply cut off before its last brace is kept whole for balanced().
 const json=end>start?source.slice(start,end+1):source.slice(start);
 try{return normalize(JSON.parse(json));}
 catch(error){
  for(const candidate of [balanced(json),repair(json),repair(balanced(json))]){try{return normalize(JSON.parse(candidate));}catch{}}
  {const at=Number(/position (\d+)/.exec(error.message)?.[1]);throw Error(error.message+(Number.isFinite(at)?' · 附近：'+json.slice(Math.max(0,at-50),at+30).replace(/\s+/g,' '):''));}
 }
}
const parseScript=text=>parseJson(text,normalizeScript,'模型没有返回 JSON 剧本');
module.exports={castRequested,holdActor,ACTIONS,EFFECTS,ENVS,TRAVEL,PHASES,SYSTEM_PROMPT,SPRITE_PROMPT,buildRequest,buildSpriteRequest,parseScript,parseRig,parseJson,normalizeScript,normalizeRig,sprite};

},
"./outline.cjs": function(module,exports,require){
'use strict';
// Thought outline: after the model has finished reasoning, one optional extra
// call condenses the public reasoning into goal / constraints / options /
// decision / risks. Shared by the host route and the browser (validation).
const {parseJson}=require('./director-script.cjs');
const REASONING_KINDS=['reasoning','compare','check','revise'];
const MAX_INPUT=1200,MAX_REASONING=9000;

const OUTLINE_PROMPT=`You condense an AI assistant's visible reasoning into a decision outline for a small on-screen flow chart.
Use ONLY what the reasoning actually says. Never invent options, numbers or facts. Write in the same language as the reasoning (usually Chinese). Keep every string short: it is drawn in pixels.
Reply with JSON only, no prose, no code fence:
{
 "goal": "what the assistant is trying to do, <= 30 chars",
 "constraints": ["requirement or limit it took into account, <= 24 chars", "... at most 4"],
 "options": [{"name": "approach it considered, <= 16 chars", "for": "main reason for, <= 24 chars", "against": "main reason against, <= 24 chars", "chosen": true}],
 "decision": "what it decided to do and why, <= 48 chars",
 "risks": ["open question or risk it noted, <= 24 chars", "... at most 3"]
}
Rules: options has 0-3 items; mark exactly one as chosen when the reasoning chose one, none otherwise. If the reasoning did not weigh alternatives, give an empty options array. Empty arrays are fine; do not pad.`;

const clip=(value,n)=>{const list=Array.from(String(value??'').replace(/\s+/g,' ').trim());return list.length>n?list.slice(0,n-1).join('')+'…':list.join('');};
const strings=(value,max,n)=>(Array.isArray(value)?value:[]).map(v=>clip(typeof v==='string'?v:v?.text??'',n)).filter(Boolean).slice(0,max);

// Head and tail of the reasoning: the opening states the task, the end the decision.
function reasoningExcerpt(text,limit=MAX_REASONING){
 const list=Array.from(String(text||''));
 if(list.length<=limit)return list.join('');
 const head=Math.floor(limit/3);
 return list.slice(0,head).join('')+'\n…\n'+list.slice(list.length-(limit-head)).join('');
}
function buildOutlineRequest({input,reasoning}){
 return `User message:\n${clip(input,MAX_INPUT)}\n\nAssistant's visible reasoning:\n${reasoningExcerpt(reasoning)}`;
}
function normalizeOutline(raw){
 if(!raw||typeof raw!=='object')throw Error('提纲不是对象');
 const options=(Array.isArray(raw.options)?raw.options:[]).filter(o=>o&&typeof o==='object').map(o=>({name:clip(o.name,20),for:clip(o.for??o.pro,30),against:clip(o.against??o.con,30),chosen:o.chosen===true})).filter(o=>o.name).slice(0,3);
 // At most one chosen option.
 let seen=false;for(const o of options){if(o.chosen&&seen)o.chosen=false;seen=seen||o.chosen;}
 const outline={goal:clip(raw.goal,40),constraints:strings(raw.constraints,4,30),options,decision:clip(raw.decision,64),risks:strings(raw.risks??raw.open_questions,3,30)};
 if(!outline.goal&&!outline.decision)throw Error('提纲缺少目标与结论');
 return outline;
}
const parseOutline=text=>parseJson(text,normalizeOutline,'模型没有返回 JSON 提纲');

// The latest turn's input and public reasoning, and whether reasoning is over:
// an answer after the last reasoning segment, or the turn has stopped.
function turnReasoning(graph){
 const nodes=graph?.nodes||[],at=nodes.findLastIndex(n=>n.kind==='input');
 if(at<0)return null;
 const rest=nodes.slice(at+1),last=rest.findLastIndex(n=>REASONING_KINDS.includes(n.kind));
 const reasoning=rest.filter(n=>REASONING_KINDS.includes(n.kind)).map(n=>n.source).join('');
 const ended=last>=0&&(!graph.running||rest.slice(last+1).some(n=>n.kind==='answer'));
 return {id:nodes[at].id,input:nodes[at].source,reasoning,ended};
}
module.exports={OUTLINE_PROMPT,REASONING_KINDS,buildOutlineRequest,normalizeOutline,parseOutline,reasoningExcerpt,turnReasoning};

},
"./director.cjs": function(module,exports,require){
'use strict';
// Client half of the stage director: one request per new user message while
// the turn is live. Scripts and the current actor are remembered per session
// in this browser, so reopening a conversation does not spend tokens again.
const React=require('react');
const {useState,useEffect,useRef}=React;
const {normalizeScript,normalizeRig,holdActor}=require('./director-script.cjs');
const {normalizeOutline,turnReasoning}=require('./outline.cjs');
const ROUTE='/thought-window-director';
const KEEP_TURNS=24;
const load=key=>{try{return JSON.parse(localStorage.getItem(key))||null;}catch{return null;}};
const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};

function lastTurn(graph){
 const nodes=graph.nodes,at=nodes.findLastIndex(n=>n.kind==='input');
 if(at<0)return null;
 const before=nodes.findLastIndex((n,i)=>i<at&&n.kind==='input');
 const answer=nodes.slice(before+1,at).filter(n=>n.kind==='answer').map(n=>n.source).join('').slice(-500);
 return {id:nodes[at].id,input:nodes[at].source,context:before>=0?{input:nodes[before].source,answer}:null};
}
async function post(path,body,signal){
 const response=await fetch(ROUTE+path,{method:'POST',credentials:'same-origin',signal,headers:{'content-type':'application/json','x-thought-window':'1'},body:JSON.stringify(body)});
 let data=null;try{data=await response.json();}catch{}
 if(!response.ok||!data?.ok)throw Error(data?.error||(response.status===404||!data?'插件接口不可用（重启 DSH 加载新版插件后再试）':'HTTP '+response.status));
 return data;
}
async function requestScene(body,signal){const data=await post('/scene',body,signal);return {...data,script:holdActor(normalizeScript(data.script),body.input,body.previous)};}
async function requestSprite(body,signal){const data=await post('/sprite',body,signal);return {...data,rig:normalizeRig(data.rig)};}
async function requestOutline(body,signal){const data=await post('/outline',body,signal);return {...data,outline:normalizeOutline(data.outline)};}
const inflight=new Map();
// An actor's look: a preset (with colours), a drawn rig, or rows from older scripts.
const looks=a=>!!(a&&(a.preset||a.rig||a.sprite?.rows));
function remember(key,turnId,result){
 const old=load(key)||{actor:null,turns:{}},script=result.script,s=script.actor;
 const own=s.preset||s.rig||s.sprite?{name:s.name,preset:s.preset,colors:s.colors,rig:s.rig,sprite:s.sprite}:null;
 // A drawing request keeps the old look until the drawing arrives.
 const actor=own||old.actor||{name:s.name};
 const turns={};for(const id of Object.keys(old.turns).slice(-(KEEP_TURNS-1)))turns[id]=old.turns[id];
 turns[turnId]={script,actor,draw:s.draw?{name:s.name,draw:s.draw}:null,usage:result.usage,model:result.model,ms:result.ms,at:Date.now()};
 save(key,{actor,turns});
}
function rememberDrawing(key,turnId,patch){
 const old=load(key),entry=old?.turns?.[turnId];
 if(!entry?.draw)return;
 entry.draw={...entry.draw,...patch.draw};
 if(patch.actor){entry.actor=patch.actor;if(Object.keys(old.turns).at(-1)===turnId)old.actor=patch.actor;}
 save(key,old);
}
// A drawing still owed: requested by the script, not finished or failed, and
// recent (an old unfinished request is not paid for again on a visit).
const DRAW_WINDOW=30*60*1000;
const owed=entry=>entry?.draw&&!entry.draw.done&&!entry.draw.error&&Date.now()-(entry.at||0)<DRAW_WINDOW?entry.draw:null;
// Status: off | idle (history turn, not directed) | pending | drawing | ready | error.
function useStageDirector({graph,sessionId,enabled}){
 const key='tw:director:'+sessionId;
 const [memory,setMemory]=useState(()=>load(key)||{actor:null,turns:{}});
 const [live,setLive]=useState({status:'idle',error:''});
 const [nonce,setNonce]=useState(0);
 const turn=lastTurn(graph),turnId=turn?.id||null,cached=turnId?memory.turns[turnId]:null;
 const latest=useRef({turn,memory,running:graph.running});latest.current={turn,memory,running:graph.running};
 useEffect(()=>{setMemory(load(key)||{actor:null,turns:{}});},[key]);
 useEffect(()=>{
  if(!enabled||!turnId)return;
  const {turn:current,memory:known,running}=latest.current;
  if(known.turns[turnId]&&!nonce){setLive({status:'ready',error:''});return;}
  // Only live turns are directed automatically; history waits for a request.
  if(!running&&!nonce){setLive({status:'idle',error:''});return;}
  // One call per turn: a remount or re-render joins the request already in
  // flight, and its result is stored even if this component is gone by then.
  const id=key+'|'+turnId+'|'+nonce;
  let request=inflight.get(id);
  if(!request){
   request=requestScene({input:current.input,previous:known.actor?{name:known.actor.name}:null,context:current.context}).then(result=>{remember(key,turnId,result);return result;}).finally(()=>inflight.delete(id));
   inflight.set(id,request);
  }
  let alive=true;
  setLive({status:'pending',error:''});
  request.then(()=>{if(alive){setMemory(load(key)||{actor:null,turns:{}});setLive({status:'ready',error:''});}},error=>{if(alive)setLive({status:'error',error:error?.message||String(error)});});
  return()=>{alive=false;};
 },[enabled,turnId,nonce,key]);
 // The illustrator: when the script asks for a new drawing, one more call.
 const need=owed(cached);
 useEffect(()=>{
  if(!enabled||!need)return;
  const id=key+'|'+turnId+'|draw|'+need.draw;
  let request=inflight.get(id);
  if(!request){
   request=requestSprite({name:need.name,draw:need.draw})
    .then(result=>{rememberDrawing(key,turnId,{draw:{done:true,usage:result.usage,ms:result.ms},actor:{name:need.name,rig:result.rig}});return result;},
     error=>{rememberDrawing(key,turnId,{draw:{error:error?.message||String(error)}});throw error;})
    .finally(()=>inflight.delete(id));
   inflight.set(id,request);
  }
  let alive=true;
  const settle=()=>{if(alive)setMemory(load(key)||{actor:null,turns:{}});};
  request.then(settle,settle);
  return()=>{alive=false;};
 },[enabled,turnId,need?.draw,key]);
 useEffect(()=>{setNonce(0);},[turnId]);
 const entry=cached||null,status=!enabled?'off':live.status==='pending'?'pending':need?'drawing':live.status;
 const add=(a,b)=>a||b?{inputTokens:(a?.inputTokens||0)+(b?.inputTokens||0),outputTokens:(a?.outputTokens||0)+(b?.outputTokens||0),cacheReadTokens:(a?.cacheReadTokens||0)+(b?.cacheReadTokens||0)}:null;
 return {
  status,error:live.error,
  script:entry?.script||null,
  actor:entry?.actor||memory.actor||null,
  drawing:need?{name:need.name}:null,drawError:entry?.draw?.error||null,drawMs:entry?.draw?.ms||null,
  usage:add(entry?.usage,entry?.draw?.usage),model:entry?.model||null,ms:entry?.ms||null,
  redirect:()=>setNonce(n=>n+1),
  forget:()=>{const next={actor:null,turns:{}};save(key,next);setMemory(next);}
 };
}
// Thought outline: one call per live turn, once its reasoning is over (an
// answer has started, or the turn stopped). Stored per session like scripts.
// Status: off | idle | waiting (still reasoning) | pending | ready | error.
const MIN_REASONING=120;
function useThoughtOutline({graph,sessionId,enabled}){
 const key='tw:outline:'+sessionId;
 const [memory,setMemory]=useState(()=>load(key)||{turns:{}});
 const [live,setLive]=useState({status:'idle',error:''});
 const [nonce,setNonce]=useState(0);
 const turn=turnReasoning(graph),turnId=turn?.id||null,cached=turnId?memory.turns[turnId]:null;
 // Turns seen running in this tab: only those are outlined without a request.
 const seen=useRef(new Set());if(graph.running&&turnId)seen.current.add(turnId);
 const latest=useRef(turn);latest.current=turn;
 const ready=!!turn&&turn.ended&&turn.reasoning.length>=MIN_REASONING;
 useEffect(()=>{setMemory(load(key)||{turns:{}});},[key]);
 useEffect(()=>{setNonce(0);},[turnId]);
 useEffect(()=>{
  if(!enabled||!turnId)return;
  const known=load(key)||{turns:{}};
  if(known.turns[turnId]&&!nonce){setLive({status:'ready',error:''});return;}
  // Still reasoning: wait. Over without enough public reasoning: nothing to outline.
  if(!ready){setLive({status:graph.running&&!latest.current?.ended&&seen.current.has(turnId)?'waiting':'idle',error:''});return;}
  if(!seen.current.has(turnId)&&!nonce){setLive({status:'idle',error:''});return;}
  const id=key+'|'+turnId+'|'+nonce,current=latest.current;
  let request=inflight.get(id);
  if(!request){
   request=requestOutline({input:current.input,reasoning:current.reasoning}).then(result=>{
    const old=load(key)||{turns:{}},turns={};
    for(const t of Object.keys(old.turns).slice(-(KEEP_TURNS-1)))turns[t]=old.turns[t];
    turns[turnId]={outline:result.outline,usage:result.usage,model:result.model,ms:result.ms,at:Date.now()};
    save(key,{turns});return result;
   }).finally(()=>inflight.delete(id));
   inflight.set(id,request);
  }
  let alive=true;
  setLive({status:'pending',error:''});
  request.then(()=>{if(alive){setMemory(load(key)||{turns:{}});setLive({status:'ready',error:''});}},error=>{if(alive)setLive({status:'error',error:error?.message||String(error)});});
  return()=>{alive=false;};
 },[enabled,turnId,ready,nonce,key,graph.running]);
 return {
  status:enabled?(cached&&live.status!=='pending'?'ready':live.status):'off',error:live.error,
  outline:cached?.outline||null,usage:cached?.usage||null,model:cached?.model||null,ms:cached?.ms||null,at:cached?.at||null,
  canRequest:!!turn&&turn.reasoning.length>=MIN_REASONING&&turn.ended,
  request:()=>setNonce(n=>n+1)
 };
}
module.exports={useStageDirector,useThoughtOutline,lastTurn,requestScene,requestSprite,requestOutline,looks,ROUTE};

},
"./stage-actor.cjs": function(module,exports,require){
'use strict';
// Actor layer: the director's character on stage. Pure builders, like the
// figures. The canvas is split into zones that never overlap: a heading band,
// the stage (scenery, actor, props, or actor + terminal) and a log band of the
// turn's real events. Sprite cells are particles: a new actor assembles from
// the floor, a changed one morphs out of the old, pose frames swap in place.
const D=require('./stage-data.cjs');
const {turnNodes}=require('./scenes.cjs');
const {area,wrap,fit,span}=require('./stage-figures.cjs');
const {compileRig,framesFor,ANIM}=require('./sprite-rig.cjs');
const {presetRig}=require('./sprite-presets.cjs');

// Built-in actor when no script exists (director off, history, or failure):
// the DeepSeek whale.
const WHALE={name:'小鲸鱼',preset:'whale'};
const EFFECT_GLYPHS={notes:{glyphs:['♪','♫'],color:'accent'},hearts:{glyphs:['♥'],color:'#ff6f91'},sparkles:{glyphs:['✦','✧','+'],color:'#ffe08a'},stars:{glyphs:['★','☆'],color:'#ffe08a'},zzz:{glyphs:['z','Z'],color:'muted'},question:{glyphs:['?'],color:'accent',count:3},exclaim:{glyphs:['!'],color:'danger',count:3}};
const SHELL=/bash|pwsh|powershell|shell|exec|run|python|node|cmd|terminal|command/i;
const LIGHTS=['dance','happy','spin','jump','grow','cheer','sing','flip'];
// Actions that cross the stage: the actor is drawn smaller to have room.
const TRAVEL=['walk','run','crawl','hop','bounce','roll','swim','dive','fly'];
// Secondary motion per action: what trails the actor or rises where it lands.
const FX={swim:'bubbles',dive:'bubbles',fly:'wind',hover:'wind',run:'dust',walk:'dust',roll:'dust',crawl:'dust',hop:'dust',bounce:'dust',jump:'dust',cheer:'dust',flip:'dust',surprised:'dust',dance:'sparkles',spin:'sparkles',sing:'sparkles',happy:'sparkles',grow:'sparkles'};
function fxOf(action,move,env){
 const own=move?(move.travel!=='none'?'dust':'sparkles'):FX[action]||null;
 if(own==='dust'&&env==='water')return 'bubbles';
 if(own==='dust'&&env==='sky'&&['fly','hover'].includes(action))return 'wind';
 return own;
}
// The show: the director's actions first, then an encore of moves this
// character can do in this scenery, so a finished reply keeps the stage busy
// instead of looping two actions. Fixed per turn; never the same move twice
// in a row.
const POOLS={
 any:['happy','spin','dance','jump','flip','nod','wave','grow','cheer','sing','bounce'],
 legs:['walk','run','hop','bow','dance','wave','cheer','jump'],
 air:['fly','hover','flip','spin','happy','dance','wave','grow','sing','cheer'],
 water:['swim','dive','flip','spin','happy','hover','dance','jump','grow','wave','sing'],
 legless:['roll','bounce','hop','spin']
};
const SHOW_LENGTH={done:8,answer:4};
function programOf(actions,{look=null,env='none',phase='done',seed=0}={}){
 const base=actions.slice(),n=Math.max(base.length,SHOW_LENGTH[phase]||0);
 if(base.length>=n)return base;
 const roles=new Set((look?.rig?.parts||[]).map(p=>p.role.replace(/_[lr]$/,''))),legs=roles.has('leg'),wings=roles.has('wing');
 const aquatic=(roles.has('fin')||roles.has('tail'))&&!legs&&look?.rig?.view==='side';
 let pool;
 if(env==='water')pool=POOLS.water;
 else if(env==='sky'||env==='space')pool=wings||!legs?POOLS.air:[...POOLS.air.filter(a=>a!=='fly'),'jump','cheer'];
 else pool=[...POOLS.any,...(legs?POOLS.legs:aquatic?['swim','dive','roll','bounce']:POOLS.legless),...(wings?['fly','hover']:[])];
 const rnd=D.random(seed>>>0),list=[...new Set(pool)].filter(a=>!base.includes(a)).map(a=>[rnd(),a]).sort((x,y)=>x[0]-y[0]).map(x=>x[1]);
 const out=base.slice();
 for(const a of list){if(out.length>=n)break;if(out.at(-1)!==a)out.push(a);}
 return out;
}
// Pose frames per part-animation cycle: eight, so limbs swing smoothly.
const CYCLE_FRAMES=8;
// Frame tempo per action (ms) for pose frames and flowing glyph text.
const TEMPO={dance:260,walk:220,jump:360,happy:300,wave:260,type:170,spin:300,shake:120,explode:500,surprised:400,idle:900,think:650,sleep:1100,sad:900,nod:380,grow:420,
 swim:190,fly:140,run:120,roll:300,bounce:240,hop:220,crawl:300,dive:220,flip:260,cheer:220,bow:600,sing:380,eat:200,hover:220};

// What an actor looks like, compiled: a rig (preset or drawn) or old row
// sprites. `mark` is DeepSeek's whale path when the host served it.
const rigs=new WeakMap();
// Near-black fills vanish on the dark stage: they are lifted to a dark grey
// (the outline colour keeps its own value).
const lum=hex=>{const n=parseInt(hex.slice(1),16);return (0.2126*(n>>16&255)+0.7152*(n>>8&255)+0.0722*(n&255))/255;};
const lifted=new WeakMap();
function visible(rig){
 if(!rig)return rig;
 if(!lifted.has(rig)){
  const dark=Object.keys(rig.palette).filter(k=>k!==rig.outline&&lum(rig.palette[k])<.07);
  lifted.set(rig,dark.length?{...rig,palette:{...rig.palette,...Object.fromEntries(dark.map(k=>[k,'#3d4352']))}}:rig);
 }
 return lifted.get(rig);
}
function lookOf(actor,mark=null){
 if(actor?.preset){const rig=presetRig(actor.preset,actor.colors,mark);if(rig)return {rig:visible(rig)};}
 if(actor?.rig&&typeof actor.rig==='object'){if(!rigs.has(actor.rig))rigs.set(actor.rig,compileRig(actor.rig));const rig=rigs.get(actor.rig);if(rig)return {rig:visible(rig)};}
 if(actor?.sprite?.rows?.length)return {sprite:actor.sprite};
 return {rig:presetRig('whale',{},mark)};
}
// Pose frames for the action now playing. A rig moves its parts (a custom
// move swings the parts it names); row sprites use their own or derived frames.
function framesOfLook(look,action='idle',move=null){
 if(look?.rig)return framesFor(look.rig,ANIM[action]?action:'idle',CYCLE_FRAMES,move?.parts&&Object.keys(move.parts).length?move.parts:null);
 if(look?.sprite)return framesOf(look.sprite);
 return framesFor(presetRig('whale'),'idle',4);
}
function paletteOf(look){return look?.rig?look.rig.palette:look?.sprite?.palette||{};}
function facingOf(look){return look?.rig?.facing||'right';}

// Live phase of the turn (not the reading position): the actor reacts to now.
function phaseOf(graph){
 const nodes=turnNodes(graph);
 if(!nodes.length)return 'idle';
 if(!graph.running)return 'done';
 if(nodes.some(n=>n.kind==='tool'&&n.status==='running'))return 'tool';
 return nodes.at(-1).kind==='answer'?'answer':'think';
}
function blocks(nodes){
 const out=[];
 for(const n of nodes){
  const key=/^a:/.test(n.id)&&n.kind!=='answer'?n.id.replace(/:\d+$/,''):n.id;
  if(out.at(-1)?.key===key)out.at(-1).text+=n.source;else out.push({key,text:n.source,kind:n.kind});
 }
 return out;
}
function args(text){
 try{const value=JSON.parse(text);for(const k of ['command','cmd','script','code','input'])if(typeof value?.[k]==='string')return value[k];}catch{}
 return String(text||'').trim();
}
// What the terminal shows: the latest code block in the turn (the real code,
// still streaming if unfinished), else a shell tool's command and output,
// else the director's prompt line while code is awaited.
function terminalOf(graph,script){
 const nodes=turnNodes(graph);
 const code=blocks(nodes.filter(n=>n.kind!=='tool'&&n.kind!=='input')).reverse().find(b=>/```/.test(b.text));
 if(code){
  const all=[...code.text.matchAll(/```([\w+#.-]*)[^\n]*\n([\s\S]*?)(?:```|$)/g)],last=all.at(-1);
  if(last)return {kind:'code',lang:last[1]||'code',title:script?.terminal?.title||(last[1]||'code')+' — editor',lines:last[2].replace(/\s+$/,'').split('\n'),open:!last[0].endsWith('```')};
 }
 const tool=[...nodes].reverse().find(n=>n.kind==='tool'&&SHELL.test(n.title));
 if(tool){
  const [request,result='']=String(tool.source).replace(/^参数\n/,'').split('\n\n返回\n');
  return {kind:'shell',title:tool.title,lines:['$ '+D.short(args(request),200),...result.split('\n').filter(l=>l.trim()).slice(0,200)],open:tool.status==='running'};
 }
 if(script?.scene==='terminal')return {kind:'prompt',title:script.terminal?.title||'terminal',lines:['$ '+(script.terminal?.command||'')],open:true};
 return null;
}
// The log band: the turn's real events, newest last, in the reference's
// "[ OK ] checkpoint ..." voice. The director's own call is listed too.
function logOf(graph,director){
 const lines=[];
 const add=(state,kind,text,id)=>lines.push({id,text:`[${state}] ${kind.padEnd(6)} ${D.short(text,120)}`,state});
 for(const n of turnNodes(graph)){
  const state=n.status==='running'?' .. ':n.status==='error'||n.kind==='error'?'ERR!':' OK ';
  if(n.kind==='input')add(' IN ','stdin',n.source,n.id);
  else if(n.kind==='tool')add(state,'call',n.title+' '+(n.excerpt||''),n.id);
  else if(n.kind==='answer')add(state,'output',n.source,n.id);
  else if(n.kind==='error'||n.kind==='retry')add('ERR!',n.kind,n.source,n.id);
  else add(state,'think',n.source,n.id);
 }
 if(director?.status==='pending')lines.push({id:'dir',text:'[ .. ] direct reading your message',state:' .. '});
 else if((director?.status==='ready'||director?.status==='drawing')&&director.script){const b=director.script.beats?.done;lines.push({id:'dir',text:`[ OK ] direct ${director.actor?.name||''} · ${(b?.actions||[b?.action]).join(' → ')}()`+(director.tokens?` · ${director.tokens} tok`:''),state:' OK '});}
 else if(director?.status==='error')lines.push({id:'dir',text:'[ERR!] direct '+D.short(director.error,80),state:'ERR!'});
 if(director?.drawing)lines.push({id:'draw',text:'[ .. ] draw   sketching '+director.drawing.name+' · vector rig',state:' .. '});
 else if(director?.drawError)lines.push({id:'draw',text:'[ERR!] draw   '+D.short(director.drawError,80),state:'ERR!'});
 return lines;
}
// Characters that fill the actor while it thinks: the live public text.
function fillOf(graph,phase,name){
 const nodes=turnNodes(graph),pick=phase==='answer'?nodes.findLast(n=>n.kind==='answer'):nodes.findLast(n=>!['input','tool','answer'].includes(n.kind));
 const text=String(pick?.source||'').replace(/[\s\p{P}\p{S}]+/gu,'');
 return text.length>=6?text.slice(-400):String(name||'deepseek').replace(/\s+/g,'').repeat(8)||'deepseek';
}
function codeLine(line,size,widthPx){
 const cols=Math.max(4,Math.floor(widthPx/(size*.6)));let used=0,out='';
 for(const ch of String(line).replace(/\t/g,'    ').replace(/\s+$/,'')){used+=span(ch);if(used>cols)return out.slice(0,-1)+'…';out+=ch;}
 return out;
}
// The answer as it is written, Markdown marks removed; code goes to the terminal.
function answerOf(graph){
 const nodes=turnNodes(graph).filter(n=>n.kind==='answer');
 if(!nodes.length)return null;
 const raw=nodes.map(n=>n.source).join('\n');
 // Tables lose their separator row and read as columns.
 const row=l=>/^\s*\|.*\|\s*$/.test(l)?l.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim()).join('  │  '):l;
 const text=raw.replace(/```[\s\S]*?(```|$)/g,'[code → terminal]').split('\n').filter(l=>!/^\s*\|?(\s*:?-{3,}:?\s*\|)+\s*:?-*:?\s*$/.test(l)).map(row).map(l=>l.replace(/^\s*#{1,6}\s*/,'').replace(/\*\*|__|`/g,'').replace(/^\s*[-*]\s+/,'· ')).join('\n').replace(/\n{3,}/g,'\n\n').trim();
 return text?{kind:'answer',title:'stdout · answer · '+D.length(text)+' chars',text,open:!!graph.running}:null;
}
const LABEL={idle:'standby',think:'thinking',tool:'running tool',answer:'answering',done:'done'};
// Pose frames of row sprites: the model's, when they differ visibly from the
// base; otherwise derived ones (lean left, lean right, squash).
const differs=(a,b)=>{let n=0,all=0;a.forEach((row,y)=>{for(let x=0;x<row.length;x++){all++;if(row[x]!==(b[y]?.[x]??'.'))n++;}});return n>=Math.max(3,all*.03);};
function derived(rows){
 const h=rows.length,cut=Math.floor(h*.55),shift=(row,d)=>d>0?'.'+row.slice(0,-1):row.slice(1)+'.';
 const lean=d=>rows.map((r,y)=>y<cut?shift(r,d):r);
 const squash=['.'.repeat(rows[0].length),...rows.slice(0,Math.floor(h/2)),...rows.slice(Math.floor(h/2)+1)];
 return [lean(-1),lean(1),squash];
}
function framesOf(sprite){
 const own=(sprite.frames||[]).map(f=>Array.isArray(f)?f:f?.rows).filter(f=>f&&differs(sprite.rows,f));
 return [sprite.rows,...(own.length>=2?own:[...own,...derived(sprite.rows)].slice(0,3))];
}

function spritePixels(marks,{palette,rows,frame=0,x0,y0,px,group,idPrefix,style='pixel',fill='',born,delayScale=1,pop=false}){
 const gap=px>=7?1:0,chars=[...fill];let k=0;
 rows.forEach((row,y)=>[...row].forEach((ch,x)=>{
  const color=palette[ch];if(!color)return;
  const mark={id:idPrefix+x+'_'+y,group,x:x0+x*px,y:y0+y*px,w:px-gap,h:px-gap,color,level:1,delay:((rows.length-y)*32+Math.abs(x-row.length/2)*5)*delayScale,from:born?born(x0+x*px,y0+y*px):undefined,pop};
  if(style==='glyph'&&chars.length){mark.shape='glyph';mark.ch=chars[(k+frame*row.length)%chars.length];}
  k++;marks.push(mark);
 }));
}
// Scenery behind the actor, inside the stage zone only: it fills in from the
// floor like everything else, and its parts sway, drift or twinkle.
function scenery(env,{zone,floor,s,marks,live,motions}){
 const X=zone.x,W=zone.w,top=zone.y,cell=Math.max(4,Math.round(6*s)),rnd=D.random(env.length*977+13);
 const born=(x)=>({x,y:floor});
 const block=(id,x,y,w,h,color,level,extra={})=>marks.push({id:'env_'+id,x:Math.round(x),y:Math.round(y),w:Math.max(1,Math.round(w)),h:Math.max(1,Math.round(h)),color,level,delay:extra.delay??0,from:extra.from||born(x),group:extra.group,blink:extra.blink});
 const blob=(id,cx,cy,rx,ry,color,level,group,cut=null)=>{let k=0;for(let y=-ry;y<=ry;y+=cell)for(let x=-rx;x<=rx;x+=cell){if((x/rx)**2+(y/ry)**2>1)continue;if(cut&&((x-cut[0])/rx)**2+((y-cut[1])/ry)**2<=1)continue;block(id+'_'+k++,cx+x,cy+y,cell-1,cell-1,color,level,{group,delay:60+k*5});}};
 // A tint that fills up from the floor in bands.
 const tint=(color,level,from=top)=>{const band=Math.max(cell*2,Math.round((floor-from)/14));for(let y=floor-band,i=0;y>=from-1;y-=band,i++)block('t'+i,X,Math.max(from,y),W,Math.min(band,y+band-from),color,level*(0.55+0.45*(1-i/14)),{delay:i*45});};
 const stars=(n,color='#ffe08a')=>{for(let i=0;i<n;i++){const x=X+rnd()*W,y=top+rnd()*(floor-top)*.75,d=rnd()<.25?2:1;block('s'+i,x,y,d*Math.max(2,s*2),d*Math.max(2,s*2),i%5?'ink':color,.4+rnd()*.5,{blink:i%3===0,delay:i*15,from:{x,y:y+30}});}};
 if(env==='water'){
  const surface=top+20*s;
  tint('#2a6fdb',.16,surface);
  live.push({type:'waves',x0:X,x1:X+W,y:surface,amp:4*s,color:'accent'},{type:'bubbles',x0:X+W*.05,x1:X+W*.95,y0:surface,y1:floor,count:14,color:'#bfe3ff'});
  for(let i=0;i<3;i++){const x0=X+W*(.15+i*.3);for(let k=0;k<14&&surface+k*14*s<floor-cell*3;k++)block('ray'+i+'_'+k,x0+k*7*s,surface+k*14*s,Math.max(2,2*s),Math.max(2,2*s),'#bfe3ff',.18,{delay:300+k*30});}
  for(let x=X,i=0;x<X+W;x+=cell,i++)block('sand'+i,x,floor-cell*(1+(i%5===0?1:0)),cell-1,cell*(1+(i%5===0?1:0)),'#c2a36b',.45,{delay:i*6});
  [.08,.22,.78,.9].forEach((f,i)=>{const x=X+W*f,h=Math.round((3+rnd()*4)*cell);for(let k=0;k*cell<h;k++)block('weed'+i+'_'+k,x+(k%2?cell*.5:0),floor-cell-(k+1)*cell,cell-1,cell-1,i%2?'#3fa66b':'#2c8a57',.85,{group:'env_weed'+i,delay:200+k*40});motions.push({group:'env_weed'+i,type:'sway',cx:x,cy:floor-cell,size:h,span:cell,seed:i*1.7});});
 }else if(env==='sky'){
  tint('#5aa9ff',.1);
  blob('sun',X+W*.86,top+40*s,26*s,26*s,'#ffe08a',.75);
  [[.2,.22,30],[.55,.12,24],[.72,.36,34]].forEach(([fx,fy,r],i)=>{const cx=X+W*fx,cy=top+(floor-top)*fy+20*s;r*=s;[[-.7,.1,.55,.42],[0,-.2,.7,.6],[.75,.12,.55,.4]].forEach(([dx,dy,rx,ry],j)=>blob('cloud'+i+'_'+j,cx+dx*r,cy+dy*r,rx*r,ry*r,'#eef4ff',.55,'env_cloud'+i));const fx_=fx,ry=r*.6;motions.push({group:'env_cloud'+i,type:'drift',cx:X+W*fx_,cy:top,size:ry,span:W*.25,seed:i*2.1});});
 }else if(env==='space'||env==='night'){
  tint(env==='space'?'#2b1d6b':'#0b1d4a',.2);
  stars(env==='space'?46:30);
  if(env==='space'){blob('planet',X+W*.82,top+60*s,30*s,30*s,'#c792ea',.7);for(let a=0;a<28;a++){const t=a/28*Math.PI*2;block('ring'+a,X+W*.82+Math.cos(t)*48*s,top+60*s+Math.sin(t)*10*s,cell-1,Math.max(2,cell/2),'#ffd1a6',.75,{delay:400+a*12});}}
  else blob('moon',X+W*.84,top+48*s,26*s,26*s,'#fff3c4',.85,undefined,[10*s,-8*s]);
 }else if(env==='grass'){
  tint('#8fd4ff',.06);
  for(let x=X,i=0;x<X+W;x+=cell,i++){const h=cell*(1+(rnd()<.35?1:0));block('g'+i,x,floor-h,cell-1,h,i%3?'#3fa66b':'#5cc47e',.8,{delay:i*6,group:i%4===0?'env_blades':undefined});}
  motions.push({group:'env_blades',type:'sway',cx:X+W/2,cy:floor,size:cell*2,span:W,seed:.4});
  [.12,.3,.7,.88].forEach((f,i)=>{const x=X+W*f;block('fs'+i,x,floor-cell*3,Math.max(2,s*2),cell*2,'#2c8a57',.9,{delay:300+i*40,group:'env_flower'+i});block('fh'+i,x-cell*.5,floor-cell*3.8,cell,cell,['#ff6f91','#ffe08a','#c792ea','#ff9f1c'][i],.95,{delay:340+i*40,group:'env_flower'+i});motions.push({group:'env_flower'+i,type:'sway',cx:x,cy:floor-cell,size:cell*3,span:cell,seed:i});});
  [[-.7,.1,.55,.42],[0,-.2,.7,.6],[.75,.12,.55,.4]].forEach(([dx,dy,rx,ry],j)=>blob('cloud_'+j,X+W*.25+dx*28*s,top+34*s+dy*28*s,rx*28*s,ry*28*s,'#eef4ff',.4,'env_cloud'));motions.push({group:'env_cloud',type:'drift',cx:X+W*.25,cy:top,size:14*s,span:W*.25,seed:1});
 }else if(env==='snow'){
  tint('#cfe3ff',.06);
  for(let x=X,i=0;x<X+W;x+=cell,i++)block('sn'+i,x,floor-cell*(1+(i%7<2?1:0)),cell-1,cell*(1+(i%7<2?1:0)),'#f4f8ff',.8,{delay:i*6});
  live.push({type:'snow',x0:X,x1:X+W,y0:top,y1:floor-cell,count:46,color:'#f4f8ff'});
 }else if(env==='city'){
  tint('#2b1d6b',.12);
  for(let x=X,i=0;x<X+W-cell*3;i++){const w=cell*(3+Math.floor(rnd()*4)),h=(floor-top)*(.25+rnd()*.45);block('b'+i,x,floor-h,w-2,h,'#3d4b62',.55,{delay:i*40});for(let wy=floor-h+cell;wy<floor-cell;wy+=cell*1.6)for(let wx=x+cell*.6;wx<x+w-cell;wx+=cell*1.4)if(rnd()<.45)block('w'+i+'_'+Math.round(wx)+'_'+Math.round(wy),wx,wy,cell*.6,cell*.7,'#ffe08a',.75,{blink:rnd()<.15,delay:200+i*40});x+=w+cell*.6;}
  stars(12);
 }else if(env==='stage'){
  for(const side of [0,1])for(let i=0;i<5;i++){const x=side?X+W-(i+1)*cell*1.2:X+i*cell*1.2;block('cur'+side+'_'+i,x,top,cell,floor-top-(4-i)*cell*2,'#b0324a',.55-i*.07,{delay:i*60});}
  for(let x=X,i=0;x<X+W;x+=cell*3,i++)block('bd'+i,x,floor-2,cell*3-2,2,'#d9b878',.7,{delay:i*10});
 }
}
function buildActorScene({box,actor,look=null,frames=null,move=null,beat,act,phase,terminal,output,mood,effects=[],props=[],pending=false,drawing=null,frame=0,style='pixel',fill='',log=[],swap=false,env='none',roomy=null,program=null}){
 const A=area(box),s=A.s;
 look=look||lookOf(actor);
 const sets=frames||framesOfLook(look,act||beat?.action,move),palette=paletteOf(look),base=sets[0],sw=base[0].length,sh=base.length;
 // One window at most: the terminal (code, shell) or the answer being written.
 const panel=terminal||output,action=act||beat?.action||'idle',term=!!panel,marks=[],texts=[],live=[],motions=[];
 const travels=TRAVEL.includes(action)||(move&&move.travel!=='none');
 // The layout follows the whole beat, so it does not jump between its actions.
 const wide=roomy??((beat?.actions||[action]).some(a=>TRAVEL.includes(a))||travels);
 // Zones: heading band (from area), stage, log band. Nothing is drawn across zones.
 const logSize=Math.max(10,Math.round(12*s)),logLh=Math.round(logSize*1.6),logLines=log.slice(-(term?3:4)),logH=logLines.length?logLines.length*logLh+logSize:0;
 const logTop=A.bottom-logH,floor=Math.round(logTop-(logH?16:6)*s);
 const top=A.y+(term?0:24*s);
 const zone=term?{x:A.x,y:top+30*s,w:A.w*(wide?.42:.3),h:floor-top-30*s}:{x:A.x+A.w*.04,y:top,w:A.w*.92,h:floor-top};
 // Beside a window, or crossing the stage, the actor is smaller.
 let px=Math.max(3,Math.min(30,Math.floor(Math.min(zone.w*(wide?(term?.62:.42):.66)/sw,zone.h*(term?.56:wide?.5:.78)/sh))));
 if(style==='glyph'&&px<12)style='pixel';
 const ox=Math.round(zone.x+(zone.w-sw*px)/2),oy=floor-sh*px,cx=ox+sw*px/2;
 if(env&&env!=='none')scenery(env,{zone,floor,s,marks,live,motions});
 const rows=sets[frame%sets.length];
 spritePixels(marks,{palette,rows,frame,x0:ox,y0:oy,px,group:'actor',idPrefix:'a',style,fill,pop:swap,born:(x,y)=>({x,y:A.bottom+12})});
 motions.unshift({group:'actor',type:move?'move:'+(move.name||'custom'):action,move:move||undefined,cx,cy:floor,size:sh*px,span:zone.w*.6,range:Math.max(0,(zone.w-sw*px)/2-6*s),rangeY:Math.max(0,oy-zone.y-6*s),facing:facingOf(look),fx:fxOf(action,move,env)||undefined});
 // Floor (scenery with its own ground replaces it).
 if(!['water','grass','snow'].includes(env)){const fl=Math.max(6,Math.round(8*s)),fx0=zone.x+zone.w*.04,fx1=zone.x+zone.w*.96;
  for(let x=fx0,i=0;x<fx1;x+=fl*1.6,i++)marks.push({id:'floor'+i,x,y:floor+5*s,w:fl,h:Math.max(1,1.5*s),color:'muted',level:.55,delay:i*12,from:{x:fx0,y:floor+5*s}});}
 // While a new look is being drawn: a blueprint frame with a scanning beam.
 if(drawing){
  const bw=Math.min(zone.w*.5,zone.h*.9),bx=zone.x+(zone.w-bw)/2,by=floor-bw,dot=Math.max(2,Math.round(3*s));
  for(let i=0;i<=24;i++){const u=i/24;for(const [x,y,k] of [[bx+u*bw,by,'t'],[bx+u*bw,floor,'b'],[bx,by+u*bw,'l'],[bx+bw,by+u*bw,'r']])marks.push({id:'bp'+k+i,x,y,w:dot,h:dot,color:'accent',level:i%4?.35:.9,delay:i*20,blink:i%6===0,from:{x:bx+bw/2,y:floor}});}
  live.push({type:'sweep',x0:bx,x1:bx+bw,y0:by,y1:floor,period:1600,color:'accent'});
 }
 // Props beside, above or in front of the actor; each has its own motion.
 let aboveTaken=false;
 props.slice(0,2).forEach((p,i)=>{
  const ps=p.sprite,ppx=Math.max(3,Math.round(px*(wide?.8:.6))),pw=ps.w*ppx,ph=ps.h*ppx;
  let x,y;
  if(p.place==='left'){x=ox-pw-14*s;y=floor-ph-sh*px*.25;}
  else if(p.place==='above'){x=cx-pw/2;y=oy-ph-18*s;aboveTaken=true;}
  else if(p.place==='ground'){x=ox+sw*px+8*s;y=floor-ph;}
  else{x=ox+sw*px+14*s;y=floor-ph-sh*px*.25;}
  // With a terminal open, props stay on the actor's side of the stage.
  x=Math.max(A.x,Math.min((term?zone.x+zone.w:A.right)-pw,x));y=Math.max(A.y,y);
  spritePixels(marks,{palette:ps.palette,rows:ps.rows,x0:Math.round(x),y0:Math.round(y),px:ppx,group:'prop'+i,idPrefix:'p'+i+'_',pop:swap,delayScale:.6,born:(bx,by)=>({x:bx,y:A.bottom+12})});
  if(p.motion!=='none')motions.push({group:'prop'+i,type:p.motion,cx:x+pw/2,cy:y+ph,size:ph,span:pw});
 });
 // Stage lights for lively actions: dotted beams from the top corners.
 if((LIGHTS.includes(action)||env==='stage')&&!term&&!['water','space','night'].includes(env)){
  const dot=Math.max(2,Math.round(3*s)),targets=[[A.x+8,A.y-6],[A.right-8,A.y-6]];
  targets.forEach(([lx,ly],side)=>{for(let i=0;i<26;i++){const u=i/25,x=lx+(cx+(side?1:-1)*sw*px*.2-lx)*u,y=ly+(oy+sh*px*.4-ly)*u;marks.push({id:'beam'+side+'_'+i,x,y,w:dot,h:dot,color:side?'#ffe08a':'accent',level:.15+.35*u,blink:i%3===side,delay:200+i*18,from:{x:lx,y:ly}});}});
 }
 // Heading and the object register (as in the reference's me.name = ...).
 const big=Math.max(17,Math.round(26*s)),small=Math.max(10,Math.round(12*s)),show=program&&program.length>1?program:beat?.actions||[action],at=Math.max(0,show.indexOf(action));
 const seq=show.length>1?`${action}()  [${at+1}/${show.length}] → ${show[(at+1)%show.length]}`:action;
 texts.push({key:'head',text:actor?.name||WHALE.name,x:A.pad,y:A.pad+big,size:big,color:'accent',weight:700},
  {key:'sub',text:drawing?`sketching · ${drawing.name}`:`${LABEL[phase]||phase} · ${action}()`,x:A.pad,y:A.pad+big+small+8,size:small,color:drawing?'accent':'ink',level:.8});
 const reg=[`me.name   = "${drawing?drawing.name:actor?.name||WHALE.name}"`,`me.action = ${seq}${show.length>1?'()':''}`,`me.phase  = ${phase}`].concat(env&&env!=='none'?[`me.scene  = ${env}`]:[]).concat(mood?[`me.mood   = "${mood}"`]:[]);
 if(!term)reg.forEach((line,i)=>texts.push({key:'reg'+i,text:fit(line,small,A.w*.4),x:A.right-A.w*.4,y:A.pad+small*(1.2+i*1.5),size:small,color:'ink',level:.7,delay:200+i*90}));
 // Speech bubble with a pixel border: over the head, beside it when something
 // sits above or the action leaps, and pinned at the top when the actor travels.
 const say=drawing?'正在画新的样子…':pending?'正在读你的话…':beat?.say;
 if(say){
  const size=Math.max(12,Math.round(15*s)),lines=wrap(say,22,3),bw=Math.max(...lines.map(span))*size*.6+24,bh=lines.length*size*1.5+16;
  const beside=!term&&!travels&&(aboveTaken||(beat?.actions||[action]).some(a=>['jump','surprised','grow','explode','happy','cheer','flip'].includes(a))),limit=term?zone.x+zone.w+A.w*.02:A.right;
  const bx=travels?Math.round(zone.x+(zone.w-bw)/2):Math.max(A.x,Math.min(limit-bw,beside?ox+sw*px+12*s:cx-bw*.2));
  const by=travels?Math.round(top-6*s):Math.max(A.y-10*s,beside?oy-bh*.4:oy-bh-22*s);
  const dot=Math.max(3,Math.round(4*s)),stepB=dot+2,fromHead={x:cx,y:oy};let n=0;
  for(let x=bx;x<=bx+bw;x+=stepB){marks.push({id:'bb'+n++,x,y:by,w:dot,h:dot,color:'ink',level:.95,delay:120+Math.abs(x-cx)/3,from:fromHead,pop:swap});marks.push({id:'bb'+n++,x,y:by+bh,w:dot,h:dot,color:'ink',level:.95,delay:120+Math.abs(x-cx)/3,from:fromHead,pop:swap});}
  for(let y=by+stepB;y<by+bh;y+=stepB){marks.push({id:'bb'+n++,x:bx,y,w:dot,h:dot,color:'ink',level:.95,delay:200,from:fromHead,pop:swap});marks.push({id:'bb'+n++,x:bx+bw,y,w:dot,h:dot,color:'ink',level:.95,delay:200,from:fromHead,pop:swap});}
  if(!travels)[0,1,2].forEach(i=>marks.push({id:'tail'+i,x:bx+bw*.22-i*stepB,y:by+bh+stepB*(i+1),w:dot,h:dot,color:'ink',level:.95-i*.2,delay:180+i*30,from:fromHead,pop:swap}));
  lines.forEach((line,i)=>texts.push({key:'say'+i,text:line,x:bx+12,y:by+12+size*(i*1.5+.95),size,color:'ink',delay:300+i*160}));
 }else if(phase==='think'){
  live.push({type:'dots',x:cx-12*s,y:oy-24*s,size:Math.round(6*s),gap:Math.round(11*s),color:'accent'});
 }
 // Effects: glyphs float up from the actor (across the stage when it travels).
 for(const name of effects){
  if(name==='rain'){live.push({type:'rain',x0:travels?zone.x:ox,x1:travels?zone.x+zone.w:ox+sw*px,y0:oy-60*s,y1:floor,color:'accent'});continue;}
  if(name==='bubbles'){if(env!=='water')live.push({type:'bubbles',x0:zone.x,x1:zone.x+zone.w,y0:zone.y,y1:floor,count:12,color:'#bfe3ff'});continue;}
  if(name==='snow'){if(env!=='snow')live.push({type:'snow',x0:zone.x,x1:zone.x+zone.w,y0:zone.y,y1:floor,count:36,color:'#f4f8ff'});continue;}
  if(name==='confetti'){live.push({type:'confetti',x0:zone.x,x1:zone.x+zone.w,y0:zone.y,y1:floor,count:34});continue;}
  if(name==='fire'){live.push({type:'fire',x0:ox,x1:ox+sw*px,y:floor,rise:sh*px*.6});continue;}
  const e=EFFECT_GLYPHS[name];if(!e)continue;
  const wide=travels?zone.w*.8:sw*px;
  live.push({type:'float',glyphs:e.glyphs,color:e.color,x:travels?zone.x+zone.w/2:cx+(name==='zzz'?sw*px*.35:0),y:oy-8*s,count:e.count||5,spread:wide/(e.count||5),rise:90*s,size:Math.round((e.count?26:18)*s),period:2600});
 }
 // Log band.
 if(logLines.length){
  for(let x=A.x,i=0;x<A.right;x+=10*s,i++)marks.push({id:'sep'+i,x,y:logTop-4*s,w:5*s,h:1,color:'line',level:.9,delay:i*4,from:{x:A.x,y:logTop-4*s}});
  logLines.forEach((l,i)=>texts.push({key:'log'+l.id,text:fit(l.text,logSize,A.w),x:A.x,y:logTop+logSize*1.2+i*logLh,size:logSize,color:l.state==='ERR!'?'danger':l.state===' .. '?'accent':'ink',level:i===logLines.length-1?1:.72,delay:i*90}));
 }
 if(panel){
  const wx=Math.round(A.x+A.w*(wide?.46:.34)),wy=Math.round(A.y-12*s),ww=Math.round(A.right-wx),wh=Math.round(floor+6*s-wy),bar=Math.round(22*s),seg=Math.max(8,Math.round(10*s));
  const born=()=>({x:wx+ww/2,y:A.bottom+16}),order=(x,y)=>Math.hypot(x-(wx+ww/2),y-(wy+wh))/2.2;
  // The window assembles from the floor: border segments, then the title bar.
  for(let x=wx,i=0;x<wx+ww-4;x+=seg,i++){for(const y of [wy,wy+wh-2])marks.push({id:'tw'+i+'_'+y,x,y,w:seg-3,h:2,color:'accent',level:.9,delay:order(x,y),from:born(),pop:swap});}
  for(let y=wy+seg,i=0;y<wy+wh-4;y+=seg,i++){for(const x of [wx,wx+ww-2])marks.push({id:'th'+i+'_'+x,x,y,w:2,h:seg-3,color:'accent',level:.9,delay:order(x,y),from:born(),pop:swap});}
  for(let x=wx+2,i=0;x<wx+ww-4;x+=seg,i++)marks.push({id:'tb'+i,x,y:wy+2,w:seg,h:bar,color:'accent',level:.16,delay:200+i*4,from:born(),pop:swap});
  ['#f07470','#d9b878','#96c4b4'].forEach((color,i)=>marks.push({id:'tl'+i,x:wx+10*s+i*14*s,y:wy+bar/2-3*s,w:8*s,h:8*s,color,level:1,delay:320+i*40,from:born(),pop:swap}));
  const answer=panel.kind==='answer',size=Math.max(11,Math.round((answer?14:13)*s)),lh=Math.round(size*(answer?1.65:1.5)),room=Math.max(2,Math.floor((wh-bar-24)/lh)),lines=answer?wrap(panel.text,Math.max(10,Math.floor((ww-28)/(size*.6))),400):panel.lines,first=Math.max(0,lines.length-room),numW=panel.kind==='code'?size*2.4:0;
  texts.push({key:'ttitle',text:fit(panel.title,small,ww-120*s),x:wx+ww/2,y:wy+bar/2+small*.35,size:small,color:'ink',align:'center',delay:350});
  lines.slice(first).forEach((line,i)=>{
   const n=first+i,y=wy+bar+12+size+i*lh,shell=panel.kind==='shell'||panel.kind==='prompt';
   if(numW)texts.push({key:'tn'+n,text:String(n+1).padStart(2,'0'),x:wx+12,y,size:size-2,color:'muted',delay:420+i*60});
   texts.push({key:'tc'+n,text:(answer?line:codeLine(line,size,ww-28-numW))||' ',x:wx+12+numW,y,size,color:shell&&line.startsWith('$ ')?'accent':'ink',level:shell&&!line.startsWith('$ ')?.8:1,delay:450+i*60});
  });
  const lastLine=lines.at(-1)||'',ly=wy+bar+12+Math.min(lines.length-first,room)*lh-lh;
  if(panel.open)live.push({type:'cursor',x:wx+12+numW+Math.min(span(lastLine),(ww-28-numW)/(size*.6))*size*.6+2,y:ly+4,w:size*.55,h:size,color:'accent'});
 }
 return {marks,texts,live,motions,swap,baseline:A.bottom};
}
module.exports={WHALE,TEMPO,TRAVEL,CYCLE_FRAMES,fxOf,programOf,phaseOf,terminalOf,answerOf,logOf,fillOf,buildActorScene,framesOf,lookOf,framesOfLook,paletteOf};

},
"./stage-intro.cjs": function(module,exports,require){
'use strict';
// Opening sequence, after the reference PV's boot: a protect log with a '#'
// shield, modules loading into a grid, a pixel growing into `me = Object()`,
// a neofetch of the real setup, a 3-2-1 countdown made of digits, then RUN.
// Every value shown is real (version, session, model, director, actor, counts).
// The same particle engine draws it, so each step morphs into the next.
const {createEngine}=require('./stage-engine.cjs');
const D=require('./stage-data.cjs');

const fmt=n=>Math.round(n).toLocaleString('en-US');
function frame(box){
 const s=Math.max(.7,Math.min(1.6,Math.min(box.w/1100,box.h/640))),pad=Math.round(36*s);
 return {s,pad,x:pad,y:pad,w:box.w-pad*2,h:box.h-pad*2,right:box.w-pad,bottom:box.h-pad,size:Math.round(14*s)};
}
const typed=(F,lines,x,y,color='ink',lh=1.55,delay=0,per=130)=>lines.map((line,i)=>({key:'t'+i+':'+line.slice(0,6),text:line,x,y:y+i*F.size*lh,size:F.size,color:/^\[WARN\]/.test(line)?'#e9b949':/^\$/.test(line)?'accent':color,delay:delay+i*per}));

function protect(box,info){
 const F=frame(box),marks=[];
 const lines=['$ ./thought-window --attach',`[ OK ] dsh web: connected`,`[ OK ] session: ${String(info.session||'—').slice(0,12)}`,`[ OK ] model: ${info.model||'default selection'}`,'[ OK ] public trace channel: open',
  `[ OK ] stage: ${info.figures} figures · ${info.actions} actions`,`[ OK ] director: ${info.director?'online':'off'}`,...(info.director?['[WARN] director: +1 model call per message']:[]),`[ OK ] actor: ${info.actor}`];
 // A shield drawn with '#', as in the reference.
 const cx=F.x+F.w*.72,top=F.y+F.h*.12,wd=F.w*.2,ht=F.h*.66,g=Math.round(12*F.s);let n=0;
 const add=(x,y,ch='#',level=.9)=>marks.push({id:'sh'+n++,shape:'glyph',ch,x,y,w:g,h:g,color:'ink',level,delay:n*9,from:{x,y:F.bottom}});
 for(let x=cx-wd;x<=cx+wd;x+=g*.8)add(x,top);
 for(let u=0;u<=1;u+=.045){const y=top+u*ht,half=wd*(1-Math.pow(u,1.8));add(cx-half,y);add(cx+half,y);}
 const rng=D.random(7);for(let i=0;i<26;i++){const u=rng()*.75,y=top+g*2+u*ht*.85,half=wd*(1-Math.pow(u,1.8))*.8;add(cx+(rng()*2-1)*half,y,'·',.6);}
 return {marks,texts:typed(F,lines,F.x,F.y+F.size,'ink',1.6,100,170),live:[{type:'cursor',x:F.x,y:F.y+F.size*(lines.length*1.6+.6),w:F.size*.55,h:F.size}]};
}
function load(box,info){
 const F=frame(box),cols=24,rows=4,cw=Math.floor(F.w/cols),chh=Math.round(cw*.62),total=info.figures+info.actions,marks=[],texts=[];
 for(let i=0;i<cols*rows;i++){
  const c=i%cols,r=Math.floor(i/cols),x=F.x+c*cw,y=F.y+r*(chh+6),loaded=i<total;
  marks.push({id:'c'+i,shape:loaded?'cell':'frame',ch:loaded&&chh>=12?String(i+1).padStart(3,'0').slice(-2):undefined,x,y,w:cw-4,h:chh,color:loaded?'ink':'muted',level:loaded?.55+.4*((i*37)%10)/10:.35,delay:i*22,from:{x,y:F.bottom}});
 }
 const by=F.y+rows*(chh+6)+F.size*3;
 texts.push({key:'file',text:`stage-${String(total).padStart(5,'0')}.figures`,x:F.x,y:by,size:F.size,color:'ink',delay:200},{key:'loaded',text:`modules loaded   {n} / ${total}`,count:{to:total},x:F.x,y:by+F.size*1.8,size:F.size,color:'ink',delay:250});
 const bw=F.w*.6,segs=40;for(let i=0;i<segs;i++)marks.push({id:'bar'+i,x:F.x+i*bw/segs,y:by+F.size*3,w:bw/segs-2,h:Math.max(4,F.size*.6),color:'accent',level:.9,delay:300+i*30,from:{x:F.x,y:by+F.size*3}});
 return {marks,texts};
}
function object(box,info){
 const F=frame(box),sprite=info.sprite,marks=[],cw=Math.min(F.w*.24,F.h*.62),chh=cw*1.25,x0=F.x+F.w*.08,y0=F.y+F.h*.12;
 // The pixel grows into a frame; the actor assembles inside it.
 const step=Math.max(6,Math.round(9*F.s));let n=0;
 for(let x=x0;x<=x0+cw;x+=step){marks.push({id:'ob'+n++,x,y:y0,w:step-3,h:2,color:'ink',level:.9,delay:Math.abs(x-x0-cw/2)*1.2,from:{x:x0+cw/2,y:y0+chh/2}});marks.push({id:'ob'+n++,x,y:y0+chh,w:step-3,h:2,color:'ink',level:.9,delay:Math.abs(x-x0-cw/2)*1.2,from:{x:x0+cw/2,y:y0+chh/2}});}
 for(let y=y0+step;y<y0+chh;y+=step){marks.push({id:'ob'+n++,x:x0,y,w:2,h:step-3,color:'ink',level:.9,delay:Math.abs(y-y0-chh/2)*1.2,from:{x:x0+cw/2,y:y0+chh/2}});marks.push({id:'ob'+n++,x:x0+cw,y,w:2,h:step-3,color:'ink',level:.9,delay:Math.abs(y-y0-chh/2)*1.2,from:{x:x0+cw/2,y:y0+chh/2}});}
 if(sprite){const rows=sprite.rows,px=Math.max(3,Math.floor(Math.min(cw*.7/rows[0].length,chh*.55/rows.length))),ox=x0+(cw-rows[0].length*px)/2,oy=y0+(chh-rows.length*px)/2;
  rows.forEach((row,yy)=>[...row].forEach((ch,xx)=>{const color=sprite.palette[ch];if(color)marks.push({id:'px'+xx+'_'+yy,x:ox+xx*px,y:oy+yy*px,w:px-1,h:px-1,color,level:1,delay:500+(rows.length-yy)*30,from:{x:x0+cw/2,y:y0+chh/2}});}));}
 const main=sprite?Object.values(sprite.palette)[1]||Object.values(sprite.palette)[0]:'#4d6bfe';
 const reg=[`me = Object()`,``,`me.name     = "${info.actor}"`,`me.species  = "pixel actor"`,`me.home     = "dsh://session/${String(info.session||'').slice(0,8)}"`,`me.owner    = you`,`me.color    = ${main}`,`me.status   = "alive"`];
 return {marks,texts:typed(F,reg,x0+cw+F.w*.08,y0+F.size,'ink',1.75,600,160)};
}
function neofetch(box,info){
 const F=frame(box),pairs=[['"plugin"',`"thought-window ${info.version}"`],['"model"',`"${info.model||'default'}"`],['"figures"',String(info.figures)],['"actions"',String(info.actions)],['"reading_dwell"',`"${info.dwell}s"`],['"session_turns"',String(info.turns)],['"director"',info.director?'"online"':'"off"'],['"owner"','"you"']];
 const x=F.x+F.w*.42,texts=[{key:'cmd',text:'$ neofetch',x:F.x,y:F.y+F.size,size:F.size,color:'accent'}];
 pairs.forEach(([k,v],i)=>texts.push({key:'k'+i,text:k+':',x,y:F.y+F.size*(2+i*1.7),size:F.size,color:'ink',delay:200+i*150},{key:'v'+i,text:v,x:x+F.size*11,y:F.y+F.size*(2+i*1.7),size:F.size,color:'ink',level:.85,delay:280+i*150}));
 const big=Math.round(F.size*2.4);
 texts.push({key:'big',text:'{n} chars observed',count:{to:info.chars},x,y:F.bottom-big*.6,size:big,color:'accent',weight:700,delay:400},{key:'bigsub',text:`${info.turns} turns · ${info.nodes} public events`,x,y:F.bottom-big*.6+F.size*1.6,size:F.size,color:'muted',delay:600});
 return {marks:[],texts};
}
function digit(box,info,d){
 const F=frame(box),size=Math.round(Math.min(F.h*.7,F.w*.3)),step=Math.max(6,Math.round(size/26)),r=box.raster?.(String(d),size,step),marks=[];
 if(r){const ox=(box.w-r.w)/2,oy=(box.h-r.h)/2;r.points.forEach((p,i)=>marks.push({id:'d'+i,shape:'glyph',ch:String(d),x:ox+p.x,y:oy+p.y,w:step,h:step,color:'ink',level:.95,delay:0,from:{x:ox+p.x,y:F.bottom}}));}
 return {marks,texts:[{key:'pop',text:`world.population = 2  (${info.actor}, you)`,x:F.x,y:F.bottom,size:F.size,color:'ink'}]};
}
function run(box,info){
 const F=frame(box),size=Math.round(Math.min(F.h*.32,F.w*.18)),step=Math.max(5,Math.round(size/24)),r=box.raster?.('RUN',size,step),marks=[];
 const ox=F.x+F.w*.18,oy=F.y+F.h*.2;
 if(r)r.points.forEach((p,i)=>marks.push({id:'r'+i,x:ox+p.x,y:oy+p.y,w:step-1,h:step-1,color:'ink',level:1,delay:p.x/3,from:{x:ox+p.x,y:F.bottom}}));
 const ty=oy+(r?r.h:size)+F.size*2.5;
 return {marks,texts:[{key:'s1',text:'stage: running',x:ox,y:ty,size:Math.round(F.size*1.3),color:'ink',delay:300},{key:'s2',text:`director: ${info.director?'1 call / message':'off'}`,x:ox,y:ty+F.size*2.2,size:Math.round(F.size*1.1),color:'ink',level:.8,delay:450}]};
}
// Step timeline in ms; the countdown steps share one key so digits morph.
function introSteps(info){
 return [[0,'protect',b=>protect(b,info)],[2300,'load',b=>load(b,info)],[4100,'object',b=>object(b,info)],[6100,'neofetch',b=>neofetch(b,info)],
  [7900,'3',b=>digit(b,info,3)],[8500,'2',b=>digit(b,info,2)],[9100,'1',b=>digit(b,info,1)],[9700,'run',b=>run(b,info)],[11000,'end',null]];
}
// Keep the claim on this Document, so it survives conversation remounts and
// module hot reloads, but resets when the browser loads a fresh page.
const SHOWN=Symbol.for('dsh-thought-window.intro-shown');
function claimIntro(){
 const page=globalThis.document||globalThis;
 if(page[SHOWN])return false;
 page[SHOWN]=true;
 // When upgrading from <= 0.14.3 without refreshing, honor an opening already
 // shown during this navigation. A previous page's legacy timestamp is ignored.
 try{const legacy=Number(sessionStorage.getItem('tw:intro-shown'));if(legacy>0&&Number.isFinite(performance.timeOrigin)&&legacy>=performance.timeOrigin)return false;}catch{}
 return true;
}
function Intro({info,onDone}){
 // React is the host's; required here so the step builders stay testable in Node.
 const {createElement:h,useEffect,useRef,useState}=require('react');
 const canvas=useRef(null),[leaving,setLeaving]=useState(false);
 useEffect(()=>{
  const e=createEngine(canvas.current,{animate:true,motion:'rich'}),timers=[];
  const finish=()=>{setLeaving(true);timers.push(setTimeout(onDone,450));};
  // DSH may still be laying out (a 0-wide frame while it reconnects): the
  // timeline starts only once the stage has a usable size.
  let started=false;
  const start=()=>{
   if(started||!canvas.current)return;
   const r=canvas.current.getBoundingClientRect();if(r.width<320||r.height<200)return;
   started=true;e.resize();
   for(const [at,key,build] of introSteps(info))timers.push(setTimeout(()=>build?e.show(key==='3'||key==='2'||key==='1'?'count'+key:key,build):finish(),at));
  };
  timers.push(setTimeout(()=>{if(!started)finish();},20000));
  const skip=event=>{if(event.type==='keydown'&&['Shift','Control','Alt','Meta'].includes(event.key))return;timers.forEach(clearTimeout);finish();};
  const observer=new ResizeObserver(()=>{e.resize();start();});observer.observe(canvas.current);start();
  document.addEventListener('keydown',skip);
  return()=>{timers.forEach(clearTimeout);observer.disconnect();document.removeEventListener('keydown',skip);e.destroy();};
 },[]);
 return h('div',{className:'tw-intro'+(leaving?' tw-intro-leaving':''),role:'presentation',title:'点击或按任意键跳过',onClick:()=>{setLeaving(true);setTimeout(onDone,450);}},
  h('canvas',{ref:canvas,className:'tw-intro-canvas','aria-hidden':true}),
  h('span',{className:'tw-intro-skip'},'点击或按任意键跳过'));
}
module.exports={Intro,introSteps,claimIntro,protect,load,object,neofetch,digit,run};

},
"./stage.cjs": function(module,exports,require){
'use strict';
// One-screen terminal stage: status line, the native chat in a framed pane,
// a canvas that draws the current reading step, an ops rail and the stdout
// token line. Every control from earlier versions lives in the ≡ menu.
const React=require('react');
const {createElement:h,useState,useEffect,useMemo,useRef,useLayoutEffect}=React;
const {useReadingQueue}=require('./process.cjs');
const {dwellMs}=require('./process-data.cjs');
const {useMotionAllowed}=require('./transition.cjs');
const {turnNodes}=require('./scenes.cjs');
const {createEngine}=require('./stage-engine.cjs');
const {buildFigure,TITLES,CAPTIONS}=require('./stage-figures.cjs');
const D=require('./stage-data.cjs');
const {PAGE_SECONDS,PAGE_NAMES,stagePages,nextPage,pacePage}=require('./stage-pages.cjs');
const {useStageDirector,useThoughtOutline,ROUTE}=require('./director.cjs');
const {Intro,claimIntro}=require('./stage-intro.cjs');
const {ACTIONS}=require('./director-script.cjs');
const {FIGURES}=require('./stage-figures.cjs');
const {runMetrics,fmtMs,fmtTok}=require('./run-metrics.cjs');
const VERSION='0.14.4';
// Legacy content-following scenes hold 5 s; actor actions retain their 4 s tempo.
const SCENE_HOLD=5000,ACTION_STEP=4000,POSE_SLOW=1.5;
// Once the reply is complete it stays readable this long, then folds away so
// the actor has the whole stage (the reply is also in the chat on the left).
const FOLD_AFTER=8000;
// A freshly arrived thought outline is shown this long, then the stage returns.
const OUTLINE_SHOW=12000;
const {WHALE,TEMPO,TRAVEL:TRAVELS,programOf,phaseOf,terminalOf,answerOf,logOf,fillOf,buildActorScene,lookOf,framesOfLook,paletteOf}=require('./stage-actor.cjs');
// DeepSeek's whale mark, read once from the host's own favicon (the plugin
// does not ship it). Until it arrives, or if it cannot be read, a hand-drawn
// whale of the same pose is used.
let markPromise=null;
function useWhaleMark(){
 const [mark,setMark]=useState(null);
 useEffect(()=>{
  markPromise=markPromise||fetch('/favicon.svg',{credentials:'same-origin'}).then(r=>r.ok?r.text():'').then(t=>{if(!/viewBox="0 0 50 50"/.test(t))return null;const d=/<path[^>]*\sd="([^"]{200,8000})"/.exec(t)?.[1];return d&&/^[\sMmLlHhVvCcSsQqTtZz0-9.,eE-]+$/.test(d)?d:null;}).catch(()=>null);
  let alive=true;markPromise.then(d=>{if(alive)setMark(d);});return()=>{alive=false;};
 },[]);
 return mark;
}
const readPref=(name,fallback)=>{try{return JSON.parse(localStorage.getItem('tw:'+name))??fallback;}catch{return fallback;}};
const writePref=(name,value)=>{try{localStorage.setItem('tw:'+name,JSON.stringify(value));}catch{}};
const pad2=n=>String(n).padStart(2,'0');
const clock=ms=>{const s=Math.max(0,Math.floor(ms/1000));return pad2(Math.floor(s/60))+':'+pad2(s%60);};
// Text entry, selects and sliders keep their keys; checkboxes and buttons do not.
const editable=t=>t&&(t.isContentEditable||/^(TEXTAREA|SELECT)$/.test(t.tagName)||t.tagName==='INPUT'&&!/^(checkbox|radio|button)$/i.test(t.type));

// Observed arrival: the turn's public character total, sampled whenever it
// changes. This is the only time series on the stage.
function useArrival(graph,turn){
 const store=useRef({turn:null,list:[],start:Date.now()});
 if(store.current.turn!==turn)store.current={turn,list:[],start:Date.now()};
 const total=useMemo(()=>turnNodes(graph).reduce((s,n)=>n.kind==='input'?s:s+n.source.length,0),[graph]);
 const list=store.current.list;
 if(list.at(-1)?.chars!==total){list.push({t:Date.now(),chars:total});if(list.length>600)list.splice(0,list.length-600);}
 return store.current;
}
function Wave({list,running}){
 const deltas=list.slice(1).map((p,i)=>p.chars-list[i].chars).slice(-90),peak=Math.max(1,...deltas);
 return h('svg',{className:'tw-stage-wave',viewBox:'0 0 180 20',preserveAspectRatio:'none','aria-hidden':true,'data-running':running?'true':'false'},
  h('line',{x1:0,x2:180,y1:10,y2:10,className:'tw-wave-axis'}),
  deltas.map((v,i)=>{const x=180-(deltas.length-i)*2,a=1+8*v/peak;return h('line',{key:i,x1:x,x2:x,y1:10-a,y2:10+a});}));
}
// The chat pane's header: the current actor as a pixel avatar, its name and
// live state. 对话 / 轨迹 drive DSH's own (hidden) tab buttons.
function PixelAvatar({sprite,size=44}){
 const ref=useRef(null);
 useEffect(()=>{
  const c=ref.current;if(!c||!sprite)return;
  const dpr=Math.min(2,globalThis.devicePixelRatio||1),x=c.getContext('2d'),rows=sprite.rows,w=rows[0].length,h=rows.length,cell=Math.max(1,Math.floor(size*.8/Math.max(w,h)));
  c.width=size*dpr;c.height=size*dpr;x.setTransform(dpr,0,0,dpr,0,0);x.clearRect(0,0,size,size);
  const ox=Math.round((size-w*cell)/2),oy=Math.round((size-h*cell)/2);
  rows.forEach((row,yy)=>[...row].forEach((ch,xx)=>{const color=sprite.palette[ch];if(color){x.fillStyle=color;x.fillRect(ox+xx*cell,oy+yy*cell,cell,cell);}}));
 },[sprite,size]);
 return h('canvas',{ref,className:'tw-chat-avatar',style:{width:size,height:size},'aria-hidden':true});
}
const PHASE_TEXT={idle:'待机',think:'思考中',tool:'调用工具中',answer:'回答中',done:'在线'};
function nativeTabs(anchor){
 const root=anchor?.closest('.tw-native-shell');
 return root?[...root.querySelectorAll(':scope > [class*="_header"] [class*="_tab"]')].filter(b=>b.tagName==='BUTTON'):[];
}
function ChatHead({actor,avatar,phase,action,model,rounds,steps,tokens,outlineTokens}){
 const ref=useRef(null),[,refresh]=useState(0);
 const tabs=nativeTabs(ref.current);
 return h(React.Fragment,null,h('div',{className:'tw-chat-head',ref},
  h(PixelAvatar,{sprite:avatar}),
  h('div',{className:'tw-chat-who'},h('b',null,actor.name),h('small',{'data-phase':phase},h('i'),(PHASE_TEXT[phase]||phase)+' · '+action+'()'+(model?' · '+model:''))),
  tabs.length?h('nav',{className:'tw-chat-tabs'},tabs.map((tab,i)=>h('button',{type:'button',key:i,'aria-pressed':/Active/.test(tab.className),onClick:()=>{tab.click();setTimeout(()=>refresh(n=>n+1),50);}},tab.textContent))):null),
  h('div',{className:'tw-chat-foot'},`${rounds} 轮 · ${steps} 步`+(tokens?` · 导演 ${tokens.toLocaleString('en-US')} tok`:'')+(outlineTokens?` · 提纲 ${outlineTokens.toLocaleString('en-US')} tok`:'')));
}
function Tokens({entry,seconds,playing,onOpen}){
 const list=useMemo(()=>D.words(entry?.text).slice(0,180),[entry?.text]);
 const [t0]=useState(()=>Date.now()),[now,setNow]=useState(t0);
 const row=useRef(null);
 useEffect(()=>{if(!playing)return;const timer=setInterval(()=>setNow(Date.now()),110);return()=>clearInterval(timer);},[playing]);
 // Chips type out over the first ~60% of the step; paused steps show the whole sentence.
 const shown=playing?Math.max(1,Math.min(list.length,Math.ceil(list.length*(now-t0)/(dwellMs(entry,seconds)*.6)))):list.length;
 useLayoutEffect(()=>{if(row.current)row.current.scrollLeft=row.current.scrollWidth;},[shown,list.length]);
 const base=entry?.spans?.[0]?.start||0;
 return h('button',{type:'button',className:'tw-stage-tokens',ref:row,onClick:onOpen,title:'打开这一句的完整原文'},
  h('b',{'aria-hidden':true},'>'),
  entry?list.slice(0,shown).map((w,i)=>h('span',{key:w.index,className:i===shown-1&&shown<list.length?'tw-token tw-token-live':'tw-token'},h('span',null,w.text),h('small',null,base+w.index))):h('span',{className:'tw-token'},h('span',null,'_'),h('small',null,'stdin')),
  h('i',{className:'tw-stage-caret','aria-hidden':true}));
}
// Data scenes rebuild when their records change; a running span also every 2 s.
const DATA_FIGURES=['timeline','todos','tokens','files'];
function dataKey(figure,m,work){
 if(figure==='files')return (work?.files||[]).map(f=>f.path+f.changes+f.status+f.declared).join();
 if(figure==='todos')return (m?.todos||[]).map(t=>t.status[0]+t.content.length).join();
 if(figure==='tokens')return [m?.usage?.input,m?.usage?.output,m?.context?.used,m?.outputTokens].join();
 return (m?.spans||[]).map(s=>s.id+(s.end??'')).join()+(m?.running?':'+Math.floor(Date.now()/2000):'');
}
// The run HUD: what this turn has cost so far, from DSH's records only.
// An item DSH did not record is left out rather than shown as zero.
function Meter({share,danger}){
 const cells=10,on=Math.round(Math.max(0,Math.min(1,share))*cells);
 return h('i',{className:'tw-hud-meter','data-danger':danger?'true':undefined,'aria-hidden':true},Array.from({length:cells},(_,i)=>h('b',{key:i,'data-on':i<on?'true':undefined})));
}
function Hud({metrics:m}){
 if(!m||m.start==null&&!m.usage&&!m.context&&!m.todos.length)return null;
 const done=m.todos.filter(t=>t.status==='completed').length;
 const items=[
  m.elapsedMs!=null&&['turn',fmtMs(m.elapsedMs),m.running?'live':null,'本轮已用时间'],
  m.steps>0&&['model',fmtMs(m.llmMs)+' · '+m.steps+' step'+(m.steps>1?'s':''),null,'模型生成耗时与步数'],
  m.tools>0&&['tools',fmtMs(m.toolMs)+' · '+m.tools+(m.toolErrors?' · '+m.toolErrors+' ✕':''),m.toolErrors?'danger':null,'工具执行耗时、次数与失败数'],
  m.ttftMs!=null&&['ttft',fmtMs(m.ttftMs),null,'第一个 token 的等待时间'],
  m.tokensPerSecond&&['speed',Math.round(m.tokensPerSecond)+' tok/s',null,'本轮解码速度（输出 token / 解码耗时）'],
  m.outputTokens!=null&&['out',fmtTok(m.outputTokens)+' tok',null,'本轮输出 token'],
  m.usage?.cacheHit!=null&&['cache',Math.round(m.usage.cacheHit*100)+'%',null,'会话累计输入的缓存命中率',m.usage.cacheHit],
  m.context&&['ctx',fmtTok(m.context.used)+' / '+fmtTok(m.context.window),m.context.share>.8?'danger':null,'上下文占用（DSH contextPressure）',m.context.share],
  m.todos.length&&['todo',done+' / '+m.todos.length,null,'待办完成数',done/m.todos.length]
 ].filter(Boolean);
 if(!items.length)return null;
 return h('div',{className:'tw-hud',role:'status','aria-label':'本轮运行数据'},items.map(([key,value,state,title,share])=>
  h('span',{key,title,'data-key':key,'data-state':state||undefined},h('small',null,key),share!=null?h(Meter,{share,danger:state==='danger'}):null,h('b',null,value))));
}
function Stage({graph,metricsSource=null,sessionId='session',onSelect,animate,motion,replaying=false,suspended=false,theme,menu,menuOpen,onMenu,omitted=0,source='LIVE'}){
 const {queue,entries,index,focus,pending,playing,setPlaying,seconds,setSeconds,started,choose,change}=useReadingQueue({graph,replaying,suspended,coarse:true});
 const arrival=useArrival(graph,queue.turn);
 const motionAllowed=useMotionAllowed(animate);
 const canvas=useRef(null),engine=useRef(null),ops=useRef(null),[, setClock]=useState(0),[caption,setCaption]=useState('');
 // Run records (timing, tokens, todos, files) for the HUD and the data scenes.
 const metrics=metricsSource?runMetrics(metricsSource.legacy,metricsSource.running,metricsSource.projections,Date.now()):null;
 const avail={timeline:(metrics?.spans.length||0)>=2,tokens:!!(metrics?.usage||metrics?.context),todos:!!metrics?.todos.length,files:!!graph.work?.files?.length};
 const availKey=Object.keys(avail).filter(k=>avail[k]).join();
 const baseFigure=useMemo(()=>D.chooseFigure(entries,index,avail),[entries,index,availKey]);
 // Actor mode: the director's character on stage; measurement figures only in metrics mode.
 const [mode,setMode]=useState(()=>readPref('stage-mode','actor')==='metrics'?'metrics':'actor');
 const [directing,setDirecting]=useState(()=>readPref('director',true)!==false);
 useEffect(()=>{writePref('stage-mode',mode);},[mode]);
 useEffect(()=>{writePref('director',directing);},[directing]);
 const director=useStageDirector({graph,sessionId,enabled:mode==='actor'&&directing&&!replaying});
 // Thought outline: one optional extra call once the reasoning is over.
 const [outlineOn,setOutlineOn]=useState(()=>readPref('outline',true)!==false);
 useEffect(()=>{writePref('outline',outlineOn);},[outlineOn]);
 const thought=useThoughtOutline({graph,sessionId,enabled:outlineOn&&!replaying});
 const outlineTokens=thought.usage?(thought.usage.inputTokens||0)+(thought.usage.outputTokens||0)+(thought.usage.cacheReadTokens||0):0;
 // Shown by hand (pinned) or for OUTLINE_SHOW ms after it arrives live.
 const [outlinePin,setOutlinePin]=useState(null),outlineWas=useRef(thought.status);
 useEffect(()=>{setOutlinePin(null);},[queue.turn]);
 useEffect(()=>{
  if(outlineWas.current==='pending'&&thought.status==='ready'&&thought.outline)setOutlinePin('auto');
  outlineWas.current=thought.status;
 },[thought.status,thought.outline]);
 useEffect(()=>{if(outlinePin!=='auto')return;const t=setTimeout(()=>setOutlinePin(p=>p==='auto'?null:p),OUTLINE_SHOW);return()=>clearTimeout(t);},[outlinePin]);
 // Opening sequence: once per page load, unless turned off or motion is reduced.
 const [introOn,setIntroOn]=useState(()=>readPref('intro',true)!==false);
 const [intro,setIntro]=useState(()=>introOn&&!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches&&claimIntro());
 const [hostModel,setHostModel]=useState(null);
 useEffect(()=>{writePref('intro',introOn);},[introOn]);
 useEffect(()=>{fetch(ROUTE+'/status',{credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(d=>{if(d?.model)setHostModel(d.model);}).catch(()=>{});},[]);
 const front=useRef(null),actorEngine=useRef(null);
 const livePhase=phaseOf(graph),script=director.script,actor=director.actor||WHALE;
 // The actor's look (preset, drawn rig or old row sprite) and its resting pose.
 const mark=useWhaleMark();
 const look=useMemo(()=>lookOf(actor,mark),[actor,mark]);
 const avatar=useMemo(()=>({palette:paletteOf(look),rows:framesOfLook(look,'idle')[0]}),[look]);
 const beat=script?.beats?.[livePhase]||{action:{think:'think',tool:'type',answer:'nod',done:'idle',idle:'idle'}[livePhase]||'idle',say:''};
 const actions=beat.actions?.length?beat.actions:[beat.action];
 const terminal=mode==='actor'?terminalOf(graph,script):null;
 // Scenes: while the model thinks (or runs a non-shell tool) the stage shows the
 // visualization for the step being read; the actor returns to answer, with the
 // answer typed on the canvas. A step picked by hand shows its own scene.
 const manual=!playing&&!replaying&&!!focus;
 // Page playback is separate from reading: the same paragraph is presented
 // by several complete layouts, without splitting or advancing its text.
 const [carouselOn,setCarouselOn]=useState(()=>readPref('stage-carousel',true)!==false);
 const [pageSeconds,setPageSeconds]=useState(()=>{const n=readPref('stage-page-seconds',PAGE_SECONDS);return [3,5,8].includes(n)?n:PAGE_SECONDS;});
 const [pagePaused,setPagePaused]=useState(false),[pageChoice,setPageChoice]=useState(null);
 const [visible,setVisible]=useState(()=>!document.hidden);
 useEffect(()=>{const update=()=>setVisible(!document.hidden);document.addEventListener('visibilitychange',update);return()=>document.removeEventListener('visibilitychange',update);},[]);
 useEffect(()=>{writePref('stage-carousel',carouselOn);},[carouselOn]);
 useEffect(()=>{writePref('stage-page-seconds',pageSeconds);},[pageSeconds]);
 const pages=useMemo(()=>stagePages(entries,index,{avail,actor:mode==='actor',outline:!!thought.outline}),[entries,index,availKey,mode,!!thought.outline]);
 const pageKey=String(queue.turn)+':'+mode;
 const page=pageChoice?.key===pageKey&&pages.includes(pageChoice.id)?pageChoice.id:pages[0];
 const carousel=carouselOn&&!!focus;
 const showOutline=!!thought.outline&&(outlinePin==='pin'||outlinePin==='auto'&&!carousel&&!manual);
 const rotating=carousel&&pages.length>1&&!pagePaused&&playing&&!replaying&&!suspended&&!intro&&!menuOpen&&!showOutline&&motionAllowed&&visible;
 const pageRef=useRef(null);pageRef.current={pages,page,key:pageKey};
 useEffect(()=>{
  if(!rotating)return;
  const t=setInterval(()=>{const current=pageRef.current;setPageChoice({key:current.key,id:nextPage(current.pages,current.page)});},pageSeconds*1000);
  return()=>clearInterval(t);
 },[rotating,pageSeconds,pageKey]);
 const pickPage=id=>{setPageChoice({key:pageKey,id});setPagePaused(true);setOutlinePin(null);};
 const togglePages=()=>{setPagePaused(rotating);setOutlinePin(null);if(!playing&&!replaying){started.current=Date.now();setPlaying(true);}};
 const figure=carousel&&page!=='actor'&&page!=='outline'?page:baseFigure;
 const contentScene=mode!=='actor'?'metrics':(manual?focus.kind!=='answer'&&!(terminal&&['code','request','result'].includes(focus.kind)):livePhase==='think'||livePhase==='tool'&&!terminal)?'thought':'actor';
 const wantScene=showOutline?'outline':carousel?(page==='actor'?'actor':page==='outline'?'outline':mode==='metrics'?'metrics':'thought'):contentScene;
 // A scene holds for at least SCENE_HOLD ms, so think / tool / think flips do
 // not flash the stage; a hand-picked step or the metrics view switches at once.
 const [heldScene,setScene]=useState(wantScene),sceneSince=useRef(Date.now());
 const scene=carousel||showOutline?wantScene:heldScene;
 useEffect(()=>{
  if(carousel){sceneSince.current=Date.now();setScene(wantScene);return;}
  if(wantScene===scene)return;
  const wait=manual||[wantScene,scene].some(x=>x==='metrics'||x==='outline')?0:Math.max(0,SCENE_HOLD-(Date.now()-sceneSince.current));
  const t=setTimeout(()=>{sceneSince.current=Date.now();setScene(wantScene);},wait);
  return()=>clearTimeout(t);
 },[wantScene,scene,manual,carousel]);
 const answer=!terminal&&(livePhase==='answer'||livePhase==='done'||manual)?answerOf(graph):null;
 const [foldOn,setFoldOn]=useState(()=>readPref('fold-answer',true)!==false);
 useEffect(()=>{writePref('fold-answer',foldOn);},[foldOn]);
 const [folded,setFolded]=useState(false),foldedTurn=useRef(null);
 useEffect(()=>{if(livePhase!=='done')setFolded(false);},[livePhase,queue.turn]);
 useEffect(()=>{
  if(!foldOn||livePhase!=='done'||!answer||manual||foldedTurn.current===queue.turn)return;
  const t=setTimeout(()=>{foldedTurn.current=queue.turn;setFolded(true);},FOLD_AFTER);
  return()=>clearTimeout(t);
 },[foldOn,livePhase,!!answer,manual,queue.turn]);
 const output=folded&&!manual?null:answer;
 const tokens=director.usage?(director.usage.inputTokens||0)+(director.usage.outputTokens||0)+(director.usage.cacheReadTokens||0):0;
 // Two clocks: the action sequence advances every few seconds, pose frames at the action's tempo.
 const animated=mode==='actor'&&useMotionAllowed(animate)&&!suspended;
 const [seqTick,setSeqTick]=useState(0),[frame,setFrame]=useState(0);
 // The show for this phase: the director's actions, then an encore that suits
 // the character and scenery (a finished reply keeps performing).
 const program=useMemo(()=>programOf(actions,{look,env:script?.env||'none',phase:livePhase,seed:D.hash(String(queue.turn)+(actor.name||''))}),[actions.join(),look,script?.env,livePhase,queue.turn,actor.name]);
 const act=program[seqTick%program.length];
 // While the model thinks, its live text fills the actor's shape; otherwise pixels.
 const style=livePhase==='think'&&!terminal?'glyph':'pixel';
 // A move the director defined for this action, if any.
 const move=script?.moves?.[act]?{...script.moves[act],name:act}:null;
 const poseFrames=useMemo(()=>framesOfLook(look,act,move),[look,act,move?.name,script]);
 const poses=poseFrames.length,tempo=move?move.period*1000/4:TEMPO[act]||400;
 useEffect(()=>{setSeqTick(0);},[livePhase,script]);
 useEffect(()=>{if(!animated||program.length<2)return;const t=setInterval(()=>setSeqTick(n=>n+1),ACTION_STEP);return()=>clearInterval(t);},[animated,program.join()]);
 useEffect(()=>{if(!animated||(poses<2&&style!=='glyph'))return;const t=setInterval(()=>setFrame(n=>n+1),Math.max(140,tempo*POSE_SLOW*4.4/Math.max(4,poses)));return()=>clearInterval(t);},[animated,poses,style,act,tempo]);
 const fill=style==='glyph'?fillOf(graph,livePhase,actor.name):'';
 const log=mode==='actor'?logOf(graph,{...director,tokens}):[];
 const logKey=log.slice(-4).map(l=>l.id+':'+l.text.length).join();
 const spriteKey=(actor.name||'')+':'+avatar.rows.join('').length+':'+avatar.rows[0]+':'+style+':'+(script?.env||'none')+(director.drawing?':draw':'');
 const swapRef=useRef({key:null,frame:0});
 const phase=focus?D.phaseOf(focus.kind):['--','STANDBY'];
 useEffect(()=>{
  const e=createEngine(canvas.current,{animate:motionAllowed&&!suspended,motion});engine.current=e;
  const observer=new ResizeObserver(()=>e.resize());observer.observe(canvas.current);
  return()=>{observer.disconnect();e.destroy();engine.current=null;};
 },[]);
 useEffect(()=>{
  const e=createEngine(front.current,{animate:motionAllowed&&!suspended,motion,transparent:true});actorEngine.current=e;
  const observer=new ResizeObserver(()=>e.resize());observer.observe(front.current);
  return()=>{observer.disconnect();e.destroy();actorEngine.current=null;};
 },[]);
 useEffect(()=>{engine.current?.setOptions({animate:motionAllowed&&!suspended&&scene!=='actor',motion});actorEngine.current?.setOptions({animate:motionAllowed&&!suspended,motion});},[motionAllowed,motion,suspended,scene]);
 useEffect(()=>{const id=requestAnimationFrame(()=>{engine.current?.restyle();actorEngine.current?.restyle();});return()=>cancelAnimationFrame(id);},[theme]);
 const termKey=terminal?terminal.lines.length+':'+(terminal.lines.at(-1)||'').length+':'+terminal.open:'';
 useEffect(()=>{
  const e=actorEngine.current;if(!e)return;
  if(scene!=='actor'){e.show('off',()=>({marks:[],texts:[],live:[]}));return;}
  // Opening or folding the answer keeps the drawing: the actor glides to its new place.
  const key=spriteKey+(terminal?':term':''),swap=swapRef.current.key===key&&swapRef.current.frame!==frame;
  swapRef.current={key,frame};
  e.show(key,box=>buildActorScene({box,actor,look,frames:poseFrames,move,env:script?.env||'none',drawing:director.drawing,program,roomy:program.some(a=>TRAVELS.includes(a)||script?.moves?.[a]&&script.moves[a].travel!=='none'),beat,act,phase:livePhase,terminal,output,mood:script?.mood,effects:script?.effects||[],props:script?.props||[],pending:director.status==='pending',frame,style,fill,log,swap}));
 },[scene,spriteKey,!!terminal,termKey,output?.text.length,output?.open,livePhase,act,beat.say,script?.mood,(script?.effects||[]).join(),(script?.props||[]).length,director.status,frame,logKey,fill.length>>3,poseFrames]);
 const samples=figure==='curve'?arrival.list.length:0;
 const drawn=scene==='outline'?'outline':figure;
 useEffect(()=>{
  // Behind the actor the measurements keep moving, but without their text.
  // Re-keyed when the scene comes into view, so the figure builds up again.
  const spec=engine.current?.show(drawn+':'+queue.turn+':'+scene,box=>{
   const result=buildFigure(drawn,{entries,index,focus,samples:arrival.list.slice(),box,running:graph.running,metrics,work:graph.work,now:Date.now(),outline:thought.outline,outlineModel:thought.model?.model,outlineTokens});
   return carousel?pacePage(result):result;
  });
  setCaption(spec?.caption||CAPTIONS[drawn]||'');
 },[figure,queue.turn,focus?.id,focus?.text,focus?.status,entries.length,index,graph.running,samples,scene,DATA_FIGURES.includes(figure)?dataKey(figure,metrics,graph.work):'',thought.outline,carousel]);
 useEffect(()=>{if(!graph.running)return;const timer=setInterval(()=>setClock(n=>n+1),1000);return()=>clearInterval(timer);},[graph.running]);
 useEffect(()=>{
  const box=ops.current,row=box?.querySelector('[aria-current=step]');
  if(row)box.scrollTop=row.offsetTop-box.clientHeight/2+row.offsetHeight/2;
 },[focus?.id,entries.length]);
 const toggle=()=>{started.current=Date.now();setPlaying(!playing);};
 const latest=()=>choose(entries.at(-1)?.id);
 const openSource=entry=>entry&&onSelect(entry.spans?.length?entry.spans.map(span=>span.nodeId):entry.nodeId);
 useEffect(()=>{
  const key=e=>{
   if(e.key==='Escape'&&menuOpen&&!e.defaultPrevented){onMenu?.(false);return;}
   if(e.defaultPrevented||e.altKey||e.ctrlKey||e.metaKey||editable(e.target))return;
   const onButton=e.target?.tagName==='BUTTON';
   if(e.key===' '&&!onButton&&!replaying){e.preventDefault();toggle();}
   else if(e.key==='ArrowLeft'){e.preventDefault();change(-1);}
   else if(e.key==='ArrowRight'){e.preventDefault();change(1);}
   else if(e.key==='End'){e.preventDefault();latest();}
   else if(e.key==='`'||e.key==='~'){e.preventDefault();onMenu?.();}
  };
  document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);
 });
 const click=e=>{
  const rect=e.currentTarget.getBoundingClientRect(),ref=engine.current?.hit(e.clientX-rect.left,e.clientY-rect.top);
  const target=ref&&entries.find(x=>x.id===ref||x.nodeId===ref);
  if(target&&target.id!==focus?.id)choose(target.id);else if(!replaying)toggle();
 };
 const introInfo={version:VERSION,session:sessionId,model:director.model?.model||hostModel?.model,director:mode==='actor'&&directing,actor:actor.name,sprite:avatar,figures:FIGURES.length,actions:ACTIONS.length,dwell:seconds,
  turns:graph.nodes.filter(n=>n.kind==='input').length,nodes:graph.nodes.length,chars:graph.nodes.reduce((n,x)=>n+x.source.length,0)};
 const directorNote={off:'角色导演已关闭 · 默认角色跟随思考 / 工具 / 回答阶段',idle:'这一轮没有导演记录（只为实时回合调用）· 菜单里可以「重新导演本轮」',pending:'导演正在读你的消息 · 额外调用 1 次模型',drawing:'正在为「'+(director.drawing?.name||'')+'」作画 · 再调用 1 次模型（带推理，约 10–40 秒）',error:'导演调用失败：'+director.error+' · 使用上一个角色',ready:(director.drawError?'作画失败（'+director.drawError+'）· 沿用上一个样子 · ':'')+'角色、动作与台词由模型根据你的消息生成'+(director.model?' · '+director.model.model:'')+(tokens?' · '+tokens+' tokens':'')+(director.ms?' · '+(director.ms/1000).toFixed(1)+'s':'')}[director.status];
 const outlineNote={off:'思路提纲已关闭',idle:'本轮没有提纲（公开推理太短，或不是实时回合）· 菜单里可以「生成本轮提纲」',waiting:'推理结束后归纳思路提纲 · 额外调用 1 次模型',pending:'正在归纳思路提纲 · 额外调用 1 次模型',error:'提纲调用失败：'+thought.error,ready:CAPTIONS.outline+(thought.model?' · '+thought.model.model:'')+(outlineTokens?' · '+outlineTokens+' tokens':'')+(thought.ms?' · '+(thought.ms/1000).toFixed(1)+'s':'')}[thought.status];
 const last=arrival.list.at(-1)?.t||arrival.start,elapsed=(graph.running?Date.now():last)-arrival.start;
 const status=source!=='LIVE'&&source!=='IDLE'?source:graph.running?'RUNNING':source==='IDLE'&&!focus?'IDLE':playing?pending?'READING':'CAUGHT UP':'PAUSED';
 return h('section',{className:'tw-stage','data-mode':mode,'data-scene':scene,'data-page':showOutline?'outline':carousel?page:scene==='actor'?'actor':drawn,'data-carousel':rotating?'playing':carouselOn?'paused':'off','data-boot':intro?'intro':'ready','data-director':director.status,'data-actor-action':act,'data-actor-style':style,'data-figure':drawn,'data-outline':thought.status,'data-phase':phase[1].toLowerCase(),'data-reading':playing?'playing':'paused','data-active-entry':focus?.id||'','aria-label':'思路舞台'},
  h('header',{className:'tw-stage-top'},
   h('b',null,'THOUGHT.TRACE(ME);'),
   h('span',{className:'tw-stage-prompt'},'deepseek@dsh:~$'),
   h(Wave,{list:arrival.list,running:graph.running}),
   h('span',{className:'tw-stage-phase'},phase[0]+' / '+phase[1]),
   h('span',null,clock(elapsed)),
   h('span',{className:'tw-stage-read'},'READ '+pad2(entries.length?index+1:0)+' / '+pad2(entries.length)),
   h('span',{className:'tw-stage-status','data-status':status.toLowerCase().replace(' ','-')},status),
   h('button',{type:'button',className:'tw-stage-menu-button','aria-label':'思路视窗菜单','aria-expanded':!!menuOpen,title:'菜单（` 键）',onClick:()=>onMenu?.()},'≡')),
  h('div',{className:'tw-stage-chat'},h('span',{className:'tw-stage-cap','aria-hidden':true},'dsh · web'),
   h(ChatHead,{actor,avatar,phase:livePhase,action:act,model:director.model?.model,rounds:graph.nodes.filter(n=>n.kind==='input').length,steps:new Set(turnNodes(graph).filter(n=>n.kind!=='input').map(n=>n.step)).size,tokens,outlineTokens})),
  h('section',{className:'tw-stage-main'},
   h('div',{className:'tw-stage-cap'},h('span',null,'| '+(scene==='actor'?'stage / '+(actor.name||'actor')+(output?' · stdout':''):TITLES[drawn]||drawn)),h('small',null,focus?'#'+pad2(index+1)+' '+focus.op+' · '+focus.label:'standby')),
   h(Hud,{metrics}),
   carousel?h('nav',{className:'tw-stage-pages','aria-label':'可视化界面轮播'},
    h('button',{type:'button','aria-label':'上一个可视化界面',disabled:pages.length<2,onClick:()=>pickPage(nextPage(pages,page,-1))},'‹'),
    h('select',{'aria-label':'当前可视化界面',value:showOutline?'outline':page,onChange:e=>pickPage(e.target.value)},pages.map((id,i)=>h('option',{key:id,value:id},pad2(i+1)+' / '+pad2(pages.length)+' · '+(PAGE_NAMES[id]||id)))),
    h('button',{type:'button','aria-label':'下一个可视化界面',disabled:pages.length<2,onClick:()=>pickPage(nextPage(pages,page))},'›'),
    h('button',{type:'button','aria-label':rotating?'暂停界面轮播':'继续界面轮播',disabled:pages.length<2||!motionAllowed||replaying||suspended||intro,onClick:togglePages},rotating?'Ⅱ 暂停':'▷ 轮播'),
    h('small',null,rotating?pageSeconds+' 秒 / 页':'已停留')):null,
   h('div',{className:'tw-stage-plot',onClick:click},
    h('canvas',{ref:canvas,className:'tw-stage-canvas tw-stage-back',role:'img','aria-hidden':scene==='actor','aria-label':(TITLES[drawn]||drawn)+'：'+D.short(focus?.text||'等待公开内容',80)}),
    h('canvas',{ref:front,className:'tw-stage-canvas tw-stage-front','aria-hidden':scene!=='actor',role:'img','aria-label':(actor.name||'角色')+' · '+beat.action+(beat.say?'：'+beat.say:'')}),
    scene==='actor'&&answer?h('button',{type:'button',className:'tw-stage-answer-btn','aria-pressed':!!output,title:output?'收起回答窗口，让角色用整个舞台':'展开本轮回答',
     onClick:e=>{e.stopPropagation();foldedTurn.current=queue.turn;setFolded(!!output);}},output?'▤ 收起回答':'▤ 展开回答'):null,
    thought.outline||thought.status==='pending'?h('button',{type:'button',className:'tw-stage-outline-btn','aria-pressed':scene==='outline',disabled:!thought.outline,title:thought.outline?'显示 / 收起本轮思路提纲':'正在归纳思路提纲',
     onClick:e=>{e.stopPropagation();if(manual)latest();setOutlinePin(scene==='outline'?null:'pin');}},thought.outline?(scene==='outline'?'× 提纲':'◇ 思路提纲'):'◇ 归纳中…'):null),
   h('div',{className:'tw-stage-caption','data-director':scene==='outline'?thought.status:director.status},scene==='outline'?outlineNote:scene==='actor'?directorNote:scene==='thought'?caption+' · 角色在对话栏头像里':caption),
   !playing&&!replaying&&focus?h('div',{className:'tw-stage-paused'},'Ⅱ PAUSED · 空格继续'):null),
  h('aside',{className:'tw-stage-ops','aria-label':'过程操作索引'},
   h('span',{className:'tw-stage-cap'},'ops'),
   h('nav',{ref:ops},entries.map((e,i)=>h('button',{type:'button',key:e.id,'aria-current':i===index?'step':undefined,'data-status':e.status,'data-past':i<index?'true':undefined,onClick:()=>choose(e.id),title:D.short(e.text,90)},h('small',null,pad2(i+1)),e.op)))),
  h('footer',{className:'tw-stage-out'},
   h('span',{className:'tw-stage-cap'},h('span',null,'stdout · tokens'),h('small',null,focus?'@offset · '+D.length(focus.text)+' chars':'')),
   h(Tokens,{key:focus?.id||'empty',entry:focus,seconds,playing:playing&&!replaying&&!suspended,onOpen:()=>openSource(focus)})),
  h('div',{className:'tw-stage-credit'},
   h('span',null,'thought-window '+VERSION),h('span',null,'公开推理与工具事件 · 图形由原文长度、重叠与到达时间计算，非模型内部状态'),omitted?h('span',null,'较早片段已省略'):null,h('span',null,'空格 暂停 · ←/→ 逐条 · ` 菜单')),
  menuOpen?h('div',{className:'tw-stage-menu',role:'dialog','aria-label':'思路视窗菜单'},
   h('div',{className:'tw-stage-menu-row'},h('span',null,'阅读'),
    h('button',{type:'button','aria-label':'上一条思路',disabled:index===0,onClick:()=>change(-1)},'←'),
    h('button',{type:'button',onClick:toggle,disabled:replaying},playing?'Ⅱ 暂停阅读':'▷ 继续逐条'),
    h('button',{type:'button','aria-label':'下一条思路',disabled:!pending,onClick:()=>change(1)},'→'),
    h('button',{type:'button',disabled:!pending,onClick:latest},'跳到最新'),
    h('label',null,'停留 ',h('select',{'aria-label':'每步最少停留时间',value:seconds,onChange:e=>{setSeconds(Number(e.target.value));started.current=Date.now();}},[5,8,12].map(v=>h('option',{key:v,value:v},v+' 秒')))),
    h('small',null,pending?'后面还有 '+pending+' 条':'已到末尾')),
   h('div',{className:'tw-stage-menu-row'},h('span',null,'舞台'),
    h('div',{className:'tw-view-switch',role:'group','aria-label':'舞台画面'},h('button',{type:'button','aria-pressed':mode==='actor',onClick:()=>setMode('actor')},'角色'),h('button',{type:'button','aria-pressed':mode==='metrics',onClick:()=>setMode('metrics')},'度量')),
    h('label',null,h('input',{type:'checkbox',checked:directing,disabled:mode!=='actor',onChange:e=>setDirecting(e.target.checked)}),' 角色导演（每条消息额外调用 1 次模型）'),
    h('button',{type:'button',disabled:mode!=='actor'||!directing||director.status==='pending',onClick:director.redirect},'重新导演本轮'),
    h('button',{type:'button',disabled:mode!=='actor',onClick:director.forget},'换回默认角色'),
    h('label',null,h('input',{type:'checkbox',checked:introOn,onChange:e=>setIntroOn(e.target.checked)}),' 开屏动画'),
    h('label',null,h('input',{type:'checkbox',checked:foldOn,onChange:e=>setFoldOn(e.target.checked)}),' 回答完成后收起回答窗口'),
    h('button',{type:'button',onClick:()=>{onMenu?.(false);setIntro(true);}},'重播开屏'),
    h('small',null,directorNote)),
   h('div',{className:'tw-stage-menu-row'},h('span',null,'轮播'),
    h('label',null,h('input',{type:'checkbox',checked:carouselOn,onChange:e=>{setCarouselOn(e.target.checked);setPagePaused(false);}}),' 多界面依次切换'),
    h('label',null,'每页 ',h('select',{'aria-label':'可视化界面切换间隔',value:pageSeconds,onChange:e=>setPageSeconds(Number(e.target.value))},[3,5,8].map(v=>h('option',{key:v,value:v},v+' 秒')))),
    h('small',null,'轮换整个右侧画面；阅读停留时间不变')),
   h('div',{className:'tw-stage-menu-row'},h('span',null,'提纲'),
    h('label',null,h('input',{type:'checkbox',checked:outlineOn,disabled:replaying,onChange:e=>setOutlineOn(e.target.checked)}),' 思路提纲（推理结束后额外调用 1 次模型）'),
    h('button',{type:'button',disabled:!outlineOn||replaying||!thought.canRequest||thought.status==='pending',onClick:()=>{thought.request();}},thought.outline?'重新归纳本轮':'生成本轮提纲'),
    h('button',{type:'button',disabled:!thought.outline,onClick:()=>{onMenu?.(false);setOutlinePin('pin');}},'显示提纲'),
    h('small',null,outlineNote)),
   menu,
   h('button',{type:'button',className:'tw-stage-menu-close',onClick:()=>onMenu?.(false),'aria-label':'关闭菜单'},'×')):null,
  intro?h(Intro,{info:introInfo,onDone:()=>setIntro(false)}):null,
  h('div',{className:'tw-stage-sr','aria-live':'polite'},focus?focus.label+'：'+D.short(focus.text,120):''));
}
module.exports={Stage};

},
"./workbench.cjs": function(module,exports,require){
'use strict';
const React=require('react');
const {createElement:h,useEffect,useState}=React;
const {EMPTY_WORK,basename}=require('./work-data.cjs');
const fileLabel=file=>file.status==='error'?'本次修改失败':file.status==='running'?'等待写入结果':file.status==='stopped'?'未确认写入':file.declared?'已交付':file.action==='write'?'已写入':'已修改';
const ready=file=>file.status==='done'||file.changes>0||file.declared;
const typeOf=path=>({html:'HTML',htm:'HTML',pdf:'PDF',md:'MD',png:'IMG',jpg:'IMG',jpeg:'IMG',gif:'IMG',svg:'IMG',webp:'IMG',py:'PY',js:'JS',ts:'TS',json:'JSON',csv:'CSV',xlsx:'XLSX',docx:'DOCX'})[String(path).split('.').at(-1).toLowerCase()]||'FILE';
function WorkSummary({work=EMPTY_WORK,onShow}){
 const latest=work.runs.at(-1),errors=work.runs.filter(r=>r.status==='error').length;
 if(!work.files.length&&!work.runs.length)return null;
 return h('button',{type:'button',className:'tw-work-summary',onClick:onShow},h('span',null,'BUILD / RUN'),h('b',null,work.files.length+' 文件 · '+work.runs.length+' 次调用'),h('span',{'data-status':errors?'error':latest?.status},errors?errors+' 条异常记录':latest?.label||'文件状态已更新'),h('span',null,'查看成果 ↗'));
}
function PreviewDock({work=EMPTY_WORK,preview,onExpand,onWork}){
 const latest=work.runs.at(-1),file=work.files.at(-1);
 return h('div',{className:'tw-preview-summary','aria-label':'成果预览伴随条'},
  h('div',null,h('span',{className:'tw-dock-mark'},'▦'),h('strong',null,'THOUGHT WINDOW'),h('small',null,'0.14.2 / 成果模式'),h('span',{className:'tw-spacer'}),h('button',{type:'button',onClick:onExpand},'展开过程'),h('button',{type:'button',onClick:onWork},'成果 / 运行')),
  h('div',{className:'tw-preview-now'},h('span',null,'VIEW'),h('strong',{title:preview.path},basename(preview.path)||'原生预览'),h('small',null,work.files.length+' 文件 · '+work.runs.length+' 次调用')),
  h('div',{className:'tw-preview-last','data-status':latest?.status},h('span',null,latest?'RUN':file?'FILE':'TRACE'),h('span',{title:latest?.command||file?.path||''},latest?latest.label+' · '+latest.command:file?fileLabel(file)+' · '+file.name:'预览期间暂停逐条阅读，展开后继续。')));
}
function Workbench({work=EMPTY_WORK,onOpenFile,onSelect,replaying=false,preview}){
 const [active,setActive]=useState(null),[follow,setFollow]=useState(true),[notice,setNotice]=useState('');
 const latest=work.runs.at(-1),selected=work.runs.find(r=>r.id===active)||latest;
 useEffect(()=>{if(follow)setActive(latest?.id||null);},[latest?.id,follow]);
 const failed=work.runs.filter(r=>r.status==='error').length;
 async function open(file){
  setNotice('');
  try{await onOpenFile(file.path);}catch(error){setNotice('未能打开预览：'+(error?.message||'请从原生聊天中的文件入口重试。'));}
 }
 return h('section',{className:'tw-workbench','aria-label':'成果与运行工作台'},
  h('header',{className:'tw-work-heading'},h('div',null,h('small',null,'ARTIFACT WORKBENCH'),h('h2',null,'从生成到运行，再到成果')),h('span',null,replaying?'回放记录':'本轮实时记录')),
  h('div',{className:'tw-build-route'},h('div',null,h('b',null,String(work.files.length).padStart(2,'0')),h('span',null,'FILE / 文件改动与交付')),h('i',{'aria-hidden':true},'→'),h('div',{'data-status':failed?'error':latest?.status},h('b',null,String(work.runs.length).padStart(2,'0')),h('span',null,'RUN / 命令与结果')),h('i',{'aria-hidden':true},'→'),h('div',null,h('b',null,preview?.open?'OPEN':'VIEW'),h('span',null,'DSH / 原生成果预览'))),
  h('div',{className:'tw-work-columns'},
   h('section',{className:'tw-work-files tw-inset-frame'},h('div',{className:'tw-frame-caption'},h('span',null,'files / 成果索引'),h('small',null,work.files.length+' 项')),
    h('div',{className:'tw-file-list'},work.files.length?work.files.map(file=>h('article',{className:'tw-file-card',key:file.path,'data-status':file.status},
     h('header',null,h('span',{className:'tw-file-kind'},typeOf(file.path)),h('div',null,h('strong',{title:file.path},file.name),h('small',null,fileLabel(file)))),
     h('code',{title:file.path},file.path),file.description?h('p',null,file.description):null,
     h('div',{className:'tw-file-facts'},h('span',null,file.changes?'已确认修改 '+file.changes+' 次':file.declared?'交付声明已记录':'等待工具结果'),file.lines?h('span',null,'写入参数 '+file.lines+' 行'):null),
     h('footer',null,h('button',{type:'button',disabled:replaying||!ready(file)||!onOpenFile,onClick:()=>open(file)},typeOf(file.path)==='HTML'?'预览 HTML ↗':'在 DSH 预览 ↗'),file.nodeId?h('button',{type:'button',onClick:()=>onSelect(file.nodeId)},'工具原文'):null)
    )):h('p',{className:'tw-work-empty'},'文件写入、修改或显式交付后，这里会出现可打开的成果。'))),
   h('section',{className:'tw-work-runs tw-inset-frame'},h('div',{className:'tw-frame-caption'},h('span',null,'process / 运行记录'),h('small',null,failed?failed+' 条异常':'只读日志')),
    work.runs.length?h(React.Fragment,null,
     h('nav',{className:'tw-run-list','aria-label':'命令调用记录'},work.runs.map((run,i)=>h('button',{type:'button',key:run.id,'aria-pressed':selected?.id===run.id,'data-status':run.status,onClick:()=>{setActive(run.id);setFollow(false);}},h('small',null,String(i+1).padStart(2,'0')),h('span',{title:run.command},run.command),h('b',null,run.label)))),
     selected?h('div',{className:'tw-run-detail','data-status':selected.status},
      h('div',{className:'tw-run-title'},h('span',null,selected.name.toUpperCase()),h('b',null,selected.label),h('button',{type:'button',onClick:()=>setFollow(!follow),'aria-pressed':follow},follow?'跟随最新':'跟随已暂停')),
      h('pre',{className:'tw-run-command'},'> '+selected.command),selected.cwd?h('small',{className:'tw-run-cwd'},'cwd / '+selected.cwd):null,
      h('div',{className:'tw-stdout-title'},'stdout / stderr'),h('pre',{className:'tw-run-output',tabIndex:0},selected.output||(['running','submitted'].includes(selected.status)?'尚未收到输出。':'此调用没有文本输出。')),
      selected.truncated?h('small',null,'长输出保留末尾 8,000 字符；完整记录请看原生工具消息。'):null,
      h('button',{type:'button',className:'tw-run-source',onClick:()=>onSelect(selected.nodeId)},'查看工具原文 ↗')):null
    ):h('div',{className:'tw-work-empty'},h('b',null,'[ _ ]'),h('p',null,'执行 PowerShell、Bash 或查询后台任务时，命令与返回输出会显示在这里。')))),
  notice?h('p',{className:'tw-work-notice',role:'status'},notice):null,
  h('p',{className:'tw-work-footnote'},replaying?'回放只展示当时记录；切回实时后可打开本会话成果。':'预览由 DSH 打开 · 运行记录实时更新 · 此面板不会重跑命令'),
  work.omitted?h('p',{className:'tw-work-footnote'},'已省略 '+work.omitted+' 条较早记录，完整内容保留在原生聊天。'):null);
}
module.exports={Workbench,WorkSummary,PreviewDock};

},
"./view.cjs": function(module,exports,require){
'use strict';
const React=require('react');
const {createElement:h,useState,useEffect,useRef}=React;
const {appendFrame,validateReplay}=require('./core.cjs');
const storage=require('./storage.cjs');
const {Terminal}=require('./terminal.cjs');
const {Process}=require('./process.cjs');
const {Stage}=require('./stage.cjs');
const {Workbench,WorkSummary,PreviewDock}=require('./workbench.cjs');
const {Adaptive,useDirector}=require('./adaptive.cjs');
const {SCENES,THEMES}=require('./scenes.cjs');
const pref=(key,fallback)=>{try{return JSON.parse(localStorage.getItem('tw:'+key))??fallback;}catch{return fallback;}};
const putPref=(key,value)=>{try{localStorage.setItem('tw:'+key,JSON.stringify(value));}catch{}};
const statusLabel={done:'完成',running:'进行中',stopped:'已停止',error:'失败'};
const reasonKinds=['reasoning','compare','check','revise'];
function position(node,index){return {x:node.kind==='tool'?472:node.kind==='input'||node.kind==='answer'?258:node.kind==='compare'?300:node.kind==='check'?168:64,y:52+index*116};}
function formatTime(ms){return new Date(ms).toLocaleTimeString('zh-CN',{hour12:false});}

function Graph({graph,selected,onSelect,animate,follow}) {
  const scroll=useRef(null);
  const nodes=graph.nodes;
  useEffect(()=>{if(follow && scroll.current) scroll.current.scrollTo({top:scroll.current.scrollHeight,behavior:animate?'smooth':'auto'});},[nodes.length,follow,animate]);
  const coords=new Map(nodes.map((node,i)=>[node.id,position(node,i)]));
  const height=Math.max(330,nodes.length*116+96);
  return h('div',{className:'tw-map-scroll',ref:scroll,tabIndex:0,'aria-label':'思路事件画布，可滚动查看'},
    h('div',{className:'tw-map',style:{height}},
      h('div',{className:'tw-lane tw-lane-a'},'01 / REASONING'),h('div',{className:'tw-lane tw-lane-b'},'02 / TOOLS'),
      h('svg',{className:'tw-wires',viewBox:`0 0 760 ${height}`,preserveAspectRatio:'none','aria-hidden':true},
        graph.edges.map((edge,i)=>{
          const a=coords.get(edge.from),b=coords.get(edge.to);if(!a||!b)return null;
          const d=`M ${a.x+108} ${a.y+84} C ${a.x+108} ${a.y+104}, ${b.x+108} ${b.y-18}, ${b.x+108} ${b.y}`;
          const live=graph.nodes.find(n=>n.id===edge.to)?.status==='running';
          return h('g',{key:edge.from+'>'+edge.to+':'+i},
            h('path',{d,className:'tw-wire '+(edge.kind==='parent'?'tw-parent':'')}),
            animate?h('path',{d,pathLength:1,className:'tw-growing'}):null,
            live&&animate?h('path',{d,className:'tw-current'}):null);
        })
      ),
      !nodes.length?h('div',{className:'tw-empty'},h('div',{className:'tw-empty-icon'},'▦'),h('strong',null,'等一个想法，开始生长。'),h('p',null,'发送消息后，这里会呈现公开推理、工具调用和回答。'),h('small',null,'AWAITING SESSION EVENTS')):null,
      nodes.map((node,i)=>{
        const p=coords.get(node.id);
        return h('button',{type:'button',key:node.id,'data-tw-node':node.id,onClick:()=>onSelect(node.id),title:'查看对应原文',className:`tw-node tw-${node.kind} tw-status-${node.status} ${selected===node.id?'tw-selected':''}`,style:{left:`${p.x/7.6}%`,top:p.y,width:'28.42%'},'aria-pressed':selected===node.id},
          h('span',{className:'tw-node-meta'},h('span',null,String(i+1).padStart(2,'0')+' / '+node.label),h('span',{className:'tw-node-dot','aria-label':statusLabel[node.status]})),
          h('strong',null,node.title||node.label),
          h('span',{className:'tw-node-state'},node.kind==='tool'?'> '+statusLabel[node.status]:node.status==='running'?'STREAMING _':node.status==='stopped'?'STOPPED':reasonKinds.includes(node.kind)?'公开文本 · 自动分段':'EVENT / '+statusLabel[node.status])
        );
      })
    )
  );
}

const LAYOUTS=['stage','process','workbench','adaptive','terminal','graph'];
function ThoughtWindow({graph,metricsSource,sessionId,onClose,onTheme,onShell,mode='live',onOpenFile,preview={open:false},dockExpanded=false,onExpandDock,onFoldDock}) {
  const [theme,setTheme]=useState(()=>{const value=pref('theme-v5','obsidian');return value==='auto'||Object.hasOwn(THEMES,value)?value:'obsidian';});
  // 0.7 keeps its own layout preference so the stage opens first after the update.
  const [layout,setLayout]=useState(()=>{const value=pref('layout-v7','stage');return LAYOUTS.includes(value)?value:'stage';});
  const [menu,setMenu]=useState(false);
  const [sidebar,setSidebar]=useState(()=>pref('stage-sidebar',false)===true);
  const [sceneChoice,setSceneChoice]=useState(()=>{const value=pref('scene','auto');return value==='auto'||Object.hasOwn(SCENES,value)?value:'auto';});
  const [motion,setMotion]=useState(()=>pref('motion','rich'));
  const [settings,setSettings]=useState(false);
  const [animate,setAnimate]=useState(()=>pref('animate',!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches));
  const [selected,setSelected]=useState(null);
  const [follow,setFollow]=useState(true);
  const [frames,setFrames]=useState([]);
  const [cursor,setCursor]=useState(null);
  const [playing,setPlaying]=useState(false);
  const [speed,setSpeed]=useState(1);
  const [persistent,setPersistent]=useState(()=>pref('save-history',false));
  const [notice,setNotice]=useState('');
  const [imported,setImported]=useState(null);
  const graphRef=useRef(graph);graphRef.current=graph;
  const framesRef=useRef(frames);framesRef.current=frames;
  const fileRef=useRef(null);
  const persistenceReady=useRef(false);
  const generation=useRef(0);
  const folded=preview.open&&!dockExpanded;
  useEffect(()=>{putPref('theme-v5',theme);},[theme]);
  useEffect(()=>{putPref('animate',animate);},[animate]);
  useEffect(()=>{putPref('layout-v7',layout);setMenu(false);},[layout]);
  useEffect(()=>{putPref('stage-sidebar',sidebar);},[sidebar]);
  useEffect(()=>{onShell?.({stage:layout==='stage',sidebar});},[layout,sidebar]);
  useEffect(()=>{putPref('scene',sceneChoice);},[sceneChoice]);
  useEffect(()=>{putPref('motion',motion);},[motion]);
  useEffect(()=>{
    setFrames(appendFrame([],graphRef.current));setCursor(null);setImported(null);setSelected(null);setPlaying(false);
    const timer=setInterval(()=>setFrames(old=>appendFrame(old,graphRef.current)),900);
    return()=>clearInterval(timer);
  },[sessionId]);
  // Capture a final status promptly even if the stream ends between timer ticks.
  useEffect(()=>{if(!graph.running)setFrames(old=>appendFrame(old,graph));},[graph.running]);
  useEffect(()=>{
    const gen=++generation.current;persistenceReady.current=false;
    putPref('save-history',persistent);
    if(!persistent){persistenceReady.current=true;return;}
    storage.load(sessionId).then(row=>{
      if(gen!==generation.current)return;
      if(row?.frames?.length){const restored=validateReplay({format:'dsh-thought-window',version:1,frames:row.frames});setFrames(appendFrame(restored,graphRef.current));}
      persistenceReady.current=true;
    }).catch(()=>{if(gen===generation.current){setNotice('本地回放不可用，当前会话仍可回放。');persistenceReady.current=true;}});
    return()=>{generation.current++;};
  },[persistent,sessionId]);
  useEffect(()=>{
    if(!persistent)return;
    const timer=setInterval(()=>{
      if(persistenceReady.current && framesRef.current.length)storage.save(sessionId,framesRef.current).catch(()=>setNotice('浏览器空间不足，回放暂存在内存。'));
    },3000);
    return()=>clearInterval(timer);
  },[persistent,sessionId]);
  const timeline=imported || frames;
  const index=cursor===null?timeline.length-1:Math.min(cursor,timeline.length-1);
  const current=cursor===null&&!imported?graph:timeline[index]?.graph || graph;
  const route=useDirector(current,cursor!==null||!!imported);
  const sceneId=sceneChoice==='auto'?route.id:sceneChoice;
  const effectiveTheme=theme==='auto'?(['stage','process','workbench'].includes(layout)?'obsidian':SCENES[sceneId]?.theme||'paper'):theme;
  useEffect(()=>{onTheme?.(theme==='auto'&&!['stage','process','workbench'].includes(layout)?'paper':effectiveTheme);},[effectiveTheme,theme,layout]);
  const sourceNodes=current.nodes.filter(n=>Array.isArray(selected)?selected.includes(n.id):n.id===selected);
  const selectedNode=sourceNodes.length?{...sourceNodes[0],source:sourceNodes.map(n=>n.source).join(''),truncated:sourceNodes.some(n=>n.truncated)}:null;
  useEffect(()=>{
    if(!playing||folded)return;
    const timer=setInterval(()=>setCursor(old=>{
      const next=(old??0)+1;
      if(next>=timeline.length-1){setPlaying(false);return Math.max(0,timeline.length-1);}
      return next;
    }),1000/speed);
    return()=>clearInterval(timer);
  },[playing,speed,timeline.length,folded]);
  function exportReplay(){
    const value={format:'dsh-thought-window',version:1,createdAt:new Date().toISOString(),frames:timeline.length?timeline:appendFrame([],graph)};
    const url=URL.createObjectURL(new Blob([JSON.stringify(value)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='thought-window-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    setNotice('已导出当前回放，文件包含画布中的对话原文。');
  }
  async function importReplay(event){
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    try{if(file.size>6_000_000)throw Error('文件超过 6 MB');const data=validateReplay(JSON.parse(await file.text()));setImported(data);setCursor(0);setPlaying(false);setNotice('正在查看导入回放；原生实时对话不受影响。');}
    catch(error){setNotice('无法导入：'+error.message);}
  }
  async function clearHistory(){
    setPersistent(false);setImported(null);setCursor(null);setPlaying(false);setFrames(appendFrame([],graphRef.current));
    try{await storage.clear();setNotice('已清除插件保存的回放，并关闭保存。DSH 原对话保留。');}catch{setNotice('浏览器拒绝清理存储；已关闭保存。');}
  }
  const live=cursor===null&&!imported;
  const selectSource=id=>{if(current.nodes.some(n=>Array.isArray(id)?id.includes(n.id):n.id===id)){setSelected(id);setFollow(false);}else setNotice('该工具原文已超出当前节点窗口，请在左侧原生聊天查看。');};
  const viewSwitch=h('div',{className:'tw-view-switch',role:'group','aria-label':'可视化视图'},h('button',{type:'button','aria-pressed':layout==='stage',onClick:()=>setLayout('stage')},'舞台'),h('button',{type:'button','aria-pressed':layout==='process',onClick:()=>setLayout('process')},'过程仪表'),h('button',{type:'button','aria-pressed':layout==='workbench',onClick:()=>setLayout('workbench')},'成果 / 运行'),h('button',{type:'button','aria-pressed':layout==='adaptive',onClick:()=>setLayout('adaptive')},'自动场景'),h('button',{type:'button','aria-pressed':layout==='terminal',onClick:()=>setLayout('terminal')},'终端'),h('button',{type:'button','aria-pressed':layout==='graph',onClick:()=>setLayout('graph')},'节点'));
  const appearance=settings?h('div',{className:'tw-appearance'},h('label',null,'配色 ',h('select',{'aria-label':'界面配色',value:theme,onChange:e=>setTheme(e.target.value)},h('option',{value:'auto'},'随场景配色'),Object.entries(THEMES).map(([key,label])=>h('option',{key,value:key},label)))),h('label',null,'动效 ',h('select',{'aria-label':'动效强度',value:motion,onChange:e=>setMotion(e.target.value)},h('option',{value:'rich'},'丰富'),h('option',{value:'calm'},'轻柔')))):null;
  const sourcePanel=selectedNode?h('aside',{className:'tw-source','aria-label':'节点原文'},h('div',{className:'tw-source-title'},h('strong',null,selectedNode.label+' / 对应原文'),h('button',{type:'button',onClick:()=>setSelected(null),'aria-label':'关闭原文'},'×')),h('div',{className:'tw-source-meta'},`状态：${statusLabel[selectedNode.status]}${Number.isFinite(selectedNode.turn)?' · turn '+selectedNode.turn:''}${Number.isFinite(selectedNode.step)?' · step '+selectedNode.step:''}`),h('pre',null,selectedNode.source),selectedNode.truncated?h('small',null,'长文本已截断至 12,000 字符，完整内容请在原生聊天中查看。'):null):null;
  const controls=[

      h('div',{className:'tw-timeline-label'},h('span',null,'TIMELINE / 观察到的状态'),h('span',null,timeline[index]?formatTime(timeline[index].at):'--:--:--')),
      h('input',{className:'tw-timeline',type:'range',min:0,max:Math.max(0,timeline.length-1),value:Math.max(0,index),'aria-label':'回放时间轴',onChange:e=>{setCursor(Number(e.target.value));setPlaying(false);}}),
      h('div',{className:'tw-playbar'},h('button',{type:'button',onClick:()=>{if(playing){setPlaying(false);return;}if(cursor===null||index>=timeline.length-1)setCursor(0);setPlaying(true);},disabled:timeline.length<2},playing?'Ⅱ 暂停':'▷ 回放'),h('select',{'aria-label':'回放速度',value:speed,onChange:e=>setSpeed(Number(e.target.value))},[0.5,1,2].map(s=>h('option',{value:s,key:s},s+'×'))),h('button',{type:'button',className:live?'tw-active':'',onClick:()=>{setImported(null);setCursor(null);setPlaying(false);setFollow(true);}},'● 实时'),h('span',{className:'tw-spacer'}),h('button',{type:'button',title:'导出含原文的 JSON 回放',onClick:exportReplay},'导出'),h('button',{type:'button',onClick:()=>fileRef.current?.click()},'导入'),h('input',{type:'file',hidden:true,accept:'.json,application/json',ref:fileRef,onChange:importReplay})),
      settings?h('div',{className:'tw-storage-row'},h('label',null,h('input',{type:'checkbox',checked:persistent,onChange:e=>{setPersistent(e.target.checked);setNotice(e.target.checked?'回放将保存在本浏览器，最多 10 个会话；不上传。':'已停止保存；已有回放可用“清除”删除。');}}),' 本地保存回放'),h('button',{type:'button',onClick:clearHistory},'清除'),h('small',null,'最多 90 帧 / 当前已加载对话')):null,
      notice?h('p',{className:'tw-notice',role:'status'},notice):null,
      h('p',{className:'tw-disclosure'},'公开文本与事件 · 场景为规则匹配 · 图形为内容示意')];
  if(layout==='stage'){
    // The stage keeps every existing control, folded into its ≡ menu.
    const menuBody=h(React.Fragment,null,
      h('div',{className:'tw-stage-menu-row'},h('span',null,'视图'),viewSwitch),
      h('div',{className:'tw-stage-menu-row'},h('span',null,'外观'),
        h('label',null,'配色 ',h('select',{'aria-label':'界面配色',value:theme,onChange:e=>setTheme(e.target.value)},h('option',{value:'auto'},'随场景配色'),Object.entries(THEMES).map(([key,label])=>h('option',{key,value:key},label)))),
        h('label',null,'动效 ',h('select',{'aria-label':'动效强度',value:motion,onChange:e=>setMotion(e.target.value)},h('option',{value:'rich'},'丰富'),h('option',{value:'calm'},'轻柔'))),
        h('label',null,h('input',{type:'checkbox',checked:animate,onChange:e=>setAnimate(e.target.checked)}),' 动效'),
        h('label',null,h('input',{type:'checkbox',checked:sidebar,onChange:e=>setSidebar(e.target.checked)}),' 显示 DSH 侧栏')),
      h('div',{className:'tw-stage-menu-row'},h('span',null,'插件'),h('button',{type:'button','aria-pressed':settings,onClick:()=>setSettings(!settings)},'本地保存设置'),h('button',{type:'button','aria-label':'关闭思路视窗',title:'恢复原始聊天布局',onClick:onClose},'关闭插件 ×')),
      h('div',{className:'tw-controls'},...controls));
    return h('section',{className:`tw-window tw-theme-${effectiveTheme} tw-layout-stage ${animate?'':'tw-no-motion'}`,'data-motion':motion,'aria-label':'思路视窗'},
      preview.open?h(PreviewDock,{work:graph.work,preview,onExpand:()=>onExpandDock?.(),onWork:()=>{setLayout('workbench');onExpandDock?.();}}):null,
      h(Stage,{graph:current,metricsSource:live?metricsSource:null,sessionId,onSelect:selectSource,animate:animate&&!folded,motion,replaying:!live,suspended:folded,theme:effectiveTheme,menu:menuBody,menuOpen:menu,onMenu:value=>setMenu(old=>typeof value==='boolean'?value:!old),omitted:current.omitted,source:live?(current.running?'LIVE':'IDLE'):imported?'IMPORTED':'REPLAY'}),
      sourcePanel);
  }
  return h('section',{className:`tw-window tw-theme-${effectiveTheme} tw-layout-${layout} ${animate?'':'tw-no-motion'}`,'data-motion':motion,'aria-label':'思路视窗'},
    preview.open?h(PreviewDock,{work:graph.work,preview,onExpand:()=>{setLayout('process');onExpandDock?.();},onWork:()=>{setLayout('workbench');onExpandDock?.();}}):null,
    h('header',{className:'tw-titlebar'},h('div',null,h('span',{className:'tw-mark'},'▦'),h('strong',null,'THOUGHT WINDOW'),h('small',null,'思路仪表 / 0.14.4')),
      h('div',{className:'tw-title-actions'},preview.open?h('button',{type:'button',className:'tw-dock-fold',onClick:onFoldDock},'收起过程'):null,h('button',{type:'button','aria-label':'外观设置','aria-expanded':settings,onClick:()=>setSettings(!settings)},'⚙'),h('button',{type:'button',title:'轮换配色','aria-label':'切换主题',onClick:()=>{const keys=Object.keys(THEMES);setTheme(keys[(keys.indexOf(effectiveTheme)+1)%keys.length]);}},'◐'),h('button',{type:'button','aria-label':'关闭思路视窗',title:'恢复原始聊天布局',onClick:onClose},'×'))),
    appearance,
    h('div',{className:'tw-ribbon'},h('span',{className:current.running&&live?'tw-live tw-pulse':'tw-live'},h('i'),mode==='demo'?'DEMO / 演示数据':imported?'IMPORTED / 导入':live?(current.running?'LIVE / 运行中':'LIVE / 等待输入'):'REPLAY / 回放'),h('span',null,`${current.nodes.length} EVENTS · ${current.nodes.filter(n=>n.kind==='tool').length} TOOLS`)),
    h('div',{className:'tw-summary'},h('div',null,h('small',null,'EVENTS'),h('b',null,String(current.nodes.length).padStart(2,'0'))),h('div',null,h('small',null,'REASONING'),h('b',null,current.nodes.filter(n=>reasonKinds.includes(n.kind)).length)),h('div',null,h('small',null,'TOOLS'),h('b',null,current.nodes.filter(n=>n.kind==='tool').length)),h('div',{className:'tw-summary-caption'},h('span',null,'让思路，逐步可见。'),h('small',null,'READ → TRACE → BUILD'))),
    h('div',{className:'tw-map-toolbar'},h('span',null,'trace / '+(sessionId==='demo'?'sample':String(sessionId).slice(0,8))),viewSwitch,['terminal','graph'].includes(layout)?h('label',null,h('input',{type:'checkbox',checked:follow,onChange:e=>setFollow(e.target.checked)}),' 跟随'):null,h('label',null,h('input',{type:'checkbox',checked:animate,onChange:e=>setAnimate(e.target.checked)}),' 动效')),
    layout!=='workbench'?h(WorkSummary,{work:current.work,onShow:()=>setLayout('workbench')}):null,
    h('div',{className:'tw-process-host',hidden:layout!=='process'},h(Process,{graph:current,onSelect:selectSource,animate:animate&&layout==='process'&&!folded,motion,replaying:!live,suspended:folded||layout!=='process'})),
    layout==='process'?null:layout==='workbench'?h(Workbench,{work:current.work,onOpenFile,onSelect:selectSource,replaying:!live,preview:live?preview:undefined}):h(layout==='adaptive'?Adaptive:layout==='terminal'?Terminal:Graph,{graph:current,route,sceneChoice,onSceneChoice:setSceneChoice,selected,onSelect:selectSource,animate,motion,instant:!live&&!playing,follow}),
    current.omitted?h('div',{className:'tw-note'},`当前窗口已省略 ${current.omitted} 个较早片段，原文仍在原生对话。`):null,
    !current.hasReasoning&&current.nodes.length?h('div',{className:'tw-note'},'模型未返回公开推理文本；当前显示消息与工具活动。'):null,
    sourcePanel,
    h('footer',{className:'tw-controls'},...controls)
  );
}
module.exports={ThoughtWindow,pref,putPref};

},
"./host-theme.cjs": function(module,exports,require){
'use strict';
const {THEMES}=require('./scenes.cjs');
const classes=Object.keys(THEMES).map(key=>'tw-native-'+key);
const owners=new Map();
let original=null;
// The sidebar and portalled menus live outside the conversation root. Lease the
// same tokens at body level while a window is open, without changing DSH's theme
// preference or data-ds-dark-theme attribute. Multiple session panes can coexist.
function acquireHostTheme(root,body=document.body){
  const owner={root,body,theme:'paper'};
  if(!owners.size)original=new Set([...classes,'tw-host-theme'].filter(name=>body.classList.contains(name)));
  owners.set(owner,owner);
  function apply(){
    const active=[...owners.values()].at(-1);
    for(const name of classes)body.classList.toggle(name,active?name==='tw-native-'+active.theme:original?.has(name));
    body.classList.toggle('tw-host-theme',!!active||original?.has('tw-host-theme'));
  }
  return {
    set(theme){
      if(!owners.has(owner))return;
      owner.theme=Object.hasOwn(THEMES,theme)?theme:'paper';
      for(const name of classes)root.classList.toggle(name,name==='tw-native-'+owner.theme);
      apply();
    },
    release(){
      owners.delete(owner);root.classList.remove(...classes);apply();
      if(!owners.size)original=null;
    }
  };
}
module.exports={acquireHostTheme};

},
"./client.cjs": function(module,exports,require){
'use strict';
const React=require('react');
const ReactDOM=require('react-dom');
const {project}=require('./core.cjs');
const {ThoughtWindow,pref,putPref}=require('./view.cjs');
const {splitGeometry}=require('./choreography.cjs');
const {acquireHostTheme}=require('./host-theme.cjs');
const {projectWork}=require('./work-data.cjs');
const {createHostBridge}=require('./host-bridge.cjs');
const css=require('./style.css');
const {createElement:h,useState,useEffect,useMemo,useRef,useSyncExternalStore}=React;
const EMPTY_DELIVERY_SOURCE={subscribe:()=>()=>{},getSnapshot:()=>undefined};
// Session projections DSH serves to session-scoped slots; absent in older hosts.
const NO_PROJECTION=()=>undefined;

// DSH 0.1.5-rc.2 does not expose an outer split-pane factory. This small DOM
// adapter owns only its mount/class. Chat data always comes from public hooks.
function findRoot(anchor){
  let current=anchor?.parentElement;
  while(current){if(current.hasAttribute('data-phase') && current.querySelector('[data-conversation-scroll]'))return current;current=current.parentElement;}
  return null;
}
const stageSplit=value=>Number.isFinite(value)?Math.max(.45,Math.min(.8,value)):.7;
function Controller({sessionId,useChat,useSession,useProjection=NO_PROJECTION,host}) {
  const anchor=useRef(null);
  const [enabled,setEnabled]=useState(()=>pref('enabled',true));
  const [mount,setMount]=useState(null);
  const [unsupported,setUnsupported]=useState(false);
  const themeRoot=useRef(null);
  const chat=useChat(s=>s),legacy=chat.legacy;
  const turn=chat.timeline?.turns?.get(chat.timeline.turnOrder.at(-1));
  const deliverySource=turn?.data?.source?.('deliverables')||EMPTY_DELIVERY_SOURCE;
  const deliveryHooks=useMemo(()=>({subscribe:fn=>deliverySource.subscribe(fn),getSnapshot:()=>deliverySource.getSnapshot()}),[deliverySource]);
  const deliverables=useSyncExternalStore(deliveryHooks.subscribe,deliveryHooks.getSnapshot);
  const running=useSession(s=>s.running);
  const tokenUsage=useProjection('tokenUsage'),contextPressure=useProjection('contextPressure'),todos=useProjection('todos'),sessionStats=useProjection('sessionStats');
  const metricsSource=useMemo(()=>({legacy,running,projections:{tokenUsage,contextPressure,todos,sessionStats}}),[legacy,running,tokenUsage,contextPressure,todos,sessionStats]);
  const graph=useMemo(()=>({...project(legacy,running),work:projectWork(legacy,running,deliverables,host.cwd(sessionId))}),[legacy,running,deliverables,host,sessionId]);
  const [preview,setPreview]=useState({open:false,path:'',address:''}),[dockExpanded,setDockExpanded]=useState(false);
  const [shell,setShell]=useState({stage:false,sidebar:false});
  const dock=useRef(null),refreshLayout=useRef(null);dock.current={preview,dockExpanded,shell};
  useEffect(()=>{
    if(!enabled)return;
    const update=()=>{const next=host.readPreview(sessionId);setPreview(old=>old.open===next.open&&old.address===next.address?old:next);};
    update();const timer=setInterval(update,500);return()=>clearInterval(timer);
  },[enabled,sessionId,host]);
  useEffect(()=>{setDockExpanded(false);},[preview.open]);
  useEffect(()=>{refreshLayout.current?.();},[preview.open,dockExpanded,shell.stage,shell.sidebar]);
  useEffect(()=>{
    putPref('enabled',enabled);
    if(!enabled)return;
    const root=findRoot(anchor.current);
    if(!root){setUnsupported(true);return;}
    if(root.querySelector(':scope > .tw-mount'))return;
    setUnsupported(false);
    const element=document.createElement('div');element.className='tw-mount';
    root.appendChild(element);root.classList.add('tw-native-shell');
    const hostTheme=acquireHostTheme(root);themeRoot.current=hostTheme;
    const openingTheme=pref('theme-v5','obsidian');hostTheme.set(openingTheme==='auto'?(pref('layout-v5','process')==='process'?'obsidian':'paper'):openingTheme);
    const divider=document.createElement('div');divider.className='tw-divider';divider.tabIndex=0;
    divider.setAttribute('role','separator');divider.setAttribute('aria-label','调整右侧画布宽度');divider.setAttribute('aria-orientation','vertical');divider.setAttribute('aria-valuemin','35');divider.setAttribute('aria-valuemax','68');divider.title='拖动调整聊天与画布比例；双击恢复';
    root.appendChild(divider);
    // The stage keeps its own, wider split: chat is a framed pane, not half the screen.
    let ratio=splitGeometry(1000,Number(pref('split',.56))).ratio,stageRatio=stageSplit(Number(pref('split-stage',.7))),dragging=false;
    const staged=()=>root.classList.contains('tw-stage-shell');
    const resize=()=>{
      const width=root.getBoundingClientRect().width;
      const geometry=splitGeometry(width,ratio);
      const previewOpen=!!dock.current?.preview.open,shellState=dock.current?.shell||{};
      const stage=!!shellState.stage&&!geometry.stacked&&!previewOpen;
      root.classList.toggle('tw-stage-shell',stage);
      document.body.classList.toggle('tw-stage-host',stage&&!shellState.sidebar);
      if(stage)geometry.panel=Math.max(0,Math.min(width*stageRatio,width-300));
      root.classList.toggle('tw-stacked',geometry.stacked||previewOpen);
      root.classList.toggle('tw-preview-open',previewOpen);
      root.classList.toggle('tw-preview-folded',previewOpen&&!dock.current?.dockExpanded);
      root.style.setProperty('--tw-panel-width',geometry.panel+'px');
      divider.setAttribute('aria-valuenow',String(Math.round((stage?stageRatio:ratio)*100)));
    };
    divider.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();dragging=true;divider.setPointerCapture(e.pointerId);root.classList.add('tw-resizing');};
    divider.onpointermove=e=>{if(!dragging)return;const rect=root.getBoundingClientRect(),value=(rect.right-e.clientX)/rect.width;if(staged())stageRatio=stageSplit(value);else ratio=splitGeometry(rect.width,value).ratio;resize();};
    divider.onpointerup=divider.onpointercancel=()=>{dragging=false;root.classList.remove('tw-resizing');putPref('split',ratio);putPref('split-stage',stageRatio);};
    divider.ondblclick=()=>{if(staged())stageRatio=.7;else ratio=.56;putPref('split',ratio);putPref('split-stage',stageRatio);resize();};
    divider.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home'].includes(e.key))return;e.preventDefault();const step=e.key==='ArrowLeft'?.02:-.02;if(staged())stageRatio=e.key==='Home'?.7:stageSplit(stageRatio+step);else ratio=e.key==='Home'?.56:splitGeometry(1000,ratio+step).ratio;putPref('split',ratio);putPref('split-stage',stageRatio);resize();};
    refreshLayout.current=resize;resize();const observer=new ResizeObserver(resize);observer.observe(root);setMount(element);
    return()=>{observer.disconnect();refreshLayout.current=null;setMount(null);element.remove();divider.remove();hostTheme.release();root.classList.remove('tw-native-shell','tw-stacked','tw-resizing','tw-preview-open','tw-preview-folded','tw-stage-shell');if(!document.querySelector('.tw-stage-shell'))document.body.classList.remove('tw-stage-host');root.style.removeProperty('--tw-panel-width');themeRoot.current=null;};
  },[enabled,sessionId]);
  return h(React.Fragment,null,h('button',{ref:anchor,type:'button',className:'tw-launch',title:unsupported?'当前 DSH 布局不兼容，可关闭插件并查看 README':'打开 / 关闭思路视窗','aria-label':'思路视窗','aria-pressed':enabled&&!unsupported,onClick:()=>setEnabled(!enabled)},'▦ ',unsupported?'布局不兼容':'思路视窗'),mount&&enabled?ReactDOM.createPortal(h(ThoughtWindow,{key:sessionId,graph,metricsSource,sessionId,preview,dockExpanded,onExpandDock:()=>setDockExpanded(true),onFoldDock:()=>setDockExpanded(false),onOpenFile:host.canOpen()?path=>host.openFile(sessionId,path):undefined,onClose:()=>setEnabled(false),onTheme:theme=>themeRoot.current?.set(theme),onShell:next=>setShell(old=>old.stage===next.stage&&old.sidebar===next.sidebar?old:next)}),mount):null);
}
class Boundary extends React.Component {
  constructor(props){super(props);this.state={error:false};}
  static getDerivedStateFromError(){return {error:true};}
  render(){return this.state.error?h('span',{className:'tw-launch',title:'关闭插件或重新加载页面恢复。原聊天不受影响。'},'思路视窗暂不可用'):this.props.children;}
}
const inject=['slots'];
function apply(ctx){
  const host=createHostBridge(ctx);
  ctx.effect(()=>{const style=document.createElement('style');style.dataset.thoughtWindow='0.14.2';style.textContent=css;document.head.appendChild(style);return()=>style.remove();});
  ctx.slots.inject('conversation.input.left',function*(){
    yield ctx.slots.register({name:'conversation.input.left',id:'thought-window',order:90},props=>h(Boundary,null,h(Controller,{...props,host})));
  });
}
module.exports={name:'thought-window',inject,apply};

},
"./style.css": function(module){module.exports=".tw-native-shell{box-sizing:border-box!important;padding-left:var(--tw-panel-width)!important;position:relative!important;isolation:isolate}\n.tw-native-shell>.tw-mount{position:absolute;inset:0 auto 0 0;width:var(--tw-panel-width);z-index:3;border-right:1px solid #716f82;box-sizing:border-box}\n.tw-native-shell.tw-stacked{padding-left:0!important;padding-top:0!important}\n.tw-native-shell.tw-stacked>.tw-mount{width:100%;height:42%;bottom:auto;border-bottom:1px solid #716f82;border-right:0;position:relative;flex:none;order:-1}\n.tw-native-paper{background:#f3f0e6!important;color:#313139!important}\n.tw-native-night{background:#1b2130!important;color:#e1e6ed!important}\n.tw-native-paper{--dsw-alias-bg-base:#f3f0e6;--dsw-alias-bg-layer-1:#eeeae0;--dsw-alias-bg-module-platform:#f8f5ed;--dsw-alias-label-primary:#36363f;--dsw-alias-label-primary-bluish:#54546b;--dsw-alias-label-secondary:#686571;--dsw-alias-label-tertiary:#85838a;--dsw-alias-border-l2:#d4ced7;--dsw-alias-border-l3:#c5bed1;--dsw-alias-border-l4:#c5bed1;--dsw-alias-button-info-fill:#e6e2f0;--dsw-alias-interactive-bg-hover:#e6e2f0;--dsw-alias-interactive-bg-hover-solid:#e6e2f0;--dsw-alias-markdown-code-block:#e8e3da;--dsw-alias-state-business-primary:#7972ae}\n.tw-native-night{--dsw-alias-bg-base:#101724;--dsw-alias-bg-layer-1:#151f32;--dsw-alias-bg-module-platform:#101a2c;--dsw-alias-label-primary:#c8d6ea;--dsw-alias-label-primary-bluish:#c4d4ff;--dsw-alias-label-secondary:#a1b1cc;--dsw-alias-label-tertiary:#8492ad;--dsw-alias-border-l1:#28364d;--dsw-alias-border-l2:#344252;--dsw-alias-border-l3:#3f4b68;--dsw-alias-border-l4:#35405a;--dsw-alias-button-info-fill:#17275b;--dsw-alias-interactive-bg-hover:#233152;--dsw-alias-interactive-bg-hover-solid:#233152;--dsw-alias-markdown-code-block:#090f1b;--dsw-alias-state-business-primary:#7894ff;--dsw-alias-scrollbar-bg-l2:#344252}\n.tw-native-shell [data-composer-card]{border-radius:4px!important;border:1px solid var(--dsw-alias-border-l3)!important;box-shadow:3px 3px 0 #78729218!important}\n.tw-native-shell [data-conversation-scroll]{background:transparent!important}\n.tw-native-shell [data-composer-seat]{border-radius:2px!important}\n.tw-launch{font:12px Consolas,'Microsoft YaHei',monospace;white-space:nowrap;cursor:pointer;border:1px solid #8b87a4;padding:5px 9px;border-radius:2px;background:transparent;color:inherit}\n.tw-launch[aria-pressed=true]{background:#78729b22;color:#8278bd}\n.tw-window{--paper:#f2efe5;--panel:#f8f5ed;--ink:#36363f;--muted:#85838a;--line:#cecbd1;--accent:#7972ae;--accent-soft:#e6e2f0;--good:#688b7d;--danger:#b46966;--grid:#9992a91e;--shadow:#88829225;color:var(--ink);background:var(--paper);font:12px/1.45 Consolas,'SFMono-Regular','Microsoft YaHei',monospace;height:100%;width:100%;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;position:relative;text-align:left;color-scheme:light}\n.tw-window *{box-sizing:border-box}\n.tw-theme-night{--paper:#04070f;--panel:#0a1120;--ink:#c8d6ea;--muted:#70819c;--line:#344252;--accent:#7894ff;--accent-soft:#17275b;--good:#9ebad3;--danger:#ff3b30;--grid:#c8d6ea14;--shadow:#0004;color-scheme:dark}\n.tw-window:after{content:'';position:absolute;inset:0;pointer-events:none;z-index:10;background:repeating-linear-gradient(transparent 0px,transparent 3px,#746b7b06 3px,#746b7b06 4px)}\n.tw-window button,.tw-window select{font:inherit;color:inherit;cursor:pointer;border:1px solid var(--line);border-radius:0;background:var(--panel);padding:4px 8px;line-height:1.4}\n.tw-window button:hover{border-color:var(--accent);background:var(--accent-soft)}\n.tw-window button:focus-visible,.tw-window input:focus-visible,.tw-window select:focus-visible,.tw-map-scroll:focus-visible{outline:2px solid var(--accent);outline-offset:2px}\n.tw-window button:disabled{opacity:.4;cursor:default}\n.tw-window input{accent-color:var(--accent)}\n.tw-window input[type=checkbox]{width:12px;height:12px;margin:0;vertical-align:-2px}\n.tw-window label{cursor:pointer;white-space:nowrap}\n.tw-window small{font-size:10px;color:var(--muted)}\n.tw-titlebar{flex:none;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:16px 18px 13px;border-bottom:1px solid var(--ink)}\n.tw-titlebar>div:first-child{display:flex;align-items:baseline;gap:9px;flex-wrap:wrap}\n.tw-titlebar strong{font-size:14px;font-weight:700;letter-spacing:1px}\n.tw-mark{font-size:22px;line-height:1;color:var(--accent)}\n.tw-title-actions{display:flex;gap:4px}\n.tw-title-actions button{border:0;background:transparent;font-size:18px;padding:0 5px}\n.tw-ribbon{display:flex;align-items:center;justify-content:space-between;padding:9px 18px 4px;font-size:9px;letter-spacing:1px;color:var(--muted);flex:none}\n.tw-live{display:flex;align-items:center;gap:7px;color:var(--accent)}\n.tw-live i{width:6px;height:6px;background:var(--accent);display:inline-block}\n.tw-summary{display:flex;align-items:center;gap:27px;padding:8px 18px 16px;flex:none}\n.tw-summary>div:not(:last-child){display:flex;flex-direction:column;min-width:40px}\n.tw-summary small{font-size:9px;letter-spacing:1px}\n.tw-summary b{font-size:28px;line-height:1.1;font-weight:400;color:var(--accent)}\n.tw-summary-caption{margin-left:auto;display:flex;flex-direction:column;text-align:right;gap:4px;font-size:12px}\n.tw-map-toolbar{display:flex;align-items:center;gap:12px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:7px 18px;color:var(--muted);font-size:10px;flex:none}\n.tw-map-toolbar>span:first-child{margin-right:auto;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}\n.tw-view-switch{display:flex}.tw-view-switch button{font-size:10px;padding:1px 5px;border:0;background:transparent}.tw-view-switch button[aria-pressed=true]{background:var(--accent);color:var(--paper)}\n.tw-terminal{display:flex;flex-direction:column;flex:1;min-height:90px;margin:16px 16px 12px;border:1px solid var(--line);position:relative;background:linear-gradient(90deg,var(--paper),transparent);font-family:Consolas,'Microsoft YaHei',monospace}\n.tw-terminal:before,.tw-terminal:after{content:'';position:absolute;pointer-events:none;inset:-1px;z-index:2;background:linear-gradient(var(--ink),var(--ink)) left top/9px 2px no-repeat,linear-gradient(var(--ink),var(--ink)) left top/2px 9px no-repeat,linear-gradient(var(--ink),var(--ink)) right top/9px 2px no-repeat,linear-gradient(var(--ink),var(--ink)) right top/2px 9px no-repeat}\n.tw-terminal:after{transform:scaleY(-1)}\n.tw-term-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:-10px 12px 0;position:relative;z-index:3;font-size:10px;flex:none}.tw-term-heading strong{background:var(--paper);padding:0 6px;font-weight:500;font-size:12px}.tw-term-heading>span{padding:1px 6px;background:var(--ink);color:var(--paper);font-size:9px}\n.tw-term-main{flex:1;min-height:70px;display:flex;padding:12px 14px 9px 10px;gap:18px}\n.tw-index{width:56px;flex:none;display:flex;flex-direction:column;gap:5px;font-size:10px;color:var(--muted);padding-top:1px}.tw-index>span:first-child{margin-bottom:9px}.tw-index-item{display:flex;align-items:center;justify-content:space-between;padding:5px 4px;color:var(--accent);border:1px solid var(--line);font-size:10px}.tw-index-item small{font-size:9px}.tw-index .tw-index-current{color:var(--paper);background:var(--accent);border-color:var(--accent)}.tw-index-current small{color:var(--paper)}.tw-index-total{margin-top:9px;font-weight:700;color:var(--accent)}\n.tw-term-trace{display:flex;flex-direction:column;flex:1;min-width:0;min-height:0}.tw-term-command{flex:none;display:flex;align-items:center;gap:8px;color:var(--ink);font-size:12px;padding-bottom:12px;white-space:nowrap;overflow:hidden}.tw-term-command strong{font-weight:400;font-size:11px}.tw-caret{width:7px;height:12px;background:var(--accent);display:inline-block;flex:none}.tw-pulse-caret{animation:tw-blink .9s steps(2,end) infinite}\n.tw-term-axis{flex:none;display:flex;justify-content:space-between;color:var(--muted);font-size:9px;border-bottom:1px solid var(--line);padding-bottom:7px;margin-bottom:6px}\n.tw-term-rows{flex:1;min-height:0;overflow:auto;scrollbar-width:thin;scrollbar-color:var(--line) transparent;overscroll-behavior:contain;padding:0 4px 3px 0}\n.tw-window .tw-term-row{display:flex;align-items:center;gap:9px;width:100%;height:68px;border:0;padding:6px 0;background:transparent;text-align:left;animation:tw-node-in .32s steps(4,end) both;position:relative}\n.tw-window .tw-term-row:hover,.tw-window .tw-term-selected{background:var(--accent-soft)}\n.tw-row-index{font-size:9px;color:var(--muted);width:16px;flex:none;align-self:flex-start;padding-top:10px}.tw-row-copy{width:62%;min-width:0;display:flex;flex-direction:column;gap:3px}.tw-row-copy strong{font-size:14px;line-height:1.3;font-weight:400;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.tw-row-copy small{font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.tw-row-leader{flex:1;min-width:8px;border-top:2px dotted var(--line)}.tw-row-bubble{flex:none;border:2px solid var(--accent);background:var(--accent-soft);border-radius:50%;transition:height .3s steps(4,end),width .3s steps(4,end);box-shadow:inset 3px 3px 0 var(--paper)}.tw-status-running .tw-row-bubble{animation:tw-bubble-pulse 1.5s ease-in-out infinite}.tw-status-error .tw-row-bubble{border-color:var(--danger)}.tw-row-count{width:35px;flex:none;font-size:10px;font-weight:700}\n.tw-forward{padding-top:7px;flex:none}.tw-forward>div:first-child{display:flex;justify-content:space-between;font-size:8px;color:var(--muted);margin-bottom:5px}.tw-buffer-cells{display:flex;gap:2px}.tw-buffer-cells i{height:9px;flex:1;border:1px solid var(--line);background:transparent;min-width:1px}.tw-buffer-cells .tw-cell-IN,.tw-buffer-cells .tw-cell-OUT{background:var(--accent)}.tw-buffer-cells .tw-cell-TH{background:var(--accent-soft);border-color:var(--accent)}.tw-buffer-cells .tw-cell-IO{background:var(--good)}.tw-buffer-cells .tw-cell-ERR{background:var(--danger)}.tw-cell-running{animation:tw-blink .8s steps(2,end) infinite}\n.tw-instruments{flex:none;display:grid;grid-template-columns:1fr 1fr 1fr;border-top:1px solid var(--line);margin:4px 12px 8px;padding-top:12px;gap:12px}.tw-instrument{border:1px solid var(--line);min-width:0;padding:0 8px 5px;position:relative}.tw-instrument h3{font-size:9px;font-weight:400;margin:-7px 0 6px;background:var(--paper);display:table;padding:0 4px;letter-spacing:.5px}.tw-instrument p{font-size:10px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;margin:10px 0 8px}.tw-instrument small{font-size:8px}.tw-signal svg{display:block;width:100%;height:31px;margin:2px 0 5px}.tw-signal-axis{fill:none;stroke:var(--line);stroke-dasharray:2 3}.tw-signal-line{fill:none;stroke:var(--accent);stroke-width:1.5;shape-rendering:crispEdges}\n.tw-term-idle{padding:30px 10px;text-align:center;color:var(--muted)}.tw-term-idle strong{font-weight:400;font-size:12px}.tw-term-idle p{font-size:9px}.tw-pixel-orbit{font-size:38px;margin-bottom:15px;color:var(--accent);animation:tw-blink 3s steps(4,end) infinite}\n@keyframes tw-bubble-pulse{50%{box-shadow:inset 3px 3px 0 var(--paper),0 0 0 4px var(--accent-soft)}}\n.tw-no-motion .tw-row-bubble{transition:none!important}\n.tw-stacked .tw-terminal{margin:12px 9px 8px}.tw-stacked .tw-term-main{padding:8px 9px;gap:10px}.tw-stacked .tw-instruments,.tw-stacked .tw-index-total,.tw-stacked .tw-index>small,.tw-stacked .tw-term-command,.tw-stacked .tw-term-axis,.tw-stacked .tw-forward{display:none}.tw-stacked .tw-index{width:40px;gap:3px}.tw-stacked .tw-index-item{padding:2px 3px}.tw-stacked .tw-term-row{height:55px}.tw-stacked .tw-row-copy strong{font-size:12px}.tw-stacked .tw-row-copy{width:53%}.tw-stacked .tw-index>span:first-child{margin-bottom:2px}.tw-stacked .tw-term-heading{font-size:9px}.tw-stacked .tw-term-heading strong{font-size:10px}\n.tw-map-scroll{flex:1;min-height:90px;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--line) transparent;background-image:radial-gradient(var(--grid) 1px,transparent 1px);background-size:12px 12px}\n.tw-map{position:relative;min-width:530px;width:100%}\n.tw-lane{position:absolute;top:16px;font-size:9px;letter-spacing:1.5px;color:var(--muted)}\n.tw-lane-a{left:8.42%}.tw-lane-b{left:62.1%}\n.tw-wires{width:100%;height:100%;position:absolute;inset:0;pointer-events:none;overflow:visible}\n.tw-wire{fill:none;stroke:var(--accent);stroke-opacity:.45;stroke-width:1.3;stroke-dasharray:3 5;vector-effect:non-scaling-stroke;animation:tw-wire-in .6s ease-out both}\n.tw-parent{stroke:var(--good);stroke-dasharray:none;opacity:.6}\n.tw-current{fill:none;stroke:var(--accent);stroke-width:3;stroke-dasharray:3 36;animation:tw-flow 2s linear infinite;vector-effect:non-scaling-stroke}\n.tw-growing{fill:none;stroke:var(--accent);stroke-width:1.5;stroke-dasharray:1;stroke-dashoffset:0;opacity:0;animation:tw-grow .7s ease-out both;vector-effect:non-scaling-stroke}\n.tw-window .tw-node{position:absolute;height:84px;display:flex;flex-direction:column;justify-content:space-between;text-align:left;padding:8px 11px;border:1px solid var(--line);box-shadow:3px 3px 0 var(--shadow);background:var(--panel);animation:tw-node-in .4s steps(5,end) both;isolation:isolate}\n.tw-node:before{content:'';position:absolute;top:-4px;left:calc(50% - 3px);width:6px;height:6px;background:var(--paper);border:1px solid var(--accent)}\n.tw-node-meta{display:flex;justify-content:space-between;gap:5px;font-size:8px;letter-spacing:.3px;color:var(--muted);white-space:nowrap}\n.tw-node-meta>span:first-child{overflow:hidden;text-overflow:ellipsis}\n.tw-node-dot{width:6px;height:6px;flex:none;background:var(--good);margin-top:2px}\n.tw-node strong{font-size:12px;font-weight:500;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.45;overflow-wrap:anywhere}\n.tw-node-state{font-size:8px;letter-spacing:.5px;color:var(--muted)}\n.tw-window .tw-selected{outline:2px solid var(--accent);outline-offset:3px}\n.tw-window .tw-input{background:var(--accent-soft);border-color:var(--accent)}\n.tw-window .tw-tool{border-color:var(--good)}\n.tw-window .tw-answer{border-color:var(--accent);border-left-width:4px}\n.tw-window .tw-status-running{border-color:var(--accent)}\n.tw-status-running .tw-node-dot{background:var(--accent);animation:tw-blink 1s steps(2,end) infinite}\n.tw-status-error .tw-node-dot,.tw-error .tw-node-dot{background:var(--danger)}\n.tw-status-stopped .tw-node-dot{background:var(--muted)}\n.tw-empty{position:absolute;top:80px;left:0;right:0;text-align:center;padding:20px 28px;color:var(--muted)}\n.tw-empty-icon{font-size:36px;color:var(--accent);margin-bottom:14px;animation:tw-blink 3s steps(4,end) infinite}\n.tw-empty strong{color:var(--ink);font-size:15px;font-weight:400;display:block}.tw-empty p{font-size:11px}\n.tw-note{font-size:10px;color:var(--muted);padding:5px 18px;border-top:1px solid var(--line);flex:none}\n.tw-source{flex:none;border-top:1px solid var(--accent);background:var(--panel);padding:10px 18px;max-height:34%;display:flex;flex-direction:column;min-height:100px}\n.tw-source-title{display:flex;justify-content:space-between;align-items:center;font-size:11px}.tw-source-title button{padding:0 5px;border:0}\n.tw-source-meta{font-size:9px;color:var(--muted);margin:3px 0 7px}\n.tw-source pre{font:11px/1.65 Consolas,'Microsoft YaHei',monospace;white-space:pre-wrap;overflow-wrap:anywhere;overflow:auto;margin:0;color:var(--ink);min-height:20px}\n.tw-controls{flex:none;padding:10px 18px 12px;border-top:1px solid var(--ink);background:var(--paper)}\n.tw-timeline-label{display:flex;justify-content:space-between;font-size:9px;color:var(--muted);letter-spacing:.5px}\n.tw-timeline{width:100%;height:14px;margin:5px 0 8px;cursor:pointer}\n.tw-playbar{display:flex;gap:5px;align-items:center}.tw-playbar button,.tw-playbar select{font-size:10px;padding:3px 7px}.tw-spacer{flex:1}.tw-window .tw-active{background:var(--accent-soft);border-color:var(--accent);color:var(--accent)}\n.tw-storage-row{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:9px;color:var(--muted);flex-wrap:wrap}.tw-storage-row button{font-size:9px;padding:0 4px;border:0;background:transparent;text-decoration:underline}.tw-storage-row small{margin-left:auto;font-size:8px}\n.tw-disclosure{font-size:9px;color:var(--muted);line-height:1.5;margin:8px 0 0}.tw-notice{margin:6px 0 0;font-size:10px;color:var(--accent)}\n.tw-pulse i{animation:tw-blink 1.5s steps(2,end) infinite}\n@keyframes tw-node-in{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:translateY(0)}}\n@keyframes tw-wire-in{from{stroke-opacity:0}to{stroke-opacity:.45}}\n@keyframes tw-grow{0%{stroke-dashoffset:1;opacity:1}85%{stroke-dashoffset:0;opacity:1}100%{stroke-dashoffset:0;opacity:0}}\n@keyframes tw-flow{to{stroke-dashoffset:-78}}\n@keyframes tw-blink{50%{opacity:.35}}\n.tw-no-motion *{animation:none!important;scroll-behavior:auto!important}\n.tw-stacked .tw-summary,.tw-stacked .tw-ribbon,.tw-stacked .tw-storage-row,.tw-stacked .tw-disclosure,.tw-stacked .tw-summary-caption{display:none}\n.tw-stacked .tw-titlebar{padding:7px 14px}.tw-stacked .tw-titlebar strong{font-size:12px}.tw-stacked .tw-titlebar small{display:none}\n.tw-stacked .tw-controls{padding:5px 14px}.tw-stacked .tw-timeline-label{display:none}.tw-stacked .tw-timeline{margin:0 0 3px}\n.tw-stacked .tw-source{position:absolute;inset:40px 8px 76px 8px;max-height:none;z-index:12;border:1px solid var(--accent);box-shadow:4px 4px 0 var(--shadow)}\n@media(prefers-reduced-motion:reduce){.tw-window *{animation:none!important;scroll-behavior:auto!important}}\n\n/* Scene-specific geometry, six palettes and bounded CSS-only motion. */\n.tw-theme-amber,.tw-native-amber{--paper:#17120c;--panel:#21190f;--ink:#eed8b6;--muted:#b69a72;--line:#59482e;--accent:#efb554;--accent-soft:#473117;--good:#c6ba83;--danger:#ff8b66;--grid:#efb55415;--shadow:#0005;color-scheme:dark}\n.tw-theme-phosphor,.tw-native-phosphor{--paper:#0b1612;--panel:#101f19;--ink:#c5e6cf;--muted:#80a991;--line:#2e5340;--accent:#8bd7a1;--accent-soft:#1e3c2b;--good:#b9e1a0;--danger:#ef9d87;--grid:#8bd7a118;--shadow:#0005;color-scheme:dark}\n.tw-theme-violet,.tw-native-violet{--paper:#191427;--panel:#241d36;--ink:#e6dcf5;--muted:#a99abc;--line:#554464;--accent:#c5a0ee;--accent-soft:#403051;--good:#a4c3c2;--danger:#f093ad;--grid:#c5a0ee15;--shadow:#0005;color-scheme:dark}\n.tw-theme-blueprint,.tw-native-blueprint{--paper:#173450;--panel:#1e3e5d;--ink:#e1eced;--muted:#9dbbc9;--line:#51758d;--accent:#b1d9e6;--accent-soft:#2c506a;--good:#b5d8c5;--danger:#ffd5af;--grid:#b1d9e619;--shadow:#081f3644;color-scheme:dark}\n:is(.tw-native-amber,.tw-native-phosphor,.tw-native-violet,.tw-native-blueprint){background:var(--paper)!important;color:var(--ink)!important;--dsw-alias-bg-base:var(--paper);--dsw-alias-bg-layer-1:var(--panel);--dsw-alias-bg-module-platform:var(--panel);--dsw-alias-label-primary:var(--ink);--dsw-alias-label-primary-bluish:var(--ink);--dsw-alias-label-secondary:var(--muted);--dsw-alias-label-tertiary:var(--muted);--dsw-alias-border-l1:var(--line);--dsw-alias-border-l2:var(--line);--dsw-alias-border-l3:var(--line);--dsw-alias-border-l4:var(--line);--dsw-alias-button-info-fill:var(--accent-soft);--dsw-alias-interactive-bg-hover:var(--accent-soft);--dsw-alias-interactive-bg-hover-solid:var(--accent-soft);--dsw-alias-markdown-code-block:var(--paper);--dsw-alias-state-business-primary:var(--accent);--dsw-alias-scrollbar-bg-l2:var(--line)}\n.tw-window{transition:background-color .5s,color .5s}\n.tw-theme-paper{--muted:#737078}\n.tw-theme-night{--muted:#92a1b9}\n.tw-appearance{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 18px;border-bottom:1px solid var(--line);font-size:9px;color:var(--muted);flex:none}\n.tw-appearance select{font-size:10px;padding:2px 5px;color:var(--accent);background:transparent;border:0}\n.tw-layout-adaptive .tw-summary{padding:5px 18px 10px;gap:20px}\n.tw-layout-adaptive .tw-summary b{font-size:21px}.tw-layout-adaptive .tw-summary-caption{font-size:11px}\n.tw-adaptive{display:flex;flex-direction:column;flex:1;min-height:110px;overflow:hidden;position:relative}\n.tw-director-bar{display:flex;align-items:center;gap:7px;padding:9px 18px;font-size:9px;color:var(--muted);flex:none}\n.tw-director-light{width:5px;height:5px;background:var(--accent);box-shadow:0 0 0 3px var(--accent-soft);flex:none}\n.tw-director-bar select{margin-left:auto;font-size:10px;padding:2px 5px;max-width:48%}\n.tw-scene-heading{display:flex;gap:13px;align-items:center;padding:7px 23px 16px;flex:none}\n.tw-scene-symbol{font-size:30px;color:var(--accent);line-height:1}\n.tw-scene-heading h2{font-size:22px;font-weight:400;letter-spacing:2px;margin:3px 0 0;line-height:1.2}\n.tw-scene-heading small{font-size:9px;letter-spacing:2px;color:var(--accent)}\n.tw-scene-reason{font-size:9px;color:var(--muted);margin-left:auto;max-width:34%;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.tw-scene-viewport{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--line) transparent;padding:0 23px 12px;background-image:radial-gradient(var(--grid) 1px,transparent 1px);background-size:12px 12px;outline-offset:-3px}\n.tw-scene-stage{position:relative;min-height:100%;animation:tw-scene-enter .44s steps(6,end) both}\n.tw-scene-shutter{position:absolute;inset:0;pointer-events:none;z-index:4;border-top:1px solid var(--accent);background:linear-gradient(var(--accent-soft),transparent 40%);animation:tw-shutter .55s steps(9,end) both}\n.tw-scene-tape{display:flex;align-items:center;gap:5px;padding:8px 18px;border-top:1px solid var(--line);font-size:9px;color:var(--muted);flex:none}\n.tw-scene-tape>span{margin-right:7px;letter-spacing:1px}\n.tw-scene-tape button{padding:2px 6px;font-size:9px;background:transparent}\n.tw-scene-tape button[aria-pressed=true]{background:var(--accent);color:var(--paper)}\n.tw-tape-live{border-color:var(--accent)!important;animation:tw-blink 1.6s steps(3,end) infinite}\n.tw-scene-screenreader{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}\n.tw-window .tw-scene-tile{display:block;position:relative;width:100%;padding:13px 15px;text-align:left;background:var(--panel);border:1px solid var(--line);box-shadow:3px 3px 0 var(--shadow);overflow:hidden;overflow-wrap:anywhere;animation:tw-tile-enter .45s steps(6,end) both;animation-delay:calc(var(--order,0)*40ms);transition:border-color .2s,transform .2s}\n.tw-window .tw-scene-tile:hover{border-color:var(--accent);transform:translateY(-2px);background:var(--accent-soft)}\n.tw-scene-tile p{font-size:12px;line-height:1.85;margin:7px 0 0;white-space:pre-wrap;color:var(--ink)}\n.tw-tile-label,.tw-scene-tile small{font-size:9px;color:var(--muted);letter-spacing:.5px}\n.tw-scene-footnote{font-size:9px;color:var(--muted);line-height:1.6;margin:14px 0 4px}\n.tw-scene-placeholder{font-size:11px;color:var(--muted);line-height:1.8;border:1px dashed var(--line);padding:18px}\n.tw-scene-command{font-size:10px;padding:7px 0 18px;color:var(--accent)}\n/* ATLAS — orbital motif and source islands. */\n.tw-atlas{position:relative;padding-top:12px}\n.tw-orbit-art{position:relative;width:150px;height:104px;margin:0 auto 10px;display:grid;place-items:center;color:var(--accent)}\n.tw-orbit-art i{position:absolute;width:130px;height:64px;border:1px solid var(--line);border-radius:50%;transform:rotate(-25deg)}\n.tw-orbit-art i:nth-child(2){transform:rotate(40deg)}.tw-orbit-art i:nth-child(3){transform:rotate(95deg)}\n.tw-orbit-art i:before{content:'';position:absolute;left:20px;top:0;width:5px;height:5px;background:var(--accent)}\n.tw-orbit-art b{font-weight:400;font-size:34px}\n.tw-window[data-motion=rich] .tw-orbit-art{animation:tw-orbit-drift 12s linear infinite}\n.tw-atlas-center{margin:0 auto 25px;text-align:center;max-width:80%;position:relative}\n.tw-atlas-center small{font-size:8px;letter-spacing:2px}.tw-atlas-center strong{display:block;font-size:16px;font-weight:400;line-height:1.65;margin-top:7px}\n.tw-atlas-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}\n.tw-atlas-grid .tw-scene-tile:nth-child(even){border-top:3px solid var(--accent)}\n/* PLAN — numbered steps and a travelling connector. */\n.tw-plan-step{display:grid;grid-template-columns:36px 1fr;gap:10px;position:relative;padding-bottom:21px}\n.tw-step-number{font-size:22px;color:var(--accent);padding-top:9px;font-weight:400}\n.tw-plan-step:not(:last-of-type):before{content:'';position:absolute;left:13px;top:43px;bottom:4px;border-left:1px dashed var(--line)}\n.tw-step-connector{position:absolute;bottom:0;left:calc(50% + 10px);font-size:15px;color:var(--accent)}\n.tw-plan-step:last-of-type .tw-step-connector{display:none}\n.tw-window[data-motion=rich] .tw-step-connector{animation:tw-step-flow 1.8s ease-in-out infinite;animation-delay:calc(var(--order)*120ms)}\n.tw-plan .tw-scene-tile{padding:9px 14px}.tw-plan .tw-scene-tile p{margin-top:4px}\n/* COMPARE — parallel cards, no invented scores or winning branch. */\n.tw-branch-root{padding:14px 20px;text-align:center;border:1px solid var(--accent);margin:4px auto 0;max-width:88%;background:var(--accent-soft)}\n.tw-branch-root span{font-size:8px;letter-spacing:2px;color:var(--accent)}\n.tw-branch-root strong{display:block;font-weight:400;font-size:14px;line-height:1.7;margin-top:6px}\n.tw-branch-lines{text-align:center;font-size:24px;letter-spacing:2px;color:var(--accent);overflow:hidden;white-space:nowrap;animation:tw-branch-draw .7s steps(10,end) both}\n.tw-branch-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px}\n.tw-branch-card{min-height:195px}.tw-branch-card:nth-child(even){background:var(--accent-soft)}\n.tw-branch-symbol{display:block;font-size:31px;color:var(--accent);line-height:1;margin-bottom:16px}\n.tw-branch-card h3{font-weight:400;font-size:16px;letter-spacing:1px;margin:0}.tw-branch-card p{min-height:70px}.tw-branch-card small{display:block;margin-top:20px}\n/* SEARCH — radar is decorative, source tiles carry the evidence. */\n.tw-search-upper{display:grid;grid-template-columns:146px 1fr;gap:26px;align-items:center;margin:12px 0 25px}\n.tw-search-upper h3{font-size:17px;line-height:1.6;font-weight:400;margin:7px 0 9px}.tw-search-upper p{color:var(--muted);font-size:11px;line-height:1.7}\n.tw-search-upper small{font-size:8px;letter-spacing:.5px}\n.tw-radar{height:146px;width:146px;border:1px solid var(--accent);border-radius:50%;position:relative;overflow:hidden;background:linear-gradient(transparent calc(50% - .5px),var(--line) 50%,transparent calc(50% + .5px)),linear-gradient(90deg,transparent calc(50% - .5px),var(--line) 50%,transparent calc(50% + .5px))}\n.tw-radar-ring{position:absolute;inset:22%;border:1px solid var(--line);border-radius:50%}.tw-radar-ring:after{content:'';position:absolute;inset:24%;border:1px dashed var(--line);border-radius:50%}\n.tw-radar-sweep{position:absolute;inset:0;background:conic-gradient(transparent 250deg,var(--accent-soft) 335deg,var(--accent) 359deg,transparent 0deg);opacity:.6;animation:tw-radar-turn 5s linear infinite}\n.tw-radar>b{position:absolute;left:calc(50% - 4px);top:calc(50% - 10px);font-size:16px;font-weight:400;color:var(--accent)}\n.tw-radar>span{position:absolute;width:5px;height:5px;background:var(--accent);box-shadow:0 0 0 4px var(--accent-soft);animation:tw-blink 3s steps(3,end) infinite}\n.tw-search-results{display:flex;flex-direction:column;gap:9px}.tw-window .tw-document-tile{display:flex;gap:15px;padding:11px 15px}.tw-document-icon{font-size:25px;color:var(--accent);padding-top:7px}.tw-document-tile p{margin-top:3px}\n/* CODE & MATH — text remains selectable and tied to its original node. */\n.tw-code-board{border:1px solid var(--line);margin-top:5px;background:var(--panel);box-shadow:5px 5px 0 var(--shadow)}\n.tw-code-bar,.tw-code-bottom{display:flex;justify-content:space-between;gap:12px;padding:10px 13px;font-size:9px;color:var(--accent);border-bottom:1px solid var(--line);background:var(--accent-soft)}\n.tw-window .tw-code-source{width:100%;display:block;padding:10px 0 22px;background:transparent;border:0;text-align:left;overflow:hidden}\n.tw-code-lines>div{display:grid;grid-template-columns:42px 1fr;min-height:25px}.tw-code-lines>div:nth-child(even){background:var(--grid)}\n.tw-code-lines>div>span{font-size:10px;padding:3px 9px;color:var(--muted);border-right:1px solid var(--line)}\n.tw-code-lines code{font:12px/1.8 Consolas,'Microsoft YaHei',monospace;white-space:pre-wrap;overflow-wrap:anywhere;padding:1px 14px;color:var(--ink)}\n.tw-code-bottom{border-top:1px solid var(--line);border-bottom:0;background:transparent;padding:6px 12px}.tw-code-cursor{animation:tw-blink 1s steps(2,end) infinite}.tw-code-board>.tw-scene-footnote{padding:0 13px 8px}\n.tw-math-board{position:relative;padding:22px 15px 10px;background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);background-size:24px 24px;border:1px solid var(--line)}\n.tw-math-watermark{position:absolute;font:160px Georgia,serif;right:10px;top:0;color:var(--line);opacity:.3;pointer-events:none}\n.tw-math-title{font-size:9px;letter-spacing:2px;margin-bottom:25px;color:var(--accent)}\n.tw-window .tw-equation{background:transparent;box-shadow:none;border:0;border-left:2px solid var(--accent);margin:18px 0 25px;padding:10px 16px;min-height:80px}\n.tw-equation pre{font:19px/1.6 Consolas,'Microsoft YaHei',monospace;white-space:pre-wrap;overflow-wrap:anywhere;margin:12px 0}\n/* EXECUTE — discrete activity cells; no percentage implied. */\n.tw-exec-bus{display:flex;align-items:center;gap:12px;padding:22px 4px 28px;font-size:10px;color:var(--accent)}\n.tw-exec-bus i{flex:1;height:1px;background:var(--line);position:relative}.tw-exec-bus i:after{content:'';position:absolute;width:6px;height:6px;top:-2px;background:var(--accent);animation:tw-bus-packet 2s steps(16,end) infinite}\n.tw-window .tw-exec-card{margin-bottom:14px;padding:15px 17px}.tw-exec-heading{display:flex;justify-content:space-between;gap:12px;align-items:center}.tw-exec-heading strong{font-weight:400;color:var(--accent);font-size:15px}.tw-exec-heading>span{font-size:10px}\n.tw-exec-meter{display:flex;gap:3px;margin:17px 0}.tw-exec-meter i{height:12px;flex:1;min-width:0;border:1px solid var(--line)}\n.tw-exec-running .tw-exec-meter i{background:var(--accent-soft);animation:tw-exec-cell 1.8s steps(3,end) infinite;animation-delay:calc(var(--cell)*45ms)}\n.tw-exec-done .tw-exec-meter i{background:var(--accent-soft);border-color:var(--accent)}.tw-exec-error .tw-exec-meter i{background:var(--danger);opacity:.4}.tw-exec-stopped .tw-exec-meter i{background:var(--line)}\n.tw-exec-card pre{font:11px/1.8 Consolas,'Microsoft YaHei',monospace;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--muted);margin:0}\n/* CHECK, REVISE, RESPONSE — registers, split drafts and paper assembly. */\n.tw-check-heading{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid var(--accent);padding:9px 0 14px;margin-bottom:5px;font-size:10px;color:var(--accent)}\n.tw-check-heading b{font-size:29px;font-weight:400}\n.tw-window .tw-check-row{display:flex;gap:15px;border:0;border-bottom:1px dotted var(--line);box-shadow:none;background:transparent;padding:15px 4px}\n.tw-check-box{border:1px solid var(--accent);width:24px;height:24px;line-height:22px;text-align:center;flex:none;color:var(--accent);font-size:17px;margin-top:3px}\n.tw-check-row p{margin:0 0 5px}.tw-check-row small{font-size:8px}\n.tw-revise-banner{display:flex;gap:17px;align-items:center;background:repeating-linear-gradient(135deg,var(--accent-soft) 0px,var(--accent-soft) 3px,transparent 3px,transparent 8px);border:1px solid var(--line);padding:20px;margin:4px 0 20px}\n.tw-revise-banner>span{font-size:43px;color:var(--accent)}.tw-revise-banner h3{font-size:18px;font-weight:400;margin:6px 0 0}.tw-revise-columns{display:grid;grid-template-columns:1fr 1fr;gap:16px}.tw-revise-columns h4{font-weight:400;font-size:11px;color:var(--accent);border-bottom:1px solid var(--line);padding-bottom:8px;margin:0 0 10px}.tw-revise-columns .tw-scene-tile{margin-bottom:10px}.tw-revise-columns .tw-scene-placeholder{margin:0}\n.tw-answer-stamp{border:1px solid var(--accent);font-size:9px;padding:5px 10px;width:max-content;margin:3px 0 15px;color:var(--accent);letter-spacing:1px}\n.tw-window .tw-answer-page{padding:23px;background:var(--panel);border-color:var(--accent);box-shadow:4px 4px 0 var(--paper),5px 5px 0 var(--line),8px 8px 0 var(--paper),9px 9px 0 var(--line);margin-bottom:28px}\n.tw-answer-page p{font-size:14px;line-height:1.95;margin-top:16px}.tw-answer-corner{position:absolute;right:14px;top:12px;color:var(--accent);font-size:18px}.tw-answer-evidence{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.tw-answer-evidence .tw-scene-tile{padding:10px}.tw-answer-evidence p{font-size:10px;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}\n@keyframes tw-scene-enter{from{opacity:.2;transform:translateY(9px)}to{opacity:1;transform:none}}\n@keyframes tw-shutter{0%{opacity:.65;clip-path:inset(0 0 0 0)}100%{opacity:0;clip-path:inset(100% 0 0 0)}}\n@keyframes tw-tile-enter{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:none}}\n@keyframes tw-branch-draw{from{clip-path:inset(0 50%)}to{clip-path:inset(0 0)}}\n@keyframes tw-radar-turn{to{transform:rotate(360deg)}}\n@keyframes tw-orbit-drift{50%{transform:rotate(10deg)}100%{transform:rotate(0deg)}}\n@keyframes tw-step-flow{50%{transform:translateY(3px);opacity:.4}}\n@keyframes tw-bus-packet{from{left:0;opacity:.3}to{left:calc(100% - 6px);opacity:1}}\n@keyframes tw-exec-cell{0%,70%,100%{background:var(--accent-soft)}35%{background:var(--accent)}}\n.tw-window[data-motion=calm] :is(.tw-radar-sweep,.tw-radar>span,.tw-exec-bus i:after,.tw-exec-meter i,.tw-code-cursor,.tw-tape-live){animation:none}\n.tw-window[data-motion=calm] .tw-scene-shutter{display:none}.tw-window[data-motion=calm] .tw-scene-stage{animation:tw-wire-in .2s ease-out both}\n.tw-window[data-motion=calm] .tw-scene-tile{animation-delay:0s;animation-duration:.2s;transition:none}\n.tw-no-motion,.tw-no-motion *,.tw-no-motion *:before,.tw-no-motion *:after{animation:none!important;transition:none!important;scroll-behavior:auto!important}\n.tw-no-motion .tw-scene-shutter{display:none}\n.tw-stacked .tw-appearance{padding:3px 14px}.tw-stacked .tw-map-toolbar{padding:5px 14px;gap:8px}\n.tw-stacked .tw-director-bar{padding:5px 14px}.tw-stacked .tw-scene-heading{padding:3px 14px 9px;gap:10px}.tw-stacked .tw-scene-heading h2{font-size:15px}.tw-stacked .tw-scene-symbol{font-size:22px}.tw-stacked .tw-scene-heading small{font-size:7px}.tw-stacked .tw-scene-reason{display:none}\n.tw-stacked .tw-scene-viewport{padding:0 14px 8px}.tw-stacked .tw-scene-tape{padding:4px 14px}.tw-stacked .tw-adaptive{min-height:85px}.tw-stacked .tw-orbit-art{display:none}.tw-stacked .tw-atlas-center{margin-bottom:15px}.tw-stacked .tw-atlas-center strong{font-size:12px}.tw-stacked .tw-scene-footnote{margin-top:8px}\n@media(max-width:480px){.tw-map-toolbar>span:first-child{display:none}.tw-map-toolbar{justify-content:space-between}.tw-appearance{gap:5px}.tw-appearance label{font-size:8px}.tw-branch-grid,.tw-revise-columns{grid-template-columns:1fr}.tw-search-upper{grid-template-columns:96px 1fr;gap:14px}.tw-radar{width:96px;height:96px}.tw-search-upper h3{font-size:14px}.tw-answer-evidence{grid-template-columns:1fr}.tw-director-bar{font-size:8px}.tw-atlas-grid{grid-template-columns:1fr}}\n@media(prefers-reduced-motion:reduce){.tw-window,.tw-window *,.tw-window *:before,.tw-window *:after{animation:none!important;transition:none!important;scroll-behavior:auto!important}.tw-scene-shutter{display:none}}\n\n/* Live, event-driven interpretation of the reference PV's continuity grammar. */\n.tw-native-shell{padding-left:0!important;padding-right:var(--tw-panel-width)!important}\n.tw-native-shell>.tw-mount{inset:0 0 0 auto;border-right:0;border-left:1px solid #8e899880}\n.tw-native-shell.tw-stacked{padding-right:0!important}\n.tw-native-shell.tw-stacked>.tw-mount{order:5;height:45%;border-left:0;border-bottom:0;border-top:1px solid #8e899880;inset:auto;width:100%}\n.tw-divider{position:absolute;top:0;bottom:0;right:calc(var(--tw-panel-width) - 5px);width:10px;z-index:8;cursor:col-resize;touch-action:none;outline-offset:-3px}\n.tw-divider:before{content:'';position:absolute;top:calc(50% - 18px);left:3px;width:3px;height:36px;border:1px solid #8c87a4;background:#aaa4bc55;border-radius:2px;transition:height .2s,background .2s}\n.tw-divider:hover:before,.tw-divider:focus-visible:before,.tw-resizing .tw-divider:before{height:54px;background:#a49ac6}\n.tw-divider:focus-visible{outline:2px solid #8e85bf}.tw-stacked>.tw-divider{display:none}.tw-resizing{user-select:none;cursor:col-resize}\n.tw-window{container:thought / inline-size;--secondary:#c4ae84;font-size:12px}\n.tw-titlebar{padding:13px 19px;min-height:48px}.tw-titlebar strong{font-size:13px;letter-spacing:1px}.tw-titlebar small{font-size:9px;margin-left:12px}.tw-title-actions{gap:9px}\n.tw-ribbon{padding:8px 19px 10px;font-size:9px;letter-spacing:1.2px}\n.tw-summary{display:none!important}.tw-map-toolbar{padding:8px 19px;gap:12px}.tw-map-toolbar>span:first-child{font-size:9px}.tw-view-switch button{font-size:11px;padding:2px 8px}\n.tw-appearance{padding:9px 19px;background:var(--panel);animation:tw-settings-in .2s ease-out}.tw-appearance select{font-size:11px}\n.tw-controls{padding:8px 19px 9px;border-top:1px solid var(--line)}.tw-timeline{height:9px;margin:3px 0 7px}.tw-timeline-label{font-size:8px}.tw-playbar button,.tw-playbar select{font-size:10px;padding:3px 8px}.tw-disclosure{font-size:8px;letter-spacing:.3px;margin-top:7px}\n.tw-director-bar{padding:10px 19px 5px;font-size:8px;letter-spacing:.7px}.tw-director-bar select{font-size:10px}\n.tw-scene-heading{padding:9px 24px 17px;gap:12px}.tw-scene-heading h2{font-size:22px;letter-spacing:1.2px}.tw-scene-heading small{letter-spacing:2px;font-size:8px}.tw-scene-symbol{font-size:27px}.tw-scene-reason{font-size:8px}\n.tw-scene-viewport{padding:0 22px 16px;background-size:16px 16px;position:relative}\n.tw-scene-tape{padding:6px 19px}.tw-scene-tape button{font-size:9px}\n.tw-window button,.tw-window select,.tw-film-figure,.tw-scene-heading,.tw-controls{transition:background-color .42s ease,color .42s ease,border-color .42s ease}\n.tw-window .tw-scene-tile{animation:tw-film-item .38s cubic-bezier(.22,.72,.18,1) both;animation-delay:calc(var(--order,0)*35ms);border-width:0 0 1px;box-shadow:none;background:transparent;padding:11px 13px;transition:background-color .3s,color .3s,border-color .3s}\n.tw-window .tw-scene-tile:hover{transform:none;background:var(--accent-soft)}.tw-scene-tile p{font-size:12px;line-height:1.8}.tw-scene-tile small,.tw-tile-label{font-size:8px}\n.tw-continuity-stage{position:relative;isolation:isolate;min-height:100%;perspective:1000px;overflow:hidden}\n.tw-shot-in{position:relative;z-index:2;transform-origin:50% 120px;min-width:0}\n.tw-shot-out{position:absolute;inset:0;z-index:1;pointer-events:none;overflow:hidden;transform-origin:50% 120px;max-height:100%}\n.tw-shot-out *{pointer-events:none!important;animation-play-state:paused!important}\n.tw-flight-field{position:absolute;z-index:4;left:0;top:30px;width:100%;height:auto;aspect-ratio:640/300;pointer-events:none;overflow:visible}\n.tw-flight-pixel{fill:var(--accent);opacity:0;will-change:transform,opacity;font:10px Consolas,monospace}\n.tw-flight-pixel:nth-child(3n){fill:var(--secondary)}.tw-flight-carrier{fill:var(--accent);opacity:0}.tw-carrier-halo{fill:none;stroke:var(--accent);stroke-opacity:.4;stroke-width:1}\n.tw-film-figure{position:relative;margin:0 0 18px;border:1px solid var(--line);background:var(--panel);overflow:hidden}\n.tw-film-figure:before,.tw-film-figure:after{content:'';position:absolute;inset:0;z-index:1;pointer-events:none;background:linear-gradient(var(--accent),var(--accent)) left top/11px 1px no-repeat,linear-gradient(var(--accent),var(--accent)) left top/1px 11px no-repeat,linear-gradient(var(--accent),var(--accent)) right top/11px 1px no-repeat,linear-gradient(var(--accent),var(--accent)) right top/1px 11px no-repeat}\n.tw-film-figure:after{transform:scaleY(-1)}\n.tw-figure-register{display:flex;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--line);font-size:8px;letter-spacing:1.3px;color:var(--muted)}\n.tw-film-figure svg{display:block;width:100%;height:auto;max-height:330px;aspect-ratio:640/300;overflow:hidden}\n.tw-film-figure figcaption{display:flex;align-items:flex-start;gap:8px;padding:10px 12px;border-top:1px solid var(--line);font-size:11px;line-height:1.65;color:var(--ink);background:var(--accent-soft);min-height:39px}\n.tw-caption-cell{width:5px;height:12px;flex:none;background:var(--accent);margin-top:3px;animation:tw-caption-breathe 2.5s ease-in-out infinite}\n.tw-ambient-points{fill:var(--accent);opacity:.16}.tw-pixel-word{fill:var(--accent)}\n.tw-figure-node{cursor:pointer;outline:none}.tw-figure-node>rect:first-of-type{fill:var(--paper);stroke:var(--line);stroke-width:1;transition:fill .3s,stroke .3s}.tw-figure-node:hover>rect:first-of-type,.tw-figure-node:focus-visible>rect:first-of-type{fill:var(--accent-soft);stroke:var(--accent)}\n.tw-figure-node:focus-visible{filter:drop-shadow(0 0 2px var(--accent))}.tw-figure-dot{fill:var(--accent)}\n.tw-svg-label{fill:var(--ink);font:12px Consolas,'Microsoft YaHei',monospace}.tw-svg-meta{fill:var(--muted);font:9px Consolas,'Microsoft YaHei',monospace;letter-spacing:.4px}\n.tw-diagram-path{fill:none;stroke:var(--accent);stroke-width:1;stroke-opacity:.65;stroke-dasharray:1;stroke-dashoffset:0;animation:tw-diagram-draw 1s cubic-bezier(.22,.72,.18,1) both}\n.tw-grid-line{fill:none;stroke:var(--line);stroke-width:1;stroke-opacity:.55;stroke-dasharray:2 5}\n.tw-river-glyph{fill:var(--ink);font:12px Consolas,'Microsoft YaHei',monospace;animation:tw-river-float 6s ease-in-out infinite;animation-delay:var(--delay);opacity:.8}\n.tw-river-glyph:nth-child(3n){fill:var(--accent)}.tw-river-glyph:nth-child(4n){fill:var(--secondary)}\n.tw-focus-cell{fill:var(--accent);animation:tw-caption-breathe 2.4s ease-in-out infinite;filter:drop-shadow(0 0 3px var(--accent))}\n.tw-map-ring{fill:none;stroke:var(--accent);stroke-width:1;stroke-opacity:.45;stroke-dasharray:2 4}\n.tw-radar-wedge{fill:var(--accent-soft);stroke:var(--accent);stroke-width:.5;opacity:.55}.tw-orbital-scan{transform-origin:320px 150px;animation:tw-radar-turn 9s linear infinite}\n.tw-bus-dot{fill:var(--secondary);animation:tw-bus-travel 3s cubic-bezier(.45,0,.55,1) infinite}\n.tw-sigma{fill:var(--accent);opacity:.24;font:110px Georgia,serif}.tw-svg-equation{fill:var(--ink);font:16px Consolas,'Microsoft YaHei',monospace}\n.tw-formula-line{cursor:pointer}.tw-formula-line:hover .tw-svg-equation{fill:var(--accent)}\n.tw-register-box{stroke:var(--accent);fill:var(--accent-soft);stroke-width:1}.tw-register-line{animation:tw-film-item .4s ease-out both;animation-delay:calc(var(--order)*60ms);cursor:pointer}.tw-register-line:hover .tw-svg-label{fill:var(--accent)}\n.tw-revision-arrow{fill:none;stroke:var(--accent);stroke-width:2}.tw-revision-before{stroke:var(--danger);stroke-width:1;stroke-dasharray:3 4;fill:none;opacity:.65}.tw-revision-after{stroke:var(--accent);stroke-width:1;fill:var(--accent-soft)}.tw-redline{stroke:var(--danger);stroke-width:1.5;stroke-dasharray:206;animation:tw-redline-draw .6s ease-out both}\n.tw-paper-layer{fill:var(--paper);stroke:var(--line)}.tw-paper-layer:last-of-type{fill:var(--panel);stroke:var(--accent)}.tw-compose-line{stroke:var(--accent);stroke-width:1;stroke-dasharray:180;animation:tw-redline-draw .7s ease-out both;animation-delay:calc(var(--order)*80ms)}\n.tw-source-module{fill:var(--accent-soft);stroke:var(--line)}\n.tw-film-detail{position:relative;padding:0 1px}.tw-film-detail:before{content:'SOURCE / 原文片段';display:block;color:var(--muted);font-size:8px;letter-spacing:1px;padding:0 0 7px;border-bottom:1px solid var(--line);margin-bottom:3px}\n.tw-film-detail .tw-orbit-art,.tw-film-detail .tw-atlas-center,.tw-film-detail .tw-scene-command,.tw-film-detail .tw-branch-root,.tw-film-detail .tw-branch-lines,.tw-film-detail .tw-search-upper,.tw-film-detail .tw-exec-bus,.tw-film-detail .tw-revise-banner,.tw-film-detail .tw-check-heading,.tw-film-detail .tw-math-title,.tw-film-detail .tw-math-watermark{display:none}\n.tw-film-detail .tw-atlas{padding-top:0}.tw-film-detail .tw-atlas-grid{gap:8px}.tw-film-detail .tw-atlas-grid .tw-scene-tile:nth-child(even){border-top:0}\n.tw-film-detail .tw-branch-card{min-height:0;border:1px solid var(--line);padding:13px 15px}.tw-film-detail .tw-branch-symbol{font-size:15px;position:absolute;right:11px;top:12px;margin:0}.tw-film-detail .tw-branch-card h3{font-size:13px}.tw-film-detail .tw-branch-card p{min-height:0;font-size:12px}.tw-film-detail .tw-branch-card small{margin-top:10px;font-size:8px}\n.tw-film-detail .tw-plan-step{padding-bottom:13px;grid-template-columns:28px 1fr}.tw-film-detail .tw-step-number{font-size:16px}.tw-film-detail .tw-plan-step .tw-scene-tile{padding-top:5px}.tw-film-detail .tw-step-connector{display:none}\n.tw-film-detail .tw-document-tile{gap:10px;padding:8px 10px}.tw-film-detail .tw-document-icon{font-size:18px}\n.tw-film-detail .tw-code-board{border-color:var(--line);box-shadow:none;margin-top:10px}.tw-film-detail .tw-code-lines code{font-size:12px}.tw-film-detail .tw-code-bar{padding:7px 13px}\n.tw-film-detail .tw-math-board{border:0;padding:0;background:none}.tw-film-detail .tw-equation{min-height:0;margin:10px 0;padding:8px 14px}.tw-film-detail .tw-equation pre{font-size:16px;margin:7px 0}\n.tw-film-detail .tw-exec-card{padding:10px 12px}.tw-film-detail .tw-exec-meter{margin:12px 0}.tw-film-detail .tw-exec-meter i{height:7px}\n.tw-film-detail .tw-check-row{padding:11px 7px}.tw-film-detail .tw-check-box{width:18px;height:18px;line-height:16px;font-size:12px}\n.tw-film-detail .tw-revise-columns{padding-top:10px}.tw-film-detail .tw-answer-stamp{margin-top:12px}.tw-film-detail .tw-answer-page{padding:16px}.tw-film-detail .tw-answer-page p{font-size:13px}\n.tw-film-detail .tw-scene-footnote{font-size:8px;margin-top:9px;line-height:1.6}\n.tw-film-shot[data-shot=code] .tw-film-figure svg{max-height:180px}.tw-film-shot[data-shot=math] .tw-film-figure{background:linear-gradient(var(--panel),var(--paper))}\n.tw-film-shot[data-shot=execute] .tw-film-figure{border-color:var(--accent)}.tw-film-shot[data-shot=revise] .tw-figure-register{border-bottom-color:var(--danger)}\n.tw-film-shot[data-shot=summary] .tw-film-figure{background:var(--paper)}\n.tw-theme-paper{--secondary:#708baa}.tw-theme-night{--secondary:#c1a579}.tw-theme-amber{--secondary:#839dff}.tw-theme-phosphor{--secondary:#99b5fa}.tw-theme-violet{--secondary:#c8b180}.tw-theme-blueprint{--secondary:#edd2aa}\n@keyframes tw-settings-in{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}\n@keyframes tw-film-item{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}\n@keyframes tw-diagram-draw{from{stroke-dashoffset:1;stroke-opacity:.2}to{stroke-dashoffset:0;stroke-opacity:.65}}\n@keyframes tw-redline-draw{from{stroke-dashoffset:206}to{stroke-dashoffset:0}}\n@keyframes tw-caption-breathe{50%{opacity:.5}}\n@keyframes tw-river-float{50%{transform:translate(3px,-3px);opacity:.5}}\n@keyframes tw-bus-travel{from{transform:translateX(0);opacity:0}15%{opacity:1}85%{opacity:1}to{transform:translateX(560px);opacity:0}}\n.tw-window[data-motion=calm] :is(.tw-river-glyph,.tw-focus-cell,.tw-orbital-scan,.tw-bus-dot,.tw-caption-cell){animation:none}\n.tw-stacked .tw-titlebar{padding:8px 14px;min-height:36px}.tw-stacked .tw-director-bar{padding:5px 14px}.tw-stacked .tw-scene-heading{padding:4px 14px 8px}.tw-stacked .tw-scene-heading h2{font-size:15px}.tw-stacked .tw-film-figure svg{max-height:120px}.tw-stacked .tw-figure-register{padding:4px 9px;font-size:7px}.tw-stacked .tw-film-figure figcaption{font-size:10px;padding:6px 9px;min-height:0}.tw-stacked .tw-scene-viewport{padding:0 13px 10px}.tw-stacked .tw-scene-tape{padding:4px 13px}.tw-stacked .tw-controls{padding:5px 13px}.tw-stacked .tw-flight-field{max-height:120px;top:20px}.tw-stacked .tw-source{inset:39px 8px 58px}\n@container thought (max-width:530px){.tw-titlebar small{display:none}.tw-map-toolbar>span:first-child{display:none}.tw-map-toolbar{justify-content:space-between}.tw-map-toolbar label{font-size:10px}.tw-branch-grid,.tw-revise-columns{grid-template-columns:1fr}.tw-scene-heading h2{font-size:19px}.tw-scene-reason{max-width:26%;font-size:7px}.tw-ribbon{font-size:8px}.tw-scene-viewport{padding-left:13px;padding-right:13px}.tw-film-figure figcaption{font-size:10px}.tw-atlas-grid{grid-template-columns:1fr}.tw-figure-register{font-size:7px}.tw-titlebar strong{font-size:11px}.tw-answer-evidence{grid-template-columns:1fr}.tw-film-figure .tw-svg-meta{font-size:10px}}\n.tw-no-motion *,.tw-no-motion *:before,.tw-no-motion *:after{animation:none!important;transition:none!important}\n@media(prefers-reduced-motion:reduce){.tw-window *,.tw-window *:before,.tw-window *:after{animation:none!important;transition:none!important}}\n\n/* DSH 0.1.5: theme the native surfaces as well as the plugin. DSW-specific\n   tokens are separate from its aliases; leaving them inherited mixes dark\n   bubbles/inputs with light text tokens. Do not toggle the host preference. */\n.tw-native-paper{--paper:#f2efe5;--panel:#f8f5ed;--ink:#36363f;--muted:#737078;--line:#cecbd1;--accent:#7972ae;--accent-soft:#e6e2f0;--good:#688b7d;--danger:#b46966;color-scheme:light}\n.tw-native-night{--paper:#101724;--panel:#151f32;--ink:#c8d6ea;--muted:#a1b1cc;--line:#344252;--accent:#7894ff;--accent-soft:#233152;--good:#9ebad3;--danger:#ff8b83;color-scheme:dark}\nbody.tw-host-theme.tw-host-theme,.tw-native-shell{\n  --dsw-font-family:Consolas,'SFMono-Regular','Microsoft YaHei',monospace;\n  --dsw-alias-bg-base:var(--paper);--dsw-alias-bg-layer-1:var(--panel);--dsw-alias-bg-layer-2:var(--panel);--dsw-alias-bg-layer-3:var(--panel);--dsw-alias-bg-module-platform:var(--panel);\n  --dsw-alias-label-primary:var(--ink);--dsw-alias-label-primary-bluish:var(--ink);--dsw-alias-label-primary-dimmed:var(--ink);--dsw-alias-label-secondary:var(--muted);--dsw-alias-label-tertiary:var(--muted);--dsw-alias-label-caption:var(--muted);--dsw-alias-label-dimmed:var(--muted);--dsw-alias-label-primary-inverted:var(--paper);--dsw-alias-label-primary-foreground:var(--paper);\n  --dsw-alias-border-l1:var(--line);--dsw-alias-border-l2:var(--line);--dsw-alias-border-l3:var(--line);--dsw-alias-border-l4:var(--line);\n  --dsw-alias-brand-primary:var(--accent);--dsw-alias-state-business-primary:var(--accent);--dsw-alias-link:var(--accent);\n  --dsw-alias-button-primary-fill:var(--accent);--dsw-alias-button-primary-hover:var(--accent);--dsw-alias-button-primary-disabled-fill:var(--line);--dsw-alias-button-info-fill:var(--accent);--dsw-alias-button-info-hover:var(--accent);\n  --dsw-alias-button-elevated-fill:var(--panel);--dsw-alias-button-floating-fill:var(--panel);--dsw-alias-button-floating-hover:var(--accent-soft);--dsw-alias-button-ghost-active-hover:var(--accent-soft);--dsw-alias-button-primary-dimmed:var(--line);--dsw-alias-button-tool-bar-fill-invisible:transparent;--dsw-alias-interactive-bg-hover-accent:var(--accent-soft);\n  --dsw-alias-button-contrast-fill:var(--ink);--dsw-alias-button-tool-bar-fill:var(--panel);--dsw-alias-button-tool-bar-hover:var(--accent-soft);--dsw-alias-button-ghost-active-fill:var(--accent-soft);--dsw-alias-button-ghost-active-border:var(--accent);\n  --dsw-alias-interactive-bg-hover:var(--accent-soft);--dsw-alias-interactive-bg-hover-solid:var(--accent-soft);--dsw-alias-interactive-bg-active:var(--accent-soft);\n  --dsw-alias-markdown-inline-code:var(--accent-soft);--dsw-alias-markdown-code-block:var(--panel);--dsw-alias-markdown-code-block-banner:var(--accent-soft);--dsw-alias-markdown-table-head:var(--accent-soft);--dsw-alias-markdown-tag:var(--accent-soft);\n  --dsw-alias-scrollbar-bg-l1:var(--line);--dsw-alias-scrollbar-bg-l2:var(--line);--dsw-alias-scrollbar-hover-l1:var(--muted);--dsw-alias-scrollbar-hover-l2:var(--muted);\n  --dsw-specific-bubble:var(--accent-soft);--dsw-specific-bubble-highlight:var(--line);--dsw-specific-input-major:var(--panel);--dsw-specific-login-input:var(--panel);--dsw-specific-menu:var(--panel);--dsw-specific-selector:var(--accent-soft);--dsw-specific-tip:var(--accent-soft);\n  --dsw-specific-sidebar-fill:var(--paper);--dsw-specific-sidebar-nav-item-active-accent:var(--accent-soft);--dsw-specific-sidebar-nav-item-active:var(--accent-soft);--dsw-specific-sidebar-nav-item-hover:var(--panel);\n  --dsw-hovercard-bg:var(--panel);--dsw-elevation-stroke-color:var(--line);--dsw-alias-tooltip-bg:var(--ink);\n  --dsw-linear-gradient-think:linear-gradient(180deg,var(--paper),transparent);--dsw-linear-think-select:linear-gradient(180deg,var(--accent-soft),transparent);\n  --shiki-token-constant:var(--accent);--shiki-token-string:var(--good);--shiki-token-comment:var(--muted);--shiki-token-keyword:var(--accent);--shiki-token-parameter:var(--ink);--shiki-token-function:var(--accent);--shiki-token-string-expression:var(--good);--shiki-token-punctuation:var(--ink);--shiki-token-link:var(--accent);\n}\nbody.tw-host-theme.tw-native-paper,.tw-native-shell.tw-native-paper{--shiki-token-string:#3c725c;--shiki-token-string-expression:#3c725c;--shiki-token-keyword:#74609e;--shiki-token-function:#74609e;--shiki-token-constant:#586e9a}\nbody.tw-host-theme,.tw-native-shell{background:var(--paper)!important;color:var(--ink)!important}\n.tw-native-shell{font-family:var(--dsw-font-family);--dsh-content-font-size:14px;--dsh-content-font-size-secondary:12px}\n.tw-native-shell [data-composer-card]{background:var(--panel)!important;color:var(--ink);border-radius:2px!important;box-shadow:3px 3px 0 color-mix(in srgb,var(--accent) 12%,transparent)!important}\n.tw-native-shell [data-composer-card] :is(textarea,[contenteditable=true]){color:var(--ink);caret-color:var(--accent)}\n.tw-native-shell [data-composer-card] textarea::placeholder{color:var(--muted);opacity:1}\n.tw-native-shell [data-conversation-scroll] [class*=\"_bubble\"]{border-radius:2px;border:1px solid var(--line);padding:12px 16px}\n.tw-native-shell [data-conversation-scroll] [class*=\"_fileCard\"]{border-radius:3px}\n.tw-native-shell [data-conversation-scroll]{scrollbar-color:var(--line) transparent}\n.tw-host-theme [data-slot=sidebar]{font-family:var(--dsw-font-family)}\n.tw-host-theme [data-slot=sidebar] button{border-radius:3px}\n.tw-host-theme [data-slot=sidebar] [aria-current]{box-shadow:inset 2px 0 var(--accent)}\n.tw-native-shell>.tw-mount{border-color:var(--line);overflow-anchor:none}\n.tw-native-shell>.tw-divider:before{border-color:var(--accent);background:var(--accent-soft)}\n.tw-native-shell .tw-launch[aria-pressed=true]{color:var(--accent);background:var(--accent-soft);border-color:var(--accent)}\n/* Keep the full composition in view. Streaming a long answer must not anchor\n   the scene scroller to the source text and push the pixel heading off-screen. */\n.tw-scene-viewport{overflow:hidden;overflow-anchor:none;container:scene / size}\n.tw-continuity-stage,.tw-shot-in,.tw-film-shot{height:100%;min-height:0}\n.tw-film-shot{display:flex;flex-direction:column}\n.tw-film-figure{flex:none;margin-bottom:14px}\n.tw-film-figure svg{height:clamp(90px,45cqh,330px);max-height:none;aspect-ratio:auto}\n.tw-film-shot[data-shot=code] .tw-film-figure svg{height:clamp(80px,32cqh,180px);max-height:none}\n.tw-film-figure figcaption{max-height:66px;overflow:hidden}\n.tw-caption-text{min-width:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}\n.tw-film-detail{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;overflow-anchor:none;scrollbar-width:thin;scrollbar-color:var(--line) transparent;padding-right:5px}\n.tw-film-detail:before{position:sticky;top:0;background:var(--paper);z-index:3;padding-top:2px}\n.tw-stacked .tw-film-figure{margin-bottom:6px}\n.tw-stacked .tw-film-figure svg,.tw-stacked .tw-film-shot[data-shot=code] .tw-film-figure svg{height:clamp(32px,35cqh,90px);max-height:none}\n.tw-stacked .tw-film-figure figcaption{max-height:28px;min-height:0;white-space:nowrap;text-overflow:ellipsis;display:block}\n.tw-stacked .tw-caption-cell{display:none}\n\n/* Fixed chrome + persistent source objects: the reference PV's layered layout,\n   driven here by observed events and a reading clock rather than song time. */\n.tw-theme-obsidian,.tw-native-obsidian{--paper:#070b14;--panel:#0c1320;--ink:#d5dfed;--muted:#8e9bb0;--line:#3d4b62;--accent:#98aafa;--accent-soft:#18243e;--good:#96c4b4;--danger:#f07470;--grid:#91a6c715;--shadow:#0006;--secondary:#d9b878;color-scheme:dark}\n.tw-layout-process .tw-ribbon,.tw-layout-process .tw-note,.tw-layout-process .tw-summary{display:none!important}\n.tw-layout-process .tw-titlebar{border-bottom-color:var(--line);padding:12px 18px;min-height:44px}\n.tw-layout-process .tw-titlebar strong{letter-spacing:1.8px;font-size:12px}\n.tw-layout-process .tw-map-toolbar{border-top:0;padding:7px 18px}\n.tw-layout-process .tw-controls{padding:6px 18px}\n.tw-layout-process .tw-disclosure{margin-bottom:0}\n.tw-process{flex:1;min-height:0;display:flex;flex-direction:column;padding:0 16px;gap:13px;overflow:hidden;font-size:12px;line-height:1.6}\n.tw-process-strip{display:flex;align-items:center;gap:14px;min-height:34px;border-bottom:1px solid var(--line);flex:none;font-size:10px;color:var(--accent);letter-spacing:.8px}\n.tw-process-strip>span{white-space:nowrap;flex:none}.tw-process-strip>span:last-child{font-size:10px;margin-left:auto;color:var(--muted)}.tw-process-strip svg{flex:1;min-width:32px;width:120px;height:22px;opacity:.7}\n.tw-process-strip .tw-process-error{color:var(--danger)!important}\n.tw-process-deck{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 104px;gap:14px}\n.tw-inset-frame{position:relative;border:1px solid var(--line);min-width:0}\n.tw-inset-frame:before{content:'';position:absolute;inset:-1px;pointer-events:none;z-index:4;background:linear-gradient(var(--ink),var(--ink)) left top/9px 2px no-repeat,linear-gradient(var(--ink),var(--ink)) left top/2px 9px no-repeat,linear-gradient(var(--ink),var(--ink)) right top/9px 2px no-repeat,linear-gradient(var(--ink),var(--ink)) right top/2px 9px no-repeat,linear-gradient(var(--ink),var(--ink)) left bottom/9px 2px no-repeat,linear-gradient(var(--ink),var(--ink)) right bottom/9px 2px no-repeat}\n.tw-frame-caption{display:flex;align-items:center;justify-content:space-between;gap:8px;position:relative;font-size:10px;line-height:1.4;flex:none;margin:-8px 11px 0;min-height:16px;color:var(--ink)}\n.tw-frame-caption>span,.tw-frame-caption>small{background:var(--paper);padding:0 5px}.tw-frame-caption small{font-size:8px;color:var(--muted)}\n.tw-process-main{display:flex;flex-direction:column;min-height:0}\n.tw-process-topic{margin:14px 16px 10px;padding:0 0 10px;border-bottom:1px dotted var(--line);flex:none}\n.tw-process-topic small{font-size:8px;color:var(--muted);letter-spacing:1.1px}.tw-process-topic p{font-size:12px;line-height:1.7;margin:4px 0 0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}\n.tw-process-focusline{display:flex;justify-content:space-between;gap:12px;font-size:10px;letter-spacing:.8px;color:var(--accent);margin:0 16px 12px;flex:none}\n.tw-process-focusline>span:last-child{color:var(--muted);font-size:9px;white-space:nowrap}\n.tw-process-board{flex:1;min-height:0;overflow:auto;padding:1px 16px 12px;scrollbar-width:thin;scrollbar-color:var(--line) transparent;overscroll-behavior:contain;overflow-anchor:none}\n.tw-process-cells{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-content:start;min-height:100%}\n.tw-window .tw-register-cell{position:relative;display:flex;flex-direction:column;min-width:0;min-height:116px;text-align:left;padding:12px 12px 9px;background:var(--panel);border:1px solid var(--line);color:var(--ink);cursor:pointer;transition:background-color 1.2s,border-color 1.2s,box-shadow 1.2s}\n.tw-window .tw-register-cell:hover{background:var(--accent-soft)}\n.tw-window .tw-register-cell.tw-reading-cell{border-color:var(--accent);background:var(--accent-soft);box-shadow:inset 3px 0 var(--accent),0 0 14px color-mix(in srgb,var(--accent) 6%,transparent)}\n.tw-register-cell:after{content:'';position:absolute;width:5px;height:5px;right:7px;bottom:7px;border:1px solid var(--line)}\n.tw-reading-cell:after{background:var(--accent);border-color:var(--accent)}\n.tw-cell-head{display:flex;align-items:center;gap:8px;color:var(--accent);font-size:9px;letter-spacing:.6px}.tw-cell-head>b{font-size:17px;line-height:1;font-weight:400}.tw-cell-head small{font-size:8px;color:var(--muted);margin-left:auto;white-space:nowrap}\n.tw-register-cell p{font-family:Consolas,'Microsoft YaHei',monospace;font-size:12px;line-height:1.85;margin:11px 0 13px;white-space:pre-wrap;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}\n.tw-cell-tail{margin-top:auto;display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:8px;color:var(--muted);padding-right:7px}.tw-cell-tail>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tw-cell-tail>span:last-child{white-space:nowrap}\n.tw-register-cell[data-status=error] .tw-cell-head{color:var(--danger)}\n.tw-process-stats{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:0 16px;padding:10px 0;border-top:1px solid var(--line);font-size:9px;color:var(--muted);flex:none}.tw-process-stats b{font-size:18px;color:var(--ink);font-weight:400}.tw-process-stats small{font-size:8px;white-space:nowrap}\n.tw-sequence-map{flex:none;margin:0 16px;padding:9px 0 3px;border-top:1px dotted var(--line);color:var(--muted)}\n.tw-sequence-map>div{display:flex;justify-content:space-between;gap:8px;font-size:8px;letter-spacing:.4px}.tw-sequence-map small{font-size:8px}.tw-sequence-map svg{display:block;width:100%;height:103px;overflow:visible;margin-top:3px}.tw-sequence-map text{font:8px Consolas,monospace;fill:var(--muted)}.tw-route-axis{stroke:var(--line);stroke-dasharray:1 6;stroke-width:.6}.tw-route-line{stroke:var(--accent);stroke-width:1;fill:none;opacity:.45}.tw-route-node{fill:var(--paper);stroke:var(--muted);stroke-width:1}.tw-route-node[data-status=error]{stroke:var(--danger)}.tw-route-marker{fill:var(--accent);stroke:var(--paper);stroke-width:1;pointer-events:none}.tw-sequence-map g[role=button]{cursor:pointer;outline:none}.tw-sequence-map g[role=button]:focus-visible .tw-route-node{stroke:var(--ink);stroke-width:3}\n.tw-ops{display:flex;flex-direction:column;min-height:0;padding:0 4px 7px}\n.tw-ops>.tw-frame-caption{display:table;background:var(--paper);padding:0 5px;color:var(--accent);margin-left:3px;margin-bottom:9px}\n.tw-ops nav{position:relative;flex:1;min-height:0;overflow:auto;scrollbar-width:none;overscroll-behavior:contain;overflow-anchor:none}\n.tw-window .tw-ops button{display:grid;grid-template-columns:19px 1fr;width:100%;text-align:left;padding:7px 5px;border:0;border-bottom:1px solid color-mix(in srgb,var(--line) 38%,transparent);background:transparent;font-size:9px;color:var(--muted)}\n.tw-ops button>b{font-weight:400;letter-spacing:.4px}.tw-ops button>small{font-size:8px;color:inherit}.tw-ops button>span{grid-column:2;font-size:8px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.tw-window .tw-ops button[aria-current=step]{background:var(--accent);color:var(--paper)}\n.tw-process-source{flex:none;height:116px;display:flex;flex-direction:column;margin-top:2px}\n.tw-process-source .tw-frame-caption>button{font-size:9px;padding:0 5px;line-height:1.6;background:var(--paper);border:0;color:var(--accent)}\n.tw-process-source-text{margin:10px 13px 9px;overflow:auto;min-height:0;white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.9;scrollbar-width:thin;scrollbar-color:var(--line) transparent;overscroll-behavior:contain}.tw-process-source-text>span{color:var(--accent);font-weight:bold}\n.tw-reading-controls{flex:none;display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding-bottom:9px;font-size:9px;color:var(--muted)}\n.tw-reading-controls button,.tw-reading-controls select{font-size:10px;padding:3px 7px;white-space:nowrap}.tw-reading-controls label{margin-left:5px}.tw-queue-status{margin-left:auto;font-size:9px}\n.tw-process-note{margin:0 0 7px;font-size:9px;color:var(--muted);flex:none}\n.tw-process-idle{display:grid;place-content:center;text-align:center;min-height:100%;color:var(--muted);font-size:12px}.tw-process-idle b{font-weight:400;font-size:48px;letter-spacing:10px;color:var(--accent)}\n.tw-process[data-form=pipeline] .tw-process-cells,.tw-process[data-form=checklist] .tw-process-cells,.tw-process[data-form=sources] .tw-process-cells{grid-template-columns:1fr;gap:11px;padding-left:11px}\n.tw-process[data-form=pipeline] .tw-register-cell,.tw-process[data-form=checklist] .tw-register-cell,.tw-process[data-form=sources] .tw-register-cell{min-height:76px;padding:10px 13px}\n.tw-process[data-form=pipeline] .tw-register-cell:not(:last-child):before{content:'';position:absolute;left:-10px;top:24px;width:9px;height:calc(100% + 12px);border-left:1px solid var(--accent);border-bottom:1px solid var(--accent);opacity:.45}\n.tw-process[data-form=pipeline] .tw-register-cell p,.tw-process[data-form=checklist] .tw-register-cell p,.tw-process[data-form=sources] .tw-register-cell p{margin:8px 0; -webkit-line-clamp:3}\n.tw-process[data-form=branches] .tw-register-cell{min-height:160px;border-top:2px solid var(--accent)}\n.tw-process[data-form=branches] .tw-register-cell p{-webkit-line-clamp:8}\n.tw-process[data-form=revision] .tw-register-cell[data-status=error]{border-color:var(--danger)}\n.tw-process-code{border-left:2px solid var(--accent);padding:12px 14px;background:var(--panel);min-height:100%}.tw-process-code>span{font-size:9px;letter-spacing:1px;color:var(--muted)}\n.tw-process-code pre{font:13px/1.9 Consolas,'Microsoft YaHei',monospace;white-space:pre-wrap;overflow-wrap:anywhere;margin:20px 0;color:var(--ink)}\n.tw-process[data-form=formula] .tw-process-code pre{font-size:19px;line-height:2.3}\n.tw-process-code button,.tw-io-panels button{font-size:9px;color:var(--accent);background:transparent}\n.tw-io-route{display:flex;align-items:center;gap:10px;margin:8px 0 24px;font-size:8px;color:var(--muted)}.tw-io-route b{font-size:12px;color:var(--accent)}.tw-io-route i{flex:1;border-top:1px solid var(--line);min-width:8px}\n.tw-io-panels{display:grid;grid-template-columns:1fr 1fr;gap:13px}.tw-io-panels>section{background:var(--panel);border:1px solid var(--line);padding:13px;min-width:0}.tw-io-panels header{font-size:10px;border-bottom:1px dotted var(--line);padding-bottom:11px;color:var(--accent)}.tw-io-panels pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.8 Consolas,'Microsoft YaHei',monospace;max-height:220px;overflow:auto;margin:13px 0}.tw-waiting-result{font-size:11px;color:var(--muted)}\n.tw-process[data-reading=playing] .tw-reading-cell:after{animation:tw-reading-light 6s ease-in-out infinite}\n@keyframes tw-reading-light{50%{opacity:.5;box-shadow:0 0 7px var(--accent)}}\n@container thought (max-width:620px){.tw-process{padding:0 10px;gap:11px}.tw-process-deck{grid-template-columns:minmax(0,1fr) 79px;gap:9px}.tw-process-topic{margin:11px 10px 8px}.tw-process-board{padding-left:10px;padding-right:10px}.tw-process-cells{gap:8px}.tw-register-cell p{font-size:11px}.tw-cell-head{gap:5px;font-size:8px}.tw-cell-head small{display:none}.tw-process-stats{margin:0 10px;gap:8px}.tw-process-stats small{display:none}.tw-process-focusline{margin-left:10px;margin-right:10px}.tw-frame-caption small{display:none}.tw-process-strip{font-size:8px;gap:8px}.tw-ops button>span{font-size:7px}.tw-process-source{height:103px}.tw-process-source-text{font-size:12px}.tw-io-panels{grid-template-columns:1fr}.tw-process-stats b{font-size:15px}.tw-queue-status{display:none}}\n@container thought (max-width:410px){.tw-process-cells{grid-template-columns:1fr}.tw-process-strip>span:last-child{font-size:8px}.tw-process-strip svg{display:none}.tw-reading-controls{gap:4px}.tw-reading-controls label{margin-left:0}.tw-reading-controls button,.tw-reading-controls select{font-size:9px;padding:2px 5px}}\n.tw-stacked .tw-process{gap:8px}.tw-stacked .tw-process-strip{min-height:22px}.tw-stacked .tw-process-topic{display:none}.tw-stacked .tw-process-source{height:59px}.tw-stacked .tw-process-source-text{margin:5px 9px;font-size:11px;line-height:1.6}.tw-stacked .tw-process-focusline{margin:5px 9px;font-size:9px}.tw-stacked .tw-process-stats{display:none}.tw-stacked .tw-register-cell{min-height:85px}.tw-stacked .tw-register-cell p{margin:5px 0;-webkit-line-clamp:2}.tw-stacked .tw-reading-controls{padding-bottom:3px}.tw-stacked .tw-process-board{padding:1px 8px 7px}.tw-stacked .tw-process-cells{grid-template-columns:1fr 1fr}.tw-stacked .tw-process-note{display:none}\n.tw-window[data-motion=calm] .tw-reading-cell:after,.tw-no-motion .tw-reading-cell:after{animation:none}\n.tw-no-motion .tw-register-cell{transition:none!important}\n.tw-stacked .tw-sequence-map{display:none}\n@media(prefers-reduced-motion:reduce){.tw-process *{animation:none!important;transition:none!important}}\n\n.tw-layout-workbench .tw-ribbon,.tw-layout-workbench .tw-summary,.tw-layout-workbench .tw-note{display:none!important}\n.tw-process-host{display:contents}.tw-process-host[hidden]{display:none}\n.tw-work-summary{display:flex;gap:12px;align-items:center;margin:8px 16px 0!important;padding:8px 10px!important;color:var(--muted)!important;font-size:10px!important;border-color:var(--line)!important;background:var(--paper)!important;text-align:left;flex:none}\n.tw-work-summary>span:first-child{color:var(--accent);font-size:9px;letter-spacing:1px}.tw-work-summary b{font-weight:400;color:var(--ink)}.tw-work-summary>span:last-child{margin-left:auto;color:var(--accent)}\n.tw-workbench{display:flex;flex-direction:column;flex:1;min-height:0;padding:18px 16px 8px;gap:18px;overflow:hidden}\n.tw-work-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none}.tw-work-heading small{font-size:9px;color:var(--accent);letter-spacing:1.3px}.tw-work-heading h2{font-size:19px;font-weight:400;margin:4px 0 0}.tw-work-heading>span{font-size:10px;color:var(--muted)}\n.tw-build-route{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--line);flex:none;background:var(--panel)}.tw-build-route>div{display:flex;flex-direction:column;gap:5px;flex:1}.tw-build-route b{font-size:23px;color:var(--accent);font-weight:400}.tw-build-route span{font-size:8px;color:var(--muted)}.tw-build-route>i{color:var(--line);font-style:normal;font-size:23px}\n.tw-work-columns{display:grid;grid-template-columns:minmax(190px,.85fr) minmax(0,1.4fr);gap:14px;flex:1;min-height:0}\n.tw-work-files,.tw-work-runs{display:flex;flex-direction:column;min-height:0}.tw-file-list{overflow:auto;min-height:0;padding:15px 10px 10px;scrollbar-width:thin;scrollbar-color:var(--line) transparent;overscroll-behavior:contain}\n.tw-file-card{padding:12px 10px;border:1px solid var(--line);background:var(--panel);margin-bottom:12px;overflow-wrap:anywhere}.tw-file-card header{display:flex;gap:10px;align-items:center}.tw-file-kind{display:grid;place-items:center;min-width:36px;height:40px;border:1px solid var(--accent);box-shadow:3px 3px var(--accent-soft);font-size:9px;color:var(--accent)}.tw-file-card header>div{display:flex;flex-direction:column;gap:6px;min-width:0}.tw-file-card strong{font-size:13px;font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tw-file-card small{font-size:9px;color:var(--good)}.tw-file-card>code{display:block;font:9px/1.7 Consolas,monospace;color:var(--muted);margin:13px 0}.tw-file-card p{font-size:11px;line-height:1.8}.tw-file-facts{display:flex;gap:8px;flex-wrap:wrap;font-size:8px;color:var(--muted);border-top:1px dotted var(--line);padding-top:8px}.tw-file-card footer{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}.tw-file-card footer button{font-size:9px;padding:4px 7px}.tw-file-card footer button:first-child{border-color:var(--accent);color:var(--accent)}\n.tw-run-list{flex:none;max-height:35%;min-height:0;overflow:auto;padding:12px 10px 5px;scrollbar-width:thin;scrollbar-color:var(--line) transparent}.tw-window .tw-run-list button{display:grid;grid-template-columns:20px minmax(0,1fr);width:100%;text-align:left;padding:9px 8px;margin-bottom:5px;background:transparent;border-color:var(--line);font-size:10px;gap:4px 7px}.tw-run-list button>span{white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.tw-run-list button>b{grid-column:2;font-size:9px;font-weight:400;color:var(--muted)}.tw-window .tw-run-list button[aria-pressed=true]{background:var(--accent-soft);border-color:var(--accent)}\n.tw-run-detail{flex:1;min-height:0;display:flex;flex-direction:column;gap:9px;padding:10px 14px 12px}.tw-run-title{display:flex;gap:8px;align-items:center;font-size:9px;color:var(--muted);flex:none}.tw-run-title b{font-weight:400;color:var(--good)}.tw-run-title button{margin-left:auto;font-size:8px;padding:3px 5px}.tw-run-command{flex:none;max-height:95px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.8 Consolas,'Microsoft YaHei',monospace;margin:0;background:var(--panel);padding:10px;border-left:2px solid var(--accent)}.tw-run-cwd{font-size:8px!important;overflow-wrap:anywhere}.tw-stdout-title{font-size:8px;color:var(--muted);border-bottom:1px dotted var(--line);padding:5px 0;flex:none}.tw-run-output{flex:1;min-height:45px;overflow:auto;font:11px/1.9 Consolas,'Microsoft YaHei',monospace;white-space:pre-wrap;overflow-wrap:anywhere;margin:0;scrollbar-width:thin;scrollbar-color:var(--line) transparent;overscroll-behavior:contain}.tw-run-source{font-size:9px!important;align-self:flex-start;flex:none}.tw-work-empty{color:var(--muted);font-size:12px;line-height:1.9;padding:25px 16px}.tw-work-empty>b{font-size:30px;font-weight:400;color:var(--accent)}\n.tw-work-footnote,.tw-work-notice{font-size:9px;color:var(--muted);margin:0;flex:none}.tw-work-notice{color:var(--danger)}\n.tw-workbench [data-status=error] :is(.tw-run-title b,.tw-file-card small),.tw-work-summary [data-status=error],.tw-run-list button[data-status=error]>b,.tw-build-route [data-status=error] b{color:var(--danger)}.tw-file-card[data-status=error]{border-color:var(--danger)}\n.tw-preview-summary{display:none;flex-direction:column;gap:9px;min-width:0;padding:10px 15px;font-size:11px}.tw-preview-summary>div:first-child{display:flex;align-items:center;gap:9px}.tw-preview-summary strong{font-size:11px;letter-spacing:.6px;font-weight:400}.tw-preview-summary small{font-size:9px;color:var(--muted)}.tw-preview-summary button{font-size:10px;white-space:nowrap;padding:3px 7px}.tw-dock-mark{font-size:17px;color:var(--accent)}.tw-preview-now,.tw-preview-last{display:flex;align-items:center;gap:12px;min-width:0}.tw-preview-now>span,.tw-preview-last>span:first-child{font-size:9px;color:var(--accent);min-width:38px}.tw-preview-now strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tw-preview-now>small{margin-left:auto;white-space:nowrap}.tw-preview-last>span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:10px}.tw-preview-last[data-status=error]>span:last-child{color:var(--danger)}\n.tw-native-shell.tw-preview-open{padding-right:0!important}.tw-native-shell.tw-preview-open>.tw-divider{display:none}.tw-native-shell.tw-preview-open>.tw-mount{position:relative!important;inset:auto!important;width:100%!important;order:5;flex:none;height:48%;border-top:1px solid var(--line);border-left:0}\n.tw-native-shell.tw-preview-folded>.tw-mount{height:118px;min-height:118px}\n.tw-preview-folded .tw-window>*{display:none!important}.tw-preview-folded .tw-window>.tw-preview-summary{display:flex!important}.tw-preview-folded .tw-window{background:var(--paper)}\n.tw-preview-open .tw-title-actions .tw-dock-fold{display:inline-flex;font-size:10px;align-self:center;padding:4px 7px;border:1px solid var(--line)}.tw-dock-fold{display:none}\n.tw-native-shell.tw-preview-open>.tw-mount .tw-work-heading{display:none}.tw-native-shell.tw-preview-open>.tw-mount .tw-build-route{padding:6px 10px}.tw-native-shell.tw-preview-open>.tw-mount .tw-build-route b{font-size:15px}.tw-native-shell.tw-preview-open>.tw-mount .tw-workbench{gap:12px;padding-top:10px}.tw-native-shell.tw-preview-open>.tw-mount .tw-work-columns{grid-template-columns:minmax(170px,.7fr) minmax(0,1.3fr)}\n@container thought (max-width:650px){.tw-work-columns{grid-template-columns:1fr;overflow:auto;display:flex;flex-direction:column;padding-top:3px}.tw-work-files{max-height:42%;flex:none}.tw-work-runs{flex:1;min-height:230px}.tw-file-list{display:flex;gap:8px}.tw-file-card{min-width:185px;max-width:240px;flex:1;margin-bottom:0}.tw-workbench{gap:13px;padding:12px 10px 8px}.tw-work-heading h2{font-size:16px}.tw-work-heading>span{display:none}.tw-build-route{gap:6px;padding:8px}.tw-build-route span{font-size:7px}.tw-work-summary{margin:6px 10px 0!important;font-size:9px!important;gap:8px}.tw-work-summary>span:nth-child(3){display:none}.tw-preview-summary{padding:9px 10px}.tw-preview-summary>div:first-child>small{display:none}.tw-preview-summary>div:first-child{gap:6px}.tw-preview-summary button{font-size:9px}.tw-native-shell.tw-preview-open .tw-work-columns{display:flex}.tw-native-shell.tw-preview-open .tw-work-files{max-height:40%}}\n.tw-stacked .tw-workbench{gap:10px;padding-top:10px}.tw-stacked .tw-work-heading{display:none}.tw-stacked .tw-build-route{padding:6px 9px}.tw-stacked .tw-build-route b{font-size:14px}.tw-stacked .tw-work-footnote{display:none}\n@media(prefers-reduced-motion:reduce){.tw-workbench *{animation:none!important;transition:none!important}}\n@container thought (max-width:650px){.tw-map-toolbar>span:first-child{display:none}.tw-map-toolbar{gap:8px;padding-left:10px;padding-right:10px}.tw-view-switch button{font-size:9px;padding:2px 5px}}\n\n/* 0.7 stage: one terminal screen. In the full shell the mount covers the whole\n   conversation root; the native chat shows through the framed \"dsh · web\" hole\n   (pointer-events pass through), the rest is the stage. Row/column sizes here\n   and the root padding below must agree. */\n.tw-native-shell.tw-stage-shell{padding:112px calc(var(--tw-panel-width) + 10px) 132px 20px!important}\n.tw-native-shell.tw-stage-shell>.tw-mount{inset:0!important;width:auto!important;height:auto!important;border:0!important;pointer-events:none;background:transparent}\n.tw-native-shell.tw-stage-shell>.tw-divider{top:40px;bottom:98px;right:calc(var(--tw-panel-width) - 10px)}\n.tw-stage-shell .tw-window.tw-layout-stage{background:transparent;pointer-events:none}\n.tw-stage-shell .tw-stage>:not(.tw-stage-chat),.tw-stage-shell .tw-layout-stage>.tw-source{pointer-events:auto}\n/* overflow:clip, not hidden: the hidden sidebar's content must never scroll the frame sideways. */\nbody.tw-stage-host [data-rightbar-collapsed=true]{grid-template-columns:0 minmax(0,1fr) 0!important;overflow:clip!important}\nbody.tw-stage-host [data-rightbar-collapsed=true]>[class*=\"_handle\"]{display:none!important}\nbody.tw-stage-host :has(>[data-slot=sidebar]){visibility:hidden;overflow:hidden;min-width:0}\n\n.tw-stage{position:relative;flex:1;min-height:0;height:100%;display:grid;grid-template-columns:minmax(0,1fr) 96px;grid-template-rows:26px minmax(0,1fr) 62px 14px;grid-template-areas:\"top top\" \"main ops\" \"out out\" \"credit credit\";gap:8px 10px;padding:6px 10px;color:var(--ink);font:11px/1.4 Consolas,'SFMono-Regular','Microsoft YaHei',monospace}\n.tw-stage-shell .tw-stage{grid-template-columns:calc(100% - var(--tw-panel-width) - 10px) minmax(0,1fr) 96px;grid-template-areas:\"top top top\" \"chat main ops\" \"out out out\" \"credit credit credit\"}\n.tw-stage-chat{grid-area:chat;display:none}\n.tw-stage-shell .tw-stage-chat{display:block}\n.tw-stage-top{grid-area:top}.tw-stage-main{grid-area:main}.tw-stage-ops{grid-area:ops}.tw-stage-out{grid-area:out}.tw-stage-credit{grid-area:credit}\n\n/* Corner-bracket frames, as in the reference terminal. */\n.tw-stage-chat,.tw-stage-main,.tw-stage-ops,.tw-stage-out{position:relative;min-width:0;min-height:0;border:1px solid color-mix(in srgb,var(--line) 70%,transparent)}\n.tw-stage-chat:before,.tw-stage-main:before,.tw-stage-ops:before,.tw-stage-out:before{content:'';position:absolute;inset:-1px;pointer-events:none;z-index:2;background:linear-gradient(var(--ink),var(--ink)) left top/9px 1.5px no-repeat,linear-gradient(var(--ink),var(--ink)) left top/1.5px 9px no-repeat,linear-gradient(var(--ink),var(--ink)) right top/9px 1.5px no-repeat,linear-gradient(var(--ink),var(--ink)) right top/1.5px 9px no-repeat,linear-gradient(var(--ink),var(--ink)) left bottom/9px 1.5px no-repeat,linear-gradient(var(--ink),var(--ink)) left bottom/1.5px 9px no-repeat,linear-gradient(var(--ink),var(--ink)) right bottom/9px 1.5px no-repeat,linear-gradient(var(--ink),var(--ink)) right bottom/1.5px 9px no-repeat}\n.tw-stage-cap{position:absolute;z-index:3;top:-8px;left:10px;right:10px;display:flex;justify-content:space-between;gap:10px;font-size:10px;line-height:14px;pointer-events:none;white-space:nowrap;overflow:hidden}\n.tw-stage-cap>span,.tw-stage-cap>small,.tw-stage-chat>.tw-stage-cap{background:var(--paper);padding:0 5px;color:var(--ink)}\n.tw-stage-chat>.tw-stage-cap{right:auto}\n.tw-stage-cap>small{font-size:9px;color:var(--muted);overflow:hidden;text-overflow:ellipsis}\n\n.tw-stage-top{display:flex;align-items:center;gap:16px;min-width:0;white-space:nowrap;overflow:hidden;font-size:11px;border-bottom:1px solid color-mix(in srgb,var(--line) 60%,transparent)}\n.tw-stage-top>b{font-weight:700;letter-spacing:.5px}\n.tw-stage-prompt{color:var(--muted)}\n.tw-stage-wave{flex:1;min-width:40px;height:18px;color:var(--ink)}\n.tw-stage-wave line{stroke:currentColor;stroke-width:1.2;vector-effect:non-scaling-stroke}.tw-stage-wave .tw-wave-axis{stroke:var(--line);stroke-dasharray:1 3}\n.tw-stage-wave[data-running=true]{color:var(--accent)}\n.tw-stage-phase{color:var(--accent);letter-spacing:.6px}\n.tw-stage-read{color:var(--muted)}\n.tw-stage-status{padding:0 6px;border:1px solid var(--line);letter-spacing:.8px;font-size:10px}\n.tw-stage-status[data-status=running],.tw-stage-status[data-status=reading]{background:var(--ink);color:var(--paper);border-color:var(--ink)}\n.tw-stage-status[data-status=running]{animation:tw-blink 1.4s steps(2,end) infinite}\n.tw-window .tw-stage-menu-button{border:0;background:transparent;padding:0 4px;font-size:16px;line-height:1;color:var(--ink)}\n.tw-window .tw-stage-menu-button[aria-expanded=true]{background:var(--accent);color:var(--paper)}\n\n.tw-stage-main{display:flex;flex-direction:column}\n.tw-stage-main>.tw-stage-cap>span{font-weight:700}\n.tw-stage-plot{position:relative;flex:1;min-height:0;margin-top:8px}\n.tw-hud{flex:none;display:flex;flex-wrap:wrap;gap:2px 14px;margin:12px 10px 0;padding:0 0 5px;border-bottom:1px dashed color-mix(in srgb,var(--line) 70%,transparent);font-size:10px;line-height:16px;font-variant-numeric:tabular-nums;color:var(--ink);min-width:0;overflow:hidden;max-height:38px}\n.tw-hud+.tw-stage-plot{margin-top:2px}\n.tw-stage-pages{flex:none;display:flex;align-items:center;gap:5px;margin:12px 10px 0;padding-bottom:6px;border-bottom:1px dashed var(--line);min-width:0}\n.tw-hud+.tw-stage-pages{margin-top:5px}\n.tw-stage-pages+.tw-stage-plot{margin-top:2px}\n.tw-window .tw-stage-pages button,.tw-window .tw-stage-pages select{font:inherit;font-size:10px;line-height:18px;border:1px solid var(--line);background:var(--paper);color:var(--ink);padding:1px 6px;border-radius:0}\n.tw-window .tw-stage-pages select{flex:1;min-width:0;width:0;text-overflow:ellipsis;color:var(--accent)}\n.tw-window .tw-stage-pages button{flex:none;white-space:nowrap}\n.tw-stage-pages small{font-size:9px;white-space:nowrap;color:var(--muted)}\n@container thought (max-width:520px){.tw-stage-pages small{display:none}.tw-stage-pages{margin-inline:5px;gap:3px}.tw-window .tw-stage-pages button{padding-inline:4px}}\n.tw-window .tw-stage-outline-btn{position:absolute;z-index:4;right:8px;bottom:6px;border:1px solid var(--accent);background:var(--paper);color:var(--accent);font:inherit;font-size:10px;line-height:16px;padding:0 7px;cursor:pointer;letter-spacing:.4px}\n.tw-window .tw-stage-answer-btn{position:absolute;z-index:4;right:118px;bottom:6px;border:1px solid var(--line);background:var(--paper);color:var(--ink);font:inherit;font-size:10px;line-height:16px;padding:0 7px;cursor:pointer;letter-spacing:.4px}\n.tw-window .tw-stage-answer-btn:hover{border-color:var(--accent);color:var(--accent)}\n.tw-window .tw-stage-outline-btn[aria-pressed=true]{background:var(--accent);color:var(--paper)}\n.tw-window .tw-stage-outline-btn:disabled{cursor:default;border-style:dashed;animation:tw-outline-wait 1.2s steps(2,end) infinite}\n@keyframes tw-outline-wait{50%{opacity:.45}}\n.tw-stage-caption[data-director=waiting]{color:var(--muted)}\n.tw-hud>span{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}\n.tw-hud small{color:var(--muted);text-transform:uppercase;letter-spacing:.6px;font-size:9px}\n.tw-hud b{font-weight:600}\n.tw-hud [data-key=turn] b{color:var(--accent)}\n.tw-hud [data-state=danger] b{color:var(--danger)}\n.tw-hud-meter{display:inline-flex;gap:1px}\n.tw-hud-meter>b{width:4px;height:8px;background:color-mix(in srgb,var(--muted) 30%,transparent)}\n.tw-hud-meter>b[data-on]{background:var(--accent)}\n.tw-hud-meter[data-danger]>b[data-on]{background:var(--danger)}\n.tw-stacked .tw-hud [data-key=ttft],.tw-stacked .tw-hud [data-key=speed]{display:none}\n.tw-stage-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:pointer}\n.tw-stage-caption{flex:none;font-size:9px;color:var(--muted);padding:2px 10px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.tw-stage-paused{position:absolute;z-index:3;bottom:24px;left:12px;font-size:10px;padding:1px 6px;background:var(--accent);color:var(--paper);letter-spacing:.6px}\n\n.tw-stage-ops nav{position:absolute;inset:12px 4px 6px;overflow:auto;scrollbar-width:none;overscroll-behavior:contain;scroll-behavior:smooth}\n.tw-stage-ops nav::-webkit-scrollbar{display:none}\n.tw-window .tw-stage-ops button{display:flex;gap:5px;width:100%;text-align:left;border:0;background:transparent;padding:1px 4px;font-size:9px;line-height:13px;letter-spacing:.4px;color:var(--muted);opacity:.55;white-space:nowrap;overflow:hidden}\n.tw-window .tw-stage-ops button>small{font-size:8px;color:inherit;opacity:.7}\n.tw-window .tw-stage-ops button[data-past]{opacity:.85;color:var(--ink)}\n.tw-window .tw-stage-ops button[data-status=error]{color:var(--danger)}\n.tw-window .tw-stage-ops button[aria-current=step]{opacity:1;background:var(--ink);color:var(--paper)}\n.tw-window .tw-stage-ops button:not([aria-current]):hover{opacity:1;background:var(--accent-soft)}\n\n.tw-window .tw-stage-tokens{position:absolute;inset:13px 10px 4px;display:flex;align-items:flex-start;gap:7px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;border:0;background:transparent;padding:0;text-align:left;white-space:nowrap;cursor:pointer}\n.tw-stage-tokens::-webkit-scrollbar{display:none}\n.tw-stage-tokens>b{font-size:16px;line-height:24px;color:var(--accent);flex:none}\n.tw-token{display:inline-flex;flex-direction:column;align-items:flex-start;gap:1px;flex:none;animation:tw-token-in .18s steps(3,end) both}\n.tw-token>span{font-size:15px;line-height:22px;padding:0 4px;background:color-mix(in srgb,var(--ink) 11%,transparent);color:var(--ink)}\n.tw-token>small{font-size:8px;line-height:10px;color:var(--muted);padding-left:4px}\n.tw-token-live>span{background:var(--ink);color:var(--paper)}\n.tw-stage-caret{flex:none;width:8px;height:18px;margin-top:2px;background:var(--ink);animation:tw-blink .9s steps(2,end) infinite}\n@keyframes tw-token-in{from{opacity:0;transform:translateY(5px)}}\n\n.tw-stage-credit{display:flex;justify-content:space-between;gap:18px;font-size:9px;line-height:14px;color:var(--muted);white-space:nowrap;overflow:hidden}\n.tw-stage-credit>span:nth-child(2){overflow:hidden;text-overflow:ellipsis}\n\n.tw-stage-menu{position:absolute;z-index:30;top:36px;right:10px;width:min(660px,calc(100% - 20px));max-height:calc(100% - 60px);overflow:auto;display:flex;flex-direction:column;gap:10px;padding:16px 14px 10px;background:var(--panel);border:1px solid var(--accent);box-shadow:4px 4px 0 var(--shadow,#0006);font-size:11px;scrollbar-width:thin}\n.tw-stage-menu-row{display:flex;align-items:center;flex-wrap:wrap;gap:6px 8px}\n.tw-stage-menu-row>span:first-child{width:36px;flex:none;color:var(--accent);font-size:10px;letter-spacing:.6px}\n.tw-stage-menu-row small{margin-left:auto}\n.tw-stage-menu .tw-view-switch{flex-wrap:wrap}\n.tw-stage-menu .tw-controls{padding:10px 0 0;border-top:1px solid var(--line);background:transparent}\n.tw-window .tw-stage-menu-close{position:absolute;top:2px;right:4px;border:0;background:transparent;font-size:14px;padding:0 4px}\n.tw-stage-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}\n\n.tw-layout-stage>.tw-source{position:absolute;z-index:25;left:auto;right:116px;bottom:104px;width:min(560px,calc(100% - 140px));max-height:46%;border:1px solid var(--accent);box-shadow:4px 4px 0 var(--shadow,#0006)}\n.tw-native-shell:not(.tw-stage-shell) .tw-layout-stage>.tw-source{left:8px;right:8px;width:auto;bottom:70px}\n\n/* Compact stage: narrow windows and the file-preview strip. */\n.tw-native-shell:not(.tw-stage-shell) .tw-stage-credit{display:none}\n.tw-native-shell:not(.tw-stage-shell) .tw-stage{grid-template-rows:24px minmax(0,1fr) 54px;grid-template-areas:\"top top\" \"main ops\" \"out out\";gap:8px;padding:6px 8px 8px}\n.tw-stacked .tw-stage{grid-template-columns:minmax(0,1fr) 72px}\n.tw-stacked .tw-stage-prompt,.tw-stacked .tw-stage-read,.tw-stacked .tw-stage-caption{display:none}\n.tw-stacked .tw-token>span{font-size:13px;line-height:18px}\n@container thought (max-width:520px){.tw-stage-prompt,.tw-stage-wave,.tw-stage-read{display:none}.tw-stage{grid-template-columns:minmax(0,1fr) 64px}}\n.tw-no-motion .tw-token,.tw-no-motion .tw-stage-caret,.tw-no-motion .tw-stage-status{animation:none!important}\n@media(prefers-reduced-motion:reduce){.tw-stage *{animation:none!important}}\n\n/* 0.8 actor layer: the director's character in front, measurements dimmed behind. */\n.tw-stage-front{pointer-events:none}\n.tw-stage-back{transition:opacity .5s}.tw-stage[data-scene=actor] .tw-stage-back{opacity:0}\n.tw-stage-caption[data-director=error]{color:var(--danger)}\n.tw-stage-caption[data-director=pending]{color:var(--accent)}\n\n/* 0.9 chat pane, after the reference: avatar header, rounded navy bubbles,\n   a rounded composer and a round/step line. DSH's own header row is hidden;\n   its tabs are driven from the stage header. */\n.tw-native-shell.tw-stage-shell>[class*=\"_header\"]{display:none!important}\n.tw-stage-shell [data-conversation-scroll]{background:#0a1122!important;font-family:\"PingFang SC\",\"Microsoft YaHei\",\"Segoe UI\",system-ui,sans-serif;--dsh-content-font-size:15px}\n.tw-stage-shell [data-conversation-scroll] [class*=\"_bubble\"]{border-radius:16px!important;border:0!important;background:#1c2950!important;color:#e8eeff!important;padding:9px 16px!important}\n.tw-stage-shell [data-composer-card]{border-radius:18px!important;background:#111a30!important;border:1px solid #24345e!important;box-shadow:0 8px 22px #0007!important}\n.tw-chat-head{position:absolute;left:12px;right:12px;top:12px;height:54px;display:flex;align-items:center;gap:12px;padding-bottom:10px;border-bottom:1px solid color-mix(in srgb,var(--line) 70%,transparent);pointer-events:none;font-family:\"PingFang SC\",\"Microsoft YaHei\",system-ui,sans-serif}\n.tw-chat-avatar{flex:none;border-radius:8px;background:radial-gradient(circle at 50% 40%,#22336a,#0d1530);image-rendering:pixelated;box-shadow:0 0 0 1px #2b3c70}\n.tw-chat-who{display:flex;flex-direction:column;gap:3px;min-width:0}\n.tw-chat-who b{font-size:16px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.tw-chat-who small{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:6px}\n.tw-chat-who small i{width:7px;height:7px;border-radius:50%;background:#e9b949;flex:none}\n.tw-chat-who small[data-phase=done] i,.tw-chat-who small[data-phase=idle] i{background:#5fd38d}\n.tw-chat-who small[data-phase=think] i,.tw-chat-who small[data-phase=answer] i{animation:tw-blink 1.2s steps(2,end) infinite}\n.tw-chat-tabs{margin-left:auto;display:flex;gap:2px;pointer-events:auto}\n.tw-window .tw-chat-tabs button{border:0;background:transparent;font-size:12px;padding:3px 8px;color:var(--muted);border-radius:6px}\n.tw-window .tw-chat-tabs button[aria-pressed=true]{background:#1c2950;color:var(--ink)}\n.tw-chat-foot{position:absolute;left:0;right:0;bottom:7px;text-align:center;font-size:12px;color:var(--muted);pointer-events:none;font-family:\"PingFang SC\",\"Microsoft YaHei\",system-ui,sans-serif}\n\n/* 0.10 opening sequence over the whole stage, then the frames grow from a point. */\n.tw-intro{position:absolute;inset:0;z-index:50;background:var(--paper);pointer-events:auto;cursor:pointer;transition:opacity .45s}\n.tw-stage-shell .tw-stage>.tw-intro{pointer-events:auto}\n.tw-intro-leaving{opacity:0}\n.tw-intro-canvas{position:absolute;inset:0;width:100%;height:100%;display:block}\n.tw-intro-skip{position:absolute;right:18px;bottom:12px;font-size:10px;color:var(--muted);letter-spacing:.6px}\n.tw-stage[data-boot=intro]>:not(.tw-intro){visibility:hidden}\n.tw-stage[data-boot=ready]>:is(.tw-stage-top,.tw-stage-chat,.tw-stage-main,.tw-stage-ops,.tw-stage-out,.tw-stage-credit){animation:tw-frame-in .7s steps(7,end) both}\n.tw-stage[data-boot=ready]>.tw-stage-chat{animation-delay:.1s}.tw-stage[data-boot=ready]>.tw-stage-main{animation-delay:.2s}.tw-stage[data-boot=ready]>.tw-stage-ops{animation-delay:.3s}.tw-stage[data-boot=ready]>.tw-stage-out{animation-delay:.35s}\n@keyframes tw-frame-in{from{clip-path:inset(49% 49% 49% 49%);opacity:.2}to{clip-path:inset(-20px -20px -20px -20px);opacity:1}}\n/* During the opening the stage covers the native composer and the divider too. */\n.tw-native-shell>.tw-mount:has(.tw-intro){z-index:60}\n.tw-native-shell:has(.tw-intro)>.tw-divider{visibility:hidden}\n";}};
const cache=Object.create(null);
function require(id){if(!Object.hasOwn(modules,id))return platformRequire(id);if(cache[id])return cache[id].exports;const module={exports:{}};cache[id]=module;modules[id](module,module.exports,require);return module.exports;}
return require("./client.cjs");
}});
