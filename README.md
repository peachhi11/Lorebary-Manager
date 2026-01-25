# SillyTavern Lorebary Client

**The unofficial Lorebary integration for SillyTavern.**

This extension brings the functionality of [Lorebary](https://lorebary.com/) directly into the SillyTavern chat interface. It serves as a bridge, allowing you to manage libraries, toggle content, and execute commands without leaving your conversation.

![Version](https://img.shields.io/badge/Version-1.0.0-blue) ![SillyTavern](https://img.shields.io/badge/SillyTavern-Extension-orange) ![License](https://img.shields.io/badge/License-MIT-green)

---

## 📖 Overview

Previously, using Lorebary content in SillyTavern required manually copying JSON files or switching tabs to copy/paste text. The **Lorebary Client** solves this by providing a native Graphical User Interface (GUI) within the Extensions panel.

### Key Features
* **Library Management:** View and manage your installed Lorebary content packs in a clean list format.
* **One-Click Toggles:** Enable or disable specific lorebooks and scripts instantly using checkboxes.
* **Command Suite:** A built-in interface to run Lorebary commands (search, update, help) without memorizing slash-commands.
* **Visual Feedback:** Status indicators show you exactly when content is active or when the library is updating.

---

## 🛠️ Installation

### Option 1: SillyTavern Extension Installer
Use ST's inbuilt extension installer.
1.  Open SillyTavern.
2.  Navigate to **Extensions** > **Install Extension**.
3.  Copy the link to this repository, paste it into the input box
```
https://github.com/RetiredHippie/Lorebary-Manager/tree/main
```
4.  Click **Install**.


## 🚀 Usage Guide

Once installed, the client is accessible via the **Extensions** menu in SillyTavern (the three boxes icon in the top bar).

1.  **Open the Extensions Menu.**
2.  Locate **Lorebary Control Panel** in the list.
3.  Click to expand the interface.

### Managing Content
* **Toggling:** Click the checkbox next to any library name to activate or deactivate it.
* **Removing:** Click the trash can icon <i class="fa-solid fa-trash"></i> to remove a library from your local configuration.

### Searching & Updating
* **Search:** Enter a keyword (e.g., "fantasy", "mechanics") in the Command Runner and click **Search**.
* **Update:** Click the **Update All** button to ensure your libraries are synced with the latest versions from the Lorebary backend.

---

## ⚙️ Technical Details

This extension integrates with SillyTavern's `extension_settings` to persist your library configuration. It utilizes SillyTavern's internal command processor to handle search and retrieval functions, ensuring compatibility with the chat system.

### File Structure
* `index.js`: Handles logic, API communication (planned), and UI events.
* `settings.html`: The HTML layout for the extension panel.
* `style.css`: Custom styling for the library list and controls.
* `manifest.json`: Extension metadata.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!
1.  Fork the project.
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4.  Push to the branch (`git push origin feature/AmazingFeature`).
5.  Open a Pull Request.

---

## 📜 License

**MIT License**

Copyright (c) 2025 RetiredHippie

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
