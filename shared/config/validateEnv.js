// Startup environment validation.
// Warns (development) or refuses to start (production) when recommended secrets
// are missing, so a misconfigured deployment fails fast instead of silently
// falling back to insecure development behaviour.
function validateEnv(options = {}) {
  const isProd = process.env.NODE_ENV === 'production';

  // Secrets that every service relies on for auth / token encryption.
  const recommended = options.required || [
    'JWT_SECRET',
    'API_KEYS',
    'INTERNAL_SERVICE_TOKEN'
  ];

  const missing = recommended.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    const msg = `[env] Missing recommended secrets: ${missing.join(', ')}`;
    if (isProd) {
      console.error(`${msg} — refusing to start in production.`);
      process.exit(1);
    }
    console.warn(`${msg} (acceptable for development).`);
  }

  return { missing };
}

module.exports = { validateEnv };
