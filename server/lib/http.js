/* =============================================================================
   http.js — small request/response helpers so route code stays readable.
   ============================================================================= */
"use strict";

const MAX_BODY = 12 * 1024 * 1024; // 12MB (photos are base64 JSON)

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(payload);
}

const ok = (res, body = {}) => send(res, 200, body);
const created = (res, body = {}) => send(res, 201, body);

// Structured error helper. `code` is a machine-readable string for the client.
function fail(res, status, message, code) {
  send(res, status, { error: { message, code: code || null } });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error("Payload too large"), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(Object.assign(new Error("Invalid JSON body"), { status: 400 })); }
    });
    req.on("error", reject);
  });
}

module.exports = { send, ok, created, fail, readJson };
