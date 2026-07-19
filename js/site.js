// Lazy-load an embedded game iframe only when its container scrolls into
// view or the user clicks a "load game" button — avoids pulling 3 WASM
// builds on initial page load.
function initLazyEmbed(containerId, src, opts) {
  opts = opts || {};
  var el = document.getElementById(containerId);
  if (!el) return;

  function load() {
    if (el.dataset.loaded) return;
    el.dataset.loaded = "1";
    var iframe = document.createElement("iframe");
    iframe.src = src;
    iframe.allow = "autoplay; fullscreen; gamepad";
    iframe.loading = "lazy";
    el.innerHTML = "";
    el.appendChild(iframe);
  }

  // Narrow/touch viewports: don't even offer the iframe, just the fallback
  // (open-in-new-tab) link that's already in the DOM for embed-wrap.
  var isNarrow = window.matchMedia("(max-width: 700px)").matches;
  if (isNarrow && !opts.forceEmbedOnMobile) return;

  var btn = el.querySelector("[data-load-btn]");
  if (btn) {
    btn.addEventListener("click", load);
    return;
  }

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          load();
          io.disconnect();
        }
      });
    });
    io.observe(el);
  } else {
    load();
  }
}
