# Flaunt GitHub

**Flaunt GitHub** is a VS Code / Cursor extension that quietly tracks your coding activity and commits a rolling journal to a **private** `code-tracking` repo in your GitHub account. Your contribution graph stays green, and you get a searchable history of what you actually worked on.

---

## What's new in v3.0

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

## License

MIT
