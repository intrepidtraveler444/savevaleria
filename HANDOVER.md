# Running the Valeria Charity Auction — guide for the family

This is everything you need to run the auction. It's built to run on **free** services.
No coding required — just creating a few free accounts and copying values into a settings page.

Already set up for you:
- **Website:** https://savevaleria.netlify.app (the fundraiser + auction)
- **Admin console:** https://savevaleria.netlify.app/app/admin.html
- **Backend service:** hosted on Render (runs the auction behind the scenes)

---

## Part 1 — One-time setup (~5 minutes, free)

Most of the setup is already done for you. Just two quick things below.

> ✅ **Permanent data storage is already switched on.** Your auction saves everything
> (items, bids, accounts) to a free cloud database, so nothing is lost when the server
> is quiet or restarts. You don't need to do anything for this — it's handled.

### 1. Get your admin login
Ask the person who set this up for the **admin email and password**. Sign in at the admin
console link above.

To add more admins (e.g. both parents):
1. The other person creates a normal account on the site (**Sign in → Create account**).
2. You open **Admin → Team**, find their name, and click **Make admin**.

### 2. Keep the auction awake so it ends on time (free, recommended)
The free server "sleeps" when no one's visiting, which can delay auctions from ending and
make the first visit slow. A free pinger keeps it awake:

1. Go to **https://cron-job.org** (free) and sign up.
2. Create a cronjob that requests
   **`https://valeria-auction.onrender.com/api/auctions`** every **10 minutes**.
That's it — the auction stays responsive and ends on schedule.

> **Emails (optional, later):** winners/bidders currently get messages **inside the
> site** (they see them when they log in). To also email people, you need a domain
> name (~$10/year) verified with Resend — see the project README. It's fully wired;
> just add a domain when you're ready. Everything works without it.

---

## Part 2 — Running the auction (day to day)

Everything happens in the **Admin console**: https://savevaleria.netlify.app/app/admin.html

### Accepting items people offer
- People submit items at **/app/submit.html**. New ones appear in your **Review queue**.
- For each: set a **starting bid** and the **auction length in hours** — this is already
  **pre-filled with the length the donor asked for** (hover it to see their preference in
  days), so just adjust it if you like. Then **Approve** (or **Reject** with a reason).
  Approved items go live for bidding immediately.

### When an auction ends and someone wins
1. The winner is asked to **pay their winning bid on your GoFundMe** (so the money goes
   straight into your campaign). They then tap **"I've donated"**.
2. You'll see it under **Admin → Payments** as *awaiting confirmation*, and the
   "Payments to confirm" number on your dashboard goes up.
3. Check your **GoFundMe donations** for a matching amount. When you see it, click
   **Confirm received**. This automatically sends the winner their **collection details**.
   (If you can't find the donation, click **Reject** and they'll be asked to try again.)

> Tip: ask winners to donate the **exact** winning-bid amount, so it's easy to match.

### Getting the item to the winner
- After you confirm payment, go to **Admin → Fulfilment**. Arrange collection/delivery
  using the details the donor provided, then mark the item **Shipped** or **Collected**.
- If something goes wrong, use **Dispute** to record and resolve it.

### Keeping an eye on things
- The **dashboard tiles** show money raised, payments to confirm, live auctions, and
  items awaiting review.
- **All listings** lets you edit or **Take down** any item at any time.

---

## Quick reference

| I want to… | Where |
|---|---|
| Approve/reject a submitted item | Admin → Review queue |
| Set how long an item runs | Review queue (Hours field) before approving |
| Confirm a winner's GoFundMe payment | Admin → Payments → Confirm received |
| Mark an item shipped/collected | Admin → Fulfilment |
| Remove an item from the auction | Admin → All listings → Take down |
| Make someone else an admin | Admin → Team → Make admin |

Questions about the setup? The technical details are in `README.md`.
