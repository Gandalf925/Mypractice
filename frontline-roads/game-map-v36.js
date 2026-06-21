(()=>{
'use strict';

const ROAD_SPEC_VERSION_V36=4;
const INITIAL_VIEW_RADIUS_V36=210;
let roadSpecMigrationNeededV36=false;

const ROAD_PRIORITY={
  living_street:2,
  residential:3,
  unclassified:3,
  tertiary_link:4,
  tertiary:4,
  secondary_link:5,
  secondary:5,
  primary_link:6,
  primary:6
};
const ALLOWED_HIGHWAYS=new Set(Object.keys(ROAD_PRIORITY));
const MAJOR_HIGHWAYS=new Set(['primary','primary_link','secondary','secondary_link','tertiary','tertiary_link']);
const EXCLUDED_SERVICE=new Set(['driveway','parking_aisle','drive-through','emergency_access','alley']);

function normalizeRoadName(tags={}){
  return String(tags.name||tags.ref||'')
    .trim()
    .toLowerCase()
    .replace(/[\s\-‐‑‒–—―]+/g,' ');
}
function parseLaneCount(tags={},highway='residential'){
  const direct=Number.parseFloat(String(tags.lanes||'').split(';')[0]);
  if(Number.isFinite(direct)&&direct>0)return clamp(Math.round(direct),1,10);
  const forward=Number.parseFloat(tags['lanes:forward']);
  const backward=Number.parseFloat(tags['lanes:backward']);
  if(Number.isFinite(forward)||Number.isFinite(backward))return clamp(Math.round((forward||0)+(backward||0)),1,10);
  if(tags.oneway==='yes'||tags.junction==='roundabout')return 1;
  return MAJOR_HIGHWAYS.has(highway)?2:1;
}
function roadWidthMeters(highway,lanes,tags={}){
  const explicit=Number.parseFloat(tags.width);
  if(Number.isFinite(explicit)&&explicit>1)return clamp(explicit,2.5,30);
  const base={
    primary:10.5,primary_link:8.5,
    secondary:9,secondary_link:7.5,
    tertiary:7.5,tertiary_link:6.5,
    residential:5.5,unclassified:5,living_street:4.5
  }[highway]||5;
  return clamp(Math.max(base,lanes*3.15+(lanes>1?1:0)),3.2,28);
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
function pointSegmentDistance(point,a,b){
  const dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;
  if(!l2)return dist(point,a);
  const t=clamp(((point.x-a.x)*dx+(point.y-a.y)*dy)/l2,0,1);
  return Math.hypot(point.x-(a.x+dx*t),point.y-(a.y+dy*t));
}
function segmentSeparation(a,b){
  return Math.min(
    pointSegmentDistance(a.a,b.a,b.b),
    pointSegmentDistance(a.b,b.a,b.b),
    pointSegmentDistance(b.a,a.a,a.b),
    pointSegmentDistance(b.b,a.a,a.b),
    pointSegmentDistance(a.mid,b.a,b.b),
    pointSegmentDistance(b.mid,a.a,a.b)
  );
}
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
function compatibleRoadIdentity(a,b){
  if(a.name&&b.name)return a.name===b.name;
  const priorityGap=Math.abs((ROAD_PRIORITY[a.highway]||0)-(ROAD_PRIORITY[b.highway]||0));
  if(MAJOR_HIGHWAYS.has(a.highway)&&MAJOR_HIGHWAYS.has(b.highway))return priorityGap<=1;
  return a.highway===b.highway;
}
function parallelDuplicate(a,b){
  if(!compatibleRoadIdentity(a,b))return false;
  if(undirectedAngleGap(a.angle,b.angle)>14*Math.PI/180)return false;
  const maxSeparation=(a.name&&b.name)?22:MAJOR_HIGHWAYS.has(a.highway)?16:10;
  if(segmentSeparation(a,b)>maxSeparation)return false;
  return overlapRatio(a,b)>=.42;
}
function mergeRoadMetadata(target,source){
  const separated=segmentSeparation(target,source)>3.5;
  target.roadWidth=clamp(Math.max(
    target.roadWidth,
    source.roadWidth,
    separated?(target.roadWidth+source.roadWidth)*.82:0
  ),3.2,28);
  target.lanes=separated?clamp((target.lanes||1)+(source.lanes||1),1,10):Math.max(target.lanes||1,source.lanes||1);
  target.oneway=target.oneway&&source.oneway;
  if((ROAD_PRIORITY[source.highway]||0)>(ROAD_PRIORITY[target.highway]||0))target.highway=source.highway;
  if(!target.name&&source.name)target.name=source.name;
}
function collapseParallelSegments(rawSegments){
  const cellSize=28,buckets=new Map(),kept=[];
  const key=(x,y)=>`${Math.floor(x/cellSize)},${Math.floor(y/cellSize)}`;
  function candidates(mid){
    const cx=Math.floor(mid.x/cellSize),cy=Math.floor(mid.y/cellSize),result=[];
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)result.push(...(buckets.get(`${cx+dx},${cy+dy}`)||[]));
    return result;
  }
  function register(index,mid){
    const bucketKey=key(mid.x,mid.y);
    if(!buckets.has(bucketKey))buckets.set(bucketKey,[]);
    buckets.get(bucketKey).push(index);
  }
  rawSegments.sort((a,b)=>(ROAD_PRIORITY[b.highway]||0)-(ROAD_PRIORITY[a.highway]||0)||b.roadWidth-a.roadWidth);
  for(const segment of rawSegments){
    let duplicateIndex=-1;
    for(const index of candidates(segment.mid)){
      if(parallelDuplicate(kept[index],segment)){duplicateIndex=index;break;}
    }
    if(duplicateIndex>=0){
      mergeRoadMetadata(kept[duplicateIndex],segment);
      continue;
    }
    register(kept.length,segment.mid);
    kept.push(segment);
  }
  return kept;
}

function clusterEndpoints(segments,center){
  const points=[];
  for(const segment of segments){
    segment.pointA=points.length;
    points.push({x:segment.a.x,y:segment.a.y,segment,index:0});
    segment.pointB=points.length;
    points.push({x:segment.b.x,y:segment.b.y,segment,index:1});
  }
  const parent=points.map((_,index)=>index),rank=points.map(()=>0);
  const find=index=>parent[index]===index?index:(parent[index]=find(parent[index]));
  const union=(a,b)=>{
    let ra=find(a),rb=find(b);if(ra===rb)return;
    if(rank[ra]<rank[rb])[ra,rb]=[rb,ra];
    parent[rb]=ra;if(rank[ra]===rank[rb])rank[ra]++;
  };
  const cellSize=14,buckets=new Map();
  const key=(x,y)=>`${Math.floor(x/cellSize)},${Math.floor(y/cellSize)}`;
  for(let index=0;index<points.length;index++){
    const point=points[index],cx=Math.floor(point.x/cellSize),cy=Math.floor(point.y/cellSize);
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const otherIndex of buckets.get(`${cx+dx},${cy+dy}`)||[]){
      const other=points[otherIndex];
      if(point.segment===other.segment)continue;
      const distance=Math.hypot(point.x-other.x,point.y-other.y);
      const sameNamed=point.segment.name&&point.segment.name===other.segment.name;
      const bothMajor=MAJOR_HIGHWAYS.has(point.segment.highway)&&MAJOR_HIGHWAYS.has(other.segment.highway);
      const threshold=sameNamed?16:bothMajor?13:8;
      if(distance<=threshold)union(index,otherIndex);
    }
    const bucketKey=key(point.x,point.y);if(!buckets.has(bucketKey))buckets.set(bucketKey,[]);buckets.get(bucketKey).push(index);
  }
  const groups=new Map();
  for(let index=0;index<points.length;index++){
    const root=find(index);if(!groups.has(root))groups.set(root,[]);groups.get(root).push(points[index]);
  }
  const nodes=[],nodeByRoot=new Map();
  for(const [root,group] of groups){
    const x=group.reduce((sum,p)=>sum+p.x,0)/group.length,y=group.reduce((sum,p)=>sum+p.y,0)/group.length,ll=xyToLatLon(x,y,center);
    const node={id:`c${nodes.length}`,x,y,lat:ll.lat,lon:ll.lon};nodes.push(node);nodeByRoot.set(root,node);
  }
  return{points,find,nodes,nodeByRoot};
}
function buildGraphFromSegments(segments,center){
  const clustered=clusterEndpoints(segments,center),edges=[],edgeByPair=new Map();let edgeCounter=0;
  for(const segment of segments){
    const a=clustered.nodeByRoot.get(clustered.find(segment.pointA)),b=clustered.nodeByRoot.get(clustered.find(segment.pointB));
    if(!a||!b||a.id===b.id)continue;
    const length=dist(a,b);if(length<6||length>280)continue;
    const pair=a.id<b.id?`${a.id}|${b.id}`:`${b.id}|${a.id}`;
    const existing=edgeByPair.get(pair);
    if(existing){mergeRoadMetadata(existing,segment);continue;}
    const edge={
      id:`ce${edgeCounter++}`,
      a:a.id,b:b.id,length,
      points:[{x:a.x,y:a.y},{x:b.x,y:b.y}],
      barrier:null,
      roadWidth:segment.roadWidth,
      lanes:segment.lanes,
      highway:segment.highway,
      name:segment.name,
      oneway:segment.oneway,
      angle:segmentAngle({a,b}),
      mid:segmentMid({a,b})
    };
    edges.push(edge);edgeByPair.set(pair,edge);
  }
  return{nodes:clustered.nodes,edges};
}
function removeParallelGraphEdges(graph){
  const cellSize=34,buckets=new Map(),removed=new Set();
  const key=(x,y)=>`${Math.floor(x/cellSize)},${Math.floor(y/cellSize)}`;
  const candidates=mid=>{
    const cx=Math.floor(mid.x/cellSize),cy=Math.floor(mid.y/cellSize),result=[];
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)result.push(...(buckets.get(`${cx+dx},${cy+dy}`)||[]));
    return result;
  };
  for(let index=0;index<graph.edges.length;index++){
    const edge=graph.edges[index];
    if(removed.has(index))continue;
    for(const otherIndex of candidates(edge.mid)){
      if(removed.has(otherIndex))continue;
      const other=graph.edges[otherIndex];
      if(edge.a===other.a&&edge.b===other.b)continue;
      if(parallelDuplicate(edge,other)){
        const edgePriority=(ROAD_PRIORITY[edge.highway]||0)*100+edge.roadWidth;
        const otherPriority=(ROAD_PRIORITY[other.highway]||0)*100+other.roadWidth;
        const keeper=edgePriority>=otherPriority?edge:other,loserIndex=edgePriority>=otherPriority?otherIndex:index,loser=edgePriority>=otherPriority?other:edge;
        mergeRoadMetadata(keeper,loser);removed.add(loserIndex);
        if(loserIndex===index)break;
      }
    }
    if(!removed.has(index)){
      const bucketKey=key(edge.mid.x,edge.mid.y);if(!buckets.has(bucketKey))buckets.set(bucketKey,[]);buckets.get(bucketKey).push(index);
    }
  }
  graph.edges=graph.edges.filter((_,index)=>!removed.has(index));
  return graph;
}
function removeShortDeadEnds(graph){
  let changed=true;
  while(changed){
    changed=false;
    const degree=new Map(graph.nodes.map(node=>[node.id,0]));
    for(const edge of graph.edges){degree.set(edge.a,(degree.get(edge.a)||0)+1);degree.set(edge.b,(degree.get(edge.b)||0)+1);}
    const remove=new Set();
    for(let index=0;index<graph.edges.length;index++){
      const edge=graph.edges[index];
      const deadEnd=degree.get(edge.a)===1||degree.get(edge.b)===1;
      const lowPriority=(ROAD_PRIORITY[edge.highway]||0)<=3;
      if(deadEnd&&lowPriority&&edge.length<24)remove.add(index);
    }
    if(remove.size){graph.edges=graph.edges.filter((_,index)=>!remove.has(index));changed=true;}
  }
  return graph;
}
function keepCenterComponent(graph){
  if(!graph.nodes.length)return graph;
  const adjacency=new Map(graph.nodes.map(node=>[node.id,[]]));
  for(const edge of graph.edges){adjacency.get(edge.a)?.push(edge.b);adjacency.get(edge.b)?.push(edge.a);}
  const centerNode=graph.nodes.reduce((best,node)=>Math.hypot(node.x,node.y)<Math.hypot(best.x,best.y)?node:best,graph.nodes[0]);
  const keep=new Set([centerNode.id]),queue=[centerNode.id];
  while(queue.length){const id=queue.shift();for(const next of adjacency.get(id)||[])if(!keep.has(next)){keep.add(next);queue.push(next);}}
  graph.nodes=graph.nodes.filter(node=>keep.has(node.id));
  const ids=new Set(graph.nodes.map(node=>node.id));
  graph.edges=graph.edges.filter(edge=>ids.has(edge.a)&&ids.has(edge.b));
  return graph;
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

  const rawSegments=[];
  for(const way of data.elements||[]){
    if(!way.geometry||way.geometry.length<2)continue;
    const tags=way.tags||{},highway=tags.highway;
    if(!ALLOWED_HIGHWAYS.has(highway))continue;
    if(tags.access==='private'||tags.access==='no')continue;
    if(highway==='service'&&EXCLUDED_SERVICE.has(tags.service))continue;
    const lanes=parseLaneCount(tags,highway),roadWidth=roadWidthMeters(highway,lanes,tags),name=normalizeRoadName(tags),oneway=tags.oneway==='yes'||tags.junction==='roundabout';
    for(let index=0;index<way.geometry.length-1;index++){
      const first=way.geometry[index],second=way.geometry[index+1];
      const a=latLonToXY(first.lat,first.lon,{lat,lon}),b=latLonToXY(second.lat,second.lon,{lat,lon}),length=dist(a,b);
      if(length<5||length>240)continue;
      const segment={a,b,name,highway,lanes,roadWidth,oneway,wayId:way.id};
      segment.mid=segmentMid(segment);segment.angle=segmentAngle(segment);rawSegments.push(segment);
    }
  }
  if(rawSegments.length<18)throw new Error('現在地周辺の道路が少なすぎます');

  const collapsed=collapseParallelSegments(rawSegments);
  let graph=buildGraphFromSegments(collapsed,{lat,lon});
  graph=removeParallelGraphEdges(graph);
  graph=removeShortDeadEnds(graph);
  graph=keepCenterComponent(graph);
  if(graph.nodes.length<14||graph.edges.length<16)throw new Error('現在地周辺の道路網が分断されています');
  return{nodes:graph.nodes,edges:graph.edges,center:{lat,lon},source:'osm',roadSpecVersion:ROAD_SPEC_VERSION_V36};
};

