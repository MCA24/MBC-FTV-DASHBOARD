# Redemption Dashboard - Customer Deployment Guide

This guide is for the Studio M team deploying the Redemption Dashboard on a customer's GoHighLevel sub-account. Everything below explains how the system works, what needs to be configured, and how to match GHL field IDs to field names.

> **Deployment approach:** All customer sub-accounts receive the same GHL snapshot before the dashboard is deployed. The snapshot copies the required custom fields and their names, but **field IDs are assigned at the sub-account level** — meaning each account gets its own IDs. After applying the snapshot, you must look up the field ID for **FTV Redemption Stamp** in the customer's account and use that as `PRIMARY_ACTION_FIELD_ID`. The tags (`ftv_qualified`, `ftv_rewarded`) are consistent across all accounts.

---

## 1. How the Dashboard Connects to GHL

The dashboard is a static HTML page hosted on Netlify. It does **not** talk to GHL directly from the browser. Instead, it calls three Netlify serverless functions, and those functions talk to the GHL API server-side. This keeps the API key hidden from the browser.

### Architecture

```
Browser (index.html)
   |
   |-- GET  /.netlify/functions/config     --> Returns dashboard title + redemption window
   |-- GET  /.netlify/functions/contacts    --> Fetches eligible or redeemed contacts from GHL
   |-- POST /.netlify/functions/checkin     --> Records a check-in / redemption on a contact in GHL
   |
Netlify Functions (server-side)
   |
   |-- GHL API: https://services.leadconnectorhq.com
       Auth: Bearer token (GHL_API_KEY)
       Version header: 2021-07-28
```

### Key points

- The API key is stored as a Netlify environment variable and is **never** exposed to the browser.
- All GHL requests use the `Authorization: Bearer <GHL_API_KEY>` header and `Version: 2021-07-28`.
- The dashboard connects to exactly **one** GHL location (sub-account), identified by `GHL_LOCATION_ID`.
- When a user opens the dashboard or returns to the tab, it auto-fetches contacts. There is no constant polling.

### GHL API endpoints used

| Function | GHL endpoint | Method | Purpose |
|----------|-------------|--------|---------|
| `contacts.js` | `/contacts/?locationId={id}&limit=100` | GET | Fetches contacts with pagination (up to 10 pages / 1,000 contacts). Filters by tags client-side in the function. |
| `checkin.js` | `/contacts/{contactId}` | GET | Reads a single contact to verify they haven't already been redeemed. |
| `checkin.js` | `/contacts/{contactId}` | PUT | Updates the contact's custom field and tags to record the redemption. |

---

## 2. Environment Variables

Set these in **Netlify > Site configuration > Environment variables**. After adding or changing any variable, you must trigger a redeploy (Deploys > Trigger deploy > Deploy site).

### Required variables

| Variable | What it does | How to find the value |
|----------|-------------|----------------------|
| `GHL_API_KEY` | Authenticates all API requests to GHL. This is a Private Integration API key (starts with `pit-`). | Create a Private Integration in the customer's sub-account — see Step 3 in Section 7. |
| `GHL_LOCATION_ID` | Tells the dashboard which GHL sub-account to pull contacts from. | Open the customer's sub-account in GHL. The URL will look like `app.gohighlevel.com/v2/location/XXXXX/`. The `XXXXX` part is the Location ID. |
| `REDEMPTION_TAG` | The tag that marks a contact as **eligible** for redemption. Contacts must have this tag to appear in the "Eligible" view. | This is whatever tag the customer's workflow applies when a contact qualifies. Example: `ftv_qualified`. Must match exactly (case-insensitive). |
| `REDEEMED_TAG` | The tag that marks a contact as **already redeemed**. Added automatically when the dashboard operator clicks "Check in". | Choose a tag name for the customer. Example: `ftv_rewarded`. This tag gets added and `REDEMPTION_TAG` gets removed during check-in. |
| `PRIMARY_ACTION_FIELD_ID` | The GHL custom field ID where the check-in timestamp is stored. This is the internal ID, not the field name. | Look up the ID for **FTV Redemption Stamp** in the customer's account after applying the snapshot — run `node list-custom-fields.js` with their credentials. |

