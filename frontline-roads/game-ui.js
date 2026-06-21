'use strict';
function showContextForSelected(){
  const box=$('context'),title=$('contextTitle'),text=$('contextText'),actions=$('contextActions');actions.innerHTML='';if(!selectedObject){hideContext();return}
  if(selectedObject.kind==='base'){
    const b=state.bases.find(x=>x.id===selectedObject.id);if(!b||!b.alive){hideContext();return}const n=state.map.nodeById.get(b.nodeId),d=dist(state.player,n),bd=BASE_DEFS[b.type],wave=baseWave(b),pct=Math.floor((b.captureProgress||0)/bd.captureDuration*100);
    title.textContent=`${bd.name} Lv.${b.level}`;
    text.textContent=`現在地から ${fmtMeters(d)}。道路距離 約${fmtMeters(b.roadDistance||d)}、徒歩${Math.max(2,Math.round((b.roadDistance||d)/75))}分。次部隊まで ${fmtClock(baseNextWaveSeconds(b))}、城への到着見込み ${fmtEta(baseArrivalSeconds(b))}。編成：${wave.map(x=>ENEMY_DEFS[x].name).join('・')}。制圧 ${pct}%（${Math.ceil(bd.captureDuration-(b.captureProgress||0))}秒）。`;
    const capture=button(pct>0?'制圧を再開':'現地制圧',true);capture.disabled=d>35;capture.onclick=()=>{const current=dist(state.player,n);if(current>35){showMessage(`拠点まで ${fmtMeters(current)}。35m以内で開始できます`);return}assaultingBaseId=b.id;b.captureAway=0;if(!b.guardSpawned){b.guardSpawned=true;spawnWave(b,true);}showMessage(`${bd.name}の制圧を開始。50m以内に留まってください`,2200);showContextForSelected();};actions.appendChild(capture);
    const trace=button('敵流を強調');trace.onclick=()=>{showMessage(`${bd.name}からの敵を追跡中`,1400)};actions.appendChild(trace);
  }else if(selectedObject.kind==='tower'){
    const t=state.towers.find(x=>x.id===selectedObject.id);if(!t){hideContext();return}title.textContent=`${TOOL_DEFS[t.type]?.name||'防衛施設'}${t.ruined?'（残骸）':''}`;text.textContent=`耐久 ${Math.ceil(t.hp)}/${t.maxHp}。${t.disabledTimer>0?`工作妨害であと${Math.ceil(t.disabledTimer)}秒停止中。`:t.ruined?'現地へ行けば完全再建できます。':t.type==='relay'?'周囲105mの施設と防壁を自動修理します。':'遠隔修理が可能です。'}`;
    if(t.ruined){const n=towerNode(t),d=dist(state.player,n);const rebuild=button('現地再建',true);rebuild.disabled=d>85||state.scrap<35;rebuild.onclick=()=>{if(d>85){showMessage(`現地まで ${fmtMeters(d)}`);return}if(state.scrap<35)return;state.scrap-=35;t.hp=t.maxHp;t.ruined=false;showMessage('施設を再建しました');showContextForSelected()};actions.appendChild(rebuild)}else{const repair=button('遠隔修理');repair.onclick=()=>{const need=t.maxHp-t.hp,cost=Math.ceil(need*.18);if(!need)return showMessage('損傷していません');if(state.scrap<cost)return showMessage('資材が足りません');state.scrap-=cost;t.hp=t.maxHp;showMessage(`修理完了 -${cost}`);showContextForSelected()};actions.appendChild(repair)}
    const remove=button('撤去');remove.onclick=()=>{state.towers=state.towers.filter(x=>x.id!==t.id);selectedObject=null;hideContext();showMessage('施設を撤去しました')};actions.appendChild(remove);
  }else if(selectedObject.kind==='barrier'){
    const e=state.map.edgeById.get(selectedObject.id);if(!e?.barrier){hideContext();return}title.textContent='防壁';text.textContent=`耐久 ${Math.ceil(e.barrier.hp)}/${e.barrier.maxHp}。破壊されると道路が開通し、敵の経路が変わります。`;
    const repair=button('遠隔修理');repair.onclick=()=>{const need=e.barrier.maxHp-e.barrier.hp,cost=Math.ceil(need*.12);if(!need)return showMessage('損傷していません');if(state.scrap<cost)return showMessage('資材が足りません');state.scrap-=cost;e.barrier.hp=e.barrier.maxHp;showMessage(`防壁を修理 -${cost}`);showContextForSelected()};actions.appendChild(repair);
    const open=button('撤去');open.onclick=()=>{e.barrier=null;for(const en of state.enemies)en.path=null;selectedObject=null;hideContext();showMessage('道路を開通しました')};actions.appendChild(open);
  }
  box.classList.add('show');
}
function button(text,primary=false){const b=document.createElement('button');b.textContent=text;if(primary)b.classList.add('primary');return b}
function hideContext(){$('context').classList.remove('show')}

