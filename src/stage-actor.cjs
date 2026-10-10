'use strict';
// Actor layer: the director's character on stage. Pure builders, like the
// figures. The canvas is split into zones that never overlap: a heading band,
// the stage (scenery, actor, props, or actor + terminal) and a log band of the
// turn's real events. Sprite cells are particles: a new actor assembles from
// the floor, a changed one morphs out of the old, pose frames swap in place.
const D=require('./stage-data.cjs');
const {turnNodes}=require('./scenes.cjs');
const {area,wrap,fit,span}=require('./stage-figures.cjs');
const {compileRig,framesFor,ANIM}=require('./sprite-rig.cjs');
const {presetRig}=require('./sprite-presets.cjs');

// Built-in actor when no script exists (director off, history, or failure):
// the DeepSeek whale.
const WHALE={name:'小鲸鱼',preset:'whale'};
const EFFECT_GLYPHS={notes:{glyphs:['♪','♫'],color:'accent'},hearts:{glyphs:['♥'],color:'#ff6f91'},sparkles:{glyphs:['✦','✧','+'],color:'#ffe08a'},stars:{glyphs:['★','☆'],color:'#ffe08a'},zzz:{glyphs:['z','Z'],color:'muted'},question:{glyphs:['?'],color:'accent',count:3},exclaim:{glyphs:['!'],color:'danger',count:3}};
const SHELL=/bash|pwsh|powershell|shell|exec|run|python|node|cmd|terminal|command/i;
const LIGHTS=['dance','happy','spin','jump','grow','cheer','sing','flip'];
// Actions that cross the stage: the actor is drawn smaller to have room.
const TRAVEL=['walk','run','crawl','hop','bounce','roll','swim','dive','fly'];
// Secondary motion per action: what trails the actor or rises where it lands.
const FX={swim:'bubbles',dive:'bubbles',fly:'wind',hover:'wind',run:'dust',walk:'dust',roll:'dust',crawl:'dust',hop:'dust',bounce:'dust',jump:'dust',cheer:'dust',flip:'dust',surprised:'dust',dance:'sparkles',spin:'sparkles',sing:'sparkles',happy:'sparkles',grow:'sparkles'};
function fxOf(action,move,env){
 const own=move?(move.travel!=='none'?'dust':'sparkles'):FX[action]||null;
 if(own==='dust'&&env==='water')return 'bubbles';
 if(own==='dust'&&env==='sky'&&['fly','hover'].includes(action))return 'wind';
 return own;
}
// The show: the director's actions first, then an encore of moves this
// character can do in this scenery, so a finished reply keeps the stage busy
// instead of looping two actions. Fixed per turn; never the same move twice
// in a row.
const POOLS={
 any:['happy','spin','dance','jump','flip','nod','wave','grow','cheer','sing','bounce'],
 legs:['walk','run','hop','bow','dance','wave','cheer','jump'],
 air:['fly','hover','flip','spin','happy','dance','wave','grow','sing','cheer'],
 water:['swim','dive','flip','spin','happy','hover','dance','jump','grow','wave','sing'],
 legless:['roll','bounce','hop','spin']
};
const SHOW_LENGTH={done:8,answer:4};
function programOf(actions,{look=null,env='none',phase='done',seed=0}={}){
 const base=actions.slice(),n=Math.max(base.length,SHOW_LENGTH[phase]||0);
 if(base.length>=n)return base;
 const roles=new Set((look?.rig?.parts||[]).map(p=>p.role.replace(/_[lr]$/,''))),legs=roles.has('leg'),wings=roles.has('wing');
 const aquatic=(roles.has('fin')||roles.has('tail'))&&!legs&&look?.rig?.view==='side';
 let pool;
 if(env==='water')pool=POOLS.water;
 else if(env==='sky'||env==='space')pool=wings||!legs?POOLS.air:[...POOLS.air.filter(a=>a!=='fly'),'jump','cheer'];
 else pool=[...POOLS.any,...(legs?POOLS.legs:aquatic?['swim','dive','roll','bounce']:POOLS.legless),...(wings?['fly','hover']:[])];
 const rnd=D.random(seed>>>0),list=[...new Set(pool)].filter(a=>!base.includes(a)).map(a=>[rnd(),a]).sort((x,y)=>x[0]-y[0]).map(x=>x[1]);
 const out=base.slice();
 for(const a of list){if(out.length>=n)break;if(out.at(-1)!==a)out.push(a);}
 return out;
}
// Pose frames per part-animation cycle: eight, so limbs swing smoothly.
const CYCLE_FRAMES=8;
// Frame tempo per action (ms) for pose frames and flowing glyph text.
const TEMPO={dance:260,walk:220,jump:360,happy:300,wave:260,type:170,spin:300,shake:120,explode:500,surprised:400,idle:900,think:650,sleep:1100,sad:900,nod:380,grow:420,
 swim:190,fly:140,run:120,roll:300,bounce:240,hop:220,crawl:300,dive:220,flip:260,cheer:220,bow:600,sing:380,eat:200,hover:220};

