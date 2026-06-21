(()=>{
'use strict';

const activePointers=new Map();
let gesture={mode:'none',moved:false,id:null,startX:0,startY:0,lastX:0,lastY:0,startDistance:0,startScale:1,anchorWorld:null};

function pointerList(){return[...activePointers.values()];}
function midpoint(a,b){return{x:(a.x+b.x)/2,y:(a.y+b.y)/2};}
function beginSingle(point,alreadyMoved=false){
  gesture={mode:'single',moved:alreadyMoved,id:point.id,startX:point.x,startY:point.y,lastX:point.x,lastY:point.y,startDistance:0,startScale:view.scale,anchorWorld:null};
}
function beginPinch(){
  const [a,b]=pointerList();if(!a||!b)return;
  const mid=midpoint(a,b);
  gesture={mode:'pinch',moved:true,id:null,startX:mid.x,startY:mid.y,lastX:mid.x,lastY:mid.y,startDistance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),startScale:view.scale,anchorWorld:screenToWorld(mid)};
  pathPreview=null;
}
function applyPinch(){
  const [a,b]=pointerList();if(!a||!b||gesture.mode!=='pinch')return;
  const mid=midpoint(a,b),distance=Math.max(1,Math.hypot(a.x-b.x,a.y-b.y));
  const scale=clamp(gesture.startScale*(distance/gesture.startDistance),view.minScale,view.maxScale);
  view.scale=scale;
  view.offsetX=mid.x-gesture.anchorWorld.x*scale;
  view.offsetY=mid.y-gesture.anchorWorld.y*scale;
}
function intercept(event){event.preventDefault();event.stopImmediatePropagation();}

canvas.addEventListener('pointerdown',event=>{
  intercept(event);
  canvas.setPointerCapture?.(event.pointerId);
  activePointers.set(event.pointerId,{id:event.pointerId,x:event.clientX,y:event.clientY});
  if(activePointers.size===1)beginSingle(activePointers.get(event.pointerId));
  else if(activePointers.size===2)beginPinch();
},{capture:true,passive:false});

canvas.addEventListener('pointermove',event=>{
  if(!activePointers.has(event.pointerId))return;
  intercept(event);
  const point=activePointers.get(event.pointerId);point.x=event.clientX;point.y=event.clientY;
  if(activePointers.size>=2){if(gesture.mode!=='pinch')beginPinch();applyPinch();return;}
  if(gesture.mode!=='single'||gesture.id!==event.pointerId)return;
  const dx=event.clientX-gesture.lastX,dy=event.clientY-gesture.lastY;
  if(Math.hypot(event.clientX-gesture.startX,event.clientY-gesture.startY)>7)gesture.moved=true;
  if(gesture.moved){view.offsetX+=dx;view.offsetY+=dy;pathPreview=null;}
  else previewAt(event.clientX,event.clientY);
  gesture.lastX=event.clientX;gesture.lastY=event.clientY;
},{capture:true,passive:false});

function finishPointer(event){
  if(!activePointers.has(event.pointerId))return;
  intercept(event);
  const shouldTap=activePointers.size===1&&gesture.mode==='single'&&gesture.id===event.pointerId&&!gesture.moved;
  activePointers.delete(event.pointerId);
  if(shouldTap)tapMap(event.clientX,event.clientY);
  if(activePointers.size===1)beginSingle(pointerList()[0],true);
  else if(activePointers.size===0)gesture={mode:'none',moved:false,id:null};
  else beginPinch();
}
canvas.addEventListener('pointerup',finishPointer,{capture:true,passive:false});
canvas.addEventListener('pointercancel',finishPointer,{capture:true,passive:false});

canvas.addEventListener('wheel',event=>{
  event.preventDefault();event.stopImmediatePropagation();
  const anchor=screenToWorld({x:event.clientX,y:event.clientY});
  const factor=Math.exp(-event.deltaY*.0015),scale=clamp(view.scale*factor,view.minScale,view.maxScale);
  view.scale=scale;view.offsetX=event.clientX-anchor.x*scale;view.offsetY=event.clientY-anchor.y*scale;
},{capture:true,passive:false});

function snapshotOldStructures(oldState){
  const towers=(oldState.towers||[]).map(tower=>{
    const node=oldState.map.nodeById.get(tower.nodeId);if(!node)return null;
    return{tower:{...tower},latLon:xyToLatLon(node.x,node.y,oldState.map.center)};
  }).filter(Boolean);
  const barriers=(oldState.map.edges||[]).filter(edge=>edge.barrier).map(edge=>{
    const point=edgeMid(edge,oldState.map);return{barrier:{...edge.barrier},latLon:xyToLatLon(point.x,point.y,oldState.map.center)};
  });
  return{
    scrap:oldState.scrap,
    resources:oldState.resources?{...oldState.resources}:null,
    resourceSpec:oldState.resourceSpec,
    civilizationLevel:oldState.civilizationLevel,
    cityHp:oldState.city?.hp??100,
    kills:oldState.kills||0,
    towers,
    barriers
  };
}
function nearestEdgeToPoint(graph,point,maxDistance=30){
  let best=null,bestDistance=maxDistance;
  for(const edge of graph.edges){const d=pointSegDistance(point,graph.nodeById.get(edge.a),graph.nodeById.get(edge.b));if(d<bestDistance){bestDistance=d;best=edge;}}
  return best;
}
async function rebuildRoadNetworkV35(lat,lon,accuracy){
  if(firstLocationLoadInProgress||!state)return;
  firstLocationLoadInProgress=true;
  const oldState=state,snapshot=snapshotOldStructures(oldState);
  showMessage('道路を整理し、近距離マップを再構築しています…',2600);
  try{
    const graph=await fetchRoadGraph(lat,lon);
    newGame(graph,{x:0,y:0,lat,lon});
    state.scrap=snapshot.scrap;
    if(snapshot.resources){
      state.resources={...snapshot.resources};
      state.resourceSpec=snapshot.resourceSpec;
      state.civilizationLevel=snapshot.civilizationLevel;
    }
    state.city.hp=Math.min(state.city.maxHp,snapshot.cityHp);state.kills=snapshot.kills;
    const occupied=new Set([state.city.nodeId,...state.bases.filter(base=>base.alive).map(base=>base.nodeId)]),restoredTowers=[];
    for(const item of snapshot.towers){
      const point=latLonToXY(item.latLon.lat,item.latLon.lon,state.map.center),node=nearestNode(state.map,point);
      if(!node||dist(node,point)>42||occupied.has(node.id))continue;
      occupied.add(node.id);restoredTowers.push({...item.tower,nodeId:node.id});
    }
    state.towers=restoredTowers;
    for(const item of snapshot.barriers){
      const point=latLonToXY(item.latLon.lat,item.latLon.lon,state.map.center),edge=nearestEdgeToPoint(state.map,point,32);
      if(edge&&!edge.barrier)edge.barrier={...item.barrier};
    }
    state.roadSpecVersion=window.FRONTLINE_ROAD_SPEC_VERSION||3;state.map.roadSpecVersion=state.roadSpecVersion;
    window.frontlineRoadMigrationDone?.();
    lastLocationAccuracy=Number.isFinite(accuracy)?accuracy:null;
    selectedObject=null;assaultingBaseId=null;fitView();renderTools();updateThreatInfo();updateUI();silentSave();
    showMessage('道路を1本の中心線へ整理しました',2600);
  }catch(error){
    console.error(error);showMessage('道路再構築に失敗しました。再読み込みで再試行します',3000);
    const point=latLonToXY(lat,lon,oldState.map.center);oldState.player.x=point.x;oldState.player.y=point.y;oldState.player.lat=lat;oldState.player.lon=lon;
  }finally{firstLocationLoadInProgress=false;}
}

const originalApplyLocationV35=applyLocation;
applyLocation=function(lat,lon,accuracy){
  if(window.frontlineRoadMigrationNeeded?.()&&state?.source==='osm'){
    rebuildRoadNetworkV35(Number(lat),Number(lon),Number(accuracy));
    return;
  }
  originalApplyLocationV35(lat,lon,accuracy);
};

const helpCard=document.querySelector('#helpOverlay .card');
const closeHelp=document.getElementById('closeHelp');
if(helpCard&&closeHelp&&!helpCard.querySelector('[data-map-v35]')){
  const note=document.createElement('p');note.className='note';note.dataset.mapV35='1';note.textContent='地図は現在地から約220mを初期表示します。1本指で移動、2本指のピンチ操作で拡大・縮小できます。';helpCard.insertBefore(note,closeHelp);
}

if(!document.querySelector('script[data-resource-loader]')){
  const resourceLoader=document.createElement('script');
  resourceLoader.src='./game-resources-loader.js';
  resourceLoader.async=false;
  resourceLoader.dataset.resourceLoader='1';
  document.body.appendChild(resourceLoader);
}
})();
