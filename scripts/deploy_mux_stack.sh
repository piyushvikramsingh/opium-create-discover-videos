#!/usr/bin/env bash
set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-cjxhrnajkaqhwxccfflk}"
SECRETS_FILE="${SECRETS_FILE:-scripts/.mux.secrets.local}"

prompt_hidden() {
  local var_name="$1"
  local label="$2"
  local value=""
  echo "${label}"
  read -rs value
  echo
  printf -v "${var_name}" "%s" "${value}"
}

validate_supabase_pat() {
  local token="$1"
  [[ "$token" == sbp_* ]]
}

if ! command -v supabase >/dev/null 2>&1; then
  echo "supabase CLI not found. Install with: brew install supabase/tap/supabase"
  exit 1
fi

if [[ -f "${SECRETS_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${SECRETS_FILE}"
  set +a
fi

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  prompt_hidden SUPABASE_ACCESS_TOKEN "Enter SUPABASE_ACCESS_TOKEN (hidden input):"
fi

while ! validate_supabase_pat "${SUPABASE_ACCESS_TOKEN:-}"; do
  echo "Invalid token format. It must start with sbp_ (Supabase Personal Access Token)."
  prompt_hidden SUPABASE_ACCESS_TOKEN "Re-enter SUPABASE_ACCESS_TOKEN (hidden input):"
done

if [[ -z "${MUX_TOKEN_ID:-}" ]]; then
  echo "Enter MUX_TOKEN_ID:"
  read -r MUX_TOKEN_ID
fi

if [[ -z "${MUX_TOKEN_SECRET:-}" ]]; then
  prompt_hidden MUX_TOKEN_SECRET "Enter MUX_TOKEN_SECRET (hidden input):"
fi

if [[ -z "${MUX_WEBHOOK_SECRET:-}" ]]; then
  prompt_hidden MUX_WEBHOOK_SECRET "Enter MUX_WEBHOOK_SECRET (hidden input):"
fi

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" || -z "${MUX_TOKEN_ID:-}" || -z "${MUX_TOKEN_SECRET:-}" || -z "${MUX_WEBHOOK_SECRET:-}" ]]; then
  echo "Missing one or more required values. Aborting."
  exit 1
fi

export SUPABASE_ACCESS_TOKEN
export MUX_TOKEN_ID
export MUX_TOKEN_SECRET
export MUX_WEBHOOK_SECRET

echo "Linking project: ${PROJECT_REF}"
supabase link --project-ref "${PROJECT_REF}"

echo "Pushing migrations"
supabase db push

echo "Deploying edge functions"
supabase functions deploy create-mux-direct-upload
supabase functions deploy mux-webhook

echo "Setting function secrets"
supabase secrets set MUX_TOKEN_ID="${MUX_TOKEN_ID}" MUX_TOKEN_SECRET="${MUX_TOKEN_SECRET}" MUX_WEBHOOK_SECRET="${MUX_WEBHOOK_SECRET}"

echo "Done. Remember to set VITE_ENABLE_MUX_STREAMING=true in your frontend env."
