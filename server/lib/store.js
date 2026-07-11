/* =============================================================================
   store.js — in-memory JSON store with pluggable persistence.
   -----------------------------------------------------------------------------
   The whole database is a single JSON object held in memory; the public API is
   synchronous so the rest of the app stays simple. Where that object is *saved*
   depends on configuration:

     • Upstash Redis (free, no credit card) — set UPSTASH_REDIS_REST_URL and
       UPSTASH_REDIS_REST_TOKEN. Data then survives restarts/redeploys, which the
       free hosting tier otherwise wipes. Recommended for a real, hands-off run.

     • Local JSON file (default) — good for local dev; NOT durable on free hosts.

   Reads are always from memory. Writes are debounced and pushed to the backend.
   ============================================================================= */
"use strict";
const fs = require("fs");
const path = require("path");
const cfg = require("../config");

const EMPTY = {
  users: [], items: [], bids: [], payments: [], notifications: [],
  meta: { seeded: false },
};

// ---- Upstash (Redis REST) config ----
const U_URL = (process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/+$/, "");
const U_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const U_KEY = process.env.UPSTASH_DB_KEY || "valeria_db";
const useUpstash = !!(U_URL && U_TOKEN);

let db = null;
let flushTimer = null;
let persistDisabled = false;   // set if Upstash load fails, to avoid clobbering good data

function ensureDirs() {
  fs.mkdirSync(cfg.paths.data, { recursive: true });
  fs.mkdirSync(cfg.paths.uploads, { recursive: true });
}

function backfill(obj) {
  for (const k of Object.keys(EMPTY)) if (!(k in obj)) obj[k] = structuredClone(EMPTY[k]);
  return obj;
}

// Run a single Redis command via the Upstash REST API (command as a JSON array).
async function upstash(args) {
  const res = await fetch(U_URL, {
    method: "POST",
    headers: { Authorization: "Bearer " + U_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error("Upstash HTTP " + res.status + ": " + (await res.text()));
  return (await res.json()).result;
}

/* -------- boot-time load (async) — call once before serving -------- */
async function init() {
  ensureDirs();
  if (useUpstash) {
    try {
      const raw = await upstash(["GET", U_KEY]);
      db = raw ? backfill(JSON.parse(raw)) : structuredClone(EMPTY);
      console.log("Store: using Upstash (persistent). " + (raw ? "Loaded existing data." : "Fresh database."));
      if (!raw) flush(true); // create the key on first run
    } catch (e) {
      // Don't overwrite possibly-good remote data on a transient read failure:
      // run in memory this session and disable writes.
      console.error("Store: Upstash load failed — running in safe in-memory mode (no writes). " + e.message);
      db = structuredClone(EMPTY);
      persistDisabled = true;
    }
  } else {
    loadFile();
    console.log("Store: using local file (NOT durable on free hosting).");
  }
  return db;
}

function loadFile() {
  ensureDirs();
  if (fs.existsSync(cfg.paths.db)) {
    try { db = backfill(JSON.parse(fs.readFileSync(cfg.paths.db, "utf8"))); }
    catch (e) { console.error("Could not parse db.json — starting empty. (" + e.message + ")"); db = structuredClone(EMPTY); }
  } else {
    db = structuredClone(EMPTY);
    flush(true);
  }
  return db;
}

function data() {
  if (!db) loadFile();   // sync fallback (file mode / direct tooling)
  return db;
}

/* -------- persistence -------- */
function writeNow() {
  flushTimer = null;
  if (persistDisabled || !db) return;
  if (useUpstash) {
    // Fire-and-forget; log failures but never crash a request over a write.
    upstash(["SET", U_KEY, JSON.stringify(db)]).catch((e) => console.error("Store: Upstash write failed — " + e.message));
  } else {
    const tmp = cfg.paths.db + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, cfg.paths.db);
  }
}

function flush(immediate) {
  if (immediate) return writeNow();
  if (flushTimer) return;
  flushTimer = setTimeout(writeNow, 200); // debounce bursts of writes
}

/* -------- collection helpers -------- */
function table(name) {
  const d = data();
  if (!d[name]) d[name] = [];
  return d[name];
}

const store = {
  init,
  load: loadFile,        // kept for backward compatibility (sync file load)
  data,
  save: () => flush(false),
  saveNow: () => flush(true),

  all: (name) => table(name),
  find: (name, pred) => table(name).find(pred),
  filter: (name, pred) => table(name).filter(pred),
  byId: (name, id) => table(name).find((r) => r.id === id),

  insert(name, row) { table(name).push(row); flush(false); return row; },
  update(name, id, patch) {
    const row = store.byId(name, id);
    if (!row) return null;
    Object.assign(row, patch); flush(false); return row;
  },
  remove(name, id) {
    const arr = table(name);
    const i = arr.findIndex((r) => r.id === id);
    if (i >= 0) { arr.splice(i, 1); flush(false); return true; }
    return false;
  },
};

module.exports = store;
