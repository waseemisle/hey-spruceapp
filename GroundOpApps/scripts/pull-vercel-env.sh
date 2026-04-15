#!/usr/bin/env bash
# Pull env from Vercel and sync the EXPO_PUBLIC_* subset into EAS secrets.
# Hardened allow-list — accidentally shipping a server secret (STRIPE_SECRET_KEY,
# MAILGUN_*, CRON_SECRET, SUPABASE_SERVICE_ROLE_KEY, CLOUDINARY_API_SECRET, SENDBLUE/TWILIO,
# FIREBASE_SYNC_*, etc.) is caught here.

set -euo pipefail

cd "$(dirname "$0")/../mobile"

ALLOW_LIST=(
  NEXT_PUBLIC_FIREBASE_API_KEY
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  NEXT_PUBLIC_FIREBASE_PROJECT_ID
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  NEXT_PUBLIC_FIREBASE_APP_ID
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
  NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET
  NEXT_PUBLIC_APP_URL
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
)

if ! command -v vercel >/dev/null; then echo "✗ install Vercel CLI: npm i -g vercel"; exit 1; fi
if ! command -v eas     >/dev/null; then echo "✗ install EAS CLI: npm i -g eas-cli"; exit 1; fi

echo "→ Pulling Vercel production env…"
vercel env pull .env.vercel.production --environment=production --yes

echo "→ Syncing allow-listed vars to EAS secrets…"
while IFS='=' read -r key value; do
  [[ -z "$key" || "$key" =~ ^# ]] && continue
  for allowed in "${ALLOW_LIST[@]}"; do
    if [[ "$key" == "$allowed" ]]; then
      NEW="${key/NEXT_PUBLIC_/EXPO_PUBLIC_}"
      value="${value%\"}"; value="${value#\"}"
      eas secret:create --scope project --name "$NEW" --value "$value" --type string --force >/dev/null
      echo "  ✓ $NEW"
      break
    fi
  done
done < .env.vercel.production

# Static values
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_FUNCTIONS_URL \
  --value "https://us-central1-groundopss.cloudfunctions.net" --type string --force >/dev/null
echo "  ✓ EXPO_PUBLIC_FIREBASE_FUNCTIONS_URL"

rm -f .env.vercel.production
echo "✓ done"
