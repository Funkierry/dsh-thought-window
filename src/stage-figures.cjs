'use strict';
// Figure builders: (context) -> target marks, texts and live decorations.
// Pure functions of the reading queue, so they are testable without a canvas.
// A mark is a cell of the drawing; `from` is where it is born (usually the
// figure's baseline, which makes drawings grow upward) and `delay` orders the
// build. Stable ids let a streaming update move only what changed. Sizes scale
// with the canvas (A.s) so a drawing fills the frame at any window size.
const D=require('./stage-data.cjs');
const TITLES={idle:'boot / standby',glyph:'stdin / query',bars:'think / length',curve:'stream / chars',cloud:'trace / point-set',mask:'trace / overlap',grid:'plan / sequence',compare:'options / compare',boot:'verify.log',exec:'tool.exchange',redline:'revision.log',code:'source.code',formula:'formula.extract',compose:'output / compose',table:'output / table',tokenizer:'tokenizer',agentloop:'agent / loop',diff:'revision.diff',spiral:'sampling / spiral',nexttoken:'next_token',errorbig:'stderr',timeline:'timeline',todos:'todos',tokens:'context / tokens',files:'files',outline:'thought / outline',radar:'keyword radar',heatmap:'word × step',constellation:'word constellation'};
const CAPTIONS={
 idle:'等待公开推理、工具事件或回答',
 glyph:'大字 = 输入中的关键词 · 下方为本轮高频词与出现次数',
 bars:'柱高 = 每个片段（或词）的字符数',
 curve:'上 = 累计字符 · 下 = 每步增量 · 横轴为观察到的到达顺序',
 cloud:'点群 = 片段 · 位置 = 字符二元组哈希投影，不是语义向量',
 mask:'格 = 两个片段的字符二元组重叠度 · 右上为尚未出现的片段',
 grid:'行 = 相邻片段 · 格中为该段文字的首字',
 compare:'塔 = 片段的逐字堆叠 · sim = 字符二元组 Jaccard，不表示优劣',
 boot:'日志行 = 已收到的原文片段 · CHK 不代表核验已通过',
 exec:'格 = 工具返回原文的逐字 · RET 只表示调用已返回',
 redline:'删除线表示后文调整了方向，不判定对错',
 code:'右侧条 = 每行长度',
 formula:'柱高 = 符号在原文中的出现次数',
 compose:'块 = 回答原文中的字符 · 末行为当前片段',
 table:'表格逐格摘自回答原文',
 outline:'思路提纲：推理结束后由模型根据公开推理归纳（额外 1 次调用）· 只整理原文，不代表结论正确'
};
const chunk=(text,size)=>{const list=D.chars(String(text||'').replace(/\s+/g,' ').trim()),out=[];for(let i=0;i<list.length;i+=size)out.push(list.slice(i,i+size).join(''));return out;};
const cjkRatio=text=>{const list=D.chars(text).filter(ch=>ch.trim());return list.length?list.filter(D.isCJK).length/list.length:0;};
const firstVisible=text=>D.chars(text).find(ch=>/[\p{L}\p{N}]/u.test(ch))||D.chars(text).find(ch=>ch.trim())||'·';
const units=ch=>D.isCJK(ch)||/[＀-￯　-〿]/u.test(ch)?2:1;
const span=text=>D.chars(text).reduce((s,ch)=>s+units(ch),0);
const charLevel=ch=>D.isCJK(ch)?.88:/[\p{L}\p{N}]/u.test(ch)?.62:.3;
// Monospace text: one unit is ~0.6 of the font size; CJK takes two units.
const fit=(text,size,widthPx)=>{const cols=Math.max(4,Math.floor(widthPx/(size*.6)));let used=0,out='';for(const ch of D.chars(String(text||'').replace(/\s+/g,' ').trim())){used+=units(ch);if(used>cols)return out.slice(0,-1)+'…';out+=ch;}return out;};
function wrap(text,cols,maxLines=99){
 const lines=[];
 for(const raw of String(text||'').split('\n')){
  let line='',used=0;
  for(const ch of raw){const u=units(ch);if(used+u>cols){lines.push(line);line='';used=0;}line+=ch;used+=u;}
  if(line.trim())lines.push(line);
 }
 return lines.slice(0,maxLines);
}
function area(box){
 const s=Math.max(.75,Math.min(1.7,Math.min(box.w/720,box.h/470))),pad=Math.round((box.w<420?10:18)*Math.min(s,1.3)),top=Math.round(Math.max(52,Math.min(130,box.h*.2)));
 return {s,pad,x:pad,y:top,w:Math.max(40,box.w-pad*2),h:Math.max(40,box.h-top-30*s),bottom:Math.round(box.h-30*s),right:box.w-pad};
}
const px=(A,n)=>Math.round(n*A.s);
function head(c,text,count,sub){
 const A=area(c.box),big=Math.max(17,px(A,27)),small=Math.max(10,px(A,12));
 const list=[{key:'head',text,count,x:A.pad,y:A.pad+big,size:big,color:'accent',weight:700}];
 if(sub!=null)list.push({key:'sub',text:fit(sub,small,A.w),x:A.pad,y:A.pad+big+small+8,size:small,color:'ink',level:.8});
 return list;
}
const tag=e=>e.status==='running'?'[ .. ]':e.status==='error'?'[ERR!]':'[ '+(({input:'IN  ',check:'CHK ',request:'CALL',result:'RET ',answer:'OUT ',revise:'REV ',error:'ERR!',retry:'RTRY',plan:'PLAN',compare:'CMP ',code:'SRC ',math:'EXPR',search:'SEEK'})[e.kind]||'READ')+']';

function bars(c){
 const A=area(c.box),upto=c.entries.slice(0,c.index+1),bySegment=upto.length>=6;
 let items=bySegment?upto.slice(-72).map(e=>({id:e.id,value:D.length(e.text),focus:e===c.focus}))
  :upto.flatMap(e=>D.words(e.text).filter(w=>w.word).map(w=>({id:e.id+'#'+w.index,value:D.length(w.text),focus:e===c.focus}))).slice(-72);
 if(!items.length)items=[{id:'empty',value:1,focus:true}];
 const n=items.length,max=Math.max(1,...items.map(i=>i.value)),cell=px(A,6);
 const bw=Math.max(4,Math.min(px(A,30),Math.floor(A.w*.88/n))),rows=Math.max(3,Math.min(Math.floor(A.h*.92/cell),Math.floor(2400/n)));
 const x0=A.x+(A.w-n*bw)/2,marks=[];
 items.forEach((item,i)=>{
  const k=Math.max(1,Math.round(item.value/max*rows)),x=x0+i*bw+1;
  for(let r=0;r<k;r++)marks.push({id:item.id+':'+r,x,y:A.bottom-(r+1)*cell+1,w:bw-2,h:cell-2,color:item.focus?'accent':'ink',level:.3+.7*item.value/max,delay:i*14+r*9,from:{x,y:A.bottom}});
 });
 const total=items.reduce((s,i)=>s+i.value,0);
 return {marks,baseline:A.bottom,texts:[...head(c,'{n} chars',{to:total},`${bySegment?'segments':'words'} = ${n} · max = ${max}`),{key:'axis',text:bySegment?'segment →':'word →',x:A.x,y:A.bottom+px(A,14),size:px(A,10),color:'muted'}]};
}

function curve(c){
 const A=area(c.box),plotH=A.h*.56,lowTop=A.y+A.h*.68,lowH=A.bottom-lowTop,s=c.samples||[];
 let points,steps;const observed=s.length>=4;
 if(observed){
  const t0=s[0].t,range=Math.max(1,s.at(-1).t-t0),max=Math.max(1,s.at(-1).chars);
  points=s.map(p=>({u:(p.t-t0)/range,v:p.chars/max}));steps=s.slice(1).map((p,i)=>Math.max(0,p.chars-s[i].chars));
 }else{
  const upto=c.entries.slice(0,c.index+1),total=Math.max(1,upto.reduce((a,e)=>a+D.length(e.text),0));let acc=0;
  points=[{u:0,v:0},...upto.map((e,i)=>({u:(i+1)/upto.length,v:(acc+=D.length(e.text))/total}))];steps=upto.map(e=>D.length(e.text));
 }
 const N=Math.max(24,Math.min(220,Math.floor(A.w/px(A,5)))),dot=Math.max(2,px(A,3)),marks=[];
 const at=u=>{let j=1;while(j<points.length-1&&points[j].u<u)j++;const a=points[j-1],b=points[j]||a,k=b.u-a.u>1e-9?(u-a.u)/(b.u-a.u):1;return a.v+(b.v-a.v)*Math.max(0,Math.min(1,k));};
 let hx=A.x,hy=A.y+plotH;
 for(let k=0;k<=N;k++){
  const x=A.x+k/N*A.w,y=A.y+plotH-at(k/N)*plotH,last=k===N;
  if(last){hx=x;hy=y;}
  marks.push({id:'c'+k,shape:'dot',x:x-dot/2,y:y-dot/2,w:last?dot*2:dot,h:last?dot*2:dot,color:last?'accent':'ink',level:last?1:.82,blink:last,delay:k*8,from:{x:x-dot/2,y:A.y+plotH}});
 }
 const shown=steps.slice(-60),M=Math.max(1,shown.length),bw=Math.max(3,Math.floor(A.w/M)),peak=Math.max(1,...shown),cell=px(A,5);
 shown.forEach((v,i)=>{const cells=Math.max(1,Math.round(v/peak*Math.floor(lowH/cell)));for(let r=0;r<cells;r++)marks.push({id:'d'+(steps.length-shown.length+i)+':'+r,x:A.x+i*bw,y:A.bottom-(r+1)*cell,w:Math.max(2,bw-2),h:cell-2,color:'accent',level:.55,delay:N*5+i*12+r*7,from:{x:A.x+i*bw,y:A.bottom}});});
 const total=observed?s.at(-1).chars:c.entries.slice(0,c.index+1).reduce((a,e)=>a+D.length(e.text),0);
 const seconds=observed?(s.at(-1).t-s[0].t)/1000:0,rate=seconds>0?Math.round(total/seconds):0,small=px(A,11);
 return {marks,baseline:A.y+plotH,texts:[...head(c,'{n} chars',{to:total},observed?`rate ≈ ${rate} chars/s · ${s.length} samples`:`by segment · ${steps.length} steps`),
  {key:'tip',text:D.fmt(total),x:Math.max(A.x+40,hx-8),y:hy-px(A,10),size:px(A,13),color:'accent',align:'right',delay:N*8},
  {key:'ylab',text:'Σ chars',x:A.x,y:A.y-6,size:small,color:'muted'},{key:'dlab',text:'Δ / step',x:A.x,y:lowTop-6,size:small,color:'muted'}]};
}

