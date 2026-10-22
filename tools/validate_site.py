"""Static checks for Acor.dev's public pages."""

from __future__ import annotations

import json
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
from xml.etree import ElementTree


ROOT = Path(__file__).resolve().parents[1]
BANNED_CLAIMS = (
    "same tools the floor uses",
    "real product ui",
    "machine-ready outputs, not mockups",
    "the suite has since moved",
    "site direction",
    "now web-based",
    "autocad",
    "fusion 360",
    "fusion tooling",
)


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.assets: list[str] = []
        self.h1_count = 0
        self.canonicals: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == "h1":
            self.h1_count += 1
        if tag in {"a", "link"} and values.get("href"):
            self.assets.append(values["href"] or "")
        if tag in {"img", "script", "source", "iframe"} and values.get("src"):
            self.assets.append(values["src"] or "")
        if tag == "link" and values.get("rel") == "canonical" and values.get("href"):
            self.canonicals.append(values["href"] or "")


def local_target(page: Path, reference: str) -> Path | None:
    parsed = urlsplit(reference)
    if parsed.scheme or parsed.netloc or reference.startswith(("mailto:", "tel:", "#")):
        return None
    path_text = unquote(parsed.path)
    if not path_text:
        return None
    candidate = ROOT / path_text.lstrip("/") if path_text.startswith("/") else page.parent / path_text
    candidate = candidate.resolve()
    if candidate.is_dir():
        candidate = candidate / "index.html"
    return candidate


def validate_shared_scenario(errors: list[str]) -> None:
    fixture = ROOT / "demos" / "shared" / "manufacturing-day.json"
    try:
        scenario = json.loads(fixture.read_text(encoding="utf-8"))
    except Exception as exc:  # pragma: no cover - diagnostics only
        errors.append(f"{fixture.relative_to(ROOT)}: invalid shared scenario: {exc}")
        return

    jobs = scenario.get("jobs", [])
    expected = scenario.get("expected", {})
    by_id = {job.get("job_id"): job for job in jobs}
    if len(by_id) != len(jobs) or None in by_id:
        errors.append("demos/shared/manufacturing-day.json: job identities must be present and unique")

    actual_totals = {
        "job_count": len(jobs),
        "cabinet_count": sum(int(job.get("cabinet_count", 0)) for job in jobs),
        "held_job_count": sum(str(job.get("state", "")).startswith(("held_", "blocked_")) for job in jobs),
        "eligible_cabinet_count": sum(int(job.get("cabinet_count", 0)) for job in jobs if job.get("state") == "eligible"),
        "generated_not_released_cabinet_count": sum(int(job.get("cabinet_count", 0)) for job in jobs if job.get("state") == "generated_awaiting_release"),
        "released_not_loaded_cabinet_count": sum(int(job.get("cabinet_count", 0)) for job in jobs if job.get("state") == "released_awaiting_station_load"),
        "location_missing_cabinet_count": sum(int(job.get("cabinet_count", 0)) for job in jobs if job.get("state") == "cut_location_missing"),
        "recut_cabinet_count": sum(int(job.get("cabinet_count", 0)) for job in jobs if job.get("state") == "recut_requested"),
    }
    for key, actual in actual_totals.items():
        if expected.get(key) != actual:
            errors.append(f"demos/shared/manufacturing-day.json: {key} expected {expected.get(key)!r}, calculated {actual}")

    supported = by_id.get("DEMO-1042", {}).get("pipeline", {})
    if supported.get("sheet_count", 0) < 1:
        errors.append("demos/shared/manufacturing-day.json: DEMO-1042 needs canonical sheets")
    for format_name in ("tap", "xpr"):
        outcome = supported.get(format_name, {})
        if outcome.get("status") != "validated" or not outcome.get("hash"):
            errors.append(f"demos/shared/manufacturing-day.json: DEMO-1042 {format_name} must be independently validated and hashed")

    request = by_id.get("DEMO-1042", {}).get("request", {})
    if not set(request.get("requested_items", [])).issubset(set(by_id.get("DEMO-1042", {}).get("items", []))):
        errors.append("demos/shared/manufacturing-day.json: DEMO-1042 request must use exact job item identities")
    for key in ("request_hash", "frozen_input_hash", "receipt_hash"):
        if not request.get(key):
            errors.append(f"demos/shared/manufacturing-day.json: DEMO-1042 request needs {key}")

    refused = by_id.get("DEMO-1063", {}).get("pipeline", {})
    if refused.get("expected_stop") != "recipe_preflight" or not refused.get("unsupported_operation"):
        errors.append("demos/shared/manufacturing-day.json: DEMO-1063 must stop at recipe preflight")

    station = scenario.get("station", {})
    incoming = by_id.get("DEMO-1054", {})
    manifest = incoming.get("source_manifest", {})
    if station.get("incoming_set_id") != incoming.get("set_id"):
        errors.append("demos/shared/manufacturing-day.json: station incoming set must reference DEMO-1054")
    if manifest.get("program_count") != len(manifest.get("programs", [])):
        errors.append("demos/shared/manufacturing-day.json: DEMO-1054 program count does not match manifest rows")
    if manifest.get("total_bytes") != sum(int(program.get("bytes", 0)) for program in manifest.get("programs", [])):
        errors.append("demos/shared/manufacturing-day.json: DEMO-1054 byte total does not reconcile")


def main() -> int:
    errors: list[str] = []
    html_files = sorted(ROOT.rglob("*.html"))
    for page in html_files:
        text = page.read_text(encoding="utf-8")
        parser = PageParser()
        parser.feed(text)
        if parser.h1_count != 1:
            errors.append(f"{page.relative_to(ROOT)}: expected one h1, found {parser.h1_count}")
        lowered = text.casefold()
        for claim in BANNED_CLAIMS:
            if claim in lowered:
                errors.append(f"{page.relative_to(ROOT)}: stale claim remains: {claim!r}")
        for reference in parser.assets:
            target = local_target(page, reference)
            if target is not None and not target.exists():
                errors.append(f"{page.relative_to(ROOT)}: missing local target {reference!r}")

    for fixture in sorted((ROOT / "demos").rglob("*.json")):
        try:
            json.loads(fixture.read_text(encoding="utf-8"))
        except Exception as exc:  # pragma: no cover - diagnostics only
            errors.append(f"{fixture.relative_to(ROOT)}: invalid JSON: {exc}")

    validate_shared_scenario(errors)

    try:
        ElementTree.parse(ROOT / "sitemap.xml")
    except Exception as exc:  # pragma: no cover - diagnostics only
        errors.append(f"sitemap.xml: invalid XML: {exc}")

    if errors:
        print("Static validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1
    print(f"Static validation passed: {len(html_files)} HTML pages.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
