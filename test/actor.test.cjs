'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {parsePath,compileRig,rigJson,rasterize,framesFor,partAngles,ACTION_NAMES}=require('../src/sprite-rig.cjs');
const {PRESETS,presetRig,whaleFromPath}=require('../src/sprite-presets.cjs');
const {normalizeScript,normalizeRig,parseRig,SYSTEM_PROMPT,SPRITE_PROMPT,ENVS}=require('../src/director-script.cjs');
const {buildActorScene,lookOf,framesOfLook,WHALE}=require('../src/stage-actor.cjs');
const {pose}=require('../src/stage-engine.cjs');

const filled=rows=>rows.join('').replace(/\./g,'').length;

test('SVG paths flatten to polygons, absolute and relative, and holes stay holes',()=>{
 const polys=parsePath('M0 0 L10 0 L10 10 L0 10 Z m2 2 v6 h6 v-6 z');
 assert.equal(polys.length,2);
 assert.deepEqual(polys[1][0],[2,2]);
 const rig=compileRig({size:[12,12],palette:{a:'#ff0000'},parts:[{role:'body',shapes:[{path:'M0 0 L12 0 L12 12 L0 12 Z M3 3 L3 9 L9 9 L9 3 Z',c:'a'}]}]});
 const rows=rasterize(rig);
 assert.equal(rows[0][0],'a');assert.equal(rows[6][6],'.','the counter-wound square is a hole');
 const curve=parsePath('M0 0 C 5 10 10 10 15 0 Q 20 -5 25 0 T 30 0 S 40 5 45 0');
 assert.ok(curve[0].length>20,'curves are sampled');
});

test('rigs are validated: bad colours, shapes and sizes are dropped or clamped',()=>{
 assert.equal(compileRig(null),null);
 assert.equal(compileRig({palette:{a:'red'},parts:[{shapes:[{rect:[0,0,4,4],c:'a'}]}]}),null,'no usable colour');
 const rig=compileRig({size:[999,3],palette:{a:'#abc','.':'#000000',bad:'#000'},parts:[{role:'wing_q',pivot:['x',2],shapes:[{rect:[0,0,4,4],c:'a'},{circle:[1,1],c:'a'},{rect:[0,0,2,2],c:'z'}]},{shapes:'nope'}]});
 assert.equal(rig.w,48);assert.equal(rig.h,10);
 assert.deepEqual(Object.keys(rig.palette),['a']);
 assert.equal(rig.parts.length,1);assert.equal(rig.parts[0].shapes.length,1);
 assert.equal(rig.parts[0].role,'other');
 assert.deepEqual(compileRig(rigJson(rig)).parts[0].shapes.length,1,'the stored form compiles again');
 assert.throws(()=>normalizeRig({palette:{a:'#ffffff'},parts:[{shapes:[{rect:[0,0,2,2],c:'a'}]}]}),/简单/);
 assert.ok(parseRig('好的```json\n'+JSON.stringify(rigJson(presetRig('cat')))+'\n```').parts.length>3);
});

test('rasterizing keeps small details, rings the figure with the outline and animates parts',()=>{
 const rig=presetRig('fish');
 const rows=rasterize(rig);
 assert.ok(rows.some(r=>r.includes('e')),'the pupil survives sampling');
 assert.ok(rows[0].split('').every(c=>c==='.'||c==='k'),'the outer ring is outline or empty');
 const swim=framesFor(rig,'swim',4);
 assert.equal(swim.length,4);
 assert.ok(swim.every(f=>f.length===rows.length&&f[0].length===rows[0].length),'frames share one size');
 assert.notDeepEqual(swim[0],swim[1],'the tail moves between frames');
 assert.equal(framesFor(rig,'swim',4),swim,'frames are cached per rig');
 const angles=partAngles(presetRig('person'),'wave',.25);
 const armR=presetRig('person').parts.findIndex(p=>p.role==='arm_r');
 assert.ok(angles[armR]<-90,'waving raises the right arm');
 const custom=partAngles(presetRig('cat'),'idle',.25,{tail:[-40,40]});
 assert.equal(Math.round(custom[presetRig('cat').parts.findIndex(p=>p.role==='tail')]),40);
});

