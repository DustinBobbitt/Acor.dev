# Acor.dev portfolio site

Evidence-backed manufacturing software portfolio covering production planning,
guarded geometry generation, independent CNC posts, station custody, warehouse
operations and reporting.

Public demos are isolated simulations with invented fixtures. They do not connect
to an ERP, network share, printer, scanner, controller or production database.
Each case study distinguishes tested source behavior, package evidence, public
simulation and external systems that were not demonstrated.

## Information architecture

- `/work/geometry-to-cnc.html` — guarded recipe/DXF/nesting/TAP/XPR case study
- `/work/production-traceability.html` — exact request, frozen plan and receipt
- `/work/station-handoff.html` — transactional station staging and rollback
- `/work/warehouse-floor.html` — standalone Warehouse Floor capability overview
- `/evidence/` — evidence labels, audit results and claim boundaries
- `/archive/` — earlier desktop walkthroughs and experiments

| Demo | Path | What you can do |
|------|------|-----------------|
| Cut operations | `demos/cut-health/` | Queue, packets, labels, backlog |
| Pallet locator | `demos/pallet-locator/` | Search jobs, click map, place / undo |
| Wood usage | `demos/wood-usage/` | SKU calculate, forecast list, CSV export |
| Warehouse mapper | `demos/warehouse-mapper/` | Older simplified rack-map slice; see the Warehouse Floor overview for current scope |

The next demo release will replace independent generic fixtures with one coherent
synthetic production day shared across Cut, station, material and pallet views.
Existing recordings remain in the repository as historical assets until the
replacement scenarios are frozen and re-recorded.

## Validation

Run the static page, link, fixture and claim checks before publication:

```powershell
python -B .\tools\validate_site.py
```

## Media

Regenerate interactive walkthroughs (Playwright + ffmpeg):

```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
python .\tools\record_demo_walkthroughs.py
python .\tools\make_demo_reel.py
```

Requires `ffmpeg` on PATH (install with `winget install Gyan.FFmpeg`).
