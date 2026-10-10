import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const ids=['work-data','host-bridge','core','run-metrics','storage','scenes','choreography','transition','figure','adaptive','terminal','process-data','process','stage-data','stage-pages','stage-figures','stage-engine','sprite-rig','sprite-presets','director-script','outline','director','stage-actor','stage-intro','stage','workbench','view','host-theme','client'];
const modules=[];
for(const id of ids) modules.push(`${JSON.stringify('./'+id+'.cjs')}: function(module,exports,require){\n${await readFile(path.join(root,'src',id+'.cjs'),'utf8')}\n}`);
modules.push(`"./style.css": function(module){module.exports=${JSON.stringify((await readFile(path.join(root,'src/style.css'),'utf8'))+'\n'+(await readFile(path.join(root,'src/adaptive.css'),'utf8'))+'\n'+(await readFile(path.join(root,'src/cinema.css'),'utf8'))+'\n'+(await readFile(path.join(root,'src/host.css'),'utf8'))+'\n'+(await readFile(path.join(root,'src/process.css'),'utf8'))+'\n'+(await readFile(path.join(root,'src/workbench.css'),'utf8'))+'\n'+(await readFile(path.join(root,'src/stage.css'),'utf8')))};}`);
const bundle=`/* Thought Window 0.14.4 | MIT | See NOTICE.md for reference credits | platform React is provided by DSH */\nwindow.__ModuleLoader__.load({id:"dsh-thought-window",factory:function(platformRequire){\n"use strict";\nconst modules={${modules.join(',\n')}};\nconst cache=Object.create(null);\nfunction require(id){if(!Object.hasOwn(modules,id))return platformRequire(id);if(cache[id])return cache[id].exports;const module={exports:{}};cache[id]=module;modules[id](module,module.exports,require);return module.exports;}\nreturn require("./client.cjs");\n}});\n`;
await mkdir(path.join(root,'lib'),{recursive:true});
await writeFile(path.join(root,'lib/client.js'),bundle);
// Host half: the stage director route, loaded by DSH as the package main.
await writeFile(path.join(root,'lib/index.js'),await readFile(path.join(root,'src/host.mjs'),'utf8'));
console.log('Built lib/client.js ('+Buffer.byteLength(bundle)+' bytes) and lib/index.js');
