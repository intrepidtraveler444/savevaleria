/* =============================================================================
   app.js — shared UI: header/nav, session state, notifications bell (live via
   SSE), toasts, countdowns, and small formatting helpers used across pages.
   Every page includes <div id="app-header"></div> and calls App.init(activeKey).
   ============================================================================= */
(function () {
  "use strict";

  var GOFUNDME = "https://gofund.me/4c46c9477"; // primary Donate Now target

  /* ---------- formatting ---------- */
  function money(n) {
    if (n == null || isNaN(n)) return "—";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
  }
  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }

  // Human "time remaining" from an ISO end date.
  function timeLeft(endAt) {
    if (!endAt) return { text: "—", ended: false, ms: 0 };
    var ms = new Date(endAt).getTime() - Date.now();
    if (ms <= 0) return { text: "Ended", ended: true, ms: 0 };
    var s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600),
        m = Math.floor((s % 3600) / 60), sec = s % 60;
    var text = d > 0 ? d + "d " + h + "h" : h > 0 ? h + "h " + m + "m" : m > 0 ? m + "m " + sec + "s" : sec + "s";
    return { text: text, ended: false, ms: ms, urgent: ms < 3600000 };
  }

  // Update every [data-countdown="ISO"] element once per second.
  function startCountdowns() {
    function tick() {
      document.querySelectorAll("[data-countdown]").forEach(function (el) {
        var t = timeLeft(el.getAttribute("data-countdown"));
        el.textContent = t.text;
        el.classList.toggle("is-urgent", !!t.urgent);
        if (t.ended) el.classList.add("is-ended");
      });
    }
    tick();
    setInterval(tick, 1000);
  }

  /* ---------- session / guards ---------- */
  function currentUser() { return window.API.cachedUser(); }
  function requireLogin(role) {
    if (!window.API.isLoggedIn()) { location.href = "login.html?next=" + encodeURIComponent(location.pathname + location.search); return false; }
    if (role && (!currentUser() || currentUser().role !== role)) { toast("You don't have access to that area.", "error"); return false; }
    return true;
  }

  /* ---------- header ---------- */
  function renderHeader(active) {
    var user = currentUser();
    var host = document.getElementById("app-header");
    if (!host) return;
    var links = [
      { key: "browse", href: "auction.html", label: "Browse auctions" },
      { key: "submit", href: "submit.html", label: "Donate an item" },
      { key: "dashboard", href: "dashboard.html", label: "My dashboard" },
    ];
    if (user && user.role === "admin") links.push({ key: "admin", href: "admin.html", label: "Admin" });

    host.innerHTML =
      '<div class="appbar">' +
        '<a class="appbar-brand" href="/" title="Back to the main campaign site">' +
          '<span aria-hidden="true">💙</span> Valeria Fundraiser' +
        '</a>' +
        '<button class="appbar-toggle" aria-label="Toggle menu" aria-expanded="false">☰</button>' +
        '<nav class="appbar-nav" aria-label="Auction">' +
          links.map(function (l) {
            return '<a href="' + l.href + '"' + (l.key === active ? ' class="active" aria-current="page"' : "") + '>' + l.label + '</a>';
          }).join("") +
        '</nav>' +
        '<div class="appbar-right">' +
          notifBellHtml(user) +
          (user
            ? '<span class="appbar-user">' + esc(user.name.split(" ")[0]) + '</span>' +
              '<button class="btn-mini" data-logout>Log out</button>'
            : '<a class="btn-mini" href="login.html">Sign in</a>') +
          '<a class="btn-mini btn-mini-donate" href="' + GOFUNDME + '" target="_blank" rel="noopener">💙 Donate Now</a>' +
        '</div>' +
      '</div>';

    // Mobile menu toggle
    var toggle = host.querySelector(".appbar-toggle");
    var nav = host.querySelector(".appbar-nav");
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });

    var logoutBtn = host.querySelector("[data-logout]");
    if (logoutBtn) logoutBtn.addEventListener("click", function () { window.API.logout(); location.href = "auction.html"; });

    if (user) initNotifications();
  }

  /* ---------- notifications ---------- */
  function notifBellHtml(user) {
    if (!user) return "";
    return '<div class="notif" data-notif>' +
      '<button class="notif-btn" aria-label="Notifications" aria-expanded="false">🔔<span class="notif-count" hidden>0</span></button>' +
      '<div class="notif-panel" hidden><h3>Notifications</h3><ul class="notif-list"></ul></div>' +
      '</div>';
  }

  async function initNotifications() {
    var wrap = document.querySelector("[data-notif]");
    if (!wrap) return;
    var btn = wrap.querySelector(".notif-btn");
    var panel = wrap.querySelector(".notif-panel");
    var countEl = wrap.querySelector(".notif-count");
    var listEl = wrap.querySelector(".notif-list");

    async function load() {
      try {
        var data = await window.API.get("/notifications");
        countEl.hidden = data.unread === 0;
        countEl.textContent = data.unread;
        listEl.innerHTML = data.notifications.length
          ? data.notifications.slice(0, 12).map(function (n) {
              return '<li class="' + (n.read ? "" : "unread") + '">' +
                '<p>' + esc(n.message) + '</p>' +
                '<time>' + new Date(n.createdAt).toLocaleString() + '</time></li>';
            }).join("")
          : '<li class="empty">No notifications yet.</li>';
      } catch (e) { /* not logged in / offline */ }
    }

    btn.addEventListener("click", async function () {
      var open = panel.hidden;
      panel.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
      if (open) { await window.API.post("/notifications/read", {}).catch(function(){}); await load(); }
    });
    document.addEventListener("click", function (e) { if (!wrap.contains(e.target)) { panel.hidden = true; btn.setAttribute("aria-expanded","false"); } });

    await load();

    // Live push via SSE (token in query because EventSource can't set headers).
    try {
      var es = new EventSource(window.API.base + "/api/stream/notifications?token=" + encodeURIComponent(window.API.token()));
      es.addEventListener("notification", function (ev) {
        var n = JSON.parse(ev.data);
        toast(n.message, n.type === "outbid" ? "warn" : "info");
        load();
      });
    } catch (e) { /* SSE unsupported */ }
  }

  /* ---------- toasts ---------- */
  function toast(message, type) {
    var host = document.getElementById("toasts");
    if (!host) { host = document.createElement("div"); host.id = "toasts"; document.body.appendChild(host); }
    var el = document.createElement("div");
    el.className = "toast toast-" + (type || "info");
    el.setAttribute("role", "status");
    el.textContent = message;
    host.appendChild(el);
    setTimeout(function () { el.classList.add("show"); }, 10);
    setTimeout(function () { el.classList.remove("show"); setTimeout(function () { el.remove(); }, 300); }, 5000);
  }

  /* ---------- init ---------- */
  function init(active) {
    renderHeader(active);
    startCountdowns();
  }

  window.App = {
    init: init, money: money, esc: esc, timeLeft: timeLeft, toast: toast,
    currentUser: currentUser, requireLogin: requireLogin, GOFUNDME: GOFUNDME,
  };
})();