function grid(c){
 const A=area(c.box),start=Math.max(0,c.index-5),list=c.entries.slice(start,start+8),label=px(A,62);
 const longest=Math.max(1,...list.map(e=>D.length(e.text.replace(/\s+/g,' ')))),cols=Math.max(6,Math.min(40,Math.floor((A.w-label)/px(A,22)))),per=Math.max(1,Math.ceil(longest/cols));
 const shownCols=Math.max(4,Math.min(cols,Math.ceil(longest/per))),cw=Math.min(px(A,64),Math.floor((A.w-label)/shownCols)),gap=px(A,6),rh=Math.max(12,Math.min(px(A,34),Math.floor(A.h/Math.max(1,list.length))-gap)),top=A.y+Math.max(0,(A.h-list.length*(rh+gap))/2);
 const marks=[],texts=[];
 list.forEach((e,r)=>{
  const y=top+r*(rh+gap),focus=e===c.focus;
  texts.push({key:'row'+e.id,text:String(start+r+1).padStart(2,'0')+' '+e.op.slice(0,5),x:A.x,y:y+rh*.68,size:px(A,10),color:focus?'accent':'muted',delay:r*40});
  chunk(e.text,per).slice(0,cols).forEach((part,k)=>{const x=A.x+label+k*cw;marks.push({id:e.id+':'+k,shape:'cell',ch:firstVisible(part),x,y,w:cw-2,h:rh,color:focus?'accent':'ink',level:.2+.6*cjkRatio(part)+(focus?.18:0),delay:k*32+r*20,from:{x,y:y+rh},ref:e.id});});
 });
 const used=shownCols;
 return {marks,baseline:A.bottom,caption:`行 = 相邻片段 · 每格 ${per} 字，格中为该格首字`,texts:[...head(c,`${list.length} rows × {n} cells`,{to:marks.length},'pipeline of adjacent segments'),...texts],
  live:[{type:'sweep',x0:A.x+label,x1:A.x+label+used*cw,y0:top-4,y1:top+list.length*(rh+gap),period:3600}]};
}

function cloud(c){
 const A=area(c.box),upto=c.entries.slice(Math.max(0,c.index-39),c.index+1),P=D.project(upto.map(e=>e.text));
 const side=Math.min(A.w*.58,A.h*1.05),cx=A.x+A.w*.34,cy=A.y+A.h/2,budget=Math.floor(3000/Math.max(1,upto.length)),marks=[];
 upto.forEach((e,i)=>{
  const rng=D.random(D.hash(e.id)),size=D.length(e.text),k=Math.max(30,Math.min(240,budget,Math.round(size*4))),[pxv,pyv,pzv]=P[i];
  const ex=cx+(pxv-.5)*side*.85,ey=cy+(pyv-.5)*side*.8,r=side*.08+Math.sqrt(size)*2.6*A.s,focus=e===c.focus,dot=focus?px(A,3):Math.max(2,px(A,2));
  for(let j=0;j<k;j++){const a=rng()*Math.PI*2,d=r*Math.sqrt(-Math.log(1-rng()*.97))*.62;marks.push({id:e.id+':'+j,shape:'dot',x:ex+Math.cos(a)*d,y:ey+Math.sin(a)*d*.9,w:dot,h:dot,z:(pzv-.5)*side*.7+(rng()-.5)*r*2,color:focus?'accent':'ink',level:focus?1:.38+.5*rng(),delay:i*24+j*3,ref:e.id});}
 });
 const tx=A.x+A.w*.7,size=px(A,16),small=px(A,12),excerpt=wrap(c.focus?.text,Math.max(10,Math.floor((A.right-tx)/(small*.6))),4);
 return {marks,baseline:A.bottom,spin:{cx,speed:.24},texts:[...head(c,'trace / point set',null,`${upto.length} segments`),
  {key:'pts',text:'|points| = {n}',count:{to:marks.length},x:tx,y:A.y+size,size,color:'ink'},
  {key:'cl',text:'clustering ... {n}',count:{to:100,kind:'pct'},x:tx,y:A.y+size*2.6,size:small,color:'ink',level:.8},
  {key:'fx',text:'focus = #'+String(c.index+1).padStart(2,'0'),x:tx,y:A.y+size*5,size:small,color:'accent',delay:500},
  ...excerpt.map((line,i)=>({key:'ex'+i,text:line,x:tx,y:A.y+size*5+(i+1)*small*1.6,size:small,color:'ink',level:.75,delay:650+i*120}))]};
}

function mask(c){
 const A=area(c.box),n=Math.min(16,c.index+1),list=c.entries.slice(c.index+1-n,c.index+1),M=D.overlap(list.map(e=>e.text));
 const s=Math.max(8,Math.min(px(A,40),Math.floor(Math.min((A.w-px(A,170))/n,A.h/n)))),x0=A.x+Math.max(0,(A.w-px(A,170)-n*s)/2),y0=A.y+Math.max(0,(A.h-n*s)/2),marks=[];let sum=0,pairs=0;
 for(let i=0;i<n;i++)for(let j=0;j<n;j++){
  const id=list[i].id+'>'+list[j].id,x=x0+j*s,y=y0+i*s;
  if(j<=i){const v=M[i][j];if(i!==j){sum+=v;pairs++;}marks.push({id,x,y,w:s-3,h:s-3,color:i===n-1?'accent':'ink',level:i===j?.95:.1+.85*Math.min(1,v*3),delay:i*46+j*15,from:{x,y:y+s},ref:list[i].id});}
  else marks.push({id,shape:'glyph',ch:'-',x:x+s*.2,y:y+s*.2,w:s*.6,h:s*.6,color:'muted',level:.5,delay:i*46+j*15});
 }
 const tx=x0+n*s+px(A,22),size=px(A,15);
 return {marks,baseline:y0+n*s,texts:[...head(c,'overlap(i, j ≤ i)',null,`${n} × ${n} · diag = 1`),
  {key:'fut',text:'future:',x:tx,y:y0+size,size,color:'ink',delay:n*40},{key:'msk',text:'masked',x:tx,y:y0+size*2.5,size:px(A,19),color:'ink',weight:700,delay:n*40+200},
  {key:'mean',text:'mean = {n}',count:{to:pairs?sum/pairs:0,kind:'fixed2'},x:tx,y:y0+n*s-4,size:px(A,13),color:'accent',delay:n*50}]};
}

function glyph(c){
 // The input word the rest of the turn repeats most; longer words win ties.
 const A=area(c.box),input=c.focus?.text||'',turn=new Map(D.keywords(c.entries.map(e=>e.text),200).map(k=>[k.word,k.count]));
 const own=D.keywords([input],12).map(k=>({...k,score:(turn.get(k.word)||0)*3+D.length(k.word)})).sort((a,b)=>b.score-a.score);
 const word=D.chars(own[0]?.word||D.short(input,4).replace('…','')||'STDIN').slice(0,6).join('');
 const width=D.chars(word).reduce((s,ch)=>s+(D.isCJK(ch)?1:.62),0)||1,size=Math.max(28,Math.floor(Math.min(A.h*.5,A.w*.6/width))),step=Math.max(4,Math.round(size/26));
 const raster=c.box.raster?.(word,size,step),marks=[];
 if(raster){
  const ox=A.x+(A.w-raster.w)/2,oy=A.y+(A.h*.7-raster.h)/2,mx=raster.w/2,my=raster.h/2;
  raster.points.forEach((p,i)=>marks.push({id:'g'+i,x:ox+p.x,y:oy+p.y,w:step-1,h:step-1,color:'accent',level:.95,delay:Math.hypot(p.x-mx,p.y-my)/1.4,from:{x:ox+p.x,y:A.bottom}}));
 }
 const others=D.keywords(c.entries.map(e=>e.text),24).filter(k=>k.word!==word.toLowerCase()),size2=px(A,12),texts=[];
 let x=A.x,row=0;
 for(const [i,k] of others.entries()){
  const label=k.word+' ×'+k.count,w=(span(label)+3)*size2*.6;
  if(x+w>A.right){row++;x=A.x;}
  if(row>1)break;
  texts.push({key:'kw'+k.word,text:label,x,y:A.bottom-px(A,24)+row*size2*1.7,size:size2,color:k.count>1?'ink':'muted',level:k.count>1?.85:.6,delay:700+i*70});
  x+=w;
 }
 return {marks,baseline:A.bottom,texts:[...head(c,'{n} chars',{to:D.length(input)},'stdin = "'+D.short(input,60)+'"'),...texts]};
}

