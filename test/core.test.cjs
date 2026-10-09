const {test}=require('node:test');
const assert=require('node:assert/strict');
const {project,appendFrame,validateReplay,segments}=require('../src/core.cjs');
const base={nodes:[],partial:null,runningCalls:[]};
test('stable IDs across stream settlement; deduplicates overlapping partial',()=>{
  const text='首先检查当前方案是否满足要求。'.repeat(12);
  const partial={turn:1,step:0,blocks:[{kind:'reasoning',text}]};
  const a=project({...base,partial},true);
  const b=project({...base,partial,nodes:[{kind:'assistant',...partial,seq:3,time:1}]},false);
  assert.deepEqual(a.nodes.map(n=>n.id),b.nodes.map(n=>n.id));
  assert.equal(b.nodes.length,segments(text).length);
  assert.equal(a.nodes.at(-1).status,'running');assert.equal(b.nodes.at(-1).status,'done');
});
test('stream boundaries retain earlier prefixes',()=>{
  const text='这是完整的公开推理句子。'.repeat(20);
  const before=segments(text.slice(0,180));const after=segments(text);
  assert.deepEqual(before.slice(0,-1),after.slice(0,before.length-1));
});
test('tool result merges into call; stale running event cannot overwrite error',()=>{
  const graph=project({...base,nodes:[{kind:'assistant',turn:1,step:0,blocks:[{kind:'tool-call',callId:'c1',name:'read_file',argsRaw:'{"path":"a"}'}]},{kind:'tool-result',seq:4,callId:'c1',isError:true,content:[{type:'text',text:'missing file'}]}],runningCalls:[{callId:'c1',name:'read_file'}]},true);
  assert.equal(graph.nodes.length,1);assert.equal(graph.nodes[0].status,'error');assert.match(graph.nodes[0].source,/missing file/);
});
test('stopped streams and interrupted completed messages are explicit',()=>{
  const message={turn:1,step:1,blocks:[{kind:'reasoning',text:'检查中'}]};
  assert.equal(project({...base,partial:message},false).nodes[0].status,'stopped');
  assert.equal(project({...base,nodes:[{...message,kind:'assistant',interrupted:true}]},false).nodes[0].status,'stopped');
});
test('excludes system/context, unknown and binary payloads',()=>{
  const graph=project({...base,nodes:[{kind:'context',text:'secret-system'},{kind:'unknown',data:'secret-system'},{kind:'user',seq:0,content:[{type:'text',text:'hello'},{type:'image',data:'secret-image'}]}]});
  assert.equal(graph.nodes.length,1);assert.doesNotMatch(JSON.stringify(graph),/secret/);
});
test('history is bounded, deduplicated and export validates',()=>{
  let frames=[];
  for(let i=0;i<120;i++)frames=appendFrame(frames,project({...base,nodes:[{kind:'user',seq:i,content:[{type:'text',text:'message '+i}]}]}),i,90,20000);
  assert.ok(frames.length<90);assert.equal(appendFrame(frames,frames.at(-1).graph),frames);
  assert.equal(validateReplay({format:'dsh-thought-window',version:1,frames}),frames);
  assert.throws(()=>validateReplay({format:'wrong',version:1,frames}));
});
test('graph truncation leaves no dangling edges; tool parentage is explicit',()=>{
  const nodes=Array.from({length:180},(_,i)=>({kind:'user',seq:i,content:[{type:'text',text:'x'}]}));
  const graph=project({...base,nodes});assert.equal(graph.nodes.length,160);assert.equal(graph.omitted,20);
  const ids=new Set(graph.nodes.map(n=>n.id));assert.ok(graph.edges.every(e=>ids.has(e.from)&&ids.has(e.to)));
  const parent=project({...base,runningCalls:[{callId:'p',name:'task'},{callId:'c',parentCallId:'p',name:'read'}]},true);
  assert.ok(parent.edges.some(e=>e.kind==='parent'&&e.from==='tool:p'&&e.to==='tool:c'));
});
test('replay rejects malformed text and dangling edges',()=>{
  const g=project({...base,nodes:[{kind:'user',seq:1,content:[{type:'text',text:'hello'}]}]});
  const value={format:'dsh-thought-window',version:1,frames:[{at:1,graph:g}]};
  g.nodes[0].title={};assert.throws(()=>validateReplay(value));g.nodes[0].title='hello';g.edges.push({from:'missing',to:g.nodes[0].id,kind:'sequence'});assert.throws(()=>validateReplay(value));
});
