/* =============================================================================
   Auction + bid routes — public browse/search/filter, item detail, bid history,
   placing bids (with anti-sniping extension), and the live SSE stream.
   ============================================================================= */
"use strict";
const crypto = require("crypto");
const cfg = require("../config");
const store = require("../lib/store");
const auth = require("../lib/auth");
const realtime = require("../lib/realtime");
const { notify } = require("../lib/notify");
const { finalizeDue, finalizeItem, highestBid, bidsFor } = require("../lib/finalize");
const { publicItem, publicBid } = require("../lib/serialize");
const { ok, created, fail, readJson } = require("../lib/http");

module.exports = function register(router) {

  /* ---- Browse / search / filter ---- */
  router.get("/api/auctions", (req, res) => {
    finalizeDue(); // settle anything that just ended so listings are accurate
    const q = (req.query.get("q") || "").toLowerCase().trim();
    const category = req.query.get("category") || "";
    const sort = req.query.get("sort") || "ending";
    const status = req.query.get("status") || "live";

    let items = store.filter("items", (i) => (status === "all" ? true : i.status === status));

    if (category && category !== "all") items = items.filter((i) => i.category === category);
    if (q) items = items.filter((i) =>
      i.title.toLowerCase().includes(q) ||
      i.description.toLowerCase().includes(q) ||
      i.category.toLowerCase().includes(q));

    const withBid = (i) => { const t = highestBid(i.id); return t ? t.amount : (i.startingBid || 0); };
    const sorters = {
      ending: (a, b) => new Date(a.endAt || 0) - new Date(b.endAt || 0),
      newest: (a, b) => new Date(b.startAt || b.createdAt) - new Date(a.startAt || a.createdAt),
      "price-high": (a, b) => withBid(b) - withBid(a),
      "price-low": (a, b) => withBid(a) - withBid(b),
      "most-bids": (a, b) => bidsFor(b.id).length - bidsFor(a.id).length,
    };
    items.sort(sorters[sort] || sorters.ending);

    ok(res, {
      items: items.map((i) => publicItem(i)),
      categories: [...new Set(store.filter("items", (i) => i.status === "live").map((i) => i.category))],
    });
  });

  /* ---- Item detail ---- */
  router.get("/api/auctions/:id", (req, res) => {
    let item = store.byId("items", req.params.id);
    if (!item) return fail(res, 404, "Auction not found.", "not_found");
    item = finalizeItem(item) || item;
    const bids = bidsFor(item.id).map(publicBid);
    ok(res, { item: publicItem(item), bids });
  });

  /* ---- Bid history ---- */
  router.get("/api/auctions/:id/bids", (req, res) => {
    const item = store.byId("items", req.params.id);
    if (!item) return fail(res, 404, "Auction not found.");
    ok(res, { bids: bidsFor(item.id).map(publicBid) });
  });

  /* ---- Place a bid ---- */
  router.post("/api/auctions/:id/bids", async (req, res) => {
    const user = auth.requireAuth(req, res); if (!user) return;
    let item = store.byId("items", req.params.id);
    if (!item) return fail(res, 404, "Auction not found.");
    item = finalizeItem(item) || item;

    if (item.status !== "live") return fail(res, 409, "This auction is not open for bidding.", "closed");
    if (item.endAt && new Date(item.endAt).getTime() <= Date.now()) return fail(res, 409, "This auction has ended.", "closed");
    if (item.donorId === user.id) return fail(res, 403, "You can't bid on your own item.", "own_item");

    const body = await readJson(req).catch(() => ({}));
    const amount = Number(body.amount);
    const top = highestBid(item.id);
    const min = top ? top.amount + cfg.auction.minIncrement : (item.startingBid || cfg.auction.minIncrement);

    if (!Number.isFinite(amount)) return fail(res, 400, "Enter a bid amount.");
    if (amount < min) return fail(res, 422, `Your bid must be at least $${min}.`, "too_low");
    if (top && top.bidderId === user.id) return fail(res, 409, "You are already the highest bidder.", "already_leading");

    const previousLeader = top ? top.bidderId : null;

    const bid = {
      id: crypto.randomUUID(),
      itemId: item.id,
      bidderId: user.id,
      amount,
      createdAt: new Date().toISOString(),
    };
    store.insert("bids", bid);

    // Anti-sniping: extend the end time if the bid lands in the final window.
    let extended = false;
    const msLeft = new Date(item.endAt).getTime() - Date.now();
    if (msLeft > 0 && msLeft < cfg.auction.extendWindowMins * 60000) {
      const newEnd = new Date(Date.now() + cfg.auction.extendByMins * 60000).toISOString();
      store.update("items", item.id, { endAt: newEnd });
      item.endAt = newEnd;
      extended = true;
    }

    // Notify the previous leader that they've been outbid.
    if (previousLeader && previousLeader !== user.id) {
      notify(previousLeader, "outbid", `You've been outbid on "${item.title}". The bid is now $${amount}.`, { itemId: item.id });
    }

    // Broadcast the new state to everyone watching this auction.
    const payload = { itemId: item.id, currentBid: amount, bidCount: bidsFor(item.id).length, endAt: item.endAt, extended, bid: publicBid(bid) };
    realtime.publish("auction:" + item.id, "bid", payload);

    created(res, { item: publicItem(item), bid: publicBid(bid), extended });
  });

  /* ---- Bidder dashboard: auctions I'm in ---- */
  router.get("/api/bids/mine", (req, res) => {
    const user = auth.requireAuth(req, res); if (!user) return;
    finalizeDue();
    const myItemIds = [...new Set(store.filter("bids", (b) => b.bidderId === user.id).map((b) => b.itemId))];
    const rows = myItemIds.map((id) => {
      const item = store.byId("items", id);
      if (!item) return null;
      const top = highestBid(id);
      const myTop = store.filter("bids", (b) => b.itemId === id && b.bidderId === user.id)
        .reduce((m, b) => Math.max(m, b.amount), 0);
      return {
        item: publicItem(item),
        myHighestBid: myTop,
        leading: !!top && top.bidderId === user.id,
        won: item.status === "won" && item.winnerId === user.id,
      };
    }).filter(Boolean);
    ok(res, { entries: rows });
  });

  /* ---- Live auction stream (SSE) ---- */
  router.get("/api/stream/auctions/:id", (req, res) => {
    realtime.subscribe("auction:" + req.params.id, req, res);
  });
};
