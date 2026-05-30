// src/lib/payments.js — GIFT3RS Payment Module
// Paystack (Africa) + Stripe (International)
//
// ⚠ TEST_MODE = true  →  payments are SIMULATED (no real money moves).
//   Set to false before going live in production.

import { supabase } from "./supabase";

export const PAYMENT_TEST_MODE = true;

const PAYSTACK_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;
const STRIPE_KEY   = import.meta.env.VITE_STRIPE_PUBLIC_KEY;

const GIFT_PLATFORM_CUT         = 0.10;
const SUBSCRIPTION_PLATFORM_CUT = 0.20;
const STREAMER_FEE_USD          = 4.99;

const RATES = {
  GHS:14.2, USD:1, GBP:0.79, NGN:1580,
  KES:129,  ZAR:18.5, EUR:0.92, CAD:1.36,
};

export const toLocal = (usd, currency="GHS") => +(usd*(RATES[currency]||1)).toFixed(2);
const toPaisa = (amt) => Math.round(amt*100);

const getProvider = (currency) =>
  ["GHS","NGN","KES","ZAR"].includes(currency) ? "paystack" : "stripe";

// ── Persist payment record ────────────────────────────────────────────────
const savePayment = async ({ userId,type,amountUsd,platformCut,recipientCut,currency,reference,metadata={} }) => {
  await supabase.from("payments").insert({
    user_id:userId, type, amount_usd:amountUsd,
    platform_cut:platformCut, recipient_cut:recipientCut,
    currency, reference, status:"success", metadata,
  });
};

// ── Paystack ──────────────────────────────────────────────────────────────
const payWithPaystack = ({ email,amountLocal,currency,reference,metadata,onSuccess,onCancel }) =>
  new Promise((resolve,reject) => {
    const init = () => {
      const h = window.PaystackPop.setup({
        key:PAYSTACK_KEY, email, amount:toPaisa(amountLocal), currency, ref:reference, metadata,
        onSuccess: async (tx) => { await onSuccess?.(tx); resolve(tx); },
        onCancel:  () => { onCancel?.(); reject(new Error("Payment cancelled")); },
      });
      h.openIframe();
    };
    if (window.PaystackPop) { init(); }
    else {
      const s = document.createElement("script");
      s.src = "https://js.paystack.co/v2/inline.js";
      s.onload = init;
      s.onerror = () => reject(new Error("Failed to load Paystack"));
      document.head.appendChild(s);
    }
  });

// ── Stripe ────────────────────────────────────────────────────────────────
const showStripeModal = (stripe,clientSecret,description,amountUsd) =>
  new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(4,4,18,.85);backdrop-filter:blur(10px);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;";
    const box = document.createElement("div");
    box.style.cssText = "background:#0B0B1C;border-radius:20px;width:100%;max-width:460px;border:1px solid #28285A;padding:24px;font-family:'Plus Jakarta Sans',sans-serif;";
    box.innerHTML = `
      <div style="margin-bottom:18px;">
        <div style="font-size:18px;font-weight:900;color:#EEEEFF;font-family:'Exo 2',sans-serif;">Complete Payment</div>
        <div style="font-size:13px;color:#6868A8;margin-top:4px;">${description} &nbsp;·&nbsp; <strong style="color:#EEEEFF;">$${amountUsd.toFixed(2)} USD</strong></div>
      </div>
      <div id="stripe-pe" style="margin-bottom:14px;"></div>
      <div id="stripe-err" style="color:#FF6BAE;font-size:13px;margin-bottom:10px;min-height:18px;"></div>
      <button id="stripe-pay" style="width:100%;padding:14px;border-radius:12px;border:none;background:linear-gradient(135deg,#00E5FF,#4DA6FF);color:#06060F;font-weight:900;font-size:15px;cursor:pointer;font-family:inherit;margin-bottom:10px;">Pay $${amountUsd.toFixed(2)}</button>
      <button id="stripe-cancel" style="width:100%;padding:12px;border-radius:12px;border:1px solid #28285A;background:#14142E;color:#EEEEFF;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit;">Cancel</button>`;
    overlay.appendChild(box); document.body.appendChild(overlay);
    const elements = stripe.elements({ clientSecret, appearance:{theme:"night",variables:{colorBackground:"#101026",colorText:"#EEEEFF",colorPrimary:"#00E5FF",borderRadius:"10px",fontFamily:"'Plus Jakarta Sans',sans-serif"}} });
    const pe = elements.create("payment"); pe.mount(box.querySelector("#stripe-pe"));
    const cleanup = () => { pe.destroy(); document.body.removeChild(overlay); };
    box.querySelector("#stripe-pay").addEventListener("click", async () => {
      const btn=box.querySelector("#stripe-pay"),err=box.querySelector("#stripe-err");
      btn.disabled=true; btn.textContent="Processing…"; err.textContent="";
      const r = await stripe.confirmPayment({ elements, confirmParams:{return_url:window.location.href}, redirect:"if_required" });
      if (r.error) { err.textContent=r.error.message; btn.disabled=false; btn.textContent=`Pay $${amountUsd.toFixed(2)}`; }
      else { cleanup(); resolve(r); }
    });
    box.querySelector("#stripe-cancel").addEventListener("click", () => { cleanup(); resolve({cancelled:true}); });
  });

