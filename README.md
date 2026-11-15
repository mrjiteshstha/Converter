# Fileswap

Convert web pages, Markdown, text, tables and images between formats.

- **HTML, Markdown and text to PDF** are rendered by headless Chromium in a Vercel function (`api/html-to-pdf.js`), so layout, CSS, fonts and images match the page.
- **Images, CSV, TSV and JSON** convert in the browser and never leave it.

## Deploy

1. Push this folder to a Git repository.
2. In Vercel choose **Add New → Project**, import the repository and deploy. No build settings are needed. `public/` is served as the site and `api/` as functions.
3. Open the deployed URL and convert an HTML file.

Local testing: `npm install`, then `npx vercel dev`.

## Using HTML with images and CSS

A browser can only read the file you choose, not the files next to it. Select the HTML file together with its images, CSS and fonts in one go (or drop them together) and they are attached automatically. Files are matched by file name. You can also use the **Add images & CSS** button on an HTML row.

Images, CSS and fonts that use full `https://` addresses load on their own.

## Limits

- A page can be up to 4.5 MB including its images (Vercel request limit). Large images are shrunk automatically when needed.
- Each conversion is limited to 60 seconds (`vercel.json`).
- Chromium on the server has few system fonts. Use web fonts or attach the font files.
- The endpoint is public. If it gets abused, add rate limiting or a password check in `api/html-to-pdf.js`, or turn on Vercel's Firewall rate limits.
- Pages cannot reach private or local network addresses from the server.

## Files

| Path | Purpose |
| --- | --- |
| `public/index.html` | The whole interface (one file, no build step) |
| `api/html-to-pdf.js` | Renders HTML to PDF with `puppeteer-core` and `@sparticuz/chromium` |
| `vercel.json` | Function duration and Chromium file inclusion |
