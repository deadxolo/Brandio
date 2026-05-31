/**
 * Service URL Configuration
 * Automatically detects environment and provides correct URLs
 */
(function() {
  'use strict';

  // Detect if running in unified mode (Cloud Run)
  const pathPrefix = window.location.pathname.split('/')[1];
  const isUnifiedMode = ['manager', 'background', 'generator', 'poster'].includes(pathPrefix);

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
      manager: `http://${host}:3000`,
      background: `http://${host}:3001`,
      generator: `http://${host}:3002`,
      poster: `http://${host}:3003`
    };
  }

  // Port to service mapping
  const portMap = {
    '3000': 'manager',
    '3001': 'background',
    '3002': 'generator',
    '3003': 'poster'
  };

  // URL transformation function - rewrites localhost URLs to correct service URLs
  function transformUrl(url) {
    if (!url || typeof url !== 'string') return url;

    // Check if URL contains localhost:300X pattern
    const localhostMatch = url.match(/http:\/\/localhost:(300[0-3])(\/.*)?/);
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

  // Wrap fetch to automatically transform URLs
  const originalFetch = window.fetch;
  window.fetch = function(url, options) {
    const transformedUrl = transformUrl(url);
    return originalFetch.call(this, transformedUrl, options);
  };

  // Wrap window.open to transform URLs
  const originalOpen = window.open;
  window.open = function(url, target, features) {
    const transformedUrl = transformUrl(url);
    return originalOpen.call(this, transformedUrl, target, features);
  };

  // Wrap XMLHttpRequest.open to transform URLs
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    const transformedUrl = transformUrl(url);
    return originalXhrOpen.call(this, method, transformedUrl, ...args);
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
