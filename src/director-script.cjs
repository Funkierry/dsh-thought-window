'use strict';
// Director script: the extra model call per user message. The model reads the
// message and returns a small JSON stage script: who the actor is (a built-in
// preset, recoloured if wanted, or a request to draw a new one), what it does
// in each phase (built-in actions or moves it defines itself), the scenery,
// props and effects. Shared by the host (prompt + parse) and the client
// (validation of cached scripts). Model output is data; nothing is evaluated.
const {ACTION_NAMES,ROLES,compileRig,rigJson}=require('./sprite-rig.cjs');
const {PRESETS,PRESET_KEYS,presetRig}=require('./sprite-presets.cjs');
const ACTIONS=ACTION_NAMES;
const EFFECTS=['notes','hearts','sparkles','rain','zzz','stars','question','exclaim','bubbles','snow','fire','confetti'];
const ENVS=['none','water','sky','space','night','grass','snow','city','stage'];
const TRAVEL=['none','across','circle','bounce','updown','zigzag'];
const PHASES=['think','tool','answer','done'];
const PLACES=['left','right','above','ground'];
const PROP_MOTIONS=['float','bob','spin','none'];
const DEFAULT_BEATS={think:'think',tool:'type',answer:'nod',done:'idle'};
const LIMITS={input:2000,context:500,say:40,name:24,draw:240,rows:32,cols:32,colors:10,frames:2,props:2,propSize:16,moves:4};
// Scenery that goes with an action when the model names none.
const ENV_FOR={swim:'water',dive:'water',fly:'sky',hover:'sky'};

