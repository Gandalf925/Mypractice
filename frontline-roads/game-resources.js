(()=>{
'use strict';

const RESOURCE_SPEC=1;
const RESOURCE_KEYS=['wood','stone','fiber'];
const RESOURCE_LABELS={wood:'木材',stone:'石材',fiber:'繊維'};
const RESOURCE_SHORT={wood:'木',stone:'石',fiber:'繊'};
const RESOURCE_COLORS={wood:'#c8955a',stone:'#aeb7c2',fiber:'#7fcf83'};
const STARTING_RESOURCES={wood:150,stone:100,fiber:70};
const RECIPES={
  barrier:{wood:32,stone:0,fiber:10},
  gun:{wood:28,stone:22,fiber:8},
  mortar:{wood:42,stone:48,fiber:16},
  slow:{wood:14,stone:8,fiber:28},
  relay:{wood:34,stone:14,fiber:18}
};
const REPAIR_FULL={
  barrier:{wood:20,stone:0,fiber:8},
  gun:{wood:12,stone:10,fiber:5},
  mortar:{wood:16,stone:20,fiber:7},
  slow:{wood:6,stone:4,fiber:12},
  relay:{wood:14,stone:6,fiber:8}
};
const BASE_REWARDS={
  barracks:{wood:50,stone:25,fiber:25},
  engineer:{wood:35,stone:70,fiber:30},
  raider:{wood:30,stone:25,fiber:75},
  motor:{wood:40,stone:110,fiber:35}
};

Object.assign(TOOL_DEFS.select,{name:'選択',icon:'✣'});
Object.assign(TOOL_DEFS.barrier,{name:'丸太柵',icon:'🪵',cost:RECIPES.barrier});
Object.assign(TOOL_DEFS.gun,{name:'投石台',icon:'●',cost:RECIPES.gun});
Object.assign(TOOL_DEFS.mortar,{name:'岩落とし台',icon:'◆',cost:RECIPES.mortar});
Object.assign(TOOL_DEFS.slow,{name:'蔓縄罠',icon:'⌁',cost:RECIPES.slow});
Object.assign(TOOL_DEFS.relay,{name:'修繕小屋',icon:'⌂',cost:RECIPES.relay});

Object.assign(ENEMY_DEFS.infantry,{name:'戦士',drops:{wood:3,stone:1,fiber:1},reward:0});
Object.assign(ENEMY_DEFS.scout,{name:'走り手',drops:{wood:1,stone:1,fiber:3},reward:0});
Object.assign(ENEMY_DEFS.shield,{name:'盾持ち',drops:{wood:5,stone:1,fiber:2},reward:0});
Object.assign(ENEMY_DEFS.engineer,{name:'柵壊し',drops:{wood:2,stone:5,fiber:2},reward:0});
Object.assign(ENEMY_DEFS.heavy,{name:'巨兵',drops:{wood:2,stone:9,fiber:1},reward:0});
Object.assign(ENEMY_DEFS.raider,{name:'火付け',drops:{wood:2,stone:2,fiber:5},reward:0});

Object.assign(BASE_DEFS.barracks,{name:'襲撃者の野営地',icon:'▲',reward:BASE_REWARDS.barracks});
Object.assign(BASE_DEFS.engineer,{name:'柵壊しの野営地',icon:'⌂',reward:BASE_REWARDS.engineer});
Object.assign(BASE_DEFS.raider,{name:'火付けの巣',icon:'🔥',reward:BASE_REWARDS.raider});
Object.assign(BASE_DEFS.motor,{name:'岩運びの砦',icon:'◆',reward:BASE_REWARDS.motor});

function emptyBundle(){return{wood:0,stone:0,fiber:0};}
function normalizeBundle(bundle){
  const result=emptyBundle();
  for(const key of RESOURCE_KEYS)result[key]=Math.max(0,Math.floor(Number(bundle?.[key])||0));
  return result;
}
function ensureResources(target=state){
  if(!target)return;
  if(!target.resources){
    const old=Math.max(0,Math.floor(Number(target.scrap)||0));
    target.resources={
      wood:Math.floor(old*.45),
      stone:Math.floor(old*.35),
      fiber:old-Math.floor(old*.45)-Math.floor(old*.35)
    };
  }
  target.resources=normalizeBundle(target.resources);
  target.resourceSpec=RESOURCE_SPEC;
  target.civilizationLevel=0;
  target.scrap=0;
}
function hasBundle(cost){
  ensureResources();
  return RESOURCE_KEYS.every(key=>(state.resources[key]||0)>=(cost?.[key]||0));
}
function addBundle(bundle){
  ensureResources();
  for(const key of RESOURCE_KEYS)state.resources[key]=(state.resources[key]||0)+(bundle?.[key]||0);
}
function subtractBundle(cost){
  ensureResources();
  if(!hasBundle(cost))return false;
  for(const key of RESOURCE_KEYS)state.resources[key]-=(cost?.[key]||0);
  return true;
}
function scaleBundle(bundle,ratio,{minimum=true}={}){
  const result=emptyBundle();
  for(const key of RESOURCE_KEYS){
    const base=bundle?.[key]||0;
    result[key]=base?Math.max(minimum?1:0,Math.ceil(base*ratio)):0;
  }
  return result;
}
function formatBundle(bundle,long=false){
  return RESOURCE_KEYS.filter(key=>(bundle?.[key]||0)>0)
    .map(key=>`${long?RESOURCE_LABELS[key]:RESOURCE_SHORT[key]}${bundle[key]}`)
    .join(' ');
}
function missingBundleText(cost){
  ensureResources();
  const missing=emptyBundle();
  for(const key of RESOURCE_KEYS)missing[key]=Math.max(0,(cost?.[key]||0)-(state.resources[key]||0));
  return formatBundle(missing,true);
}
function repairBundle(type,hp,maxHp){
  const missing=Math.max(0,maxHp-hp);
  if(!missing)return emptyBundle();
  return scaleBundle(REPAIR_FULL[type]||REPAIR_FULL.gun,missing/maxHp);
}
function salvageBundle(type,ratio=.3){return scaleBundle(RECIPES[type]||emptyBundle(),ratio,{minimum:false});}

const materialPopups=[];
function addMaterialPopup(point,bundle){
  const text=formatBundle(bundle);
  if(!text)return;
  materialPopups.push({x:point.x,y:point.y,text,expires:Date.now()+1250});
}
const originalDrawEffectsMaterials=drawEffects;
drawEffects=function(){
  originalDrawEffectsMaterials();
  const current=Date.now();
  for(let i=materialPopups.length-1;i>=0;i--){
    const popup=materialPopups[i];
    if(popup.expires<=current){materialPopups.splice(i,1);continue;}
    const life=(popup.expires-current)/1250,p=worldToScreen({x:popup.x,y:popup.y-(1-life)*18});
    ctx.save();ctx.globalAlpha=clamp(life*1.4,0,1);ctx.font='bold 10px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    const width=ctx.measureText(popup.text).width+10;ctx.fillStyle='rgba(8,11,16,.82)';ctx.fillRect(p.x-width/2,p.y-8,width,16);ctx.fillStyle='#f5f7fa';ctx.fillText(popup.text,p.x,p.y);ctx.restore();
  }
};

function installResourceUi(){
  if(document.getElementById('materialBar'))return;
  const oldText=document.getElementById('scrapText');
  const oldPill=oldText?.parentElement;
  if(!oldPill)return;
  const bar=document.createElement('div');bar.id='materialBar';
  for(const key of RESOURCE_KEYS){
    const chip=document.createElement('div');chip.className=`materialChip ${key}`;
    chip.innerHTML=`<span>${RESOURCE_SHORT[key]}</span><b id="${key}Text">0</b>`;
    bar.appendChild(chip);
  }
  const gps=document.getElementById('gpsPill');
  if(gps){gps.classList.add('materialGps');bar.appendChild(gps);}
  oldPill.remove();
  document.getElementById('app').appendChild(bar);
  const style=document.createElement('style');
  style.textContent=`
    #materialBar{position:absolute;left:10px;right:58px;top:calc(var(--safe-top) + 57px);display:flex;gap:6px;align-items:center;z-index:5;pointer-events:none}
    .materialChip{height:32px;min-width:58px;padding:5px 9px;border-radius:11px;background:rgba(17,22,29,.9);border:1px solid rgba(255,255,255,.09);display:flex;gap:5px;align-items:center;justify-content:center;font-size:12px;font-weight:900;box-shadow:0 4px 14px rgba(0,0,0,.22)}
    .materialChip.wood span{color:${RESOURCE_COLORS.wood}} .materialChip.stone span{color:${RESOURCE_COLORS.stone}} .materialChip.fiber span{color:${RESOURCE_COLORS.fiber}}
    #materialBar .materialGps{height:32px;min-height:32px;padding:5px 8px;font-size:10px;margin-left:auto;max-width:112px}
    #zoomControls{top:calc(var(--safe-top) + 99px)}
    #message{top:calc(var(--safe-top) + 100px)}
    .tool{height:78px;flex-basis:84px;padding-top:12px}
    .tool .recipe{font-size:9px;color:#d5dde8;white-space:nowrap;line-height:1.1}
    .tool.unaffordable{opacity:.55}
    .tool .cost{display:none}
  `;
  document.head.appendChild(style);
}

const originalNewGameMaterials=newGame;
newGame=function(graph,player){
  originalNewGameMaterials(graph,player);
  state.resources={...STARTING_RESOURCES};state.resourceSpec=RESOURCE_SPEC;state.civilizationLevel=0;state.scrap=0;
  renderTools();updateUI();silentSave();
};

ensureResources();
installResourceUi();

renderTools=function(){
  const el=$('tools');el.innerHTML='';
  for(const [key,definition] of Object.entries(TOOL_DEFS)){
    if(definition.hidden)continue;
    const recipe=definition.type==='select'?null:(RECIPES[key]||definition.cost||emptyBundle());
    const affordable=!recipe||hasBundle(recipe);
    const button=document.createElement('button');
    button.className='tool'+(selectedTool===key?' selected':'')+(affordable?'':' unaffordable');
    button.dataset.tool=key;
    button.innerHTML=`<strong>${definition.icon}</strong><span>${definition.name}</span><small>${definition.type==='barrier'?'道路':definition.type==='tower'?'交差点':'確認'}</small>${recipe?`<span class="recipe">${formatBundle(recipe)}</span>`:''}`;
    button.onclick=()=>{
      selectedTool=key;selectedObject=null;hideContext();pathPreview=null;renderTools();
      showMessage(key==='select'?'対象をタップ':`${definition.name}：${formatBundle(recipe,true)}`);
    };
    el.appendChild(button);
  }
};

updateUI=function(){
  if(!state)return;ensureResources();
  $('cityHpText').textContent=Math.ceil(state.city.hp);$('cityHpFill').style.width=(state.city.hp/state.city.maxHp*100)+'%';
  for(const key of RESOURCE_KEYS){const element=document.getElementById(`${key}Text`);if(element)element.textContent=Math.floor(state.resources[key]||0);}
  const gps=state.player.lat?(lastLocationAccuracy?`GPS ±${Math.round(lastLocationAccuracy)}m`:'GPS追跡中'):'位置待機中';$('gpsPill').textContent=gps;
  $('threatPill').textContent=`先頭到着 ${fmtClock(threatInfo.seconds)}`;
};

damageEnemy=function(enemy,amount){
  if(enemy.type!=='shield'){
    const position=enemyPosition(enemy);
    const protectedByShield=state.enemies.some(other=>other!==enemy&&other.hp>0&&other.type==='shield'&&dist(enemyPosition(other),position)<=14);
    if(protectedByShield)amount*=.70;
  }
  enemy.hp-=amount;
  if(enemy.hp<=0){
    const definition=ENEMY_DEFS[enemy.type],position=enemyPosition(enemy),drops=normalizeBundle(definition.drops);
    addBundle(drops);state.kills++;particlesBurst(position,definition.color,5);addMaterialPopup(position,drops);renderTools();return true;
  }
  return false;
};

completeBaseCapture=function(base){
  const definition=BASE_DEFS[base.type],reward=normalizeBundle(BASE_REWARDS[base.type]||definition.reward);
  base.captureProgress=definition.captureDuration;base.alive=false;base.captured=true;assaultingBaseId=null;addBundle(reward);
  if(!state.towers.some(t=>t.nodeId===base.nodeId&&t.hp>0))state.towers.push({id:uid('tower'),nodeId:base.nodeId,type:definition.capturedType,hp:180,maxHp:180,cooldown:0,disabledTimer:0,ruined:false,history:{kills:0},capturedSite:true});
  showMessage(`${definition.name}を制圧。${TOOL_DEFS[definition.capturedType].name}へ転換。${formatBundle(reward,true)}を獲得`,3400);
  selectedObject=null;hideContext();fitView();renderTools();
};

tapMap=function(x,y){
  const world=screenToWorld({x,y});
  if(testMove){state.player.x=world.x;state.player.y=world.y;const ll=xyToLatLon(world.x,world.y,state.map.center);state.player.lat=ll.lat;state.player.lon=ll.lon;showMessage('テスト現在地を移動しました');return;}
  if(selectedTool==='select'){
    const base=nearbyBaseAt(x,y);if(base){selectedObject={kind:'base',id:base.id};showContextForSelected();return;}
    const tower=nearbyTowerAt(x,y);if(tower){selectedObject={kind:'tower',id:tower.id};showContextForSelected();return;}
    const edge=nearestScreenEdge(x,y);if(edge?.barrier){selectedObject={kind:'barrier',id:edge.id};showContextForSelected();return;}
    selectedObject=null;hideContext();return;
  }
  const definition=TOOL_DEFS[selectedTool],recipe=RECIPES[selectedTool]||emptyBundle();
  if(!hasBundle(recipe)){showMessage(`不足：${missingBundleText(recipe)}`);return;}
  if(selectedTool==='barrier'){
    const edge=nearestScreenEdge(x,y);if(!edge){showMessage('道路をタップしてください');return;}
    if(edge.barrier){showMessage('この道路には既に丸太柵があります');return;}
    const midpoint=edgeMid(edge,state.map);if(!canBuildAt(midpoint)){showMessage(`現地まで ${fmtMeters(dist(state.player,midpoint))}`);return;}
    if(!subtractBundle(recipe))return;
    edge.barrier={hp:220,maxHp:220,createdAt:now()};for(const enemy of state.enemies)enemy.path=null;
    showMessage(`丸太柵を制作：${formatBundle(recipe,true)}`);selectedTool='select';pathPreview=null;renderTools();return;
  }
  const node=nearestScreenNode(x,y);if(!node){showMessage('交差点をタップしてください');return;}
  if(!canBuildAt(node)){showMessage(`現地まで ${fmtMeters(dist(state.player,node))}`);return;}
  if(state.towers.some(t=>t.nodeId===node.id&&t.hp>0)){showMessage('この地点には既に施設があります');return;}
  if(!subtractBundle(recipe))return;
  const captured=state.bases.find(base=>base.nodeId===node.id&&!base.alive);
  state.towers.push({id:uid('tower'),nodeId:node.id,type:selectedTool,hp:150,maxHp:150,cooldown:0,disabledTimer:0,ruined:false,history:{kills:0},capturedSite:!!captured});
  showMessage(`${definition.name}を制作：${formatBundle(recipe,true)}`);selectedTool='select';renderTools();
};

showContextForSelected=function(){
  const box=$('context'),title=$('contextTitle'),text=$('contextText'),actions=$('contextActions');actions.innerHTML='';
  if(!selectedObject){hideContext();return;}
  if(selectedObject.kind==='base'){
    const base=state.bases.find(item=>item.id===selectedObject.id);if(!base||!base.alive){hideContext();return;}
    const node=state.map.nodeById.get(base.nodeId),distance=dist(state.player,node),definition=BASE_DEFS[base.type],wave=baseWave(base),percent=Math.floor((base.captureProgress||0)/definition.captureDuration*100),reward=BASE_REWARDS[base.type];
    title.textContent=`${definition.name} Lv.${base.level}`;
    text.textContent=`現在地から ${fmtMeters(distance)}。道路距離 約${fmtMeters(base.roadDistance||distance)}、徒歩${Math.max(2,Math.round((base.roadDistance||distance)/75))}分。次部隊まで ${fmtClock(baseNextWaveSeconds(base))}。編成：${wave.map(type=>ENEMY_DEFS[type].name).join('・')}。制圧報酬：${formatBundle(reward,true)}。制圧 ${percent}%。`;
    const capture=button(percent>0?'制圧を再開':'現地制圧',true);capture.disabled=distance>35;capture.onclick=()=>{const current=dist(state.player,node);if(current>35){showMessage(`拠点まで ${fmtMeters(current)}。35m以内で開始できます`);return;}assaultingBaseId=base.id;base.captureAway=0;if(!base.guardSpawned){base.guardSpawned=true;spawnWave(base,true);}showMessage(`${definition.name}の制圧を開始。50m以内に留まってください`,2200);showContextForSelected();};actions.appendChild(capture);
    const trace=button('敵流を強調');trace.onclick=()=>showMessage(`${definition.name}からの敵を追跡中`,1400);actions.appendChild(trace);
  }else if(selectedObject.kind==='tower'){
    const tower=state.towers.find(item=>item.id===selectedObject.id);if(!tower){hideContext();return;}
    title.textContent=`${TOOL_DEFS[tower.type]?.name||'防衛施設'}${tower.ruined?'（残骸）':''}`;
    text.textContent=`耐久 ${Math.ceil(tower.hp)}/${tower.maxHp}。${tower.disabledTimer>0?`妨害であと${Math.ceil(tower.disabledTimer)}秒停止中。`:tower.ruined?'現地で資材を使い再建できます。':tower.type==='relay'?'周囲の施設と丸太柵を自動修繕します。':'資材を使って修繕できます。'}`;
    if(tower.ruined){
      const node=towerNode(tower),distance=dist(state.player,node),cost=scaleBundle(RECIPES[tower.type]||RECIPES.gun,.6);
      const rebuild=button(`再建 ${formatBundle(cost)}`,true);rebuild.disabled=distance>85||!hasBundle(cost);rebuild.onclick=()=>{if(distance>85){showMessage(`現地まで ${fmtMeters(distance)}`);return;}if(!subtractBundle(cost)){showMessage(`不足：${missingBundleText(cost)}`);return;}tower.hp=tower.maxHp;tower.ruined=false;showMessage(`${TOOL_DEFS[tower.type].name}を再建しました`);renderTools();showContextForSelected();};actions.appendChild(rebuild);
    }else{
      const cost=repairBundle(tower.type,tower.hp,tower.maxHp),need=tower.maxHp-tower.hp;
      const repair=button(need?`修繕 ${formatBundle(cost)}`:'損傷なし');repair.disabled=!need||!hasBundle(cost);repair.onclick=()=>{if(!need)return;if(!subtractBundle(cost)){showMessage(`不足：${missingBundleText(cost)}`);return;}tower.hp=tower.maxHp;showMessage(`${TOOL_DEFS[tower.type].name}を修繕しました`);renderTools();showContextForSelected();};actions.appendChild(repair);
    }
    const salvage=salvageBundle(tower.type);
    const remove=button(`解体 回収${formatBundle(salvage)}`);remove.onclick=()=>{addBundle(salvage);state.towers=state.towers.filter(item=>item.id!==tower.id);selectedObject=null;hideContext();renderTools();showMessage(`${formatBundle(salvage,true)}を回収しました`);};actions.appendChild(remove);
  }else if(selectedObject.kind==='barrier'){
    const edge=state.map.edgeById.get(selectedObject.id);if(!edge?.barrier){hideContext();return;}
    title.textContent='丸太柵';text.textContent=`耐久 ${Math.ceil(edge.barrier.hp)}/${edge.barrier.maxHp}。破壊されると道路が開通し、敵の流れが変わります。`;
    const cost=repairBundle('barrier',edge.barrier.hp,edge.barrier.maxHp),need=edge.barrier.maxHp-edge.barrier.hp;
    const repair=button(need?`修繕 ${formatBundle(cost)}`:'損傷なし');repair.disabled=!need||!hasBundle(cost);repair.onclick=()=>{if(!need)return;if(!subtractBundle(cost)){showMessage(`不足：${missingBundleText(cost)}`);return;}edge.barrier.hp=edge.barrier.maxHp;showMessage('丸太柵を修繕しました');renderTools();showContextForSelected();};actions.appendChild(repair);
    const salvage=salvageBundle('barrier');
    const open=button(`撤去 回収${formatBundle(salvage)}`);open.onclick=()=>{addBundle(salvage);edge.barrier=null;for(const enemy of state.enemies)enemy.path=null;selectedObject=null;hideContext();renderTools();showMessage(`${formatBundle(salvage,true)}を回収しました`);};actions.appendChild(open);
  }
  box.classList.add('show');
};

drawTowers=function(){
  for(const tower of state.towers){
    const point=worldToScreen(towerNode(tower));ctx.save();ctx.translate(point.x,point.y);ctx.globalAlpha=tower.ruined?.55:1;
    ctx.fillStyle=tower.ruined?'#4a4f58':towerColor(tower.type);ctx.strokeStyle=tower.id===selectedObject?.id?'#fff':'#18202a';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,10,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.strokeStyle='#111820';ctx.fillStyle='#111820';ctx.lineWidth=2;
    if(tower.type==='gun'){
      ctx.beginPath();ctx.arc(2,-2,3,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(-5,5);ctx.lineTo(4,-4);ctx.stroke();
    }else if(tower.type==='mortar'){
      ctx.beginPath();ctx.arc(-4,3,3,0,Math.PI*2);ctx.arc(3,3,4,0,Math.PI*2);ctx.arc(0,-3,3.5,0,Math.PI*2);ctx.fill();
    }else if(tower.type==='slow'){
      ctx.beginPath();ctx.arc(0,0,5,0,Math.PI*1.7);ctx.stroke();ctx.beginPath();ctx.moveTo(4,-4);ctx.lineTo(7,-7);ctx.stroke();
    }else{
      ctx.beginPath();ctx.moveTo(-6,1);ctx.lineTo(0,-6);ctx.lineTo(6,1);ctx.lineTo(6,6);ctx.lineTo(-6,6);ctx.closePath();ctx.stroke();
    }
    if(tower.hp<tower.maxHp){ctx.fillStyle='rgba(0,0,0,.55)';ctx.fillRect(-10,14,20,3);ctx.fillStyle=tower.hp<40?'#ff6b6b':'#ffd166';ctx.fillRect(-10,14,20*clamp(tower.hp/tower.maxHp,0,1),3);}
    ctx.restore();
  }
};

const helpCard=document.querySelector('#helpOverlay .card');
if(helpCard&&!helpCard.querySelector('[data-civilization]')){
  const paragraph=document.createElement('p');paragraph.dataset.civilization='1';paragraph.innerHTML='<b>現在の文明：原始集落</b><br>木材・石材・繊維を集め、丸太柵、投石台、岩落とし台、蔓縄罠を制作します。';
  const legend=helpCard.querySelector('.legend');helpCard.insertBefore(paragraph,legend);
}

renderTools();updateUI();silentSave();
})();
