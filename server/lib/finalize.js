/* =============================================================================
   finalize.js — auction lifecycle helpers.
   -----------------------------------------------------------------------------
   We finalise auctions lazily: any time a live auction is read or listed, we
   check whether it has passed its end time and, if so, settle it (pick a winner,
   create a pending payment, notify everyone). This avoids a background job runner
   while remaining correct. A cron/worker can call `finalizeDue()` in production.
   ============================================================================= */
"use strict";
const crypto = require("crypto");
const store = require("./store");
const { notify } = require("./notify");

const now = () => Date.now();

function bidsFor(itemId) {
  return store.filter("bids", (b) => b.itemId === itemId).sort((a, b) => b.amount - a.amount || new Date(a.createdAt) - new Date(b.createdAt));
}

function highestBid(itemId) {
  return bidsFor(itemId)[0] || null;
}

// Settle one item if it is live and past its end time. Idempotent.
function finalizeItem(item) {
  if (!item || item.status !== "live") return item;
  if (!item.endAt || new Date(item.endAt).getTime() > now()) return item;

  const top = highestBid(item.id);
  const reserveMet = !item.reservePrice || (top && top.amount >= item.reservePrice);

  if (top && reserveMet) {
    store.update("items", item.id, { status: "won", winnerId: top.bidderId, winningBid: top.amount, endedAt: new Date().toISOString() });
    // Pending payment for the winner.
    const payment = {
      id: crypto.randomUUID(),
      itemId: item.id,
      bidderId: top.bidderId,
      amount: top.amount,
      status: "pending",
      provider: null,
      ref: null,
      createdAt: new Date().toISOString(),
    };
    store.insert("payments", payment);
    notify(top.bidderId, "won", `You won "${item.title}" with a bid of $${top.amount}. Please complete payment to fund Valeria's care.`, { itemId: item.id });
    notify(item.donorId, "item-sold", `Your item "${item.title}" sold for $${top.amount}. We'll arrange collection once payment clears.`, { itemId: item.id });
    // Notify losing bidders.
    const losers = new Set(store.filter("bids", (b) => b.itemId === item.id && b.bidderId !== top.bidderId).map((b) => b.bidderId));
    for (const uid of losers) notify(uid, "auction-lost", `The auction for "${item.title}" has ended. Thank you for bidding!`, { itemId: item.id });
  } else {
    store.update("items", item.id, { status: "unsold", endedAt: new Date().toISOString(), reserveNotMet: !!(top && !reserveMet) });
    notify(item.donorId, "item-unsold", `Your item "${item.title}" ended without a winning bid${top ? " that met the reserve" : ""}.`, { itemId: item.id });
  }
  return store.byId("items", item.id);
}

// Finalise every due auction (call on list endpoints and, optionally, on a timer).
function finalizeDue() {
  for (const item of store.filter("items", (i) => i.status === "live")) finalizeItem(item);
}

module.exports = { finalizeItem, finalizeDue, highestBid, bidsFor };
