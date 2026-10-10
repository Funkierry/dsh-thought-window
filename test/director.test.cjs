'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseScript,normalizeScript,sprite,buildRequest,ACTIONS,SYSTEM_PROMPT}=require('../src/director-script.cjs');
const {phaseOf,terminalOf,buildActorScene,WHALE}=require('../src/stage-actor.cjs');
const {project}=require('../src/core.cjs');

const eggplant={actor:{name:'茄子',keep:false,sprite:{palette:{k:'#2a1035',p:'#6b2fa0',l:'#9a5fd0',g:'#3f8a3a'},rows:[
 '......gg......','.....gggg.....','....kgggk.....','...kppppk.....','..kppllppk....','..kpplpppk....','..kpppppppk...','..kpppppppk...','...kpppppk....','....kkkkk.....']}},
 scene:'actor',beats:{think:{action:'think',say:'我是茄子？'},tool:{action:'type'},answer:{action:'nod'},done:{action:'dance',say:'我是一个茄子！'}},effects:['notes','bogus','hearts','stars'],mood:'得意'};

test('scripts are parsed from fenced or chatty replies and every field is bounded',()=>{
 const script=parseScript('好的：\n```json\n'+JSON.stringify(eggplant)+'\n```');
 assert.equal(script.actor.name,'茄子');
 assert.equal(script.actor.sprite.w,9,'empty columns trimmed');
 assert.equal(script.beats.done.action,'dance');
 assert.equal(script.beats.tool.say,'');
 assert.deepEqual(script.effects,['notes','hearts'],'unknown effects dropped, at most two');
 assert.throws(()=>parseScript('我不会画'),/JSON/);
});

test('unknown actions fall back per phase and text is clipped',()=>{
 const script=normalizeScript({actor:{name:'x'.repeat(80),keep:true},beats:{think:{action:'moonwalk',say:'长'.repeat(90)}}});
 assert.equal(script.beats.think.action,'think');
 assert.equal(script.beats.answer.action,'nod');
 assert.equal([...script.beats.think.say].length,40);
 assert.equal([...script.actor.name].length,24);
 assert.equal(script.actor.sprite,null,'kept actors carry no new sprite');
 for(const phase of ['think','tool','answer','done'])assert.ok(ACTIONS.includes(script.beats[phase].action));
});

test('sprites keep only palette colours, pad rows and reject scribbles',()=>{
 const s=sprite({palette:{a:'#ABC',b:'red','.':'#000000'},rows:['aaaaaaa','a?a','aaaaaaa','aaaaaaa','aaaaaaa','aaaaaaa','aaaaaaa']});
 assert.deepEqual(Object.keys(s.palette),['a']);
 assert.equal(s.palette.a,'#aabbcc');
 assert.ok(s.rows.every(r=>r.length===7));
 assert.equal(s.rows[1],'a.a....');
 assert.equal(sprite({palette:{a:'#ffffff'},rows:['a','a']}),null);
 assert.equal(sprite({palette:{},rows:['aaaaaa']}),null);
});

test('the request frames the message as data and the prompt lists every action',()=>{
 const text=buildRequest({input:'你是一个茄子\u0007',previous:{name:'苹果'},context:{input:'你是谁',answer:'我是苹果'}});
 const data=JSON.parse(text.slice(text.indexOf('{')));
 assert.equal(data.user_message,'你是一个茄子');
 assert.equal(data.previous_actor,'苹果');
 for(const action of ACTIONS)assert.ok(SYSTEM_PROMPT.includes(action));
 const examples=SYSTEM_PROMPT.split('\n').filter(l=>l.startsWith('Example for')).map(l=>parseScript(l.slice(l.indexOf('{'))));
 assert.equal(examples.length,2,'both prompt examples are valid scripts');
 assert.equal(examples[0].actor.preset,'fish');assert.equal(examples[0].env,'water');
 assert.ok(examples[1].moves['翻跟头'],'the custom move survives');assert.deepEqual(examples[1].beats.done.actions,['翻跟头','cheer']);
});