function boot(c){
 const A=area(c.box),size=px(A,13),lh=Math.round(size*1.55),maxRows=Math.max(2,Math.floor((A.h-px(A,34))/lh)),list=c.entries.slice(0,c.index+1).slice(-maxRows);
 const texts=list.map((e,i)=>({key:'l'+e.id,text:tag(e)+' '+fit(e.text,size,A.w-size*5),x:A.x,y:A.y+size+i*lh,size,color:e.status==='error'?'danger':e===c.focus?'accent':'ink',level:e===c.focus?1:.72,delay:i*90}));
 const all=c.entries.slice(0,90),cw=A.w/Math.max(1,all.length),bar=px(A,9),marks=all.map((e,i)=>({id:'f'+e.id,x:A.x+i*cw,y:A.bottom-bar,w:Math.max(2,cw-2),h:bar,color:i===c.index?'accent':e.status==='error'?'danger':'ink',level:i<=c.index?.85:.13,delay:i*9,from:{x:A.x,y:A.bottom-bar}}));
 return {marks,baseline:A.bottom,texts:[...head(c,'verify.log',null,`${c.index+1} / ${c.entries.length} received`),...texts,{key:'fwd',text:'forward',x:A.x,y:A.bottom-bar-6,size:px(A,10),color:'muted'}],
  live:[{type:'cursor',x:A.x,y:A.y+size+list.length*lh-size,w:size*.6,h:size}]};
}

function exec(c){
 const A=area(c.box),tool=c.focus?.toolId,request=c.entries.find(e=>e.toolId===tool&&e.kind==='request'),result=c.entries.find(e=>e.toolId===tool&&e.kind==='result');
 const status=request?.status||c.focus?.status,size=px(A,13),out=String(result?.text||'');
 const texts=[...head(c,'tool.exchange',null,(c.focus?.title||'tool')+' · '+(status==='running'?'running':status==='error'?'error':result?'returned':'requested')),
  {key:'cmd',text:'$ '+fit((c.focus?.title||'tool')+' '+(request?.text||''),size,A.w),x:A.x,y:A.y+size,size,color:'accent'}];
 // Payload: the returned text, one cell per character, rising row by row.
 const gridW=Math.floor(A.w*.56),gridTop=A.y+size*2.4,gridH=Math.max(20,A.bottom-px(A,72)-gridTop),count=Math.max(1,D.length(out.replace(/\s+/g,' ')));
 const gap=Math.max(1,px(A,2)),cell=Math.max(px(A,6),Math.min(px(A,26),Math.floor(Math.sqrt(gridW*gridH*.55/count))-gap)),cols=Math.max(8,Math.floor(gridW/(cell+gap))),gridRows=Math.max(2,Math.floor(gridH/(cell+gap)));
 const payload=D.chars(out.replace(/\s+/g,' ')).slice(0,cols*gridRows),marks=[];
 payload.forEach((ch,i)=>{const r=Math.floor(i/cols),k=i%cols,x=A.x+k*(cell+gap),y=gridTop+r*(cell+gap);if(ch.trim())marks.push({id:'p'+i,x,y,w:cell,h:cell,color:status==='error'?'danger':'ink',level:charLevel(ch),delay:r*45+k*4,from:{x,y:A.bottom}});});
 if(!payload.length)texts.push({key:'wait',text:status==='running'?'awaiting stdout …':'no stdout recorded',x:A.x,y:gridTop+size,size,color:'muted'});
 const tx=A.x+gridW+px(A,22),small=px(A,12),lines=out.split('\n').filter(l=>l.trim()),room=Math.max(1,Math.floor((A.bottom-px(A,70)-gridTop)/(small*1.6)));
 lines.slice(0,room).forEach((line,i)=>texts.push({key:'o'+i,text:fit(line,small,A.right-tx),x:tx,y:gridTop+small+i*small*1.6,size:small,color:status==='error'?'danger':'ink',level:.82,delay:500+i*90}));
 const inLen=D.length(request?.text),outLen=D.length(out),peak=Math.max(inLen,outLen,1),bc=px(A,8),slots=Math.floor((A.w-px(A,150))/(bc+2));
 [['stdin',inLen],['stdout',outLen]].forEach(([name,count],r)=>{
  const y=A.bottom-px(A,34)+r*px(A,18),k=count?Math.max(1,Math.round(count/peak*slots)):0,lx=A.x+px(A,64);
  texts.push({key:'b'+name,text:name,x:A.x,y:y+bc,size:px(A,11),color:'muted'},{key:'n'+name,text:'{n} chars',count:{to:count},x:lx+k*(bc+2)+6,y:y+bc,size:px(A,11),color:'ink',delay:300+k*6});
  for(let i=0;i<k;i++)marks.push({id:name+i,x:lx+i*(bc+2),y,w:bc,h:bc+2,color:r?'accent':'ink',level:.75,delay:200+r*150+i*6,from:{x:lx,y}});
 });
 texts.push({key:'st',text:status==='running'?'[ .. ] waiting for return':status==='error'?'[ERR!] returned an error':result?'[ RET ] call returned':'[ -- ] no return recorded',x:A.x,y:A.bottom-px(A,46),size:small,color:status==='error'?'danger':status==='running'?'accent':'ink',delay:300});
 const live=status==='running'?[{type:'ring',x:A.right-px(A,30),y:A.y+size,r:px(A,12)},{type:'sweep',x0:A.x,x1:A.x+cols*(cell+gap),y0:gridTop,y1:gridTop+gridRows*(cell+gap),period:1800}]:[];
 return {marks,texts,live,baseline:A.bottom};
}

function compare(c){
 const A=area(c.box);let list=c.entries.slice(0,c.index+1).filter(e=>e.kind==='compare').slice(-4);
 if(list.length<2)list=[c.entries[c.index-1],c.focus].filter(Boolean);
 const n=list.length,colW=(A.w-px(A,20))/n,per=6,base=A.bottom-px(A,30),need=Math.max(1,...list.map(e=>Math.ceil(D.length(e.text.replace(/\s+/g,''))/per)));
 const cs=Math.max(4,Math.min(px(A,30),Math.floor(colW*.7/per)-2,Math.floor((base-A.y-px(A,60))/need)-2)),marks=[],texts=[];
 list.forEach((e,i)=>{
  const glyphs=D.chars(e.text.replace(/\s+/g,'')),x0=A.x+i*colW+(colW-per*(cs+2))/2,focus=e===c.focus,letter=String.fromCharCode(65+i);
  glyphs.forEach((ch,idx)=>{const col=idx%per,row=Math.floor(idx/per),x=x0+col*(cs+2),y=base-(row+1)*(cs+2);if(y<A.y)return;marks.push({id:e.id+':'+idx,x,y,w:cs,h:cs,color:focus?'accent':'ink',level:charLevel(ch),delay:i*110+row*26+col*6,from:{x,y:base},ref:e.id});});
  const top=base-Math.ceil(glyphs.length/per)*(cs+2);
  texts.push({key:'L'+e.id,text:letter,x:x0,y:Math.max(A.y+px(A,20),top-px(A,10)),size:px(A,22),color:focus?'accent':'ink',weight:700,delay:i*110+300},{key:'S'+e.id,text:fit(e.text,px(A,10),colW-10),x:x0,y:base+px(A,16),size:px(A,10),color:'muted',delay:i*110});
 });
 if(n>=2){const s=D.jaccard(D.bigrams(list[n-2].text),D.bigrams(list[n-1].text));texts.push({key:'sim',text:`sim(${String.fromCharCode(63+n)}, ${String.fromCharCode(64+n)}) = {n}`,count:{to:s,kind:'fixed2'},x:A.right,y:A.y-px(A,16),size:px(A,18),color:'ink',align:'right',delay:600});}
 return {marks,baseline:base,texts:[...head(c,'options / compare',null,`${n} options · ${list.map(e=>D.length(e.text)).join(' / ')} chars`),...texts]};
}

function redline(c){
 const A=area(c.box),revise=c.focus?.kind==='revise',before=revise?c.entries[c.index-1]:c.focus,size=px(A,16),lh=Math.round(size*1.7),cols=Math.max(12,Math.floor(A.w/(size*.6)));
 const old=wrap(before?.text,cols,revise?4:5),fresh=revise?wrap(c.focus.text,cols,5):['↶ reassess / retry'],marks=[],texts=[];
 old.forEach((line,i)=>{
  const y=A.y+size+i*lh,w=Math.min(A.w,span(line)*size*.6);
  texts.push({key:'o'+i,text:line,x:A.x,y,size,color:revise?'ink':'danger',level:.5,delay:i*90});
  for(let x=0;x<w;x+=6)marks.push({id:'s'+i+':'+x,x:A.x+x,y:y-size*.38,w:6,h:Math.max(2,px(A,2)),color:'danger',level:.95,delay:500+i*160+x*1.2,from:{x:A.x,y:y-size*.38}});
 });
 const top=A.y+size+old.length*lh+lh;
 fresh.forEach((line,i)=>texts.push({key:'n'+i,text:line,x:A.x,y:top+i*lh,size,color:'accent',delay:1000+i*140}));
 return {marks,baseline:A.bottom,texts:[...head(c,(revise?'revise':c.focus?.kind==='retry'?'retry':'error')+' @'+String(c.index+1).padStart(2,'0'),null,revise?'redline over the previous segment':'run interrupted / retried'),...texts],
  live:[{type:'cursor',x:A.x+Math.min(A.w-8,span(fresh.at(-1)||'')*size*.6),y:top+(fresh.length-1)*lh-size*.85,w:size*.55,h:size,color:'danger'}]};
}

