/* =============================================================================
   seed.js — first-run setup + demo data.
   Creates the admin account and, if the DB is empty, a couple of demo members
   and sample auction items so the app is explorable immediately. Safe to run
   repeatedly: it only seeds when there are no users.
   Run directly with `npm run seed`, or it runs automatically on server start.
   ============================================================================= */
"use strict";
const crypto = require("crypto");
const cfg = require("./config");
const store = require("./lib/store");
const { hashPassword } = require("./lib/auth");

function makeUser(name, email, password, role) {
  const { salt, hash } = hashPassword(password);
  return { id: crypto.randomUUID(), name, email: email.toLowerCase(), salt, passwordHash: hash, role, createdAt: new Date().toISOString() };
}

function seed() {
  // Data is already loaded by store.init() at boot — do NOT reload here (that
  // would overwrite persisted Upstash data). Only seed if the DB is empty.
  const users = store.all("users");
  if (users.length > 0) return { seeded: false };

  // Admin + demo members.
  const adminUser = makeUser(cfg.admin.name, cfg.admin.email, cfg.admin.password, "admin");
  const donor = makeUser("Maria Gomez", "donor@example.com", "password123", "member");
  const bidder = makeUser("Sam Rivera", "bidder@example.com", "password123", "member");
  store.insert("users", adminUser);
  store.insert("users", donor);
  store.insert("users", bidder);

  const now = Date.now();
  const hrs = (h) => new Date(now + h * 3600 * 1000).toISOString();

  const demoItems = [
    {
      title: "Weekend Getaway for Two",
      description: "Two nights at a charming boutique guesthouse, breakfast included. Flexible dates within 6 months.",
      category: "Travel or accommodation", condition: null, estimatedValue: 400, startingBid: 50, reservePrice: 150,
      status: "live", startAt: hrs(-2), endAt: hrs(46),
      collection: { location: "Austin, TX (voucher emailed)", shippingAvailable: true, shippingCost: 0, times: "Anytime", instructions: "Digital voucher — sent by email after payment.", contactMethod: "Email" },
    },
    {
      title: "Signed Acoustic Guitar",
      description: "Beautiful acoustic guitar signed by a local touring band. Great condition, comes with a soft case.",
      category: "Sports or memorabilia", condition: "Like new", estimatedValue: 600, startingBid: 75, reservePrice: null,
      status: "live", startAt: hrs(-6), endAt: hrs(18),
      collection: { location: "San Antonio, TX", shippingAvailable: true, shippingCost: 25, times: "Weekdays 5–8pm", instructions: "Collect in person or ship at buyer's cost.", contactMethod: "Phone or email" },
    },
    {
      title: "Family Portrait Photography Session",
      description: "A 1-hour professional photo session with 10 edited digital images. Perfect gift for a family.",
      category: "Professional service", condition: null, estimatedValue: 350, startingBid: 40, reservePrice: 100,
      status: "live", startAt: hrs(-1), endAt: hrs(70),
      collection: { location: "Austin, TX studio or on location", shippingAvailable: false, shippingCost: null, times: "By appointment", instructions: "Arrange a date directly with the photographer.", contactMethod: "Email" },
    },
    {
      title: "Handmade Ceramic Dinner Set",
      description: "A stunning 8-piece handmade stoneware dinner set in coastal blue tones.",
      category: "Home, garden or décor", condition: "New", estimatedValue: 220, startingBid: 30, reservePrice: null,
      status: "pending", // awaiting admin approval — shows up in the review queue
      collection: { location: "Round Rock, TX", shippingAvailable: true, shippingCost: 15, times: "Weekends", instructions: "Carefully packed for shipping.", contactMethod: "Email" },
    },
  ];

  for (const d of demoItems) {
    store.insert("items", {
      id: crypto.randomUUID(),
      donorId: donor.id,
      photos: [],
      contact: { name: donor.name, email: donor.email, phone: "" },
      notes: "",
      createdAt: new Date().toISOString(),
      ...d,
    });
  }

  store.saveNow();
  // Note: we intentionally do NOT log the admin password.
  console.log("Seeded database. Admin email:", cfg.admin.email);
  console.log("  Demo: donor@example.com / password123 · bidder@example.com / password123");
  return { seeded: true };
}

// Allow `npm run seed` to run standalone (loads persistence first).
if (require.main === module) {
  (async () => { await store.init(); seed(); await store.saveNow(); })();
}
module.exports = { seed };
