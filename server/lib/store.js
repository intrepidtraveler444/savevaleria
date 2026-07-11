/* =============================================================================
   store.js — tiny JSON-file data store
   -----------------------------------------------------------------------------
   Deliberately isolated behind a small API so the rest of the app never touches
   the file directly. To move to a real database later (Postgres, SQLite, Mongo),
   reimplement these methods and nothing else has to change.

   Concurrency note: Node runs our request handlers on a single thread, so reads
   and in-memory mutations are atomic between `await` points. Writes are debounced
   and flushed atomically (temp file + rename) to avoid corruption on crash.
   ============================================================================= */
"use strict";
const fs = require("fs");
const path = require("path");
const cfg = require("../config");

const EMPTY = {
  users: [],
  items: [],        // auction listings (all statuses)
  bids: [],
  payments: [],
  notifications: [],
  meta: { seeded: false },
};

let db = null;
let flushTimer = null;

function ensureDirs() {
  fs.mkdirSync(cfg.paths.data, { recursive: true });
  fs.mkdirSync(cfg.paths.uploads, { recursive: true });
}

function load() {
  ensureDirs();
  if (fs.existsSync(cfg.paths.db)) {
    try {
      db = JSON.parse(fs.readFileSync(cfg.paths.db, "utf8"));
      // Backfill any newly added collections.
      for (const k of Object.keys(EMPTY)) if (!(k in db)) db[k] = structuredClone(EMPTY[k]);
    } catch (e) {
      console.error("Could not parse db.json — starting empty. (" + e.message + ")");
      db = structuredClone(EMPTY);
    }
  } else {
    db = structuredClone(EMPTY);
    flush(true);
  }
  return db;
}

function data() {
  if (!db) load();
  return db;
}

// Atomic write: serialise to a temp file, then rename over the target.
function flush(immediate) {
  const doWrite = () => {
    flushTimer = null;
    const tmp = cfg.paths.db + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, cfg.paths.db);
  };
  if (immediate) return doWrite();
  if (flushTimer) return;
  flushTimer = setTimeout(doWrite, 50);
}

/* -------- collection helpers -------- */
function table(name) {
  const d = data();
  if (!d[name]) d[name] = [];
  return d[name];
}

const store = {
  load,
  data,
  save: () => flush(false),
  saveNow: () => flush(true),

  all: (name) => table(name),
  find: (name, pred) => table(name).find(pred),
  filter: (name, pred) => table(name).filter(pred),
  byId: (name, id) => table(name).find((r) => r.id === id),

  insert(name, row) {
    table(name).push(row);
    flush(false);
    return row;
  },
  update(name, id, patch) {
    const row = store.byId(name, id);
    if (!row) return null;
    Object.assign(row, patch);
    flush(false);
    return row;
  },
  remove(name, id) {
    const arr = table(name);
    const i = arr.findIndex((r) => r.id === id);
    if (i >= 0) { arr.splice(i, 1); flush(false); return true; }
    return false;
  },
};

module.exports = store;
