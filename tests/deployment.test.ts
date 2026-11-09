import { afterEach, describe, expect, it } from 'vitest'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const script = resolve('scripts/deploy/lightsail.sh')
const temporaryDirectories: string[] = []
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function command(cwd: string, executable: string, args: string[]) {
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`${executable}: ${result.stderr}`)
  return result.stdout.trim()
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'frontend-deploy-test-'))
  temporaryDirectories.push(root)
  const source = join(root, 'source')
  const server = join(root, 'server')
  const bin = join(root, 'bin')
  mkdirSync(source)
  mkdirSync(bin)
  command(source, 'git', ['init', '-q', '-b', 'main'])
  command(source, 'git', ['config', 'user.name', 'Deployment test'])
  command(source, 'git', ['config', 'user.email', 'deploy@example.invalid'])
  writeFileSync(join(source, '.gitignore'), '.deploy/\ndist\n.env*\n')
  writeFileSync(join(source, 'version'), 'old')
  command(source, 'git', ['add', '.'])
  command(source, 'git', ['commit', '-qm', 'Initial fixture'])
  command(root, 'git', ['clone', '-q', '--no-hardlinks', source, server])
  const oldSha = command(server, 'git', ['rev-parse', 'HEAD'])
  writeFileSync(join(source, 'version'), 'new')
  command(source, 'git', ['commit', '-qam', 'Tested fixture'])
  const sha = command(source, 'git', ['rev-parse', 'HEAD'])
  const previous = join(server, '.deploy/releases/bootstrap')
  mkdirSync(previous, { recursive: true })
  writeFileSync(join(previous, 'index.html'), 'working original site')
  symlinkSync(previous, join(server, 'dist'))
  writeFileSync(
    join(server, '.env.production'),
    'VITE_API_BASE_URL=https://api.example.invalid\n',
    {
      mode: 0o600,
    },
  )
  const environment = statSync(join(server, '.env.production'))
  // Only package installation/building and HTTP are mocked. Git, locking, archive
  // extraction, permissions, atomic publication, and rollback run for real locally.
  writeFileSync(
    join(bin, 'npm'),
    `#!/usr/bin/env bash
set -eu
printf '%s\\n' "$*" >> "$TEST_LOG"
[[ "$*" != "\${FAIL_NPM:-}" ]] || exit 1
[[ -L .env.production && -r .env.production ]] || exit 1
if [[ "$*" == 'run build-only -- --mode production' ]]; then
  mkdir -p dist/assets
  printf '<html><script src="/assets/app-hash.js"></script><link href="/assets/app-hash.css"></html>' > dist/index.html
  printf 'console.log("new")' > dist/assets/app-hash.js
  printf 'body{}' > dist/assets/app-hash.css
fi
`,
    { mode: 0o755 },
  )
  writeFileSync(
    join(bin, 'node'),
    `#!/usr/bin/env bash
if [[ "$1" == -e && "$2" == *process.versions.node* ]]; then exit "\${FAIL_NODE:-0}"; fi
exec '${process.execPath.replaceAll("'", "'\\''")}' "$@"
`,
    { mode: 0o755 },
  )
  writeFileSync(
    join(bin, 'curl'),
    `#!/usr/bin/env bash
set -eu
printf '%s\\n' "$*" >> "$TEST_LOG"
[[ "\${SMOKE_ERROR:-}" != tls ]] || exit 60
while (( $# )); do
  case "$1" in
    --output) output=$2; shift 2 ;;
    https://*) url=$1; shift ;;
    *) shift ;;
  esac
done
path=\${url#https://frontend.example.invalid}
path=\${path%%\\?*}
case "$path" in /|/tasks|/planning|/ai) path=/index.html ;; esac
if [[ "\${SMOKE_ERROR:-}" == sha && "$path" == /deployed-sha.txt ]] ||
   [[ "\${SMOKE_ERROR:-}" == asset && "$path" == *.js ]] ||
   [[ "\${SMOKE_ERROR:-}" == route && "$url" == */planning\\?* ]]; then
  printf 'incorrect response' > "$output"
else
  cp "$TEST_SERVER/dist$path" "$output"
fi
printf 200
`,
    { mode: 0o755 },
  )
  const log = join(root, 'commands.log')
  const deploy = (extra: NodeJS.ProcessEnv = {}) =>
    spawnSync('bash', [script, server, sha, 'https://frontend.example.invalid'], {
      encoding: 'utf8',
      timeout: 20_000,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        TEST_SERVER: server,
        TEST_LOG: log,
        ...extra,
      },
    })
  return { root, source, server, previous, sha, oldSha, environment, log, deploy }
}

