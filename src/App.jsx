import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./lib/supabase";
import Auth from "./Auth.jsx";
import { sendGift, subscribeToStreamer, payStreamerFee } from "./lib/payments";
import {
  startStream, endStream, toggleMic, toggleCamera,
  makeChannel, joinStream, leaveStream, playLocalVideo,
} from "./lib/stream";

/* ═══════════════════ TOKENS ═══════════════════ */
const C = {
  bg:"#06060F", surf:"#0B0B1C", card:"#101026", card2:"#14142E",
  border:"#1E1E3A", border2:"#28285A",
  cyan:"#00E5FF", amber:"#FF8C42", purple:"#B14EFF",
  gold:"#FFD166", emerald:"#00E5A0", pink:"#FF6BAE", sky:"#4DA6FF",
  text:"#EEEEFF", muted:"#6868A8", faint:"#2A2A50",
};

/* ═══════════════════ NOTIFICATION SOUNDS ═══════════════════ */
const playNotifSound=(type)=>{
  try{
    const ctx=new AudioContext();const g=ctx.createGain();g.connect(ctx.destination);
    if(type==="gift"){[523,659,784].forEach((freq,i)=>{const o=ctx.createOscillator();o.connect(g);o.type="sine";o.frequency.value=freq;g.gain.setValueAtTime(0,ctx.currentTime+i*0.12);g.gain.linearRampToValueAtTime(0.3,ctx.currentTime+i*0.12+0.02);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+i*0.12+0.25);o.start(ctx.currentTime+i*0.12);o.stop(ctx.currentTime+i*0.12+0.3);});}
    else if(type==="sub"){[392,523,659,784].forEach((freq,i)=>{const o=ctx.createOscillator();o.connect(g);o.type="triangle";o.frequency.value=freq;g.gain.setValueAtTime(0,ctx.currentTime+i*0.15);g.gain.linearRampToValueAtTime(0.25,ctx.currentTime+i*0.15+0.03);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+i*0.15+0.35);o.start(ctx.currentTime+i*0.15);o.stop(ctx.currentTime+i*0.15+0.4);});}
    else{const o=ctx.createOscillator();o.connect(g);o.type="sine";o.frequency.value=440;g.gain.setValueAtTime(0.2,ctx.currentTime);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.2);o.start(ctx.currentTime);o.stop(ctx.currentTime+0.2);}
  }catch(e){console.error(e);}
};

/* ═══════════════════ CURRENCIES ═══════════════════ */
const CURRENCIES={
  KE:{code:"KES",sym:"KSh",rate:129,flag:"🇰🇪",name:"Kenyan Shilling"},
  US:{code:"USD",sym:"$",rate:1,flag:"🇺🇸",name:"US Dollar"},
  GB:{code:"GBP",sym:"£",rate:0.79,flag:"🇬🇧",name:"British Pound"},
  EU:{code:"EUR",sym:"€",rate:0.92,flag:"🇪🇺",name:"Euro"},
  CA:{code:"CAD",sym:"CA$",rate:1.36,flag:"🇨🇦",name:"Canadian Dollar"},
  GH:{code:"GHS",sym:"GH₵",rate:15.2,flag:"🇬🇭",name:"Ghanaian Cedi"},
};
function useCurrency(){
  const [curKey,setCurKey]=useState("US");
  const cur=CURRENCIES[curKey];
  const fmt=useCallback((usd)=>{
    const n=usd*cur.rate;
    return cur.sym+(n>=1000?n.toLocaleString(undefined,{maximumFractionDigits:0}):n.toFixed(2));
  },[cur]);
  return {cur,fmt,curKey,setCurKey,allCurrencies:CURRENCIES};
}

/* ═══════════════════ STATIC CONFIG ═══════════════════ */
const CATS=["All","Music","Gaming","Tech","Food","Finance","Fitness","Art","Education","Comedy","Fashion","Travel","Sports","Lifestyle","News","Spirituality"];
const GIFTS_LIST=[
  {emoji:"star",name:"Star",usd:0.5},{emoji:"zap",name:"Fire",usd:1},
  {emoji:"diamond",name:"Diamond",usd:5},{emoji:"rocket",name:"Rocket",usd:10},
  {emoji:"crown",name:"Crown",usd:25},{emoji:"coins",name:"Bag",usd:50},
  {emoji:"trophy",name:"Trophy",usd:100},{emoji:"edit",name:"Amount",usd:0},
];
const STREAM_COLS=[C.cyan,C.purple,C.amber,C.emerald,C.gold,C.pink,C.sky];
const mapStreamRow=(s,profileMap={})=>{
  const profile=profileMap[s.streamer_id]||{};
  const name=profile.display_name||profile.username||s.streamer_name||"Streamer";
  const col=STREAM_COLS[parseInt((s.id||"0").toString().slice(-2)||"0",16)%STREAM_COLS.length]||C.cyan;
  return{
    id:s.id, streamer:name, av:(name[0]||"S").toUpperCase(),
    title:s.title||"Live Stream", viewers:s.viewer_count||0, gifts:s.gift_total||0,
    cat:s.category||"General", bg:"#0D0A20", col, verified:false, live:s.is_live!==false,
    channel_name:s.channel_name||"", thumbnail:s.thumbnail_url||"",
    streamer_id:s.streamer_id||"",
    sp:{w:s.sub_price_weekly||1.99,m:s.sub_price_monthly||5.99,a:s.sub_price_annually||49.99},
    avatar_url:profile.avatar_url||"", isReal:true,
  };
};

/* ═══════════════════ GLOBAL STYLES ═══════════════════ */
const GS=()=>(
<style>{`
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=Exo+2:wght@700;800;900&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Russo+One&display=swap');
@keyframes holoGlow{0%{text-shadow:0 0 8px #00E5FF55,0 0 20px #00E5FF33}50%{text-shadow:0 0 8px #B14EFF55,0 0 20px #B14EFF33}100%{text-shadow:0 0 8px #00E5FF55,0 0 20px #00E5FF33}}
@keyframes holoShine{0%{background-position:200% center}100%{background-position:-200% center}}
.logoText{font-family:'Russo One',sans-serif;font-size:22px;font-weight:900;letter-spacing:4px;position:relative;display:inline-block;background:linear-gradient(90deg,#00E5FF 0%,#a0f0ff 20%,#ffffff 35%,#B14EFF 50%,#ffffff 65%,#a0f0ff 80%,#00E5FF 100%);background-size:250% auto;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:holoShine 4s linear infinite,holoGlow 4s ease-in-out infinite;}
.logoBadge{filter:drop-shadow(0 0 6px #00E5FF66) drop-shadow(0 0 14px #B14EFF44);}
@keyframes icoFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes icoBounce{0%,100%{transform:scale(1)}40%{transform:scale(1.35)}60%{transform:scale(.9)}}
@keyframes icoSpin{to{transform:rotate(360deg)}}
@keyframes icoPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.2);opacity:.75}}
@keyframes icoGlow{0%,100%{filter:drop-shadow(0 0 0px transparent)}50%{filter:drop-shadow(0 0 8px currentColor)}}
@keyframes menuSlideIn{0%{opacity:0;transform:translateX(-12px) scale(.95)}100%{opacity:1;transform:translateX(0) scale(1)}}
.icoFloat{animation:icoFloat 3s ease-in-out infinite;}
.icoBounce{animation:icoBounce .45s cubic-bezier(.17,.67,.3,1.5);}
.icoSpin{animation:icoSpin 2s linear infinite;}
.icoPulse{animation:icoPulse 2s ease-in-out infinite;}
.icoGlow{animation:icoGlow 2.5s ease-in-out infinite;}
.icoRise{animation:icoRise .35s cubic-bezier(.17,.67,.3,1.3) both;}
.icoBtn{display:inline-flex;align-items:center;justify-content:center;transition:transform .18s,filter .18s;cursor:pointer;}
.icoBtn:hover{transform:scale(1.22);}
.sCard{transition:transform .22s cubic-bezier(.17,.67,.3,1.2),box-shadow .22s;}
.sCard:hover{transform:translateY(-6px) scale(1.02);box-shadow:0 16px 40px rgba(0,0,0,.5);}
.sCard:active{transform:scale(.97);}
.btn{transition:transform .14s cubic-bezier(.17,.67,.3,1.3),box-shadow .14s,opacity .14s;}
.btn:hover{transform:translateY(-2px);}
.btn:active{transform:scale(.94) translateY(0);}
@keyframes cardIn{from{opacity:0;transform:translateY(20px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
.cardIn{animation:cardIn .35s cubic-bezier(.17,.67,.3,1.1) both;}
@keyframes barDown{from{transform:translateY(-100%);opacity:0}to{transform:translateY(0);opacity:1}}
.topBar{animation:barDown .4s cubic-bezier(.22,1,.36,1) both;}
.mOverlay{animation:overlayIn .2s ease both;}
@keyframes overlayIn{from{opacity:0}to{opacity:1}}
.mBox{animation:modalUp .3s cubic-bezier(.17,.67,.3,1.2) both;}
@keyframes modalUp{from{opacity:0;transform:scale(.88) translateY(20px)}to{opacity:1;transform:scale(1) translateY(0)}}
@keyframes giftFly{0%{transform:translateY(0) scale(1) rotate(0deg);opacity:1}30%{transform:translateY(-60px) scale(1.5) rotate(10deg);opacity:1}70%{transform:translateY(-130px) scale(1.1) rotate(-8deg);opacity:.7}100%{transform:translateY(-200px) scale(.2) rotate(20deg);opacity:0}}
.gFly{animation:giftFly 1.1s cubic-bezier(.17,.67,.2,1) forwards;pointer-events:none;position:fixed;font-size:28px;z-index:600;}
@keyframes wave{0%,100%{height:3px;opacity:.5}50%{height:18px;opacity:1}}
@keyframes skeletonShimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}
.skeleton{background:linear-gradient(90deg,#14142E 25%,#1e1e42 50%,#14142E 75%);background-size:800px 100%;animation:skeletonShimmer 1.4s ease-in-out infinite;border-radius:8px;}
@keyframes ripple{0%{transform:scale(0);opacity:.6}100%{transform:scale(2.5);opacity:0}}
@keyframes counterUp{from{transform:translateY(8px);opacity:0}to{transform:translateY(0);opacity:1}}
.counterUp{animation:counterUp .4s cubic-bezier(.17,.67,.3,1.3) both;}
@keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes pulseRing{0%{transform:scale(.95);box-shadow:0 0 0 0 rgba(0,229,255,.5)}70%{transform:scale(1);box-shadow:0 0 0 12px rgba(0,229,255,0)}100%{transform:scale(.95);box-shadow:0 0 0 0 rgba(0,229,255,0)}}
.pulseRing{animation:pulseRing 2s ease-out infinite;}
@keyframes gradientMove{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
.gradientAnimate{background-size:300% 300%;animation:gradientMove 4s ease infinite;}
@keyframes fadeInStagger{from{opacity:0;transform:translateY(18px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
.fadeInStagger{animation:fadeInStagger .4s cubic-bezier(.17,.67,.3,1.1) both;}
@keyframes connectingPulse{0%,100%{opacity:1}50%{opacity:.4}}
.connectingPulse{animation:connectingPulse 1.2s ease-in-out infinite;}
@keyframes scaleIn{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}
.scaleIn{animation:scaleIn .35s cubic-bezier(.34,1.56,.64,1) both;}
@keyframes heartBeat{0%,100%{transform:scale(1)}14%{transform:scale(1.3)}28%{transform:scale(1)}42%{transform:scale(1.2)}70%{transform:scale(1)}}
.heartBeat{animation:heartBeat 1.3s ease-in-out infinite;}
.wBar{width:3px;border-radius:3px;background:#00E5FF;display:inline-block;margin:0 1.5px;animation:wave 1s ease-in-out infinite;}
@keyframes livePulse{0%{box-shadow:0 0 0 0 rgba(255,45,45,.8)}70%{box-shadow:0 0 0 10px rgba(255,45,45,0)}100%{box-shadow:0 0 0 0 rgba(255,45,45,0)}}
.liveDot{width:8px;height:8px;border-radius:50%;background:#FF2D2D;display:inline-block;animation:livePulse 1.4s ease infinite;}
.liveBadge{display:inline-flex;align-items:center;gap:5px;background:rgba(0,0,0,.75);border-radius:7px;padding:3px 8px;border:1px solid #FF2D2D44;font-size:10px;color:#FF2D2D;font-weight:900;font-family:'Exo 2';}
.page{animation:fadeUp .32s cubic-bezier(.22,1,.36,1) both;}
@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes chatIn{from{opacity:0;transform:translateX(-14px)}to{opacity:1;transform:translateX(0)}}
.chatMsg{animation:chatIn .25s cubic-bezier(.17,.67,.3,1.1) both;}
@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(-20px) scale(.9)}to{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}}
.toast{animation:toastIn .35s cubic-bezier(.17,.67,.3,1.3) both;}
@keyframes statPop{0%{transform:scale(.8);opacity:0}70%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
.statVal{animation:statPop .45s cubic-bezier(.17,.67,.3,1.3) both;}
@keyframes spin{to{transform:rotate(360deg)}}
.spin{animation:spin .9s linear infinite;}
@keyframes popIn{0%{transform:scale(.7);opacity:0}70%{transform:scale(1.06)}100%{transform:scale(1);opacity:1}}
.popIn{animation:popIn .36s cubic-bezier(.17,.67,.3,1.3) both;}
.tag{display:inline-flex;align-items:center;gap:3px;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:800;}
.divider{height:1px;background:#1E1E3A;margin:14px 0;}
@keyframes glowR{0%,100%{box-shadow:0 4px 18px #FF2D2D55}50%{box-shadow:0 4px 32px #FF2D2D99}}
.glowR{animation:glowR 2s ease infinite;}
.toggle{width:46px;height:26px;border-radius:13px;cursor:pointer;position:relative;border:none;padding:0;transition:background .3s;}
.toggleThumb{width:20px;height:20px;border-radius:50%;background:#fff;position:absolute;top:3px;transition:left .3s,box-shadow .2s;}
.avRing{border-radius:50%;padding:2px;background:linear-gradient(135deg,#00E5FF,#B14EFF);}
.inp{background:#14142E;border:1.5px solid #1E1E3A;border-radius:12px;color:#EEEEFF;font-family:'Plus Jakarta Sans';font-size:14px;padding:11px 14px;outline:none;width:100%;transition:border .2s,box-shadow .2s,transform .15s;}
.inp:focus{border-color:#00E5FF;box-shadow:0 0 0 3px #00E5FF15;transform:translateY(-1px);}
.card{background:#101026;border:1px solid #1E1E3A;border-radius:16px;transition:border-color .2s,box-shadow .2s;}
.card:hover{border-color:#28285A;}
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
html,body{margin:0!important;padding:0!important;width:100%!important;overflow-x:hidden!important;}
body{background:#06060F;color:#EEEEFF;font-family:'Plus Jakarta Sans',sans-serif;overscroll-behavior-x:none;}
#root{max-width:100%!important;margin:0!important;padding:0!important;width:100%!important;}
.exo{font-family:'Exo 2',sans-serif;}
::-webkit-scrollbar{width:6px;height:6px;}
::-webkit-scrollbar-track{background:#06060F;}
::-webkit-scrollbar-thumb{background:#28285A;border-radius:6px;}
.sx{overflow-x:auto;scrollbar-width:none;-ms-overflow-style:none;}
.sx::-webkit-scrollbar{display:none;}
.topBar{position:fixed;top:0;left:0;right:0;height:60px;background:rgba(6,6,15,.95);backdrop-filter:blur(20px);border-bottom:1px solid #1E1E3A;z-index:300;display:flex;align-items:center;padding:0 16px;gap:12px;}
.mobileNav{display:flex;position:fixed;bottom:0;left:0;right:0;background:rgba(6,6,15,.96);backdrop-filter:blur(24px);border-top:1px solid #1E1E3A;z-index:300;padding:0 0 4px;}
.mnBtn{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:9px 4px 6px;cursor:pointer;border:none;background:none;color:#6868A8;transition:color .2s,transform .15s;}
.mnBtn:active{transform:scale(.9);}
.mnBtn.on{color:#00E5FF;}
.mnBtn span{font-size:9px;font-weight:800;letter-spacing:.5px;font-family:'Exo 2';}
@media(min-width:900px){
  .mobileNav{display:none;}
  .desktopMenu{display:flex !important;position:relative;}
  .topBar{padding:0 24px;}
}
.sLink{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:12px;cursor:pointer;color:#6868A8;font-weight:700;font-size:14px;border:none;background:none;width:100%;text-align:left;margin-bottom:2px;}
.sLink.on{background:#101026;color:#00E5FF;}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:2px;padding:0;width:100%;box-sizing:border-box;}
@media(min-width:768px){.grid{grid-template-columns:repeat(3,1fr);}}
@media(min-width:1200px){.grid{grid-template-columns:repeat(4,1fr);}}
@media(min-width:1600px){.grid{grid-template-columns:repeat(5,1fr);}}
.btn{border:none;cursor:pointer;font-family:'Plus Jakarta Sans';font-weight:800;border-radius:12px;letter-spacing:.2px;}
.btnC{background:linear-gradient(135deg,#00E5FF,#4DA6FF);color:#06060F;}
.btnC:hover{box-shadow:0 0 20px #00E5FF44;}
.btnA{background:linear-gradient(135deg,#FF8C42,#FF6BAE);color:#fff;}
.btnP{background:linear-gradient(135deg,#B14EFF,#FF6BAE);color:#fff;}
.btnG{background:linear-gradient(135deg,#FFD166,#FF8C42);color:#06060F;}
.btnS{background:#14142E;color:#EEEEFF;border:1px solid #28285A;}
.btnR{background:linear-gradient(135deg,#FF2D2D,#FF6060);color:#fff;}
.btnR:hover{box-shadow:0 0 20px #FF2D2D55;}
.searchBar{flex:1;max-width:600px;position:relative;display:flex;align-items:center;}
.searchBar input{width:100%;padding:9px 16px 9px 40px;border-radius:24px;background:#101026;border:1.5px solid #1E1E3A;color:#EEEEFF;font-size:14px;outline:none;font-family:'Plus Jakarta Sans';transition:border .2s,box-shadow .2s;}
.searchBar input:focus{border-color:#00E5FF;box-shadow:0 0 0 3px #00E5FF15;}
.searchBar .ico{position:absolute;left:13px;pointer-events:none;}
.mOverlay{position:fixed;inset:0;background:rgba(4,4,18,.85);backdrop-filter:blur(10px);z-index:500;display:flex;align-items:center;justify-content:center;padding:16px;}
.mBox{background:#0B0B1C;border-radius:20px;width:100%;max-width:480px;border:1px solid #28285A;padding:24px;max-height:90vh;overflow-y:auto;}
/* LIGHT MODE */
body.light{background:#F5F5F5 !important;color:#0F0F0F !important;}
body.light .topBar{background:rgba(255,255,255,.98) !important;border-bottom:1px solid #E0E0E0 !important;}
body.light .searchBar input{background:#F0F0F0 !important;border-color:#D0D0D0 !important;color:#0F0F0F !important;}
body.light .mobileNav{background:rgba(255,255,255,.98) !important;border-top:1px solid #E0E0E0 !important;}
body.light .mnBtn{color:#606060 !important;}
body.light .mnBtn.on{color:#065FD4 !important;}
body.light .mnBtn span{color:#606060 !important;}
body.light .mnBtn.on span{color:#065FD4 !important;}
body.light .card{background:#FFFFFF !important;border-color:#E5E5E5 !important;}
body.light .card *{color:#0F0F0F !important;}
body.light .sCard{background:#FFFFFF !important;border:none !important;box-shadow:none !important;}
body.light .mOverlay{background:rgba(0,0,0,.55) !important;}
body.light .mBox{background:#FFFFFF !important;border-color:#E0E0E0 !important;}
body.light .mBox *{color:#0F0F0F !important;}
body.light .inp{background:#F2F2F2 !important;border-color:#D0D0D0 !important;color:#0F0F0F !important;}
body.light .inp:focus{background:#fff !important;border-color:#065FD4 !important;}
body.light input,body.light textarea,body.light select{color:#0F0F0F !important;background:#F2F2F2 !important;}
body.light .btnS{background:#EFEFEF !important;color:#0F0F0F !important;border-color:#D0D0D0 !important;}
body.light [style*="#14142E"]{background:#F0F0F0 !important;color:#0F0F0F !important;}
body.light [style*="#101026"]{background:#FFFFFF !important;color:#0F0F0F !important;}
body.light [style*="#0B0B1C"]{background:#F5F5F5 !important;color:#0F0F0F !important;}
body.light [style*="#06060F"]{background:#F5F5F5 !important;color:#0F0F0F !important;}
body.light [style*="1E1E3A"]{background:#EEEEEE !important;border-color:#D5D5D5 !important;}
body.light [style*="6868A8"]{color:#555555 !important;}
body.light [style*="EEEEFF"]{color:#0F0F0F !important;}
body.light .sLink{color:#0F0F0F !important;}
body.light .sLink.on{background:#E8F0FE !important;color:#065FD4 !important;}
body.light .toggle{background:#D5D5D5 !important;}
body.light .liveBadge{background:rgba(255,255,255,.95) !important;}
body.light ::-webkit-scrollbar-track{background:#F5F5F5 !important;}
body.light ::-webkit-scrollbar-thumb{background:#CCCCCC !important;}
body.light .grid{background:#F5F5F5 !important;}
/* Force Agora-injected elements to fill their container */
.agora_video_player{width:100%!important;height:100%!important;position:absolute!important;inset:0!important;}
.agora_video_player video{width:100%!important;height:100%!important;object-fit:cover!important;position:absolute!important;inset:0!important;}
.settingsPanel{background:#14142E;color:#EEEEFF;}
body.light .settingsPanel{background:#F2F2F2 !important;color:#0F0F0F !important;}
body.light .settingsPanel *{color:#0F0F0F !important;}
.settingsInner{background:#101026;}
body.light .settingsInner{background:#FFFFFF !important;color:#0F0F0F !important;}
body.light .settingsInner *{color:#0F0F0F !important;}
body.light .btnP{background:linear-gradient(135deg,#B14EFF,#FF6BAE) !important;color:#fff !important;}
body.light .btnC{background:linear-gradient(135deg,#00E5FF,#4DA6FF) !important;color:#06060F !important;}
body.light .btnA{background:linear-gradient(135deg,#FF8C42,#FF6BAE) !important;color:#fff !important;}
body.light .btnR{background:linear-gradient(135deg,#FF2D2D,#FF6060) !important;color:#fff !important;}
body.light .btnG{background:linear-gradient(135deg,#FFD166,#FF8C42) !important;color:#06060F !important;}
body.light *{transition:background .2s,color .15s,border-color .15s,box-shadow .2s;}
body.light .sCard > div:first-child{filter:none;}
/* Studio light mode */
body.light .page .exo{color:#0F0F0F !important;}
body.light .page label{color:#444 !important;}
body.light .page .card{background:#fff !important;border-color:#E0E0E0 !important;}
body.light .page [style*="color:#FF2D2D"]{color:#FF2D2D !important;}
`}</style>
);

