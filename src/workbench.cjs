'use strict';
const React=require('react');
const {createElement:h,useEffect,useState}=React;
const {EMPTY_WORK,basename}=require('./work-data.cjs');
const fileLabel=file=>file.status==='error'?'本次修改失败':file.status==='running'?'等待写入结果':file.status==='stopped'?'未确认写入':file.declared?'已交付':file.action==='write'?'已写入':'已修改';
const ready=file=>file.status==='done'||file.changes>0||file.declared;
const typeOf=path=>({html:'HTML',htm:'HTML',pdf:'PDF',md:'MD',png:'IMG',jpg:'IMG',jpeg:'IMG',gif:'IMG',svg:'IMG',webp:'IMG',py:'PY',js:'JS',ts:'TS',json:'JSON',csv:'CSV',xlsx:'XLSX',docx:'DOCX'})[String(path).split('.').at(-1).toLowerCase()]||'FILE';
function WorkSummary({work=EMPTY_WORK,onShow}){
 const latest=work.runs.at(-1),errors=work.runs.filter(r=>r.status==='error').length;
 if(!work.files.length&&!work.runs.length)return null;
 return h('button',{type:'button',className:'tw-work-summary',onClick:onShow},h('span',null,'BUILD / RUN'),h('b',null,work.files.length+' 文件 · '+work.runs.length+' 次调用'),h('span',{'data-status':errors?'error':latest?.status},errors?errors+' 条异常记录':latest?.label||'文件状态已更新'),h('span',null,'查看成果 ↗'));
}
function PreviewDock({work=EMPTY_WORK,preview,onExpand,onWork}){
 const latest=work.runs.at(-1),file=work.files.at(-1);
 return h('div',{className:'tw-preview-summary','aria-label':'成果预览伴随条'},
  h('div',null,h('span',{className:'tw-dock-mark'},'▦'),h('strong',null,'THOUGHT WINDOW'),h('small',null,'0.10.1 / 成果模式'),h('span',{className:'tw-spacer'}),h('button',{type:'button',onClick:onExpand},'展开过程'),h('button',{type:'button',onClick:onWork},'成果 / 运行')),
  h('div',{className:'tw-preview-now'},h('span',null,'VIEW'),h('strong',{title:preview.path},basename(preview.path)||'原生预览'),h('small',null,work.files.length+' 文件 · '+work.runs.length+' 次调用')),
  h('div',{className:'tw-preview-last','data-status':latest?.status},h('span',null,latest?'RUN':file?'FILE':'TRACE'),h('span',{title:latest?.command||file?.path||''},latest?latest.label+' · '+latest.command:file?fileLabel(file)+' · '+file.name:'预览期间暂停逐条阅读，展开后继续。')));
}
function Workbench({work=EMPTY_WORK,onOpenFile,onSelect,replaying=false,preview}){
 const [active,setActive]=useState(null),[follow,setFollow]=useState(true),[notice,setNotice]=useState('');
 const latest=work.runs.at(-1),selected=work.runs.find(r=>r.id===active)||latest;
 useEffect(()=>{if(follow)setActive(latest?.id||null);},[latest?.id,follow]);
 const failed=work.runs.filter(r=>r.status==='error').length;
 async function open(file){
  setNotice('');
  try{await onOpenFile(file.path);}catch(error){setNotice('未能打开预览：'+(error?.message||'请从原生聊天中的文件入口重试。'));}
 }
 return h('section',{className:'tw-workbench','aria-label':'成果与运行工作台'},
  h('header',{className:'tw-work-heading'},h('div',null,h('small',null,'ARTIFACT WORKBENCH'),h('h2',null,'从生成到运行，再到成果')),h('span',null,replaying?'回放记录':'本轮实时记录')),
  h('div',{className:'tw-build-route'},h('div',null,h('b',null,String(work.files.length).padStart(2,'0')),h('span',null,'FILE / 文件改动与交付')),h('i',{'aria-hidden':true},'→'),h('div',{'data-status':failed?'error':latest?.status},h('b',null,String(work.runs.length).padStart(2,'0')),h('span',null,'RUN / 命令与结果')),h('i',{'aria-hidden':true},'→'),h('div',null,h('b',null,preview?.open?'OPEN':'VIEW'),h('span',null,'DSH / 原生成果预览'))),
  h('div',{className:'tw-work-columns'},
   h('section',{className:'tw-work-files tw-inset-frame'},h('div',{className:'tw-frame-caption'},h('span',null,'files / 成果索引'),h('small',null,work.files.length+' 项')),
    h('div',{className:'tw-file-list'},work.files.length?work.files.map(file=>h('article',{className:'tw-file-card',key:file.path,'data-status':file.status},
     h('header',null,h('span',{className:'tw-file-kind'},typeOf(file.path)),h('div',null,h('strong',{title:file.path},file.name),h('small',null,fileLabel(file)))),
     h('code',{title:file.path},file.path),file.description?h('p',null,file.description):null,
     h('div',{className:'tw-file-facts'},h('span',null,file.changes?'已确认修改 '+file.changes+' 次':file.declared?'交付声明已记录':'等待工具结果'),file.lines?h('span',null,'写入参数 '+file.lines+' 行'):null),
     h('footer',null,h('button',{type:'button',disabled:replaying||!ready(file)||!onOpenFile,onClick:()=>open(file)},typeOf(file.path)==='HTML'?'预览 HTML ↗':'在 DSH 预览 ↗'),file.nodeId?h('button',{type:'button',onClick:()=>onSelect(file.nodeId)},'工具原文'):null)
    )):h('p',{className:'tw-work-empty'},'文件写入、修改或显式交付后，这里会出现可打开的成果。'))),
   h('section',{className:'tw-work-runs tw-inset-frame'},h('div',{className:'tw-frame-caption'},h('span',null,'process / 运行记录'),h('small',null,failed?failed+' 条异常':'只读日志')),
    work.runs.length?h(React.Fragment,null,
     h('nav',{className:'tw-run-list','aria-label':'命令调用记录'},work.runs.map((run,i)=>h('button',{type:'button',key:run.id,'aria-pressed':selected?.id===run.id,'data-status':run.status,onClick:()=>{setActive(run.id);setFollow(false);}},h('small',null,String(i+1).padStart(2,'0')),h('span',{title:run.command},run.command),h('b',null,run.label)))),
     selected?h('div',{className:'tw-run-detail','data-status':selected.status},
      h('div',{className:'tw-run-title'},h('span',null,selected.name.toUpperCase()),h('b',null,selected.label),h('button',{type:'button',onClick:()=>setFollow(!follow),'aria-pressed':follow},follow?'跟随最新':'跟随已暂停')),
      h('pre',{className:'tw-run-command'},'> '+selected.command),selected.cwd?h('small',{className:'tw-run-cwd'},'cwd / '+selected.cwd):null,
      h('div',{className:'tw-stdout-title'},'stdout / stderr'),h('pre',{className:'tw-run-output',tabIndex:0},selected.output||(['running','submitted'].includes(selected.status)?'尚未收到输出。':'此调用没有文本输出。')),
      selected.truncated?h('small',null,'长输出保留末尾 8,000 字符；完整记录请看原生工具消息。'):null,
      h('button',{type:'button',className:'tw-run-source',onClick:()=>onSelect(selected.nodeId)},'查看工具原文 ↗')):null
    ):h('div',{className:'tw-work-empty'},h('b',null,'[ _ ]'),h('p',null,'执行 PowerShell、Bash 或查询后台任务时，命令与返回输出会显示在这里。')))),
  notice?h('p',{className:'tw-work-notice',role:'status'},notice):null,
  h('p',{className:'tw-work-footnote'},replaying?'回放只展示当时记录；切回实时后可打开本会话成果。':'预览由 DSH 打开 · 运行记录实时更新 · 此面板不会重跑命令'),
  work.omitted?h('p',{className:'tw-work-footnote'},'已省略 '+work.omitted+' 条较早记录，完整内容保留在原生聊天。'):null);
}
module.exports={Workbench,WorkSummary,PreviewDock};
