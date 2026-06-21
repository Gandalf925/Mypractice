(()=>{
'use strict';
async function unpack(base64){
  if(typeof DecompressionStream==='undefined')throw new Error('このブラウザは必要な展開機能に対応していません');
  const binary=atob(base64),bytes=new Uint8Array(binary.length);
  for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}
function loadScript(src){
  return new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=src;script.async=false;script.onload=resolve;script.onerror=()=>reject(new Error(`${src}を読み込めませんでした`));document.body.appendChild(script);
  });
}
function holdGeolocation(){
  const geo=navigator.geolocation;if(!geo)return{release(){}};
  const pending=[];
  const originals={get:geo.getCurrentPosition?.bind(geo),watch:geo.watchPosition?.bind(geo),clear:geo.clearWatch?.bind(geo)};
  let installed=false;
  try{
    Object.defineProperty(geo,'getCurrentPosition',{configurable:true,value:(success,error,options)=>{pending.push({kind:'get',success,error,options});}});
    Object.defineProperty(geo,'watchPosition',{configurable:true,value:(success,error,options)=>{const id=-(pending.length+1);pending.push({kind:'watch',id,success,error,options});return id;}});
    Object.defineProperty(geo,'clearWatch',{configurable:true,value:id=>{const item=pending.find(entry=>entry.id===id);if(item)item.cancelled=true;else originals.clear?.(id);}});
    installed=true;
  }catch{}
  return{release(){
    if(!installed)return;
    try{Object.defineProperty(geo,'getCurrentPosition',{configurable:true,value:originals.get});Object.defineProperty(geo,'watchPosition',{configurable:true,value:originals.watch});Object.defineProperty(geo,'clearWatch',{configurable:true,value:originals.clear});}catch{}
    for(const item of pending){if(item.cancelled)continue;if(item.kind==='get')originals.get?.(item.success,item.error,item.options);else originals.watch?.(item.success,item.error,item.options);}
  }};
}
(async()=>{
  const hold=holdGeolocation();
  try{
    const [core,runtime]=await Promise.all([unpack(window.__FR_CIV_CORE_B64),unpack(window.__FR_CIV_RUNTIME_B64)]);
    (0,eval)(core);
    if(!window.__FR_GAME_UI_ALREADY_LOADED)await loadScript('./game-ui.js?v=36');
    (0,eval)(runtime);
    hold.release();
    delete window.__FR_CIV_CORE_B64;delete window.__FR_CIV_RUNTIME_B64;
  }catch(error){
    console.error(error);hold.release();
    const loading=document.getElementById('loading');if(loading){loading.style.display='block';loading.textContent='ゲームの読み込みに失敗しました。ページを再読み込みしてください。';}
  }
})();
})();
