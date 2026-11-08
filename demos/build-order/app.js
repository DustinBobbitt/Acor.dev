(function () {
  var products = [
    { id: "b24", name: "Base 24", detail: "34½ × 24 × 24", face: "base" },
    { id: "w30", name: "Wall 30", detail: "30 × 30 × 12", face: "wall" },
    { id: "t24", name: "Tall pantry 24", detail: "84 × 24 × 24", face: "tall" }
  ];
  var qty = { b24: 2, w30: 1, t24: 0 };
  var step = 0;
  var data = null;

  var productsEl = document.querySelector("[data-products]");
  var viewEl = document.querySelector("[data-view]");
  var qtyEl = document.querySelector("[data-qty]");
  var labelEl = document.querySelector("[data-step-label]");
  var nextBtn = document.querySelector("[data-next]");
  var backBtn = document.querySelector("[data-back]");

  function face(kind) {
    if (kind === "wall") {
      return "<svg viewBox=\"0 0 40 48\" aria-hidden=\"true\"><rect x=\"6\" y=\"8\" width=\"28\" height=\"28\" fill=\"none\" stroke=\"#3c3428\" stroke-width=\"1.4\"></rect><line x1=\"20\" y1=\"8\" x2=\"20\" y2=\"36\" stroke=\"#3c3428\" stroke-width=\"1\"></line></svg>";
    }
    var doors = kind === "tall" ? "<line x1=\"8\" y1=\"22\" x2=\"32\" y2=\"22\" stroke=\"#3c3428\" stroke-width=\"1\"></line><line x1=\"20\" y1=\"4\" x2=\"20\" y2=\"38\" stroke=\"#3c3428\" stroke-width=\"1\"></line>" : "<line x1=\"20\" y1=\"4\" x2=\"20\" y2=\"38\" stroke=\"#3c3428\" stroke-width=\"1\"></line>";
    return "<svg viewBox=\"0 0 40 48\" aria-hidden=\"true\"><rect x=\"8\" y=\"4\" width=\"24\" height=\"34\" fill=\"none\" stroke=\"#3c3428\" stroke-width=\"1.4\"></rect>" + doors + "<path d=\"M8 38 H14 V44 H26 V38 H32\" fill=\"none\" stroke=\"#3c3428\" stroke-width=\"1.2\"></path></svg>";
  }

  function key() {
    return products.map(function (product) { return qty[product.id]; }).join(",");
  }

  function order() {
    return data[key()];
  }

  function renderProducts() {
    productsEl.innerHTML = products.map(function (product) {
      return "<article class=\"product\">" + face(product.face) + "<div><strong>" + product.name + "</strong><em>" + product.detail + "</em><div class=\"qty\"><button type=\"button\" data-dec=\"" + product.id + "\" aria-label=\"Fewer " + product.name + "\">−</button><span>" + qty[product.id] + "</span><button type=\"button\" data-inc=\"" + product.id + "\" aria-label=\"More " + product.name + "\">+</button></div></div></article>";
    }).join("");
    var chosen = products.filter(function (product) { return qty[product.id] > 0; });
    qtyEl.textContent = chosen.length ? chosen.map(function (product) { return qty[product.id] + " " + product.name; }).join(" · ") : "Nothing selected";
  }

  function grainDefs(sheet) {
    var id = "grain" + sheet.number;
    return "<filter id=\"" + id + "\" filterUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"" + sheet.width + "\" height=\"" + sheet.length + "\"><feTurbulence type=\"fractalNoise\" baseFrequency=\"0.09 0.012\" numOctaves=\"2\" seed=\"" + (sheet.number + 3) + "\" stitchTiles=\"stitch\"/><feColorMatrix type=\"matrix\" values=\"0 0 0 0 0.62  0 0 0 0 0.48  0 0 0 0 0.32  0 0 0 0.55 0\"/></filter>";
  }

  function operations(item) {
    return (item.ops || []).map(function (op) {
      if (op.t === "line") {
        return "<line x1=\"" + op.a[0] + "\" y1=\"" + op.a[1] + "\" x2=\"" + op.b[0] + "\" y2=\"" + op.b[1] + "\" stroke=\"#8d3a32\" stroke-width=\"1.8\" vector-effect=\"non-scaling-stroke\"></line>";
      }
      return "<circle cx=\"" + op.c[0] + "\" cy=\"" + op.c[1] + "\" r=\"0.1\" fill=\"#8d3a32\" stroke=\"#8d3a32\" stroke-width=\"1.2\" vector-effect=\"non-scaling-stroke\"></circle>";
    }).join("");
  }

  function sheetSvg(sheet, routes) {
    var parts = sheet.parts.filter(function (item) { return routes.indexOf(item.route) !== -1; }).map(function (item, index) {
      var pts = item.points.map(function (point) { return point[0].toFixed(2) + "," + point[1].toFixed(2); }).join(" ");
      var clip = "p" + sheet.number + "x" + index;
      var fill = item.route === "hand" ? "#d7ddd4" : "#ead9bf";
      return "<clipPath id=\"" + clip + "\"><polygon points=\"" + pts + "\"></polygon></clipPath><polygon points=\"" + pts + "\" fill=\"" + fill + "\" stroke=\"#c2b39a\" stroke-width=\"0.12\"></polygon><polygon points=\"" + pts + "\" fill=\"#000\" filter=\"url(#grain" + sheet.number + ")\" opacity=\"0.28\"></polygon><g clip-path=\"url(#" + clip + ")\">" + operations(item) + "</g>";
    }).join("");
    return "<figure class=\"sheet-card\"><svg viewBox=\"0 0 " + sheet.width + " " + sheet.length + "\" role=\"img\" aria-label=\"Sheet " + sheet.number + "\"><defs>" + grainDefs(sheet) + "</defs>" + parts + "</svg><p>Sheet " + sheet.number + "</p></figure>";
  }

  function filesView(current) {
    if (!current.sheets.length) return "<p class=\"file-note\">Choose at least one cabinet.</p>";
    var rows = current.sheets.map(function (sheet) {
      return "<div class=\"file\"><strong>Sheet " + sheet.number + " · TAP</strong><span>Inches · Omni</span></div><div class=\"file\"><strong>Sheet " + sheet.number + " · NC</strong><span>Millimetres · Python</span></div>";
    }).join("");
    return "<div class=\"files\">" + rows + "</div><p class=\"file-note\">Two files from the same placement. TAP is not a renamed NC. These are the files the order produces. They are not shown as a program a machine will run.</p>";
  }

  function nestView(current, withHands) {
    if (!current.sheets.length) return "<p class=\"file-note\">Choose at least one cabinet.</p>";
    var routes = withHands ? ["machine", "hand"] : ["machine"];
    var saw = withHands ? "<div class=\"saw-list\"><p class=\"saw-note\">Still for the saw</p>" + (current.saw.map(function (row) {
      return "<div><span>" + row.name + "</span><span>" + row.qty + "</span></div>";
    }).join("") || "<div><span>Nothing left over</span><span>0</span></div>") + "</div>" : "";
    return "<div class=\"sheet-row\">" + current.sheets.map(function (sheet) { return sheetSvg(sheet, routes); }).join("") + "</div>" + saw;
  }

  function render() {
    try {
      renderBody();
    } catch (error) {
      labelEl.textContent = error.message;
    }
  }

  function renderBody() {
    renderProducts();
    var current = order();
    var titles = [
      "Choose the cabinets",
      "Machine files for this order",
      "Machined parts. Grooves and shelf-pin rows are the router work.",
      "Plain strips fill only the space already opened"
    ];
    labelEl.textContent = titles[step];
    backBtn.disabled = step === 0;
    nextBtn.disabled = step === 3 || (step === 0 && current.metrics.sheets === 0);
    nextBtn.textContent = step === 0 ? "Next" : (step === 3 ? "Done" : "Next");
    if (step === 0) viewEl.innerHTML = "<p class=\"file-note\">Pick the quantities, then continue. The sheet, the files, and the saw list all come from that order.</p>";
    if (step === 1) viewEl.innerHTML = filesView(current);
    if (step === 2) viewEl.innerHTML = nestView(current, false);
    if (step === 3) viewEl.innerHTML = nestView(current, true);
  }

  window.addEventListener("click", function (event) {
    var target = event.target.closest("button");
    if (!target || !document.body.contains(target)) return;
    if (target.hasAttribute("data-dec") || target.hasAttribute("data-inc")) {
      var id = target.getAttribute("data-dec") || target.getAttribute("data-inc");
      qty[id] = Math.max(0, Math.min(4, qty[id] + (target.hasAttribute("data-inc") ? 1 : -1)));
      step = 0;
      render();
    } else if (target.hasAttribute("data-next") && step < 3 && !target.disabled) {
      step += 1;
      render();
    } else if (target.hasAttribute("data-back") && step > 0) {
      step -= 1;
      render();
    }
  }, true);

  fetch("nests.json").then(function (response) { return response.json(); }).then(function (payload) {
    data = payload;
    render();
  });
})();
