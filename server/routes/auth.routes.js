/* =============================================================================
   Auth routes: register, login, current user, notifications.
   ============================================================================= */
"use strict";
const auth = require("../lib/auth");
const store = require("../lib/store");
const realtime = require("../lib/realtime");
const { ok, created, fail, readJson } = require("../lib/http");

module.exports = function register(router) {
  router.post("/api/auth/register", async (req, res) => {
    try { created(res, auth.register(await readJson(req))); }
    catch (e) { fail(res, e.status || 400, e.message); }
  });

  router.post("/api/auth/login", async (req, res) => {
    try { ok(res, auth.login(await readJson(req))); }
    catch (e) { fail(res, e.status || 400, e.message); }
  });

  router.get("/api/auth/me", (req, res) => {
    const user = auth.currentUser(req);
    if (!user) return fail(res, 401, "Not signed in.", "unauthenticated");
    ok(res, { user: auth.publicUser(user) });
  });

  /* ---- notifications ---- */
  router.get("/api/notifications", (req, res) => {
    const user = auth.requireAuth(req, res); if (!user) return;
    const list = store.filter("notifications", (n) => n.userId === user.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    ok(res, { notifications: list, unread: list.filter((n) => !n.read).length });
  });

  router.post("/api/notifications/read", async (req, res) => {
    const user = auth.requireAuth(req, res); if (!user) return;
    for (const n of store.filter("notifications", (n) => n.userId === user.id && !n.read)) n.read = true;
    store.save();
    ok(res, { ok: true });
  });

  // Live notification stream for the signed-in user (token via query for EventSource).
  router.get("/api/stream/notifications", (req, res) => {
    const token = req.query.get("token") || "";
    const user = auth.currentUser({ headers: { authorization: "Bearer " + token } });
    if (!user) return fail(res, 401, "Not signed in.");
    realtime.subscribe("user:" + user.id, req, res);
  });
};
