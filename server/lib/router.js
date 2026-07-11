/* =============================================================================
   router.js — a tiny path-parameter router (GET/POST/PATCH/DELETE).
   Routes like "/api/auctions/:id" expose params on req.params; the query string
   is parsed onto req.query (a URLSearchParams). Keeps index.js clean.
   ============================================================================= */
"use strict";

function compile(path) {
  const keys = [];
  const pattern = "^" + path.replace(/:[^/]+/g, (m) => { keys.push(m.slice(1)); return "([^/]+)"; }) + "$";
  return { re: new RegExp(pattern), keys };
}

class Router {
  constructor() { this.routes = []; }
  add(method, path, handler) { this.routes.push({ method, ...compile(path), handler }); return this; }
  get(p, h) { return this.add("GET", p, h); }
  post(p, h) { return this.add("POST", p, h); }
  patch(p, h) { return this.add("PATCH", p, h); }
  delete(p, h) { return this.add("DELETE", p, h); }

  // Returns true if a route matched (and was invoked).
  handle(req, res, pathname) {
    for (const r of this.routes) {
      if (r.method !== req.method) continue;
      const m = r.re.exec(pathname);
      if (!m) continue;
      req.params = {};
      r.keys.forEach((k, i) => (req.params[k] = decodeURIComponent(m[i + 1])));
      Promise.resolve(r.handler(req, res)).catch((e) => {
        console.error(e);
        if (!res.headersSent) {
          res.writeHead(e.status || 500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: { message: e.message || "Server error" } }));
        }
      });
      return true;
    }
    return false;
  }
}

module.exports = Router;
