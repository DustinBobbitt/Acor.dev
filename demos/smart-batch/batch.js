(function () {
  var root = document.querySelector("[data-batch]");
  if (!root) return;

  var caption = root.querySelector("[data-batch-caption]");
  var replay = root.querySelector("[data-batch-replay]");
  var lines = [
    "Parts required for the cabinets.",
    "Parts that must be machined are locked on the sheet.",
    "Open area remains. Placed parts do not move.",
    "Three hand cuts use that area. No new sheet is opened.",
    "What did not fit is the saw list."
  ];
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var timers = [];

  function clearTimers() {
    timers.forEach(function (id) { window.clearTimeout(id); });
    timers = [];
  }

  function show(step) {
    root.setAttribute("data-step", String(step));
    if (caption) caption.textContent = lines[step] || lines[0];
  }

  function play() {
    clearTimers();
    if (reduced) {
      show(4);
      return;
    }
    [0, 900, 2200, 3600, 5000].forEach(function (delay, step) {
      timers.push(window.setTimeout(function () { show(step); }, delay));
    });
  }

  if (replay) replay.addEventListener("click", play);
  play();
})();
