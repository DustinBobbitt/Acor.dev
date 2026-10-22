# Acor.dev portfolio site

Evidence-backed manufacturing software portfolio covering production planning,
guarded geometry generation, independent CNC posts, station custody, warehouse
operations and reporting.

The site includes three self-contained interactive demonstrations plus case-study
screenshots and short recordings made with invented data. None of them connect to
an ERP, network share, printer, scanner, controller or production database. Each
case study distinguishes tested source behavior, package evidence and external
systems that were not demonstrated.

## Information architecture

- `/work/geometry-to-cnc.html` — guarded recipe/DXF/nesting/TAP/XPR case study
- `/work/production-traceability.html` — exact request, frozen plan and receipt
- `/work/station-handoff.html` — transactional station staging and rollback
- `/work/warehouse-floor.html` — Warehouse Floor case study (fictional-warehouse screens and clips)
- `/evidence/` — evidence labels, audit results and claim boundaries
- `/archive/` — experiments (AI Prime, AI Gamer); older product walkthroughs were retired

| Demo | Path | What you can do |
|------|------|-----------------|
| Pipeline explorer | `demos/pipeline-explorer/` | Advance a supported job or run a guarded recipe refusal |
| Exact request and receipt | `demos/request-receipt/` | Freeze exact items, test stale intent, verify a receipt |
| Station handoff | `demos/station-handoff/` | Interrupt staging, inspect rollback, retry and commit |

The three guided demos use one invented, reconciled production day from
`demos/shared/manufacturing-day.json`. The older Cut, pallet, material and
warehouse-mapper browser replicas were retired rather than carried forward.

## Validation

Run the static page, link and claim checks before publication:

```powershell
python -B .\tools\validate_site.py
```

## Media

Warehouse Floor images and clips live in `rsc/img/warehouse-floor/` and
`rsc/media/warehouse-floor/`. They were captured from a fictional facility with
synthetic inventory; never replace them with captures of a real building.

Regenerate the three 2560×1440 guided case-study clips from the running local
site. The recorder drives the actual public controls and burns in concise
captions without recording the desktop:

```powershell
$env:NODE_PATH = "C:\Users\drbobbitt\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules"
$env:ACOR_PREVIEW_URL = "http://localhost:8767"
node .\tools\record_guided_demos.cjs
```
