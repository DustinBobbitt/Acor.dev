/* Demonstration model. Not the production nester.
   Same order always yields the same sheets, counts, and paperwork.
   Machine parts open sheets. Hand cuts may use only space already opened.
   Shelves stay on the saw. */
(function (root) {
  var SHEET_W = 48;
  var SHEET_L = 96;
  var KERF = 0.25;
  var NOTCH_H = 4.5;
  var NOTCH_D = 3.5;

  function side(hand, height, depth) {
    return {
      name: hand === "L" ? "Left side" : "Right side",
      kind: hand === "L" ? "side-l" : "side-r",
      w: depth,
      h: height,
      route: "machine",
      notch: { along: NOTCH_H, into: NOTCH_D },
      ops: ["Toe-kick notch", "Top dado", "Bottom dado", "Rear groove", "Shelf bores"]
    };
  }

  function panel(name, w, h, route, ops) {
    return { name: name, kind: "panel", w: w, h: h, route: route, notch: null, ops: ops || [] };
  }

  function strip(name, w, h, route) {
    return { name: name, kind: "strip", w: w, h: h, route: route, notch: null, ops: [] };
  }

  var PRODUCTS = [
    {
      id: "b24",
      name: "Base 24",
      detail: "34½ high · 24 wide · 24 deep",
      build: function () {
        return [
          side("L", 34.5, 24), side("R", 34.5, 24),
          panel("Bottom", 23, 22.5, "machine", ["Front groove"]),
          panel("Back", 23, 30, "machine", []),
          strip("Rail", 23, 3.5, "machine"),
          strip("Nailer", 23, 3.5, "hand"),
          strip("Stretcher", 23, 3.5, "hand"),
          strip("Toe kick", 23, 4, "hand"),
          panel("Shelf", 23, 22.5, "saw", [])
        ];
      }
    },
    {
      id: "b30",
      name: "Base 30",
      detail: "34½ high · 30 wide · 24 deep",
      build: function () {
        return [
          side("L", 34.5, 24), side("R", 34.5, 24),
          panel("Bottom", 29, 22.5, "machine", ["Front groove"]),
          panel("Back", 29, 30, "machine", []),
          strip("Rail", 29, 3.5, "machine"),
          strip("Nailer", 29, 3.5, "hand"),
          strip("Stretcher", 29, 3.5, "hand"),
          strip("Toe kick", 29, 4, "hand"),
          panel("Shelf", 29, 22.5, "saw", [])
        ];
      }
    },
    {
      id: "w30",
      name: "Wall 30",
      detail: "30 high · 30 wide · 12 deep",
      build: function () {
        return [
          panel("Left side", 12, 30, "machine", ["Top dado", "Bottom dado", "Rear groove", "Shelf bores"]),
          panel("Right side", 12, 30, "machine", ["Top dado", "Bottom dado", "Rear groove", "Shelf bores"]),
          panel("Top", 29, 12, "machine", []),
          panel("Bottom", 29, 12, "machine", []),
          panel("Back", 29, 29, "machine", []),
          strip("Nailer", 29, 3, "hand"),
          panel("Shelf", 29, 11, "saw", [])
        ];
      }
    },
    {
      id: "d18",
      name: "Drawer base 18",
      detail: "34½ high · 18 wide · 24 deep",
      build: function () {
        return [
          side("L", 34.5, 24), side("R", 34.5, 24),
          panel("Bottom", 17, 22.5, "machine", ["Front groove"]),
          panel("Back", 17, 30, "machine", []),
          strip("Rail", 17, 3.5, "machine"),
          strip("Stretcher", 17, 3.5, "hand"),
          strip("Stretcher", 17, 3.5, "hand"),
          strip("Nailer", 17, 3.5, "hand"),
          strip("Toe kick", 17, 4, "hand")
        ];
      }
    },
    {
      id: "t24",
      name: "Tall pantry 24",
      detail: "84 high · 24 wide · 24 deep",
      build: function () {
        return [
          side("L", 84, 24), side("R", 84, 24),
          panel("Bottom", 23, 22.5, "machine", ["Front groove"]),
          panel("Top", 23, 22.5, "machine", []),
          panel("Back", 23, 78, "machine", []),
          strip("Rail", 23, 3.5, "machine"),
          strip("Nailer", 23, 3.5, "hand"),
          strip("Toe kick", 23, 4, "hand"),
          panel("Shelf", 23, 22.5, "saw", []),
          panel("Shelf", 23, 22.5, "saw", []),
          panel("Shelf", 23, 22.5, "saw", [])
        ];
      }
    }
  ];

  var DEFAULT_QTY = { b24: 2, b30: 0, w30: 1, d18: 1, t24: 0 };

  function areaOf(part) {
    var box = part.w * part.h;
    if (!part.notch) return box;
    return box - part.notch.along * part.notch.into;
  }

  function explode(qty) {
    var parts = [];
    var cabinets = 0;
    PRODUCTS.forEach(function (product) {
      var count = Math.max(0, Math.min(4, qty[product.id] | 0));
      var n;
      for (n = 0; n < count; n += 1) {
        cabinets += 1;
        var cab = cabinets;
        product.build().forEach(function (part, index) {
          parts.push({
            id: product.id + "-" + cab + "-" + index,
            product: product.name,
            cabinet: cab,
            name: part.name,
            kind: part.kind,
            w: part.w,
            h: part.h,
            route: part.route,
            notch: part.notch,
            ops: part.ops.slice()
          });
        });
      }
    });
    return { cabinets: cabinets, parts: parts };
  }

  function fits(free, w, h) {
    return free.w + 1e-6 >= w && free.h + 1e-6 >= h;
  }

  function place(sheet, part) {
    var options = [
      { w: part.w, h: part.h, rot: false },
      { w: part.h, h: part.w, rot: true }
    ];
    var best = null;
    sheet.free.forEach(function (free, index) {
      options.forEach(function (opt) {
        var pw = opt.w + KERF;
        var ph = opt.h + KERF;
        if (!fits(free, pw, ph)) return;
        var waste = free.w * free.h - pw * ph;
        if (!best || waste < best.waste || (waste === best.waste && index < best.index)) {
          best = { index: index, w: opt.w, h: opt.h, rot: opt.rot, pw: pw, ph: ph, waste: waste };
        }
      });
    });
    if (!best) return false;
    var free = sheet.free.splice(best.index, 1)[0];
    sheet.placed.push({
      part: part,
      x: free.x,
      y: free.y,
      w: best.w,
      h: best.h,
      rot: best.rot
    });
    var right = free.w - best.pw;
    var below = free.h - best.ph;
    if (right > 0.2) sheet.free.push({ x: free.x + best.pw, y: free.y, w: right, h: best.ph });
    if (below > 0.2) sheet.free.push({ x: free.x, y: free.y + best.ph, w: free.w, h: below });
    return true;
  }

  function pack(parts, sheets, allowNew) {
    var placed = [];
    var rejected = [];
    parts.forEach(function (part) {
      var found = false;
      var i;
      for (i = 0; i < sheets.length; i += 1) {
        if (place(sheets[i], part)) {
          placed.push(part);
          found = true;
          break;
        }
      }
      if (!found && allowNew) {
        var sheet = { free: [{ x: 0, y: 0, w: SHEET_W, h: SHEET_L }], placed: [] };
        if (place(sheet, part)) {
          sheets.push(sheet);
          placed.push(part);
          found = true;
        }
      }
      if (!found) rejected.push(part);
    });
    return { placed: placed, rejected: rejected };
  }

  function byArea(a, b) {
    return (b.w * b.h) - (a.w * a.h) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  }

  function nest(parts) {
    var machine = parts.filter(function (part) { return part.route === "machine"; }).sort(byArea);
    var hand = parts.filter(function (part) { return part.route === "hand"; }).sort(byArea);
    var saw = parts.filter(function (part) { return part.route === "saw"; });
    var sheets = [];
    pack(machine, sheets, true);
    var absorbed = pack(hand, sheets, false);
    var traditional = [];
    pack(hand, traditional, true);
    return {
      sheets: sheets,
      absorbed: absorbed.placed,
      saw: saw.concat(absorbed.rejected),
      traditionalSheets: traditional.length
    };
  }

  function inches(n) {
    return (Math.round(n * 1000) / 1000).toFixed(3);
  }

  function mm(n) {
    return (Math.round(n * 25.4 * 1000) / 1000).toFixed(3);
  }

  function programs(sheets) {
    return sheets.map(function (sheet, index) {
      var number = index + 1;
      var tap = [
        "(DEMONSTRATION TAP " + number + " — INCHES — OMNI)",
        "G20",
        "G90",
        "T1 M6",
        "G43 H1"
      ];
      var nc = [
        "%",
        "(DEMONSTRATION NC " + number + " — MILLIMETRES — PYTHON)",
        "G21 G90 G17"
      ];
      sheet.placed.forEach(function (item) {
        tap.push("( " + item.part.name + " )");
        tap.push("G0 X" + inches(item.x) + " Y" + inches(item.y));
        tap.push("G1 X" + inches(item.x + item.w) + " Y" + inches(item.y + item.h) + " F80.");
        nc.push("G0 X" + mm(item.x) + " Y" + mm(item.y));
        nc.push("G1 Z-2.0 F800.");
        nc.push("G1 X" + mm(item.x + item.w) + " Y" + mm(item.y + item.h) + " F2000.");
        nc.push("G0 Z5.0");
      });
      tap.push("M30");
      nc.push("M30");
      nc.push("%");
      return {
        sheet: number,
        tap: tap.join("\n"),
        nc: nc.join("\n"),
        tapLines: tap.length,
        ncLines: nc.length
      };
    });
  }

  function build(qty) {
    var exploded = explode(qty || DEFAULT_QTY);
    var result = nest(exploded.parts);
    var nestedArea = 0;
    result.sheets.forEach(function (sheet) {
      sheet.placed.forEach(function (item) {
        nestedArea += areaOf(item.part);
      });
    });
    var opened = result.sheets.length;
    var sheetArea = SHEET_W * SHEET_L;
    var smartUse = opened ? nestedArea / (opened * sheetArea) : 0;
    var machineOnly = 0;
    result.sheets.forEach(function (sheet) {
      sheet.placed.forEach(function (item) {
        if (item.part.route === "machine") machineOnly += areaOf(item.part);
      });
    });
    var traditionalOpened = opened + result.traditionalSheets;
    var traditionalUse = traditionalOpened ? (machineOnly + result.absorbed.reduce(function (sum, part) {
      return sum + areaOf(part);
    }, 0)) / (traditionalOpened * sheetArea) : 0;
    return {
      cabinets: exploded.cabinets,
      parts: exploded.parts,
      sheets: result.sheets,
      absorbed: result.absorbed,
      saw: result.saw,
      programs: programs(result.sheets),
      metrics: {
        sheets: opened,
        extraSheetsAvoided: result.traditionalSheets,
        nested: result.sheets.reduce(function (sum, sheet) {
          return sum + sheet.placed.filter(function (item) { return item.part.route === "machine"; }).length;
        }, 0),
        absorbed: result.absorbed.length,
        saw: result.saw.length,
        utilization: smartUse,
        traditionalUtilization: traditionalUse
      }
    };
  }

  var api = {
    PRODUCTS: PRODUCTS,
    DEFAULT_QTY: DEFAULT_QTY,
    SHEET_W: SHEET_W,
    SHEET_L: SHEET_L,
    build: build,
    areaOf: areaOf
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OrderModel = api;
})(typeof window !== "undefined" ? window : globalThis);
