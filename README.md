# Prep Deck — Order & Fulfilment Tracker

A shared, real-time tracker for your US prep/warehousing operation: Amazon FBM,
Walmart, Etsy, eBay, Shopify and TikTok Shop dropshipping orders, from the moment a
client sends you a shipping label to the moment USPS marks it delivered — plus a
dedicated log of client stock sitting in your warehouse.

Every teammate signs in with their **own email and password** — there's no shared
password anyone could leak or pass around. What they're allowed to do inside the
app is enforced by Google's Firestore servers, not just by which buttons happen to
be visible.

| Team | What they do in the app |
|---|---|
| **Order Intake** | Clicks **+ New Order**, enters marketplace, client, delivery location, product, label creation date, and the label tracking ID |
| **Warehouse** | Works the **Warehouse Queue** board — acknowledges labels, marks items packed, adds the USPS tracking number when it ships — and logs incoming client stock in **Storage / Inventory** |
| **Transactions** | Uses **Comms & Issues** to log WhatsApp updates, flag problem orders, mark orders Delivered, and follow orders through to resolution |
| **Admin** | Everything above, plus the **Admin / Team** panel to add and remove teammates |

Works fully on mobile — anyone can process orders from a phone on the warehouse
floor. You only need to do the setup below once.

---

## What this is built on

