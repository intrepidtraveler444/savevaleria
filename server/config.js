/* =============================================================================
   Server configuration
   -----------------------------------------------------------------------------
   All values can be overridden with environment variables so the same code runs
   locally and in production. Nothing secret is hard-coded except throwaway local
   defaults (clearly marked) that MUST be changed before going live.
   ============================================================================= */
"use strict";
const path = require("path");

const ROOT = path.join(__dirname, "..");

// Data directory. Override with DATA_DIR to point at a persistent volume
// (e.g. a Render disk mounted at /var/data) so data survives restarts/redeploys.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");

// Sanitise the CORS origin: strip any non-printable characters (a stray newline
// from a pasted env var would otherwise crash setHeader), trim whitespace, drop a
// trailing slash, and fall back to "*" if that leaves it empty. A bad value must
// never take the server down.
const CORS_ORIGIN =
  ((process.env.CORS_ORIGIN || "*").replace(/[^\x20-\x7E]/g, "").trim().replace(/\/+$/, "")) || "*";

module.exports = {
  port: Number(process.env.PORT) || 4000,

  // Cross-origin: when the static site is hosted separately (Netlify) and the API
  // on another domain (Render), the browser needs this. "*" is safe here because
  // auth uses bearer tokens, not cookies. Restrict to your site's URL if you like.
  cors: { origin: CORS_ORIGIN },

  // Live GoFundMe figures for the front-page progress bar (scraped + cached).
  gofundme: {
    url: process.env.GOFUNDME_CAMPAIGN_URL ||
      "https://www.gofundme.com/f/help-valeria-recover-after-devastating-accident",
    cacheMinutes: Number(process.env.GOFUNDME_CACHE_MINUTES) || 10,
  },

  // Email notifications (Resend). Leave RESEND_API_KEY unset to keep emails off
  // (notifications still appear in-app). See README "Emails" for setup.
  //   RESEND_API_KEY — from resend.com
  //   EMAIL_FROM     — a verified sender, e.g. "Valeria Auction <auction@yourdomain.org>"
  //   SITE_URL       — your public site, used for links in emails
  email: {
    resendApiKey: process.env.RESEND_API_KEY || "",
    from: process.env.EMAIL_FROM || "Valeria Auction <onboarding@resend.dev>",
    siteUrl: process.env.SITE_URL || "https://savevaleria.netlify.app",
  },

  // Where the JSON database and uploaded photos live.
  paths: {
    root: ROOT,
    data: DATA_DIR,
    db: path.join(DATA_DIR, "db.json"),
    uploads: path.join(DATA_DIR, "uploads"),
    // Static frontends served by this server:
    site: ROOT,                       // the marketing site (index.html, /css, /js)
    app: path.join(ROOT, "app"),      // the auction application
  },

  // Secret used to sign auth tokens. CHANGE THIS in production (env AUTH_SECRET).
  authSecret: process.env.AUTH_SECRET || "dev-only-change-me-please-0000000000",
  tokenTtlHours: 24 * 7,

  // First-run admin account (created by the seeder if no users exist).
  // CHANGE THESE before deploying — env ADMIN_EMAIL / ADMIN_PASSWORD.
  admin: {
    name: "Auction Admin",
    email: process.env.ADMIN_EMAIL || "admin@example.com",
    password: process.env.ADMIN_PASSWORD || "admin1234",
  },

  // Auction defaults.
  auction: {
    defaultDurationHours: 24 * 5,     // used if admin doesn't specify
    // Anti-sniping: bids in the final `extendWindowMins` push the end time out.
    extendWindowMins: 2,
    extendByMins: 2,
    minIncrement: 1,                  // minimum bid increment (USD)
  },

  // Payment model:
  //   "gofundme" (default) — winners pay their bid on the GoFundMe page; an admin
  //                          confirms receipt. All money flows into the campaign.
  //   "mock"              — local testing, auto-confirms, no real money.
  //   "stripe"            — real card checkout (see lib/payments.js).
  payments: {
    provider: process.env.PAYMENT_PROVIDER || "gofundme",
    currency: "usd",
    // Public campaign link (short) and the direct donate page winners are sent to.
    gofundmeUrl: process.env.GOFUNDME_URL || "https://gofund.me/4c46c9477",
    gofundmeDonateUrl: process.env.GOFUNDME_DONATE_URL ||
      "https://www.gofundme.com/f/help-valeria-recover-after-devastating-accident/donate",
    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY || "",
      // Where Stripe redirects after checkout (set to your deployed URLs).
      successUrl: process.env.STRIPE_SUCCESS_URL || "http://localhost:4000/app/dashboard.html?paid=1",
      cancelUrl: process.env.STRIPE_CANCEL_URL || "http://localhost:4000/app/dashboard.html?paid=0",
    },
  },

  // Photo upload limits (server-enforced).
  uploads: {
    maxPhotos: 8,
    maxBytes: 5 * 1024 * 1024,
    allowed: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  },
};
