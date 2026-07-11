/* =============================================================================
   GoFundMe figures — reads the live "raised" amount (and goal / donation count)
   from the public campaign page and caches it, so the front-page progress bar can
   stay in sync without a GoFundMe API (they don't offer one).

   The result is cached in memory for `cfg.gofundme.cacheMinutes` so we never
   scrape on every visitor. If a scrape fails, we serve the last good value
   (marked stale); if we've never succeeded, the frontend falls back to the
   number hard-coded in js/config.js.
   ============================================================================= */
"use strict";
const cfg = require("../config");
const { ok, fail } = require("../lib/http");

let cache = { data: null, at: 0 };

// Pull a named GraphQL "Money" field, e.g. currentAmount / goalAmount.
function money(html, name) {
  const re = new RegExp('"' + name + '":\\{"__typename":"Money","amount":"?([0-9][0-9.]*)"?,"currencyCode":"([A-Z]{3})"');
  const m = re.exec(html);
  return m ? { amount: Math.round(parseFloat(m[1])), currency: m[2] } : null;
}

async function scrape() {
  const res = await fetch(cfg.gofundme.url, {
    headers: {
      // A realistic browser UA reduces the chance of being served a bot page.
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) throw new Error("GoFundMe returned HTTP " + res.status);
  const html = await res.text();

  const current = money(html, "currentAmount");
  if (!current) throw new Error("Could not parse the raised amount from the page.");
  const goal = money(html, "goalAmount");
  const dc = /"donationCount":\s*([0-9]+)/.exec(html);

  return {
    raised: current.amount,
    goal: goal ? goal.amount : null,
    currency: current.currency,
    donations: dc ? Number(dc[1]) : null,
    updatedAt: new Date().toISOString(),
  };
}

module.exports = function register(router) {
  router.get("/api/gofundme", async (_req, res) => {
    const ttl = (cfg.gofundme.cacheMinutes || 10) * 60000;
    try {
      if (!cache.data || Date.now() - cache.at > ttl) {
        cache = { data: await scrape(), at: Date.now() };
      }
      ok(res, cache.data);
    } catch (e) {
      // Serve the last good figure if we have one; otherwise let the client fall back.
      if (cache.data) return ok(res, Object.assign({}, cache.data, { stale: true }));
      fail(res, 502, "Could not fetch GoFundMe figures right now.", "gofundme_unavailable");
    }
  });
};
