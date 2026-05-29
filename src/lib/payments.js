// src/lib/payments.js
// ─────────────────────────────────────────────────────────────
// GIFT3RS Payment Module
// Handles: Gifts, Subscriptions, Streamer Fee
// Providers: Paystack (Africa) + Stripe (International)
// ─────────────────────────────────────────────────────────────

import { supabase } from "./supabase";

const PAYSTACK_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;
const STRIPE_KEY   = import.meta.env.VITE_STRIPE_PUBLIC_KEY;

// Platform cuts
const GIFT_PLATFORM_CUT         = 0.10; // 10%
const SUBSCRIPTION_PLATFORM_CUT = 0.20; // 20%
const STREAMER_FEE_USD          = 4.99;

// Currency conversion rates (same as your app)
const RATES = {
  GHS: 14.2, USD: 1, GBP: 0.79, NGN: 1580,
  KES: 129,  ZAR: 18.5, EUR: 0.92, CAD: 1.36,
};

// Convert USD to local currency
export const toLocal = (usd, currency = "GHS") =>
  +(usd * (RATES[currency] || 1)).toFixed(2);

// Convert local amount to Paystack kobo/pesewas (smallest unit × 100)
const toPaisa = (localAmount) => Math.round(localAmount * 100);

// ─────────────────────────────────────────────────────────────
// DETECT PAYMENT PROVIDER based on currency
// Africa → Paystack | Rest of world → Stripe
// ─────────────────────────────────────────────────────────────
const getProvider = (currency) => {
  const paystackCurrencies = ["GHS", "NGN", "KES", "ZAR"];
  return paystackCurrencies.includes(currency) ? "paystack" : "stripe";
};

// ─────────────────────────────────────────────────────────────
// SAVE PAYMENT RECORD TO SUPABASE
// ─────────────────────────────────────────────────────────────
const savePayment = async ({
  userId, type, amountUsd, platformCut,
  recipientCut, currency, reference, metadata = {},
}) => {
  const { error } = await supabase.from("payments").insert({
    user_id:       userId,
    type,
    amount_usd:    amountUsd,
    platform_cut:  platformCut,
    recipient_cut: recipientCut,
    currency,
    reference,
    status:        "success",
    metadata,
  });
  if (error) console.error("Payment record error:", error);
};

// ─────────────────────────────────────────────────────────────
// PAYSTACK PAYMENT
// ─────────────────────────────────────────────────────────────
const payWithPaystack = ({ email, amountLocal, currency, reference, metadata, onSuccess, onCancel }) => {
  return new Promise((resolve, reject) => {
    const initPaystack = () => {
      const handler = window.PaystackPop.setup({
        key:       PAYSTACK_KEY,
        email,
        amount:    toPaisa(amountLocal), // in kobo/pesewas
        currency,
        ref:       reference,
        metadata,
        onSuccess: async (transaction) => {
          await onSuccess?.(transaction);
          resolve(transaction);
        },
        onCancel: () => {
          onCancel && onCancel();
          reject(new Error("Payment cancelled"));
        },
      });
      handler.openIframe();
    };
    if (window.PaystackPop) {
      initPaystack();
    } else {
      const script = document.createElement("script");
      script.src = "https://js.paystack.co/v2/inline.js";
      script.onload = initPaystack;
      script.onerror = () => reject(new Error("Failed to load Paystack"));
      document.head.appendChild(script);
    }
  });
};

