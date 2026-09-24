import {useEffect, useRef, useState} from 'react';

export const MIN_ZOOM = .2;
export const MAX_ZOOM = 3;
const clamp = value => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));

export function useGraphViewport(canvas, width, height) {
  const [view, setView] = useState({x:0, y:0, scale:.65});
  const current = useRef(view), autoFit = useRef(true), pointers = useRef(new Map());
  const gesture = useRef(null), suppressClick = useRef(0);
  const update = next => { current.current = next; setView(next); };
  const fit = () => {
    const element = canvas.current;
    if (!element) return;
    const scale = clamp(Math.min(1, (element.clientWidth-32)/width, (element.clientHeight-32)/height));
    autoFit.current = true;
    update({scale, x:(element.clientWidth-width*scale)/2, y:(element.clientHeight-height*scale)/2});
  };
  const zoomAt = (scale, x, y) => {
    const previous = current.current, nextScale = clamp(scale);
    autoFit.current = false;
    update({scale:nextScale, x:x-(x-previous.x)*nextScale/previous.scale, y:y-(y-previous.y)*nextScale/previous.scale});
  };
  const zoomBy = factor => {
    const element = canvas.current;
    if (element) zoomAt(current.current.scale*factor,element.clientWidth/2,element.clientHeight/2);
  };
  const panBy = (x,y) => { autoFit.current=false; update({...current.current,x:current.current.x+x,y:current.current.y+y}); };
  useEffect(() => {
    const element = canvas.current;
    let previousSize = null;
    const resize = new ResizeObserver(() => {
      const size = {width:element.clientWidth,height:element.clientHeight};
      if (autoFit.current || !previousSize) fit();
      else panBy((size.width-previousSize.width)/2,(size.height-previousSize.height)/2);
      previousSize=size;
    });
    resize.observe(element);
    const wheel = event => {
      event.preventDefault();
      const bounds=element.getBoundingClientRect();
      // Trackpad pinch arrives as Ctrl+wheel; ordinary wheel zooms too.
      const delta=event.deltaY*(event.deltaMode===1 ? 16 : event.deltaMode===2 ? element.clientHeight : 1);
      zoomAt(current.current.scale*Math.exp(-Math.max(-300,Math.min(300,delta))*.002),event.clientX-bounds.left,event.clientY-bounds.top);
    };
    element.addEventListener('wheel',wheel,{passive:false});
    return () => { resize.disconnect(); element.removeEventListener('wheel',wheel); };
  }, [canvas,width,height]);
  const point = event => { const bounds=canvas.current.getBoundingClientRect(); return {x:event.clientX-bounds.left,y:event.clientY-bounds.top}; };
  const resetGesture = () => {
    const values=[...pointers.current.values()];
    gesture.current=values.length>1 ? {center:{x:(values[0].x+values[1].x)/2,y:(values[0].y+values[1].y)/2},distance:Math.hypot(values[1].x-values[0].x,values[1].y-values[0].y)} : values[0] ? {start:values[0],last:values[0],dragging:false} : null;
  };
  const onPointerDown = event => {
    if (event.pointerType==='mouse' && event.button!==0) return;
    pointers.current.set(event.pointerId,point(event)); resetGesture();
  };
  const onPointerMove = event => {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return;
    const next=point(event); pointers.current.set(event.pointerId,next);
    const previous=gesture.current;
    if (pointers.current.size>1) {
      const values=[...pointers.current.values()];
      const center={x:(values[0].x+values[1].x)/2,y:(values[0].y+values[1].y)/2};
      const distance=Math.hypot(values[1].x-values[0].x,values[1].y-values[0].y);
      if (previous.distance>0) {
        zoomAt(current.current.scale*distance/previous.distance,previous.center.x,previous.center.y);
        panBy(center.x-previous.center.x,center.y-previous.center.y);
      }
      gesture.current={center,distance};
    } else {
      if (!previous.start) { resetGesture(); return; }
      if (!previous.dragging && Math.hypot(next.x-previous.start.x,next.y-previous.start.y)<5) return;
      panBy(next.x-previous.last.x,next.y-previous.last.y);
      gesture.current={...previous,last:next,dragging:true};
    }
    suppressClick.current=Date.now()+400;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const onPointerEnd = event => {
    if (gesture.current?.dragging || pointers.current.size>1) suppressClick.current=Date.now()+400;
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    resetGesture();
  };
  const onKeyDown = event => {
    if (event.target!==event.currentTarget) return;
    const arrows={ArrowLeft:[70,0],ArrowRight:[-70,0],ArrowUp:[0,70],ArrowDown:[0,-70]};
    if (arrows[event.key]) { event.preventDefault(); panBy(...arrows[event.key]); }
    else if (['+','=','-','0','Home'].includes(event.key)) { event.preventDefault(); if (event.key==='0' || event.key==='Home') fit(); else zoomBy(event.key==='-' ? 1/1.2 : 1.2); }
  };
  return {view,fit,zoomBy,panBy,handlers:{onPointerDown,onPointerMove,onPointerUp:onPointerEnd,onPointerCancel:onPointerEnd,
    onLostPointerCapture:event => { if(pointers.current.has(event.pointerId)) {pointers.current.delete(event.pointerId);resetGesture();} },
    onClickCapture:event => { if(event.detail!==0 && Date.now()<suppressClick.current) {event.preventDefault();event.stopPropagation();} },onKeyDown}};
}
