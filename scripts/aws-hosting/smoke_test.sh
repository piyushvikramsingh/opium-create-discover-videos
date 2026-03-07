#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${APP_URL:-}" ]]; then
  echo "Missing APP_URL. Example: APP_URL='https://your-domain.com' bash scripts/aws-hosting/smoke_test.sh"
  exit 1
fi

APP_URL="${APP_URL%/}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1"
    exit 1
  fi
}

check_status() {
  local path="$1"
  local expected="$2"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$APP_URL$path")
  if [[ "$code" != "$expected" ]]; then
    echo "FAIL: $path returned $code (expected $expected)"
    exit 1
  fi
  echo "OK: $path -> $code"
}

require_command curl
require_command grep
require_command sed

echo "Running smoke tests against: $APP_URL"

check_status "/" "200"
check_status "/discover" "200"
check_status "/inbox" "200"
check_status "/help" "200"

index_html=$(curl -fsSL "$APP_URL/")
if ! echo "$index_html" | grep -qi "<!doctype html>"; then
  echo "FAIL: Root response does not look like HTML document"
  exit 1
fi

echo "OK: Root response is HTML"

asset_path=$(echo "$index_html" | grep -Eo 'assets/[^" ]+\.js' | head -n 1 || true)
if [[ -z "$asset_path" ]]; then
  echo "FAIL: Could not find JS asset path in index HTML"
  exit 1
fi

asset_ct=$(curl -sI "$APP_URL/$asset_path" | tr -d '\r' | sed -n 's/^Content-Type: //p' | head -n1)
if [[ "$asset_ct" != application/javascript* && "$asset_ct" != text/javascript* ]]; then
  echo "FAIL: JS asset content-type is '$asset_ct'"
  exit 1
fi

echo "OK: JS asset content-type is $asset_ct"

echo "All smoke tests passed."
