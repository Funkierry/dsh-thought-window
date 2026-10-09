const {test}=require('node:test');
const assert=require('node:assert/strict');
const {project}=require('../src/core.cjs');
const {classifyScene,detectScene,routeScene,buildScene}=require('../src/scenes.cjs');
const graph=(text,extra={})=>project({nodes:[{kind:'user',seq:1,content:[{type:'text',text:'设计一个思路画布'}]}],partial:{turn:1,step:0,blocks:[{kind:'reasoning',text}]},runningCalls:[],...extra},true);
test('content routes to distinct templates in Chinese and English',()=>{
  const cases={plan:'计划：分解任务，第一步读取事件，第二步安排布局。',compare:'比较：方案 A 使用 SVG。方案 B 使用 Canvas。',search:'检索：搜索插件文档，查阅资料。',code:'代码：定义 function renderScene() {}',math:'公式推导：方程 y = ax + b。',check:'验证：检查 ID 是否稳定，测试流式结果。',revise:'修正：重新考虑这个假设，改为使用已公开的事件。',analysis:'需要了解这个问题中的关联。'};
  for(const [expected,text] of Object.entries(cases))assert.equal(detectScene(graph(text)).id,expected,text);
  assert.equal(classifyScene('Compare alternatives and trade-offs.').id,'compare');
  assert.equal(classifyScene('一些上下文。\n公式：推导 x = 2y').id,'math');
});
test('current turn is isolated and concrete tool/answer events take priority',()=>{
  const g=graph('搜索资料');
  g.nodes.push({id:'u2',kind:'input',source:'新的问题'});
  assert.equal(detectScene(g).id,'analysis');assert.equal(buildScene(g,'search').tools.length,0);
  g.nodes.push({id:'tool:x',kind:'tool',status:'running',source:'{}'});
  assert.equal(detectScene(g).id,'execute');
  g.nodes.at(-1).status='error';assert.equal(detectScene(g).id,'revise');
  g.nodes.push({id:'answer',kind:'answer',source:'回答'});assert.equal(detectScene(g).id,'summary');
  assert.equal(detectScene({nodes:[]}).id,'idle');
});
test('director avoids keyword flicker, confirms transitions and resets on a new turn',()=>{
  const candidate=id=>({id,turn:'one',reason:'test'});
  let state=routeScene(null,candidate('analysis'),0);
  state=routeScene(state,candidate('compare'),100);
  state=routeScene(state,candidate('analysis'),400);
  assert.equal(state.id,'analysis');assert.equal(state.pending,null);
  state=routeScene(state,candidate('compare'),500);
  assert.equal(routeScene(state,candidate('compare'),1300).id,'analysis');
  state=routeScene(state,candidate('compare'),1500);assert.equal(state.id,'compare');
  state=routeScene(state,candidate('execute'),1600);
  assert.equal(routeScene(state,candidate('execute'),1900).id,'execute');
  assert.equal(routeScene(state,{...candidate('plan'),turn:'two'},1601).id,'plan');
  assert.equal(routeScene(state,candidate('search'),1601,true).id,'search');
});
test('comparison, code and formula contents are anchored in source, without invented alternatives',()=>{
  const g=graph('比较：\n方案 A：保留原生聊天。\n方案 B：在旁边放置画布。');
  const model=buildScene(g,'compare');
  assert.equal(model.options.length,2);assert.match(model.options[1].text,/放置画布/);
  assert.ok(model.options.every(item=>g.nodes.some(n=>n.id===item.nodeId&&n.source.includes(item.text))));
  assert.equal(buildScene(graph('比较现有方式，暂时只有一个观察片段。'),'compare').options.length,0);
  assert.equal(buildScene(graph('方案 A：只发现一个方案。'),'compare').options.length,1);
  assert.equal(buildScene(graph('代码：\n```js\nconst x = 1;\n```'),'code').code,'const x = 1;\n');
  const formulas=buildScene(graph('公式推导：$y = ax + b$'),'math').formulas;
  assert.equal(formulas[0].text,'y = ax + b');
});
test('template fragments and tool lists stay bounded for long traces',()=>{
  const g=graph('检查每一项。'.repeat(1000));
  assert.ok(buildScene(g,'check').items.length<=8);
  for(let i=0;i<10;i++)g.nodes.push({id:'t'+i,kind:'tool',source:'result',status:'done'});
  assert.equal(buildScene(g,'execute').tools.length,6);
});
test('long code fences survive segmentation and neutral continuations preserve scene context',()=>{
  const code='function renderScene(event) {\n'+Array.from({length:16},(_,i)=>'  const stage'+i+' = event.publicText;').join('\n')+'\n}';
  const g=graph('代码：\n```js\n'+code+'\n```');
  assert.ok(g.nodes.length>3);assert.equal(buildScene(g,'code').code,code+'\n');
  const plan=graph('计划：先分解步骤。'.repeat(8)+'\n然后把这些内容连起来。');
  assert.equal(detectScene(plan).id,'plan');
  assert.equal(detectScene(graph('第三步：将文字映射到画布。')).id,'plan');
});
