# Universal Page → Markdown Copier

A Tampermonkey/Greasemonkey userscript that adds a draggable floating button to **any** webpage, letting you copy the entire page as clean Markdown with a single click.

[![Install from Greasy Fork](https://img.shields.io/badge/Install-Greasy%20Fork-red?logo=tampermonkey)](https://greasyfork.org/en/scripts/565974-universal-page-markdown-copier)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-3.6-green.svg)](https://greasyfork.org/en/scripts/565974-universal-page-markdown-copier)

## Features

- **Articles & prose** – strips navigation, ads, and boilerplate; keeps headings, lists, links, and inline formatting
- **Code blocks** – preserves syntax-highlighted fenced code blocks with language tags
- **Tables** – converts HTML tables to GitHub-Flavored Markdown tables
- **Images & videos** – extracts `![alt](src)` for images; detects HLS / MP4 / blob video sources
- **Iframes** – inlines iframe content where possible
- **Jupyter Notebooks** – fetches via API, downloads `.ipynb`, and supports all-files export
- **Transcripts** – detects and extracts video/audio transcripts
- **Math** – renders KaTeX / MathJax expressions as LaTeX in `$...$` / `$$...$$`
- **Forms** – captures form structure and current values (including Workday application pages)
- **Next.js data** – extracts `__NEXT_DATA__` JSON when present
- **Auto-expand** – clicks dropdowns/accordions before capture so hidden content is included
- **Touch support** – mobile-friendly drag for the floating button

## Installation

### From Greasy Fork (recommended)

1. Install [Tampermonkey](https://www.tampermonkey.net/) (Chrome / Firefox / Edge / Safari).
2. Visit the **[Greasy Fork page](https://greasyfork.org/en/scripts/565974-universal-page-markdown-copier)** and click **Install this script**.

### Manual

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Create a new userscript in Tampermonkey and paste the contents of `universal-md-copier.user.js`.
3. Save — the floating copy button will appear on every page.

## Usage

| Action | Result |
|---|---|
| **Click** | Copy page as Markdown |
| **Hover** | Show context menu |
| **Right-click** | Context menu |
| **Double-click** | Minimize / restore |
| **Drag** | Reposition the button |

### Menu Options

- Copy as Markdown / Plain Text / Clean HTML
- Copy Selection as MD
- Expand All + Copy MD
- Download `.md` / `.ipynb` / All notebook files
- Minimize

## License

[MIT](LICENSE)
