#!/usr/bin/env node
/**
 * Quick test script to verify GHL API connection.
 * Run: node test-connection.js
 * Requires .env with GHL_API_KEY and GHL_LOCATION_ID
 */
const fs = require('fs');
const https = require('https');

// Load .env
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

const url = `https://services.leadconnectorhq.com/contacts/?locationId=${LOCATION_ID}&limit=100`;
const options = {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Version': '2021-07-28',
    'Accept': 'application/json',
  },
};

console.log('Fetching contacts from GHL API...\n');

const req = https.request(url, options, (res) => {
  let data = '';
  res.on('data', (chunk) => (data += chunk));
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    if (res.statusCode !== 200) {
      console.log('Response:', data.slice(0, 800));
      return;
    }
    try {
      const json = JSON.parse(data);
      const contacts = json.contacts || [];
      console.log('Contacts returned:', contacts.length);

      console.log('\nSample contacts preview (first 5):');
      contacts.slice(0, 5).forEach((c) => {
        const name = (c.contactName || c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim() || '').trim() || 'Unknown';
        console.log('  -', name);
        console.log('    ID:', c.id, '| Tags:', c.tags || []);
      });
    } catch (e) {
      console.log('Raw response:', data.slice(0, 500));
    }
  });
});

req.on('error', (e) => console.error('Error:', e.message));
req.end();
