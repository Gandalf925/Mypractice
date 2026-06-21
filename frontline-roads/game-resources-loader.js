(()=>{
'use strict';
let attempts=0;
function loadResources(){
  if(document.querySelector('script[data-resource-system]'))return;
  if(typeof state==='undefined'||!state){
    if(attempts++<1200)setTimeout(loadResources,50);
    return;
  }
  const script=document.createElement('script');
  script.src='./game-resources.js';
  script.async=false;
  script.dataset.resourceSystem='1';
  document.body.appendChild(script);
}
loadResources();
})();
