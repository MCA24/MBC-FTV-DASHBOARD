#!/usr/bin/env node
/**
 * Lists custom fields for your GHL location.
 * Run: node list-custom-fields.js
 * Use this to find the ID for GHL_CHECKIN_FIELD_ID
 */
const fs = require('fs');
const https = require('https');

try {
  fs.readFileSync('.env', 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  });
} catch (e) {}

const API_KEY = process.env.GHL_API_KEY;
const LOCATION_ID = process.env.GHL_LOCATION_ID;

if (!API_KEY || !LOCATION_ID) {
  console.error('Missing GHL_API_KEY or GHL_LOCATION_ID in .env');
  process.exit(1);
}

const url = `https://services.leadconnectorhq.com/locations/${LOCATION_ID}/customFields`;
const options = {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Version': '2021-07-28',
    'Accept': 'application/json',
  },
};

console.log('Fetching custom fields...\n');

const req = https.request(url, options, (res) => {
  let data = '';
  res.on('data', (chunk) => (data += chunk));
  res.on('end', () => {
    if (res.statusCode !== 200) {
      console.log('Status:', res.statusCode);
      console.log(data);
      return;
    }
    try {
      const json = JSON.parse(data);
      const fields = json.customFields || json.fields || [];
      if (fields.length === 0) {
        console.log('No custom fields found. Create one in GHL: Settings → Custom Fields');
        return;
      }
      console.log('Custom fields:\n');
      fields.forEach((f) => {
        console.log(`  ${f.name || f.key || 'Unnamed'}`);
        console.log(`    ID: ${f.id}`);
        console.log(`    Key: ${f.key || '—'}`);
        console.log('');
      });
      console.log('Add the ID to .env as GHL_CHECKIN_FIELD_ID');
    } catch (e) {
      console.log(data);
    }
  });
});

req.on('error', (e) => console.error('Error:', e.message));
req.end();
