AcorShop.open(function (shop) {
  var root = document.querySelector("[data-app]");
  function render() {
    document.querySelector("[data-log]").innerHTML = "<tr><th>Sheet</th><th>Machine</th><th>Controller observed</th><th>Operator confirmed</th></tr>" + shop.day.sheets.map(function (sheet) {
      var observed = sheet.machine === "Omni" ? sheet.observed + " cycle" + (sheet.observed === 1 ? "" : "s") : "Not probed";
      var differ = sheet.machine === "Omni" && sheet.observed > 0 && !sheet.confirmed;
      return "<tr><td>" + sheet.id + "</td><td>" + sheet.machine + "</td><td>" + observed + "</td><td>" + (sheet.confirmed ? "Yes" : "No") + (differ ? " · these disagree" : "") + "</td></tr>";
    }).join("");
  }
  AcorShop.bind(root, function (act) {
    if (act === "reset") shop.reset();
  });
  render();
});
