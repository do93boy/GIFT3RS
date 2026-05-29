import Stripe from "npm:stripe@14";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Exported so tests can inject a mock Stripe instance
export async function handleRequest(req: Request, stripe: Stripe): Promise<Response> {
  const { amountUsd, currency = "usd", metadata = {} } = await req.json();

  if (!amountUsd || amountUsd <= 0) {
    throw new Error("Invalid amount");
  }

  // Stripe metadata values must be strings
  const strMeta: Record<string, string> = {};
  for (const [k, v] of Object.entries(metadata)) {
    strMeta[k] = String(v ?? "");
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amountUsd * 100), // convert dollars to cents
    currency: currency.toLowerCase(),
    metadata: strMeta,
    automatic_payment_methods: { enabled: true },
  });

  return new Response(
    JSON.stringify({ clientSecret: paymentIntent.client_secret }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
      apiVersion: "2024-06-20",
    });
    return await handleRequest(req, stripe);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
