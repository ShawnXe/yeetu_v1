/* Sales page: search, A-Z index, camera scanner, checkout. Drives the app's own sale code through window.DUKA. */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const D=()=>window.DUKA;
const esc=s=>D().esc(s);
const money=n=>D().fmt(n);
const r2=n=>Math.round((Number(n)||0)*100)/100;
const safe=(f,d)=>{try{return f()}catch(e){return d}};

let sel=null,selQty=1,query="",pay="cash",mtype="till",busy=false,dirty=false,lastInfo=null,pending=null;
const RAIL=["#","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z"];

/* ---------- helpers ---------- */
const products=()=>D().I.products||[];
const byName=(a,b)=>String(a.name||"").localeCompare(String(b.name||""),undefined,{numeric:true,sensitivity:"base"});
const letterOf=n=>{const c=String(n||"").trim().charAt(0).toUpperCase();return /[A-Z]/.test(c)?c:"#"};
const norm=c=>String(c||"").trim().replace(/^0+(?=\d)/,"");
const cartQty=pid=>{const c=D().cart().find(x=>x.pid===pid);return c?c.qty:0};
function search(q){
  const all=products().slice().sort(byName);
  if(window.DukaProductSearch)return window.DukaProductSearch.search(all,q);
  q=String(q||"").trim().toLowerCase();
  if(!q)return all;
  const toks=q.split(/\s+/).filter(Boolean);
  return all.filter(p=>{const hay=[p.name,p.brand,p.category,p.variant,p.packSize,p.barcode,...(p.aliases||[]),...(p.ocrTerms||[]),...(p.alternateBarcodes||[])].join(" ").toLowerCase();return toks.every(t=>hay.includes(t))});
}
function findByCode(code){
  const raw=String(code||"").trim();if(!raw)return null;
  const n=norm(raw),low=raw.toLowerCase();
  const ps=products();
  return (window.DukaProductSearch&&window.DukaProductSearch.findByBarcode(raw,ps))
      ||ps.find(p=>p.barcode&&(String(p.barcode).trim()===raw||norm(p.barcode)===n))
      ||ps.find(p=>(p.alternateBarcodes||[]).some(x=>String(x).trim()===raw||norm(x)===n))
      ||ps.find(p=>p.id===raw)
      ||ps.find(p=>String(p.name||"").trim().toLowerCase()===low)||null;
}
function discountAmt(){
  const sub=D().total();
  return D().discountOk()?Math.min(Math.max(Number($("saleDiscount").value)||0,0),sub):0;
}
const grandTotal=()=>r2(D().total()-discountAmt());

/* add through the app's own validated code path (stock, expiry, max lines, toasts) */
function addToCart(pid,qty){
  const before=cartQty(pid);
  $("saleProduct").value=pid;$("saleQty").value=qty;
  D().add();
  return cartQty(pid)>before;
}

/* ---------- product list ---------- */
function stockTag(p){
  const s=Number(p.stock)||0;
  if(s<=0)return '<span class="sx-stock out">Out of stock</span>';
  return '<span class="sx-stock'+(s<=(Number(p.low)||0)?" low":"")+'">Stock '+esc(D().num(s))+'</span>';
}
function rowHtml(p){
  const d=D(),inc=cartQty(p.id),isSel=sel===p.id,exp=d.expired(p),off=d.offer(p);
  const price=d.price(p);
  let h='<div class="sx-row'+(isSel?" sel":"")+((Number(p.stock)<=0||exp)?" dim":"")+'" data-id="'+esc(p.id)+'">';
  const thumb=p.imageUrl?'<div class="sx-thumb"><img src="'+esc(p.imageUrl)+'" alt="" loading="lazy"></div>':'<div class="sx-thumb sx-thumb-empty">📦</div>';
  h+='<div class="sx-rowtop">'+thumb+'<div class="sx-main"><div class="sx-name">'+esc(p.baseName&&p.productType==="variant"?p.baseName:p.name)+(off?' <span class="tag offer">OFFER</span>':"")+(exp?' <span class="tag bad">EXPIRED</span>':"")+'</div>';
  const meta=[p.brand,p.variantLabel||p.variant,p.packSize,p.category,p.sku?"SKU "+p.sku:""].filter(Boolean).join(" · ");
  h+='<div class="sx-meta">'+esc(meta)+(p.barcode?(meta?" · ":"")+'<span class="sx-bc">'+esc(p.barcode)+'</span>':"")+'</div></div>';
  h+='<div class="sx-side"><div class="sx-price">'+money(price)+(off?' <s>'+money(p.sell)+'</s>':"")+'</div>'+stockTag(p)+(inc?'<span class="sx-inc">×'+esc(d.num(inc))+' in cart</span>':"")+'</div></div>';
  if(isSel){
    h+='<div class="sx-pick"><div class="sx-step"><button type="button" data-sx="qm" aria-label="Less">−</button><input id="sxQtyIn" type="number" min="0" step="any" inputmode="decimal" value="'+esc(selQty)+'"><button type="button" data-sx="qp" aria-label="More">+</button></div>';
    h+='<button type="button" class="sx-tick-btn" data-sx="addSel" aria-label="Add to cart">✓</button></div>';
  }
  return h+"</div>";
}
/* ---------- display: list or 2-6 columns, limited by screen width ---------- */
const VIEW_KEY="duka-sale-view";
let view="list";
try{view=localStorage.getItem(VIEW_KEY)||"list"}catch(e){}
function maxCols(){
  const usable=Math.min(window.innerWidth,1000)-30-34; /* page padding + A-Z rail */
  return Math.max(3,Math.min(6,Math.floor((usable+8)/92)));
}
function curView(){
  if(view==="list")return "list";
  const n=Math.min(parseInt(view,10)||3,maxCols());
  return n<2?"list":String(n);
}
function gridIcon(n){
  const w=22,gap=1.6,cw=(w-gap*(n-1))/n;let r="";
  for(let c=0;c<n;c++)for(let y=0;y<2;y++)r+='<rect x="'+(c*(cw+gap)).toFixed(1)+'" y="'+(y*11.6)+'" width="'+cw.toFixed(1)+'" height="10.4" rx="1.8" fill="currentColor"/>';
  return '<svg viewBox="0 0 22 22" width="20" height="20" aria-hidden="true">'+r+"</svg>";
}
function buildView(){
  const box=$("sxView");if(!box)return;
  const cur=curView(),max=maxCols();
  let h='<button type="button" data-v="list" class="'+(cur==="list"?"on":"")+'" aria-label="List"><svg viewBox="0 0 22 22" width="20" height="20" aria-hidden="true"><rect x="0" y="2" width="22" height="4.4" rx="2" fill="currentColor"/><rect x="0" y="9" width="22" height="4.4" rx="2" fill="currentColor"/><rect x="0" y="16" width="22" height="4.4" rx="2" fill="currentColor"/></svg><span>List</span></button>';
  for(let n=2;n<=max;n++)h+='<button type="button" data-v="'+n+'" class="'+(cur===String(n)?"on":"")+'" aria-label="'+n+' per row">'+gridIcon(n)+"<span>"+n+"</span></button>";
  box.innerHTML='<span class="sx-view-lbl">View</span>'+h;
}
function applyView(){
  const list=$("sxList");if(!list)return;
  const cur=curView();
  list.classList.toggle("sx-v-grid",cur!=="list");
  list.dataset.cols=cur;
  list.style.setProperty("--sx-cols",cur==="list"?"1":cur);
}
function setView(v){view=v;try{localStorage.setItem(VIEW_KEY,v)}catch(e){}buildView();renderList()}
function renderList(){
  const list=$("sxList");if(!list)return;
  const ae=document.activeElement;
  if(ae&&ae.id==="sxQtyIn"){dirty=true;return}
  dirty=false;
  applyView();
  const ps=search(query),total=products().length;
  $("sxCount").textContent=total?(query?ps.length+" of "+total:total+" products"):"";
  if(!total){list.innerHTML='<div class="sx-empty">No products yet.<br><small>'+(D().owner()?"Add products on the Products page.":"Ask the owner to add products.")+"</small></div>";buildRail([]);return}
  if(!ps.length){
    list.innerHTML='<div class="sx-empty">Nothing matches “'+esc(query)+'”.<br><small>Try fewer letters, or tap Scan.</small></div>';buildRail([]);return}
  const grid=curView()!=="list";
  let h="",cur="";const present=new Set();
  const cap=1500;
  ps.slice(0,cap).forEach(p=>{
    const L=letterOf(p.name);
    let first=false;
    if(L!==cur){cur=L;present.add(L);first=true;if(!grid)h+='<div class="sx-letter" data-letter="'+L+'">'+L+"</div>"}
    h+=(grid&&first)?rowHtml(p).replace('<div class="sx-row','<div data-letter="'+L+'" class="sx-row'):rowHtml(p);
  });
  list.innerHTML=h;
  buildRail(present);
}
function buildRail(present){
  const rail=$("sxRail");if(!rail)return;
  const key=[...present].join("");
  if(rail.__k===key&&rail.children.length)return;
  rail.__k=key;
  rail.innerHTML=RAIL.map(L=>'<button type="button" class="'+(present.has&&present.has(L)?"on":"")+'" data-l="'+L+'" tabindex="-1">'+L+"</button>").join("");
}
function jumpTo(L){
  const el=document.querySelector('#sxList [data-letter="'+L+'"]');if(!el)return false;
  const top=($("sxTop")?$("sxTop").offsetHeight:0)+(parseInt(getComputedStyle(document.documentElement).getPropertyValue("--vb-hdr"))||0);
  window.scrollTo({top:el.getBoundingClientRect().top+window.scrollY-top-2,behavior:"auto"});
  return true;
}
function railAt(y){
  const rail=$("sxRail"),r=rail.getBoundingClientRect();
  const i=Math.max(0,Math.min(RAIL.length-1,Math.floor((y-r.top)/r.height*RAIL.length)));
  return RAIL[i];
}
function bubble(L){
  let b=$("sxBubble");
  if(!b){b=document.createElement("div");b.id="sxBubble";b.className="sx-bubble";document.body.appendChild(b)}
  b.textContent=L;b.classList.add("show");clearTimeout(b.__t);b.__t=setTimeout(()=>b.classList.remove("show"),600);
}

