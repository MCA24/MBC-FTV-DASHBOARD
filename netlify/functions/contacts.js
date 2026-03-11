const https = require('https');
const fs = require('fs');

function loadEnv() {
  try {
    fs.readFileSync('.env', 'utf8').split('\n').forEach((line) => {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim();
    });
  } catch (e) {}
}

loadEnv();

function mapContact(c, primaryActionFieldId) {
  const customFields = c.customFields || c.customFieldValues || [];
  const primaryField = primaryActionFieldId
    ? customFields.find((f) => (f.id || f.customFieldId) === primaryActionFieldId)
    : null;
  const checkedInAt = primaryField?.value != null && String(primaryField.value).trim() !== ''
    ? primaryField.value
    : null;

  return {
    id: c.id,
    name: c.contactName || c.name || `${(c.firstName || '').trim()} ${(c.lastName || '').trim()}`.trim() || 'Unknown',
    phone: c.phone || null,
    email: c.email || null,
    tags: c.tags || [],
    dateAdded: c.dateAdded || null,
    dateUpdated: c.dateUpdated || null,
    source: c.source || null,
    checkedInAt,
  };
}

function fetchPage(apiKey, url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      method: 'GET',
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Version': '2021-07-28',
        'Accept': 'application/json',
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Failed to parse GHL response'));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function fetchContacts(apiKey, locationId, primaryActionFieldId, redemptionTag, redeemedTag, mode) {
  const allFiltered = [];
  const maxPages = 10;
  let url = `https://services.leadconnectorhq.com/contacts/?locationId=${locationId}&limit=100`;
  let page = 0;

  const redemptionTagLower = redemptionTag ? String(redemptionTag).toLowerCase() : null;
  const redeemedTagLower = redeemedTag ? String(redeemedTag).toLowerCase() : null;

  while (page < maxPages) {
    const json = await fetchPage(apiKey, url);
    const raw = json.contacts || [];
    const filtered = raw
      .map((c) => mapContact(c, primaryActionFieldId))
      .filter((c) => {
        const tags = c.tags || [];
        const tagValues = tags.map((t) => String(t).toLowerCase());

        if (mode === 'redeemed') {
          // Redeemed mode: must have redeemed tag if configured
          if (redeemedTagLower && !tagValues.includes(redeemedTagLower)) {
            return false;
          }
          return true;
        }

        // Eligible mode (default): must have redemption tag and not have redeemed tag
        if (redemptionTagLower && !tagValues.includes(redemptionTagLower)) {
          return false;
        }

        if (redeemedTagLower && tagValues.includes(redeemedTagLower)) {
          return false;
        }

        return true;
      });
    allFiltered.push(...filtered);

    const nextUrl = json.meta?.nextPageUrl;
    if (!nextUrl) break;
    url = nextUrl;
    page++;
  }

  return allFiltered.sort((a, b) => {
    if (mode === 'redeemed') {
      const da = a.checkedInAt ? new Date(a.checkedInAt).getTime() : 0;
      const db = b.checkedInAt ? new Date(b.checkedInAt).getTime() : 0;
      return db - da;
    }

    const da = a.dateAdded ? new Date(a.dateAdded).getTime() : 0;
    const db = b.dateAdded ? new Date(b.dateAdded).getTime() : 0;
    return db - da;
  });
}

exports.handler = async (event) => {
  const API_KEY = process.env.GHL_API_KEY;
  const LOCATION_ID = process.env.GHL_LOCATION_ID;
  const PRIMARY_ACTION_FIELD_ID = process.env.PRIMARY_ACTION_FIELD_ID;
  const REDEMPTION_TAG = process.env.REDEMPTION_TAG;
  const REDEEMED_TAG = process.env.REDEEMED_TAG;

  if (!API_KEY) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'GHL_API_KEY not configured' }),
    };
  }

  if (!LOCATION_ID) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'GHL_LOCATION_ID required. Add it to .env — find it in your GHL URL: app.gohighlevel.com/v2/location/XXXXX/ (the XXXXX part)' }),
    };
  }

  if (!REDEMPTION_TAG) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'REDEMPTION_TAG required. Configure the qualification tag for this dashboard in your environment variables.' }),
    };
  }

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
      body: '',
    };
  }

  try {
    const params = event.queryStringParameters || {};
    const modeParam = (params.mode || 'eligible').toString().toLowerCase();
    const mode = modeParam === 'redeemed' ? 'redeemed' : 'eligible';

    const contacts = await fetchContacts(
      API_KEY,
      LOCATION_ID,
      PRIMARY_ACTION_FIELD_ID,
      REDEMPTION_TAG,
      REDEEMED_TAG,
      mode,
    );
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify({ contacts, total: contacts.length }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message || 'Failed to fetch contacts' }),
    };
  }
};
