'use strict';
const React=require('react');
const {createElement:h,useState,useEffect,useMemo,useRef,useLayoutEffect}=React;
const {buildProcess,mergeQueue,dwellMs,formFor,boardEntries}=require('./process-data.cjs');
const {useMotionAllowed}=require('./transition.cjs');
const readPref=()=>{try{return Number(JSON.parse(localStorage.getItem('tw:reading-seconds'))) || 8;}catch{return 8;}};
const short=(text,n=100)=>Array.from(String(text||'').replace(/\s+/g,' ').trim()).slice(0,n).join('');
const titles={register:'source.register / 内容寄存器',pipeline:'plan.sequence / 步骤序列',branches:'options.compare / 并列阅读',io:'tool.exchange / 请求与返回',code:'source.code / 代码原文',formula:'formula.extract / 公式原文',checklist:'verification.log / 核验记录',revision:'revision.log / 修正记录',sources:'source.index / 资料索引'};
// Receiving and reading are separate: new pieces queue up and each one stays
// at least `seconds` (longer for long text). Shared by every reading view.
function useReadingQueue({graph,replaying=false,suspended=false,coarse=false}){
 const derived=useMemo(()=>buildProcess(graph,{coarse}),[graph,coarse]);
 const [queue,setQueue]=useState(derived),[active,setActive]=useState(derived.entries[0]?.id||null);
 const [playing,setPlaying]=useState(!replaying),[seconds,setSeconds]=useState(()=>[5,8,12].includes(readPref())?readPref():8);
 const [tick,setTick]=useState(0);
 const started=useRef(Date.now());
 useEffect(()=>{
  setQueue(old=>mergeQueue(old,derived));
  if(queue.turn!==derived.turn){setActive(derived.entries[0]?.id||null);started.current=Date.now();setPlaying(!replaying);}
  else if(replaying){setActive(derived.entries.at(-1)?.id||null);setPlaying(false);}
 },[derived,replaying]);
 const entries=queue.turn===derived.turn?queue.entries:derived.entries;
 const index=Math.max(0,entries.findIndex(e=>e.id===active)),focus=entries[index],pending=Math.max(0,entries.length-index-1);
 useEffect(()=>{started.current=Date.now();},[focus?.id,suspended]);
 useEffect(()=>{
  if(!playing||replaying||suspended)return;
  const timer=setInterval(()=>setTick(n=>n+1),300);return()=>clearInterval(timer);
 },[playing,replaying,suspended]);
 useEffect(()=>{
  if(playing&&!replaying&&!suspended&&pending&&Date.now()-started.current>=dwellMs(focus,seconds))setActive(entries[index+1].id);
 },[tick,playing,replaying,suspended,pending,seconds,focus?.id]);
 useEffect(()=>{try{localStorage.setItem('tw:reading-seconds',JSON.stringify(seconds));}catch{}},[seconds]);
 const choose=id=>{setActive(id);setPlaying(false);started.current=Date.now();};
 const change=offset=>choose(entries[Math.max(0,Math.min(entries.length-1,index+offset))]?.id);
 return {derived,queue,entries,index,focus,pending,playing,setPlaying,seconds,setSeconds,started,choose,change};
}
function SequenceMap({entries,index,choose,motionAllowed,motion}){
 const marker=useRef(null),previous=useRef(null);
 const start=Math.max(0,index-5),visible=entries.slice(start,start+12);
 const lane=e=>e.kind==='input'?0:e.toolId?2:e.kind==='answer'?3:1;
 const point=(entry,i)=>({x:56+i*498/Math.max(1,visible.length-1),y:19+lane(entry)*22});
 const points=visible.map(point),at=points[index-start];
 useLayoutEffect(()=>{
  const old=previous.current;previous.current=at;
  if(!old||!at||!motionAllowed||!marker.current?.animate)return;
  const animation=marker.current.animate([{transform:`translate(${old.x-at.x}px,${old.y-at.y}px)`},{transform:'none'}],{duration:motion==='calm'?220:1600,easing:'cubic-bezier(.22,.72,.18,1)'});
  return()=>animation.cancel();
 },[at?.x,at?.y,motionAllowed,motion]);
 return h('div',{className:'tw-sequence-map'},h('div',null,h('span',null,'trace.route / 阅读路径'),h('small',null,'连线 = 原文先后顺序')),
  h('svg',{viewBox:'0 0 580 105',role:'group','aria-label':'输入、公开推理、工具、回答的原文顺序图'},
   ['IN','TH','IO','OUT'].map((name,i)=>h('g',{key:name},h('text',{x:0,y:22+i*22},name),h('line',{x1:39,x2:568,y1:19+i*22,y2:19+i*22,className:'tw-route-axis'}))),
   points.slice(1).map((p,i)=>h('path',{key:visible[i+1].id,d:`M ${points[i].x} ${points[i].y} L ${p.x} ${p.y}`,className:'tw-route-line'})),
   visible.map((entry,i)=>h('g',{key:entry.id,role:'button',tabIndex:0,'aria-label':'阅读片段 '+(start+i+1)+'：'+entry.label,onClick:()=>choose(entry.id),onKeyDown:e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(entry.id);}}},h('title',null,entry.op+' / '+short(entry.text,60)),h('rect',{x:points[i].x-8,y:points[i].y-8,width:16,height:16,fill:'transparent'}),h('rect',{x:points[i].x-3,y:points[i].y-3,width:6,height:6,className:'tw-route-node','data-status':entry.status}),h('text',{x:points[i].x,y:points[i].y-8,textAnchor:'middle'},String(start+i+1).padStart(2,'0')))),
   at?h('rect',{ref:marker,x:at.x-5,y:at.y-5,width:10,height:10,className:'tw-route-marker','aria-hidden':true}):null));
}
function Process({graph,onSelect,animate,motion,replaying=false,suspended=false}){
 const {derived,queue,entries,index,focus,pending,playing,setPlaying,seconds,setSeconds,started,choose,change}=useReadingQueue({graph,replaying,suspended});
 const nav=useRef(null),stage=useRef(null),positions=useRef(new Map()),animations=useRef([]),readingForm=useRef(null);
 const motionAllowed=useMotionAllowed(animate);
 // Hold the layout while a streamed sentence grows. Category refinements must
 // not turn one readable step into several rapid scene changes.
 if(readingForm.current?.id!==focus?.id)readingForm.current={id:focus?.id,form:formFor(focus)};
 const form=readingForm.current?.form||'register',board=boardEntries(entries,index);
 useEffect(()=>{
  const row=nav.current?.querySelector('[aria-current=step]');
  if(row){const top=row.offsetTop,bottom=top+row.offsetHeight,box=nav.current;if(top<box.scrollTop)box.scrollTop=top;else if(bottom>box.scrollTop+box.clientHeight)box.scrollTop=bottom-box.clientHeight;}
 },[focus?.id]);
 useEffect(()=>{
  const box=stage.current,row=box?.querySelector('[aria-current=step]');
  if(row){const outer=box.getBoundingClientRect(),inner=row.getBoundingClientRect();if(inner.bottom>outer.bottom)box.scrollTop+=inner.bottom-outer.bottom+8;else if(inner.top<outer.top)box.scrollTop-=outer.top-inner.top+8;}
 },[focus?.id,form]);
 // Retain cell identity through steps. Animate changed positions and the focus
 // marker only; the frame, text and operation rail never dissolve or flicker.
 useLayoutEffect(()=>{
  animations.current.forEach(a=>a.cancel());animations.current=[];
  const next=new Map();
  stage.current?.querySelectorAll('[data-entry-card]').forEach(el=>{
   const rect=el.getBoundingClientRect(),id=el.dataset.entryCard,old=positions.current.get(id);next.set(id,rect);
   if(!motionAllowed||!el.animate)return;
   if(old){const x=old.x-rect.x,y=old.y-rect.y;if(Math.abs(x)+Math.abs(y)>1)animations.current.push(el.animate([{transform:`translate(${x}px,${y}px)`},{transform:'none'}],{duration:motion==='calm'?220:1400,easing:'cubic-bezier(.22,.72,.18,1)'}));}
   else animations.current.push(el.animate([{opacity:.35,transform:'translateY(10px)'},{opacity:1,transform:'none'}],{duration:motion==='calm'?220:1200,easing:'ease-out'}));
  });
  positions.current=next;
  return()=>{animations.current.forEach(a=>a.cancel());animations.current=[];};
 },[focus?.id,form,motionAllowed,motion]);
 const openSource=entry=>onSelect(entry.spans?.length?entry.spans.map(span=>span.nodeId):entry.nodeId);
 const getNum=entry=>String(entries.findIndex(e=>e.id===entry.id)+1).padStart(2,'0');
 const chars=entries.map(e=>Array.from(e.text).length),maximum=Math.max(1,...chars),latestError=entries.findLast(e=>e.status==='error');
 const status=e=>e.kind==='request'?e.status==='running'?'运行中':e.status==='error'?'调用失败':e.status==='done'?'已返回':'已停止':e.kind==='result'?e.status==='error'?'错误返回':'已收到结果':e.status==='running'?'接收中':e.status==='stopped'?'已停止':'已接收';
 const card=entry=>h('button',{type:'button',key:entry.id,className:'tw-register-cell '+(entry.id===focus?.id?'tw-reading-cell':''),'data-entry-card':entry.id,'data-status':entry.status,'aria-current':entry.id===focus?.id?'step':undefined,onClick:()=>choose(entry.id)},
  h('span',{className:'tw-cell-head'},h('b',null,getNum(entry)),h('span',null,entry.op),h('small',null,status(entry))),
  h('p',null,short(entry.text,form==='branches'?190:110)),h('span',{className:'tw-cell-tail'},h('span',null,entry.kind==='request'||entry.kind==='result'?entry.title:entry.label),h('span',null,Array.from(entry.text).length+' 字')));
 const request=entries.find(e=>e.toolId===focus?.toolId&&e.kind==='request');
 const result=entries.find(e=>e.toolId===focus?.toolId&&e.kind==='result');
 const code=focus?.text.match(/```[^\n]*\n([\s\S]*?)(?:```|$)/)?.[1]||focus?.text||'';
 const categories=[['公开推理',entries.filter(e=>!['input','answer','request','result','error','retry'].includes(e.kind)).length],['工具',new Set(entries.filter(e=>e.toolId).map(e=>e.toolId)).size],['回答片段',entries.filter(e=>e.kind==='answer').length]];
 return h('section',{className:'tw-process','data-form':form,'data-reading':playing?'playing':'paused','data-active-entry':focus?.id||'', 'aria-label':'逐条思路仪表'},
  h('div',{className:'tw-process-strip'},h('span',null,'PUBLIC TRACE / ',String(index+(focus?1:0)).padStart(2,'0'),' · ',focus?.op||'STANDBY'),
   h('svg',{viewBox:'0 0 240 22','aria-label':'近期片段字数，每条竖线代表一个原文片段'},chars.slice(-48).map((n,i,a)=>h('line',{key:i,x1:3+i*234/Math.max(1,a.length-1),x2:3+i*234/Math.max(1,a.length-1),y1:11-9*n/maximum,y2:11+9*n/maximum,stroke:'currentColor',strokeWidth:2}))),
   h('span',{className:latestError?'tw-process-error':''},graph.running?'● 接收中':latestError?'● 有错误记录':'■ 接收结束')),
  h('div',{className:'tw-process-deck'},
   h('section',{className:'tw-process-main tw-inset-frame'},
    h('header',{className:'tw-frame-caption'},h('span',null,'/ '+titles[form]),h('small',null,'原文顺序 · 非内部参数')),
    h('div',{className:'tw-process-topic'},h('small',null,'STDIN / 当前问题'),h('p',null,short(queue.input,110)||'等待输入，一起展开新的思路。')),
    h('div',{className:'tw-process-focusline'},h('span',null,focus?.label||'等待公开内容'),h('span',null,'READ ',String(index+(focus?1:0)).padStart(2,'0'),' / ',entries.length)),
    h('div',{ref:stage,className:'tw-process-board'},
     !focus?h('div',{className:'tw-process-idle'},h('b',null,'[ _ ]'),h('p',null,'公开推理、工具请求和返回将在这里逐条展开。')):
     form==='code'||form==='formula'?h('div',{className:'tw-process-code','data-entry-card':focus.id},h('span',null,form==='code'?'READ ONLY / 源码摘录':'EXPRESSION / 原文公式'),h('pre',null,code),h('button',{type:'button',onClick:()=>openSource(focus)},'打开来源 ↗')):
     form==='io'?h('div',{className:'tw-process-io'},h('div',{className:'tw-io-route'},h('span',null,'REQUEST'),h('i',{'aria-hidden':true}),h('b',null,focus.title),h('i',{'aria-hidden':true}),h('span',null,'RETURN')),h('div',{className:'tw-io-panels'},[request,result].map((entry,i)=>h('section',{key:i,'data-entry-card':entry?.id||'waiting'},h('header',null,i?'stdout / 返回原文':'stdin / 调用参数'),entry?h('pre',null,entry.text):h('p',{className:'tw-waiting-result'},'尚未收到返回'),entry?h('button',{type:'button',onClick:()=>openSource(entry)},'打开来源 ↗'):null)))):
     h('div',{className:'tw-process-cells'},board.map(card))),
    entries.length?h(SequenceMap,{entries,index,choose,motionAllowed,motion}):null,
    h('footer',{className:'tw-process-stats'},categories.map(([label,count])=>h('span',{key:label},h('b',null,String(count).padStart(2,'0')),' '+label)),h('small',null,'片段按原文拆分'))),
   h('aside',{className:'tw-ops tw-inset-frame','aria-label':'过程操作索引'},h('div',{className:'tw-frame-caption'},'ops / '+entries.length),h('nav',{ref:nav},entries.map(entry=>h('button',{type:'button',key:entry.id,'aria-current':entry.id===focus?.id?'step':undefined,onClick:()=>choose(entry.id),title:short(entry.text,100)},h('small',null,getNum(entry)),h('b',null,entry.op),h('span',null,entry.label))))),
  ),
  h('section',{className:'tw-process-source tw-inset-frame'},h('div',{className:'tw-frame-caption'},h('span',null,'stdout / 当前原文'),focus?h('button',{type:'button',onClick:()=>openSource(focus)},'完整来源 ↗'):null),h('div',{className:'tw-process-source-text',key:focus?.id,tabIndex:0},h('span',{'aria-hidden':true},'> '),focus?.text||'等待公开文本。')),
  h('div',{className:'tw-reading-controls'},h('button',{type:'button','aria-label':'上一条思路',disabled:index===0,onClick:()=>change(-1)},'←'),h('button',{type:'button',onClick:()=>{started.current=Date.now();setPlaying(!playing);},disabled:replaying},playing?'Ⅱ 暂停阅读':'▷ 继续逐条'),h('button',{type:'button','aria-label':'下一条思路',disabled:!pending,onClick:()=>change(1)},'→'),h('label',null,'停留 ',h('select',{'aria-label':'每步最少停留时间',value:seconds,onChange:e=>{setSeconds(Number(e.target.value));started.current=Date.now();}},[5,8,12].map(v=>h('option',{key:v,value:v},v+' 秒')))),h('span',{className:'tw-queue-status','aria-live':'polite'},pending?'后面还有 '+pending+' 条':'已到末尾'),h('button',{type:'button',disabled:!pending,onClick:()=>choose(entries.at(-1)?.id)},'跳到最新')),
  queue.omitted?h('p',{className:'tw-process-note'},'较早片段已省略；完整内容仍在左侧原生对话。'):null,
  !queue.hasReasoning&&entries.length?h('p',{className:'tw-process-note'},'本轮未提供公开推理；这里仅拆分输入、工具事件与回答。'):null);
}
module.exports={Process,useReadingQueue};
