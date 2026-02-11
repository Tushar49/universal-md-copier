# Universal Page → Markdown Copier

A Tampermonkey userscript that adds a draggable floating button to **any** webpage, letting you copy the entire page as clean Markdown with a single click.

## Features

- **Articles & prose** – strips navigation, ads, and boilerplate; keeps headings, lists, links, and inline formatting.
- **Code blocks** – preserves syntax-highlighted fenced code blocks with language tags.
- **Tables** – converts HTML tables to GitHub-Flavored Markdown tables.
- **Images & videos** – extracts `![alt](src)` for images; detects HLS / MP4 / blob video sources.
- **Iframes** – inlines iframe content where possible.
- **Jupyter Notebooks** – fetches via API, downloads `.ipynb`, and supports all-files export.
- **Transcripts** – detects and extracts video/audio transcripts.
- **Math** – renders KaTeX / MathJax expressions as LaTeX in `$...$` / `$$...$$`.
- **Forms** – captures form structure and current values.
- **Next.js data** – extracts `__NEXT_DATA__` JSON when present.
- **Auto-expand** – clicks dropdowns/accordions before capture so hidden content is included.

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) (Chrome / Firefox / Edge / Safari).
2. Click the raw link to the script or create a new userscript in Tampermonkey and paste the contents of `universal-md-copier.user.js`.
3. The floating copy button will appear on every page.

## Usage

- Click the floating **Markdown** button on any page.
- The page content is converted to Markdown and copied to your clipboard.
- A notification confirms the copy.

## License

MIT
