/**
 * Auth guard — include AFTER service-config.js on every protected page.
 *
 * - If there is no auth token in localStorage, redirects to /login.
 * - Exposes window.Brandio.logout() and window.Brandio.getUser().
 * - Public pages (login, signup, landing) are whitelisted and never redirect.
 *
 * Token sharing works because the whole app is served through the manager
 * gateway (single origin), so localStorage is shared across all services.
 */
(function () {
  'use strict';

  var TOKEN_KEY = 'brandio_auth_token';
  var USER_KEY = 'brandio_user';

  // Paths that never require auth.
  var PUBLIC_PATHS = ['/login', '/signup', '/landing', '/login.html', '/signup.html', '/landing.html'];

  function currentPathIsPublic() {
    var p = window.location.pathname.replace(/\/+$/, '') || '/';
    for (var i = 0; i < PUBLIC_PATHS.length; i++) {
      if (p === PUBLIC_PATHS[i] || p.endsWith(PUBLIC_PATHS[i])) return true;
    }
    return false;
  }

  function getToken() {
    try { return window.localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }

  function getUser() {
    try { return JSON.parse(window.localStorage.getItem(USER_KEY) || 'null'); } catch (e) { return null; }
  }

  function setSession(token, user) {
    try {
      window.localStorage.setItem(TOKEN_KEY, token);
      window.localStorage.setItem(USER_KEY, JSON.stringify(user || null));
    } catch (e) { /* ignore */ }
  }

  function clearSession() {
    try {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(USER_KEY);
    } catch (e) { /* ignore */ }
  }

  function logout() {
    clearSession();
    window.location.href = '/login';
  }

  window.Brandio = window.Brandio || {};
  window.Brandio.getToken = getToken;
  window.Brandio.getUser = getUser;
  window.Brandio.setSession = setSession;
  window.Brandio.clearSession = clearSession;
  window.Brandio.logout = logout;

  // Enforce auth on protected pages.
  if (!currentPathIsPublic() && !getToken()) {
    var redirect = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace('/login?redirect=' + redirect);
  }
})();
