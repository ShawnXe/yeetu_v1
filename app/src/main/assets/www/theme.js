(()=>{
  "use strict";
  const root=document.documentElement;
  const btn=document.getElementById("themeToggle");
  const icon=document.getElementById("themeToggleIcon");
  const meta=document.getElementById("themeColorMeta");
  let saved="dark";
  try{saved=localStorage.getItem("duka-theme")||"dark"}catch(e){}
  function apply(theme){
    const mode=theme==="light"?"light":"dark";
    root.dataset.theme=mode;
    if(icon)icon.textContent=mode==="dark"?"☀":"☾";
    if(btn){btn.setAttribute("aria-label",mode==="dark"?"Switch to light theme":"Switch to dark theme");btn.setAttribute("title",mode==="dark"?"Switch to light theme":"Switch to dark theme")}
    if(meta)meta.setAttribute("content",mode==="dark"?"#07070a":"#f6f7fb");
    try{localStorage.setItem("duka-theme",mode)}catch(e){}
  }
  apply(saved);
  if(btn)btn.addEventListener("click",()=>apply(root.dataset.theme==="dark"?"light":"dark"));
})();
