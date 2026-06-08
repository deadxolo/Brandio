/**
 * Service URL Configuration
 * Automatically detects environment and provides correct URLs
 */
(function() {
  'use strict';

  // Detect if running in unified mode (single origin behind one port).
  // Unified mode covers Cloud Run AND the Docker container on :8080, which
  // proxies /generator, /poster, /backgrounds and serves /uploads itself.
  // The ONLY non-unified case is local `npm run dev`, where each micro-service
  // runs on its own 300x port and pages are loaded directly from that port.
  // Detecting by port (not by path prefix) means the manager's own top-level
  // pages (/dashboard, /landing) are correctly treated as unified too.
  const DEV_PORTS = ['3001', '3002', '3003', '3004'];
  const isUnifiedMode = !DEV_PORTS.includes(window.location.port);

  // Base URL detection
  const origin = window.location.origin;
  const host = window.location.hostname;

  // Service URLs configuration
  let services;

  if (isUnifiedMode) {
    // Cloud Run / Unified mode - all services on same origin with path prefixes
    services = {
      manager: `${origin}/manager`,
      background: `${origin}/background`,
      generator: `${origin}/generator`,
      poster: `${origin}/poster`
    };
  } else {
    // Local development mode - services on different ports
    services = {
      manager: `http://${host}:3004`,
      background: `http://${host}:3001`,
      generator: `http://${host}:3002`,
      poster: `http://${host}:3003`
    };
  }

  // Port to service mapping
  const portMap = {
    '3004': 'manager',
    '3001': 'background',
    '3002': 'generator',
    '3003': 'poster'
  };

  // URL transformation function - rewrites localhost URLs to correct service URLs
  function transformUrl(url) {
    if (!url || typeof url !== 'string') return url;

    // Check if URL contains localhost:300X pattern
    const localhostMatch = url.match(/http:\/\/localhost:(300[1-4])(\/.*)?/);
    if (localhostMatch) {
      const port = localhostMatch[1];
      const path = localhostMatch[2] || '';
      const serviceName = portMap[port];
      if (serviceName && services[serviceName]) {
        return services[serviceName] + path;
      }
    }

    return url;
  }

  // Auth token helpers (shared across the app via localStorage on a single origin)
  const TOKEN_KEY = 'brandio_auth_token';
  function getAuthToken() {
    try { return window.localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }
  window.getAuthToken = getAuthToken;

  // Only attach the Authorization header to same-app requests (our services),
  // never to third-party hosts (Google Fonts, CDNs, etc.).
  function isInternalUrl(url) {
    if (!url || typeof url !== 'string') return false;
    if (url.startsWith('/')) return true;
    if (url.startsWith(origin)) return true;
    return /^https?:\/\/localhost:300[0-4]/.test(url) || /^https?:\/\/127\.0\.0\.1:300[0-4]/.test(url);
  }

  // Wrap fetch to transform URLs and attach the auth token.
  const originalFetch = window.fetch;
  window.fetch = function(url, options) {
    const transformedUrl = transformUrl(url);
    const token = getAuthToken();
    if (token && isInternalUrl(typeof url === 'string' ? url : transformedUrl)) {
      options = options || {};
      const headers = new Headers(options.headers || {});
      if (!headers.has('Authorization')) {
        headers.set('Authorization', 'Bearer ' + token);
      }
      options = { ...options, headers };
    }
    return originalFetch.call(this, transformedUrl, options);
  };

  // Wrap window.open to transform URLs
  const originalOpen = window.open;
  window.open = function(url, target, features) {
    const transformedUrl = transformUrl(url);
    return originalOpen.call(this, transformedUrl, target, features);
  };

  // Wrap XMLHttpRequest.open to transform URLs and remember whether to auth.
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    const transformedUrl = transformUrl(url);
    this.__brandioInternal = isInternalUrl(typeof url === 'string' ? url : transformedUrl);
    return originalXhrOpen.call(this, method, transformedUrl, ...args);
  };

  // Inject the Authorization header on send (after open, before request goes out).
  const originalXhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function(...args) {
    const token = getAuthToken();
    if (token && this.__brandioInternal) {
      try { this.setRequestHeader('Authorization', 'Bearer ' + token); } catch (e) { /* ignore */ }
    }
    return originalXhrSend.apply(this, args);
  };

  // Export globally
  window.SERVICE_URLS = services;
  window.IS_UNIFIED_MODE = isUnifiedMode;
  window.transformServiceUrl = transformUrl;

  // Helper function to get service URL
  window.getServiceUrl = function(service, path = '') {
    const baseUrl = services[service];
    if (!baseUrl) {
      console.warn(`Unknown service: ${service}`);
      return path;
    }
    return `${baseUrl}${path}`;
  };

  // Helper to get API endpoint
  window.getApiUrl = function(service, endpoint = '') {
    return window.getServiceUrl(service, `/api${endpoint}`);
  };

  // Transform image src URLs when images load or error
  document.addEventListener('error', function(e) {
    if (e.target.tagName === 'IMG' && e.target.src.includes('localhost:300')) {
      const newSrc = transformUrl(e.target.src);
      if (newSrc !== e.target.src) {
        e.target.src = newSrc;
      }
    }
  }, true);

  // Log configuration on load
  if (window.console && console.log) {
    console.log(`[ServiceConfig] Mode: ${isUnifiedMode ? 'Unified (Cloud Run)' : 'Development'}`);
    console.log('[ServiceConfig] Services:', services);
  }
})();