canvas.addEventListener('pointerdown',e=>{if(!state)return;canvas.setPointerCapture(e.pointerId);pointer={down:true,id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false};previewAt(e.clientX,e.clientY)});
canvas.addEventListener('pointermove',e=>{if(!pointer.down||pointer.id!==e.pointerId)return;const dx=e.clientX-pointer.lastX,dy=e.clientY-pointer.lastY;if(Math.hypot(e.clientX-pointer.startX,e.clientY-pointer.startY)>8)pointer.moved=true;if(pointer.moved){view.offsetX+=dx;view.offsetY+=dy}else previewAt(e.clientX,e.clientY);pointer.lastX=e.clientX;pointer.lastY=e.clientY});
canvas.addEventListener('pointerup',e=>{if(!pointer.down||pointer.id!==e.pointerId)return;pointer.down=false;if(!pointer.moved)tapMap(e.clientX,e.clientY)});
canvas.addEventListener('pointercancel',()=>pointer.down=false);

$('zoomIn').onclick=()=>{view.scale=clamp(view.scale*1.22,view.minScale,view.maxScale)};
$('zoomOut').onclick=()=>{view.scale=clamp(view.scale/1.22,view.minScale,view.maxScale)};
$('recenter').onclick=fitView;
$('menuBtn').onclick=()=>{$('menuOverlay').style.display='flex'};
$('closeMenu').onclick=()=>{$('menuOverlay').style.display='none'};
$('helpBtn').onclick=()=>{$('menuOverlay').style.display='none';$('helpOverlay').style.display='flex'};
$('closeHelp').onclick=()=>{$('helpOverlay').style.display='none'};
$('saveBtn').onclick=saveGame;
$('resetBtn').onclick=()=>{if(confirm('現在のゲームを初期化しますか？'))resetGame()};
$('timeScaleBtn').onclick=()=>{timeScale=timeScale===1?5:timeScale===5?20:1;$('timeScaleBtn').textContent=timeScale===1?'1× 現実時間':`${timeScale}× 検証`;showMessage(timeScale===1?'現実時間に戻しました':`検証速度 ${timeScale}倍`)};
$('offlineClose').onclick=()=>{$('offlineSummary').style.display='none'};

async function createFromLatLon(lat,lon){
  if(firstLocationLoadInProgress||state)return;
  firstLocationLoadInProgress=true;
  $('loading').style.display='block';$('loading').textContent='現在地周辺の道路を取得しています…';
  try{
    const graph=await fetchRoadGraph(lat,lon);
    newGame(graph,{x:0,y:0,lat,lon});
    $('startOverlay').style.display='none';
    updateThreatInfo();
    showMessage('現在地の道路を読み込みました',2200);
  }catch(err){
    console.error(err);
    $('loading').textContent='道路データを取得できませんでした。通信状態を確認して再取得してください。';
  }finally{
    firstLocationLoadInProgress=false;
  }
}

function applyLocation(lat,lon,accuracy){
  if(!Number.isFinite(lat)||!Number.isFinite(lon))return;
  nativeLocationReady=true;
  lastLocationAccuracy=Number.isFinite(accuracy)?accuracy:null;
  if(!state){createFromLatLon(lat,lon);return;}
  if(state.source!=='osm')return;
  const p=latLonToXY(lat,lon,state.map.center);
  state.player.x=p.x;state.player.y=p.y;state.player.lat=lat;state.player.lon=lon;
}

