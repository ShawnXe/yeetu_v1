/* Reports charts: built from the same live data the Reports page uses (DUKA.I). */
(function(){
"use strict";
const D=()=>window.DUKA,$=id=>document.getElementById(id);
const pad=n=>String(n).padStart(2,"0"),ymd=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const ACC="var(--ac,var(--teal2,#16a34a))",OK="#34d399",WARN="#fbbf24",BAD="#f87171";
let sel={},lastSig=""; // selected bar per chart

function range(p){
  const now=new Date(),t=ymd(now);
  if(p==="today")return[t,t];
  if(p==="week"){const r=new Date(now);r.setDate(r.getDate()-(r.getDay()+6)%7);return[ymd(r),t]}
  if(p==="lastmonth")return[ymd(new Date(now.getFullYear(),now.getMonth()-1,1)),ymd(new Date(now.getFullYear(),now.getMonth(),0))];
  return[ymd(new Date(now.getFullYear(),now.getMonth(),1)),t];
}
function days(a,b){const o=[],d=new Date(a+"T00:00:00"),e=new Date(b+"T00:00:00");for(;d<=e&&o.length<62;d.setDate(d.getDate()+1))o.push(ymd(d));return o}
function profitOf(s){
  const I=D().I,c=I.costs||{};let p=0,known=false;
  (s.items||[]).forEach(it=>{const k=typeof it.cost==="number"?it.cost:c[it.pid];if(typeof k==="number"){p+=it.qty*(it.price-k);known=true}});
  return known?p:0;
}
function nice(m){if(m<=0)return 1;const p=Math.pow(10,Math.floor(Math.log10(m))),f=m/p;return(f<=1?1:f<=2?2:f<=5?5:10)*p}
function short(n){n=Math.round(n);return n>=1e6?(n/1e6).toFixed(1).replace(/\.0$/,"")+"M":n>=1e3?(n/1e3).toFixed(n>=1e4?0:1).replace(/\.0$/,"")+"k":String(n)}
function chartBars(key,labels,vals,prof,fmtLabel,every){
  const W=340,H=170,L=30,B=22,T=8,pw=W-L-4,ph=H-B-T,n=vals.length;
  const mx=nice(Math.max(...vals,...(prof||[0]),1)),bw=pw/n,bar=Math.max(2,Math.min(bw*.68,26));
  const y=v=>T+ph-(Math.max(v,0)/mx)*ph,x=i=>L+bw*i+bw/2;
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Sales chart">`;
  for(let g=0;g<=3;g++){const v=mx*g/3,yy=y(v);s+=`<line class="rpc-grid" x1="${L}" x2="${W-4}" y1="${yy}" y2="${yy}"/><text x="${L-5}" y="${yy+3}" text-anchor="end">${short(v)}</text>`}
  const sl=sel[key];
  vals.forEach((v,i)=>{const h=Math.max(v>0?2:0,ph-(y(v)-T));s+=`<rect class="rpc-bar${sl!=null&&sl!==i?" dim":""}" x="${x(i)-bar/2}" y="${T+ph-h}" width="${bar}" height="${h}" rx="3" style="animation-delay:${Math.min(i*15,400)}ms"/>`});
  if(prof&&prof.some(v=>v!==0)){
    s+=`<polyline class="rpc-line" points="${prof.map((v,i)=>x(i).toFixed(1)+","+y(v).toFixed(1)).join(" ")}"/>`;
    if(n<=16)prof.forEach((v,i)=>s+=`<circle class="rpc-dot" cx="${x(i)}" cy="${y(v)}" r="2.5"/>`);
  }
  labels.forEach((l,i)=>{if(i%every===0)s+=`<text x="${x(i)}" y="${H-7}" text-anchor="middle">${l}</text>`});
  vals.forEach((v,i)=>s+=`<rect class="rpc-hit" data-k="${key}" data-i="${i}" x="${L+bw*i}" y="${T}" width="${bw}" height="${ph}"/>`);
  return s+"</svg>";
}
function build(){
  const d=D(),host=$("rpCharts");if(!d||!host||!d.I||!d.I.sales)return;
  const I=d.I,own=d.owner(),F=d.fmt,E=d.esc,per=($("reportPeriod")||{}).value||"month",[a,b]=range(per);
  const sales=I.sales.filter(s=>!s.voided&&s.type!=="credit_payment"&&s.date>=a&&s.date<=b);
  const exps=own?(I.expenses||[]).filter(e=>e.date>=a&&e.date<=b):[];
  const today=per==="today";
  host.dataset.per=per;
  if(!sales.length){host.innerHTML=`<div class="panel"><h3>Charts</h3><div class="empty">No sales in this period yet. Charts appear as soon as you record a sale.</div></div>`;host._d=null;return}

  // 1. Trend
  let labels,vals,prof,info;
  if(today){
    const hrs=Array.from({length:24},(_,i)=>i);vals=hrs.map(()=>0);prof=hrs.map(()=>0);const cnt=hrs.map(()=>0);
    sales.forEach(s=>{const h=typeof s.createdAt==="number"?new Date(s.createdAt).getHours():12;vals[h]+=s.total;prof[h]+=profitOf(s);cnt[h]++});
    const f=Math.max(0,vals.findIndex(v=>v>0)-1),l=Math.min(23,23-[...vals].reverse().findIndex(v=>v>0)+1);
    const keep=hrs.filter(h=>h>=Math.min(f,6)&&h<=Math.max(l,18));
    labels=keep.map(h=>(h%12||12)+(h<12?"a":"p"));vals=keep.map(h=>vals[h]);prof=keep.map(h=>prof[h]);const c2=keep.map(h=>cnt[h]);
    info=i=>({t:labels[i]+" hour",v:vals[i],p:prof[i],n:c2[i]});
  }else{
    const ds=days(a,b<ymd(new Date())?b:ymd(new Date())),m={};
    sales.forEach(s=>{const o=m[s.date]||(m[s.date]={v:0,p:0,n:0});o.v+=s.total;o.p+=profitOf(s);o.n++});
    vals=ds.map(x=>(m[x]||{v:0}).v);prof=ds.map(x=>(m[x]||{p:0}).p);
    labels=ds.map(x=>per==="week"?new Date(x+"T00:00:00").toLocaleDateString("en-KE",{weekday:"short"}):String(+x.slice(8)));
    info=i=>({t:new Date(ds[i]+"T00:00:00").toLocaleDateString("en-KE",{weekday:"long",day:"numeric",month:"short"}),v:vals[i],p:prof[i],n:(m[ds[i]]||{n:0}).n});
  }
  const every=Math.ceil(vals.length/8);
  const showProf=own&&prof.some(v=>v!==0);
  const trend=`<div class="panel"><h3>${today?"Sales through the day":"Sales day by day"}</h3><p class="rpc-sub">Tap a bar to see that ${today?"hour":"day"}</p>${chartBars("trend",labels,vals,showProf?prof:null,null,every)}<div class="rpc-read" id="rpcTrendRead"></div><div class="rpc-legend"><span><i style="background:${ACC}"></i>Sales</span>${showProf?`<span><i style="background:${WARN}"></i>Profit</span>`:""}</div></div>`;

  // 2. Payment mix
  const pay=[["cash","Cash",ACC],["mpesa","M-Pesa",OK],["credit","On credit",WARN]].map(([k,n,c])=>({n,c,v:sales.filter(s=>s.payment===k).reduce((t,s)=>t+s.total,0),k:sales.filter(s=>s.payment===k).length}));
  const pt=pay.reduce((t,p)=>t+p.v,0)||1;let off=0;const R=42,C=2*Math.PI*R;
  let dn=`<svg viewBox="0 0 120 120" role="img" aria-label="How customers paid"><circle cx="60" cy="60" r="${R}" fill="none" stroke="var(--surf2,#eef1f4)" stroke-width="18"/>`;
  pay.forEach(p=>{if(p.v>0){const len=p.v/pt*C;dn+=`<circle class="rpc-seg" cx="60" cy="60" r="${R}" fill="none" stroke="${p.c}" stroke-width="18" stroke-dasharray="${len} ${C-len}" stroke-dashoffset="${-off}" transform="rotate(-90 60 60)"/>`;off+=len}});
  dn+=`<text class="rpc-donut-n" x="60" y="65" text-anchor="middle">${sales.length}</text><text x="60" y="78" text-anchor="middle">sales</text></svg>`;
  const payP=`<div class="panel"><h3>How customers paid</h3><p class="rpc-sub">Share of money by payment type</p><div class="rpc-donut">${dn}<div class="rpc-legend">${pay.map(p=>`<span><i style="background:${p.c}"></i>${p.n} · ${Math.round(p.v/pt*100)}%<br><small>${E(F(p.v))}</small></span>`).join("")}</div></div></div>`;

  // 3. Busy hours (not for "today", trend already shows it)
  let hoursP="";
  if(!today){
    const hv=Array(24).fill(0);let ok=0;sales.forEach(s=>{if(typeof s.createdAt==="number"){hv[new Date(s.createdAt).getHours()]+=s.total;ok++}});
    if(ok){const lo=Math.min(6,hv.findIndex(v=>v>0)),hi=Math.max(18,23-[...hv].reverse().findIndex(v=>v>0)),hs=[];for(let h=Math.max(lo,0);h<=hi;h++)hs.push(h);
      const lb=hs.map(h=>(h%12||12)+(h<12?"a":"p"));
      const top=hs.reduce((m,h)=>hv[h]>hv[m]?h:m,hs[0]);
      hoursP=`<div class="panel"><h3>Busiest hours</h3><p class="rpc-sub">Best time: ${(top%12||12)}${top<12?"am":"pm"} · when to have stock and staff ready</p>${chartBars("hours",lb,hs.map(h=>hv[h]),null,null,Math.ceil(hs.length/7))}<div class="rpc-read" id="rpcHoursRead"></div></div>`;
      host._h={hs,hv,lb};}
  }

  // 4. Money in vs out (owner)
  let flow="";
  if(own){
    const sl=sales.reduce((t,s)=>t+s.total,0),pr=sales.reduce((t,s)=>t+profitOf(s),0),ex=exps.reduce((t,e)=>t+e.amount,0);
    const wo=(I.writeoffs||[]).filter(w=>!w.voided&&w.date>=a&&w.date<=b).reduce((t,w)=>t+w.qty*((I.costs||{})[w.pid]||0),0);
    const net=pr-ex-wo,mx=Math.max(sl,pr,ex,wo,Math.abs(net),1);
    const row=(n,v,c)=>`<div class="rpc-hbar"><div><span>${n}</span><strong>${E(F(v))}</strong></div><div class="t"><i style="width:${Math.max(v>0?2:0,Math.abs(v)/mx*100)}%;background:${c}"></i></div></div>`;
    flow=`<div class="panel"><h3>Where the money went</h3><p class="rpc-sub">Sales, profit, spending and losses side by side</p>${row("Sales",sl,ACC)}${row("Profit from items",pr,OK)}${row("Expenses",ex,WARN)}${row("Lost to bad stock",wo,BAD)}${row("Net profit",net,net>=0?OK:BAD)}</div>`;
  }

  // 5. Top products
  const pm={};sales.forEach(s=>(s.items||[]).forEach(it=>{const o=pm[it.name]||(pm[it.name]={v:0,q:0});o.v+=it.qty*it.price;o.q+=it.qty}));
  const tp=Object.entries(pm).sort((x,y)=>y[1].v-x[1].v).slice(0,6),tm=tp.length?tp[0][1].v:1;
  const topP=tp.length?`<div class="panel"><h3>Best sellers</h3><p class="rpc-sub">Top products by money earned</p>${tp.map(([n,o])=>`<div class="rpc-hbar"><div><span>${E(n)} <small class="hint">× ${Math.round(o.q*100)/100}</small></span><strong>${E(F(o.v))}</strong></div><div class="t"><i style="width:${Math.max(2,o.v/tm*100)}%;background:${ACC}"></i></div></div>`).join("")}</div>`:"";

  host.innerHTML=trend+`<div class="rpc-two">${[payP,hoursP,topP,flow].filter(Boolean).join("")}</div>`;
  const sig=per+"|"+sales.length+"|"+sales.reduce((t,s)=>t+s.total,0)+"|"+exps.length;
  host.classList.toggle("still",sig===lastSig);lastSig=sig;
  host._d={info};
  readout("trend",sel.trend);readout("hours",sel.hours);
}
function readout(k,i){
  const host=$("rpCharts"),F=D().fmt,own=D().owner();
  if(k==="trend"){const el=$("rpcTrendRead");if(!el||!host._d)return;
    if(i==null||!host._d.info){el.innerHTML="";return}
    const o=host._d.info(i);el.innerHTML=`<strong>${o.t}</strong> · ${F(o.v)} <small>· ${o.n} sale${o.n===1?"":"s"}${own&&o.p?" · profit "+F(o.p):""}</small>`}
  if(k==="hours"){const el=$("rpcHoursRead");if(!el||!host._h)return;
    if(i==null){el.innerHTML="";return}
    const h=host._h.hs[i];el.innerHTML=`<strong>${host._h.lb[i]}</strong> · ${F(host._h.hv[h])}`}
}
let raf=0;function schedule(){const r=$("reports");if(!r||!r.classList.contains("active"))return;cancelAnimationFrame(raf);raf=requestAnimationFrame(build)}
function init(){
  const r=$("reports");if(!r||$("rpCharts"))return;
  const box=document.createElement("div");box.id="rpCharts";
  const anchor=r.querySelector(".two-col");r.insertBefore(box,anchor);
  box.addEventListener("click",e=>{const h=e.target.closest(".rpc-hit");if(!h)return;const k=h.dataset.k,i=+h.dataset.i;sel[k]=sel[k]===i?null:i;build()});
  $("reportPeriod").addEventListener("change",()=>{sel={};schedule()});
  window.addEventListener("duka-dashboard-refresh",schedule);
  window.addEventListener("duka-products-refresh",schedule);
  document.querySelectorAll(".nav-btn,[data-go]").forEach(b=>b.addEventListener("click",()=>setTimeout(schedule,30)));
  window.DUKA_CHARTS={render:build};schedule();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
