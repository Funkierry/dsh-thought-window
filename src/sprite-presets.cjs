'use strict';
// Built-in cast, drawn as vector rigs (see sprite-rig.cjs). The director picks
// one by id when the user's subject matches, optionally recolouring it through
// the palette keys listed in PRESET_KEYS. The whale is DeepSeek's own mark: its
// outline is read at runtime from the host's favicon (never copied here); a
// hand-drawn whale of the same pose stands in when that is unavailable.
const {compileRig,rasterize,hex}=require('./sprite-rig.cjs');

const P=(palette,outline,parts,extra={})=>({palette,outline,parts,...extra});
const S={
 fish:P({o:'#ff8c42',y:'#ffd166',s:'#e85d04',w:'#ffffff',e:'#1b1430',k:'#2b1d3a'},'k',[
  {role:'tail',pivot:[9,11],z:-1,shapes:[{poly:[10,11,1,2.5,3.5,11,1,19.5],c:'s'}]},
  {role:'fin',pivot:[16,5],z:-1,shapes:[{poly:[11,5.5,15,0.5,22,5],c:'s'}]},
  {role:'body',pivot:[17,11],shapes:[{ellipse:[18,11,10,7.2],c:'o'},{ellipse:[19,13.8,7.5,3.4],c:'y'},{ellipse:[13.5,11,1.1,6],c:'s'},{ellipse:[17.5,11,1.1,6.6],c:'s'},{circle:[23.5,9,1.8],c:'w'},{circle:[24,9,0.95],c:'e'}]},
  {role:'fin',pivot:[17,12.5],z:2,shapes:[{poly:[16,12.5,21,16.5,15,16],c:'s'}]}
 ],{size:[30,22],facing:'right',view:'side'}),
 cat:P({o:'#f4a259',d:'#c46d2b',w:'#fff3e0',p:'#ff8fab',e:'#2d1e2f',k:'#2d1e2f'},'k',[
  {role:'tail',pivot:[7,14],z:-2,shapes:[{line:[7.5,14.5,3,9,2.4],c:'o'},{line:[3,9,4.5,3,2.4],c:'o'},{circle:[4.5,3,1.3],c:'d'}]},
  {role:'leg_r',pivot:[10,18],z:-1,shapes:[{rect:[8.6,17,2.8,7],c:'d'}]},
  {role:'leg_l',pivot:[23,18],z:-1,shapes:[{rect:[21.6,17,2.8,7],c:'d'}]},
  {role:'body',pivot:[17,16],shapes:[{ellipse:[16.5,16,10,5.6],c:'o'},{ellipse:[17.5,18.6,7,2.4],c:'w'},{ellipse:[13,11.6,1,2.6],c:'d'},{ellipse:[17,11.2,1,2.8],c:'d'}]},
  {role:'leg_l',pivot:[12,18],z:1,shapes:[{rect:[10.6,17,2.8,7],c:'o'},{rect:[10.4,23,3.2,1.2],c:'w'}]},
  {role:'leg_r',pivot:[25,18],z:1,shapes:[{rect:[23.6,17,2.8,7],c:'o'},{rect:[23.4,23,3.2,1.2],c:'w'}]},
  {role:'head',pivot:[25,13],z:2,shapes:[{poly:[22.5,7,23,1.5,27,5],c:'o'},{poly:[28,5,31.5,1.5,32,7],c:'o'},{poly:[23.4,6,23.7,3.2,25.8,5],c:'p'},{poly:[29.2,5,31,3.2,31.2,6],c:'p'},{circle:[27.5,9.5,5.4],c:'o'},{ellipse:[30.5,11.8,2.4,1.7],c:'w'},{circle:[29.5,8.5,0.95],c:'e'},{circle:[32.4,11,0.75],c:'p'}]}
 ],{size:[34,25],facing:'right',view:'side'}),
 dog:P({b:'#c68642',d:'#8b5a2b',w:'#fff1dc',e:'#231815',n:'#231815',k:'#2a1a12'},'k',[
  {role:'tail',pivot:[7,13],z:-2,shapes:[{line:[7.5,13.5,3,8,2.6],c:'b'},{circle:[3,8,1.4],c:'w'}]},
  {role:'leg_r',pivot:[10,19],z:-1,shapes:[{rect:[8.5,18,3,7],c:'d'}]},
  {role:'leg_l',pivot:[23,19],z:-1,shapes:[{rect:[21.5,18,3,7],c:'d'}]},
  {role:'body',pivot:[17,16],shapes:[{ellipse:[16.5,16.5,10.5,6],c:'b'},{ellipse:[18,19.5,7,2.4],c:'w'},{ellipse:[12,13.5,3.5,2.5],c:'d'}]},
  {role:'leg_l',pivot:[12,19],z:1,shapes:[{rect:[10.5,18,3,7],c:'b'},{rect:[10.3,24,3.4,1.2],c:'w'}]},
  {role:'leg_r',pivot:[25,19],z:1,shapes:[{rect:[23.5,18,3,7],c:'b'},{rect:[23.3,24,3.4,1.2],c:'w'}]},
  {role:'head',pivot:[25,13],z:2,shapes:[{circle:[27,9,5.2],c:'b'},{ellipse:[32,11,3.6,2.4],c:'w'},{circle:[35,10.4,1.1],c:'n'},{circle:[28.5,7.5,0.95],c:'e'}]},
  {role:'ear',pivot:[24.5,6],z:3,shapes:[{ellipse:[24,9,2,4.2,15],c:'d'}]}
 ],{size:[37,26],facing:'right',view:'side'}),
 bird:P({b:'#4d9de0',d:'#2e6fae',y:'#ffe08a',o:'#ff9f1c',e:'#1b1b2f',w:'#ffffff',k:'#1b2a44'},'k',[
  {role:'tail',pivot:[7,16],z:-1,shapes:[{poly:[8,14,0.5,10.5,1.5,17.5,8,18.5],c:'d'}]},
  {role:'leg_l',pivot:[13,20],z:-1,shapes:[{line:[13,20,12,25,1.2],c:'o'},{line:[11,25,13.5,25,1],c:'o'}]},
  {role:'leg_r',pivot:[16,20],z:-1,shapes:[{line:[16,20,17,25,1.2],c:'o'},{line:[16,25,18.5,25,1],c:'o'}]},
  {role:'body',pivot:[14,15],shapes:[{ellipse:[14,15,8,6],c:'b'},{ellipse:[15.5,17.5,5.5,3.4],c:'y'}]},
  {role:'head',pivot:[20,12],z:1,shapes:[{circle:[21,9,5],c:'b'},{poly:[25.3,7.6,30,9.4,25.3,11.2],c:'o'},{circle:[23,7.5,1.4],c:'w'},{circle:[23.5,7.5,0.85],c:'e'}]},
  {role:'wing_r',pivot:[12,13],z:2,shapes:[{ellipse:[11,15.5,6,3.6,-18],c:'d'}]}
 ],{size:[30,26],facing:'right',view:'side'}),
 rabbit:P({w:'#f8f8ff',g:'#d6d9ea',p:'#ffb3c6',e:'#2b2440',k:'#3a3550'},'k',[
  {role:'ear',pivot:[11,12],z:-1,shapes:[{ellipse:[10,6.5,2.6,6.8,-8],c:'w'},{ellipse:[10,7,1.2,4.8,-8],c:'p'}]},
  {role:'ear',pivot:[17,12],z:-1,shapes:[{ellipse:[18,6.5,2.6,6.8,8],c:'w'},{ellipse:[18,7,1.2,4.8,8],c:'p'}]},
  {role:'leg_l',pivot:[11,31],z:-1,shapes:[{ellipse:[10,33,3.2,1.8],c:'w'}]},
  {role:'leg_r',pivot:[17,31],z:-1,shapes:[{ellipse:[18,33,3.2,1.8],c:'w'}]},
  {role:'body',pivot:[14,27],shapes:[{ellipse:[14,27,6.8,6.2],c:'w'},{ellipse:[14,28.5,4,4],c:'g'}]},
  {role:'arm_l',pivot:[9,24],z:1,shapes:[{ellipse:[8.6,27,1.8,3.4],c:'w'}]},
  {role:'arm_r',pivot:[19,24],z:1,shapes:[{ellipse:[19.4,27,1.8,3.4],c:'w'}]},
  {role:'head',pivot:[14,21],z:2,shapes:[{circle:[14,16.5,7],c:'w'},{rect:[11,14.6,1,2],c:'e'},{rect:[16,14.6,1,2],c:'e'},{circle:[14,18.5,0.85],c:'p'},{circle:[9.6,18.6,1.1],c:'p'},{circle:[18.4,18.6,1.1],c:'p'}]}
 ],{size:[28,36],facing:'right',view:'front'}),
 robot:P({g:'#8fa3c7',l:'#d7e1f5',d:'#5a6b8c',y:'#fff36b',r:'#e04f5f',k:'#1b1f3b'},'k',[
  {role:'leg_l',pivot:[11,26],z:-1,shapes:[{rect:[9,26,4,7],c:'d'},{rect:[8,32,6,2],c:'k'}]},
  {role:'leg_r',pivot:[19,26],z:-1,shapes:[{rect:[17,26,4,7],c:'d'},{rect:[16,32,6,2],c:'k'}]},
  {role:'arm_l',pivot:[6.5,16.5],z:-1,shapes:[{rect:[3,16,3.6,9],c:'g'},{circle:[4.8,26,1.8],c:'d'}]},
  {role:'arm_r',pivot:[23.5,16.5],z:-1,shapes:[{rect:[23.4,16,3.6,9],c:'g'},{circle:[25.2,26,1.8],c:'d'}]},
  {role:'body',pivot:[15,20],shapes:[{rect:[7,15,16,11],c:'g'},{rect:[10.5,17.5,9,6],c:'l'},{circle:[15,20.5,1.4],c:'r'}]},
  {role:'head',pivot:[15,14],z:1,shapes:[{line:[15,4,15,1.5,1],c:'d'},{circle:[15,1.5,1.3],c:'r'},{rect:[8,4,14,10],c:'g'},{rect:[10,6,10,6],c:'l'},{rect:[11,7.5,2.2,2.2],c:'y'},{rect:[16.8,7.5,2.2,2.2],c:'y'},{rect:[12.5,10.6,5,1],c:'k'}]}
 ],{size:[30,35],facing:'right',view:'front'}),
 person:P({s:'#ffd7b5',h:'#3b2a20',c:'#4d6bfe',j:'#2b3a67',m:'#c0566b',e:'#1d1d2b',k:'#1d1d2b'},'k',[
  {role:'leg_l',pivot:[11,26],z:-1,shapes:[{rect:[8.6,26,4,10.5],c:'j'},{rect:[8,36,5,2],c:'e'}]},
  {role:'leg_r',pivot:[15,26],z:-1,shapes:[{rect:[13.4,26,4,10.5],c:'j'},{rect:[13,36,5,2],c:'e'}]},
  {role:'arm_l',pivot:[8,15.5],z:1,shapes:[{rect:[5,14.8,3,9.5],c:'c'},{circle:[6.5,25.4,1.6],c:'s'}]},
  {role:'arm_r',pivot:[18,15.5],z:1,shapes:[{rect:[18,14.8,3,9.5],c:'c'},{circle:[19.5,25.4,1.6],c:'s'}]},
  {role:'body',pivot:[13,20],shapes:[{rect:[8,14,10,12.5],c:'c'},{rect:[11.5,14,3,2],c:'s'}]},
  {role:'head',pivot:[13,13.5],z:2,shapes:[{circle:[13,8,5.4],c:'s'},{ellipse:[13,3.8,6,2.9],c:'h'},{rect:[7.3,3.8,2,4.4],c:'h'},{rect:[16.7,3.8,2,4.4],c:'h'},{circle:[10.5,8.5,0.85],c:'e'},{circle:[15.5,8.5,0.85],c:'e'},{line:[12,11.5,14,11.5,0.9],c:'m'}]}
 ],{size:[26,39],facing:'right',view:'front'}),
 ghost:P({w:'#eef2ff',g:'#c5cdf0',e:'#1c1a33',p:'#ffb3c6',k:'#3d3a66'},'k',[
  {role:'arm_l',pivot:[5,14],z:-1,shapes:[{ellipse:[3.2,15.5,2.6,1.6,-30],c:'w'}]},
  {role:'arm_r',pivot:[21,14],z:-1,shapes:[{ellipse:[22.8,15.5,2.6,1.6,30],c:'w'}]},
  {role:'body',pivot:[13,14],shapes:[{circle:[13,11,9],c:'w'},{rect:[4,11,18,13],c:'w'},{circle:[6.2,24,2.2],c:'w'},{circle:[10.7,24.6,2.2],c:'w'},{circle:[15.3,24,2.2],c:'w'},{circle:[19.8,24.6,2.2],c:'w'},{ellipse:[17,6,2,1.2,-30],c:'g'},{ellipse:[10,11,1.3,2],c:'e'},{ellipse:[16,11,1.3,2],c:'e'},{ellipse:[13,15.6,1.4,1.9],c:'e'},{circle:[7.5,14.4,1.1],c:'p'},{circle:[18.5,14.4,1.1],c:'p'}]}
 ],{size:[26,28],facing:'right',view:'front'}),
 octopus:P({p:'#ff6b9a',d:'#d94a7a',l:'#ffc2d6',w:'#ffffff',e:'#2a1530',k:'#3b1530'},'k',[
  {role:'leg_l',pivot:[8,17],z:-1,shapes:[{line:[8,17,5,24,3],c:'d'},{circle:[5,25,1.6],c:'d'}]},
  {role:'leg_r',pivot:[12.5,18],z:-1,shapes:[{line:[12.5,18,11.5,26,3],c:'p'},{circle:[11.5,27,1.6],c:'p'}]},
  {role:'leg_l',pivot:[17.5,18],z:-1,shapes:[{line:[17.5,18,18.5,26,3],c:'p'},{circle:[18.5,27,1.6],c:'p'}]},
  {role:'leg_r',pivot:[22,17],z:-1,shapes:[{line:[22,17,25,24,3],c:'d'},{circle:[25,25,1.6],c:'d'}]},
  {role:'body',pivot:[15,12],shapes:[{ellipse:[15,10.5,9.5,8.5],c:'p'},{circle:[11,5.5,1.3],c:'l'},{circle:[19,4.5,0.9],c:'l'},{circle:[11.5,11,1.8],c:'w'},{circle:[18.5,11,1.8],c:'w'},{circle:[11.8,11.2,0.95],c:'e'},{circle:[18.8,11.2,0.95],c:'e'},{ellipse:[15,15.2,1.6,1],c:'d'}]}
 ],{size:[30,29],facing:'right',view:'front'}),
 rocket:P({w:'#eef2ff',g:'#b8c2dc',r:'#e04f5f',b:'#4d6bfe',l:'#b9c8ff',o:'#ff9f1c',y:'#ffe08a',k:'#1d2340'},'k',[
  {role:'tail',pivot:[11,28],z:-2,shapes:[{poly:[7.5,28,11,36,14.5,28],c:'o'},{poly:[9.2,28,11,32.5,12.8,28],c:'y'}]},
  {role:'fin',pivot:[6,22],z:-1,shapes:[{poly:[6,19,1,28,6,26.5],c:'r'}]},
  {role:'fin',pivot:[16,22],z:-1,shapes:[{poly:[16,19,21,28,16,26.5],c:'r'}]},
  {role:'body',pivot:[11,15],shapes:[{ellipse:[11,15.5,5.6,13],c:'w'},{rect:[5,24,12,4.5],c:'g'},{ellipse:[11,4.5,3.4,4.5],c:'r'},{circle:[11,13,2.8],c:'b'},{circle:[10.2,12.2,1],c:'l'}]}
 ],{size:[22,36],facing:'right',view:'front'}),
 eggplant:P({p:'#6b2fa0',l:'#9a5fd0',g:'#3f8a3a',d:'#2c6b2a',w:'#ffffff',e:'#1d0f2b',k:'#2a1035'},'k',[
  {role:'arm_l',pivot:[5.5,18],z:-1,shapes:[{line:[5.5,18,1.5,22.5,1.6],c:'p'}]},
  {role:'arm_r',pivot:[18.5,18],z:-1,shapes:[{line:[18.5,18,22.5,22.5,1.6],c:'p'}]},
  {role:'leg_l',pivot:[9,29],z:-1,shapes:[{line:[9,29,8,33,1.6],c:'p'},{line:[6.5,33,9,33,1.2],c:'p'}]},
  {role:'leg_r',pivot:[15,29],z:-1,shapes:[{line:[15,29,16,33,1.6],c:'p'},{line:[15,33,17.5,33,1.2],c:'p'}]},
  {role:'body',pivot:[12,19],shapes:[{ellipse:[12,19.5,7.4,10.5,-8],c:'p'},{ellipse:[8.6,16,1.4,4,-8],c:'l'},{circle:[10,18.5,1.4],c:'w'},{circle:[14.5,18.5,1.4],c:'w'},{circle:[10.5,18.5,0.85],c:'e'},{circle:[14.5,18.5,0.85],c:'e'},{line:[11,22,13.6,22,0.9],c:'e'}]},
  {role:'head',pivot:[12,9.5],z:1,shapes:[{rect:[11.2,1.5,2.2,6],c:'d'},{poly:[5.5,10.5,8.5,6.5,12,9,15.5,6.5,18.5,10.5,12,12],c:'g'}]}
 ],{size:[24,34],facing:'right',view:'front'})
};
// The whale: DeepSeek's mark (50×50 favicon path), split into body and tail so
// the tail can beat. Holes in the mark show the light belly colour.
const WHALE_VB=[0,6.5,50,37.5],WHALE_TO=[0,0,40,30];
function whaleFromPath(d){
 const at={vb:WHALE_VB,to:WHALE_TO};
 return P({b:'#4d6bfe',l:'#c9d6ff',w:'#ffffff',k:'#16245e'},'k',[
  {role:'tail',pivot:[29.6,11],z:-1,shapes:[{path:d,...at,rule:'outer',clip:[26.4,-2,20,13.2],c:'b'}]},
  {role:'body',pivot:[18,18],shapes:[{path:d,...at,rule:'outer',clip:[-2,-2,28.4,40],c:'l'},{path:d,...at,rule:'outer',clip:[26.4,11.2,20,30],c:'l'},
   {path:d,...at,clip:[-2,-2,28.4,40],c:'b'},{path:d,...at,clip:[26.4,11.2,20,30],c:'b'},{circle:[21.6,14.5,1.1],c:'w'}]}
 ],{size:[40,30],facing:'left',view:'side'});
}
// Hand-drawn whale in the same pose, for when the host mark cannot be read.
const WHALE_FALLBACK=P({b:'#4d6bfe',l:'#c9d6ff',w:'#ffffff',k:'#16245e'},'k',[
 {role:'tail',pivot:[29,11],z:-1,shapes:[{poly:[27,12,29.5,4,28,0.8,31.5,3.5,34,7.5,39,3,38,7.5,34.5,11,31,14],c:'b'}]},
 {role:'body',pivot:[18,18],shapes:[{ellipse:[16,17.5,15.5,11.5],c:'b'},{poly:[24,25,29,28.5,31,26,27,22],c:'b'},{path:'M3.5 11 C10 11 16 14 20 19 C23 23 25 26 27 27.5 C22 29.5 15 28 11 25.5 C7 23 4 18 3.5 11 Z',c:'l'},{circle:[21.6,14.5,1.1],c:'w'}]}
],{size:[40,30],facing:'left',view:'side'});

