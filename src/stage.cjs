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
const {useStageDirector,useThoughtOutline,ROUTE}=require('./director.cjs');
const {Intro,claimIntro}=require('./stage-intro.cjs');
const {ACTIONS}=require('./director-script.cjs');
const {FIGURES}=require('./stage-figures.cjs');
const {runMetrics,fmtMs,fmtTok}=require('./run-metrics.cjs');
const VERSION='0.14.2';
// Pacing: scenes hold 5 s, each action plays 6 s, pose frames run 1.5x slower than the base tempo.
const SCENE_HOLD=5000,ACTION_STEP=4000,POSE_SLOW=1.5;
// Once the reply is complete it stays readable this long, then folds away so
// the actor has the whole stage (the reply is also in the chat on the left).
const FOLD_AFTER=8000;
// A freshly arrived thought outline is shown this long, then the stage returns.
const OUTLINE_SHOW=12000;
const {WHALE,TEMPO,TRAVEL:TRAVELS,programOf,phaseOf,terminalOf,answerOf,logOf,fillOf,buildActorScene,lookOf,framesOfLook,paletteOf}=require('./stage-actor.cjs');
// DeepSeek's whale mark, read once from the host's own favicon (the plugin
// does not ship it). Until it arrives, or if it cannot be read, a hand-drawn
// whale of the same pose is used.
let markPromise=null;
function useWhaleMark(){
 const [mark,setMark]=useState(null);
 useEffect(()=>{
  markPromise=markPromise||fetch('/favicon.svg',{credentials:'same-origin'}).then(r=>r.ok?r.text():'').then(t=>{if(!/viewBox="0 0 50 50"/.test(t))return null;const d=/<path[^>]*\sd="([^"]{200,8000})"/.exec(t)?.[1];return d&&/^[\sMmLlHhVvCcSsQqTtZz0-9.,eE-]+$/.test(d)?d:null;}).catch(()=>null);
  let alive=true;markPromise.then(d=>{if(alive)setMark(d);});return()=>{alive=false;};
 },[]);
 return mark;
}
const readPref=(name,fallback)=>{try{return JSON.parse(localStorage.getItem('tw:'+name))??fallback;}catch{return fallback;}};
const writePref=(name,value)=>{try{localStorage.setItem('tw:'+name,JSON.stringify(value));}catch{}};
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
// The chat pane's header: the current actor as a pixel avatar, its name and
// live state. 对话 / 轨迹 drive DSH's own (hidden) tab buttons.
function PixelAvatar({sprite,size=44}){
 const ref=useRef(null);
 useEffect(()=>{
  const c=ref.current;if(!c||!sprite)return;
  const dpr=Math.min(2,globalThis.devicePixelRatio||1),x=c.getContext('2d'),rows=sprite.rows,w=rows[0].length,h=rows.length,cell=Math.max(1,Math.floor(size*.8/Math.max(w,h)));
  c.width=size*dpr;c.height=size*dpr;x.setTransform(dpr,0,0,dpr,0,0);x.clearRect(0,0,size,size);
  const ox=Math.round((size-w*cell)/2),oy=Math.round((size-h*cell)/2);
  rows.forEach((row,yy)=>[...row].forEach((ch,xx)=>{const color=sprite.palette[ch];if(color){x.fillStyle=color;x.fillRect(ox+xx*cell,oy+yy*cell,cell,cell);}}));
 },[sprite,size]);
 return h('canvas',{ref,className:'tw-chat-avatar',style:{width:size,height:size},'aria-hidden':true});
}
const PHASE_TEXT={idle:'待机',think:'思考中',tool:'调用工具中',answer:'回答中',done:'在线'};
function nativeTabs(anchor){
 const root=anchor?.closest('.tw-native-shell');
 return root?[...root.querySelectorAll(':scope > [class*="_header"] [class*="_tab"]')].filter(b=>b.tagName==='BUTTON'):[];
}
function ChatHead({actor,avatar,phase,action,model,rounds,steps,tokens,outlineTokens}){
 const ref=useRef(null),[,refresh]=useState(0);
 const tabs=nativeTabs(ref.current);
 return h(React.Fragment,null,h('div',{className:'tw-chat-head',ref},
  h(PixelAvatar,{sprite:avatar}),
  h('div',{className:'tw-chat-who'},h('b',null,actor.name),h('small',{'data-phase':phase},h('i'),(PHASE_TEXT[phase]||phase)+' · '+action+'()'+(model?' · '+model:''))),
  tabs.length?h('nav',{className:'tw-chat-tabs'},tabs.map((tab,i)=>h('button',{type:'button',key:i,'aria-pressed':/Active/.test(tab.className),onClick:()=>{tab.click();setTimeout(()=>refresh(n=>n+1),50);}},tab.textContent))):null),
  h('div',{className:'tw-chat-foot'},`${rounds} 轮 · ${steps} 步`+(tokens?` · 导演 ${tokens.toLocaleString('en-US')} tok`:'')+(outlineTokens?` · 提纲 ${outlineTokens.toLocaleString('en-US')} tok`:'')));
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
// Data scenes rebuild when their records change; a running span also every 2 s.
const DATA_FIGURES=['timeline','todos','tokens','files'];
function dataKey(figure,m,work){
 if(figure==='files')return (work?.files||[]).map(f=>f.path+f.changes+f.status+f.declared).join();
 if(figure==='todos')return (m?.todos||[]).map(t=>t.status[0]+t.content.length).join();
 if(figure==='tokens')return [m?.usage?.input,m?.usage?.output,m?.context?.used,m?.outputTokens].join();
 return (m?.spans||[]).map(s=>s.id+(s.end??'')).join()+(m?.running?':'+Math.floor(Date.now()/2000):'');
}
// The run HUD: what this turn has cost so far, from DSH's records only.
// An item DSH did not record is left out rather than shown as zero.
function Meter({share,danger}){
 const cells=10,on=Math.round(Math.max(0,Math.min(1,share))*cells);
 return h('i',{className:'tw-hud-meter','data-danger':danger?'true':undefined,'aria-hidden':true},Array.from({length:cells},(_,i)=>h('b',{key:i,'data-on':i<on?'true':undefined})));
}
function Hud({metrics:m}){
 if(!m||m.start==null&&!m.usage&&!m.context&&!m.todos.length)return null;
 const done=m.todos.filter(t=>t.status==='completed').length;
 const items=[
  m.elapsedMs!=null&&['turn',fmtMs(m.elapsedMs),m.running?'live':null,'本轮已用时间'],
  m.steps>0&&['model',fmtMs(m.llmMs)+' · '+m.steps+' step'+(m.steps>1?'s':''),null,'模型生成耗时与步数'],
  m.tools>0&&['tools',fmtMs(m.toolMs)+' · '+m.tools+(m.toolErrors?' · '+m.toolErrors+' ✕':''),m.toolErrors?'danger':null,'工具执行耗时、次数与失败数'],
  m.ttftMs!=null&&['ttft',fmtMs(m.ttftMs),null,'第一个 token 的等待时间'],
  m.tokensPerSecond&&['speed',Math.round(m.tokensPerSecond)+' tok/s',null,'本轮解码速度（输出 token / 解码耗时）'],
  m.outputTokens!=null&&['out',fmtTok(m.outputTokens)+' tok',null,'本轮输出 token'],
  m.usage?.cacheHit!=null&&['cache',Math.round(m.usage.cacheHit*100)+'%',null,'会话累计输入的缓存命中率',m.usage.cacheHit],
  m.context&&['ctx',fmtTok(m.context.used)+' / '+fmtTok(m.context.window),m.context.share>.8?'danger':null,'上下文占用（DSH contextPressure）',m.context.share],
  m.todos.length&&['todo',done+' / '+m.todos.length,null,'待办完成数',done/m.todos.length]
 ].filter(Boolean);
 if(!items.length)return null;
 return h('div',{className:'tw-hud',role:'status','aria-label':'本轮运行数据'},items.map(([key,value,state,title,share])=>
  h('span',{key,title,'data-key':key,'data-state':state||undefined},h('small',null,key),share!=null?h(Meter,{share,danger:state==='danger'}):null,h('b',null,value))));
}
function Stage({graph,metricsSource=null,sessionId='session',onSelect,animate,motion,replaying=false,suspended=false,theme,menu,menuOpen,onMenu,omitted=0,source='LIVE'}){
 const {queue,entries,index,focus,pending,playing,setPlaying,seconds,setSeconds,started,choose,change}=useReadingQueue({graph,replaying,suspended,coarse:true});
 const arrival=useArrival(graph,queue.turn);
 const motionAllowed=useMotionAllowed(animate);
 const canvas=useRef(null),engine=useRef(null),ops=useRef(null),[, setClock]=useState(0),[caption,setCaption]=useState('');
 // Run records (timing, tokens, todos, files) for the HUD and the data scenes.
 const metrics=metricsSource?runMetrics(metricsSource.legacy,metricsSource.running,metricsSource.projections,Date.now()):null;
 const avail={timeline:(metrics?.spans.length||0)>=2,tokens:!!(metrics?.usage||metrics?.context),todos:!!metrics?.todos.length,files:!!graph.work?.files?.length};
 const availKey=Object.keys(avail).filter(k=>avail[k]).join();
 const figure=useMemo(()=>D.chooseFigure(entries,index,avail),[entries,index,availKey]);
 // Actor mode: the director's character on stage; measurement figures only in metrics mode.
 const [mode,setMode]=useState(()=>readPref('stage-mode','actor')==='metrics'?'metrics':'actor');
 const [directing,setDirecting]=useState(()=>readPref('director',true)!==false);
 useEffect(()=>{writePref('stage-mode',mode);},[mode]);
 useEffect(()=>{writePref('director',directing);},[directing]);
 const director=useStageDirector({graph,sessionId,enabled:mode==='actor'&&directing&&!replaying});
 // Thought outline: one optional extra call once the reasoning is over.
 const [outlineOn,setOutlineOn]=useState(()=>readPref('outline',true)!==false);
 useEffect(()=>{writePref('outline',outlineOn);},[outlineOn]);
 const thought=useThoughtOutline({graph,sessionId,enabled:outlineOn&&!replaying});
 const outlineTokens=thought.usage?(thought.usage.inputTokens||0)+(thought.usage.outputTokens||0)+(thought.usage.cacheReadTokens||0):0;
 // Shown by hand (pinned) or for OUTLINE_SHOW ms after it arrives live.
 const [outlinePin,setOutlinePin]=useState(null),outlineWas=useRef(thought.status);
 useEffect(()=>{setOutlinePin(null);},[queue.turn]);
 useEffect(()=>{
  if(outlineWas.current==='pending'&&thought.status==='ready'&&thought.outline)setOutlinePin('auto');
  outlineWas.current=thought.status;
 },[thought.status,thought.outline]);
 useEffect(()=>{if(outlinePin!=='auto')return;const t=setTimeout(()=>setOutlinePin(p=>p==='auto'?null:p),OUTLINE_SHOW);return()=>clearTimeout(t);},[outlinePin]);
 // Opening sequence: once per page load, unless turned off or motion is reduced.
 const [introOn,setIntroOn]=useState(()=>readPref('intro',true)!==false);
 const [intro,setIntro]=useState(()=>introOn&&!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches&&claimIntro());
 const [hostModel,setHostModel]=useState(null);
 useEffect(()=>{writePref('intro',introOn);},[introOn]);
 useEffect(()=>{fetch(ROUTE+'/status',{credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(d=>{if(d?.model)setHostModel(d.model);}).catch(()=>{});},[]);
 const front=useRef(null),actorEngine=useRef(null);
 const livePhase=phaseOf(graph),script=director.script,actor=director.actor||WHALE;
 // The actor's look (preset, drawn rig or old row sprite) and its resting pose.
 const mark=useWhaleMark();
 const look=useMemo(()=>lookOf(actor,mark),[actor,mark]);
 const avatar=useMemo(()=>({palette:paletteOf(look),rows:framesOfLook(look,'idle')[0]}),[look]);
 const beat=script?.beats?.[livePhase]||{action:{think:'think',tool:'type',answer:'nod',done:'idle',idle:'idle'}[livePhase]||'idle',say:''};
 const actions=beat.actions?.length?beat.actions:[beat.action];
 const terminal=mode==='actor'?terminalOf(graph,script):null;
 // Scenes: while the model thinks (or runs a non-shell tool) the stage shows the
 // visualization for the step being read; the actor returns to answer, with the
 // answer typed on the canvas. A step picked by hand shows its own scene.
 const manual=!playing&&!replaying&&!!focus;
 const showOutline=!!outlinePin&&!!thought.outline&&!manual;
 const wantScene=showOutline?'outline':mode!=='actor'?'metrics':(manual?focus.kind!=='answer'&&!(terminal&&['code','request','result'].includes(focus.kind)):livePhase==='think'||livePhase==='tool'&&!terminal)?'thought':'actor';
 // A scene holds for at least SCENE_HOLD ms, so think / tool / think flips do
 // not flash the stage; a hand-picked step or the metrics view switches at once.
 const [scene,setScene]=useState(wantScene),sceneSince=useRef(Date.now());
 useEffect(()=>{
  if(wantScene===scene)return;
  const wait=manual||[wantScene,scene].some(x=>x==='metrics'||x==='outline')?0:Math.max(0,SCENE_HOLD-(Date.now()-sceneSince.current));
  const t=setTimeout(()=>{sceneSince.current=Date.now();setScene(wantScene);},wait);
  return()=>clearTimeout(t);
 },[wantScene,scene,manual]);
 const answer=scene==='actor'&&!terminal&&(livePhase==='answer'||livePhase==='done'||manual)?answerOf(graph):null;
 const [foldOn,setFoldOn]=useState(()=>readPref('fold-answer',true)!==false);
 useEffect(()=>{writePref('fold-answer',foldOn);},[foldOn]);
 const [folded,setFolded]=useState(false),foldedTurn=useRef(null);
 useEffect(()=>{if(livePhase!=='done')setFolded(false);},[livePhase,queue.turn]);
 useEffect(()=>{
  if(!foldOn||livePhase!=='done'||!answer||manual||foldedTurn.current===queue.turn)return;
  const t=setTimeout(()=>{foldedTurn.current=queue.turn;setFolded(true);},FOLD_AFTER);
  return()=>clearTimeout(t);
 },[foldOn,livePhase,!!answer,manual,queue.turn]);
 const output=folded&&!manual?null:answer;
 const tokens=director.usage?(director.usage.inputTokens||0)+(director.usage.outputTokens||0)+(director.usage.cacheReadTokens||0):0;
 // Two clocks: the action sequence advances every few seconds, pose frames at the action's tempo.
 const animated=mode==='actor'&&useMotionAllowed(animate)&&!suspended;
 const [seqTick,setSeqTick]=useState(0),[frame,setFrame]=useState(0);
 // The show for this phase: the director's actions, then an encore that suits
 // the character and scenery (a finished reply keeps performing).
 const program=useMemo(()=>programOf(actions,{look,env:script?.env||'none',phase:livePhase,seed:D.hash(String(queue.turn)+(actor.name||''))}),[actions.join(),look,script?.env,livePhase,queue.turn,actor.name]);
 const act=program[seqTick%program.length];
 // While the model thinks, its live text fills the actor's shape; otherwise pixels.
 const style=livePhase==='think'&&!terminal?'glyph':'pixel';
 // A move the director defined for this action, if any.
 const move=script?.moves?.[act]?{...script.moves[act],name:act}:null;
 const poseFrames=useMemo(()=>framesOfLook(look,act,move),[look,act,move?.name,script]);
 const poses=poseFrames.length,tempo=move?move.period*1000/4:TEMPO[act]||400;
 useEffect(()=>{setSeqTick(0);},[livePhase,script]);
 useEffect(()=>{if(!animated||program.length<2)return;const t=setInterval(()=>setSeqTick(n=>n+1),ACTION_STEP);return()=>clearInterval(t);},[animated,program.join()]);
 useEffect(()=>{if(!animated||(poses<2&&style!=='glyph'))return;const t=setInterval(()=>setFrame(n=>n+1),Math.max(140,tempo*POSE_SLOW*4.4/Math.max(4,poses)));return()=>clearInterval(t);},[animated,poses,style,act,tempo]);
 const fill=style==='glyph'?fillOf(graph,livePhase,actor.name):'';
 const log=mode==='actor'?logOf(graph,{...director,tokens}):[];
 const logKey=log.slice(-4).map(l=>l.id+':'+l.text.length).join();
 const spriteKey=(actor.name||'')+':'+avatar.rows.join('').length+':'+avatar.rows[0]+':'+style+':'+(script?.env||'none')+(director.drawing?':draw':'');
 const swapRef=useRef({key:null,frame:0});
 const phase=focus?D.phaseOf(focus.kind):['--','STANDBY'];
 useEffect(()=>{
  const e=createEngine(canvas.current,{animate:motionAllowed&&!suspended,motion});engine.current=e;
  const observer=new ResizeObserver(()=>e.resize());observer.observe(canvas.current);
  return()=>{observer.disconnect();e.destroy();engine.current=null;};
 },[]);
 useEffect(()=>{
  const e=createEngine(front.current,{animate:motionAllowed&&!suspended,motion,transparent:true});actorEngine.current=e;
  const observer=new ResizeObserver(()=>e.resize());observer.observe(front.current);
  return()=>{observer.disconnect();e.destroy();actorEngine.current=null;};
 },[]);
 useEffect(()=>{engine.current?.setOptions({animate:motionAllowed&&!suspended&&scene!=='actor',motion});actorEngine.current?.setOptions({animate:motionAllowed&&!suspended,motion});},[motionAllowed,motion,suspended,scene]);
 useEffect(()=>{const id=requestAnimationFrame(()=>{engine.current?.restyle();actorEngine.current?.restyle();});return()=>cancelAnimationFrame(id);},[theme]);
 const termKey=terminal?terminal.lines.length+':'+(terminal.lines.at(-1)||'').length+':'+terminal.open:'';
 useEffect(()=>{
  const e=actorEngine.current;if(!e)return;
  if(scene!=='actor'){e.show('off',()=>({marks:[],texts:[],live:[]}));return;}
  // Opening or folding the answer keeps the drawing: the actor glides to its new place.
  const key=spriteKey+(terminal?':term':''),swap=swapRef.current.key===key&&swapRef.current.frame!==frame;
  swapRef.current={key,frame};
  e.show(key,box=>buildActorScene({box,actor,look,frames:poseFrames,move,env:script?.env||'none',drawing:director.drawing,program,roomy:program.some(a=>TRAVELS.includes(a)||script?.moves?.[a]&&script.moves[a].travel!=='none'),beat,act,phase:livePhase,terminal,output,mood:script?.mood,effects:script?.effects||[],props:script?.props||[],pending:director.status==='pending',frame,style,fill,log,swap}));
 },[scene,spriteKey,!!terminal,termKey,output?.text.length,output?.open,livePhase,act,beat.say,script?.mood,(script?.effects||[]).join(),(script?.props||[]).length,director.status,frame,logKey,fill.length>>3,poseFrames]);
 const samples=figure==='curve'?arrival.list.length:0;
 const drawn=scene==='outline'?'outline':figure;
 useEffect(()=>{
  // Behind the actor the measurements keep moving, but without their text.
  // Re-keyed when the scene comes into view, so the figure builds up again.
  const spec=engine.current?.show(drawn+':'+queue.turn+':'+scene,box=>buildFigure(drawn,{entries,index,focus,samples:arrival.list.slice(),box,running:graph.running,metrics,work:graph.work,now:Date.now(),
   outline:thought.outline,outlineModel:thought.model?.model,outlineTokens}));
  setCaption(spec?.caption||CAPTIONS[drawn]||'');
 },[figure,queue.turn,focus?.id,focus?.text,focus?.status,entries.length,index,graph.running,samples,scene,DATA_FIGURES.includes(figure)?dataKey(figure,metrics,graph.work):'',thought.outline]);
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
 const introInfo={version:VERSION,session:sessionId,model:director.model?.model||hostModel?.model,director:mode==='actor'&&directing,actor:actor.name,sprite:avatar,figures:FIGURES.length,actions:ACTIONS.length,dwell:seconds,
  turns:graph.nodes.filter(n=>n.kind==='input').length,nodes:graph.nodes.length,chars:graph.nodes.reduce((n,x)=>n+x.source.length,0)};
 const directorNote={off:'角色导演已关闭 · 默认角色跟随思考 / 工具 / 回答阶段',idle:'这一轮没有导演记录（只为实时回合调用）· 菜单里可以「重新导演本轮」',pending:'导演正在读你的消息 · 额外调用 1 次模型',drawing:'正在为「'+(director.drawing?.name||'')+'」作画 · 再调用 1 次模型（带推理，约 10–40 秒）',error:'导演调用失败：'+director.error+' · 使用上一个角色',ready:(director.drawError?'作画失败（'+director.drawError+'）· 沿用上一个样子 · ':'')+'角色、动作与台词由模型根据你的消息生成'+(director.model?' · '+director.model.model:'')+(tokens?' · '+tokens+' tokens':'')+(director.ms?' · '+(director.ms/1000).toFixed(1)+'s':'')}[director.status];
 const outlineNote={off:'思路提纲已关闭',idle:'本轮没有提纲（公开推理太短，或不是实时回合）· 菜单里可以「生成本轮提纲」',waiting:'推理结束后归纳思路提纲 · 额外调用 1 次模型',pending:'正在归纳思路提纲 · 额外调用 1 次模型',error:'提纲调用失败：'+thought.error,ready:CAPTIONS.outline+(thought.model?' · '+thought.model.model:'')+(outlineTokens?' · '+outlineTokens+' tokens':'')+(thought.ms?' · '+(thought.ms/1000).toFixed(1)+'s':'')}[thought.status];
 const last=arrival.list.at(-1)?.t||arrival.start,elapsed=(graph.running?Date.now():last)-arrival.start;
 const status=source!=='LIVE'&&source!=='IDLE'?source:graph.running?'RUNNING':source==='IDLE'&&!focus?'IDLE':playing?pending?'READING':'CAUGHT UP':'PAUSED';
 return h('section',{className:'tw-stage','data-mode':mode,'data-scene':scene,'data-boot':intro?'intro':'ready','data-director':director.status,'data-actor-action':act,'data-actor-style':style,'data-figure':drawn,'data-outline':thought.status,'data-phase':phase[1].toLowerCase(),'data-reading':playing?'playing':'paused','data-active-entry':focus?.id||'','aria-label':'思路舞台'},
  h('header',{className:'tw-stage-top'},
   h('b',null,'THOUGHT.TRACE(ME);'),
   h('span',{className:'tw-stage-prompt'},'deepseek@dsh:~$'),
   h(Wave,{list:arrival.list,running:graph.running}),
   h('span',{className:'tw-stage-phase'},phase[0]+' / '+phase[1]),
   h('span',null,clock(elapsed)),
   h('span',{className:'tw-stage-read'},'READ '+pad2(entries.length?index+1:0)+' / '+pad2(entries.length)),
   h('span',{className:'tw-stage-status','data-status':status.toLowerCase().replace(' ','-')},status),
   h('button',{type:'button',className:'tw-stage-menu-button','aria-label':'思路视窗菜单','aria-expanded':!!menuOpen,title:'菜单（` 键）',onClick:()=>onMenu?.()},'≡')),
  h('div',{className:'tw-stage-chat'},h('span',{className:'tw-stage-cap','aria-hidden':true},'dsh · web'),
   h(ChatHead,{actor,avatar,phase:livePhase,action:act,model:director.model?.model,rounds:graph.nodes.filter(n=>n.kind==='input').length,steps:new Set(turnNodes(graph).filter(n=>n.kind!=='input').map(n=>n.step)).size,tokens,outlineTokens})),
  h('section',{className:'tw-stage-main'},
   h('div',{className:'tw-stage-cap'},h('span',null,'| '+(scene==='actor'?'stage / '+(actor.name||'actor')+(output?' · stdout':''):TITLES[drawn]||drawn)),h('small',null,focus?'#'+pad2(index+1)+' '+focus.op+' · '+focus.label:'standby')),
   h(Hud,{metrics}),
   h('div',{className:'tw-stage-plot',onClick:click},
    h('canvas',{ref:canvas,className:'tw-stage-canvas tw-stage-back',role:'img','aria-label':(TITLES[figure]||figure)+'：'+D.short(focus?.text||'等待公开内容',80)}),
    h('canvas',{ref:front,className:'tw-stage-canvas tw-stage-front','aria-hidden':mode!=='actor',role:'img','aria-label':(actor.name||'角色')+' · '+beat.action+(beat.say?'：'+beat.say:'')}),
    scene==='actor'&&answer?h('button',{type:'button',className:'tw-stage-answer-btn','aria-pressed':!!output,title:output?'收起回答窗口，让角色用整个舞台':'展开本轮回答',
     onClick:e=>{e.stopPropagation();foldedTurn.current=queue.turn;setFolded(!!output);}},output?'▤ 收起回答':'▤ 展开回答'):null,
    thought.outline||thought.status==='pending'?h('button',{type:'button',className:'tw-stage-outline-btn','aria-pressed':scene==='outline',disabled:!thought.outline,title:thought.outline?'显示 / 收起本轮思路提纲':'正在归纳思路提纲',
     onClick:e=>{e.stopPropagation();if(manual)latest();setOutlinePin(scene==='outline'?null:'pin');}},thought.outline?(scene==='outline'?'× 提纲':'◇ 思路提纲'):'◇ 归纳中…'):null),
   h('div',{className:'tw-stage-caption','data-director':scene==='outline'?thought.status:director.status},scene==='outline'?outlineNote:scene==='actor'?directorNote:scene==='thought'?caption+' · 角色在对话栏头像里':caption),
   !playing&&!replaying&&focus?h('div',{className:'tw-stage-paused'},'Ⅱ PAUSED · 空格继续'):null),
  h('aside',{className:'tw-stage-ops','aria-label':'过程操作索引'},
   h('span',{className:'tw-stage-cap'},'ops'),
   h('nav',{ref:ops},entries.map((e,i)=>h('button',{type:'button',key:e.id,'aria-current':i===index?'step':undefined,'data-status':e.status,'data-past':i<index?'true':undefined,onClick:()=>choose(e.id),title:D.short(e.text,90)},h('small',null,pad2(i+1)),e.op)))),
  h('footer',{className:'tw-stage-out'},
   h('span',{className:'tw-stage-cap'},h('span',null,'stdout · tokens'),h('small',null,focus?'@offset · '+D.length(focus.text)+' chars':'')),
   h(Tokens,{key:focus?.id||'empty',entry:focus,seconds,playing:playing&&!replaying&&!suspended,onOpen:()=>openSource(focus)})),
  h('div',{className:'tw-stage-credit'},
   h('span',null,'thought-window '+VERSION),h('span',null,'公开推理与工具事件 · 图形由原文长度、重叠与到达时间计算，非模型内部状态'),omitted?h('span',null,'较早片段已省略'):null,h('span',null,'空格 暂停 · ←/→ 逐条 · ` 菜单')),
  menuOpen?h('div',{className:'tw-stage-menu',role:'dialog','aria-label':'思路视窗菜单'},
   h('div',{className:'tw-stage-menu-row'},h('span',null,'阅读'),
    h('button',{type:'button','aria-label':'上一条思路',disabled:index===0,onClick:()=>change(-1)},'←'),
    h('button',{type:'button',onClick:toggle,disabled:replaying},playing?'Ⅱ 暂停阅读':'▷ 继续逐条'),
    h('button',{type:'button','aria-label':'下一条思路',disabled:!pending,onClick:()=>change(1)},'→'),
    h('button',{type:'button',disabled:!pending,onClick:latest},'跳到最新'),
    h('label',null,'停留 ',h('select',{'aria-label':'每步最少停留时间',value:seconds,onChange:e=>{setSeconds(Number(e.target.value));started.current=Date.now();}},[5,8,12].map(v=>h('option',{key:v,value:v},v+' 秒')))),
    h('small',null,pending?'后面还有 '+pending+' 条':'已到末尾')),
   h('div',{className:'tw-stage-menu-row'},h('span',null,'舞台'),
    h('div',{className:'tw-view-switch',role:'group','aria-label':'舞台画面'},h('button',{type:'button','aria-pressed':mode==='actor',onClick:()=>setMode('actor')},'角色'),h('button',{type:'button','aria-pressed':mode==='metrics',onClick:()=>setMode('metrics')},'度量')),
    h('label',null,h('input',{type:'checkbox',checked:directing,disabled:mode!=='actor',onChange:e=>setDirecting(e.target.checked)}),' 角色导演（每条消息额外调用 1 次模型）'),
    h('button',{type:'button',disabled:mode!=='actor'||!directing||director.status==='pending',onClick:director.redirect},'重新导演本轮'),
    h('button',{type:'button',disabled:mode!=='actor',onClick:director.forget},'换回默认角色'),
    h('label',null,h('input',{type:'checkbox',checked:introOn,onChange:e=>setIntroOn(e.target.checked)}),' 开屏动画'),
    h('label',null,h('input',{type:'checkbox',checked:foldOn,onChange:e=>setFoldOn(e.target.checked)}),' 回答完成后收起回答窗口'),
    h('button',{type:'button',onClick:()=>{onMenu?.(false);setIntro(true);}},'重播开屏'),
    h('small',null,directorNote)),
   h('div',{className:'tw-stage-menu-row'},h('span',null,'提纲'),
    h('label',null,h('input',{type:'checkbox',checked:outlineOn,disabled:replaying,onChange:e=>setOutlineOn(e.target.checked)}),' 思路提纲（推理结束后额外调用 1 次模型）'),
    h('button',{type:'button',disabled:!outlineOn||replaying||!thought.canRequest||thought.status==='pending',onClick:()=>{thought.request();}},thought.outline?'重新归纳本轮':'生成本轮提纲'),
    h('button',{type:'button',disabled:!thought.outline,onClick:()=>{onMenu?.(false);setOutlinePin('pin');}},'显示提纲'),
    h('small',null,outlineNote)),
   menu,
   h('button',{type:'button',className:'tw-stage-menu-close',onClick:()=>onMenu?.(false),'aria-label':'关闭菜单'},'×')):null,
  intro?h(Intro,{info:introInfo,onDone:()=>setIntro(false)}):null,
  h('div',{className:'tw-stage-sr','aria-live':'polite'},focus?focus.label+'：'+D.short(focus.text,120):''));
}
module.exports={Stage};
