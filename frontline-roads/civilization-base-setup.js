(()=>{
'use strict';
const C=window.FrontlineCiv;
const KEY=C?.STORAGE_KEYS?.baseSetup||'frontline_roads_base_setup';
const MAX_DISTANCE=1000;
const QUERY_RADIUS=1300;
const QUERY_PRIVACY=200;
const PUBLIC_RADIUS=80;
const CELL=100;
const ALLOWED=new Set(['living_street','residential','unclassified','tertiary','tertiary_link','secondary','secondary_link','primary','primary_link','service']);
const BLOCKED_SERVICE=new Set(['driveway','parking_aisle','drive-through','emergency_access','alley']);
let active=false,graph=null,origin=null,selected=null,carry=null,savedScale=1,renderQueued=false,starting=false;
let previousSilent=null,previousSave=null,previousSerialize=null,previousApply=null;
const view={x:0,y:0,scale:0,min:0,max:0,pointers:new Map(),moved:false,lastTap:0};
const rad=v=>v*Math.PI/180;
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
function meters(a,b){
  const p1=rad(a.lat),p2=rad(b.lat),dp=p2-p1,dl=rad(b.lon-a.lon);
  const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 12742000*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}
function toXY(lat,lon){const R=6371000,r=Math.PI/180;return{x:(lon-origin.lon)*r*R*Math.cos(origin.lat*r),y:-(lat-origin.lat)*r*R};}
function fromXY(x,y){const R=6371000,r=Math.PI/180;return{lat:origin.lat-y/(r*R),lon:origin.lon+x/(r*R*Math.cos(origin.lat*r))};}
function hash(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function publicArea(p){
  const a=CELL/111320,b=CELL/(111320*Math.max(.2,Math.cos(rad(p.lat))));
  const lat=Math.round(p.lat/a)*a,lon=Math.round(p.lon/b)*b;
  return{id:`${Math.round(lat/a)}:${Math.round(lon/b)}`,lat:+lat.toFixed(6),lon:+lon.toFixed(6),radius:PUBLIC_RADIUS};
}
function established(){return state?.homeBase?.status==='ESTABLISHED'||Boolean(state?.basePlacementComplete&&state?.homeBaseArea);}
function clearSession(){try{localStorage.removeItem(KEY);}catch{}}
function snapshot(){
  if(!state)return null;
  return{
    inventory:clone(state.inventory),
    progress:clone(state.progress),
    civilization:clone(state.civilization),
    settlementBuildings:clone(state.settlementBuildings)||[],
    production:clone(state.production),
    resources:state.resources?{...state.resources}:null,
    scrap:+state.scrap||0,kills:+state.kills||0
  };
}
function privacyGuards(){
  if(previousSilent)return;
  previousSilent=typeof silentSave==='function'?silentSave:null;
  previousSave=typeof saveGame==='function'?saveGame:null;
  previousSerialize=typeof serializeState==='function'?serializeState:null;
  if(previousSerialize)serializeState=function(){
    const copy=previousSerialize();
    if(copy?.player){const n=state?.map?.nodeById?.get(state?.city?.nodeId);copy.player={x:n?.x||0,y:n?.y||0,lat:null,lon:null};}
    if(copy){delete copy.initialLaunchLocation;delete copy.setupOrigin;}
    return copy;
  };
  if(previousSilent)silentSave=function(){if(active)return;previousSilent();};
  if(previousSave)saveGame=function(){if(active)return;previousSave();};
}
function currentPosition(){
  return new Promise((resolve,reject)=>{
    if(!navigator.geolocation)return reject(new Error('位置情報を利用できません'));
    navigator.geolocation.getCurrentPosition(p=>resolve({lat:p.coords.latitude,lon:p.coords.longitude,accuracy:p.coords.accuracy}),e=>reject(new Error(e.code===1?'位置情報の利用が許可されていません':'位置情報を取得できません')),{enableHighAccuracy:true,timeout:30000,maximumAge:5000});
  });
}
async function loadRoads(p){
  const latStep=QUERY_PRIVACY/111320,lonStep=QUERY_PRIVACY/(111320*Math.max(.2,Math.cos(rad(p.lat))));
  const queryPoint={lat:Math.round(p.lat/latStep)*latStep,lon:Math.round(p.lon/lonStep)*lonStep};
  const q=`[out:json][timeout:28];way["highway"](around:${QUERY_RADIUS},${queryPoint.lat},${queryPoint.lon});out geom;`;
  const hosts=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.nchc.org.tw/api/interpreter'];
  let data,last;
  for(const host of hosts){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
    try{const r=await fetch(`${host}?data=${encodeURIComponent(q)}`,{signal:controller.signal,cache:'no-store'});if(!r.ok)throw new Error(`道路取得に失敗 (${r.status})`);data=await r.json();clearTimeout(timer);break;}catch(e){clearTimeout(timer);last=e;}
  }
  if(!data)throw last||new Error('道路を取得できませんでした');
  const nodeMap=new Map(),edges=[];let ei=0;
  function node(p){const k=`${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;if(!nodeMap.has(k))nodeMap.set(k,{id:`n${nodeMap.size}`,lat:p.lat,lon:p.lon,degree:0});return nodeMap.get(k);}
  for(const way of data.elements||[]){
    const t=way.tags||{},type=t.highway;if(!ALLOWED.has(type)||t.access==='private'||t.access==='no'||(type==='service'&&BLOCKED_SERVICE.has(t.service))||!Array.isArray(way.geometry))continue;
    for(let i=0;i<way.geometry.length-1;i++){
      const a=node(way.geometry[i]),b=node(way.geometry[i+1]),d=meters(a,b);if(d<3||d>250||a.id===b.id)continue;
      a.degree++;b.degree++;edges.push({id:`e${ei++}`,a:a.id,b:b.id,type});
    }
  }
  const nodes=[...nodeMap.values()],byId=new Map(nodes.map(n=>[n.id,n]));
  if(nodes.length<20||edges.length<20)throw new Error('周辺の道路が少なすぎます');
  return{nodes,edges,byId};
}
function overlay(){
  let root=document.getElementById('baseSetupOverlay');if(root)return root;
  root=document.createElement('div');root.id='baseSetupOverlay';root.innerHTML=`<style>
#baseSetupOverlay{position:fixed;inset:0;z-index:1000;background:#090d13;color:#f5f7fa;font-family:system-ui,-apple-system,"Noto Sans JP",sans-serif;display:flex;justify-content:center;padding:env(safe-area-inset-top,0) 0 env(safe-area-inset-bottom,0)}
#baseSetupPanel{width:min(760px,100%);display:flex;flex-direction:column;background:linear-gradient(180deg,#171d26,#0e1218);min-height:100%}
#baseSetupHeader{padding:15px 17px 10px;border-bottom:1px solid #ffffff14}#baseSetupHeader h1{font-size:22px;margin:0 0 5px}#baseSetupHeader p{font-size:13px;line-height:1.5;color:#b9c3d0;margin:0}
#baseSetupMapWrap{position:relative;flex:1;min-height:340px;overflow:hidden;background:#0c1118}#baseSetupMap{position:absolute;inset:0;width:100%;height:100%;touch-action:none}
#baseSetupHint{position:absolute;left:10px;top:9px;background:#0a0e14dc;border-radius:10px;padding:7px 9px;font-size:11px;color:#c8d1dc;pointer-events:none}
#baseSetupZoom{position:absolute;right:9px;top:9px;display:grid;gap:6px}#baseSetupZoom button{width:40px;height:40px;border:1px solid #ffffff1f;border-radius:11px;background:#19202aeb;color:#fff;font-size:21px}
#baseSetupBody{padding:12px 14px 18px;border-top:1px solid #ffffff14;background:#151b24}#baseSetupStatus{background:#222a36;border-radius:13px;padding:10px 12px;font-size:13px;line-height:1.55}
.baseSetupButton{width:100%;border:0;border-radius:14px;padding:13px 15px;margin-top:10px;background:#2f7d45;color:#fff;font-weight:900;font-size:15px}.baseSetupButton.secondary{background:#2a3341}
#baseSetupPrivacy{font-size:11px;color:#8794a4;line-height:1.5;margin-top:9px}.baseSetupLoading{text-align:center;padding:20px;color:#ffd166;font-weight:800}
#baseSetupToast{position:absolute;z-index:4;left:50%;top:18px;transform:translateX(-50%);background:#0b0f15;border:1px solid #ffffff1a;border-radius:10px;padding:8px 11px;font-size:12px;font-weight:800;opacity:0;transition:.2s;pointer-events:none}#baseSetupToast.show{opacity:1}
</style><div id="baseSetupPanel"><div id="baseSetupToast"></div><div id="baseSetupHeader"><h1>地図から集落の場所を選ぶ</h1><p>現在地から1km以内の道路をタップしてください。現地へ移動せず、すぐに開始できます。</p></div><div id="baseSetupMapWrap"><canvas id="baseSetupMap"></canvas><div id="baseSetupHint">移動・拡大縮小して道路をタップ</div><div id="baseSetupZoom"><button id="baseZoomIn">＋</button><button id="baseZoomOut">−</button><button id="baseZoomReset">◎</button></div></div><div id="baseSetupBody"><div class="baseSetupLoading">道路を読み込んでいます…</div></div></div>`;
  document.body.appendChild(root);bind();return root;
}
function toast(text){const e=document.getElementById('baseSetupToast');if(!e)return;e.textContent=text;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),1600);}
function resetView(){view.x=0;view.y=0;view.scale=0;queueRender();}
function worldAt(cx,cy){const c=document.getElementById('baseSetupMap'),r=c.getBoundingClientRect();return{x:(cx-r.left-r.width/2)/view.scale+view.x,y:(cy-r.top-r.height/2)/view.scale+view.y};}
function zoom(f,cx,cy){const c=document.getElementById('baseSetupMap'),r=c.getBoundingClientRect();cx??=r.left+r.width/2;cy??=r.top+r.height/2;const before=worldAt(cx,cy);view.scale=Math.max(view.min,Math.min(view.max,view.scale*f));const after=worldAt(cx,cy);view.x+=before.x-after.x;view.y+=before.y-after.y;queueRender();}
function bind(){
  const c=document.getElementById('baseSetupMap');let pinch=0;
  c.addEventListener('pointerdown',e=>{c.setPointerCapture(e.pointerId);view.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY});view.moved=false;});
  c.addEventListener('pointermove',e=>{const p=view.pointers.get(e.pointerId);if(!p)return;const ox=p.x,oy=p.y;p.x=e.clientX;p.y=e.clientY;if(Math.hypot(p.x-p.sx,p.y-p.sy)>7)view.moved=true;const a=[...view.pointers.values()];if(a.length===1){view.x-=(p.x-ox)/view.scale;view.y-=(p.y-oy)/view.scale;queueRender();}else if(a.length>1){const d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),x=(a[0].x+a[1].x)/2,y=(a[0].y+a[1].y)/2;if(pinch)zoom(d/pinch,x,y);pinch=d;}});
  const end=e=>{const p=view.pointers.get(e.pointerId);view.pointers.delete(e.pointerId);pinch=0;if(p&&!view.moved&&Date.now()-view.lastTap>160){view.lastTap=Date.now();choose(e.clientX,e.clientY);}};
  c.addEventListener('pointerup',end);c.addEventListener('pointercancel',end);c.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY<0?1.18:.84,e.clientX,e.clientY);},{passive:false});
  document.getElementById('baseZoomIn').onclick=()=>zoom(1.25);document.getElementById('baseZoomOut').onclick=()=>zoom(.8);document.getElementById('baseZoomReset').onclick=resetView;
}
function nearest(w){
  let best=null,bd=Infinity;
  for(const e of graph.edges){const a=graph.byId.get(e.a),b=graph.byId.get(e.b),A=toXY(a.lat,a.lon),B=toXY(b.lat,b.lon),dx=B.x-A.x,dy=B.y-A.y,l=dx*dx+dy*dy||1,t=Math.max(0,Math.min(1,((w.x-A.x)*dx+(w.y-A.y)*dy)/l)),x=A.x+dx*t,y=A.y+dy*t,d=Math.hypot(w.x-x,w.y-y);if(d>=bd)continue;const p=fromXY(x,y);if(meters(origin,p)>MAX_DISTANCE)continue;const n=meters(p,a)<=meters(p,b)?a:b;best={lat:p.lat,lon:p.lon,nodeId:n.id,edgeId:e.id,directions:Math.max(2,n.degree),defense:n.degree<=2?'低':n.degree===3?'中':'高',resource:['木材','石材','繊維'][hash(n.id)%3]};bd=d;}
  return bd<=Math.min(55,Math.max(12,22/view.scale))?best:null;
}
function choose(cx,cy){const p=nearest(worldAt(cx,cy));if(!p)return toast('緑の円内の道路をタップしてください');selected=p;panel();queueRender();}
function panel(){
  const b=document.getElementById('baseSetupBody');if(!b)return;
  if(!selected){b.innerHTML='<div id="baseSetupStatus"><b>道路をタップして拠点予定地を選択してください。</b><br>緑の円内なら、現在地から最大1kmまで選べます。</div><div id="baseSetupPrivacy">現在地は範囲判定と道路取得にだけ使用し、拠点確定後は保存しません。</div>';return;}
  b.innerHTML=`<div id="baseSetupStatus"><b>この道路に集落を設置しますか？</b><br>現在地から約${Math.round(meters(origin,selected))}m・道路接続 ${selected.directions}方向・防衛難度 ${selected.defense}<br>${selected.resource}を集めやすい地域です。</div><button class="baseSetupButton" id="confirmBasePlacement">この場所に拠点を作る</button><button class="baseSetupButton secondary" id="clearBasePlacement">別の場所を選ぶ</button><div id="baseSetupPrivacy">現地への移動や待機は不要です。確定すると直ちに原始集落が始まります。</div>`;
  document.getElementById('confirmBasePlacement').onclick=confirm;
  document.getElementById('clearBasePlacement').onclick=()=>{selected=null;panel();queueRender();};
}
function render(){
  const c=document.getElementById('baseSetupMap');if(!c||!graph)return;const r=c.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);c.width=Math.max(1,r.width*d);c.height=Math.max(1,r.height*d);const x=c.getContext('2d');x.setTransform(d,0,0,d,0,0);x.fillStyle='#0c1118';x.fillRect(0,0,r.width,r.height);const base=Math.min(r.width,r.height)/(MAX_DISTANCE*2.18);view.min=base;view.max=base*8;if(!view.scale||view.scale<base)view.scale=base;const S=p=>({x:r.width/2+(p.x-view.x)*view.scale,y:r.height/2+(p.y-view.y)*view.scale});const O=S({x:0,y:0});x.beginPath();x.arc(O.x,O.y,MAX_DISTANCE*view.scale,0,Math.PI*2);x.fillStyle='#7ee78709';x.fill();x.strokeStyle='#7ee78799';x.lineWidth=1.5;x.stroke();x.lineCap='round';for(const e of graph.edges){const a=S(toXY(graph.byId.get(e.a).lat,graph.byId.get(e.a).lon)),b=S(toXY(graph.byId.get(e.b).lat,graph.byId.get(e.b).lon));x.beginPath();x.moveTo(a.x,a.y);x.lineTo(b.x,b.y);x.strokeStyle=['primary','primary_link'].includes(e.type)?'#53657b':['secondary','secondary_link','tertiary','tertiary_link'].includes(e.type)?'#46586c':'#354452';x.lineWidth=['primary','primary_link'].includes(e.type)?3.2:2;x.stroke();}x.beginPath();x.arc(O.x,O.y,7,0,Math.PI*2);x.fillStyle='#78b7ff';x.fill();x.strokeStyle='#fff';x.lineWidth=2;x.stroke();if(selected){const p=S(toXY(selected.lat,selected.lon));x.beginPath();x.arc(p.x,p.y,12,0,Math.PI*2);x.fillStyle='#7ee78738';x.fill();x.beginPath();x.arc(p.x,p.y,7,0,Math.PI*2);x.fillStyle='#7ee787';x.fill();x.strokeStyle='#fff';x.stroke();}}
function queueRender(){if(renderQueued)return;renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;render();});}
async function confirm(){
  const b=document.getElementById('baseSetupBody');b.innerHTML='<div class="baseSetupLoading">集落の周辺道路を構築しています…</div>';
  try{
    const g=await fetchRoadGraph(selected.lat,selected.lon);newGame(g,{x:0,y:0,lat:selected.lat,lon:selected.lon});
    if(carry){if(carry.inventory)state.inventory=clone(carry.inventory);if(carry.progress)state.progress=clone(carry.progress);if(carry.civilization)state.civilization=clone(carry.civilization);if(carry.settlementBuildings)state.settlementBuildings=clone(carry.settlementBuildings);if(carry.production)state.production=clone(carry.production);if(carry.resources)state.resources={...carry.resources};else state.scrap=carry.scrap;state.kills=carry.kills;}
    const area=publicArea(selected);state.basePlacementComplete=true;state.homeBaseArea={...area,establishedAt:Date.now()};state.homeBaseNodeId=state.city.nodeId;state.homeBase={status:'ESTABLISHED',nodeId:state.city.nodeId,publicRegionId:area.id,establishedAt:Date.now(),privacyRadius:PUBLIC_RADIUS,relocation:{freeUntil:Date.now()+600000,used:false,eligible:true}};state.basePrivacy={publicRadius:PUBLIC_RADIUS,exactLocationPublic:false};
    active=false;timeScale=savedScale;clearSession();document.getElementById('baseSetupOverlay')?.remove();C?.migrateState?.(state);previousSilent?.();document.getElementById('startOverlay')?.style.setProperty('display','none');renderTools?.();updateUI?.();fitView?.();showMessage('集落を設営しました',2500);
  }catch(e){console.error(e);b.innerHTML='<div id="baseSetupStatus">周辺道路を取得できませんでした。通信状態を確認してください。</div><button class="baseSetupButton" id="retryBase">再試行</button>';document.getElementById('retryBase').onclick=confirm;}
}
async function begin(p=null){
  if(active||established()||(C?.isPrimaryTab&&!C.isPrimaryTab()))return;clearSession();active=true;savedScale=timeScale||1;timeScale=0;privacyGuards();overlay();
  try{origin=p||await currentPosition();carry=snapshot();graph=await loadRoads(origin);selected=null;resetView();panel();queueRender();}catch(e){console.error(e);document.getElementById('baseSetupBody').innerHTML=`<div id="baseSetupStatus">${e.message}</div><button class="baseSetupButton" id="retryBaseSetup">再試行</button>`;document.getElementById('retryBaseSetup').onclick=()=>{active=false;begin();};}
}
window.FrontlineBaseSetup={begin,render:queueRender,isActive:()=>active,resetForAppReset(){active=false;clearSession();document.getElementById('baseSetupOverlay')?.remove();},getPublicBaseRecord(){return state?.homeBaseArea?{area:{...state.homeBaseArea},ownerPresenceUnknown:true}:null;},constants:{SEARCH_MIN_METERS:0,SEARCH_MAX_METERS:MAX_DISTANCE,CONFIRM_RADIUS_METERS:0,BUILD_SECONDS:0,PUBLIC_AREA_RADIUS:PUBLIC_RADIUS}};
previousApply=typeof applyLocation==='function'?applyLocation:null;
if(previousApply)applyLocation=function(lat,lon,accuracy){const p={lat:+lat,lon:+lon,accuracy:+accuracy};if(!established()){if(!starting){starting=true;begin(p).finally(()=>starting=false);}return;}return previousApply(lat,lon,accuracy);};
let tries=0;(function boot(){if(typeof fetchRoadGraph!=='function'||typeof newGame!=='function'){if(tries++<1200)setTimeout(boot,50);return;}if(state&&!established())begin();})();
})();
