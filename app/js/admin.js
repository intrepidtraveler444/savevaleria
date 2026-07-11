/* admin.js — admin console: stats, review queue (approve/reject/edit), all
   listings, fulfilment (ship/collect + disputes), and payments overview. */
(function () {
  "use strict";
  App.init("admin");
  if (!App.requireLogin("admin")) { setTimeout(function () { location.href = "login.html?next=/app/admin.html"; }, 50); return; }

  var modal = document.querySelector("[data-modal]");

  /* ---- tabs ---- */
  document.querySelectorAll(".tabs button").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll(".tabs button").forEach(function (x) { x.classList.remove("active"); x.setAttribute("aria-selected", "false"); });
      b.classList.add("active"); b.setAttribute("aria-selected", "true");
      document.querySelectorAll("[data-panel]").forEach(function (p) { p.classList.toggle("active", p.getAttribute("data-panel") === b.getAttribute("data-tab")); });
    });
  });

  function badge(s) { return '<span class="badge badge-' + s + '">' + s + '</span>'; }

  /* ---- stats ---- */
  async function loadStats() {
    try {
      var d = (await API.get("/admin/stats")).stats;
      var tile = function (v, l) { return '<div class="tile"><div class="v">' + v + '</div><div class="l">' + l + '</div></div>'; };
      document.querySelector("[data-stats]").innerHTML =
        tile(App.money(d.totalRaised), "Raised via auction") +
        tile(App.money(d.awaitingPayment), "Awaiting payment") +
        tile(d.liveAuctions, "Live auctions") +
        tile(d.pendingReview, "Pending review") +
        tile(d.totalBids, "Total bids") +
        tile(d.users, "Registered users");
    } catch (e) {}
  }

  /* ---- review queue ---- */
  async function loadReview() {
    var tb = document.querySelector("[data-review]");
    var d = await API.get("/admin/items?status=pending");
    tb.innerHTML = d.items.length ? d.items.map(function (it) {
      return '<tr>' +
        '<td><strong>' + App.esc(it.title) + '</strong><br><span class="muted">' + App.esc(it.category) + '</span></td>' +
        '<td>' + App.esc(it.donor ? it.donor.name : "") + '<br><span class="muted">' + App.esc(it.donor ? it.donor.email : "") + '</span></td>' +
        '<td>' + App.money(it.estimatedValue) + '</td>' +
        '<td>' + (it.reservePrice ? App.money(it.reservePrice) : "—") + '</td>' +
        '<td><input type="number" min="1" placeholder="Start $" value="' + Math.max(1, Math.round((it.estimatedValue || 20) * 0.1)) + '" data-start="' + it.id + '" style="width:90px" /> ' +
            '<input type="number" min="1" placeholder="Hours" value="120" data-hours="' + it.id + '" style="width:80px" /></td>' +
        '<td><div class="actions">' +
          '<button class="btn-xs ok" data-approve="' + it.id + '">Approve</button>' +
          '<button class="btn-xs danger" data-reject="' + it.id + '">Reject</button>' +
          '<button class="btn-xs" data-edit="' + it.id + '">Edit</button>' +
        '</div></td></tr>';
    }).join("") : '<tr><td colspan="6" class="muted">Nothing awaiting review. 🎉</td></tr>';

    tb.querySelectorAll("[data-approve]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var id = b.getAttribute("data-approve");
        var startingBid = document.querySelector('[data-start="' + id + '"]').value;
        var durationHours = document.querySelector('[data-hours="' + id + '"]').value;
        try { await API.post("/admin/items/" + id + "/approve", { startingBid: startingBid, durationHours: durationHours }); App.toast("Approved and now live.", "success"); refresh(); }
        catch (e) { App.toast(e.message, "error"); }
      });
    });
    tb.querySelectorAll("[data-reject]").forEach(function (b) {
      b.addEventListener("click", function () { rejectModal(b.getAttribute("data-reject")); });
    });
    tb.querySelectorAll("[data-edit]").forEach(function (b) {
      b.addEventListener("click", function () { editModal(b.getAttribute("data-edit")); });
    });
  }

  /* ---- all listings ---- */
  async function loadListings() {
    var tb = document.querySelector("[data-listings]");
    var status = document.querySelector("[data-status-filter]").value;
    var d = await API.get("/admin/items?status=" + status);
    tb.innerHTML = d.items.length ? d.items.map(function (it) {
      return '<tr>' +
        '<td><strong>' + App.esc(it.title) + '</strong></td>' +
        '<td>' + badge(it.status) + '</td>' +
        '<td>' + App.money(it.currentBid != null ? it.currentBid : it.startingBid) + '</td>' +
        '<td>' + it.bidCount + '</td>' +
        '<td>' + (it.endAt ? new Date(it.endAt).toLocaleString() : "—") + '</td>' +
        '<td><div class="actions">' +
          '<button class="btn-xs" data-edit="' + it.id + '">Edit</button>' +
          (it.status === "live" ? '<a class="btn-xs" href="item.html?id=' + it.id + '" target="_blank">View</a>' : "") +
        '</div></td></tr>';
    }).join("") : '<tr><td colspan="6" class="muted">No listings.</td></tr>';
    tb.querySelectorAll("[data-edit]").forEach(function (b) { b.addEventListener("click", function () { editModal(b.getAttribute("data-edit")); }); });
  }
  document.querySelector("[data-status-filter]").addEventListener("change", loadListings);

  /* ---- fulfilment ---- */
  async function loadFulfilment() {
    var tb = document.querySelector("[data-fulfilment]");
    var d = await API.get("/admin/items?status=all");
    var rows = d.items.filter(function (it) { return ["paid", "shipped", "collected"].includes(it.status) || (it.dispute && it.dispute.open); });
    tb.innerHTML = rows.length ? rows.map(function (it) {
      var c = it.collection || {};
      var actions = it.status === "paid"
        ? '<button class="btn-xs ok" data-fulfil="' + it.id + '" data-state="shipped">Mark shipped</button>' +
          '<button class="btn-xs ok" data-fulfil="' + it.id + '" data-state="collected">Mark collected</button>'
        : badge(it.status);
      var disp = (it.dispute && it.dispute.open) ? '<br><span class="badge badge-outbid">dispute open</span>' : "";
      return '<tr>' +
        '<td><strong>' + App.esc(it.title) + '</strong>' + disp + '</td>' +
        '<td>' + App.money(it.winningBid) + '</td>' +
        '<td>' + badge(it.status) + '</td>' +
        '<td>' + App.esc(c.location || "") + (c.shippingAvailable ? " · ships" : "") + '</td>' +
        '<td><div class="actions">' + actions +
          '<button class="btn-xs" data-dispute="' + it.id + '">Dispute</button></div></td></tr>';
    }).join("") : '<tr><td colspan="5" class="muted">No items awaiting fulfilment.</td></tr>';

    tb.querySelectorAll("[data-fulfil]").forEach(function (b) {
      b.addEventListener("click", async function () {
        try { await API.post("/admin/items/" + b.getAttribute("data-fulfil") + "/fulfil", { state: b.getAttribute("data-state") }); App.toast("Updated.", "success"); refresh(); }
        catch (e) { App.toast(e.message, "error"); }
      });
    });
    tb.querySelectorAll("[data-dispute]").forEach(function (b) { b.addEventListener("click", function () { disputeModal(b.getAttribute("data-dispute")); }); });
  }

  /* ---- payments ---- */
  async function loadPayments() {
    var tb = document.querySelector("[data-payments]");
    var d = await API.get("/admin/payments");
    tb.innerHTML = d.payments.length ? d.payments.map(function (p) {
      return '<tr><td>' + App.esc(p.itemTitle) + '</td>' +
        '<td>' + App.esc(p.bidder ? p.bidder.name : "—") + '</td>' +
        '<td>' + App.money(p.amount) + '</td>' +
        '<td>' + badge(p.status === "paid" ? "paid" : "pending") + '</td>' +
        '<td>' + App.esc(p.provider || "—") + '</td>' +
        '<td>' + new Date(p.createdAt).toLocaleDateString() + '</td></tr>';
    }).join("") : '<tr><td colspan="6" class="muted">No payments yet.</td></tr>';
  }

  /* ---- modals ---- */
  function openModal(html) {
    modal.innerHTML = '<div style="padding:1.5rem">' + html + '</div>';
    modal.showModal();
    modal.querySelectorAll("[data-close]").forEach(function (b) { b.addEventListener("click", function () { modal.close(); }); });
  }

  function rejectModal(id) {
    openModal('<h3>Reject listing</h3><div class="field"><label for="rej">Reason (shared with donor)</label>' +
      '<textarea id="rej" rows="3" placeholder="e.g. Item not suitable for auction."></textarea></div>' +
      '<div class="wizard-actions"><button class="btn btn-ghost" data-close>Cancel</button>' +
      '<button class="btn btn-accent" data-do>Reject</button></div>');
    modal.querySelector("[data-do]").addEventListener("click", async function () {
      try { await API.post("/admin/items/" + id + "/reject", { reason: document.getElementById("rej").value }); App.toast("Rejected.", "info"); modal.close(); refresh(); }
      catch (e) { App.toast(e.message, "error"); }
    });
  }

  async function editModal(id) {
    var d = await API.get("/admin/items?status=all");
    var it = d.items.find(function (x) { return x.id === id; });
    if (!it) return;
    openModal('<h3>Edit listing</h3>' +
      '<div class="field"><label for="e-title">Title</label><input id="e-title" value="' + App.esc(it.title) + '" /></div>' +
      '<div class="field"><label for="e-desc">Description</label><textarea id="e-desc" rows="3">' + App.esc(it.description) + '</textarea></div>' +
      '<div class="two"><div class="field"><label for="e-val">Est. value</label><input id="e-val" type="number" value="' + it.estimatedValue + '" /></div>' +
      '<div class="field"><label for="e-start">Starting bid</label><input id="e-start" type="number" value="' + (it.startingBid || "") + '" /></div></div>' +
      '<div class="wizard-actions"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-accent" data-do>Save</button></div>');
    modal.querySelector("[data-do]").addEventListener("click", async function () {
      try {
        await API.patch("/admin/items/" + id, {
          title: document.getElementById("e-title").value,
          description: document.getElementById("e-desc").value,
          estimatedValue: document.getElementById("e-val").value,
          startingBid: document.getElementById("e-start").value,
        });
        App.toast("Saved.", "success"); modal.close(); refresh();
      } catch (e) { App.toast(e.message, "error"); }
    });
  }

  function disputeModal(id) {
    openModal('<h3>Dispute</h3><p class="muted">Open a dispute or record a resolution (both parties are notified on resolve).</p>' +
      '<div class="field"><label for="d-note">Resolution / note</label><textarea id="d-note" rows="3"></textarea></div>' +
      '<div class="wizard-actions"><button class="btn btn-ghost" data-do-open>Open dispute</button>' +
      '<button class="btn btn-accent" data-do-resolve>Resolve</button></div>' +
      '<p style="text-align:right;margin:.5rem 0 0"><button class="btn-xs" data-close>Close</button></p>');
    modal.querySelector("[data-do-open]").addEventListener("click", async function () {
      try { await API.post("/admin/items/" + id + "/dispute", { action: "open", note: document.getElementById("d-note").value }); App.toast("Dispute opened.", "warn"); modal.close(); refresh(); } catch (e) { App.toast(e.message, "error"); }
    });
    modal.querySelector("[data-do-resolve]").addEventListener("click", async function () {
      try { await API.post("/admin/items/" + id + "/dispute", { action: "resolve", resolution: document.getElementById("d-note").value }); App.toast("Dispute resolved.", "success"); modal.close(); refresh(); } catch (e) { App.toast(e.message, "error"); }
    });
  }

  /* ---- refresh all ---- */
  function refresh() { loadStats(); loadReview(); loadListings(); loadFulfilment(); loadPayments(); }
  refresh();
  setInterval(loadStats, 30000);
})();