### Optional variables

| Variable | What it does | Default if not set |
|----------|-------------|-------------------|
| `REDEMPTION_TITLE` | The title shown in the browser tab and at the top of the dashboard. | `Redemption Dashboard` |
| `REDEMPTION_WINDOW_DAYS` | Number of days after a contact's "date added" that they have to redeem. The dashboard shows "X days left" and "Expired" based on this. | `14` (set by the config function; the HTML briefly uses `7` before the config loads) |

### Legacy / reference variable (not used by code)

| Variable | Note |
|----------|------|
| `GHL_CHECKIN_FIELD_ID` | Present in `.env.example` and the original `.env` for documentation purposes. The actual code reads `PRIMARY_ACTION_FIELD_ID`, not this one. If you see it, you can ignore it or set it to the same value as `PRIMARY_ACTION_FIELD_ID` for your own reference. |

---

## 3. Redemption Engine - How It Works

The "redemption engine" is the logic that determines who is eligible, who has redeemed, and what happens when someone clicks "Check in." It is entirely tag-driven and configured through environment variables.

### Eligibility logic

**Eligible view** (default): Shows contacts who have `REDEMPTION_TAG` **and** do NOT have `REDEEMED_TAG`.

**Redeemed view** (toggle in the UI): Shows contacts who have `REDEEMED_TAG`.

### What happens when the operator clicks "Check in"

1. The browser sends `POST /.netlify/functions/checkin` with `{ "contactId": "..." }`.
2. The `checkin` function fetches the contact from GHL to verify:
   - If the custom field (`PRIMARY_ACTION_FIELD_ID`) already has a value, **OR**
   - If the contact already has `REDEEMED_TAG`
   - Then it returns `"Already checked in"` and does nothing.
3. If not already redeemed, the function sends a `PUT /contacts/{contactId}` to GHL with:
   - **Custom field update**: Sets `PRIMARY_ACTION_FIELD_ID` to the current ISO timestamp (e.g., `2026-03-06T15:30:00.000Z`).
   - **Tag swap**: Removes `REDEMPTION_TAG` from the contact's tags and adds `REDEEMED_TAG`.
4. The contact moves from the "Eligible" view to the "Redeemed" view.

### Redemption window

The "Days left to redeem" countdown on each card is calculated in the browser:

```
days_left = REDEMPTION_WINDOW_DAYS - (today - contact.dateAdded)
```

This is display-only. It does **not** prevent check-in. Even if the countdown shows "Expired," the operator can still click "Check in." If you want to enforce a hard cutoff, that would need to be added to the `checkin` function.

### Redemption code

The "Redemption Code" shown on each contact card is the **last 4 characters of the GHL contact ID**, uppercased. This is a display convenience for quick identification. It is not a separate field in GHL.

### Summary of the tag lifecycle

```
Contact qualifies (workflow/automation in GHL)
  --> Tag: REDEMPTION_TAG added
  --> Contact appears in dashboard "Eligible" view

Operator clicks "Check in" on the dashboard
  --> Tag: REDEMPTION_TAG removed
  --> Tag: REDEEMED_TAG added
  --> Custom field PRIMARY_ACTION_FIELD_ID set to timestamp
  --> Contact moves to "Redeemed" view
```

---

## 4. Field IDs and Field Names

All customer accounts are set up from the same GHL snapshot. The snapshot copies the custom field **names**, but GHL generates **new field IDs** for each sub-account. After applying the snapshot, you must look up the new IDs.

### Custom fields copied by the snapshot

| Field Name in GHL | Used by dashboard? | Notes |
|-------------------|-------------------|-------|
| FTV Redemption Stamp | **Yes** — set as `PRIMARY_ACTION_FIELD_ID`. Stores the check-in timestamp when an operator clicks "Check in." | Run `node list-custom-fields.js` to get the ID for this field in the customer's account. |
| ftv-date-added | No — used by GHL workflows, not by the dashboard. | Records when the contact was tagged as qualified. |
| ftv-code | No — used by GHL workflows, not by the dashboard. | Stores the last 4 characters of the contact ID as a redemption code. |

### If something doesn't look right

