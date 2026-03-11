const fs = require('fs');

function loadEnv() {
  try {
    // .env path is relative to cwd (project root when run via netlify dev)
    fs.readFileSync('.env', 'utf8').split('\n').forEach((line) => {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim();
    });
  } catch (e) {}
}

// Load .env once at cold start (e.g. when Netlify Dev hasn't injected it)
loadEnv();

exports.handler = async (event) => {
  // Re-load .env on each request in development so REDEMPTION_TITLE / REDEMPTION_WINDOW_DAYS
  // changes appear after editing .env without restarting the dev server.
  if (process.env.NETLIFY_DEV === 'true') {
    loadEnv();
  }

  const title = process.env.REDEMPTION_TITLE || 'Redemption Dashboard';
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

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const windowDays = process.env.REDEMPTION_WINDOW_DAYS;
  let redemptionWindowDays = 14;
  if (windowDays != null && windowDays !== '') {
    const parsed = parseInt(String(windowDays), 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      redemptionWindowDays = parsed;
    }
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify({
      title,
      redemptionWindowDays,
    }),
  };
};

