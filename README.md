# Etsy → ShipGlobal

A Chrome extension that turns an Etsy order into a ShipGlobal shipment in one popup.

It reads the order straight from **Etsy Shop Manager** — buyer, address, phone, items, photos,
variations, gift notes, the shipping option the buyer chose — asks only for what Etsy doesn't
know (box size, weight, HSN code, service), and creates the order on **ShipGlobal** through the
[ShipGlobal Vendor API](https://developer.docs.shipglobal.in/).

- One click from any Etsy order: an orange ✈ under each order's icons, and a
  **Send to ShipGlobal** button in the order details panel
- HSN codes suggested by ShipGlobal and filled in for you
- Live ShipGlobal rates and transit times to pick a service
- Package presets for the boxes you use most, plus volumetric / billed weight as you type
- Remembers the HSN and box size you used per product, so repeat orders are pre-filled
- Warns you before sending the same Etsy order twice, and keeps the tracking numbers

> Creating an order on ShipGlobal does **not** pay for it or buy a label — do that in the
> ShipGlobal dashboard as usual.

---

## Contents

- [Requirements](#requirements)
- [Install](#install)
- [Set up](#set-up)
- [Send an order](#send-an-order)
- [What gets filled in, and from where](#what-gets-filled-in-and-from-where)
- [Settings reference](#settings-reference)
- [Updating the extension](#updating-the-extension)
- [Troubleshooting](#troubleshooting)
- [Privacy](#privacy)
- [Development](#development)

---

## Requirements

- **Google Chrome** (or another Chromium browser: Edge, Brave, Arc)
- An **Etsy seller account** with access to Shop Manager
- A **ShipGlobal account** (the email and password you sign in to app.shipglobal.in with)

## Install

The extension isn't on the Chrome Web Store; you load it from this folder.

1. Get the code:

   ```bash
   git clone https://github.com/invincibleaashi/sgetsy-extension.git
   ```

   (or download the repository as a ZIP from GitHub and unzip it).
2. In Chrome, open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the `sgetsy-extension` folder.
5. Optional: pin **Etsy → ShipGlobal** from the puzzle-piece menu so its orange icon is in the
   toolbar.

## Set up

Click the extension's toolbar icon (or **Details → Extension options** on
`chrome://extensions`) to open **Settings**. Five sections:

1. **01 Account** — enter your ShipGlobal **email** and **password** and click
   **Test connection**. It should say *Connected*.
   *Customer nickname* is only needed for ShipGlobal franchise accounts.
2. **02 Shipping defaults** — the service, currency, export type (Normal / CSB-5), default box
   size and weight every new order starts with, and a **fallback buyer phone / email** used
   only when the Etsy order has none.
3. **03 Package presets** — add the boxes you ship in often (name, L × B × H in cm, weight in kg),
   e.g. *Small box 20 × 15 × 10, 0.5 kg*. You'll apply them with one click when sending.
4. **04 Customs & invoice** — default HSN code and tax rate (fallbacks only; HSN is normally
   suggested per item), the **invoice prefix** (invoice numbers look like `ETSY-4220411712`),
   and your IOSS number for EU shipments.
5. **05 Sent orders** — the orders you've created from this browser, with tracking numbers.

Click **Save changes** (or press ⌘S / Ctrl+S).

**For better HSN suggestions**, stay signed in to the ShipGlobal dashboard
(<https://v2.app.shipglobal.in>) in the same browser and keep a tab of it open. The
extension uses that session for ShipGlobal's "Get HSN by name" lookup. Without it, HSN codes
are suggested from the product photo instead (see [HSN codes](#hsn-codes)).

## Send an order

1. In Etsy, open **Shop Manager → Orders & Shipping**.
2. Find the order and click the orange **✈** under its truck / message / ⋮ icons — or open
   the order and click **Send to ShipGlobal** next to **Order actions**.
   The button appears on **new orders only** — ones not yet marked complete. Orders with a
   completed status (Pre-transit, In transit, Delivered, No tracking, Canceled, Digital) don't
   get one, and an order's button disappears as soon as you mark it complete.
3. The popup opens with everything Etsy knows already filled in. Work down the left side:

   | Step | What to check |
   | --- | --- |
   | **01 Package** | Box size (L × B × H, cm) and weight (kg). Click **Presets** to apply a saved box, or save the current size as one. *Volumetric* and *Billed* weight update as you type — if billed is by size, a smaller box would cost less. |
   | **02 Items & HSN** | One card per item with its photo. The name includes the buyer's variation (e.g. *… — Ribbed*). **Unit price** is the order total ÷ number of units. **HSN code** is suggested automatically — click **✦** next to the label to see other suggestions. Change the **Currency** at the top if needed. |
   | **03 Service** | Click the service to see ShipGlobal's live rates and transit times, and pick one. **Buyer phone** comes from the order (with the country code added); a note says where it came from. **Export type**: Normal or CSB-5. |

   The **From Etsy** card on the right shows the ship-to address, email and invoice details
   (click **Edit** to change them), plus the shipping option the buyer chose, variations,
   gift notes / personalization, any note from the buyer, your private note and the order
   total. It opens for editing by itself if something required is missing.
4. Click **Create order**. When ShipGlobal accepts it, the tracking number appears at the
   bottom and is saved to **Settings → Sent orders**.
5. Pay for the shipment / get the label in the ShipGlobal dashboard.

Small things that help:

- Icons at the top right of the popup flag what needs attention — hover to read them:
  ✓ *already sent* (click to copy the tracking number), ↺ *pre-filled from your last order of
  this item*, ! *ShipGlobal login missing* (click to open Settings).
- Fields that are missing or wrong are outlined in red when you click **Create order**
  (sizes, weight, quantity and price must be above 0; HSN is 4–8 digits).
- Clicking outside the popup or pressing **Esc** closes it — once you've changed something it
  asks you to do it a second time, so a stray click doesn't lose your work.
- The toolbar icon also opens the popup, for the order you last clicked on.

## What gets filled in, and from where

| Field | Source |
| --- | --- |
| Name, address, city, state, postcode, country | Etsy's ship-to address (country converted to its ISO code) |
| Email | Etsy's buyer contact link; your fallback email if there's none |
| Phone | The phone line of Etsy's address, with the country calling code added — `(248)555-1234` in the US becomes `+1 (248)555-1234`, `07700 900123` in the UK becomes `+44 7700 900123`. Your fallback phone only if the buyer gave none. |
| Items, quantities, photos | The order's item list |
| Variations | Added to the item name sent to ShipGlobal (e.g. *Water Bottle — Ribbed*). Gift notes and personalization are **not** sent; they're shown in the From Etsy card only. |
| Unit price | Order total ÷ number of units (2 units on a $151.98 order → $75.99 each) |
| Currency | The currency of the Etsy order total; your default otherwise |
| HSN code, tax | Last value you used for that product → ShipGlobal suggestion → your default |
| Box size, weight | Last values you used for that combination of items → your default |
| Service, export type | Your defaults |
| Invoice number / date | Your prefix + the Etsy order number / today |
| Buyer's shipping choice, buyer note, private note, receipt | Etsy's order details panel. If it isn't open, the extension opens it behind the popup for a moment, reads it and closes it again. |

### HSN codes

Items without an HSN are looked up when the popup opens and the best suggestion is filled in —
**always check it**. Click **✦** to see every suggestion with its confidence and pick another.

1. **By item name first** — the same lookup as the *Get HSN* button on ShipGlobal's Add Order
   page. Etsy titles name the material, which is what HSN depends on. Needs your ShipGlobal
   dashboard to be signed in in the same browser.
2. **From the product photo** as the fallback — ShipGlobal's public HSN classifier
   (hsn.shipglobal.in), no login needed. Less reliable on materials (a copper bottle can read
   as stainless steel), so prefer the name lookup.

The suggestions popup lets you switch between the two. Once an order is created, the HSN you
used is remembered for that product.

## Settings reference

| Setting | Used for |
| --- | --- |
| Email, password | Signing in to the ShipGlobal Vendor API (creating orders, rates) |
| Customer nickname | ShipGlobal franchise accounts only |
| Service, currency, export type | Starting values for every order |
| Default package | Box size and weight when there's no preset or remembered size |
| Fallback buyer phone / email | Only when the Etsy order has none |
| Package presets | Boxes you can apply from **Presets** in the popup |
| Default HSN, tax rate | Only when no HSN is remembered or suggested |
| Invoice prefix | Invoice number = prefix + Etsy order number |
| IOSS number | EU shipments |

## Updating the extension

```bash
cd sgetsy-extension
git pull
```

Then click the **reload** icon on the extension's card in `chrome://extensions`. Open Etsy and
ShipGlobal tabs pick up the new version automatically; no page refresh needed.

## Troubleshooting

**No ✈ icons on my orders.** The button only appears on new orders — anything already
marked complete or shipped doesn't get one. Otherwise, make sure you're on an Etsy Shop
Manager orders page (`etsy.com/your/orders/...`) and the extension is enabled. If you just reloaded the extension
and a popup says *Refresh to continue*, refresh the page.

**"ShipGlobal login missing" / order creation fails with an auth error.** Re-enter your
email and password in **Settings → 01 Account** and click **Test connection**.

**HSN says "Name lookup uses your ShipGlobal dashboard login".** Open
<https://v2.app.shipglobal.in> in the same browser and sign in, then click **Try again** in the
HSN popup. The photo lookup works without it.

**Unit price looks wrong.** It's the order total divided by the number of units, so it
includes shipping and tax if the buyer paid them. Change it in the item card if you need a
different declared value.

**A field comes up empty.** Etsy sometimes doesn't show a detail (for example the buyer's
phone, or "expects delivery by"). Fill it in by hand — required fields are outlined when you
click **Create order**. If something that *is* on the Etsy page doesn't come through, Etsy
may have changed its layout; see [How the order is read](#how-the-order-is-read).

**"Already sent" warning.** You created a ShipGlobal order for this Etsy order before from
this browser. Hover the ✓ icon for the date and tracking number. Sending again creates a
second ShipGlobal order.

## Privacy

- Your ShipGlobal email, password and dashboard session are stored only in this browser
  (`chrome.storage.local`). They're never written to files and never shared with Etsy.
- Order data goes only to ShipGlobal: the order itself to the Vendor API, item names or
  photos to ShipGlobal's HSN lookup, and weight / country / postcode for rates.
- The extension runs only on Etsy Shop Manager pages (`etsy.com/your/*`) and the ShipGlobal
  dashboard.

## Development

No build step — the files in this folder are the extension. Edit, then reload it in
`chrome://extensions`.

### Files

| File | What it does |
| --- | --- |
| `manifest.json` | Manifest V3: permissions, content scripts, settings page |
| `background.js` | ShipGlobal API client (Vendor API with Basic auth, HSN lookups, rates), remembers sent orders / HSN / box sizes, re-injects scripts after a reload |
| `src/extract.js` | Reads orders from the Etsy page: address, phone, items, variations, notes, shipping choice, receipt |
| `src/content.js` | The ✈ buttons on Etsy and the popup (shadow DOM, Etsy-styled) |
| `src/countries.js` | Country names → ISO codes for all countries, and phone calling codes |
| `src/sg-session.js` | Runs on the ShipGlobal dashboard; hands its login session to the extension for the HSN name lookup |
| `options.html` / `.css` / `.js` | Settings page |
| `icons/` | Toolbar icons |
| `test/fixture.html` | Mock Etsy orders page (API calls stubbed) |
| `test/options.html` | Settings page with `chrome.*` stubbed |

### How the order is read

Etsy's page structure isn't a public API, so `src/extract.js` relies on landmarks rather than
exact class names: 9–12 digit order numbers shown as links, Etsy's address markup (`.name`,
`.first-line`, `.city`, `.zip`, `.country-name`, `.phone` — present even while "Ship to" is
collapsed), the buyer's `mailto:` link, item blocks with a "Quantity" label, and label/value
rows for variations. The order details panel (`.peek-overlay`) adds the shipping choice
("Selected by buyer"), notes and the receipt. Last checked against Shop Manager in
November 2026. If Etsy changes its layout and fields come up empty, this is the file to adjust.

### Trying changes without Etsy

```bash
python3 -m http.server 8765
```

Then open <http://localhost:8765/test/fixture.html> (mock orders — click a **Send to
ShipGlobal** button) or <http://localhost:8765/test/options.html> (settings page). ShipGlobal
calls are stubbed on both, so nothing is sent.

### APIs used

| Endpoint | For |
| --- | --- |
| `POST app.shipglobal.in/apiv1/order/add` | Create the order (Vendor API, Basic auth) |
| `POST app.shipglobal.in/apiv1/rates/calculate` | Rates and **Test connection** |
| `POST api.app.shipglobal.in/api/v1/hsn/classify-by-name` | HSN by item name (dashboard session) |
| `POST hsn.shipglobal.in/api/classify` | HSN from a product photo (public) |
