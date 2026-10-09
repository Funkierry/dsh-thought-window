'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {project}=require('../src/core.cjs');
const {slices,buildProcess,mergeQueue,dwellMs,LIMIT}=require('../src/process-data.cjs');
const user={kind:'user',seq:1,turn:1,content:[{type:'text',text:'请读取代码，比较两个方案，再验证结果。'}]};
const stream=text=>project({nodes:[user],partial:{turn:1,step:0,blocks:[{kind:'reasoning',text}]}},true);
test('fine-grained fragments retain exact source spans across host node boundaries',()=>{
 const text=('先检查这一段公开原文，保留标点和换行。\n').repeat(25)+'```js\nconst n = 1;\nconsole.log(n);\n```\n最后核验所有输出。';
 const graph=stream(text),queue=buildProcess(graph);
 assert.ok(queue.entries.length>graph.nodes.length);
 for(const entry of queue.entries){
  const source=entry.spans.map(s=>graph.nodes.find(n=>n.id===s.nodeId).source.slice(s.start,s.end)).join('');
  assert.equal(source,entry.text);
 }
 const code=queue.entries.find(e=>e.text.startsWith('```'));
 assert.ok(code.text.includes('console.log(n);\n```'));assert.ok(code.spans.length);
});
test('every streaming prefix keeps existing starts and completed sentences stable',()=>{
 const text='首先梳理输入中的具体条件。\n方案 A 使用 SVG，文字可以直接选择。\n方案 B 使用 Canvas，必须另外处理点击区域。\n最后比较可读性与复杂度。';
 let previous=[];
 for(let i=1;i<=text.length;i++){
  const next=buildProcess(stream(text.slice(0,i))).entries;
  for(const entry of previous.slice(0,-1))assert.ok(next.some(n=>n.id===entry.id&&n.text===entry.text));
  assert.equal(next[1].id,'a:1:0:0:0@0');previous=next;
 }
 assert.ok(previous.length>=5);
});
test('late tool return appends without jumping ahead of already observed reasoning',()=>{
 const nodes=[user,{kind:'assistant',turn:1,step:0,seq:2,blocks:[{kind:'tool-call',name:'read_file',callId:'read',argsRaw:'{"path":"a.js"}'}]}];
 const partial={turn:1,step:1,blocks:[{kind:'reasoning',text:'等待读取结果，同时整理需要检查的接口。'}]};
 const before=buildProcess(project({nodes,partial},true));
 const after=buildProcess(project({nodes:[...nodes,{kind:'tool-result',callId:'read',seq:3,content:[{type:'text',text:'export const answer = 42;'}]}],partial},true));
 const merged=mergeQueue(before,after);
 assert.deepEqual(merged.entries.slice(0,-1).map(e=>e.id),before.entries.map(e=>e.id));
 assert.equal(merged.entries.at(-1).kind,'result');
 assert.equal(merged.entries.find(e=>e.kind==='request').text,'{"path":"a.js"}');
 assert.equal(merged.entries.at(-1).text,'export const answer = 42;');
});
test('answer-only turns never inherit previous-turn reasoning or fabricate process',()=>{
 const graph=project({nodes:[user,{kind:'assistant',turn:1,step:0,blocks:[{kind:'reasoning',text:'这是上一轮的公开推理。'}]},
  {...user,seq:5,turn:2},{kind:'assistant',turn:2,step:0,blocks:[{kind:'text',text:'这是新一轮直接返回的答案。'}]}]},false);
 const queue=buildProcess(graph);assert.equal(queue.hasReasoning,false);
 assert.deepEqual(queue.entries.map(e=>e.kind),['input','answer']);
 assert.equal(mergeQueue(buildProcess(stream('旧内容。')),queue).turn,'user:5');
});
test('explicit step/check headings and fenced code override incidental keywords',()=>{
 const queue=buildProcess(stream('第三步：为比较和工具返回安排各自的版式。\n检查：比较卡片的原文是否完整。\n代码片段：\n```js\nfunction compare() { return "验证"; }\n```'));
 assert.deepEqual(queue.entries.slice(1).map(e=>e.kind),['plan','check','code']);
});
test('bounded queue and reader timing stay independent of token burst speed',()=>{
 const graph={nodes:[{id:'user:1',kind:'input',source:'问题',status:'done'},{id:'a:1:0:0:0',kind:'answer',source:'每一个句子都包含可读取的内容。'.repeat(400),status:'done'}]};
 const queue=buildProcess(graph);assert.equal(queue.entries.length,LIMIT);assert.ok(queue.omitted>0);
 assert.equal(dwellMs({text:'短句'},8),8000);assert.equal(dwellMs({text:'长'.repeat(500)},8),20000);
 assert.ok(dwellMs({text:'长'.repeat(200)},5)>5000);
 assert.equal(slices('```js\nconst x=1;\nx++;\n```').length,1);
 assert.equal(slices('代码片段：\n```js\nconst x=1;\n```').length,1,'a heading does not consume its own empty code scene');
});