test('every preset compiles to a solid, outlined figure; the whale reads the host mark when it is usable',()=>{
 for(const id of PRESETS){
  const rig=presetRig(id);
  assert.ok(rig,id);
  const rows=rasterize(rig);
  assert.ok(filled(rows)>=150,id+' is substantial');
  assert.ok(rig.outline&&rows.join('').includes(rig.outline),id+' has an outline');
  for(const action of ['idle','swim','walk','dance','fly'])assert.equal(framesFor(rig,action,4).length,4);
 }
 assert.equal(presetRig('dragon'),null);
 const tinted=presetRig('fish',{o:'#123456',k:'#ffffff',zz:'#000000'});
 assert.equal(tinted.palette.o,'#123456');assert.notEqual(tinted.palette.k,'#ffffff','the outline is not recoloured');
 // A path that does not draw a whale falls back to the hand-drawn one.
 assert.deepEqual(presetRig('whale',{},'M0 0 L1 0 L1 1 Z').palette,presetRig('whale').palette);
 const square='M2 8 L48 8 L48 43 L2 43 Z';
 assert.ok(filled(rasterize(compileRig(whaleFromPath(square))))>500);
 assert.notEqual(presetRig('whale',{},square),presetRig('whale'),'a usable mark replaces the fallback');
});

test('scripts v3 cast presets or ask for a drawing, define moves and pick scenery',()=>{
 const s=normalizeScript({actor:{name:'金鱼',keep:false,preset:'fish',colors:{o:'#ff7a00',x:'#000000'}},beats:{done:{actions:['swim','翻滚','moonwalk']}},
  moves:{'翻滚':{period:99,travel:'orbit',keys:[[0,0,0,0,1,1],[.5,9,-9,9999,0,5]],parts:{tail:[-500,30],wing:[0,10],nose:[1,2]}},'swim':{keys:[[0,0,0,0,1,1]]},'空':{}}});
 assert.equal(s.v,3);
 assert.equal(s.actor.preset,'fish');assert.deepEqual(s.actor.colors,{o:'#ff7a00'});
 assert.deepEqual(s.beats.done.actions,['swim','翻滚']);
 const m=s.moves['翻滚'];
 assert.equal(m.period,8);assert.equal(m.travel,'none');
 assert.deepEqual([m.keys[1].dx,m.keys[1].dy,m.keys[1].rot,m.keys[1].sy],[1.5,-1.5,720,2]);
 assert.deepEqual(m.parts,{tail:[-180,30],wing:[0,10]});
 assert.ok(!s.moves.swim&&!s.moves['空'],'built-in names and empty moves are not moves');
 assert.equal(s.env,'water','swimming brings water when no scenery is named');
 const d=normalizeScript({actor:{name:'恐龙',keep:false,preset:'trex',draw:'a green dinosaur'.repeat(40)},env:'volcano'});
 assert.equal(d.actor.preset,null);assert.equal([...d.actor.draw].length,240);assert.equal(d.env,'none');
 const kept=normalizeScript({actor:{name:'鲸鱼',keep:true,preset:'whale',draw:'x'}});
 assert.equal(kept.actor.preset,null);assert.equal(kept.actor.draw,null,'a kept actor is neither recast nor redrawn');
 for(const id of PRESETS)assert.ok(SYSTEM_PROMPT.includes(id));
 for(const env of ENVS)assert.ok(SYSTEM_PROMPT.includes(env));
 for(const a of ACTION_NAMES)assert.ok(SYSTEM_PROMPT.includes(a));
 assert.ok(normalizeRig(JSON.parse(SPRITE_PROMPT.slice(SPRITE_PROMPT.lastIndexOf('{"size"')))).parts.length===4,'the illustrator example is a valid rig');
});

