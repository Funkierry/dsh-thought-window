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
