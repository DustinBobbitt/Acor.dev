const header = document.querySelector("[data-header]");
const navToggle = document.querySelector("[data-nav-toggle]");
const nav = document.querySelector("[data-nav]");
const revealItems = document.querySelectorAll(".reveal");
const delayedLoopVideos = document.querySelectorAll("[data-delayed-loop]");

if (header) {
  const syncHeader = () => {
    header.classList.toggle("is-scrolled", window.scrollY > 12);
  };

  syncHeader();
  window.addEventListener("scroll", syncHeader, { passive: true });
}

if (navToggle && nav) {
  navToggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
    });
  });
}

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.18,
      rootMargin: "0px 0px -30px 0px"
    }
  );

  revealItems.forEach((item) => observer.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

delayedLoopVideos.forEach((video) => {
  const delay = Number.parseInt(video.dataset.delayedLoop || "2500", 10);
  let restartTimer;
  const restartVideo = () => {
    video.pause();
    video.currentTime = 0;

    const resumePlayback = () => {
      video.play().catch(() => {});
    };

    if (video.readyState >= 2) {
      resumePlayback();
      return;
    }

    video.load();
    video.addEventListener("loadeddata", resumePlayback, { once: true });
  };

  video.addEventListener("ended", () => {
    window.clearTimeout(restartTimer);
    restartTimer = window.setTimeout(() => {
      restartVideo();
    }, Number.isNaN(delay) ? 2500 : delay);
  });
});
