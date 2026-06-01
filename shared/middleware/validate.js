// Minimal, dependency-free request-body validation.
//
//   validateBody({ name: { required: true, type: 'string', maxLength: 200 },
//                  platform: { enum: ['instagram','facebook'] } })
//
// Returns 400 with a list of problems when validation fails; otherwise next().
function validateBody(schema) {
  const fields = Object.entries(schema);
  return (req, res, next) => {
    const body = req.body || {};
    const errors = [];

    for (const [field, rule] of fields) {
      const value = body[field];
      const missing = value === undefined || value === null || value === '';

      if (rule.required && missing) {
        errors.push(`${field} is required`);
        continue;
      }
      if (missing) continue; // optional + absent

      if (rule.type && typeof value !== rule.type) {
        errors.push(`${field} must be of type ${rule.type}`);
        continue;
      }
      if (rule.maxLength && typeof value === 'string' && value.length > rule.maxLength) {
        errors.push(`${field} must be at most ${rule.maxLength} characters`);
      }
      if (rule.minLength && typeof value === 'string' && value.length < rule.minLength) {
        errors.push(`${field} must be at least ${rule.minLength} characters`);
      }
      if (rule.enum && !rule.enum.includes(value)) {
        errors.push(`${field} must be one of: ${rule.enum.join(', ')}`);
      }
    }

    if (errors.length) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: errors });
    }
    next();
  };
}

module.exports = { validateBody };
