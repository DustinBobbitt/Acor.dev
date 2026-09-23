"""Port real product frontends into portfolio demos (Acor-only, floor untouched).

Copies UI from Suite / Mapping tool into portfolio/acor.dev/demos/*, strips
company branding, injects Acor theme + a static fetch shim with sanitized
fixtures. Never reads live Insight SQL or woodusage.db.
"""
from __future__ import annotations

import json
import re
import shutil
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEMOS = ROOT / "demos"
SUITE = ROOT.parents[1]
if str(SUITE) not in sys.path:
    sys.path.insert(0, str(SUITE))
MAPPING = Path(r"C:\Users\ksima\Mapping tool")
if not MAPPING.exists():
    MAPPING = Path.home() / "Mapping tool"

ACOR_THEME = """
/* Acor portfolio overlay — coherent dark product wells + readable type */
@import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap");

:root {
  --bg: #070b16 !important;
  --bg-soft: #0c1222 !important;
  --band: #0c1222 !important;
  --band-2: #121a30 !important;
  --surface: #121a30 !important;
  --tile: #162038 !important;
  --tile-2: #1a2744 !important;
  --panel: #121a30 !important;
  --card: #162038 !important;
  --border: #3a4a72 !important;
  --text: #edf1ff !important;
  --text-muted: #b4c0e4 !important;
  --muted: #b4c0e4 !important;
  --accent: #3ad0ff !important;
  --accent-2: #b85fff !important;
  --primary: #3ad0ff !important;
  --primary-light: rgba(58, 208, 255, 0.18) !important;
  --selected: #3ad0ff !important;
  --topbar-bg: #0c1222 !important;
  --topbar-text: #edf1ff !important;
  --green-fill: rgba(74, 222, 128, 0.22) !important;
  --green-dark: #4ade80 !important;
  --white-fill: #1a2744 !important;
  --orange-border: #fb923c !important;
  --orange-light: rgba(251, 146, 60, 0.22) !important;
  --wip-badge: #fb923c !important;
  --danger: #f87171 !important;
  --shadow: 0 12px 40px rgba(0, 0, 0, 0.45) !important;
  color-scheme: dark;
}

html, body {
  background: #070b16 !important;
  color: #edf1ff !important;
  font-family: "Plus Jakarta Sans", "Segoe UI", Arial, sans-serif !important;
}

/* Surfaces that product CSS still paints light */
.topbar, header, .app-header, .landing-overlay,
.job-panel, .detail-panel, .map-panel, .panel, .card, .modal, .modal-overlay .modal,
.rack-grid-wrap, .search-results-panel, .floating-inspector,
.suite-shell, .workspace, .metric, .metric-band, aside, main,
.job-bubble, .day-group, .form-group input, .form-group select, .form-group textarea,
input, select, textarea, table, .mdb-wizard-table, .completed-job {
  background-color: #121a30 !important;
  color: #edf1ff !important;
  border-color: #3a4a72 !important;
}

.job-panel, .detail-panel, .map-panel, .panel, .card, .modal {
  box-shadow: inset 0 0 0 1px rgba(58, 208, 255, 0.08) !important;
}

.job-bubble {
  background: #1a2744 !important;
  color: #edf1ff !important;
  border: 1px solid #3a4a72 !important;
}
.job-bubble .job-bubble-name,
.job-bubble-name, .job-bubble-customer, .day-label, .day-count,
.job-panel-summary, .label, .hint, .task-note, .section-label,
.brand-name, h1, h2, h3, h4, p, td, th, label, span, strong, output {
  color: #edf1ff !important;
}
.job-bubble-customer, .task-note, .hint, .muted, .text-muted, .day-count {
  color: #b4c0e4 !important;
}
.job-bubble.paint { background: rgba(74, 222, 128, 0.18) !important; }
.job-bubble.wip { border-color: #fb923c !important; }
.job-bubble.selected {
  outline: 2px solid #3ad0ff !important;
  background: rgba(58, 208, 255, 0.16) !important;
}

button, .button, .btn, .area-tab, .job-panel-tab, .table-action-btn {
  color: #edf1ff !important;
  border-color: #3a4a72 !important;
  background: #1a2744 !important;
}
button.primary, .button.primary, #placeModeBtn, .button-primary,
button[type="submit"] {
  background: linear-gradient(135deg, #3ad0ff, #b85fff) !important;
  color: #070b16 !important;
  border: none !important;
  font-weight: 700 !important;
}
.area-tab.active, .job-panel-tab.active, .button.active, .job-view-button.active {
  background: rgba(58, 208, 255, 0.22) !important;
  color: #edf1ff !important;
  border-color: #3ad0ff !important;
}

input, select, textarea {
  background: #0c1222 !important;
  color: #edf1ff !important;
  border: 1px solid #3a4a72 !important;
}
input::placeholder, textarea::placeholder { color: #8b9acc !important; }

.map-scroll, #mapCanvas, #gridWrap, .rack-grid-wrap {
  background: #0a1020 !important;
}

.demo-banner {
  margin: 0;
  padding: 0.7rem 1rem;
  border-bottom: 1px solid rgba(58, 208, 255, 0.28);
  background: linear-gradient(90deg, rgba(58, 208, 255, 0.12), rgba(184, 95, 255, 0.10));
  color: #c8d4f5 !important;
  font-size: 0.88rem;
  letter-spacing: 0.01em;
}

.landing-overlay {
  background: rgba(7, 11, 22, 0.92) !important;
}
.landing-overlay h1, .landing-overlay p { color: #edf1ff !important; }

.overview-action-panel,
.overview-action-panel *,
.department-admin-panel,
.floating-inspector,
.search-results-panel {
  background: #162038 !important;
  color: #edf1ff !important;
  border-color: #3a4a72 !important;
}

/* Keep status colors readable on dark */
.wip-badge { color: #070b16 !important; background: #fb923c !important; }
"""

