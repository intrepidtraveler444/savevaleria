/* =============================================================================
   SITE CONFIGURATION — EDIT THIS FILE TO UPDATE THE WEBSITE
   -----------------------------------------------------------------------------
   Everything a non-developer needs to change lives here: names, links, the
   fundraising goal, contact details, and the "Updates" feed. After editing,
   just save this file and refresh the page. No build step required.

   NOTE ON FACTS: The story details below are taken ONLY from the family's
   Facebook post and their GoFundMe campaign. Anything not confirmed by those
   sources is left as a clearly labelled placeholder — please replace it, do
   not invent details.
   ============================================================================= */

window.CAMPAIGN_CONFIG = {

  /* ---- The person we're helping ------------------------------------------ */
  person: {
    name: "Valeria",              // First name (family has not shared her last name publicly)
    age: 18,                      // She had just turned 18
    dream: "becoming a veterinarian",
  },

  /* ---- Core donation link (the GoFundMe from the family's post) ----------- */
  // This is the official campaign organised by Valeria's sister, Sammy Deloera.
  donateUrl: "https://gofund.me/4c46c9477",

  /* ---- Fundraising progress ----------------------------------------------
     Update `raised` and `donors` as the campaign grows. `goal` and `currency`
     control the progress bar. Values are plain numbers (no commas/symbols).   */
  fundraising: {
    goal: 35000,        // Fundraising target (USD)
    raised: 8005,       // Fallback "raised" (USD) — used only if the live sync below fails
    donors: 112,        // Fallback number of contributors
    currency: "USD",
    // The family's estimate of ongoing hospital + ICU cost, highlighted on the site.
    dailyCost: 4000,
    // Set to a date string (e.g. "10 July 2026") to show when figures were last checked.
    lastUpdated: "11 July 2026",
  },

  /* ---- Live GoFundMe sync --------------------------------------------------
     When enabled, the page pulls the real "raised" amount (and donor count) from
     the GoFundMe campaign via the backend API, so the progress bar stays current.
     If the API is unreachable, the numbers above are shown instead.
       apiBase  — your deployed backend (Render). Leave "" to disable syncing.
       syncGoal — also pull the goal from GoFundMe (off = keep the goal above).    */
  gofundmeSync: {
    enabled: true,
    apiBase: "https://valeria-auction.onrender.com",
    syncGoal: false,
  },

  /* ---- Updates feed -------------------------------------------------------
     Add a new object to the TOP of this array to post an update. Newest first.
     `date` is free text. `body` supports plain text; keep it factual.          */
  updates: [
    {
      date: "5 July 2026",
      title: "The campaign has begun",
      body: "Valeria's family has launched an official GoFundMe to help cover the " +
            "cost of her emergency care. Thank you to everyone who has already " +
            "shared and donated.",
    },
    {
      date: "3 July 2026",
      title: "The accident",
      body: "Valeria was involved in a car accident in San Miguel de Allende, " +
            "Mexico. She was taken to intensive care in critical condition.",
    },
    // ↑ To add an update, copy one block above this line and edit it.
  ],

  /* ---- Frequently Asked Questions ----------------------------------------
     Edit, add, or remove Q&A pairs freely.                                     */
  faqs: [
    {
      q: "Who is organising this fundraiser?",
      a: "The official GoFundMe campaign was created by Valeria's sister, " +
         "Sammy Deloera. All donations made through the Donate button go " +
         "directly to the family's verified GoFundMe.",
    },
    {
      q: "Where does my donation go?",
      a: "Donations help cover Valeria's hospital and ICU care, emergency and " +
         "reconstructive surgery, and her ongoing rehabilitation. Payments are " +
         "processed securely by GoFundMe.",
    },
    {
      q: "Why is the cost so high?",
      a: "Intensive care is extremely expensive. The family estimates that " +
         "Valeria's hospital and ICU care costs approximately $4,000 USD per " +
         "day, on top of the surgeries she urgently needs.",
    },
    {
      q: "Can I help if I can't donate?",
      a: "Yes. Sharing this page with your friends and family is one of the most " +
         "valuable things you can do. Use the share buttons to spread the word.",
    },
    {
      q: "Is this campaign verified?",
      a: "Yes. GoFundMe verifies withdrawals and holds funds securely. You can " +
         "read the family's own words and see live donation totals on the " +
         "GoFundMe page linked throughout this site.",
    },
  ],

  /* ---- Contact information ------------------------------------------------
     PLACEHOLDERS — replace with real details if/when the family provides them.
     Leave a value as an empty string ("") to hide that line.                   */
  contact: {
    email: "",                    // e.g. "help@valeriafund.org"  (empty = hidden)
    phone: "",                    // e.g. "+1 (555) 123-4567"     (empty = hidden)
    note: "For media enquiries or to reach the family directly, please contact " +
          "us through the GoFundMe campaign page. Verified contact details will " +
          "be added here as they become available.",
    organiserName: "Sammy Deloera",
    organiserLocation: "Austin, TX",
  },

  /* ---- Photos -------------------------------------------------------------
     Add image paths here (e.g. "images/valeria.jpg"). Leave empty to show a
     tasteful placeholder instead. Always include descriptive alt text.         */
  hero: {
    image: "images/valeria-hero.jpg",   // shown in place of the "photo coming soon" box
    imageAlt: "Help Valeria recover after her accident — campaign photos of Valeria in hospital and with her dog.",
    imageWidth: 500,              // real dimensions keep the layout stable and uncropped
    imageHeight: 261,
  },

  /* ---- Charity auction ----------------------------------------------------
     The site currently COLLECTS auction-item donations. The live bidding
     auction can be added later without touching this section — see notes below.

     How submissions are handled (in priority order, configured here):
       1. If `formEndpoint` is set to a URL, the form POSTs there as
          multipart/form-data (fields + photo files). Works with services like
          Formspree, Basin, Getform, or your own backend — no code changes.
       2. Otherwise, if `contactEmail` is set, the form opens the donor's email
          client pre-filled with their details and asks them to attach photos.
       3. Otherwise, the donor sees a confirmation with a "copy details" button
          (a stop-gap until you configure option 1 or 2).                       */
  auction: {
    enabled: true,

    // OPTION 1 — set this to receive submissions (incl. photos) automatically.
    // e.g. Formspree: "https://formspree.io/f/xxxxxxx"   (leave "" if unused)
    formEndpoint: "",

    // OPTION 2 — fallback contact inbox for item donations. PLACEHOLDER: replace.
    contactEmail: "",             // e.g. "auction@valeriafund.org"

    // Photo upload limits (client-side validation).
    maxPhotos: 8,
    maxPhotoMB: 5,

    // Categories offered in the form's dropdown — edit freely.
    categories: [
      "Experience or activity",
      "Travel or accommodation",
      "Art or collectibles",
      "Electronics or gadgets",
      "Jewellery or accessories",
      "Home, garden or décor",
      "Sports or memorabilia",
      "Food, drink or hospitality",
      "Professional service",
      "Gift card or voucher",
      "Other",
    ],

    // The four steps shown in the "How the auction works" explainer.
    process: [
      {
        title: "1. You submit an item",
        body: "Tell us about the item or experience you'd like to donate using " +
              "the form below. It takes just a couple of minutes.",
      },
      {
        title: "2. We review & approve",
        body: "Our small volunteer team checks each submission to make sure it's " +
              "a great fit, then confirms the details with you by email.",
      },
      {
        title: "3. It goes to auction",
        body: "Your item is photographed, described, and listed in the online " +
              "charity auction for supporters to bid on.",
      },
      {
        title: "4. Winner & collection",
        body: "The highest bidder pays, 100% of the proceeds go to Valeria's care, " +
              "and we arrange collection or delivery of the item.",
      },
    ],
  },
};
