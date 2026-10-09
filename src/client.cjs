'use strict';
const React=require('react');
const ReactDOM=require('react-dom');
const {project}=require('./core.cjs');
const {ThoughtWindow,pref,putPref}=require('./view.cjs');
const {splitGeometry}=require('./choreography.cjs');
const {acquireHostTheme}=require('./host-theme.cjs');
const {projectWork}=require('./work-data.cjs');
const {createHostBridge}=require('./host-bridge.cjs');
const css=require('./style.css');
const {createElement:h,useState,useEffect,useMemo,useRef,useSyncExternalStore}=React;
const EMPTY_DELIVERY_SOURCE={subscribe:()=>()=>{},getSnapshot:()=>undefined};

// DSH 0.1.5-rc.2 does not expose an outer split-pane factory. This small DOM
// adapter owns only its mount/class. Chat data always comes from public hooks.
function findRoot(anchor){
  let current=anchor?.parentElement;
  while(current){if(current.hasAttribute('data-phase') && current.querySelector('[data-conversation-scroll]'))return current;current=current.parentElement;}
  return null;
}
const stageSplit=value=>Number.isFinite(value)?Math.max(.45,Math.min(.8,value)):.7;
function Controller({sessionId,useChat,useSession,host}) {
  const anchor=useRef(null);
  const [enabled,setEnabled]=useState(()=>pref('enabled',true));
  const [mount,setMount]=useState(null);
  const [unsupported,setUnsupported]=useState(false);
  const themeRoot=useRef(null);
  const chat=useChat(s=>s),legacy=chat.legacy;
  const turn=chat.timeline?.turns?.get(chat.timeline.turnOrder.at(-1));
  const deliverySource=turn?.data?.source?.('deliverables')||EMPTY_DELIVERY_SOURCE;
  const deliveryHooks=useMemo(()=>({subscribe:fn=>deliverySource.subscribe(fn),getSnapshot:()=>deliverySource.getSnapshot()}),[deliverySource]);
  const deliverables=useSyncExternalStore(deliveryHooks.subscribe,deliveryHooks.getSnapshot);
  const running=useSession(s=>s.running);
  const graph=useMemo(()=>({...project(legacy,running),work:projectWork(legacy,running,deliverables,host.cwd(sessionId))}),[legacy,running,deliverables,host,sessionId]);
  const [preview,setPreview]=useState({open:false,path:'',address:''}),[dockExpanded,setDockExpanded]=useState(false);
  const [shell,setShell]=useState({stage:false,sidebar:false});
  const dock=useRef(null),refreshLayout=useRef(null);dock.current={preview,dockExpanded,shell};
  useEffect(()=>{
    if(!enabled)return;
    const update=()=>{const next=host.readPreview(sessionId);setPreview(old=>old.open===next.open&&old.address===next.address?old:next);};
    update();const timer=setInterval(update,500);return()=>clearInterval(timer);
  },[enabled,sessionId,host]);
  useEffect(()=>{setDockExpanded(false);},[preview.open]);
  useEffect(()=>{refreshLayout.current?.();},[preview.open,dockExpanded,shell.stage,shell.sidebar]);
  useEffect(()=>{
    putPref('enabled',enabled);
    if(!enabled)return;
    const root=findRoot(anchor.current);
    if(!root){setUnsupported(true);return;}
    if(root.querySelector(':scope > .tw-mount'))return;
    setUnsupported(false);
    const element=document.createElement('div');element.className='tw-mount';
    root.appendChild(element);root.classList.add('tw-native-shell');
    const hostTheme=acquireHostTheme(root);themeRoot.current=hostTheme;
    const openingTheme=pref('theme-v5','obsidian');hostTheme.set(openingTheme==='auto'?(pref('layout-v5','process')==='process'?'obsidian':'paper'):openingTheme);
    const divider=document.createElement('div');divider.className='tw-divider';divider.tabIndex=0;
    divider.setAttribute('role','separator');divider.setAttribute('aria-label','调整右侧画布宽度');divider.setAttribute('aria-orientation','vertical');divider.setAttribute('aria-valuemin','35');divider.setAttribute('aria-valuemax','68');divider.title='拖动调整聊天与画布比例；双击恢复';
    root.appendChild(divider);
    // The stage keeps its own, wider split: chat is a framed pane, not half the screen.
    let ratio=splitGeometry(1000,Number(pref('split',.56))).ratio,stageRatio=stageSplit(Number(pref('split-stage',.7))),dragging=false;
    const staged=()=>root.classList.contains('tw-stage-shell');
    const resize=()=>{
      const width=root.getBoundingClientRect().width;
      const geometry=splitGeometry(width,ratio);
      const previewOpen=!!dock.current?.preview.open,shellState=dock.current?.shell||{};
      const stage=!!shellState.stage&&!geometry.stacked&&!previewOpen;
      root.classList.toggle('tw-stage-shell',stage);
      document.body.classList.toggle('tw-stage-host',stage&&!shellState.sidebar);
      if(stage)geometry.panel=Math.max(0,Math.min(width*stageRatio,width-300));
      root.classList.toggle('tw-stacked',geometry.stacked||previewOpen);
      root.classList.toggle('tw-preview-open',previewOpen);
      root.classList.toggle('tw-preview-folded',previewOpen&&!dock.current?.dockExpanded);
      root.style.setProperty('--tw-panel-width',geometry.panel+'px');
      divider.setAttribute('aria-valuenow',String(Math.round((stage?stageRatio:ratio)*100)));
    };
    divider.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();dragging=true;divider.setPointerCapture(e.pointerId);root.classList.add('tw-resizing');};
    divider.onpointermove=e=>{if(!dragging)return;const rect=root.getBoundingClientRect(),value=(rect.right-e.clientX)/rect.width;if(staged())stageRatio=stageSplit(value);else ratio=splitGeometry(rect.width,value).ratio;resize();};
    divider.onpointerup=divider.onpointercancel=()=>{dragging=false;root.classList.remove('tw-resizing');putPref('split',ratio);putPref('split-stage',stageRatio);};
    divider.ondblclick=()=>{if(staged())stageRatio=.7;else ratio=.56;putPref('split',ratio);putPref('split-stage',stageRatio);resize();};
    divider.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home'].includes(e.key))return;e.preventDefault();const step=e.key==='ArrowLeft'?.02:-.02;if(staged())stageRatio=e.key==='Home'?.7:stageSplit(stageRatio+step);else ratio=e.key==='Home'?.56:splitGeometry(1000,ratio+step).ratio;putPref('split',ratio);putPref('split-stage',stageRatio);resize();};
    refreshLayout.current=resize;resize();const observer=new ResizeObserver(resize);observer.observe(root);setMount(element);
    return()=>{observer.disconnect();refreshLayout.current=null;setMount(null);element.remove();divider.remove();hostTheme.release();root.classList.remove('tw-native-shell','tw-stacked','tw-resizing','tw-preview-open','tw-preview-folded','tw-stage-shell');if(!document.querySelector('.tw-stage-shell'))document.body.classList.remove('tw-stage-host');root.style.removeProperty('--tw-panel-width');themeRoot.current=null;};
  },[enabled,sessionId]);
  return h(React.Fragment,null,h('button',{ref:anchor,type:'button',className:'tw-launch',title:unsupported?'当前 DSH 布局不兼容，可关闭插件并查看 README':'打开 / 关闭思路视窗','aria-label':'思路视窗','aria-pressed':enabled&&!unsupported,onClick:()=>setEnabled(!enabled)},'▦ ',unsupported?'布局不兼容':'思路视窗'),mount&&enabled?ReactDOM.createPortal(h(ThoughtWindow,{key:sessionId,graph,sessionId,preview,dockExpanded,onExpandDock:()=>setDockExpanded(true),onFoldDock:()=>setDockExpanded(false),onOpenFile:host.canOpen()?path=>host.openFile(sessionId,path):undefined,onClose:()=>setEnabled(false),onTheme:theme=>themeRoot.current?.set(theme),onShell:next=>setShell(old=>old.stage===next.stage&&old.sidebar===next.sidebar?old:next)}),mount):null);
}
class Boundary extends React.Component {
  constructor(props){super(props);this.state={error:false};}
  static getDerivedStateFromError(){return {error:true};}
  render(){return this.state.error?h('span',{className:'tw-launch',title:'关闭插件或重新加载页面恢复。原聊天不受影响。'},'思路视窗暂不可用'):this.props.children;}
}
const inject=['slots'];
function apply(ctx){
  const host=createHostBridge(ctx);
  ctx.effect(()=>{const style=document.createElement('style');style.dataset.thoughtWindow='0.7.0';style.textContent=css;document.head.appendChild(style);return()=>style.remove();});
  ctx.slots.inject('conversation.input.left',function*(){
    yield ctx.slots.register({name:'conversation.input.left',id:'thought-window',order:90},props=>h(Boundary,null,h(Controller,{...props,host})));
  });
}
module.exports={name:'thought-window',inject,apply};