window.__nativeLocationUpdate=(lat,lon,accuracy)=>applyLocation(Number(lat),Number(lon),Number(accuracy));
window.__nativeLocationError=(message)=>{
  $('loading').style.display='block';
  $('loading').textContent=message||'位置情報を取得できません。端末の位置情報と権限を確認してください。';
};

function requestLocation(){
  $('loading').style.display='block';$('loading').textContent='現在地を取得しています…';
  if(!window.isSecureContext){
    window.__nativeLocationError('位置情報にはHTTPSが必要です。GitHub PagesのURLから開いてください。');
    return;
  }
  if(!navigator.geolocation){
    window.__nativeLocationError('このブラウザでは位置情報を利用できません。');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos=>applyLocation(pos.coords.latitude,pos.coords.longitude,pos.coords.accuracy),
    err=>{
      const reason=err?.code===1
        ? '位置情報が拒否されています。ブラウザのサイト設定で位置情報を許可し、再取得してください。'
        : err?.code===2
          ? '現在地を特定できません。端末のGPSをONにして再取得してください。'
          : '位置情報の取得がタイムアウトしました。屋外または窓際で再取得してください。';
      window.__nativeLocationError(reason);
    },
    {enableHighAccuracy:true,timeout:30000,maximumAge:3000}
  );
}

$('retryLocation').onclick=requestLocation;

function startGeoWatch(){
  if(!navigator.geolocation||state?.source!=='osm')return;
  if(geoWatchId!==null)navigator.geolocation.clearWatch(geoWatchId);
  geoWatchId=navigator.geolocation.watchPosition(
    pos=>applyLocation(pos.coords.latitude,pos.coords.longitude,pos.coords.accuracy),
    err=>console.warn(err),
    {enableHighAccuracy:true,maximumAge:3000,timeout:15000}
  );
}

function runOfflineProgress(){
  if(!state?.lastSavedAt)return;const elapsed=Math.min(12*3600,Math.max(0,(now()-state.lastSavedAt)/1000));if(elapsed<15)return;
  const before={kills:state.kills,hp:state.city.hp,barriers:state.map.edges.filter(e=>e.barrier).length,towers:state.towers.filter(t=>!t.ruined).length};
  const steps=Math.ceil(elapsed/2);for(let i=0;i<steps;i++){updateBases(2);for(const t of state.towers)updateTower(t,2);const rem=[];for(const e of state.enemies)if(updateEnemy(e,2))rem.push(e.id);if(rem.length)state.enemies=state.enemies.filter(e=>!rem.includes(e.id));cleanupDead();if(state.city.hp<=0){state.city.hp=35;state.enemies=[];break}}
  const after={kills:state.kills,hp:state.city.hp,barriers:state.map.edges.filter(e=>e.barrier).length,towers:state.towers.filter(t=>!t.ruined).length};
  $('offlineText').textContent=`${Math.floor(elapsed/60)}分間で敵を${after.kills-before.kills}体撃破。都市耐久 ${Math.ceil(before.hp)}→${Math.ceil(after.hp)}。防壁損失 ${before.barriers-after.barriers}、施設損失 ${before.towers-after.towers}。`;
  $('offlineSummary').style.display='block';state.lastSavedAt=now();silentSave();
}

document.addEventListener('visibilitychange',()=>{if(document.hidden)silentSave();else if(state){const gap=(now()-state.lastSavedAt)/1000;if(gap>15)runOfflineProgress()}});
addEventListener('beforeunload',silentSave);

function loop(ts){const dt=Math.min(.05,(ts-lastFrame)/1000);lastFrame=ts;if(state)update(dt);draw();requestAnimationFrame(loop)}

if(loadGame()){
  $('startOverlay').style.display='none';fitView();renderTools();updateThreatInfo();updateUI();runOfflineProgress();if(enemySpecMigrated)setTimeout(()=>showMessage('敵拠点を徒歩圏内へ再配置しました',3000),500);
}else renderTools();
requestLocation();
setTimeout(startGeoWatch,1200);
requestAnimationFrame(loop);
if('serviceWorker' in navigator){
  addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(err=>console.warn('Service Worker:',err)));
}
