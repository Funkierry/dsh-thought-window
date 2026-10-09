const {test}=require('node:test');
const assert=require('node:assert/strict');
const {splitGeometry,transitionFor,flightPoints}=require('../src/choreography.cjs');
test('resizable left chat reserves enough space and rejects invalid saved ratios',()=>{
 for(const ratio of [-3,.35,.56,.68,9,NaN]){
   const result=splitGeometry(1200,ratio);assert.ok(result.panel<=860);assert.ok(result.ratio>=.35&&result.ratio<=.68);
 }
 assert.equal(splitGeometry(800).stacked,true);assert.equal(splitGeometry(1200).stacked,false);
 assert.equal(splitGeometry(1200,NaN).ratio,.56);assert.equal(splitGeometry(0).panel,0);
});
test('scene transitions use different continuous motions with bounded deterministic carriers',()=>{
 const scenes=['analysis','plan','compare','search','code','math','execute','check','revise','summary'];
 assert.ok(new Set(scenes.map(id=>transitionFor('idle',id))).size>=8);
 for(const id of scenes){const points=flightPoints('analysis',id);assert.equal(points.length,48);assert.deepEqual(points,flightPoints('analysis',id));
   assert.ok(points.every(p=>[p.start,p.mid,p.end].every(v=>Number.isFinite(v.x)&&Number.isFinite(v.y))&&p.delay<110));
 }
});
