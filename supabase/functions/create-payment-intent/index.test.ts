// Run with: deno test --allow-env supabase/functions/create-payment-intent/index.test.ts
import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { handleRequest } from "./index.ts";

// ── Mock Stripe ────────────────────────────────────────────────
function makeMockStripe(overrides: Record<string, unknown> = {}) {
  return {
    paymentIntents: {
      create: async (params: { amount: number; currency: string; metadata: Record<string, string> }) => ({
        client_secret: `pi_test_${params.amount}_${params.currency}_secret`,
        ...overrides,
      }),
    },
  } as any;
}

function makeRequest(body: unknown, method = "POST") {
  return new Request("https://mock.supabase.co/functions/v1/create-payment-intent", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Tests ──────────────────────────────────────────────────────

Deno.test("returns clientSecret for a valid request", async () => {
  const stripe = makeMockStripe();
  const req = makeRequest({ amountUsd: 10, currency: "usd", metadata: { type: "gift" } });

  const res = await handleRequest(req, stripe);
  const body = await res.json();

  assertEquals(res.status, 200);
  // $10 → 1000 cents
  assertEquals(body.clientSecret, "pi_test_1000_usd_secret");
});

Deno.test("converts dollars to cents correctly", async () => {
  let capturedAmount = 0;
  const stripe = {
    paymentIntents: {
      create: async (params: { amount: number }) => {
        capturedAmount = params.amount;
        return { client_secret: "pi_test_secret" };
      },
    },
  } as any;

  await handleRequest(makeRequest({ amountUsd: 4.99 }), stripe);
  assertEquals(capturedAmount, 499);
});

Deno.test("lowercases currency", async () => {
  let capturedCurrency = "";
  const stripe = {
    paymentIntents: {
      create: async (params: { currency: string }) => {
        capturedCurrency = params.currency;
        return { client_secret: "pi_test_secret" };
      },
    },
  } as any;

  await handleRequest(makeRequest({ amountUsd: 5, currency: "USD" }), stripe);
  assertEquals(capturedCurrency, "usd");
});

Deno.test("coerces metadata values to strings", async () => {
  let capturedMeta: Record<string, string> = {};
  const stripe = {
    paymentIntents: {
      create: async (params: { metadata: Record<string, string> }) => {
        capturedMeta = params.metadata;
        return { client_secret: "pi_test_secret" };
      },
    },
  } as any;

  await handleRequest(
    makeRequest({ amountUsd: 5, metadata: { userId: 123, flag: true, nothing: null } }),
    stripe,
  );

  assertEquals(capturedMeta.userId, "123");
  assertEquals(capturedMeta.flag, "true");
  assertEquals(capturedMeta.nothing, "");
});

Deno.test("defaults currency to usd when omitted", async () => {
  let capturedCurrency = "";
  const stripe = {
    paymentIntents: {
      create: async (params: { currency: string }) => {
        capturedCurrency = params.currency;
        return { client_secret: "pi_test_secret" };
      },
    },
  } as any;

  await handleRequest(makeRequest({ amountUsd: 5 }), stripe);
  assertEquals(capturedCurrency, "usd");
});

Deno.test("throws on zero amount", async () => {
  let threw = false;
  try {
    await handleRequest(makeRequest({ amountUsd: 0 }), makeMockStripe());
  } catch (e) {
    threw = true;
    assertStringIncludes((e as Error).message, "Invalid amount");
  }
  assertEquals(threw, true);
});

Deno.test("throws on negative amount", async () => {
  let threw = false;
  try {
    await handleRequest(makeRequest({ amountUsd: -5 }), makeMockStripe());
  } catch (e) {
    threw = true;
    assertStringIncludes((e as Error).message, "Invalid amount");
  }
  assertEquals(threw, true);
});

Deno.test("throws when amountUsd is missing", async () => {
  let threw = false;
  try {
    await handleRequest(makeRequest({ currency: "usd" }), makeMockStripe());
  } catch (e) {
    threw = true;
    assertStringIncludes((e as Error).message, "Invalid amount");
  }
  assertEquals(threw, true);
});

Deno.test("passes metadata to Stripe unchanged (as strings)", async () => {
  const stripe = makeMockStripe();
  const req = makeRequest({
    amountUsd: 25,
    currency: "usd",
    metadata: { type: "gift", senderId: "u1", receiverId: "r1", emoji: "crown" },
  });

  const res = await handleRequest(req, stripe);
  assertEquals(res.status, 200);
});

Deno.test("response includes CORS headers", async () => {
  const stripe = makeMockStripe();
  const res = await handleRequest(makeRequest({ amountUsd: 5 }), stripe);

  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
  assertStringIncludes(
    res.headers.get("Access-Control-Allow-Headers") ?? "",
    "content-type",
  );
});

Deno.test("response Content-Type is application/json", async () => {
  const stripe = makeMockStripe();
  const res = await handleRequest(makeRequest({ amountUsd: 5 }), stripe);
  assertStringIncludes(res.headers.get("Content-Type") ?? "", "application/json");
});
