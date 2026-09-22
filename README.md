# Sanitized portfolio demos

Interactive, offline demos for acor.dev. Mock data only — no customer names, company logos, live databases, or shop file paths.

| Demo | Path | What you can do |
|------|------|-----------------|
| Cut operations | `demos/cut-health/` | Queue, packets, labels, backlog |
| Pallet locator | `demos/pallet-locator/` | Search jobs, click map, place / undo |
| Wood usage | `demos/wood-usage/` | SKU calculate, forecast list, CSV export |

## Media

Regenerate the demo reel (GIF + MP4) after updating screenshots:

```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
python .\tools\make_demo_reel.py
```

Requires `ffmpeg` on PATH (install with `winget install Gyan.FFmpeg`).
