'use strict';
// Deterministic presentation metadata derived only from visible source events.
const SCENES={
  idle:{title:'等待一个想法',en:'STANDBY',theme:'paper',mark:'○'},
  analysis:{title:'梳理问题',en:'THOUGHT ATLAS',theme:'night',mark:'✧'},
  plan:{title:'拆解与规划',en:'STEP SEQUENCER',theme:'blueprint',mark:'▤'},
  compare:{title:'并列比较',en:'BRANCH EXPLORER',theme:'violet',mark:'⑂'},
  search:{title:'检索与阅读',en:'SOURCE RADAR',theme:'phosphor',mark:'◎'},
  code:{title:'代码与结构',en:'CODE WORKBENCH',theme:'night',mark:'⌘'},
  math:{title:'公式与推导',en:'FORMULA BOARD',theme:'blueprint',mark:'∑'},
  execute:{title:'工具执行',en:'EXECUTION BUS',theme:'amber',mark:'▸'},
  check:{title:'检查与核验',en:'CHECK REGISTER',theme:'phosphor',mark:'☷'},
  revise:{title:'发现问题与修正',en:'REVISION DESK',theme:'amber',mark:'↶'},
  summary:{title:'整理回答',en:'RESPONSE ASSEMBLY',theme:'paper',mark:'▣'}
};
const THEMES={obsidian:'深黑仪表',paper:'纸白档案',night:'深海终端',amber:'琥珀显像管',phosphor:'荧光绿屏',violet:'紫晶像素',blueprint:'工程蓝图'};
const rules=[
 ['revise',/(修正|纠正|重新考虑|回滚|排除这个|改为|reconsider|revise|rollback|instead\b)/ig],
 ['compare',/(比较|对比|权衡|优缺点|方案\s*[AB甲乙]|vs\.?\b|compare|trade.?off|alternative)/ig],
 ['check',/(检查|验证|核验|测试|断言|verify|validation|checklist|test\b|assert)/ig],
 ['search',/(检索|搜索|查找|查阅|资料|参考来源|search|retrieve|look up|sources?\b)/ig],
 ['math',/(推导|公式|方程|概率|积分|矩阵|equation|formula|derive|integral)/ig],
 ['code',/(```|函数|接口|组件|代码|类定义|实现细节|function\b|interface\b|class\b|implement|code\b|schema)/ig],
 ['plan',/(计划|步骤|分解|拆解|首先|接下来|第[一二三四五六七八九十\d]+步|plan\b|steps?\b|first\b|next\b)/ig]
];
function turnNodes(graph){
  const index=graph.nodes.findLastIndex(n=>n.kind==='input');
  return graph.nodes.slice(Math.max(0,index));
}
function classifyScene(text){
  // Prefer a new heading or the current tail, not stale keywords earlier in a paragraph.
  const tail=String(text||'').slice(-1400);
  const heading=tail.split('\n').filter(Boolean).at(-1)||tail;
  let best={id:'analysis',score:0,match:'公开推理片段'};
  for(const [id,pattern] of rules){
    pattern.lastIndex=0;
    const matches=[...tail.matchAll(pattern)];
    if(!matches.length)continue;
    const last=matches.at(-1);
    const headPattern=new RegExp(pattern.source,'i');
    const start=heading.replace(/^[#\s\d.、\-]+/,'').slice(0,30);
    const first=headPattern.exec(start);
    const score=Math.min(matches.length,3)+(last.index/tail.length)*.5+(first&&first.index<8?2:0);
    if(score>best.score)best={id,score,match:last[0]};
  }
  return best;
}
function detectScene(graph){
  const nodes=turnNodes(graph), last=nodes.at(-1);
  const turn=nodes.find(n=>n.kind==='input')?.id||'history';
  const meta=(id,reason,node=last)=>({id,turn,reason,focusId:node?.id});
  if(!last)return meta('idle','等待对话事件');
  const running=nodes.findLast(n=>n.kind==='tool'&&n.status==='running');
  if(running&&graph.running)return meta('execute','工具正在运行',running);
  if(last.kind==='error'||last.kind==='retry'||last.kind==='tool'&&last.status==='error')return meta('revise','工具错误或运行重试');
  if(last.kind==='answer')return meta('summary',graph.running?'正在生成回答':'已观察到回答文本');
  if(last.kind==='tool')return meta('execute','工具返回了结果');
  if(last.kind==='input')return meta('analysis','收到新的输入');
  let detected=classifyScene(last.source);
  // A neutral continuation of the same public reasoning block keeps its context.
  if(detected.id==='analysis'&&/^a:/.test(last.id||'')){
    const block=last.id.replace(/:\d+$/,'');
    const previous=nodes.slice(0,-1).filter(n=>n.id?.replace(/:\d+$/,'')===block).reverse();
    for(const n of previous){const earlier=classifyScene(n.source);if(earlier.id!=='analysis'){detected=earlier;break;}}
  }
  return meta(detected.id,detected.id==='analysis'?'公开推理片段':`原文匹配「${detected.match}」`);
}
function routeScene(state,candidate,now,immediate=false){
  if(!state||state.turn!==candidate.turn||immediate)return {...candidate,since:now,pending:null};
  if(state.id===candidate.id)return {...state,...candidate,pending:null};
  const urgent=['execute','revise','summary'].includes(candidate.id);
  if(state.pending?.id!==candidate.id)return {...state,pending:{id:candidate.id,at:now}};
  if(now-state.pending.at>=(urgent?260:650)&&now-state.since>=(urgent?350:1400))return {...candidate,since:now,pending:null};
  return state;
}
function fragments(nodes,limit=6){
  const result=[];
  for(const node of nodes){
    const lines=String(node.source).split(/\n+|(?<=[。！？;；])\s*/u).map(s=>s.trim()).filter(Boolean);
    lines.forEach((text,index)=>result.push({key:node.id+':'+index,nodeId:node.id,text:text.slice(0,900),label:node.label,status:node.status}));
  }
  return result.slice(-limit);
}
function buildScene(graph,id){
  const nodes=turnNodes(graph);
  const input=nodes.find(n=>n.kind==='input');
  const reasoning=nodes.filter(n=>!['input','tool','answer','error','retry'].includes(n.kind));
  const relevant=reasoning.filter(n=>classifyScene(n.source).id===id);
  const focus=nodes.at(-1);
  const sourceNodes=relevant.length?relevant.slice(-4):reasoning.length?reasoning.slice(-3):focus?[focus]:[];
  const items=fragments(sourceNodes,8);
  const explicitSteps=items.filter(item=>/^(?:[-*#]\s*)?(?:第[一二三四五六七八九十\d]+步|步骤\s*\d|step\s*\d|\d+[.、])/i.test(item.text));
  const steps=explicitSteps.length?explicitSteps:items;
  const options=[];
  for(const node of sourceNodes){
    const pattern=/(?:方案|选项|Option|Approach)\s*([A-D甲乙丙丁一二三四1-4])\s*[:：.、]?/ig;
    const matches=[...node.source.matchAll(pattern)];
    matches.forEach((match,i)=>options.push({key:node.id+':option:'+i,nodeId:node.id,label:match[0].replace(/[:：.、]$/,''),text:node.source.slice(match.index+match[0].length,matches[i+1]?.index).trim().slice(0,900),status:node.status}));
  }
  const tools=nodes.filter(n=>n.kind==='tool').slice(-6);
  // Rejoin adjacent segments of a single source block so closing fences do not
  // replace the actual code. Every displayed line still comes from that block.
  const codeGroups=[];
  for(const node of reasoning){
    const key=/^a:/.test(node.id)?node.id.replace(/:\d+$/,''):node.id;
    const previous=codeGroups.at(-1);
    if(previous?.key===key){previous.text+=node.source;previous.nodes.push(node);}
    else codeGroups.push({key,text:node.source,nodes:[node]});
  }
  const codeGroup=codeGroups.findLast(g=>/```[^\n]*\n/.test(g.text));
  const codeMatch=codeGroup?.text.match(/```[^\n]*\n([\s\S]*?)(?:```|$)/);
  const codeNode=codeGroup?.nodes[0]||sourceNodes.at(-1);
  const code=codeMatch?codeMatch[1]:codeNode?.source||'';
  const formulas=[];
  for(const n of sourceNodes){
    const math=[...n.source.matchAll(/\$\$([\s\S]*?)\$\$|\$([^\n$]+)\$|([^\n。；$]{0,70}[=≈≤≥][^\n。；$]{1,120})/g)];
    math.forEach((m,i)=>formulas.push({key:n.id+':eq:'+i,nodeId:n.id,text:m[1]||m[2]||m[3]}));
  }
  return {id,info:SCENES[id]||SCENES.analysis,nodes,input,focus,items,steps,options:options.slice(-4),tools,code,codeNode,formulas:formulas.slice(-4),answer:nodes.findLast(n=>n.kind==='answer'),running:graph.running};
}
module.exports={SCENES,THEMES,turnNodes,classifyScene,detectScene,routeScene,buildScene};
