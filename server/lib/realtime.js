/* =============================================================================
   realtime.js — Server-Sent Events hub for live updates (new bids, auction end).
   -----------------------------------------------------------------------------
   SSE is chosen over WebSockets because it needs no extra dependency, works over
   plain HTTP, and auto-reconnects in the browser. Clients subscribe per auction
   ("topic"). To scale beyond one process, replace the in-memory `topics` map with
   a pub/sub backend (Redis) — the publish()/subscribe() interface stays the same.
   ============================================================================= */
"use strict";

const topics = new Map(); // topic -> Set(res)

function subscribe(topic, req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(": connected\n\n");

  if (!topics.has(topic)) topics.set(topic, new Set());
  const set = topics.get(topic);
  set.add(res);

  // Heartbeat keeps proxies from closing an idle connection.
  const beat = setInterval(() => { try { res.write(": ping\n\n"); } catch {} }, 25000);

  req.on("close", () => {
    clearInterval(beat);
    set.delete(res);
    if (set.size === 0) topics.delete(topic);
  });
}

function publish(topic, event, payload) {
  const set = topics.get(topic);
  if (!set || set.size === 0) return;
  const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) { try { res.write(frame); } catch {} }
}

module.exports = { subscribe, publish };
