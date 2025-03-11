# Flaunt GitHub

[**Flaunt GitHub**](https://github.com/vib795/flaunt-github/) is a [Visual Studio Code extension](https://marketplace.visualstudio.com/items?itemName=UtkarshSingh.flaunt-github) that logs your coding activity by automatically capturing file save events and periodically committing a summary to a dedicated GitHub repository. It creates (or uses) a private repository named `code-tracking` and logs every save event with a timestamp—formatted in your local timezone (auto-detected by default, with an optional override). Flaunt your progress and let your code tell your story!

## Features

- **Automatic Repository Management**  
  On activation, the extension checks if a repository named `code-tracking` exists in your GitHub account. If not, it automatically creates the repository and clones it locally into the extension’s global storage path.

- **Activity Logging (Saves & Optional Opens)**  
  - **File Saves**: Each time you save a file (manually or via auto-save), the extension logs the event with a timestamp and filename.  
  - **File Opens**: Optionally, if `"codeTracking.trackFileOpens"` is set to `true`, the extension logs when files are opened.

- **Periodic GitHub Commits**  
  At regular intervals (defaulting to every 30 minutes), the extension appends the accumulated log to a file (`coding_summary.txt`), commits it to your local clone with a detailed, timezone-aware timestamp, and pushes the commit to GitHub. **You can customize the interval** (in minutes) via a user setting—changes are applied immediately without requiring a VS Code reload.

- **Status Bar Countdown**  
  A status bar item displays a live countdown to the next scheduled commit, updating every second so you always know how long until your progress is automatically saved.

- **Manual Commit Trigger**  
  You can manually trigger a commit via the Command Palette (the command is registered as **Start Code Tracking**) to capture your progress on demand.

- **Commit Message Prefix**  
  Optionally, define a prefix (via `"codeTracking.commitMessagePrefix"`) that is prepended to commit messages, making them easier to identify or group.

- **Milestone Notifications**  
  Every 10 commits, the extension celebrates your progress with an in-editor notification to keep you motivated.

- **Timezone-Aware Timestamps**  
  Commit messages and log entries are formatted according to your local timezone. The extension auto-detects your system’s timezone but allows you to override it via settings (e.g., `"America/New_York"`).

- **Automatic Conflict Resolution**  
  Before each commit, the extension fetches and merges remote changes using the “theirs” merge strategy, preventing manual merge conflicts when multiple machines commit to the same repository.

- **Output Channel Logging**  
  All extension activities (repository management, file saves/opens, commits, pushes, errors, etc.) are logged to an output channel named **FlauntGitHubLog**. The channel is automatically revealed upon activation.

## Requirements

- **GitHub Account & Authentication**  
  Sign in via VS Code's built-in GitHub authentication (OAuth) to securely provide your GitHub credentials. No need to manually enter a Personal Access Token or username.

- **Visual Studio Code**  
  Version 1.70.0 or later is required.

## Configuration

After installing the extension, configure your preferences in VS Code settings (via **File > Preferences > Settings** or by editing your `settings.json`):

```jsonc
{
  // GitHub authentication is now handled via browser-based OAuth.
  // You no longer need to set "codeTracking.githubToken" or "codeTracking.githubUsername".

  // Optional: Override the auto-detected timezone. If not set, the extension uses your system's timezone.
  "codeTracking.timeZone": "America/New_York",

  // Optional: Customize how often (in minutes) the extension commits your coding summary. Defaults to 30 if not set.
  "codeTracking.commitInterval": 15,

  // Optional: Define a prefix for commit messages (e.g., "[Flaunt]").
  "codeTracking.commitMessagePrefix": "[Flaunt]",

  // Optional: Track file open events. Set to true to log whenever a file is opened. Defaults to false.
  "codeTracking.trackFileOpens": true
}
```

- **`codeTracking.timeZone`**: A valid timezone string (e.g., `"America/New_York"`).  
- **`codeTracking.commitInterval`**: The commit interval in minutes. Defaults to 30. Changes update immediately.  
- **`codeTracking.commitMessagePrefix`**: A string to prepend to commit messages.  
- **`codeTracking.trackFileOpens`**: Set to `true` to log file open events; defaults to `false`.

## Usage

1. **Automatic Startup**  
   When you launch VS Code, the extension activates (via the `onStartupFinished` activation event) and displays the **FlauntGitHubLog** output channel along with a status bar countdown to the next commit.

2. **Activity Logging**  
   - **File Saves**: Each save (via auto-save or manual <kbd>Cmd+S</kbd>/<kbd>Ctrl+S</kbd>) is logged with a timestamp and filename.  
   - **File Opens (Optional)**: If enabled, file open events are similarly logged.

3. **Periodic Commits & Countdown**  
   The extension automatically commits your accumulated log entries at the configured interval. A live countdown in the status bar shows the time until the next commit. Commit messages include your optional prefix and a timestamp reflecting your local timezone.

4. **Manual Commit**  
   Trigger an immediate commit by opening the Command Palette (<kbd>Cmd+Shift+P</kbd> on macOS or <kbd>Ctrl+Shift+P</kbd> on Windows/Linux) and selecting **Start Code Tracking**.

5. **Conflict Resolution**  
   Before each commit, the extension fetches and merges remote changes using the “theirs” merge strategy, ensuring that commits push smoothly without manual merge conflicts.

6. **Milestone Notifications**  
   Every 10 commits, you receive a celebratory notification to acknowledge your coding progress.

7. **Viewing Logs**  
   Open the **Output** panel (via **View > Output**) and select **FlauntGitHubLog** to see detailed logs of all extension operations.

## Changelog

### 1.6.0
- **New Features:**
  - **Browser-Based Authentication**: Users now log in via VS Code’s GitHub authentication API—no more manual PAT configuration.
  - **File Open Logging (Optional)**: When `"codeTracking.trackFileOpens"` is enabled, logs file open events.
  - **Status Bar Countdown**: A live countdown timer shows the time remaining until the next commit.
  - **Dynamic Commit Interval**: The commit interval (via `"codeTracking.commitInterval"`) updates dynamically without requiring a VS Code reload.
  - **Commit Message Prefix**: Configurable via `"codeTracking.commitMessagePrefix"`, prepended to commit messages.
  - **Milestone Notifications**: In-editor notifications celebrate every 10 commits.
  - **Automatic Conflict Resolution**: Uses the “theirs” merge strategy to merge remote changes and avoid manual conflict resolution.
  - **Enhanced Logging**: Detailed timestamps and comprehensive logging in the output channel.

- **Improvements & Fixes:**
  - Better repository validation and local clone management.
  - Improved handling of dynamic settings changes.
  - Various bug fixes related to configuration reading and local storage.

## License

This project is licensed under the [LICENSE](LICENSE).

## Contributing

Contributions are welcome! If you have suggestions for improvements or encounter any issues, please contact the author at flauntgithub@gmail.com or submit a pull request or open an issue at [Flaunt GitHub](https://github.com/vib795/flaunt-github/).

---

# **Flaunt your progress. Flaunt GitHub!**