/* ---------- bottom bar + checkout ---------- */
function renderBar(){
  const cart=D().cart(),bar=$("sxBar");if(!bar)return;
  const n=cart.length;
  bar.classList.toggle("hidden",n===0||!$("sale").classList.contains("active"));
  const units=cart.reduce((a,c)=>a+c.qty,0);
  $("sxBarItems").textContent=n+(n===1?" item":" items")+(units!==n?" · "+D().num(D().round(units))+" units":"");
  $("sxBarTotal").textContent=money(grandTotal());
  const sc=$("sxScanCart");
  if(sc)sc.textContent=n?n+(n===1?" item":" items")+" · "+money(grandTotal()):"Cart empty";
  document.body.classList.toggle("sx-has-bar",n>0);
}
function renderCheckout(){
  const co=$("sxCheckout");if(co.classList.contains("hidden"))return;
  const cart=D().cart();
  if(!cart.length){closeCheckout();return}
  $("sxCartLines").innerHTML=cart.map((c,i)=>
    '<div class="sx-line"><div class="sx-line-main"><div class="sx-line-name">'+esc(c.name)+(c.offer?' <span class="tag offer">OFFER</span>':"")+'</div><div class="sx-line-sub">'+money(c.price)+' each'+(c.custom?' · Custom amount'+(c.note?' · '+esc(c.note):''):'')+'</div></div>'+
    '<div class="sx-step sm"><button type="button" data-sx="cm" data-i="'+i+'" aria-label="Less">−</button><span>'+esc(D().num(c.qty))+'</span><button type="button" data-sx="cp" data-i="'+i+'" aria-label="More">+</button></div>'+
    '<strong class="sx-line-total">'+money(c.qty*c.price)+'</strong><button type="button" class="sx-rm" data-sx="rm" data-i="'+i+'" aria-label="Remove">×</button></div>').join("");
  const sub=D().total(),disc=discountAmt(),tot=grandTotal();
  $("sxTotal").textContent=money(tot);
  $("sxDiscNote").textContent=disc>0?"Subtotal "+money(sub)+" − discount "+money(disc):"";
  updatePay();
}
function setPay(p){
  pay=p;
  document.querySelectorAll("#sxCheckout .sx-pay").forEach(b=>b.classList.toggle("active",b.dataset.pay===p));
  $("sxPayCash").classList.toggle("hidden",p!=="cash");
  $("sxPayMpesa").classList.toggle("hidden",p!=="mpesa");
  $("sxPayCredit").classList.toggle("hidden",p!=="credit");
  $("sxCustWrap").firstChild.textContent=p==="credit"?"Customer name (required)":"Customer name (optional)";
  if(p==="mpesa"&&!$("sxMpAmt").value)$("sxMpAmt").value=grandTotal()||"";
  updatePay();
}
function updatePay(){
  const tot=grandTotal();
  // cash
  const got=$("sxCashIn").value===""?null:Number($("sxCashIn").value);
  const ch=$("sxChange");
  if(got===null){ch.className="sx-change";ch.innerHTML="<span>Change</span><strong>"+money(0)+"</strong>"}
  else if(got>=tot){ch.className="sx-change ok";ch.innerHTML="<span>Change</span><strong>"+money(r2(got-tot))+"</strong>"}
  else{ch.className="sx-change bad";ch.innerHTML="<span>Still to pay</span><strong>"+money(r2(tot-got))+"</strong>"}
  const q=[tot];[50,100,200,500,1000,2000,5000].forEach(v=>{const r=Math.ceil(tot/v)*v;if(r>tot&&!q.includes(r)&&q.length<5)q.push(r)});
  const qh=q.map((v,i)=>'<button type="button" data-sx="quick" data-v="'+v+'">'+(i===0?"Exact":money(v).replace("KSh ",""))+"</button>").join("");
  if($("sxQuick").__h!==qh){$("sxQuick").innerHTML=qh;$("sxQuick").__h=qh}
  // mpesa
  const mp=$("sxMpAmt").value===""?null:Number($("sxMpAmt").value),note=$("sxMpNote");
  if(mp===null){note.textContent="";note.className="sx-note"}
  else if(mp<tot){note.textContent="Short by "+money(r2(tot-mp))+". Use Credit for the balance.";note.className="sx-note bad"}
  else if(mp>tot){note.textContent="Customer paid "+money(r2(mp-tot))+" more than the total.";note.className="sx-note warn"}
  else{note.textContent="Amount matches ✓";note.className="sx-note ok"}
  $("sxCrNote").textContent=tot>0?"The customer will owe "+money(tot)+" after this sale.":"";
}
function openCheckout(){
  if(!D().cart().length){D().toast("Cart is empty");return}
  $("sxDiscountSlot").appendChild($("discountWrap"));
  $("sxCheckout").classList.remove("hidden");
  document.body.classList.add("sx-lock");
  $("sxMpAmt").value="";$("sxCashIn").value="";
  setPay(pay);renderCheckout();
}
function closeCheckout(){
  $("sxCheckout").classList.add("hidden");
  if($("sxScanner").classList.contains("hidden")&&$("sxDone").classList.contains("hidden"))document.body.classList.remove("sx-lock");
}
function setCartQty(i,q){
  const cart=D().cart(),c=cart[i];if(!c)return;
  q=D().round(q);
  if(q<=0){cart.splice(i,1);D().refresh();return}
  const p=products().find(x=>x.id===c.pid);
  if(p&&q>p.stock){D().toast("Only "+D().num(p.stock)+" in stock");return}
  c.qty=q;D().refresh();
}
function complete(){
  if(busy)return;
  const d=D(),tot=grandTotal();
  if(!d.cart().length){d.toast("Cart is empty");return}
  const cust=$("sxCustomer").value.trim();
  let code="",received=null,change=0;
  if(pay==="cash"){
    received=$("sxCashIn").value===""?tot:Number($("sxCashIn").value);
    if(!(received>=tot)){d.toast("Amount received is less than the total. Use Credit for a balance.",3500);return}
    change=r2(received-tot);
  }else if(pay==="mpesa"){
    code=$("sxMpCode").value.trim().toUpperCase().replace(/\s+/g,"");
    received=$("sxMpAmt").value===""?tot:Number($("sxMpAmt").value);
    if(!(received>=tot)){d.toast("M-Pesa amount is less than the total",3500);return}
    if(!/^[A-Z0-9]{10}$/.test(code)){d.toast("Enter the 10-character M-Pesa code from the SMS",3500);return}
    change=r2(received-tot);
  }else{
    if(!cust){d.toast("Enter the customer's name for credit");return}
  }
  $("paymentMethod").value=pay;
  $("paymentMethod").dispatchEvent(new Event("change"));
  $("saleCustomer").value=cust;
  $("mpesaCode").value=code;
  pending={pay,received,change,mtype};
  busy=true;$("sxComplete").disabled=true;
  setTimeout(()=>{busy=false;$("sxComplete").disabled=false},3500);
  $("completeSale").click();
}
function onSale(info){
  busy=false;$("sxComplete").disabled=false;
  const p=pending||{pay:info.payment,received:null,change:0};
  lastInfo={...info,...p,shop:safe(()=>D().I.biz.name,"")||"Shop",when:new Date()};
  pending=null;
  $("sxCheckout").classList.add("hidden");
  closeScanner(true);
  sel=null;
  const n=info.items.length;
  let rows='<div><span>Items</span><strong>'+n+"</strong></div>";
  const label={cash:"Cash",mpesa:"M-Pesa",credit:"Credit"}[info.payment]||info.payment;
  rows+='<div><span>Payment</span><strong>'+label+(info.payment==="mpesa"?" ("+(p.mtype==="pochi"?"Pochi":"Till")+")":"")+"</strong></div>";
  if(info.payment==="cash"&&p.received!==null){rows+='<div><span>Received</span><strong>'+money(p.received)+'</strong></div><div class="big"><span>Change</span><strong>'+money(p.change)+"</strong></div>"}
  if(info.payment==="mpesa"){rows+='<div><span>Code</span><strong>'+esc(info.code)+"</strong></div>";if(p.change>0)rows+='<div><span>Overpaid</span><strong>'+money(p.change)+"</strong></div>"}
  if(info.payment==="credit")rows+='<div class="big"><span>'+esc(info.customer)+' owes</span><strong>'+money(info.total)+"</strong></div>";
  else if(info.customer)rows+='<div><span>Customer</span><strong>'+esc(info.customer)+"</strong></div>";
  $("sxDoneTotal").textContent=money(info.total);
  $("sxDoneLines").innerHTML=rows;
  $("sxDone").classList.remove("hidden");
  document.body.classList.add("sx-lock");
  $("sxCashIn").value="";$("sxMpAmt").value="";$("sxMpCode").value="";$("sxCustomer").value="";
  query="";$("sxSearch").value="";$("sxClear").classList.add("hidden");
  setPay("cash");
  try{if(navigator.vibrate)navigator.vibrate([40,30,40])}catch(e){}
}
function receiptText(){
  const i=lastInfo;if(!i)return"";
  const lines=i.items.map(x=>"• "+x.name+" × "+D().num(x.qty)+" = "+money(x.qty*x.price));
  let t=i.shop+"\n"+i.when.toLocaleString("en-KE")+"\n\n"+lines.join("\n");
  if(i.discount>0)t+="\nDiscount: −"+money(i.discount);
  t+="\n\nTOTAL: "+money(i.total)+"\nPaid by: "+({cash:"Cash",mpesa:"M-Pesa "+(i.code||""),credit:"Credit"}[i.payment]||i.payment);
  if(i.payment==="cash"&&i.received!==null)t+="\nReceived: "+money(i.received)+"  Change: "+money(i.change);
  return t+"\n\nThank you!";
}
function share(){
  const t=receiptText();if(!t)return;
  if(navigator.share){navigator.share({text:t}).catch(()=>{});return}
  window.open("https://wa.me/?text="+encodeURIComponent(t),"_blank");
}

