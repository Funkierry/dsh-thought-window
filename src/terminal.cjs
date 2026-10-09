'use strict';
const React=require('react');
const {createElement:h,useEffect,useRef}=React;
const family=node=>node.kind==='input'?'IN':node.kind==='tool'?'IO':node.kind==='answer'?'OUT':node.kind==='error'?'ERR':'TH';
const brief=text=>Array.from(String(text||'').replace(/\s+/g,' ').trim()).slice(0,48).join('');
function Terminal({graph,selected,onSelect,animate,follow}){
  const scroll=useRef(null);
  useEffect(()=>{if(follow&&scroll.current)scroll.current.scrollTo({top:scroll.current.scrollHeight,behavior:animate?'smooth':'auto'});},[graph.nodes.length,follow,animate]);
  const counts={IN:0,TH:0,IO:0,OUT:0,ERR:0};graph.nodes.forEach(n=>counts[family(n)]++);
  const last=graph.nodes.at(-1);
  const sizes=graph.nodes.map(n=>Array.from(n.source).length);
  const maximum=Math.max(1,...sizes);
  const stream=graph.nodes.slice(-48);
  const recentInput=graph.nodes.findLast(n=>n.kind==='input');
  const recentTool=graph.nodes.findLast(n=>n.kind==='tool');
  return h('div',{className:'tw-terminal'},
    h('div',{className:'tw-term-heading'},h('strong',null,'trace.timeline()'),h('span',null,graph.running?'[ stream open ]':'[ stream idle ]')),
    h('div',{className:'tw-term-main'},
      h('nav',{className:'tw-index','aria-label':'事件分类索引'},h('span',null,'events/'),Object.entries(counts).map(([key,value])=>h('div',{key,className:'tw-index-item '+(last&&family(last)===key?'tw-index-current':'')},h('b',null,key),h('small',null,String(value).padStart(2,'0')))),h('span',{className:'tw-index-total'},graph.nodes.length+'/ '+graph.nodes.length),h('small',null,'loaded')),
      h('div',{className:'tw-term-trace'},
        h('div',{className:'tw-term-command'},h('span',null,'$'),h('strong',null,'observe --public --follow'),h('i',{className:graph.running?'tw-caret tw-pulse-caret':'tw-caret'})),
        h('div',{className:'tw-term-axis'},h('span',null,'event / 原文摘录'),h('span',null,'字数 →')),
        h('div',{className:'tw-term-rows',ref:scroll,tabIndex:0,'aria-label':'终端事件列表'},
          !graph.nodes.length?h('div',{className:'tw-term-idle'},h('div',{className:'tw-pixel-orbit','aria-hidden':true},'▧'),h('strong',null,'等待一条消息，点亮下一行。'),h('p',null,'public reasoning · tool calls · replies')):null,
          graph.nodes.map((node,i)=>{
            const count=sizes[i];const size=12+Math.sqrt(count/maximum)*27;
            return h('button',{type:'button',key:node.id,'data-tw-node':node.id,className:`tw-term-row tw-status-${node.status} ${selected===node.id?'tw-term-selected':''}`,onClick:()=>onSelect(node.id),'aria-pressed':selected===node.id},
              h('span',{className:'tw-row-index'},String(i+1).padStart(2,'0')),
              h('span',{className:'tw-row-copy'},h('strong',null,brief(node.title||node.source)||node.label),h('small',null,`${family(node)} / ${node.kind==='tool'?node.title:node.label}${node.turn!==undefined?' · t'+node.turn:''}`)),
              h('span',{className:'tw-row-leader','aria-hidden':true}),
              h('span',{className:'tw-row-bubble',style:{width:size,height:size},'aria-hidden':true}),h('span',{className:'tw-row-count'},count)
            );
          })
        ),
        h('div',{className:'tw-forward'},h('div',null,h('span',null,'event buffer'),h('span',null,'每格一个事件 · 非模型权重')),h('div',{className:'tw-buffer-cells'},Array.from({length:48},(_,i)=>h('i',{key:i,title:stream[i]?`${family(stream[i])} / ${stream[i].label}`:'empty',className:stream[i]?`tw-cell-${family(stream[i])} ${stream[i].status==='running'?'tw-cell-running':''}`:''}))))
      )
    ),
    h('div',{className:'tw-instruments'},
      h('section',{className:'tw-instrument'},h('h3',null,'stdin · latest'),h('p',null,brief(recentInput?.source)||'等待输入…'),h('small',null,'原始输入摘录')),
      h('section',{className:'tw-instrument'},h('h3',null,'io · execution'),h('p',null,recentTool?.title||'尚无工具调用'),h('small',null,recentTool?({done:'已完成',running:'正在运行',stopped:'已停止',error:'执行失败'}[recentTool.status]):'工具事件驱动')),
      h('section',{className:'tw-instrument tw-signal'},h('h3',null,'signal · chars'),h('svg',{viewBox:'0 0 200 40','aria-label':'最近事件原文字数变化'},h('path',{d:'M0 35H200',className:'tw-signal-axis'}),h('polyline',{points:sizes.slice(-24).map((n,i,a)=>`${i*196/Math.max(1,a.length-1)+2},${35-30*n/maximum}`).join(' '),className:'tw-signal-line'})),h('small',null,'横轴事件 / 纵轴字数'))
    )
  );
}
module.exports={Terminal};
