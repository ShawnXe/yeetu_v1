/* Yeetu text-scan helpers.
   1) prepare()    – crop + grayscale + contrast-stretch a camera frame so OCR sees clean text
   2) cleanWords() – drop low-confidence / junk words (wood grain, shadows, symbols)
   3) match()      – fuzzy-match the clean words against the shop's OWN product vocabulary,
                     weighting rare words (brand names) far above common ones (premium, maize)
   4) box()        – bounding box of the words, in video pixels, for the tracking outline */
(()=>{
"use strict";

const CHARS="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const STOP=new Set(("the and for with from your this that are not all per net weight best before use date exp mfg batch made "+
  "kenya ltd limited www com store keep cool dry place essential vitamins minerals ingredients nutrition facts contains "+
  "na ya wa kwa ni la za au pakiti tarehe uzito bei").split(" "));

const norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g," ").trim();
// Fold look-alike characters OCR confuses (rn/m, 0/o, 1/i/l, 5/s) so "premlum" still meets "premium".
const fold=s=>s.replace(/rn/g,"m").replace(/0/g,"o").replace(/[1il]/g,"l").replace(/5/g,"s");
const okToken=t=>t.length>=3&&!STOP.has(t)&&!/^\d+$/.test(t);

/* ---------- 1. image preparation ---------- */
function prepare(src,sw,sh,crop,targetW){
  crop=crop||{x:0,y:0,w:1,h:1};
  const cx=Math.round(sw*crop.x),cy=Math.round(sh*crop.y),cw=Math.max(1,Math.round(sw*crop.w)),ch=Math.max(1,Math.round(sh*crop.h));
  const scale=Math.min(2,(targetW||1100)/cw);           // enlarge small text, never blow up a big photo
  const w=Math.max(1,Math.round(cw*scale)),h=Math.max(1,Math.round(ch*scale));
  const c=document.createElement("canvas");c.width=w;c.height=h;
  const x=c.getContext("2d",{willReadFrequently:true});
  x.drawImage(src,cx,cy,cw,ch,0,0,w,h);
  const img=x.getImageData(0,0,w,h),d=img.data,hist=new Uint32Array(256);
  for(let i=0;i<d.length;i+=4){const g=(d[i]*77+d[i+1]*150+d[i+2]*29)>>8;d[i]=g;hist[g]++}
  const total=w*h;let lo=0,hi=255,acc=0;
  for(let i=0;i<256;i++){acc+=hist[i];if(acc>=total*0.02){lo=i;break}}
  acc=0;for(let i=255;i>=0;i--){acc+=hist[i];if(acc>=total*0.02){hi=i;break}}
  const span=Math.max(40,hi-lo);                        // stretch contrast, but don't amplify flat/noisy frames
  for(let i=0;i<d.length;i+=4){
    let g=(d[i]-lo)*255/span;g=g<0?0:g>255?255:g;
    d[i]=d[i+1]=d[i+2]=g;d[i+3]=255;
  }
  x.putImageData(img,0,0);
  return {canvas:c,scale,cx,cy};
}

/* ---------- 2. clean OCR output ---------- */
function rawWords(d){
  if(d.words&&d.words.length)return d.words;
  const out=[];
  (d.blocks||[]).forEach(b=>(b.paragraphs||[]).forEach(p=>(p.lines||[]).forEach(l=>(l.words||[]).forEach(w=>out.push(w)))));
  return out;
}
function cleanWords(result,minConf){
  minConf=minConf==null?60:minConf;
  const d=(result&&result.data)||{},out=[];
  rawWords(d).forEach(w=>{
    const t=norm(w.text).replace(/ /g,""),conf=Number(w.confidence)||0;
    if(conf<minConf||t.length<3||/^\d+$/.test(t)||/(.)\1\1/.test(t))return;
    const letters=(t.match(/[a-z]/g)||[]).length;
    if(letters<t.length*0.7&&conf<85)return;            // mixed junk like x7k3
    if(!/[aeiouy]/.test(t)&&conf<85)return;             // no vowel = almost never a real word
    const b=w.bbox||{x0:0,y0:0,x1:0,y1:0};
    out.push({t,conf,x0:b.x0,y0:b.y0,x1:b.x1,y1:b.y1,h:b.y1-b.y0});
  });
  return out;
}
function box(words,prep){
  if(!words.length)return null;
  let x0=1e9,y0=1e9,x1=-1,y1=-1;
  words.forEach(w=>{if(w.x0<x0)x0=w.x0;if(w.y0<y0)y0=w.y0;if(w.x1>x1)x1=w.x1;if(w.y1>y1)y1=w.y1});
  const k=prep.scale||1;
  return {x0:x0/k+prep.cx,y0:y0/k+prep.cy,x1:x1/k+prep.cx,y1:y1/k+prep.cy};
}

