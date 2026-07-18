# Prep Deck — Order & Fulfilment Tracker

A shared, real-time tracker for your US prep/warehousing operation: Amazon FBM,
Walmart, Etsy, eBay, Shopify and TikTok Shop dropshipping orders, from the moment a
client sends you a shipping label to the moment USPS marks it delivered — plus a
dedicated log of client stock sitting in your warehouse.

Built for three teams working from different locations, all looking at the **same
live data** at the same time, on desktop or phone:

| Team | What they do in the app |
|---|---|
| **Order Intake** | Clicks **+ New Order**, enters marketplace, client, delivery location, product, label creation date, and the label tracking ID |
| **Warehouse** | Works the **Warehouse Queue** board — acknowledges labels, marks items packed, adds the USPS tracking number when it ships — and logs incoming client stock in **Storage / Inventory** |
| **Transactions / Comms** | Uses **Comms & Issues** to log WhatsApp updates, flag problem orders, and follow orders through to delivery |

No install for your team — it's a website that works fully on mobile, so anyone can
process orders from a phone on the warehouse floor. You only need to do the setup
below once.

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

### 2. Turn on Anonymous Authentication

In the Firebase console, go to **Build → Authentication → Get started**, click the
**Sign-in method** tab, click **Anonymous**, toggle it **Enable**, and click **Save**.

This makes the app quietly sign each visitor into a lightweight, invisible Firebase
session before it touches any data — your teams never see this happen. It's what
lets the security rule below require "must be signed in" instead of "anyone at all."

### 3. Set your Firestore security rules

