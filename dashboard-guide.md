# FTV Redemption Dashboard — How It Works

This guide explains how the dashboard connects to GoHighLevel (GHL), how environment variables are used, how the redemption engine works, and how to match field IDs with names in GHL.

---

## 1. How the dashboard connects to your GHL account

The dashboard talks to **one GoHighLevel location (sub-account)** using the official GHL API. All connection details come from environment variables; nothing is hardcoded.

### Connection flow

1. **Frontend (browser)**  
   - Loads `index.html` and calls Netlify serverless functions under `/.netlify/functions/`.

2. **Serverless functions (Netlify)**  
   - Run on Netlify’s servers and have access to environment variables (e.g. `GHL_API_KEY`, `GHL_LOCATION_ID`).  
   - They are the only place that uses the API key; the key is never sent to the browser.

3. **GHL API**  
   - Base URL: `https://services.leadconnectorhq.com`  
   - All requests use:
     - **Authorization:** `Bearer <GHL_API_KEY>`
     - **Version:** `2021-07-28`

### What the functions call

| Function    | Purpose | GHL API usage |
|------------|---------|----------------|
| **config** | Dashboard title and redemption window (days) | No GHL call; reads env only. |
| **contacts** | List eligible or redeemed contacts | `GET /contacts/?locationId=...` with pagination; filters by tags and maps custom fields. |
| **checkin** | Record a redemption/check-in for a contact | `GET /contacts/:id` to verify status, then `PUT /contacts/:id` to set custom field and tags. |

So the dashboard is “connected” to GHL only through these serverless functions, which use `GHL_API_KEY` and `GHL_LOCATION_ID` for that single location.

### Finding your Location ID

- In GHL, open the sub-account (location) you want this dashboard to use.  
- The URL looks like: `https://app.gohighlevel.com/v2/location/XXXXX/`  
- **`XXXXX`** is your `GHL_LOCATION_ID`.

---

## 2. Environment variables — what each one is for

These are read by the Netlify functions (and by `list-custom-fields.js` when run locally with a `.env` file). Set them in **Netlify → Site configuration → Environment variables** (and redeploy after changing them).

| Variable | Required | Purpose |
|----------|----------|--------|
| **GHL_API_KEY** | Yes | GoHighLevel API key (e.g. from GHL Settings → API Keys). Used in the `Authorization: Bearer ...` header for all GHL API requests. |
| **GHL_LOCATION_ID** | Yes | The GHL location (sub-account) ID. All contacts are read/updated in this location. Find it in the URL: `app.gohighlevel.com/v2/location/XXXXX/`. |
| **GHL_CHECKIN_FIELD_ID** | No (not used by code) | Present in `.env` and README; the **functions use PRIMARY_ACTION_FIELD_ID** for the check-in field. You can set this to the same value as `PRIMARY_ACTION_FIELD_ID` for your own reference, but the app does not read it. |
| **PRIMARY_ACTION_FIELD_ID** | Yes (for check-in) | Custom field ID in GHL where the “check-in” or “redemption” timestamp (or value) is stored. When a user clicks “Check in” in the dashboard, this field is set (and the contact is tagged with `REDEEMED_TAG`). |
| **REDEMPTION_TAG** | Yes | Tag that marks a contact as **eligible** for redemption (e.g. `ftv_qualified`). Contacts with this tag (and without `REDEEMED_TAG`) appear in the “Eligible” list. |
| **REDEEMED_TAG** | Yes | Tag that marks a contact as **already redeemed** (e.g. `ftv_rewarded`). Added when you record a check-in; contacts with this tag appear in the “Redeemed” view and are excluded from “Eligible”. |
| **REDEMPTION_TITLE** | No | Title shown in the dashboard UI (browser tab and main heading). Default: “Redemption Dashboard”. Example: `FTV Redemption Dashboard`. |
| **REDEMPTION_WINDOW_DAYS** | No | Number of days after “date added” that a contact can redeem (used for “Days left to redeem”). Default: 14 if unset or invalid. Example: `30`. |

### Summary

- **GHL connection:** `GHL_API_KEY` + `GHL_LOCATION_ID`.  
- **Who is eligible:** `REDEMPTION_TAG` (must have it) and must not have `REDEEMED_TAG`.  
- **Who is redeemed:** has `REDEEMED_TAG` and/or has the primary action field set.  
- **Recording a redemption:** set custom field `PRIMARY_ACTION_FIELD_ID` and add `REDEEMED_TAG`.  
- **UI:** `REDEMPTION_TITLE`, `REDEMPTION_WINDOW_DAYS`.

---

## 3. Redemption engine configuration and how it works

The “redemption engine” is the set of rules and actions that define who is eligible, who has already redeemed, and what happens when you click “Check in”.

### Tags (configured by env)

- **REDEMPTION_TAG** (e.g. `ftv_qualified`): “This contact is qualified to redeem.”  
- **REDEEMED_TAG** (e.g. `ftv_rewarded`): “This contact has already been rewarded/redeemed.”

### Custom field (configured by env)

- **PRIMARY_ACTION_FIELD_ID**: The GHL custom field that stores the redemption event (usually a date/time). The dashboard uses it to:
  - Show “Checked in” and “Redeemed” state.
  - Prevent double redemption (if the field is set or the contact has `REDEEMED_TAG`, check-in is rejected).

### Modes in the UI

1. **Eligible**  
   - Contacts that:
     - Have **REDEMPTION_TAG**, and  
     - Do **not** have **REDEEMED_TAG**.  
   - These are shown with a “Check in” button (unless they already have the primary action field set).

2. **Redeemed**  
   - Contacts that have **REDEEMED_TAG** (and optionally the primary action field set).  
   - Shown as “Redeemed” with no active check-in button.

