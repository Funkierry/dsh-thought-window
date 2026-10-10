'use strict';
// Director script: the one extra model call per user message. The model reads
// the message and returns a small JSON stage script (actor sprite with pose
// frames, action sequences per phase, props, terminal). Shared by the host half
// (prompt + parse) and the client (validation of cached scripts). Everything
// returned is checked here; the stage never evaluates model output as code.
const ACTIONS=['idle','dance','jump','spin','wave','nod','shake','think','sleep','happy','sad','surprised','walk','grow','type','explode'];
const EFFECTS=['notes','hearts','sparkles','rain','zzz','stars','question','exclaim'];
const PHASES=['think','tool','answer','done'];
const PLACES=['left','right','above','ground'];
const PROP_MOTIONS=['float','bob','spin','none'];
const DEFAULT_BEATS={think:'think',tool:'type',answer:'nod',done:'idle'};
const LIMITS={input:2000,context:500,say:40,name:24,rows:32,cols:32,colors:10,frames:2,props:2,propSize:16};

const ROBOT={k:'#1b1f3b',g:'#8fa3c7',l:'#d7e1f5',r:'#e04f5f',y:'#fff36b'};
const EXAMPLE={actor:{name:'机器人',keep:false,sprite:{palette:ROBOT,rows:[
 '......kkkk......','.......rr.......','....kkkkkkkk....','....kllllllk....','....klyllylk....','....kllllllk....','....kkkkkkkk....','...kkggggggkk...',
 '..kgkggggggkgk..','..kgkggrrggkgk..','..kgkggggggkgk..','..kk.kggggk.kk..','.....kggggk.....','.....kk..kk.....','.....kk..kk.....','....kkk..kkk....']},
 frames:[{rows:['......kkkk......','.......rr.......','....kkkkkkkk....','..k.kllllllk.k..','..kgklyllylkgk..','..kgkllllllkgk..','..kgkkkkkkkkgk..','...kkggggggkk...',
 '....kggggggk....','....kggrrggk....','....kggggggk....','.....kggggk.....','.....kggggk.....','....kk....kk....','...kk......kk...','..kkk......kkk..']}]},
 scene:'actor',terminal:null,
 beats:{think:{actions:['think'],say:'让我想想…'},tool:{actions:['type'],say:''},answer:{actions:['nod','wave'],say:''},done:{actions:['jump','dance'],say:'我是机器人！'}},
 props:[{name:'扳手',place:'right',motion:'float',sprite:{palette:{k:'#2b2b3a',s:'#b8c4d6'},rows:['.kk...','ksk...','.kss..','..kss.','...kss','....kk']}}],
 effects:['sparkles'],mood:'兴奋'};

const SYSTEM_PROMPT=[
 'You direct a pixel-art terminal stage that accompanies a chat between a user and an AI assistant.',
 'Read the newest user message (plus a little context) and decide what the on-stage character is and does.',
 'Reply with ONE JSON object only: no prose, no Markdown, no code fences.',
 '',
 'Schema:',
 '{"actor":{"name":short noun in the user\'s language,"keep":true when the previous actor stays,"sprite":{"palette":{"a":"#RRGGBB",...},"rows":[...]} or null when keep is true,',
 '          "frames":[{"rows":[...]}, ...] 1 or 2 extra pose frames (same size, same palette) or [] when keep is true},',
 ' "scene":"actor" or "terminal" (terminal when the user asks for code, a script, a command or programming),',
 ' "terminal":{"title":"e.g. fib.py - python","command":"e.g. python fib.py"} or null,',
 ' "beats":{"think":{"actions":[A,...],"say":S},"tool":{...},"answer":{...},"done":{...}},',
 ' "props":[0 to 2 of {"name":short noun,"place":"left"|"right"|"above"|"ground","motion":"float"|"bob"|"spin"|"none","sprite":{"palette":{...},"rows":[...]}}],',
 ' "effects":[zero to two of '+EFFECTS.join(', ')+'],',
 ' "mood":one or two words}',
 'A is one of: '+ACTIONS.join(', ')+'. Each phase lists 1 to 3 actions performed in turn; vary them so the character feels alive.',
 'S is what the character says in that phase, in the user\'s language, at most 18 CJK characters or 40 Latin characters; it may be "".',
 'Phases: think = the assistant is reasoning, tool = it runs a tool, answer = it is writing the reply, done = the reply is finished.',
 '',
 'Sprite rules: 16 to 24 rows, every row the same length (16 to 24). "." is transparent; every other character must be a palette key (one lowercase letter).',
 'Use 3 to 7 colours with a darker outline. Draw the subject recognisably, front view, centred, filling most of the grid. Give it a face or limbs when it suits the subject.',
 'Frames are the same subject in other poses for animation (arms up, legs apart, leaning, squashed, mouth open): same width, height and palette; change only the posture. Make each frame visibly different (move limbs or leaves 2-3 cells, tilt the body, squash or stretch by a row), not just the mouth.',
 'Props are small helpers for the scene (a microphone to sing, a book to study, a ball to play): at most 14 rows by 14 columns each, their own palette.',
 '',
 'Casting:',
 '- If the user tells the assistant to be something ("你是一个茄子"), the actor is that thing, keep=false, with a new sprite and frames.',
 '- If the user asks the current actor to do something ("你会跳舞吗"), keep=true, sprite=null, frames=[], and choose matching actions and props (done.actions ["dance","spin","jump"], a music prop, effects ["notes"]).',
 '- When previous_actor is set, keep=true is the default for every other request (questions, tasks, code): the same character reacts. Only an explicit "你是…/变成…/be a …" casts a new actor.',
 '- With no previous actor and no named subject, draw something that fits the topic.',
 '- Requests to write code: scene "terminal", tool/answer actions ["type"].',
 '',
 'Example reply for "你是一个机器人":',
 JSON.stringify(EXAMPLE)
].join('\n');

