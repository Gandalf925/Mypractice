'use strict';
function createBaseFromPlacement(placement){
  const bd=BASE_DEFS[placement.type];
  return {id:uid('base'),nodeId:placement.node.id,type:placement.type,hp:100,maxHp:100,alive:true,captured:false,spawnClock:Math.max(0,bd.interval-bd.firstDelay),level:1,ageSeconds:0,captureProgress:0,captureAway:0,guardSpawned:false,wavesSent:0,roadDistance:placement.route};
}
function installNeighborhoodEnemyLayer(){
  const placements=selectBasePlacements(state.map,state.city.nodeId);
  state.bases=placements.map(createBaseFromPlacement);
  state.enemies=[];
  state.enemySpecVersion=ENEMY_SPEC_VERSION;
  state.version=VERSION;
  state.lastSavedAt=now();
  assaultingBaseId=null;
  enemySpecMigrated=true;
}
function newGame(graph,player){
  buildAdj(graph);
  const city=nearestNode(graph,{x:0,y:0});
  const placements=selectBasePlacements(graph,city.id);
  const bases=placements.map(createBaseFromPlacement);
  state={version:VERSION,enemySpecVersion:ENEMY_SPEC_VERSION,started:true,map:graph,city:{nodeId:city.id,hp:100,maxHp:100},player:{x:player.x,y:player.y,lat:player.lat||null,lon:player.lon||null},scrap:250,towers:[],bases,enemies:[],kills:0,lastSavedAt:now(),source:graph.source,offline:{kills:0,damage:0,barriersLost:0,towersLost:0},tutorialSeen:false};
  buildAdj(state.map);
  fitView();renderTools();updateUI();saveGame();
}

function serializeState(){
  const copy=JSON.parse(JSON.stringify(state));
  delete copy.map.adj;delete copy.map.nodeById;delete copy.map.edgeById;
  return copy;
}
function saveGame(){if(!state)return;state.lastSavedAt=now();localStorage.setItem(SAVE_KEY,JSON.stringify(serializeState()));showMessage('保存しました',800)}
function silentSave(){if(!state)return;state.lastSavedAt=now();localStorage.setItem(SAVE_KEY,JSON.stringify(serializeState()))}
function loadGame(){
  try{
    const raw=localStorage.getItem(SAVE_KEY);if(!raw)return false;
    state=JSON.parse(raw);buildAdj(state.map);
    state.towers=state.towers||[];state.bases=state.bases||[];state.enemies=state.enemies||[];state.offline=state.offline||{kills:0,damage:0,barriersLost:0,towersLost:0};
    for(const e of state.map.edges)if(e.barrier===undefined)e.barrier=null;
    for(const t of state.towers||[]){if(t.disabledTimer===undefined)t.disabledTimer=0;}
    for(const b of state.bases||[]){
      if(b.wavesSent===undefined)b.wavesSent=0;
      if(!Number.isFinite(b.spawnClock))b.spawnClock=0;
      if(!Number.isFinite(b.captureProgress))b.captureProgress=0;
      if(!Number.isFinite(b.captureAway))b.captureAway=0;
      if(!Number.isFinite(b.ageSeconds))b.ageSeconds=0;
    }
    for(const e of state.enemies||[]){if(e.departDelay===undefined)e.departDelay=0;if(e.slowTimer===undefined)e.slowTimer=0;if(!Array.isArray(e.stunnedTowerIds))e.stunnedTowerIds=[];}
    if(state.enemySpecVersion!==ENEMY_SPEC_VERSION)installNeighborhoodEnemyLayer();
    return true;
  }catch(e){console.error(e);return false}
}
function resetGame(){localStorage.removeItem(SAVE_KEY);location.reload()}

function fitView(){
  if(!state)return;
  const focus=[state.map.nodeById.get(state.city.nodeId),state.player,...state.bases.filter(b=>b.alive).map(b=>state.map.nodeById.get(b.nodeId))].filter(Boolean);
  const xs=focus.map(n=>n.x),ys=focus.map(n=>n.y);let minX=Math.min(...xs)-70,maxX=Math.max(...xs)+70,minY=Math.min(...ys)-70,maxY=Math.max(...ys)+70;
  const nearby=state.map.nodes.filter(n=>n.x>=minX-50&&n.x<=maxX+50&&n.y>=minY-50&&n.y<=maxY+50);
  if(nearby.length){minX=Math.min(...nearby.map(n=>n.x));maxX=Math.max(...nearby.map(n=>n.x));minY=Math.min(...nearby.map(n=>n.y));maxY=Math.max(...nearby.map(n=>n.y));}
  const pad=58,availW=screen.w-pad*2,availH=screen.h-180;
  view.scale=clamp(Math.min(availW/(maxX-minX||1),availH/(maxY-minY||1)),.48,2.4);
  view.offsetX=screen.w/2-((minX+maxX)/2)*view.scale;view.offsetY=(screen.h-35)/2-((minY+maxY)/2)*view.scale;
}
function worldToScreen(p){return{x:p.x*view.scale+view.offsetX,y:p.y*view.scale+view.offsetY}}
function screenToWorld(p){return{x:(p.x-view.offsetX)/view.scale,y:(p.y-view.offsetY)/view.scale}}

