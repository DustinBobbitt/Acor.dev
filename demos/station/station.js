AcorShop.open(function (shop) {
  var root = document.querySelector("[data-app]");
  var day = shop.day;
  var selected = "DEMO-1054-S03";

  function visible(sheet) {
    var job = shop.job(sheet.job);
    return job.station_visible || day.desktop.length && sheet.job === "DEMO-1042";
  }

  function render() {
    var rows = day.sheets.filter(visible);
    document.querySelector("[data-banner]").textContent = day.desktop.length ? "Desktop day folder" : "";
    var walks = (day.walkups || []).map(function (item) {
      return "<tr><td></td><td colspan=\"6\">Walk-up · " + item + "</td></tr>";
    }).join("");
    document.querySelector("[data-sheets]").innerHTML = "<tr><th></th><th>Sheet</th><th>Machine</th><th>TAP · XPR/NC</th><th>Ran</th><th>Observed</th><th>Confirmed</th></tr>" + walks + rows.map(function (sheet) {
      var mark = sheet.id === selected ? "is-selected" : "";
      return "<tr class=\"" + mark + "\" data-sheet=\"" + sheet.id + "\"><td><button class=\"app-btn\" type=\"button\" data-act=\"pick\" data-id=\"" + sheet.id + "\">Select</button></td><td>" + sheet.id + "</td><td>" + sheet.machine + "</td><td>" + sheet.tap + "<br>" + sheet.xpr + "</td><td>" + (sheet.ran ? "Yes" : "No") + "</td><td>" + sheet.observed + "</td><td>" + (sheet.confirmed ? "Yes" : "No") + "</td></tr>";
    }).join("");
    shop.save();
  }

  AcorShop.bind(root, function (act, button) {
    if (act === "reset") return shop.reset();
    if (act === "pick") selected = button.getAttribute("data-id");
    var sheet = day.sheets.filter(function (item) { return item.id === selected; })[0];
    if (act === "ran" && sheet && visible(sheet)) {
      sheet.ran = true;
      sheet.confirmed = true;
      var job = shop.job(sheet.job);
      var open = day.sheets.some(function (item) { return item.job === job.id && !item.ran; });
      job.status = open ? "On the station" : "Sheets ran";
      job.note = open ? "One sheet is confirmed. The job is not finished." : "Every sheet on this job was marked ran.";
    }
    if (act === "move" && sheet && visible(sheet)) {
      sheet.machine = sheet.machine === "Python" ? "Omni" : "Python";
    }
    render();
  });
  render();
});