// The host's mark is used only when it draws a whale-sized figure on the grid.
const usable=new Map();
function markUsable(d){
 if(!usable.has(d)){const rig=compileRig(whaleFromPath(d)),rows=rig?rasterize(rig):[],cells=rows.join('').replace(/\./g,'').length;usable.set(d,cells>=500);}
 return usable.get(d);
}
const PRESETS=Object.keys(S).concat('whale');
// Recolourable keys per preset, as told to the director.
const PRESET_KEYS={whale:'b=body,l=belly',fish:'o=body,y=belly,s=fins/stripes',cat:'o=fur,d=stripes,w=belly',dog:'b=fur,d=patches,w=belly',bird:'b=feathers,d=wing,y=belly,o=beak',rabbit:'w=fur,p=pink,g=belly',robot:'g=metal,d=dark metal,l=panel,y=eyes,r=light',person:'s=skin,h=hair,c=shirt,j=trousers',ghost:'w=body,g=shade',octopus:'p=body,d=back legs,l=spots',rocket:'w=hull,r=nose/fins,b=window',eggplant:'p=skin,l=shine,g=leaves'};
const raws=new Map();
// A compiled rig for a preset with optional colour overrides; `mark` is the
// DeepSeek path when the host provided it.
function presetRig(id,overrides={},mark=null){
 if(!PRESETS.includes(id))return null;
 const base=id==='whale'?(mark&&markUsable(mark)?whaleFromPath(mark):WHALE_FALLBACK):S[id];
 const palette={...base.palette};
 for(const [k,v] of Object.entries(overrides||{}))if(palette[k]&&k!==base.outline){const c=hex(v);if(c)palette[k]=c;}
 const key=id+'|'+JSON.stringify(palette)+'|'+(id==='whale'&&mark?mark.length:0);
 if(!raws.has(key)){if(raws.size>30)raws.clear();raws.set(key,compileRig({...base,palette}));}
 return raws.get(key);
}
module.exports={PRESETS,PRESET_KEYS,presetRig,whaleFromPath,WHALE_FALLBACK};
