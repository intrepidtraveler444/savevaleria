/* =============================================================================
   Payment routes.
   -----------------------------------------------------------------------------
   Two supported models (config.payments.provider):

     • "gofundme" (default) — the winner pays their bid on the family's GoFundMe
       page (so 100% flows into the existing campaign → the family's bank). We
       can't auto-verify a GoFundMe donation (no API), so the winner marks it
       "sent" and an admin confirms receipt, which releases collection details.

     • "mock" / "stripe" — card checkout that confirms automatically
       (see lib/payments.js). Kept for local testing / future card payments.
   ============================================================================= */
"use strict";
const cfg = require("../config");
const store = require("../lib/store");
const auth = require("../lib/auth");
const payments = require("../lib/payments");
const { notify } = require("../lib/notify");
const { markPaid } = require("../lib/settle");
const { ok, fail, readJson } = require("../lib/http");

function paymentForUser(res, user, itemId) {
  const item = store.byId("items", itemId);
  if (!item) { fail(res, 404, "Item not found."); return null; }
  if (item.winnerId !== user.id) { fail(res, 403, "Only the winning bidder can pay for this item."); return null; }
  const payment = store.find("payments", (p) => p.itemId === item.id && p.bidderId === user.id);
  if (!payment) { fail(res, 404, "No payment is due for this item."); return null; }
  return { item, payment };
}

module.exports = function register(router) {

  // Details a winner needs on the pay page (their own payment only).
  router.get("/api/payments/:id", (req, res) => {
    const user = auth.requireAuth(req, res); if (!user) return;
    const payment = store.byId("payments", req.params.id);
    if (!payment) return fail(res, 404, "Payment not found.");
    if (payment.bidderId !== user.id) return fail(res, 403, "That isn't your payment.");
    const item = store.byId("items", payment.itemId);
    ok(res, {
      payment: { id: payment.id, amount: payment.amount, status: payment.status },
      itemTitle: item ? item.title : "your item",
      provider: cfg.payments.provider,
      gofundmeUrl: cfg.payments.gofundmeDonateUrl || cfg.payments.gofundmeUrl,
    });
  });

  // Winner starts checkout. Returns where to send them.
  router.post("/api/payments/checkout", async (req, res) => {
    const user = auth.requireAuth(req, res); if (!user) return;
    const body = await readJson(req).catch(() => ({}));
    const ctx = paymentForUser(res, user, body.itemId); if (!ctx) return;
    const { item, payment } = ctx;
    if (payment.status === "paid") return ok(res, { alreadyPaid: true });

    // GoFundMe model: send the winner to our pay page (which links to GoFundMe).
    if (cfg.payments.provider === "gofundme") {
      return ok(res, {
        mode: "gofundme",
        url: `/app/pay.html?payment=${encodeURIComponent(payment.id)}`,
        amount: payment.amount,
        gofundmeUrl: cfg.payments.gofundmeDonateUrl || cfg.payments.gofundmeUrl,
      });
    }

    // Card model (mock/stripe): create a checkout session.
    try {
      const provider = payments.active();
      const { url, ref } = await provider.createCheckout({ payment, item, user });
      store.update("payments", payment.id, { provider: provider.name, ref });
      ok(res, { mode: "card", url, provider: provider.name });
    } catch (e) {
      fail(res, 502, "Could not start checkout: " + e.message, "payment_error");
    }
  });

  // GoFundMe model: winner reports they've donated their bid on GoFundMe.
  // Moves the payment to "submitted" (awaiting admin confirmation) and pings admins.
  router.post("/api/payments/submitted", async (req, res) => {
    const user = auth.requireAuth(req, res); if (!user) return;
    const body = await readJson(req).catch(() => ({}));
    const payment = store.byId("payments", body.paymentId);
    if (!payment) return fail(res, 404, "Payment not found.");
    if (payment.bidderId !== user.id) return fail(res, 403, "That isn't your payment.");
    if (payment.status === "paid") return ok(res, { status: "paid" });

    store.update("payments", payment.id, { status: "submitted", submittedAt: new Date().toISOString(), provider: "gofundme" });
    const item = store.byId("items", payment.itemId);
    // Notify every admin that a payment needs confirming.
    for (const a of store.filter("users", (u) => u.role === "admin")) {
      notify(a.id, "payment-to-confirm", `A winner has marked their GoFundMe payment for "${item ? item.title : "an item"}" ($${payment.amount}). Please confirm it was received.`, { itemId: payment.itemId });
    }
    ok(res, { status: "submitted" });
  });

  // Card model (mock/stripe): auto-confirm from the checkout page / provider.
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
      const { item, instructions } = markPaid(payment);
      ok(res, { paid: true, item, instructions });
    } catch (e) {
      fail(res, 502, "Could not confirm payment: " + e.message, "payment_error");
    }
  });

  // Stripe webhook endpoint (stub) for future card payments.
  router.post("/api/payments/webhook", async (_req, res) => {
    ok(res, { received: true });
  });
};