function code(c){
 const A=area(c.box),body=c.focus?.text.match(/```[^\n]*\n([\s\S]*?)(?:```|$)/)?.[1]??c.focus?.text??'',lines=body.replace(/\s+$/,'').split('\n');
 const size=Math.max(px(A,13),Math.min(px(A,24),Math.floor(A.h/(lines.length+3)/1.5))),lh=Math.round(size*1.5),room=Math.max(2,Math.floor((A.h-6)/lh)),shown=lines.slice(0,room),mapW=px(A,150),cols=Math.max(12,Math.floor((A.w-mapW-size*3)/(size*.6)));
 const texts=[...head(c,'source.code',null,`${lines.length} lines · ${D.length(body)} chars`)],marks=[];
 shown.forEach((line,i)=>{
  texts.push({key:'n'+i,text:String(i+1).padStart(2,'0'),x:A.x,y:A.y+size+i*lh,size:size-2,color:'muted',delay:i*70},{key:'c'+i,text:D.chars(line).slice(0,cols).join('')||' ',x:A.x+size*2.4,y:A.y+size+i*lh,size,color:'ink',delay:i*70+40});
 });
 const bar=Math.max(3,px(A,7));
 lines.slice(0,Math.floor(A.h/(bar+2))).forEach((line,i)=>{const w=Math.min(mapW-8,Math.max(2,span(line.trimEnd())*3*A.s));marks.push({id:'m'+i,x:A.right-mapW,y:A.y+i*(bar+2),w,h:bar,color:'accent',level:.65,delay:i*22,from:{x:A.right-mapW,y:A.bottom}});});
 return {marks,texts,baseline:A.bottom,live:[{type:'cursor',x:A.x+size*2.4+Math.min(cols,span(shown.at(-1)||''))*size*.6,y:A.y+(shown.length-1)*lh+2,w:size*.55,h:size}]};
}

function formula(c){
 const A=area(c.box),m=c.focus?.text.match(/\$\$([\s\S]*?)\$\$|\$([^\n$]+)\$|\\\[([\s\S]*?)\\\]/),expr=(m&&(m[1]||m[2]||m[3])||c.focus?.text||'').trim();
 const size=px(A,26),lines=wrap(expr,Math.max(10,Math.floor(A.w/(size*.6))),3),count=new Map();
 for(const ch of expr)if(/[=+\-*/^_<>≤≥≈≠∑∏∫√πλσμΔ∂∞(){}\[\]|!%]/u.test(ch))count.set(ch,(count.get(ch)||0)+1);
 const list=[...count].sort((a,b)=>b[1]-a[1]).slice(0,16),peak=Math.max(1,...list.map(x=>x[1])),bw=Math.min(px(A,44),Math.floor(A.w/Math.max(6,list.length))),cell=px(A,6),cellsMax=Math.floor(A.h*.4/cell),marks=[],texts=[];
 list.forEach(([ch,n],i)=>{const k=Math.max(1,Math.round(n/peak*cellsMax)),x=A.x+i*bw;for(let r=0;r<k;r++)marks.push({id:'s'+ch+':'+r,x,y:A.bottom-px(A,16)-(r+1)*cell,w:bw-6,h:cell-2,color:'ink',level:.4+.5*n/peak,delay:500+i*40+r*12,from:{x,y:A.bottom-px(A,16)}});texts.push({key:'k'+ch,text:ch,x:x+(bw-6)/2,y:A.bottom,size:px(A,13),color:'accent',align:'center',delay:500+i*40});});
 lines.forEach((line,i)=>texts.push({key:'f'+i,text:line,x:A.x,y:A.y+size+i*size*1.4,size,color:'ink',weight:700,delay:i*160}));
 return {marks,baseline:A.bottom,texts:[...head(c,'formula.extract',null,`${[...count.values()].reduce((a,b)=>a+b,0)} symbols · ${D.length(expr)} chars`),...texts]};
}

function compose(c){
 // The whole answer observed so far, the focus piece last: it grows like a page being written.
 const A=area(c.box),pieces=c.entries.slice(0,c.index+1).filter(e=>e.kind==='answer');
 const total=Math.max(1,pieces.reduce((s,e)=>s+D.length(e.text),0)),side=Math.max(px(A,7),Math.min(px(A,30),Math.floor(Math.sqrt(A.w*A.h*.42/total)))),bw=side,bh=Math.round(side*1.25),gap=Math.max(1,Math.round(side/5)),lh=bh+gap*2,perRow=Math.max(8,Math.floor(A.w/(bw+gap))),rowsMax=Math.max(2,Math.floor(A.h/lh));
 // Ids follow the character, not the slot: when the page reflows, blocks travel.
 const rows=[];let row=[],n=0;
 for(const piece of pieces){const focus=piece===c.focus;for(const ch of piece.text){n++;if(ch==='\n'){if(row.length)rows.push(row);row=[];continue;}row.push({ch,focus,n});if(row.length>=perRow){rows.push(row);row=[];}}if(row.length){rows.push(row);row=[];}}
 const visible=rows.slice(-rowsMax),marks=[];
 visible.forEach((list,r)=>list.forEach((item,k)=>{
  if(!item.ch.trim()||marks.length>=2600)return;
  const x=A.x+k*(bw+gap),y=A.y+r*lh;
  // Large blocks carry their character, small ones are the page's texture.
  marks.push({id:'t'+item.n,shape:bw>=14?'cell':'rect',ch:bw>=14?item.ch:undefined,x,y,w:bw,h:bh,color:item.focus?'accent':'ink',level:charLevel(item.ch),delay:r*55+k*3,from:{x,y:A.bottom}});
 }));
 const last=visible.at(-1)||[],chars=pieces.reduce((s,e)=>s+D.length(e.text),0);
 return {marks,baseline:A.bottom,texts:head(c,'{n} chars',{to:chars},`${rows.length} lines · ${pieces.length} pieces · focus ${D.length(c.focus?.text)} chars`),
  live:[{type:'cursor',x:A.x+last.length*(bw+gap),y:A.y+(visible.length-1)*lh-1,w:bw,h:bh+2}]};
}

function table(c){
 // Answer pieces are split per line, so the table is read from the answer so far.
 const answer=c.entries.slice(0,c.index+1).filter(e=>e.kind==='answer').map(e=>e.text).join('\n');
 const A=area(c.box),rows=D.tableOf(answer).slice(-10),cols=Math.min(6,Math.max(1,...rows.map(r=>r.length))),cw=A.w/cols,rh=Math.max(18,Math.min(px(A,34),Math.floor(A.h/Math.max(1,rows.length)))),size=px(A,13),marks=[],texts=[];
 rows.forEach((cells,r)=>{for(let k=0;k<cols;k++){const x=A.x+k*cw,y=A.y+r*rh,d=(r*cols+k)*60;
  marks.push({id:'c'+r+':'+k,shape:'frame',x,y,w:cw-4,h:rh-4,color:r?'muted':'accent',level:r?.6:.9,delay:d,from:{x,y:y+rh}});
  if(!r)marks.push({id:'h'+k,x,y,w:cw-4,h:rh-4,color:'accent',level:.18,delay:d});
  texts.push({key:'t'+r+':'+k,text:fit(cells[k]||'',size,cw-14),x:x+8,y:y+rh*.62,size,color:r?'ink':'accent',delay:d+80});
 }});
 return {marks,baseline:A.bottom,texts:[...head(c,`table ${rows.length} × ${cols}`,null,'cells extracted from the answer'),...texts]};
}

function idle(c){
 const A=area(c.box),raster=c.box.raster?.('TRACE',Math.floor(Math.min(A.h*.42,A.w*.18)),5),marks=[],size=px(A,13);
 if(raster){const ox=A.x+(A.w-raster.w)/2,oy=A.y+(A.h*.55-raster.h)/2;raster.points.forEach((p,i)=>marks.push({id:'i'+i,shape:'dot',x:ox+p.x,y:oy+p.y,w:2,h:2,color:'muted',level:.6,delay:i*1.5,from:{x:ox+p.x,y:A.bottom}}));}
 const lines=['[ OK ] thought-window attached','[ OK ] public trace channel open','[ .. ] waiting for stdin'];
 return {marks,baseline:A.bottom,texts:[...head(c,'standby',null,'no public events in this turn yet'),...lines.map((t,i)=>({key:'b'+i,text:t,x:A.x,y:A.bottom-size*4+i*size*1.5,size,color:i===2?'accent':'ink',delay:300+i*260}))],
  live:[{type:'cursor',x:A.x+span(lines[2])*size*.6+4,y:A.bottom-size*4+size*3-size*.85,w:size*.55,h:size}]};
}


// --- 0.10: scenes after the reference video, each driven by the reasoning text.

function tokenizer(c){
 // The current sentence cut into word chips, each with its source offset.
 const A=area(c.box),text=c.focus?.text||'',list=D.words(text).slice(0,80),size=px(A,17),small=Math.max(9,px(A,9)),rowH=Math.round(size*2.7),pad=Math.round(size*.45);
 const marks=[],texts=[];let x=A.x,y=A.y+8,row=0;
 const longest=list.reduce((m,w)=>D.length(w.text)>D.length(m?.text||'')?w:m,null);
 for(const [i,w] of list.entries()){
  const wpx=span(w.text)*size*.6+pad*2;
  if(x+wpx>A.right){row++;x=A.x;y+=rowH;}
  if(y+rowH>A.bottom)break;
  const hot=w===longest;
  marks.push({id:'k'+w.index,x,y,w:wpx-4,h:size*1.55,color:hot?'accent':'ink',level:hot?.32:.1,delay:i*45,from:{x,y:A.bottom}});
  marks.push({id:'u'+w.index,x,y:y+size*1.55,w:wpx-4,h:2,color:hot?'accent':'muted',level:.8,delay:i*45+60,from:{x,y:A.bottom}});
  texts.push({key:'t'+w.index,text:w.text,x:x+pad,y:y+size*1.12,size,color:hot?'accent':'ink',delay:i*45+80},{key:'o'+w.index,text:String((c.focus?.spans?.[0]?.start||0)+w.index),x:x+pad,y:y+size*1.55+small*1.3,size:small,color:'muted',delay:i*45+100});
  x+=wpx+6;
 }
 return {marks,baseline:A.bottom,caption:'词块 = 当前片段的分词 · 下方数字为原文字符偏移',texts:[...head(c,'tokenizer',null,`${list.length} words · ${D.length(text)} chars`),...texts]};
}

