'use strict';
// Client half of the stage director: one request per new user message while
// the turn is live. Scripts and the current actor are remembered per session
// in this browser, so reopening a conversation does not spend tokens again.
const React=require('react');
const {useState,useEffect,useRef}=React;
const {normalizeScript,normalizeRig,holdActor}=require('./director-script.cjs');
const {normalizeOutline,turnReasoning}=require('./outline.cjs');
const ROUTE='/thought-window-director';
const KEEP_TURNS=24;
const load=key=>{try{return JSON.parse(localStorage.getItem(key))||null;}catch{return null;}};
const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};

function lastTurn(graph){
 const nodes=graph.nodes,at=nodes.findLastIndex(n=>n.kind==='input');
 if(at<0)return null;
 const before=nodes.findLastIndex((n,i)=>i<at&&n.kind==='input');
 const answer=nodes.slice(before+1,at).filter(n=>n.kind==='answer').map(n=>n.source).join('').slice(-500);
 return {id:nodes[at].id,input:nodes[at].source,context:before>=0?{input:nodes[before].source,answer}:null};
}
async function post(path,body,signal){
 const response=await fetch(ROUTE+path,{method:'POST',credentials:'same-origin',signal,headers:{'content-type':'application/json','x-thought-window':'1'},body:JSON.stringify(body)});
 let data=null;try{data=await response.json();}catch{}
 if(!response.ok||!data?.ok)throw Error(data?.error||(response.status===404||!data?'插件接口不可用（重启 DSH 加载新版插件后再试）':'HTTP '+response.status));
 return data;
}
async function requestScene(body,signal){const data=await post('/scene',body,signal);return {...data,script:holdActor(normalizeScript(data.script),body.input,body.previous)};}
async function requestSprite(body,signal){const data=await post('/sprite',body,signal);return {...data,rig:normalizeRig(data.rig)};}
async function requestOutline(body,signal){const data=await post('/outline',body,signal);return {...data,outline:normalizeOutline(data.outline)};}
const inflight=new Map();
// An actor's look: a preset (with colours), a drawn rig, or rows from older scripts.
const looks=a=>!!(a&&(a.preset||a.rig||a.sprite?.rows));
function remember(key,turnId,result){
 const old=load(key)||{actor:null,turns:{}},script=result.script,s=script.actor;
 const own=s.preset||s.rig||s.sprite?{name:s.name,preset:s.preset,colors:s.colors,rig:s.rig,sprite:s.sprite}:null;
 // A drawing request keeps the old look until the drawing arrives.
 const actor=own||old.actor||{name:s.name};
 const turns={};for(const id of Object.keys(old.turns).slice(-(KEEP_TURNS-1)))turns[id]=old.turns[id];
 turns[turnId]={script,actor,draw:s.draw?{name:s.name,draw:s.draw}:null,usage:result.usage,model:result.model,ms:result.ms,at:Date.now()};
 save(key,{actor,turns});
}
function rememberDrawing(key,turnId,patch){
 const old=load(key),entry=old?.turns?.[turnId];
 if(!entry?.draw)return;
 entry.draw={...entry.draw,...patch.draw};
 if(patch.actor){entry.actor=patch.actor;if(Object.keys(old.turns).at(-1)===turnId)old.actor=patch.actor;}
 save(key,old);
}
// A drawing still owed: requested by the script, not finished or failed, and
// recent (an old unfinished request is not paid for again on a visit).
const DRAW_WINDOW=30*60*1000;
const owed=entry=>entry?.draw&&!entry.draw.done&&!entry.draw.error&&Date.now()-(entry.at||0)<DRAW_WINDOW?entry.draw:null;
// Status: off | idle (history turn, not directed) | pending | drawing | ready | error.
function useStageDirector({graph,sessionId,enabled}){
 const key='tw:director:'+sessionId;
 const [memory,setMemory]=useState(()=>load(key)||{actor:null,turns:{}});
 const [live,setLive]=useState({status:'idle',error:''});
 const [nonce,setNonce]=useState(0);
 const turn=lastTurn(graph),turnId=turn?.id||null,cached=turnId?memory.turns[turnId]:null;
 const latest=useRef({turn,memory,running:graph.running});latest.current={turn,memory,running:graph.running};
 useEffect(()=>{setMemory(load(key)||{actor:null,turns:{}});},[key]);
 useEffect(()=>{
  if(!enabled||!turnId)return;
  const {turn:current,memory:known,running}=latest.current;
  if(known.turns[turnId]&&!nonce){setLive({status:'ready',error:''});return;}
  // Only live turns are directed automatically; history waits for a request.
  if(!running&&!nonce){setLive({status:'idle',error:''});return;}
  // One call per turn: a remount or re-render joins the request already in
  // flight, and its result is stored even if this component is gone by then.
  const id=key+'|'+turnId+'|'+nonce;
  let request=inflight.get(id);
  if(!request){
   request=requestScene({input:current.input,previous:known.actor?{name:known.actor.name}:null,context:current.context}).then(result=>{remember(key,turnId,result);return result;}).finally(()=>inflight.delete(id));
   inflight.set(id,request);
  }
  let alive=true;
  setLive({status:'pending',error:''});
  request.then(()=>{if(alive){setMemory(load(key)||{actor:null,turns:{}});setLive({status:'ready',error:''});}},error=>{if(alive)setLive({status:'error',error:error?.message||String(error)});});
  return()=>{alive=false;};
 },[enabled,turnId,nonce,key]);
 // The illustrator: when the script asks for a new drawing, one more call.
 const need=owed(cached);
 useEffect(()=>{
  if(!enabled||!need)return;
  const id=key+'|'+turnId+'|draw|'+need.draw;
  let request=inflight.get(id);
  if(!request){
   request=requestSprite({name:need.name,draw:need.draw})
    .then(result=>{rememberDrawing(key,turnId,{draw:{done:true,usage:result.usage,ms:result.ms},actor:{name:need.name,rig:result.rig}});return result;},
     error=>{rememberDrawing(key,turnId,{draw:{error:error?.message||String(error)}});throw error;})
    .finally(()=>inflight.delete(id));
   inflight.set(id,request);
  }
  let alive=true;
  const settle=()=>{if(alive)setMemory(load(key)||{actor:null,turns:{}});};
  request.then(settle,settle);
  return()=>{alive=false;};
 },[enabled,turnId,need?.draw,key]);
 useEffect(()=>{setNonce(0);},[turnId]);
 const entry=cached||null,status=!enabled?'off':live.status==='pending'?'pending':need?'drawing':live.status;
 const add=(a,b)=>a||b?{inputTokens:(a?.inputTokens||0)+(b?.inputTokens||0),outputTokens:(a?.outputTokens||0)+(b?.outputTokens||0),cacheReadTokens:(a?.cacheReadTokens||0)+(b?.cacheReadTokens||0)}:null;
 return {
  status,error:live.error,
  script:entry?.script||null,
  actor:entry?.actor||memory.actor||null,
  drawing:need?{name:need.name}:null,drawError:entry?.draw?.error||null,drawMs:entry?.draw?.ms||null,
  usage:add(entry?.usage,entry?.draw?.usage),model:entry?.model||null,ms:entry?.ms||null,
  redirect:()=>setNonce(n=>n+1),
  forget:()=>{const next={actor:null,turns:{}};save(key,next);setMemory(next);}
 };
}
// Thought outline: one call per live turn, once its reasoning is over (an
// answer has started, or the turn stopped). Stored per session like scripts.
// Status: off | idle | waiting (still reasoning) | pending | ready | error.
const MIN_REASONING=120;
function useThoughtOutline({graph,sessionId,enabled}){
 const key='tw:outline:'+sessionId;
 const [memory,setMemory]=useState(()=>load(key)||{turns:{}});
 const [live,setLive]=useState({status:'idle',error:''});
 const [nonce,setNonce]=useState(0);
 const turn=turnReasoning(graph),turnId=turn?.id||null,cached=turnId?memory.turns[turnId]:null;
 // Turns seen running in this tab: only those are outlined without a request.
 const seen=useRef(new Set());if(graph.running&&turnId)seen.current.add(turnId);
 const latest=useRef(turn);latest.current=turn;
 const ready=!!turn&&turn.ended&&turn.reasoning.length>=MIN_REASONING;
 useEffect(()=>{setMemory(load(key)||{turns:{}});},[key]);
 useEffect(()=>{setNonce(0);},[turnId]);
 useEffect(()=>{
  if(!enabled||!turnId)return;
  const known=load(key)||{turns:{}};
  if(known.turns[turnId]&&!nonce){setLive({status:'ready',error:''});return;}
  // Still reasoning: wait. Over without enough public reasoning: nothing to outline.
  if(!ready){setLive({status:graph.running&&!latest.current?.ended&&seen.current.has(turnId)?'waiting':'idle',error:''});return;}
  if(!seen.current.has(turnId)&&!nonce){setLive({status:'idle',error:''});return;}
  const id=key+'|'+turnId+'|'+nonce,current=latest.current;
  let request=inflight.get(id);
  if(!request){
   request=requestOutline({input:current.input,reasoning:current.reasoning}).then(result=>{
    const old=load(key)||{turns:{}},turns={};
    for(const t of Object.keys(old.turns).slice(-(KEEP_TURNS-1)))turns[t]=old.turns[t];
    turns[turnId]={outline:result.outline,usage:result.usage,model:result.model,ms:result.ms,at:Date.now()};
    save(key,{turns});return result;
   }).finally(()=>inflight.delete(id));
   inflight.set(id,request);
  }
  let alive=true;
  setLive({status:'pending',error:''});
  request.then(()=>{if(alive){setMemory(load(key)||{turns:{}});setLive({status:'ready',error:''});}},error=>{if(alive)setLive({status:'error',error:error?.message||String(error)});});
  return()=>{alive=false;};
 },[enabled,turnId,ready,nonce,key,graph.running]);
 return {
  status:enabled?(cached&&live.status!=='pending'?'ready':live.status):'off',error:live.error,
  outline:cached?.outline||null,usage:cached?.usage||null,model:cached?.model||null,ms:cached?.ms||null,at:cached?.at||null,
  canRequest:!!turn&&turn.reasoning.length>=MIN_REASONING&&turn.ended,
  request:()=>setNonce(n=>n+1)
 };
}
module.exports={useStageDirector,useThoughtOutline,lastTurn,requestScene,requestSprite,requestOutline,looks,ROUTE};
