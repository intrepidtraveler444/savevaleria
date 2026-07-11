/* =============================================================================
   Admin routes (role = "admin") — review queue, approve/reject/edit listings,
   manage fulfilment, resolve disputes, and view fundraising statistics.
   ============================================================================= */
"use strict";
const cfg = require("../config");
const store = require("../lib/store");
const auth = require("../lib/auth");
const { notify } = require("../lib/notify");
const { publicItem } = require("../lib/serialize");
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
    const byStatus = {};
    for (const i of items) byStatus[i.status] = (byStatus[i.status] || 0) + 1;
    ok(res, {
      stats: {
        totalRaised: raised,
        awaitingPayment: pendingPayments.reduce((s, p) => s + p.amount, 0),
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
