(()=>{
'use strict';
const scripts=[
  './civilization-data.js','./civilization-state.js','./civilization-enemies.js','./civilization-waves.js',
  './civilization-production.js','./civilization-progress.js','./civilization-offline.js','./game-reset.js',
  './game-ui.js?v=36','./civilization-ui.js','./game-input.js','./civilization-base-setup.js','./civilization-main.js'
];
function load(src){return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.async=false;script.onload=resolve;script.onerror=()=>reject(new Error(src));document.body.appendChild(script);});}
(async()=>{
  try{
    for(const src of scripts)await load(src);
    delete window.__FR_CIV_CORE_B64;
    delete window.__FR_CIV_RUNTIME_B64;
    let attempts=0;
    const timer=setInterval(()=>{
      attempts++;
      if(typeof state!=='undefined'&&state){
        clearInterval(timer);
        window.FrontlineCiv?.migrateState?.(state);
        window.FrontlineCiv?.ensureProject?.();
        window.FrontlineCiv?.updateProjectStatus?.();
        window.FrontlineCiv?.ensureCivilizationBases?.();
        window.FrontlineCiv?.recalculateCapacity?.(state);
        renderTools?.();updateUI?.();silentSave?.();
        if(state.homeBase?.status!=='ESTABLISHED')window.FrontlineBaseSetup?.begin?.();
      }else if(attempts>600)clearInterval(timer);
    },100);
  }catch(error){
    console.error('Direct civilization startup:',error);
    const loading=document.getElementById('loading');
    if(loading){loading.style.display='block';loading.textContent=`ゲームの読み込みに失敗しました：${error.message}`;}
  }
})();
})();
