'use strict';
const {THEMES}=require('./scenes.cjs');
const classes=Object.keys(THEMES).map(key=>'tw-native-'+key);
const owners=new Map();
let original=null;
// The sidebar and portalled menus live outside the conversation root. Lease the
// same tokens at body level while a window is open, without changing DSH's theme
// preference or data-ds-dark-theme attribute. Multiple session panes can coexist.
function acquireHostTheme(root,body=document.body){
  const owner={root,body,theme:'paper'};
  if(!owners.size)original=new Set([...classes,'tw-host-theme'].filter(name=>body.classList.contains(name)));
  owners.set(owner,owner);
  function apply(){
    const active=[...owners.values()].at(-1);
    for(const name of classes)body.classList.toggle(name,active?name==='tw-native-'+active.theme:original?.has(name));
    body.classList.toggle('tw-host-theme',!!active||original?.has('tw-host-theme'));
  }
  return {
    set(theme){
      if(!owners.has(owner))return;
      owner.theme=Object.hasOwn(THEMES,theme)?theme:'paper';
      for(const name of classes)root.classList.toggle(name,name==='tw-native-'+owner.theme);
      apply();
    },
    release(){
      owners.delete(owner);root.classList.remove(...classes);apply();
      if(!owners.size)original=null;
    }
  };
}
module.exports={acquireHostTheme};
