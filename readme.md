# Studio M Redemption Engine

A live dashboard that displays GoHighLevel contacts eligible for a redemption or primary action, driven entirely by environment variables.

## Setup

### 1. Deploy to Netlify

1. Go to [app.netlify.com](https://app.netlify.com)
2. Run `./prepare-deploy.sh` to create a clean `deploy/` folder (excludes `.env`)
3. Drag the `deploy/` folder onto the Netlify deploy area

### 2. Add Environment Variables (Required)

1. In Netlify, go to **Site configuration** → **Environment variables** (or **Site settings** → **Environment variables**)  
2. Click **Add a variable** or **Manage variables**  
3. Add these variables:

| Variable | Value | Required | Example (FTV) |
|----------|-------|----------|----------------|
| `GHL_API_KEY` | Your GoHighLevel API key | Yes | `pit-xxxxxxxx` |
| `GHL_LOCATION_ID` | Your location ID | Yes | `abc123` |
| `REDEMPTION_TAG` | Tag that marks a contact as eligible | Yes | `ftv_qualified` |
| `REDEEMED_TAG` | Tag that marks a contact as redeemed | Yes | `ftv_rewarded` |
| `PRIMARY_ACTION_FIELD_ID` | Custom field ID for the check-in timestamp — look up with `node list-custom-fields.js` | Yes | `abc123xyz` |
| `REDEMPTION_TITLE` | Title for the dashboard UI | Optional | `FTV Redemption Dashboard` |
| `REDEMPTION_WINDOW_DAYS` | Days after contact was added that they have to redeem | Optional | `30` |

4. **Trigger deploy** — Go to **Deploys** → **Trigger deploy** → **Deploy site** (required after adding variables)

### 3. Done!

Your dashboard will now:
- Pull contacts tagged with `REDEMPTION_TAG` live from your GHL account (and not yet marked with `REDEEMED_TAG`)
- Refresh when you return to the tab (no constant polling)
- Let you manually refresh with the button
- Search/filter by name, phone, email, or contact ID
- Download contacts as CSV
- **Check-in**: Record check-ins that update the GHL custom field set in `PRIMARY_ACTION_FIELD_ID`

## File Structure

```
studio-m-redemption-engine/
├── index.html                    # Frontend dashboard
├── netlify.toml                  # Netlify config
├── netlify/
│   └── functions/
│       ├── contacts.js           # Fetches eligible contacts from GHL
│       ├── checkin.js            # Generalized primary action (check-in / redemption)
│       └── config.js             # Returns UI config such as REDEMPTION_TITLE
└── README.md
```

## Security

Your GHL API key is stored as a Netlify environment variable and only accessed server-side in the function. It is **never** exposed to the browser or page source.

Powered by Studio M × GoHighLevel
