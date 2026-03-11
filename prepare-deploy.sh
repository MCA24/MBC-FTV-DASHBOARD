#!/bin/bash
# Creates a deploy-ready folder without .env (for drag-and-drop to Netlify)
# Run: ./prepare-deploy.sh
# Then drag the 'deploy' folder to Netlify

set -e
DEPLOY_DIR="deploy"
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"
cp -r index.html netlify.toml netlify README.md .netlifyignore "$DEPLOY_DIR"
cp .env.example "$DEPLOY_DIR/.env.example" 2>/dev/null || true
echo "Created $DEPLOY_DIR/ — drag this folder to Netlify"
echo "Add your env vars in Netlify: GHL_API_KEY, GHL_LOCATION_ID, GHL_CHECKIN_FIELD_ID"