/* ---------- scanner ---------- */
const FORMATS=["ean_13","ean_8","upc_a","upc_e","code_128","code_39","code_93","itf","codabar","qr_code","data_matrix"];
const S={stream:null,det:null,zx:null,run:false,mode:"sale",scanType:"barcode",onCode:null,lastCode:"",lastSeen:0,card:null,audio:null,track:null,busyDet:false,ocrWorker:null,returnToQuick:false,inlineQuick:false,quickCameraSeq:0};
const scanAudio={success:null,fail:null,unlocked:false};
function prepareScanSounds(){
  if(!scanAudio.success)scanAudio.success=new Audio("scanner-success.wav");
  if(!scanAudio.fail)scanAudio.fail=new Audio("scanner-fail.wav");
  [scanAudio.success,scanAudio.fail].forEach(a=>{a.preload="auto";a.volume=.82});
  if(scanAudio.unlocked)return;
  // Warm up both sounds during the opening tap so later camera callbacks can play them.
  scanAudio.unlocked=true;
  [scanAudio.success,scanAudio.fail].forEach(a=>{try{a.muted=true;const p=a.play();if(p&&p.then)p.then(()=>{a.pause();a.currentTime=0;a.muted=false}).catch(()=>{a.muted=false})}catch(e){a.muted=false}});
}
function beep(ok){
  try{
    const a=ok?scanAudio.success:scanAudio.fail;
    if(a){a.pause();a.currentTime=0;a.play().catch(()=>{})}
  }catch(e){}
  try{if(navigator.vibrate)navigator.vibrate(ok?35:[55,35,55])}catch(e){}
}
function loadZX(){
  return new Promise((res,rej)=>{
    if(window.ZXing)return res();
    const s=document.createElement("script");s.src="zxing.min.js";s.onload=()=>res();s.onerror=()=>rej(new Error("zxing"));document.head.appendChild(s);
  });
}
async function makeDetector(){
  if("BarcodeDetector"in window){
    try{
      let f=FORMATS;
      if(BarcodeDetector.getSupportedFormats){const sup=await BarcodeDetector.getSupportedFormats();f=FORMATS.filter(x=>sup.includes(x))}
      if(f.length){S.det=new BarcodeDetector({formats:f});S.zx=null;return}
    }catch(e){}
  }
  await loadZX();
  const Z=window.ZXing,h=new Map();
  h.set(Z.DecodeHintType.POSSIBLE_FORMATS,[Z.BarcodeFormat.EAN_13,Z.BarcodeFormat.EAN_8,Z.BarcodeFormat.UPC_A,Z.BarcodeFormat.UPC_E,Z.BarcodeFormat.CODE_128,Z.BarcodeFormat.CODE_39,Z.BarcodeFormat.ITF,Z.BarcodeFormat.QR_CODE]);
  h.set(Z.DecodeHintType.TRY_HARDER,true);
  S.zx=new Z.MultiFormatReader();S.zx.setHints(h);S.det=null;
}
const scanVideo=()=>$(S.inlineQuick?"sxQuickVideo":"sxVideo");
const scanCanvas=()=>$(S.inlineQuick?"sxQuickCanvas":"sxCanvas");
const scanCard=()=>$(S.inlineQuick?"sxQuickScanCard":"sxScanCard");
const scanHint=()=>$(S.inlineQuick?"sxQuickScanHint":"sxScanHint");
const scanTextButton=()=>$(S.inlineQuick?"sxQuickTextCapture":"sxTextCapture");
async function detect(){
  const v=scanVideo();
  if(!v.videoWidth)return null;
  if(S.det){const r=await S.det.detect(v);return r&&r.length?r[0].rawValue:null}
  const c=scanCanvas(),w=Math.min(v.videoWidth,960),h=Math.round(v.videoHeight*w/v.videoWidth);
  c.width=w;c.height=h;
  const x=c.getContext("2d",{willReadFrequently:true});x.drawImage(v,0,0,w,h);
  const Z=window.ZXing;
  try{
    const bmp=new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(c)));
    return S.zx.decode(bmp).getText();
  }catch(e){return null}
}
async function loop(){
  if(!S.run)return;
  if(!S.busyDet){
    S.busyDet=true;
    try{
      if(S.scanType==="text")await liveText();
      const code=S.scanType==="barcode"?await detect():null;
      if(S.run){
        const now=Date.now();
        if(code){
          const value=String(code).trim();
          S.lastSeen=now;
          if(value&&value!==S.lastCode){S.lastCode=value;onCode(value)}
        }else if(S.lastCode&&now-S.lastSeen>1000){
          // The code must leave the camera view before it can be scanned again.
          S.lastCode="";
        }
      }
    }catch(e){}
    S.busyDet=false;
  }
  if(S.run)setTimeout(loop,S.zx?180:120);
}
async function openScanner(mode,cb){
  S.inlineQuick=false;S.mode=mode||"sale";S.onCode=cb||null;S.card=null;S.lastCode="";S.scanType="barcode";
  const sc=$("sxScanner");
  sc.classList.remove("hidden");sc.dataset.mode=S.mode;
  document.body.classList.add("sx-lock");
  $("sxScanCard").classList.add("hidden");
  scanHint().textContent="Starting camera…";
  $("sxScanCart").classList.toggle("hidden",S.mode!=="sale");
  $("sxScanClose").textContent=S.mode==="sale"?"✓ Done":"✕ Cancel";
  $("sxManualIn").value="";
  prepareScanSounds();
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
    scanHint().textContent="This browser can't open the camera here. Type the code below.";return}
  try{
    S.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}},audio:false});
  }catch(e){
    scanHint().textContent=(e&&e.name==="NotAllowedError")?"Camera is blocked. Allow the camera for this site in your browser settings, or type the code below.":"Could not start the camera. You can still type the code below.";
    return;
  }
  const v=$("sxVideo");v.srcObject=S.stream;
  try{await v.play()}catch(e){}
  S.track=S.stream.getVideoTracks()[0];
  const caps=safe(()=>S.track.getCapabilities(),{});
  $("sxTorch").classList.toggle("hidden",!(caps&&caps.torch));
  try{await makeDetector()}catch(e){scanHint().textContent="Scanner could not load. Type the code below.";return}
  S.run=true;
  scanHint().textContent=S.mode==="sale"?"Point at a barcode or QR code":"Scan the product's barcode";
  setScanType("barcode");loop();
}
async function getSalesOcrWorker(){
  if(S.ocrWorker)return S.ocrWorker;
  if(!window.Tesseract){await new Promise((resolve,reject)=>{const sc=document.createElement("script");sc.src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";sc.onload=resolve;sc.onerror=()=>reject(new Error("Text recognition library could not load"));document.head.appendChild(sc)})}
  const w=await window.Tesseract.createWorker("eng");
  try{await w.setParameters({tessedit_pageseg_mode:window.Tesseract.PSM.SPARSE_TEXT,tessedit_char_whitelist:window.YeetuOCR.CHARS,preserve_interword_spaces:"1"})}catch(e){}
  S.ocrWorker=w;return S.ocrWorker;
}
/* ---------- live text scan: auto-reads while you hold steady, outlines the text, searches word by word ---------- */
const CROP={x:.04,y:.12,w:.92,h:.64};
const LT={last:0,prev:null,mc:null,topId:null,streak:0,shownId:null,goodAt:0};
function isMoving(v){
  try{
    if(!LT.mc){LT.mc=document.createElement("canvas");LT.mc.width=LT.mc.height=24}
    const x=LT.mc.getContext("2d",{willReadFrequently:true});
    x.drawImage(v,0,0,24,24);
    const d=x.getImageData(0,0,24,24).data,cur=new Uint8Array(576);
    for(let i=0,j=0;i<d.length;i+=4,j++)cur[j]=(d[i]*77+d[i+1]*150+d[i+2]*29)>>8;
    const prev=LT.prev;LT.prev=cur;
    if(!prev)return true;
    let s=0;for(let j=0;j<576;j++)s+=Math.abs(cur[j]-prev[j]);
    return s/576>9;
  }catch(e){return false}
}
function trackEl(v){
  const p=v.parentElement;let el=p.querySelector(".sx-track");
  if(!el){el=document.createElement("div");el.className="sx-track";p.appendChild(el)}
  return el;
}
function hideTrack(){document.querySelectorAll(".sx-track").forEach(e=>e.classList.remove("on","hit"))}
function trackBox(v,b,hit){
  const el=trackEl(v);
  if(!b){el.classList.remove("on","hit");return}
  const cw=v.clientWidth,ch=v.clientHeight,vw=v.videoWidth,vh=v.videoHeight;
  const k=Math.max(cw/vw,ch/vh),ox=(cw-vw*k)/2,oy=(ch-vh*k)/2,pad=8;
  const l=Math.max(0,b.x0*k+ox-pad),t=Math.max(0,b.y0*k+oy-pad),r=Math.min(cw,b.x1*k+ox+pad),bt=Math.min(ch,b.y1*k+oy+pad);
  el.style.left=(v.offsetLeft+l)+"px";el.style.top=(v.offsetTop+t)+"px";
  el.style.width=Math.max(0,r-l)+"px";el.style.height=Math.max(0,bt-t)+"px";
  el.classList.add("on");el.classList.toggle("hit",!!hit);
}
async function scanFrame(v,crop,minConf){
  const OCR=window.YeetuOCR,prep=OCR.prepare(v,v.videoWidth,v.videoHeight,crop,1100);
  const worker=await getSalesOcrWorker();
  const result=await worker.recognize(prep.canvas);
  return {words:OCR.cleanWords(result,minConf),prep};
}
async function liveText(){
  const v=scanVideo(),now=Date.now();
  if(!v||!v.videoWidth||!window.YeetuOCR||now-LT.last<350)return;
  LT.last=now;
  if(isMoving(v)){if(!LT.shownId)scanHint().textContent="Hold steady…";return}
  const OCR=window.YeetuOCR,{words,prep}=await scanFrame(v,CROP,60);
  if(!S.run||S.scanType!=="text")return;
  const hits=OCR.match(products(),words.map(w=>w.t),2.5);
  trackBox(v,words.length?OCR.box(words,prep):null,hits.length>0);
  if(hits.length){
    LT.goodAt=now;const id=hits[0].p.id;
    LT.streak=LT.topId===id?LT.streak+1:1;LT.topId=id;
    // Same best match in 2 frames in a row = real, not a one-frame fluke.
    if(LT.streak>=2&&LT.shownId!==id){LT.shownId=id;beep(true);showTextMatches(words.map(w=>w.t).join(" "),hits.map(h=>h.p))}
  }else{
    LT.streak=0;LT.topId=null;
    if(now-LT.goodAt>2500){LT.shownId=null;scanHint().textContent=words.length?"Reading… no product matched yet":"Point at the product name"}
  }
}
function setScanType(type){
  hideTrack();LT.shownId=null;LT.topId=null;LT.streak=0;LT.prev=null;
  S.scanType=type;
  document.querySelectorAll("[data-sx-mode]").forEach(b=>b.classList.toggle("active",b.dataset.sxMode===type));
  const quickModes=document.querySelectorAll("[data-quick-mode]");
  quickModes.forEach(b=>b.classList.toggle("active",b.dataset.quickMode===type));
  scanTextButton().classList.toggle("hidden",type!=="text");
  const frame=$(S.inlineQuick?"sxQuickFrame":"sxFrame");
  if(frame)frame.classList.toggle("text-frame",type==="text");
  scanHint().textContent=type==="barcode"?"Point the camera at a barcode · it keeps scanning":"Hold steady on the product name · it reads automatically";
}
async function readSalesText(){
  const v=scanVideo(),btn=scanTextButton(),hint=scanHint();
  if(!v.videoWidth){hint.textContent="Camera is not ready yet. Wait a moment.";return}
  btn.disabled=true;btn.textContent="Reading text…";hint.textContent="Reading the package…";
  try{
    const OCR=window.YeetuOCR,{words,prep}=await scanFrame(v,{x:0,y:0,w:1,h:1},45);
    if(!words.length){beep(false);hint.textContent="No clear words found. Move closer, hold steady and try again.";return}
    const hits=OCR.match(products(),words.map(w=>w.t),1.2).map(h=>h.p);
    trackBox(v,OCR.box(words,prep),hits.length>0);
    beep(hits.length>0);showTextMatches(words.map(w=>w.t).join(" "),hits);
  }catch(e){beep(false);hint.textContent="Text scan could not run: "+(e.message||"try again")}
  finally{btn.disabled=false;btn.textContent="Read product text"}
}
function showTextMatches(raw,hits){
  const el=scanCard();el.classList.remove("hidden");
  const terms=raw.split(/\s+/).filter(x=>x.length>2).slice(0,12).join(" · ");
  el.innerHTML='<div class="sx-sc-name">Text detected</div><div class="sx-sc-sub">'+esc(terms)+'</div><div class="sx-text-hits">'+(hits.length?hits.map(p=>'<button type="button" data-sx="textPick" data-id="'+esc(p.id)+'"><span>'+esc(p.name)+'<small>'+esc([p.brand,p.variantLabel||p.variant,p.packSize].filter(Boolean).join(" · "))+'</small></span><strong>'+money(D().price(p))+'</strong></button>').join(""):'<p class="sx-note">No matching product found. Try fewer words or use search below.</p>')+'</div>';
  scanHint().textContent=hits.length?hits.length+" possible product match(es) — choose the correct one":"Text read, but no product matched";
}
function stopCamera(){
  S.run=false;hideTrack();
  if(S.stream){S.stream.getTracks().forEach(t=>t.stop());S.stream=null}
  const v=scanVideo();if(v)v.srcObject=null;
}
function closeScanner(skipCommit){
  if(S.card&&S.card.type==="product"&&!skipCommit)commitCard(true);
  S.card=null;
  stopCamera();S.inlineQuick=false;
  $("sxScanner").classList.add("hidden");
  $("sxScanCard").classList.add("hidden");
  const reopenQuick=S.returnToQuick;S.returnToQuick=false;
  if($("sxCheckout").classList.contains("hidden")&&$("sxDone").classList.contains("hidden"))document.body.classList.remove("sx-lock");
  if(reopenQuick&&!document.hidden)setTimeout(openQuickSale,90);
}
function onCode(code){
  if(S.mode==="pick"){const cb=S.onCode;beep(true);closeScanner(true);if(cb)cb(code);return}
  handleCode(code);
}
function handleCode(code){
  const p=findByCode(code);
  if(p){
    beep(true);
    if(S.card&&S.card.type==="product"){
      if(S.card.pid===p.id){S.card.qty=D().round(S.card.qty+1);drawCard();return}
      // Replace the pending suggestion; only the green tick confirms a sale line.
    }
    S.card={type:"product",pid:p.id,qty:1};drawCard();
  }else{
    beep(false);
    S.card={type:"unknown",code:String(code),q:"",link:false};drawCard();
  }
}
function commitCard(quiet){
  const c=S.card;if(!c||c.type!=="product")return true;
  const p=products().find(x=>x.id===c.pid);
  if(!p){S.card=null;drawCard();return true}
  const ok=addToCart(c.pid,c.qty);
  if(ok){S.card=null;drawCard();if(!quiet)D().toast("Added "+p.name,1200);return true}
  return false;
}
function drawCard(){
  const el=scanCard(),c=S.card;
  if(!c){el.classList.add("hidden");el.innerHTML="";scanHint().textContent="Point at the next barcode";return}
  el.classList.remove("hidden");
  const d=D();
  if(c.type==="product"){
    const p=products().find(x=>x.id===c.pid);if(!p){S.card=null;return drawCard()}
    const inc=cartQty(p.id);
    el.innerHTML='<div class="sx-sc-top"><div class="sx-sc-name">'+esc(p.name)+(d.offer(p)?' <span class="tag offer">OFFER</span>':"")+(d.expired(p)?' <span class="tag bad">EXPIRED</span>':"")+'</div><div class="sx-sc-price">'+money(d.price(p))+'</div></div>'+
      '<div class="sx-sc-sub">'+stockTag(p)+(inc?' <span class="sx-inc">×'+esc(d.num(inc))+' already in cart</span>':"")+'</div>'+
      '<div class="sx-sc-act"><div class="sx-step"><button type="button" data-sx="sqm" aria-label="Less">−</button><input id="sxScQty" type="number" min="0" step="any" inputmode="decimal" value="'+esc(c.qty)+'"><button type="button" data-sx="sqp" aria-label="More">+</button></div><button type="button" class="sx-tick-btn big" data-sx="scAdd" aria-label="Add to cart">✓</button></div>'+
      '<p class="sx-sc-tip">Check the product and tap ✓ to confirm. The camera keeps scanning.</p>';
    scanHint().textContent="Scanned ✓";
  }else if(!c.link){
    el.innerHTML='<div class="sx-sc-top"><div class="sx-sc-name">Not in your products</div></div><div class="sx-sc-sub"><code>'+esc(c.code)+'</code></div>'+
      '<div class="sx-sc-act">'+(d.owner()?'<button type="button" class="sx-complete" data-sx="scLink">Link to a product</button>':'<span class="sx-note">Ask the owner to add this barcode.</span>')+'<button type="button" class="sx-ghost" data-sx="scDismiss">Dismiss</button></div>';
    scanHint().textContent="Barcode not found";
  }else{
    const hits=search(c.q).slice(0,5);
    el.innerHTML='<div class="sx-sc-top"><div class="sx-sc-name">Link <code>'+esc(c.code)+'</code> to…</div></div>'+
      '<input id="sxLinkQ" class="sx-linkq" placeholder="Search product name" value="'+esc(c.q)+'" autocomplete="off">'+
      '<div class="sx-linkres">'+hits.map(p=>'<button type="button" data-sx="scLinkPick" data-id="'+esc(p.id)+'"><span>'+esc(p.name)+'</span><small>'+money(d.price(p))+(p.barcode?" · has barcode":"")+'</small></button>').join("")+(hits.length?"":'<div class="sx-note">No match</div>')+'</div>'+
      '<div class="sx-sc-act"><button type="button" class="sx-ghost" data-sx="scDismiss">Cancel</button></div>';
  }
}
function linkBarcode(pid,code){
  const d=D();
  if(!d.owner()||!d.active())return;
  if(products().some(p=>p.barcode===code&&p.id!==pid)){d.toast("That barcode already belongs to another product");return}
  const p=products().find(x=>x.id===pid);if(!p)return;
  p.barcode=code; // show it right away; the write below makes it permanent
  d.write([{op:"update",path:d.path("products",pid),data:{barcode:code}}],"Link barcode "+p.name);
  d.toast("Barcode linked to "+p.name,2000);
  S.card={type:"product",pid:pid,qty:1};drawCard();renderList();
}

/* ---------- events ---------- */
function onClick(e){
  const t=e.target.closest("[data-sx]");
  if(!t){
    const row=e.target.closest(".sx-row");
    if(row&&!e.target.closest(".sx-pick")){
      const id=row.dataset.id;sel=sel===id?null:id;selQty=1;renderList();
      if(sel){const inp=$("sxQtyIn");if(inp){inp.focus();inp.select()}}
    }
    return;
  }
  const a=t.dataset.sx,d=D();
  switch(a){
    case"qm":case"qp":{const inp=$("sxQtyIn");let v=Number(inp.value)||0;v=a==="qp"?v+1:Math.max(0,v-1);inp.value=d.round(v);selQty=d.round(v);break}
    case"addSel":{
      const inp=$("sxQtyIn"),q=Number(inp.value);
      if(!(q>0)){d.toast("Enter a valid quantity");break}
      const p=products().find(x=>x.id===sel),nm=p?p.name:"";
      if(addToCart(sel,q)){sel=null;selQty=1;d.toast("Added "+nm,1200);inp.blur();renderList()}
      break}
    case"closeCheckout":closeCheckout();break;
    case"pay":setPay(t.dataset.pay);break;
    case"mtype":mtype=t.dataset.mtype;document.querySelectorAll('#sxCheckout [data-sx="mtype"]').forEach(b=>b.classList.toggle("active",b===t));break;
    case"quick":$("sxCashIn").value=t.dataset.v;updatePay();break;
    case"cm":{const c=d.cart()[+t.dataset.i];if(c)setCartQty(+t.dataset.i,c.qty-1);break}
    case"cp":{const c=d.cart()[+t.dataset.i];if(c)setCartQty(+t.dataset.i,c.qty+1);break}
    case"rm":d.cart().splice(+t.dataset.i,1);d.refresh();break;
    case"sqm":case"sqp":{if(S.card&&S.card.type==="product"){const inp=$("sxScQty");let v=Number(inp.value)||0;v=a==="sqp"?v+1:Math.max(0,v-1);S.card.qty=d.round(v);inp.value=S.card.qty}break}
    case"scAdd":{if(S.card&&S.card.type==="product"){const v=Number($("sxScQty").value);if(!(v>0)){d.toast("Enter a valid quantity");break}S.card.qty=v;commitCard(false)}break}
    case"scDismiss":S.card=null;drawCard();break;
    case"scLink":S.card.link=true;drawCard();{const q=$("sxLinkQ");if(q)q.focus()}break;
    case"scLinkPick":linkBarcode(t.dataset.id,S.card.code);break;
    case"textPick":{const p=products().find(x=>x.id===t.dataset.id);if(p&&addToCart(p.id,1)){D().toast("Added "+p.name,1200);scanCard().classList.add("hidden");scanHint().textContent="Added. Read another product.";renderQuickCart()}break;}
    case"quickMinus":{const i=+t.dataset.i,c=d.cart()[i];if(c)setCartQty(i,c.qty-1);break}
    case"quickPlus":{const i=+t.dataset.i,c=d.cart()[i];if(c)setCartQty(i,c.qty+1);break}
    case"quickRemove":d.cart().splice(+t.dataset.i,1);d.refresh();break;
    case"closeQuick":closeQuickSale();break;
  }
}
function renderQuickResults(){
  const q=$("sxQuickSearch").value.trim(),hits=q?search(q).slice(0,10):[];
  const el=$("sxQuickResults");
  el.classList.toggle("hidden",S.quickMode==="manual"||(!q&&S.quickMode!=="search"));
  el.innerHTML=hits.map(p=>{
    const meta=[p.brand,p.variantLabel||p.variant,p.packSize].filter(Boolean).join(" · ");
    const icon=p.imageUrl?'<img src="'+esc(p.imageUrl)+'" alt="">':'📦';
    return '<div class="sx-quick-result"><div class="sx-qr-icon">'+icon+'</div><div class="sx-qr-info"><strong>'+esc(p.name)+'</strong><small>'+esc(meta||p.category||"Product")+'</small><span>'+stockTag(p)+'</span></div><strong class="sx-qr-price">'+money(D().price(p))+'</strong><button type="button" class="sx-qr-add" data-quick-add="'+esc(p.id)+'" aria-label="Add '+esc(p.name)+'">✓</button></div>';
  }).join("")||(q?'<div class="sx-note">No match found. Try another name or use Manual.</div>':'<div class="sx-quick-search-hint">Type a few letters to find a product, or use the camera above.</div>');
}
function renderQuickCart(){
  if(!$("sxQuickCartCount"))return;
  const cart=D().cart(),units=cart.reduce((n,x)=>n+(Number(x.qty)||0),0);
  $("sxQuickCartCount").textContent=cart.length+" line"+(cart.length===1?"":"s")+" · "+D().num(D().round(units))+" items";
  $("sxQuickCartTotal").textContent=money(grandTotal());
  $("sxQuickDone").disabled=!cart.length;
  $("sxQuickLines").innerHTML=cart.length?cart.map((c,i)=>{
    const info=c.custom?"Manual amount" : money(c.price)+" each";
    return '<div class="sx-quick-line"><div class="sx-quick-line-main"><strong>'+esc(c.name)+'</strong><small>'+info+(c.custom&&c.note?' · '+esc(c.note):'')+'</small></div><div class="sx-quick-qty"><button type="button" data-sx="quickMinus" data-i="'+i+'" aria-label="Decrease quantity">−</button><span>'+esc(D().num(c.qty))+'</span><button type="button" data-sx="quickPlus" data-i="'+i+'" aria-label="Increase quantity">＋</button></div><strong class="sx-quick-line-total">'+money(c.qty*c.price)+'</strong><button type="button" class="sx-quick-remove" data-sx="quickRemove" data-i="'+i+'" aria-label="Remove item">×</button></div>';
  }).join(""):'<div class="sx-quick-empty">Your confirmed items will appear here.</div>';
}
function openQuickSale(){
  prepareScanSounds();
  S.inlineQuick=true;S.mode="quick";S.quickMode="barcode";S.returnToQuick=false;S.card=null;S.lastCode="";S.lastSeen=0;
  $("sxQuickModal").classList.remove("hidden");document.body.classList.add("sx-lock");
  $("sxQuickSearch").value="";renderQuickResults();renderQuickCart();
  $("sxQuickManual").classList.add("hidden");$("sxQuickCamera").classList.remove("hidden");
  setQuickMode("barcode");
}
function closeQuickSale(){
  // An unconfirmed scan is only a suggestion; it is never silently added.
  S.quickCameraSeq++;S.card=null;scanCard().classList.add("hidden");stopCamera();
  $("sxQuickModal").classList.add("hidden");
  if($("sxCheckout").classList.contains("hidden")&&$("sxScanner").classList.contains("hidden")&&$("sxDone").classList.contains("hidden"))document.body.classList.remove("sx-lock");
}
async function startQuickCamera(){
  S.inlineQuick=true;S.mode="quick";
  if(S.run&&S.stream)return;
  const cameraSeq=++S.quickCameraSeq;
  S.lastCode="";S.lastSeen=0;
  const hint=scanHint();hint.textContent="Starting camera…";
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){hint.textContent="Camera unavailable here. Use search below.";return}
  try{
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}},audio:false});
    if(cameraSeq!==S.quickCameraSeq||$("sxQuickModal").classList.contains("hidden")||!(S.quickMode==="barcode"||S.quickMode==="text")){
      // Mode changed while the permission prompt was open; release the unused camera.
      stream.getTracks().forEach(t=>t.stop());
      return;
    }
    S.stream=stream;
    const v=scanVideo();v.srcObject=S.stream;try{await v.play()}catch(e){}
    S.track=S.stream.getVideoTracks()[0];
    await makeDetector();
    if(cameraSeq!==S.quickCameraSeq){stopCamera();return}
    S.run=true;hint.textContent=S.scanType==="barcode"?"Point at a barcode · scan confirms only when you tap ✓":"Point at the product label and read its text";
    loop();
  }catch(e){
    if(cameraSeq!==S.quickCameraSeq)return;
    stopCamera();
    hint.textContent=e&&e.name==="NotAllowedError"?"Camera permission denied. Allow camera access or search below.":"Could not start camera. Search below instead.";
  }
}
function setQuickMode(mode){
  S.quickMode=mode;
  document.querySelectorAll("[data-quick-mode]").forEach(b=>b.classList.toggle("active",b.dataset.quickMode===mode));
  const camera=$("sxQuickCamera"),manual=$("sxQuickManual"),footer=$("sxQuickCameraFooter");
  const useCamera=mode==="barcode"||mode==="text";
  camera.classList.toggle("hidden",!useCamera);
  footer.classList.toggle("hidden",!useCamera);
  manual.classList.toggle("hidden",mode!=="manual");
  renderQuickResults();
  if(useCamera){
    setScanType(mode);
    if(!S.run)startQuickCamera();
    else scanHint().textContent=mode==="barcode"?"Point at a barcode · tap ✓ to confirm each product":"Point at the product label, then tap Read product text";
  }else{
    S.quickCameraSeq++;stopCamera();S.inlineQuick=true;
    if(mode==="search"){$("sxQuickSearch").focus();renderQuickResults()}
    if(mode==="manual")$("sxCustomName").focus();
  }
}
function addCustomAmount(){
  const name=$("sxCustomName").value.trim(),amount=Number($("sxCustomAmount").value),note=$("sxCustomNote").value.trim();
  if(!name){D().toast("Enter what the customer is buying");$("sxCustomName").focus();return}
  if(!Number.isFinite(amount)||amount<=0){D().toast("Enter a valid amount");$("sxCustomAmount").focus();return}
  if(D().cart().length>=D().maxItems()){D().toast("Complete this sale before adding more different items");return}
  D().cart().push({pid:"custom_"+Date.now()+"_"+Math.random().toString(36).slice(2,7),name,qty:1,price:Math.round(amount*100)/100,regular:Math.round(amount*100)/100,offer:false,category:"Custom",custom:true,note});
  D().refresh();$("sxCustomName").value="";$("sxCustomAmount").value="";$("sxCustomNote").value="";renderQuickCart();D().toast("Manual product added");
}
function init(){
  if(!$("sale")||!D())return;
  // overlays live outside the Sales page so they also work from the Products page
  ["sxCheckout","sxScanner","sxDone","sxQuickModal"].forEach(id=>document.body.appendChild($(id)));
  D().onRender=()=>{renderList();renderBar();renderCheckout();if(S.card&&S.card.type==="product")drawCard();if(!$("sxQuickModal").classList.contains("hidden"))renderQuickCart()};
  D().onSale=onSale;
  $("sxSearch").addEventListener("input",e=>{query=e.target.value;$("sxClear").classList.toggle("hidden",!query);sel=null;renderList()});
  $("sxSearch").addEventListener("keydown",e=>{
    if(e.key!=="Enter")return;
    e.preventDefault();
    const q=e.target.value.trim();if(!q)return;
    const exact=products().find(p=>p.barcode&&(String(p.barcode)===q||norm(p.barcode)===norm(q)));
    if(exact){if(addToCart(exact.id,1)){D().toast("Added "+exact.name,1200);query="";e.target.value="";$("sxClear").classList.add("hidden");renderList()}return}
    const hits=search(q);
    if(hits.length===1){sel=hits[0].id;selQty=1;renderList();const i=$("sxQtyIn");if(i){i.focus();i.select()}}
    else e.target.blur();
  });
  $("sxClear").addEventListener("click",()=>{query="";$("sxSearch").value="";$("sxClear").classList.add("hidden");sel=null;renderList();$("sxSearch").focus()});
  $("sxScanBtn").addEventListener("click",()=>{if(window.AndroidBridge&&AndroidBridge.openScanner){AndroidBridge.openScanner();return}openScanner("sale")});
  document.querySelectorAll("[data-sx-mode]").forEach(b=>b.addEventListener("click",()=>setScanType(b.dataset.sxMode)));
  $("sxTextCapture").addEventListener("click",readSalesText);
  $("sxQuickSearch").addEventListener("input",renderQuickResults);
  $("sxQuickClear").addEventListener("click",()=>{$("sxQuickSearch").value="";renderQuickResults();$("sxQuickSearch").focus()});
  $("sxQuickResults").addEventListener("click",e=>{const b=e.target.closest("[data-quick-add]");if(!b)return;const p=products().find(x=>x.id===b.dataset.quickAdd);if(p&&addToCart(p.id,1)){D().toast("Added "+p.name,1000);$("sxQuickSearch").value="";renderQuickResults();renderQuickCart()}});
  $("sxCustomAdd").addEventListener("click",addCustomAmount);
  $("sxCustomAmount").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();addCustomAmount()}});
  $("sxQuickDone").addEventListener("click",()=>{if(!D().cart().length){D().toast("Cart is empty");return}closeQuickSale();openCheckout()});
  document.querySelectorAll("[data-quick-mode]").forEach(b=>b.addEventListener("click",()=>setQuickMode(b.dataset.quickMode)));
  $("sxQuickTextCapture").addEventListener("click",readSalesText);
  $("sxCheckoutBtn").addEventListener("click",openCheckout);
  $("sxComplete").addEventListener("click",complete);
  $("sxCashIn").addEventListener("input",updatePay);
  $("sxMpAmt").addEventListener("input",updatePay);
  $("sxNew").addEventListener("click",()=>{$("sxDone").classList.add("hidden");document.body.classList.remove("sx-lock");renderList();renderBar();if(window.AndroidBridge&&AndroidBridge.saleDone)AndroidBridge.saleDone()});
  $("sxShare").addEventListener("click",share);
  document.addEventListener("click",e=>{if(e.target.closest("#sale,#sxCheckout,#sxScanner,#sxQuickModal"))onClick(e)});
  document.addEventListener("input",e=>{
    if(e.target.id==="sxQtyIn")selQty=Number(e.target.value)||0;
    else if(e.target.id==="sxScQty"&&S.card)S.card.qty=Number(e.target.value)||0;
    else if(e.target.id==="sxLinkQ"&&S.card){S.card.q=e.target.value;const pos=e.target.selectionStart;drawCard();const q=$("sxLinkQ");if(q){q.focus();q.setSelectionRange(pos,pos)}}
    else if(e.target.id==="sxManualIn"){const q=e.target.value.trim();if(q.length>=2){const hits=search(q).slice(0,6);const el=$("sxScanCard");el.classList.remove("hidden");el.innerHTML=hits.map(p=>'<button type="button" class="sx-manual-hit" data-sx="textPick" data-id="'+esc(p.id)+'"><span>'+esc(p.name)+'</span><strong>'+money(D().price(p))+'</strong></button>').join("")||'<div class="sx-note">No product match. Use custom amount in Quick Sale.</div>'}}
  });
  document.addEventListener("focusout",e=>{if(e.target.id==="sxQtyIn"&&dirty)setTimeout(renderList,0)});
  // tapping the camera area adds the scanned item and keeps scanning
  $("sxScanTap").addEventListener("click",()=>{if(S.card&&S.card.type==="product")commitCard(false);else if(S.card){S.card=null;drawCard()}});
  $("sxScanClose").addEventListener("click",()=>closeScanner(false));
  $("sxTorch").addEventListener("click",async()=>{try{S.torch=!S.torch;await S.track.applyConstraints({advanced:[{torch:S.torch}]});$("sxTorch").classList.toggle("on",S.torch)}catch(e){}});
  $("sxManual").addEventListener("submit",e=>{
    e.preventDefault();const v=$("sxManualIn").value.trim();if(!v)return;
    if(S.mode==="pick"){const cb=S.onCode;closeScanner(true);if(cb)cb(v);return}
    const p=findByCode(v);
    if(p){handleCode(v);$("sxManualIn").value="";return}
    const hits=search(v);
    if(hits.length===1){handleCode(hits[0].id);$("sxManualIn").value=""}
    else if(hits.length>1){closeScanner(false);query=v;$("sxSearch").value=v;$("sxClear").classList.remove("hidden");renderList();window.scrollTo(0,0)}
    else handleCode(v);
  });
  // A-Z rail: tap or slide
  const rail=$("sxRail");let dragging=false,lastL="";
  const go=y=>{const L=railAt(y);if(L!==lastL){lastL=L;if(jumpTo(L))bubble(L)}};
  rail.addEventListener("pointerdown",e=>{dragging=true;lastL="";try{rail.setPointerCapture(e.pointerId)}catch(x){}go(e.clientY);e.preventDefault()});
  rail.addEventListener("pointermove",e=>{if(dragging)go(e.clientY)});
  const end=()=>{dragging=false};
  rail.addEventListener("pointerup",end);rail.addEventListener("pointercancel",end);
  // barcode field on the product form
  const pb=$("pBarcodeScan");
  if(pb)pb.addEventListener("click",()=>openScanner("pick",code=>{$("pBarcode").value=code;D().toast("Barcode filled in",1500)}));
  // hide quick-action button + bar when not on Sales
  const sale=$("sale");
  new MutationObserver(()=>{document.body.classList.toggle("on-sale",sale.classList.contains("active"));renderBar()}).observe(sale,{attributes:true,attributeFilter:["class"]});
  document.addEventListener("visibilitychange",()=>{
    if(document.hidden&&S.run){
      if(S.inlineQuick){S.card=null;scanCard().classList.add("hidden");stopCamera();scanHint().textContent="Camera paused. Tap Barcode or Text scan to resume."}
      else closeScanner(false);
    }
  });
  window.addEventListener("pagehide",stopCamera);
  window.addEventListener("keydown",e=>{if(e.key==="Escape"){closeMoreMenu();if(!$("sxScanner").classList.contains("hidden"))closeScanner(false);else if(!$("sxCheckout").classList.contains("hidden"))closeCheckout();else if(!$("sxQuickModal").classList.contains("hidden"))closeQuickSale()}});
  // quick-sale: floating panel (?quick=1), scanner launch (?scan=1) and the in-app shortcut button
  const qp=new URLSearchParams(location.search),quick=qp.get("quick")==="1",autoScan=qp.get("scan")==="1";
  if(quick)document.body.classList.add("quick");
  const goSale=()=>{const b=document.querySelector('.nav-btn[data-page="sale"]');if(b)b.click()};
  const afterLogin=fn=>{let n=0;const t=setInterval(()=>{n++;const a=$("screen-app");if(a&&!a.classList.contains("hidden")){clearInterval(t);setTimeout(fn,500)}else if(n>240)clearInterval(t)},500)};
  const click=sel=>{const el=document.querySelector(sel);if(el)el.click()};
  window.dukaCloseAll=()=>{
    const open=id=>{const e=$(id);return e&&!e.classList.contains("hidden")};
    if(open("sxScanner"))closeScanner(false);
    if(open("sxCheckout"))closeCheckout();
    if(open("sxQuickModal"))closeQuickSale();
    if(open("sheet"))document.querySelector("#sheet .sheet-backdrop")?.click();
    if(open("calculatorModal"))click("[data-calculator-close]");
  };
  window.dukaGo=page=>{
    if(quick)window.dukaCloseAll();
    if(page==="quicksale"||(page==="sale"&&quick))openQuickSale();
    else if(page==="expense")click('[data-act="fabExpense"]');
    else if(page==="delivery")click('[data-act="fabDelivery"]');
    else if(page==="products")click('.nav-btn[data-page="products"]');
    else if(page==="dashboard")click('.nav-btn[data-page="dashboard"]');
    else if(page==="calculator")click("[data-calculator-open]");
    else goSale();
  };
  // Back button: close the top-most modal first. Returns true when something was closed.
  window.dukaBack=()=>{
    const open=id=>{const e=$(id);return e&&!e.classList.contains("hidden")};
    if(open("sxScanner")){closeScanner(false);return true}
    if(open("sxCheckout")){closeCheckout();return true}
    if(open("sxDone")){$("sxNew").click();return true}
    if(open("sxQuickModal")){closeQuickSale();return true}
    if(open("sheet")){document.querySelector("#sheet .sheet-backdrop")?.click();return true}
    if(open("calculatorModal")){click("[data-calculator-close]");return true}
    return false};
  // Floating tool window: when its modal closes, hand control back to Android so the window goes away.
  if(quick&&window.AndroidBridge&&AndroidBridge.close){
    const ids=["sxQuickModal","sxCheckout","sxScanner","sxDone","sheet","calculatorModal"];
    let seen=false,t=null;
    const anyOpen=()=>ids.some(id=>{const e=$(id);return e&&!e.classList.contains("hidden")});
    const check=()=>{clearTimeout(t);if(anyOpen()){seen=true}else if(seen){t=setTimeout(()=>{if(!anyOpen()){seen=false;AndroidBridge.close()}},250)}};
    ids.forEach(id=>{const e=$(id);if(e)new MutationObserver(check).observe(e,{attributes:true,attributeFilter:["class"]})});
  }
  const goPage=qp.get("go")||(quick?"quicksale":"");
  if(quick||autoScan||qp.get("go"))afterLogin(()=>{window.dukaGo(goPage||"quicksale");if(autoScan)setTimeout(()=>openScanner("sale"),400)});
  const qb=$("quickSaleBtn");if(qb)qb.addEventListener("click",openQuickSale);
  document.addEventListener("click",e=>{
    if(e.target.closest("[data-quick-open]")){e.preventDefault();const fab=$("fab");if(fab){fab.classList.remove("open");$("fabBtn")?.setAttribute("aria-expanded","false")}closeMoreMenu();openQuickSale();}
    if(e.target.closest("[data-fab-action=product]")){const fab=$("fab");if(fab)fab.classList.remove("open");$("fabBtn")?.setAttribute("aria-expanded","false");const add=$("addProductBtn");if(add)add.click();}
    if(e.target.closest("[data-more-close]")||e.target.closest(".more-nav-link")||e.target.closest("#moreMenu [data-act]"))closeMoreMenu();
  });
  const moreBtn=$("moreNavBtn"),moreMenu=$("moreMenu");
  function closeMoreMenu(){if(moreMenu)moreMenu.classList.add("hidden");if(moreBtn)moreBtn.setAttribute("aria-expanded","false")}
  if(moreBtn&&moreMenu)moreBtn.addEventListener("click",()=>{const open=moreMenu.classList.contains("hidden");moreMenu.classList.toggle("hidden",!open);moreBtn.setAttribute("aria-expanded",open?"true":"false")});
  const overflowPages=["customers","suppliers","badstock","team"];
  const syncMoreActive=()=>{if(moreBtn)moreBtn.classList.toggle("active",overflowPages.some(id=>$(id)?.classList.contains("active")))};
  new MutationObserver(syncMoreActive).observe(document.querySelector("main"),{subtree:true,attributes:true,attributeFilter:["class"]});
  syncMoreActive();
  window.openDukaQuickSale=openQuickSale;
  buildView();
  $("sxView")&&$("sxView").addEventListener("click",e=>{const b=e.target.closest("[data-v]");if(b)setView(b.dataset.v)});
  let rz=0;window.addEventListener("resize",()=>{clearTimeout(rz);rz=setTimeout(()=>{buildView();renderList()},150)});
  renderList();renderBar();
  window.DUKA.salesUI={search,findByCode,openScanner,openQuickSale,handleCode,state:()=>({sel,query,pay,card:S.card})};
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
