# Flaunt GitHub

**Flaunt GitHub** is a Visual Studio Code / Cursor extension that quietly:

- Tracks your coding activity (saves, autosave snapshots, and workspace diffs)
- Writes human-readable summaries to `coding_summary.txt`
- Periodically commits and pushes those summaries to a private GitHub repository

If you keep autosave on and never press <kbd>Ctrl+S</kbd>/<kbd>Cmd+S</kbd>, it still captures your work and ships meaningful summary commits.

---

## 🔍 At a Glance

- 🧠 **Edit-aware & autosave-friendly** – works even if you never manually save
- 🔐 **Secure GitHub auth** – uses VS Code’s GitHub authentication and Secret Storage
- 📁 **Automatic repo management** – ensures a `code-tracking` repo exists and is kept in sync
- 🧾 **Rolling coding journal** – appends timestamped entries to `coding_summary.txt`
- 📊 **Built-in metrics** – language usage, session durations, and diff stats
- ✅ **Clean Git behavior** – only commits & pushes when there are real changes

---

## 🆕 What’s New in v2.1.2
**Version: 2.1.2**
Downgraded `vscode` to `^1.90.0` to make it compatible with a wider range of VS Code versions.

**Version: 2.1.1**

This release focuses on **reliability and completeness of tracking**, especially in tricky autosave and “modified but not dirty” scenarios:

- ✅ **Workspace diff fallback (smarter tracking):**
  - At the end of each interval, if:
    - No manual saves were seen, **and**
    - No dirty documents are present, **but**
    - The workspace Git diff (vs `HEAD`) shows changes,
  - The extension logs a synthetic entry:
    ```text
    [timestamp]: Workspace diff snapshot (+X/−Y)
    ```
  - This guarantees that intervals with real Git changes still yield a summary commit, even if our usual signals didn’t fire.

- 🔁 **Refined interval logic:**
  - Priority order per interval:
    1. Log **manual saves**.
    2. Log **auto-snapshots** for dirty docs and auto-save them.
    3. If still no activity, log **workspace diff snapshot** (when needed).
    4. Only then commit & push when there is something to record.

- 🧹 **No-op intervals are truly no-op:**
  - If the tracking repo has no changes for that interval:
    - No commit.
    - No push.
    - A log entry explains that nothing happened.

---

## 🧩 v2.x History (Context)

### v2.1.0

- Switched to **VS Code’s GitHub authentication** as the primary mechanism:
  - Uses `vscode.authentication.getSession('github', ['read:user', 'repo'], { createIfNone: true })`.
  - Token and username are stored securely in **Secret Storage**.
- **Backup auth path**:
  - If configured, `codeTracking.githubToken` and `codeTracking.githubUsername` in `settings.json` are used once and then cached in Secret Storage.

### v2.0.1

- Only creates commits when the tracking repo actually changed.
- Only pushes when a commit occurred (no more push calls on completely clean intervals).
- Minor logging and internal cleanups.

### v2.0.0

- Introduced **autosave-friendly tracking** and **edit-based auto snapshots**:
  - If there were edits but no manual saves, the extension auto-saves and logs:
    ```text
    [timestamp]: Auto-snapshot path/to/file.ts
    ```
- Extended **metrics** (language counts, session durations) via the **Show Code Tracking Metrics** command.

---

## ⚙️ How It Works

### 1. Repository Management

On activation (per VS Code / Cursor window with a workspace):

1. Resolves GitHub credentials (see “Authentication” below).
2. Ensures a private `code-tracking` repo exists in your GitHub account:
   - If missing, it creates it (`private`, `auto_init: true`).
3. Clones that repo into the extension’s global storage directory, e.g.:

  ```text
  <globalStorage>/utkarshsingh.flaunt-github/code-tracking
  ```

4. Configures the remote with an authenticated URL so it can push commits.

---

### 2. Authentication Strategy

Flaunt GitHub resolves credentials in this order:

1. **Secret Storage (preferred)**

   * If `codeTracking.githubToken` and `codeTracking.githubUsername` were previously stored in Secret Storage, those are used.

2. **Backup: Settings (`settings.json`)**

   * If `codeTracking.githubToken` and `codeTracking.githubUsername` are present:

     * They are used for the session.
     * They are then persisted into Secret Storage for future activations.

3. **VS Code GitHub Auth Provider (auto-login)**

   * If nothing is available, the extension calls:

     ```ts
     vscode.authentication.getSession('github', ['read:user', 'repo'], { createIfNone: true });
     ```
   * VS Code shows the standard “Sign in with GitHub” UI.
   * The returned access token and username are stored in Secret Storage.

> 💡 **Recommendation:**
> Let VS Code handle GitHub sign-in and Secret Storage. Only use `codeTracking.githubToken` as a fallback if you can’t use the built-in auth flow.

---

### 3. Activity Tracking Lifecycle

The extension builds up a text buffer (`codingSummary`) during each interval.

#### a) Manual Saves

For every `file://` document save (not triggered by the extension itself):

```text
[timestamp]: Saved relative/path/to/file.ts
```

* Recorded into `codingSummary`.
* Used to increment per-language save counts.

Autosave controlled by VS Code still triggers the same save events; the extension just ignores saves that it knows it initiated itself.

#### b) Auto Snapshots (Unsaved Edits)

At the end of each interval:

* If **no manual save** was detected:

  * The extension looks for **dirty documents** (`isDirty === true`) with `file://` URIs.
  * If found:

    * It logs one `Auto-snapshot ...` line per file:

      ```text
      [timestamp]: Auto-snapshot src/extension.ts
      ```
    * Calls `vscode.workspace.saveAll(false)` while marking that it’s in an auto-save cycle (to avoid double-logging the save events).
    * Tracks language usage for these docs as well.

