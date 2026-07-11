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
        tile(d.awaitingConfirmation || 0, "Payments to confirm") +
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
            '<input type="number" min="1" placeholder="Hours" value="' + (it.requestedDurationHours || 120) + '" data-hours="' + it.id + '" style="width:80px" title="Donor asked for ' + (it.requestedDurationHours ? Math.round(it.requestedDurationHours / 24) + ' days' : 'no preference') + '" /></td>' +
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
          (it.status !== "removed" ? '<button class="btn-xs danger" data-takedown="' + it.id + '">Take down</button>' : "") +
        '</div></td></tr>';
    }).join("") : '<tr><td colspan="6" class="muted">No listings.</td></tr>';
    tb.querySelectorAll("[data-edit]").forEach(function (b) { b.addEventListener("click", function () { editModal(b.getAttribute("data-edit")); }); });
    tb.querySelectorAll("[data-takedown]").forEach(function (b) { b.addEventListener("click", function () { takedownModal(b.getAttribute("data-takedown")); }); });
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
    // Show payments awaiting confirmation first.
    d.payments.sort(function (a, b) { return (a.status === "submitted" ? -1 : 0) - (b.status === "submitted" ? -1 : 0); });
    tb.innerHTML = d.payments.length ? d.payments.map(function (p) {
      var statusLabel = p.status === "paid" ? '<span class="badge badge-paid">paid</span>'
        : p.status === "submitted" ? '<span class="badge badge-pending">awaiting confirmation</span>'
        : '<span class="badge badge-unsold">' + App.esc(p.status) + '</span>';
      var actions = p.status === "submitted"
        ? '<button class="btn-xs ok" data-confirm="' + p.id + '">Confirm received</button>' +
          '<button class="btn-xs danger" data-reject-pay="' + p.id + '">Reject</button>'
        : (p.status === "paid" ? '<span class="muted">✓</span>' : '<span class="muted">—</span>');
      return '<tr><td>' + App.esc(p.itemTitle) + '</td>' +
        '<td>' + App.esc(p.bidder ? p.bidder.name : "—") +
          (p.bidder ? '<br><span class="muted">' + App.esc(p.bidder.email) + '</span>' : "") + '</td>' +
        '<td>' + App.money(p.amount) + '</td>' +
        '<td>' + statusLabel + '</td>' +
        '<td>' + new Date(p.createdAt).toLocaleDateString() + '</td>' +
        '<td><div class="actions">' + actions + '</div></td></tr>';
    }).join("") : '<tr><td colspan="6" class="muted">No payments yet.</td></tr>';

    tb.querySelectorAll("[data-confirm]").forEach(function (b) {
      b.addEventListener("click", async function () {
        try { await API.post("/admin/payments/" + b.getAttribute("data-confirm") + "/confirm", {}); App.toast("Payment confirmed — buyer notified with collection details.", "success"); refresh(); }
        catch (e) { App.toast(e.message, "error"); }
      });
    });
    tb.querySelectorAll("[data-reject-pay]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var reason = prompt("Reason (shared with the bidder):", "We couldn't find a matching GoFundMe donation. Please check the amount and try again.");
        if (reason === null) return;
        try { await API.post("/admin/payments/" + b.getAttribute("data-reject-pay") + "/reject", { reason: reason }); App.toast("Payment rejected — bidder asked to retry.", "info"); refresh(); }
        catch (e) { App.toast(e.message, "error"); }
      });
    });
  }

  /* ---- team / admins ---- */
  async function loadUsers() {
    var tb = document.querySelector("[data-users]");
    if (!tb) return;
    var me = App.currentUser();
    var d = await API.get("/admin/users");
    tb.innerHTML = d.users.map(function (u) {
      var isMe = me && u.id === me.id;
      var action = u.role === "admin"
        ? (isMe ? '<span class="muted">you</span>' : '<button class="btn-xs" data-demote="' + u.id + '">Remove admin</button>')
        : '<button class="btn-xs ok" data-promote="' + u.id + '">Make admin</button>';
      return '<tr><td>' + App.esc(u.name) + '</td>' +
        '<td>' + App.esc(u.email) + '</td>' +
        '<td>' + (u.role === "admin" ? '<span class="badge badge-won">admin</span>' : '<span class="badge">member</span>') + '</td>' +
        '<td>' + action + '</td></tr>';
    }).join("");

    tb.querySelectorAll("[data-promote]").forEach(function (b) {
      b.addEventListener("click", function () { setRole(b.getAttribute("data-promote"), "admin"); });
    });
    tb.querySelectorAll("[data-demote]").forEach(function (b) {
      b.addEventListener("click", function () { if (confirm("Remove admin access from this person?")) setRole(b.getAttribute("data-demote"), "member"); });
    });
  }
  async function setRole(id, role) {
    try { await API.post("/admin/users/" + id + "/role", { role: role }); App.toast(role === "admin" ? "Admin access granted." : "Admin access removed.", "success"); loadUsers(); loadStats(); }
    catch (e) { App.toast(e.message, "error"); }
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

  function takedownModal(id) {
    openModal('<h3>Take down item</h3>' +
      '<p class="muted">Removes this item from the auction. The donor and any bidders are ' +
      'notified, and any pending payment is cancelled.</p>' +
      '<div class="field"><label for="td-reason">Reason (shared with the donor)</label>' +
      '<textarea id="td-reason" rows="2" placeholder="e.g. Withdrawn at the donor\'s request."></textarea></div>' +
      '<label class="checkbox"><input type="checkbox" id="td-purge" /> ' +
      '<span>Also delete permanently — removes all record of it, its bids and photos. ' +
      'Leave unticked to keep it with a "removed" status.</span></label>' +
      '<div class="wizard-actions"><button class="btn btn-ghost" data-close>Cancel</button>' +
      '<button class="btn btn-accent" data-do>Take down</button></div>');
    modal.querySelector("[data-do]").addEventListener("click", async function () {
      try {
        var r = await API.post("/admin/items/" + id + "/takedown", {
          reason: document.getElementById("td-reason").value,
          purge: document.getElementById("td-purge").checked,
        });
        App.toast(r.purged ? "Item deleted permanently." : "Item taken down.", "info");
        modal.close(); refresh();
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
  function refresh() { loadStats(); loadReview(); loadListings(); loadFulfilment(); loadPayments(); loadUsers(); }
  refresh();
  setInterval(loadStats, 30000);
})();
