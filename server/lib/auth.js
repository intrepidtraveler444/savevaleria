/* =============================================================================
   auth.js — registration, login, and stateless token auth using only Node's
   built-in crypto (scrypt password hashing + HMAC-signed tokens).

   The token format is a compact JWT-like string:  base64url(payload).base64url(sig)
   This is intentionally simple and dependency-free. For production you may prefer
   a vetted library (jsonwebtoken) and http-only cookies — the interface here
   (issueToken / verifyToken / requireAuth) would stay the same.
   ============================================================================= */
"use strict";
const crypto = require("crypto");
const cfg = require("../config");
const store = require("./store");
const { fail } = require("./http");

/* ---- password hashing ---- */
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}
function verifyPassword(password, salt, hash) {
  const test = crypto.scryptSync(password, salt, 64).toString("hex");
  // constant-time compare
  const a = Buffer.from(test, "hex"), b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---- tokens ---- */
const b64u = (buf) => Buffer.from(buf).toString("base64url");
function sign(data) {
  return crypto.createHmac("sha256", cfg.authSecret).update(data).digest("base64url");
}
function issueToken(user) {
  const payload = b64u(JSON.stringify({
    sub: user.id,
    role: user.role,
    exp: Date.now() + cfg.tokenTtlHours * 3600 * 1000,
  }));
  return payload + "." + sign(payload);
}
function verifyToken(token) {
  if (!token || token.indexOf(".") < 0) return null;
  const [payload, sig] = token.split(".");
  if (sign(payload) !== sig) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!claims.exp || claims.exp < Date.now()) return null;
    return claims;
  } catch { return null; }
}

/* ---- public shape (never leak password hashes) ---- */
function publicUser(u) {
  if (!u) return null;
  return { id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt };
}

/* ---- account operations ---- */
function register({ name, email, password }) {
  email = String(email || "").trim().toLowerCase();
  name = String(name || "").trim();
  if (!name) throw httpErr(400, "Please enter your name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpErr(400, "Please enter a valid email address.");
  if (!password || password.length < 8) throw httpErr(400, "Password must be at least 8 characters.");
  if (store.find("users", (u) => u.email === email)) throw httpErr(409, "An account with that email already exists.");

  const { salt, hash } = hashPassword(password);
  const user = {
    id: crypto.randomUUID(),
    name, email, salt, passwordHash: hash,
    role: "member",           // members can donate items AND bid; admins are seeded/promoted
    createdAt: new Date().toISOString(),
  };
  store.insert("users", user);
  return { user: publicUser(user), token: issueToken(user) };
}

function login({ email, password }) {
  email = String(email || "").trim().toLowerCase();
  const user = store.find("users", (u) => u.email === email);
  if (!user || !verifyPassword(password || "", user.salt, user.passwordHash)) {
    throw httpErr(401, "Incorrect email or password.");
  }
  return { user: publicUser(user), token: issueToken(user) };
}

function httpErr(status, message) { return Object.assign(new Error(message), { status }); }

/* ---- middleware-style guards ---- */
function currentUser(req) {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const claims = verifyToken(token);
  if (!claims) return null;
  return store.byId("users", claims.sub) || null;
}

// Returns the user, or writes a 401/403 and returns null.
function requireAuth(req, res, { role } = {}) {
  const user = currentUser(req);
  if (!user) { fail(res, 401, "Please sign in to continue.", "unauthenticated"); return null; }
  if (role && user.role !== role) { fail(res, 403, "You don't have permission to do that.", "forbidden"); return null; }
  return user;
}

module.exports = {
  hashPassword, register, login, currentUser, requireAuth, publicUser, issueToken,
};
