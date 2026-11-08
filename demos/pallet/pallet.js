AcorShop.open(function (shop) {
  var root = document.querySelector("[data-app]");
  var day = shop.day;
  var tab = "upcoming";
  var query = "";
  var undo = null;

  function shown(pallet) {
    var matches = !query || (pallet.id + pallet.job).toLowerCase().indexOf(query) !== -1;
    return matches && (tab === "gone" ? pallet.placed : !pallet.placed);
  }

  function render() {
    document.querySelector("[data-list]").innerHTML = day.pallets.filter(shown).map(function (pallet) {
      return "<p><strong>" + pallet.id + "</strong> " + pallet.job + (pallet.placed ? " · " + pallet.area : "") + "</p>";
    }).join("") || "<p class=\"app-quiet\">Nothing in this list.</p>";
    document.querySelector("[data-map]").innerHTML = day.areas.map(function (area) {
      var here = day.pallets.filter(function (pallet) { return pallet.placed && pallet.area === area; });
      return "<button class=\"map-cell\" type=\"button\" data-act=\"place\" data-area=\"" + area + "\"><strong>" + area + "</strong><span>" + (here.map(function (pallet) { return pallet.id; }).join(", ") || "Empty") + "</span></button>";
    }).join("");
    shop.save();
  }

  document.querySelector("[data-find]").addEventListener("input", function (event) {
    query = event.target.value.trim().toLowerCase();
    render();
  });

  AcorShop.bind(root, function (act, button) {
    if (act === "reset") return shop.reset();
    if (act === "tab") tab = button.getAttribute("data-tab");
    if (act === "walk") {
      var line = day.pallets.filter(function (pallet) { return pallet.placed; }).map(function (pallet) {
        return pallet.area + ": " + pallet.id;
      }).join(" · ");
      document.querySelector("[data-walk]").textContent = line || "Nothing placed to walk.";
    }
    if (act === "undo" && undo) {
      day.pallets = undo;
      undo = null;
    }
    if (act === "place") {
      var waiting = day.pallets.filter(function (pallet) { return !pallet.placed; })[0];
      if (waiting) {
        undo = JSON.parse(JSON.stringify(day.pallets));
        waiting.placed = true;
        waiting.area = button.getAttribute("data-area");
        var job = shop.job(waiting.job);
        if (job) {
          job.status = "Placed";
          job.note = "On the " + waiting.area.toLowerCase() + ".";
        }
      }
    }
    render();
  });
  render();
});
