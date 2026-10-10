'use strict';
// Thought outline: after the model has finished reasoning, one optional extra
// call condenses the public reasoning into goal / constraints / options /
// decision / risks. Shared by the host route and the browser (validation).
const {parseJson}=require('./director-script.cjs');
const REASONING_KINDS=['reasoning','compare','check','revise'];
const MAX_INPUT=1200,MAX_REASONING=9000;

const OUTLINE_PROMPT=`You condense an AI assistant's visible reasoning into a decision outline for a small on-screen flow chart.
Use ONLY what the reasoning actually says. Never invent options, numbers or facts. Write in the same language as the reasoning (usually Chinese). Keep every string short: it is drawn in pixels.
Reply with JSON only, no prose, no code fence:
{
 "goal": "what the assistant is trying to do, <= 30 chars",
 "constraints": ["requirement or limit it took into account, <= 24 chars", "... at most 4"],
 "options": [{"name": "approach it considered, <= 16 chars", "for": "main reason for, <= 24 chars", "against": "main reason against, <= 24 chars", "chosen": true}],
 "decision": "what it decided to do and why, <= 48 chars",
 "risks": ["open question or risk it noted, <= 24 chars", "... at most 3"]
}
Rules: options has 0-3 items; mark exactly one as chosen when the reasoning chose one, none otherwise. If the reasoning did not weigh alternatives, give an empty options array. Empty arrays are fine; do not pad.`;

const clip=(value,n)=>{const list=Array.from(String(value??'').replace(/\s+/g,' ').trim());return list.length>n?list.slice(0,n-1).join('')+'…':list.join('');};
const strings=(value,max,n)=>(Array.isArray(value)?value:[]).map(v=>clip(typeof v==='string'?v:v?.text??'',n)).filter(Boolean).slice(0,max);

// Head and tail of the reasoning: the opening states the task, the end the decision.
function reasoningExcerpt(text,limit=MAX_REASONING){
 const list=Array.from(String(text||''));
 if(list.length<=limit)return list.join('');
 const head=Math.floor(limit/3);
 return list.slice(0,head).join('')+'\n…\n'+list.slice(list.length-(limit-head)).join('');
}
function buildOutlineRequest({input,reasoning}){
 return `User message:\n${clip(input,MAX_INPUT)}\n\nAssistant's visible reasoning:\n${reasoningExcerpt(reasoning)}`;
}
function normalizeOutline(raw){
 if(!raw||typeof raw!=='object')throw Error('提纲不是对象');
 const options=(Array.isArray(raw.options)?raw.options:[]).filter(o=>o&&typeof o==='object').map(o=>({name:clip(o.name,20),for:clip(o.for??o.pro,30),against:clip(o.against??o.con,30),chosen:o.chosen===true})).filter(o=>o.name).slice(0,3);
 // At most one chosen option.
 let seen=false;for(const o of options){if(o.chosen&&seen)o.chosen=false;seen=seen||o.chosen;}
 const outline={goal:clip(raw.goal,40),constraints:strings(raw.constraints,4,30),options,decision:clip(raw.decision,64),risks:strings(raw.risks??raw.open_questions,3,30)};
 if(!outline.goal&&!outline.decision)throw Error('提纲缺少目标与结论');
 return outline;
}
const parseOutline=text=>parseJson(text,normalizeOutline,'模型没有返回 JSON 提纲');

// The latest turn's input and public reasoning, and whether reasoning is over:
// an answer after the last reasoning segment, or the turn has stopped.
function turnReasoning(graph){
 const nodes=graph?.nodes||[],at=nodes.findLastIndex(n=>n.kind==='input');
 if(at<0)return null;
 const rest=nodes.slice(at+1),last=rest.findLastIndex(n=>REASONING_KINDS.includes(n.kind));
 const reasoning=rest.filter(n=>REASONING_KINDS.includes(n.kind)).map(n=>n.source).join('');
 const ended=last>=0&&(!graph.running||rest.slice(last+1).some(n=>n.kind==='answer'));
 return {id:nodes[at].id,input:nodes[at].source,reasoning,ended};
}
module.exports={OUTLINE_PROMPT,REASONING_KINDS,buildOutlineRequest,normalizeOutline,parseOutline,reasoningExcerpt,turnReasoning};
