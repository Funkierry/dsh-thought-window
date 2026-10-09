'use strict';
const React=require('react');
const {createElement:h,useState,useEffect,useLayoutEffect,useRef}=React;
const {transitionFor,flightPoints}=require('./choreography.cjs');
function useMotionAllowed(animate){
  const [reduced,setReduced]=useState(()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false);
  useEffect(()=>{const media=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');if(!media)return;const change=()=>setReduced(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
  return animate&&!reduced;
}
function TransitionStage({sceneKey,scene,children,animate,motion,instant}){
  const allowed=useMotionAllowed(animate)&&!instant;
  const previous=useRef(null),serial=useRef(0),active=useRef(null);
  const root=useRef(null),incoming=useRef(null),outgoing=useRef(null);
  const [cut,setCut]=useState(null);
  useLayoutEffect(()=>{
    const old=previous.current;
    if(!allowed){active.current?.();setCut(null);}
    else if(old&&old.key!==sceneKey){
      active.current?.();
      setCut({serial:++serial.current,from:old.scene,to:scene,kind:transitionFor(old.scene,scene),content:old.content});
    }
    previous.current={key:sceneKey,scene,content:children};
  },[sceneKey,allowed]);
  // Preserve the latest streamed text as the outgoing scene, without restarting a cut.
  useLayoutEffect(()=>{previous.current={key:sceneKey,scene,content:children};});
  useLayoutEffect(()=>{
    if(!cut||!allowed)return;
    const duration=motion==='calm'?220:760;
    const ease='cubic-bezier(.22,.72,.18,1)';
    const motions={
      reflow:['translateY(12px) scale(.985)','translateY(-8px) scale(1.01)'],
      pan:['translateX(48px)','translateX(-40px)'],
      fork:['scaleX(.88) translateY(12px)','scale(.96) translateY(-12px)'],
      orbit:['translateX(22px) rotate(1.5deg)','translateX(-20px) rotate(-1.5deg)'],
      focus:['scale(1.08)','scale(.93)'],
      conduit:['translateX(60px)','translateX(-46px)'],
      fold:['perspective(900px) rotateX(-9deg) translateY(14px)','perspective(900px) rotateX(8deg) translateY(-12px)'],
      rewind:['translateX(-38px)','translateX(35px)'],
      gather:['scale(.94) translateY(20px)','scale(1.04) translateY(-14px)'],
      decode:['scale(.98)','scale(1.02)']
    };
    const [enter,leave]=motions[cut.kind]||motions.reflow;
    const animations=[];
    const play=(el,frames,options)=>{if(el?.animate)animations.push(el.animate(frames,options));};
    // Align the carrier layer to the actual responsive SVG viewport before motion.
    const figure=incoming.current?.querySelector('.tw-film-figure svg');
    const field=root.current?.querySelector('.tw-flight-field');
    const oldFigure=outgoing.current?.querySelector('.tw-film-figure svg');
    const oldMatrix=oldFigure?.getScreenCTM(),newInverse=figure?.getScreenCTM()?.inverse();
    if(field&&figure){const box=figure.getBoundingClientRect(),base=root.current.getBoundingClientRect();Object.assign(field.style,{left:(box.left-base.left)+'px',top:(box.top-base.top)+'px',width:box.width+'px',height:box.height+'px',maxHeight:'none',aspectRatio:'auto'});}
    play(incoming.current,[{opacity:0,transform:motion==='calm'?'none':enter},{opacity:1,transform:'none'}],{duration,easing:ease,fill:'both'});
    play(outgoing.current,[{opacity:.85,transform:'none'},{opacity:0,transform:motion==='calm'?'none':leave}],{duration:duration*.7,easing:ease,fill:'both'});
    if(motion==='rich'){
      const flights=flightPoints(cut.from,cut.to);
      root.current?.querySelectorAll('.tw-flight-pixel').forEach((el,i)=>{
        const p={...flights[i]};
        if(oldMatrix&&newInverse){const point=new DOMPoint(p.start.x,p.start.y).matrixTransform(oldMatrix).matrixTransform(newInverse);p.start={x:point.x,y:point.y};p.mid={x:(p.start.x+p.end.x)/2+(p.end.y-p.start.y)*.12,y:(p.start.y+p.end.y)/2-(p.end.x-p.start.x)*.1};}
        play(el,[{opacity:0,transform:`translate(${p.start.x}px,${p.start.y}px) scale(.6)`},{opacity:.9,offset:.22},{opacity:.85,offset:.55,transform:`translate(${p.mid.x}px,${p.mid.y}px) scale(1.2)`},{opacity:0,transform:`translate(${p.end.x}px,${p.end.y}px) scale(.6)`}],{duration:duration*.85,delay:p.delay,easing:ease,fill:'both'});
      });
      const flightsMain=flightPoints(cut.from,cut.to,1)[0];
      play(root.current?.querySelector('.tw-flight-carrier'),[{opacity:0,transform:`translate(${flightsMain.start.x}px,${flightsMain.start.y}px)`},{opacity:1,offset:.18},{opacity:1,offset:.8},{opacity:0,transform:`translate(${flightsMain.end.x}px,${flightsMain.end.y}px)`}],{duration,easing:ease,fill:'both'});
    }
    const token=cut.serial;
    const timer=setTimeout(()=>{animations.forEach(a=>a.cancel());setCut(old=>old?.serial===token?null:old);},duration+140);
    const cancel=()=>{clearTimeout(timer);animations.forEach(a=>a.cancel());};
    active.current=cancel;
    return()=>{cancel();if(active.current===cancel)active.current=null;};
  },[cut,allowed,motion]);
  return h('div',{ref:root,className:'tw-continuity-stage','data-cut':cut?.kind||'hold'},
    cut?h('div',{ref:el=>{outgoing.current=el;if(el)el.inert=true;},className:'tw-shot-out','aria-hidden':true,key:'out:'+cut.serial},cut.content):null,
    h('div',{ref:incoming,className:'tw-shot-in'},children),
    cut&&allowed&&motion==='rich'?h('svg',{className:'tw-flight-field',viewBox:'0 0 640 300','aria-hidden':true,key:'flight:'+cut.serial},Array.from({length:48},(_,i)=>h('g',{key:i,className:'tw-flight-pixel'},i%3===0?h('text',{x:0,y:4},['·','+','▤','/'][i%4]):h('rect',{x:-1.5,y:-1.5,width:3,height:3}))),h('g',{className:'tw-flight-carrier'},h('rect',{x:-4,y:-4,width:8,height:8}),h('rect',{x:-9,y:-9,width:18,height:18,className:'tw-carrier-halo'}))):null);
}
module.exports={TransitionStage,useMotionAllowed};