- Plain HTML/CSS/JavaScript — no build tools, nothing to compile.
- **Firebase Authentication** (real per-person email/password logins) and
  **Firestore** (Google's free-tier real-time database) so all teams see the same
  data instantly, with server-side rules controlling exactly who can do what.
- **GitHub Pages** hosts the site itself for free, straight from this repo.

The free Firebase tier comfortably covers 100–500 orders/day with room to spare.

---

## Setup (do this once, ~20 minutes)

### 1. Create your Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and sign in with any Google account.
2. Click **Add project** → name it (e.g. "us-prime-prep-deck") → you can skip Google Analytics → **Create project**.
3. In the left menu, click **Build → Firestore Database** → **Create database** → choose a region close to your warehouse → start in **Production mode**.
4. Click the **⚙ gear icon → Project settings**, scroll to "Your apps", click the **</> (Web)** icon, give it a nickname, and click **Register app**. Firebase will show you a `firebaseConfig` object.
5. Copy those values into `js/firebase-config.js` in this project, replacing the `PASTE_YOUR_...` placeholders.

### 2. Turn on Email/Password sign-in

In the Firebase console, go to **Build → Authentication → Get started**, click the
**Sign-in method** tab, click **Email/Password**, toggle it **Enable**, and click
**Save**. This is what makes real per-person logins possible.

### 3. Set your Firestore security rules

Go to **Firestore Database → Rules**, delete everything in the box, paste this in,
and click **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() {
      return request.auth != null;
    }
    function myProfile() {
      return get(/databases/$(database)/documents/team_members/$(request.auth.token.email)).data;
    }
    function myTeam() {
      return myProfile().team;
    }
    function isAdmin() {
      return isSignedIn() && myTeam() == 'Admin';
    }
    function isNotesOnlyChange() {
      let changed = request.resource.data.diff(resource.data).affectedKeys();
      return changed.hasOnly(['notes','updatedAt','flaggedIssue']);
    }
    function statusChangeAllowed() {
      let newStatus = request.resource.data.status;
      let team = myTeam();
      return (team == 'Warehouse' && newStatus in ['Label Acknowledged','Packed','Shipped','Exception']) ||
             (team == 'Transactions' && newStatus in ['Delivered','Exception','Shipped']);
    }

    match /team_members/{email} {
      allow read: if isSignedIn();
      allow write: if isAdmin();
    }

    match /orders/{orderId} {
      allow read: if isSignedIn();
      allow create: if isSignedIn() && (myTeam() == 'Order Intake' || isAdmin());
      allow update: if isSignedIn() && (isAdmin() || isNotesOnlyChange() || statusChangeAllowed());
      allow delete: if isAdmin();
    }

    match /inventory/{batchId} {
      allow read: if isSignedIn();
      allow write: if isSignedIn() && (myTeam() == 'Warehouse' || isAdmin());
    }
  }
}
```

This is the **real** security layer — it's enforced on Google's servers, not in
the app's code, so it can't be bypassed by a technically-savvy teammate poking
around in their browser's dev tools. In plain terms: Order Intake can create
orders but can't mark them Delivered; Warehouse can move orders through
Acknowledged → Packed → Shipped and manage Storage; Transactions can mark orders
Delivered or flag/resolve Exceptions; everyone can add notes; Admin can do
everything, including managing the team member list. See **How the permissions
work** below for the full picture.

### 4. Create your own Admin login

1. Still in the Firebase console: **Authentication → Users tab → Add user**.
2. Enter your own email (use the one you'll actually sign in with — lowercase) and set a password.
3. Now go to **Firestore Database → Data**, click **Start collection**, name it exactly `team_members`.
4. For the **Document ID**, enter your email again (exact same lowercase address), then add two fields:
   - `name` (type: string) → your name
   - `team` (type: string) → `Admin`
5. Click **Save**.

This one manual step bootstraps your first Admin account — after this, you can add
everyone else from inside the app itself (next section), no more Firestore console
needed for new teammates.

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

---

## Setting up your team

Every teammate needs **two** things before they can use Prep Deck — both are
one-time setup, and only an Admin can do them:

1. **A login.** In the Firebase console: **Authentication → Users → Add user** →
   enter their email (lowercase) and a temporary password. Tell them this
   password directly (WhatsApp, in person, however you'd share any password) —
   they can't reset it themselves yet since this app doesn't have a "forgot
   password" flow built in (see note at the bottom if you want that added).

2. **A profile.** Open Prep Deck, sign in as Admin, go to **Admin / Team** in the
   sidebar, and add their **exact same email**, their name, and their team. This
   is what tells Prep Deck who they are and what they're allowed to do — without
   it, they can have a valid login and still won't get in.

Use the *exact* same lowercase email address in both places, or the two won't
match up and they'll be stuck at the login screen with an "account isn't set up"
message.

To remove someone: delete them from **Admin / Team** in the app (stops them using
Prep Deck immediately), and separately delete their login under **Authentication →
Users** in the Firebase console if you want to fully revoke their access (e.g. if
they've left the company).

---

## How the permissions work

| Action | Order Intake | Warehouse | Transactions | Admin |
|---|:---:|:---:|:---:|:---:|
| Create new orders | ✅ | — | — | ✅ |
| Acknowledge label / mark packed / ship | — | ✅ | — | ✅ |
| Manage Storage / Inventory | — | ✅ | — | ✅ |
| Mark Delivered / flag or resolve Exception | — | — | ✅ | ✅ |
| Add notes, WhatsApp logs, issue flags | ✅ | ✅ | ✅ | ✅ |
| Manage team members | — | — | — | ✅ |

The app hides buttons a teammate can't use, so nobody sees a dead-end action —
but the real protection is the Firestore rule from step 3, which rejects the
write on Google's servers even if someone tried to trigger it directly (e.g. via
their browser's dev console). Both layers exist together on purpose: the UI
hiding is for a clean experience, the rules are what actually keeps things safe.

---

## Security

### Real per-person logins, not a shared password

Every teammate has their own email + password (set up in the Firebase console —
see "Setting up your team" above). Nobody shares a code, and removing someone's
access is one click. **Switch User** and **Log Out** in the sidebar both fully
sign a person out — with real individual accounts, there's no safe way to hand a
session to someone else without them entering their own password, so both
buttons exist for convenience but do the same secure thing underneath.

### Login attempt protection

Firebase Authentication automatically throttles repeated failed sign-in attempts
on its own servers — this can't be bypassed by clearing your browser's data,
because it's enforced by Google, not by this app. Prep Deck also shows a local
"too many attempts, wait a moment" message after 5 failed tries in quick
succession, purely as a friendlier heads-up; the real protection is Firebase's.

### About the "possible valid secret" email from GitHub

If GitHub ever emails you saying it found a **Google API Key** in
`js/firebase-config.js`, that's expected, not a mistake. Firebase's web API key
is designed to sit in public, browser-visible code — it identifies which
Firebase project a request belongs to, it doesn't unlock anything by itself.
**What actually matters is the Firestore rules from step 3** — those are the real
access control, not whether the key is visible. See the extra hardening step
below if you want to restrict the key anyway.

### Recommended: restrict the API key itself (5 minutes, extra layer)

Even though the key isn't a secret, you can tell Google to only honor it from
your website — so even a copy-pasted key is useless anywhere else:

1. Go to [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials) and make sure the project selector (top left) shows your Firebase project.
2. Click the API key that matches the one in your `firebase-config.js`.
3. Under **Application restrictions**, choose **Websites** and add your GitHub Pages URL, e.g. `https://YOUR-USERNAME.github.io/*`.
4. Under **API restrictions**, choose **Restrict key** and select **Identity Toolkit API** and **Cloud Firestore API**.
5. Click **Save**. Changes can take a few minutes to apply.

If you see the GitHub alert again after this, go to **Security → Secret scanning
alerts** in your repo and close it as **Revoked**.

### What this setup does and doesn't protect against

**Protects against:** casual or accidental misuse, a lost/stolen phone with the
site bookmarked (useless without the password), a former employee's access
(revoke it in two clicks), one team accidentally doing another team's job, and
random internet strangers stumbling onto your data.

