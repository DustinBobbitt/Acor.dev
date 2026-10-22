"""Static checks for Acor.dev's public pages."""

from __future__ import annotations

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
