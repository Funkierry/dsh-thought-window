'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const D=require('../src/stage-data.cjs');
const {buildFigure,FIGURES}=require('../src/stage-figures.cjs');
const {buildProcess}=require('../src/process-data.cjs');

const reasoning='先梳理当前问题：模型返回很快，但阅读需要更长的停留时间。\n约束：左侧继续使用原生聊天。\n首先拆解三个步骤：收集文本、建立阅读队列、逐步呈现画面。\n第一步：把公开推理按句子拆分。\n方案 A：使用 SVG 绘制关系，保留文字选择。\n方案 B：使用 Canvas 绘制密集场景。\n检查：流式片段沿用原编号。\n代码片段：\n```js\nconst hold = 8000;\n```\n';
function graph(){
 const legacy={nodes:[
  {kind:'user',seq:1,turn:1,content:[{type:'text',text:'优化实时聊天画布，统一像素终端风格。'}]},
  {kind:'assistant',seq:2,turn:1,step:0,blocks:[{kind:'reasoning',text:reasoning},{kind:'tool-call',name:'read_file',callId:'v',argsRaw:'{"path":"src/view.cjs"}'}]},
  {kind:'tool-result',seq:3,callId:'v',content:[{type:'text',text:'文件已读取。\n找到组件入口。'}]},
  {kind:'assistant',seq:4,turn:1,step:1,blocks:[{kind:'text',text:'已完成。\n| 项目 | 状态 |\n| --- | --- |\n| 画布 | 完成 |'}]}],partial:null,runningCalls:[]};
 return require('../src/core.cjs').project(legacy,false);
}
const box={w:900,h:600,raster:(text,size,step)=>({w:size*2,h:size,points:Array.from({length:40},(_,i)=>({x:(i%10)*step,y:Math.floor(i/10)*step}))})};

test('word chips keep their source offsets and fold punctuation into the previous word',()=>{
 const text='检查：流式片段, ok.';
 const list=D.words(text);
 for(const w of list)assert.ok(text.startsWith(w.text.replace(/\s/g,'').slice(0,1),w.index),`chip ${w.text} starts at its offset`);
 assert.equal(list.map(w=>w.text).join('').replace(/\s/g,''),text.replace(/\s/g,''),'chips cover the sentence');
 assert.ok(list.every(w=>!/^[，,：:。.]+$/u.test(w.text)),'no chip is punctuation only');
});

test('keywords ignore punctuation, stop words and single characters',()=>{
 const list=D.keywords(['我想做一个画布：画布要像素风。','画布与像素'],5).map(k=>k.word);
 assert.equal(list[0],'画布');
 assert.ok(!list.some(w=>/[：。]/u.test(w)));
 assert.ok(!list.includes('我想'));
});

test('overlap is lower-triangular with a unit diagonal and symmetric pairs',()=>{
 const texts=['使用 SVG 绘制关系','使用 Canvas 绘制场景','完全不同的句子'];
 const M=D.overlap(texts);
 M.forEach((row,i)=>{assert.equal(row.length,i+1);assert.equal(row[i],1);});
 assert.equal(M[1][0],D.jaccard(D.bigrams(texts[1]),D.bigrams(texts[0])));
 assert.ok(M[1][0]>M[2][0]);
});

test('projection is deterministic and normalised',()=>{
 const a=D.project(['甲乙丙','甲乙丁','完全无关的文本']),b=D.project(['甲乙丙','甲乙丁','完全无关的文本']);
 assert.deepEqual(a,b);
 for(const p of a)for(const v of p)assert.ok(v>=0&&v<=1);
});

test('figure choice is stable per queue position, follows the content kind and avoids repeats',()=>{
 const entries=buildProcess(graph()).entries;
 const figures=entries.map((_,i)=>D.chooseFigure(entries,i));
 assert.deepEqual(figures,entries.map((_,i)=>D.chooseFigure(entries,i)),'pure');
 assert.equal(figures[0],'glyph');
 entries.forEach((e,i)=>{
  if(e.kind==='request'||e.kind==='result')assert.equal(figures[i],'exec');
  if(e.kind==='code')assert.equal(figures[i],'code');
 });
 assert.ok(figures.includes('table'),'markdown table answers become a table');
 const plain=entries.map((e,i)=>[e,figures[i]]).filter(([e])=>['analysis','constraint'].includes(e.kind));
 for(let i=1;i<plain.length;i++)if(entries.indexOf(plain[i][0])===entries.indexOf(plain[i-1][0])+1)assert.notEqual(plain[i][1],plain[i-1][1]);
 assert.ok(new Set(figures).size>=5,'a turn uses several drawings');
});

test('every figure stays inside the canvas, keeps unique ids and grows from below',()=>{
 const entries=buildProcess(graph()).entries;
 const samples=[0,1,2,3,4].map(i=>({t:1000+i*300,chars:i*40}));
 for(const id of FIGURES)for(const index of [0,Math.floor(entries.length/2),entries.length-1]){
  const spec=buildFigure(id,{entries,index,focus:entries[index],samples,box,running:false});
  const ids=new Set();
  for(const m of spec.marks){
   assert.ok(!ids.has(m.id),`${id}: duplicate mark ${m.id}`);ids.add(m.id);
   assert.ok(m.x>=-2&&m.x<=box.w+2&&m.y>=-2&&m.y<=box.h+2,`${id}: mark ${m.id} outside (${m.x},${m.y})`);
   if(m.from)assert.ok(m.from.y>=m.y-1,`${id}: ${m.id} is born at or below its place`);
  }
  assert.ok(spec.marks.length<=3200,`${id}: bounded marks`);
  assert.ok(spec.texts.every(t=>typeof t.key==='string'&&typeof t.text==='string'),`${id}: texts are keyed`);
  assert.equal(new Set(spec.texts.map(t=>t.key)).size,spec.texts.length,`${id}: unique text keys`);
  assert.ok(spec.caption.length>0,`${id}: has a data caption`);
 }
});

test('streaming growth keeps ids of the marks that were already drawn',()=>{
 const g=graph(),entries=buildProcess(g).entries,index=entries.findIndex(e=>e.kind==='answer'&&D.length(e.text)>6);
 const short={...entries[index],text:entries[index].text.slice(0,3)};
 const before=buildFigure('compose',{entries:entries.map((e,i)=>i===index?short:e),index,focus:short,box,samples:[]});
 const after=buildFigure('compose',{entries,index,focus:entries[index],box,samples:[]});
 const ids=new Set(after.marks.map(m=>m.id));
 assert.ok(before.marks.every(m=>ids.has(m.id)));
 assert.ok(after.marks.length>before.marks.length);
});
