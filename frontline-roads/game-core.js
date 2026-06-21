'use strict';
const VERSION='3.4.0-neighborhood-enemies';
const SAVE_KEY='frontline_roads_pages_mvp_v31';
const canvas=document.getElementById('game');
const ctx=canvas.getContext('2d');
const $=id=>document.getElementById(id);

const COLORS={road:'#46515f',roadEdge:'#2d3540',enemy:'#ff6b6b',enemyFlow:'rgba(255,84,84,.30)',friendly:'#78b7ff',accent:'#7ee787',warn:'#ffd166',purple:'#c08cff',city:'#f5f7fa'};
const TOOL_DEFS={
  select:{name:'選択',icon:'☝',cost:0,type:'select'},
  barrier:{name:'防壁',icon:'▰',cost:40,type:'barrier'},
  gun:{name:'機関砲',icon:'⌁',cost:60,type:'tower'},
  mortar:{name:'榴弾砲',icon:'◉',cost:90,type:'tower'},
  slow:{name:'減速塔',icon:'◌',cost:70,type:'tower'},
  relay:{name:'修理中継拠点',icon:'⚒',cost:0,type:'captured',hidden:true}
};
const ENEMY_DEFS={
  infantry:{name:'歩兵',hp:50,speed:1.2,damageCity:8,barrierDps:2,size:4.5,color:'#ff776f',reward:5},
  scout:{name:'斥候',hp:25,speed:1.75,damageCity:4,barrierDps:1,size:3.7,color:'#ffb36a',reward:4,avoidTowers:true},
  shield:{name:'盾兵',hp:100,speed:.95,damageCity:8,barrierDps:2,size:5.4,color:'#6fb5ff',reward:9,shieldAura:.30},
  engineer:{name:'工兵',hp:60,speed:1.0,damageCity:5,barrierDps:8,size:4.7,color:'#ffd166',reward:8,engineer:true},
  heavy:{name:'重装兵',hp:180,speed:.7,damageCity:20,barrierDps:6,size:6.5,color:'#b88cff',reward:15,slowResist:.5},
  raider:{name:'破壊工作員',hp:55,speed:1.3,damageCity:6,barrierDps:3,size:4.9,color:'#ff5da2',reward:10,attackTowers:true,towerDps:12,stunSeconds:8}
};
const BASE_DEFS={
  barracks:{name:'前哨基地',icon:'⚑',interval:180,firstDelay:90,color:'#d95858',range:[160,240],captureDuration:45,reward:80,capturedType:'gun',waves:{1:['infantry','infantry','scout'],2:['infantry','infantry','infantry','shield'],3:['infantry','infantry','infantry','infantry','scout','shield']}},
  engineer:{name:'工兵拠点',icon:'⚒',interval:300,firstDelay:150,color:'#d29b42',range:[260,380],captureDuration:60,reward:110,capturedType:'relay',waves:{1:['engineer','infantry','infantry'],2:['engineer','shield','infantry','infantry'],3:['engineer','engineer','shield','infantry','infantry']}},
  raider:{name:'工作員拠点',icon:'✦',interval:360,firstDelay:180,color:'#c85083',range:[260,420],captureDuration:60,reward:130,capturedType:'slow',waves:{1:['raider','scout'],2:['raider','raider','scout'],3:['raider','raider','engineer','scout']}},
  motor:{name:'装甲工場',icon:'⬢',interval:420,firstDelay:240,color:'#8d62c8',range:[420,550],captureDuration:75,reward:160,capturedType:'mortar',waves:{1:['heavy','infantry','infantry'],2:['heavy','shield','infantry','infantry'],3:['heavy','heavy','shield','scout']}}
};
const ENEMY_SPEC_VERSION=2;

