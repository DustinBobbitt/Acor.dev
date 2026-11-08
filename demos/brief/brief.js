AcorShop.open(function (shop) {
  var root = document.querySelector("[data-app]");
  var day = shop.day;
  document.querySelector("[data-date]").textContent = day.date_label;
  document.querySelector("[data-jobs]").innerHTML = day.jobs.map(function (job) {
    return "<tr><td>" + job.id + "</td><td>" + job.cabinets + " cabinets</td><td>" + job.status + "</td></tr>";
  }).join("");
  var waiting = day.pallets.filter(function (pallet) { return !pallet.placed; });
  document.querySelector("[data-pull]").innerHTML = waiting.map(function (pallet) {
    return "<p>" + pallet.job + " · pallet " + pallet.id + " is not placed.</p>";
  }).join("") || "<p>Every finished pallet has a place.</p>";
  var batch = day.batch;
  document.querySelector("[data-batch]").textContent = batch.job_id + " · " + batch.sheets + " sheets, " + batch.absorbed + " hand cuts on the sheets, " + batch.remaining + " still for the saw.";
  AcorShop.bind(root, function (act) {
    if (act === "reset") shop.reset();
  });
});
