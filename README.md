# Acor.dev

Static portfolio site for workflow tools and case studies.

## Files

- `index.html` contains the page structure and portfolio copy.
- `styles.css` contains the visual system and responsive layout.
- `script.js` handles the mobile nav and scroll reveals.
- `rsc/` holds the existing logo, social images, and media assets.

## Local preview

Open `index.html` directly in a browser for a quick check.

If you want a simple local server and already have Python installed:

```powershell
python -m http.server 8000
```

Then visit `http://localhost:8000`.

If Python is not available, use the included PowerShell server:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\serve.ps1
```

Then visit `http://localhost:8000`.

## Publish on GitHub Pages

1. Push this repository to GitHub.
2. In the repository settings, open `Pages`.
3. Set the source to deploy from the `main` branch.
4. Use the repository root as the publish folder.
5. Save and wait for GitHub Pages to build the site.

## Before publishing

- Replace the placeholder contact pills with your actual links.
- Add the sanitized Rover demo and the deeper workflow-suite case study media.
- Update copy anywhere you want stronger project-specific outcomes or metrics.
