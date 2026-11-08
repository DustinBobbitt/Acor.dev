(function () {
  var key = "acor-shop-day";
  var morningUrl = new URL("shop-day.json", document.currentScript.src);

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function open(callback) {
    fetch(morningUrl).then(function (response) {
      return response.json();
    }).then(function (morning) {
      var saved = null;
      try {
        saved = JSON.parse(localStorage.getItem(key) || "null");
      } catch (error) {
        saved = null;
      }
      var day = saved && saved.schema === morning.schema ? saved : clone(morning);
      var shop = {
        day: day,
        save: function () {
          localStorage.setItem(key, JSON.stringify(day));
        },
        reset: function () {
          localStorage.removeItem(key);
          location.reload();
        },
        job: function (id) {
          return day.jobs.filter(function (job) { return job.id === id; })[0];
        }
      };
      callback(shop);
    });
  }

  function bind(root, handler) {
    window.addEventListener("click", function (event) {
      var button = event.target.closest("[data-act]");
      if (!button || !root.contains(button)) return;
      handler(button.getAttribute("data-act"), button);
    }, true);
  }

  window.AcorShop = { open: open, bind: bind };
})();
