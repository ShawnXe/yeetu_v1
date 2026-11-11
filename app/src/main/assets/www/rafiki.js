/* Rafiki AI: chat overlay for YEETU (Business + Personal). Talks to the rafikiChat Cloud Function; history lives in Firestore. */
(()=>{
  "use strict";
  const $=id=>document.getElementById(id);
  const D=()=>window.DUKA;
  const ENDPOINT=()=>window.RAFIKI_ENDPOINT||"https://us-central1-duka-team.cloudfunctions.net/rafikiChat";
  const LS={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:v}catch(e){return d}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
  const MAX=1000;
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const S={mode:LS.get("rafiki-mode","business"),chatId:null,chats:[],msgs:[],local:[],busy:false,unChats:null,unMsgs:null,uid:"",histOpen:false,error:""};
  const PROMPTS={
    business:["How are sales today?","What is running low?","How am I doing on my goal?","Where can I cut costs?"],
    personal:["Help me plan my week","I need some motivation","Help me set a goal","I want to think something through"]
  };
  let root=null;

  function render_md(t){
    let h=esc(t).replace(/\*\*(.+?)\*\*/g,"<b>$1</b>");
    const out=[];let list=false;
    h.split("\n").forEach(l=>{
      const m=l.match(/^\s*[-*•]\s+(.*)/);
      if(m){if(!list){out.push("<ul>");list=true}out.push("<li>"+m[1]+"</li>")}
      else{if(list){out.push("</ul>");list=false}out.push(l.trim()?"<p>"+l+"</p>":"")}
    });
    if(list)out.push("</ul>");
    return out.join("");
  }

  function build(){
    root=document.createElement("div");root.id="rafiki";root.className="rk hidden";
    root.innerHTML=`
      <div class="rk-top">
        <button class="rk-ico" id="rkBack" type="button" aria-label="Close Rafiki">←</button>
        <div class="rk-title"><span class="rk-avatar">R</span><div><strong>Rafiki</strong><small id="rkSub">Your friend in business</small></div></div>
        <button class="rk-ico" id="rkHist" type="button" aria-label="Conversations">☰</button>
        <button class="rk-ico rk-new" id="rkNew" type="button" aria-label="New conversation">＋</button>
      </div>
      <div class="rk-seg" id="rkSeg"><button type="button" data-m="business">🏪 Business</button><button type="button" data-m="personal">🌱 Personal</button></div>
      <div class="rk-body">
        <div class="rk-msgs" id="rkMsgs" aria-live="polite"></div>
        <aside class="rk-drawer hidden" id="rkDrawer"><div class="rk-drawer-head"><strong>Conversations</strong><button type="button" class="rk-ico" id="rkDrawerX" aria-label="Close list">×</button></div><div id="rkList"></div></aside>
      </div>
      <div class="rk-ack hidden" id="rkAck"><p><b>Before you chat.</b> Keep it safe: don't type customers' phone numbers, passwords or M-Pesa PINs.</p><button type="button" class="vb-qs" id="rkAckBtn">I understand</button></div>
      <form class="rk-form" id="rkForm"><textarea id="rkInput" rows="1" maxlength="${MAX}" placeholder="Ask Rafiki…" aria-label="Message"></textarea><button class="rk-send" id="rkSend" type="submit" aria-label="Send">➤</button></form>
      <div class="rk-count" id="rkCount"></div>`;
    document.body.appendChild(root);
    $("rkBack").onclick=close;
    $("rkHist").onclick=()=>toggleDrawer(true);$("rkDrawerX").onclick=()=>toggleDrawer(false);
    $("rkNew").onclick=()=>newChat();
    $("rkSeg").onclick=e=>{const b=e.target.closest("[data-m]");if(b)setMode(b.dataset.m)};
    $("rkAckBtn").onclick=()=>{LS.set("rafiki-ack","1");paint()};
    $("rkList").onclick=e=>{const b=e.target.closest("[data-chat]");if(b){openChat(b.dataset.chat);toggleDrawer(false)}};
    $("rkMsgs").onclick=e=>{const b=e.target.closest("[data-prompt]");if(b)send(b.dataset.prompt)};
    const inp=$("rkInput");
    inp.addEventListener("input",()=>{inp.style.height="auto";inp.style.height=Math.min(inp.scrollHeight,130)+"px";count()});
    inp.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey&&window.matchMedia("(min-width:720px)").matches){e.preventDefault();$("rkForm").requestSubmit()}});
    $("rkForm").onsubmit=e=>{e.preventDefault();const v=inp.value.trim();if(v){inp.value="";inp.style.height="auto";count();send(v)}};
    document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!root.classList.contains("hidden")){S.histOpen?toggleDrawer(false):close()}});
  }
  function count(){const n=$("rkInput").value.length;$("rkCount").textContent=n>MAX-150?`${n}/${MAX}`:""}
  function toggleDrawer(on){S.histOpen=on;$("rkDrawer").classList.toggle("hidden",!on)}

  function open(mode){
    const I=D()?.I;if(!I?.user?.uid){return}
    if(!root)build();
    if(S.uid!==I.user.uid){stop();S.uid=I.user.uid;S.chatId=null;S.msgs=[];S.local=[];S.chats=[];watchChats()}
    if(mode)S.mode=mode;
    root.classList.remove("hidden");document.body.classList.add("rk-open");
    paint();
  }
  function close(){if(root)root.classList.add("hidden");document.body.classList.remove("rk-open")}
  function stop(){if(S.unChats){S.unChats();S.unChats=null}if(S.unMsgs){S.unMsgs();S.unMsgs=null}}
  function setMode(m){if(m===S.mode)return;S.mode=m;LS.set("rafiki-mode",m);const cur=S.chats.find(c=>c.id===S.chatId);if(!cur||cur.mode!==m){newChat(true)}paint()}
  function newChat(keepMode){S.chatId=null;S.msgs=[];S.local=[];S.error="";if(S.unMsgs){S.unMsgs();S.unMsgs=null}toggleDrawer(false);paint()}
  function watchChats(){
    S.unChats=D().watchQuery(`users/${S.uid}/rafikiChats`,{where:[["uid","==",S.uid]]},rows=>{S.chats=(rows||[]).sort((a,b)=>(b.updatedMs||0)-(a.updatedMs||0));paint()},()=>{});
  }
  function watchMsgs(){
    if(S.unMsgs){S.unMsgs();S.unMsgs=null}
    if(!S.chatId)return;
    const id=S.chatId;
    S.unMsgs=D().watchQuery(`users/${S.uid}/rafikiChats/${id}/messages`,{where:[["uid","==",S.uid]]},rows=>{if(id!==S.chatId)return;S.msgs=(rows||[]).sort((a,b)=>(a.createdMs||0)-(b.createdMs||0));paint(true)},()=>{});
  }
  function openChat(id){const c=S.chats.find(x=>x.id===id);if(!c)return;S.chatId=id;S.mode=c.mode==="personal"?"personal":"business";S.msgs=[];S.local=[];S.error="";watchMsgs();paint()}

  async function send(text){
    if(S.busy||!text)return;
    if(LS.get("rafiki-ack","")!=="1"){paint();return}
    S.busy=true;S.error="";
    S.local.push({role:"user",text,local:true});paint(true);
    try{
      const token=await D().getIdToken();
      const res=await fetch(ENDPOINT(),{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({data:{chatId:S.chatId||undefined,mode:S.mode,message:text}})});
      const j=await res.json().catch(()=>({}));
      if(!res.ok||j.error)throw new Error(j.error?.message||"Rafiki could not answer. Please try again.");
      const r=j.result||{};
      S.local.push({role:"model",text:r.reply||"",local:true});
      if(!S.chatId&&r.chatId){S.chatId=r.chatId;watchMsgs()}
    }catch(err){
      S.error=(err&&err.message)||"Something went wrong. Check your internet and try again.";
      if(/Failed to fetch|NetworkError/i.test(S.error))S.error="Can't reach Rafiki. Check your internet and try again.";
      S.local=S.local.filter(m=>!(m.role==="user"&&m.text===text&&!S.msgs.some(x=>x.role==="user"&&x.text===text)));
      const inp=$("rkInput");if(inp&&!inp.value)inp.value=text;
    }finally{S.busy=false;paint(true)}
  }

  function paint(scroll){
    if(!root)return;
    const I=D()?.I,owner=I?.profile?.role==="owner";
    $("rkSeg").querySelectorAll("[data-m]").forEach(b=>b.classList.toggle("on",b.dataset.m===S.mode));
    $("rkSub").textContent=S.mode==="business"?(owner?"Your shop, in plain words":"Your sales and stock"):"Think things through";
    const acked=LS.get("rafiki-ack","")==="1";
    $("rkAck").classList.toggle("hidden",acked);$("rkForm").classList.toggle("hidden",!acked);
    // drop local copies once the saved version arrives
    S.local=S.local.filter(m=>!S.msgs.some(x=>x.role===m.role&&x.text===m.text));
    const all=[...S.msgs,...S.local];
    const el=$("rkMsgs");
    let h="";
    if(!all.length){
      h=`<div class="rk-empty"><div class="rk-hero">R</div><h3>${S.mode==="business"?"Ask about your business":"What's on your mind?"}</h3><p>${S.mode==="business"?"Ask me anything about running your shop, from stock to pricing to growing your sales.":"A private place to plan, reflect and get encouraged."}</p><div class="rk-chips">${PROMPTS[S.mode].map(p=>`<button type="button" data-prompt="${esc(p)}">${esc(p)}</button>`).join("")}</div></div>`;
    }else h=all.map(m=>`<div class="rk-row ${m.role==="user"?"me":"ai"}">${m.role==="user"?"":'<span class="rk-mini">R</span>'}<div class="rk-bub">${render_md(m.text)}</div></div>`).join("");
    if(S.busy)h+=`<div class="rk-row ai"><span class="rk-mini">R</span><div class="rk-bub rk-typing"><i></i><i></i><i></i></div></div>`;
    if(S.error)h+=`<div class="rk-err">${esc(S.error)}</div>`;
    el.innerHTML=h;
    if(scroll||!all.length)el.scrollTop=el.scrollHeight;
    const list=S.chats.filter(c=>(c.mode==="personal"?"personal":"business")===S.mode);
    $("rkList").innerHTML=list.length?list.map(c=>`<button type="button" class="rk-chat${c.id===S.chatId?" on":""}" data-chat="${esc(c.id)}"><strong>${esc(c.title||"Conversation")}</strong><small>${esc(c.preview||"")}</small></button>`).join(""):`<p class="rk-none">No ${S.mode} conversations yet.</p>`;
    $("rkSend").disabled=S.busy;
  }

  document.addEventListener("click",e=>{
    const b=e.target.closest("[data-rafiki-open]");
    if(b){e.preventDefault();const more=document.getElementById("moreMenu");if(more)more.classList.add("hidden");document.getElementById("fab")?.classList.remove("open");open()}
  });
  (function(){const m=document.getElementById("rkMascot"),app=document.getElementById("screen-app");if(!m||!app)return;
    const sync=()=>{m.style.display=app.classList.contains("hidden")?"none":""};
    new MutationObserver(sync).observe(app,{attributes:true,attributeFilter:["class"]});sync();})();
  window.DUKA_RAFIKI={open,close};
})();
