/* Floating tool window (?quick=1): the phone's own drop-down list cannot open over other apps, so we draw our own list. */
(()=>{
  "use strict";
  if(new URLSearchParams(location.search).get("quick")!=="1")return;
  const st=document.createElement("style");
  st.textContent=`
  #qkPick{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(6,14,28,.14);animation:qk-fade .18s ease-out}
  #qkPick .qk-card{width:100%;max-width:420px;max-height:70vh;display:flex;flex-direction:column;background:#0f1d2e;border:1px solid rgba(255,255,255,.12);border-radius:20px;box-shadow:0 24px 70px -8px #000c;overflow:hidden}
  #qkPick .qk-title{padding:14px 18px 6px;font-weight:700;color:#f8fafc;font-size:1rem}
  #qkPick .qk-list{overflow:auto;padding:6px 8px 10px}
  #qkPick .qk-opt{display:block;width:100%;text-align:left;border:0;background:transparent;color:#e6eef7;padding:13px 12px;border-radius:12px;font-size:1rem;font-family:inherit}
  #qkPick .qk-opt:active{background:#ffffff14}
  #qkPick .qk-opt.on{background:#00c6a722;color:#2fe9cb;font-weight:700}
  #qkPick .qk-opt.ph{opacity:.5}`;
  document.head.appendChild(st);
  let pk=null;
  const close=()=>{if(pk){pk.remove();pk=null;return true}return false};
  function titleOf(sel){
    const lab=sel.closest("label")||(sel.parentElement&&sel.parentElement.querySelector("label"));
    if(!lab)return sel.getAttribute("aria-label")||"Choose";
    const t=[...lab.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join(" ").trim();
    return t||sel.getAttribute("aria-label")||"Choose";
  }
  function open(sel){
    close();
    const back=document.createElement("div");back.id="qkPick";
    const card=document.createElement("div");card.className="qk-card";
    const title=document.createElement("div");title.className="qk-title";title.textContent=titleOf(sel);
    const list=document.createElement("div");list.className="qk-list";
    [...sel.options].forEach(o=>{
      if(o.disabled||o.hidden)return;
      const b=document.createElement("button");b.type="button";
      b.className="qk-opt"+(o.value===""?" ph":"")+(o.selected&&o.value!==""?" on":"");
      b.textContent=o.textContent;
      b.onclick=()=>{
        sel.value=o.value;
        sel.dispatchEvent(new Event("input",{bubbles:true}));
        sel.dispatchEvent(new Event("change",{bubbles:true}));
        close();
      };
      list.appendChild(b);
    });
    card.append(title,list);back.appendChild(card);
    back.addEventListener("click",e=>{if(e.target===back)close()});
    document.body.appendChild(back);pk=back;
  }
  const pick=e=>{const s=e.target&&e.target.closest&&e.target.closest("select");if(!s||s.disabled)return null;e.preventDefault();e.stopPropagation();return s};
  document.addEventListener("mousedown",pick,true);
  document.addEventListener("click",e=>{const s=pick(e);if(s)open(s)},true);
  document.addEventListener("keydown",e=>{if((e.key==="Enter"||e.key===" ")&&e.target&&e.target.tagName==="SELECT"){e.preventDefault();open(e.target)}},true);
  // Back closes our list first, then the tool
  const ob=window.dukaBack;window.dukaBack=()=>close()||(ob?ob():false);
  const oc=window.dukaCloseAll;window.dukaCloseAll=()=>{close();if(oc)oc()};
})();
