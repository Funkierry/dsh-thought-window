'use strict';
// Measurements for the stage. Every number drawn there comes from this file:
// lengths, word segments with source offsets, character-bigram overlap, a fixed
// hash projection and observed arrival samples. None is a model-internal value.
const STOP=new Set(['我','你','他','她','它','我想','想要','接着','应该','关系','希望','帮我','请','做','让','给','一下','怎么','如何','为什么','的','了','是','在','和','与','或','及','把','被','将','对','从','也','都','就','而','并','但','这','那','这个','那个','一个','一些','我们','你们','他们','需要','可以','然后','如果','因为','所以','进行','当前','使用','通过','以及','没有','已经','还是','这样','这里','什么','怎么','时候','现在','部分','内容','问题','the','and','for','with','that','this','from','into','are','was','were','will','can','not','but','you','your','have','has','its','then','than','when','what','which','there','their','also','just','only','each','more','some']);
const segmenter=typeof Intl!=='undefined'&&Intl.Segmenter?new Intl.Segmenter('zh',{granularity:'word'}):null;
const chars=text=>Array.from(String(text||''));
const length=text=>chars(text).length;
const short=(text,n=40)=>{const list=chars(String(text||'').replace(/\s+/g,' ').trim());return list.length>n?list.slice(0,n-1).join('')+'…':list.join('');};
const isCJK=ch=>/[㐀-鿿豈-﫿]/u.test(ch);
const fmt=n=>Math.round(n).toLocaleString('en-US');

