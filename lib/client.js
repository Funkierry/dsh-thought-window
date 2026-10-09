/* Thought Window 0.7.0 | MIT | See NOTICE.md for reference credits | platform React is provided by DSH */
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
function buildProcess(graph){
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
   const parts=node.kind==='input'?[{start:0,end:group.text.length,text:group.text}]:slices(group.text);
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
module.exports={OPS,LIMIT,slices,buildProcess,mergeQueue,dwellMs,formFor,boardEntries};

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
function useReadingQueue({graph,replaying=false,suspended=false}){
 const derived=useMemo(()=>buildProcess(graph),[graph]);
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
const STOP=new Set(['我','你','他','她','它','我想','想要','希望','帮我','请','做','让','给','一下','怎么','如何','为什么','的','了','是','在','和','与','或','及','把','被','将','对','从','也','都','就','而','并','但','这','那','这个','那个','一个','一些','我们','你们','他们','需要','可以','然后','如果','因为','所以','进行','当前','使用','通过','以及','没有','已经','还是','这样','这里','什么','怎么','时候','现在','部分','内容','问题','the','and','for','with','that','this','from','into','are','was','were','will','can','not','but','you','your','have','has','its','then','than','when','what','which','there','their','also','just','only','each','more','some']);
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

// Figure choice is a pure function of the queue position, so a streaming
// sentence keeps its drawing. Kinds with several drawings alternate along a
// run of the same kind; plain reasoning rotates through the measurements.
const BY_KIND={input:['glyph'],plan:['grid','bars'],compare:['compare','cloud'],search:['cloud','mask'],code:['code'],math:['formula'],check:['boot','mask'],revise:['redline'],error:['redline'],retry:['redline'],request:['exec'],result:['exec'],answer:['compose']};
const ROTATION=['bars','curve','cloud','mask','grid'];
const NEEDS={cloud:4,mask:5,curve:2,grid:2};
function baseFigure(entries,index){
 const entry=entries[index];
 if(!entry)return 'idle';
 if(entry.kind==='answer'&&/^\s*\|.*\|\s*$/m.test(entry.text))return 'table';
 const fits=id=>index+1>=(NEEDS[id]||0);
 const options=BY_KIND[entry.kind];
 if(options){
  let run=0;for(let i=index-1;i>=0&&entries[i].kind===entry.kind;i--)run++;
  const usable=options.filter(fits);
  return usable.length?usable[run%usable.length]:options[0]==='grid'?'bars':options[0];
 }
 for(let i=0;i<ROTATION.length;i++){const id=ROTATION[(index+i)%ROTATION.length];if(fits(id))return id;}
 return 'bars';
}
function chooseFigure(entries,index){
 const id=baseFigure(entries,index);
 if(index>0&&!BY_KIND[entries[index]?.kind]&&baseFigure(entries,index-1)===id){
  const at=ROTATION.indexOf(id);
  for(let i=1;i<ROTATION.length;i++){const next=ROTATION[(at+i)%ROTATION.length];if(index+1>=(NEEDS[next]||0))return next;}
 }
 return id;
}
function tableOf(text){
 return String(text||'').split('\n').filter(l=>/^\s*\|.*\|\s*$/.test(l)&&!/^[\s|:\-]+$/.test(l))
  .map(l=>l.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim()));
}
module.exports={words,keywords,bigrams,jaccard,hash,random,project,overlap,phaseOf,chooseFigure,tableOf,length,short,isCJK,fmt,chars};

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
const TITLES={idle:'boot / standby',glyph:'stdin / query',bars:'think / length',curve:'stream / chars',cloud:'trace / point-set',mask:'trace / overlap',grid:'plan / sequence',compare:'options / compare',boot:'verify.log',exec:'tool.exchange',redline:'revision.log',code:'source.code',formula:'formula.extract',compose:'output / compose',table:'output / table'};
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
 table:'表格逐格摘自回答原文'
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

const BUILDERS={idle,glyph,bars,curve,cloud,mask,grid,compare,boot,exec,redline,code,formula,compose,table};
function buildFigure(id,context){
 const make=BUILDERS[id]||bars,spec=make(context);
 return {figure:id,title:TITLES[id]||id,caption:CAPTIONS[id]||'',marks:[],texts:[],live:[],...spec};
}
module.exports={buildFigure,TITLES,CAPTIONS,wrap,area,FIGURES:Object.keys(BUILDERS)};

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
function createEngine(canvas,options={}){
 const ctx=canvas.getContext('2d');
 const scene=document.createElement('canvas'),sctx=scene.getContext('2d');
 const glow=document.createElement('canvas'),gctx=glow.getContext('2d');
 let w=1,h=1,dpr=1,colors={},dark=true,particles=[],texts=new Map(),live=[],spin=null,key=null,builder=null,spec=null;
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
 function assign(p,m){p.id=m.id;p.ref=m.ref;p.shape=m.shape||'rect';p.ch=m.ch;p.color=m.color||'ink';p.blink=!!m.blink;p.z=m.z||0;p.dying=false;}
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
    const b=target(m),f=m.from||{x:m.x,y:next.baseline??h};
    const p={n:serial++,a:still?b:{x:f.x,y:f.y,w:b.w,h:b.h,l:0},b,t0:t+delay,dur:still?0:760*k};
    assign(p,m);out.push(p);
   }
  }
  for(const p of alive)if(!used.has(p)){
   const cur=state(p,t);p.dying=true;p.ref=null;
   if(still)continue;
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
  live=(next.live||[]).map(x=>({...x,t0:t}));
  spin=next.spin?{...next.spin,t0:spin?.t0??t}:null;
  settle=t+(still?0:2600*k+Math.max(0,...marks.map(m=>m.delay||0))*k);
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
  sctx.globalAlpha=clamp(level);
  const color=colors[p.color]||colors.ink;
  if(p.shape==='glyph'){sctx.fillStyle=color;sctx.font=`${Math.max(8,Math.round(s.h*.9))}px ${FONT}`;sctx.textAlign='center';sctx.fillText(p.ch||'·',x+s.w/2,s.y+s.h*.8);return;}
  if(p.shape==='frame'){sctx.strokeStyle=color;sctx.lineWidth=1;sctx.strokeRect(Math.round(x)+.5,Math.round(s.y)+.5,s.w,s.h);return;}
  sctx.fillStyle=color;
  if(p.shape==='cell'){
   sctx.globalAlpha=clamp(level*.9);sctx.fillRect(x,s.y,s.w,s.h);
   sctx.globalAlpha=clamp(s.l);sctx.strokeStyle=color;sctx.lineWidth=1;sctx.strokeRect(Math.round(x)+.5,Math.round(s.y)+.5,s.w-1,s.h-1);
   if(p.ch&&s.h>=10){sctx.fillStyle=level>.55?colors.paper:colors.ink;sctx.globalAlpha=clamp(s.l*1.1);sctx.font=`${Math.round(Math.min(s.h*.62,s.w*.72))}px ${FONT}`;sctx.textAlign='center';sctx.fillText(p.ch,x+s.w/2,s.y+s.h*.72);}
   return;
  }
  sctx.fillRect(x,s.y,s.w,s.h);
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
  sctx.globalAlpha=clamp(alpha);sctx.fillStyle=colors[s.color]||colors.ink;
  sctx.font=`${s.weight||400} ${s.size||12}px ${FONT}`;sctx.textAlign=s.align||'left';
  sctx.fillText(text,s.x,s.y);
  return true;
 }
 function drawLive(item,t){
  const color=colors[item.color||'accent'];
  if(item.type==='sweep'){const u=((t-item.t0)/item.period)%1,x=lerp(item.x0,item.x1,u);sctx.globalAlpha=.85;sctx.fillStyle=color;sctx.fillRect(x,item.y0,1.5,item.y1-item.y0);sctx.globalAlpha=.18;sctx.fillRect(x-10,item.y0,10,item.y1-item.y0);}
  else if(item.type==='cursor'){if(Math.floor((t-born)/530)%2)return;sctx.globalAlpha=.9;sctx.fillStyle=color;sctx.fillRect(item.x,item.y,item.w||7,item.h||13);}
  else if(item.type==='ring'){const u=((t-item.t0)%1400)/1400;sctx.globalAlpha=.8*(1-u);sctx.strokeStyle=color;sctx.lineWidth=1.5;sctx.beginPath();sctx.arc(item.x,item.y,item.r*(.4+u),0,Math.PI*2);sctx.stroke();sctx.globalAlpha=.9;sctx.fillStyle=color;sctx.fillRect(item.x-2,item.y-2,4,4);}
 }
 function draw(t){
  sctx.setTransform(dpr,0,0,dpr,0,0);
  sctx.globalCompositeOperation='source-over';
  // Afterimage: fade the previous frame toward the paper colour instead of clearing it.
  // A full clear once settled: 8-bit fading alone never reaches the paper colour.
  sctx.globalAlpha=animate&&motion==='rich'&&t<settle?.42:1;sctx.fillStyle=colors.paper;sctx.fillRect(0,0,w,h);
  sctx.textBaseline='alphabetic';
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
  if(busy||t-last>=66){draw(t);last=t;}
  if(animate&&!document.hidden&&(busy||live.length||spin||motion==='rich'||particles.some(p=>p.blink)))raf=requestAnimationFrame(frame);
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
module.exports={createEngine,raster};

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
function Stage({graph,onSelect,animate,motion,replaying=false,suspended=false,theme,menu,menuOpen,onMenu,omitted=0,source='LIVE'}){
 const {queue,entries,index,focus,pending,playing,setPlaying,seconds,setSeconds,started,choose,change}=useReadingQueue({graph,replaying,suspended});
 const arrival=useArrival(graph,queue.turn);
 const motionAllowed=useMotionAllowed(animate);
 const canvas=useRef(null),engine=useRef(null),ops=useRef(null),[, setClock]=useState(0),[caption,setCaption]=useState('');
 const figure=useMemo(()=>D.chooseFigure(entries,index),[entries,index]);
 const phase=focus?D.phaseOf(focus.kind):['--','STANDBY'];
 useEffect(()=>{
  const e=createEngine(canvas.current,{animate:motionAllowed&&!suspended,motion});engine.current=e;
  const observer=new ResizeObserver(()=>e.resize());observer.observe(canvas.current);
  return()=>{observer.disconnect();e.destroy();engine.current=null;};
 },[]);
 useEffect(()=>{engine.current?.setOptions({animate:motionAllowed&&!suspended,motion});},[motionAllowed,motion,suspended]);
 useEffect(()=>{const id=requestAnimationFrame(()=>engine.current?.restyle());return()=>cancelAnimationFrame(id);},[theme]);
 const samples=figure==='curve'?arrival.list.length:0;
 useEffect(()=>{
  const spec=engine.current?.show(figure+':'+queue.turn,box=>buildFigure(figure,{entries,index,focus,samples:arrival.list.slice(),box,running:graph.running}));
  setCaption(spec?.caption||CAPTIONS[figure]||'');
 },[figure,queue.turn,focus?.id,focus?.text,focus?.status,entries.length,index,graph.running,samples]);
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
 const last=arrival.list.at(-1)?.t||arrival.start,elapsed=(graph.running?Date.now():last)-arrival.start;
 const status=source!=='LIVE'&&source!=='IDLE'?source:graph.running?'RUNNING':source==='IDLE'&&!focus?'IDLE':playing?pending?'READING':'CAUGHT UP':'PAUSED';
 return h('section',{className:'tw-stage','data-figure':figure,'data-phase':phase[1].toLowerCase(),'data-reading':playing?'playing':'paused','data-active-entry':focus?.id||'','aria-label':'思路舞台'},
  h('header',{className:'tw-stage-top'},
   h('b',null,'THOUGHT.TRACE(ME);'),
   h('span',{className:'tw-stage-prompt'},'deepseek@dsh:~$'),
   h(Wave,{list:arrival.list,running:graph.running}),
   h('span',{className:'tw-stage-phase'},phase[0]+' / '+phase[1]),
   h('span',null,clock(elapsed)),
   h('span',{className:'tw-stage-read'},'READ '+pad2(entries.length?index+1:0)+' / '+pad2(entries.length)),
   h('span',{className:'tw-stage-status','data-status':status.toLowerCase().replace(' ','-')},status),
   h('button',{type:'button',className:'tw-stage-menu-button','aria-label':'思路视窗菜单','aria-expanded':!!menuOpen,title:'菜单（` 键）',onClick:()=>onMenu?.()},'≡')),
  h('div',{className:'tw-stage-chat','aria-hidden':true},h('span',{className:'tw-stage-cap'},'dsh · web')),
  h('section',{className:'tw-stage-main'},
   h('div',{className:'tw-stage-cap'},h('span',null,'| '+(TITLES[figure]||figure)),h('small',null,focus?'#'+pad2(index+1)+' '+focus.op+' · '+focus.label:'standby')),
   h('div',{className:'tw-stage-plot'},h('canvas',{ref:canvas,className:'tw-stage-canvas',onClick:click,role:'img','aria-label':(TITLES[figure]||figure)+'：'+D.short(focus?.text||'等待公开内容',80)})),
   h('div',{className:'tw-stage-caption'},caption),
   !playing&&!replaying&&focus?h('div',{className:'tw-stage-paused'},'Ⅱ PAUSED · 空格继续'):null),
  h('aside',{className:'tw-stage-ops','aria-label':'过程操作索引'},
   h('span',{className:'tw-stage-cap'},'ops'),
   h('nav',{ref:ops},entries.map((e,i)=>h('button',{type:'button',key:e.id,'aria-current':i===index?'step':undefined,'data-status':e.status,'data-past':i<index?'true':undefined,onClick:()=>choose(e.id),title:D.short(e.text,90)},h('small',null,pad2(i+1)),e.op)))),
  h('footer',{className:'tw-stage-out'},
   h('span',{className:'tw-stage-cap'},h('span',null,'stdout · tokens'),h('small',null,focus?'@offset · '+D.length(focus.text)+' chars':'')),
   h(Tokens,{key:focus?.id||'empty',entry:focus,seconds,playing:playing&&!replaying&&!suspended,onOpen:()=>openSource(focus)})),
  h('div',{className:'tw-stage-credit'},
   h('span',null,'thought-window 0.7.0'),h('span',null,'公开推理与工具事件 · 图形由原文长度、重叠与到达时间计算，非模型内部状态'),omitted?h('span',null,'较早片段已省略'):null,h('span',null,'空格 暂停 · ←/→ 逐条 · ` 菜单')),
  menuOpen?h('div',{className:'tw-stage-menu',role:'dialog','aria-label':'思路视窗菜单'},
   h('div',{className:'tw-stage-menu-row'},h('span',null,'阅读'),
    h('button',{type:'button','aria-label':'上一条思路',disabled:index===0,onClick:()=>change(-1)},'←'),
    h('button',{type:'button',onClick:toggle,disabled:replaying},playing?'Ⅱ 暂停阅读':'▷ 继续逐条'),
    h('button',{type:'button','aria-label':'下一条思路',disabled:!pending,onClick:()=>change(1)},'→'),
    h('button',{type:'button',disabled:!pending,onClick:latest},'跳到最新'),
    h('label',null,'停留 ',h('select',{'aria-label':'每步最少停留时间',value:seconds,onChange:e=>{setSeconds(Number(e.target.value));started.current=Date.now();}},[5,8,12].map(v=>h('option',{key:v,value:v},v+' 秒')))),
    h('small',null,pending?'后面还有 '+pending+' 条':'已到末尾')),
   menu,
   h('button',{type:'button',className:'tw-stage-menu-close',onClick:()=>onMenu?.(false),'aria-label':'关闭菜单'},'×')):null,
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
  h('div',null,h('span',{className:'tw-dock-mark'},'▦'),h('strong',null,'THOUGHT WINDOW'),h('small',null,'0.7.0 / 成果模式'),h('span',{className:'tw-spacer'}),h('button',{type:'button',onClick:onExpand},'展开过程'),h('button',{type:'button',onClick:onWork},'成果 / 运行')),
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
function ThoughtWindow({graph,sessionId,onClose,onTheme,onShell,mode='live',onOpenFile,preview={open:false},dockExpanded=false,onExpandDock,onFoldDock}) {
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
      h(Stage,{graph:current,onSelect:selectSource,animate:animate&&!folded,motion,replaying:!live,suspended:folded,theme:effectiveTheme,menu:menuBody,menuOpen:menu,onMenu:value=>setMenu(old=>typeof value==='boolean'?value:!old),omitted:current.omitted,source:live?(current.running?'LIVE':'IDLE'):imported?'IMPORTED':'REPLAY'}),
      sourcePanel);
  }
  return h('section',{className:`tw-window tw-theme-${effectiveTheme} tw-layout-${layout} ${animate?'':'tw-no-motion'}`,'data-motion':motion,'aria-label':'思路视窗'},
    preview.open?h(PreviewDock,{work:graph.work,preview,onExpand:()=>{setLayout('process');onExpandDock?.();},onWork:()=>{setLayout('workbench');onExpandDock?.();}}):null,
    h('header',{className:'tw-titlebar'},h('div',null,h('span',{className:'tw-mark'},'▦'),h('strong',null,'THOUGHT WINDOW'),h('small',null,'思路仪表 / 0.7.0')),
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

// DSH 0.1.5-rc.2 does not expose an outer split-pane factory. This small DOM
// adapter owns only its mount/class. Chat data always comes from public hooks.
function findRoot(anchor){
  let current=anchor?.parentElement;
  while(current){if(current.hasAttribute('data-phase') && current.querySelector('[data-conversation-scroll]'))return current;current=current.parentElement;}
  return null;
}
const stageSplit=value=>Number.isFinite(value)?Math.max(.45,Math.min(.8,value)):.7;
function Controller({sessionId,useChat,useSession,host}) {
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
  return h(React.Fragment,null,h('button',{ref:anchor,type:'button',className:'tw-launch',title:unsupported?'当前 DSH 布局不兼容，可关闭插件并查看 README':'打开 / 关闭思路视窗','aria-label':'思路视窗','aria-pressed':enabled&&!unsupported,onClick:()=>setEnabled(!enabled)},'▦ ',unsupported?'布局不兼容':'思路视窗'),mount&&enabled?ReactDOM.createPortal(h(ThoughtWindow,{key:sessionId,graph,sessionId,preview,dockExpanded,onExpandDock:()=>setDockExpanded(true),onFoldDock:()=>setDockExpanded(false),onOpenFile:host.canOpen()?path=>host.openFile(sessionId,path):undefined,onClose:()=>setEnabled(false),onTheme:theme=>themeRoot.current?.set(theme),onShell:next=>setShell(old=>old.stage===next.stage&&old.sidebar===next.sidebar?old:next)}),mount):null);
}
class Boundary extends React.Component {
  constructor(props){super(props);this.state={error:false};}
  static getDerivedStateFromError(){return {error:true};}
  render(){return this.state.error?h('span',{className:'tw-launch',title:'关闭插件或重新加载页面恢复。原聊天不受影响。'},'思路视窗暂不可用'):this.props.children;}
}
const inject=['slots'];
function apply(ctx){
  const host=createHostBridge(ctx);
  ctx.effect(()=>{const style=document.createElement('style');style.dataset.thoughtWindow='0.7.0';style.textContent=css;document.head.appendChild(style);return()=>style.remove();});
  ctx.slots.inject('conversation.input.left',function*(){
    yield ctx.slots.register({name:'conversation.input.left',id:'thought-window',order:90},props=>h(Boundary,null,h(Controller,{...props,host})));
  });
}
module.exports={name:'thought-window',inject,apply};

},
"./style.css": function(module){module.exports=".tw-native-shell{box-sizing:border-box!important;padding-left:var(--tw-panel-width)!important;position:relative!important;isolation:isolate}\n.tw-native-shell>.tw-mount{position:absolute;inset:0 auto 0 0;width:var(--tw-panel-width);z-index:3;border-right:1px solid #716f82;box-sizing:border-box}\n.tw-native-shell.tw-stacked{padding-left:0!important;padding-top:0!important}\n.tw-native-shell.tw-stacked>.tw-mount{width:100%;height:42%;bottom:auto;border-bottom:1px solid #716f82;border-right:0;position:relative;flex:none;order:-1}\n.tw-native-paper{background:#f3f0e6!important;color:#313139!important}\n.tw-native-night{background:#1b2130!important;color:#e1e6ed!important}\n.tw-native-paper{--dsw-alias-bg-base:#f3f0e6;--dsw-alias-bg-layer-1:#eeeae0;--dsw-alias-bg-module-platform:#f8f5ed;--dsw-alias-label-primary:#36363f;--dsw-alias-label-primary-bluish:#54546b;--dsw-alias-label-secondary:#686571;--dsw-alias-label-tertiary:#85838a;--dsw-alias-border-l2:#d4ced7;--dsw-alias-border-l3:#c5bed1;--dsw-alias-border-l4:#c5bed1;--dsw-alias-button-info-fill:#e6e2f0;--dsw-alias-interactive-bg-hover:#e6e2f0;--dsw-alias-interactive-bg-hover-solid:#e6e2f0;--dsw-alias-markdown-code-block:#e8e3da;--dsw-alias-state-business-primary:#7972ae}\n.tw-native-night{--dsw-alias-bg-base:#101724;--dsw-alias-bg-layer-1:#151f32;--dsw-alias-bg-module-platform:#101a2c;--dsw-alias-label-primary:#c8d6ea;--dsw-alias-label-primary-bluish:#c4d4ff;--dsw-alias-label-secondary:#a1b1cc;--dsw-alias-label-tertiary:#8492ad;--dsw-alias-border-l1:#28364d;--dsw-alias-border-l2:#344252;--dsw-alias-border-l3:#3f4b68;--dsw-alias-border-l4:#35405a;--dsw-alias-button-info-fill:#17275b;--dsw-alias-interactive-bg-hover:#233152;--dsw-alias-interactive-bg-hover-solid:#233152;--dsw-alias-markdown-code-block:#090f1b;--dsw-alias-state-business-primary:#7894ff;--dsw-alias-scrollbar-bg-l2:#344252}\n.tw-native-shell [data-composer-card]{border-radius:4px!important;border:1px solid var(--dsw-alias-border-l3)!important;box-shadow:3px 3px 0 #78729218!important}\n.tw-native-shell [data-conversation-scroll]{background:transparent!important}\n.tw-native-shell [data-composer-seat]{border-radius:2px!important}\n.tw-launch{font:12px Consolas,'Microsoft YaHei',monospace;white-space:nowrap;cursor:pointer;border:1px solid #8b87a4;padding:5px 9px;border-radius:2px;background:transparent;color:inherit}\n.tw-launch[aria-pressed=true]{background:#78729b22;color:#8278bd}\n.tw-window{--paper:#f2efe5;--panel:#f8f5ed;--ink:#36363f;--muted:#85838a;--line:#cecbd1;--accent:#7972ae;--accent-soft:#e6e2f0;--good:#688b7d;--danger:#b46966;--grid:#9992a91e;--shadow:#88829225;color:var(--ink);background:var(--paper);font:12px/1.45 Consolas,'SFMono-Regular','Microsoft YaHei',monospace;height:100%;width:100%;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;position:relative;text-align:left;color-scheme:light}\n.tw-window *{box-sizing:border-box}\n.tw-theme-night{--paper:#04070f;--panel:#0a1120;--ink:#c8d6ea;--muted:#70819c;--line:#344252;--accent:#7894ff;--accent-soft:#17275b;--good:#9ebad3;--danger:#ff3b30;--grid:#c8d6ea14;--shadow:#0004;color-scheme:dark}\n.tw-window:after{content:'';position:absolute;inset:0;pointer-events:none;z-index:10;background:repeating-linear-gradient(transparent 0px,transparent 3px,#746b7b06 3px,#746b7b06 4px)}\n.tw-window button,.tw-window select{font:inherit;color:inherit;cursor:pointer;border:1px solid var(--line);border-radius:0;background:var(--panel);padding:4px 8px;line-height:1.4}\n.tw-window button:hover{border-color:var(--accent);background:var(--accent-soft)}\n.tw-window button:focus-visible,.tw-window input:focus-visible,.tw-window select:focus-visible,.tw-map-scroll:focus-visible{outline:2px solid var(--accent);outline-offset:2px}\n.tw-window button:disabled{opacity:.4;cursor:default}\n.tw-window input{accent-color:var(--accent)}\n.tw-window input[type=checkbox]{width:12px;height:12px;margin:0;vertical-align:-2px}\n.tw-window label{cursor:pointer;white-space:nowrap}\n.tw-window small{font-size:10px;color:var(--muted)}\n.tw-titlebar{flex:none;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:16px 18px 13px;border-bottom:1px solid var(--ink)}\n.tw-titlebar>div:first-child{display:flex;align-items:baseline;gap:9px;flex-wrap:wrap}\n.tw-titlebar strong{font-size:14px;font-weight:700;letter-spacing:1px}\n.tw-mark{font-size:22px;line-height:1;color:var(--accent)}\n.tw-title-actions{display:flex;gap:4px}\n.tw-title-actions button{border:0;background:transparent;font-size:18px;padding:0 5px}\n.tw-ribbon{display:flex;align-items:center;justify-content:space-between;padding:9px 18px 4px;font-size:9px;letter-spacing:1px;color:var(--muted);flex:none}\n.tw-live{display:flex;align-items:center;gap:7px;color:var(--accent)}\n.tw-live i{width:6px;height:6px;background:var(--accent);display:inline-block}\n.tw-summary{display:flex;align-items:center;gap:27px;padding:8px 18px 16px;flex:none}\n.tw-summary>div:not(:last-child){display:flex;flex-direction:column;min-width:40px}\n.tw-summary small{font-size:9px;letter-spacing:1px}\n.tw-summary b{font-size:28px;line-height:1.1;font-weight:400;color:var(--accent)}\n.tw-summary-caption{margin-left:auto;display:flex;flex-direction:column;text-align:right;gap:4px;font-size:12px}\n.tw-map-toolbar{display:flex;align-items:center;gap:12px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:7px 18px;color:var(--muted);font-size:10px;flex:none}\n.tw-map-toolbar>span:first-child{margin-right:auto;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}\n.tw-view-switch{display:flex}.tw-view-switch button{font-size:10px;padding:1px 5px;border:0;background:transparent}.tw-view-switch button[aria-pressed=true]{background:var(--accent);color:var(--paper)}\n.tw-terminal{display:flex;flex-direction:column;flex:1;min-height:90px;margin:16px 16px 12px;border:1px solid var(--line);position:relative;background:linear-gradient(90deg,var(--paper),transparent);font-family:Consolas,'Microsoft YaHei',monospace}\n.tw-terminal:before,.tw-terminal:after{content:'';position:absolute;pointer-events:none;inset:-1px;z-index:2;background:linear-gradient(var(--ink),var(--ink)) left top/9px 2px no-repeat,linear-gradient(var(--ink),var(--ink)) left top/2px 9px no-repeat,linear-gradient(var(--ink),var(--ink)) right top/9px 2px no-repeat,linear-gradient(var(--ink),var(--ink)) right top/2px 9px no-repeat}\n.tw-terminal:after{transform:scaleY(-1)}\n.tw-term-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:-10px 12px 0;position:relative;z-index:3;font-size:10px;flex:none}.tw-term-heading strong{background:var(--paper);padding:0 6px;font-weight:500;font-size:12px}.tw-term-heading>span{padding:1px 6px;background:var(--ink);color:var(--paper);font-size:9px}\n.tw-term-main{flex:1;min-height:70px;display:flex;padding:12px 14px 9px 10px;gap:18px}\n.tw-index{width:56px;flex:none;display:flex;flex-direction:column;gap:5px;font-size:10px;color:var(--muted);padding-top:1px}.tw-index>span:first-child{margin-bottom:9px}.tw-index-item{display:flex;align-items:center;justify-content:space-between;padding:5px 4px;color:var(--accent);border:1px solid var(--line);font-size:10px}.tw-index-item small{font-size:9px}.tw-index .tw-index-current{color:var(--paper);background:var(--accent);border-color:var(--accent)}.tw-index-current small{color:var(--paper)}.tw-index-total{margin-top:9px;font-weight:700;color:var(--accent)}\n.tw-term-trace{display:flex;flex-direction:column;flex:1;min-width:0;min-height:0}.tw-term-command{flex:none;display:flex;align-items:center;gap:8px;color:var(--ink);font-size:12px;padding-bottom:12px;white-space:nowrap;overflow:hidden}.tw-term-command strong{font-weight:400;font-size:11px}.tw-caret{width:7px;height:12px;background:var(--accent);display:inline-block;flex:none}.tw-pulse-caret{animation:tw-blink .9s steps(2,end) infinite}\n.tw-term-axis{flex:none;display:flex;justify-content:space-between;color:var(--muted);font-size:9px;border-bottom:1px solid var(--line);padding-bottom:7px;margin-bottom:6px}\n.tw-term-rows{flex:1;min-height:0;overflow:auto;scrollbar-width:thin;scrollbar-color:var(--line) transparent;overscroll-behavior:contain;padding:0 4px 3px 0}\n.tw-window .tw-term-row{display:flex;align-items:center;gap:9px;width:100%;height:68px;border:0;padding:6px 0;background:transparent;text-align:left;animation:tw-node-in .32s steps(4,end) both;position:relative}\n.tw-window .tw-term-row:hover,.tw-window .tw-term-selected{background:var(--accent-soft)}\n.tw-row-index{font-size:9px;color:var(--muted);width:16px;flex:none;align-self:flex-start;padding-top:10px}.tw-row-copy{width:62%;min-width:0;display:flex;flex-direction:column;gap:3px}.tw-row-copy strong{font-size:14px;line-height:1.3;font-weight:400;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.tw-row-copy small{font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.tw-row-leader{flex:1;min-width:8px;border-top:2px dotted var(--line)}.tw-row-bubble{flex:none;border:2px solid var(--accent);background:var(--accent-soft);border-radius:50%;transition:height .3s steps(4,end),width .3s steps(4,end);box-shadow:inset 3px 3px 0 var(--paper)}.tw-status-running .tw-row-bubble{animation:tw-bubble-pulse 1.5s ease-in-out infinite}.tw-status-error .tw-row-bubble{border-color:var(--danger)}.tw-row-count{width:35px;flex:none;font-size:10px;font-weight:700}\n.tw-forward{padding-top:7px;flex:none}.tw-forward>div:first-child{display:flex;justify-content:space-between;font-size:8px;color:var(--muted);margin-bottom:5px}.tw-buffer-cells{display:flex;gap:2px}.tw-buffer-cells i{height:9px;flex:1;border:1px solid var(--line);background:transparent;min-width:1px}.tw-buffer-cells .tw-cell-IN,.tw-buffer-cells .tw-cell-OUT{background:var(--accent)}.tw-buffer-cells .tw-cell-TH{background:var(--accent-soft);border-color:var(--accent)}.tw-buffer-cells .tw-cell-IO{background:var(--good)}.tw-buffer-cells .tw-cell-ERR{background:var(--danger)}.tw-cell-running{animation:tw-blink .8s steps(2,end) infinite}\n.tw-instruments{flex:none;display:grid;grid-template-columns:1fr 1fr 1fr;border-top:1px solid var(--line);margin:4px 12px 8px;padding-top:12px;gap:12px}.tw-instrument{border:1px solid var(--line);min-width:0;padding:0 8px 5px;position:relative}.tw-instrument h3{font-size:9px;font-weight:400;margin:-7px 0 6px;background:var(--paper);display:table;padding:0 4px;letter-spacing:.5px}.tw-instrument p{font-size:10px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;margin:10px 0 8px}.tw-instrument small{font-size:8px}.tw-signal svg{display:block;width:100%;height:31px;margin:2px 0 5px}.tw-signal-axis{fill:none;stroke:var(--line);stroke-dasharray:2 3}.tw-signal-line{fill:none;stroke:var(--accent);stroke-width:1.5;shape-rendering:crispEdges}\n.tw-term-idle{padding:30px 10px;text-align:center;color:var(--muted)}.tw-term-idle strong{font-weight:400;font-size:12px}.tw-term-idle p{font-size:9px}.tw-pixel-orbit{font-size:38px;margin-bottom:15px;color:var(--accent);animation:tw-blink 3s steps(4,end) infinite}\n@keyframes tw-bubble-pulse{50%{box-shadow:inset 3px 3px 0 var(--paper),0 0 0 4px var(--accent-soft)}}\n.tw-no-motion .tw-row-bubble{transition:none!important}\n.tw-stacked .tw-terminal{margin:12px 9px 8px}.tw-stacked .tw-term-main{padding:8px 9px;gap:10px}.tw-stacked .tw-instruments,.tw-stacked .tw-index-total,.tw-stacked .tw-index>small,.tw-stacked .tw-term-command,.tw-stacked .tw-term-axis,.tw-stacked .tw-forward{display:none}.tw-stacked .tw-index{width:40px;gap:3px}.tw-stacked .tw-index-item{padding:2px 3px}.tw-stacked .tw-term-row{height:55px}.tw-stacked .tw-row-copy strong{font-size:12px}.tw-stacked .tw-row-copy{width:53%}.tw-stacked .tw-index>span:first-child{margin-bottom:2px}.tw-stacked .tw-term-heading{font-size:9px}.tw-stacked .tw-term-heading strong{font-size:10px}\n.tw-map-scroll{flex:1;min-height:90px;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--line) transparent;background-image:radial-gradient(var(--grid) 1px,transparent 1px);background-size:12px 12px}\n.tw-map{position:relative;min-width:530px;width:100%}\n.tw-lane{position:absolute;top:16px;font-size:9px;letter-spacing:1.5px;color:var(--muted)}\n.tw-lane-a{left:8.42%}.tw-lane-b{left:62.1%}\n.tw-wires{width:100%;height:100%;position:absolute;inset:0;pointer-events:none;overflow:visible}\n.tw-wire{fill:none;stroke:var(--accent);stroke-opacity:.45;stroke-width:1.3;stroke-dasharray:3 5;vector-effect:non-scaling-stroke;animation:tw-wire-in .6s ease-out both}\n.tw-parent{stroke:var(--good);stroke-dasharray:none;opacity:.6}\n.tw-current{fill:none;stroke:var(--accent);stroke-width:3;stroke-dasharray:3 36;animation:tw-flow 2s linear infinite;vector-effect:non-scaling-stroke}\n.tw-growing{fill:none;stroke:var(--accent);stroke-width:1.5;stroke-dasharray:1;stroke-dashoffset:0;opacity:0;animation:tw-grow .7s ease-out both;vector-effect:non-scaling-stroke}\n.tw-window .tw-node{position:absolute;height:84px;display:flex;flex-direction:column;justify-content:space-between;text-align:left;padding:8px 11px;border:1px solid var(--line);box-shadow:3px 3px 0 var(--shadow);background:var(--panel);animation:tw-node-in .4s steps(5,end) both;isolation:isolate}\n.tw-node:before{content:'';position:absolute;top:-4px;left:calc(50% - 3px);width:6px;height:6px;background:var(--paper);border:1px solid var(--accent)}\n.tw-node-meta{display:flex;justify-content:space-between;gap:5px;font-size:8px;letter-spacing:.3px;color:var(--muted);white-space:nowrap}\n.tw-node-meta>span:first-child{overflow:hidden;text-overflow:ellipsis}\n.tw-node-dot{width:6px;height:6px;flex:none;background:var(--good);margin-top:2px}\n.tw-node strong{font-size:12px;font-weight:500;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.45;overflow-wrap:anywhere}\n.tw-node-state{font-size:8px;letter-spacing:.5px;color:var(--muted)}\n.tw-window .tw-selected{outline:2px solid var(--accent);outline-offset:3px}\n.tw-window .tw-input{background:var(--accent-soft);border-color:var(--accent)}\n.tw-window .tw-tool{border-color:var(--good)}\n.tw-window .tw-answer{border-color:var(--accent);border-left-width:4px}\n.tw-window .tw-status-running{border-color:var(--accent)}\n.tw-status-running .tw-node-dot{background:var(--accent);animation:tw-blink 1s steps(2,end) infinite}\n.tw-status-error .tw-node-dot,.tw-error .tw-node-dot{background:var(--danger)}\n.tw-status-stopped .tw-node-dot{background:var(--muted)}\n.tw-empty{position:absolute;top:80px;left:0;right:0;text-align:center;padding:20px 28px;color:var(--muted)}\n.tw-empty-icon{font-size:36px;color:var(--accent);margin-bottom:14px;animation:tw-blink 3s steps(4,end) infinite}\n.tw-empty strong{color:var(--ink);font-size:15px;font-weight:400;display:block}.tw-empty p{font-size:11px}\n.tw-note{font-size:10px;color:var(--muted);padding:5px 18px;border-top:1px solid var(--line);flex:none}\n.tw-source{flex:none;border-top:1px solid var(--accent);background:var(--panel);padding:10px 18px;max-height:34%;display:flex;flex-direction:column;min-height:100px}\n.tw-source-title{display:flex;justify-content:space-between;align-items:center;font-size:11px}.tw-source-title button{padding:0 5px;border:0}\n.tw-source-meta{font-size:9px;color:var(--muted);margin:3px 0 7px}\n.tw-source pre{font:11px/1.65 Consolas,'Microsoft YaHei',monospace;white-space:pre-wrap;overflow-wrap:anywhere;overflow:auto;margin:0;color:var(--ink);min-height:20px}\n.tw-controls{flex:none;padding:10px 18px 12px;border-top:1px solid var(--ink);background:var(--paper)}\n.tw-timeline-label{display:flex;justify-content:space-between;font-size:9px;color:var(--muted);letter-spacing:.5px}\n.tw-timeline{width:100%;height:14px;margin:5px 0 8px;cursor:pointer}\n.tw-playbar{display:flex;gap:5px;align-items:center}.tw-playbar button,.tw-playbar select{font-size:10px;padding:3px 7px}.tw-spacer{flex:1}.tw-window .tw-active{background:var(--accent-soft);border-color:var(--accent);color:var(--accent)}\n.tw-storage-row{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:9px;color:var(--muted);flex-wrap:wrap}.tw-storage-row button{font-size:9px;padding:0 4px;border:0;background:transparent;text-decoration:underline}.tw-storage-row small{margin-left:auto;font-size:8px}\n.tw-disclosure{font-size:9px;color:var(--muted);line-height:1.5;margin:8px 0 0}.tw-notice{margin:6px 0 0;font-size:10px;color:var(--accent)}\n.tw-pulse i{animation:tw-blink 1.5s steps(2,end) infinite}\n@keyframes tw-node-in{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:translateY(0)}}\n@keyframes tw-wire-in{from{stroke-opacity:0}to{stroke-opacity:.45}}\n@keyframes tw-grow{0%{stroke-dashoffset:1;opacity:1}85%{stroke-dashoffset:0;opacity:1}100%{stroke-dashoffset:0;opacity:0}}\n@keyframes tw-flow{to{stroke-dashoffset:-78}}\n@keyframes tw-blink{50%{opacity:.35}}\n.tw-no-motion *{animation:none!important;scroll-behavior:auto!important}\n.tw-stacked .tw-summary,.tw-stacked .tw-ribbon,.tw-stacked .tw-storage-row,.tw-stacked .tw-disclosure,.tw-stacked .tw-summary-caption{display:none}\n.tw-stacked .tw-titlebar{padding:7px 14px}.tw-stacked .tw-titlebar strong{font-size:12px}.tw-stacked .tw-titlebar small{display:none}\n.tw-stacked .tw-controls{padding:5px 14px}.tw-stacked .tw-timeline-label{display:none}.tw-stacked .tw-timeline{margin:0 0 3px}\n.tw-stacked .tw-source{position:absolute;inset:40px 8px 76px 8px;max-height:none;z-index:12;border:1px solid var(--accent);box-shadow:4px 4px 0 var(--shadow)}\n@media(prefers-reduced-motion:reduce){.tw-window *{animation:none!important;scroll-behavior:auto!important}}\n\n/* Scene-specific geometry, six palettes and bounded CSS-only motion. */\n.tw-theme-amber,.tw-native-amber{--paper:#17120c;--panel:#21190f;--ink:#eed8b6;--muted:#b69a72;--line:#59482e;--accent:#efb554;--accent-soft:#473117;--good:#c6ba83;--danger:#ff8b66;--grid:#efb55415;--shadow:#0005;color-scheme:dark}\n.tw-theme-phosphor,.tw-native-phosphor{--paper:#0b1612;--panel:#101f19;--ink:#c5e6cf;--muted:#80a991;--line:#2e5340;--accent:#8bd7a1;--accent-soft:#1e3c2b;--good:#b9e1a0;--danger:#ef9d87;--grid:#8bd7a118;--shadow:#0005;color-scheme:dark}\n.tw-theme-violet,.tw-native-violet{--paper:#191427;--panel:#241d36;--ink:#e6dcf5;--muted:#a99abc;--line:#554464;--accent:#c5a0ee;--accent-soft:#403051;--good:#a4c3c2;--danger:#f093ad;--grid:#c5a0ee15;--shadow:#0005;color-scheme:dark}\n.tw-theme-blueprint,.tw-native-blueprint{--paper:#173450;--panel:#1e3e5d;--ink:#e1eced;--muted:#9dbbc9;--line:#51758d;--accent:#b1d9e6;--accent-soft:#2c506a;--good:#b5d8c5;--danger:#ffd5af;--grid:#b1d9e619;--shadow:#081f3644;color-scheme:dark}\n:is(.tw-native-amber,.tw-native-phosphor,.tw-native-violet,.tw-native-blueprint){background:var(--paper)!important;color:var(--ink)!important;--dsw-alias-bg-base:var(--paper);--dsw-alias-bg-layer-1:var(--panel);--dsw-alias-bg-module-platform:var(--panel);--dsw-alias-label-primary:var(--ink);--dsw-alias-label-primary-bluish:var(--ink);--dsw-alias-label-secondary:var(--muted);--dsw-alias-label-tertiary:var(--muted);--dsw-alias-border-l1:var(--line);--dsw-alias-border-l2:var(--line);--dsw-alias-border-l3:var(--line);--dsw-alias-border-l4:var(--line);--dsw-alias-button-info-fill:var(--accent-soft);--dsw-alias-interactive-bg-hover:var(--accent-soft);--dsw-alias-interactive-bg-hover-solid:var(--accent-soft);--dsw-alias-markdown-code-block:var(--paper);--dsw-alias-state-business-primary:var(--accent);--dsw-alias-scrollbar-bg-l2:var(--line)}\n.tw-window{transition:background-color .5s,color .5s}\n.tw-theme-paper{--muted:#737078}\n.tw-theme-night{--muted:#92a1b9}\n.tw-appearance{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 18px;border-bottom:1px solid var(--line);font-size:9px;color:var(--muted);flex:none}\n.tw-appearance select{font-size:10px;padding:2px 5px;color:var(--accent);background:transparent;border:0}\n.tw-layout-adaptive .tw-summary{padding:5px 18px 10px;gap:20px}\n.tw-layout-adaptive .tw-summary b{font-size:21px}.tw-layout-adaptive .tw-summary-caption{font-size:11px}\n.tw-adaptive{display:flex;flex-direction:column;flex:1;min-height:110px;overflow:hidden;position:relative}\n.tw-director-bar{display:flex;align-items:center;gap:7px;padding:9px 18px;font-size:9px;color:var(--muted);flex:none}\n.tw-director-light{width:5px;height:5px;background:var(--accent);box-shadow:0 0 0 3px var(--accent-soft);flex:none}\n.tw-director-bar select{margin-left:auto;font-size:10px;padding:2px 5px;max-width:48%}\n.tw-scene-heading{display:flex;gap:13px;align-items:center;padding:7px 23px 16px;flex:none}\n.tw-scene-symbol{font-size:30px;color:var(--accent);line-height:1}\n.tw-scene-heading h2{font-size:22px;font-weight:400;letter-spacing:2px;margin:3px 0 0;line-height:1.2}\n.tw-scene-heading small{font-size:9px;letter-spacing:2px;color:var(--accent)}\n.tw-scene-reason{font-size:9px;color:var(--muted);margin-left:auto;max-width:34%;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.tw-scene-viewport{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--line) transparent;padding:0 23px 12px;background-image:radial-gradient(var(--grid) 1px,transparent 1px);background-size:12px 12px;outline-offset:-3px}\n.tw-scene-stage{position:relative;min-height:100%;animation:tw-scene-enter .44s steps(6,end) both}\n.tw-scene-shutter{position:absolute;inset:0;pointer-events:none;z-index:4;border-top:1px solid var(--accent);background:linear-gradient(var(--accent-soft),transparent 40%);animation:tw-shutter .55s steps(9,end) both}\n.tw-scene-tape{display:flex;align-items:center;gap:5px;padding:8px 18px;border-top:1px solid var(--line);font-size:9px;color:var(--muted);flex:none}\n.tw-scene-tape>span{margin-right:7px;letter-spacing:1px}\n.tw-scene-tape button{padding:2px 6px;font-size:9px;background:transparent}\n.tw-scene-tape button[aria-pressed=true]{background:var(--accent);color:var(--paper)}\n.tw-tape-live{border-color:var(--accent)!important;animation:tw-blink 1.6s steps(3,end) infinite}\n.tw-scene-screenreader{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}\n.tw-window .tw-scene-tile{display:block;position:relative;width:100%;padding:13px 15px;text-align:left;background:var(--panel);border:1px solid var(--line);box-shadow:3px 3px 0 var(--shadow);overflow:hidden;overflow-wrap:anywhere;animation:tw-tile-enter .45s steps(6,end) both;animation-delay:calc(var(--order,0)*40ms);transition:border-color .2s,transform .2s}\n.tw-window .tw-scene-tile:hover{border-color:var(--accent);transform:translateY(-2px);background:var(--accent-soft)}\n.tw-scene-tile p{font-size:12px;line-height:1.85;margin:7px 0 0;white-space:pre-wrap;color:var(--ink)}\n.tw-tile-label,.tw-scene-tile small{font-size:9px;color:var(--muted);letter-spacing:.5px}\n.tw-scene-footnote{font-size:9px;color:var(--muted);line-height:1.6;margin:14px 0 4px}\n.tw-scene-placeholder{font-size:11px;color:var(--muted);line-height:1.8;border:1px dashed var(--line);padding:18px}\n.tw-scene-command{font-size:10px;padding:7px 0 18px;color:var(--accent)}\n/* ATLAS — orbital motif and source islands. */\n.tw-atlas{position:relative;padding-top:12px}\n.tw-orbit-art{position:relative;width:150px;height:104px;margin:0 auto 10px;display:grid;place-items:center;color:var(--accent)}\n.tw-orbit-art i{position:absolute;width:130px;height:64px;border:1px solid var(--line);border-radius:50%;transform:rotate(-25deg)}\n.tw-orbit-art i:nth-child(2){transform:rotate(40deg)}.tw-orbit-art i:nth-child(3){transform:rotate(95deg)}\n.tw-orbit-art i:before{content:'';position:absolute;left:20px;top:0;width:5px;height:5px;background:var(--accent)}\n.tw-orbit-art b{font-weight:400;font-size:34px}\n.tw-window[data-motion=rich] .tw-orbit-art{animation:tw-orbit-drift 12s linear infinite}\n.tw-atlas-center{margin:0 auto 25px;text-align:center;max-width:80%;position:relative}\n.tw-atlas-center small{font-size:8px;letter-spacing:2px}.tw-atlas-center strong{display:block;font-size:16px;font-weight:400;line-height:1.65;margin-top:7px}\n.tw-atlas-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}\n.tw-atlas-grid .tw-scene-tile:nth-child(even){border-top:3px solid var(--accent)}\n/* PLAN — numbered steps and a travelling connector. */\n.tw-plan-step{display:grid;grid-template-columns:36px 1fr;gap:10px;position:relative;padding-bottom:21px}\n.tw-step-number{font-size:22px;color:var(--accent);padding-top:9px;font-weight:400}\n.tw-plan-step:not(:last-of-type):before{content:'';position:absolute;left:13px;top:43px;bottom:4px;border-left:1px dashed var(--line)}\n.tw-step-connector{position:absolute;bottom:0;left:calc(50% + 10px);font-size:15px;color:var(--accent)}\n.tw-plan-step:last-of-type .tw-step-connector{display:none}\n.tw-window[data-motion=rich] .tw-step-connector{animation:tw-step-flow 1.8s ease-in-out infinite;animation-delay:calc(var(--order)*120ms)}\n.tw-plan .tw-scene-tile{padding:9px 14px}.tw-plan .tw-scene-tile p{margin-top:4px}\n/* COMPARE — parallel cards, no invented scores or winning branch. */\n.tw-branch-root{padding:14px 20px;text-align:center;border:1px solid var(--accent);margin:4px auto 0;max-width:88%;background:var(--accent-soft)}\n.tw-branch-root span{font-size:8px;letter-spacing:2px;color:var(--accent)}\n.tw-branch-root strong{display:block;font-weight:400;font-size:14px;line-height:1.7;margin-top:6px}\n.tw-branch-lines{text-align:center;font-size:24px;letter-spacing:2px;color:var(--accent);overflow:hidden;white-space:nowrap;animation:tw-branch-draw .7s steps(10,end) both}\n.tw-branch-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px}\n.tw-branch-card{min-height:195px}.tw-branch-card:nth-child(even){background:var(--accent-soft)}\n.tw-branch-symbol{display:block;font-size:31px;color:var(--accent);line-height:1;margin-bottom:16px}\n.tw-branch-card h3{font-weight:400;font-size:16px;letter-spacing:1px;margin:0}.tw-branch-card p{min-height:70px}.tw-branch-card small{display:block;margin-top:20px}\n/* SEARCH — radar is decorative, source tiles carry the evidence. */\n.tw-search-upper{display:grid;grid-template-columns:146px 1fr;gap:26px;align-items:center;margin:12px 0 25px}\n.tw-search-upper h3{font-size:17px;line-height:1.6;font-weight:400;margin:7px 0 9px}.tw-search-upper p{color:var(--muted);font-size:11px;line-height:1.7}\n.tw-search-upper small{font-size:8px;letter-spacing:.5px}\n.tw-radar{height:146px;width:146px;border:1px solid var(--accent);border-radius:50%;position:relative;overflow:hidden;background:linear-gradient(transparent calc(50% - .5px),var(--line) 50%,transparent calc(50% + .5px)),linear-gradient(90deg,transparent calc(50% - .5px),var(--line) 50%,transparent calc(50% + .5px))}\n.tw-radar-ring{position:absolute;inset:22%;border:1px solid var(--line);border-radius:50%}.tw-radar-ring:after{content:'';position:absolute;inset:24%;border:1px dashed var(--line);border-radius:50%}\n.tw-radar-sweep{position:absolute;inset:0;background:conic-gradient(transparent 250deg,var(--accent-soft) 335deg,var(--accent) 359deg,transparent 0deg);opacity:.6;animation:tw-radar-turn 5s linear infinite}\n.tw-radar>b{position:absolute;left:calc(50% - 4px);top:calc(50% - 10px);font-size:16px;font-weight:400;color:var(--accent)}\n.tw-radar>span{position:absolute;width:5px;height:5px;background:var(--accent);box-shadow:0 0 0 4px var(--accent-soft);animation:tw-blink 3s steps(3,end) infinite}\n.tw-search-results{display:flex;flex-direction:column;gap:9px}.tw-window .tw-document-tile{display:flex;gap:15px;padding:11px 15px}.tw-document-icon{font-size:25px;color:var(--accent);padding-top:7px}.tw-document-tile p{margin-top:3px}\n/* CODE & MATH — text remains selectable and tied to its original node. */\n.tw-code-board{border:1px solid var(--line);margin-top:5px;background:var(--panel);box-shadow:5px 5px 0 var(--shadow)}\n.tw-code-bar,.tw-code-bottom{display:flex;justify-content:space-between;gap:12px;padding:10px 13px;font-size:9px;color:var(--accent);border-bottom:1px solid var(--line);background:var(--accent-soft)}\n.tw-window .tw-code-source{width:100%;display:block;padding:10px 0 22px;background:transparent;border:0;text-align:left;overflow:hidden}\n.tw-code-lines>div{display:grid;grid-template-columns:42px 1fr;min-height:25px}.tw-code-lines>div:nth-child(even){background:var(--grid)}\n.tw-code-lines>div>span{font-size:10px;padding:3px 9px;color:var(--muted);border-right:1px solid var(--line)}\n.tw-code-lines code{font:12px/1.8 Consolas,'Microsoft YaHei',monospace;white-space:pre-wrap;overflow-wrap:anywhere;padding:1px 14px;color:var(--ink)}\n.tw-code-bottom{border-top:1px solid var(--line);border-bottom:0;background:transparent;padding:6px 12px}.tw-code-cursor{animation:tw-blink 1s steps(2,end) infinite}.tw-code-board>.tw-scene-footnote{padding:0 13px 8px}\n.tw-math-board{position:relative;padding:22px 15px 10px;background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);background-size:24px 24px;border:1px solid var(--line)}\n.tw-math-watermark{position:absolute;font:160px Georgia,serif;right:10px;top:0;color:var(--line);opacity:.3;pointer-events:none}\n.tw-math-title{font-size:9px;letter-spacing:2px;margin-bottom:25px;color:var(--accent)}\n.tw-window .tw-equation{background:transparent;box-shadow:none;border:0;border-left:2px solid var(--accent);margin:18px 0 25px;padding:10px 16px;min-height:80px}\n.tw-equation pre{font:19px/1.6 Consolas,'Microsoft YaHei',monospace;white-space:pre-wrap;overflow-wrap:anywhere;margin:12px 0}\n/* EXECUTE — discrete activity cells; no percentage implied. */\n.tw-exec-bus{display:flex;align-items:center;gap:12px;padding:22px 4px 28px;font-size:10px;color:var(--accent)}\n.tw-exec-bus i{flex:1;height:1px;background:var(--line);position:relative}.tw-exec-bus i:after{content:'';position:absolute;width:6px;height:6px;top:-2px;background:var(--accent);animation:tw-bus-packet 2s steps(16,end) infinite}\n.tw-window .tw-exec-card{margin-bottom:14px;padding:15px 17px}.tw-exec-heading{display:flex;justify-content:space-between;gap:12px;align-items:center}.tw-exec-heading strong{font-weight:400;color:var(--accent);font-size:15px}.tw-exec-heading>span{font-size:10px}\n.tw-exec-meter{display:flex;gap:3px;margin:17px 0}.tw-exec-meter i{height:12px;flex:1;min-width:0;border:1px solid var(--line)}\n.tw-exec-running .tw-exec-meter i{background:var(--accent-soft);animation:tw-exec-cell 1.8s steps(3,end) infinite;animation-delay:calc(var(--cell)*45ms)}\n.tw-exec-done .tw-exec-meter i{background:var(--accent-soft);border-color:var(--accent)}.tw-exec-error .tw-exec-meter i{background:var(--danger);opacity:.4}.tw-exec-stopped .tw-exec-meter i{background:var(--line)}\n.tw-exec-card pre{font:11px/1.8 Consolas,'Microsoft YaHei',monospace;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--muted);margin:0}\n/* CHECK, REVISE, RESPONSE — registers, split drafts and paper assembly. */\n.tw-check-heading{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid var(--accent);padding:9px 0 14px;margin-bottom:5px;font-size:10px;color:var(--accent)}\n.tw-check-heading b{font-size:29px;font-weight:400}\n.tw-window .tw-check-row{display:flex;gap:15px;border:0;border-bottom:1px dotted var(--line);box-shadow:none;background:transparent;padding:15px 4px}\n.tw-check-box{border:1px solid var(--accent);width:24px;height:24px;line-height:22px;text-align:center;flex:none;color:var(--accent);font-size:17px;margin-top:3px}\n.tw-check-row p{margin:0 0 5px}.tw-check-row small{font-size:8px}\n.tw-revise-banner{display:flex;gap:17px;align-items:center;background:repeating-linear-gradient(135deg,var(--accent-soft) 0px,var(--accent-soft) 3px,transparent 3px,transparent 8px);border:1px solid var(--line);padding:20px;margin:4px 0 20px}\n.tw-revise-banner>span{font-size:43px;color:var(--accent)}.tw-revise-banner h3{font-size:18px;font-weight:400;margin:6px 0 0}.tw-revise-columns{display:grid;grid-template-columns:1fr 1fr;gap:16px}.tw-revise-columns h4{font-weight:400;font-size:11px;color:var(--accent);border-bottom:1px solid var(--line);padding-bottom:8px;margin:0 0 10px}.tw-revise-columns .tw-scene-tile{margin-bottom:10px}.tw-revise-columns .tw-scene-placeholder{margin:0}\n.tw-answer-stamp{border:1px solid var(--accent);font-size:9px;padding:5px 10px;width:max-content;margin:3px 0 15px;color:var(--accent);letter-spacing:1px}\n.tw-window .tw-answer-page{padding:23px;background:var(--panel);border-color:var(--accent);box-shadow:4px 4px 0 var(--paper),5px 5px 0 var(--line),8px 8px 0 var(--paper),9px 9px 0 var(--line);margin-bottom:28px}\n.tw-answer-page p{font-size:14px;line-height:1.95;margin-top:16px}.tw-answer-corner{position:absolute;right:14px;top:12px;color:var(--accent);font-size:18px}.tw-answer-evidence{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.tw-answer-evidence .tw-scene-tile{padding:10px}.tw-answer-evidence p{font-size:10px;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}\n@keyframes tw-scene-enter{from{opacity:.2;transform:translateY(9px)}to{opacity:1;transform:none}}\n@keyframes tw-shutter{0%{opacity:.65;clip-path:inset(0 0 0 0)}100%{opacity:0;clip-path:inset(100% 0 0 0)}}\n@keyframes tw-tile-enter{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:none}}\n@keyframes tw-branch-draw{from{clip-path:inset(0 50%)}to{clip-path:inset(0 0)}}\n@keyframes tw-radar-turn{to{transform:rotate(360deg)}}\n@keyframes tw-orbit-drift{50%{transform:rotate(10deg)}100%{transform:rotate(0deg)}}\n@keyframes tw-step-flow{50%{transform:translateY(3px);opacity:.4}}\n@keyframes tw-bus-packet{from{left:0;opacity:.3}to{left:calc(100% - 6px);opacity:1}}\n@keyframes tw-exec-cell{0%,70%,100%{background:var(--accent-soft)}35%{background:var(--accent)}}\n.tw-window[data-motion=calm] :is(.tw-radar-sweep,.tw-radar>span,.tw-exec-bus i:after,.tw-exec-meter i,.tw-code-cursor,.tw-tape-live){animation:none}\n.tw-window[data-motion=calm] .tw-scene-shutter{display:none}.tw-window[data-motion=calm] .tw-scene-stage{animation:tw-wire-in .2s ease-out both}\n.tw-window[data-motion=calm] .tw-scene-tile{animation-delay:0s;animation-duration:.2s;transition:none}\n.tw-no-motion,.tw-no-motion *,.tw-no-motion *:before,.tw-no-motion *:after{animation:none!important;transition:none!important;scroll-behavior:auto!important}\n.tw-no-motion .tw-scene-shutter{display:none}\n.tw-stacked .tw-appearance{padding:3px 14px}.tw-stacked .tw-map-toolbar{padding:5px 14px;gap:8px}\n.tw-stacked .tw-director-bar{padding:5px 14px}.tw-stacked .tw-scene-heading{padding:3px 14px 9px;gap:10px}.tw-stacked .tw-scene-heading h2{font-size:15px}.tw-stacked .tw-scene-symbol{font-size:22px}.tw-stacked .tw-scene-heading small{font-size:7px}.tw-stacked .tw-scene-reason{display:none}\n.tw-stacked .tw-scene-viewport{padding:0 14px 8px}.tw-stacked .tw-scene-tape{padding:4px 14px}.tw-stacked .tw-adaptive{min-height:85px}.tw-stacked .tw-orbit-art{display:none}.tw-stacked .tw-atlas-center{margin-bottom:15px}.tw-stacked .tw-atlas-center strong{font-size:12px}.tw-stacked .tw-scene-footnote{margin-top:8px}\n@media(max-width:480px){.tw-map-toolbar>span:first-child{display:none}.tw-map-toolbar{justify-content:space-between}.tw-appearance{gap:5px}.tw-appearance label{font-size:8px}.tw-branch-grid,.tw-revise-columns{grid-template-columns:1fr}.tw-search-upper{grid-template-columns:96px 1fr;gap:14px}.tw-radar{width:96px;height:96px}.tw-search-upper h3{font-size:14px}.tw-answer-evidence{grid-template-columns:1fr}.tw-director-bar{font-size:8px}.tw-atlas-grid{grid-template-columns:1fr}}\n@media(prefers-reduced-motion:reduce){.tw-window,.tw-window *,.tw-window *:before,.tw-window *:after{animation:none!important;transition:none!important;scroll-behavior:auto!important}.tw-scene-shutter{display:none}}\n\n/* Live, event-driven interpretation of the reference PV's continuity grammar. */\n.tw-native-shell{padding-left:0!important;padding-right:var(--tw-panel-width)!important}\n.tw-native-shell>.tw-mount{inset:0 0 0 auto;border-right:0;border-left:1px solid #8e899880}\n.tw-native-shell.tw-stacked{padding-right:0!important}\n.tw-native-shell.tw-stacked>.tw-mount{order:5;height:45%;border-left:0;border-bottom:0;border-top:1px solid #8e899880;inset:auto;width:100%}\n.tw-divider{position:absolute;top:0;bottom:0;right:calc(var(--tw-panel-width) - 5px);width:10px;z-index:8;cursor:col-resize;touch-action:none;outline-offset:-3px}\n.tw-divider:before{content:'';position:absolute;top:calc(50% - 18px);left:3px;width:3px;height:36px;border:1px solid #8c87a4;background:#aaa4bc55;border-radius:2px;transition:height .2s,background .2s}\n.tw-divider:hover:before,.tw-divider:focus-visible:before,.tw-resizing .tw-divider:before{height:54px;background:#a49ac6}\n.tw-divider:focus-visible{outline:2px solid #8e85bf}.tw-stacked>.tw-divider{display:none}.tw-resizing{user-select:none;cursor:col-resize}\n.tw-window{container:thought / inline-size;--secondary:#c4ae84;font-size:12px}\n.tw-titlebar{padding:13px 19px;min-height:48px}.tw-titlebar strong{font-size:13px;letter-spacing:1px}.tw-titlebar small{font-size:9px;margin-left:12px}.tw-title-actions{gap:9px}\n.tw-ribbon{padding:8px 19px 10px;font-size:9px;letter-spacing:1.2px}\n.tw-summary{display:none!important}.tw-map-toolbar{padding:8px 19px;gap:12px}.tw-map-toolbar>span:first-child{font-size:9px}.tw-view-switch button{font-size:11px;padding:2px 8px}\n.tw-appearance{padding:9px 19px;background:var(--panel);animation:tw-settings-in .2s ease-out}.tw-appearance select{font-size:11px}\n.tw-controls{padding:8px 19px 9px;border-top:1px solid var(--line)}.tw-timeline{height:9px;margin:3px 0 7px}.tw-timeline-label{font-size:8px}.tw-playbar button,.tw-playbar select{font-size:10px;padding:3px 8px}.tw-disclosure{font-size:8px;letter-spacing:.3px;margin-top:7px}\n.tw-director-bar{padding:10px 19px 5px;font-size:8px;letter-spacing:.7px}.tw-director-bar select{font-size:10px}\n.tw-scene-heading{padding:9px 24px 17px;gap:12px}.tw-scene-heading h2{font-size:22px;letter-spacing:1.2px}.tw-scene-heading small{letter-spacing:2px;font-size:8px}.tw-scene-symbol{font-size:27px}.tw-scene-reason{font-size:8px}\n.tw-scene-viewport{padding:0 22px 16px;background-size:16px 16px;position:relative}\n.tw-scene-tape{padding:6px 19px}.tw-scene-tape button{font-size:9px}\n.tw-window button,.tw-window select,.tw-film-figure,.tw-scene-heading,.tw-controls{transition:background-color .42s ease,color .42s ease,border-color .42s ease}\n.tw-window .tw-scene-tile{animation:tw-film-item .38s cubic-bezier(.22,.72,.18,1) both;animation-delay:calc(var(--order,0)*35ms);border-width:0 0 1px;box-shadow:none;background:transparent;padding:11px 13px;transition:background-color .3s,color .3s,border-color .3s}\n.tw-window .tw-scene-tile:hover{transform:none;background:var(--accent-soft)}.tw-scene-tile p{font-size:12px;line-height:1.8}.tw-scene-tile small,.tw-tile-label{font-size:8px}\n.tw-continuity-stage{position:relative;isolation:isolate;min-height:100%;perspective:1000px;overflow:hidden}\n.tw-shot-in{position:relative;z-index:2;transform-origin:50% 120px;min-width:0}\n.tw-shot-out{position:absolute;inset:0;z-index:1;pointer-events:none;overflow:hidden;transform-origin:50% 120px;max-height:100%}\n.tw-shot-out *{pointer-events:none!important;animation-play-state:paused!important}\n.tw-flight-field{position:absolute;z-index:4;left:0;top:30px;width:100%;height:auto;aspect-ratio:640/300;pointer-events:none;overflow:visible}\n.tw-flight-pixel{fill:var(--accent);opacity:0;will-change:transform,opacity;font:10px Consolas,monospace}\n.tw-flight-pixel:nth-child(3n){fill:var(--secondary)}.tw-flight-carrier{fill:var(--accent);opacity:0}.tw-carrier-halo{fill:none;stroke:var(--accent);stroke-opacity:.4;stroke-width:1}\n.tw-film-figure{position:relative;margin:0 0 18px;border:1px solid var(--line);background:var(--panel);overflow:hidden}\n.tw-film-figure:before,.tw-film-figure:after{content:'';position:absolute;inset:0;z-index:1;pointer-events:none;background:linear-gradient(var(--accent),var(--accent)) left top/11px 1px no-repeat,linear-gradient(var(--accent),var(--accent)) left top/1px 11px no-repeat,linear-gradient(var(--accent),var(--accent)) right top/11px 1px no-repeat,linear-gradient(var(--accent),var(--accent)) right top/1px 11px no-repeat}\n.tw-film-figure:after{transform:scaleY(-1)}\n.tw-figure-register{display:flex;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--line);font-size:8px;letter-spacing:1.3px;color:var(--muted)}\n.tw-film-figure svg{display:block;width:100%;height:auto;max-height:330px;aspect-ratio:640/300;overflow:hidden}\n.tw-film-figure figcaption{display:flex;align-items:flex-start;gap:8px;padding:10px 12px;border-top:1px solid var(--line);font-size:11px;line-height:1.65;color:var(--ink);background:var(--accent-soft);min-height:39px}\n.tw-caption-cell{width:5px;height:12px;flex:none;background:var(--accent);margin-top:3px;animation:tw-caption-breathe 2.5s ease-in-out infinite}\n.tw-ambient-points{fill:var(--accent);opacity:.16}.tw-pixel-word{fill:var(--accent)}\n.tw-figure-node{cursor:pointer;outline:none}.tw-figure-node>rect:first-of-type{fill:var(--paper);stroke:var(--line);stroke-width:1;transition:fill .3s,stroke .3s}.tw-figure-node:hover>rect:first-of-type,.tw-figure-node:focus-visible>rect:first-of-type{fill:var(--accent-soft);stroke:var(--accent)}\n.tw-figure-node:focus-visible{filter:drop-shadow(0 0 2px var(--accent))}.tw-figure-dot{fill:var(--accent)}\n.tw-svg-label{fill:var(--ink);font:12px Consolas,'Microsoft YaHei',monospace}.tw-svg-meta{fill:var(--muted);font:9px Consolas,'Microsoft YaHei',monospace;letter-spacing:.4px}\n.tw-diagram-path{fill:none;stroke:var(--accent);stroke-width:1;stroke-opacity:.65;stroke-dasharray:1;stroke-dashoffset:0;animation:tw-diagram-draw 1s cubic-bezier(.22,.72,.18,1) both}\n.tw-grid-line{fill:none;stroke:var(--line);stroke-width:1;stroke-opacity:.55;stroke-dasharray:2 5}\n.tw-river-glyph{fill:var(--ink);font:12px Consolas,'Microsoft YaHei',monospace;animation:tw-river-float 6s ease-in-out infinite;animation-delay:var(--delay);opacity:.8}\n.tw-river-glyph:nth-child(3n){fill:var(--accent)}.tw-river-glyph:nth-child(4n){fill:var(--secondary)}\n.tw-focus-cell{fill:var(--accent);animation:tw-caption-breathe 2.4s ease-in-out infinite;filter:drop-shadow(0 0 3px var(--accent))}\n.tw-map-ring{fill:none;stroke:var(--accent);stroke-width:1;stroke-opacity:.45;stroke-dasharray:2 4}\n.tw-radar-wedge{fill:var(--accent-soft);stroke:var(--accent);stroke-width:.5;opacity:.55}.tw-orbital-scan{transform-origin:320px 150px;animation:tw-radar-turn 9s linear infinite}\n.tw-bus-dot{fill:var(--secondary);animation:tw-bus-travel 3s cubic-bezier(.45,0,.55,1) infinite}\n.tw-sigma{fill:var(--accent);opacity:.24;font:110px Georgia,serif}.tw-svg-equation{fill:var(--ink);font:16px Consolas,'Microsoft YaHei',monospace}\n.tw-formula-line{cursor:pointer}.tw-formula-line:hover .tw-svg-equation{fill:var(--accent)}\n.tw-register-box{stroke:var(--accent);fill:var(--accent-soft);stroke-width:1}.tw-register-line{animation:tw-film-item .4s ease-out both;animation-delay:calc(var(--order)*60ms);cursor:pointer}.tw-register-line:hover .tw-svg-label{fill:var(--accent)}\n.tw-revision-arrow{fill:none;stroke:var(--accent);stroke-width:2}.tw-revision-before{stroke:var(--danger);stroke-width:1;stroke-dasharray:3 4;fill:none;opacity:.65}.tw-revision-after{stroke:var(--accent);stroke-width:1;fill:var(--accent-soft)}.tw-redline{stroke:var(--danger);stroke-width:1.5;stroke-dasharray:206;animation:tw-redline-draw .6s ease-out both}\n.tw-paper-layer{fill:var(--paper);stroke:var(--line)}.tw-paper-layer:last-of-type{fill:var(--panel);stroke:var(--accent)}.tw-compose-line{stroke:var(--accent);stroke-width:1;stroke-dasharray:180;animation:tw-redline-draw .7s ease-out both;animation-delay:calc(var(--order)*80ms)}\n.tw-source-module{fill:var(--accent-soft);stroke:var(--line)}\n.tw-film-detail{position:relative;padding:0 1px}.tw-film-detail:before{content:'SOURCE / 原文片段';display:block;color:var(--muted);font-size:8px;letter-spacing:1px;padding:0 0 7px;border-bottom:1px solid var(--line);margin-bottom:3px}\n.tw-film-detail .tw-orbit-art,.tw-film-detail .tw-atlas-center,.tw-film-detail .tw-scene-command,.tw-film-detail .tw-branch-root,.tw-film-detail .tw-branch-lines,.tw-film-detail .tw-search-upper,.tw-film-detail .tw-exec-bus,.tw-film-detail .tw-revise-banner,.tw-film-detail .tw-check-heading,.tw-film-detail .tw-math-title,.tw-film-detail .tw-math-watermark{display:none}\n.tw-film-detail .tw-atlas{padding-top:0}.tw-film-detail .tw-atlas-grid{gap:8px}.tw-film-detail .tw-atlas-grid .tw-scene-tile:nth-child(even){border-top:0}\n.tw-film-detail .tw-branch-card{min-height:0;border:1px solid var(--line);padding:13px 15px}.tw-film-detail .tw-branch-symbol{font-size:15px;position:absolute;right:11px;top:12px;margin:0}.tw-film-detail .tw-branch-card h3{font-size:13px}.tw-film-detail .tw-branch-card p{min-height:0;font-size:12px}.tw-film-detail .tw-branch-card small{margin-top:10px;font-size:8px}\n.tw-film-detail .tw-plan-step{padding-bottom:13px;grid-template-columns:28px 1fr}.tw-film-detail .tw-step-number{font-size:16px}.tw-film-detail .tw-plan-step .tw-scene-tile{padding-top:5px}.tw-film-detail .tw-step-connector{display:none}\n.tw-film-detail .tw-document-tile{gap:10px;padding:8px 10px}.tw-film-detail .tw-document-icon{font-size:18px}\n.tw-film-detail .tw-code-board{border-color:var(--line);box-shadow:none;margin-top:10px}.tw-film-detail .tw-code-lines code{font-size:12px}.tw-film-detail .tw-code-bar{padding:7px 13px}\n.tw-film-detail .tw-math-board{border:0;padding:0;background:none}.tw-film-detail .tw-equation{min-height:0;margin:10px 0;padding:8px 14px}.tw-film-detail .tw-equation pre{font-size:16px;margin:7px 0}\n.tw-film-detail .tw-exec-card{padding:10px 12px}.tw-film-detail .tw-exec-meter{margin:12px 0}.tw-film-detail .tw-exec-meter i{height:7px}\n.tw-film-detail .tw-check-row{padding:11px 7px}.tw-film-detail .tw-check-box{width:18px;height:18px;line-height:16px;font-size:12px}\n.tw-film-detail .tw-revise-columns{padding-top:10px}.tw-film-detail .tw-answer-stamp{margin-top:12px}.tw-film-detail .tw-answer-page{padding:16px}.tw-film-detail .tw-answer-page p{font-size:13px}\n.tw-film-detail .tw-scene-footnote{font-size:8px;margin-top:9px;line-height:1.6}\n.tw-film-shot[data-shot=code] .tw-film-figure svg{max-height:180px}.tw-film-shot[data-shot=math] .tw-film-figure{background:linear-gradient(var(--panel),var(--paper))}\n.tw-film-shot[data-shot=execute] .tw-film-figure{border-color:var(--accent)}.tw-film-shot[data-shot=revise] .tw-figure-register{border-bottom-color:var(--danger)}\n.tw-film-shot[data-shot=summary] .tw-film-figure{background:var(--paper)}\n.tw-theme-paper{--secondary:#708baa}.tw-theme-night{--secondary:#c1a579}.tw-theme-amber{--secondary:#839dff}.tw-theme-phosphor{--secondary:#99b5fa}.tw-theme-violet{--secondary:#c8b180}.tw-theme-blueprint{--secondary:#edd2aa}\n@keyframes tw-settings-in{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}\n@keyframes tw-film-item{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}\n@keyframes tw-diagram-draw{from{stroke-dashoffset:1;stroke-opacity:.2}to{stroke-dashoffset:0;stroke-opacity:.65}}\n@keyframes tw-redline-draw{from{stroke-dashoffset:206}to{stroke-dashoffset:0}}\n@keyframes tw-caption-breathe{50%{opacity:.5}}\n@keyframes tw-river-float{50%{transform:translate(3px,-3px);opacity:.5}}\n@keyframes tw-bus-travel{from{transform:translateX(0);opacity:0}15%{opacity:1}85%{opacity:1}to{transform:translateX(560px);opacity:0}}\n.tw-window[data-motion=calm] :is(.tw-river-glyph,.tw-focus-cell,.tw-orbital-scan,.tw-bus-dot,.tw-caption-cell){animation:none}\n.tw-stacked .tw-titlebar{padding:8px 14px;min-height:36px}.tw-stacked .tw-director-bar{padding:5px 14px}.tw-stacked .tw-scene-heading{padding:4px 14px 8px}.tw-stacked .tw-scene-heading h2{font-size:15px}.tw-stacked .tw-film-figure svg{max-height:120px}.tw-stacked .tw-figure-register{padding:4px 9px;font-size:7px}.tw-stacked .tw-film-figure figcaption{font-size:10px;padding:6px 9px;min-height:0}.tw-stacked .tw-scene-viewport{padding:0 13px 10px}.tw-stacked .tw-scene-tape{padding:4px 13px}.tw-stacked .tw-controls{padding:5px 13px}.tw-stacked .tw-flight-field{max-height:120px;top:20px}.tw-stacked .tw-source{inset:39px 8px 58px}\n@container thought (max-width:530px){.tw-titlebar small{display:none}.tw-map-toolbar>span:first-child{display:none}.tw-map-toolbar{justify-content:space-between}.tw-map-toolbar label{font-size:10px}.tw-branch-grid,.tw-revise-columns{grid-template-columns:1fr}.tw-scene-heading h2{font-size:19px}.tw-scene-reason{max-width:26%;font-size:7px}.tw-ribbon{font-size:8px}.tw-scene-viewport{padding-left:13px;padding-right:13px}.tw-film-figure figcaption{font-size:10px}.tw-atlas-grid{grid-template-columns:1fr}.tw-figure-register{font-size:7px}.tw-titlebar strong{font-size:11px}.tw-answer-evidence{grid-template-columns:1fr}.tw-film-figure .tw-svg-meta{font-size:10px}}\n.tw-no-motion *,.tw-no-motion *:before,.tw-no-motion *:after{animation:none!important;transition:none!important}\n@media(prefers-reduced-motion:reduce){.tw-window *,.tw-window *:before,.tw-window *:after{animation:none!important;transition:none!important}}\n\n/* DSH 0.1.5: theme the native surfaces as well as the plugin. DSW-specific\n   tokens are separate from its aliases; leaving them inherited mixes dark\n   bubbles/inputs with light text tokens. Do not toggle the host preference. */\n.tw-native-paper{--paper:#f2efe5;--panel:#f8f5ed;--ink:#36363f;--muted:#737078;--line:#cecbd1;--accent:#7972ae;--accent-soft:#e6e2f0;--good:#688b7d;--danger:#b46966;color-scheme:light}\n.tw-native-night{--paper:#101724;--panel:#151f32;--ink:#c8d6ea;--muted:#a1b1cc;--line:#344252;--accent:#7894ff;--accent-soft:#233152;--good:#9ebad3;--danger:#ff8b83;color-scheme:dark}\nbody.tw-host-theme.tw-host-theme,.tw-native-shell{\n  --dsw-font-family:Consolas,'SFMono-Regular','Microsoft YaHei',monospace;\n  --dsw-alias-bg-base:var(--paper);--dsw-alias-bg-layer-1:var(--panel);--dsw-alias-bg-layer-2:var(--panel);--dsw-alias-bg-layer-3:var(--panel);--dsw-alias-bg-module-platform:var(--panel);\n  --dsw-alias-label-primary:var(--ink);--dsw-alias-label-primary-bluish:var(--ink);--dsw-alias-label-primary-dimmed:var(--ink);--dsw-alias-label-secondary:var(--muted);--dsw-alias-label-tertiary:var(--muted);--dsw-alias-label-caption:var(--muted);--dsw-alias-label-dimmed:var(--muted);--dsw-alias-label-primary-inverted:var(--paper);--dsw-alias-label-primary-foreground:var(--paper);\n  --dsw-alias-border-l1:var(--line);--dsw-alias-border-l2:var(--line);--dsw-alias-border-l3:var(--line);--dsw-alias-border-l4:var(--line);\n  --dsw-alias-brand-primary:var(--accent);--dsw-alias-state-business-primary:var(--accent);--dsw-alias-link:var(--accent);\n  --dsw-alias-button-primary-fill:var(--accent);--dsw-alias-button-primary-hover:var(--accent);--dsw-alias-button-primary-disabled-fill:var(--line);--dsw-alias-button-info-fill:var(--accent);--dsw-alias-button-info-hover:var(--accent);\n  --dsw-alias-button-elevated-fill:var(--panel);--dsw-alias-button-floating-fill:var(--panel);--dsw-alias-button-floating-hover:var(--accent-soft);--dsw-alias-button-ghost-active-hover:var(--accent-soft);--dsw-alias-button-primary-dimmed:var(--line);--dsw-alias-button-tool-bar-fill-invisible:transparent;--dsw-alias-interactive-bg-hover-accent:var(--accent-soft);\n  --dsw-alias-button-contrast-fill:var(--ink);--dsw-alias-button-tool-bar-fill:var(--panel);--dsw-alias-button-tool-bar-hover:var(--accent-soft);--dsw-alias-button-ghost-active-fill:var(--accent-soft);--dsw-alias-button-ghost-active-border:var(--accent);\n  --dsw-alias-interactive-bg-hover:var(--accent-soft);--dsw-alias-interactive-bg-hover-solid:var(--accent-soft);--dsw-alias-interactive-bg-active:var(--accent-soft);\n  --dsw-alias-markdown-inline-code:var(--accent-soft);--dsw-alias-markdown-code-block:var(--panel);--dsw-alias-markdown-code-block-banner:var(--accent-soft);--dsw-alias-markdown-table-head:var(--accent-soft);--dsw-alias-markdown-tag:var(--accent-soft);\n  --dsw-alias-scrollbar-bg-l1:var(--line);--dsw-alias-scrollbar-bg-l2:var(--line);--dsw-alias-scrollbar-hover-l1:var(--muted);--dsw-alias-scrollbar-hover-l2:var(--muted);\n  --dsw-specific-bubble:var(--accent-soft);--dsw-specific-bubble-highlight:var(--line);--dsw-specific-input-major:var(--panel);--dsw-specific-login-input:var(--panel);--dsw-specific-menu:var(--panel);--dsw-specific-selector:var(--accent-soft);--dsw-specific-tip:var(--accent-soft);\n  --dsw-specific-sidebar-fill:var(--paper);--dsw-specific-sidebar-nav-item-active-accent:var(--accent-soft);--dsw-specific-sidebar-nav-item-active:var(--accent-soft);--dsw-specific-sidebar-nav-item-hover:var(--panel);\n  --dsw-hovercard-bg:var(--panel);--dsw-elevation-stroke-color:var(--line);--dsw-alias-tooltip-bg:var(--ink);\n  --dsw-linear-gradient-think:linear-gradient(180deg,var(--paper),transparent);--dsw-linear-think-select:linear-gradient(180deg,var(--accent-soft),transparent);\n  --shiki-token-constant:var(--accent);--shiki-token-string:var(--good);--shiki-token-comment:var(--muted);--shiki-token-keyword:var(--accent);--shiki-token-parameter:var(--ink);--shiki-token-function:var(--accent);--shiki-token-string-expression:var(--good);--shiki-token-punctuation:var(--ink);--shiki-token-link:var(--accent);\n}\nbody.tw-host-theme.tw-native-paper,.tw-native-shell.tw-native-paper{--shiki-token-string:#3c725c;--shiki-token-string-expression:#3c725c;--shiki-token-keyword:#74609e;--shiki-token-function:#74609e;--shiki-token-constant:#586e9a}\nbody.tw-host-theme,.tw-native-shell{background:var(--paper)!important;color:var(--ink)!important}\n.tw-native-shell{font-family:var(--dsw-font-family);--dsh-content-font-size:14px;--dsh-content-font-size-secondary:12px}\n.tw-native-shell [data-composer-card]{background:var(--panel)!important;color:var(--ink);border-radius:2px!important;box-shadow:3px 3px 0 color-mix(in srgb,var(--accent) 12%,transparent)!important}\n.tw-native-shell [data-composer-card] :is(textarea,[contenteditable=true]){color:var(--ink);caret-color:var(--accent)}\n.tw-native-shell [data-composer-card] textarea::placeholder{color:var(--muted);opacity:1}\n.tw-native-shell [data-conversation-scroll] [class*=\"_bubble\"]{border-radius:2px;border:1px solid var(--line);padding:12px 16px}\n.tw-native-shell [data-conversation-scroll] [class*=\"_fileCard\"]{border-radius:3px}\n.tw-native-shell [data-conversation-scroll]{scrollbar-color:var(--line) transparent}\n.tw-host-theme [data-slot=sidebar]{font-family:var(--dsw-font-family)}\n.tw-host-theme [data-slot=sidebar] button{border-radius:3px}\n.tw-host-theme [data-slot=sidebar] [aria-current]{box-shadow:inset 2px 0 var(--accent)}\n.tw-native-shell>.tw-mount{border-color:var(--line);overflow-anchor:none}\n.tw-native-shell>.tw-divider:before{border-color:var(--accent);background:var(--accent-soft)}\n.tw-native-shell .tw-launch[aria-pressed=true]{color:var(--accent);background:var(--accent-soft);border-color:var(--accent)}\n/* Keep the full composition in view. Streaming a long answer must not anchor\n   the scene scroller to the source text and push the pixel heading off-screen. */\n.tw-scene-viewport{overflow:hidden;overflow-anchor:none;container:scene / size}\n.tw-continuity-stage,.tw-shot-in,.tw-film-shot{height:100%;min-height:0}\n.tw-film-shot{display:flex;flex-direction:column}\n.tw-film-figure{flex:none;margin-bottom:14px}\n.tw-film-figure svg{height:clamp(90px,45cqh,330px);max-height:none;aspect-ratio:auto}\n.tw-film-shot[data-shot=code] .tw-film-figure svg{height:clamp(80px,32cqh,180px);max-height:none}\n.tw-film-figure figcaption{max-height:66px;overflow:hidden}\n.tw-caption-text{min-width:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}\n.tw-film-detail{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;overflow-anchor:none;scrollbar-width:thin;scrollbar-color:var(--line) transparent;padding-right:5px}\n.tw-film-detail:before{position:sticky;top:0;background:var(--paper);z-index:3;padding-top:2px}\n.tw-stacked .tw-film-figure{margin-bottom:6px}\n.tw-stacked .tw-film-figure svg,.tw-stacked .tw-film-shot[data-shot=code] .tw-film-figure svg{height:clamp(32px,35cqh,90px);max-height:none}\n.tw-stacked .tw-film-figure figcaption{max-height:28px;min-height:0;white-space:nowrap;text-overflow:ellipsis;display:block}\n.tw-stacked .tw-caption-cell{display:none}\n\n/* Fixed chrome + persistent source objects: the reference PV's layered layout,\n   driven here by observed events and a reading clock rather than song time. */\n.tw-theme-obsidian,.tw-native-obsidian{--paper:#070b14;--panel:#0c1320;--ink:#d5dfed;--muted:#8e9bb0;--line:#3d4b62;--accent:#98aafa;--accent-soft:#18243e;--good:#96c4b4;--danger:#f07470;--grid:#91a6c715;--shadow:#0006;--secondary:#d9b878;color-scheme:dark}\n.tw-layout-process .tw-ribbon,.tw-layout-process .tw-note,.tw-layout-process .tw-summary{display:none!important}\n.tw-layout-process .tw-titlebar{border-bottom-color:var(--line);padding:12px 18px;min-height:44px}\n.tw-layout-process .tw-titlebar strong{letter-spacing:1.8px;font-size:12px}\n.tw-layout-process .tw-map-toolbar{border-top:0;padding:7px 18px}\n.tw-layout-process .tw-controls{padding:6px 18px}\n.tw-layout-process .tw-disclosure{margin-bottom:0}\n.tw-process{flex:1;min-height:0;display:flex;flex-direction:column;padding:0 16px;gap:13px;overflow:hidden;font-size:12px;line-height:1.6}\n.tw-process-strip{display:flex;align-items:center;gap:14px;min-height:34px;border-bottom:1px solid var(--line);flex:none;font-size:10px;color:var(--accent);letter-spacing:.8px}\n.tw-process-strip>span{white-space:nowrap;flex:none}.tw-process-strip>span:last-child{font-size:10px;margin-left:auto;color:var(--muted)}.tw-process-strip svg{flex:1;min-width:32px;width:120px;height:22px;opacity:.7}\n.tw-process-strip .tw-process-error{color:var(--danger)!important}\n.tw-process-deck{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 104px;gap:14px}\n.tw-inset-frame{position:relative;border:1px solid var(--line);min-width:0}\n.tw-inset-frame:before{content:'';position:absolute;inset:-1px;pointer-events:none;z-index:4;background:linear-gradient(var(--ink),var(--ink)) left top/9px 2px no-repeat,linear-gradient(var(--ink),var(--ink)) left top/2px 9px no-repeat,linear-gradient(var(--ink),var(--ink)) right top/9px 2px no-repeat,linear-gradient(var(--ink),var(--ink)) right top/2px 9px no-repeat,linear-gradient(var(--ink),var(--ink)) left bottom/9px 2px no-repeat,linear-gradient(var(--ink),var(--ink)) right bottom/9px 2px no-repeat}\n.tw-frame-caption{display:flex;align-items:center;justify-content:space-between;gap:8px;position:relative;font-size:10px;line-height:1.4;flex:none;margin:-8px 11px 0;min-height:16px;color:var(--ink)}\n.tw-frame-caption>span,.tw-frame-caption>small{background:var(--paper);padding:0 5px}.tw-frame-caption small{font-size:8px;color:var(--muted)}\n.tw-process-main{display:flex;flex-direction:column;min-height:0}\n.tw-process-topic{margin:14px 16px 10px;padding:0 0 10px;border-bottom:1px dotted var(--line);flex:none}\n.tw-process-topic small{font-size:8px;color:var(--muted);letter-spacing:1.1px}.tw-process-topic p{font-size:12px;line-height:1.7;margin:4px 0 0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}\n.tw-process-focusline{display:flex;justify-content:space-between;gap:12px;font-size:10px;letter-spacing:.8px;color:var(--accent);margin:0 16px 12px;flex:none}\n.tw-process-focusline>span:last-child{color:var(--muted);font-size:9px;white-space:nowrap}\n.tw-process-board{flex:1;min-height:0;overflow:auto;padding:1px 16px 12px;scrollbar-width:thin;scrollbar-color:var(--line) transparent;overscroll-behavior:contain;overflow-anchor:none}\n.tw-process-cells{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-content:start;min-height:100%}\n.tw-window .tw-register-cell{position:relative;display:flex;flex-direction:column;min-width:0;min-height:116px;text-align:left;padding:12px 12px 9px;background:var(--panel);border:1px solid var(--line);color:var(--ink);cursor:pointer;transition:background-color 1.2s,border-color 1.2s,box-shadow 1.2s}\n.tw-window .tw-register-cell:hover{background:var(--accent-soft)}\n.tw-window .tw-register-cell.tw-reading-cell{border-color:var(--accent);background:var(--accent-soft);box-shadow:inset 3px 0 var(--accent),0 0 14px color-mix(in srgb,var(--accent) 6%,transparent)}\n.tw-register-cell:after{content:'';position:absolute;width:5px;height:5px;right:7px;bottom:7px;border:1px solid var(--line)}\n.tw-reading-cell:after{background:var(--accent);border-color:var(--accent)}\n.tw-cell-head{display:flex;align-items:center;gap:8px;color:var(--accent);font-size:9px;letter-spacing:.6px}.tw-cell-head>b{font-size:17px;line-height:1;font-weight:400}.tw-cell-head small{font-size:8px;color:var(--muted);margin-left:auto;white-space:nowrap}\n.tw-register-cell p{font-family:Consolas,'Microsoft YaHei',monospace;font-size:12px;line-height:1.85;margin:11px 0 13px;white-space:pre-wrap;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}\n.tw-cell-tail{margin-top:auto;display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:8px;color:var(--muted);padding-right:7px}.tw-cell-tail>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tw-cell-tail>span:last-child{white-space:nowrap}\n.tw-register-cell[data-status=error] .tw-cell-head{color:var(--danger)}\n.tw-process-stats{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:0 16px;padding:10px 0;border-top:1px solid var(--line);font-size:9px;color:var(--muted);flex:none}.tw-process-stats b{font-size:18px;color:var(--ink);font-weight:400}.tw-process-stats small{font-size:8px;white-space:nowrap}\n.tw-sequence-map{flex:none;margin:0 16px;padding:9px 0 3px;border-top:1px dotted var(--line);color:var(--muted)}\n.tw-sequence-map>div{display:flex;justify-content:space-between;gap:8px;font-size:8px;letter-spacing:.4px}.tw-sequence-map small{font-size:8px}.tw-sequence-map svg{display:block;width:100%;height:103px;overflow:visible;margin-top:3px}.tw-sequence-map text{font:8px Consolas,monospace;fill:var(--muted)}.tw-route-axis{stroke:var(--line);stroke-dasharray:1 6;stroke-width:.6}.tw-route-line{stroke:var(--accent);stroke-width:1;fill:none;opacity:.45}.tw-route-node{fill:var(--paper);stroke:var(--muted);stroke-width:1}.tw-route-node[data-status=error]{stroke:var(--danger)}.tw-route-marker{fill:var(--accent);stroke:var(--paper);stroke-width:1;pointer-events:none}.tw-sequence-map g[role=button]{cursor:pointer;outline:none}.tw-sequence-map g[role=button]:focus-visible .tw-route-node{stroke:var(--ink);stroke-width:3}\n.tw-ops{display:flex;flex-direction:column;min-height:0;padding:0 4px 7px}\n.tw-ops>.tw-frame-caption{display:table;background:var(--paper);padding:0 5px;color:var(--accent);margin-left:3px;margin-bottom:9px}\n.tw-ops nav{position:relative;flex:1;min-height:0;overflow:auto;scrollbar-width:none;overscroll-behavior:contain;overflow-anchor:none}\n.tw-window .tw-ops button{display:grid;grid-template-columns:19px 1fr;width:100%;text-align:left;padding:7px 5px;border:0;border-bottom:1px solid color-mix(in srgb,var(--line) 38%,transparent);background:transparent;font-size:9px;color:var(--muted)}\n.tw-ops button>b{font-weight:400;letter-spacing:.4px}.tw-ops button>small{font-size:8px;color:inherit}.tw-ops button>span{grid-column:2;font-size:8px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.tw-window .tw-ops button[aria-current=step]{background:var(--accent);color:var(--paper)}\n.tw-process-source{flex:none;height:116px;display:flex;flex-direction:column;margin-top:2px}\n.tw-process-source .tw-frame-caption>button{font-size:9px;padding:0 5px;line-height:1.6;background:var(--paper);border:0;color:var(--accent)}\n.tw-process-source-text{margin:10px 13px 9px;overflow:auto;min-height:0;white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.9;scrollbar-width:thin;scrollbar-color:var(--line) transparent;overscroll-behavior:contain}.tw-process-source-text>span{color:var(--accent);font-weight:bold}\n.tw-reading-controls{flex:none;display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding-bottom:9px;font-size:9px;color:var(--muted)}\n.tw-reading-controls button,.tw-reading-controls select{font-size:10px;padding:3px 7px;white-space:nowrap}.tw-reading-controls label{margin-left:5px}.tw-queue-status{margin-left:auto;font-size:9px}\n.tw-process-note{margin:0 0 7px;font-size:9px;color:var(--muted);flex:none}\n.tw-process-idle{display:grid;place-content:center;text-align:center;min-height:100%;color:var(--muted);font-size:12px}.tw-process-idle b{font-weight:400;font-size:48px;letter-spacing:10px;color:var(--accent)}\n.tw-process[data-form=pipeline] .tw-process-cells,.tw-process[data-form=checklist] .tw-process-cells,.tw-process[data-form=sources] .tw-process-cells{grid-template-columns:1fr;gap:11px;padding-left:11px}\n.tw-process[data-form=pipeline] .tw-register-cell,.tw-process[data-form=checklist] .tw-register-cell,.tw-process[data-form=sources] .tw-register-cell{min-height:76px;padding:10px 13px}\n.tw-process[data-form=pipeline] .tw-register-cell:not(:last-child):before{content:'';position:absolute;left:-10px;top:24px;width:9px;height:calc(100% + 12px);border-left:1px solid var(--accent);border-bottom:1px solid var(--accent);opacity:.45}\n.tw-process[data-form=pipeline] .tw-register-cell p,.tw-process[data-form=checklist] .tw-register-cell p,.tw-process[data-form=sources] .tw-register-cell p{margin:8px 0; -webkit-line-clamp:3}\n.tw-process[data-form=branches] .tw-register-cell{min-height:160px;border-top:2px solid var(--accent)}\n.tw-process[data-form=branches] .tw-register-cell p{-webkit-line-clamp:8}\n.tw-process[data-form=revision] .tw-register-cell[data-status=error]{border-color:var(--danger)}\n.tw-process-code{border-left:2px solid var(--accent);padding:12px 14px;background:var(--panel);min-height:100%}.tw-process-code>span{font-size:9px;letter-spacing:1px;color:var(--muted)}\n.tw-process-code pre{font:13px/1.9 Consolas,'Microsoft YaHei',monospace;white-space:pre-wrap;overflow-wrap:anywhere;margin:20px 0;color:var(--ink)}\n.tw-process[data-form=formula] .tw-process-code pre{font-size:19px;line-height:2.3}\n.tw-process-code button,.tw-io-panels button{font-size:9px;color:var(--accent);background:transparent}\n.tw-io-route{display:flex;align-items:center;gap:10px;margin:8px 0 24px;font-size:8px;color:var(--muted)}.tw-io-route b{font-size:12px;color:var(--accent)}.tw-io-route i{flex:1;border-top:1px solid var(--line);min-width:8px}\n.tw-io-panels{display:grid;grid-template-columns:1fr 1fr;gap:13px}.tw-io-panels>section{background:var(--panel);border:1px solid var(--line);padding:13px;min-width:0}.tw-io-panels header{font-size:10px;border-bottom:1px dotted var(--line);padding-bottom:11px;color:var(--accent)}.tw-io-panels pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.8 Consolas,'Microsoft YaHei',monospace;max-height:220px;overflow:auto;margin:13px 0}.tw-waiting-result{font-size:11px;color:var(--muted)}\n.tw-process[data-reading=playing] .tw-reading-cell:after{animation:tw-reading-light 6s ease-in-out infinite}\n@keyframes tw-reading-light{50%{opacity:.5;box-shadow:0 0 7px var(--accent)}}\n@container thought (max-width:620px){.tw-process{padding:0 10px;gap:11px}.tw-process-deck{grid-template-columns:minmax(0,1fr) 79px;gap:9px}.tw-process-topic{margin:11px 10px 8px}.tw-process-board{padding-left:10px;padding-right:10px}.tw-process-cells{gap:8px}.tw-register-cell p{font-size:11px}.tw-cell-head{gap:5px;font-size:8px}.tw-cell-head small{display:none}.tw-process-stats{margin:0 10px;gap:8px}.tw-process-stats small{display:none}.tw-process-focusline{margin-left:10px;margin-right:10px}.tw-frame-caption small{display:none}.tw-process-strip{font-size:8px;gap:8px}.tw-ops button>span{font-size:7px}.tw-process-source{height:103px}.tw-process-source-text{font-size:12px}.tw-io-panels{grid-template-columns:1fr}.tw-process-stats b{font-size:15px}.tw-queue-status{display:none}}\n@container thought (max-width:410px){.tw-process-cells{grid-template-columns:1fr}.tw-process-strip>span:last-child{font-size:8px}.tw-process-strip svg{display:none}.tw-reading-controls{gap:4px}.tw-reading-controls label{margin-left:0}.tw-reading-controls button,.tw-reading-controls select{font-size:9px;padding:2px 5px}}\n.tw-stacked .tw-process{gap:8px}.tw-stacked .tw-process-strip{min-height:22px}.tw-stacked .tw-process-topic{display:none}.tw-stacked .tw-process-source{height:59px}.tw-stacked .tw-process-source-text{margin:5px 9px;font-size:11px;line-height:1.6}.tw-stacked .tw-process-focusline{margin:5px 9px;font-size:9px}.tw-stacked .tw-process-stats{display:none}.tw-stacked .tw-register-cell{min-height:85px}.tw-stacked .tw-register-cell p{margin:5px 0;-webkit-line-clamp:2}.tw-stacked .tw-reading-controls{padding-bottom:3px}.tw-stacked .tw-process-board{padding:1px 8px 7px}.tw-stacked .tw-process-cells{grid-template-columns:1fr 1fr}.tw-stacked .tw-process-note{display:none}\n.tw-window[data-motion=calm] .tw-reading-cell:after,.tw-no-motion .tw-reading-cell:after{animation:none}\n.tw-no-motion .tw-register-cell{transition:none!important}\n.tw-stacked .tw-sequence-map{display:none}\n@media(prefers-reduced-motion:reduce){.tw-process *{animation:none!important;transition:none!important}}\n\n.tw-layout-workbench .tw-ribbon,.tw-layout-workbench .tw-summary,.tw-layout-workbench .tw-note{display:none!important}\n.tw-process-host{display:contents}.tw-process-host[hidden]{display:none}\n.tw-work-summary{display:flex;gap:12px;align-items:center;margin:8px 16px 0!important;padding:8px 10px!important;color:var(--muted)!important;font-size:10px!important;border-color:var(--line)!important;background:var(--paper)!important;text-align:left;flex:none}\n.tw-work-summary>span:first-child{color:var(--accent);font-size:9px;letter-spacing:1px}.tw-work-summary b{font-weight:400;color:var(--ink)}.tw-work-summary>span:last-child{margin-left:auto;color:var(--accent)}\n.tw-workbench{display:flex;flex-direction:column;flex:1;min-height:0;padding:18px 16px 8px;gap:18px;overflow:hidden}\n.tw-work-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none}.tw-work-heading small{font-size:9px;color:var(--accent);letter-spacing:1.3px}.tw-work-heading h2{font-size:19px;font-weight:400;margin:4px 0 0}.tw-work-heading>span{font-size:10px;color:var(--muted)}\n.tw-build-route{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--line);flex:none;background:var(--panel)}.tw-build-route>div{display:flex;flex-direction:column;gap:5px;flex:1}.tw-build-route b{font-size:23px;color:var(--accent);font-weight:400}.tw-build-route span{font-size:8px;color:var(--muted)}.tw-build-route>i{color:var(--line);font-style:normal;font-size:23px}\n.tw-work-columns{display:grid;grid-template-columns:minmax(190px,.85fr) minmax(0,1.4fr);gap:14px;flex:1;min-height:0}\n.tw-work-files,.tw-work-runs{display:flex;flex-direction:column;min-height:0}.tw-file-list{overflow:auto;min-height:0;padding:15px 10px 10px;scrollbar-width:thin;scrollbar-color:var(--line) transparent;overscroll-behavior:contain}\n.tw-file-card{padding:12px 10px;border:1px solid var(--line);background:var(--panel);margin-bottom:12px;overflow-wrap:anywhere}.tw-file-card header{display:flex;gap:10px;align-items:center}.tw-file-kind{display:grid;place-items:center;min-width:36px;height:40px;border:1px solid var(--accent);box-shadow:3px 3px var(--accent-soft);font-size:9px;color:var(--accent)}.tw-file-card header>div{display:flex;flex-direction:column;gap:6px;min-width:0}.tw-file-card strong{font-size:13px;font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tw-file-card small{font-size:9px;color:var(--good)}.tw-file-card>code{display:block;font:9px/1.7 Consolas,monospace;color:var(--muted);margin:13px 0}.tw-file-card p{font-size:11px;line-height:1.8}.tw-file-facts{display:flex;gap:8px;flex-wrap:wrap;font-size:8px;color:var(--muted);border-top:1px dotted var(--line);padding-top:8px}.tw-file-card footer{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}.tw-file-card footer button{font-size:9px;padding:4px 7px}.tw-file-card footer button:first-child{border-color:var(--accent);color:var(--accent)}\n.tw-run-list{flex:none;max-height:35%;min-height:0;overflow:auto;padding:12px 10px 5px;scrollbar-width:thin;scrollbar-color:var(--line) transparent}.tw-window .tw-run-list button{display:grid;grid-template-columns:20px minmax(0,1fr);width:100%;text-align:left;padding:9px 8px;margin-bottom:5px;background:transparent;border-color:var(--line);font-size:10px;gap:4px 7px}.tw-run-list button>span{white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.tw-run-list button>b{grid-column:2;font-size:9px;font-weight:400;color:var(--muted)}.tw-window .tw-run-list button[aria-pressed=true]{background:var(--accent-soft);border-color:var(--accent)}\n.tw-run-detail{flex:1;min-height:0;display:flex;flex-direction:column;gap:9px;padding:10px 14px 12px}.tw-run-title{display:flex;gap:8px;align-items:center;font-size:9px;color:var(--muted);flex:none}.tw-run-title b{font-weight:400;color:var(--good)}.tw-run-title button{margin-left:auto;font-size:8px;padding:3px 5px}.tw-run-command{flex:none;max-height:95px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.8 Consolas,'Microsoft YaHei',monospace;margin:0;background:var(--panel);padding:10px;border-left:2px solid var(--accent)}.tw-run-cwd{font-size:8px!important;overflow-wrap:anywhere}.tw-stdout-title{font-size:8px;color:var(--muted);border-bottom:1px dotted var(--line);padding:5px 0;flex:none}.tw-run-output{flex:1;min-height:45px;overflow:auto;font:11px/1.9 Consolas,'Microsoft YaHei',monospace;white-space:pre-wrap;overflow-wrap:anywhere;margin:0;scrollbar-width:thin;scrollbar-color:var(--line) transparent;overscroll-behavior:contain}.tw-run-source{font-size:9px!important;align-self:flex-start;flex:none}.tw-work-empty{color:var(--muted);font-size:12px;line-height:1.9;padding:25px 16px}.tw-work-empty>b{font-size:30px;font-weight:400;color:var(--accent)}\n.tw-work-footnote,.tw-work-notice{font-size:9px;color:var(--muted);margin:0;flex:none}.tw-work-notice{color:var(--danger)}\n.tw-workbench [data-status=error] :is(.tw-run-title b,.tw-file-card small),.tw-work-summary [data-status=error],.tw-run-list button[data-status=error]>b,.tw-build-route [data-status=error] b{color:var(--danger)}.tw-file-card[data-status=error]{border-color:var(--danger)}\n.tw-preview-summary{display:none;flex-direction:column;gap:9px;min-width:0;padding:10px 15px;font-size:11px}.tw-preview-summary>div:first-child{display:flex;align-items:center;gap:9px}.tw-preview-summary strong{font-size:11px;letter-spacing:.6px;font-weight:400}.tw-preview-summary small{font-size:9px;color:var(--muted)}.tw-preview-summary button{font-size:10px;white-space:nowrap;padding:3px 7px}.tw-dock-mark{font-size:17px;color:var(--accent)}.tw-preview-now,.tw-preview-last{display:flex;align-items:center;gap:12px;min-width:0}.tw-preview-now>span,.tw-preview-last>span:first-child{font-size:9px;color:var(--accent);min-width:38px}.tw-preview-now strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tw-preview-now>small{margin-left:auto;white-space:nowrap}.tw-preview-last>span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:10px}.tw-preview-last[data-status=error]>span:last-child{color:var(--danger)}\n.tw-native-shell.tw-preview-open{padding-right:0!important}.tw-native-shell.tw-preview-open>.tw-divider{display:none}.tw-native-shell.tw-preview-open>.tw-mount{position:relative!important;inset:auto!important;width:100%!important;order:5;flex:none;height:48%;border-top:1px solid var(--line);border-left:0}\n.tw-native-shell.tw-preview-folded>.tw-mount{height:118px;min-height:118px}\n.tw-preview-folded .tw-window>*{display:none!important}.tw-preview-folded .tw-window>.tw-preview-summary{display:flex!important}.tw-preview-folded .tw-window{background:var(--paper)}\n.tw-preview-open .tw-title-actions .tw-dock-fold{display:inline-flex;font-size:10px;align-self:center;padding:4px 7px;border:1px solid var(--line)}.tw-dock-fold{display:none}\n.tw-native-shell.tw-preview-open>.tw-mount .tw-work-heading{display:none}.tw-native-shell.tw-preview-open>.tw-mount .tw-build-route{padding:6px 10px}.tw-native-shell.tw-preview-open>.tw-mount .tw-build-route b{font-size:15px}.tw-native-shell.tw-preview-open>.tw-mount .tw-workbench{gap:12px;padding-top:10px}.tw-native-shell.tw-preview-open>.tw-mount .tw-work-columns{grid-template-columns:minmax(170px,.7fr) minmax(0,1.3fr)}\n@container thought (max-width:650px){.tw-work-columns{grid-template-columns:1fr;overflow:auto;display:flex;flex-direction:column;padding-top:3px}.tw-work-files{max-height:42%;flex:none}.tw-work-runs{flex:1;min-height:230px}.tw-file-list{display:flex;gap:8px}.tw-file-card{min-width:185px;max-width:240px;flex:1;margin-bottom:0}.tw-workbench{gap:13px;padding:12px 10px 8px}.tw-work-heading h2{font-size:16px}.tw-work-heading>span{display:none}.tw-build-route{gap:6px;padding:8px}.tw-build-route span{font-size:7px}.tw-work-summary{margin:6px 10px 0!important;font-size:9px!important;gap:8px}.tw-work-summary>span:nth-child(3){display:none}.tw-preview-summary{padding:9px 10px}.tw-preview-summary>div:first-child>small{display:none}.tw-preview-summary>div:first-child{gap:6px}.tw-preview-summary button{font-size:9px}.tw-native-shell.tw-preview-open .tw-work-columns{display:flex}.tw-native-shell.tw-preview-open .tw-work-files{max-height:40%}}\n.tw-stacked .tw-workbench{gap:10px;padding-top:10px}.tw-stacked .tw-work-heading{display:none}.tw-stacked .tw-build-route{padding:6px 9px}.tw-stacked .tw-build-route b{font-size:14px}.tw-stacked .tw-work-footnote{display:none}\n@media(prefers-reduced-motion:reduce){.tw-workbench *{animation:none!important;transition:none!important}}\n@container thought (max-width:650px){.tw-map-toolbar>span:first-child{display:none}.tw-map-toolbar{gap:8px;padding-left:10px;padding-right:10px}.tw-view-switch button{font-size:9px;padding:2px 5px}}\n\n/* 0.7 stage: one terminal screen. In the full shell the mount covers the whole\r\n   conversation root; the native chat shows through the framed \"dsh · web\" hole\r\n   (pointer-events pass through), the rest is the stage. Row/column sizes here\r\n   and the root padding below must agree. */\r\n.tw-native-shell.tw-stage-shell{padding:52px calc(var(--tw-panel-width) + 10px) 108px 20px!important}\r\n.tw-native-shell.tw-stage-shell>.tw-mount{inset:0!important;width:auto!important;height:auto!important;border:0!important;pointer-events:none;background:transparent}\r\n.tw-native-shell.tw-stage-shell>.tw-divider{top:40px;bottom:98px;right:calc(var(--tw-panel-width) - 10px)}\r\n.tw-stage-shell .tw-window.tw-layout-stage{background:transparent;pointer-events:none}\r\n.tw-stage-shell .tw-stage>:not(.tw-stage-chat),.tw-stage-shell .tw-layout-stage>.tw-source{pointer-events:auto}\r\nbody.tw-stage-host [data-rightbar-collapsed=true]{grid-template-columns:0 minmax(0,1fr) 0!important}\r\nbody.tw-stage-host :has(>[data-slot=sidebar]){visibility:hidden;overflow:hidden;min-width:0}\r\n\r\n.tw-stage{position:relative;flex:1;min-height:0;height:100%;display:grid;grid-template-columns:minmax(0,1fr) 96px;grid-template-rows:26px minmax(0,1fr) 62px 14px;grid-template-areas:\"top top\" \"main ops\" \"out out\" \"credit credit\";gap:8px 10px;padding:6px 10px;color:var(--ink);font:11px/1.4 Consolas,'SFMono-Regular','Microsoft YaHei',monospace}\r\n.tw-stage-shell .tw-stage{grid-template-columns:calc(100% - var(--tw-panel-width) - 10px) minmax(0,1fr) 96px;grid-template-areas:\"top top top\" \"chat main ops\" \"out out out\" \"credit credit credit\"}\r\n.tw-stage-chat{grid-area:chat;display:none}\r\n.tw-stage-shell .tw-stage-chat{display:block}\r\n.tw-stage-top{grid-area:top}.tw-stage-main{grid-area:main}.tw-stage-ops{grid-area:ops}.tw-stage-out{grid-area:out}.tw-stage-credit{grid-area:credit}\r\n\r\n/* Corner-bracket frames, as in the reference terminal. */\r\n.tw-stage-chat,.tw-stage-main,.tw-stage-ops,.tw-stage-out{position:relative;min-width:0;min-height:0;border:1px solid color-mix(in srgb,var(--line) 70%,transparent)}\r\n.tw-stage-chat:before,.tw-stage-main:before,.tw-stage-ops:before,.tw-stage-out:before{content:'';position:absolute;inset:-1px;pointer-events:none;z-index:2;background:linear-gradient(var(--ink),var(--ink)) left top/9px 1.5px no-repeat,linear-gradient(var(--ink),var(--ink)) left top/1.5px 9px no-repeat,linear-gradient(var(--ink),var(--ink)) right top/9px 1.5px no-repeat,linear-gradient(var(--ink),var(--ink)) right top/1.5px 9px no-repeat,linear-gradient(var(--ink),var(--ink)) left bottom/9px 1.5px no-repeat,linear-gradient(var(--ink),var(--ink)) left bottom/1.5px 9px no-repeat,linear-gradient(var(--ink),var(--ink)) right bottom/9px 1.5px no-repeat,linear-gradient(var(--ink),var(--ink)) right bottom/1.5px 9px no-repeat}\r\n.tw-stage-cap{position:absolute;z-index:3;top:-8px;left:10px;right:10px;display:flex;justify-content:space-between;gap:10px;font-size:10px;line-height:14px;pointer-events:none;white-space:nowrap;overflow:hidden}\r\n.tw-stage-cap>span,.tw-stage-cap>small,.tw-stage-chat>.tw-stage-cap{background:var(--paper);padding:0 5px;color:var(--ink)}\r\n.tw-stage-chat>.tw-stage-cap{right:auto}\r\n.tw-stage-cap>small{font-size:9px;color:var(--muted);overflow:hidden;text-overflow:ellipsis}\r\n\r\n.tw-stage-top{display:flex;align-items:center;gap:16px;min-width:0;white-space:nowrap;overflow:hidden;font-size:11px;border-bottom:1px solid color-mix(in srgb,var(--line) 60%,transparent)}\r\n.tw-stage-top>b{font-weight:700;letter-spacing:.5px}\r\n.tw-stage-prompt{color:var(--muted)}\r\n.tw-stage-wave{flex:1;min-width:40px;height:18px;color:var(--ink)}\r\n.tw-stage-wave line{stroke:currentColor;stroke-width:1.2;vector-effect:non-scaling-stroke}.tw-stage-wave .tw-wave-axis{stroke:var(--line);stroke-dasharray:1 3}\r\n.tw-stage-wave[data-running=true]{color:var(--accent)}\r\n.tw-stage-phase{color:var(--accent);letter-spacing:.6px}\r\n.tw-stage-read{color:var(--muted)}\r\n.tw-stage-status{padding:0 6px;border:1px solid var(--line);letter-spacing:.8px;font-size:10px}\r\n.tw-stage-status[data-status=running],.tw-stage-status[data-status=reading]{background:var(--ink);color:var(--paper);border-color:var(--ink)}\r\n.tw-stage-status[data-status=running]{animation:tw-blink 1.4s steps(2,end) infinite}\r\n.tw-window .tw-stage-menu-button{border:0;background:transparent;padding:0 4px;font-size:16px;line-height:1;color:var(--ink)}\r\n.tw-window .tw-stage-menu-button[aria-expanded=true]{background:var(--accent);color:var(--paper)}\r\n\r\n.tw-stage-main{display:flex;flex-direction:column}\r\n.tw-stage-main>.tw-stage-cap>span{font-weight:700}\r\n.tw-stage-plot{position:relative;flex:1;min-height:0;margin-top:8px}\r\n.tw-stage-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:pointer}\r\n.tw-stage-caption{flex:none;font-size:9px;color:var(--muted);padding:2px 10px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\r\n.tw-stage-paused{position:absolute;z-index:3;top:14px;right:12px;font-size:10px;padding:1px 6px;background:var(--accent);color:var(--paper);letter-spacing:.6px}\r\n\r\n.tw-stage-ops nav{position:absolute;inset:12px 4px 6px;overflow:auto;scrollbar-width:none;overscroll-behavior:contain;scroll-behavior:smooth}\r\n.tw-stage-ops nav::-webkit-scrollbar{display:none}\r\n.tw-window .tw-stage-ops button{display:flex;gap:5px;width:100%;text-align:left;border:0;background:transparent;padding:1px 4px;font-size:9px;line-height:13px;letter-spacing:.4px;color:var(--muted);opacity:.55;white-space:nowrap;overflow:hidden}\r\n.tw-window .tw-stage-ops button>small{font-size:8px;color:inherit;opacity:.7}\r\n.tw-window .tw-stage-ops button[data-past]{opacity:.85;color:var(--ink)}\r\n.tw-window .tw-stage-ops button[data-status=error]{color:var(--danger)}\r\n.tw-window .tw-stage-ops button[aria-current=step]{opacity:1;background:var(--ink);color:var(--paper)}\r\n.tw-window .tw-stage-ops button:not([aria-current]):hover{opacity:1;background:var(--accent-soft)}\r\n\r\n.tw-window .tw-stage-tokens{position:absolute;inset:13px 10px 4px;display:flex;align-items:flex-start;gap:7px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;border:0;background:transparent;padding:0;text-align:left;white-space:nowrap;cursor:pointer}\r\n.tw-stage-tokens::-webkit-scrollbar{display:none}\r\n.tw-stage-tokens>b{font-size:16px;line-height:24px;color:var(--accent);flex:none}\r\n.tw-token{display:inline-flex;flex-direction:column;align-items:flex-start;gap:1px;flex:none;animation:tw-token-in .18s steps(3,end) both}\r\n.tw-token>span{font-size:15px;line-height:22px;padding:0 4px;background:color-mix(in srgb,var(--ink) 11%,transparent);color:var(--ink)}\r\n.tw-token>small{font-size:8px;line-height:10px;color:var(--muted);padding-left:4px}\r\n.tw-token-live>span{background:var(--ink);color:var(--paper)}\r\n.tw-stage-caret{flex:none;width:8px;height:18px;margin-top:2px;background:var(--ink);animation:tw-blink .9s steps(2,end) infinite}\r\n@keyframes tw-token-in{from{opacity:0;transform:translateY(5px)}}\r\n\r\n.tw-stage-credit{display:flex;justify-content:space-between;gap:18px;font-size:9px;line-height:14px;color:var(--muted);white-space:nowrap;overflow:hidden}\r\n.tw-stage-credit>span:nth-child(2){overflow:hidden;text-overflow:ellipsis}\r\n\r\n.tw-stage-menu{position:absolute;z-index:30;top:36px;right:10px;width:min(660px,calc(100% - 20px));max-height:calc(100% - 60px);overflow:auto;display:flex;flex-direction:column;gap:10px;padding:16px 14px 10px;background:var(--panel);border:1px solid var(--accent);box-shadow:4px 4px 0 var(--shadow,#0006);font-size:11px;scrollbar-width:thin}\r\n.tw-stage-menu-row{display:flex;align-items:center;flex-wrap:wrap;gap:6px 8px}\r\n.tw-stage-menu-row>span:first-child{width:36px;flex:none;color:var(--accent);font-size:10px;letter-spacing:.6px}\r\n.tw-stage-menu-row small{margin-left:auto}\r\n.tw-stage-menu .tw-view-switch{flex-wrap:wrap}\r\n.tw-stage-menu .tw-controls{padding:10px 0 0;border-top:1px solid var(--line);background:transparent}\r\n.tw-window .tw-stage-menu-close{position:absolute;top:2px;right:4px;border:0;background:transparent;font-size:14px;padding:0 4px}\r\n.tw-stage-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}\r\n\r\n.tw-layout-stage>.tw-source{position:absolute;z-index:25;left:auto;right:116px;bottom:104px;width:min(560px,calc(100% - 140px));max-height:46%;border:1px solid var(--accent);box-shadow:4px 4px 0 var(--shadow,#0006)}\r\n.tw-native-shell:not(.tw-stage-shell) .tw-layout-stage>.tw-source{left:8px;right:8px;width:auto;bottom:70px}\r\n\r\n/* Compact stage: narrow windows and the file-preview strip. */\r\n.tw-native-shell:not(.tw-stage-shell) .tw-stage-credit{display:none}\r\n.tw-native-shell:not(.tw-stage-shell) .tw-stage{grid-template-rows:24px minmax(0,1fr) 54px;grid-template-areas:\"top top\" \"main ops\" \"out out\";gap:8px;padding:6px 8px 8px}\r\n.tw-stacked .tw-stage{grid-template-columns:minmax(0,1fr) 72px}\r\n.tw-stacked .tw-stage-prompt,.tw-stacked .tw-stage-read,.tw-stacked .tw-stage-caption{display:none}\r\n.tw-stacked .tw-token>span{font-size:13px;line-height:18px}\r\n@container thought (max-width:520px){.tw-stage-prompt,.tw-stage-wave,.tw-stage-read{display:none}.tw-stage{grid-template-columns:minmax(0,1fr) 64px}}\r\n.tw-no-motion .tw-token,.tw-no-motion .tw-stage-caret,.tw-no-motion .tw-stage-status{animation:none!important}\r\n@media(prefers-reduced-motion:reduce){.tw-stage *{animation:none!important}}\r\n";}};
const cache=Object.create(null);
function require(id){if(!Object.hasOwn(modules,id))return platformRequire(id);if(cache[id])return cache[id].exports;const module={exports:{}};cache[id]=module;modules[id](module,module.exports,require);return module.exports;}
return require("./client.cjs");
}});