test('travelling actors cross the stage, scenery stays in its zone and the bubble is pinned',()=>{
 const box={w:1000,h:640},look=lookOf({preset:'fish'}),log=[{id:'a',text:'[ OK ] x',state:' OK '}];
 for(const env of ENVS)for(const output of [null,{kind:'answer',title:'t',text:'hi',open:true}]){
  const spec=buildActorScene({box,actor:{name:'鱼'},look,frames:framesOfLook(look,'swim'),beat:{action:'swim',actions:['swim'],say:'看我游'},act:'swim',phase:'done',output,env,log});
  const actor=spec.motions.find(m=>m.group==='actor');
  assert.equal(actor.type,'swim');assert.ok(actor.range>40,env+' has room to swim');assert.equal(actor.facing,'right');
  const band=Math.min(...spec.texts.filter(t=>t.key.startsWith('log')).map(t=>t.y))-14;
  for(const m of spec.marks){assert.ok(m.x>=-4&&m.x<=box.w+4&&m.y>=-14,env+' '+m.id);if(m.id.startsWith('env_'))assert.ok(m.y+m.h<=band+2,env+' '+m.id+' above the log band');if(m.from&&!m.id.startsWith('beam'))assert.ok(m.from.y>=m.y-1,env+' '+m.id+' born below');}
  assert.equal(new Set(spec.marks.map(m=>m.id)).size,spec.marks.length,env+' unique ids');
  const bubble=spec.marks.filter(m=>m.id.startsWith('bb'));
  assert.ok(bubble.length&&!spec.marks.some(m=>m.id.startsWith('tail')),'a travelling actor speaks from a pinned bubble');
 }
 const water=buildActorScene({box,actor:{name:'鱼'},look,beat:{action:'swim',say:''},act:'swim',phase:'done',env:'water'});
 assert.ok(water.live.some(l=>l.type==='waves')&&water.live.some(l=>l.type==='bubbles'));
 assert.ok(water.motions.some(m=>m.type==='sway'),'seaweed sways');
 const sketch=buildActorScene({box,actor:WHALE,beat:{action:'think',say:''},act:'think',phase:'think',drawing:{name:'恐龙'}});
 assert.ok(sketch.marks.some(m=>m.id.startsWith('bp'))&&sketch.live.some(l=>l.type==='sweep'),'a drawing in progress shows a blueprint');
 assert.ok(sketch.texts.some(t=>t.text==='正在画新的样子…'));
});

test('poses: travel reports a heading, custom moves follow their keyframes',()=>{
 const left=pose('swim',Math.PI/.34,100,300,{range:200,rangeY:100}),right=pose('swim',0.1,100,300,{range:200,rangeY:100});
 assert.equal(right.face,1);assert.equal(left.face,-1);
 assert.ok(Math.abs(pose('swim',Math.PI/2/.34,100,300,{range:200}).dx-200)<1,'swimming reaches the edge of its range');
 assert.ok(pose('fly',1,100,300,{range:200,rangeY:300}).dy<-40,'flying lifts off the floor');
 const move={period:2,travel:'none',keys:[{t:0,dx:0,dy:0,rot:0,sx:1,sy:1},{t:.5,dx:0,dy:-1,rot:180,sx:1,sy:1}]};
 const mid=pose('move:x',.5,100,300,{move});
 assert.ok(Math.abs(mid.dy+50)<1&&Math.abs(mid.rot-Math.PI/2)<.01,'halfway between keys');
 const around=pose('move:x',1,100,300,{move:{...move,travel:'circle'},range:100,rangeY:100});
 assert.ok(Number.isFinite(around.dx)&&around.face!==0);
});