function agentloop(c){
 // THINK -> PLAN -> ACT -> OBSERVE, lit by what the turn has actually done.
 const A=area(c.box),upto=c.entries.slice(0,c.index+1),k=c.focus?.kind;
 const stage=k==='request'?2:k==='result'?3:['plan','constraint'].includes(k)?1:0;
 const last=kinds=>[...upto].reverse().find(e=>kinds.includes(e.kind));
 const boxes=[['THINK','reason()',last(['analysis','check','compare','search','math','code','revise'])],['PLAN','decompose()',last(['plan','constraint'])],['ACT','execute()',last(['request'])],['OBSERVE','observe()',last(['result'])]];
 const gap=px(A,26),bw=Math.floor((A.w-gap*3)/4),bh=px(A,74),y=A.y+6,marks=[],texts=[],size=px(A,14),small=px(A,10);
 boxes.forEach(([name,fn,entry],i)=>{
  const x=A.x+i*(bw+gap),on=i===stage,done=!!entry;
  marks.push({id:'box'+i,shape:'frame',x,y,w:bw,h:bh,color:on?'accent':done?'ink':'muted',level:on?1:done?.7:.35,delay:i*120,from:{x,y:y+bh}});
  if(on)marks.push({id:'fill'+i,x:x+2,y:y+2,w:bw-4,h:bh-4,color:'accent',level:.16,delay:i*120+80,blink:false,from:{x,y:y+bh}});
  texts.push({key:'n'+i,text:name,x:x+10,y:y+size*1.4,size,color:on?'accent':'ink',weight:700,delay:i*120+120},{key:'f'+i,text:fn,x:x+10,y:y+size*1.4+small*1.8,size:small,color:'muted',delay:i*120+160},
   {key:'e'+i,text:fit(entry?.text||'—',small,bw-20),x:x+10,y:y+bh-small*.9,size:small,color:'ink',level:.75,delay:i*120+220});
  if(i<3)for(let d=0;d<4;d++)marks.push({id:'ar'+i+'_'+d,x:x+bw+gap*(d+1)/5-2,y:y+bh/2-2,w:4,h:4,color:i<stage?'accent':'muted',level:.9,delay:i*120+200+d*40,from:{x:x+bw,y:y+bh/2}});
 });
 // The plan so far, as a tool-call style block.
 const plans=upto.filter(e=>['plan','constraint'].includes(e.kind)).slice(-7),tools=upto.filter(e=>e.kind==='request').slice(-2),top=y+bh+px(A,30),lh=Math.round(size*1.65);
 const lines=[['<steps>','muted'],...plans.map((e,i)=>[`  ${String(i+1).padStart(2,'0')}. ${D.short(e.text,80)}`,e===c.focus?'accent':'ink']),...tools.map(e=>[`  call ${e.title} ${D.short(e.text,50)}`,e===c.focus?'accent':'good']),['</steps>','muted']];
 const shown=lines.slice(0,Math.max(2,Math.min(lines.length,Math.floor((A.h*.5-bh)/lh))));
 shown.forEach(([text,color],i)=>texts.push({key:'l'+i+text.length,text:fit(text,size,A.w),x:A.x,y:top+i*lh,size,color,delay:500+i*110}));
 // Swimlanes: every segment so far, placed in its lane, filled up to the focus.
 const laneOf=e=>e.kind==='request'?2:e.kind==='result'?3:['plan','constraint'].includes(e.kind)?1:0;
 const all=c.entries.filter(e=>!['input','answer'].includes(e.kind)).slice(-48),lt=top+shown.length*lh+px(A,18),lane=Math.max(10,Math.min(px(A,22),Math.floor((A.bottom-lt)/4)-4)),label=px(A,62),cw=Math.max(6,Math.min(px(A,26),Math.floor((A.w-label)/Math.max(8,all.length))));
 ['THINK','PLAN','ACT','OBSERVE'].forEach((name,r)=>texts.push({key:'lane'+r,text:name,x:A.x,y:lt+r*(lane+4)+lane*.75,size:px(A,10),color:r===stage?'accent':'muted',delay:700}));
 all.forEach((e,i)=>{const r=laneOf(e),x=A.x+label+i*cw,yy=lt+r*(lane+4),past=c.entries.indexOf(e)<=c.index;
  marks.push({id:'sw'+e.id,x,y:yy,w:cw-2,h:lane,color:e===c.focus?'accent':r===2||r===3?'good':'ink',level:e===c.focus?1:past?.55:.12,delay:700+i*18,from:{x,y:A.bottom},ref:e.id});});
 return {marks,baseline:A.bottom,caption:'高亮 = 当前片段所处的环节 · 下方为本轮已出现的计划与工具调用',texts:[...head(c,'dsh · agent loop',null,['reasoning','planning','acting','observing'][stage]),...texts]};
}

function diff(c){
 // The previous line struck out, the revised one added, as a unified diff.
 const A=area(c.box),err=['error','retry'].includes(c.focus?.kind),before=err?c.focus:c.entries[c.index-1],after=err?null:c.focus;
 const size=px(A,15),lh=Math.round(size*1.7),cols=Math.max(12,Math.floor((A.w-size*3)/(size*.6))),gut=px(A,6);
 const old=wrap(before?.text,cols,5),fresh=after?wrap(after.text,cols,6):['↶ retry'],marks=[],texts=[];
 texts.push({key:'h1',text:'diff --git a/thought b/thought',x:A.x,y:A.y+size,size,color:'muted'},{key:'h2',text:`@@ -${c.index},${old.length} +${c.index+1},${fresh.length} @@`,x:A.x,y:A.y+size+lh,size,color:'accent',delay:150});
 [...old.map(t=>['-',t]),...fresh.map(t=>['+',t])].forEach(([sign,text],i)=>{
  const y=A.y+size+lh*(i+2),color=sign==='-'?'danger':'good';
  marks.push({id:'g'+i,x:A.x,y:y-size*.95,w:gut,h:lh-3,color,level:.85,delay:300+i*110,from:{x:A.x,y:A.bottom}});
  marks.push({id:'r'+i,x:A.x+gut+2,y:y-size*.95,w:A.w-gut-2,h:lh-3,color,level:.08,delay:300+i*110,from:{x:A.x,y:A.bottom}});
  texts.push({key:'d'+i+sign,text:sign+' '+text,x:A.x+gut+8,y,size,color,delay:360+i*110});
 });
 return {marks,baseline:A.bottom,caption:'红 = 被改写的上一段 · 绿 = 改写后的这一段 · 不判定对错',texts:[...head(c,err?'stderr · retry':'revision.diff',null,`${old.length} − / ${fresh.length} +`),...texts]};
}

function spiral(c){
 // The sentence's characters sampled onto a slowly turning spiral.
 // The current segment winds out from the centre (accent), earlier reasoning continues the arm.
 const A=area(c.box),own=D.chars((c.focus?.text||'').replace(/\s+/g,'')),before=D.chars(c.entries.slice(Math.max(0,c.index-8),c.index).map(e=>e.text).join('').replace(/\s+/g,'')).slice(-(200-Math.min(own.length,200)));
 const chars=[...own.slice(0,200),...before.reverse()].slice(0,200),cx=A.x+A.w*.55,cy=A.y+A.h*.48,rmax=Math.min(A.w*.42,A.h*.5),size=px(A,13),marks=[];
 chars.forEach((ch,i)=>{const u=i/Math.max(1,chars.length-1),a=u*Math.PI*11,r=rmax*(.06+.94*Math.sqrt(u)),x=cx+Math.cos(a)*r-size/2,y=cy+Math.sin(a)*r-size/2,mine=i<own.length;
  marks.push({id:'s'+i,shape:'glyph',ch,group:'spiral',x,y,w:size,h:size,color:mine?'accent':'ink',level:mine?.95:.25+.5*(1-u),delay:i*9,from:{x,y:A.bottom}});});
 const count=new Map();for(const ch of chars)count.set(ch,(count.get(ch)||0)+1);
 const topList=[...count].sort((a,b)=>b[1]-a[1]).slice(0,14),peak=Math.max(1,...topList.map(x=>x[1])),bw=px(A,9),bx=A.x,by=A.bottom-px(A,6);
 topList.forEach(([ch,n],i)=>{const h=Math.max(3,Math.round(n/peak*A.h*.22));marks.push({id:'h'+i,x:bx+i*(bw+3),y:by-h,w:bw,h,color:'accent',level:.7,delay:400+i*30,from:{x:bx+i*(bw+3),y:by}});});
 const share=chars.length?(topList[0]?.[1]||0)/chars.length:0;
 return {marks,baseline:A.bottom,motions:[{group:'spiral',type:'turn',cx:cx,cy:cy,size:rmax}],caption:'螺旋 = 当前片段（高亮）接着之前的推理文字 · 左下柱 = 字频',
  texts:[...head(c,'sampling · spiral',null,`${chars.length} chars · top "${topList[0]?.[0]||''}"`),{key:'pt',text:'p(top) = {n}',count:{to:share,kind:'fixed2'},x:A.x+topList.length*(bw+3)+12,y:by-4,size:px(A,12),color:'ink',delay:600}]};
}

