'use strict';
// Opening sequence, after the reference PV's boot: a protect log with a '#'
// shield, modules loading into a grid, a pixel growing into `me = Object()`,
// a neofetch of the real setup, a 3-2-1 countdown made of digits, then RUN.
// Every value shown is real (version, session, model, director, actor, counts).
// The same particle engine draws it, so each step morphs into the next.
const {createEngine}=require('./stage-engine.cjs');
const D=require('./stage-data.cjs');

const fmt=n=>Math.round(n).toLocaleString('en-US');
function frame(box){
 const s=Math.max(.7,Math.min(1.6,Math.min(box.w/1100,box.h/640))),pad=Math.round(36*s);
 return {s,pad,x:pad,y:pad,w:box.w-pad*2,h:box.h-pad*2,right:box.w-pad,bottom:box.h-pad,size:Math.round(14*s)};
}
const typed=(F,lines,x,y,color='ink',lh=1.55,delay=0,per=130)=>lines.map((line,i)=>({key:'t'+i+':'+line.slice(0,6),text:line,x,y:y+i*F.size*lh,size:F.size,color:/^\[WARN\]/.test(line)?'#e9b949':/^\$/.test(line)?'accent':color,delay:delay+i*per}));

function protect(box,info){
 const F=frame(box),marks=[];
 const lines=['$ ./thought-window --attach',`[ OK ] dsh web: connected`,`[ OK ] session: ${String(info.session||'—').slice(0,12)}`,`[ OK ] model: ${info.model||'default selection'}`,'[ OK ] public trace channel: open',
  `[ OK ] stage: ${info.figures} figures · ${info.actions} actions`,`[ OK ] director: ${info.director?'online':'off'}`,...(info.director?['[WARN] director: +1 model call per message']:[]),`[ OK ] actor: ${info.actor}`];
 // A shield drawn with '#', as in the reference.
 const cx=F.x+F.w*.72,top=F.y+F.h*.12,wd=F.w*.2,ht=F.h*.66,g=Math.round(12*F.s);let n=0;
 const add=(x,y,ch='#',level=.9)=>marks.push({id:'sh'+n++,shape:'glyph',ch,x,y,w:g,h:g,color:'ink',level,delay:n*9,from:{x,y:F.bottom}});
 for(let x=cx-wd;x<=cx+wd;x+=g*.8)add(x,top);
 for(let u=0;u<=1;u+=.045){const y=top+u*ht,half=wd*(1-Math.pow(u,1.8));add(cx-half,y);add(cx+half,y);}
 const rng=D.random(7);for(let i=0;i<26;i++){const u=rng()*.75,y=top+g*2+u*ht*.85,half=wd*(1-Math.pow(u,1.8))*.8;add(cx+(rng()*2-1)*half,y,'·',.6);}
 return {marks,texts:typed(F,lines,F.x,F.y+F.size,'ink',1.6,100,170),live:[{type:'cursor',x:F.x,y:F.y+F.size*(lines.length*1.6+.6),w:F.size*.55,h:F.size}]};
}
function load(box,info){
 const F=frame(box),cols=24,rows=4,cw=Math.floor(F.w/cols),chh=Math.round(cw*.62),total=info.figures+info.actions,marks=[],texts=[];
 for(let i=0;i<cols*rows;i++){
  const c=i%cols,r=Math.floor(i/cols),x=F.x+c*cw,y=F.y+r*(chh+6),loaded=i<total;
  marks.push({id:'c'+i,shape:loaded?'cell':'frame',ch:loaded&&chh>=12?String(i+1).padStart(3,'0').slice(-2):undefined,x,y,w:cw-4,h:chh,color:loaded?'ink':'muted',level:loaded?.55+.4*((i*37)%10)/10:.35,delay:i*22,from:{x,y:F.bottom}});
 }
 const by=F.y+rows*(chh+6)+F.size*3;
 texts.push({key:'file',text:`stage-${String(total).padStart(5,'0')}.figures`,x:F.x,y:by,size:F.size,color:'ink',delay:200},{key:'loaded',text:`modules loaded   {n} / ${total}`,count:{to:total},x:F.x,y:by+F.size*1.8,size:F.size,color:'ink',delay:250});
 const bw=F.w*.6,segs=40;for(let i=0;i<segs;i++)marks.push({id:'bar'+i,x:F.x+i*bw/segs,y:by+F.size*3,w:bw/segs-2,h:Math.max(4,F.size*.6),color:'accent',level:.9,delay:300+i*30,from:{x:F.x,y:by+F.size*3}});
 return {marks,texts};
}
function object(box,info){
 const F=frame(box),sprite=info.sprite,marks=[],cw=Math.min(F.w*.24,F.h*.62),chh=cw*1.25,x0=F.x+F.w*.08,y0=F.y+F.h*.12;
 // The pixel grows into a frame; the actor assembles inside it.
 const step=Math.max(6,Math.round(9*F.s));let n=0;
 for(let x=x0;x<=x0+cw;x+=step){marks.push({id:'ob'+n++,x,y:y0,w:step-3,h:2,color:'ink',level:.9,delay:Math.abs(x-x0-cw/2)*1.2,from:{x:x0+cw/2,y:y0+chh/2}});marks.push({id:'ob'+n++,x,y:y0+chh,w:step-3,h:2,color:'ink',level:.9,delay:Math.abs(x-x0-cw/2)*1.2,from:{x:x0+cw/2,y:y0+chh/2}});}
 for(let y=y0+step;y<y0+chh;y+=step){marks.push({id:'ob'+n++,x:x0,y,w:2,h:step-3,color:'ink',level:.9,delay:Math.abs(y-y0-chh/2)*1.2,from:{x:x0+cw/2,y:y0+chh/2}});marks.push({id:'ob'+n++,x:x0+cw,y,w:2,h:step-3,color:'ink',level:.9,delay:Math.abs(y-y0-chh/2)*1.2,from:{x:x0+cw/2,y:y0+chh/2}});}
 if(sprite){const rows=sprite.rows,px=Math.max(3,Math.floor(Math.min(cw*.7/rows[0].length,chh*.55/rows.length))),ox=x0+(cw-rows[0].length*px)/2,oy=y0+(chh-rows.length*px)/2;
  rows.forEach((row,yy)=>[...row].forEach((ch,xx)=>{const color=sprite.palette[ch];if(color)marks.push({id:'px'+xx+'_'+yy,x:ox+xx*px,y:oy+yy*px,w:px-1,h:px-1,color,level:1,delay:500+(rows.length-yy)*30,from:{x:x0+cw/2,y:y0+chh/2}});}));}
 const main=sprite?Object.values(sprite.palette)[1]||Object.values(sprite.palette)[0]:'#4d6bfe';
 const reg=[`me = Object()`,``,`me.name     = "${info.actor}"`,`me.species  = "pixel actor"`,`me.home     = "dsh://session/${String(info.session||'').slice(0,8)}"`,`me.owner    = you`,`me.color    = ${main}`,`me.status   = "alive"`];
 return {marks,texts:typed(F,reg,x0+cw+F.w*.08,y0+F.size,'ink',1.75,600,160)};
}
function neofetch(box,info){
 const F=frame(box),pairs=[['"plugin"',`"thought-window ${info.version}"`],['"model"',`"${info.model||'default'}"`],['"figures"',String(info.figures)],['"actions"',String(info.actions)],['"reading_dwell"',`"${info.dwell}s"`],['"session_turns"',String(info.turns)],['"director"',info.director?'"online"':'"off"'],['"owner"','"you"']];
 const x=F.x+F.w*.42,texts=[{key:'cmd',text:'$ neofetch',x:F.x,y:F.y+F.size,size:F.size,color:'accent'}];
 pairs.forEach(([k,v],i)=>texts.push({key:'k'+i,text:k+':',x,y:F.y+F.size*(2+i*1.7),size:F.size,color:'ink',delay:200+i*150},{key:'v'+i,text:v,x:x+F.size*11,y:F.y+F.size*(2+i*1.7),size:F.size,color:'ink',level:.85,delay:280+i*150}));
 const big=Math.round(F.size*2.4);
 texts.push({key:'big',text:'{n} chars observed',count:{to:info.chars},x,y:F.bottom-big*.6,size:big,color:'accent',weight:700,delay:400},{key:'bigsub',text:`${info.turns} turns · ${info.nodes} public events`,x,y:F.bottom-big*.6+F.size*1.6,size:F.size,color:'muted',delay:600});
 return {marks:[],texts};
}
function digit(box,info,d){
 const F=frame(box),size=Math.round(Math.min(F.h*.7,F.w*.3)),step=Math.max(6,Math.round(size/26)),r=box.raster?.(String(d),size,step),marks=[];
 if(r){const ox=(box.w-r.w)/2,oy=(box.h-r.h)/2;r.points.forEach((p,i)=>marks.push({id:'d'+i,shape:'glyph',ch:String(d),x:ox+p.x,y:oy+p.y,w:step,h:step,color:'ink',level:.95,delay:0,from:{x:ox+p.x,y:F.bottom}}));}
 return {marks,texts:[{key:'pop',text:`world.population = 2  (${info.actor}, you)`,x:F.x,y:F.bottom,size:F.size,color:'ink'}]};
}
function run(box,info){
 const F=frame(box),size=Math.round(Math.min(F.h*.32,F.w*.18)),step=Math.max(5,Math.round(size/24)),r=box.raster?.('RUN',size,step),marks=[];
 const ox=F.x+F.w*.18,oy=F.y+F.h*.2;
 if(r)r.points.forEach((p,i)=>marks.push({id:'r'+i,x:ox+p.x,y:oy+p.y,w:step-1,h:step-1,color:'ink',level:1,delay:p.x/3,from:{x:ox+p.x,y:F.bottom}}));
 const ty=oy+(r?r.h:size)+F.size*2.5;
 return {marks,texts:[{key:'s1',text:'stage: running',x:ox,y:ty,size:Math.round(F.size*1.3),color:'ink',delay:300},{key:'s2',text:`director: ${info.director?'1 call / message':'off'}`,x:ox,y:ty+F.size*2.2,size:Math.round(F.size*1.1),color:'ink',level:.8,delay:450}]};
}
// Step timeline in ms; the countdown steps share one key so digits morph.
function introSteps(info){
 return [[0,'protect',b=>protect(b,info)],[2300,'load',b=>load(b,info)],[4100,'object',b=>object(b,info)],[6100,'neofetch',b=>neofetch(b,info)],
  [7900,'3',b=>digit(b,info,3)],[8500,'2',b=>digit(b,info,2)],[9100,'1',b=>digit(b,info,1)],[9700,'run',b=>run(b,info)],[11000,'end',null]];
}
// "Already shown" lives in sessionStorage, claimed the moment a stage decides
// to play: DSH may re-run the plugin (live patch reload) or rebuild the
// conversation view, and neither may replay the opening in the same tab.
const SHOWN='tw:intro-shown';
let shownThisPage=false;
function claimIntro(){
 if(shownThisPage)return false;
 try{if(sessionStorage.getItem(SHOWN))return shownThisPage=true,false;sessionStorage.setItem(SHOWN,String(Date.now()));}catch{}
 shownThisPage=true;return true;
}
function Intro({info,onDone}){
 // React is the host's; required here so the step builders stay testable in Node.
 const {createElement:h,useEffect,useRef,useState}=require('react');
 const canvas=useRef(null),[leaving,setLeaving]=useState(false);
 useEffect(()=>{
  const e=createEngine(canvas.current,{animate:true,motion:'rich'}),timers=[];
  const finish=()=>{setLeaving(true);timers.push(setTimeout(onDone,450));};
  // DSH may still be laying out (a 0-wide frame while it reconnects): the
  // timeline starts only once the stage has a usable size.
  let started=false;
  const start=()=>{
   if(started||!canvas.current)return;
   const r=canvas.current.getBoundingClientRect();if(r.width<320||r.height<200)return;
   started=true;e.resize();
   for(const [at,key,build] of introSteps(info))timers.push(setTimeout(()=>build?e.show(key==='3'||key==='2'||key==='1'?'count'+key:key,build):finish(),at));
  };
  timers.push(setTimeout(()=>{if(!started)finish();},20000));
  const skip=event=>{if(event.type==='keydown'&&['Shift','Control','Alt','Meta'].includes(event.key))return;timers.forEach(clearTimeout);finish();};
  const observer=new ResizeObserver(()=>{e.resize();start();});observer.observe(canvas.current);start();
  document.addEventListener('keydown',skip);
  return()=>{timers.forEach(clearTimeout);observer.disconnect();document.removeEventListener('keydown',skip);e.destroy();};
 },[]);
 return h('div',{className:'tw-intro'+(leaving?' tw-intro-leaving':''),role:'presentation',title:'点击或按任意键跳过',onClick:()=>{setLeaving(true);setTimeout(onDone,450);}},
  h('canvas',{ref:canvas,className:'tw-intro-canvas','aria-hidden':true}),
  h('span',{className:'tw-intro-skip'},'点击或按任意键跳过'));
}
module.exports={Intro,introSteps,claimIntro,protect,load,object,neofetch,digit,run};
