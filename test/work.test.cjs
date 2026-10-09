'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {projectWork,fileAddress,validateWork,FILE_LIMIT,RUN_LIMIT}=require('../src/work-data.cjs');
const {createHostBridge}=require('../src/host-bridge.cjs');
const {project,validateReplay}=require('../src/core.cjs');
const user={kind:'user',seq:1,content:[{type:'text',text:'生成 snake.html 并测试。'}]};
const call=(id,name,args,seq=2)=>({kind:'assistant',seq,turn:1,step:seq,blocks:[{kind:'tool-call',callId:id,name,argsRaw:JSON.stringify(args)}]});
const result=(id,text='',isError=false,seq=3)=>({kind:'tool-result',seq,callId:id,isError,content:[{type:'text',text}]});
const legacy=nodes=>({nodes:[user,...nodes],partial:null,runningCalls:[]});
test('confirmed file writes and edits accumulate, failed edits remain visible',()=>{
 const value=projectWork(legacy([call('a','write',{file_path:'snake.html',content:'<html>\n</html>'}),result('a','ok'),call('b','edit',{file_path:'snake.html',old_string:'old',new_string:'new'},4),result('b','failed',true,5)]));
 assert.equal(value.files.length,1);assert.equal(value.files[0].changes,1);assert.equal(value.files[0].status,'error');assert.equal(value.files[0].nodeId,'tool:b');validateWork(value);
});
test('only actual supported mutations/deliveries produce file cards',()=>{
 const value=projectWork(legacy([call('a','read',{file_path:'read-only.txt'}),result('a','content'),call('b','pwsh',{command:'echo report.html'}),result('b','report.html'),{kind:'assistant',turn:1,blocks:[{kind:'text',text:'我生成了 invented.pdf'}]}]));
 assert.equal(value.files.length,0);assert.equal(value.runs.length,1);
});
test('file declarations from the public turn index include shell-produced artifacts and exclude old turns',()=>{
 const data={produced:[{seq:8,path:'src/main.py'}],presented:[{seq:9,path:'result.html',description:'交互页面'}]};
 const value=projectWork(legacy([]),false,data);assert.deepEqual(value.files.map(f=>f.path),['src/main.py','result.html']);assert.equal(value.files[1].declared,true);
 const next=projectWork({nodes:[user,{...user,seq:20}]},false,data);assert.equal(next.files.length,0);
 const failed=projectWork(legacy([call('x','write',{file_path:'result.html',content:'new'},10),result('x','failed',true,11)]),false,data);
 assert.equal(failed.files.find(f=>f.path==='result.html').status,'error','old presentation must not hide a later write failure');
});
test('non-zero exits, signals and timeouts are failures even when the tool itself returned normally',()=>{
 for(const output of ['assert failed\n[exit code: 1]','halt\n[killed by signal: SIGTERM]','log\n[timed out after 1000ms]']){
  const value=projectWork(legacy([call('a','pwsh',{command:'node check.js'}),result('a',output)]));assert.equal(value.runs[0].status,'error');
 }
 const success=projectWork(legacy([call('a','pwsh',{command:'echo hello'}),result('a','hello')]));assert.equal(success.runs[0].label,'调用已返回');assert.equal(success.runs[0].exitCode,null);
});
test('background submission is distinct from completion; stale running calls cannot overwrite a result',()=>{
 const trace=legacy([call('a','bash',{command:'npm run dev',run_in_background:true}),result('a','job id: 11')]);
 trace.runningCalls=[{callId:'a',name:'bash',turn:1,argsRaw:JSON.stringify({command:'npm run dev',run_in_background:true})}];
 assert.equal(projectWork(trace,true).runs[0].status,'submitted');
 trace.nodes.at(-1).isError=true;assert.equal(projectWork(trace,true).runs[0].status,'error');
});
test('background status and exit detail follow the host job-output markers',()=>{
 for(const [marker,status,code] of [['running','running',null],['completed, exit code: 0','done',0],['completed, exit code: 3','error',3],['killed','error',null]]){
  const value=projectWork(legacy([call('a','job_output',{job_id:'job-1'}),result('a','output\n[status: '+marker+']')]));
  assert.equal(value.runs[0].status,status);assert.equal(value.runs[0].exitCode,code);
 }
});
test('relative mutations and absolute delivery paths in the known workspace share one file',()=>{
 const value=projectWork(legacy([call('a','write',{file_path:'./snake.html',content:'html'}),result('a','ok')]),false,{presented:[{path:'D:\\dsh\\snake.html',seq:4}]},'D:/dsh');
 assert.equal(value.files.length,1);assert.equal(value.files[0].changes,1);assert.equal(value.files[0].declared,true);
});
test('nested Code Dispatch children preserve their actual results',()=>{
 const child={...result('child','file saved'),call:{name:'write',argsRaw:JSON.stringify({file_path:'child.html',content:'test'})}};
 const parent={...result('root','done'),call:{name:'cordis',argsRaw:'{}'},subCalls:[child]};
 const value=projectWork(legacy([parent]));assert.equal(value.files[0].path,'child.html');assert.equal(value.files[0].status,'done');
});
test('queues and output are bounded, replay validates optional new records and rejects malformed ones',()=>{
 const nodes=[];for(let i=0;i<48;i++)nodes.push(call('w'+i,'write',{file_path:i+'.html',content:'x'}),result('w'+i),call('r'+i,'bash',{command:'echo '+i}),result('r'+i,'x'.repeat(9000)));
 const trace=legacy(nodes),work=projectWork(trace);assert.equal(work.files.length,FILE_LIMIT);assert.equal(work.runs.length,RUN_LIMIT);assert.ok(work.omitted);assert.equal(work.runs[0].output.length,8000);assert.equal(work.runs[0].truncated,true);
 const replay={format:'dsh-thought-window',version:1,frames:[{at:1,graph:{...project(trace),work}}]};validateReplay(replay);
 work.files[0].path='bad\u0000path';assert.throws(()=>validateReplay(replay));
});
test('native preview uses an encoded session resource, never executes a command or URL',()=>{
 const expected='dsh-resource://file/session/session%201/snake%20%231.html';assert.equal(fileAddress('session 1','D:\\dsh','D:\\dsh\\snake #1.html'),expected);
 assert.equal(fileAddress('s','D:/dsh','https://evil.invalid/x.html'),'dsh-resource://file/session/s/https://evil.invalid/x.html');
 const opens=[];let expanded=true;
 const sidebar={openResource:address=>opens.push(address),isExpanded:()=>expanded,active:()=>({contentId:expected})};
 const bridge=createHostBridge({get:name=>name==='sidebarRight'?sidebar:{list:{getSnapshot:()=>({byId:{'session 1':{cwd:'D:/dsh'}}})}}});
 bridge.openFile('session 1','D:/dsh/snake #1.html');assert.deepEqual(opens,[expected]);assert.equal(bridge.readPreview('session 1').path,'snake #1.html');assert.equal(bridge.readPreview('other').open,false);expanded=false;assert.equal(bridge.readPreview('session 1').open,false);
 assert.equal(createHostBridge({}).canOpen(),false);
});
