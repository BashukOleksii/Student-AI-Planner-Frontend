#!/usr/bin/env bash
# Runner only. Connection settings never become interpolated shell source.
set -Eeuo pipefail
umask 077

fail() { printf 'Deployment configuration error: %s\n' "$1" >&2; exit 1; }
for setting in SSH_HOST SSH_PORT SSH_USER SSH_PRIVATE_KEY SSH_KNOWN_HOSTS FRONTEND_DIR FRONTEND_URL DEPLOY_SHA; do
  [[ -n "${!setting:-}" ]] || fail "Missing $setting"
done
[[ "${SSH_HOST:-}" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]] || fail 'Invalid SSH host'
[[ "$SSH_USER" =~ ^[a-z_][a-z0-9_-]*$ ]] || fail 'Invalid SSH user'
[[ "$SSH_PORT" =~ ^[0-9]{1,5}$ ]] || fail 'Invalid SSH port'
(( 10#$SSH_PORT >= 1 && 10#$SSH_PORT <= 65535 )) || fail 'Invalid SSH port'
SSH_PORT=$((10#$SSH_PORT))
[[ "$FRONTEND_DIR" =~ ^/[a-zA-Z0-9/_-]+$ && "$FRONTEND_DIR" != / ]] || fail 'Invalid frontend directory'
[[ "$DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]] || fail 'Expected a full commit SHA'
FRONTEND_URL=${FRONTEND_URL%/}
[[ "$FRONTEND_URL" =~ ^https://[a-zA-Z0-9][a-zA-Z0-9.-]*(:[0-9]{1,5})?$ ]] || fail 'Expected an HTTPS origin'

ssh_dir=$(mktemp -d)
trap 'rm -rf -- "$ssh_dir"' EXIT
printf '%s\n' "$SSH_PRIVATE_KEY" > "$ssh_dir/key"
printf '%s\n' "$SSH_KNOWN_HOSTS" > "$ssh_dir/known_hosts"
unset SSH_PRIVATE_KEY SSH_KNOWN_HOSTS
# Files inherit 0600; the directory inherits 0700. Do not print either file.
ssh-keygen -y -P '' -f "$ssh_dir/key" > /dev/null 2>&1 || fail 'Invalid key; use a dedicated unencrypted automation key'
host_lookup=$SSH_HOST
if [[ "$SSH_PORT" != 22 ]]; then host_lookup="[$SSH_HOST]:$SSH_PORT"; fi
ssh-keygen -F "$host_lookup" -f "$ssh_dir/known_hosts" > /dev/null || fail 'No pinned host key for this host/port'

printf -v remote_command 'bash -se -- %q %q %q' "$FRONTEND_DIR" "$DEPLOY_SHA" "$FRONTEND_URL"
ssh -F /dev/null -T \
  -p "$SSH_PORT" -i "$ssh_dir/key" \
  -o BatchMode=yes -o IdentitiesOnly=yes -o IdentityAgent=none \
  -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$ssh_dir/known_hosts" \
  -o GlobalKnownHostsFile=/dev/null -o UpdateHostKeys=no \
  -o ForwardAgent=no -o ClearAllForwardings=yes \
  -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=4 \
  "$SSH_USER@$SSH_HOST" "$remote_command" < scripts/deploy/lightsail.sh
