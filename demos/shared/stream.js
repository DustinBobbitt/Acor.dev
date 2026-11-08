(function () {
  function sheet(parts) {
    return "<svg viewBox=\"0 0 48 96\" aria-hidden=\"true\">" + parts + "</svg>";
  }

  function block(kind, x, y, w, h) {
    var groove = kind === "machine" ? "<line class=\"groove\" x1=\"" + x + "\" y1=\"" + (y + 1.2) + "\" x2=\"" + (x + w) + "\" y2=\"" + (y + 1.2) + "\"></line>" : "";
    return "<rect class=\"" + kind + "\" x=\"" + x + "\" y=\"" + y + "\" width=\"" + w + "\" height=\"" + h + "\"></rect>" + groove;
  }

  function sheets(day) {
    var picture = "<div class=\"sheets\">" + sheet(
      block("machine", 1, 1, 22, 62) + block("machine", 25, 1, 22, 40) + block("machine", 25, 43, 22, 18) +
      block("hand", 1, 66, 46, 5) + block("hand", 1, 73, 46, 5)
    ) + sheet(
      block("machine", 1, 1, 22, 78) + block("machine", 25, 1, 22, 55) + block("hand", 1, 82, 46, 5)
    ) + "</div>";
    var saw = "<div class=\"saw\"><h3>Still for the saw</h3>" + day.handcuts.map(function (row) {
      return "<div><span>" + row.part + "</span><span>" + row.qty + "</span></div>";
    }).join("") + "</div>";
    return "<div class=\"two\">" + picture + saw + "</div>";
  }

  function programs(day) {
    return day.sheets.filter(function (sheet) { return sheet.job === "DEMO-1042"; }).map(function (sheet) {
      return "<div class=\"file-row\"><span>" + sheet.tap + "</span><span>TAP · inches</span></div><div class=\"file-row\"><span>" + sheet.xpr + "</span><span>XPR/NC · millimetres</span></div>";
    }).join("");
  }

  function jobs(day) {
    return day.jobs.map(function (job) {
      return "<div class=\"job-row\"><span>" + job.id + "</span><span>" + job.cabinets + " · " + job.status + "</span></div>";
    }).join("");
  }

  function mount(root, shop) {
    var day = shop.day;
    var step = 0;
    var timer = 0;
    var motion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var titles = [
      "In the department",
      "Machined parts lock. Hand cuts use the gaps.",
      "One nest. TAP and XPR/NC.",
      "Assign it, or the station never sees it.",
      "One sheet ran. The job stays open.",
      "Cut, and still waiting for a place.",
      "Sheets and hours. Not a schedule.",
      "Two tools. The network is down."
    ];

    function render() {
      window.clearTimeout(timer);
      var batch = day.batch;
      var body = "";
      if (step === 0) body = jobs(day);
      if (step === 1) body = sheets(day);
      if (step === 2) body = programs(day);
      if (step === 3) body = "<div class=\"two\"><div class=\"panel\"><h3>Smart Batch</h3><p>" + batch.cabinets + " cabinets · " + batch.sheets + " sheets</p><button type=\"button\" data-act=\"assign\">" + (shop.job("DEMO-1042").station_visible ? "Assigned" : "Assign to station") + "</button></div><div class=\"panel\"><h3>Live batches</h3>" + lanes() + "</div></div>";
      if (step === 4) body = stationRows();
      if (step === 5) body = "<div class=\"two\">" + day.pallets.map(function (pallet) {
        return "<button class=\"panel\" type=\"button\" data-act=\"place\" data-id=\"" + pallet.id + "\"><h3>" + pallet.id + "</h3><p>" + pallet.job + "</p><p>" + (pallet.placed ? pallet.area : "Place on the build line") + "</p></button>";
      }).join("") + "</div>";
      if (step === 6) {
        var disagree = day.sheets.filter(function (sheet) { return sheet.machine === "Omni" && sheet.observed > 0 && !sheet.confirmed; })[0];
        body = "<p class=\"big\">" + day.forecast.sheets + " sheets · " + day.forecast.hours + " hours</p><p>" + day.forecast.source + ". The pace does not change the cost standard.</p>" + (disagree ? "<div class=\"job-row\"><span>" + disagree.id + " observed " + disagree.observed + "</span><span>Operator has not confirmed</span></div>" : "");
      }
      if (step === 7) body = "<div class=\"two\"><div class=\"panel\"><h3>Department status</h3>" + day.departments.map(function (row) {
        return "<div class=\"job-row\"><span>" + row.name + "</span><span>" + row.progress + "</span></div>";
      }).join("") + "<button type=\"button\" data-act=\"round\">Advance round</button><p>" + day.round_note + "</p></div><div class=\"panel\"><h3>Cut on the desktop</h3><button type=\"button\" data-act=\"share\">" + (day.share_up ? "Turn the share off" : "Share is down") + "</button>" + (day.desktop.length ? day.desktop.map(function (name) { return "<div class=\"file-row\"><span>" + name + "</span></div>"; }).join("") : "<p>No local files yet.</p>") + "</div></div>";
      root.className = "stream" + (step === 1 && motion ? " settled" : "");
      root.innerHTML = "<div class=\"stream-bar\"><strong>DEMO-1042</strong><span>" + batch.cabinets + " cabinets · " + batch.sheets + " sheets · " + batch.absorbed + " on the sheets · " + batch.remaining + " for the saw</span></div><div class=\"stream-stage\"><h2>" + titles[step] + "</h2>" + body + "</div><div class=\"stream-nav\"><button type=\"button\" data-act=\"back\"" + (step === 0 ? " disabled" : "") + ">Back</button><button type=\"button\" data-act=\"next\"" + (step === titles.length - 1 ? " disabled" : "") + ">Next</button></div>";
      if (step === 1 && !motion) timer = window.setTimeout(function () { root.classList.add("settled"); }, 350);
      shop.save();
    }

    function lanes() {
      var python = day.sheets.filter(function (sheet) { return sheet.machine === "Python" && (shop.job(sheet.job).station_visible || day.desktop.length && sheet.job === "DEMO-1042"); });
      var omni = day.sheets.filter(function (sheet) { return sheet.machine === "Omni" && shop.job(sheet.job).station_visible; });
      return "<p>Python · " + (python.map(function (sheet) { return sheet.id; }).join(", ") || "Nothing released") + "</p><p>Omni · " + (omni.map(function (sheet) { return sheet.id; }).join(", ") || "Nothing released") + "</p>";
    }

    function stationRows() {
      var rows = day.sheets.filter(function (sheet) {
        return shop.job(sheet.job).station_visible || (day.desktop.length && sheet.job === "DEMO-1042");
      });
      if (!rows.length) return "<p>Nothing is on a station until the batch is assigned.</p>";
      return rows.map(function (sheet) {
        return "<div class=\"job-row\"><span>" + sheet.id + " · " + sheet.machine + "</span><span>" + (sheet.ran ? "Ran" : "<button type=\"button\" data-act=\"ran\" data-id=\"" + sheet.id + "\">Mark ran</button>") + "</span></div>";
      }).join("");
    }

    AcorShop.bind(root, function (act, button) {
      if (act === "back" && step > 0) step -= 1;
      if (act === "next" && step < titles.length - 1) step += 1;
      if (act === "assign") {
        var job = shop.job("DEMO-1042");
        job.released = true;
        job.station_visible = true;
        job.status = day.share_up ? "Released to the station" : "Produced on the desktop";
      }
      if (act === "ran") {
        var chosen = day.sheets.filter(function (sheet) { return sheet.id === button.getAttribute("data-id"); })[0];
        if (chosen) {
          chosen.ran = true;
          chosen.confirmed = true;
          var owner = shop.job(chosen.job);
          owner.status = day.sheets.some(function (sheet) { return sheet.job === owner.id && !sheet.ran; }) ? "On the station" : "Sheets ran";
          owner.note = "One sheet can be finished while the job is still open.";
        }
      }
      if (act === "place") {
        var pallet = day.pallets.filter(function (item) { return item.id === button.getAttribute("data-id") && !item.placed; })[0];
        if (pallet) {
          pallet.placed = true;
          pallet.area = "Build line";
          var waiting = shop.job(pallet.job);
          if (waiting) waiting.status = "Placed on the build line";
        }
      }
      if (act === "share") {
        day.share_up = false;
        day.desktop = ["DEMO-1042-S01.tap", "DEMO-1042-S01.xpr", "DEMO-1042-S02.tap", "DEMO-1042-S02.xpr"];
        shop.job("DEMO-1042").station_visible = true;
        shop.job("DEMO-1042").status = "Produced on the desktop";
      }
      if (act === "round") {
        if (day.conflict) day.round_note = "Round not advanced. Resolve the conflict first.";
        else {
          day.round += 1;
          var missing = day.departments.filter(function (row) { return row.progress === "Missing"; }).length;
          day.round_note = missing ? "Advanced with " + missing + " department still missing." : "Advanced.";
        }
      }
      render();
    });
    render();
  }

  window.AcorStream = { mount: mount };
})();
