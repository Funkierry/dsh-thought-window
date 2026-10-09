'use strict';
const {validateWork}=require('./work-data.cjs');

// Projection only: no network requests, inferred private thoughts, or model calls.
const MAX_NODES = 160;
const MAX_SOURCE = 12000;
const labels = {input:'输入', reasoning:'推理片段', compare:'比较 · 自动标签', check:'检查 · 自动标签', revise:'修正 · 自动标签', tool:'工具调用', answer:'回答', error:'运行错误', retry:'重试'};
const clip = (s, n) => String(s ?? '').slice(0, n);
const contentText = content => (Array.isArray(content) ? content : []).filter(b => b?.type === 'text').map(b => String(b.text ?? '')).join('\n');

function classify(text) {
  if (/(?:重新|修正|纠正|但是.*不|reconsider|instead|revise)/i.test(text)) return 'revise';
  if (/(?:验证|检查|测试|确认|verify|check|test\b)/i.test(text)) return 'check';
  if (/(?:比较|相比|方案.?[AB甲乙]|优缺点|compare|versus|alternative)/i.test(text)) return 'compare';
  return 'reasoning';
}

// Boundaries only depend on the prefix so streaming updates do not reshuffle IDs.
function segments(value) {
  const text = String(value ?? '');
  const result = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const length = i - start + 1;
    if ((length >= 55 && /[。！？\n]/u.test(text[i])) || length >= 220) {
      result.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < text.length && text.slice(start).trim()) result.push(text.slice(start));
  return result;
}

