'use strict';
// Scene geometry is presentation only. No synthetic model metrics are generated.
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const transitionFor=(from,to)=>{
  if(from===to)return 'reflow';
  return ({idle:'decode',analysis:'reflow',plan:'pan',compare:'fork',search:'orbit',code:'focus',math:'focus',execute:'conduit',check:'fold',revise:'rewind',summary:'gather'})[to]||'reflow';
};
function pointsFor(scene,count=48){
  return Array.from({length:count},(_,i)=>{
    const u=i/Math.max(1,count-1),col=i%12,row=Math.floor(i/12),a=u*Math.PI*2;
    switch(scene){
      case 'plan':return {x:68+(i%4)*166+(Math.floor(i/4)%3)*9,y:70+(i%4)*37+Math.floor(i/12)*10};
      case 'compare':return {x:i%2?438+(i%5)*12:112+(i%5)*12,y:95+Math.floor(i/2)*5};
      case 'search':return {x:320+Math.cos(a)*190,y:150+Math.sin(a)*92};
      case 'code':return {x:78+col*40,y:72+row*46};
      case 'math':return {x:54+u*530,y:150+Math.sin(u*Math.PI*4)*72};
      case 'execute':return {x:52+u*540,y:150+(i%3-1)*12};
      case 'check':return {x:88+col*42,y:68+row*48};
      case 'revise':return {x:i%2?360+(i%6)*27:62+(i%6)*27,y:72+Math.floor(i/6)*21};
      case 'summary':return {x:210+col*18,y:73+row*38};
      default:return {x:40+u*560,y:140+Math.sin(i*1.76)*70+Math.cos(i*.4)*26};
    }
  });
}
function flightPoints(from,to,count=48){
  const a=pointsFor(from,count),b=pointsFor(to,count);
  return a.map((start,i)=>({start,end:b[i],mid:{x:(start.x+b[i].x)/2+(b[i].y-start.y)*.12,y:(start.y+b[i].y)/2-(b[i].x-start.x)*.1},delay:(i%8)*13}));
}
function splitGeometry(width,ratio=.56){
  const value=Number.isFinite(ratio)?clamp(ratio,.35,.68):.56;
  return {ratio:value,stacked:width<920,panel:Math.max(0,Math.min(width*value,width-340))};
}
module.exports={transitionFor,pointsFor,flightPoints,splitGeometry};