WAREHOUSE_AUTOLOGIN = """
<script>
(() => {
  const boot = async () => {
    const user = document.getElementById("landingUserBtn");
    if (user) {
      user.click();
      await new Promise((r) => setTimeout(r, 280));
      const form = document.getElementById("landingDepartmentForm");
      const submit = form && form.querySelector('button[type="submit"]');
      if (submit && form && !form.classList.contains("hidden")) submit.click();
      await new Promise((r) => setTimeout(r, 500));
    }
    const latest = document.getElementById("mapLatestBtn");
    if (latest) latest.click();
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 250));
  } else {
    setTimeout(boot, 250);
  }
})();
</script>
"""

BANNER = (
    '<p class="demo-banner">Sanitized portfolio demo of the real product UI — '
    "mock fixtures only. No customer names, company logos, or live shop data.</p>"
)


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def copy_tree(src: Path, dst: Path, patterns: list[str]) -> None:
    if dst.exists():
        shutil.rmtree(dst)
    dst.mkdir(parents=True)
    for pattern in patterns:
        for path in src.glob(pattern):
            if path.is_file():
                target = dst / path.relative_to(src)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(path, target)


def strip_company(html: str) -> str:
    html = re.sub(r"Timberland Cabinetry", "Acor.dev", html, flags=re.I)
    html = re.sub(r"Timberland", "Acor", html, flags=re.I)
    html = re.sub(r'<img[^>]+logo[^>]*>', "", html, flags=re.I)
    html = re.sub(r'src="/logo\.webp"', 'src=""', html)
    html = re.sub(r'href="/styles\.css"', 'href="styles.css"', html)
    html = re.sub(r'href="/static/styles\.css"', 'href="styles.css"', html)
    html = re.sub(r'src="/static/shared\.js"', 'src="shared.js"', html)
    html = re.sub(r'src="/static/wood-usage/app\.js"', 'src="app.js"', html)
    html = re.sub(r'src="/static/[^"]+/app\.js"', 'src="app.js"', html)
    html = re.sub(r'src="/app\.js"', 'src="app.js"', html)
    html = re.sub(r'src="/modules/', 'src="modules/', html)
    html = re.sub(r'href="/workspace\.css"', 'href="workspace.css"', html)
    return html


def inject_head(html: str, extra_links: list[str], extra_scripts: list[str]) -> str:
    inject = "\n".join(extra_links + extra_scripts)
    if "</head>" in html:
        return html.replace("</head>", inject + "\n</head>", 1)
    return inject + html


def inject_banner(html: str) -> str:
    # After <body> or first topbar
    if "demo-banner" in html:
        return html
    if re.search(r"<body[^>]*>", html, re.I):
        return re.sub(r"(<body[^>]*>)", r"\1\n  " + BANNER, html, count=1, flags=re.I)
    return BANNER + html


def fetch_shim(fixture_url: str = "fixtures.json") -> str:
    return f"""
<script>
(() => {{
  const FIXTURE_URL = new URL("{fixture_url}", window.location.href).href;
  let fixturesPromise = null;
  function loadFixtures() {{
    if (!fixturesPromise) {{
      fixturesPromise = fetch(FIXTURE_URL).then((r) => r.json()).catch(() => ({{}}));
    }}
    return fixturesPromise;
  }}
  function matchRoute(routes, method, path) {{
    const key = method.toUpperCase() + " " + path.split("?")[0];
    if (routes[key] !== undefined) return routes[key];
    const bare = path.split("?")[0];
    for (const [pattern, value] of Object.entries(routes)) {{
      const [m, p] = pattern.split(" ");
      if (m !== method.toUpperCase()) continue;
      if (p.endsWith("*") && bare.startsWith(p.slice(0, -1))) return value;
      if (p === bare) return value;
    }}
    return undefined;
  }}
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {{}}) => {{
    const url = typeof input === "string" ? input : (input && input.url) || "";
    const method = String((init && init.method) || "GET").toUpperCase();
    let path = url;
    try {{
      const abs = new URL(url, window.location.href);
      if (abs.origin === window.location.origin) path = abs.pathname + abs.search;
    }} catch (_e) {{}}
    if (!path.includes("/api/")) {{
      return originalFetch(input, init);
    }}
    const fixtures = await loadFixtures();
    const routes = fixtures.routes || {{}};
    let body = matchRoute(routes, method, path);
    if (body === undefined) {{
      body = fixtures.default || {{ ok: true, demo: true, items: [], jobs: [], error: null }};
    }}
    if (typeof body === "function") {{
      body = body(path, init);
    }}
    // Clone so callers can mutate without poisoning fixtures.
    const payload = JSON.parse(JSON.stringify(body));
    return new Response(JSON.stringify(payload), {{
      status: 200,
      headers: {{ "Content-Type": "application/json" }},
    }});
  }};
  window.__ACOR_DEMO__ = true;
}})();
</script>
"""


