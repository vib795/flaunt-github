# Flaunt GitHub

**Flaunt GitHub** is a Visual Studio Code extension that logs your coding activity by automatically capturing file save events and periodically committing a summary to a dedicated GitHub repository. It creates (or uses) a private repository named `code-tracking` and logs every save event with a timestamp—formatted in your local timezone (auto-detected by default, with an optional override). Flaunt your progress and let your code tell your story!


## Features

- **Automatic Repository Management:**  
  On activation, the extension checks if a repository named `code-tracking` exists in your GitHub account. If not, it automatically creates the repository and clones it locally into the extension’s global storage path.

- **Activity Logging:**  
  Every time you save a file (either manually or via auto-save), a timestamped log entry is added to an in‑memory summary. This log captures the filename and the exact time of the save.

- **Periodic GitHub Commits:**  
  At regular intervals (configurable, e.g. every 30 minutes in production or every minute for testing), the extension appends the accumulated log to a file (`coding_summary.txt`), commits it to your local clone with a detailed timestamp (showing your timezone), and pushes the commit to GitHub.

- **Manual Commit Trigger:**  
  You can manually trigger a commit via the Command Palette (the command is registered as **Start Code Tracking**). This is useful if you want to capture your progress immediately.

- **Timezone-Aware Timestamps:**  
  The commit messages and log entries include timestamps formatted with your local timezone. The extension auto-detects the system’s timezone but also allows you to override it via a setting (for example, `"America/New_York"`).

- **Output Channel Logging:**  
  An output channel named **FlauntGitHubLog** is created and displayed so you can easily monitor the extension’s actions, such as repository creation, cloning, file saves, commits, and pushes.


## Requirements

- **GitHub Account & Personal Access Token (PAT):**  
  You must have a GitHub account and a Personal Access Token with the appropriate scopes:
  - For public repositories: `public_repo`
  - For private repositories: `repo`

- **Visual Studio Code:**  
  Version 1.70.0 or later is required.


## Configuration

After installing the extension, you need to configure your GitHub credentials and (optionally) your preferred timezone in your VS Code settings. Open your settings (via **File > Preferences > Settings** or by editing your `settings.json`) and add:

```json
{
  "codeTracking.githubToken": "YOUR_GITHUB_PERSONAL_ACCESS_TOKEN",
  "codeTracking.githubUsername": "YOUR_GITHUB_USERNAME",
  // Optional: override the auto-detected timezone. If not set, the extension uses your system's timezone.
  "codeTracking.timeZone": "America/New_York"
}
```

Replace the placeholders with your actual GitHub token, username, and desired timezone (if needed). If you omit `"codeTracking.timeZone"`, the extension will auto-detect the system timezone using JavaScript’s Internationalization API.


## Usage

1. **Automatic Startup:**  
   When you launch VS Code, the extension activates (via the `onStartupFinished` activation event) and logs a message to the **FlauntGitHubLog** output channel.

2. **Activity Logging:**  
   Every time you save a file (whether via auto-save or manually using <kbd>Cmd+S</kbd>/<kbd>Ctrl+S</kbd>), the extension logs the event with a timestamp (including your timezone) to its in‑memory summary.

3. **Periodic Commits:**  
   The extension automatically commits the accumulated log entries at regular intervals. The commit message will include a timestamp formatted like:  
   `Coding activity summary - 2/12/2025, 3:39:03 AM EDT`

4. **Manual Commit:**  
   You can manually trigger a commit by opening the Command Palette (<kbd>Cmd+Shift+P</kbd> on macOS or <kbd>Ctrl+Shift+P</kbd> on Windows/Linux) and selecting **Start Code Tracking**.

5. **View Logs:**  
   Open the **Output** panel (via **View > Output**) and select **FlauntGitHubLog** from the dropdown to see detailed logs of the extension’s operations.


## Changelog

### 1.2.1
- **New Features:**
  - Auto-detection of system timezone with an optional override via settings.
  - Enhanced logging with detailed timestamps (including timezone information) in both commit messages and output channel logs.
  - Improved repository validation to ensure the local clone is a valid Git repository.
- **Bug Fixes:**
  - Fixed issues related to reading configuration settings.
  - Addressed errors when the local repository folder was not properly set up.


## License

This project is licensed under the [LICENSE](LICENSE).


## Contributing

Contributions are welcome! If you have suggestions for improvements or encounter any issues, please open an issue or submit a pull request @ [Flaunt Github](https://github.com/vib795/flaunt-github/).


# **Flaunt your progress. Flaunt GitHub!**