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

/* ═══════════════════ MOCK DATA ═══════════════════ */
const STREAMS=[
  {id:1,streamer:"KofiBeats",av:"K",title:"Afrobeats Night 🎵 Non-stop vibes!",viewers:14200,gifts:4820,cat:"Music",bg:"#0D0A20",col:C.purple,verified:true,live:true,sp:{w:2.99,m:9.99,a:89.99}},
  {id:2,streamer:"TechWithAma",av:"A",title:"Building a Full-Stack App LIVE 💻",viewers:8900,gifts:2100,cat:"Tech",bg:"#051525",col:C.cyan,verified:true,live:true,sp:{w:1.99,m:6.99,a:59.99}},
  {id:3,streamer:"FoodieNana",av:"N",title:"Cooking Jollof Rice from Scratch 🍛",viewers:22400,gifts:9100,cat:"Food",bg:"#1A0800",col:C.amber,verified:false,live:true,sp:{w:0.99,m:3.99,a:34.99}},
  {id:4,streamer:"GamingKwame",av:"G",title:"FIFA 2026 Tournament — FINALS 🏆",viewers:31000,gifts:12400,cat:"Gaming",bg:"#051A05",col:C.emerald,verified:true,live:true,sp:{w:2.49,m:7.99,a:69.99}},
  {id:5,streamer:"FitnessAbena",av:"F",title:"Full Body HIIT — Join Me! 🏋️",viewers:5600,gifts:990,cat:"Fitness",bg:"#1A0B00",col:C.gold,verified:false,live:false,sp:{w:1.49,m:4.99,a:44.99}},
  {id:6,streamer:"FinanceGuru",av:"G",title:"How to Invest GH₵500 in 2026 📈",viewers:18700,gifts:7800,cat:"Finance",bg:"#001A10",col:C.emerald,verified:true,live:true,sp:{w:3.99,m:12.99,a:109.99}},
  {id:7,streamer:"ComedyKojo",av:"C",title:"Stand-Up Special LIVE 😂 Don't miss it!",viewers:9300,gifts:3100,cat:"Comedy",bg:"#15050A",col:C.pink,verified:true,live:true,sp:{w:1.99,m:5.99,a:49.99}},
  {id:8,streamer:"ArtByAkosua",av:"A",title:"Speed-painting a portrait LIVE 🎨",viewers:4100,gifts:1200,cat:"Art",bg:"#10051A",col:C.purple,verified:false,live:true,sp:{w:0.99,m:2.99,a:24.99}},
  {id:9,streamer:"TravelYaw",av:"T",title:"Exploring Kumasi Streets 🌍 Live Tour",viewers:7200,gifts:2800,cat:"Travel",bg:"#0A1520",col:C.sky,verified:true,live:true,sp:{w:1.49,m:4.99,a:39.99}},
  {id:10,streamer:"MusicByEsi",av:"E",title:"Original Song Writing Session 🎹",viewers:3800,gifts:1500,cat:"Music",bg:"#200A15",col:C.pink,verified:false,live:false,sp:{w:0.99,m:3.49,a:29.99}},
  {id:11,streamer:"SportsTv",av:"S",title:"Champions League Watch Party ⚽ LIVE",viewers:42000,gifts:18000,cat:"Sports",bg:"#051A0A",col:C.emerald,verified:true,live:true,sp:{w:2.99,m:8.99,a:79.99}},
  {id:12,streamer:"BeautyByAdwoa",av:"B",title:"Full Glam Makeup Tutorial ✨ LIVE",viewers:6100,gifts:2200,cat:"Fashion",bg:"#1A0510",col:C.pink,verified:false,live:true,sp:{w:1.99,m:5.99,a:49.99}},
];
const CATS=["All","Music","Gaming","Tech","Food","Finance","Fitness","Art","Education","Comedy","Fashion","Travel","Sports","Lifestyle","News","Spirituality"];
const GIFTS_LIST=[
  {emoji:"star",name:"Star",usd:0.5},{emoji:"zap",name:"Fire",usd:1},
  {emoji:"diamond",name:"Diamond",usd:5},{emoji:"rocket",name:"Rocket",usd:10},
  {emoji:"crown",name:"Crown",usd:25},{emoji:"coins",name:"Bag",usd:50},
  {emoji:"trophy",name:"Trophy",usd:100},{emoji:"edit",name:"Amount",usd:0},
];
const CHAT_POOL=[
  {u:"Kwame_B",t:"This is incredible!! 🔥🔥",c:C.cyan,gift:null},
  {u:"Ama_G",t:"First time here, AMAZING!",c:C.emerald,gift:null},
  {u:"Nana_K",t:"sent a Diamond",c:C.gold,gift:"diamond"},
  {u:"Kofi_A",t:"Been watching for 2 hours lol",c:C.pink,gift:null},
  {u:"Abena_T",t:"sent a Crown",c:C.gold,gift:"crown"},
  {u:"Yaw_M",t:"Goat behaviour 🐐 respecttt",c:C.amber,gift:null},
  {u:"Adwoa_P",t:"sent a Rocket",c:C.gold,gift:"rocket"},
  {u:"Kojo_R",t:"LETS GOOOOO 🎉🎉🎉",c:C.purple,gift:null},
  {u:"Efua_S",t:"My fav streamer no cap",c:C.sky,gift:null},
  {u:"Mensah_D",t:"sent a Star",c:C.gold,gift:"star"},
];

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
@keyframes giftFly{0%{transform:translateY(0) scale(1);opacity:1}60%{transform:translateY(-100px) scale(1.2) rotate(15deg);opacity:.8}100%{transform:translateY(-160px) scale(.3) rotate(-10deg);opacity:0}}
.gFly{animation:giftFly 1s cubic-bezier(.17,.67,.3,1.1) forwards;pointer-events:none;position:fixed;font-size:28px;z-index:600;}
@keyframes wave{0%,100%{height:3px;opacity:.5}50%{height:18px;opacity:1}}
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
  <div className="liveBadge"><div className="liveDot"/>LIVE{viewers&&<span style={{color:"rgba(255,255,255,.6)",fontWeight:400}}>&middot; {(viewers/1000).toFixed(1)}K</span>}</div>
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
      <div style={{fontSize:42,filter:"drop-shadow(0 0 12px gold) drop-shadow(0 0 24px rgba(255,200,0,.6))"}}>{GIFT_EMOJIS[g.emoji]||"🎁"}</div>
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
  const [chat,setChat]=useState(CHAT_POOL.slice(0,5));
  const [msg,setMsg]=useState("");
  const [liked,setLiked]=useState(()=>{try{const savedLikes=JSON.parse(localStorage.getItem("gift3rs_likes")||"{}");return !!savedLikes[stream.id];}catch(_e){return false;}});
  const [likes,setLikes]=useState(stream.viewers);
  const [showGift,setShowGift]=useState(false);
  const [showSub,setShowSub]=useState(false);
  const [subscribed,setSubscribed]=useState(false);
  const [floats,setFloats]=useState([]);
  const [,setGiftTotal]=useState(stream.gifts);
  const [streamerLeft,setStreamerLeft]=useState(false);
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
      const raw=track.getMediaStreamTrack?.();
      if(raw){
        el.srcObject=new MediaStream([raw]);
        el.muted=false;
        el.play().catch(()=>{el.muted=true;el.play().catch(()=>{});});
      } else if(track.play){
        track.play(el);
      }
    };
    joinStream({
      channelName:stream.channel_name,
      userId:user?.id||null,
      onVideoTrack:handleVideoTrack,
      onStreamerLeft:()=>setStreamerLeft(true),
    });
    return()=>{leaveStream();};
  },[stream.channel_name]); // eslint-disable-line

  useEffect(()=>{
    if(stream.channel_name)return;
    const t=setInterval(()=>{const m={...CHAT_POOL[Math.floor(Math.random()*CHAT_POOL.length)],id:Date.now()};setChat(c=>[...c.slice(-25),m]);},2800);
    return()=>clearInterval(t);
  },[stream.channel_name]);

  useEffect(()=>{
    if(!stream.id||typeof stream.id!=="string")return;
    const channel=supabase.channel(`chat:${stream.id}`)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"chat_messages",filter:`stream_id=eq.${stream.id}`},
        payload=>{setChat(c=>[...c.slice(-25),{u:payload.new.username||"Viewer",t:payload.new.message,c:C.cyan,gift:payload.new.is_gift,id:payload.new.id}]);})
      .subscribe();
    return()=>supabase.removeChannel(channel);
  },[stream.id]);

  useEffect(()=>{
    if(chatRef.current){const el=chatRef.current;const isNearBottom=el.scrollHeight-el.scrollTop-el.clientHeight<120;if(isNearBottom)el.scrollTop=el.scrollHeight;}
  },[chat]);

  const launchFloat=(emoji)=>{const id=Date.now();setFloats(f=>[...f,{id,emoji,x:60+Math.random()*200}]);};

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
    playNotifSound("gift");launchFloat(emoji);setGiftTotal(g=>g+amount);
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
              {stream.channel_name&&<video ref={videoContainerRef} autoPlay playsInline style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",zIndex:1}}/>}
              {!stream.channel_name&&<>
                <div style={{position:"absolute",inset:0,background:`radial-gradient(circle at 50%,${stream.col}15,transparent 60%)`}}/>
                <div style={{zIndex:2}}>
                  <div className="avRing" style={{display:"inline-block"}}><Av ch={stream.av} sz={72} g={`linear-gradient(135deg,${stream.col},${C.purple})`}/></div>
                  <div style={{fontSize:13,color:"rgba(255,255,255,.6)",textAlign:"center",marginTop:8}}>{stream.streamer} is live</div>
                </div>
                <div style={{position:"absolute",bottom:50,left:"50%",transform:"translateX(-50%)",display:"flex",gap:2,opacity:.3}}>
                  {[.9,1.1,.8,1.3,.7,1.0,.85,1.2,.75,1.1,.9,.8,1.3,.7,1.0].map((d,i)=>(<div key={i} className="wBar" style={{animationDelay:`${i*.07}s`,animationDuration:`${d}s`}}/>))}
                </div>
              </>}
              {streamerLeft&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.8)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:3,flexDirection:"column",gap:12}}>
                <div className="icoPulse" style={{display:"flex",justifyContent:"center",marginBottom:8}}><Ico n="power" s={48} c={C.muted}/></div>
                <div style={{fontWeight:700,fontSize:16}}>Stream has ended</div>
                <button className="btn btnC" style={{padding:"10px 20px",fontSize:13}} onClick={onBack}>Back to Home</button>
              </div>}
              <button onClick={()=>{leaveStream();onBack();}} style={{position:"absolute",top:14,left:14,background:"rgba(0,0,0,.6)",border:"none",borderRadius:10,padding:"8px",cursor:"pointer",display:"flex",backdropFilter:"blur(6px)",zIndex:4}}><Ico n="back" s={18} c="#fff"/></button>
              <div style={{position:"absolute",top:14,right:14,display:"flex",gap:8,alignItems:"center",zIndex:4}}><LiveBadge viewers={stream.viewers}/></div>
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
                      <div><span style={{fontWeight:800,color:C.gold,fontSize:13}}>{m.u}</span><span style={{fontSize:12,color:"rgba(255,255,255,.75)",marginLeft:4}}>{m.t}</span></div>
                    </div>
                  ):m.type==="sub"?(
                    <div style={{background:`linear-gradient(135deg,${C.purple}18,${C.pink}08)`,border:`1px solid ${C.purple}35`,borderRadius:12,padding:"8px 12px",display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:32,height:32,borderRadius:10,background:`${C.purple}25`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Ico n="star" s={16} c={C.purple}/></div>
                      <div><span style={{fontWeight:800,color:C.purple,fontSize:13}}>{m.u}</span><span style={{fontSize:12,color:"rgba(255,255,255,.75)",marginLeft:4}}>{m.t}</span></div>
                    </div>
                  ):(
                    <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                      <div style={{width:22,height:22,borderRadius:"50%",background:m.c,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:"#fff"}}>{m.u[0]}</div>
                      <div style={{lineHeight:1.5}}><span style={{fontSize:12,fontWeight:800,color:m.c}}>{m.u} </span><span style={{fontSize:13,color:"rgba(255,255,255,.85)"}}>{m.t}</span></div>
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
                <input className="inp" style={{flex:1,padding:"9px 12px",fontSize:13,background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.12)",color:"#fff"}} placeholder={user?"Say something...":"Sign in to chat..."} value={msg} onChange={e=>setMsg(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendChat()} onClick={()=>{if(!user)onAuthRequired&&onAuthRequired();}}/>
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
      // For real streams: fetch the latest live frame or thumbnail
      if(s.isReal&&!thumbSrc){
        supabase.from("streams")
          .select("live_thumbnail_url,thumbnail_url")
          .eq("id",s.id).single()
          .then(({data})=>{
            if(data?.thumbnail_url) setHoverThumb(data.thumbnail_url);
            else if(data?.live_thumbnail_url) setHoverThumb(data.live_thumbnail_url);
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
  const previewImg=thumbSrc||hoverThumb||s.live_thumbnail_url||"";

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
        {s.live&&<div style={{position:"absolute",bottom:8,right:8,background:"rgba(0,0,0,.7)",borderRadius:6,padding:"2px 7px",display:"flex",alignItems:"center",gap:4}}><Ico n="eye" s={10} c="rgba(255,255,255,.6)"/><span style={{fontSize:9,color:"rgba(255,255,255,.65)"}}>{(s.viewers/1000).toFixed(1)}K</span></div>}
        <div style={{position:"absolute",bottom:8,left:8,display:"flex",alignItems:"center",gap:4}}><Ico n="gift" s={12} c={C.amber}/><span className="exo" style={{fontSize:10,color:C.gold,fontWeight:800}}>{fmt(s.gifts*.1)}</span></div>
        {hovered&&s.live&&<div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",justifyContent:"space-between",background:"linear-gradient(transparent 50%,rgba(0,0,0,.7))",animation:"overlayIn .2s ease both"}}>
          <div style={{display:"flex",justifyContent:"flex-end",padding:"8px"}}><div style={{background:"rgba(0,0,0,.75)",borderRadius:6,padding:"3px 8px",display:"flex",alignItems:"center",gap:5,border:"1px solid rgba(255,255,255,.15)"}}><div style={{width:6,height:6,borderRadius:"50%",background:"#FF2D2D",animation:"livePulse 1.4s infinite"}}/><span style={{fontSize:9,color:"#fff",fontWeight:800,fontFamily:"Exo 2",letterSpacing:.5}}>LIVE PREVIEW</span></div></div>
          <div style={{display:"flex",justifyContent:"flex-end",padding:"8px"}} onClick={e=>{e.stopPropagation();setMuted(m=>!m);}}>
            <button style={{background:"rgba(0,0,0,.75)",border:"1px solid rgba(255,255,255,.25)",borderRadius:"50%",width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",backdropFilter:"blur(4px)"}} title={muted?"Turn on sound":"Mute"}>
              <Ico n={muted?"volumeoff":"volume"} s={14} c="#fff"/>
            </button>
          </div>
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
const HomeFeed=({fmt,onStream,onViewProfile})=>{
  const [cat,setCat]=useState("All");
  const [realStreams,setRealStreams]=useState([]);
  const [featured,setFeatured]=useState(STREAMS[3]);

  const mapStream=(s,profileMap={})=>{
    const profile=profileMap[s.streamer_id]||{};
    const name=profile.display_name||profile.username||s.streamer_name||"Streamer";
    const COLS=[C.cyan,C.purple,C.amber,C.emerald,C.gold,C.pink,C.sky];
    const col=COLS[parseInt((s.id||"0").toString().slice(-2)||"0",16)%COLS.length]||C.cyan;
    return{
      id:s.id, streamer:name, av:(name[0]||"S").toUpperCase(),
      title:s.title||"Live Stream",
      viewers:s.viewer_count||0, gifts:s.gift_total||0,
      cat:s.category||"General",
      bg:"#0D0A20", col, verified:false, live:true,
      channel_name:s.channel_name||"",
      thumbnail:s.thumbnail_url||"",
      live_thumbnail_url:s.live_thumbnail_url||"",
      streamer_id:s.streamer_id||"",
      sp:{w:1.99,m:5.99,a:49.99},
      avatar_url:profile.avatar_url||"",
      isReal:true,
    };
  };

  useEffect(()=>{
    let cancelled=false;
    const load=async()=>{
      // Simple query — no joins that can silently fail
      const {data:streams,error}=await supabase
        .from("streams")
        .select("id,title,category,viewer_count,gift_total,channel_name,thumbnail_url,live_thumbnail_url,streamer_id,streamer_name")
        .eq("is_live",true)
        .order("viewer_count",{ascending:false})
        .limit(30);
      if(cancelled)return;
      if(error){console.error("[HomeFeed]",error.message);return;}
      if(!streams?.length)return;
      // Fetch profiles separately — best effort
      const ids=[...new Set(streams.map(s=>s.streamer_id).filter(Boolean))];
      let profileMap={};
      if(ids.length>0){
        const {data:profiles}=await supabase.from("profiles").select("id,display_name,username,avatar_url").in("id",ids);
        if(profiles) profiles.forEach(p=>{profileMap[p.id]=p;});
      }
      if(cancelled)return;
      const mapped=streams.map(s=>mapStream(s,profileMap));
      setRealStreams(mapped);
      setFeatured(f=>{
        if(mapped.length>0&&(!f.isReal||!mapped.find(r=>r.id===f.id)))return mapped[0];
        return f;
      });
    };
    load();
    const channel=supabase
      .channel("homefeed_streams")
      .on("postgres_changes",{event:"*",schema:"public",table:"streams"},()=>load())
      .subscribe();
    return()=>{cancelled=true;supabase.removeChannel(channel);};
  },[]); // eslint-disable-line

  const allStreams=[
    ...realStreams,
    ...STREAMS.filter(m=>!realStreams.some(r=>r.streamer===m.streamer)),
  ];
  const streams=cat==="All"?allStreams:allStreams.filter(s=>s.cat===cat);

  return(
    <div style={{width:"100%",minWidth:0,boxSizing:"border-box",overflowX:"hidden",padding:0,margin:0}}>
      {/* Featured banner */}
      <div style={{position:"relative",height:300,cursor:"pointer",overflow:"hidden"}} onClick={()=>onStream(featured)}>
        <div style={{position:"absolute",inset:0,background:featured.thumbnail?`url(${featured.thumbnail}) center/cover`:`linear-gradient(160deg,${featured.bg||"#0D0A20"},#000)`}}/>
        <div style={{position:"absolute",top:-40,right:-40,width:300,height:300,borderRadius:"50%",background:`${featured.col||C.cyan}20`,filter:"blur(60px)"}}/>
        {!featured.thumbnail&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}><div className="avRing"><Av ch={featured.av} sz={90} g={`linear-gradient(135deg,${featured.col||C.cyan},${C.purple})`}/></div></div>}
        <div style={{position:"absolute",inset:0,background:"linear-gradient(transparent 30%,rgba(0,0,0,.94))"}}/>
        <div style={{position:"absolute",top:14,left:14}}><LiveBadge viewers={featured.viewers}/></div>
        <div style={{position:"absolute",top:14,right:14}}>
          <span className="tag" style={{background:`${C.gold}22`,color:C.gold,border:`1px solid ${C.gold}35`,fontSize:11,padding:"4px 10px"}}>
            <span style={{display:"inline-flex",alignItems:"center",gap:4}}><Ico n="zap" s={10} c={C.gold}/>{featured.isReal?"🔴 LIVE NOW":"TOP STREAM"}</span>
          </span>
        </div>
        <div style={{position:"absolute",bottom:16,left:18,right:18}}>
          <div style={{fontWeight:800,fontSize:20,lineHeight:1.3,marginBottom:8,color:"#fff"}}>{featured.title}</div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {featured.avatar_url?<img src={featured.avatar_url} style={{width:28,height:28,borderRadius:"50%",objectFit:"cover"}}/>:<Av ch={featured.av} sz={28} g={`linear-gradient(135deg,${featured.col||C.cyan},${C.purple})`}/>}
            <span style={{fontSize:13,color:"rgba(255,255,255,.8)",fontWeight:600}}>{featured.streamer}</span>
            {featured.verified&&<Ico n="check" s={12} c={C.amber}/>}
          </div>
        </div>
      </div>
      {/* Category filter */}
      <div className="sx" style={{padding:"12px 0 0",display:"flex",gap:8}}>
        {CATS.map(c=>(
          <button key={c} onClick={()=>setCat(c)} style={{flexShrink:0,padding:"7px 18px",borderRadius:22,border:`1.5px solid ${cat===c?C.cyan:C.border}`,background:cat===c?`${C.cyan}18`:C.card2,color:cat===c?C.cyan:C.muted,fontFamily:"Plus Jakarta Sans",fontWeight:800,fontSize:12,cursor:"pointer",transition:"all .2s",whiteSpace:"nowrap"}}>{c}</button>
        ))}
      </div>
      {/* Stream grid */}
      <div className="grid">
        {streams.map(s=><StreamCard key={s.id} s={s} fmt={fmt} onClick={()=>onStream(s)} onViewProfile={onViewProfile}/>)}
        {streams.length===0&&(
          <div style={{gridColumn:"1/-1",textAlign:"center",padding:"60px 0",color:C.muted}}>
            <div className="icoFloat" style={{display:"flex",justifyContent:"center",marginBottom:12}}><Ico n="search" s={48} c={C.muted}/></div>
            <div style={{fontWeight:700,fontSize:18}}>No streams found</div>
            <div style={{fontSize:14,marginTop:6}}>Try a different category</div>
          </div>
        )}
      </div>
      {/* Premium row */}
      <div style={{padding:"4px 0 10px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}><Ico n="lock" s={15} c={C.purple}/><span className="exo" style={{fontWeight:900,fontSize:13}}>PREMIUM VIDEOS</span></div>
        <span style={{fontSize:11,color:C.purple,fontWeight:700}}>Subscribe to unlock</span>
      </div>
      <div className="sx" style={{padding:"0 0 20px",display:"flex",gap:14}}>
        {STREAMS.slice(0,6).map((s,i)=>(
          <div key={s.id} style={{flexShrink:0,width:200,background:C.card,border:`1px solid ${C.border}`,borderRadius:14,overflow:"hidden",cursor:"pointer",transition:"transform .18s"}} onMouseEnter={e=>e.currentTarget.style.transform="translateY(-3px)"} onMouseLeave={e=>e.currentTarget.style.transform="translateY(0)"}>
            <div style={{height:110,background:`linear-gradient(160deg,${s.bg},#111)`,position:"relative",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <Av ch={s.av} sz={36} g={`linear-gradient(135deg,${s.col},${C.purple})`}/>
              <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.5)",display:"flex",alignItems:"center",justifyContent:"center"}}><Ico n="lock" s={28} c="rgba(255,255,255,.45)"/></div>
              <div style={{position:"absolute",top:7,right:7}}><div className="tag" style={{background:`${C.purple}40`,color:"#d8b4ff",fontSize:9,border:`1px solid ${C.purple}30`}}>PREMIUM</div></div>
              <div style={{position:"absolute",bottom:7,right:7,background:"rgba(0,0,0,.7)",borderRadius:6,padding:"2px 6px",fontSize:9,color:"rgba(255,255,255,.65)"}}>{["12:34","45:00","1:02:10","28:45","36:20","52:11"][i]}</div>
            </div>
            <div style={{padding:"9px 10px 11px"}}>
              <div style={{fontSize:12,fontWeight:700,lineHeight:1.35,marginBottom:4,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>Exclusive premium content for subscribers only</div>
              <div style={{fontSize:10,color:C.muted}}>{s.streamer} · from {fmt(s.sp.m)}/mo</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ═══════════════════ SEARCH PAGE ═══════════════════ */
const SearchPage=({onStream,initialSearch=""})=>{
  const [q,setQ]=useState(initialSearch);
  const results=q?STREAMS.filter(s=>s.streamer.toLowerCase().includes(q.toLowerCase())||s.title.toLowerCase().includes(q.toLowerCase())||s.cat.toLowerCase().includes(q.toLowerCase())):[];
  const cols=[C.cyan,C.purple,C.amber,C.emerald,C.gold,C.pink,C.sky,C.cyan,C.purple,C.amber,C.emerald,C.gold,C.pink,C.sky,C.cyan,C.purple];
  return(
    <div style={{padding:"20px 20px 40px"}} className="page">
      <div className="exo" style={{fontSize:22,fontWeight:900,marginBottom:16}}>Discover</div>
      <input className="inp" placeholder="Search streamers, titles, categories..." value={q} onChange={e=>setQ(e.target.value)} style={{marginBottom:20,fontSize:15}}/>
      {q&&results.length>0&&(
        <div style={{marginBottom:24}}>
          <div className="exo" style={{fontSize:11,color:C.muted,marginBottom:12,fontWeight:700}}>RESULTS ({results.length})</div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {results.map(s=>(
              <div key={s.id} className="card" onClick={()=>onStream(s)} style={{padding:"12px",display:"flex",gap:12,alignItems:"center",cursor:"pointer"}}>
                <Av ch={s.av} sz={44} g={`linear-gradient(135deg,${s.col},${C.purple})`}/>
                <div style={{flex:1}}><div style={{fontWeight:700,fontSize:14}}>{s.streamer}</div><div style={{fontSize:12,color:C.muted,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{s.title}</div></div>
                {s.live&&<LiveBadge viewers={s.viewers}/>}
              </div>
            ))}
          </div>
        </div>
      )}
      {q&&results.length===0&&<div style={{textAlign:"center",padding:"40px 0",color:C.muted}}><div className="icoFloat" style={{display:"flex",justifyContent:"center",marginBottom:10}}><Ico n="search" s={40} c={C.muted}/></div><div style={{fontWeight:700}}>No results for "{q}"</div></div>}
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
  const [shareLink]=useState(window.location.origin+"?stream=live_"+(user?.id||"demo"));
  const videoRef=useRef();
  const liveVideoRef=useRef();
  const timerRef=useRef();const chatRef=useRef();
  const localVideoTrack=useRef(null);const localAudioTrack=useRef(null);

  useEffect(()=>{
    let stream;
    navigator.mediaDevices?.getUserMedia({video:true,audio:true})
      .then(s=>{stream=s;setPreviewStream(s);if(videoRef.current)videoRef.current.srcObject=s;})
      .catch(()=>setStreamError("Camera not available. Check permissions."));
    return()=>{stream?.getTracks().forEach(t=>t.stop());};
  },[]);

  useEffect(()=>{if(!isLive)return;timerRef.current=window.setInterval(()=>setSecs(s=>s+1),1000);return()=>window.clearInterval(timerRef.current);},[isLive]);
  useEffect(()=>{if(chatRef.current)chatRef.current.scrollTop=chatRef.current.scrollHeight;},[studioChat]);

  useEffect(()=>{
    if(studioTab==="setup"&&!isLive&&previewStream&&videoRef.current){
      videoRef.current.srcObject=previewStream;
    }
  },[studioTab,isLive,previewStream]);

  // Attach live camera via getMediaStreamTrack (reliable)
  useEffect(()=>{
    if(!isLive||studioTab!=="stream")return;
    let tid;let attempts=0;
    const attach=()=>{
      const el=liveVideoRef.current;
      if(!el){if(attempts++<30){tid=window.setTimeout(attach,150);}return;}
      const track=localVideoTrack.current;
      if(!track)return;
      try{
        const raw=track.getMediaStreamTrack?.();
        if(raw){el.srcObject=new MediaStream([raw]);el.muted=true;el.play().catch(()=>{});}
        else if(track.play){track.play(el);}
        else{playLocalVideo(el);}
      }catch(e){console.warn("Live preview failed",e);}
    };
    tid=window.setTimeout(attach,200);
    return()=>clearTimeout(tid);
  },[isLive,studioTab]); // eslint-disable-line

  // Periodic frame capture → Supabase (hover preview for viewers)
  useEffect(()=>{
    if(!isLive||!streamId)return;
    const capture=async()=>{
      const el=liveVideoRef.current;
      if(!el||!el.videoWidth)return;
      try{
        const W=Math.min(el.videoWidth,1280);const H=Math.min(el.videoHeight,720);
        const canvas=document.createElement("canvas");canvas.width=W;canvas.height=H;
        canvas.getContext("2d").drawImage(el,0,0,W,H);
        canvas.toBlob(async(blob)=>{
          if(!blob)return;
          const path="previews/"+streamId+".jpg";
          const {error}=await supabase.storage.from("gift3rs-media").upload(path,blob,{upsert:true,contentType:"image/jpeg"});
          if(error)return;
          const {data:u}=supabase.storage.from("gift3rs-media").getPublicUrl(path);
          const url=u.publicUrl+"?v="+Date.now();
          await supabase.from("streams").update({live_thumbnail_url:url}).eq("id",streamId);
        },"image/jpeg",0.8);
      }catch(e){console.warn("Frame capture failed",e);}
    };
    const t1=window.setTimeout(capture,4000);
    const t2=window.setInterval(capture,30000);
    return()=>{window.clearTimeout(t1);window.clearInterval(t2);};
  },[isLive,streamId]);

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

  const handleGoLive=async()=>{
    if(!title){alert("Please enter a stream title.");return;}
    if(!user){alert("You must be signed in.");return;}
    setStarting(true);setStreamError("");
    // Upload thumbnail first
    let thumbnailUrl="";
    if(thumbFile){
      try{
        const ext=thumbFile.name.split(".").pop();
        const path="thumbnails/"+user.id+"_"+Date.now()+"."+ext;
        const {error:upErr}=await supabase.storage.from("gift3rs-media").upload(path,thumbFile,{upsert:true,contentType:thumbFile.type});
        if(!upErr){const {data:ud}=supabase.storage.from("gift3rs-media").getPublicUrl(path);thumbnailUrl=ud.publicUrl||"";}
      }catch(e){console.warn("Thumb upload failed",e);}
    }
    // Create Supabase stream record FIRST — guarantees it appears in HomeFeed
    const channelName=makeChannel(user.id);
    const streamRow={
      streamer_id:user.id,
      streamer_name:user.email?.split("@")[0]||"Streamer",
      title,category:cat||"General",is_live:true,
      channel_name:channelName,thumbnail_url:thumbnailUrl||null,
      is_subscriber_only:subOnly,viewer_count:0,gift_total:0,
      started_at:new Date().toISOString(),
    };
    const {data:newStream,error:dbErr}=await supabase.from("streams").insert(streamRow).select("id").single();
    if(dbErr){
      console.warn("[GoLive] DB insert failed:",dbErr.message,"Code:",dbErr.code);
      // Show the real error so the developer can fix RLS / schema issues
      setStreamError("DB: "+dbErr.message+". Check Supabase RLS policy for streams table (allow authenticated INSERT).");
      // Fallback 1: try upsert without onConflict (just insert-or-update)
      const {data:up,error:upErr}=await supabase.from("streams").upsert(streamRow).select("id").single();
      if(up?.id){
        streamRow.id=up.id;
        setStreamError(""); // cleared — upsert worked
      } else {
        console.warn("[GoLive] upsert also failed:",upErr?.message);
        // Fallback 2: generate a local ID and continue anyway — Agora still works
        streamRow.id="local_"+user.id+"_"+Date.now();
      }
    } else {streamRow.id=newStream.id;}
    const supabaseStreamId=streamRow.id;
    // Release camera for Agora
    if(previewStream){previewStream.getTracks().forEach(t=>t.stop());setPreviewStream(null);await new Promise(r=>window.setTimeout(r,600));}
    // Start Agora
    const result=await startStream({userId:user.id,channelName,title,category:cat||"General",isSubscriberOnly:subOnly,thumbnailUrl,streamId:supabaseStreamId,onViewerCountUpdate:(count)=>{setViewers(count);supabase.from("streams").update({viewer_count:count}).eq("id",supabaseStreamId).catch(()=>{});}});
    if(result){
      const candidates=[result.localVideoTrack,result.localAudioTrack,result.videoTrack,result.audioTrack].filter(Boolean);
      for(const t of candidates){
        const type=t.trackMediaType||t._mediaType||t.constructor?.name?.toLowerCase()||"";
        if(type.includes("video"))localVideoTrack.current=t;
        else if(type.includes("audio"))localAudioTrack.current=t;
      }
      if(!localVideoTrack.current&&result.localVideoTrack)localVideoTrack.current=result.localVideoTrack;
      if(!localAudioTrack.current&&result.localAudioTrack)localAudioTrack.current=result.localAudioTrack;
      setIsLive(true);setStreamId(supabaseStreamId);setStudioTab("stream");
      setStudioChat([{u:"System",t:"You are now live! Welcome your viewers. 🔴",id:Date.now(),type:"system"}]);
    } else {
      await supabase.from("streams").update({is_live:false}).eq("id",supabaseStreamId).catch(()=>{});
      setStreamError("Failed to start stream. Check camera permissions.");
    }
    setStarting(false);
  };

  const handleEndStream=async()=>{
    if(!window.confirm("Are you sure you want to end the stream?"))return;
    window.clearInterval(timerRef.current);await endStream(streamId);
    if(liveVideoRef.current)liveVideoRef.current.srcObject=null;
    localVideoTrack.current=null;localAudioTrack.current=null;
    if(streamId){await supabase.from("streams").update({is_live:false,viewer_count:0,live_thumbnail_url:null,ended_at:new Date().toISOString()}).eq("id",streamId).catch(()=>{});}
    setIsLive(false);setSecs(0);setViewers(0);setGiftTotal(0);setStreamId(null);setStudioTab("setup");setStudioChat([]);
    setThumbPreview("");setThumbFile(null);
    navigator.mediaDevices?.getUserMedia({video:true,audio:true}).then(s=>{setPreviewStream(s);if(videoRef.current)videoRef.current.srcObject=s;});
  };

  const handleToggleMic=async()=>{
    const next=!micOn;setMicOn(next);
    if(localAudioTrack.current?.setEnabled)await localAudioTrack.current.setEnabled(next);
    else await toggleMic(next);
  };
  const handleToggleCam=async()=>{
    const next=!camOn;setCamOn(next);
    if(localVideoTrack.current?.setEnabled)await localVideoTrack.current.setEnabled(next);
    else await toggleCamera(next);
    if(next&&liveVideoRef.current&&localVideoTrack.current){
      try{const raw=localVideoTrack.current.getMediaStreamTrack?.();if(raw){liveVideoRef.current.srcObject=new MediaStream([raw]);liveVideoRef.current.muted=true;liveVideoRef.current.play().catch(()=>{});}}catch(_e){/* camera re-attach failed silently */}
    }
  };
  const sendStudioMsg=async()=>{
    if(!chatMsg.trim())return;const msg=chatMsg.trim();setChatMsg("");
    setStudioChat(c=>[...c,{u:"You (Streamer)",t:msg,id:Date.now(),type:"streamer"}]);
    if(streamId&&user){await supabase.from("chat_messages").insert({stream_id:streamId,user_id:user.id,username:user.email?.split("@")[0]||"Streamer",message:msg}).catch(()=>{});}
  };
  const addTag=()=>{if(tagInput.trim()&&tags.length<5&&!tags.includes(tagInput.trim())){setTags(t=>[...t,tagInput.trim()]);setTagInput("");}};
  const copyLink=()=>{navigator.clipboard.writeText(shareLink);setCopied(true);window.setTimeout(()=>setCopied(false),2000);};
  const scheduleStream=()=>{if(!schedTitle||!scheduledTime){alert("Please fill in title and time.");return;}if(new Date(scheduledTime)<=new Date()){alert("Please choose a future date and time.");return;}setScheduledStreams(s=>[...s,{title:schedTitle,time:scheduledTime,id:Date.now()}]);setSchedTitle("");setScheduledTime("");};
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
              <video ref={liveVideoRef} autoPlay muted playsInline style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>
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
        {studioTab==="analytics"&&<div style={{maxWidth:640}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:12,marginBottom:20}}>
            {[["eye","Total Views","12.4K",C.cyan],["users","Followers","2,341",C.purple],["gift","Total Gifts",fmt(4820),C.gold],["activity","Avg Watch Time","8m 42s",C.emerald],["trending","Peak Viewers","1,204",C.amber],["star","Rating","4.9 ⭐",C.pink]].map(([icon,label,val,col],i)=>(
              <div key={i} className="card" style={{padding:"16px",textAlign:"center"}}><div style={{display:"flex",justifyContent:"center",marginBottom:8}}><Ico n={icon} s={24} c={col}/></div><div className="exo" style={{fontWeight:900,fontSize:20,color:col}}>{val}</div><div style={{fontSize:11,color:darkMode?C.muted:"#555",marginTop:4,fontWeight:600}}>{label}</div></div>
            ))}
          </div>
          <div className="card" style={{padding:"18px",marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><div className="exo" style={{fontWeight:800,fontSize:14}}>Recent Streams</div><span style={{fontSize:11,color:C.muted}}>Last 30 days</span></div>
            {[["FIFA Finals 2026",31000,fmt(12400),"2h 14m","Gaming"],["Tech Talk LIVE",8900,fmt(2100),"1h 45m","Tech"],["Afrobeats Night",14200,fmt(4820),"3h 02m","Music"],["Finance Tips",5600,fmt(1800),"55m","Finance"]].map(([t,v,g,d,c],i)=>(<div key={i} style={{display:"flex",gap:12,alignItems:"center",padding:"12px 0",borderBottom:i<3?`1px solid ${C.border}`:"none"}}><div style={{width:42,height:42,borderRadius:10,background:`${C.cyan}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Ico n="play" s={16} c={C.cyan}/></div><div style={{flex:1,minWidth:0}}><div style={{fontWeight:700,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t}</div><div style={{fontSize:11,color:C.muted,marginTop:2}}>{(v/1000).toFixed(1)}K viewers · {d} · {c}</div></div><div style={{textAlign:"right",flexShrink:0}}><div className="exo" style={{color:C.gold,fontWeight:800,fontSize:13}}>{g}</div><div style={{fontSize:10,color:C.muted}}>earned</div></div></div>))}
          </div>
        </div>}

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

/* ═══════════════════ DASH PAGE ═══════════════════ */
const DashPage=({fmt,darkMode=true})=>{
  const [tab,setTab]=useState("overview");
  const [period,setPeriod]=useState("7d");
  const periods=["24h","7d","30d","90d","All time"];
  const earnings={"24h":{total:120,gifts:80,subs:40,withdrawn:0,pending:120},"7d":{total:840,gifts:560,subs:280,withdrawn:500,pending:340},"30d":{total:3200,gifts:2100,subs:1100,withdrawn:2000,pending:1200},"90d":{total:12400,gifts:8200,subs:4200,withdrawn:8000,pending:4400},"All time":{total:49800,gifts:32000,subs:17800,withdrawn:40000,pending:9800}};
  const e=earnings[period];
  return(
    <div style={{padding:"24px 20px 40px"}} className="page">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10,marginBottom:20}}>
        <div><div className="exo" style={{fontSize:22,fontWeight:900}}>Earnings</div><div style={{fontSize:12,color:darkMode?C.muted:"#555",marginTop:2}}>Your revenue, stats and payouts</div></div>
        <div style={{display:"flex",gap:4,background:C.card2,borderRadius:12,padding:4}}>
          {periods.map(p=>(<button key={p} onClick={()=>setPeriod(p)} style={{padding:"5px 10px",borderRadius:9,border:"none",background:period===p?C.card:"transparent",color:period===p?C.cyan:C.muted,fontWeight:700,fontSize:11,cursor:"pointer",whiteSpace:"nowrap"}}>{p}</button>))}
        </div>
      </div>
      {/* Balance card */}
      <div className="card" style={{padding:"20px",marginBottom:16,background:`linear-gradient(135deg,${C.emerald}15,${C.cyan}08)`,border:`1px solid ${C.emerald}30`,maxWidth:700}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
          <div><div style={{fontSize:13,fontWeight:700,color:darkMode?C.text:"#0F0F0F"}}>Available Balance</div><div style={{fontSize:11,color:darkMode?C.muted:"#555"}}>Ready to withdraw</div></div>
          <div className="exo" style={{fontSize:32,fontWeight:900,color:C.emerald}}>{fmt(e.pending)}</div>
          <button className="btn btnC" style={{padding:"10px 20px",fontSize:13}}>Withdraw via Card or Mobile Money</button>
        </div>
      </div>
      {/* Earning card */}
      <div style={{background:`linear-gradient(135deg,${C.amber}28,${C.purple}18)`,border:`1px solid ${C.amber}28`,borderRadius:20,padding:"24px",marginBottom:20,position:"relative",overflow:"hidden",maxWidth:700}}>
        <div style={{position:"absolute",right:-30,top:-30,width:160,height:160,borderRadius:"50%",background:`${C.amber}12`,filter:"blur(30px)"}}/>
        <div style={{fontSize:11,color:darkMode?"rgba(255,255,255,.6)":"#666",fontFamily:"Exo 2",fontWeight:800,marginBottom:4}}>{period.toUpperCase()}</div>
        <div className="exo" style={{fontSize:40,fontWeight:900,marginBottom:4,color:darkMode?C.text:"#0F0F0F"}}>{fmt(e.total)}</div>
        <div style={{fontSize:13,color:darkMode?"rgba(255,255,255,.65)":"#444"}}>↑ 34% from previous period</div>
        <div style={{display:"flex",gap:10,marginTop:18,flexWrap:"wrap"}}>
          {[["gift","Gifts",fmt(e.gifts)],["star","Subs",fmt(e.subs)],["video","PPV",fmt(e.total*.1)]].map(([icon,l,v])=>(
            <div key={l} style={{background:"rgba(0,0,0,.28)",borderRadius:12,padding:"10px 16px",textAlign:"center"}}>
              <div className="icoGlow" style={{display:"flex",justifyContent:"center",marginBottom:4}}><Ico n={icon} s={16} c={C.gold}/></div>
              <div className="exo" style={{fontWeight:900,fontSize:14,color:darkMode?C.text:"#0F0F0F"}}>{v}</div>
              <div style={{fontSize:10,opacity:.65,marginTop:2,color:darkMode?"inherit":"#555"}}>{l}</div>
            </div>
          ))}
        </div>
      </div>
      {/* Tabs */}
      <div style={{display:"flex",gap:6,marginBottom:20,background:C.card2,borderRadius:14,padding:4,maxWidth:400}}>
        {["overview","gifters","videos"].map(t=>(<button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:"9px",borderRadius:11,border:"none",background:tab===t?C.card:"transparent",color:tab===t?C.cyan:C.muted,fontWeight:700,fontSize:13,cursor:"pointer",transition:"all .2s",textTransform:"capitalize"}}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>))}
      </div>
      {tab==="overview"&&<div className="page">
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:14,marginBottom:20,maxWidth:700}}>
          {[["users","Subscribers","348","+28"],["eye","Total Views","1.2M","+15%"],["activity","Stream Hrs","84h","This month"],["star","Rating","4.9","2.1K reviews"]].map(([icon,label,val,sub],i)=>(
            <div key={i} className="card" style={{padding:"16px"}}>
              <div className="icoRise" style={{display:"flex",marginBottom:8}}><Ico n={icon} s={24} c={[C.emerald,C.amber,C.purple,C.cyan][i]}/></div>
              <div className="exo statVal" style={{fontSize:22,fontWeight:900,color:darkMode?C.text:"#0F0F0F"}}>{val}</div>
              <div style={{fontSize:12,color:darkMode?C.muted:"#555"}}>{label}</div>
              <div style={{fontSize:12,color:C.emerald,marginTop:4,fontWeight:700}}>{sub}</div>
            </div>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:16,maxWidth:700}}>
          <div className="card" style={{padding:"18px"}}>
            <div className="exo" style={{fontWeight:800,fontSize:14,marginBottom:14,color:darkMode?C.text:"#0F0F0F"}}>Revenue Breakdown</div>
            {[["Gifts",C.amber,34],["Subscriptions",C.purple,58],["Pay-Per-View",C.cyan,8]].map(([label,col,pct])=>(
              <div key={label} style={{marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:6}}>
                  <span style={{fontWeight:600,color:darkMode?C.text:"#0F0F0F"}}>{label}</span>
                  <span style={{color:col,fontWeight:700}}>{pct}%</span>
                </div>
                <PBar pct={pct} color={col}/>
              </div>
            ))}
          </div>
          <div className="card" style={{padding:"18px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div><div className="exo" style={{fontWeight:800,fontSize:14,color:darkMode?C.text:"#0F0F0F"}}>Available Balance</div><div style={{fontSize:12,color:darkMode?C.muted:"#555"}}>Ready to withdraw</div></div>
              <div className="exo" style={{fontSize:24,fontWeight:900,color:C.emerald}}>{fmt(e.pending)}</div>
            </div>
            <button className="btn btnC" style={{width:"100%",padding:"13px",fontSize:14}}>Withdraw via Card or Mobile Money</button>
          </div>
        </div>
      </div>}
      {tab==="gifters"&&<div className="page">
        <div className="card" style={{padding:"18px",maxWidth:500}}>
          <div className="exo" style={{fontWeight:800,fontSize:14,marginBottom:14,color:darkMode?C.text:"#0F0F0F"}}>Top Gifters This Month</div>
          {[["trophy","Kwame B.",1200],["award","Adwoa M.",850],["zap","Kofi A.",620],["star","Nana K.",410],["activity","Ama S.",280]].map(([badge,name,amt],i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:i<4?`1px solid ${C.border}`:"none"}}>
              <span className="icoGlow" style={{width:30,display:"flex",alignItems:"center"}}><Ico n={badge} s={20} c={i===0?C.gold:i===1?C.muted:C.amber}/></span>
              <div style={{flex:1}}><div style={{fontWeight:700,fontSize:14,color:darkMode?C.text:"#0F0F0F"}}>{name}</div><div style={{fontSize:11,color:darkMode?C.muted:"#555"}}>#{i+1} top gifter</div></div>
              <div><div className="exo" style={{fontWeight:900,color:C.gold,fontSize:14}}>{fmt(amt)}</div><PBar pct={Math.round(amt/12)} color={C.gold} h={3}/></div>
            </div>
          ))}
        </div>
      </div>}
      {tab==="videos"&&<div className="page" style={{maxWidth:700}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div className="exo" style={{fontWeight:800,fontSize:16,color:darkMode?C.text:"#0F0F0F"}}>Premium Videos</div>
          <button className="btn btnC" style={{padding:"8px 16px",fontSize:12,display:"flex",alignItems:"center",gap:6}}><Ico n="upload" s={13} c="#06060F"/>Upload Video</button>
        </div>
        {STREAMS.slice(0,5).map((s,i)=>(
          <div key={i} className="card" style={{padding:"13px",marginBottom:10,display:"flex",gap:12,alignItems:"center",cursor:"pointer"}}>
            <div style={{width:90,height:60,borderRadius:10,background:`linear-gradient(135deg,${s.bg},#000)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,position:"relative"}}>
              <Ico n="play" s={22} c="rgba(255,255,255,.85)"/>
              {i<2&&<div style={{position:"absolute",top:4,left:4,background:`${C.gold}DD`,borderRadius:5,padding:"1px 5px",fontSize:9,fontWeight:900,color:"#000"}}>PREMIUM</div>}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:4,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",color:darkMode?C.text:"#0F0F0F"}}>{s.title}</div>
              <div style={{display:"flex",gap:12,fontSize:11,color:darkMode?C.muted:"#555"}}>
                <span style={{display:"flex",alignItems:"center",gap:4}}><Ico n="eye" s={11} c={darkMode?C.muted:"#555"}/>{(s.viewers/1000).toFixed(1)}K views</span>
                <span style={{display:"flex",alignItems:"center",gap:4}}><Ico n="coins" s={11} c={C.gold}/>{fmt(s.gifts*.1)} earned</span>
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
              <div className="exo" style={{fontSize:13,color:C.amber,fontWeight:800}}>#{i+1}</div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={e=>{e.stopPropagation();}} style={{background:C.card2,border:`1px solid ${C.border}`,borderRadius:8,padding:"4px 8px",cursor:"pointer",display:"flex"}}><Ico n="edit" s={12} c={C.muted}/></button>
                <button onClick={e=>{e.stopPropagation();}} style={{background:"#FF2D2D18",border:"1px solid #FF2D2D30",borderRadius:8,padding:"4px 8px",cursor:"pointer",display:"flex"}}><Ico n="close" s={12} c="#FF6060"/></button>
              </div>
            </div>
          </div>
        ))}
        <div style={{padding:"20px",textAlign:"center",color:C.muted,fontSize:13,background:C.card,borderRadius:14,border:`2px dashed ${C.border2}`,cursor:"pointer"}} onClick={()=>alert("Upload a new premium video")}>
          <div style={{display:"flex",justifyContent:"center",marginBottom:8}}><Ico n="upload" s={28} c={C.muted}/></div>
          <div style={{fontWeight:700}}>Upload New Premium Video</div>
          <div style={{fontSize:11,marginTop:4}}>MP4, MOV up to 2GB · Subscribers only</div>
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
    const {error}=await supabase.from("profiles").upsert({id:user.id,display_name:profile.name,username:profile.username.replace("@","").trim().toLowerCase(),bio:profile.bio,location:profile.location,links:profile.links,cover_url:coverUrl||null,avatar_url:avatarUrl||null,sub_price_weekly:Number(profile.sp.w)||1.99,sub_price_monthly:Number(profile.sp.m)||5.99,sub_price_annually:Number(profile.sp.a)||49.99},{onConflict:"id"});
    if(error){alert("Save failed: "+error.message);setSaving(false);return;}
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
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:12,marginBottom:24}}>
          {[["23.4K","Followers"],["142","Videos"],[fmt(12480),"Earned"]].map(([v,l],i)=>(
            <div key={i} className="card" style={{padding:"14px",textAlign:"center"}}>
              <div className="exo" style={{fontWeight:900,fontSize:18,color:i===2?C.gold:C.text}}>{v}</div>
              <div style={{fontSize:11,color:C.muted,marginTop:2}}>{l}</div>
            </div>
          ))}
        </div>
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
          <div className="exo" style={{fontWeight:800,fontSize:14,marginBottom:14}}>Your Subscription Prices</div>
          {[["weekly","Weekly","w"],["monthly","Monthly","m"],["annually","Annual","a"]].map(([key,label,short])=>(
            <div key={key} style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <span style={{fontSize:14,fontWeight:600}}>{label}</span>
              {editing?<div style={{display:"flex",alignItems:"center",gap:6}}><span style={{color:C.muted,fontSize:13}}>$</span><input type="number" className="inp" style={{width:90,padding:"7px 10px",fontSize:14}} value={profile.sp[short]} onChange={e=>setProfile(p=>({...p,sp:{...p.sp,[short]:parseFloat(e.target.value)||0}}))}/></div>
              :<span className="exo" style={{fontWeight:800,color:C.gold}}>{fmt(profile.sp[short])}</span>}
            </div>
          ))}
          <div style={{fontSize:11,color:C.muted,paddingTop:10,borderTop:`1px solid ${C.border}`}}>Platform takes 20% · You keep 80%</div>
        </div>}
        <SettingsPanel user={user} onSignOut={onSignOut} onSignIn={onSignIn} isStreamer={isStreamer} fmt={fmt}/>
      </div>
    </div>
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
            {sec.id==="help"&&<div>{[["How do gifts work?","Viewers send gifts during streams. You keep 90%, platform takes 10%."],["How do I withdraw?","Withdrawals processed within 24 hours to your payout account."],["Why was my stream removed?","Streams violating community guidelines are removed."],["How do I become verified?","Complete identity verification and pay the one-time setup fee."]].map(([q,a])=>(<div key={q} className="settingsInner" style={{marginBottom:12,padding:"12px",borderRadius:10}}><div style={{fontWeight:700,fontSize:13,marginBottom:6}}>{q}</div><div style={{fontSize:12,color:C.muted,lineHeight:1.6}}>{a}</div></div>))}<button className="btn btnC" style={{padding:"10px 20px",fontSize:13,marginTop:4}}>Contact Support</button></div>}
            {sec.id==="terms"&&<div style={{fontSize:12,color:C.muted,lineHeight:1.8}}>
              <div style={{fontWeight:700,color:C.text,marginBottom:8}}>Terms of Service</div>
              <p>By using GIFT3RS you agree to our Terms of Service. Streamers must be 18+. All transactions are final.</p>
              <div style={{fontWeight:700,color:C.text,margin:"12px 0 8px"}}>Privacy Policy</div>
              <p>We collect minimal data needed to operate the platform. We never sell your data. Payments are processed securely via Paystack and Stripe.</p>
              <div style={{fontWeight:700,color:C.text,margin:"12px 0 8px"}}>Earnings &amp; Fees</div>
              <p>Platform takes 10% of gifts and 20% of subscription revenue. Payouts processed within 24 hours.</p>
              <div style={{display:"flex",gap:10,marginTop:12}}>
                <button style={{background:"none",border:`1px solid ${C.border2}`,borderRadius:8,padding:"6px 12px",color:C.cyan,cursor:"pointer",fontSize:12}}>Full Terms →</button>
                <button style={{background:"none",border:`1px solid ${C.border2}`,borderRadius:8,padding:"6px 12px",color:C.cyan,cursor:"pointer",fontSize:12}}>Privacy Policy →</button>
              </div>
            </div>}
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
  const [showSub,setShowSub]=useState(false);
  const [tab,setTab]=useState("streams");
  const streams=STREAMS.filter(s=>s.streamer===streamer.streamer);
  const allStreams=streams.length?streams:STREAMS.slice(0,3);
  return(
    <div style={{paddingBottom:60}} className="page">
      {showSub&&<SubModal stream={{...streamer,id:streamer.streamer_id||streamer.id}} fmt={fmt} onClose={()=>setShowSub(false)} onSubscribed={()=>{setSubscribed(true);setShowSub(false);}} user={user} currency={cur?.code||"USD"}/>}
      <div style={{height:180,background:`linear-gradient(135deg,${streamer.col}30,${streamer.bg||"#0D0A20"})`,position:"relative"}}>
        <button onClick={onBack} style={{position:"absolute",top:14,left:14,background:"rgba(0,0,0,.5)",border:"none",borderRadius:10,padding:"8px",cursor:"pointer",display:"flex",backdropFilter:"blur(6px)"}}><Ico n="back" s={18} c="#fff"/></button>
        <div style={{position:"absolute",bottom:-40,left:24}}>
          <div className="avRing">
            {streamer.avatar_url?<img src={streamer.avatar_url} style={{width:80,height:80,borderRadius:"50%",objectFit:"cover"}}/>:<Av ch={streamer.av} sz={80} g={`linear-gradient(135deg,${streamer.col},${C.purple})`}/>}
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
              {[[(((streamer.viewers||0)/1000).toFixed(1)+"K"),"Viewers"],[fmt((streamer.gifts||0)*.9),"Earned"],["348","Followers"]].map(([v,l])=>(<div key={l}><div className="exo" style={{fontWeight:900,fontSize:16}}>{v}</div><div style={{fontSize:11,color:C.muted}}>{l}</div></div>))}
            </div>
          </div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            {streamer.live&&<button className="btn btnR" style={{padding:"10px 18px",fontSize:13,display:"flex",alignItems:"center",gap:6}} onClick={()=>onStream(streamer)}><div className="liveDot" style={{width:6,height:6}}/>Watch Live</button>}
            <button className={`btn ${subscribed?"btnS":"btnP"}`} style={{padding:"10px 18px",fontSize:13}} onClick={()=>{if(!user){onAuthRequired();return;}if(subscribed)return;setShowSub(true);}}>
              {subscribed?<span style={{display:"flex",alignItems:"center",gap:5}}><Ico n="check" s={13} c="#06060F" sw={3}/>Subscribed</span>:"Subscribe"}
            </button>
          </div>
        </div>
        <div style={{display:"flex",gap:4,marginBottom:20,background:C.card2,borderRadius:12,padding:4,maxWidth:360}}>
          {["streams","about"].map(t=>(<button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:"8px",borderRadius:9,border:"none",background:tab===t?C.card:"transparent",color:tab===t?C.cyan:C.muted,fontWeight:700,fontSize:13,cursor:"pointer",textTransform:"capitalize"}}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>))}
        </div>
        {tab==="streams"&&<div>
          {allStreams.map((s,i)=>(
            <div key={i} className="card" style={{padding:"13px",marginBottom:10,display:"flex",gap:12,alignItems:"center",cursor:"pointer"}} onClick={()=>onStream(s)}>
              <div style={{width:70,height:48,borderRadius:10,background:`linear-gradient(135deg,${s.bg},#000)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{s.live?<div className="liveDot"/>:<Ico n="play" s={18} c="rgba(255,255,255,.6)"/>}</div>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.title}</div><div style={{fontSize:11,color:C.muted,marginTop:3}}>{(s.viewers/1000).toFixed(1)}K viewers · {s.cat}</div></div>
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
  const [notifications,setNotifications]=useState([
    {id:1,type:"gift",msg:"KofiBeats sent you a Star gift",time:"2m ago",read:false,icon:"star"},
    {id:2,type:"sub",msg:"Ama_G subscribed to your channel",time:"14m ago",read:false,icon:"users"},
    {id:3,type:"live",msg:"TechWithAma just went live",time:"1h ago",read:true,icon:"bell"},
    {id:4,type:"gift",msg:"Nana_K sent you a Diamond gift",time:"2h ago",read:true,icon:"diamond"},
    {id:5,type:"sub",msg:"Kofi_A subscribed — monthly plan",time:"3h ago",read:true,icon:"users"},
  ]);
  const [viewing,setViewing]=useState(null);
  const [isStreamer,setIsStreamer]=useState(()=>localStorage.getItem("gift3rs_is_streamer")==="true");
  const [showBecome,setShowBecome]=useState(false);
  const [user,setUser]=useState(null);
  const [showAuth,setShowAuth]=useState(false);
  const [search,setSearch]=useState("");
  const [topAvatar,setTopAvatar]=useState("");
  const fetchAvatar=useCallback(async(u)=>{if(!u)return;const {data}=await supabase.from("profiles").select("avatar_url,is_streamer,fee_paid").eq("id",u.id).single();if(data?.avatar_url)setTopAvatar(data.avatar_url);if(data?.is_streamer||data?.fee_paid){setIsStreamer(true);localStorage.setItem("gift3rs_is_streamer","true");}},[]);
  useEffect(()=>{document.body.classList.toggle("light",!darkMode);document.body.style.background=darkMode?"#06060F":"#F0F2FF";document.body.style.color=darkMode?"#EEEEFF":"#1A1A3E";},[darkMode]);
  useEffect(()=>{const handler=(e)=>{if(!e.target.closest("[data-dropdown]")){setShowNotifs(false);setShowCurrencyPicker(false);setShowMenu(false);}};document.addEventListener("mousedown",handler);return()=>document.removeEventListener("mousedown",handler);},[]);
  useEffect(()=>{if(!user)return;const ch=supabase.channel("notifs").on("postgres_changes",{event:"INSERT",schema:"public",table:"gifts",filter:`receiver_id=eq.${user.id}`},(p)=>{playNotifSound("gift");setNotifications(n=>[{id:Date.now(),type:"gift",msg:`Someone sent you a ${p.new.emoji} gift!`,time:"just now",read:false,icon:"gift"},...n.slice(0,19)]);}).on("postgres_changes",{event:"INSERT",schema:"public",table:"subscriptions",filter:`streamer_id=eq.${user.id}`},()=>{playNotifSound("sub");setNotifications(n=>[{id:Date.now(),type:"sub",msg:"Someone subscribed to your channel!",time:"just now",read:false,icon:"users"},...n.slice(0,19)]);}).subscribe();return()=>supabase.removeChannel(ch);},[user]);
  useEffect(()=>{supabase.auth.getSession().then(({data:{session}})=>{setUser(session?.user??null);fetchAvatar(session?.user);});const {data:{subscription}}=supabase.auth.onAuthStateChange((_,session)=>{setUser(session?.user??null);if(session?.user){setShowAuth(false);fetchAvatar(session.user);}});return()=>subscription.unsubscribe();},[fetchAvatar]);
  const mobileTabs=[{id:"home",icon:"home",label:"HOME"},{id:"search",icon:"search",label:"SEARCH"},{id:"live",icon:"mic",label:"LIVE",special:true},{id:"dash",icon:"trending",label:"EARN"},{id:"prof",icon:"profile",label:"PROFILE"}];
  if(viewingProfile&&!viewing)return(<><GS/>{showAuth&&<AuthModal onClose={()=>setShowAuth(false)} onLogin={setUser}/>}<StreamerProfile streamer={viewingProfile} fmt={fmt} onBack={()=>setViewingProfile(null)} onStream={s=>{setViewingProfile(null);setViewing(s);}} user={user} onAuthRequired={()=>setShowAuth(true)} cur={cur}/></>);
  if(viewing)return(<><GS/>{showAuth&&<AuthModal onClose={()=>setShowAuth(false)} onLogin={setUser}/>}<LiveViewer stream={viewing} fmt={fmt} onBack={()=>setViewing(null)} user={user} onAuthRequired={()=>setShowAuth(true)} cur={cur} onViewProfile={s=>{setViewing(null);setViewingProfile(s);}}/></>);
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
        {tab==="dash"&&<DashPage fmt={fmt} darkMode={darkMode}/>}
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