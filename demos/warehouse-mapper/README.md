# Warehouse Mapper — Sanitized Portfolio Demo

Static browser demo of the warehouse rack map and bay-level count entry. Mock fixtures only; no backend and no company branding.

## Files

| File | Role |
|------|------|
| `index.html` | Shell: header, banner, canvas, search + detail panels |
| `styles.css` | Acor ink-navy / cyan–violet theme (matches portfolio chrome) |
| `app.js` | Loads fixtures, draws overview, bay grid + DEMO-* counts |
| `demo-map.json` | Sanitized map (rows, zones, slotted pallets, rack locations) |
| `demo-items.json` | Movable pallet / stack fixtures |

## Run

Serve the folder over HTTP (fetch needs a origin). From this directory:

```bash
python -m http.server 8765
```

Then open `http://localhost:8765/`.

## Interactions

1. **Overview** — canvas shows Bulk Demo racks, staging zone, slotted pallet, machines/aisles, and movable pallets.
2. **Select rack** — click a rack to open its levels × bays grid in the right panel.
3. **Enter counts** — pick a bay cell, choose a `DEMO-*` SKU, apply qty (or clear).
4. **Search** — type or chip-select a SKU; hits list and map bays highlight; click a hit to jump to that bay.
5. **Reset counts** — restores fixture seed from `demo-map.json` rack locations (sanitized to `DEMO-*`).
