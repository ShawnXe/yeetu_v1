/* Friendly "stock your shop" prompt: shown whenever the shop has no products yet. */
(()=>{
  "use strict";
  const $=id=>document.getElementById(id);
  const D=()=>window.DUKA||{};
  const inQuick=()=>document.body.classList.contains("quick");
  let box=null,stable=0,shownAuto=false;
  const appVisible=()=>{const a=$("screen-app");return a&&!a.classList.contains("hidden")};
  const count=()=>{const p=D().I&&D().I.products;return Array.isArray(p)?p.length:null};
  const isOwner=()=>{try{return typeof D().owner==="function"?!!D().owner():true}catch(e){return true}};
  function build(){
    box=document.createElement("div");box.className="vb-stock hidden";box.setAttribute("role","dialog");box.setAttribute("aria-label","Add your first products");
    box.innerHTML='<div class="vb-stock-card"><div class="vb-stock-ic">📦</div><h3>Let’s stock your shop</h3><p id="vbStockMsg">Your shop has no products yet. Add your first one and you can start selling in a minute.</p><button type="button" class="primary" id="vbStockAdd">+ Add product</button><button type="button" class="vb-later" id="vbStockLater">Not now</button></div>';
    document.body.appendChild(box);
    $("vbStockLater").addEventListener("click",hide);
    $("vbStockAdd").addEventListener("click",()=>{
      hide();
      if(window.AndroidBridge&&AndroidBridge.openProducts&&inQuick()){AndroidBridge.openProducts();return}
      const nav=document.querySelector('.nav-btn[data-page="products"]');if(nav)nav.click();
      setTimeout(()=>{const b=$("addProductBtn");if(b)b.click()},350);
    });
  }
  function show(){
    if(!box)build();
    $("vbStockMsg").textContent=isOwner()
      ?"Your shop has no products yet. Add your first one and you can start selling in a minute."
      :"There are no products in this shop yet. Ask the owner to add some, then you can start selling.";
    $("vbStockAdd").style.display=isOwner()?"":"none";
    box.classList.remove("hidden");
  }
  function hide(){if(box)box.classList.add("hidden")}
  function check(force){
    if(!appVisible())return;
    const n=count();
    if(n===null)return;
    if(n>0){hide();return}
    if(force||!shownAuto){shownAuto=true;show()}
  }
  /* wait until products have really loaded (two empty readings in a row) before the first automatic prompt */
  setInterval(()=>{
    if(!appVisible()){stable=0;return}
    const n=count();
    if(n===null)return;
    if(n>0){stable=0;hide();return}
    if(++stable===3)check(false);
  },1200);
  /* ask again whenever someone tries to sell with an empty shop */
  document.addEventListener("click",e=>{
    if(e.target.closest('.nav-btn[data-page="sale"],[data-quick-open],#quickSaleBtn,[data-fab-action=sale]'))setTimeout(()=>check(true),500);
  },true);
  window.dukaStockPrompt=()=>check(true);
})();
