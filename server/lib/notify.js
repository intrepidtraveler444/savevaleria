/* =============================================================================
   notify.js — create in-app notifications and push them live to the user's SSE
   stream. `emailStub` shows where a real email/SMS provider (SendGrid, Postmark,
   Twilio) would hook in — currently it just logs so nothing is silently promised.
   ============================================================================= */
"use strict";
const crypto = require("crypto");
const store = require("./store");
const realtime = require("./realtime");

function notify(userId, type, message, extra = {}) {
  if (!userId) return;
  const n = {
    id: crypto.randomUUID(),
    userId, type, message,
    ...extra,
    read: false,
    createdAt: new Date().toISOString(),
  };
  store.insert("notifications", n);
  realtime.publish("user:" + userId, "notification", n);
  emailStub(userId, type, message);
  return n;
}

function emailStub(userId, type, message) {
  const user = store.byId("users", userId);
  // TODO(production): send via a real provider here.
  console.log(`[notify:${type}] → ${user ? user.email : userId}: ${message}`);
}

module.exports = { notify };
