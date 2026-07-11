/* =============================================================================
   Admin routes (role = "admin") — review queue, approve/reject/edit listings,
   manage fulfilment, resolve disputes, and view fundraising statistics.
   ============================================================================= */
"use strict";
const fs = require("fs");
const path = require("path");
const cfg = require("../config");
const store = require("../lib/store");
const auth = require("../lib/auth");
const { notify } = require("../lib/notify");
const { publicItem } = require("../lib/serialize");
const { markPaid } = require("../lib/settle");
const { ok, fail, readJson } = require("../lib/http");

function admin(req, res) { return auth.requireAuth(req, res, { role: "admin" }); }

module.exports = function register(router) {

  /* ---- Listings management ---- */
  router.get("/api/admin/items", (req, res) => {
    if (!admin(req, res)) return;
    const status = req.query.get("status") || "all";
    let items = store.all("items").slice();
    if (status !== "all") items = items.filter((i) => i.status === status);
    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    ok(res, { items: items.map((i) => publicItem(i, { includeDonor: true })) });
  });

  // Approve a pending item → schedule it live.
  router.post("/api/admin/items/:id/approve", async (req, res) => {
    if (!admin(req, res)) return;
    const item = store.byId("items", req.params.id);
    if (!item) return fail(res, 404, "Item not found.");
    const body = await readJson(req).catch(() => ({}));

    const startingBid = Number(body.startingBid) >= 1 ? Number(body.startingBid) : 1;
    const durationHours = Number(body.durationHours) >= 1 ? Number(body.durationHours) : cfg.auction.defaultDurationHours;
    const startAt = body.startAt ? new Date(body.startAt) : new Date();
    const endAt = new Date(startAt.getTime() + durationHours * 3600 * 1000);

    store.update("items", item.id, {
      status: "live", startingBid,
      startAt: startAt.toISOString(), endAt: endAt.toISOString(),
      approvedAt: new Date().toISOString(), rejectionReason: null,
    });
    notify(item.donorId, "item-approved", `Your item "${item.title}" is now live in the auction!`, { itemId: item.id });
    ok(res, { item: publicItem(store.byId("items", item.id), { includeDonor: true }) });
  });

  router.post("/api/admin/items/:id/reject", async (req, res) => {
    if (!admin(req, res)) return;
    const item = store.byId("items", req.params.id);
    if (!item) return fail(res, 404, "Item not found.");
    const body = await readJson(req).catch(() => ({}));
    const reason = String(body.reason || "").trim() || "It doesn't meet our auction guidelines.";
    store.update("items", item.id, { status: "rejected", rejectionReason: reason });
    notify(item.donorId, "item-rejected", `Your item "${item.title}" wasn't approved: ${reason}`, { itemId: item.id });
    ok(res, { item: publicItem(store.byId("items", item.id), { includeDonor: true }) });
  });

  // Edit listing fields (before or during auction).
  router.patch("/api/admin/items/:id", async (req, res) => {
    if (!admin(req, res)) return;
    const item = store.byId("items", req.params.id);
    if (!item) return fail(res, 404, "Item not found.");
    const body = await readJson(req).catch(() => ({}));
    const patch = {};
    for (const f of ["title", "description", "category", "condition"]) if (f in body) patch[f] = String(body[f]).slice(0, 2000);
    for (const f of ["estimatedValue", "startingBid", "reservePrice"]) if (f in body) patch[f] = body[f] == null || body[f] === "" ? null : Number(body[f]);
    if (body.endAt) patch.endAt = new Date(body.endAt).toISOString();
    if (body.collection && typeof body.collection === "object") patch.collection = { ...item.collection, ...body.collection };
    store.update("items", item.id, patch);
    ok(res, { item: publicItem(store.byId("items", item.id), { includeDonor: true }) });
  });

  // Fulfilment: mark shipped or collected (after payment).
  router.post("/api/admin/items/:id/fulfil", async (req, res) => {
    if (!admin(req, res)) return;
    const item = store.byId("items", req.params.id);
    if (!item) return fail(res, 404, "Item not found.");
    const body = await readJson(req).catch(() => ({}));
    const state = body.state === "shipped" ? "shipped" : body.state === "collected" ? "collected" : null;
    if (!state) return fail(res, 400, "state must be 'shipped' or 'collected'.");
    store.update("items", item.id, { status: state, fulfilledAt: new Date().toISOString() });
    if (item.winnerId) notify(item.winnerId, "fulfilment", `Your item "${item.title}" has been marked ${state}.`, { itemId: item.id });
    notify(item.donorId, "fulfilment", `"${item.title}" has been marked ${state}.`, { itemId: item.id });
    ok(res, { item: publicItem(store.byId("items", item.id), { includeDonor: true }) });
  });

  /* ---- Disputes ---- */
  router.post("/api/admin/items/:id/dispute", async (req, res) => {
    if (!admin(req, res)) return;
    const item = store.byId("items", req.params.id);
    if (!item) return fail(res, 404, "Item not found.");
    const body = await readJson(req).catch(() => ({}));
    const action = body.action; // "open" | "resolve"
    if (action === "open") {
      store.update("items", item.id, { dispute: { open: true, note: String(body.note || ""), openedAt: new Date().toISOString() } });
    } else if (action === "resolve") {
      const resolution = String(body.resolution || "").slice(0, 1000);
      store.update("items", item.id, { dispute: { ...(item.dispute || {}), open: false, resolution, resolvedAt: new Date().toISOString() } });
      if (item.winnerId) notify(item.winnerId, "dispute", `Update on "${item.title}": ${resolution}`, { itemId: item.id });
      notify(item.donorId, "dispute", `Update on "${item.title}": ${resolution}`, { itemId: item.id });
    } else {
      return fail(res, 400, "action must be 'open' or 'resolve'.");
    }
    ok(res, { item: publicItem(store.byId("items", item.id), { includeDonor: true }) });
  });

  /* ---- Take down / remove a listing ----
     Pulls an item from the auction. By default it's a soft removal (kept with a
     "removed" status for the record); pass { purge: true } to delete it entirely
     (item, its bids, payments, and uploaded photos). Everyone involved is notified
     and any pending payment is cancelled. */
  router.post("/api/admin/items/:id/takedown", async (req, res) => {
    if (!admin(req, res)) return;
    const item = store.byId("items", req.params.id);
    if (!item) return fail(res, 404, "Item not found.");
    const body = await readJson(req).catch(() => ({}));
    const reason = String(body.reason || "").trim() || "This item has been removed from the auction.";
    const purge = body.purge === true;

    // Notify any bidders that the auction was withdrawn, plus the donor.
    const bidderIds = new Set(store.filter("bids", (b) => b.itemId === item.id).map((b) => b.bidderId));
    for (const uid of bidderIds) {
      notify(uid, "auction-removed", `The auction for "${item.title}" has been withdrawn by the organisers, so bidding has ended. We're sorry for the inconvenience.`, { itemId: item.id });
    }
    notify(item.donorId, "item-removed", `Your item "${item.title}" has been taken down: ${reason}`, { itemId: item.id });

    // Cancel any pending payment tied to it.
    for (const p of store.filter("payments", (p) => p.itemId === item.id && p.status === "pending")) {
      store.update("payments", p.id, { status: "cancelled" });
    }

    if (purge) {
      // Permanently delete photos, bids, payments, and the item record.
      (item.photos || []).forEach((rel) => {
        try { fs.unlinkSync(path.join(cfg.paths.uploads, path.basename(rel))); } catch (e) {}
      });
      store.filter("bids", (b) => b.itemId === item.id).forEach((b) => store.remove("bids", b.id));
      store.filter("payments", (p) => p.itemId === item.id).forEach((p) => store.remove("payments", p.id));
      store.remove("items", item.id);
      return ok(res, { removed: true, purged: true, id: item.id });
    }

    store.update("items", item.id, { status: "removed", removedReason: reason, removedAt: new Date().toISOString() });
    ok(res, { item: publicItem(store.byId("items", item.id), { includeDonor: true }) });
  });

  /* ---- Confirm / reject a GoFundMe payment ----
     A winner marks their bid "sent" on GoFundMe (status "submitted"); an admin
     verifies it arrived and confirms, which releases the collection details. */
  router.post("/api/admin/payments/:id/confirm", (req, res) => {
    if (!admin(req, res)) return;
    const payment = store.byId("payments", req.params.id);
    if (!payment) return fail(res, 404, "Payment not found.");
    if (payment.status === "paid") return ok(res, { paid: true });
    const { item, instructions } = markPaid(payment);
    ok(res, { paid: true, item: publicItem(item, { includeDonor: true }), instructions });
  });

  router.post("/api/admin/payments/:id/reject", async (req, res) => {
    if (!admin(req, res)) return;
    const payment = store.byId("payments", req.params.id);
    if (!payment) return fail(res, 404, "Payment not found.");
    const body = await readJson(req).catch(() => ({}));
    const reason = String(body.reason || "").trim() || "We couldn't match your GoFundMe payment. Please check and try again.";
    store.update("payments", payment.id, { status: "pending", rejectedAt: new Date().toISOString() });
    notify(payment.bidderId, "payment-rejected", `Payment for your winning item wasn't confirmed: ${reason}`, { itemId: payment.itemId });
    ok(res, { ok: true });
  });

  /* ---- Team / admins: list users, promote or demote ---- */
  router.get("/api/admin/users", (req, res) => {
    if (!admin(req, res)) return;
    const users = store.all("users").map((u) => ({
      id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt,
    })).sort((a, b) => (a.role === "admin" ? -1 : 1) - (b.role === "admin" ? -1 : 1) || new Date(b.createdAt) - new Date(a.createdAt));
    ok(res, { users });
  });

  router.post("/api/admin/users/:id/role", async (req, res) => {
    const me = admin(req, res); if (!me) return;
    const target = store.byId("users", req.params.id);
    if (!target) return fail(res, 404, "User not found.");
    const body = await readJson(req).catch(() => ({}));
    const role = body.role === "admin" ? "admin" : "member";
    // Guard: don't let an admin demote themselves (avoids locking everyone out).
    if (target.id === me.id && role !== "admin") return fail(res, 400, "You can't remove your own admin access.");
    store.update("users", target.id, { role });
    if (role === "admin") notify(target.id, "role", "You've been given admin access to the auction console.");
    ok(res, { user: { id: target.id, name: target.name, email: target.email, role } });
  });

  /* ---- Payments overview ---- */
  router.get("/api/admin/payments", (req, res) => {
    if (!admin(req, res)) return;
    const rows = store.all("payments").map((p) => {
      const item = store.byId("items", p.itemId);
      const bidder = store.byId("users", p.bidderId);
      return {
        id: p.id, amount: p.amount, status: p.status, provider: p.provider,
        itemId: p.itemId, itemTitle: item ? item.title : "(deleted)",
        bidder: bidder ? { name: bidder.name, email: bidder.email } : null,
        createdAt: p.createdAt, paidAt: p.paidAt || null,
      };
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    ok(res, { payments: rows });
  });

  /* ---- Fundraising statistics ---- */
  router.get("/api/admin/stats", (req, res) => {
    if (!admin(req, res)) return;
    const items = store.all("items");
    const paid = store.filter("payments", (p) => p.status === "paid");
    const raised = paid.reduce((s, p) => s + p.amount, 0);
    const pendingPayments = store.filter("payments", (p) => p.status === "pending");
    const submittedPayments = store.filter("payments", (p) => p.status === "submitted");
    const byStatus = {};
    for (const i of items) byStatus[i.status] = (byStatus[i.status] || 0) + 1;
    ok(res, {
      stats: {
        totalRaised: raised,
        awaitingPayment: pendingPayments.reduce((s, p) => s + p.amount, 0),
        awaitingConfirmation: submittedPayments.length,
        itemsByStatus: byStatus,
        totalItems: items.length,
        totalBids: store.all("bids").length,
        liveAuctions: items.filter((i) => i.status === "live").length,
        pendingReview: items.filter((i) => i.status === "pending").length,
        users: store.all("users").length,
        gofundmeUrl: cfg.payments.gofundmeUrl,
      },
    });
  });
};
