/* =============================================================================
   Item (donor) routes — submit an item, list your own items (donor dashboard).
   New items enter as status "pending" and await admin approval before going live.
   ============================================================================= */
"use strict";
const crypto = require("crypto");
const cfg = require("../config");
const store = require("../lib/store");
const auth = require("../lib/auth");
const { saveDataUrls } = require("../lib/uploads");
const { publicItem } = require("../lib/serialize");
const { ok, created, fail, readJson } = require("../lib/http");

const CATEGORIES = [
  "Experience or activity", "Travel or accommodation", "Art or collectibles",
  "Electronics or gadgets", "Jewellery or accessories", "Home, garden or décor",
  "Sports or memorabilia", "Food, drink or hospitality", "Professional service",
  "Gift card or voucher", "Other",
];

function str(v, max) { return String(v == null ? "" : v).trim().slice(0, max || 2000); }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : NaN; }

module.exports = function register(router) {

  router.get("/api/categories", (_req, res) => ok(res, { categories: CATEGORIES }));

  // Submit a new item for auction.
  router.post("/api/items", async (req, res) => {
    const user = auth.requireAuth(req, res); if (!user) return;
    let body;
    try { body = await readJson(req); } catch (e) { return fail(res, 400, e.message); }

    // Validation (server-side; the client validates too for UX).
    const errors = {};
    const title = str(body.title, 120);
    const description = str(body.description, 2000);
    const category = str(body.category, 80);
    const estimatedValue = num(body.estimatedValue);
    const reservePrice = body.reservePrice === "" || body.reservePrice == null ? null : num(body.reservePrice);

    if (title.length < 3) errors.title = "Please add a title (at least 3 characters).";
    if (description.length < 10) errors.description = "Please add a longer description.";
    if (!CATEGORIES.includes(category)) errors.category = "Please choose a valid category.";
    if (!(estimatedValue >= 1)) errors.estimatedValue = "Enter an estimated value of at least $1.";
    if (reservePrice != null && !(reservePrice >= 1)) errors.reservePrice = "Reserve must be at least $1, or leave it blank.";

    const collection = body.collection || {};
    if (!str(collection.location, 200)) errors.collection = "Please add a collection location.";
    if (!str(collection.contactMethod, 200)) errors.contactMethod = "Please add a contact method for after the auction.";

    if (Object.keys(errors).length) {
      return require("../lib/http").send(res, 422, { error: { message: "Please fix the highlighted fields.", code: "validation", fields: errors } });
    }

    const photos = saveDataUrls(body.photos || []);

    const item = {
      id: crypto.randomUUID(),
      donorId: user.id,
      title, description, category,
      condition: str(body.condition, 60) || null,
      estimatedValue,
      startingBid: null,                 // set by admin at approval
      reservePrice,
      photos,
      status: "pending",
      collection: {
        location: str(collection.location, 200),
        shippingAvailable: !!collection.shippingAvailable,
        shippingCost: collection.shippingCost === "" || collection.shippingCost == null ? null : num(collection.shippingCost),
        times: str(collection.times, 300),
        instructions: str(collection.instructions, 500),
        contactMethod: str(collection.contactMethod, 200),
      },
      contact: {
        name: str(body.contactName, 120) || user.name,
        email: str(body.contactEmail, 160) || user.email,
        phone: str(body.contactPhone, 60),
      },
      notes: str(body.notes, 500),
      createdAt: new Date().toISOString(),
    };
    store.insert("items", item);
    created(res, { item: publicItem(item, { includeDonor: true }) });
  });

  // Donor dashboard — items I submitted, with status.
  router.get("/api/items/mine", (req, res) => {
    const user = auth.requireAuth(req, res); if (!user) return;
    const mine = store.filter("items", (i) => i.donorId === user.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map((i) => publicItem(i, { includeDonor: true }));
    ok(res, { items: mine });
  });
};

module.exports.CATEGORIES = CATEGORIES;
