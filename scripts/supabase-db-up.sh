#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

npx supabase start
npx supabase migration up --local

echo "Supabase local DB is up and migrations are applied."
