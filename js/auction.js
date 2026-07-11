/* =============================================================================
   Help Valeria Recover — auction.js
   -----------------------------------------------------------------------------
   Powers the charity-auction section: renders the process steps and category
   options from config, validates the item-donation form (accessibly), previews
   photo uploads, and submits the donation.

   SUBMISSION STRATEGY (see CAMPAIGN_CONFIG.auction in js/config.js):
     1. formEndpoint set  → POST multipart/form-data (fields + photos) via fetch.
     2. else contactEmail → open a pre-filled email (donor attaches photos).
     3. else               → show a confirmation + "copy details" fallback.

   FUTURE — adding live bidding: the collected submissions already carry every
   field an auction listing needs. Point `formEndpoint` at a backend that stores
   them, then build listing/bidding pages that read from that same store. Nothing
   in this file needs to change to start capturing real submissions.
   ============================================================================= */

(function () {
  "use strict";

  var CFG = window.CAMPAIGN_CONFIG;
  if (!CFG || !CFG.auction || CFG.auction.enabled === false) return;

  var A = CFG.auction;

  /* ---------------------------------------------------------- helpers ---- */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function bind(name) { return document.querySelector('[data-bind="' + name + '"]'); }
  function esc(str) { var d = document.createElement("div"); d.textContent = str == null ? "" : String(str); return d.innerHTML; }

  var form = bind("auction-form");
  if (!form) return;

  /* ------------------------------------------------ 1. render process ---- */
  (function renderProcess() {
    var host = bind("auction-process");
    if (!host) return;
    host.innerHTML = (A.process || []).map(function (s) {
      return '<li><p class="ap-title">' + esc(s.title) + '</p>' +
             '<p class="ap-body">' + esc(s.body) + '</p></li>';
    }).join("");
  })();

  /* ------------------------------------------------ 2. categories -------- */
  (function renderCategories() {
    var sel = bind("category-options");
    if (!sel) return;
    (A.categories || []).forEach(function (c) {
      var o = document.createElement("option");
      o.value = c; o.textContent = c;
      sel.appendChild(o);
    });
  })();

  // Reflect photo limit shown in the label
  var maxPhotosEl = bind("max-photos");
  if (maxPhotosEl) maxPhotosEl.textContent = String(A.maxPhotos || 8);

  /* ------------------------------------------------ 3. photo previews ---- */
  var photoInput = $("#af-photos", form);
  var previewHost = bind("photo-previews");
  var selectedFiles = [];               // authoritative list (survives re-render)
  var MAX_PHOTOS = A.maxPhotos || 8;
  var MAX_BYTES = (A.maxPhotoMB || 5) * 1024 * 1024;

  if (photoInput && previewHost) {
    photoInput.addEventListener("change", function () {
      var incoming = Array.prototype.slice.call(photoInput.files);
      incoming.forEach(function (file) {
        if (!/^image\//.test(file.type)) return;                 // images only
        if (file.size > MAX_BYTES) {                             // size guard
          showFieldError("af-photos", '"' + file.name + '" is larger than ' + (A.maxPhotoMB || 5) + 'MB and was skipped.');
          return;
        }
        if (selectedFiles.length >= MAX_PHOTOS) {
          showFieldError("af-photos", "You can attach up to " + MAX_PHOTOS + " photos.");
          return;
        }
        selectedFiles.push(file);
      });
      syncFileInput();
      renderPreviews();
    });
  }

  function renderPreviews() {
    if (!previewHost) return;
    previewHost.innerHTML = "";
    selectedFiles.forEach(function (file, i) {
      var li = document.createElement("li");
      var url = URL.createObjectURL(file);
      li.innerHTML = '<img src="' + url + '" alt="Preview of ' + esc(file.name) + '" />' +
                     '<button type="button" aria-label="Remove ' + esc(file.name) + '">×</button>';
      li.querySelector("img").addEventListener("load", function () { URL.revokeObjectURL(url); });
      li.querySelector("button").addEventListener("click", function () {
        selectedFiles.splice(i, 1);
        syncFileInput();
        renderPreviews();
      });
      previewHost.appendChild(li);
    });
  }

  // Keep the real <input type=file> in sync so a native form submit still carries files.
  function syncFileInput() {
    if (!photoInput || typeof DataTransfer === "undefined") return;
    var dt = new DataTransfer();
    selectedFiles.forEach(function (f) { dt.items.add(f); });
    photoInput.files = dt.files;
  }

  /* ------------------------------------------------ 4. validation -------- */
  // Map of field id -> validator returning an error string ("" = valid).
  var validators = {
    "af-name":     function (v) { return v.trim() ? "" : "Please enter your name."; },
    "af-email":    function (v) { return !v.trim() ? "Please enter your email address."
                                    : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? "" : "Please enter a valid email address."; },
    "af-phone":    function (v) { return !v.trim() || /^[0-9+()\-.\s]{6,}$/.test(v.trim()) ? "" : "Please enter a valid phone number, or leave it blank."; },
    "af-category": function (v) { return v ? "" : "Please choose a category."; },
    "af-title":    function (v) { return v.trim() ? "" : "Please give your item a title."; },
    "af-desc":     function (v) { return v.trim().length >= 10 ? "" : "Please add a short description (at least 10 characters)."; },
    "af-value":    function (v) { var n = parseFloat(v); return v !== "" && n >= 1 ? "" : "Please enter an estimated value of at least $1."; },
    "af-collection": function (v) { return v.trim() ? "" : "Please tell us how we'd collect or receive the item."; },
    "af-consent":  function (v, el) { return el.checked ? "" : "Please confirm you can donate this item."; }
  };

  function showFieldError(id, msg) {
    var el = $("#" + id, form);
    var errEl = $("#" + id + "-err", form);
    if (el) el.setAttribute("aria-invalid", "true");
    if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
  }
  function clearFieldError(id) {
    var el = $("#" + id, form);
    var errEl = $("#" + id + "-err", form);
    if (el) el.removeAttribute("aria-invalid");
    if (errEl) { errEl.textContent = ""; errEl.hidden = true; }
  }

  function validateField(id) {
    var el = $("#" + id, form);
    if (!el || !validators[id]) return true;
    var msg = validators[id](el.value, el);
    if (msg) { showFieldError(id, msg); return false; }
    clearFieldError(id);
    return true;
  }

  // Validate on blur / change for gentle, real-time feedback.
  Object.keys(validators).forEach(function (id) {
    var el = $("#" + id, form);
    if (!el) return;
    var ev = (el.type === "checkbox" || el.tagName === "SELECT") ? "change" : "blur";
    el.addEventListener(ev, function () { validateField(id); });
  });

  function validateAll() {
    var firstInvalid = null;
    Object.keys(validators).forEach(function (id) {
      if (!validateField(id) && !firstInvalid) firstInvalid = $("#" + id, form);
    });
    return firstInvalid;
  }

  /* ------------------------------------------------ 5. status banner ----- */
  var statusEl = bind("form-status");
  function setStatus(state, html) {
    if (!statusEl) return;
    statusEl.hidden = false;
    statusEl.setAttribute("data-state", state);
    statusEl.innerHTML = html;
  }
  function clearStatus() { if (statusEl) { statusEl.hidden = true; statusEl.removeAttribute("data-state"); statusEl.innerHTML = ""; } }

  /* ------------------------------------------------ 6. submit ------------ */
  var submitBtn = bind("submit-btn");

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    clearStatus();

    var firstInvalid = validateAll();
    if (firstInvalid) {
      setStatus("error", "<h3>Please check the highlighted fields</h3>" +
        "<p>A few details need fixing before we can submit your item.</p>");
      firstInvalid.focus();
      return;
    }

    var data = collectData();

    // Route by configured strategy.
    if (A.formEndpoint) {
      submitToEndpoint(data);
    } else if (A.contactEmail) {
      submitByEmail(data);
    } else {
      submitFallback(data);
    }
  });

  function collectData() {
    return {
      donorName: $("#af-name", form).value.trim(),
      email: $("#af-email", form).value.trim(),
      phone: $("#af-phone", form).value.trim(),
      category: $("#af-category", form).value,
      itemTitle: $("#af-title", form).value.trim(),
      description: $("#af-desc", form).value.trim(),
      estimatedValue: $("#af-value", form).value,
      collection: $("#af-collection", form).value.trim(),
      notes: $("#af-notes", form).value.trim(),
      photos: selectedFiles.slice()
    };
  }

  function setLoading(on) {
    if (!submitBtn) return;
    submitBtn.setAttribute("aria-disabled", String(on));
    submitBtn.textContent = on ? "Submitting…" : "Submit auction item";
  }

  // --- Strategy 1: POST to a configured endpoint (photos included) ---------
  function submitToEndpoint(data) {
    setLoading(true);
    setStatus("loading", "<p>Submitting your item…</p>");

    var fd = new FormData();
    Object.keys(data).forEach(function (k) {
      if (k === "photos") return;
      fd.append(k, data[k]);
    });
    data.photos.forEach(function (file, i) { fd.append("photo_" + (i + 1), file, file.name); });
    fd.append("_subject", "Auction item donation: " + data.itemTitle);

    fetch(A.formEndpoint, { method: "POST", body: fd, headers: { "Accept": "application/json" } })
      .then(function (res) {
        if (!res.ok) throw new Error("Request failed with status " + res.status);
        onSuccess(data);
      })
      .catch(function (err) {
        setLoading(false);
        setStatus("error", "<h3>Something went wrong</h3>" +
          "<p>We couldn't submit your item just now (" + esc(err.message) + "). " +
          "Please try again in a moment" +
          (A.contactEmail ? ", or email us at <a href=\"mailto:" + esc(A.contactEmail) + "\">" + esc(A.contactEmail) + "</a>." : ".") +
          "</p>");
      });
  }

  // --- Strategy 2: open a pre-filled email (donor attaches photos) ---------
  function submitByEmail(data) {
    var body =
      "AUCTION ITEM DONATION\n\n" +
      "Name: " + data.donorName + "\n" +
      "Email: " + data.email + "\n" +
      "Phone: " + (data.phone || "—") + "\n" +
      "Category: " + data.category + "\n" +
      "Item title: " + data.itemTitle + "\n" +
      "Estimated value (USD): $" + data.estimatedValue + "\n\n" +
      "Description:\n" + data.description + "\n\n" +
      "Collection / delivery:\n" + data.collection + "\n\n" +
      "Additional notes:\n" + (data.notes || "—") + "\n\n" +
      "(Please attach your " + data.photos.length + " photo(s) to this email before sending.)";

    var href = "mailto:" + encodeURIComponent(A.contactEmail) +
      "?subject=" + encodeURIComponent("Auction item donation: " + data.itemTitle) +
      "&body=" + encodeURIComponent(body);

    window.location.href = href;
    onSuccess(data, true);
  }

  // --- Strategy 3: no backend yet — confirm + let donor copy details -------
  function submitFallback(data) {
    console.log("[Auction] Submission captured (configure auction.formEndpoint or contactEmail to receive these):", data);
    onSuccess(data, false, true);
  }

  /* ------------------------------------------------ 7. success ----------- */
  function onSuccess(data, viaEmail, isFallback) {
    setLoading(false);

    var msg = "<h3>Thank you, " + esc(data.donorName.split(" ")[0] || "friend") + "! 💙</h3>";
    if (viaEmail) {
      msg += "<p>Your email app should have opened with your item details ready to send. " +
             "Please <strong>attach your photos and hit send</strong> to complete your donation.</p>";
    } else if (isFallback) {
      msg += "<p>Your item details are ready below. We'll be in touch to confirm and arrange collection. " +
             "You can copy your submission for your records.</p>" +
             "<button type=\"button\" class=\"status-btn\" data-copy>Copy my details</button>";
    } else {
      msg += "<p>We've received your item donation for <strong>" + esc(data.itemTitle) + "</strong>. " +
             "Our team will review it and email <strong>" + esc(data.email) + "</strong> to confirm the next steps.</p>";
    }
    setStatus("success", msg);

    // Wire the "copy details" button in the fallback flow.
    var copyBtn = statusEl && statusEl.querySelector("[data-copy]");
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        var text = [
          "Auction item donation",
          "Name: " + data.donorName,
          "Email: " + data.email,
          "Phone: " + (data.phone || "—"),
          "Category: " + data.category,
          "Item: " + data.itemTitle,
          "Estimated value: $" + data.estimatedValue,
          "Description: " + data.description,
          "Collection/delivery: " + data.collection,
          "Notes: " + (data.notes || "—")
        ].join("\n");
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text).then(function () {
            copyBtn.textContent = "Copied ✓";
          });
        }
      });
    }

    // Reset the form fields and photo state for a clean slate.
    if (!viaEmail) {
      form.reset();
      selectedFiles = [];
      syncFileInput();
      renderPreviews();
    }

    // Move focus to the confirmation so screen-reader users hear it.
    if (statusEl) { statusEl.setAttribute("tabindex", "-1"); statusEl.focus(); }
    statusEl.scrollIntoView({ behavior: "smooth", block: "center" });
  }

})();
