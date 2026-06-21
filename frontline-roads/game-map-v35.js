(()=>{
'use strict';

const ROAD_SPEC_VERSION_V35=3;
const INITIAL_VIEW_RADIUS_V35=220;
let roadSpecMigrationNeededV35=false;

const roadPriority={
  footway:1,path:1,cycleway:1,pedestrian:2,service:2,living_street:3,
  residential:3,unclassified:3,tertiary_link:4,tertiary:4,
  secondary_link:5,secondary:5,primary_link:6,primary:6
};
const majorRoads=new Set(['primary','primary_link','secondary','secondary_link','tertiary','tertiary_link']);

function normalizeRoadName(tags={}){
  return String(tags.name||tags.ref||'').trim().toLowerCase().replace(/\s+/g,' ');
}
function parseLaneCount(tags={},highway='residential'){
  const direct=Number.parseFloat(String(tags.lanes||'').split(';')[0]);
  if(Number.isFinite(direct)&&direct>0)return clamp(Math.round(direct),1,8);
  const forward=Number.parseFloat(tags['lanes:forward']);
  const backward=Number.parseFloat(tags['lanes:backward']);
  if(Number.isFinite(forward)||Number.isFinite(backward))return clamp(Math.round((forward||0)+(backward||0)),1,8);
  if(['footway','path','cycleway','pedestrian','service'].includes(highway))return 1;
  return tags.oneway==='yes'?1:2;
}
function roadWidthMeters(highway,lanes,tags={}){
  const explicit=Number.parseFloat(tags.width);
  if(Number.isFinite(explicit)&&explicit>1)return clamp(explicit,2,26);
  const base={primary:10,primary_link:8,secondary:8.5,secondary_link:7,tertiary:7,tertiary_link:6,residential:5.5,unclassified:5,service:4,living_street:4.5,pedestrian:4,footway:2.2,path:2,cycleway:2.5}[highway]||4.5;
  return clamp(Math.max(base,lanes*3.15+(lanes>1?1.2:0)),2,24);
}
function segmentAngle(segment){
  let angle=Math.atan2(segment.b.y-segment.a.y,segment.b.x-segment.a.x);
  while(angle<0)angle+=Math.PI;
  while(angle>=Math.PI)angle-=Math.PI;
  return angle;
}
function undirectedAngleGap(a,b){
  let d=Math.abs(a-b)%Math.PI;
  return Math.min(d,Math.PI-d);
}
function segmentMid(segment){return{x:(segment.a.x+segment.b.x)/2,y:(segment.a.y+segment.b.y)/2};}
function projectionInterval(segment,origin,ux,uy){
  const p1=(segment.a.x-origin.x)*ux+(segment.a.y-origin.y)*uy;
  const p2=(segment.b.x-origin.x)*ux+(segment.b.y-origin.y)*uy;
  return [Math.min(p1,p2),Math.max(p1,p2)];
}
function overlapRatio(a,b){
  const dx=a.b.x-a.a.x,dy=a.b.y-a.a.y,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len;
  const ia=projectionInterval(a,a.a,ux,uy),ib=projectionInterval(b,a.a,ux,uy);
  const overlap=Math.max(0,Math.min(ia[1],ib[1])-Math.max(ia[0],ib[0]));
  return overlap/Math.max(1,Math.min(ia[1]-ia[0],ib[1]-ib[0]));
}
function canMergeParallel(a,b){
  if(a.name&&b.name&&a.name!==b.name)return false;
  const sameName=!!a.name&&a.name===b.name;
  const compatibleMajor=majorRoads.has(a.highway)&&majorRoads.has(b.highway)&&Math.abs((roadPriority[a.highway]||0)-(roadPriority[b.highway]||0))<=1;
  const exactLike=a.highway===b.highway;
  if(!sameName&&!compatibleMajor&&!exactLike)return false;
  if(undirectedAngleGap(a.angle,b.angle)>18*Math.PI/180)return false;
  const maxDistance=sameName?20:compatibleMajor?13:6;
  if(dist(a.mid,b.mid)>maxDistance)return false;
  return overlapRatio(a,b)>=.32;
}
function mergeParallelSegments(a,b){
  const dx=a.b.x-a.a.x,dy=a.b.y-a.a.y,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len,nx=-uy,ny=ux;
  const ia=projectionInterval(a,a.a,ux,uy),ib=projectionInterval(b,a.a,ux,uy);
  const minAlong=Math.min(ia[0],ib[0]),maxAlong=Math.max(ia[1],ib[1]);
  const offsetA=((a.mid.x-a.a.x)*nx+(a.mid.y-a.a.y)*ny);
  const offsetB=((b.mid.x-a.a.x)*nx+(b.mid.y-a.a.y)*ny);
  const normalOffset=(offsetA+offsetB)/2;
  const start={x:a.a.x+ux*minAlong+nx*normalOffset,y:a.a.y+uy*minAlong+ny*normalOffset};
  const end={x:a.a.x+ux*maxAlong+nx*normalOffset,y:a.a.y+uy*maxAlong+ny*normalOffset};
  const separation=Math.abs(offsetA-offsetB);
  const combinedLanes=separation>3?clamp((a.lanes||1)+(b.lanes||1),1,10):Math.max(a.lanes||1,b.lanes||1);
  const combinedWidth=clamp(Math.max(a.roadWidth,b.roadWidth,separation+(a.roadWidth+b.roadWidth)/2,combinedLanes*3.1),2,26);
  const merged={
    a:start,b:end,
    name:a.name||b.name,
    highway:(roadPriority[a.highway]||0)>=(roadPriority[b.highway]||0)?a.highway:b.highway,
    lanes:combinedLanes,
    roadWidth:combinedWidth
  };
  merged.mid=segmentMid(merged);merged.angle=segmentAngle(merged);
  return merged;
}
function collapseParallelSegments(raw){
  const cell=24,buckets=new Map(),merged=[];
  const bucketKey=(x,y)=>`${Math.floor(x/cell)},${Math.floor(y/cell)}`;
  const nearbyIndices=mid=>{
    const cx=Math.floor(mid.x/cell),cy=Math.floor(mid.y/cell),result=[];
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)result.push(...(buckets.get(`${cx+dx},${cy+dy}`)||[]));
    return result;
  };
  const addBucket=(index,mid)=>{const key=bucketKey(mid.x,mid.y);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(index);};
  raw.sort((a,b)=>(roadPriority[b.highway]||0)-(roadPriority[a.highway]||0)||b.roadWidth-a.roadWidth);
  for(const segment of raw){
    let match=-1;
    for(const index of nearbyIndices(segment.mid)){
      if(canMergeParallel(merged[index],segment)){match=index;break;}
    }
    if(match>=0){merged[match]=mergeParallelSegments(merged[match],segment);addBucket(match,merged[match].mid);}
    else{const index=merged.length;merged.push(segment);addBucket(index,segment.mid);}
  }
  return merged;
}
function buildSnappedGraph(segments,center){
  const nodeCell=10,nodeBuckets=new Map(),nodes=[],edges=[],edgeByPair=new Map();let edgeCounter=0;
  const nodeKey=(x,y)=>`${Math.floor(x/nodeCell)},${Math.floor(y/nodeCell)}`;
  function snappedNode(point,roadWidth){
    const cx=Math.floor(point.x/nodeCell),cy=Math.floor(point.y/nodeCell),threshold=roadWidth>=9?10:7;
    let best=null,bestDistance=threshold;
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const index of nodeBuckets.get(`${cx+dx},${cy+dy}`)||[]){
      const candidate=nodes[index],d=dist(point,candidate);if(d<bestDistance){bestDistance=d;best=candidate;}
    }
    if(best){
      best.samples=(best.samples||1)+1;
      const weight=1/best.samples;best.x=lerp(best.x,point.x,weight);best.y=lerp(best.y,point.y,weight);
      const ll=xyToLatLon(best.x,best.y,center);best.lat=ll.lat;best.lon=ll.lon;
      return best;
    }
    const ll=xyToLatLon(point.x,point.y,center),node={id:`r${nodes.length}`,x:point.x,y:point.y,lat:ll.lat,lon:ll.lon,samples:1};
    nodes.push(node);const key=nodeKey(point.x,point.y);if(!nodeBuckets.has(key))nodeBuckets.set(key,[]);nodeBuckets.get(key).push(nodes.length-1);return node;
  }
  for(const segment of segments){
    const a=snappedNode(segment.a,segment.roadWidth),b=snappedNode(segment.b,segment.roadWidth);if(a.id===b.id)continue;
    const length=dist(a,b);if(length<5||length>260)continue;
    const pair=a.id<b.id?`${a.id}|${b.id}`:`${b.id}|${a.id}`;
    const existing=edgeByPair.get(pair);
    if(existing){
      existing.roadWidth=Math.max(existing.roadWidth,segment.roadWidth);
      existing.lanes=Math.max(existing.lanes,segment.lanes);
      if((roadPriority[segment.highway]||0)>(roadPriority[existing.highway]||0))existing.highway=segment.highway;
      if(!existing.name&&segment.name)existing.name=segment.name;
      continue;
    }
    const edge={id:`re${edgeCounter++}`,a:a.id,b:b.id,length,points:[{x:a.x,y:a.y},{x:b.x,y:b.y}],barrier:null,roadWidth:segment.roadWidth,lanes:segment.lanes,highway:segment.highway,name:segment.name};
    edges.push(edge);edgeByPair.set(pair,edge);
  }
  for(const edge of edges){const a=nodes.find(node=>node.id===edge.a),b=nodes.find(node=>node.id===edge.b);if(a&&b){edge.length=dist(a,b);edge.points=[{x:a.x,y:a.y},{x:b.x,y:b.y}];}}
  return{nodes,edges};
}
function keepCenterComponent(nodes,edges){
  if(!nodes.length)return{nodes,edges};
  const adjacency=new Map(nodes.map(n=>[n.id,[]]));
  for(const edge of edges){adjacency.get(edge.a)?.push(edge.b);adjacency.get(edge.b)?.push(edge.a);}
  const centerNode=nodes.reduce((best,node)=>Math.hypot(node.x,node.y)<Math.hypot(best.x,best.y)?node:best,nodes[0]);
  const keep=new Set([centerNode.id]),queue=[centerNode.id];
  while(queue.length){const id=queue.shift();for(const next of adjacency.get(id)||[])if(!keep.has(next)){keep.add(next);queue.push(next);}}
  const keptNodes=nodes.filter(node=>keep.has(node.id)),keptIds=new Set(keptNodes.map(node=>node.id));
  return{nodes:keptNodes,edges:edges.filter(edge=>keptIds.has(edge.a)&&keptIds.has(edge.b))};
}

