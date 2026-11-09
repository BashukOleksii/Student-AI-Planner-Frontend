#!/usr/bin/env bash
# Sent to the frontend server by CI; never invokes the backend or privileged commands.
set -Eeuo pipefail
umask 022
export GIT_TERMINAL_PROMPT=0

fail() { printf 'Deployment failed: %s\n' "$1" >&2; exit 1; }
[[ $# == 3 ]] || fail 'Usage: lightsail.sh FRONTEND_DIR COMMIT_SHA HTTPS_ORIGIN'
frontend_dir=$1
sha=$2
origin=${3%/}
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || fail 'Expected a full commit SHA'
[[ "$origin" =~ ^https://[a-zA-Z0-9][a-zA-Z0-9.-]*(:[0-9]{1,5})?$ ]] || fail 'Expected an HTTPS origin'
cd -- "$frontend_dir"
frontend_dir=$(pwd -P)
[[ $(git rev-parse --show-toplevel) == "$frontend_dir" ]] || fail 'Expected the frontend repository root'
[[ $(git branch --show-current) == main ]] || fail 'Server checkout must be on main'
[[ -z $(git status --porcelain --untracked-files=all) ]] || fail 'Server has local changes; resolve them manually'
git check-ignore -q .deploy/probe || fail 'Ignore .deploy/ before provisioning release storage'
[[ -r .env.production && -f .env.production ]] || fail 'The existing .env.production must be readable'
if git ls-files --error-unmatch .env.production > /dev/null 2>&1; then
  fail '.env.production must not be tracked'
fi
for command in node npm curl flock tar; do command -v "$command" > /dev/null || fail "Missing $command"; done
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major === 24 && minor >= 12 ? 0 : 1)' || fail 'Install Node 24.12+ in the noninteractive SSH PATH'

mkdir -p .deploy/releases
exec 9>.deploy/deploy.lock
flock -n 9 || fail 'Another deployment or rollback holds the server lock'
[[ -L dist && -f dist/index.html ]] || fail 'Provision dist as a symlink to a retained release first; see the deployment guide'
previous=$(readlink -f dist)
[[ "$previous" == "$frontend_dir/.deploy/releases/"* ]] || fail 'dist must point inside .deploy/releases/'

build_dir=''
candidate=''
switched=0
completed=0
cleanup() {
  local result=$?
  trap - EXIT HUP INT TERM
  if (( switched && ! completed )); then
    # Use a fresh name on the same filesystem, then rename over the live symlink.
    rm -f -- .deploy/restore-link
    if ln -s -- "$previous" .deploy/restore-link && mv -Tf -- .deploy/restore-link dist; then
      printf 'DEPLOYMENT_RESULT=failed_rolled_back PREVIOUS_RELEASE=%s\n' "${previous##*/}" >&2
    else
      printf 'DEPLOYMENT_RESULT=rollback_failed MANUAL_RECOVERY_REQUIRED\n' >&2
    fi
  elif (( ! completed )); then
    printf 'DEPLOYMENT_RESULT=failed_before_activation (live dist unchanged)\n' >&2
  fi
  [[ -z "$build_dir" ]] || rm -rf -- "$build_dir"
  rm -f -- .deploy/candidate-link .deploy/previous-link
  exit "$result"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

# Do not pull a moving branch, reset, clean, stash, or overwrite a divergent checkout.
if ! git fetch --quiet --no-tags origin refs/heads/main:refs/remotes/origin/main > /dev/null 2>&1; then
  fail 'Cannot fetch origin/main; inspect server Git authentication and host trust privately'
fi
[[ $(git rev-parse refs/remotes/origin/main) == "$sha" ]] || fail 'This CI commit is no longer the latest main; wait for CI on the newer push'
git merge-base --is-ancestor HEAD "$sha" || fail 'Server main diverged or is ahead; resolve manually'
git merge --ff-only --no-edit --no-autostash "$sha"
[[ $(git rev-parse HEAD) == "$sha" ]] || fail 'Server checkout does not match the tested commit'

build_dir=$(mktemp -d "$frontend_dir/.deploy/build.XXXXXXXX")
git archive "$sha" | tar -x -C "$build_dir"
# Link only the authoritative production file; do not copy it or alter its mode.
[[ ! -e "$build_dir/.env.production" ]] || fail 'Production environment must remain server-only'
ln -s -- "$frontend_dir/.env.production" "$build_dir/.env.production"
(
  cd -- "$build_dir"
  # Dev dependencies provide TypeScript and Vite even if the login environment omits them.
  npm ci --include=dev --no-audit --no-fund < /dev/null
  npm run type-check < /dev/null
  npm run build-only -- --mode production < /dev/null
)
[[ -s "$build_dir/dist/index.html" ]] || fail 'Build produced no index.html'
printf '%s\n' "$sha" > "$build_dir/dist/deployed-sha.txt"

candidate="$frontend_dir/.deploy/releases/$sha-$(date -u +%Y%m%dT%H%M%SZ)-${build_dir##*.}"
mv -- "$build_dir/dist" "$candidate"
# mktemp creates private build storage. Only the public dist tree is published.
# Vite's output uses umask 022; release directories must be traversable by Nginx.
chmod 755 "$candidate"

fetch_file() {
  local url=$1 output=$2 status
  status=$(curl --silent --show-error --fail --proto '=https' --tlsv1.2 \
    --connect-timeout 10 --max-time 30 --retry 2 --retry-delay 2 \
    -H 'Cache-Control: no-cache' --output "$output" --write-out '%{http_code}' "$url") || return 1
  [[ "$status" == 200 ]]
}
smoke() {
  local route asset
  fetch_file "$origin/deployed-sha.txt?deployment=$sha" "$build_dir/remote-sha" || return 1
  cmp -s "$candidate/deployed-sha.txt" "$build_dir/remote-sha" || return 1
  for route in / /tasks /planning /ai; do
    fetch_file "$origin$route?deployment=$sha" "$build_dir/remote-index" || return 1
    cmp -s "$candidate/index.html" "$build_dir/remote-index" || return 1
  done
  node --input-type=module - "$candidate/index.html" > "$build_dir/assets" <<'NODE'
import { readFileSync } from 'node:fs'
const html = readFileSync(process.argv[2], 'utf8')
const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+\.(?:js|css))"/g)].map(match => match[1])
if (!assets.some(asset => asset.endsWith('.js'))) process.exit(1)
console.log([...new Set(assets)].join('\n'))
NODE
  [[ -s "$build_dir/assets" ]] || return 1
  while IFS= read -r asset; do
    [[ "$asset" =~ ^/assets/[a-zA-Z0-9_./-]+\.(js|css)$ && "$asset" != *..* ]] || return 1
    fetch_file "$origin$asset?deployment=$sha" "$build_dir/remote-asset" || return 1
    cmp -s "$candidate$asset" "$build_dir/remote-asset" || return 1
  done < "$build_dir/assets"
}

ln -s -- "$candidate" .deploy/candidate-link
# Set the rollback flag before switching so a caught signal also restores the old release.
switched=1
mv -Tf -- .deploy/candidate-link dist
smoke || fail 'HTTPS release, SPA route, or entry asset verification failed'
ln -s -- "$previous" .deploy/previous-link
mv -Tf -- .deploy/previous-link .deploy/previous
completed=1
printf 'DEPLOYMENT_RESULT=success DEPLOYED_COMMIT=%s PREVIOUS_RELEASE=%s\n' "$sha" "${previous##*/}"
