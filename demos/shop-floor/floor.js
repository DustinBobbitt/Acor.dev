AcorShop.open(function (shop) {
  var root = document.querySelector("[data-app]");
  var day = shop.day;
  var view = "rotation";

  function missing() {
    return day.departments.filter(function (row) { return row.progress === "Missing"; }).length;
  }

  function render() {
    var received = day.departments.filter(function (row) { return row.progress === "Received"; }).length;
    document.querySelector("[data-summary]").textContent = "Round " + day.round + " · Progress received " + received + "/" + day.departments.length + " · Missing " + missing() + " · " + day.round_note;
    if (view === "rotation") {
      document.querySelector("[data-panel]").innerHTML = "<table class=\"app-table\"><tr><th>Department</th><th>Progress</th><th>Delivery</th></tr>" + day.departments.map(function (row) {
        return "<tr><td>" + row.name + "</td><td>" + row.progress + "</td><td>" + row.delivery + "</td></tr>";
      }).join("") + "</table>";
    } else {
      document.querySelector("[data-panel]").innerHTML = "<table class=\"app-table\"><tr><th>Job</th><th>Status</th></tr>" + day.jobs.map(function (job) {
        return "<tr><td>" + job.id + "</td><td>" + job.status + "</td></tr>";
      }).join("") + "</table>";
    }
    document.querySelector("[data-recovery]").innerHTML = day.recovery.map(function (row) {
      return "<p>" + row + "</p>";
    }).join("") || "<p class=\"app-quiet\">Nothing to key back yet.</p>";
    shop.save();
  }

  AcorShop.bind(root, function (act, button) {
    if (act === "reset") return shop.reset();
    if (act === "view") view = button.getAttribute("data-view");
    if (act === "conflict") {
      day.conflict = true;
      day.round_note = "A conflict is open. The round cannot advance.";
    }
    if (act === "move") {
      day.recovery.push("DEMO-1054 moved from Cutting to Breakdown. A person keys this into the company record.");
      day.round_note = "The local log changed. The company record did not.";
    }
    if (act === "push") day.round_note = "Progress pushed from this browser. The company record was not written.";
    if (act === "pull") day.round_note = "Workbook pulled into this browser.";
    if (act === "advance") {
      if (day.conflict) {
        day.round_note = "Round not advanced. Resolve the conflict first.";
      } else {
        day.round += 1;
        day.round_note = missing() ? "Advanced with " + missing() + " department still missing." : "Advanced. Every department had reported.";
      }
    }
    render();
  });
  render();
});