const SYSTEM_PROMPT=[
 'You direct a pixel-art stage that accompanies a chat between a user and an AI assistant.',
 'Read the newest user message (plus a little context), understand what the user wants the on-stage character to BE and to DO, and stage it vividly.',
 'Reply with ONE JSON object only: no prose, no Markdown, no code fences.',
 '',
 'Schema:',
 '{"actor":{"name":short noun in the user\'s language,"keep":true when the previous actor stays,',
 '          "preset":one of '+PRESETS.join(', ')+' or null,"colors":{key:"#RRGGBB"} optional recolouring of the preset,',
 '          "draw":null or, when no preset fits, an English description for an illustrator (subject, key colours, distinctive features, side view or front view)},',
 ' "scene":"actor" or "terminal" (terminal when the user asks for code, a script, a command or programming),',
 ' "terminal":{"title":"e.g. fib.py - python","command":"e.g. python fib.py"} or null,',
 ' "env":one of '+ENVS.join(', ')+' (scenery behind the actor),',
 ' "beats":{"think":{"actions":[A,...],"say":S},"tool":{...},"answer":{...},"done":{...}},',
 ' "moves":{} or up to 4 custom moves: {"name":{"period":seconds,"travel":one of '+TRAVEL.join('|')+',"keys":[[t,dx,dy,rot,sx,sy],...],"parts":{role:[fromDeg,toDeg],...}}},',
 ' "props":[0 to 2 of {"name":short noun,"place":"left"|"right"|"above"|"ground","motion":"float"|"bob"|"spin"|"none","sprite":{"palette":{...},"rows":[...]}}],',
 ' "effects":[zero to two of '+EFFECTS.join(', ')+'],',
 ' "mood":one or two words}',
 '',
 'Presets and their recolourable keys: '+PRESETS.map(id=>id+' ('+PRESET_KEYS[id]+')').join('; ')+'.',
 'whale is the DeepSeek whale: use it for 鲸鱼 / whale / DeepSeek / 小鲸鱼. Use a preset whenever the subject is that kind of thing, recoloured to fit (金鱼 → fish with orange, 黑猫 → cat with black fur, 小女孩 → person with long hair colour).',
 'For any other subject set preset null and write "draw" (e.g. "a green dinosaur, side view facing right, round belly, small arms, spikes on its back").',
 '',
 'A (actions) is a built-in action or the name of one of your moves. Built-in: '+ACTIONS.join(', ')+'.',
 'Travelling actions move across the whole stage: swim, fly, run, walk, roll, bounce, hop, crawl, dive. Tails, fins, wings, arms and legs animate by themselves.',
 'think, tool and answer list 1 to 3 actions performed in turn; done lists 3 to 6 varied actions that form a little show (the stage adds an encore after them). Phases: think = the assistant is reasoning, tool = it runs a tool, answer = it writes the reply, done = the reply is finished (shown longest).',
 'S is what the character says in that phase, in the user\'s language, at most 18 CJK characters or 40 Latin characters; it may be "".',
 'Moves are for requests no built-in action covers (翻跟头, 打太极, 跳绳, 转圈圈). keys: up to 8 keyframes over one period, t from 0 to 1; dx and dy in body sizes (-1..1, dy negative is up), rot in degrees (360 = full turn), sx and sy scale (sx -1 mirrors). parts: role (arm, leg, wing, tail, fin, head, ear, or arm_l etc.) swinging between two angles (clockwise degrees).',
 'env: water for swimming/diving/sea creatures, sky for flying, space for rockets/stars, night for sleep, grass for walking outdoors, snow for winter, city for town, stage for performing, none otherwise.',
 '',
 'Directing rules:',
 '- The default actor is the DeepSeek whale (小鲸鱼). The actor changes ONLY when the user explicitly tells the assistant to be or become something ("你是一只猫", "变成恐龙", "扮演机器人", "be a cat"): then keep=false with a preset or draw.',
 '- Asking the current actor to do something ("你会跳舞吗", "你游一下泳"): keep=true, preset=null, draw=null, and make it DO it: put the requested action in answer and done (e.g. done.actions ["swim","dive","swim"], env "water", effects ["bubbles"]). Show it attempting the action even if the actor is unusual for it.',
 '- Every other message keeps the current actor (keep=true, preset=null, draw=null), even when it talks about animals, objects or other characters; the same actor reacts to the topic with actions, scenery and props.',
 '- Requests to write code: scene "terminal", tool/answer actions ["type"].',
 '- Be lively: vary actions between phases, pick fitting scenery, effects and a prop.',
 '- colors: only when the user names a colour or a variety (金鱼, 黑猫, 蓝色的…); otherwise keep the preset colours.',
 '',
 'Example for "你是一条金鱼": {"actor":{"name":"金鱼","keep":false,"preset":"fish","colors":{"o":"#ff7a00"},"draw":null},"scene":"actor","terminal":null,"env":"water","beats":{"think":{"actions":["swim"],"say":"咕噜咕噜…"},"tool":{"actions":["swim"],"say":""},"answer":{"actions":["swim","flip"],"say":""},"done":{"actions":["swim","dive"],"say":"我是一条金鱼！"}},"moves":{},"props":[],"effects":["bubbles"],"mood":"自在"}',
 'Example for "你会翻跟头吗" (previous actor 猫): {"actor":{"name":"猫","keep":true,"preset":null,"draw":null},"scene":"actor","terminal":null,"env":"grass","beats":{"think":{"actions":["think"],"say":"翻跟头？"},"tool":{"actions":["type"],"say":""},"answer":{"actions":["翻跟头"],"say":""},"done":{"actions":["翻跟头","cheer"],"say":"看我的！"}},"moves":{"翻跟头":{"period":1.4,"travel":"none","keys":[[0,0,0,0,1,0.85],[0.15,0,-0.1,0,1,1.1],[0.5,0,-0.7,180,1,1],[0.85,0,-0.1,360,1,1],[1,0,0,360,1,0.9]],"parts":{"leg":[-40,20],"tail":[-30,30]}}},"props":[],"effects":["sparkles"],"mood":"得意"}'
].join('\n');

