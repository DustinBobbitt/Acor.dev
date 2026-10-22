# Acor.dev portfolio site

Evidence-backed manufacturing software portfolio covering production planning,
guarded geometry generation, independent CNC posts, station custody, warehouse
operations and reporting.

The site has no live demos. Case studies use screenshots and short recordings
made with invented data; none of them connect to an ERP, network share, printer,
scanner, controller or production database. Each case study distinguishes tested
source behavior, package evidence and external systems that were not demonstrated.

## Information architecture

- `/work/geometry-to-cnc.html` — guarded recipe/DXF/nesting/TAP/XPR case study
- `/work/production-traceability.html` — exact request, frozen plan and receipt
- `/work/station-handoff.html` — transactional station staging and rollback
- `/work/warehouse-floor.html` — Warehouse Floor case study (fictional-warehouse screens and clips)
- `/evidence/` — evidence labels, audit results and claim boundaries
- `/archive/` — experiments (AI Prime, AI Gamer); older product walkthroughs were retired

## Validation

Run the static page, link and claim checks before publication:

```powershell
python -B .\tools\validate_site.py
```

## Media

Warehouse Floor images and clips live in `rsc/img/warehouse-floor/` and
`rsc/media/warehouse-floor/`. They were captured from a fictional facility with
synthetic inventory; never replace them with captures of a real building.
