# Flaunt GitHub

[![CI](https://github.com/vib795/flaunt-github/actions/workflows/ci.yml/badge.svg)](https://github.com/vib795/flaunt-github/actions/workflows/ci.yml)

**Flaunt GitHub** is a VS Code / Cursor extension that quietly tracks your coding activity and commits a rolling journal to a **private** `code-tracking` repo in your GitHub account. Your contribution graph stays green, and you get a searchable history of what you actually worked on.

---

## What's new

### v3.0.11

- 🔒 **Security patch** — cleared five high-severity advisories across four build-toolchain packages: `linkify-it` quadratic-complexity DoS (via `markdown-it`), `brace-expansion` exponential-time expansion DoS (via `minimatch`), `js-yaml` merge-key quadratic CPU (the advisory range widened to `<4.3.0`, so the previous `>=4.2.0` pin was still exposed), and two `fast-uri` host-confusion advisories. All pinned via npm `overrides` with explicit major-version ceilings so a transitive dep can't silently jump a major. `@typescript-eslint` updated to 8.65. `npm audit` reports 0 vulnerabilities for both the full and production trees; the shipped runtime (`simple-git`, `@octokit/rest`) is unchanged.

### v3.0.10

- 🧹 **Dependency maintenance** — routine dev-toolchain refresh: `@types/node` 26.1, `@typescript-eslint` 8.64, `eslint` 10.7, and the `actions/setup-node` CI action to v7. `npm audit` reports 0 vulnerabilities for both the full and production trees. All changes are dev/CI tooling — the shipped runtime (`simple-git`, `@octokit/rest`) is unchanged.

### v3.0.9

- 🧹 **Dependency maintenance** — routine dev-toolchain refresh: `@types/node` 26.x, `@typescript-eslint` 8.62, `@vscode/test-cli` 0.0.15, and the `actions/checkout` CI action to v7. `npm audit` reports 0 vulnerabilities for both the full and production trees. All changes are dev/CI tooling — the shipped runtime (`simple-git`, `@octokit/rest`) is unchanged.

### v3.0.8

- 🔒 **Security patch** — cleared seven newly-disclosed `undici` advisories (two high: TLS validation bypass in the SOCKS5 ProxyAgent and shared-cache cross-user disclosure, plus five moderate/low) reaching the build toolchain transitively through `@vscode/vsce → cheerio`. Pinned to `undici >=7.28.0 <8` via npm `overrides`, staying on the v7 line `cheerio` expects. `npm audit` reports 0 vulnerabilities for both the full and production trees; the shipped runtime is unchanged.

### v3.0.7

- 🔒 **Security patch** — cleared three newly-disclosed advisories in the build toolchain: `markdown-it` quadratic-complexity DoS (advisory #51), `form-data` CRLF injection (high), and `js-yaml` merge-key DoS, all pinned via npm `overrides`. `@typescript-eslint` updated to 8.61.1. `npm audit` reports 0 vulnerabilities for both the full and production trees; the shipped runtime is unchanged.

### v3.0.6

- 📝 **Marketplace listing refresh** — this "What's new" section now tracks every release (the v3.0.3–v3.0.5 entries below were previously missing from the Marketplace overview).

### v3.0.5

- 🔒 **Zero known vulnerabilities** — cleared every open security advisory. `serialize-javascript` (RCE + CPU DoS), `diff` (jsdiff DoS), and `brace-expansion` (DoS) are pinned via npm `overrides`; `esbuild` bumped to 0.28.1. `npm audit` reports 0 vulnerabilities for both the full and production trees.
- ⬆️ **Toolchain refresh** — `@types/node`, `eslint` + `typescript-eslint`, and `@vscode/test-electron` 3.x updated. All changes are dev/build tooling — the shipped runtime (`simple-git`, `@octokit/rest`) is unchanged.

### v3.0.4

- 🤖 **Reliable release automation** — tagging a version bump now consistently triggers the Release workflow (explicit `workflow_dispatch`), and the dispatch path resolves the tag correctly instead of mistaking the branch name for the tag.

### v3.0.3

- ⬆️ **`simple-git` 3.36** — the one runtime dependency change shipped to users (upstream bug fixes, no behavior change), bundled with accumulated dev-toolchain and security updates.

### v3.0.2

- 🕒 **Timezone-safe formatting** — empty / invalid `codeTracking.timeZone` values fall back to the system zone instead of crashing the commit tick.
- 📝 **Per-save log lines restored** — `Saved ...`, `Auto-snapshot ...`, and `Workspace diff snapshot ...` lines appear in the `FlauntGitHubLog` channel as activity happens, not just at commit time.

### v3.0.0 highlights

- 🧱 **Modular architecture** — auth, repo, interval, activity, status, commands are separate modules with unit tests.
- 🔐 **Tokens never persisted in `.git/config`** — credentials are injected per-operation via `http.extraheader`.
- 🗓 **Rotated journal files** — `journal/YYYY/MM.md` for global activity and `projects/<repo>/YYYY/MM.md` for per-project scoping (no more monolithic `coding_summary.txt`).
- 🧩 **Multi-root workspace support** — every folder is tracked independently.
- ⏸ **Pause / resume** from the status bar.
- 🛡 **Ignore globs** — sensible defaults (`**/.env*`, `**/secrets/**`, keys) plus user overrides.
- 🕵️ **Optional path redaction** — commit `<redacted:3>.ts` instead of real paths, still track language and counts.
- 💾 **Pending queue** — if a push fails, the interval's activity is persisted and retried next tick. No more lost entries.
- 🔒 **Single-instance file lock** — only one VS Code window drives commits per global storage.
- ✅ **First-run consent dialog** — previews an example commit before anything is pushed.
- 📊 **Webview dashboard** — languages, sessions, diff at a glance.
- 🏷 **Profile badge generator** — SVG committed to your tracking repo, ready to paste in your GitHub profile README.
- 🤖 **Opt-in AI daily summary** — 2-3 sentence journal entry produced by Anthropic (BYOK, Claude Haiku by default).
- 📤 **Export metrics** — JSON or CSV.

## How it works

### Activation
1. On startup, Flaunt acquires a file lock in the extension's global storage directory. Other windows become read-only.
2. First-run consent dialog shows a sample commit line. Decline → tracking never starts.
3. Credentials resolve in this order:
   1. Cached in Secret Storage.
   2. `codeTracking.githubToken` + `codeTracking.githubUsername` from settings (fallback; cached after first use).
   3. `vscode.authentication.getSession('github', ['read:user','repo'])`.
4. The private `code-tracking` repo is created if missing, cloned into global storage, and `origin` is rewritten to a token-free URL.

### Tracking loop
At each interval (default 30 min):
1. **Manual saves** → `Saved <path>` entries.
2. **No manual save but dirty docs** → `Auto-snapshot <path>` entries, then `saveAll`.
3. **No dirty docs but workspace git diff** → `Workspace diff snapshot (+X/−Y)`.
4. Entries are written to per-project monthly markdown files inside the tracking repo.
5. `git fetch` → merge → commit → push via `-c http.extraheader=...`.
6. Commit message format:
   `[Flaunt] 2026-04-22, 11:07 · +128/−32 · flaunt-github · typescript · 7 saves`
7. On failure, entries persist to `pending.jsonl` and retry next tick.
8. `setTimeout` self-chaining prevents interval overlap.

### Commands (Command Palette → "Flaunt GitHub: …")

| Command | Description |
|---|---|
| Commit Now | Force an immediate commit |
| Open Dashboard | Open the webview dashboard |
| Show Metrics (log) | Text metrics dump to the output channel |
| Pause Tracking / Resume | Stop committing without uninstalling |
| Refresh GitHub Auth | Clear Secret Storage and re-authenticate |
| Reset Consent Prompt | Show the first-run dialog again |
| Open Tracking Repo | Jump to github.com in the browser |
| Generate Profile Badge | Write `badges/flaunt.svg` + copy markdown |
| Export Metrics | Save JSON/CSV |
| Show Log | Open the Flaunt output channel |

Click the status bar item for a quick-pick menu of all of these.

## Settings

```jsonc
{
  "codeTracking.commitInterval": 30,
  "codeTracking.commitMessagePrefix": "[Flaunt]",
  "codeTracking.timeZone": "",
  "codeTracking.trackFileOpens": false,
  "codeTracking.ignoreGlobs": [
    "**/.env", "**/.env.*", "**/secrets/**",
    "**/*.pem", "**/*.key", "**/id_rsa*",
    "**/credentials*", "**/.aws/**", "**/.ssh/**"
  ],
  "codeTracking.paused": false,
  "codeTracking.redactPaths": false,
  "codeTracking.aiSummary.enabled": false,
  "codeTracking.aiSummary.anthropicApiKey": "",
  "codeTracking.aiSummary.model": "claude-haiku-4-5"
}
```

### Fallback auth (optional)

```jsonc
{
  "codeTracking.githubToken": "ghp_...",
  "codeTracking.githubUsername": "your-username"
}
```

Prefer the built-in `Sign in with GitHub` flow. These settings exist only for headless / remote environments where VS Code's auth provider isn't available.

## Privacy

- The tracking repo is **private** by default when Flaunt creates it.
- File paths appear in commits unless `codeTracking.redactPaths` is enabled.
- `codeTracking.ignoreGlobs` filters out sensitive paths client-side before anything is logged.
- No data is sent anywhere except GitHub (your own private repo) and, if you opt in, the Anthropic API for daily summaries.

## Development

```bash
npm install
npm run typecheck
npm run lint
npm test           # runs mocha on pure-Node unit tests
npm run build      # esbuild bundle
npm run package    # vsce package
```

Unit tests live under `src/test/*.test.ts`. They compile to `out-test/` and run in plain Node (no Electron harness required).

## Releasing

Releases are automated through three workflows. The happy path is a single commit:

1. Bump `version` in `package.json` (semver).
2. Commit and push to `master`:
   ```bash
   git commit -am "Release v<version>"
   git push origin master
   ```
3. **`auto-tag.yml`** sees the new version, checks that no matching `v<version>` tag exists, creates the tag, and pushes it.
4. **`release.yml`** fires on the new `v*` tag and:
   - Verifies the tag matches `package.json` version.
   - Runs typecheck, lint, tests, build.
   - Packages `flaunt-github-<version>.vsix`.
   - Creates a GitHub Release with auto-generated notes and the `.vsix` asset attached.
   - Publishes to Open VSX if `OVSX_PAT` is set.
   - Leaves a Marketplace reminder in the workflow log — **VS Code Marketplace is published manually**:
     ```bash
     npx vsce publish --packagePath flaunt-github-<version>.vsix
     ```

You can also trigger `release.yml` manually from the Actions tab (`workflow_dispatch`) by supplying a tag.

### Tag conventions

- Final releases: `v3.0.2`, `v3.1.0`, …
- Pre-releases (tag contains a hyphen): `v3.1.0-beta.1` — marked as GitHub pre-release automatically.

### Required repo secrets

| Secret | Purpose | Required? |
|---|---|---|
| `OVSX_PAT` | `ovsx publish` (Open VSX Registry). | Optional — step is skipped if absent. |

No Marketplace secret is used by the workflow; that step is intentionally manual.

### Dependency maintenance

`.github/dependabot.yml` opens weekly PRs for:
- npm dependencies (grouped: `@types/*`, eslint + typescript-eslint, build tools).
- GitHub Actions versions (so `actions/checkout@v4` → `v5` lands as a PR rather than silent rot).

Merge those and CI re-verifies; no manual bumps needed.

## License

MIT