function graph(nodes,running){return project({nodes,partial:null,runningCalls:[]},running);}
const user={kind:'user',seq:1,turn:1,content:[{type:'text',text:'写一段斐波那契代码'}]};

test('the live phase follows the turn, not the reading position',()=>{
 assert.equal(phaseOf(graph([user],true)),'think');
 const call={kind:'assistant',seq:2,turn:1,step:0,blocks:[{kind:'tool-call',name:'bash',callId:'b',argsRaw:'{"command":"python fib.py"}'}]};
 assert.equal(phaseOf(project({nodes:[user,call],partial:null,runningCalls:[{callId:'b',name:'bash',turn:1,step:0,argsRaw:'{}'}]},true)),'tool');
 assert.equal(phaseOf(graph([user,{kind:'assistant',seq:3,turn:1,step:1,blocks:[{kind:'text',text:'好的'}]}],true)),'answer');
 assert.equal(phaseOf(graph([user,{kind:'assistant',seq:3,turn:1,step:1,blocks:[{kind:'text',text:'好的'}]}],false)),'done');
});

test('the terminal shows real code from the turn, even while the fence is still open',()=>{
 const answer=text=>graph([user,{kind:'assistant',seq:2,turn:1,step:0,blocks:[{kind:'text',text}]}],true);
 const open=terminalOf(answer('好的：\n```python\ndef fib(n):\n    return n'),null);
 assert.equal(open.kind,'code');assert.equal(open.lang,'python');assert.deepEqual(open.lines,['def fib(n):','    return n']);assert.equal(open.open,true);
 const closed=terminalOf(answer('```js\nconsole.log(1)\n```\n完成'),null);
 assert.equal(closed.open,false);
 const result={kind:'tool-result',seq:3,callId:'b',content:[{type:'text',text:'0 1 1 2 3'}]};
 const shell=terminalOf(graph([user,{kind:'assistant',seq:2,turn:1,step:0,blocks:[{kind:'tool-call',name:'bash',callId:'b',argsRaw:'{"command":"python fib.py"}'}]},result],true),null);
 assert.deepEqual(shell.lines,['$ python fib.py','0 1 1 2 3']);
 assert.equal(terminalOf(graph([user],true),null),null);
 assert.deepEqual(terminalOf(graph([user],true),{scene:'terminal',terminal:{title:'fib.py',command:'vim fib.py'}}).lines,['$ vim fib.py']);
});

test('actor scenes stay on the canvas, grow from the floor and carry the action',()=>{
 const box={w:900,h:600};
 const script=normalizeScript(eggplant);
 const actor={name:'茄子',sprite:script.actor.sprite};
 for(const terminal of [null,{kind:'code',title:'fib.py',lines:Array.from({length:60},(_,i)=>'line '+i),open:true}]){
  const spec=buildActorScene({box,actor,beat:script.beats.done,phase:'done',terminal,mood:'得意',effects:script.effects});
  const ids=new Set();
  for(const m of spec.marks){assert.ok(!ids.has(m.id),m.id);ids.add(m.id);assert.ok(m.x>=-4&&m.x<=box.w+4&&m.y>=-14&&m.y<=box.h+4,m.id+' '+m.x+','+m.y);if(m.from&&!m.id.startsWith('beam'))assert.ok(m.from.y>=m.y-1,m.id+' born below');}
  assert.equal(spec.motions[0].type,'dance');
  assert.equal(spec.marks.filter(m=>m.group==='actor').length,script.actor.sprite.rows.join('').replace(/\./g,'').length);
  assert.ok(spec.texts.some(t=>t.text==='我是一个茄子！'));
  if(terminal)assert.ok(spec.texts.some(t=>t.text==='line 59')&&!spec.texts.some(t=>t.text==='line 0'),'terminal scrolls to the latest lines');
 }
 const fallback=buildActorScene({box,actor:WHALE,beat:{action:'think',say:''},phase:'think',terminal:null});
 assert.ok(fallback.live.some(l=>l.type==='dots'),'thinking without a line shows dots');
});

