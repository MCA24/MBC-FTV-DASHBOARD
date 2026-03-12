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

const PACIFIC_TZ = 'America/Los_Angeles';

/** Returns a Date formatted as ISO 8601 in Pacific time, preserving the local clock time (e.g. 2026-03-12T07:30:00.000-07:00). */
function toPacificIso(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) {
    return null;
  }

  const dateStr = d.toLocaleDateString('sv-SE', { timeZone: PACIFIC_TZ });
  const timeStr = d.toLocaleTimeString('sv-SE', { timeZone: PACIFIC_TZ, hour12: false });
  const ms = String(d.getUTCMilliseconds()).padStart(3, '0');

  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: PACIFIC_TZ, timeZoneName: 'longOffset' });
  const parts = fmt.formatToParts(d);
  const tzPart = parts.find((p) => p.type === 'timeZoneName');

  let offset = '-08:00';
  if (tzPart) {
    const m = tzPart.value.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (m) {
      const h = m[2].padStart(2, '0');
      const min = (m[3] || '00').padStart(2, '0');
      offset = `${m[1]}${h}:${min}`;
    }
  }

  return `${dateStr}T${timeStr}.${ms}${offset}`;
}

/** Resolves the action value as ISO 8601 in Pacific time, keeping the same local date/time when a value is provided. */
function resolveActionValue(rawValue) {
  if (rawValue != null && String(rawValue).trim() !== '') {
    const converted = toPacificIso(rawValue);
    // If we couldn't parse, fall back to the raw value so we don't break anything.
    return converted || rawValue;
  }
  // Default: now, in Pacific.
  return toPacificIso(new Date());
}

function fetchContact(apiKey, contactId, locationId) {
  return new Promise((resolve, reject) => {
    const path = `/contacts/${contactId}?locationId=${locationId}`;
    const options = {
      method: 'GET',
      hostname: 'services.leadconnectorhq.com',
      path,
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
          resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
        } catch {
          reject(new Error('Failed to parse contact response'));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

exports.handler = async (event) => {
  const API_KEY = process.env.GHL_API_KEY;
  const LOCATION_ID = process.env.GHL_LOCATION_ID;
  const PRIMARY_ACTION_FIELD_ID = process.env.PRIMARY_ACTION_FIELD_ID;
  const REDEMPTION_TAG = process.env.REDEMPTION_TAG;
  const REDEEMED_TAG = process.env.REDEEMED_TAG;

  if (!API_KEY || !LOCATION_ID) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'GHL_API_KEY or GHL_LOCATION_ID not configured' }),
    };
  }

  if (!PRIMARY_ACTION_FIELD_ID) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'PRIMARY_ACTION_FIELD_ID not configured. Add your GHL custom field ID for the primary action to environment variables.' }),
    };
  }

  if (!REDEMPTION_TAG || !REDEEMED_TAG) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'REDEMPTION_TAG and REDEEMED_TAG must be configured in environment variables.' }),
    };
  }

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  const contactId = body.contactId;
  if (!contactId) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'contactId is required' }),
    };
  }

  let existingContact;
  try {
    const { statusCode, data } = await fetchContact(API_KEY, contactId, LOCATION_ID);
    const contact = data.contact || data;
    if (statusCode === 200 && contact) {
      existingContact = contact;
      const customFields = contact.customFields || contact.customFieldValues || [];
      const primaryField = customFields.find((f) =>
        (f.id || f.customFieldId) === PRIMARY_ACTION_FIELD_ID || f.key === PRIMARY_ACTION_FIELD_ID
      );
      const hasPrimaryValue =
        primaryField && primaryField.value != null && String(primaryField.value).trim() !== '';

      const tags = contact.tags || [];
      const redeemedTagLower = String(REDEEMED_TAG).toLowerCase();
      const hasRedeemedTag = tags.some((t) => String(t).toLowerCase() === redeemedTagLower);

      if (hasPrimaryValue || hasRedeemedTag) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: 'Already checked in' }),
        };
      }
    }
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Failed to verify contact status' }),
    };
  }

  const actionValue = resolveActionValue(body.value);

  const existingTags = (existingContact && existingContact.tags) || [];
  const redemptionTagLower = String(REDEMPTION_TAG).toLowerCase();
  const tagsWithoutRedemption = existingTags.filter(
    (t) => String(t).toLowerCase() !== redemptionTagLower,
  );
  const nextTags = Array.from(new Set([...tagsWithoutRedemption, REDEEMED_TAG]));

  const payload = JSON.stringify({
    customFields: [
      { id: PRIMARY_ACTION_FIELD_ID, value: actionValue },
    ],
    tags: nextTags,
  });

  return new Promise((resolve) => {
    const options = {
      method: 'PUT',
      hostname: 'services.leadconnectorhq.com',
      path: `/contacts/${contactId}`,
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Version': '2021-07-28',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ success: true, message: 'Check-in recorded' }),
          });
        } else {
          try {
            const err = JSON.parse(data);
            resolve({
              statusCode: res.statusCode,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
              body: JSON.stringify({ error: err.message || err.error || data }),
            });
          } catch {
            resolve({
              statusCode: res.statusCode,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
              body: JSON.stringify({ error: data || 'Failed to update contact' }),
            });
          }
        }
      });
    });

    req.on('error', (e) => {
      resolve({
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: e.message }),
      });
    });

    req.write(payload);
    req.end();
  });
};