describe('Lightsail deployment safety (local fixtures only)', () => {
  it('publishes exactly the tested main commit and verifies HTTPS content and assets', () => {
    const f = fixture()
    const result = f.deploy()
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain(`DEPLOYED_COMMIT=${f.sha}`)
    expect(command(f.server, 'git', ['rev-parse', 'HEAD'])).toBe(f.sha)
    expect(readlinkSync(join(f.server, 'dist'))).not.toBe(f.previous)
    expect(readlinkSync(join(f.server, '.deploy/previous'))).toBe(f.previous)
    expect(readFileSync(join(f.server, 'dist/deployed-sha.txt'), 'utf8')).toBe(`${f.sha}\n`)
    expect(readFileSync(join(f.previous, 'index.html'), 'utf8')).toBe('working original site')
    const environment = statSync(join(f.server, '.env.production'))
    expect(environment.ino).toBe(f.environment.ino)
    expect(environment.mode & 0o777).toBe(0o600)
    expect(existsSync(join(f.server, 'dist/.env.production'))).toBe(false)
    expect(lstatSync(join(f.server, 'dist')).isSymbolicLink()).toBe(true)
    expect(statSync(join(f.server, 'dist/index.html')).mode & 0o777).toBe(0o644)
    const log = readFileSync(f.log, 'utf8')
    expect(log).toContain('ci --include=dev')
    expect(log).toContain('run type-check')
    expect(log).toContain('run build-only -- --mode production')
    expect(log).toContain('--proto =https')
    expect(log).toContain('/planning?deployment=')
    expect(log).toContain('/assets/app-hash.js?deployment=')
    expect(log).toContain('/assets/app-hash.css?deployment=')
    expect(log).not.toContain('--insecure')
  })

  it.each([
    'ci --include=dev --no-audit --no-fund',
    'run type-check',
    'run build-only -- --mode production',
  ])('keeps the live release when %s fails', (step) => {
    const f = fixture()
    const result = f.deploy({ FAIL_NPM: step })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('failed_before_activation')
    expect(readlinkSync(join(f.server, 'dist'))).toBe(f.previous)
    expect(readFileSync(join(f.server, 'dist/index.html'), 'utf8')).toBe('working original site')
    expect(statSync(join(f.server, '.env.production')).mode & 0o777).toBe(0o600)
  })

  it.each(['tls', 'sha', 'asset', 'route'])(
    'restores the previous release after a %s smoke failure',
    (error) => {
      const f = fixture()
      const result = f.deploy({ SMOKE_ERROR: error })
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('failed_rolled_back')
      expect(readlinkSync(join(f.server, 'dist'))).toBe(f.previous)
      expect(readFileSync(join(f.server, 'dist/index.html'), 'utf8')).toBe('working original site')
    },
  )

  it.each(['version', 'untracked-file'])(
    'refuses local changes to %s without discarding them',
    (file) => {
      const f = fixture()
      writeFileSync(join(f.server, file), 'operator change')
      const result = f.deploy()
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('local changes')
      expect(command(f.server, 'git', ['rev-parse', 'HEAD'])).toBe(f.oldSha)
      expect(readFileSync(join(f.server, file), 'utf8')).toBe('operator change')
      expect(readlinkSync(join(f.server, 'dist'))).toBe(f.previous)
    },
  )

  it('refuses a superseded CI commit instead of deploying a newer untested commit', () => {
    const f = fixture()
    writeFileSync(join(f.source, 'version'), 'newer untested change')
    command(f.source, 'git', ['commit', '-qam', 'Newer push'])
    const result = f.deploy()
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('no longer the latest main')
    expect(command(f.server, 'git', ['rev-parse', 'HEAD'])).toBe(f.oldSha)
    expect(readlinkSync(join(f.server, 'dist'))).toBe(f.previous)
  })

  it('refuses a divergent server checkout', () => {
    const f = fixture()
    command(f.server, 'git', ['config', 'user.name', 'Operator'])
    command(f.server, 'git', ['config', 'user.email', 'operator@example.invalid'])
    writeFileSync(join(f.server, 'operator-file'), 'keep this commit')
    command(f.server, 'git', ['add', '.'])
    command(f.server, 'git', ['commit', '-qm', 'Server-only commit'])
    const serverSha = command(f.server, 'git', ['rev-parse', 'HEAD'])
    const result = f.deploy()
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('diverged or is ahead')
    expect(command(f.server, 'git', ['rev-parse', 'HEAD'])).toBe(serverSha)
  })

  it('refuses an unprepared real dist directory without moving or deleting it', () => {
    const f = fixture()
    rmSync(join(f.server, 'dist'))
    mkdirSync(join(f.server, 'dist'))
    writeFileSync(join(f.server, 'dist/index.html'), 'existing production build')
    expect(f.deploy().status).not.toBe(0)
    expect(readFileSync(join(f.server, 'dist/index.html'), 'utf8')).toBe(
      'existing production build',
    )
  })

  it('refuses concurrent deployments or manual rollbacks using the same lock', async () => {
    const f = fixture()
    const lock = spawn(
      'flock',
      [join(f.server, '.deploy/deploy.lock'), 'sh', '-c', 'echo ready; cat'],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )
    try {
      await new Promise<void>((done, reject) => {
        lock.once('error', reject)
        lock.stdout.once('data', () => done())
      })
      const result = f.deploy()
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('holds the server lock')
      expect(readlinkSync(join(f.server, 'dist'))).toBe(f.previous)
    } finally {
      lock.stdin.end()
      await new Promise<void>((done) => lock.once('exit', () => done()))
    }
  })
})

