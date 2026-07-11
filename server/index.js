/* =============================================================================
   index.js — HTTP entry point.
   -----------------------------------------------------------------------------
   Responsibilities (kept thin — logic lives in lib/ and routes/):
     • serve the marketing site (/, /css, /js)              [fundraising website]
     • serve the auction app (/app/*)                       [auction system]
     • serve uploaded photos (/uploads/*)
     • mount the JSON API (/api/*)                          [auction + payments + admin]
   Start with:  node server/index.js   (or npm start)
   ============================================================================= */
"use strict";
const http = require("http");
const { URL } = require("url");
const cfg = require("./config");
const store = require("./lib/store");
const staticFiles = require("./lib/static");
const Router = require("./lib/router");
const { seed } = require("./seed");
const { finalizeDue } = require("./lib/finalize");

// --- boot: load data + seed on first run ---
store.load();
seed();

// --- API router ---
const api = new Router();
require("./routes/auth.routes")(api);
require("./routes/items.routes")(api);
require("./routes/auctions.routes")(api);
require("./routes/payments.routes")(api);
require("./routes/admin.routes")(api);

// Settle finished auctions periodically (belt-and-braces alongside lazy finalisation).
setInterval(() => { try { finalizeDue(); } catch (e) { console.error(e); } }, 30000).unref();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  req.query = url.searchParams;
  const pathname = url.pathname;

  // Basic security headers.
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // CORS: set on EVERY response (set via setHeader so it merges into later
  // writeHead calls in the routes, static server, and SSE stream). This is what
  // lets a Netlify-hosted site talk to this API on a different domain.
  res.setHeader("Access-Control-Allow-Origin", cfg.cors.origin);
  res.setHeader("Vary", "Origin");

  // Preflight.
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Max-Age": "86400",
    });
    return res.end();
  }

  // API first.
  if (pathname.startsWith("/api/")) {
    if (api.handle(req, res, pathname)) return;
    res.writeHead(404, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: { message: "Unknown API endpoint." } }));
  }

  // Uploaded photos.
  if (pathname.startsWith("/uploads/")) {
    if (staticFiles.serve(res, cfg.paths.uploads, pathname.replace("/uploads", ""), { cache: true })) return;
    return staticFiles.notFound(res);
  }

  // Auction app (SPA-ish multipage). Fall back to app index for unknown /app paths.
  if (pathname === "/app" || pathname.startsWith("/app/")) {
    const rel = pathname.replace("/app", "") || "/";
    if (staticFiles.serve(res, cfg.paths.app, rel)) return;
    if (staticFiles.serve(res, cfg.paths.app, "/auction.html")) return;
    return staticFiles.notFound(res);
  }

  // Marketing site (default). Root serves index.html.
  if (staticFiles.serve(res, cfg.paths.site, pathname === "/" ? "/index.html" : pathname)) return;

  staticFiles.notFound(res);
});

server.listen(cfg.port, () => {
  console.log(`\n  Valeria fundraiser + auction platform`);
  console.log(`  ────────────────────────────────────`);
  console.log(`  Marketing site : http://localhost:${cfg.port}/`);
  console.log(`  Auction app    : http://localhost:${cfg.port}/app/`);
  console.log(`  Admin console  : http://localhost:${cfg.port}/app/admin.html`);
  console.log(`  API base       : http://localhost:${cfg.port}/api`);
  console.log(`  Payment mode   : ${cfg.payments.provider}\n`);
});