function nexttoken(c){
 // Keyword shares so far (occurrence counts, not model probabilities).
 const A=area(c.box),texts=[],marks=[],upto=c.entries.slice(0,c.index+1),list=D.keywords(upto.map(e=>e.text),7),sum=Math.max(1,list.reduce((s,k)=>s+k.count,0));
 const size=px(A,15),lh=Math.round(size*2.3),labelW=size*7,barW=A.w*.42-labelW,focusText=(c.focus?.text||'').toLowerCase();
 list.forEach((k,i)=>{
  const y=A.y+size+i*lh,share=k.count/sum,n=Math.max(1,Math.round(k.count/list[0].count*barW/8)),hot=focusText.includes(k.word);
  texts.push({key:'w'+k.word,text:k.word,x:A.x,y,size,color:hot?'accent':'ink',delay:i*90},{key:'v'+k.word,text:'{n}',count:{to:share,kind:'fixed2'},x:A.x+labelW+n*8+8,y,size:size-2,color:'muted',delay:i*90+200});
  for(let j=0;j<n;j++)marks.push({id:'b'+k.word+j,x:A.x+labelW+j*8,y:y-size*.8,w:6,h:size*.9,color:hot?'accent':'ink',level:.75,delay:i*90+j*10,from:{x:A.x+labelW,y:y-size*.8}});
 });
 // The output column: the current sentence, word by word, the top word marked.
 const ox=A.x+A.w*.5,ow=A.right-ox,top=list[0]?.word;
 marks.push({id:'outbox',shape:'frame',x:ox,y:A.y,w:ow,h:A.h-4,color:'muted',level:.7,delay:100,from:{x:ox,y:A.bottom}});
 texts.push({key:'outt',text:'output',x:ox+10,y:A.y+size*1.2,size:px(A,11),color:'muted'});
 let x=ox+10,y=A.y+size*2.8;
 for(const [i,w] of D.words(c.focus?.text).slice(0,60).entries()){const wpx=span(w.text)*size*.6+size*.5;if(x+wpx>A.right-8){x=ox+10;y+=size*1.6;}if(y>A.bottom-10)break;const hot=w.text.toLowerCase().includes(top||'\u0000');texts.push({key:'o'+w.index,text:w.text,x,y,size,color:hot?'accent':'ink',level:hot?1:.75,delay:300+i*35});x+=wpx;}
 return {marks,baseline:A.bottom,caption:'条 = 关键词在本轮出现次数的占比，不是模型概率 · 右侧为当前片段',texts:[...head(c,'next_token · share',null,`${list.length} keywords · ${sum} hits`),...texts]};
}

function errorbig(c){
 // Errors take the whole stage: a big red word and the real message below.
 const A=area(c.box),word=c.focus?.kind==='retry'?'RETRY':'ERROR',size=Math.floor(Math.min(A.h*.42,A.w*.8/(word.length*.62))),step=Math.max(4,Math.round(size/22));
 const raster=c.box.raster?.(word,size,step),marks=[];
 if(raster){const ox=A.x+(A.w-raster.w)/2,oy=A.y+px(A,6);raster.points.forEach((p,i)=>marks.push({id:'e'+i,x:ox+p.x,y:oy+p.y,w:step-1,h:step-1,color:'danger',level:.95,delay:Math.abs(p.x-raster.w/2)/2,from:{x:ox+p.x,y:A.bottom}}));}
 const msg=wrap(c.focus?.text||'',Math.floor(A.w/(px(A,13)*.6)),5),small=px(A,13),top=A.y+(raster?raster.h:A.h*.4)+px(A,24);
 const texts=[{key:'x0',text:`Exception in turn ${c.focus?.turn??''}: ${c.focus?.label||''}`,x:A.x,y:top,size:small,color:'danger',delay:300},...msg.map((l,i)=>({key:'x'+(i+1),text:'    at '+l,x:A.x,y:top+(i+1)*small*1.6,size:small,color:'danger',level:.8,delay:400+i*100}))];
 return {marks,baseline:A.bottom,caption:'运行错误 / 重试的原文',texts:[...head(c,'stderr',null,word.toLowerCase()),...texts]};
}

// --- 0.11: scenes drawn from DSH's run records (timing, tools, todos, tokens, files).
const {fmtMs,fmtTok}=require('./run-metrics.cjs');
function empty(c,title,note){
 const A=area(c.box);
 return {marks:[],baseline:A.bottom,caption:'等待 DSH 的运行记录：'+note,texts:[...head(c,title,null,note),{key:'none',text:'[ .. ] '+note,x:A.x,y:A.y+px(A,20),size:px(A,13),color:'muted'}]};
}
function timeline(c){
 // One bar per model step and tool call, its length the recorded wall time.
 const m=c.metrics,spans=(m?.spans||[]).filter(s=>s.start!=null).slice(-14);
 if(!spans.length)return empty(c,'timeline · this turn','no timing recorded yet');
 const A=area(c.box),now=c.now||Date.now(),t0=m.start??spans[0].start,t1=Math.max(t0+1000,...spans.map(s=>s.end??now));
 const label=px(A,150),right=px(A,120),x0=A.x+label,x1=A.right-right,w=Math.max(40,x1-x0),cell=Math.max(4,px(A,6));
 const rh=Math.max(12,Math.min(px(A,26),Math.floor((A.h-px(A,40))/spans.length)-4)),size=px(A,12),marks=[],texts=[];
 const X=t=>x0+(t-t0)/(t1-t0)*w;
 spans.forEach((sp,i)=>{
  const y=A.y+px(A,24)+i*(rh+4),end=sp.end??now,a=X(sp.start),b=Math.max(a+cell,X(end));
  const color=sp.status==='error'?'danger':sp.kind==='tool'?'good':'accent';
  texts.push({key:'n'+sp.id,text:fit((sp.kind==='tool'?'⚙ ':'◆ ')+sp.label,size,label-10),x:A.x,y:y+rh*.72,size,color:sp.end==null?'accent':'ink',delay:i*80});
  for(let x=a,k=0;x<b-1;x+=cell,k++)marks.push({id:'b'+sp.id+'_'+k,x,y,w:Math.min(cell-1,b-x),h:rh,color,level:sp.kind==='llm'?.75:.85,blink:sp.end==null&&x+cell>=b-1,delay:i*80+k*6,from:{x:a,y:y+rh}});
  const extra=sp.kind==='llm'&&sp.tokens!=null?' · '+fmtTok(sp.tokens)+' tok':sp.status==='error'?' · error':'';
  texts.push({key:'d'+sp.id,text:fmtMs(end-sp.start)+extra,x:x1+8,y:y+rh*.72,size:size-1,color:sp.status==='error'?'danger':'muted',delay:i*80+200});
 });
 // Time axis.
 const span=t1-t0,step=[1e3,2e3,5e3,1e4,2e4,3e4,6e4,12e4,3e5].find(s=>span/s<=8)||6e5;
 for(let t=0,k=0;t<=span;t+=step,k++){marks.push({id:'ax'+k,x:X(t0+t),y:A.y+px(A,8),w:1,h:px(A,8),color:'muted',level:.8,delay:k*20,from:{x:X(t0+t),y:A.y+px(A,16)}});texts.push({key:'at'+k,text:fmtMs(t),x:X(t0+t)+3,y:A.y+px(A,14),size:px(A,9),color:'muted'});}
 const live=m.running?[{type:'sweep',x0:X(now)-1,x1:X(now),y0:A.y+px(A,20),y1:A.y+px(A,24)+spans.length*(rh+4),period:1000}]:[];
 return {marks,live,baseline:A.bottom,caption:'条长 = DSH 记录的真实耗时 · ◆ 模型步骤 · ⚙ 工具调用 · 红 = 出错',
  texts:[...head(c,'timeline · this turn',null,`${fmtMs(m.elapsedMs)} · ${m.steps} steps · ${m.tools} tools`+(m.toolErrors?` · ${m.toolErrors} failed`:'')),...texts]};
}
function todos(c){
 // The model's own todo list (DSH todos projection) as a progress board.
 const list=c.metrics?.todos||[];
 if(!list.length)return empty(c,'todos','no todo list in this session');
 const A=area(c.box),size=px(A,15),lh=Math.round(size*1.9),done=list.filter(t=>t.status==='completed').length,marks=[],texts=[];
 list.slice(0,Math.floor((A.h-px(A,60))/lh)).forEach((t,i)=>{
  const y=A.y+size+i*lh,box=t.status==='completed'?'[x]':t.status==='in_progress'?'[~]':'[ ]',color=t.status==='completed'?'good':t.status==='in_progress'?'accent':'ink';
  texts.push({key:'b'+i,text:box,x:A.x,y,size,color,delay:i*90},{key:'t'+i+t.content.length,text:fit(t.content,size,A.w-size*3),x:A.x+size*2.4,y,size,color,level:t.status==='completed'?.6:1,delay:i*90+60});
  if(t.status==='completed')marks.push({id:'s'+i,x:A.x+size*2.4,y:y-size*.35,w:Math.min(A.w-size*3,D.length(t.content)*size*.9),h:1.5,color:'good',level:.6,delay:i*90+300,from:{x:A.x+size*2.4,y:y-size*.35}});
  if(t.status==='in_progress')marks.push({id:'c'+i,x:A.x-px(A,10),y:y-size*.8,w:px(A,5),h:size,color:'accent',level:1,blink:true,delay:i*90,from:{x:A.x,y:A.bottom}});
 });
 const n=list.length,cw=Math.min(px(A,40),Math.floor(A.w/n)),by=A.bottom-px(A,14);
 list.forEach((t,i)=>marks.push({id:'p'+i,x:A.x+i*cw,y:by,w:cw-3,h:px(A,12),color:t.status==='completed'?'good':t.status==='in_progress'?'accent':'muted',level:t.status==='pending'?.25:.9,delay:400+i*40,from:{x:A.x,y:by}}));
 return {marks,baseline:A.bottom,caption:'清单来自模型调用的待办工具（DSH todos 投影）',texts:[...head(c,'{n} / '+n+' todos done',{to:done},list.find(t=>t.status==='in_progress')?.content?'now: '+list.find(t=>t.status==='in_progress').content:''),...texts]};
}
function tokens(c){
 // Context occupancy and the session's token buckets, as DSH accounts them.
 const m=c.metrics;
 if(!m?.context&&!m?.usage)return empty(c,'context · tokens','no token accounting served by this DSH');
 const A=area(c.box),size=px(A,13),marks=[],texts=[];let y=A.y+px(A,10);
 if(m.context){
  const cells=60,cw=Math.floor(A.w/cells),filled=Math.round(m.context.share*cells),h=px(A,26);
  texts.push({key:'ctx',text:`context  ${fmtTok(m.context.used)} / ${fmtTok(m.context.window)}`,x:A.x,y,size,color:'ink'});
  for(let i=0;i<cells;i++)marks.push({id:'cx'+i,x:A.x+i*cw,y:y+px(A,10),w:cw-2,h,color:m.context.share>.8&&i<filled?'danger':'accent',level:i<filled?.85:.12,delay:i*12,from:{x:A.x,y:y+px(A,10)+h}});
  texts.push({key:'cxp',text:'{n}',count:{to:m.context.share*100,kind:'pct'},x:A.right,y:y+px(A,10)+h+size*1.4,size:px(A,20),color:'accent',align:'right',weight:700,delay:500});
  y+=h+px(A,70);
 }
 if(m.usage){
  const rows=[['uncached input',m.usage.uncached,'ink'],['cache read',m.usage.cacheRead,'good'],['cache write',m.usage.cacheWrite,'muted'],['output',m.usage.output,'accent']].filter(r=>r[1]>0||r[0]==='cache read');
  const peak=Math.max(1,...rows.map(r=>r[1])),label=px(A,130),barW=A.w-label-px(A,90),lh=Math.round(size*2.1);
  rows.forEach(([name,v,color],i)=>{const yy=y+i*lh,n=Math.max(1,Math.round(v/peak*barW/8));
   texts.push({key:'u'+name,text:name,x:A.x,y:yy+size*.9,size,color:'ink',level:.85,delay:i*100},{key:'v'+name,text:fmtTok(v),x:A.x+label+n*8+8,y:yy+size*.9,size,color:'muted',delay:i*100+200});
   for(let j=0;j<n;j++)marks.push({id:'ub'+name+j,x:A.x+label+j*8,y:yy,w:6,h:size,color,level:.8,delay:i*100+j*5,from:{x:A.x+label,y:yy}});});
  if(m.usage.cacheHit!=null)texts.push({key:'hit',text:'cache hit {n}',count:{to:m.usage.cacheHit*100,kind:'pct'},x:A.x,y:y+rows.length*lh+size*1.2,size:px(A,16),color:'good',weight:700,delay:600});
 }
 const turn=[m.outputTokens!=null?`this turn ${fmtTok(m.outputTokens)} out`:null,m.tokensPerSecond?`${Math.round(m.tokensPerSecond)} tok/s`:null,m.ttftMs!=null?`first token ${fmtMs(m.ttftMs)}`:null].filter(Boolean).join(' · ');
 return {marks,baseline:A.bottom,caption:'上下文 = DSH contextPressure · 用量 = 会话累计 tokenUsage · 速度 = 本轮解码 token / 解码耗时',texts:[...head(c,'context · tokens',null,turn||'session totals'),...texts]};
}
function files(c){
 // Files this turn wrote, changed or delivered, grouped by directory.
 const list=(c.work?.files||[]).slice(-24);
 if(!list.length)return empty(c,'files','no file written in this turn');
 const A=area(c.box),size=px(A,13),lh=Math.round(size*1.85),groups=new Map(),marks=[],texts=[];
 for(const f of list){const dir=f.path.includes('/')?f.path.slice(0,f.path.lastIndexOf('/')):'.';if(!groups.has(dir))groups.set(dir,[]);groups.get(dir).push(f);}
 let row=0;const maxRows=Math.floor((A.h-px(A,10))/lh),peak=Math.max(1,...list.map(f=>f.changes||0));
 for(const [dir,items] of groups){
  if(row>=maxRows)break;
  texts.push({key:'g'+dir,text:'▸ '+fit(dir,size,A.w*.6)+'/',x:A.x,y:A.y+size+row*lh,size,color:'muted',delay:row*70});row++;
  for(const f of items){
   if(row>=maxRows)break;
   const y=A.y+size+row*lh,color=f.status==='error'?'danger':f.declared?'accent':'ink',n=f.changes?Math.max(1,Math.round(f.changes/peak*12)):1;
   texts.push({key:'f'+f.path,text:'  '+(f.action==='write'?'+ ':'~ ')+f.name,x:A.x+px(A,14),y,size,color,delay:row*70+40});
   for(let j=0;j<n;j++)marks.push({id:'c'+f.path+j,x:A.x+A.w*.55+j*px(A,10),y:y-size*.8,w:px(A,8),h:size*.9,color:f.status==='error'?'danger':'good',level:.8,delay:row*70+j*20,from:{x:A.x+A.w*.55,y:y}});
   texts.push({key:'s'+f.path,text:(f.changes?f.changes+' edits':'')+(f.declared?' · delivered':'')+(f.status==='error'?' · failed':''),x:A.x+A.w*.55+n*px(A,10)+8,y,size:size-1,color:'muted',delay:row*70+200});
   row++;
  }
 }
 return {marks,baseline:A.bottom,caption:'+ 新建 · ~ 修改 · 格数 = 确认的修改次数 · 来自工具记录与 DSH 交付索引',texts:[...head(c,`${list.length} file${list.length>1?'s':''}`,null,`${groups.size} folder${groups.size>1?'s':''} · ${list.filter(f=>f.declared).length} delivered`),...texts]};
}

