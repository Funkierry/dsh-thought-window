'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {turnSpans,runMetrics,fmtMs,fmtTok}=require('../src/run-metrics.cjs');
const {parseOutline,normalizeOutline,buildOutlineRequest,reasoningExcerpt,turnReasoning}=require('../src/outline.cjs');
const {buildFigure}=require('../src/stage-figures.cjs');
const D=require('../src/stage-data.cjs');

const T=1_000_000;
const legacy={nodes:[
 {kind:'user',seq:1,turn:0,time:T,content:[{type:'text',text:'hi'}]},
 {kind:'assistant',seq:2,turn:0,step:0,time:T+3000,timing:{stepStartTime:T+100,firstTokenTime:T+600,completedTime:T+3000},usage:{outputTokens:240},blocks:[{kind:'reasoning',text:'想一想'},{kind:'tool-call',callId:'c1',name:'read_file',argsRaw:'{"path":"a.txt"}'}]},
 {kind:'tool-result',seq:3,turn:0,callId:'c1',callTime:T+3050,time:T+3550,isError:false,content:[{type:'text',text:'file body'}]},
 {kind:'assistant',seq:4,turn:0,step:1,time:T+6000,timing:{stepStartTime:T+3600,firstTokenTime:T+4000,completedTime:T+6000},usage:{outputTokens:160},blocks:[{kind:'tool-call',callId:'c2',name:'bash',argsRaw:'ls'}]},
 {kind:'tool-result',seq:5,turn:0,callId:'c2',callTime:T+6050,time:T+6250,isError:true,content:[{type:'text',text:'boom'}]}
]};
const projections={tokenUsage:{uncachedInputTokens:2000,cacheReadTokens:6000,cacheWriteTokens:0,outputTokens:400},contextPressure:{projectedTokens:32000,contextWindow:128000},todos:[{content:'读文件',status:'completed'},{content:'改代码',status:'in_progress'},{content:'测试',status:'pending'},{bogus:true}]};

test('spans follow DSH timing records and running work ends at now',()=>{
 const {spans,start}=turnSpans(legacy,false);
 assert.equal(start,T);
 assert.deepEqual(spans.map(s=>[s.kind,s.label,s.start-T,s.end-T]),[['llm','step 1',100,3000],['tool','read_file',3050,3550],['llm','step 2',3600,6000],['tool','bash',6050,6250]]);
 assert.equal(spans[3].status,'error');
 const live=turnSpans({...legacy,runningCalls:[{callId:'c3',name:'grep',time:T+6300}]},true);
 assert.equal(live.spans.at(-1).end,null);
 assert.equal(live.spans.at(-1).status,'running');
 assert.deepEqual(turnSpans({nodes:[]},false).spans,[]);
});

test('run metrics add up time, tokens, speed, cache and context without guessing',()=>{
 const m=runMetrics(legacy,false,projections,T+99999);
 assert.equal(m.elapsedMs,6250);
 assert.equal(m.llmMs,2900+2400);
 assert.equal(m.toolMs,500+200);
 assert.equal(m.ttftMs,500);
 assert.equal(m.steps,2);assert.equal(m.tools,2);assert.equal(m.toolErrors,1);
 assert.equal(m.outputTokens,400);
 assert.equal(Math.round(m.tokensPerSecond),Math.round(400/((2400+2000)/1000)));
 assert.equal(m.usage.cacheHit,.75);
 assert.equal(m.context.share,.25);
 assert.deepEqual(m.todos.map(t=>t.status),['completed','in_progress','pending']);
 // Nothing recorded: nulls, not zeros.
 const bare=runMetrics({nodes:[{kind:'user',seq:1,turn:0,time:T}]},true,{},T+2000);
 assert.equal(bare.elapsedMs,2000);
 assert.equal(bare.outputTokens,null);assert.equal(bare.tokensPerSecond,null);assert.equal(bare.usage,null);assert.equal(bare.context,null);
 assert.equal(fmtMs(850),'850ms');assert.equal(fmtMs(12300),'12.3s');assert.equal(fmtMs(125000),'2m05s');
 assert.equal(fmtTok(950),'950');assert.equal(fmtTok(12345),'12k');assert.equal(fmtTok(2500),'2.5k');
});

