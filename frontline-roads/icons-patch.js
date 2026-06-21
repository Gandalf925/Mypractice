(()=>{
'use strict';

const iconUrl=name=>`https://api.iconify.design/${name.replace(':','%3A')}.svg?color=%23f5f7fa`;
const SOURCES={
  menu:iconUrl('heroicons:bars-3-20-solid'),
  recenter:iconUrl('material-symbols:my-location-rounded'),
  cursor:iconUrl('heroicons:cursor-arrow-rays-solid'),
  barrier:iconUrl('game-icons:brick-wall'),
  gun:iconUrl('game-icons:machine-gun'),
  mortar:iconUrl('game-icons:mortar'),
  slow:iconUrl('game-icons:stopwatch'),
  barracks:iconUrl('game-icons:barracks-tent'),
  engineer:iconUrl('game-icons:crossed-tools'),
  factory:iconUrl('game-icons:factory'),
  raider:iconUrl('game-icons:time-bomb'),
  city:iconUrl('game-icons:castle')
};

const images={};
for(const [key,src] of Object.entries(SOURCES)){
  const img=new Image();
  img.decoding='async';
  img.src=src;
  images[key]=img;
}

const canvasTextMap={
  '城':['city',19],
  'G':['gun',14],
  'M':['mortar',14],
  'S':['slow',14],
  '⚑':['barracks',15],
  '⚒':['engineer',15],
  '⬢':['factory',15],
  '✦':['raider',15]
};

const proto=window.CanvasRenderingContext2D?.prototype;
if(proto && !proto.__frontlineIconPatch){
  proto.__frontlineIconPatch=true;
  const originalFillText=proto.fillText;
  proto.fillText=function(text,x,y,maxWidth){
    const mapped=canvasTextMap[String(text)];
    if(mapped){
      const [key,size]=mapped;
      const img=images[key];
      if(img?.complete && img.naturalWidth){
        this.save();
        this.drawImage(img,x-size/2,y-size/2,size,size);
        this.restore();
        return;
      }
    }
    return maxWidth===undefined
      ? originalFillText.call(this,text,x,y)
      : originalFillText.call(this,text,x,y,maxWidth);
  };
}

function makeIcon(key,size){
  const img=document.createElement('img');
  img.src=SOURCES[key];
  img.alt='';
  img.draggable=false;
  img.width=size;
  img.height=size;
  img.style.cssText=`width:${size}px;height:${size}px;display:block;object-fit:contain;pointer-events:none`;
  return img;
}

const toolMap={'☝':'cursor','▰':'barrier','⌁':'gun','◉':'mortar','◌':'slow'};
function applyDomIcons(){
  const menu=document.getElementById('menuBtn');
  if(menu && !menu.dataset.iconPatched){
    menu.dataset.iconPatched='1';
    menu.replaceChildren(makeIcon('menu',20));
  }
  const recenter=document.getElementById('recenter');
  if(recenter && !recenter.dataset.iconPatched){
    recenter.dataset.iconPatched='1';
    recenter.replaceChildren(makeIcon('recenter',20));
  }
  document.querySelectorAll('#tools .tool strong').forEach(strong=>{
    if(strong.dataset.iconPatched)return;
    const key=toolMap[strong.textContent.trim()];
    if(!key)return;
    strong.dataset.iconPatched='1';
    strong.replaceChildren(makeIcon(key,28));
  });
  const helpCard=document.querySelector('#helpOverlay .card');
  const closeHelp=document.getElementById('closeHelp');
  if(helpCard && closeHelp && !helpCard.dataset.iconCredits){
    helpCard.dataset.iconCredits='1';
    const credits=document.createElement('p');
    credits.className='note';
    credits.textContent='Icons: Game-icons.net (CC BY 3.0), Heroicons (MIT), Material Symbols (Apache 2.0), delivered via Iconify.';
    helpCard.insertBefore(credits,closeHelp);
  }
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',applyDomIcons,{once:true});
}else{
  applyDomIcons();
}
new MutationObserver(applyDomIcons).observe(document.documentElement,{childList:true,subtree:true});
})();
