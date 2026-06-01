// Shared CORS options builder.
// If CORS_ORIGINS is set (comma-separated list of allowed origins), CORS is
// restricted to those origins. If it is empty/unset, behaviour stays permissive
// (open) so local development keeps working unchanged.
//
// Returns a plain options object suitable for passing to the `cors` middleware,
// e.g. `app.use(cors(corsOptions()))`. An empty object makes `cors()` permissive.
function corsOptions() {
  const origins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    // No allowlist configured -> permissive default (development).
    return {};
  }

  return {
    origin(origin, callback) {
      // Allow same-origin / server-to-server requests (no Origin header) and
      // any explicitly allow-listed origin.
      if (!origin || origins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
  };
}

module.exports = { corsOptions };