// The illustrator: one more call (with reasoning) when no preset fits. It
// draws a vector rig that the stage rasterizes and animates part by part.
const SPRITE_PROMPT=[
 'You are a pixel-art character designer. Draw the requested subject as a vector rig that will be rasterized onto a coarse pixel grid and animated part by part.',
 'Reply with ONE JSON object only, no prose:',
 '{"size":[W,H],"palette":{"a":"#RRGGBB",...},"outline":"k","facing":"right"|"left","view":"side"|"front",',
 ' "parts":[{"role":R,"pivot":[x,y],"z":n,"shapes":[S,...]},...]}',
 'W and H are 24 to 40 grid units. Coordinates are in grid units (0,0 top-left, y down). One grid unit becomes one pixel.',
 'palette: 3 to 8 colours, one lowercase letter each; outline names a dark colour drawn automatically around the whole figure (do not draw outlines yourself).',
 'R (role) is one of: '+ROLES.join(', ')+'. Animated roles rotate about their pivot: tail, fin, wing_l, wing_r, arm_l, arm_r, leg_l, leg_r, ear, head. Put the pivot where the part joins the body (shoulder, hip, tail base).',
 'z orders parts (far limbs negative, near limbs positive); within a part later shapes paint over earlier ones.',
 'S (shape) is one of: {"rect":[x,y,w,h],"c":k} {"circle":[cx,cy,r],"c":k} {"ellipse":[cx,cy,rx,ry,rotationDeg],"c":k} {"poly":[x1,y1,x2,y2,...],"c":k} {"line":[x1,y1,x2,y2,width],"c":k} {"path":"SVG path d","c":k}.',
 'Craft: build a clear, recognisable silhouette first (body, head), then limbs, then details. Use shading with a second tone of the main colour (belly, underside). Small details (eyes, nose, buttons) need at least 1.5 units and should be centred on .5 coordinates. Keep everything inside the W×H box.',
 'The stage background is near-black: never fill large areas with black or very dark colours (use dark grey such as #4a4f5c for black fur, hair or clothes); only the outline may be near-black.',
 'Animals and vehicles that move horizontally: side view facing right with separate legs/fins/wings/tail parts. People, robots and standing characters: front view with arm_l/arm_r/leg_l/leg_r.',
 'Example (a goldfish): '+JSON.stringify({size:[30,22],palette:{o:'#ff8c42',y:'#ffd166',s:'#e85d04',w:'#ffffff',e:'#1b1430',k:'#2b1d3a'},outline:'k',facing:'right',view:'side',parts:[
  {role:'tail',pivot:[9,11],z:-1,shapes:[{poly:[10,11,1,2.5,3.5,11,1,19.5],c:'s'}]},
  {role:'fin',pivot:[16,5],z:-1,shapes:[{poly:[11,5.5,15,0.5,22,5],c:'s'}]},
  {role:'body',pivot:[17,11],z:0,shapes:[{ellipse:[18,11,10,7.2],c:'o'},{ellipse:[19,13.8,7.5,3.4],c:'y'},{ellipse:[13.5,11,1.1,6],c:'s'},{circle:[23.5,9,1.8],c:'w'},{circle:[24,9,0.95],c:'e'}]},
  {role:'fin',pivot:[17,12.5],z:2,shapes:[{poly:[16,12.5,21,16.5,15,16],c:'s'}]}]})
].join('\n');

