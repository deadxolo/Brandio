/* ============================================================
   BRANDIO SHELL JS — shared theme sync for sub-services
   ============================================================
   - Reads brandio:theme from localStorage (set by the dashboard)
   - Applies data-theme="dark"/"light" on <html> early
   - Listens for storage events so flipping the toggle in the
     dashboard tab updates open service tabs live
   - Falls back to prefers-color-scheme when user hasn't chosen
   ============================================================ */
(function () {
  var KEY = 'brandio:theme';

  function apply(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }

  function readPreferred() {
    try {
      var stored = localStorage.getItem(KEY);
      if (stored === 'dark' || stored === 'light') return stored;
    } catch (e) {}
    try {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    } catch (e) {}
    return 'light';
  }

  // Apply early (before paint when this script is in <head>)
  apply(readPreferred());

  // Live sync across tabs
  try {
    window.addEventListener('storage', function (e) {
      if (e.key === KEY) apply(e.newValue || readPreferred());
    });
  } catch (e) {}

  // Follow system pref if user hasn't chosen
  try {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq && mq.addEventListener) {
      mq.addEventListener('change', function (e) {
        if (!localStorage.getItem(KEY)) apply(e.matches ? 'dark' : 'light');
      });
    }
  } catch (e) {}

  // Expose
  window.__brandioShellTheme = {
    get: function () { return document.documentElement.getAttribute('data-theme') || 'light'; },
    set: function (t) {
      try { localStorage.setItem(KEY, t); } catch (e) {}
      apply(t);
    },
    toggle: function () {
      var t = (document.documentElement.getAttribute('data-theme') === 'dark') ? 'light' : 'dark';
      this.set(t);
      return t;
    }
  };
})();
