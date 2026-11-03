# Etsy → ShipGlobal (Chrome extension)

Reads an order from Etsy Shop Manager and creates it on ShipGlobal through the
[ShipGlobal Vendor API](https://developer.docs.shipglobal.in/) (`POST https://app.shipglobal.in/apiv1/order/add`).

## Install

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this folder.
3. Click the extension's toolbar icon (or **Details → Extension options**) and enter your
   ShipGlobal login email and password. Click **Test connection** to check them.
4. Set your order defaults (service, weight, box size, HSN code, tax rate…) and **Save**.

## Use

1. In Etsy go to **Shop Manager → Orders & Shipping**. Every order card gets an orange plane
   icon under its truck / message / ⋮ icons, and the order details panel has an orange
   **Send to ShipGlobal** button next to **Order actions**.
2. Click it. The popup asks, in three numbered steps, only for what Etsy doesn't provide:
   **01 Package** (size and weight, with volumetric and billed weight worked out as you type),
   **02 Items & HSN** (with the **Currency** picker for the prices — Etsy's currency, or your
   default, is pre-selected), and **03 Service** (click the service to see ShipGlobal's live
   rates with transit times and pick one; buyer phone; export type). What Etsy already gave you — address, email, invoice — sits in the
   **From Etsy** card on the right; click **Edit** to change it. It opens by itself if
   something there is missing.
   Under **03 Service** you'll see the shipping option the buyer chose on Etsy (e.g.
   "Standard Shipping · $0.00 · expects delivery by Nov 12-18"), with a nudge when they paid
   for faster shipping. Etsy only shows this in the order details panel, so if that isn't
   open the extension opens it behind the popup for a moment, reads it, and closes it again.
3. Unit prices start as the order total split by quantity (the order list doesn't show
   per-item prices, and the total can include shipping and tax) — adjust before sending.
4. Click **Create ShipGlobal order**. The tracking number is shown and saved; the options page
   lists every order sent from this browser, and the popup warns you before sending one twice.

**Get HSN.** Items with no HSN yet are looked up automatically when the popup opens, and the
top suggestion is filled in — check it before sending. Click the ✦ icon on the **HSN code**
label to see all suggestions with their confidence and pick another. The lookup:

- **By item name first** — the same lookup as the "Get HSN" button on ShipGlobal's Add Order
  page. Etsy titles name the material, which a photo can't show (a copper bottle reads as
  stainless steel from its photo). It isn't in the public API and uses your ShipGlobal
  **dashboard** login: keep a signed-in v2.app.shipglobal.in tab open in the same browser and
  the extension reads the session from it when needed.
- **From the Etsy listing photo** as the fallback (e.g. no dashboard login), via ShipGlobal's
  public HSN classifier at hsn.shipglobal.in. No login needed. The suggestions popup can
  switch between the two.

**Buyer phone.** When the buyer gave a phone number on Etsy (it's the last line of their
address), it's used, with the country calling code added for their shipping country —
"(248)555-1234" in the US becomes "+1 (248)555-1234", "07700 900123" in the UK becomes
"+44 7700 900123". Your fallback number (settings) is used only when they didn't give one;
a note under the field says which it is.

**Package presets.** Add the boxes you ship in often (name, L × B × H, weight) under
**Package presets** in the settings. In the popup, **Presets** on the **01 Package** step
applies one with a click; it shows the preset's name while the size matches it. You can also
save the size you've typed as a new preset from there.

After a successful order the extension remembers the HSN/tax you used for each product and
the box size/weight for that combination of items, and pre-fills them next time.
The toolbar icon still works too: it opens the popup for the order you last clicked on.

Creating an order does **not** pay for it or buy a label. Do that in the ShipGlobal dashboard
(the API's "Pay & Get Label" endpoint isn't wired up here).

## How the order is read

Etsy's page structure isn't a public API, so `src/extract.js` looks for landmarks rather than
exact class names: 9–12 digit order numbers next to "Order"/"#", Etsy's address markup
(`.name`, `.first-line`, `.city`, `.zip`, `.country-name` — present in the page even while
"Ship to" is collapsed), the buyer's `mailto:` link, and item blocks with a "Quantity" label
(or `/listing/` links on other pages). Checked against the Shop Manager completed-orders list
in November 2026.
Anything it can't find is left blank in the form. If Etsy changes their layout and fields
come up empty, that's the file to adjust.

`test/fixture.html` is a mock order page for checking the reader and form without Etsy:

```bash
python3 -m http.server 8765
```

then open http://localhost:8765/test/fixture.html and click the ShipGlobal button
(API calls are stubbed on that page).

## Files

| File | What it does |
| --- | --- |
| `manifest.json` | Manifest V3; runs on `etsy.com/your/*`, calls `app.shipglobal.in` |
| `background.js` | ShipGlobal API client (Basic auth), saves sent orders |
| `src/extract.js` | Reads orders from the Etsy page |
| `src/content.js` | Floating button and the order form |
| `src/countries.js` | Country name → ISO code |
| `src/sg-session.js` | Runs on the ShipGlobal dashboard; hands its login session to the extension for Get HSN |
| `options.*` | Credentials, defaults, sent-order history |

Credentials and the dashboard session are kept in `chrome.storage.local` in this browser only
and are never sent to the Etsy page.
