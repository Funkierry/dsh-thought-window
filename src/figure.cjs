'use strict';
const {createElement:h}=require('react');
const {pointsFor}=require('./choreography.cjs');
const text=(s,n=28)=>String(s||'').replace(/\s+/g,' ').slice(0,n);
function fitText(value,width,size=12){let used=0,result='';for(const ch of [...text(value,500)]){const next=/[\u0000-\u00ff]/.test(ch)?size*.61:size;if(used+next>width-size)return result+'…';used+=next;result+=ch;}return result;}
const forms={idle:'BOOT',analysis:'CORPUS',plan:'PIPELINE',compare:'BRANCH',search:'RETRIEVE',code:'SOURCE',math:'DERIVE',execute:'EXECUTE',check:'REGISTER',revise:'REVISE',summary:'COMPOSE'};
const glyphs={
 G:['01111','10000','10000','10111','10001','10001','01111'],
 A:['01110','10001','10001','11111','10001','10001','10001'],B:['11110','10001','10001','11110','10001','10001','11110'],C:['01111','10000','10000','10000','10000','10000','01111'],D:['11110','10001','10001','10001','10001','10001','11110'],E:['11111','10000','10000','11110','10000','10000','11111'],I:['111','010','010','010','010','010','111'],L:['10000','10000','10000','10000','10000','10000','11111'],M:['10001','11011','10101','10101','10001','10001','10001'],O:['01110','10001','10001','10001','10001','10001','01110'],P:['11110','10001','10001','11110','10000','10000','10000'],R:['11110','10001','10001','11110','10100','10010','10001'],S:['01111','10000','10000','01110','00001','00001','11110'],T:['11111','00100','00100','00100','00100','00100','00100'],U:['10001','10001','10001','10001','10001','10001','01110'],V:['10001','10001','10001','10001','10001','01010','00100'],X:['10001','10001','01010','00100','01010','10001','10001']
};
function PixelWord({word,x=24,y=40,cell=4}){
  let offset=0;const bits=[];
  for(const [index,letter] of [...word].entries()){
    const rows=glyphs[letter]||glyphs.I;
    rows.forEach((row,r)=>[...row].forEach((value,c)=>{if(value==='1')bits.push(h('rect',{key:`${index}:${r}:${c}`,x:x+(offset+c)*cell,y:y+r*cell,width:cell-1,height:cell-1}));}));
    offset+=rows[0].length+1;
  }
  return h('g',{className:'tw-pixel-word'},bits);
}
function Figure({model,onSelect}){
  const id=model.id,items=model.items.slice(-6),points=pointsFor(id),total=model.nodes.length;
  const select=(nodeId)=>()=>{if(nodeId)onSelect(nodeId);};
  const node=(key,x,y,label,source,wide=145)=>h('g',{key,className:'tw-figure-node','data-figure-source':source,role:'button',tabIndex:0,'aria-label':'查看原文：'+label,onClick:select(source),onKeyDown:e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(source)();}}},h('title',null,label),h('rect',{x,y,width:wide,height:45,rx:0}),h('rect',{x:x-3,y:y-3,width:6,height:6,className:'tw-figure-dot'}),h('text',{x:x+12,y:y+19,className:'tw-svg-label'},fitText(label,wide-24)),h('text',{x:x+12,y:y+34,className:'tw-svg-meta'},source?fitText(source,wide-24,9):'等待原文'));
  const line=(key,d)=>h('path',{key,d,className:'tw-diagram-path',pathLength:1});
  let content;
  if(id==='idle'||id==='analysis'){
    const words=(items.map(n=>n.text).join(' ').match(/[A-Za-z_][\w.-]{2,18}|[\u4e00-\u9fff]{2,7}/g)||[]).slice(-22);
    content=h('g',null,line('stream','M 30 205 C 140 195 165 92 268 118 S 439 203 600 102'),
      h(PixelWord,{word:id==='idle'?'IDLE':'CORPUS',x:28,y:41,cell:5}),
      words.map((word,i)=>h('text',{key:i,x:40+(i%5)*119+(i%2)*10,y:115+Math.floor(i/5)*28,className:'tw-river-glyph',style:{'--delay':(i%8)*-.7+'s'}},word)),
      !words.length?h('text',{x:30,y:156,className:'tw-svg-label'},'等待公开文本落入画布。'):null,
      h('rect',{x:588,y:94,width:9,height:9,className:'tw-focus-cell'}));
  }else if(id==='plan'){
    const rows=model.steps.slice(-4),spacing=590/Math.max(1,rows.length);
    content=h('g',null,h(PixelWord,{word:'PIPE',x:27,y:36,cell:4}),
      rows.map((item,i)=>h('g',{key:item.key},i?line('line',`M ${85+(i-1)*spacing} ${115+(i-1)*32} H ${85+i*spacing} V ${115+i*32}`):null,
        node(item.key,25+i*spacing,92+i*32,item.text,item.nodeId,spacing-14),
        h('text',{x:25+i*spacing,y:158+i*32,className:'tw-svg-meta'},'SOURCE '+String(i+1).padStart(2,'0')))),
      h('text',{x:611,y:46,textAnchor:'end',className:'tw-svg-meta'},'步骤顺序 / '+rows.length));
  }else if(id==='compare'){
    const options=model.options.length?model.options.slice(0,4):items.slice(0,2).map((v,i)=>({...v,label:'片段 '+(i+1)}));
    content=h('g',null,h('text',{x:320,y:52,textAnchor:'middle',className:'tw-svg-label'},text(model.input?.source,30)||'并列阅读'),h('rect',{x:315,y:72,width:10,height:10,className:'tw-focus-cell'}),
      options.map((option,i)=>{const x=45+i*(550/Math.max(1,options.length-1)),tx=Math.max(12,Math.min(468,x-65));return h('g',{key:option.key},line('branch',`M 320 82 C 320 130 ${x} 100 ${x} 176`),node(option.key,tx,174,option.label,option.nodeId,160),h('text',{x:tx+12,y:239,className:'tw-svg-meta'},fitText(option.text,138,9)));}),
      h('text',{x:320,y:277,textAnchor:'middle',className:'tw-svg-meta'},'ALTERNATIVES / 不添加优劣评分'));
  }else if(id==='search'){
    content=h('g',null,[45,77,110].map(r=>h('circle',{key:r,cx:320,cy:150,r,className:'tw-map-ring'})),h('path',{d:'M 210 150 H 430 M 320 40 V 260',className:'tw-grid-line'}),
      h('g',{className:'tw-orbital-scan'},h('path',{d:'M 320 150 L 320 40 A 110 110 0 0 1 395 70 Z',className:'tw-radar-wedge'})),
      items.slice(0,4).map((item,i)=>{const x=i%2?455:25,y=i<2?57:193;return h('g',{key:item.key},line('thread',`M 320 150 Q ${x+70} 150 ${x+70} ${y+23}`),node(item.key,x,y,text(item.text,16),item.nodeId,158));}),
      h('rect',{x:315,y:145,width:10,height:10,className:'tw-focus-cell'}));
  }else if(id==='execute'){
    const tools=model.tools.slice(-3);
    content=h('g',null,h(PixelWord,{word:'EXECUTE',x:26,y:35,cell:6}),
      h('text',{x:608,y:74,textAnchor:'end',className:'tw-svg-meta'},model.running?'STREAM OPEN':'STREAM IDLE'),
      line('bus','M 40 185 H 600'),
      (tools.length?tools:[{id:null,title:'等待工具事件',status:'stopped'}]).map((tool,i)=>h('g',{key:tool.id||'empty'},node(tool.id||'waiting',42+i*195,147,tool.title,tool.id,165),h('text',{x:54+i*195,y:220,className:'tw-svg-meta'},({running:'● RUNNING',done:'■ RETURNED',error:'× ERROR',stopped:'Ⅱ STOPPED'})[tool.status]))),
      model.running?h('rect',{x:35,y:180,width:9,height:9,className:'tw-bus-dot'}):null);
  }else if(id==='math'){
    content=h('g',null,Array.from({length:12},(_,i)=>h('path',{key:i,d:`M ${28+i*52} 26 V 270`,className:'tw-grid-line'})),Array.from({length:5},(_,i)=>h('path',{key:'r'+i,d:`M 28 ${45+i*48} H 610`,className:'tw-grid-line'})),
      h('text',{x:557,y:113,className:'tw-sigma'},'∑'),h(PixelWord,{word:'DERIVE',x:27,y:37,cell:4}),
      (model.formulas.length?model.formulas:items).slice(0,3).map((item,i)=>h('g',{key:item.key,onClick:select(item.nodeId),className:'tw-formula-line'},h('text',{x:36,y:116+i*53,className:'tw-svg-meta'},'0'+(i+1)),h('text',{x:84,y:116+i*53,className:'tw-svg-equation'},text(item.text,41)))));
  }else if(id==='check'){
    content=h('g',null,h(PixelWord,{word:'REGISTER',x:28,y:30,cell:4}),
      items.slice(0,5).map((item,i)=>h('g',{key:item.key,className:'tw-register-line',onClick:select(item.nodeId),style:{'--order':i}},h('rect',{x:32,y:85+i*35,width:13,height:13,className:'tw-register-box'}),h('text',{x:63,y:96+i*35,className:'tw-svg-label'},text(item.text,37)),h('path',{d:`M 65 ${111+i*35} H 609`,className:'tw-grid-line'}),h('text',{x:593,y:96+i*35,className:'tw-svg-meta'},String(i+1).padStart(2,'0')))));
  }else if(id==='revise'){
    content=h('g',null,h(PixelWord,{word:'REVISE',x:28,y:32,cell:5}),
      h('path',{d:'M 299 153 H 342 M 332 144 L 344 153 L 332 162',className:'tw-revision-arrow'}),
      h('rect',{x:34,y:105,width:247,height:119,className:'tw-revision-before'}),h('rect',{x:363,y:105,width:247,height:119,className:'tw-revision-after'}),
      h('text',{x:49,y:133,className:'tw-svg-meta'},'REASSESS'),h('text',{x:377,y:133,className:'tw-svg-meta'},'REFRAME'),
      h('text',{x:49,y:164,className:'tw-svg-label'},text(model.nodes.find(n=>n.status==='error')?.source||items[0]?.text,18)),
      h('text',{x:377,y:164,className:'tw-svg-label'},text(items.at(-1)?.text,18)),
      h('path',{d:'M 49 190 H 255',className:'tw-redline'}));
  }else if(id==='summary'){
    content=h('g',null,h(PixelWord,{word:'COMPOSE',x:27,y:33,cell:4}),
      [0,1,2].map(i=>h('rect',{key:i,x:202-i*6,y:82-i*6,width:236,height:166,className:'tw-paper-layer'})),
      [0,1,2,3,4].map(i=>h('g',{key:i},h('rect',{x:214,y:103+i*25,width:6,height:6,className:'tw-figure-dot'}),h('path',{d:`M 233 ${106+i*25} H ${i===4?355:405}`,className:'tw-compose-line',style:{'--order':i}}))),
      h('text',{x:487,y:119,className:'tw-svg-meta'},model.running?'DRAFT':'RESPONSE'),h('text',{x:487,y:143,className:'tw-svg-meta'},'SOURCE TEXT'),h('rect',{x:416,y:216,width:9,height:9,className:'tw-focus-cell'}));
  }else{
    const codeLines=model.code.split('\n').filter(s=>s.trim()).slice(0,3);
    content=h('g',null,h(PixelWord,{word:'SOURCE',x:28,y:32,cell:5}),
      codeLines.map((source,i)=>h('g',{key:i},h('rect',{x:35+i*200,y:112,width:167,height:90,className:'tw-source-module'}),h('text',{x:48+i*200,y:137,className:'tw-svg-meta'},'SOURCE '+String(i+1).padStart(2,'0')),h('text',{x:48+i*200,y:170,className:'tw-svg-label'},fitText(source,141)),i<codeLines.length-1?line('l',`M ${202+i*200} 157 H ${231+i*200}`):null)),h('text',{x:38,y:250,className:'tw-svg-meta'},'按原文顺序摘录 / READ ONLY'));
  }
  return h('figure',{className:'tw-film-figure','data-form':id},h('div',{className:'tw-figure-register'},h('span',null,'/ '+(forms[id]||'TRACE').toLowerCase()),h('span',null,'SOURCE EVENTS '+String(total).padStart(2,'0'))),
    h('svg',{viewBox:'0 0 640 300',role:'img','aria-label':model.info.title+'示意图'},h('g',{className:'tw-ambient-points','aria-hidden':true},points.filter((_,i)=>i%2===0).map((p,i)=>h('rect',{key:i,x:p.x,y:p.y,width:2,height:2}))),content),
    h('figcaption',null,h('span',{className:'tw-caption-cell'}),h('span',{className:'tw-caption-text'},text(model.focus?.source,120)||'等待一个新的想法。')));
}
module.exports={Figure,PixelWord};
