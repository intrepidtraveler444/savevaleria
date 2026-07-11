/* =============================================================================
   settle.js — mark a winning payment as paid and release collection details.
   Shared by the winner-driven confirm (mock/stripe) and the admin-driven confirm
   (GoFundMe flow), so fulfilment behaves identically however payment was made.
   ============================================================================= */
"use strict";
const store = require("./store");
const { notify } = require("./notify");

// The details the winner needs to collect the item — donor contact is only ever
// revealed here (after payment), never on public views.
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

// Idempotent: marks the payment paid, the item "paid", and notifies both parties.
function markPaid(payment) {
  if (payment.status !== "paid") {
    store.update("payments", payment.id, { status: "paid", paidAt: new Date().toISOString() });
  }
  const item = store.update("items", payment.itemId, { status: "paid" });
  const instructions = fulfilmentInstructions(item);
  notify(payment.bidderId, "payment-received",
    `Payment confirmed — thank you! Here's how to collect "${item.title}": ${instructions.location}. Contact after the auction: ${instructions.contactMethod}.`,
    { itemId: item.id });
  notify(item.donorId, "buyer-paid",
    `"${item.title}" has been paid for. Please arrange collection/delivery with the winner.`,
    { itemId: item.id });
  return { item, instructions };
}

module.exports = { markPaid, fulfilmentInstructions };
