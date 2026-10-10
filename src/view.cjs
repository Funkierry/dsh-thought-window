'use strict';
const React=require('react');
const {createElement:h,useState,useEffect,useRef}=React;
const {appendFrame,validateReplay}=require('./core.cjs');
const storage=require('./storage.cjs');
const {Terminal}=require('./terminal.cjs');
const {Process}=require('./process.cjs');
const {Stage}=require('./stage.cjs');
const {Workbench,WorkSummary,PreviewDock}=require('./workbench.cjs');
const {Adaptive,useDirector}=require('./adaptive.cjs');
const {SCENES,THEMES}=require('./scenes.cjs');
const pref=(key,fallback)=>{try{return JSON.parse(localStorage.getItem('tw:'+key))??fallback;}catch{return fallback;}};
const putPref=(key,value)=>{try{localStorage.setItem('tw:'+key,JSON.stringify(value));}catch{}};
const statusLabel={done:'完成',running:'进行中',stopped:'已停止',error:'失败'};
const reasonKinds=['reasoning','compare','check','revise'];
function position(node,index){return {x:node.kind==='tool'?472:node.kind==='input'||node.kind==='answer'?258:node.kind==='compare'?300:node.kind==='check'?168:64,y:52+index*116};}
function formatTime(ms){return new Date(ms).toLocaleTimeString('zh-CN',{hour12:false});}

function Graph({graph,selected,onSelect,animate,follow}) {
  const scroll=useRef(null);
  const nodes=graph.nodes;
  useEffect(()=>{if(follow && scroll.current) scroll.current.scrollTo({top:scroll.current.scrollHeight,behavior:animate?'smooth':'auto'});},[nodes.length,follow,animate]);
  const coords=new Map(nodes.map((node,i)=>[node.id,position(node,i)]));
  const height=Math.max(330,nodes.length*116+96);
  return h('div',{className:'tw-map-scroll',ref:scroll,tabIndex:0,'aria-label':'思路事件画布，可滚动查看'},
    h('div',{className:'tw-map',style:{height}},
      h('div',{className:'tw-lane tw-lane-a'},'01 / REASONING'),h('div',{className:'tw-lane tw-lane-b'},'02 / TOOLS'),
      h('svg',{className:'tw-wires',viewBox:`0 0 760 ${height}`,preserveAspectRatio:'none','aria-hidden':true},
        graph.edges.map((edge,i)=>{
          const a=coords.get(edge.from),b=coords.get(edge.to);if(!a||!b)return null;
          const d=`M ${a.x+108} ${a.y+84} C ${a.x+108} ${a.y+104}, ${b.x+108} ${b.y-18}, ${b.x+108} ${b.y}`;
          const live=graph.nodes.find(n=>n.id===edge.to)?.status==='running';
          return h('g',{key:edge.from+'>'+edge.to+':'+i},
            h('path',{d,className:'tw-wire '+(edge.kind==='parent'?'tw-parent':'')}),
            animate?h('path',{d,pathLength:1,className:'tw-growing'}):null,
            live&&animate?h('path',{d,className:'tw-current'}):null);
        })
      ),
      !nodes.length?h('div',{className:'tw-empty'},h('div',{className:'tw-empty-icon'},'▦'),h('strong',null,'等一个想法，开始生长。'),h('p',null,'发送消息后，这里会呈现公开推理、工具调用和回答。'),h('small',null,'AWAITING SESSION EVENTS')):null,
      nodes.map((node,i)=>{
        const p=coords.get(node.id);
        return h('button',{type:'button',key:node.id,'data-tw-node':node.id,onClick:()=>onSelect(node.id),title:'查看对应原文',className:`tw-node tw-${node.kind} tw-status-${node.status} ${selected===node.id?'tw-selected':''}`,style:{left:`${p.x/7.6}%`,top:p.y,width:'28.42%'},'aria-pressed':selected===node.id},
          h('span',{className:'tw-node-meta'},h('span',null,String(i+1).padStart(2,'0')+' / '+node.label),h('span',{className:'tw-node-dot','aria-label':statusLabel[node.status]})),
          h('strong',null,node.title||node.label),
          h('span',{className:'tw-node-state'},node.kind==='tool'?'> '+statusLabel[node.status]:node.status==='running'?'STREAMING _':node.status==='stopped'?'STOPPED':reasonKinds.includes(node.kind)?'公开文本 · 自动分段':'EVENT / '+statusLabel[node.status])
        );
      })
    )
  );
}