/* ---------- 3. fuzzy product matching ---------- */
function lev(a,b,max){
  const la=a.length,lb=b.length;
  if(Math.abs(la-lb)>max)return max+1;
  let prev=new Array(lb+1),cur=new Array(lb+1);
  for(let j=0;j<=lb;j++)prev[j]=j;
  for(let i=1;i<=la;i++){
    cur[0]=i;let rowMin=i;
    for(let j=1;j<=lb;j++){
      const c=a.charCodeAt(i-1)===b.charCodeAt(j-1)?0:1;
      const v=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+c);
      cur[j]=v;if(v<rowMin)rowMin=v;
    }
    if(rowMin>max)return max+1;
    const t=prev;prev=cur;cur=t;
  }
  return prev[lb];
}
let cache=null;
function vocab(products){
  const now=Date.now();
  if(cache&&cache.ref===products&&cache.n===products.length&&now-cache.at<15000)return cache;
  const idx=new Map();
  products.forEach((p,i)=>{
    const toks=new Set();
    [p.name,p.brand,p.variant,p.variantLabel,p.packSize,p.sku,p.category,...(p.aliases||[]),...(p.ocrTerms||[]),...(p.tags||[])]
      .forEach(s=>norm(s).split(" ").forEach(t=>{if(okToken(t))toks.add(t)}));
    toks.forEach(t=>{let s=idx.get(t);if(!s)idx.set(t,s=new Set());s.add(i)});
  });
  const N=Math.max(products.length,1),list=[];
  idx.forEach((s,t)=>list.push({t,f:fold(t),idf:Math.log(1+N/s.size)}));
  cache={ref:products,n:products.length,at:now,idx,list,idf:new Map(list.map(x=>[x.t,x.idf])),foldIdx:new Map(list.map(x=>[x.f,x]))};
  return cache;
}
/* tokens: clean OCR words. Returns [{p,score,words}] best first, only products scoring >= minScore. */
function match(products,tokens,minScore){
  const V=vocab(products),found=new Map();
  new Set(tokens).forEach(w=>{
    if(!okToken(w))return;
    if(V.idx.has(w)){found.set(w,1);return}
    const fw=fold(w),same=V.foldIdx.get(fw);
    if(same){if((found.get(same.t)||0)<.9)found.set(same.t,.9);return}
    const maxD=w.length<=4?0:w.length<=8?1:2;
    if(!maxD)return;
    let best=null,bestD=99;
    for(const v of V.list){
      const d=lev(fw,v.f,maxD);
      if(d<=maxD&&(d<bestD||(d===bestD&&best&&v.idf>best.idf))){best=v;bestD=d}
    }
    if(best){const q=bestD===1?.75:.55;if((found.get(best.t)||0)<q)found.set(best.t,q)}
  });
  const score=new Map(),words=new Map();
  found.forEach((q,t)=>{
    const idf=V.idf.get(t)||0;
    V.idx.get(t).forEach(i=>{score.set(i,(score.get(i)||0)+idf*q);(words.get(i)||words.set(i,[]).get(i)).push(t)});
  });
  const min=minScore==null?2.5:minScore;
  return [...score].filter(([,s])=>s>=min).sort((a,b)=>b[1]-a[1]).slice(0,8)
    .map(([i,s])=>({p:products[i],score:s,words:words.get(i)}));
}

const api={CHARS,prepare,cleanWords,box,match,norm,lev};
(typeof window!=="undefined"?window:globalThis).YeetuOCR=api;
})();
