/* =============================================================================
   api.js — thin client for the auction API. Handles the auth token and turns
   error responses into thrown errors (with optional field-level messages).
   ============================================================================= */
(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // API base URL. Empty = same origin (correct when the Node server also serves
  // these pages, e.g. `node server/index.js`).
  // Deploying the static site to Netlify? Host the backend (/server) somewhere
  // like Render/Railway/Fly, then set this to that URL, e.g.
  //   var API_BASE = "https://valeria-auction.onrender.com";
  // (You can also set window.AUCTION_API_BASE before this script loads.)
  // ---------------------------------------------------------------------------
  var API_BASE = window.AUCTION_API_BASE || "";

  var TOKEN_KEY = "va_token";
  var USER_KEY = "va_user";

  function token() { return localStorage.getItem(TOKEN_KEY) || ""; }
  function setSession(token, user) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  function clearSession() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }
  function cachedUser() { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch (e) { return null; } }

  async function request(method, path, body) {
    var headers = { "Content-Type": "application/json" };
    if (token()) headers.Authorization = "Bearer " + token();
    var res = await fetch(API_BASE + "/api" + path, {
      method: method,
      headers: headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });
    var data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) {
      var err = new Error((data && data.error && data.error.message) || ("Request failed (" + res.status + ")"));
      err.status = res.status;
      err.code = data && data.error && data.error.code;
      err.fields = data && data.error && data.error.fields;
      throw err;
    }
    return data;
  }

  window.API = {
    base: API_BASE,
    token: token,
    setSession: setSession,
    clearSession: clearSession,
    cachedUser: cachedUser,
    isLoggedIn: function () { return !!token(); },

    get: function (p) { return request("GET", p); },
    post: function (p, b) { return request("POST", p, b); },
    patch: function (p, b) { return request("PATCH", p, b); },
    del: function (p) { return request("DELETE", p); },

    // Auth
    login: async function (email, password) {
      var r = await request("POST", "/auth/login", { email: email, password: password });
      setSession(r.token, r.user); return r;
    },
    register: async function (payload) {
      var r = await request("POST", "/auth/register", payload);
      setSession(r.token, r.user); return r;
    },
    me: function () { return request("GET", "/auth/me"); },
    logout: function () { clearSession(); },
  };
})();
