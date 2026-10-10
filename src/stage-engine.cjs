'use strict';
// Canvas stage. A figure is a list of target marks; the engine owns the
// particles that travel between figures, so one drawing turns into the next
// instead of being swapped. Marks nothing can carry are born at the figure's
// baseline and grow into place. Post-processing follows the reference PV:
// afterimage, soft glow and (in CSS) scanlines.
const SCRAMBLE='01#$%&*+=/<>[]{}~^:;!?abcdefx';
const FONT='Consolas,"SFMono-Regular","Microsoft YaHei",monospace';
const COLOR_NAMES=['paper','ink','muted','accent','danger','good','line'];
const easeOut=u=>1-Math.pow(1-u,3);
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,u)=>a+(b-a)*u;
const noise=(i,t)=>{const s=Math.sin(i*12.9898+t*78.233)*43758.5453;return s-Math.floor(s);};
const formatCount=(v,kind)=>kind==='fixed2'?v.toFixed(2):kind==='pct'?Math.round(v)+'%':Math.round(v).toLocaleString('en-US');
const rasterCache=new Map();
// Text → sampled pixels, for big glyph drawings. Cached per word/size/step.
function raster(text,size,step){
 const key=text+'|'+size+'|'+step;
 if(rasterCache.has(key))return rasterCache.get(key);
 const c=document.createElement('canvas'),x=c.getContext('2d',{willReadFrequently:true});
 const font=`700 ${size}px "Microsoft YaHei","PingFang SC",Consolas,sans-serif`;
 x.font=font;const w=Math.ceil(x.measureText(text).width)+4,h=Math.ceil(size*1.2);
 c.width=w;c.height=h;x.font=font;x.textBaseline='alphabetic';x.fillStyle='#fff';x.fillText(text,2,Math.round(size*.98));
 const data=x.getImageData(0,0,w,h).data,points=[];
 for(let y=0;y<h;y+=step)for(let px=0;px<w;px+=step)if(data[(y*w+px)*4+3]>110)points.push({x:px,y});
 const out={w,h,points:points.slice(0,2600)};
 if(rasterCache.size>40)rasterCache.clear();
 rasterCache.set(key,out);return out;
}
// Whole-figure actions for the director's actor: a pose per moment (offset,
// scale, rotation about the feet, per-row sway) applied to every particle of
// the group at draw time, so the drawing itself never has to be rebuilt.
function pose(type,sec,size,span){
 const p={dx:0,dy:0,sx:1,sy:1,rot:0,sway:0,scatter:0},TAU=Math.PI*2;
 switch(type){
  case 'dance':{const b=sec*2.2;p.rot=.16*Math.sin(b*Math.PI);p.dy=-Math.abs(Math.sin(b*Math.PI))*size*.1;p.sx=1+.07*Math.sin(b*TAU);p.sy=1-.07*Math.sin(b*TAU);p.sway=.07*Math.sin(b*Math.PI);break;}
  case 'jump':{const u=(sec*1.25)%1;p.dy=-4*u*(1-u)*size*.42;p.sy=u<.08||u>.94?.86:1.04;p.sx=1/p.sy;break;}
  case 'happy':{const u=(sec*2.4)%1;p.dy=-4*u*(1-u)*size*.16;p.rot=.06*Math.sin(sec*9);break;}
  case 'spin':p.sx=Math.cos(sec*3.4);break;
  case 'wave':p.rot=.1*Math.sin(sec*6);p.sway=.04*Math.sin(sec*6);break;
  case 'nod':p.rot=.12*Math.max(0,Math.sin(sec*5));break;
  case 'shake':p.dx=Math.sin(sec*42)*size*.035;break;
  case 'think':p.dy=-Math.sin(sec*1.6)*size*.03;p.rot=.05*Math.sin(sec*.8);break;
  case 'sleep':p.rot=.12;p.sy=1+.03*Math.sin(sec*1.3);break;
  case 'sad':p.sy=.9;p.sx=1.04;p.rot=-.05;p.dy=Math.sin(sec*1.2)*2;break;
  case 'surprised':{const u=(sec*.7)%1;p.dy=u<.15?-Math.sin(u/.15*Math.PI)*size*.25:0;p.sy=u<.15?1.08:1;p.dx=u>=.15&&u<.3?Math.sin(sec*50)*3:0;break;}
  case 'walk':{const a=sec*.55;p.dx=Math.sin(a)*span*.3;p.sx=Math.cos(a)>=0?1:-1;p.dy=-Math.abs(Math.sin(sec*6))*size*.04;p.rot=.05*Math.sin(sec*6);break;}
  case 'grow':{const k=1+.14*Math.sin(sec*2.2);p.sx=k;p.sy=k;break;}
  case 'type':p.dy=-Math.abs(Math.sin(sec*11))*2;p.rot=.03*Math.sin(sec*5.5);break;
  case 'explode':p.scatter=Math.max(0,Math.sin(sec*1.3))**3;break;
  case 'float':p.dy=Math.sin(sec*2.2)*size*.12;p.rot=.08*Math.sin(sec*1.3);break;
  case 'bob':p.dy=-Math.abs(Math.sin(sec*3))*size*.15;break;
  case 'none':break;
  case 'turn':p.rot=sec*.32;break;
  default:p.dy=-Math.abs(Math.sin(sec*1.9))*size*.025;p.sy=1+.025*Math.sin(sec*1.9);
 }
 return p;
}
function place(act,s,p,t){
 const q=pose(act.type,(t-act.t0)/1000,act.size||100,act.span||300);
 let rx=(s.x+s.w/2-act.cx)*q.sx,ry=(s.y+s.h/2-act.cy)*q.sy;
 rx+=q.sway*ry;
 if(q.scatter){const d=Math.hypot(rx,ry)||1;rx+=(rx/d+(noise(p.n,5)-.5))*q.scatter*act.size*.7;ry+=(ry/d+(noise(p.n,6)-.5))*q.scatter*act.size*.7;}
 const c=Math.cos(q.rot),n=Math.sin(q.rot),w=s.w*Math.abs(q.sx),h=s.h*q.sy;
 return {x:act.cx+rx*c-ry*n+q.dx-w/2,y:act.cy+rx*n+ry*c+q.dy-h/2,w,h};
}
function createEngine(canvas,options={}){
 const ctx=canvas.getContext('2d');
 const scene=document.createElement('canvas'),sctx=scene.getContext('2d');
 const glow=document.createElement('canvas'),gctx=glow.getContext('2d');
 let w=1,h=1,dpr=1,colors={},dark=true,particles=[],texts=new Map(),live=[],spin=null,acts=new Map(),key=null,builder=null,spec=null;
 const transparent=!!options.transparent;
 let animate=options.animate!==false,motion=options.motion||'rich',raf=0,last=0,dead=false,serial=0,settle=0,born=performance.now();
 const now=()=>performance.now();
 const speed=()=>motion==='calm'?.55:1;
 function readColors(){
  const style=getComputedStyle(canvas);
  for(const name of COLOR_NAMES)colors[name]=style.getPropertyValue('--'+name).trim()||colors[name]||({paper:'#070b14',ink:'#d5dfed',muted:'#8e9bb0',accent:'#98aafa',danger:'#f07470',good:'#96c4b4',line:'#3d4b62'})[name];
  const m=colors.paper.match(/^#([0-9a-f]{6})$/i);
  dark=m?parseInt(m[1].slice(0,2),16)+parseInt(m[1].slice(2,4),16)+parseInt(m[1].slice(4,6),16)<300:true;
 }
 function state(p,t){
  const u=p.dur>0?clamp((t-p.t0)/p.dur):1,e=easeOut(u),a=p.a,b=p.b;
  return {x:lerp(a.x,b.x,e),y:lerp(a.y,b.y,e),w:lerp(a.w,b.w,e),h:lerp(a.h,b.h,e),l:lerp(a.l,b.l,u<0?0:e)};
 }
 const target=m=>({x:m.x,y:m.y,w:m.w??4,h:m.h??4,l:m.level??.8});
 function assign(p,m){p.id=m.id;p.ref=m.ref;p.shape=m.shape||'rect';p.ch=m.ch;p.color=m.color||'ink';p.blink=!!m.blink;p.z=m.z||0;p.group=m.group;p.dying=false;}
 // Theme names or literal #rrggbb (sprite palettes come from the director).
 const paint=c=>colors[c]||(typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c)?c:colors.ink);
 function apply(next,instant){
  const t=now(),k=speed(),still=instant||!animate;
  const marks=(next.marks||[]).slice(0,3200);
  const alive=particles.filter(p=>!p.dying),used=new Set(),out=[];
  let pairs=[];
  if(next.sameKey){
   const byId=new Map(alive.map(p=>[p.id,p]));
   for(const m of marks){const p=byId.get(m.id);pairs.push([m,p]);if(p)used.add(p);}
  }else{
   // Continuity between drawings: carry particles by horizontal order.
   const order=(a,b)=>a.x-b.x||a.y-b.y;
   const from=alive.map(p=>({p,...state(p,t)})).sort(order),to=marks.map((m,i)=>({m,i,x:m.x,y:m.y})).sort(order);
   const ratio=from.length/Math.max(1,to.length);
   to.forEach((item,i)=>{const pick=from[Math.floor(i*ratio)];const p=pick&&!used.has(pick.p)?pick.p:null;if(p)used.add(p);pairs.push([item.m,p]);});
  }
  for(const [m,p] of pairs){
   const delay=(m.delay||0)*k;
   if(p){
    const cur=state(p,t),b=target(m),moved=Math.abs(cur.x-b.x)+Math.abs(cur.y-b.y)+Math.abs(cur.l-b.l)*20>.5;
    assign(p,m);
    if(still){p.a=b;p.b=b;p.dur=0;}
    else if(moved||!next.sameKey){p.a=cur;p.b=b;p.t0=t+(next.sameKey?0:80+delay*.6);p.dur=(next.sameKey?520:950)*k;}
    out.push(p);
   }else{
    const b=target(m),f=m.pop?b:m.from||{x:m.x,y:next.baseline??h};
    const p={n:serial++,a:still?b:{x:f.x,y:f.y,w:b.w,h:b.h,l:0},b,t0:m.pop?t:t+delay,dur:still?0:m.pop?110:760*k};
    assign(p,m);out.push(p);
   }
  }
  for(const p of alive)if(!used.has(p)){
   const cur=state(p,t);p.dying=true;p.ref=null;
   if(still)continue;
   if(next.swap){p.a=cur;p.b={...cur,l:0};p.t0=t;p.dur=110;out.push(p);continue;}
   p.a=cur;p.b={x:cur.x+(noise(p.n,1)-.5)*14,y:cur.y+18+noise(p.n,2)*46,w:Math.max(1,cur.w*.4),h:Math.max(1,cur.h*.4),l:0};p.t0=t+noise(p.n,3)*160;p.dur=560*k;p.shape=p.shape==='glyph'?'glyph':'dot';
   out.push(p);
  }
  particles=out;
  const seen=new Set();
  for(const s of next.texts||[]){
   seen.add(s.key);const old=texts.get(s.key),value=s.count?s.count.to:null;
   if(old&&!old.dying&&old.spec.text===s.text&&old.value===value){old.spec=s;continue;}
   texts.set(s.key,{spec:s,value,from:old?.dying?null:old?.shown||'',fromValue:old?.value??0,t0:still?-1e9:t+(s.delay||0)*k,dying:false});
  }
  for(const [name,item] of texts)if(!seen.has(name)){if(still||item.dying)texts.delete(name);else{item.dying=true;item.t0=t;}}
  live=(next.live||[]).map((x,i)=>({...x,t0:live[i]?.type===x.type?live[i].t0:t}));
  spin=next.spin?{...next.spin,t0:spin?.t0??t}:null;
  // One action per group (actor, props); an unchanged action keeps its clock.
  acts=new Map((next.motions||(next.motion?[next.motion]:[])).map(m=>{const old=acts.get(m.group);return [m.group,{...m,t0:old?.type===m.type?old.t0:t}];}));
  // A pose-frame swap is not a new drawing: it must not restart the afterimage.
  settle=next.swap?Math.min(settle,t+150):t+(still?0:2600*k+Math.max(0,...marks.map(m=>m.delay||0))*k);
  wake();
 }
 function drawParticle(p,t){
  const s=state(p,t);
  if(t<p.t0&&s.l<=0)return;
  let level=s.l;
  if(p.blink)level*=Math.floor((t-born)/480)%2?.35:1;
  if(animate&&motion==='rich')level*=.86+.14*noise(p.n,Math.floor(t/90));
  if(level<=.01)return;
  let x=s.x;
  if(spin&&!p.dying){const a=(t-spin.t0)/1000*spin.speed,dx=s.x-spin.cx;x=spin.cx+dx*Math.cos(a)+p.z*Math.sin(a);level*=.65+.35*clamp(.5+(p.z*Math.cos(a)-dx*Math.sin(a))/160);}
  let y=s.y,pw=s.w,ph=s.h;
  const act=p.group&&!p.dying&&acts.get(p.group);
  if(act){const q=place(act,s,p,t);x=q.x;y=q.y;pw=q.w;ph=q.h;}
  sctx.globalAlpha=clamp(level);
  const color=paint(p.color);
  if(p.shape==='glyph'){sctx.fillStyle=color;sctx.font=`${Math.max(8,Math.round(ph*.9))}px ${FONT}`;sctx.textAlign='center';sctx.fillText(p.ch||'·',x+pw/2,y+ph*.8);return;}
  if(p.shape==='frame'){sctx.strokeStyle=color;sctx.lineWidth=1;sctx.strokeRect(Math.round(x)+.5,Math.round(y)+.5,pw,ph);return;}
  sctx.fillStyle=color;
  if(p.shape==='cell'){
   sctx.globalAlpha=clamp(level*.9);sctx.fillRect(x,y,pw,ph);
   sctx.globalAlpha=clamp(s.l);sctx.strokeStyle=color;sctx.lineWidth=1;sctx.strokeRect(Math.round(x)+.5,Math.round(y)+.5,pw-1,ph-1);
   if(p.ch&&ph>=10){sctx.fillStyle=level>.55?colors.paper:colors.ink;sctx.globalAlpha=clamp(s.l*1.1);sctx.font=`${Math.round(Math.min(ph*.62,pw*.72))}px ${FONT}`;sctx.textAlign='center';sctx.fillText(p.ch,x+pw/2,y+ph*.72);}
   return;
  }
  sctx.fillRect(x,y,pw,ph);
 }
 function drawText(item,t){
  const s=item.spec;
  let alpha=s.level??1;
  if(item.dying){const u=(t-item.t0)/260;if(u>=1)return false;alpha*=1-u;}
  else if(t<item.t0&&!item.from)return true;
  let text=s.text;
  if(s.count){const u=item.t0<0?1:easeOut(clamp((t-item.t0)/900));text=text.replace('{n}',formatCount(lerp(item.fromValue||0,s.count.to,u),s.count.kind));}
  if(!item.dying&&item.t0>0&&!s.count){
   const list=Array.from(text),old=Array.from(item.from||''),per=s.size>=18?34:16,rows=[];
   for(let i=0;i<list.length;i++){
    const at=item.t0+i*per,settled=at+110;
    if(t>=settled)rows.push(list[i]);
    else if(t>=at)rows.push(list[i]===' '?' ':SCRAMBLE[Math.floor(noise(i,Math.floor(t/45))*SCRAMBLE.length)]);
    else if(old[i]!==undefined)rows.push(old[i]);
    else break;
   }
   text=rows.join('');
  }
  if(!text)return true;
  item.shown=text;
  sctx.globalAlpha=clamp(alpha);sctx.fillStyle=paint(s.color);
  sctx.font=`${s.weight||400} ${s.size||12}px ${FONT}`;sctx.textAlign=s.align||'left';
  sctx.fillText(text,s.x,s.y);
  return true;
 }
 function drawLive(item,t){
  const color=paint(item.color||'accent');
  if(item.type==='sweep'){const u=((t-item.t0)/item.period)%1,x=lerp(item.x0,item.x1,u);sctx.globalAlpha=.85;sctx.fillStyle=color;sctx.fillRect(x,item.y0,1.5,item.y1-item.y0);sctx.globalAlpha=.18;sctx.fillRect(x-10,item.y0,10,item.y1-item.y0);}
  else if(item.type==='cursor'){if(Math.floor((t-born)/530)%2)return;sctx.globalAlpha=.9;sctx.fillStyle=color;sctx.fillRect(item.x,item.y,item.w||7,item.h||13);}
  else if(item.type==='float'){
   // Effects drift up from an anchor and fade: notes, hearts, sparkles, zzz...
   const glyphs=item.glyphs||['*'],n=item.count||6;sctx.fillStyle=color;sctx.textAlign='center';
   for(let i=0;i<n;i++){const u=(((t-item.t0)/(item.period||2400))+i/n)%1,gx=item.x+(i-(n-1)/2)*(item.spread||14)+Math.sin(u*6+i)*8,gy=item.y-u*(item.rise||60);sctx.globalAlpha=Math.sin(u*Math.PI)*.95;sctx.font=`${item.size||16}px ${FONT}`;sctx.fillText(glyphs[i%glyphs.length],gx,gy);}
  }
  else if(item.type==='rain'){sctx.fillStyle=color;for(let i=0;i<14;i++){const u=(((t-item.t0)/900)+noise(i,1))%1;sctx.globalAlpha=.55*(1-u);sctx.fillRect(item.x0+noise(i,2)*(item.x1-item.x0),item.y0+u*(item.y1-item.y0),1.5,8);}}
  else if(item.type==='dots'){sctx.fillStyle=color;for(let i=0;i<3;i++){sctx.globalAlpha=.35+.65*Math.max(0,Math.sin((t-item.t0)/220-i*.9));sctx.fillRect(item.x+i*(item.gap||9),item.y,item.size||5,item.size||5);}}
  else if(item.type==='ring'){const u=((t-item.t0)%1400)/1400;sctx.globalAlpha=.8*(1-u);sctx.strokeStyle=color;sctx.lineWidth=1.5;sctx.beginPath();sctx.arc(item.x,item.y,item.r*(.4+u),0,Math.PI*2);sctx.stroke();sctx.globalAlpha=.9;sctx.fillStyle=color;sctx.fillRect(item.x-2,item.y-2,4,4);}
 }
 function draw(t){
  sctx.setTransform(dpr,0,0,dpr,0,0);
  sctx.globalCompositeOperation='source-over';
  // Afterimage: fade the previous frame toward the paper colour instead of clearing it.
  // A full clear once settled: 8-bit fading alone never reaches the paper colour.
  const trail=animate&&motion==='rich'&&t<settle;
  if(transparent){if(trail){sctx.globalCompositeOperation='destination-out';sctx.globalAlpha=.58;sctx.fillRect(0,0,w,h);sctx.globalCompositeOperation='source-over';}else sctx.clearRect(0,0,w,h);}
  else{sctx.globalAlpha=trail?.42:1;sctx.fillStyle=colors.paper;sctx.fillRect(0,0,w,h);}
  sctx.textBaseline='alphabetic';
  for(const p of particles)drawParticle(p,t);
  if(particles.length>3600||t>settle)particles=particles.filter(p=>!p.dying||t<p.t0+p.dur);
  for(const [name,item] of texts)if(drawText(item,t)===false)texts.delete(name);
  for(const item of live)drawLive(item,t);
  ctx.setTransform(1,0,0,1,0,0);ctx.globalCompositeOperation='copy';ctx.globalAlpha=1;ctx.drawImage(scene,0,0);
  if(animate&&dark&&motion==='rich'&&glow.width){
   gctx.globalCompositeOperation='copy';gctx.filter='blur(3px)';gctx.drawImage(scene,0,0,glow.width,glow.height);gctx.filter='none';
   ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.38;ctx.drawImage(glow,0,0,canvas.width,canvas.height);
  }
  ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
 }
 function frame(){
  raf=0;if(dead)return;
  const t=now(),busy=t<settle;
  // Full rate while drawings move; a calmer rate for blinking and flicker.
  if(busy||acts.size||t-last>=66){draw(t);last=t;}
  if(animate&&!document.hidden&&(busy||acts.size||live.length||spin||motion==='rich'||particles.some(p=>p.blink)))raf=requestAnimationFrame(frame);
 }
 function wake(){if(!raf&&!dead){if(animate)raf=requestAnimationFrame(frame);else{draw(now()+1e7);}}}
 function measure(){
  const rect=canvas.getBoundingClientRect();
  dpr=Math.min(2,globalThis.devicePixelRatio||1);w=Math.max(1,rect.width);h=Math.max(1,rect.height);
  for(const c of [canvas,scene]){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);}
  glow.width=Math.max(1,Math.round(w*dpr/4));glow.height=Math.max(1,Math.round(h*dpr/4));
  readColors();
 }
 const visibility=()=>{if(!document.hidden)wake();};
 document.addEventListener('visibilitychange',visibility);
 measure();
 return {
  show(nextKey,build){
   const same=nextKey===key;key=nextKey;builder=build;
   spec=build({w,h,raster});apply({...spec,sameKey:same},false);
   return spec;
  },
  resize(){
   const before=[w,h];measure();
   if(builder&&(Math.abs(before[0]-w)>1||Math.abs(before[1]-h)>1)){spec=builder({w,h,raster});apply({...spec,sameKey:true},true);}
   wake();
  },
  restyle(){readColors();wake();},
  setOptions(next){animate=next.animate!==false;motion=next.motion||motion;if(!animate&&raf){cancelAnimationFrame(raf);raf=0;}if(builder){spec=builder({w,h,raster});apply({...spec,sameKey:true},!animate);}wake();},
  hit(x,y){
   let best=null,dist=12;
   for(const p of particles){if(p.dying||!p.ref)continue;const s=state(p,now()),d=Math.hypot(s.x+s.w/2-x,s.y+s.h/2-y);if(d<dist){dist=d;best=p.ref;}}
   return best;
  },
  get count(){return particles.length;},
  destroy(){dead=true;if(raf)cancelAnimationFrame(raf);document.removeEventListener('visibilitychange',visibility);}
 };
}
module.exports={createEngine,raster,pose};
