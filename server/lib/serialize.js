/* =============================================================================
   serialize.js — turn internal records into the shapes the frontend consumes,
   with computed fields (current bid, bid count, time remaining) and without
   leaking private data (donor email is hidden on public views).
   ============================================================================= */
"use strict";
const store = require("./store");
const { highestBid, bidsFor } = require("./finalize");

function publicItem(item, { includeDonor = false } = {}) {
  if (!item) return null;
  const top = highestBid(item.id);
  const bids = store.filter("bids", (b) => b.itemId === item.id);
  const out = {
    id: item.id,
    title: item.title,
    description: item.description,
    category: item.category,
    condition: item.condition || null,
    estimatedValue: item.estimatedValue,
    startingBid: item.startingBid,
    reservePrice: item.reservePrice || null,     // exact value is admin-only; see below
    hasReserve: !!item.reservePrice,
    reserveMet: !item.reservePrice || (top && top.amount >= item.reservePrice),
    photos: item.photos || [],
    status: item.status,
    startAt: item.startAt || null,
    endAt: item.endAt || null,
    currentBid: top ? top.amount : null,
    bidCount: bids.length,
    minNextBid: nextMinBid(item, top),
    winningBid: item.winningBid || null,
    collection: item.collection || null,
    createdAt: item.createdAt,
    endedAt: item.endedAt || null,
  };
  // Never expose the exact reserve on public views (only whether it's met).
  if (!includeDonor) delete out.reservePrice;

  if (includeDonor) {
    const donor = store.byId("users", item.donorId);
    out.donor = donor ? { id: donor.id, name: donor.name, email: donor.email } : null;
    out.contact = item.contact || null;
    out.rejectionReason = item.rejectionReason || null;
    out.winnerId = item.winnerId || null;
    out.requestedDurationHours = item.requestedDurationHours || null;
  }
  return out;
}

const cfg = require("../config");
function nextMinBid(item, top) {
  const inc = cfg.auction.minIncrement;
  if (top) return top.amount + inc;
  return item.startingBid || inc;
}

function publicBid(b) {
  const u = store.byId("users", b.bidderId);
  return {
    id: b.id,
    amount: b.amount,
    createdAt: b.createdAt,
    bidder: u ? maskName(u.name) : "Bidder",
    bidderId: b.bidderId,
  };
}

// "Sarah Jones" -> "Sarah J." for public bid history privacy.
function maskName(name) {
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return parts[0] + " " + parts[parts.length - 1][0] + ".";
}

module.exports = { publicItem, publicBid, bidsFor };
