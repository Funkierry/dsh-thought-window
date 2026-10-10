'use strict';
// Whole-stage pages share the reading cursor, but have their own playback clock.
// A page is admitted only when its builder has the public data it needs.
const D=require('./stage-data.cjs');
const PAGE_SECONDS=3;
const PAGE_NAMES={glyph:'输入速写',tokenizer:'文本拆解',bars:'字数节奏',radar:'关键词雷达',grid:'步骤方格',mask:'片段关系',agentloop:'执行循环',constellation:'词语星图',heatmap:'词频热图',curve:'内容到达曲线',timeline:'运行时间线',tokens:'上下文用量',todos:'待办进度',files:'文件成果',actor:'角色舞台',outline:'思路提纲',code:'代码窗口',formula:'公式摘录',compare:'方案对照',diff:'修改对照',errorbig:'错误记录',exec:'工具往返',compose:'回答拼接',table:'回答表格'};
function stagePages(entries,index,{avail={},actor=true,outline=false}={}){
 const focus=entries[index];
 if(!focus)return actor?['actor']:['idle'];
 const upto=entries.slice(0,index+1),texts=upto.filter(e=>e.kind!=='input'||entries.length<2);
 const keywords=D.keywords(texts.map(e=>e.text),16).length;
 const ids=[focus.kind==='input'?'glyph':'tokenizer','bars'];
 const specialized={code:'code',math:'formula',compare:'compare',revise:'diff',error:'errorbig',retry:'errorbig',request:'exec',result:'exec',answer:D.tableOf(focus.text).length?'table':'compose'}[focus.kind];
 if(specialized)ids.unshift(specialized);
 if(keywords)ids.push('radar');
 if(upto.length>=2)ids.push('grid','mask');
 if(texts.length)ids.push('agentloop');
 if(keywords>=3)ids.push('constellation');
 if(texts.length>=2&&keywords>=2)ids.push('heatmap');
 if(upto.length>=2)ids.push('curve');
 for(const id of ['timeline','tokens','todos','files'])if(avail[id])ids.push(id);
 if(outline)ids.push('outline');
 if(actor)ids.push('actor');
 return [...new Set(ids)];
}
function nextPage(pages,current,offset=1){
 if(!pages.length)return null;
 const at=Math.max(0,pages.indexOf(current));
 return pages[((at+offset)%pages.length+pages.length)%pages.length];
}
// Finish the entrance within the first half of a 3 s page. Long staggered
// drawings otherwise finish appearing just as the next page starts.
function pacePage(spec){
 const max=Math.max(1,...(spec.marks||[]).map(m=>m.delay||0));
 return {...spec,marks:(spec.marks||[]).map(m=>({...m,delay:(m.delay||0)*Math.min(1,400/max)})),texts:(spec.texts||[]).map(t=>({...t,delay:Math.min(250,t.delay||0)}))};
}
module.exports={PAGE_SECONDS,PAGE_NAMES,stagePages,nextPage,pacePage};
