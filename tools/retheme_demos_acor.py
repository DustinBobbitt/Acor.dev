"""Retheme portfolio demos to Acor cyan/violet brand tokens."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "demos"

CSS_REPLS = [
    ("--bg: #111512;", "--bg: #070b16;"),
    ("--band: #161d19;", "--band: #0c1222;"),
    ("--band-2: #1d2823;", "--band-2: #121a30;"),
    ("--tile: #23312b;", "--tile: #162038;"),
    ("--tile-2: #26382f;", "--tile-2: #1a2744;"),
    ("--border: #385042;", "--border: #3a4a72;"),
    ("--text: #f3f7f2;", "--text: #edf1ff;"),
    ("--muted: #aebcad;", "--muted: #9eacd4;"),
    ("--accent: #43b67f;", "--accent: #3ad0ff;"),
    ("--accent-2: #60c6ba;", "--accent-2: #b85fff;"),
    ("--selected: #60c6ba;", "--selected: #3ad0ff;"),
    ("--paint: #3d9e6a;", "--paint: #5b8cff;"),
    ("background: #203b2d;", "background: linear-gradient(135deg, #1a3a55, #3a2460);"),
    ("color: #c7f6d7;", "color: #c8f4ff;"),
    ("background: #254633;", "background: #1a2a48;"),
    ("background: #2f5840;", "background: #243868;"),
    ("background: #121a15;", "background: #0a1020;"),
    ("background: #111813;", "background: #0a1020;"),
    ("background: #1a241f;", "background: #121a30;"),
    ("background: #1a241e;", "background: #121a30;"),
    ("background: #0c100e;", "background: #050812;"),
    ("color: #b8f2d0;", "color: #c8f4ff;"),
    ("border-color: #2f6b4d;", "border-color: #3a6a9a;"),
    ("background: rgba(67, 182, 127, 0.12);", "background: rgba(58, 208, 255, 0.12);"),
    ("background: rgba(96, 198, 186, 0.05);", "background: rgba(58, 208, 255, 0.06);"),
    ("background: rgba(8, 12, 9, 0.76);", "background: rgba(7, 11, 22, 0.82);"),
    ("border-top: 1px solid rgba(56, 80, 66, 0.55);", "border-top: 1px solid rgba(58, 74, 114, 0.55);"),
    ("border: 1px solid rgba(56, 80, 66, 0.7);", "border: 1px solid rgba(58, 74, 114, 0.7);"),
    ("border: 1px solid rgba(67, 182, 127, 0.55);", "border: 1px solid rgba(58, 208, 255, 0.45);"),
    ("border-color: rgba(96, 198, 186, 0.72);", "border-color: rgba(58, 208, 255, 0.72);"),
    (".swatch.rack { background: #3a6b52; }", ".swatch.rack { background: #4a6aaf; }"),
    (".swatch.occupied { background: #2f8a5f; }", ".swatch.occupied { background: #3ad0ff; }"),
    (".swatch.placed { background: #3a6b52; }", ".swatch.placed { background: #4a6aaf; }"),
    (
        ".bay-cell.occupied { border-color: #2f6b4d; background: #1c3328; }",
        ".bay-cell.occupied { border-color: #3a6a9a; background: #152848; }",
    ),
    (
        ".pill.ok { color: #c7f6d7; border-color: #2f6b4d; }",
        ".pill.ok { color: #c8f4ff; border-color: #3a6a9a; }",
    ),
    ("bulb-gray { background: #7f8b83; }", "bulb-gray { background: #7a8499; }"),
]

JS_REPLS = [
    ('"#0c100e"', '"#050812"'),
    ('"#17221c"', '"#0e1628"'),
    ('"#385042"', '"#3a4a72"'),
    ('"#aebcad"', '"#9eacd4"'),
    ('"#24352c"', '"#1a2744"'),
    ('"#8ea392"', '"#8ea0c8"'),
    ('"#1c2a23"', '"#152038"'),
    ('"#456352"', '"#4a5f9a"'),
    ('"#c7d6c8"', '"#c8d4ff"'),
    ('"#2f6f66"', '"#2a6a9a"'),
    ('"#2f6b4d"', '"#3a6a9a"'),
    ('"#3a6b52"', '"#4a6aaf"'),
    ('"#121a16"', '"#0a1020"'),
    ('"#60c6ba"', '"#3ad0ff"'),
    ('"#2a3d33"', '"#2a3a5a"'),
    ('"#f3f7f2"', '"#edf1ff"'),
    ('"#4d6356"', '"#5a6a9a"'),
    ('"rgba(67,182,127,0.12)"', '"rgba(58,208,255,0.14)"'),
    ('"#1a2220"', '"#101828"'),
    ('"#141a17"', '"#0c1220"'),
    ('"#2a3a48"', '"#2a3a58"'),
    ('"#1e2a24"', '"#162038"'),
    ('"#1a2820"', '"#152038"'),
    ('"#4a6a55"', '"#4a6aaf"'),
    ('"#1f2e27"', '"#1a2744"'),
    ('"#508060"', '"#5080c0"'),
    ('"#c7f6d7"', '"#c8f4ff"'),
    ('"#1a2420"', '"#121a30"'),
    ('"#2a4a38"', '"#1a3a5a"'),
    ('"#43b67f"', '"#3ad0ff"'),
    ('"#2a4f3d"', '"#1a3a68"'),
    ('"#1e3a2c"', '"#152848"'),
    ('"#1a2a22"', '"#121a30"'),
    ('"#2f4a3c"', '"#2f4a7c"'),
]


def apply(path: Path, repls: list[tuple[str, str]]) -> bool:
    text = path.read_text(encoding="utf-8")
    orig = text
    for old, new in repls:
        text = text.replace(old, new)
    if text != orig:
        path.write_text(text, encoding="utf-8")
        return True
    return False


def main() -> None:
    for css in ROOT.rglob("styles.css"):
        changed = apply(css, CSS_REPLS)
        print(("updated" if changed else "unchanged"), css.relative_to(ROOT))
    for js in ROOT.rglob("app.js"):
        changed = apply(js, JS_REPLS)
        print(("updated" if changed else "unchanged"), js.relative_to(ROOT))


if __name__ == "__main__":
    main()