function project(legacy, running = false) {
  const nodes = [];
  const tools = new Map();
  let clipped = 0;
  function add(node) {
    const source = String(node.source ?? '');
    nodes.push({...node, label:labels[node.kind] || node.kind, source:clip(source, MAX_SOURCE), truncated:source.length > MAX_SOURCE, excerpt:clip(source.replace(/\s+/g, ' ').trim(), 92)});
  }
  function tool(call, meta = {}) {
    const id = `tool:${call.callId}`;
    if (!tools.has(id)) {
      add({id, kind:'tool', title:clip(call.name || call.call?.name || 'tool', 90), source:call.argsRaw ?? call.call?.argsRaw ?? '', status:running?'running':'stopped', ...meta});
      tools.set(id, nodes[nodes.length - 1]);
    }
    return tools.get(id);
  }
  function assistant(item, partial) {
    const blocks = item.blocks || [];
    blocks.forEach((block, bi) => {
      const base = {turn:item.turn, step:item.step, time:item.time, seq:item.seq, status:item.interrupted?'stopped':'done'};
      if (block.kind === 'tool-call') {
        tool(block, {...base,status:running&&!item.interrupted?'running':'stopped'});
      } else if (block.kind === 'reasoning' || block.kind === 'text') {
        const isReason = block.kind === 'reasoning';
        const pieces = isReason ? segments(block.text) : [String(block.text ?? '')];
        const offset = Math.max(0, pieces.length - 40);
        clipped += offset;
        pieces.slice(offset).forEach((source, j) => {
          if (!source.trim()) return;
          const kind = isReason ? classify(source) : 'answer';
          add({...base, id:`a:${item.turn}:${item.step}:${bi}:${offset+j}`, kind, title:clip(source.replace(/^[\s#*\-]+/, '').replace(/\s+/g,' ').trim(), 44), source,
            status:partial && bi===blocks.length-1 && j===pieces.length-offset-1 ? (running?'running':'stopped') : base.status});
        });
      }
    });
  }
  const records = legacy?.nodes || [];
  // Streaming and final forms can briefly coexist during host settlement.
  const finalized = new Set(records.filter(n=>n.kind==='assistant').map(n=>`${n.turn}:${n.step}`));
  for (const item of records) {
    const base = {time:item.time,seq:item.seq,turn:item.turn,step:item.step};
    if (item.kind === 'user' || item.kind === 'steering') {
      const source = contentText(item.content);
      add({...base,id:`${item.kind}:${item.seq}`,kind:'input',title:clip(source || '附件输入',44),source:source || '此消息含非文本附件，请在原生聊天中查看。',status:'done'});
    } else if (item.kind === 'assistant') {
      assistant(item,false);
    } else if (item.kind === 'tool-result') {
      const node = tool(item,{...base, parentCallId:item.parentCallId});
      const result = contentText(item.content) || String(item.error?.message ?? item.error ?? '（工具未返回文本）');
      const source = `参数\n${node.source}\n\n返回\n${result}`;
      Object.assign(node,{status:item.isError?'error':'done',source:clip(source,MAX_SOURCE),truncated:source.length>MAX_SOURCE,excerpt:clip(result.replace(/\s+/g,' '),92),time:item.callTime ?? node.time});
    } else if (item.kind === 'turn-error') {
      add({...base,id:`error:${item.seq}`,kind:'error',title:'运行中断',source:item.message,status:'error'});
    } else if (item.kind === 'model-retry') {
      add({...base,id:`retry:${item.seq}`,kind:'retry',title:'模型请求重试',source:item.message || item.reason || 'DSH 发起请求重试',status:'done'});
    }
    // Explicitly omit context, system prompts, unknown events, and binary blocks.
  }
  if (legacy?.partial && !finalized.has(`${legacy.partial.turn}:${legacy.partial.step}`)) assistant(legacy.partial,true);
  for (const call of legacy?.runningCalls || []) {
    const node = tool(call, {turn:call.turn,step:call.step,time:call.time,parentCallId:call.parentCallId});
    // A durable result wins over a stale running-call projection.
    if (!records.some(r=>r.kind==='tool-result' && r.callId===call.callId)) node.status=running?'running':'stopped';
  }
  const excess = Math.max(0,nodes.length-MAX_NODES);
  const visible = nodes.slice(excess);
  const ids = new Set(visible.map(n=>n.id));
  const edges = [];
  visible.forEach((n,i)=>{
    if(i) edges.push({from:visible[i-1].id,to:n.id,kind:'sequence'});
    if(n.parentCallId && ids.has(`tool:${n.parentCallId}`)) edges.push({from:`tool:${n.parentCallId}`,to:n.id,kind:'parent'});
  });
  return {nodes:visible, edges, running:!!running, omitted:clipped+excess, hasReasoning:nodes.some(n=>['reasoning','check','compare','revise'].includes(n.kind))};
}

// Total history is bounded by both frame count and text size, including long answers.
function appendFrame(frames, graph, time=Date.now(), maxFrames=90, maxBytes=4_000_000) {
  const signature=JSON.stringify(graph);
  if(frames.length && JSON.stringify(frames.at(-1).graph)===signature) return frames;
  const next=[...frames,{at:time,graph}];
  let size=next.reduce((sum,f)=>sum+JSON.stringify(f).length*2,0);
  while(next.length>1 && (next.length>maxFrames || size>maxBytes)) size-=JSON.stringify(next.shift()).length*2;
  return next;
}

function validateReplay(value) {
  if(!value || value.format!=='dsh-thought-window' || value.version!==1 || !Array.isArray(value.frames) || !value.frames.length || value.frames.length>90) throw Error('不支持的回放格式');
  if(JSON.stringify(value).length>6_000_000) throw Error('回放过大');
  const kinds=new Set(Object.keys(labels));
  for(const f of value.frames) {
    if(!Number.isFinite(f.at) || !f.graph || !Array.isArray(f.graph.nodes) || f.graph.nodes.length>MAX_NODES || !Array.isArray(f.graph.edges) || f.graph.edges.length>MAX_NODES*2) throw Error('回放节点格式错误');
    validateWork(f.graph.work);
    const ids=new Set();
    for(const n of f.graph.nodes) {
      if(typeof n.id!=='string' || n.id.length>300 || ids.has(n.id) || !kinds.has(n.kind) || !['done','running','stopped','error'].includes(n.status)) throw Error('回放节点无效');
      ids.add(n.id);
      for(const field of ['title','source','excerpt','label']) if(typeof n[field]!=='string' || n[field].length>MAX_SOURCE) throw Error('回放文本无效');
    }
    for(const e of f.graph.edges) if(!ids.has(e.from)||!ids.has(e.to)||!['sequence','parent'].includes(e.kind)) throw Error('回放连线无效');
  }
  return value.frames;
}
module.exports={project,segments,classify,appendFrame,validateReplay,contentText};
