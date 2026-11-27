// Light / Dark / Auto switch, shared by every page. Loaded in <head> so the
// right colors show before the page draws. "Auto" follows the device setting.
(function () {
  var KEY = "cac.theme";
  var ORDER = ["auto", "light", "dark"];
  var LABEL = { auto: "Auto", light: "Light", dark: "Dark" };
  var ICON = {
    auto: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/></svg>',
    light: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    dark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  };

  function get() {
    try {
      var t = localStorage.getItem(KEY);
      return ORDER.indexOf(t) >= 0 ? t : "auto";
    } catch (e) {
      return "auto";
    }
  }
  function apply(t) {
    if (t === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
  }
  function paint() {
    var t = get();
    var buttons = document.querySelectorAll("[data-theme-btn]");
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      b.innerHTML = ICON[t] + "<span>" + LABEL[t] + " mode</span>";
      b.title = "Colors: " + LABEL[t] + (t === "auto" ? " (follows your device)" : "") + ". Click to change.";
      b.setAttribute("aria-label", "Color mode: " + LABEL[t] + ". Click to change.");
    }
  }
  function set(t) {
    try {
      localStorage.setItem(KEY, t);
    } catch (e) {
      /* storage unavailable: still switch for this visit */
    }
    apply(t);
    paint();
  }

  apply(get());
  document.addEventListener("DOMContentLoaded", function () {
    var buttons = document.querySelectorAll("[data-theme-btn]");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener("click", function () {
        set(ORDER[(ORDER.indexOf(get()) + 1) % ORDER.length]);
      });
    }
    paint();
  });
  // Another tab changed it: follow along.
  window.addEventListener("storage", function (e) {
    if (e.key === KEY) {
      apply(get());
      paint();
    }
  });
})();
