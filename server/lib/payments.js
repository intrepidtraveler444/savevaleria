/* =============================================================================
   payments.js — provider-agnostic payment layer.
   -----------------------------------------------------------------------------
   WHY THIS DESIGN (read the README "Payments" section for the full rationale):

   GoFundMe does NOT expose a public payments API that lets a third-party app push
   auction proceeds into a campaign. So we cannot charge a winner's card and have
   the money land inside GoFundMe automatically. Two workable models:

     A) "mock"   — for local development / demo. Simulates a checkout + confirmation
                   with no real money, so the whole flow is testable end-to-end.

     B) "stripe" — the real, secure alternative provider. We create a Stripe Checkout
                   Session; Stripe handles card data (PCI scope stays with Stripe).
                   After payment, funds land in the campaign's Stripe account and the
                   organiser forwards the net proceeds to the GoFundMe (documented,
                   auditable). Plug in a key via STRIPE_SECRET_KEY to enable.

   Every provider implements the same interface:
     createCheckout({ payment, item, user }) -> { url, ref }
     confirm(ref) -> { paid: boolean, ref }
   so routes/payments never care which one is active.
   ============================================================================= */
"use strict";
const crypto = require("crypto");
const cfg = require("../config");

/* ------------------------------- MOCK -------------------------------------- */
const mockProvider = {
  name: "mock",
  async createCheckout({ payment }) {
    const ref = "mock_" + crypto.randomUUID();
    // A local page that simulates the card form and then calls /confirm.
    const url = `/app/checkout.html?payment=${encodeURIComponent(payment.id)}&ref=${encodeURIComponent(ref)}`;
    return { url, ref };
  },
  async confirm(ref) {
    // In mock mode, reaching confirm means the simulated payment succeeded.
    return { paid: true, ref };
  },
};

/* ------------------------------ STRIPE ------------------------------------- */
/* Real integration. Enabled when PAYMENT_PROVIDER=stripe and STRIPE_SECRET_KEY
   is set. Uses Stripe's REST API directly via fetch (no SDK dependency). */
const stripeProvider = {
  name: "stripe",
  async createCheckout({ payment, item }) {
    const key = cfg.payments.stripe.secretKey;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
    const body = new URLSearchParams({
      mode: "payment",
      success_url: cfg.payments.stripe.successUrl,
      cancel_url: cfg.payments.stripe.cancelUrl,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": cfg.payments.currency,
      "line_items[0][price_data][unit_amount]": String(Math.round(payment.amount * 100)),
      "line_items[0][price_data][product_data][name]": `Winning bid: ${item.title}`,
      "metadata[paymentId]": payment.id,
      "client_reference_id": payment.id,
    });
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const session = await res.json();
    if (!res.ok) throw new Error(session.error ? session.error.message : "Stripe error");
    return { url: session.url, ref: session.id };
  },
  async confirm(ref) {
    const key = cfg.payments.stripe.secretKey;
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions/" + ref, {
      headers: { Authorization: "Bearer " + key },
    });
    const session = await res.json();
    return { paid: session.payment_status === "paid", ref };
  },
};

const providers = { mock: mockProvider, stripe: stripeProvider };

function active() {
  return providers[cfg.payments.provider] || mockProvider;
}

module.exports = { active, providers };