def build_cut_health() -> None:
    src = SUITE / "cut" / "health" / "static"
    dst = DEMOS / "cut-health"
    # Keep demo-data.js out; use fixtures
    for name in ("index.html", "app.js", "styles.css", "trim_material_guide.js", "cabinet_welcome_guide.js"):
        src_file = src / name
        if src_file.exists():
            shutil.copy2(src_file, dst / name)
    # Optional guides — skip large cabinet guide tree for Pages size
    html = (dst / "index.html").read_text(encoding="utf-8")
    html = strip_company(html)
    html = html.replace('href="/static/', 'href="')
    html = html.replace('src="/static/', 'src="')
    html = html.replace("Cut Health", "Cut Operations")
    html = inject_head(
        html,
        [
            '<link rel="stylesheet" href="acor-theme.css">',
            '<link rel="preconnect" href="https://fonts.googleapis.com">',
            '<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">',
        ],
        [fetch_shim("fixtures.json")],
    )
    html = inject_banner(html)
    # Point scripts relative
    html = html.replace('src="app.js"', 'src="app.js"')
    write(dst / "index.html", html)
    write(dst / "acor-theme.css", ACOR_THEME)

    # Overview-shaped fixture from prior sanitized demo numbers
    overview = {
        "today": {
            "total": 86,
            "completed": 86,
            "carcass": 63,
            "trim": 23,
            "manual_added": {"count": 7, "requests": 3},
            "latest_refresh_timestamp": "2026-07-01T08:30:00",
            "source_state": "Sanitized portfolio fixture",
        },
        "recent_performance": {
            "last_7_days": {
                "total": 511,
                "carcass": 382,
                "trim": 129,
                "average_per_day": 73,
                "days": 7,
                "excluded_days": 0,
                "in_progress_days": 0,
                "catch_up_days": 0,
            },
            "last_30_days": {
                "total": 2086,
                "carcass": 1558,
                "trim": 528,
                "average_per_day": 70,
                "days": 30,
                "excluded_days": 0,
                "in_progress_days": 0,
                "catch_up_days": 0,
            },
            "trend_7_days": [
                {"day": "2026-06-25", "label": "Thu", "total": 64, "carcass": 48, "trim": 16},
                {"day": "2026-06-26", "label": "Fri", "total": 78, "carcass": 56, "trim": 22},
                {"day": "2026-06-29", "label": "Mon", "total": 81, "carcass": 62, "trim": 19},
                {"day": "2026-06-30", "label": "Tue", "total": 72, "carcass": 53, "trim": 19},
                {"day": "2026-07-01", "label": "Wed", "total": 86, "carcass": 63, "trim": 23},
                {"day": "2026-07-02", "label": "Thu", "total": 68, "carcass": 50, "trim": 18},
                {"day": "2026-07-03", "label": "Fri", "total": 62, "carcass": 50, "trim": 12},
            ],
        },
        "backlog": {
            "ahead_goal_days": 8,
            "jobs_needed_to_reach_goal": 14,
            "items_needed_to_reach_goal": 128,
            "due_within_goal": 276,
            "overdue": 42,
            "due_today": 31,
            "snapshot_rows": 642,
        },
        "reports": [],
        "settings": {"ahead_goal_days": 8, "header_style": "default"},
    }
    packets = {
        "ok": True,
        "jobs": [
            {
                "po_number": "JOB-1042",
                "firm_date": "2026-07-02",
                "status": "ready",
                "cabinet_count": 5,
            },
            {
                "po_number": "JOB-1088",
                "firm_date": "2026-07-02",
                "status": "printed",
                "cabinet_count": 4,
            },
        ],
    }
    labels = {
        "ok": True,
        "mode": "ready",
        "ready": [
            {"po_number": "JOB-2140", "cabinets": 6, "status": "ready"},
            {"po_number": "JOB-2148", "cabinets": 4, "status": "ready"},
            {"po_number": "JOB-2162", "cabinets": 8, "status": "ready"},
        ],
        "recent": [],
        "items": [],
    }
    fixtures = {
        "default": {"ok": True, "demo": True, "enabled": False, "items": [], "jobs": []},
        "routes": {
            "GET /api/overview": overview,
            "GET /api/offline-mode": {
                "ok": True,
                "offline": False,
                "enabled": False,
                "drives": [],
                "storage": {"mode": "demo"},
                "network": {"available": True},
            },
            "GET /api/auto-refresh/status": {
                "ok": True,
                "server": {"enabled": False, "last_action": "disabled"},
                "insight": {"status": "idle"},
                "snapshot": {"source_state": "Sanitized portfolio fixture"},
            },
            "GET /api/operator-packets": packets,
            "GET /api/palette-labels": labels,
            "GET /api/manual-added": {"ok": True, "count": 7, "requests": 3, "items": []},
            "GET /api/po-suggestions": {"items": ["JOB-1042", "JOB-1088", "JOB-2140"]},
            "GET /api/workload-distribution": {
                "ok": True,
                "buckets": [
                    {"label": "Overdue", "total": 42},
                    {"label": "Today", "total": 31},
                    {"label": "Tomorrow", "total": 58},
                ],
            },
            "GET /api/completed-today": {
                "ok": True,
                "day": "2026-07-01",
                "total": 86,
                "jobs": [
                    {
                        "po_number": "JOB-1042",
                        "cabinet_count": 5,
                        "carcass": 4,
                        "trim": 1,
                        "completed_at": "2026-07-01T10:15:00",
                    },
                    {
                        "po_number": "JOB-1088",
                        "cabinet_count": 4,
                        "carcass": 3,
                        "trim": 1,
                        "completed_at": "2026-07-01T11:40:00",
                    },
                ],
            },
            "GET /api/ahead-goal": {
                "ok": True,
                "ahead_goal_days": 8,
                "jobs_needed_to_reach_goal": 14,
                "items_needed_to_reach_goal": 128,
            },
            "GET /api/trim-checklist": {
                "ok": True,
                "day": "2026-07-01",
                "items": [
                    {"item": "Trim rails", "qty": 12, "status": "ready"},
                    {"item": "Trim panels", "qty": 8, "status": "pending"},
                ],
            },
            "GET /api/restock": {"ok": True, "items": [], "count": 0},
            "GET /api/machine-issues": {"ok": True, "items": []},
            "GET /api/omni-dispatch": {
                "ok": True,
                "sets": [
                    {
                        "id": "set-1",
                        "name": "Batch A",
                        "po_numbers": ["JOB-2201", "JOB-2202"],
                        "cabinet_count": 12,
                        "status": "ready",
                    }
                ],
                "alerts": [],
            },
            "GET /api/omni-floor-live": {"ok": True, "stations": [], "events": []},
            "GET /api/morning-cut-plan/live": {
                "ok": True,
                "events": [],
                "pinned": False,
                "date_basis": "departure",
            },
            "POST /api/morning-cut-plan/draft": {
                "ok": True,
                "max_cabinets": 150,
                "outstanding_cabinets": 42,
                "manual_cabinets": 0,
                "forecast_cabinets": 48,
                "plan_cabinets": 90,
                "over_target": False,
                "plan_over_target": False,
                "blocked_by_pipeline": False,
                "outstanding": [
                    {
                        "po_number": "JOB-1042",
                        "cabinet_count": 5,
                        "role": "outstanding",
                        "firm_date": "2026-07-02",
                    },
                    {
                        "po_number": "JOB-1088",
                        "cabinet_count": 4,
                        "role": "outstanding",
                        "firm_date": "2026-07-02",
                    },
                ],
                "new_work": [
                    {
                        "po_number": "JOB-2201",
                        "cabinet_count": 6,
                        "role": "forecast",
                        "firm_date": "2026-07-08",
                    },
                    {
                        "po_number": "JOB-2202",
                        "cabinet_count": 8,
                        "role": "forecast",
                        "firm_date": "2026-07-08",
                    },
                    {
                        "po_number": "JOB-2203",
                        "cabinet_count": 5,
                        "role": "forecast",
                        "firm_date": "2026-07-09",
                    },
                ],
            },
            "POST /api/smart-batches/plan": {
                "ok": True,
                "max_cabinets": 150,
                "available_new_cabinets": 48,
                "total_cabinets": 48,
                "eligible_job_count": 12,
                "batches": [
                    {
                        "name": "Demo Batch 1",
                        "cabinet_count": 24,
                        "job_count": 4,
                        "jobs": ["JOB-2201", "JOB-2202", "JOB-2203", "JOB-2204"],
                    },
                    {
                        "name": "Demo Batch 2",
                        "cabinet_count": 24,
                        "job_count": 3,
                        "jobs": ["JOB-2205", "JOB-2206", "JOB-2207"],
                    },
                ],
                "picked_jobs": [
                    {
                        "po_number": "JOB-2201",
                        "firm_date": "2026-07-08",
                        "cabinet_count": 6,
                    },
                    {
                        "po_number": "JOB-2202",
                        "firm_date": "2026-07-08",
                        "cabinet_count": 8,
                    },
                    {
                        "po_number": "JOB-2203",
                        "firm_date": "2026-07-09",
                        "cabinet_count": 5,
                    },
                ],
                "stain_grade": {"cabinet_count": 0, "jobs": []},
            },
            "POST /api/smart-batches/generate": {
                "ok": True,
                "demo": True,
                "message": "Demo mode — production writes disabled.",
                "batches": [],
                "failures": [],
            },
            "POST /api/morning-cut-plan/produce": {
                "ok": True,
                "demo": True,
                "message": "Demo mode — produce disabled.",
            },
            "POST /api/*": {"ok": True, "demo": True, "message": "Demo mode — writes disabled."},
        },
    }
    write(dst / "fixtures.json", json.dumps(fixtures, indent=2))
    # Remove knockoff files if present
    for stale in ("demo-data.js",):
        p = dst / stale
        if p.exists():
            p.unlink()


