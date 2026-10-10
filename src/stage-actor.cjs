'use strict';
// Actor layer: the director's character on stage. Pure builders, like the
// figures. The canvas is split into zones that never overlap: a heading band,
// the stage (actor, props, lights, or actor + terminal) and a log band of the
// turn's real events. Sprite cells are particles: a new actor assembles from
// the floor, a changed one morphs out of the old, pose frames swap in place.
const D=require('./stage-data.cjs');
const {turnNodes}=require('./scenes.cjs');
const {area,wrap,fit,span}=require('./stage-figures.cjs');

// Built-in actor when no script exists (director off, history, or failure).
const WHALE={name:'小鲸鱼',sprite:{palette:{o:'#1f2f7a',b:'#4d6bfe',l:'#c7d3ff',w:'#ffffff',k:'#0b1020',p:'#ff9db5'},rows:[
 '...................oo.','..................obbo','...ooooooooo.....obbo.','..obbbbbbbbboo..obbo..','.obbbbbbbbbbbbo.obbo..','obbwwbbbbbbbbbboobbo..',
 'obbwkbbbbbbbbbbbbbo...','obpbbbbbbbbbbbbbbbo...','ollllllbbbbbbbbbbo....','.ollllllllllbbbbo.....','..oollllllllllo.......','....oooooooooo........'],
 frames:[[
 '..................oo..','.................obbo.','...ooooooooo.....obbo.','..obbbbbbbbboo...obbo.','.obbbbbbbbbbbbo..obbo.','obbwwbbbbbbbbbbooobbo.',
 'obbwkbbbbbbbbbbbbbbo..','obpbbbbbbbbbbbbbbbo...','ollllllbbbbbbbbbbo....','.ollllllllllbbbbo.....','..oollllllllllo.......','....oooooooooo........']]}};
const EFFECT_GLYPHS={notes:{glyphs:['♪','♫'],color:'accent'},hearts:{glyphs:['♥'],color:'#ff6f91'},sparkles:{glyphs:['✦','✧','+'],color:'#ffe08a'},stars:{glyphs:['★','☆'],color:'#ffe08a'},zzz:{glyphs:['z','Z'],color:'muted'},question:{glyphs:['?'],color:'accent',count:3},exclaim:{glyphs:['!'],color:'danger',count:3}};
const SHELL=/bash|pwsh|powershell|shell|exec|run|python|node|cmd|terminal|command/i;
const LIGHTS=['dance','happy','spin','jump','grow'];
// Frame tempo per action (ms) for pose frames and flowing glyph text.
const TEMPO={dance:260,walk:220,jump:360,happy:300,wave:260,type:170,spin:300,shake:120,explode:500,surprised:400,idle:900,think:650,sleep:1100,sad:900,nod:380,grow:420};