#### c) Workspace Diff Fallback (v2.1.1)

If, after (a) and (b):

* `codingSummary` is still empty, **and**
* A Git diff exists between your workspace and `HEAD`:

Then the extension logs a snapshot based on `git diff --stat`/`diffSummary()` output:

```text
[timestamp]: Workspace diff snapshot (+X/−Y)
```

This ensures commits are created for real Git changes even if:

* The files weren’t open in the editor,
* No dirty docs were visible,
* Or some edge case bypassed file events.

---

### 4. Commit & Push Lifecycle

At the end of an interval:

1. **Skip no-op intervals**

   * If `codingSummary` is still empty:

     * Logs: `No coding summary recorded this interval; skipping commit/push.`
     * Returns early – no commit, no push.

2. **Fetch & Merge**

   * In the tracking repo:

     ```bash
     git fetch
     git merge origin/main --strategy-option=theirs
     ```
   * Keeps the repo in sync across multiple machines, favoring remote changes for conflicts.

3. **Write Summary & Stage**

   * Appends `codingSummary` to `coding_summary.txt`.
   * Stages it:

     ```bash
     git add coding_summary.txt
     ```

4. **Commit Only If Needed**

   * If the repo has no staged changes after this step:

     * Logs that there’s nothing to commit.
     * Skips the commit and push.

5. **Commit & Push (when there are changes)**

   * Creates a commit with a message like:

     ```text
     [FlauntGithub] (+12/−3) Coding activity summary - 11/30/2025, 12:07:44 PM
     ```
   * Pushes to `origin/main`.

6. **Milestones**

   * Every 10 commits, you get a small in-editor celebration message.

---

## 🧮 Metrics & Reporting

The command **“Show Code Tracking Metrics”** prints a report to the `FlauntGitHubLog` output channel, including:

* **Language Save Counts**
  Aggregate counts of saves (and snapshots) per `languageId`.

* **Session Durations**
  Per-file active session time, derived from `onDidOpenTextDocument` / `onDidCloseTextDocument`, formatted like `1h 12m 5s`.

* **Diff Summary (Tracking Repo)**
  Uncommitted `+added/−removed` lines for the tracking repo (`coding_summary.txt`).

* **Optional Workspace Diff**
  Overall added/removed lines for your current workspace repo (if applicable).

---

## ⏱ Status Bar

A status bar item shows a live countdown:

```text
Next commit in 4m 59s
```

This resets each interval and gives you a quick sense for when the next summary commit will happen.

---

## ⚙️ Configuration

Configure via the UI or in `settings.json`.

### Core Settings

```jsonc
{
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

### Backup Auth Settings (Optional)

Used only as a fallback if Secret Storage is empty and no GitHub auth session exists:

```jsonc
{
  // Optional: GitHub username (e.g., "vib795")
  "codeTracking.githubUsername": "your-github-username",

  // Optional: GitHub PAT with "repo" scope
  "codeTracking.githubToken": "ghp_your_token_here"
}
```

> 🔐 **Security tip:** Prefer VS Code’s GitHub sign-in flow + Secret Storage.
> Use PATs in settings only if necessary.

---

## 🧭 Usage

1. **Install the Extension**

   * Install the generated `.vsix` in VS Code / Cursor.

2. **Open a Workspace**

   * The extension activates only when a folder/workspace is open.

3. **Authenticate Once**

   * If needed, VS Code prompts you to sign in with GitHub.
   * On first run, the extension ensures your `code-tracking` repo exists and clones it.

4. **Code Normally**

   * With or without autosave enabled:

     * Manual saves produce `Saved ...` entries.
     * Unsaved edits can produce `Auto-snapshot ...` entries.
     * Workspace-level diff can produce `Workspace diff snapshot ...` entries.

5. **Let the Timer Do Its Thing**

   * Watch the status bar timer.
   * At each interval, a commit & push happens when there’s real tracked activity.

6. **Manual Commit (Optional)**

   * Run **Start Code Tracking** from the Command Palette to force an immediate summary commit & push (if any activity has been logged).

7. **Inspect Metrics**

   * Run **Show Code Tracking Metrics** to see language counts, sessions, and diffs in `FlauntGitHubLog`.

---

## 🔧 Requirements

* **VS Code / Cursor:** v1.106.0 or later (aligned with `engines.vscode`).
* **Git:** Installed and available on your system `PATH`.
* **GitHub Account:** With permission to create and push to a private repo.
* Network access to `github.com`.

---

## 📝 Changelog

### v2.1.1

* Added a **workspace diff fallback**:

  * If no saves and no dirty docs are observed, but Git diff shows changes, a `Workspace diff snapshot` entry is logged so the interval still produces a meaningful commit.
* Tightened commit/push behavior around these snapshots so every commit corresponds to actual repo changes.

### v2.1.0

* Switched to **VS Code GitHub auth** as the primary credential source.
* Added **Secret Storage** integration.
* Kept `codeTracking.githubToken` and `codeTracking.githubUsername` as optional backup paths.

### v2.0.1

* Ensured **no commit** and **no push** on completely clean intervals.
* Adjusted logging and internal logic for clarity.

### v2.0.0

* Introduced **autosave-friendly tracking** and **edit-based auto snapshots**.
* Exposed extended metrics via **Show Code Tracking Metrics**.

---

**Flaunt your progress. Flaunt GitHub.**
