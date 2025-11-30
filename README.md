# Flaunt GitHub v1.7.2

**Flaunt GitHub** is a Visual Studio Code extension that logs your coding activity—file save events (and optional file opens, including Git‑provider previews)—and periodically commits a rolling summary to a private GitHub repository on a schedule.

---

## 🆕 What’s New in v1.7.2

* **`.git` URI Tracking**
  Captures saves and opens for files viewed through VS Code’s Git provider (e.g. `package.json.git`), so every preview or diff counts.
* **Browser‑Based Authentication**
  Fully relies on VS Code’s GitHub OAuth flow—no Personal Access Token required.

---

## 🚀 Features

### Automatic Repository Management

* On activation, checks for (or creates) a private `code-tracking` repo in your GitHub account and clones it locally.

### Activity Logging

* **File Saves:** Logs each save event with a timestamp and workspace‑relative path—including `.git`‑based previews.
* **Optional File Opens:** When `codeTracking.trackFileOpens` is enabled, logs file open events for real files.

### Periodic GitHub Commits

* Appends accumulated logs to `coding_summary.txt`, commits with a timezone‑aware message, and pushes automatically at the configured interval.
* **Configurable Interval:** Adjust `codeTracking.commitInterval` (in minutes); changes take effect immediately.

### Status Bar Countdown

* Shows a live timer to your next scheduled commit.

### Manual Commit Trigger

* Run **Start Code Tracking** from the Command Palette to push your summary instantly.

### Commit Message Prefix

* Optionally prepend a custom prefix via `codeTracking.commitMessagePrefix` to group or identify commits.

### Automatic Conflict Resolution

* Before each push, merges remote changes using `--strategy-option=theirs` to avoid manual merge conflicts across machines.

### Milestone Notifications

* Celebrates every 10 commits with an in‑editor notification to keep you motivated.

### Metrics & Diff Badges

* Run **Show Code Tracking Metrics** to see:

  * Language‑specific save counts.
  * Session durations per file (real files only).
  * Uncommitted diff stats for both the tracking repo and your workspace.

### Output Channel Logging

* All operations—repo creation, saves/opens, commits, pushes, errors—are logged in the **FlauntGitHubLog** panel, which opens automatically.

---

## 🔧 Requirements

* **VS Code** v1.105.1 or later
* **Git** installed and in your system PATH
* **GitHub Account** (authenticated via VS Code’s built‑in GitHub OAuth)

---

## ⚙️ Configuration

Add or adjust these settings in your `settings.json` (user or workspace):

```jsonc
{
  // Interval in minutes between automatic commits (default: 30)
  "codeTracking.commitInterval": 30,

  // Optional: prefix for commit messages
  "codeTracking.commitMessagePrefix": "[Flaunt] ",

  // Optional: track file open events (default: false)
  "codeTracking.trackFileOpens": true
}
```

No GitHub token or username fields are needed—authentication is handled by VS Code.

---

## 📖 Usage

1. **Auto‑start:** On VS Code launch, the extension activates, sets up the repo, and begins logging.
2. **Save/Open Logging:** Tracks each save and (optionally) file open event, including `.git` previews.
3. **Automatic Commits:** Happens at your configured interval—watch the status bar countdown.
4. **Manual Commits:** Trigger **Start Code Tracking** via <kbd>Ctrl+Shift+P</kbd>.
5. **View Metrics:** Run **Show Code Tracking Metrics** to open a detailed report in the log panel.

---

## 📝 Changelog

### v1.7.2

* Package updates - VSCode and Cursor

---

**Flaunt your progress. Flaunt GitHub!**
