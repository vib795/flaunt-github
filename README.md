# Flaunt GitHub

[**Flaunt GitHub**](https://github.com/vib795/flaunt-github/) is a [Visual Studio Code extension](https://marketplace.visualstudio.com/items?itemName=UtkarshSingh.flaunt-github) that logs your coding activity by automatically capturing file save events and periodically committing a summary to a dedicated GitHub repository. It creates (or uses) a private repository named `code-tracking` and logs every save event with a timestamp—formatted in your local timezone (auto-detected by default, with an optional override). Flaunt your progress and let your code tell your story!

## Features

- **Automatic Repository Management**  
  On activation, the extension checks if a repository named `code-tracking` exists in your GitHub account. If not, it automatically creates the repository and clones it locally into the extension’s global storage path.

- **Activity Logging (Saves & Optional Opens)**  
  - **File Saves**: Each time you save a file (manually or via auto-save), the extension logs the event with a timestamp and filename.  
  - **File Opens**: Optionally track file open events if `"codeTracking.trackFileOpens"` is set to `true`. This captures a timestamp and filename when a file is opened.

- **Periodic GitHub Commits**  
  At regular intervals (defaulting to every 30 minutes), the extension appends the accumulated log to a file (`coding_summary.txt`), commits it to your local clone with a detailed timestamp (including your timezone), and pushes the commit to GitHub. **You can customize the interval** (in minutes) via a user setting—any changes to this setting are applied immediately without needing a VS Code reload.

- **Countdown Timer in the Status Bar**  
  A status bar item displays a live countdown to the next scheduled commit, updating every second.

- **Manual Commit Trigger**  
  You can manually trigger a commit via the Command Palette (the command is registered as **Start Code Tracking**). This is useful if you want to capture your progress immediately.

- **Commit Message Prefix**  
  Optionally, define a prefix (via `"codeTracking.commitMessagePrefix"`) that will be prepended to your commit messages.

- **Milestone Notifications**  
  Every 10 commits, the extension celebrates your progress with an in-editor notification.

- **Timezone-Aware Timestamps**  
  Timestamps in commit messages and log entries are formatted based on your local timezone. The extension auto-detects your system’s timezone but allows you to override it via settings (e.g., `"America/New_York"`).

- **Automatic Conflict Resolution**  
  Before each commit, the extension fetches and merges remote changes using the “theirs” merge strategy, preventing manual merge conflicts when multiple machines commit to the same repository.

- **Output Channel Logging**  
  All extension activities (repository management, file saves/opens, commits, pushes, errors, etc.) are logged to an output channel named **FlauntGitHubLog**.

## Requirements

- **GitHub Account & Personal Access Token (PAT):**  
  You must have a GitHub account and a Personal Access Token with the appropriate scopes:  
  - For public repositories: `public_repo`  
  - For private repositories: `repo`

- **Visual Studio Code:**  
  Version 1.70.0 or later is required.

## Configuration

After installing the extension, configure your GitHub credentials and (optionally) your preferred timezone, commit interval, commit message prefix, and file open tracking in your VS Code settings. Open **File > Preferences > Settings** or edit your `settings.json` and add:

```jsonc
{
  "codeTracking.githubToken": "YOUR_GITHUB_PERSONAL_ACCESS_TOKEN",
  "codeTracking.githubUsername": "YOUR_GITHUB_USERNAME",

  // Optional: Override the auto-detected timezone. If not set,
  // the extension uses your system's timezone.
  "codeTracking.timeZone": "America/New_York",

  // Optional: Customize how often (in minutes) the extension commits your 
  // coding summary. Defaults to 30 if not set.
  "codeTracking.commitInterval": 15,

  // Optional: Define a prefix for commit messages (e.g., "[Flaunt]").
  "codeTracking.commitMessagePrefix": "[Flaunt]",

  // Optional: Track file open events. If true, logs whenever a file is opened.
  // Defaults to false.
  "codeTracking.trackFileOpens": true
}
```

- **`codeTracking.githubToken`**: Your GitHub PAT (with `public_repo` or `repo` scopes).  
- **`codeTracking.githubUsername`**: Your GitHub username.  
- **`codeTracking.timeZone`** *(optional)*: A valid timezone string (e.g., `"America/New_York"`). If omitted, the system's timezone is used.  
- **`codeTracking.commitInterval`** *(optional)*: The commit interval in minutes. Defaults to 30. Changes take effect immediately.  
- **`codeTracking.commitMessagePrefix`** *(optional)*: A prefix to add to commit messages.  
- **`codeTracking.trackFileOpens`** *(optional)*: Set to `true` to log file open events; defaults to `false`.

## Usage

1. **Automatic Startup:**  
   When you launch VS Code, the extension activates (via the `onStartupFinished` activation event) and logs a message to the **FlauntGitHubLog** output channel.

2. **Activity Logging:**  
   - **File Saves:** Every time you save a file (via auto-save or manually), an entry is logged with a timestamp and filename.  
   - **File Opens (Optional):** If enabled, file open events are logged similarly.

3. **Periodic Commits & Countdown:**  
   The extension automatically commits the accumulated log entries at the configured interval. A status bar countdown shows how long until the next commit. The commit message includes your optional prefix and a timezone-aware timestamp.

4. **Manual Commit:**  
   Trigger an immediate commit by opening the Command Palette (<kbd>Cmd+Shift+P</kbd> on macOS or <kbd>Ctrl+Shift+P</kbd> on Windows/Linux) and selecting **Start Code Tracking**.

5. **Conflict Resolution:**  
   Before each commit, the extension fetches and merges remote changes using the “theirs” merge strategy, ensuring conflict-free pushes.

6. **Milestone Notifications:**  
   Every 10 commits, you'll receive a celebratory notification in VS Code.

7. **Viewing Logs:**  
   Open the **Output** panel (via **View > Output**) and select **FlauntGitHubLog** to see detailed logs of all extension operations.

## Changelog

### 1.5.0
- **New Features:**
  - **File Open Logging (Optional):** When `"codeTracking.trackFileOpens"` is set to `true`, logs file open events.
  - **Status Bar Countdown:** Displays a live countdown until the next scheduled commit.
  - **Commit Message Prefix:** Configurable via `"codeTracking.commitMessagePrefix"`, prepended to commit messages.
  - **Milestone Notifications:** Notifies every 10 commits.
  - **Dynamic Commit Interval:** Updates commit interval in real time without requiring a VS Code reload.
  - **Automatic Conflict Resolution:** Uses the “theirs” merge strategy before committing to prevent manual merge conflicts.
  - **Enhanced Logging:** Detailed timestamps and comprehensive logging in the output channel.

- **Improvements & Fixes:**
  - Better repository validation and local clone management.
  - Improved dynamic settings handling for commit interval, commit message prefix, and file open tracking.
  - Various bug fixes related to configuration reading and local storage.

## License

This project is licensed under the [LICENSE](LICENSE).

## Contributing

Contributions are welcome! If you have suggestions for improvements or encounter any issues, please contact the author at flauntgithub@gmail.com or submit a pull request or open an issue at [Flaunt GitHub](https://github.com/vib795/flaunt-github/).

---

# **Flaunt your progress. Flaunt GitHub!**