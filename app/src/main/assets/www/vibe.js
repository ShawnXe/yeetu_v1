/* Duka Vibe: live theme engine (mode + any accent colour), theme sheet, clock and shop-name splash. */
(()=>{
  "use strict";
  const root=document.documentElement;
  const LS={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:v}catch(e){return d}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
  const PRESETS=[
    {id:"teal",name:"Yeetu Teal",c:"#00c6a7"},
    {id:"green",name:"Neon Green",c:"#2bff88"},
    {id:"pink",name:"Neon Pink",c:"#ff2e9a"},
    {id:"orange",name:"Neon Orange",c:"#ff6a13"},
    {id:"blue",name:"Electric Blue",c:"#1f8bff"},
    {id:"purple",name:"Purple",c:"#a855ff"},
    {id:"red",name:"Red",c:"#ff2d3f"}
  ];
  const DEFAULT="#00c6a7"; /* Yeetu brand teal; people pick neon green etc. themselves */
  const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
  const okHex=h=>/^#[0-9a-f]{6}$/i.test(h||"");
  function rgb(hex){const n=parseInt(hex.slice(1),16);return [(n>>16)&255,(n>>8)&255,n&255]}
  function toHsl(hex){let [r,g,b]=rgb(hex).map(v=>v/255);const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2;let h=0,s=0;if(mx!==mn){const d=mx-mn;s=l>.5?d/(2-mx-mn):d/(mx+mn);h=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4;h*=60}return [h,s,l]}
  function hsl(h,s,l,a){return `hsl(${Math.round(((h%360)+360)%360)} ${Math.round(s*100)}% ${Math.round(l*100)}%${a!=null?" / "+a:""})`}
  function lum(hex){const c=rgb(hex).map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*c[0]+.7152*c[1]+.0722*c[2]}
  const mode=()=>root.dataset.theme==="light"?"light":"dark";
  const accent=()=>{const a=LS.get("duka-accent",DEFAULT);return okHex(a)?a.toLowerCase():DEFAULT};

  /* Colour tokens for an accent in a given mode (also used by the theme-sheet previews). */
  function tokens(hex,m){
    const [h,s0,l0]=toHsl(hex),s=Math.max(s0,.55),dark=m!=="light";
    return {
      ac:hex,h:Math.round(h),s,
      on:lum(hex)>.32?"#06110b":"#ffffff",
      text:dark?hsl(h,s,Math.max(l0,.62)):hsl(h,s,Math.min(l0,.33)),
      soft:dark?hsl(h,s*.7,.14):hsl(h,s,.93),
      line:dark?hsl(h,s*.8,.36):hsl(h,s*.9,.78),
      glow:`rgba(${rgb(hex).join(",")},${dark?.5:.35})`,
      grad:`linear-gradient(135deg,${hex},${hsl(h+38,Math.max(s,.8),clamp(l0,.5,.62))})`
    };
  }
  function apply(){
    const m=mode(),hex=accent(),t=tokens(hex,m),st=root.style;
    const set=(k,v)=>st.setProperty(k,v);
    set("--ac",t.ac);set("--ac2",t.text);set("--ac-on",t.on);set("--ac-soft",t.soft);set("--ac-line",t.line);set("--ac-glow",t.glow);set("--ac-grad",t.grad);
    set("--ach",String(t.h));set("--acsf",String(Math.min(1,t.s/.9)));set("--bgh",String(t.h));set("--bgf","0.16");
    set("--teal",t.ac);set("--teal2",t.text);set("--onteal",t.on);
    const meta=document.getElementById("themeColorMeta");
    if(meta)meta.setAttribute("content",m==="dark"?"#07070a":"#f6f7fb");
  }
  function setMode(m){root.dataset.theme=m==="light"?"light":"dark";LS.set("duka-theme",root.dataset.theme);apply();refreshSheet()}
  function setAccent(hex){if(!okHex(hex))return;LS.set("duka-accent",hex.toLowerCase());apply();refreshSheet()}
  apply();
  /* enable colour fades only after first paint so the first screen never animates between colours */
  requestAnimationFrame(()=>requestAnimationFrame(()=>root.classList.add("vb-ready")));
  window.DUKA_VIBE={apply,setMode,setAccent,PRESETS};

  /* ---------- Theme sheet ---------- */
  let sheet=null;
  const el=(tag,cls,html)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(html!=null)n.innerHTML=html;return n};
  function preview(hex,m){
    const t=tokens(hex,m),dark=m!=="light";
    const bg=dark?"#09090c":"#f4f6fa",card=dark?"#14141a":"#ffffff",ink=dark?"#f3f4f8":"#16202e",mut=dark?"#2a2a33":"#dfe5ee";
    return `<span class="vb-mini" style="--pa:${t.ac};--pg:${t.grad};--pon:${t.on};--pbg:${bg};--pcard:${card};--pink:${ink};--pmut:${mut};--pglow:${t.glow}">
      <span class="vb-mini-top"><i></i><b></b><em></em></span>
      <span class="vb-mini-hero"><u></u><s></s></span>
      <span class="vb-mini-row"><span></span><span></span></span>
      <span class="vb-mini-nav"><i class="on"></i><i></i><i></i><i></i></span>
    </span>`;
  }
  function buildSheet(){
    sheet=el("div","vb-theme hidden");sheet.id="vbTheme";sheet.setAttribute("role","dialog");sheet.setAttribute("aria-label","Theme");
    sheet.innerHTML=`<button class="vb-theme-bd" type="button" data-vb-close aria-label="Close"></button>
      <div class="vb-theme-card">
        <div class="vb-grab"></div>
        <div class="vb-theme-head"><div><strong>Design it your style</strong><small>Your shop, your colours. Watch it change as you tap.</small></div><button type="button" class="vb-x" data-vb-close aria-label="Close">×</button></div>
        <div class="vb-seg" id="vbMode"><button type="button" data-mode="dark">☾ Dark</button><button type="button" data-mode="light">☀ Light</button></div>
        <div class="vb-label">Colour</div>
        <div class="vb-grid" id="vbGrid"></div>
        <label class="vb-custom"><span class="vb-custom-dot" id="vbCustomDot"></span><span><strong>Your own colour</strong><small id="vbCustomHex"></small></span><input type="color" id="vbPicker" aria-label="Pick your own colour"></label>
        <button type="button" class="vb-out" data-act="signOut">Sign out</button>
        <p class="vb-note">Your design, your phone. Everyone on your team can style theirs their own way.</p>
      </div>`;
    document.body.appendChild(sheet);
    sheet.addEventListener("click",e=>{
      if(e.target.closest("[data-vb-close]")){closeSheet();return}
      const mb=e.target.closest("[data-mode]");if(mb){setMode(mb.dataset.mode);return}
      const sw=e.target.closest("[data-c]");if(sw){setAccent(sw.dataset.c);return}
      if(e.target.closest("[data-act='signOut']"))closeSheet();
    });
    sheet.querySelector("#vbPicker").addEventListener("input",e=>setAccent(e.target.value));
    refreshSheet();
  }
  function refreshSheet(){
    if(!sheet)return;
    const m=mode(),cur=accent();
    sheet.querySelectorAll("[data-mode]").forEach(b=>b.classList.toggle("on",b.dataset.mode===m));
    const grid=sheet.querySelector("#vbGrid");
    grid.innerHTML=PRESETS.map(p=>`<button type="button" class="vb-sw${p.c===cur?" on":""}" data-c="${p.c}" aria-label="${p.name}" aria-pressed="${p.c===cur}">${preview(p.c,m)}<span class="vb-sw-name"><i style="background:${p.c}"></i>${p.name}</span></button>`).join("");
    const isPreset=PRESETS.some(p=>p.c===cur);
    const dot=sheet.querySelector("#vbCustomDot");dot.style.background=cur;
    sheet.querySelector("#vbCustomHex").textContent=isPreset?"Tap to mix any colour you like":"Using "+cur.toUpperCase();
    sheet.querySelector(".vb-custom").classList.toggle("on",!isPreset);
    sheet.querySelector("#vbPicker").value=cur;
  }
  function openSheet(){if(!sheet)buildSheet();refreshSheet();sheet.classList.remove("hidden");document.body.classList.add("vb-open")}
  function closeSheet(){if(sheet)sheet.classList.add("hidden");document.body.classList.remove("vb-open")}

  /* ---------- Shop name, logo chip, clock ---------- */
  function shopName(){return LS.get("duka-shop","")||"YEETU"}
  function paintName(){
    const n=shopName();
    document.querySelectorAll(".vb-shop-name").forEach(x=>{x.textContent=n});
    const chip=document.getElementById("vbLogo");if(chip)chip.textContent=(n.trim()[0]||"Y").toUpperCase();
  }
  function clock(){
    const d=new Date(),t=document.getElementById("vbTime"),dt=document.getElementById("vbDate");
    if(t){let h=d.getHours();const ap=h>=12?"PM":"AM";h=h%12||12;t.innerHTML=`${h}:${String(d.getMinutes()).padStart(2,"0")}<small>${String(d.getSeconds()).padStart(2,"0")}</small><em>${ap}</em>`}
    if(dt)dt.textContent=d.toLocaleDateString("en-KE",{weekday:"long",day:"numeric",month:"long"});
  }
  function trackHeights(){
    const set=()=>{
      const h=document.querySelector("#screen-app>.topbar"),t=document.getElementById("sxTop");
      root.style.setProperty("--vb-hdr",(h&&h.offsetHeight?h.offsetHeight:60)+"px");
      root.style.setProperty("--vb-sx",(t&&t.offsetHeight?t.offsetHeight:0)+"px");
    };
    set();
    if(window.ResizeObserver){const ro=new ResizeObserver(set);["#screen-app>.topbar","#sxTop"].forEach(q=>{const n=document.querySelector(q);if(n)ro.observe(n)})}
    window.addEventListener("resize",set);setInterval(set,1500);
  }
  function init(){
    trackHeights();
    paintName();clock();setInterval(clock,1000);
    document.addEventListener("click",e=>{if(e.target.closest("#themeOpen"))openSheet()});
    document.addEventListener("keydown",e=>{if(e.key==="Escape")closeSheet()});
    const st=document.getElementById("shopTitle");
    if(st){
      const sync=()=>{const n=(st.textContent||"").replace(/^[^\p{L}\p{N}]+/u,"").trim();if(n&&n!=="Duka Manager"&&n!=="Duka"&&n!=="YEETU"){LS.set("duka-shop",n);paintName()}};
      new MutationObserver(sync).observe(st,{childList:true,characterData:true,subtree:true});sync();
    }
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
