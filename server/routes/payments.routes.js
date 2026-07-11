/* =============================================================================
   Payment routes — a winning bidder pays; on success the item moves to "paid"
   and both parties get collection/delivery instructions. Provider-agnostic
   (see lib/payments.js). Mock mode works locally with no keys or real money.
   ============================================================================= */
"use strict";
const cfg = require("../config");
const store = require("../lib/store");
const auth = require("../lib/auth");
const payments = require("../lib/payments");
const { notify } = require("../lib/notify");
const { ok, fail, readJson } = require("../lib/http");

function fulfilmentInstructions(item) {
  const c = item.collection || {};
  const donor = store.byId("users", item.donorId);
  return {
    location: c.location,
    shippingAvailable: c.shippingAvailable,
    shippingCost: c.shippingCost,
    times: c.times,
    instructions: c.instructions,
    contactMethod: c.contactMethod,
    donorName: item.contact ? item.contact.name : (donor ? donor.name : null),
    donorEmail: item.contact ? item.contact.email : (donor ? donor.email : null),
    donorPhone: item.contact ? item.contact.phone : null,
  };
}

module.exports = function register(router) {

  // Winner starts checkout. Returns a URL to redirect to.
  router.post("/api/payments/checkout", async (req, res) => {
    const user = auth.requireAuth(req, res); if (!user) return;
    const body = await readJson(req).catch(() => ({}));
    const item = store.byId("items", body.itemId);
    if (!item) return fail(res, 404, "Item not found.");
    if (item.winnerId !== user.id) return fail(res, 403, "Only the winning bidder can pay for this item.");

    const payment = store.find("payments", (p) => p.itemId === item.id && p.bidderId === user.id);
    if (!payment) return fail(res, 404, "No payment is due for this item.");
    if (payment.status === "paid") return ok(res, { alreadyPaid: true });

    try {
      const provider = payments.active();
      const { url, ref } = await provider.createCheckout({ payment, item, user });
      store.update("payments", payment.id, { provider: provider.name, ref });
      ok(res, { url, provider: provider.name, gofundmeUrl: cfg.payments.gofundmeUrl });
    } catch (e) {
      fail(res, 502, "Could not start checkout: " + e.message, "payment_error");
    }
  });

  // Confirm a payment (mock: called by the simulated checkout page;
  // Stripe: also verified here, and/or via webhook).
  router.post("/api/payments/confirm", async (req, res) => {
    const user = auth.requireAuth(req, res); if (!user) return;
    const body = await readJson(req).catch(() => ({}));
    const payment = store.byId("payments", body.paymentId);
    if (!payment) return fail(res, 404, "Payment not found.");
    if (payment.bidderId !== user.id) return fail(res, 403, "That isn't your payment.");
    if (payment.status === "paid") return ok(res, { paid: true });

    try {
      const provider = payments.active();
      const { paid } = await provider.confirm(payment.ref);
      if (!paid) return fail(res, 402, "Payment not completed.", "not_paid");

      store.update("payments", payment.id, { status: "paid", paidAt: new Date().toISOString() });
      const item = store.update("items", payment.itemId, { status: "paid" });

      // Deliver collection/delivery instructions to both parties.
      const instructions = fulfilmentInstructions(item);
      notify(payment.bidderId, "payment-received",
        `Payment received — thank you! Here's how to collect "${item.title}": ${instructions.location}. Contact: ${instructions.contactMethod}.`,
        { itemId: item.id });
      notify(item.donorId, "buyer-paid",
        `"${item.title}" has been paid for. Please arrange collection/delivery with the winner.`,
        { itemId: item.id });

      ok(res, { paid: true, item, instructions, gofundmeUrl: cfg.payments.gofundmeUrl });
    } catch (e) {
      fail(res, 502, "Could not confirm payment: " + e.message, "payment_error");
    }
  });

  // Stripe webhook endpoint (stub). In production, verify the signature and mark
  // the payment paid here so fulfilment doesn't depend on the browser redirect.
  router.post("/api/payments/webhook", async (req, res) => {
    // TODO(production): verify Stripe-Signature, then update the matching payment.
    ok(res, { received: true });
  });
};