// --- 0.12: keyword scenes. All three read the turn's public text up to the
// step being read: which words recur, where they first appear, and which
// appear together. Positions are hash projections, not semantic embeddings.
const occurrences=(text,word)=>{const t=String(text||'').toLowerCase(),w=word.toLowerCase();let n=0,i=0;while((i=t.indexOf(w,i))>=0){n++;i+=w.length;}return n;};
function keywordData(c,limit){
 const upto=c.entries.slice(0,c.index+1).filter(e=>e.kind!=='input'||c.entries.length<2);
 const all=upto.map(e=>e.text).join('\n'),kws=D.keywords(upto.map(e=>e.text),limit);
 const focus=new Set(D.keywords([c.focus?.text||''],20).map(k=>k.word));
 return {upto,all,kws,focus};
}
function radar(c){
 // Keywords as blips: distance from the centre = where the word first
 // appears in the turn (centre = early), size = how often it recurs.
 const {all,kws,focus}=keywordData(c,14),A=area(c.box);
 if(!kws.length)return empty(c,'keyword radar','no recurring words yet');
 const R=Math.min(A.w*.3,(A.bottom-A.y)*.46),cx=A.x+R+px(A,12),cy=A.y+(A.bottom-A.y)/2,marks=[],texts=[],dot=Math.max(2,px(A,2)),total=Math.max(1,D.length(all));
 for(let k=1;k<=4;k++){const r=R*k/4,n=Math.round(18+k*10);for(let i=0;i<n;i++){const a=i/n*Math.PI*2;marks.push({id:'ring'+k+'_'+i,x:cx+Math.cos(a)*r,y:cy+Math.sin(a)*r,w:dot,h:dot,color:'muted',level:.35,delay:k*80+i*4,from:{x:cx,y:A.bottom}});}}
 for(let i=-10;i<=10;i++){if(!i)continue;marks.push({id:'hx'+i,x:cx+i*R/10,y:cy,w:dot,h:dot,color:'line',level:.6,delay:300,from:{x:cx,y:A.bottom}},{id:'vy'+i,x:cx,y:cy+i*R/10,w:dot,h:dot,color:'line',level:.6,delay:300,from:{x:cx,y:A.bottom}});}
 const peak=Math.max(...kws.map(k=>k.count)),size=px(A,12);
 kws.forEach((k,i)=>{
  const first=Math.max(0,all.toLowerCase().indexOf(k.word)),r=R*(.12+.86*first/total),a=(D.hash(k.word)%360)*Math.PI/180,x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r,s=Math.max(4,px(A,5+9*k.count/peak)),hot=focus.has(k.word);
  marks.push({id:'b'+k.word,x:x-s/2,y:y-s/2,w:s,h:s,color:hot?'accent':'good',level:hot?1:.75,blink:hot,delay:500+i*70,from:{x:x-s/2,y:A.bottom}});
  texts.push({key:'bl'+k.word,text:k.word,x:x+s,y:y+size*.35,size,color:hot?'accent':'ink',level:hot?1:.7,delay:560+i*70});
 });
 // The register on the right: word, count, first offset.
 const lx=cx+R+px(A,36),lh=Math.round(size*1.7);
 kws.slice(0,Math.floor((A.bottom-A.y)/lh)).forEach((k,i)=>texts.push({key:'l'+k.word,text:fit(`${k.word.padEnd(8)} ×${k.count}  @${all.toLowerCase().indexOf(k.word)}`,size,A.right-lx),x:lx,y:A.y+size+i*lh,size,color:focus.has(k.word)?'accent':'ink',level:.85,delay:700+i*60}));
 return {marks,live:[{type:'radar',x:cx,y:cy,r:R,period:3600,color:'accent'}],baseline:A.bottom,caption:'距中心 = 词第一次出现的位置（越近越早）· 点大小 = 出现次数 · 高亮 = 当前片段里的词',
  texts:[...head(c,'keyword radar',null,`${kws.length} recurring words · ${D.length(all)} chars scanned`),...texts]};
}
function heatmap(c){
 // Rows: the turn's most frequent words. Columns: its steps so far.
 // A cell lights up by how often that word occurs in that step.
 const {upto,kws}=keywordData(c,8),A=area(c.box);
 const cols=upto.slice(-24);
 if(kws.length<2||cols.length<2)return empty(c,'word × step heatmap','needs two steps with recurring words');
 const size=px(A,12),label=px(A,110),cw=Math.max(8,Math.min(px(A,64),Math.floor((A.w-label)/cols.length))),ch=Math.max(8,Math.min(px(A,30),Math.floor((A.bottom-A.y-px(A,40))/kws.length))),marks=[],texts=[];
 const grid=kws.map(k=>cols.map(e=>occurrences(e.text,k.word))),peak=Math.max(1,...grid.flat());
 kws.forEach((k,r)=>{
  const y=A.y+r*ch;
  texts.push({key:'w'+k.word,text:fit(k.word,size,label-10),x:A.x,y:y+ch*.65,size,color:'ink',delay:r*60});
  cols.forEach((e,j)=>{const n=grid[r][j],x=A.x+label+j*cw,hot=e===c.focus;
   marks.push({id:'c'+r+'_'+j,x,y,w:cw-2,h:ch-2,color:hot?'accent':'good',level:n?.2+.75*n/peak:.05,delay:r*60+j*14,from:{x,y:A.bottom},ref:e.id});
   if(n&&ch>=size*1.3&&cw>=size*1.3)texts.push({key:'n'+r+'_'+j,text:String(n),x:x+cw/2-1,y:y+ch*.65,size:size-2,color:n/peak>.55?'paper':'ink',align:'center',delay:400+r*60+j*14});});
 });
 const fi=cols.indexOf(c.focus);
 if(fi>=0){const x=A.x+label+fi*cw;marks.push({id:'focus',shape:'frame',x:x-2,y:A.y-2,w:cw+2,h:kws.length*ch+2,color:'accent',level:1,delay:500,from:{x,y:A.bottom}});}
 cols.forEach((e,j)=>{if(j%Math.ceil(cols.length/12)===0)texts.push({key:'s'+j,text:'#'+String(c.entries.indexOf(e)+1).padStart(2,'0'),x:A.x+label+j*cw,y:A.y+kws.length*ch+size*1.4,size:size-2,color:e===c.focus?'accent':'muted',delay:600});});
 return {marks,baseline:A.bottom,caption:'行 = 本轮高频词 · 列 = 已读到的步骤 · 格亮度 = 该词在该步出现的次数 · 框 = 当前步骤',
  texts:[...head(c,'word × step',null,`${kws.length} words × ${cols.length} steps`),...texts]};
}
function constellation(c){
 // Words as stars (placed by a fixed hash projection); a line joins two
 // words that appear in the same step. Bright = in the current step.
 const {upto,kws,focus}=keywordData(c,16),A=area(c.box);
 if(kws.length<3)return empty(c,'word constellation','needs three recurring words');
 const pts=D.project(kws.map(k=>k.word)),size=px(A,12),marks=[],texts=[],dot=Math.max(2,px(A,2));
 const P=kws.map((k,i)=>({k,x:A.x+px(A,30)+pts[i][0]*(A.w-px(A,140)),y:A.y+px(A,16)+pts[i][1]*(A.bottom-A.y-px(A,40))}));
 const edges=new Map();
 for(const e of upto){const inside=P.filter(p=>occurrences(e.text,p.k.word));for(let i=0;i<inside.length;i++)for(let j=i+1;j<inside.length;j++){const key=inside[i].k.word+'|'+inside[j].k.word;edges.set(key,(edges.get(key)||0)+1);}}
 const peakE=Math.max(1,...edges.values());
 [...edges].sort((a,b)=>b[1]-a[1]).slice(0,40).forEach(([key,n],ei)=>{
  const [a,b]=key.split('|').map(w=>P.find(p=>p.k.word===w)),len=Math.hypot(b.x-a.x,b.y-a.y),steps=Math.max(3,Math.floor(len/(dot*4))),hot=focus.has(a.k.word)&&focus.has(b.k.word);
  for(let s=1;s<steps;s++){const u=s/steps;marks.push({id:'e'+ei+'_'+s,x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u,w:dot,h:dot,color:hot?'accent':'line',level:hot?.9:.25+.5*n/peakE,delay:300+ei*20+s*6,from:{x:a.x,y:A.bottom}});}
 });
 const peak=Math.max(...kws.map(k=>k.count));
 P.forEach((p,i)=>{const hot=focus.has(p.k.word),s=Math.max(4,px(A,4+8*p.k.count/peak));
  marks.push({id:'star'+p.k.word,x:p.x-s/2,y:p.y-s/2,w:s,h:s,color:hot?'accent':'ink',level:hot?1:.8,blink:hot,delay:i*50,from:{x:p.x-s/2,y:A.bottom}});
  texts.push({key:'sl'+p.k.word,text:p.k.word+(p.k.count>1?' ×'+p.k.count:''),x:p.x+s,y:p.y-s*.6,size,color:hot?'accent':'ink',level:hot?1:.75,delay:200+i*50});});
 return {marks,baseline:A.bottom,caption:'星 = 高频词（位置为固定哈希投影，非语义）· 连线 = 两词出现在同一步骤 · 亮 = 当前片段里的词',
  texts:[...head(c,'word constellation',null,`${kws.length} words · ${edges.size} pairings`),...texts]};
}

