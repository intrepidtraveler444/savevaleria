/* =============================================================================
   Help Valeria Recover — main.js
   -----------------------------------------------------------------------------
   Reads window.CAMPAIGN_CONFIG (js/config.js) and renders the dynamic parts of
   the page: donate links, progress bar, story values, updates, FAQ, share
   buttons and contact details. It also runs the on-scroll reveal animations.

   You should not normally need to edit this file — change content in config.js.
   ============================================================================= */

(function () {
  "use strict";

  var CFG = window.CAMPAIGN_CONFIG;
  if (!CFG) {
    console.error("CAMPAIGN_CONFIG not found — is js/config.js loaded before js/main.js?");
    return;
  }

  /* ---------------------------------------------------------- helpers ---- */
  var $  = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };
  var bind = function (name) { return $$('[data-bind="' + name + '"]'); };

  function setText(name, value) {
    bind(name).forEach(function (el) { el.textContent = value; });
  }

  // Format a number as currency, e.g. 35000 -> "$35,000"
  function money(amount, currency) {
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency", currency: currency || "USD", maximumFractionDigits: 0
      }).format(amount);
    } catch (e) {
      return "$" + Number(amount).toLocaleString("en-US");
    }
  }

  function escapeHtml(str) {
    var d = document.createElement("div");
    d.textContent = str == null ? "" : String(str);
    return d.innerHTML;
  }

  /* ------------------------------------------------ 1. simple text binds -- */
  var f = CFG.fundraising || {};
  setText("name", CFG.person.name);
  setText("age", CFG.person.age);
  setText("dream", CFG.person.dream);
  setText("dailyCost", money(f.dailyCost, f.currency));
  setText("goal", money(f.goal, f.currency));
  setText("raised", money(f.raised, f.currency));
  setText("donors", Number(f.donors || 0).toLocaleString("en-US"));
  setText("lastUpdated", f.lastUpdated || "");
  setText("organiser", (CFG.contact && CFG.contact.organiserName) ? CFG.contact.organiserName : "the family");
  setText("organiserName", CFG.contact ? CFG.contact.organiserName : "");

  /* ------------------------------------------------ 2. donate buttons ----- */
  bind("donate").forEach(function (el) {
    el.setAttribute("href", CFG.donateUrl || "#");
    el.setAttribute("aria-label", "Donate now to help " + CFG.person.name + " (opens the GoFundMe in a new tab)");
  });

  /* ------------------------------------------------ 3. progress bar -------- */
  (function renderProgress() {
    var goal = Number(f.goal) || 0;
    var raised = Number(f.raised) || 0;
    var pct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;

    setText("percent", pct + "%");

    var bar = bind("progressbar")[0];
    var fill = bind("progressfill")[0];
    if (bar) bar.setAttribute("aria-valuenow", String(pct));

    // Animate the fill once the card scrolls into view (or immediately as fallback).
    var animate = function () { if (fill) fill.style.width = pct + "%"; };
    var card = $(".progress-card");
    if (card && "IntersectionObserver" in window && !prefersReducedMotion()) {
      var io = new IntersectionObserver(function (entries, obs) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { animate(); obs.disconnect(); }
        });
      }, { threshold: 0.35 });
      io.observe(card);
    } else {
      animate();
    }
  })();

  /* ------------------------------------------------ 4. updates timeline --- */
  (function renderUpdates() {
    var host = bind("updates")[0];
    if (!host) return;
    var items = (CFG.updates || []).map(function (u) {
      return '<li>' +
        '<span class="up-date">' + escapeHtml(u.date) + '</span>' +
        '<h3 class="up-title">' + escapeHtml(u.title) + '</h3>' +
        '<p class="up-body">' + escapeHtml(u.body) + '</p>' +
        '</li>';
    });
    host.innerHTML = items.join("") ||
      '<li><p class="up-body">No updates yet — please check back soon.</p></li>';
  })();

  /* ------------------------------------------------ 5. FAQ accordion ------- */
  (function renderFaqs() {
    var host = bind("faqs")[0];
    if (!host) return;
    (CFG.faqs || []).forEach(function (item, i) {
      var wrap = document.createElement("div");
      wrap.className = "faq-item";
      var id = "faq-a-" + i;
      wrap.innerHTML =
        '<h3 style="margin:0">' +
          '<button class="faq-q" aria-expanded="false" aria-controls="' + id + '">' +
            '<span>' + escapeHtml(item.q) + '</span>' +
            '<span class="faq-icon" aria-hidden="true">+</span>' +
          '</button>' +
        '</h3>' +
        '<div class="faq-a" id="' + id + '" role="region">' +
          '<div class="faq-a-inner">' + escapeHtml(item.a) + '</div>' +
        '</div>';
      host.appendChild(wrap);
    });

    // One delegated click handler for all questions.
    host.addEventListener("click", function (e) {
      var btn = e.target.closest(".faq-q");
      if (!btn) return;
      var expanded = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!expanded));
      var panel = document.getElementById(btn.getAttribute("aria-controls"));
      panel.style.maxHeight = expanded ? null : panel.scrollHeight + "px";
    });
  })();

  /* ------------------------------------------------ 6. share buttons ------ */
  (function renderShare() {
    var host = bind("share")[0];
    if (!host) return;

    var pageUrl = window.location.href;
    var shareText = CFG.person.name + " is fighting for her life after a devastating accident. " +
                    "Please donate or share to help her family.";
    var enc = encodeURIComponent;

    var networks = [
      { label: "Facebook", ic: "📘", url: "https://www.facebook.com/sharer/sharer.php?u=" + enc(pageUrl) },
      { label: "X", ic: "✖️", url: "https://twitter.com/intent/tweet?text=" + enc(shareText) + "&url=" + enc(pageUrl) },
      { label: "WhatsApp", ic: "💬", url: "https://wa.me/?text=" + enc(shareText + " " + pageUrl) },
      { label: "Email", ic: "✉️", url: "mailto:?subject=" + enc("Help " + CFG.person.name + " recover") + "&body=" + enc(shareText + "\n\n" + pageUrl) }
    ];

    networks.forEach(function (n) {
      var a = document.createElement("a");
      a.className = "share-btn";
      a.href = n.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.innerHTML = '<span class="ic" aria-hidden="true">' + n.ic + '</span>' + escapeHtml(n.label);
      a.setAttribute("aria-label", "Share on " + n.label);
      host.appendChild(a);
    });

    // Native share / copy-link button.
    var extra = document.createElement("button");
    extra.type = "button";
    extra.className = "share-btn";
    var hasNative = !!navigator.share;
    extra.innerHTML = '<span class="ic" aria-hidden="true">' + (hasNative ? "🔗" : "📋") + '</span>' +
                      (hasNative ? "Share…" : "Copy link");
    extra.addEventListener("click", function () {
      if (hasNative) {
        navigator.share({ title: document.title, text: shareText, url: pageUrl }).catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(pageUrl).then(function () {
          var orig = extra.innerHTML;
          extra.innerHTML = '<span class="ic" aria-hidden="true">✅</span>Link copied!';
          setTimeout(function () { extra.innerHTML = orig; }, 2000);
        });
      }
    });
    host.appendChild(extra);
  })();

  /* ------------------------------------------------ 7. contact ----------- */
  (function renderContact() {
    var c = CFG.contact || {};
    setText("contact-note", c.note || "");
    setText("organiserLocation", c.organiserLocation ? "in " + c.organiserLocation : "");

    var list = bind("contact-list")[0];
    if (list) {
      var rows = "";
      if (c.email) rows += '<li>✉️ <a href="mailto:' + escapeHtml(c.email) + '">' + escapeHtml(c.email) + '</a></li>';
      if (c.phone) rows += '<li>📞 <a href="tel:' + escapeHtml(c.phone.replace(/\s+/g, "")) + '">' + escapeHtml(c.phone) + '</a></li>';
      list.innerHTML = rows; // empty when no verified details yet — the note explains this
    }
  })();

  /* ------------------------------------------------ 8. hero photo -------- */
  (function renderHeroPhoto() {
    var h = CFG.hero || {};
    if (!h.image) return; // keep the labelled placeholder
    var fig = bind("hero-figure")[0];
    if (!fig) return;
    // Use the image's real dimensions if provided (prevents layout shift and
    // avoids forcing a crop on non-portrait images); fall back to a 4:5 portrait.
    var w = h.imageWidth || 800, ht = h.imageHeight || 1000;
    fig.querySelector(".photo-placeholder").outerHTML =
      '<img src="' + escapeHtml(h.image) + '" alt="' + escapeHtml(h.imageAlt || CFG.person.name) + '" width="' + w + '" height="' + ht + '" loading="eager" />';
  })();

  /* ------------------------------------------------ 9. reveal on scroll -- */
  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  (function revealOnScroll() {
    var els = $$(".reveal");
    if (!("IntersectionObserver" in window) || prefersReducedMotion()) {
      els.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }
    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-visible"); obs.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    els.forEach(function (el) { io.observe(el); });
  })();

  /* ------------------------------------------------ 10. structured data --
     Inject JSON-LD so search engines understand this is a donation appeal. */
  (function seoJsonLd() {
    var data = {
      "@context": "https://schema.org",
      "@type": "DonateAction",
      "name": "Help " + CFG.person.name + " Recover After a Devastating Accident",
      "recipient": { "@type": "Person", "name": CFG.person.name },
      "target": CFG.donateUrl
    };
    var s = document.createElement("script");
    s.type = "application/ld+json";
    s.textContent = JSON.stringify(data);
    document.head.appendChild(s);
  })();

})();