def replace_tree(src: Path, dst: Path, ignore=None) -> None:
    """Copy src → dst, replacing contents without requiring an exclusive rmtree."""
    dst.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        for child in list(dst.iterdir()):
            if child.is_dir():
                shutil.rmtree(child, ignore_errors=True)
            else:
                try:
                    child.unlink()
                except OSError:
                    pass
    shutil.copytree(src, dst, dirs_exist_ok=True, ignore=ignore)


def build_pallet_locator() -> None:
    src = SUITE / "cut_palette_locator" / "frontend"
    dst = DEMOS / "pallet-locator"
    replace_tree(src, dst, ignore=shutil.ignore_patterns("logo.webp", "*.map"))
    html = (dst / "index.html").read_text(encoding="utf-8")
    html = strip_company(html)
    html = html.replace("Cut Pallet Locator", "Pallet Locator")
    html = html.replace('href="/styles.css"', 'href="styles.css"')
    html = html.replace('src="/app.js"', 'src="app.js"')
    html = html.replace('src="/modules/', 'src="modules/')
    html = inject_head(
        html,
        ['<link rel="stylesheet" href="acor-theme.css">'],
        [fetch_shim("fixtures.json")],
    )
    html = inject_banner(html)
    # Remove broken logo img
    html = re.sub(r'<img class="brand-logo"[^>]*>', "", html)
    write(dst / "index.html", html)
    write(dst / "acor-theme.css", ACOR_THEME)

    from cut_palette_locator.server import _convert_mapping_tool_warehouse

    map_src = SUITE / "cut_palette_locator" / "data" / "map.json"
    raw_map = json.loads(map_src.read_text(encoding="utf-8"))
    raw_map["name"] = "Demo Warehouse"
    viewer_map = _convert_mapping_tool_warehouse(raw_map)
    # Portfolio-safe area labels (keep geometry, drop shop-specific names).
    area_rename = {"PrinceVille": "Assembly", "Cut": "Cut"}
    for area in viewer_map.get("areas") or []:
        if not isinstance(area, dict):
            continue
        old = str(area.get("id") or area.get("label") or "")
        new = area_rename.get(old, old)
        if new != old:
            area["id"] = new
            area["label"] = new
    for collection in ("rows", "zones", "null_spaces", "slotted_pallets", "labels"):
        for item in viewer_map.get(collection) or []:
            if isinstance(item, dict) and item.get("area") in area_rename:
                item["area"] = area_rename[item["area"]]
    if isinstance(viewer_map.get("area_offsets"), dict):
        viewer_map["area_offsets"] = {
            area_rename.get(k, k): v for k, v in viewer_map["area_offsets"].items()
        }
    base = date(2026, 7, 8)
    jobs = []
    for i in range(1, 25):
        po_date = (base + timedelta(days=(i - 1) // 6)).isoformat()
        jobs.append(
            {
                "job_name": f"JOB-{2100 + i}",
                "po_date": po_date,
                "firm_date": po_date,
                "status": "active",
                "is_paint_job": i % 5 == 0,
                "is_wip": i % 4 == 0,
                "cabinet_count": 3 + (i % 6),
                "item_count": 3 + (i % 6),
                "customer": "",
                "source": "generated",
                "is_orphaned": False,
                "has_placement": i <= 12,
                "group_label": "",
            }
        )
    placements = []
    rows = viewer_map.get("rows") or []
    areas = viewer_map.get("areas") or []
    for i, job in enumerate(jobs[:12]):
        row = rows[i % len(rows)] if rows else None
        area_name = ""
        if isinstance(row, dict):
            area_name = str(row.get("area") or "")
            x = float(row.get("x", 40)) + (i % 4) * 14
            y = float(row.get("y", 40)) + (i // 4) * 16
        elif areas and isinstance(areas[0], dict):
            area_name = str(areas[0].get("id") or areas[0].get("label") or "A")
            x = float(areas[0].get("x", 40)) + 40 + (i % 4) * 14
            y = float(areas[0].get("y", 40)) + 40 + (i // 4) * 16
        else:
            area_name = "A"
            x, y = 40.0 + i * 12, 40.0
        placements.append(
            {
                "id": f"plc-{i+1}",
                "job_name": job["job_name"],
                "job_names": [job["job_name"]],
                "area": area_name,
                "zone": "",
                "x": x,
                "y": y,
                "rack_width": 10,
                "rack_height": 8,
                "is_paint_job": job["is_paint_job"],
                "is_wip": job["is_wip"],
                "is_single_cabinet": False,
                "placed_at": "2026-07-01T10:00:00",
                "placed_by": "demo",
            }
        )
    generated_jobs = [
        {
            "job_name": job["job_name"],
            "original_job_name": job["job_name"],
            "po_date": job["po_date"],
            "effective_po_date": job["po_date"],
            "is_hidden": False,
            "has_override": False,
            "is_paint_job": job["is_paint_job"],
        }
        for job in jobs
    ]
    fixtures = {
        "default": {"ok": True, "demo": True},
        "routes": {
            "GET /api/jobs": jobs,
            "GET /api/placements": placements,
            "GET /api/map": viewer_map,
            "GET /api/jobs-feed-status": {
                "ok": True,
                "exists": True,
                "valid_count": len(jobs),
                "stale": False,
                "message": "Demo feed",
            },
            "GET /api/reclaimed-jobs": {"ok": True, "jobs": [], "item_count": 0},
            "GET /api/jobs-manage": {
                "ok": True,
                "generated_jobs": generated_jobs,
                "manual_jobs": [],
                "hidden": [],
            },
            "GET /api/status": {
                "ok": True,
                "jobs": len(jobs),
                "placements": len(placements),
                "map": viewer_map.get("name", "Demo Warehouse"),
            },
            "POST /api/*": {"ok": True, "demo": True, "id": "demo-write"},
        },
    }
    write(dst / "fixtures.json", json.dumps(fixtures, indent=2))
    for stale in ("demo-data.js",):
        p = dst / stale
        if p.exists():
            p.unlink()


def build_wood_usage() -> None:
    src_dir = SUITE / "department_dashboards" / "static"
    dst = DEMOS / "wood-usage"
    if dst.exists():
        shutil.rmtree(dst, ignore_errors=True)
    dst.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src_dir / "wood-usage" / "index.html", dst / "index.html")
    shutil.copy2(src_dir / "wood-usage" / "app.js", dst / "app.js")
    shutil.copy2(src_dir / "styles.css", dst / "styles.css")
    shutil.copy2(src_dir / "shared.js", dst / "shared.js")
    html = (dst / "index.html").read_text(encoding="utf-8")
    html = strip_company(html)
    html = html.replace("Cut Pricing Forecast", "Wood Usage & Forecast")
    html = html.replace("Wood Usage Dashboard", "Wood Usage & Forecast")
    html = inject_head(
        html,
        ['<link rel="stylesheet" href="acor-theme.css">'],
        [fetch_shim("fixtures.json")],
    )
    html = inject_banner(html)
    # Remove desktop launch affordance noise
    html = html.replace("Open Desktop App", "Demo mode")
    html = html.replace('src="/static/wood-usage/app.js"', 'src="app.js"')
    html = html.replace('src="/static/shared.js"', 'src="shared.js"')
    write(dst / "index.html", html)
    write(dst / "acor-theme.css", ACOR_THEME)
    # Patch shared suite nav to demo-local links
    shared = (dst / "shared.js").read_text(encoding="utf-8")
    shared = shared.replace("Timberland", "Acor")
    shared = re.sub(
        r"function renderSuiteNav\([\s\S]*?^\}\n",
        "function renderSuiteNav(_active = '') {\n"
        "  return `<nav class=\"suite-nav\">"
        "<a href=\"../cut-health/\">Cut</a>"
        "<a href=\"../pallet-locator/\">Pallet Locator</a>"
        "<a href=\"../wood-usage/\">Wood Usage</a>"
        "<a href=\"../warehouse-mapper/\">Warehouse</a>"
        "</nav>`;\n}\n",
        shared,
        count=1,
        flags=re.M,
    )
    write(dst / "shared.js", shared)

    jobs = [
        {
            "po_number": f"JOB-{2140 + i}",
            "order_number": f"ORD-{100 + i}",
            "scheduled_departure_date": f"2026-07-{8 + (i % 10):02d}",
            "firm_date": f"2026-07-{5 + (i % 10):02d}",
            "stage": ["Upcoming", "In cut", "Cut complete"][i % 3],
            "evidence": "demo fixture",
            "cabinet_count": 4 + i,
            "forecast_price": round(1200 + i * 85.5, 2),
            "pricing_ready": i % 4 != 0,
            "coverage_percent": 100 if i % 4 else 78,
        }
        for i in range(12)
    ]
    calculate = {
        "ok": True,
        "rows": [
            {"sku": "DEMO-B36", "qty": 3, "pw05": 1.2, "pw075": 0.8, "machine_min": 18},
            {"sku": "DEMO-W3624", "qty": 2, "pw05": 0.6, "pw075": 0.4, "machine_min": 12},
            {"sku": "DEMO-CB33", "qty": 1, "pw05": 0.9, "pw075": 0.5, "machine_min": 9},
        ],
        "totals": {"pw05": 2.7, "pw075": 1.7, "machine_min": 39},
        "pricing": {
            "available": True,
            "pricing_standard_value": 1840.0,
            "rates": {"machine_hour": 85.0},
        },
        "unknown": ["UNKNOWN-99"],
    }
    fixtures = {
        "default": {"ok": True, "demo": True, "items": [], "count": 0},
        "routes": {
            "GET /api/wood-usage/overview": {
                "ok": True,
                "totals": {"product_mappings": 742},
                "top_missing_items": [
                    {"item_number": "DEMO-X1", "search_count": 4, "status": "pending", "last_seen": "2026-07-01"}
                ],
                "recent_calculations": [],
                "data_files": {
                    "calculation_history": {"exists": True, "modified_at": "2026-07-01"},
                    "woodusage_db": {"exists": True, "size_bytes": 512000},
                },
            },
            "GET /api/wood-usage/history": {
                "ok": True,
                "items": [
                    {"timestamp": "2026-07-01T09:00:00", "sku_count": 12, "pw05": 4.2, "pw075": 2.1},
                    {"timestamp": "2026-06-30T15:00:00", "sku_count": 8, "pw05": 2.8, "pw075": 1.4},
                ],
            },
            "GET /api/wood-usage/pending": {
                "ok": True,
                "count": 4,
                "items": [
                    {"item_number": "DEMO-X1", "type": "base", "pw05": 0, "pw075": 0, "submitted_at": "2026-07-01"},
                ],
            },
            "GET /api/wood-usage/job-pricing": {
                "ok": True,
                "jobs": jobs,
                "displayed_count": len(jobs),
                "counts": {
                    "all": len(jobs),
                    "upcoming": sum(1 for j in jobs if j["stage"] == "Upcoming"),
                    "in_cut": sum(1 for j in jobs if j["stage"] == "In cut"),
                    "cut_complete": sum(1 for j in jobs if j["stage"] == "Cut complete"),
                    "pricing_ready": sum(1 for j in jobs if j.get("pricing_ready")),
                },
                "source": {"refreshed_at": "2026-07-01T08:30:00"},
                "evidence_note": "Sanitized portfolio fixture",
            },
            "GET /api/wood-usage/forecast": {
                "ok": True,
                "days": 7,
                "items": [],
                "pricing_standard": {
                    "available": True,
                    "pricing_standard_value": 2140.0,
                    "rates": {"machine_hour": 85.0},
                },
            },
            "GET /api/wood-usage/find-similar": {
                "ok": True,
                "items": [
                    {"item_number": "DEMO-B30", "family": "base"},
                    {"item_number": "DEMO-B36", "family": "base"},
                ],
            },
            "POST /api/wood-usage/calculate": {
                "ok": True,
                "sku_count": 4,
                "results": [
                    {"sku": "B36[3]", "status": "found", "resolved_sku": "DEMO-B36", "pw05": 1.2, "pw075": 0.8},
                    {"sku": "W3624[2]", "status": "found", "resolved_sku": "DEMO-W3624", "pw05": 0.6, "pw075": 0.4},
                    {"sku": "CB33", "status": "found", "resolved_sku": "DEMO-CB33", "pw05": 0.9, "pw075": 0.5},
                    {"sku": "UNKNOWN-99", "status": "missing", "resolved_sku": "", "pw05": 0, "pw075": 0},
                ],
                "totals": {"pw05": 2.7, "pw075": 1.7, "machine_min": 39, "found": 3, "pending": 0, "missing": 1},
                "pricing_standard": {
                    "available": True,
                    "pricing_standard_value": 1840.0,
                    "rates": {"machine_hour": 85.0},
                },
                "unknown": ["UNKNOWN-99"],
            },
            "POST /api/wood-usage/export": {"ok": True, "path": "", "demo": True},
            "POST /api/launch-app": {"ok": False, "error": "Desktop launch disabled in portfolio demo."},
            "POST /api/open-path": {"ok": False, "error": "Path open disabled in portfolio demo."},
            "POST /api/*": {"ok": True, "demo": True},
        },
    }
    # job-pricing and find-similar use query strings — matcher uses path without query via split
    write(dst / "fixtures.json", json.dumps(fixtures, indent=2))
    for stale in ("demo-data.js",):
        p = dst / stale
        if p.exists():
            p.unlink()


def build_warehouse_mapper() -> None:
    src = MAPPING / "frontend"
    if not src.exists():
        raise SystemExit(f"Mapping tool frontend not found: {src}")
    dst = DEMOS / "warehouse-mapper"
    if dst.exists():
        shutil.rmtree(dst, ignore_errors=True)
    # Copy core viewer files + modules
    dst.mkdir(parents=True, exist_ok=True)
    for name in ("index.html", "app.js", "styles.css", "workspace.css"):
        if (src / name).exists():
            shutil.copy2(src / name, dst / name)
    shutil.copytree(src / "modules", dst / "modules")
    html = (dst / "index.html").read_text(encoding="utf-8")
    html = strip_company(html)
    html = html.replace("Warehouse Mapping Tool", "Warehouse Mapper")
    html = inject_head(
        html,
        ['<link rel="stylesheet" href="acor-theme.css">'],
        [fetch_shim("fixtures.json"), WAREHOUSE_AUTOLOGIN],
    )
    html = inject_banner(html)
    write(dst / "index.html", html)
    write(dst / "acor-theme.css", ACOR_THEME)

    demo_map = MAPPING / "demo-sandbox" / "Demo_Bulk_Storage.json"
    demo_items = MAPPING / "demo-sandbox" / "Demo_Bulk_Storage_items.json"
    map_data = json.loads(demo_map.read_text(encoding="utf-8"))
    items_data = {}
    if demo_items.exists():
        items_data = json.loads(demo_items.read_text(encoding="utf-8"))

    # Sanitize item numbers in map rack_locations if any
    def scrub(obj):
        if isinstance(obj, dict):
            out = {}
            for k, v in obj.items():
                if k in ("item_number", "sku", "part") and isinstance(v, str) and v and not v.startswith("DEMO-"):
                    out[k] = "DEMO-" + re.sub(r"[^A-Za-z0-9]+", "-", v).strip("-")
                else:
                    out[k] = scrub(v)
            return out
        if isinstance(obj, list):
            return [scrub(x) for x in obj]
        return obj

    map_data = scrub(map_data)
    items_data = scrub(items_data)

    map_payload = {
        "ok": True,
        "loaded": True,
        "current_path": "demo-bulk-storage",
        "map": map_data,
        "items": items_data,
        "warehouse": map_data,
    }
    areas_list = map_data.get("areas") or ["Bulk Demo"]
    layout_items = {
        "ok": True,
        "layout": map_data.get("layout") or {},
        "areas": areas_list,
        "rows": map_data.get("rows") or [],
        "zones": map_data.get("zones") or [],
        "null_spaces": map_data.get("null_spaces") or [],
        "slotted_pallets": map_data.get("slotted_pallets") or [],
        "movable_items": items_data if isinstance(items_data, list) else (items_data.get("items") or items_data.get("movable_items") or []),
    }
    fixtures = {
        "default": {"ok": True, "demo": True},
        "routes": {
            "GET /api/health": {"ok": True, "service": "warehouse-api-host", "backend": "demo", "api_version": "1.2.0"},
            "GET /api/status": {
                "ok": True,
                "service": "warehouse-api-host",
                "backend": "demo",
                "api_version": "1.2.0",
                "capabilities": {"audit": True, "export": False},
                "current_path": "demo-bulk-storage",
                "counts": {"racks": 2, "zones": 1},
            },
            "GET /api/capabilities": {
                "ok": True,
                "capabilities": {"audit": True, "export": False, "admin": False},
            },
            "GET /api/context": {
                "ok": True,
                "place_name": "Demo Place",
                "map_name": "Demo Bulk Storage",
                "published": True,
                "map_version": 1,
            },
            "GET /api/config": {
                "ok": True,
                "areas": areas_list,
                "rows": map_data.get("rows") or [],
                "zones": map_data.get("zones") or [],
                "null_spaces": map_data.get("null_spaces") or [],
                "layout": map_data.get("layout") or {},
                "current_path": "demo-bulk-storage",
            },
            "GET /api/areas": {"ok": True, "areas": areas_list},
            "GET /api/layout-items": layout_items,
            "GET /api/departments": {
                "ok": True,
                "departments": [{"name": "Demo Dept", "areas": areas_list, "people": ["Operator A"]}],
                "unassigned_people": [],
                "auditors": [],
                "people": ["Operator A"],
            },
            "GET /api/maps": {
                "ok": True,
                "maps": [{"id": "demo-bulk", "name": "Demo Bulk Storage", "path": "demo-bulk-storage"}],
            },
            "GET /api/file/maps": {
                "ok": True,
                "maps": [
                    {
                        "name": "Demo Bulk Storage",
                        "path": "demo-bulk-storage",
                        "modified_at": "2026-07-01T08:00:00",
                    }
                ],
                "current_path": "demo-bulk-storage",
            },
            "GET /api/warehouse": {
                "ok": True,
                "warehouse": map_data,
                "slotted_pallets": map_data.get("slotted_pallets") or [],
                "movable_items": layout_items["movable_items"],
            },
            "GET /api/map": {"ok": True, "map": map_data, "items": items_data},
            "GET /api/audit/status": {"ok": True, "active": False, "sessions": []},
            "GET /api/asset-templates": {"ok": True, "templates": []},
            "POST /api/map/load": map_payload,
            "POST /api/file/load": map_payload,
            "POST /api/file/load-latest": map_payload,
            "POST /api/auth/role-session": {
                "ok": True,
                "token": "demo-token",
                "role": "user",
            },
            "POST /api/*": {"ok": True, "demo": True, "message": "Demo mode — writes disabled."},
        },
    }
    # Also expose map JSON statically for debugging
    write(dst / "demo-map.json", json.dumps(map_data, indent=2))
    write(dst / "fixtures.json", json.dumps(fixtures, indent=2))
    for stale in ("demo-items.json", "README.md", "app.js.bak"):
        pass
    # Remove old knockoff-only files if we overwrote app.js already
    readme = dst / "README.md"
    write(
        readme,
        "# Warehouse Mapper — real product UI (sanitized)\n\n"
        "Port of Mapping tool `frontend/` with Demo_Bulk_Storage fixtures and a static API shim.\n",
    )


def main() -> None:
    print("Building cut-health…")
    build_cut_health()
    print("Building pallet-locator…")
    build_pallet_locator()
    print("Building wood-usage…")
    build_wood_usage()
    print("Building warehouse-mapper…")
    build_warehouse_mapper()
    print("Done. Demos are real UI + sanitized fixtures under", DEMOS)


if __name__ == "__main__":
    main()
