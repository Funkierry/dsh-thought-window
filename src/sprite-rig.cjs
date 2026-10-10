'use strict';
// Vector actors. An actor is described as named parts (body, head, tail, fins,
// wings, arms, legs…) built from simple shapes on a W×H grid. This file
// validates such a rig and rasterizes it to pixel rows at any part pose, so an
// action moves limbs, tails and fins instead of only swapping two drawings.
// Pure: shared by the host (validation) and the browser (drawing).
const ROLES=['body','head','tail','fin','wing_l','wing_r','arm_l','arm_r','leg_l','leg_r','ear','eye','other'];
const LIMIT={min:10,max:48,parts:14,shapes:90,path:7000,colors:10};
const num=(v,d=0)=>typeof v==='number'&&Number.isFinite(v)?v:d;
const clampN=(v,a,b,d=a)=>Math.max(a,Math.min(b,num(v,d)));
const hex=v=>{const t=String(v||'').trim();if(/^#[0-9a-f]{6}$/i.test(t))return t.toLowerCase();if(/^#[0-9a-f]{3}$/i.test(t))return ('#'+[...t.slice(1)].map(c=>c+c).join('')).toLowerCase();return null;};

// ---- SVG path → polygons (absolute and relative M L H V C S Q T Z; A as a line).
function parsePath(d,map=(x,y)=>[x,y]){
 const tokens=String(d||'').slice(0,LIMIT.path).match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/g)||[];
 const polys=[];let poly=null,cmd='M',i=0,x=0,y=0,sx=0,sy=0,cx=0,cy=0,prev='';
 const n=()=>{const v=parseFloat(tokens[i++]);return Number.isFinite(v)?v:0;};
 const push=(px,py)=>{if(!poly){poly=[];polys.push(poly);}poly.push(map(px,py));};
 const curve=(pts,steps=8)=>{for(let k=1;k<=steps;k++){const t=k/steps,u=1-t;let px,py;
  if(pts.length===4){px=u*u*u*pts[0][0]+3*u*u*t*pts[1][0]+3*u*t*t*pts[2][0]+t*t*t*pts[3][0];py=u*u*u*pts[0][1]+3*u*u*t*pts[1][1]+3*u*t*t*pts[2][1]+t*t*t*pts[3][1];}
  else{px=u*u*pts[0][0]+2*u*t*pts[1][0]+t*t*pts[2][0];py=u*u*pts[0][1]+2*u*t*pts[1][1]+t*t*pts[2][1];}
  push(px,py);}};
 let guard=0;
 while(i<tokens.length&&guard++<20000){
  if(/[A-Za-z]/.test(tokens[i]))cmd=tokens[i++];
  const rel=cmd===cmd.toLowerCase(),C=cmd.toUpperCase(),ox=rel?x:0,oy=rel?y:0;
  if(C==='Z'){if(poly&&poly.length)poly=null;x=sx;y=sy;prev='Z';continue;}
  if(i>=tokens.length||/[A-Za-z]/.test(tokens[i])){i++;continue;}
  if(C==='M'){x=ox+n();y=oy+n();sx=x;sy=y;poly=null;push(x,y);cmd=rel?'l':'L';}
  else if(C==='L'){x=ox+n();y=oy+n();push(x,y);}
  else if(C==='H'){x=(rel?x:0)+n();push(x,y);}
  else if(C==='V'){y=(rel?y:0)+n();push(x,y);}
  else if(C==='C'){const a=[ox+n(),oy+n()],b=[ox+n(),oy+n()],e=[ox+n(),oy+n()];curve([[x,y],a,b,e]);cx=b[0];cy=b[1];x=e[0];y=e[1];}
  else if(C==='S'){const a=prev==='C'||prev==='S'?[2*x-cx,2*y-cy]:[x,y],b=[ox+n(),oy+n()],e=[ox+n(),oy+n()];curve([[x,y],a,b,e]);cx=b[0];cy=b[1];x=e[0];y=e[1];}
  else if(C==='Q'){const a=[ox+n(),oy+n()],e=[ox+n(),oy+n()];curve([[x,y],a,e]);cx=a[0];cy=a[1];x=e[0];y=e[1];}
  else if(C==='T'){const a=prev==='Q'||prev==='T'?[2*x-cx,2*y-cy]:[x,y],e=[ox+n(),oy+n()];curve([[x,y],a,e]);cx=a[0];cy=a[1];x=e[0];y=e[1];}
  else if(C==='A'){n();n();n();n();n();x=ox+n();y=oy+n();push(x,y);}
  else{i++;}
  prev=C;
 }
 return polys.filter(p=>p.length>=3);
}
function winding(polys,x,y){
 let w=0;
 for(const poly of polys)for(let k=0;k<poly.length;k++){
  const [x1,y1]=poly[k],[x2,y2]=poly[(k+1)%poly.length];
  if(y1<=y){if(y2>y&&(x2-x1)*(y-y1)-(x-x1)*(y2-y1)>0)w++;}
  else if(y2<=y&&(x2-x1)*(y-y1)-(x-x1)*(y2-y1)<0)w--;
 }
 return w;
}
const evenOdd=(polys,x,y)=>{let inside=false;for(const poly of polys)for(let k=0,j=poly.length-1;k<poly.length;j=k++){const [xi,yi]=poly[k],[xj,yj]=poly[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;}return inside;};
const bboxOf=pts=>{let a=Infinity,b=Infinity,c=-Infinity,d=-Infinity;for(const [x,y] of pts){a=Math.min(a,x);b=Math.min(b,y);c=Math.max(c,x);d=Math.max(d,y);}return [a,b,c,d];};

// ---- Shapes. Each compiles to {c, box:[x0,y0,x1,y1], hit(x,y)}.
function shape(raw,colors,w,h){
 if(!raw||typeof raw!=='object')return null;
 const c=typeof raw.c==='string'&&colors[raw.c]?raw.c:null;
 if(!c)return null;
 const lim=v=>clampN(v,-w*2,w*3);
 let out=null;
 const arr=(v,n)=>Array.isArray(v)&&v.length>=n&&v.slice(0,n).every(x=>typeof x==='number'&&Number.isFinite(x))?v.map(lim):null;
 if(arr(raw.rect,4)){const [x,y,rw,rh]=arr(raw.rect,4);out={box:[x,y,x+Math.abs(rw),y+Math.abs(rh)],hit:(px,py)=>px>=x&&px<x+Math.abs(rw)&&py>=y&&py<y+Math.abs(rh)};}
 else if(arr(raw.circle,3)){const [x,y,r]=arr(raw.circle,3),rr=Math.abs(r);out={box:[x-rr,y-rr,x+rr,y+rr],hit:(px,py)=>(px-x)**2+(py-y)**2<=rr*rr};}
 else if(arr(raw.ellipse,4)){
  const e=arr(raw.ellipse,4),[x,y]=e,rx=Math.abs(e[2])||.5,ry=Math.abs(e[3])||.5,a=num(raw.ellipse[4])*Math.PI/180,co=Math.cos(a),si=Math.sin(a),m=Math.max(rx,ry);
  out={box:[x-m,y-m,x+m,y+m],hit:(px,py)=>{const dx=px-x,dy=py-y,u=dx*co+dy*si,v=-dx*si+dy*co;return (u/rx)**2+(v/ry)**2<=1;}};
 }
 else if(Array.isArray(raw.poly)&&raw.poly.length>=6){
  const flat=raw.poly.slice(0,80).map(lim),pts=[];for(let k=0;k+1<flat.length;k+=2)pts.push([flat[k],flat[k+1]]);
  out={box:bboxOf(pts),hit:(px,py)=>winding([pts],px,py)!==0};
 }
 else if(arr(raw.line,4)){
  const [x1,y1,x2,y2]=arr(raw.line,4),r=clampN(raw.line[4],.5,8,1)/2,L=(x2-x1)**2+(y2-y1)**2||1e-9;
  out={box:[Math.min(x1,x2)-r,Math.min(y1,y2)-r,Math.max(x1,x2)+r,Math.max(y1,y2)+r],hit:(px,py)=>{const t=Math.max(0,Math.min(1,((px-x1)*(x2-x1)+(py-y1)*(y2-y1))/L));return (px-x1-t*(x2-x1))**2+(py-y1-t*(y2-y1))**2<=r*r;}};
 }
 else if(typeof raw.path==='string'){
  // Optional mapping of the path's own coordinates: vb [x,y,w,h] → to [x,y,w,h].
  const vb=arr(raw.vb,4),to=arr(raw.to,4);
  const map=vb&&to&&vb[2]&&vb[3]?(x,y)=>[to[0]+(x-vb[0])*to[2]/vb[2],to[1]+(y-vb[1])*to[3]/vb[3]]:(x,y)=>[x,y];
  let polys=parsePath(raw.path,map);
  if(raw.rule==='outer')polys=polys.slice(0,1);
  if(!polys.length)return null;
  const rule=raw.rule==='evenodd'?(px,py)=>evenOdd(polys,px,py):(px,py)=>winding(polys,px,py)!==0;
  out={box:bboxOf(polys.flat()),hit:rule};
 }
 if(!out)return null;
 // A clip rectangle keeps part of a shape (one path split into body and tail).
 const clip=arr(raw.clip,4);
 if(clip){const [x,y,cw,ch]=clip,hit=out.hit;out.hit=(px,py)=>px>=x&&px<x+cw&&py>=y&&py<y+ch&&hit(px,py);out.box=[Math.max(out.box[0],x),Math.max(out.box[1],y),Math.min(out.box[2],x+cw),Math.min(out.box[3],y+ch)];}
 return {c,...out,raw};
}

// ---- Rig validation. Returns {w,h,palette,outline,facing,view,parts} or null.
function compileRig(raw){
 if(!raw||typeof raw!=='object'||!Array.isArray(raw.parts))return null;
 const size=Array.isArray(raw.size)?raw.size:[raw.w,raw.h];
 const w=Math.round(clampN(size[0],LIMIT.min,LIMIT.max,32)),h=Math.round(clampN(size[1],LIMIT.min,LIMIT.max,32));
 const palette={};
 for(const [k,v] of Object.entries(raw.palette||{}).slice(0,LIMIT.colors)){const c=hex(v);if(/^[a-z]$/i.test(k)&&c)palette[k]=c;}
 if(!Object.keys(palette).length)return null;
 let total=0;
 const parts=raw.parts.slice(0,LIMIT.parts).map((p,i)=>{
  if(!p||typeof p!=='object'||!Array.isArray(p.shapes))return null;
  const shapes=[];
  for(const s of p.shapes){if(total>=LIMIT.shapes)break;const c=shape(s,palette,w,h);if(c){shapes.push(c);total++;}}
  if(!shapes.length)return null;
  const role=ROLES.includes(p.role)?p.role:'other';
  const pivot=Array.isArray(p.pivot)?[clampN(p.pivot[0],-w,w*2,w/2),clampN(p.pivot[1],-h,h*2,h/2)]:[w/2,h/2];
  return {role,pivot,z:clampN(p.z,-9,9,0),order:i,shapes};
 }).filter(Boolean).sort((a,b)=>a.z-b.z||a.order-b.order);
 if(!parts.length)return null;
 const outline=typeof raw.outline==='string'&&palette[raw.outline]?raw.outline:null;
 return {w,h,palette,outline,facing:raw.facing==='left'?'left':'right',view:raw.view==='side'?'side':'front',parts};
}
// The JSON form of a compiled rig (what is stored and sent back to the model).
function rigJson(rig){
 return {size:[rig.w,rig.h],palette:rig.palette,outline:rig.outline,facing:rig.facing,view:rig.view,
  parts:rig.parts.map(p=>({role:p.role,pivot:p.pivot,z:p.z,shapes:p.shapes.map(s=>s.raw)}))};
}

// ---- Rasterization. 3×3 samples per cell; the topmost colour that covers at
// least a third of the cell wins (so eyes and stripes survive), else the
// majority. An outline colour, when set, rings the drawing one cell outside.
function rasterize(rig,angles=[]){
 const pad=rig.outline?1:0,W=rig.w+pad*2,H=rig.h+pad*2,grid=[];
 const parts=rig.parts.map((p,i)=>{const a=-(angles[i]||0)*Math.PI/180;return {p,co:Math.cos(a),si:Math.sin(a),rad:a};});
 const sample=(x,y)=>{
  for(let k=parts.length-1;k>=0;k--){
   const {p,co,si}=parts[k],dx=x-p.pivot[0],dy=y-p.pivot[1],px=p.pivot[0]+dx*co-dy*si,py=p.pivot[1]+dx*si+dy*co;
   for(let j=p.shapes.length-1;j>=0;j--){const s=p.shapes[j];if(px<s.box[0]||px>s.box[2]||py<s.box[1]||py>s.box[3])continue;if(s.hit(px,py))return {c:s.c,o:k*1000+j};}
  }
  return null;
 };
 for(let y=0;y<H;y++){
  let row='';
  for(let x=0;x<W;x++){
   const hits=[];
   for(let j=0;j<3;j++)for(let i=0;i<3;i++){const s=sample(x-pad+(i+.5)/3,y-pad+(j+.5)/3);if(s)hits.push(s);}
   if(!hits.length){row+='.';continue;}
   const by=new Map();for(const s of hits){const e=by.get(s.c)||{n:0,o:-1};e.n++;e.o=Math.max(e.o,s.o);by.set(s.c,e);}
   const list=[...by].sort((a,b)=>b[1].o-a[1].o);
   const top=list.find(([,e])=>e.n>=3);
   if(top)row+=top[0];
   else if(hits.length>=5)row+=list.sort((a,b)=>b[1].n-a[1].n)[0][0];
   else row+='.';
  }
  grid.push(row);
 }
 if(pad){
  const out=grid.map(r=>[...r]);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(grid[y][x]==='.'&&[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>{const c=grid[y+dy]?.[x+dx];return c&&c!=='.'&&c!==rig.outline;}))out[y][x]=rig.outline;
  return out.map(r=>r.join(''));
 }
 return grid;
}

// ---- Part animation. Angles (degrees, clockwise) per role for each action:
// [amplitude, phase offset, base]. Paired roles alternate by half a cycle; in a
// front view the left side mirrors the right.
const ANIM={
 idle:{tail:[8],fin:[8,.5],ear:[4,.25],wing:[4]},
 think:{head:[4,0,8],tail:[6],fin:[5],ear:[3]},
 type:{arm:[14,0,-12],tail:[6],fin:[6]},
 nod:{head:[10,0,6],tail:[6],ear:[5]},
 wave:{arm_r:[28,0,-125],wing_r:[30,0,-35],fin:[22],tail:[14],ear:[6]},
 dance:{arm:[38,0,-60],leg:[18],head:[10],tail:[26],wing:[32],fin:[26],ear:[10]},
 jump:{arm:[16,0,-135],wing:[36],leg:[12],tail:[20],fin:[20]},
 happy:{arm:[18,0,-120],wing:[30],tail:[24],fin:[22],ear:[10],head:[6]},
 cheer:{arm:[22,0,-150],wing:[40],tail:[24],fin:[24],leg:[10]},
 hop:{leg:[20],arm:[16,0,-40],tail:[18],fin:[16],wing:[20],ear:[10]},
 bounce:{leg:[16],arm:[20,0,-90],tail:[20],fin:[18],wing:[24],ear:[12]},
 spin:{arm:[12,0,-70],tail:[16],fin:[14],wing:[16]},
 roll:{tail:[14],fin:[12],arm:[10,0,-30],leg:[10]},
 flip:{arm:[10,0,-150],leg:[14],tail:[18],fin:[16],wing:[24]},
 shake:{arm:[10,0,-110],ear:[16],tail:[28],fin:[20],head:[8]},
 surprised:{arm:[12,0,-140],ear:[14],tail:[20],wing:[26]},
 sleep:{tail:[3],head:[2,0,14],ear:[2,0,10]},
 sad:{head:[3,0,16],arm:[3,0,12],tail:[3,0,18],ear:[3,0,22],fin:[3,0,10]},
 walk:{leg:[22],arm:[18],tail:[12],head:[3],fin:[10],wing:[6],ear:[5]},
 run:{leg:[36],arm:[30],tail:[18],head:[4],fin:[16],wing:[10],ear:[8]},
 crawl:{leg:[14],arm:[18,0,-20],tail:[10],fin:[10]},
 swim:{tail:[26],fin:[20,.25],wing:[22],arm:[32],leg:[22],ear:[5]},
 dive:{tail:[22],fin:[16,.25],arm:[10,0,-150],leg:[10]},
 fly:{wing:[42],arm:[40,0,-60],fin:[26],tail:[12],leg:[8,0,-15]},
 hover:{wing:[30],fin:[16],tail:[10],arm:[12,0,-35]},
 grow:{arm:[20,0,-90],wing:[20],fin:[16],tail:[14]},
 explode:{arm:[30,0,-90],leg:[20],tail:[30],fin:[30],wing:[30]},
 sing:{head:[8],arm_r:[16,0,-70],tail:[12],fin:[12],wing:[14]},
 eat:{head:[12,0,8],tail:[10],fin:[10]},
 bow:{head:[5,0,22],arm:[5,0,18],tail:[6]}
};
const ACTION_NAMES=Object.keys(ANIM);
function roleSpec(table,role){
 if(table[role])return {spec:table[role],alt:0,mirror:false};
 const m=/^(arm|leg|wing)_([lr])$/.exec(role);
 if(m&&table[m[1]])return {spec:table[m[1]],alt:m[2]==='l'?.5:0,mirror:m[2]==='l'};
 return null;
}
// Angles for every part at phase u (0..1). `custom` is a move's part table:
// {role:[from,to]} oscillating between the two angles.
function partAngles(rig,action,u,custom=null){
 const table=ANIM[action]||ANIM.idle,TAU=Math.PI*2;
 return rig.parts.map(p=>{
  const own=custom&&(custom[p.role]||custom[p.role.replace(/_[lr]$/,'')]);
  if(Array.isArray(own)&&own.length>=2){
   const [a,b]=own.map(v=>clampN(v,-180,180,0)),mid=(a+b)/2,half=(b-a)/2,left=/_l$/.test(p.role)&&!custom[p.role];
   const v=mid+half*Math.sin(TAU*(u+(left?.5:0)));
   return left&&rig.view==='front'?-v:v;
  }
  const r=roleSpec(table,p.role);if(!r)return 0;
  const [amp=0,off=0,base=0]=r.spec,v=base+amp*Math.sin(TAU*(u+off+r.alt));
  return r.mirror&&rig.view==='front'?-v:v;
 });
}
const cache=new WeakMap();
// Pixel frames of one action: `count` evenly spaced phases of its cycle.
function framesFor(rig,action='idle',count=4,custom=null){
 let byAction=cache.get(rig);if(!byAction){byAction=new Map();cache.set(rig,byAction);}
 const key=action+'|'+count+'|'+(custom?JSON.stringify(custom):'');
 if(!byAction.has(key)){
  if(byAction.size>40)byAction.clear();
  byAction.set(key,Array.from({length:count},(_,k)=>rasterize(rig,partAngles(rig,action,k/count,custom))));
 }
 return byAction.get(key);
}
module.exports={ROLES,ACTION_NAMES,ANIM,parsePath,compileRig,rigJson,rasterize,partAngles,framesFor,hex};