**Doesn't fully protect against:** someone who has a legitimate password
deliberately trying to abuse their own access (there's no audit-log alerting
here, though every action is timestamped and attributed to a name, so misuse is
traceable after the fact) — and it doesn't include password-reset self-service,
two-factor authentication, or account lockout policies beyond Firebase's
defaults. All of those are realistic additions if your team grows or the data
gets more sensitive — happy to build any of them when you need them.

---

## Daily workflow

**Order Intake** receives order details + shipping label from a client →
clicks **+ New Order** (or the orange **+** button on mobile) → fills in
marketplace (Amazon FBM, Walmart, Etsy, eBay, Shopify, TikTok Shop, or Other),
client, delivery location, product, the label's creation date, and its tracking
ID → **Create Order**. It now shows as **Order Received** and appears instantly
on the Warehouse Queue board.

**Warehouse** opens **Warehouse Queue**:
- *Awaiting Label Ack* column → confirms the physical label matches → **Acknowledge Label**
- *Acknowledged — To Pack* → once packed → **Mark Packed**
- *Packed — Ready to Ship* → once handed to USPS → **Ship (add USPS #)**, enters the
  USPS tracking number. Status flips to **Shipped** for everyone, instantly.

Warehouse also owns **Storage / Inventory** — whenever a client ships product into
the warehouse to hold, click **+ Log Stock Intake** and record the client,
product, cartons/boxes received, date, and bin location. As stock gets used or
shipped out, open that batch and **Apply Adjustment** with a negative number and
a reason. Use **Mark Returned to Client** if a client asks for unused stock back.

**Transactions** works from **Comms & Issues** and the **Dashboard**'s "Needs
attention" list — orders stuck too long, or marked **Exception** — and logs
WhatsApp updates or flags problems directly on the order. Once USPS shows
delivered, mark the order **Delivered** from its detail view.

**Admin** manages who has access from **Admin / Team**, and can do anything any
other team can do.

**Dashboard** gives a same-day snapshot: received, awaiting ack, packed, shipped,
delivered, and open exceptions, plus a storage snapshot — and a live "needs
attention" list so nothing sits untouched for 24+ hours without someone noticing.

**Reports** exports any date range / marketplace / client slice of orders to CSV,
plus a one-click export of every storage batch on record.

Use the search bar at the top any time to jump straight to an order by its
internal ref, delivery location, label tracking ID, or USPS tracking number — or
to a storage batch by its batch reference or product ref.

**On mobile:** tap the ☰ icon top-left for navigation, and the orange floating
**+** button (bottom-right) to start a new order from anywhere. This button only
ever appears once you're signed in — there's nothing usable on the login screen
itself. Tables become stacked cards so everything stays readable and tappable on
a phone screen.

---

## Notes on the data model

Every **order** carries: marketplace (with a free-text field when "Other" is
picked), client, delivery location, product/quantity, priority, the label's
creation date, its tracking ID, an optional link to the label file itself (paste
a Google Drive/email link — this app doesn't store files), current status, USPS
tracking number and delivery status, who did what and when at each stage, and a
running notes/WhatsApp-log/issue-flag thread.

Status always moves through: **Order Received → Label Acknowledged → Packed →
Shipped → Delivered**, with **Exception** available at any point for anything
that goes wrong, and a one-click resolve path back into the flow.

Every **storage batch** carries: client, product, an optional product ref/SKU,
cartons received vs. cartons remaining, units per carton, date received,
warehouse bin/location, condition, who logged it, a status (In Storage /
Partially Shipped / Depleted / Returned to Client), and a full history of every
quantity adjustment with who made it, when, and why. This is a stock
**register**, not an automatic inventory system — adjusting a batch when stock is
used doesn't happen by itself when an order ships; Warehouse logs it as a
deliberate step. If you'd rather have order shipments automatically deduct from
a linked storage batch, that's a bigger feature I can build when you're ready.

Every **team member** record (visible only to Admins) carries: email, name, and
team — this is what the Firestore rules check to decide what someone's allowed
to do, and it's separate from their actual login credential, which only exists
in Firebase Authentication.

## Possible future additions

Worth knowing these exist as options, not built by default:

- **Self-service password reset** — right now, an Admin sets everyone's initial
  password by hand. Adding a "forgot password" email link is a small addition.
- **Two-factor authentication** — Firebase supports it; adds a bit of sign-in
  friction in exchange for meaningfully stronger protection.
- **Auto-deducting storage** when an order tied to a client's stock ships.
- **Per-order audit trail export** — you already get who/when on every action;
  this would package it as a dedicated compliance-style report.
