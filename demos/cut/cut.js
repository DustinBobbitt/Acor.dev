AcorShop.open(function (shop) {
  var root = document.querySelector("[data-app]");
  var day = shop.day;
  day.walkups = day.walkups || [];

  function visible(sheet) {
    var job = shop.job(sheet.job);
    return job.station_visible || (day.desktop.length && sheet.job === "DEMO-1042");
  }

  function render() {
    var batch = day.batch;
    document.querySelector("[data-summary]").textContent = batch.cabinets + " cabinets · " + batch.sheets + " sheets · " + batch.absorbed + " hand cuts on the sheets · " + batch.remaining + " still for the saw.";
    document.querySelector("[data-share]").textContent = day.share_up ? "Share connected" : "Share down";
    document.querySelector("[data-jobs]").innerHTML = day.jobs.map(function (job) {
      return "<tr><td>" + job.id + "</td><td>" + job.cabinets + "</td><td>" + job.status + "</td></tr>";
    }).join("") + day.walkups.map(function (item) {
      return "<tr><td>Walk-up</td><td>1</td><td>" + item + "</td></tr>";
    }).join("");
    document.querySelector("[data-saw]").innerHTML = day.handcuts.map(function (row) {
      return "<tr><td>" + row.item + "</td><td>" + row.part + "</td><td>" + row.qty + "</td></tr>";
    }).join("");
    var folder = document.querySelector("[data-folder]");
    folder.hidden = !day.desktop.length;
    folder.innerHTML = "<strong>Desktop · CNC Programs · " + day.date_label + "</strong>" + day.desktop.map(function (name) {
      return "<div>" + name + "</div>";
    }).join("");
    document.querySelector("[data-lanes]").innerHTML = ["Python", "Omni"].map(function (machine) {
      var sheets = day.sheets.filter(function (sheet) { return sheet.machine === machine && visible(sheet); });
      var walks = machine === "Python" ? day.walkups : [];
      var lines = sheets.map(function (sheet) { return "<div>" + sheet.id + "</div>"; }).concat(walks.map(function (item) { return "<div>" + item + "</div>"; }));
      return "<div class=\"folder\"><strong>" + machine + "</strong>" + (lines.join("") || "<div class=\"app-quiet\">Nothing released</div>") + "</div>";
    }).join("");
    shop.save();
  }

  AcorShop.bind(root, function (act) {
    if (act === "reset") return shop.reset();
    if (act === "share") day.share_up = !day.share_up;
    if (act === "walkup") day.walkups.push("Base 24 · Python");
    if (act === "assign") {
      var job = shop.job("DEMO-1042");
      job.released = true;
      job.station_visible = true;
      job.status = day.share_up ? "Released to the station" : "Produced on the desktop";
      job.note = "The station can see the sheets.";
      if (!day.share_up) {
        day.desktop = ["DEMO-1042-S01.tap", "DEMO-1042-S01.xpr", "DEMO-1042-S02.tap", "DEMO-1042-S02.xpr"];
      }
    }
    render();
  });
  render();
});