// An explicit request to change the actor ("你是一只猫", "变成恐龙", "be a
// cat"). Questions such as "你是谁" or "你是不是" do not count.
const CAST=/(你|您)\s*(现在|就|来|先)?\s*(是|当|变成|变为|化身为?|扮演|变回|换成)(?!谁|不是|否|怎么|什么|哪|啥|如何|不|为什么|几|真的|在)|变成|变为|变回|换回|化身|扮演|假装(你|自己)?是|换(个|一个)?(形象|角色|造型|样子)|\b(be|become|turn into|act as|pretend to be)\s+(an?|the|my)\b|\byou\s*(are|'re)\s+(an?|the|my)\s+\w/i;
const castRequested=input=>CAST.test(String(input||''));
// Keeps the current actor when the message did not ask for a new one, whatever
// the model proposed.
function holdActor(script,input,previous){
 if(castRequested(input)||script.actor.keep)return script;
 return {...script,actor:{name:previous?.name||'小鲸鱼',keep:true,preset:null,colors:{},rig:null,sprite:null,draw:null}};
}
const clip=(text,n)=>Array.from(String(text??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim()).slice(0,n).join('');
const num=(v,d=0)=>typeof v==='number'&&Number.isFinite(v)?v:d;
const clampN=(v,a,b,d=a)=>Math.max(a,Math.min(b,num(v,d)));
function buildRequest({input,previous,context}={}){
 return 'Stage request as JSON:\n'+JSON.stringify({
  user_message:clip(input,LIMITS.input),
  previous_actor:previous?.name?clip(previous.name,LIMITS.name):'小鲸鱼 (the DeepSeek whale, default)',
  previous_user_message:context?.input?clip(context.input,LIMITS.context):null,
  previous_answer_excerpt:context?.answer?clip(context.answer,LIMITS.context):null
 });
}
function buildSpriteRequest({name,draw}={}){
 return 'Draw this character as a rig:\n'+JSON.stringify({name:clip(name,LIMITS.name),description:clip(draw,LIMITS.draw)});
}
// A drawn rig from the illustrator, validated; throws when unusable.
function normalizeRig(raw){
 const rig=compileRig(raw);
 if(!rig)throw Error('画像不是可用的部件图');
 const shapes=rig.parts.reduce((n,p)=>n+p.shapes.length,0);
 if(shapes<3)throw Error('画像太简单');
 return rigJson(rig);
}
const parseRig=text=>parseJson(text,normalizeRig,'模型没有返回 JSON 画像');
function color(value){
 const text=String(value||'').trim();
 if(/^#[0-9a-f]{6}$/i.test(text))return text.toLowerCase();
 if(/^#[0-9a-f]{3}$/i.test(text))return ('#'+[...text.slice(1)].map(c=>c+c).join('')).toLowerCase();
 return null;
}
function palette(value){
 const out={};
 for(const [key,hex] of Object.entries(value||{}).slice(0,LIMITS.colors)){const c=color(hex);if(/^[a-z0-9]$/i.test(key)&&key!=='.'&&c)out[key]=c;}
 return out;
}
const grid=(rows,colors,max)=>(Array.isArray(rows)?rows:[]).filter(r=>typeof r==='string').slice(0,max).map(r=>[...r.slice(0,max)].map(ch=>colors[ch]?ch:'.').join(''));
// Row sprites (props, and actors from scripts before 0.12): base and pose
// frames share one crop box, so frames line up cell for cell. Unknown
// characters become transparent; a scribble with too few cells is rejected.
function sprite(value,frames=[],max=LIMITS.rows,min=4){
 if(!value||typeof value!=='object')return null;
 const colors=palette(value.palette);
 if(!Object.keys(colors).length)return null;
 const base=grid(value.rows,colors,max);
 if(!base.length)return null;
 const h=base.length,w=Math.max(...base.map(r=>r.length));
 const pad=rows=>Array.from({length:h},(_,y)=>(rows[y]||'').padEnd(w,'.').slice(0,w));
 const sets=[pad(base),...(Array.isArray(frames)?frames:[]).slice(0,4).map(f=>grid(Array.isArray(f)?f:f?.rows,colors,max)).filter(f=>f.length>=h*.6).slice(0,LIMITS.frames).map(pad)];
 const rowsUsed=[...Array(h).keys()].filter(y=>sets.some(s=>/[^.]/.test(s[y]))),colsUsed=[...Array(w).keys()].filter(x=>sets.some(s=>s.some(r=>r[x]!=='.')));
 if(!rowsUsed.length)return null;
 const crop=s=>s.slice(rowsUsed[0],rowsUsed.at(-1)+1).map(r=>r.slice(colsUsed[0],colsUsed.at(-1)+1));
 const [rows,...poses]=sets.map(crop);
 const filled=rows.join('').replace(/\./g,'').length;
 if(rows.length<min||rows[0].length<min||filled<min*2)return null;
 return {palette:colors,rows,frames:poses.filter(f=>f.join('').replace(/\./g,'').length>=filled*.5),w:rows[0].length,h:rows.length};
}
// A custom move: body keyframes over one period plus part swings.
function move(value){
 if(!value||typeof value!=='object')return null;
 const keys=(Array.isArray(value.keys)?value.keys:[]).filter(Array.isArray).slice(0,8).map(k=>({t:clampN(k[0],0,1,0),dx:clampN(k[1],-1.5,1.5,0),dy:clampN(k[2],-1.5,1.5,0),rot:clampN(k[3],-720,720,0),sx:clampN(k[4],-2,2,1)||1,sy:clampN(k[5],.2,2,1)})).sort((a,b)=>a.t-b.t);
 const parts={};
 for(const [role,v] of Object.entries(value.parts||{}).slice(0,8))if((ROLES.includes(role)||['arm','leg','wing'].includes(role))&&Array.isArray(v)&&v.length>=2)parts[role]=[clampN(v[0],-180,180,0),clampN(v[1],-180,180,0)];
 const travel=TRAVEL.includes(value.travel)?value.travel:'none';
 if(!keys.length&&!Object.keys(parts).length&&travel==='none')return null;
 return {period:clampN(value.period,.4,8,1.6),travel,keys,parts};
}
function beat(value,phase,moves){
 const ok=a=>typeof a==='string'&&(ACTIONS.includes(a)||Object.hasOwn(moves,a));
 const list=(Array.isArray(value?.actions)?value.actions:[value?.action]).filter(ok).slice(0,phase==='done'?6:3);
 const actions=list.length?list:[DEFAULT_BEATS[phase]];
 return {action:actions[0],actions,say:clip(value?.say,LIMITS.say)};
}
function prop(value){
 if(!value||typeof value!=='object')return null;
 const drawn=sprite(value.sprite,[],LIMITS.propSize,2);
 if(!drawn)return null;
 return {name:clip(value.name,12),place:PLACES.includes(value.place)?value.place:'right',motion:PROP_MOTIONS.includes(value.motion)?value.motion:'float',sprite:{palette:drawn.palette,rows:drawn.rows,w:drawn.w,h:drawn.h}};
}
function normalizeScript(raw){
 if(!raw||typeof raw!=='object')throw Error('剧本不是对象');
 const actorIn=raw.actor&&typeof raw.actor==='object'?raw.actor:{};
 // Fields that slipped inside an unclosed "actor" belong to the script.
 raw={...raw};for(const k of ['scene','terminal','env','beats','moves','props','effects','mood'])if(raw[k]===undefined&&actorIn[k]!==undefined)raw[k]=actorIn[k];
 const keep=actorIn.keep===true;
 const preset=!keep&&PRESETS.includes(actorIn.preset)?actorIn.preset:null;
 // A rig drawn in the script itself, or rows from scripts before 0.12.
 const rig=!keep&&!preset&&actorIn.rig?compileRig(actorIn.rig):null;
 const rows=!keep&&!preset&&!rig?sprite(actorIn.sprite,actorIn.frames??actorIn.sprite?.frames):null;
 const draw=!keep&&!preset&&!rig&&!rows?clip(actorIn.draw,LIMITS.draw)||null:null;
 const actor={name:clip(actorIn.name,LIMITS.name)||'角色',keep,preset,colors:preset?Object.fromEntries(Object.entries(palette(actorIn.colors)).filter(([k])=>k!==presetRig(preset).outline&&presetRig(preset).palette[k])):{},rig:rig?rigJson(rig):null,sprite:rows,draw};
 const scene=raw.scene==='terminal'?'terminal':'actor';
 const t=raw.terminal&&typeof raw.terminal==='object'?raw.terminal:null;
 const moves={};
 for(const [name,value] of Object.entries(raw.moves&&typeof raw.moves==='object'?raw.moves:{}).slice(0,LIMITS.moves)){const m=move(value),key=clip(name,16);if(m&&key&&!ACTIONS.includes(key))moves[key]=m;}
 const beats={};for(const phase of PHASES)beats[phase]=beat(raw.beats?.[phase],phase,moves);
 const props=(Array.isArray(raw.props)?raw.props:[]).map(prop).filter(Boolean).slice(0,LIMITS.props);
 const effects=(Array.isArray(raw.effects)?raw.effects:[]).filter(e=>EFFECTS.includes(e)).slice(0,2);
 const acted=[...beats.answer.actions,...beats.done.actions].map(a=>ENV_FOR[a]).find(Boolean);
 const env=ENVS.includes(raw.env)&&raw.env!=='none'?raw.env:acted||'none';
 return {v:3,actor,scene,terminal:scene==='terminal'||t?{title:clip(t?.title,40),command:clip(t?.command,60)}:null,env,beats,moves,props,effects,mood:clip(raw.mood,16)};
}
// Long sprite arrays are where models slip: a missing comma between rows or a
// trailing comma. Those two are repaired; anything else is reported.
function repair(json){
 return json.replace(/,\s*([}\]])/g,'$1').replace(/(["\]}])\s*\n\s*(["\[{])/g,'$1,\n$2').replace(/(["\]}])[ \t]+(["\[{])/g,'$1,$2').replace(/"\s*"(?=[^:,\]}])/g,'","');
}
// The first complete object, by brace depth outside strings: drops an extra
// closing brace or trailing chatter after the JSON.
// closing brace or trailing chatter after the JSON; a missing closing brace or
// bracket at the end (an unclosed "actor" is the usual one) is appended.
function balanced(json){
 const open=[];let quoted=false,escaped=false;
 for(let i=0;i<json.length;i++){
  const ch=json[i];
  if(quoted){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')quoted=false;continue;}
  if(ch==='"')quoted=true;
  else if(ch==='{'||ch==='[')open.push(ch==='{'?'}':']');
  else if(ch==='}'||ch===']'){open.pop();if(!open.length)return json.slice(0,i+1);}
 }
 return json+open.reverse().join('');
}
// The first JSON object in a model reply, through `normalize`; a reply with a
// stray or missing brace, or missing commas, is repaired before giving up.
function parseJson(text,normalize,missing='模型没有返回 JSON'){
 const source=String(text||'').replace(/^\s*```(?:json)?/i,'').replace(/```\s*$/,'');
 const start=source.indexOf('{'),end=source.lastIndexOf('}');
 if(start<0)throw Error(missing);
 // A reply cut off before its last brace is kept whole for balanced().
 const json=end>start?source.slice(start,end+1):source.slice(start);
 try{return normalize(JSON.parse(json));}
 catch(error){
  for(const candidate of [balanced(json),repair(json),repair(balanced(json))]){try{return normalize(JSON.parse(candidate));}catch{}}
  {const at=Number(/position (\d+)/.exec(error.message)?.[1]);throw Error(error.message+(Number.isFinite(at)?' · 附近：'+json.slice(Math.max(0,at-50),at+30).replace(/\s+/g,' '):''));}
 }
}
const parseScript=text=>parseJson(text,normalizeScript,'模型没有返回 JSON 剧本');
module.exports={castRequested,holdActor,ACTIONS,EFFECTS,ENVS,TRAVEL,PHASES,SYSTEM_PROMPT,SPRITE_PROMPT,buildRequest,buildSpriteRequest,parseScript,parseRig,parseJson,normalizeScript,normalizeRig,sprite};