Go to **Firestore Database → Rules** and paste this in, then click **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /orders/{orderId} {
      allow read, write: if request.auth != null;
    }
    match /inventory/{batchId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

This requires anyone touching order data to have gone through Firebase Auth first
(step 2 does that automatically for real visitors to your site). Combined with your
shared access code (next step) as the front door, this is the right level of
protection for a small internal team tool — see **Security** below for what this
does and doesn't protect against.

### 4. Set your shared access code

Open `js/firebase-config.js` and change this line to whatever code you want your
three teams to use to get in:

```js
const ACCESS_CODE = "warehouse2026";
```

Share this code (and the site link, once it's live) with your teams over WhatsApp/Slack.
Each person also picks their own name and team on first login, so every action in the
app is attributed to a real person.

### 5. Put this project on GitHub

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

### 6. Turn on GitHub Pages

1. On GitHub, open your repo → **Settings → Pages**.
2. Under "Build and deployment", set **Source** to **Deploy from a branch**.
3. Branch: **main**, folder: **/ (root)** → **Save**.
4. After a minute, GitHub will show your live URL, something like:
   `https://YOUR-USERNAME.github.io/prep-deck/`

Send that link to your teams along with the access code. That's it — no server to
maintain, no monthly hosting bill.

---

## Security

### About the "possible valid secret" email from GitHub

If GitHub emailed you saying it found a **Google API Key** in `js/firebase-config.js`,
that's expected, not a mistake. Firebase's web API key is designed to sit in
public, browser-visible code — it identifies which Firebase project a request
belongs to, it doesn't unlock anything by itself. Every Firebase web app in the
world ships this key in plain view. GitHub's scanner flags it automatically for
any repo because the same *shape* of key is sometimes a real secret for other
services — for Firebase specifically, this alert is a false alarm once your rules
are set up correctly (steps 2 and 3 above).

**What actually matters is who your Firestore rules let in — not whether the key
is visible.** The original version of this README had a rule that let anyone with
your link read and write every order, no sign-in required. That was the real gap —
bots do scan public GitHub repos for exactly that combination (a public Firebase
key + wide-open rules) and mass-delete or vandalize the database. Steps 2 and 3
close that: now a visitor has to go through Firebase's own sign-in flow before
touching any data.

### Recommended: restrict the API key itself (5 minutes, extra layer)

Even though the key isn't a secret, you can still tell Google to only honor it
from your website — so even a copy-pasted key is useless anywhere else:

1. Go to [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials) and make sure the project selector (top left) shows your Firebase project.
2. Click the API key that matches the one in your `firebase-config.js`.
3. Under **Application restrictions**, choose **Websites** and add your GitHub Pages URL, e.g. `https://YOUR-USERNAME.github.io/*`.
4. Under **API restrictions**, choose **Restrict key** and select only **Identity Toolkit API** and **Cloud Firestore API** (the two this app actually uses).
5. Click **Save**. Changes can take a few minutes to apply.

### Clearing the GitHub alert

Once steps 2, 3, and the key restriction above are done, go to the alert in GitHub
(**Security → Secret scanning alerts** in your repo) and click **Close as** →
**Revoked** if you restricted the key, or **Used in tests** is not applicable here —
**Revoked** or a note referencing this README is the accurate choice. GitHub will
keep re-flagging the same key on every push otherwise, which is just noise once
you've secured it properly.

### If you want to be extra cautious

You can also generate a brand-new key and delete the old one: in Google Cloud
Console → Credentials → **Create credentials → API key**, then update
`firebase-config.js` with the new value, then delete the old key. This isn't
necessary for security (the rules are what protect your data) but it's a
reasonable step if the exposure makes you uneasy.

---

## Daily workflow

**Order Intake** receives order details + shipping label from a client →
clicks **+ New Order** (or the orange **+** button on mobile) → fills in marketplace
(Amazon FBM, Walmart, Etsy, eBay, Shopify, TikTok Shop, or Other), client, delivery
location, product, the label's creation date, and its tracking ID → **Create Order**.
It now shows as **Order Received** and appears instantly on the Warehouse Queue board.

**Warehouse** opens **Warehouse Queue**:
- *Awaiting Label Ack* column → confirms the physical label matches → **Acknowledge Label**
- *Acknowledged — To Pack* → once packed → **Mark Packed**
- *Packed — Ready to Ship* → once handed to USPS → **Ship (add USPS #)**, enters the
  USPS tracking number. Status flips to **Shipped** for everyone, instantly.

Warehouse also owns **Storage / Inventory** — whenever a client ships product into
the warehouse to hold (separate from an order going out), click **+ Log Stock
Intake** and record the client, product, cartons/boxes received, date, and bin
location. As stock gets used or shipped out, open that batch and **Apply
Adjustment** with a negative number and a reason — the batch's status updates
automatically (In Storage → Partially Shipped → Depleted). Use **Mark Returned to
Client** if a client asks for unused stock back.

**Transactions/Comms** works from **Comms & Issues** and the **Dashboard**'s
"Needs attention" list — orders stuck too long, or marked **Exception** — and logs
WhatsApp updates or flags problems directly on the order (open any order → notes
section at the bottom). Once USPS shows delivered, mark the order **Delivered**
from its detail view.

**Dashboard** gives a same-day snapshot: received, awaiting ack, packed, shipped,
delivered, and open exceptions, plus a storage snapshot (clients storing stock,
total cartons on hand, active batches) — and a live "needs attention" list so
nothing sits untouched for 24+ hours without someone noticing.

**Reports** exports any date range / marketplace / client slice of orders to CSV,
plus a separate one-click export of every storage batch on record — both ready for
bookkeeping or a client-facing report.

Use the search bar at the top any time to jump straight to an order by its
internal ref, delivery location, label tracking ID, or USPS tracking number — or to
a storage batch by its batch reference or product ref.

**On mobile:** tap the ☰ icon top-left for navigation, and the orange floating **+**
button (bottom-right) to start a new order from anywhere. Tables become simple
stacked cards so everything stays readable and tappable on a phone screen — this is
fully supported for all three teams to use directly from the warehouse floor.

---

## Notes on the data model

Every **order** carries: marketplace (Amazon FBM / Walmart / Etsy / eBay / Shopify /
TikTok Shop / Other, with a free-text field when "Other" is picked), client,
delivery location, product/quantity, priority, the label's creation date, its
tracking ID, an optional link to the label file itself (paste a Google Drive/email
link — this app doesn't store files), current status, USPS tracking number and
delivery status, who did what and when at each stage, and a running
notes/WhatsApp-log/issue-flag thread.

Status always moves through: **Order Received → Label Acknowledged → Packed →
Shipped → Delivered**, with **Exception** available at any point for anything that
goes wrong (lost label, wrong item, USPS delay, etc.) and a one-click resolve path
back into the flow.

Every **storage batch** carries: client, product, an optional product ref/SKU,
cartons received vs. cartons remaining, units per carton, date received, warehouse
bin/location, condition, who logged it, a status (In Storage / Partially Shipped /
Depleted / Returned to Client), and a full history of every quantity adjustment
with who made it, when, and why. This is a stock **register**, not an automatic
inventory system — adjusting a batch when stock is used doesn't happen by itself
when an order ships, your Warehouse team logs it as a deliberate step. That's a
reasonable amount of manual control for most operations this size; if you'd rather
have order shipments automatically deduct from a linked storage batch, that's a
bigger feature I can build when you're ready for it.

## Optional: real per-person logins

The shared access-code gate is intentionally lightweight, and everyone currently
shares one anonymous Firebase identity behind the scenes. If your team grows or
you want to stop people from sharing the code around, the app already uses
Firebase Authentication under the hood — swapping anonymous sign-in for real
email/password or Google accounts is a moderate change (a login form instead of
the access-code field, plus per-user rules if you want to restrict, say, only
Warehouse accounts from editing certain fields). Happy to build that version
if/when you need it.
