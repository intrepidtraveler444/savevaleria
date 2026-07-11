/* dashboard.js — personal dashboard: auctions I'm bidding on (with pay-now for
   wins) and items I've donated (with live status). */
(function () {
  "use strict";
  App.init("dashboard");
  if (!App.requireLogin()) return;

  // Tabs
  document.querySelectorAll(".tabs button").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll(".tabs button").forEach(function (x) { x.classList.remove("active"); x.setAttribute("aria-selected", "false"); });
      b.classList.add("active"); b.setAttribute("aria-selected", "true");
      document.querySelectorAll("[data-panel]").forEach(function (p) { p.classList.toggle("active", p.getAttribute("data-panel") === b.getAttribute("data-tab")); });
    });
  });

  function badge(status) { return '<span class="badge badge-' + status + '">' + status + '</span>'; }
  function thumb(item) {
    return item.photos && item.photos[0]
      ? '<img class="thumb" src="' + App.esc(item.photos[0]) + '" alt="" />'
      : '<div class="thumb">🎁</div>';
  }

  /* ---- Bids ---- */
  async function loadBids() {
    var host = document.querySelector("[data-bids]");
    try {
      var data = await API.get("/bids/mine");
      if (!data.entries.length) {
        host.innerHTML = '<div class="empty-state"><div class="ic">🙋</div><p>You haven\'t bid on anything yet.</p><a class="btn btn-accent" href="auction.html">Browse auctions</a></div>';
        return;
      }
      host.innerHTML = data.entries.map(function (e) {
        var it = e.item;
        var state = e.won ? '<span class="badge badge-won">You won!</span>'
          : e.leading ? '<span class="badge badge-leading">Leading</span>'
          : it.status === "live" ? '<span class="badge badge-outbid">Outbid</span>'
          : '<span class="badge badge-unsold">Ended</span>';
        var action = e.won
          ? (it.status === "paid" || it.status === "shipped" || it.status === "collected"
              ? '<span class="badge badge-paid">Paid</span>'
              : '<button class="btn btn-accent" data-pay="' + it.id + '">Pay ' + App.money(it.winningBid) + '</button>')
          : it.status === "live"
            ? '<a class="btn btn-ghost" href="item.html?id=' + it.id + '">' + (e.leading ? "View" : "Bid again") + '</a>'
            : '<a class="btn-xs" href="item.html?id=' + it.id + '">View</a>';
        return '<div class="list-row">' + thumb(it) +
          '<div class="grow"><h4>' + App.esc(it.title) + '</h4>' +
            '<div class="sub">' + state + ' · Current ' + App.money(it.currentBid) +
              ' · Your best ' + App.money(e.myHighestBid) +
              (it.status === "live" ? ' · ends in <span data-countdown="' + App.esc(it.endAt) + '"></span>' : "") + '</div></div>' +
          '<div>' + action + '</div></div>';
      }).join("");

      host.querySelectorAll("[data-pay]").forEach(function (btn) {
        btn.addEventListener("click", function () { pay(btn.getAttribute("data-pay"), btn); });
      });
    } catch (e) { host.innerHTML = '<p class="muted">Could not load your bids.</p>'; }
  }

  async function pay(itemId, btn) {
    btn.setAttribute("aria-disabled", "true"); btn.textContent = "Starting checkout…";
    try {
      var r = await API.post("/payments/checkout", { itemId: itemId });
      if (r.alreadyPaid) { App.toast("Already paid.", "info"); loadBids(); return; }
      location.href = r.url; // mock checkout page or Stripe
    } catch (e) {
      btn.removeAttribute("aria-disabled"); btn.textContent = "Pay";
      App.toast(e.message, "error");
    }
  }

  /* ---- Donated items ---- */
  async function loadItems() {
    var host = document.querySelector("[data-items]");
    try {
      var data = await API.get("/items/mine");
      if (!data.items.length) {
        host.innerHTML = '<div class="empty-state"><div class="ic">🎁</div><p>You haven\'t donated any items yet.</p><a class="btn btn-accent" href="submit.html">Donate an item</a></div>';
        return;
      }
      host.innerHTML = data.items.map(function (it) {
        var extra = it.status === "pending" ? "Awaiting admin review"
          : it.status === "rejected" ? ("Not approved: " + App.esc(it.rejectionReason || ""))
          : it.status === "live" ? ("Live · " + App.money(it.currentBid != null ? it.currentBid : it.startingBid) + " · " + it.bidCount + " bids · ends in ")
          : it.status === "won" ? ("Sold for " + App.money(it.winningBid) + " · awaiting payment")
          : it.status === "paid" ? ("Sold for " + App.money(it.winningBid) + " · paid, arranging collection")
          : it.status === "unsold" ? "Ended without a sale"
          : it.status;
        return '<div class="list-row">' + thumb(it) +
          '<div class="grow"><h4>' + App.esc(it.title) + ' ' + badge(it.status) + '</h4>' +
            '<div class="sub">' + extra +
              (it.status === "live" ? '<span data-countdown="' + App.esc(it.endAt) + '"></span>' : "") + '</div></div>' +
          '<div><a class="btn-xs" href="' + (it.status === "live" ? "item.html?id=" + it.id : "#") + '">' +
            (it.status === "live" ? "View listing" : "") + '</a></div></div>';
      }).join("");
    } catch (e) { host.innerHTML = '<p class="muted">Could not load your items.</p>'; }
  }

  // If we just returned from checkout success, confirm any pending payment.
  (async function handleReturn() {
    var params = new URLSearchParams(location.search);
    if (params.get("paid") === "1") App.toast("Thanks! Confirming your payment…", "info");
  })();

  loadBids();
  loadItems();
})();