let state=null;
let view={scale:1,offsetX:0,offsetY:0,minScale:.45,maxScale:4};
let screen={w:innerWidth,h:innerHeight,dpr:Math.min(devicePixelRatio||1,2)};
let selectedTool='select';
let selectedObject=null;
let pointer={down:false,id:null,x:0,y:0,startX:0,startY:0,moved:false,lastX:0,lastY:0};
let geoWatchId=null;
let nativeLocationReady=false;
let firstLocationLoadInProgress=false;
let lastLocationAccuracy=null;
let lastFrame=performance.now();
let saveClock=0;
let messageTimer=0;
let particles=[];
let beams=[];
let explosions=[];
let testMove=false;
let pathPreview=null;
let assaultingBaseId=null;
let timeScale=1;
let etaClock=0;
let threatInfo={seconds:Infinity,kind:'none',enemyId:null,baseId:null};
let enemySpecMigrated=false;

function resize(){
  screen={w:innerWidth,h:innerHeight,dpr:Math.min(devicePixelRatio||1,2)};
  canvas.width=Math.floor(screen.w*screen.dpr);canvas.height=Math.floor(screen.h*screen.dpr);
  canvas.style.width=screen.w+'px';canvas.style.height=screen.h+'px';
  ctx.setTransform(screen.dpr,0,0,screen.dpr,0,0);
}
addEventListener('resize',resize);resize();

function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function lerp(a,b,t){return a+(b-a)*t}
function now(){return Date.now()}
function uid(prefix){return prefix+'_'+Math.random().toString(36).slice(2,10)}
function fmtMeters(m){return m<1000?Math.round(m)+'m':(m/1000).toFixed(1)+'km'}
function fmtClock(sec){if(!Number.isFinite(sec))return '--';sec=Math.max(0,Math.ceil(sec));const m=Math.floor(sec/60),s=sec%60;if(m>=60){const h=Math.floor(m/60),rm=m%60;return `${h}時間${rm?rm+'分':''}`;}return `${m}:${String(s).padStart(2,'0')}`;}
function fmtEta(sec){if(!Number.isFinite(sec))return '予測なし';if(sec<30)return '1分未満';const m=Math.ceil(sec/60);return m<60?`約${m}分`:`約${Math.floor(m/60)}時間${m%60?m%60+'分':''}`;}
function choose(arr){return arr[Math.floor(Math.random()*arr.length)]}

function showMessage(text,duration=1800){
  const el=$('message');el.textContent=text;el.classList.add('show');
  clearTimeout(messageTimer);messageTimer=setTimeout(()=>el.classList.remove('show'),duration);
}

function latLonToXY(lat,lon,center){
  const R=6371000, rad=Math.PI/180;
  const x=(lon-center.lon)*rad*R*Math.cos(center.lat*rad);
  const y=-(lat-center.lat)*rad*R;
  return {x,y};
}
function xyToLatLon(x,y,center){
  const R=6371000, rad=Math.PI/180;
  return {lat:center.lat-y/(rad*R),lon:center.lon+x/(rad*R*Math.cos(center.lat*rad))};
}

function makeDemoGraph(){
  const nodes=[],edges=[];const size=5,spacing=92;
  for(let r=0;r<size;r++)for(let c=0;c<size;c++){
    const jitter=(r===2&&c===2)?0:14;
    nodes.push({id:`n${r}_${c}`,x:(c-2)*spacing+(Math.random()-.5)*jitter,y:(r-2)*spacing+(Math.random()-.5)*jitter,lat:null,lon:null});
  }
  const node=(r,c)=>nodes.find(n=>n.id===`n${r}_${c}`);
  const add=(a,b)=>{const A=node(...a),B=node(...b);edges.push({id:uid('e'),a:A.id,b:B.id,length:dist(A,B),points:[{x:A.x,y:A.y},{x:B.x,y:B.y}],barrier:null});};
  for(let r=0;r<size;r++)for(let c=0;c<size;c++){
    if(c<size-1)add([r,c],[r,c+1]);
    if(r<size-1)add([r,c],[r+1,c]);
  }
  add([0,0],[1,1]);add([1,3],[2,2]);add([3,1],[2,2]);add([3,3],[4,4]);add([0,4],[1,3]);
  return {nodes,edges,center:{lat:34.6937,lon:135.5023},source:'demo'};
}

