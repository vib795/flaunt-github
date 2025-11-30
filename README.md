# Flaunt GitHub v2.0.0

**Flaunt GitHub** is a Visual Studio Code / Cursor extension that logs your coding activity—file save events **and** edit “snapshots”—and periodically commits a rolling summary to a private GitHub repository on a schedule.

---

## 🆕 What’s New in v2.0.0

- **Edit-Based Auto Snapshots**  
  Even if you never hit <kbd>Ctrl+S</kbd>/<kbd>Cmd+S</kbd>, the extension tracks which files you edited during a commit interval, auto-saves them, and writes a summary entry.

- **Autosave-Friendly**  
  Works correctly with IDE autosave (e.g., “after 1 second”)—manual saves are no longer required to trigger commits.

- **Stronger Metrics**  
  Keeps tracking language usage and per-file session durations, and lets you view a quick metrics report via the **Show Code Tracking Metrics** command.

---

## 🚀 Features

### Automatic Repository Management

- On activation, the extension:
  - Ensures a private `code-tracking` repo exists in your GitHub account.
  - Clones it into the extension’s global storage directory.
  - Configures the remote using your **GitHub username + Personal Access Token**.

### Activity Logging

- **Manual Saves:**  
  Every explicit save (`Ctrl+S` / `Cmd+S`) is logged with:
  - Timestamp
  - Workspace-relative path  
  These entries are appended to `coding_summary.txt`.

- **Auto Snapshots (Edits Only):**  
  During each interval, the extension tracks which files were edited. If there were edits but no manual saves:
  - It logs lines like:  
    `"[timestamp]: Auto-snapshot src/extension.ts"`
  - Auto-saves all open files before committing.

- **Optional File Opens:**  
  When `codeTracking.trackFileOpens` is enabled, logs file open events for real `file://` documents:
  - `"[timestamp]: Opened src/metricsService.ts"`

### Periodic GitHub Commits

- At the configured interval, the extension:
  1. Fetches and merges `origin/main` using `--strategy-option=theirs` (to reduce conflicts across machines).
  2. Appends the accumulated summary lines to `coding_summary.txt`.
  3. Stages and commits with a timezone-aware message.
  4. Pushes to `origin/main`.

- **Configurable Interval:**  
  `codeTracking.commitInterval` (in minutes) controls how often this happens. Changes take effect immediately.

### Status Bar Countdown

- A status bar item shows a live countdown:  
  `Next commit in Xm Ys`  
  and resets after each interval.

### Manual Commit Trigger

- Run **Start Code Tracking** from the Command Palette to:
  - Immediately create a summary commit (if there is activity).
  - Push to `origin/main` on demand.

### Commit Message Prefix

- Customize commit messages via:
  - `codeTracking.commitMessagePrefix`  
  Example:  
  `"[FlauntGithub] (+12/−3) Coding activity summary - 11/30/2025, 12:07:44 PM"`

### Automatic Conflict Resolution

- Before each commit, the extension:
  - `git fetch`
  - `git merge origin/main --strategy-option=theirs`  
  so the tracking repo stays in sync even if used on multiple machines.

### Milestone Notifications

- Every 10 summary commits, you get a small celebration toast in the editor.

### Metrics & Diff Badges

- Run **Show Code Tracking Metrics** to see:

  - Language-specific save counts.
  - Per-file session durations.
  - Diff summary for the tracking repo (how much `coding_summary.txt` changed).
  - Optional diff summary for your current workspace.

- All displayed in the **FlauntGitHubLog** output channel.

### Output Channel Logging

- Everything is logged to **FlauntGitHubLog**:
  - Repo creation / clone
  - Auth / remote setup
  - Saves, auto snapshots, opens
  - Commits, pushes
  - Errors and warnings

---

## 🔧 Requirements

- **VS Code / Cursor**: v1.106.0 or later (matching the extension engine range)
- **Git**: installed and available on your PATH
- **GitHub Account**
- **GitHub Personal Access Token (PAT)** with at least:
  - `repo` scope (to create and push to `code-tracking`)

---

## ⚙️ Configuration

Configure via **Settings** UI or directly in `settings.json`:

```jsonc
{
  // Required: GitHub username (e.g. "vib795")
  "codeTracking.githubUsername": "your-github-username",

  // Required: GitHub PAT with "repo" scope
  "codeTracking.githubToken": "ghp_your_token_here",

  // Interval in minutes between automatic commits (default: 30)
  "codeTracking.commitInterval": 30,

  // Optional: prefix for commit messages
  "codeTracking.commitMessagePrefix": "[FlauntGithub] ",

  // Optional: timezone for timestamps in logs and commit messages
  // Defaults to your system timezone if omitted
  "codeTracking.timeZone": "America/Chicago",

  // Optional: track file open events (default: false)
  "codeTracking.trackFileOpens": false
}
```

> 💡 Authentication is handled via your **username + PAT**; no VS Code GitHub OAuth session is required.

---

## 📖 Usage

1. **Install the Extension**

   * Install the `.vsix` in VS Code / Cursor.
   * Configure `codeTracking.githubUsername` and `codeTracking.githubToken`.

2. **Activate / Auto-Start**

   * On IDE launch or when a workspace opens, the extension:

     * Verifies / creates the `code-tracking` repo.
     * Clones / updates the local tracking repo.
     * Starts the periodic commit timer.

3. **Just Code Normally**

   * With autosave enabled or disabled:

     * Manual saves are logged as `Saved ...`
     * Edits without saves are captured as `Auto-snapshot ...` at the next interval.

4. **Automatic Commits & Pushes**

   * At each interval:

     * Edits are auto-snapshotted (if needed).
     * Logs are appended to `coding_summary.txt`.
     * A summary commit is created and pushed.

5. **Manual Commit**

   * Run **Start Code Tracking** from the Command Palette to force an immediate commit/push (if there is any activity).

6. **View Metrics**

   * Run **Show Code Tracking Metrics** to see language counts, session durations, and diff summaries in **FlauntGitHubLog**.

---

## 📝 Changelog

### v2.0.0

* Added **edit-based auto snapshots** so commits and pushes happen even when you never manually save (works great with autosave).
* Added **auto-save before commit** whenever edits are detected but no manual save occurred in the interval.
* Improved **metrics reporting** via the **Show Code Tracking Metrics** command.
* Kept the private `code-tracking` repo model with automatic creation and push to `origin/main`.

---

**Flaunt your progress. Flaunt GitHub!**
