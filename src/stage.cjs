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