const originalNewGameV36=newGame;
newGame=function(graph,player){
  originalNewGameV36(graph,player);
  state.roadSpecVersion=ROAD_SPEC_VERSION_V36;
  state.map.roadSpecVersion=ROAD_SPEC_VERSION_V36;
  silentSave();
};
const originalLoadGameV36=loadGame;
loadGame=function(){
  const loaded=originalLoadGameV36();
  if(loaded&&state?.source==='osm'&&state.roadSpecVersion!==ROAD_SPEC_VERSION_V36)roadSpecMigrationNeededV36=true;
  return loaded;
};

fitView=function(){
  if(!state)return;
  const focus=state.player||state.map.nodeById.get(state.city.nodeId),radius=screen.w<700?INITIAL_VIEW_RADIUS_V36:260;
  const top=72,bottom=118,height=Math.max(160,screen.h-top-bottom),width=Math.max(160,screen.w-34);
  view.minScale=.5;view.maxScale=5.5;
  view.scale=clamp(Math.min(width/(radius*2),height/(radius*2)),.78,3.6);
  view.offsetX=screen.w/2-focus.x*view.scale;
  view.offsetY=top+height/2-focus.y*view.scale;
};

drawRoads=function(){
  const counts=new Map();for(const enemy of state.enemies)if(enemy.edgeId)counts.set(enemy.edgeId,(counts.get(enemy.edgeId)||0)+1);
  ctx.lineCap='round';ctx.lineJoin='round';
  for(const edge of state.map.edges){
    const a=worldToScreen(state.map.nodeById.get(edge.a)),b=worldToScreen(state.map.nodeById.get(edge.b));
    const meters=edge.roadWidth||5.5,width=clamp(meters*view.scale*.72,3,20);
    ctx.strokeStyle=edge.highway==='primary'?'#596575':edge.highway==='secondary'?'#525f6f':'#46515f';
    ctx.lineWidth=width;
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    const count=counts.get(edge.id)||0;
    if(count){
      ctx.strokeStyle=`rgba(255,80,80,${Math.min(.58,.18+count*.03)})`;
      ctx.lineWidth=Math.min(width+6,8+count*1.5);
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    }
  }
};

window.FRONTLINE_MAP_SPEC='3.6';
window.FRONTLINE_ROAD_SPEC_VERSION=ROAD_SPEC_VERSION_V36;
window.frontlineRoadMigrationNeeded=()=>roadSpecMigrationNeededV36;
window.frontlineRoadMigrationDone=()=>{roadSpecMigrationNeededV36=false;};
})();