async function fetchRoadGraph(lat,lon){
  const radius=650;
  const q=`[out:json][timeout:22];way["highway"](around:${radius},${lat},${lon});out geom;`;
  const endpoints=[
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.nchc.org.tw/api/interpreter'
  ];
  let data=null,lastError=null;
  for(const endpoint of endpoints){
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),24000);
    try{
      const res=await fetch(endpoint+'?data='+encodeURIComponent(q),{signal:controller.signal,cache:'no-store'});
      if(!res.ok)throw new Error(`道路取得に失敗 (${res.status})`);
      data=await res.json();
      clearTimeout(timeout);
      break;
    }catch(err){
      clearTimeout(timeout);
      lastError=err;
    }
  }
  if(!data)throw lastError||new Error('道路取得に失敗');
  const nodeMap=new Map(),edges=[];let ec=0;
  const accepted=new Set(['primary','secondary','tertiary','residential','unclassified','service','living_street','pedestrian','footway','path','cycleway']);
  for(const way of data.elements||[]){
    if(!way.geometry||way.geometry.length<2)continue;
    const hw=way.tags?.highway;if(hw&&!accepted.has(hw))continue;
    for(let i=0;i<way.geometry.length-1;i++){
      const g1=way.geometry[i],g2=way.geometry[i+1];
      const k1=g1.lat.toFixed(6)+','+g1.lon.toFixed(6),k2=g2.lat.toFixed(6)+','+g2.lon.toFixed(6);
      if(!nodeMap.has(k1)){const p=latLonToXY(g1.lat,g1.lon,{lat,lon});nodeMap.set(k1,{id:'o'+nodeMap.size,x:p.x,y:p.y,lat:g1.lat,lon:g1.lon});}
      if(!nodeMap.has(k2)){const p=latLonToXY(g2.lat,g2.lon,{lat,lon});nodeMap.set(k2,{id:'o'+nodeMap.size,x:p.x,y:p.y,lat:g2.lat,lon:g2.lon});}
      const a=nodeMap.get(k1),b=nodeMap.get(k2);const len=dist(a,b);if(len<2||len>220)continue;
      edges.push({id:'oe'+ec++,a:a.id,b:b.id,length:len,points:[{x:a.x,y:a.y},{x:b.x,y:b.y}],barrier:null});
    }
  }
  let nodes=[...nodeMap.values()];
  if(nodes.length<18||edges.length<20)throw new Error('現在地周辺の道路が少なすぎます');
  const adj=new Map(nodes.map(n=>[n.id,[]]));
  for(const e of edges){adj.get(e.a)?.push(e.b);adj.get(e.b)?.push(e.a)}
  let centerNode=nodes.reduce((best,n)=>Math.hypot(n.x,n.y)<Math.hypot(best.x,best.y)?n:best,nodes[0]);
  const keep=new Set([centerNode.id]),queue=[centerNode.id];
  while(queue.length){const id=queue.shift();for(const v of adj.get(id)||[])if(!keep.has(v)){keep.add(v);queue.push(v)}}
  nodes=nodes.filter(n=>keep.has(n.id));
  const keepIds=new Set(nodes.map(n=>n.id));
  const filtered=edges.filter(e=>keepIds.has(e.a)&&keepIds.has(e.b));
  if(nodes.length<18||filtered.length<20)throw new Error('現在地周辺の道路網が分断されています');
  return {nodes,edges:filtered,center:{lat,lon},source:'osm'};
}

