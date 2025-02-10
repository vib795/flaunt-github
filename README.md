# Flaunt GitHub

**Flaunt GitHub** is a Visual Studio Code extension that helps you keep track of your coding activity by automatically logging file save events and committing a summary of your work to a dedicated GitHub repository every 30 minutes. Flaunt your progress effortlessly and let your code tell your story!

## Features

- **Automatic Activity Tracking:**  
  The extension monitors file save events in VS Code and logs each event with a timestamp.

- **Periodic GitHub Commits:**  
  Every 30 minutes, the accumulated coding summary is appended to a log file in your GitHub repository, automatically committed, and pushed to GitHub.

- **Manual Commit Trigger:**  
  Use the Command Palette to trigger an on-demand commit if you want to capture your progress immediately.

- **Repository Management:**  
  On activation, the extension checks if a repository named `code-tracking` exists in your GitHub account. If not, it creates the repository automatically (as a private repo if configured).

## Requirements

- **GitHub Account:**  
  You must have a GitHub account along with a Personal Access Token (PAT) that has the necessary scopes:
  - For **public repositories:** `public_repo`
  - For **private repositories:** `repo`

- **Visual Studio Code:**  
  Version 1.70.0 or later is required.


## Configuration

After installing the extension, you need to configure your GitHub credentials. Open your VS Code settings (via **File > Preferences > Settings** or by editing your `settings.json`) and add the following:

```json
{
  "codeTracking.githubToken": "YOUR_GITHUB_PERSONAL_ACCESS_TOKEN",
  "codeTracking.githubUsername": "YOUR_GITHUB_USERNAME"
}
```

Replace `YOUR_GITHUB_PERSONAL_ACCESS_TOKEN` and `YOUR_GITHUB_USERNAME` with your actual GitHub credentials.

## Usage

- **Automatic Repository Setup:**  
  When the extension activates, it checks for a GitHub repository named `code-tracking` under your account. If it doesn’t exist, it creates the repository automatically.

- **Activity Logging:**  
  Every time you save a file in VS Code, the extension logs the event along with a timestamp.

- **Periodic Commits:**  
  Every 30 minutes, the extension appends the current log to a file (typically `coding_summary.txt`), commits with a timestamped message, and pushes the changes to your GitHub repository.

- **Manual Commit:**  
  You can manually trigger a commit by opening the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`) and running the command **"Hello World"** (or the command you have set up for this purpose).

## Logo

Below is the logo for Flaunt GitHub. It’s designed to be both classy and distinctive:

![Flaunt GitHub Logo](images/logo.png)

*Tip:* Ensure you have placed your logo image (`logo.png`) in an `images` folder at the root of your extension.

## Changelog

### 1.0.1
- Initial release featuring automatic activity tracking, periodic commits, and manual commit support.

## License

This project is licensed under the [LICENSE](LICENSE).

## Contributing

Contributions are welcome! If you have ideas for improvements or encounter any [issues](https://github.com/vib795/flaunt-github/issues), please open an issue or submit a [pull request](https://github.com/vib795/flaunt-github/pulls).

**Flaunt your progress. Flaunt GitHub!**
