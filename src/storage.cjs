'use strict';
const DB='dsh-thought-window-v1';
function openDB() {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('sessions',{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
async function transaction(mode,run) {
  const db=await openDB();
  try {
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction('sessions',mode);
      const result=run(tx.objectStore('sessions'));
      tx.oncomplete=()=>resolve(result?.result);
      tx.onerror=()=>reject(tx.error);
      tx.onabort=()=>reject(tx.error || Error('保存已取消'));
    });
  } finally {db.close();}
}
async function save(id,frames) {
  await transaction('readwrite',store=>store.put({id,updated:Date.now(),frames}));
  // Retain at most ten sessions in this plugin's own store.
  await transaction('readwrite',store=>{
    const req=store.getAll();
    req.onsuccess=()=>req.result.sort((a,b)=>b.updated-a.updated).slice(10).forEach(r=>store.delete(r.id));
    return req;
  });
}
const load=id=>transaction('readonly',store=>store.get(id));
const remove=id=>transaction('readwrite',store=>store.delete(id));
const clear=()=>transaction('readwrite',store=>store.clear());
module.exports={save,load,remove,clear};