function buildAdj(graph){
  const adj=new Map(graph.nodes.map(n=>[n.id,[]]));
  for(const e of graph.edges){adj.get(e.a)?.push({to:e.b,edge:e});adj.get(e.b)?.push({to:e.a,edge:e});}
  graph.adj=adj;graph.nodeById=new Map(graph.nodes.map(n=>[n.id,n]));graph.edgeById=new Map(graph.edges.map(e=>[e.id,e]));
}
function roadDistances(graph,startId){
  const distances=new Map([[startId,0]]),queue=[{id:startId,d:0}],visited=new Set();
  while(queue.length){
    queue.sort((a,b)=>a.d-b.d);
    const cur=queue.shift();
    if(visited.has(cur.id))continue;
    visited.add(cur.id);
    for(const item of graph.adj.get(cur.id)||[]){
      const nd=cur.d+item.edge.length;
      if(nd<(distances.get(item.to)??Infinity)){
        distances.set(item.to,nd);
        queue.push({id:item.to,d:nd});
      }
    }
  }
  return distances;
}
function shortestRoadDistance(graph,startId,targetId,limit=Infinity){
  if(startId===targetId)return 0;
  const distances=new Map([[startId,0]]),queue=[{id:startId,d:0}],visited=new Set();
  while(queue.length){
    queue.sort((a,b)=>a.d-b.d);
    const cur=queue.shift();
    if(cur.d>limit)return Infinity;
    if(visited.has(cur.id))continue;
    if(cur.id===targetId)return cur.d;
    visited.add(cur.id);
    for(const item of graph.adj.get(cur.id)||[]){
      const nd=cur.d+item.edge.length;
      if(nd<(distances.get(item.to)??Infinity)){
        distances.set(item.to,nd);
        queue.push({id:item.to,d:nd});
      }
    }
  }
  return Infinity;
}
function angleGap(a,b){
  let d=Math.abs(a-b)%(Math.PI*2);
  return Math.min(d,Math.PI*2-d);
}
function selectBasePlacements(graph,cityId){
  const city=graph.nodeById.get(cityId),roadFromCity=roadDistances(graph,cityId);
  const plans=['barracks','engineer','raider','motor'];
  const chosen=[];
  for(const type of plans){
    const def=BASE_DEFS[type],target=(def.range[0]+def.range[1])/2;
    const candidates=graph.nodes.map(node=>({node,route:roadFromCity.get(node.id)??Infinity,angle:Math.atan2(node.y-city.y,node.x-city.x)}))
      .filter(x=>x.node.id!==cityId&&Number.isFinite(x.route)&&x.route>=def.range[0]&&x.route<=def.range[1]&&dist(x.node,city)>=90)
      .sort((a,b)=>Math.abs(a.route-target)-Math.abs(b.route-target));
    const shortlist=candidates.slice(0,60);
    let pick=shortlist.find(x=>chosen.every(c=>angleGap(x.angle,c.angle)>=55*Math.PI/180&&(c.roadMap.get(x.node.id)??Infinity)>=110));
    if(!pick)pick=shortlist.find(x=>chosen.every(c=>angleGap(x.angle,c.angle)>=35*Math.PI/180&&dist(x.node,c.node)>=90));
    if(!pick)pick=shortlist.find(x=>chosen.every(c=>dist(x.node,c.node)>=75));
    if(!pick){
      const fallback=graph.nodes.map(node=>({node,route:roadFromCity.get(node.id)??Infinity,angle:Math.atan2(node.y-city.y,node.x-city.x)}))
        .filter(x=>x.node.id!==cityId&&Number.isFinite(x.route)&&!chosen.some(c=>c.node.id===x.node.id))
        .sort((a,b)=>Math.abs(a.route-target)-Math.abs(b.route-target));
      pick=fallback[0];
    }
    if(pick)chosen.push({...pick,type,roadMap:roadDistances(graph,pick.node.id)});
  }
  return chosen;
}
function nearestNode(graph,p){let best=null,bd=Infinity;for(const n of graph.nodes){const d=dist(n,p);if(d<bd){bd=d;best=n}}return best}
function edgeMid(edge,graph){const a=graph.nodeById.get(edge.a),b=graph.nodeById.get(edge.b);return{x:(a.x+b.x)/2,y:(a.y+b.y)/2}}