If a customer account is missing the expected custom fields (e.g., the snapshot wasn't applied, or it was applied incorrectly), you can verify what's in that account by running:

```bash
# Add the customer's credentials to .env first
node list-custom-fields.js
```

This calls the GHL API and prints every custom field with its **Name**, **ID**, and **Key** for that location. You can also run `node test-connection.js` to confirm the API key and location ID are valid before deploying.

### Standard GHL contact fields (no custom ID needed)

These are built-in GHL properties that the dashboard reads automatically. No configuration required.

| What the dashboard shows | GHL property | Notes |
|--------------------------|-------------|-------|
| Name | `contactName`, `name`, or `firstName` + `lastName` | Falls through in that order. |
| Phone | `phone` | Formatted as (XXX) XXX-XXXX in the UI. |
| Email | `email` | |
| Date Added | `dateAdded` | Used for the "Days left to redeem" calculation. |
| Date Updated | `dateUpdated` | Shown in CSV export. |
| Tags | `tags` | Used to filter by `REDEMPTION_TAG` and `REDEEMED_TAG`. |
| Redemption Code | `id` (last 4 chars) | Display only, derived from the contact's GHL ID. |
| Checked in | Value of `PRIMARY_ACTION_FIELD_ID` custom field | Read from the contact's `customFields` array by matching the field ID. |

---

## 5. What's in the Snapshot

The GHL snapshot is the starting point for every customer deployment. It copies the full configuration needed for the FTV system into the customer's sub-account. Here's what's included:

| Component | What it is | Notes |
|-----------|-----------|-------|
| **Custom fields** | FTV Redemption Stamp, ftv-date-added, ftv-code | Field names copy over. **Field IDs are regenerated** — you must look up the new IDs after applying the snapshot. |
| **Contact tags** | `ftv_qualified`, `ftv_rewarded` | Copied as-is. These are used by both the workflow and the dashboard. |
| **FTV qualification workflow** | Automates contact qualification when someone signs up through the funnel. See Section 6 below for details. | Verify the workflow is **active** after applying the snapshot. |
| **FTV funnel** | The landing page / sign-up form that contacts come through. | This is the page the QR code should link to (not the dashboard). |

After applying the snapshot, the only manual configuration steps are: looking up the new field IDs, creating a Private Integration for the API key, deploying the dashboard to Netlify, and the finishing touches (custom menu link, QR code, subdomain).

---

## 6. The GHL Qualification Workflow

The snapshot includes a GHL workflow that automates the contact qualification process. Understanding what this workflow does will help you troubleshoot if contacts aren't showing up in the dashboard.

### What the workflow does

When a contact signs up through the FTV funnel:

1. The workflow checks whether the contact already has the `ftv_rewarded` tag (meaning they've already used their FTV offer).
2. If **not** rewarded:
   - Adds the `ftv_qualified` tag — this is what makes the contact appear in the dashboard's "Eligible" view.
   - Records the current date in the **ftv-date-added** custom field.
   - Strips the contact's GHL ID to the last 4 characters and stores it in the **ftv-code** custom field — this becomes the contact's redemption code.
3. If **already** rewarded: the workflow stops and does nothing.

### After applying the snapshot

- Go to **Automation > Workflows** in the customer's GHL sub-account.
- Confirm the FTV qualification workflow is present and **active** (not paused or in draft).
- If the workflow is paused, activate it.

---

## 7. Step-by-Step: Deploying for a New Customer

### Phase 1 — GHL setup

1. **Apply the snapshot** to the customer's sub-account.

2. **Verify the workflow is active** — go to Automation > Workflows and confirm the FTV qualification workflow is turned on.

3. **Create a Private Integration** to get an API key:
   - In the customer's sub-account, go to **Settings > Integrations > Private Integrations** (or Settings > Developer > Private Integrations, depending on GHL version).
   - Click **Create Integration**.
   - Give it a name (e.g., `FTV Dashboard`).
   - Under **Scopes**, enable at minimum: **Contacts (Read/Write)**.
   - Save the integration and copy the **API key** — it starts with `pit-`.

4. **Get the Location ID** — open the customer's sub-account in GHL. The URL will look like `app.gohighlevel.com/v2/location/XXXXX/`. The `XXXXX` part is the Location ID.

5. **Look up the new field IDs** — update your local `.env` with the customer's API key and Location ID, then run:
   ```bash
   node list-custom-fields.js
   ```
   Find **FTV Redemption Stamp** in the output and copy its ID — that's the value for `PRIMARY_ACTION_FIELD_ID`.

### Phase 2 — Netlify deploy

6. **Build the deploy folder**:
   ```bash
   ./prepare-deploy.sh
   ```
   This creates a clean `deploy/` folder without the `.env` file.

7. **Deploy to Netlify**:
   - Go to [app.netlify.com](https://app.netlify.com)
   - Drag the `deploy/` folder onto the Netlify deploy area

8. **Set environment variables** in Netlify — go to Site configuration > Environment variables and add:

   | Variable | Value |
   |----------|-------|
   | `GHL_API_KEY` | *(customer's Private Integration API key — starts with `pit-`)* |
   | `GHL_LOCATION_ID` | *(customer's location ID — unique per account)* |
   | `PRIMARY_ACTION_FIELD_ID` | ID of **FTV Redemption Stamp** from step 5 |
   | `REDEMPTION_TAG` | `ftv_qualified` *(same for all accounts)* |
   | `REDEEMED_TAG` | `ftv_rewarded` *(same for all accounts)* |
   | `REDEMPTION_TITLE` | e.g. `FTV Redemption Dashboard` |
   | `REDEMPTION_WINDOW_DAYS` | e.g. `30` |

9. **Trigger a deploy** — go to Deploys > Trigger deploy > Deploy site.

10. **Verify the dashboard**:
    - Open the site URL
    - Confirm the title matches `REDEMPTION_TITLE`
    - Confirm contacts load (if the customer already has contacts tagged `ftv_qualified`)
    - Test a check-in on a test contact and verify:
      - The `FTV Redemption Stamp` field gets set in GHL
      - Tags swap from `ftv_qualified` to `ftv_rewarded`
      - The contact moves to the "Redeemed" view

### Phase 3 — Finishing touches

11. **Add the dashboard as a Custom Menu Link in GHL**:
    - In the GHL agency view, go to **Settings > Custom Menu Links** (or Company Settings > Custom Menu Links).
    - Add a new link with the Netlify site URL as the destination.
    - This embeds the dashboard in the GHL sidebar so staff can access it without leaving GHL.

12. **Generate a QR code** that links to the **FTV funnel URL** (not the dashboard). This QR code is for in-location use — staff or signage can display it so customers can sign up on the spot. Use any QR code generator.

13. **Connect a custom subdomain** to the Netlify site:
    - In Netlify, go to **Domain management > Add custom domain**.
    - Enter the subdomain (e.g., `ftv.customerdomain.com`).
    - Follow Netlify's DNS instructions to point the subdomain to the Netlify site.
    - Wait for DNS propagation and SSL provisioning.

---

## 8. File Structure

```
FTV-dashboard/
├── index.html                      # Frontend - single-page dashboard UI
├── netlify.toml                    # Netlify config (functions dir, publish dir)
├── netlify/
│   └── functions/
│       ├── config.js               # Returns REDEMPTION_TITLE and REDEMPTION_WINDOW_DAYS
│       ├── contacts.js             # Fetches + filters contacts from GHL by tags
│       └── checkin.js              # Records redemption: sets custom field + swaps tags
├── list-custom-fields.js           # Helper: lists all custom fields for a location
├── test-connection.js              # Helper: verifies API key + location ID work
├── prepare-deploy.sh               # Helper: creates deploy folder without .env
├── .env.example                    # Template for local development
└── README.md                       # Original setup readme
```

---

## 9. Security Notes

- The GHL API key is **only** accessed in the Netlify serverless functions. It is never sent to or visible in the browser.
- The `.env` file should never be committed to Git or included in a Netlify deploy. Use Netlify's environment variable UI instead.
- The `.gitignore` excludes `.env`.
- CORS headers (`Access-Control-Allow-Origin: *`) are set on all function responses because the frontend and functions are on the same domain via Netlify.

---

*Powered by Studio M*