// Live phase of the turn (not the reading position): the actor reacts to now.
function phaseOf(graph){
 const nodes=turnNodes(graph);
 if(!nodes.length)return 'idle';
 if(!graph.running)return 'done';
 if(nodes.some(n=>n.kind==='tool'&&n.status==='running'))return 'tool';
 return nodes.at(-1).kind==='answer'?'answer':'think';
}
function blocks(nodes){
 const out=[];
 for(const n of nodes){
  const key=/^a:/.test(n.id)&&n.kind!=='answer'?n.id.replace(/:\d+$/,''):n.id;
  if(out.at(-1)?.key===key)out.at(-1).text+=n.source;else out.push({key,text:n.source,kind:n.kind});
 }
 return out;
}
function args(text){
 try{const value=JSON.parse(text);for(const k of ['command','cmd','script','code','input'])if(typeof value?.[k]==='string')return value[k];}catch{}
 return String(text||'').trim();
}
// What the terminal shows: the latest code block in the turn (the real code,
// still streaming if unfinished), else a shell tool's command and output,
// else the director's prompt line while code is awaited.
function terminalOf(graph,script){
 const nodes=turnNodes(graph);
 const code=blocks(nodes.filter(n=>n.kind!=='tool'&&n.kind!=='input')).reverse().find(b=>/```/.test(b.text));
 if(code){
  const all=[...code.text.matchAll(/```([\w+#.-]*)[^\n]*\n([\s\S]*?)(?:```|$)/g)],last=all.at(-1);
  if(last)return {kind:'code',lang:last[1]||'code',title:script?.terminal?.title||(last[1]||'code')+' — editor',lines:last[2].replace(/\s+$/,'').split('\n'),open:!last[0].endsWith('```')};
 }
 const tool=[...nodes].reverse().find(n=>n.kind==='tool'&&SHELL.test(n.title));
 if(tool){
  const [request,result='']=String(tool.source).replace(/^参数\n/,'').split('\n\n返回\n');
  return {kind:'shell',title:tool.title,lines:['$ '+D.short(args(request),200),...result.split('\n').filter(l=>l.trim()).slice(0,200)],open:tool.status==='running'};
 }
 if(script?.scene==='terminal')return {kind:'prompt',title:script.terminal?.title||'terminal',lines:['$ '+(script.terminal?.command||'')],open:true};
 return null;
}
// The log band: the turn's real events, newest last, in the reference's
// "[ OK ] checkpoint ..." voice. The director's own call is listed too.
function logOf(graph,director){
 const lines=[];
 const add=(state,kind,text,id)=>lines.push({id,text:`[${state}] ${kind.padEnd(6)} ${D.short(text,120)}`,state});
 for(const n of turnNodes(graph)){
  const state=n.status==='running'?' .. ':n.status==='error'||n.kind==='error'?'ERR!':' OK ';
  if(n.kind==='input')add(' IN ','stdin',n.source,n.id);
  else if(n.kind==='tool')add(state,'call',n.title+' '+(n.excerpt||''),n.id);
  else if(n.kind==='answer')add(state,'output',n.source,n.id);
  else if(n.kind==='error'||n.kind==='retry')add('ERR!',n.kind,n.source,n.id);
  else add(state,'think',n.source,n.id);
 }
 if(director?.status==='pending')lines.push({id:'dir',text:'[ .. ] direct reading your message',state:' .. '});
 else if(director?.status==='ready'&&director.script){const b=director.script.beats?.done;lines.push({id:'dir',text:`[ OK ] direct ${director.actor?.name||''} · ${(b?.actions||[b?.action]).join(' → ')}()`+(director.tokens?` · ${director.tokens} tok`:''),state:' OK '});}
 else if(director?.status==='error')lines.push({id:'dir',text:'[ERR!] direct '+D.short(director.error,80),state:'ERR!'});
 return lines;
}
// Characters that fill the actor while it thinks: the live public text.
function fillOf(graph,phase,name){
 const nodes=turnNodes(graph),pick=phase==='answer'?nodes.findLast(n=>n.kind==='answer'):nodes.findLast(n=>!['input','tool','answer'].includes(n.kind));
 const text=String(pick?.source||'').replace(/[\s\p{P}\p{S}]+/gu,'');
 return text.length>=6?text.slice(-400):String(name||'deepseek').replace(/\s+/g,'').repeat(8)||'deepseek';
}
function codeLine(line,size,widthPx){
 const cols=Math.max(4,Math.floor(widthPx/(size*.6)));let used=0,out='';
 for(const ch of String(line).replace(/\t/g,'    ').replace(/\s+$/,'')){used+=span(ch);if(used>cols)return out.slice(0,-1)+'…';out+=ch;}
 return out;
}
// The answer as it is written, Markdown marks removed; code goes to the terminal.
function answerOf(graph){
 const nodes=turnNodes(graph).filter(n=>n.kind==='answer');
 if(!nodes.length)return null;
 const raw=nodes.map(n=>n.source).join('\n');
 // Tables lose their separator row and read as columns.
 const row=l=>/^\s*\|.*\|\s*$/.test(l)?l.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim()).join('  │  '):l;
 const text=raw.replace(/```[\s\S]*?(```|$)/g,'[code → terminal]').split('\n').filter(l=>!/^\s*\|?(\s*:?-{3,}:?\s*\|)+\s*:?-*:?\s*$/.test(l)).map(row).map(l=>l.replace(/^\s*#{1,6}\s*/,'').replace(/\*\*|__|`/g,'').replace(/^\s*[-*]\s+/,'· ')).join('\n').replace(/\n{3,}/g,'\n\n').trim();
 return text?{kind:'answer',title:'stdout · answer · '+D.length(text)+' chars',text,open:!!graph.running}:null;
}
const LABEL={idle:'standby',think:'thinking',tool:'running tool',answer:'answering',done:'done'};
// Pose frames: the model's, when they differ visibly from the base; otherwise
// derived ones (lean left, lean right, squash), so every actor animates.
const differs=(a,b)=>{let n=0,all=0;a.forEach((row,y)=>{for(let x=0;x<row.length;x++){all++;if(row[x]!==(b[y]?.[x]??'.'))n++;}});return n>=Math.max(3,all*.03);};
function derived(rows){
 const h=rows.length,cut=Math.floor(h*.55),shift=(row,d)=>d>0?'.'+row.slice(0,-1):row.slice(1)+'.';
 const lean=d=>rows.map((r,y)=>y<cut?shift(r,d):r);
 const squash=['.'.repeat(rows[0].length),...rows.slice(0,Math.floor(h/2)),...rows.slice(Math.floor(h/2)+1)];
 return [lean(-1),lean(1),squash];
}
function framesOf(sprite){
 const own=(sprite.frames||[]).map(f=>Array.isArray(f)?f:f?.rows).filter(f=>f&&differs(sprite.rows,f));
 return [sprite.rows,...(own.length>=2?own:[...own,...derived(sprite.rows)].slice(0,3))];
}

function spritePixels(marks,{sprite,frame=0,x0,y0,px,group,idPrefix,style='pixel',fill='',born,delayScale=1,pop=false}){
 const sets=framesOf(sprite),rows=sets[frame%sets.length],gap=px>=7?1:0,chars=[...fill];let k=0;
 rows.forEach((row,y)=>[...row].forEach((ch,x)=>{
  const color=sprite.palette[ch];if(!color)return;
  const mark={id:idPrefix+x+'_'+y,group,x:x0+x*px,y:y0+y*px,w:px-gap,h:px-gap,color,level:1,delay:((rows.length-y)*32+Math.abs(x-row.length/2)*5)*delayScale,from:born?born(x0+x*px,y0+y*px):undefined,pop};
  if(style==='glyph'&&chars.length){mark.shape='glyph';mark.ch=chars[(k+frame*row.length)%chars.length];}
  k++;marks.push(mark);
 }));
}
function buildActorScene({box,actor,beat,act,phase,terminal,output,mood,effects=[],props=[],pending=false,frame=0,style='pixel',fill='',log=[],swap=false}){
 const A=area(box),s=A.s,sprite=actor?.sprite||WHALE.sprite,sw=sprite.rows[0].length,sh=sprite.rows.length;
 // One window at most: the terminal (code, shell) or the answer being written.
 const panel=terminal||output,action=act||beat?.action||'idle',term=!!panel,marks=[],texts=[],live=[],motions=[];
 // Zones: heading band (from area), stage, log band. Nothing is drawn across zones.
 const logSize=Math.max(10,Math.round(12*s)),logLh=Math.round(logSize*1.6),logLines=log.slice(-(term?3:4)),logH=logLines.length?logLines.length*logLh+logSize:0;
 const logTop=A.bottom-logH,floor=Math.round(logTop-(logH?16:6)*s);
 const top=A.y+(term?0:24*s);
 const zone=term?{x:A.x,y:top+30*s,w:A.w*.3,h:floor-top-30*s}:{x:A.x+A.w*.12,y:top,w:A.w*.76,h:floor-top};
 // Beside a window the actor is smaller, leaving room for its speech bubble.
 let px=Math.max(3,Math.min(30,Math.floor(Math.min(zone.w*.8/sw,zone.h*(term?.56:.78)/sh))));
 if(style==='glyph'&&px<12)style='pixel';
 const ox=Math.round(zone.x+(zone.w-sw*px)/2),oy=floor-sh*px,cx=ox+sw*px/2;
 spritePixels(marks,{sprite,frame,x0:ox,y0:oy,px,group:'actor',idPrefix:'a',style,fill,pop:swap,born:(x,y)=>({x,y:A.bottom+12})});
 motions.push({group:'actor',type:action,cx,cy:floor,size:sh*px,span:zone.w*.6});
 // Floor.
 const fl=Math.max(6,Math.round(8*s)),fx0=zone.x+zone.w*.04,fx1=zone.x+zone.w*.96;
 for(let x=fx0,i=0;x<fx1;x+=fl*1.6,i++)marks.push({id:'floor'+i,x,y:floor+5*s,w:fl,h:Math.max(1,1.5*s),color:'muted',level:.55,delay:i*12,from:{x:fx0,y:floor+5*s}});
 // Props beside, above or in front of the actor; each has its own motion.
 let aboveTaken=false;
 props.slice(0,2).forEach((p,i)=>{
  const ps=p.sprite,ppx=Math.max(3,Math.round(px*.6)),pw=ps.w*ppx,ph=ps.h*ppx;
  let x,y;
  if(p.place==='left'){x=ox-pw-14*s;y=floor-ph-sh*px*.25;}
  else if(p.place==='above'){x=cx-pw/2;y=oy-ph-18*s;aboveTaken=true;}
  else if(p.place==='ground'){x=ox+sw*px+8*s;y=floor-ph;}
  else{x=ox+sw*px+14*s;y=floor-ph-sh*px*.25;}
  // With a terminal open, props stay on the actor's side of the stage.
  x=Math.max(A.x,Math.min((term?zone.x+zone.w:A.right)-pw,x));y=Math.max(A.y,y);
  spritePixels(marks,{sprite:ps,x0:Math.round(x),y0:Math.round(y),px:ppx,group:'prop'+i,idPrefix:'p'+i+'_',pop:swap,delayScale:.6,born:(bx,by)=>({x:bx,y:A.bottom+12})});
  if(p.motion!=='none')motions.push({group:'prop'+i,type:p.motion,cx:x+pw/2,cy:y+ph,size:ph,span:pw});
 });
 // Stage lights for lively actions: dotted beams from the top corners.
 if(LIGHTS.includes(action)&&!term){
  const dot=Math.max(2,Math.round(3*s)),targets=[[A.x+8,A.y-6],[A.right-8,A.y-6]];
  targets.forEach(([lx,ly],side)=>{for(let i=0;i<26;i++){const u=i/25,x=lx+(cx+(side?1:-1)*sw*px*.2-lx)*u,y=ly+(oy+sh*px*.4-ly)*u;marks.push({id:'beam'+side+'_'+i,x,y,w:dot,h:dot,color:side?'#ffe08a':'accent',level:.15+.35*u,blink:i%3===side,delay:200+i*18,from:{x:lx,y:ly}});}});
 }
 // Heading and the object register (as in the reference's me.name = ...).
 const big=Math.max(17,Math.round(26*s)),small=Math.max(10,Math.round(12*s)),seq=beat?.actions?.length>1?beat.actions.join(' → '):action;
 texts.push({key:'head',text:actor?.name||WHALE.name,x:A.pad,y:A.pad+big,size:big,color:'accent',weight:700},
  {key:'sub',text:`${LABEL[phase]||phase} · ${action}()`,x:A.pad,y:A.pad+big+small+8,size:small,color:'ink',level:.8});
 const reg=[`me.name   = "${actor?.name||WHALE.name}"`,`me.action = ${seq}()`,`me.phase  = ${phase}`].concat(mood?[`me.mood   = "${mood}"`]:[]);
 if(!term)reg.forEach((line,i)=>texts.push({key:'reg'+i,text:fit(line,small,A.w*.4),x:A.right-A.w*.4,y:A.pad+small*(1.2+i*1.5),size:small,color:'ink',level:.7,delay:200+i*90}));
 // Speech bubble with a pixel border, over the head (or beside it when a prop sits above).
 const say=pending?'正在读你的话…':beat?.say;
 if(say){
  const size=Math.max(12,Math.round(15*s)),lines=wrap(say,22,3),bw=Math.max(...lines.map(span))*size*.6+24,bh=lines.length*size*1.5+16;
  // Beside the head when something sits above it or the action leaps upward.
  const beside=!term&&(aboveTaken||(beat?.actions||[action]).some(a=>['jump','surprised','grow','explode','happy'].includes(a))),limit=term?zone.x+zone.w+A.w*.02:A.right;
  const bx=Math.max(A.x,Math.min(limit-bw,beside?ox+sw*px+12*s:cx-bw*.2)),by=Math.max(A.y-10*s,beside?oy-bh*.4:oy-bh-22*s);
  const dot=Math.max(3,Math.round(4*s)),stepB=dot+2,fromHead={x:cx,y:oy};let n=0;
  for(let x=bx;x<=bx+bw;x+=stepB){marks.push({id:'bb'+n++,x,y:by,w:dot,h:dot,color:'ink',level:.95,delay:120+Math.abs(x-cx)/3,from:fromHead,pop:swap});marks.push({id:'bb'+n++,x,y:by+bh,w:dot,h:dot,color:'ink',level:.95,delay:120+Math.abs(x-cx)/3,from:fromHead,pop:swap});}
  for(let y=by+stepB;y<by+bh;y+=stepB){marks.push({id:'bb'+n++,x:bx,y,w:dot,h:dot,color:'ink',level:.95,delay:200,from:fromHead,pop:swap});marks.push({id:'bb'+n++,x:bx+bw,y,w:dot,h:dot,color:'ink',level:.95,delay:200,from:fromHead,pop:swap});}
  [0,1,2].forEach(i=>marks.push({id:'tail'+i,x:bx+bw*.22-i*stepB,y:by+bh+stepB*(i+1),w:dot,h:dot,color:'ink',level:.95-i*.2,delay:180+i*30,from:fromHead,pop:swap}));
  lines.forEach((line,i)=>texts.push({key:'say'+i,text:line,x:bx+12,y:by+12+size*(i*1.5+.95),size,color:'ink',delay:300+i*160}));
 }else if(phase==='think'){
  live.push({type:'dots',x:cx-12*s,y:oy-24*s,size:Math.round(6*s),gap:Math.round(11*s),color:'accent'});
 }
 for(const name of effects){
  if(name==='rain'){live.push({type:'rain',x0:ox,x1:ox+sw*px,y0:oy-60*s,y1:floor,color:'accent'});continue;}
  const e=EFFECT_GLYPHS[name];if(!e)continue;
  live.push({type:'float',glyphs:e.glyphs,color:e.color,x:cx+(name==='zzz'?sw*px*.35:0),y:oy-8*s,count:e.count||5,spread:sw*px/(e.count||5),rise:90*s,size:Math.round((e.count?26:18)*s),period:2600});
 }
 // Log band.
 if(logLines.length){
  for(let x=A.x,i=0;x<A.right;x+=10*s,i++)marks.push({id:'sep'+i,x,y:logTop-4*s,w:5*s,h:1,color:'line',level:.9,delay:i*4,from:{x:A.x,y:logTop-4*s}});
  logLines.forEach((l,i)=>texts.push({key:'log'+l.id,text:fit(l.text,logSize,A.w),x:A.x,y:logTop+logSize*1.2+i*logLh,size:logSize,color:l.state==='ERR!'?'danger':l.state===' .. '?'accent':'ink',level:i===logLines.length-1?1:.72,delay:i*90}));
 }
 if(panel){
  const wx=Math.round(A.x+A.w*.34),wy=Math.round(A.y-12*s),ww=Math.round(A.right-wx),wh=Math.round(floor+6*s-wy),bar=Math.round(22*s),seg=Math.max(8,Math.round(10*s));
  const born=()=>({x:wx+ww/2,y:A.bottom+16}),order=(x,y)=>Math.hypot(x-(wx+ww/2),y-(wy+wh))/2.2;
  // The window assembles from the floor: border segments, then the title bar.
  for(let x=wx,i=0;x<wx+ww-4;x+=seg,i++){for(const y of [wy,wy+wh-2])marks.push({id:'tw'+i+'_'+y,x,y,w:seg-3,h:2,color:'accent',level:.9,delay:order(x,y),from:born(),pop:swap});}
  for(let y=wy+seg,i=0;y<wy+wh-4;y+=seg,i++){for(const x of [wx,wx+ww-2])marks.push({id:'th'+i+'_'+x,x,y,w:2,h:seg-3,color:'accent',level:.9,delay:order(x,y),from:born(),pop:swap});}
  for(let x=wx+2,i=0;x<wx+ww-4;x+=seg,i++)marks.push({id:'tb'+i,x,y:wy+2,w:seg,h:bar,color:'accent',level:.16,delay:200+i*4,from:born(),pop:swap});
  ['#f07470','#d9b878','#96c4b4'].forEach((color,i)=>marks.push({id:'tl'+i,x:wx+10*s+i*14*s,y:wy+bar/2-3*s,w:8*s,h:8*s,color,level:1,delay:320+i*40,from:born(),pop:swap}));
  const answer=panel.kind==='answer',size=Math.max(11,Math.round((answer?14:13)*s)),lh=Math.round(size*(answer?1.65:1.5)),room=Math.max(2,Math.floor((wh-bar-24)/lh)),lines=answer?wrap(panel.text,Math.max(10,Math.floor((ww-28)/(size*.6))),400):panel.lines,first=Math.max(0,lines.length-room),numW=panel.kind==='code'?size*2.4:0;
  texts.push({key:'ttitle',text:fit(panel.title,small,ww-120*s),x:wx+ww/2,y:wy+bar/2+small*.35,size:small,color:'ink',align:'center',delay:350});
  lines.slice(first).forEach((line,i)=>{
   const n=first+i,y=wy+bar+12+size+i*lh,shell=panel.kind==='shell'||panel.kind==='prompt';
   if(numW)texts.push({key:'tn'+n,text:String(n+1).padStart(2,'0'),x:wx+12,y,size:size-2,color:'muted',delay:420+i*60});
   texts.push({key:'tc'+n,text:(answer?line:codeLine(line,size,ww-28-numW))||' ',x:wx+12+numW,y,size,color:shell&&line.startsWith('$ ')?'accent':'ink',level:shell&&!line.startsWith('$ ')?.8:1,delay:450+i*60});
  });
  const lastLine=lines.at(-1)||'',ly=wy+bar+12+Math.min(lines.length-first,room)*lh-lh;
  if(panel.open)live.push({type:'cursor',x:wx+12+numW+Math.min(span(lastLine),(ww-28-numW)/(size*.6))*size*.6+2,y:ly+4,w:size*.55,h:size,color:'accent'});
 }
 return {marks,texts,live,motions,swap,baseline:A.bottom};
}
module.exports={WHALE,TEMPO,phaseOf,terminalOf,answerOf,logOf,fillOf,buildActorScene,framesOf};
