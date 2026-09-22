# Acor.dev portfolio site

Sanitized manufacturing portfolio: live web demos plus write-ups for operations tools and the CAD/CNC file-generation pipeline (AutoCAD plugin, Fusion catalog generator, parametric DXF, nesting MDB, TAP/XPR, Nest Load).

Interactive demos use mock data only — no customer names, company logos, live databases, or shop file paths.

| Demo | Path | What you can do |
|------|------|-----------------|
| Cut operations | `demos/cut-health/` | Queue, packets, labels, backlog |
| Pallet locator | `demos/pallet-locator/` | Search jobs, click map, place / undo |
| Wood usage | `demos/wood-usage/` | SKU calculate, forecast list, CSV export |
| Warehouse mapper | `demos/warehouse-mapper/` | Rack map, bay counts, DEMO-* SKU search |

## Media

Regenerate interactive walkthroughs (Playwright + ffmpeg):

```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
python .\tools\record_demo_walkthroughs.py
python .\tools\make_demo_reel.py
```

Requires `ffmpeg` on PATH (install with `winget install Gyan.FFmpeg`).