// Word chips with their offset in the entry text. Punctuation joins the
// previous chip so a sentence reads as words, not as separate symbols.
function words(text){
 const source=String(text||''),out=[];
 const push=(segment,index,word)=>{
  if(!segment.trim())return;
  if(!word&&out.length&&!/^[\[(（「《]/u.test(segment))out.at(-1).text+=segment;
  else out.push({text:segment,index,word});
 };
 if(segmenter)for(const s of segmenter.segment(source))push(s.segment,s.index,!!s.isWordLike);
 else{const re=/[A-Za-z0-9_]+|[㐀-鿿]|\S/gu;let m;while((m=re.exec(source)))push(m[0],m.index,/[\w㐀-鿿]/u.test(m[0]));}
 return out;
}
function keywords(texts,limit=12){
 const count=new Map();
 for(const text of texts)for(const w of words(text)){
  if(!w.word)continue;
  const key=w.text.replace(/[\p{P}\p{S}\s]+/gu,'').toLowerCase();
  const size=length(key);
  if(STOP.has(key)||/^\d+$/.test(key)||(isCJK(key[0])?size<2:size<3)||size>14)continue;
  count.set(key,(count.get(key)||0)+1);
 }
 return [...count].map(([word,n])=>({word,count:n})).sort((a,b)=>b.count-a.count||length(b.word)-length(a.word)).slice(0,limit);
}
function bigrams(text){
 const list=chars(String(text||'').toLowerCase().replace(/\s+/g,''));
 const set=new Set();
 if(list.length<2){if(list[0])set.add(list[0]);return set;}
 for(let i=0;i<list.length-1;i++)set.add(list[i]+list[i+1]);
 return set;
}
function jaccard(a,b){
 if(!a.size&&!b.size)return 0;
 let shared=0;for(const x of a)if(b.has(x))shared++;
 return shared/(a.size+b.size-shared);
}
function hash(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function random(seed){let a=seed>>>0;return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
// Bigram counts hashed into 48 buckets, then a fixed seeded projection to
// x/y/z in [0,1]. Similar wording lands nearby; it is not a semantic embedding.
function project(texts){
 const rng=random(7),axes=[0,1,2].map(()=>Array.from({length:48},()=>rng()*2-1));
 const raw=texts.map(text=>{
  const v=new Float64Array(48);for(const g of bigrams(text))v[hash(g)%48]+=1;
  const norm=Math.hypot(...v)||1;
  return axes.map(axis=>axis.reduce((sum,a,i)=>sum+a*v[i]/norm,0));
 });
 return raw.map(p=>p.map((value,d)=>{
  const list=raw.map(q=>q[d]),min=Math.min(...list),max=Math.max(...list);
  return max-min<1e-9?.5:(value-min)/(max-min);
 }));
}
function overlap(texts){
 const sets=texts.map(bigrams);
 return sets.map((a,i)=>sets.slice(0,i+1).map((b,j)=>i===j?1:jaccard(a,b)));
}
const PHASES={input:['00','STDIN'],request:['02','TOOL'],result:['02','TOOL'],answer:['03','OUTPUT'],error:['!!','ERROR'],retry:['!!','RETRY']};
const phaseOf=kind=>PHASES[kind]||['01','THINK'];

// Figure choice is a pure function of the queue position (and of which run
// records exist), so a streaming sentence keeps its drawing. Kinds with several
// drawings alternate along a run of the same kind; plain reasoning rotates
// through scenes that carry information. Data scenes need their data:
// avail = {timeline, tokens, todos, files}.
const BY_KIND={input:['glyph'],plan:['agentloop','todos','heatmap','grid'],constraint:['agentloop','constellation','tokenizer'],compare:['nexttoken','compare','constellation'],search:['radar','tokenizer','nexttoken'],code:['code'],math:['formula','spiral'],check:['todos','boot','radar','agentloop'],revise:['diff','redline'],error:['errorbig','timeline'],retry:['errorbig','diff'],request:['timeline','exec','agentloop'],result:['exec','timeline'],answer:['compose']};
const ROTATION=['tokenizer','timeline','radar','nexttoken','tokens','heatmap','agentloop','constellation','spiral','grid'];
const NEEDS={grid:2,nexttoken:3,radar:2,heatmap:3,constellation:3};
const DATA=['timeline','tokens','todos','files'];
function baseFigure(entries,index,avail={}){
 const entry=entries[index];
 if(!entry)return 'idle';
 if(entry.kind==='answer'&&/^\s*\|.*\|\s*$/m.test(entry.text))return 'table';
 const fits=id=>index+1>=(NEEDS[id]||0)&&(!DATA.includes(id)||!!avail[id]);
 // A tool that wrote todos or files shows what it wrote.
 if(entry.kind==='request'||entry.kind==='result'){
  if(/todo/i.test(entry.title)&&avail.todos)return 'todos';
  if(/write|edit|replace|create|patch|present|save/i.test(entry.title)&&avail.files)return 'files';
 }
 const options=BY_KIND[entry.kind];
 if(options){
  let run=0;for(let i=index-1;i>=0&&entries[i].kind===entry.kind;i--)run++;
  const usable=options.filter(fits);
  return usable.length?usable[run%usable.length]:options.find(id=>!DATA.includes(id))||'tokenizer';
 }
 for(let i=0;i<ROTATION.length;i++){const id=ROTATION[(index+i)%ROTATION.length];if(fits(id))return id;}
 return 'tokenizer';
}
function chooseFigure(entries,index,avail={}){
 const id=baseFigure(entries,index,avail),kind=entries[index]?.kind;
 if(index<1||['request','result','input','answer','code'].includes(kind))return id;
 const previous=chooseFigure(entries,index-1,avail);
 if(previous!==id)return id;
 // Same drawing as the step before: a kind with alternatives takes another one.
 const fits=f=>index+1>=(NEEDS[f]||0)&&(!DATA.includes(f)||avail[f]);
 const other=(BY_KIND[kind]||[]).find(f=>f!==id&&fits(f));
 if(other)return other;
 if(BY_KIND[kind])return id;
 {
  const at=ROTATION.indexOf(id);
  for(let i=1;i<ROTATION.length;i++){const next=ROTATION[(at+i)%ROTATION.length];if(index+1>=(NEEDS[next]||0)&&(!DATA.includes(next)||avail[next]))return next;}
 }
 return id;
}
function tableOf(text){
 return String(text||'').split('\n').filter(l=>/^\s*\|.*\|\s*$/.test(l)&&!/^[\s|:\-]+$/.test(l))
  .map(l=>l.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim()));
}
module.exports={words,keywords,bigrams,jaccard,hash,random,project,overlap,phaseOf,chooseFigure,tableOf,length,short,isCJK,fmt,chars};