const payWithStripe = async ({ amountUsd,description,metadata={},onSuccess,onCancel }) => {
  const { loadStripe } = await import("@stripe/stripe-js");
  const stripe = await loadStripe(STRIPE_KEY);
  if (!stripe) throw new Error("Stripe failed to load");
  const { data,error } = await supabase.functions.invoke("create-payment-intent",{ body:{amountUsd,currency:"usd",metadata} });
  if (error||data?.error) throw new Error(error?.message||data?.error||"Failed to create payment");
  const result = await showStripeModal(stripe, data.clientSecret, description, amountUsd);
  if (result.cancelled) { onCancel?.(); throw new Error("Payment cancelled"); }
  if (result.paymentIntent?.status==="succeeded") { await onSuccess?.({reference:result.paymentIntent.id}); return {reference:result.paymentIntent.id}; }
  throw new Error("Payment incomplete");
};

// Insert a gift resiliently: try with all fields, and if the table is missing
// optional columns (currency_code / sender_username), retry with core columns.
const saveGift = async (full) => {
  let { error } = await supabase.from("gifts").insert(full);
  if (error) {
    const { sender_id, receiver_id, stream_id, amount_usd, emoji, message, platform_cut, streamer_cut } = full;
    const r2 = await supabase.from("gifts").insert({ sender_id, receiver_id, stream_id, amount_usd, emoji, message, platform_cut, streamer_cut });
    error = r2.error;
  }
  return { error };
};

// ─────────────────────────────────────────────────────────────
// 1. SEND GIFT
// ─────────────────────────────────────────────────────────────
export const sendGift = async ({ senderId,senderEmail,receiverId,streamId,amountUsd,emoji,message,currency="GHS",onSuccess,onCancel }) => {
  const platformCut = +(amountUsd*GIFT_PLATFORM_CUT).toFixed(2);
  const streamerCut = +(amountUsd*(1-GIFT_PLATFORM_CUT)).toFixed(2);
  const reference   = `gift_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const giftRow = {
    sender_id:senderId, receiver_id:receiverId, stream_id:streamId,
    amount_usd:amountUsd, emoji, message:message||"",
    platform_cut:platformCut, streamer_cut:streamerCut, currency_code:currency,
    sender_username: senderEmail?.split("@")[0]||"Viewer",
  };

  // ── TEST MODE: skip real payment ──────────────────────────
  if (PAYMENT_TEST_MODE) {
    await new Promise(r => setTimeout(r, 1200));
    const { error } = await saveGift(giftRow);
    if (error) { alert("Gift failed to save: "+error.message); return; }
    onSuccess?.({ reference:"test_"+Date.now(), amountUsd, streamerCut, platformCut, emoji });
    return;
  }

  const provider = getProvider(currency);
  const amountLocal = toLocal(amountUsd, currency);
  try {
    const handleSuccess = async (tx) => {
      await savePayment({ userId:senderId, type:"gift", amountUsd, platformCut, recipientCut:streamerCut, currency, reference:tx.reference||reference, metadata:{receiverId,streamId,emoji,message} });
      await saveGift(giftRow);
      onSuccess?.({ amountUsd, streamerCut, platformCut, emoji });
    };
    if (provider==="paystack") {
      await payWithPaystack({ email:senderEmail, amountLocal, currency, reference, metadata:{type:"gift",senderId,receiverId,streamId,emoji,message}, onSuccess:handleSuccess, onCancel });
    } else {
      await payWithStripe({ amountUsd, description:`Gift ${emoji} to streamer`, metadata:{type:"gift",senderId,receiverId,streamId,emoji,message:message||""}, onSuccess:handleSuccess, onCancel });
    }
  } catch (err) {
    if (err.message!=="Payment cancelled") alert("Payment failed: "+err.message);
  }
};

// ─────────────────────────────────────────────────────────────
// 2. SUBSCRIBE TO STREAMER
// ─────────────────────────────────────────────────────────────
// Activate a subscription WITHOUT relying on a unique constraint:
// reuse an existing row (active or cancelled) if present, else insert.
// This makes subscribe → cancel → resubscribe work every time.
const saveSubscription = async ({ subscriberId, streamerId, plan, priceUsd }) => {
  const { data: existing, error: selErr } = await supabase
    .from("subscriptions").select("id")
    .eq("subscriber_id", subscriberId).eq("streamer_id", streamerId).limit(1);
  if (selErr) return { error: selErr };
  if (existing && existing.length) {
    const { error } = await supabase.from("subscriptions")
      .update({ plan, price_usd: priceUsd, status: "active" })
      .eq("id", existing[0].id);
    return { error };
  }
  const { error } = await supabase.from("subscriptions")
    .insert({ subscriber_id: subscriberId, streamer_id: streamerId, plan, price_usd: priceUsd, status: "active" });
  return { error };
};

export const subscribeToStreamer = async ({ subscriberId,subscriberEmail,streamerId,plan,priceUsd,currency="GHS",onSuccess,onCancel }) => {
  const platformCut = +(priceUsd*SUBSCRIPTION_PLATFORM_CUT).toFixed(2);
  const streamerCut = +(priceUsd*(1-SUBSCRIPTION_PLATFORM_CUT)).toFixed(2);
  const reference   = `sub_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  // ── TEST MODE ─────────────────────────────────────────────
  if (PAYMENT_TEST_MODE) {
    await new Promise(r => setTimeout(r, 1200));
    const { error } = await saveSubscription({ subscriberId, streamerId, plan, priceUsd });
    if (error) { alert("Subscription failed to save: "+error.message); return; }
    onSuccess?.({ plan, priceUsd, streamerCut });
    return;
  }

  const provider = getProvider(currency);
  const amountLocal = toLocal(priceUsd, currency);
  try {
    const handleSuccess = async (tx) => {
      await savePayment({ userId:subscriberId, type:"subscription", amountUsd:priceUsd, platformCut, recipientCut:streamerCut, currency, reference:tx.reference||reference, metadata:{receiverId:streamerId,plan} });
      const { error } = await saveSubscription({ subscriberId, streamerId, plan, priceUsd });
      if (error) { alert("Subscription failed to save: "+error.message); return; }
      onSuccess?.({ plan, priceUsd, streamerCut });
    };
    if (provider==="paystack") {
      await payWithPaystack({ email:subscriberEmail, amountLocal, currency, reference, metadata:{type:"subscription",subscriberId,streamerId,plan}, onSuccess:handleSuccess, onCancel });
    } else {
      await payWithStripe({ amountUsd:priceUsd, description:`${plan} subscription`, metadata:{type:"subscription",subscriberId,streamerId,plan}, onSuccess:handleSuccess, onCancel });
    }
  } catch (err) {
    if (err.message!=="Payment cancelled") alert("Subscription failed: "+err.message);
  }
};

