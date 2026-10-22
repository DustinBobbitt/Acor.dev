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
  const setNavState = (isOpen) => {
    nav.classList.toggle("is-open", isOpen);
    navToggle.setAttribute("aria-expanded", String(isOpen));
    navToggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
  };

  navToggle.addEventListener("click", () => {
    setNavState(!nav.classList.contains("is-open"));
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      setNavState(false);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && nav.classList.contains("is-open")) {
      setNavState(false);
      navToggle.focus();
    }
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

// Short product clips autoplay muted. Visitors who ask for reduced motion get the
// poster frame and player controls instead.
const motionVideos = document.querySelectorAll("[data-motion-video]");
if (motionVideos.length && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  motionVideos.forEach((video) => {
    video.pause();
    video.removeAttribute("autoplay");
    video.controls = true;
  });
}
