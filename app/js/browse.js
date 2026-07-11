/* browse.js — auction listing page: search, category filter, sort, live-ish grid. */
(function () {
  "use strict";
  App.init("browse");

  var state = { q: "", category: "all", sort: "ending" };
  var searchEl = document.querySelector("[data-search]");
  var sortEl = document.querySelector("[data-sort]");
  var chipsEl = document.querySelector("[data-categories]");
  var resultsEl = document.querySelector("[data-results]");
  var debounce;

  function cardHtml(item) {
    var t = App.timeLeft(item.endAt);
    var media = item.photos && item.photos[0]
      ? '<img src="' + App.esc(item.photos[0]) + '" alt="' + App.esc(item.title) + '" loading="lazy" />'
      : '<span class="ph" aria-hidden="true">🎁</span>';
    return '<article class="card">' +
      '<a class="card-media" href="item.html?id=' + item.id + '" aria-label="' + App.esc(item.title) + '">' +
        media + '<span class="badge badge-live">Live</span>' +
      '</a>' +
      '<div class="card-body">' +
        '<span class="card-cat">' + App.esc(item.category) + '</span>' +
        '<h3 class="card-title"><a href="item.html?id=' + item.id + '">' + App.esc(item.title) + '</a></h3>' +
        '<div class="card-row">' +
          '<span class="card-bid">' + App.money(item.currentBid != null ? item.currentBid : item.startingBid) +
            '<small>' + (item.currentBid != null ? item.bidCount + " bid" + (item.bidCount === 1 ? "" : "s") : "Starting bid") + '</small></span>' +
          '<span class="card-meta">' +
            '<span class="card-time' + (t.urgent ? " is-urgent" : "") + '" data-countdown="' + App.esc(item.endAt) + '">' + t.text + '</span> left' +
            (item.hasReserve ? '<br><small>' + (item.reserveMet ? "Reserve met" : "Reserve not met") + '</small>' : "") +
          '</span>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function renderChips(categories) {
    var all = ["all"].concat(categories);
    chipsEl.innerHTML = all.map(function (c) {
      return '<button class="chip' + (state.category === c ? " active" : "") + '" data-cat="' + App.esc(c) + '">' +
        (c === "all" ? "All categories" : App.esc(c)) + '</button>';
    }).join("");
    chipsEl.querySelectorAll(".chip").forEach(function (b) {
      b.addEventListener("click", function () { state.category = b.getAttribute("data-cat"); load(); });
    });
  }

  async function load() {
    var qs = new URLSearchParams({ q: state.q, category: state.category, sort: state.sort });
    try {
      var data = await API.get("/auctions?" + qs.toString());
      if (chipsEl.children.length === 0 || chipsEl.dataset.init !== "1") { renderChips(data.categories); chipsEl.dataset.init = "1"; }
      else chipsEl.querySelectorAll(".chip").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-cat") === state.category); });

      resultsEl.innerHTML = data.items.length
        ? data.items.map(cardHtml).join("")
        : '<div class="empty-state" style="grid-column:1/-1"><div class="ic">🔍</div>' +
          '<p>No live auctions match your search right now.</p>' +
          '<a class="btn btn-ghost" href="submit.html">Donate an item to the auction</a></div>';
    } catch (e) {
      resultsEl.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><p>Could not load auctions. Is the server running?</p></div>';
    }
  }

  searchEl.addEventListener("input", function () {
    clearTimeout(debounce);
    debounce = setTimeout(function () { state.q = searchEl.value.trim(); load(); }, 250);
  });
  sortEl.addEventListener("change", function () { state.sort = sortEl.value; load(); });

  load();
  setInterval(load, 20000); // refresh listing so bids/time stay current
})();