const LAYOUTS=['stage','process','workbench','adaptive','terminal','graph'];
function ThoughtWindow({graph,metricsSource,sessionId,onClose,onTheme,onShell,mode='live',onOpenFile,preview={open:false},dockExpanded=false,onExpandDock,onFoldDock}) {
  const [theme,setTheme]=useState(()=>{const value=pref('theme-v5','obsidian');return value==='auto'||Object.hasOwn(THEMES,value)?value:'obsidian';});
  // 0.7 keeps its own layout preference so the stage opens first after the update.
  const [layout,setLayout]=useState(()=>{const value=pref('layout-v7','stage');return LAYOUTS.includes(value)?value:'stage';});
  const [menu,setMenu]=useState(false);
  const [sidebar,setSidebar]=useState(()=>pref('stage-sidebar',false)===true);
  const [sceneChoice,setSceneChoice]=useState(()=>{const value=pref('scene','auto');return value==='auto'||Object.hasOwn(SCENES,value)?value:'auto';});
  const [motion,setMotion]=useState(()=>pref('motion','rich'));
  const [settings,setSettings]=useState(false);
  const [animate,setAnimate]=useState(()=>pref('animate',!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches));
  const [selected,setSelected]=useState(null);
  const [follow,setFollow]=useState(true);
  const [frames,setFrames]=useState([]);
  const [cursor,setCursor]=useState(null);
  const [playing,setPlaying]=useState(false);
  const [speed,setSpeed]=useState(1);
  const [persistent,setPersistent]=useState(()=>pref('save-history',false));
  const [notice,setNotice]=useState('');
  const [imported,setImported]=useState(null);
  const graphRef=useRef(graph);graphRef.current=graph;
  const framesRef=useRef(frames);framesRef.current=frames;
  const fileRef=useRef(null);
  const persistenceReady=useRef(false);
  const generation=useRef(0);
  const folded=preview.open&&!dockExpanded;
  useEffect(()=>{putPref('theme-v5',theme);},[theme]);
  useEffect(()=>{putPref('animate',animate);},[animate]);
  useEffect(()=>{putPref('layout-v7',layout);setMenu(false);},[layout]);
  useEffect(()=>{putPref('stage-sidebar',sidebar);},[sidebar]);
  useEffect(()=>{onShell?.({stage:layout==='stage',sidebar});},[layout,sidebar]);
  useEffect(()=>{putPref('scene',sceneChoice);},[sceneChoice]);
  useEffect(()=>{putPref('motion',motion);},[motion]);
  useEffect(()=>{
    setFrames(appendFrame([],graphRef.current));setCursor(null);setImported(null);setSelected(null);setPlaying(false);
    const timer=setInterval(()=>setFrames(old=>appendFrame(old,graphRef.current)),900);
    return()=>clearInterval(timer);
  },[sessionId]);
  // Capture a final status promptly even if the stream ends between timer ticks.
  useEffect(()=>{if(!graph.running)setFrames(old=>appendFrame(old,graph));},[graph.running]);
  useEffect(()=>{
    const gen=++generation.current;persistenceReady.current=false;
    putPref('save-history',persistent);
    if(!persistent){persistenceReady.current=true;return;}
    storage.load(sessionId).then(row=>{
      if(gen!==generation.current)return;
      if(row?.frames?.length){const restored=validateReplay({format:'dsh-thought-window',version:1,frames:row.frames});setFrames(appendFrame(restored,graphRef.current));}
      persistenceReady.current=true;
    }).catch(()=>{if(gen===generation.current){setNotice('本地回放不可用，当前会话仍可回放。');persistenceReady.current=true;}});
    return()=>{generation.current++;};
  },[persistent,sessionId]);
  useEffect(()=>{
    if(!persistent)return;
    const timer=setInterval(()=>{
      if(persistenceReady.current && framesRef.current.length)storage.save(sessionId,framesRef.current).catch(()=>setNotice('浏览器空间不足，回放暂存在内存。'));
    },3000);
    return()=>clearInterval(timer);
  },[persistent,sessionId]);
  const timeline=imported || frames;
  const index=cursor===null?timeline.length-1:Math.min(cursor,timeline.length-1);
  const current=cursor===null&&!imported?graph:timeline[index]?.graph || graph;
  const route=useDirector(current,cursor!==null||!!imported);
  const sceneId=sceneChoice==='auto'?route.id:sceneChoice;
  const effectiveTheme=theme==='auto'?(['stage','process','workbench'].includes(layout)?'obsidian':SCENES[sceneId]?.theme||'paper'):theme;
  useEffect(()=>{onTheme?.(theme==='auto'&&!['stage','process','workbench'].includes(layout)?'paper':effectiveTheme);},[effectiveTheme,theme,layout]);
  const sourceNodes=current.nodes.filter(n=>Array.isArray(selected)?selected.includes(n.id):n.id===selected);
  const selectedNode=sourceNodes.length?{...sourceNodes[0],source:sourceNodes.map(n=>n.source).join(''),truncated:sourceNodes.some(n=>n.truncated)}:null;
  useEffect(()=>{
    if(!playing||folded)return;
    const timer=setInterval(()=>setCursor(old=>{
      const next=(old??0)+1;
      if(next>=timeline.length-1){setPlaying(false);return Math.max(0,timeline.length-1);}
      return next;
    }),1000/speed);
    return()=>clearInterval(timer);
  },[playing,speed,timeline.length,folded]);
  function exportReplay(){
    const value={format:'dsh-thought-window',version:1,createdAt:new Date().toISOString(),frames:timeline.length?timeline:appendFrame([],graph)};
    const url=URL.createObjectURL(new Blob([JSON.stringify(value)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='thought-window-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    setNotice('已导出当前回放，文件包含画布中的对话原文。');
  }
  async function importReplay(event){
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    try{if(file.size>6_000_000)throw Error('文件超过 6 MB');const data=validateReplay(JSON.parse(await file.text()));setImported(data);setCursor(0);setPlaying(false);setNotice('正在查看导入回放；原生实时对话不受影响。');}
    catch(error){setNotice('无法导入：'+error.message);}
  }
  async function clearHistory(){
    setPersistent(false);setImported(null);setCursor(null);setPlaying(false);setFrames(appendFrame([],graphRef.current));
    try{await storage.clear();setNotice('已清除插件保存的回放，并关闭保存。DSH 原对话保留。');}catch{setNotice('浏览器拒绝清理存储；已关闭保存。');}
  }
  const live=cursor===null&&!imported;
  const selectSource=id=>{if(current.nodes.some(n=>Array.isArray(id)?id.includes(n.id):n.id===id)){setSelected(id);setFollow(false);}else setNotice('该工具原文已超出当前节点窗口，请在左侧原生聊天查看。');};
  const viewSwitch=h('div',{className:'tw-view-switch',role:'group','aria-label':'可视化视图'},h('button',{type:'button','aria-pressed':layout==='stage',onClick:()=>setLayout('stage')},'舞台'),h('button',{type:'button','aria-pressed':layout==='process',onClick:()=>setLayout('process')},'过程仪表'),h('button',{type:'button','aria-pressed':layout==='workbench',onClick:()=>setLayout('workbench')},'成果 / 运行'),h('button',{type:'button','aria-pressed':layout==='adaptive',onClick:()=>setLayout('adaptive')},'自动场景'),h('button',{type:'button','aria-pressed':layout==='terminal',onClick:()=>setLayout('terminal')},'终端'),h('button',{type:'button','aria-pressed':layout==='graph',onClick:()=>setLayout('graph')},'节点'));
  const appearance=settings?h('div',{className:'tw-appearance'},h('label',null,'配色 ',h('select',{'aria-label':'界面配色',value:theme,onChange:e=>setTheme(e.target.value)},h('option',{value:'auto'},'随场景配色'),Object.entries(THEMES).map(([key,label])=>h('option',{key,value:key},label)))),h('label',null,'动效 ',h('select',{'aria-label':'动效强度',value:motion,onChange:e=>setMotion(e.target.value)},h('option',{value:'rich'},'丰富'),h('option',{value:'calm'},'轻柔')))):null;
  const sourcePanel=selectedNode?h('aside',{className:'tw-source','aria-label':'节点原文'},h('div',{className:'tw-source-title'},h('strong',null,selectedNode.label+' / 对应原文'),h('button',{type:'button',onClick:()=>setSelected(null),'aria-label':'关闭原文'},'×')),h('div',{className:'tw-source-meta'},`状态：${statusLabel[selectedNode.status]}${Number.isFinite(selectedNode.turn)?' · turn '+selectedNode.turn:''}${Number.isFinite(selectedNode.step)?' · step '+selectedNode.step:''}`),h('pre',null,selectedNode.source),selectedNode.truncated?h('small',null,'长文本已截断至 12,000 字符，完整内容请在原生聊天中查看。'):null):null;
  const controls=[

      h('div',{className:'tw-timeline-label'},h('span',null,'TIMELINE / 观察到的状态'),h('span',null,timeline[index]?formatTime(timeline[index].at):'--:--:--')),
      h('input',{className:'tw-timeline',type:'range',min:0,max:Math.max(0,timeline.length-1),value:Math.max(0,index),'aria-label':'回放时间轴',onChange:e=>{setCursor(Number(e.target.value));setPlaying(false);}}),
      h('div',{className:'tw-playbar'},h('button',{type:'button',onClick:()=>{if(playing){setPlaying(false);return;}if(cursor===null||index>=timeline.length-1)setCursor(0);setPlaying(true);},disabled:timeline.length<2},playing?'Ⅱ 暂停':'▷ 回放'),h('select',{'aria-label':'回放速度',value:speed,onChange:e=>setSpeed(Number(e.target.value))},[0.5,1,2].map(s=>h('option',{value:s,key:s},s+'×'))),h('button',{type:'button',className:live?'tw-active':'',onClick:()=>{setImported(null);setCursor(null);setPlaying(false);setFollow(true);}},'● 实时'),h('span',{className:'tw-spacer'}),h('button',{type:'button',title:'导出含原文的 JSON 回放',onClick:exportReplay},'导出'),h('button',{type:'button',onClick:()=>fileRef.current?.click()},'导入'),h('input',{type:'file',hidden:true,accept:'.json,application/json',ref:fileRef,onChange:importReplay})),
      settings?h('div',{className:'tw-storage-row'},h('label',null,h('input',{type:'checkbox',checked:persistent,onChange:e=>{setPersistent(e.target.checked);setNotice(e.target.checked?'回放将保存在本浏览器，最多 10 个会话；不上传。':'已停止保存；已有回放可用“清除”删除。');}}),' 本地保存回放'),h('button',{type:'button',onClick:clearHistory},'清除'),h('small',null,'最多 90 帧 / 当前已加载对话')):null,
      notice?h('p',{className:'tw-notice',role:'status'},notice):null,
      h('p',{className:'tw-disclosure'},'公开文本与事件 · 场景为规则匹配 · 图形为内容示意')];
  if(layout==='stage'){
    // The stage keeps every existing control, folded into its ≡ menu.
    const menuBody=h(React.Fragment,null,
      h('div',{className:'tw-stage-menu-row'},h('span',null,'视图'),viewSwitch),
      h('div',{className:'tw-stage-menu-row'},h('span',null,'外观'),
        h('label',null,'配色 ',h('select',{'aria-label':'界面配色',value:theme,onChange:e=>setTheme(e.target.value)},h('option',{value:'auto'},'随场景配色'),Object.entries(THEMES).map(([key,label])=>h('option',{key,value:key},label)))),
        h('label',null,'动效 ',h('select',{'aria-label':'动效强度',value:motion,onChange:e=>setMotion(e.target.value)},h('option',{value:'rich'},'丰富'),h('option',{value:'calm'},'轻柔'))),
        h('label',null,h('input',{type:'checkbox',checked:animate,onChange:e=>setAnimate(e.target.checked)}),' 动效'),
        h('label',null,h('input',{type:'checkbox',checked:sidebar,onChange:e=>setSidebar(e.target.checked)}),' 显示 DSH 侧栏')),
      h('div',{className:'tw-stage-menu-row'},h('span',null,'插件'),h('button',{type:'button','aria-pressed':settings,onClick:()=>setSettings(!settings)},'本地保存设置'),h('button',{type:'button','aria-label':'关闭思路视窗',title:'恢复原始聊天布局',onClick:onClose},'关闭插件 ×')),
      h('div',{className:'tw-controls'},...controls));
    return h('section',{className:`tw-window tw-theme-${effectiveTheme} tw-layout-stage ${animate?'':'tw-no-motion'}`,'data-motion':motion,'aria-label':'思路视窗'},
      preview.open?h(PreviewDock,{work:graph.work,preview,onExpand:()=>onExpandDock?.(),onWork:()=>{setLayout('workbench');onExpandDock?.();}}):null,
      h(Stage,{graph:current,metricsSource:live?metricsSource:null,sessionId,onSelect:selectSource,animate:animate&&!folded,motion,replaying:!live,suspended:folded,theme:effectiveTheme,menu:menuBody,menuOpen:menu,onMenu:value=>setMenu(old=>typeof value==='boolean'?value:!old),omitted:current.omitted,source:live?(current.running?'LIVE':'IDLE'):imported?'IMPORTED':'REPLAY'}),
      sourcePanel);
  }
  return h('section',{className:`tw-window tw-theme-${effectiveTheme} tw-layout-${layout} ${animate?'':'tw-no-motion'}`,'data-motion':motion,'aria-label':'思路视窗'},
    preview.open?h(PreviewDock,{work:graph.work,preview,onExpand:()=>{setLayout('process');onExpandDock?.();},onWork:()=>{setLayout('workbench');onExpandDock?.();}}):null,
    h('header',{className:'tw-titlebar'},h('div',null,h('span',{className:'tw-mark'},'▦'),h('strong',null,'THOUGHT WINDOW'),h('small',null,'思路仪表 / 0.14.2')),
      h('div',{className:'tw-title-actions'},preview.open?h('button',{type:'button',className:'tw-dock-fold',onClick:onFoldDock},'收起过程'):null,h('button',{type:'button','aria-label':'外观设置','aria-expanded':settings,onClick:()=>setSettings(!settings)},'⚙'),h('button',{type:'button',title:'轮换配色','aria-label':'切换主题',onClick:()=>{const keys=Object.keys(THEMES);setTheme(keys[(keys.indexOf(effectiveTheme)+1)%keys.length]);}},'◐'),h('button',{type:'button','aria-label':'关闭思路视窗',title:'恢复原始聊天布局',onClick:onClose},'×'))),
    appearance,
    h('div',{className:'tw-ribbon'},h('span',{className:current.running&&live?'tw-live tw-pulse':'tw-live'},h('i'),mode==='demo'?'DEMO / 演示数据':imported?'IMPORTED / 导入':live?(current.running?'LIVE / 运行中':'LIVE / 等待输入'):'REPLAY / 回放'),h('span',null,`${current.nodes.length} EVENTS · ${current.nodes.filter(n=>n.kind==='tool').length} TOOLS`)),
    h('div',{className:'tw-summary'},h('div',null,h('small',null,'EVENTS'),h('b',null,String(current.nodes.length).padStart(2,'0'))),h('div',null,h('small',null,'REASONING'),h('b',null,current.nodes.filter(n=>reasonKinds.includes(n.kind)).length)),h('div',null,h('small',null,'TOOLS'),h('b',null,current.nodes.filter(n=>n.kind==='tool').length)),h('div',{className:'tw-summary-caption'},h('span',null,'让思路，逐步可见。'),h('small',null,'READ → TRACE → BUILD'))),
    h('div',{className:'tw-map-toolbar'},h('span',null,'trace / '+(sessionId==='demo'?'sample':String(sessionId).slice(0,8))),viewSwitch,['terminal','graph'].includes(layout)?h('label',null,h('input',{type:'checkbox',checked:follow,onChange:e=>setFollow(e.target.checked)}),' 跟随'):null,h('label',null,h('input',{type:'checkbox',checked:animate,onChange:e=>setAnimate(e.target.checked)}),' 动效')),
    layout!=='workbench'?h(WorkSummary,{work:current.work,onShow:()=>setLayout('workbench')}):null,
    h('div',{className:'tw-process-host',hidden:layout!=='process'},h(Process,{graph:current,onSelect:selectSource,animate:animate&&layout==='process'&&!folded,motion,replaying:!live,suspended:folded||layout!=='process'})),
    layout==='process'?null:layout==='workbench'?h(Workbench,{work:current.work,onOpenFile,onSelect:selectSource,replaying:!live,preview:live?preview:undefined}):h(layout==='adaptive'?Adaptive:layout==='terminal'?Terminal:Graph,{graph:current,route,sceneChoice,onSceneChoice:setSceneChoice,selected,onSelect:selectSource,animate,motion,instant:!live&&!playing,follow}),
    current.omitted?h('div',{className:'tw-note'},`当前窗口已省略 ${current.omitted} 个较早片段，原文仍在原生对话。`):null,
    !current.hasReasoning&&current.nodes.length?h('div',{className:'tw-note'},'模型未返回公开推理文本；当前显示消息与工具活动。'):null,
    sourcePanel,
    h('footer',{className:'tw-controls'},...controls)
  );
}
module.exports={ThoughtWindow,pref,putPref};
