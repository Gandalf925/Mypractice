'use strict';
function updateTower(t,dt){
  if(t.ruined||t.hp<=0)return;
  t.disabledTimer=Math.max(0,(t.disabledTimer||0)-dt);if(t.disabledTimer>0)return;
  t.cooldown=Math.max(0,(t.cooldown||0)-dt);const p=towerNode(t);
  if(t.type==='relay'){
    if(t.cooldown<=0){t.cooldown=3;for(const other of state.towers){if(other===t||other.ruined||other.hp<=0)continue;const n=towerNode(other);if(dist(p,n)<=105)other.hp=Math.min(other.maxHp,other.hp+5);}for(const edge of state.map.edges){if(!edge.barrier)continue;if(dist(p,edgeMid(edge,state.map))<=105)edge.barrier.hp=Math.min(edge.barrier.maxHp,edge.barrier.hp+6);}}
  }else if(t.type==='gun'){
    if(t.cooldown<=0){const targets=enemiesInRange(p,78).sort((a,b)=>dist(enemyPosition(a),p)-dist(enemyPosition(b),p));const target=targets[0];if(target){t.cooldown=2.2;beams.push({a:{...p},b:enemyPosition(target),life:.14,color:'#78b7ff'});damageEnemy(target,5);}}
  }else if(t.type==='mortar'){
    if(t.cooldown<=0){const candidates=enemiesInRange(p,125);let best=null,count=0;for(const e of candidates){const ep=enemyPosition(e);const c=candidates.filter(o=>dist(enemyPosition(o),ep)<28).length;if(c>count){count=c;best=e}}if(best){t.cooldown=12;const hit=enemyPosition(best);explosions.push({p:{...hit},life:.45,max:.45,r:34});for(const e of state.enemies)if(dist(enemyPosition(e),hit)<30)damageEnemy(e,30);}}
  }else if(t.type==='slow'){
    if(t.cooldown<=0){const targets=enemiesInRange(p,82);if(targets.length){t.cooldown=5;for(const e of targets.slice(0,5)){e.slowTimer=Math.max(e.slowTimer||0,12);damageEnemy(e,1);}beams.push({a:{...p},b:enemyPosition(targets[0]),life:.16,color:'#c08cff'});}}
  }
}
function cleanupDead(){state.enemies=state.enemies.filter(e=>e.hp>0)}
function updateBases(dt){
  for(const b of state.bases){
    if(!b.alive)continue;
    const bd=BASE_DEFS[b.type];
    b.ageSeconds=(b.ageSeconds||0)+dt;
    b.level=b.ageSeconds<900?1:b.ageSeconds<2100?2:3;
    b.spawnClock+=dt;
    const interval=baseInterval(b);
    while(b.spawnClock>=interval){b.spawnClock-=interval;spawnWave(b);}
  }
}
function baseInterval(base){const bd=BASE_DEFS[base.type];return bd.interval*(state.city.hp<=30?1.3:1);}
function baseNextWaveSeconds(base){return Math.max(0,baseInterval(base)-(base.spawnClock||0));}
function remainingPathDistance(enemy){
  if((enemy.departDelay||0)>0&&!enemy.path)ensureEnemyPath(enemy);
  if(!enemy.path||!enemy.edgeId)return Infinity;
  let total=Math.max(0,(state.map.edgeById.get(enemy.edgeId)?.length||0)-enemy.edgeProgress);
  for(let i=enemy.pathIndex+1;i<enemy.path.edges.length;i++)total+=state.map.edgeById.get(enemy.path.edges[i])?.length||0;
  return total;
}
function enemyEtaSeconds(enemy){
  const def=ENEMY_DEFS[enemy.type];
  let sec=(enemy.departDelay||0)+remainingPathDistance(enemy)/(def.speed*(enemy.slowTimer>0?.52:1));
  if(enemy.path){for(let i=enemy.pathIndex;i<enemy.path.edges.length;i++){const edge=state.map.edgeById.get(enemy.path.edges[i]);if(edge?.barrier?.hp>0)sec+=edge.barrier.hp/Math.max(.2,def.barrierDps);}}
  return sec;
}
function baseArrivalSeconds(base){
  if(!base.alive)return Infinity;
  const type=baseWave(base)[0],p=dijkstra(base.nodeId,state.city.nodeId,ENEMY_DEFS[type]);
  if(!p)return Infinity;
  const meters=p.edges.reduce((sum,id)=>sum+(state.map.edgeById.get(id)?.length||0),0);
  return baseNextWaveSeconds(base)+meters/ENEMY_DEFS[type].speed;
}
function updateThreatInfo(){
  let best={seconds:Infinity,kind:'none',enemyId:null,baseId:null};
  for(const e of state.enemies){if(e.hp<=0)continue;const sec=enemyEtaSeconds(e);if(sec<best.seconds)best={seconds:sec,kind:'enemy',enemyId:e.id,baseId:e.sourceBaseId};}
  for(const b of state.bases){if(!b.alive)continue;const sec=baseArrivalSeconds(b);if(sec<best.seconds)best={seconds:sec,kind:'base',enemyId:null,baseId:b.id};}
  threatInfo=best;
}
function completeBaseCapture(base){
  const bd=BASE_DEFS[base.type];
  base.captureProgress=bd.captureDuration;base.alive=false;base.captured=true;assaultingBaseId=null;state.scrap+=bd.reward;
  if(!state.towers.some(t=>t.nodeId===base.nodeId&&t.hp>0))state.towers.push({id:uid('tower'),nodeId:base.nodeId,type:bd.capturedType,hp:180,maxHp:180,cooldown:0,disabledTimer:0,ruined:false,history:{kills:0},capturedSite:true});
  showMessage(`${bd.name}を制圧。${TOOL_DEFS[bd.capturedType].name}へ転換しました`,3000);selectedObject=null;hideContext();fitView();
}
function updateCaptureDecay(dt){
  for(const b of state.bases){
    if(!b.alive||!(b.captureProgress>0)||b.id===assaultingBaseId)continue;
    const n=state.map.nodeById.get(b.nodeId),bd=BASE_DEFS[b.type];
    if(dist(state.player,n)<=50){b.captureAway=0;continue;}
    b.captureAway=(b.captureAway||0)+dt;
    if(b.captureAway>120)b.captureProgress=Math.max(0,b.captureProgress-bd.captureDuration*.005*dt);
  }
}
function updateAssault(dt){
  updateCaptureDecay(dt);
  if(!assaultingBaseId)return;
  const b=state.bases.find(x=>x.id===assaultingBaseId);if(!b||!b.alive){assaultingBaseId=null;return}
  const n=state.map.nodeById.get(b.nodeId),d=dist(state.player,n),bd=BASE_DEFS[b.type];
  if(d>50){showMessage('制圧範囲から離れたため進行を一時停止');assaultingBaseId=null;b.captureAway=0;showContextForSelected();return}
  b.captureAway=0;b.captureProgress=Math.min(bd.captureDuration,(b.captureProgress||0)+dt);particlesBurst(n,'#7ee787',1);
  if(b.captureProgress>=bd.captureDuration)completeBaseCapture(b);
}
function update(dt){
  if(!state)return;dt*=timeScale;updateBases(dt);for(const t of state.towers)updateTower(t,dt);updateAssault(dt);
  const remove=[];for(const e of state.enemies)if(updateEnemy(e,dt))remove.push(e.id);if(remove.length)state.enemies=state.enemies.filter(e=>!remove.includes(e.id));cleanupDead();
  for(const p of particles)p.life-=dt;particles=particles.filter(p=>p.life>0);for(const b of beams)b.life-=dt;beams=beams.filter(b=>b.life>0);for(const ex of explosions)ex.life-=dt;explosions=explosions.filter(ex=>ex.life>0);
  if(state.city.hp<=0){state.city.hp=35;state.enemies=[];state.scrap=Math.max(0,state.scrap-80);showMessage('都市防衛線が崩壊。緊急再編成が行われました',3200)}
  etaClock+=dt;if(etaClock>=.5){etaClock=0;updateThreatInfo();}
  saveClock+=dt;if(saveClock>5*timeScale){saveClock=0;silentSave()}updateUI();
}