// What an actor looks like, compiled: a rig (preset or drawn) or old row
// sprites. `mark` is DeepSeek's whale path when the host served it.
const rigs=new WeakMap();
// Near-black fills vanish on the dark stage: they are lifted to a dark grey
// (the outline colour keeps its own value).
const lum=hex=>{const n=parseInt(hex.slice(1),16);return (0.2126*(n>>16&255)+0.7152*(n>>8&255)+0.0722*(n&255))/255;};
const lifted=new WeakMap();
function visible(rig){
 if(!rig)return rig;
 if(!lifted.has(rig)){
  const dark=Object.keys(rig.palette).filter(k=>k!==rig.outline&&lum(rig.palette[k])<.07);
  lifted.set(rig,dark.length?{...rig,palette:{...rig.palette,...Object.fromEntries(dark.map(k=>[k,'#3d4352']))}}:rig);
 }
 return lifted.get(rig);
}
function lookOf(actor,mark=null){
 if(actor?.preset){const rig=presetRig(actor.preset,actor.colors,mark);if(rig)return {rig:visible(rig)};}
 if(actor?.rig&&typeof actor.rig==='object'){if(!rigs.has(actor.rig))rigs.set(actor.rig,compileRig(actor.rig));const rig=rigs.get(actor.rig);if(rig)return {rig:visible(rig)};}
 if(actor?.sprite?.rows?.length)return {sprite:actor.sprite};
 return {rig:presetRig('whale',{},mark)};
}
// Pose frames for the action now playing. A rig moves its parts (a custom
// move swings the parts it names); row sprites use their own or derived frames.
function framesOfLook(look,action='idle',move=null){
 if(look?.rig)return framesFor(look.rig,ANIM[action]?action:'idle',CYCLE_FRAMES,move?.parts&&Object.keys(move.parts).length?move.parts:null);
 if(look?.sprite)return framesOf(look.sprite);
 return framesFor(presetRig('whale'),'idle',4);
}
function paletteOf(look){return look?.rig?look.rig.palette:look?.sprite?.palette||{};}
function facingOf(look){return look?.rig?.facing||'right';}

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
 else if((director?.status==='ready'||director?.status==='drawing')&&director.script){const b=director.script.beats?.done;lines.push({id:'dir',text:`[ OK ] direct ${director.actor?.name||''} · ${(b?.actions||[b?.action]).join(' → ')}()`+(director.tokens?` · ${director.tokens} tok`:''),state:' OK '});}
 else if(director?.status==='error')lines.push({id:'dir',text:'[ERR!] direct '+D.short(director.error,80),state:'ERR!'});
 if(director?.drawing)lines.push({id:'draw',text:'[ .. ] draw   sketching '+director.drawing.name+' · vector rig',state:' .. '});
 else if(director?.drawError)lines.push({id:'draw',text:'[ERR!] draw   '+D.short(director.drawError,80),state:'ERR!'});
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
// Pose frames of row sprites: the model's, when they differ visibly from the
// base; otherwise derived ones (lean left, lean right, squash).
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