function sshFixture() {
  const root = mkdtempSync(join(tmpdir(), 'frontend-ssh-test-'))
  temporaryDirectories.push(root)
  const bin = join(root, 'bin')
  mkdirSync(bin)
  const key = join(root, 'test-key')
  command(root, 'ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', key])
  const publicKey = readFileSync(`${key}.pub`, 'utf8').trim()
  const privateKey = readFileSync(key, 'utf8')
  const log = join(root, 'ssh.log')
  writeFileSync(
    join(bin, 'ssh'),
    `#!/usr/bin/env bash
set -eu
printf '%s\\n' "$@" > "$TEST_SSH_LOG"
while (( $# )); do
  case "$1" in
    -i) key=$2; shift 2 ;;
    -o) [[ "$2" != UserKnownHostsFile=* ]] || known_hosts=\${2#*=}; shift 2 ;;
    *) shift ;;
  esac
done
printf 'KEY_MODE=%s\\nHOST_MODE=%s\\nDIR_MODE=%s\\nKEY_PATH=%s\\n' \\
  "$(stat -c %a "$key")" "$(stat -c %a "$known_hosts")" \\
  "$(stat -c %a "$(dirname "$key")")" "$key" >> "$TEST_SSH_LOG"
cat > /dev/null
`,
    { mode: 0o755 },
  )
  const run = (extra: NodeJS.ProcessEnv = {}) =>
    spawnSync('bash', ['scripts/deploy/ssh.sh'], {
      encoding: 'utf8',
      timeout: 10_000,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        TEST_SSH_LOG: log,
        SSH_HOST: 'frontend.example.invalid',
        SSH_PORT: '22',
        SSH_USER: 'ubuntu',
        SSH_PRIVATE_KEY: privateKey,
        SSH_KNOWN_HOSTS: `frontend.example.invalid ${publicKey}`,
        FRONTEND_DIR: '/srv/student-ai-planner/frontend',
        FRONTEND_URL: 'https://frontend.example.invalid',
        DEPLOY_SHA: 'a'.repeat(40),
        ...extra,
      },
    })
  return { run, log, privateKey, publicKey }
}

describe('SSH runner configuration (mock SSH, no network)', () => {
  it('pins the host key, protects temporary credentials, disables forwarding, and cleans up', () => {
    const f = sshFixture()
    const result = f.run()
    expect(result.status, result.stderr).toBe(0)
    const log = readFileSync(f.log, 'utf8')
    expect(log).toContain('StrictHostKeyChecking=yes')
    expect(log).toContain('GlobalKnownHostsFile=/dev/null')
    expect(log).toContain('UpdateHostKeys=no')
    expect(log).toContain('ForwardAgent=no')
    expect(log).toContain('IdentityAgent=none')
    expect(log).toContain('KEY_MODE=600\nHOST_MODE=600\nDIR_MODE=700')
    const keyPath = /KEY_PATH=(.+)/.exec(log)?.[1]
    expect(keyPath).toBeTruthy()
    expect(existsSync(keyPath!)).toBe(false)
    expect(result.stdout + result.stderr + log).not.toContain(f.privateKey.trim())
    expect(log).toContain(`bash -se -- /srv/student-ai-planner/frontend ${'a'.repeat(40)}`)
  })

  it('refuses an unpinned host before opening SSH', () => {
    const f = sshFixture()
    const result = f.run({ SSH_KNOWN_HOSTS: `other.example.invalid ${f.publicKey}` })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('No pinned host key')
    expect(existsSync(f.log)).toBe(false)
  })

  it('requires the bracketed known_hosts entry for a nondefault SSH port', () => {
    const f = sshFixture()
    const result = f.run({
      SSH_PORT: '2222',
      SSH_KNOWN_HOSTS: `[frontend.example.invalid]:2222 ${f.publicKey}`,
    })
    expect(result.status, result.stderr).toBe(0)
  })

  it.each([
    { SSH_PRIVATE_KEY: '' },
    { SSH_PRIVATE_KEY: 'invalid key' },
    { SSH_HOST: 'host;false' },
    { SSH_PORT: '0' },
    { FRONTEND_DIR: '/srv/frontend;false' },
    { FRONTEND_URL: 'http://frontend.example.invalid' },
    { DEPLOY_SHA: 'main' },
  ])('rejects missing or invalid connection settings (%j)', (settings) => {
    const f = sshFixture()
    expect(f.run(settings).status).not.toBe(0)
    expect(existsSync(f.log)).toBe(false)
  })
})