function dijkstra(startId,targetId,enemy=null,previewBarrierEdgeId=null){
  const g=state.map;const distMap=new Map([[startId,0]]),prev=new Map(),visited=new Set();
  const queue=[{id:startId,d:0}];
  while(queue.length){queue.sort((a,b)=>a.d-b.d);const cur=queue.shift();if(visited.has(cur.id))continue;visited.add(cur.id);if(cur.id===targetId)break;
    for(const item of g.adj.get(cur.id)||[]){const e=item.edge;let w=e.length;
      const barrier=(e.id===previewBarrierEdgeId)?{hp:220}:e.barrier;
      if(barrier&&barrier.hp>0){w+=enemy?.engineer?8+barrier.hp*.04:12000;}
      if(enemy?.avoidTowers)w*=1+edgeTowerThreat(e)*.9;
      if(enemy?.avoidCongestion)w*=1+(edgeEnemyCount(e.id)/12);
      const nd=cur.d+w;if(nd<(distMap.get(item.to)??Infinity)){distMap.set(item.to,nd);prev.set(item.to,{node:cur.id,edge:e.id});queue.push({id:item.to,d:nd});}
    }
  }
  if(!distMap.has(targetId))return null;
  const nodes=[targetId],edges=[];let cur=targetId;
  while(cur!==startId){const p=prev.get(cur);if(!p)return null;edges.push(p.edge);cur=p.node;nodes.push(cur)}
  nodes.reverse();edges.reverse();return{nodes,edges,cost:distMap.get(targetId)};
}
function edgeEnemyCount(edgeId){let c=0;for(const e of state?.enemies||[])if(e.edgeId===edgeId)c++;return c}
function edgeTowerThreat(edge){const m=edgeMid(edge,state.map);let threat=0;for(const t of state.towers||[]){if(t.ruined||t.hp<=0||t.type==='relay')continue;const n=state.map.nodeById.get(t.nodeId);const range=t.type==='mortar'?125:t.type==='slow'?82:78;if(dist(m,n)<=range)threat++;}return threat}

