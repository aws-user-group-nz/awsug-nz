#!/usr/bin/env bash
# Apply GitHub branch rulesets for staging and main.
# Review the JSON in .github/rulesets/ first. Starts as enforcement=disabled
# so you can enable in the GitHub UI (or pass --enforce) after checks exist.
set -euo pipefail

REPO="${REPO:-aws-user-group-nz/awsug-nz}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENFORCE=false

usage() {
  echo "Usage: $0 [--enforce] [--repo owner/name]"
  echo "  --enforce  set ruleset enforcement to active (default: leave disabled)"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --enforce) ENFORCE=true; shift ;;
    --repo) REPO="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown arg: $1" >&2; usage; exit 1 ;;
  esac
done

apply_ruleset() {
  local file="$1"
  local name
  name="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["name"])' "$file")"
  local body
  body="$(python3 -c '
import json, sys
path, enforce = sys.argv[1], sys.argv[2] == "true"
data = json.load(open(path))
if enforce:
    data["enforcement"] = "active"
print(json.dumps(data))
' "$file" "$ENFORCE")"

  local existing_id
  existing_id="$(gh api "repos/${REPO}/rulesets" --jq ".[] | select(.name==\"${name}\") | .id" || true)"

  if [[ -n "${existing_id}" ]]; then
    echo "Updating ruleset ${name} (${existing_id})"
    printf '%s' "${body}" | gh api --method PUT "repos/${REPO}/rulesets/${existing_id}" --input -
  else
    echo "Creating ruleset ${name}"
    printf '%s' "${body}" | gh api --method POST "repos/${REPO}/rulesets" --input -
  fi
}

apply_ruleset "${ROOT}/.github/rulesets/protect-staging.json"
apply_ruleset "${ROOT}/.github/rulesets/protect-main.json"

echo "Done. Repo: ${REPO}  enforce=${ENFORCE}"
echo "UI: https://github.com/${REPO}/settings/rules"
