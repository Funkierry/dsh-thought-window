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