function baseWave(base){const bd=BASE_DEFS[base.type];return bd.waves[base.level]||bd.waves[1];}
function spawnEnemy(base,type,departDelay=0){
  if(state.enemies.length>220)return;
  const def=ENEMY_DEFS[type];
  state.enemies.push({id:uid('en'),type,hp:def.hp,maxHp:def.hp,nodeId:base.nodeId,path:null,pathIndex:0,edgeId:null,edgeProgress:0,slowTimer:0,routeClock:0,attackClock:0,sourceBaseId:base.id,departDelay,stunnedTowerIds:[]});
}
function spawnWave(base,guard=false){
  const bd=BASE_DEFS[base.type],wave=baseWave(base);
  wave.forEach((type,i)=>spawnEnemy(base,type,i*(guard?3:8)));
  if(!guard){base.wavesSent=(base.wavesSent||0)+1;showMessage(`${bd.name}から敵部隊が出撃`,1500);}
  else showMessage(`${bd.name}の守備隊が出現`,1800);
}
function enemyTargetNode(enemy){
  if(enemy.type==='raider'){
    const alive=state.towers.filter(t=>t.hp>0&&!t.ruined);if(alive.length){const current=enemyPosition(enemy);let best=alive[0],bd=Infinity;for(const t of alive){const n=state.map.nodeById.get(t.nodeId);const d=dist(current,n);if(d<bd){bd=d;best=t}}return best.nodeId;}
  }
  return state.city.nodeId;
}
function ensureEnemyPath(enemy){
  const target=enemyTargetNode(enemy);if(enemy.path&&enemy.path.target===target&&enemy.pathIndex<enemy.path.edges.length)return;
  const p=dijkstra(enemy.nodeId,target,ENEMY_DEFS[enemy.type]);
  enemy.path=p?{...p,target}:null;enemy.pathIndex=0;enemy.edgeId=p?.edges[0]||null;enemy.edgeProgress=0;
}
function enemyPosition(enemy){
  if(!enemy.edgeId)return state.map.nodeById.get(enemy.nodeId)||{x:0,y:0};
  const e=state.map.edgeById.get(enemy.edgeId);const a=state.map.nodeById.get(enemy.path.nodes[enemy.pathIndex]),b=state.map.nodeById.get(enemy.path.nodes[enemy.pathIndex+1]);
  const t=clamp(enemy.edgeProgress/(e.length||1),0,1);return{x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t)};
}
function nearestTowerToEnemy(enemy,maxD=18){
  const p=enemyPosition(enemy);let best=null,bd=maxD;for(const t of state.towers){if(t.hp<=0||t.ruined)continue;const n=state.map.nodeById.get(t.nodeId);const d=dist(p,n);if(d<bd){bd=d;best=t}}return best;
}
function damageEnemy(enemy,amount){
  const def=ENEMY_DEFS[enemy.type];
  if(enemy.type!=='shield'){
    const p=enemyPosition(enemy);
    const protectedByShield=state.enemies.some(other=>other!==enemy&&other.hp>0&&other.type==='shield'&&dist(enemyPosition(other),p)<=14);
    if(protectedByShield)amount*=.70;
  }
  enemy.hp-=amount;
  if(enemy.hp<=0){state.scrap+=def.reward;state.kills++;particlesBurst(enemyPosition(enemy),def.color,5);return true}return false;
}
function updateEnemy(enemy,dt){
  if((enemy.departDelay||0)>0){enemy.departDelay=Math.max(0,enemy.departDelay-dt);return false;}
  enemy.slowTimer=Math.max(0,(enemy.slowTimer||0)-dt);
  const def=ENEMY_DEFS[enemy.type];ensureEnemyPath(enemy);if(!enemy.path||!enemy.edgeId)return false;
  if(def.attackTowers){const tower=nearestTowerToEnemy(enemy,20);if(tower){if(!enemy.stunnedTowerIds.includes(tower.id)){enemy.stunnedTowerIds.push(tower.id);tower.disabledTimer=Math.max(tower.disabledTimer||0,def.stunSeconds||8);showMessage('破壊工作員が防衛施設を停止させました',1400);}tower.hp-=def.towerDps*dt;if(tower.hp<=0&&!tower.ruined){tower.ruined=true;tower.hp=0;state.offline.towersLost++;showMessage('防衛施設が破壊されました');}return false;}}
  const edge=state.map.edgeById.get(enemy.edgeId);if(!edge){enemy.path=null;return false;}
  const barrier=edge.barrier;
  const barrierPos=edge.length*.5;
  if(barrier&&barrier.hp>0&&enemy.edgeProgress>=barrierPos-1&&enemy.edgeProgress<=barrierPos+2){
    enemy.attackClock+=dt;if(enemy.attackClock>=.5){enemy.attackClock=0;barrier.hp-=def.barrierDps*.5;if(barrier.hp<=0){edge.barrier=null;state.offline.barriersLost++;showMessage('防壁が破壊され、敵の流れが変わりました');for(const en of state.enemies)en.path=null;}}
    return false;
  }
  const slow=enemy.slowTimer>0?1-(1-.52)*(1-(def.slowResist||0)):1;enemy.edgeProgress+=def.speed*slow*dt;
  if(enemy.edgeProgress>=edge.length){
    enemy.nodeId=enemy.path.nodes[enemy.pathIndex+1];enemy.pathIndex++;enemy.edgeProgress=0;
    if(enemy.nodeId===enemy.path.target){
      if(enemy.path.target===state.city.nodeId){state.city.hp=Math.max(0,state.city.hp-def.damageCity);state.offline.damage+=def.damageCity;particlesBurst(state.map.nodeById.get(state.city.nodeId),'#ffffff',8);return true;}
      const tower=state.towers.find(t=>t.nodeId===enemy.path.target&&t.hp>0&&!t.ruined);if(tower){tower.hp-=def.barrierDps*1.5;if(tower.hp<=0){tower.hp=0;tower.ruined=true;state.offline.towersLost++;}enemy.path=null;return false;}
    }
    if(enemy.pathIndex>=enemy.path.edges.length){enemy.path=null;return false;}
    enemy.edgeId=enemy.path.edges[enemy.pathIndex];
  }
  return false;
}

function towerNode(t){return state.map.nodeById.get(t.nodeId)}
function enemiesInRange(p,r){return state.enemies.filter(e=>e.hp>0&&dist(enemyPosition(e),p)<=r)}