// ─────────────────────────────────────────────────────────────
// 3. PAY STREAMER FEE ($4.99)
// ─────────────────────────────────────────────────────────────
export const payStreamerFee = async ({ userId,userEmail,currency="GHS",onSuccess,onCancel }) => {
  const reference = `fee_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  // ── TEST MODE ─────────────────────────────────────────────
  if (PAYMENT_TEST_MODE) {
    await new Promise(r => setTimeout(r, 1200));
    await supabase.from("profiles").update({ is_streamer:true, fee_paid:true, verified:true }).eq("id", userId);
    onSuccess?.();
    return;
  }

  const provider = getProvider(currency);
  const amountLocal = toLocal(STREAMER_FEE_USD, currency);
  try {
    const handleSuccess = async (tx) => {
      await savePayment({ userId, type:"streamer_fee", amountUsd:STREAMER_FEE_USD, platformCut:STREAMER_FEE_USD, recipientCut:0, currency, reference:tx.reference||reference, metadata:{userId} });
      await supabase.from("profiles").update({ is_streamer:true, fee_paid:true, verified:true }).eq("id", userId);
      onSuccess?.();
    };
    if (provider==="paystack") {
      await payWithPaystack({ email:userEmail, amountLocal, currency, reference, metadata:{type:"streamer_fee",userId}, onSuccess:handleSuccess, onCancel });
    } else {
      await payWithStripe({ amountUsd:STREAMER_FEE_USD, description:"GIFT3RS Streamer Setup Fee", metadata:{type:"streamer_fee",userId}, onSuccess:handleSuccess, onCancel });
    }
  } catch (err) {
    if (err.message!=="Payment cancelled") alert("Payment failed: "+err.message);
  }
};

// ─────────────────────────────────────────────────────────────
// 4. GET EARNINGS
// ─────────────────────────────────────────────────────────────
// Aggregate earnings directly from the gifts + subscriptions tables.
// (In test mode no `payments` rows are written, so we read source tables.)
export const getEarnings = async (streamerId) => {
  const giftRes = await supabase.from("gifts").select("amount_usd,streamer_cut").eq("receiver_id", streamerId);
  const subRes  = await supabase.from("subscriptions").select("price_usd,plan,status").eq("streamer_id", streamerId).eq("status", "active");

  const gifts = giftRes.data || [];
  const subs  = subRes.data || [];

  // Streamer keeps 90% of gifts, 80% of subscriptions
  const giftEarnings = gifts.reduce((s, g) => s + (g.streamer_cut != null ? g.streamer_cut : (g.amount_usd || 0) * 0.9), 0);
  const subEarnings  = subs.reduce((s, sub) => s + (sub.price_usd || 0) * 0.8, 0);

  return {
    total:         +(giftEarnings + subEarnings).toFixed(2),
    gifts:         +giftEarnings.toFixed(2),
    subscriptions: +subEarnings.toFixed(2),
    giftCount:     gifts.length,
    subCount:      subs.length,
  };
};

export const checkSubscription = async (subscriberId,streamerId) => {
  const { data } = await supabase.from("subscriptions").select("*").eq("subscriber_id",subscriberId).eq("streamer_id",streamerId).eq("status","active").single();
  return !!data;
};
