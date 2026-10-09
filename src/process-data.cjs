'use strict';
const {turnNodes,classifyScene}=require('./scenes.cjs');
const LIMIT=240;
const OPS={input:['INPUT','接收问题'],analysis:['READ','阅读与理解'],constraint:['BOUND','约束条件'],plan:['PLAN','拆解步骤'],compare:['BRANCH','并列比较'],search:['LOOKUP','资料线索'],code:['SOURCE','代码片段'],math:['DERIVE','公式原文'],check:['CHECK','核验描述'],revise:['REVISE','调整方向'],request:['CALL','工具请求'],result:['RETURN','工具返回'],answer:['OUTPUT','回答片段'],error:['ERROR','运行错误'],retry:['RETRY','请求重试']};

// Prefix-stable boundaries, including fenced code. Source offsets are retained;
// this is a reading aid over public text, not generated or inferred reasoning.
function slices(source){
 const result=[];let start=0,fence=false;
 const add=end=>{let a=start,b=end;while(a<b&&/\s/u.test(source[a]))a++;while(b>a&&/\s/u.test(source[b-1]))b--;if(b>a)result.push({start:a,end:b,text:source.slice(a,b)});start=end;};
 for(let i=0;i<source.length;i++){
  const heading=i-start<72?source.slice(start,i).trim():'';
  const shortHeading=heading.length<70&&/[:：]$/.test(heading);
  if(source.slice(i,i+3)==='```'){if(!fence&&i>start&&!shortHeading)add(i);fence=!fence;i+=2;if(!fence)add(i+1);continue;}
  if(fence)continue;
  const size=i-start+1,ch=source[i];
  const period=ch==='.'&&(i+1===source.length||/\s/.test(source[i+1]))&&!/\d/.test(source[i-1]||'');
  if(ch==='\n'&&!shortHeading||size>=8&&(/[。！？；;!?]/u.test(ch)||period)||size>=240)add(i+1);
 }
 if(start<source.length)add(source.length);
 return result;
}
function role(text){
 const head=text.replace(/^[\s#*\-]+/,'');
 if(text.includes('```'))return /^```(?:math|latex|tex)\b/m.test(text)?'math':'code';
 if(/^(?:约束|限制|要求|必须|不能|不得|注意|constraint|must|requirement)/i.test(head))return 'constraint';
 if(/^(?:第[一二三四五六七八九十\d]+步|首先|接下来|计划|步骤|step\s*\d|plan\s*:)/i.test(head))return 'plan';
 if(/^(?:检查|核验|验证|check\s*:|verify\s*:)/i.test(head))return 'check';
 if(/^(?:修正|纠正|改为|重新考虑|revise\s*:)/i.test(head))return 'revise';
 if(/^(?:检索|搜索|查阅|资料线索|参考来源|search\s*:)/i.test(head))return 'search';
 if(/^(?:公式|推导|\$|\\\[)/.test(head))return 'math';
 return classifyScene(text).id;
}
function buildProcess(graph){
 const nodes=turnNodes(graph),entries=[],groups=[];
 for(const node of nodes){
  const reasoning=['reasoning','compare','check','revise'].includes(node.kind);
  const key=reasoning&&/^a:/.test(node.id)?node.id.replace(/:\d+$/,''):node.id;
  let group=groups.at(-1);
  if(!reasoning||!group?.reasoning||group.key!==key){group={key,reasoning,nodes:[],text:''};groups.push(group);}
  group.nodes.push({node,start:group.text.length,end:group.text.length+node.source.length});group.text+=node.source;
 }
 for(const group of groups){
  const node=group.nodes[0].node;
  const emit=(part,kind,suffix)=>{
   const owners=group.nodes.filter(n=>n.end>part.start&&n.start<part.end),first=owners[0]||group.nodes[0];
   const spans=owners.map(n=>({nodeId:n.node.id,start:Math.max(0,part.start-n.start),end:Math.min(n.node.source.length,part.end-n.start)}));
   entries.push({id:suffix?node.id+':'+suffix:first.node.id+'@'+(part.start-first.start),nodeId:first.node.id,spans,kind,op:OPS[kind]?.[0]||'READ',label:OPS[kind]?.[1]||'原文片段',text:part.text,title:node.title,toolId:node.kind==='tool'?node.id:null,
    status:node.kind==='tool'?node.status:part.end<group.text.trimEnd().length?'done':group.nodes.at(-1).node.status,turn:node.turn,step:node.step,seq:node.seq});
  };
  if(node.kind==='tool'){
   const separator=group.text.indexOf('\n\n返回\n');
   const start=separator>=0&&group.text.startsWith('参数\n')?3:0;
   emit({start,end:separator>=0?separator:group.text.length,text:group.text.slice(start,separator>=0?separator:undefined)||'（无文本参数）'},'request','request');
   if(separator>=0)emit({start:separator+5,end:group.text.length,text:group.text.slice(separator+5)},'result','result');
  }else{
   const kind=group.reasoning?null:({input:'input',answer:'answer',error:'error',retry:'retry'})[node.kind]||'analysis';
   const parts=node.kind==='input'?[{start:0,end:group.text.length,text:group.text}]:slices(group.text);
   parts.forEach(part=>emit(part,kind||role(part.text)));
  }
 }
 const excess=Math.max(0,entries.length-LIMIT);
 return {turn:nodes.find(n=>n.kind==='input')?.id||'history',entries:entries.slice(excess),omitted:excess+(graph.omitted||0),input:nodes.find(n=>n.kind==='input')?.source||'',running:graph.running,hasReasoning:groups.some(g=>g.reasoning)};
}
// New pieces append in observed order. A late tool result cannot reshuffle a
// queue the reader has already started. Initial history uses host source order.
function mergeQueue(previous,next){
 if(!previous||previous.turn!==next.turn)return next;
 const fresh=new Map(next.entries.map(e=>[e.id,e]));
 const entries=previous.entries.filter(e=>fresh.has(e.id)).map(e=>fresh.get(e.id));
 const seen=new Set(entries.map(e=>e.id));entries.push(...next.entries.filter(e=>!seen.has(e.id)));
 return {...next,entries:entries.slice(-LIMIT)};
}
function dwellMs(entry,seconds=8){return Math.max(seconds*1000,Math.min(20000,3000+Array.from(entry?.text||'').length*55));}
function formFor(entry){return ({plan:'pipeline',compare:'branches',request:'io',result:'io',code:'code',math:'formula',check:'checklist',revise:'revision',error:'revision',retry:'revision',search:'sources'})[entry?.kind]||'register';}
function boardEntries(entries,index){
 const focus=entries[index],form=formFor(focus);
 if(form==='io')return entries.filter(e=>e.toolId===focus.toolId);
 if(form==='branches'){
  const matching=entries.filter(e=>e.kind==='compare');
  const at=matching.findIndex(e=>e.id===focus.id);return matching.slice(Math.max(0,at-1),Math.max(0,at-1)+4);
 }
 const start=Math.max(0,index-3);return entries.slice(start,start+6);
}
module.exports={OPS,LIMIT,slices,buildProcess,mergeQueue,dwellMs,formFor,boardEntries};