test('scripts v2 carry pose frames, action sequences and props, all aligned and bounded',()=>{
 const base=['..kk..','.kppk.','kppppk','kppppk','.kppk.','..kk..'],up=['k....k','.kppk.','kppppk','kppppk','.kppk.','.k..k.'];
 const script=normalizeScript({actor:{name:'球',sprite:{palette:{k:'#000000',p:'#ff0000'},rows:base},frames:[{rows:up},{rows:['x']},{rows:base}]},
  beats:{done:{actions:['jump','spin','moonwalk','dance','wave']}},props:[{name:'话筒',place:'left',motion:'bob',sprite:{palette:{m:'#cccccc'},rows:['mm','mm','mm','mm']}},{name:'坏的',sprite:{palette:{},rows:['a']}}]});
 const sprite=script.actor.sprite;
 assert.equal(sprite.frames.length,2,'unusable frames dropped, at most two');
 assert.ok(sprite.frames.every(f=>f.length===sprite.h&&f.every(r=>r.length===sprite.w)),'frames share the base size');
 assert.deepEqual(script.beats.done.actions,['jump','spin','dance','wave'],'unknown actions removed, at most six for the show');
 assert.equal(script.beats.done.action,'jump');
 assert.equal(script.props.length,1);assert.equal(script.props[0].motion,'bob');
});

test('zones never overlap: actor and props above the log band, and frames swap in place',()=>{
 const box={w:900,h:600},script=normalizeScript(eggplant),actor={name:'茄子',sprite:{...script.actor.sprite,frames:[script.actor.sprite.rows.map(r=>r.split('').reverse().join(''))]}};
 const log=Array.from({length:6},(_,i)=>({id:'n'+i,text:'[ OK ] think  step '+i,state:' OK '}));
 const props=[{name:'话筒',place:'right',motion:'float',sprite:{palette:{m:'#cccccc'},rows:['mm','mm','mm'],w:2,h:3}}];
 const spec=buildActorScene({box,actor,beat:{action:'dance',actions:['dance','spin'],say:'看我的'},act:'spin',phase:'done',log,props,frame:1,swap:true});
 const logTexts=spec.texts.filter(t=>t.key.startsWith('log'));
 assert.equal(logTexts.length,4,'the band keeps the latest four events');
 const bandTop=Math.min(...logTexts.map(t=>t.y))-14;
 for(const m of spec.marks.filter(m=>m.group))assert.ok(m.y+m.h<=bandTop,m.id+' stays above the log band');
 assert.ok(spec.marks.filter(m=>m.group==='actor').every(m=>m.pop),'frame swaps pop in place');
 assert.equal(spec.motions.find(m=>m.group==='actor').type,'spin','the current action of the sequence is played');
 assert.ok(spec.motions.some(m=>m.group==='prop0'&&m.type==='float'));
 const glyph=buildActorScene({box,actor,beat:{action:'think',say:''},phase:'think',style:'glyph',fill:'先梳理当前问题模型返回很快'});
 assert.ok(glyph.marks.filter(m=>m.group==='actor').every(m=>m.shape==='glyph'&&m.ch),'thinking fills the shape with live text');
});

test('common JSON slips from long sprite arrays are repaired, other damage is reported',()=>{
 const broken='{"actor":{"name":"球","keep":false,"sprite":{"palette":{"k":"#000000"},"rows":["kkkk"\n"kkkk" "kkkk","kkkk",]}},"beats":{"done":{"actions":["jump","spin",],"say":"好"}},}';
 const script=parseScript(broken);
 assert.equal(script.actor.sprite.h,4);
 assert.deepEqual(script.beats.done.actions,['jump','spin']);
 assert.throws(()=>parseScript('{"actor": {"name": }'));
});

test('an extra closing brace at the end does not cost a second model call',()=>{
 const reply='{"actor":{"name":"茄子","keep":true,"sprite":null},"beats":{"done":{"actions":["dance"],"say":"我是茄子！"}},"effects":["sparkles"],"mood":"开心"}}';
 assert.equal(parseScript(reply).beats.done.say,'我是茄子！');
 assert.equal(parseScript(reply+'\n希望你喜欢 {笑}').mood,'开心');
});