test('motion is complete: leaps crouch, fly and land; dance travels both ways; dives never jump',()=>{
 const crouch=pose('jump',.18,100,300,{rangeY:200}),air=pose('jump',.9,100,300,{rangeY:200}),land=pose('jump',1.68,100,300,{rangeY:200});
 assert.ok(crouch.sy<.9&&crouch.dy===0,'anticipation: a crouch on the floor');
 assert.ok(air.dy<-30,'then a leap');
 assert.ok(land.sy<.95&&land.dy===0,'and a squash on landing');
 const xs=Array.from({length:48},(_,i)=>pose('dance',i*.1,100,300,{}).dx);
 assert.ok(Math.min(...xs)<-20&&Math.max(...xs)>20,'the dance steps left and right');
 const before=pose('dive',3.999,100,300,{range:200,rangeY:200}),after=pose('dive',4.001,100,300,{range:200,rangeY:200});
 assert.ok(Math.abs(before.dx-after.dx)<2,'consecutive dives continue from where the last one ended');
 const {fxOf,CYCLE_FRAMES}=require('../src/stage-actor.cjs');
 assert.equal(fxOf('swim'),'bubbles');assert.equal(fxOf('run',null,'water'),'bubbles');assert.equal(fxOf('fly'),'wind');assert.equal(fxOf('jump'),'dust');assert.equal(fxOf('dance'),'sparkles');assert.equal(fxOf('think'),null);
 assert.equal(fxOf('x',{travel:'across'}),'dust');assert.equal(fxOf('x',{travel:'none'}),'sparkles');
 assert.equal(framesOfLook(lookOf({preset:'cat'}),'walk').length,CYCLE_FRAMES);
 const spec=buildActorScene({box:{w:900,h:600},actor:{name:'猫'},look:lookOf({preset:'cat'}),beat:{action:'run',say:''},act:'run',phase:'done',env:'grass'});
 assert.equal(spec.motions[0].fx,'dust');
});

test('a finished reply becomes a show: the director\'s actions, then an encore that suits the actor',()=>{
 const {programOf}=require('../src/stage-actor.cjs');
 const fish=lookOf({preset:'fish'}),cat=lookOf({preset:'cat'}),bird=lookOf({preset:'bird'});
 const water=programOf(['swim','dive'],{look:fish,env:'water',phase:'done',seed:7});
 assert.equal(water.length,8);assert.deepEqual(water.slice(0,2),['swim','dive']);
 assert.ok(water.every(a=>!['walk','run','hop','roll','bow'].includes(a)),'nothing walks under water');
 const grass=programOf(['walk'],{look:cat,env:'grass',phase:'done',seed:3});
 assert.equal(grass[0],'walk');assert.equal(new Set(grass).size,grass.length,'an encore does not repeat');
 assert.ok(grass.every(a=>a!=='swim'&&a!=='fly'),'a cat on grass neither swims nor flies');
 assert.ok(programOf(['happy'],{look:bird,env:'none',phase:'done',seed:1}).length===8);
 assert.deepEqual(programOf(['think'],{look:cat,phase:'think'}),['think'],'reasoning phases keep the director\'s beat');
 assert.equal(programOf(['nod'],{look:cat,phase:'answer',seed:2}).length,4);
 assert.deepEqual(programOf(['swim'],{look:fish,env:'water',seed:9}),programOf(['swim'],{look:fish,env:'water',seed:9}),'the same turn gets the same show');
 for(let i=1;i<water.length;i++)assert.notEqual(water[i],water[i-1]);
});

test('the DeepSeek whale stays until the user explicitly asks for another actor',()=>{
 const {castRequested,holdActor,buildRequest}=require('../src/director-script.cjs');
 for(const s of ['你是一条鱼','你现在是一只猫','变成恐龙吧','你来扮演机器人','换个形象','变回鲸鱼','be a cat','turn into a robot'])assert.ok(castRequested(s),s);
 for(const s of ['你是谁','你是不是机器人','你游一下泳','给我讲讲恐龙','猫和狗哪个更聪明','你是什么模型','who are you','tell me about whales'])assert.ok(!castRequested(s),s);
 const proposed=normalizeScript({actor:{name:'猫',keep:false,preset:'cat'},beats:{done:{actions:['walk']}}});
 const held=holdActor(proposed,'给我讲讲猫',null);
 assert.equal(held.actor.keep,true);assert.equal(held.actor.preset,null);assert.equal(held.actor.name,'小鲸鱼');
 assert.deepEqual(held.beats,proposed.beats,'the actions still follow the topic');
 assert.equal(holdActor(proposed,'给我讲讲猫',{name:'恐龙'}).actor.name,'恐龙');
 assert.equal(holdActor(proposed,'你是一只猫',null).actor.preset,'cat');
 assert.match(JSON.parse(buildRequest({input:'hi'}).split('\n')[1]).previous_actor,/DeepSeek whale/);
});
