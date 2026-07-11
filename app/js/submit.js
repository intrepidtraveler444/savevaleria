/* submit.js — multi-step item-donation wizard with drag-and-drop photo uploads,
   per-step validation, and a review screen. Requires a signed-in user. */
(function () {
  "use strict";
  App.init("submit");
  if (!App.requireLogin()) return;

  var form = document.querySelector("[data-wizard]");
  var statusEl = document.querySelector("[data-status]");
  var steps = Array.prototype.slice.call(form.querySelectorAll(".wizard-step"));
  var labels = Array.prototype.slice.call(form.querySelectorAll("[data-step-label]"));
  var prevBtn = form.querySelector("[data-prev]");
  var nextBtn = form.querySelector("[data-next]");
  var submitBtn = form.querySelector("[data-submit]");
  var step = 0;
  var photos = []; // data URLs

  /* ---- categories ---- */
  API.get("/categories").then(function (d) {
    var sel = document.getElementById("w-category");
    d.categories.forEach(function (c) { var o = document.createElement("option"); o.value = c; o.textContent = c; sel.appendChild(o); });
  });

  /* ---- validation per step ---- */
  var rules = {
    0: [
      ["title", function (v) { return v.trim().length >= 3 ? "" : "Please add a title (3+ characters)."; }],
      ["category", function (v) { return v ? "" : "Please choose a category."; }],
      ["description", function (v) { return v.trim().length >= 10 ? "" : "Please add a longer description."; }],
      ["estimatedValue", function (v) { return Number(v) >= 1 ? "" : "Enter an estimated value of at least $1."; }],
      ["reservePrice", function (v) { return v === "" || Number(v) >= 1 ? "" : "Reserve must be at least $1, or blank."; }],
    ],
    2: [
      ["location", function (v) { return v.trim() ? "" : "Please add a collection location."; }, "collection"],
      ["contactMethod", function (v) { return v.trim() ? "" : "Please add a contact method."; }],
    ],
    3: [],
  };

  function field(name) { return form.querySelector('[name="' + name + '"]'); }
  function showErr(key, msg) {
    var p = form.querySelector('[data-err="' + key + '"]');
    var el = field(key) || form.querySelector('[name="' + key + '"]');
    if (p) { p.hidden = !msg; p.textContent = msg; }
    if (el) { if (msg) el.setAttribute("aria-invalid", "true"); else el.removeAttribute("aria-invalid"); }
  }

  function validateStep(i) {
    var ok = true;
    (rules[i] || []).forEach(function (r) {
      var name = r[0], test = r[1], key = r[2] || r[0];
      var el = field(name);
      var msg = test(el ? el.value : "");
      showErr(key, msg);
      if (msg && ok) { ok = false; if (el) el.focus(); }
    });
    if (i === 3) {
      var consent = form.querySelector("[data-consent]");
      if (!consent.checked) { showErr("consent", "Please confirm you can donate this item."); if (ok) consent.focus(); ok = false; }
      else showErr("consent", "");
    }
    return ok;
  }

  /* ---- navigation ---- */
  function goto(i) {
    step = i;
    steps.forEach(function (s, idx) { s.classList.toggle("active", idx === i); });
    labels.forEach(function (l, idx) { l.classList.toggle("active", idx === i); l.classList.toggle("done", idx < i); });
    prevBtn.hidden = i === 0;
    nextBtn.hidden = i === steps.length - 1;
    submitBtn.hidden = i !== steps.length - 1;
    if (i === steps.length - 1) buildReview();
    statusEl.hidden = true;
    window.scrollTo({ top: form.offsetTop - 20, behavior: "smooth" });
  }

  nextBtn.addEventListener("click", function () { if (validateStep(step)) goto(Math.min(step + 1, steps.length - 1)); });
  prevBtn.addEventListener("click", function () { goto(Math.max(step - 1, 0)); });

  /* ---- shipping toggle ---- */
  var shipChk = form.querySelector("[data-shipping]");
  var shipCost = form.querySelector("[data-shipcost]");
  shipChk.addEventListener("change", function () { shipCost.hidden = !shipChk.checked; });

  /* ---- photos: drag & drop + click ---- */
  var dz = form.querySelector("[data-dropzone]");
  var fileInput = form.querySelector("[data-file]");
  var thumbs = form.querySelector("[data-thumbs]");

  dz.addEventListener("click", function () { fileInput.click(); });
  dz.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); } });
  ["dragover", "dragenter"].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add("drag"); }); });
  ["dragleave", "drop"].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove("drag"); }); });
  dz.addEventListener("drop", function (e) { addFiles(e.dataTransfer.files); });
  fileInput.addEventListener("change", function () { addFiles(fileInput.files); fileInput.value = ""; });

  function addFiles(fileList) {
    Array.prototype.slice.call(fileList).forEach(function (file) {
      if (!/^image\//.test(file.type)) return;
      if (file.size > 5 * 1024 * 1024) { App.toast('"' + file.name + '" is over 5MB and was skipped.', "warn"); return; }
      if (photos.length >= 8) { App.toast("You can add up to 8 photos.", "warn"); return; }
      var reader = new FileReader();
      reader.onload = function () { photos.push(reader.result); renderThumbs(); };
      reader.readAsDataURL(file);
    });
  }
  function renderThumbs() {
    thumbs.innerHTML = photos.map(function (src, i) {
      return '<li><img src="' + src + '" alt="Photo ' + (i + 1) + '" /><button type="button" aria-label="Remove photo" data-rm="' + i + '">×</button></li>';
    }).join("");
    thumbs.querySelectorAll("[data-rm]").forEach(function (b) {
      b.addEventListener("click", function () { photos.splice(Number(b.getAttribute("data-rm")), 1); renderThumbs(); });
    });
  }

  /* ---- review ---- */
  function buildReview() {
    var v = function (n) { var el = field(n); return el ? el.value : ""; };
    document.querySelector("[data-review]").innerHTML =
      "<h3>Review your submission</h3>" +
      "<dl class='dl'>" +
        "<dt>Title</dt><dd>" + App.esc(v("title")) + "</dd>" +
        "<dt>Category</dt><dd>" + App.esc(v("category")) + "</dd>" +
        "<dt>Est. value</dt><dd>" + App.money(Number(v("estimatedValue"))) + "</dd>" +
        (v("reservePrice") ? "<dt>Reserve</dt><dd>" + App.money(Number(v("reservePrice"))) + "</dd>" : "") +
        "<dt>Photos</dt><dd>" + photos.length + " attached</dd>" +
        "<dt>Location</dt><dd>" + App.esc(v("location")) + "</dd>" +
        "<dt>Shipping</dt><dd>" + (shipChk.checked ? "Available" : "Collection only") + "</dd>" +
      "</dl>";
  }

  /* ---- submit ---- */
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!validateStep(3)) return;
    var v = function (n) { var el = field(n); return el ? el.value : ""; };
    submitBtn.setAttribute("aria-disabled", "true"); submitBtn.textContent = "Submitting…";
    try {
      await API.post("/items", {
        title: v("title"), category: v("category"), description: v("description"),
        condition: v("condition"), estimatedValue: v("estimatedValue"), reservePrice: v("reservePrice"),
        photos: photos,
        collection: {
          location: v("location"), shippingAvailable: shipChk.checked,
          shippingCost: shipChk.checked ? v("shippingCost") : "", times: v("times"),
          instructions: v("instructions"), contactMethod: v("contactMethod"),
        },
        contactName: v("contactName"), contactPhone: v("contactPhone"), notes: v("notes"),
      });
      form.innerHTML =
        '<div class="status" data-state="success"><h3>Thank you! 💙</h3>' +
        '<p>Your item has been submitted for review. Our team will check it and email you before it goes live. ' +
        'You can track its status any time from your dashboard.</p></div>' +
        '<div style="display:flex;gap:.75rem;flex-wrap:wrap">' +
          '<a class="btn btn-accent" href="dashboard.html">Go to my dashboard</a>' +
          '<a class="btn btn-ghost" href="submit.html">Donate another item</a></div>';
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      submitBtn.removeAttribute("aria-disabled"); submitBtn.textContent = "Submit for review";
      statusEl.hidden = false; statusEl.setAttribute("data-state", "error");
      statusEl.innerHTML = "<h3>Couldn't submit</h3><p>" + App.esc(err.message) + "</p>";
      if (err.fields) Object.keys(err.fields).forEach(function (k) { showErr(k, err.fields[k]); });
    }
  });

  goto(0);
})();
