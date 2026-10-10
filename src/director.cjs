'use strict';
// Client half of the stage director: one request per new user message while
// the turn is live. Scripts and the current actor are remembered per session
// in this browser, so reopening a conversation does not spend tokens again.
const React=require('react');
const {useState,useEffect,useRef}=React;
const {normalizeScript}=require('./director-script.cjs');
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
async function requestScene(body,signal){
 const response=await fetch(ROUTE+'/scene',{method:'POST',credentials:'same-origin',signal,headers:{'content-type':'application/json','x-thought-window':'1'},body:JSON.stringify(body)});
 let data=null;try{data=await response.json();}catch{}
 if(!response.ok||!data?.ok)throw Error(data?.error||(response.status===404||!data?'导演接口不可用（重启 DSH 加载新版插件后再试）':'HTTP '+response.status));
 return {...data,script:normalizeScript(data.script)};
}
const inflight=new Map();
function remember(key,turnId,result){
 const old=load(key)||{actor:null,turns:{}},script=result.script;
 const actor=script.actor.sprite?{name:script.actor.name,sprite:script.actor.sprite}:old.actor||{name:script.actor.name,sprite:null};
 const turns={};for(const id of Object.keys(old.turns).slice(-(KEEP_TURNS-1)))turns[id]=old.turns[id];
 turns[turnId]={script,actor,usage:result.usage,model:result.model,ms:result.ms,at:Date.now()};
 save(key,{actor,turns});
}
// Status: off | idle (history turn, not directed) | pending | ready | error.
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
 useEffect(()=>{setNonce(0);},[turnId]);
 const entry=cached||null;
 return {
  status:enabled?live.status:'off',error:live.error,
  script:entry?.script||null,
  actor:entry?.actor||memory.actor||null,
  usage:entry?.usage||null,model:entry?.model||null,ms:entry?.ms||null,
  redirect:()=>setNonce(n=>n+1),
  forget:()=>{const next={actor:null,turns:{}};save(key,next);setMemory(next);}
 };
}
module.exports={useStageDirector,lastTurn,requestScene,ROUTE};
