/* item.js — item detail, gallery, bidding with live SSE updates, bid history,
   collection & delivery details. */
(function () {
  "use strict";
  App.init("browse");

  var id = new URLSearchParams(location.search).get("id");
  var host = document.querySelector("[data-detail]");
  var current = null;

  if (!id) { host.innerHTML = "<p>Item not found.</p>"; return; }

  function statusBadge(s) {
    var map = { live: "badge-live", won: "badge-won", paid: "badge-paid", unsold: "badge-unsold", shipped: "badge-shipped", collected: "badge-collected" };
    return '<span class="badge ' + (map[s] || "") + '">' + s + '</span>';
  }

  function galleryHtml(item) {
    if (!item.photos || !item.photos.length) {
      return '<div class="gallery-main"><span class="ph" aria-hidden="true">🎁</span></div>';
    }
    var main = '<div class="gallery-main"><img src="' + App.esc(item.photos[0]) + '" alt="' + App.esc(item.title) + '" data-main /></div>';
    var thumbs = item.photos.length > 1
      ? '<div class="gallery-thumbs">' + item.photos.map(function (p, i) {
          return '<button class="' + (i === 0 ? "active" : "") + '" data-thumb="' + App.esc(p) + '"><img src="' + App.esc(p) + '" alt="View ' + (i + 1) + '" /></button>';
        }).join("") + '</div>'
      : "";
    return main + thumbs;
  }

  function collectionHtml(c) {
    if (!c) return "";
    return '<div class="collection">' +
      '<h3>📦 Collection &amp; Delivery</h3>' +
      '<dl class="dl">' +
        row("Location", App.esc(c.location)) +
        row("Shipping", c.shippingAvailable ? ("Available" + (c.shippingCost ? " (" + App.money(c.shippingCost) + ")" : c.shippingCost === 0 ? " (free)" : "")) : "Collection only") +
        (c.times ? row("Availability", App.esc(c.times)) : "") +
        (c.instructions ? row("Instructions", App.esc(c.instructions)) : "") +
        row("Contact after auction", App.esc(c.contactMethod)) +
      '</dl>' +
      '<p class="field-help" style="margin-top:.75rem">Full contact details are shared with the winner once payment is confirmed.</p>' +
    '</div>';
  }
  function row(k, v) { return v ? "<dt>" + k + "</dt><dd>" + v + "</dd>" : ""; }

  function bidPanelHtml(item) {
    var user = App.currentUser();
    var live = item.status === "live";
    var isDonor = user && item && item.donor && false; // donor id not exposed publicly; server enforces anyway
    var body;
    if (live) {
      body =
        '<div class="bid-now">' + App.money(item.currentBid != null ? item.currentBid : item.startingBid) + '</div>' +
        '<div class="bid-sub">' + (item.currentBid != null ? item.bidCount + " bid" + (item.bidCount === 1 ? "" : "s") : "Starting bid — be the first!") +
          ' · ends in <strong data-countdown="' + App.esc(item.endAt) + '">' + App.timeLeft(item.endAt).text + '</strong></div>' +
        (item.hasReserve ? '<p class="reserve-note ' + (item.reserveMet ? "" : "muted") + '">' + (item.reserveMet ? "✓ Reserve price met" : "Reserve price not yet met") + '</p>' : "") +
        (user
          ? '<form class="bid-form" data-bidform>' +
              '<div class="input-prefix"><span>$</span>' +
              '<input type="number" inputmode="numeric" min="' + item.minNextBid + '" step="1" placeholder="' + item.minNextBid + '" aria-label="Your bid in dollars" required /></div>' +
              '<button class="btn btn-accent" type="submit">Place bid</button>' +
            '</form>' +
            '<p class="field-help">Enter ' + App.money(item.minNextBid) + ' or more.</p>' +
            '<p class="field-error" data-biderror hidden></p>'
          : '<a class="btn btn-accent btn-block btn-lg" href="login.html?next=' + encodeURIComponent(location.pathname + location.search) + '">Sign in to bid</a>');
    } else if (item.status === "won" || item.status === "paid") {
      body = '<div class="bid-now">' + App.money(item.winningBid) + '</div><div class="bid-sub">Winning bid</div>' +
             '<p class="reserve-note">' + (item.status === "paid" ? "✓ Paid — arranging collection." : "Auction ended — awaiting payment.") + '</p>' +
             '<a class="btn btn-ghost btn-block" href="dashboard.html">Go to my dashboard</a>';
    } else {
      body = '<div class="bid-sub">This auction has ended' + (item.status === "unsold" ? " without a sale." : ".") + '</div>' +
             '<a class="btn btn-ghost btn-block" href="auction.html">Browse other auctions</a>';
    }
    return '<div class="panel">' + body + '</div>';
  }

  function render(item, bids) {
    current = item;
    document.title = item.title + " · Help Valeria Recover";
    host.innerHTML =
      '<div>' + galleryHtml(item) +
        '<div class="panel" style="margin-top:1.25rem">' +
          '<div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">' +
            '<span class="card-cat">' + App.esc(item.category) + '</span>' + statusBadge(item.status) +
            (item.condition ? '<span class="badge">' + App.esc(item.condition) + '</span>' : "") +
          '</div>' +
          '<h1 style="margin:.5rem 0">' + App.esc(item.title) + '</h1>' +
          '<p>' + App.esc(item.description) + '</p>' +
          '<dl class="dl"><dt>Estimated value</dt><dd>' + App.money(item.estimatedValue) + '</dd></dl>' +
        '</div>' +
        collectionHtml(item.collection) +
      '</div>' +
      '<div>' +
        bidPanelHtml(item) +
        '<div class="panel"><h3>Bid history</h3>' +
          '<ul class="history" data-history>' + historyHtml(bids) + '</ul>' +
        '</div>' +
      '</div>';

    wireGallery();
    wireBidForm();
  }

  function historyHtml(bids) {
    if (!bids || !bids.length) return '<li class="muted" style="border:0">No bids yet — be the first!</li>';
    return bids.map(function (b) {
      return '<li><span>' + App.esc(b.bidder) + '</span><span>' + App.money(b.amount) +
        ' <time>' + new Date(b.createdAt).toLocaleTimeString() + '</time></span></li>';
    }).join("");
  }

  function wireGallery() {
    var main = host.querySelector("[data-main]");
    host.querySelectorAll("[data-thumb]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (main) main.src = btn.getAttribute("data-thumb");
        host.querySelectorAll("[data-thumb]").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
      });
    });
  }

  function wireBidForm() {
    var form = host.querySelector("[data-bidform]");
    if (!form) return;
    var errEl = host.querySelector("[data-biderror]");
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      errEl.hidden = true;
      var input = form.querySelector("input");
      var amount = Number(input.value);
      try {
        var r = await API.post("/auctions/" + id + "/bids", { amount: amount });
        App.toast("Bid placed: " + App.money(r.bid.amount) + (r.extended ? " · time extended!" : ""), "success");
        await refresh();
      } catch (err) {
        errEl.hidden = false; errEl.textContent = err.message;
      }
    });
  }

  async function refresh() {
    var data = await API.get("/auctions/" + id);
    render(data.item, data.bids);
  }

  // Live updates via SSE — new bids from anyone update this page instantly.
  function connectLive() {
    try {
      var es = new EventSource(window.API.base + "/api/stream/auctions/" + id);
      es.addEventListener("bid", function () { refresh(); });
    } catch (e) { /* fallback: periodic refresh below */ }
    setInterval(function () { if (current && current.status === "live") refresh(); }, 15000);
  }

  (async function start() {
    try {
      var data = await API.get("/auctions/" + id);
      render(data.item, data.bids);
      connectLive();
    } catch (e) {
      host.innerHTML = '<div class="empty-state"><p>' + App.esc(e.message) + '</p><a class="btn btn-ghost" href="auction.html">Back to auctions</a></div>';
    }
  })();
})();