### What happens when you click “Check in”

1. Frontend sends `POST /.netlify/functions/checkin` with `{ "contactId": "..." }`.
2. **checkin** function:
   - Fetches the contact from GHL (`GET /contacts/:id`).
   - Checks:
     - If the contact already has the **PRIMARY_ACTION_FIELD_ID** field set, or  
     - If the contact already has **REDEEMED_TAG**  
     → returns “Already checked in” and does not update.
   - Otherwise:
     - Sets the custom field **PRIMARY_ACTION_FIELD_ID** to a value (default: current ISO timestamp; or `body.value` if you send it).
     - Replaces **REDEMPTION_TAG** with **REDEEMED_TAG** on the contact (so they move from “Eligible” to “Redeemed”).
   - Sends `PUT /contacts/:id` with `customFields` and `tags`.

So the “redemption engine” is: **tag-based eligibility** + **one custom field** for the redemption moment + **tag swap** on check-in, all driven by the env vars above.

---

## 4. Field IDs and field names — matching with GHL

The dashboard only uses **one** GHL custom field by ID: the one you set as **PRIMARY_ACTION_FIELD_ID**. The dashboard does not store a human-readable “field name”; in GHL you can give that field any name (e.g. “Check-in date”, “FTV redemption date”).

### Field ID → name (as shown in GHL)

For your current location, the custom field used by this dashboard maps as follows:

| Field ID | Field name in GHL |
|----------|--------------------|
| **m6jdYHYxbaxNjpGKhPhl** | **FTV Redemption Stamp** |

Other FTV-related custom fields in your location (for reference):

| Field ID | Field name in GHL |
|----------|--------------------|
| m6jdYHYxbaxNjpGKhPhl | FTV Redemption Stamp *(used by dashboard for check-in)* |
| 6BlbbvK0m1w5Nkb5Qg9s | ftv-date-added |
| wM3vgzkZZO0ZErygxZ76 | ftv-code |

To see the full list of custom field names and IDs for your location anytime, run:
```bash
node list-custom-fields.js
```

### Reference table (dashboard ↔ GHL)

| Dashboard / env usage | Env variable | GHL side | Notes |
|----------------------|--------------|----------|--------|
| “Primary action” / check-in field | **PRIMARY_ACTION_FIELD_ID** | Custom field **ID** in your location | Used to store the redemption timestamp (or value). Name in GHL is whatever you set in Settings → Custom Fields. |
| (Optional, not used by code) | GHL_CHECKIN_FIELD_ID | Same as above if you want | Only for your own reference; set to same ID as PRIMARY_ACTION_FIELD_ID if you like. |

### Standard contact fields (no custom ID needed)

These are normal GHL contact properties. The dashboard uses them by standard property names, not by custom field ID:

| Dashboard label | GHL property / source | Notes |
|-----------------|------------------------|--------|
| Name | `contactName` or `name` or `firstName` + `lastName` | Shown on each card. |
| Phone | `phone` | Formatted in UI. |
| Email | `email` | |
| Redemption Code | Contact `id` (last 4 chars) | Display only; not a GHL field. |
| Added | `dateAdded` | Used for “Days left to redeem” with REDEMPTION_WINDOW_DAYS. |
| Checked in | Value of custom field **PRIMARY_ACTION_FIELD_ID** | Read from contact’s `customFields` / `customFieldValues` by matching `id` or `customFieldId` to PRIMARY_ACTION_FIELD_ID. |
| Tags | `tags` | Used for REDEMPTION_TAG and REDEEMED_TAG filtering. |

### How to get your custom field ID and match names in GHL

1. **List all custom fields for your location**  
   From the project root, with `GHL_API_KEY` and `GHL_LOCATION_ID` in `.env`:
   ```bash
   node list-custom-fields.js
   ```
   This calls `GET https://services.leadconnectorhq.com/locations/{locationId}/customFields` and prints each field’s **name**, **id**, and **key**.

2. **Match ID to name in GHL**  
   - In the script output, find the field you use for “check-in” / “redemption” (e.g. “Check-in date” or “FTV redemption date”).  
   - Copy its **ID** and set it as **PRIMARY_ACTION_FIELD_ID** in Netlify (and in `.env` for local runs).  
   - The **name** in the output is the same as in GHL Settings → Custom Fields for that location.

### Example output from `list-custom-fields.js`

Running `node list-custom-fields.js` prints every custom field for your location with **Name**, **ID**, and **Key**. The field you use for check-in in this dashboard is **FTV Redemption Stamp** (ID: `m6jdYHYxbaxNjpGKhPhl`).

---

## Quick reference — your current .env (FTV example)

| Variable | Example value | Use |
|----------|----------------|-----|
| GHL_API_KEY | `pit-xxxxxxx` | API auth for GHL. |
| GHL_LOCATION_ID | `xxxxxxxxxxxxx` | Which GHL location the dashboard uses. |
| GHL_CHECKIN_FIELD_ID | `xxxxxxxxxxx` | Optional duplicate of primary action field ID; **code uses PRIMARY_ACTION_FIELD_ID**. |
| PRIMARY_ACTION_FIELD_ID | `xxxxxxxxxxx` | Custom field where check-in/redemption is stored. |
| REDEMPTION_TAG | `ftv_qualified` | Tag for “eligible to redeem”. |
| REDEEMED_TAG | `ftv_rewarded` | Tag for “already redeemed”. |
| REDEMPTION_TITLE | `FTV Redemption Dashboard` | Dashboard title in UI. |
| REDEMPTION_WINDOW_DAYS | `30` | Days allowed to redeem after date added. |

For any other custom fields you add in GHL, run `node list-custom-fields.js` and use the printed **ID** and **name** to match dashboard env config with GHL Settings.