// ─────────────────────────────────────────────────────────────
// STRIPE — vanilla DOM modal with Stripe Payment Element
// ─────────────────────────────────────────────────────────────
const showStripeModal = (stripe, clientSecret, description, amountUsd) =>
  new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(4,4,18,.85);backdrop-filter:blur(10px);" +
      "z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;";

    const box = document.createElement("div");
    box.style.cssText =
      "background:#0B0B1C;border-radius:20px;width:100%;max-width:460px;" +
      "border:1px solid #28285A;padding:24px;font-family:'Plus Jakarta Sans',sans-serif;";

    box.innerHTML = `
      <div style="margin-bottom:18px;">
        <div style="font-size:18px;font-weight:900;color:#EEEEFF;font-family:'Exo 2',sans-serif;">
          Complete Payment
        </div>
        <div style="font-size:13px;color:#6868A8;margin-top:4px;">
          ${description} &nbsp;·&nbsp;
          <strong style="color:#EEEEFF;">$${amountUsd.toFixed(2)} USD</strong>
        </div>
      </div>
      <div id="stripe-pe" style="margin-bottom:14px;"></div>
      <div id="stripe-err" style="color:#FF6BAE;font-size:13px;margin-bottom:10px;min-height:18px;"></div>
      <button id="stripe-pay"
        style="width:100%;padding:14px;border-radius:12px;border:none;
               background:linear-gradient(135deg,#00E5FF,#4DA6FF);color:#06060F;
               font-weight:900;font-size:15px;cursor:pointer;font-family:inherit;margin-bottom:10px;">
        Pay $${amountUsd.toFixed(2)}
      </button>
      <button id="stripe-cancel"
        style="width:100%;padding:12px;border-radius:12px;border:1px solid #28285A;
               background:#14142E;color:#EEEEFF;font-weight:700;font-size:14px;
               cursor:pointer;font-family:inherit;">
        Cancel
      </button>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const elements = stripe.elements({
      clientSecret,
      appearance: {
        theme: "night",
        variables: {
          colorBackground: "#101026",
          colorText: "#EEEEFF",
          colorPrimary: "#00E5FF",
          borderRadius: "10px",
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        },
      },
    });

    const paymentElement = elements.create("payment");
    paymentElement.mount(box.querySelector("#stripe-pe"));

    const cleanup = () => {
      paymentElement.destroy();
      document.body.removeChild(overlay);
    };

    box.querySelector("#stripe-pay").addEventListener("click", async () => {
      const btn     = box.querySelector("#stripe-pay");
      const errEl   = box.querySelector("#stripe-err");
      btn.disabled  = true;
      btn.textContent = "Processing…";
      errEl.textContent = "";

      const result = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: window.location.href },
        redirect: "if_required",
      });

      if (result.error) {
        errEl.textContent  = result.error.message;
        btn.disabled       = false;
        btn.textContent    = `Pay $${amountUsd.toFixed(2)}`;
      } else {
        cleanup();
        resolve(result);
      }
    });

    box.querySelector("#stripe-cancel").addEventListener("click", () => {
      cleanup();
      resolve({ cancelled: true });
    });
  });

const payWithStripe = async ({ amountUsd, description, metadata = {}, onSuccess, onCancel }) => {
  const { loadStripe } = await import("@stripe/stripe-js");
  const stripe = await loadStripe(STRIPE_KEY);
  if (!stripe) throw new Error("Stripe failed to load");

  // Create PaymentIntent on the server
  const { data, error } = await supabase.functions.invoke("create-payment-intent", {
    body: { amountUsd, currency: "usd", metadata },
  });
  if (error || data?.error) {
    throw new Error(error?.message || data?.error || "Failed to create payment");
  }

  const result = await showStripeModal(stripe, data.clientSecret, description, amountUsd);

  if (result.cancelled) {
    onCancel && onCancel();
    throw new Error("Payment cancelled");
  }

  if (result.paymentIntent?.status === "succeeded") {
    await onSuccess?.({ reference: result.paymentIntent.id });
    return { reference: result.paymentIntent.id };
  }

  throw new Error("Payment incomplete");
};

// ─────────────────────────────────────────────────────────────
// 1. SEND A GIFT
// ─────────────────────────────────────────────────────────────
export const sendGift = async ({
  senderId,
  senderEmail,
  receiverId,
  streamId,
  amountUsd,
  emoji,
  message,
  currency = "GHS",
  onSuccess,
  onCancel,
}) => {
  const platformCut  = +(amountUsd * GIFT_PLATFORM_CUT).toFixed(2);
  const streamerCut  = +(amountUsd * (1 - GIFT_PLATFORM_CUT)).toFixed(2);
  const amountLocal  = toLocal(amountUsd, currency);
  const reference    = `gift_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const provider     = getProvider(currency);

  try {
    if (provider === "paystack") {
      await payWithPaystack({
        email:       senderEmail,
        amountLocal,
        currency,
        reference,
        metadata:    { type: "gift", senderId, receiverId, streamId, emoji, message },
        onSuccess:   async (tx) => {
          await savePayment({
            userId:       senderId,
            type:         "gift",
            amountUsd,
            platformCut,
            recipientCut: streamerCut,
            currency,
            reference:    tx.reference || reference,
            metadata:     { receiverId, streamId, emoji, message },
          });
          // Record gift in gifts table
          await supabase.from("gifts").insert({
            sender_id:    senderId,
            receiver_id:  receiverId,
            stream_id:    streamId,
            amount_usd:   amountUsd,
            emoji,
            message,
            platform_cut: platformCut,
            streamer_cut: streamerCut,
            currency_code: currency,
          });
          onSuccess && onSuccess({ amountUsd, streamerCut, platformCut, emoji });
        },
        onCancel,
      });
    } else {
      await payWithStripe({
        amountUsd,
        description: `Gift ${emoji} to streamer`,
        metadata: { type: "gift", senderId, receiverId, streamId, emoji, message: message || "" },
        onSuccess: async (tx) => {
          await savePayment({
            userId:       senderId,
            type:         "gift",
            amountUsd,
            platformCut,
            recipientCut: streamerCut,
            currency,
            reference:    tx.reference,
            metadata:     { receiverId, streamId, emoji, message },
          });
          await supabase.from("gifts").insert({
            sender_id:    senderId,
            receiver_id:  receiverId,
            stream_id:    streamId,
            amount_usd:   amountUsd,
            emoji,
            message,
            platform_cut: platformCut,
            streamer_cut: streamerCut,
            currency_code: currency,
          });
          onSuccess && onSuccess({ amountUsd, streamerCut, platformCut, emoji });
        },
        onCancel,
      });
    }
  } catch (err) {
    if (err.message !== "Payment cancelled") {
      alert("Payment failed: " + err.message);
    }
  }
};

