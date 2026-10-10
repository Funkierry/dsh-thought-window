'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {stagePages,nextPage,pacePage,PAGE_SECONDS}=require('../src/stage-pages.cjs');
const {FIGURES,buildFigure}=require('../src/stage-figures.cjs');
const entries=[
 {id:'in',kind:'input',op:'IN',text:'把文件和程序运行过程可视化。'},
 {id:'plan',kind:'plan',op:'PLAN',text:'First collect public text and file records. Group the text into readable paragraphs and visualize the file records.'},
 {id:'check',kind:'check',op:'CHECK',text:'Check the text and file records against the public tool results. Keep reading and page playback independent.'}
];
test('a fixed reading position has several distinct complete pages, in a repeatable cycle',()=>{
 const ids=stagePages(entries,2);
 assert.equal(PAGE_SECONDS,3);
 assert.ok(ids.length>=8);
 assert.equal(new Set(ids).size,ids.length);
 assert.ok(ids.every(id=>id==='actor'||FIGURES.includes(id)));
 let current=ids[0];const seen=[];
 for(let i=0;i<ids.length;i++){seen.push(current);current=nextPage(ids,current);}
 assert.deepEqual(seen,ids);assert.equal(current,ids[0]);
 assert.equal(nextPage(ids,ids[0],-1),ids.at(-1));
 assert.deepEqual(stagePages(entries,2),ids);
});
test('pages with absent data are excluded; admitted text pages render actual content',()=>{
 const ids=stagePages(entries,2,{actor:false});
 for(const id of ['timeline','tokens','todos','files','outline','actor'])assert.ok(!ids.includes(id));
 const box={w:850,h:540,raster:()=>({w:10,h:10,points:[]})};
 for(const id of ids){
  const spec=buildFigure(id,{entries,index:2,focus:entries[2],box,samples:[],running:false});
  assert.ok(spec.marks.length>0,id+' has a drawing');
  assert.ok(!spec.texts.some(t=>/needs two|needs three|no recurring words/.test(t.text)),id+' is not an empty-data page');
 }
 const available=stagePages(entries,2,{avail:{timeline:true,tokens:true,todos:true,files:true},outline:true});
 for(const id of ['timeline','tokens','todos','files','outline'])assert.ok(available.includes(id));
 const input=stagePages(entries,0,{actor:false});
 for(const id of ['radar','grid','mask','heatmap','constellation'])assert.ok(!input.includes(id),'skip premature '+id);
 assert.deepEqual(stagePages([],0,{actor:false}),['idle']);
 assert.deepEqual(stagePages([],0),['actor']);
});
test('page entrance finishes early enough to leave reading time, without changing values or source ids',()=>{
 const spec={caption:'original',marks:[{id:'a',delay:500,x:12},{id:'b',delay:20000,x:33}],texts:[{key:'t',text:'public text',delay:7000}]};
 const before=JSON.stringify(spec),after=pacePage(spec);
 assert.equal(JSON.stringify(spec),before,'does not mutate the original');
 assert.deepEqual(after.marks.map(m=>[m.id,m.x]),[['a',12],['b',33]]);
 assert.ok(after.marks.every(m=>m.delay<=400));
 assert.ok(after.texts.every(t=>t.delay<=250));
 assert.equal(after.texts[0].text,'public text');
 assert.equal(after.caption,'original');
});
