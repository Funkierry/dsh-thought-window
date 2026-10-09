'use strict';
const {fileAddress}=require('./work-data.cjs');
function createHostBridge(ctx){
 const service=name=>{try{return ctx.get?.(name);}catch{return undefined;}};
 return {
  cwd(sessionId){return service('sessions')?.list?.getSnapshot()?.byId?.[sessionId]?.cwd||'';},
  canOpen(){return typeof service('sidebarRight')?.openResource==='function';},
  openFile(sessionId,path){
   const sidebar=service('sidebarRight');if(!sidebar?.openResource)throw Error('当前宿主未提供文件预览入口，请使用聊天中的文件链接。');
   const cwd=service('sessions')?.list?.getSnapshot()?.byId?.[sessionId]?.cwd;
   sidebar.openResource(fileAddress(sessionId,cwd,path));
  },
  readPreview(sessionId){
   const sidebar=service('sidebarRight'),tab=sidebar?.active?.();
   const prefix='dsh-resource://file/session/'+encodeURIComponent(String(sessionId)).replace(/%3A/gi,':')+'/';
   const address=typeof tab?.contentId==='string'?tab.contentId:'';
   if(!sidebar?.isExpanded?.()||!address.startsWith(prefix))return {open:false,path:'',address:''};
   let path=address.slice(prefix.length);try{path=path.split('/').map(decodeURIComponent).join('/');}catch{}
   return {open:true,path,address};
  }
 };
}
module.exports={createHostBridge};