// ─────────────────────────────────────────────────────────────
// 2. SUBSCRIBE TO STREAMER
// ─────────────────────────────────────────────────────────────
export const subscribeToStreamer = async ({
  subscriberId,
  subscriberEmail,
  streamerId,
  plan,           // 'weekly' | 'monthly' | 'annually'
  priceUsd,
  currency = "GHS",
  onSuccess,
  onCancel,
}) => {
  const platformCut  = +(priceUsd * SUBSCRIPTION_PLATFORM_CUT).toFixed(2);
  const streamerCut  = +(priceUsd * (1 - SUBSCRIPTION_PLATFORM_CUT)).toFixed(2);
  const amountLocal  = toLocal(priceUsd, currency);
  const reference    = `sub_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const provider     = getProvider(currency);

  try {
    const handleSuccess = async (tx) => {
      await savePayment({
        userId:       subscriberId,
        type:         "subscription",
        amountUsd:    priceUsd,
        platformCut,
        recipientCut: streamerCut,
        currency,
        reference:    tx.reference || reference,
        metadata:     { streamerId, plan },
      });
      // Save subscription record
      await supabase.from("subscriptions").upsert({
        subscriber_id: subscriberId,
        streamer_id:   streamerId,
        plan,
        price_usd:     priceUsd,
        status:        "active",
      }, { onConflict: "subscriber_id,streamer_id" });

      onSuccess && onSuccess({ plan, priceUsd, streamerCut });
    };

    if (provider === "paystack") {
      await payWithPaystack({
        email:      subscriberEmail,
        amountLocal,
        currency,
        reference,
        metadata:   { type: "subscription", subscriberId, streamerId, plan },
        onSuccess:  handleSuccess,
        onCancel,
      });
    } else {
      await payWithStripe({
        amountUsd:   priceUsd,
        description: `${plan} subscription`,
        metadata:    { type: "subscription", subscriberId, streamerId, plan },
        onSuccess:   handleSuccess,
        onCancel,
      });
    }
  } catch (err) {
    if (err.message !== "Payment cancelled") {
      alert("Subscription failed: " + err.message);
    }
  }
};

// ─────────────────────────────────────────────────────────────
// 3. PAY STREAMER FEE ($4.99 one-time)
// ─────────────────────────────────────────────────────────────
export const payStreamerFee = async ({
  userId,
  userEmail,
  currency = "GHS",
  onSuccess,
  onCancel,
}) => {
  const amountLocal = toLocal(STREAMER_FEE_USD, currency);
  const reference   = `fee_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const provider    = getProvider(currency);

  try {
    const handleSuccess = async (tx) => {
      await savePayment({
        userId,
        type:         "streamer_fee",
        amountUsd:    STREAMER_FEE_USD,
        platformCut:  STREAMER_FEE_USD, // full amount goes to platform
        recipientCut: 0,
        currency,
        reference:    tx.reference || reference,
        metadata:     { userId },
      });
      // Mark user as streamer in profiles
      await supabase.from("profiles").update({
        is_streamer:       true,
        fee_paid:          true,
        streamer_verified: true,
      }).eq("id", userId);

      onSuccess && onSuccess();
    };

    if (provider === "paystack") {
      await payWithPaystack({
        email:      userEmail,
        amountLocal,
        currency,
        reference,
        metadata:   { type: "streamer_fee", userId },
        onSuccess:  handleSuccess,
        onCancel,
      });
    } else {
      await payWithStripe({
        amountUsd:   STREAMER_FEE_USD,
        description: "GIFT3RS Streamer Setup Fee",
        metadata:    { type: "streamer_fee", userId },
        onSuccess:   handleSuccess,
        onCancel,
      });
    }
  } catch (err) {
    if (err.message !== "Payment cancelled") {
      alert("Payment failed: " + err.message);
    }
  }
};

// ─────────────────────────────────────────────────────────────
// 4. GET EARNINGS SUMMARY for a streamer
// ─────────────────────────────────────────────────────────────
export const getEarnings = async (streamerId) => {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("metadata->>receiverId", streamerId)
    .eq("status", "success");

  if (error) return { total: 0, gifts: 0, subscriptions: 0 };

  const gifts = data.filter(p => p.type === "gift");
  const subs  = data.filter(p => p.type === "subscription");

  return {
    total:         data.reduce((s, p) => s + (p.recipient_cut || 0), 0),
    gifts:         gifts.reduce((s, p) => s + (p.recipient_cut || 0), 0),
    subscriptions: subs.reduce((s, p) => s + (p.recipient_cut || 0), 0),
    giftCount:     gifts.length,
    subCount:      subs.length,
  };
};

// ─────────────────────────────────────────────────────────────
// 5. CHECK if user is already subscribed to a streamer
// ─────────────────────────────────────────────────────────────
export const checkSubscription = async (subscriberId, streamerId) => {
  const { data } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("subscriber_id", subscriberId)
    .eq("streamer_id", streamerId)
    .eq("status", "active")
    .single();
  return !!data;
};