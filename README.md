# Prep Deck — Order & Fulfilment Tracker

A shared, real-time tracker for your US prep/warehousing operation: Amazon FBM orders
and Etsy/eBay dropshipping orders, from the moment a client sends you a shipping label
to the moment USPS marks it delivered.

Built for three teams working from different locations, all looking at the **same
live data** at the same time:

| Team | What they do in the app |
|---|---|
| **Order Intake** | Clicks **+ New Order**, enters marketplace, client, order ID, product, and the label tracking ID |
| **Warehouse** | Works the **Warehouse Queue** board — acknowledges labels, marks items packed, adds the USPS tracking number when it ships |
| **Transactions / Comms** | Uses **Comms & Issues** to log WhatsApp updates, flag problem orders, and follow orders through to delivery |

No install for your team — it's a website. You only need to do the setup below once.

---

## What this is built on

- Plain HTML/CSS/JavaScript — no build tools, nothing to compile.
- **Firebase Firestore** (Google's free-tier real-time database) holds the order
  data so all three teams see the same thing instantly.
- **GitHub Pages** hosts the site itself for free, straight from this repo.

GitHub Pages only serves files — it can't run a database. Firebase is the piece
that makes "warehouse marks it packed → transactions team sees it instantly" work.
The free Firebase tier comfortably covers 100–500 orders/day with room to spare.

---

## Setup (do this once, ~15 minutes)

### 1. Create your Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and sign in with any Google account.
2. Click **Add project** → name it (e.g. "us-prime-prep-deck") → you can skip Google Analytics → **Create project**.
3. In the left menu, click **Build → Firestore Database** → **Create database** → choose a region close to your warehouse → start in **Production mode**.
4. Click the **⚙ gear icon → Project settings**, scroll to "Your apps", click the **</> (Web)** icon, give it a nickname, and click **Register app**. Firebase will show you a `firebaseConfig` object.
5. Copy those values into `js/firebase-config.js` in this project, replacing the `PASTE_YOUR_...` placeholders.

### 2. Set your Firestore security rules

Still in the Firebase console, go to **Firestore Database → Rules** and paste this in,
then click **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /orders/{orderId} {
      allow read, write: if true;
    }
  }
}
```

This keeps things simple: anyone with your app link **and** your access code (next
step) can read and write orders. That's appropriate for a small internal team tool.
If you later want real per-person logins instead of a shared code, see
"Optional: real logins" at the bottom.

### 3. Set your shared access code

Open `js/firebase-config.js` and change this line to whatever code you want your
three teams to use to get in:

```js
const ACCESS_CODE = "warehouse2026";
```

Share this code (and the site link, once it's live) with your teams over WhatsApp/Slack.
Each person also picks their own name and team on first login, so every action in the
app is attributed to a real person.

### 4. Put this project on GitHub

If you don't already have this in a repo:

```bash
cd warehouse-tracker
git init
git add .
git commit -m "Prep Deck: initial version"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/prep-deck.git
git push -u origin main
```

(Create the empty repo first at [github.com/new](https://github.com/new) — don't
initialize it with a README there, since this project already has one.)

### 5. Turn on GitHub Pages

1. On GitHub, open your repo → **Settings → Pages**.
2. Under "Build and deployment", set **Source** to **Deploy from a branch**.
3. Branch: **main**, folder: **/ (root)** → **Save**.
4. After a minute, GitHub will show your live URL, something like:
   `https://YOUR-USERNAME.github.io/prep-deck/`

Send that link to your teams along with the access code. That's it — no server to
maintain, no monthly hosting bill.

---

## Daily workflow

**Order Intake** receives order details + shipping label from a client →
clicks **+ New Order** → fills in marketplace, client, marketplace order ID, product,
and the label's tracking ID → **Create Order**. It now shows as **Order Received**
and appears instantly on the Warehouse Queue board.

**Warehouse** opens **Warehouse Queue**:
- *Awaiting Label Ack* column → confirms the physical label matches → **Acknowledge Label**
- *Acknowledged — To Pack* → once packed → **Mark Packed**
- *Packed — Ready to Ship* → once handed to USPS → **Ship (add USPS #)**, enters the
  USPS tracking number. Status flips to **Shipped** for everyone, instantly.

**Transactions/Comms** works from **Comms & Issues** and the **Dashboard**'s
"Needs attention" list — orders stuck too long, or marked **Exception** — and logs
WhatsApp updates or flags problems directly on the order (open any order → notes
section at the bottom). Once USPS shows delivered, mark the order **Delivered**
from its detail view.

**Dashboard** gives a same-day snapshot: received, awaiting ack, packed, shipped,
delivered, and open exceptions — plus a live "needs attention" list so nothing sits
untouched for 24+ hours without someone noticing.

**Reports** exports any date range / marketplace / client slice to CSV for
bookkeeping or a client-facing report.

Use the search bar at the top any time to jump straight to an order by its
internal ref, marketplace order ID, label tracking ID, or USPS tracking number.

---

## Notes on the data model

Every order carries: marketplace (Amazon FBM / Etsy Dropship / eBay Dropship),
client, marketplace order ID, product/SKU/quantity, priority, the label tracking ID,
an optional link to the label file itself (paste a Google Drive/email link — this
app doesn't store files), current status, USPS tracking number and delivery status,
who did what and when at each stage, and a running notes/WhatsApp-log/issue-flag
thread.

Status always moves through: **Order Received → Label Acknowledged → Packed →
Shipped → Delivered**, with **Exception** available at any point for anything that
goes wrong (lost label, wrong item, USPS delay, etc.) and a one-click resolve path
back into the flow.

## Optional: real logins

The shared access-code gate is intentionally lightweight. If your team grows or you
want to stop people from sharing the code around, swap in
[Firebase Authentication](https://firebase.google.com/docs/auth) (email/password or
Google sign-in) and tighten the Firestore rule from step 2 to
`allow read, write: if request.auth != null;`. This is a bigger change — happy to
build that version if/when you need it.