function spritePixels(marks,{palette,rows,frame=0,x0,y0,px,group,idPrefix,style='pixel',fill='',born,delayScale=1,pop=false}){
 const gap=px>=7?1:0,chars=[...fill];let k=0;
 rows.forEach((row,y)=>[...row].forEach((ch,x)=>{
  const color=palette[ch];if(!color)return;
  const mark={id:idPrefix+x+'_'+y,group,x:x0+x*px,y:y0+y*px,w:px-gap,h:px-gap,color,level:1,delay:((rows.length-y)*32+Math.abs(x-row.length/2)*5)*delayScale,from:born?born(x0+x*px,y0+y*px):undefined,pop};
  if(style==='glyph'&&chars.length){mark.shape='glyph';mark.ch=chars[(k+frame*row.length)%chars.length];}
  k++;marks.push(mark);
 }));
}
// Scenery behind the actor, inside the stage zone only: it fills in from the
// floor like everything else, and its parts sway, drift or twinkle.
function scenery(env,{zone,floor,s,marks,live,motions}){
 const X=zone.x,W=zone.w,top=zone.y,cell=Math.max(4,Math.round(6*s)),rnd=D.random(env.length*977+13);
 const born=(x)=>({x,y:floor});
 const block=(id,x,y,w,h,color,level,extra={})=>marks.push({id:'env_'+id,x:Math.round(x),y:Math.round(y),w:Math.max(1,Math.round(w)),h:Math.max(1,Math.round(h)),color,level,delay:extra.delay??0,from:extra.from||born(x),group:extra.group,blink:extra.blink});
 const blob=(id,cx,cy,rx,ry,color,level,group,cut=null)=>{let k=0;for(let y=-ry;y<=ry;y+=cell)for(let x=-rx;x<=rx;x+=cell){if((x/rx)**2+(y/ry)**2>1)continue;if(cut&&((x-cut[0])/rx)**2+((y-cut[1])/ry)**2<=1)continue;block(id+'_'+k++,cx+x,cy+y,cell-1,cell-1,color,level,{group,delay:60+k*5});}};
 // A tint that fills up from the floor in bands.
 const tint=(color,level,from=top)=>{const band=Math.max(cell*2,Math.round((floor-from)/14));for(let y=floor-band,i=0;y>=from-1;y-=band,i++)block('t'+i,X,Math.max(from,y),W,Math.min(band,y+band-from),color,level*(0.55+0.45*(1-i/14)),{delay:i*45});};
 const stars=(n,color='#ffe08a')=>{for(let i=0;i<n;i++){const x=X+rnd()*W,y=top+rnd()*(floor-top)*.75,d=rnd()<.25?2:1;block('s'+i,x,y,d*Math.max(2,s*2),d*Math.max(2,s*2),i%5?'ink':color,.4+rnd()*.5,{blink:i%3===0,delay:i*15,from:{x,y:y+30}});}};
 if(env==='water'){
  const surface=top+20*s;
  tint('#2a6fdb',.16,surface);
  live.push({type:'waves',x0:X,x1:X+W,y:surface,amp:4*s,color:'accent'},{type:'bubbles',x0:X+W*.05,x1:X+W*.95,y0:surface,y1:floor,count:14,color:'#bfe3ff'});
  for(let i=0;i<3;i++){const x0=X+W*(.15+i*.3);for(let k=0;k<14&&surface+k*14*s<floor-cell*3;k++)block('ray'+i+'_'+k,x0+k*7*s,surface+k*14*s,Math.max(2,2*s),Math.max(2,2*s),'#bfe3ff',.18,{delay:300+k*30});}
  for(let x=X,i=0;x<X+W;x+=cell,i++)block('sand'+i,x,floor-cell*(1+(i%5===0?1:0)),cell-1,cell*(1+(i%5===0?1:0)),'#c2a36b',.45,{delay:i*6});
  [.08,.22,.78,.9].forEach((f,i)=>{const x=X+W*f,h=Math.round((3+rnd()*4)*cell);for(let k=0;k*cell<h;k++)block('weed'+i+'_'+k,x+(k%2?cell*.5:0),floor-cell-(k+1)*cell,cell-1,cell-1,i%2?'#3fa66b':'#2c8a57',.85,{group:'env_weed'+i,delay:200+k*40});motions.push({group:'env_weed'+i,type:'sway',cx:x,cy:floor-cell,size:h,span:cell,seed:i*1.7});});
 }else if(env==='sky'){
  tint('#5aa9ff',.1);
  blob('sun',X+W*.86,top+40*s,26*s,26*s,'#ffe08a',.75);
  [[.2,.22,30],[.55,.12,24],[.72,.36,34]].forEach(([fx,fy,r],i)=>{const cx=X+W*fx,cy=top+(floor-top)*fy+20*s;r*=s;[[-.7,.1,.55,.42],[0,-.2,.7,.6],[.75,.12,.55,.4]].forEach(([dx,dy,rx,ry],j)=>blob('cloud'+i+'_'+j,cx+dx*r,cy+dy*r,rx*r,ry*r,'#eef4ff',.55,'env_cloud'+i));const fx_=fx,ry=r*.6;motions.push({group:'env_cloud'+i,type:'drift',cx:X+W*fx_,cy:top,size:ry,span:W*.25,seed:i*2.1});});
 }else if(env==='space'||env==='night'){
  tint(env==='space'?'#2b1d6b':'#0b1d4a',.2);
  stars(env==='space'?46:30);
  if(env==='space'){blob('planet',X+W*.82,top+60*s,30*s,30*s,'#c792ea',.7);for(let a=0;a<28;a++){const t=a/28*Math.PI*2;block('ring'+a,X+W*.82+Math.cos(t)*48*s,top+60*s+Math.sin(t)*10*s,cell-1,Math.max(2,cell/2),'#ffd1a6',.75,{delay:400+a*12});}}
  else blob('moon',X+W*.84,top+48*s,26*s,26*s,'#fff3c4',.85,undefined,[10*s,-8*s]);
 }else if(env==='grass'){
  tint('#8fd4ff',.06);
  for(let x=X,i=0;x<X+W;x+=cell,i++){const h=cell*(1+(rnd()<.35?1:0));block('g'+i,x,floor-h,cell-1,h,i%3?'#3fa66b':'#5cc47e',.8,{delay:i*6,group:i%4===0?'env_blades':undefined});}
  motions.push({group:'env_blades',type:'sway',cx:X+W/2,cy:floor,size:cell*2,span:W,seed:.4});
  [.12,.3,.7,.88].forEach((f,i)=>{const x=X+W*f;block('fs'+i,x,floor-cell*3,Math.max(2,s*2),cell*2,'#2c8a57',.9,{delay:300+i*40,group:'env_flower'+i});block('fh'+i,x-cell*.5,floor-cell*3.8,cell,cell,['#ff6f91','#ffe08a','#c792ea','#ff9f1c'][i],.95,{delay:340+i*40,group:'env_flower'+i});motions.push({group:'env_flower'+i,type:'sway',cx:x,cy:floor-cell,size:cell*3,span:cell,seed:i});});
  [[-.7,.1,.55,.42],[0,-.2,.7,.6],[.75,.12,.55,.4]].forEach(([dx,dy,rx,ry],j)=>blob('cloud_'+j,X+W*.25+dx*28*s,top+34*s+dy*28*s,rx*28*s,ry*28*s,'#eef4ff',.4,'env_cloud'));motions.push({group:'env_cloud',type:'drift',cx:X+W*.25,cy:top,size:14*s,span:W*.25,seed:1});
 }else if(env==='snow'){
  tint('#cfe3ff',.06);
  for(let x=X,i=0;x<X+W;x+=cell,i++)block('sn'+i,x,floor-cell*(1+(i%7<2?1:0)),cell-1,cell*(1+(i%7<2?1:0)),'#f4f8ff',.8,{delay:i*6});
  live.push({type:'snow',x0:X,x1:X+W,y0:top,y1:floor-cell,count:46,color:'#f4f8ff'});
 }else if(env==='city'){
  tint('#2b1d6b',.12);
  for(let x=X,i=0;x<X+W-cell*3;i++){const w=cell*(3+Math.floor(rnd()*4)),h=(floor-top)*(.25+rnd()*.45);block('b'+i,x,floor-h,w-2,h,'#3d4b62',.55,{delay:i*40});for(let wy=floor-h+cell;wy<floor-cell;wy+=cell*1.6)for(let wx=x+cell*.6;wx<x+w-cell;wx+=cell*1.4)if(rnd()<.45)block('w'+i+'_'+Math.round(wx)+'_'+Math.round(wy),wx,wy,cell*.6,cell*.7,'#ffe08a',.75,{blink:rnd()<.15,delay:200+i*40});x+=w+cell*.6;}
  stars(12);
 }else if(env==='stage'){
  for(const side of [0,1])for(let i=0;i<5;i++){const x=side?X+W-(i+1)*cell*1.2:X+i*cell*1.2;block('cur'+side+'_'+i,x,top,cell,floor-top-(4-i)*cell*2,'#b0324a',.55-i*.07,{delay:i*60});}
  for(let x=X,i=0;x<X+W;x+=cell*3,i++)block('bd'+i,x,floor-2,cell*3-2,2,'#d9b878',.7,{delay:i*10});
 }
}
function buildActorScene({box,actor,look=null,frames=null,move=null,beat,act,phase,terminal,output,mood,effects=[],props=[],pending=false,drawing=null,frame=0,style='pixel',fill='',log=[],swap=false,env='none',roomy=null,program=null}){
 const A=area(box),s=A.s;
 look=look||lookOf(actor);
 const sets=frames||framesOfLook(look,act||beat?.action,move),palette=paletteOf(look),base=sets[0],sw=base[0].length,sh=base.length;
 // One window at most: the terminal (code, shell) or the answer being written.
 const panel=terminal||output,action=act||beat?.action||'idle',term=!!panel,marks=[],texts=[],live=[],motions=[];
 const travels=TRAVEL.includes(action)||(move&&move.travel!=='none');
 // The layout follows the whole beat, so it does not jump between its actions.
 const wide=roomy??((beat?.actions||[action]).some(a=>TRAVEL.includes(a))||travels);
 // Zones: heading band (from area), stage, log band. Nothing is drawn across zones.
 const logSize=Math.max(10,Math.round(12*s)),logLh=Math.round(logSize*1.6),logLines=log.slice(-(term?3:4)),logH=logLines.length?logLines.length*logLh+logSize:0;
 const logTop=A.bottom-logH,floor=Math.round(logTop-(logH?16:6)*s);
 const top=A.y+(term?0:24*s);
 const zone=term?{x:A.x,y:top+30*s,w:A.w*(wide?.42:.3),h:floor-top-30*s}:{x:A.x+A.w*.04,y:top,w:A.w*.92,h:floor-top};
 // Beside a window, or crossing the stage, the actor is smaller.
 let px=Math.max(3,Math.min(30,Math.floor(Math.min(zone.w*(wide?(term?.62:.42):.66)/sw,zone.h*(term?.56:wide?.5:.78)/sh))));
 if(style==='glyph'&&px<12)style='pixel';
 const ox=Math.round(zone.x+(zone.w-sw*px)/2),oy=floor-sh*px,cx=ox+sw*px/2;
 if(env&&env!=='none')scenery(env,{zone,floor,s,marks,live,motions});
 const rows=sets[frame%sets.length];
 spritePixels(marks,{palette,rows,frame,x0:ox,y0:oy,px,group:'actor',idPrefix:'a',style,fill,pop:swap,born:(x,y)=>({x,y:A.bottom+12})});
 motions.unshift({group:'actor',type:move?'move:'+(move.name||'custom'):action,move:move||undefined,cx,cy:floor,size:sh*px,span:zone.w*.6,range:Math.max(0,(zone.w-sw*px)/2-6*s),rangeY:Math.max(0,oy-zone.y-6*s),facing:facingOf(look),fx:fxOf(action,move,env)||undefined});
 // Floor (scenery with its own ground replaces it).
 if(!['water','grass','snow'].includes(env)){const fl=Math.max(6,Math.round(8*s)),fx0=zone.x+zone.w*.04,fx1=zone.x+zone.w*.96;
  for(let x=fx0,i=0;x<fx1;x+=fl*1.6,i++)marks.push({id:'floor'+i,x,y:floor+5*s,w:fl,h:Math.max(1,1.5*s),color:'muted',level:.55,delay:i*12,from:{x:fx0,y:floor+5*s}});}
 // While a new look is being drawn: a blueprint frame with a scanning beam.
 if(drawing){
  const bw=Math.min(zone.w*.5,zone.h*.9),bx=zone.x+(zone.w-bw)/2,by=floor-bw,dot=Math.max(2,Math.round(3*s));
  for(let i=0;i<=24;i++){const u=i/24;for(const [x,y,k] of [[bx+u*bw,by,'t'],[bx+u*bw,floor,'b'],[bx,by+u*bw,'l'],[bx+bw,by+u*bw,'r']])marks.push({id:'bp'+k+i,x,y,w:dot,h:dot,color:'accent',level:i%4?.35:.9,delay:i*20,blink:i%6===0,from:{x:bx+bw/2,y:floor}});}
  live.push({type:'sweep',x0:bx,x1:bx+bw,y0:by,y1:floor,period:1600,color:'accent'});
 }
 // Props beside, above or in front of the actor; each has its own motion.
 let aboveTaken=false;
 props.slice(0,2).forEach((p,i)=>{
  const ps=p.sprite,ppx=Math.max(3,Math.round(px*(wide?.8:.6))),pw=ps.w*ppx,ph=ps.h*ppx;
  let x,y;
  if(p.place==='left'){x=ox-pw-14*s;y=floor-ph-sh*px*.25;}
  else if(p.place==='above'){x=cx-pw/2;y=oy-ph-18*s;aboveTaken=true;}
  else if(p.place==='ground'){x=ox+sw*px+8*s;y=floor-ph;}
  else{x=ox+sw*px+14*s;y=floor-ph-sh*px*.25;}
  // With a terminal open, props stay on the actor's side of the stage.
  x=Math.max(A.x,Math.min((term?zone.x+zone.w:A.right)-pw,x));y=Math.max(A.y,y);
  spritePixels(marks,{palette:ps.palette,rows:ps.rows,x0:Math.round(x),y0:Math.round(y),px:ppx,group:'prop'+i,idPrefix:'p'+i+'_',pop:swap,delayScale:.6,born:(bx,by)=>({x:bx,y:A.bottom+12})});
  if(p.motion!=='none')motions.push({group:'prop'+i,type:p.motion,cx:x+pw/2,cy:y+ph,size:ph,span:pw});
 });
 // Stage lights for lively actions: dotted beams from the top corners.
 if((LIGHTS.includes(action)||env==='stage')&&!term&&!['water','space','night'].includes(env)){
  const dot=Math.max(2,Math.round(3*s)),targets=[[A.x+8,A.y-6],[A.right-8,A.y-6]];
  targets.forEach(([lx,ly],side)=>{for(let i=0;i<26;i++){const u=i/25,x=lx+(cx+(side?1:-1)*sw*px*.2-lx)*u,y=ly+(oy+sh*px*.4-ly)*u;marks.push({id:'beam'+side+'_'+i,x,y,w:dot,h:dot,color:side?'#ffe08a':'accent',level:.15+.35*u,blink:i%3===side,delay:200+i*18,from:{x:lx,y:ly}});}});
 }
 // Heading and the object register (as in the reference's me.name = ...).
 const big=Math.max(17,Math.round(26*s)),small=Math.max(10,Math.round(12*s)),show=program&&program.length>1?program:beat?.actions||[action],at=Math.max(0,show.indexOf(action));
 const seq=show.length>1?`${action}()  [${at+1}/${show.length}] → ${show[(at+1)%show.length]}`:action;
 texts.push({key:'head',text:actor?.name||WHALE.name,x:A.pad,y:A.pad+big,size:big,color:'accent',weight:700},
  {key:'sub',text:drawing?`sketching · ${drawing.name}`:`${LABEL[phase]||phase} · ${action}()`,x:A.pad,y:A.pad+big+small+8,size:small,color:drawing?'accent':'ink',level:.8});
 const reg=[`me.name   = "${drawing?drawing.name:actor?.name||WHALE.name}"`,`me.action = ${seq}${show.length>1?'()':''}`,`me.phase  = ${phase}`].concat(env&&env!=='none'?[`me.scene  = ${env}`]:[]).concat(mood?[`me.mood   = "${mood}"`]:[]);
 if(!term)reg.forEach((line,i)=>texts.push({key:'reg'+i,text:fit(line,small,A.w*.4),x:A.right-A.w*.4,y:A.pad+small*(1.2+i*1.5),size:small,color:'ink',level:.7,delay:200+i*90}));
 // Speech bubble with a pixel border: over the head, beside it when something
 // sits above or the action leaps, and pinned at the top when the actor travels.
 const say=drawing?'正在画新的样子…':pending?'正在读你的话…':beat?.say;
 if(say){
  const size=Math.max(12,Math.round(15*s)),lines=wrap(say,22,3),bw=Math.max(...lines.map(span))*size*.6+24,bh=lines.length*size*1.5+16;
  const beside=!term&&!travels&&(aboveTaken||(beat?.actions||[action]).some(a=>['jump','surprised','grow','explode','happy','cheer','flip'].includes(a))),limit=term?zone.x+zone.w+A.w*.02:A.right;
  const bx=travels?Math.round(zone.x+(zone.w-bw)/2):Math.max(A.x,Math.min(limit-bw,beside?ox+sw*px+12*s:cx-bw*.2));
  const by=travels?Math.round(top-6*s):Math.max(A.y-10*s,beside?oy-bh*.4:oy-bh-22*s);
  const dot=Math.max(3,Math.round(4*s)),stepB=dot+2,fromHead={x:cx,y:oy};let n=0;
  for(let x=bx;x<=bx+bw;x+=stepB){marks.push({id:'bb'+n++,x,y:by,w:dot,h:dot,color:'ink',level:.95,delay:120+Math.abs(x-cx)/3,from:fromHead,pop:swap});marks.push({id:'bb'+n++,x,y:by+bh,w:dot,h:dot,color:'ink',level:.95,delay:120+Math.abs(x-cx)/3,from:fromHead,pop:swap});}
  for(let y=by+stepB;y<by+bh;y+=stepB){marks.push({id:'bb'+n++,x:bx,y,w:dot,h:dot,color:'ink',level:.95,delay:200,from:fromHead,pop:swap});marks.push({id:'bb'+n++,x:bx+bw,y,w:dot,h:dot,color:'ink',level:.95,delay:200,from:fromHead,pop:swap});}
  if(!travels)[0,1,2].forEach(i=>marks.push({id:'tail'+i,x:bx+bw*.22-i*stepB,y:by+bh+stepB*(i+1),w:dot,h:dot,color:'ink',level:.95-i*.2,delay:180+i*30,from:fromHead,pop:swap}));
  lines.forEach((line,i)=>texts.push({key:'say'+i,text:line,x:bx+12,y:by+12+size*(i*1.5+.95),size,color:'ink',delay:300+i*160}));
 }else if(phase==='think'){
  live.push({type:'dots',x:cx-12*s,y:oy-24*s,size:Math.round(6*s),gap:Math.round(11*s),color:'accent'});
 }
 // Effects: glyphs float up from the actor (across the stage when it travels).
 for(const name of effects){
  if(name==='rain'){live.push({type:'rain',x0:travels?zone.x:ox,x1:travels?zone.x+zone.w:ox+sw*px,y0:oy-60*s,y1:floor,color:'accent'});continue;}
  if(name==='bubbles'){if(env!=='water')live.push({type:'bubbles',x0:zone.x,x1:zone.x+zone.w,y0:zone.y,y1:floor,count:12,color:'#bfe3ff'});continue;}
  if(name==='snow'){if(env!=='snow')live.push({type:'snow',x0:zone.x,x1:zone.x+zone.w,y0:zone.y,y1:floor,count:36,color:'#f4f8ff'});continue;}
  if(name==='confetti'){live.push({type:'confetti',x0:zone.x,x1:zone.x+zone.w,y0:zone.y,y1:floor,count:34});continue;}
  if(name==='fire'){live.push({type:'fire',x0:ox,x1:ox+sw*px,y:floor,rise:sh*px*.6});continue;}
  const e=EFFECT_GLYPHS[name];if(!e)continue;
  const wide=travels?zone.w*.8:sw*px;
  live.push({type:'float',glyphs:e.glyphs,color:e.color,x:travels?zone.x+zone.w/2:cx+(name==='zzz'?sw*px*.35:0),y:oy-8*s,count:e.count||5,spread:wide/(e.count||5),rise:90*s,size:Math.round((e.count?26:18)*s),period:2600});
 }
 // Log band.
 if(logLines.length){
  for(let x=A.x,i=0;x<A.right;x+=10*s,i++)marks.push({id:'sep'+i,x,y:logTop-4*s,w:5*s,h:1,color:'line',level:.9,delay:i*4,from:{x:A.x,y:logTop-4*s}});
  logLines.forEach((l,i)=>texts.push({key:'log'+l.id,text:fit(l.text,logSize,A.w),x:A.x,y:logTop+logSize*1.2+i*logLh,size:logSize,color:l.state==='ERR!'?'danger':l.state===' .. '?'accent':'ink',level:i===logLines.length-1?1:.72,delay:i*90}));
 }
 if(panel){
  const wx=Math.round(A.x+A.w*(wide?.46:.34)),wy=Math.round(A.y-12*s),ww=Math.round(A.right-wx),wh=Math.round(floor+6*s-wy),bar=Math.round(22*s),seg=Math.max(8,Math.round(10*s));
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
module.exports={WHALE,TEMPO,TRAVEL,CYCLE_FRAMES,fxOf,programOf,phaseOf,terminalOf,answerOf,logOf,fillOf,buildActorScene,framesOf,lookOf,framesOfLook,paletteOf};
