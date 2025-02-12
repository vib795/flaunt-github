# Flaunt GitHub

**Flaunt GitHub** is a Visual Studio Code extension that logs your coding sessions by automatically committing a summary of your work every 30 minutes to a dedicated GitHub repository. Forget the misleading activity graphs—get an honest record of your coding productivity and flaunt your progress!

## Features

- **Automatic Activity Tracking:**  
  Logs every file save event in VS Code with a timestamp.

- **Periodic GitHub Commits:**  
  Every 30 minutes, your coding summary is appended to a log file (`coding_summary.txt`), committed, and pushed to your GitHub repository.

- **Manual Commit Trigger:**  
  Instantly capture your progress by triggering a commit via the Command Palette.

- **Smart Repository Management:**  
  On activation, the extension checks for a repository named `code-tracking` in your GitHub account and automatically creates it if needed.

## Requirements

- **GitHub Account:**  
  You need a GitHub account along with a Personal Access Token (PAT) with:
  - `public_repo` for public repositories, or
  - `repo` for private repositories.

- **Visual Studio Code:**  
  Version 1.70.0 or later.

## Configuration

After installing the extension, add your GitHub credentials to your VS Code settings (via **File > Preferences > Settings** or editing your `settings.json`):

```json
{
  "codeTracking.githubToken": "YOUR_GITHUB_PERSONAL_ACCESS_TOKEN",
  "codeTracking.githubUsername": "YOUR_GITHUB_USERNAME"
}
```

Replace the placeholders with your actual GitHub credentials.

## Usage

- **Automatic Setup:**  
  On activation, the extension verifies if a `code-tracking` repository exists under your GitHub account. If it doesn't, the repository is created automatically.

- **Activity Logging:**  
  Every file save event is recorded with a timestamp.

- **Automatic Commits:**  
  Every 30 minutes, the accumulated summary is committed to GitHub with a timestamped message.

- **Manual Commits:**  
  Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`) and run the configured command to trigger an immediate commit.

## Changelog

### 1.0.4
- Initial release featuring automatic activity tracking, periodic commits, and manual commit support.

## License

This project is licensed under the [LICENSE](LICENSE).

## Contributing

Contributions are welcome! If you have suggestions or encounter any issues, please open an [issue](https://github.com/vib795/flaunt-github/issues) or submit a [pull request](https://github.com/vib795/flaunt-github/pulls).

**Flaunt your progress. Flaunt GitHub!**