fetchRoadGraph=async function(lat,lon){
  const radius=650;
  const query=`[out:json][timeout:22];way["highway"](around:${radius},${lat},${lon});out geom;`;
  const endpoints=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.nchc.org.tw/api/interpreter'];
  let data=null,lastError=null;
  for(const endpoint of endpoints){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),24000);
    try{
      const response=await fetch(endpoint+'?data='+encodeURIComponent(query),{signal:controller.signal,cache:'no-store'});
      if(!response.ok)throw new Error(`道路取得に失敗 (${response.status})`);
      data=await response.json();clearTimeout(timeout);break;
    }catch(error){clearTimeout(timeout);lastError=error;}
  }
  if(!data)throw lastError||new Error('道路取得に失敗');
  const accepted=new Set(Object.keys(roadPriority)),raw=[];
  for(const way of data.elements||[]){
    if(!way.geometry||way.geometry.length<2)continue;
    const highway=way.tags?.highway;if(!accepted.has(highway))continue;
    if(way.tags?.access==='private'||way.tags?.access==='no')continue;
    const lanes=parseLaneCount(way.tags,highway),roadWidth=roadWidthMeters(highway,lanes,way.tags),name=normalizeRoadName(way.tags);
    for(let index=0;index<way.geometry.length-1;index++){
      const first=way.geometry[index],second=way.geometry[index+1];
      const a=latLonToXY(first.lat,first.lon,{lat,lon}),b=latLonToXY(second.lat,second.lon,{lat,lon}),length=dist(a,b);
      if(length<3||length>230)continue;
      const segment={a,b,name,highway,lanes,roadWidth};segment.mid=segmentMid(segment);segment.angle=segmentAngle(segment);raw.push(segment);
    }
  }
  if(raw.length<20)throw new Error('現在地周辺の道路が少なすぎます');
  const collapsed=collapseParallelSegments(raw),built=buildSnappedGraph(collapsed,{lat,lon}),connected=keepCenterComponent(built.nodes,built.edges);
  if(connected.nodes.length<18||connected.edges.length<20)throw new Error('現在地周辺の道路網が分断されています');
  return{nodes:connected.nodes,edges:connected.edges,center:{lat,lon},source:'osm',roadSpecVersion:ROAD_SPEC_VERSION_V35};
};

