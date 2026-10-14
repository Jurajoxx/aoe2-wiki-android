/* Sets the theme before first paint to avoid a light flash in dark mode. */
(function () {
  var root = document.documentElement;
  try {
    var theme = JSON.parse(localStorage.getItem('theme') || '"system"');
    var scale = JSON.parse(localStorage.getItem('scale') || '1');
    var sys = window.Android ? window.Android.isSystemDark() : window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = theme === 'dark' || (theme === 'system' && sys);
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.style.setProperty('--scale', String(scale));
  } catch (e) {
    root.setAttribute('data-theme', 'light');
  }
})();