function outline(c){
 // Goal -> constraints -> options (chosen lit) -> decision -> risks, as a flow.
 const o=c.outline;
 if(!o)return empty(c,'thought / outline',c.outlineNote||'outline not ready');
 const A=area(c.box);
 // Laid out at full size first; shrunk step by step until the risks fit too.
 let laid;for(const k of [1,.88,.76,.66]){laid=layOutline(o,A,k);if(laid.end<=A.bottom)break;}
 const sub=[c.outlineModel,c.outlineTokens?c.outlineTokens+' tok':null].filter(Boolean).join(' · ');
 return {marks:laid.marks,baseline:A.bottom,caption:CAPTIONS.outline,texts:[...head(c,'thought / outline',null,sub||null),...laid.texts]};
}
function layOutline(o,A,k){
 const size=Math.max(10,Math.round(px(A,13)*k)),small=Math.max(9,Math.round(px(A,11)*k)),gap=Math.round(px(A,20)*k),pad=Math.round(px(A,10)*k),marks=[],texts=[];
 const cols=w=>Math.max(6,Math.floor((w-pad*2)/(size*.6)));
 let y=A.y,step=0;
 const arrow=(x,from,to,color,id)=>{for(let d=0,n=3;d<n;d++)marks.push({id:'ar'+id+d,x:x-2,y:from+(to-from)*(d+1)/(n+1)-2,w:4,h:4,color,level:.9,delay:step*160+d*50,from:{x:x-2,y:from}});};
 const box=(id,x,w,lines,{color='ink',label,fill=false,lead=0}={})=>{
  const h=pad*2+lines.length*Math.round(size*1.55)+(label?small*1.6:0);
  marks.push({id:'bx'+id,shape:'frame',x,y,w,h,color,level:fill?1:.75,delay:step*160,from:{x,y:y+h}});
  if(fill)marks.push({id:'bf'+id,x:x+2,y:y+2,w:w-4,h:h-4,color,level:.14,delay:step*160+60,from:{x,y:y+h}});
  let ty=y+pad;
  if(label){texts.push({key:'bl'+id,text:label,x:x+pad,y:ty+small,size:small,color:fill?color:'muted',weight:700,delay:step*160+80});ty+=small*1.6;}
  lines.forEach((line,i)=>texts.push({key:'bt'+id+i+line.length,text:line,x:x+pad,y:ty+size*(1.1+i*1.55),size,color:i<lead?color:'ink',weight:i<lead?700:400,delay:step*160+120+i*60}));
  return h;
 };
 const mid=A.x+A.w/2;
 // Goal.
 if(o.goal){const h=box('goal',A.x,A.w,wrap(o.goal,cols(A.w),2),{label:'GOAL',color:'accent'});arrow(mid,y+h,y+h+gap,'muted','g');y+=h+gap;step++;}
 // Constraints as a row of chips.
 if(o.constraints.length){
  const n=o.constraints.length,cw=Math.floor((A.w-(n-1)*px(A,8))/n);let tall=0;
  o.constraints.forEach((t,i)=>{tall=Math.max(tall,box('c'+i,A.x+i*(cw+px(A,8)),cw,wrap('◇ '+t,cols(cw),2),{label:i?null:'CONSTRAINTS'}));});
  // Chips without a label line up with the labelled first one.
  arrow(mid,y+tall,y+tall+gap,'muted','c');y+=tall+gap;step++;
 }
 // Options side by side; the chosen one is lit and points to the decision.
 let chosenX=mid;
 if(o.options.length){
  const n=o.options.length,ow=Math.floor((A.w-(n-1)*px(A,12))/n);let tall=0;
  o.options.forEach((opt,i)=>{
   const x=A.x+i*(ow+px(A,12)),lines=[fit(opt.name,size,ow-pad*2),...(opt.for?wrap('+ '+opt.for,cols(ow),2):[]),...(opt.against?wrap('− '+opt.against,cols(ow),2):[])];
   tall=Math.max(tall,box('o'+i,x,ow,lines,{label:opt.chosen?'OPTION ✓':'OPTION '+String.fromCharCode(65+i),color:opt.chosen?'accent':'ink',fill:opt.chosen,lead:1}));
   if(opt.chosen)chosenX=x+ow/2;
  });
  arrow(chosenX,y+tall,y+tall+gap,'accent','o');y+=tall+gap;step++;
 }
 // Decision.
 if(o.decision){const h=box('d',A.x,A.w,wrap(o.decision,cols(A.w),3),{label:'DECISION',color:'accent',fill:true});y+=h+px(A,14);step++;}
 // Risks and open questions.
 o.risks.forEach((r,i)=>{texts.push({key:'r'+i+r.length,text:fit('! '+r,size,A.w),x:A.x,y:y+size,size,color:'danger',level:.9,delay:step*160+i*90});y+=Math.round(size*1.7);});
 return {marks,texts,end:y};
}
const BUILDERS={idle,glyph,bars,curve,cloud,mask,grid,compare,boot,exec,redline,code,formula,compose,table,tokenizer,agentloop,diff,spiral,nexttoken,errorbig,timeline,todos,tokens,files,outline,radar,heatmap,constellation};
function buildFigure(id,context){
 const make=BUILDERS[id]||bars,spec=make(context);
 return {figure:id,title:TITLES[id]||id,caption:CAPTIONS[id]||'',marks:[],texts:[],live:[],...spec};
}
module.exports={buildFigure,TITLES,CAPTIONS,wrap,area,fit,span,FIGURES:Object.keys(BUILDERS)};