const originalNewGameV35=newGame;
newGame=function(graph,player){
  originalNewGameV35(graph,player);
  state.roadSpecVersion=ROAD_SPEC_VERSION_V35;
  state.map.roadSpecVersion=ROAD_SPEC_VERSION_V35;
  silentSave();
};
const originalLoadGameV35=loadGame;
loadGame=function(){
  const loaded=originalLoadGameV35();
  if(loaded&&state?.source==='osm'&&state.roadSpecVersion!==ROAD_SPEC_VERSION_V35)roadSpecMigrationNeededV35=true;
  return loaded;
};

fitView=function(){
  if(!state)return;
  const focus=state.player||state.map.nodeById.get(state.city.nodeId),radius=screen.w<700?INITIAL_VIEW_RADIUS_V35:270;
  const top=72,bottom=118,h=Math.max(160,screen.h-top-bottom),w=Math.max(160,screen.w-34);
  view.minScale=.45;view.maxScale=5;
  view.scale=clamp(Math.min(w/(radius*2),h/(radius*2)),.72,3.4);
  view.offsetX=screen.w/2-focus.x*view.scale;
  view.offsetY=top+h/2-focus.y*view.scale;
};

drawRoads=function(){
  const counts=new Map();for(const enemy of state.enemies)if(enemy.edgeId)counts.set(enemy.edgeId,(counts.get(enemy.edgeId)||0)+1);
  ctx.lineCap='round';ctx.lineJoin='round';
  for(const edge of state.map.edges){
    const a=worldToScreen(state.map.nodeById.get(edge.a)),b=worldToScreen(state.map.nodeById.get(edge.b));
    const meters=edge.roadWidth||5.5,inner=clamp(meters*view.scale*.68,2.6,18),outer=inner+clamp(3.2*view.scale,2.5,5.5);
    ctx.strokeStyle=COLORS.roadEdge;ctx.lineWidth=outer;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    ctx.strokeStyle=COLORS.road;ctx.lineWidth=inner;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    if(meters>=9&&view.scale>=.65){
      ctx.save();ctx.setLineDash([5,8]);ctx.strokeStyle='rgba(225,231,239,.24)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.restore();
    }
    const count=counts.get(edge.id)||0;if(count){ctx.strokeStyle=`rgba(255,80,80,${Math.min(.52,.14+count*.025)})`;ctx.lineWidth=Math.min(24,Math.max(inner+2,5+count*1.4));ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
  }
};

window.FRONTLINE_MAP_SPEC='3.5';
window.FRONTLINE_ROAD_SPEC_VERSION=ROAD_SPEC_VERSION_V35;
window.frontlineRoadMigrationNeeded=()=>roadSpecMigrationNeededV35;
window.frontlineRoadMigrationDone=()=>{roadSpecMigrationNeededV35=false;};
})();