function renderTools(){
  const el=$('tools');el.innerHTML='';for(const [key,d] of Object.entries(TOOL_DEFS)){if(d.hidden)continue;const b=document.createElement('button');b.className='tool'+(selectedTool===key?' selected':'');b.dataset.tool=key;b.innerHTML=`<span class="cost">${d.cost?d.cost:''}</span><strong>${d.icon}</strong><span>${d.name}</span><small>${d.type==='barrier'?'道路':d.type==='tower'?'交差点':'確認'}</small>`;b.onclick=()=>{selectedTool=key;selectedObject=null;hideContext();pathPreview=null;renderTools();showMessage(key==='select'?'対象をタップ':'現在地から85m以内へ配置');};el.appendChild(b)}
}
function updateUI(){if(!state)return;
  $('cityHpText').textContent=Math.ceil(state.city.hp);$('cityHpFill').style.width=(state.city.hp/state.city.maxHp*100)+'%';$('scrapText').textContent=Math.floor(state.scrap);
  const gps=state.player.lat?(lastLocationAccuracy?`位置：GPS ±${Math.round(lastLocationAccuracy)}m`:'位置：GPS追跡中'):'位置：待機中';$('gpsPill').textContent=gps;
  $('threatPill').textContent=`先頭到着 ${fmtClock(threatInfo.seconds)}`;
}

