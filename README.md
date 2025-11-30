# Flaunt GitHub v2.0.1

**Flaunt GitHub** is a Visual Studio Code / Cursor extension that logs your coding activity—file save events and edit “snapshots”—and periodically commits a rolling summary to a private GitHub repository on a schedule.

If you keep autosave on and never press <kbd>Ctrl+S</kbd>/<kbd>Cmd+S</kbd>, it still tracks your edits and creates summary commits.

---

## 🆕 What’s New in v2.0.x

### v2.0.1

- Commit/push behavior refined:
  - Only creates a commit when there are actual changes in the tracking repo.
  - Only pushes when a commit was created (no more “push” calls when nothing changed).
- Internal safety/cleanup:
  - Avoids unnecessary remote pushes when the repo is already up to date.
  - Minor logging and robustness improvements.

### v2.0.0

- **Edit-Based Auto Snapshots**  
  Detects which files you edited in a commit interval; if there were edits but no manual saves, it auto-saves and logs `Auto-snapshot <file>` entries.
- **Autosave-Friendly Tracking**  
  Designed to work with IDE autosave (e.g., “after 1 second”). Manual saves are no longer required to generate commits.
- **Enhanced Metrics**  
  Keeps tracking language usage and per-file session durations and exposes them via the **Show Code Tracking Metrics** command.

---

## 🚀 Features

### Automatic Repository Management

- On activation, the extension:
  - Ensures a private `code-tracking` repository exists in your GitHub account.
  - Clones it into the extension’s global storage directory.
  - Configures the remote using your **GitHub username + Personal Access Token (PAT)**.

### Activity Logging

- **Manual Saves**  
  Every explicit save (`Ctrl+S` / `Cmd+S`) of a `file://` document is logged as:

  ```text
  [timestamp]: Saved path/to/file.ts
  ```

and appended to `coding_summary.txt`.

* **Auto Snapshots (Edits Without Saves)**
  During each interval, the extension tracks which files were edited via `onDidChangeTextDocument`.
  If there were edits but no manual saves:

  * It logs lines like:

    ```text
    [timestamp]: Auto-snapshot src/extension.ts
    ```
  * Auto-saves all open files before committing, so what you see on GitHub matches the editor.

* **Optional File Opens**
  When `codeTracking.trackFileOpens` is enabled, the extension also logs file open events for real `file://` documents:

  ```text
  [timestamp]: Opened src/metricsService.ts
  ```

### Periodic GitHub Commits

On each interval:

1. Fetches and merges `origin/main` using `--strategy-option=theirs` to reduce conflicts across machines.
2. Appends accumulated summary lines to `coding_summary.txt` (if any).
3. Stages `coding_summary.txt`.
4. Checks whether there are any changes to commit in the tracking repo.
5. If there are changes:

   * Creates a commit with a timezone-aware message, e.g.:

     ```text
     [FlauntGithub] (+12/−3) Coding activity summary - 11/30/2025, 12:07:44 PM
     ```

   * Pushes to `origin/main`.

If there are **no changes at all** in the tracking repo for that interval:

* No commit is created.
* No push is attempted.

### Status Bar Countdown

* Shows a live countdown in the status bar, e.g.:

  ```text
  Next commit in 3m 12s
  ```

* Resets after each interval.

### Manual Commit Trigger

* Run **Start Code Tracking** from the Command Palette to:

  * Immediately generate a summary commit and push (if there has been any activity since the last commit).

### Commit Message Prefix

* Customize commit messages with `codeTracking.commitMessagePrefix`, for example:

  ```jsonc
  "codeTracking.commitMessagePrefix": "[FlauntGithub] "
  ```

### Automatic Conflict Resolution

* Before committing, the extension always:

  ```bash
  git fetch
  git merge origin/main --strategy-option=theirs
  ```

  to keep the tracking repo in sync across devices, favoring remote changes where conflicts occur.

### Milestone Notifications

* Every 10 summary commits, you get a small in-editor celebration notification.

### Metrics & Diff Badges

* Run **Show Code Tracking Metrics** to see in the **FlauntGitHubLog** channel:

  * Language-specific save counts.
  * Per-file session durations (seconds, formatted as `xh ym zs`).
  * Diff summary for the tracking repo (`coding_summary.txt`): added / removed lines.
  * Optional diff summary for your current workspace.

### Output Channel Logging

* All key events are logged to the **FlauntGitHubLog** output channel:

  * Repo creation / existence checks
  * Clone and remote setup
  * Saves, auto snapshots, opens
  * Commits and pushes
  * Errors and warnings

---

## 🔧 Requirements

* **VS Code / Cursor**: v1.106.0 or later (matching the extension’s `engines.vscode` range).
* **Git**: Installed and available on your system `PATH`.
* **GitHub Account**
* **GitHub Personal Access Token** with at least:

  * `repo` scope (to create & push to `code-tracking`).

---

## ⚙️ Configuration

Configure via **Settings** UI or directly in `settings.json`:

```jsonc
{
  // Required: GitHub username (e.g., "vib795")
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

> 🔐 **Security tip:** Avoid logging your PAT in any output. The extension should never log the full authenticated remote URL.

---

## 📖 Usage

1. **Install the Extension**

   * Install the `.vsix` in VS Code / Cursor.
   * Configure `codeTracking.githubUsername` and `codeTracking.githubToken`.

2. **Activation & Repo Setup**

   * When a workspace is opened:

     * The extension authenticates to GitHub using your PAT.
     * Ensures your private `code-tracking` repo exists (creates it if needed).
     * Clones or updates the local tracking repo and sets the authenticated remote.

3. **Just Code Normally**

   * With or without autosave:

     * Manual saves are logged as `Saved <file>`.
     * Edits without manual saves are tracked and turned into `Auto-snapshot <file>` entries at the next interval.

4. **Automatic Commits & Pushes**

   * At each interval:

     * If there has been any activity in the tracking repo:

       * A commit is created and pushed to `origin/main`.
     * If nothing changed:

       * No commit, no push, no noise.

5. **Manual Commit**

   * Run **Start Code Tracking** from the Command Palette to force an immediate summary commit & push (if anything has been logged since the last commit).

6. **View Metrics**

   * Run **Show Code Tracking Metrics** to inspect:

     * Language counts
     * Session durations
     * Diff summaries
   * All shown in the **FlauntGitHubLog** panel.

---

## 📝 Changelog

### v2.0.1

* Only commit when there are actual changes in the tracking repo.
* Only push when a commit was created (no-op intervals no longer call `push`).
* Minor internal cleanup and logging improvements.

### v2.0.0

* Added edit-based auto snapshots, so activity is captured even without manual saves.
* Autosave-friendly behavior: commits are generated periodically based on edits, not just save events.
* Expanded metrics via the **Show Code Tracking Metrics** command.

---

**Flaunt your progress. Flaunt GitHub!**