test('an unclosed actor (the slip seen from the real model) is closed and its fields hoisted',()=>{
 const reply='{"actor":{"name":"茄子","keep":false,"sprite":{"palette":{"k":"#000000","p":"#7a3fa8"},"rows":["kkkk","kppk","kppk","kkkk"]},"frames":[{"rows":["kkkk","kppk","kppk","kk.."]}],"scene":"actor","beats":{"done":{"actions":["jump","spin"],"say":"紫紫的"}},"props":[],"effects":["sparkles"],"mood":"开心"}';
 const script=parseScript(reply);
 assert.deepEqual(script.beats.done.actions,['jump','spin']);
 assert.equal(script.actor.sprite.frames.length,1);
 assert.equal(script.mood,'开心');
});

test('the opening sequence shows real values, stays on the canvas and ends with RUN',()=>{
 const {introSteps}=require('../src/stage-intro.cjs');
 const info={version:'0.10.0',session:'abcdef123456',model:'deepseek-flash',director:true,actor:'茄子',sprite:normalizeScript(eggplant).actor.sprite,figures:21,actions:16,dwell:8,turns:3,nodes:40,chars:1234};
 const box={w:1200,h:700,raster:(t,size,step)=>({w:size,h:size,points:Array.from({length:30},(_,i)=>({x:(i%6)*step,y:Math.floor(i/6)*step}))})};
 const steps=introSteps(info),keys=steps.map(s=>s[1]);
 assert.deepEqual(keys.slice(-3),['1','run','end']);
 assert.ok(steps.every((s,i)=>!i||s[0]>steps[i-1][0]),'steps are in time order');
 const all=[];
 for(const [,key,build] of steps){if(!build)continue;const spec=build(box),ids=new Set();
  for(const m of spec.marks){assert.ok(!ids.has(m.id),key+' '+m.id);ids.add(m.id);assert.ok(m.x>=-2&&m.x<=box.w&&m.y>=-2&&m.y<=box.h,key+' '+m.id);}
  all.push(...spec.texts.map(t=>t.text));}
 const text=all.join('\n');
 for(const value of ['deepseek-flash','茄子','abcdef12','0.10.0','[WARN] director: +1 model call per message'])assert.ok(text.includes(value),value);
});

test('the stage reads in coarse steps: merged to ~160 chars, fences whole, stable while streaming',()=>{
 const {coarseSlices,slices}=require('../src/process-data.cjs');
 const text='先梳理当前问题：模型返回很快。约束：左侧继续使用原生聊天。首先拆解三个步骤。第一步：把公开推理按句子拆分。第二步：新内容进入待阅队列。第三步：为比较安排版式。方案 A：使用 SVG。方案 B：使用 Canvas。比较之后：保留原文。\n```js\nconst a = 1;\nconst b = 2;\n```\n检查：流式片段沿用原编号。核验：工具结果单独记录。';
 const coarse=coarseSlices(text),fine=slices(text);
 assert.ok(coarse.length<fine.length/2,`${coarse.length} coarse vs ${fine.length} fine steps`);
 coarse.slice(0,-1).forEach(p=>assert.ok(p.end-p.start>=150||/```/.test(p.text)||/```/.test(text.slice(p.end,p.end+6)),'only the tail or a fence neighbour is short'));
 assert.ok(coarse.some(p=>p.text.startsWith('```')&&p.text.trimEnd().endsWith('```')),'the code fence stays one step');
 const half=coarseSlices(text.slice(0,120));
 half.slice(0,-1).forEach((p,i)=>assert.deepEqual([p.start,p.end],[coarse[i].start,coarse[i].end]),'earlier steps keep their bounds while text streams');
});

test('the opening is claimed once per page, however many stages mount',()=>{
 const {claimIntro}=require('../src/stage-intro.cjs');
 assert.equal(claimIntro(),true);
 assert.equal(claimIntro(),false);
 assert.equal(claimIntro(),false);
});