function draw(){
  ctx.clearRect(0,0,screen.w,screen.h);if(!state)return;
  ctx.save();
  drawRoads();drawPreview();drawBases();drawBarriers();drawTowers();drawEnemies();drawThreatEta();drawCity();drawPlayer();drawEffects();
  ctx.restore();
}
function drawRoads(){
  const counts=new Map();for(const e of state.enemies)if(e.edgeId)counts.set(e.edgeId,(counts.get(e.edgeId)||0)+1);
  ctx.lineCap='round';ctx.lineJoin='round';
  for(const edge of state.map.edges){const a=worldToScreen(state.map.nodeById.get(edge.a)),b=worldToScreen(state.map.nodeById.get(edge.b));
    ctx.strokeStyle=COLORS.roadEdge;ctx.lineWidth=Math.max(7,10*view.scale/1.4);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    ctx.strokeStyle=COLORS.road;ctx.lineWidth=Math.max(3.5,6*view.scale/1.4);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    const c=counts.get(edge.id)||0;if(c){ctx.strokeStyle=`rgba(255,80,80,${Math.min(.52,.14+c*.025)})`;ctx.lineWidth=Math.min(24,5+c*1.4);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
  }
}
function drawPreview(){if(!pathPreview)return;ctx.setLineDash([7,7]);ctx.strokeStyle='rgba(255,255,255,.78)';ctx.lineWidth=3;for(const eid of pathPreview.edges||[]){const e=state.map.edgeById.get(eid),a=worldToScreen(state.map.nodeById.get(e.a)),b=worldToScreen(state.map.nodeById.get(e.b));ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}ctx.setLineDash([]);}
function drawCity(){const p=worldToScreen(state.map.nodeById.get(state.city.nodeId));ctx.save();ctx.translate(p.x,p.y);ctx.fillStyle='#f4f7fb';ctx.strokeStyle='#78b7ff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,13,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#11141a';ctx.font='bold 15px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('城',0,1);ctx.restore();}
function drawPlayer(){const p=worldToScreen(state.player);ctx.save();ctx.translate(p.x,p.y);ctx.fillStyle='#7ee787';ctx.strokeStyle='#0b3f20';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,9,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.arc(0,0,15,0,Math.PI*2);ctx.strokeStyle='rgba(126,231,135,.32)';ctx.stroke();ctx.restore();}
function drawBases(){for(const b of state.bases){if(!b.alive)continue;const n=worldToScreen(state.map.nodeById.get(b.nodeId));const d=BASE_DEFS[b.type],progress=(b.captureProgress||0)/d.captureDuration;ctx.save();ctx.translate(n.x,n.y);ctx.fillStyle=d.color;ctx.strokeStyle=b.id===selectedObject?.id?'#fff':'rgba(255,255,255,.35)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,12,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#fff';ctx.font='bold 14px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(d.icon,0,0);ctx.fillStyle='rgba(0,0,0,.5)';ctx.fillRect(-14,16,28,4);ctx.fillStyle=progress>0?'#7ee787':'#ff6b6b';ctx.fillRect(-14,16,28*(progress>0?progress:1),4);const label=progress>0?`制圧 ${Math.floor(progress*100)}%`:`出撃 ${fmtClock(baseNextWaveSeconds(b))}`;ctx.font='bold 10px sans-serif';const w=ctx.measureText(label).width+10;ctx.fillStyle='rgba(9,12,18,.86)';ctx.fillRect(-w/2,-31,w,15);ctx.fillStyle=progress>0?'#7ee787':'#ffd166';ctx.fillText(label,0,-23.5);ctx.restore();}}
function drawBarriers(){for(const e of state.map.edges){if(!e.barrier)continue;const m=worldToScreen(edgeMid(e,state.map));const a=state.map.nodeById.get(e.a),b=state.map.nodeById.get(e.b);const angle=Math.atan2(b.y-a.y,b.x-a.x);ctx.save();ctx.translate(m.x,m.y);ctx.rotate(angle);ctx.fillStyle='#d4a24d';ctx.strokeStyle='#492f10';ctx.lineWidth=2;ctx.fillRect(-10,-5,20,10);ctx.strokeRect(-10,-5,20,10);ctx.fillStyle='rgba(0,0,0,.55)';ctx.fillRect(-11,8,22,3);ctx.fillStyle=e.barrier.hp<60?'#ff6b6b':'#7ee787';ctx.fillRect(-11,8,22*clamp(e.barrier.hp/e.barrier.maxHp,0,1),3);ctx.restore();}}
function towerColor(type){return type==='gun'?'#78b7ff':type==='mortar'?'#ffb86b':type==='relay'?'#7ee787':'#c08cff'}
function drawTowers(){for(const t of state.towers){const p=worldToScreen(towerNode(t));ctx.save();ctx.translate(p.x,p.y);ctx.globalAlpha=t.ruined?.55:1;ctx.fillStyle=t.ruined?'#4a4f58':towerColor(t.type);ctx.strokeStyle=t.id===selectedObject?.id?'#fff':'#18202a';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,9,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#10141a';ctx.font='bold 10px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t.type==='gun'?'G':t.type==='mortar'?'M':t.type==='relay'?'R':'S',0,0);if(t.hp<t.maxHp){ctx.fillStyle='rgba(0,0,0,.55)';ctx.fillRect(-10,12,20,3);ctx.fillStyle=t.hp<40?'#ff6b6b':'#ffd166';ctx.fillRect(-10,12,20*clamp(t.hp/t.maxHp,0,1),3);}ctx.restore();}}
function drawEnemies(){for(const e of state.enemies){if((e.departDelay||0)>0)continue;const p=worldToScreen(enemyPosition(e));const d=ENEMY_DEFS[e.type];ctx.save();ctx.translate(p.x,p.y);ctx.fillStyle=d.color;ctx.strokeStyle='rgba(0,0,0,.55)';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,0,d.size,0,Math.PI*2);ctx.fill();ctx.stroke();if(e.type==='shield'){ctx.strokeStyle='rgba(120,190,255,.55)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,d.size+3,0,Math.PI*2);ctx.stroke();}if(e.hp<e.maxHp){ctx.fillStyle='rgba(0,0,0,.5)';ctx.fillRect(-6,-9,12,2);ctx.fillStyle='#7ee787';ctx.fillRect(-6,-9,12*clamp(e.hp/e.maxHp,0,1),2);}ctx.restore();}}
function drawThreatEta(){
  if(threatInfo.kind!=='enemy'||!Number.isFinite(threatInfo.seconds))return;
  const e=state.enemies.find(x=>x.id===threatInfo.enemyId);if(!e||(e.departDelay||0)>0)return;
  const p=worldToScreen(enemyPosition(e)),label=`城まで ${fmtClock(threatInfo.seconds)}`;
  ctx.save();ctx.font='bold 11px sans-serif';const w=ctx.measureText(label).width+12;ctx.fillStyle='rgba(7,10,15,.9)';ctx.strokeStyle='rgba(255,107,107,.75)';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(p.x-w/2,p.y-29,w,18,7);ctx.fill();ctx.stroke();ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,p.x,p.y-20);ctx.restore();
}
function drawEffects(){for(const b of beams){const a=worldToScreen(b.a),bb=worldToScreen(b.b);ctx.globalAlpha=clamp(b.life/.12,0,1);ctx.strokeStyle=b.color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(bb.x,bb.y);ctx.stroke();ctx.globalAlpha=1}for(const ex of explosions){const p=worldToScreen(ex.p),t=1-ex.life/ex.max;ctx.fillStyle=`rgba(255,174,74,${.5*(1-t)})`;ctx.beginPath();ctx.arc(p.x,p.y,ex.r*t*view.scale,0,Math.PI*2);ctx.fill()}for(const p of particles){const s=worldToScreen({x:p.x+p.vx*(1-p.life/p.max),y:p.y+p.vy*(1-p.life/p.max)});ctx.globalAlpha=p.life/p.max;ctx.fillStyle=p.color;ctx.fillRect(s.x,s.y,2.5,2.5);ctx.globalAlpha=1}}
function particlesBurst(p,color,count){for(let i=0;i<count;i++)particles.push({x:p.x,y:p.y,vx:(Math.random()-.5)*25,vy:(Math.random()-.5)*25,life:.4,max:.4,color})}

function nearestScreenNode(x,y,maxPx=28){let best=null,bd=maxPx;for(const n of state.map.nodes){const s=worldToScreen(n),d=Math.hypot(s.x-x,s.y-y);if(d<bd){bd=d;best=n}}return best}
function pointSegDistance(p,a,b){const l2=(b.x-a.x)**2+(b.y-a.y)**2;if(!l2)return dist(p,a);let t=((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))/l2;t=clamp(t,0,1);return dist(p,{x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)})}
function nearestScreenEdge(x,y,maxPx=24){const p={x,y};let best=null,bd=maxPx;for(const e of state.map.edges){const a=worldToScreen(state.map.nodeById.get(e.a)),b=worldToScreen(state.map.nodeById.get(e.b)),d=pointSegDistance(p,a,b);if(d<bd){bd=d;best=e}}return best}
function nearbyBaseAt(x,y,maxPx=26){let best=null,bd=maxPx;for(const b of state.bases){if(!b.alive)continue;const s=worldToScreen(state.map.nodeById.get(b.nodeId)),d=Math.hypot(s.x-x,s.y-y);if(d<bd){bd=d;best=b}}return best}
function nearbyTowerAt(x,y,maxPx=24){let best=null,bd=maxPx;for(const t of state.towers){const s=worldToScreen(towerNode(t)),d=Math.hypot(s.x-x,s.y-y);if(d<bd){bd=d;best=t}}return best}
function canBuildAt(p){return dist(state.player,p)<=85}

function tapMap(x,y){
  const world=screenToWorld({x,y});
  if(testMove){state.player.x=world.x;state.player.y=world.y;const ll=xyToLatLon(world.x,world.y,state.map.center);state.player.lat=ll.lat;state.player.lon=ll.lon;showMessage('テスト現在地を移動しました');return}
  if(selectedTool==='select'){
    const base=nearbyBaseAt(x,y);if(base){selectedObject={kind:'base',id:base.id};showContextForSelected();return}
    const tower=nearbyTowerAt(x,y);if(tower){selectedObject={kind:'tower',id:tower.id};showContextForSelected();return}
    const edge=nearestScreenEdge(x,y);if(edge?.barrier){selectedObject={kind:'barrier',id:edge.id};showContextForSelected();return}
    selectedObject=null;hideContext();return;
  }
  const def=TOOL_DEFS[selectedTool];if(state.scrap<def.cost){showMessage('資材が足りません');return}
  if(selectedTool==='barrier'){
    const edge=nearestScreenEdge(x,y);if(!edge){showMessage('道路をタップしてください');return}if(edge.barrier){showMessage('この道路には既に防壁があります');return}const m=edgeMid(edge,state.map);if(!canBuildAt(m)){showMessage(`現地まで ${fmtMeters(dist(state.player,m))}`);return}
    edge.barrier={hp:220,maxHp:220,createdAt:now()};state.scrap-=def.cost;for(const e of state.enemies)e.path=null;showMessage('防壁を建設。敵が経路を再計算します');selectedTool='select';pathPreview=null;renderTools();return;
  }
  const node=nearestScreenNode(x,y);if(!node){showMessage('交差点をタップしてください');return}if(!canBuildAt(node)){showMessage(`現地まで ${fmtMeters(dist(state.player,node))}`);return}if(state.towers.some(t=>t.nodeId===node.id&&t.hp>0)){showMessage('この地点には既に施設があります');return}
  const captured=state.bases.find(b=>b.nodeId===node.id&&!b.alive);
  state.towers.push({id:uid('tower'),nodeId:node.id,type:selectedTool,hp:150,maxHp:150,cooldown:0,ruined:false,history:{kills:0},capturedSite:!!captured});state.scrap-=def.cost;showMessage(`${def.name}を建設。直ちに攻撃を開始します`);selectedTool='select';renderTools();
}

function previewAt(x,y){pathPreview=null;if(!state||selectedTool!=='barrier')return;const edge=nearestScreenEdge(x,y);if(!edge||edge.barrier)return;const activeBase=state.bases.find(b=>b.alive);if(!activeBase)return;pathPreview=dijkstra(activeBase.nodeId,state.city.nodeId,ENEMY_DEFS.infantry,edge.id);}
