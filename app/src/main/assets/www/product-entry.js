/* Duka Product Builder
 * Simple products + multi-variant product families, shared recognition and catalogue search.
 * Uses the existing DUKA Firestore adapter; no authentication changes.
 */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const D = () => window.DUKA;
  const normalise = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const splitTerms = value => [...new Set(String(value || "").split(/[\n,;|]+/).map(x => x.trim()).filter(Boolean))];
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money = value => `KES ${Number(value || 0).toLocaleString("en-KE", {maximumFractionDigits:2})}`;
  const allProducts = () => D()?.I?.products || [];
  let selectedPhoto = null, previewUrl = null, ocrWorkerPromise = null, renderQueued = false;
  let ocrRequestedFile = null, ocrRequestVersion = 0, ocrQueueRunning = false;
  let productCameraStream = null, productCameraStarting = false;
  let mode = "simple", attributeDefs = [], attributeLibrary = [], variantRows = [], editGroupId = null, editOriginalIds = new Set();

  function productFields(p) {
    const attrs = Array.isArray(p.variantAttributes) ? p.variantAttributes.flatMap(a => [a.name, a.value]) : [];
    return [p.name,p.baseName,p.brand,p.category,p.variant,p.variantLabel,p.packSize,p.unit,p.barcode,p.sku,
      ...(p.alternateBarcodes || []),...(p.aliases || []),...(p.ocrTerms || []),...(p.tags || []),...attrs]
      .map(normalise).filter(Boolean);
  }
  function scoreProduct(p, query) {
    const q = normalise(query);
    if (!q) return 1;
    const fields = productFields(p), compact = fields.map(x => x.replace(/\s+/g,"")), cq = q.replace(/\s+/g,"");
    const words = q.split(" ").filter(Boolean), name = normalise(p.name), base = normalise(p.baseName), barcode = String(p.barcode || "").trim();
    if (barcode && barcode === String(query).trim()) return 130;
    if ((p.alternateBarcodes || []).some(x => String(x).trim() === String(query).trim())) return 125;
    if (name === q || base === q) return 115;
    if ((p.aliases || []).some(x => normalise(x) === q)) return 108;
    if ((p.ocrTerms || []).some(x => normalise(x) === q)) return 103;
    if (fields.includes(q) || compact.includes(cq)) return 98;
    if (!words.every(w => fields.some(f => f.includes(w)) || compact.some(f => f.includes(w.replace(/\s/g,""))))) return 0;
    let score = 55 + words.length * 4;
    if (name.includes(q) || base.includes(q)) score += 24;
    if (normalise(p.brand).includes(q)) score += 12;
    if (normalise(p.category).includes(q)) score += 6;
    if ((p.tags || []).some(x => normalise(x).includes(q))) score += 12;
    if ((p.variantAttributes || []).some(a => normalise(a.value).includes(q))) score += 9;
    return score;
  }
  function smartSearch(products, query) {
    return products.map(p => ({p,score:scoreProduct(p,query)})).filter(x => x.score > 0)
      .sort((a,b) => b.score-a.score || String(a.p.name||"").localeCompare(String(b.p.name||""))).map(x => x.p);
  }
  window.DukaProductSearch = {
    normalise, search: smartSearch,
    findByBarcode(code, products = allProducts()) {
      const raw = String(code || "").trim();
      return raw ? products.find(p => String(p.barcode || "").trim() === raw || (p.alternateBarcodes || []).some(x => String(x).trim() === raw)) || null : null;
    }
  };

  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; renderCards(); });
  }
  function renderCards() {
    const host = $("productCards");
    if (!host || !D()?.I) return;
    const q = $("productSearch")?.value || "", category = $("categoryFilter")?.value || "";
    let items = smartSearch(allProducts(), q);
    if (category) items = items.filter(p => normalise(p.category) === normalise(category));
    const owner = D().owner();
    if (!items.length) {
      host.innerHTML = `<div class="product-empty"><strong>${allProducts().length ? "No matching products" : "Your product shelf is waiting"}</strong>${allProducts().length ? "Try a product name, size, barcode, SKU, tag or packaging word." : "Add a simple product or create a family of variants."}</div>`;
      return;
    }
    host.innerHTML = items.map(p => {
      const stock = Number(p.stock || 0), low = Number(p.low || 0);
      const state = stock <= 0 ? "tag bad" : stock <= low ? "tag warn" : "tag offer";
      const stockText = stock <= 0 ? "Out of stock" : stock <= low ? `Low · ${stock} ${esc(p.unit || "units")}` : `${stock} ${esc(p.unit || "units")} in stock`;
      const variant = p.variantLabel || p.variant || p.packSize || "";
      const sub = [p.brand,variant,p.category].filter(Boolean).join(" · ");
      const photo = p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" loading="lazy" onerror="this.remove();this.parentElement.innerHTML='<span class=\'photo-placeholder\'>📦</span>'">` : `<span class="photo-placeholder">📦</span>`;
      const buy = owner && Number.isFinite(Number(D().I.costs?.[p.id])) ? `<div class="product-card-cost">Buy ${money(D().I.costs[p.id])}</div>` : "";
      const sku = p.sku ? `<div class="product-card-sub">SKU · ${esc(p.sku)}</div>` : "";
      const codes = p.barcode ? `<div class="product-card-sub">Barcode · ${esc(p.barcode)}</div>` : "";
      const type = p.productType === "variant" ? `<span class="product-badge">Variant</span>` : "";
      return `<article class="product-card"><div class="product-card-photo">${photo}${type}</div><div class="product-card-body">
        <div class="product-card-title">${esc(p.baseName || p.name || "Unnamed product")}</div><div class="product-card-sub">${esc(sub || "No brand or size added")}</div>
        ${sku}${codes}<div class="product-card-price">${money(D().price(p))}${D().offer(p) ? ` <span class="tag offer">OFFER</span>` : ""}</div>${buy}
        <div class="product-card-tags"><span class="${state}">${stockText}</span>${p.expiry && D().expired(p) ? '<span class="tag bad">Expired</span>' : ""}</div>
        ${owner ? `<div class="product-card-actions"><button class="small-btn edit" type="button" data-act="editProduct" data-id="${esc(p.id)}">Edit</button><button class="small-btn restock" type="button" data-act="restock" data-id="${esc(p.id)}">Restock</button></div>` : ""}
      </div></article>`;
    }).join("");
  }

  function randomId(prefix="p") { return (crypto.randomUUID ? crypto.randomUUID().replace(/-/g,"") : `${prefix}${Date.now()}${Math.random().toString(36).slice(2,10)}`); }
  function revokePreview() { if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = null; }
  function setCameraStatus(message,live=false) {
    const state=$("pCameraState"),dot=$("pCameraDot");
    if(state)state.textContent=message;
    if(dot)dot.classList.toggle("is-live",!!live);
  }
  function stopProductCamera() {
    if(productCameraStream){productCameraStream.getTracks().forEach(track=>{try{track.stop();}catch{}});productCameraStream=null;}
    const video=$("pCameraVideo");
    if(video){try{video.pause();}catch{}video.srcObject=null;video.classList.add("hidden");}
    productCameraStarting=false;
    const capture=$("pCapturePhoto");if(capture){capture.disabled=true;capture.classList.add("hidden");}
  }
  function showPreview(src) {
    stopProductCamera();
    const video=$("pCameraVideo"),still=$("pCameraStill"),placeholder=$("pCameraPlaceholder"),retake=$("pRetakePhoto"),fallback=$("pTakePhoto"),note=$("pCameraNote");
    if(src){
      if(still){still.src=src;still.classList.remove("hidden");}
      if(placeholder)placeholder.classList.add("hidden");
      if(retake)retake.classList.remove("hidden");
      if(fallback)fallback.classList.add("hidden");
      if(note)note.textContent="Photo selected · Retake or upload another image whenever needed";
      setCameraStatus("Photo ready",false);
    }else{
      if(still){still.removeAttribute("src");still.classList.add("hidden");}
      if(video)video.classList.add("hidden");
      if(placeholder)placeholder.classList.remove("hidden");
      if(retake)retake.classList.add("hidden");
      if(fallback)fallback.classList.add("hidden");
      if(note)note.textContent="Live preview only · Nothing is saved until you capture";
      setCameraStatus("Camera starting",false);
    }
  }
  async function startProductCamera() {
    const modal=$("modal"),video=$("pCameraVideo"),capture=$("pCapturePhoto"),placeholder=$("pCameraPlaceholder"),fallback=$("pTakePhoto"),still=$("pCameraStill"),retake=$("pRetakePhoto");
    if(!modal||modal.classList.contains("hidden")||productCameraStarting)return false;
    if(productCameraStream?.active)return true;
    if(!navigator.mediaDevices?.getUserMedia){
      setCameraStatus("Camera preview unavailable",false);
      if(placeholder)placeholder.innerHTML='<span>📷</span><strong>Use your phone camera</strong><small>Live preview is not supported here. Tap “Use phone camera” or upload an image.</small>';
      if(fallback)fallback.classList.remove("hidden");
      const status=$("pOcrStatus");if(status)status.textContent="Your browser does not support live camera preview. You can still take a photo using the phone camera.";
      return false;
    }
    productCameraStarting=true;
    setCameraStatus("Requesting camera access…",false);
    if(placeholder){placeholder.classList.remove("hidden");placeholder.innerHTML='<span class="camera-spinner"></span><strong>Opening your camera…</strong><small>Allow camera access when your browser asks.</small>'; }
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}}});
      if(modal.classList.contains("hidden")){stream.getTracks().forEach(track=>track.stop());productCameraStarting=false;return false;}
      productCameraStream=stream;
      if(still)still.classList.add("hidden");
      if(video){video.srcObject=stream;video.classList.remove("hidden");await video.play();}
      if(placeholder)placeholder.classList.add("hidden");
      if(capture){capture.classList.remove("hidden");capture.disabled=true;}
      if(retake)retake.classList.add("hidden");
      if(fallback)fallback.classList.add("hidden");
      const enableCapture=()=>{if(capture&&productCameraStream===stream&&video?.videoWidth>0)capture.disabled=false;};
      if(video?.readyState>=2)enableCapture();else video?.addEventListener("loadeddata",enableCapture,{once:true});
      setCameraStatus("Live camera · ready",true);
      const note=$("pCameraNote");if(note)note.textContent="Live preview only · Nothing is saved until you capture";
      const status=$("pOcrStatus");if(status)status.textContent="Line up the front of the product and tap Capture photo. Text recognition starts automatically.";
      return true;
    }catch(error){
      stopProductCamera();
      const denied=error?.name==="NotAllowedError"||error?.name==="SecurityError";
      setCameraStatus(denied?"Camera permission needed":"Camera unavailable",false);
      const hasSavedPhoto=!!(still?.getAttribute("src"));
      if(placeholder){placeholder.classList.toggle("hidden",hasSavedPhoto);placeholder.innerHTML=`<span>📷</span><strong>${denied?"Allow camera access":"Could not open the camera"}</strong><small>${denied?"Allow camera permission for this site in your browser settings, then tap Use phone camera.":"Check that another app is not using the camera, or use the phone camera option."}</small>`;}
      if(fallback)fallback.classList.remove("hidden");
      const status=$("pOcrStatus");if(status)status.textContent=denied?"Camera access was not granted. You can still use the phone camera or upload from gallery.":`Camera preview could not start (${error?.message||"unknown error"}). Use the phone camera or upload from gallery.`;
      return false;
    }finally{productCameraStarting=false;}
  }
  async function captureProductPhoto() {
    const video=$("pCameraVideo"),capture=$("pCapturePhoto");
    if(!productCameraStream||!video||!video.videoWidth||!video.videoHeight){D()?.toast("Wait until the camera preview is ready.");return;}
    capture.disabled=true;
    try{
      const canvas=document.createElement("canvas");canvas.width=video.videoWidth;canvas.height=video.videoHeight;
      const ctx=canvas.getContext("2d",{alpha:false});if(!ctx)throw new Error("Could not prepare the photo.");
      ctx.drawImage(video,0,0,canvas.width,canvas.height);
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error("Could not capture the photo.")),"image/jpeg",0.88));
      const file=new File([blob],`duka-product-${Date.now()}.jpg`,{type:"image/jpeg",lastModified:Date.now()});
      showCommonPhoto(file);
      D()?.toast("Photo captured. Reading packaging text…");
    }catch(error){capture.disabled=false;D()?.toast(error.message||"Photo capture failed.");}
  }
  function showCommonPhoto(file,url="") {
    selectedPhoto=file||null; revokePreview();
    if(file){
      previewUrl=URL.createObjectURL(file); showPreview(previewUrl);
      const status=$("pOcrStatus");
      if(status) status.textContent=`${file.name} · ${(file.size/1048576).toFixed(1)} MB. Starting automatic text recognition…`;
      queuePackagingText(file);
    } else {
      showPreview(url);
      const status=$("pOcrStatus");
      if(status) status.textContent=url?"Saved product photo. Tap Retake photo or upload another image.":"Opening the camera…";
    }
  }
  function handlePhotoInput(event) {
    const input=event.currentTarget, file=input.files?.[0];
    if(!file) return;
    if(!file.type.startsWith("image/")){D()?.toast("Please choose an image file.");input.value="";return;}
    if(file.size>12*1024*1024){D()?.toast("Choose an image smaller than 12 MB.");input.value="";return;}
    showCommonPhoto(file);
    // Clearing lets the attendant choose the same photo again after a failed scan.
    input.value="";
  }
  function unitButtons(value) {
    document.querySelectorAll(".unit-choice").forEach(b=>b.classList.toggle("active",b.dataset.unit===value));
  }
  function setMode(next) {
    mode=next;
    document.querySelectorAll("[data-product-mode]").forEach(b=>{const active=b.dataset.productMode===mode;b.classList.toggle("active",active);b.setAttribute("aria-selected",String(active));});
    const simple=$("simpleProductFields"), variant=$("variantProductFields");
    simple.classList.toggle("hidden",mode!=="simple"); variant.classList.toggle("hidden",mode!=="variant");
    simple.querySelectorAll("input,select,textarea,button").forEach(el=>el.disabled=mode!=="simple");
    variant.querySelectorAll("input,select,textarea,button").forEach(el=>el.disabled=mode!=="variant");
    $("pSaveBtn").textContent=mode==="variant"?`Save ${variantRows.length || 0} variants`:"Save product";
    $("pProfitHint").textContent=mode==="variant"?"Each variant will keep its own buying price, selling price and stock balance.":"Enter buying and selling prices to see the estimated profit.";
  }
  function collectAttributeDefs(products=allProducts()) {
    const map=new Map();
    products.forEach(p=>{
      (p.variantAttributeCatalog||[]).forEach(def=>{
        if(!def||!def.name)return;
        const key=normalise(def.name); if(!map.has(key))map.set(key,{name:String(def.name),values:[]});
        (def.values||[]).forEach(v=>addDefValue(map.get(key),v));
      });
      (p.variantAttributes||[]).forEach(a=>{
        if(!a||!a.name||!a.value)return;
        const key=normalise(a.name); if(!map.has(key))map.set(key,{name:String(a.name),values:[]});
        addDefValue(map.get(key),a.value);
      });
    });
    return [...map.values()];
  }
  function addDefValue(def,value) { const v=String(value||"").trim(); if(v&&!def.values.some(x=>normalise(x)===normalise(v)))def.values.push(v); }
  function renderAttributeChips() {
    const host=$("variantAttributeChips"); if(!host)return;
    host.innerHTML=attributeDefs.length?attributeDefs.map((a,i)=>`<div class="attribute-chip"><span><strong>${esc(a.name)}</strong><small>${esc(a.values.join(" · ")||"No values yet")}</small></span><button type="button" data-remove-attribute="${i}" aria-label="Remove ${esc(a.name)}">×</button></div>`).join(""):'<span class="hint">No attributes added yet. Add one such as Grams, Colour or Size.</span>';
  }
  function newVariant() {
    const attrs={}; attributeDefs.forEach(a=>attrs[a.name]=a.values[0]||"");
    if(attributeDefs.length){
      const used=new Set(variantRows.map(r=>attributeDefs.map(a=>normalise(r.attributes[a.name])).join("|")));
      let chosen=null,attempts=0;
      const walk=(i,current)=>{
        if(chosen||attempts>500)return;
        if(i===attributeDefs.length){attempts++;const key=attributeDefs.map(a=>normalise(current[a.name])).join("|");if(!used.has(key))chosen={...current};return;}
        const def=attributeDefs[i],values=def.values.length?def.values:[""];
        values.forEach(v=>{current[def.name]=v;walk(i+1,current);});
      };
      walk(0,{});if(chosen)Object.assign(attrs,chosen);
    }
    return {key:randomId("v"),id:null,attributes:attrs,buy:"",sell:"",qty:"0",low:"5",barcode:"",sku:"",tags:"",expiry:"",imageFile:null,imageUrl:"",previewUrl:null};
  }
  function variantLabel(row) { return attributeDefs.map(a=>row.attributes[a.name]).filter(Boolean).join(" / "); }
  function attrControls(row) {
    return attributeDefs.map(a=>{
      const val=row.attributes[a.name]||"";
      const options=a.values.map(v=>`<option value="${esc(v)}" ${v===val?"selected":""}>${esc(v)}</option>`).join("");
      const addBox=row.pendingAdd===a.name?`<div class="inline-add-value"><input type="text" data-new-attribute-value placeholder="New ${esc(a.name)} value"><button type="button" data-add-attribute-value="${esc(a.name)}">Add</button><button type="button" data-cancel-attribute-value>Cancel</button></div>`:"";
      return `<label class="variant-attribute-field">${esc(a.name)}<select data-variant-field="attribute" data-attribute-name="${esc(a.name)}"><option value="">Choose ${esc(a.name)}</option>${options}</select><button type="button" class="add-value-link" data-open-add-value="${esc(a.name)}">＋ Add new</button>${addBox}</label>`;
    }).join("");
  }
  function renderVariants() {
    const host=$("variantRows"); if(!host)return;
    $("variantCount").textContent=`${variantRows.length} variant${variantRows.length===1?"":"s"}`;
    $("pSaveBtn").textContent=`Save ${variantRows.length} variant${variantRows.length===1?"":"s"}`;
    if(!variantRows.length){host.innerHTML='<div class="variant-empty">No variants yet. Tap “Add another variant” to create the first one.</div>';return;}
    host.innerHTML=variantRows.map((r,i)=>{
      const label=variantLabel(r),photo=r.previewUrl||r.imageUrl;
      const thumb=photo?`<img src="${esc(photo)}" alt="Variant ${i+1}">`:'<span>📦</span>';
      return `<article class="variant-card" data-variant-key="${esc(r.key)}">
        <div class="variant-card-head"><div class="variant-title"><strong>Variant ${i+1}</strong><small>${esc(label||"Choose its attributes below")}</small></div><button type="button" class="variant-remove" data-remove-variant="${esc(r.key)}" ${variantRows.length===1?"disabled title='At least one variant is required'":""}>Remove</button></div>
        ${attributeDefs.length?`<div class="variant-attribute-grid">${attrControls(r)}</div>`:'<div class="variant-empty-inline">Add at least one attribute (for example Grams: 200g, 400g, 600g).</div>'}
        <div class="variant-photo-row"><div class="variant-thumb">${thumb}</div><label class="variant-photo-label">Variant photo <input type="file" accept="image/*" capture="environment" data-variant-photo></label><small>Optional. Uses the main product photo if left empty.</small></div>
        <div class="product-field-grid variant-fields">
          <label>Buying price (KES) *<input type="number" min="0" step="any" inputmode="decimal" data-variant-field="buy" value="${esc(r.buy)}" placeholder="0"></label>
          <label>Selling price (KES) *<input type="number" min="0" step="any" inputmode="decimal" data-variant-field="sell" value="${esc(r.sell)}" placeholder="0"></label>
          <label>Quantity in stock *<input type="number" min="0" step="any" inputmode="decimal" data-variant-field="qty" value="${esc(r.qty)}"></label>
          <label>Minimum stock *<input type="number" min="0" step="any" inputmode="decimal" data-variant-field="low" value="${esc(r.low)}"></label>
          <label>Barcode<span class="bc-row"><input type="text" data-variant-field="barcode" value="${esc(r.barcode)}" placeholder="Scan or type code"><button type="button" class="small-btn restock" data-scan-variant-barcode="${esc(r.key)}">📷 Scan</button></span></label>
          <label>SKU / item code<input type="text" maxlength="50" data-variant-field="sku" value="${esc(r.sku)}" placeholder="Optional unique code"></label>
          <label class="span-2">Search tags <span class="field-note">Comma separated</span><input type="text" data-variant-field="tags" value="${esc(r.tags)}" placeholder="e.g. family pack, large, blue"></label>
          <label class="span-2">Expiry date (optional)<input type="date" data-variant-field="expiry" value="${esc(r.expiry)}"></label>
        </div>
        <div class="variant-profit" data-variant-profit>${r.buy!==""&&r.sell!==""?`Profit per ${esc($("pUnit")?.value||"unit")}: ${money(Number(r.sell)-Number(r.buy))}`:"Enter both prices to see estimated profit."}</div>
      </article>`;
    }).join("");
  }
  function syncVariantField(target) {
    const card=target.closest("[data-variant-key]"); if(!card)return;
    const row=variantRows.find(r=>r.key===card.dataset.variantKey); if(!row)return;
    const field=target.dataset.variantField;
    if(field==="attribute"){
      const name=target.dataset.attributeName;
      if(target.value==="__add__"){row.pendingAdd=name;renderVariants();const fresh=$("variantRows")?.querySelector(`[data-variant-key="${CSS.escape(row.key)}"] [data-new-attribute-value]`);fresh?.focus();return;}
      row.attributes[name]=target.value;renderVariants();return;
    }
    if(field)row[field]=target.value;
    if(field==="buy"||field==="sell"){
      const profit=card.querySelector("[data-variant-profit]");
      if(profit)profit.textContent=row.buy!==""&&row.sell!==""?`Profit per ${$("pUnit").value||"unit"}: ${money(Number(row.sell)-Number(row.buy))}`:"Enter both prices to see estimated profit.";
    }
  }
  function addAttribute() {
    const name=$("newAttributeName").value.trim(),entered=splitTerms($("newAttributeValues").value);
    if(!name){D().toast("Enter an attribute name, such as Grams or Colour.");$("newAttributeName").focus();return;}
    if(attributeDefs.some(a=>normalise(a.name)===normalise(name))){D().toast("That attribute is already being used by this product.");return;}
    const saved=attributeLibrary.find(a=>normalise(a.name)===normalise(name));
    const values=saved?[...saved.values]:[];entered.forEach(v=>{if(!values.some(x=>normalise(x)===normalise(v)))values.push(v);});
    if(!values.length){D().toast("Enter at least one value, separated by commas.");$("newAttributeValues").focus();return;}
    attributeDefs.push({name:saved?saved.name:name,values});
    if(!saved)attributeLibrary.push({name,values:[...values]});
    else entered.forEach(v=>addDefValue(saved,v));
    variantRows.forEach(r=>r.attributes[saved?saved.name:name]=values[0]);
    $("newAttributeName").value="";$("newAttributeValues").value="";$("savedAttributeSelect").value="";$("attributeComposer").classList.add("hidden");renderAttributeChips();renderVariants();
  }
  function openAttributeComposer(){
    const select=$("savedAttributeSelect");
    select.innerHTML='<option value="">Create a new attribute…</option>'+attributeLibrary.filter(a=>!attributeDefs.some(active=>normalise(active.name)===normalise(a.name))).map(a=>`<option value="${esc(a.name)}">${esc(a.name)} · ${esc(a.values.join(", "))}</option>`).join("");
    select.value="";$("newAttributeName").value="";$("newAttributeValues").value="";
    $("attributeComposer").classList.remove("hidden");$("newAttributeName").focus();
  }
  function useSavedAttribute(){
    const name=$("savedAttributeSelect").value,def=attributeLibrary.find(a=>a.name===name);
    if(def){$("newAttributeName").value=def.name;$("newAttributeValues").value=def.values.join(", ");}
    else {$("newAttributeName").value="";$("newAttributeValues").value="";}
  }

  function resetForm() {
    stopProductCamera();
    variantRows.forEach(r=>{if(r.previewUrl)URL.revokeObjectURL(r.previewUrl);});
    $("productForm").reset(); $("editId").value=""; editGroupId=null;
    attributeLibrary=collectAttributeDefs(); attributeDefs=[]; variantRows=[]; editOriginalIds=new Set(); editGroupId=null; selectedPhoto=null; revokePreview(); showPreview("");
    $("attributeComposer").classList.add("hidden");$("newAttributeName").value="";$("newAttributeValues").value="";
    $("pPhoto").value=""; if($("pPhotoUpload")) $("pPhotoUpload").value="";
    ocrRequestedFile=null; ocrRequestVersion++;
    $("pOcrStatus").textContent="Opening the camera…";
    $("pUnit").value="piece";unitButtons("piece");$("pStock").value="0";$("pLow").value="5";
    renderAttributeChips();renderVariants();setMode("simple");
  }
  function openNewOrExisting(id) {
    resetForm();
    const product=id?allProducts().find(p=>p.id===id):null;
    if(!product)return;
    const group=product.productType==="variant"&&product.variantGroupId?allProducts().filter(p=>p.variantGroupId===product.variantGroupId):[product];
    const first=group[0]||product;
    $("editId").value=product.id;
    $("pName").value=first.baseName||first.name||"";
    if(product.productType==="variant"){
      editGroupId=product.variantGroupId;editOriginalIds=new Set(group.map(p=>p.id));setMode("variant");
      attributeLibrary=collectAttributeDefs();
      attributeDefs=collectAttributeDefs(group);
      // Include the group's own saved catalogue before rendering choices.
      (first.variantAttributeCatalog||[]).forEach(def=>{let found=attributeDefs.find(a=>normalise(a.name)===normalise(def.name));if(!found)attributeDefs.push({name:def.name,values:[...(def.values||[])]});else(def.values||[]).forEach(v=>addDefValue(found,v));});
      variantRows=group.map(p=>({key:randomId("v"),id:p.id,attributes:Object.fromEntries((p.variantAttributes||[]).map(a=>[a.name,a.value])),buy:String(D().I.costs?.[p.id]??""),sell:String(p.sell??""),qty:String(p.stock??0),low:String(p.low??0),barcode:p.barcode||"",sku:p.sku||"",tags:(p.tags||[]).join(", "),expiry:p.expiry||"",imageFile:null,imageUrl:p.imageUrl||"",previewUrl:null}));
      $("pBrand").value=first.brand||"";$("pCategory").value=first.category||"";$("pUnit").value=first.unit||"piece";unitButtons($("pUnit").value);
      $("pAliases").value=(first.aliases||[]).join(", ");$("pOcrTerms").value=(first.ocrTerms||[]).join("\n");
      showPreview(first.imageUrl||"");$("pOcrStatus").textContent="Editing this product family. Each row is a separate sellable variant.";
      renderAttributeChips();renderVariants();
    } else {
      setMode("simple");$("pBrand").value=product.brand||"";$("pCategory").value=product.category||"";$("pUnit").value=product.unit||"piece";unitButtons($("pUnit").value);
      $("pAliases").value=(product.aliases||[]).join(", ");$("pOcrTerms").value=(product.ocrTerms||[]).join("\n");
      $("pBarcode").value=product.barcode||"";$("pSku").value=product.sku||"";$("pAltBarcodes").value=(product.alternateBarcodes||[]).join(", ");$("pVariant").value=product.variant||"";$("pPackSize").value=product.packSize||"";
      $("pBuy").value=D().I.costs?.[product.id]??"";$("pSell").value=product.sell??"";$("pStock").value=product.stock??0;$("pLow").value=product.low??5;$("pExpiry").value=product.expiry||"";$("pOfferPrice").value=product.offerPrice??"";$("pOfferStart").value=product.offerStart||"";$("pOfferEnd").value=product.offerEnd||"";
      showPreview(product.imageUrl||"");$("pOcrStatus").textContent=product.imageUrl?"Saved product photo. Choose another photo to replace it.":"One main photo can be used by all variants.";
    }
    $("modalTitle").textContent=product.productType==="variant"?"Edit product variants":"Edit product";
  }

  function updateSimpleProfit() {
    const box=$("pProfitHint"),buy=$("pBuy").value,sell=$("pSell").value;
    if(!buy||!sell){box.textContent="Enter buying and selling prices to see the estimated profit.";return;}
    const profit=Number(sell)-Number(buy);box.textContent=`${profit>=0?"Estimated gross profit":"Selling below cost"}: ${money(profit)} per ${$("pUnit").value||"unit"}.`;
    box.style.color=profit>=0?"var(--teal2)":"#fca5a5";
  }
  async function compressPhoto(file) {
    if(!file||!file.type.startsWith("image/"))throw new Error("Choose an image file.");
    if(file.size>12*1024*1024)throw new Error("Choose a photo smaller than 12 MB.");
    let bitmap;try{bitmap=await createImageBitmap(file);}catch{throw new Error("This image could not be opened. Try another photo.");}
    const max=1000,scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    canvas.getContext("2d",{alpha:false}).drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
    return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("Could not compress this photo.")),"image/jpeg",.82));
  }
  async function uploadPhoto(file,productId) {
    const config=window.FIREBASE_CONFIG||{};if(!config.storageBucket)throw new Error("Firebase Storage bucket is not configured.");
    if(!D()?.getIdToken)throw new Error("Could not obtain a secure sign-in token. Reload and sign in again.");
    const token=await D().getIdToken();if(!token)throw new Error("Your login has expired. Sign in again before uploading a photo.");
    const blob=await compressPhoto(file),path=`businesses/${D().I.bizId}/products/${productId}/main-${Date.now()}.jpg`;
    const endpoint=`https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(config.storageBucket)}/o?uploadType=media&name=${encodeURIComponent(path)}`;
    const response=await fetch(endpoint,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"image/jpeg"},body:blob});
    if(!response.ok){let detail="";try{detail=(await response.json()).error?.message||"";}catch{}throw new Error(detail||`Photo upload failed (${response.status}). Check Storage billing and rules.`);}
    const meta=await response.json();let tokenValue=String(meta.downloadTokens||meta.metadata?.firebaseStorageDownloadTokens||"").split(",")[0];
    if(!tokenValue){tokenValue=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;const url=`https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(config.storageBucket)}/o/${encodeURIComponent(path)}`;const patch=await fetch(url,{method:"PATCH",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({metadata:{firebaseStorageDownloadTokens:tokenValue}})});if(!patch.ok)throw new Error("Photo uploaded but its display link could not be created.");}
    return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(config.storageBucket)}/o/${encodeURIComponent(path)}?alt=media&token=${encodeURIComponent(tokenValue)}`;
  }
  async function getOcr() {
    if(ocrWorkerPromise)return ocrWorkerPromise;
    ocrWorkerPromise=new Promise((resolve,reject)=>{if(window.Tesseract)return resolve(window.Tesseract);const script=document.createElement("script");script.src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";script.onload=()=>window.Tesseract?resolve(window.Tesseract):reject(new Error("Text recognition did not load."));script.onerror=()=>reject(new Error("Could not load text recognition. Check your internet connection."));document.head.appendChild(script);});
    return ocrWorkerPromise;
  }
  function queuePackagingText(file) {
    ocrRequestedFile=file;
    ocrRequestVersion++;
    if(!ocrQueueRunning) void processPackagingQueue();
  }
  async function processPackagingQueue() {
    ocrQueueRunning=true;
    try {
      while(ocrRequestedFile) {
        const file=ocrRequestedFile, version=ocrRequestVersion;
        ocrRequestedFile=null;
        const status=$("pOcrStatus");
        if(status) status.textContent="Preparing automatic packaging scan…";
        let worker=null;
        try {
          const T=await getOcr();
          // If the attendant selected another photo while the OCR library loaded,
          // skip the stale image and read only the latest selection.
          if(version!==ocrRequestVersion) continue;
          worker=await T.createWorker("eng",1,{logger:m=>{
            if(version!==ocrRequestVersion||!status) return;
            if(m.status==="recognizing text") status.textContent=`Reading packaging text… ${Math.round((m.progress||0)*100)}%`;
            else if(m.status) status.textContent=`Preparing ${m.status.replace(/-/g," ")}…`;
          }});
          if(version!==ocrRequestVersion) continue;
          const OCR=window.YeetuOCR;
          let img=file;
          if(OCR&&window.createImageBitmap){try{const bm=await createImageBitmap(file);img=OCR.prepare(bm,bm.width,bm.height,{x:0,y:0,w:1,h:1},1600).canvas;if(bm.close)bm.close()}catch{}}
          try{await worker.setParameters({tessedit_pageseg_mode:T.PSM.SPARSE_TEXT,...(OCR?{tessedit_char_whitelist:OCR.CHARS}:{})})}catch{}
          const result=await worker.recognize(img);
          if(version!==ocrRequestVersion) continue;
          const words=OCR?OCR.cleanWords(result,55):[];
          // Largest printed words first: brand and product name are usually the biggest text on the pack.
          const terms=[...new Set([...words].sort((a,b)=>b.h-a.h).map(w=>w.t))].slice(0,40);
          $("pOcrTerms").value=terms.join("\n");
          if(!$("pName").value.trim()&&terms.length){
            const top=new Set(terms.slice(0,2));
            $("pName").value=[...new Set(words.filter(w=>top.has(w.t)).map(w=>w.t))].join(" ").replace(/\b\w/g,c=>c.toUpperCase()).slice(0,100);
          }
          if(status) status.textContent=terms.length
            ? `✓ Found ${terms.length} product words automatically. Review or edit the suggestions below before saving.`
            : "Photo added, but no clear text was detected. Try a brighter, closer photo or enter the details manually.";
        } catch(error) {
          if(version===ocrRequestVersion&&status) status.textContent=`Photo added. Automatic text recognition could not run: ${error.message||"Check your internet connection and try another photo."}`;
        } finally {
          if(worker) { try { await worker.terminate(); } catch {} }
        }
      }
    } finally {
      ocrQueueRunning=false;
      if(ocrRequestedFile) void processPackagingQueue();
    }
  }
  function uniqueCodes(values) { return [...new Set(values.map(x=>String(x||"").trim()).filter(Boolean))]; }
  function validateShared() {
    const name=$("pName").value.trim(),category=$("pCategory").value.trim();
    if(!name||!category){D().toast("Enter a product name and category.");return false;}
    return true;
  }
  function validateSimple() {
    const fields=["pBuy","pSell","pStock","pLow"],nums=fields.map(id=>Number($(id).value));
    if(fields.some(id=>$(id).value==="")||nums.some(n=>!Number.isFinite(n)||n<0)){D().toast("Enter valid buying price, selling price, quantity and minimum stock.");return false;}
    const offer=$("pOfferPrice").value;if(offer!==""&&(!Number.isFinite(Number(offer))||Number(offer)<0)){D().toast("Enter a valid offer price.");return false;}
    if($("pOfferStart").value&&$("pOfferEnd").value&&$("pOfferEnd").value<$("pOfferStart").value){D().toast("Offer end date cannot be before its start date.");return false;}
    return true;
  }
  function existingIdsToIgnore() {
    if(editGroupId)return new Set(allProducts().filter(p=>p.variantGroupId===editGroupId).map(p=>p.id));
    const id=$("editId").value;return new Set(id?[id]:[]);
  }
  function validateUnique(candidates) {
    const ignore=existingIdsToIgnore(),codes=[],skus=[];
    for(const x of candidates){if(x.barcode)codes.push(String(x.barcode).trim());(x.alternateBarcodes||[]).forEach(v=>codes.push(String(v).trim()));if(x.sku)skus.push(String(x.sku).trim().toLowerCase());}
    if(new Set(codes).size!==codes.length){D().toast("A barcode is repeated in this product entry.");return false;}
    if(new Set(skus).size!==skus.length){D().toast("An SKU is repeated in this product entry.");return false;}
    const clashes=allProducts().filter(p=>!ignore.has(p.id));
    const usedCode=clashes.find(p=>[p.barcode,...(p.alternateBarcodes||[])].some(code=>code&&codes.includes(String(code).trim())));
    if(usedCode){D().toast(`That barcode is already assigned to ${usedCode.name}.`);return false;}
    const usedSku=clashes.find(p=>p.sku&&skus.includes(String(p.sku).trim().toLowerCase()));
    if(usedSku){D().toast(`That SKU is already assigned to ${usedSku.name}.`);return false;}
    return true;
  }
  function sharedData() {
    return {baseName:$("pName").value.trim(),brand:$("pBrand").value.trim(),category:$("pCategory").value.trim(),unit:$("pUnit").value.trim()||"piece",aliases:splitTerms($("pAliases").value),ocrTerms:splitTerms($("pOcrTerms").value)};
  }
  function chunk(arr,size) { const out=[];for(let i=0;i<arr.length;i+=size)out.push(arr.slice(i,i+size));return out; }
  async function writeRows(rows,label) {
    const d=D();
    // Firestore security-rule document-access budget: keep each batch small.
    for(const group of chunk(rows,4)){
      const ops=[];group.forEach(row=>{ops.push({op:row.id?"update":"set",path:d.path("products",row.id),data:row.product});ops.push({op:"set",path:d.path("costs",row.id),data:{buy:row.buy}});});
      await d.write(ops,`${label} (${group.length} item${group.length===1?"":"s"})`);
      const last=d.I.syncErrors?.[d.I.syncErrors.length-1];if(last&&Date.now()-(last.at||0)<5000)throw new Error(last.msg||"Firestore refused the product changes.");
    }
  }
  async function saveSimple() {
    if(!validateSimple())return;
    const d=D(),id=$("editId").value||randomId(),existing=allProducts().find(p=>p.id===id),s=sharedData();
    const barcode=$("pBarcode").value.trim(),alt=splitTerms($("pAltBarcodes").value),codes=uniqueCodes([barcode,...alt]);
    if(codes.length!==[barcode,...alt].filter(Boolean).length){D().toast("The same barcode appears more than once.");return;}
    const product={...s,name:s.baseName,productType:"simple",variantGroupId:"",variantLabel:"",variantAttributes:[],variantAttributeCatalog:[],barcode,sku:$("pSku").value.trim(),alternateBarcodes:alt,variant:$("pVariant").value.trim(),packSize:$("pPackSize").value.trim(),sell:Number($("pSell").value),stock:Number($("pStock").value),low:Number($("pLow").value),expiry:$("pExpiry").value,offerPrice:$("pOfferPrice").value===""?null:Number($("pOfferPrice").value),offerStart:$("pOfferStart").value,offerEnd:$("pOfferEnd").value,tags:[...s.aliases] ,imageUrl:existing?.imageUrl||""};
    if(!validateUnique([{barcode,alternateBarcodes:alt,sku:product.sku}]))return;
    const button=$("pSaveBtn");button.disabled=true;button.textContent=selectedPhoto?"Uploading photo & saving…":"Saving product…";
    let photoWarning="";
    try{
      if(selectedPhoto){try{product.imageUrl=await uploadPhoto(selectedPhoto,id);}catch(e){photoWarning=` Photo not saved: ${e.message}`;}}
      await d.write([{op:existing?"update":"set",path:d.path("products",id),data:product},{op:"set",path:d.path("costs",id),data:{buy:Number($("pBuy").value)}}],`${existing?"Edit":"Add"} ${product.name}`);
      const last=d.I.syncErrors?.[d.I.syncErrors.length-1];if(last&&Date.now()-(last.at||0)<5000)throw new Error(last.msg||"Firestore refused this product.");
      closeAndReset();d.toast((existing?"Product updated.":"Product saved.")+photoWarning,photoWarning?6500:2500);queueRender();
    }catch(e){d.toast(`Could not save product: ${e.message||e}`,6500);}finally{button.disabled=false;button.textContent="Save product";}
  }
  function buildVariantRecords() {
    const shared=sharedData(),groupId=editGroupId||randomId("vg"),catalog=attributeDefs.map(a=>({name:a.name,values:[...a.values]}));
    return variantRows.map((r,index)=>{
      const attrs=attributeDefs.map(a=>({name:a.name,value:String(r.attributes[a.name]||"").trim()}));
      const label=attrs.map(a=>a.value).filter(Boolean).join(" / ");
      const allTags=uniqueCodes([...shared.aliases,...splitTerms(r.tags),...attrs.map(a=>a.value)]);
      const aliases=uniqueCodes([...shared.aliases,shared.baseName,...attrs.map(a=>a.value),...splitTerms(r.tags)]);
      const name=label?`${shared.baseName} — ${label}`:shared.baseName;
      return {row:r,index,id:r.id||randomId("p"),buy:Number(r.buy),product:{...shared,name,productType:"variant",variantGroupId:groupId,variantLabel:label,variant:label,variantAttributes:attrs,variantAttributeCatalog:catalog,sku:r.sku.trim(),barcode:r.barcode.trim(),alternateBarcodes:[],packSize:"",aliases,ocrTerms:shared.ocrTerms,tags:allTags,sell:Number(r.sell),stock:Number(r.qty),low:Number(r.low),expiry:r.expiry||"",offerPrice:null,offerStart:"",offerEnd:"",imageUrl:r.imageUrl||""}};
    });
  }
  function validateVariants() {
    if(!attributeDefs.length){D().toast("Add at least one variant attribute, such as Grams or Colour.");return false;}
    if(!variantRows.length){D().toast("Add at least one variant.");return false;}
    const combos=new Set();
    for(let i=0;i<variantRows.length;i++){
      const r=variantRows[i],label=variantLabel(r);
      if(attributeDefs.some(a=>!String(r.attributes[a.name]||"").trim())){D().toast(`Choose all attributes for Variant ${i+1}.`);return false;}
      const key=attributeDefs.map(a=>normalise(r.attributes[a.name])).join("|");if(combos.has(key)){D().toast(`Variant ${i+1} duplicates another variant's attribute combination.`);return false;}combos.add(key);
      const nums=[r.buy,r.sell,r.qty,r.low];if(nums.some(v=>v===""||!Number.isFinite(Number(v))||Number(v)<0)){D().toast(`Enter valid buying price, selling price, quantity and minimum stock for Variant ${i+1}.`);return false;}
    }
    const records=buildVariantRecords();if(!validateUnique(records.map(x=>({barcode:x.product.barcode,sku:x.product.sku}))))return false;
    return true;
  }
  async function saveVariants() {
    if(!validateVariants())return;
    const d=D(),button=$("pSaveBtn"),records=buildVariantRecords();
    // Lock the family ID before any write so a partial retry keeps one family.
    editGroupId=records[0].product.variantGroupId;
    button.disabled=true;let saved=0,warnings=[];
    try{
      button.textContent="Preparing variant photos…";
      let commonUrl="";
      if(selectedPhoto){try{commonUrl=await uploadPhoto(selectedPhoto,editGroupId||records[0].id);}catch(e){warnings.push(`Main photo not saved: ${e.message}`);}}
      for(const rec of records){
        if(rec.row.imageFile){try{rec.product.imageUrl=await uploadPhoto(rec.row.imageFile,rec.id);}catch(e){warnings.push(`Photo for Variant ${rec.index+1} not saved: ${e.message}`);}}
        else rec.product.imageUrl=commonUrl||rec.row.imageUrl||"";
      }
      button.textContent="Saving variants…";
      // Save in small batches. IDs are retained after each successful batch so a retry won't duplicate them.
      for(const group of chunk(records,4)){
        const ops=[];group.forEach(rec=>{ops.push({op:rec.row.id?"update":"set",path:d.path("products",rec.id),data:rec.product});ops.push({op:"set",path:d.path("costs",rec.id),data:{buy:rec.buy}});});
        await d.write(ops,`Save ${$("pName").value.trim()} variants`);
        const last=d.I.syncErrors?.[d.I.syncErrors.length-1];if(last&&Date.now()-(last.at||0)<5000)throw new Error(last.msg||"Firestore refused a variant batch.");
        group.forEach(rec=>{rec.row.id=rec.id;rec.row.imageUrl=rec.product.imageUrl;editOriginalIds.add(rec.id);});saved+=group.length;
        button.textContent=`Saved ${saved} of ${records.length} variants…`;
      }
      const keep=new Set(records.map(r=>r.id)),toRemove=[...editOriginalIds].filter(id=>!keep.has(id));
      for(const idGroup of chunk(toRemove,4)){
        const ops=[];idGroup.forEach(id=>{ops.push({op:"delete",path:d.path("products",id)});ops.push({op:"delete",path:d.path("costs",id)});});
        await d.write(ops,"Remove deleted variants");
      }
      closeAndReset();d.toast(`${records.length} variant${records.length===1?"":"s"} saved.${warnings.length?" Some images could not be uploaded: "+warnings.join("; "):""}`,warnings.length?8000:3500);queueRender();
    }catch(e){
      d.toast(`${saved} of ${records.length} variants saved. ${e.message||e} Your saved rows have retained their IDs; correct the issue and save again.`,8000);
    }finally{button.disabled=false;button.textContent=mode==="variant"?`Save ${variantRows.length} variants`:"Save product";}
  }
  function closeAndReset(){ stopProductCamera(); $("modal").classList.add("hidden");resetForm(); }

  function init() {
    if(!$("productForm")||!D())return;
    $("productForm").addEventListener("submit",event=>{event.preventDefault();event.stopImmediatePropagation();const d=D();if(!d?.owner()){d?.toast("Only the shop owner can add or edit products.");return;}if(!d.active())return;if(!validateShared())return;if(mode==="variant")saveVariants();else saveSimple();},true);
    $("closeModal")?.addEventListener("click",stopProductCamera);
    $("modal")?.addEventListener("click",event=>{if(event.target?.id==="modal")stopProductCamera();});
    document.addEventListener("keydown",event=>{if(event.key==="Escape")stopProductCamera();});
    if($("modal")){new MutationObserver(()=>{if($("modal").classList.contains("hidden"))stopProductCamera();}).observe($("modal"),{attributes:true,attributeFilter:["class"]});}
    $("addProductBtn")?.addEventListener("click",()=>setTimeout(()=>{resetForm();$("modalTitle").textContent="Add products";void startProductCamera();},0));
    document.addEventListener("click",event=>{
      const edit=event.target.closest('[data-act="editProduct"]');if(edit)setTimeout(()=>openNewOrExisting(edit.dataset.id),0);
      const modeBtn=event.target.closest("[data-product-mode]");if(modeBtn){if($("editId").value){D().toast("To change a simple product into variants, create a new variant product family.");return;}if(modeBtn.dataset.productMode==="variant"&&!variantRows.length)variantRows=[newVariant()];setMode(modeBtn.dataset.productMode);renderVariants();}
      if(event.target.closest("#addAttributeBtn"))openAttributeComposer();
      const openValue=event.target.closest("[data-open-add-value]");if(openValue){const card=openValue.closest("[data-variant-key]"),row=variantRows.find(r=>r.key===card?.dataset.variantKey);if(row){row.pendingAdd=openValue.dataset.openAddValue;renderVariants();$("variantRows")?.querySelector(`[data-variant-key="${CSS.escape(row.key)}"] [data-new-attribute-value]`)?.focus();}}
      if(event.target.closest("#cancelAttributeBtn"))$("attributeComposer").classList.add("hidden");
      if(event.target.closest("#saveAttributeBtn"))addAttribute();
      const remAttr=event.target.closest("[data-remove-attribute]");if(remAttr){const i=Number(remAttr.dataset.removeAttribute),a=attributeDefs[i];if(a){attributeDefs.splice(i,1);variantRows.forEach(r=>delete r.attributes[a.name]);renderAttributeChips();renderVariants();}}
      if(event.target.closest("#addVariantBtn")){variantRows.push(newVariant());renderVariants();}
      const remVariant=event.target.closest("[data-remove-variant]");if(remVariant){const i=variantRows.findIndex(r=>r.key===remVariant.dataset.removeVariant);if(i>=0){if(variantRows[i].id)removedIds.push(variantRows[i].id);if(variantRows[i].previewUrl)URL.revokeObjectURL(variantRows[i].previewUrl);variantRows.splice(i,1);renderVariants();}}
      const addValue=event.target.closest("[data-add-attribute-value]");if(addValue){const card=addValue.closest("[data-variant-key]"),row=variantRows.find(r=>r.key===card?.dataset.variantKey),name=addValue.dataset.addAttributeValue,input=card?.querySelector("[data-new-attribute-value]"),value=input?.value.trim(),def=attributeDefs.find(a=>a.name===name);if(!value){D().toast("Enter a value first.");input?.focus();return;}if(def){addDefValue(def,value);row.attributes[name]=value;row.pendingAdd=null;renderAttributeChips();renderVariants();}}
      if(event.target.closest("[data-cancel-attribute-value]")){const card=event.target.closest("[data-variant-key]"),row=variantRows.find(r=>r.key===card?.dataset.variantKey);if(row){row.pendingAdd=null;renderVariants();}}
      const scan=event.target.closest("[data-scan-variant-barcode]");if(scan){const key=scan.dataset.scanVariantBarcode,api=window.DUKA?.salesUI;if(api?.openScanner)api.openScanner("pick",code=>{const row=variantRows.find(r=>r.key===key);if(row){row.barcode=code;renderVariants();D().toast("Barcode added to variant.");}});else D().toast("Open the Sales scanner once, then try scanning again.");}
    });
    document.querySelectorAll(".unit-choice").forEach(btn=>btn.addEventListener("click",()=>{$("pUnit").value=btn.dataset.unit;unitButtons(btn.dataset.unit);}));
    $("savedAttributeSelect")?.addEventListener("change",useSavedAttribute);
    $("pTakePhoto")?.addEventListener("click",()=>$("pPhoto")?.click());
    $("pUploadPhoto")?.addEventListener("click",()=>$("pPhotoUpload")?.click());
    $("pCapturePhoto")?.addEventListener("click",captureProductPhoto);
    $("pRetakePhoto")?.addEventListener("click",()=>void startProductCamera());
    $("pPhoto")?.addEventListener("change",handlePhotoInput);
    $("pPhotoUpload")?.addEventListener("change",handlePhotoInput);
    $("pBuy")?.addEventListener("input",updateSimpleProfit);$("pSell")?.addEventListener("input",updateSimpleProfit);
    $("productSearch")?.addEventListener("input",queueRender);$("categoryFilter")?.addEventListener("change",queueRender);
    $("variantRows")?.addEventListener("change",event=>{const target=event.target;if(target.matches("[data-variant-field]"))syncVariantField(target);if(target.matches("[data-variant-photo]")){const card=target.closest("[data-variant-key]"),row=variantRows.find(r=>r.key===card?.dataset.variantKey),file=target.files?.[0];if(row&&file){if(row.previewUrl)URL.revokeObjectURL(row.previewUrl);row.imageFile=file;row.previewUrl=URL.createObjectURL(file);const thumb=card.querySelector(".variant-thumb");if(thumb)thumb.innerHTML=`<img src="${esc(row.previewUrl)}" alt="Variant photo">`;}}});
    $("variantRows")?.addEventListener("input",event=>{if(event.target.matches("[data-variant-field]:not([data-attribute-name])"))syncVariantField(event.target);});
    const table=$("productTable");if(table)new MutationObserver(queueRender).observe(table,{childList:true,subtree:true});
    window.addEventListener("duka-products-refresh",queueRender);queueRender();
    resetForm();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
