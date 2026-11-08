"""Run the production nester on fictional cabinets and write the site data.

Sides are not rotated. A side 84 inches or taller is turned 180 degrees only
when its toe kick would otherwise sit at the far end of the table.
Shelves never enter the nester. Hand-cut strips may use space already opened.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

SUITE = Path(r"C:\Users\drbobbitt\timberland suite\Timberland_Suite")
sys.path.insert(0, str(SUITE))

from cut.services.direct_tap.nesting import (  # noqa: E402
    TURN_KEY,
    NestPart,
    nest_parts,
    validate_nest,
    _best_fit,
    _place,
)

NOTCH_H = 4.5
NOTCH_D = 3.5
PITCH = 32 / 25.4
OUT = Path(__file__).resolve().parent / "nests.json"


def part(part_id: str, name: str, kind: str, length: float, width: float, route: str, turn: bool = False, face: str | None = None) -> NestPart:
    return NestPart(
        part_id=part_id,
        length=length,
        width=width,
        thickness=0.5,
        material=".5 STD",
        rotate_allowed=False,
        source_name=name,
        metadata={"name": name, "kind": kind, "face": face or kind, "route": route, TURN_KEY: turn},
    )


def cabinet(kind: str, index: int) -> list[NestPart]:
    tag = f"{kind}-{index}"
    if kind == "b24":
        return [
            part(f"{tag}-sl", "Left side", "side-l", 34.5, 24, "machine"),
            part(f"{tag}-sr", "Right side", "side-r", 34.5, 24, "machine"),
            part(f"{tag}-bot", "Bottom", "panel", 22.5, 23, "machine", face="deck"),
            part(f"{tag}-back", "Back", "panel", 30, 23, "machine", face="back"),
            part(f"{tag}-rail", "Rail", "strip", 3.5, 23, "hand"),
            part(f"{tag}-nail", "Nailer", "strip", 3.5, 23, "hand"),
            part(f"{tag}-str", "Stretcher", "strip", 3.5, 23, "hand"),
            part(f"{tag}-toe", "Toe kick", "strip", 4, 23, "hand"),
            part(f"{tag}-shelf", "Shelf", "panel", 22.5, 23, "saw"),
        ]
    if kind == "w30":
        return [
            part(f"{tag}-sl", "Left side", "panel", 30, 12, "machine", face="side-l"),
            part(f"{tag}-sr", "Right side", "panel", 30, 12, "machine", face="side-r"),
            part(f"{tag}-top", "Top", "panel", 12, 29, "machine", face="deck"),
            part(f"{tag}-bot", "Bottom", "panel", 12, 29, "machine", face="deck"),
            part(f"{tag}-back", "Back", "panel", 29, 29, "machine", face="back"),
            part(f"{tag}-nail", "Nailer", "strip", 3, 29, "hand"),
            part(f"{tag}-shelf", "Shelf", "panel", 11, 29, "saw"),
        ]
    if kind == "t24":
        return [
            part(f"{tag}-sl", "Left side", "side-l", 84, 24, "machine", turn=False),
            part(f"{tag}-sr", "Right side", "side-r", 84, 24, "machine", turn=True),
            part(f"{tag}-bot", "Bottom", "panel", 22.5, 23, "machine", face="deck"),
            part(f"{tag}-top", "Top", "panel", 22.5, 23, "machine", face="deck"),
            part(f"{tag}-back", "Back", "panel", 78, 23, "machine", face="back"),
            part(f"{tag}-rail", "Rail", "strip", 3.5, 23, "hand"),
            part(f"{tag}-nail", "Nailer", "strip", 3.5, 23, "hand"),
            part(f"{tag}-toe", "Toe kick", "strip", 4, 23, "hand"),
            part(f"{tag}-sh1", "Shelf", "panel", 22.5, 23, "saw"),
            part(f"{tag}-sh2", "Shelf", "panel", 22.5, 23, "saw"),
            part(f"{tag}-sh3", "Shelf", "panel", 22.5, 23, "saw"),
        ]
    raise KeyError(kind)


def local_outline(item: NestPart) -> list[tuple[float, float]]:
    width = item.width
    length = item.length
    kind = item.metadata["kind"]
    if kind == "side-l":
        points = [
            (NOTCH_D, 0.0), (width, 0.0), (width, length),
            (0.0, length), (0.0, NOTCH_H), (NOTCH_D, NOTCH_H),
        ]
    elif kind == "side-r":
        points = [
            (0.0, 0.0), (width, 0.0), (width, length - NOTCH_H),
            (width - NOTCH_D, length - NOTCH_H), (width - NOTCH_D, length), (0.0, length),
        ]
    else:
        points = [(0.0, 0.0), (width, 0.0), (width, length), (0.0, length)]
    if item.metadata.get(TURN_KEY):
        points = [(width - x, length - y) for x, y in points]
    return points


def local_ops(item: NestPart) -> list[tuple]:
    """Grooves and shelf-pin rows in the part's own plane.

    A side gets the top, bottom, and rear grooves plus two 32 mm pin rows.
    A back gets its grooves, and a base back gets the drawer-glide holes.
    A deck gets the back groove. A hand-cut strip gets nothing.
    """
    if item.metadata["route"] != "machine":
        return []
    width = item.width
    length = item.length
    face = item.metadata["face"]
    if face in {"side-l", "side-r"}:
        toe = item.metadata["kind"] in {"side-l", "side-r"}
        top_y = length - 1
        bottom_y = 4.5 if toe else 1.0
        ops: list[tuple] = [
            ("line", 0.0, top_y, width, top_y),
            ("line", 0.0, bottom_y, width, bottom_y),
        ]
        if face == "side-l":
            ops.append(("line", width - 0.75, 0.0, width - 0.75, length))
            rows = (2.5, width - 2.75)
        else:
            ops.append(("line", 0.75, 0.0, 0.75, length))
            rows = (width - 2.5, 2.75)
        y = length - (12 if length >= 34 else 8)
        y_min = 11 if length >= 34 else 5
        while y >= y_min - 1e-6:
            for x in rows:
                in_left_notch = toe and face == "side-l" and x < NOTCH_D and y < NOTCH_H
                in_right_notch = toe and face == "side-r" and x > width - NOTCH_D and y > length - NOTCH_H
                if not in_left_notch and not in_right_notch:
                    ops.append(("hole", x, y))
            y -= PITCH
        return ops
    if face == "back":
        lower = 1.5 if abs(width - length) < 1 else 2.5
        ops = [
            ("line", 0.0, length - 1, width, length - 1),
            ("line", 0.0, lower, width, lower),
        ]
        if 28 <= length <= 36 and width <= 26:
            inner_top = length - 6
            inner_bottom = inner_top - 2.5
            for x_ratio, drop in ((0.09, 0.9), (0.17, 0.0), (0.83, 0.0), (0.91, 0.9)):
                ops.append(("hole", width * x_ratio, inner_top - drop))
                ops.append(("hole", width * x_ratio, inner_bottom - drop))
        return ops
    if face == "deck":
        return [("line", 0.0, length - 0.75, width, length - 0.75)]
    return []


def map_point(placement, x: float, y: float) -> list[float]:
    item = placement.part
    if item.metadata.get(TURN_KEY):
        x, y = item.width - x, item.length - y
    return [round(placement.x + x, 4), round(placement.y + y, 4)]


def sheet_ops(placement) -> list[dict]:
    marks = []
    for op in local_ops(placement.part):
        if op[0] == "line":
            marks.append({"t": "line", "a": map_point(placement, op[1], op[2]), "b": map_point(placement, op[3], op[4])})
        else:
            marks.append({"t": "hole", "c": map_point(placement, op[1], op[2])})
    return marks


def sheet_points(placement) -> list[list[float]]:
    if placement.rotated:
        raise RuntimeError(f"{placement.part.part_id} was rotated")
    return [
        [round(placement.x + x, 4), round(placement.y + y, 4)]
        for x, y in local_outline(placement.part)
    ]


def place_hands(sheets, hands: list[NestPart]) -> tuple[list[NestPart], list[NestPart]]:
    placed: list[NestPart] = []
    rejected: list[NestPart] = []
    for hand in hands:
        found = False
        for sheet in sheets:
            fit = _best_fit(sheet, hand)
            if fit is None:
                continue
            _place(sheet, hand, fit)
            placed.append(hand)
            found = True
            break
        if not found:
            rejected.append(hand)
    return placed, rejected


def run_order(counts: dict[str, int]) -> dict:
    pieces: list[NestPart] = []
    for kind, count in counts.items():
        for index in range(count):
            pieces.extend(cabinet(kind, index + 1))
    machine = [item for item in pieces if item.metadata["route"] == "machine"]
    hands = [item for item in pieces if item.metadata["route"] == "hand"]
    saw = [item for item in pieces if item.metadata["route"] == "saw"]
    sheets = nest_parts(machine) if machine else []
    validate_nest(machine, sheets)
    absorbed, leftover = place_hands(sheets, hands)
    if absorbed:
        validate_nest(machine + absorbed, sheets)
    payload_sheets = []
    for number, sheet in enumerate(sheets, start=1):
        payload_sheets.append({
            "number": number,
            "width": sheet.width,
            "length": sheet.length,
            "parts": [
                {
                    "name": placement.part.metadata["name"],
                    "route": placement.part.metadata["route"],
                    "kind": placement.part.metadata["kind"],
                    "points": sheet_points(placement),
                    "ops": sheet_ops(placement),
                    "length": placement.part.length,
                    "turned": bool(placement.reversed),
                }
                for placement in sheet.placements
            ],
        })
    saw_rows: dict[str, int] = {}
    for item in saw + leftover:
        saw_rows[item.metadata["name"]] = saw_rows.get(item.metadata["name"], 0) + 1
    return {
        "sheets": payload_sheets,
        "saw": [{"name": name, "qty": saw_rows[name]} for name in sorted(saw_rows)],
        "metrics": {
            "sheets": len(sheets),
            "machine": len(machine),
            "absorbed": len(absorbed),
            "saw": len(saw) + len(leftover),
            "utilization": round(sum(sheet.utilization for sheet in sheets) / len(sheets), 4) if sheets else 0,
        },
    }


def main() -> None:
    orders = {}
    for b24 in range(5):
        for w30 in range(5):
            for t24 in range(5):
                key = f"{b24},{w30},{t24}"
                orders[key] = run_order({"b24": b24, "w30": w30, "t24": t24}) if any((b24, w30, t24)) else {
                    "sheets": [],
                    "saw": [],
                    "metrics": {"sheets": 0, "machine": 0, "absorbed": 0, "saw": 0, "utilization": 0},
                }
    OUT.write_text(json.dumps(orders, separators=(",", ":")), encoding="utf-8")
    sample = orders["2,1,0"]
    placed = [part for sheet in sample["sheets"] for part in sheet["parts"]]
    if any(part["route"] == "machine" and not part["ops"] for part in placed):
        raise RuntimeError("a machined part has no operation")
    if any(part["route"] != "machine" and part["ops"] for part in placed):
        raise RuntimeError("a hand cut was given machining")
    print("orders", len(orders), "sample sheets", sample["metrics"])


if __name__ == "__main__":
    main()