const clip=(text,n)=>Array.from(String(text??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim()).slice(0,n).join('');
function buildRequest({input,previous,context}={}){
 return 'Stage request as JSON:\n'+JSON.stringify({
  user_message:clip(input,LIMITS.input),
  previous_actor:previous?.name?clip(previous.name,LIMITS.name):null,
  previous_user_message:context?.input?clip(context.input,LIMITS.context):null,
  previous_answer_excerpt:context?.answer?clip(context.answer,LIMITS.context):null
 });
}
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
// Base and pose frames share one crop box (the union of their drawn cells),
// so frames line up cell for cell. Unknown characters become transparent; a
// sprite with too few drawn cells is rejected rather than shown as noise.
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
function beat(value,phase){
 const list=(Array.isArray(value?.actions)?value.actions:[value?.action]).filter(a=>ACTIONS.includes(a)).slice(0,3);
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
 raw={...raw};for(const k of ['scene','terminal','beats','props','effects','mood'])if(raw[k]===undefined&&actorIn[k]!==undefined)raw[k]=actorIn[k];
 const keep=actorIn.keep===true;
 const drawn=keep?null:sprite(actorIn.sprite,actorIn.frames??actorIn.sprite?.frames);
 const actor={name:clip(actorIn.name,LIMITS.name)||'角色',keep,sprite:drawn};
 const scene=raw.scene==='terminal'?'terminal':'actor';
 const t=raw.terminal&&typeof raw.terminal==='object'?raw.terminal:null;
 const beats={};for(const phase of PHASES)beats[phase]=beat(raw.beats?.[phase],phase);
 const props=(Array.isArray(raw.props)?raw.props:[]).map(prop).filter(Boolean).slice(0,LIMITS.props);
 const effects=(Array.isArray(raw.effects)?raw.effects:[]).filter(e=>EFFECTS.includes(e)).slice(0,2);
 return {v:2,actor,scene,terminal:scene==='terminal'||t?{title:clip(t?.title,40),command:clip(t?.command,60)}:null,beats,props,effects,mood:clip(raw.mood,16)};
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
function parseScript(text){
 const source=String(text||'').replace(/^\s*```(?:json)?/i,'').replace(/```\s*$/,'');
 const start=source.indexOf('{'),end=source.lastIndexOf('}');
 if(start<0||end<=start)throw Error('模型没有返回 JSON 剧本');
 const json=source.slice(start,end+1);
 try{return normalizeScript(JSON.parse(json));}
 catch(error){
  for(const candidate of [balanced(json),repair(json),repair(balanced(json))]){try{return normalizeScript(JSON.parse(candidate));}catch{}}
  {const at=Number(/position (\d+)/.exec(error.message)?.[1]);throw Error(error.message+(Number.isFinite(at)?' · 附近：'+json.slice(Math.max(0,at-50),at+30).replace(/\s+/g,' '):''));}
 }
}
module.exports={ACTIONS,EFFECTS,PHASES,SYSTEM_PROMPT,buildRequest,parseScript,normalizeScript,sprite};