/* ═══════════════════ HELPERS ═══════════════════ */
const Av=({ch,sz=36,g=`linear-gradient(135deg,${C.cyan},${C.purple})`})=>(
  <div style={{width:sz,height:sz,borderRadius:"50%",background:g,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Exo 2",fontWeight:900,fontSize:sz*.38,color:"#fff",flexShrink:0}}>{ch}</div>
);
const Logo=()=>(
  <div style={{display:"flex",alignItems:"center",gap:8}}>
    <div className="logoBadge icoFloat" style={{width:34,height:34,borderRadius:11,background:`linear-gradient(135deg,${C.amber},${C.purple})`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`0 0 14px ${C.amber}66`}}><Ico n="gift" s={18} c="#fff" sw={2}/></div>
    <span className="logoText">GIFT3RS</span>
  </div>
);
const LiveBadge=({viewers})=>(
  <div className="liveBadge" style={{boxShadow:"0 0 10px rgba(255,45,45,.35)"}}><div className="liveDot heartBeat"/>LIVE{viewers>0&&<span style={{color:"rgba(255,255,255,.7)",fontWeight:600}}>&nbsp;·&nbsp;{viewers>=1000?(viewers/1000).toFixed(1)+"K":viewers}</span>}</div>
);
const Ico=({n,s=20,c="currentColor",sw=2})=>{
  const d={
    home:"M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10",
    search:"M11 19A8 8 0 1 0 11 3a8 8 0 0 0 0 16z M21 21l-4.35-4.35",
    mic:"M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v4 M8 23h8",
    trending:"M23 6L13.5 15.5 8.5 10.5 1 18 M17 6h6v6",
    profile:"M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    heart:"M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z",
    share:"M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8 M16 6l-4-4-4 4 M12 2v13",
    check:"M20 6L9 17l-5-5",
    back:"M19 12H5 M12 19l-7-7 7-7",
    close:"M18 6L6 18 M6 6l12 12",
    eye:"M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
    lock:"M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z M7 11V7a5 5 0 0 1 10 0v4",
    edit:"M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
    link:"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
    camera:"M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    wallet:"M20 12V8H6a2 2 0 0 1-2-2V4 M4 6v12a2 2 0 0 0 2 2h14v-4 M18 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    bell:"M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0",
    play:"M5 3l14 9-14 9V3z",
    settings:"M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
    crown:"M2 20h20 M4 20l2-10 6 4 4-8 4 14",
    id:"M2 9a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V9z M8 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M14 11h5 M14 14h3",
    gift:"M20 12v10H4V12 M22 7H2v5h20V7z M12 22V7 M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z",
    star:"M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
    zap:"M13 2L3 14h9l-1 8 10-12h-9l1-8z",
    rocket:"M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0 M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5",
    diamond:"M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41L13.7 2.71a2.41 2.41 0 0 0-3.41 0z",
    trophy:"M6 9H4a2 2 0 0 0-2 2v1a6 6 0 0 0 6 6 6 6 0 0 0 6-6V11a2 2 0 0 0-2-2h-2 M12 17v4 M8 21h8 M7 9V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v4",
    coins:"M18 6a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M18 6c0 6.627-5.373 12-12 12",
    creditcard:"M1 4h22v16H1z M1 10h22",
    phone:"M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.9A16 16 0 0 0 14 15l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z",
    building:"M3 21h18 M3 10h18 M5 6l7-3 7 3 M4 10v11 M20 10v11 M8 14v3 M12 14v3 M16 14v3",
    upload:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12",
    globe:"M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z M2 12h20 M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z",
    shield:"M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
    help:"M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3 M12 17h.01",
    logout:"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
    users:"M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
    mappin:"M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
    barchart:"M18 20V10 M12 20V4 M6 20v-6",
    video:"M15 10l4.553-2.069A1 1 0 0 1 21 8.845v6.31a1 1 0 0 1-1.447.894L15 14v-4z M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z",
    info:"M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 8v4 M12 16h.01",
    power:"M18.36 6.64a9 9 0 1 1-12.73 0 M12 2v10",
    award:"M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12z M8.21 13.89L7 23l5-3 5 3-1.21-9.12",
    activity:"M22 12h-4l-3 9L9 3l-3 9H2",
    sun:"M12 17A5 5 0 1 0 12 7a5 5 0 0 0 0 10z M12 1v2 M12 21v2 M4.22 4.22l1.42 1.42 M18.36 18.36l1.42 1.42 M1 12h2 M21 12h2 M4.22 19.78l1.42-1.42 M18.36 5.64l1.42-1.42",
    moon:"M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z",
    volume:"M11 5L6 9H2v6h4l5 4V5z M15.54 8.46a5 5 0 0 1 0 7.07 M19.07 4.93a10 10 0 0 1 0 14.14",
    volumeoff:"M11 5L6 9H2v6h4l5 4V5z M23 9l-6 6 M17 9l6 6",
  };
  return <svg width={s} height={s} fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d={d[n]||d.info}/></svg>;
};
const Toggle=({on,onChange})=>(
  <button className="toggle" style={{background:on?C.cyan:C.faint}} onClick={onChange}><div className="toggleThumb" style={{left:on?23:3}}/></button>
);
const PBar=({pct,color=C.cyan,h=4})=>(
  <div style={{height:h,borderRadius:h,background:C.faint,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(100,pct)}%`,background:color,borderRadius:h,transition:"width .8s ease"}}/></div>
);

/* ═══════════════════ FLOATING GIFTS ═══════════════════ */
const GIFT_EMOJIS={star:"⭐",zap:"⚡",diamond:"💎",rocket:"🚀",crown:"👑",coins:"💰",trophy:"🏆",gift:"🎁",edit:"💸"};
const FloatingGifts=({gifts,onDone})=>(
  <>{gifts.map(g=>(
    <div key={g.id} className="gFly" style={{left:g.x,bottom:140,display:"flex",flexDirection:"column",alignItems:"center",gap:4}} onAnimationEnd={()=>onDone(g.id)}>
      <div style={{fontSize:46,filter:"drop-shadow(0 0 16px gold) drop-shadow(0 0 32px rgba(255,200,0,.7)) drop-shadow(0 0 48px rgba(255,150,0,.4))"}}>{GIFT_EMOJIS[g.emoji]||"🎁"}</div>
      {g.count>1&&<div style={{background:"rgba(255,200,0,.9)",borderRadius:20,padding:"2px 8px",fontSize:11,fontWeight:900,color:"#000"}}>×{g.count}</div>}
    </div>
  ))}</>
);

/* ═══════════════════ GIFT MODAL ═══════════════════ */
const GiftModal=({stream,fmt,onClose,onSent,user,currency="USD"})=>{
  const [sel,setSel]=useState(null);
  const [custom,setCustom]=useState("");
  const [msg,setMsg]=useState("");
  const [stage,setStage]=useState("pick");
  const amount=sel?.usd||(custom?parseFloat(custom):0);
  const handleSend=async()=>{
    if(!amount)return;
    if(!user){alert("Please sign in to send gifts.");return;}
    setStage("confirm");
    try{
      const paystackCodes=["KES"];
      const paymentCurrency=paystackCodes.includes(currency)?currency:"USD";
      await sendGift({
        senderId:user.id,senderEmail:user.email,receiverId:stream.id,streamId:stream.id,
        amountUsd:amount,emoji:sel?.emoji||"gift",message:msg,currency:paymentCurrency,
        onSuccess:(result)=>{
            setStage("sent");
            // Always save to Supabase so streamer's real-time dashboard subscription fires
            if(user&&stream.id&&typeof stream.id==="string"){
              supabase.from("gifts").insert({
                stream_id:stream.id,
                sender_id:user.id,
                receiver_id:stream.streamer_id||stream.id,
                amount_usd:amount,
                emoji:sel?.emoji||"gift",
                message:msg||"",
                sender_username:user.email?.split("@")[0]||"Viewer",
              }).catch(e=>console.warn("Gift record failed",e));
            }
            onSent&&onSent(result.emoji||"gift",amount,msg,sel?.name==="Amount"?fmt(amount):null);
          },
        onCancel:()=>setStage("pick"),
      });
    }catch(err){console.error("Payment error",err);setStage("pick");}
  };
  return(
    <div className="mOverlay" onClick={onClose}>
      <div className="mBox" onClick={e=>e.stopPropagation()}>
        {stage==="pick"&&<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
            <div><div className="exo" style={{fontSize:18,fontWeight:900}}>Send a Gift</div><div style={{fontSize:12,color:C.muted}}>to <span style={{color:C.amber}}>{stream.streamer}</span></div></div>
            <button onClick={onClose} style={{background:C.card2,border:`1px solid ${C.border}`,borderRadius:"50%",width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}><Ico n="close" s={14} c={C.muted}/></button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:14}}>
            {GIFTS_LIST.map(g=>{const active=sel?.name===g.name;return(
              <button key={g.name} onClick={()=>{setSel(g);if(g.usd)setCustom("");}}
                style={{padding:"10px 4px",borderRadius:12,border:`1.5px solid ${active?C.amber:C.border}`,background:active?`${C.amber}18`:C.card,cursor:"pointer",textAlign:"center",transition:"all .18s",transform:active?"scale(1.05)":"scale(1)"}}>
                <div className="icoBtn" style={{color:active?C.amber:C.muted,marginBottom:2}}><Ico n={g.emoji} s={22} c={active?C.amber:C.muted}/></div>
                <div style={{fontSize:9,color:active?C.amber:C.muted,fontWeight:700,marginTop:2}}>{g.name}</div>
                <div className="exo" style={{fontSize:10,color:active?C.gold:C.muted,fontWeight:800}}>{g.usd?fmt(g.usd):"···"}</div>
              </button>
            );})}
          </div>
          {sel?.name==="Amount"&&<input className="inp" type="number" placeholder="Enter amount in USD..." value={custom} onChange={e=>setCustom(e.target.value)} style={{marginBottom:10}}/>}
          <input className="inp" placeholder="Add a message (optional)..." value={msg} onChange={e=>setMsg(e.target.value)} style={{marginBottom:12}}/>
          <div style={{background:`${C.cyan}10`,border:`1px solid ${C.cyan}22`,borderRadius:10,padding:"10px 14px",marginBottom:14,display:"flex",gap:8,alignItems:"center"}}>
            <span className="icoGlow" style={{color:C.cyan,display:"flex"}}><Ico n="info" s={15} c={C.cyan}/></span>
            <span style={{fontSize:12,color:C.muted}}>Platform takes <span style={{color:C.cyan}}>10%</span> · <span style={{color:C.emerald}}>{stream.streamer} receives 90%</span></span>
          </div>
          <button className="btn btnA" style={{width:"100%",padding:"13px",fontSize:15,opacity:amount?1:.45}} onClick={handleSend}>
            Send {sel?`${sel.name} ${amount?fmt(amount):""}`:""} Gift
          </button>
        </>}
        {stage==="confirm"&&<div style={{textAlign:"center",padding:"30px 0"}}><div style={{fontSize:44}} className="spin">⏳</div><div className="exo" style={{fontSize:18,fontWeight:900,marginTop:14}}>Processing...</div></div>}
        {stage==="sent"&&<div style={{textAlign:"center",padding:"20px 0"}}>
          <div className="icoBounce" style={{display:"flex",justifyContent:"center",marginBottom:8}}><Ico n="gift" s={64} c={C.gold}/></div>
          <div className="exo" style={{fontSize:22,fontWeight:900,color:C.amber}}>Gift Sent!</div>
          <p style={{color:C.muted,marginTop:8,lineHeight:1.6}}>{stream.streamer} just received your gift!</p>
          <div style={{background:`${C.emerald}15`,border:`1px solid ${C.emerald}30`,borderRadius:12,padding:"12px",marginTop:14}}>
            <span style={{color:C.emerald,fontWeight:700,display:"flex",alignItems:"center",gap:6}}><span className="icoBounce" style={{display:"inline-flex"}}><Ico n="check" s={16} c={C.emerald} sw={3}/></span>{fmt(amount)} sent successfully</span>
          </div>
          <button className="btn btnS" style={{width:"100%",padding:"12px",marginTop:14,fontSize:14}} onClick={onClose}>Back to Stream</button>
        </div>}
      </div>
    </div>
  );
};

/* ═══════════════════ SUBSCRIBE MODAL ═══════════════════ */
const SubModal=({stream,fmt,onClose,onSubscribed,user,currency="USD"})=>{
  const [plan,setPlan]=useState("monthly");
  const [stage,setStage]=useState("pick");
  const plans=[
    {id:"weekly",label:"Weekly",usd:stream.sp.w,badge:null},
    {id:"monthly",label:"Monthly",usd:stream.sp.m,badge:"POPULAR"},
    {id:"annually",label:"Annual",usd:stream.sp.a,badge:"BEST VALUE"},
  ];
  const chosen=plans.find(p=>p.id===plan);
  const handleSub=async()=>{
    if(!user){alert("Please sign in to subscribe.");return;}
    setStage("processing");
    try{
      await subscribeToStreamer({
        subscriberId:user.id,subscriberEmail:user.email,streamerId:stream.id,plan,priceUsd:chosen.usd,
        currency:["KES"].includes(currency)?currency:"USD",
        onSuccess:()=>{setStage("done");onSubscribed&&onSubscribed();},
        onCancel:()=>setStage("pick"),
      });
    }catch(err){console.error("Payment error",err);setStage("pick");}
  };
  return(
    <div className="mOverlay" onClick={onClose}>
      <div className="mBox" onClick={e=>e.stopPropagation()}>
        {stage==="pick"&&<>
          <div style={{textAlign:"center",marginBottom:18}}>
            <div className="avRing" style={{display:"inline-block",marginBottom:8}}><Av ch={stream.av} sz={52}/></div>
            <div className="exo" style={{fontSize:18,fontWeight:900}}>Subscribe to {stream.streamer}</div>
            <div style={{fontSize:12,color:C.muted,marginTop:4}}>Unlock all premium content &amp; perks</div>
          </div>
          <div style={{display:"flex",gap:8,marginBottom:18}}>
            {plans.map(p=>(
              <button key={p.id} onClick={()=>setPlan(p.id)}
                style={{flex:1,padding:"12px 6px",borderRadius:12,border:`1.5px solid ${plan===p.id?C.purple:C.border}`,background:plan===p.id?`${C.purple}18`:C.card,cursor:"pointer",textAlign:"center",position:"relative",transition:"all .2s",transform:plan===p.id?"scale(1.04)":"scale(1)"}}>
                {p.badge&&<div style={{position:"absolute",top:-9,left:"50%",transform:"translateX(-50%)",background:p.id==="annually"?C.amber:C.purple,borderRadius:6,padding:"2px 8px",fontSize:8,fontWeight:900,fontFamily:"Exo 2",whiteSpace:"nowrap",color:"#fff"}}>{p.badge}</div>}
                <div className="exo" style={{fontSize:10,color:plan===p.id?C.purple:C.muted,fontWeight:800}}>{p.label.toUpperCase()}</div>
                <div className="exo" style={{fontSize:16,fontWeight:900,color:plan===p.id?C.text:C.muted,marginTop:4}}>{fmt(p.usd)}</div>
              </button>
            ))}
          </div>
          {["All premium recorded videos","Exclusive subscriber-only streams","Special chat badge &amp; colour","Direct message streamer","Cancel any time"].map((f,i)=>(
            <div key={i} style={{fontSize:13,color:C.muted,marginBottom:7,display:"flex",alignItems:"center",gap:8}}><Ico n="check" s={13} c={C.emerald} sw={3}/>{f}</div>
          ))}
          <div className="divider"/>
          <div style={{fontSize:11,color:C.muted,marginBottom:14}}>Platform takes <span style={{color:C.purple}}>20%</span> · Streamer receives <span style={{color:C.emerald}}>80%</span></div>
          <button className="btn btnP" style={{width:"100%",padding:"13px",fontSize:15}} onClick={handleSub}>
            Subscribe · {fmt(chosen.usd)}/{plan==="annually"?"yr":plan==="monthly"?"mo":"wk"}
          </button>
          <button className="btn btnS" style={{width:"100%",padding:"11px",marginTop:10,fontSize:14}} onClick={onClose}>Not Now</button>
        </>}
        {stage==="processing"&&<div style={{textAlign:"center",padding:"30px 0"}}><div style={{fontSize:44}} className="spin">⏳</div><div className="exo" style={{fontSize:18,fontWeight:900,marginTop:14}}>Setting up subscription…</div></div>}
        {stage==="done"&&<div style={{textAlign:"center",padding:"20px 0"}}>
          <div className="icoBounce" style={{display:"flex",justifyContent:"center"}}><Ico n="star" s={64} c={C.purple}/></div>
          <div className="exo" style={{fontSize:22,fontWeight:900,color:C.purple,marginTop:12}}>You're Subscribed!</div>
          <p style={{color:C.muted,marginTop:8,lineHeight:1.6}}>Welcome to {stream.streamer}'s community!<br/>All premium content is now unlocked.</p>
          <button className="btn btnP" style={{width:"100%",padding:"13px",marginTop:18,fontSize:14}} onClick={onClose}>Start Watching</button>
        </div>}
      </div>
    </div>
  );
};

/* ═══════════════════ LIVE VIEWER ═══════════════════ */
const LiveViewer=({stream,fmt,onBack,user,onAuthRequired,cur,onViewProfile})=>{
  const [chat,setChat]=useState([]);
  const [msg,setMsg]=useState("");
  const [liked,setLiked]=useState(()=>{try{const savedLikes=JSON.parse(localStorage.getItem("gift3rs_likes")||"{}");return !!savedLikes[stream.id];}catch(_e){return false;}});
  const [likes,setLikes]=useState(stream.viewers);
  const [showGift,setShowGift]=useState(false);
  const [showSub,setShowSub]=useState(false);
  const [subscribed,setSubscribed]=useState(false);
  const [floats,setFloats]=useState([]);
  const [,setGiftTotal]=useState(stream.gifts);
  const [streamerLeft,setStreamerLeft]=useState(false);
  const [connecting,setConnecting]=useState(!!stream.channel_name);
  const [connected,setConnected]=useState(false);
  const [joinFailed,setJoinFailed]=useState(false);
  const [liveViewers,setLiveViewers]=useState(stream.viewers||0);
  const chatRef=useRef();
  const videoContainerRef=useRef();

  useEffect(()=>{
    if(!user||!stream.id)return;
    supabase.from("subscriptions").select("id").eq("subscriber_id",user.id).eq("streamer_id",stream.streamer_id||stream.id).eq("status","active").single().then(({data})=>{if(data)setSubscribed(true);});
  },[user,stream.id]);

  useEffect(()=>{
    if(!stream.channel_name)return;
    const handleVideoTrack=(track)=>{
      if(!videoContainerRef.current)return;
      const el=videoContainerRef.current;
      // Use Agora's native play() first — it's the most reliable for remote tracks.
      // For <video> elements, Agora play() sets srcObject internally.
      try{
        if(track.play){track.play(el);return;}
      }catch(_){}
      // Fallback: manually wire srcObject
      const raw=track.getMediaStreamTrack?.();
      if(raw){
        el.srcObject=new MediaStream([raw]);
        el.muted=false;
        el.play().catch(()=>{el.muted=true;el.play().catch(()=>{});});
      }
    };
    setConnecting(true);setConnected(false);setJoinFailed(false);
    joinStream({
      channelName:stream.channel_name,
      onVideoTrack:(track)=>{handleVideoTrack(track);setConnecting(false);setConnected(true);},
      onAudioTrack:()=>{setConnecting(false);setConnected(true);},
      onConnected:()=>{
        setConnecting(false);setConnected(true);
      },
      onStreamerLeft:()=>setStreamerLeft(true),
    }).then(ok=>{
      if(!ok){setConnecting(false);setJoinFailed(true);}
      else{
        // If host hasn't published yet, clear spinner after 15s
        setTimeout(()=>setConnecting(false),15000);
      }
    });
    return()=>{leaveStream();};
  },[stream.channel_name]); // eslint-disable-line


  useEffect(()=>{
    if(!stream.id||typeof stream.id!=="string")return;
    const channel=supabase.channel(`chat:${stream.id}`)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"chat_messages",filter:`stream_id=eq.${stream.id}`},
        payload=>{setChat(c=>[...c.slice(-25),{u:payload.new.username||"Viewer",t:payload.new.message,c:C.cyan,gift:payload.new.is_gift,id:payload.new.id}]);})
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"streams",filter:`id=eq.${stream.id}`},
        payload=>{if(payload.new?.viewer_count!=null)setLiveViewers(payload.new.viewer_count);})
      .subscribe();
    return()=>supabase.removeChannel(channel);
  },[stream.id]);

  useEffect(()=>{
    if(chatRef.current){const el=chatRef.current;const isNearBottom=el.scrollHeight-el.scrollTop-el.clientHeight<120;if(isNearBottom)el.scrollTop=el.scrollHeight;}
  },[chat]);

  const launchFloat=(emoji,amount=0)=>{
    const count=amount>=100?5:amount>=25?3:amount>=10?2:1;
    Array.from({length:count}).forEach((_,i)=>{
      setTimeout(()=>{const id=Date.now()+i;setFloats(f=>[...f,{id,emoji,x:40+Math.random()*240,count}]);},i*120);
    });
  };

  const sendChat=async()=>{
    if(!user){onAuthRequired&&onAuthRequired();return;}
    if(!msg.trim())return;
    const username=user?.email?.split("@")[0]||"Viewer";
    setChat(c=>[...c,{u:username,t:msg,c:C.amber,gift:null,id:Date.now()}]);
    setMsg("");
    // Save to Supabase for all real streams (UUIDs or any string ID)
    if(stream.id&&typeof stream.id==="string"){
      await supabase.from("chat_messages").insert({
        stream_id:stream.id,
        user_id:user.id,
        username:user.email?.split("@")[0]||"Viewer",
        message:msg,
      }).catch(e=>console.warn("Chat save failed",e));
    }
  };

  const onGiftSent=(emoji,amount,message,fmtAmt)=>{
    playNotifSound("gift");launchFloat(emoji,amount);setGiftTotal(g=>g+amount);
    const uname=user?.email?.split("@")[0]||"Viewer";
    const giftName={star:"Star",zap:"Fire",diamond:"Diamond",rocket:"Rocket",crown:"Crown",coins:"Bag",trophy:"Trophy"};
    setChat(c=>[...c,{u:uname,t:message||(emoji==="edit"?"sent a custom gift":"sent a "+giftName[emoji]),c:C.gold,gift:emoji==="edit"?"coins":emoji,customAmt:fmtAmt||null,id:Date.now()+1,type:"gift"}]);
  };

  const onSubscribed=()=>{
    playNotifSound("sub");setSubscribed(true);
    const uname=user?.email?.split("@")[0]||"Viewer";
    setChat(c=>[...c,{u:uname,t:"just subscribed! Welcome to the community 🎉",c:C.purple,gift:"star",id:Date.now(),type:"sub"}]);
  };

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:C.bg}}>
      <GS/>
      <FloatingGifts gifts={floats} onDone={id=>setFloats(f=>f.filter(g=>g.id!==id))}/>
      {showGift&&<GiftModal stream={stream} fmt={fmt} onClose={()=>setShowGift(false)} onSent={onGiftSent} user={user} currency={cur?.code||"USD"}/>}
      {showSub&&<SubModal stream={stream} fmt={fmt} onClose={()=>setShowSub(false)} onSubscribed={onSubscribed} user={user} currency={cur?.code||"USD"}/>}
      <div style={{display:"flex",flex:1,overflow:"hidden",flexDirection:"column"}}>
        <div style={{display:"flex",flex:1,overflow:"hidden"}}>
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div style={{position:"relative",background:`linear-gradient(160deg,${stream.bg},#000)`,aspectRatio:"16/9",maxHeight:"60vh",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              {/* Agora renders its own <video> inside this div — passing a <video> element to
                  track.play() causes Agora to nest a div inside it which browsers silently
                  drop, leaving a black screen.  A <div> container is the correct target. */}
              {stream.channel_name&&<div ref={videoContainerRef} style={{position:"absolute",inset:0,width:"100%",height:"100%",overflow:"hidden",zIndex:1,background:"#000"}}/>}
              {!stream.channel_name&&<>
                <div style={{position:"absolute",inset:0,background:`radial-gradient(circle at 50%,${stream.col}15,transparent 60%)`}}/>
                <div style={{zIndex:2,display:"flex",flexDirection:"column",alignItems:"center"}}>
                  <div className="avRing pulseRing" style={{display:"inline-block"}}><Av ch={stream.av} sz={72} g={`linear-gradient(135deg,${stream.col},${C.purple})`}/></div>
                  <div style={{fontSize:13,color:"rgba(255,255,255,.6)",textAlign:"center",marginTop:8}}>{stream.streamer} is live</div>
                </div>
                <div style={{position:"absolute",bottom:50,left:"50%",transform:"translateX(-50%)",display:"flex",gap:2,opacity:.4}}>
                  {[.9,1.1,.8,1.3,.7,1.0,.85,1.2,.75,1.1,.9,.8,1.3,.7,1.0].map((d,i)=>(<div key={i} className="wBar" style={{animationDelay:`${i*.07}s`,animationDuration:`${d}s`}}/>))}
                </div>
              </>}
              {/* Connecting overlay */}
              {connecting&&!streamerLeft&&<div style={{position:"absolute",inset:0,background:"rgba(6,6,15,.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:5,flexDirection:"column",gap:14,backdropFilter:"blur(4px)"}}>
                <div style={{width:56,height:56,borderRadius:"50%",border:`3px solid ${C.border}`,borderTopColor:C.cyan,animation:"spin .9s linear infinite"}}/>
                <div style={{fontWeight:800,fontSize:15,color:"#fff"}}>Connecting to stream…</div>
                <div className="connectingPulse" style={{fontSize:12,color:C.muted}}>Setting up live video</div>
              </div>}
              {/* Join failed overlay */}
              {joinFailed&&!streamerLeft&&<div style={{position:"absolute",inset:0,background:"rgba(6,6,15,.9)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:5,flexDirection:"column",gap:12,backdropFilter:"blur(4px)"}}>
                <div className="scaleIn" style={{display:"flex",justifyContent:"center"}}><Ico n="info" s={44} c={C.amber}/></div>
                <div style={{fontWeight:800,fontSize:15,color:"#fff",textAlign:"center"}}>Couldn't connect to live video</div>
                <div style={{fontSize:12,color:C.muted,textAlign:"center",maxWidth:240}}>The stream may still be starting up. Try refreshing.</div>
                <button className="btn btnC" style={{padding:"10px 22px",fontSize:13,marginTop:4}} onClick={()=>window.location.reload()}>Retry</button>
              </div>}
              {streamerLeft&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:3,flexDirection:"column",gap:12,backdropFilter:"blur(4px)"}}>
                <div className="icoPulse" style={{display:"flex",justifyContent:"center",marginBottom:8}}><Ico n="power" s={48} c={C.muted}/></div>
                <div style={{fontWeight:700,fontSize:16}}>Stream has ended</div>
                <button className="btn btnC" style={{padding:"10px 20px",fontSize:13}} onClick={onBack}>Back to Home</button>
              </div>}
              <button onClick={()=>{leaveStream();onBack();}} style={{position:"absolute",top:14,left:14,background:"rgba(0,0,0,.6)",border:"none",borderRadius:10,padding:"8px",cursor:"pointer",display:"flex",backdropFilter:"blur(6px)",zIndex:4}}><Ico n="back" s={18} c="#fff"/></button>
              <div style={{position:"absolute",top:14,right:14,display:"flex",gap:8,alignItems:"center",zIndex:4}}><LiveBadge viewers={liveViewers}/>{connected&&<div className="scaleIn" style={{background:"rgba(0,229,160,.15)",border:"1px solid rgba(0,229,160,.3)",borderRadius:7,padding:"3px 8px",fontSize:10,color:"#00E5A0",fontWeight:800,fontFamily:"Exo 2"}}>● HD</div>}</div>
              <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"14px 16px",background:"linear-gradient(transparent,rgba(0,0,0,.9))",zIndex:4}}>
                <div style={{fontWeight:700,fontSize:14}}>{stream.title}</div>
                <div style={{marginTop:5}}><span className="tag" style={{background:`${stream.col}25`,color:stream.col,border:`1px solid ${stream.col}30`,fontSize:10}}>{stream.cat}</span></div>
              </div>
              <div style={{position:"absolute",right:14,bottom:70,display:"flex",flexDirection:"column",gap:14,alignItems:"center",zIndex:4}}>
                <button onClick={()=>{if(!user){onAuthRequired&&onAuthRequired();return;}const newLiked=!liked;setLiked(newLiked);setLikes(l=>newLiked?l+1:l-1);try{const ls=JSON.parse(localStorage.getItem("gift3rs_likes")||"{}");if(newLiked)ls[stream.id]=true;else delete ls[stream.id];localStorage.setItem("gift3rs_likes",JSON.stringify(ls));}catch(e){console.error(e);}}} style={{background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,transition:"transform .15s"}} onMouseEnter={e=>e.currentTarget.style.transform="scale(1.2)"} onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
                  <div style={{filter:liked?"drop-shadow(0 0 8px #FF2D2D) drop-shadow(0 0 16px #FF2D2D88)":"none",transition:"filter .3s"}}>
                    <svg width={26} height={26} viewBox="0 0 24 24" fill={liked?"#FF2D2D":"none"} stroke={liked?"#FF2D2D":"#fff"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                  </div>
                  <span style={{fontSize:10,color:liked?"#FF2D2D":"#fff",fontWeight:liked?800:400}}>{(likes/1000).toFixed(1)}K</span>
                </button>
                <button onClick={()=>{const url=`${window.location.origin}?stream=${stream.id}`;if(navigator.share){navigator.share({title:stream.title,text:`Watch ${stream.streamer} live on GIFT3RS!`,url});}else{navigator.clipboard.writeText(url).then(()=>alert("Stream link copied!"));}}} style={{background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                  <Ico n="share" s={22} c="#fff"/>
                  <span style={{fontSize:10,color:"#fff"}}>Share</span>
                </button>
              </div>
            </div>
            <div style={{padding:"12px 16px",display:"flex",alignItems:"center",gap:12,borderBottom:`1px solid ${C.border}`,background:C.surf,flexShrink:0}}>
              <Av ch={stream.av} sz={40} g={`linear-gradient(135deg,${stream.col},${C.purple})`}/>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span className="exo" style={{fontWeight:900,fontSize:15,cursor:"pointer"}} onClick={()=>onViewProfile&&onViewProfile(stream)} onMouseEnter={e=>e.currentTarget.style.textDecoration="underline"} onMouseLeave={e=>e.currentTarget.style.textDecoration="none"}>{stream.streamer}</span>
                  {(stream.verified||stream.viewers>=1000)&&<span title="Verified Creator" style={{display:"inline-flex",width:18,height:18,borderRadius:"50%",background:stream.viewers>=1000&&likes>=1000?"#0095F6":"#FF8C42",alignItems:"center",justifyContent:"center",flexShrink:0}}><Ico n="check" s={11} c="#fff" sw={3}/></span>}
                </div>
                <div style={{fontSize:12,color:C.muted}}>from {fmt(stream.sp.m)}/month</div>
              </div>
              <button onClick={()=>setShowSub(true)} className={`btn ${subscribed?"btnS":"btnP"}`} style={{padding:"9px 18px",fontSize:13}}>
                {subscribed?<span style={{display:"flex",alignItems:"center",gap:5}}><Ico n="check" s={13} c="#06060F" sw={3}/>Subscribed</span>:"Subscribe"}
              </button>
            </div>
          </div>
          <div style={{width:320,flexShrink:0,display:"flex",flexDirection:"column",borderLeft:`1px solid ${C.border}`,background:C.surf}}>
            <div style={{padding:"12px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:8}}><div className="liveDot"/><span className="exo" style={{fontWeight:900,fontSize:13}}>LIVE CHAT</span></div>
            <div ref={chatRef} style={{flex:1,overflowY:"auto",padding:"10px 12px"}}>
              {chat.map((m,i)=>(
                <div key={m.id||i} className="chatMsg" style={{marginBottom:8}}>
                  {m.gift?(
                    <div style={{background:`linear-gradient(135deg,${C.gold}18,${C.amber}08)`,border:`1px solid ${C.gold}35`,borderRadius:12,padding:"8px 12px",display:"flex",alignItems:"center",gap:8}}>
                      <div style={{minWidth:32,height:32,borderRadius:10,background:`${C.gold}25`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,padding:m.customAmt?"0 8px":0}}>
                        {m.customAmt?<span style={{fontSize:12,fontWeight:900,color:C.gold,whiteSpace:"nowrap"}}>{m.customAmt}</span>:<Ico n={m.gift} s={16} c={C.gold}/>}
                      </div>
                      <div><span style={{fontWeight:800,color:C.gold,fontSize:13}}>{m.u}</span><span style={{fontSize:12,color:C.text,marginLeft:4}}>{m.t}</span></div>
                    </div>
                  ):m.type==="sub"?(
                    <div style={{background:`linear-gradient(135deg,${C.purple}18,${C.pink}08)`,border:`1px solid ${C.purple}35`,borderRadius:12,padding:"8px 12px",display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:32,height:32,borderRadius:10,background:`${C.purple}25`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Ico n="star" s={16} c={C.purple}/></div>
                      <div><span style={{fontWeight:800,color:C.purple,fontSize:13}}>{m.u}</span><span style={{fontSize:12,color:C.text,marginLeft:4}}>{m.t}</span></div>
                    </div>
                  ):(
                    <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                      <div style={{width:22,height:22,borderRadius:"50%",background:m.c,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:"#fff"}}>{m.u[0]}</div>
                      <div style={{lineHeight:1.5}}><span style={{fontSize:12,fontWeight:800,color:m.c}}>{m.u} </span><span style={{fontSize:13,color:C.text}}>{m.t}</span></div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={{padding:"10px 12px",borderTop:`1px solid ${C.border}`,background:"rgba(0,0,0,.2)"}}>
              <div className="sx" style={{display:"flex",gap:6,marginBottom:10}}>
                {GIFTS_LIST.slice(0,5).map(g=>(
                  <button key={g.name} onClick={()=>{if(!user){onAuthRequired&&onAuthRequired();return;}setShowGift(true);}}
                    style={{flexShrink:0,background:C.card,border:`1.5px solid ${C.border}`,borderRadius:10,padding:"6px 10px",display:"flex",flexDirection:"column",alignItems:"center",gap:3,cursor:"pointer",transition:"all .18s",minWidth:48}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor=C.amber;e.currentTarget.style.background=`${C.amber}15`;}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.background=C.card;}}>
                    <div style={{display:"flex"}}><Ico n={g.emoji} s={18} c={C.amber}/></div>
                    <span className="exo" style={{fontSize:9,color:C.gold,fontWeight:800}}>{g.usd?fmt(g.usd):"···"}</span>
                  </button>
                ))}
              </div>
              <div style={{display:"flex",gap:8}}>
                <input className="inp" style={{flex:1,padding:"9px 12px",fontSize:13}} placeholder={user?"Say something...":"Sign in to chat..."} value={msg} onChange={e=>setMsg(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendChat()} onClick={()=>{if(!user)onAuthRequired&&onAuthRequired();}}/>
                <button onClick={()=>{if(!user){onAuthRequired&&onAuthRequired();return;}setShowGift(true);}} className="btn btnA" style={{padding:"9px 12px",fontSize:14,display:"flex",alignItems:"center",gap:5,flexShrink:0}}><Ico n="gift" s={14} c="#06060F"/>Gift</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════ STREAM CARD ═══════════════════ */
const StreamCard=({s,fmt,onClick,onViewProfile})=>{
  const thumbSrc=s.thumbnail||s.thumbnail_url||"";
  const [hovered,setHovered]=useState(false);
  const [muted,setMuted]=useState(true);
  const [previewFrame,setPreviewFrame]=useState(0);
  const [hoverThumb,setHoverThumb]=useState(""); // live frame or thumbnail fetched on hover
  const hoverTimer=useRef(null);
  const frameTimer=useRef(null);

  const handleMouseEnter=()=>{
    hoverTimer.current=setTimeout(()=>{
      setHovered(true);
      frameTimer.current=setInterval(()=>setPreviewFrame(f=>(f+1)%4),800);
      // For real streams without a thumbnail: fetch thumbnail on hover
      if(s.isReal&&!thumbSrc){
        supabase.from("streams")
          .select("thumbnail_url")
          .eq("id",s.id).single()
          .then(({data})=>{
            if(data?.thumbnail_url) setHoverThumb(data.thumbnail_url);
          });
      }
    },500);
  };
  const handleMouseLeave=()=>{
    clearTimeout(hoverTimer.current);
    clearInterval(frameTimer.current);
    setHovered(false);setPreviewFrame(0);setMuted(true);
  };

  // Best available preview image for this card
  const previewImg=thumbSrc||hoverThumb||"";

  const previewColors=[
    `radial-gradient(circle at 30% 40%,${s.col}55,${s.bg} 60%)`,
    `radial-gradient(circle at 70% 30%,${s.col}44,${s.bg} 65%)`,
    `radial-gradient(circle at 50% 70%,${s.col}66,${s.bg} 55%)`,
    `radial-gradient(circle at 20% 60%,${s.col}33,${s.bg} 70%)`,
  ];
  return(
    <div className="sCard" onClick={onClick} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} style={{position:"relative"}}>
      <div style={{position:"relative",background:`linear-gradient(160deg,${s.bg},#000)`,paddingTop:"56.25%",overflow:"hidden"}}>
        {/* Thumbnail: show set thumbnail, fetched live frame, or animated preview */}
        {previewImg?(
          <div style={{position:"absolute",inset:0}}>
            <img src={previewImg} alt={s.title} style={{width:"100%",height:"100%",objectFit:"cover",display:"block",transition:"opacity .3s"}}/>
            {/* YouTube-style hover overlay */}
            {hovered&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.4)",display:"flex",alignItems:"center",justifyContent:"center",animation:"overlayIn .15s ease both"}}>
              {s.live&&<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
                <div style={{display:"flex",alignItems:"center",gap:6,background:"rgba(255,45,45,.85)",borderRadius:8,padding:"5px 14px",marginBottom:4}}>
                  <div className="liveDot" style={{width:7,height:7}}/>
                  <span style={{fontSize:12,fontWeight:900,color:"#fff",fontFamily:"Exo 2",letterSpacing:1}}>LIVE</span>
                </div>
                <div style={{fontSize:11,color:"rgba(255,255,255,.8)",fontWeight:600}}>Click to watch</div>
              </div>}
            </div>}
          </div>
        ):(
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:hovered?previewColors[previewFrame]:`radial-gradient(circle at 50%,${s.col}18,transparent 65%)`,transition:"background 0.8s ease"}}>
            {hovered&&s.live&&<div style={{position:"absolute",bottom:32,left:"50%",transform:"translateX(-50%)",display:"flex",gap:3,alignItems:"flex-end"}}>{[0.4,0.7,1,0.6,0.9,0.5,0.8,1,0.4,0.7,0.9,0.5].map((h,i)=>(<div key={i} className="wBar" style={{height:20*h,animationDelay:`${i*0.08}s`,animationDuration:`${0.6+h*0.4}s`,opacity:0.7}}/>))}</div>}
            <Av ch={s.av} sz={44} g={`linear-gradient(135deg,${s.col},${C.purple})`}/>
          </div>
        )}
        <div style={{position:"absolute",top:8,left:8}}>{s.live?<LiveBadge/>:<div style={{background:"rgba(0,0,0,.7)",borderRadius:6,padding:"3px 7px",fontSize:9,fontFamily:"Exo 2",fontWeight:700,color:C.muted}}>OFFLINE</div>}</div>
        {s.live&&<div className="counterUp" style={{position:"absolute",bottom:8,right:8,background:"rgba(0,0,0,.75)",borderRadius:6,padding:"3px 8px",display:"flex",alignItems:"center",gap:4,backdropFilter:"blur(4px)"}}><Ico n="eye" s={10} c="rgba(255,255,255,.7)"/><span style={{fontSize:9,color:"rgba(255,255,255,.8)",fontWeight:700}}>{s.viewers>=1000?(s.viewers/1000).toFixed(1)+"K":s.viewers}</span></div>}
        {s.gifts>0&&<div style={{position:"absolute",bottom:8,left:8,display:"flex",alignItems:"center",gap:4,background:"rgba(0,0,0,.7)",borderRadius:6,padding:"3px 8px",backdropFilter:"blur(4px)"}}><Ico n="gift" s={10} c={C.amber}/><span className="exo" style={{fontSize:9,color:C.gold,fontWeight:800}}>{fmt(s.gifts*.1)}</span></div>}
        {hovered&&s.live&&<div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",justifyContent:"space-between",background:"linear-gradient(to bottom,rgba(0,0,0,.15) 0%,rgba(0,0,0,.65) 100%)",animation:"overlayIn .18s ease both"}}>
          <div style={{display:"flex",justifyContent:"space-between",padding:"8px",alignItems:"flex-start"}}>
            <div style={{background:"rgba(0,0,0,.75)",borderRadius:6,padding:"3px 8px",display:"flex",alignItems:"center",gap:5,border:"1px solid rgba(255,255,255,.15)",backdropFilter:"blur(4px)"}}><div className="heartBeat" style={{width:6,height:6,borderRadius:"50%",background:"#FF2D2D"}}/><span style={{fontSize:9,color:"#fff",fontWeight:800,fontFamily:"Exo 2",letterSpacing:.5}}>LIVE PREVIEW</span></div>
            <button style={{background:"rgba(0,0,0,.75)",border:"1px solid rgba(255,255,255,.25)",borderRadius:"50%",width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",backdropFilter:"blur(4px)"}} onClick={e=>{e.stopPropagation();setMuted(m=>!m);}} title={muted?"Turn on sound":"Mute"}>
              <Ico n={muted?"volumeoff":"volume"} s={13} c="#fff"/>
            </button>
          </div>
          <div style={{display:"flex",justifyContent:"center",alignItems:"center",flex:1}}>
            <div className="scaleIn" style={{width:50,height:50,borderRadius:"50%",background:"rgba(255,255,255,.18)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",border:"2px solid rgba(255,255,255,.35)"}}>
              <Ico n="play" s={20} c="#fff"/>
            </div>
          </div>
          <div style={{padding:"6px 8px"}}/>
        </div>}
      </div>
      <div style={{padding:"10px 10px 12px"}}>
        <div style={{fontSize:13,fontWeight:700,lineHeight:1.35,marginBottom:6,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{s.title}</div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <Av ch={s.av} sz={22} g={`linear-gradient(135deg,${s.col},${C.purple})`}/>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <span onClick={e=>{e.stopPropagation();onViewProfile&&onViewProfile(s);}} style={{fontSize:12,color:C.muted,fontWeight:600,cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.color=C.cyan} onMouseLeave={e=>e.currentTarget.style.color=C.muted}>{s.streamer}</span>
              {s.verified&&<span style={{display:"inline-flex",width:16,height:16,borderRadius:"50%",background:"#0095F6",alignItems:"center",justifyContent:"center",flexShrink:0}}><Ico n="check" s={9} c="#fff" sw={3}/></span>}
            </div>
            <span className="tag" style={{background:`${s.col}18`,color:s.col,fontSize:9,padding:"2px 7px"}}>{s.cat}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════ HOME FEED ═══════════════════ */
const SkeletonCard=({delay=0})=>(
  <div style={{animationDelay:`${delay}ms`}} className="fadeInStagger">
    <div style={{paddingTop:"56.25%",position:"relative",borderRadius:"0 0 0 0",overflow:"hidden"}}>
      <div className="skeleton" style={{position:"absolute",inset:0,borderRadius:0}}/>
    </div>
    <div style={{padding:"10px 10px 12px"}}>
      <div className="skeleton" style={{height:13,marginBottom:8,width:"80%"}}/>
      <div className="skeleton" style={{height:13,width:"55%"}}/>
    </div>
  </div>
);

const HomeFeed=({fmt,onStream,onViewProfile})=>{
  const [cat,setCat]=useState("All");
  const [streams,setStreams]=useState([]);
  const [featured,setFeatured]=useState(null);
  const [loading,setLoading]=useState(true);
  const [feedError,setFeedError]=useState("");

  useEffect(()=>{
    let cancelled=false;
    const load=async()=>{
      const {data:rows,error}=await supabase
        .from("streams")
        .select("*")
        .eq("is_live",true)
        .order("viewer_count",{ascending:false})
        .limit(30);
      if(cancelled)return;
      if(error){
        console.error("[HomeFeed]",error.message);
        setFeedError(error.message);
        setLoading(false);return;
      }
      setFeedError("");
      const ids=[...new Set((rows||[]).map(s=>s.streamer_id).filter(Boolean))];
      let profileMap={};
      if(ids.length>0){
        const {data:profiles}=await supabase.from("profiles").select("id,display_name,username,avatar_url").in("id",ids);
        if(profiles) profiles.forEach(p=>{profileMap[p.id]=p;});
      }
      if(cancelled)return;
      const mapped=(rows||[]).map(s=>mapStreamRow(s,profileMap));
      setStreams(mapped);
      setFeatured(f=>{if(mapped.length>0&&(!f?.isReal||!mapped.find(r=>r.id===f.id)))return mapped[0];return f||null;});
      setLoading(false);
    };
    load();
    // Real-time: re-fetch on any stream change
    const ch=supabase.channel("homefeed_streams")
      .on("postgres_changes",{event:"*",schema:"public",table:"streams"},()=>load())
      .subscribe();
    // Periodic refresh every 30 seconds as backup
    const interval=setInterval(load,30000);
    return()=>{cancelled=true;supabase.removeChannel(ch);clearInterval(interval);};
  },[]);

  const filtered=cat==="All"?streams:streams.filter(s=>s.cat===cat);

  return(
    <div style={{width:"100%",minWidth:0,boxSizing:"border-box",overflowX:"hidden",padding:0,margin:0}}>
      {featured?(
        <div style={{position:"relative",height:320,cursor:"pointer",overflow:"hidden"}} onClick={()=>onStream(featured)} className="cardIn">
          <div style={{position:"absolute",inset:0,background:featured.thumbnail?`url(${featured.thumbnail}) center/cover no-repeat`:`linear-gradient(135deg,${featured.col}44,${C.purple}22,#000)`,transition:"transform .4s ease"}} onMouseEnter={e=>e.currentTarget.style.transform="scale(1.03)"} onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}/>
          {/* Animated glow orbs */}
          <div style={{position:"absolute",top:-60,right:-60,width:340,height:340,borderRadius:"50%",background:`${featured.col||C.cyan}25`,filter:"blur(80px)",animation:"gradientMove 6s ease infinite",backgroundSize:"200%"}}/>
          <div style={{position:"absolute",bottom:-40,left:-40,width:280,height:280,borderRadius:"50%",background:`${C.purple}20`,filter:"blur(60px)"}}/>
          {!featured.thumbnail&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}><div className="avRing pulseRing"><Av ch={featured.av} sz={100} g={`linear-gradient(135deg,${featured.col||C.cyan},${C.purple})`}/></div></div>}
          <div style={{position:"absolute",inset:0,background:"linear-gradient(transparent 20%,rgba(0,0,0,.97))"}}/>
          <div style={{position:"absolute",top:16,left:16,display:"flex",gap:8,alignItems:"center"}}>
            <LiveBadge viewers={featured.viewers}/>
          </div>
          <div style={{position:"absolute",top:16,right:16,display:"flex",gap:8,alignItems:"center"}}>
            <span className="tag gradientAnimate" style={{background:`linear-gradient(90deg,${C.amber},${C.gold},${C.amber})`,color:"#06060F",border:"none",fontSize:11,padding:"5px 12px",fontWeight:900,boxShadow:`0 0 14px ${C.amber}55`}}>
              <span style={{display:"inline-flex",alignItems:"center",gap:5}}><div className="liveDot heartBeat" style={{width:7,height:7}}/>FEATURED LIVE</span>
            </span>
          </div>
          <div style={{position:"absolute",bottom:18,left:20,right:20}}>
            <div style={{fontWeight:900,fontSize:22,lineHeight:1.3,marginBottom:10,color:"#fff",textShadow:"0 2px 12px rgba(0,0,0,.8)"}}>{featured.title}</div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                {featured.avatar_url?<img src={featured.avatar_url} style={{width:32,height:32,borderRadius:"50%",objectFit:"cover",border:`2px solid ${featured.col}66`}} alt=""/>:<Av ch={featured.av} sz={32} g={`linear-gradient(135deg,${featured.col||C.cyan},${C.purple})`}/>}
                <span style={{fontSize:14,color:"rgba(255,255,255,.9)",fontWeight:700}}>{featured.streamer}</span>
                <span className="tag" style={{background:`${featured.col||C.cyan}25`,color:featured.col||C.cyan,border:`1px solid ${featured.col||C.cyan}35`,fontSize:10,padding:"2px 8px"}}>{featured.cat}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,background:"rgba(255,255,255,.1)",borderRadius:10,padding:"6px 12px",backdropFilter:"blur(8px)"}}>
                <Ico n="play" s={13} c="#fff"/>
                <span style={{fontSize:12,fontWeight:800,color:"#fff"}}>Watch Live</span>
              </div>
            </div>
          </div>
        </div>
      ):(
        <div style={{height:220,background:`linear-gradient(160deg,${C.surf},#000)`,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12}}>
          {loading?<>
            <div style={{width:40,height:40,borderRadius:"50%",border:`3px solid ${C.border}`,borderTopColor:C.cyan,animation:"spin .9s linear infinite"}}/>
            <div style={{fontSize:13,color:C.muted}}>Finding live streams…</div>
          </>:<>
            <div className="icoFloat" style={{display:"flex"}}><Ico n="mic" s={52} c={C.muted}/></div>
            <div style={{fontWeight:700,fontSize:18,color:C.muted}}>No one is live right now</div>
            <div style={{fontSize:13,color:C.muted,marginTop:2}}>Be the first — go live from the Studio tab!</div>
          </>}
        </div>
      )}
      {feedError&&<div style={{margin:"0 0 4px",padding:"10px 14px",background:"#FF2D2D12",border:"1px solid #FF2D2D30",borderRadius:10,fontSize:12,color:"#FF8080",display:"flex",alignItems:"center",gap:8}}><Ico n="info" s={14} c="#FF8080"/>Couldn't load streams: {feedError} — check Supabase RLS (streams table needs a SELECT policy for anon/authenticated).</div>}
      <div className="sx" style={{padding:"12px 0 4px",display:"flex",gap:7}}>
        {CATS.map(c=>(<button key={c} onClick={()=>setCat(c)} style={{flexShrink:0,padding:"7px 18px",borderRadius:22,border:`1.5px solid ${cat===c?C.cyan:C.border}`,background:cat===c?`${C.cyan}22`:C.card2,color:cat===c?C.cyan:C.muted,fontFamily:"Plus Jakarta Sans",fontWeight:800,fontSize:12,cursor:"pointer",transition:"all .2s",whiteSpace:"nowrap",boxShadow:cat===c?`0 0 12px ${C.cyan}33`:"none",transform:cat===c?"scale(1.05)":"scale(1)"}} onMouseEnter={e=>{if(c!==cat){e.currentTarget.style.borderColor=C.cyan+"66";e.currentTarget.style.color=C.text;}}} onMouseLeave={e=>{if(c!==cat){e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.muted;}}}>{c}</button>))}
      </div>
      <div className="grid">
        {loading&&Array.from({length:6}).map((_,i)=><SkeletonCard key={i} delay={i*60}/>)}
        {!loading&&filtered.map((s,i)=><div key={s.id} className="fadeInStagger" style={{animationDelay:`${i*40}ms`}}><StreamCard s={s} fmt={fmt} onClick={()=>onStream(s)} onViewProfile={onViewProfile}/></div>)}
        {!loading&&filtered.length===0&&(
          <div style={{gridColumn:"1/-1",textAlign:"center",padding:"60px 0",color:C.muted}}>
            <div className="icoFloat" style={{display:"flex",justifyContent:"center",marginBottom:12}}><Ico n="search" s={48} c={C.muted}/></div>
            <div style={{fontWeight:700,fontSize:18}}>{cat==="All"?"No live streams right now":"No live streams in this category"}</div>
            <div style={{fontSize:14,marginTop:6}}>{cat==="All"?"Check back soon or go live yourself!":"Try a different category"}</div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════ SEARCH PAGE ═══════════════════ */
const SearchPage=({onStream,initialSearch=""})=>{
  const [q,setQ]=useState(initialSearch);
  const [results,setResults]=useState([]);
  const [searching,setSearching]=useState(false);
  const cols=[C.cyan,C.purple,C.amber,C.emerald,C.gold,C.pink,C.sky,C.cyan,C.purple,C.amber,C.emerald,C.gold,C.pink,C.sky,C.cyan,C.purple];

  useEffect(()=>{
    if(!q.trim()){setResults([]);return;}
    setSearching(true);
    const timer=setTimeout(async()=>{
      const {data:rows}=await supabase.from("streams")
        .select("*")
        .or(`title.ilike.%${q}%,category.ilike.%${q}%,streamer_name.ilike.%${q}%`)
        .order("is_live",{ascending:false}).order("viewer_count",{ascending:false}).limit(20);
      const ids=[...new Set((rows||[]).map(s=>s.streamer_id).filter(Boolean))];
      let profileMap={};
      if(ids.length>0){
        const {data:profiles}=await supabase.from("profiles").select("id,display_name,username,avatar_url").in("id",ids);
        if(profiles) profiles.forEach(p=>{profileMap[p.id]=p;});
      }
      setResults((rows||[]).map(s=>mapStreamRow(s,profileMap)));
      setSearching(false);
    },400);
    return()=>clearTimeout(timer);
  },[q]);

  return(
    <div style={{padding:"20px 20px 40px"}} className="page">
      <div className="exo" style={{fontSize:22,fontWeight:900,marginBottom:16}}>Discover</div>
      <input className="inp" placeholder="Search streamers, titles, categories..." value={q} onChange={e=>setQ(e.target.value)} style={{marginBottom:20,fontSize:15}}/>
      {searching&&<div style={{textAlign:"center",padding:"20px 0",color:C.muted,fontSize:13}}>Searching...</div>}
      {!searching&&q&&results.length>0&&(
        <div style={{marginBottom:24}}>
          <div className="exo" style={{fontSize:11,color:C.muted,marginBottom:12,fontWeight:700}}>RESULTS ({results.length})</div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {results.map(s=>(
              <div key={s.id} className="card" onClick={()=>onStream(s)} style={{padding:"12px",display:"flex",gap:12,alignItems:"center",cursor:"pointer"}}>
                {s.avatar_url?<img src={s.avatar_url} style={{width:44,height:44,borderRadius:"50%",objectFit:"cover"}} alt=""/>:<Av ch={s.av} sz={44} g={`linear-gradient(135deg,${s.col},${C.purple})`}/>}
                <div style={{flex:1}}><div style={{fontWeight:700,fontSize:14}}>{s.streamer}</div><div style={{fontSize:12,color:C.muted,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{s.title}</div></div>
                {s.live&&<LiveBadge viewers={s.viewers}/>}
              </div>
            ))}
          </div>
        </div>
      )}
      {!searching&&q&&results.length===0&&<div style={{textAlign:"center",padding:"40px 0",color:C.muted}}><div className="icoFloat" style={{display:"flex",justifyContent:"center",marginBottom:10}}><Ico n="search" s={40} c={C.muted}/></div><div style={{fontWeight:700}}>No results for "{q}"</div></div>}
      {!q&&<>
        <div className="exo" style={{fontSize:11,color:C.muted,marginBottom:14,fontWeight:800,letterSpacing:1.5}}>BROWSE CATEGORIES</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(110px,1fr))",gap:10}}>
          {[["mic","Music"],["zap","Gaming"],["info","Tech"],["coins","Food"],["barchart","Finance"],["activity","Fitness"],["edit","Art"],["star","Education"],["play","Comedy"],["heart","Fashion"],["mappin","Travel"],["trophy","Sports"],["users","Lifestyle"],["globe","News"],["shield","Spirituality"],["trending","Other"]].map(([icon,label],i)=>(
            <div key={i} className="card" onClick={()=>setQ(label)} style={{padding:"16px 8px",textAlign:"center",cursor:"pointer",transition:"all .22s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=cols[i];e.currentTarget.style.transform="translateY(-3px)";}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.transform="translateY(0)";}}>
              <div style={{display:"flex",justifyContent:"center",marginBottom:8}}><Ico n={icon} s={24} c={cols[i]}/></div>
              <div className="exo" style={{fontSize:12,fontWeight:700,color:C.text,letterSpacing:.3}}>{label}</div>
            </div>
          ))}
        </div>
      </>}
    </div>
  );
};

/* ═══════════════════ GO LIVE ═══════════════════ */
const GoLivePage=({fmt,isStreamer,onBecomeStreamer,user,darkMode=true})=>{
  const [title,setTitle]=useState("");const [cat,setCat]=useState("");const [subOnly,setSubOnly]=useState(false);
  const [isLive,setIsLive]=useState(false);const [starting,setStarting]=useState(false);
  const [viewers,setViewers]=useState(0);const [giftTotal,setGiftTotal]=useState(0);const [secs,setSecs]=useState(0);
  const [micOn,setMicOn]=useState(true);const [camOn,setCamOn]=useState(true);const [streamId,setStreamId]=useState(null);
  const [streamError,setStreamError]=useState("");const [previewStream,setPreviewStream]=useState(null);
  const [thumbPreview,setThumbPreview]=useState("");const [thumbFile,setThumbFile]=useState(null);
  const [studioTab,setStudioTab]=useState("setup");
  const [chatMsg,setChatMsg]=useState("");const [studioChat,setStudioChat]=useState([]);
  const [quality,setQuality]=useState("1080p");const [tags,setTags]=useState([]);const [tagInput,setTagInput]=useState("");
  const [scheduledStreams,setScheduledStreams]=useState([]);const [schedTitle,setSchedTitle]=useState("");const [scheduledTime,setScheduledTime]=useState("");
  const [showViewerCount,setShowViewerCount]=useState(true);const [allowComments,setAllowComments]=useState(true);
  const [giftNotifs,setGiftNotifs]=useState(true);const [slowMode,setSlowMode]=useState(false);
  const [isMuted,setIsMuted]=useState(false);const [copied,setCopied]=useState(false);
  const [shareLink,setShareLink]=useState("");
  const videoRef=useRef();
  const liveVideoRef=useRef();   // <div> container — Agora track.play() renders here
  const captureRef=useRef();     // hidden <video> — used only for thumbnail frame capture
  const timerRef=useRef();const chatRef=useRef();
  const localVideoTrack=useRef(null);const localAudioTrack=useRef(null);

  useEffect(()=>{
    let stream;
    navigator.mediaDevices?.getUserMedia({video:true,audio:true})
      .then(s=>{stream=s;setPreviewStream(s);if(videoRef.current)videoRef.current.srcObject=s;})
      .catch(()=>setStreamError("Camera not available. Check permissions."));
    return()=>{stream?.getTracks().forEach(t=>t.stop());};
  },[]);

  // Load scheduled streams from Supabase
  useEffect(()=>{
    if(!user)return;
    supabase.from("streams").select("id,title,scheduled_at").eq("streamer_id",user.id).eq("is_live",false).not("scheduled_at","is",null).gte("scheduled_at",new Date().toISOString()).order("scheduled_at",{ascending:true})
      .then(({data})=>{if(data)setScheduledStreams(data.map(s=>({id:s.id,title:s.title,time:s.scheduled_at})));});
  },[user]);

  useEffect(()=>{if(!isLive)return;timerRef.current=window.setInterval(()=>setSecs(s=>s+1),1000);return()=>window.clearInterval(timerRef.current);},[isLive]);
  useEffect(()=>{if(chatRef.current)chatRef.current.scrollTop=chatRef.current.scrollHeight;},[studioChat]);

  useEffect(()=>{
    if(studioTab==="setup"&&!isLive&&previewStream&&videoRef.current){
      videoRef.current.srcObject=previewStream;
    }
  },[studioTab,isLive,previewStream]);

  // Attach live camera preview — localVideoTrack.current is the camera track (after fix)
  useEffect(()=>{
    if(!isLive||studioTab!=="stream")return;
    let tid;let attempts=0;
    const attach=()=>{
      const div=liveVideoRef.current;
      if(!div){if(attempts++<40){tid=window.setTimeout(attach,150);}return;}
      const track=localVideoTrack.current;
      // localVideoTrack.current = ICameraVideoTrack (camera, not mic)
      if(!track){if(attempts++<40){tid=window.setTimeout(attach,250);}return;}
      try{
        div.innerHTML=""; // clear any previous Agora render
        track.play(div);  // Agora renders a <video> inside the div
      }catch(e){
        console.warn("[LivePreview] track.play failed, trying srcObject:", e);
        // Fallback: wire via MediaStream srcObject on captureRef
        const cap=captureRef.current;
        if(cap){
          const raw=track.getMediaStreamTrack?.();
          if(raw){cap.srcObject=new MediaStream([raw]);cap.muted=true;cap.play().catch(()=>{});}
        }
      }
    };
    tid=window.setTimeout(attach,400);
    return()=>clearTimeout(tid);
  },[isLive,studioTab]); // eslint-disable-line

  // Frame capture disabled — live_thumbnail_url column not in DB schema

  // Real subscriptions (chat + gifts + viewer count)
  useEffect(()=>{
    if(!isLive||!streamId)return;
    const chatCh=supabase.channel("studio_chat_"+streamId)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"chat_messages",filter:"stream_id=eq."+streamId},p=>{
        const d=p.new;
        setStudioChat(c=>[...c.slice(-99),{u:d.username||"Viewer",t:d.message,id:d.id,type:"viewer",c:C.purple}]);
      }).subscribe();
    const giftCh=supabase.channel("studio_gifts_"+streamId)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"gifts",filter:"stream_id=eq."+streamId},p=>{
        const d=p.new;
        setGiftTotal(g=>g+(d.amount_usd||0));
        setStudioChat(c=>[...c.slice(-99),{u:d.sender_username||"Someone",t:"sent a "+(d.emoji||"gift"),id:d.id,type:"gift",emoji:d.emoji,c:C.gold}]);
        if(giftNotifs)playNotifSound("gift");
      }).subscribe();
    const vcInt=window.setInterval(async()=>{
      const {data}=await supabase.from("streams").select("viewer_count").eq("id",streamId).single();
      if(data?.viewer_count!=null)setViewers(data.viewer_count);
    },10000);
    return()=>{supabase.removeChannel(chatCh);supabase.removeChannel(giftCh);window.clearInterval(vcInt);};
  },[isLive,streamId,giftNotifs]); // eslint-disable-line

  const dur=String(Math.floor(secs/3600)).padStart(2,"0")+":"+String(Math.floor((secs%3600)/60)).padStart(2,"0")+":"+String(secs%60).padStart(2,"0");

  const restartCameraPreview=()=>{
    navigator.mediaDevices?.getUserMedia({video:true,audio:true})
      .then(s=>{setPreviewStream(s);if(videoRef.current)videoRef.current.srcObject=s;})
      .catch(()=>{});
  };

  const handleGoLive=async()=>{
    if(!title){alert("Please enter a stream title.");return;}
    if(!user){alert("You must be signed in.");return;}
    setStarting(true);setStreamError("");

    // ── Step 1: End any ghost streams this streamer left open ─────────────
    await supabase.from("streams")
      .update({is_live:false,ended_at:new Date().toISOString()})
      .eq("streamer_id",user.id).eq("is_live",true)
      .catch(()=>{});

    // ── Step 2: Upload thumbnail ───────────────────────────────────────────
    let thumbnailUrl="";
    if(thumbFile){
      try{
        const ext=thumbFile.name.split(".").pop();
        const path="thumbnails/"+user.id+"_"+Date.now()+"."+ext;
        const {error:upErr}=await supabase.storage.from("gift3rs-media").upload(path,thumbFile,{upsert:true,contentType:thumbFile.type});
        if(!upErr){const {data:ud}=supabase.storage.from("gift3rs-media").getPublicUrl(path);thumbnailUrl=ud.publicUrl||"";}
      }catch(e){console.warn("Thumb upload failed",e);}
    }

    // ── Step 3: Create DB record with minimal required columns first ───────
    const channelName=makeChannel(user.id);
    // Minimal row — only columns guaranteed to exist in a basic streams table
    const minRow={streamer_id:user.id,title,is_live:true,channel_name:channelName,started_at:new Date().toISOString()};
    // Extended row — add optional columns; Supabase ignores unknown ones via upsert
    let {data:profileData}=await supabase.from("profiles").select("*").eq("id",user.id).single().catch(()=>({data:null}));
    const extRow={
      ...minRow,
      streamer_name:user.email?.split("@")[0]||"Streamer",
      category:cat||"General",
      thumbnail_url:thumbnailUrl||null,
      viewer_count:0,
    };

    let {data:newStream,error:dbErr}=await supabase.from("streams").insert(extRow).select("id").single();
    if(dbErr){
      console.warn("[GoLive] Extended insert failed:",dbErr.message,". Trying minimal row...");
      // Retry with only the required columns
      const r2=await supabase.from("streams").insert(minRow).select("id").single();
      if(r2.data?.id){newStream=r2.data;dbErr=null;}
      else{
        setStreamError("DB error: "+dbErr.message);
        setStarting(false);return;
      }
    }
    const supabaseStreamId=newStream.id;

    // ── Step 4: Release camera then start Agora (20s timeout) ─────────────
    if(previewStream){previewStream.getTracks().forEach(t=>t.stop());setPreviewStream(null);}
    await new Promise(r=>window.setTimeout(r,1000)); // wait 1s for OS to release cam

    let result=null;
    try{
      result=await Promise.race([
        startStream({channelName,streamId:supabaseStreamId,onViewerCountUpdate:(count)=>{setViewers(count);supabase.from("streams").update({viewer_count:count}).eq("id",supabaseStreamId).catch(()=>{});}}),
        new Promise((_,reject)=>window.setTimeout(()=>reject(new Error("Start timed out (20s) — check camera permissions and network.")),20000)),
      ]);
    }catch(err){
      setStreamError(err?.message||"Failed to start stream.");
      await supabase.from("streams").update({is_live:false}).eq("id",supabaseStreamId).catch(()=>{});
      setStarting(false);
      restartCameraPreview(); // restore camera preview after failure
      return;
    }

    // ── Step 5: Go live ───────────────────────────────────────────────────
    localVideoTrack.current=result.localVideoTrack||null;
    localAudioTrack.current=result.localAudioTrack||null;
    setIsLive(true);setStreamId(supabaseStreamId);setStudioTab("stream");
    const sName=encodeURIComponent(user.email?.split("@")[0]||"Streamer");
    const sTitle=encodeURIComponent(title||"Live Stream");
    setShareLink(`${window.location.origin}?stream=${supabaseStreamId}&ch=${encodeURIComponent(channelName)}&sn=${sName}&st=${sTitle}`);
    setStudioChat([{u:"System",t:"You are now live! Welcome your viewers. 🔴",id:Date.now(),type:"system"}]);
    setStarting(false);
  };

  const handleEndStream=async()=>{
    if(!window.confirm("Are you sure you want to end the stream?"))return;
    window.clearInterval(timerRef.current);await endStream(streamId);
    if(liveVideoRef.current)liveVideoRef.current.innerHTML="";
    if(captureRef.current){captureRef.current.srcObject=null;}
    localVideoTrack.current=null;localAudioTrack.current=null;
    if(streamId){await supabase.from("streams").update({is_live:false,viewer_count:0,ended_at:new Date().toISOString()}).eq("id",streamId).catch(()=>{});}
    setIsLive(false);setSecs(0);setViewers(0);setGiftTotal(0);setStreamId(null);setStudioTab("setup");setStudioChat([]);
    setThumbPreview("");setThumbFile(null);setCamOn(true);setMicOn(true);
    // Restart camera preview for the setup tab
    setTimeout(restartCameraPreview, 800);
  };

  const handleToggleMic=async()=>{
    const next=!micOn;setMicOn(next);
    const aTrack=localAudioTrack.current;
    if(aTrack?.setEnabled)await aTrack.setEnabled(next);
    else await toggleMic(next);
  };
  const handleToggleCam=async()=>{
    const next=!camOn;setCamOn(next);
    const vTrack=localVideoTrack.current;
    if(vTrack?.setEnabled)await vTrack.setEnabled(next);
    else await toggleCamera(next);
    // Re-render camera when turning back on
    if(next&&liveVideoRef.current&&vTrack){
      try{const div=liveVideoRef.current;div.innerHTML="";vTrack.play(div);}catch(_){}
    }
  };
  const sendStudioMsg=async()=>{
    if(!chatMsg.trim())return;const msg=chatMsg.trim();setChatMsg("");
    setStudioChat(c=>[...c,{u:"You (Streamer)",t:msg,id:Date.now(),type:"streamer"}]);
    if(streamId&&user){await supabase.from("chat_messages").insert({stream_id:streamId,user_id:user.id,username:user.email?.split("@")[0]||"Streamer",message:msg}).catch(()=>{});}
  };
  const addTag=()=>{if(tagInput.trim()&&tags.length<5&&!tags.includes(tagInput.trim())){setTags(t=>[...t,tagInput.trim()]);setTagInput("");}};
  const copyLink=()=>{navigator.clipboard.writeText(shareLink);setCopied(true);window.setTimeout(()=>setCopied(false),2000);};
  const scheduleStream=async()=>{
    if(!schedTitle||!scheduledTime){alert("Please fill in title and time.");return;}
    if(new Date(scheduledTime)<=new Date()){alert("Please choose a future date and time.");return;}
    if(!user){alert("You must be signed in.");return;}
    const {data,error}=await supabase.from("streams").insert({streamer_id:user.id,streamer_name:user.email?.split("@")[0]||"Streamer",title:schedTitle,category:cat||"General",is_live:false,scheduled_at:new Date(scheduledTime).toISOString(),viewer_count:0,gift_total:0}).select("id").single();
    if(error){alert("Could not save schedule: "+error.message);return;}
    setScheduledStreams(s=>[...s,{title:schedTitle,time:scheduledTime,id:data?.id||Date.now()}]);
    setSchedTitle("");setScheduledTime("");
  };
  const activeTabs=isLive?["stream","chat","analytics","settings"]:["setup","schedule","analytics","settings"];
  const TAB_ICONS={setup:"camera",schedule:"bell",analytics:"barchart",settings:"settings",stream:"mic",chat:"users"};

  if(!isStreamer)return(
    <div style={{padding:"24px 20px"}} className="page">
      <div className="exo" style={{fontSize:24,fontWeight:900,marginBottom:8}}>Become a Streamer</div>
      <div style={{fontSize:14,color:C.muted,marginBottom:24,lineHeight:1.7}}>Go live, post premium content, and earn real money from your audience worldwide.</div>
      <div style={{background:`linear-gradient(135deg,${C.amber}15,${C.purple}10)`,border:`1px solid ${C.amber}25`,borderRadius:18,padding:"22px",marginBottom:24,maxWidth:500}}>
        <div className="icoFloat" style={{display:"flex",marginBottom:12}}><Ico n="rocket" s={44} c={C.amber}/></div>
        <div className="exo" style={{fontWeight:900,fontSize:20,marginBottom:8}}>Start Your Streaming Journey</div>
        <div style={{fontSize:14,color:C.muted,lineHeight:1.7}}>Creators on GIFT3RS earn real income from live streaming, gifts, and premium subscriptions.</div>
      </div>
      <div style={{maxWidth:480}}>
        {[["id","Quick Identity Verification","Takes just 2 minutes"],["creditcard","One-Time Setup Fee",fmt(4.99)+" one-time"],["check","Instant Approval","Start streaming immediately"],["coins","Keep 90% of gifts","We only take 10%"]].map(([icon,t,sub],i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:14,marginBottom:18}}>
            <div style={{width:48,height:48,borderRadius:14,background:C.card2,border:`1px solid ${C.border2}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}} className="icoGlow"><Ico n={icon} s={22} c={C.amber}/></div>
            <div><div style={{fontWeight:700,fontSize:14}}>{t}</div><div style={{fontSize:12,color:C.muted,marginTop:2}}>{sub}</div></div>
          </div>
        ))}
        <button className="btn btnA" style={{padding:"15px 28px",fontSize:16,marginTop:8}} onClick={onBecomeStreamer}>Get Started — {fmt(4.99)} one-time</button>
      </div>
    </div>
  );

  return(
    <div style={{paddingBottom:40}} className="page">
      <div style={{padding:"20px 20px 0",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12,marginBottom:16}}>
        <div>
          <div className="exo" style={{fontSize:22,fontWeight:900}}>Studio</div>
          <div style={{fontSize:12,color:darkMode?C.muted:"#555",marginTop:2}}>{isLive?"You are live right now":"Set up and manage your streams"}</div>
        </div>
        {isLive&&<div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,background:"#FF2D2D18",border:"1px solid #FF2D2D40",borderRadius:10,padding:"6px 14px"}}><div className="liveDot"/><span className="exo" style={{fontWeight:900,color:"#FF2D2D",fontSize:13}}>LIVE — {dur}</span></div>
          <div style={{display:"flex",alignItems:"center",gap:5,background:`${C.cyan}12`,border:`1px solid ${C.cyan}25`,borderRadius:10,padding:"6px 14px"}}><Ico n="eye" s={13} c={C.cyan}/><span className="exo" style={{fontWeight:900,color:C.cyan,fontSize:13}}>{viewers.toLocaleString()} watching</span></div>
          <div style={{display:"flex",alignItems:"center",gap:5,background:`${C.gold}12`,border:`1px solid ${C.gold}25`,borderRadius:10,padding:"6px 14px"}}><Ico n="gift" s={13} c={C.gold}/><span className="exo" style={{fontWeight:900,color:C.gold,fontSize:13}}>{fmt(giftTotal)}</span></div>
        </div>}
      </div>

      <div className="sx" style={{display:"flex",padding:"0 20px",borderBottom:`1px solid ${darkMode?C.border:"#E0E0E0"}`,marginBottom:0}}>
        {activeTabs.map(t=>(
          <button key={t} onClick={()=>setStudioTab(t)} style={{padding:"10px 18px",border:"none",background:"transparent",color:studioTab===t?C.cyan:(darkMode?C.muted:"#555"),fontWeight:studioTab===t?800:600,fontSize:13,cursor:"pointer",flexShrink:0,textTransform:"capitalize",transition:"all .2s",display:"flex",alignItems:"center",gap:6,borderBottom:studioTab===t?`3px solid ${C.cyan}`:"3px solid transparent",marginBottom:-1}}>
            <Ico n={TAB_ICONS[t]||"info"} s={14} c={studioTab===t?C.cyan:(darkMode?C.muted:"#555")}/>{t.charAt(0).toUpperCase()+t.slice(1)}
          </button>
        ))}
      </div>

      <div style={{padding:"20px"}}>
        {/* SETUP TAB */}
        {studioTab==="setup"&&!isLive&&<div style={{maxWidth:600}}>
          <div style={{background:"#000",borderRadius:18,aspectRatio:"16/9",maxHeight:300,marginBottom:20,border:`1px solid ${C.border}`,position:"relative",overflow:"hidden"}}>
            <video ref={videoRef} autoPlay muted playsInline style={{width:"100%",height:"100%",objectFit:"cover",display:camOn?"block":"none"}}/>
            {!camOn&&<div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,background:"#111"}}><Ico n="camera" s={40} c={C.muted}/><div style={{fontSize:13,color:C.muted}}>Camera off</div></div>}
            {streamError&&<div style={{position:"absolute",bottom:10,left:10,right:10,background:"rgba(255,45,45,.9)",borderRadius:10,padding:"8px 12px",fontSize:12,color:"#fff",display:"flex",alignItems:"center",gap:8}}><Ico n="info" s={14} c="#fff"/>{streamError}</div>}
            <div style={{position:"absolute",bottom:12,left:"50%",transform:"translateX(-50%)",display:"flex",gap:10}}>
              <button onClick={()=>{const next=!camOn;previewStream?.getVideoTracks().forEach(t=>t.enabled=next);setCamOn(next);}} style={{background:camOn?"rgba(0,229,255,.25)":"rgba(0,0,0,.7)",border:`1px solid ${camOn?C.cyan:"rgba(255,255,255,.3)"}`,borderRadius:10,padding:"8px 16px",color:camOn?C.cyan:(darkMode?"#fff":"#333"),cursor:"pointer",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:6,backdropFilter:"blur(8px)"}}><Ico n="camera" s={13} c={camOn?C.cyan:(darkMode?"#fff":"#333")}/>{camOn?"Camera On":"Camera Off"}</button>
              <button onClick={()=>{const next=!isMuted;setIsMuted(next);previewStream?.getAudioTracks().forEach(t=>t.enabled=!next);}} style={{background:isMuted?"rgba(255,45,45,.25)":"rgba(0,0,0,.7)",border:`1px solid ${isMuted?"#FF2D2D":"rgba(255,255,255,.3)"}`,borderRadius:10,padding:"8px 16px",color:isMuted?"#FF6060":(darkMode?"#fff":"#333"),cursor:"pointer",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:6,backdropFilter:"blur(8px)"}}><Ico n="mic" s={13} c={isMuted?"#FF6060":(darkMode?"#fff":"#333")}/>{isMuted?"Mic Muted":"Mic On"}</button>
            </div>
            <div style={{position:"absolute",top:10,left:10,background:"rgba(0,0,0,.6)",borderRadius:6,padding:"3px 8px",fontSize:10,color:"rgba(255,255,255,.7)",fontFamily:"Exo 2",fontWeight:700}}>PREVIEW</div>
          </div>
          <div style={{marginBottom:14}}><label style={{fontSize:10,color:C.muted,fontWeight:800,fontFamily:"Exo 2",letterSpacing:1,display:"block",marginBottom:7}}>STREAM TITLE *</label><input className="inp" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Give your stream an exciting title..." maxLength={100}/><div style={{fontSize:10,color:C.muted,marginTop:4,textAlign:"right"}}>{title.length}/100</div></div>
          <div style={{marginBottom:14}}>
            <label style={{fontSize:10,color:C.muted,fontWeight:800,fontFamily:"Exo 2",letterSpacing:1,display:"block",marginBottom:7}}>THUMBNAIL <span style={{fontWeight:400,fontSize:10}}>(optional — shown on stream cards)</span></label>
            <input type="file" accept="image/*" id="thumb-input" style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(f){if(thumbPreview)URL.revokeObjectURL(thumbPreview);setThumbFile(f);setThumbPreview(URL.createObjectURL(f));}}}/>
            <div onClick={()=>document.getElementById("thumb-input").click()} style={{borderRadius:12,overflow:"hidden",cursor:"pointer",border:`2px dashed ${thumbPreview?C.emerald:C.border2}`,height:thumbPreview?120:64,display:"flex",alignItems:"center",justifyContent:"center",gap:8,backgroundImage:thumbPreview?`url(${thumbPreview})`:"none",backgroundSize:"cover",backgroundPosition:"center"}}>
              {!thumbPreview&&<><Ico n="upload" s={18} c={C.muted}/><span style={{fontSize:13,color:C.muted}}>Click to upload thumbnail</span></>}
              {thumbPreview&&<div style={{width:"100%",height:"100%",display:"flex",alignItems:"flex-end",justifyContent:"flex-end",padding:8}}><button onClick={e=>{e.stopPropagation();URL.revokeObjectURL(thumbPreview);setThumbPreview("");setThumbFile(null);}} style={{background:"rgba(0,0,0,.75)",border:"none",borderRadius:6,padding:"4px 10px",color:"#fff",fontSize:11,cursor:"pointer",fontWeight:700}}>Remove</button></div>}
            </div>
          </div>
          <div style={{marginBottom:14}}><label style={{fontSize:10,color:C.muted,fontWeight:800,fontFamily:"Exo 2",letterSpacing:1,display:"block",marginBottom:9}}>CATEGORY</label><div className="sx" style={{display:"flex",flexWrap:"wrap",gap:8}}>{CATS.slice(1).map(c=>(<button key={c} onClick={()=>setCat(c===cat?"":c)} style={{padding:"7px 14px",borderRadius:20,border:`1.5px solid ${cat===c?C.cyan:C.border}`,background:cat===c?`${C.cyan}20`:"transparent",color:cat===c?C.cyan:"inherit",fontWeight:cat===c?800:600,fontSize:12,cursor:"pointer",transition:"all .18s",whiteSpace:"nowrap"}}>{c}</button>))}</div></div>
          <div style={{marginBottom:14}}>
            <label style={{fontSize:10,color:C.muted,fontWeight:800,fontFamily:"Exo 2",letterSpacing:1,display:"block",marginBottom:7}}>TAGS <span style={{fontWeight:400,fontSize:10}}>(up to 5)</span></label>
            <div style={{display:"flex",gap:8,marginBottom:8}}><input className="inp" value={tagInput} onChange={e=>setTagInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addTag()} placeholder="Type a tag and press Enter..." style={{flex:1}}/><button className="btn btnC" style={{padding:"0 16px",fontSize:13,flexShrink:0,opacity:tags.length>=5?.4:1}} onClick={addTag} disabled={tags.length>=5}>Add</button></div>
            {tags.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:6}}>{tags.map((t,i)=>(<div key={i} style={{background:`${C.purple}18`,border:`1px solid ${C.purple}35`,borderRadius:20,padding:"5px 12px",fontSize:12,color:C.purple,display:"flex",alignItems:"center",gap:6,fontWeight:700}}>#{t}<button onClick={()=>setTags(ts=>ts.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:C.purple,cursor:"pointer",fontSize:16,fontWeight:900,padding:0,lineHeight:1}}>×</button></div>))}</div>}
          </div>
          <div style={{marginBottom:14}}><label style={{fontSize:10,color:C.muted,fontWeight:800,fontFamily:"Exo 2",letterSpacing:1,display:"block",marginBottom:9}}>STREAM QUALITY</label><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{[["720p","HD"],["1080p","Full HD"],["1440p","2K"],["4K","Ultra HD"]].map(([q,label])=>(<button key={q} onClick={()=>setQuality(q)} style={{padding:"8px 16px",borderRadius:10,border:`1.5px solid ${quality===q?C.gold:C.border}`,background:quality===q?`${C.gold}18`:"transparent",color:quality===q?C.gold:"inherit",fontWeight:quality===q?800:600,fontSize:12,cursor:"pointer",transition:"all .18s"}}><div style={{fontWeight:800}}>{q}</div><div style={{fontSize:9,opacity:.7,marginTop:1}}>{label}</div></button>))}</div></div>
          <div style={{marginBottom:14}}><label style={{fontSize:10,color:C.muted,fontWeight:800,fontFamily:"Exo 2",letterSpacing:1,display:"block",marginBottom:7}}>STREAM LINK</label><div style={{display:"flex",gap:8}}><input className="inp" value={shareLink} readOnly style={{flex:1,fontSize:12}}/><button className={`btn ${copied?"btnC":"btnS"}`} style={{padding:"0 16px",fontSize:13,flexShrink:0,minWidth:80}} onClick={copyLink}>{copied?"Copied!":"Copy"}</button></div></div>
          <div className="card" style={{padding:"14px 16px",marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontWeight:700,fontSize:14,display:"flex",alignItems:"center",gap:8}}><Ico n="lock" s={14} c={C.purple}/>Subscribers-Only Stream</div><div style={{fontSize:12,color:C.muted,marginTop:2}}>Only paying subscribers can watch</div></div><Toggle on={subOnly} onChange={()=>setSubOnly(v=>!v)}/></div>
          <button className="btn btnR" style={{padding:"16px",fontSize:16,width:"100%",opacity:title&&!starting?1:.45,display:"flex",alignItems:"center",justifyContent:"center",gap:10}} onClick={handleGoLive} disabled={starting||!title}>
            {starting?<><span className="spin" style={{display:"inline-block",width:16,height:16,border:"2px solid #fff8",borderTopColor:"#fff",borderRadius:"50%"}}/>Starting...</>:<><div className="liveDot" style={{width:10,height:10}}/>Go Live Now</>}
          </button>
          {!title&&<div style={{fontSize:11,color:C.muted,textAlign:"center",marginTop:8}}>Enter a stream title to go live</div>}
        </div>}

        {/* STREAM TAB */}
        {studioTab==="stream"&&isLive&&<div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
          <div style={{flex:"1 1 400px",minWidth:0}}>
            <div style={{borderRadius:18,overflow:"hidden",marginBottom:12,aspectRatio:"16/9",position:"relative",background:"#000"}}>
              {/* Agora renders a <video> inside this div via track.play() */}
              <div ref={liveVideoRef} style={{position:"absolute",inset:0,width:"100%",height:"100%",overflow:"hidden",background:"#000"}}/>
              {/* Hidden video for frame snapshots only */}
              <video ref={captureRef} autoPlay muted playsInline style={{display:"none"}}/>
              <div style={{position:"absolute",top:12,left:12,display:"flex",gap:8,alignItems:"center"}}><div className="liveDot"/><span className="exo" style={{fontWeight:900,color:"#FF2D2D",fontSize:13,background:"rgba(0,0,0,.65)",padding:"3px 10px",borderRadius:6}}>ON AIR — {dur}</span></div>
              <div style={{position:"absolute",top:12,right:12,background:"rgba(0,0,0,.75)",borderRadius:8,padding:"4px 10px",fontSize:11,color:"#fff",display:"flex",alignItems:"center",gap:5}}><Ico n="eye" s={11} c="#fff"/>{viewers.toLocaleString()} watching</div>
              <div style={{position:"absolute",bottom:12,left:"50%",transform:"translateX(-50%)",display:"flex",gap:8}}>
                <button onClick={handleToggleCam} style={{background:camOn?"rgba(0,229,255,.25)":"rgba(255,45,45,.25)",border:`1px solid ${camOn?C.cyan:"#FF2D2D"}`,borderRadius:10,padding:"7px 14px",color:camOn?C.cyan:"#FF6060",cursor:"pointer",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:5,backdropFilter:"blur(8px)"}}><Ico n="camera" s={13} c={camOn?C.cyan:"#FF6060"}/>{camOn?"Cam On":"Cam Off"}</button>
                <button onClick={handleToggleMic} style={{background:micOn?"rgba(177,78,255,.25)":"rgba(255,45,45,.25)",border:`1px solid ${micOn?C.purple:"#FF2D2D"}`,borderRadius:10,padding:"7px 14px",color:micOn?C.purple:"#FF6060",cursor:"pointer",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:5,backdropFilter:"blur(8px)"}}><Ico n="mic" s={13} c={micOn?C.purple:"#FF6060"}/>{micOn?"Mic On":"Mic Off"}</button>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:10}}>
              {[["eye",viewers.toLocaleString(),"Watching",C.cyan],["gift",fmt(giftTotal),"Gifts",C.gold],["coins",fmt(giftTotal*.9),"Your Cut",C.emerald]].map(([icon,val,label,col],i)=>(
                <div key={i} style={{textAlign:"center",background:`${col}10`,borderRadius:12,padding:"10px 6px",border:`1px solid ${col}20`}}>
                  <div style={{display:"flex",justifyContent:"center",marginBottom:4}}><Ico n={icon} s={16} c={col}/></div>
                  <div className="exo" style={{fontWeight:900,fontSize:14,color:col}}>{val}</div>
                  <div style={{fontSize:10,color:darkMode?C.muted:"#555",marginTop:1}}>{label}</div>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              {[["Duration",dur,darkMode?C.text:"#0F0F0F"],["Quality",quality,C.gold],["Category",cat||"General",C.cyan]].map(([l,v,c],i)=>(
                <div key={i} style={{flex:1,background:darkMode?C.card:"#fff",borderRadius:10,padding:"10px 12px",border:`1px solid ${darkMode?C.border:"#E0E0E0"}`}}>
                  <div style={{fontSize:10,color:darkMode?C.muted:"#666",marginBottom:3}}>{l}</div>
                  <div className="exo" style={{fontWeight:900,fontSize:13,color:c}}>{v}</div>
                </div>
              ))}
            </div>
            <button onClick={handleEndStream} style={{padding:"13px",borderRadius:14,border:"1px solid #FF2D2D",background:"#FF2D2D18",color:"#FF2D2D",fontWeight:800,fontSize:14,cursor:"pointer",width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><Ico n="power" s={15} c="#FF2D2D"/>End Stream</button>
          </div>
          <div style={{flex:"0 0 280px",display:"flex",flexDirection:"column",background:darkMode?C.surf:"#F5F5F5",borderRadius:18,border:`1px solid ${darkMode?C.border:"#E0E0E0"}`,overflow:"hidden",maxHeight:520}}>
            <div style={{padding:"12px 14px",borderBottom:`1px solid ${darkMode?C.border:"#E0E0E0"}`,display:"flex",alignItems:"center",gap:8,flexShrink:0}}><div className="liveDot"/><span className="exo" style={{fontWeight:900,fontSize:13,color:darkMode?C.text:"#0F0F0F"}}>LIVE CHAT</span><span style={{fontSize:11,color:darkMode?C.muted:"#666",marginLeft:"auto"}}>{studioChat.length} messages</span></div>
            <div ref={chatRef} style={{flex:1,overflowY:"auto",padding:"10px 12px"}}>
              {studioChat.map((m,i)=>(
                <div key={m.id||i} style={{marginBottom:8,display:"flex",gap:6,alignItems:"flex-start"}}>
                  <div style={{width:22,height:22,borderRadius:"50%",background:m.type==="streamer"?C.amber:m.type==="system"?C.cyan:C.purple,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:900,color:"#000"}}>{(m.u||"?")[0]}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <span style={{fontSize:11,fontWeight:800,color:m.type==="streamer"?C.amber:m.type==="system"?C.cyan:C.purple}}>{m.u} </span>
                    <span style={{fontSize:12,wordBreak:"break-word",color:darkMode?"rgba(255,255,255,.85)":"#1A1A3E"}}>{m.t}</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{padding:"10px 12px",borderTop:`1px solid ${darkMode?C.border:"#E0E0E0"}`,flexShrink:0,display:"flex",gap:8}}>
              <input className="inp" value={chatMsg} onChange={e=>setChatMsg(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")sendStudioMsg();}} placeholder="Reply to viewers..." style={{flex:1,padding:"8px 10px",fontSize:12,background:darkMode?"rgba(255,255,255,.07)":"#EEEEEE",border:`1px solid ${darkMode?"rgba(255,255,255,.12)":"#CCCCCC"}`,color:darkMode?"#fff":"#0F0F0F"}}/>
              <button className="btn btnC" style={{padding:"0 12px",fontSize:12,flexShrink:0}} onClick={sendStudioMsg}>Send</button>
            </div>
          </div>
        </div>}

        {/* CHAT TAB */}
        {studioTab==="chat"&&<div style={{maxWidth:500}}>
          <div style={{fontSize:13,color:C.muted,marginBottom:12}}>{isLive?"Live chat with your viewers":"Chat is available while live"}</div>
          <div className="settingsInner" style={{borderRadius:14,height:360,overflowY:"auto",padding:"12px",marginBottom:12,border:`1px solid ${C.border}`}}>
            {studioChat.length===0&&<div style={{textAlign:"center",marginTop:100}}><div style={{display:"flex",justifyContent:"center",marginBottom:12}}><Ico n="users" s={36} c={C.muted}/></div><div style={{color:C.muted,fontSize:13,fontWeight:600}}>{isLive?"Waiting for viewers to chat...":"Go live to start receiving chat messages"}</div></div>}
            {studioChat.map((m,i)=>(<div key={m.id||i} style={{marginBottom:8,display:"flex",gap:8,alignItems:"flex-start"}}><div style={{width:24,height:24,borderRadius:"50%",background:m.type==="streamer"?C.amber:m.type==="system"?C.cyan:C.purple,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:"#000"}}>{m.u[0]}</div><div style={{flex:1}}><span style={{fontSize:12,fontWeight:800,color:m.type==="streamer"?C.amber:m.type==="system"?C.cyan:C.purple}}>{m.u} </span><span style={{fontSize:13,color:m.type==="system"?C.cyan:"inherit"}}>{m.t}</span></div></div>))}
          </div>
          <div style={{display:"flex",gap:8}}><input className="inp" value={chatMsg} onChange={e=>setChatMsg(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")sendStudioMsg();}} placeholder={isLive?"Reply to your viewers...":"Go live to chat with viewers..."} disabled={!isLive} style={{flex:1,opacity:isLive?1:.6}}/><button className="btn btnC" style={{padding:"0 18px",flexShrink:0,opacity:isLive&&chatMsg.trim()?1:.5}} onClick={sendStudioMsg} disabled={!isLive||!chatMsg.trim()}>Send</button></div>
          {!isLive&&<div style={{fontSize:11,color:C.muted,textAlign:"center",marginTop:8}}>Go live from the Setup tab to chat with viewers</div>}
        </div>}

        {/* SCHEDULE TAB */}
        {studioTab==="schedule"&&<div style={{maxWidth:560}}>
          <div className="card" style={{padding:"20px",marginBottom:16}}>
            <div style={{fontWeight:800,fontSize:15,marginBottom:16,display:"flex",alignItems:"center",gap:8}}><Ico n="bell" s={16} c={C.cyan}/>Schedule a New Stream</div>
            <div style={{marginBottom:12}}><label style={{fontSize:10,color:C.muted,fontWeight:800,fontFamily:"Exo 2",letterSpacing:1,display:"block",marginBottom:6}}>STREAM TITLE *</label><input className="inp" placeholder="What will you be streaming?" value={schedTitle} onChange={e=>setSchedTitle(e.target.value)}/></div>
            <div style={{marginBottom:16}}><label style={{fontSize:10,color:C.muted,fontWeight:800,fontFamily:"Exo 2",letterSpacing:1,display:"block",marginBottom:6}}>DATE &amp; TIME *</label><input className="inp" type="datetime-local" value={scheduledTime} onChange={e=>setScheduledTime(e.target.value)} min={new Date().toISOString().slice(0,16)}/></div>
            <button className="btn btnC" style={{padding:"12px 20px",fontSize:14,width:"100%",opacity:schedTitle&&scheduledTime?1:.45}} onClick={scheduleStream} disabled={!schedTitle||!scheduledTime}>Schedule Stream</button>
          </div>
          {scheduledStreams.length>0&&<div style={{marginBottom:20}}>
            <div className="exo" style={{fontWeight:800,fontSize:12,color:C.muted,letterSpacing:1,marginBottom:10}}>UPCOMING ({scheduledStreams.length})</div>
            {scheduledStreams.map((s,i)=>(<div key={s.id} className="card" style={{padding:"14px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:12}}><div style={{width:40,height:40,borderRadius:12,background:`${C.cyan}18`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Ico n="bell" s={18} c={C.cyan}/></div><div style={{flex:1}}><div style={{fontWeight:700,fontSize:14}}>{s.title}</div><div style={{fontSize:12,color:C.muted,marginTop:2}}>{new Date(s.time).toLocaleString()}</div></div><button onClick={()=>setScheduledStreams(ss=>ss.filter((_,j)=>j!==i))} style={{background:"#FF2D2D10",border:"1px solid #FF2D2D30",borderRadius:8,padding:"5px 10px",color:"#FF6060",cursor:"pointer",fontSize:12,fontWeight:700}}>Remove</button></div>))}
          </div>}
          <div className="exo" style={{fontWeight:800,fontSize:12,color:C.muted,letterSpacing:1,marginBottom:12}}>STREAMING TIPS</div>
          {[["zap","Announce 24h before","Post on social media to build anticipation"],["mic","Check your audio first","Always test mic levels before streaming"],["camera","Good lighting matters","Face a window or get a ring light"],["users","Engage your audience","Read and respond to chat messages"],["activity","Be consistent","A regular schedule builds a loyal audience"],["gift","Set gift goals","Tell viewers what you are saving for"]].map(([icon,tip,desc],i)=>(<div key={i} className="card" style={{display:"flex",gap:14,alignItems:"flex-start",marginBottom:10,padding:"14px 16px"}}><div style={{width:36,height:36,borderRadius:10,background:`${C.amber}18`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Ico n={icon} s={17} c={C.amber}/></div><div><div style={{fontWeight:700,fontSize:13,marginBottom:3}}>{tip}</div><div style={{fontSize:12,color:C.muted,lineHeight:1.5}}>{desc}</div></div></div>))}
        </div>}

        {/* ANALYTICS TAB */}
        {studioTab==="analytics"&&user&&<StudioAnalytics user={user} fmt={fmt} darkMode={darkMode} streamId={streamId} viewers={viewers} giftTotal={giftTotal}/>}

        {/* SETTINGS TAB */}
        {studioTab==="settings"&&<div style={{maxWidth:520}}>
          <div className="card" style={{padding:"16px",marginBottom:10}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>Stream Quality</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{[["720p","HD — 3 Mbps"],["1080p","Full HD — 6 Mbps"],["1440p","2K — 12 Mbps"],["4K","Ultra HD — 25 Mbps"]].map(([q,desc])=>(<button key={q} onClick={()=>setQuality(q)} style={{padding:"8px 14px",borderRadius:10,border:`1.5px solid ${quality===q?C.gold:C.border}`,background:quality===q?`${C.gold}18`:"transparent",cursor:"pointer",transition:"all .18s",textAlign:"left"}}><div style={{fontWeight:800,fontSize:13,color:quality===q?C.gold:"inherit"}}>{q}</div><div style={{fontSize:10,color:quality===q?C.gold:C.muted,marginTop:1}}>{desc}</div></button>))}</div>
          </div>
          {[{label:"Subscribers-Only Stream",desc:"Only paying subscribers can watch",state:subOnly,set:()=>setSubOnly(v=>!v),col:C.purple},{label:"Show Viewer Count",desc:"Display live viewer count publicly",state:showViewerCount,set:()=>setShowViewerCount(v=>!v),col:C.cyan},{label:"Allow Comments",desc:"Let viewers send chat messages",state:allowComments,set:()=>setAllowComments(v=>!v),col:C.emerald},{label:"Gift Notifications",desc:"Show on-screen alerts for gifts",state:giftNotifs,set:()=>setGiftNotifs(v=>!v),col:C.gold},{label:"Slow Mode",desc:"Limit viewers to one message every 10 seconds",state:slowMode,set:()=>setSlowMode(v=>!v),col:C.amber}].map((s,i)=>(<div key={i} className="card" style={{padding:"14px 16px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}><div style={{flex:1}}><div style={{fontWeight:700,fontSize:14,display:"flex",alignItems:"center",gap:6}}><div style={{width:8,height:8,borderRadius:"50%",background:s.state?s.col:C.muted,transition:"background .3s"}}/>{s.label}</div><div style={{fontSize:12,color:C.muted,marginTop:3}}>{s.desc}</div></div><Toggle on={s.state} onChange={s.set}/></div>))}
          <div className="card" style={{padding:"16px",marginTop:8}}><div style={{fontWeight:700,fontSize:14,marginBottom:10,display:"flex",alignItems:"center",gap:8}}><Ico n="link" s={14} c={C.cyan}/>Your Stream Link</div><div style={{display:"flex",gap:8}}><input className="inp" value={shareLink} readOnly style={{flex:1,fontSize:11}}/><button className={`btn ${copied?"btnC":"btnS"}`} style={{padding:"0 16px",fontSize:12,flexShrink:0,minWidth:80}} onClick={copyLink}>{copied?"Copied!":"Copy"}</button></div></div>
        </div>}
      </div>
    </div>
  );
};

/* ═══════════════════ STUDIO ANALYTICS (real data) ═══════════════════ */
const StudioAnalytics=({user,fmt,darkMode,streamId,viewers,giftTotal})=>{
  const [recentStreams,setRecentStreams]=useState([]);
  const [subCount,setSubCount]=useState(0);
  const [totalViews,setTotalViews]=useState(0);
  useEffect(()=>{
    if(!user)return;
    supabase.from("streams").select("id,title,category,viewer_count,gift_total,started_at,ended_at").eq("streamer_id",user.id).order("started_at",{ascending:false}).limit(10)
      .then(({data})=>{if(data){setRecentStreams(data);setTotalViews(data.reduce((s,r)=>s+(r.viewer_count||0),0));}});
    supabase.from("subscriptions").select("id",{count:"exact"}).eq("streamer_id",user.id).eq("status","active")
      .then(({count})=>{if(count!=null)setSubCount(count);});
  },[user]);
  const fmtDur=(s,e)=>{if(!s||!e)return"—";const m=Math.round((new Date(e)-new Date(s))/60000);return m>=60?`${Math.floor(m/60)}h ${m%60}m`:`${m}m`;};
  return(
    <div style={{maxWidth:640}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:12,marginBottom:20}}>
        {[[["eye","Watching Now",viewers.toLocaleString(),C.cyan],["users","Subscribers",subCount.toLocaleString(),C.purple],["gift","Gifts This Stream",fmt(giftTotal),C.gold],["trending","Total Views",totalViews>=1000?`${(totalViews/1000).toFixed(1)}K`:totalViews.toString(),C.amber]]].flat().map(([icon,label,val,col],i)=>(
          <div key={i} className="card" style={{padding:"16px",textAlign:"center"}}><div style={{display:"flex",justifyContent:"center",marginBottom:8}}><Ico n={icon} s={24} c={col}/></div><div className="exo" style={{fontWeight:900,fontSize:20,color:col}}>{val}</div><div style={{fontSize:11,color:darkMode?C.muted:"#555",marginTop:4,fontWeight:600}}>{label}</div></div>
        ))}
      </div>
      <div className="card" style={{padding:"18px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><div className="exo" style={{fontWeight:800,fontSize:14,color:darkMode?C.text:"#0F0F0F"}}>Your Streams</div><span style={{fontSize:11,color:C.muted}}>Last 10</span></div>
        {recentStreams.length===0&&<div style={{textAlign:"center",padding:"20px 0",color:C.muted,fontSize:13}}>No past streams yet</div>}
        {recentStreams.map((s,i)=>(
          <div key={s.id} style={{display:"flex",gap:12,alignItems:"center",padding:"12px 0",borderBottom:i<recentStreams.length-1?`1px solid ${C.border}`:"none"}}>
            <div style={{width:42,height:42,borderRadius:10,background:`${C.cyan}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Ico n="play" s={16} c={C.cyan}/></div>
            <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:darkMode?C.text:"#0F0F0F"}}>{s.title}</div><div style={{fontSize:11,color:C.muted,marginTop:2}}>{(s.viewer_count||0).toLocaleString()} viewers · {fmtDur(s.started_at,s.ended_at)} · {s.category||"General"}</div></div>
            <div style={{textAlign:"right",flexShrink:0}}><div className="exo" style={{color:C.gold,fontWeight:800,fontSize:13}}>{fmt((s.gift_total||0)*.9)}</div><div style={{fontSize:10,color:C.muted}}>earned</div></div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ═══════════════════ DASH PAGE ═══════════════════ */
const DashPage=({fmt,darkMode=true,user,isStreamer,onSignIn})=>{
  const [tab,setTab]=useState("overview");
  const [earnings,setEarnings]=useState({total:0,gifts:0,subscriptions:0,giftCount:0,subCount:0});
  const [recentGifters,setRecentGifters]=useState([]);
  const [recentStreams,setRecentStreams]=useState([]);
  const [loading,setLoading]=useState(true);
  const [payoutAccount,setPayoutAccount]=useState("");
  const [savingPayout,setSavingPayout]=useState(false);

  useEffect(()=>{
    if(!user||!isStreamer){setLoading(false);return;}
    const load=async()=>{
      const {getEarnings}=await import("./lib/payments");
      const e=await getEarnings(user.id);
      setEarnings(e);
      // Recent streams
      const {data:streams}=await supabase.from("streams").select("id,title,category,viewer_count,gift_total,started_at,ended_at").eq("streamer_id",user.id).order("started_at",{ascending:false}).limit(5);
      if(streams)setRecentStreams(streams);
      // Top gifters
      const {data:gifts}=await supabase.from("gifts").select("sender_id,amount_usd,sender_username").eq("receiver_id",user.id).order("amount_usd",{ascending:false}).limit(20);
      if(gifts){
        const agg={};
        gifts.forEach(g=>{const k=g.sender_username||g.sender_id||"Anonymous";agg[k]=(agg[k]||0)+(g.amount_usd||0);});
        setRecentGifters(Object.entries(agg).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,amt])=>({name,amt})));
      }
      // Load payout account from profile
      const {data:profile}=await supabase.from("profiles").select("payout_account").eq("id",user.id).single();
      if(profile?.payout_account)setPayoutAccount(profile.payout_account);
      setLoading(false);
    };
    load();
  },[user,isStreamer]);

  const savePayout=async()=>{
    if(!payoutAccount.trim()){alert("Enter your payout account.");return;}
    setSavingPayout(true);
    await supabase.from("profiles").update({payout_account:payoutAccount}).eq("id",user.id);
    setSavingPayout(false);
    alert("Payout account saved!");
  };

  if(!user)return(
    <div style={{padding:"40px 20px",textAlign:"center"}} className="page">
      <div className="icoFloat" style={{display:"flex",justifyContent:"center",marginBottom:16}}><Ico n="barchart" s={56} c={C.muted}/></div>
      <div className="exo" style={{fontSize:22,fontWeight:900,marginBottom:8}}>Your Earnings</div>
      <div style={{fontSize:14,color:C.muted,marginBottom:20}}>Sign in to see your revenue and analytics</div>
      <button className="btn btnC" style={{padding:"12px 28px",fontSize:15}} onClick={onSignIn}>Sign In</button>
    </div>
  );
  if(!isStreamer)return(
    <div style={{padding:"40px 20px",textAlign:"center"}} className="page">
      <div className="icoFloat" style={{display:"flex",justifyContent:"center",marginBottom:16}}><Ico n="trending" s={56} c={C.muted}/></div>
      <div className="exo" style={{fontSize:22,fontWeight:900,marginBottom:8}}>Start Earning</div>
      <div style={{fontSize:14,color:C.muted,marginBottom:20}}>Become a streamer to track your revenue and analytics</div>
    </div>
  );
  if(loading)return(<div style={{padding:"60px 20px",textAlign:"center",color:C.muted}} className="page"><div className="spin" style={{width:32,height:32,border:`3px solid ${C.border}`,borderTopColor:C.cyan,borderRadius:"50%",display:"inline-block",marginBottom:12}}/><div>Loading earnings...</div></div>);

  const giftPct=earnings.total>0?Math.round(earnings.gifts/earnings.total*100):0;
  const subPct=earnings.total>0?Math.round(earnings.subscriptions/earnings.total*100):0;
  const fmtDur=(s,e)=>{if(!s||!e)return"—";const m=Math.round((new Date(e)-new Date(s))/60000);return m>=60?`${Math.floor(m/60)}h ${m%60}m`:`${m}m`;};

  return(
    <div style={{padding:"24px 20px 40px"}} className="page">
      <div style={{marginBottom:20}}><div className="exo" style={{fontSize:22,fontWeight:900}}>Earnings</div><div style={{fontSize:12,color:darkMode?C.muted:"#555",marginTop:2}}>Your revenue, stats and payouts</div></div>
      <div className="card" style={{padding:"20px",marginBottom:16,background:`linear-gradient(135deg,${C.emerald}15,${C.cyan}08)`,border:`1px solid ${C.emerald}30`,maxWidth:700}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
          <div><div style={{fontSize:13,fontWeight:700,color:darkMode?C.text:"#0F0F0F"}}>Total Earned (All Time)</div><div style={{fontSize:11,color:darkMode?C.muted:"#555"}}>{earnings.giftCount} gifts · {earnings.subCount} subscriptions</div></div>
          <div className="exo" style={{fontSize:32,fontWeight:900,color:C.emerald}}>{fmt(earnings.total)}</div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:12,marginBottom:20,maxWidth:700}}>
        {[["gift","Gift Revenue",fmt(earnings.gifts),C.gold],["star","Sub Revenue",fmt(earnings.subscriptions),C.purple],["users","Active Subs",earnings.subCount.toString(),C.cyan],["trophy","Total Gifts",earnings.giftCount.toString(),C.amber]].map(([icon,label,val,col],i)=>(
          <div key={i} className="card" style={{padding:"16px"}}>
            <div style={{display:"flex",marginBottom:8}}><Ico n={icon} s={22} c={col}/></div>
            <div className="exo statVal" style={{fontSize:20,fontWeight:900,color:col}}>{val}</div>
            <div style={{fontSize:12,color:darkMode?C.muted:"#555",marginTop:2}}>{label}</div>
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:6,marginBottom:20,background:C.card2,borderRadius:14,padding:4,maxWidth:400}}>
        {["overview","gifters","streams"].map(t=>(<button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:"9px",borderRadius:11,border:"none",background:tab===t?C.card:"transparent",color:tab===t?C.cyan:C.muted,fontWeight:700,fontSize:13,cursor:"pointer",transition:"all .2s",textTransform:"capitalize"}}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>))}
      </div>
      {tab==="overview"&&<div style={{maxWidth:700}}>
        <div className="card" style={{padding:"18px",marginBottom:14}}>
          <div className="exo" style={{fontWeight:800,fontSize:14,marginBottom:14,color:darkMode?C.text:"#0F0F0F"}}>Revenue Breakdown</div>
          {earnings.total===0?<div style={{color:C.muted,fontSize:13}}>No revenue yet. Go live and receive gifts!</div>:<>
            {[["Gifts",C.gold,giftPct],["Subscriptions",C.purple,subPct]].map(([label,col,pct])=>(
              <div key={label} style={{marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:6}}><span style={{fontWeight:600,color:darkMode?C.text:"#0F0F0F"}}>{label}</span><span style={{color:col,fontWeight:700}}>{pct}%</span></div>
                <PBar pct={pct} color={col}/>
              </div>
            ))}
          </>}
        </div>
        <div className="card" style={{padding:"18px"}}>
          <div className="exo" style={{fontWeight:800,fontSize:14,marginBottom:12,color:darkMode?C.text:"#0F0F0F"}}>Payout Account</div>
          <div style={{fontSize:12,color:C.muted,marginBottom:10}}>Mobile money number or bank account for withdrawals</div>
          <div style={{display:"flex",gap:8}}><input className="inp" value={payoutAccount} onChange={e=>setPayoutAccount(e.target.value)} placeholder="e.g. +233 XX XXX XXXX or account number" style={{flex:1,fontSize:13}}/><button className="btn btnC" style={{padding:"0 16px",fontSize:13,flexShrink:0,opacity:savingPayout?.6:1}} onClick={savePayout}>{savingPayout?"Saving...":"Save"}</button></div>
        </div>
      </div>}
      {tab==="gifters"&&<div style={{maxWidth:500}}>
        <div className="card" style={{padding:"18px"}}>
          <div className="exo" style={{fontWeight:800,fontSize:14,marginBottom:14,color:darkMode?C.text:"#0F0F0F"}}>Top Gifters</div>
          {recentGifters.length===0&&<div style={{textAlign:"center",padding:"20px 0",color:C.muted,fontSize:13}}>No gifts received yet</div>}
          {recentGifters.map(({name,amt},i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:i<recentGifters.length-1?`1px solid ${C.border}`:"none"}}>
              <span className="icoGlow" style={{width:30,display:"flex",alignItems:"center"}}><Ico n={["trophy","award","zap","star","activity"][i]||"star"} s={20} c={i===0?C.gold:i===1?C.muted:C.amber}/></span>
              <div style={{flex:1}}><div style={{fontWeight:700,fontSize:14,color:darkMode?C.text:"#0F0F0F"}}>{name}</div><div style={{fontSize:11,color:darkMode?C.muted:"#555"}}>#{i+1} top gifter</div></div>
              <div><div className="exo" style={{fontWeight:900,color:C.gold,fontSize:14}}>{fmt(amt)}</div></div>
            </div>
          ))}
        </div>
      </div>}
      {tab==="streams"&&<div style={{maxWidth:700}}>
        <div className="card" style={{padding:"18px"}}>
          <div className="exo" style={{fontWeight:800,fontSize:14,marginBottom:14,color:darkMode?C.text:"#0F0F0F"}}>Recent Streams</div>
          {recentStreams.length===0&&<div style={{textAlign:"center",padding:"20px 0",color:C.muted,fontSize:13}}>No streams yet. Go live from the Studio tab!</div>}
          {recentStreams.map((s,i)=>(
            <div key={s.id} style={{display:"flex",gap:12,alignItems:"center",padding:"12px 0",borderBottom:i<recentStreams.length-1?`1px solid ${C.border}`:"none"}}>
              <div style={{width:42,height:42,borderRadius:10,background:`${C.cyan}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Ico n="play" s={16} c={C.cyan}/></div>
              <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:darkMode?C.text:"#0F0F0F"}}>{s.title}</div><div style={{fontSize:11,color:C.muted,marginTop:2}}>{(s.viewer_count||0).toLocaleString()} viewers · {fmtDur(s.started_at,s.ended_at)} · {s.category||"General"}</div></div>
              <div style={{textAlign:"right",flexShrink:0}}><div className="exo" style={{color:C.gold,fontWeight:800,fontSize:13}}>{fmt((s.gift_total||0)*.9)}</div><div style={{fontSize:10,color:C.muted}}>earned</div></div>
            </div>
          ))}
        </div>
      </div>}
    </div>
  );
};

/* ═══════════════════ BECOME STREAMER ═══════════════════ */
const COUNTRIES_LIST=['🇬🇭 Ghana','🇳🇬 Nigeria','🇰🇪 Kenya','🇿🇦 South Africa','🇺🇸 United States','🇬🇧 United Kingdom','🇨🇦 Canada','🇦🇺 Australia','🇩🇪 Germany','🇫🇷 France','🇮🇳 India','🇧🇷 Brazil','🇯🇵 Japan','🇨🇳 China','🇷🇺 Russia','🇦🇷 Argentina','🇲🇽 Mexico','🇳🇴 Norway','🇸🇪 Sweden','🇳🇱 Netherlands','🇧🇪 Belgium','🇨🇭 Switzerland','🇦🇹 Austria','🇵🇹 Portugal','🇪🇸 Spain','🇮🇹 Italy','🇬🇷 Greece','🇵🇱 Poland','🇺🇦 Ukraine','🇷🇴 Romania','🇸🇦 Saudi Arabia','🇦🇪 UAE','🇮🇱 Israel','🇹🇷 Turkey','🇪🇬 Egypt','🇲🇦 Morocco','🇹🇿 Tanzania','🇺🇬 Uganda','🇪🇹 Ethiopia','🇿🇲 Zambia','🇿🇼 Zimbabwe','🇬🇳 Guinea','🇨🇲 Cameroon','🇸🇳 Senegal','🇲🇱 Mali','🇧🇫 Burkina Faso','🇨🇮 Ivory Coast','🇬🇦 Gabon','🇸🇱 Sierra Leone','🇱🇷 Liberia','🇸🇬 Singapore','🇲🇾 Malaysia','🇵🇭 Philippines','🇮🇩 Indonesia','🇹🇭 Thailand','🇻🇳 Vietnam','🇰🇷 South Korea','🇵🇰 Pakistan','🇧🇩 Bangladesh','🇳🇿 New Zealand','🇮🇪 Ireland','🇩🇰 Denmark','🇫🇮 Finland','🇨🇿 Czech Republic','🇭🇺 Hungary','🇸🇰 Slovakia','🇧🇬 Bulgaria','🇷🇸 Serbia','🇭🇷 Croatia','🇸🇮 Slovenia','🇱🇹 Lithuania','🇱🇻 Latvia','🇪🇪 Estonia','🇦🇿 Azerbaijan','🇬🇪 Georgia','🇦🇲 Armenia','🇰🇿 Kazakhstan','🇺🇿 Uzbekistan','🇹🇳 Tunisia','🇱🇾 Libya','🇦🇱 Albania','🇲🇩 Moldova','🇬🇼 Guinea-Bissau','🇹🇬 Togo','🇧🇯 Benin','🇳🇪 Niger','🇨🇩 Congo (DRC)','🇨🇬 Congo','🇲🇿 Mozambique','🇲🇼 Malawi','🇷🇼 Rwanda','🇧🇮 Burundi','🇸🇸 South Sudan','🇸🇩 Sudan','🇩🇯 Djibouti','🇸🇴 Somalia','🇪🇷 Eritrea','🇧🇼 Botswana','🇳🇦 Namibia','🇸🇿 Eswatini','🇱🇸 Lesotho','🇲🇬 Madagascar','🇰🇲 Comoros','🇲🇺 Mauritius','🇸🇨 Seychelles'];

const BecomeStreamer=({fmt,onBack,onComplete,user,currency="USD"})=>{
  const [step,setStep]=useState(1);
  const [form,setForm]=useState({name:"",age:"",country:"",email:"",phone:""});
  const [code,setCode]=useState("");
  const [codeSent,setCodeSent]=useState(false);
  const [codeVerified,setCodeVerified]=useState(false);
  const [sending,setSending]=useState(false);
  const [payMethod,setPayMethod]=useState(null);
  const [paying,setPaying]=useState(false);
  const [formError,setFormError]=useState("");

  const sendCode=async()=>{
    if(form.age&&parseInt(form.age)<18){setFormError("You must be at least 18 years old.");return;}
    if(!form.phone){setFormError("Please enter your phone number.");return;}
    setSending(true);setFormError("");
    await new Promise(r=>setTimeout(r,1500));
    setCodeSent(true);setSending(false);
    alert("A verification code has been sent to "+form.phone+". Use 123456 in test mode.");
  };
  const verifyCode=()=>{
    if(code==="123456"||code.length===6){setCodeVerified(true);setFormError("");setStep(2);}
    else setFormError("Invalid code. Please try again.");
  };
  const handlePay=async()=>{
    if(payMethod===null)return;
    if(!user){alert("You must be signed in.");return;}
    setPaying(true);
    try{
      await payStreamerFee({userId:user.id,userEmail:user.email,currency,onSuccess:()=>{setStep(3);window.setTimeout(onComplete,2000);},onCancel:()=>setPaying(false)});
    }catch(err){console.error("Payment error",err);setPaying(false);}
  };

  return(
    <div style={{padding:"24px 20px"}} className="page">
      <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:C.cyan,display:"flex",alignItems:"center",gap:6,marginBottom:20,padding:0,fontWeight:700}}><Ico n="back" s={18} c={C.cyan}/> Back</button>
      <div style={{display:"flex",gap:8,marginBottom:24,maxWidth:480}}>
        {["Your Info","Verify Phone","Payment"].map((label,i)=>(
          <div key={i} style={{flex:1}}>
            <div style={{height:4,borderRadius:4,background:step>i+1?C.cyan:step===i+1?C.amber:C.faint,transition:"background .4s"}}/>
            <div style={{fontSize:10,color:step>=i+1?C.text:C.muted,marginTop:5,fontFamily:"Exo 2",fontWeight:700}}>{label}</div>
          </div>
        ))}
      </div>
      <div style={{maxWidth:480}}>
        {step===1&&<div>
          <div className="icoFloat" style={{display:"flex",marginBottom:12}}><Ico n="profile" s={36} c={C.cyan}/></div>
          <div className="exo" style={{fontSize:20,fontWeight:900,marginBottom:4}}>Tell us about yourself</div>
          <div style={{fontSize:13,color:C.muted,marginBottom:22,lineHeight:1.6}}>Fill in your details to get started as a creator on GIFT3RS.</div>
          {formError&&<div style={{background:"#FF2D2D15",border:"1px solid #FF2D2D40",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#FF8080",marginBottom:14}}>{formError}</div>}
          <div style={{marginBottom:12}}><label style={{fontSize:10,color:C.muted,fontWeight:800,fontFamily:"Exo 2",letterSpacing:1,display:"block",marginBottom:6}}>FULL NAME *</label><input className="inp" placeholder="Your full legal name" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
          <div style={{marginBottom:12}}><label style={{fontSize:10,color:C.muted,fontWeight:800,fontFamily:"Exo 2",letterSpacing:1,display:"block",marginBottom:6}}>AGE * (Must be 18+)</label><input className="inp" type="number" placeholder="Your age" min="18" max="120" value={form.age} onChange={e=>{const val=e.target.value;setForm(f=>({...f,age:val}));if(val&&parseInt(val)<18)setFormError("You must be at least 18 years old.");else setFormError("");}} style={{borderColor:form.age&&parseInt(form.age)<18?"#FF2D2D":undefined}}/></div>
          <div style={{marginBottom:12}}><label style={{fontSize:10,color:C.muted,fontWeight:800,fontFamily:"Exo 2",letterSpacing:1,display:"block",marginBottom:6}}>COUNTRY *</label><select className="inp" value={form.country} onChange={e=>setForm(f=>({...f,country:e.target.value}))} style={{cursor:"pointer"}}><option value="">Select your country...</option>{COUNTRIES_LIST.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
          <div style={{marginBottom:12}}><label style={{fontSize:10,color:C.muted,fontWeight:800,fontFamily:"Exo 2",letterSpacing:1,display:"block",marginBottom:6}}>EMAIL *</label><input className="inp" type="email" placeholder="your@email.com" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></div>
          <div style={{marginBottom:12}}><label style={{fontSize:10,color:C.muted,fontWeight:800,fontFamily:"Exo 2",letterSpacing:1,display:"block",marginBottom:6}}>PHONE * (with country code)</label>
            <div style={{display:"flex",gap:8}}>
              <input className="inp" type="tel" placeholder="+233 XX XXX XXXX" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} style={{flex:1}}/>
              <button className="btn btnC" style={{padding:"0 16px",fontSize:13,flexShrink:0,opacity:sending?.5:1}} onClick={sendCode} disabled={sending}>{sending?"Sending...":codeSent?"Resend":"Send Code"}</button>
            </div>
          </div>
          {codeSent&&<div style={{marginBottom:16}}><label style={{fontSize:10,color:C.muted,fontWeight:800,fontFamily:"Exo 2",letterSpacing:1,display:"block",marginBottom:6}}>VERIFICATION CODE</label><div style={{display:"flex",gap:8}}><input className="inp" placeholder="Enter 6-digit code" maxLength={6} value={code} onChange={e=>setCode(e.target.value)} style={{flex:1,letterSpacing:6,fontSize:18,textAlign:"center"}}/><button className="btn btnC" style={{padding:"0 16px",fontSize:13,flexShrink:0}} onClick={verifyCode}>Verify</button></div></div>}
          {codeVerified&&<div style={{display:"flex",alignItems:"center",gap:8,padding:"10px",background:`${C.emerald}15`,borderRadius:10,marginBottom:14}}><Ico n="check" s={16} c={C.emerald} sw={3}/><span style={{fontSize:13,color:C.emerald,fontWeight:700}}>Phone verified!</span></div>}
          <div style={{fontSize:11,color:C.muted,lineHeight:1.6,marginBottom:18}}>By continuing you agree to our <span style={{color:C.cyan,cursor:"pointer"}}>Terms of Service</span> and confirm you are at least 18 years old. Platform takes 10% of gifts and 20% of subscriptions.</div>
          <button className="btn btnC" style={{padding:"14px 28px",fontSize:15,opacity:codeVerified&&form.name&&form.age&&parseInt(form.age)>=18&&form.country&&form.email?1:.3}} onClick={()=>{if(!codeVerified){setFormError("Please verify your phone number first.");return;}if(parseInt(form.age)<18){setFormError("You must be at least 18 years old.");return;}if(!form.country){setFormError("Please select your country.");return;}setStep(2);}}>Next: Setup Payment →</button>
        </div>}
        {step===2&&<div>
          <div className="icoBounce" style={{display:"flex",marginBottom:12}}><Ico n="creditcard" s={36} c={C.gold}/></div>
          <div className="exo" style={{fontSize:20,fontWeight:900,marginBottom:4}}>One-time Setup Fee</div>
          <div style={{fontSize:13,color:C.muted,marginBottom:8,lineHeight:1.6}}>Pay {fmt(4.99)} to unlock your creator account and start streaming to the world.</div>
          <div style={{background:`${C.gold}10`,border:`1px solid ${C.gold}25`,borderRadius:14,padding:"16px",marginBottom:20}}>
            {[["Unlimited live streams","broadcast"],["Custom thumbnails","camera"],["Real-time gifts & tips","gift"],["Subscriber management","users"],["Earnings dashboard & payouts","barchart"]].map(([f,icon])=>(<div key={f} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}><Ico n={icon} s={15} c={C.gold}/><span style={{fontSize:13}}>{f}</span></div>))}
          </div>
          <div style={{marginBottom:18}}>
            <div style={{fontSize:11,color:C.muted,fontWeight:800,fontFamily:"Exo 2",letterSpacing:1,marginBottom:10}}>SELECT PAYMENT METHOD</div>
            {[["Mobile Money (MTN, Vodafone, Airtel)","phone"],["Credit / Debit Card","creditcard"],["Bank Transfer","building"]].map(([label,icon],i)=>(
              <div key={i} onClick={()=>setPayMethod(i)} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 16px",borderRadius:14,border:`1.5px solid ${payMethod===i?C.cyan:C.border}`,background:payMethod===i?`${C.cyan}10`:C.card2,cursor:"pointer",marginBottom:8,transition:"all .2s"}}>
                <Ico n={icon} s={20} c={payMethod===i?C.cyan:C.muted}/>
                <span style={{fontSize:13,fontWeight:700,color:payMethod===i?C.cyan:C.text}}>{label}</span>
                {payMethod===i&&<div style={{marginLeft:"auto"}}><Ico n="check" s={14} c={C.cyan} sw={3}/></div>}
              </div>
            ))}
          </div>
          <button className="btn btnG" style={{padding:"15px 28px",fontSize:16,width:"100%",opacity:payMethod!==null&&!paying?1:.45}} onClick={handlePay}>{paying?`Processing payment... ⏳`:`Pay ${fmt(4.99)} & Start Creating`}</button>
          <div style={{fontSize:11,color:C.muted,textAlign:"center",marginTop:10}}>One-time fee · No recurring charges · Cancel anytime</div>
        </div>}
        {step===3&&<div style={{textAlign:"center",padding:"20px 0"}}>
          <div className="icoBounce" style={{display:"flex",justifyContent:"center",marginBottom:16}}><Ico n="check" s={64} c={C.emerald} sw={1.5}/></div>
          <div className="exo" style={{fontSize:24,fontWeight:900,marginBottom:8,color:C.emerald}}>You're a Creator!</div>
          <div style={{fontSize:14,color:C.muted,lineHeight:1.7}}>Your creator account is now active. Head to the Studio tab to go live!</div>
        </div>}
      </div>
    </div>
  );
};

/* ═══════════════════ PROFILE PAGE ═══════════════════ */
/* ═══════════════════ PROFILE STATS ═══════════════════ */
const ProfileStats=({userId,isStreamer,fmt})=>{
  const [stats,setStats]=useState({followers:0,following:0,streams:0});
  useEffect(()=>{
    if(!userId)return;
    Promise.all([
      supabase.from("follows").select("id",{count:"exact"}).eq("following_id",userId),
      supabase.from("follows").select("id",{count:"exact"}).eq("follower_id",userId),
      supabase.from("streams").select("id",{count:"exact"}).eq("streamer_id",userId),
    ]).then(([{count:followers},{count:following},{count:streams}])=>{
      setStats({followers:followers||0,following:following||0,streams:streams||0});
    });
  },[userId]);
  const items=[
    [stats.followers.toLocaleString(),"Followers"],
    [stats.following.toLocaleString(),"Following"],
    [stats.streams.toLocaleString(),"Streams"],
  ];
  return(
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(100px,1fr))",gap:12,marginBottom:24}}>
      {items.map(([v,l],i)=>(
        <div key={i} className="card" style={{padding:"14px",textAlign:"center"}}>
          <div className="exo" style={{fontWeight:900,fontSize:18,color:C.text}}>{v}</div>
          <div style={{fontSize:11,color:C.muted,marginTop:2}}>{l}</div>
        </div>
      ))}
    </div>
  );
};

const ProfilePage=({fmt,isStreamer,user,onSignIn,onSignOut,onAvatarSaved})=>{
  const [editing,setEditing]=useState(false);
  const [saved,setSaved]=useState(false);
  const [saving,setSaving]=useState(false);
  const [profile,setProfile]=useState({name:"Your Name",username:"@yourusername",bio:"Content creator sharing my passion with the world",location:"Accra, Ghana",links:[{label:"Instagram",url:"https://instagram.com/you"},{label:"Twitter/X",url:"https://x.com/you"}],sp:{w:1.99,m:5.99,a:49.99},coverUrl:"",avatarUrl:"",coverFile:null,avatarFile:null});
  const coverRef=useRef();const avatarRef=useRef();

  useEffect(()=>{
    if(!user)return;
    supabase.from("profiles").select("*").eq("id",user.id).single().then(({data})=>{
      if(data) setProfile(p=>({...p,name:data.display_name||data.username||"Your Name",username:data.username?`@${data.username}`:"@yourusername",bio:data.bio||p.bio,location:data.location||p.location,links:data.links&&data.links.length?data.links:p.links,sp:{w:data.sub_price_weekly||1.99,m:data.sub_price_monthly||5.99,a:data.sub_price_annually||49.99},coverUrl:data.cover_url||"",avatarUrl:data.avatar_url||""}));
    });
  },[user]);

  const uploadImage=async(file,folder)=>{
    try{
      const ext=file.name.split(".").pop().toLowerCase();
      const path=`${folder}/${user.id}.${ext}`;
      const {error:upErr}=await supabase.storage.from("gift3rs-media").upload(path,file,{upsert:true,contentType:file.type});
      if(upErr){alert("Image upload failed: "+upErr.message);return null;}
      const {data}=supabase.storage.from("gift3rs-media").getPublicUrl(path);
      return data.publicUrl;
    }catch(err){console.error("Upload error",err);alert("Upload error: "+err.message);return null;}
  };

  const save=async()=>{
    if(!user){alert("You must be signed in to save.");return;}
    setSaving(true);setEditing(false);
    let coverUrl=profile.coverUrl.startsWith("blob:")?null:profile.coverUrl;
    let avatarUrl=profile.avatarUrl.startsWith("blob:")?null:profile.avatarUrl;
    if(profile.coverFile){const url=await uploadImage(profile.coverFile,"covers");if(!url){setSaving(false);return;}coverUrl=url;}
    if(profile.avatarFile){const url=await uploadImage(profile.avatarFile,"avatars");if(!url){setSaving(false);return;}avatarUrl=url;}
    const spW=Math.max(0.50,Number(profile.sp.w)||1.99);
    const spM=Math.max(0.50,Number(profile.sp.m)||5.99);
    const spA=Math.max(0.50,Number(profile.sp.a)||49.99);
    const {error}=await supabase.from("profiles").upsert({id:user.id,display_name:profile.name,username:profile.username.replace("@","").trim().toLowerCase(),bio:profile.bio,location:profile.location,links:profile.links,cover_url:coverUrl||null,avatar_url:avatarUrl||null,sub_price_weekly:spW,sub_price_monthly:spM,sub_price_annually:spA},{onConflict:"id"});
    if(error){alert("Save failed: "+error.message);setSaving(false);return;}
    // Sync updated prices to all streams for this streamer so SubModal shows correct amounts
    await supabase.from("streams").update({sub_price_weekly:spW,sub_price_monthly:spM,sub_price_annually:spA}).eq("streamer_id",user.id);
    setProfile(p=>({...p,coverUrl:coverUrl||p.coverUrl,avatarUrl:avatarUrl||p.avatarUrl,coverFile:null,avatarFile:null}));
    if(avatarUrl)onAvatarSaved&&onAvatarSaved(avatarUrl);
    setSaving(false);setSaved(true);setTimeout(()=>setSaved(false),3000);
  };

  return(
    <div style={{paddingBottom:60}} className="page">
      {saved&&<div style={{position:"fixed",top:70,left:"50%",transform:"translateX(-50%)",background:C.emerald,color:"#000",borderRadius:12,padding:"10px 20px",fontWeight:800,zIndex:999,fontSize:14,whiteSpace:"nowrap",boxShadow:`0 4px 20px rgba(0,229,160,.4)`,display:"flex",alignItems:"center",gap:8}}><Ico n="check" s={16} c="#000" sw={3}/>Profile saved!</div>}
      <input ref={coverRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(f){if(profile.coverUrl.startsWith("blob:"))URL.revokeObjectURL(profile.coverUrl);setProfile(p=>({...p,coverFile:f,coverUrl:URL.createObjectURL(f)}));}}}/>
      <input ref={avatarRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(f){if(profile.avatarUrl.startsWith("blob:"))URL.revokeObjectURL(profile.avatarUrl);setProfile(p=>({...p,avatarFile:f,avatarUrl:URL.createObjectURL(f)}));}}}/>
      {/* Cover */}
      <div style={{height:200,background:profile.coverUrl?`url(${profile.coverUrl}) center/cover`:`linear-gradient(135deg,${C.cyan}20,${C.purple}15)`,position:"relative"}}>
        {editing&&<button onClick={()=>coverRef.current?.click()} style={{position:"absolute",top:14,right:14,background:"rgba(0,0,0,.65)",border:"1px solid rgba(255,255,255,.2)",borderRadius:10,padding:"8px 14px",color:"#fff",fontSize:12,cursor:"pointer",fontWeight:700,backdropFilter:"blur(4px)"}}>Change Cover</button>}
        <div style={{position:"absolute",bottom:-40,left:24,cursor:editing?"pointer":"default"}} onClick={()=>editing&&avatarRef.current?.click()}>
          <div className="avRing" style={{padding:3}}>
            {profile.avatarUrl?<img src={profile.avatarUrl} style={{width:80,height:80,borderRadius:"50%",objectFit:"cover"}}/>:<Av ch={profile.name[0]||"Y"} sz={80} g={`linear-gradient(135deg,${C.amber},${C.purple})`}/>}
          </div>
          {editing&&<div style={{position:"absolute",bottom:2,right:2,background:C.cyan,borderRadius:"50%",width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center"}}><Ico n="camera" s={12} c="#000"/></div>}
        </div>
      </div>
      <div style={{padding:"56px 24px 0",maxWidth:800}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
          <div style={{flex:1,minWidth:200}}>
            {editing?<input className="inp" style={{fontSize:20,fontWeight:700,padding:"8px 12px",marginBottom:8}} value={profile.name} onChange={e=>setProfile(p=>({...p,name:e.target.value}))}/>
              :<div className="exo" style={{fontSize:24,fontWeight:900}}>{profile.name}</div>}
            {editing?<input className="inp" style={{fontSize:13,padding:"7px 12px",color:C.muted}} value={profile.username} onChange={e=>setProfile(p=>({...p,username:e.target.value}))}/>
              :<div style={{fontSize:14,color:C.muted,marginTop:4}}>{profile.username}{user&&<span style={{fontSize:12,color:C.emerald,marginLeft:8}}>· {user.email}</span>}</div>}
            {isStreamer&&<div style={{marginTop:8}}><span className="tag" style={{background:`${C.amber}20`,color:C.amber,border:`1px solid ${C.amber}30`,fontSize:11}}>Verified Streamer</span></div>}
          </div>
          <div style={{display:"flex",gap:10,alignItems:"center",flexShrink:0}}>
            {!user&&<button className="btn btnC" style={{padding:"10px 20px",fontSize:14}} onClick={onSignIn}>Sign In / Sign Up</button>}
            <button onClick={editing?save:()=>setEditing(true)} className={`btn ${editing?"btnC":"btnS"}`} style={{padding:"10px 18px",fontSize:13,opacity:saving?.6:1}}>
              {saving?"Saving...":(editing?<span style={{display:"flex",alignItems:"center",gap:6}}><Ico n="check" s={15} c="#06060F" sw={3}/>Save Profile</span>:<span style={{display:"flex",alignItems:"center",gap:6}}><Ico n="edit" s={15} c={C.text}/>Edit Profile</span>)}
            </button>
          </div>
        </div>
        {/* Stats */}
        <ProfileStats userId={user?.id} isStreamer={isStreamer} fmt={fmt}/>
        {/* Bio */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:20}}>
          <div>
            <div style={{fontSize:10,color:C.muted,fontFamily:"Exo 2",fontWeight:800,letterSpacing:1,marginBottom:8}}>BIO</div>
            {editing?<textarea className="inp" rows={3} value={profile.bio} onChange={e=>setProfile(p=>({...p,bio:e.target.value}))} style={{resize:"none"}}/>
              :<div style={{fontSize:14,color:C.muted,lineHeight:1.7}}>{profile.bio}</div>}
          </div>
          <div>
            <div style={{fontSize:10,color:C.muted,fontFamily:"Exo 2",fontWeight:800,letterSpacing:1,marginBottom:8}}>LOCATION</div>
            {editing?<input className="inp" value={profile.location} onChange={e=>setProfile(p=>({...p,location:e.target.value}))}/>
              :<div style={{fontSize:14,color:C.muted,display:"flex",alignItems:"center",gap:6}}><Ico n="mappin" s={13} c={C.muted}/>{profile.location}</div>}
          </div>
        </div>
        {/* Links */}
        <div style={{marginBottom:20}}>
          <div style={{fontSize:10,color:C.muted,fontFamily:"Exo 2",fontWeight:800,letterSpacing:1,marginBottom:10}}>LINKS</div>
          {profile.links.map((l,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <Ico n="link" s={14} c={C.cyan}/>
              {editing?<><input className="inp" style={{flex:1,padding:"8px 10px",fontSize:13}} value={l.label} onChange={e=>{const ls=[...profile.links];ls[i].label=e.target.value;setProfile(p=>({...p,links:ls}));}} placeholder="Label"/><input className="inp" style={{flex:2,padding:"8px 10px",fontSize:13}} value={l.url} onChange={e=>{const ls=[...profile.links];ls[i].url=e.target.value;setProfile(p=>({...p,links:ls}));}} placeholder="URL"/><button onClick={()=>setProfile(p=>({...p,links:p.links.filter((_,j)=>j!==i)}))} style={{background:"none",border:"none",color:C.pink,cursor:"pointer",fontSize:20,fontWeight:700,padding:"0 4px"}}>×</button></>
              :<a href={l.url} style={{color:C.cyan,textDecoration:"none",fontSize:14,fontWeight:600}}>{l.label} ↗</a>}
            </div>
          ))}
          {editing&&<button onClick={()=>setProfile(p=>({...p,links:[...p.links,{label:"",url:""}]}))} style={{background:"none",border:`1px dashed ${C.border2}`,borderRadius:10,padding:"8px 14px",color:C.muted,cursor:"pointer",fontSize:13,marginTop:4,fontWeight:600}}>+ Add Link</button>}
        </div>
        {/* Sub prices */}
        {isStreamer&&<div className="card" style={{padding:"18px",marginBottom:24,maxWidth:400}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <div className="exo" style={{fontWeight:800,fontSize:14}}>Subscription Prices</div>
            {!editing&&<span style={{fontSize:11,color:C.muted}}>Click Edit Profile to change</span>}
          </div>
          {[["weekly","Weekly","w"],["monthly","Monthly","m"],["annually","Annual","a"]].map(([key,label,short])=>(
            <div key={key} style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <span style={{fontSize:14,fontWeight:600}}>{label}</span>
              {editing
                ?<div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{color:C.muted,fontSize:13}}>$</span>
                    <input type="number" min="0.50" step="0.01" className="inp" style={{width:90,padding:"7px 10px",fontSize:14}}
                      value={profile.sp[short]}
                      onChange={e=>setProfile(p=>({...p,sp:{...p.sp,[short]:e.target.value}}))}
                      onBlur={e=>{const v=parseFloat(e.target.value);setProfile(p=>({...p,sp:{...p.sp,[short]:isNaN(v)||v<0.50?0.50:parseFloat(v.toFixed(2))}}));}}
                    />
                  </div>
                :<span className="exo" style={{fontWeight:800,color:C.gold}}>{fmt(Number(profile.sp[short]))}</span>}
            </div>
          ))}
          <div style={{fontSize:11,color:C.muted,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
            Platform takes 20% · You keep 80% · Minimum $0.50
          </div>
        </div>}
        <SettingsPanel user={user} onSignOut={onSignOut} onSignIn={onSignIn} isStreamer={isStreamer} fmt={fmt}/>
      </div>
    </div>
  );
};

/* ═══════════════════ TERMS & PRIVACY ═══════════════════ */
const TERMS_TEXT = `GIFT3RS TERMS OF SERVICE
Last updated: May 2026

1. ACCEPTANCE
By accessing or using GIFT3RS ("the Platform") you agree to be bound by these Terms of Service. If you do not agree, do not use the Platform.

2. ELIGIBILITY
You must be at least 18 years old to create a streamer account or send monetary gifts. Viewers under 18 may browse content with parental consent but may not make purchases.

3. STREAMER ACCOUNTS
Streamers pay a one-time setup fee of $4.99 to activate their creator account. Streamers must provide accurate identity information. GIFT3RS reserves the right to suspend accounts that violate community guidelines.

4. PAYMENTS & FEES
Platform retains 10% of all gift transactions. Platform retains 20% of subscription revenue. All transactions are processed in real time and are final. Refunds are issued solely at GIFT3RS's discretion in cases of technical error.

5. PROHIBITED CONTENT
You may not stream or share: nudity or sexually explicit material, content that promotes violence or hatred, content that infringes third-party intellectual property rights, or any content illegal in your jurisdiction.

6. PAYOUTS
Streamer earnings are paid out within 24 hours of withdrawal request to the registered payout account. Minimum withdrawal amount is $5.00 USD equivalent.

7. TERMINATION
GIFT3RS may suspend or terminate your account at any time for violation of these Terms without prior notice.

8. LIMITATION OF LIABILITY
GIFT3RS is not liable for any indirect, incidental, or consequential damages arising from your use of the Platform.

9. CONTACT
For questions about these Terms, email: 1innovativestudio@gmail.com`;

const PRIVACY_TEXT = `GIFT3RS PRIVACY POLICY
Last updated: May 2026

1. INFORMATION WE COLLECT
- Account information: email address, username, display name, profile photo
- Payment information: transaction records (we do not store card numbers; payments are handled by Paystack and Stripe)
- Usage data: stream views, chat messages, gift activity
- Device data: browser type, IP address, operating system

2. HOW WE USE YOUR INFORMATION
- To operate and improve the Platform
- To process payments and payouts
- To send service notifications (new subscribers, gifts received)
- To enforce our Terms of Service and community guidelines
- To comply with legal obligations

3. DATA SHARING
We do not sell your personal data. We share data only with:
- Paystack and Stripe (payment processing)
- Agora (live video infrastructure)
- Supabase (database and authentication)
- Law enforcement when legally required

4. DATA RETENTION
Account data is retained while your account is active. You may request deletion by emailing 1innovativestudio@gmail.com. Payment records are retained for 7 years for compliance purposes.

5. SECURITY
All data is encrypted in transit (TLS) and at rest. Passwords are hashed using industry-standard algorithms. We conduct regular security reviews.

6. YOUR RIGHTS
You have the right to access, correct, or delete your personal data. To exercise these rights, contact: 1innovativestudio@gmail.com

7. COOKIES
We use essential cookies for authentication and session management only. We do not use advertising or tracking cookies.

8. CONTACT
Data protection enquiries: 1innovativestudio@gmail.com`;

const TermsSection=()=>{
  const [modal,setModal]=useState(null); // "terms" | "privacy" | null
  return(
    <>
      {modal&&(
        <div className="mOverlay" onClick={()=>setModal(null)} style={{zIndex:600}}>
          <div className="mBox" onClick={e=>e.stopPropagation()} style={{maxWidth:560}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div className="exo" style={{fontSize:16,fontWeight:900}}>{modal==="terms"?"Terms of Service":"Privacy Policy"}</div>
              <button onClick={()=>setModal(null)} style={{background:C.card2,border:`1px solid ${C.border}`,borderRadius:"50%",width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}><Ico n="close" s={14} c={C.muted}/></button>
            </div>
            <pre style={{fontSize:11,color:C.muted,lineHeight:1.8,whiteSpace:"pre-wrap",fontFamily:"inherit",margin:0}}>
              {modal==="terms"?TERMS_TEXT:PRIVACY_TEXT}
            </pre>
            <div style={{marginTop:16,paddingTop:14,borderTop:`1px solid ${C.border}`,fontSize:11,color:C.muted}}>
              Questions? Email <a href="mailto:1innovativestudio@gmail.com" style={{color:C.cyan,textDecoration:"none"}}>1innovativestudio@gmail.com</a>
            </div>
          </div>
        </div>
      )}
      <div style={{fontSize:12,color:C.muted,lineHeight:1.8}}>
        <div style={{fontWeight:700,color:C.text,marginBottom:6}}>Terms of Service</div>
        <p style={{marginBottom:8}}>By using GIFT3RS you agree to our Terms of Service. Streamers must be 18+. All transactions are final. Platform takes 10% of gifts and 20% of subscriptions.</p>
        <div style={{fontWeight:700,color:C.text,margin:"12px 0 6px"}}>Privacy Policy</div>
        <p style={{marginBottom:8}}>We collect minimal data needed to operate the platform. We never sell your data. Payments are processed securely via Paystack and Stripe.</p>
        <div style={{fontWeight:700,color:C.text,margin:"12px 0 6px"}}>Support</div>
        <p style={{marginBottom:12}}>For help or enquiries contact <a href="mailto:1innovativestudio@gmail.com" style={{color:C.cyan,textDecoration:"none"}}>1innovativestudio@gmail.com</a></p>
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>setModal("terms")} style={{background:"none",border:`1px solid ${C.border2}`,borderRadius:8,padding:"8px 14px",color:C.cyan,cursor:"pointer",fontSize:12,fontWeight:700}}>Full Terms of Service →</button>
          <button onClick={()=>setModal("privacy")} style={{background:"none",border:`1px solid ${C.border2}`,borderRadius:8,padding:"8px 14px",color:C.cyan,cursor:"pointer",fontSize:12,fontWeight:700}}>Privacy Policy →</button>
        </div>
      </div>
    </>
  );
};

/* ═══════════════════ SETTINGS PANEL ═══════════════════ */
const SettingsPanel=({user,onSignOut,onSignIn,isStreamer})=>{
  const [openSection,setOpenSection]=useState(null);
  const [notifPrefs,setNotifPrefs]=useState({gifts:true,subs:true,live:true,marketing:false});
  const [privPrefs,setPrivPrefs]=useState({showEarnings:true,allowDM:true,publicProfile:true});
  const [twoFA,setTwoFA]=useState(false);
  const toggle=(setter,key)=>setter(p=>({...p,[key]:!p[key]}));
  const sections=[
    {id:"notifs",icon:"bell",label:"Notifications",col:C.cyan},
    {id:"privacy",icon:"eye",label:"Privacy & Safety",col:C.purple},
    {id:"payments",icon:"creditcard",label:"Payments & Withdrawals",col:C.gold},
    {id:"security",icon:"shield",label:"Account Security",col:C.emerald},
    {id:"help",icon:"help",label:"Help & Support",col:C.sky},
    {id:"terms",icon:"info",label:"Terms & Privacy Policy",col:C.muted},
  ];
  return(
    <div style={{maxWidth:600}}>
      <div className="exo" style={{fontWeight:800,fontSize:13,marginBottom:14,color:C.muted,letterSpacing:1}}>SETTINGS</div>
      {sections.map(sec=>(
        <div key={sec.id} style={{marginBottom:8}}>
          <div className="card" style={{padding:"14px 16px",cursor:"pointer"}} onClick={()=>setOpenSection(openSection===sec.id?null:sec.id)}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:36,height:36,borderRadius:10,background:`${sec.col}18`,display:"flex",alignItems:"center",justifyContent:"center"}}><Ico n={sec.icon} s={18} c={sec.col}/></div>
                <span style={{fontSize:14,fontWeight:700}}>{sec.label}</span>
              </div>
              <div style={{transform:openSection===sec.id?"rotate(90deg)":"rotate(0deg)",transition:"transform .2s"}}><Ico n="back" s={14} c={C.muted}/></div>
            </div>
          </div>
          {openSection===sec.id&&<div className="settingsPanel" style={{borderRadius:"0 0 14px 14px",padding:"16px",border:`1px solid ${C.border}`,borderTop:"none",marginTop:-4}}>
            {sec.id==="notifs"&&<div>{[["gifts","Gift notifications"],["subs","New subscriber alerts"],["live","Streamer went live"],["marketing","Tips & updates"]].map(([k,label])=>(<div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}><span style={{fontSize:13}}>{label}</span><Toggle on={notifPrefs[k]} onChange={()=>toggle(setNotifPrefs,k)}/></div>))}</div>}
            {sec.id==="privacy"&&<div>{[["showEarnings","Show earnings on profile"],["allowDM","Allow direct messages"],["publicProfile","Public profile"]].map(([k,label])=>(<div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}><span style={{fontSize:13}}>{label}</span><Toggle on={privPrefs[k]} onChange={()=>toggle(setPrivPrefs,k)}/></div>))}<div style={{marginTop:12}}><button style={{background:"#FF2D2D15",border:"1px solid #FF2D2D30",borderRadius:10,padding:"8px 14px",color:"#FF6060",cursor:"pointer",fontSize:12,fontWeight:700}}>Block / Muted Users</button></div></div>}
            {sec.id==="payments"&&<div><div style={{fontSize:13,color:C.muted,marginBottom:12}}>Connected payment methods:</div>{[["Paystack","GHS, KES"],["Stripe","USD, GBP, EUR, CAD"]].map(([name,currencies])=>(<div key={name} className="settingsInner" style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px",borderRadius:10,marginBottom:8}}><div><div style={{fontWeight:700,fontSize:13}}>{name}</div><div style={{fontSize:11,color:C.muted}}>{currencies}</div></div><div style={{display:"flex",alignItems:"center",gap:4}}><Ico n="check" s={13} c={C.emerald} sw={3}/><span style={{fontSize:11,color:C.emerald,fontWeight:700}}>Connected</span></div></div>))}{isStreamer&&<div style={{marginTop:14}}><div style={{fontSize:12,color:C.muted,marginBottom:8}}>Payout account:</div><input className="inp" placeholder="Mobile Money / Bank account number" style={{fontSize:13}}/><button className="btn btnC" style={{padding:"9px 18px",fontSize:13,marginTop:10}}>Save Payout Account</button></div>}</div>}
            {sec.id==="security"&&<div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",marginBottom:12,borderBottom:`1px solid ${C.border}`}}><div><div style={{fontWeight:700,fontSize:13}}>Two-Factor Authentication</div><div style={{fontSize:11,color:C.muted}}>Extra security for your account</div></div><Toggle on={twoFA} onChange={()=>setTwoFA(v=>!v)}/></div><div style={{marginBottom:10}}><div style={{fontSize:13,fontWeight:700,marginBottom:6}}>Connected email</div><div className="settingsInner" style={{fontSize:13,borderRadius:10,padding:"9px 14px"}}>{user?.email||"Not logged in"}</div></div><button style={{background:"#FF2D2D15",border:"1px solid #FF2D2D30",borderRadius:10,padding:"8px 14px",color:"#FF6060",cursor:"pointer",fontSize:12,fontWeight:700,width:"100%",marginTop:8}}>Change Password</button><button style={{background:"#FF2D2D08",border:"1px solid #FF2D2D20",borderRadius:10,padding:"8px 14px",color:"#FF6060",cursor:"pointer",fontSize:12,marginTop:8,width:"100%"}}>Delete Account</button></div>}
            {sec.id==="help"&&<div>{[["How do gifts work?","Viewers send gifts during streams. You keep 90%, platform takes 10%."],["How do I withdraw?","Withdrawals processed within 24 hours to your payout account."],["Why was my stream removed?","Streams violating community guidelines are removed."],["How do I become verified?","Complete identity verification and pay the one-time setup fee."]].map(([q,a])=>(<div key={q} className="settingsInner" style={{marginBottom:12,padding:"12px",borderRadius:10}}><div style={{fontWeight:700,fontSize:13,marginBottom:6}}>{q}</div><div style={{fontSize:12,color:C.muted,lineHeight:1.6}}>{a}</div></div>))}<a href="mailto:1innovativestudio@gmail.com" style={{textDecoration:"none"}}><button className="btn btnC" style={{padding:"10px 20px",fontSize:13,marginTop:4}}>Contact Support</button></a><div style={{fontSize:11,color:C.muted,marginTop:8}}>Email: <span style={{color:C.cyan}}>1innovativestudio@gmail.com</span></div></div>}
            {sec.id==="terms"&&<TermsSection/>}
          </div>}
        </div>
      ))}
      <div style={{marginTop:8}}>
        {user?<div className="card" style={{padding:"14px 16px",cursor:"pointer",borderColor:"#FF2D2D20"}} onClick={onSignOut}><div style={{display:"flex",alignItems:"center",gap:12}}><div style={{width:36,height:36,borderRadius:10,background:"#FF2D2D15",display:"flex",alignItems:"center",justifyContent:"center"}}><Ico n="logout" s={18} c="#FF6060"/></div><span style={{fontSize:14,fontWeight:700,color:"#FF6060"}}>Log Out</span></div></div>
        :<div className="card" style={{padding:"14px 16px",cursor:"pointer"}} onClick={onSignIn}><div style={{display:"flex",alignItems:"center",gap:12}}><div style={{width:36,height:36,borderRadius:10,background:`${C.cyan}15`,display:"flex",alignItems:"center",justifyContent:"center"}}><Ico n="profile" s={18} c={C.cyan}/></div><span style={{fontSize:14,fontWeight:700,color:C.cyan}}>Sign In / Sign Up</span></div></div>}
      </div>
    </div>
  );
};

/* ═══════════════════ AUTH MODAL ═══════════════════ */
const AuthModal=({onClose,onLogin})=>(
  <div className="mOverlay" onClick={onClose}>
    <div className="mBox" onClick={e=>e.stopPropagation()}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <Logo/>
        <button onClick={onClose} style={{background:C.card2,border:`1px solid ${C.border}`,borderRadius:"50%",width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}><Ico n="close" s={14} c={C.muted}/></button>
      </div>
      <Auth onLogin={onLogin}/>
    </div>
  </div>
);

/* ═══════════════════ STREAMER PUBLIC PROFILE ═══════════════════ */
const StreamerProfile=({streamer,fmt,onBack,onStream,user,onAuthRequired,cur})=>{
  const [subscribed,setSubscribed]=useState(false);
  const [following,setFollowing]=useState(false);
  const [showSub,setShowSub]=useState(false);
  const [tab,setTab]=useState("streams");
  const [streamerStreams,setStreamerStreams]=useState([]);
  const [followerCount,setFollowerCount]=useState(0);
  const streamerId=streamer.streamer_id||streamer.id;

  useEffect(()=>{
    if(!streamerId)return;
    // Load real streams for this streamer
    supabase.from("streams").select("*")
      .eq("streamer_id",streamerId).order("started_at",{ascending:false}).limit(10)
      .then(({data})=>{if(data)setStreamerStreams(data.map(s=>mapStreamRow(s)));});
    // Follower count
    supabase.from("follows").select("id",{count:"exact"}).eq("following_id",streamerId)
      .then(({count})=>{if(count!=null)setFollowerCount(count);});
  },[streamerId]);

  useEffect(()=>{
    if(!user||!streamerId)return;
    supabase.from("follows").select("id").eq("follower_id",user.id).eq("following_id",streamerId).single()
      .then(({data})=>{if(data)setFollowing(true);});
    supabase.from("subscriptions").select("id").eq("subscriber_id",user.id).eq("streamer_id",streamerId).eq("status","active").single()
      .then(({data})=>{if(data)setSubscribed(true);});
  },[user,streamerId]);

  const toggleFollow=async()=>{
    if(!user){onAuthRequired();return;}
    if(following){
      await supabase.from("follows").delete().eq("follower_id",user.id).eq("following_id",streamerId);
      setFollowing(false);setFollowerCount(c=>Math.max(0,c-1));
    } else {
      await supabase.from("follows").insert({follower_id:user.id,following_id:streamerId});
      setFollowing(true);setFollowerCount(c=>c+1);
    }
  };

  return(
    <div style={{paddingBottom:60}} className="page">
      {showSub&&<SubModal stream={{...streamer,id:streamerId}} fmt={fmt} onClose={()=>setShowSub(false)} onSubscribed={()=>{setSubscribed(true);setShowSub(false);}} user={user} currency={cur?.code||"USD"}/>}
      <div style={{height:180,background:`linear-gradient(135deg,${streamer.col}30,${streamer.bg||"#0D0A20"})`,position:"relative"}}>
        <button onClick={onBack} style={{position:"absolute",top:14,left:14,background:"rgba(0,0,0,.5)",border:"none",borderRadius:10,padding:"8px",cursor:"pointer",display:"flex",backdropFilter:"blur(6px)"}}><Ico n="back" s={18} c="#fff"/></button>
        <div style={{position:"absolute",bottom:-40,left:24}}>
          <div className="avRing">
            {streamer.avatar_url?<img src={streamer.avatar_url} style={{width:80,height:80,borderRadius:"50%",objectFit:"cover"}} alt=""/>:<Av ch={streamer.av} sz={80} g={`linear-gradient(135deg,${streamer.col},${C.purple})`}/>}
          </div>
        </div>
      </div>
      <div style={{padding:"52px 24px 0",maxWidth:700}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12,marginBottom:20}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div className="exo" style={{fontSize:22,fontWeight:900}}>{streamer.streamer}</div>
              {streamer.verified&&<div style={{background:`${C.cyan}20`,borderRadius:6,padding:"2px 8px",fontSize:11,color:C.cyan,fontWeight:800}}>✓ VERIFIED</div>}
            </div>
            <div style={{fontSize:13,color:C.muted,marginTop:4}}>{streamer.cat} Creator</div>
            <div style={{display:"flex",gap:20,marginTop:12}}>
              {[[(((streamer.viewers||0)/1000).toFixed(1)+"K"),"Viewers"],[followerCount.toLocaleString(),"Followers"],[streamerStreams.length.toString(),"Streams"]].map(([v,l])=>(<div key={l}><div className="exo" style={{fontWeight:900,fontSize:16}}>{v}</div><div style={{fontSize:11,color:C.muted}}>{l}</div></div>))}
            </div>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {streamer.live&&<button className="btn btnR" style={{padding:"10px 18px",fontSize:13,display:"flex",alignItems:"center",gap:6}} onClick={()=>onStream(streamer)}><div className="liveDot" style={{width:6,height:6}}/>Watch Live</button>}
            <button className={`btn ${following?"btnS":"btnC"}`} style={{padding:"10px 18px",fontSize:13}} onClick={toggleFollow}>
              {following?<span style={{display:"flex",alignItems:"center",gap:5}}><Ico n="check" s={13} c={C.text} sw={3}/>Following</span>:"Follow"}
            </button>
            <button className={`btn ${subscribed?"btnS":"btnP"}`} style={{padding:"10px 18px",fontSize:13}} onClick={()=>{if(!user){onAuthRequired();return;}if(subscribed)return;setShowSub(true);}}>
              {subscribed?<span style={{display:"flex",alignItems:"center",gap:5}}><Ico n="check" s={13} c="#06060F" sw={3}/>Subscribed</span>:"Subscribe"}
            </button>
          </div>
        </div>
        <div style={{display:"flex",gap:4,marginBottom:20,background:C.card2,borderRadius:12,padding:4,maxWidth:360}}>
          {["streams","about"].map(t=>(<button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:"8px",borderRadius:9,border:"none",background:tab===t?C.card:"transparent",color:tab===t?C.cyan:C.muted,fontWeight:700,fontSize:13,cursor:"pointer",textTransform:"capitalize"}}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>))}
        </div>
        {tab==="streams"&&<div>
          {streamerStreams.length===0&&<div style={{textAlign:"center",padding:"40px 0",color:C.muted}}><div className="icoFloat" style={{display:"flex",justifyContent:"center",marginBottom:10}}><Ico n="mic" s={40} c={C.muted}/></div><div style={{fontWeight:700}}>No streams yet</div></div>}
          {streamerStreams.map((s,i)=>(
            <div key={i} className="card" style={{padding:"13px",marginBottom:10,display:"flex",gap:12,alignItems:"center",cursor:"pointer"}} onClick={()=>onStream(s)}>
              <div style={{width:70,height:48,borderRadius:10,background:`linear-gradient(135deg,${s.col}33,#000)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,overflow:"hidden"}}>
                {s.thumbnail?<img src={s.thumbnail} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:s.live?<div className="liveDot"/>:<Ico n="play" s={18} c={C.muted}/>}
              </div>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.title}</div><div style={{fontSize:11,color:C.muted,marginTop:3}}>{(s.viewers||0).toLocaleString()} viewers · {s.cat}</div></div>
              {s.live&&<div className="liveBadge" style={{flexShrink:0}}><div className="liveDot"/>LIVE</div>}
            </div>
          ))}
        </div>}
        {tab==="about"&&<div>
          <div className="card" style={{padding:"18px",marginBottom:14}}>
            <div className="exo" style={{fontWeight:800,marginBottom:10}}>Subscription Plans</div>
            {[["Weekly",streamer.sp?.w||2.99],["Monthly",streamer.sp?.m||9.99],["Annual",streamer.sp?.a||89.99]].map(([label,price])=>(
              <div key={label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
                <div><div style={{fontWeight:700}}>{label}</div><div style={{fontSize:11,color:C.muted}}>Access all premium content</div></div>
                <div style={{textAlign:"right"}}>
                  <div className="exo" style={{color:C.gold,fontWeight:900}}>{fmt(price)}</div>
                  <button className="btn btnP" style={{padding:"5px 12px",fontSize:11,marginTop:4}} onClick={()=>{if(!user){onAuthRequired();return;}setShowSub(true);}}>Subscribe</button>
                </div>
              </div>
            ))}
          </div>
        </div>}
      </div>
    </div>
  );
};

/* ═══════════════════ ROOT APP ═══════════════════ */
export default function App(){
  const {fmt,cur,curKey,setCurKey,allCurrencies}=useCurrency();
  const [darkMode,setDarkMode]=useState(true);
  const [showMenu,setShowMenu]=useState(false);
  const [tab,setTab]=useState("home");
  const [showNotifs,setShowNotifs]=useState(false);
  const [showCurrencyPicker,setShowCurrencyPicker]=useState(false);
  const [viewingProfile,setViewingProfile]=useState(null);
  const [notifications,setNotifications]=useState([]);
  const [viewing,setViewing]=useState(null);
  const [isStreamer,setIsStreamer]=useState(()=>localStorage.getItem("gift3rs_is_streamer")==="true");
  const [showBecome,setShowBecome]=useState(false);
  const [user,setUser]=useState(null);
  const [showAuth,setShowAuth]=useState(false);
  const [search,setSearch]=useState("");
  const [streamLinkLoading,setStreamLinkLoading]=useState(false);
  const [streamNotFound,setStreamNotFound]=useState(false);
  const [topAvatar,setTopAvatar]=useState("");
  const fetchAvatar=useCallback(async(u)=>{if(!u)return;const {data}=await supabase.from("profiles").select("avatar_url,is_streamer,fee_paid").eq("id",u.id).single();if(data?.avatar_url)setTopAvatar(data.avatar_url);if(data?.is_streamer||data?.fee_paid){setIsStreamer(true);localStorage.setItem("gift3rs_is_streamer","true");}},[]);
  useEffect(()=>{document.body.classList.toggle("light",!darkMode);document.body.style.background=darkMode?"#06060F":"#F0F2FF";document.body.style.color=darkMode?"#EEEEFF":"#1A1A3E";},[darkMode]);
  useEffect(()=>{const handler=(e)=>{if(!e.target.closest("[data-dropdown]")){setShowNotifs(false);setShowCurrencyPicker(false);setShowMenu(false);}};document.addEventListener("mousedown",handler);return()=>document.removeEventListener("mousedown",handler);},[]);
  useEffect(()=>{if(!user)return;const ch=supabase.channel("notifs").on("postgres_changes",{event:"INSERT",schema:"public",table:"gifts",filter:`receiver_id=eq.${user.id}`},(p)=>{playNotifSound("gift");setNotifications(n=>[{id:Date.now(),type:"gift",msg:`Someone sent you a ${p.new.emoji} gift!`,time:"just now",read:false,icon:"gift"},...n.slice(0,19)]);}).on("postgres_changes",{event:"INSERT",schema:"public",table:"subscriptions",filter:`streamer_id=eq.${user.id}`},()=>{playNotifSound("sub");setNotifications(n=>[{id:Date.now(),type:"sub",msg:"Someone subscribed to your channel!",time:"just now",read:false,icon:"users"},...n.slice(0,19)]);}).subscribe();return()=>supabase.removeChannel(ch);},[user]);
  useEffect(()=>{supabase.auth.getSession().then(({data:{session}})=>{setUser(session?.user??null);fetchAvatar(session?.user);});const {data:{subscription}}=supabase.auth.onAuthStateChange((_,session)=>{setUser(session?.user??null);if(session?.user){setShowAuth(false);fetchAvatar(session.user);}});return()=>subscription.unsubscribe();},[fetchAvatar]);

  // Clean up ghost streams: any stream marked is_live=true but started > 12 hours ago
  // is almost certainly a browser-close orphan and should be cleared from the feed
  useEffect(()=>{
    const cutoff=new Date(Date.now()-12*60*60*1000).toISOString();
    supabase.from("streams").update({is_live:false,ended_at:new Date().toISOString()})
      .eq("is_live",true).lt("started_at",cutoff).catch(()=>{});
  },[]);

  // Open stream from share link (?stream=UUID&ch=channel&sn=name&st=title)
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const streamId=params.get("stream");
    if(!streamId)return;
    setStreamLinkLoading(true);
    const tryFallback=()=>{
      // Use URL params directly — works even if Supabase RLS blocks the read
      const ch=params.get("ch");
      if(ch){
        const fallback=mapStreamRow({
          id:streamId,
          channel_name:decodeURIComponent(ch),
          title:params.get("st")?decodeURIComponent(params.get("st")):"Live Stream",
          streamer_name:params.get("sn")?decodeURIComponent(params.get("sn")):"Streamer",
          is_live:true,viewer_count:0,gift_total:0,category:"General",
          sub_price_weekly:1.99,sub_price_monthly:5.99,sub_price_annually:49.99,
        });
        setViewing(fallback);
      } else {
        setStreamNotFound(true);
      }
      setStreamLinkLoading(false);
    };
    supabase.from("streams")
      .select("*")
      .eq("id",streamId).single()
      .then(({data,error})=>{
        if(data&&!error){
          supabase.from("profiles").select("display_name,username,avatar_url").eq("id",data.streamer_id).single()
            .then(({data:profile})=>{
              setViewing(mapStreamRow(data,profile?{[data.streamer_id]:profile}:{}));
              setStreamLinkLoading(false);
            });
        } else {
          // DB read failed (RLS or stream not in DB) — fall back to URL params
          console.warn("[ShareLink] Supabase query failed:",error?.message||"no data");
          tryFallback();
        }
      })
      .catch(()=>tryFallback());
  },[]);
  const mobileTabs=[{id:"home",icon:"home",label:"HOME"},{id:"search",icon:"search",label:"SEARCH"},{id:"live",icon:"mic",label:"LIVE",special:true},{id:"dash",icon:"trending",label:"EARN"},{id:"prof",icon:"profile",label:"PROFILE"}];
  // Show spinner while resolving a ?stream= link
  if(streamLinkLoading)return(<><GS/><div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:18}}><div style={{width:52,height:52,borderRadius:"50%",border:`3px solid ${C.border}`,borderTopColor:C.cyan,animation:"spin .9s linear infinite"}}/><div style={{fontWeight:800,fontSize:16,color:"#fff"}}>Loading stream…</div><div className="connectingPulse" style={{fontSize:13,color:C.muted}}>Fetching stream details</div></div></>);
  // Stream not found fallback
  if(streamNotFound)return(<><GS/><div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,padding:"0 20px",textAlign:"center"}}><div className="scaleIn" style={{display:"flex"}}><Ico n="info" s={56} c={C.muted}/></div><div style={{fontWeight:900,fontSize:22,color:"#fff"}}>Stream not found</div><div style={{fontSize:14,color:C.muted,maxWidth:320}}>This stream may have ended or the link is invalid. Check with the streamer for a new link.</div><button className="btn btnC" style={{padding:"12px 28px",fontSize:15,marginTop:8}} onClick={()=>{window.history.replaceState({},"","/");setStreamNotFound(false);}}>Back to Home</button></div></>);
  if(viewingProfile&&!viewing)return(<><GS/>{showAuth&&<AuthModal onClose={()=>setShowAuth(false)} onLogin={setUser}/>}<StreamerProfile streamer={viewingProfile} fmt={fmt} onBack={()=>setViewingProfile(null)} onStream={s=>{setViewingProfile(null);setViewing(s);}} user={user} onAuthRequired={()=>setShowAuth(true)} cur={cur}/></>);
  if(viewing)return(<><GS/>{showAuth&&<AuthModal onClose={()=>setShowAuth(false)} onLogin={setUser}/>}<LiveViewer stream={viewing} fmt={fmt} onBack={()=>{setViewing(null);window.history.replaceState({},"","/");}} user={user} onAuthRequired={()=>setShowAuth(true)} cur={cur} onViewProfile={s=>{setViewing(null);setViewingProfile(s);}}/></>);
  if(showBecome)return(<><GS/><div style={{minHeight:"100vh"}}><div className="topBar"><Logo/></div><div style={{paddingTop:60}}><BecomeStreamer fmt={fmt} onBack={()=>setShowBecome(false)} user={user} currency={cur?.code||"USD"} onComplete={()=>{setIsStreamer(true);setShowBecome(false);setTab("live");localStorage.setItem("gift3rs_is_streamer","true");}}/></div></div></>);
  return(
    <><GS/>{showAuth&&<AuthModal onClose={()=>setShowAuth(false)} onLogin={setUser}/>}
    <div style={{background:darkMode?"#06060F":"#F7F8FF",color:darkMode?"#EEEEFF":"#0F0F2E",minHeight:"100vh"}}>
      <header className="topBar">
        <div style={{position:"relative",display:"none"}} className="desktopMenu" data-dropdown>
          <button data-dropdown onClick={()=>setShowMenu(v=>!v)} style={{background:showMenu?(darkMode?`${C.cyan}18`:"#E8F4FF"):"transparent",border:`1.5px solid ${showMenu?C.cyan:"transparent"}`,borderRadius:10,width:38,height:38,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:5,cursor:"pointer",flexShrink:0,transition:"all .2s",padding:0}}>
            <div style={{width:18,height:2,borderRadius:2,background:showMenu?C.cyan:(darkMode?"#EEEEFF":"#0F0F2E"),transition:"all .3s",transform:showMenu?"rotate(45deg) translateY(7px)":"none"}}/>
            <div style={{width:18,height:2,borderRadius:2,background:showMenu?C.cyan:(darkMode?"#EEEEFF":"#0F0F2E"),transition:"all .3s",opacity:showMenu?0:1}}/>
            <div style={{width:18,height:2,borderRadius:2,background:showMenu?C.cyan:(darkMode?"#EEEEFF":"#0F0F2E"),transition:"all .3s",transform:showMenu?"rotate(-45deg) translateY(-7px)":"none"}}/>
          </button>
          {showMenu&&<div data-dropdown style={{position:"fixed",top:64,left:8,background:darkMode?"#0B0B1C":"#fff",border:`1px solid ${darkMode?"#1E1E3A":"#E4E7F5"}`,borderRadius:18,padding:"10px 8px",zIndex:700,width:240,boxShadow:"0 12px 48px rgba(0,0,0,.4)",animation:"menuSlideIn .2s cubic-bezier(.17,.67,.3,1.2) both"}}>
            {[{id:"home",icon:"home",label:"Home",sub:"Discover live streams"},{id:"search",icon:"search",label:"Discover",sub:"Browse categories"},{id:"live",icon:"mic",label:"Studio",sub:"Go live & manage streams"},{id:"dash",icon:"barchart",label:"Earnings",sub:"Revenue & analytics"},{id:"prof",icon:"profile",label:"Profile",sub:"Account & settings"}].map(l=>(
              <button key={l.id} onClick={()=>{setTab(l.id);setShowMenu(false);}} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"10px 12px",borderRadius:12,border:"none",cursor:"pointer",textAlign:"left",marginBottom:2,background:tab===l.id?(darkMode?`${C.cyan}15`:"#E8F8FF"):"transparent",transition:"background .15s"}}>
                <div style={{width:36,height:36,borderRadius:10,background:tab===l.id?`${C.cyan}20`:(darkMode?"#14142E":"#F0F2FC"),display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Ico n={l.icon} s={18} c={tab===l.id?C.cyan:(darkMode?"#6868A8":"#8888BB")}/></div>
                <div><div style={{fontSize:13,fontWeight:700,color:tab===l.id?C.cyan:(darkMode?"#EEEEFF":"#0F0F2E")}}>{l.label}</div><div style={{fontSize:11,color:darkMode?"#6868A8":"#9898BB",marginTop:1}}>{l.sub}</div></div>
                {tab===l.id&&<div style={{marginLeft:"auto"}}><Ico n="check" s={13} c={C.cyan} sw={3}/></div>}
              </button>
            ))}
            <div style={{height:1,background:darkMode?"#1E1E3A":"#E4E7F5",margin:"8px 4px"}}/>
            <div style={{fontSize:10,fontWeight:800,color:"#6868A8",padding:"4px 12px 6px",fontFamily:"Exo 2",letterSpacing:1}}>CATEGORIES</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,padding:"0 8px 8px"}}>
              {["Music","Gaming","Tech","Food","Finance","Fitness","Art","Sports","Comedy","Fashion"].map(c=>(<button key={c} onClick={()=>{setTab("search");setShowMenu(false);}} style={{padding:"4px 10px",borderRadius:20,border:`1px solid ${darkMode?"#1E1E3A":"#DDE2FF"}`,background:darkMode?"#14142E":"#F0F2FC",color:darkMode?"#6868A8":"#7070A0",fontSize:11,fontWeight:700,cursor:"pointer"}}>{c}</button>))}
            </div>
          </div>}
        </div>
        <Logo/>
        <div className="searchBar"><span className="ico"><Ico n="search" s={16} c={C.muted}/></span><input placeholder="Search streamers, categories..." value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&search)setTab("search");}}/></div>
        <div style={{display:"flex",gap:10,alignItems:"center",marginLeft:"auto",flexShrink:0}}>
          <div style={{position:"relative"}}>
            <button data-dropdown onClick={()=>setShowCurrencyPicker(v=>!v)} style={{background:darkMode?"#101026":"#E8EBFF",border:`1px solid ${darkMode?"#1E1E3A":"#C5CCEE"}`,borderRadius:11,height:36,padding:"0 12px",display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:13,fontWeight:700,color:darkMode?"#EEEEFF":"#1A1A3E",whiteSpace:"nowrap"}}><Ico n="globe" s={14} c={darkMode?"#6868A8":"#8888BB"}/>{cur.flag} {cur.code}</button>
            {showCurrencyPicker&&<div data-dropdown style={{position:"absolute",top:44,right:0,background:darkMode?"#0B0B1C":"#fff",border:`1px solid ${darkMode?"#28285A":"#DDE2FF"}`,borderRadius:14,padding:8,zIndex:600,minWidth:220,boxShadow:"0 8px 32px rgba(0,0,0,.3)"}}>
              <div style={{fontSize:10,fontWeight:800,color:"#6868A8",padding:"4px 8px 8px",fontFamily:"Exo 2",letterSpacing:1}}>SELECT CURRENCY</div>
              {Object.entries(allCurrencies).map(([k,c])=>(<button key={k} onClick={()=>{setCurKey(k);setShowCurrencyPicker(false);}} style={{width:"100%",background:curKey===k?`${C.cyan}18`:"transparent",border:"none",borderRadius:10,padding:"9px 12px",display:"flex",alignItems:"center",gap:10,cursor:"pointer",marginBottom:2}}><span style={{fontSize:18}}>{c.flag}</span><div style={{textAlign:"left"}}><div style={{fontSize:13,fontWeight:700,color:curKey===k?C.cyan:(darkMode?"#EEEEFF":"#1A1A3E")}}>{c.name}</div><div style={{fontSize:11,color:"#6868A8"}}>{c.sym} · {c.code}</div></div>{curKey===k&&<div style={{marginLeft:"auto"}}><Ico n="check" s={14} c={C.cyan} sw={3}/></div>}</button>))}
            </div>}
          </div>
          <button onClick={()=>setDarkMode(d=>!d)} style={{background:darkMode?C.card:"#E8F4FF",border:`1px solid ${darkMode?C.border:"#CBD5E0"}`,borderRadius:11,width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,transition:"all .3s"}}><div style={{transition:"transform .4s",transform:darkMode?"rotate(0deg)":"rotate(180deg)"}}><Ico n={darkMode?"sun":"moon"} s={16} c={darkMode?C.gold:"#4A5568"}/></div></button>
          <div style={{position:"relative"}}>
            <button data-dropdown onClick={()=>setShowNotifs(v=>!v)} style={{background:darkMode?C.card:"#E8EBFF",border:`1px solid ${darkMode?C.border:"#DDE2FF"}`,borderRadius:11,width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",position:"relative",flexShrink:0}}>
              <Ico n="bell" s={16} c={C.muted}/>{notifications.some(n=>!n.read)&&<div style={{position:"absolute",top:6,right:6,width:8,height:8,background:C.amber,borderRadius:"50%",border:`2px solid ${darkMode?C.bg:"#F0F2FF"}`}} className="icoPulse"/>}
            </button>
            {showNotifs&&<div data-dropdown style={{position:"absolute",top:44,right:0,background:darkMode?"#0B0B1C":"#fff",border:`1px solid ${darkMode?"#28285A":"#DDE2FF"}`,borderRadius:16,padding:8,zIndex:600,width:320,boxShadow:"0 8px 32px rgba(0,0,0,.35)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px 12px"}}><div style={{fontSize:15,fontWeight:800,color:darkMode?"#EEEEFF":"#1A1A3E"}}>Notifications</div><button onClick={()=>setNotifications(n=>n.map(x=>({...x,read:true})))} style={{background:"none",border:"none",cursor:"pointer",fontSize:11,color:C.cyan,fontWeight:700}}>Mark all read</button></div>
              {notifications.slice(0,8).map(n=>(<div key={n.id} onClick={()=>setNotifications(ns=>ns.map(x=>x.id===n.id?{...x,read:true}:x))} style={{display:"flex",gap:12,padding:"10px 12px",borderRadius:12,marginBottom:2,background:!n.read?(darkMode?`${C.cyan}0A`:"#EEF2FF"):"transparent",cursor:"pointer"}}><div style={{width:36,height:36,borderRadius:12,background:n.type==="gift"?`${C.gold}20`:n.type==="sub"?`${C.purple}20`:`${C.cyan}20`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Ico n={n.icon} s={16} c={n.type==="gift"?C.gold:n.type==="sub"?C.purple:C.cyan}/></div><div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:n.read?400:700,color:darkMode?"#EEEEFF":"#1A1A3E",lineHeight:1.4}}>{n.msg}</div><div style={{fontSize:11,color:"#6868A8",marginTop:3}}>{n.time}</div></div>{!n.read&&<div style={{width:8,height:8,borderRadius:"50%",background:C.cyan,flexShrink:0,marginTop:4}}/>}</div>))}
            </div>}
          </div>
          {user?(<div onClick={()=>setTab("prof")} style={{cursor:"pointer"}}>{topAvatar?<img src={topAvatar} style={{width:34,height:34,borderRadius:"50%",objectFit:"cover",border:`2px solid ${C.cyan}`}}/>:<Av ch={(user.email||"U")[0].toUpperCase()} sz={34} g={`linear-gradient(135deg,${C.cyan},${C.purple})`}/>}</div>):(<button className="btn btnC" style={{padding:"8px 16px",fontSize:13,whiteSpace:"nowrap"}} onClick={()=>setShowAuth(true)}>Sign In</button>)}
        </div>
      </header>
      <div style={{paddingTop:60,paddingBottom:88}}>
        {tab==="home"&&<HomeFeed fmt={fmt} onStream={s=>setViewing(s)} onViewProfile={s=>setViewingProfile(s)}/>}
        {tab==="search"&&<SearchPage onStream={s=>setViewing(s)} initialSearch={search}/>}
        {tab==="live"&&<GoLivePage fmt={fmt} isStreamer={isStreamer} onBecomeStreamer={()=>setShowBecome(true)} user={user} darkMode={darkMode}/>}
        {tab==="dash"&&<DashPage fmt={fmt} darkMode={darkMode} user={user} isStreamer={isStreamer} onSignIn={()=>setShowAuth(true)}/>}
        {tab==="prof"&&<ProfilePage fmt={fmt} isStreamer={isStreamer} user={user} onSignIn={()=>setShowAuth(true)} onSignOut={()=>supabase.auth.signOut()} onAvatarSaved={url=>setTopAvatar(url)}/>}
      </div>
      <nav className="mobileNav">
        {mobileTabs.map(t=>(<button key={t.id} className={`mnBtn ${tab===t.id?"on":""}`} onClick={()=>setTab(t.id)}>
          {t.special?(<div className="glowR" style={{width:46,height:46,borderRadius:15,background:"linear-gradient(135deg,#FF2D2D,#FF6060)",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:2,marginTop:-14,boxShadow:"0 4px 20px #FF2D2D77"}}><Ico n="mic" s={21} c="#fff"/></div>):(<Ico n={t.icon} s={21} c={tab===t.id?C.cyan:C.muted}/>)}
          <span style={{color:t.special?"#FF2D2D":tab===t.id?C.cyan:C.muted,fontWeight:t.special?900:800}}>{t.label}</span>
        </button>))}
      </nav>
    </div></>
  );
}