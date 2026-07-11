/* =============================================================================
   static.js — safe static file serving for the marketing site, the auction app,
   and uploaded photos. Prevents path traversal and sets sensible content types.
   ============================================================================= */
"use strict";
const fs = require("fs");
const path = require("path");

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json",
};

// Serve `urlPath` from `rootDir`. Returns true if handled.
function serve(res, rootDir, urlPath, { cache = false } = {}) {
  let rel = decodeURIComponent(urlPath.split("?")[0]);
  if (rel.endsWith("/")) rel += "index.html";
  const full = path.join(rootDir, rel);
  // Block traversal outside the root.
  if (!full.startsWith(path.resolve(rootDir))) { notFound(res); return true; }
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return false;

  const ext = path.extname(full).toLowerCase();
  res.writeHead(200, {
    "Content-Type": TYPES[ext] || "application/octet-stream",
    "Cache-Control": cache ? "public, max-age=3600" : "no-cache",
  });
  fs.createReadStream(full).pipe(res);
  return true;
}

function notFound(res) {
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
}

module.exports = { serve, notFound };
