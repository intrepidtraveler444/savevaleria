/* =============================================================================
   uploads.js — accept photos as base64 data URLs (sent in JSON), validate them,
   and store them as files served from /uploads. Keeping uploads as JSON data URLs
   avoids a multipart parser and works identically from drag-and-drop or file input.
   Swap this for S3/Cloud storage later without touching callers.
   ============================================================================= */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cfg = require("../config");

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

// Accepts an array of data URLs. Returns array of public paths ("/uploads/xxx.jpg").
function saveDataUrls(list) {
  if (!Array.isArray(list)) return [];
  fs.mkdirSync(cfg.paths.uploads, { recursive: true });
  const out = [];
  for (const item of list.slice(0, cfg.uploads.maxPhotos)) {
    // Already-hosted path (e.g. editing an existing listing) — keep as-is.
    if (typeof item === "string" && item.startsWith("/uploads/")) { out.push(item); continue; }
    const m = /^data:([^;]+);base64,(.+)$/.exec(item || "");
    if (!m) continue;
    const mime = m[1];
    if (!cfg.uploads.allowed.includes(mime)) continue;
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > cfg.uploads.maxBytes) continue;
    const name = crypto.randomUUID() + "." + (EXT[mime] || "bin");
    fs.writeFileSync(path.join(cfg.paths.uploads, name), buf);
    out.push("/uploads/" + name);
  }
  return out;
}

module.exports = { saveDataUrls };