const box={w:900,h:560};
const entries=[{id:'a',kind:'input',text:'你好',status:'done'},{id:'b',kind:'analysis',text:'先读文件再修改',status:'done'},{id:'c',kind:'request',title:'todo_write',text:'{}',status:'done'}];
test('data scenes draw from metrics and say so when a record is missing',()=>{
 const metrics=runMetrics(legacy,false,projections,T+7000),work={files:[{path:'src/a.js',name:'a.js',status:'done',action:'edit',changes:3,declared:false},{path:'README.md',name:'README.md',status:'done',action:'write',changes:1,declared:true}]};
 for(const id of ['timeline','todos','tokens','files']){
  const spec=buildFigure(id,{entries,index:1,focus:entries[1],samples:[],box,running:false,metrics,work,now:T+7000});
  assert.ok(spec.marks.length>3,id+' has marks');
  assert.ok(spec.caption,id+' has a caption');
  const none=buildFigure(id,{entries,index:1,focus:entries[1],samples:[],box,running:false,metrics:null,work:null});
  assert.equal(none.marks.length,0,id+' without data draws nothing');
  assert.ok(none.texts.some(t=>/\[ \.\. \]/.test(t.text)),id+' says why');
 }
 const board=buildFigure('todos',{entries,index:1,focus:entries[1],samples:[],box,metrics});
 assert.ok(board.texts.some(t=>t.text==='改代码')&&board.texts.some(t=>t.text==='[x]'),'todo rows are drawn');
 const tree=buildFigure('files',{entries,index:1,focus:entries[1],samples:[],box,work});
 assert.ok(tree.texts.some(t=>/a\.js/.test(t.text))&&tree.texts.some(t=>/delivered/.test(t.text)));
 const timeline=buildFigure('timeline',{entries,index:1,focus:entries[1],samples:[],box,metrics,now:T+7000});
 assert.ok(timeline.texts.some(t=>t.text==='2.9s · 240 tok'));
 assert.ok(timeline.texts.some(t=>/error/.test(t.text)));
});

test('data scenes are chosen only when their data exists',()=>{
 const reasoning=Array.from({length:8},(_,i)=>({id:'r'+i,kind:'analysis',text:'第'+i+'步',status:'done'}));
 const none=reasoning.map((_,i)=>D.chooseFigure(reasoning,i,{}));
 assert.ok(!none.some(f=>['timeline','tokens','todos','files'].includes(f)));
 const all=reasoning.map((_,i)=>D.chooseFigure(reasoning,i,{timeline:true,tokens:true}));
 assert.ok(all.includes('timeline')&&all.includes('tokens'));
 for(let i=1;i<all.length;i++)assert.notEqual(all[i],all[i-1],'no scene twice in a row');
 assert.equal(D.chooseFigure(entries,2,{todos:true}),'todos');
 assert.notEqual(D.chooseFigure(entries,2,{}),'todos');
});

test('outline replies are parsed, bounded and keep one chosen option',()=>{
 const o=parseOutline('好的：\n```json\n{"goal":"给插件加运行仪表","constraints":["零额外花费","不遮挡角色","x","y","z"],"options":[{"name":"DOM 条","for":"清晰","against":"占高度","chosen":true},{"name":"画布","for":"统一","chosen":true}],"decision":"用 DOM 条","open_questions":["窄屏放不下"]}\n```');
 assert.equal(o.goal,'给插件加运行仪表');
 assert.equal(o.constraints.length,4);
 assert.deepEqual(o.options.map(x=>x.chosen),[true,false]);
 assert.deepEqual(o.risks,['窄屏放不下']);
 assert.throws(()=>normalizeOutline({constraints:['a']}),/目标/);
 assert.throws(()=>parseOutline('no json'),/JSON/);
 // A missing closing brace is repaired.
 assert.equal(parseOutline('{"goal":"g","decision":"d","options":[]').decision,'d');
 const long='头'.repeat(5000)+'尾'.repeat(9000);
 const cut=reasoningExcerpt(long);
 assert.ok(cut.startsWith('头')&&cut.endsWith('尾')&&Array.from(cut).length<9100);
 assert.match(buildOutlineRequest({input:'问题',reasoning:'推理'}),/问题[\s\S]*推理/);
});

test('reasoning counts as over once an answer starts or the turn stops',()=>{
 const g=(nodes,running)=>({nodes,running});
 const nodes=[{id:'i',kind:'input',source:'问'},{id:'r',kind:'reasoning',source:'想'},{id:'k',kind:'check',source:'查'}];
 assert.equal(turnReasoning(g(nodes,true)).ended,false);
 assert.equal(turnReasoning(g([...nodes,{id:'a',kind:'answer',source:'答'}],true)).ended,true);
 assert.equal(turnReasoning(g(nodes,false)).ended,true);
 assert.equal(turnReasoning(g(nodes,false)).reasoning,'想查');
 assert.equal(turnReasoning(g([{id:'i',kind:'input',source:'问'}],false)).ended,false);
 assert.equal(turnReasoning(g([],false)),null);
});

test('the outline figure draws goal, options and decision as a flow',()=>{
 const outline={goal:'加仪表',constraints:['零花费','不遮挡'],options:[{name:'DOM',for:'清晰',against:'占高',chosen:true},{name:'画布',for:'统一',against:'难读',chosen:false}],decision:'用 DOM 条',risks:['窄屏']};
 const spec=buildFigure('outline',{entries,index:1,focus:entries[1],samples:[],box,outline});
 const text=spec.texts.map(t=>t.text).join('|');
 for(const word of ['GOAL','加仪表','OPTION ✓','DOM','DECISION','用 DOM 条','! 窄屏'])assert.ok(text.includes(word),word);
 assert.ok(spec.marks.some(m=>m.shape==='frame'));
 assert.equal(buildFigure('outline',{entries,index:1,focus:entries[1],samples:[],box,outline:null}).marks.length,0);
});
