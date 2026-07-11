/* =============================================================================
   notify.js — create in-app notifications, push them live to the user's SSE
   stream, and (if configured) email them via Resend. If no RESEND_API_KEY is
   set, email is skipped silently and notifications remain in-app only.
   ============================================================================= */
"use strict";
const crypto = require("crypto");
const cfg = require("../config");
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
  sendEmail(userId, type, message);
  return n;
}

// Short, friendly subject lines per notification type.
const SUBJECTS = {
  "won": "🎉 You won an auction item!",
  "outbid": "You've been outbid",
  "auction-lost": "An auction you bid on has ended",
  "auction-removed": "An auction has been withdrawn",
  "payment-received": "Payment confirmed — here's how to collect",
  "payment-rejected": "We couldn't confirm your payment",
  "payment-to-confirm": "A payment needs confirming",
  "buyer-paid": "Your item has been paid for",
  "item-approved": "Your item is now live!",
  "item-rejected": "About your submitted item",
  "item-removed": "Your item has been taken down",
  "item-sold": "Your item sold!",
  "item-unsold": "Your auction has ended",
  "role": "You've been given admin access",
};

async function sendEmail(userId, type, message) {
  const user = store.byId("users", userId);
  if (!user || !user.email) return;

  // No provider configured → log and skip (keeps local/dev quiet and safe).
  if (!cfg.email.resendApiKey) {
    console.log(`[email:${type}] → ${user.email}: ${message}`);
    return;
  }

  const subject = SUBJECTS[type] || "Update from the Valeria charity auction";
  const site = cfg.email.siteUrl;
  const html =
    `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px;margin:auto">` +
    `<h2 style="color:#0e7490">Valeria Charity Auction</h2>` +
    `<p style="font-size:16px;line-height:1.5;color:#0f172a">${escapeHtml(message)}</p>` +
    (site ? `<p><a href="${site}/app/dashboard.html" style="display:inline-block;background:#f4623a;color:#fff;` +
      `text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:600">Open my dashboard</a></p>` : "") +
    `<p style="font-size:12px;color:#64748b">You're receiving this because you're part of the charity auction ` +
    `for Valeria's recovery. 💙</p></div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + cfg.email.resendApiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ from: cfg.email.from, to: [user.email], subject, html }),
    });
    if (!res.ok) console.error(`[email:${type}] Resend error ${res.status}: ${await res.text()}`);
  } catch (e) {
    console.error(`[email:${type}] send failed: ${e.message}`);
  }
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

module.exports = { notify };
