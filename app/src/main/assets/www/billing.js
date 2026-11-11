/* YEETU billing: plan cards -> pay sheet -> waiting -> receipt. Admin gets a Billing panel. */
(()=>{
  "use strict";
  const D=()=>window.DUKA;
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const base=()=>(window.BILLING_BASE||(window.RAFIKI_ENDPOINT||"").replace(/\/rafikiChat\/?$/,""))+"/billing";
  async function api(path,body){
    const t=await D().getIdToken();
    const r=await fetch(base()+path,{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+t},body:JSON.stringify(body||{})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok){console.warn("billing",path,r.status,j.error);}
    if(!r.ok)throw new Error((j.error&&j.error.message)||"Something went wrong. Try again.");
    return j;
  }
  const money=n=>"KSh "+n;
  const dateText=ms=>new Date(ms).toLocaleDateString(undefined,{day:"numeric",month:"long",year:"numeric"});
  const dateTime=ms=>new Date(ms).toLocaleString(undefined,{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
  const ICON={day:"⚡",week:"🚀",month:"👑"};
  const HELP="0731175210 or 0741160666";

  const css=document.createElement("style");
  css.textContent=`
  #bill,#billAdmin{--g:#00C6A7;--g2:#00a88d;--o:#FF8C00;--ink:#F8FAFC;--mut:#9fb3c8;position:fixed;inset:0;z-index:99999;overflow:auto;color:var(--ink);font-family:inherit;
    background:radial-gradient(900px 520px at 50% -10%,#0b5c68 0%,transparent 62%),radial-gradient(520px 320px at 100% 0%,#FF8C0033 0%,transparent 60%),#0B1F3B;padding:18px 16px 40px}
  .bl-bw{max-width:460px;margin:0 auto}
  .bl-brand{display:flex;align-items:center;gap:10px;margin-bottom:6px}.bl-brand img{width:44px;height:44px;border-radius:13px;box-shadow:0 8px 22px -8px #00C6A7aa}.bl-brand b{letter-spacing:3px;font-size:1.05rem}
  .bl-bw h1{font-size:1.55rem;margin:10px 0 4px;letter-spacing:-.3px}
  .bl-bw .bl-sub{color:var(--mut);margin:0 0 16px;line-height:1.45}
  .bl-hero{position:relative;border-radius:20px;padding:18px;margin:14px 0;background:linear-gradient(135deg,#00C6A7,#0a8f9a 55%,#123f68);box-shadow:0 12px 40px -12px #00C6A788;overflow:hidden}
  .bl-hero:after{content:"";position:absolute;right:-22px;top:-22px;width:104px;height:104px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#FFC247,#FF8C00)}
  .bl-hero small{opacity:.9;font-weight:600;letter-spacing:.6px}
  .bl-hero .bl-big{font-size:1.7rem;font-weight:800;margin:4px 0 6px}
  .bl-hero s{opacity:.7;margin-right:8px}
  .bl-btn{width:100%;border:0;border-radius:14px;padding:14px;font-size:1.02rem;font-weight:700;cursor:pointer;color:#062033;background:linear-gradient(135deg,#2fe9cb,#00C6A7);box-shadow:0 8px 24px -8px #00C6A7aa}
  .bl-btn.bl-white{background:linear-gradient(135deg,#FFB347,#FF8C00);color:#2a1500;box-shadow:0 8px 22px -8px #0008;margin-top:12px;position:relative;z-index:1}
  .bl-btn.bl-ghost{background:#ffffff12;color:var(--ink);box-shadow:none;border:1px solid #ffffff22}
  .bl-btn[disabled]{opacity:.55}
  .bl-plans{display:grid;gap:12px;margin:12px 0}
  .bl-pc{position:relative;display:flex;align-items:center;gap:14px;text-align:left;width:100%;padding:16px;border-radius:18px;border:1px solid #ffffff1c;color:var(--ink);cursor:pointer;
    background:linear-gradient(160deg,#12294a,#0d2038);transition:transform .15s,border-color .15s}
  .bl-pc:active{transform:scale(.98)}
  .bl-pc .bl-ic{font-size:1.7rem;width:50px;height:50px;border-radius:14px;display:grid;place-items:center;background:#ffffff0d}
  .bl-pc .bl-nm{font-weight:700;font-size:1.05rem}.bl-pc .bl-dd{color:var(--mut);font-size:.85rem;margin-top:2px}
  .bl-pc .bl-pr{margin-left:auto;text-align:right;font-size:1.35rem;font-weight:800}.bl-pc .bl-pr small{display:block;font-size:.72rem;color:var(--mut);font-weight:500}
  .bl-pc.bl-best{border:1.5px solid var(--o);background:linear-gradient(160deg,#17365c,#0f2744);box-shadow:0 10px 36px -14px #FF8C0099}
  .bl-pc .bl-tag{position:absolute;top:-10px;left:16px;background:var(--o);color:#2a1500;font-size:.68rem;font-weight:800;padding:3px 10px;border-radius:99px;letter-spacing:.5px}
  .bl-pc .bl-save{color:var(--g);font-size:.78rem;font-weight:700;margin-top:3px}
  .bl-fine{color:var(--mut);font-size:.8rem;text-align:center;margin:14px 0}
  .bl-link{background:none;border:0;color:var(--mut);text-decoration:underline;font-size:.9rem;cursor:pointer;display:block;margin:10px auto}
  /* sheet */
  .bl-back{position:fixed;inset:0;z-index:100000;background:#000a;display:flex;align-items:flex-end;justify-content:center;animation:fade .2s}
  .bl-sheet{width:100%;max-width:480px;background:#0e2240;border:1px solid #ffffff1a;border-radius:26px 26px 0 0;padding:22px 20px 26px;color:var(--ink);animation:up .28s cubic-bezier(.2,.9,.3,1);max-height:92vh;overflow:auto;text-align:center}
  .bl-sheet h2{margin:6px 0 4px;font-size:1.3rem}.bl-sheet p{color:var(--mut);margin:4px 0 14px;line-height:1.45}
  .bl-sheet .bl-chip{display:inline-block;background:#00C6A71f;color:var(--g);padding:5px 12px;border-radius:99px;font-weight:700;font-size:.85rem}
  .bl-phone{display:flex;align-items:center;gap:8px;background:#0a1830;border:1.5px solid #ffffff26;border-radius:14px;padding:0 14px;margin:12px 0}
  .bl-phone:focus-within{border-color:var(--g)}
  .bl-phone span{color:var(--mut)}.bl-phone input{flex:1;background:none;border:0;outline:0;color:var(--ink);font-size:1.15rem;padding:14px 0;letter-spacing:1px;min-width:0}
  .bl-msg{min-height:1.2em;color:#ff8a8a;font-size:.9rem;margin:6px 0}
  .bl-pulse{position:relative;width:96px;height:96px;margin:8px auto 14px;display:grid;place-items:center;font-size:2.4rem}
  .bl-pulse:before,.bl-pulse:after{content:"";position:absolute;inset:0;border-radius:50%;border:2px solid var(--g);animation:ring 1.8s infinite}
  .bl-pulse:after{animation-delay:.9s}
  .bl-steps{text-align:left;margin:14px auto;max-width:300px;display:grid;gap:10px;font-size:.95rem}
  .bl-steps div{display:flex;align-items:center;gap:10px;color:var(--mut)}
  .bl-steps .bl-on{color:var(--ink)}.bl-steps i{width:20px;height:20px;border-radius:50%;border:2px solid #ffffff33;display:grid;place-items:center;font-style:normal;font-size:.7rem}
  .bl-steps .bl-done i{background:var(--g);border-color:var(--g);color:#062033}
  .bl-steps .bl-on i{border-color:var(--g);border-top-color:transparent;animation:spin 1s linear infinite}
  .bl-tick{width:92px;height:92px;margin:0 auto 8px}.bl-tick circle{fill:none;stroke:var(--g);stroke-width:4;stroke-dasharray:260;stroke-dashoffset:260;animation:draw .7s .1s forwards}
  .bl-tick path{fill:none;stroke:var(--g);stroke-width:5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:60;stroke-dashoffset:60;animation:draw .5s .7s forwards}
  .bl-rc{background:#fff;color:#12294a;border-radius:16px;padding:16px;margin:14px 0;text-align:left;position:relative}
  .bl-rc:before,.bl-rc:after{content:"";position:absolute;top:50%;width:16px;height:16px;border-radius:50%;background:#0e2240}.bl-rc:before{left:-8px}.bl-rc:after{right:-8px}
  .bl-rc h3{margin:0 0 8px;font-size:.8rem;letter-spacing:1.2px;color:#6b7f74;text-align:center}
  .bl-rc .bl-ln{display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px dashed #c9d6cf;font-size:.92rem}.bl-rc .bl-ln:last-child{border:0}
  .bl-rc .bl-ln b{text-align:right}.bl-rc .bl-tot{font-size:1.1rem}
  @keyframes fade{from{opacity:0}}@keyframes up{from{transform:translateY(60px);opacity:0}}
  @keyframes ring{from{transform:scale(.6);opacity:.9}to{transform:scale(1.5);opacity:0}}
  @keyframes spin{to{transform:rotate(1turn)}}@keyframes draw{to{stroke-dashoffset:0}}
  #billFab{position:fixed;left:12px;bottom:84px;z-index:9999;border:0;border-radius:20px;padding:8px 12px;background:#12294a;color:#eafff2;font-size:.85rem;border:1px solid #00C6A755}
  #billAdmin .bl-card{background:#12294a;border:1px solid #ffffff1c;border-radius:16px;padding:14px;margin:12px 0}
  #billAdmin input[type=date],#billAdmin input[type=number]{width:100%;box-sizing:border-box;margin-top:8px;padding:12px;border-radius:12px;border:1px solid #ffffff26;background:#0a1830;color:var(--ink);font-size:1rem}
  
  #bill *,#billSheet *,#billAdmin *{box-sizing:border-box}
  #billSheet,#billSheet .bl-sheet{font-family:inherit}
  `;
  document.head.appendChild(css);

  function state(){
    const d=D(),I=d&&d.I;
    if(!I||!I.user||!I.biz||I.isAdmin)return"none";
    const b=I.biz;
    if(b.status==="pending")return"pending";
    if(b.status==="active"&&(b.paidUntilMs||0)+864e5<=Date.now())return"expired";
    return"ok";
  }
  const signOut=()=>{const b=document.querySelector('[data-act="signOut"]');if(b)b.click();};

  let shown="",dismissedFor="";
  const close=()=>{const el=document.getElementById("bill");if(el)el.remove();shown="";};

  // ---------- bottom sheet ----------
  let run=0;
  function sheet(html,closable){
    let back=document.getElementById("billSheet");
    if(!back){back=document.createElement("div");back.id="billSheet";back.className="bl-back";document.body.appendChild(back);
      back.addEventListener("click",e=>{if(e.target===back&&back.dataset.closable==="1"){run++;back.remove();}});}
    back.dataset.closable=closable?"1":"0";
    back.innerHTML=`<div class="bl-sheet">${html}</div>`;
    return back.firstChild;
  }
  const closeSheet=()=>{run++;const b=document.getElementById("billSheet");if(b)b.remove();};
  const tick=`<svg class="bl-tick" viewBox="0 0 100 100"><circle cx="50" cy="50" r="41"/><path d="M30 52l14 14 27-30"/></svg>`;

  function receiptView({title,lines,note}){
    const sh=sheet(`${tick}<h2>${esc(title)}</h2><p>Thank you for choosing YEETU. Your shop is ready.</p>
      <div class="bl-rc"><h3>RECEIPT</h3>${lines.map(([a,b,t])=>`<div class="bl-ln ${t?"bl-tot":""}"><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join("")}</div>
      ${note?`<p style="font-size:.85rem">${esc(note)}</p>`:""}
      <button class="bl-btn" id="sGo">Open my shop</button>`,false);
    sh.querySelector("#sGo").onclick=()=>location.reload();
  }

  function payView(planId,p,offerActive){
    const sh=sheet(`<span class="bl-chip">${ICON[planId]} ${esc(p.name)} plan</span>
      <h2>${money(p.amount)}</h2><p>${p.days} day${p.days>1?"s":""} of full access. You will get an M-Pesa prompt on your phone.</p>
      <div class="bl-phone"><span>🇰🇪 +254</span><input id="sPhone" type="tel" inputmode="numeric" placeholder="712 345 678" autocomplete="tel"></div>
      <div class="bl-msg" id="sMsg"></div>
      <button class="bl-btn" id="sPay">Pay ${money(p.amount)}</button>
      <button class="bl-link" id="sX">Cancel</button>`,true);
    const inp=sh.querySelector("#sPhone");
    try{inp.value=(localStorage.getItem("yeetu-mpesa")||"").replace(/^254/,"0");}catch(e){}
    sh.querySelector("#sX").onclick=closeSheet;
    sh.querySelector("#sPay").onclick=async()=>{
      const phone=inp.value.replace(/\s/g,"");
      try{localStorage.setItem("yeetu-mpesa",phone);}catch(e){}
      const my=++run;
      sh.querySelector("#sPay").disabled=true;sh.querySelector("#sMsg").textContent="";
      try{
        const {ref}=await api("/pay",{plan:planId,phone});
        if(my!==run)return;
        waitView(ref,planId,p,phone,my);
      }catch(e){if(my!==run)return;sh.querySelector("#sPay").disabled=false;sh.querySelector("#sMsg").textContent=e.message;}
    };
  }

  async function waitView(ref,planId,p,phone,my){
    const sh=sheet(`<div class="bl-pulse">📲</div><h2>Check your phone</h2>
      <p>Enter your M-Pesa PIN to pay <b>${money(p.amount)}</b>.</p>
      <div class="bl-steps"><div class="bl-done"><i>✓</i>Prompt sent to ${esc(phone)}</div><div class="bl-on"><i></i>Waiting for your PIN</div><div><i></i>Confirming payment</div></div>
      <p style="font-size:.82rem" id="sT"></p><button class="bl-link" id="sX">Cancel</button>`,false);
    sh.querySelector("#sX").onclick=closeSheet;
    const total=40;
    for(let i=0;i<total;i++){
      await new Promise(r=>setTimeout(r,3000));
      if(my!==run)return;
      const left=(total-i)*3,t=sh.querySelector("#sT");if(t)t.textContent=`Waiting… ${Math.floor(left/60)}:${String(left%60).padStart(2,"0")}`;
      let s;try{s=await api("/status",{ref});}catch(e){continue;}
      if(my!==run)return;
      if(s.status==="paid"){
        receiptView({title:"Payment successful!",lines:[
          ["Plan",p.name+" ("+p.days+" day"+(p.days>1?"s":"")+")"],["M-Pesa code",s.receipt||"-"],["Paid on",dateTime(s.paidMs||Date.now())],
          ["Active until",s.paidUntilMs?dateText(s.paidUntilMs):"-"],["Amount paid",money(p.amount),1]]});
        return;
      }
      if(s.status==="failed"||s.status==="mismatch"){
        failView(s.status==="mismatch"?"The amount did not match. Please contact us on "+HELP+".":(s.error||"The payment was not completed."),planId,p);return;
      }
    }
    failView("We did not receive a confirmation yet. If money left your account, contact us on "+HELP+" and we will activate you.",planId,p);
  }

  function failView(text,planId,p){
    const sh=sheet(`<div style="font-size:2.6rem">😕</div><h2>Payment not completed</h2><p>${esc(text)}</p>
      <button class="bl-btn" id="sR">Try again</button><button class="bl-link" id="sX">Close</button>`,true);
    sh.querySelector("#sX").onclick=closeSheet;
    sh.querySelector("#sR").onclick=()=>payView(planId,p);
  }

  function problemView(detail){
    const uid=D().I.user.uid;
    const wa="https://wa.me/254731175210?text="+encodeURIComponent("Hello YEETU admin, there was a problem creating my store. My user ID is: "+uid);
    const sh=sheet(`<div style="font-size:2.6rem">🛠️</div><h2>We hit a small snag</h2>
      <p>There was a problem creating your store. Please send your user ID to our admin on WhatsApp and we will fix it quickly.</p>
      <div class="bl-rc" style="text-align:center"><h3>YOUR USER ID</h3><div style="font-family:monospace;font-size:.95rem;word-break:break-all;font-weight:700">${esc(uid)}</div></div>
      <a class="bl-btn" id="sWa" href="${wa}" target="_blank" rel="noopener" style="display:block;text-decoration:none;text-align:center">Send on WhatsApp · 0731175210</a>
      <button class="bl-btn bl-ghost" id="sCp" style="margin-top:10px">Copy my user ID</button>
      <button class="bl-link" id="sX">Close</button>`,true);
    console.warn("billing problem",detail);
    sh.querySelector("#sX").onclick=closeSheet;
    sh.querySelector("#sCp").onclick=async e=>{try{await navigator.clipboard.writeText(uid);e.target.textContent="Copied ✓";}catch(x){e.target.textContent=uid;}};
  }

  // ---------- plans screen ----------
  async function openPlans(st){
    const key=st+":"+D().I.user.uid;
    if(shown===key||dismissedFor===key)return;
    shown=key;
    const el=document.createElement("div");el.id="bill";
    el.innerHTML=`<div class="bl-bw"><div class="bl-brand"><img src="logo.png" alt=""><b>YEETU</b></div><h1>${st==="expired"?"Time to renew":"Welcome to YEETU"}</h1><p class="bl-sub">Loading…</p></div>`;
    document.body.appendChild(el);
    const bw=el.querySelector(".bl-bw");
    if(!D().owner()){
      bw.innerHTML=`<h1>Subscription needed</h1><p class="bl-sub">Please ask your shop owner to subscribe, then sign in again. Need help? Contact us on ${HELP}.</p><button class="bl-btn bl-ghost" id="bOut">Sign out</button>`;
      bw.querySelector("#bOut").onclick=signOut;return;
    }
    let cfg;
    try{cfg=await api("/config");}catch(e){el.remove();shown="";problemView(e.message);return;}
    const plans=cfg.plans,offer=cfg.offer,trial=cfg.trial;
    let h=`<div class="bl-brand"><img src="logo.png" alt=""><b>YEETU</b></div><h1>${st==="expired"?"Time to renew ⏳":"Welcome to YEETU 👋"}</h1>
      <p class="bl-sub">${st==="expired"?"Pick a plan to keep your shop running.":"Your shop, sales and goals in one place. Choose how to start."}</p>`;
    if(offer.active){
      h+=`<div class="bl-hero"><small>🎉 LAUNCH OFFER</small><div class="bl-big">Free until ${esc(dateText(offer.endMs))}</div>
        <div>${Object.values(plans).map(p=>`<s>${money(p.amount)}</s>`).join("")}<b>KSh 0</b></div>
        <button class="bl-btn bl-white" id="bOffer">Continue with launch offer</button></div>`;
    }else if(trial.available&&trial.days>0){
      h+=`<div class="bl-hero"><small>🎁 NEW SHOP GIFT</small><div class="bl-big">Try free for ${trial.days} days</div>
        <div>No payment needed to start.</div><button class="bl-btn bl-white" id="bTrial">Start my free ${trial.days} days</button></div>`;
    }
    const monthDay=plans.month.amount/plans.month.days;
    h+=`<div class="bl-plans">`+Object.entries(plans).map(([id,p])=>{
      const full=15*p.days,save=full-p.amount,pct=Math.round(save/full*100);
      return `<button class="bl-pc ${id==="month"?"bl-best":""}" data-plan="${id}">${id==="month"?'<span class="bl-tag">BEST VALUE</span>':""}
        <div class="bl-ic">${ICON[id]}</div><div><div class="bl-nm">${esc(p.name)}</div><div class="bl-dd">${p.days} day${p.days>1?"s":""} · KSh ${(p.amount/p.days).toFixed(p.amount/p.days%1?1:0)}/day</div>${save>0?`<div class="bl-save">Save ${pct}%</div>`:""}</div>
        <div class="bl-pr">${offer.active?`<s style="opacity:.5">${money(p.amount)}</s>`:money(p.amount)}<small>${offer.active?"free for now":"pay with M-Pesa"}</small></div></button>`;}).join("")+`</div>
      <p class="bl-fine">🔒 Secure M-Pesa payment · Activated instantly · Need help? ${HELP}</p>`;
    h+=st==="expired"?`<button class="bl-link" id="bLater">Not now (view only)</button>`:`<button class="bl-link" id="bOut">Sign out</button>`;
    bw.innerHTML=h;
    const $=s=>bw.querySelector(s);
    const claim=async(kind,title,planName)=>{
      const b=$(kind==="offer"?"#bOffer":"#bTrial");b.disabled=true;b.textContent="Please wait…";
      try{const r=await api("/claim",{kind});
        receiptView({title,lines:[["Plan",planName],["Amount",money(0)],["Active until",dateText(r.paidUntilMs),1]],note:"Subscribe any time from here when your free time ends."});
      }catch(e){b.disabled=false;b.textContent=kind==="offer"?"Continue with launch offer":"Start my free "+trial.days+" days";problemView(e.message);}
    };
    if($("#bOffer"))$("#bOffer").onclick=()=>claim("offer","You are in! 🎉","Launch offer");
    if($("#bTrial"))$("#bTrial").onclick=()=>claim("trial","Your free trial has started!","Free trial ("+trial.days+" days)");
    if($("#bLater"))$("#bLater").onclick=()=>{dismissedFor=key;close();};
    if($("#bOut"))$("#bOut").onclick=signOut;
    bw.querySelectorAll("[data-plan]").forEach(b=>b.onclick=()=>{
      if(offer.active){const hr=bw.querySelector(".bl-hero");if(hr){hr.scrollIntoView({behavior:"smooth",block:"center"});hr.animate([{transform:"scale(1)"},{transform:"scale(1.03)"},{transform:"scale(1)"}],{duration:450});}return;}
      payView(b.dataset.plan,plans[b.dataset.plan],false);
    });
  }

  // ---------- admin panel ----------
  async function openAdmin(){
    if(document.getElementById("billAdmin"))return;
    const el=document.createElement("div");el.id="billAdmin";
    el.innerHTML=`<div class="bl-bw"><h1>Billing settings</h1><p class="bl-sub">Loading…</p></div>`;
    document.body.appendChild(el);
    const bw=el.querySelector(".bl-bw");
    let cfg;try{cfg=await api("/config");}catch(e){bw.innerHTML=`<h1>Billing settings</h1><p class="bl-sub">${esc(e.message)}</p><button class="bl-btn bl-ghost" id="aX">Close</button>`;bw.querySelector("#aX").onclick=()=>el.remove();return;}
    const a=cfg.admin||{},d=a.offerEndMs?new Date(a.offerEndMs).toISOString().slice(0,10):"";
    bw.innerHTML=`<h1>Billing settings</h1>
      <div class="bl-card"><label><input type="checkbox" id="aOn" ${a.offerEnabled?"checked":""} style="margin-right:8px"><b>Launch offer ON</b></label>
      <p class="bl-sub" style="margin:6px 0 0">Shops that tap Continue get free access until this date.</p><input type="date" id="aEnd" value="${d}"></div>
      <div class="bl-card"><b>Free trial for new shops (days)</b><p class="bl-sub" style="margin:6px 0 0">Shown when the launch offer is off. 0 = no trial.</p>
      <input type="number" id="aTrial" min="0" max="365" value="${a.trialDays||0}"></div>
      <p class="bl-sub" id="aMsg"></p><button class="bl-btn" id="aSave">Save</button><button class="bl-link" id="aX">Close</button>`;
    const q=s=>bw.querySelector(s);
    q("#aX").onclick=()=>el.remove();
    q("#aSave").onclick=async()=>{
      const end=q("#aEnd").value?new Date(q("#aEnd").value+"T23:59:59").getTime():0;
      if(q("#aOn").checked&&end<=Date.now()){q("#aMsg").textContent="Pick an end date in the future.";return;}
      q("#aMsg").textContent="Saving…";
      try{await api("/admin/config",{offerEnabled:q("#aOn").checked,offerEndMs:end,trialDays:Number(q("#aTrial").value)||0});q("#aMsg").textContent="Saved ✓";}
      catch(e){q("#aMsg").textContent=e.message;}
    };
  }

  const QUICK=new URLSearchParams(location.search).get("quick")==="1";
  function loop(){
    if(QUICK)return; // floating tool windows (bubble / notification bar) stay small; plans open in the main app
    const d=D();if(!d||!d.I)return;
    const st=state();
    if(st==="pending"||st==="expired")openPlans(st);else if(st==="ok"||st==="none"){if(!document.getElementById("billSheet"))close();}
    const fab=document.getElementById("billFab");
    if(d.I.isAdmin&&d.I.user){
      if(!fab){const b=document.createElement("button");b.id="billFab";b.type="button";b.textContent="💳 Billing";b.onclick=openAdmin;document.body.appendChild(b);}
    }else if(fab)fab.remove();
  }
  setInterval(loop,400);
})();
